// 每个 scope 一条串行队列，连打的消息合并成一轮
import { createLogger } from '../logger.js';

const log = createLogger('session');

export class SessionManager {
    constructor(cfg, handler) {
        this.cfg = cfg;
        this.handler = handler;
        this.debounceMs = cfg.discord.debounceMs ?? 1500;
        this.pending = new Map();
        this.queues = new Map();
    }

    // 去抖：短时间内连发的几条并成一个 user turn，避免角色逐条回复
    enqueue(scope, item) {
        const key = scope.key;
        const slot = this.pending.get(key) ?? { items: [], timer: null };
        slot.items.push(item);
        if (slot.timer) clearTimeout(slot.timer);
        slot.timer = setTimeout(() => {
            const batch = slot.items;
            this.pending.delete(key);
            this.runSerial(key, () => this.handler(scope, batch));
        }, this.debounceMs);
        this.pending.set(key, slot);
    }

    // 同一 scope 内严格串行，生成中再来的消息排队
    runSerial(key, fn) {
        const prev = this.queues.get(key) ?? Promise.resolve();
        const next = prev.then(fn).catch((e) => log.error('处理失败', { scope: key, err: e?.message }));
        this.queues.set(key, next);
        return next;
    }
}
