import SwiftUI

struct ConfigView: View {
    @ObservedObject var model: ServicesModel

    @State private var userId = ""
    @State private var displayName = ""
    @State private var proxy = ""
    @State private var dmEnabled = true
    @State private var cadenceEnabled = true
    @State private var replyEveryN = 10
    @State private var voiceEnabled = false
    @State private var logLevel = "info"
    @State private var modelName = ""
    @State private var hydrated = false
    @State private var saving = false
    @State private var saved = false

    private var dirty: Bool {
        let c = model.config
        return userId != c.ownerUserId || displayName != c.ownerDisplayName || proxy != c.proxy
            || dmEnabled != c.dmEnabled || cadenceEnabled != c.cadenceEnabled
            || replyEveryN != c.replyEveryN || voiceEnabled != c.voiceEnabled
            || logLevel != c.logLevel || modelName != c.model
    }

    var body: some View {
        VStack(spacing: 14) {
            discordSection.fadeUp(step: 0)
            cadenceSection.fadeUp(step: 1)
            voiceSection.fadeUp(step: 2)

            if let err = model.lastError {
                Text(err)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.bad)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 4)
            }

            actionBar.fadeUp(step: 3)
        }
        // 配置是异步读进来的，加载完成前不能拿默认值把表单填成空的
        .onAppear { hydrate() }
        .onChange(of: model.configLoaded) { hydrate() }
    }

    private var discordSection: some View {
        section("Discord", icon: "person.crop.circle") {
            field("主人用户 ID") {
                TextField("", text: $userId).textFieldStyle(.plain).modifier(InputBox())
            }
            field("称呼") {
                TextField("", text: $displayName).textFieldStyle(.plain).modifier(InputBox())
            }
            field("出站代理") {
                TextField("", text: $proxy).textFieldStyle(.plain).modifier(InputBox())
            }
            field("Bot Token") {
                Text(model.config.tokenConfigured ? "已配置" : "未配置")
                    .font(.system(size: 12.5))
                    .foregroundStyle(model.config.tokenConfigured ? Theme.ok : Theme.bad)
                Spacer()
            }
            toggle("私聊", $dmEnabled)
        }
    }

    private var cadenceSection: some View {
        section("群聊节奏", icon: "metronome") {
            toggle("节奏", $cadenceEnabled)
            field("阈值") {
                Stepper(value: $replyEveryN, in: 1...1000) {
                    Text("\(replyEveryN)")
                        .font(.system(size: 12.5, weight: .medium))
                        .foregroundStyle(Theme.ink)
                        .monospacedDigit()
                }
                .disabled(!cadenceEnabled)
                Spacer()
            }
        }
    }

    private var voiceSection: some View {
        section("语音与模型", icon: "slider.horizontal.3") {
            toggle("语音条", $voiceEnabled)
            field("模型") {
                TextField("", text: $modelName).textFieldStyle(.plain).modifier(InputBox())
            }
            field("日志级别") {
                Picker("", selection: $logLevel) {
                    ForEach(["debug", "info", "warn", "error"], id: \.self) { Text($0).tag($0) }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .frame(maxWidth: 260)
            }
        }
    }

    private var actionBar: some View {
        HStack(spacing: 10) {
            if saved && !dirty {
                Text("已保存")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.ok)
            }
            Spacer()
            Button("还原") { reset() }
                .buttonStyle(GhostButtonStyle())
                .disabled(!dirty || saving)
            Button("保存") { save(restart: false) }
                .buttonStyle(GhostButtonStyle())
                .disabled(!dirty || saving)
            Button("保存并重启") { save(restart: true) }
                .buttonStyle(BrandButtonStyle())
                .disabled(!dirty || saving)
        }
        .padding(.horizontal, 4)
    }

    private func hydrate() {
        guard model.configLoaded, !hydrated else { return }
        hydrated = true
        reset()
    }

    private func reset() {
        let c = model.config
        userId = c.ownerUserId
        displayName = c.ownerDisplayName
        proxy = c.proxy
        dmEnabled = c.dmEnabled
        cadenceEnabled = c.cadenceEnabled
        replyEveryN = c.replyEveryN
        voiceEnabled = c.voiceEnabled
        logLevel = c.logLevel
        modelName = c.model
        saved = false
    }

    private func save(restart: Bool) {
        saving = true
        Task {
            await model.saveConfig([
                "discord.owner.userId": userId,
                "discord.owner.displayName": displayName,
                "discord.proxy": proxy,
                "discord.dm.enabled": dmEnabled,
                "discord.cadence.enabled": cadenceEnabled,
                "discord.cadence.replyEveryN": replyEveryN,
                "voice.enabled": voiceEnabled,
                "log.level": logLevel,
                "llm.model": modelName,
            ])
            saving = false
            guard model.lastError == nil else { return }
            saved = true
            await model.reloadConfig()
            if restart {
                model.restartBot()
                model.configDirty = false
            }
        }
    }

    @ViewBuilder
    private func section<C: View>(_ title: String, icon: String, @ViewBuilder content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.pink600)
                Text(title)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.ink)
            }
            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard(hoverable: false)
    }

    @ViewBuilder
    private func field<C: View>(_ label: String, @ViewBuilder content: () -> C) -> some View {
        HStack(spacing: 12) {
            Text(label)
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.inkDesc)
                .frame(width: 84, alignment: .leading)
            content()
        }
    }

    @ViewBuilder
    private func toggle(_ label: String, _ value: Binding<Bool>) -> some View {
        field(label) {
            Toggle("", isOn: value).labelsHidden().toggleStyle(.switch).tint(Theme.pink)
            Spacer()
        }
    }
}

// 输入框统一成玻璃描边款，和按钮同一套圆角
private struct InputBox: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.system(size: 12.5))
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.white.opacity(0.7)))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Color(hex: 0xFCE7F3), lineWidth: 1))
    }
}
