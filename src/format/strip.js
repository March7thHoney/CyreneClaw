// 剥离模型输出里的段末自查注释，与预设内嵌正则保持一致
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const UNCLOSED_COMMENT = /<!--[\s\S]*$/;

export function stripComments(text, { dropUnclosed = true } = {}) {
    if (!text) return '';
    let out = String(text).replace(HTML_COMMENT, '');
    // 未闭合的注释会把后文全吃掉，兜底截断避免泄漏到 Discord
    if (dropUnclosed && out.includes('<!--')) out = out.replace(UNCLOSED_COMMENT, '');
    return out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

// 兜底过滤幕后信息：CLI 会把账号邮箱注入系统提示，被复述就会发到公开频道
export function redact(text, opts = {}) {
    const { enabled = true, emails = true, extraPatterns = [] } = opts;
    if (!enabled || !text) return { text, hits: [] };
    let out = text;
    const hits = [];
    if (emails && EMAIL.test(out)) {
        EMAIL.lastIndex = 0;
        hits.push('email');
        out = out.replace(EMAIL, '');
    }
    for (const p of extraPatterns) {
        if (!p) continue;
        try {
            const re = new RegExp(p, 'g');
            if (re.test(out)) { hits.push(p); out = out.replace(new RegExp(p, 'g'), ''); }
        } catch { /* 无效模式直接忽略 */ }
    }
    return { text: out, hits };
}
