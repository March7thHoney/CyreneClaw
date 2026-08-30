import SwiftUI

struct ConfigView: View {
    @ObservedObject var model: ServicesModel

    @State private var userId = ""
    @State private var displayName = ""
    @State private var dmEnabled = true
    @State private var cadenceEnabled = true
    @State private var replyEveryN = 10
    @State private var voiceEnabled = false
    @State private var modelName = ""
    @State private var schedule = ScheduleEntry.emptySlots
    @State private var hydrated = false
    @State private var saving = false
    @State private var saved = false

    private var dirty: Bool {
        let c = model.config
        return userId != c.ownerUserId || displayName != c.ownerDisplayName
            || dmEnabled != c.dmEnabled || cadenceEnabled != c.cadenceEnabled
            || replyEveryN != c.replyEveryN || voiceEnabled != c.voiceEnabled
            || modelName != c.model || schedule != c.schedule
    }

    var body: some View {
        VStack(spacing: 14) {
            discordSection.fadeUp(step: 2)
            cadenceSection.fadeUp(step: 3)
            scheduleSection.fadeUp(step: 3)
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
            toggle("私聊", $dmEnabled)
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

    private var scheduleSection: some View {
        section("定时消息", icon: "clock") {
            HStack(spacing: 10) {
                Spacer().frame(width: 30)
                Text("时间").frame(width: 62, alignment: .leading)
                Text("内容").frame(maxWidth: .infinity, alignment: .leading)
                Text("频道 ID，逗号分隔").frame(width: 200, alignment: .leading)
            }
            .font(.system(size: 11))
            .foregroundStyle(Theme.inkDesc)

            ForEach($schedule) { $entry in
                HStack(spacing: 10) {
                    Toggle("", isOn: $entry.enabled)
                        .labelsHidden().toggleStyle(.switch).tint(Theme.pink)
                        .scaleEffect(0.75).frame(width: 30)
                    TextField("12:00", text: $entry.time)
                        .textFieldStyle(.plain).modifier(InputBox()).frame(width: 62)
                    TextField("中午好♪", text: $entry.text)
                        .textFieldStyle(.plain).modifier(InputBox())
                    TextField("1234567890123456789", text: $entry.channels)
                        .textFieldStyle(.plain).modifier(InputBox()).frame(width: 200)
                }
            }

            Text("每天该时刻按原文发出，不经过模型，也不进入对话记忆。错过就跳过，不补发。")
                .font(.system(size: 11))
                .foregroundStyle(Theme.inkDesc)
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
            Text(saved && !dirty ? "已保存，已生效" : "保存后即刻生效")
                .font(.system(size: 12))
                .foregroundStyle(saved && !dirty ? Theme.ok : Theme.inkDesc)
            Spacer()
            Button("还原") { reset() }
                .buttonStyle(GhostButtonStyle())
                .disabled(!dirty || saving)
            Button("保存") { save() }
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
        dmEnabled = c.dmEnabled
        cadenceEnabled = c.cadenceEnabled
        replyEveryN = c.replyEveryN
        voiceEnabled = c.voiceEnabled
        modelName = c.model
        schedule = c.schedule
        saved = false
    }

    private func save() {
        saving = true
        Task {
            await model.saveConfig([
                "discord.owner.userId": userId,
                "discord.owner.displayName": displayName,
                "discord.dm.enabled": dmEnabled,
                "discord.cadence.enabled": cadenceEnabled,
                "discord.cadence.replyEveryN": replyEveryN,
                "voice.enabled": voiceEnabled,
                "llm.model": modelName,
                "discord.schedule": schedule.map { e -> [String: Any] in
                    [
                        "enabled": e.enabled,
                        "time": e.time.trimmingCharacters(in: .whitespaces),
                        "text": e.text,
                        // 中英文逗号、顿号、空格都当分隔符，粘贴过来什么样都能用
                        "channels": e.channels
                            .split(whereSeparator: { ",，、 ".contains($0) })
                            .map { $0.trimmingCharacters(in: .whitespaces) }
                            .filter { !$0.isEmpty },
                    ]
                },
            ])
            saving = false
            guard model.lastError == nil else { return }
            saved = true
            await model.reloadConfig()
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
