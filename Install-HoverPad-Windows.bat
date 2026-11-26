@echo off
title HoverPad Desktop Installer (v2.7.0)
color 0B
echo ============================================================================
echo   HoverPad Desktop HUD — Official Windows 1-Click Installer
echo   Source: https://github.com/JustNathan25/HoverPad
echo ============================================================================
echo.
echo Downloading and installing HoverPad to %LOCALAPPDATA%\Programs\HoverPad...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://raw.githubusercontent.com/JustNathan25/HoverPad/main/install-hoverpad.ps1 | iex"
echo.
echo ============================================================================
echo   HoverPad installation complete! Check your Desktop and Start Menu.
echo ============================================================================
timeout /t 4 >nul
