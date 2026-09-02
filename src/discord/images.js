// Discord 图片附件：按元数据筛选、下载落盘、定期清理
import fs from 'node:fs';
import path from 'node:path';
import { request } from 'undici';
import { createLogger } from '../logger.js';
import { proxyAgent } from './directory.js';

const log = createLogger('images');

// bridge 只认这几种类型，其余附件一律当作非图片
export const IMAGE_MIMES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const EXT_MIMES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const SWEEP_MS = 6 * 3600 * 1000;
const TMP_TTL_MS = 3600 * 1000;

function num(v, d) {
    const n = Number(v);
    return v == null || !Number.isFinite(n) ? d : n;
}

export function imageConfig(cfg) {
    const c = cfg.discord?.images || {};
    return {
        enabled: c.enabled !== false,
        maxPerMessage: Math.max(0, Math.floor(num(c.maxPerMessage, 4))),
        maxBytes: Math.max(0, num(c.maxBytes, 10 * 1024 * 1024)),
        maxPerRequest: Math.max(0, Math.floor(num(c.maxPerRequest, 6))),
        retentionDays: num(c.retentionDays, 7),
    };
}

// contentType 取分号前的部分，缺失时按文件名后缀推断
function mimeOf(att) {
    const ct = String(att.contentType || '').split(';')[0].trim().toLowerCase();
    if (ct) return ct;
    const ext = path.extname(String(att.name || '')).slice(1).toLowerCase();
    return EXT_MIMES[ext] || '';
}

// 只看元数据不做 I/O，返回符合类型与大小限制的附件清单
export function pickImages(message, imgCfg) {
    if (!imgCfg.enabled || !message?.attachments?.size) return [];
    const out = [];
    let index = 0;
    for (const att of message.attachments.values()) {
        const i = index++;
        if (out.length >= imgCfg.maxPerMessage) break;
        const mime = mimeOf(att);
        const ext = IMAGE_MIMES[mime];
        if (!ext) continue;
        if (att.size > imgCfg.maxBytes) {
            log.debug('图片超过大小上限，跳过', { name: att.name, size: att.size });
            continue;
        }
        out.push({ sourceId: message.id, index: i, url: att.url, mime, ext, name: att.name || `image.${ext}`, size: att.size });
    }
    return out;
}

async function fetchTo(url, dest, dispatcher) {
    const res = await request(url, { dispatcher, headersTimeout: 30000, bodyTimeout: 60000 });
    if (res.statusCode !== 200) {
        await res.body.dump();
        throw new Error(`HTTP ${res.statusCode}`);
    }
    const buf = Buffer.from(await res.body.arrayBuffer());
    const tmp = `${dest}.tmp`;
    await fs.promises.writeFile(tmp, buf);
    await fs.promises.rename(tmp, dest);
}

// 落盘到 <dataDir>/images/<scope.key>/<消息ID>-<序号>.<ext>，已存在的直接复用
export async function downloadImages(picked, { scope, dataDir, proxy }) {
    if (!picked.length) return [];
    const relDir = path.posix.join('images', ...scope.key.split('/'));
    const dir = path.join(dataDir, ...relDir.split('/'));
    await fs.promises.mkdir(dir, { recursive: true });
    const dispatcher = proxyAgent(proxy);
    const results = await Promise.all(picked.map(async (p) => {
        const base = `${p.sourceId}-${p.index}.${p.ext}`;
        const dest = path.join(dir, base);
        try {
            if (!fs.existsSync(dest)) await fetchTo(p.url, dest, dispatcher);
            return { file: path.posix.join(relDir, base), mime: p.mime, name: p.name };
        } catch (e) {
            log.warn('图片下载失败', { name: p.name, err: e?.message });
            return null;
        }
    }));
    return results.filter(Boolean);
}

export function imageMarker(n) {
    return `[图片×${n}]`;
}

function sweepDir(dir, cutoff, tmpCutoff) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            sweepDir(p, cutoff, tmpCutoff);
            // 非空目录留着
            try { fs.rmdirSync(p); } catch {}
            continue;
        }
        try {
            const { mtimeMs } = fs.statSync(p);
            if (mtimeMs < (ent.name.endsWith('.tmp') ? tmpCutoff : cutoff)) fs.unlinkSync(p);
        } catch (e) {
            log.warn('清理图片失败', { file: p, err: e?.message });
        }
    }
}

// 删除超过保留天数的图片与残留的 .tmp，retentionDays <= 0 时不清理
export function sweepImages(dataDir, retentionDays) {
    if (!(retentionDays > 0)) return;
    const root = path.join(dataDir, 'images');
    if (!fs.existsSync(root)) return;
    const now = Date.now();
    sweepDir(root, now - retentionDays * 86400000, now - TMP_TTL_MS);
}

// 启动时扫一次，之后每 6 小时一次，返回停止函数
export function startImageRetention(cfg) {
    const run = () => {
        try { sweepImages(cfg.chat.dataDir, imageConfig(cfg).retentionDays); } catch (e) { log.warn('图片清理异常', { err: e?.message }); }
    };
    run();
    const timer = setInterval(run, SWEEP_MS);
    timer.unref();
    return () => clearInterval(timer);
}
