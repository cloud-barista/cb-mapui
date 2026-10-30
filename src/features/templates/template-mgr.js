/**
 * Template Management Feature Module
 * @module features/templates
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import JSZip from 'jszip';
import { tbApiBase, getConfig } from '../../core/api.js';
import { generateInfraName, escapeHtml } from '../../core/utils.js';

// Helper aliases for spinner functions
const addSpinnerTask = (name) => (window.addSpinnerTask ? window.addSpinnerTask(name) : name);
const removeSpinnerTask = (id) => { if (window.removeSpinnerTask) window.removeSpinnerTask(id); };

const $ = (...args) => (window.$ || window.jQuery)(...args);
$.extend = (...args) => (window.$ || window.jQuery).extend(...args);

const clearCircle = (...args) => { if (window.clearCircle) window.clearCircle(...args); };
const outputAlert = (...args) => { if (window.outputAlert) window.outputAlert(...args); };
const updateNodeGroupReview = () => { if (window.updateNodeGroupReview) window.updateNodeGroupReview(); };
const renderMapFromConfig = () => { if (window.renderMapFromConfig) window.renderMapFromConfig(); };
const toggleWorkloadType = async (...args) => { if (window.toggleWorkloadType) return await window.toggleWorkloadType(...args); };

const createInfraReqVmTmplt = new Proxy({}, {
  get: (target, prop) => (window.createInfraReqVmTmplt || {})[prop],
  set: (target, prop, val) => {
    if (!window.createInfraReqVmTmplt) window.createInfraReqVmTmplt = {};
    window.createInfraReqVmTmplt[prop] = val;
    return true;
  },
  ownKeys: () => Object.keys(window.createInfraReqVmTmplt || {}),
  getOwnPropertyDescriptor: (target, prop) => Object.getOwnPropertyDescriptor(window.createInfraReqVmTmplt || {}, prop)
});

const nodeGroupRequestFromSpecList = new Proxy([], {
  get: (target, prop) => {
    if (!window.nodeGroupRequestFromSpecList) window.nodeGroupRequestFromSpecList = [];
    const arr = window.nodeGroupRequestFromSpecList;
    const val = arr[prop];
    return typeof val === 'function' ? val.bind(arr) : val;
  },
  set: (target, prop, val) => {
    if (!window.nodeGroupRequestFromSpecList) window.nodeGroupRequestFromSpecList = [];
    window.nodeGroupRequestFromSpecList[prop] = val;
    return true;
  },
  has: (target, prop) => prop in (window.nodeGroupRequestFromSpecList || []),
  ownKeys: () => Reflect.ownKeys(window.nodeGroupRequestFromSpecList || []),
  getOwnPropertyDescriptor: (target, prop) => {
    const arr = window.nodeGroupRequestFromSpecList || [];
    return Object.getOwnPropertyDescriptor(arr, prop);
  }
});

const recommendedSpecList = new Proxy([], {
  get: (target, prop) => {
    if (!window.recommendedSpecList) window.recommendedSpecList = [];
    const arr = window.recommendedSpecList;
    const val = arr[prop];
    return typeof val === 'function' ? val.bind(arr) : val;
  },
  set: (target, prop, val) => {
    if (!window.recommendedSpecList) window.recommendedSpecList = [];
    window.recommendedSpecList[prop] = val;
    return true;
  },
  has: (target, prop) => prop in (window.recommendedSpecList || []),
  ownKeys: () => Reflect.ownKeys(window.recommendedSpecList || []),
  getOwnPropertyDescriptor: (target, prop) => {
    const arr = window.recommendedSpecList || [];
    return Object.getOwnPropertyDescriptor(arr, prop);
  }
});

function extractProviderFromSpecId(specId) {
  if (!specId) return 'Unknown';
  const parts = specId.split('+');
  return parts.length > 0 ? parts[0] : 'Unknown';
}

function extractRegionFromSpecId(specId) {
  if (!specId) return 'Unknown';
  const parts = specId.split('+');
  return parts.length > 1 ? parts[1] : 'Unknown';
}

function findLocationCoordinates(connectionName, provider, region) {
  const connections = window.cloudBaristaCentralData?.connection || [];
  if (!connections.length) return null;

  if (connectionName) {
    const matched = connections.find(c => c.configName === connectionName);
    if (matched?.regionDetail?.location) {
      const lon = parseFloat(matched.regionDetail.location.longitude);
      const lat = parseFloat(matched.regionDetail.location.latitude);
      if (Number.isFinite(lon) && Number.isFinite(lat)) return { lon, lat };
    }
  }

  const prov = (provider || '').toLowerCase();
  const reg = (region || '').toLowerCase();
  if (prov && reg) {
    const matched = connections.find(c =>
      (c.providerName || '').toLowerCase() === prov &&
      (c.regionDetail?.regionName || '').toLowerCase() === reg
    );
    if (matched?.regionDetail?.location) {
      const lon = parseFloat(matched.regionDetail.location.longitude);
      const lat = parseFloat(matched.regionDetail.location.latitude);
      if (Number.isFinite(lon) && Number.isFinite(lat)) return { lon, lat };
    }
  }

  return null;
}

// ==================== Template Management Functions ====================

// Template type registry — add new types here for extensibility
const TEMPLATE_TYPES = [
  {
    key: 'infra',
    label: 'Infra',
    icon: '🚀',
    badgeClass: 'badge-primary',
    bodyFieldName: 'infraDynamicReq',
    applyUrlFn: (baseUrl, templateId) => `${baseUrl}/infra/template/${templateId}`,
    directCreateUrlFn: (baseUrl) => `${baseUrl}/infraDynamic`,
    placeholder: `{
  "name": "my-infra",
  "installMonAgent": "no",
  "description": "My Infra",
  "nodeGroups": [
    {
      "name": "web",
      "nodeGroupSize": 1,
      "specId": "aws+ap-northeast-2+t3.small"
    }
  ]
}`
  },
  {
    key: 'vNet',
    label: 'vNet',
    icon: '🌐',
    badgeClass: 'badge-success',
    bodyFieldName: 'vNetReq',
    applyUrlFn: (baseUrl, templateId) => `${baseUrl}/resources/vNet/template/${templateId}`,
    directCreateUrlFn: (baseUrl) => `${baseUrl}/resources/vNet`,
    placeholder: `{
  "name": "my-vnet",
  "connectionName": "aws-ap-northeast-2",
  "cidrBlock": "10.0.0.0/16",
  "subnetInfoList": [
    {
      "name": "subnet-1",
      "ipv4_CIDR": "10.0.1.0/24"
    }
  ]
}`
  },
  {
    key: 'securityGroup',
    label: 'SecurityGroup',
    icon: '🛡️',
    badgeClass: 'badge-warning',
    bodyFieldName: 'securityGroupReq',
    applyUrlFn: (baseUrl, templateId) => `${baseUrl}/resources/securityGroup/template/${templateId}`,
    directCreateUrlFn: (baseUrl) => `${baseUrl}/resources/securityGroup`,
    placeholder: `{
  "connectionName": "aws-ap-northeast-2",
  "vNetId": "my-vnet",
  "firewallRules": [
    {
      "ports": "22",
      "protocol": "TCP",
      "direction": "inbound",
      "cidr": "0.0.0.0/0"
    },
    {
      "ports": "80",
      "protocol": "TCP",
      "direction": "inbound",
      "cidr": "0.0.0.0/0"
    }
  ]
}`
  },
  {
    key: 'k8sCluster',
    label: 'K8s Cluster',
    icon: '☸️',
    badgeClass: 'badge-info',
    bodyFieldName: 'k8sMultiClusterDynamicReq',
    applyNameField: 'namePrefix',
    applyUrlFn: (baseUrl, templateId) => `${baseUrl}/k8sCluster/template/${templateId}`,
    directCreateUrlFn: (baseUrl) => `${baseUrl}/k8sMultiClusterDynamic`,
    placeholder: `{
  "namePrefix": "across",
  "clusters": [
    {
      "connectionName": "aws-ap-northeast-2",
      "specId": "aws+ap-northeast-2+t3a.xlarge",
      "imageId": "default",
      "nodeGroupName": "k8sng01",
      "desiredNodeSize": 1,
      "minNodeSize": 1,
      "maxNodeSize": 2,
      "onAutoScaling": "true"
    }
  ]
}`
  }
];

function getTemplateTypeMeta(typeKey) {
  return TEMPLATE_TYPES.find(t => t.key === typeKey) || { key: typeKey, label: typeKey, icon: '📦', badgeClass: 'badge-secondary', bodyFieldName: typeKey + 'Req' };
}

// Show the main Template Management modal
async function showTemplateManagement(overrideNs) {
  const config = getConfig();
  const { hostname, port, username, password } = config;
  const authConfig = { username, password };

  // Determine initial namespace — default to "system" where init templates are stored
  const currentNs = overrideNs || 'system';

  // Load namespace list
  let namespaces = [];
  try {
    const nsRes = await axios.get(`${tbApiBase()}/ns?option=id`, { auth: authConfig });
    namespaces = nsRes.data.output || nsRes.data.ns || [];
  } catch (e) {
    console.error('Error loading namespaces:', e);
  }

  if (namespaces.length === 0) {
    Swal.fire('Warning', 'No namespaces found. Please create a namespace first.', 'warning');
    return;
  }

  // Build namespace dropdown options
  const nsOptionsHtml = namespaces.map(ns => {
    const nsId = typeof ns === 'string' ? ns : (ns.id || ns.name || '');
    const safeNsId = window.escapeHtml(nsId);
    const selected = nsId === currentNs ? 'selected' : '';
    return `<option value="${safeNsId}" ${selected}>${safeNsId}</option>`;
  }).join('');

  // Build type tab buttons
  const typeTabsHtml = [
    `<button class="tmpl-tab active" data-filter="all" onclick="tmplFilterByTab(this)">All</button>`,
    ...TEMPLATE_TYPES.map(t =>
      `<button class="tmpl-tab" data-filter="${t.key}" onclick="tmplFilterByTab(this)">${t.icon} ${t.label}</button>`
    )
  ].join('');

  // Determine selected namespace (use first if currentNs not in list)
  const selectedNs = namespaces.some(ns => (typeof ns === 'string' ? ns : ns.id) === currentNs)
    ? currentNs
    : (typeof namespaces[0] === 'string' ? namespaces[0] : namespaces[0].id);

  // Store state for internal reload
  window._tmplMgmtNs = selectedNs;

  Swal.fire({
    title: '📄 Template Management',
    html: `
      <style>
        .tmpl-modal { text-align: left; }
        .tmpl-toolbar { display: flex; gap: 8px; margin-bottom: 10px; align-items: center; flex-wrap: wrap; }
        .tmpl-toolbar select { height: 32px; font-size: 13px; padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px; min-width: 160px; }
        .tmpl-toolbar .btn { font-size: 12px; white-space: nowrap; }
        .tmpl-tabs { display: flex; gap: 0; margin-bottom: 10px; border-bottom: 2px solid #dee2e6; }
        .tmpl-tab { background: none; border: none; padding: 7px 14px; font-size: 13px; cursor: pointer; color: #555; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.15s; }
        .tmpl-tab:hover { color: #007bff; }
        .tmpl-tab.active { color: #007bff; border-bottom-color: #007bff; font-weight: 600; }
        .tmpl-search-row { display: flex; gap: 8px; margin-bottom: 10px; align-items: center; }
        .tmpl-search-row input { flex: 1; height: 32px; font-size: 13px; padding: 4px 10px; border: 1px solid #ced4da; border-radius: 4px; }
        .tmpl-card { border: 1px solid #dee2e6; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; background: #f8f9fa; transition: all 0.15s; }
        .tmpl-card:hover { border-color: #007bff; box-shadow: 0 2px 6px rgba(0,123,255,0.1); }
        .tmpl-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .tmpl-card-title { font-weight: 600; font-size: 14px; margin-right: 6px; }
        .tmpl-card-actions { display: flex; gap: 4px; }
        .tmpl-card-actions .btn { padding: 2px 6px; font-size: 12px; }
        .tmpl-card-body { font-size: 12px; }
        .tmpl-list-container { max-height: 380px; overflow-y: auto; }
        .tmpl-status-bar { margin-top: 8px; font-size: 11px; color: #888; text-align: right; }
      </style>
      <div class="tmpl-modal">
        <div class="tmpl-toolbar">
          <label style="font-size:13px;font-weight:500;margin:0;">Namespace:</label>
          <select id="tmplNsSelect" onchange="tmplChangeNamespace(this.value)">
            ${nsOptionsHtml}
          </select>
          <button onclick="tmplCreateNew()" class="btn btn-primary btn-sm">➕ New Template</button>
          <button onclick="tmplRefresh()" class="btn btn-outline-secondary btn-sm">🔄 Refresh</button>
        </div>
        <div class="tmpl-tabs" id="tmplTabs">
          ${typeTabsHtml}
        </div>
        <div class="tmpl-search-row">
          <input type="text" id="tmplFilterSearch" placeholder="🔍 Search templates by name or description..." oninput="filterTemplateCards()">
        </div>
        <div class="tmpl-list-container" id="tmplListContainer">
          <div style="text-align:center;padding:30px;color:#999;"><i>Loading templates...</i></div>
        </div>
        <div class="tmpl-status-bar" id="tmplStatusBar"></div>
      </div>
    `,
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '❌ Close',
    width: '780px',
    customClass: { popup: 'swal2-template-mgmt' },
    didOpen: () => {
      // Load templates for the selected namespace
      tmplLoadTemplates(selectedNs);
    }
  });
}
window.showTemplateManagement = showTemplateManagement;

// Load templates for a given namespace and render them into the modal
async function tmplLoadTemplates(namespace) {
  const config = getConfig();
  const { hostname, port, username, password } = config;
  const authConfig = { username, password };
  const baseUrl = `${tbApiBase()}/ns/${namespace}`;
  const container = document.getElementById('tmplListContainer');
  const statusBar = document.getElementById('tmplStatusBar');

  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:20px;color:#999;"><i>Loading...</i></div>';

  // Load all template types in parallel
  const templatesByType = {};
  try {
    const results = await Promise.all(
      TEMPLATE_TYPES.map(t =>
        axios.get(`${baseUrl}/template/${t.key}`, { auth: authConfig })
          .then(res => ({ key: t.key, templates: res.data.templates || [] }))
          .catch(() => ({ key: t.key, templates: [] }))
      )
    );
    results.forEach(r => { templatesByType[r.key] = r.templates; });
  } catch (e) {
    console.error('Error loading templates:', e);
  }

  // Store for filtering
  window._tmplData = templatesByType;
  window._tmplMgmtNs = namespace;

  // Render cards
  const allCards = [];
  TEMPLATE_TYPES.forEach(typeMeta => {
    const templates = templatesByType[typeMeta.key] || [];
    templates.forEach(t => {
      allCards.push(renderTemplateCard(t, typeMeta, namespace));
    });
  });

  if (allCards.length > 0) {
    container.innerHTML = allCards.join('');
  } else {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:#999;"><i>No templates found in this namespace.</i></div>';
  }

  // Status bar
  if (statusBar) {
    const counts = TEMPLATE_TYPES.map(t => `${(templatesByType[t.key] || []).length} ${t.label}`).join(' + ');
    statusBar.innerHTML = `Total: ${counts} templates in <b>${namespace}</b>`;
  }

  // Re-apply current filter
  filterTemplateCards();
}
window.tmplLoadTemplates = tmplLoadTemplates;

// Render a single template card
function renderTemplateCard(t, typeMeta, namespace) {
  const typeBadge = `<span class="badge ${typeMeta.badgeClass}" style="font-size:11px;">${typeMeta.icon} ${typeMeta.label}</span>`;
  const source = t.source || 'user';
  const createdAt = t.createdAt ? new Date(t.createdAt).toLocaleString() : '-';

  // Escape single quotes in IDs for onclick handlers
  const safeNs = namespace.replace(/'/g, "\\'");
  const safeId = (t.id || '').replace(/'/g, "\\'");
  const safeType = typeMeta.key.replace(/'/g, "\\'");

  const safeName = window.escapeHtml(t.name || t.id || '');
  const safeDescription = t.description ? window.escapeHtml(t.description) : '<i>No description</i>';
  const safeDataId = window.escapeHtml(t.id || '');
  const safeDataName = window.escapeHtml((t.name || t.id || '').toLowerCase());

  return `
    <div class="tmpl-card" data-type="${typeMeta.key}" data-id="${safeDataId}" data-name="${safeDataName}">
      <div class="tmpl-card-header">
        <div>
          <span class="tmpl-card-title">${safeName}</span>
          ${typeBadge}
          <span class="badge badge-secondary" style="font-size:10px;">${window.escapeHtml(source)}</span>
        </div>
        <div class="tmpl-card-actions">
          <button onclick="viewTemplateDetail('${safeNs}', '${safeType}', '${safeId}')" class="btn btn-sm btn-outline-info" title="View">👁️</button>
          ${typeMeta.key === 'infra' ? `<button onclick="loadTemplateToInfraConfig('${safeNs}', '${safeId}')" class="btn btn-sm btn-outline-primary" title="Load to MC-Infra Configuration">📋 Load to Config</button>` : ''}
          ${typeMeta.key === 'k8sCluster' ? `<button onclick="loadTemplateToK8sConfig('${safeNs}', '${safeId}')" class="btn btn-sm btn-outline-primary" title="Load to K8s Configuration">📋 Load to Config</button>` : ''}
          <button onclick="applyTemplate('${safeNs}', '${safeType}', '${safeId}')" class="btn btn-sm btn-outline-success" title="Apply">▶️</button>
          <button onclick="deleteTemplate('${safeNs}', '${safeType}', '${safeId}')" class="btn btn-sm btn-outline-danger" title="Delete">🗑️</button>
        </div>
      </div>
      <div class="tmpl-card-body">
        <div style="margin-bottom:4px;color:#555;font-size:12px;">${safeDescription}</div>
        <div style="font-size:11px;color:#888;">Created: ${createdAt}</div>
      </div>
    </div>
  `;
}

// Tab-based type filtering
function tmplFilterByTab(btn) {
  // Update active tab
  document.querySelectorAll('.tmpl-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  filterTemplateCards();
}
window.tmplFilterByTab = tmplFilterByTab;

// Filter template cards by active tab and search text
function filterTemplateCards() {
  const activeTab = document.querySelector('.tmpl-tab.active');
  const typeFilter = activeTab ? activeTab.getAttribute('data-filter') : 'all';
  const searchFilter = (document.getElementById('tmplFilterSearch')?.value || '').toLowerCase();
  const cards = document.querySelectorAll('.tmpl-card');
  let visibleCount = 0;
  cards.forEach(card => {
    const type = card.getAttribute('data-type');
    const text = (card.textContent || '').toLowerCase();
    const name = card.getAttribute('data-name') || '';
    const typeMatch = typeFilter === 'all' || type === typeFilter;
    const searchMatch = !searchFilter || name.includes(searchFilter) || text.includes(searchFilter);
    const visible = typeMatch && searchMatch;
    card.style.display = visible ? '' : 'none';
    if (visible) visibleCount++;
  });
}
window.filterTemplateCards = filterTemplateCards;

// Namespace change handler within the modal
function tmplChangeNamespace(ns) {
  window._tmplMgmtNs = ns;
  // Reset search and tabs
  const searchInput = document.getElementById('tmplFilterSearch');
  if (searchInput) searchInput.value = '';
  document.querySelectorAll('.tmpl-tab').forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-filter') === 'all');
  });
  tmplLoadTemplates(ns);
}
window.tmplChangeNamespace = tmplChangeNamespace;

// Refresh templates for current namespace
function tmplRefresh() {
  const ns = window._tmplMgmtNs || document.getElementById('tmplNsSelect')?.value;
  if (ns) tmplLoadTemplates(ns);
}
window.tmplRefresh = tmplRefresh;

// Unified "New Template" — shows a type picker first
async function tmplCreateNew() {
  const ns = window._tmplMgmtNs || document.getElementById('tmplNsSelect')?.value;
  if (!ns) {
    Swal.fire('Warning', 'No namespace selected', 'warning');
    return;
  }

  // Build type picker buttons
  const typeButtons = TEMPLATE_TYPES.map(t =>
    `<button onclick="createTemplateDialog('${ns.replace(/'/g, "\\'")}', '${t.key}'); Swal.close();" 
      class="btn btn-outline-primary" 
      style="display:flex;flex-direction:column;align-items:center;padding:20px 16px;font-size:14px;min-width:140px;">
      <span style="font-size:28px;margin-bottom:6px;">${t.icon}</span>
      <span>${t.label}</span>
    </button>`
  ).join('');

  Swal.fire({
    title: '➕ Create New Template',
    html: `
      <p style="font-size:13px;color:#555;margin-bottom:16px;">Select the template type to create in namespace <b>${ns}</b>:</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        ${typeButtons}
      </div>
    `,
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '⬅️ Back',
    width: '500px'
  });
}
window.tmplCreateNew = tmplCreateNew;

// View a single template's full JSON detail
async function viewTemplateDetail(namespace, type, templateId) {
  const config = getConfig();
  const { hostname, port, username, password } = config;
  const url = `${tbApiBase()}/ns/${namespace}/template/${type}/${templateId}`;
  const typeMeta = getTemplateTypeMeta(type);

  try {
    const res = await axios.get(url, { auth: { username, password } });
    const data = res.data;

    const safeTemplateId = window.escapeHtml(templateId);
    const safeSource = window.escapeHtml(data.source || 'user');
    const createdAtStr = data.createdAt ? new Date(data.createdAt).toLocaleString() : '-';

    Swal.fire({
      title: `📄 Template: ${safeTemplateId}`,
      html: `
        <div style="text-align:left;">
          <div style="margin-bottom:8px;">
            <span class="badge ${typeMeta.badgeClass}">${typeMeta.icon} ${typeMeta.label}</span>
            <span class="badge badge-secondary">${safeSource}</span>
            <span style="font-size:11px;color:#888;margin-left:8px;">Created: ${window.escapeHtml(createdAtStr)}</span>
          </div>
          <pre id="tmplDetailJson" style="background:#1e1e1e;color:#d4d4d4;padding:12px;border-radius:6px;max-height:450px;overflow:auto;font-family:monospace;font-size:12px;white-space:pre-wrap;"></pre>
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-success btn-sm tmpl-detail-apply">▶️ Apply This Template</button>
            ${type === 'infra' ? `<button class="btn btn-outline-primary btn-sm tmpl-detail-load">📋 Load to Config</button>` : ''}
            ${type === 'k8sCluster' ? `<button class="btn btn-outline-primary btn-sm tmpl-detail-load-k8s">📋 Load to Config</button>` : ''}
            <button class="btn btn-outline-secondary btn-sm tmpl-detail-copy">📋 Copy JSON</button>
            <button class="btn btn-outline-primary btn-sm tmpl-detail-back">⬅️ Back to List</button>
          </div>
        </div>
      `,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: '❌ Close',
      width: '750px',
      didOpen: (popup) => {
        const jsonText = JSON.stringify(data, null, 2);
        const jsonEl = popup.querySelector('#tmplDetailJson');
        if (jsonEl) jsonEl.textContent = jsonText;
        window._lastTemplateJson = jsonText;
        popup.querySelector('.tmpl-detail-apply')?.addEventListener('click', () => applyTemplate(namespace, type, templateId));
        popup.querySelector('.tmpl-detail-load')?.addEventListener('click', () => loadTemplateToInfraConfig(namespace, templateId));
        popup.querySelector('.tmpl-detail-load-k8s')?.addEventListener('click', () => loadTemplateToK8sConfig(namespace, templateId));
        popup.querySelector('.tmpl-detail-copy')?.addEventListener('click', () => copyTemplateJson());
        popup.querySelector('.tmpl-detail-back')?.addEventListener('click', () => showTemplateManagement(namespace));
      }
    });
  } catch (err) {
    Swal.fire({ icon: 'error', title: '❌ Error', text: `Failed to load template: ${err.response?.data?.message || err.message}` });
  }
}
window.viewTemplateDetail = viewTemplateDetail;

// Copy template JSON to clipboard
function copyTemplateJson() {
  if (window._lastTemplateJson) {
    navigator.clipboard.writeText(window._lastTemplateJson).then(() => {
      Swal.fire({ icon: 'success', title: 'Copied to clipboard', timer: 1200, showConfirmButton: false, toast: true, position: 'top-end' });
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = window._lastTemplateJson;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      Swal.fire({ icon: 'success', title: 'Copied to clipboard', timer: 1200, showConfirmButton: false, toast: true, position: 'top-end' });
    });
  }
}
window.copyTemplateJson = copyTemplateJson;

// Apply a template (create resource from template)
// sourceNs: namespace where the template is stored
async function applyTemplate(sourceNs, type, templateId) {
  const typeMeta = getTemplateTypeMeta(type);
  const config = getConfig();
  const { hostname, port, username, password } = config;
  const authConfig = { username, password };

  // Load namespace list for target namespace selection
  let namespaces = [];
  try {
    const nsRes = await axios.get(`${tbApiBase()}/ns?option=id`, { auth: authConfig });
    namespaces = nsRes.data.output || nsRes.data.ns || [];
  } catch (e) {
    console.error('Error loading namespaces:', e);
  }

  // Default target namespace: use the main panel's namespace (not the template source ns)
  const mainNs = window.configNamespace || sourceNs;
  const nsOptionsHtml = namespaces.map(ns => {
    const nsId = typeof ns === 'string' ? ns : (ns.id || ns.name || '');
    const safeNsId = window.escapeHtml(nsId);
    // Default to the main panel's namespace, not the template source
    const selected = nsId === mainNs ? 'selected' : '';
    return `<option value="${safeNsId}" ${selected}>${safeNsId}</option>`;
  }).join('');

  const crossNsHint = sourceNs !== mainNs
    ? `<div style="font-size:12px;color:#856404;background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:6px 10px;margin-bottom:10px;">💡 Template is from namespace <b>${window.escapeHtml(sourceNs)}</b>. You can select a different target namespace to create the resource in.</div>`
    : '';

  const safeTemplateIdHtml = window.escapeHtml(templateId);
  const nameField = typeMeta.applyNameField || 'name';
  const nameLabel = nameField === 'namePrefix' ? 'Name Prefix' : 'Name';
  const namePlaceholder = nameField === 'namePrefix' ? 'my-k8s' : 'my-new-resource';
  const { value: formValues } = await Swal.fire({
    title: `▶️ Apply ${typeMeta.label} Template`,
    html: `
      <div style="text-align:left;">
        <p style="font-size:13px;color:#555;margin-bottom:8px;">Create a new <b>${typeMeta.label}</b> from template <code style="background:#e9ecef;padding:2px 6px;border-radius:3px;">${safeTemplateIdHtml}</code></p>
        ${crossNsHint}
        <div style="margin-bottom:10px;">
          <label style="font-size:13px;font-weight:500;">Target Namespace <span style="color:red;">*</span></label>
          <select id="tmplApplyTargetNs" class="swal2-input" style="margin:4px 0;width:100%;font-size:14px;height:38px;">
            ${nsOptionsHtml}
          </select>
        </div>
        <div style="margin-bottom:10px;">
          <label style="font-size:13px;font-weight:500;">${nameLabel} <span style="color:red;">*</span></label>
          <input id="tmplApplyName" class="swal2-input" placeholder="${namePlaceholder}" value="mc-${generateInfraName()}" style="margin:4px 0;width:100%;font-size:14px;">
        </div>
        <div style="margin-bottom:10px;">
          <label style="font-size:13px;font-weight:500;">Description (optional)</label>
          <input id="tmplApplyDesc" class="swal2-input" placeholder="Created from template ${safeTemplateIdHtml}" style="margin:4px 0;width:100%;font-size:14px;">
        </div>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: `▶️ Create ${typeMeta.label}`,
    confirmButtonColor: '#28a745',
    width: '580px',
    preConfirm: () => {
      const targetNs = document.getElementById('tmplApplyTargetNs')?.value?.trim();
      const name = document.getElementById('tmplApplyName')?.value?.trim();
      if (!targetNs) {
        Swal.showValidationMessage('Target namespace is required');
        return false;
      }
      if (!name) {
        Swal.showValidationMessage(`${nameLabel} is required`);
        return false;
      }
      return {
        targetNs: targetNs,
        name: name,
        description: document.getElementById('tmplApplyDesc')?.value?.trim() || ''
      };
    }
  });

  if (!formValues) return;

  const targetNs = formValues.targetNs;
  const targetBaseUrl = `${tbApiBase()}/ns/${targetNs}`;

  const spinnerId = addSpinnerTask(`Creating ${typeMeta.label} from template`);
  try {
    let res;

    if (targetNs === sourceNs) {
      // Same namespace: use the template apply shortcut endpoint
      let url;
      if (typeMeta.applyUrlFn) {
        url = typeMeta.applyUrlFn(targetBaseUrl, templateId);
      } else {
        url = `${targetBaseUrl}/resources/${type}/template/${templateId}`;
      }
      const applyBody = { description: formValues.description };
      applyBody[nameField] = formValues.name;
      res = await axios.post(url, applyBody, { auth: authConfig });
    } else {
      // Cross-namespace: GET template from source ns, then directly create in target ns
      const templateUrl = `${tbApiBase()}/ns/${sourceNs}/template/${type}/${templateId}`;
      const tmplRes = await axios.get(templateUrl, { auth: authConfig });
      const tmplData = tmplRes.data;

      // Extract the request body from template
      const reqBody = tmplData[typeMeta.bodyFieldName];
      if (!reqBody) {
        throw new Error(`Template does not contain '${typeMeta.bodyFieldName}' field`);
      }

      // Apply name/namePrefix and description overrides
      reqBody[nameField] = formValues.name;
      if (formValues.description) {
        reqBody.description = formValues.description;
      }

      // POST to the target namespace's direct creation endpoint
      let createUrl;
      if (typeMeta.directCreateUrlFn) {
        createUrl = typeMeta.directCreateUrlFn(targetBaseUrl);
      } else {
        createUrl = `${targetBaseUrl}/resources/${type}`;
      }
      res = await axios.post(createUrl, reqBody, { auth: authConfig });
    }

    removeSpinnerTask(spinnerId);
    const nsNote = targetNs !== sourceNs ? ` in namespace "${targetNs}"` : '';
    Swal.fire({
      icon: 'success',
      title: `${typeMeta.label} Created!`,
      text: `Successfully created from template "${templateId}"${nsNote}`,
      timer: 3000,
      showConfirmButton: false
    });
    outputAlert(res.data, "success");
  } catch (err) {
    removeSpinnerTask(spinnerId);
    Swal.fire('❌ Creation Failed', err.response?.data?.message || err.message, 'error');
  }
}
window.applyTemplate = applyTemplate;

// Delete a template
async function deleteTemplate(namespace, type, templateId) {
  const typeMeta = getTemplateTypeMeta(type);
  const result = await Swal.fire({
    title: '🗑️ Delete Template?',
    text: `Are you sure you want to delete ${typeMeta.label} template "${templateId}"?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: '🗑️ Delete',
    confirmButtonColor: '#dc3545',
    cancelButtonText: 'Cancel'
  });
  if (!result.isConfirmed) return;

  const config = getConfig();
  const { hostname, port, username, password } = config;
  const url = `${tbApiBase()}/ns/${namespace}/template/${type}/${templateId}`;

  try {
    await axios.delete(url, { auth: { username, password } });
    Swal.fire({ icon: 'success', title: 'Template Deleted', timer: 1500, showConfirmButton: false, toast: true, position: 'top-end' });
    showTemplateManagement(namespace);
  } catch (err) {
    Swal.fire('❌ Error', `Failed to delete template: ${err.response?.data?.message || err.message}`, 'error');
  }
}
window.deleteTemplate = deleteTemplate;

// Create a new template dialog (called from type picker)
async function createTemplateDialog(namespace, type) {
  const typeMeta = getTemplateTypeMeta(type);

  const { value: formValues } = await Swal.fire({
    title: `➕ Create ${typeMeta.label} Template`,
    html: `
      <div style="text-align:left;">
        <div style="margin-bottom:8px;">
          <label style="font-size:13px;font-weight:500;">Template Name <span style="color:red;">*</span></label>
          <input id="newTmplName" class="swal2-input" placeholder="my-template" style="margin:4px 0;width:100%;font-size:14px;">
        </div>
        <div style="margin-bottom:8px;">
          <label style="font-size:13px;font-weight:500;">Description</label>
          <input id="newTmplDesc" class="swal2-input" placeholder="Template description" style="margin:4px 0;width:100%;font-size:14px;">
        </div>
        <div style="margin-bottom:8px;">
          <label style="font-size:13px;font-weight:500;">${typeMeta.label} Request Body (JSON) <span style="color:red;">*</span></label>
          <textarea id="newTmplBody" class="swal2-textarea" rows="12" 
            style="margin:4px 0;width:100%;font-size:12px;font-family:monospace;min-height:200px;resize:vertical;"
            placeholder='${(typeMeta.placeholder || '{}').replace(/'/g, "&#39;")}'></textarea>
        </div>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: '➕ Create Template',
    confirmButtonColor: '#007bff',
    width: '650px',
    preConfirm: () => {
      const name = document.getElementById('newTmplName')?.value?.trim();
      const desc = document.getElementById('newTmplDesc')?.value?.trim() || '';
      const bodyStr = document.getElementById('newTmplBody')?.value?.trim();
      if (!name) {
        Swal.showValidationMessage('Template name is required');
        return false;
      }
      if (!bodyStr) {
        Swal.showValidationMessage('Request body JSON is required');
        return false;
      }
      let bodyJson;
      try {
        bodyJson = JSON.parse(bodyStr);
      } catch (e) {
        Swal.showValidationMessage('Invalid JSON: ' + e.message);
        return false;
      }
      const reqPayload = { name: name, description: desc };
      reqPayload[typeMeta.bodyFieldName] = bodyJson;
      return reqPayload;
    }
  });

  if (!formValues) return;

  const config = getConfig();
  const { hostname, port, username, password } = config;
  const url = `${tbApiBase()}/ns/${namespace}/template/${type}`;

  const spinnerId = addSpinnerTask('Creating template');
  try {
    await axios.post(url, formValues, { auth: { username, password } });
    removeSpinnerTask(spinnerId);
    Swal.fire({ icon: 'success', title: 'Template Created!', text: `Template "${formValues.name}" created successfully.`, timer: 2000, showConfirmButton: false });
    setTimeout(() => showTemplateManagement(namespace), 500);
  } catch (err) {
    removeSpinnerTask(spinnerId);
    Swal.fire('❌ Error', `Failed to create template: ${err.response?.data?.message || err.message}`, 'error');
  }
}
window.createTemplateDialog = createTemplateDialog;

// Save Infra config as template - called from copyInfraConfig flow
async function saveConfigAsTemplate(namespace, infraId, infraReq) {
  const { value: formValues } = await Swal.fire({
    title: '📄 Save as Infra Template',
    html: `
      <div style="text-align:left;">
        <p style="font-size:13px;color:#555;">Save the extracted Infra configuration from <b>${window.escapeHtml(infraId)}</b> as a reusable template.</p>
        <div style="margin-bottom:8px;">
          <label style="font-size:13px;font-weight:500;">Template Name <span style="color:red;">*</span></label>
          <input id="saveTmplName" class="swal2-input" value="${window.escapeHtml(infraId)}-template" style="margin:4px 0;width:100%;font-size:14px;">
        </div>
        <div style="margin-bottom:8px;">
          <label style="font-size:13px;font-weight:500;">Description</label>
          <input id="saveTmplDesc" class="swal2-input" value="Template extracted from Infra: ${window.escapeHtml(infraId)}" style="margin:4px 0;width:100%;font-size:14px;">
        </div>
        <div style="margin-bottom:8px;">
          <label style="font-size:13px;font-weight:500;">Configuration Preview</label>
          <pre id="saveTmplConfigPreview" style="background:#1e1e1e;color:#d4d4d4;padding:10px;border-radius:6px;max-height:250px;overflow:auto;font-family:monospace;font-size:11px;white-space:pre-wrap;"></pre>
        </div>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: '💾 Save as Template',
    confirmButtonColor: '#007bff',
    width: '650px',
    didOpen: (popup) => {
      const previewEl = popup.querySelector('#saveTmplConfigPreview');
      if (previewEl) previewEl.textContent = JSON.stringify(infraReq, null, 2);
    },
    preConfirm: () => {
      const name = document.getElementById('saveTmplName')?.value?.trim();
      if (!name) {
        Swal.showValidationMessage('Template name is required');
        return false;
      }
      return {
        name: name,
        description: document.getElementById('saveTmplDesc')?.value?.trim() || '',
        infraDynamicReq: infraReq
      };
    }
  });

  if (!formValues) return;

  const config = getConfig();
  const { hostname, port, username, password } = config;
  const url = `${tbApiBase()}/ns/${namespace}/template/infra`;

  const spinnerId = addSpinnerTask('Saving template');
  try {
    await axios.post(url, formValues, { auth: { username, password } });
    removeSpinnerTask(spinnerId);
    Swal.fire({
      icon: 'success',
      title: 'Template Saved!',
      text: `Template "${formValues.name}" has been saved. You can find it in Template Management.`,
      timer: 2500,
      showConfirmButton: false
    });
  } catch (err) {
    removeSpinnerTask(spinnerId);
    Swal.fire('❌ Error', `Failed to save template: ${err.response?.data?.message || err.message}`, 'error');
  }
}
window.saveConfigAsTemplate = saveConfigAsTemplate;

// Load an Infra template into the MC-Infra Configuration panel (same as Copy Config)
async function loadTemplateToInfraConfig(namespace, templateId) {
  const config = getConfig();
  const { hostname, port, username, password } = config;
  const url = `${tbApiBase()}/ns/${namespace}/template/infra/${templateId}`;

  const spinnerId = addSpinnerTask('Loading template to MC-Infra Configuration');
  let data;
  try {
    const res = await axios.get(url, { auth: { username, password } });
    data = res.data;
  } catch (err) {
    removeSpinnerTask(spinnerId);
    Swal.fire({ icon: 'error', title: '❌ Error', text: `Failed to load template: ${err.response?.data?.message || err.message}` });
    return;
  }

  const infraReq = data.infraDynamicReq;
  if (!infraReq || !infraReq.nodeGroups || infraReq.nodeGroups.length === 0) {
    removeSpinnerTask(spinnerId);
    Swal.fire('⚠️ Warning', 'No NodeGroup configuration found in this template.', 'warning');
    return;
  }

  // Close Template Management modal
  Swal.close();

  // Clear existing configuration
  clearCircle('');

  // Helper to run async task thunks with bounded concurrency while preserving order
  async function runWithConcurrency(tasks, limit = 6) {
    const results = new Array(tasks.length);
    let cursor = 0;
    async function worker() {
      while (cursor < tasks.length) {
        const idx = cursor++;
        results[idx] = await tasks[idx]();
      }
    }
    const workers = [];
    const workerCount = Math.min(limit, tasks.length);
    for (let i = 0; i < workerCount; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);
    return results;
  }

  // Populate nodeGroupRequestFromSpecList and recommendedSpecList (mirrors copyInfraConfig logic)
  // Fetch spec details for each nodeGroup with bounded concurrency via specId
  const specFetchTasks = infraReq.nodeGroups.map(function(sg) {
    var nodeConfig = $.extend({}, createInfraReqVmTmplt);
    nodeConfig.name           = sg.name           || ('g' + (nodeGroupRequestFromSpecList.length + 1));
    nodeConfig.specId         = sg.specId          || '';
    nodeConfig.imageId        = sg.imageId         || 'ubuntu22.04';
    nodeConfig.rootDiskType   = sg.rootDiskType    || 'default';
    nodeConfig.rootDiskSize   = sg.rootDiskSize    || 0;
    nodeConfig.nodeGroupSize   = sg.nodeGroupSize    || 1;
    nodeConfig.description    = sg.description     || 'mapui';
    nodeConfig.connectionName = sg.connectionName  || '';
    nodeConfig.zone           = sg.zone            || '';
    if (sg.label && Object.keys(sg.label).length > 0) {
      nodeConfig.label = sg.label;
    }
    nodeGroupRequestFromSpecList.push(nodeConfig);

    // Fetch spec details if specId is available
    return function() {
      if (sg.specId) {
        const specUrl = `${tbApiBase()}/ns/system/resources/spec/${encodeURIComponent(sg.specId)}`;
        return axios.get(specUrl, { auth: { username, password } })
          .then(function(specRes) {
            const s = specRes.data;
            const prov = s.providerName || extractProviderFromSpecId(sg.specId);
            const reg = s.regionName || extractRegionFromSpecId(sg.specId);
            let lat = s.regionLatitude ?? s.location?.latitude ?? '';
            let lon = s.regionLongitude ?? s.location?.longitude ?? '';
            if (!Number.isFinite(parseFloat(lat)) || !Number.isFinite(parseFloat(lon))) {
              const coords = findLocationCoordinates(sg.connectionName, prov, reg);
              if (coords) { lon = coords.lon; lat = coords.lat; }
            }
            return {
              id:                       sg.specId,
              providerName:             prov,
              regionName:               reg,
              cspSpecName:              s.cspSpecName              || sg.specId,
              vCPU:                     s.vCPU                     ?? 'N/A',
              memoryGiB:                s.memoryGiB                ?? 'N/A',
              costPerHour:              s.costPerHour              || 0,
              acceleratorType:          s.acceleratorType          || '',
              acceleratorModel:         s.acceleratorModel         || '',
              acceleratorCount:         s.acceleratorCount         || 0,
              acceleratorMemoryGB:      s.acceleratorMemoryGB      || '',
              connectionName:           sg.connectionName          || '',
              rootDiskType:             sg.rootDiskType            || 'default',
              regionLatitude:           lat,
              regionLongitude:          lon,
              availabilityStatus:       s.availabilityStatus       || 'Unverified',
              availabilityReason:       s.availabilityReason       || '',
              availableZones:           Array.isArray(s.availableZones) ? s.availableZones : [],
              unavailableZones:         Array.isArray(s.unavailableZones) ? s.unavailableZones : [],
              availabilityCheckedAt:    s.availabilityCheckedAt    || null,
              availabilityRefreshAfter: s.availabilityRefreshAfter || null
            };
          })
          .catch(function() {
            // Fallback to parsed values if spec fetch fails
            const prov = extractProviderFromSpecId(sg.specId);
            const reg = extractRegionFromSpecId(sg.specId);
            const coords = findLocationCoordinates(sg.connectionName, prov, reg);
            return {
              id:                  sg.specId,
              providerName:        prov,
              regionName:          reg,
              cspSpecName:         sg.specId,
              vCPU:                'N/A',
              memoryGiB:           'N/A',
              costPerHour:         0,
              acceleratorType:     '',
              acceleratorModel:    '',
              acceleratorCount:    0,
              acceleratorMemoryGB: '',
              connectionName:      sg.connectionName || '',
              rootDiskType:        sg.rootDiskType   || 'default',
              regionLatitude:      coords ? coords.lat : '',
              regionLongitude:     coords ? coords.lon : '',
              availabilityStatus:  'Unverified'
            };
          });
      } else {
        const coords = findLocationCoordinates(sg.connectionName, '', '');
        return Promise.resolve({
          id:                  '',
          providerName:        '',
          regionName:          '',
          cspSpecName:         '',
          vCPU:                'N/A',
          memoryGiB:           'N/A',
          costPerHour:         0,
          acceleratorType:     '',
          acceleratorModel:    '',
          acceleratorCount:    0,
          acceleratorMemoryGB: '',
          connectionName:      sg.connectionName || '',
          rootDiskType:        sg.rootDiskType   || 'default',
          regionLatitude:      coords ? coords.lat : '',
          regionLongitude:     coords ? coords.lon : '',
          availabilityStatus:  'Unverified'
        });
      }
    };
  });

  // Wait for all spec fetches, then render
  try {
    const specInfoList = await runWithConcurrency(specFetchTasks, 6);
    specInfoList.forEach(function(specInfo) {
      recommendedSpecList.push(specInfo);
    });
    renderMapFromConfig();
    updateNodeGroupReview();

    // Switch to Provision tab
    try {
      document.querySelectorAll('.nav-link').forEach(tab => tab.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('show', 'active'));
      const provisionTab = document.getElementById('provision-tab');
      const provisionPane = document.getElementById('provision');
      if (provisionTab && provisionPane) {
        provisionTab.classList.add('active');
        provisionPane.classList.add('show', 'active');
        if (typeof $ !== 'undefined' && $.fn && $.fn.tab) {
          $(provisionTab).tab('show');
        }
      }
    } catch (e) {
      console.warn('Failed to switch to provision tab:', e);
      var provisionTab = document.getElementById('provision-tab');
      if (provisionTab) provisionTab.click();
    }

    Swal.fire({
      toast: true,
      position: 'bottom-end',
      icon: 'success',
      title: `Template "${window.escapeHtml(templateId)}" loaded to Provision panel`,
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true
    });
  } finally {
    removeSpinnerTask(spinnerId);
  }
}
window.loadTemplateToInfraConfig = loadTemplateToInfraConfig;

async function loadTemplateToK8sConfig(namespace, templateId) {
  const config = getConfig();
  const { hostname, port, username, password } = config;
  const url = `${tbApiBase()}/ns/${namespace}/template/k8sCluster/${templateId}`;

  const spinnerId = addSpinnerTask('Loading K8s template to Configuration');
  let data;
  try {
    const res = await axios.get(url, { auth: { username, password } });
    data = res.data;
  } catch (err) {
    removeSpinnerTask(spinnerId);
    Swal.fire({ icon: 'error', title: '❌ Error', text: `Failed to load template: ${err.response?.data?.message || err.message}` });
    return;
  }

  const multiReq = data.k8sMultiClusterDynamicReq;
  if (!multiReq || !multiReq.clusters || multiReq.clusters.length === 0) {
    removeSpinnerTask(spinnerId);
    Swal.fire('⚠️ Warning', 'No cluster configuration found in this template.', 'warning');
    return;
  }

  // Close Template Management modal
  Swal.close();

  // Switch to K8s mode if not already active
  const k8sModeInput = document.getElementById('k8sMode');
  if (k8sModeInput && !k8sModeInput.checked) {
    // Bootstrap btn-group-toggle requires updating the active class on the label,
    // setting .checked alone only changes the internal state without updating visuals.
    document.getElementById('nodeMode')?.closest('label')?.classList.remove('active');
    k8sModeInput.closest('label')?.classList.add('active');
    k8sModeInput.checked = true;
    await toggleWorkloadType();
  }

  // Clear existing configuration
  clearCircle('');

  async function runWithConcurrency(tasks, limit = 6) {
    const results = new Array(tasks.length);
    let cursor = 0;
    async function worker() {
      while (cursor < tasks.length) {
        const idx = cursor++;
        results[idx] = await tasks[idx]();
      }
    }
    const workers = [];
    const workerCount = Math.min(limit, tasks.length);
    for (let i = 0; i < workerCount; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);
    return results;
  }

  // Populate nodeGroupRequestFromSpecList from k8s cluster configs
  const specFetchTasks = multiReq.clusters.map(function(cluster, idx) {
    var nodeConfig = $.extend({}, createInfraReqVmTmplt);
    nodeConfig.name          = cluster.nodeGroupName || ('ng-' + (idx + 1));
    nodeConfig.specId        = cluster.specId        || '';
    nodeConfig.imageId       = cluster.imageId       || 'default';
    nodeConfig.rootDiskType  = cluster.rootDiskType  || 'default';
    nodeConfig.rootDiskSize  = cluster.rootDiskSize  || 0;
    nodeConfig.nodeGroupSize = cluster.desiredNodeSize || 1;
    nodeConfig.connectionName = cluster.connectionName || '';
    // K8s-specific fields stored for createK8sCluster() to pick up
    nodeConfig.minNodeSize   = cluster.minNodeSize   || 1;
    nodeConfig.maxNodeSize   = cluster.maxNodeSize   || 3;
    nodeConfig.onAutoScaling = cluster.onAutoScaling || 'true';
    nodeConfig.version       = cluster.version       || '';
    nodeGroupRequestFromSpecList.push(nodeConfig);

    return function() {
      if (cluster.specId) {
        const specUrl = `${tbApiBase()}/ns/system/resources/spec/${encodeURIComponent(cluster.specId)}`;
        return axios.get(specUrl, { auth: { username, password } })
          .then(function(specRes) {
            const s = specRes.data;
            const prov = s.providerName || extractProviderFromSpecId(cluster.specId);
            const reg = s.regionName || extractRegionFromSpecId(cluster.specId);
            let lat = s.regionLatitude ?? s.location?.latitude ?? '';
            let lon = s.regionLongitude ?? s.location?.longitude ?? '';
            if (!Number.isFinite(parseFloat(lat)) || !Number.isFinite(parseFloat(lon))) {
              const coords = findLocationCoordinates(cluster.connectionName, prov, reg);
              if (coords) { lon = coords.lon; lat = coords.lat; }
            }
            return {
              id:                       cluster.specId,
              providerName:             prov,
              regionName:               reg,
              cspSpecName:              s.cspSpecName              || cluster.specId,
              vCPU:                     s.vCPU                     ?? 'N/A',
              memoryGiB:                s.memoryGiB                ?? 'N/A',
              costPerHour:              s.costPerHour              || 0,
              acceleratorType:          s.acceleratorType          || '',
              acceleratorModel:         s.acceleratorModel         || '',
              acceleratorCount:         s.acceleratorCount         || 0,
              acceleratorMemoryGB:      s.acceleratorMemoryGB      || '',
              connectionName:           cluster.connectionName     || '',
              rootDiskType:             cluster.rootDiskType       || 'default',
              regionLatitude:           lat,
              regionLongitude:          lon,
              availabilityStatus:       s.availabilityStatus       || 'Unverified',
              availabilityReason:       s.availabilityReason       || '',
              availableZones:           Array.isArray(s.availableZones) ? s.availableZones : [],
              unavailableZones:         Array.isArray(s.unavailableZones) ? s.unavailableZones : [],
              availabilityCheckedAt:    s.availabilityCheckedAt    || null,
              availabilityRefreshAfter: s.availabilityRefreshAfter || null
            };
          })
          .catch(function() {
            const prov = extractProviderFromSpecId(cluster.specId);
            const reg = extractRegionFromSpecId(cluster.specId);
            const coords = findLocationCoordinates(cluster.connectionName, prov, reg);
            return {
              id:                  cluster.specId,
              providerName:        prov,
              regionName:          reg,
              cspSpecName:         cluster.specId,
              vCPU:                'N/A',
              memoryGiB:           'N/A',
              costPerHour:         0,
              acceleratorType:     '',
              acceleratorModel:    '',
              acceleratorCount:    0,
              acceleratorMemoryGB: '',
              connectionName:      cluster.connectionName || '',
              rootDiskType:        cluster.rootDiskType   || 'default',
              regionLatitude:      coords ? coords.lat : '',
              regionLongitude:     coords ? coords.lon : '',
              availabilityStatus:  'Unverified'
            };
          });
      } else {
        const coords = findLocationCoordinates(cluster.connectionName, '', '');
        return Promise.resolve({
          id:                  '',
          providerName:        '',
          regionName:          '',
          cspSpecName:         '',
          vCPU:                'N/A',
          memoryGiB:           'N/A',
          costPerHour:         0,
          acceleratorType:     '',
          acceleratorModel:    '',
          acceleratorCount:    0,
          acceleratorMemoryGB: '',
          connectionName:      cluster.connectionName || '',
          rootDiskType:        cluster.rootDiskType   || 'default',
          regionLatitude:      coords ? coords.lat : '',
          regionLongitude:     coords ? coords.lon : '',
          availabilityStatus:  'Unverified'
        });
      }
    };
  });

  try {
    const specInfoList = await runWithConcurrency(specFetchTasks, 6);
    specInfoList.forEach(function(specInfo) {
      recommendedSpecList.push(specInfo);
    });
    renderMapFromConfig();
    updateNodeGroupReview();

    // Switch to Provision tab
    try {
      document.querySelectorAll('.nav-link').forEach(tab => tab.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('show', 'active'));
      const provisionTab = document.getElementById('provision-tab');
      const provisionPane = document.getElementById('provision');
      if (provisionTab && provisionPane) {
        provisionTab.classList.add('active');
        provisionPane.classList.add('show', 'active');
        if (typeof $ !== 'undefined' && $.fn && $.fn.tab) {
          $(provisionTab).tab('show');
        }
      }
    } catch (e) {
      console.warn('Failed to switch to provision tab:', e);
      var provisionTab = document.getElementById('provision-tab');
      if (provisionTab) provisionTab.click();
    }

    Swal.fire({
      toast: true,
      position: 'bottom-end',
      icon: 'success',
      title: `K8s template "${window.escapeHtml(templateId)}" loaded to Provision panel`,
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true
    });
  } finally {
    removeSpinnerTask(spinnerId);
  }
}
window.loadTemplateToK8sConfig = loadTemplateToK8sConfig;
