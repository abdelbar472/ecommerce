@echo off
setlocal

REM === Kafka Demo - Run All Services ===
set PYTHONIOENCODING=utf-8
set PYTHONPATH=%~dp0;%~dp0services

REM Kill existing processes on ports if any (optional)
REM Start services in background

start "Auth (8004)" cmd /k python -m uvicorn services.auth.main:app --host 0.0.0.0 --port 8004 --reload
timeout /t 1 >nul

start "Order (8001)" cmd /k python -m uvicorn services.order.main:app --host 0.0.0.0 --port 8001
timeout /t 1 >nul

start "Notification (8002)" cmd /k python -m uvicorn services.notification.main:app --host 0.0.0.0 --port 8002 --reload
timeout /t 1 >nul

start "Analytics (8003)" cmd /k python -m uvicorn services.analytics.main:app --host 0.0.0.0 --port 8003 --reload
timeout /t 1 >nul

start "Client (8006)" cmd /k python -m uvicorn services.client.main:app --host 0.0.0.0 --port 8006 --reload
timeout /t 1 >nul

start "Merchant (8007)" cmd /k python -m uvicorn services.merchant.main:app --host 0.0.0.0 --port 8007 --reload
timeout /t 1 >nul

start "Admin (8008)" cmd /k python -m uvicorn services.admin.main:app --host 0.0.0.0 --port 8008 --reload
timeout /t 1 >nul

echo All services starting...
echo Auth: http://localhost:8004/docs
echo Order: http://localhost:8001/docs
echo Notification: http://localhost:8002/docs
echo Analytics: http://localhost:8003/docs
echo Client: http://localhost:8006/docs
echo Merchant: http://localhost:8007/docs
echo Admin: http://localhost:8008/docs
endlocal