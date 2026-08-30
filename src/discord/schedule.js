// 每天固定时刻往指定频道发一条固定文本，整条链路不碰模型也不碰记忆
import { createLogger } from '../logger.js';
import { sendText } from './send.js';

const log = createLogger('schedule');
const TICK_MS = 30 * 1000;

export class Scheduler {
    #cfg;
    #client;
    #voice;
    #sessions;
    #fired = new Set();
    #day = null;
    #timer = null;

    constructor({ cfg, client, voice, sessions }) {
        this.#cfg = cfg;
        this.#client = client;
        this.#voice = voice;
        this.#sessions = sessions;
    }

    get entries() {
        return this.#cfg.discord.schedule || [];
    }

    start() {
        this.#log();
        // 定时器不 unref 会吊住进程不让退出
        this.#timer = setInterval(() => this.#tick(), TICK_MS);
        this.#timer.unref();
        // 开机正好落在目标那一分钟里时，等下一跳就赶不上了
        this.#tick();
    }

    // 排期是每跳现读的，热更新后只需报一下新的清单
    reconfigure() {
        this.#log();
    }

    #log() {
        for (const e of this.entries) log.info('定时消息已排期', { 时刻: e.time, 频道数: e.channels.length });
    }

    stop() {
        if (this.#timer) clearInterval(this.#timer);
        this.#timer = null;
    }

    // 半分钟一跳配整分匹配：同一分钟内重启还补得上，跨过整分就算这天错过了
    #tick() {
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
        if (day !== this.#day) { this.#day = day; this.#fired.clear(); }
        for (const entry of this.entries) {
            if (entry.minutes !== nowMinutes) continue;
            // 按内容而不是下标记账，热改配置后重排也不会被误判成已发过
            const stamp = `${entry.time}|${entry.text}`;
            if (this.#fired.has(stamp)) continue;
            this.#fired.add(stamp);
            this.#fire(entry).catch((e) => log.error('定时消息异常', { 时刻: entry.time, err: e?.message }));
        }
    }

    async #fire(entry) {
        for (const channelId of entry.channels) {
            try {
                const channel = await this.#client.channels.fetch(channelId);
                if (!channel?.isTextBased?.()) {
                    log.warn('频道不可发言，已跳过', { 时刻: entry.time, 频道: channelId });
                    continue;
                }
                // 借用会话队列，免得插进某轮多段回复的中间
                const scopeKey = channel.guildId ? `guild/${channel.guildId}/${channel.id}` : `dm/${channel.id}`;
                const ids = await this.#sessions.runSerial(scopeKey, () => sendText(channel, entry.text, this.#cfg));
                // runSerial 自己吞掉并记了异常，这里只补上定时消息这一侧的上下文
                if (!ids?.length) {
                    log.warn('定时消息未发出', { 时刻: entry.time, 频道: channelId });
                    continue;
                }
                this.#voice.speak({ channelId, text: entry.text, replyToId: ids[0], scopeKey });
                log.info('定时消息已发送', { 时刻: entry.time, 频道: channelId, 段数: ids.length });
            } catch (e) {
                log.warn('定时消息发送失败', { 时刻: entry.time, 频道: channelId, err: e?.message });
            }
        }
    }
}
