// 分段发送 + 限流重试，并禁掉一切提及
import { chunkText } from './chunk.js';
import { createLogger } from '../logger.js';

const log = createLogger('send');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isRetryable(err) {
    const code = err?.status ?? err?.httpStatus;
    return code === 429 || (code >= 500 && code < 600);
}

async function sendWithRetry(channel, payload, retry) {
    const { attempts = 3, minDelayMs = 1000, maxDelayMs = 30000 } = retry || {};
    let delay = minDelayMs;
    for (let i = 1; i <= attempts; i++) {
        try {
            return await channel.send(payload);
        } catch (err) {
            if (i === attempts || !isRetryable(err)) throw err;
            const retryAfter = Number(err?.retry_after ?? err?.retryAfter);
            const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : delay;
            log.warn(`发送失败，第 ${i} 次重试`, { 等待毫秒: wait });
            await sleep(Math.min(wait, maxDelayMs));
            delay = Math.min(delay * 2, maxDelayMs);
        }
    }
}

// 返回已发出的消息 id 列表
export async function sendText(channel, text, cfg) {
    const s = cfg.discord.send;
    const chunks = chunkText(text, { maxChars: s.maxChars });
    const ids = [];
    for (let i = 0; i < chunks.length; i++) {
        // 彻底禁掉 @everyone / @here / 角色提及，角色不该有能力打扰别人
        const msg = await sendWithRetry(channel, {
            content: chunks[i],
            allowedMentions: { parse: [] },
        }, s.retry);
        if (msg?.id) ids.push(msg.id);
        if (i < chunks.length - 1 && s.delayMs) await sleep(s.delayMs);
    }
    return ids;
}
