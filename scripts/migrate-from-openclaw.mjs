// 从本机 openclaw 配置生成 config.json，只写本地，不打印任何机密值
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OPENCLAW = path.join(os.homedir(), '.openclaw');
const OUT = path.join(ROOT, 'config.json');

function readJson(p) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

const oc = readJson(path.join(OPENCLAW, 'openclaw.json'));
if (!oc) {
    console.error(`读不到 ${path.join(OPENCLAW, 'openclaw.json')}，请手工填写 config.json`);
    process.exit(1);
}
const dc = oc.channels?.discord || {};

// owner 优先取 DM 白名单文件，回退到任一 guild 的 users 首项
const allowFile = readJson(path.join(OPENCLAW, 'credentials', 'discord-default-allowFrom.json'));
let ownerId = allowFile?.allowFrom?.[0] || '';
if (!ownerId) {
    for (const g of Object.values(dc.guilds || {})) {
        if (Array.isArray(g?.users) && g.users.length) { ownerId = g.users[0]; break; }
    }
}
ownerId = String(ownerId).replace(/^(discord|user):/, '');

const guilds = {};
for (const [gid, g] of Object.entries(dc.guilds || {})) {
    guilds[gid] = { requireMention: g?.requireMention ?? true, channels: null };
}

const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.example.json'), 'utf8'));
tpl.discord.token = dc.token || '';
tpl.discord.proxy = dc.proxy || '';
tpl.discord.owner.userId = ownerId;
tpl.discord.groupPolicy = dc.groupPolicy || 'allowlist';
tpl.discord.guilds = guilds;

if (fs.existsSync(OUT)) {
    console.error(`${OUT} 已存在，为避免覆盖已中止。要重新生成请先手工备份并删除。`);
    process.exit(1);
}
fs.writeFileSync(OUT, JSON.stringify(tpl, null, 2) + '\n');

console.log('已生成 config.json（token 与 ID 已写入，未在此打印）');
console.log(`  token 长度: ${String(tpl.discord.token).length}`);
console.log(`  proxy: ${tpl.discord.proxy || '(未设置)'}`);
console.log(`  owner userId: ${ownerId ? '已填入' : '未找到，请手工填写'}`);
console.log(`  服务器数量: ${Object.keys(guilds).length}`);
console.log('仍需手工填写：sillytavern.dataDir / characterFile / presetFile / worldBooks、');
console.log('               discord.owner.displayName、prompt.personaDescription、prompt.discordContract');
