/**
 * HoverPad — Dedicated Floating Pinned Note Window Controller
 * Only individual pinned notes float Always-On-Top of the screen
 */

const floatState = {
  noteId: null,
  title: '',
  content: '',
  projectName: 'Workspace',
  theme: 'light',
  mode: 'snippets', // 'snippets' | 'edit'
  maskSecrets: true,
  revealedSecrets: new Set(),
  lines: [],
  editTimer: null
};

const fel = {
  projectName: document.getElementById('float-project-name'),
  opacitySlider: document.getElementById('float-opacity-slider'),
  btnOpenMain: document.getElementById('btn-float-open-main'),
  btnClose: document.getElementById('btn-float-close'),
  titleInput: document.getElementById('float-note-title'),
  btnCopyAll: document.getElementById('btn-float-copy-all'),
  tabSnippets: document.getElementById('float-tab-snippets'),
  tabEdit: document.getElementById('float-tab-edit'),
  btnPasteLine: document.getElementById('btn-float-paste-line'),
  snippetsView: document.getElementById('float-snippets-view'),
  textarea: document.getElementById('float-content-textarea'),
  statusText: document.getElementById('float-status-text'),
  toastContainer: document.getElementById('toast-container')
};

function showFloatToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast success';
  t.innerHTML = `
    <span class="material-symbols-outlined" style="font-size:14px;color:var(--emerald-dot)">check_circle</span>
    <span>${escapeHtml(msg)}</span>
  `;
  fel.toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 1900);
}

function applyFloatTheme(theme) {
  floatState.theme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.classList.toggle('theme-dark', floatState.theme === 'dark');
  document.documentElement.classList.toggle('theme-light', floatState.theme === 'light');
}

function setFloatMode(mode) {
  floatState.mode = mode;
  const isSnippets = mode === 'snippets';
  fel.tabSnippets.classList.toggle('active', isSnippets);
  fel.tabEdit.classList.toggle('active', !isSnippets);
  fel.snippetsView.classList.toggle('hidden', !isSnippets);
  fel.textarea.classList.toggle('hidden', isSnippets);
  if (isSnippets) {
    renderFloatSnippets();
  }
}

function classifyLine(lineText) {
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

function maskSecretValue(lineText) {
  const eqIdx = lineText.indexOf('=');
  const colonIdx = lineText.indexOf(':');
  const splitIdx = eqIdx !== -1 ? eqIdx : colonIdx;
  if (splitIdx !== -1 && splitIdx < 45) {
    return `${lineText.slice(0, splitIdx + 1)}••••••••••••`;
  }
  return '••••••••••••';
}

function renderFloatSnippets() {
  fel.snippetsView.innerHTML = '';
  const lines = String(floatState.content || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  floatState.lines = lines;

  if (lines.length === 0) {
    fel.snippetsView.innerHTML = `
      <div style="color:var(--text-dim);font-size:11.5px;text-align:center;padding:22px 10px;">
        Empty note. Click <strong>Edit</strong> or <strong>+ Paste</strong> to add copyable lines.
      </div>
    `;
    return;
  }

  lines.forEach((lineText, idx) => {
    const numStr = String(idx + 1).padStart(2, '0');
    const meta = classifyLine(lineText);
    const isRevealed = floatState.revealedSecrets.has(idx);
    const shouldMask = meta.isSecret && floatState.maskSecrets && !isRevealed;
    const displayStr = shouldMask ? maskSecretValue(lineText) : lineText;

    const row = document.createElement('div');
    row.className = 'snippet-line-item';
    row.style.padding = '7px 10px';
    row.innerHTML = `
      <div class="snippet-line-left">
        <span class="snippet-line-num">${numStr}</span>
        <span class="material-symbols-outlined snippet-type-icon">${meta.icon}</span>
        <code class="snippet-line-text ${meta.cssClass}">${escapeHtml(displayStr)}</code>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0;">
        ${
          meta.isSecret && floatState.maskSecrets
            ? `<button type="button" class="note-card-copy-btn" data-peek="${idx}">
                 <span class="material-symbols-outlined" style="font-size:12px;">${isRevealed ? 'visibility_off' : 'visibility'}</span>
               </button>`
            : ''
        }
        <button type="button" class="note-card-copy-btn">
          <span class="material-symbols-outlined" style="font-size:12px;">content_copy</span>
          <span>Copy</span>
        </button>
      </div>
    `;

    const peekBtn = row.querySelector('[data-peek]');
    if (peekBtn) {
      peekBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (floatState.revealedSecrets.has(idx)) floatState.revealedSecrets.delete(idx);
        else floatState.revealedSecrets.add(idx);
        renderFloatSnippets();
      });
    }

    row.addEventListener('click', async () => {
      if (window.hoverpadDesktop) {
        await window.hoverpadDesktop.copyText(lineText);
      } else {
        await navigator.clipboard.writeText(lineText);
      }
      showFloatToast(`Copied Line ${numStr}`);
    });

    fel.snippetsView.appendChild(row);
  });
}

