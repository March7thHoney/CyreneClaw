// Discord 原生语音条要三步上传，discord.js 14 没封装，只能裸打 REST v10
import fs from 'node:fs/promises';
import { request, ProxyAgent } from 'undici';

const FILENAME = 'voice-message.ogg';

// rest 自带的 dispatcher 来自它内嵌的 undici 6，喂给顶层 undici 7 是未定义行为
export function createUploadAgent(proxyUrl) {
    return proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
}

export async function sendVoiceMessage(rest, djs, opts) {
    const { channelId, oggPath, durationSecs, waveform, replyToId, uploadAgent } = opts;
    const { Routes, MessageFlags } = djs;
    const ogg = await fs.readFile(oggPath);

    // 第一步：Routes 里没有 attachments 的 helper，只能手写路由
    const slotRes = await rest.post(`/channels/${channelId}/attachments`, {
        body: { files: [{ filename: FILENAME, file_size: ogg.byteLength, id: '0' }] },
    });
    const slot = slotRes?.attachments?.[0];
    if (!slot?.upload_url || !slot?.upload_filename) throw new Error('Discord 没有返回上传槽位');

    // 第二步：签名 URL 在外部域名上，rest 的 URL 是写死拼 api 前缀的，打不到
    const put = await request(slot.upload_url, {
        method: 'PUT',
        // content-type 被算进了签名，不能改也不能省
        headers: { 'content-type': 'audio/ogg' },
        body: ogg,
        dispatcher: uploadAgent,
        headersTimeout: 60000,
        bodyTimeout: 120000,
    });
    if (put.statusCode < 200 || put.statusCode >= 300) {
        const body = await put.body.text();
        throw new Error(`上传 HTTP ${put.statusCode}: ${body.slice(0, 200)}`);
    }
    // undici 不消费 body 就不还连接
    await put.body.dump();

    // 第三步：带 flags 与波形建消息，语音条不能同时携带文字
    const sent = await rest.post(Routes.channelMessages(channelId), {
        body: {
            flags: MessageFlags.IsVoiceMessage,
            attachments: [{
                id: '0',
                filename: FILENAME,
                uploaded_filename: slot.upload_filename,
                duration_secs: durationSecs,
                waveform,
            }],
            ...(replyToId ? { message_reference: { message_id: replyToId, fail_if_not_exists: false } } : {}),
        },
    });
    return sent?.id ?? null;
}
