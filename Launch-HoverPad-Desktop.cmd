@echo off
title HoverPad Desktop Launcher
setlocal

:: 1. If local Electron runtime exists, launch via Electron (full native tray + global shortcuts)
if exist "%~dp0node_modules\electron\dist\electron.exe" (
  start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
  exit /b 0
)

:: 2. Zero-Block Fallback: Launch as a standalone Windows Desktop App using Microsoft-signed Edge App Mode
:: Because msedge.exe is digitally signed by Microsoft Corporation, Windows 11 Smart App Control NEVER blocks it,
:: and Edge supports the Document Picture-in-Picture API for Always-on-Top floating pinned notes!
where msedge >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  start "" msedge --app="https://justnathan25.github.io/HoverPad/src/index.html" --window-size=1180,760
  exit /b 0
)

start "" "https://justnathan25.github.io/HoverPad/src/index.html"
exit /b 0
