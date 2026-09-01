import SwiftUI

// 聊天页的气泡走最朴素的结构：单层底色加描边，没有动画，没有材质叠层
private let bubbleShape = RoundedRectangle(cornerRadius: 14, style: .continuous)

struct ChatBubble: View {
    let message: ChatMessage

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(message.name)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Theme.pink600)
                Text(message.time)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.inkMeta)
            }
            Text(rendered)
                .lineSpacing(5)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .background(bubbleShape.fill(Color.white.opacity(0.78)))
        .overlay(bubbleShape.strokeBorder(Color(hex: 0xFCE7F3), lineWidth: 1))
    }

    // 台词深墨、场景描写淡紫斜体，段落结构照原文保留
    private var rendered: AttributedString {
        let segments = message.segments ?? [ChatSegment(kind: .narration, text: message.text)]
        var out = AttributedString()
        for seg in segments {
            var piece = AttributedString(seg.text)
            switch seg.kind {
            case .dialogue:
                piece.foregroundColor = Theme.ink
                piece.font = .system(size: 13)
            case .narration:
                piece.foregroundColor = Theme.violet.opacity(0.78)
                piece.font = .system(size: 12.5).italic()
            }
            out.append(piece)
        }
        return out
    }
}

// 自己那条：右对齐的品牌渐变胶囊
struct UserBubble: View {
    let message: ChatMessage

    var body: some View {
        Text(message.text)
            .font(.system(size: 13))
            .foregroundStyle(.white)
            .lineSpacing(4)
            .textSelection(.enabled)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(bubbleShape.fill(Theme.brand))
    }
}

// 语音条：合成完单独成条，落在气泡下面
struct VoiceBar: View {
    let pending: Bool
    let playing: Bool
    let progress: Double
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 10) {
                if pending {
                    ProgressView().controlSize(.small).scaleEffect(0.55).frame(width: 20, height: 20)
                } else {
                    Image(systemName: playing ? "stop.fill" : "play.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(.white)
                        .frame(width: 20, height: 20)
                        .background(Circle().fill(Theme.brand))
                }
                wave
                Text(pending ? "合成中" : "语音")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.inkMeta)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(bubbleShape.fill(Color.white.opacity(0.78)))
            .overlay(bubbleShape.strokeBorder(Color(hex: 0xFCE7F3), lineWidth: 1))
            .contentShape(bubbleShape)
        }
        .buttonStyle(.borderless)
        .disabled(pending)
    }

    private static let bars = 22

    // 波形不动，已播的那几根染成品牌粉
    private var wave: some View {
        HStack(spacing: 2) {
            ForEach(0..<Self.bars, id: \.self) { i in
                let h = 0.35 + 0.65 * abs(sin(Double(i) * 0.7))
                let played = playing && Double(i) / Double(Self.bars) < progress
                Capsule()
                    .fill(pending ? Theme.idle.opacity(0.35) : (played ? Theme.pink600 : Theme.pink300.opacity(0.55)))
                    .frame(width: 2, height: max(3, 14 * h))
            }
        }
        .frame(height: 14)
    }
}

// 等第一个字的占位，三个静止的点
struct TypingBubble: View {
    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<3, id: \.self) { _ in
                Circle().fill(Theme.pink300).frame(width: 6, height: 6)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(bubbleShape.fill(Color.white.opacity(0.78)))
        .overlay(bubbleShape.strokeBorder(Color(hex: 0xFCE7F3), lineWidth: 1))
    }
}
