import SwiftUI

// 玻璃卡的轻量版：纯色半透明底，单层小阴影。实时背景模糊与大半径阴影太吃渲染
struct GlassCard: ViewModifier {
    var radius: CGFloat = Theme.cardRadius
    var hoverable: Bool = true
    @State private var hovered = false

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        return content
            .background(shape.fill(Color.white.opacity(0.72)))
            .overlay {
                shape.strokeBorder(hovered ? Theme.pink300.opacity(0.6) : Theme.glassStroke, lineWidth: 1)
            }
            .shadow(color: Theme.shadowTint.opacity(hovered ? 0.22 : 0.13), radius: 5, y: 3)
            .onHover { if hoverable { hovered = $0 } }
    }
}

extension View {
    func glassCard(radius: CGFloat = Theme.cardRadius, hoverable: Bool = true) -> some View {
        modifier(GlassCard(radius: radius, hoverable: hoverable))
    }
}
