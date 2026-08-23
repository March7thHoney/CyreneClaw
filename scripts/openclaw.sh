#!/bin/sh
# 停止/恢复旧版 openclaw 网关。plist 保留，随时可切回。
set -e
LABEL=ai.openclaw.gateway
UID_=$(id -u)
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

case "${1:-status}" in
  status)
    if launchctl print "gui/$UID_/$LABEL" >/dev/null 2>&1; then
      echo "openclaw: 运行中"
      launchctl print "gui/$UID_/$LABEL" | grep -E "^\s+(state|pid) " || true
    else
      echo "openclaw: 未加载"
    fi
    [ -f "$PLIST" ] && echo "plist: 存在（可随时恢复）" || echo "plist: 不存在"
    ;;
  stop)
    # KeepAlive=true，直接 kill 会被拉起，必须 bootout
    launchctl bootout "gui/$UID_/$LABEL" 2>/dev/null || echo "（本来就没在跑）"
    sleep 2
    if lsof -nP -iTCP:18789 -sTCP:LISTEN >/dev/null 2>&1; then
      echo "警告: 18789 仍被占用"
    else
      echo "openclaw 已停止，端口 18789 已释放"
    fi
    ;;
  start)
    [ -f "$PLIST" ] || { echo "找不到 $PLIST"; exit 1; }
    launchctl bootstrap "gui/$UID_" "$PLIST"
    launchctl kickstart -k "gui/$UID_/$LABEL"
    echo "openclaw 已恢复"
    ;;
  *)
    echo "用法: $0 {status|stop|start}"; exit 1;;
esac
