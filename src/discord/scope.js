// 把一条 Discord 消息归一化成独立上下文的标识
import path from 'node:path';

// 私聊按用户归档因为 DM 频道 id 重开会变，服务器按频道归档以实现每频道独立上下文
export function scopeOf(message) {
    if (!message.guildId) {
        const uid = message.author?.id || message.channelId;
        return { kind: 'dm', key: `dm/${uid}`, label: '私聊', channelId: message.channelId };
    }
    return {
        kind: 'guild',
        key: `guild/${message.guildId}/${message.channelId}`,
        label: `#${message.channel?.name ?? message.channelId}`,
        guildId: message.guildId,
        channelId: message.channelId,
    };
}

export function scopeFilePath(dataDir, scope) {
    return path.join(dataDir, 'chats', ...scope.key.split('/')) + '.jsonl';
}

export function archiveFilePath(dataDir, scope, stamp) {
    return path.join(dataDir, 'archive', ...scope.key.split('/'), `${stamp}.jsonl`);
}
