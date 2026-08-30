// 监听 config.json，把控制台开放的那几项就地并进运行中的 cfg
import fs from 'node:fs';
import path from 'node:path';
import { applyHotConfig } from './config.js';
import { createLogger } from './logger.js';

const log = createLogger('config');
const DEBOUNCE_MS = 300;

export function watchConfig(cfg, onChange) {
    const file = cfg.configPath;
    const name = path.basename(file);
    let timer = null;

    function reload() {
        let next;
        try {
            next = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (e) {
            // 可能读到写了一半的文件，也可能是手改坏了，两种都不该弄死机器人
            log.warn('配置读取失败，沿用当前配置', { err: e?.message });
            return;
        }
        const changed = applyHotConfig(cfg, next);
        if (!changed.length) return;
        log.info('配置已热更新', { 变更: changed.join('、') });
        try {
            onChange(changed);
        } catch (e) {
            log.error('应用新配置失败', { err: e?.message });
        }
    }

    // 写回走的是临时文件 rename，盯文件本身会在换 inode 后失效，所以盯目录
    const watcher = fs.watch(path.dirname(file), (_event, filename) => {
        if (filename !== name) return;
        clearTimeout(timer);
        timer = setTimeout(reload, DEBOUNCE_MS);
    });
    watcher.unref();
    log.info('已监听配置文件，控制台里的改动即存即生效');

    return () => { clearTimeout(timer); watcher.close(); };
}
