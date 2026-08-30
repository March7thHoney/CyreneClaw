import AppKit
import SwiftUI

enum Tab: String, CaseIterable, Identifiable {
    case services = "控制台"
    case config = "设置"
    var id: String { rawValue }
}

struct RootView: View {
    @StateObject private var model = ServicesModel()
    @State private var tab = Tab.services

    var body: some View {
        ZStack {
            AmbientBackground()
            if model.root == nil {
                SetupView { model.setRoot($0) }
            } else {
                VStack(spacing: 0) {
                    navBar
                    ScrollView {
                        Group {
                            switch tab {
                            case .services: ServicesView(model: model)
                            case .config: ConfigView(model: model)
                            }
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
            HStack(spacing: 4) {
                ForEach(Tab.allCases) { t in
                    NavPill(title: t.rawValue, active: tab == t) {
                        withAnimation(.easeOut(duration: 0.2)) { tab = t }
                    }
                }
            }
            Spacer().frame(width: 6)
        }
        .padding(.horizontal, 8)
        .frame(height: 54)
        .glassCard(radius: 16, hoverable: false)
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }
}
