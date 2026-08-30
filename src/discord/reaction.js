// 回复发出后给触发这一轮的那条消息补一个服务器自定义表情反应
import { createLogger } from '../logger.js';

const log = createLogger('reaction');
const TOKEN_RE = /^<(a?):([A-Za-z0-9_~]{2,32}):(\d{17,20})>$/;

// 配置里存的是消息正文用的 <:名字:ID>，反应接口要的是 名字:ID
function toIdentifier(token) {
    const m = TOKEN_RE.exec(token || '');
    return m ? `${m[1] ? 'a:' : ''}${m[2]}:${m[3]}` : null;
}

export async function reactToTrigger(channel, messageId, cfg) {
    const guildId = channel?.guildId;
    if (!guildId || !messageId) return;
    const identifier = toIdentifier(cfg.discord.reaction?.[guildId]);
    if (!identifier) return;
    try {
        // 走 MessageManager 而不是 message.react，这里手上只有裸的消息 ID
        await channel.messages.react(messageId, identifier);
    } catch (e) {
        // 缺权限、表情被删、消息被删都归这里，反应失败不该影响这一轮回复
        log.warn('表情反应失败', { 服务器: guildId, 表情: identifier, err: e?.message });
    }
}
