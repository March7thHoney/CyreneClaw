import AppKit
import SwiftUI

struct ServicesView: View {
    @ObservedObject var model: ServicesModel

    var body: some View {
        VStack(spacing: 14) {
            botCard.fadeUp(step: 0)
            bridgeCard.fadeUp(step: 1)
            voiceCard.fadeUp(step: 2)

            if let err = model.lastError {
                Text(err)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.bad)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 4)
            }

            Spacer(minLength: 0)
            footer.fadeUp(step: 3)
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

    private var bridgeCard: some View {
        ServiceCard(
            icon: "cpu",
            title: "st-claude-cli-bridge",
            subtitle: model.bridgeModel ?? "未响应",
            state: model.bridge,
            metas: metas([("PID", model.bridgePid.map(String.init)),
                          ("队列", model.bridgeQueue)]),
            note: model.bridgeInstalled ? nil : "常驻服务未安装"
        ) {
            if model.bridgeInstalled {
                if model.bridge == .running {
                    Button("重启") { model.restartBridge() }
                        .buttonStyle(BrandButtonStyle(compact: true))
                    Button("停止") { model.stopBridge() }
                        .buttonStyle(GhostButtonStyle(compact: true, danger: true))
                } else {
                    Button("启动") { model.startBridge() }
                        .buttonStyle(BrandButtonStyle(compact: true))
                }
            }
        }
        .disabled(model.busy.contains("bridge"))
    }

    private var voiceCard: some View {
        ServiceCard(
            icon: "waveform",
            title: "GPT-SoVITS 语音",
            subtitle: model.config.voiceEndpoint,
            state: model.voice,
            metas: metas([("PID", model.voicePid.map(String.init))]),
            note: nil
        ) {
            if !model.config.voiceEnabled {
                Button("启用语音") { model.enableVoice() }
                    .buttonStyle(BrandButtonStyle(compact: true))
            } else if model.voice == .running {
                Button("停止") { model.stopVoice() }
                    .buttonStyle(GhostButtonStyle(compact: true, danger: true))
            } else {
                Button("启动") { model.startVoice() }
                    .buttonStyle(BrandButtonStyle(compact: true))
            }
            if let h = model.hint["voice"] { spinner(h) }
        }
        .disabled(model.busy.contains("voice") && model.voice != .starting)
        .opacity(model.config.voiceEnabled ? 1 : 0.75)
    }

    private var footer: some View {
        HStack(spacing: 10) {
            Text(model.root?.path ?? "未定位项目")
                .font(.system(size: 11))
                .foregroundStyle(Theme.inkMeta)
                .lineLimit(1)
                .truncationMode(.head)
            Spacer(minLength: 8)
            Button("在 Finder 中打开") {
                if let root = model.root { NSWorkspace.shared.open(root) }
            }
            .buttonStyle(GhostButtonStyle(compact: true))
            Button("更改…") {
                if let url = ProjectRoot.chooseInteractively() { model.setRoot(url) }
            }
            .buttonStyle(GhostButtonStyle(compact: true))
        }
        .padding(.horizontal, 4)
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
