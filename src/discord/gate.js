// 触发判定：谁能让角色开口，以及在什么情况下开口
import { createLogger } from '../logger.js';
import { userRule, userDisplayName } from './users.js';

const log = createLogger('gate');

// 返回 {act:'ignore'|'reply', reason}
export function decide(message, { cfg, botId, repliedToBot }) {
    const d = cfg.discord;

    if (message.author?.bot) return { act: 'ignore', reason: '来自机器人' };

    const user = userRule(cfg, message.author?.id);
    if (!user) return { act: 'ignore', reason: '用户未授权' };

    if (!message.guildId) {
        if (!user.dmEnabled) return { act: 'ignore', reason: '私聊已关闭' };
        // 私聊永远不需要 @
        return { act: 'reply', reason: '私聊', trigger: 'dm' };
    }

    const guild = d.guilds?.[message.guildId];
    if (d.groupPolicy === 'allowlist' && !guild) {
        return { act: 'ignore', reason: '服务器不在白名单' };
    }

    const channels = guild?.channels;
    if (Array.isArray(channels) && channels.length && !channels.includes(message.channelId)) {
        return { act: 'ignore', reason: '频道不在白名单' };
    }

    const mentioned = botId && message.mentions?.users?.has(botId);
    if (user.mentionEnabled && mentioned) return { act: 'reply', reason: '被提及', trigger: 'mention' };
    // 回复角色自己的消息等同于提及
    if (user.mentionEnabled && repliedToBot) return { act: 'reply', reason: '回复了角色', trigger: 'mention' };

    // 走到这里说明只差一个提及，是否放行交给群聊节奏
    return { act: 'ignore', reason: '未触发提及回复', cadence: user.cadenceEnabled };
}

// 队列真正开始生成时再次检查权限，已撤权的输入不进入模型与记忆。
export function filterQueuedBatch(scope, batch, cfg) {
    return batch.filter((item) => {
        const user = userRule(cfg, item.authorId);
        if (!user) return false;
        if (scope.kind === 'dm') return user.dmEnabled;
        const guild = cfg.discord.guilds?.[scope.guildId];
        if (cfg.discord.groupPolicy === 'allowlist' && !guild) return false;
        if (Array.isArray(guild?.channels) && guild.channels.length && !guild.channels.includes(scope.channelId)) return false;
        return item.trigger === 'mention' ? user.mentionEnabled : item.trigger === 'cadence' && user.cadenceEnabled;
    }).map((item) => ({ ...item, authorName: userDisplayName(cfg, item.authorId, item.fallbackAuthorName) }));
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
