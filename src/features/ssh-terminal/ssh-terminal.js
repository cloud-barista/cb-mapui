/**
 * Interactive In-Browser Web SSH Terminal (xterm.js + CB-Tumblebug WebSocket PTY)
 * @module features/ssh-terminal
 */
import axios from 'axios';
import Swal from 'sweetalert2';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { tbApiBase, getConfig } from '../../core/api.js';
import { escapeHtml } from '../../core/utils.js';

const sessions = new Map(); // tabId -> session object
let activeTabId = null;
let tabSeq = 0;
let isMaximized = false;
let isMinimized = false;
let dockedHeightPx = 380;
let lastCopyAnnouncement = '';
let styleInjected = false;

function ensureTerminalStyles() {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.id = 'cb-ssh-terminal-styles';
  style.textContent = `
    #cb-ssh-terminal-dialog {
      position: fixed;
      inset-inline: 16px;
      inset-block-end: 12px;
      inset-block-start: auto;
      width: calc(100vw - 32px);
      max-width: 1480px;
      margin-inline: auto;
      margin-block: 0;
      padding: 0;
      border: 1px solid #334155;
      border-radius: 10px;
      background: #0f172a;
      color: #e2e8f0;
      box-shadow: 0 20px 48px rgba(2, 6, 23, 0.65);
      z-index: 12000;
      overflow: hidden;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    }
    /* Scope display strictly to [open] so native dialog.close() hides the element */
    #cb-ssh-terminal-dialog[open] {
      display: flex;
      flex-direction: column;
    }
    #cb-ssh-terminal-dialog.cb-term-maximized {
      inset: 12px;
      width: calc(100vw - 24px);
      max-width: none;
      height: calc(100vh - 24px) !important;
    }
    #cb-ssh-terminal-dialog.cb-term-minimized {
      height: auto !important;
      width: min(680px, calc(100vw - 32px));
      inset-inline-start: auto;
      inset-inline-end: 16px;
      margin-inline: 0;
    }
    #cb-ssh-terminal-dialog.cb-term-minimized .cb-term-tabs,
    #cb-ssh-terminal-dialog.cb-term-minimized .cb-term-body,
    #cb-ssh-terminal-dialog.cb-term-minimized .cb-term-resize-grip {
      display: none !important;
    }
    .cb-term-resize-grip {
      height: 5px;
      cursor: ns-resize;
      background: linear-gradient(90deg, transparent, rgba(148, 163, 184, 0.28), transparent);
      flex-shrink: 0;
    }
    .cb-term-resize-grip:hover {
      background: #38bdf8;
    }
    .cb-term-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 10px;
      background: #1e293b;
      border-bottom: 1px solid #334155;
      flex-shrink: 0;
      flex-wrap: wrap;
    }
    .cb-term-title-group {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    #cb-ssh-terminal-title {
      margin: 0;
      font-size: 13px;
      font-weight: 700;
      color: #f8fafc;
      white-space: nowrap;
    }
    .cb-term-conn-meta {
      font-size: 11.5px;
      color: #94a3b8;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 420px;
    }
    .cb-term-controls {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-wrap: wrap;
    }
    .cb-term-select, .cb-term-input {
      height: 26px;
      padding: 2px 7px;
      font-size: 12px;
      border-radius: 5px;
      border: 1px solid #475569;
      background: #0f172a;
      color: #f8fafc;
    }
    .cb-term-input {
      width: 84px;
    }
    .cb-term-btn {
      min-inline-size: 26px;
      min-block-size: 26px;
      padding-inline: 8px;
      padding-block: 3px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 5px;
      border: 1px solid #475569;
      background: #0f172a;
      color: #e2e8f0;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      line-height: 1.1;
      transition: background 0.12s ease, border-color 0.12s ease;
    }
    .cb-term-btn:hover {
      background: #334155;
      border-color: #64748b;
    }
    .cb-term-btn.primary {
      background: #0284c7;
      border-color: #0284c7;
      color: #ffffff;
    }
    .cb-term-btn.primary:hover {
      background: #0369a1;
    }
    .cb-term-btn.danger:hover {
      background: #dc2626;
      border-color: #dc2626;
      color: #ffffff;
    }
    .cb-term-copy-status {
      font-size: 11px;
      color: #4ade80;
      min-inline-size: 0;
      padding-inline: 2px;
      white-space: nowrap;
    }
    .cb-term-tabs {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px 0;
      background: #0b1120;
      border-bottom: 1px solid #1e293b;
      overflow-x: auto;
      flex-shrink: 0;
    }
    .cb-term-tab {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      font-size: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: #94a3b8;
      background: #162032;
      border: 1px solid #1e293b;
      border-bottom: none;
      border-radius: 6px 6px 0 0;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }
    .cb-term-tab.active {
      color: #f8fafc;
      background: #0f172a;
      border-color: #38bdf8;
      font-weight: 700;
    }
    .cb-term-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      background: #eab308;
    }
    .cb-term-dot.connected { background: #22c55e; }
    .cb-term-dot.closed    { background: #ef4444; }
    .cb-term-tab-close {
      min-inline-size: 18px;
      min-block-size: 18px;
      padding: 0 3px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: #94a3b8;
      font-size: 13px;
      line-height: 1;
      cursor: pointer;
    }
    .cb-term-tab-close:hover {
      background: rgba(239, 68, 68, 0.25);
      color: #fca5a5;
    }
    .cb-term-body {
      flex: 1 1 auto;
      position: relative;
      background: #090d16;
      min-height: 180px;
      overflow: hidden;
    }
    .cb-term-pane {
      position: absolute;
      inset: 6px 8px;
      display: none;
    }
    .cb-term-pane.active {
      display: block;
    }
  `;
  document.head.appendChild(style);
}

