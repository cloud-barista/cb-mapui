/**
 * Notifier (ntfy) Management Feature Module
 * Create or register the ntfy notification channel CB-Tumblebug subscribes to,
 * manage read-only subscriber accounts, and publish/inspect messages.
 * @module features/notifier/notifier-mgr
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import { tbApiBase, getConfig } from '../../core/api.js';
import { escapeHtml } from '../../core/utils.js';

const esc = (v) => escapeHtml(v == null ? '' : String(v));
const auth = () => { const c = getConfig(); return { auth: { username: c.username, password: c.password } }; };
const api = () => `${tbApiBase()}/notifier`;
const errMsg = (e) => e?.response?.data?.message || e?.message || String(e);

const STYLES = `
<style>
  .ntfy-root { text-align: left; font-size: 13px; }
  .ntfy-card { border: 1px solid #dee2e6; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; background: #fff; }
  .ntfy-card h4 { font-size: 14px; margin: 0 0 10px; font-weight: 600; color: #333; }
  .ntfy-kv { display: grid; grid-template-columns: 140px 1fr; gap: 4px 10px; font-size: 12.5px; }
  .ntfy-kv dt { color: #6c757d; } .ntfy-kv dd { margin: 0; word-break: break-all; font-family: monospace; }
  .ntfy-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 10px; }
  .ntfy-input { font-size: 12.5px; padding: 6px 8px; border: 1px solid #ced4da; border-radius: 4px; }
  .ntfy-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; color: #fff; }
  .ntfy-ok { background: #28a745; } .ntfy-err { background: #dc3545; } .ntfy-muted { background: #6c757d; }
  .ntfy-note { font-size: 12px; color: #555; background: #f8f9fa; border-radius: 6px; padding: 8px 10px; margin-top: 8px; }
  .ntfy-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .ntfy-table th, .ntfy-table td { border: 1px solid #e9ecef; padding: 4px 6px; text-align: left; vertical-align: top; }
  .ntfy-table td.mono { font-family: monospace; word-break: break-all; }
  .ntfy-result { background: #e8f4ff; border: 1px solid #b8daff; border-radius: 6px; padding: 10px; margin-top: 10px; font-size: 12.5px; }
  .ntfy-result code { background: #fff; padding: 1px 4px; border-radius: 3px; }
</style>`;

const state = { info: null, readers: [], messages: [], zones: [], busy: '' };

async function load() {
  try {
    const r = await axios.get(api(), { ...auth(), timeout: 15000 });
    state.info = r.status === 204 || !r.data ? null : r.data; // 204: nothing registered
  } catch (e) {
    state.info = null;
    if (e?.response?.status !== 404) console.warn('[Notifier] load failed:', errMsg(e));
  }
  if (state.info) {
    const [msgs, readers] = await Promise.all([
      axios.get(`${api()}/messages?limit=20`, { ...auth(), timeout: 15000 }).then(r => r.data || []).catch(() => []),
      state.info.source === 'managed'
        ? axios.get(`${api()}/reader`, { ...auth(), timeout: 15000 }).then(r => r.data || []).catch(() => [])
        : Promise.resolve([]),
    ]);
    state.messages = msgs; state.readers = readers;
  } else {
    state.messages = []; state.readers = [];
    try {
      const hz = await axios.get(`${tbApiBase()}/resources/globalDns/hostedZone`, { ...auth(), timeout: 15000 });
      state.zones = (hz.data?.hostedZones || []).map(z => String(z.name || '').replace(/\.$/, '')).filter(Boolean);
    } catch { state.zones = []; }
  }
  render();
}

function render() {
  const root = document.getElementById('ntfy-root');
  if (!root) return;
  root.innerHTML = state.info ? renderRegistered() : renderSetup();
  bind();
}

function renderSetup() {
  const zoneOptions = ['<option value="">(none) self-signed certificate, IP address URL</option>']
    .concat(state.zones.map(z => `<option value="${esc(z)}">${esc(z)}</option>`)).join('');
  return `
  <div class="ntfy-card">
    <h4>🚀 Create an ntfy server managed by CB-Tumblebug</h4>
    <div style="font-size:12px;color:#555;margin-bottom:8px;">Provisions one small VM from the <code>infra-ntfy</code> template, installs ntfy with token auth and TLS, and registers it. Takes 2–4 minutes.</div>
    <div class="ntfy-row">
      <label>Namespace <input id="ntfy-ns" class="ntfy-input" value="system" style="width:110px"></label>
      <label>Infra name <input id="ntfy-name" class="ntfy-input" value="ntfy" style="width:110px"></label>
    </div>
    <div class="ntfy-row">
      <label>Domain (Route53) <select id="ntfy-domain" class="ntfy-input" style="min-width:260px">${zoneOptions}</select></label>
      <label>Record <input id="ntfy-record" class="ntfy-input" placeholder="auto: ntfy-xxx" style="width:130px"></label>
    </div>
    <div id="ntfy-fqdn" class="ntfy-note" style="display:none"></div>
    <div class="ntfy-row">
      <button id="ntfy-create" class="btn btn-success btn-sm">🚀 Create</button>
      <span id="ntfy-create-status" style="font-size:12px;color:#555"></span>
    </div>
  </div>
  <div class="ntfy-card">
    <h4>🔗 Register an existing ntfy server</h4>
    <div class="ntfy-row">
      <input id="ntfy-ext-url" class="ntfy-input" placeholder="https://ntfy.example.com" style="flex:1;min-width:220px">
      <input id="ntfy-ext-topic" class="ntfy-input" placeholder="topic" style="width:140px">
    </div>
    <div class="ntfy-row">
      <input id="ntfy-ext-write" class="ntfy-input" placeholder="write token (optional)" style="flex:1;min-width:200px">
      <input id="ntfy-ext-read" class="ntfy-input" placeholder="read token (optional)" style="flex:1;min-width:200px">
    </div>
    <textarea id="ntfy-ext-ca" class="ntfy-input" placeholder="CA certificate PEM (only for self-signed servers)" style="width:100%;height:56px;margin-top:8px"></textarea>
    <div class="ntfy-row"><button id="ntfy-register" class="btn btn-primary btn-sm">🔗 Register</button><span id="ntfy-register-status" style="font-size:12px;color:#555"></span></div>
  </div>`;
}

function renderRegistered() {
  const i = state.info;
  const statusCls = i.status === 'Active' ? 'ntfy-ok' : 'ntfy-err';
  const managed = i.source === 'managed';
  const readersHtml = state.readers.length
    ? state.readers.map(r => `<tr><td class="mono">${esc(r)}</td><td style="width:70px"><button class="btn btn-outline-danger btn-sm ntfy-reader-del" data-name="${esc(r)}" style="padding:1px 8px;font-size:11px">Delete</button></td></tr>`).join('')
    : '<tr><td colspan="2" style="color:#888">No reader accounts yet</td></tr>';
  const msgsHtml = state.messages.length
    ? state.messages.map(m => `<tr><td style="white-space:nowrap">${esc((m.time || '').replace('T', ' ').replace(/\.\d+Z$|Z$/, ''))}</td><td>${esc(m.kind || '-')}</td><td class="mono">${esc([m.infraId, m.nodeId].filter(Boolean).join(' / '))}</td><td class="mono">${esc((m.message || '').slice(0, 160))}</td></tr>`).join('')
    : '<tr><td colspan="4" style="color:#888">No messages received yet</td></tr>';
  return `
  <div class="ntfy-card">
    <h4>🔔 Registered notifier <span class="ntfy-badge ${statusCls}">${esc(i.status)}</span> <span class="ntfy-badge ntfy-muted">${esc(i.source)}</span></h4>
    <dl class="ntfy-kv">
      <dt>Server</dt><dd>${esc(i.url)}</dd>
      <dt>Topic</dt><dd>${esc(i.topic)}</dd>
      ${managed ? `<dt>Infra</dt><dd>${esc(i.managedNsId)} / ${esc(i.managedInfraId)}</dd>` : ''}
      ${i.managedDnsRecord ? `<dt>DNS record</dt><dd>${esc(i.managedDnsRecord)}</dd>` : ''}
      <dt>Certificate</dt><dd>${i.caCert ? 'self-signed (CA below)' : 'publicly trusted'}</dd>
      ${i.statusMessage ? `<dt>Message</dt><dd style="color:#dc3545">${esc(i.statusMessage)}</dd>` : ''}
    </dl>
    ${i.caCert ? `<details style="margin-top:6px"><summary style="font-size:12px;cursor:pointer">CA certificate (PEM)</summary><textarea class="ntfy-input" readonly style="width:100%;height:70px;font-size:11px">${esc(i.caCert)}</textarea></details>` : ''}
    <div class="ntfy-row">
      <button id="ntfy-test" class="btn btn-outline-primary btn-sm">🔁 Round-trip test</button>
      <button id="ntfy-refresh" class="btn btn-outline-secondary btn-sm">🔄 Refresh</button>
      <span style="flex:1"></span>
      ${managed ? '<label style="font-size:12px;margin:0"><input type="checkbox" id="ntfy-del-infra" checked> also delete the ntfy VM</label>' : ''}
      <button id="ntfy-unregister" class="btn btn-outline-danger btn-sm">🗑 Unregister</button>
    </div>
    <div id="ntfy-action-status" style="font-size:12px;color:#555;margin-top:6px"></div>
  </div>
  ${managed ? `
  <div class="ntfy-card">
    <h4>👤 Subscriber accounts (read-only)</h4>
    <table class="ntfy-table"><tbody>${readersHtml}</tbody></table>
    <div class="ntfy-row">
      <input id="ntfy-reader-name" class="ntfy-input" placeholder="account name (a-z, 0-9, -, _)" style="width:200px">
      <input id="ntfy-reader-pass" type="password" class="ntfy-input" placeholder="password (generated if empty)" style="width:200px" autocomplete="new-password">
      <button id="ntfy-reader-pass-toggle" class="btn btn-outline-secondary btn-sm" style="padding:2px 8px;font-size:11px">👁</button>
      <button id="ntfy-reader-add" class="btn btn-primary btn-sm">➕ Add</button>
    </div>
    <div id="ntfy-reader-result"></div>
  </div>` : ''}
  <div class="ntfy-card">
    <h4>📨 Messages (latest 20)</h4>
    <div style="max-height:220px;overflow:auto"><table class="ntfy-table"><thead><tr><th>Time (UTC)</th><th>Kind</th><th>Infra / Node</th><th>Message</th></tr></thead><tbody>${msgsHtml}</tbody></table></div>
    <div class="ntfy-row">
      <input id="ntfy-pub-kind" class="ntfy-input" value="custom" style="width:110px">
      <input id="ntfy-pub-data" class="ntfy-input" placeholder='{"text":"hello"}' style="flex:1;min-width:220px">
      <button id="ntfy-publish" class="btn btn-outline-success btn-sm">📤 Publish</button>
    </div>
    <div id="ntfy-publish-status" style="font-size:12px;color:#555;margin-top:6px"></div>
  </div>`;
}

function on(id, handler) {
  const el = document.getElementById(id);
  if (el) el.onclick = handler;
}

function setText(id, text, isError) {
  const el = document.getElementById(id);
  if (el) { el.textContent = text; el.style.color = isError ? '#dc3545' : '#555'; }
}

function bind() {
  if (!state.info) return bindSetup();

  on('ntfy-refresh', () => load());
  on('ntfy-test', async () => {
    setText('ntfy-action-status', 'Testing...');
    try {
      const r = await axios.post(`${api()}/test`, {}, { ...auth(), timeout: 30000 });
      const d = r.data;
      setText('ntfy-action-status', d.success ? `✅ Round-trip OK (${d.elapsedMs} ms, id ${d.messageId})` : `❌ ${d.message}`, !d.success);
    } catch (e) { setText('ntfy-action-status', '❌ ' + errMsg(e), true); }
  });
  on('ntfy-unregister', async () => {
    const delInfra = !!document.getElementById('ntfy-del-infra')?.checked;
    const ok = await Swal.fire({ title: 'Unregister notifier?', text: delInfra ? 'The managed ntfy VM, its DNS record and resources will be deleted.' : 'Only the registration is removed.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Unregister' });
    if (!ok.isConfirmed) return;
    setText('ntfy-action-status', delInfra ? 'Deleting VM and unregistering (about 1 minute)...' : 'Unregistering...');
    try {
      await axios.delete(`${api()}?deleteInfra=${delInfra}`, { ...auth(), timeout: 900000 });
      await load();
    } catch (e) { setText('ntfy-action-status', '❌ ' + errMsg(e), true); }
  });
  on('ntfy-publish', async () => {
    const kind = document.getElementById('ntfy-pub-kind')?.value.trim();
    const raw = document.getElementById('ntfy-pub-data')?.value.trim();
    let data;
    try { data = raw ? JSON.parse(raw) : undefined; } catch { return setText('ntfy-publish-status', 'data must be a JSON object', true); }
    try {
      const r = await axios.post(`${api()}/publish`, { kind, data }, { ...auth(), timeout: 30000 });
      setText('ntfy-publish-status', '✅ ' + r.data.message);
      setTimeout(load, 800);
    } catch (e) { setText('ntfy-publish-status', '❌ ' + errMsg(e), true); }
  });
  on('ntfy-reader-pass-toggle', () => {
    const inp = document.getElementById('ntfy-reader-pass');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    setText('ntfy-reader-pass-toggle', inp.type === 'password' ? '👁' : '🙈');
  });
  on('ntfy-reader-add', async () => {
    const name = document.getElementById('ntfy-reader-name')?.value.trim();
    const password = document.getElementById('ntfy-reader-pass')?.value;
    const box = document.getElementById('ntfy-reader-result');
    if (!name) { box.innerHTML = '<div class="ntfy-note" style="color:#dc3545">Account name is required</div>'; return; }
    box.innerHTML = '<div class="ntfy-note">Creating account on the ntfy server...</div>';
    try {
      const r = await axios.post(`${api()}/reader`, { name, password: password || undefined }, { ...auth(), timeout: 120000 });
      const d = r.data;
      box.innerHTML = `
        <div class="ntfy-result">
          <div style="font-weight:600;margin-bottom:6px">Account created. The password is shown only once.</div>
          <div class="ntfy-kv">
            <dt>Server</dt><dd>${esc(d.serverUrl)}</dd>
            <dt>Topic</dt><dd>${esc(d.topic)}</dd>
            <dt>Username</dt><dd>${esc(d.name)}</dd>
            <dt>Password</dt><dd><span id="ntfy-pw-value" data-pw="${esc(d.password)}">${'•'.repeat(d.password.length)}</span>
              <button id="ntfy-pw-toggle" class="btn btn-outline-secondary btn-sm" style="padding:0 6px;font-size:11px;margin-left:6px">👁 Show</button>
              <button id="ntfy-pw-copy" class="btn btn-outline-secondary btn-sm" style="padding:0 6px;font-size:11px;margin-left:4px">📋 Copy</button></dd>
          </div>
          <div style="margin-top:8px">${esc(d.note)}</div>
          <div style="margin-top:6px"><b>ntfy app</b>: Settings → Manage users → add <code>${esc(d.serverUrl)}</code> with this account → Subscribe to topic → server <code>${esc(d.serverUrl)}</code>, topic <code>${esc(d.topic)}</code>.</div>
          <div style="margin-top:4px"><b>curl</b>: <code>curl -u ${esc(d.name)}:&lt;password&gt; ${esc(d.serverUrl)}/${esc(d.topic)}/json</code></div>
        </div>`;
      const pw = document.getElementById('ntfy-pw-value');
      let shown = false;
      on('ntfy-pw-toggle', () => {
        shown = !shown;
        pw.textContent = shown ? pw.dataset.pw : '•'.repeat(pw.dataset.pw.length);
        document.getElementById('ntfy-pw-toggle').textContent = shown ? '🙈 Hide' : '👁 Show';
      });
      on('ntfy-pw-copy', async () => {
        try { await navigator.clipboard.writeText(pw.dataset.pw); setText('ntfy-pw-copy', '✅ Copied'); setTimeout(() => setText('ntfy-pw-copy', '📋 Copy'), 1500); }
        catch { setText('ntfy-pw-copy', 'Copy failed', true); }
      });
      state.readers = await axios.get(`${api()}/reader`, auth()).then(r => r.data || []).catch(() => state.readers.concat(name));
      const rows = document.querySelector('.ntfy-table tbody');
      if (rows) rows.innerHTML = state.readers.map(r => `<tr><td class="mono">${esc(r)}</td><td style="width:70px"><button class="btn btn-outline-danger btn-sm ntfy-reader-del" data-name="${esc(r)}" style="padding:1px 8px;font-size:11px">Delete</button></td></tr>`).join('');
      bindReaderDelete();
      document.getElementById('ntfy-reader-name').value = '';
      document.getElementById('ntfy-reader-pass').value = '';
    } catch (e) { box.innerHTML = `<div class="ntfy-note" style="color:#dc3545">❌ ${esc(errMsg(e))}</div>`; }
  });
  bindReaderDelete();
}

function bindReaderDelete() {
  document.querySelectorAll('.ntfy-reader-del').forEach(btn => {
    btn.onclick = async () => {
      const name = btn.dataset.name;
      const ok = await Swal.fire({ title: `Delete account '${name}'?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Delete' });
      if (!ok.isConfirmed) return;
      try {
        await axios.delete(`${api()}/reader/${encodeURIComponent(name)}`, { ...auth(), timeout: 120000 });
        await load();
      } catch (e) { Swal.fire({ icon: 'error', title: errMsg(e) }); }
    };
  });
}

function bindSetup() {
  const domainSel = document.getElementById('ntfy-domain');
  const recordIn = document.getElementById('ntfy-record');
  const fqdnBox = document.getElementById('ntfy-fqdn');
  const updateFqdn = () => {
    const d = domainSel?.value; const r = (recordIn?.value || '').trim();
    if (!fqdnBox) return;
    fqdnBox.style.display = d ? 'block' : 'none';
    if (d) fqdnBox.textContent = `Server URL will be https://${r || 'ntfy-xxx (random, unused name)'}.${d} with a Let's Encrypt certificate (phones and browsers can subscribe directly). An explicit record must not already exist.`;
  };
  domainSel?.addEventListener('change', updateFqdn);
  recordIn?.addEventListener('input', updateFqdn);

  on('ntfy-create', async () => {
    const body = {
      nsId: document.getElementById('ntfy-ns')?.value.trim() || undefined,
      name: document.getElementById('ntfy-name')?.value.trim() || undefined,
      domainName: domainSel?.value || undefined,
      recordName: domainSel?.value ? (recordIn?.value.trim() || undefined) : undefined,
    };
    const btn = document.getElementById('ntfy-create');
    btn.disabled = true;
    setText('ntfy-create-status', 'Provisioning VM, installing ntfy, registering... (2–4 minutes)');
    try {
      await axios.post(`${api()}/ntfy`, body, { ...auth(), timeout: 1500000 });
      await load();
    } catch (e) {
      btn.disabled = false;
      setText('ntfy-create-status', '❌ ' + errMsg(e), true);
    }
  });

  on('ntfy-register', async () => {
    const body = {
      url: document.getElementById('ntfy-ext-url')?.value.trim(),
      topic: document.getElementById('ntfy-ext-topic')?.value.trim(),
      writeToken: document.getElementById('ntfy-ext-write')?.value.trim() || undefined,
      readToken: document.getElementById('ntfy-ext-read')?.value.trim() || undefined,
      caCert: document.getElementById('ntfy-ext-ca')?.value.trim() || undefined,
    };
    if (!body.url || !body.topic) return setText('ntfy-register-status', 'url and topic are required', true);
    setText('ntfy-register-status', 'Registering...');
    try {
      await axios.put(api(), body, { ...auth(), timeout: 60000 });
      await load();
    } catch (e) { setText('ntfy-register-status', '❌ ' + errMsg(e), true); }
  });
}

export function showNotifierModal() {
  Swal.fire({
    title: '🔔 Notifier (ntfy)',
    html: `${STYLES}<div id="ntfy-root" class="ntfy-root"><div style="color:#888;padding:20px;text-align:center"><i class="fas fa-spinner fa-spin"></i> Loading...</div></div>`,
    width: '820px',
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '❌ Close',
    customClass: { popup: 'swal2-infra-context' },
    didOpen: () => load(),
  });
}

window.showNotifierModal = showNotifierModal;
