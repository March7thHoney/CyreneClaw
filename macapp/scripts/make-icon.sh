#!/bin/bash
# 一次性生成 AppIcon.icns，产物已入库，日常构建不跑这个脚本，去白底依赖 ImageMagick
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
RES="$(cd "$HERE/.." && pwd)/Resources"
SRC="$RES/icon-source.png"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

command -v magick >/dev/null || { echo "需要 ImageMagick：brew install imagemagick" >&2; exit 1; }
[ -f "$SRC" ] || { echo "找不到源图 $SRC" >&2; exit 1; }

W=$(magick identify -format '%w' "$SRC")
H=$(magick identify -format '%h' "$SRC")

# 从四角 floodfill 去白底：角色的白发饰与白衣领连不到边界，不会被打穿
magick "$SRC" -alpha set -fuzz 8% \
    -fill none -floodfill "+0+0" white \
    -fill none -floodfill "+$((W-1))+0" white \
    -fill none -floodfill "+0+$((H-1))" white \
    -fill none -floodfill "+$((W-1))+$((H-1))" white \
    -channel A -morphology Erode Octagon:1 -blur 0x0.8 -level 25%,75% +channel \
    -trim +repage \
    "$WORK/art.png"

swift "$HERE/compose-icon.swift" "$WORK/art.png" "$WORK/icon.png"

ISET="$WORK/AppIcon.iconset"
mkdir -p "$ISET"
for spec in "16 16x16" "32 16x16@2x" "32 32x32" "64 32x32@2x" \
            "128 128x128" "256 128x128@2x" "256 256x256" "512 256x256@2x" \
            "512 512x512" "1024 512x512@2x"; do
    set -- $spec
    magick "$WORK/icon.png" -filter Lanczos -resize "$1x$1" "$ISET/icon_$2.png"
done

iconutil -c icns "$ISET" -o "$RES/AppIcon.icns"
echo "已生成 $RES/AppIcon.icns"
