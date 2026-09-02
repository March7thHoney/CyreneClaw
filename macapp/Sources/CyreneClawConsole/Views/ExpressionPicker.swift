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

// “已选 / 未选 / 已失效”三态的选图按钮，面板要不要关由面板自己决定
struct ExpressionPickButton<P: View>: View {
    let dataDir: URL?
    let label: String
    let picked: Bool
    let image: String
    var disabled = false
    @ViewBuilder let panel: (@escaping () -> Void) -> P

    @State private var picking = false

    var body: some View {
        Button { picking = true } label: {
            HStack(spacing: 6) {
                if !image.isEmpty { ExpressionThumb(dataDir: dataDir, path: image, side: 18) }
                Text(label)
                    .font(.system(size: 12.5))
                    .foregroundStyle(picked ? Theme.ink : Theme.inkDesc)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Image(systemName: "chevron.down").font(.system(size: 9)).foregroundStyle(Theme.inkMeta)
            }
            .modifier(InputBox())
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .popover(isPresented: $picking, arrowEdge: .bottom) { panel { picking = false } }
    }
}

struct EmojiPickerPanel: View {
    let dataDir: URL?
    let emojis: [DirEmoji]
    // 给了就在面板顶上多一行清掉当前选择的入口
    var onClear: (() -> Void)?
    let onPick: (DirEmoji) -> Void

    @State private var query = ""

    private var filtered: [DirEmoji] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        return q.isEmpty ? emojis : emojis.filter { $0.name.lowercased().contains(q) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let onClear {
                Button { onClear() } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "slash.circle").font(.system(size: 11)).foregroundStyle(Theme.inkMeta)
                        Text("不反应").font(.system(size: 12.5)).foregroundStyle(Theme.inkDesc)
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
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

// 已选表情池：缩略图网格，悬停出叉号删除，清单里找不到的项显示失效占位
struct ExpressionPoolGrid: View {
    let keys: [String]
    let directory: DiscordDirectory
    let dataDir: URL?
    let onRemove: (String) -> Void

    private func lookup(_ key: String) -> (image: String, name: String)? {
        for g in directory.guilds {
            if let e = g.emojis.first(where: { $0.token == key }) { return (e.image, ":\(e.name):") }
            if let s = g.stickers.first(where: { $0.id == key }) { return (s.image, s.name) }
        }
        return nil
    }

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 56), spacing: 8)], alignment: .leading, spacing: 8) {
            ForEach(keys, id: \.self) { key in
                let hit = lookup(key)
                ExpressionPoolCell(dataDir: dataDir, image: hit?.image ?? "", name: hit?.name ?? "已失效") { onRemove(key) }
            }
        }
    }
}

private struct ExpressionPoolCell: View {
    let dataDir: URL?
    let image: String
    let name: String
    let onRemove: () -> Void

    @State private var hovering = false

    var body: some View {
        ZStack(alignment: .topTrailing) {
            ExpressionThumb(dataDir: dataDir, path: image, side: 48)
                .padding(4)
                .background(RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color.white.opacity(0.6)))
            if hovering {
                Button(action: onRemove) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.bad)
                        .background(Circle().fill(.white))
                }
                .buttonStyle(.plain)
                .offset(x: 4, y: -4)
            }
        }
        .help(name)
        .onHover { hovering = $0 }
    }
}
