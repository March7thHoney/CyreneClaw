// GPT-SoVITS 本地服务的生命周期与合成调用，全程直连不走代理
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { request, Agent } from 'undici';
import { createLogger } from '../logger.js';

const log = createLogger('tts');
const SPAWN_BACKOFF_MS = 60000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class TtsEngine {
    #cfg;
    #agent;
    #modelReady = false;
    #lastSpawnAt = 0;
    #spawnedHere = false;

    constructor(voiceCfg) {
        this.#cfg = voiceCfg;
        // 本地回环必须直连，绝不能走代理；顺带关掉超时，合成完才吐响应头
        this.#agent = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
    }

    async #get(url, timeoutMs) {
        const res = await request(url, { dispatcher: this.#agent, headersTimeout: timeoutMs, bodyTimeout: timeoutMs });
        const text = await res.body.text();
        if (res.statusCode >= 400) throw new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`);
        return text;
    }

    // 探活只看有没有人应答，4xx 也算活着，只有连不上才算死
    async isReachable() {
        try {
            const res = await request(`${this.#cfg.endpoint}/change_refer`, { dispatcher: this.#agent, headersTimeout: 1500, bodyTimeout: 1500 });
            await res.body.dump();
            return true;
        } catch {
            return false;
        }
    }

    #startService() {
        const c = this.#cfg;
        // 每条消息拉一个 python 会把机器打死，失败后必须退避
        if (Date.now() - this.#lastSpawnAt < SPAWN_BACKOFF_MS) throw new Error('服务刚拉起过，退避中');
        this.#lastSpawnAt = Date.now();
        fs.mkdirSync(c.logDir, { recursive: true });
        const fd = fs.openSync(path.join(c.logDir, 'gpt-sovits-api.log'), 'a');
        const child = spawn(c.python, [
            'api.py',
            '-s', c.model.sovitsPath,
            '-g', c.model.gptPath,
            '-dr', c.model.refPath,
            '-dt', c.model.refText,
            '-dl', c.model.refLang,
            '-d', c.device,
            '-a', c.host,
            '-p', String(c.port),
            '-fp', '-sm', 'close', '-mt', 'wav',
        ], {
            cwd: c.runtimeDir,
            detached: true,
            env: { ...process.env, is_half: 'False', PATH: `/opt/homebrew/bin:${process.env.PATH || ''}` },
            stdio: ['ignore', fd, fd],
        });
        child.unref();
        this.#spawnedHere = true;
        fs.mkdirSync(path.dirname(c.pidFile), { recursive: true });
        fs.writeFileSync(c.pidFile, `${child.pid}\n`, { mode: 0o600 });
        log.info('已拉起 GPT-SoVITS', { pid: child.pid });
    }

    // 模型冷加载要一两分钟，成功一次后就不再重复握手
    async ensureReady() {
        if (this.#modelReady && await this.isReachable()) return;
        this.#modelReady = false;
        if (!await this.isReachable()) {
            if (!this.#cfg.autoStart) throw new Error('GPT-SoVITS 未运行且未开启 autoStart');
            this.#startService();
        }
        const url = new URL(`${this.#cfg.endpoint}/set_model`);
        url.searchParams.set('gpt_model_path', this.#cfg.model.gptPath);
        url.searchParams.set('sovits_model_path', this.#cfg.model.sovitsPath);
        const deadline = Date.now() + this.#cfg.readyTimeoutMs;
        let last = null;
        while (Date.now() < deadline) {
            try {
                await this.#get(url.toString(), this.#cfg.readyTimeoutMs);
                this.#modelReady = true;
                log.info('模型已就绪');
                return;
            } catch (e) {
                last = e;
                await sleep(3000);
            }
        }
        throw new Error(`模型未就绪：${last?.message || '超时'}`);
    }

    async synthesize(text) {
        const c = this.#cfg;
        await this.ensureReady();
        const res = await request(`${c.endpoint}/`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                text,
                text_language: c.synth.textLanguage,
                top_k: c.synth.topK,
                top_p: c.synth.topP,
                temperature: c.synth.temperature,
                speed: c.synth.speed,
                sample_steps: c.synth.sampleSteps,
                if_sr: c.synth.ifSr,
            }),
            dispatcher: this.#agent,
            headersTimeout: c.synthTimeoutMs,
            bodyTimeout: c.synthTimeoutMs,
        });
        if (res.statusCode >= 400) {
            const body = await res.body.text();
            throw new Error(`合成 HTTP ${res.statusCode}: ${body.slice(0, 200)}`);
        }
        const buf = Buffer.from(await res.body.arrayBuffer());
        if (buf.length < 4096) throw new Error(`合成结果只有 ${buf.length} 字节，视为失败`);
        fs.mkdirSync(c.generatedDir, { recursive: true });
        const out = path.join(c.generatedDir, `cyrene-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`);
        fs.writeFileSync(out, buf, { mode: 0o600 });
        return out;
    }

    // 旧版把清理写在必抛异常的调用之后，从未执行过，这里放在每轮收尾
    cleanupGenerated() {
        const cutoff = Date.now() - (this.#cfg.cleanupHours * 3600 * 1000);
        let removed = 0;
        let entries = [];
        try { entries = fs.readdirSync(this.#cfg.generatedDir); } catch { return 0; }
        for (const name of entries) {
            if (!name.startsWith('cyrene-') || !name.endsWith('.wav')) continue;
            const p = path.join(this.#cfg.generatedDir, name);
            try {
                if (fs.statSync(p).mtimeMs < cutoff) { fs.unlinkSync(p); removed++; }
            } catch { /* 并发删掉了就算了 */ }
        }
        return removed;
    }

    dropReady() {
        this.#modelReady = false;
    }

    stopService() {
        if (!this.#spawnedHere) return false;
        try {
            const pid = Number(fs.readFileSync(this.#cfg.pidFile, 'utf8').trim());
            if (pid) process.kill(pid, 'SIGTERM');
            fs.rmSync(this.#cfg.pidFile, { force: true });
            return true;
        } catch {
            return false;
        }
    }
}
