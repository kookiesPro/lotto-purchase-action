@echo off
chcp 65001 >nul
REM 로또 구매 로컬 실행 (로그: local\logs\YYYY-MM-DD.log)
cd /d "%~dp0.."
if not exist "local\logs" mkdir "local\logs"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set TODAY=%%i
node local\run-local.mjs %* >> "local\logs\%TODAY%.log" 2>&1
set RC=%ERRORLEVEL%
type "local\logs\%TODAY%.log"
exit /b %RC%
