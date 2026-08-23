# CyreneClaw

Discord 上的 AI 角色扮演机器人。以 SillyTavern（酒馆）的提示词组装方式为基础，
后端复用本地的 `st-claude-cli-bridge`（`claude -p`）。

只做对话，不含 agent、记忆、技能、语音。

## 特点

- **复用酒馆的现成配置**：直接读取酒馆目录下的角色卡（PNG 内嵌 v2/v3）、
  OpenAI 预设、世界书，不复制也不改动它们。
- **对齐酒馆的组装行为**：prompt_order、marker、对话示例拆分、深度注入、
  `squashSystemMessages`、`strict` 后处理，与酒馆产出的请求逐字节一致。
- **Discord 上只显示台词**：角色的动作与场景描写用于维持上下文，但不投递到 Discord。
- **每个频道独立上下文**：私聊按用户、服务器按频道各自存档。
- **只回应机器人主人**：按用户 ID 精确匹配，不做用户名匹配。

## 依赖

- Node.js >= 20
- 运行中的 SillyTavern 数据目录（只读取，不需要酒馆本身在跑）
- 运行中的 `st-claude-cli-bridge`

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

若本机装有 openclaw，可用 `node scripts/migrate-from-openclaw.mjs`
从它的配置生成 `config.json` 骨架（token 与 ID 不会打印到终端）。

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
        └─→ 剥离自查注释 → 抽取台词 → 过滤 → 分段 → 发送
```

台词抽取只保留 `「」` 内的内容：同一段内的多句并成一行，段与段之间换行。
判定带三重约束，避免把 `「岁月」神像` 这类专名当成台词。
若某轮完全抽不到台词，按 `format.onNoDialogue` 处理（默认静默跳过，且不写入记录）。

## 与 SillyTavern 的关系

本项目是对 SillyTavern 提示词组装**行为**的独立实现，兼容其数据格式，
不包含其源代码。SillyTavern 采用 AGPL-3.0 许可。
