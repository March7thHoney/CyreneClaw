import SwiftUI

// 数值全部直译自 cyrene-web 的 globals.css，改配色只改这里
enum Theme {
    static let bgBase = Color(hex: 0xFBFBFE)
    static let ink = Color(hex: 0x2B2937)

    // 网页靠文字透明度分档表达层级，这里照搬
    static let inkBody = ink.opacity(0.70)
    static let inkDesc = ink.opacity(0.55)
    static let inkMeta = ink.opacity(0.40)

    static let pink = Color(hex: 0xEC4899)
    static let violet = Color(hex: 0x8B5CF6)
    static let sky = Color(hex: 0x0EA5E9)
    static let pink600 = Color(hex: 0xDB2777)
    static let pink300 = Color(hex: 0xF9A8D4)

    // linear-gradient(92deg, #ec4899, #8b5cf6 55%, #0ea5e9)
    static let brand = LinearGradient(
        stops: [.init(color: pink, location: 0.0),
                .init(color: violet, location: 0.55),
                .init(color: sky, location: 1.0)],
        startPoint: UnitPoint(x: 0, y: 0.47),
        endPoint: UnitPoint(x: 1, y: 0.53))

    static let glassFill = Color.white.opacity(0.60)
    static let glassStroke = Color.white.opacity(0.75)
    static let cardRadius: CGFloat = 20
    static let btnRadius: CGFloat = 14

    // 阴影染的是玫瑰灰而不是中性黑，这是整套风格最容易漏掉的一点
    static let shadowTint = Color(hex: 0xBE5A96)

    static let ok = Color(hex: 0x10B981)
    static let idle = Color(hex: 0x94A3B8)
    static let warn = Color(hex: 0xF59E0B)
    static let bad = Color(hex: 0xEF4444)

    // cubic-bezier(.22, 1, .36, 1)
    static let ease = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.7)
}

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: 1)
    }
}
