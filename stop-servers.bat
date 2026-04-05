@echo off
echo ========================================
echo Stopping CBL Sales Report Servers
echo ========================================
echo.

:: Kill node processes running on ports 3000 and 5000
echo Stopping servers on ports 3000 and 5000...

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo Killing process on port 3000 (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000" ^| findstr "LISTENING"') do (
    echo Killing process on port 5000 (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)

:: Also try to kill common node server processes
taskkill /F /FI "WINDOWTITLE eq CBL Backend Server*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq CBL Frontend Server*" >nul 2>&1

echo.
echo Servers stopped!
echo.
pause

