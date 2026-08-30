// CyreneClaw 入口：把 Discord 事件接到酒馆式提示词组装与 bridge 生成上
import { loadConfig } from './config.js';
import { watchConfig } from './config-watch.js';
import { configureLogger, createLogger } from './logger.js';
import { createClient } from './discord/client.js';
import { scopeOf } from './discord/scope.js';
import { decide, stripMentions } from './discord/gate.js';
import { AmbientBuffer } from './discord/ambient.js';
import { Cadence } from './discord/cadence.js';
import { startTyping } from './discord/typing.js';
import { sendText } from './discord/send.js';
import { reactToTrigger } from './discord/reaction.js';
import { buildCommandData, handleClear } from './discord/commands.js';
import { Scheduler } from './discord/schedule.js';
import { createDirectoryRefresher } from './discord/directory.js';
import { ChatStore } from './chat/store.js';
import { SessionManager } from './chat/session.js';
import { BridgeClient } from './llm/bridge.js';
import { VoiceMessenger } from './voice/index.js';
import { buildMessages } from './prompt/assemble.js';
import { loadCard } from './prompt/card.js';
import { initTokenizer } from './prompt/tokens.js';
import { stripComments, redact } from './format/strip.js';
import { extractDialogue } from './format/dialogue.js';
import { baseChatReplace } from './prompt/macros.js';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const cfg = loadConfig();
configureLogger(cfg.log);
const log = createLogger('main');

await initTokenizer(cfg.tokenizer);

const store = new ChatStore(cfg);
const ambient = new AmbientBuffer(cfg);
const cadence = new Cadence(cfg);
const bridge = new BridgeClient(cfg);
const { client, djs } = createClient(cfg);
const voice = new VoiceMessenger({ cfg, client, djs });

let emptyContentStreak = 0;

// 被回复的消息作为背景带入，正文里不重复
function renderUserContent(entry) {
    if (!entry.replyTo) return entry.content;
    const body = entry.replyTo.body.length > 200 ? entry.replyTo.body.slice(0, 200) + '…' : entry.replyTo.body;
    return `<reply_to speaker="${entry.replyTo.name}">${body}</reply_to>\n${entry.content}`;
}

function dumpPrompt(scope, messages, raw, dialogue) {
    if (!cfg.log.logPrompts) return;
    const dir = path.join(cfg.log.dir, 'prompts');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const body = [
        `# scope: ${scope.key}`,
        `\n===== messages (${messages.length}) =====`,
        JSON.stringify(messages, null, 2),
        '\n===== 模型原文 =====', raw,
        '\n===== 抽取后 =====', dialogue,
    ].join('\n');
    fs.writeFileSync(path.join(dir, `req-${stamp}.txt`), body);
}

