/**
 * HoverPad — Collaborative Floating Notes & Multi-Device Clipboard App
 * Google Stitch Apple macOS Daylight & Dark Edition
 * Only individual notes can be pinned as floating Always-On-Top windows
 */

const SUPABASE_URL = 'https://sdijafgznorbgusivxbj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_mSFUO2LABk8Rgp-mz9h2qg_6_QENmpQ';
const E2EE_PREFIX = 'E2EE_V1:';
const OFFLINE_CACHE_KEY = 'hoverpad_offline_cache_v1';
const OFFLINE_QUEUE_KEY = 'hoverpad_offline_queue_v1';
const NOTIF_STORAGE_KEY = 'hoverpad_notifications_v1';
const APP_CURRENT_VERSION = '2.8.1';
const GITHUB_VERSION_MANIFEST_URL = 'https://raw.githubusercontent.com/JustNathan25/HoverPad/main/version.json';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// Application State
const state = {
  user: null,
  isGuestMode: false,
  profile: null,
  authMode: 'signin', // 'signin' | 'signup'
  theme: localStorage.getItem('hoverpad_theme') || 'light', // 'light' | 'dark'
  projects: [],
  activeProjectId: null,
  members: [],
  notes: [],
  activeNoteId: null,
  searchQuery: '',
  noteFilter: 'all', // 'all' | 'starred' | 'encrypted' | 'trash'
  editorSubtab: 'edit', // 'edit' | 'snippets'
  lastRevisionAtByNote: new Map(), // noteId -> timestamp ms
  pendingVarSnippet: null, // { lineText, label, isSecret, vars }
  pinnedFloatingNoteIds: new Set(), // Track which individual notes are currently pinned as floating windows on screen
  maskSecrets: localStorage.getItem('hoverpad_mask_secrets') !== 'false',
  autoClearClipboard: localStorage.getItem('hoverpad_autoclear_clip') !== 'false',
  autoUpdate: localStorage.getItem('hoverpad_auto_update') !== 'false',
  appVersion: APP_CURRENT_VERSION,
  pendingUpdateManifest: null,
  updateReadyToReload: false,
  notifications: [],
  closeToTray: true,
  launchAtStartup: false,
  revealedSecretLines: new Set(),
  unlockedNotesPlaintext: new Map(), // noteId -> decrypted plaintext in memory
  unlockedNotesPassphrases: new Map(), // noteId -> passphrase in memory for live re-encryption
  currentVisibleSnippets: [],
  clipboardClearTimeout: null,
  realtimeChannel: null,
  saveTimeout: null,
  typingClearTimeout: null,
  lastTypingBroadcast: 0
};

// Color Accent Map for Stitch Note Cards
const COLOR_ACCENT_MAP = {
  '#1e293b': '#64748b',
  '#1e3a5f': '#0071e3',
  '#144336': '#10b981',
  '#4d2c19': '#f59e0b',
  '#4c1d4b': '#ec4899'
};

// DOM Elements
const el = {
  authView: document.getElementById('auth-view'),
  workspaceView: document.getElementById('workspace-view'),
  tabSignin: document.getElementById('tab-signin'),
  tabSignup: document.getElementById('tab-signup'),
  groupDisplayName: document.getElementById('group-display-name'),
  authForm: document.getElementById('auth-form'),
  authName: document.getElementById('auth-name'),
  authEmail: document.getElementById('auth-email'),
  authPassword: document.getElementById('auth-password'),
  authError: document.getElementById('auth-error'),
  btnAuthSubmit: document.getElementById('btn-auth-submit'),
  btnGuestSignin: document.getElementById('btn-guest-signin'),

  // Window & Theme Controls
  floatingNotesCountBadge: document.getElementById('floating-notes-count-badge'),
  floatingNotesCountLabel: document.getElementById('floating-notes-count-label'),
  btnThemeToggle: document.getElementById('btn-theme-toggle'),
  themeToggleIcon: document.getElementById('theme-toggle-icon'),
  themeToggleLabel: document.getElementById('theme-toggle-label'),
  btnMinimize: document.getElementById('btn-minimize'),
  btnMaximize: document.getElementById('btn-maximize'),
  btnClose: document.getElementById('btn-close'),
  topbarUserAvatar: document.getElementById('topbar-user-avatar'),
  syncDot: document.getElementById('sync-dot'),
  syncLabel: document.getElementById('sync-label'),

  // Sidebar & Projects
  workspaceLayout: document.getElementById('workspace-layout'),
  sidebarDrawerBackdrop: document.getElementById('sidebar-drawer-backdrop'),
  btnCloseSidebarDrawer: document.getElementById('btn-close-sidebar-drawer'),
  btnMobileBackNotes: document.getElementById('btn-mobile-back-notes'),
  navRail: document.getElementById('nav-rail'),
  sidebar: document.getElementById('sidebar'),
  btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
  projectsList: document.getElementById('projects-list'),
  currentProjectCode: document.getElementById('current-project-code'),
  inviteCodeStrip: document.getElementById('invite-code-strip'),
  btnRotateInviteCode: document.getElementById('btn-rotate-invite-code'),
  membersList: document.getElementById('members-list'),
  currentUserAvatar: document.getElementById('current-user-avatar'),
  currentUserName: document.getElementById('current-user-name'),
  currentUserEmail: document.getElementById('current-user-email'),
  btnOpenSettings: document.getElementById('btn-open-settings'),
  btnSignout: document.getElementById('btn-signout'),

  // Middle Pane: Notes List
  activeProjectName: document.getElementById('active-project-name'),
  activeProjectSubtitle: document.getElementById('active-project-subtitle'),
  btnCreateNote: document.getElementById('btn-create-note'),
  btnPasteNewNote: document.getElementById('btn-paste-new-note'),
  btnEmptyCreateNote: document.getElementById('btn-empty-create-note'),
  notesSearchInput: document.getElementById('notes-search-input'),
  notesCardsContainer: document.getElementById('notes-cards-container'),

  // Editor Pane
  editorEmptyState: document.getElementById('editor-empty-state'),
  editorActiveContainer: document.getElementById('editor-active-container'),
  editorSyncDot: document.getElementById('editor-sync-dot'),
  noteSaveStatus: document.getElementById('note-save-status'),
  noteUpdatedBy: document.getElementById('note-updated-by'),
  typingPresencePill: document.getElementById('typing-presence-pill'),
  noteLinesCount: document.getElementById('note-lines-count'),
  btnNoteMoreMenu: document.getElementById('btn-note-more-menu'),
  noteMoreDropdown: document.getElementById('note-more-dropdown'),
  btnE2eeNote: document.getElementById('btn-e2ee-note'),
  e2eeNoteIcon: document.getElementById('e2ee-note-icon'),
  e2eeNoteText: document.getElementById('e2ee-note-text'),
  e2eeLockedOverlay: document.getElementById('e2ee-locked-overlay'),
  e2eeUnlockPassphrase: document.getElementById('e2ee-unlock-passphrase'),
  btnE2eeUnlockSubmit: document.getElementById('btn-e2ee-unlock-submit'),
  btnPinNoteItem: document.getElementById('btn-pin-note-item'),
  pinNoteIcon: document.getElementById('pin-note-icon'),
  pinNoteText: document.getElementById('pin-note-text'),
  btnFloatNoteWindow: document.getElementById('btn-float-note-window'),
  floatNoteIcon: document.getElementById('float-note-icon'),
  floatNoteLabel: document.getElementById('float-note-label'),
  btnCopyEntireNote: document.getElementById('btn-copy-entire-note'),
  btnNoteHistory: document.getElementById('btn-note-history'),
  btnExportNoteMd: document.getElementById('btn-export-note-md'),
  btnExportWorkspaceJson: document.getElementById('btn-export-workspace-json'),
  btnRestoreNote: document.getElementById('btn-restore-note'),
  btnDeleteNote: document.getElementById('btn-delete-note'),
  deleteNoteText: document.getElementById('delete-note-text'),
  notesFilterPills: document.getElementById('notes-filter-pills'),
  noteTitleInput: document.getElementById('note-title-input'),
  noteContentInput: document.getElementById('note-content-input'),
  noteSnippetsView: document.getElementById('note-snippets-view'),
  subtabEdit: document.getElementById('subtab-edit'),
  subtabSnippets: document.getElementById('subtab-snippets'),
  btnAppendClipboard: document.getElementById('btn-append-clipboard'),

  // Modals
  modalOverlay: document.getElementById('modal-overlay'),
  modalNewProject: document.getElementById('modal-new-project'),
  modalInviteUser: document.getElementById('modal-invite-user'),
  modalJoinProject: document.getElementById('modal-join-project'),
  modalE2eeLock: document.getElementById('modal-e2ee-lock'),
  modalSettings: document.getElementById('modal-settings'),
  modalNoteHistory: document.getElementById('modal-note-history'),
  noteHistoryList: document.getElementById('note-history-list'),
  modalSnippetVars: document.getElementById('modal-snippet-vars'),
  formSnippetVars: document.getElementById('form-snippet-vars'),
  snippetVarsInputs: document.getElementById('snippet-vars-inputs'),
  snippetVarsPreviewCode: document.getElementById('snippet-vars-preview-code'),
  btnNewProjectModal: document.getElementById('btn-new-project-modal'),
  btnOpenInviteModal: document.getElementById('btn-open-invite-modal'),
  btnJoinProjectModal: document.getElementById('btn-join-project-modal'),
  formNewProject: document.getElementById('form-new-project'),
  newProjectName: document.getElementById('new-project-name'),
  newProjectDesc: document.getElementById('new-project-desc'),
  formInviteEmail: document.getElementById('form-invite-email'),
  inviteEmailInput: document.getElementById('invite-email-input'),
  inviteModalProjectName: document.getElementById('invite-modal-project-name'),
  modalInviteCodeDisplay: document.getElementById('modal-invite-code-display'),
  btnModalRotateCode: document.getElementById('btn-modal-rotate-code'),
  btnModalCopyCode: document.getElementById('btn-modal-copy-code'),
  btnModalCopyInviteLink: document.getElementById('btn-modal-copy-invite-link'),
  formJoinProject: document.getElementById('form-join-project'),
  joinCodeInput: document.getElementById('join-code-input'),
  formE2eeLock: document.getElementById('form-e2ee-lock'),
  e2eeSetPassphrase: document.getElementById('e2ee-set-passphrase'),

  // Settings Toggles & Notification Center Elements
  toggleSettingAutoupdate: document.getElementById('toggle-setting-autoupdate'),
  toggleSettingMaskSecrets: document.getElementById('toggle-setting-mask-secrets'),
  toggleSettingAutoclearClip: document.getElementById('toggle-setting-autoclear-clip'),
  toggleSettingCloseTray: document.getElementById('toggle-setting-close-tray'),
  toggleSettingStartup: document.getElementById('toggle-setting-startup'),
  btnQuitHoverpadCompletely: document.getElementById('btn-quit-hoverpad-completely'),

  notifCenterWrap: document.getElementById('notif-center-wrap'),
  btnNotifBell: document.getElementById('btn-notif-bell'),
  notifBellIcon: document.getElementById('notif-bell-icon'),
  notifUnreadBadge: document.getElementById('notif-unread-badge'),
  notifCenterDropdown: document.getElementById('notif-center-dropdown'),
  notifCurrentVersion: document.getElementById('notif-current-version'),
  btnNotifCheckUpdates: document.getElementById('btn-notif-check-updates'),
  btnNotifClearAll: document.getElementById('btn-notif-clear-all'),
  toggleNotifAutoupdate: document.getElementById('toggle-notif-autoupdate'),
  notifAutoupdateStatus: document.getElementById('notif-autoupdate-status'),
  notifUpdateBanner: document.getElementById('notif-update-banner'),
  notifUpdateTitle: document.getElementById('notif-update-title'),
  notifUpdateNotes: document.getElementById('notif-update-notes'),
  btnNotifApplyUpdate: document.getElementById('btn-notif-apply-update'),
  btnNotifApplyLabel: document.getElementById('btn-notif-apply-label'),
  notifFeedList: document.getElementById('notif-feed-list'),
  navVersionLabel: document.getElementById('nav-version-label'),

  // Update Pop-Up Card Elements
  updatePopupCard: document.getElementById('update-popup-card'),
  updatePopupIcon: document.getElementById('update-popup-icon'),
  updatePopupEyebrow: document.getElementById('update-popup-eyebrow'),
  updatePopupTitle: document.getElementById('update-popup-title'),
  updatePopupSubtitle: document.getElementById('update-popup-subtitle'),
  updatePopupNotes: document.getElementById('update-popup-notes'),
  btnUpdatePopupDismiss: document.getElementById('btn-update-popup-dismiss'),
  btnUpdatePopupLater: document.getElementById('btn-update-popup-later'),
  btnUpdatePopupApply: document.getElementById('btn-update-popup-apply'),
  btnUpdatePopupApplyLabel: document.getElementById('btn-update-popup-apply-label'),

  toastContainer: document.getElementById('toast-container')
};

// =====================================================================
// UTILITIES, CLIPBOARD AUTO-WIPE & TOASTS
// =====================================================================
function showToast(message, isSuccess = true) {
  const toast = document.createElement('div');
  toast.className = `toast ${isSuccess ? 'success' : ''}`;
  toast.innerHTML = `
    <span class="material-symbols-outlined" style="font-size:15px;color:${isSuccess ? 'var(--emerald-dot)' : 'var(--danger)'}">
      ${isSuccess ? 'check_circle' : 'error'}
    </span>
    <span>${escapeHtml(message)}</span>
  `;
  el.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 2600);
}

async function writeRawClipboard(text) {
  if (window.hoverpadDesktop) {
    await window.hoverpadDesktop.copyText(text);
  } else {
    await navigator.clipboard.writeText(text);
  }
}

async function readRawClipboard() {
  if (window.hoverpadDesktop) {
    return await window.hoverpadDesktop.readClipboard();
  }
  return await navigator.clipboard.readText();
}

async function copyToClipboard(text, label = 'Text', isSensitiveSecret = false) {
  await writeRawClipboard(text);
  if (state.clipboardClearTimeout) {
    clearTimeout(state.clipboardClearTimeout);
    state.clipboardClearTimeout = null;
  }

  if (isSensitiveSecret && state.autoClearClipboard) {
    showToast(`Copied ${label} (Auto-clears in 30s)`);
    const copiedSnapshot = text;
    state.clipboardClearTimeout = setTimeout(async () => {
      try {
        const currentClip = await readRawClipboard();
        if (currentClip === copiedSnapshot) {
          await writeRawClipboard('');
          showToast('Cleared sensitive secret from clipboard');
        }
      } catch (_e) {
        // Ignore
      }
    }, 30000);
  } else {
    showToast(`Copied ${label} to clipboard`);
  }
}

