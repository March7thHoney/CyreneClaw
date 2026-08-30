import SwiftUI

// 前两级自动发现都没命中时的兜底引导
struct SetupView: View {
    let onPick: (URL) -> Void
    @State private var rejected = false

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "folder.badge.questionmark")
                .font(.system(size: 34, weight: .light))
                .foregroundStyle(Theme.brand)
            Text("找不到 CyreneClaw 项目")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Theme.ink)
            Text("请选择项目根目录，也就是含 package.json 与 src/index.js 的那一层。")
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.inkDesc)
                .multilineTextAlignment(.center)
            if rejected {
                Text("这个目录看起来不是 CyreneClaw 项目，请重新选择。")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.bad)
            }
            Button("选择目录…") {
                if let url = ProjectRoot.chooseInteractively() { onPick(url) } else { rejected = true }
            }
            .buttonStyle(BrandButtonStyle())
        }
        .padding(36)
        .frame(maxWidth: 420)
        .glassCard(hoverable: false)
        .fadeUp(step: 0)
    }
}
