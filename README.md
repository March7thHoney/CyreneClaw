# CyreneClaw

Discord 上的 AI 角色扮演机器人。以 SillyTavern（酒馆）的提示词组装方式为基础，
后端复用本地的 `st-claude-cli-bridge`（`claude -p`）。

只做对话。可选开启本地 TTS，给角色台词补一条 Discord 原生语音条。

## 特点

- **复用酒馆的现成配置**：直接读取酒馆目录下的角色卡（PNG 内嵌 v2/v3）、
  OpenAI 预设、世界书，全程只读。
- **对齐酒馆的组装行为**：prompt_order、marker、对话示例拆分、深度注入、
  `squashSystemMessages`、`strict` 后处理，与酒馆产出的请求逐字节一致。
- **Discord 上只显示台词**：动作与场景描写留在上下文里，供下一轮使用。
- **每个频道独立上下文**：私聊按用户、服务器按频道各自存档。
- **控制台内直接对话**：本机聊天页显示模型原文，台词与场景描写分色，独立存档。
- **只回应机器人主人**：按用户 ID 精确匹配。
- **原生语音条**：本地 GPT-SoVITS 合成角色声音，以带波形的原生语音消息发出，
  合成走后台串行队列。

## 依赖

- Node.js >= 20
- SillyTavern 数据目录（只读取，酒馆本身可以关着）
- 运行中的 `st-claude-cli-bridge`
- 仅开启语音时：`ffmpeg` / `ffprobe`（`brew install ffmpeg`）、
  GPT-SoVITS 运行时与对应的 Python 环境

## 配置

```bash
cp config.example.json config.json
```

然后填写 `config.json`（该文件已在 `.gitignore` 中）：

| 字段 | 说明 |
|---|---|
| `discord.token` | Bot Token |
| `discord.proxy` | 出站代理，留空则直连 |
| `discord.owner.userId` | 你的 Discord 用户 ID，只有这个人能触发机器人 |
| `discord.owner.displayName` | 角色对你的称呼，用于 `{{user}}` |
| `discord.guilds` | 允许的服务器，每个可单独设 `requireMention`、`replyEveryN` |
| `discord.cadence.enabled` | 群聊节奏总开关，关闭后仅 @ 或回复触发 |
| `discord.cadence.replyEveryN` | 你在一个频道里连说多少条没被回应的话，角色强制回一次 |
| `discord.images.enabled` | 图片输入总开关 |
| `discord.images.maxPerMessage` | 单条消息最多读取的图片数，默认 4 |
| `discord.images.maxBytes` | 单张图片的字节上限，默认 10 MB |
| `discord.images.maxPerRequest` | 每次生成最多附带的图片数，默认 6 |
| `discord.images.retentionDays` | 图片文件的保留天数，默认 7 |
| `discord.schedule` | 定时消息，最多 5 条，文字、表情或贴纸，见下文 |
| `localChat.port` | 本机聊天服务的回环端口，缺省 5610 |
| `sillytavern.dataDir` | 酒馆的 `data/default-user` 目录 |
| `sillytavern.characterFile` / `presetFile` / `worldBooks` | 相对该目录的资源路径 |
| `prompt.personaDescription` | Discord 专用 persona |
| `prompt.discordContract` | 输出契约，要求每轮都有台词 |
| `prompt.tailContract` | 长度契约，追加在整段提示词的最后 |
| `llm.baseUrl` / `model` | 指向 bridge |
| `voice.enabled` | 语音总开关，关闭后跳过 TTS |
| `voice.dir` | 语音资源根目录，默认项目内 `voice/`（已忽略） |
| `voice.python` | GPT-SoVITS 环境的 python 绝对路径 |
| `voice.model.*` | 相对 `voice.dir` 的权重、参考音频与参考文本 |
| `voice.maxChars` | 单条语音的朗读上限，超出按标点回退截断 |

## 运行

```bash
npm install
node src/index.js
```

常驻（macOS launchd）：

```bash
node scripts/install-service.mjs     # 生成 plist 到 ~/Library/LaunchAgents 并加载
node scripts/uninstall-service.mjs   # 卸载
```

plist 由脚本按当前环境生成。
`RunAtLoad` 使其在登录后自动启动，异常退出会被自动拉起。
node 路径优先取软链。