function formatTimeAgo(isoString) {
  if (!isoString) return 'just now';
  const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(isoString).toLocaleDateString();
}

function getDisplayName() {
  if (state.profile && state.profile.display_name) return state.profile.display_name;
  if (state.user && state.user.user_metadata && state.user.user_metadata.display_name) {
    return state.user.user_metadata.display_name;
  }
  if (state.user && state.user.email) return state.user.email.split('@')[0];
  return 'User';
}

function getInitials(nameStr) {
  const parts = String(nameStr || 'U').trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return String(nameStr || 'U').slice(0, 2).toUpperCase();
}

// =====================================================================
// CLIENT-SIDE AES-GCM 256-BIT END-TO-END ENCRYPTION (WEB CRYPTO API)
// =====================================================================
function isEncryptedPayload(contentStr) {
  return typeof contentStr === 'string' && contentStr.startsWith(E2EE_PREFIX);
}

function bufToBase64(bytes) {
  let binary = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.byteLength; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

function base64ToBuf(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesGcmKey(passphrase, saltBytes) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptNoteContent(plaintext, passphrase) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesGcmKey(passphrase, salt);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  return `${E2EE_PREFIX}${bufToBase64(salt)}:${bufToBase64(iv)}:${bufToBase64(cipherBuf)}`;
}

async function decryptNoteContent(payload, passphrase) {
  if (!isEncryptedPayload(payload)) return payload;
  const raw = payload.slice(E2EE_PREFIX.length);
  const parts = raw.split(':');
  if (parts.length !== 3) throw new Error('Invalid E2EE payload format');
  const salt = base64ToBuf(parts[0]);
  const iv = base64ToBuf(parts[1]);
  const cipherBytes = base64ToBuf(parts[2]);
  const key = await deriveAesGcmKey(passphrase, salt);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipherBytes
  );
  return new TextDecoder().decode(plainBuf);
}

function getEffectiveNotePlaintext(note) {
  if (!note) return '';
  if (!isEncryptedPayload(note.content)) return note.content || '';
  if (state.unlockedNotesPlaintext.has(note.id)) {
    return state.unlockedNotesPlaintext.get(note.id);
  }
  return null; // Locked
}

// =====================================================================
// FLOATING PINNED NOTE WINDOW HELPERS (Electron + Browser Document PiP)
// =====================================================================
const webFloatingNoteWindows = new Map(); // noteId -> Window (Document Picture-in-Picture or Popup)

function buildFloatingNotePayload(note) {
  if (!note) return null;
  const proj = state.projects.find((p) => p.id === note.project_id);
  const plain = getEffectiveNotePlaintext(note);
  return {
    id: note.id,
    title: note.title || 'Untitled Note',
    content: plain !== null ? plain : '🔒 Unlock this encrypted note in HoverPad workspace first.',
    projectName: proj ? proj.name : 'Workspace',
    theme: state.theme,
    maskSecrets: state.maskSecrets
  };
}

function updateFloatingNoteUIIndicators() {
  const count = state.pinnedFloatingNoteIds.size;
  if (el.floatingNotesCountBadge && el.floatingNotesCountLabel) {
    el.floatingNotesCountBadge.classList.toggle('hidden', count === 0);
    el.floatingNotesCountLabel.textContent = `${count} Note${count === 1 ? '' : 's'} Pinned`;
  }

  const activeIsFloating = state.activeNoteId && state.pinnedFloatingNoteIds.has(state.activeNoteId);
  if (el.btnFloatNoteWindow && el.floatNoteLabel) {
    el.btnFloatNoteWindow.classList.toggle('active', Boolean(activeIsFloating));
    el.floatNoteLabel.textContent = activeIsFloating ? 'Pinned' : 'Pin';
  }
}

async function openWebFloatingNoteWindow(payload) {
  const noteId = String(payload.id);

  // Close if already open
  if (webFloatingNoteWindows.has(noteId)) {
    const existing = webFloatingNoteWindows.get(noteId);
    webFloatingNoteWindows.delete(noteId);
    if (existing && !existing.closed) existing.close();
    return { isOpen: false, noteId };
  }

  let pipWin = null;
  // Use Chrome/Edge Document Picture-in-Picture API for true Always-on-Top OS floating window in browser!
  if ('documentPictureInPicture' in window) {
    try {
      pipWin = await window.documentPictureInPicture.requestWindow({
        width: 390,
        height: 460
      });
    } catch (_e) {
      pipWin = null;
    }
  }

  if (!pipWin) {
    pipWin = window.open(
      `note-pad.html?noteId=${encodeURIComponent(noteId)}`,
      `hoverpad_note_${noteId}`,
      'width=390,height=460,menubar=no,toolbar=no,location=no,status=no'
    );
    if (!pipWin) {
      showToast('Please allow popups to pin floating notes in the browser', false);
      return { isOpen: false, noteId };
    }
    webFloatingNoteWindows.set(noteId, pipWin);
    pipWin.addEventListener('load', () => {
      pipWin.postMessage({ type: 'note-pad:data', payload }, '*');
    });
    const timer = setInterval(() => {
      if (pipWin.closed) {
        clearInterval(timer);
        webFloatingNoteWindows.delete(noteId);
        state.pinnedFloatingNoteIds.delete(noteId);
        updateFloatingNoteUIIndicators();
        renderNotesList();
      }
    }, 500);
    return { isOpen: true, noteId };
  }

  // Populate Document Picture-in-Picture Always-on-Top Window with iframe to note-pad.html
  pipWin.document.head.innerHTML = `
    <title>${escapeHtml(payload.title)} — Pinned Note</title>
    <style>html,body,iframe{margin:0;padding:0;width:100%;height:100%;border:none;overflow:hidden;}</style>
  `;
  const iframe = pipWin.document.createElement('iframe');
  iframe.src = `note-pad.html?noteId=${encodeURIComponent(noteId)}`;
  pipWin.document.body.appendChild(iframe);

  iframe.addEventListener('load', () => {
    iframe.contentWindow?.postMessage({ type: 'note-pad:data', payload }, '*');
  });

  webFloatingNoteWindows.set(noteId, pipWin);
  pipWin.addEventListener('pagehide', () => {
    webFloatingNoteWindows.delete(noteId);
    state.pinnedFloatingNoteIds.delete(noteId);
    updateFloatingNoteUIIndicators();
    renderNotesList();
  });

  return { isOpen: true, noteId };
}

async function togglePinIndividualNoteToScreen(noteId) {
  const note = state.notes.find((n) => n.id === noteId);
  if (!note) return;

  const plain = getEffectiveNotePlaintext(note);
  if (isEncryptedPayload(note.content) && plain === null) {
    selectNote(note.id);
    showToast('Unlock this encrypted note before pinning it to your screen', false);
    return;
  }

  const payload = buildFloatingNotePayload(note);
  const res = window.hoverpadDesktop
    ? await window.hoverpadDesktop.toggleNoteWindow(payload)
    : await openWebFloatingNoteWindow(payload);

  if (res?.isOpen) {
    state.pinnedFloatingNoteIds.add(note.id);
    showToast(`Pinned "${note.title}" as a floating note on screen`);
  } else {
    state.pinnedFloatingNoteIds.delete(note.id);
    showToast(`Unpinned "${note.title}" from screen`);
  }
  updateFloatingNoteUIIndicators();
  renderNotesList();
}

function syncFloatingNoteWindowIfOpen(note) {
  if (!note || !state.pinnedFloatingNoteIds.has(note.id)) return;
  const payload = buildFloatingNotePayload(note);
  if (window.hoverpadDesktop) {
    window.hoverpadDesktop.syncNoteWindowData(payload);
  } else if (webFloatingNoteWindows.has(note.id)) {
    const win = webFloatingNoteWindows.get(note.id);
    if (win && !win.closed) {
      const iframe = win.document?.querySelector?.('iframe');
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'note-pad:data', payload }, '*');
      } else {
        win.postMessage({ type: 'note-pad:data', payload }, '*');
      }
    }
  }
}

// =====================================================================
// OFFLINE CACHE & OPTIMISTIC SYNC QUEUE
// =====================================================================
function saveOfflineSnapshot() {
  try {
    const payload = {
      projects: state.projects,
      activeProjectId: state.activeProjectId,
      notesByProject: {
        ...(JSON.parse(localStorage.getItem(OFFLINE_CACHE_KEY) || '{}').notesByProject || {}),
        ...(state.activeProjectId ? { [state.activeProjectId]: state.notes } : {})
      }
    };
    localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(payload));
  } catch (_e) {
    // Ignore
  }
}

function getOfflineSnapshot() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_CACHE_KEY) || '{}');
  } catch (_e) {
    return {};
  }
}

function enqueueOfflineNoteUpdate(noteId, patch) {
  try {
    const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '{}');
    queue[noteId] = { ...(queue[noteId] || {}), ...patch };
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (_e) {
    // Ignore
  }
}

async function flushOfflineSyncQueue() {
  if (!navigator.onLine || !state.user) return;
  try {
    const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '{}');
    const noteIds = Object.keys(queue);
    if (noteIds.length === 0) return;

    for (const noteId of noteIds) {
      const patch = queue[noteId];
      const { error } = await supabaseClient.from('notes').update(patch).eq('id', noteId);
      if (!error) {
        delete queue[noteId];
      }
    }
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    if (Object.keys(queue).length === 0) {
      el.noteSaveStatus.textContent = 'Synced to Cloud';
      setOnlineStatusIndicator(true);
    }
  } catch (_e) {
    // Retry on next online event
  }
}

function setOnlineStatusIndicator(isOnline) {
  if (el.syncDot && el.syncLabel) {
    el.syncDot.style.background = isOnline ? 'var(--emerald-dot)' : 'var(--amber)';
    el.syncDot.style.boxShadow = isOnline ? '0 0 6px var(--emerald-dot)' : 'none';
    el.syncLabel.textContent = isOnline ? 'Live' : 'Offline Cache';
  }
  if (el.editorSyncDot) {
    el.editorSyncDot.style.background = isOnline ? 'var(--emerald-dot)' : 'var(--amber)';
  }
}

// =====================================================================
// THEME ENGINE (DAYLIGHT LIGHT MODE <-> APPLE MACOS DARK EDITION)
// =====================================================================
function applyTheme(theme) {
  state.theme = theme === 'dark' ? 'dark' : 'light';
  localStorage.setItem('hoverpad_theme', state.theme);
  const root = document.documentElement;
  root.classList.toggle('theme-dark', state.theme === 'dark');
  root.classList.toggle('theme-light', state.theme === 'light');

  if (el.themeToggleIcon && el.themeToggleLabel) {
    if (state.theme === 'light') {
      el.themeToggleIcon.textContent = 'light_mode';
      el.themeToggleLabel.textContent = 'Daylight';
    } else {
      el.themeToggleIcon.textContent = 'dark_mode';
      el.themeToggleLabel.textContent = 'Dark';
    }
  }

  window.hoverpadDesktop?.broadcastThemeToNotes(state.theme);
}

// =====================================================================
// DESKTOP WINDOW CONTROLS & FLOATING NOTE BRIDGE
// =====================================================================
function setEditorMode(mode) {
  state.editorSubtab = mode;
  const isSnippets = mode === 'snippets';
  el.subtabEdit.classList.toggle('active', !isSnippets);
  el.subtabSnippets.classList.toggle('active', isSnippets);

  const note = state.notes.find((n) => n.id === state.activeNoteId);
  const plaintext = getEffectiveNotePlaintext(note);
  const isLocked = note && plaintext === null;

  if (isLocked) {
    el.e2eeLockedOverlay.classList.remove('hidden');
    el.noteContentInput.classList.add('hidden');
    el.noteSnippetsView.classList.add('hidden');
  } else {
    el.e2eeLockedOverlay.classList.add('hidden');
    el.noteContentInput.classList.toggle('hidden', isSnippets);
    el.noteSnippetsView.classList.toggle('hidden', !isSnippets);
    if (isSnippets) {
      renderSnippetsQuickCopy(plaintext ?? el.noteContentInput.value);
    }
  }
}

