@echo off
REM YourLab Website - Setup & Run Script (Windows)
REM Run this script to set up and start the YourLab website

echo.
echo 🚀 YourLab Website - Setup ^& Run
echo ==================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo Then run this script again.
    pause
    exit /b 1
)

echo ✅ Node.js is installed
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo    Version: %NODE_VERSION%
echo.

REM Navigate to server directory
cd /d "%~dp0"

REM Check if node_modules exists
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    call npm install
    echo ✅ Dependencies installed
) else (
    echo ✅ Dependencies already installed
)

echo.
echo 🎉 Setup complete!
echo.
echo Starting server...
echo ================================================
echo.
echo Your website will be available at:
echo   🌐 Main website: http://localhost:3000
echo   📊 Admin dashboard: http://localhost:3000/admin.html
echo.
echo API endpoints:
echo   📋 View inquiries: http://localhost:3000/api/inquiries
echo   ❤️ Health check: http://localhost:3000/api/health
echo.
echo Press Ctrl+C to stop the server
echo ================================================
echo.

REM Start the server
call npm start

pause
