@echo off
echo ========================================
echo Restarting CBL Dealer Report Servers
echo ========================================
echo.

:: Get the directory where this batch file is located
cd /d "%~dp0"

:: Stop servers on ports 3000 and 5000
echo Stopping existing servers...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo Stopping process on port 3000 (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000" ^| findstr "LISTENING"') do (
    echo Stopping process on port 5000 (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)

:: Also try to kill common node server processes
taskkill /F /FI "WINDOWTITLE eq CBL Backend Server*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq CBL Frontend Server*" >nul 2>&1

echo.
echo Waiting for processes to stop...
timeout /t 2 /nobreak >nul

echo.
echo Starting Backend Server (Port 5000)...
start "CBL Backend Server" cmd /k "cd /d %~dp0 && npm run server"

:: Wait a bit for backend to start
timeout /t 3 /nobreak >nul

echo Starting Frontend Server (Port 3000)...
start "CBL Frontend Server" cmd /k "cd /d %~dp0client && npm start"

echo.
echo ========================================
echo Servers are restarting!
echo ========================================
echo Backend: http://localhost:5000
echo Frontend: http://localhost:3000
echo.
echo Two new windows have been opened.
echo Close those windows to stop the servers.
echo.
echo Press any key to exit this window (servers will keep running)...
pause >nul