注意：机器人依赖 bridge 生成回复，两者都要常驻才能在重启后可用。

## 控制台 App

`macapp/` 下是一个原生 SwiftUI 的 macOS 控制台，两页：控制台页管服务状态、机器人启停与
`config.json` 的常用几项，聊天页在本机直接和角色对话。navbar 右侧的胶囊切页，停在哪一页记进偏好。
界面风格取自昔涟的官网。

```bash
bash macapp/build.sh          # 构建并替换 /Applications 里的 app
bash macapp/build.sh --icon   # 顺带重新生成图标，需要 ImageMagick
```

产物在 `macapp/build/`，构建完会自动装到 `/Applications`，传 `--no-install` 可跳过。
ad-hoc 签名，本机双击即开。

- **状态与启停**：机器人走 launchd 启停（`launchctl kickstart` / `kill SIGTERM`）。
  停止发 SIGTERM，保留 launchd 里的服务注册。
  bridge 为独立常驻服务，语音由 `voice.autoStart` 按需拉起，两者在机器人卡片下方报状态。
- **模型下拉**：候选来自 bridge 的 `/v1/models`，bridge 改了清单这里自动跟上；
  拉不到时退回内置清单，当前值始终保留在列表里。
- **项目根目录**：依次从偏好、`com.cyreneclaw.bot.plist` 的 `WorkingDirectory`、
  app 所在位置推断，全部失败时弹出目录选择。
- **定时消息**：服务器、频道、类型三个下拉，内容按类型切换成输入框、表情面板或贴纸面板。
  面板里的图取自本地缓存的表情与贴纸，见下文「服务器与表情清单」。
  清单尚未生成时下拉禁用，提示先启动机器人。
- **配置编辑**：写回由 `scripts/config-set.mjs` 完成，白名单覆盖 10 项，token 与各类路径为只读。
  界面给出其中 8 项，`log.level` 与 `discord.proxy` 留给脚本。
- **即存即生效**：机器人监听 `config.json`，白名单里 `discord.proxy` 以外的 9 项保存后立即生效。
  `discord.proxy` 于下次启动时生效。

```bash
node scripts/config-set.mjs --get              # 读当前值，token 只报是否已配置
node scripts/config-set.mjs log.level=debug    # 也可以在终端直接改
```

写回先写临时文件再 rename，JSON 保序。`voice.synth` 里的 `1.0` 会被写成 `1`。

## 本机聊天

控制台 App 的聊天页，在本机直接和角色对话，全程不经过 Discord。

```
模型原文 ├─→ 原样存入 data/chats/local/main.jsonl
        └─→ 按「」切成台词与场景描写两种片段 → App 里分色显示
```

台词用深墨色并保留 `「」`，场景描写用淡紫斜体，同一个气泡里内联混排。
切分复用 Discord 那条链路的 `scanQuotes` 与三重约束，App 上标成台词的字与 Discord 发出去的逐字相同。

- **独立存档**：`data/chats/local/main.jsonl`，与私聊、频道的记忆各记各的。
  清空走「清空」按钮，旧记录归档到 `data/archive/local/main/`。
- **提示词**：不注入 `prompt.discordContract` 与 `prompt.tailContract`，
  描写按角色卡与预设的原生形态展开。其余组装与 Discord 完全一致。
- **语音**：每条回复右上角一个喇叭，点了才合成并在 App 里播放，跟随 `voice.enabled`。
  朗读文本与 Discord 语音条同一条链路，只念台词。
- **回车发送**，Shift+回车换行。
- **图片**：「图片」按钮选文件、从访达拖入、或粘贴剪贴板里的图，一条最多 4 张。
  落盘到 `data/images/local/main/`，张数、大小与保留天数沿用 `discord.images`，过期后气泡里只剩占位块。

服务随机器人进程启动，只听 `127.0.0.1:<localChat.port>`，缺省 5610。
Discord 连不上时本机聊天照常可用。

| 方法 路径 | 说明 |
|---|---|
| `GET /local/health` | 角色名与语音开关状态 |
| `GET /local/history` | 全部记录，角色那几条附带切分结果 |
| `POST /local/chat` | `{"text": "…", "images": [{"name", "mime", "data"}]}`，`data` 为 base64，SSE 流式返回 |
| `POST /local/clear` | 归档当前记忆 |
| `POST /local/speak` | `{"text": "…"}`，返回 wav 字节 |

