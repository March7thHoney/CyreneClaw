// 用户规则由配置加载、热更新和控制台写回共用校验。
export const USER_LIMIT = 3;
const ID_RE = /^\d{17,20}$/;
const FLAGS = ['dmEnabled', 'mentionEnabled', 'cadenceEnabled', 'commandsEnabled'];
const KEYS = new Set(['userId', 'displayName', 'replyEveryN', ...FLAGS]);

export function validateUsers(users) {
    if (!Array.isArray(users)) throw new Error('用户规则必须是数组');
    if (users.length > USER_LIMIT) throw new Error(`最多添加 ${USER_LIMIT} 个用户`);
    const seen = new Set();
    return users.map((user, index) => {
        const at = `第 ${index + 1} 个用户`;
        if (!user || typeof user !== 'object' || Array.isArray(user)) throw new Error(`${at}的格式不对`);
        for (const key of Object.keys(user)) if (!KEYS.has(key)) throw new Error(`${at}含有未知字段 ${key}`);
        if (typeof user.userId !== 'string' || !ID_RE.test(user.userId)) throw new Error(`${at}的 ID 必须为 17-20 位数字`);
        if (seen.has(user.userId)) throw new Error(`${at}的 ID 重复了`);
        seen.add(user.userId);
        if (typeof user.displayName !== 'string' || user.displayName.length > 64) throw new Error(`${at}的称呼最多 64 字`);
        for (const flag of FLAGS) if (typeof user[flag] !== 'boolean') throw new Error(`${at}的权限开关必须是布尔值`);
        if (!Number.isInteger(user.replyEveryN) || user.replyEveryN < 1 || user.replyEveryN > 1000) throw new Error(`${at}的 N 必须为 1-1000 的整数`);
        return { ...user, displayName: user.displayName.trim() };
    });
}

export function resolveUsers(discord) {
    if (Object.hasOwn(discord, 'users')) return validateUsers(discord.users);
    return validateUsers([{
        userId: discord.owner?.userId,
        displayName: discord.owner?.displayName || '',
        dmEnabled: discord.dm?.enabled !== false,
        mentionEnabled: true,
        cadenceEnabled: discord.cadence?.enabled === true,
        replyEveryN: discord.cadence?.replyEveryN ?? 10,
        commandsEnabled: true,
    }]);
}

export function userRule(cfg, userId) {
    return cfg.discord.users.find((user) => user.userId === userId);
}

export function userDisplayName(cfg, userId, fallback) {
    return userRule(cfg, userId)?.displayName || fallback || userId;
}
