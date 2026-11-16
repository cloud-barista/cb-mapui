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
  .ntfy-val-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 2px; }
  .ntfy-copy-btn, .ntfy-inline-btn { padding: 0 6px; font-size: 11px; line-height: 1.5; flex-shrink: 0; }
</style>`;

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  }
  const container = document.getElementById('ntfy-root') || document.body;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  container.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  container.removeChild(ta);
  return ok;
}

function copyBtn(value) {
  return `<button type="button" class="btn btn-outline-secondary btn-sm ntfy-copy-btn" data-copy="${esc(value)}" title="Copy to clipboard">📋 Copy</button>`;
}

function renderReaderRows(readers) {
  if (!readers.length) return '<tr><td colspan="2" style="color:#888">No reader accounts yet</td></tr>';
  return readers.map(r =>
    `<tr><td class="mono"><span class="ntfy-val-line"><span>${esc(r)}</span>${copyBtn(r)}</span></td><td style="width:70px"><button class="btn btn-outline-danger btn-sm ntfy-reader-del" data-name="${esc(r)}" style="padding:1px 8px;font-size:11px">Delete</button></td></tr>`
  ).join('');
}

const DEFAULT_TEMPLATES = [
  { id: 'infra-ntfy', name: 'infra-ntfy', infraDynamicReq: { nodeGroups: [{ name: 'ntfy', nodeGroupSize: 1, specId: 'aws+ap-northeast-2+t3.micro' }] } },
  { id: 'infra-ntfy-global', name: 'infra-ntfy-global', infraDynamicReq: { nodeGroups: [{ name: 'ntfy-kr', nodeGroupSize: 1, specId: 'aws+ap-northeast-2+t3.micro' }, { name: 'ntfy-cn', nodeGroupSize: 1, specId: 'alibaba+cn-shanghai+ecs.e-c1m1.large' }] } },
];

const state = { info: null, readers: [], messages: [], zones: [], templates: DEFAULT_TEMPLATES, busy: '' };

function notifierUrls(info) {
  if (!info) return [];
  if (Array.isArray(info.urls) && info.urls.length) return info.urls;
  return info.url ? [info.url] : [];
}

function templateVmCount(t) {
  const groups = t?.infraDynamicReq?.nodeGroups || [];
  if (!groups.length) return 1;
  return groups.reduce((sum, g) => sum + (Number(g.nodeGroupSize) || 1), 0);
}

function summarizeTemplate(t) {
  const id = t?.id || t?.name || '';
  const groups = t?.infraDynamicReq?.nodeGroups || [];
  const regions = groups.map(g => {
    const parts = String(g.specId || '').split('+');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : (g.name || '');
  }).filter(Boolean);
  const total = templateVmCount(t);
  if (!regions.length) return id;
  return `${id} — ${total} VM${total > 1 ? 's' : ''} (${regions.join(', ')})`;
}

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
    const [hzRes, tplRes] = await Promise.allSettled([
      axios.get(`${tbApiBase()}/resources/globalDns/hostedZone`, { ...auth(), timeout: 15000 }),
      axios.get(`${tbApiBase()}/ns/system/template/infra`, { ...auth(), timeout: 15000 }),
    ]);
    state.zones = hzRes.status === 'fulfilled'
      ? (hzRes.value.data?.hostedZones || []).map(z => String(z.name || '').replace(/\.$/, '')).filter(Boolean)
      : [];
    if (tplRes.status === 'fulfilled' && Array.isArray(tplRes.value.data?.templates)) {
      const fetched = tplRes.value.data.templates.filter(t => String(t.id || t.name || '').startsWith('infra-ntfy'));
      state.templates = fetched.length ? fetched : DEFAULT_TEMPLATES;
    } else {
      state.templates = DEFAULT_TEMPLATES;
    }
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
  const tplOptions = state.templates.map(t => {
    const id = t.id || t.name;
    return `<option value="${esc(id)}">${esc(summarizeTemplate(t))}</option>`;
  }).join('');
  const zoneOptions = ['<option value="">(none) self-signed certificate, IP:9443 URL</option>']
    .concat(state.zones.map(z => `<option value="${esc(z)}">${esc(z)}</option>`)).join('');
  return `
  <div class="ntfy-card">
    <h4>🚀 Create an ntfy server managed by CB-Tumblebug</h4>
    <div style="font-size:12px;color:#555;margin-bottom:8px;">Provisions one or more small VMs from the selected Infra template (choose <code>infra-ntfy-global</code> for Korea + Mainland China dual endpoints), installs ntfy with shared token auth and TLS, and registers them together. Takes 2–4 minutes.</div>
    <div class="ntfy-row">
      <label>Template <select id="ntfy-template" class="ntfy-input" style="min-width:340px">${tplOptions}</select></label>
    </div>
    <div class="ntfy-row">
      <label>Namespace <input id="ntfy-ns" class="ntfy-input" value="system" style="width:110px"></label>
      <label>Infra name <input id="ntfy-name" class="ntfy-input" value="ntfy" style="width:110px"></label>
    </div>
    <div class="ntfy-row">
      <label>Domain (Route53) <select id="ntfy-domain" class="ntfy-input" style="min-width:260px">${zoneOptions}</select></label>
      <label>Record <input id="ntfy-record" class="ntfy-input" placeholder="auto: ntfy-xxx" style="width:130px"></label>
    </div>
    <div id="ntfy-fqdn" class="ntfy-note"></div>
    <div class="ntfy-row">
      <button id="ntfy-create" class="btn btn-success btn-sm">🚀 Create</button>
      <span id="ntfy-create-status" style="font-size:12px;color:#555"></span>
    </div>
  </div>
  <div class="ntfy-card">
    <h4>🔗 Register an existing ntfy server</h4>
    <div class="ntfy-row">
      <input id="ntfy-ext-url" class="ntfy-input" placeholder="https://ntfy.example.com (comma-separated for multiple URLs)" style="flex:1;min-width:220px">
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
  const urls = notifierUrls(i);
  const statusCls = i.status === 'Active' ? 'ntfy-ok' : 'ntfy-err';
  const managed = i.source === 'managed';
  const serversHtml = urls.map((u, idx) =>
    `<div class="ntfy-val-line"><span>${esc(u)}</span>${urls.length > 1 ? `<span style="color:#6c757d;font-size:11px;font-family:sans-serif">${idx === 0 ? '(primary)' : `(endpoint #${idx + 1})`}</span>` : ''}${copyBtn(u)}</div>`
  ).join('');
  const certDesc = i.caCert && i.managedDnsRecord
    ? 'publicly trusted (primary) + pinned self-signed (additional endpoints)'
    : (i.caCert ? 'pinned self-signed (CA below)' : 'publicly trusted');
  const delVmLabel = urls.length > 1 ? `also delete all ${urls.length} ntfy VMs` : 'also delete the ntfy VM';

  const readersHtml = renderReaderRows(state.readers);
  const msgsHtml = state.messages.length
    ? state.messages.map(m => `<tr><td style="white-space:nowrap">${esc((m.time || '').replace('T', ' ').replace(/\.\d+Z$|Z$/, ''))}</td><td>${esc(m.kind || '-')}</td><td class="mono">${esc([m.infraId, m.nodeId].filter(Boolean).join(' / '))}</td><td class="mono">${esc((m.message || '').slice(0, 160))}</td></tr>`).join('')
    : '<tr><td colspan="4" style="color:#888">No messages received yet</td></tr>';
  return `
  <div class="ntfy-card">
    <h4>🔔 Registered notifier <span class="ntfy-badge ${statusCls}">${esc(i.status)}</span> <span class="ntfy-badge ntfy-muted">${esc(i.source)}</span></h4>
    <dl class="ntfy-kv">
      <dt>${urls.length > 1 ? `Servers (${urls.length})` : 'Server'}</dt><dd>${serversHtml}</dd>
      <dt>Topic</dt><dd><span class="ntfy-val-line"><span>${esc(i.topic)}</span>${copyBtn(i.topic)}</span></dd>
      ${managed ? `<dt>Infra</dt><dd>${esc(i.managedNsId)} / ${esc(i.managedInfraId)}</dd>` : ''}
      ${i.managedDnsRecord ? `<dt>DNS record</dt><dd>${esc(i.managedDnsRecord)}</dd>` : ''}
      <dt>Certificate</dt><dd>${esc(certDesc)}</dd>
      ${i.statusMessage ? `<dt>Message</dt><dd style="color:#dc3545">${esc(i.statusMessage)}</dd>` : ''}
    </dl>
    ${i.caCert ? `<details style="margin-top:6px"><summary style="font-size:12px;cursor:pointer">Pinned certificate PEM</summary><textarea class="ntfy-input" readonly style="width:100%;height:70px;font-size:11px">${esc(i.caCert)}</textarea></details>` : ''}
    <div class="ntfy-row">
      <button id="ntfy-test" class="btn btn-outline-primary btn-sm">🔁 Round-trip test</button>
      <button id="ntfy-refresh" class="btn btn-outline-secondary btn-sm">🔄 Refresh</button>
      <span style="flex:1"></span>
      ${managed ? `<label style="font-size:12px;margin:0"><input type="checkbox" id="ntfy-del-infra" checked> ${esc(delVmLabel)}</label>` : ''}
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
  const root = document.getElementById('ntfy-root');
  if (root && !root._copyBound) {
    root._copyBound = true;
    root.addEventListener('click', async (ev) => {
      const btn = ev.target?.closest?.('.ntfy-copy-btn[data-copy]');
      if (!btn) return;
      const orig = btn.dataset.origLabel || btn.textContent;
      btn.dataset.origLabel = orig;
      if (btn._copyTimer) clearTimeout(btn._copyTimer);
      const ok = await copyText(btn.dataset.copy ?? '');
      btn.textContent = ok ? '✅ Copied' : 'Copy failed';
      btn.style.color = ok ? '#28a745' : '#dc3545';
      btn._copyTimer = setTimeout(() => {
        btn.textContent = orig;
        btn.style.color = '';
      }, 1500);
    });
  }
  if (!state.info) return bindSetup();

  const urls = notifierUrls(state.info);
  on('ntfy-refresh', () => load());
  on('ntfy-test', async () => {
    setText('ntfy-action-status', 'Testing...');
    try {
      const r = await axios.post(`${api()}/test`, {}, { ...auth(), timeout: 30000 });
      const d = r.data;
      const extra = d.message ? `, ${d.message}` : '';
      setText('ntfy-action-status', d.success ? `✅ Round-trip OK (${d.elapsedMs} ms${extra}, id ${d.messageId})` : `❌ ${d.message}`, !d.success);
    } catch (e) { setText('ntfy-action-status', '❌ ' + errMsg(e), true); }
  });
  on('ntfy-unregister', async () => {
    const delInfra = !!document.getElementById('ntfy-del-infra')?.checked;
    const ok = await Swal.fire({
      title: 'Unregister notifier?',
      text: delInfra ? 'The managed ntfy VM(s), DNS record and network resources will be deleted.' : 'Only the registration is removed.',
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Unregister',
    });
    if (!ok.isConfirmed) return;
    setText('ntfy-action-status', delInfra ? 'Deleting VM(s) and unregistering (about 1–2 minutes)...' : 'Unregistering...');
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
    box.innerHTML = `<div class="ntfy-note">Creating account on ${urls.length > 1 ? `all ${urls.length} ntfy servers` : 'the ntfy server'}...</div>`;
    try {
      const r = await axios.post(`${api()}/reader`, { name, password: password || undefined }, { ...auth(), timeout: 120000 });
      const d = r.data;
      const srvDisplay = (urls.length > 1 ? urls : [d.serverUrl])
        .map(u => `<div class="ntfy-val-line"><span>${esc(u)}</span>${copyBtn(u)}</div>`).join('');
      box.innerHTML = `
        <div class="ntfy-result">
          <div style="font-weight:600;margin-bottom:6px">Account created${urls.length > 1 ? ` on all ${urls.length} servers` : ''}. The password is shown only once.</div>
          <div class="ntfy-kv">
            <dt>${urls.length > 1 ? 'Servers' : 'Server'}</dt><dd>${srvDisplay}</dd>
            <dt>Topic</dt><dd><span class="ntfy-val-line"><span>${esc(d.topic)}</span>${copyBtn(d.topic)}</span></dd>
            <dt>Username</dt><dd><span class="ntfy-val-line"><span>${esc(d.name)}</span>${copyBtn(d.name)}</span></dd>
            <dt>Password</dt><dd><span class="ntfy-val-line"><span id="ntfy-pw-value" data-pw="${esc(d.password)}">${'•'.repeat(d.password.length)}</span>
              <button type="button" id="ntfy-pw-toggle" class="btn btn-outline-secondary btn-sm ntfy-inline-btn">👁 Show</button>
              ${copyBtn(d.password)}</span></dd>
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
      state.readers = await axios.get(`${api()}/reader`, auth()).then(r => r.data || []).catch(() => state.readers.concat(name));
      const rows = document.querySelector('.ntfy-table tbody');
      if (rows) rows.innerHTML = renderReaderRows(state.readers);
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
  const tplSel = document.getElementById('ntfy-template');
  const domainSel = document.getElementById('ntfy-domain');
  const recordIn = document.getElementById('ntfy-record');
  const fqdnBox = document.getElementById('ntfy-fqdn');
  const selectedVmCount = () => {
    const id = tplSel?.value;
    const found = state.templates.find(t => (t.id || t.name) === id);
    return found ? templateVmCount(found) : 1;
  };
  const updateFqdn = () => {
    if (!fqdnBox) return;
    const d = domainSel?.value;
    const r = (recordIn?.value || '').trim();
    const vmCount = selectedVmCount();
    const fqdnPreview = `https://${r || 'ntfy-xxx (random, unused name)'}.${d}`;
    if (vmCount > 1 && d) {
      fqdnBox.textContent = `Multi-endpoint setup (${vmCount} VMs sharing one topic & token): Primary node uses ${fqdnPreview} (Let's Encrypt :443, phones & browsers supported); additional node(s) use https://<public-ip>:9443 (pinned self-signed TLS). Workload VMs automatically report to the first reachable server.`;
    } else if (vmCount > 1) {
      fqdnBox.textContent = `Multi-endpoint setup (${vmCount} VMs sharing one topic & token): Each node uses https://<public-ip>:9443 with a pinned self-signed certificate. Workload VMs automatically report to the first reachable server.`;
    } else if (d) {
      fqdnBox.textContent = `Server URL will be ${fqdnPreview} with a Let's Encrypt certificate (phones and browsers can subscribe directly). An explicit record must not already exist.`;
    } else {
      fqdnBox.textContent = `Server URL will be https://<public-ip>:9443 with a pinned self-signed certificate (trusted automatically by CB-Tumblebug and workload VMs).`;
    }
  };
  tplSel?.addEventListener('change', updateFqdn);
  domainSel?.addEventListener('change', updateFqdn);
  recordIn?.addEventListener('input', updateFqdn);
  updateFqdn();

  on('ntfy-create', async () => {
    const vmCount = selectedVmCount();
    const body = {
      nsId: document.getElementById('ntfy-ns')?.value.trim() || undefined,
      templateId: tplSel?.value || undefined,
      name: document.getElementById('ntfy-name')?.value.trim() || undefined,
      domainName: domainSel?.value || undefined,
      recordName: domainSel?.value ? (recordIn?.value.trim() || undefined) : undefined,
    };
    const btn = document.getElementById('ntfy-create');
    btn.disabled = true;
    setText('ntfy-create-status', `Provisioning ${vmCount > 1 ? `${vmCount} VMs` : 'VM'}, installing ntfy, registering... (2–4 minutes)`);
    try {
      await axios.post(`${api()}/ntfy`, body, { ...auth(), timeout: 1500000 });
      await load();
    } catch (e) {
      btn.disabled = false;
      setText('ntfy-create-status', '❌ ' + errMsg(e), true);
    }
  });

  on('ntfy-register', async () => {
    const rawUrl = document.getElementById('ntfy-ext-url')?.value.trim() || '';
    const urls = rawUrl.split(/[\s,]+/).filter(Boolean);
    const body = {
      url: urls[0] || '',
      urls: urls.length > 1 ? urls : undefined,
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
