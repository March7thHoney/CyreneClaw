import AppKit
import SwiftUI

struct RootView: View {
    @StateObject private var model = ServicesModel()
    @StateObject private var chat = ChatModel()
    // 记住上次停在哪一页，重开时回到原处
    @AppStorage("consoleTab") private var tab = Tab.console

    enum Tab: String, CaseIterable, Identifiable {
        // rawValue 落进偏好，改名会让老用户回到控制台页
        case console
        case chat

        var id: String { rawValue }

        var label: String {
            switch self {
            case .console: return "控制台"
            case .chat: return "聊天"
            }
        }

        var icon: String {
            switch self {
            case .console: return "slider.horizontal.3"
            case .chat: return "bubble.left.and.text.bubble.right"
            }
        }
    }

    var body: some View {
        ZStack {
            AmbientBackground()
            if model.root == nil {
                SetupView { model.setRoot($0) }
            } else {
                VStack(spacing: 0) {
                    navBar
                    // 控制台整页重建太贵（十几个 AppKit 下拉），常驻藏起来；聊天页轻，随切随建
                    ZStack {
                        console
                            .opacity(tab == .console ? 1 : 0)
                            .allowsHitTesting(tab == .console)
                        if tab == .chat {
                            ChatView(model: model, chat: chat)
                        }
                    }
                }
            }
        }
        .hideOnClose()
        .preferredColorScheme(.light)
        .tint(Theme.pink)
        .onAppear { model.bootstrap() }
        .onDisappear { model.stopPolling() }
    }

    private var console: some View {
        ScrollView {
            VStack(spacing: 14) {
                ServicesView(model: model)
                ConfigView(model: model)
                footer.fadeUp(step: 4)
            }
            .padding(.horizontal, 18)
            .padding(.top, 16)
            .padding(.bottom, 20)
        }
        .scrollIndicators(.never)
    }

    // navbar：浮岛毛玻璃胶囊，红黄绿灯浮在它上方的留白里，内容与卡片同一条左基线
    private var navBar: some View {
        HStack(spacing: 14) {
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .frame(width: 44, height: 44)
            Text("CyreneClaw 控制台")
                .font(.system(size: 14.5, weight: .bold))
                .foregroundStyle(Theme.brand)
            Spacer(minLength: 12)
            switcher
        }
        .padding(.horizontal, 16)
        .frame(height: 60)
        .glassCard(radius: 16, hoverable: false)
        .padding(.horizontal, 18)
        .padding(.top, 30)
    }

    // 分段切换器：选中的那格铺品牌渐变，其余留白
    private var switcher: some View {
        HStack(spacing: 4) {
            ForEach(Tab.allCases) { t in
                let on = tab == t
                Button {
                    tab = t
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: t.icon).font(.system(size: 11, weight: .semibold))
                        Text(t.label).font(.system(size: 12.5, weight: on ? .semibold : .medium))
                    }
                    .foregroundStyle(on ? Color.white : Theme.inkBody)
                    .padding(.horizontal, 13)
                    .padding(.vertical, 7)
                    .background {
                        if on {
                            Capsule().fill(Theme.brand)
                                .shadow(color: Color(hex: 0xD946A0).opacity(0.42), radius: 7, y: 4)
                        }
                    }
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(Capsule().fill(Color.white.opacity(0.55)))
        .overlay(Capsule().strokeBorder(Color(hex: 0xFCE7F3), lineWidth: 1))
    }

    private var footer: some View {
        HStack(spacing: 10) {
            Text(model.root?.path ?? "未定位项目")
                .font(.system(size: 11))
                .foregroundStyle(Theme.inkMeta)
                .lineLimit(1)
                .truncationMode(.head)
            Spacer(minLength: 8)
            Button("在 Finder 中打开") {
                if let root = model.root { NSWorkspace.shared.open(root) }
            }
            .buttonStyle(GhostButtonStyle(compact: true))
            Button("更改…") {
                if let url = ProjectRoot.chooseInteractively() { model.setRoot(url) }
            }
            .buttonStyle(GhostButtonStyle(compact: true))
        }
        .padding(.horizontal, 4)
    }
}
