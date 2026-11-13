/**
 * Observability (OpenTelemetry) Management Feature Module
 * Create or register the OTLP endpoint + Grafana that nodes send metrics and logs to, manage Grafana viewer
 * accounts, and run a round-trip test. Nodes opt in with the initscript-otel-agent template.
 * @module features/observability/observability-mgr
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import { tbApiBase, getConfig } from '../../core/api.js';
import { escapeHtml } from '../../core/utils.js';

const esc = (v) => escapeHtml(v == null ? '' : String(v));
const auth = () => { const c = getConfig(); return { auth: { username: c.username, password: c.password } }; };
const api = () => `${tbApiBase()}/observability`;
const errMsg = (e) => e?.response?.data?.message || e?.message || String(e);

const STYLES = `
<style>
  .obs-root { text-align: left; font-size: 13px; }
  .obs-card { border: 1px solid #dee2e6; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; background: #fff; }
  .obs-card h4 { font-size: 14px; margin: 0 0 10px; font-weight: 600; color: #333; }
  .obs-kv { display: grid; grid-template-columns: 150px 1fr; gap: 4px 10px; font-size: 12.5px; }
  .obs-kv dt { color: #6c757d; } .obs-kv dd { margin: 0; word-break: break-all; font-family: monospace; }
  .obs-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 10px; }
  .obs-input { font-size: 12.5px; padding: 6px 8px; border: 1px solid #ced4da; border-radius: 4px; }
  .obs-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; color: #fff; }
  .obs-ok { background: #28a745; } .obs-err { background: #dc3545; } .obs-muted { background: #6c757d; }
  .obs-note { font-size: 12px; color: #555; background: #f8f9fa; border-radius: 6px; padding: 8px 10px; margin-top: 8px; }
  .obs-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .obs-table th, .obs-table td { border: 1px solid #e9ecef; padding: 4px 6px; text-align: left; vertical-align: top; }
  .obs-table td.mono { font-family: monospace; word-break: break-all; }
  .obs-result { background: #e8f4ff; border: 1px solid #b8daff; border-radius: 6px; padding: 10px; margin-top: 10px; font-size: 12.5px; }
  .obs-result code { background: #fff; padding: 1px 4px; border-radius: 3px; }
</style>`;

const state = { info: null, readers: [], zones: [], created: null };

async function load() {
  try {
    const r = await axios.get(api(), { ...auth(), timeout: 15000 });
    state.info = r.status === 204 || !r.data ? null : r.data; // 204: nothing registered
  } catch (e) {
    state.info = null;
    if (e?.response?.status !== 404) console.warn('[Observability] load failed:', errMsg(e));
  }
  if (state.info) {
    state.readers = state.info.grafanaUrl
      ? await axios.get(`${api()}/reader`, { ...auth(), timeout: 15000 }).then(r => r.data || []).catch(() => [])
      : [];
  } else {
    state.readers = [];
    try {
      const hz = await axios.get(`${tbApiBase()}/resources/globalDns/hostedZone`, { ...auth(), timeout: 15000 });
      state.zones = (hz.data?.hostedZones || []).map(z => String(z.name || '').replace(/\.$/, '')).filter(Boolean);
    } catch { state.zones = []; }
  }
  render();
}

function render() {
  const root = document.getElementById('obs-root');
  if (!root) return;
  root.innerHTML = state.info ? renderRegistered() : renderSetup();
  bind();
}

function renderSetup() {
  const zoneOptions = ['<option value="">(none) self-signed certificate, IP address URL</option>']
    .concat(state.zones.map(z => `<option value="${esc(z)}">${esc(z)}</option>`)).join('');
  return `
  <div class="obs-card">
    <h4>🚀 Create an observability stack managed by CB-Tumblebug</h4>
    <div style="font-size:12px;color:#555;margin-bottom:8px;">Provisions one VM from the <code>infra-obs</code> template and installs an OpenTelemetry Collector gateway, Prometheus, Loki and Grafana (dashboards included) behind nginx with TLS. Takes 5–10 minutes.</div>
    <div class="obs-row">
      <label>Namespace <input id="obs-ns" class="obs-input" value="system" style="width:110px"></label>
      <label>Infra name <input id="obs-name" class="obs-input" value="obs" style="width:110px"></label>
      <label>Retention (days) <input id="obs-retention" class="obs-input" type="number" value="15" min="1" max="365" style="width:70px"></label>
    </div>
    <div class="obs-row">
      <label>Domain (Route53) <select id="obs-domain" class="obs-input" style="min-width:260px">${zoneOptions}</select></label>
      <label>Record <input id="obs-record" class="obs-input" placeholder="auto: obs-xxx" style="width:130px"></label>
    </div>
    <div id="obs-fqdn" class="obs-note" style="display:none"></div>
    <div class="obs-row">
      <button id="obs-create" class="btn btn-success btn-sm">🚀 Create</button>
      <span id="obs-create-status" style="font-size:12px;color:#555"></span>
    </div>
  </div>
  <div class="obs-card">
    <h4>🔗 Register an existing OTLP endpoint</h4>
    <div class="obs-row">
      <input id="obs-ext-endpoint" class="obs-input" placeholder="OTLP/HTTP base URL, e.g. https://otel.example.com" style="flex:1;min-width:260px">
      <input id="obs-ext-token" class="obs-input" placeholder="bearer token (optional)" style="width:220px">
    </div>
    <div class="obs-row">
      <input id="obs-ext-grafana" class="obs-input" placeholder="Grafana URL (optional)" style="flex:1;min-width:200px">
      <input id="obs-ext-gf-user" class="obs-input" placeholder="admin user" style="width:110px">
      <input id="obs-ext-gf-pass" type="password" class="obs-input" placeholder="admin password" style="width:150px" autocomplete="new-password">
    </div>
    <textarea id="obs-ext-ca" class="obs-input" placeholder="CA certificate PEM (only for self-signed servers)" style="width:100%;height:56px;margin-top:8px"></textarea>
    <div class="obs-row"><button id="obs-register" class="btn btn-primary btn-sm">🔗 Register</button><span id="obs-register-status" style="font-size:12px;color:#555"></span></div>
  </div>`;
}

function renderRegistered() {
  const i = state.info;
  const statusCls = i.status === 'Active' ? 'obs-ok' : 'obs-err';
  const managed = i.source === 'managed';
  const hasGrafanaAdmin = !!(i.grafanaUrl && i.grafanaAdminPassword);
  const readersHtml = state.readers.length
    ? state.readers.map(r => `<tr><td class="mono">${esc(r)}</td><td style="width:70px"><button class="btn btn-outline-danger btn-sm obs-reader-del" data-name="${esc(r)}" style="padding:1px 8px;font-size:11px">Delete</button></td></tr>`).join('')
    : '<tr><td colspan="2" style="color:#888">No viewer accounts yet</td></tr>';
  const c = state.created;
  const banner = c ? (c.ok
    ? `<div class="obs-result" style="background:#e9f7ef;border-color:#a3d9b1"><b>✅ Stack created and registered</b> in ${esc(c.took)}. Round-trip test: metrics and logs were stored and queried back through Grafana.<br>Next: open the dashboards, create a viewer account, and add the <code>initscript-otel-agent</code> template to an Infra.</div>`
    : `<div class="obs-result" style="background:#fff4e5;border-color:#ffd8a8"><b>⚠️ Stack created and registered</b> in ${esc(c.took)}, but the round-trip test failed: ${esc(c.message || i.statusMessage || 'see status message')}. Fix the cause and press Round-trip test again.</div>`) : '';
  return `
  <div class="obs-card">
    <h4>📈 Registered observability stack <span class="obs-badge ${statusCls}">${esc(i.status)}</span> <span class="obs-badge obs-muted">${esc(i.source)}</span></h4>
    ${banner}
    <dl class="obs-kv">
      <dt>OTLP endpoint</dt><dd>${esc(i.otlpEndpoint)}</dd>
      ${i.grafanaUrl ? `<dt>Grafana</dt><dd><a href="${esc(i.grafanaUrl)}" target="_blank" rel="noopener">${esc(i.grafanaUrl)}</a></dd>` : ''}
      ${i.grafanaUrl && i.grafanaAdminUser ? `<dt>Grafana admin</dt><dd><code>${esc(i.grafanaAdminUser)}</code> / <span id="obs-admin-pw">${'•'.repeat(12)}</span>
        <button id="obs-admin-pw-show" class="btn btn-outline-secondary btn-sm" style="padding:0 6px;font-size:11px;margin-left:6px">👁 Show</button>
        <button id="obs-admin-pw-copy" class="btn btn-outline-secondary btn-sm" style="padding:0 6px;font-size:11px;margin-left:4px">📋 Copy</button></dd>` : ''}
      ${managed ? `<dt>Infra</dt><dd>${esc(i.managedNsId)} / ${esc(i.managedInfraId)}</dd>` : ''}
      ${i.managedDnsRecord ? `<dt>DNS record</dt><dd>${esc(i.managedDnsRecord)}</dd>` : ''}
      ${i.retentionDays ? `<dt>Retention</dt><dd>${esc(i.retentionDays)} days</dd>` : ''}
      <dt>Certificate</dt><dd>${i.caCert ? 'self-signed (CA below; nodes get it automatically)' : 'publicly trusted'}</dd>
      ${i.statusMessage ? `<dt>Message</dt><dd style="color:#dc3545">${esc(i.statusMessage)}</dd>` : ''}
    </dl>
    ${i.caCert ? `<details style="margin-top:6px"><summary style="font-size:12px;cursor:pointer">CA certificate (PEM)</summary><textarea class="obs-input" readonly style="width:100%;height:70px;font-size:11px">${esc(i.caCert)}</textarea></details>` : ''}
    <div class="obs-note">Nodes send data when their init script includes the <code>initscript-otel-agent</code> template (Infra creation → Init script → Template). Env toggles: <code>OTEL_METRICS</code>, <code>OTEL_LOGS</code>, <code>OTEL_GPU</code> (auto|on|off), <code>OTEL_INTERVAL</code>, <code>OTEL_LOG_PATHS</code>, <code>OTEL_SCRAPE_TARGETS</code>.</div>
    <div class="obs-row">
      <button id="obs-test" class="btn btn-outline-primary btn-sm">🔁 Round-trip test</button>
      <button id="obs-refresh" class="btn btn-outline-secondary btn-sm">🔄 Refresh</button>
      ${i.grafanaUrl ? `<a class="btn btn-outline-success btn-sm" href="${esc(i.grafanaUrl)}/d/tb-infra-overview" target="_blank" rel="noopener">📊 Open dashboards</a>` : ''}
      <span style="flex:1"></span>
      ${managed ? '<label style="font-size:12px;margin:0"><input type="checkbox" id="obs-del-infra" checked> also delete the stack VM</label>' : ''}
      <button id="obs-unregister" class="btn btn-outline-danger btn-sm">🗑 Unregister</button>
    </div>
    <div id="obs-action-status" style="font-size:12px;color:#555;margin-top:6px"></div>
  </div>
  ${hasGrafanaAdmin ? `
  <div class="obs-card">
    <h4>👤 Grafana viewer accounts</h4>
    <table class="obs-table"><tbody>${readersHtml}</tbody></table>
    <div class="obs-row">
      <input id="obs-reader-name" class="obs-input" placeholder="account name (a-z, 0-9, -, _)" style="width:200px">
      <input id="obs-reader-pass" type="password" class="obs-input" placeholder="password (generated if empty)" style="width:200px" autocomplete="new-password">
      <button id="obs-reader-pass-toggle" class="btn btn-outline-secondary btn-sm" style="padding:2px 8px;font-size:11px">👁</button>
      <button id="obs-reader-add" class="btn btn-primary btn-sm">➕ Add</button>
    </div>
    <div id="obs-reader-result"></div>
  </div>` : ''}`;
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

  on('obs-refresh', () => { state.created = null; load(); });
  // The admin password is fetched (showSecrets) only when asked for; Copy works without revealing it,
  // and Hide masks it completely.
  let adminPw = null;
  const adminPassword = async () => {
    if (adminPw === null) {
      const r = await axios.get(`${api()}?showSecrets=true`, { ...auth(), timeout: 15000 });
      adminPw = r.data?.grafanaAdminPassword || '';
    }
    return adminPw;
  };
  on('obs-admin-pw-show', async () => {
    const span = document.getElementById('obs-admin-pw');
    if (span.dataset.shown === '1') { span.textContent = '•'.repeat(12); span.dataset.shown = '0'; setText('obs-admin-pw-show', '👁 Show'); return; }
    try {
      span.textContent = await adminPassword(); span.dataset.shown = '1';
      setText('obs-admin-pw-show', '🙈 Hide');
    } catch (e) { setText('obs-action-status', '❌ ' + errMsg(e), true); }
  });
  on('obs-admin-pw-copy', async () => {
    try {
      await navigator.clipboard.writeText(await adminPassword());
      setText('obs-admin-pw-copy', '✅ Copied'); setTimeout(() => setText('obs-admin-pw-copy', '📋 Copy'), 1500);
    } catch (e) { setText('obs-action-status', '❌ ' + errMsg(e), true); }
  });
  on('obs-test', async () => {
    setText('obs-action-status', 'Sending a test metric and log line, then querying Grafana (up to 60s)...');
    try {
      const r = await axios.post(`${api()}/test`, {}, { ...auth(), timeout: 120000 });
      const d = r.data;
      setText('obs-action-status', d.success ? `✅ Round-trip OK (${d.elapsedMs} ms)${d.message ? ' · ' + d.message : ''}` : `❌ ${d.message}`, !d.success);
    } catch (e) { setText('obs-action-status', '❌ ' + errMsg(e), true); }
  });
  on('obs-unregister', async () => {
    const delInfra = !!document.getElementById('obs-del-infra')?.checked;
    const ok = await Swal.fire({ title: 'Unregister observability stack?', text: delInfra ? 'The managed VM, its DNS record and resources will be deleted. Collected data is lost.' : 'Only the registration is removed; nodes created afterwards will not send data.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Unregister' });
    if (!ok.isConfirmed) return;
    setText('obs-action-status', delInfra ? 'Deleting VM and unregistering (about 1 minute)...' : 'Unregistering...');
    try {
      await axios.delete(`${api()}?deleteInfra=${delInfra}`, { ...auth(), timeout: 900000 });
      await load();
    } catch (e) { setText('obs-action-status', '❌ ' + errMsg(e), true); }
  });
  on('obs-reader-pass-toggle', () => {
    const inp = document.getElementById('obs-reader-pass');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    setText('obs-reader-pass-toggle', inp.type === 'password' ? '👁' : '🙈');
  });
  on('obs-reader-add', async () => {
    const name = document.getElementById('obs-reader-name')?.value.trim();
    const password = document.getElementById('obs-reader-pass')?.value;
    const box = document.getElementById('obs-reader-result');
    if (!name) { box.innerHTML = '<div class="obs-note" style="color:#dc3545">Account name is required</div>'; return; }
    box.innerHTML = '<div class="obs-note">Creating the Grafana account...</div>';
    try {
      const r = await axios.post(`${api()}/reader`, { name, password: password || undefined }, { ...auth(), timeout: 60000 });
      const d = r.data;
      box.innerHTML = `
        <div class="obs-result">
          <div style="font-weight:600;margin-bottom:6px">Account created. The password is shown only once.</div>
          <div class="obs-kv">
            <dt>Grafana</dt><dd><a href="${esc(d.grafanaUrl)}" target="_blank" rel="noopener">${esc(d.grafanaUrl)}</a></dd>
            <dt>Username</dt><dd>${esc(d.name)}</dd>
            <dt>Password</dt><dd><span id="obs-pw-value" data-pw="${esc(d.password)}">${'•'.repeat(d.password.length)}</span>
              <button id="obs-pw-toggle" class="btn btn-outline-secondary btn-sm" style="padding:0 6px;font-size:11px;margin-left:6px">👁 Show</button>
              <button id="obs-pw-copy" class="btn btn-outline-secondary btn-sm" style="padding:0 6px;font-size:11px;margin-left:4px">📋 Copy</button></dd>
          </div>
          <div style="margin-top:8px">${esc(d.note)}</div>
        </div>`;
      const pw = document.getElementById('obs-pw-value');
      let shown = false;
      on('obs-pw-toggle', () => {
        shown = !shown;
        pw.textContent = shown ? pw.dataset.pw : '•'.repeat(pw.dataset.pw.length);
        document.getElementById('obs-pw-toggle').textContent = shown ? '🙈 Hide' : '👁 Show';
      });
      on('obs-pw-copy', async () => {
        try { await navigator.clipboard.writeText(pw.dataset.pw); setText('obs-pw-copy', '✅ Copied'); setTimeout(() => setText('obs-pw-copy', '📋 Copy'), 1500); }
        catch { setText('obs-pw-copy', 'Copy failed', true); }
      });
      state.readers = await axios.get(`${api()}/reader`, auth()).then(r => r.data || []).catch(() => state.readers.concat(name));
      const rows = document.querySelector('.obs-table tbody');
      if (rows) rows.innerHTML = state.readers.map(r => `<tr><td class="mono">${esc(r)}</td><td style="width:70px"><button class="btn btn-outline-danger btn-sm obs-reader-del" data-name="${esc(r)}" style="padding:1px 8px;font-size:11px">Delete</button></td></tr>`).join('');
      bindReaderDelete();
      document.getElementById('obs-reader-name').value = '';
      document.getElementById('obs-reader-pass').value = '';
    } catch (e) { box.innerHTML = `<div class="obs-note" style="color:#dc3545">❌ ${esc(errMsg(e))}</div>`; }
  });
  bindReaderDelete();
}

function bindReaderDelete() {
  document.querySelectorAll('.obs-reader-del').forEach(btn => {
    btn.onclick = async () => {
      const name = btn.dataset.name;
      const ok = await Swal.fire({ title: `Delete account '${name}'?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Delete' });
      if (!ok.isConfirmed) return;
      try {
        await axios.delete(`${api()}/reader/${encodeURIComponent(name)}`, { ...auth(), timeout: 60000 });
        await load();
      } catch (e) { Swal.fire({ icon: 'error', title: errMsg(e) }); }
    };
  });
}

function bindSetup() {
  const domainSel = document.getElementById('obs-domain');
  const recordIn = document.getElementById('obs-record');
  const fqdnBox = document.getElementById('obs-fqdn');
  const updateFqdn = () => {
    const d = domainSel?.value; const r = (recordIn?.value || '').trim();
    if (!fqdnBox) return;
    fqdnBox.style.display = d ? 'block' : 'none';
    if (d) fqdnBox.textContent = `Grafana and the OTLP endpoint will be https://${r || 'obs-xxx (random, unused name)'}.${d} with a Let's Encrypt certificate. An explicit record must not already exist.`;
  };
  domainSel?.addEventListener('change', updateFqdn);
  recordIn?.addEventListener('input', updateFqdn);

  on('obs-create', async () => {
    const body = {
      nsId: document.getElementById('obs-ns')?.value.trim() || undefined,
      name: document.getElementById('obs-name')?.value.trim() || undefined,
      retentionDays: parseInt(document.getElementById('obs-retention')?.value) || undefined,
      domainName: domainSel?.value || undefined,
      recordName: domainSel?.value ? (recordIn?.value.trim() || undefined) : undefined,
    };
    const btn = document.getElementById('obs-create');
    btn.disabled = true;
    // The request blocks until the stack is up; meanwhile the Infra and the registration are polled so the
    // user sees which phase is running (VM provisioning → install → registration and test).
    const ns = body.nsId || 'system', name = body.name || 'obs', started = Date.now();
    const fmt = (ms) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
    // the clock ticks every second; the phase is looked up every 10 seconds
    let phase = 'provisioning the VM';
    const show = () => setText('obs-create-status', `⏳ ${fmt(Date.now() - started)} · ${phase}`);
    const lookup = async () => {
      let next = 'provisioning the VM';
      try {
        const inf = await axios.get(`${tbApiBase()}/ns/${ns}/infra/${name}`, { ...auth(), timeout: 10000 });
        const st = inf.data?.status || '';
        next = /running/i.test(st) ? 'installing the stack on the VM (nginx, OTel Collector, Prometheus, Loki, Grafana)' : `VM ${st.toLowerCase() || 'creating'}`;
      } catch { /* 404 until the Infra exists */ }
      try { const o = await axios.get(api(), { ...auth(), timeout: 10000 }); if (o.status === 200) next = 'registered, running the round-trip test'; } catch { /* not yet */ }
      phase = next;
    };
    show();
    const clock = setInterval(show, 1000);
    const poller = setInterval(lookup, 10000);
    const stop = () => { clearInterval(clock); clearInterval(poller); };
    try {
      const r = await axios.post(`${api()}/stack`, body, { ...auth(), timeout: 2400000 });
      stop();
      state.created = { ok: r.data?.status === 'Active', message: r.data?.statusMessage, took: fmt(Date.now() - started) };
      await load();
    } catch (e) {
      stop();
      btn.disabled = false;
      setText('obs-create-status', `❌ after ${fmt(Date.now() - started)}: ` + errMsg(e), true);
    }
  });

  on('obs-register', async () => {
    const body = {
      otlpEndpoint: document.getElementById('obs-ext-endpoint')?.value.trim(),
      writeToken: document.getElementById('obs-ext-token')?.value.trim() || undefined,
      grafanaUrl: document.getElementById('obs-ext-grafana')?.value.trim() || undefined,
      grafanaAdminUser: document.getElementById('obs-ext-gf-user')?.value.trim() || undefined,
      grafanaAdminPassword: document.getElementById('obs-ext-gf-pass')?.value || undefined,
      caCert: document.getElementById('obs-ext-ca')?.value.trim() || undefined,
    };
    if (!body.otlpEndpoint) return setText('obs-register-status', 'OTLP endpoint is required', true);
    setText('obs-register-status', 'Registering...');
    try {
      await axios.put(api(), body, { ...auth(), timeout: 60000 });
      await load();
    } catch (e) { setText('obs-register-status', '❌ ' + errMsg(e), true); }
  });
}

