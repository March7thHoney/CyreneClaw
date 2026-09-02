// 发给 bridge 前把消息里的图片路径展开成 OpenAI 内容块
import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '../logger.js';

const log = createLogger('llm');

// 只允许读 <dataDir>/images 之内的文件
function readDataUrl(dataDir, img) {
    const root = path.resolve(dataDir, 'images');
    const full = path.resolve(dataDir, img.file);
    if (!full.startsWith(root + path.sep)) throw new Error('路径越界');
    return `data:${img.mime};base64,${fs.readFileSync(full).toString('base64')}`;
}

// 无图时原样返回，有图时返回新数组，入参不动
export function materializeImages(messages, dataDir) {
    if (!messages.some((m) => m.images?.length)) return messages;
    return messages.map((m) => {
        if (!m.images?.length) {
            const rest = { ...m };
            delete rest.images;
            return rest;
        }
        const parts = [];
        for (const img of m.images) {
            try {
                parts.push({ type: 'image_url', image_url: { url: readDataUrl(dataDir, img) } });
            } catch (e) {
                log.warn('图片读取失败，跳过', { file: img.file, err: e?.message });
            }
        }
        if (!parts.length) return { role: m.role, content: m.content };
        const text = m.content ? [{ type: 'text', text: m.content }] : [];
        return { role: m.role, content: [...text, ...parts] };
    });
}
