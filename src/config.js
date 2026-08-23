// 加载并校验 config.json，展开 ~ 路径，缺项直接报中文错误退出
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 把 ~ 开头的路径展开成绝对路径，相对路径按项目根解析
function expand(p) {
    if (!p) return p;
    if (p === '~') return os.homedir();
    if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
    return path.isAbsolute(p) ? p : path.resolve(ROOT, p);
}

const REQUIRED = [
    ['discord.token', 'Discord Bot Token'],
    ['discord.owner.userId', '你的 Discord 用户 ID'],
    ['sillytavern.dataDir', '酒馆 data/default-user 目录'],
    ['sillytavern.characterFile', '角色卡文件名'],
    ['sillytavern.presetFile', '预设文件名'],
];

function pick(obj, dotted) {
    return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function loadConfig(file) {
    const configPath = file ? expand(file) : path.join(ROOT, 'config.json');
    if (!fs.existsSync(configPath)) {
        console.error(`找不到配置文件 ${configPath}，请先复制 config.example.json 为 config.json 并填写`);
        process.exit(1);
    }
    let cfg;
    try {
        cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
        console.error(`配置文件不是合法 JSON：${e.message}`);
        process.exit(1);
    }

    const missing = REQUIRED.filter(([k]) => {
        const v = pick(cfg, k);
        return !v || String(v).startsWith('在此填写');
    });
    if (missing.length) {
        console.error('配置缺少以下必填项：');
        for (const [k, desc] of missing) console.error(`  ${k}  —— ${desc}`);
        process.exit(1);
    }

    cfg.sillytavern.dataDir = expand(cfg.sillytavern.dataDir);
    cfg.chat.dataDir = expand(cfg.chat?.dataDir || './data');
    cfg.log.dir = expand(cfg.log?.dir || './logs');

    if (!fs.existsSync(cfg.sillytavern.dataDir)) {
        console.error(`酒馆数据目录不存在：${cfg.sillytavern.dataDir}`);
        process.exit(1);
    }

    // 把资源相对路径拼成绝对路径，顺便确认文件都在
    const st = cfg.sillytavern;
    st.characterPath = path.join(st.dataDir, st.characterFile);
    st.presetPath = path.join(st.dataDir, st.presetFile);
    st.worldBookPaths = (st.worldBooks || []).map((w) => path.join(st.dataDir, w));
    for (const p of [st.characterPath, st.presetPath, ...st.worldBookPaths]) {
        if (!fs.existsSync(p)) {
            console.error(`资源文件不存在：${p}`);
            process.exit(1);
        }
    }

    cfg.configPath = configPath;
    return cfg;
}