function initWindowControls() {
  applyTheme(state.theme);
  setOnlineStatusIndicator(navigator.onLine);
  initNotificationCenterAndUpdater();

  // Listen for live edits from Web Document Picture-in-Picture floating note windows
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'note-pad:edit' && e.data.payload) {
      const editPayload = e.data.payload;
      const note = state.notes.find((n) => n.id === editPayload.id);
      if (!note) return;
      if (state.activeNoteId === note.id) {
        el.noteTitleInput.value = editPayload.title ?? note.title;
        el.noteContentInput.value = editPayload.content ?? '';
        scheduleNoteSave({
          title: editPayload.title ?? note.title,
          content: editPayload.content ?? ''
        });
      }
    }
  });

  window.addEventListener('online', () => {
    setOnlineStatusIndicator(true);
    showToast('Back online — syncing workspace changes');
    flushOfflineSyncQueue();
  });

  window.addEventListener('offline', () => {
    setOnlineStatusIndicator(false);
    showToast('Offline Mode — edits cached locally', false);
  });

  el.btnThemeToggle.addEventListener('click', () => {
    const nextTheme = state.theme === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme);
    showToast(`Switched to ${nextTheme === 'light' ? 'Daylight Light' : 'macOS Dark'} theme`);
  });

  if (window.hoverpadDesktop) {
    window.hoverpadDesktop.getDesktopState().then((dState) => {
      if (!dState) return;
      state.closeToTray = Boolean(dState.closeToTray);
      state.launchAtStartup = Boolean(dState.launchAtStartup);
      if (dState.autoUpdate !== undefined) {
        applyAutoUpdateUI(Boolean(dState.autoUpdate));
      }
      if (dState.localVersionManifest?.version) {
        state.appVersion = dState.localVersionManifest.version;
        updateVersionLabels();
      }
      if (el.toggleSettingCloseTray) el.toggleSettingCloseTray.checked = state.closeToTray;
      if (el.toggleSettingStartup) el.toggleSettingStartup.checked = state.launchAtStartup;
      if (Array.isArray(dState.pinnedNoteIds)) {
        dState.pinnedNoteIds.forEach((id) => state.pinnedFloatingNoteIds.add(id));
        updateFloatingNoteUIIndicators();
      }
    });

    window.hoverpadDesktop.onUpdaterStatus((payload) => {
      handleUpdaterStatusPayload(payload);
    });

    window.hoverpadDesktop.onAutoUpdatePrefChanged((enabled) => {
      applyAutoUpdateUI(Boolean(enabled));
      showToast(enabled ? 'Automatic app updates enabled' : 'Automatic app updates paused');
    });

    // When a floating pinned note window is closed by the user
    window.hoverpadDesktop.onNoteWindowClosed((noteId) => {
      state.pinnedFloatingNoteIds.delete(noteId);
      updateFloatingNoteUIIndicators();
      renderNotesList();
    });

    // When a user edits a note inside its floating pinned window, sync back to workspace & Supabase
    window.hoverpadDesktop.onNoteEditedFromFloat((editPayload) => {
      if (!editPayload || !editPayload.id) return;
      const note = state.notes.find((n) => n.id === editPayload.id);
      if (!note) return;

      if (state.activeNoteId === note.id) {
        el.noteTitleInput.value = editPayload.title ?? note.title;
        el.noteContentInput.value = editPayload.content ?? '';
        scheduleNoteSave({
          title: editPayload.title ?? note.title,
          content: editPayload.content ?? ''
        });
      } else {
        // Save background note edit directly
        note.title = editPayload.title ?? note.title;
        if (state.unlockedNotesPassphrases.has(note.id)) {
          state.unlockedNotesPlaintext.set(note.id, editPayload.content ?? '');
        } else {
          note.content = editPayload.content ?? '';
        }
        renderNotesList();
        buildNoteUpdatePatch(note, {
          title: note.title,
          content: editPayload.content ?? ''
        }).then(({ patch }) => {
          supabaseClient.from('notes').update(patch).eq('id', note.id);
        });
      }
    });

    // Focus a specific note in main workspace when clicking "Open in Main" from a floating note
    window.hoverpadDesktop.onFocusNoteInMain((noteId) => {
      if (noteId && state.notes.some((n) => n.id === noteId)) {
        selectNote(noteId);
      }
    });

    // Global Hotkey Ctrl+Shift+P: Float / Pin the active note onto screen
    window.hoverpadDesktop.onGlobalToggleActiveNotePin(() => {
      if (state.activeNoteId) {
        togglePinIndividualNoteToScreen(state.activeNoteId);
      }
    });

    // Global Hotkey Ctrl+Shift+V: Quick-paste current clipboard into active note
    window.hoverpadDesktop.onGlobalQuickPaste(async () => {
      await appendClipboardToActiveNote(true);
    });

    // Custom Deep-Link OAuth Callback handler (hoverpad://auth/callback#access_token=...)
    window.hoverpadDesktop.onOAuthDeepLink(async (urlStr) => {
      try {
        const hashIdx = urlStr.indexOf('#');
        const queryIdx = urlStr.indexOf('?');
        if (hashIdx !== -1) {
          const params = new URLSearchParams(urlStr.slice(hashIdx + 1));
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          if (accessToken && refreshToken) {
            const { error } = await supabaseClient.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
            });
            if (error) throw error;
            showToast('Signed in via Single Sign-On!');
          }
        } else if (queryIdx !== -1) {
          const params = new URLSearchParams(urlStr.slice(queryIdx + 1));
          const code = params.get('code');
          if (code) {
            const { error } = await supabaseClient.auth.exchangeCodeForSession(code);
            if (error) throw error;
            showToast('Signed in via Single Sign-On!');
          }
        }
      } catch (err) {
        showToast(`OAuth callback error: ${err.message}`, false);
      }
    });
  }

  el.btnMinimize.addEventListener('click', () => window.hoverpadDesktop?.minimize());
  el.btnMaximize.addEventListener('click', () => window.hoverpadDesktop?.maximize());
  el.btnClose.addEventListener('click', () => window.hoverpadDesktop?.close());

  function toggleResponsiveSidebar(forceOpen) {
    const isTabletOrSmaller = window.innerWidth <= 960;
    if (isTabletOrSmaller) {
      const nextOpen =
        typeof forceOpen === 'boolean'
          ? forceOpen
          : !el.sidebar.classList.contains('drawer-open');
      el.sidebar.classList.toggle('drawer-open', nextOpen);
      el.sidebarDrawerBackdrop?.classList.toggle('hidden', !nextOpen);
    } else {
      el.sidebar.classList.remove('drawer-open');
      el.sidebarDrawerBackdrop?.classList.add('hidden');
      const nextHidden =
        typeof forceOpen === 'boolean' ? !forceOpen : !el.sidebar.classList.contains('hidden');
      el.sidebar.classList.toggle('hidden', nextHidden);
    }
  }

  el.btnToggleSidebar.addEventListener('click', () => {
    toggleResponsiveSidebar();
  });

  el.btnCloseSidebarDrawer?.addEventListener('click', () => {
    toggleResponsiveSidebar(false);
  });

  el.sidebarDrawerBackdrop?.addEventListener('click', () => {
    toggleResponsiveSidebar(false);
  });

  el.btnMobileBackNotes?.addEventListener('click', () => {
    el.workspaceLayout?.classList.remove('mobile-editor-open');
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 960) {
      el.sidebar.classList.remove('drawer-open');
      el.sidebarDrawerBackdrop?.classList.add('hidden');
    }
  });

  // Left Library Nav Rail Quick Actions
  document.querySelectorAll('[data-nav-view]').forEach((navBtn) => {
    navBtn.addEventListener('click', () => {
      document.querySelectorAll('[data-nav-view]').forEach((b) => b.classList.remove('active'));
      navBtn.classList.add('active');
      const view = navBtn.dataset.navView;
      if (view === 'workspace') {
        if (window.innerWidth <= 960) {
          toggleResponsiveSidebar(true);
        } else {
          el.sidebar.classList.remove('hidden');
        }
        setEditorMode('edit');
      } else if (view === 'clipboard') {
        if (window.innerWidth <= 740 && state.activeNoteId) {
          el.workspaceLayout?.classList.add('mobile-editor-open');
        }
        setEditorMode('snippets');
        showToast('Line-by-Line Quick Snippets View');
      } else if (view === 'sessions') {
        el.btnOpenInviteModal.click();
      } else if (view === 'settings') {
        openSettingsModal();
      }
    });
  });
}

// =====================================================================
// PROTECTED ROUTES & SUPABASE AUTHENTICATION
// =====================================================================
function setAuthTab(mode) {
  state.authMode = mode;
  el.tabSignin.classList.toggle('active', mode === 'signin');
  el.tabSignup.classList.toggle('active', mode === 'signup');
  el.groupDisplayName.classList.toggle('hidden', mode === 'signin');
  el.btnAuthSubmit.textContent = mode === 'signin' ? 'Sign In to Workspace' : 'Create Account & Start';
  el.authError.classList.add('hidden');
}

function enforceProtectedRoute(session) {
  if (session && session.user) {
    state.user = session.user;
    el.authView.classList.add('hidden');
    el.workspaceView.classList.remove('hidden');
    bootstrapAuthenticatedWorkspace();
  } else {
    state.user = null;
    state.profile = null;
    state.projects = [];
    state.activeProjectId = null;
    state.notes = [];
    state.activeNoteId = null;
    state.unlockedNotesPlaintext.clear();
    state.unlockedNotesPassphrases.clear();
    if (state.realtimeChannel) {
      supabaseClient.removeChannel(state.realtimeChannel);
      state.realtimeChannel = null;
    }
    el.workspaceView.classList.add('hidden');
    el.authView.classList.remove('hidden');
  }
}

function generateClientUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isValidUuid(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(str || '').trim()
  );
}

function createLocalGuestSession() {
  let savedGuestId = localStorage.getItem('hoverpad_guest_uid');
  if (!isValidUuid(savedGuestId)) {
    savedGuestId = generateClientUuid();
    localStorage.setItem('hoverpad_guest_uid', savedGuestId);
  }
  const savedGuestName =
    localStorage.getItem('hoverpad_guest_name') ||
    `Guest ${savedGuestId.slice(0, 4).toUpperCase()}`;
  localStorage.setItem('hoverpad_guest_name', savedGuestName);
  localStorage.setItem('hoverpad_guest_active', 'true');
  state.isGuestMode = true;
  return {
    user: {
      id: savedGuestId,
      email: `guest-${savedGuestId.slice(0, 6)}@hoverpad.app`,
      user_metadata: { display_name: savedGuestName }
    }
  };
}

function initAuthHandlers() {
  el.tabSignin.addEventListener('click', () => setAuthTab('signin'));
  el.tabSignup.addEventListener('click', () => setAuthTab('signup'));

  // Continue as Guest Handler (Creates a cloud-enabled Guest collaborator profile)
  el.btnGuestSignin?.addEventListener('click', async () => {
    el.authError.classList.add('hidden');
    const guestSession = createLocalGuestSession();
    enforceProtectedRoute(guestSession);
    showToast('Entered Cloud Guest Workspace — ready to collaborate & join invite codes!');
  });

  el.authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    el.authError.classList.add('hidden');
    const email = el.authEmail.value.trim();
    const password = el.authPassword.value;
    const displayName = el.authName.value.trim() || email.split('@')[0];

    el.btnAuthSubmit.disabled = true;
    const originalLabel = el.btnAuthSubmit.textContent;
    el.btnAuthSubmit.textContent = 'Please wait...';

    try {
      if (state.authMode === 'signup') {
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName }
          }
        });
        if (error) throw error;
        if (data.session) {
          showToast('Welcome to HoverPad! Account ready.');
        } else {
          showToast('Account created! Please check your email inbox to confirm.');
          setAuthTab('signin');
        }
      } else {
        const { error } = await supabaseClient.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
        showToast('Signed in to HoverPad');
      }
    } catch (err) {
      el.authError.textContent = err.message || 'Authentication failed.';
      el.authError.classList.remove('hidden');
    } finally {
      el.btnAuthSubmit.disabled = false;
      el.btnAuthSubmit.textContent = originalLabel;
    }
  });

  el.btnSignout.addEventListener('click', async () => {
    await flushPendingNoteSaveImmediate();
    if (state.isGuestMode) {
      state.isGuestMode = false;
      localStorage.removeItem('hoverpad_guest_active');
      enforceProtectedRoute(null);
      showToast('Exited Guest Workspace');
      return;
    }
    await supabaseClient.auth.signOut();
    showToast('Signed out');
  });

  const OAUTH_LABELS = {
    google: 'Google',
    discord: 'Discord',
    github: 'GitHub',
    azure: 'Microsoft Outlook',
    facebook: 'Facebook'
  };

  document.querySelectorAll('[data-oauth-provider]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const provider = btn.dataset.oauthProvider;
      const label = OAUTH_LABELS[provider] || provider;
      el.authError.classList.add('hidden');
      try {
        // Verify provider is enabled in Supabase Auth settings before opening external browser
        const settingsRes = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
          headers: { apikey: SUPABASE_PUBLISHABLE_KEY }
        });
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          const isEnabled = settings?.external?.[provider];
          if (isEnabled === false) {
            el.authError.innerHTML = `<strong>${escapeHtml(label)} Sign-In is not enabled yet.</strong> Enable <em>${escapeHtml(label)}</em> in your Supabase Dashboard &rarr; Authentication &rarr; Providers, or sign in with Email &amp; Password above.`;
            el.authError.classList.remove('hidden');
            return;
          }
        }

        const { data, error } = await supabaseClient.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: window.hoverpadDesktop ? 'hoverpad://auth/callback' : window.location.href,
            skipBrowserRedirect: true,
            ...(provider === 'azure' ? { scopes: 'email profile openid' } : {})
          }
        });
        if (error) throw error;
        if (data?.url) {
          if (window.hoverpadDesktop) {
            await window.hoverpadDesktop.openExternal(data.url);
            showToast(`Opened ${label} login in your browser`);
          } else {
            window.location.href = data.url;
          }
        }
      } catch (err) {
        el.authError.textContent = err.message || `${label} sign-in failed.`;
        el.authError.classList.remove('hidden');
      }
    });
  });

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      state.isGuestMode = false;
      localStorage.removeItem('hoverpad_guest_active');
      enforceProtectedRoute(session);
    } else if (localStorage.getItem('hoverpad_guest_active') === 'true') {
      enforceProtectedRoute(createLocalGuestSession());
    } else {
      enforceProtectedRoute(null);
    }
  });
}

// =====================================================================
// WORKSPACE DATA: PROFILE, PROJECTS, MEMBERS, NOTES & REALTIME
// =====================================================================
async function bootstrapAuthenticatedWorkspace() {
  if (!state.user) return;

  const fallbackName = getDisplayName();
  const initials = getInitials(fallbackName);
  el.currentUserName.textContent = fallbackName;
  el.currentUserEmail.textContent = state.user.email || '';
  el.currentUserAvatar.textContent = initials;
  if (el.topbarUserAvatar) el.topbarUserAvatar.textContent = initials;

  try {
    let { data: profile } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', state.user.id)
      .maybeSingle();

    if (!profile && isValidUuid(state.user.id)) {
      const { data: createdProfile } = await supabaseClient
        .from('profiles')
        .upsert(
          {
            id: state.user.id,
            email: state.user.email || `guest-${state.user.id.slice(0, 6)}@hoverpad.app`,
            display_name: fallbackName
          },
          { onConflict: 'id' }
        )
        .select('*')
        .maybeSingle();
      profile = createdProfile;
    }

    if (profile) {
      state.profile = profile;
      const profName = profile.display_name || fallbackName;
      const profInitials = getInitials(profName);
      el.currentUserName.textContent = profName;
      el.currentUserAvatar.textContent = profInitials;
      if (el.topbarUserAvatar) el.topbarUserAvatar.textContent = profInitials;
    }
  } catch (_e) {
    // Ignore offline error
  }

  await loadProjects();
  await checkUrlForJoinInviteCode();
  flushOfflineSyncQueue();
}

async function checkUrlForJoinInviteCode() {
  try {
    const params = new URLSearchParams(window.location.search);
    const joinCode = (params.get('join') || params.get('invite') || '').trim().toUpperCase();
    if (!joinCode) return;

    // Clean the query param from address bar so refresh doesn't re-run
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, cleanUrl);

    const { data: joinedProjectId, error } = await supabaseClient.rpc('join_project_by_code', {
      p_invite_code: joinCode,
      p_guest_id: isValidUuid(state.user?.id) ? state.user.id : null,
      p_guest_name: getDisplayName()
    });

    if (error) {
      showToast(`Invite link error: ${error.message}`, false);
      return;
    }

    showToast(`Joined workspace via 1-Click Invite Link (${joinCode})!`);
    await loadProjects(joinedProjectId);
  } catch (_e) {
    // Ignore
  }
}

