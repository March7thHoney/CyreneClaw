// 触发判定：谁能让角色开口，以及在什么情况下开口
import { createLogger } from '../logger.js';

const log = createLogger('gate');

// 返回 {act:'ignore'|'reply', reason}
export function decide(message, { cfg, botId, repliedToBot }) {
    const d = cfg.discord;

    if (message.author?.bot) return { act: 'ignore', reason: '来自机器人' };

    // 只回应 owner 本人，按 ID 精确匹配，不做用户名匹配
    if (message.author?.id !== d.owner.userId) return { act: 'ignore', reason: '非 owner' };

    if (!message.guildId) {
        if (d.dm?.enabled === false) return { act: 'ignore', reason: '私聊已关闭' };
        // 私聊永远不需要 @
        return { act: 'reply', reason: '私聊' };
    }

    const guild = d.guilds?.[message.guildId];
    if (d.groupPolicy === 'allowlist' && !guild) {
        return { act: 'ignore', reason: '服务器不在白名单' };
    }

    const channels = guild?.channels;
    if (Array.isArray(channels) && channels.length && !channels.includes(message.channelId)) {
        return { act: 'ignore', reason: '频道不在白名单' };
    }

    const requireMention = guild?.requireMention ?? true;
    if (!requireMention) return { act: 'reply', reason: '该频道无需提及' };

    const mentioned = botId && message.mentions?.users?.has(botId);
    if (mentioned) return { act: 'reply', reason: '被提及' };
    // 回复角色自己的消息等同于提及
    if (repliedToBot) return { act: 'reply', reason: '回复了角色' };

    // 走到这里说明只差一个提及，是否放行交给群聊节奏
    return { act: 'ignore', reason: '未提及', cadence: true };
}

// 把 <@id> 这类提及从正文里剥掉，避免污染上下文
export function stripMentions(content, botId) {
    if (!content) return '';
    return content
        .replace(new RegExp(`<@!?${botId}>`, 'g'), '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

export { log as gateLog };
