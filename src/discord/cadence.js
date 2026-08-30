// 群聊节奏：owner 每说满 N 条没被回应的话，强制回一次
import { createLogger } from '../logger.js';

const log = createLogger('cadence');

export class Cadence {
    constructor(cfg) {
        this.counters = new Map();
        this.reconfigure(cfg);
    }

    // 控制台改了开关或阈值就地生效，计数不清零
    reconfigure(cfg) {
        const c = cfg.discord.cadence || {};
        this.guilds = cfg.discord.guilds || {};
        this.enabled = c.enabled === true;
        this.defaultN = Math.max(1, Number(c.replyEveryN) || 10);
    }

    // 服务器可单独覆盖阈值，缺省继承全局值
    thresholdFor(guildId) {
        const n = Number(this.guilds[guildId]?.replyEveryN);
        return n >= 1 ? Math.floor(n) : this.defaultN;
    }

    // 这一条本来会被忽略，问节奏要不要把它翻成回复
    bump(channelId, guildId) {
        if (!this.enabled) return false;
        const n = this.thresholdFor(guildId);
        const c = (this.counters.get(channelId) || 0) + 1;
        if (c >= n) {
            this.counters.set(channelId, 0);
            log.info('节奏触发', { 频道: channelId, 阈值: n });
            return true;
        }
        this.counters.set(channelId, c);
        log.debug('节奏计数', { 频道: channelId, 进度: `${c}/${n}` });
        return false;
    }

    reset(channelId) { this.counters.delete(channelId); }
}
