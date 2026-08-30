import Foundation
import SwiftUI

@MainActor
final class ServicesModel: ObservableObject {
    @Published var root: URL?
    @Published var config = ConsoleConfig()

    @Published var bot = ServiceState.unknown
    @Published var botPid: Int32?
    @Published var botRuns: Int?
    @Published var botLogin: String?
    @Published var botLastExit: Int32?

    @Published var bridge = ServiceState.unknown
    @Published var bridgePid: Int32?
    @Published var bridgeModel: String?
    @Published var bridgeQueue: String?
    @Published var bridgeInstalled = false

    @Published var voice = ServiceState.unknown
    @Published var voicePid: Int32?

    @Published var busy: Set<String> = []
    @Published var hint: [String: String] = [:]
    @Published var lastError: String?
    @Published var configDirty = false
    @Published var configLoaded = false

    private var timer: Task<Void, Never>?

    func bootstrap() {
        root = ProjectRoot.discover()
        guard root != nil else { return }
        // 先把配置读进来再开轮询，否则头一次刷新会拿默认值把语音误判成已关闭
        Task {
            await reloadConfig()
            startPolling()
        }
    }

    func setRoot(_ url: URL) {
        root = url
        Task {
            await reloadConfig()
            startPolling()
        }
    }

    func startPolling() {
        timer?.cancel()
        timer = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(for: .seconds(3))
            }
        }
    }

    func stopPolling() { timer?.cancel(); timer = nil }

    func reloadConfig() async {
        guard let root else { return }
        do {
            config = try await ConfigStore.load(root: root)
            configLoaded = true
        } catch {
            lastError = error.localizedDescription
        }
    }

    func refresh() async {
        guard let root else { return }
        async let botStatus = Launchctl.status(Labels.bot)
        async let bridgeStatus = Launchctl.status(Labels.bridge)
        async let health = HealthProbe.json("\(config.bridgeOrigin)/health")
        async let voiceAlive = HealthProbe.reachable("\(config.voiceEndpoint)/change_refer")

        let b = await botStatus
        if !busy.contains("bot") {
            bot = map(b)
            botPid = b.pid
            botRuns = b.runs
            botLastExit = b.lastExitCode
        }
        botLogin = b.pid != nil ? lastLogin(root: root) : nil

        let br = await bridgeStatus
        bridgeInstalled = br.kind != .notInstalled
        if !busy.contains("bridge") { bridge = map(br) }
        bridgePid = br.pid
        if let h = await health {
            bridgeModel = h["model"] as? String
            let running = h["running"] as? Int ?? 0
            let queued = h["queued"] as? Int ?? 0
            bridgeQueue = "\(running) / \(queued)"
            if !busy.contains("bridge") && br.kind == .unknown { bridge = .running }
        } else {
            bridgeModel = nil
            bridgeQueue = nil
        }

        let alive = await voiceAlive
        voicePid = readPid(root: root)
        if !busy.contains("voice") {
            voice = config.voiceEnabled ? (alive ? .running : .stopped) : .disabled
        }
    }

    private func map(_ s: LaunchdStatus) -> ServiceState {
        switch s.kind {
        case .running: return .running
        case .stopped: return .stopped
        case .notInstalled: return .notInstalled
        case .unknown: return .unknown
        }
    }

    // 只读日志尾部，找最后一次登录成功的记录作为副标题
    private func lastLogin(root: URL) -> String? {
        let file = root.appendingPathComponent("logs/cyreneclaw.log")
        guard let h = try? FileHandle(forReadingFrom: file) else { return nil }
        defer { try? h.close() }
        let size = (try? h.seekToEnd()) ?? 0
        let span: UInt64 = 64 * 1024
        try? h.seek(toOffset: size > span ? size - span : 0)
        guard let data = try? h.readToEnd(), let text = String(data: data, encoding: .utf8) else { return nil }
        for line in text.split(separator: "\n").reversed() where line.contains("已登录：") {
            return line.components(separatedBy: "已登录：").last?.trimmingCharacters(in: .whitespaces)
        }
        return nil
    }

    private func readPid(root: URL) -> Int32? {
        let file = root.appendingPathComponent("voice/runtime/gpt-sovits-api.pid")
        guard let s = try? String(contentsOf: file, encoding: .utf8) else { return nil }
        return Int32(s.trimmingCharacters(in: .whitespacesAndNewlines))
    }
}
