@echo off
setlocal
echo Starting all Kafka Demo services and frontend...
call start_services.bat
timeout /t 5 >nul
call start_frontend.bat
echo Done. Check opened windows.
endlocal
pause