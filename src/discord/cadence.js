// 每个用户在每个频道独立累计未被回应的有效消息。
import { createLogger } from '../logger.js';

const log = createLogger('cadence');

export class Cadence {
    constructor(cfg) {
        this.counters = new Map();
        this.reconfigure(cfg);
    }

    // 阈值修改保留计数，关闭权限或删除用户清除对应计数。
    reconfigure(cfg) {
        this.users = new Map(cfg.discord.users.filter((user) => user.cadenceEnabled).map((user) => [user.userId, user.replyEveryN]));
        for (const key of this.counters.keys()) {
            if (!this.users.has(key.split(':')[1])) this.counters.delete(key);
        }
    }

    bump(channelId, userId) {
        const n = this.users.get(userId);
        if (!n) return false;
        const key = `${channelId}:${userId}`;
        const count = (this.counters.get(key) || 0) + 1;
        if (count >= n) {
            this.counters.set(key, 0);
            log.info('节奏触发', { 频道: channelId, 用户: userId, 阈值: n });
            return true;
        }
        this.counters.set(key, count);
        log.debug('节奏计数', { 频道: channelId, 用户: userId, 进度: `${count}/${n}` });
        return false;
    }

    reset(channelId, userId) {
        if (userId) { this.counters.delete(`${channelId}:${userId}`); return; }
        for (const key of this.counters.keys()) if (key.startsWith(`${channelId}:`)) this.counters.delete(key);
    }

    // 图片下载全部失败时退回到下条有效消息可触发的位置。
    refund(channelId, userId) {
        const n = this.users.get(userId);
        if (n) this.counters.set(`${channelId}:${userId}`, n - 1);
    }
}
