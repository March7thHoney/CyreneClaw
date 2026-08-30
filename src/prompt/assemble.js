// 主组装器：把角色卡、预设、世界书、聊天记录组装成最终 messages 数组
import { loadCard } from './card.js';
import { loadPreset } from './preset.js';
import { loadWorldBooks } from './worldbook.js';
import { scanWorldInfo, formatWorldInfo, POSITION } from './wi-scan.js';
import { evaluateMacros, baseChatReplace } from './macros.js';
import { buildDialogueExamples } from './examples.js';
import { squashSystemMessages, strictMerge } from './postprocess.js';
import { countTokens, countMessagesTokens } from './tokens.js';

const MARKERS = new Set([
    'personaDescription', 'charDescription', 'charPersonality', 'scenario',
    'dialogueExamples', 'worldInfoBefore', 'worldInfoAfter', 'chatHistory',
]);

// 深度注入：depth 0 落在最后一条消息之后，depth 1 落在它之前
function injectAtDepth(chatMsgs, injections) {
    if (!injections.length) return chatMsgs;
    const reversed = [...chatMsgs].reverse();
    const byDepth = new Map();
    for (const inj of injections) {
        if (!inj.content) continue;
        if (!byDepth.has(inj.depth)) byDepth.set(inj.depth, []);
        byDepth.get(inj.depth).push(inj);
    }
    // 已插入条数跨深度累加，否则深的那层会挤进浅层中间（对齐酒馆的 totalInsertedMessages）
    let inserted = 0;
    for (const [depth, list] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
        for (const inj of list) {
            const at = Math.min(depth + inserted, reversed.length);
            reversed.splice(at, 0, { role: inj.role, content: inj.content });
            inserted++;
        }
    }
    return reversed.reverse();
}

// history 最旧在前且已含本轮 user，ambient 为已渲染的频道背景块
export function buildMessages({ cfg, history, ambient = null, withContract = true }) {
    const st = cfg.sillytavern;
    const card = loadCard(st.characterPath);
    const preset = loadPreset(st.presetPath);
    const entries = loadWorldBooks(st.worldBookPaths);

    const charName = card.name;
    const userName = cfg.discord.owner.displayName;
    const env = { char: charName, user: userName };

    // 角色卡字段先各自跑宏，之后才能作为其它宏的取值
    const description = baseChatReplace(card.description, env);
    const personality = baseChatReplace(card.personality, env);
    const scenario = baseChatReplace(card.scenario, env);
    const mesExamples = baseChatReplace(card.mes_example, env);
    const persona = baseChatReplace(cfg.prompt.personaDescription || '', env);
    const fullEnv = { ...env, description, personality, scenario, persona, mesExamples };

    // 世界书扫描缓冲区：最新在前，带说话人前缀
    const wiOpts = cfg.prompt.worldInfo;
    const chatForWI = [...history]
        .reverse()
        .map((m) => (wiOpts.includeNames ? `${m.role === 'user' ? userName : charName}: ${m.content}` : m.content));
    const wi = scanWorldInfo(chatForWI, entries, {
        depth: wiOpts.depth,
        budgetPercent: wiOpts.budgetPercent,
        budgetCap: wiOpts.budgetCap,
        maxContext: cfg.prompt.maxContext,
        caseSensitive: wiOpts.caseSensitive,
        matchWholeWords: wiOpts.matchWholeWords,
        env,
    });

    const markerContent = {
        personaDescription: persona,
        charDescription: description,
        charPersonality: evaluateMacros(cfg.prompt.personalityFormat || '{{personality}}', fullEnv),
        scenario: evaluateMacros(cfg.prompt.scenarioFormat || '{{scenario}}', fullEnv),
        worldInfoBefore: formatWorldInfo(wi.before.join('\n'), cfg.prompt.wiFormat),
        worldInfoAfter: formatWorldInfo(wi.after.join('\n'), cfg.prompt.wiFormat),
    };

    // 先按预设顺序铺开，chatHistory 位置留标记
    const pre = [];
    let historyIndex = -1;
    for (const p of preset.order) {
        if (p.identifier === 'chatHistory') { historyIndex = pre.length; continue; }
        if (p.identifier === 'dialogueExamples') {
            pre.push(...buildDialogueExamples(mesExamples, { userName, charName }));
            continue;
        }
        const content = MARKERS.has(p.identifier)
            ? (markerContent[p.identifier] ?? '')
            : evaluateMacros(p.content || '', fullEnv);
        if (!content) continue;
        pre.push({ role: p.role || 'system', content, identifier: p.identifier });
    }
    if (historyIndex < 0) historyIndex = pre.length;

    const head = pre.slice(0, historyIndex);
    const tail = pre.slice(historyIndex);

    // 聊天记录本体
    let chatMsgs = history.map((m) => ({ role: m.role, content: m.content }));

    // 深度注入：D0 放世界书条目，再接 Discord 契约；D1 放频道背景
    const injections = [];
    for (const g of wi.depth) {
        injections.push({ depth: g.depth, role: g.role === 0 ? 'system' : 'user', content: g.entries.join('\n') });
    }
    if (withContract && cfg.prompt.discordContract) {
        injections.push({ depth: 0, role: 'system', content: evaluateMacros(cfg.prompt.discordContract, fullEnv) });
    }
    if (ambient) injections.push({ depth: 1, role: 'system', content: ambient });

    // 长度契约排在预设尾部之后，占住整段提示词的末尾
    const tailContract = withContract && cfg.prompt.tailContract
        ? [{ role: 'system', content: evaluateMacros(cfg.prompt.tailContract, fullEnv) }]
        : [];

    // 预算裁剪：从最旧的聊天记录开始丢，深度注入不参与裁剪
    const reserve = countMessagesTokens([...head, ...tail, ...tailContract]) + (cfg.prompt.maxTokens || 0);
    const budget = Math.max(0, (cfg.prompt.maxContext || 127104) - reserve);
    let dropped = 0;
    while (chatMsgs.length > 1 && countMessagesTokens(chatMsgs) > budget) {
        chatMsgs.shift();
        dropped++;
    }

    chatMsgs = injectAtDepth(chatMsgs, injections);

    const assembled = [...head, ...chatMsgs, ...tail, ...tailContract];
    const squashed = cfg.prompt.squashSystemMessages ? squashSystemMessages(assembled) : assembled;
    const messages = cfg.prompt.postProcessing === 'strict'
        ? strictMerge(squashed, { charName, userName, placeholder: cfg.prompt.promptPlaceholder })
        : squashed.map(({ role, content }) => ({ role, content }));

    return {
        messages: messages.map(({ role, content }) => ({ role, content })),
        stats: {
            wiActivated: wi.activated.length,
            wiTokens: wi.tokens,
            wiOverflowed: wi.overflowed,
            historyDropped: dropped,
            totalTokens: countTokens(messages.map((m) => m.content).join('\n')),
        },
    };
}
