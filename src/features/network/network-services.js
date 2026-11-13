/**
 * Multi-Cloud Network Services Feature Module (Regional NLB, Site-to-Site VPN, Global MCNLB)
 * @module features/network
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import { tbApiBase, getConfig } from '../../core/api.js';
import { escapeHtml } from '../../core/utils.js';
import { POPUP_STYLES } from '../../common/popup-styles.js';

const addSpinnerTask = (name) => (window.addSpinnerTask ? window.addSpinnerTask(name) : name);
const removeSpinnerTask = (id) => { if (window.removeSpinnerTask) window.removeSpinnerTask(id); };
const errorAlert = (msg) => (window.errorAlert ? window.errorAlert(msg) : Swal.fire({ icon: 'error', title: msg, showConfirmButton: true }));
const successAlert = (msg) => (window.successAlert ? window.successAlert(msg) : Swal.fire({ icon: 'success', title: msg, showConfirmButton: false, timer: 2500 }));

const getInfra = () => { if (window.getInfra) window.getInfra(); };
const executeRemoteCmd = (...args) => { if (window.executeRemoteCmd) window.executeRemoteCmd(...args); };
const displayJsonData = (...args) => { if (window.displayJsonData) window.displayJsonData(...args); };
const typeInfo = window.typeInfo || 'info';

const infraidElement = new Proxy({}, {
  get: (target, prop) => (window.infraidElement || document.getElementById('infraid') || {})[prop]
});

const selectApp = new Proxy({}, {
  get: (target, prop) => (window.selectApp || document.getElementById('selectApp') || {})[prop]
});

// Helper for element retrieval
const getInfraIdVal = () => {
  const el = document.getElementById('infraid');
  return el ? el.value : (window._currentInfraId || '');
};

function AddMcNLB() {
  var infraid = infraidElement.value;

  if (!infraid) {
    errorAlert("You need to specify the ID of Infra");
    return;
  }

  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = window.configNamespace || config.namespace || '';

  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }

  var url = `${tbApiBase()}/ns/${namespace}/infra/${infraid}/mcSwNlb`;

  Swal.fire({
    title: "Configuration for Global NLB",
    width: 600,
    html:
      "<div style='text-align: left; margin: 20px;'>" +
      "<p><b>Global NLB Configuration:</b></p>" +
      "<p><b>Target Infra:</b> " + infraid + "</p>" +
      "<p><b>Protocol:</b> TCP</p>" +
      "<hr>" +
      "<p><b>Port (listen/target):</b></p>" +
      "</div>",
    input: "number",
    inputValue: 80,
    didOpen: () => {
      const input = Swal.getInput();
      if (input) {
        input.focus();
        input.select();
      }
    },
    inputAttributes: {
      autocapitalize: "off",
    },
    showCancelButton: true,
    confirmButtonText: "Create Global NLB",
    confirmButtonColor: "#28a745",
    position: "top-end",
    backdrop: `rgba(0, 0, 0, 0.08)`,
  }).then((result) => {
    if (result.value) {
      var nlbport = result.value;
      if (isNaN(nlbport) || nlbport <= 0) {
        nlbport = 80;
      }

      var spinnerId = addSpinnerTask("Creating Global NLB");

      var nlbReqTmp = {
        type: "PUBLIC",
        scope: "REGION",
        listener: {
          Protocol: "TCP",
          Port: `${nlbport}`,
        },
        targetGroup: {
          Protocol: "TCP",
          Port: `${nlbport}`,
        },
        HealthChecker: {
          Interval: 10, // default: check every 10 seconds
          Timeout: 10, // default: 10 second timeout per check
          Threshold: 3, // default: 3 consecutive failures to mark unhealthy
        },
      };

      axios({
        method: "post",
        url: url,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify(nlbReqTmp, undefined, 4),
        auth: {
          username: `${username}`,
          password: `${password}`,
        },
      })
        .then((res) => {
          successAlert("Global NLB created successfully");
          getInfra();
        })
        .catch(function (error) {
          errorAlert("Error creating Global NLB: " + (error.response?.data?.message || error.message));
        })
        .finally(function () {
          removeSpinnerTask(spinnerId);
        });
    }
  });
}
window.AddMcNLB = AddMcNLB;

function AddNLB() {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = window.configNamespace || config.namespace || '';
  var infraid = infraidElement.value;

  if (!infraid) {
    errorAlert("You need to specify the ID of Infra");
    return;
  }

  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }

  // Load NodeGroup list for selection
  var nodeGroupUrl = `${tbApiBase()}/ns/${namespace}/infra/${infraid}/nodegroup`;
  var spinnerId = addSpinnerTask("Loading NodeGroup list");

  axios({
    method: "get",
    url: nodeGroupUrl,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 600000,
  })
    .then((res) => {
      var nodeGroupOptions = '';
      
      if (res.data.output && res.data.output.length > 0) {
        res.data.output.forEach((nodeGroupName) => {
          if (nodeGroupName && nodeGroupName.trim() !== "") {
            nodeGroupOptions += `<option value="${nodeGroupName}">${nodeGroupName}</option>`;
          }
        });

        // Show NodeGroup selection dialog with port configuration
        Swal.fire({
          title: "Create Regional NLB",
          width: 600,
          html:
            "<div style='text-align: left; margin: 20px;'>" +
            "<p><b>Regional NLB Configuration:</b></p>" +
            "<p><b>Target Infra:</b> " + infraid + "</p>" +
            "<hr>" +
            "<div class='form-group' style='margin-bottom: 20px;'>" +
            "<label for='nodegroup-select'><b>Available NodeGroups:</b></label>" +
            "<select id='nodegroup-select' class='form-control' style='margin-top: 10px;'>" +
            "<option value=''>-- Select NodeGroup --</option>" +
            nodeGroupOptions +
            "</select>" +
            "</div>" +
            "<div class='form-group'>" +
            "<label for='nlb-port'><b>Port (listen/target):</b></label>" +
            "<input type='number' id='nlb-port' class='form-control' value='80' min='1' max='65535' style='margin-top: 10px;'>" +
            "<small class='form-text text-muted'>TCP protocol will be used</small>" +
            "</div>" +
            "</div>",
          showCancelButton: true,
          confirmButtonText: "Create Regional NLB",
          cancelButtonText: "Cancel",
          confirmButtonColor: "#17a2b8",
          position: "top-end",
          backdrop: `rgba(0, 0, 0, 0.08)`,
          didOpen: () => {
            // Focus on port input after dialog opens
            const portInput = document.getElementById('nlb-port');
            if (portInput) {
              portInput.focus();
              portInput.select();
            }
          },
          preConfirm: () => {
            const selectedNodeGroup = document.getElementById('nodegroup-select').value;
            const nlbPort = document.getElementById('nlb-port').value;
            
            if (!selectedNodeGroup) {
              Swal.showValidationMessage('Please select a NodeGroup');
              return false;
            }
            
            if (!nlbPort || isNaN(nlbPort) || nlbPort <= 0 || nlbPort > 65535) {
              Swal.showValidationMessage('Please enter a valid port number (1-65535)');
              return false;
            }
            
            return { nodeGroup: selectedNodeGroup, port: parseInt(nlbPort) };
          }
        }).then((result) => {
          if (result.isConfirmed) {
            createRegionalNLB(infraid, result.value.nodeGroup, result.value.port, namespace, hostname, port, username, password);
          }
        });
      } else {
        errorAlert("No NodeGroups found in the selected Infra");
      }
    })
    .catch(function (error) {
      errorAlert("Error loading NodeGroups: " + (error.response?.data?.message || error.message));
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}

// Create Regional NLB with selected NodeGroup and port
function createRegionalNLB(infraid, nodegroupid, nlbport, namespace, hostname, port, username, password) {
  var url = `${tbApiBase()}/ns/${namespace}/infra/${infraid}/nlb`;

  var nlbReqTmp = {
    type: "PUBLIC",
    scope: "REGION",
    listener: {
      Protocol: "TCP",
      Port: `${nlbport}`,
    },
    targetGroup: {
      Protocol: "TCP",
      Port: `${nlbport}`,
      nodeGroupId: `${nodegroupid}`,
    },
    HealthChecker: {
      Interval: 10, // default: check every 10 seconds
      Timeout: 10, // default: 10 second timeout per check
      Threshold: 3, // default: 3 consecutive failures to mark unhealthy
    },
  };

  var spinnerId = addSpinnerTask("Creating Regional NLB");
  
  axios({
    method: "post",
    url: url,
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify(nlbReqTmp, undefined, 4),
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then((res) => {
      successAlert("Regional NLB created successfully");
      getInfra();
    })
    .catch(function (error) {
      errorAlert("Error creating Regional NLB: " + (error.response?.data?.message || error.message));
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}

window.AddNLB = AddNLB;

function DelNLB() {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = window.configNamespace || config.namespace || '';
  var infraid = infraidElement.value;

  if (!infraid) {
    errorAlert("You need to specify the ID of Infra");
    return;
  }

  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }

  // Load NodeGroup list for selection
  var nodeGroupUrl = `${tbApiBase()}/ns/${namespace}/infra/${infraid}/nodegroup`;
  var spinnerId = addSpinnerTask("Loading NodeGroup list");

  axios({
    method: "get",
    url: nodeGroupUrl,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 600000,
  })
    .then((res) => {
      var nodeGroupOptions = '';
      
      if (res.data.output && res.data.output.length > 0) {
        res.data.output.forEach((nodeGroupName) => {
          if (nodeGroupName && nodeGroupName.trim() !== "") {
            nodeGroupOptions += `<option value="${nodeGroupName}">${nodeGroupName}</option>`;
          }
        });

        // Show NodeGroup selection dialog with deletion confirmation
        Swal.fire({
          title: "Delete Regional NLB",
          width: 600,
          html:
            "<div style='text-align: left; margin: 20px;'>" +
            "<p><b>⚠️ Warning:</b> This action cannot be undone.</p>" +
            "<p><b>Target Infra:</b> " + infraid + "</p>" +
            "<hr>" +
            "<div class='form-group' style='margin-bottom: 20px;'>" +
            "<label for='nodegroup-select'><b>Select NodeGroup to Delete NLB:</b></label>" +
            "<select id='nodegroup-select' class='form-control' style='margin-top: 10px;'>" +
            "<option value=''>-- Select NodeGroup --</option>" +
            nodeGroupOptions +
            "</select>" +
            "</div>" +
            "<div class='alert alert-danger' style='margin-top: 15px; padding: 10px; border-radius: 5px;'>" +
            "<strong>Confirmation:</strong> The Regional NLB for the selected NodeGroup will be permanently deleted." +
            "</div>" +
            "</div>",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: "Delete Regional NLB",
          cancelButtonText: "Cancel",
          confirmButtonColor: "#dc3545",
          position: "top-end",
          backdrop: `rgba(0, 0, 0, 0.08)`,
          preConfirm: () => {
            const selectedNodeGroup = document.getElementById('nodegroup-select').value;
            if (!selectedNodeGroup) {
              Swal.showValidationMessage('Please select a NodeGroup');
              return false;
            }
            return selectedNodeGroup;
          }
        }).then((result) => {
          if (result.isConfirmed) {
            deleteRegionalNLB(infraid, result.value, namespace, hostname, port, username, password);
          }
        });
      } else {
        errorAlert("No NodeGroups found in the selected Infra");
      }
    })
    .catch(function (error) {
      errorAlert("Error loading NodeGroups: " + (error.response?.data?.message || error.message));
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}

// Show deletion confirmation dialog after NodeGroup selection
// Separate function to handle the actual deletion
function deleteRegionalNLB(infraid, nodegroupid, namespace, hostname, port, username, password) {
  var url = `${tbApiBase()}/ns/${namespace}/infra/${infraid}/nlb/${nodegroupid}`;
  var spinnerId = addSpinnerTask("Deleting Regional NLB");
  
  axios({
    method: "delete",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then((res) => {
      successAlert("Regional NLB deleted successfully");
      getInfra();
    })
    .catch(function (error) {
      errorAlert("Error deleting Regional NLB: " + (error.response?.data?.message || error.message));
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}
window.DelNLB = DelNLB;

// ============================================================================
// NLB (Regional CSP NLB) — rich manager: list / status / health / targets /
// create / delete. Loads the Infra's NLBs live and shows one tab per NLB plus a
// Create tab. Per-NLB actions run via window.nlb* handlers that reuse window._nlbCtx.
// ============================================================================
// TB does not populate NLBInfo.Status; derive a display status from the CSP
// State carried in keyValueList (e.g. "{Code:provisioning,Reason:null}").
function nlbDisplayStatus(nlb) {
  if (nlb && nlb.status) return nlb.status;
  const kv = ((nlb && nlb.keyValueList) || []).find(k => (k.Key || k.key) === 'State');
  if (kv) {
    const m = /Code:\s*([A-Za-z_-]+)/.exec(kv.Value || kv.value || '');
    if (m) return m[1];
  }
  return 'Unknown';
}

function nlbStatusBadge(status) {
  const s = (status || '').toLowerCase();
  let bg = '#6c757d';
  if (s.includes('available') || s.includes('running') || s.includes('active')) bg = '#28a745';
  else if (s.includes('creat') || s.includes('pending') || s.includes('progress')) bg = '#f0ad4e';
  else if (s.includes('fail') || s.includes('error')) bg = '#dc3545';
  return `<span class="popup-badge" style="background:${bg};color:#fff;">${window.escapeHtml(status || 'Unknown')}</span>`;
}

async function manageNLB(opts) {
  const config = getConfig();
  const { hostname, port, username, password } = config;
  const namespace = window.configNamespace || config.namespace || '';
  // opts.infraId / opts.preselectNlbId let the Net-graph NLB node right-click open
  // this manager scoped to that NLB's Infra with its tab pre-selected.
  const infraid = (opts && opts.infraId) || infraidElement.value;
  const preselectNlbId = (opts && opts.preselectNlbId) || '';
  if (!namespace) { errorAlert("Please select a namespace first"); return; }
  if (!infraid) { errorAlert("Please select an Infra first"); return; }
  window._nlbCtx = { hostname, port, username, password, namespace, infraid };
  const base = `${tbApiBase()}/ns/${namespace}/infra/${infraid}`;
  const esc = (v) => window.escapeHtml(String(v == null ? '' : v));

  const spinnerId = addSpinnerTask("Loading NLBs");
  let nlbs = [], nodeGroups = [];
  try {
    const [nlbRes, ngRes] = await Promise.all([
      axios({ method: 'get', url: `${base}/nlb`, auth: { username, password } }).catch(() => ({ data: {} })),
      axios({ method: 'get', url: `${base}/nodegroup`, auth: { username, password } }).catch(() => ({ data: {} })),
    ]);
    nlbs = (nlbRes.data && nlbRes.data.nlb) || [];
    nodeGroups = (ngRes.data && ngRes.data.output) || [];
  } finally { removeSpinnerTask(spinnerId); }

  // Which NLB tab to open first (preselect from the Net graph, else the first).
  const activeIdx = Math.max(0, nlbs.findIndex(n => n.id === preselectNlbId));

  const tabBtn = (id, target, label, color, active) =>
    `<li class="nav-item" role="presentation"><button class="nav-link ${active ? 'active' : ''}" id="${id}" data-bs-toggle="tab" data-bs-target="${target}" type="button" role="tab" style="padding:8px 14px;border:none;background:none;font-weight:600;font-size:12px;color:${active ? color : '#6c757d'};border-bottom:3px solid ${active ? color : 'transparent'};">${label}</button></li>`;

  const tabButtons = nlbs.map((nlb, idx) => tabBtn(`nlb-tab-${idx}`, `#nlb-content-${idx}`, esc(nlb.name || nlb.id), '#0d6efd', idx === activeIdx)).join('')
    + tabBtn('nlb-tab-create', '#nlb-content-create', '➕ Create', '#28a745', nlbs.length === 0);

  const nlbPanes = nlbs.map((nlb, idx) => {
    const li = nlb.listener || {}, tg = nlb.targetGroup || {}, hc = nlb.healthChecker || {};
    const nodes = tg.nodes || [];
    const lHost = li.ip || li.dnsName || '';
    const endpoint = lHost || '—';
    const lScheme = String(li.port) === '443' ? 'https' : 'http';
    const openUrl = lHost ? `${lScheme}://${lHost}${li.port ? ':' + li.port : ''}` : '';
    return `
    <div class="tab-pane fade ${idx === activeIdx ? 'show active' : ''}" id="nlb-content-${idx}" role="tabpanel">
      <div class="popup-section">
        <div class="popup-section-title">⚖️ ${esc(nlb.name || nlb.id)} &nbsp; <span id="nlb-status-${idx}">${nlbStatusBadge(nlbDisplayStatus(nlb))}</span></div>
        <div class="popup-row">
          <div class="popup-col"><div class="popup-field"><label class="popup-label">Type / Scope</label><span class="popup-value-sm">${esc(nlb.Type || nlb.type)} / ${esc(nlb.Scope || nlb.scope)}</span></div></div>
          <div class="popup-col"><div class="popup-field"><label class="popup-label">Connection</label><span class="popup-value-sm">${esc(nlb.connectionName)}</span></div></div>
          <div class="popup-col" style="flex:2;"><div class="popup-field"><label class="popup-label">CSP Resource</label><span class="popup-value-sm">${esc(nlb.cspResourceId || nlb.cspResourceName || '—')}</span></div></div>
        </div>
        <div class="popup-row"><div class="popup-col"><span class="popup-hint">ℹ️ Status is captured at creation time — CB-Tumblebug does not re-sync NLB state from the CSP (a "provisioning" NLB is usually already active by now). Use ❤️ Health below for the live state.</span></div></div>
      </div>
      <div class="popup-section">
        <div class="popup-section-title">🔌 Listener (client endpoint)</div>
        <div class="popup-row">
          <div class="popup-col" style="flex:2;"><div class="popup-field"><label class="popup-label">Endpoint</label><span class="popup-value-highlight">${esc(endpoint)}:${esc(li.port)}</span>${openUrl ? ` <a href="${esc(openUrl)}" target="_blank" rel="noopener" style="margin-left:8px;font-size:12px;text-decoration:none;" title="Open ${esc(openUrl)} in a new tab">🔗 Open</a>` : ''}</div></div>
          <div class="popup-col"><div class="popup-field"><label class="popup-label">Protocol</label><span class="popup-value-sm">${esc(li.protocol)}</span></div></div>
        </div>
        ${li.dnsName ? `<div class="popup-row"><div class="popup-col"><span class="popup-hint">DNS: ${esc(li.dnsName)}</span></div></div>` : ''}
      </div>
      <div class="popup-section">
        <div class="popup-section-title">🎯 Target — NodeGroup <b>${esc(tg.nodeGroupId)}</b> (${esc(tg.protocol)}:${esc(tg.port)})</div>
        <div class="popup-row"><div class="popup-col" style="flex:1;display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
          ${nodes.length ? nodes.map(nd => `<span class="popup-badge" style="background:#eef2f7;color:#334155;">${esc(nd)} <a href="#" onclick="window.nlbRemoveNode('${esc(nlb.id)}','${esc(nd)}');return false;" style="color:#dc3545;text-decoration:none;font-weight:bold;" title="Remove from NLB">✕</a></span>`).join('') : '<span class="popup-hint">No target nodes</span>'}
        </div></div>
        <div class="popup-row"><div class="popup-col"><button type="button" class="btn btn-sm btn-outline-secondary" onclick="window.nlbAddNode('${esc(nlb.id)}')">➕ Add target node</button></div></div>
      </div>
      <div class="popup-section">
        <div class="popup-section-title">❤️ Health <button type="button" class="btn btn-sm btn-outline-info" style="margin-left:8px;" onclick="window.nlbCheckHealth('${esc(nlb.id)}', ${idx})">Check now</button></div>
        <div id="nlb-health-${idx}"><span class="popup-hint">Health checker: interval ${esc(hc.interval)}s · timeout ${esc(hc.timeout)}s · threshold ${esc(hc.threshold)}</span></div>
      </div>
      <div class="popup-row" style="margin-top:10px;"><div class="popup-col">
        <button type="button" class="btn btn-danger btn-sm" onclick="window.nlbDoDelete('${esc(nlb.id)}')">🗑️ Delete this NLB</button>
      </div></div>
    </div>`;
  }).join('');

  const ngOptions = nodeGroups.map(ng => `<option value="${esc(ng)}">${esc(ng)}</option>`).join('');
  const createPane = `
    <div class="tab-pane fade ${nlbs.length === 0 ? 'show active' : ''}" id="nlb-content-create" role="tabpanel">
      <div class="popup-section">
        <div class="popup-section-title">➕ Create Regional NLB (CSP-native)</div>
        <div class="popup-row">
          <div class="popup-col" style="flex:2;"><div class="popup-field"><label class="popup-label">Target NodeGroup</label>
            <select id="nlb-c-ng" class="popup-select"><option value="">-- select --</option>${ngOptions}</select></div></div>
        </div>
        <div class="popup-row">
          <div class="popup-col"><div class="popup-field"><label class="popup-label">Listener proto</label><select id="nlb-c-lproto" class="popup-select"><option>TCP</option><option>UDP</option></select></div></div>
          <div class="popup-col"><div class="popup-field"><label class="popup-label">Listener port</label><input id="nlb-c-lport" class="popup-input" type="number" value="80" min="1" max="65535"></div></div>
          <div class="popup-col"><div class="popup-field"><label class="popup-label">Target proto</label><select id="nlb-c-tproto" class="popup-select"><option>TCP</option><option>HTTP</option><option>HTTPS</option></select></div></div>
          <div class="popup-col"><div class="popup-field"><label class="popup-label">Target port</label><input id="nlb-c-tport" class="popup-input" type="number" value="80" min="1" max="65535"></div></div>
        </div>
        <div class="popup-row">
          <div class="popup-col"><div class="popup-field"><label class="popup-label">HC interval (s)</label><input id="nlb-c-hcint" class="popup-input" type="number" value="10" min="0"></div></div>
          <div class="popup-col"><div class="popup-field"><label class="popup-label">HC timeout (s)</label><input id="nlb-c-hcto" class="popup-input" type="number" value="10" min="0"></div></div>
          <div class="popup-col"><div class="popup-field"><label class="popup-label">HC threshold</label><input id="nlb-c-hcth" class="popup-input" type="number" value="3" min="0"></div></div>
          <div class="popup-col"></div>
        </div>
        <div class="popup-row"><div class="popup-col"><button type="button" class="btn btn-info" onclick="window.nlbDoCreate()">Create Regional NLB</button></div></div>
      </div>
      <div class="popup-section">
        <div class="popup-section-title">🌍 Global NLB (Multi-cloud HAProxy)</div>
        <div class="popup-row"><div class="popup-col"><span class="popup-hint">Deploys a software (HAProxy) load balancer Infra fronting this Infra's VMs across regions.</span></div></div>
        <div class="popup-row"><div class="popup-col"><button type="button" class="btn btn-success btn-sm" onclick="Swal.close(); manageMCNLB();">🌍 Open Global NLB manager…</button></div></div>
      </div>
    </div>`;

  Swal.fire({
    title: `⚖️ NLB Management — ${esc(infraid)}`,
    width: 920,
    html: `${POPUP_STYLES}
      <div class="popup-container">
        <ul class="nav nav-tabs" id="nlbTabs" role="tablist" style="border-bottom:2px solid #dee2e6;margin-bottom:12px;">${tabButtons}</ul>
        <div class="tab-content" id="nlbTabContent">${nlbPanes}${createPane}</div>
      </div>`,
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: 'Close',
    willClose: () => stopAllNlbPolls(),
    didOpen: () => {
      // Scoped tab switching — only this modal's panes/buttons (never the map's).
      const btns = document.querySelectorAll('#nlbTabs button[data-bs-toggle="tab"]');
      btns.forEach(b => b.addEventListener('click', function (e) {
        e.preventDefault();
        btns.forEach(x => { x.classList.remove('active'); x.style.color = '#6c757d'; x.style.borderBottomColor = 'transparent'; });
        document.querySelectorAll('#nlbTabContent .tab-pane').forEach(p => p.classList.remove('show', 'active'));
        const color = this.id === 'nlb-tab-create' ? '#28a745' : '#0d6efd';
        this.classList.add('active'); this.style.color = color; this.style.borderBottomColor = color;
        const t = document.querySelector(this.getAttribute('data-bs-target'));
        if (t) t.classList.add('show', 'active');
      }));
      // Auto-poll health (3s) for NLBs not yet active; stop each when its targets
      // are all healthy (readiness), flipping its badge to "active".
      nlbs.forEach((nlb, idx) => {
        if ((nlbDisplayStatus(nlb) || '').toLowerCase() !== 'active') startNlbHealthPoll(nlb.id, idx);
      });
    },
  });
}
window.manageNLB = manageNLB;

window.nlbManagerRefresh = () => { Swal.close(); setTimeout(manageNLB, 150); };

window.nlbDoCreate = async () => {
  const c = window._nlbCtx; if (!c) return;
  const ng = document.getElementById('nlb-c-ng').value;
  if (!ng) { errorAlert("Select a target NodeGroup"); return; }
  const body = {
    type: "PUBLIC", scope: "REGION",
    listener: { Protocol: document.getElementById('nlb-c-lproto').value, Port: String(document.getElementById('nlb-c-lport').value || 80) },
    targetGroup: { Protocol: document.getElementById('nlb-c-tproto').value, Port: String(document.getElementById('nlb-c-tport').value || 80), nodeGroupId: ng },
    HealthChecker: {
      Interval: Number(document.getElementById('nlb-c-hcint').value || 10),
      Timeout: Number(document.getElementById('nlb-c-hcto').value || 10),
      Threshold: Number(document.getElementById('nlb-c-hcth').value || 3),
    },
  };
  const s = addSpinnerTask("Creating Regional NLB");
  try {
    await axios({ method: 'post', url: `${tbApiBase()}/ns/${c.namespace}/infra/${c.infraid}/nlb`, headers: { 'Content-Type': 'application/json' }, data: body, auth: { username: c.username, password: c.password } });
    successAlert("Regional NLB created");
    getInfra();
    window.nlbManagerRefresh();
  } catch (e) { errorAlert("Create NLB failed: " + (e.response?.data?.message || e.message)); }
  finally { removeSpinnerTask(s); }
};

window.nlbDoDelete = async (nlbId) => {
  const c = window._nlbCtx; if (!c) return;
  const r = await Swal.fire({ icon: 'warning', title: 'Delete NLB?', text: nlbId, showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#d33' });
  if (!r.isConfirmed) return;
  const s = addSpinnerTask("Deleting NLB");
  try {
    await axios({ method: 'delete', url: `${tbApiBase()}/ns/${c.namespace}/infra/${c.infraid}/nlb/${nlbId}`, auth: { username: c.username, password: c.password } });
    successAlert("NLB deleted");
    getInfra();
    window.nlbManagerRefresh();
  } catch (e) { errorAlert("Delete NLB failed: " + (e.response?.data?.message || e.message)); }
  finally { removeSpinnerTask(s); }
};

// Fetch live health (Spider call) for an NLB → {healthy, unhealthy, all}.
async function nlbFetchHealth(c, nlbId) {
  const res = await axios({ method: 'get', url: `${tbApiBase()}/ns/${c.namespace}/infra/${c.infraid}/nlb/${nlbId}/healthz`, auth: { username: c.username, password: c.password } });
  const h = res.data || {};
  return {
    healthy: h.healthyNodes || h.HealthyNodes || [],
    unhealthy: h.unHealthyNodes || h.unhealthyNodes || h.UnHealthyNodes || [],
    all: h.allNodes || h.AllNodes || [],
  };
}

function nlbRenderHealth(idx, r, polling) {
  const div = document.getElementById(`nlb-health-${idx}`);
  if (!div) return;
  const esc = (v) => window.escapeHtml(String(v == null ? '' : v));
  const note = polling ? ' <span style="color:#0d6efd;">🔄 auto-updating every 3s…</span>' : '';
  div.innerHTML = `<div style="font-size:12px;line-height:1.7;">
    <div>✅ Healthy (${r.healthy.length}): ${r.healthy.map(esc).join(', ') || '—'}</div>
    <div>❌ Unhealthy (${r.unhealthy.length}): ${r.unhealthy.map(esc).join(', ') || '—'}</div>
    <div style="color:#888;">Total nodes: ${r.all.length}${note}</div></div>`;
}

window.nlbCheckHealth = async (nlbId, idx) => {
  const c = window._nlbCtx; if (!c) return;
  const div = document.getElementById(`nlb-health-${idx}`);
  if (div) div.innerHTML = '<span class="popup-hint">Checking…</span>';
  try { nlbRenderHealth(idx, await nlbFetchHealth(c, nlbId), false); }
  catch (e) {
    if (div) div.innerHTML = `<span style="color:#dc3545;font-size:12px;">Health check failed: ${window.escapeHtml(e.response?.data?.message || e.message)}</span>`;
  }
};

// Auto-poll health every 3s until an NLB is ready (all targets healthy), then flip
// its status badge to "active" and stop. TB never re-syncs NLB state from the CSP,
// so "all targets healthy" (a live Spider signal) is the practical readiness stop
// condition. Capped so a genuinely unhealthy target cannot poll forever.
window._nlbPollers = window._nlbPollers || {};
function stopNlbPoll(idx) {
  if (window._nlbPollers[idx]) { clearInterval(window._nlbPollers[idx]); delete window._nlbPollers[idx]; }
}
function stopAllNlbPolls() { Object.keys(window._nlbPollers || {}).forEach(stopNlbPoll); }
function markNlbActive(idx) {
  const el = document.getElementById(`nlb-status-${idx}`);
  if (el) el.innerHTML = nlbStatusBadge('active');
}
function startNlbHealthPoll(nlbId, idx) {
  const c = window._nlbCtx; if (!c) return;
  stopNlbPoll(idx);
  let attempts = 0;
  const MAX = 60; // ~3 min at 3s
  const tick = async () => {
    attempts++;
    if (!document.getElementById(`nlb-health-${idx}`)) { stopNlbPoll(idx); return; } // modal closed
    let r = null;
    try { r = await nlbFetchHealth(c, nlbId); } catch (e) { /* transient — keep polling */ }
    if (r) {
      const ready = r.all.length > 0 && r.unhealthy.length === 0;
      nlbRenderHealth(idx, r, !ready);
      if (ready) { markNlbActive(idx); stopNlbPoll(idx); return; }
    }
    if (attempts >= MAX) stopNlbPoll(idx);
  };
  window._nlbPollers[idx] = setInterval(tick, 3000);
  tick(); // immediate first check
}

