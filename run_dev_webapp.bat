@echo off
title R&R Water - Developer Web Application (Port 4000)
cd /d "%~dp0"
echo ========================================================
echo   R&R WATER REFILLING STATION — DEVELOPER WEB APP
echo   Port: 4000 (Completely Independent from Cashier Terminal)
echo ========================================================
echo.
echo Starting Developer Web Server on port 4000...
start "" http://localhost:4000
node developer-portal/dev-server.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Node.js failed to launch the developer server.
    pause
)
