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
    @State private var reaction: [String: String] = [:]
    @State private var expressions: [String] = []
    @State private var expressionGuild = ""
    @State private var hydrated = false
    @State private var saving = false
    @State private var saved = false

    private var dirty: Bool {
        let c = model.config
        return userId != c.ownerUserId || displayName != c.ownerDisplayName
            || dmEnabled != c.dmEnabled || cadenceEnabled != c.cadenceEnabled
            || replyEveryN != c.replyEveryN || voiceEnabled != c.voiceEnabled
            || modelName != c.model || !ScheduleEntry.sameStored(schedule, c.schedule)
            || reaction != c.reaction || expressions != c.expressions
    }

    var body: some View {
        VStack(spacing: 14) {
            discordSection.fadeUp(step: 2)
            cadenceSection.fadeUp(step: 3)
            scheduleSection.fadeUp(step: 3)
            reactionSection.fadeUp(step: 3)
            expressionSection.fadeUp(step: 3)
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
                Text("服务器").frame(width: 140, alignment: .leading)
                Text("频道").frame(width: 140, alignment: .leading)
                Text("类型").frame(width: 78, alignment: .leading)
                Text("内容").frame(maxWidth: .infinity, alignment: .leading)
            }
            .font(.system(size: 11))
            .foregroundStyle(Theme.inkDesc)

            ForEach($schedule) { $entry in
                ScheduleRow(entry: $entry, directory: model.directory, dataDir: model.config.dataDir)
            }

            Text("每天该时刻发出一条文字、表情或贴纸，不经过模型，也不进入对话记忆。错过就跳过，不补发。")
                .font(.system(size: 11))
                .foregroundStyle(Theme.inkDesc)

            if !model.directoryLoaded {
                Text("服务器、频道、表情、贴纸的清单由在线的机器人生成，启动机器人后可选。")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.warn)
            }
        }
    }

    // 清单里的服务器，加上配置里有而清单里暂时没有的，后者按 ID 兜底显示
    private var reactionTargets: [ReactionTarget] {
        var out = model.directory.guilds.map { ReactionTarget(id: $0.id, name: $0.name, emojis: $0.emojis) }
        let known = Set(out.map { $0.id })
        for id in reaction.keys.filter({ !known.contains($0) }).sorted() {
            out.append(ReactionTarget(id: id, name: id, emojis: []))
        }
        return out
    }

    private func reactionBinding(_ guildId: String) -> Binding<String> {
        Binding(get: { reaction[guildId] ?? "" }, set: { next in
            // 不反应在配置里就是这个服务器整个缺席
            if next.isEmpty { reaction.removeValue(forKey: guildId) } else { reaction[guildId] = next }
        })
    }

    private var reactionSection: some View {
        section("表情反应", icon: "face.smiling") {
            if reactionTargets.isEmpty {
                Text("服务器清单由在线的机器人生成，启动机器人后可选。")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.warn)
            } else {
                HStack(spacing: 10) {
                    Text("服务器").frame(width: 200, alignment: .leading)
                    Text("表情").frame(maxWidth: .infinity, alignment: .leading)
                }
                .font(.system(size: 11))
                .foregroundStyle(Theme.inkDesc)

                ForEach(reactionTargets) { target in
                    ReactionRow(target: target, token: reactionBinding(target.id), dataDir: model.config.dataDir)
                }
            }

            Text("回复发出后，给触发这一轮的那条消息加上该服务器的表情。@ 提及与群聊节奏都算，私聊没有这一步。")
                .font(.system(size: 11))
                .foregroundStyle(Theme.inkDesc)
        }
    }

    private var expressionGuildValue: DirGuild? {
        model.directory.guild(id: expressionGuild) ?? model.directory.guilds.first
    }

    private func addExpression(_ key: String) {
        guard !expressions.contains(key), expressions.count < 50 else { return }
        expressions.append(key)
    }

    private var expressionSection: some View {
        section("本机聊天表情包", icon: "face.smiling.inverse") {
            if !expressions.isEmpty {
                ExpressionPoolGrid(keys: expressions, directory: model.directory, dataDir: model.config.dataDir) { key in
                    expressions.removeAll { $0 == key }
                }
            }
            if model.directory.isEmpty {
                Text("表情、贴纸的清单由在线的机器人生成，启动机器人后可选。")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.warn)
            } else {
                HStack(spacing: 10) {
                    Picker("", selection: $expressionGuild) {
                        ForEach(model.directory.guilds) { Text($0.name).tag($0.id) }
                    }
                    .pickerStyle(.menu).labelsHidden().frame(width: 200)
                    ExpressionPickButton(dataDir: model.config.dataDir, label: "添加表情", picked: false, image: "") { dismiss in
                        EmojiPickerPanel(dataDir: model.config.dataDir, emojis: expressionGuildValue?.emojis ?? []) { e in
                            addExpression(e.token)
                            dismiss()
                        }
                    }
                    .frame(width: 140)
                    ExpressionPickButton(dataDir: model.config.dataDir, label: "添加贴纸", picked: false, image: "") { dismiss in
                        StickerPickerPanel(dataDir: model.config.dataDir, stickers: expressionGuildValue?.stickers ?? []) { s in
                            addExpression(s.id)
                            dismiss()
                        }
                    }
                    .frame(width: 140)
                    Spacer()
                }
                .onAppear { if expressionGuild.isEmpty { expressionGuild = model.directory.guilds.first?.id ?? "" } }
            }

            Text("本机聊天里每条回复发完后，从这个池子里均匀随机附一张，最多 50 张。列表为空即不附。")
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
        reaction = c.reaction
        expressions = c.expressions
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
                        "kind": e.kind.rawValue,
                        "text": e.text,
                        "emoji": e.emoji,
                        "sticker": e.sticker,
                        // 界面上一条只选一个频道，配置里仍是数组
                        "channels": (e.channelId.isEmpty ? [] : [e.channelId]) as [String],
                    ]
                },
                "discord.reaction": reaction,
                "localChat.expressions": expressions,
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

