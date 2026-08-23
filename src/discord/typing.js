// typing 指示器心跳，Discord 的 typing 状态约 10 秒过期，需要周期性续
export function startTyping(channel, { intervalMs = 8000, maxMs = 900000 } = {}) {
    let stopped = false;
    const tick = () => {
        if (stopped) return;
        channel.sendTyping().catch(() => { /* typing 失败不影响回复 */ });
    };
    tick();
    const timer = setInterval(tick, intervalMs);
    const guard = setTimeout(() => stop(), maxMs);
    function stop() {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
        clearTimeout(guard);
    }
    return stop;
}