window.nlbAddNode = async (nlbId) => {
  const c = window._nlbCtx; if (!c) return;
  let nodes = [];
  try {
    const res = await axios({ method: 'get', url: `${tbApiBase()}/ns/${c.namespace}/infra/${c.infraid}`, auth: { username: c.username, password: c.password } });
    nodes = (res.data && res.data.node || []).map(n => n.id);
  } catch (e) { /* ignore */ }
  if (!nodes.length) { errorAlert("No nodes available in this Infra"); return; }
  const { value: nodeId } = await Swal.fire({
    title: 'Add target node to NLB', input: 'select',
    inputOptions: Object.fromEntries(nodes.map(n => [n, n])), inputPlaceholder: 'Select a node',
    showCancelButton: true, confirmButtonText: 'Add',
  });
  if (!nodeId) return;
  const s = addSpinnerTask("Adding node to NLB");
  try {
    await axios({ method: 'post', url: `${tbApiBase()}/ns/${c.namespace}/infra/${c.infraid}/nlb/${nlbId}/node`, headers: { 'Content-Type': 'application/json' }, data: { targetGroup: { nodes: [nodeId] } }, auth: { username: c.username, password: c.password } });
    successAlert("Node added to NLB");
    window.nlbManagerRefresh();
  } catch (e) { errorAlert("Add node failed: " + (e.response?.data?.message || e.message)); }
  finally { removeSpinnerTask(s); }
};

