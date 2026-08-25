// 把台词洗成适合朗读的纯文本：TTS 读不了 Markdown、表情码与括号里的动作
const CUT_PUNCT = /[。！？…～!?]/;

// 截断优先切在句末，否则听感是话说一半被掐掉
function truncate(text, maxChars) {
    if (text.length <= maxChars) return text;
    const head = text.slice(0, maxChars);
    for (let i = head.length - 1; i >= Math.floor(maxChars * 0.5); i--) {
        if (CUT_PUNCT.test(head[i])) return head.slice(0, i + 1);
    }
    return head;
}

// 输入已是 extractDialogue 的产物，只需再抹掉朗读不出来的残留
export function stripForSpeech(text, { maxChars = 240 } = {}) {
    if (!text) return '';
    const cleaned = String(text)
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/https?:\/\/\S+/g, '')
        // 自定义表情整体删掉，旧版只删了尖括号导致 id 被念出来
        .replace(/<a?:\w+:\d+>/g, '')
        .replace(/<@!?&?\d+>/g, '')
        // 模型偶尔在台词里夹动作描写，念出来很出戏
        .replace(/[（(][^）)]{0,30}[）)]/g, '')
        .replace(/[*_~>#|「」『』♪]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return truncate(cleaned, maxChars).trim();
}
