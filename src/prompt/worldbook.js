// 读酒馆世界书 JSON，归一化条目字段
import fs from 'node:fs';
import path from 'node:path';

const cache = new Map();

function normalize(e, bookName) {
    return {
        uid: e.uid,
        book: bookName,
        keys: (e.key || []).filter(Boolean),
        keysecondary: (e.keysecondary || []).filter(Boolean),
        comment: e.comment || '',
        content: e.content || '',
        constant: !!e.constant,
        disable: !!e.disable,
        order: Number.isFinite(e.order) ? e.order : 100,
        position: Number.isFinite(e.position) ? e.position : 0,
        depth: Number.isFinite(e.depth) ? e.depth : 4,
        role: Number.isFinite(e.role) ? e.role : 0,
        selective: !!e.selective,
        selectiveLogic: Number.isFinite(e.selectiveLogic) ? e.selectiveLogic : 0,
        excludeRecursion: !!e.excludeRecursion,
        preventRecursion: !!e.preventRecursion,
        caseSensitive: e.caseSensitive ?? null,
        matchWholeWords: e.matchWholeWords ?? null,
        probability: Number.isFinite(e.probability) ? e.probability : 100,
        useProbability: e.useProbability !== false,
        displayIndex: Number.isFinite(e.displayIndex) ? e.displayIndex : 0,
    };
}

export function loadWorldBooks(paths) {
    const out = [];
    for (const p of paths) {
        const mtime = fs.statSync(p).mtimeMs;
        const hit = cache.get(p);
        if (hit && hit.mtime === mtime) { out.push(...hit.entries); continue; }

        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        const bookName = path.basename(p, '.json');
        const entries = Object.values(raw.entries || {})
            .map((e) => normalize(e, bookName))
            .filter((e) => !e.disable);
        cache.set(p, { mtime, entries });
        out.push(...entries);
    }
    return out;
}
