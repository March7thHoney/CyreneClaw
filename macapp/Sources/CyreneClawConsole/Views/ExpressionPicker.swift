import AppKit
import SwiftUI

// 图片在磁盘上，解码一次就留着，网格滚动时不必反复读盘
final class ExpressionImageCache {
    static let shared = ExpressionImageCache()
    private let cache = NSCache<NSString, NSImage>()

    func image(dataDir: URL, path: String) -> NSImage? {
        guard !path.isEmpty else { return nil }
        let key = path as NSString
        if let hit = cache.object(forKey: key) { return hit }
        guard let img = NSImage(contentsOf: dataDir.appendingPathComponent(path)) else { return nil }
        cache.setObject(img, forKey: key)
        return img
    }
}

// 图缺失时留一块同尺寸的浅色底，网格不会因此错位
struct ExpressionThumb: View {
    let dataDir: URL?
    let path: String
    let side: CGFloat

    var body: some View {
        Group {
            if let dataDir, let img = ExpressionImageCache.shared.image(dataDir: dataDir, path: path) {
                Image(nsImage: img).resizable().interpolation(.high).scaledToFit()
            } else {
                RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Theme.pink300.opacity(0.22))
            }
        }
        .frame(width: side, height: side)
    }
}

struct EmojiPickerPanel: View {
    let dataDir: URL?
    let emojis: [DirEmoji]
    let onPick: (DirEmoji) -> Void

    @State private var query = ""

    private var filtered: [DirEmoji] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return q.isEmpty ? emojis : emojis.filter { $0.name.lowercased().contains(q) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if emojis.count > 30 {
                TextField("搜索表情", text: $query).textFieldStyle(.plain).modifier(InputBox())
            }
            if filtered.isEmpty {
                PanelEmpty(text: emojis.isEmpty ? "这个服务器没有自定义表情" : "没有匹配的表情")
            } else {
                ScrollView {
                    LazyVGrid(columns: Array(repeating: GridItem(.fixed(36), spacing: 2), count: 8), spacing: 2) {
                        ForEach(filtered) { e in
                            Button { onPick(e) } label: {
                                ExpressionThumb(dataDir: dataDir, path: e.image, side: 28).padding(4)
                            }
                            .buttonStyle(.plain)
                            .help(":\(e.name):")
                        }
                    }
                    .padding(.vertical, 2)
                }
                .frame(height: 216)
            }
        }
        .padding(12)
        .frame(width: 336)
    }
}

struct StickerPickerPanel: View {
    let dataDir: URL?
    let stickers: [DirSticker]
    let onPick: (DirSticker) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if stickers.isEmpty {
                PanelEmpty(text: "这个服务器没有贴纸")
            } else {
                ScrollView {
                    LazyVGrid(columns: Array(repeating: GridItem(.fixed(96), spacing: 6), count: 3), spacing: 6) {
                        ForEach(stickers) { s in
                            Button { onPick(s) } label: {
                                VStack(spacing: 4) {
                                    ExpressionThumb(dataDir: dataDir, path: s.image, side: 64)
                                    Text(s.name)
                                        .font(.system(size: 10))
                                        .foregroundStyle(Theme.inkDesc)
                                        .lineLimit(1)
                                }
                                .frame(width: 88)
                                .padding(4)
                            }
                            .buttonStyle(.plain)
                            .help(s.name)
                        }
                    }
                    .padding(.vertical, 2)
                }
                .frame(height: 240)
            }
        }
        .padding(12)
        .frame(width: 336)
    }
}

private struct PanelEmpty: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 11))
            .foregroundStyle(Theme.inkDesc)
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.vertical, 24)
    }
}