function getOrCreateDialog() {
  ensureTerminalStyles();
  let dlg = document.getElementById('cb-ssh-terminal-dialog');
  if (dlg) return dlg;

  dlg = document.createElement('dialog');
  dlg.id = 'cb-ssh-terminal-dialog';
  dlg.setAttribute('aria-labelledby', 'cb-ssh-terminal-title');
  dlg.style.height = `${dockedHeightPx}px`;

  dlg.innerHTML = `
    <div class="cb-term-resize-grip" id="cb-term-resize-grip" title="Drag to resize terminal height"></div>
    <div class="cb-term-header">
      <div class="cb-term-title-group">
        <h2 id="cb-ssh-terminal-title">🖥️ Web SSH Terminal</h2>
        <span class="cb-term-conn-meta" id="cb-term-conn-meta"></span>
      </div>
      <div class="cb-term-controls">
        <select id="cb-term-node-picker" class="cb-term-select" aria-label="Select node to open terminal">
          <option value="">+ Select Node…</option>
        </select>
        <input id="cb-term-user-input" type="text" class="cb-term-input" placeholder="user (auto)" title="Optional SSH login user override (e.g. root, ubuntu, cb-user)" aria-label="SSH username override" />
        <button type="button" class="cb-term-btn primary" id="cb-term-open-picked-btn" title="Open new SSH tab for selected node">+ Connect</button>
        <button type="button" class="cb-term-btn" id="cb-term-reconnect-btn" title="Reconnect active session">↻ Reconnect</button>
        <button type="button" class="cb-term-btn" id="cb-term-copy-btn">📋 Copy</button>
        <span id="cb-term-copy-status" class="cb-term-copy-status" role="status"></span>
        <button type="button" class="cb-term-btn" id="cb-term-paste-btn">📥 Paste</button>
        <button type="button" class="cb-term-btn" id="cb-term-clear-btn">🧹 Clear</button>
        <button type="button" class="cb-term-btn" id="cb-term-min-btn" aria-label="Minimize terminal">➖</button>
        <button type="button" class="cb-term-btn" id="cb-term-max-btn" aria-label="Maximize or restore terminal">⬜</button>
        <button type="button" class="cb-term-btn danger" id="cb-term-close-all-btn" aria-label="Close all SSH terminal sessions">✕</button>
      </div>
    </div>
    <div class="cb-term-tabs" id="cb-term-tabs"></div>
    <div class="cb-term-body" id="cb-term-body"></div>
  `;

  document.body.appendChild(dlg);

  // Wire header controls
  document.getElementById('cb-term-open-picked-btn').addEventListener('click', () => {
    const picker = document.getElementById('cb-term-node-picker');
    const userOverride = (document.getElementById('cb-term-user-input')?.value || '').trim();
    if (!picker || !picker.value) return;
    const [ns, inf, nd] = picker.value.split('::');
    if (ns && inf && nd) {
      openNodeSession(ns, inf, nd, userOverride);
    }
  });

  document.getElementById('cb-term-reconnect-btn').addEventListener('click', () => {
    if (!activeTabId || !sessions.has(activeTabId)) return;
    const s = sessions.get(activeTabId);
    const userOverride = (document.getElementById('cb-term-user-input')?.value || '').trim();
    if (userOverride) s.userName = userOverride;
    connectSessionWebSocket(s);
  });

  document.getElementById('cb-term-copy-btn').addEventListener('click', async () => {
    const s = activeTabId ? sessions.get(activeTabId) : null;
    const sel = s?.term?.getSelection() || '';
    if (!sel) {
      announceCopyStatus('Select text in terminal first');
      return;
    }
    try {
      await navigator.clipboard.writeText(sel);
      announceCopyStatus('Copied!');
    } catch {
      announceCopyStatus('Clipboard blocked');
    }
  });

  document.getElementById('cb-term-paste-btn').addEventListener('click', async () => {
    const s = activeTabId ? sessions.get(activeTabId) : null;
    if (!s || !s.ws || s.ws.readyState !== WebSocket.OPEN) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        s.ws.send(JSON.stringify({ type: 'input', data: text }));
        s.term.focus();
      }
    } catch {
      announceCopyStatus('Use Ctrl+Shift+V to paste');
    }
  });

  document.getElementById('cb-term-clear-btn').addEventListener('click', () => {
    const s = activeTabId ? sessions.get(activeTabId) : null;
    if (s?.term) {
      s.term.clear();
      s.term.focus();
    }
  });

  document.getElementById('cb-term-min-btn').addEventListener('click', () => {
    isMinimized = !isMinimized;
    if (isMinimized) isMaximized = false;
    syncDialogLayout();
  });

  document.getElementById('cb-term-max-btn').addEventListener('click', () => {
    isMaximized = !isMaximized;
    if (isMaximized) isMinimized = false;
    syncDialogLayout();
  });

  document.getElementById('cb-term-close-all-btn').addEventListener('click', () => {
    closeAllTerminalSessions();
  });

  // Vertical drag-to-resize grip
  const grip = document.getElementById('cb-term-resize-grip');
  grip.addEventListener('pointerdown', (ev) => {
    if (isMaximized || isMinimized) return;
    ev.preventDefault();
    const startY = ev.clientY;
    const startH = dlg.getBoundingClientRect().height;
    const onMove = (me) => {
      const nextH = Math.min(window.innerHeight - 36, Math.max(220, startH + (startY - me.clientY)));
      dockedHeightPx = Math.round(nextH);
      dlg.style.height = `${dockedHeightPx}px`;
      fitActiveSession();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      fitActiveSession();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  window.addEventListener('resize', () => fitActiveSession());

  return dlg;
}

function announceCopyStatus(text) {
  const statusEl = document.getElementById('cb-term-copy-status');
  if (!statusEl) return;
  let msg = text;
  if (msg === lastCopyAnnouncement) msg += '\u00A0';
  lastCopyAnnouncement = msg;
  statusEl.textContent = msg;
  clearTimeout(statusEl._clearTimer);
  statusEl._clearTimer = setTimeout(() => {
    statusEl.textContent = '';
  }, 2000);
}

function syncDialogLayout() {
  const dlg = document.getElementById('cb-ssh-terminal-dialog');
  if (!dlg) return;
  dlg.classList.toggle('cb-term-maximized', isMaximized);
  dlg.classList.toggle('cb-term-minimized', isMinimized);
  if (!isMaximized && !isMinimized) {
    dlg.style.height = `${dockedHeightPx}px`;
  }
  const maxBtn = document.getElementById('cb-term-max-btn');
  if (maxBtn) maxBtn.textContent = isMaximized ? '🗗' : '⬜';
  if (!isMinimized) {
    requestAnimationFrame(() => fitActiveSession());
  }
}

function fitActiveSession() {
  if (!activeTabId || isMinimized) return;
  const s = sessions.get(activeTabId);
  if (!s || !s.fitAddon) return;
  try {
    s.fitAddon.fit();
    if (s.ws && s.ws.readyState === WebSocket.OPEN) {
      s.ws.send(JSON.stringify({ type: 'resize', cols: s.term.cols, rows: s.term.rows }));
    }
  } catch {
    // Ignore transient layout exceptions when hidden
  }
}

function decodeBase64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function buildWsBaseUrl() {
  const apiBase = tbApiBase().replace(/\/+$/, '');
  if (/^https:\/\//i.test(apiBase)) {
    return apiBase.replace(/^https:\/\//i, 'wss://');
  }
  if (/^http:\/\//i.test(apiBase)) {
    return apiBase.replace(/^http:\/\//i, 'ws://');
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${apiBase.startsWith('/') ? '' : '/'}${apiBase}`;
}

async function refreshNodePicker(nsId, infraId, selectedNodeId = '') {
  const picker = document.getElementById('cb-term-node-picker');
  if (!picker || !nsId || !infraId) return;
  const cfg = getConfig();
  try {
    const res = await axios.get(
      `${tbApiBase()}/ns/${encodeURIComponent(nsId)}/infra/${encodeURIComponent(infraId)}`,
      { auth: { username: cfg.username, password: cfg.password } }
    );
    const nodes = res.data?.node || res.data?.vm || [];
    const options = [`<option value="">+ Node in ${escapeHtml(infraId)} (${nodes.length})…</option>`];
    nodes.forEach((nd) => {
      const nid = nd.id || '';
      if (!nid) return;
      const ip = nd.publicIP || nd.privateIP || 'no-ip';
      const val = `${nsId}::${infraId}::${nid}`;
      const sel = nid === selectedNodeId ? ' selected' : '';
      options.push(`<option value="${escapeHtml(val)}"${sel}>${escapeHtml(nid)} (${escapeHtml(ip)})</option>`);
    });
    picker.innerHTML = options.join('');
  } catch {
    // Non-fatal if infra fetch fails
  }
}

function updateHeaderMeta() {
  const metaEl = document.getElementById('cb-term-conn-meta');
  if (!metaEl) return;
  const s = activeTabId ? sessions.get(activeTabId) : null;
  if (!s) {
    metaEl.textContent = '';
    return;
  }
  const parts = [`${s.nsId}/${s.infraId}/${s.nodeId}`];
  if (s.connectedUser && s.connectedEndpoint) {
    parts.push(`${s.connectedUser}@${s.connectedEndpoint}`);
  }
  if (s.viaBastion) {
    parts.push(`via ${s.viaBastion}`);
  }
  metaEl.textContent = parts.join(' · ');
}

function renderTabs() {
  const tabsEl = document.getElementById('cb-term-tabs');
  if (!tabsEl) return;
  tabsEl.innerHTML = '';
  for (const [id, s] of sessions.entries()) {
    const tab = document.createElement('div');
    tab.className = `cb-term-tab${id === activeTabId ? ' active' : ''}`;
    const dotClass = s.state === 'connected' ? 'connected' : (s.state === 'closed' ? 'closed' : '');
    const userBadge = s.userName ? `${s.userName}@` : '';
    tab.innerHTML = `
      <span class="cb-term-dot ${dotClass}"></span>
      <span>${escapeHtml(userBadge + s.nodeId)}</span>
    `;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'cb-term-tab-close';
    closeBtn.setAttribute('aria-label', `Close terminal tab ${s.nodeId}`);
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      closeTerminalTab(id);
    });
    tab.appendChild(closeBtn);
    tab.addEventListener('click', () => activateTab(id));
    tabsEl.appendChild(tab);
  }
  updateHeaderMeta();
}

function activateTab(tabId) {
  if (!sessions.has(tabId)) return;
  activeTabId = tabId;
  for (const [id, s] of sessions.entries()) {
    s.paneEl.classList.toggle('active', id === tabId);
  }
  renderTabs();
  requestAnimationFrame(() => {
    fitActiveSession();
    sessions.get(tabId)?.term?.focus();
  });
}

function closeTerminalTab(tabId) {
  const s = sessions.get(tabId);
  if (!s) return;
  clearInterval(s.pingTimer);
  if (s.resizeObserver) s.resizeObserver.disconnect();
  if (s.ws) {
    try { s.ws.close(); } catch { /* ignore */ }
  }
  if (s.term) {
    try { s.term.dispose(); } catch { /* ignore */ }
  }
  s.paneEl?.remove();
  sessions.delete(tabId);

  if (sessions.size === 0) {
    activeTabId = null;
    const dlg = document.getElementById('cb-ssh-terminal-dialog');
    if (dlg?.open) dlg.close();
    return;
  }
  if (activeTabId === tabId) {
    const nextId = Array.from(sessions.keys()).pop();
    activateTab(nextId);
  } else {
    renderTabs();
  }
}

function closeAllTerminalSessions() {
  for (const id of Array.from(sessions.keys())) {
    const s = sessions.get(id);
    if (!s) continue;
    clearInterval(s.pingTimer);
    if (s.resizeObserver) s.resizeObserver.disconnect();
    try { s.ws?.close(); } catch { /* ignore */ }
    try { s.term?.dispose(); } catch { /* ignore */ }
    s.paneEl?.remove();
  }
  sessions.clear();
  activeTabId = null;
  const dlg = document.getElementById('cb-ssh-terminal-dialog');
  if (dlg?.open) dlg.close();
}

async function connectSessionWebSocket(session) {
  clearInterval(session.pingTimer);
  if (session.ws) {
    try { session.ws.close(); } catch { /* ignore */ }
    session.ws = null;
  }

  session.state = 'connecting';
  renderTabs();

  const { term, nsId, infraId, nodeId, userName } = session;
  term.writeln(`\x1b[36m▶ Requesting SSH terminal ticket for ${nsId}/${infraId}/${nodeId}${userName ? ` (user: ${userName})` : ''}...\x1b[0m`);

  const cfg = getConfig();
  let ticket = '';
  try {
    const res = await axios.post(
      `${tbApiBase()}/ns/${encodeURIComponent(nsId)}/infra/${encodeURIComponent(infraId)}/node/${encodeURIComponent(nodeId)}/terminal/ticket`,
      userName ? { userName } : {},
      { auth: { username: cfg.username, password: cfg.password } }
    );
    ticket = res.data?.ticket || '';
  } catch (err) {
    const msg = err?.response?.data?.message || err?.message || String(err);
    session.state = 'closed';
    renderTabs();
    term.writeln(`\x1b[31m✖ Failed to obtain terminal ticket: ${msg}\x1b[0m`);
    return;
  }

  if (!ticket) {
    session.state = 'closed';
    renderTabs();
    term.writeln('\x1b[31m✖ Server returned an empty terminal ticket.\x1b[0m');
    return;
  }

  try { session.fitAddon.fit(); } catch { /* ignore */ }
  const cols = term.cols || 100;
  const rows = term.rows || 30;
  const wsUrl = `${buildWsBaseUrl()}/ws/terminal?ticket=${encodeURIComponent(ticket)}&cols=${cols}&rows=${rows}`;

  const ws = new WebSocket(wsUrl);
  session.ws = ws;

  ws.addEventListener('open', () => {
    session.pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);
  });

  ws.addEventListener('message', (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    switch (msg.type) {
      case 'status':
        term.writeln(`\x1b[90m  ${msg.message}\x1b[0m`);
        break;
      case 'connected':
        session.state = 'connected';
        session.connectedUser = msg.user || '';
        session.connectedEndpoint = msg.endpoint || '';
        session.viaBastion = msg.viaBastion || '';
        renderTabs();
        term.writeln(`\x1b[32m✔ Connected to ${session.connectedUser}@${session.connectedEndpoint}${session.viaBastion ? ` (via bastion ${session.viaBastion})` : ''}\x1b[0m\r\n`);
        fitActiveSession();
        term.focus();
        break;
      case 'output':
        if (msg.data) {
          term.write(decodeBase64ToBytes(msg.data));
        }
        break;
      case 'error':
        session.state = 'closed';
        renderTabs();
        term.writeln(`\r\n\x1b[31m✖ SSH Error: ${msg.message}\x1b[0m`);
        break;
      case 'exit':
        session.state = 'closed';
        renderTabs();
        term.writeln(`\r\n\x1b[33m■ ${msg.message || 'Session ended.'} (Click "↻ Reconnect" to open again)\x1b[0m`);
        break;
      default:
        break;
    }
  });

  ws.addEventListener('close', () => {
    clearInterval(session.pingTimer);
    if (session.state !== 'closed') {
      session.state = 'closed';
      renderTabs();
      term.writeln('\r\n\x1b[90m[Connection closed]\x1b[0m');
    }
  });

  ws.addEventListener('error', () => {
    if (session.state !== 'closed') {
      session.state = 'closed';
      renderTabs();
      term.writeln('\r\n\x1b[31m✖ WebSocket connection error.\x1b[0m');
    }
  });
}

function openNodeSession(nsId, infraId, nodeId, userName = '') {
  const dlg = getOrCreateDialog();
  isMinimized = false;
  if (!dlg.open) {
    // Non-modal show() keeps MapUI interactive behind the docked console and ensures
    // Esc inside vim/htop goes directly to xterm.js instead of closing the dialog.
    dlg.show();
  }
  syncDialogLayout();
  refreshNodePicker(nsId, infraId, nodeId);

  const tabId = `term-${++tabSeq}`;
  const paneEl = document.createElement('div');
  paneEl.className = 'cb-term-pane';
  document.getElementById('cb-term-body').appendChild(paneEl);

  const term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Mono', Menlo, Monaco, Consolas, monospace",
    scrollback: 5000,
    allowProposedApi: false,
    theme: {
      background: '#090d16',
      foreground: '#e2e8f0',
      cursor: '#38bdf8',
      selectionBackground: 'rgba(56, 189, 248, 0.32)',
    },
  });
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(paneEl);

  // Support Ctrl+Shift+C copy & Ctrl+Shift+V paste cleanly on Windows/Linux
  term.attachCustomKeyEventHandler((ev) => {
    if (ev.type === 'keydown' && ev.ctrlKey && ev.shiftKey && ev.code === 'KeyC') {
      const sel = term.getSelection();
      if (sel) navigator.clipboard.writeText(sel).catch(() => {});
      return false;
    }
    return true;
  });

  const session = {
    id: tabId,
    nsId,
    infraId,
    nodeId,
    userName,
    state: 'connecting',
    connectedUser: '',
    connectedEndpoint: '',
    viaBastion: '',
    term,
    fitAddon,
    paneEl,
    ws: null,
    pingTimer: null,
    resizeObserver: null,
  };

  term.onData((data) => {
    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: 'input', data }));
    }
  });

  term.onResize(({ cols, rows }) => {
    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  });

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      if (activeTabId === tabId && !isMinimized) {
        requestAnimationFrame(() => fitActiveSession());
      }
    });
    ro.observe(paneEl);
    session.resizeObserver = ro;
  }

  sessions.set(tabId, session);
  activateTab(tabId);
  connectSessionWebSocket(session);
}

/**
 * Opens an interactive Web SSH Terminal.
 * - If both infraId and nodeId are passed (e.g. from Infra Status or Access Info row), connects immediately.
 * - Otherwise inspects current Infra/Node selection in MapUI and prompts with a clean Node selector if needed.
 */
export async function openSshTerminal(explicitInfraId = '', explicitNodeId = '', explicitUserName = '') {
  const cfg = getConfig();
  const nsId = cfg.namespace || window.configNamespace || 'default';
  const infraId = explicitInfraId
    || (window.getSelectedInfraId ? window.getSelectedInfraId() : '')
    || document.getElementById('infraid')?.value
    || '';

  if (!infraId) {
    Swal.fire({
      icon: 'warning',
      title: 'Select an Infra first',
      text: 'Choose an Infra in MC-Infra Control (or click a node in Infra Status) to open an SSH terminal.',
    });
    return;
  }

  let nodeId = explicitNodeId || '';
  if (!nodeId) {
    const sidebarNode = document.getElementById('nodeid')?.value || '';
    if (sidebarNode && sidebarNode.toLowerCase() !== 'all' && sidebarNode !== '') {
      nodeId = sidebarNode;
    }
  }

  if (nodeId) {
    openNodeSession(nsId, infraId, nodeId, explicitUserName);
    return;
  }

  // No specific node selected yet: fetch nodes of infraId and let the user pick one
  try {
    const res = await axios.get(
      `${tbApiBase()}/ns/${encodeURIComponent(nsId)}/infra/${encodeURIComponent(infraId)}`,
      { auth: { username: cfg.username, password: cfg.password } }
    );
    const nodes = res.data?.node || res.data?.vm || [];
    if (nodes.length === 0) {
      Swal.fire({ icon: 'info', title: 'No Nodes Found', text: `Infra "${infraId}" has no VM nodes.` });
      return;
    }
    if (nodes.length === 1) {
      openNodeSession(nsId, infraId, nodes[0].id, explicitUserName);
      return;
    }

    const optsHtml = nodes.map((nd) => {
      const ip = nd.publicIP ? `Pub: ${nd.publicIP}` : `Priv: ${nd.privateIP || '-'} (Bastion)`;
      const csp = nd.connectionConfig?.providerName || nd.connectionName || '';
      const st = nd.status || '';
      return `<option value="${escapeHtml(nd.id)}">${escapeHtml(nd.id)} — ${escapeHtml(ip)} [${escapeHtml(csp)} · ${escapeHtml(st)}]</option>`;
    }).join('');

    const pick = await Swal.fire({
      title: `🖥️ Open Web SSH Terminal (${escapeHtml(infraId)})`,
      html: `
        <div style="text-align:left;font-size:13px;">
          <label for="swal-ssh-node" style="font-weight:600;display:block;margin-bottom:4px;">Target Node</label>
          <select id="swal-ssh-node" class="swal2-input" style="width:100%;margin:0 0 12px;height:38px;font-size:13px;">
            ${optsHtml}
          </select>
          <label for="swal-ssh-user" style="font-weight:600;display:block;margin-bottom:4px;">SSH User <span style="font-weight:400;color:#64748b;">(leave blank for node default)</span></label>
          <input id="swal-ssh-user" class="swal2-input" style="width:100%;margin:0;height:36px;font-size:13px;" placeholder="auto (e.g. cb-user / ubuntu / root)" />
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Connect Terminal',
      preConfirm: () => ({
        nodeId: document.getElementById('swal-ssh-node')?.value || '',
        userName: (document.getElementById('swal-ssh-user')?.value || '').trim(),
      }),
    });

    if (pick.isConfirmed && pick.value?.nodeId) {
      openNodeSession(nsId, infraId, pick.value.nodeId, pick.value.userName);
    }
  } catch (err) {
    const msg = err?.response?.data?.message || err?.message || String(err);
    Swal.fire({ icon: 'error', title: 'Failed to load Infra nodes', text: msg });
  }
}

window.openSshTerminal = openSshTerminal;
window.closeAllTerminalSessions = closeAllTerminalSessions;
