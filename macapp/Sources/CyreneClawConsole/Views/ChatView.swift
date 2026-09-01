import SwiftUI

// 聊天页：顶栏、消息列表、输入条。不加入场动画，控件全是标准 Button
struct ChatView: View {
    @ObservedObject var model: ServicesModel
    @ObservedObject var chat: ChatModel

    var body: some View {
        VStack(spacing: 12) {
            header
            transcript
            composer
        }
        .padding(.horizontal, 18)
        .padding(.top, 14)
        .padding(.bottom, 16)
        // 绑定挂在轮询上而不是 onAppear：后台启动的窗口不一定触发 appear
        .task {
            chat.voiceDir = model.config.voiceGeneratedDir
            chat.bind(origin: model.config.localChatOrigin)
        }
        .onChange(of: model.localChat) {
            chat.voiceDir = model.config.voiceGeneratedDir
            chat.bind(origin: model.config.localChatOrigin)
            Task { await chat.probe(); if chat.online && !chat.loaded { await chat.reload() } }
        }
        .onDisappear { chat.stopSpeaking() }
    }

    private var header: some View {
        HStack(spacing: 10) {
            Text(chat.charName.isEmpty ? "本机聊天" : chat.charName)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Theme.ink)
            if !chat.online {
                Text("服务未响应，请在控制台里启动机器人")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.warn)
            }
            Spacer(minLength: 8)
            if let err = chat.lastError {
                Text(err)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.bad)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            Button("清空") { chat.clear() }
                .buttonStyle(GhostButtonStyle(compact: true, danger: true))
                .disabled(chat.messages.isEmpty || chat.sending)
        }
        .padding(.horizontal, 4)
    }

    private var transcript: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(chat.messages) { m in
                        row(m).id(m.id)
                    }
                    if let s = chat.streaming {
                        row(s).id(typingAnchor)
                    } else if chat.sending {
                        HStack(spacing: 0) {
                            TypingBubble()
                            Spacer(minLength: 40)
                        }
                        .id(typingAnchor)
                    }
                }
                .padding(.horizontal, 2)
                .padding(.vertical, 4)
            }
            .scrollIndicators(.never)
            .onChange(of: chat.messages.count) { scroll(proxy) }
            .onChange(of: chat.sending) { scroll(proxy) }
            .onChange(of: chat.streaming?.text) { scroll(proxy) }
        }
        .frame(maxHeight: .infinity)
    }

    private let typingAnchor = "typing"

    private func scroll(_ proxy: ScrollViewProxy) {
        let target: String? = chat.sending ? typingAnchor : chat.messages.last?.id
        guard let target else { return }
        proxy.scrollTo(target, anchor: .bottom)
    }

    @ViewBuilder
    private func row(_ m: ChatMessage) -> some View {
        if m.isUser {
            HStack(spacing: 0) {
                Spacer(minLength: 80)
                UserBubble(message: m).frame(maxWidth: 460, alignment: .trailing)
            }
        } else {
            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 8) {
                    ChatBubble(message: m)
                    if m.hasVoice == true || chat.pendingVoiceId == m.id {
                        VoiceBar(pending: chat.pendingVoiceId == m.id,
                                 playing: chat.speakingId == m.id,
                                 progress: chat.speakingId == m.id ? chat.progress : 0) { chat.speak(m) }
                    }
                }
                .frame(maxWidth: 620, alignment: .leading)
                Spacer(minLength: 40)
            }
        }
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            ChatInput(text: $chat.draft, enabled: chat.online && !chat.sending) { chat.send() }
            Button {
                chat.send()
            } label: {
                if chat.sending {
                    ProgressView().controlSize(.small).scaleEffect(0.7).frame(width: 30)
                } else {
                    Text("发送").frame(width: 30)
                }
            }
            .buttonStyle(BrandButtonStyle())
            .disabled(!chat.canSend)
        }
    }
}

// 多行输入，回车发送、Shift+回车换行
private struct ChatInput: View {
    @Binding var text: String
    let enabled: Bool
    let onSubmit: () -> Void

    var body: some View {
        ZStack(alignment: .topLeading) {
            if text.isEmpty {
                Text("说点什么…")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.inkMeta)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $text)
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.ink)
                .scrollContentBackground(.hidden)
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .frame(minHeight: 38, maxHeight: 120)
                .fixedSize(horizontal: false, vertical: true)
                .disabled(!enabled)
                .onKeyPress(.return) {
                    guard enabled else { return .ignored }
                    // Shift 按着就是换行，交回给编辑器自己处理
                    if NSEvent.modifierFlags.contains(.shift) { return .ignored }
                    onSubmit()
                    return .handled
                }
        }
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.white.opacity(0.7)))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
            .strokeBorder(Color(hex: 0xFCE7F3), lineWidth: 1))
        .opacity(enabled ? 1 : 0.55)
    }
}
