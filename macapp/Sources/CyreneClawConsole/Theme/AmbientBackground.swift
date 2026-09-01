import SwiftUI

// 静态光斑背景：RadialGradient 自带柔边，不再实时 blur，也不做漂移动画
struct AmbientBackground: View {
    var body: some View {
        GeometryReader { geo in
            ZStack {
                Theme.bgBase
                blob(size: 620, color: 0xF472B6, alpha: 0.55, at: CGPoint(x: 90, y: 60))
                blob(size: 700, color: 0x38BDF8, alpha: 0.45, at: CGPoint(x: geo.size.width - 60, y: 230))
                blob(size: 640, color: 0xA78BFA, alpha: 0.42, at: CGPoint(x: geo.size.width * 0.30, y: geo.size.height - 40))
                blob(size: 520, color: 0xFB7185, alpha: 0.30, at: CGPoint(x: geo.size.width * 0.86, y: geo.size.height - 10))
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }

    private func blob(size: CGFloat, color: UInt32, alpha: Double, at point: CGPoint) -> some View {
        let c = Color(hex: color)
        return Circle()
            .fill(RadialGradient(
                stops: [.init(color: c.opacity(alpha), location: 0),
                        .init(color: c.opacity(alpha * 0.35), location: 0.35),
                        .init(color: .clear, location: 0.65)],
                center: .center, startRadius: 0, endRadius: size / 2))
            .frame(width: size, height: size)
            .position(point)
    }
}