function emitEditToMain() {
  if (!floatState.noteId) return;
  fel.statusText.textContent = 'Syncing...';
  if (floatState.editTimer) clearTimeout(floatState.editTimer);
  floatState.editTimer = setTimeout(async () => {
    const editPayload = {
      id: floatState.noteId,
      title: fel.titleInput.value,
      content: fel.textarea.value
    };
    if (window.hoverpadDesktop) {
      await window.hoverpadDesktop.sendFloatingNoteEdit(editPayload);
    } else {
      window.parent?.opener?.postMessage({ type: 'note-pad:edit', payload: editPayload }, '*');
      window.opener?.postMessage({ type: 'note-pad:edit', payload: editPayload }, '*');
    }
    fel.statusText.textContent = 'Live synced with workspace';
  }, 220);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function applyIncomingPayload(payload) {
  if (!payload) return;
  floatState.noteId = payload.id;
  floatState.projectName = payload.projectName || 'Workspace';
  floatState.maskSecrets = payload.maskSecrets !== false;
  if (payload.theme) applyFloatTheme(payload.theme);
  fel.projectName.textContent = floatState.projectName;

  if (document.activeElement !== fel.titleInput) {
    floatState.title = payload.title || '';
    fel.titleInput.value = floatState.title;
  }
  if (document.activeElement !== fel.textarea) {
    floatState.content = payload.content || '';
    fel.textarea.value = floatState.content;
    renderFloatSnippets();
  }
}

(function initFloatingNote() {
  if (window.hoverpadDesktop) {
    window.hoverpadDesktop.onFloatingNoteData(applyIncomingPayload);
    window.hoverpadDesktop.onFloatingNoteTheme((theme) => {
      applyFloatTheme(theme);
    });
  }

  // Also support Browser Document Picture-in-Picture / Web postMessage bridge
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'note-pad:data') {
      applyIncomingPayload(e.data.payload);
    } else if (e.data?.type === 'note-pad:theme') {
      applyFloatTheme(e.data.theme);
    }
  });

  fel.opacitySlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (window.hoverpadDesktop) {
      window.hoverpadDesktop.setFloatingNoteOpacity(val);
    } else {
      document.body.style.opacity = String(val);
    }
  });

  fel.btnOpenMain.addEventListener('click', () => {
    if (window.hoverpadDesktop) {
      window.hoverpadDesktop.focusMainWorkspace(floatState.noteId);
    } else {
      (window.parent?.opener || window.opener)?.focus?.();
    }
  });

  fel.btnClose.addEventListener('click', () => {
    if (window.hoverpadDesktop) {
      window.hoverpadDesktop.close();
    } else {
      (window.parent !== window ? window.parent : window).close();
    }
  });

  fel.tabSnippets.addEventListener('click', () => setFloatMode('snippets'));
  fel.tabEdit.addEventListener('click', () => setFloatMode('edit'));

  fel.titleInput.addEventListener('input', () => {
    floatState.title = fel.titleInput.value;
    emitEditToMain();
  });

  fel.textarea.addEventListener('input', () => {
    floatState.content = fel.textarea.value;
    renderFloatSnippets();
    emitEditToMain();
  });

  fel.btnCopyAll.addEventListener('click', async () => {
    const text = floatState.content || floatState.title || '';
    if (window.hoverpadDesktop) {
      await window.hoverpadDesktop.copyText(text);
    } else {
      await navigator.clipboard.writeText(text);
    }
    showFloatToast('Copied entire note');
  });

  fel.btnPasteLine.addEventListener('click', async () => {
    const clip = window.hoverpadDesktop
      ? await window.hoverpadDesktop.readClipboard()
      : await navigator.clipboard.readText();
    if (!clip || !clip.trim()) return;
    const next = floatState.content
      ? `${floatState.content.trimEnd()}\n${clip.trim()}`
      : clip.trim();
    floatState.content = next;
    fel.textarea.value = next;
    renderFloatSnippets();
    emitEditToMain();
    showFloatToast('Appended clipboard line');
  });

  window.addEventListener('keydown', async (e) => {
    if (e.altKey && /^[1-9]$/.test(e.key)) {
      const idx = parseInt(e.key, 10) - 1;
      const line = floatState.lines[idx];
      if (line) {
        e.preventDefault();
        if (window.hoverpadDesktop) {
          await window.hoverpadDesktop.copyText(line);
        } else {
          await navigator.clipboard.writeText(line);
        }
        showFloatToast(`Copied Line 0${idx + 1}`);
      }
    }
  });
})();
