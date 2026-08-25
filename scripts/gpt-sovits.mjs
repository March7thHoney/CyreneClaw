// 手工管理语音服务：路径全部取自 config.json，不依赖任何外部目录
import { loadConfig } from '../src/config.js';
import { configureLogger } from '../src/logger.js';
import { TtsEngine } from '../src/voice/tts.js';
import fs from 'node:fs';

const cfg = loadConfig();
configureLogger({ ...cfg.log, level: 'info' });
const v = cfg.voice;
const cmd = process.argv[2] || 'status';

if (!v.enabled) {
    console.error('config.json 里 voice.enabled 是 false，先打开再用本脚本');
    process.exit(1);
}

const tts = new TtsEngine(v);
const alive = await tts.isReachable();

if (cmd === 'status') {
    console.log(`服务: ${alive ? '运行中' : '未运行'}  ${v.endpoint}`);
    try { console.log(`pid : ${fs.readFileSync(v.pidFile, 'utf8').trim()}`); } catch { console.log('pid : (无记录)'); }
    console.log(`日志: ${v.logDir}/gpt-sovits-api.log`);
} else if (cmd === 'start') {
    if (alive) { console.log('本来就在跑'); process.exit(0); }
    console.log('正在拉起并加载模型，冷启动约 1-3 分钟…');
    await tts.ensureReady();
    console.log('已就绪');
} else if (cmd === 'stop') {
    // 不是本进程拉起的也要能停，所以直接按 pid 文件来
    let pid = 0;
    try { pid = Number(fs.readFileSync(v.pidFile, 'utf8').trim()); } catch { /* 没有 pid 文件 */ }
    if (!pid) { console.log('找不到 pid 文件，未做任何事'); process.exit(0); }
    try {
        process.kill(pid, 'SIGTERM');
        fs.rmSync(v.pidFile, { force: true });
        console.log(`已停止 ${pid}`);
    } catch (e) {
        console.log(`停止失败（进程可能早已退出）：${e.message}`);
        fs.rmSync(v.pidFile, { force: true });
    }
} else {
    console.error('用法: node scripts/gpt-sovits.mjs {status|start|stop}');
    process.exit(1);
}