window.nlbRemoveNode = async (nlbId, nodeId) => {
  const c = window._nlbCtx; if (!c) return;
  const r = await Swal.fire({ icon: 'warning', title: 'Remove node from NLB?', text: nodeId, showCancelButton: true, confirmButtonText: 'Remove', confirmButtonColor: '#d33' });
  if (!r.isConfirmed) return;
  const s = addSpinnerTask("Removing node from NLB");
  try {
    await axios({ method: 'delete', url: `${tbApiBase()}/ns/${c.namespace}/infra/${c.infraid}/nlb/${nlbId}/node`, headers: { 'Content-Type': 'application/json' }, data: { targetGroup: { nodes: [nodeId] } }, auth: { username: c.username, password: c.password } });
    successAlert("Node removed from NLB");
    window.nlbManagerRefresh();
  } catch (e) { errorAlert("Remove node failed: " + (e.response?.data?.message || e.message)); }
  finally { removeSpinnerTask(s); }
};

// ============================================================================
// Site-to-site VPN — rich manager: list / status / sites / health / create /
// delete / reconcile. VPN status is derived by TB (from conditions), so it is
// populated; a per-VPN "Refresh from CSP" re-syncs live via Terrarium.
// ============================================================================
function vpnStatusBadge(status) {
  const s = (status || '').toLowerCase();
  let bg = '#6c757d';
  if (s.includes('available')) bg = '#28a745';
  else if (s.includes('creat') || s.includes('regist')) bg = '#f0ad4e';
  else if (s.includes('delet') || s.includes('deregist')) bg = '#e67e22';
  else if (s.includes('fail') || s.includes('error')) bg = '#dc3545';
  return `<span class="popup-badge" style="background:${bg};color:#fff;">${window.escapeHtml(status || 'Unknown')}</span>`;
}

// Best-effort scan of the raw terrarium cspResourceDetail for gateway public IPs.
function vpnGatewayIps(resourceDetails) {
  const out = [];
  const scan = (o) => {
    if (!o || typeof o !== 'object') return;
    Object.keys(o).forEach((k) => {
      const val = o[k];
      if (typeof val === 'string' && /ip/i.test(k) && /^\d{1,3}(\.\d{1,3}){3}$/.test(val)) out.push(val);
      else if (val && typeof val === 'object') scan(val);
    });
  };
  (resourceDetails || []).forEach((r) => {
    const d = r.cspResourceDetail;
    if (Array.isArray(d)) d.forEach(scan); else scan(d);
  });
  return [...new Set(out)];
}

async function manageVPN(opts) {
  const config = getConfig();
  const { hostname, port, username, password } = config;
  const namespace = window.configNamespace || config.namespace || '';
  const infraid = (opts && opts.infraId) || infraidElement.value;
  const preselectVpnId = (opts && opts.preselectVpnId) || '';
  if (!namespace) { errorAlert("Please select a namespace first"); return; }
  if (!infraid) { errorAlert("Please select an Infra first"); return; }
  window._vpnCtx = { hostname, port, username, password, namespace, infraid };
  const base = `${tbApiBase()}/ns/${namespace}/infra/${infraid}`;
  const esc = (v) => window.escapeHtml(String(v == null ? '' : v));

  const spinnerId = addSpinnerTask("Loading VPNs");
  let vpns = [], sites = {};
  try {
    const [vpnRes, siteRes] = await Promise.all([
      axios({ method: 'get', url: `${base}/vpn?option=InfoList`, auth: { username, password } }).catch(() => ({ data: {} })),
      axios({ method: 'get', url: `${base}/site`, auth: { username, password } }).catch(() => ({ data: {} })),
    ]);
    vpns = (vpnRes.data && vpnRes.data.vpnInfoList) || [];
    sites = (siteRes.data && siteRes.data.sites) || {};
  } finally { removeSpinnerTask(spinnerId); }

  const activeIdx = Math.max(0, vpns.findIndex(v => v.id === preselectVpnId));

  const tabBtn = (id, target, label, color, active) =>
    `<li class="nav-item" role="presentation"><button class="nav-link ${active ? 'active' : ''}" id="${id}" data-bs-toggle="tab" data-bs-target="${target}" type="button" role="tab" style="padding:8px 14px;border:none;background:none;font-weight:600;font-size:12px;color:${active ? color : '#6c757d'};border-bottom:3px solid ${active ? color : 'transparent'};">${label}</button></li>`;

  const tabButtons = vpns.map((v, idx) => tabBtn(`vpn-tab-${idx}`, `#vpn-content-${idx}`, esc(v.name || v.id), '#0d6efd', idx === activeIdx)).join('')
    + tabBtn('vpn-tab-create', '#vpn-content-create', '➕ Create', '#28a745', vpns.length === 0);

  const vpnPanes = vpns.map((v, idx) => {
    const sitesHtml = (v.vpnSites || []).map((site) => {
      const cc = site.connectionConfig || {};
      const region = (cc.regionDetail && cc.regionDetail.regionName) || cc.regionZoneInfoName || '';
      const provider = cc.providerName || '';
      const rd = site.resourceDetails || [];
      const ips = vpnGatewayIps(rd);
      return `<div style="border:1px solid #e2e8f0;border-radius:6px;padding:8px;margin:5px 0;">
        <div style="font-weight:600;">${esc(site.connectionName)} <span style="color:#888;font-weight:400;font-size:12px;">${esc(provider)} ${esc(region)}</span></div>
        ${ips.length ? `<div style="font-size:12px;">Gateway IP: <b>${ips.map(esc).join(', ')}</b></div>` : ''}
        <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${rd.map(r => `${esc(r.cspResourceId || r.cspResourceName || '')}${r.status ? ' (' + esc(r.status) + ')' : ''}`).join('<br>') || '—'}</div>
      </div>`;
    }).join('');
    return `<div class="tab-pane fade ${idx === activeIdx ? 'show active' : ''}" id="vpn-content-${idx}" role="tabpanel">
      <div class="popup-section">
        <div class="popup-section-title">🔒 ${esc(v.name || v.id)} &nbsp; <span id="vpn-status-${idx}">${vpnStatusBadge(v.status)}</span></div>
        ${v.systemMessage ? `<div class="popup-row"><div class="popup-col"><span class="popup-hint">${esc(v.systemMessage)}</span></div></div>` : ''}
        <div class="popup-row"><div class="popup-col"><button type="button" class="btn btn-sm btn-outline-secondary" onclick="window.vpnRefresh('${esc(v.id)}')">🔄 Refresh from CSP</button></div></div>
      </div>
      <div class="popup-section">
        <div class="popup-section-title">🌐 Sites (tunnel endpoints)</div>
        ${sitesHtml || '<span class="popup-hint">No site details</span>'}
      </div>
      <div class="popup-section">
        <div class="popup-section-title">❤️ Health (bidirectional ping) <button type="button" class="btn btn-sm btn-outline-info" style="margin-left:8px;" onclick="window.vpnHealth('${esc(v.id)}', ${idx})">Run check</button></div>
        <div id="vpn-health-${idx}"><span class="popup-hint">Pings between site nodes through the tunnel (may take up to ~1 min).</span></div>
      </div>
      <div class="popup-row" style="margin-top:10px;"><div class="popup-col">
        <button type="button" class="btn btn-danger btn-sm" onclick="window.vpnDelete('${esc(v.id)}', false)">🗑️ Delete</button>
        <button type="button" class="btn btn-outline-danger btn-sm" style="margin-left:6px;" onclick="window.vpnDelete('${esc(v.id)}', true)" title="Reconcile TB metadata vs CSP (fixes stuck/failed state) without a Terrarium delete">🧹 Reconcile</button>
      </div></div>
    </div>`;
  }).join('');

  const siteOptions = [];
  Object.keys(sites).forEach((csp) => (sites[csp] || []).forEach((s) => siteOptions.push({ csp, ...s })));
  window._vpnSiteOptions = siteOptions;
  const siteOptHtml = siteOptions.map((s, i) => `<option value="${i}">${esc(s.csp)} · ${esc(s.region)} · ${esc(s.vnet)}</option>`).join('');
  const createPane = `<div class="tab-pane fade ${vpns.length === 0 ? 'show active' : ''}" id="vpn-content-create" role="tabpanel">
    <div class="popup-section">
      <div class="popup-section-title">➕ Create Site-to-site VPN</div>
      <div class="popup-row"><div class="popup-col"><span class="popup-hint">⏱️ Creation is long-running (typically 15–45 min). It runs in the background — you can keep working; you'll be notified when done. One site must be <b>AWS</b>.</span></div></div>
      <div class="popup-row"><div class="popup-col" style="flex:2;"><div class="popup-field"><label class="popup-label">VPN name</label><input id="vpn-c-name" class="popup-input" placeholder="vpn01"></div></div></div>
      <div class="popup-row">
        <div class="popup-col" style="flex:2;"><div class="popup-field"><label class="popup-label">Site 1 (VNet)</label><select id="vpn-c-site1" class="popup-select"><option value="">-- select --</option>${siteOptHtml}</select></div></div>
        <div class="popup-col"><div class="popup-field"><label class="popup-label">Site 1 BGP ASN (opt)</label><input id="vpn-c-asn1" class="popup-input" placeholder="auto"></div></div>
      </div>
      <div class="popup-row">
        <div class="popup-col" style="flex:2;"><div class="popup-field"><label class="popup-label">Site 2 (VNet)</label><select id="vpn-c-site2" class="popup-select"><option value="">-- select --</option>${siteOptHtml}</select></div></div>
        <div class="popup-col"><div class="popup-field"><label class="popup-label">Site 2 BGP ASN (opt)</label><input id="vpn-c-asn2" class="popup-input" placeholder="auto"></div></div>
      </div>
      <div class="popup-row"><div class="popup-col"><button type="button" class="btn btn-success" onclick="window.vpnCreate()">Create VPN (background)</button></div></div>
    </div>
  </div>`;

  Swal.fire({
    title: `🔒 Site-to-site VPN — ${esc(infraid)}`,
    width: 920,
    html: `${POPUP_STYLES}<div class="popup-container">
      <ul class="nav nav-tabs" id="vpnTabs" role="tablist" style="border-bottom:2px solid #dee2e6;margin-bottom:12px;">${tabButtons}</ul>
      <div class="tab-content" id="vpnTabContent">${vpnPanes}${createPane}</div>
    </div>`,
    showConfirmButton: false, showCancelButton: true, cancelButtonText: 'Close',
    didOpen: () => {
      const btns = document.querySelectorAll('#vpnTabs button[data-bs-toggle="tab"]');
      btns.forEach(b => b.addEventListener('click', function (e) {
        e.preventDefault();
        btns.forEach(x => { x.classList.remove('active'); x.style.color = '#6c757d'; x.style.borderBottomColor = 'transparent'; });
        document.querySelectorAll('#vpnTabContent .tab-pane').forEach(p => p.classList.remove('show', 'active'));
        const color = this.id === 'vpn-tab-create' ? '#28a745' : '#0d6efd';
        this.classList.add('active'); this.style.color = color; this.style.borderBottomColor = color;
        const t = document.querySelector(this.getAttribute('data-bs-target'));
        if (t) t.classList.add('show', 'active');
      }));
    },
  });
}
window.manageVPN = manageVPN;
window.vpnManagerRefresh = () => { Swal.close(); setTimeout(manageVPN, 150); };

