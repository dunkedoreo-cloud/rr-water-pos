@echo off
title R&R Water - Developer Console (Standalone)
cd /d "%~dp0"
echo ========================================================
echo   R&R WATER REFILLING STATION - STANDALONE DEV CONSOLE
echo   Independent station telemetry, register mirror, and DB
echo ========================================================
echo.
echo Launching Developer Station Console...
python dev_station_console.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Python failed to launch or exited with error.
    echo Make sure Python 3 is installed and added to PATH.
    pause
)
