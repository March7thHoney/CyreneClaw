// 建立 Discord 连接，代理注入必须发生在加载 discord.js 之前
import { createRequire } from 'node:module';
import { createLogger } from '../logger.js';

const require = createRequire(import.meta.url);
const log = createLogger('discord');

export function createClient(cfg) {
    const loadDiscord = require('./djs.cjs');
    let sawProxy = false;
    const { djs, dispatcher } = loadDiscord(cfg.discord.proxy || null, (url) => {
        if (!sawProxy) log.info('Gateway 走代理', { 目标: new URL(url).host });
        sawProxy = true;
    });

    const { Client, GatewayIntentBits: I, Partials: P } = djs;
    const client = new Client({
        // GuildExpressions 只为表情与贴纸的增删改事件，清单快照靠它保持新鲜
        intents: [I.Guilds, I.GuildMessages, I.MessageContent, I.DirectMessages, I.GuildExpressions],
        // 没有 Channel 分片，私聊消息事件根本不会触发
        partials: [P.Channel, P.Message],
        ...(dispatcher ? { rest: { agent: dispatcher } } : {}),
    });

    // patch 若因 discord.js 升级而失效，这里是唯一能及时发现的地方
    if (cfg.discord.proxy) {
        setTimeout(() => {
            if (!sawProxy) log.error('已配置代理但 Gateway 未走代理，ws 补丁可能失效，请检查 djs.cjs');
        }, 15000);
    }

    return { client, djs };
}