async function loadProjects(preferredProjectId = null) {
  let projects = null;
  let error = null;

  if (state.isGuestMode && isValidUuid(state.user?.id)) {
    // Load projects where this guest user is either the owner or a project_member
    const { data: memberRows } = await supabaseClient
      .from('project_members')
      .select('project_id')
      .eq('user_id', state.user.id);

    const memberProjectIds = (memberRows || []).map((r) => r.project_id);
    if (memberProjectIds.length > 0) {
      const res = await supabaseClient
        .from('projects')
        .select('*')
        .in('id', memberProjectIds)
        .order('created_at', { ascending: true });
      projects = res.data;
      error = res.error;
    } else {
      const res = await supabaseClient
        .from('projects')
        .select('*')
        .eq('owner_id', state.user.id)
        .order('created_at', { ascending: true });
      projects = res.data;
      error = res.error;
    }
  } else {
    const res = await supabaseClient
      .from('projects')
      .select('*')
      .order('created_at', { ascending: true });
    projects = res.data;
    error = res.error;
  }

  if (error) {
    const cached = getOfflineSnapshot();
    if (cached.projects && cached.projects.length > 0) {
      state.projects = cached.projects.filter((p) => isValidUuid(p.id));
      showToast('Loaded workspaces from offline cache', false);
    } else {
      showToast(`Failed to load workspaces: ${error.message}`, false);
      return;
    }
  } else {
    state.projects = projects || [];
  }

  if (state.projects.length === 0 && state.user && navigator.onLine) {
    const { data: created } = await supabaseClient
      .from('projects')
      .insert({
        name: 'Product Launch Q3',
        description: 'Collaborative notes & quick snippets',
        owner_id: state.user.id
      })
      .select()
      .single();

    if (created) {
      state.projects = [created];
      await supabaseClient
        .from('project_members')
        .upsert(
          {
            project_id: created.id,
            user_id: state.user.id,
            role: 'owner',
            invited_by: state.user.id
          },
          { onConflict: 'project_id,user_id' }
        );
      await supabaseClient.from('notes').insert({
        project_id: created.id,
        title: 'Staging Deploy & API Endpoints',
        content:
          'docker compose -f docker-compose.staging.yml up -d --build\nhttps://staging-api.hoverpad.io/v2/health\nwss://staging-sync.hoverpad.io/ws/rooms\nHP_STAGING_KEY=hp_live_98a7f2c4e1b04d3a99c1',
        color: '#1e3a5f',
        is_pinned: true,
        created_by: state.user.id,
        updated_by: state.user.id,
        updated_by_name: getDisplayName()
      });
    }
  }

  // If a preferredProjectId was just joined and isn't in state.projects yet, fetch it directly
  if (preferredProjectId && !state.projects.some((p) => p.id === preferredProjectId)) {
    const { data: joinedProj } = await supabaseClient
      .from('projects')
      .select('*')
      .eq('id', preferredProjectId)
      .maybeSingle();
    if (joinedProj) {
      state.projects.push(joinedProj);
    }
  }

  saveOfflineSnapshot();
  renderProjectsSidebar();

  const targetId =
    preferredProjectId ||
    state.projects.find((p) => p.id === state.activeProjectId)?.id ||
    state.projects[0]?.id ||
    null;

  if (targetId) {
    await selectProject(targetId);
  }
}

function renderProjectsSidebar() {
  el.projectsList.innerHTML = '';
  state.projects.forEach((proj) => {
    const isActive = proj.id === state.activeProjectId;
    const item = document.createElement('div');
    item.className = `project-item ${isActive ? 'active' : ''}`;
    item.innerHTML = `
      <div class="project-item-left">
        <span class="project-dot-indicator"></span>
        <span class="project-item-name">${escapeHtml(proj.name)}</span>
      </div>
    `;
    item.addEventListener('click', () => selectProject(proj.id));
    el.projectsList.appendChild(item);
  });
}

async function selectProject(projectId) {
  await flushPendingNoteSaveImmediate();
  state.activeProjectId = projectId;
  // Auto-close slide-over drawer on tablet/mobile after selecting a workspace
  el.sidebar?.classList.remove('drawer-open');
  el.sidebarDrawerBackdrop?.classList.add('hidden');
  renderProjectsSidebar();

  const currentProject = state.projects.find((p) => p.id === projectId);
  if (!currentProject) return;

  el.activeProjectName.textContent = currentProject.name;
  el.currentProjectCode.textContent = currentProject.invite_code || '--------';
  el.modalInviteCodeDisplay.textContent = currentProject.invite_code || '--------';
  el.inviteModalProjectName.textContent = currentProject.name;

  const isOwner = currentProject.owner_id === state.user?.id;
  el.btnRotateInviteCode?.classList.toggle('hidden', !isOwner);
  el.btnModalRotateCode?.classList.toggle('hidden', !isOwner);

  await Promise.all([loadProjectMembers(projectId), loadProjectNotes(projectId)]);
  subscribeToProjectRealtime(projectId);
}

async function rotateCurrentProjectInviteCode() {
  if (!state.activeProjectId) return;
  try {
    const { data: newCode, error } = await supabaseClient.rpc('regenerate_project_invite_code', {
      p_project_id: state.activeProjectId
    });
    if (error) throw error;
    const proj = state.projects.find((p) => p.id === state.activeProjectId);
    if (proj && newCode) {
      proj.invite_code = newCode;
      el.currentProjectCode.textContent = newCode;
      el.modalInviteCodeDisplay.textContent = newCode;
      saveOfflineSnapshot();
      showToast(`Rotated invite code to ${newCode}`);
    }
  } catch (err) {
    showToast(err.message || 'Could not rotate invite code', false);
  }
}

async function loadProjectMembers(projectId) {
  const { data, error } = await supabaseClient
    .from('project_members')
    .select('id, role, user_id, profiles:project_members_user_id_fkey(id, email, display_name, avatar_color)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (!error && data && data.length > 0) {
    state.members = data;
    renderMembersList();
    return;
  }

  state.members = [
    {
      id: 'fallback-member-1',
      role: 'owner',
      user_id: state.user?.id,
      profiles: {
        id: state.user?.id,
        email: state.user?.email || 'user@hoverpad.app',
        display_name: getDisplayName(),
        avatar_color: '#0071e3'
      }
    }
  ];
  renderMembersList();
}

function renderMembersList() {
  el.membersList.innerHTML = '';
  const currentProject = state.projects.find((p) => p.id === state.activeProjectId);
  const isProjectOwner = currentProject?.owner_id === state.user?.id;

  state.members.forEach((m) => {
    const prof = m.profiles || {};
    const name = prof.display_name || (prof.email ? prof.email.split('@')[0] : 'Collaborator');
    const isCurrentUser = m.user_id === state.user?.id;
    const isMemberOwner = m.user_id === currentProject?.owner_id || m.role === 'owner';
    const canRemove = (isProjectOwner && !isMemberOwner) || (!isProjectOwner && isCurrentUser);

    const row = document.createElement('div');
    row.className = 'member-row';
    row.innerHTML = `
      <div class="member-left">
        <div class="member-dot" style="background:${escapeHtml(prof.avatar_color || '#0071e3')}">
          ${escapeHtml(getInitials(name))}
        </div>
        <div class="member-name" title="${escapeHtml(prof.email || '')}">${escapeHtml(name)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <span class="member-badge">${isCurrentUser ? 'You' : isMemberOwner ? 'Owner' : 'Online'}</span>
        ${
          canRemove
            ? `<button type="button" class="member-remove-btn" data-remove-member="${m.id}" title="${isCurrentUser ? 'Leave Workspace' : 'Remove Collaborator'}">
                 <span class="material-symbols-outlined" style="font-size:14px;">person_remove</span>
               </button>`
            : ''
        }
      </div>
    `;

    const removeBtn = row.querySelector('[data-remove-member]');
    if (removeBtn) {
      removeBtn.addEventListener('click', async () => {
        const { error } = await supabaseClient
          .from('project_members')
          .delete()
          .eq('id', m.id);
        if (error) {
          showToast(`Could not remove member: ${error.message}`, false);
          return;
        }
        if (isCurrentUser) {
          showToast('Left shared workspace');
          await loadProjects();
        } else {
          showToast(`Removed ${name} from workspace`);
          await loadProjectMembers(state.activeProjectId);
        }
      });
    }

    el.membersList.appendChild(row);
  });
}

async function loadProjectNotes(projectId) {
  const { data: notes, error } = await supabaseClient
    .from('notes')
    .select('*')
    .eq('project_id', projectId)
    .order('is_pinned', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) {
    const cached = getOfflineSnapshot();
    const cachedNotes = cached.notesByProject?.[projectId];
    if (cachedNotes) {
      state.notes = cachedNotes;
      showToast('Viewing cached notes (offline)', false);
    } else {
      showToast(`Error loading notes: ${error.message}`, false);
      return;
    }
  } else {
    state.notes = notes || [];
    saveOfflineSnapshot();
  }

  renderNotesList();

  const visibleNotes = state.notes.filter((n) =>
    state.noteFilter === 'trash' ? Boolean(n.is_trashed) : !n.is_trashed
  );
  if (visibleNotes.length > 0) {
    const keepCurrent = visibleNotes.find((n) => n.id === state.activeNoteId);
    selectNote(keepCurrent ? keepCurrent.id : visibleNotes[0].id);
  } else {
    selectNote(null);
  }
}

