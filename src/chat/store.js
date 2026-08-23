// 每个 scope 一个 jsonl，存的永远是模型原文
import fs from 'node:fs';
import path from 'node:path';
import { scopeFilePath, archiveFilePath } from '../discord/scope.js';
import { createLogger } from '../logger.js';

const log = createLogger('chat');

export class ChatStore {
    constructor(cfg) {
        this.dataDir = cfg.chat.dataDir;
        this.maxLines = cfg.chat.maxLines ?? 2000;
        this.cache = new Map();
    }

    load(scope) {
        if (this.cache.has(scope.key)) return this.cache.get(scope.key);
        const file = scopeFilePath(this.dataDir, scope);
        const msgs = [];
        if (fs.existsSync(file)) {
            const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
            for (const line of lines.slice(1)) {
                // 坏行跳过，不让一条脏数据毁掉整段记忆
                try { msgs.push(JSON.parse(line)); } catch { log.warn('跳过损坏的记录行', { scope: scope.key }); }
            }
        }
        this.cache.set(scope.key, msgs);
        return msgs;
    }

    append(scope, entry) {
        const file = scopeFilePath(this.dataDir, scope);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        if (!fs.existsSync(file)) {
            const header = { v: 1, scope: scope.kind, key: scope.key, createdAt: Date.now() };
            fs.writeFileSync(file, JSON.stringify(header) + '\n');
        }
        fs.appendFileSync(file, JSON.stringify(entry) + '\n');
        this.load(scope).push(entry);
        this.rotateIfNeeded(scope);
    }

    rotateIfNeeded(scope) {
        const msgs = this.cache.get(scope.key) || [];
        if (msgs.length <= this.maxLines) return;
        this.archive(scope);
        log.info('记录已满，自动归档', { scope: scope.key });
    }

    // 归档而不是删除，旧记录始终可追溯
    archive(scope) {
        const file = scopeFilePath(this.dataDir, scope);
        if (!fs.existsSync(file)) { this.cache.set(scope.key, []); return null; }
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const dest = archiveFilePath(this.dataDir, scope, stamp);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.renameSync(file, dest);
        this.cache.set(scope.key, []);
        return dest;
    }
}
