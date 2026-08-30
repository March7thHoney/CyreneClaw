import AppKit
import SwiftUI

// 三团漂浮光斑，对应 .ambient-blob 的 pink / sky / violet
struct AmbientBackground: View {
    @State private var drift = false

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Theme.bgBase
                blob(size: 620, color: 0xF472B6, alpha: 0.55, period: 26, reverse: false,
                     at: CGPoint(x: 90, y: 60))
                blob(size: 700, color: 0x38BDF8, alpha: 0.45, period: 32, reverse: true,
                     at: CGPoint(x: geo.size.width - 60, y: 230))
                blob(size: 640, color: 0xA78BFA, alpha: 0.42, period: 38, reverse: false,
                     at: CGPoint(x: geo.size.width * 0.30, y: geo.size.height - 40))
                blob(size: 520, color: 0xFB7185, alpha: 0.30, period: 30, reverse: true,
                     at: CGPoint(x: geo.size.width * 0.86, y: geo.size.height - 10))
            }
            // 光斑层整体栅格化一次，动画时不再逐帧重算渐变
            .drawingGroup()
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .onAppear {
            // 系统开了「减弱动态效果」就不动，对齐 prefers-reduced-motion
            if !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion { drift = true }
        }
    }

    private func blob(size: CGFloat, color: UInt32, alpha: Double,
                      period: Double, reverse: Bool, at point: CGPoint) -> some View {
        let c = Color(hex: color)
        return Circle()
            .fill(RadialGradient(
                stops: [.init(color: c.opacity(alpha), location: 0),
                        .init(color: c.opacity(alpha * 0.35), location: 0.35),
                        .init(color: .clear, location: 0.65)],
                center: .center, startRadius: 0, endRadius: size / 2))
            .frame(width: size, height: size)
            .blur(radius: 24)
            .position(point)
            // @keyframes drift: translate3d(60px, 40px, 0) scale(1.08)
            .offset(x: drift ? (reverse ? -60 : 60) : 0,
                    y: drift ? (reverse ? -40 : 40) : 0)
            .scaleEffect(drift ? 1.08 : 1)
            .animation(.easeInOut(duration: period).repeatForever(autoreverses: true), value: drift)
    }
}
