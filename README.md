# CyreneClaw

Discord 上的 AI 角色扮演机器人。以 SillyTavern（酒馆）的提示词组装方式为基础，
后端复用本地的 `st-claude-cli-bridge`（`claude -p`）。

只做对话，不含 agent、记忆、技能。可选开启本地 TTS，把角色台词再补一条 Discord 原生语音条。

## 特点

- **复用酒馆的现成配置**：直接读取酒馆目录下的角色卡（PNG 内嵌 v2/v3）、
  OpenAI 预设、世界书，不复制也不改动它们。
- **对齐酒馆的组装行为**：prompt_order、marker、对话示例拆分、深度注入、
  `squashSystemMessages`、`strict` 后处理，与酒馆产出的请求逐字节一致。
- **Discord 上只显示台词**：角色的动作与场景描写用于维持上下文，但不投递到 Discord。
- **每个频道独立上下文**：私聊按用户、服务器按频道各自存档。
- **只回应机器人主人**：按用户 ID 精确匹配，不做用户名匹配。
- **原生语音条**：本地 GPT-SoVITS 合成角色声音，以带波形的原生语音消息发出，
  合成在后台串行队列里跑，不阻塞下一轮对话。

## 依赖

- Node.js >= 20
- 运行中的 SillyTavern 数据目录（只读取，不需要酒馆本身在跑）
- 运行中的 `st-claude-cli-bridge`
- 仅开启语音时：`ffmpeg` / `ffprobe`（`brew install ffmpeg`）、
  GPT-SoVITS 运行时与对应的 Python 环境

## 配置

```bash
cp config.example.json config.json
```

然后填写 `config.json`（该文件不入库）：

| 字段 | 说明 |
|---|---|
| `discord.token` | Bot Token |
| `discord.proxy` | 出站代理，留空则直连 |
| `discord.owner.userId` | 你的 Discord 用户 ID，只有这个人能触发机器人 |
| `discord.owner.displayName` | 角色对你的称呼，用于 `{{user}}` |
| `discord.guilds` | 允许的服务器，每个可单独设 `requireMention` |
| `sillytavern.dataDir` | 酒馆的 `data/default-user` 目录 |
| `sillytavern.characterFile` / `presetFile` / `worldBooks` | 相对该目录的资源路径 |
| `prompt.personaDescription` | Discord 专用 persona |
| `prompt.discordContract` | 输出契约，要求每轮都有台词 |
| `llm.baseUrl` / `model` | 指向 bridge |
| `voice.enabled` | 语音总开关，关闭时完全不碰 TTS |
| `voice.dir` | 语音资源根目录，默认项目内 `voice/`（不入库） |
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

plist 由脚本按当前环境生成，仓库内不含任何本机路径。
`RunAtLoad` 使其在登录后自动启动，异常退出会被自动拉起。
node 路径优先取软链，避免版本升级后失效。

注意：机器人依赖 bridge 才能生成回复，若要重启后整条链路都可用，
bridge 也需要各自常驻，否则机器人能登录但每次回复都会失败。

## 触发方式

| 场景 | 条件 |
|---|---|
| 私聊 | 直接说话即可 |
| 服务器频道 | @ 机器人，或回复它自己的消息 |
| 清空当前频道记忆 | 斜杠命令 `/清空`（旧记录归档保留，不删除） |

服务器频道里其他人的发言会作为现场氛围注入上下文，但机器人只回应主人。

## 输出处理

```
模型原文 ├─→ 原样存入 jsonl（含动作描写，作为下一轮的上下文）
        └─→ 剥离自查注释 → 抽取台词 → 过滤 ├─→ 分段 → 发送文字
                                          └─→ 洗成朗读文本 → 后台合成 → 语音条
```

台词抽取只保留 `「」` 内的内容：同一段内的多句并成一行，段与段之间换行。
判定带三重约束，避免把 `「岁月」神像` 这类专名当成台词。
若某轮完全抽不到台词，按 `format.onNoDialogue` 处理（默认静默跳过，且不写入记录）。

## 语音

台词发出后会再补一条 Discord 原生语音条（紫色波形气泡）。语音条按 Discord 规定
不能同时携带文字，所以它总是独立的一条，跟在文字后面。

一轮回复无论被切成几段文字，只发一条语音，取整轮台词按 `voice.maxChars` 截断。

- 资源放在 `voice/`（模型与运行时合计约 2.3G，不入库）。
- 合成走本机 `127.0.0.1:9880` 的 GPT-SoVITS，**直连不走代理**；
  语音条上传要过 Discord，走 `discord.proxy`。
- 服务默认按需自动拉起（`voice.autoStart`）并常驻（`voice.keepServiceAlive`），
  这样机器人重启后不必重新加载模型。手工管理：

```bash
node scripts/gpt-sovits.mjs status   # 查看是否在跑
node scripts/gpt-sovits.mjs start    # 拉起并加载模型（冷启动约 1-3 分钟）
node scripts/gpt-sovits.mjs stop     # 停止，释放内存
```

- 开了 `voice.warmupOnStart` 时会在登录后就预热，否则第一条语音要多等模型加载的时间。
- 合成一条约几秒到几十秒，期间**不会**挡住文字回复；队列超过 `voice.queueMax`
  时丢弃最早的那条，因为最新一句才是对方在等的。
- 语音全程是尽力而为：TTS 不可达、转码失败、上传失败都只记日志并跳过，
  文字回复照常。资源缺失时启动只打警告并自动停用语音，进程不退出。

## 与 SillyTavern 的关系

本项目是对 SillyTavern 提示词组装**行为**的独立实现，兼容其数据格式，
不包含其源代码。SillyTavern 采用 AGPL-3.0 许可。