export function showObservabilityModal() {
  Swal.fire({
    title: '📈 Observability (OpenTelemetry)',
    html: `${STYLES}<div id="obs-root" class="obs-root"><div style="color:#888;padding:20px;text-align:center"><i class="fas fa-spinner fa-spin"></i> Loading...</div></div>`,
    width: '860px',
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '❌ Close',
    customClass: { popup: 'swal2-infra-context' },
    didOpen: () => load(),
  });
}

// grafanaLinks returns dashboard deep links for an Infra when a stack with Grafana is registered (cached 60s).
let _obsCache = { at: 0, info: null };
export async function grafanaLinks(infraId) {
  if (Date.now() - _obsCache.at > 60000) {
    try {
      const r = await axios.get(api(), { ...auth(), timeout: 10000 });
      _obsCache = { at: Date.now(), info: r.status === 204 || !r.data ? null : r.data };
    } catch { _obsCache = { at: Date.now(), info: null }; }
  }
  const g = _obsCache.info?.grafanaUrl;
  if (!g) return null;
  const q = encodeURIComponent(infraId);
  return { overview: `${g}/d/tb-infra-overview?var-infra=${q}`, logs: `${g}/d/tb-node-logs?var-infra=${q}`, gpu: `${g}/d/tb-gpu?var-infra=${q}` };
}

window.showObservabilityModal = showObservabilityModal;
window.grafanaLinks = grafanaLinks;
