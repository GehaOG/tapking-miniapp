@echo off
start "TapKing Server" cmd /k "cd /d "%~dp0server" && node index.js"
timeout /t 2 /nobreak >nul
start "TapKing Tunnel" cmd /k "cd /d "%~dp0server" && node tunnel.js"
exit