function sortNotesInPlace() {
  state.notes.sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

function getFilteredNotes() {
  sortNotesInPlace();
  const q = state.searchQuery.toLowerCase().trim();
  return state.notes.filter((n) => {
    const isTrashed = Boolean(n.is_trashed);
    if (state.noteFilter === 'trash') {
      if (!isTrashed) return false;
    } else {
      if (isTrashed) return false;
      if (state.noteFilter === 'starred' && !n.is_pinned) return false;
      if (state.noteFilter === 'encrypted' && !isEncryptedPayload(n.content)) return false;
    }
    if (!q) return true;
    const plain = getEffectiveNotePlaintext(n) || '';
    return (
      (n.title || '').toLowerCase().includes(q) ||
      plain.toLowerCase().includes(q)
    );
  });
}

function renderNotesList() {
  const activeCount = state.notes.filter((n) => !n.is_trashed).length;
  const filtered = getFilteredNotes();

  el.activeProjectSubtitle.textContent = `${activeCount} note${activeCount === 1 ? '' : 's'} • ${state.members.length || 1} member${state.members.length === 1 ? '' : 's'}`;
  el.notesCardsContainer.innerHTML = '';

  if (filtered.length === 0) {
    const emptyMsg =
      state.noteFilter === 'trash'
        ? 'Trash is empty. Deleted notes appear here so you can restore them anytime.'
        : state.noteFilter === 'starred'
          ? 'No starred notes yet. Use the 3-dot menu on any note to Star to Top.'
          : state.noteFilter === 'encrypted'
            ? 'No AES-256 encrypted notes yet.'
            : 'No notes match your search.';
    el.notesCardsContainer.innerHTML = `
      <div style="text-align:center;padding:28px 14px;color:var(--text-dim);font-size:12px;">
        ${emptyMsg}
      </div>
    `;
    return;
  }

  filtered.forEach((note) => {
    const isActive = note.id === state.activeNoteId;
    const isFloatingOnScreen = state.pinnedFloatingNoteIds.has(note.id);
    const isTrashed = Boolean(note.is_trashed);
    const card = document.createElement('article');
    card.className = `note-card ${isActive ? 'active' : ''} ${isTrashed ? 'is-trashed' : ''}`;
    const accentHex = COLOR_ACCENT_MAP[note.color] || '#0071e3';

    const isEncrypted = isEncryptedPayload(note.content);
    const plaintext = getEffectiveNotePlaintext(note);
    const previewText = isEncrypted && plaintext === null
      ? '🔒 End-to-End Encrypted (AES-256) — Click to unlock'
      : (plaintext || '').trim() || 'Empty note — click to type or paste...';
    const editorInfo = note.updated_by_name || 'Collaborator';

    card.innerHTML = `
      <span class="note-card-accent-bar" style="background:${escapeHtml(accentHex)}"></span>
      <div class="note-card-top">
        <div class="note-card-title">
          ${note.is_pinned ? '<span class="material-symbols-outlined filled note-star-icon">star</span>' : ''}
          ${isEncrypted ? '<span class="material-symbols-outlined" style="font-size:13px;color:var(--amber)">lock</span>' : ''}
          <span>${escapeHtml(note.title || 'Untitled Note')}</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
          <button type="button" class="note-card-copy-btn" data-float-note="${note.id}" title="${isFloatingOnScreen ? 'Unpin floating note from screen' : 'Pin this note on top of your screen'}" style="${isFloatingOnScreen ? 'background:var(--amber-bg);color:var(--amber);border-color:var(--amber-border);' : ''}">
            <span class="material-symbols-outlined" style="font-size:12px;">push_pin</span>
            <span>${isFloatingOnScreen ? 'Pinned' : 'Pin'}</span>
          </button>
          <button type="button" class="note-card-copy-btn" data-copy-note="${note.id}" title="One-click copy this note's text">
            <span class="material-symbols-outlined" style="font-size:12px;">content_copy</span>
            <span>Copy</span>
          </button>
        </div>
      </div>
      <div class="note-card-preview">${escapeHtml(previewText)}</div>
      <div class="note-card-footer">
        <span class="note-card-author">${escapeHtml(editorInfo)}</span>
        <span class="note-card-time">${formatTimeAgo(note.updated_at)}</span>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-float-note]')) {
        e.stopPropagation();
        togglePinIndividualNoteToScreen(note.id);
        return;
      }
      if (e.target.closest('[data-copy-note]')) {
        e.stopPropagation();
        if (isEncrypted && plaintext === null) {
          selectNote(note.id, true);
          showToast('Unlock this encrypted note first to copy', false);
          return;
        }
        copyToClipboard(plaintext || note.title || '', `"${note.title}"`);
        return;
      }
      selectNote(note.id, true);
    });

    el.notesCardsContainer.appendChild(card);
  });
}

function updateE2eeToolbarButton(note) {
  if (!el.btnE2eeNote) return;
  const isEncrypted = note && isEncryptedPayload(note.content);
  const isUnlocked = note && state.unlockedNotesPlaintext.has(note.id);

  el.btnE2eeNote.classList.toggle('active', Boolean(isEncrypted));
  if (isEncrypted) {
    el.e2eeNoteIcon.textContent = isUnlocked ? 'lock_open_right' : 'lock';
    el.e2eeNoteText.textContent = isUnlocked ? 'Remove E2EE Lock' : 'Unlock Note (E2EE)';
  } else {
    el.e2eeNoteIcon.textContent = 'lock_open';
    el.e2eeNoteText.textContent = 'Encrypt Note (AES-256)';
  }
}

function selectNote(noteId, openMobileEditor = false) {
  state.activeNoteId = noteId;
  state.revealedSecretLines.clear();
  if (openMobileEditor && noteId) {
    el.workspaceLayout?.classList.add('mobile-editor-open');
  } else if (!noteId) {
    el.workspaceLayout?.classList.remove('mobile-editor-open');
  }
  renderNotesList();
  updateFloatingNoteUIIndicators();

  const note = state.notes.find((n) => n.id === noteId);
  if (!note) {
    el.editorEmptyState.classList.remove('hidden');
    el.editorActiveContainer.classList.add('hidden');
    return;
  }

  el.editorEmptyState.classList.add('hidden');
  el.editorActiveContainer.classList.remove('hidden');

  if (document.activeElement !== el.noteTitleInput) {
    el.noteTitleInput.value = note.title || '';
  }

  updateE2eeToolbarButton(note);

  const plaintext = getEffectiveNotePlaintext(note);
  if (plaintext === null) {
    el.e2eeLockedOverlay.classList.remove('hidden');
    el.noteContentInput.classList.add('hidden');
    el.noteSnippetsView.classList.add('hidden');
    if (el.e2eeUnlockPassphrase) {
      el.e2eeUnlockPassphrase.value = '';
    }
  } else {
    el.e2eeLockedOverlay.classList.add('hidden');
    if (document.activeElement !== el.noteContentInput) {
      el.noteContentInput.value = plaintext;
    }
    setEditorMode(state.editorSubtab);
    renderSnippetsQuickCopy(plaintext);
  }

  const isPinned = Boolean(note.is_pinned);
  el.btnPinNoteItem.classList.toggle('active', isPinned);
  if (el.pinNoteIcon) el.pinNoteIcon.classList.toggle('filled', isPinned);
  if (el.pinNoteText) el.pinNoteText.textContent = isPinned ? 'Unstar from Top' : 'Star to Top';

  const isTrashed = Boolean(note.is_trashed);
  el.btnRestoreNote?.classList.toggle('hidden', !isTrashed);
  if (el.deleteNoteText) {
    el.deleteNoteText.textContent = isTrashed ? 'Delete Forever' : 'Move to Trash';
  }

  el.noteUpdatedBy.textContent = note.updated_by_name
    ? `Last edited by ${note.updated_by_name} • ${formatTimeAgo(note.updated_at)}`
    : formatTimeAgo(note.updated_at);
}

// =====================================================================
// DYNAMIC {{VARIABLE}} PLACEHOLDER PARSER & SNIPPET RENDERER
// =====================================================================
function extractSnippetVariables(lineText) {
  const regex = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;
  const vars = [];
  let match;
  while ((match = regex.exec(lineText)) !== null) {
    const varName = match[1];
    if (!vars.includes(varName)) {
      vars.push(varName);
    }
  }
  return vars;
}

function openSnippetVariablesPrompt(lineText, label, isSecret, vars) {
  state.pendingVarSnippet = { lineText, label, isSecret, vars };
  if (!el.snippetVarsInputs || !el.modalSnippetVars) {
    copyToClipboard(lineText, label, isSecret);
    return;
  }

  el.snippetVarsInputs.innerHTML = '';
  const valuesMap = {};

  function updatePreview() {
    let preview = lineText;
    vars.forEach((v) => {
      const val = valuesMap[v] || `{{${v}}}`;
      preview = preview.replace(new RegExp(`\\{\\{\\s*${v}\\s*\\}\\}`, 'g'), val);
    });
    if (el.snippetVarsPreviewCode) {
      el.snippetVarsPreviewCode.textContent = preview;
    }
    return preview;
  }

  vars.forEach((v, idx) => {
    const savedDefault = localStorage.getItem(`hoverpad_var_${v}`) || '';
    valuesMap[v] = savedDefault;
    const group = document.createElement('div');
    group.className = 'form-group';
    group.style.marginBottom = '0';
    group.innerHTML = `
      <label style="font-family:'JetBrains Mono',monospace;font-size:11px;">{{${escapeHtml(v)}}}</label>
      <input type="text" data-var-input="${escapeHtml(v)}" value="${escapeHtml(savedDefault)}" placeholder="Enter value for ${escapeHtml(v)}..." required />
    `;
    const input = group.querySelector('input');
    input.addEventListener('input', (e) => {
      valuesMap[v] = e.target.value;
      localStorage.setItem(`hoverpad_var_${v}`, e.target.value);
      updatePreview();
    });
    el.snippetVarsInputs.appendChild(group);
    if (idx === 0) {
      setTimeout(() => {
        input.focus();
        input.select();
      }, 40);
    }
  });

  updatePreview();
  openModal(el.modalSnippetVars);
}

function handleSmartSnippetCopy(lineText, label, isSecret = false) {
  const vars = extractSnippetVariables(lineText);
  if (vars.length > 0) {
    openSnippetVariablesPrompt(lineText, label, isSecret, vars);
  } else {
    copyToClipboard(lineText, label, isSecret);
  }
}

// =====================================================================
// SECRET MASKING & SYNTAX-AWARE QUICK COPY RENDERER
// =====================================================================
function classifySnippetLine(lineText) {
  const trimmed = lineText.trim();
  if (/^(https?:\/\/|wss?:\/\/)/i.test(trimmed)) {
    return { icon: 'link', cssClass: 'is-url', isSecret: false };
  }
  if (
    /^[A-Z0-9_]{2,}\s*=\s*\S+/.test(trimmed) ||
    /(KEY|TOKEN|SECRET|PASSWORD|BEARER|PRIVATE|CREDENTIAL|AUTH)[_A-Z0-9]*\s*[:=]\s*\S+/i.test(trimmed) ||
    /^(sk_live_|pk_live_|ghp_|gho_|glpat-|xox[baprs]-|eyJ[A-Za-z0-9_-]{10,})/i.test(trimmed)
  ) {
    return { icon: 'key', cssClass: 'is-secret', isSecret: true };
  }
  return { icon: 'terminal', cssClass: '', isSecret: false };
}

function maskSecretLineValue(lineText) {
  const eqIdx = lineText.indexOf('=');
  const colonIdx = lineText.indexOf(':');
  const splitIdx = eqIdx !== -1 ? eqIdx : colonIdx;
  if (splitIdx !== -1 && splitIdx < 45) {
    const prefix = lineText.slice(0, splitIdx + 1);
    return `${prefix}••••••••••••`;
  }
  if (lineText.length > 8) {
    return `${lineText.slice(0, 6)}••••••••••••`;
  }
  return '••••••••••••';
}

function renderSnippetsQuickCopy(content) {
  el.noteSnippetsView.innerHTML = '';
  const allLines = String(content ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (el.noteLinesCount) {
    el.noteLinesCount.textContent = `${allLines.length} snippet${allLines.length === 1 ? '' : 's'}`;
  }

  const q = state.searchQuery.toLowerCase().trim();
  const lines = q ? allLines.filter((l) => l.toLowerCase().includes(q)) : allLines;
  state.currentVisibleSnippets = lines;

  if (lines.length === 0) {
    el.noteSnippetsView.innerHTML = `
      <div style="color:var(--text-dim);font-size:12px;text-align:center;padding:28px 16px;">
        No snippet lines yet. Switch to <strong>Live Editor</strong> or click <strong>+ Paste Line</strong> (or press <code>Ctrl+Shift+V</code> anywhere) to add commands, links, or secrets.
      </div>
    `;
    return;
  }

  lines.forEach((lineText, idx) => {
    const numStr = String(idx + 1).padStart(2, '0');
    const meta = classifySnippetLine(lineText);
    const isRevealed = state.revealedSecretLines.has(idx);
    const shouldMask = meta.isSecret && state.maskSecrets && !isRevealed;
    const displayStr = shouldMask ? maskSecretLineValue(lineText) : lineText;

    const row = document.createElement('div');
    row.className = 'snippet-line-item';
    const vars = extractSnippetVariables(lineText);
    const varBadgeHtml =
      vars.length > 0
        ? `<span class="snippet-var-badge" title="Prompts for ${vars.map((v) => `{{${v}}}`).join(', ')} before copying">${vars.length} var${vars.length > 1 ? 's' : ''}</span>`
        : '';
    row.innerHTML = `
      <div class="snippet-line-left">
        <span class="snippet-line-num" title="Press Alt+${idx + 1} to instant-copy">${numStr}</span>
        <span class="material-symbols-outlined snippet-type-icon">${meta.icon}</span>
        <code class="snippet-line-text ${meta.cssClass}">${escapeHtml(displayStr)}</code>
        ${varBadgeHtml}
      </div>
      <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">
        ${
          meta.isSecret && state.maskSecrets
            ? `<button type="button" class="note-card-copy-btn" data-peek-secret="${idx}" title="${isRevealed ? 'Hide Secret' : 'Peek Secret'}">
                 <span class="material-symbols-outlined" style="font-size:12px;">${isRevealed ? 'visibility_off' : 'visibility'}</span>
               </button>`
            : ''
        }
        <button type="button" class="note-card-copy-btn">
          <span class="material-symbols-outlined" style="font-size:12px;">content_copy</span>
          <span>${vars.length > 0 ? 'Fill & Copy' : 'Copy'}</span>
        </button>
      </div>
    `;

    const peekBtn = row.querySelector('[data-peek-secret]');
    if (peekBtn) {
      peekBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.revealedSecretLines.has(idx)) {
          state.revealedSecretLines.delete(idx);
        } else {
          state.revealedSecretLines.add(idx);
        }
        renderSnippetsQuickCopy(content);
      });
    }

    row.addEventListener('click', () => {
      handleSmartSnippetCopy(lineText, `Line ${numStr}`, meta.isSecret);
    });
    el.noteSnippetsView.appendChild(row);
  });
}

// =====================================================================
// SUPABASE REALTIME COLLABORATION & LIVE TYPING PRESENCE
// =====================================================================
function subscribeToProjectRealtime(projectId) {
  if (state.realtimeChannel) {
    supabaseClient.removeChannel(state.realtimeChannel);
    state.realtimeChannel = null;
  }

  const channel = supabaseClient
    .channel(`hoverpad-project-${projectId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notes',
        filter: `project_id=eq.${projectId}`
      },
      (payload) => {
        handleRealtimeNoteEvent(payload);
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'project_members',
        filter: `project_id=eq.${projectId}`
      },
      () => {
        loadProjectMembers(projectId);
      }
    )
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (!payload || payload.userId === state.user?.id) return;
      if (payload.noteId === state.activeNoteId && el.typingPresencePill) {
        el.typingPresencePill.textContent = `${payload.userName || 'Teammate'} is typing...`;
        el.typingPresencePill.classList.remove('hidden');
        if (state.typingClearTimeout) clearTimeout(state.typingClearTimeout);
        state.typingClearTimeout = setTimeout(() => {
          el.typingPresencePill.classList.add('hidden');
        }, 2400);
      }
    })
    .subscribe();

  state.realtimeChannel = channel;
}

function broadcastTypingPresence() {
  if (!state.realtimeChannel || !state.activeNoteId || !state.user) return;
  const now = Date.now();
  if (now - state.lastTypingBroadcast < 1200) return;
  state.lastTypingBroadcast = now;
  state.realtimeChannel.send({
    type: 'broadcast',
    event: 'typing',
    payload: {
      noteId: state.activeNoteId,
      userId: state.user.id,
      userName: getDisplayName()
    }
  });
}

async function handleRealtimeNoteEvent(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;

  if (eventType === 'INSERT' && newRow) {
    const exists = state.notes.some((n) => n.id === newRow.id);
    if (!exists) {
      state.notes.unshift(newRow);
      saveOfflineSnapshot();
      renderNotesList();
      if (!state.activeNoteId) selectNote(newRow.id);
    }
  } else if (eventType === 'UPDATE' && newRow) {
    const idx = state.notes.findIndex((n) => n.id === newRow.id);
    if (idx !== -1) {
      state.notes[idx] = newRow;
    } else {
      state.notes.unshift(newRow);
    }
    saveOfflineSnapshot();

    if (isEncryptedPayload(newRow.content) && state.unlockedNotesPassphrases.has(newRow.id)) {
      try {
        const decrypted = await decryptNoteContent(
          newRow.content,
          state.unlockedNotesPassphrases.get(newRow.id)
        );
        state.unlockedNotesPlaintext.set(newRow.id, decrypted);
      } catch (_e) {
        state.unlockedNotesPlaintext.delete(newRow.id);
        state.unlockedNotesPassphrases.delete(newRow.id);
      }
    }

    syncFloatingNoteWindowIfOpen(newRow);
    renderNotesList();

    if (state.activeNoteId === newRow.id) {
      const isEditingLocally =
        document.activeElement === el.noteContentInput ||
        document.activeElement === el.noteTitleInput;

      const plaintext = getEffectiveNotePlaintext(newRow);
      if (newRow.updated_by !== state.user?.id) {
        if (document.activeElement !== el.noteTitleInput) {
          el.noteTitleInput.value = newRow.title || '';
        }
        if (plaintext !== null) {
          if (document.activeElement === el.noteContentInput) {
            // Preserve cursor position when a teammate edits simultaneously
            const selStart = el.noteContentInput.selectionStart;
            const selEnd = el.noteContentInput.selectionEnd;
            el.noteContentInput.value = plaintext;
            el.noteContentInput.setSelectionRange(
              Math.min(selStart, plaintext.length),
              Math.min(selEnd, plaintext.length)
            );
          } else {
            el.noteContentInput.value = plaintext;
          }
        }
      }
      el.noteUpdatedBy.textContent = newRow.updated_by_name
        ? `Live update by ${newRow.updated_by_name} • ${formatTimeAgo(newRow.updated_at)}`
        : 'Synced live';
      updateE2eeToolbarButton(newRow);
      if (plaintext !== null) {
        renderSnippetsQuickCopy(plaintext);
      }
    }
  } else if (eventType === 'DELETE' && oldRow) {
    state.notes = state.notes.filter((n) => n.id !== oldRow.id);
    if (state.pinnedFloatingNoteIds.has(oldRow.id)) {
      window.hoverpadDesktop?.closeNoteWindow(oldRow.id);
      state.pinnedFloatingNoteIds.delete(oldRow.id);
      updateFloatingNoteUIIndicators();
    }
    saveOfflineSnapshot();
    renderNotesList();
    if (state.activeNoteId === oldRow.id) {
      selectNote(state.notes[0]?.id || null);
    }
  }
}