function vpnSiteBody(opt, asn) {
  const csp = (opt.csp || '').toLowerCase();
  const prop = {};
  const inner = {};
  if (asn) inner.bgpAsn = String(asn);
  if (csp === 'azure' && opt.gatewaySubnetCidr) inner.gatewaySubnetCidr = opt.gatewaySubnetCidr;
  prop[csp] = inner;
  return { vNetId: opt.vnet, cspSpecificProperty: prop };
}

window.vpnCreate = async () => {
  const c = window._vpnCtx; if (!c) return;
  const name = document.getElementById('vpn-c-name').value.trim();
  const i1 = document.getElementById('vpn-c-site1').value, i2 = document.getElementById('vpn-c-site2').value;
  const asn1 = document.getElementById('vpn-c-asn1').value.trim(), asn2 = document.getElementById('vpn-c-asn2').value.trim();
  if (!name) { errorAlert("Enter a VPN name"); return; }
  if (i1 === '' || i2 === '' || i1 === i2) { errorAlert("Select two different sites"); return; }
  const opts = window._vpnSiteOptions || [];
  const s1 = opts[Number(i1)], s2 = opts[Number(i2)];
  if (![s1.csp, s2.csp].map(x => (x || '').toLowerCase()).includes('aws')) { errorAlert("One site must be AWS"); return; }
  const body = { name, site1: vpnSiteBody(s1, asn1), site2: vpnSiteBody(s2, asn2) };
  Swal.close();
  const sp = addSpinnerTask(`Creating VPN '${name}' (15–45 min)…`);
  try {
    await axios({ method: 'post', url: `${tbApiBase()}/ns/${c.namespace}/infra/${c.infraid}/vpn`, headers: { 'Content-Type': 'application/json' }, data: body, auth: { username: c.username, password: c.password }, timeout: 3600000 });
    successAlert(`VPN '${name}' created`);
    getInfra();
  } catch (e) { errorAlert("Create VPN failed: " + (e.response?.data?.message || e.message)); }
  finally { removeSpinnerTask(sp); }
};

window.vpnDelete = async (vpnId, reconcile) => {
  const c = window._vpnCtx; if (!c) return;
  const r = await Swal.fire({ icon: 'warning', title: reconcile ? 'Reconcile VPN metadata?' : 'Delete VPN?', text: vpnId, showCancelButton: true, confirmButtonText: reconcile ? 'Reconcile' : 'Delete', confirmButtonColor: '#d33' });
  if (!r.isConfirmed) return;
  const sp = addSpinnerTask(reconcile ? "Reconciling VPN…" : "Deleting VPN (may take minutes)…");
  try {
    const url = `${tbApiBase()}/ns/${c.namespace}/infra/${c.infraid}/vpn/${vpnId}${reconcile ? '?option=reconcile' : ''}`;
    await axios({ method: 'delete', url, auth: { username: c.username, password: c.password }, timeout: 3600000 });
    successAlert(reconcile ? "VPN reconciled" : "VPN deleted");
    getInfra();
    window.vpnManagerRefresh();
  } catch (e) { errorAlert("VPN delete failed: " + (e.response?.data?.message || e.message)); }
  finally { removeSpinnerTask(sp); }
};

window.vpnHealth = async (vpnId, idx) => {
  const c = window._vpnCtx; if (!c) return;
  const div = document.getElementById(`vpn-health-${idx}`);
  if (div) div.innerHTML = '<span class="popup-hint">Running ping test through the tunnel…</span>';
  try {
    const res = await axios({ method: 'post', url: `${tbApiBase()}/ns/${c.namespace}/infra/${c.infraid}/vpn/${vpnId}/health`, headers: { 'Content-Type': 'application/json' }, data: {}, auth: { username: c.username, password: c.password }, timeout: 300000 });
    const h = res.data || {};
    const e2 = (v) => window.escapeHtml(String(v == null ? '' : v));
    const rows = (h.results || []).map(r => `<div>${r.reachable ? '✅' : '❌'} ${e2(r.direction)}: ${e2(r.message || '')}</div>`).join('');
    if (div) div.innerHTML = `<div style="font-size:12px;line-height:1.7;"><div><b>${h.reachable ? '✅ Reachable' : '❌ Not reachable'}</b> — ${e2(h.message || '')}</div>${rows}</div>`;
  } catch (e) {
    if (div) div.innerHTML = `<span style="color:#dc3545;font-size:12px;">Health check failed: ${window.escapeHtml(e.response?.data?.message || e.message)}</span>`;
  }
};

window.vpnRefresh = async (vpnId) => {
  const c = window._vpnCtx; if (!c) return;
  const sp = addSpinnerTask("Refreshing VPN from CSP…");
  try {
    await axios({ method: 'get', url: `${tbApiBase()}/ns/${c.namespace}/infra/${c.infraid}/vpn/${vpnId}?refresh=true`, auth: { username: c.username, password: c.password }, timeout: 120000 });
    window.vpnManagerRefresh();
  } catch (e) { errorAlert("Refresh failed: " + (e.response?.data?.message || e.message)); }
  finally { removeSpinnerTask(sp); }
};

// ============================================================================
// Global NLB (MCNLB, multi-cloud HAProxy) — manager.
// IMPORTANT: an MCNLB has no dedicated resource endpoints; it is deployed as its
// OWN Infra named "{targetInfraId}-nlb" (see nlbPostfix) and is created/queried/
// deleted as an Infra. So this manager works against that host Infra: create it,
// view the HAProxy host + stats, or delete it.
// ============================================================================
async function manageMCNLB(opts) {
  const config = getConfig();
  const { hostname, port, username, password } = config;
  const namespace = window.configNamespace || config.namespace || '';
  let infraid = (opts && opts.infraId) || infraidElement.value;
  if (!namespace) { errorAlert("Please select a namespace first"); return; }
  if (!infraid) { errorAlert("Please select an Infra first"); return; }
  // Accept being opened from either the target Infra or its "-nlb" host.
  const targetInfraId = infraid.endsWith('-nlb') ? infraid.slice(0, -4) : infraid;
  const hostInfraId = `${targetInfraId}-nlb`;
  window._mcnlbCtx = { hostname, port, username, password, namespace, targetInfraId, hostInfraId };
  const esc = (v) => window.escapeHtml(String(v == null ? '' : v));

  const spinnerId = addSpinnerTask("Loading Global NLB");
  let host = null;
  try {
    const res = await axios({ method: 'get', url: `${tbApiBase()}/ns/${namespace}/infra/${hostInfraId}`, auth: { username, password } }).catch(() => null);
    if (res && res.data && (res.data.id || (res.data.node && res.data.node.length))) host = res.data;
  } finally { removeSpinnerTask(spinnerId); }

  let bodyHtml;
  if (host) {
    const nodes = host.node || [];
    const nodeRows = nodes.map((n) => {
      const ip = n.publicIP || '';
      const stats = ip ? `<a href="http://${esc(ip)}:9000/" target="_blank" rel="noopener" style="margin-left:8px;font-size:12px;text-decoration:none;" title="HAProxy stats (admin: default/default)">🔗 HAProxy stats</a>` : '';
      const running = /running/i.test(n.status || '');
      return `<div style="border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;margin:4px 0;">
        <b>${esc(n.id)}</b> <span class="popup-badge" style="background:${running ? '#28a745' : '#6c757d'};color:#fff;">${esc(n.status || '')}</span>
        <div style="font-size:12px;">public: ${esc(n.publicIP || '—')} · private: ${esc(n.privateIP || '—')}${stats}</div>
      </div>`;
    }).join('');
    bodyHtml = `
      <div class="popup-section">
        <div class="popup-section-title">🌐 Global NLB host: ${esc(hostInfraId)} <span class="popup-badge" style="background:#4b2c85;color:#fff;">${esc(host.status || '')}</span></div>
        <div class="popup-row"><div class="popup-col"><span class="popup-hint">HAProxy cluster fronting <b>${esc(targetInfraId)}</b>'s VMs (backends via their public IPs). Open a host's HAProxy stats (admin: default/default) for live frontends/backends. Note: this host is itself an Infra.</span></div></div>
        ${nodeRows || '<span class="popup-hint">No host nodes</span>'}
      </div>
      <div class="popup-section">
        <div class="popup-section-title">🔥 Firewall (host)</div>
        <div class="popup-row"><div class="popup-col"><span class="popup-hint">HAProxy binds the frontend port and <b>:9000</b> (stats). Open those inbound ports on this host Infra's Security Group for external access.</span></div></div>
        <div class="popup-row"><div class="popup-col"><button type="button" class="btn btn-warning btn-sm" onclick="Swal.close(); updateFirewallRules({ infraId: '${esc(hostInfraId)}' });">🔥 Update host firewall rules…</button></div></div>
      </div>
      <div class="popup-row" style="margin-top:10px;"><div class="popup-col">
        <button type="button" class="btn btn-danger btn-sm" onclick="window.mcnlbDelete()">🗑️ Delete Global NLB (host Infra)</button>
      </div></div>`;
  } else {
    bodyHtml = `
      <div class="popup-section">
        <div class="popup-section-title">➕ Create Global NLB (Multi-cloud HAProxy)</div>
        <div class="popup-row"><div class="popup-col"><span class="popup-hint">⏱️ Deploys a dedicated VM cluster at a latency-fair location and installs HAProxy to front <b>${esc(targetInfraId)}</b>'s VMs. Long-running (VM provisioning + install); runs in the background. Targets must have public IPs and allow the target port from the NLB host.</span></div></div>
        <div class="popup-row">
          <div class="popup-col"><div class="popup-field"><label class="popup-label">Protocol</label><select id="mcnlb-c-proto" class="popup-select"><option>TCP</option><option>HTTP</option></select></div></div>
          <div class="popup-col"><div class="popup-field"><label class="popup-label">Port (listen/target)</label><input id="mcnlb-c-port" class="popup-input" type="number" value="80" min="1" max="65535"></div></div>
        </div>
        <div class="popup-row"><div class="popup-col"><button type="button" class="btn btn-success" onclick="window.mcnlbCreate()">Create Global NLB (background)</button></div></div>
      </div>`;
  }

  Swal.fire({
    title: `🌐 Global NLB — ${esc(targetInfraId)}`,
    width: 760,
    html: `${POPUP_STYLES}<div class="popup-container">${bodyHtml}</div>`,
    showConfirmButton: false, showCancelButton: true, cancelButtonText: 'Close',
  });
}
window.manageMCNLB = manageMCNLB;
window.mcnlbManagerRefresh = () => { Swal.close(); setTimeout(manageMCNLB, 200); };

window.mcnlbCreate = async () => {
  const c = window._mcnlbCtx; if (!c) return;
  const proto = document.getElementById('mcnlb-c-proto').value;
  let p = parseInt(document.getElementById('mcnlb-c-port').value, 10);
  if (isNaN(p) || p <= 0) p = 80;
  const body = {
    type: "PUBLIC", scope: "GLOBAL",
    listener: { Protocol: proto, Port: `${p}` },
    targetGroup: { Protocol: proto, Port: `${p}` },
    HealthChecker: { Interval: 10, Timeout: 10, Threshold: 3 },
  };
  Swal.close();
  const sp = addSpinnerTask("Creating Global NLB (VM cluster + HAProxy)…");
  try {
    await axios({ method: 'post', url: `${tbApiBase()}/ns/${c.namespace}/infra/${c.targetInfraId}/mcSwNlb`, headers: { 'Content-Type': 'application/json' }, data: body, auth: { username: c.username, password: c.password }, timeout: 3600000 });
    successAlert("Global NLB created");
    getInfra();
  } catch (e) { errorAlert("Create Global NLB failed: " + (e.response?.data?.message || e.message)); }
  finally { removeSpinnerTask(sp); }
};

