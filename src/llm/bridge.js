// st-claude-cli-bridge 的 OpenAI 兼容客户端，非流式
import { createLogger } from '../logger.js';
import { materializeImages } from './parts.js';

const log = createLogger('llm');

export class BridgeClient {
    constructor(cfg) {
        this.cfg = cfg.llm;
        this.dataDir = cfg.chat?.dataDir || './data';
        this.queue = Promise.resolve();
    }

    // 自我限流：bridge 的并发额度还要留给酒馆
    run(fn) {
        const next = this.queue.then(fn, fn);
        this.queue = next.catch(() => {});
        return next;
    }

    // 流式：本机聊天边生成边显示，onDelta 收到的是到目前为止的全文
    async stream(messages, { onDelta, signal } = {}) {
        return this.run(async () => {
            const url = this.cfg.baseUrl.replace(/\/$/, '') + '/chat/completions';
            const body = {
                model: this.cfg.model,
                messages: materializeImages(messages, this.dataDir),
                stream: true,
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
                const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
                if (!res.ok) throw new Error(`bridge 返回 ${res.status}: ${(await res.text()).slice(0, 200)}`);

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buf = '';
                let full = '';
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buf += decoder.decode(value, { stream: true });
                    const lines = buf.split('\n');
                    // 最后一段可能被切在半路，留到下一轮再拼
                    buf = lines.pop() ?? '';
                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        const payload = line.slice(6).trim();
                        if (!payload || payload === '[DONE]') continue;
                        let delta;
                        try { delta = JSON.parse(payload).choices?.[0]?.delta; } catch { continue; }
                        // reasoning_content 是思考过程，不进正文
                        const t = delta?.content;
                        if (!t) continue;
                        full += t;
                        onDelta?.(full);
                    }
                }
                log.info('生成完成', { 耗时秒: Math.round((Date.now() - started) / 1000), 字数: full.length, 流式: true });
                return full;
            } finally {
                clearTimeout(timer);
            }
        });
    }

    async complete(messages, { signal } = {}) {
        return this.run(async () => {
            const url = this.cfg.baseUrl.replace(/\/$/, '') + '/chat/completions';
            const body = {
                model: this.cfg.model,
                messages: materializeImages(messages, this.dataDir),
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
