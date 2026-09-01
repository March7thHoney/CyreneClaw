// 加载并校验 config.json，展开 ~ 路径，缺项直接报中文错误退出
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 把 ~ 开头的路径展开成绝对路径，相对路径按项目根解析
function expand(p) {
    if (!p) return p;
    if (p === '~') return os.homedir();
    if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
    return path.isAbsolute(p) ? p : path.resolve(ROOT, p);
}

const REQUIRED = [
    ['discord.token', 'Discord Bot Token'],
    ['discord.owner.userId', '你的 Discord 用户 ID'],
    ['sillytavern.dataDir', '酒馆 data/default-user 目录'],
    ['sillytavern.characterFile', '角色卡文件名'],
    ['sillytavern.presetFile', '预设文件名'],
];

function pick(obj, dotted) {
    return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

const SAMPLE_STEPS = [4, 8, 16, 32, 64, 128];

const VOICE_DEFAULTS = {
    enabled: false,
    endpoint: 'http://127.0.0.1:9880',
    dir: './voice',
    python: '~/miniconda3/envs/GPTSoVits/bin/python',
    autoStart: true,
    device: 'cpu',
    minChars: 2,
    maxChars: 240,
    replyTo: 'none',
    warmupOnStart: true,
    keepServiceAlive: true,
    readyTimeoutMs: 180000,
    synthTimeoutMs: 180000,
    queueMax: 3,
    shutdownWaitMs: 5000,
    cleanupHours: 24,
    ffmpeg: '',
    ffprobe: '',
};

const SYNTH_DEFAULTS = { textLanguage: 'zh', topK: 15, topP: 1.0, temperature: 1.0, speed: 1.0, sampleSteps: 16, ifSr: false };

// 语音是可选增强，缺资源只降级不退出，绝不能让它挡住机器人登录
function normalizeVoice(cfg) {
    const v = { ...VOICE_DEFAULTS, ...(cfg.voice || {}) };
    cfg.voice = v;
    // 关着也要把派生路径算出来，语音是可以热打开的
    v.synth = { ...SYNTH_DEFAULTS, ...(v.synth || {}) };
    if (!SAMPLE_STEPS.includes(v.synth.sampleSteps)) {
        console.warn(`voice.synth.sampleSteps 只能是 ${SAMPLE_STEPS.join('/')}，已改用 16`);
        v.synth.sampleSteps = 16;
    }
    v.dir = expand(v.dir);
    v.python = expand(v.python);
    v.runtimeDir = path.join(v.dir, 'runtime', 'GPT-SoVITS');
    v.runtimeStateDir = path.join(v.dir, 'runtime');
    v.generatedDir = path.join(v.dir, 'generated');
    v.logDir = path.join(v.dir, 'logs');
    v.pidFile = path.join(v.dir, 'runtime', 'gpt-sovits-api.pid');
    const m = { ...(v.model || {}) };
    v.model = m;
    const md = path.join(v.dir, m.dir || '');
    m.gptPath = path.join(md, m.gpt || '');
    m.sovitsPath = path.join(md, m.sovits || '');
    m.refPath = path.join(md, m.refAudio || '');
    try {
        const u = new URL(v.endpoint);
        v.host = u.hostname;
        v.port = Number(u.port) || 9880;
    } catch {
        console.warn(`voice.endpoint 不是合法 URL，已关闭语音：${v.endpoint}`);
        v.enabled = false;
    }
}

// 本机聊天的回环服务，端口不进界面，缺省即可用
function normalizeLocalChat(cfg) {
    const l = { port: 5610, ...(cfg.localChat || {}) };
    const port = Number(l.port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        console.warn(`localChat.port 不是 1024-65535 的整数，已改用 5610：${l.port}`);
        l.port = 5610;
    } else {
        l.port = port;
    }
    cfg.localChat = l;
}

const SCHEDULE_MAX = 5;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const CHANNEL_RE = /^\d{17,20}$/;
const EMOJI_RE = /^<a?:[A-Za-z0-9_~]{2,32}:\d{17,20}>$/;
const SCHEDULE_KINDS = new Set(['text', 'emoji', 'sticker']);

// 定时消息与语音同理：写坏一条只丢这一条，绝不能挡住机器人登录
function normalizeSchedule(cfg) {
    const raw = Array.isArray(cfg.discord.schedule) ? cfg.discord.schedule : [];
    const kept = [];
    raw.forEach((item, i) => {
        // 关掉的槽位是界面上的占位行，本来就该安静地忽略
        if (!item || typeof item !== 'object' || item.enabled !== true) return;
        const at = `discord.schedule 第 ${i + 1} 条`;
        if (kept.length >= SCHEDULE_MAX) { console.warn(`${at}超出 ${SCHEDULE_MAX} 条上限，已跳过`); return; }
        const time = String(item.time ?? '');
        if (!TIME_RE.test(time)) { console.warn(`${at}的时间不是 HH:MM，已跳过：${time}`); return; }
        // 老配置没有 kind 字段，按文字处理
        const kind = SCHEDULE_KINDS.has(item.kind) ? item.kind : 'text';
        const text = String(item.text ?? '').trim();
        const emoji = String(item.emoji ?? '').trim();
        const sticker = String(item.sticker ?? '').trim();
        if (kind === 'text' && !text) { console.warn(`${at}没有内容，已跳过`); return; }
        if (kind === 'emoji' && !EMOJI_RE.test(emoji)) { console.warn(`${at}的表情不是 <:名字:ID> 形式，已跳过：${emoji}`); return; }
        if (kind === 'sticker' && !CHANNEL_RE.test(sticker)) { console.warn(`${at}的贴纸 ID 不是一串 17-20 位数字，已跳过：${sticker}`); return; }
        // 同一个频道填两遍只该收到一条
        const channels = [...new Set((Array.isArray(item.channels) ? item.channels : [])
            .map((c) => String(c).trim())
            .filter((c) => CHANNEL_RE.test(c)))];
        if (!channels.length) { console.warn(`${at}没有合法的频道 ID，已跳过`); return; }
        const [h, m] = time.split(':');
        kept.push({ time, minutes: Number(h) * 60 + Number(m), kind, text, emoji, sticker, channels });
    });
    cfg.discord.schedule = kept;
}

const REACTION_MAX = 20;

// 表情反应写坏一项只丢这一项，其余照常生效
function normalizeReaction(cfg) {
    const raw = cfg.discord.reaction;
    const kept = {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const [guildId, token] of Object.entries(raw)) {
            const at = `discord.reaction 的 ${guildId}`;
            if (Object.keys(kept).length >= REACTION_MAX) { console.warn(`${at}超出 ${REACTION_MAX} 项上限，已跳过`); continue; }
            // 服务器 ID 与频道 ID 同形，都是 17-20 位数字
            if (!CHANNEL_RE.test(guildId)) { console.warn(`${at}不是一串 17-20 位数字，已跳过`); continue; }
            const t = String(token ?? '').trim();
            // 空串是界面上的“不反应”，安静地忽略
            if (!t) continue;
            if (!EMOJI_RE.test(t)) { console.warn(`${at}的表情不是 <:名字:ID> 形式，已跳过：${t}`); continue; }
            kept[guildId] = t;
        }
    }
    cfg.discord.reaction = kept;
}

