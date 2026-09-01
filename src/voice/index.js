// 语音的对外门面：全局串行队列，投递即返回，绝不拖住对话主流程
import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '../logger.js';
import { stripForSpeech } from './text.js';
import { TtsEngine } from './tts.js';
import { resolveBinary, checkBinaries, toOggOpus, probeDurationSecs, buildWaveform } from './audio.js';
import { sendVoiceMessage, createUploadAgent } from '../discord/voice-message.js';

const log = createLogger('voice');
const CLEANUP_INTERVAL_MS = 6 * 3600 * 1000;
const TIMEOUT_STRIKES = 3;

export class VoiceMessenger {
    #cfg;
    #client;
    #djs;
    #tts;
    #ffmpeg;
    #ffprobe;
    #uploadAgent;
    #queue = [];
    #running = null;
    #phase = null;
    #timeouts = 0;
    #enabled;
    #timer = null;
    #proxy;

    constructor({ cfg, client, djs }) {
        this.#cfg = cfg.voice;
        this.#client = client;
        this.#djs = djs;
        this.#proxy = cfg.discord.proxy;
        this.#enabled = Boolean(cfg.voice?.enabled);
        if (!this.#enabled) return;
        this.#build();
    }

    get enabled() {
        return this.#enabled;
    }

    #build() {
        if (this.#tts) return;
        this.#tts = new TtsEngine(this.#cfg);
        this.#ffmpeg = resolveBinary('ffmpeg', this.#cfg.ffmpeg);
        this.#ffprobe = resolveBinary('ffprobe', this.#cfg.ffprobe);
        this.#uploadAgent = createUploadAgent(this.#proxy);
    }

    // 控制台拨动语音开关就地生效：关掉即刻静音，打开则补建引擎再自检预热
    async reconfigure(cfg) {
        const want = Boolean(cfg.voice?.enabled);
        if (want === this.#enabled) return;
        if (!want) {
            this.#enabled = false;
            this.#queue.length = 0;
            log.info('语音已关闭');
            return;
        }
        this.#enabled = true;
        this.#build();
        if (await this.selfCheck()) {
            log.info('语音已开启');
            this.warmup();
        }
    }

    // 环境性缺失重试没意义，体检不过就永久关掉，让文字回复该怎样还怎样
    async selfCheck() {
        if (!this.#enabled) return false;
        const c = this.#cfg;
        const missingFiles = [
            ['GPT 权重', c.model.gptPath],
            ['SoVITS 权重', c.model.sovitsPath],
            ['参考音频', c.model.refPath],
            ['python', c.python],
            ['api.py', path.join(c.runtimeDir, 'api.py')],
        ].filter(([, p]) => !fs.existsSync(p));
        if (missingFiles.length) {
            log.error('语音资源缺失，已关闭语音', { 缺失: missingFiles.map(([n]) => n).join('、') });
            this.#enabled = false;
            return false;
        }
        const missingBins = await checkBinaries({ ffmpeg: this.#ffmpeg, ffprobe: this.#ffprobe });
        if (missingBins.length) {
            log.error('缺少音频工具，已关闭语音', { 缺失: missingBins.join('、') });
            this.#enabled = false;
            return false;
        }
        const removed = this.#tts.cleanupGenerated();
        if (removed) log.info('已清理过期语音', { 数量: removed });
        // 定时器不 unref 会吊住进程不让退出
        if (!this.#timer) {
            this.#timer = setInterval(() => this.#tts.cleanupGenerated(), CLEANUP_INTERVAL_MS);
            this.#timer.unref();
        }
        return true;
    }

    // 冷加载要一两分钟，不预热的话第一条语音会让人以为坏了
    warmup() {
        if (!this.#enabled || !this.#cfg.warmupOnStart) return;
        this.#tts.ensureReady()
            .then(() => log.info('语音已预热'))
            .catch((e) => log.warn('语音预热失败，首条会现拉起', { err: e?.message }));
    }

    // 只合成不上传，本机聊天点播用。仍排进同一条队列，GPT-SoVITS 只有一个模型
    async synthesizeFile(text) {
        if (!this.#enabled) throw new Error('语音未开启');
        const speech = stripForSpeech(text, { maxChars: this.#cfg.maxChars });
        if (speech.length < this.#cfg.minChars) throw new Error('可朗读的内容太短');
        return new Promise((resolve, reject) => {
            // 手点的这一条不套用 queueMax 丢弃：被静默丢掉会像是坏了
            this.#queue.push({ kind: 'wav', speech, scopeKey: 'local/main', resolve, reject });
            this.#pump();
        });
    }

    // 刻意返回 void 而不是 Promise：一旦能 await，将来手滑就会把对话卡几十秒
    speak(job) {
        if (!this.#enabled) return;
        try {
            const speech = stripForSpeech(job.text, { maxChars: this.#cfg.maxChars });
            if (speech.length < this.#cfg.minChars) return;
            // 积压说明合成跟不上说话速度，丢最旧的比无限堆积好
            if (this.#queue.length >= this.#cfg.queueMax) {
                this.#queue.shift();
                log.warn('语音队列积压，丢弃最早一条', { 队列: this.#queue.length });
            }
            this.#queue.push({ ...job, speech });
            this.#pump();
        } catch (e) {
            log.warn('语音投递失败', { err: e?.message });
        }
    }

    #pump() {
        if (this.#running) return;
        this.#running = (async () => {
            while (this.#queue.length) {
                const job = this.#queue.shift();
                try {
                    await this.#one(job);
                } catch (e) {
                    log.warn('语音这一条失败，已跳过', { scope: job.scopeKey, err: e?.message });
                    job.reject?.(e);
                } finally {
                    this.#phase = null;
                }
            }
        })().finally(() => { this.#running = null; });
    }

    // 超时连击后重启服务是唯一的自愈手段，两种 job 共用
    async #synth(speech) {
        try {
            const wav = await this.#tts.synthesize(speech);
            this.#timeouts = 0;
            return wav;
        } catch (e) {
            if (/timeout|UND_ERR/i.test(e?.message || '') && ++this.#timeouts >= TIMEOUT_STRIKES) {
                log.error('合成连续超时，重启 GPT-SoVITS');
                this.#tts.stopService();
                this.#tts.dropReady();
                this.#timeouts = 0;
            }
            throw e;
        }
    }

    async #one(job) {
        const started = Date.now();
        this.#phase = 'synth';
        // 本机点播只要音频本体，合成完就交回去
        if (job.kind === 'wav') {
            job.resolve(await this.#synth(job.speech));
            return;
        }
        const wav = await this.#synth(job.speech);
        const ogg = path.join(this.#cfg.runtimeStateDir, `discord-voice-${Date.now()}-${Math.random().toString(16).slice(2)}.ogg`);
        fs.mkdirSync(this.#cfg.runtimeStateDir, { recursive: true });
        try {
            await toOggOpus(wav, ogg, this.#ffmpeg);
            const [durationSecs, waveform] = await Promise.all([
                probeDurationSecs(ogg, this.#ffprobe),
                buildWaveform(ogg, this.#ffmpeg),
            ]);
            this.#phase = 'upload';
            const id = await sendVoiceMessage(this.#client.rest, this.#djs, {
                channelId: job.channelId,
                oggPath: ogg,
                durationSecs,
                waveform,
                replyToId: this.#cfg.replyTo === 'text' ? job.replyToId : null,
                uploadAgent: this.#uploadAgent,
            });
            log.info('语音已发送', { scope: job.scopeKey, 秒: durationSecs, 耗时秒: Math.round((Date.now() - started) / 1000), id });
        } finally {
            fs.rmSync(ogg, { force: true });
            const removed = this.#tts.cleanupGenerated();
            if (removed) log.info('已清理过期语音', { 数量: removed });
        }
    }

    // 合成中的多半救不回来，正在上传的一两秒就能收尾，值得等
    async drain(timeoutMs) {
        this.#queue.length = 0;
        if (!this.#running) return;
        if (this.#phase !== 'upload') {
            log.warn('退出时丢弃合成中的语音');
            return;
        }
        await Promise.race([this.#running, new Promise((r) => setTimeout(r, timeoutMs).unref())]);
    }

    shutdown() {
        if (this.#timer) clearInterval(this.#timer);
        if (!this.#enabled) return;
        // 默认让服务活着，重启后省掉一两分钟的模型加载
        if (!this.#cfg.keepServiceAlive && this.#tts.stopService()) log.info('已停止 GPT-SoVITS');
    }
}