来源非回环、Host 头不是 `127.0.0.1`/`localhost`、带 `Origin` 头的请求一律 403。

## 触发方式

| 场景 | 条件 |
|---|---|
| 私聊 | 直接说话即可 |
| 服务器频道 | @ 机器人，或回复它自己的消息 |
| 服务器频道（节奏） | 你连说满 `replyEveryN` 条没被回应的话（默认 10），第 N 条强制触发 |
| 纯图片消息 | 与文字消息相同，以上三种场景均可触发 |
| 清空当前频道记忆 | 斜杠命令 `/clear`（旧记录归档保留） |

服务器频道里其他人的发言作为现场氛围注入上下文，机器人只回应主人。

群聊节奏只统计主人本人的发言，按频道各自计数：被 @ 或被回复而正常触发时计数清零，
`/clear` 也清零。计数只在内存里，重启归零。节奏触发的那一轮与普通一轮相同：
第 N 条就是这轮的输入，之前被跳过的话和其他人的发言已经在现场氛围里。
某个服务器想用不同的阈值，在它的 `discord.guilds` 条目里加 `replyEveryN` 即可覆盖全局值。

## 图片输入

消息里的 png、jpeg、gif、webp 附件随正文一起进入对话，私聊、@ 触发与节奏触发三条路径相同。
单条消息最多读取 `maxPerMessage` 张，超过 `maxBytes` 的跳过。回复一条带图的消息时，被回复的图片一并带入本轮。

图片下载到 `chat.dataDir/images/<scope>/<消息ID>-<序号>.<ext>`，聊天记录里只存路径。
每次生成从最新一条往前最多附带 `maxPerRequest` 张，其余在该条正文末尾以 `[图片×n]` 标记。
频道氛围里带图的发言同样以 `[图片×n]` 标记。
超过 `retentionDays` 的图片文件在启动时与每 6 小时的清理中删除，文件缺失的图片退化为文字标记。

bridge 收到的是 OpenAI 格式的 `image_url` 内容块，落盘后由 CLI 用 Read 工具读取，每张图一次工具调用。
bridge 的 `logPrompts` 开启时，其请求日志包含图片的 base64 内容。

## 定时消息

每天固定时刻往指定频道发送一条文字、一个表情或一张贴纸，最多 5 条，
在控制台 App 的「定时消息」里配置。

```json
"schedule": [
  { "enabled": true, "time": "12:00", "kind": "text", "text": "中午好♪", "emoji": "", "sticker": "", "channels": ["频道 ID"] },
  { "enabled": true, "time": "22:00", "kind": "emoji", "text": "", "emoji": "<:castorice_crying:1513417499050381322>", "sticker": "", "channels": ["频道 ID"] },
  { "enabled": true, "time": "23:00", "kind": "sticker", "text": "", "emoji": "", "sticker": "1480641062551814155", "channels": ["频道 ID"] }
]
```

| 字段 | 说明 |
|---|---|
| `enabled` | 该条的开关 |
| `time` | 24 小时制 `HH:MM`，小时补零 |
| `kind` | `text` / `emoji` / `sticker`，缺省为 `text` |
| `text` | `kind` 为 `text` 时原文发出的内容，上限 1000 字 |
| `emoji` | `kind` 为 `emoji` 时的自定义表情，形如 `<:名字:ID>`，动图为 `<a:名字:ID>` |
| `sticker` | `kind` 为 `sticker` 时的贴纸 ID |
| `channels` | 频道 ID 数组，控制台每条写入一个 |

`kind` 决定这一条读哪个字段，另外两个字段留空。表情与贴纸取自目标频道所在的服务器。

发送路径为「按 ID 取频道 → 发送 → 语音条」，`kind` 为 `text` 时才走语音，跟随 `voice.enabled`。
会话记忆与群聊节奏计数保持原状。

时刻按机器人进程的本地时间计算，launchd 的 plist 固定 `TZ=Asia/Shanghai`。
调度器每 30 秒检查一次，与整分匹配：进程在目标分钟之内启动仍会发出，跨过整分则等次日。

