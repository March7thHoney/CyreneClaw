// 服务器、频道、表情、贴纸的清单快照，控制台 App 直接读这个文件渲染下拉与选图面板
import fs from 'node:fs';
import path from 'node:path';
import { request, ProxyAgent } from 'undici';
import { createLogger } from '../logger.js';

const log = createLogger('directory');
const FILE = 'discord-directory.json';
const EMOJI_DIR = 'expressions/emoji';
const STICKER_DIR = 'expressions/sticker';
const DEBOUNCE_MS = 3000;
const CONCURRENCY = 5;

// 顶层 undici 7 不能复用 rest 内嵌的 dispatcher，代理得自己建一个
let agent;
let agentReady = false;
export function proxyAgent(proxy) {
    if (!agentReady) { agent = proxy ? new ProxyAgent(proxy) : undefined; agentReady = true; }
    return agent;
}

function emojiUrl(id, animated) {
    return `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=64`;
}

// Lottie 贴纸是 JSON，渲染不了就不下载
function stickerAsset(sticker) {
    if (sticker.format === 4) return { ext: 'gif', url: `https://media.discordapp.net/stickers/${sticker.id}.gif` };
    if (sticker.format === 1 || sticker.format === 2) return { ext: 'png', url: `https://cdn.discordapp.com/stickers/${sticker.id}.png?size=160` };
    return null;
}

async function download(url, dest, dispatcher) {
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

async function runPool(jobs, limit) {
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
        while (next < jobs.length) await jobs[next++]();
    });
    await Promise.all(workers);
}

function collectChannels(guild, djs) {
    const { ChannelType } = djs;
    const me = guild.members.me;
    const out = [];
    for (const [, ch] of guild.channels.cache) {
        if (ch.type !== ChannelType.GuildText && ch.type !== ChannelType.GuildAnnouncement) continue;
        // 看不见或发不了言的频道列出来只会让人选中一个发不出去的目标
        if (me && !ch.permissionsFor(me)?.has(['ViewChannel', 'SendMessages'])) continue;
        out.push({ id: ch.id, name: ch.name });
    }
    out.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    return out;
}

async function collectStickers(guild) {
    try { await guild.stickers.fetch(); } catch { /* 拿不到就用 GUILD_CREATE 带下来的那份 */ }
    return [...guild.stickers.cache.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
}

// 图片按 id 缓存，同一个 id 的内容不会变，磁盘上有就不再下
function assetJobs(pending, dispatcher, downloads) {
    return pending.filter((it) => !fs.existsSync(it.dest)).map((it) => async () => {
        try {
            await download(it.url, it.dest, dispatcher);
            downloads.ok++;
        } catch (e) {
            downloads.failed.push(`${it.entry.name}: ${e?.message}`);
            it.entry.image = '';
        }
    });
}

export async function buildDirectory({ client, djs, cfg }) {
    const base = cfg.chat.dataDir;
    const emojiDir = path.join(base, EMOJI_DIR);
    const stickerDir = path.join(base, STICKER_DIR);
    await fs.promises.mkdir(emojiDir, { recursive: true });
    await fs.promises.mkdir(stickerDir, { recursive: true });

    const dispatcher = proxyAgent(cfg.discord.proxy || null);
    const downloads = { ok: 0, failed: [] };
    const pending = [];
    const guilds = [];

    for (const [, guild] of client.guilds.cache) {
        const emojis = [...guild.emojis.cache.values()].map((e) => {
            const file = `${e.id}.${e.animated ? 'gif' : 'png'}`;
            const entry = {
                id: e.id,
                name: e.name,
                animated: Boolean(e.animated),
                token: `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`,
                image: `${EMOJI_DIR}/${file}`,
            };
            pending.push({ dest: path.join(emojiDir, file), url: emojiUrl(e.id, e.animated), entry });
            return entry;
        }).sort((a, b) => a.name.localeCompare(b.name, 'zh'));

        const stickers = (await collectStickers(guild)).map((s) => {
            const asset = stickerAsset(s);
            const file = asset ? `${s.id}.${asset.ext}` : '';
            const entry = { id: s.id, name: s.name, format: s.format, image: asset ? `${STICKER_DIR}/${file}` : '' };
            if (asset) pending.push({ dest: path.join(stickerDir, file), url: asset.url, entry });
            return entry;
        });

        guilds.push({ id: guild.id, name: guild.name, channels: collectChannels(guild, djs), emojis, stickers });
    }

    await runPool(assetJobs(pending, dispatcher, downloads), CONCURRENCY);

    guilds.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    const snapshot = { updatedAt: new Date().toISOString(), guilds };
    const file = path.join(base, FILE);
    const tmp = `${file}.tmp`;
    await fs.promises.writeFile(tmp, `${JSON.stringify(snapshot, null, 4)}\n`);
    await fs.promises.rename(tmp, file);

    log.info('清单已更新', {
        服务器数: guilds.length,
        频道数: guilds.reduce((n, g) => n + g.channels.length, 0),
        表情数: guilds.reduce((n, g) => n + g.emojis.length, 0),
        贴纸数: guilds.reduce((n, g) => n + g.stickers.length, 0),
        新下载: downloads.ok,
    });
    if (downloads.failed.length) log.warn('部分图片没下下来', { 数量: downloads.failed.length, 首个: downloads.failed[0] });
}

// 一次改动会连打好几个事件，攒一下再重建
export function createDirectoryRefresher({ client, djs, cfg }) {
    let timer = null;
    let running = false;
    let again = false;
    const run = async () => {
        if (running) { again = true; return; }
        running = true;
        try {
            await buildDirectory({ client, djs, cfg });
        } catch (e) {
            log.error('清单生成失败', { err: e?.message });
        } finally {
            running = false;
            if (again) { again = false; run(); }
        }
    };
    return () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; run(); }, DEBOUNCE_MS);
        timer.unref();
    };
}