// 控制台开放且能就地生效的配置项。代理要重建 Discord 连接，不在其列
const HOT_KEYS = [
    'discord.owner.userId',
    'discord.owner.displayName',
    'discord.dm.enabled',
    'discord.cadence.enabled',
    'discord.cadence.replyEveryN',
    'voice.enabled',
    'log.level',
    'llm.model',
];

function setPath(obj, dotted, value) {
    const keys = dotted.split('.');
    let cur = obj;
    for (const k of keys.slice(0, -1)) {
        if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
        cur = cur[k];
    }
    cur[keys[keys.length - 1]] = value;
}

// 就地改而不换对象：各组件持有的是 cfg 下子对象的引用
export function applyHotConfig(cfg, next) {
    const changed = [];
    for (const key of HOT_KEYS) {
        const to = pick(next, key);
        if (to === undefined) continue;
        if (JSON.stringify(pick(cfg, key)) === JSON.stringify(to)) continue;
        setPath(cfg, key, to);
        changed.push(key);
    }
    // cfg 里存的是归一化结果，要先算出新的再比
    const raw = pick(next, 'discord.schedule');
    if (raw !== undefined) {
        const before = JSON.stringify(cfg.discord.schedule);
        cfg.discord.schedule = raw;
        normalizeSchedule(cfg);
        if (JSON.stringify(cfg.discord.schedule) !== before) changed.push('discord.schedule');
    }
    const rawReaction = pick(next, 'discord.reaction');
    if (rawReaction !== undefined) {
        const before = JSON.stringify(cfg.discord.reaction);
        cfg.discord.reaction = rawReaction;
        normalizeReaction(cfg);
        if (JSON.stringify(cfg.discord.reaction) !== before) changed.push('discord.reaction');
    }
    return changed;
}

export function loadConfig(file) {
    const configPath = file ? expand(file) : path.join(ROOT, 'config.json');
    if (!fs.existsSync(configPath)) {
        console.error(`找不到配置文件 ${configPath}，请先复制 config.example.json 为 config.json 并填写`);
        process.exit(1);
    }
    let cfg;
    try {
        cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
        console.error(`配置文件不是合法 JSON：${e.message}`);
        process.exit(1);
    }

    const missing = REQUIRED.filter(([k]) => {
        const v = pick(cfg, k);
        return !v || String(v).startsWith('在此填写');
    });
    if (missing.length) {
        console.error('配置缺少以下必填项：');
        for (const [k, desc] of missing) console.error(`  ${k}  —— ${desc}`);
        process.exit(1);
    }

    cfg.sillytavern.dataDir = expand(cfg.sillytavern.dataDir);
    cfg.chat.dataDir = expand(cfg.chat?.dataDir || './data');
    cfg.log.dir = expand(cfg.log?.dir || './logs');

    if (!fs.existsSync(cfg.sillytavern.dataDir)) {
        console.error(`酒馆数据目录不存在：${cfg.sillytavern.dataDir}`);
        process.exit(1);
    }

    // 把资源相对路径拼成绝对路径，顺便确认文件都在
    const st = cfg.sillytavern;
    st.characterPath = path.join(st.dataDir, st.characterFile);
    st.presetPath = path.join(st.dataDir, st.presetFile);
    st.worldBookPaths = (st.worldBooks || []).map((w) => path.join(st.dataDir, w));
    for (const p of [st.characterPath, st.presetPath, ...st.worldBookPaths]) {
        if (!fs.existsSync(p)) {
            console.error(`资源文件不存在：${p}`);
            process.exit(1);
        }
    }

    normalizeVoice(cfg);
    normalizeLocalChat(cfg);
    normalizeSchedule(cfg);
    normalizeReaction(cfg);

    cfg.configPath = configPath;
    return cfg;
}