时间格式、频道 ID、当前 `kind` 的内容不合法的条目在启动时跳过并记警告，机器人照常登录。
界面固定 5 槽，关闭的槽位作为占位保留行号。

## 表情反应

回复发出后，给触发这一轮的那条消息加一个该服务器的自定义表情，
在控制台 App 的「表情反应」里配置。

```json
"reaction": {
  "服务器 ID": "<:castorice_crying:1513417499050381322>"
}
```

一个服务器一项，值取自该服务器的自定义表情，形如 `<:名字:ID>`，动图为 `<a:名字:ID>`。
缺席该服务器即不反应，缺省为空。上限 20 项。

@ 提及、回复机器人与群聊节奏三条触发路径共用这一步，落点是这轮输入里的最后一条消息。
私聊没有这一步。

服务器 ID 或表情形式不合法的项在启动时跳过并记警告，机器人照常登录。
反应失败只记警告，这一轮的文字与语音照常发出。
需要目标频道的 `AddReactions` 权限。

### 服务器与表情清单

机器人在线时把所在服务器、可发言的频道、自定义表情与贴纸写成
`<chat.dataDir>/discord-directory.json`，表情与贴纸的图片下载到
`<chat.dataDir>/expressions/`，按 ID 命名，已存在的不重下。
登录时生成一份，服务器、频道、表情、贴纸有变动时防抖 3 秒重出。
控制台 App 只读这两处，下拉与选图面板的内容全部来自它们。

## 输出处理

```
模型原文 ├─→ 原样存入 jsonl（含动作描写，作为下一轮的上下文）
        └─→ 剥离自查注释 → 抽取台词 → 过滤 ├─→ 分段 → 发送文字
                                          └─→ 洗成朗读文本 → 后台合成 → 语音条
```

台词抽取只保留 `「」` 内的内容：同一段内的多句并成一行，段与段之间换行。
判定带三重约束，排除 `「岁月」神像` 这类专名。
若某轮完全抽不到台词，按 `format.onNoDialogue` 处理（默认静默跳过）。

回复长度全靠提示词压，抽出来的台词一句不删。`prompt.discordContract` 注在 D0 管格式，
把 `「」` 外的描写限制在一到两句；`prompt.tailContract` 追加在预设尾部之后，占住整段
提示词的最末，声明自己优先于预设里的长篇写作要求。角色卡的开场白与对话示例本身就是
目标形态：三段台词，一百二十字内。

## 语音

台词发出后会再补一条 Discord 原生语音条（紫色波形气泡）。
Discord 的语音条单独成条，位置在文字之后。

文字可能分成几段，语音每轮只发一条，取整轮台词按 `voice.maxChars` 截断。

- 资源放在 `voice/`（模型与运行时合计约 2.3G，已在 `.gitignore` 中）。
- 合成走本机 `127.0.0.1:9880` 的 GPT-SoVITS，**直连**；
  语音条上传要过 Discord，走 `discord.proxy`。
- 服务默认按需自动拉起（`voice.autoStart`）并常驻（`voice.keepServiceAlive`），
  机器人重启后模型仍留在内存里。手工管理：

```bash
node scripts/gpt-sovits.mjs status   # 查看运行状态
node scripts/gpt-sovits.mjs start    # 拉起并加载模型（冷启动约 1-3 分钟）
node scripts/gpt-sovits.mjs stop     # 停止，释放内存
```

- 开了 `voice.warmupOnStart` 会在登录后预热，第一条语音省去模型加载的等待。
- 合成一条约几秒到几十秒，文字回复照常发出；队列超过 `voice.queueMax`
  时丢弃最早的那条，保留最新一句。
- 语音全程尽力而为：TTS 不可达、转码失败、上传失败都记日志并跳过，文字回复照常。
  资源缺失时启动打警告并停用语音，机器人照常运行。

## 致谢

- [SillyTavern](https://github.com/SillyTavern/SillyTavern)（酒馆）—— 提示词组装与角色卡、预设、世界书格式
- openclaw —— Discord 接入流程参考
- [st-claude-cli-bridge](https://github.com/Mar7thLover/st-claude-cli-bridge) —— 后端
