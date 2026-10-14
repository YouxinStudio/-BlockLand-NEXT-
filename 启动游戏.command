#!/bin/bash
# 方块大陆 BlockLand 一键启动（macOS / Linux）
cd "$(dirname "$0")"
echo "========================================"
echo "  方块大陆 BlockLand 正在启动..."
echo "  浏览器将自动打开，手机同 WiFi 访问 http://本机IP:8123"
echo "  按 Ctrl+C 停止游戏"
echo "========================================"
( sleep 1; open http://127.0.0.1:8123 2>/dev/null || xdg-open http://127.0.0.1:8123 2>/dev/null ) &
python3 -m http.server 8123
