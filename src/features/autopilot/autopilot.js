/**
 * Autopilot Provisioning Feature Module
 * @module features/autopilot
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import { tbApiBase } from '../../core/api.js';
import { generateInfraName, escapeHtml } from '../../core/utils.js';

const $ = (...args) => (window.$ || window.jQuery)(...args);
const addSpinnerTask = (name) => (window.addSpinnerTask ? window.addSpinnerTask(name) : name);
const removeSpinnerTask = (id) => { if (window.removeSpinnerTask) window.removeSpinnerTask(id); };
const errorAlert = (msg) => (window.errorAlert ? window.errorAlert(msg) : Swal.fire({ icon: 'error', title: msg, showConfirmButton: true }));
const updateInfraList = () => { if (window.updateInfraList) window.updateInfraList(); };
const parseLabelsString = (...args) => (window.parseLabelsString ? window.parseLabelsString(...args) : {});
const labelsToString = (...args) => (window.labelsToString ? window.labelsToString(...args) : '');
const generateRandomRequestId = (...args) => (window.generateRandomRequestId ? window.generateRandomRequestId(...args) : 'req-' + Math.random().toString(36).slice(2));

// ═══════════════════════════════════════════════════════════════════════════════
//  AUTOPILOT PROVISION
//  API endpoints used:
//    POST /ns/{nsId}/infraAutopilotReview  — pre-flight validation
//    POST /ns/{nsId}/infraAutopilot        — actual provision (synchronous, long-running)
//    GET  /ns/{nsId}/infraAutopilot/{id}/status — polling during provision
// ═══════════════════════════════════════════════════════════════════════════════

var _apNodeSpecCounter = 0;
var _apActiveNodeSpecIds = [];
var _apPollingTimer = null;
var _apPollingStop = false;
var _apElapsedTimer = null;
var _apCurrentReq = null;

// ── Entry point ───
function showAutopilotDialog() {
  // Reset state
  _apNodeSpecCounter = 0;
  _apActiveNodeSpecIds = [];
  _apCurrentReq = null;

  // Reset to form panel
  _apShowFormPanel();

  // Clear node spec container and add a first card
  var container = document.getElementById('apNodeSpecContainer');
  if (container) container.innerHTML = '';
  addAutopilotNodeSpec();

  // Pre-fill infra name with editable random name (same pattern as infraDynamic)
  var nameEl = document.getElementById('apInfraName');
  if (nameEl) nameEl.value = 'ap-' + generateInfraName();

  var labelEl = document.getElementById('apInfraLabel');
  if (labelEl) labelEl.value = '';
  var postScriptEl = document.getElementById('apPostScript');
  if (postScriptEl) postScriptEl.value = '';
  var postScriptTimeoutEl = document.getElementById('apPostScriptTimeout');
  if (postScriptTimeoutEl) postScriptTimeoutEl.value = '';

  $('#autopilotModal').modal('show');
}

// ── NodeSpec card management ──
function addAutopilotNodeSpec() {
  var id = ++_apNodeSpecCounter;
  _apActiveNodeSpecIds.push(id);
  var container = document.getElementById('apNodeSpecContainer');
  if (container) {
    container.insertAdjacentHTML('beforeend', _apNodeSpecCardHtml(id));
  }
}

function removeAutopilotNodeSpec(id) {
  _apActiveNodeSpecIds = _apActiveNodeSpecIds.filter(function(x) { return x !== id; });
  var card = document.getElementById('apNsCard_' + id);
  if (card) card.remove();
}

function _apNodeSpecCardHtml(id) {
  var inputStyle = 'background:#0d1117;border-color:#30363d;color:#e6edf3';
  var labelStyle = 'color:#7d8590;font-size:10px;text-transform:uppercase;letter-spacing:.5px';
  var sectionHeaderStyle = 'font-size:10px;color:#7d8590;text-transform:uppercase;letter-spacing:1px;border-top:1px solid #21262d;padding-top:6px;margin:6px 0 4px';
  return `
  <div class="card mb-2" id="apNsCard_${id}"
       style="background:#0d1117;border:1px solid #30363d;border-left:3px solid #f0a500">
    <div class="card-header p-2" style="background:#0a0e14;border-color:#21262d">
      <div class="d-flex align-items-center justify-content-between">
        <div class="d-flex align-items-center" style="gap:8px">
          <span style="color:#f0a500;font-weight:700;font-size:12px;font-family:monospace">⬡ Node Type ${id}</span>
          <input type="text" id="apNs_${id}_name" class="form-control form-control-sm"
                 placeholder="ex: gpu-workers, cpu-nodes"
                 style="width:200px;${inputStyle};font-size:12px">
        </div>
        <button type="button" class="btn btn-outline-danger btn-sm py-0 px-2"
                onclick="removeAutopilotNodeSpec(${id})" style="font-size:11px">✕</button>
      </div>
    </div>
    <div class="card-body p-2">

      <div class="form-row mb-1">
        <div class="form-group col mb-1">
          <label><small style="${labelStyle}">Desired Count *</small></label>
          <input type="number" id="apNs_${id}_desiredCount" class="form-control form-control-sm"
                 value="1" min="1" style="${inputStyle}">
        </div>
        <div class="form-group col mb-1">
          <label><small style="${labelStyle}">Min Count</small></label>
          <input type="number" id="apNs_${id}_minCount" class="form-control form-control-sm"
                 placeholder="optional" min="1" style="${inputStyle}">
        </div>
        <div class="form-group col mb-1">
          <label><small style="${labelStyle}">Max / Location</small></label>
          <input type="number" id="apNs_${id}_maxPerLocation" class="form-control form-control-sm"
                 placeholder="optional" min="1" style="${inputStyle}">
        </div>
        <div class="form-group col mb-1">
          <label><small style="${labelStyle}">Placement</small></label>
          <select id="apNs_${id}_strategy" class="form-control form-control-sm" style="${inputStyle}">
            <option value="spread" selected>spread</option>
            <option value="pack">pack</option>
            <option value="balanced">balanced</option>
          </select>
        </div>
      </div>

      <div style="${sectionHeaderStyle}">Spec Filter → specFilter</div>
      <div class="form-row mb-1">
        <div class="form-group col mb-1">
          <label><small style="${labelStyle}">Provider</small></label>
          <div class="dropdown">
            <button class="form-control form-control-sm dropdown-toggle text-left p-1" type="button"
                    data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"
                    style="${inputStyle};font-size:12px">
              <span id="apNs_${id}_providerText">ALL</span>
            </button>
            <div class="dropdown-menu p-2" onclick="event.stopPropagation()"
                 style="min-width:130px;background:#1c2128;border:1px solid #30363d;border-radius:4px">
              <div class="form-check py-0 mb-1" style="border-bottom:1px solid #21262d;padding-bottom:4px">
                <input class="form-check-input" type="checkbox" id="apNs_${id}_providerAll" checked
                       onchange="_apProviderAllToggle(${id})">
                <label class="form-check-label" for="apNs_${id}_providerAll"
                       style="color:#e6edf3;font-size:12px;cursor:pointer">ALL</label>
              </div>
              <div id="apNs_${id}_providerCsps">
                ${_apGetAvailableProviders().map(p =>
                  `<div class="form-check py-0">
                    <input class="form-check-input" type="checkbox" id="apNs_${id}_provider_${p}" value="${p}"
                           onchange="_apProviderCheckboxChange(${id})">
                    <label class="form-check-label" for="apNs_${id}_provider_${p}"
                           style="color:#7d8590;font-size:12px;cursor:pointer">${p.toUpperCase()}</label>
                  </div>`
                ).join('')}
              </div>
            </div>
          </div>
        </div>
        <div class="form-group col mb-1">
          <label><small style="${labelStyle}">vCPU ≥</small></label>
          <input type="number" id="apNs_${id}_vcpu" class="form-control form-control-sm"
                 placeholder="min" min="1" style="${inputStyle}">
        </div>
        <div class="form-group col mb-1">
          <label><small style="${labelStyle}">Mem GiB ≥</small></label>
          <input type="number" id="apNs_${id}_memory" class="form-control form-control-sm"
                 placeholder="min" min="0.5" step="0.5" style="${inputStyle}">
        </div>
        <div class="form-group col mb-1">
          <label><small style="${labelStyle}">Architecture</small></label>
          <select id="apNs_${id}_arch" class="form-control form-control-sm" style="${inputStyle}">
            <option value="x86_64" selected>x86_64</option>
            <option value="arm64">arm64</option>
            <option value="">Any</option>
          </select>
        </div>
      </div>
      <div class="form-row mb-1">
        <div class="form-group col mb-1">
          <label><small style="${labelStyle}">GPU Model</small></label>
          <select id="apNs_${id}_gpuModel" class="form-control form-control-sm" style="${inputStyle}">
            <option value="" selected>None (CPU only)</option>
            <optgroup label="Any GPU"><option value="any">Any GPU</option></optgroup>
            <optgroup label="NVIDIA Data Center">
              <option value="H100">H100</option>
              <option value="H200">H200</option>
              <option value="A100">A100</option>
              <option value="A10G">A10G</option>
              <option value="A10">A10</option>
              <option value="L4">L4</option>
              <option value="L40S">L40S</option>
              <option value="L40">L40</option>
              <option value="V100">V100</option>
              <option value="T4">T4</option>
              <option value="P100">P100</option>
            </optgroup>
            <optgroup label="AMD Radeon Pro (Virtualization)">
              <option value="AMD RADEON PRO V710">V710</option>
              <option value="AMD RADEON PRO V620">V620</option>
              <option value="AMD RADEON PRO V520">V520</option>
            </optgroup>
            <optgroup label="AMD Instinct">
              <option value="MI300X">MI300X</option>
              <option value="MI250X">MI250X</option>
              <option value="MI210">MI210</option>
            </optgroup>
          </select>
        </div>
        <div class="form-group col mb-1">
          <label><small style="${labelStyle}">GPU Count ≥</small></label>
          <input type="number" id="apNs_${id}_gpuCount" class="form-control form-control-sm"
                 placeholder="optional" min="1" style="${inputStyle}">
        </div>
        <div class="form-group col mb-1">
          <label><small style="${labelStyle}">VRAM GiB ≥</small></label>
          <input type="number" id="apNs_${id}_vram" class="form-control form-control-sm"
                 placeholder="optional" min="1" step="1" style="${inputStyle}">
        </div>
        <div class="form-group col mb-1">
          <label><small style="${labelStyle}">Root Disk GB</small></label>
          <input type="number" id="apNs_${id}_diskSize" class="form-control form-control-sm"
                 placeholder="default" min="0" style="${inputStyle}">
        </div>
      </div>

      <div style="${sectionHeaderStyle}">Image → imageRequirement</div>
      <div class="form-row">
        <div class="form-group col mb-0">
          <label><small style="${labelStyle}">OS Type</small></label>
          <select id="apNs_${id}_osType" class="form-control form-control-sm" style="${inputStyle}">
            <option value="ubuntu" selected>Ubuntu</option>
            <option value="centos">CentOS</option>
            <option value="rocky">Rocky Linux</option>
            <option value="debian">Debian</option>
            <option value="windows">Windows</option>
          </select>
        </div>
        <div class="form-group col mb-0">
          <label><small style="${labelStyle}">OS Version</small></label>
          <input type="text" id="apNs_${id}_osVersion" class="form-control form-control-sm"
                 placeholder="ex: 22.04" value="22.04" style="${inputStyle}">
        </div>
        <div class="form-group col mb-0">
          <label><small style="${labelStyle}">GPU Image</small></label>
          <select id="apNs_${id}_isGPUImage" class="form-control form-control-sm" style="${inputStyle}">
            <option value="auto" selected>auto (by GPU selection)</option>
            <option value="true">force GPU image</option>
            <option value="false">force non-GPU image</option>
          </select>
        </div>
        <div class="form-group col mb-0">
          <label><small style="${labelStyle}">Node Labels</small></label>
          <input type="text" id="apNs_${id}_label" class="form-control form-control-sm"
                 placeholder="ex: role=worker" style="${inputStyle}">
        </div>
      </div>

    </div>
  </div>`;
}

// ── Build InfraAutopilotReq from form ─
function buildAutopilotReq() {
  var req = {
    name: (document.getElementById('apInfraName').value || '').trim(),
    description: (document.getElementById('apDescription').value || '').trim() || undefined,
    nodeSpecs: [],
    policy: {
      maxAttemptsPerSpec: parseInt(document.getElementById('apMaxAttempts').value) || 10,
      timeoutMinutes: parseInt(document.getElementById('apTimeoutMin').value) || 60,
      parallelism: parseInt(document.getElementById('apParallelism').value) || 2,
      onPartialFailure: document.getElementById('apOnPartialFailure').value || 'refine',
    }
  };

  // Infra-level labels: "key=value, key2=value2" → map
  var infraLabels = parseLabelsString(document.getElementById('apInfraLabel').value || '');
  if (Object.keys(infraLabels).length > 0) req.label = infraLabels;

  // Post-deployment script: one command per line; run once after all NodeGroups complete
  var postScriptText = (document.getElementById('apPostScript').value || '').trim();
  if (postScriptText) {
    var commands = postScriptText.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
    if (commands.length > 0) {
      var phase = { command: commands };
      var cmdTimeout = parseInt(document.getElementById('apPostScriptTimeout').value);
      if (cmdTimeout > 0) phase.timeoutMinutes = Math.min(cmdTimeout, 120);
      req.postScript = { phases: [phase] };
    }
  }

  _apActiveNodeSpecIds.forEach(function(id) {
    var filterPolicy = [];

    _apGetSelectedProviders(id).forEach(function(p) {
      filterPolicy.push({ metric: 'providerName', condition: [{ operator: '==', operand: p }] });
    });
    var vcpu = document.getElementById('apNs_' + id + '_vcpu').value;
    if (vcpu) {
      filterPolicy.push({ metric: 'vCPU', condition: [{ operator: '>=', operand: vcpu }] });
    }
    var memory = document.getElementById('apNs_' + id + '_memory').value;
    if (memory) {
      filterPolicy.push({ metric: 'memoryGiB', condition: [{ operator: '>=', operand: memory }] });
    }
    var gpuModel = document.getElementById('apNs_' + id + '_gpuModel').value;
    if (gpuModel === 'any') {
      filterPolicy.push({ metric: 'acceleratorCount', condition: [{ operator: '>=', operand: '1' }] });
    } else if (gpuModel) {
      filterPolicy.push({ metric: 'acceleratorModel', condition: [{ operator: '==', operand: gpuModel }] });
    }
    var gpuCount = document.getElementById('apNs_' + id + '_gpuCount').value;
    if (gpuCount && gpuModel) {
      filterPolicy.push({ metric: 'acceleratorCount', condition: [{ operator: '>=', operand: gpuCount }] });
    }
    var vram = document.getElementById('apNs_' + id + '_vram').value;
    if (vram) {
      filterPolicy.push({ metric: 'acceleratorMemoryGB', condition: [{ operator: '>=', operand: vram }] });
    }
    var arch = document.getElementById('apNs_' + id + '_arch').value;
    if (arch) {
      filterPolicy.push({ metric: 'architecture', condition: [{ operator: '==', operand: arch }] });
    }

    var isGPUImageVal = document.getElementById('apNs_' + id + '_isGPUImage').value;
    var isGPUImage;
    if (isGPUImageVal === 'auto') {
      isGPUImage = gpuModel ? true : undefined;
    } else {
      isGPUImage = (isGPUImageVal === 'true');
    }

    var nodeSpec = {
      name: (document.getElementById('apNs_' + id + '_name').value || ('node-type-' + id)).trim(),
      desiredCount: parseInt(document.getElementById('apNs_' + id + '_desiredCount').value) || 1,
      specFilter: {
        filter: { policy: filterPolicy },
        priority: { policy: [{ metric: 'location', weight: 1.0 }] },
        limit: 0
      },
      imageRequirement: {
        osType: document.getElementById('apNs_' + id + '_osType').value,
        osVersion: (document.getElementById('apNs_' + id + '_osVersion').value || '').trim() || undefined,
      }
    };

    if (isGPUImage !== undefined) nodeSpec.imageRequirement.isGPUImage = isGPUImage;

    var minCount = document.getElementById('apNs_' + id + '_minCount').value;
    if (minCount) nodeSpec.minCount = parseInt(minCount);

    var maxPerLoc = document.getElementById('apNs_' + id + '_maxPerLocation').value;
    if (maxPerLoc) nodeSpec.maxPerLocation = parseInt(maxPerLoc);

    var strategy = document.getElementById('apNs_' + id + '_strategy').value;
    if (strategy) nodeSpec.placementPolicy = { strategy: strategy };

    var diskSize = document.getElementById('apNs_' + id + '_diskSize').value;
    if (diskSize) nodeSpec.rootDiskSize = parseInt(diskSize);

    var nsLabels = parseLabelsString(document.getElementById('apNs_' + id + '_label').value || '');
    if (Object.keys(nsLabels).length > 0) nodeSpec.label = nsLabels;

    req.nodeSpecs.push(nodeSpec);
  });

  return req;
}

// ── Review step ───
function submitAutopilotReview() {
  const namespace = window.configNamespace || '';
  if (!namespace) {
    Swal.fire({ icon: 'error', title: 'No namespace', text: 'Please select a namespace in settings.' });
    return;
  }

  var req = buildAutopilotReq();
  if (!req.name) {
    Swal.fire({ icon: 'warning', title: 'Infra name required', text: 'Please enter an infra name.' });
    return;
  }
  if (req.nodeSpecs.length === 0) {
    Swal.fire({ icon: 'warning', title: 'No node types defined', text: 'Please add at least one node type.' });
    return;
  }

  _apCurrentReq = req;

  // Show loading state in review panel
  _apShowReviewPanel('<div class="text-center py-4"><div class="spinner-border" style="color:#f0a500"></div>' +
    '<p class="mt-2" style="color:#7d8590">Reviewing candidates for <strong style="color:#e6edf3">' +
    req.name + '</strong>...</p></div>');
  document.getElementById('apProvisionNowBtn').disabled = true;

  var url = tbApiBase() + '/ns/' + namespace + '/infraAutopilotReview';
  var requestId = generateRandomRequestId('ap-review-', 10);

  axios({
    method: 'post',
    url: url,
    headers: { 'Content-Type': 'application/json', 'x-request-id': requestId },
    data: JSON.stringify(req),
    auth: { username: window.configUsername || 'default', password: window.configPassword || 'default' }
  })
  .then(function(res) {
    renderAutopilotReview(res.data, req);
  })
  .catch(function(err) {
    var msg = err.response ? JSON.stringify(err.response.data, null, 2) : err.message;
    _apShowReviewPanel('<div class="alert alert-danger m-2"><strong>Review failed</strong><pre style="font-size:11px;margin-top:6px">' + msg + '</pre></div>');
    document.getElementById('apReviewFooter').style.display = '';
  });
}

function renderAutopilotReview(reviewResult, req) {
  var summary = reviewResult.summary || {};
  var reviews = reviewResult.reviews || [];

  var fText = (summary.feasibility || '').toLowerCase();
  var feasBadge = fText === 'feasible'
    ? '<span class="badge badge-success" style="font-size:12px">FEASIBLE</span>'
    : fText === 'partial'
    ? '<span class="badge badge-warning" style="font-size:12px">PARTIAL</span>'
    : '<span class="badge badge-danger" style="font-size:12px">INFEASIBLE</span>';

  var html = '<div class="d-flex justify-content-between align-items-center mb-3">' +
    '<div><strong style="font-size:14px">' + (reviewResult.name || req.name) + '</strong>' +
    '<small style="color:#7d8590;margin-left:8px">' + (summary.desiredTotal || 0) + ' nodes total · ' +
    (summary.validCandidates || 0) + ' valid candidates</small></div>' +
    feasBadge + '</div>';

  // Show labels / the post script from the request so users can confirm before provisioning.
  var reqMeta = [];
  if (req.label && Object.keys(req.label).length > 0) {
    reqMeta.push('🏷 ' + window.escapeHtml(labelsToString(req.label)));
  }
  var apPhase = (req.postScript && req.postScript.phases && req.postScript.phases[0]) || null;
  if (apPhase && apPhase.command && apPhase.command.length > 0) {
    reqMeta.push('⚡ ' + apPhase.command.length + ' post-script command(s) after all nodes ready' +
      (apPhase.timeoutMinutes ? ', timeout ' + apPhase.timeoutMinutes + 'min' : ''));
  }
  if (reqMeta.length > 0) {
    html += '<div class="mb-2" style="font-size:11px;color:#7d8590;font-family:monospace">' +
      reqMeta.join(' &nbsp;·&nbsp; ') + '</div>';
  }

  reviews.forEach(function(ns) {
    var nsFeas = (ns.feasibility || '').toLowerCase();
    var nsBadge = nsFeas === 'feasible'
      ? '<span class="badge badge-success" style="font-size:11px">FEASIBLE</span>'
      : nsFeas === 'partial'
      ? '<span class="badge badge-warning" style="font-size:11px">PARTIAL</span>'
      : '<span class="badge badge-danger" style="font-size:11px">INFEASIBLE</span>';

    html += '<div class="card mb-2" style="background:#0d1117;border:1px solid #30363d;border-left:3px solid #f0a500">' +
      '<div class="card-header p-2" style="background:#0a0e14;border-color:#21262d;display:flex;justify-content:space-between;align-items:center">' +
      '<span style="color:#f0a500;font-family:monospace;font-size:12px;font-weight:700">⬡ ' + ns.nodeSpecName + '</span>' +
      '<div>' + nsBadge + ' <small style="color:#7d8590;margin-left:6px">' + ns.desiredCount + ' nodes · ' +
      ns.validCandidates + ' valid · ' + (ns.expectedNodeGroups || 0) + ' NodeGroups expected</small></div></div>' +
      '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px;font-family:monospace">' +
      '<thead><tr style="background:#0a0e14;color:#7d8590;font-size:10px;text-transform:uppercase;letter-spacing:.5px">' +
      '<th style="padding:5px 8px">Valid</th><th style="padding:5px 8px">Spec</th>' +
      '<th style="padding:5px 8px">Location</th><th style="padding:5px 8px">Zone</th>' +
      '<th style="padding:5px 8px">GPU</th><th style="padding:5px 8px">VRAM</th>' +
      '<th style="padding:5px 8px">Risk</th><th style="padding:5px 8px">$/hr</th>' +
      '<th style="padding:5px 8px">Note</th></tr></thead><tbody>';

    (ns.candidates || []).forEach(function(c) {
      var validIcon = c.isValid
        ? '<span style="color:#3fb950">✓</span>'
        : '<span style="color:#7d8590">—</span>';
      var riskColor = c.riskLevel === 'Low' ? '#3fb950' : c.riskLevel === 'High' ? '#f85149' : '#f0a500';
      var note = (!c.isValid && c.invalidReasons) ? c.invalidReasons.join('; ') : '';
      var rowBg = !c.isValid ? 'background:rgba(248,81,73,.04)' : '';
      var gpuCell = c.acceleratorModel
        ? '<span style="color:#c9d1d9">' + c.acceleratorModel + '</span>' +
          (c.acceleratorCount > 1 ? '<span style="color:#7d8590"> ×' + c.acceleratorCount + '</span>' : '')
        : (c.acceleratorType ? '<span style="color:#7d8590">' + c.acceleratorType + '</span>' : '—');
      var vramCell = c.acceleratorMemoryGB
        ? '<span style="color:#c9d1d9">' + c.acceleratorMemoryGB + ' GiB</span>'
        : '—';
      html += '<tr style="border-bottom:1px solid rgba(48,54,61,.5);' + rowBg + '">' +
        '<td style="padding:5px 8px">' + validIcon + '</td>' +
        '<td style="padding:5px 8px;color:#e6edf3">' + (c.specId || c.cspSpecName || '') + '</td>' +
        '<td style="padding:5px 8px;color:#7d8590">' + (c.providerName || '') + '/' + (c.regionName || '') + '</td>' +
        '<td style="padding:5px 8px;color:#7d8590">' + (c.suggestedZone || '—') + '</td>' +
        '<td style="padding:5px 8px;white-space:nowrap">' + gpuCell + '</td>' +
        '<td style="padding:5px 8px;white-space:nowrap">' + vramCell + '</td>' +
        '<td style="padding:5px 8px;color:' + riskColor + '">' + (c.riskLevel || '—') + '</td>' +
        '<td style="padding:5px 8px;color:#7d8590">$' + ((c.costPerHour || 0).toFixed(3)) + '</td>' +
        '<td style="padding:5px 8px;color:#7d8590;max-width:180px;overflow:hidden;text-overflow:ellipsis">' + note + '</td>' +
        '</tr>';
    });

    var costLine = ns.validCandidates > 0
      ? 'Cost: <strong style="color:#e6edf3">$' + (ns.costPerHourMin || 0).toFixed(2) +
        ' – $' + (ns.costPerHourMax || 0).toFixed(2) + '</strong>/hr per node'
      : '<span style="color:#f85149">No valid candidates</span>';

    html += '</tbody></table></div>' +
      '<div style="padding:4px 8px 6px"><small style="color:#7d8590">' + costLine + '</small></div></div>';
  });

  if (summary.costPerHourMin != null && summary.desiredTotal > 0) {
    var totalMin = ((summary.costPerHourMin || 0) * summary.desiredTotal).toFixed(2);
    var totalMax = ((summary.costPerHourMax || 0) * summary.desiredTotal).toFixed(2);
    html += '<div style="text-align:right;font-size:12px;color:#7d8590;margin-top:4px">' +
      'Total est.: <strong style="color:#e6edf3">$' + totalMin + ' – $' + totalMax + '</strong>/hr</div>';
  }

  if (summary.unreachableSpecs && summary.unreachableSpecs.length > 0) {
    html += '<div class="alert mt-2 p-2" style="background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.3);font-size:12px;color:#f85149">' +
      '⚠ Unreachable specs: ' + summary.unreachableSpecs.join(', ') + '</div>';
  }

  _apShowReviewPanel(html);

  var canProvision = fText !== 'infeasible';
  var provBtn = document.getElementById('apProvisionNowBtn');
  if (provBtn) {
    provBtn.disabled = !canProvision;
    provBtn.style.opacity = canProvision ? '1' : '0.5';
  }
}

function backToAutopilotForm() {
  _apShowFormPanel();
}

function _apShowFormPanel() {
  var formEl = document.getElementById('apFormContent');
  var reviewEl = document.getElementById('apReviewContent');
  var formFooter = document.getElementById('apFormFooter');
  var reviewFooter = document.getElementById('apReviewFooter');
  if (formEl) formEl.style.display = '';
  if (reviewEl) { reviewEl.style.display = 'none'; reviewEl.innerHTML = ''; }
  if (formFooter) formFooter.style.display = '';
  if (reviewFooter) reviewFooter.style.cssText = 'display:none!important';
}

function _apShowReviewPanel(html) {
  var formEl = document.getElementById('apFormContent');
  var reviewEl = document.getElementById('apReviewContent');
  var formFooter = document.getElementById('apFormFooter');
  var reviewFooter = document.getElementById('apReviewFooter');
  if (formEl) formEl.style.display = 'none';
  if (reviewEl) { reviewEl.innerHTML = html; reviewEl.style.display = ''; }
  if (formFooter) formFooter.style.display = 'none';
  if (reviewFooter) { reviewFooter.style.cssText = 'display:flex!important;width:100%;justify-content:space-between;align-items:center'; }
}

// ── Provision step ─
function proceedWithAutopilotProvision() {
  var req = _apCurrentReq;
  if (!req) return;

  // Blur focused element before hiding modal to avoid aria-hidden warning
  if (document.activeElement) document.activeElement.blur();
  $('#autopilotModal').modal('hide');

  // Init and show progress panel after form modal hides
  setTimeout(function() {
    _apRenderProgressInit(req);
    _apShowProgressPanel('Autopilot: ' + req.name);
  }, 350);

  var url = tbApiBase() + '/ns/' + (window.configNamespace || '') + '/infraAutopilot';
  var requestId = generateRandomRequestId('autopilot-', 10);
  var spinnerId = addSpinnerTask('Autopilot: ' + req.name);
  _apPollingStop = false;

  // Start status polling every 5 seconds
  _apPollingTimer = setInterval(function() {
    if (_apPollingStop) { clearInterval(_apPollingTimer); return; }
    _apPollStatus(req.name);
  }, 5000);

  // Fire the long-running provision POST
  axios({
    method: 'post',
    url: url,
    headers: { 'Content-Type': 'application/json', 'x-request-id': requestId },
    data: JSON.stringify(req),
    auth: { username: window.configUsername || 'default', password: window.configPassword || 'default' },
    timeout: ((req.policy.timeoutMinutes || 60) * 60 + 60) * 1000
  })
  .then(function(res) {
    _apStopPolling();
    removeSpinnerTask(spinnerId);
    _apHideProgressPanel();
    updateInfraList();
    setTimeout(function() { showAutopilotResult(res.data, req); }, 400);
  })
  .catch(function(err) {
    _apStopPolling();
    removeSpinnerTask(spinnerId);
    _apHideProgressPanel();
    var msg = err.response ? JSON.stringify(err.response.data, null, 2) : err.message;
    errorAlert('Autopilot failed: ' + msg);
  });
}

function _apPollStatus(infraId) {
  var url = tbApiBase() + '/ns/' + (window.configNamespace || '') +
            '/infraAutopilot/' + infraId + '/status';
  axios({
    method: 'get', url: url,
    auth: { username: window.configUsername || 'default', password: window.configPassword || 'default' }
  })
  .then(function(res) {
    if (!_apPollingStop) _apRenderProgressUpdate(res.data);
  })
  .catch(function() {
    // Infra may not be in DB yet during early phase — silently ignore
  });
}

function _apStopPolling() {
  _apPollingStop = true;
  if (_apPollingTimer) { clearInterval(_apPollingTimer); _apPollingTimer = null; }
  if (_apElapsedTimer) { clearInterval(_apElapsedTimer); _apElapsedTimer = null; }
}

// ── Progress display ──
function _apRenderProgressInit(req) {
  var specsHtml = (req.nodeSpecs || []).map(function(ns) {
    return '<div class="mb-2" id="apNsProgressRow_' + ns.name + '">' +
      '<div class="d-flex justify-content-between mb-1">' +
      '<span style="font-family:monospace;font-size:12px;color:#f0a500">⬡ ' + ns.name + '</span>' +
      '<small id="apNsProgressCount_' + ns.name + '" style="color:#7d8590">0 / ' + ns.desiredCount + '</small></div>' +
      '<div class="progress" style="height:6px;background:#0d1117">' +
      '<div class="progress-bar" id="apNsProgressBar_' + ns.name + '" style="width:0%;background:#f0a500" role="progressbar"></div>' +
      '</div><small id="apNsProgressStatus_' + ns.name + '" style="color:#7d8590;font-size:11px"></small></div>';
  }).join('');

  var body = document.getElementById('autopilotProgressBody');
  if (!body) return;
  body.innerHTML =
    '<div class="d-flex justify-content-between mb-3">' +
    '<small style="color:#7d8590">Elapsed: <span id="apElapsedDisplay" style="color:#e6edf3;font-family:monospace">0s</span></small>' +
    '<small id="apActiveAttemptInfo" style="color:#7d8590;font-size:11px;font-family:monospace">Initializing...</small></div>' +
    '<div id="apSpecProgressList" class="mb-3">' + specsHtml + '</div>' +
    '<hr style="border-color:#30363d;margin:8px 0">' +
    '<div style="font-size:10px;color:#7d8590;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Attempt Log</div>' +
    '<div id="apAttemptLog" style="max-height:220px;overflow-y:auto;font-size:11px;font-family:monospace;background:#0d1117;border:1px solid #21262d;border-radius:3px;padding:8px">' +
    '<span style="color:#7d8590">Waiting for first attempt...</span></div>';

  // Elapsed timer (local clock, falls back when status arrives)
  var startTime = Date.now();
  _apElapsedTimer = setInterval(function() {
    var el = document.getElementById('apElapsedDisplay');
    if (el) el.textContent = Math.floor((Date.now() - startTime) / 1000) + 's';
  }, 1000);
}

function _apRenderProgressUpdate(status) {
  // Elapsed (server value overrides local clock)
  var elEl = document.getElementById('apElapsedDisplay');
  if (elEl && status.elapsedSeconds !== undefined) elEl.textContent = status.elapsedSeconds + 's';

  var specs = status.specs || [];
  var totalRunning = 0, totalDesired = 0, anyActiveAttempt = false;

  // Update panel header badge with aggregate progress (visible even when minimized)
  var badgeEl = document.getElementById('apProgressPanelBadge');
  if (badgeEl) {
    var bTotal = (specs || []).reduce(function(a, s) { return a + (s.desiredCount || 0); }, 0);
    var bRunning = (specs || []).reduce(function(a, s) { return a + (s.provisionedCount || 0); }, 0);
    if (bTotal > 0) {
      badgeEl.textContent = bRunning + '/' + bTotal + ' nodes';
      badgeEl.style.color = bRunning >= bTotal ? '#3fb950' : '#f0a500';
    }
  }

  // Per-spec progress
  specs.forEach(function(spec) {
    totalRunning += spec.provisionedCount || 0;
    totalDesired += spec.desiredCount || 0;

    var pct = spec.desiredCount > 0 ? Math.round((spec.provisionedCount / spec.desiredCount) * 100) : 0;
    var pBar = document.getElementById('apNsProgressBar_' + spec.nodeSpecName);
    var pCount = document.getElementById('apNsProgressCount_' + spec.nodeSpecName);
    var pStat = document.getElementById('apNsProgressStatus_' + spec.nodeSpecName);
    if (pBar) { pBar.style.width = pct + '%'; pBar.style.background = pct >= 100 ? '#3fb950' : '#f0a500'; }
    if (pCount) pCount.textContent = (spec.provisionedCount || 0) + ' / ' + (spec.desiredCount || '?');
    if (pStat) {
      var statusColor = spec.status === 'fulfilled' ? '#3fb950' : spec.status === 'failed' ? '#f85149' : '#f0a500';
      pStat.textContent = spec.status || 'provisioning';
      pStat.style.color = statusColor;
    }

    // Active attempt info (server provides this when tracking is deeper)
    if (spec.activeAttempt) {
      anyActiveAttempt = true;
      var aa = spec.activeAttempt;
      var aaEl = document.getElementById('apActiveAttemptInfo');
      if (aaEl) {
        aaEl.textContent = spec.nodeSpecName + ': ' + (aa.specId || '') +
          (aa.zone ? ' @' + aa.zone : '') + ' (' + (aa.elapsedSeconds || 0) + 's)';
      }
    }

    // Attempt log rows
    if (spec.attempts && spec.attempts.length > 0) {
      var logEl = document.getElementById('apAttemptLog');
      if (logEl) {
        var logHtml = spec.attempts.map(function(a) {
          var icon = a.status === 'succeeded'
            ? '<span style="color:#3fb950">✓</span>'
            : (a.status === 'csp-failed' || a.status === 'failed')
            ? '<span style="color:#f85149">✕</span>'
            : a.status === 'review-rejected'
            ? '<span style="color:#7d8590">—</span>'
            : '<span style="color:#f0a500">⟳</span>';
          var cnt = a.succeededCount > 0 ? a.succeededCount + ' nodes'
            : (a.status === 'csp-failed' ? '0' : '...');
          var costStr = a.costPerHour > 0 ? ' $' + a.costPerHour.toFixed(3) + '/hr' : '';
          var gpuStr = a.acceleratorModel
            ? ' &nbsp;<span style="color:#f0a500">' + a.acceleratorModel +
              ' ×' + (a.acceleratorCount || 1) +
              (a.acceleratorMemoryGb ? ' (' + a.acceleratorMemoryGb + 'GB)' : '') +
              '</span>'
            : '';
          return '<div style="padding:2px 0;border-bottom:1px solid #21262d">' +
            icon + '&nbsp;' +
            '<span style="color:#e6edf3">' + (a.specId || '') + '</span>&nbsp;&nbsp;' +
            '<span style="color:#7d8590">' + (a.connectionName || '') + '</span>&nbsp;&nbsp;' +
            '<span style="color:#7d8590">' + (a.zone || '') + '</span>&nbsp;&nbsp;' +
            '<span style="color:#7d8590">' + cnt + costStr + '</span>' +
            gpuStr + '</div>';
        }).join('');
        logEl.innerHTML = logHtml;
        logEl.scrollTop = logEl.scrollHeight;
      }
    }
  });

  // Update top status line with aggregate progress when no active-attempt detail is available
  if (specs.length > 0 && !anyActiveAttempt) {
    var aaEl = document.getElementById('apActiveAttemptInfo');
    if (aaEl) {
      if (totalRunning > 0) {
        aaEl.textContent = totalRunning + ' / ' + totalDesired + ' nodes running';
        aaEl.style.color = totalRunning >= totalDesired ? '#3fb950' : '#f0a500';
      } else {
        aaEl.textContent = 'Searching for suitable specs...';
        aaEl.style.color = '#7d8590';
      }
    }
  }
}

// ── Final result ───
function showAutopilotResult(result, req) {
  _apStopPolling();

  var stats = result.autopilotStats || {};
  var nsResults = result.nodeSpecResults || [];
  var attempts = result.provisioningAttempts || [];

  var allFulfilled = nsResults.length > 0 && nsResults.every(function(ns) { return ns.fulfilled; });
  var anyProvisioned = nsResults.some(function(ns) { return ns.provisionedCount > 0; });
  var statusBadge = allFulfilled
    ? '<span class="badge badge-success" style="font-size:13px">✓ Complete</span>'
    : anyProvisioned
    ? '<span class="badge badge-warning" style="font-size:13px">~ Partial</span>'
    : '<span class="badge badge-danger" style="font-size:13px">✕ Failed</span>';

  var nsHtml = nsResults.map(function(ns) {
    var icon = ns.fulfilled ? '<span style="color:#3fb950">✓</span>'
      : ns.provisionedCount > 0 ? '<span style="color:#f0a500">~</span>'
      : '<span style="color:#f85149">✕</span>';
    return '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
      '<span>' + icon + ' <span style="color:#f0a500;font-family:monospace">' + ns.nodeSpecName + '</span></span>' +
      '<span><strong style="color:#e6edf3">' + ns.provisionedCount + '/' + ns.desiredCount + '</strong> nodes' +
      (ns.locationsUsed && ns.locationsUsed.length ? ' &nbsp;<small style="color:#7d8590">' + ns.locationsUsed.join(', ') + '</small>' : '') +
      '</span></div>';
  }).join('');

  var hasGpuAttempt = attempts.some(function(a) { return a.acceleratorModel; });
  var attemptRows = attempts.map(function(a) {
    var icon = a.status === 'succeeded'
      ? '<span style="color:#3fb950">✓</span>'
      : (a.status === 'csp-failed' || a.status === 'failed')
      ? '<span style="color:#f85149">✕</span>'
      : '<span style="color:#7d8590">—</span>';
    var gpuCell = '';
    if (hasGpuAttempt) {
      gpuCell = a.acceleratorModel
        ? '<td style="font-size:11px;color:#f0a500;white-space:nowrap">' +
            a.acceleratorModel + ' ×' + (a.acceleratorCount || 1) +
            (a.acceleratorMemoryGb ? ' (' + a.acceleratorMemoryGb + 'GB)' : '') +
          '</td>'
        : '<td style="font-size:11px;color:#7d8590">—</td>';
    }
    return '<tr style="border-bottom:1px solid rgba(48,54,61,.4)">' +
      '<td>' + icon + '</td>' +
      '<td style="font-family:monospace;font-size:11px;color:#e6edf3">' + (a.specId || '') + '</td>' +
      '<td style="font-size:11px;color:#7d8590">' + (a.connectionName || '') + '</td>' +
      '<td style="font-size:11px;color:#7d8590">' + (a.zone || '') + '</td>' +
      '<td style="font-size:11px">' + (a.succeededCount || 0) + '/' + a.requestedCount + '</td>' +
      '<td style="font-size:11px;color:#7d8590">' + (a.costPerHour > 0 ? '$' + a.costPerHour.toFixed(3) : '') + '</td>' +
      gpuCell +
      '</tr>';
  }).join('');

  Swal.fire({
    title: '',
    html: '<div style="text-align:left">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
      '<div><span style="font-size:15px;font-weight:700;color:#e6edf3">🤖 ' + (result.name || (req && req.name) || '') + '</span></div>' +
      statusBadge + '</div>' +
      '<div style="background:#0d1117;border-radius:4px;padding:10px;margin-bottom:10px">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:10px">' +
      _apStatCell('NodeGroups', stats.nodeGroupCount || 0) +
      _apStatCell('Locations', (stats.locationsUsed || []).length) +
      _apStatCell('Elapsed', (stats.elapsedSeconds || 0) + 's') +
      _apStatCell('Attempts', (stats.totalAttempts || 0) + ' (' + (stats.succeeded || 0) + '✓/' + (stats.failed || 0) + '✕)') +
      '</div>' + nsHtml + '</div>' +
      '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">' +
      '<thead><tr style="color:#7d8590;font-size:10px;text-transform:uppercase;letter-spacing:.5px">' +
      '<th style="padding:4px 6px"></th><th style="padding:4px 6px">Spec</th>' +
      '<th style="padding:4px 6px">Connection</th><th style="padding:4px 6px">Zone</th>' +
      '<th style="padding:4px 6px">Nodes</th><th style="padding:4px 6px">$/hr</th>' +
      (hasGpuAttempt ? '<th style="padding:4px 6px">GPU</th>' : '') +
      '</tr></thead>' +
      '<tbody>' + attemptRows + '</tbody></table></div>' +
      (stats.wastedCostPerHour > 0 ? '<div style="margin-top:6px;font-size:11px;color:#7d8590">Wasted: $' +
        stats.wastedCostPerHour.toFixed(3) + '/hr from failed nodes (refine cleaned up)</div>' : '') +
      _apPostScriptSummaryHtml(result) +
      '</div>',
    showCloseButton: true,
    confirmButtonText: '🗺 View on Map',
    showCancelButton: true,
    cancelButtonText: 'Close',
    width: '720px',
    background: '#1c2128',
    color: '#e6edf3',
    confirmButtonColor: '#58a6ff',
    cancelButtonColor: '#30363d',
  }).then(function(r) {
    if (r.isConfirmed) updateInfraList();
  });
}

function _apStatCell(label, value) {
  return '<div style="background:#1c2128;border-radius:3px;padding:8px;text-align:center">' +
    '<div style="font-size:10px;color:#7d8590;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">' + label + '</div>' +
    '<div style="font-size:15px;font-weight:700;color:#e6edf3;font-family:monospace">' + value + '</div></div>';
}

// Renders a compact per-node summary of post-deployment script results
// (flattened from result.postScriptResults phases of the embedded InfraInfo).
function _apPostScriptSummaryHtml(result) {
  var pcResults = (result.postScriptResults || []).reduce(function(acc, ph) {
    return acc.concat((ph.results && ph.results.results) || []);
  }, []);
  if (pcResults.length === 0) return '';
  var okCount = pcResults.filter(function(r) { return !r.error; }).length;
  var rows = pcResults.map(function(r) {
    var icon = r.error ? '<span style="color:#f85149">✕</span>' : '<span style="color:#3fb950">✓</span>';
    var detail = window.escapeHtml(r.error ? String(r.error) : (r.nodeIp || ''));
    return '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">' +
      '<span>' + icon + ' <span style="font-family:monospace;color:#e6edf3">' + window.escapeHtml(r.nodeId || '') + '</span></span>' +
      '<span style="color:#7d8590;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + detail + '</span></div>';
  }).join('');
  return '<div style="margin-top:10px;background:#0d1117;border-radius:4px;padding:8px">' +
    '<div style="font-size:11px;color:#f0a500;margin-bottom:6px">⚡ Post-Deployment Script ' +
    '<span style="color:#7d8590">(' + okCount + '/' + pcResults.length + ' nodes ok)</span></div>' +
    rows + '</div>';
}

// ── Provider multi-select helpers ──
// Returns unique provider names from loaded connection configs (same source as
// the global "☁️ Provider" dropdown in MC-Infra Recommendation).
function _apGetAvailableProviders() {
  var conn = (window.cloudBaristaCentralData && window.cloudBaristaCentralData.connection) || [];
  var seen = {};
  conn.forEach(function(c) { if (c.providerName) seen[c.providerName] = true; });
  return Object.keys(seen).sort();
}

// Returns checked provider values for a given NodeSpec card.
// Uses DOM query on #apNs_<id>_providerCsps so the list stays in sync with
// whatever providers were rendered (no separate JS array needed).
function _apGetSelectedProviders(id) {
  var allCb = document.getElementById('apNs_' + id + '_providerAll');
  if (allCb && allCb.checked) return [];
  var container = document.getElementById('apNs_' + id + '_providerCsps');
  if (!container) return [];
  return Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
    .map(function(cb) { return cb.value; });
}

function _apUpdateProviderText(id) {
  var textEl = document.getElementById('apNs_' + id + '_providerText');
  if (!textEl) return;
  var selected = _apGetSelectedProviders(id);
  if (selected.length === 0) {
    textEl.textContent = 'ALL';
  } else if (selected.length <= 2) {
    textEl.textContent = selected.map(function(p) { return p.toUpperCase(); }).join(', ');
  } else {
    textEl.textContent = selected.slice(0, 2).map(function(p) { return p.toUpperCase(); }).join(', ') + ' +' + (selected.length - 2);
  }
}

function _apProviderAllToggle(id) {
  var allCb = document.getElementById('apNs_' + id + '_providerAll');
  var container = document.getElementById('apNs_' + id + '_providerCsps');
  if (allCb && allCb.checked && container) {
    container.querySelectorAll('input[type="checkbox"]').forEach(function(cb) { cb.checked = false; });
  }
  _apUpdateProviderText(id);
}

function _apProviderCheckboxChange(id) {
  var container = document.getElementById('apNs_' + id + '_providerCsps');
  var anyChecked = container && container.querySelector('input[type="checkbox"]:checked') !== null;
  var allCb = document.getElementById('apNs_' + id + '_providerAll');
  if (allCb) allCb.checked = !anyChecked;
  _apUpdateProviderText(id);
}

// ── Progress panel helpers ─
var _apProgressPanelExpanded = true;

function _apShowProgressPanel(title) {
  var panel = document.getElementById('apProgressPanel');
  var titleEl = document.getElementById('autopilotProgressTitle');
  if (panel) panel.style.display = 'block';
  if (titleEl) titleEl.textContent = '⚙️ ' + title;
  _apProgressPanelExpanded = true;
  _apSyncPanelState();
}

function _apHideProgressPanel() {
  var panel = document.getElementById('apProgressPanel');
  if (panel) panel.style.display = 'none';
}

function toggleApProgressPanel() {
  _apProgressPanelExpanded = !_apProgressPanelExpanded;
  _apSyncPanelState();
}

function _apSyncPanelState() {
  var body = document.getElementById('autopilotProgressBody');
  var icon = document.getElementById('apProgressPanelToggle');
  if (body) body.style.display = _apProgressPanelExpanded ? '' : 'none';
  if (icon) icon.textContent = _apProgressPanelExpanded ? '▼' : '▲';
}

// ── Window exports ─
window.showAutopilotDialog = showAutopilotDialog;
window.addAutopilotNodeSpec = addAutopilotNodeSpec;
window.removeAutopilotNodeSpec = removeAutopilotNodeSpec;
window.submitAutopilotReview = submitAutopilotReview;
window.backToAutopilotForm = backToAutopilotForm;
window.proceedWithAutopilotProvision = proceedWithAutopilotProvision;
window.showAutopilotResult = showAutopilotResult;
window.toggleApProgressPanel = toggleApProgressPanel;
window._apProviderAllToggle = _apProviderAllToggle;
window._apProviderCheckboxChange = _apProviderCheckboxChange;
