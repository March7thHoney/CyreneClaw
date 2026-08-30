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
    @State private var modelName = ""
    @State private var hydrated = false
    @State private var saving = false
    @State private var saved = false

    private var dirty: Bool {
        let c = model.config
        return userId != c.ownerUserId || displayName != c.ownerDisplayName || proxy != c.proxy
            || dmEnabled != c.dmEnabled || cadenceEnabled != c.cadenceEnabled
            || replyEveryN != c.replyEveryN || voiceEnabled != c.voiceEnabled
            || modelName != c.model
    }

    var body: some View {
        VStack(spacing: 14) {
            discordSection.fadeUp(step: 2)
            cadenceSection.fadeUp(step: 3)
            HStack(alignment: .top, spacing: 14) {
                modelSection
                voiceSection
            }
            .fadeUp(step: 3)

            if let err = model.lastError {
                Text(err)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.bad)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 4)
            }

            actionBar.fadeUp(step: 4)
        }
        // 配置是异步读进来的，加载完成前不能拿默认值把表单填成空的
        .onAppear { hydrate() }
        .onChange(of: model.configLoaded) { hydrate() }
    }

    private var discordSection: some View {
        section("Discord", icon: "person.crop.circle") {
            duo {
                field("主人用户 ID") {
                    TextField("", text: $userId).textFieldStyle(.plain).modifier(InputBox())
                }
            } _: {
                field("称呼") {
                    TextField("", text: $displayName).textFieldStyle(.plain).modifier(InputBox())
                }
            }
            duo {
                field("出站代理") {
                    TextField("", text: $proxy).textFieldStyle(.plain).modifier(InputBox())
                }
            } _: {
                toggle("私聊", $dmEnabled)
            }
        }
    }

    private var cadenceSection: some View {
        section("群聊节奏", icon: "metronome") {
            duo {
                toggle("节奏", $cadenceEnabled)
            } _: {
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
    }

    private var modelSection: some View {
        section("模型", icon: "cpu") {
            field("模型") {
                Picker("", selection: $modelName) {
                    ForEach(model.modelOptions, id: \.self) { Text($0).tag($0) }
                }
                .pickerStyle(.menu)
                .labelsHidden()
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private var voiceSection: some View {
        section("语音", icon: "waveform") {
            toggle("语音条", $voiceEnabled)
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
        .padding(16)
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

    // 两列并排，窗口窄到放不下就退回单列
    @ViewBuilder
    private func duo<A: View, B: View>(@ViewBuilder _ a: () -> A,
                                       @ViewBuilder _ b: () -> B) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 18) {
                a().frame(minWidth: 290, maxWidth: .infinity)
                b().frame(minWidth: 290, maxWidth: .infinity)
            }
            VStack(alignment: .leading, spacing: 10) { a(); b() }
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
