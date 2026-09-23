/**
 * Rich GUI Display Cards & Activity Feed View Module
 * @module views/infra-card
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import JSONFormatter from 'json-formatter-js';
import { Point } from 'ol/geom';
import { tbApiBase, getConfig } from '../core/api.js';
import { escapeHtml } from '../core/utils.js';

const esc = escapeHtml;
const addSpinnerTask = (name) => (window.addSpinnerTask ? window.addSpinnerTask(name) : name);
const removeSpinnerTask = (id) => { if (window.removeSpinnerTask) window.removeSpinnerTask(id); };
const errorAlert = (msg) => (window.errorAlert ? window.errorAlert(msg) : Swal.fire({ icon: 'error', title: msg, showConfirmButton: true }));
const successAlert = (msg) => (window.successAlert ? window.successAlert(msg) : Swal.fire({ icon: 'success', title: msg, showConfirmButton: false, timer: 2500 }));

const cspGenericColors = new Proxy({}, {
  get: (target, prop) => (window.cspGenericColors || {})[prop],
  set: (target, prop, val) => {
    if (!window.cspGenericColors) window.cspGenericColors = {};
    window.cspGenericColors[prop] = val;
    return true;
  },
  ownKeys: () => Object.keys(window.cspGenericColors || {}),
  getOwnPropertyDescriptor: (target, prop) => Object.getOwnPropertyDescriptor(window.cspGenericColors || {}, prop)
});

const spinnerStack = new Proxy({}, {
  get: (target, prop) => (window.spinnerStack || {})[prop]
});

const map = {
  getView: () => window.map?.getView(),
  getSize: () => window.map?.getSize(),
  render: () => window.map?.render()
};

const LOCATIONLESS_Infra_LEFT_OFFSET = 0.12;
const LOCATIONLESS_Infra_TOP_OFFSET = 0.03;
const LOCATIONLESS_Infra_VERTICAL_SPACING = 0.05;

function outputAlert(jsonData, type) {
  // Estimate JSON data size
  const jsonString = JSON.stringify(jsonData, null, 2);
  const isLargeData = jsonString.length > 50000; // 50KB threshold
  
  // Check if it's Infra data with many Nodes
  const hasLargeNodeList = jsonData?.nodeGroups?.some(nodeGroup => 
    nodeGroup?.nodes && Array.isArray(nodeGroup.nodes) && nodeGroup.nodes.length > 20
  ) || (Array.isArray(jsonData?.node) && jsonData.node.length > 20);
  
  // Store jsonData for copy/base64 functions
  window._currentJsonOutput = jsonData;
  window._currentJsonString = jsonString;
  
  const jsonOutputConfig = {
    theme: "dark",
    hoverPreviewEnabled: !isLargeData, // Disable hover preview for large data
    hoverPreviewArrayCount: isLargeData ? 10 : 100,
    hoverPreviewFieldCount: isLargeData ? 3 : 5,
    animateOpen: !isLargeData, // Disable animation for large data
    animateClose: !isLargeData,
    useToJSON: true,
    quotesOnKeys: false,
    quotesOnValues: false,
    open: isLargeData || hasLargeNodeList ? 1 : 2  // More conservative opening for large data
  };
  
  // Toolbar HTML with Copy, Base64 toggle, and Save buttons
  const toolbarHtml = `
    <div id="json-output-toolbar" style="display: flex; gap: 6px; margin-bottom: 8px; justify-content: flex-end; flex-wrap: wrap;">
      <button type="button" id="copyJsonBtn" onclick="copyJsonToClipboard()" 
        style="padding: 4px 10px; font-size: 11px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;"
        title="Copy JSON to clipboard">
        📋 Copy
      </button>
      <button type="button" id="base64ToggleBtn" onclick="toggleBase64Panel()" 
        style="padding: 4px 10px; font-size: 11px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;"
        title="Toggle Base64 Decoder panel">
        🔓 Base64
      </button>
      <button type="button" id="downloadJsonBtn" onclick="downloadJsonFile()" 
        style="padding: 4px 10px; font-size: 11px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;"
        title="Download as JSON file">
        💾 Save
      </button>
    </div>
  `;
  
  // Integrated Base64 Panel (collapsed by default)
  const base64PanelHtml = `
    <div id="base64Panel" style="display: none; background: #1a1a2e; border: 1px solid #444; border-radius: 6px; padding: 10px; margin-bottom: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="color: #fff; font-weight: bold; font-size: 12px;">🔓 Base64 Decoder</span>
        <div style="display: flex; gap: 4px;">
          <button type="button" onclick="autoFindBase64InJson()" 
            style="padding: 3px 8px; font-size: 10px; background: #ffc107; color: #000; border: none; border-radius: 3px; cursor: pointer;"
            title="Find Base64 strings in JSON">
            🔍 Auto-find
          </button>
          <button type="button" onclick="toggleBase64Panel()" 
            style="padding: 3px 8px; font-size: 10px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer;">
            ✕
          </button>
        </div>
      </div>
      <div id="base64FoundChips" style="display: none; margin-bottom: 8px; max-height: 60px; overflow-y: auto;"></div>
      <div style="display: flex; gap: 8px; margin-bottom: 6px;">
        <textarea id="base64Input" rows="2" placeholder="Paste Base64 text here..." 
          style="flex: 1; font-family: monospace; font-size: 11px; padding: 6px; border: 1px solid #555; border-radius: 4px; background: #2d2d44; color: #fff; resize: vertical;"></textarea>
      </div>
      <div style="display: flex; gap: 4px; margin-bottom: 6px;">
        <button type="button" onclick="decodeBase64Inline()" 
          style="padding: 4px 10px; font-size: 10px; background: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer;">
          🔓 Decode
        </button>
        <button type="button" onclick="encodeBase64Inline()" 
          style="padding: 4px 10px; font-size: 10px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer;">
          🔒 Encode
        </button>
        <button type="button" onclick="clearBase64Inline()" 
          style="padding: 4px 10px; font-size: 10px; background: #495057; color: white; border: none; border-radius: 3px; cursor: pointer;">
          🗑️ Clear
        </button>
        <button type="button" onclick="copyBase64Result()" 
          style="padding: 4px 10px; font-size: 10px; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer; margin-left: auto;">
          📋 Copy
        </button>
        <button type="button" onclick="saveBase64Result()" 
          style="padding: 4px 10px; font-size: 10px; background: #17a2b8; color: white; border: none; border-radius: 3px; cursor: pointer;">
          💾 Save
        </button>
      </div>
      <textarea id="base64Output" rows="3" readonly placeholder="Decoded/Encoded result..." 
        style="width: 100%; font-family: monospace; font-size: 11px; padding: 6px; border: 1px solid #555; border-radius: 4px; background: #1e1e30; color: #90EE90; resize: vertical;"></textarea>
    </div>
  `;
  
  Swal.fire({
    position: "top-end",
    icon: type,
    html: toolbarHtml + base64PanelHtml + '<div id="json-output" class="form-control" style="height: auto; background-color: black; text-align: left; padding: 10px; overflow: auto; max-height: 350px;"></div>',
    background: "#0e1746",
    showConfirmButton: true,
    width: '40%',
    //backdrop: false,
    didOpen: () => {
      // Use setTimeout to ensure DOM is fully ready and improve perceived performance
      setTimeout(() => {
        const container = document.getElementById("json-output");
        if (container) {
          // Show loading message for large data
          if (isLargeData || hasLargeNodeList) {
            container.innerHTML = '<div style="color: #888; padding: 10px;">Loading large dataset... Please wait.</div>';
            
            // Delay rendering for large data to improve UX
            setTimeout(() => {
              container.innerHTML = ''; // Clear loading message
              const formatter = new JSONFormatter(jsonData, isLargeData ? 1 : 2, jsonOutputConfig);
              const renderedElement = formatter.render();
              container.appendChild(renderedElement);
              
              // Apply string cleanup for large data too
              if (!isLargeData) {
                setTimeout(() => {
                  const stringElements = container.querySelectorAll('.json-formatter-string');
                  stringElements.forEach(element => {
                    if (element.textContent.startsWith('"') && element.textContent.endsWith('"')) {
                      element.textContent = element.textContent.slice(1, -1);
                    }
                  });
                }, 100);
              }
            }, 100);
          } else {
            // Normal rendering for small data
            const formatter = new JSONFormatter(jsonData, 2, jsonOutputConfig);
            const renderedElement = formatter.render();
            container.appendChild(renderedElement);
            
            // Remove quotes from string values using DOM manipulation
            setTimeout(() => {
              const stringElements = container.querySelectorAll('.json-formatter-string');
              stringElements.forEach(element => {
                if (element.textContent.startsWith('"') && element.textContent.endsWith('"')) {
                  element.textContent = element.textContent.slice(1, -1);
                }
              });
            }, 100);
          }
          
          // Apply custom styles for JSONFormatter value strings
          const style = document.createElement('style');
          style.textContent = `
            #json-output .json-formatter-string {
              word-wrap: break-word !important;
              overflow-wrap: break-word !important;
              white-space: pre-wrap !important;
              word-break: break-all !important;
              max-width: 100% !important;
            }
            #json-output .json-formatter-row .json-formatter-string {
              word-wrap: break-word !important;
              overflow-wrap: break-word !important;
              white-space: pre-wrap !important;
              word-break: break-all !important;
            }
          `;
          document.head.appendChild(style);
        } else {
          console.error("json-output container not found");
        }
      }, isLargeData ? 100 : 50); // Longer delay for large data
    },
  });
}

// JSON Toolbar & Base64 Panel Feature Module
import '../features/base64/base64-panel.js';


function displayJsonData(jsonData, type) {
  const jsonOutputConfig = {
    theme: "dark",
    hoverPreviewEnabled: true,
    hoverPreviewArrayCount: 100,
    hoverPreviewFieldCount: 5,
    animateOpen: true,
    animateClose: true,
    useToJSON: true,
    quotesOnKeys: false,
    quotesOnValues: false
  };

  // Show JSON data in SweetAlert popup
  outputAlert(jsonData, type);
}
window.displayJsonData = displayJsonData;

// ========== RICH GUI DISPLAY FUNCTIONS FOR INFRA DATA ==========

// Returns a colored status badge HTML span
function getInfraStatusBadge(status) {
  const s = (status || '').toLowerCase();
  let color = '#6c757d', icon = '⚪';
  if (s === 'running') { color = '#28a745'; icon = '🟢'; }
  else if (s === 'failed' || s.includes('fail')) { color = '#dc3545'; icon = '🔴'; }
  else if (s === 'preparing' || s === 'prepared' || s.includes('provision')) { color = '#ffc107'; icon = '🟡'; }
  else if (s === 'terminated' || s === 'deleted') { color = '#6c757d'; icon = '⚫'; }
  return `<span style="background:${color};color:white;padding:2px 8px;border-radius:12px;font-size:0.82em;font-weight:bold;">${icon} ${window.escapeHtml ? window.escapeHtml(status || 'Unknown') : (status || 'Unknown')}</span>`;
}

// Stores SSH commands indexed by position so onclick can reference them safely
window._guiSshCommands = [];
window.copyGuiSshCommand = function(idx) {
  const cmd = window._guiSshCommands[idx] || '';
  navigator.clipboard.writeText(cmd).then(() => {
    const el = document.getElementById('gui-ssh-cmd-' + idx);
    if (el) {
      // Blink once; re-clicks reset the timer so the highlight never sticks
      if (el._blinkOrig === undefined) el._blinkOrig = el.style.background;
      clearTimeout(el._blinkTimer);
      el.style.background = '#155724';
      el._blinkTimer = setTimeout(() => { el.style.background = el._blinkOrig; el._blinkOrig = undefined; }, 1500);
    }
  }).catch(err => console.error('copy failed:', err));
};

// Builds the node-by-nodeGroup summary HTML block (shared by status + dynamic result views)
function buildInfraNodeSummaryHtml(data) {
  const esc = window.escapeHtml || (s => String(s));
  const nodes = (window.getInfraNodes ? window.getInfraNodes(data) : null) || data.node || [];

  // Group nodes by nodeGroupId
  const groups = {};
  nodes.forEach(nd => {
    const gid = nd.nodeGroupId || 'default';
    if (!groups[gid]) groups[gid] = [];
    groups[gid].push(nd);
  });
  const groupCount = Object.keys(groups).length;

  // Unique providers (fallback to nodeGroup if nodes were compacted)
  let providers = [...new Set(nodes.map(nd =>
    nd.connectionConfig?.providerName || nd.connectionName?.split('-')[0] || null
  ).filter(Boolean))];
  if (providers.length === 0 && data.nodeGroup) {
    providers = [...new Set(data.nodeGroup.map(ng => {
      if (ng.connectionConfig?.providerName) return ng.connectionConfig.providerName;
      if (ng.connectionName) return ng.connectionName.split('-')[0];
      const parts = (ng.id || '').split('-');
      return parts.length >= 2 ? parts[1] : null;
    }).filter(Boolean))];
  }

  // Node status counts
  const sc = data.statusCount || {};
  const runningCount = sc.countRunning ?? nodes.filter(nd => (nd.status || '').toLowerCase() === 'running').length;
  const failedCount  = sc.countFailed  ?? nodes.filter(nd => (nd.status || '').toLowerCase().includes('fail')).length;
  const totalCount   = sc.countTotal   ?? nodes.length;

  // Estimated hourly cost (fallback to nodeGroup if nodes were compacted)
  let totalCost = 0, hasCost = false;
  nodes.forEach(nd => { if (nd.spec?.costPerHour > 0) { totalCost += nd.spec.costPerHour; hasCost = true; } });
  if (!hasCost && data.nodeGroup) {
    data.nodeGroup.forEach(ng => {
      if (ng.spec?.costPerHour > 0) {
        const sz = ng.nodes?.length || ng.nodeGroupSize || 0;
        totalCost += (ng.spec.costPerHour * sz);
        hasCost = true;
      }
    });
  }

  // newNodeList set for quick lookup
  const newNodeSet = new Set(data.newNodeList || []);

  // Semantic color: only node count and status badges use color
  const allRunning = runningCount === totalCount && totalCount > 0;
  const nodeNumColor = failedCount > 0 ? '#dc2626' : (allRunning ? '#16a34a' : '#d97706');
  const hasActiveAction = data.targetAction && data.targetAction !== 'None' && data.targetAction !== '';

  // Shared font stacks — defined once, used throughout
  const MONO = "ui-monospace,'Cascadia Code','Menlo','Consolas',monospace";
  const SANS = "system-ui,-apple-system,'Segoe UI',sans-serif";

  // ── Summary cards — uniform neutral, number size does the talking ──
  const cardStyle = `background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 8px;text-align:center;`;
  const statLabelStyle = `font-size:11px;color:#94a3b8;margin-top:5px;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;font-family:${SANS};`;
  let html = `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px;">`;
  html += `
    <div style="${cardStyle}">
      <div style="font-size:26px;font-weight:700;color:${nodeNumColor};line-height:1;font-variant-numeric:tabular-nums;font-family:${SANS};">${runningCount}<span style="font-size:14px;font-weight:400;color:#94a3b8;">/${totalCount}</span></div>
      <div style="${statLabelStyle}">Running Nodes</div>
    </div>
    <div style="${cardStyle}">
      <div style="font-size:26px;font-weight:700;color:#334155;line-height:1;font-variant-numeric:tabular-nums;font-family:${SANS};">${groupCount}</div>
      <div style="${statLabelStyle}">NodeGroups</div>
    </div>
    <div style="${cardStyle}">
      <div style="font-size:13px;font-weight:600;color:#334155;line-height:1.6;font-family:${SANS};">${providers.length ? providers.map(p => esc(p)).join('<br>') : '—'}</div>
      <div style="${statLabelStyle}">Providers</div>
    </div>
    <div style="${cardStyle}">
      <div style="font-size:16px;font-weight:700;color:${hasCost ? '#334155' : '#94a3b8'};font-variant-numeric:tabular-nums;font-family:${SANS};">${hasCost ? '$' + totalCost.toFixed(4) : '—'}</div>
      <div style="${statLabelStyle}">Est. Cost/hr</div>
    </div>
    <div style="${cardStyle}">
      ${getInfraStatusBadge(data.status)}
      ${hasActiveAction ? `<div style="font-size:11px;color:#d97706;margin-top:5px;font-family:${SANS};">⏳ ${esc(data.targetAction)}${data.targetStatus ? ' → ' + esc(data.targetStatus) : ''}</div>` : ''}
      <div style="${statLabelStyle}">Status</div>
    </div>`;
  html += `</div>`;

  // ── Status distribution pills ──
  if (totalCount > 0 && (sc.countFailed > 0 || sc.countCreating > 0 || sc.countSuspended > 0 || sc.countTerminated > 0 || sc.countUndefined > 0)) {
    const pills = [
      { label: 'Running',    count: sc.countRunning    || 0, color: '#16a34a' },
      { label: 'Creating',   count: sc.countCreating   || 0, color: '#0891b2' },
      { label: 'Failed',     count: sc.countFailed     || 0, color: '#dc2626' },
      { label: 'Suspended',  count: sc.countSuspended  || 0, color: '#6b7280' },
      { label: 'Terminated', count: sc.countTerminated || 0, color: '#475569' },
      { label: 'Undefined',  count: sc.countUndefined  || 0, color: '#92400e' },
    ].filter(p => p.count > 0);
    html += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">`;
    pills.forEach(p => { html += `<span style="background:${p.color};color:white;padding:3px 12px;border-radius:12px;font-size:12px;font-weight:600;font-family:${SANS};">${p.label}: ${p.count}</span>`; });
    html += `</div>`;
  }

  // ── Creation errors ──
  const ce = data.creationErrors;
  if (ce && (ce.failedNodeCount > 0 || (ce.nodeCreationErrors || []).length > 0 || (ce.nodeObjectCreationErrors || []).length > 0)) {
    const allErrors = [...(ce.nodeObjectCreationErrors || []), ...(ce.nodeCreationErrors || [])];
    html += `
      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-family:${SANS};">
        <div style="color:#dc2626;font-weight:700;margin-bottom:8px;font-size:13px;line-height:1.4;">
          ❌ Creation Errors — ${ce.failedNodeCount || allErrors.length} failed / ${ce.totalNodeCount || totalCount} total
          ${ce.failureHandlingStrategy ? `<span style="font-size:12px;font-weight:400;color:#6b7280;margin-left:8px;">(strategy: ${esc(ce.failureHandlingStrategy)})</span>` : ''}
        </div>
        ${allErrors.length > 0 ? `<table style="width:100%;border-collapse:collapse;font-size:12px;font-family:${SANS};">
          <thead><tr style="color:#6b7280;border-bottom:1px solid #fca5a5;">
            <th style="padding:4px 8px;text-align:left;font-weight:600;">Node</th>
            <th style="padding:4px 8px;text-align:left;font-weight:600;">Phase</th>
            <th style="padding:4px 8px;text-align:left;font-weight:600;">Error</th>
            <th style="padding:4px 8px;text-align:left;font-weight:600;">Time</th>
          </tr></thead>
          <tbody>${allErrors.map(e => `
            <tr style="border-bottom:1px solid #fee2e2;">
              <td style="padding:4px 8px;color:#991b1b;font-family:${MONO};font-size:11px;">${esc(e.nodeName || '-')}</td>
              <td style="padding:4px 8px;color:#dc2626;font-weight:600;">${esc(e.phase || '-')}</td>
              <td style="padding:4px 8px;color:#7f1d1d;white-space:normal;line-height:1.5;">${esc(e.error || '-')}</td>
              <td style="padding:4px 8px;color:#6b7280;">${esc((e.timestamp || '').split('T')[0] || e.timestamp || '-')}</td>
            </tr>`).join('')}
          </tbody>
        </table>` : ''}
      </div>`;
  }

  // ── System message (Structured & Collapsible) ──
  const sysMessages = Array.isArray(data.systemMessage) ? data.systemMessage.filter(Boolean) : (data.systemMessage ? [data.systemMessage] : []);
  if (sysMessages.length > 0) {
    if (sysMessages.length === 1) {
      html += `<div style="background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:6px;padding:8px 14px;margin-bottom:12px;font-size:12px;color:#92400e;line-height:1.5;font-family:${SANS};">
        ⚠️ ${esc(sysMessages[0])}
      </div>`;
    } else {
      const summaryMsg = sysMessages[0];
      const detailMsgs = sysMessages.slice(1);
      const detailCount = detailMsgs.length;

      const parsedRows = detailMsgs.map((m, idx) => {
        let ngName = '';
        let provider = '';
        let reason = m;

        const ngMatch = m.match(/NodeGroup\s+'([^']+)'/i);
        if (ngMatch) {
          ngName = ngMatch[1];
          const parts = ngName.split('-');
          if (parts.length >= 2) provider = parts[1];
        }

        const connMatch = m.match(/connection\s+'([^']+)'/i);
        if (connMatch && !provider) {
          provider = connMatch[1].split('-')[0];
        }

        if (m.includes('Making Subnet Error')) {
          reason = 'Subnet creation failed (CSP Quota / Network Error)';
        } else if (m.includes('failed to create vNet') || m.includes('failed to create default VNet')) {
          reason = 'VNet creation failed';
        } else if (m.includes('quota') || m.includes('Quota')) {
          reason = 'CSP Quota / Limit Exceeded';
        } else {
          const lastColon = m.lastIndexOf(':');
          if (lastColon > 0 && lastColon < m.length - 10) {
            reason = m.substring(lastColon + 1).trim();
          }
        }

        const bg = idx % 2 === 0 ? '#ffffff' : '#fef2f2';
        return `
          <tr style="background:${bg};border-bottom:1px solid #fee2e2;">
            <td style="padding:6px 10px;font-family:${MONO};font-size:11px;font-weight:600;color:#991b1b;white-space:nowrap;">${esc(ngName || '-')}</td>
            <td style="padding:6px 10px;font-size:11px;font-weight:600;white-space:nowrap;">
              <span style="background:#fee2e2;color:#b91c1c;padding:1px 6px;border-radius:4px;">${esc((provider || 'CSP').toUpperCase())}</span>
            </td>
            <td style="padding:6px 10px;font-size:12px;color:#7f1d1d;white-space:normal;line-height:1.4;">
              ${esc(reason)}
              <details style="margin-top:3px;font-size:11px;color:#64748b;">
                <summary style="cursor:pointer;color:#dc2626;">Detail log</summary>
                <div style="font-family:${MONO};font-size:10px;padding:5px;background:#fff;border:1px solid #fecaca;border-radius:4px;margin-top:3px;word-break:break-all;">${esc(m)}</div>
              </details>
            </td>
          </tr>`;
      }).join('');

      html += `
        <div style="background:#fff8f6;border:1px solid #fecaca;border-left:4px solid #ef4444;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-family:${SANS};">
          <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none;"
            onclick="const el=document.getElementById('sys-msg-details-table');const btn=document.getElementById('sys-msg-toggle-btn');if(el.style.display==='none'){el.style.display='block';btn.textContent='▲ Hide Details';}else{el.style.display='none';btn.textContent='▼ Show ${detailCount} Details';}">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-weight:700;color:#991b1b;font-size:13px;">⚠️ ${esc(summaryMsg)}</span>
              <span style="background:#fee2e2;color:#b91c1c;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">${detailCount} items</span>
            </div>
            <button type="button" id="sys-msg-toggle-btn"
              style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;padding:3px 10px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">
              ▼ Show ${detailCount} Details
            </button>
          </div>
          <div id="sys-msg-details-table" style="display:none;margin-top:10px;max-height:260px;overflow-y:auto;border-top:1px solid #fecaca;padding-top:8px;">
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
              <thead>
                <tr style="color:#64748b;border-bottom:1px solid #fecaca;text-align:left;">
                  <th style="padding:4px 10px;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">NodeGroup</th>
                  <th style="padding:4px 10px;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">Provider</th>
                  <th style="padding:4px 10px;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">Failure Reason</th>
                </tr>
              </thead>
              <tbody>
                ${parsedRows}
              </tbody>
            </table>
          </div>
        </div>`;
    }
  }

  // ── Infra labels (hide internal sys.* labels to keep view clean) ──
  const labels = data.label && typeof data.label === 'object'
    ? Object.entries(data.label).filter(([k]) => k && !k.startsWith('sys.'))
    : [];
  if (labels.length > 0) {
    html += `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;">`;
    labels.forEach(([k, v]) => {
      html += v
        ? `<span style="background:#f1f5f9;color:#475569;padding:2px 9px;border-radius:6px;font-size:11px;white-space:nowrap;border:1px solid #e2e8f0;font-family:${SANS};"><b style="color:#334155;">${esc(k)}</b>: ${esc(v)}</span>`
        : `<span style="background:#f1f5f9;color:#475569;padding:2px 9px;border-radius:6px;font-size:11px;white-space:nowrap;border:1px solid #e2e8f0;font-family:${SANS};">${esc(k)}</span>`;
    });
    html += `</div>`;
  }

  // ── Per-NodeGroup sections ─
  const COL_COUNT = 6;
  const totalNodesInInfra = nodes.length;
  // Threshold to keep DOM lean: for large infras, cap nodes rendered per NodeGroup
  const MAX_RENDER_NODES_PER_GROUP = totalNodesInInfra > 500 ? 5 : (totalNodesInInfra > 100 ? 10 : 50);

  Object.entries(groups).forEach(([gid, gnodes]) => {
    const first = gnodes[0] || {};

    const provider = first.connectionConfig?.providerName || first.connectionName?.split('-')[0] || '';
    const platform = (provider || '').toLowerCase();
    const providerColor = cspGenericColors[platform] || cspGenericColors[platform.split('-')[0]] || '#6b7280';
    const connName = first.connectionName || '';
    const region = first.region?.region || first.connectionConfig?.regionZoneInfo?.assignedRegion || '';
    const zone   = first.region?.zone   || first.connectionConfig?.regionZoneInfo?.assignedZone   || '';
    const sshUser = first.nodeUserName || '';
    const sshPort = first.sshPort || 22;

    const allSshKeys = [...new Set(gnodes.map(nd => nd.sshKeyId).filter(Boolean))];
    const uniformSshKey = allSshKeys.length === 1 ? allSshKeys[0].split('+').pop() || allSshKeys[0] : '';

    // Spec: weight carries hierarchy; accelerator keeps amber
    let specHtml = '';
    if (first.spec?.vCPU || first.spec?.memoryGiB) {
      const parts = [];
      if (first.spec.vCPU)      parts.push(`<b style="color:#1e293b;">${first.spec.vCPU} vCPU</b>`);
      if (first.spec.memoryGiB) parts.push(`<b style="color:#1e293b;">${first.spec.memoryGiB} GiB</b>`);
      if (first.spec.acceleratorType && first.spec.acceleratorType !== 'none')
        parts.push(`<span style="color:#d97706;font-weight:700;">+${esc(first.spec.acceleratorType.toUpperCase())}(${first.spec.acceleratorCount || 1})</span>`);
      specHtml = parts.join('<span style="color:#e2e8f0;"> / </span>');
      if (first.cspSpecName) specHtml += `<span style="color:#94a3b8;font-size:11px;"> (${esc(first.cspSpecName)})</span>`;
      if (first.spec.costPerHour > 0) specHtml += `<span style="color:#d97706;font-size:11px;"> · $${first.spec.costPerHour}/h</span>`;
    } else if (first.specId) {
      const seg = first.specId.split('+').pop() || first.specId;
      specHtml = `<b style="color:#1e293b;">${esc(seg)}</b>`;
      if (first.cspSpecName) specHtml += `<span style="color:#94a3b8;font-size:11px;"> (${esc(first.cspSpecName)})</span>`;
    }

    let osText = '';
    if (first.image?.osDistribution)  osText = first.image.osDistribution;
    else if (first.image?.osType)     osText = first.image.osType;
    else if (first.imageId)           osText = first.imageId.split('+').pop() || first.imageId;

    const diskType = first.rootDiskType && first.rootDiskType !== 'default' ? first.rootDiskType : '';
    const diskSize = first.rootDiskSize > 0 ? `${first.rootDiskSize}GB` : '';
    const diskText = (diskType || diskSize) ? `${diskType}${diskType && diskSize ? ' ' : ''}${diskSize}` : '';

    // Provider badge: CSP brand color for instant cloud recognition
    const providerBadge = provider
      ? `<span style="background:${providerColor};color:white;padding:2px 9px;border-radius:5px;font-size:11px;font-weight:700;font-family:${SANS};letter-spacing:0.04em;">${esc(provider.toUpperCase())}</span>`
      : '';

    const chipStyle = `color:#475569;font-family:${SANS};font-size:12px;`;
    const chips = [];
    if (provider)    chips.push(providerBadge);
    if (connName)    chips.push(`🔌 <span style="${chipStyle}">${esc(connName)}</span>`);
    if (region)      chips.push(`📍 <span style="${chipStyle}">${esc(region)}${zone ? `<span style="color:#94a3b8;"> / ${esc(zone)}</span>` : ''}</span>`);
    if (sshUser)     chips.push(`👤 <span style="${chipStyle}font-weight:600;">${esc(sshUser)}</span><span style="color:#94a3b8;font-size:12px;">:${sshPort !== 22 ? sshPort : '22'}</span>${uniformSshKey ? ` <span style="color:#94a3b8;font-size:11px;">🔑${esc(uniformSshKey)}</span>` : ''}`);
    if (specHtml)    chips.push(`⚙️ <span style="${chipStyle}font-size:12px;">${specHtml}</span>`);
    if (osText)      chips.push(`💿 <span style="${chipStyle}">${esc(osText)}</span>`);
    if (diskText)    chips.push(`💾 <span style="${chipStyle}">${esc(diskText)}</span>`);

    html += `
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:12px;overflow:hidden;">
        <div style="background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:10px 14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;">
            <span style="font-weight:700;color:#0f172a;font-size:13px;font-family:${SANS};">📦 ${esc(gid)}</span>
            <span style="font-size:11px;color:#94a3b8;font-family:${SANS};">${gnodes.length} node${gnodes.length > 1 ? 's' : ''}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;">
            ${chips.join('')}
          </div>
        </div>
        <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;white-space:nowrap;font-family:${SANS};">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:6px 10px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:#64748b;">Node ID</th>
              <th style="padding:6px 10px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:#64748b;">Status</th>
              <th style="padding:6px 10px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:#64748b;">Public IP</th>
              <th style="padding:6px 10px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:#64748b;">Private IP</th>
              <th style="padding:6px 10px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:#64748b;">CSP Resource ID</th>
              <th style="padding:6px 10px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:#64748b;">Created</th>
            </tr>
          </thead>
          <tbody>`;

    const displayedNodes = gnodes.slice(0, MAX_RENDER_NODES_PER_GROUP);
    displayedNodes.forEach((nd, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
      const isNew = newNodeSet.has(nd.id);

      const monIcon = nd.monAgentStatus === 'installed' ? '📡✓' : nd.monAgentStatus === 'failed' ? '📡✗' : '';
      const netIcon = nd.networkAgentStatus === 'installed' ? '🔗✓' : nd.networkAgentStatus === 'failed' ? '🔗✗' : '';
      const agentIcons = [monIcon, netIcon].filter(Boolean).join(' ');
      const statusCell = getInfraStatusBadge(nd.status)
        + (agentIcons ? `<span style="font-size:11px;color:#94a3b8;margin-left:4px;">${agentIcons}</span>` : '')
        + (nd.targetAction && nd.targetAction !== 'None' ? `<div style="font-size:11px;color:#d97706;margin-top:2px;">⏳${esc(nd.targetAction)}</div>` : '');

      const cspId = nd.cspResourceId || nd.cspResourceName || '-';
      const cspIdShort = cspId.length > 28 ? cspId.slice(0, 26) + '…' : cspId;
      const created = nd.createdTime ? esc(nd.createdTime.split(' ')[0]) : '-';
      const rowBorder = isNew ? `outline:2px solid #16a34a;outline-offset:-1px;` : `border-bottom:1px solid #f1f5f9;`;

      const nodeKeyId = nd.sshKeyId ? nd.sshKeyId.split('+').pop() || nd.sshKeyId : '';
      const nodeIdCell = isNew
        ? `<span style="background:#dcfce7;color:#16a34a;font-size:10px;padding:1px 5px;border-radius:3px;font-weight:700;margin-right:5px;font-family:${SANS};">NEW</span>${esc(nd.id || '-')}`
        : esc(nd.id || '-');
      const nodeIdSuffix = (!uniformSshKey && nodeKeyId)
        ? `<div style="color:#94a3b8;font-size:11px;margin-top:1px;font-family:${SANS};">🔑 ${esc(nodeKeyId)}</div>` : '';

      html += `
        <tr style="background:${bg};${rowBorder}">
          <td style="padding:7px 10px;font-family:${MONO};font-size:12px;font-weight:600;color:#1e293b;">${nodeIdCell}${nodeIdSuffix}</td>
          <td style="padding:7px 10px;">${statusCell}</td>
          <td style="padding:7px 10px;font-family:${MONO};font-size:13px;font-weight:700;color:#0f172a;letter-spacing:0.01em;">${esc(nd.publicIP || '—')}</td>
          <td style="padding:7px 10px;font-family:${MONO};font-size:12px;color:#475569;">${esc(nd.privateIP || '—')}</td>
          <td style="padding:7px 10px;font-family:${MONO};font-size:11px;color:#94a3b8;" title="${esc(cspId)}">${esc(cspIdShort)}</td>
          <td style="padding:7px 10px;font-size:12px;color:#94a3b8;font-family:${SANS};">${created}</td>
        </tr>`;

      // Labels row: only the meaningful keys (role, accelerator) to keep the
      // per-node summary uncluttered; the rest are omitted here.
      const ndLabels = nd.label && typeof nd.label === 'object'
        ? Object.entries(nd.label).filter(([k]) => k === 'role' || k === 'accelerator')
        : [];
      if (ndLabels.length > 0) {
        const pillsHtml = ndLabels.map(([k, v]) =>
          v ? `<span style="background:#f1f5f9;border:1px solid #e2e8f0;color:#475569;padding:2px 7px;border-radius:5px;font-size:11px;white-space:nowrap;font-family:${SANS};"><b style="color:#334155;">${esc(k)}</b>: ${esc(v)}</span>`
            : `<span style="background:#f1f5f9;border:1px solid #e2e8f0;color:#475569;padding:2px 7px;border-radius:5px;font-size:11px;white-space:nowrap;font-family:${SANS};">${esc(k)}</span>`
        ).join('');
        html += `<tr style="background:${bg};"><td colspan="${COL_COUNT}" style="padding:4px 10px 5px 26px;border-bottom:1px solid #f1f5f9;white-space:normal;">
          <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;line-height:1;">
            <span style="color:#94a3b8;font-size:11px;margin-right:1px;font-family:${SANS};">🏷️</span>${pillsHtml}
          </div>
        </td></tr>`;
      }

      // Network details
      const netDetails = [];
      if (nd.vNetId)   netDetails.push(`vNet: <b style="color:#334155;">${esc(nd.vNetId)}</b>`);
      if (nd.subnetId) netDetails.push(`Subnet: <b style="color:#334155;">${esc(nd.subnetId)}</b>`);
      if (nd.securityGroupIds?.length) netDetails.push(`SG: <b style="color:#334155;">${nd.securityGroupIds.map(esc).join(', ')}</b>`);
      if (netDetails.length > 0) {
        html += `<tr style="background:${bg};"><td colspan="${COL_COUNT}" style="padding:3px 10px 5px 26px;font-size:12px;color:#64748b;border-bottom:1px solid #f1f5f9;font-family:${SANS};">🌐 ${netDetails.join(' &nbsp;·&nbsp; ')}</td></tr>`;
      }

      // System message per node
      if (nd.systemMessage) {
        const isFail = (nd.status || '').toLowerCase().includes('fail');
        const msgColor = isFail ? '#dc2626' : '#92400e';
        const msgBg    = isFail ? '#fef2f2' : '#fffbeb';
        const borderC  = isFail ? '#fca5a5' : '#fde68a';
        html += `<tr style="background:${msgBg};"><td colspan="${COL_COUNT}" style="padding:5px 10px 6px 26px;color:${msgColor};font-size:12px;white-space:normal;border-bottom:1px solid ${borderC};line-height:1.5;font-family:${SANS};">
          ${isFail ? '❌' : 'ℹ️'} <em>${esc(nd.systemMessage)}</em>
        </td></tr>`;
      }
    });

    if (gnodes.length > displayedNodes.length) {
      const remaining = gnodes.length - displayedNodes.length;
      html += `<tr style="background:#f8fafc;"><td colspan="${COL_COUNT}" style="padding:8px 12px;text-align:center;color:#64748b;font-size:12px;border-bottom:1px solid #e2e8f0;font-family:${SANS};">
        Showing first ${displayedNodes.length} of ${gnodes.length} nodes (⚡ ${remaining} more nodes hidden for performance. View full list in Resource Management).
      </td></tr>`;
    }
    html += `</tbody></table></div></div>`;
  });

  return html;
}

// Rich GUI for Infra status view (replaces raw JSON in statusInfra)
function displayInfraStatusGui(data) {
  window._currentJsonOutput = data;
  window._currentJsonString = JSON.stringify(data, null, 2);
  const esc = window.escapeHtml || (s => String(s));
  const infraId = data.id || data.name || 'Infra';

  // Meta tags row (description, CLADNet, etc.)
  const metaItems = [];
  if (data.description) metaItems.push(`📝 ${esc(data.description)}`);
  if (data.configureCloudAdaptiveNetwork === 'yes') metaItems.push(`🔗 CLADNet: <span style="color:#28a745;">enabled</span>`);
  const metaHtml = metaItems.length
    ? `<p style="color:#64748b;font-size:12px;margin:0 0 12px;line-height:1.6;">${metaItems.join(' &nbsp;·&nbsp; ')}</p>`
    : '';

  Swal.fire({
    title: `📊 Infra Status: ${esc(infraId)}`,
    html: `
      <div style="text-align:left;color:#0f172a;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;">
        ${metaHtml}
        ${buildInfraNodeSummaryHtml(data)}
        <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;">
          ${(data.statusCount?.countFailed > 0) ? `
          <button type="button" onclick="reviewRetryFailedNodes('${esc(infraId)}')"
            style="padding:7px 14px;font-size:13px;font-family:inherit;background:#dc2626;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;margin-right:auto;">
            🔄 Retry Failed (${data.statusCount.countFailed})
          </button>` : ''}
          <button type="button" onclick="downloadAllSshKeys()"
            style="padding:7px 14px;font-size:13px;font-family:inherit;background:#16a34a;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;">
            📦 SSH Keys
          </button>
          <button type="button" onclick="displayJsonData(window._currentJsonOutput,'info')"
            style="padding:7px 14px;font-size:13px;font-family:inherit;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;">
            🔍 View JSON
          </button>
        </div>
      </div>`,
    background: '#ffffff',
    color: '#0f172a',
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '✕ Close',
    width: '90%',
  });
}

// ── Retry of failed Nodes ────────────────────────────────────────────────────
// A CSP capacity refusal is transient, so re-creating a Node with its original
// configuration often succeeds minutes later. Review first: failures that
// retrying cannot fix (account quota, an image the spec rejects, a malformed
// request) are listed with the reason instead of being retried.

const RETRY_CLASS_STYLE = {
  ZoneCapacity:       { icon: '⏳', label: 'Capacity shortage',   color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  RegionCapacity:     { icon: '⏳', label: 'Region shortage',     color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  Throttling:         { icon: '🐢', label: 'Rate limited',        color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  Network:            { icon: '🔌', label: 'Network error',       color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  AccountQuota:       { icon: '🚫', label: 'Account quota',       color: '#b91c1c', bg: '#fef2f2', border: '#fca5a5' },
  Auth:               { icon: '🔑', label: 'Credential error',    color: '#b91c1c', bg: '#fef2f2', border: '#fca5a5' },
  ImageSpecMismatch:  { icon: '💿', label: 'Image not usable',    color: '#b91c1c', bg: '#fef2f2', border: '#fca5a5' },
  InvalidRequest:     { icon: '✏️', label: 'Request rejected',    color: '#b91c1c', bg: '#fef2f2', border: '#fca5a5' },
  DiskTypeUnavailable:{ icon: '💾', label: 'Disk type unusable',  color: '#b91c1c', bg: '#fef2f2', border: '#fca5a5' },
  Unknown:            { icon: '❓', label: 'Unrecognized',        color: '#475569', bg: '#f8fafc', border: '#cbd5e1' },
};

function retryClassStyle(cls) {
  return RETRY_CLASS_STYLE[cls] || RETRY_CLASS_STYLE.Unknown;
}

// Step 1: ask CB-Tumblebug what can be retried, then show the plan for approval.
async function reviewRetryFailedNodes(infraId) {
  const esc = window.escapeHtml || (s => String(s));
  const cfg = getConfig();
  const username = cfg.username;
  const password = cfg.password;
  const namespace = window.configNamespace || cfg.namespace;
  const url = `${tbApiBase()}/ns/${namespace}/infra/${infraId}/retryFailedNodesReview`;

  const taskId = addSpinnerTask(`Reviewing failed nodes of ${infraId}`);
  let review;
  try {
    const res = await axios.post(url, {}, {
      auth: { username, password },
      headers: { 'Content-Type': 'application/json' }
    });
    review = res.data;
  } catch (error) {
    removeSpinnerTask(taskId);
    Swal.fire({
      title: 'Retry review failed',
      text: error.response?.data?.message || error.message,
      icon: 'error'
    });
    return;
  }
  removeSpinnerTask(taskId);

  const plans = review.plans || [];
  if (plans.length === 0) {
    Swal.fire({ title: 'Nothing to retry', text: 'This infra has no failed node.', icon: 'info' });
    return;
  }

  const retriable = plans.filter(p => p.action === 'retryInPlace');
  const blocked   = plans.filter(p => p.action !== 'retryInPlace');

  const planCard = (p, selectable) => {
    const f = p.failure || {};
    const st = retryClassStyle(f.class);
    const zoneText = p.zone ? ` · ${esc(p.zone)}` : '';
    const checkbox = selectable
      ? `<input type="checkbox" class="retry-node-cb" value="${esc(p.nodeId)}" checked
           style="margin-right:8px;transform:scale(1.15);cursor:pointer;">`
      : (p.assumeResolvedHelps
        ? `<input type="checkbox" class="retry-node-cb" value="${esc(p.nodeId)}" data-assume-resolved="1"
             title="Retry this node, asserting the block was lifted outside CB-Tumblebug"
             style="margin-right:8px;transform:scale(1.15);cursor:pointer;">`
        : '');
    return `
      <div style="border:1px solid ${st.border};background:${st.bg};border-radius:8px;padding:9px 12px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          ${checkbox}
          <b style="font-family:monospace;font-size:13px;color:#0f172a;">${esc(p.nodeId)}</b>
          <span style="font-size:11px;color:#64748b;">${esc(p.provider || '')}${zoneText}</span>
          <span style="background:${st.color};color:white;font-size:10px;font-weight:700;padding:1px 7px;border-radius:4px;">
            ${st.icon} ${esc(st.label)}
          </span>
          ${p.costPerHour ? `<span style="margin-left:auto;font-size:11px;color:#475569;">$${p.costPerHour.toFixed(4)}/hr</span>` : ''}
        </div>
        <div style="font-size:12px;color:${st.color};margin-top:5px;line-height:1.5;">${esc(p.reason || '')}</div>
        ${p.siblingSubnetId ? `<div style="font-size:11px;color:#166534;margin-top:4px;line-height:1.5;">
          ✅ ${p.siblingRunningCount} sibling node(s) running in <b>${esc(p.siblingZone || p.siblingSubnetId)}</b> of the same VNet</div>` : ''}
        ${(selectable && p.zoneCapability?.shiftable) ? `<div style="font-size:11px;color:#475569;margin-top:5px;">
          🌐 Zone:
          <select class="retry-zone-sel" data-node="${esc(p.nodeId)}" data-sibling-zone="${esc(p.siblingZone || '')}"
            style="margin-left:4px;padding:2px 5px;border:1px solid #cbd5e1;border-radius:4px;font-size:11px;">
            <option value="">keep ${esc(p.zone || 'current')}</option>
            ${(p.zoneCapability.zones || []).filter(z => z !== p.zone)
              .map(z => `<option value="${esc(z)}">${esc(z)}</option>`).join('')}
          </select>
          <span style="color:#94a3b8;"> — a subnet of this same VNet, so the VPC and security group are unchanged</span>
        </div>` : ''}
        ${(!selectable && p.assumeResolvedHelps) ? `<div style="font-size:11px;color:#b45309;margin-top:4px;line-height:1.5;">
          ☑️ Tick to retry anyway — only if you resolved the block with the provider since.</div>` : ''}
        ${(!selectable && !p.assumeResolvedHelps) ? `<div style="margin-top:6px;">
          <button type="button" onclick="fixAndReplaceNodeGroup('${esc(infraId)}','${esc(p.nodeGroupId)}')"
            style="padding:4px 10px;font-size:11px;font-family:inherit;background:#b91c1c;color:white;border:none;border-radius:5px;cursor:pointer;font-weight:600;">
            🔧 Fix and re-create NodeGroup ${esc(p.nodeGroupId)}
          </button>
          <span style="font-size:11px;color:#94a3b8;margin-left:6px;">only if every node of the group failed</span>
        </div>` : ''}
        ${p.escalation ? `<div style="font-size:11px;color:#64748b;margin-top:4px;line-height:1.5;">💡 ${esc(p.escalation)}</div>` : ''}
      </div>`;
  };

  const html = `
    <div style="text-align:left;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;color:#0f172a;">
      <p style="color:#475569;font-size:13px;margin:0 0 12px;">${esc(review.message || '')}</p>

      ${retriable.length ? `
        <div style="font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 7px;">
          Can be retried (${retriable.length})
        </div>
        ${retriable.map(p => planCard(p, true)).join('')}
        <div style="display:flex;gap:14px;align-items:center;margin:12px 0 4px;flex-wrap:wrap;">
          <label style="font-size:12px;color:#475569;">
            Attempts per node
            <input id="retryAttempts" type="number" min="1" max="10" value="3"
              style="width:58px;margin-left:6px;padding:3px 6px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px;">
          </label>
          <label style="font-size:12px;color:#475569;">
            Interval (s)
            <input id="retryInterval" type="number" min="1" max="600" value="30"
              style="width:64px;margin-left:6px;padding:3px 6px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px;">
          </label>
          <label style="font-size:12px;color:#475569;" title="auto retries as many at once as the CSP allows.">
            Parallel nodes
            <select id="retryParallelism"
              style="margin-left:6px;padding:3px 6px;border:1px solid #cbd5e1;border-radius:4px;font-size:12px;">
              <option value="">auto (CSP limit)</option>
              <option value="1">1 — one at a time</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="5">5</option>
              <option value="10">10</option>
            </select>
          </label>
        </div>
        <p style="font-size:11px;color:#94a3b8;margin:2px 0 0;line-height:1.5;">
          Each replacement keeps the failed node's zone, subnet, VNet, security group and key,
          so it stays on the same private network. The failed record is removed once its
          replacement is up. Nodes are retried in parallel up to the per-CSP limit infra
          provisioning already obeys; pick <b>1</b> to watch them go one at a time.
        </p>
        ${retriable.some(p => p.siblingSubnetId) ? `
        <label style="display:flex;gap:7px;align-items:flex-start;margin-top:10px;padding:8px 10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;cursor:pointer;">
          <input id="retryPreferAvailableSubnet" type="checkbox" onchange="applySiblingZones(this.checked)"
            style="margin-top:2px;transform:scale(1.15);cursor:pointer;">
          <span style="font-size:12px;color:#166534;line-height:1.5;">
            <b>Use the zones where siblings are running</b><br>
            <span style="color:#475569;">Sets each zone picker above to a zone of the same VNet that already holds
            running peers — the best capacity evidence available, though not a guarantee. Adjust any of
            them afterwards; the NodeGroup does end up less spread across zones.</span>
          </span>
        </label>` : ''}` : ''}

      ${blocked.length ? `
        <div style="font-size:12px;font-weight:700;color:#b91c1c;text-transform:uppercase;letter-spacing:0.05em;margin:16px 0 7px;">
          Retrying will not help (${blocked.length})
        </div>
        ${blocked.map(p => planCard(p, false)).join('')}` : ''}
    </div>`;

  const result = await Swal.fire({
    title: `🔄 Retry Failed Nodes: ${esc(infraId)}`,
    html,
    background: '#ffffff',
    color: '#0f172a',
    width: '760px',
    showCancelButton: true,
    showConfirmButton: retriable.length > 0,
    confirmButtonText: `Retry ${retriable.length} node(s)`,
    confirmButtonColor: '#dc2626',
    cancelButtonText: 'Close',
    // One target per checked node, carrying that node's own settings — the same
    // shape the review returns, so what the dialog shows is what gets sent.
    preConfirm: () => {
      const zoneOf = (nodeId) =>
        document.querySelector(`.retry-zone-sel[data-node="${nodeId}"]`)?.value || '';
      return {
        targets: Array.from(document.querySelectorAll('.retry-node-cb:checked')).map(cb => {
          const target = { nodeId: cb.value };
          const zone = zoneOf(cb.value);
          if (zone) target.zone = zone;
          if (cb.dataset.assumeResolved === '1') target.assumeResolved = true;
          return target;
        }),
        attemptsPerNode: parseInt(document.getElementById('retryAttempts')?.value, 10) || 3,
        intervalSeconds: parseInt(document.getElementById('retryInterval')?.value, 10) || 30,
        parallelism: parseInt(document.getElementById('retryParallelism')?.value, 10) || 0,
      };
    },
  });

  if (result.isConfirmed && result.value?.targets?.length) {
    await executeRetryFailedNodes(infraId, result.value);
  }
}

// Some failures cannot be retried at all — an image the CSP does not have, a root
// disk too small for the flavor. Re-sending the same request fails identically, so
// the NodeGroup has to be re-created from a corrected one. Spec is shown read-only:
// instance type decides cost, performance and availability together, and changing
// it is a new NodeGroup rather than a correction of this one.
async function fixAndReplaceNodeGroup(infraId, nodeGroupId) {
  const esc = window.escapeHtml || (s => String(s));
  const cfg = getConfig();
  const username = cfg.username;
  const password = cfg.password;
  const namespace = window.configNamespace || cfg.namespace;
  const base = `${tbApiBase()}/ns/${namespace}/infra/${infraId}`;

  // Read the group's current request from one of its nodes.
  const taskId = addSpinnerTask(`Reading ${nodeGroupId} of ${infraId}`);
  let nodes = [];
  try {
    const ids = (await axios.get(`${base}/nodegroup/${nodeGroupId}`, { auth: { username, password } })).data?.output || [];
    nodes = await Promise.all(ids.map(id =>
      axios.get(`${base}/node/${id}`, { auth: { username, password } }).then(r => r.data)));
  } catch (error) {
    removeSpinnerTask(taskId);
    Swal.fire({ title: 'Could not read the NodeGroup', text: error.response?.data?.message || error.message, icon: 'error' });
    return;
  }
  removeSpinnerTask(taskId);

  const alive = nodes.filter(n => !String(n.status || '').toLowerCase().includes('fail'));
  if (alive.length) {
    Swal.fire({
      title: 'NodeGroup is partly running',
      html: `<div style="text-align:left;font-size:13px;">
        ${alive.length} node(s) of <b>${esc(nodeGroupId)}</b> are not failed, so re-creating it would
        destroy working machines. Add a new NodeGroup with the corrected settings instead.</div>`,
      icon: 'warning',
    });
    return;
  }
  const first = nodes[0] || {};

  const result = await Swal.fire({
    title: `🔧 Re-create NodeGroup: ${esc(nodeGroupId)}`,
    html: `
      <div style="text-align:left;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:13px;color:#0f172a;">
        <p style="color:#475569;font-size:12px;margin:0 0 12px;line-height:1.6;">
          All ${nodes.length} node(s) failed. Correct the request below and CB-Tumblebug will clear them
          and create the NodeGroup again under the same name.
        </p>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 10px;align-items:center;">
          <label style="color:#64748b;">Spec</label>
          <input value="${esc(first.specId || '')}" readonly title="Changing the instance type means a new NodeGroup"
            style="padding:5px 8px;border:1px solid #e2e8f0;border-radius:5px;font-size:12px;background:#f8fafc;color:#94a3b8;">
          <label style="color:#64748b;">Image</label>
          <input id="ngImageId" value="${esc(first.imageId || '')}"
            style="padding:5px 8px;border:1px solid #cbd5e1;border-radius:5px;font-size:12px;">
          <label style="color:#64748b;">Root disk type</label>
          <input id="ngRootDiskType" value="${esc(first.rootDiskType || '')}" placeholder="default"
            style="padding:5px 8px;border:1px solid #cbd5e1;border-radius:5px;font-size:12px;">
          <label style="color:#64748b;">Root disk size (GB)</label>
          <input id="ngRootDiskSize" type="number" min="0" value="${first.rootDiskSize || 0}"
            style="padding:5px 8px;border:1px solid #cbd5e1;border-radius:5px;font-size:12px;">
          <label style="color:#64748b;">Nodes</label>
          <input id="ngSize" type="number" min="1" value="${nodes.length}"
            style="padding:5px 8px;border:1px solid #cbd5e1;border-radius:5px;font-size:12px;">
        </div>
        <p style="font-size:11px;color:#94a3b8;margin:12px 0 0;line-height:1.5;">
          The failed records are cleared first, so their error messages are returned in the result
          rather than kept. Nothing exists on the CSP for them to lose.
        </p>
      </div>`,
    background: '#ffffff',
    color: '#0f172a',
    width: '620px',
    showCancelButton: true,
    confirmButtonText: 'Validate & re-create',
    confirmButtonColor: '#b91c1c',
    preConfirm: () => ({
      name: nodeGroupId,
      specId: first.specId,
      imageId: document.getElementById('ngImageId')?.value?.trim(),
      rootDiskType: document.getElementById('ngRootDiskType')?.value?.trim() || undefined,
      rootDiskSize: parseInt(document.getElementById('ngRootDiskSize')?.value, 10) || undefined,
      nodeGroupSize: parseInt(document.getElementById('ngSize')?.value, 10) || nodes.length,
      label: first.label && typeof first.label === 'object'
        ? Object.fromEntries(Object.entries(first.label).filter(([k]) => !k.startsWith('sys.'))) : undefined,
    }),
  });
  if (!result.isConfirmed || !result.value) return;

  // The same body the create endpoint takes, so the existing review validates it.
  const reqBody = result.value;
  const t2 = addSpinnerTask(`Validating ${nodeGroupId}`);
  try {
    const review = (await axios.post(`${base}/nodeGroupDynamicReview`, reqBody, {
      auth: { username, password }, headers: { 'Content-Type': 'application/json' },
    })).data;
    removeSpinnerTask(t2);
    const problems = (review?.nodeGroup?.errors || review?.errors || []).filter(Boolean);
    if (problems.length) {
      const go = await Swal.fire({
        title: 'The corrected request still has problems',
        html: `<div style="text-align:left;font-size:12px;color:#b91c1c;">${problems.map(esc).join('<br>')}</div>`,
        icon: 'warning', showCancelButton: true, confirmButtonText: 'Re-create anyway',
      });
      if (!go.isConfirmed) return;
    }
  } catch (e) {
    removeSpinnerTask(t2);
    // Validation is advisory; a review that cannot run must not block the fix.
    console.warn('NodeGroup review failed:', e);
  }

  const t3 = addSpinnerTask(`Re-creating ${nodeGroupId}`);
  try {
    const res = await axios.put(`${base}/nodeGroupDynamic/${nodeGroupId}`, reqBody, {
      auth: { username, password }, headers: { 'Content-Type': 'application/json' }, timeout: 0,
    });
    removeSpinnerTask(t3);
    const d = res.data;
    await Swal.fire({
      title: '🔧 NodeGroup re-created',
      html: `<div style="text-align:left;font-size:13px;">
        ${esc(d.message || '')}
        ${(d.removedNodes || []).length ? `<div style="font-size:11px;color:#64748b;margin-top:8px;">
          cleared: ${d.removedNodes.map(n => esc(n.nodeId)).join(', ')}</div>` : ''}
      </div>`,
      icon: 'success', confirmButtonText: 'OK',
    });
  } catch (error) {
    removeSpinnerTask(t3);
    const d = error.response?.data;
    Swal.fire({
      title: error.response?.status === 409 ? 'Cannot re-create this NodeGroup' : 'Re-create failed',
      html: `<div style="text-align:left;font-size:13px;">${esc(d?.message || error.message)}</div>`,
      icon: 'error',
    });
  }
}

// Fills every zone picker with the zone where that node's peers run, so the choice
// is visible in the dialog rather than applied invisibly by the server.
function applySiblingZones(on) {
  document.querySelectorAll('.retry-zone-sel').forEach(sel => {
    const zone = on ? (sel.dataset.siblingZone || '') : '';
    if (!on || Array.from(sel.options).some(o => o.value === zone)) sel.value = zone;
  });
}

// Step 2: run the approved retry. One node at a time server-side, so the call
// can take several minutes when attempts and interval are large.
async function executeRetryFailedNodes(infraId, req) {
  const esc = window.escapeHtml || (s => String(s));
  const cfg = getConfig();
  const username = cfg.username;
  const password = cfg.password;
  const namespace = window.configNamespace || cfg.namespace;
  const url = `${tbApiBase()}/ns/${namespace}/infra/${infraId}/retryFailedNodes`;

  const taskId = addSpinnerTask(`Retrying ${req.targets.length} node(s) of ${infraId}`);
  let data;
  try {
    const res = await axios.post(url, req, {
      auth: { username, password },
      headers: { 'Content-Type': 'application/json' },
      timeout: 0,
    });
    data = res.data;
  } catch (error) {
    removeSpinnerTask(taskId);
    Swal.fire({
      title: 'Retry failed',
      text: error.response?.data?.message || error.message,
      icon: 'error'
    });
    return;
  }
  removeSpinnerTask(taskId);

  const rows = (data.results || []).map(r => {
    const ok = r.succeeded;
    const color = ok ? '#166534' : (r.skipped ? '#64748b' : '#b91c1c');
    const icon  = ok ? '✅' : (r.skipped ? '⏭️' : '❌');
    const outcome = ok
      ? `→ <b style="font-family:monospace;">${esc(r.newNodeId || '')}</b> after ${r.attempts} attempt(s)`
      : (r.skipped ? 'skipped' : `still failing after ${r.attempts} attempt(s)`);
    const detail = r.reason || r.lastFailure?.message || '';
    return `
      <div style="border-bottom:1px solid #f1f5f9;padding:7px 0;">
        <div style="font-size:13px;color:${color};">
          ${icon} <b style="font-family:monospace;">${esc(r.nodeId)}</b> ${outcome}
          ${r.placedInZone ? `<span style="font-size:11px;color:#94a3b8;"> · in ${esc(r.placedInZone)}</span>` : (r.placedInSubnetId ? `<span style="font-size:11px;color:#94a3b8;"> · in ${esc(r.placedInSubnetId)}</span>` : '')}
          ${r.failedNodeRemoved ? '<span style="font-size:11px;color:#94a3b8;"> · failed record removed</span>' : ''}
        </div>
        ${detail ? `<div style="font-size:11px;color:#64748b;margin-top:3px;line-height:1.5;">${esc(detail)}</div>` : ''}
      </div>`;
  }).join('');

  await Swal.fire({
    title: data.succeededCount > 0 ? '🔄 Retry finished' : '🔄 Retry finished — nothing recovered',
    html: `
      <div style="text-align:left;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;color:#0f172a;">
        <p style="color:#475569;font-size:13px;margin:0 0 10px;">
          ${esc(data.message || '')} &nbsp;·&nbsp; ${data.elapsedSeconds}s
          ${data.infraStatus ? ` &nbsp;·&nbsp; ${esc(data.infraStatus)}` : ''}
          ${data.parallelismUsed ? `<br><span style="font-size:11px;color:#94a3b8;">parallel: ${
            Object.entries(data.parallelismUsed).map(([c, n]) => `${esc(c)} ×${n}`).join(', ')}</span>` : ''}
        </p>
        ${rows}
      </div>`,
    icon: data.succeededCount > 0 ? 'success' : 'warning',
    background: '#ffffff',
    color: '#0f172a',
    width: '700px',
    confirmButtonText: 'OK',
  });
}

// Rich GUI for Access Info view (replaces raw JSON in getAccessInfo)
function displayAccessInfoGui(data, infraId) {
  window._currentJsonOutput = data;
  window._currentJsonString = JSON.stringify(data, null, 2);
  const esc = window.escapeHtml || (s => String(s));
  window._guiSshCommands = [];
  const groups = data.InfraNodeGroupAccessInfo || [];
  let cmdIdx = 0;

  // Same sanitization/naming as downloadAllSshKeys so copied commands match the ZIP key files
  const safeName = (name) => String(name).replace(/[\\/]/g, "_").replace(/\.\./g, "_").replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown";
  const infraForKey = safeName(infraId || data.InfraId || "unknown");
  // "/path/to/" is a placeholder the user replaces with the extracted key location
  const pemFileFor = (nodeId) => `/path/to/${safeName(window.configNamespace || '')}-${infraForKey}-${safeName(nodeId || "unknown")}.pem`;

  let html = `<div style="text-align:left;color:#e0e0e0;font-family:sans-serif;">`;
  html += `
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
      <button type="button" onclick="downloadAllSshKeys()"
        style="padding:6px 16px;font-size:12px;background:#28a745;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">
        📦 Download All SSH Keys (ZIP)
      </button>
      <button type="button" onclick="displayJsonData(window._currentJsonOutput,'info')"
        style="padding:6px 14px;font-size:12px;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;">
        🔍 View JSON
      </button>
    </div>`;

  if (groups.length === 0) {
    html += `<p style="color:#aaa;">No access information available.</p>`;
  }

  const totalAccessNodes = groups.reduce((acc, g) => acc + (g.NodeAccessInfo ? g.NodeAccessInfo.length : 0), 0);
  const MAX_ACCESS_NODES_PER_GROUP = totalAccessNodes > 500 ? 5 : (totalAccessNodes > 100 ? 10 : 50);

  groups.forEach(group => {
    const gid = group.NodeGroupId || 'default';
    const nodeList = group.NodeAccessInfo || [];
    const displayedNodeList = nodeList.slice(0, MAX_ACCESS_NODES_PER_GROUP);
    html += `
      <div style="background:#0d1420;border:1px solid #2a3a50;border-radius:6px;margin-bottom:12px;overflow:hidden;">
        <div style="background:#1a3050;padding:8px 12px;font-weight:bold;color:#61dafb;">
          📦 NodeGroup: ${esc(gid)} <span style="font-size:0.78em;color:#aaa;font-weight:normal;">(${nodeList.length} node(s))</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:0.80em;">
          <thead><tr style="background:#1a2535;color:#9ab;">
            <th style="padding:5px 10px;text-align:left;border-bottom:1px solid #2a3a50;">Node ID</th>
            <th style="padding:5px 10px;text-align:left;border-bottom:1px solid #2a3a50;">Public IP</th>
            <th style="padding:5px 10px;text-align:left;border-bottom:1px solid #2a3a50;">Private IP</th>
            <th style="padding:5px 10px;text-align:left;border-bottom:1px solid #2a3a50;">User</th>
            <th style="padding:5px 10px;text-align:left;border-bottom:1px solid #2a3a50;">Port</th>
            <th style="padding:5px 10px;text-align:left;border-bottom:1px solid #2a3a50;">SSH Command (click to copy)</th>
          </tr></thead>
          <tbody>`;
    displayedNodeList.forEach((nd, i) => {
      const bg = i % 2 === 0 ? '#0d1b2a' : '#0a1520';
      const user = nd.nodeUserName || 'cb-user'; // platform default when the key carries no account
      const port = nd.sshPort || 22;
      let sshCmd = '-';
      if (nd.publicIP) {
        sshCmd = `ssh -i ${pemFileFor(nd.nodeId)} -p ${port} ${user}@${nd.publicIP}`;
      } else if (nd.bastionPublicIp) {
        sshCmd = `ssh -J ${user}@${nd.bastionPublicIp}:${nd.bastionSshPort || 22} -i ${pemFileFor(nd.nodeId)} -p ${port} ${user}@${nd.privateIP}`;
      }
      const thisIdx = cmdIdx++;
      window._guiSshCommands.push(sshCmd);
      html += `
        <tr style="background:${bg};">
          <td style="padding:5px 10px;color:#dde;font-family:monospace;">${esc(nd.nodeId || '-')}</td>
          <td style="padding:5px 10px;color:#90ee90;font-family:monospace;">${esc(nd.publicIP || '-')}</td>
          <td style="padding:5px 10px;color:#87ceeb;font-family:monospace;">${esc(nd.privateIP || '-')}</td>
          <td style="padding:5px 10px;color:#ffd700;">${esc(user)}</td>
          <td style="padding:5px 10px;color:#aaa;">${esc(String(port))}</td>
          <td style="padding:5px 10px;">
            <code id="gui-ssh-cmd-${thisIdx}" onclick="copyGuiSshCommand(${thisIdx})"
              style="background:#1a1a2e;color:#98fb98;padding:2px 8px;border-radius:3px;font-size:0.88em;
                     cursor:pointer;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
                     max-width:320px;user-select:none;" title="${esc(sshCmd)} — click to copy">
              ${esc(sshCmd)}
            </code>
          </td>
        </tr>`;
    });
    if (nodeList.length > displayedNodeList.length) {
      const remaining = nodeList.length - displayedNodeList.length;
      html += `<tr style="background:#1a2535;"><td colspan="6" style="padding:6px 10px;text-align:center;color:#9ab;font-size:0.85em;">
        Showing first ${displayedNodeList.length} of ${nodeList.length} nodes (⚡ ${remaining} more nodes hidden for performance).
      </td></tr>`;
    }
    html += `</tbody></table></div>`;
  });
  html += `</div>`;

  Swal.fire({
    title: `🔑 Access Info${infraId ? ': ' + esc(infraId) : ''}`,
    html: html,
    background: '#0e1746',
    color: '#e0e0e0',
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '✕ Close',
    width: '88%',
  });
}

// Rich GUI for infraDynamic provisioning result (replaces raw JSON in proceedWithInfraCreation)
// Render post-deployment command outcome (postCommandStatus/postCommandResults).
// Bootstrap failures must be visible: infra creation can succeed while commands fail.
function buildPostCommandStatusHtml(data) {
  const esc = window.escapeHtml || (s => String(s));
  const status = data.postCommandStatus;
  if (!status || status === 'None') return '';

  const style = {
    Running:             { bg: '#eff6ff', border: '#93c5fd', fg: '#1d4ed8', icon: '⏳', label: 'Post-deployment commands are running in the background' },
    Completed:           { bg: '#f0fdf4', border: '#86efac', fg: '#15803d', icon: '✅', label: 'Post-deployment commands completed' },
    CompletedWithErrors: { bg: '#fffbeb', border: '#fcd34d', fg: '#b45309', icon: '⚠️', label: 'Post-deployment commands completed with errors' },
    Failed:              { bg: '#fef2f2', border: '#fca5a5', fg: '#b91c1c', icon: '❌', label: 'Post-deployment commands failed' },
    Skipped:             { bg: '#f8fafc', border: '#cbd5e1', fg: '#475569', icon: '⏭️', label: 'Post-deployment commands skipped' },
  }[status] || { bg: '#f8fafc', border: '#cbd5e1', fg: '#475569', icon: 'ℹ️', label: 'Post-deployment commands: ' + status };

  // Per-phase view when available, else the legacy single-result view
  const phases = data.postCommandResults || [];
  let detail = '';

  const failedLines = (results, prefix) => (results || [])
    .filter(r => r.error)
    .map(r => `<li style="margin:2px 0;"><b>${esc(r.nodeId)}</b>${prefix}: ${esc(r.error)}</li>`)
    .join('');

  if (phases.length > 0) {
    detail = phases.map(ph => {
      const lines = failedLines(ph.results && ph.results.results, '');
      const head = `phase ${ph.phase} (${esc(ph.target || 'all nodes')}) — ${esc(ph.status)}`;
      return `<li style="margin:3px 0;">${head}${lines ? `<ul style="margin:2px 0 0 14px;">${lines}</ul>` : ''}</li>`;
    }).join('');
    detail = `<ul style="margin:6px 0 0 16px;padding:0;font-size:12px;">${detail}</ul>`;
  }

  // Streaming/replay entry point. The event buffer is kept server-side for a while
  // after completion, so this also works for runs that already finished.
  if (data.postCommandRequestId) {
    window._postCmdStreamCtx = { infraId: data.id || data.name, xRequestId: data.postCommandRequestId };
    if (status === 'Running') {
      detail = `
      <div style="margin-top:6px;font-size:12px;color:#334155;">
        Nodes are ready and billing has started; bootstrap continues in the background.
        <div style="margin-top:6px;">
          <button type="button" onclick="watchPostCommandStream()"
            style="padding:5px 12px;font-size:12px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;">
            📡 Watch live output
          </button>
          <span style="color:#64748b;margin-left:8px;">or re-open this Infra later to see the result</span>
        </div>
      </div>`;
    } else {
      // Already finished: the per-node detail above is the result; offer the log view
      detail += `
      <div style="margin-top:6px;">
        <button type="button" onclick="watchPostCommandStream()"
          style="padding:4px 10px;font-size:12px;background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer;">
          📜 View command output
        </button>
      </div>`;
    }
  }

  return `
    <div style="background:${style.bg};border:1px solid ${style.border};border-left:4px solid ${style.fg};border-radius:8px;padding:10px 14px;margin-bottom:14px;">
      <p style="color:${style.fg};margin:0;font-weight:700;font-size:13px;">${style.icon} ${style.label}</p>
      ${detail}
    </div>`;
}

// Open the live streaming view for a background post-deployment run
window.watchPostCommandStream = function () {
  const ctx = window._postCmdStreamCtx;
  if (!ctx) return;
  const cfg = getConfig();
  const ns = window.configNamespace || cfg.namespace;
  const streamUrl = `${tbApiBase()}/ns/${ns}/stream/cmd/infra/${ctx.infraId}?xRequestId=${encodeURIComponent(ctx.xRequestId)}`;
  const spinnerId = addSpinnerTask(`Bootstrap: ${ctx.infraId}`);
  if (typeof window.startStreamingSession === 'function') {
    window.startStreamingSession(streamUrl, cfg.username, cfg.password, ctx.xRequestId, ctx.infraId, spinnerId, null, []);
  }
};

function displayInfraDynamicResultGui(data) {
  window._currentJsonOutput = data;
  window._currentJsonString = JSON.stringify(data, null, 2);
  const esc = window.escapeHtml || (s => String(s));
  const infraId = data.id || data.name || 'Infra';
  window._currentInfraId = infraId;
  const nodes = (window.getInfraNodes ? window.getInfraNodes(data) : null) || data.node || [];
  const runningCount = nodes.filter(nd => (nd.status || '').toLowerCase() === 'running').length;

  Swal.fire({
    title: `✅ Infra Created: ${esc(infraId)}`,
    html: `
      <div style="text-align:left;color:#0f172a;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;">
        <div style="background:#f0fdf4;border:1px solid #86efac;border-left:4px solid #16a34a;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
          <p style="color:#15803d;margin:0;font-weight:700;font-size:14px;">🎉 Infrastructure provisioning completed!</p>
          <p style="color:#64748b;margin:5px 0 0;font-size:12px;">
            ${runningCount} / ${nodes.length} node(s) running${data.description ? '  ·  ' + esc(data.description) : ''}
          </p>
        </div>
        ${buildPostCommandStatusHtml(data)}
        ${buildInfraNodeSummaryHtml(data)}
        <div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;flex-wrap:wrap;">
          <button type="button" onclick="downloadAllSshKeys(window._currentInfraId)"
            style="padding:7px 18px;font-size:13px;font-family:inherit;background:#16a34a;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;letter-spacing:0.01em;">
            📦 Download SSH Keys (ZIP)
          </button>
          <button type="button" onclick="displayJsonData(window._currentJsonOutput,'info')"
            style="padding:7px 14px;font-size:13px;font-family:inherit;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;">
            🔍 View JSON
          </button>
        </div>
      </div>`,
    background: '#ffffff',
    color: '#0f172a',
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '✕ Close',
    width: '90%',
  });
}

// Handle Infra without Nodes (preparing, prepared, empty states)
function handleInfraWithoutNodes(infraItem) {
  // Get current map extent to position Infras in upper-left area
  var mapView = map.getView();
  var mapExtent = mapView.calculateExtent(map.getSize());
  
  var leftBound = mapExtent[0];
  var rightBound = mapExtent[2];
  var bottomBound = mapExtent[1];
  var topBound = mapExtent[3];
  
  var defaultLon = leftBound + (rightBound - leftBound) * LOCATIONLESS_Infra_LEFT_OFFSET;
  var defaultLat = topBound - (topBound - bottomBound) * LOCATIONLESS_Infra_TOP_OFFSET;

  // If Infra has label with location info, try to extract it (optional override)
  if (infraItem.label && typeof infraItem.label === 'object') {
    if (infraItem.label.location) {
      var locParts = infraItem.label.location.split(',');
      if (locParts.length === 2) {
        var labelLat = parseFloat(locParts[0].trim());
        var labelLon = parseFloat(locParts[1].trim());
        if (!isNaN(labelLat) && !isNaN(labelLon)) {
          defaultLat = labelLat;
          defaultLon = labelLon;
        }
      }
    }
  }
  
  // Count existing locationless Infras for vertical stacking
  var verticalSpacing = (topBound - bottomBound) * LOCATIONLESS_Infra_VERTICAL_SPACING;
  var preparingInfraCount = 0;
  const renderMap = window.infraRenderMap || new window.Map();
  for (const [, data] of renderMap) {
    if (data.isLocationless) {
      preparingInfraCount++;
    }
  }
  defaultLat -= verticalSpacing * preparingInfraCount;
  
  // Keep the original Infra name/id (do NOT relabel "-nlb" to "NLB") so a Global
  // NLB host stays identifiable and operable as its own Infra on the map.
  var newName = infraItem.name;

  // Create Infra render entry and store in map
  var infraEntry = {
    id: infraItem.id,
    name: newName,
    status: infraItem.status,
    targetAction: (infraItem.targetAction && infraItem.targetAction !== "None" && infraItem.targetAction !== "") 
      ? infraItem.targetAction : null,
    geometry: new Point([defaultLon, defaultLat]),
    geometryPoints: null,
    geo: new Point([defaultLon, defaultLat]),
    isLocationless: true
  };
  renderMap.set(infraItem.id, infraEntry);
}

// ---------------------------------------------------------------------------
// External-request banner
// Displays transient pop-down cards when CB-TB handles requests from an agent
// via MCP (or background tasks). Polls CB-TB /requests?source=mcp every 3s.
// ---------------------------------------------------------------------------
const ACTIVITY_MAX = 6;                 // cards kept on screen
const ACTIVITY_MCP_LIFETIME_MS = 20000; // MCP event card auto-expire
const ACTIVITY_GUI_DONE_MS = 2500;      // GUI card lingers after it completes
const mcpBannerSeen = new Set();        // startTime+url, so an MCP request is shown once
const guiActivityCards = new window.Map(); // taskId -> live card

// Unified activity feed (top-right): API work in progress, whether triggered from
// the map GUI (source 'gui') or arriving from an agent via MCP (source 'mcp').
function activityFeedContainer() {
  let el = document.getElementById('activity-feed');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'activity-feed';
  el.style.cssText = [
    // Below swal2 popups (1060) so dialogs always show above the feed, above map controls (1000).
    'position:fixed', 'top:84px', 'right:16px', 'z-index:1050',
    'width:250px', 'display:flex', 'flex-direction:column', 'gap:6px',
    'pointer-events:none', 'font-family:system-ui,-apple-system,sans-serif',
  ].join(';');
  document.body.appendChild(el);

  if (!document.getElementById('af-keyframes')) {
    const style = document.createElement('style');
    style.id = 'af-keyframes';
    style.textContent = `
      @keyframes af-spin {
        to { transform: rotate(360deg); }
      }
      @keyframes af-shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(200%); }
      }
    `;
    document.head.appendChild(style);
  }
  return el;
}

// Destructive work should not look like everything else on the way past.
const ACTIVITY_METHOD_COLOR = { GET: '#9fb3c8', POST: '#61dafb', PUT: '#f0b429', DELETE: '#ff6b6b' };
const ACTIVITY_SRC = {
  mcp: { tag: 'MCP', badge: '#61dafb' },
  gui: { tag: 'GUI', badge: '#7fd6a0' },
};

// Build and mount a feed card. Returns the element so live (GUI) cards can be updated.
// opts: { source, method?, text, status, ok?, live? }
function activityCardAdd(opts) {
  const box = activityFeedContainer();
  const src = ACTIVITY_SRC[opts.source] || ACTIVITY_SRC.gui;
  const ok = opts.ok !== false;
  const accent = !ok ? '#ff6b6b'
    : (opts.method ? (ACTIVITY_METHOD_COLOR[opts.method] || src.badge) : src.badge);
  const card = document.createElement('div');
  card.style.cssText = [
    'position:relative', 'overflow:hidden',
    'background:rgba(13,27,42,.94)', 'border:1px solid ' + (ok ? '#2a5c8a' : '#8a2a2a'),
    'border-left:3px solid ' + accent,
    'border-radius:7px', 'padding:7px 9px 9px 9px', 'color:#e8eef6', 'font-size:11px',
    'box-shadow:0 3px 10px rgba(0,0,0,.4)', 'opacity:0',
    'transition:opacity .25s ease, transform .25s ease', 'transform:translateX(12px)',
  ].join(';');
  const statusColor = opts.live ? '#61dafb' : (ok ? '#7fd6a0' : '#ff9b9b');
  const spinnerHtml = opts.live
    ? `<span class="af-spinner" style="display:inline-block;width:7px;height:7px;border:1.5px solid ${statusColor};border-top-color:transparent;border-radius:50%;animation:af-spin .7s linear infinite;margin-right:4px;"></span>`
    : '';
  const progressBarHtml = opts.live
    ? `<div class="af-progress-bar" style="position:absolute;bottom:0;left:0;width:100%;height:2px;overflow:hidden;background:rgba(255,255,255,0.06);"><div style="width:50%;height:100%;background:linear-gradient(90deg, transparent, ${accent}, transparent);animation:af-shimmer 1.5s infinite ease-in-out;"></div></div>`
    : '';

  card.innerHTML =
    '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">' +
      '<span style="background:' + src.badge + ';color:#0d1b2a;font-weight:700;border-radius:4px;' +
      'padding:1px 6px;font-size:10px;letter-spacing:.04em;">' + src.tag + '</span>' +
      (opts.method ? '<span style="color:' + accent + ';font-weight:600;">' +
        window.escapeHtml(opts.method) + '</span>' : '') +
      '<span class="af-status" style="margin-left:auto;display:inline-flex;align-items:center;color:' + statusColor + ';font-size:10px;">' +
      spinnerHtml + '<span>' + window.escapeHtml(opts.status || '') + '</span></span>' +
    '</div>' +
    '<div style="color:#c3cfe2;word-break:break-all;line-height:1.35;">' +
      window.escapeHtml(opts.text || '') + '</div>' +
    progressBarHtml;
  box.appendChild(card);
  requestAnimationFrame(() => { card.style.opacity = '1'; card.style.transform = 'translateX(0)'; });
  while (box.children.length > ACTIVITY_MAX) box.removeChild(box.firstChild);
  return card;
}

function activityCardExpire(card, delay) {
  setTimeout(() => {
    card.style.opacity = '0';
    card.style.transform = 'translateX(12px)';
    setTimeout(() => card.remove(), 300);
  }, delay);
}

// Infer the HTTP method from a GUI action label so cards share the MCP feed's
// method colour language (POST/PUT/GET/DELETE) instead of a single flat colour.
// The label is all the spinner API gives us; this keeps call sites untouched.
function guiMethodFromLabel(label) {
  const s = String(label).toLowerCase();
  if (/delet|remov|purge|terminat|destroy|release/.test(s)) return 'DELETE';
  if (/updat|set |setting|reconcil|edit|modif|refresh|scale|bastion|attach|detach/.test(s)) return 'PUT';
  if (/load|list|fetch|check|review|extract|copy|get |getting|read/.test(s)) return 'GET';
  return 'POST'; // create/add/build/save/run/command/deploy default
}

// GUI: a user action started — live card that stays until the action ends.
// The card is tagged with its taskId so both the direct end path and the
// reconcile safety net can find and settle it.
function guiActivityStart(taskId, label) {
  const card = activityCardAdd({
    source: 'gui', method: guiMethodFromLabel(label), text: label, status: 'in progress', live: true,
  });
  card.dataset.taskId = taskId;
  card.dataset.live = '1';
  guiActivityCards.set(taskId, card);
}

// Settle a live GUI card to done/error, then fade it out. Idempotent.
function settleGuiCard(card, ok) {
  if (!card || card.dataset.live !== '1') return;
  card.dataset.live = '0';
  const bar = card.querySelector('.af-progress-bar');
  if (bar) bar.remove();
  const st = card.querySelector('.af-status');
  if (!ok) {
    if (st) {
      st.innerHTML = '<span style="margin-right:4px;">✕</span><span>error</span>';
      st.style.color = '#ff9b9b';
    }
    card.style.borderLeftColor = '#ff6b6b';
  } else {
    if (st) {
      st.innerHTML = '<span style="margin-right:4px;">✓</span><span>done</span>';
      st.style.color = '#7fd6a0';
    }
    card.style.borderLeftColor = '#7fd6a0';
  }
  activityCardExpire(card, ACTIVITY_GUI_DONE_MS);
}

// GUI: the action finished — settle its card.
function guiActivityEnd(taskId, ok) {
  const card = guiActivityCards.get(taskId);
  guiActivityCards.delete(taskId);
  settleGuiCard(card, ok);
}

// Safety net: settle any live GUI card whose task is no longer active in
// spinnerStack (the authoritative set). Guards against a completed task whose
// card was not settled by the direct end path. A still-running task stays in
// spinnerStack, so long operations (e.g. VPN create) keep their card correctly.
function reconcileGuiActivity() {
  const box = document.getElementById('activity-feed');
  if (!box) return;
  box.querySelectorAll('[data-task-id][data-live="1"]').forEach((card) => {
    if (!spinnerStack[card.dataset.taskId]) settleGuiCard(card, true);
  });
}
setInterval(reconcileGuiActivity, 3000);

// MCP: an agent-origin request observed in the TB request log (point-in-time event).
// Kept named mcpBannerAdd so pollExternalRequests is unchanged.
function mcpBannerAdd(entry) {
  const ok = String(entry.status).toLowerCase() !== 'error';
  const card = activityCardAdd({
    source: 'mcp',
    method: String(entry.method || '').toUpperCase(),
    text: entry.url,
    status: entry.status,
    ok,
  });
  activityCardExpire(card, ACTIVITY_MCP_LIFETIME_MS);
}

async function pollExternalRequests() {
  try {
    // The filters are not optional. Without them this endpoint returns every tracked
    // request with its full body and response - measured at 13.5 MB. source=mcp keeps
    // only agent-origin requests (GET included) and brief=true drops the bodies.
    const resp = await axios.get(`${tbApiBase()}/requests?source=mcp&time=2&brief=true`, {
      auth: { username: window.configUsername, password: window.configPassword }, timeout: 5000,
    }).catch(() => null);
    if (!resp) return;

    let items = resp.data?.requests ?? resp.data ?? [];
    if (!Array.isArray(items)) items = Object.values(items);

    items
      .filter((r) => {
        const h = r?.requestInfo?.header || {};
        return (h['X-Request-Source'] || h['x-request-source']) === 'mcp';
      })
      .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))
      .forEach((r) => {
        const info = r.requestInfo || {};
        const key = `${r.startTime}|${info.url}`;
        if (mcpBannerSeen.has(key)) return;
        mcpBannerSeen.add(key);
        if (mcpBannerSeen.size > 500) mcpBannerSeen.clear();  // bounded, order is not needed
        mcpBannerAdd({
          method: String(info.method || 'POST').toUpperCase(),
          url: String(info.url || '').replace(/^\/tumblebug/, ''),
          status: r.status || 'Handling',
        });
      });
  } catch (e) {
    // A demo aid must never interfere with the map it sits on.
  }
}


// Attach to window object for inter-module & UI invocation
window.outputAlert = outputAlert;
window.displayJsonData = displayJsonData;
window.getInfraStatusBadge = getInfraStatusBadge;
window.buildInfraNodeSummaryHtml = buildInfraNodeSummaryHtml;
window.displayInfraStatusGui = displayInfraStatusGui;
window.retryClassStyle = retryClassStyle;
window.reviewRetryFailedNodes = reviewRetryFailedNodes;
window.fixAndReplaceNodeGroup = fixAndReplaceNodeGroup;
window.applySiblingZones = applySiblingZones;
window.executeRetryFailedNodes = executeRetryFailedNodes;
window.displayAccessInfoGui = displayAccessInfoGui;
window.buildPostCommandStatusHtml = buildPostCommandStatusHtml;
window.displayInfraDynamicResultGui = displayInfraDynamicResultGui;
window.handleInfraWithoutNodes = handleInfraWithoutNodes;
window.activityFeedContainer = activityFeedContainer;
window.activityCardAdd = activityCardAdd;
window.activityCardExpire = activityCardExpire;
window.guiActivityStart = guiActivityStart;
window.guiActivityEnd = guiActivityEnd;
window.mcpBannerAdd = mcpBannerAdd;
window.pollExternalRequests = pollExternalRequests;
