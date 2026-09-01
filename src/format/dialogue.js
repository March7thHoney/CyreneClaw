// 从模型正文里抽取角色说出口的话：只保留「」内的对白，丢弃动作与场景描写
const PUNCT = /[\s，。！？；：、…—～·「」『』（）《》〈〉【】“”‘’,.!?;:]/;

// 用深度计数扫描「」，正确处理模型偶尔写出的嵌套引号
export function scanQuotes(line) {
    const spans = [];
    let depth = 0;
    let start = -1;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '「') {
            if (depth === 0) start = i;
            depth++;
        } else if (ch === '」') {
            if (depth > 0) {
                depth--;
                if (depth === 0) spans.push({ open: start, inner: line.slice(start + 1, i), closed: true });
            }
        }
    }
    // 未闭合时取到行尾，宁可多发也不要把整句丢掉
    if (depth > 0 && start >= 0) spans.push({ open: start, inner: line.slice(start + 1), closed: false });
    return spans;
}

// 三条同时成立才算对白，用来挡掉把引号当书名号的专名
function isDialogue(span, line) {
    const prev = span.open > 0 ? line[span.open - 1] : null;
    if (prev !== null && !PUNCT.test(prev)) return false;
    const inner = span.inner.trim();
    if (inner.length < 2) return false;
    if (!inner.includes('♪') && inner.length < 5) return false;
    return true;
}

// 从已剥离注释的正文里抽出对白，抽不到时返回空串
export function extractDialogue(text, opts = {}) {
    const { joinSeparator = ' ' } = opts;
    if (!text) return '';
    const src = String(text);

    // 先对全文扫描，避免按行预切把跨行的引号截断
    const spans = scanQuotes(src).filter((s) => isDialogue(s, src));
    if (!spans.length) return '';

    const groups = [];
    let prevEnd = -1;
    for (const s of spans) {
        const inner = s.inner.replace(/\s*\n\s*/g, ' ').trim();
        if (!inner) continue;
        // 两段对白之间只要出现引号外的换行，就算新的一段
        const between = prevEnd >= 0 ? src.slice(prevEnd, s.open) : '';
        const newParagraph = prevEnd < 0 || between.includes('\n');
        if (newParagraph) groups.push([inner]);
        else groups[groups.length - 1].push(inner);
        prevEnd = s.open + s.inner.length + (s.closed ? 2 : 1);
    }
    return groups.map((g) => g.join(joinSeparator)).join('\n');
}

// 把正文切成台词与场景描写两种片段，供本机聊天分色显示
export function segmentText(text) {
    if (!text) return [];
    const src = String(text);
    const spans = scanQuotes(src).filter((s) => isDialogue(s, src));
    const out = [];
    const push = (kind, raw) => {
        if (raw) out.push({ kind, text: raw });
    };
    let cursor = 0;
    for (const s of spans) {
        push('narration', src.slice(cursor, s.open));
        cursor = s.open + s.inner.length + (s.closed ? 2 : 1);
        push('dialogue', src.slice(s.open, cursor));
    }
    push('narration', src.slice(cursor));
    return out;
}
