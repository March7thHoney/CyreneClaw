// 对话示例拆分，对齐酒馆的 parseMesExamples + parseExampleIntoIndividual
const BLOCK_HEADING = '{Example Dialogue:}\n';

// 按 <START> 切块，每块补回块头
export function parseMesExamples(examplesStr) {
    if (!examplesStr || examplesStr === '<START>') return [];
    let s = examplesStr;
    if (!s.startsWith('<START>')) s = '<START>\n' + s.trim();
    return s.split(/<START>/gi).slice(1).map((b) => `${BLOCK_HEADING}${b.trim()}\n`);
}

// 把示例块拆成交替的 example_user / example_assistant，首行是块头需跳过
export function parseExampleIntoIndividual(block, { userName, charName }) {
    const result = [];
    const lines = block.split('\n');
    let cur = [];
    let inUser = false;
    let inBot = false;

    // 只剥掉第一次出现的说话人前缀，与酒馆的单次 replace 一致
    const addMsg = (name, systemName) => {
        const parsed = cur.join('\n').replace(name + ':', '').trim();
        result.push({ role: 'system', content: parsed, name: systemName });
        cur = [];
    };

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith(userName + ':')) {
            if (inBot) addMsg(charName, 'example_assistant');
            inUser = true;
            inBot = false;
        } else if (line.startsWith(charName + ':')) {
            if (inUser) addMsg(userName, 'example_user');
            inBot = true;
            inUser = false;
        }
        cur.push(line);
    }
    if (inUser) addMsg(userName, 'example_user');
    else if (inBot) addMsg(charName, 'example_assistant');
    return result;
}

export function buildDialogueExamples(mesExamples, names) {
    const out = [];
    for (const block of parseMesExamples(mesExamples)) {
        out.push(...parseExampleIntoIndividual(block, names));
    }
    return out;
}
