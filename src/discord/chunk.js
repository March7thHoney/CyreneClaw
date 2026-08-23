// 把长文本切成 Discord 单条消息能容纳的片段
const FENCE_RE = /^( {0,3})(`{3,}|~{3,})(.*)$/;

// 单行超长时优先在空白处断开
function splitLongLine(line, limit) {
    const out = [];
    let rest = line;
    while (rest.length > limit) {
        let cut = rest.lastIndexOf(' ', limit);
        if (cut < limit * 0.6) cut = limit;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut).replace(/^\s+/, '');
    }
    if (rest) out.push(rest);
    return out;
}

// 按 maxChars 切分，返回片段数组
export function chunkText(text, { maxChars = 1900 } = {}) {
    if (!text) return [];
    if (text.length <= maxChars) return [text];

    const chunks = [];
    let buf = [];
    let len = 0;
    let fence = null;

    const flush = () => {
        if (!buf.length) return;
        let body = buf.join('\n');
        // 片段结束时若还在代码围栏内，先补上闭合
        if (fence) body += '\n' + fence;
        chunks.push(body);
        buf = fence ? [fence] : [];
        len = fence ? fence.length + 1 : 0;
    };

    for (const rawLine of text.split('\n')) {
        const m = FENCE_RE.exec(rawLine);
        if (m) fence = fence ? null : m[1] + m[2];

        const pieces = rawLine.length > maxChars ? splitLongLine(rawLine, maxChars) : [rawLine];
        for (const line of pieces) {
            if (len + line.length + 1 > maxChars && buf.length) flush();
            buf.push(line);
            len += line.length + 1;
        }
    }
    flush();
    return chunks.filter((c) => c.trim());
}
