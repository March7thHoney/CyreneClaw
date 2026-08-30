import SwiftUI

// .btn-brand：160% 宽的渐变，hover 时把 background-position 从 0% 推到 90%
struct BrandButtonStyle: ButtonStyle {
    var compact = false
    @State private var hovered = false
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: Theme.btnRadius, style: .continuous)
        return configuration.label
            .font(.system(size: 12.5, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, compact ? 12 : 16)
            .padding(.vertical, compact ? 6 : 8)
            .background {
                GeometryReader { g in
                    Theme.brand
                        .frame(width: g.size.width * 1.6)
                        .offset(x: hovered ? -g.size.width * 0.54 : 0)
                }
            }
            .clipShape(shape)
            .shadow(color: (hovered ? Color(hex: 0x8C5AE6) : Color(hex: 0xD946A0)).opacity(0.55),
                    radius: hovered ? 11 : 8, y: hovered ? 11 : 8)
            .offset(y: hovered ? -1 : 0)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(enabled ? 1 : 0.4)
            .animation(.easeInOut(duration: 0.45), value: hovered)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
            .onHover { hovered = enabled && $0 }
    }
}

// 次要动作用玻璃描边款，避免一张卡里几个渐变按钮互相打架
struct GhostButtonStyle: ButtonStyle {
    var compact = false
    var danger = false
    @State private var hovered = false
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: Theme.btnRadius, style: .continuous)
        let tint = danger ? Theme.pink600 : Theme.inkBody
        return configuration.label
            .font(.system(size: 12.5, weight: .medium))
            .foregroundStyle(hovered ? Theme.pink600 : tint)
            .padding(.horizontal, compact ? 12 : 16)
            .padding(.vertical, compact ? 6 : 8)
            .background(shape.fill(Color.white.opacity(hovered ? 0.85 : 0.62)))
            .overlay(shape.strokeBorder(hovered ? Theme.pink300 : Color(hex: 0xFCE7F3), lineWidth: 1))
            .shadow(color: Theme.shadowTint.opacity(0.08), radius: 3, y: 2)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(enabled ? 1 : 0.4)
            .animation(.easeOut(duration: 0.18), value: hovered)
            .onHover { hovered = enabled && $0 }
    }
}
