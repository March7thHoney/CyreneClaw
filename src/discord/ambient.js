// 频道近期公开发言的环形缓冲，作为现场氛围注入，不持久化
export class AmbientBuffer {
    constructor(cfg) {
        const a = cfg.discord.ambient || {};
        this.enabled = a.enabled !== false;
        this.maxMessages = a.maxMessages ?? 15;
        this.maxCharsPerMessage = a.maxCharsPerMessage ?? 200;
        this.maxTotalChars = a.maxTotalChars ?? 1500;
        this.retentionMs = (a.retentionMinutes ?? 30) * 60000;
        this.buffers = new Map();
    }

    // 在权限判定之前无条件收集，角色才能看见现场
    record(channelId, { author, content, ts }) {
        if (!this.enabled || !content?.trim()) return;
        const list = this.buffers.get(channelId) ?? [];
        list.push({ author, content: content.trim(), ts: ts ?? Date.now() });
        const cutoff = Date.now() - this.retentionMs;
        const kept = list.filter((m) => m.ts >= cutoff).slice(-30);
        this.buffers.set(channelId, kept);
    }

    clear(channelId) { this.buffers.delete(channelId); }

    // 渲染成注入块，排除触发本轮的那条消息，无内容时返回 null
    render(channelId, channelName, excludeIds = new Set()) {
        if (!this.enabled) return null;
        const list = (this.buffers.get(channelId) || []).filter((m) => !excludeIds.has(m.id));
        if (!list.length) return null;

        const picked = list.slice(-this.maxMessages);
        const lines = [];
        let total = 0;
        for (const m of picked) {
            const t = new Date(m.ts);
            const hhmm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
            let body = m.content.replace(/\s*\n\s*/g, ' ');
            if (body.length > this.maxCharsPerMessage) body = body.slice(0, this.maxCharsPerMessage) + '…';
            const line = `[${hhmm}] ${m.author}：${body}`;
            total += line.length;
            lines.push(line);
        }
        // 超总量就从最旧的开始丢
        while (total > this.maxTotalChars && lines.length > 1) {
            total -= lines[0].length;
            lines.shift();
        }
        if (!lines.length) return null;
        return `<channel_context>\n以下是频道 ${channelName} 最近的公开发言，只是现场氛围，不要逐条回应，也不要复述。\n${lines.join('\n')}\n</channel_context>`;
    }
}
