// 世界书扫描：单趟激活 + 预算截断 + 按 position 分发，对齐酒馆 checkWorldInfo 的行为
import { baseChatReplace } from './macros.js';
import { countTokens } from './tokens.js';

export const POSITION = { before: 0, after: 1, ANTop: 2, ANBottom: 3, atDepth: 4, EMTop: 5, EMBottom: 6, outlet: 7 };

// order 降序，与酒馆的 sortFn 一致；分发时 unshift 使最终顺序回到升序
const sortFn = (a, b) => b.order - a.order;

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// key 写成 /pattern/flags 时按正则处理，否则按文本匹配
function parseRegexKey(key) {
    const m = /^\/(.+)\/([gimsuy]*)$/.exec(key);
    if (!m) return null;
    try { return new RegExp(m[1], m[2]); } catch { return null; }
}

// matchWholeWords 对中文等价子串匹配，因为中文字符在 JS 正则里都属于 \W
function matchKey(haystack, key, { caseSensitive, matchWholeWords }) {
    const re = parseRegexKey(key);
    if (re) return re.test(haystack);

    const hay = caseSensitive ? haystack : haystack.toLowerCase();
    const needle = caseSensitive ? key : key.toLowerCase();
    if (!needle) return false;

    if (matchWholeWords) {
        const r = new RegExp(`(?:^|\\W)(${escapeRegex(needle)})(?:$|\\W)`, caseSensitive ? '' : 'i');
        return r.test(hay);
    }
    return hay.includes(needle);
}

function isActivated(entry, haystack, opts) {
    if (entry.constant) return true;
    if (!entry.keys.length) return false;
    const o = {
        caseSensitive: entry.caseSensitive ?? opts.caseSensitive,
        matchWholeWords: entry.matchWholeWords ?? opts.matchWholeWords,
    };
    return entry.keys.some((k) => matchKey(haystack, k, o));
}

// chatForWI 最新的在前且已含说话人前缀，返回 before/after/depth 三类分发结果
export function scanWorldInfo(chatForWI, entries, opts = {}) {
    const {
        depth = 2,
        budgetPercent = 25,
        budgetCap = 4000,
        maxContext = 127104,
        caseSensitive = false,
        matchWholeWords = true,
        env = {},
    } = opts;

    // 扫描缓冲区只取 depth 条，与酒馆的 WorldInfoBuffer 一致
    const haystack = chatForWI.slice(0, depth).join('\n');

    let budget = Math.round((budgetPercent / 100) * maxContext);
    if (budgetCap > 0) budget = Math.min(budget, budgetCap);

    const sorted = [...entries].sort(sortFn);
    const activated = [];

    // 与酒馆一致：newContent 无条件累加（含被拒条目），一旦触顶就中止后续全部
    let newContent = '';
    let overflowed = false;
    let used = 0;

    for (const e of sorted) {
        if (overflowed) break;
        if (!isActivated(e, haystack, { caseSensitive, matchWholeWords })) continue;
        const content = baseChatReplace(e.content, env);
        if (!content.trim()) continue;
        newContent += content + '\n';
        const total = countTokens(newContent);
        if (total >= budget) { overflowed = true; continue; }
        used = total;
        activated.push({ ...e, rendered: content.trim() });
    }

    const before = [];
    const after = [];
    const depthGroups = [];

    // 已按降序排列，用 unshift 让最终结果回到 order 升序
    for (const e of [...activated].sort(sortFn)) {
        switch (e.position) {
            case POSITION.before: before.unshift(e.rendered); break;
            case POSITION.after: after.unshift(e.rendered); break;
            case POSITION.atDepth: {
                const i = depthGroups.findIndex((g) => g.depth === e.depth && g.role === e.role);
                if (i !== -1) depthGroups[i].entries.unshift(e.rendered);
                else depthGroups.push({ depth: e.depth, role: e.role, entries: [e.rendered] });
                break;
            }
            default:
                // 本项目的数据只用到 0/1/4，其余位置暂不支持
                break;
        }
    }

    return { before, after, depth: depthGroups, activated, tokens: used, budget, overflowed };
}

// 对应酒馆的 wi_format，把整段世界书包进模板
export function formatWorldInfo(value, wiFormat = '{0}\n') {
    if (!value) return '';
    return wiFormat.split('{0}').join(value);
}
