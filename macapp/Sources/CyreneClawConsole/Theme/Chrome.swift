import SwiftUI

// .fade-up + .d1…d5：0.7s cubic-bezier(.22,1,.36,1)，延迟 .08/.18/.28/.4/.55
struct FadeUp: ViewModifier {
    let delay: Double
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : 18)
            .onAppear { withAnimation(Theme.ease.delay(delay)) { shown = true } }
    }
}

extension View {
    func fadeUp(step: Int) -> some View {
        modifier(FadeUp(delay: [0.08, 0.18, 0.28, 0.40, 0.55][min(max(step, 0), 4)]))
    }
}

// 状态徽章：胶囊底 + 圆点，运行中与过渡态带呼吸
struct StatusBadge: View {
    let text: String
    let tint: Color
    var pulsing = false
    @State private var breathe = false

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(tint)
                .frame(width: 7, height: 7)
                .overlay {
                    if pulsing {
                        Circle()
                            .stroke(tint.opacity(0.45), lineWidth: 3)
                            .scaleEffect(breathe ? 2.2 : 1)
                            .opacity(breathe ? 0 : 1)
                    }
                }
            Text(text).font(.system(size: 12, weight: .medium))
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(Capsule().fill(tint.opacity(0.10)))
        .onAppear {
            guard pulsing else { return }
            withAnimation(.easeOut(duration: 1.4).repeatForever(autoreverses: false)) { breathe = true }
        }
    }
}

// 卡片里的一小段元信息，走最弱的那档透明度
struct MetaItem: View {
    let label: String
    let value: String

    var body: some View {
        HStack(spacing: 4) {
            Text(label).foregroundStyle(Theme.inkMeta)
            Text(value).foregroundStyle(Theme.inkDesc).fontWeight(.medium)
        }
        .font(.system(size: 11.5))
    }
}
