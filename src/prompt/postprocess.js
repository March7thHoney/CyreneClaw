// 提示词后处理：squashSystemMessages + strict 合并，对齐酒馆行为
const SQUASH_EXCLUDE = ['newMainChat', 'newChat', 'groupNudge'];

// 相邻的无 name system 消息用单个换行合并，空 system 直接丢弃
export function squashSystemMessages(messages) {
    const out = [];
    let last = null;
    const canSquash = (m) => m && !SQUASH_EXCLUDE.includes(m.identifier) && m.role === 'system' && !m.name;

    for (const m of messages) {
        if (m.role === 'system' && !m.content) continue;
        if (canSquash(m) && canSquash(last)) {
            last.content += '\n' + m.content;
        } else {
            const copy = { ...m };
            out.push(copy);
            last = copy;
        }
    }
    return out;
}

// 同 role 相邻消息用空行合并，图片清单跟着并入
function mergeSameRole(messages) {
    const out = [];
    for (const m of messages) {
        const prev = out[out.length - 1];
        if (prev && prev.role === m.role && (m.content || m.images?.length)) {
            if (m.content) prev.content = prev.content ? prev.content + '\n\n' + m.content : m.content;
            if (m.images?.length) prev.images = [...(prev.images || []), ...m.images];
        } else {
            out.push({ ...m });
        }
    }
    return out;
}

// 示例消息只加说话人前缀并摘掉 name，role 保持不变，之后才会被同 role 合并
function applyNames(messages, { charName, userName }) {
    return messages.map((m) => {
        const x = { ...m };
        if (x.role === 'system' && x.name === 'example_assistant') {
            if (charName && !x.content.startsWith(`${charName}: `)) x.content = `${charName}: ${x.content}`;
        } else if (x.role === 'system' && x.name === 'example_user') {
            if (userName && !x.content.startsWith(`${userName}: `)) x.content = `${userName}: ${x.content}`;
        } else if (x.name && x.role !== 'system') {
            if (!x.content.startsWith(`${x.name}: `)) x.content = `${x.name}: ${x.content}`;
        }
        delete x.name;
        delete x.identifier;
        return x;
    });
}

// strict 后处理：只允许开头一条 system，其余转 user，必要时补 placeholder
export function strictMerge(messages, { charName, userName, placeholder = '[Start a new chat]' }) {
    let merged = mergeSameRole(applyNames(messages, { charName, userName }));

    // 中段的 system 一律降级成 user
    for (let i = 0; i < merged.length; i++) {
        if (i > 0 && merged[i].role === 'system') merged[i].role = 'user';
    }

    // 首条是 system 而次条不是 user 时补一条占位，避免 user 不打头
    if (merged.length) {
        if (merged[0].role === 'system' && (merged.length === 1 || merged[1].role !== 'user')) {
            merged.splice(1, 0, { role: 'user', content: placeholder });
        } else if (merged[0].role !== 'system' && merged[0].role !== 'user') {
            merged.unshift({ role: 'user', content: placeholder });
        }
    }

    // 降级后可能又出现相邻同 role，再合一次
    merged = mergeSameRole(merged);
    if (!merged.length) merged.push({ role: 'user', content: placeholder });
    return merged;
}
