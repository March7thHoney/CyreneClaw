// 读酒馆的 OpenAI 预设，解析 prompts 与 prompt_order
import fs from 'node:fs';

const GLOBAL_ORDER_ID = 100000;
let cache = null;

export function loadPreset(presetPath) {
    const mtime = fs.statSync(presetPath).mtimeMs;
    if (cache && cache.path === presetPath && cache.mtime === mtime) return cache.preset;

    const raw = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
    const byId = new Map();
    for (const p of raw.prompts || []) byId.set(p.identifier, p);

    // 优先用全局序，取不到就退回第一组
    const orderGroups = raw.prompt_order || [];
    const group = orderGroups.find((g) => g.character_id === GLOBAL_ORDER_ID) || orderGroups[0];
    const order = (group?.order || [])
        .filter((o) => o.enabled)
        .map((o) => byId.get(o.identifier))
        .filter(Boolean);

    const preset = {
        raw,
        byId,
        order,
        markers: order.filter((p) => p.marker).map((p) => p.identifier),
        regexScripts: raw.extensions?.regex_scripts || [],
    };
    cache = { path: presetPath, mtime, preset };
    return preset;
}
