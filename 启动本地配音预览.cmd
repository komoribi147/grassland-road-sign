@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set PORT=8790
set PYTHONIOENCODING=utf-8
echo 本地试听：http://localhost:8790/voice-preview.html
echo 如提示端口已被占用，请直接打开上面的地址。
node server/server.mjs
pause
