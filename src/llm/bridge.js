// st-claude-cli-bridge 的 OpenAI 兼容客户端，非流式
import { createLogger } from '../logger.js';

const log = createLogger('llm');

export class BridgeClient {
    constructor(cfg) {
        this.cfg = cfg.llm;
        this.queue = Promise.resolve();
    }

    // 自我限流：bridge 的并发额度还要留给酒馆
    run(fn) {
        const next = this.queue.then(fn, fn);
        this.queue = next.catch(() => {});
        return next;
    }

    async complete(messages, { signal } = {}) {
        return this.run(async () => {
            const url = this.cfg.baseUrl.replace(/\/$/, '') + '/chat/completions';
            const body = {
                model: this.cfg.model,
                messages,
                stream: false,
                max_tokens: this.cfg.maxTokens ?? 8192,
            };
            if (this.cfg.stop?.length) body.stop = this.cfg.stop;

            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs || 600000);
            if (signal) signal.addEventListener('abort', () => ctrl.abort(), { once: true });

            const started = Date.now();
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (this.cfg.apiKey) headers.Authorization = `Bearer ${this.cfg.apiKey}`;
                // 本地回环必须直连，绝不能走代理
                const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
                if (!res.ok) throw new Error(`bridge 返回 ${res.status}: ${(await res.text()).slice(0, 200)}`);
                const data = await res.json();
                const text = data?.choices?.[0]?.message?.content ?? '';
                log.info('生成完成', { 耗时秒: Math.round((Date.now() - started) / 1000), 字数: text.length });
                return text;
            } finally {
                clearTimeout(timer);
            }
        });
    }
}
