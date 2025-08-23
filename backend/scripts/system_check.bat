@echo off
title System Check - Investment Research Analytics

echo 🔍 Running Investment Research Analytics System Check...
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
python scripts\system_check.py

echo.
pause
