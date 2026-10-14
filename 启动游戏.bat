@echo off
chcp 65001 >nul
title 方块大陆 BlockLand 启动器
echo ========================================
echo   方块大陆 BlockLand 正在启动...
echo   启动后浏览器会自动打开，手机同 WiFi 可访问
echo   本机地址: http://本机IP:8123
echo ========================================
cd /d "%~dp0"
start "" http://127.0.0.1:8123
python -m http.server 8123
pause
