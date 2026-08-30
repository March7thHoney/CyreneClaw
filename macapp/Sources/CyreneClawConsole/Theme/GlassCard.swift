import SwiftUI

// .glass-card / .glass-card-hover 的 SwiftUI 版
struct GlassCard: ViewModifier {
    var radius: CGFloat = Theme.cardRadius
    var hoverable: Bool = true
    @State private var hovered = false

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        return content
            .background {
                // backdrop-filter: blur(20px) saturate(1.4)：底下的光斑要透上来
                shape.fill(Theme.glassFill)
                    .background(shape.fill(.ultraThinMaterial))
            }
            .overlay {
                shape.strokeBorder(hovered ? Theme.pink300.opacity(0.6) : Theme.glassStroke, lineWidth: 1)
            }
            // inset 0 1px 0 rgba(255,255,255,.9)：只描上半圈，模拟顶部内高光
            .overlay {
                shape.strokeBorder(
                    LinearGradient(colors: [.white.opacity(0.9), .clear],
                                   startPoint: .top, endPoint: .center),
                    lineWidth: 1)
            }
            .clipShape(shape)
            .shadow(color: Theme.shadowTint.opacity(hovered ? 0.06 : 0.05), radius: hovered ? 2 : 1, y: 1)
            .shadow(color: Theme.shadowTint.opacity(hovered ? 0.28 : 0.16),
                    radius: hovered ? 16 : 11, y: hovered ? 18 : 10)
            .offset(y: hovered ? -3 : 0)
            .animation(.easeOut(duration: 0.3), value: hovered)
            .onHover { if hoverable { hovered = $0 } }
    }
}

extension View {
    func glassCard(radius: CGFloat = Theme.cardRadius, hoverable: Bool = true) -> some View {
        modifier(GlassCard(radius: radius, hoverable: hoverable))
    }
}
