import SwiftUI

struct ServiceCard<Actions: View>: View {
    let icon: String
    let title: String
    let subtitle: String?
    let state: ServiceState
    let metas: [(String, String)]
    let note: String?
    @ViewBuilder var actions: Actions

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            // features 卡片的标志性元素：44 见方、品牌三色 15% 对角渐变底
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(LinearGradient(colors: [Theme.pink.opacity(0.15),
                                                  Theme.violet.opacity(0.15),
                                                  Theme.sky.opacity(0.15)],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                Image(systemName: icon)
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(Theme.pink600)
            }
            .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 10) {
                    Text(title)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Theme.ink)
                    StatusBadge(text: state.title, tint: state.tint,
                                pulsing: state == .running || state.isTransient)
                    Spacer(minLength: 0)
                }

                if let note {
                    Text(note)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.warn)
                } else if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.inkDesc)
                        .lineLimit(1)
                }

                if !metas.isEmpty {
                    HStack(spacing: 14) {
                        ForEach(metas, id: \.0) { MetaItem(label: $0.0, value: $0.1) }
                    }
                }

                HStack(spacing: 8) { actions }
                    .padding(.top, 3)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
    }
}