// =====================================================================
// CRUD ACTIONS: CREATE, EDIT, FLUSH-ON-QUIT, E2EE LOCK, PASTE
// =====================================================================
async function createNewNote(initialTitle = 'Untitled Note', initialContent = '') {
  if (!state.activeProjectId || !state.user) return;

  const authorName = getDisplayName();
  const { data: created, error } = await supabaseClient
    .from('notes')
    .insert({
      project_id: state.activeProjectId,
      title: initialTitle,
      content: initialContent,
      color: '#1e3a5f',
      is_pinned: false,
      created_by: state.user.id,
      updated_by: state.user.id,
      updated_by_name: authorName
    })
    .select()
    .single();

  if (error) {
    showToast(`Could not create note: ${error.message}`, false);
    return;
  }

  const exists = state.notes.some((n) => n.id === created.id);
  if (!exists) {
    state.notes.unshift(created);
  }
  saveOfflineSnapshot();
  selectNote(created.id, true);
  setEditorMode('edit');
  el.noteTitleInput.focus();
  el.noteTitleInput.select();
}

async function buildNoteUpdatePatch(note, partialUpdates = {}) {
  const updatedTitle =
    partialUpdates.title !== undefined ? partialUpdates.title : el.noteTitleInput.value;
  const rawPlainContent =
    partialUpdates.content !== undefined ? partialUpdates.content : el.noteContentInput.value;
  const updatedColor = partialUpdates.color !== undefined ? partialUpdates.color : note.color;
  const updatedPinned =
    partialUpdates.is_pinned !== undefined ? partialUpdates.is_pinned : note.is_pinned;

  let storedContent = rawPlainContent;
  if (state.unlockedNotesPassphrases.has(note.id)) {
    const passphrase = state.unlockedNotesPassphrases.get(note.id);
    state.unlockedNotesPlaintext.set(note.id, rawPlainContent);
    storedContent = await encryptNoteContent(rawPlainContent, passphrase);
  }

  const nowIso = new Date().toISOString();
  note.title = updatedTitle;
  note.content = storedContent;
  note.color = updatedColor;
  note.is_pinned = updatedPinned;
  note.updated_at = nowIso;
  note.updated_by_name = getDisplayName();

  return {
    patch: {
      title: updatedTitle,
      content: storedContent,
      color: updatedColor,
      is_pinned: updatedPinned,
      updated_by: state.user.id,
      updated_by_name: getDisplayName(),
      updated_at: nowIso
    },
    plainContent: rawPlainContent
  };
}

async function flushPendingNoteSaveImmediate() {
  if (!state.saveTimeout) return;
  clearTimeout(state.saveTimeout);
  state.saveTimeout = null;
  const note = state.notes.find((n) => n.id === state.activeNoteId);
  if (!note || !state.user) return;
  if (isEncryptedPayload(note.content) && !state.unlockedNotesPassphrases.has(note.id)) return;

  const { patch } = await buildNoteUpdatePatch(note);
  saveOfflineSnapshot();
  const { error } = await supabaseClient.from('notes').update(patch).eq('id', note.id);
  if (error) {
    enqueueOfflineNoteUpdate(note.id, patch);
  }
}

function scheduleNoteSave(partialUpdates = {}) {
  const note = state.notes.find((n) => n.id === state.activeNoteId);
  if (!note || !state.user) return;
  if (isEncryptedPayload(note.content) && !state.unlockedNotesPassphrases.has(note.id)) return;

  broadcastTypingPresence();

  const updatedContent =
    partialUpdates.content !== undefined ? partialUpdates.content : el.noteContentInput.value;

  if (state.unlockedNotesPassphrases.has(note.id)) {
    state.unlockedNotesPlaintext.set(note.id, updatedContent);
  } else {
    note.content = updatedContent;
  }
  if (partialUpdates.title !== undefined) note.title = partialUpdates.title;
  else note.title = el.noteTitleInput.value;

  syncFloatingNoteWindowIfOpen(note);

  el.noteSaveStatus.textContent = navigator.onLine ? 'Syncing...' : 'Cached offline';
  renderNotesList();
  renderSnippetsQuickCopy(updatedContent);

  if (state.saveTimeout) clearTimeout(state.saveTimeout);
  state.saveTimeout = setTimeout(async () => {
    state.saveTimeout = null;
    const { patch } = await buildNoteUpdatePatch(note, partialUpdates);
    saveOfflineSnapshot();

    if (!navigator.onLine) {
      enqueueOfflineNoteUpdate(note.id, patch);
      el.noteSaveStatus.textContent = 'Cached offline';
      return;
    }

    const { error } = await supabaseClient.from('notes').update(patch).eq('id', note.id);
    if (error) {
      enqueueOfflineNoteUpdate(note.id, patch);
      el.noteSaveStatus.textContent = 'Cached offline (will retry)';
    } else {
      el.noteSaveStatus.textContent = 'Synced to Cloud';
      maybeSaveNoteRevisionSnapshot(note);
    }
  }, 260);
}

async function maybeSaveNoteRevisionSnapshot(note) {
  if (!note || !isValidUuid(note.id) || !isValidUuid(note.project_id)) return;
  if (!note.content || !note.content.trim()) return;
  const now = Date.now();
  const lastSaved = state.lastRevisionAtByNote.get(note.id) || 0;
  // Snapshot at most once every 20 seconds per note while actively editing
  if (now - lastSaved < 20000) return;
  state.lastRevisionAtByNote.set(note.id, now);
  try {
    await supabaseClient.from('note_revisions').insert({
      note_id: note.id,
      project_id: note.project_id,
      title: note.title || 'Untitled Note',
      content: note.content,
      saved_by_name: getDisplayName()
    });
  } catch (_e) {
    // Ignore background revision errors
  }
}

async function openNoteVersionHistoryModal() {
  const note = state.notes.find((n) => n.id === state.activeNoteId);
  if (!note || !el.noteHistoryList) return;

  el.noteHistoryList.innerHTML = `
    <div style="text-align:center;padding:20px;color:var(--text-dim);font-size:12px;">
      Loading version history...
    </div>
  `;
  openModal(el.modalNoteHistory);

  const { data: revisions, error } = await supabaseClient
    .from('note_revisions')
    .select('*')
    .eq('note_id', note.id)
    .order('created_at', { ascending: false })
    .limit(12);

  if (error || !revisions || revisions.length === 0) {
    el.noteHistoryList.innerHTML = `
      <div style="text-align:center;padding:24px 12px;color:var(--text-dim);font-size:12px;">
        No previous snapshots saved for this note yet. Snapshots are recorded automatically as you edit or before moving a note to Trash.
      </div>
    `;
    return;
  }

  el.noteHistoryList.innerHTML = '';
  revisions.forEach((rev) => {
    const isEnc = isEncryptedPayload(rev.content);
    const preview = isEnc
      ? '🔒 Encrypted Snapshot (AES-256)'
      : (rev.content || '').trim() || '(Empty content)';
    const item = document.createElement('div');
    item.className = 'history-item-card';
    item.innerHTML = `
      <div class="history-item-top">
        <div>
          <div class="history-item-meta">${escapeHtml(rev.title || 'Untitled Note')} • by ${escapeHtml(rev.saved_by_name || 'Collaborator')}</div>
          <div class="history-item-time">${formatTimeAgo(rev.created_at)} (${new Date(rev.created_at).toLocaleTimeString()})</div>
        </div>
        <button type="button" class="btn-secondary btn-sm" data-restore-rev="${rev.id}">
          <span class="material-symbols-outlined" style="font-size:14px;">restore</span>
          <span>Restore</span>
        </button>
      </div>
      <div class="history-item-preview">${escapeHtml(preview)}</div>
    `;

    item.querySelector('[data-restore-rev]')?.addEventListener('click', async () => {
      note.title = rev.title;
      note.content = rev.content;
      el.noteTitleInput.value = rev.title || '';
      if (!isEncryptedPayload(rev.content)) {
        state.unlockedNotesPlaintext.delete(note.id);
        state.unlockedNotesPassphrases.delete(note.id);
        el.noteContentInput.value = rev.content || '';
      }
      closeModals();
      selectNote(note.id);
      scheduleNoteSave({ title: rev.title, content: rev.content });
      showToast('Restored note to selected snapshot!');
    });

    el.noteHistoryList.appendChild(item);
  });
}

function triggerBrowserFileDownload(filename, contentStr, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([contentStr], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}

function exportActiveNoteAsMarkdown() {
  const note = state.notes.find((n) => n.id === state.activeNoteId);
  if (!note) return;
  const plain = getEffectiveNotePlaintext(note);
  if (plain === null) {
    showToast('Unlock this encrypted note before exporting to Markdown', false);
    return;
  }
  const safeName = (note.title || 'hoverpad-note')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'hoverpad-note';
  const md = `# ${note.title || 'Untitled Note'}\n\n> Exported from HoverPad Workspace • Last updated ${new Date(note.updated_at).toLocaleString()}\n\n\`\`\`\n${plain}\n\`\`\`\n`;
  triggerBrowserFileDownload(`${safeName}.md`, md, 'text/markdown;charset=utf-8');
  showToast(`Exported "${note.title}" as Markdown (.md)`);
}

function exportWorkspaceBackupAsJson() {
  const currentProject = state.projects.find((p) => p.id === state.activeProjectId);
  const backup = {
    exportedAt: new Date().toISOString(),
    appVersion: state.appVersion,
    workspace: currentProject || { id: state.activeProjectId, name: 'HoverPad Workspace' },
    notes: state.notes.filter((n) => !n.is_trashed)
  };
  const safeProj = (currentProject?.name || 'hoverpad-workspace')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'hoverpad-workspace';
  triggerBrowserFileDownload(
    `${safeProj}-backup.json`,
    JSON.stringify(backup, null, 2),
    'application/json;charset=utf-8'
  );
  showToast('Downloaded full Workspace JSON backup');
}

async function appendClipboardToActiveNote(fromGlobalHotkey = false) {
  const clipText = await readRawClipboard();
  if (!clipText || !clipText.trim()) {
    showToast('Clipboard is empty', false);
    return;
  }
  const note = state.notes.find((n) => n.id === state.activeNoteId);
  if (!note) {
    const firstLine = clipText.trim().split(/\r?\n/)[0].slice(0, 42) || 'Clipboard Snippet';
    await createNewNote(firstLine, clipText.trim());
    showToast('Created new note from clipboard');
    return;
  }
  if (isEncryptedPayload(note.content) && !state.unlockedNotesPassphrases.has(note.id)) {
    showToast('Unlock the active encrypted note before pasting', false);
    return;
  }
  const current = el.noteContentInput.value;
  const next = current ? `${current.trimEnd()}\n${clipText.trim()}` : clipText.trim();
  el.noteContentInput.value = next;
  scheduleNoteSave({ content: next });
  showToast(
    fromGlobalHotkey
      ? `Quick-Captured clipboard to "${note.title}"`
      : 'Appended clipboard text to note'
  );
}

// =====================================================================
// MODALS & WORKSPACE EVENT HANDLERS
// =====================================================================
function openModal(modalEl) {
  el.modalOverlay.classList.remove('hidden');
  [
    el.modalNewProject,
    el.modalInviteUser,
    el.modalJoinProject,
    el.modalE2eeLock,
    el.modalSettings,
    el.modalNoteHistory,
    el.modalSnippetVars
  ].forEach((m) => m?.classList.add('hidden'));
  modalEl?.classList.remove('hidden');
}

function closeModals() {
  el.modalOverlay.classList.add('hidden');
}

function openSettingsModal() {
  if (el.toggleSettingAutoupdate) el.toggleSettingAutoupdate.checked = state.autoUpdate;
  if (el.toggleSettingMaskSecrets) el.toggleSettingMaskSecrets.checked = state.maskSecrets;
  if (el.toggleSettingAutoclearClip) el.toggleSettingAutoclearClip.checked = state.autoClearClipboard;
  if (el.toggleSettingCloseTray) el.toggleSettingCloseTray.checked = state.closeToTray;
  if (el.toggleSettingStartup) el.toggleSettingStartup.checked = state.launchAtStartup;
  openModal(el.modalSettings);
}

// =====================================================================
// NOTIFICATION CENTER & LIVE GITHUB OVER-THE-AIR AUTO-UPDATER
// =====================================================================
function compareSemverClient(vA, vB) {
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

function updateVersionLabels() {
  if (el.notifCurrentVersion) el.notifCurrentVersion.textContent = `v${state.appVersion}`;
  if (el.navVersionLabel) el.navVersionLabel.textContent = `v${state.appVersion} Live`;
}

function applyAutoUpdateUI(enabled) {
  state.autoUpdate = Boolean(enabled);
  localStorage.setItem('hoverpad_auto_update', String(state.autoUpdate));
  if (el.toggleNotifAutoupdate) el.toggleNotifAutoupdate.checked = state.autoUpdate;
  if (el.toggleSettingAutoupdate) el.toggleSettingAutoupdate.checked = state.autoUpdate;
  if (el.notifAutoupdateStatus) {
    el.notifAutoupdateStatus.textContent = state.autoUpdate
      ? 'Auto-installs latest GitHub releases'
      : 'Manual mode — notifies you before updating';
  }
}

function loadSavedNotifications() {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTIF_STORAGE_KEY) || '[]');
    if (Array.isArray(raw) && raw.length > 0) {
      state.notifications = raw;
      return;
    }
  } catch (_e) {
    // Fallback to default release notification
  }

  state.notifications = [
    {
      id: `release-${APP_CURRENT_VERSION}`,
      title: `HoverPad v${APP_CURRENT_VERSION} Installed`,
      icon: 'verified',
      time: new Date().toISOString(),
      unread: true,
      body: 'Live Over-the-Air Auto-Updater and Notification Center are active.',
      bullets: [
        'Turn Automatic Updates On or Off anytime from the bell menu or Preferences.',
        'Cleaned up the note editor toolbar with a 3-dot options popover.',
        'Responsive layout adapts smoothly from 320px mobile to 4K monitors.'
      ]
    }
  ];
  saveNotifications();
}

function saveNotifications() {
  try {
    localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(state.notifications.slice(0, 25)));
  } catch (_e) {
    // Ignore
  }
}