// 一行里有两个各自独立的选图面板，拆成单独的视图才好各管各的开关状态
private struct ScheduleRow: View {
    @Binding var entry: ScheduleEntry
    let directory: DiscordDirectory
    let dataDir: URL?

    // 配置里只存频道，清单加载好之后服务器就能反查出来
    private var guildId: String {
        entry.guildId.isEmpty ? (directory.guildOf(channelId: entry.channelId)?.id ?? "") : entry.guildId
    }

    private var guild: DirGuild? { directory.guild(id: guildId) }

    // 换服务器等于换一整套频道、表情、贴纸，旧的选择留着只会发到错的地方
    private var guildBinding: Binding<String> {
        Binding(get: { guildId }, set: { next in
            guard next != guildId else { return }
            entry.guildId = next
            entry.channelId = ""
            entry.emoji = ""
            entry.sticker = ""
        })
    }

    var body: some View {
        HStack(spacing: 10) {
            Toggle("", isOn: $entry.enabled)
                .labelsHidden().toggleStyle(.switch).tint(Theme.pink)
                .scaleEffect(0.75).frame(width: 30)
            TextField("12:00", text: $entry.time)
                .textFieldStyle(.plain).modifier(InputBox()).frame(width: 62)
            guildPicker.frame(width: 140)
            channelPicker.frame(width: 140)
            kindPicker.frame(width: 78)
            content.frame(maxWidth: .infinity)
        }
    }

    private var guildPicker: some View {
        Picker("", selection: guildBinding) {
            Text(directory.isEmpty ? "启动机器人后可选" : "未选择").tag("")
            ForEach(directory.guilds) { Text($0.name).tag($0.id) }
        }
        .pickerStyle(.menu).labelsHidden()
        .disabled(directory.isEmpty)
    }

