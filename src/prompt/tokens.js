// token 计数：优先 o200k_base，失败回退中文加权字符估算
let encode = null;
let mode = 'estimate';

export async function initTokenizer(kind = 'o200k') {
    if (kind === 'estimate') { mode = 'estimate'; return mode; }
    try {
        const m = await import('gpt-tokenizer/encoding/o200k_base');
        encode = m.encode;
        mode = 'o200k';
    } catch {
        mode = 'estimate';
    }
    return mode;
}

export function tokenizerMode() { return mode; }

// 中日韩字符按 0.72、其余按 1/3.6 折算，与 o200k 误差约 5%
function estimate(text) {
    let cjk = 0;
    for (const ch of text) {
        const c = ch.codePointAt(0);
        if ((c >= 0x3000 && c <= 0x9fff) || (c >= 0xff00 && c <= 0xffef)) cjk++;
    }
    const other = [...text].length - cjk;
    return Math.ceil(cjk * 0.72 + other / 3.6);
}

export function countTokens(text) {
    if (!text) return 0;
    if (encode) { try { return encode(text).length; } catch { /* 落到估算 */ } }
    return estimate(text);
}

// 每条消息的角色与分隔符开销，沿用 OpenAI 的经验值
export function countMessageTokens(msg) {
    return countTokens(msg?.content || '') + 4;
}

export function countMessagesTokens(msgs) {
    return (msgs || []).reduce((s, m) => s + countMessageTokens(m), 0);
}