function pushNotification({ id, title, body, bullets = [], icon = 'notifications', unread = true }) {
  const notifId = id || `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const existingIdx = state.notifications.findIndex((n) => n.id === notifId);
  const item = {
    id: notifId,
    title,
    body,
    bullets,
    icon,
    time: new Date().toISOString(),
    unread
  };

  if (existingIdx !== -1) {
    state.notifications[existingIdx] = item;
  } else {
    state.notifications.unshift(item);
  }
  saveNotifications();
  renderNotificationCenter();
}

function renderNotificationCenter() {
  if (!el.notifFeedList) return;
  const unreadCount = state.notifications.filter((n) => n.unread).length;
  const hasPendingUpdate = Boolean(state.pendingUpdateManifest);

  if (el.notifUnreadBadge) {
    const badgeTotal = unreadCount + (hasPendingUpdate ? 1 : 0);
    el.notifUnreadBadge.classList.toggle('hidden', badgeTotal === 0);
    el.notifUnreadBadge.classList.toggle('has-update', hasPendingUpdate);
    el.notifUnreadBadge.textContent = badgeTotal > 9 ? '9+' : String(badgeTotal);
  }

  // Render Active Update Banner if an update is available or downloaded
  if (el.notifUpdateBanner) {
    if (hasPendingUpdate) {
      const m = state.pendingUpdateManifest;
      el.notifUpdateBanner.classList.remove('hidden');
      el.notifUpdateTitle.textContent = state.updateReadyToReload
        ? `v${m.version} Downloaded & Ready!`
        : `Update Available: v${m.version}`;
      if (el.btnNotifApplyLabel) {
        el.btnNotifApplyLabel.textContent = state.updateReadyToReload
          ? 'Reload Now to Finish Update'
          : 'Download & Apply Update Now';
      }
      el.notifUpdateNotes.innerHTML = '';
      (Array.isArray(m.notes) ? m.notes : []).forEach((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        el.notifUpdateNotes.appendChild(li);
      });
    } else {
      el.notifUpdateBanner.classList.add('hidden');
    }
  }

  // Render Notification Feed Cards
  el.notifFeedList.innerHTML = '';
  if (state.notifications.length === 0) {
    el.notifFeedList.innerHTML = `
      <div style="text-align:center;padding:24px 12px;color:var(--text-dim);font-size:11.5px;">
        No notifications yet. Click <strong>Check Updates</strong> above to check GitHub for new releases.
      </div>
    `;
    return;
  }

  state.notifications.forEach((n) => {
    const card = document.createElement('div');
    card.className = `notif-card ${n.unread ? 'unread' : ''}`;
    const bulletsHtml =
      Array.isArray(n.bullets) && n.bullets.length > 0
        ? `<ul class="notif-card-bullets">${n.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`
        : '';

    card.innerHTML = `
      <div class="notif-card-top">
        <div class="notif-card-title">
          <span class="material-symbols-outlined" style="font-size:14px;color:var(--accent-text);">${escapeHtml(n.icon || 'notifications')}</span>
          <span>${escapeHtml(n.title)}</span>
        </div>
        <span class="notif-card-time">${formatTimeAgo(n.time)}</span>
      </div>
      <div class="notif-card-body">${escapeHtml(n.body || '')}</div>
      ${bulletsHtml}
    `;

    card.addEventListener('click', () => {
      n.unread = false;
      saveNotifications();
      renderNotificationCenter();
    });

    el.notifFeedList.appendChild(card);
  });
}

function showUpdatePopupModal(manifest, isDownloaded = false) {
  if (!el.updatePopupCard || !manifest) return;
  if (el.updatePopupEyebrow) {
    el.updatePopupEyebrow.textContent = isDownloaded
      ? 'UPDATE DOWNLOADED & READY'
      : 'NEW UPDATE AVAILABLE';
  }
  if (el.updatePopupIcon) {
    el.updatePopupIcon.textContent = isDownloaded ? 'system_update_alt' : 'new_releases';
  }
  if (el.updatePopupTitle) {
    el.updatePopupTitle.textContent = `HoverPad v${manifest.version} is Ready!`;
  }
  if (el.updatePopupSubtitle) {
    el.updatePopupSubtitle.textContent =
      manifest.title ||
      (isDownloaded
        ? `HoverPad v${manifest.version} was downloaded automatically. Reload to apply the latest changes.`
        : `A new HoverPad release (v${manifest.version}) is available on GitHub.`);
  }
  if (el.btnUpdatePopupApplyLabel) {
    el.btnUpdatePopupApplyLabel.textContent = isDownloaded
      ? 'Reload Now to Update'
      : 'Download & Update Now';
  }
  if (el.updatePopupNotes) {
    el.updatePopupNotes.innerHTML = '';
    const notesList = Array.isArray(manifest.notes) ? manifest.notes : [];
    notesList.forEach((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      el.updatePopupNotes.appendChild(li);
    });
    el.updatePopupNotes.classList.toggle('hidden', notesList.length === 0);
  }
  el.updatePopupCard.classList.remove('hidden');
}

function hideUpdatePopupModal() {
  el.updatePopupCard?.classList.add('hidden');
}

async function applyPendingUpdateAndReload() {
  await flushPendingNoteSaveImmediate();
  if (window.hoverpadDesktop) {
    if (!state.updateReadyToReload) {
      if (el.btnNotifApplyUpdate) el.btnNotifApplyUpdate.disabled = true;
      if (el.btnUpdatePopupApply) el.btnUpdatePopupApply.disabled = true;
      if (el.btnNotifApplyLabel) el.btnNotifApplyLabel.textContent = 'Downloading update...';
      if (el.btnUpdatePopupApplyLabel) el.btnUpdatePopupApplyLabel.textContent = 'Downloading...';
      await window.hoverpadDesktop.applyUpdateNow();
    }
    state.pendingUpdateManifest = null;
    state.updateReadyToReload = false;
    hideUpdatePopupModal();
    await window.hoverpadDesktop.reloadUpdatedApp();
  } else {
    hideUpdatePopupModal();
    window.location.reload();
  }
}

function handleUpdaterStatusPayload(payload) {
  if (!payload) return;
  if (payload.localVersion) {
    state.appVersion = payload.localVersion;
    updateVersionLabels();
  }

  if (payload.status === 'downloading' && payload.remoteManifest) {
    showToast(`Auto-downloading HoverPad v${payload.remoteManifest.version}...`);
  } else if (payload.status === 'downloaded' && payload.remoteManifest) {
    const m = payload.remoteManifest;
    state.pendingUpdateManifest = m;
    state.updateReadyToReload = true;
    pushNotification({
      id: `update-ready-${m.version}`,
      title: `Update v${m.version} Downloaded Automatically`,
      icon: 'system_update_alt',
      body: m.title || `HoverPad v${m.version} has been downloaded over-the-air. Click Reload Now above to activate it.`,
      bullets: Array.isArray(m.notes) ? m.notes : [],
      unread: true
    });
    showUpdatePopupModal(m, true);
  } else if (payload.status === 'available' && payload.remoteManifest) {
    const m = payload.remoteManifest;
    state.pendingUpdateManifest = m;
    state.updateReadyToReload = false;
    pushNotification({
      id: `update-avail-${m.version}`,
      title: `New Update Available: v${m.version}`,
      icon: 'new_releases',
      body: m.title || `A new version of HoverPad (v${m.version}) is available on GitHub.`,
      bullets: Array.isArray(m.notes) ? m.notes : [],
      unread: true
    });
    showUpdatePopupModal(m, false);
  } else if (payload.status === 'up-to-date' && payload.manual) {
    if (payload.remoteManifest) {
      pushNotification({
        id: `release-${payload.remoteManifest.version}`,
        title: `Up to Date (v${state.appVersion})`,
        icon: 'check_circle',
        body: payload.remoteManifest.title || 'You are running the latest version of HoverPad from GitHub.',
        bullets: Array.isArray(payload.remoteManifest.notes) ? payload.remoteManifest.notes : [],
        unread: false
      });
    }
    showToast(`HoverPad is up to date (v${state.appVersion})`);
  } else if (payload.status === 'error' && payload.manual) {
    showToast(`Update check failed: ${payload.error || 'Offline'}`, false);
  }
  renderNotificationCenter();
}

async function triggerUpdateCheck(manual = true) {
  if (el.btnNotifCheckUpdates) {
    el.btnNotifCheckUpdates.disabled = true;
    el.btnNotifCheckUpdates.querySelector('span:last-child').textContent = 'Checking...';
  }
  try {
    if (window.hoverpadDesktop) {
      await window.hoverpadDesktop.checkForUpdates({ manual });
    } else {
      // Browser / Edge App Mode live GitHub version check
      const res = await fetch(`${GITHUB_VERSION_MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const remoteManifest = await res.json();
      const cmp = compareSemverClient(remoteManifest.version, state.appVersion);
      if (cmp > 0) {
        handleUpdaterStatusPayload({
          status: state.autoUpdate ? 'downloaded' : 'available',
          hasUpdate: true,
          localVersion: state.appVersion,
          remoteManifest,
          manual
        });
      } else {
        handleUpdaterStatusPayload({
          status: 'up-to-date',
          hasUpdate: false,
          localVersion: state.appVersion,
          remoteManifest,
          manual
        });
      }
    }
  } catch (err) {
    if (manual) showToast(`Update check error: ${err.message}`, false);
  } finally {
    if (el.btnNotifCheckUpdates) {
      el.btnNotifCheckUpdates.disabled = false;
      el.btnNotifCheckUpdates.querySelector('span:last-child').textContent = 'Check Updates';
    }
  }
}

function initNotificationCenterAndUpdater() {
  loadSavedNotifications();
  applyAutoUpdateUI(state.autoUpdate);
  updateVersionLabels();
  renderNotificationCenter();

  // Toggle Notification Center Bell Dropdown
  el.btnNotifBell?.addEventListener('click', (e) => {
    e.stopPropagation();
    el.notifCenterDropdown?.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#notif-center-wrap')) {
      el.notifCenterDropdown?.classList.add('hidden');
    }
  });

  // Check for Updates button inside Notification Center
  el.btnNotifCheckUpdates?.addEventListener('click', () => {
    triggerUpdateCheck(true);
  });

  // Clear / Mark all read button
  el.btnNotifClearAll?.addEventListener('click', () => {
    state.notifications.forEach((n) => {
      n.unread = false;
    });
    saveNotifications();
    renderNotificationCenter();
    showToast('Marked all notifications as read');
  });

  // Auto-Update toggle switch inside Notification Center & Preferences Modal
  async function setAutoUpdatePreference(enabled) {
    applyAutoUpdateUI(enabled);
    if (window.hoverpadDesktop) {
      await window.hoverpadDesktop.toggleAutoUpdate(enabled);
    }
    showToast(
      enabled
        ? 'Automatic Over-the-Air updates enabled'
        : 'Automatic updates turned off (Manual mode)'
    );
    if (enabled && state.pendingUpdateManifest && !state.updateReadyToReload) {
      if (window.hoverpadDesktop) {
        await window.hoverpadDesktop.applyUpdateNow();
      }
    }
  }

  el.toggleNotifAutoupdate?.addEventListener('change', (e) => {
    setAutoUpdatePreference(e.target.checked);
  });

  el.toggleSettingAutoupdate?.addEventListener('change', (e) => {
    setAutoUpdatePreference(e.target.checked);
  });

  // Apply & Reload Update Button (Notification Center & Floating Pop-Up Card)
  el.btnNotifApplyUpdate?.addEventListener('click', applyPendingUpdateAndReload);
  el.btnUpdatePopupApply?.addEventListener('click', applyPendingUpdateAndReload);
  el.btnUpdatePopupDismiss?.addEventListener('click', hideUpdatePopupModal);
  el.btnUpdatePopupLater?.addEventListener('click', hideUpdatePopupModal);

  // If running in Browser / Edge App mode, check GitHub for updates 3s after launch and every 5 minutes
  if (!window.hoverpadDesktop) {
    setTimeout(() => {
      triggerUpdateCheck(false);
    }, 3000);
    setInterval(() => {
      triggerUpdateCheck(false);
    }, 5 * 60 * 1000);
  }
}

