import AppKit
import Foundation
import SwiftUI

@MainActor
final class ChatModel: NSObject, ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published var draft = ""
    @Published var sending = false
    // 正在生成的那条，逐帧刷新，落库后并进 messages
    @Published var streaming: ChatMessage?
    @Published var loaded = false
    @Published var lastError: String?

    @Published var online = false
    @Published var charName = ""
    @Published var voiceEnabled = false

    // 正在出声的那条，用来把播放键换成停止键
    @Published var speakingId: String?
    // 语音还在合成的那些条，语音条先占位；连发时可能同时有多条
    @Published var pendingVoiceIds: Set<String> = []
    // 播放进度 0…1，驱动语音条的填充
    @Published var progress: Double = 0

    private var origin = ""
    // 轮次号：上一轮等语音的 Task 收尾时，不能碰新一轮的状态
    private var requestGen = 0
    // 进程内音频栈在这个后台启动的 app 里会被卡住，交给 afplay 子进程放
    private var player: Process?
    private var playFile: URL?
    private var progressTask: Task<Void, Never>?

    var canSend: Bool { !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !sending && online }

    // 语音文件所在目录，直接从磁盘播，省掉整条 HTTP 往返
    var voiceDir: URL?

    func bind(origin: String) {
        guard origin != self.origin else { return }
        self.origin = origin
        loaded = false
        Task { await probe(); await reload() }
    }

    func probe() async {
        guard !origin.isEmpty else { return }
        if let h = await LocalChatClient.health(origin) {
            online = h.ok
            charName = h.char
            voiceEnabled = h.voiceEnabled
        } else {
            online = false
        }
    }

    func reload() async {
        guard online else { return }
        do {
            messages = try await LocalChatClient.history(origin)
            loaded = true
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
    }

    func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !sending else { return }
        draft = ""
        sending = true
        streaming = nil
        lastError = nil
        requestGen += 1
        let gen = requestGen

        // 自己那条先上屏，等回复的这几十秒里界面才不是空的
        let mine = ChatMessage(id: "local-\(Date().timeIntervalSince1970)", role: "user",
                               name: "我", ts: Date().timeIntervalSince1970 * 1000,
                               text: text, segments: nil)
        messages.append(mine)

        Task {
            var pendingId: String?
            defer { if gen == requestGen { sending = false; streaming = nil } }
            do {
                try await LocalChatClient.chat(origin, text: text, onDelta: { [weak self] full, segs in
                    guard let self else { return }
                    self.streaming = ChatMessage(id: "streaming", role: "assistant", name: self.charName,
                                                 ts: Date().timeIntervalSince1970 * 1000,
                                                 text: full, segments: segs, hasVoice: false)
                }, onReply: { [weak self] reply, voicePending in
                    guard let self else { return }
                    self.streaming = nil
                    self.sending = false
                    self.messages.append(reply)
                    if voicePending {
                        self.pendingVoiceIds.insert(reply.id)
                        pendingId = reply.id
                    }
                }, onVoice: { [weak self] id, err in
                    guard let self else { return }
                    self.pendingVoiceIds.remove(id)
                    if let err { self.lastError = err; return }
                    self.markVoice(id)
                })
                settleVoice(pendingId)
                // 服务端会先补开场白，本地这份要跟着对齐
                if messages.count == 2, gen == requestGen, !sending { await reload() }
            } catch {
                lastError = error.localizedDescription
                // 文字已经落地、只是等语音时断了，不能把这一轮当失败收回
                if pendingId != nil { settleVoice(pendingId); return }
                // 这一轮没成，把刚上屏的那条收回去，草稿还给用户
                messages.removeAll { $0.id == mine.id }
                if gen == requestGen { draft = text }
            }
        }
    }

    // 语音到了，把那条标成有语音，气泡下面就长出语音条
    private func markVoice(_ id: String) {
        if let i = messages.firstIndex(where: { $0.id == id }) { messages[i].hasVoice = true }
    }

    // 连接断了却没收到语音帧，就看磁盘上有没有那份 wav 兜底
    private func settleVoice(_ id: String?) {
        guard let id, pendingVoiceIds.contains(id) else { return }
        pendingVoiceIds.remove(id)
        if voiceFileExists(id) { markVoice(id) }
    }

    private func voiceFileExists(_ id: String) -> Bool {
        guard let dir = voiceDir else { return false }
        return FileManager.default.fileExists(atPath: dir.appendingPathComponent("cyrene-local-\(id).wav").path)
    }

    func clear() {
        Task {
            do {
                try await LocalChatClient.clear(origin)
                messages = []
                lastError = nil
                // 服务端会给空档补一条开场白，重新拉一次把它带回来
                await reload()
            } catch {
                lastError = error.localizedDescription
            }
        }
    }

    func speak(_ message: ChatMessage) {
        if speakingId == message.id { stopSpeaking(); return }
        stopSpeaking()
        Task {
            do {
                let file: URL
                var cleanup: URL? = nil
                if let local = voiceDir?.appendingPathComponent("cyrene-local-\(message.id).wav"),
                   FileManager.default.fileExists(atPath: local.path) {
                    file = local
                } else {
                    let wav = try await LocalChatClient.voice(origin, id: message.id)
                    file = URL(fileURLWithPath: NSTemporaryDirectory())
                        .appendingPathComponent("cyreneclaw-\(message.id).wav")
                    try wav.write(to: file)
                    cleanup = file
                }

                let p = Process()
                p.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
                p.arguments = [file.path]
                let id = message.id
                p.terminationHandler = { _ in
                    Task { @MainActor [weak self] in
                        guard self?.speakingId == id else { return }
                        self?.stopSpeaking()
                    }
                }
                try p.run()
                player = p
                playFile = cleanup
                speakingId = id
                progress = 0
                let size = (try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? Int) ?? 0
                startProgress(seconds: wavSeconds(byteCount: size ?? 0))
            } catch {
                lastError = error.localizedDescription
            }
        }
    }

    func stopSpeaking() {
        progressTask?.cancel()
        progressTask = nil
        if player?.isRunning == true { player?.terminate() }
        player = nil
        if let playFile { try? FileManager.default.removeItem(at: playFile) }
        playFile = nil
        speakingId = nil
        progress = 0
    }

    // afplay 不报进度，按时长匀速推
    private func startProgress(seconds: Double) {
        progressTask?.cancel()
        guard seconds > 0 else { return }
        let started = Date()
        progressTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(120))
                guard let self else { return }
                self.progress = min(1, Date().timeIntervalSince(started) / seconds)
            }
        }
    }

    // GPT-SoVITS 固定 32kHz 16bit 单声道，按文件大小估时长
    private func wavSeconds(byteCount: Int) -> Double {
        guard byteCount > 44 else { return 0 }
        return Double(byteCount - 44) / 64000.0
    }
}


