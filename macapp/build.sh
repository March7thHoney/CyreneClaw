#!/usr/bin/env bash
# 编译 SwiftUI 控制台并手工组装 .app，全程零硬编码路径
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
APP_NAME="CyreneClaw"
EXEC_NAME="CyreneClawConsole"
BUNDLE_ID="com.cyreneclaw.console"
OUT="$HERE/build"
APP="$OUT/$APP_NAME.app"

# 构建完默认替换 /Applications 里的 app，不想装就传 --no-install
DO_INSTALL=1
DO_ICON=0
UNIVERSAL=0
for a in "$@"; do
    case "$a" in
        --no-install) DO_INSTALL=0 ;;
        --icon) DO_ICON=1 ;;
        --universal) UNIVERSAL=1 ;;
        *) echo "用法: $0 [--icon] [--universal] [--no-install]"; exit 1 ;;
    esac
done

if [ "$DO_ICON" = 1 ]; then
    bash "$HERE/scripts/make-icon.sh"
fi
[ -f "$HERE/Resources/AppIcon.icns" ] || { echo "缺少 Resources/AppIcon.icns，请先跑 $0 --icon" >&2; exit 1; }

if [ "$UNIVERSAL" = 1 ]; then
    for T in arm64 x86_64; do
        swift build -c release --package-path "$HERE" \
            --scratch-path "$OUT/.build-$T" --triple "$T-apple-macosx14.0"
    done
    mkdir -p "$OUT/lipo"
    lipo -create -output "$OUT/lipo/$EXEC_NAME" \
        "$OUT/.build-arm64/release/$EXEC_NAME" "$OUT/.build-x86_64/release/$EXEC_NAME"
    BIN="$OUT/lipo/$EXEC_NAME"
else
    swift build -c release --package-path "$HERE"
    BIN="$(swift build -c release --package-path "$HERE" --show-bin-path)/$EXEC_NAME"
fi

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/$EXEC_NAME"
chmod +x "$APP/Contents/MacOS/$EXEC_NAME"
cp "$HERE/Resources/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
cp "$HERE/Info.plist" "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"

# 构建号取提交数，每次构建递增，LaunchServices 才肯换掉图标缓存
BUILD_NO="$(git -C "$ROOT" rev-list --count HEAD 2>/dev/null || echo 1)"
plutil -replace CFBundleVersion -string "$BUILD_NO" "$APP/Contents/Info.plist"
plutil -lint "$APP/Contents/Info.plist" > /dev/null

# ad-hoc 签名，本机双击即开，不做公证
codesign --force --sign - --identifier "$BUNDLE_ID" "$APP"
codesign --verify --strict "$APP"
echo "已构建 $APP"

if [ "$DO_INSTALL" = 1 ]; then
    DEST="/Applications/$APP_NAME.app"
    rm -rf "$DEST"
    cp -R "$APP" "$DEST"
    touch "$DEST"
    LSREG="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
    [ -x "$LSREG" ] && "$LSREG" -f "$DEST" || true
    echo "已安装到 $DEST"
fi
