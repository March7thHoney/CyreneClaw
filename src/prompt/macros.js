// 宏替换引擎，按酒馆的三段式顺序求值：preEnv → env → postEnv
const RE = (name) => new RegExp(`\\{\\{${name}\\}\\}`, 'gi');

function pad(n) { return String(n).padStart(2, '0'); }

// 与酒馆同名的日期时间宏，取本机时区
function postEnvMacros(text) {
    const now = new Date();
    const d = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const t = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()];
    return text
        .replace(RE('date'), d)
        .replace(RE('time'), t)
        .replace(RE('weekday'), weekday)
        .replace(RE('isodate'), d)
        .replace(RE('isotime'), t);
}

// 求值宏：env 里的键替换成对应值，未知宏原样保留
export function evaluateMacros(text, env = {}) {
    if (!text) return '';
    let out = String(text);

    // 先处理注释与空操作，避免它们里面的内容被后续替换
    out = out.replace(/\{\{\/\/[\s\S]*?\}\}/g, '');
    out = out.replace(RE('noop'), '');

    // env 宏：char 与 user 放最后，保证前面展开出来的内容也能被替换到
    const keys = Object.keys(env).filter((k) => k !== 'char' && k !== 'user');
    for (const k of keys) {
        if (env[k] === undefined || env[k] === null) continue;
        out = out.replace(RE(k), () => String(env[k]));
    }
    for (const k of ['char', 'user']) {
        if (env[k] === undefined || env[k] === null) continue;
        out = out.replace(RE(k), () => String(env[k]));
    }
    // 尖括号形式是酒馆的旧写法，一并支持
    if (env.user !== undefined) out = out.replace(/<USER>/gi, String(env.user));
    if (env.char !== undefined) out = out.replace(/<BOT>|<CHAR>/gi, String(env.char));

    out = postEnvMacros(out);
    out = out.replace(RE('newline'), '\n');
    out = out.replace(RE('trim'), '');
    return out;
}

// 角色卡字段专用替换：跑宏并抹平 CRLF，卡里存的是 CRLF 必须在这里去掉
export function baseChatReplace(text, env) {
    if (!text) return '';
    let out = evaluateMacros(text, env);
    out = out.replace(/\r/g, '');
    // {{trim}} 出现过就把它两侧的空白一并吃掉
    if (/\{\{trim\}\}/gi.test(text)) out = out.replace(/^\s+|\s+$/g, '');
    return out;
}
