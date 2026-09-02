// 控制台 App 专用的配置写回，白名单校验、保序、原子写，用法见 README
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'config.json');

// 只允许改这几项。token 与各类路径一律不开放，越权直接拒绝
const ALLOW = {
    'discord.owner.userId': { type: 'string', test: (v) => /^\d{17,20}$/.test(v), hint: 'Discord 用户 ID 是 17-20 位数字' },
    'discord.owner.displayName': { type: 'string', test: (v) => v.trim() !== '' && v.length <= 64, hint: '称呼不能为空，最长 64 字' },
    'discord.proxy': { type: 'string', test: (v) => v === '' || /^https?:\/\/\S+:\d+$/.test(v), hint: '留空表示直连，否则形如 http://127.0.0.1:1082' },
    'discord.dm.enabled': { type: 'bool' },
    'discord.cadence.enabled': { type: 'bool' },
    'discord.cadence.replyEveryN': { type: 'int', test: (v) => v >= 1 && v <= 1000, hint: '取值 1-1000' },
    'voice.enabled': { type: 'bool' },
    'log.level': { type: 'enum', values: ['debug', 'info', 'warn', 'error'] },
    'llm.model': { type: 'string', test: (v) => /^[\w.:@/\[\]-]{1,128}$/.test(v), hint: '模型名只能含字母数字与 . : @ / - _ [ ]' },
    'discord.schedule': { type: 'array' },
    'discord.reaction': { type: 'object' },
    'localChat.expressions': { type: 'expressions' },
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const CHANNEL_RE = /^\d{17,20}$/;
const EMOJI_RE = /^<a?:[A-Za-z0-9_~]{2,32}:\d{17,20}>$/;
const SCHEDULE_MAX = 5;
const SCHEDULE_KEYS = new Set(['enabled', 'time', 'kind', 'text', 'emoji', 'sticker', 'channels']);
const SCHEDULE_KINDS = ['text', 'emoji', 'sticker'];

// 关掉的槽位允许留空，但填了的值仍要合法，否则界面上的占位行会被写成脏数据
function validateSchedule(list) {
    if (!Array.isArray(list)) throw new Error('必须是数组');
    if (list.length > SCHEDULE_MAX) throw new Error(`最多 ${SCHEDULE_MAX} 条`);
    list.forEach((item, i) => {
        const at = `第 ${i + 1} 条`;
        if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${at}的格式不对`);
        for (const k of Object.keys(item)) if (!SCHEDULE_KEYS.has(k)) throw new Error(`${at}多了一个字段 ${k}`);
        const { enabled, time = '', kind = 'text', text = '', emoji = '', sticker = '', channels = [] } = item;
        if (typeof enabled !== 'boolean') throw new Error(`${at}的开关状态不对`);
        if (typeof time !== 'string' || typeof text !== 'string') throw new Error(`${at}的时间或内容格式不对`);
        if (typeof emoji !== 'string' || typeof sticker !== 'string') throw new Error(`${at}的表情或贴纸格式不对`);
        if (!SCHEDULE_KINDS.includes(kind)) throw new Error(`${at}：类型只能是 ${SCHEDULE_KINDS.join(' / ')}`);
        if (!Array.isArray(channels) || channels.some((c) => typeof c !== 'string')) throw new Error(`${at}的频道格式不对`);
        if (time && !TIME_RE.test(time)) throw new Error(`${at}：时间请填 24 小时制的 HH:MM，例如 09:05 或 20:10`);
        if (text.length > 1000) throw new Error(`${at}：内容最多 1000 字`);
        if (emoji && !EMOJI_RE.test(emoji)) throw new Error(`${at}：表情要写成 <:名字:ID> 或 <a:名字:ID>`);
        if (sticker && !CHANNEL_RE.test(sticker)) throw new Error(`${at}：贴纸 ID 是一串 17-20 位数字`);
        for (const c of channels) if (!CHANNEL_RE.test(c)) throw new Error(`${at}：频道 ID 是一串 17-20 位数字`);
        if (!enabled) return;
        if (!time) throw new Error(`${at}：请填写时间`);
        if (kind === 'text' && !text.trim()) throw new Error(`${at}：请填写内容`);
        if (kind === 'emoji' && !emoji) throw new Error(`${at}：请选择表情`);
        if (kind === 'sticker' && !sticker) throw new Error(`${at}：请选择贴纸`);
        if (!channels.length) throw new Error(`${at}：请选择频道`);
    });
}

const REACTION_MAX = 20;

// 空串表示这个服务器不反应，界面上清掉选择就落成空串
function validateReaction(map) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('必须是对象');
    const keys = Object.keys(map);
    if (keys.length > REACTION_MAX) throw new Error(`最多 ${REACTION_MAX} 个服务器`);
    for (const k of keys) {
        if (!CHANNEL_RE.test(k)) throw new Error(`服务器 ID ${k} 不是一串 17-20 位数字`);
        const v = map[k];
        if (typeof v !== 'string') throw new Error(`服务器 ${k} 的表情格式不对`);
        if (v && !EMOJI_RE.test(v)) throw new Error(`服务器 ${k}：表情要写成 <:名字:ID> 或 <a:名字:ID>`);
    }
}

const EXPRESSIONS_MAX = 50;

// 本机聊天表情池：每项是 <:名字:ID> 表情或贴纸 ID
function validateExpressions(list) {
    if (!Array.isArray(list)) throw new Error('必须是数组');
    if (list.length > EXPRESSIONS_MAX) throw new Error(`最多 ${EXPRESSIONS_MAX} 项`);
    const seen = new Set();
    list.forEach((v, i) => {
        const at = `第 ${i + 1} 项`;
        if (typeof v !== 'string') throw new Error(`${at}的格式不对`);
        if (!EMOJI_RE.test(v) && !CHANNEL_RE.test(v)) throw new Error(`${at}：要写成 <:名字:ID> 表情或 17-20 位数字的贴纸 ID`);
        if (seen.has(v)) throw new Error(`${at}重复了`);
        seen.add(v);
    });
}

const BOOL_TRUE = new Set(['true', '1', 'yes', 'on']);
const BOOL_FALSE = new Set(['false', '0', 'no', 'off']);

// stdout 恒为单行 JSON 供 app 解析，人读的话走 stderr
function out(obj, code = 0) {
    process.stdout.write(JSON.stringify(obj) + '\n');
    process.exit(code);
}

function pick(obj, dotted) {
    return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// 中间层缺失就补空对象，但绝不覆盖已有的非对象节点
function setPath(obj, dotted, value) {
    const keys = dotted.split('.');
    let cur = obj;
    for (const k of keys.slice(0, -1)) {
        if (cur[k] == null) cur[k] = {};
        else if (typeof cur[k] !== 'object' || Array.isArray(cur[k])) throw new Error(`${dotted} 的父节点不是对象`);
        cur = cur[k];
    }
    const last = keys[keys.length - 1];
    const old = cur[last];
    cur[last] = value;
    return old;
}

// 命令行形式的类型不靠猜，一律查白名单
function coerce(key, raw) {
    const spec = ALLOW[key];
    if (!spec) throw new Error('不是允许修改的配置项');
    if (spec.type === 'array' || spec.type === 'object') throw new Error('只能通过 --json 传入');
    if (spec.type === 'bool') {
        const s = String(raw).toLowerCase();
        if (BOOL_TRUE.has(s)) return true;
        if (BOOL_FALSE.has(s)) return false;
        throw new Error('只能是 true 或 false');
    }
    if (spec.type === 'int') {
        const n = Number(raw);
        if (!Number.isInteger(n)) throw new Error('必须是整数');
        return n;
    }
    return String(raw);
}

function validate(key, value) {
    const spec = ALLOW[key];
    if (!spec) throw new Error('不是允许修改的配置项');
    if (spec.type === 'array') return validateSchedule(value);
    if (spec.type === 'object') return validateReaction(value);
    if (spec.type === 'expressions') return validateExpressions(value);
    if (spec.type === 'bool' && typeof value !== 'boolean') throw new Error('必须是布尔值');
    if (spec.type === 'int' && !Number.isInteger(value)) throw new Error('必须是整数');
    if ((spec.type === 'string' || spec.type === 'enum') && typeof value !== 'string') throw new Error('必须是字符串');
    if (spec.type === 'enum' && !spec.values.includes(value)) throw new Error(`只能是 ${spec.values.join(' / ')}`);
    if (spec.test && !spec.test(value)) throw new Error(spec.hint);
}

function readConfig() {
    let raw;
    try { raw = fs.readFileSync(FILE, 'utf8'); } catch (e) { out({ ok: false, errors: [{ key: '', message: `读取 config.json 失败：${e.message}` }] }, 2); }
    try { return { raw, cfg: JSON.parse(raw) }; } catch (e) { out({ ok: false, errors: [{ key: '', message: `config.json 不是合法 JSON：${e.message}` }] }, 2); }
}

const argv = process.argv.slice(2);

if (argv.includes('--get')) {
    const { cfg } = readConfig();
    const values = {};
    for (const key of Object.keys(ALLOW)) values[key] = pick(cfg, key) ?? null;
    const token = pick(cfg, 'discord.token');
    // token 绝不回显，只报是否已配置
    out({ ok: true, values, tokenConfigured: Boolean(token) && !String(token).startsWith('在此填写') });
}

let updates = {};
if (argv.includes('--json')) {
    let text = '';
    try { text = fs.readFileSync(0, 'utf8'); } catch { text = ''; }
    try { updates = JSON.parse(text || '{}'); } catch (e) { out({ ok: false, errors: [{ key: '', message: `stdin 不是合法 JSON：${e.message}` }] }, 1); }
} else if (argv.length === 0) {
    out({ ok: false, errors: [{ key: '', message: '用法: config-set.mjs --get | 键=值 ... | --json' }] }, 1);
} else {
    for (const a of argv) {
        const i = a.indexOf('=');
        if (i < 0) out({ ok: false, errors: [{ key: a, message: '参数要写成 键=值' }] }, 1);
        const key = a.slice(0, i);
        try { updates[key] = coerce(key, a.slice(i + 1)); } catch (e) { out({ ok: false, errors: [{ key, message: e.message }] }, 1); }
    }
}

// 先全量校验，任何一项不合法就整体不写，不允许留下半截状态
const errors = [];
for (const [k, v] of Object.entries(updates)) {
    try { validate(k, v); } catch (e) { errors.push({ key: k, message: e.message }); }
}
if (errors.length) out({ ok: false, errors }, 1);

const { raw, cfg } = readConfig();
const indent = (raw.match(/^\{\r?\n(\s+)"/) || [, '    '])[1];

const changed = {};
for (const [k, v] of Object.entries(updates)) {
    let old;
    try { old = setPath(cfg, k, v); } catch (e) { out({ ok: false, errors: [{ key: k, message: e.message }] }, 1); }
    if (JSON.stringify(old) !== JSON.stringify(v)) changed[k] = v;
}
if (Object.keys(changed).length === 0) out({ ok: true, changed: {} });

// 临时文件 → rename，写坏文件是不可能的，所以不留备份污染工作区
try {
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, indent) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, FILE);
} catch (e) {
    out({ ok: false, errors: [{ key: '', message: `写入失败：${e.message}` }] }, 2);
}

out({ ok: true, changed });