window.mcnlbDelete = async () => {
  const c = window._mcnlbCtx; if (!c) return;
  const r = await Swal.fire({ icon: 'warning', title: 'Delete Global NLB?', html: `Deletes the host Infra <b>${window.escapeHtml(c.hostInfraId)}</b> (terminates its VMs).`, showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#d33' });
  if (!r.isConfirmed) return;
  const sp = addSpinnerTask("Deleting Global NLB host…");
  try {
    await axios({ method: 'delete', url: `${tbApiBase()}/ns/${c.namespace}/infra/${c.hostInfraId}?option=terminate`, auth: { username: c.username, password: c.password }, timeout: 1800000 });
    successAlert("Global NLB deleted");
    getInfra();
    window.mcnlbManagerRefresh();
  } catch (e) { errorAlert("Delete Global NLB failed: " + (e.response?.data?.message || e.message)); }
  finally { removeSpinnerTask(sp); }
};

// Function to execute selected NLB action and close SweetAlert
function executeNLBAction(action) {
  Swal.close(); // Close the current SweetAlert
  
  switch(action) {
    case 'addGlobal':
      AddMcNLB();
      break;
    case 'addRegional':
      AddNLB();
      break;
    case 'delete':
      DelNLB();
      break;
    default:
      console.log('Unknown NLB action:', action);
  }
}
window.executeNLBAction = executeNLBAction;
window.manageNLB = manageNLB;

// function for sleep
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

var defaultRemoteCommand = [];
defaultRemoteCommand.push("hostname -I");
defaultRemoteCommand.push("echo $SSH_CLIENT");
defaultRemoteCommand.push("");

// Recommended timeout (minutes) for the selected usecase. A few of them run far past
// the 30-minute popup default -- a DevStack install takes 20-40 minutes, and hitting
// the timeout mid-install leaves the node in a half-configured state.
// 0 means "leave the popup value alone".
var defaultRemoteCommandTimeout = 0;

/**
 * Sets default remote commands based on application type
 * 
 * @param {string} appName - The name of the application to configure commands for
 * @returns {void} - Modifies the defaultRemoteCommand array directly
 */
function setDefaultRemoteCommandsByApp(appName) {
  // Reset array to ensure clean state (prevent leftover elements from previous selections)
  defaultRemoteCommand.length = 0;
  defaultRemoteCommandTimeout = 0;

  switch (appName) {
    case "Xonotic":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/startServer.sh; chmod +x ~/startServer.sh";
      defaultRemoteCommand[1] = "sudo ~/startServer.sh " + "Cloud-Barista-$$Func(GetInfraId())" + " 26000" + " 8" + " 8";
      defaultRemoteCommand[2] = "echo '$$Func(GetPublicIP(target=this,postfix=:26000))'";
      break;
    case "ELK":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/elastic-stack/startELK.sh";
      defaultRemoteCommand[1] = "chmod +x ~/startServer.sh";
      defaultRemoteCommand[2] = "sudo ~/startServer.sh ";
      break;
    case "vLLM":
      // Install vLLM on the GPU node
      // --hf-token: required for gated models (meta-llama/*, mistralai/*); leave blank for public models
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/deployvLLM.sh -o /tmp/deployvLLM.sh && HF_TOKEN=\"<VLLM_HF_TOKEN>\"; if [ -n \"$HF_TOKEN\" ]; then bash /tmp/deployvLLM.sh --hf-token \"$HF_TOKEN\"; else bash /tmp/deployvLLM.sh; fi";
      defaultRemoteCommand[1] = "echo 'vLLM installed. Next step: Serve LLM Model.'";
      defaultRemoteCommand[2] = "";
      break;
    case "vLLMServe":
      // Serve an LLM model with vLLM (must install vLLM first via Deploy vLLM step)
      // Optional flags (hf-token, gpu-util, ctx-len, tool-parser) are only passed when non-empty
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/servevLLM.sh -o /tmp/servevLLM.sh && MODEL=\"<VLLM_MODEL>\"; HF_TOKEN=\"<VLLM_HF_TOKEN>\"; GPU_UTIL=\"<VLLM_GPU_UTIL>\"; CTX_LEN=\"<VLLM_CTX_LEN>\"; TOOL_PARSER=\"<VLLM_TOOL_PARSER>\"; ARGS=(--model \"$MODEL\"); [ -n \"$HF_TOKEN\" ] && ARGS+=(--hf-token \"$HF_TOKEN\"); [ -n \"$GPU_UTIL\" ] && ARGS+=(--gpu-util \"$GPU_UTIL\"); [ -n \"$CTX_LEN\" ] && ARGS+=(--ctx-len \"$CTX_LEN\"); if [ \"$TOOL_PARSER\" = \"none\" ]; then ARGS+=(--no-tools); elif [ -n \"$TOOL_PARSER\" ]; then ARGS+=(--tool-parser \"$TOOL_PARSER\"); fi; bash /tmp/servevLLM.sh \"${ARGS[@]}\"";
      defaultRemoteCommand[1] = "echo 'API: $$Func(GetPublicIP(target=this, prefix=http://, postfix=:8000/v1))'";
      defaultRemoteCommand[2] = "";
      break;
    case "Nvidia":
      // Install GPU driver — auto-detects NVIDIA or AMD at runtime (skips reinstall/reboot if already active)
      // Use download-then-execute pattern (not curl|bash) to prevent truncated script execution
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/installGpuDriver.sh -o /tmp/installGpuDriver.sh && bash /tmp/installGpuDriver.sh";
      defaultRemoteCommand[1] = "echo '[INFO] GPU driver check/install finished (skips reinstall & reboot if already active; reboots in ~5s if newly installed).'";
      defaultRemoteCommand[2] = "echo '[INFO] Verify GPU status with: nvidia-smi (NVIDIA) or rocm-smi (AMD)'";
      break;
    case "NvidiaVgpu":
      // Install NVIDIA driver for fractional/vGPU instances (e.g., AWS g6f, Azure NCas fractional)
      // --vgpu flag forces proprietary driver (open kernel modules do NOT support vGPU)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/installGpuDriver.sh -o /tmp/installGpuDriver.sh && bash /tmp/installGpuDriver.sh --vgpu";
      defaultRemoteCommand[1] = "echo '[INFO] NVIDIA GPU driver (vGPU/proprietary) check/install finished (reboots automatically if newly installed).'";
      defaultRemoteCommand[2] = "echo '[INFO] Verify GPU status with: nvidia-smi'";
      break;
    case "RebootVM":
      // Reboot Node - useful after GPU driver installation
      defaultRemoteCommand[0] = "sudo reboot";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "Nvidia-Status":
      // Check GPU driver status — tries NVIDIA first, then AMD ROCm
      // rocm-smi exits with code 1 on some ROCm versions due to a Python 'violation' attribute bug
      // even when GPU info is shown correctly — suppress with || true
      defaultRemoteCommand[0] = "if command -v nvidia-smi &>/dev/null; then nvidia-smi; elif command -v rocm-smi &>/dev/null; then rocm-smi || true; else echo '[WARN] No GPU CLI tool found (nvidia-smi / rocm-smi). Is the driver installed and system rebooted?'; sudo lspci | grep -i -E 'vga|3d|display' || true; fi";
      // NVIDIA: show Fabric Manager on multi-GPU NVSwitch systems; AMD: show amd-smi monitor
      defaultRemoteCommand[1] = "if command -v nvidia-smi &>/dev/null; then GPU_COUNT=$(nvidia-smi -L 2>/dev/null | grep -c '^GPU') || GPU_COUNT=0; if [ \"$GPU_COUNT\" -ge 4 ]; then echo '=== Fabric Manager (required for NVSwitch multi-GPU) ==='; systemctl is-active nvidia-fabricmanager 2>/dev/null && echo 'Status: RUNNING' || echo 'Status: NOT RUNNING (multi-GPU may not work!)'; echo '=== nvidia-persistenced ==='; systemctl is-active nvidia-persistenced 2>/dev/null && echo 'Status: RUNNING' || echo 'Status: not running'; fi; elif command -v amd-smi &>/dev/null; then amd-smi monitor || true; fi";
      defaultRemoteCommand[2] = "";
      break;
    case "Netdata":
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/deployNetdataMonitor.sh | sh";
      defaultRemoteCommand[1] = "echo '$$Func(GetPublicIP(target=this, prefix=http://, postfix=:19999))'";
      defaultRemoteCommand[2] = "";
      break;
    case "Netdata-Status":
      defaultRemoteCommand[0] = "sudo systemctl status netdata --no-pager";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "Setup-CrossNAT":
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setup-cross-cloud-nat.sh -o ~/setup-cross-cloud-nat.sh && chmod +x ~/setup-cross-cloud-nat.sh";
      defaultRemoteCommand[1] = "sudo ~/setup-cross-cloud-nat.sh pub=$$Func(GetPublicIPs(separator=,)) priv=$$Func(GetPrivateIPs(separator=,))";
      defaultRemoteCommand[2] = "";
      break;
    case "Setup-WireGuard":
      // WireGuard mesh VPN setup - run on all nodes with same parameters
      // Format: public_ip:wireguard_ip pairs (e.g., 54.1.1.1:10.200.0.1,35.2.2.2:10.200.0.2)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/k8s/setup-wireguard-mesh.sh -o ~/setup-wireguard-mesh.sh && chmod +x ~/setup-wireguard-mesh.sh";
      defaultRemoteCommand[1] = "sudo ~/setup-wireguard-mesh.sh --nodes \"<NODES_MAPPING>\"";
      defaultRemoteCommand[2] = "";
      break;
    case "PortForward-Add":
      // Forward an external port on this Node to a target IP:port (e.g., OpenStack floating IP)
      // Fill in FLOATING_IP, EXT_PORT, TARGET_PORT in the parameter fields below the command
      defaultRemoteCommand[0] = "IFACE=$(ip route show 0.0.0.0/0 | grep -oE \"dev [^ ]+\" | cut -c5-) && sudo sysctl -w net.ipv4.ip_forward=1 && sudo iptables -t nat -A PREROUTING -i $IFACE -p tcp --dport <EXT_PORT> -j DNAT --to-destination <FLOATING_IP>:<TARGET_PORT> && sudo iptables -A FORWARD -p tcp -d <FLOATING_IP> --dport <TARGET_PORT> -j ACCEPT && sudo iptables -t nat -A POSTROUTING -j MASQUERADE && echo \"✅ Port forwarding :<EXT_PORT> → <FLOATING_IP>:<TARGET_PORT> activated\" && echo \"🌐 Access: http://$$Func(GetPublicIP(target=this)):<EXT_PORT>\"";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "PortForward-List":
      // List current port forwarding (DNAT) rules with line numbers
      defaultRemoteCommand[0] = "echo '=== PREROUTING (DNAT) ===' && sudo iptables -t nat -L PREROUTING -n --line-numbers -v";
      defaultRemoteCommand[1] = "echo '=== FORWARD ===' && sudo iptables -L FORWARD -n --line-numbers -v";
      defaultRemoteCommand[2] = "";
      break;
    case "PortForward-Del":
      // Delete a port forwarding rule by line number (run PortForward-List first to see line numbers)
      defaultRemoteCommand[0] = "sudo iptables -t nat -D PREROUTING <RULE_NUM> && echo '✅ PREROUTING rule #<RULE_NUM> deleted'";
      defaultRemoteCommand[1] = "sudo iptables -t nat -L PREROUTING -n --line-numbers";
      defaultRemoteCommand[2] = "";
      break;
    case "PortForward-Save":
      // Persist iptables rules across reboots (Debian/Ubuntu)
      defaultRemoteCommand[0] = "sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save && echo '✅ iptables rules saved (will persist across reboots)'";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "Ollama":
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/deployOllama.sh | sh";
      defaultRemoteCommand[1] = "echo '$$Func(GetPublicIP(target=this, prefix=http://, postfix=:3000))'";
      defaultRemoteCommand[2] = "";
      break;
    case "OllamaPull":
      defaultRemoteCommand[0] = "OLLAMA_HOST=0.0.0.0:3000 ollama pull $$Func(AssignTask(task='<OLLAMA_MODELS>'))";
      defaultRemoteCommand[1] = "echo '$$Func(GetPublicIP(target=this, prefix=http://, postfix=:3000))'";
      defaultRemoteCommand[2] = "OLLAMA_HOST=0.0.0.0:3000 ollama list";
      break;
    case "OpenWebUI":
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/deployOpenWebUI.sh | bash -s -- ollama \"$$Func(GetPublicIPs(target=this, label='accelerator=gpu', separator=;, prefix=http://, postfix=:3000))\"";
      defaultRemoteCommand[1] = "echo 'Access to $$Func(GetPublicIP(target=this, prefix=http://))'";
      defaultRemoteCommand[2] = "";
      break;
    case "OpenWebUI-vLLM":
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/deployOpenWebUI.sh | bash -s -- vllm \"$$Func(GetPublicIPs(target=this, label='accelerator=gpu', separator=;, prefix=http://, postfix=:8000/v1))\"";
      defaultRemoteCommand[1] = "echo 'Access to $$Func(GetPublicIP(target=this, prefix=http://))'";
      defaultRemoteCommand[2] = "";
      break;
    case "TelemetrySensor":
      // Setup GPU telemetry sensor (Node Exporter + GPU Exporter + Telegraf)
      // Run on each GPU Node to expose aggregated metrics on port 9101
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/telemetry/setup_gpu_sensor.sh | bash";
      defaultRemoteCommand[1] = "echo 'Telegraf gateway: $$Func(GetPublicIP(target=this)):9101'";
      defaultRemoteCommand[2] = "";
      break;
    case "TelemetryMonitor":
      // Setup central monitoring (Prometheus + Grafana) on a monitoring Node
      // Uses $$Func(GetPublicIPs(label='accelerator=gpu')) to auto-resolve GPU Node IPs
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/telemetry/setup_monitoring.sh | bash -s -- $$Func(GetPublicIPs(separator=' ', label='accelerator=gpu'))";
      defaultRemoteCommand[1] = "echo 'Prometheus: $$Func(GetPublicIP(target=this, prefix=http://, postfix=:9090/targets))'";
      defaultRemoteCommand[2] = "echo 'Grafana: $$Func(GetPublicIP(target=this, prefix=http://, postfix=:3000))'";
      break;
    case "TelemetryExport":
    case "BenchmarkTelemetryExport":
      // Export Prometheus metrics to CSV (run on the Node that hosts Prometheus, e.g., monitoring Node or benchmark manager)
      // Uses $$Func(GetPublicIPs(label='accelerator=gpu')) to auto-resolve GPU Node IPs
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/telemetry/export_metrics.sh | bash -s -- --minutes <EXPORT_MINUTES> --ips \"$$Func(GetPublicIPs(separator=',', label='accelerator=gpu'))\"";
      defaultRemoteCommand[1] = "ls -la ./metrics_export/";
      defaultRemoteCommand[2] = "";
      break;
    case "BenchmarkTarget":
      // All-in-one setup for benchmark target GPU VMs: vLLM + Model Serving + Telemetry Sensor
      // Assumes GPU driver is already installed (use 'Install GPU Driver' step first)
      // Optional flags (hf-token, gpu-util, ctx-len, tool-parser) are only passed when non-empty
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/telemetry/setupBenchmarkTarget.sh -o /tmp/setupBenchmarkTarget.sh && MODEL=\"<VLLM_MODEL>\"; HF_TOKEN=\"<VLLM_HF_TOKEN>\"; GPU_UTIL=\"<VLLM_GPU_UTIL>\"; CTX_LEN=\"<VLLM_CTX_LEN>\"; TOOL_PARSER=\"<VLLM_TOOL_PARSER>\"; ARGS=(--model \"$MODEL\"); [ -n \"$HF_TOKEN\" ] && ARGS+=(--hf-token \"$HF_TOKEN\"); [ -n \"$GPU_UTIL\" ] && ARGS+=(--gpu-util \"$GPU_UTIL\"); [ -n \"$CTX_LEN\" ] && ARGS+=(--ctx-len \"$CTX_LEN\"); if [ \"$TOOL_PARSER\" = \"none\" ]; then ARGS+=(--no-tools); elif [ -n \"$TOOL_PARSER\" ]; then ARGS+=(--tool-parser \"$TOOL_PARSER\"); fi; bash /tmp/setupBenchmarkTarget.sh \"${ARGS[@]}\"";
      defaultRemoteCommand[1] = "echo 'API: $$Func(GetPublicIP(target=this, prefix=http://, postfix=:8000/v1))'";
      defaultRemoteCommand[2] = "echo 'Metrics: $$Func(GetPublicIP(target=this, prefix=http://, postfix=:9101/metrics))'";
      break;
    case "BenchmarkManager":
      // All-in-one setup for benchmark manager Node: Prometheus + Grafana + GuideLLM + Export Tools
      // Uses $$Func(GetPublicIPs(label='accelerator=gpu')) to auto-resolve GPU Node IPs
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/telemetry/setupBenchmarkManager.sh | bash -s -- $$Func(GetPublicIPs(separator=' ', label='accelerator=gpu'))";
      defaultRemoteCommand[1] = "echo 'Prometheus: $$Func(GetPublicIP(target=this, prefix=http://, postfix=:9090/targets))'";
      defaultRemoteCommand[2] = "echo 'Grafana: $$Func(GetPublicIP(target=this, prefix=http://, postfix=:3000))'";
      break;
    case "RunBenchmark":
      // Run GuideLLM benchmark against target GPU Nodes (runs on benchmark manager Node)
      // run_guidellm.sh supports multiple IPs natively: --ip <IP1> <IP2> ...
      // Uses $$Func(GetPublicIPs(label='accelerator=gpu')) to auto-resolve GPU Node IPs
      // Optional flags (rate, data, data-column-mapper) are only passed when non-empty
      // COLMAP uses single-quote assignment to safely embed JSON double quotes
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/telemetry/run_guidellm.sh -o /tmp/run_guidellm.sh && PROFILE=\"<GUIDELLM_PROFILE>\"; MAX_SECONDS=\"<GUIDELLM_MAX_SECONDS>\"; RATE=\"<GUIDELLM_RATE>\"; DATA=\"<GUIDELLM_DATA>\"; COLMAP='<GUIDELLM_DATA_COLUMN_MAPPER>'; ARGS=(--ip $$Func(GetPublicIPs(separator=' ', label='accelerator=gpu')) --profile \"$PROFILE\" --max-seconds \"$MAX_SECONDS\"); [ -n \"$RATE\" ] && ARGS+=(--rate \"$RATE\"); [ -n \"$DATA\" ] && ARGS+=(--data \"$DATA\"); [ -n \"$COLMAP\" ] && ARGS+=(--data-column-mapper \"$COLMAP\"); bash /tmp/run_guidellm.sh \"${ARGS[@]}\"";
      defaultRemoteCommand[1] = "ls -la ~/guidellm_bench/bench_*";
      defaultRemoteCommand[2] = "";
      break;
    case "HermesAgent":
      // All-in-one Hermes Agent deployment: vLLM + Hermes Gateway/Dashboard + nginx reverse proxy
      // Dashboard accessible via nginx on port 9120 after deployment
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/deployHermesAgent.sh -o /tmp/deployHermesAgent.sh && VLLM_VER=\"<VLLM_VERSION>\"; bash /tmp/deployHermesAgent.sh --run-as-user cb-user ${VLLM_VER:+--vllm-version \"$VLLM_VER\"} --model \"<HERMES_MODEL>\" --ctx-len \"<CTX_LEN>\" --hermes-api-key \"<HERMES_API_KEY>\" --hf-token \"<HF_TOKEN>\" --discord-token \"<DISCORD_TOKEN>\" --discord-home-channel \"<DISCORD_HOME_CHANNEL>\" --discord-home-channel-name \"<DISCORD_HOME_CHANNEL_NAME>\" --ntfy-topic \"<NTFY_TOPIC>\" --tavily-api-key \"<TAVILY_API_KEY>\"";
      defaultRemoteCommand[1] = "echo 'Hermes Dashboard: $$Func(GetPublicIP(target=this, prefix=http://, postfix=:9120))'";
      defaultRemoteCommand[2] = "";
      break;
    case "RayHead-Deploy":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/ray/ray-head-setup.sh";
      defaultRemoteCommand[1] = "chmod +x ~/ray-head-setup.sh";
      defaultRemoteCommand[2] = "~/ray-head-setup.sh -i $$Func(GetPublicIP(target=this))";
      break;
    case "RayWorker-Deploy":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/ray/ray-worker-setup.sh";
      defaultRemoteCommand[1] = "chmod +x ~/ray-worker-setup.sh";
      defaultRemoteCommand[2] = "~/ray-worker-setup.sh -i $$Func(GetPublicIP(target=this)) -h $$Func(GetPublicIP(target=mc-ray.g1-1))";
      break;
    case "K8sControlPlane-Deploy":
      // Deploys K8s control plane with auto-detected IPs
      // Output includes: [K8S_JOIN_COMMAND], [K8S_KUBECONFIG_BASE64] for easy parsing
      defaultRemoteCommand[0] = "CNI=$(echo \"<K8S_CNI>\" | tr 'A-Z' 'a-z' | xargs); [ -z \"$CNI\" ] && CNI=flannel; curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/k8s/k8s-control-plane-setup.sh | bash -s -- --cni \"$CNI\"";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "K8sWorker-Deploy":
      // Deploys K8s worker node
      // IMPORTANT: Replace <JOIN_COMMAND> with actual join command from control plane
      // Get join command: [K8S_JOIN_COMMAND] section in control plane output
      // Example: kubeadm join 10.0.0.1:6443 --token abc.123 --discovery-token-ca-cert-hash sha256:xyz
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/k8s/k8s-worker-setup.sh | bash -s -- -j \"<PASTE_JOIN_COMMAND_HERE>\"";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "K8sGetKubeconfig":
      // Get kubeconfig from control plane for external kubectl access
      // Output: [K8S_KUBECONFIG_BASE64] section contains base64-encoded kubeconfig
      defaultRemoteCommand[0] = "echo '[K8S_KUBECONFIG_BASE64]' && base64 -w 0 ~/kubeconfig-external.yaml && echo ''";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "K8sGetKubeconfigExternal":
      // Kubeconfig for an address the cluster never saw (nested cloud / NAT / port-forward).
      // kubeadm bakes the SAN list at init time, so an address added later needs the
      // apiserver cert re-issued; the CA is unchanged, so nothing else has to be touched.
      defaultRemoteCommand[0] = "ADDR=\"<K8S_EXTERNAL_IP>\"; PORT=\"<K8S_API_PORT>\"; [ -z \"$PORT\" ] && PORT=6443; if [ -z \"$ADDR\" ]; then echo 'ERROR: K8S_EXTERNAL_IP is required'; exit 1; fi; SANS=$(sudo openssl x509 -in /etc/kubernetes/pki/apiserver.crt -noout -ext subjectAltName | tr ',' '\\n' | sed -n -e 's/.*DNS://p' -e 's/.*IP Address://p' | tr -d ' ' | paste -sd, -); case \",$SANS,\" in *\",$ADDR,\"*) echo \"API server cert already covers $ADDR\";; *) echo \"Re-issuing API server cert with SAN $ADDR ...\"; ADV=$(sudo sed -n 's/.*--advertise-address=\\([0-9.]*\\).*/\\1/p' /etc/kubernetes/manifests/kube-apiserver.yaml | head -1); TS=$(date +%s); sudo mv /etc/kubernetes/pki/apiserver.crt /etc/kubernetes/pki/apiserver.crt.bak.$TS; sudo mv /etc/kubernetes/pki/apiserver.key /etc/kubernetes/pki/apiserver.key.bak.$TS; sudo kubeadm init phase certs apiserver --apiserver-advertise-address \"$ADV\" --apiserver-cert-extra-sans \"$SANS,$ADDR\" || { echo 'ERROR: cert re-issue failed'; exit 1; }; sudo mv /etc/kubernetes/manifests/kube-apiserver.yaml /tmp/kube-apiserver.yaml; sleep 8; sudo mv /tmp/kube-apiserver.yaml /etc/kubernetes/manifests/kube-apiserver.yaml; for i in $(seq 1 60); do kubectl get --raw /healthz >/dev/null 2>&1 && break; sleep 3; done; echo 'API server restarted with the new cert';; esac; KC=$HOME/kubeconfig-external.yaml; cp $HOME/.kube/config $KC; kubectl --kubeconfig=$KC config set-cluster \"$(kubectl --kubeconfig=$KC config view -o jsonpath='{.clusters[0].name}')\" --server=\"https://$ADDR:$PORT\" >/dev/null; chmod 600 $KC; kubectl --kubeconfig=$KC get nodes >/dev/null 2>&1 && echo \"Verified: https://$ADDR:$PORT is reachable from this node\" || echo \"NOTE: https://$ADDR:$PORT not reachable from this node - expected when the address is a NAT/port-forward entry point; forward $PORT to this node's :6443 and open it in the security group\"; echo ''; echo '[K8S_KUBECONFIG_BASE64]'; base64 -w 0 $KC; echo ''; printf '$$FILEPATH[Kubeconfig for %s:%s](%s)\\n' \"$ADDR\" \"$PORT\" \"$KC\"";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "K8sClusterStatus":
      // Check K8s cluster status (run on control plane)
      defaultRemoteCommand[0] = "echo '=== Nodes ===' && kubectl get nodes -o wide && echo '' && echo '=== Pods ===' && kubectl get pods -A";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "K8sGetJoinCommand":
      // Get join command for adding new workers (run on control plane)
      // Useful when original token expired (tokens expire after 24h)
      defaultRemoteCommand[0] = "echo '[K8S_JOIN_COMMAND]' && sudo kubeadm token create --print-join-command";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "K8sLlmdControlPlane":
      // Deploy K8s control plane with llm-d infrastructure components
      // Installs: Gateway API CRDs v1.4.0, Inference Extension CRDs v1.3.0,
      //   LeaderWorkerSet v0.7.0, Istio Gateway, GPU Operator, helmfile, yq
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/k8s/k8s-control-plane-setup.sh | bash -s -- --llm-d";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;

    case "LlmdDeploy":
      // Deploy llm-d on K8s cluster via helmfile (run on control plane)
      // Prerequisites: K8s with --llm-d mode, GPU workers joined
      // --hf-token required for gated models (Llama, Mistral, etc.)
      // --nodeport 30080 exposes gateway externally via NodePort on Node public IP
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/deploy-llm-d.sh | bash -s -- --hf-token <HF_TOKEN> --nodeport 30080";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "LlmdDeployWithModel":
      // Deploy llm-d with specific model via helmfile (run on control plane)
      // --replicas 1 --tp 1 for minimal single-GPU; adjust for multi-GPU
      // --nodeport 30080 exposes gateway externally via NodePort on Node public IP
      // Replace <HF_TOKEN> with your Hugging Face token (required for gated models like Llama, Mistral)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/deploy-llm-d.sh | bash -s -- --hf-token <HF_TOKEN> --replicas 1 --tp 1 --nodeport 30080 --model $$Func(AssignTask(task='Qwen/Qwen3-32B, meta-llama/Llama-3.3-8B-Instruct, Qwen/Qwen3-8B, mistralai/Mistral-Small-3.2-24B-Instruct-2503'))";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "LlmdCheck":
      // Check llm-d prerequisites (run on control plane)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/deploy-llm-d.sh | bash -s -- --check";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "LlmdStatus":
      // Check llm-d deployment status (run on control plane)
      // Shows pods, helm releases, InferencePool, Gateway, and GPU resources
      // Uses ; instead of && so each section runs even if previous ones fail
      defaultRemoteCommand[0] = "echo '=== Helm Releases ==='; helm list -n llm-d 2>/dev/null || echo '  (helm not installed or namespace llm-d missing)'; echo ''; echo '=== Pods ==='; kubectl get pods -n llm-d -o wide 2>/dev/null || echo '  (no pods found or namespace llm-d missing)'; echo ''; echo '=== InferencePool ==='; kubectl get inferencepool -n llm-d 2>/dev/null || echo '  (InferencePool CRD not installed or resources not found)'; echo ''; echo '=== Gateway ==='; kubectl get gateway -n llm-d 2>/dev/null || echo '  (Gateway CRD not installed or resources not found)'; echo ''; echo '=== Services ==='; kubectl get svc -n llm-d 2>/dev/null || echo '  (services not found or namespace llm-d missing)'; echo ''; echo '=== GPU Resources ==='; kubectl get nodes -o custom-columns='NAME:.metadata.name,GPU:.status.allocatable.nvidia\\.com/gpu' 2>/dev/null || echo '  (no GPU resources detected)'; echo ''; echo '=== External Access ==='; SVC=$(kubectl get svc -n llm-d -o name 2>/dev/null | grep gateway | head -1 | sed 's|service/||'); NP=$(kubectl get svc $SVC -n llm-d -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null); NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type==\"ExternalIP\")].address}' 2>/dev/null); if [ -n \"$NP\" ]; then echo \"  NodePort: $NP\"; echo \"  Endpoint: http://${NODE_IP:-<NODE_IP>}:$NP\"; else echo '  Service type: ClusterIP (use --nodeport to expose externally)'; fi";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "LlmdUninstall":
      // Uninstall llm-d deployment via helmfile destroy (run on control plane)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/deploy-llm-d.sh | bash -s -- --uninstall";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "K8sGpuStatus":
      // Check GPU status on K8s cluster (run on control plane)
      defaultRemoteCommand[0] = "echo '=== GPU Operator Pods ==='; kubectl get pods -n gpu-operator 2>/dev/null || echo '  (GPU Operator not installed or namespace not found)'; echo ''; echo '=== GPU Resources per Node ==='; kubectl get nodes -o custom-columns='NAME:.metadata.name,GPU:.status.allocatable.nvidia\\.com/gpu' 2>/dev/null || echo '  (no GPU resources detected)'";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "K8sDemoApp":
      // Deploy hello-kubernetes demo app (shows pod name per request — great for scaling demo)
      // Exposes via NodePort; refresh browser to see load balanced across pods
      // $$Func(GetPublicIP(target=this)) is resolved by cb-tumblebug to the VM's actual public IP before SSH
      defaultRemoteCommand[0] = "kubectl create deployment hello-kubernetes --image=paulbouwer/hello-kubernetes:1.10 --replicas=2 2>/dev/null || kubectl scale deployment/hello-kubernetes --replicas=2; kubectl expose deployment hello-kubernetes --type=NodePort --port=8080 --name=hello-svc 2>/dev/null || true; kubectl rollout status deployment/hello-kubernetes --timeout=120s; NODE_PORT=$(kubectl get svc hello-svc -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null); echo ''; echo '[K8S_DEMO_APP_URL]'; echo \"http://$$Func(GetPublicIP(target=this)):${NODE_PORT}\"; echo '(Refresh browser to see different pod names handling each request)'";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "K8sScaleApp":
      // Scale hello-kubernetes deployment to demonstrate K8s replication
      // Set REPLICA_COUNT; after scaling, refresh demo app URL to see different pods respond
      defaultRemoteCommand[0] = "kubectl scale deployment hello-kubernetes --replicas=<REPLICA_COUNT>; kubectl rollout status deployment/hello-kubernetes --timeout=60s; echo ''; echo '=== Pods ==='; kubectl get pods -l app=hello-kubernetes -o wide";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "K8sLoadTest":
      // Create K8s Batch Job that sends HTTP requests to the demo app service
      // Demonstrates K8s Job feature; run K8sScaleApp first for visible load distribution
      defaultRemoteCommand[0] = "kubectl delete job http-load-test 2>/dev/null; kubectl create job http-load-test --image=busybox -- sh -c 'i=0; while [ $i -lt 300 ]; do wget -q -O /dev/null http://hello-svc:8080 2>/dev/null; i=$((i+1)); done; echo LOAD_TEST_DONE_300_REQUESTS'; echo 'Job created. Watching pod status...'; sleep 3; kubectl get pods -l job-name=http-load-test -o wide; echo ''; kubectl top pods 2>/dev/null || echo '(install metrics-server to see CPU/memory stats)'";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "K8sDashboard":
      // Install official Kubernetes Dashboard with NodePort access
      // Outputs access URL (https) and login token; accept self-signed cert in browser
      defaultRemoteCommand[0] = "kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.7.0/aio/deploy/recommended.yaml; kubectl create serviceaccount dashboard-admin -n kubernetes-dashboard 2>/dev/null; kubectl create clusterrolebinding dashboard-admin --clusterrole=cluster-admin --serviceaccount=kubernetes-dashboard:dashboard-admin 2>/dev/null; kubectl patch svc kubernetes-dashboard -n kubernetes-dashboard -p '{\"spec\":{\"type\":\"NodePort\",\"ports\":[{\"port\":443,\"targetPort\":8443,\"nodePort\":30443}]}}'; kubectl rollout status deployment/kubernetes-dashboard -n kubernetes-dashboard --timeout=120s; TOKEN=$(kubectl -n kubernetes-dashboard create token dashboard-admin --duration=24h 2>/dev/null); echo ''; echo '[K8S_DASHBOARD_URL]'; echo 'https://$$Func(GetPublicIP(target=this)):30443'; echo ''; echo '[K8S_DASHBOARD_TOKEN]'; echo \"$TOKEN\"; echo ''; echo '(1) Open URL in browser and accept the self-signed cert warning'; echo '(2) Select Token login and paste the token above'";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "K8sPortainer":
      // Deploy Portainer CE for K8s visual cluster management and monitoring
      // LTS release auto-configures NodePort 30779 (HTTPS) and 30777 (HTTP)
      // First login: set admin password (min 12 chars), then select K8s environment
      defaultRemoteCommand[0] = "kubectl create namespace portainer 2>/dev/null; kubectl apply -n portainer -f https://downloads.portainer.io/ce-lts/portainer.yaml; kubectl rollout status deployment/portainer -n portainer --timeout=180s; echo ''; echo '[PORTAINER_URL (HTTPS)]'; echo 'https://$$Func(GetPublicIP(target=this)):30779'; echo '[PORTAINER_URL (HTTP)]'; echo 'http://$$Func(GetPublicIP(target=this)):30777'; echo ''; echo '(1) Open URL → set admin password (12+ chars)'; echo '(2) Choose \"Get Started\" → K8s environment is auto-detected'";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "K8sHubbleUI":
      // Enable the Cilium Hubble UI service map (requires a cluster deployed with CNI=cilium)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/k8s/enable-hubble-ui.sh | bash; echo ''; echo '[HUBBLE_UI_URL]'; echo 'http://$$Func(GetPublicIP(target=this)):30012'; echo '(open SG port 30012 for YOUR IP only)'";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "WeaveScopeK8s":
      // Live cluster topology map (archived project — demo only; UI is unauthenticated with exec controls)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/weavescope/deploy-weavescope-k8s.sh | bash; echo ''; echo '[WEAVESCOPE_URL]'; echo 'http://$$Func(GetPublicIP(target=this)):30040'; echo '(open SG port 30040 for YOUR IP only — UI has no auth and can exec into containers)'";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "KServeDeploy":
      // Deploy KServe stack on K8s: default StorageClass, GPU Operator, cert-manager, KServe (RawDeployment)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/kserve/deploy-kserve-stack.sh | bash";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "KServeVllmServe":
      // Serve a HuggingFace model via KServe InferenceService (vLLM backend, OpenAI-compatible API)
      // Multiple LLMs: run once per model with a unique name/port (llm/30800, llm2/30801, ...)
      // On time-sliced (shared) GPUs also set GPU memory fraction, e.g. 0.45 for 2 models per GPU
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/kserve/serve-vllm-model.sh -o /tmp/serve-vllm-model.sh && MODEL=\"<VLLM_MODEL>\"; HF_TOKEN=\"<VLLM_HF_TOKEN>\"; CTX_LEN=\"<VLLM_CTX_LEN>\"; NAME=\"<VLLM_ISVC_NAME>\"; PORT=\"<VLLM_NODEPORT>\"; GPU_UTIL=\"<VLLM_GPU_UTIL>\"; NODE=\"<VLLM_TARGET_NODE>\"; [ -z \"$NAME\" ] && NAME=llm; [ -z \"$PORT\" ] && PORT=30800; ARGS=(--name \"$NAME\" --nodeport \"$PORT\"); [ -n \"$MODEL\" ] && ARGS+=(--model \"$MODEL\"); [ -n \"$HF_TOKEN\" ] && ARGS+=(--hf-token \"$HF_TOKEN\"); [ -n \"$CTX_LEN\" ] && ARGS+=(--ctx-len \"$CTX_LEN\"); [ -n \"$GPU_UTIL\" ] && ARGS+=(--gpu-mem-util \"$GPU_UTIL\"); [ -n \"$NODE\" ] && ARGS+=(--node \"$NODE\"); bash /tmp/serve-vllm-model.sh \"${ARGS[@]}\"";
      defaultRemoteCommand[1] = "echo 'External API: http://$$Func(GetPublicIP(target=this)):<VLLM_NODEPORT>/openai/v1'";
      defaultRemoteCommand[2] = "";
      break;
    case "KServeGpuTimeslice":
      // Optional GPU sharing: N pods per physical GPU (no VRAM isolation — set GPU_UTIL per model)
      // On mixed-GPU clusters set the node name to slice only that node (e.g. slice L40S, MIG the A100)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/kserve/config-gpu-timeslicing.sh -o /tmp/config-gpu-timeslicing.sh && NODE=\"<GPU_TIMESLICE_NODE>\"; ARGS=(--replicas <GPU_TIMESLICE_REPLICAS>); [ -n \"$NODE\" ] && ARGS+=(--node \"$NODE\"); bash /tmp/config-gpu-timeslicing.sh \"${ARGS[@]}\"";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "KServeGpuMig":
      // Optional MIG partitioning (A100/H100 only): hardware-isolated slices, each seen as one GPU
      // WARNING: applying a profile resets the GPU (model pods on the node restart)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/kserve/config-gpu-mig.sh | bash -s -- --profile <MIG_PROFILE>";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "KServeStatus":
      // Check KServe serving status (run on control plane)
      defaultRemoteCommand[0] = "echo '=== InferenceServices ==='; kubectl get isvc 2>/dev/null || echo '  (KServe not installed)'; echo ''; echo '=== Predictor Pods ==='; kubectl get pods -l serving.kserve.io/inferenceservice -o wide 2>/dev/null; echo ''; echo '=== GPU Resources ==='; kubectl get nodes -o custom-columns='NAME:.metadata.name,GPU:.status.allocatable.nvidia\\.com/gpu' 2>/dev/null; echo ''; echo '=== External APIs (per served LLM) ==='; APIS=$(kubectl get svc -o jsonpath='{range .items[*]}{.metadata.name}{\" \"}{.spec.ports[0].nodePort}{\"\\n\"}{end}' 2>/dev/null | grep -- '-api '); if [ -n \"$APIS\" ]; then echo \"$APIS\" | sed 's|\\(.*\\)-api \\(.*\\)|  \\1: http://$$Func(GetPublicIP(target=this)):\\2/openai/v1|'; else echo '  (not exposed; serve with --nodeport to expose)'; fi; echo ''; echo '=== Model Logs (tail) ==='; kubectl logs -l serving.kserve.io/inferenceservice --tail=5 2>/dev/null || echo '  (no model pods yet)'";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "KServeOpenWebUI":
      // Deploy Open WebUI connected to the KServe endpoint (NodePort 30080; open it in the SG)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/kserve/deploy-open-webui-kserve.sh | bash -s -- --nodeport 30080; echo ''; echo '[OPEN_WEBUI_URL]'; echo 'http://$$Func(GetPublicIP(target=this)):30080'";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "KServeExampleA":
      // Serve a standard-format sklearn model via KServe runtime — no image build needed
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/kserve/examples/a-sklearn-isvc.sh | bash";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "KServeExampleC":
      // Serve the same model as a plain Deployment + Service (no KServe) for comparison
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/kserve/examples/c-plain-deployment.sh | bash";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "KServeRegistryDeploy":
      // In-cluster private registry on NodePort 30500 (vNet-internal; keep the port closed in the SG)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/kserve/deploy-private-registry.sh | bash";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "KServeRegistryAccess":
      // Configure containerd on every node to pull from the plain-HTTP registry (target: Infra / all nodes)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/kserve/config-registry-access.sh | bash";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "KServeExampleB":
      // Build a custom model image, push to the private registry, and serve via KServe
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/kserve/examples/build-serve-custom-model.sh | bash";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "KServeMonitoring":
      // Prometheus + Grafana with DCGM (GPU) and vLLM (LLM) dashboards on NodePort 30300
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/kserve/deploy-monitoring.sh | bash; echo ''; echo '[GRAFANA_URL]'; echo 'http://$$Func(GetPublicIP(target=this)):30300 (admin / admin)'";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "HermesAgent-KServe":
      // Deploy Hermes Agent connected to the KServe model API (hermes-only mode; no local vLLM)
      // Requires KServeVllmServe with NodePort 30800 (localhost works on any cluster node)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/deployHermesAgent.sh -o /tmp/deployHermesAgent.sh && MODEL=\"<VLLM_MODEL>\"; [ -z \"$MODEL\" ] && MODEL=\"Qwen/Qwen2.5-7B-Instruct\"; bash /tmp/deployHermesAgent.sh --run-as-user cb-user --mode hermes-only --skip-vllm --vllm-base-url http://localhost:30800/openai/v1 --model \"${MODEL##*/}\" --hermes-api-key \"<HERMES_API_KEY>\" --discord-token \"<DISCORD_TOKEN>\" --discord-home-channel \"<DISCORD_HOME_CHANNEL>\" --discord-home-channel-name \"<DISCORD_HOME_CHANNEL_NAME>\" --ntfy-topic \"<NTFY_TOPIC>\" --tavily-api-key \"<TAVILY_API_KEY>\"";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "McpRegistryDb":
      // Deploy Model Registry DB (PostgreSQL seeded with a HF-style model catalog)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/mcp/deploy-registry-db.sh | bash";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "McpRegistryBackend":
      // Deploy Model Registry backend (FastAPI: search/get/register/delete models)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/mcp/deploy-registry-backend.sh | bash";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "McpRegistryWeb":
      // Deploy the registry web catalog (NodePort 30902; open it in the SG)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/mcp/deploy-registry-web.sh | bash; echo ''; echo '[MODEL_REGISTRY_WEB]'; echo 'http://$$Func(GetPublicIP(target=this)):30902'";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "McpRegistryWebScaleOut":
      // Traffic-burst demo: scale out the registry web and watch pods spread (e.g., in Headlamp)
      defaultRemoteCommand[0] = "R=\"<REGISTRY_WEB_REPLICAS>\"; [ -z \"$R\" ] && R=30; kubectl -n mcp-demo scale deployment model-registry-web --replicas=$R; kubectl -n mcp-demo rollout status deployment/model-registry-web --timeout=180s; echo ''; echo '=== Pods ==='; kubectl -n mcp-demo get pods -l app=model-registry-web -o wide";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "McpRegistryWebScaleIn":
      // Scale the registry web back to a single replica after the demo
      defaultRemoteCommand[0] = "kubectl -n mcp-demo scale deployment model-registry-web --replicas=1; kubectl -n mcp-demo rollout status deployment/model-registry-web --timeout=180s; echo ''; echo '=== Pods ==='; kubectl -n mcp-demo get pods -l app=model-registry-web -o wide";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "McpServers":
      // Deploy two MCP adapters: curated catalog tools (write path) + read-only SQL (analysis path)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/mcp/deploy-mcp-servers.sh | bash";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "McpServingAdapter":
      // Optional: live KServe InferenceService list as a 3rd MCP target (same-cluster KServe; re-run step 9 after)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/mcp/deploy-mcp-serving-adapter.sh | bash";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "McpAgentgateway":
      // agentgateway federates the MCP adapters behind one endpoint (NodePort 30900; open it in the SG)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/mcp/deploy-agentgateway.sh | bash; echo ''; echo '[MCP_ENDPOINT (all tools)]'; echo 'http://$$Func(GetPublicIP(target=this)):30900/mcp'; echo '[MCP_ENDPOINT_REGISTRY (catalog view)]'; echo 'http://$$Func(GetPublicIP(target=this)):30900/mcp-registry'; echo '[MCP_ENDPOINT_SERVING (KServe view; needs step 8-opt)]'; echo 'http://$$Func(GetPublicIP(target=this)):30900/mcp-serving'; echo '[AGENTGATEWAY_UI]'; echo 'http://$$Func(GetPublicIP(target=this)):30901/ui/'; echo ''; echo 'Register in Claude Code:'; echo 'claude mcp add --transport http model-registry http://$$Func(GetPublicIP(target=this)):30900/mcp'; echo ''; echo 'Register in VS Code Copilot:'; echo 'Ctrl+Shift+P -> MCP: Add Server... -> HTTP -> paste an endpoint URL above, then use Copilot Chat in Agent mode'";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "McpE2eTest":
      // Scripted demo through the gateway: federated tools, SQL analytics, register/delete governance
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/mcp/test-mcp-e2e.sh | bash";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "McpStatus":
      // Check MCP demo stack status (run on control plane)
      defaultRemoteCommand[0] = "echo '=== MCP demo stack (namespace mcp-demo) ==='; kubectl -n mcp-demo get pods,svc 2>/dev/null || echo '  (mcp-demo namespace not found)'; echo ''; echo '=== External endpoints ==='; echo '  Web:  http://$$Func(GetPublicIP(target=this)):30902'; echo '  MCP:  http://$$Func(GetPublicIP(target=this)):30900/mcp (views: /mcp-registry, /mcp-serving)'; echo '  UI:   http://$$Func(GetPublicIP(target=this)):30901/ui/'; echo ''; echo '=== agentgateway logs (tail) ==='; kubectl -n mcp-demo logs deploy/agentgateway --tail=5 2>/dev/null || echo '  (agentgateway not deployed yet)'";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "Westward":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setgame.sh";
      defaultRemoteCommand[1] = "chmod +x ~/setgame.sh; sudo ~/setgame.sh";
      defaultRemoteCommand[2] = "";
      break;
    case "WeaveScope":
      defaultRemoteCommand[0] = "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/weavescope/startServer.sh";
      defaultRemoteCommand[1] = "chmod +x ~/startServer.sh";
      defaultRemoteCommand[2] = "sudo ~/startServer.sh " + "$$Func(GetPublicIPs(separator=' '))" + " " + "$$Func(GetPrivateIPs(separator=' '))";
      break;
    case "Nginx":
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/nginx/startServer.sh | bash -s -- --ip $$Func(GetPublicIP(target=this))";
      defaultRemoteCommand[1] = "which unzip || sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y unzip; f=$(ls /home/cb-user/*.zip /home/cb-user/*.tar.gz /home/cb-user/*.tgz /home/cb-user/*.tar.bz2 2>/dev/null | head -1); [ -n \"$f\" ] && case \"$f\" in *.zip) sudo unzip -o \"$f\" -d /var/www/html/ ;; *.tar.gz|*.tgz) sudo tar -xzf \"$f\" -C /var/www/html/ ;; *.tar.bz2) sudo tar -xjf \"$f\" -C /var/www/html/ ;; esac || echo 'No archive found in /home/cb-user/, skipping extraction.'";
      defaultRemoteCommand[2] = "echo 'Access to $$Func(GetPublicIP(target=this, prefix=http://))'";
      break;
    case "MvToWebRoot":
      defaultRemoteCommand[0] = "sudo mv /home/cb-user/* /var/www/html/";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "ExtractToWebRoot":
      defaultRemoteCommand[0] = "which unzip || sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y unzip; f=$(ls /home/cb-user/*.zip /home/cb-user/*.tar.gz /home/cb-user/*.tgz /home/cb-user/*.tar.bz2 2>/dev/null | head -1); [ -n \"$f\" ] && case \"$f\" in *.zip) sudo unzip -o \"$f\" -d /var/www/html/ ;; *.tar.gz|*.tgz) sudo tar -xzf \"$f\" -C /var/www/html/ ;; *.tar.bz2) sudo tar -xjf \"$f\" -C /var/www/html/ ;; esac || echo 'No archive found in /home/cb-user/, skipping extraction.'";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "Jitsi":
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/jitsi/startServer.sh | sudo bash -s -- <DNS_DOMAIN> <EMAIL_ADDRESS>";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "Stress":
      defaultRemoteCommand[0] = "sudo apt install -y stress > /dev/null; stress -c 16 -t 60";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "CB-TB-Deploy":
      defaultRemoteCommand[0] = "curl -sSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/set-tb.sh | bash";
      defaultRemoteCommand[1] = "echo '$$Func(GetPublicIP(target=this, prefix=http://, postfix=:1324))'";
      defaultRemoteCommand[2] = "";
      break;
    case "M-CMP-Install":
      // Stage 1: clone repo, configure env/certs, do NOT start containers
      defaultRemoteCommand[0] = "curl -sSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/set-tb.sh | bash";
      defaultRemoteCommand[1] = "curl -sSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/set-mcmp.sh | sudo bash -s -- install --domain $$Func(GetPublicIP(target=this))";
      defaultRemoteCommand[2] = "";
      break;
    case "M-CMP-Pull":
      // Pre-pull Docker images (optional; run before M-CMP-Run to separate download from startup)
      defaultRemoteCommand[0] = "curl -sSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/set-mcmp.sh | sudo bash -s -- pull";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "M-CMP-Run":
      // Stage 2: start all M-CMP containers in staged waves (detached)
      defaultRemoteCommand[0] = "curl -sSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/set-mcmp.sh | sudo bash -s -- run";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "M-CMP-Info":
      // Show running container and image status
      defaultRemoteCommand[0] = "curl -sSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/set-mcmp.sh | sudo bash -s -- info";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "M-CMP-Stop":
      // Stop all M-CMP containers
      defaultRemoteCommand[0] = "curl -sSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/set-mcmp.sh | sudo bash -s -- stop";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "DevStack-Install":
      // Install DevStack on bare-metal VMs (e.g., AWS m5.metal)
      // CSP name is derived from Infra ID + Node ID for unique provider registration
      // Location info is automatically populated from the Node's deployment location
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/openstack/1.installDevStack.sh -o /tmp/installDevStack.sh && bash /tmp/installDevStack.sh --csp-name openstack-$$Func(GetInfraId())-$$Func(GetNodeId()) --latitude $$Func(GetLocationLatitude()) --longitude $$Func(GetLocationLongitude()) --location \"$$Func(GetLocationDisplay())\"";
      defaultRemoteCommand[1] = "echo 'DevStack installed. Horizon: $$Func(GetPublicIP(target=this, prefix=http://, postfix=/dashboard))'";
      defaultRemoteCommand[2] = "";
      // stack.sh alone takes 20-40 minutes with Octavia/Manila enabled
      defaultRemoteCommandTimeout = 120;
      break;
    case "DevStack-Info":
      // Get registration info from installed DevStack
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/openstack/2.getRegistrationInfo.sh -o /tmp/getRegistrationInfo.sh && bash /tmp/getRegistrationInfo.sh --csp-name openstack-$$Func(GetInfraId())-$$Func(GetNodeId()) --latitude $$Func(GetLocationLatitude()) --longitude $$Func(GetLocationLongitude()) --location \"$$Func(GetLocationDisplay())\"";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "DevStack-UpdateEndpoints":
      // Update OpenStack service catalog endpoints after public IP change (e.g., suspend/resume)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/openstack/3.updateEndpoints.sh -o /tmp/updateEndpoints.sh && bash /tmp/updateEndpoints.sh --csp-name openstack-$$Func(GetInfraId())-$$Func(GetNodeId())";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "DevStack-Clean":
      // Clean up failed or stale DevStack installation for re-install
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/openstack/4.cleanDevStack.sh -o /tmp/cleanDevStack.sh && bash /tmp/cleanDevStack.sh";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "Kolla-Install":
      // Install OpenStack via Kolla-Ansible (Docker-based, production-grade, survives reboot)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/openstack/kolla/1.installKolla.sh -o /tmp/installKolla.sh && bash /tmp/installKolla.sh --csp-name openstack-$$Func(GetInfraId())-$$Func(GetNodeId()) --latitude $$Func(GetLocationLatitude()) --longitude $$Func(GetLocationLongitude()) --location \"$$Func(GetLocationDisplay())\"";
      defaultRemoteCommand[1] = "echo 'Kolla-Ansible installed. Horizon: $$Func(GetPublicIP(target=this, prefix=http://, postfix=/))'";
      defaultRemoteCommand[2] = "";
      break;
    case "Kolla-Info":
      // Get registration info from Kolla-Ansible deployment
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/openstack/kolla/2.getRegistrationInfo.sh -o /tmp/getKollaInfo.sh && bash /tmp/getKollaInfo.sh --csp-name openstack-$$Func(GetInfraId())-$$Func(GetNodeId()) --latitude $$Func(GetLocationLatitude()) --longitude $$Func(GetLocationLongitude()) --location \"$$Func(GetLocationDisplay())\"";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "Kolla-UpdateEndpoints":
      // Update OpenStack service catalog endpoints after public IP change
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/openstack/kolla/3.updateEndpoints.sh -o /tmp/updateKollaEndpoints.sh && bash /tmp/updateKollaEndpoints.sh --csp-name openstack-$$Func(GetInfraId())-$$Func(GetNodeId())";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "Kolla-Clean":
      // Clean up Kolla-Ansible deployment
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/openstack/kolla/4.cleanKolla.sh -o /tmp/cleanKolla.sh && bash /tmp/cleanKolla.sh";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    default:
      defaultRemoteCommand[0] = "ls -al";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
  }
}


// function for startApp by startApp button item
function startApp() {
  var infraid = infraidElement.value;
  if (infraid) {
    setDefaultRemoteCommandsByApp(selectApp.value);
    executeRemoteCmd();
  } else {
    console.log(" Infra ID is not assigned");
  }
}
window.startApp = startApp;

// function for stopApp by stopApp button item
function stopApp() {
  var infraid = infraidElement.value;
  if (infraid) {
    console.log(" Stopping " + selectApp.value);

    var config = getConfig(); var hostname = config.hostname;
    var port = config.port;
    var username = config.username;
    var password = config.password;
    var namespace = window.configNamespace || config.namespace || '';

    var url = `${tbApiBase()}/ns/${namespace}/cmd/infra/${infraid}`;
    var cmd = [];
    if (selectApp.value == "Xonotic") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/stopServer.sh"
      );
      cmd.push("chmod +x ~/stopServer.sh");
      cmd.push("sudo ~/stopServer.sh");
    } else if (selectApp.value == "ELK") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/elastic-stack/stopELK.sh"
      );
      cmd.push("chmod +x ~/stopELK.sh");
      cmd.push("sudo ~/stopELK.sh");
    } else if (selectApp.value == "Westward") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/stopServer.sh"
      );
      cmd.push("chmod +x ~/stopServer.sh");
      cmd.push("sudo ~/stopServer.sh");
    } else if (selectApp.value == "Nginx") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/stopServer.sh"
      );
      cmd.push("chmod +x ~/stopServer.sh");
      cmd.push("sudo ~/stopServer.sh");
    } else if (selectApp.value == "Jitsi") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/stopServer.sh"
      );
      cmd.push("chmod +x ~/stopServer.sh");
      cmd.push("sudo ~/stopServer.sh");
    } else {
      cmd.push("ls -al");
    }

    var commandReqTmp = {
      command: cmd,
    };
    var jsonBody = JSON.stringify(commandReqTmp, undefined, 4);

    axios({
      method: "post",
      url: url,
      headers: { "Content-Type": "application/json" },
      data: jsonBody,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    }).then((res) => {
      console.log(res); // for debug

      console.log("[Complete: Stopping App]\n");
      displayJsonData(res.data, typeInfo);
    });
  } else {
    console.log(" Infra ID is not assigned");
  }
}
window.stopApp = stopApp;

