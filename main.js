const { app, BrowserWindow, ipcMain, clipboard, shell, Tray, Menu, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/JustNathan25/HoverPad/main';
const LOCAL_VERSION_FILE = path.join(__dirname, 'version.json');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let stateSaveTimer = null;
let updateCheckInterval = null;

// Map of noteId -> BrowserWindow for individual Pinned Floating Notes
const pinnedNoteWindows = new Map();

// Persisted Desktop Window & Auto-Update State
const stateFilePath = path.join(app.getPath('userData'), 'hoverpad-window-state.json');

const defaultDesktopState = {
  width: 1180,
  height: 760,
  x: undefined,
  y: undefined,
  closeToTray: true,
  launchAtStartup: false,
  autoUpdate: true
};

function loadDesktopState() {
  try {
    if (fs.existsSync(stateFilePath)) {
      const raw = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
      return {
        ...defaultDesktopState,
        width: Math.max(340, Number(raw.width) || 1180),
        height: Math.max(420, Number(raw.height) || 760),
        x: raw.x,
        y: raw.y,
        closeToTray: raw.closeToTray !== undefined ? Boolean(raw.closeToTray) : true,
        launchAtStartup: Boolean(raw.launchAtStartup),
        autoUpdate: raw.autoUpdate !== undefined ? Boolean(raw.autoUpdate) : true
      };
    }
  } catch (e) {
    console.warn('Could not load saved state:', e);
  }
  return { ...defaultDesktopState };
}

let desktopState = loadDesktopState();

function getLocalVersionManifest() {
  try {
    if (fs.existsSync(LOCAL_VERSION_FILE)) {
      return JSON.parse(fs.readFileSync(LOCAL_VERSION_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('Could not read local version.json:', e);
  }
  return {
    version: app.getVersion() || '2.7.0',
    title: 'HoverPad Desktop',
    notes: []
  };
}

function compareSemver(vA, vB) {
  const partsA = String(vA || '0.0.0').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const partsB = String(vB || '0.0.0').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const a = partsA[i] || 0;
    const b = partsB[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

function fetchUrlText(urlStr) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      `${urlStr}${urlStr.includes('?') ? '&' : '?'}t=${Date.now()}`,
      {
        headers: {
          'User-Agent': 'HoverPad-Desktop-Updater',
          'Cache-Control': 'no-cache'
        }
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchUrlText(res.headers.location).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} when fetching ${urlStr}`));
          return;
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.setTimeout(12000, () => {
      req.destroy(new Error('Update check timed out'));
    });
  });
}

// =====================================================================
// LIVE OVER-THE-AIR (OTA) GITHUB AUTO-UPDATER
// Updates app files in-place without triggering Windows Smart App Control
// =====================================================================
async function downloadAndApplyOtaUpdate(remoteManifest) {
  const filesToSync = Array.isArray(remoteManifest?.files) && remoteManifest.files.length > 0
    ? remoteManifest.files
    : [
        'version.json',
        'src/index.html',
        'src/styles.css',
        'src/app.js',
        'src/note-pad.html',
        'src/note-pad.js',
        'src/manifest.json'
      ];

  const targetDirs = [__dirname];
  const secondaryInstallDir = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'HoverPad');
  if (
    process.env.LOCALAPPDATA &&
    fs.existsSync(secondaryInstallDir) &&
    path.resolve(secondaryInstallDir).toLowerCase() !== path.resolve(__dirname).toLowerCase()
  ) {
    targetDirs.push(secondaryInstallDir);
  }

  for (const relFile of filesToSync) {
    const safeRel = String(relFile).replace(/^(\.\.[/\\])+/, '');
    const rawContent = await fetchUrlText(`${GITHUB_RAW_BASE}/${safeRel}`);
    for (const baseDir of targetDirs) {
      try {
        const destPath = path.join(baseDir, safeRel);
        const destFolder = path.dirname(destPath);
        if (!fs.existsSync(destFolder)) {
          fs.mkdirSync(destFolder, { recursive: true });
        }
        fs.writeFileSync(destPath, rawContent, 'utf8');
      } catch (writeErr) {
        console.warn(`Could not write ${safeRel} to ${baseDir}:`, writeErr.message);
      }
    }
  }

  return true;
}

async function checkForAppUpdates({ manual = false, applyNow = false } = {}) {
  const localManifest = getLocalVersionManifest();
  try {
    const remoteJsonStr = await fetchUrlText(`${GITHUB_RAW_BASE}/version.json`);
    const remoteManifest = JSON.parse(remoteJsonStr);
    const cmp = compareSemver(remoteManifest.version, localManifest.version);
    const hasUpdate = cmp > 0;

    if (hasUpdate && (desktopState.autoUpdate || applyNow)) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:status', {
          status: 'downloading',
          localVersion: localManifest.version,
          remoteManifest
        });
      }

      await downloadAndApplyOtaUpdate(remoteManifest);

      const resultPayload = {
        status: 'downloaded',
        hasUpdate: true,
        autoApplied: true,
        localVersion: remoteManifest.version,
        previousVersion: localManifest.version,
        remoteManifest
      };

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:status', resultPayload);
      }
      return resultPayload;
    }

    const statusPayload = {
      status: hasUpdate ? 'available' : 'up-to-date',
      hasUpdate,
      autoApplied: false,
      localVersion: localManifest.version,
      remoteManifest,
      manual
    };

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:status', statusPayload);
    }
    return statusPayload;
  } catch (err) {
    const errPayload = {
      status: 'error',
      hasUpdate: false,
      localVersion: localManifest.version,
      error: err.message,
      manual
    };
    if (mainWindow && !mainWindow.isDestroyed() && manual) {
      mainWindow.webContents.send('updater:status', errPayload);
    }
    return errPayload;
  }
}

function saveDesktopStateImmediate() {
  try {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMaximized()) {
      const b = mainWindow.getBounds();
      if (b.width >= 800 && b.height >= 500) {
        desktopState.width = b.width;
        desktopState.height = b.height;
      }
      desktopState.x = b.x;
      desktopState.y = b.y;
    }
    fs.writeFileSync(stateFilePath, JSON.stringify(desktopState, null, 2), 'utf8');
  } catch (e) {
    console.warn('Could not save desktop state:', e);
  }
}

function scheduleSaveDesktopState() {
  if (stateSaveTimer) clearTimeout(stateSaveTimer);
  stateSaveTimer = setTimeout(saveDesktopStateImmediate, 350);
}

// Register hoverpad:// custom deep-link protocol for seamless OAuth redirect back to desktop
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('hoverpad', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('hoverpad');
}

function handleDeepLinkUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return;
  if (urlStr.startsWith('hoverpad://')) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('oauth-deep-link', urlStr);
    }
  }
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    const deepLink = commandLine.find((arg) => typeof arg === 'string' && arg.startsWith('hoverpad://'));
    if (deepLink) handleDeepLinkUrl(deepLink);
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLinkUrl(url);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: desktopState.width || 1180,
    height: desktopState.height || 760,
    x: desktopState.x,
    y: desktopState.y,
    minWidth: 340,
    minHeight: 420,
    frame: false,
    transparent: false,
    backgroundColor: '#ececf0',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    const startupDeepLink = process.argv.find((arg) => typeof arg === 'string' && arg.startsWith('hoverpad://'));
    if (startupDeepLink) handleDeepLinkUrl(startupDeepLink);

    // Check for GitHub OTA updates 3 seconds after startup, and every 15 minutes
    setTimeout(() => {
      checkForAppUpdates({ manual: false });
    }, 3000);

    if (updateCheckInterval) clearInterval(updateCheckInterval);
    updateCheckInterval = setInterval(() => {
      checkForAppUpdates({ manual: false });
    }, 15 * 60 * 1000);
  });

  mainWindow.on('move', scheduleSaveDesktopState);
  mainWindow.on('resize', scheduleSaveDesktopState);

  mainWindow.on('close', (e) => {
    saveDesktopStateImmediate();
    if (!isQuitting && desktopState.closeToTray && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// =====================================================================
// FLOATING PINNED NOTE WINDOWS (Only individual notes float on screen)
// =====================================================================
function openOrFocusPinnedNoteWindow(notePayload) {
  if (!notePayload || !notePayload.id) return false;
  const noteId = String(notePayload.id);

  if (pinnedNoteWindows.has(noteId)) {
    const existingWin = pinnedNoteWindows.get(noteId);
    if (!existingWin.isDestroyed()) {
      existingWin.show();
      existingWin.focus();
      existingWin.webContents.send('note-pad:data', notePayload);
      return true;
    }
    pinnedNoteWindows.delete(noteId);
  }

  const offset = (pinnedNoteWindows.size % 5) * 26;

  const noteWin = new BrowserWindow({
    width: 390,
    height: 460,
    minWidth: 280,
    minHeight: 240,
    x: 80 + offset,
    y: 80 + offset,
    frame: false,
    transparent: false,
    backgroundColor: notePayload.theme === 'dark' ? '#14141b' : '#ffffff',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  noteWin.setAlwaysOnTop(true, 'screen-saver');
  noteWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  pinnedNoteWindows.set(noteId, noteWin);

  noteWin.loadFile(path.join(__dirname, 'src', 'note-pad.html'), {
    query: { noteId }
  });

  noteWin.once('ready-to-show', () => {
    if (!noteWin.isDestroyed()) {
      noteWin.show();
      noteWin.webContents.send('note-pad:data', notePayload);
    }
  });

  noteWin.webContents.on('did-finish-load', () => {
    if (!noteWin.isDestroyed()) {
      noteWin.webContents.send('note-pad:data', notePayload);
    }
  });

  noteWin.on('closed', () => {
    pinnedNoteWindows.delete(noteId);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('note-window-closed', noteId);
    }
  });

  return true;
}

function closePinnedNoteWindow(noteId) {
  const id = String(noteId);
  if (pinnedNoteWindows.has(id)) {
    const win = pinnedNoteWindows.get(id);
    pinnedNoteWindows.delete(id);
    if (!win.isDestroyed()) {
      win.close();
    }
    return true;
  }
  return false;
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'assets', 'icon.ico');
    const trayIcon = nativeImage.createFromPath(iconPath);
    tray = new Tray(trayIcon);
    updateTrayMenu();
    tray.setToolTip('HoverPad — Collaborative Notes & Floating Sticky Snippets');
    tray.on('click', () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (e) {
    console.error('Tray creation warning:', e);
  }
}

function updateTrayMenu() {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open HoverPad Workspace',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Check for App Updates Now',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
        checkForAppUpdates({ manual: true });
      }
    },
    {
      label: desktopState.autoUpdate ? '✓ Auto-Update Enabled' : 'Enable Auto-Update',
      click: () => {
        desktopState.autoUpdate = !desktopState.autoUpdate;
        saveDesktopStateImmediate();
        updateTrayMenu();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('auto-update-pref-changed', desktopState.autoUpdate);
        }
      }
    },
    { type: 'separator' },
    {
      label: desktopState.closeToTray ? '✓ Close Button Minimizes to Tray' : 'Close Button Minimizes to Tray',
      click: () => {
        desktopState.closeToTray = !desktopState.closeToTray;
        saveDesktopStateImmediate();
        updateTrayMenu();
      }
    },
    {
      label: desktopState.launchAtStartup ? '✓ Launch at Windows Startup' : 'Launch at Windows Startup',
      click: () => {
        toggleLaunchAtStartup(!desktopState.launchAtStartup);
      }
    },
    { type: 'separator' },
    {
      label: 'Quit HoverPad Completely',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
}

function toggleLaunchAtStartup(targetState) {
  desktopState.launchAtStartup = typeof targetState === 'boolean' ? targetState : !desktopState.launchAtStartup;
  try {
    app.setLoginItemSettings({
      openAtLogin: desktopState.launchAtStartup,
      path: process.execPath
    });
  } catch (e) {
    console.warn('Could not update login item settings:', e);
  }
  saveDesktopStateImmediate();
  updateTrayMenu();
  return desktopState.launchAtStartup;
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  globalShortcut.register('CommandOrControl+Shift+P', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('global-toggle-active-note-pin');
    }
  });

  globalShortcut.register('CommandOrControl+Shift+V', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('global-quick-paste');
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  if (updateCheckInterval) clearInterval(updateCheckInterval);
  saveDesktopStateImmediate();
  for (const [, win] of pinnedNoteWindows) {
    if (!win.isDestroyed()) win.destroy();
  }
  pinnedNoteWindows.clear();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('window:get-desktop-state', () => {
  return {
    ...desktopState,
    localVersionManifest: getLocalVersionManifest(),
    pinnedNoteIds: Array.from(pinnedNoteWindows.keys())
  };
});

ipcMain.handle('window:toggle-close-to-tray', (_event, forceState) => {
  desktopState.closeToTray = typeof forceState === 'boolean' ? forceState : !desktopState.closeToTray;
  saveDesktopStateImmediate();
  updateTrayMenu();
  return desktopState.closeToTray;
});

ipcMain.handle('window:toggle-startup', (_event, forceState) => {
  return toggleLaunchAtStartup(forceState);
});

// Auto-Updater IPC Handlers
ipcMain.handle('updater:toggle-auto', (_event, forceState) => {
  desktopState.autoUpdate = typeof forceState === 'boolean' ? forceState : !desktopState.autoUpdate;
  saveDesktopStateImmediate();
  updateTrayMenu();
  return desktopState.autoUpdate;
});

ipcMain.handle('updater:check', (_event, options) => {
  return checkForAppUpdates({ manual: Boolean(options?.manual), applyNow: Boolean(options?.applyNow) });
});

ipcMain.handle('updater:apply-now', () => {
  return checkForAppUpdates({ manual: true, applyNow: true });
});

ipcMain.handle('updater:reload-app', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.reloadIgnoringCache();
  }
  for (const [, win] of pinnedNoteWindows) {
    if (!win.isDestroyed()) {
      win.webContents.reloadIgnoringCache();
    }
  }
  return true;
});

// Floating Note Window IPC Handlers
ipcMain.handle('note-window:open', (_event, notePayload) => {
  return openOrFocusPinnedNoteWindow(notePayload);
});

ipcMain.handle('note-window:close', (_event, noteId) => {
  return closePinnedNoteWindow(noteId);
});

ipcMain.handle('note-window:toggle', (_event, notePayload) => {
  if (!notePayload || !notePayload.id) return { isOpen: false };
  const id = String(notePayload.id);
  if (pinnedNoteWindows.has(id) && !pinnedNoteWindows.get(id).isDestroyed()) {
    closePinnedNoteWindow(id);
    return { isOpen: false, noteId: id };
  }
  openOrFocusPinnedNoteWindow(notePayload);
  return { isOpen: true, noteId: id };
});

ipcMain.handle('note-window:sync-data', (_event, notePayload) => {
  if (!notePayload || !notePayload.id) return false;
  const id = String(notePayload.id);
  const win = pinnedNoteWindows.get(id);
  if (win && !win.isDestroyed()) {
    win.webContents.send('note-pad:data', notePayload);
    return true;
  }
  return false;
});

ipcMain.handle('note-window:broadcast-theme', (_event, theme) => {
  for (const [, win] of pinnedNoteWindows) {
    if (!win.isDestroyed()) {
      win.webContents.send('note-pad:theme', theme);
    }
  }
  return true;
});

ipcMain.handle('note-pad:edit', (_event, editPayload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('note-pad-edited-from-float', editPayload);
  }
  return true;
});

ipcMain.handle('note-pad:set-opacity', (event, value) => {
  const senderWin = BrowserWindow.fromWebContents(event.sender);
  if (senderWin && !senderWin.isDestroyed()) {
    const clamped = Math.max(0.45, Math.min(1, Number(value) || 1));
    senderWin.setOpacity(clamped);
    return clamped;
  }
  return 1;
});

ipcMain.handle('note-pad:toggle-pin-top', (event, forceState) => {
  const senderWin = BrowserWindow.fromWebContents(event.sender);
  if (senderWin && !senderWin.isDestroyed()) {
    const next = typeof forceState === 'boolean' ? forceState : !senderWin.isAlwaysOnTop();
    senderWin.setAlwaysOnTop(next, next ? 'screen-saver' : 'normal');
    senderWin.setVisibleOnAllWorkspaces(next, { visibleOnFullScreen: true });
    return next;
  }
  return true;
});

ipcMain.handle('note-pad:focus-main', (_event, noteId) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    if (noteId) {
      mainWindow.webContents.send('focus-note-in-main', noteId);
    }
  }
  return true;
});

ipcMain.handle('window:minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) win.minimize();
});

ipcMain.handle('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (!win || win.isDestroyed()) return false;
  if (win.isMaximized()) {
    win.unmaximize();
    return false;
  } else {
    win.maximize();
    return true;
  }
});

ipcMain.handle('window:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (win && !win.isDestroyed()) win.close();
});

ipcMain.handle('window:quit-app', () => {
  isQuitting = true;
  app.quit();
});

ipcMain.handle('clipboard:write', (_event, text) => {
  clipboard.writeText(String(text ?? ''));
  return true;
});

ipcMain.handle('clipboard:read', () => {
  return clipboard.readText();
});

ipcMain.handle('shell:open-external', (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
});
