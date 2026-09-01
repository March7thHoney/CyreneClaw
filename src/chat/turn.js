// 一轮对话的公共内核：读历史、组装、生成、入库，不碰任何 Discord 对象
import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '../logger.js';
import { buildMessages } from '../prompt/assemble.js';
import { loadCard } from '../prompt/card.js';
import { baseChatReplace } from '../prompt/macros.js';
import { stripComments, redact } from '../format/strip.js';
import { extractDialogue } from '../format/dialogue.js';

const log = createLogger('turn');

// 被回复的消息作为背景带入，正文里不重复
export function renderUserContent(entry) {
    if (!entry.replyTo) return entry.content;
    const body = entry.replyTo.body.length > 200 ? entry.replyTo.body.slice(0, 200) + '…' : entry.replyTo.body;
    return `<reply_to speaker="${entry.replyTo.name}">${body}</reply_to>\n${entry.content}`;
}

function dumpPrompt(cfg, scope, messages, raw, dialogue) {
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

// 新频道先注入开场白，既是场景锚点也是最强的格式范例
export function seedGreeting({ cfg, store, scope, card, history }) {
    if (history.length || !cfg.chat.seedFirstMes || !card.first_mes) return null;
    const greeting = baseChatReplace(card.first_mes, { char: card.name, user: cfg.discord.owner.displayName });
    const entry = { id: `seed-${Date.now()}`, role: 'assistant', name: card.name, content: greeting, ts: Date.now() };
    store.append(scope, entry);
    history.push({ role: 'assistant', content: greeting });
    return greeting;
}

// batch 为本轮的输入条目，返回模型原文与抽取出的台词
export async function runTurn({ cfg, store, bridge, scope, batch, ambient = null, withContract = true, onGreeting, onDelta }) {
    const card = loadCard(cfg.sillytavern.characterPath);
    const history = store.load(scope).map((m) => ({
        role: m.role,
        // 送回模型前剥掉自查注释，与酒馆的 isPrompt 行为一致
        content: m.role === 'assistant' ? stripComments(m.content) : renderUserContent(m),
    }));

    const greeting = seedGreeting({ cfg, store, scope, card, history });
    if (greeting && onGreeting) await onGreeting(greeting);

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

    const { messages, stats } = buildMessages({ cfg, history, ambient, withContract });
    log.info('开始生成', { scope: scope.key, 世界书: stats.wiActivated, 历史: history.length });

    const raw = onDelta
        ? await bridge.stream(messages, { onDelta })
        : await bridge.complete(messages);
    const stripped = stripComments(raw, { dropUnclosed: cfg.format.dropUnclosedComment });
    let dialogue = extractDialogue(stripped, { joinSeparator: cfg.format.joinSeparator });
    const { text, hits } = redact(dialogue, cfg.format.redact);
    dialogue = text.trim();
    if (hits.length) log.warn('输出命中敏感信息并已过滤', { hits });

    dumpPrompt(cfg, scope, messages, raw, dialogue);
    return { card, raw, stripped, dialogue };
}

// 模型原文入库，动作描写要留在记忆里
export function commitReply({ store, scope, card, raw, sent = [] }) {
    const entry = { id: `gen-${Date.now()}`, role: 'assistant', name: card.name, content: raw, ts: Date.now(), sent };
    store.append(scope, entry);
    return entry;
}
