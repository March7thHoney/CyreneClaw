import AppKit
import SwiftUI

struct RootView: View {
    @StateObject private var model = ServicesModel()

    var body: some View {
        ZStack {
            AmbientBackground()
            if model.root == nil {
                SetupView { model.setRoot($0) }
            } else {
                VStack(spacing: 0) {
                    navBar
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
            }
        }
        .preferredColorScheme(.light)
        .tint(Theme.pink)
        .onAppear { model.bootstrap() }
        .onDisappear { model.stopPolling() }
    }

    // navbar：浮岛毛玻璃胶囊，四周留白，不通栏
    private var navBar: some View {
        HStack(spacing: 10) {
            // 隐藏标题栏后红黄绿灯浮在内容上，左侧给它们让位
            Spacer().frame(width: 62)
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .frame(width: 24, height: 24)
            Text("CyreneClaw 控制台")
                .font(.system(size: 14.5, weight: .bold))
                .foregroundStyle(Theme.brand)
            Spacer(minLength: 12)
        }
        .padding(.horizontal, 8)
        .frame(height: 54)
        .glassCard(radius: 16, hoverable: false)
        .padding(.horizontal, 16)
        .padding(.top, 12)
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
