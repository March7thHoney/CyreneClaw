import SwiftUI

// 入场动画已停用：切页时几组错峰动画一起跑，观感是卡而不是精致
struct FadeUp: ViewModifier {
    let delay: Double

    func body(content: Content) -> some View {
        content
    }
}

extension View {
    func fadeUp(step: Int) -> some View {
        modifier(FadeUp(delay: [0.08, 0.18, 0.28, 0.40, 0.55][min(max(step, 0), 4)]))
    }
}

// 状态徽章：胶囊底 + 圆点。呼吸动画去掉了，无限动画会一直吃渲染
struct StatusBadge: View {
    let text: String
    let tint: Color
    var pulsing = false

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(tint)
                .frame(width: 7, height: 7)
                .overlay {
                    if pulsing {
                        Circle().stroke(tint.opacity(0.35), lineWidth: 3).scaleEffect(1.5)
                    }
                }
            Text(text).font(.system(size: 12, weight: .medium))
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(Capsule().fill(tint.opacity(0.10)))
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

// 输入框统一成玻璃描边款，和按钮同一套圆角
struct InputBox: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.system(size: 12.5))
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.white.opacity(0.7)))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Color(hex: 0xFCE7F3), lineWidth: 1))
    }
}