async function handleTurn(scope, batch) {
    const channel = batch[0].channel;
    const card = loadCard(cfg.sillytavern.characterPath);
    const history = store.load(scope).map((m) => ({
        role: m.role,
        // 送回模型前剥掉自查注释，与酒馆的 isPrompt 行为一致
        content: m.role === 'assistant' ? stripComments(m.content) : renderUserContent(m),
    }));

    // 新频道先注入开场白，既是场景锚点也是最强的格式范例
    if (!history.length && cfg.chat.seedFirstMes && card.first_mes) {
        const greeting = baseChatReplace(card.first_mes, { char: card.name, user: cfg.discord.owner.displayName });
        const entry = { id: `seed-${Date.now()}`, role: 'assistant', name: card.name, content: greeting, ts: Date.now() };
        store.append(scope, entry);
        history.push({ role: 'assistant', content: greeting });
        if (cfg.chat.sendGreetingOnNewScope) {
            const opening = extractDialogue(greeting, { joinSeparator: cfg.format.joinSeparator });
            if (opening) await sendText(channel, opening, cfg);
        }
    }

    // 连打的几条并成一个 user turn
    const merged = batch.map((b) => b.content).join('\n');
    const userEntry = {
        id: batch[batch.length - 1].id,
        role: 'user',
        name: batch[0].authorName,
        content: merged,
        ts: Date.now(),
        ...(batch[0].replyTo ? { replyTo: batch[0].replyTo } : {}),
    };
    store.append(scope, userEntry);
    history.push({ role: 'user', content: renderUserContent(userEntry) });

    const ambientBlock = scope.kind === 'guild'
        ? ambient.render(scope.channelId, scope.label, new Set(batch.map((b) => b.id)))
        : null;

    const stopTyping = startTyping(channel, cfg.discord.typing);
    try {
        const { messages, stats } = buildMessages({ cfg, history, ambient: ambientBlock });
        log.info('开始生成', { scope: scope.key, 世界书: stats.wiActivated, 历史: history.length });

        const raw = await bridge.complete(messages);
        const stripped = stripComments(raw, { dropUnclosed: cfg.format.dropUnclosedComment });
        let dialogue = extractDialogue(stripped, { joinSeparator: cfg.format.joinSeparator });
        const { text, hits } = redact(dialogue, cfg.format.redact);
        dialogue = text.trim();
        if (hits.length) log.warn('输出命中敏感信息并已过滤', { hits });

        dumpPrompt(scope, messages, raw, dialogue);

        if (!dialogue) {
            // 抽不到对白就不发也不入库，这一轮当作没发生，下次从同一状态重来
            log.warn('未抽取到对白，按配置跳过', { scope: scope.key, mode: cfg.format.onNoDialogue });
            const dir = path.join(cfg.log.dir, 'prompts');
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, `nodialogue-${Date.now()}.txt`), raw);
            if (cfg.format.onNoDialogue === 'raw' && stripped) await sendText(channel, stripped, cfg);
            return;
        }

        const ids = await sendText(channel, dialogue, cfg);
        // 存原文而非抽取结果，动作描写要留在记忆里
        store.append(scope, { id: `gen-${Date.now()}`, role: 'assistant', name: card.name, content: raw, ts: Date.now(), sent: ids });
        // 合成要几十秒，只投递不等待，否则同 scope 的下一条消息会被串行队列卡住
        voice.speak({ channelId: channel.id, text: dialogue, replyToId: ids[0] ?? null, scopeKey: scope.key });
        // 触发这一轮的是批次里最后一条，反应加在它身上
        await reactToTrigger(channel, batch[batch.length - 1].id, cfg);
        log.info('已回复', { scope: scope.key, 段数: ids.length, 抽取率: `${Math.round(dialogue.length / (raw.length || 1) * 100)}%` });
    } catch (err) {
        log.error('生成失败', { scope: scope.key, err: err?.message });
        try { await sendText(channel, cfg.discord.replies.error, cfg); } catch { /* 连报错都发不出去就算了 */ }
    } finally {
        stopTyping();
    }
}

const sessions = new SessionManager(cfg, handleTurn);
const scheduler = new Scheduler({ cfg, client, voice, sessions });
const refreshDirectory = createDirectoryRefresher({ client, djs, cfg });

// 控制台开放的配置改完即生效，不必重启
watchConfig(cfg, (changed) => {
    if (changed.includes('log.level')) configureLogger(cfg.log);
    if (changed.some((k) => k.startsWith('discord.cadence'))) cadence.reconfigure(cfg);
    if (changed.includes('discord.schedule')) scheduler.reconfigure();
    if (changed.includes('voice.enabled')) {
        voice.reconfigure(cfg).catch((e) => log.error('语音开关切换失败', { err: e?.message }));
    }
});

client.once('clientReady', async (c) => {
    log.info(`已登录：${c.user.tag}`);
    if (await voice.selfCheck()) voice.warmup();
    scheduler.start();
    refreshDirectory();
    for (const [id, g] of c.guilds.cache) log.info(`  所在服务器：${g.name} (${id})`);
    try {
        const data = buildCommandData(djs, cfg.discord.clearCommandName || '清空');
        await c.application.commands.set([data]);
        log.info(`斜杠命令已注册：/${data.name}`);
    } catch (e) {
        log.error('斜杠命令注册失败', { err: e?.message });
    }
});

// 服务器、频道、表情、贴纸有任何变动都重出一份清单给控制台 App
for (const event of ['guildCreate', 'guildDelete', 'guildUpdate', 'channelCreate', 'channelDelete', 'channelUpdate',
    'emojiCreate', 'emojiUpdate', 'emojiDelete', 'stickerCreate', 'stickerUpdate', 'stickerDelete']) {
    client.on(event, () => refreshDirectory());
}

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== (cfg.discord.clearCommandName || '清空')) return;
    try {
        await handleClear(interaction, { cfg, store, ambient, cadence, scopeOf });
    } catch (e) {
        log.error('清空命令失败', { err: e?.message });
    }
});

