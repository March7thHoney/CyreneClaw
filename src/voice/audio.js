// ffmpeg/ffprobe 的薄封装：Discord 语音条只认 ogg/opus，还额外要时长与波形
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const WAVEFORM_SAMPLES = 256;

// launchd 的 PATH 与终端不同，homebrew 与 Intel 老路径都要兜住
export function resolveBinary(name, hint) {
    if (hint) return hint;
    for (const dir of ['/opt/homebrew/bin', '/usr/local/bin']) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) return p;
    }
    return name;
}

function run(command, args, { capture = 'utf8' } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        const out = [];
        const err = [];
        child.stdout.on('data', (c) => out.push(c));
        child.stderr.on('data', (c) => err.push(c));
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) return resolve(capture === 'buffer' ? Buffer.concat(out) : Buffer.concat(out).toString('utf8'));
            reject(new Error(`${path.basename(command)} 退出码 ${code}: ${Buffer.concat(err).toString('utf8').slice(0, 800)}`));
        });
    });
}

export async function checkBinaries({ ffmpeg, ffprobe }) {
    const missing = [];
    for (const [name, bin] of [['ffmpeg', ffmpeg], ['ffprobe', ffprobe]]) {
        try { await run(bin, ['-version']); } catch { missing.push(name); }
    }
    return missing;
}

export async function toOggOpus(inPath, outPath, ffmpeg) {
    await run(ffmpeg, ['-y', '-i', inPath, '-vn', '-sn', '-dn', '-ar', '48000', '-c:a', 'libopus', '-b:a', '64k', outPath]);
    return outPath;
}

export async function probeDurationSecs(filePath, ffprobe) {
    try {
        const out = await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]);
        const v = Number.parseFloat(out.trim());
        if (Number.isFinite(v) && v > 0) return Math.round(v * 100) / 100;
    } catch { /* 拿不到时长不值得让整条语音失败 */ }
    return 1;
}

// 波形只用来画那条静态条，取不到就给个正弦占位，不影响播放
export function placeholderWaveform() {
    const arr = [];
    for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
        arr.push(Math.min(255, Math.max(0, Math.round(128 + 64 * Math.sin((i / WAVEFORM_SAMPLES) * Math.PI * 8)))));
    }
    return Buffer.from(arr).toString('base64');
}

// 解成单声道 PCM 再按段取绝对幅度均值，比旧版那条假正弦像样得多
export async function buildWaveform(filePath, ffmpeg) {
    try {
        const pcm = await run(ffmpeg, ['-v', 'error', '-i', filePath, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { capture: 'buffer' });
        const total = Math.floor(pcm.length / 2);
        if (total < WAVEFORM_SAMPLES) return placeholderWaveform();
        const per = Math.floor(total / WAVEFORM_SAMPLES);
        const arr = [];
        let peak = 1;
        for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
            let sum = 0;
            for (let j = 0; j < per; j++) sum += Math.abs(pcm.readInt16LE(((i * per) + j) * 2));
            const avg = sum / per;
            arr.push(avg);
            if (avg > peak) peak = avg;
        }
        // 按本条自身峰值归一化，否则轻声说话的波形几乎是条直线
        return Buffer.from(arr.map((v) => Math.min(255, Math.max(1, Math.round((v / peak) * 255))))).toString('base64');
    } catch {
        return placeholderWaveform();
    }
}
