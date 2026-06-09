@echo off
title TapKing - Mini App Launcher

echo  Starting TapKing...
echo.

:: Start game server in new window
start "TapKing Server" cmd /k "cd /d "%~dp0server" && node index.js"

:: Wait a moment then start ngrok
timeout /t 2 /nobreak >nul
start "TapKing ngrok" cmd /k "ngrok http 3000"

echo  Server and ngrok started!
echo.
echo  Bot link: https://t.me/miniap_pp_bot
echo  Local:    http://localhost:3000
echo  Public:   https://hypnotist-letter-outsmart.ngrok-free.app
echo.
echo  Press any key to close this window...
pause >nul
