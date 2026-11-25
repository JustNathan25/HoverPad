# HoverPad

Real-time collaborative notes and snippet manager for desktop with Always-on-Top floating note windows, one-click line copying, and client-side AES-256 encryption.

## How to Test or Install (Windows 11 Smart App Control Safe)

### Option 1: Instant Web & Desktop PWA (No `.exe` Download Required)
1. Open **[https://justnathan25.github.io/HoverPad/](https://justnathan25.github.io/HoverPad/)** in Microsoft Edge or Google Chrome.
2. Click the **Install HoverPad** icon in your browser's address bar to install it as a native Windows Desktop App (signed by Microsoft/Google, so Windows Smart App Control never blocks it).
3. Click **Pin Note on Screen** on any note to pop out an **Always-on-Top floating sticky note window** (powered by the Document Picture-in-Picture API) that stays pinned over all your desktop apps.

### Option 2: Run Native Electron Desktop App from Source
```powershell
git clone https://github.com/JustNathan25/HoverPad.git
cd HoverPad
npm.cmd install
npm.cmd start
```
Or double-click **`Launch-HoverPad-Desktop.cmd`**.
