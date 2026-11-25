const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hoverpadDesktop', {
  getDesktopState: () => ipcRenderer.invoke('window:get-desktop-state'),
  toggleCloseToTray: (forceState) => ipcRenderer.invoke('window:toggle-close-to-tray', forceState),
  toggleStartup: (forceState) => ipcRenderer.invoke('window:toggle-startup', forceState),

  // Floating Pinned Note Windows (Only individual notes can be pinned on screen)
  openNoteWindow: (notePayload) => ipcRenderer.invoke('note-window:open', notePayload),
  closeNoteWindow: (noteId) => ipcRenderer.invoke('note-window:close', noteId),
  toggleNoteWindow: (notePayload) => ipcRenderer.invoke('note-window:toggle', notePayload),
  syncNoteWindowData: (notePayload) => ipcRenderer.invoke('note-window:sync-data', notePayload),
  broadcastThemeToNotes: (theme) => ipcRenderer.invoke('note-window:broadcast-theme', theme),
  onNoteWindowClosed: (callback) => {
    ipcRenderer.on('note-window-closed', (_event, noteId) => callback(noteId));
  },
  onNoteEditedFromFloat: (callback) => {
    ipcRenderer.on('note-pad-edited-from-float', (_event, payload) => callback(payload));
  },
  onFocusNoteInMain: (callback) => {
    ipcRenderer.on('focus-note-in-main', (_event, noteId) => callback(noteId));
  },
  onGlobalToggleActiveNotePin: (callback) => {
    ipcRenderer.on('global-toggle-active-note-pin', () => callback());
  },

  // Inside Floating Note Window APIs
  onFloatingNoteData: (callback) => {
    ipcRenderer.on('note-pad:data', (_event, payload) => callback(payload));
  },
  onFloatingNoteTheme: (callback) => {
    ipcRenderer.on('note-pad:theme', (_event, theme) => callback(theme));
  },
  sendFloatingNoteEdit: (editPayload) => ipcRenderer.invoke('note-pad:edit', editPayload),
  setFloatingNoteOpacity: (opacity) => ipcRenderer.invoke('note-pad:set-opacity', opacity),
  toggleFloatingNoteAlwaysOnTop: (forceState) => ipcRenderer.invoke('note-pad:toggle-pin-top', forceState),
  focusMainWorkspace: (noteId) => ipcRenderer.invoke('note-pad:focus-main', noteId),

  // Global Shortcuts & Window Controls
  onGlobalQuickPaste: (callback) => {
    ipcRenderer.on('global-quick-paste', () => callback());
  },
  onOAuthDeepLink: (callback) => {
    ipcRenderer.on('oauth-deep-link', (_event, url) => callback(url));
  },
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  quitApp: () => ipcRenderer.invoke('window:quit-app'),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url)
});
