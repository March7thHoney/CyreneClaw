// 全项目唯一的 CJS 模块：ESM 下 @discordjs/ws 的具名导入在链接期快照，改写无效
'use strict';

let cached = null;
let patchHit = false;

// 记录 patch 是否真的被调用过，供启动自检使用
function wasPatchHit() {
    return patchHit;
}

function loadDiscord(proxyUrl, onGatewayConnect) {
    if (cached) return cached;

    let dispatcher = null;
    if (proxyUrl) {
        // 解析到 discord.js 依赖树里的那份 ws，避免装了多副本时打错目标
        const wsPath = require.resolve('ws', { paths: [require.resolve('@discordjs/ws')] });
        const wsmod = require(wsPath);
        const BaseWebSocket = wsmod.WebSocket;
        const { HttpsProxyAgent } = require('https-proxy-agent');
        const agent = new HttpsProxyAgent(proxyUrl);

        class ProxiedWebSocket extends BaseWebSocket {
            constructor(address, protocols, options) {
                patchHit = true;
                if (typeof onGatewayConnect === 'function') onGatewayConnect(String(address));
                super(address, protocols, { ...(options || {}), agent });
            }
        }
        // 同时替换具名导出与默认导出，覆盖 ws 的两种引入写法
        wsmod.WebSocket = ProxiedWebSocket;
        if (wsmod.default) wsmod.default = ProxiedWebSocket;

        const undiciPath = require.resolve('undici', { paths: [require.resolve('@discordjs/rest')] });
        const { ProxyAgent } = require(undiciPath);
        dispatcher = new ProxyAgent(proxyUrl);
    }

    // 这一刻 @discordjs/ws 才被求值，此时它拿到的已是替身
    cached = { djs: require('discord.js'), dispatcher, wasPatchHit };
    return cached;
}

module.exports = loadDiscord;
module.exports.wasPatchHit = wasPatchHit;
