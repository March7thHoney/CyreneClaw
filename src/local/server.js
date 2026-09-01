// 只听回环的本机聊天服务，控制台 App 靠它收发消息，与 Discord 各走各的存档
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '../logger.js';
import { LOCAL_SCOPE } from '../discord/scope.js';
import { runTurn, commitReply, seedGreeting } from '../chat/turn.js';
import { segmentText, extractDialogue } from '../format/dialogue.js';
import { stripComments } from '../format/strip.js';
import { loadCard } from '../prompt/card.js';

const log = createLogger('local');
const HOST = '127.0.0.1';
const MAX_BODY = 64 * 1024;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function json(res, code, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
    res.end(body);
}

// 请求体超过上限直接掐断，回环服务也不该无限吃内存
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (c) => {
            size += c.length;
            if (size > MAX_BODY) { reject(new Error('请求体过大')); req.destroy(); return; }
            chunks.push(c);
        });
        req.on('end', () => {
            if (!chunks.length) return resolve({});
            try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
            catch (e) { reject(new Error(`请求体不是合法 JSON：${e.message}`)); }
        });
        req.on('error', reject);
    });
}

// 存档里的一条转成界面要的形状，角色台词现算分段
function toMessage(entry, charName, hasVoice = false) {
    const base = { id: entry.id, role: entry.role, name: entry.name || charName, ts: entry.ts || 0 };
    if (entry.role !== 'assistant') return { ...base, text: entry.content };
    const raw = stripComments(entry.content, { dropUnclosed: true });
    return { ...base, text: raw, segments: segmentText(raw), hasVoice };
}

export function createLocalServer({ cfg, store, bridge, voice, sessions }) {
    // 合成结果按消息 id 落盘，重开 App 也还能放。cyrene- 前缀让它跟着现有清理一起过期
    const voicePath = (id) => path.join(cfg.voice.generatedDir, `cyrene-local-${id}.wav`);
    const hasVoice = (id) => fs.existsSync(voicePath(id));

    const routes = {
        'GET /local/health': async () => ({
            ok: true,
            char: loadCard(cfg.sillytavern.characterPath).name,
            voiceEnabled: voice.enabled,
        }),

        'GET /local/history': async () => {
            const card = loadCard(cfg.sillytavern.characterPath);
            // 空档先落一条开场白，打开聊天页就有话看。副本传进去，别让它写到 store 的缓存上
            seedGreeting({ cfg, store, scope: LOCAL_SCOPE, card, history: [...store.load(LOCAL_SCOPE)] });
            return { messages: store.load(LOCAL_SCOPE).map((e) => toMessage(e, card.name, hasVoice(e.id))) };
        },

        'POST /local/clear': async () => {
            const archived = store.archive(LOCAL_SCOPE);
            log.info('本机记忆已清空', { 归档: Boolean(archived) });
            return { archived: Boolean(archived) };
        },
    };

    // 流式：每帧推一次到目前为止的全文与分段，最后一帧带落库后的完整消息
    async function chat(res, body) {
        const text = String(body?.text ?? '').trim();
        if (!text) return json(res, 400, { error: '内容为空' });

        res.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
        });
        const push = (event, data) => {
            if (res.writableEnded) return;
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        const batch = [{ id: `local-${Date.now()}`, content: text, authorName: cfg.discord.owner.displayName }];
        // 与 Discord 共用同一种串行写法，连点时后一条排队而不是并发
        const outcome = await sessions.runSerial(LOCAL_SCOPE.key, () => (async () => {
            let lastPush = 0;
            // 与 Discord 同一套契约，长度一致，只是描写也显示出来
            const { card, raw } = await runTurn({
                cfg, store, bridge, scope: LOCAL_SCOPE, batch, ambient: null,
                onDelta: (full) => {
                    // 节流到 80ms，逐 token 重算分段没必要
                    const now = Date.now();
                    if (now - lastPush < 80) return;
                    lastPush = now;
                    push('delta', { text: full, segments: segmentText(stripComments(full, { dropUnclosed: false })) });
                },
            });
            const entry = commitReply({ store, scope: LOCAL_SCOPE, card, raw });
            log.info('已回复', { 字数: raw.length });
            return { entry, message: toMessage(entry, card.name) };
        })().then((v) => ({ ok: true, v }), (e) => ({ ok: false, e })));

        if (!outcome.ok) {
            log.error('生成失败', { err: outcome.e?.message });
            push('error', { error: outcome.e?.message || '生成失败' });
            return res.end();
        }

        const { entry, message } = outcome.v;
        const speech = voice.enabled
            ? extractDialogue(entry.content, { joinSeparator: cfg.format.joinSeparator })
            : '';
        push('done', { message: { ...message, hasVoice: false }, voicePending: Boolean(speech) });

        // 文字先落地，语音好了再补一帧，跟 Discord 上语音条单独成条一个意思
        if (speech) {
            try {
                const wav = await voice.synthesizeFile(speech);
                fs.renameSync(wav, voicePath(entry.id));
                push('voice', { id: entry.id });
            } catch (e) {
                log.warn('语音合成失败，只留文字', { err: e?.message });
                push('voice', { id: entry.id, error: e?.message || '合成失败' });
            }
        }
        res.end();
    }

    // 按消息 id 取那条已经合成好的 wav
    async function voiceFile(req, res) {
        const id = new URL(req.url, 'http://127.0.0.1').searchParams.get('id') || '';
        // id 直接进路径，只放行自己生成的那种形状
        if (!/^gen-\d+$/.test(id)) return json(res, 400, { error: '消息 id 不合法' });
        let data;
        try { data = await fs.promises.readFile(voicePath(id)); } catch { return json(res, 404, { error: '这一条没有语音' }); }
        res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': data.length });
        res.end(data);
    }

    const server = http.createServer(async (req, res) => {
        // 回环之外的来源一律拒绝，这个服务没有任何鉴权
        if (!LOOPBACK.has(req.socket.remoteAddress)) return json(res, 403, { error: '仅限本机访问' });
        // Host 校验挡 DNS rebinding，带 Origin 的一定是网页发来的，一并拒掉
        if (!ALLOWED_HOSTS.has(String(req.headers.host || '').replace(/:\d+$/, ''))) {
            return json(res, 403, { error: '主机名不受信任' });
        }
        if (req.headers.origin) return json(res, 403, { error: '不接受跨源请求' });

        const key = `${req.method} ${req.url.split('?')[0]}`;
        try {
            const body = req.method === 'POST' ? await readBody(req) : {};
            if (key === 'POST /local/chat') return await chat(res, body);
            if (key === 'GET /local/voice') return await voiceFile(req, res);
            const handler = routes[key];
            if (!handler) return json(res, 404, { error: '没有这个接口' });
            return json(res, 200, await handler(body));
        } catch (e) {
            log.error('请求失败', { 接口: key, err: e?.message });
            json(res, e?.code === 400 ? 400 : 500, { error: e?.message || '未知错误' });
        }
    });

    server.on('error', (e) => {
        // 端口被占的多半是上一个进程没退干净，报清楚就够了，别让机器人跟着挂
        log.error('本机聊天服务启动失败', { err: e?.message });
    });

    return {
        start() {
            server.listen(cfg.localChat.port, HOST, () => {
                log.info('本机聊天服务已就绪', { 地址: `http://${HOST}:${cfg.localChat.port}` });
            });
        },
        close() {
            server.close();
        },
    };
}
