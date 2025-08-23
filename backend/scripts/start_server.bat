@echo off
title Investment Research Analytics API

echo 🚀 Starting Investment Research Analytics API Server...
echo.

cd /d "%~dp0\.."

echo 📁 Working in: %CD%
echo.

echo 🔧 Activating virtual environment...
if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
) else (
    echo ⚠️  Virtual environment not found, using system Python
)

echo.
echo 🌐 Starting API server on http://localhost:8787
echo.

python scripts\start_server.py

pause
