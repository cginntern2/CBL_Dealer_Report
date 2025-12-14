@echo off
echo ========================================
echo Starting CBL Dealer Report Servers
echo ========================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Get the directory where this batch file is located
cd /d "%~dp0"

:: Check if server directory exists
if not exist "server\" (
    echo ERROR: server directory not found!
    pause
    exit /b 1
)

:: Check if client directory exists
if not exist "client\" (
    echo ERROR: client directory not found!
    pause
    exit /b 1
)

:: Check if node_modules exist in root
if not exist "node_modules\" (
    echo Installing server dependencies...
    call npm install
    echo.
)

:: Check if node_modules exist in client
if not exist "client\node_modules\" (
    echo Installing client dependencies...
    cd client
    call npm install
    cd ..
    echo.
)

echo Starting Backend Server (Port 5000)...
start "CBL Backend Server" cmd /k "cd /d %~dp0 && npm run server"

:: Wait a bit for backend to start
timeout /t 3 /nobreak >nul

echo Starting Frontend Server (Port 3000)...
start "CBL Frontend Server" cmd /k "cd /d %~dp0client && npm start"

echo.
echo ========================================
echo Servers are starting!
echo ========================================
echo Backend: http://localhost:5000
echo Frontend: http://localhost:3000
echo.
echo Two new windows have been opened.
echo Close those windows to stop the servers.
echo.
echo Press any key to exit this window (servers will keep running)...
pause >nul