client.on('messageCreate', async (message) => {
    try {
        if (message.author?.id === client.user?.id) return;

        // MessageContent 是特权 intent，被关掉时所有正文都是空的
        if (!message.content && !message.attachments?.size && !message.author?.bot) {
            if (++emptyContentStreak === 3) log.error('连续收到空正文消息，MESSAGE CONTENT INTENT 可能未开启');
        } else {
            emptyContentStreak = 0;
        }

        // 先收进现场氛围，再判权限，否则角色看不到别人在聊什么
        if (message.guildId && !message.author?.bot) {
            ambient.record(message.channelId, {
                id: message.id,
                // owner 用角色认识的那个名字，否则频道里的昵称会被当成另一个人
                author: message.author.id === cfg.discord.owner.userId
                    ? cfg.discord.owner.displayName
                    : (message.member?.displayName || message.author.username),
                content: message.content,
                ts: message.createdTimestamp,
            });
        }

        let repliedToBot = false;
        let replyTo = null;
        if (message.reference?.messageId) {
            try {
                const ref = await message.fetchReference();
                repliedToBot = ref.author?.id === client.user?.id;
                if (ref.content) {
                    replyTo = {
                        name: repliedToBot ? loadCard(cfg.sillytavern.characterPath).name
                            : (ref.member?.displayName || ref.author?.username || '某人'),
                        body: repliedToBot ? stripComments(ref.content) : ref.content,
                    };
                }
            } catch { /* 取不到被引用的消息就当没有 */ }
        }

        const verdict = decide(message, { cfg, botId: client.user?.id, repliedToBot });
        const content = stripMentions(message.content, client.user?.id);

        if (verdict.act === 'reply') {
            // 正常触发的一轮把节奏清零，重新从头数
            cadence.reset(message.channelId);
        } else if (!verdict.cadence || !content || !cadence.bump(message.channelId, message.guildId)) {
            // 无正文的消息本来就发不出回复，不能让它白吃一格计数
            return;
        }

        if (!content) return;

        const scope = scopeOf(message);
        sessions.enqueue(scope, {
            id: message.id,
            content,
            authorName: message.member?.displayName || message.author.username,
            channel: message.channel,
            replyTo,
        });
    } catch (err) {
        log.error('消息处理异常', { err: err?.message });
    }
});

client.on('shardError', (e) => log.error('分片错误', { err: e?.message }));
client.on('shardDisconnect', (_e, id) => log.warn('分片断开', { id }));

let shuttingDown = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
        // 连按两次 Ctrl-C 直接硬退，不再等收尾
        if (shuttingDown) process.exit(1);
        shuttingDown = true;
        log.info('收到退出信号，正在断开');
        voice.drain(cfg.voice.shutdownWaitMs)
            .catch(() => {})
            .finally(() => { voice.shutdown(); return client.destroy(); })
            .finally(() => process.exit(0));
    });
}

// 开机时代理常晚于本服务就绪，先等它起来再登录，避免无谓的进程重启
async function waitForProxy(proxyUrl, maxWaitMs = 180000) {
    if (!proxyUrl) return true;
    let host, port;
    try { const u = new URL(proxyUrl); host = u.hostname; port = Number(u.port); } catch { return true; }
    if (!port) return true;
    const deadline = Date.now() + maxWaitMs;
    let notified = false;
    while (Date.now() < deadline) {
        const ok = await new Promise((resolve) => {
            const sock = net.connect({ host, port });
            const done = (v) => { sock.destroy(); resolve(v); };
            sock.once('connect', () => done(true));
            sock.once('error', () => done(false));
            sock.setTimeout(2000, () => done(false));
        });
        if (ok) {
            if (notified) log.info('代理已就绪');
            return true;
        }
        if (!notified) { log.warn('代理尚未就绪，等待中', { 代理: `${host}:${port}` }); notified = true; }
        await new Promise((r) => setTimeout(r, 3000));
    }
    log.warn('等待代理超时，仍尝试登录');
    return false;
}

await waitForProxy(cfg.discord.proxy);

client.login(cfg.discord.token).catch((e) => {
    log.error('登录失败', { err: e?.message });
    process.exit(1);
});
