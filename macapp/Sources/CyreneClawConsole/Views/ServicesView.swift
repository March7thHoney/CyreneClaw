import AppKit
import SwiftUI

struct ServicesView: View {
    @ObservedObject var model: ServicesModel

    var body: some View {
        VStack(spacing: 10) {
            botCard.fadeUp(step: 0)
            dependencyStrip.fadeUp(step: 1)

            if let err = model.lastError {
                Text(err)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.bad)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 4)
            }
        }
    }

    private var botCard: some View {
        let installed = model.bot != .notInstalled
        return ServiceCard(
            icon: "bubble.left.and.text.bubble.right",
            title: "昔涟 · Discord 机器人",
            subtitle: model.botLogin ?? "未连接",
            state: model.bot,
            metas: metas([("PID", model.botPid.map(String.init)),
                          ("启动", model.botRuns.map(String.init)),
                          ("上次退出", model.botLastExit.flatMap { $0 == 0 ? nil : String($0) })]),
            note: model.configDirty ? "需重启生效" : nil
        ) {
            if installed {
                if model.bot == .running {
                    Button("重启") { model.restartBot() }
                        .buttonStyle(BrandButtonStyle(compact: true))
                    Button("停止") { model.stopBot() }
                        .buttonStyle(GhostButtonStyle(compact: true, danger: true))
                } else {
                    Button("启动") { model.startBot() }
                        .buttonStyle(BrandButtonStyle(compact: true))
                }
            } else {
                Button("安装常驻服务") { model.installBotService() }
                    .buttonStyle(BrandButtonStyle(compact: true))
            }
            if let h = model.hint["bot"] { spinner(h) }
        }
        .disabled(model.busy.contains("bot"))
    }

    // bridge 常驻自启、语音由 bot 按需拉起，都不需要手动控制，只报状态
    private var dependencyStrip: some View {
        HStack(spacing: 20) {
            dependency("bridge", model.bridge, bridgeDetail)
            dependency("语音", model.voice, shortHost(model.config.voiceEndpoint))
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 6)
    }

    private var bridgeDetail: String? {
        guard let m = model.bridgeModel else { return nil }
        guard let q = model.bridgeQueue else { return m }
        return "\(m) · 队列 \(q)"
    }

    private func dependency(_ name: String, _ state: ServiceState, _ detail: String?) -> some View {
        HStack(spacing: 7) {
            Circle().fill(state.tint).frame(width: 7, height: 7)
            Text(name)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.inkBody)
            Text(state.title)
                .font(.system(size: 11.5))
                .foregroundStyle(state.tint)
            if let detail, !detail.isEmpty {
                Text(detail)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Theme.inkMeta)
                    .lineLimit(1)
            }
        }
    }

    private func shortHost(_ endpoint: String) -> String? {
        guard let u = URL(string: endpoint), let host = u.host else { return nil }
        return u.port.map { "\(host):\($0)" } ?? host
    }

    private func spinner(_ text: String) -> some View {
        HStack(spacing: 6) {
            ProgressView().controlSize(.small).scaleEffect(0.7)
            Text(text).font(.system(size: 11.5)).foregroundStyle(Theme.inkMeta)
        }
    }

    private func metas(_ items: [(String, String?)]) -> [(String, String)] {
        items.compactMap { k, v in v.map { (k, $0) } }
    }
}