    private var channelPicker: some View {
        Picker("", selection: $entry.channelId) {
            Text("未选择").tag("")
            // 清单还没生成时把配置里的原始 ID 摆出来，存量配置才不会在界面上凭空消失
            if !entry.channelId.isEmpty && directory.channel(id: entry.channelId) == nil {
                Text(entry.channelId).tag(entry.channelId)
            }
            ForEach(guild?.channels ?? []) { Text("#\($0.name)").tag($0.id) }
        }
        .pickerStyle(.menu).labelsHidden()
        .disabled(guild == nil)
    }

    private var kindPicker: some View {
        Picker("", selection: $entry.kind) {
            ForEach(ScheduleKind.allCases) { Text($0.label).tag($0) }
        }
        .pickerStyle(.menu).labelsHidden()
    }

    @ViewBuilder
    private var content: some View {
        switch entry.kind {
        case .text:
            TextField("中午好♪", text: $entry.text).textFieldStyle(.plain).modifier(InputBox())
        case .emoji:
            ExpressionPickButton(dataDir: dataDir, label: emojiLabel.0, picked: emojiLabel.1,
                                 image: emojiImage, disabled: guild == nil) { dismiss in
                EmojiPickerPanel(dataDir: dataDir, emojis: guild?.emojis ?? []) { e in
                    entry.emoji = e.token
                    dismiss()
                }
            }
        case .sticker:
            ExpressionPickButton(dataDir: dataDir, label: stickerLabel.0, picked: stickerLabel.1,
                                 image: stickerImage, disabled: guild == nil) { dismiss in
                StickerPickerPanel(dataDir: dataDir, stickers: guild?.stickers ?? []) { s in
                    entry.sticker = s.id
                    dismiss()
                }
            }
        }
    }

    // 第二个值表示这一格已经选好了，用来分深浅两档字色
    private var emojiLabel: (String, Bool) {
        if let e = guild?.emojis.first(where: { $0.token == entry.emoji }) { return (":\(e.name):", true) }
        if !entry.emoji.isEmpty { return ("已失效", false) }
        return (guild == nil ? "先选频道" : "选择表情", false)
    }

    private var emojiImage: String {
        guild?.emojis.first { $0.token == entry.emoji }?.image ?? ""
    }

    private var stickerLabel: (String, Bool) {
        if let s = guild?.stickers.first(where: { $0.id == entry.sticker }) { return (s.name, true) }
        if !entry.sticker.isEmpty { return ("已失效", false) }
        return (guild == nil ? "先选频道" : "选择贴纸", false)
    }

    private var stickerImage: String {
        guild?.stickers.first { $0.id == entry.sticker }?.image ?? ""
    }
}

// 一个服务器一行，表情只能从这个服务器里挑
private struct ReactionTarget: Identifiable {
    let id: String
    let name: String
    let emojis: [DirEmoji]
}

private struct ReactionRow: View {
    let target: ReactionTarget
    @Binding var token: String
    let dataDir: URL?

    var body: some View {
        HStack(spacing: 10) {
            Text(target.name)
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.ink)
                .lineLimit(1)
                .frame(width: 200, alignment: .leading)
            ExpressionPickButton(dataDir: dataDir, label: label.0, picked: label.1, image: image) { dismiss in
                EmojiPickerPanel(dataDir: dataDir, emojis: target.emojis, onClear: {
                    token = ""
                    dismiss()
                }) { e in
                    token = e.token
                    dismiss()
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    // 第二个值表示这一格已经选好了，用来分深浅两档字色
    private var label: (String, Bool) {
        if let e = target.emojis.first(where: { $0.token == token }) { return (":\(e.name):", true) }
        if !token.isEmpty { return ("已失效", false) }
        return ("不反应", false)
    }

    private var image: String {
        target.emojis.first { $0.token == token }?.image ?? ""
    }
}
