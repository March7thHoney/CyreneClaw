// 极简分级日志：控制台 + 按大小轮转的文件
import fs from 'node:fs';
import path from 'node:path';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MAX_BYTES = 10 * 1024 * 1024;
const KEEP = 3;

let minLevel = LEVELS.info;
let logFile = null;

export function configureLogger({ level = 'info', dir = './logs' } = {}) {
    minLevel = LEVELS[level] ?? LEVELS.info;
    fs.mkdirSync(dir, { recursive: true });
    logFile = path.join(dir, 'cyreneclaw.log');
}

// 超过阈值就把旧文件依次后移，只留固定份数
function rotateIfNeeded() {
    if (!logFile) return;
    let size = 0;
    try { size = fs.statSync(logFile).size; } catch { return; }
    if (size < MAX_BYTES) return;
    for (let i = KEEP - 1; i >= 1; i--) {
        const from = `${logFile}.${i}`;
        if (fs.existsSync(from)) fs.renameSync(from, `${logFile}.${i + 1}`);
    }
    fs.renameSync(logFile, `${logFile}.1`);
}

function emit(level, scope, msg, extra) {
    if (LEVELS[level] < minLevel) return;
    const ts = new Date().toISOString();
    const tail = extra === undefined ? '' : ` ${typeof extra === 'string' ? extra : JSON.stringify(extra)}`;
    const line = `${ts} [${level.toUpperCase()}] [${scope}] ${msg}${tail}`;
    (level === 'error' ? console.error : console.log)(line);
    if (logFile) {
        try { rotateIfNeeded(); fs.appendFileSync(logFile, line + '\n'); } catch { /* 日志失败不影响主流程 */ }
    }
}

export function createLogger(scope) {
    return {
        debug: (m, e) => emit('debug', scope, m, e),
        info: (m, e) => emit('info', scope, m, e),
        warn: (m, e) => emit('warn', scope, m, e),
        error: (m, e) => emit('error', scope, m, e),
    };
}
