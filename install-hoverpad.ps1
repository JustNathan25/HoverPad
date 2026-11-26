# =====================================================================
# HoverPad — Smart-App-Control-Safe Windows Desktop Installer
# Installs HoverPad to %LOCALAPPDATA%\Programs\HoverPad and creates
# Desktop & Start Menu shortcuts using Microsoft's signed runtime.
# =====================================================================

$ErrorActionPreference = "Stop"
$InstallDir = "$env:LOCALAPPDATA\Programs\HoverPad"
$RepoZipUrl = "https://github.com/JustNathan25/HoverPad/archive/refs/heads/main.zip"
$TempZip = "$env:TEMP\HoverPad-main.zip"
$TempExtract = "$env:TEMP\HoverPad-extract"

Write-Host "Installing HoverPad Desktop App..." -ForegroundColor Cyan

# Create install directory
if (!(Test-Path $InstallDir)) {
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

# If running from an already downloaded folder, copy local files; otherwise download from GitHub
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
if ($ScriptDir -and (Test-Path (Join-Path $ScriptDir "src\index.html"))) {
  Copy-Item -Path (Join-Path $ScriptDir "src") -Destination $InstallDir -Recurse -Force
  Copy-Item -Path (Join-Path $ScriptDir "assets") -Destination $InstallDir -Recurse -Force
  if (Test-Path (Join-Path $ScriptDir "version.json")) {
    Copy-Item -Path (Join-Path $ScriptDir "version.json") -Destination $InstallDir -Force
  }
} else {
  Invoke-WebRequest -Uri $RepoZipUrl -OutFile $TempZip -UseBasicParsing
  if (Test-Path $TempExtract) { Remove-Item $TempExtract -Recurse -Force }
  Expand-Archive -Path $TempZip -DestinationPath $TempExtract -Force
  $ExtractedRoot = Join-Path $TempExtract "HoverPad-main"
  Copy-Item -Path (Join-Path $ExtractedRoot "src") -Destination $InstallDir -Recurse -Force
  Copy-Item -Path (Join-Path $ExtractedRoot "assets") -Destination $InstallDir -Recurse -Force
  if (Test-Path (Join-Path $ExtractedRoot "version.json")) {
    Copy-Item -Path (Join-Path $ExtractedRoot "version.json") -Destination $InstallDir -Force
  }
  Remove-Item $TempZip -Force -ErrorAction SilentlyContinue
  Remove-Item $TempExtract -Recurse -Force -ErrorAction SilentlyContinue
}

# Remove Mark-of-the-Web (Zone.Identifier) from all installed files
Get-ChildItem -Path $InstallDir -Recurse | Unblock-File -ErrorAction SilentlyContinue

# Locate Microsoft-signed Edge binary (built into every Windows 10 & 11 PC)
$EdgePaths = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$SignedEdge = $EdgePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

$AppHtmlUrl = "file:///" + ($InstallDir -replace '\\', '/') + "/src/index.html"
$IconPath = Join-Path $InstallDir "assets\icon.ico"

# Create Desktop and Start Menu Shortcuts pointing to the Microsoft-signed binary
$WshShell = New-Object -ComObject WScript.Shell
$Shortcuts = @(
  "$env:USERPROFILE\Desktop\HoverPad.lnk",
  "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\HoverPad.lnk"
)

foreach ($lnk in $Shortcuts) {
  $sc = $WshShell.CreateShortcut($lnk)
  if ($SignedEdge) {
    $sc.TargetPath = $SignedEdge
    $sc.Arguments = "--app=`"$AppHtmlUrl`" --window-size=1180,760 --user-data-dir=`"$InstallDir\Profile`""
  } else {
    $sc.TargetPath = "$InstallDir\src\index.html"
  }
  $sc.WorkingDirectory = $InstallDir
  if (Test-Path $IconPath) {
    $sc.IconLocation = $IconPath
  }
  $sc.Description = "HoverPad — Collaborative Floating Notes"
  $sc.Save()
}

Write-Host "HoverPad installed successfully! Launching HoverPad..." -ForegroundColor Green
if ($SignedEdge) {
  Start-Process -FilePath $SignedEdge -ArgumentList "--app=`"$AppHtmlUrl`" --window-size=1180,760 --user-data-dir=`"$InstallDir\Profile`""
} else {
  Start-Process "$InstallDir\src\index.html"
}
