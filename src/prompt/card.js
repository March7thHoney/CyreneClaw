// 读 PNG 内嵌角色卡（tEXt chunk），把 v2/v3 结构拍平回顶层字段
import fs from 'node:fs';
import extractChunks from 'png-chunks-extract';
import PNGtext from 'png-chunk-text';

let cache = null;

// 优先取 ccv3，回退 chara，与酒馆的读取顺序一致
function readCardJson(pngPath) {
    const buf = fs.readFileSync(pngPath);
    const chunks = extractChunks(new Uint8Array(buf));
    const texts = chunks.filter((c) => c.name === 'tEXt').map((c) => PNGtext.decode(c.data));
    const pick = (key) => texts.find((t) => t.keyword.toLowerCase() === key);
    const entry = pick('ccv3') || pick('chara');
    if (!entry) throw new Error(`角色卡里没有 chara/ccv3 数据：${pngPath}`);
    return JSON.parse(Buffer.from(entry.text, 'base64').toString('utf8'));
}

// v2 把内容放在 data 下，v1 直接在顶层，这里统一成一份扁平结构
function flatten(raw) {
    const d = raw.data || raw;
    return {
        name: d.name ?? raw.name ?? '',
        description: d.description ?? '',
        personality: d.personality ?? '',
        scenario: d.scenario ?? '',
        first_mes: d.first_mes ?? '',
        mes_example: d.mes_example ?? '',
        system_prompt: d.system_prompt ?? '',
        post_history_instructions: d.post_history_instructions ?? '',
        creator_notes: d.creator_notes ?? '',
        alternate_greetings: d.alternate_greetings ?? [],
        tags: d.tags ?? [],
        character_book: d.character_book ?? null,
        extensions: d.extensions ?? {},
        depth_prompt: d.extensions?.depth_prompt ?? null,
        spec: raw.spec ?? 'chara_card_v1',
        spec_version: raw.spec_version ?? '1.0',
    };
}

export function loadCard(pngPath) {
    const mtime = fs.statSync(pngPath).mtimeMs;
    if (cache && cache.path === pngPath && cache.mtime === mtime) return cache.card;
    const card = flatten(readCardJson(pngPath));
    cache = { path: pngPath, mtime, card };
    return card;
}
