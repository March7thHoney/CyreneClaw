// 把去过底的角色图合成成 macOS 规范的 1024 图标：留白 + squircle + 品牌渐变 + 投影
import AppKit
import SwiftUI

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("用法: compose-icon.swift <art.png> <out.png>\n".data(using: .utf8)!)
    exit(1)
}

let S: CGFloat = 1024          // 画布
let MARGIN: CGFloat = 100      // 四周透明留白，macOS 图标模板
let BODY = CGRect(x: MARGIN, y: MARGIN, width: S - MARGIN * 2, height: S - MARGIN * 2)
let RADIUS = BODY.width * 0.2255   // Big Sur 之后的圆角比例

func hex(_ v: UInt32, _ a: CGFloat = 1) -> CGColor {
    CGColor(srgbRed: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255,
            blue: CGFloat(v & 0xFF) / 255, alpha: a)
}

guard let artSrc = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil),
      let art = CGImageSourceCreateImageAtIndex(artSrc, 0, nil) else {
    FileHandle.standardError.write("读不到源图\n".data(using: .utf8)!); exit(1)
}

let cs = CGColorSpace(name: CGColorSpace.sRGB)!
guard let ctx = CGContext(data: nil, width: Int(S), height: Int(S), bitsPerComponent: 8,
                          bytesPerRow: 0, space: cs,
                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { exit(1) }
ctx.interpolationQuality = .high

// SwiftUI 的 continuous 圆角就是 Apple 的连续曲率，直接借它的路径
let plate = RoundedRectangle(cornerRadius: RADIUS, style: .continuous).path(in: BODY).cgPath

// 投影落在留白里，不能溢出画布
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -18), blur: 36, color: hex(0x6B2B52, 0.22))
ctx.addPath(plate); ctx.setFillColor(hex(0xFFFFFF)); ctx.fillPath()
ctx.restoreGState()

ctx.saveGState()
ctx.addPath(plate); ctx.clip()

// 品牌三色压淡的对角渐变，对应 cyrene-web 的 linear-gradient(92deg, 粉→紫→蓝)
let grad = CGGradient(colorsSpace: cs,
                      colors: [hex(0xFDE7F3), hex(0xEFE6FE), hex(0xDDF0FD)] as CFArray,
                      locations: [0.0, 0.55, 1.0])!
ctx.drawLinearGradient(grad, start: CGPoint(x: BODY.minX, y: BODY.maxY),
                       end: CGPoint(x: BODY.maxX, y: BODY.minY), options: [])

// 两团柔光，呼应网页的 ambient blob
func glow(_ c: CGPoint, _ r: CGFloat, _ color: UInt32, _ a: CGFloat) {
    let g = CGGradient(colorsSpace: cs, colors: [hex(color, a), hex(color, 0)] as CFArray,
                       locations: [0.0, 1.0])!
    ctx.drawRadialGradient(g, startCenter: c, startRadius: 0, endCenter: c, endRadius: r, options: [])
}
glow(CGPoint(x: BODY.minX + 60, y: BODY.maxY - 40), 460, 0xF472B6, 0.30)
glow(CGPoint(x: BODY.maxX - 40, y: BODY.minY + 60), 500, 0x38BDF8, 0.26)

// 角色等比放进内容安全区，略微上移让重心稳一点
let safe = BODY.insetBy(dx: BODY.width * 0.075, dy: BODY.height * 0.075)
let aw = CGFloat(art.width), ah = CGFloat(art.height)
let scale = min(safe.width / aw, safe.height / ah)
let dw = aw * scale, dh = ah * scale
let dest = CGRect(x: safe.midX - dw / 2, y: safe.midY - dh / 2 - BODY.height * 0.025,
                  width: dw, height: dh)
ctx.draw(art, in: dest)

// 顶部内高光，对应 inset 0 1px 0 rgba(255,255,255,.9)
let hl = CGGradient(colorsSpace: cs, colors: [hex(0xFFFFFF, 0.85), hex(0xFFFFFF, 0)] as CFArray,
                    locations: [0.0, 1.0])!
ctx.saveGState()
ctx.clip(to: CGRect(x: BODY.minX, y: BODY.maxY - 3, width: BODY.width, height: 3))
ctx.drawLinearGradient(hl, start: CGPoint(x: 0, y: BODY.maxY),
                       end: CGPoint(x: 0, y: BODY.maxY - 3), options: [])
ctx.restoreGState()
ctx.restoreGState()

// 外沿发丝线，防止大尺寸下边缘发虚
ctx.addPath(plate)
ctx.setStrokeColor(hex(0xBE5A96, 0.14))
ctx.setLineWidth(2)
ctx.strokePath()

guard let out = ctx.makeImage(),
      let dst = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[2]) as CFURL,
                                                "public.png" as CFString, 1, nil) else { exit(1) }
CGImageDestinationAddImage(dst, out, nil)
CGImageDestinationFinalize(dst)
