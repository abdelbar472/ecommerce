@echo off
REM Launch every service in its own Windows Terminal pane with live logs.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_logs.ps1" %*