function initWorkspaceHandlers() {
  window.addEventListener('beforeunload', () => {
    flushPendingNoteSaveImmediate();
  });

  el.btnCreateNote.addEventListener('click', () => createNewNote('New Note', ''));
  el.btnEmptyCreateNote.addEventListener('click', () => createNewNote('New Note', ''));

  el.btnPasteNewNote.addEventListener('click', async () => {
    const clipText = await readRawClipboard();
    if (!clipText || !clipText.trim()) {
      showToast('Clipboard is empty', false);
      return;
    }
    const firstLine = clipText.trim().split(/\r?\n/)[0].slice(0, 42) || 'Clipboard Snippet';
    await createNewNote(firstLine, clipText);
    showToast('Created shared note from clipboard');
  });

  el.btnAppendClipboard.addEventListener('click', () => appendClipboardToActiveNote(false));

  el.notesSearchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderNotesList();
    const note = state.notes.find((n) => n.id === state.activeNoteId);
    const plain = getEffectiveNotePlaintext(note);
    if (plain !== null) {
      renderSnippetsQuickCopy(plain);
    }
  });

  // Category Filter Pills (All, Starred, Encrypted, Trash)
  document.querySelectorAll('[data-note-filter]').forEach((pill) => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('[data-note-filter]').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      state.noteFilter = pill.dataset.noteFilter || 'all';
      renderNotesList();
      const filtered = getFilteredNotes();
      if (!filtered.some((n) => n.id === state.activeNoteId)) {
        selectNote(filtered[0]?.id || null);
      }
    });
  });

  el.noteTitleInput.addEventListener('input', () => scheduleNoteSave());
  el.noteContentInput.addEventListener('input', () => scheduleNoteSave());

  // 3-Dot Note Options Dropdown Menu Toggle
  el.btnNoteMoreMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    el.noteMoreDropdown?.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#note-more-wrap')) {
      el.noteMoreDropdown?.classList.add('hidden');
    }
  });

  el.btnPinNoteItem.addEventListener('click', () => {
    el.noteMoreDropdown?.classList.add('hidden');
    const note = state.notes.find((n) => n.id === state.activeNoteId);
    if (!note) return;
    const nextPin = !note.is_pinned;
    el.btnPinNoteItem.classList.toggle('active', nextPin);
    if (el.pinNoteIcon) el.pinNoteIcon.classList.toggle('filled', nextPin);
    if (el.pinNoteText) el.pinNoteText.textContent = nextPin ? 'Unstar from Top' : 'Star to Top';
    scheduleNoteSave({ is_pinned: nextPin });
  });

  // Pin ONLY the current note as a floating Always-On-Top window on screen
  el.btnFloatNoteWindow?.addEventListener('click', () => {
    if (state.activeNoteId) {
      togglePinIndividualNoteToScreen(state.activeNoteId);
    }
  });

  el.btnCopyEntireNote.addEventListener('click', () => {
    const note = state.notes.find((n) => n.id === state.activeNoteId);
    if (!note) return;
    const plain = getEffectiveNotePlaintext(note);
    if (plain === null) {
      showToast('Unlock this encrypted note first to copy', false);
      return;
    }
    copyToClipboard(plain || note.title || '', `"${note.title}"`);
  });

  el.btnNoteHistory?.addEventListener('click', () => {
    el.noteMoreDropdown?.classList.add('hidden');
    openNoteVersionHistoryModal();
  });

  el.btnExportNoteMd?.addEventListener('click', () => {
    el.noteMoreDropdown?.classList.add('hidden');
    exportActiveNoteAsMarkdown();
  });

  el.btnExportWorkspaceJson?.addEventListener('click', () => {
    el.noteMoreDropdown?.classList.add('hidden');
    exportWorkspaceBackupAsJson();
  });

  el.btnRestoreNote?.addEventListener('click', async () => {
    el.noteMoreDropdown?.classList.add('hidden');
    const note = state.notes.find((n) => n.id === state.activeNoteId);
    if (!note) return;
    note.is_trashed = false;
    note.trashed_at = null;
    if (isValidUuid(note.id)) {
      await supabaseClient
        .from('notes')
        .update({ is_trashed: false, trashed_at: null, updated_at: new Date().toISOString() })
        .eq('id', note.id);
    }
    saveOfflineSnapshot();
    renderNotesList();
    selectNote(note.id);
    showToast(`Restored "${note.title}" from Trash`);
  });

  el.btnDeleteNote.addEventListener('click', async () => {
    el.noteMoreDropdown?.classList.add('hidden');
    if (!state.activeNoteId) return;
    const idToDelete = state.activeNoteId;
    const note = state.notes.find((n) => n.id === idToDelete);
    if (!note) return;

    // If not yet in Trash, soft-delete into Trash and save a revision snapshot first
    if (!note.is_trashed) {
      state.lastRevisionAtByNote.set(note.id, 0);
      await maybeSaveNoteRevisionSnapshot(note);
      const nowIso = new Date().toISOString();
      note.is_trashed = true;
      note.trashed_at = nowIso;
      if (isValidUuid(idToDelete)) {
        const { error } = await supabaseClient
          .from('notes')
          .update({ is_trashed: true, trashed_at: nowIso, updated_at: nowIso })
          .eq('id', idToDelete);
        if (error) {
          showToast(`Could not move to Trash: ${error.message}`, false);
          return;
        }
      }
      if (state.pinnedFloatingNoteIds.has(idToDelete)) {
        window.hoverpadDesktop?.closeNoteWindow(idToDelete);
        state.pinnedFloatingNoteIds.delete(idToDelete);
        updateFloatingNoteUIIndicators();
      }
      saveOfflineSnapshot();
      renderNotesList();
      const remaining = getFilteredNotes();
      selectNote(remaining[0]?.id || null);
      showToast('Moved note to Trash (Restorable from Trash filter)');
      return;
    }

    // If already in Trash, permanently delete
    if (isValidUuid(idToDelete)) {
      const { error } = await supabaseClient.from('notes').delete().eq('id', idToDelete);
      if (error) {
        showToast(`Delete failed: ${error.message}`, false);
        return;
      }
    }
    if (state.pinnedFloatingNoteIds.has(idToDelete)) {
      window.hoverpadDesktop?.closeNoteWindow(idToDelete);
      state.pinnedFloatingNoteIds.delete(idToDelete);
      updateFloatingNoteUIIndicators();
    }
    state.notes = state.notes.filter((n) => n.id !== idToDelete);
    state.unlockedNotesPlaintext.delete(idToDelete);
    state.unlockedNotesPassphrases.delete(idToDelete);
    saveOfflineSnapshot();
    renderNotesList();
    const remaining = getFilteredNotes();
    selectNote(remaining[0]?.id || null);
    showToast('Permanently deleted note');
  });

  // End-to-End Encryption (E2EE) Lock / Unlock Handlers
  el.btnE2eeNote?.addEventListener('click', async () => {
    el.noteMoreDropdown?.classList.add('hidden');
    const note = state.notes.find((n) => n.id === state.activeNoteId);
    if (!note) return;

    if (isEncryptedPayload(note.content)) {
      if (state.unlockedNotesPlaintext.has(note.id)) {
        const plain = state.unlockedNotesPlaintext.get(note.id);
        state.unlockedNotesPlaintext.delete(note.id);
        state.unlockedNotesPassphrases.delete(note.id);
        note.content = plain;
        updateE2eeToolbarButton(note);
        scheduleNoteSave({ content: plain });
        showToast('Removed E2EE lock from note');
      } else {
        el.e2eeUnlockPassphrase?.focus();
        showToast('Enter passphrase below to unlock note');
      }
    } else {
      el.e2eeSetPassphrase.value = '';
      openModal(el.modalE2eeLock);
      el.e2eeSetPassphrase.focus();
    }
  });

  el.formE2eeLock?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const note = state.notes.find((n) => n.id === state.activeNoteId);
    if (!note) return;
    const passphrase = el.e2eeSetPassphrase.value;
    if (!passphrase || passphrase.length < 4) return;

    const currentPlain = el.noteContentInput.value || '';
    const encrypted = await encryptNoteContent(currentPlain, passphrase);
    state.unlockedNotesPlaintext.set(note.id, currentPlain);
    state.unlockedNotesPassphrases.set(note.id, passphrase);
    note.content = encrypted;

    closeModals();
    updateE2eeToolbarButton(note);
    scheduleNoteSave({ content: currentPlain });
    showToast('Note encrypted with AES-GCM 256-bit E2EE');
  });

  async function tryUnlockActiveNote() {
    const note = state.notes.find((n) => n.id === state.activeNoteId);
    if (!note || !isEncryptedPayload(note.content)) return;
    const pass = el.e2eeUnlockPassphrase.value;
    if (!pass) return;
    try {
      const decrypted = await decryptNoteContent(note.content, pass);
      state.unlockedNotesPlaintext.set(note.id, decrypted);
      state.unlockedNotesPassphrases.set(note.id, pass);
      selectNote(note.id);
      syncFloatingNoteWindowIfOpen(note);
      showToast('Decrypted note locally in memory');
    } catch (_err) {
      showToast('Incorrect passphrase — decryption failed', false);
    }
  }

  el.btnE2eeUnlockSubmit?.addEventListener('click', tryUnlockActiveNote);
  el.e2eeUnlockPassphrase?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      tryUnlockActiveNote();
    }
  });

  // Subtabs: Live Editor vs Line-by-Line Quick Copy
  el.subtabEdit.addEventListener('click', () => setEditorMode('edit'));
  el.subtabSnippets.addEventListener('click', () => setEditorMode('snippets'));

  // Copy & Rotate Invite Code shortcuts
  el.inviteCodeStrip.addEventListener('click', () => {
    const code = el.currentProjectCode.textContent;
    if (code && code !== '--------') {
      copyToClipboard(code, 'Workspace Invite Code');
    }
  });

  el.btnModalCopyCode.addEventListener('click', () => {
    const code = el.modalInviteCodeDisplay.textContent;
    if (code && code !== '--------') {
      copyToClipboard(code, 'Workspace Invite Code');
    }
  });

  el.btnModalCopyInviteLink?.addEventListener('click', () => {
    const code = el.modalInviteCodeDisplay.textContent;
    if (code && code !== '--------') {
      const shareUrl = `https://hoverpad.vercel.app/src/index.html?join=${encodeURIComponent(code)}`;
      copyToClipboard(shareUrl, '1-Click Workspace Invite Link');
    }
  });

  el.formSnippetVars?.addEventListener('submit', (e) => {
    e.preventDefault();
    const pending = state.pendingVarSnippet;
    if (!pending) {
      closeModals();
      return;
    }
    const filledCommand = el.snippetVarsPreviewCode?.textContent || pending.lineText;
    closeModals();
    copyToClipboard(filledCommand, `${pending.label} (with variables)`, pending.isSecret);
  });

  el.btnRotateInviteCode?.addEventListener('click', rotateCurrentProjectInviteCode);
  el.btnModalRotateCode?.addEventListener('click', rotateCurrentProjectInviteCode);

  // Settings Modal Handlers
  el.topbarUserAvatar?.addEventListener('click', openSettingsModal);
  el.btnOpenSettings?.addEventListener('click', openSettingsModal);

  el.toggleSettingMaskSecrets?.addEventListener('change', (e) => {
    state.maskSecrets = e.target.checked;
    localStorage.setItem('hoverpad_mask_secrets', String(state.maskSecrets));
    const note = state.notes.find((n) => n.id === state.activeNoteId);
    const plain = getEffectiveNotePlaintext(note);
    if (plain !== null) renderSnippetsQuickCopy(plain);
    showToast(state.maskSecrets ? 'Secret auto-masking enabled' : 'Secret auto-masking disabled');
  });

  el.toggleSettingAutoclearClip?.addEventListener('change', (e) => {
    state.autoClearClipboard = e.target.checked;
    localStorage.setItem('hoverpad_autoclear_clip', String(state.autoClearClipboard));
    showToast(
      state.autoClearClipboard
        ? '30s clipboard auto-clear enabled for secrets'
        : 'Clipboard auto-clear disabled'
    );
  });

  el.toggleSettingCloseTray?.addEventListener('change', async (e) => {
    state.closeToTray = e.target.checked;
    if (window.hoverpadDesktop) {
      await window.hoverpadDesktop.toggleCloseToTray(state.closeToTray);
    }
    showToast(
      state.closeToTray ? 'Close button will minimize to tray' : 'Close button will quit app'
    );
  });

  el.toggleSettingStartup?.addEventListener('change', async (e) => {
    state.launchAtStartup = e.target.checked;
    if (window.hoverpadDesktop) {
      await window.hoverpadDesktop.toggleStartup(state.launchAtStartup);
    }
    showToast(
      state.launchAtStartup
        ? 'HoverPad will launch at Windows startup'
        : 'Removed from Windows startup'
    );
  });

  el.btnQuitHoverpadCompletely?.addEventListener('click', async () => {
    await flushPendingNoteSaveImmediate();
    if (window.hoverpadDesktop) {
      await window.hoverpadDesktop.quitApp();
    }
  });

  document.querySelectorAll('[data-close-modal]').forEach((btn) =>
    btn.addEventListener('click', closeModals)
  );

  el.btnNewProjectModal.addEventListener('click', () => {
    el.newProjectName.value = '';
    el.newProjectDesc.value = '';
    openModal(el.modalNewProject);
    el.newProjectName.focus();
  });

  el.btnOpenInviteModal.addEventListener('click', () => {
    el.inviteEmailInput.value = '';
    openModal(el.modalInviteUser);
    el.inviteEmailInput.focus();
  });

  el.btnJoinProjectModal.addEventListener('click', () => {
    el.joinCodeInput.value = '';
    openModal(el.modalJoinProject);
    el.joinCodeInput.focus();
  });

  // Form: Create Project
  el.formNewProject.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.user) return;
    const name = el.newProjectName.value.trim();
    const description = el.newProjectDesc.value.trim();
    if (!name) return;

    const { data: created, error } = await supabaseClient
      .from('projects')
      .insert({
        name,
        description,
        owner_id: state.user.id
      })
      .select()
      .single();

    if (error) {
      showToast(error.message, false);
      return;
    }

    await supabaseClient
      .from('project_members')
      .upsert(
        {
          project_id: created.id,
          user_id: state.user.id,
          role: 'owner',
          invited_by: state.user.id
        },
        { onConflict: 'project_id,user_id' }
      );

    closeModals();
    showToast(`Created workspace "${created.name}"`);
    await loadProjects(created.id);
    await createNewNote(
      'Staging Deploy & Endpoints',
      'docker compose -f docker-compose.staging.yml up -d --build\nhttps://staging-api.hoverpad.io/v2/health\nHP_STAGING_KEY=hp_live_98a7f2c4e1b04d3a99c1'
    );
  });

  // Form: Invite User by Email
  el.formInviteEmail.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.activeProjectId) return;
    const email = el.inviteEmailInput.value.trim();
    if (!email) return;

    const { data, error } = await supabaseClient.rpc('invite_user_by_email', {
      p_project_id: state.activeProjectId,
      p_email: email
    });

    if (error) {
      showToast(error.message, false);
      return;
    }

    el.inviteEmailInput.value = '';
    showToast(`Added ${data?.display_name || email} to workspace`);
    await loadProjectMembers(state.activeProjectId);
  });

  // Form: Join Project by Code
  el.formJoinProject.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = el.joinCodeInput.value.trim().toUpperCase();
    if (!code) return;

    const { data: joinedProjectId, error } = await supabaseClient.rpc('join_project_by_code', {
      p_invite_code: code,
      p_guest_id: isValidUuid(state.user?.id) ? state.user.id : null,
      p_guest_name: getDisplayName()
    });

    if (error) {
      showToast(error.message, false);
      return;
    }

    closeModals();
    showToast('Joined shared workspace!');
    await loadProjects(joinedProjectId);
  });

  // Keyboard shortcuts:
  // Ctrl+N (New Note), Ctrl+K or / (Focus search), Ctrl+Shift+P (Pin active note on screen), Alt+1..9 (Instant Copy Line 1..9)
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      createNewNote('New Note', '');
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      el.notesSearchInput.focus();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      if (state.activeNoteId) {
        togglePinIndividualNoteToScreen(state.activeNoteId);
      }
    } else if (e.altKey && /^[1-9]$/.test(e.key)) {
      const idx = parseInt(e.key, 10) - 1;
      const lineText = state.currentVisibleSnippets[idx];
      if (lineText) {
        e.preventDefault();
        const meta = classifySnippetLine(lineText);
        handleSmartSnippetCopy(lineText, `Line 0${idx + 1}`, meta.isSecret);
      }
    } else if (
      e.key === '/' &&
      document.activeElement !== el.notesSearchInput &&
      document.activeElement !== el.noteTitleInput &&
      document.activeElement !== el.noteContentInput &&
      document.activeElement?.tagName !== 'INPUT'
    ) {
      e.preventDefault();
      el.notesSearchInput.focus();
    }
  });
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// =====================================================================
// INITIALIZE APPLICATION
// =====================================================================
(async function initApp() {
  initWindowControls();
  initAuthHandlers();
  initWorkspaceHandlers();

  const { data } = await supabaseClient.auth.getSession();
  if (data?.session) {
    enforceProtectedRoute(data.session);
  } else if (localStorage.getItem('hoverpad_guest_active') === 'true') {
    enforceProtectedRoute(createLocalGuestSession());
  } else {
    enforceProtectedRoute(null);
  }
})();