// function for statusApp by statusApp button item
function statusApp() {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = window.configNamespace || config.namespace || '';
  var infraid = infraidElement.value;

  if (infraid) {
    console.log(" Getting status " + selectApp.value);

    var url = `${tbApiBase()}/ns/${namespace}/cmd/infra/${infraid}`;
    var cmd = [];
    if (selectApp.value == "Xonotic") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/xonotic/statusServer.sh -O ~/statusServer.sh"
      );
      cmd.push("chmod +x ~/statusServer.sh");
      cmd.push("sudo ~/statusServer.sh");
    } else if (selectApp.value == "Westward") {
      cmd.push(
        "wget wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setgame.sh -O ~/setgame.sh"
      );
      cmd.push("chmod +x ~/setgame.sh");
      cmd.push("sudo ~/setgame.sh");
    } else if (selectApp.value == "Nvidia" || selectApp.value == "NvidiaVgpu") {
      cmd.push("nvidia-smi");
      cmd.push("");
      cmd.push("");
    } else if (selectApp.value == "Nginx") {
      cmd.push(
        "wget wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/setweb.sh -O ~/setweb.sh"
      );
      cmd.push("chmod +x ~/setweb.sh");
      cmd.push("sudo ~/setweb.sh");
    } else if (selectApp.value == "Jitsi") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/jitsi/statusServer.sh -O ~/statusServer.sh"
      );
      cmd.push("chmod +x ~/statusServer.sh");
      cmd.push("sudo ~/statusServer.sh");
    } else if (selectApp.value == "ELK") {
      cmd.push(
        "wget https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/elastic-stack/statusELK.sh -O ~/statusServer.sh"
      );
      cmd.push("chmod +x ~/statusServer.sh");
      cmd.push("sudo ~/statusServer.sh");
    } else {
      cmd.push("ls -al");
    }

    var commandReqTmp = {
      command: cmd,
    };
    var jsonBody = JSON.stringify(commandReqTmp, undefined, 4);

    axios({
      method: "post",
      url: url,
      headers: { "Content-Type": "application/json" },
      data: jsonBody,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    }).then((res) => {
      console.log(res); // for debug

      console.log("[Complete: Getting App status]\n");
      displayJsonData(res.data, typeInfo);
    });
  } else {
    console.log(" Infra ID is not assigned");
  }
}
window.statusApp = statusApp;
window.setDefaultRemoteCommandsByApp = setDefaultRemoteCommandsByApp;
window.defaultRemoteCommand = defaultRemoteCommand;
Object.defineProperty(window, 'defaultRemoteCommandTimeout', {
  get: () => defaultRemoteCommandTimeout,
  set: (v) => { defaultRemoteCommandTimeout = v; },
  configurable: true
});
