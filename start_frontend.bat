@echo off
setlocal
cd /d %~dp0\frontend
start "Frontend (3000)" cmd /k npm run dev
endlocal