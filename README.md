# HoverPad

Real-time collaborative notes and snippet manager for desktop with Always-on-Top floating note windows, one-click line copying, and client-side AES-256 encryption.

## Install on Any Windows 10 / 11 PC (100% Smart App Control Safe)

### Option 1: 1-Line PowerShell Desktop Installer (Installs Desktop & Start Menu App)
On any Windows PC, open **PowerShell** and paste this single command:
```powershell
irm https://raw.githubusercontent.com/JustNathan25/HoverPad/main/install-hoverpad.ps1 | iex
```
- Downloads HoverPad to `%LOCALAPPDATA%\Programs\HoverPad`.
- Creates **HoverPad** shortcuts on the **Windows Desktop** and **Start Menu** with the custom HoverPad icon.
- Launches HoverPad in a dedicated desktop app window using Windows' built-in Microsoft-signed runtime (`msedge.exe --app`), so **Windows 11 Smart App Control never blocks it** and **Node.js / Git are not required**.

### Option 2: Instant Browser & PWA Install
Open **[https://justnathan25.github.io/HoverPad/](https://justnathan25.github.io/HoverPad/)** in Microsoft Edge or Google Chrome and click the **Install HoverPad** icon in the address bar.

### Option 3: Developer Electron Build (From Source)
```powershell
git clone https://github.com/JustNathan25/HoverPad.git
cd HoverPad
npm.cmd install
npm.cmd start
```
