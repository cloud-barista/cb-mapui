/**
 * Security Group & Firewall Rules Feature Module
 * @module features/security-group
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import { tbApiBase, getConfig } from '../../core/api.js';
import { escapeHtml } from '../../core/utils.js';

const addSpinnerTask = (name) => (window.addSpinnerTask ? window.addSpinnerTask(name) : name);
const removeSpinnerTask = (id) => { if (window.removeSpinnerTask) window.removeSpinnerTask(id); };
const errorAlert = (msg) => (window.errorAlert ? window.errorAlert(msg) : Swal.fire({ icon: 'error', title: msg, showConfirmButton: true }));
const successAlert = (msg) => (window.successAlert ? window.successAlert(msg) : Swal.fire({ icon: 'success', title: msg, showConfirmButton: false, timer: 2500 }));
const getNodeGroupIdFromNodeSelection = () => (window.getNodeGroupIdFromNodeSelection ? window.getNodeGroupIdFromNodeSelection() : '');

function _getAppPortPresets() {
  if (Array.isArray(window.APP_PORT_PRESETS) && window.APP_PORT_PRESETS.length > 0) {
    return window.APP_PORT_PRESETS;
  }
  return [
    { id: 'vllm', group: 'LLM & AI Agents', label: 'vLLM OpenAI API (TCP 8000)', rules: [{ Direction: 'inbound', Protocol: 'TCP', Ports: '8000' }] },
    { id: 'ollama-webui', group: 'LLM & AI Agents', label: 'Ollama + Open WebUI (TCP 80, 3000)', rules: [{ Direction: 'inbound', Protocol: 'TCP', Ports: '80' }, { Direction: 'inbound', Protocol: 'TCP', Ports: '3000' }] },
    { id: 'k8s-cp', group: 'Kubernetes & KServe', label: 'Kubernetes API Server (TCP 6443)', rules: [{ Direction: 'inbound', Protocol: 'TCP', Ports: '6443' }] },
    { id: 'web-http-https', group: 'Platform, OpenStack & Apps', label: 'Web Server HTTP/HTTPS (TCP 80, 443)', rules: [{ Direction: 'inbound', Protocol: 'TCP', Ports: '80' }, { Direction: 'inbound', Protocol: 'TCP', Ports: '443' }] }
  ];
}

function _validateCidr(cidr) {
  if (typeof window.isValidCidrNotation === 'function') return window.isValidCidrNotation(cidr);
  const s = String(cidr || '').trim();
  return /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(s) || (s.includes(':') && /\/\d{1,3}$/.test(s));
}

function _populateAppPresetSelect(selectEl, placeholderText) {
  selectEl.replaceChildren();
  const defOpt = document.createElement('option');
  defOpt.value = '';
  defOpt.textContent = placeholderText || '-- Select an application port preset --';
  selectEl.appendChild(defOpt);

  const presets = _getAppPortPresets();
  const byGroup = new Map();
  presets.forEach((p, idx) => {
    const g = p.group || 'Applications';
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push({ preset: p, idx });
  });

  byGroup.forEach((items, groupName) => {
    const og = document.createElement('optgroup');
    og.label = groupName;
    items.forEach(({ preset, idx }) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = preset.label;
      og.appendChild(opt);
    });
    selectEl.appendChild(og);
  });
}

function _sgHasExactRule(sg, dir, proto, portSpec, cidr) {
  const rules = Array.isArray(sg && sg.firewallRules) ? sg.firewallRules : [];
  const d = String(dir || 'inbound').toLowerCase();
  const p = String(proto || 'TCP').toUpperCase();
  const pt = String(portSpec || '').trim();
  const c = String(cidr || '0.0.0.0/0').trim();
  return rules.some((r) =>
    String(r.Direction || r.direction || '').toLowerCase() === d &&
    String(r.Protocol || r.protocol || '').toUpperCase() === p &&
    String(r.Port ?? r.port ?? r.Ports ?? '').trim() === pt &&
    String(r.CIDR || r.cidr || '').trim() === c
  );
}

function updateFirewallRules(opts) {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var nsId = config.namespace || window.configNamespace || '';
  // opts.infraId / opts.preselectSgId let callers (e.g. the Net-graph SG group
  // right-click) target a specific Infra and pre-open that SG's tab.
  var infraId = (opts && opts.infraId) || (window.infraidElement ? window.infraidElement.value : (document.getElementById("infraid")?.value || ''));
  var preselectSgId = (opts && opts.preselectSgId) || '';
  window._lastManagedSgContext = { infraId, preselectSgId };
  var nodegroupid = getNodeGroupIdFromNodeSelection();
  var nodeid = document.getElementById("nodeid")?.value || '';

  if (!nsId) {
    errorAlert("Please select a namespace first");
    return;
  }
  if (!infraId) {
    errorAlert("Please select an Infra first");
    return;
  }

  const assocUrl = `${tbApiBase()}/ns/${nsId}/infra/${infraId}/associatedResources`;
  axios({
    method: "get",
    url: assocUrl,
    auth: { username, password },
  }).then((assocRes) => {
    const sgIds = (assocRes.data?.securityGroupIds || []);
    if (sgIds.length === 0) {
      errorAlert("No associated Security Groups found for this Infra.");
      return;
    }

    Promise.all(sgIds.map(sgId =>
      axios({
        method: "get",
        url: `${tbApiBase()}/ns/${nsId}/resources/securityGroup/${sgId}`,
        auth: { username, password },
      }).then(res => res.data)
    )).then((sgList) => {

      // Pre-select the tab for the requested SG (default: first).
      const activeIdx = Math.max(0, sgList.findIndex(sg => sg.id === preselectSgId || sg.name === preselectSgId));

      let summaryHtml = `
        <div style="margin-bottom:8px; font-size:12px; color:#444;">
          <b style="font-size:13px;">Security Group Rule Summary</b>
          <div style="margin-top: 10px;">
            <!-- Tab Navigation -->
            <ul class="nav nav-tabs" id="sgTabs" role="tablist" style="margin-bottom: 15px; border-bottom: 2px solid #dee2e6;">
              ${sgList.map((sg, idx) => `
                <li class="nav-item" role="presentation">
                  <button class="nav-link ${idx === activeIdx ? 'active' : ''}" id="sg-tab-${idx}" data-bs-toggle="tab" data-bs-target="#sg-content-${idx}" type="button" role="tab" aria-controls="sg-content-${idx}" aria-selected="${idx === activeIdx}"
                          style="border: none; border-bottom: 3px solid transparent; padding: 10px 15px; margin-right: 5px; background: none; color: #6c757d; font-weight: 500; transition: all 0.3s ease; ${idx === activeIdx ? 'color: #007bff; border-bottom-color: #007bff;' : ''}"
                          onmouseover="if(!this.classList.contains('active')) { this.style.color='#007bff'; this.style.backgroundColor='#f8f9fa'; }"
                          onmouseout="if(!this.classList.contains('active')) { this.style.color='#6c757d'; this.style.backgroundColor='transparent'; }">
                    <span style="font-size: 12px; font-weight: 600;">${sg.name}</span>
                    <span style="margin-left: 6px; background-color: ${idx === activeIdx ? '#007bff' : '#6c757d'}; color: white; font-size: 9px; padding: 2px 6px; border-radius: 10px; font-weight: bold;">${(sg.firewallRules||[]).length}</span>
                  </button>
                </li>
              `).join("")}
            </ul>
            
            <!-- Tab Content -->
            <div class="tab-content" id="sgTabContent">
              ${sgList.map((sg, idx) => `
                <div class="tab-pane fade ${idx === activeIdx ? 'show active' : ''}" id="sg-content-${idx}" role="tabpanel" aria-labelledby="sg-tab-${idx}">
                  <div style="border: 1px solid #dee2e6; border-radius: 6px; padding: 15px; background-color: #f8f9fa;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                      <div>
                        <h6 style="margin: 0; color: #495057; font-weight: 600;">${sg.name}</h6>
                        <small style="color: #6c757d;">Security Group ID: <code>${sg.id}</code></small>
                      </div>
                      <button class="btn btn-success btn-sm" onclick="addNewRuleToSg('${sg.id}', '${sg.name}')" style="font-size: 11px; padding: 4px 8px;">
                        <span style="margin-right: 3px;">+</span>Add Rule
                      </button>
                    </div>
                    
                    <div style="background: white; border-radius: 4px; overflow: hidden; border: 1px solid #dee2e6;">
                      ${(sg.firewallRules||[]).length > 0 ? `
                        <table class="table table-sm table-hover" style="margin-bottom: 0; font-size: 12px;">
                          <thead style="background-color: #e9ecef;">
                            <tr>
                              <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Direction</th>
                              <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Protocol</th>
                              <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Port</th>
                              <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">CIDR</th>
                              <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6; text-align: center; width: 80px;">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${sg.firewallRules.map((rule, ruleIdx) => `
                              <tr style="transition: background-color 0.2s;">
                                <td style="padding: 8px; vertical-align: middle;">
                                  <span style="font-size: 9px; padding: 3px 8px; border-radius: 12px; font-weight: 600; color: white; background-color: ${rule.Direction === 'inbound' || (rule.direction && rule.direction.toLowerCase() === 'inbound') ? '#28a745' : '#6c757d'};">
                                    ${(rule.Direction || rule.direction || "").toUpperCase()}
                                  </span>
                                </td>
                                <td style="padding: 8px; vertical-align: middle;">
                                  <code style="background-color: #f8f9fa; padding: 2px 4px; border-radius: 3px; font-size: 10px;">
                                    ${(rule.Protocol || rule.protocol || "").toUpperCase()}
                                  </code>
                                </td>
                                <td style="padding: 8px; vertical-align: middle; font-family: monospace;">
                                  ${rule.Port || rule.port || ""}
                                </td>
                                <td style="padding: 8px; vertical-align: middle; font-family: monospace; color: #6c757d;">
                                  ${rule.CIDR || rule.cidr || ""}
                                </td>
                                <td style="padding: 8px; text-align: center; vertical-align: middle;">
                                  <button class="btn btn-outline-danger btn-xs" onclick="deleteFirewallRule('${sg.id}', '${sg.name}', '${encodeURIComponent(JSON.stringify(rule))}')" 
                                          style="font-size: 9px; padding: 2px 6px; border-radius: 3px;"
                                          title="Delete this rule">
                                    🗑️
                                  </button>
                                </td>
                              </tr>
                            `).join("")}
                          </tbody>
                        </table>
                      ` : `
                        <div style="padding: 20px; text-align: center; color: #6c757d;">
                          <div style="font-size: 24px; margin-bottom: 8px;">🔒</div>
                          <div style="font-weight: 500; margin-bottom: 4px;">No firewall rules defined</div>
                          <div style="font-size: 11px;">Click "Add Rule" to create your first rule</div>
                        </div>
                      `}
                    </div>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      `;

      let firstRule = null;
      if (sgList.length > 0 && (sgList[0].firewallRules || []).length > 0) {
        firstRule = sgList[0].firewallRules[0];
      }

      let rulesHtml = `
        <div style="background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border: 1px solid #dee2e6;">
          <div style="background: #343a40; color: white; padding: 12px; font-weight: bold; display: flex; justify-content: space-between; align-items: center;">
            <span>
              <span style="margin-right: 8px;">🔧</span>
              Apply Same Rules to All Security Groups
            </span>
            <button class="btn btn-success btn-sm" onclick="addRuleRowAll()" style="font-size: 11px; padding: 4px 8px; background-color: #28a745; border: none;">
              <span style="margin-right: 3px;">+</span>Add Rule
            </button>
          </div>
          <div style="padding: 15px; background-color: #f8f9fa;">
            <div style="margin-bottom: 10px; font-size: 12px; color: #6c757d;">
              <strong>Note:</strong> These rules will be applied to all Security Groups associated with this Infra, replacing existing rules.
            </div>
            <div style="background: white; border-radius: 4px; overflow: hidden; border: 1px solid #dee2e6;">
              <table class="table table-sm table-hover" style="margin-bottom: 0; font-size: 12px;">
                <thead style="background-color: #e9ecef;">
                  <tr>
                    <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Direction</th>
                    <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Protocol</th>
                    <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Ports</th>
                    <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">CIDR</th>
                    <th style="padding: 8px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6; text-align: center; width: 80px;">Actions</th>
                  </tr>
                </thead>
                <tbody id="sg-rules-all" style="background: white;">
                </tbody>
              </table>
              <div id="sg-rules-all-empty" style="padding: 20px; text-align: center; color: #6c757d; display: block;">
                <div style="font-size: 24px; margin-bottom: 8px;">📝</div>
                <div style="font-weight: 500; margin-bottom: 4px;">No rules defined yet</div>
                <div style="font-size: 11px;">Click "Add Rule" to create your first rule</div>
              </div>
            </div>
          </div>
        </div>
      `;


      const presetRules = [
        { direction: "inbound", protocol: "TCP", port: "22", cidr: "0.0.0.0/0", label: "SSH (22)" },
        { direction: "inbound", protocol: "TCP", port: "80", cidr: "0.0.0.0/0", label: "HTTP (80)" },
        { direction: "inbound", protocol: "TCP", port: "443", cidr: "0.0.0.0/0", label: "HTTPS (443)" },
        { direction: "inbound", protocol: "TCP", port: "1-65535", cidr: "0.0.0.0/0", label: "All TCP Ports" },
        { direction: "inbound", protocol: "UDP", port: "1-65535", cidr: "0.0.0.0/0", label: "All UDP Ports" },
        { direction: "inbound", protocol: "ICMP", port: "", cidr: "0.0.0.0/0", label: "ICMP" },
        { direction: "inbound", protocol: "ALL", port: "", cidr: "0.0.0.0/0", label: "All Protocols" },
        // Outbound presets. This dialog REPLACES every rule on the selected security
        // groups, so a rule set with no outbound entry removes egress entirely. On
        // clouds that deny egress by default when a security group carries no egress
        // rule (OpenStack/Neutron), that silently cuts the node off: inbound SSH keeps
        // working because the groups are stateful, and the loss only surfaces later as
        // DNS or download failures from the node.
        { direction: "outbound", protocol: "ALL", port: "", cidr: "0.0.0.0/0", label: "↗ All Outbound" },
        { direction: "outbound", protocol: "TCP", port: "1-65535", cidr: "0.0.0.0/0", label: "↗ Outbound TCP" },
        { direction: "outbound", protocol: "UDP", port: "1-65535", cidr: "0.0.0.0/0", label: "↗ Outbound UDP" },
      ];
      // Index of the "all outbound" preset, used to seed the editor below.
      const outboundAllPresetIdx = presetRules.findIndex(
        (p) => p.direction === "outbound" && p.protocol === "ALL"
      );
      let presetHtml = presetRules.map((p, i) =>
        `<button class="btn btn-outline-secondary btn-sm" style="margin:3px; font-size:11px; padding:4px 8px; border-radius:4px;" onclick="insertPresetRule(${i})">${p.label}</button>`
      ).join("");

      Swal.fire({
        title: "Update Security Group Rules",
        html: `
          <div>
            ${summaryHtml}
            <div id="sgAppPresetsContainer" style="margin: 15px 0;"></div>
            <div style="margin: 15px 0; padding: 12px; background: #e8f4fd; border-radius: 6px; border-left: 4px solid #0066cc;">
              <div style="font-weight: 600; color: #0066cc; margin-bottom: 8px; font-size: 13px;">📋 Frequently Used Rules</div>
              <div>${presetHtml}</div>
            </div>
            <div style="max-height:400px;overflow:auto;">${rulesHtml}</div>
          </div>
        `,
        width: 1200,
        showCancelButton: true,
        confirmButtonText: "Apply",
        cancelButtonText: "Cancel",
        didOpen: () => {
          // Initialize Bootstrap tabs functionality for Security Groups
          const tabButtons = document.querySelectorAll('#sgTabs button[data-bs-toggle="tab"]');
          tabButtons.forEach(button => {
            button.addEventListener('click', function (e) {
              e.preventDefault();
              
              // Remove active class from all tabs and content
              tabButtons.forEach(btn => {
                btn.classList.remove('active');
                btn.style.color = '#6c757d';
                btn.style.borderBottomColor = 'transparent';
                btn.style.backgroundColor = 'transparent';
                // Update badge color
                const badge = btn.querySelector('span:last-child');
                if (badge) badge.style.backgroundColor = '#6c757d';
              });
              // Scope to THIS modal's tab content only — a bare '.tab-pane'
              // selector also matched the map's left Control/Provisioning panes
              // (they are Bootstrap tab-panes too), wiping the Control panel.
              document.querySelectorAll('#sgTabContent .tab-pane').forEach(pane => {
                pane.classList.remove('show', 'active');
              });
              
              // Add active class to clicked tab
              this.classList.add('active');
              this.style.color = '#007bff';
              this.style.borderBottomColor = '#007bff';
              this.style.backgroundColor = 'transparent';
              // Update badge color for active tab
              const activeBadge = this.querySelector('span:last-child');
              if (activeBadge) activeBadge.style.backgroundColor = '#007bff';
              
              // Show corresponding content
              const target = this.getAttribute('data-bs-target');
              const targetPane = document.querySelector(target);
              if (targetPane) {
                targetPane.classList.add('show', 'active');
              }
            });
          });
          
          window.addRuleRowAll = function () {
            const tbody = document.getElementById("sg-rules-all");
            const emptyDiv = document.getElementById("sg-rules-all-empty");
            
            // Hide empty state message when adding first rule
            if (emptyDiv && tbody.rows.length === 0) {
              emptyDiv.style.display = 'none';
            }
            
            let def = { direction: "inbound", protocol: "TCP", ports: "", cidr: "" };
            if (firstRule) {
              def.direction = firstRule.Direction || firstRule.direction || "inbound";
              def.protocol = (firstRule.Protocol || firstRule.protocol || "TCP").toUpperCase();
              def.ports = firstRule.Ports || firstRule.port || "";
              def.cidr = firstRule.CIDR || firstRule.cidr || "";
            }
            const row = document.createElement("tr");
            row.style.transition = "background-color 0.2s";
            row.innerHTML = `
              <td style="padding: 8px; vertical-align: middle;">
                <select class="form-control" name="direction" style="font-size: 11px; padding: 4px;">
                  <option value="inbound" ${def.direction === "inbound" ? "selected" : ""}>Inbound</option>
                  <option value="outbound" ${def.direction === "outbound" ? "selected" : ""}>Outbound</option>
                </select>
              </td>
              <td style="padding: 8px; vertical-align: middle;">
                <select class="form-control" name="protocol" style="font-size: 11px; padding: 4px;" onchange="togglePortField(this)">
                  <option value="TCP" ${def.protocol === "TCP" ? "selected" : ""}>TCP</option>
                  <option value="UDP" ${def.protocol === "UDP" ? "selected" : ""}>UDP</option>
                  <option value="ICMP" ${def.protocol === "ICMP" ? "selected" : ""}>ICMP</option>
                  <option value="ALL" ${def.protocol === "ALL" ? "selected" : ""}>ALL</option>
                </select>
              </td>
              <td style="padding: 8px; vertical-align: middle;">
                <input type="text" class="form-control" name="Ports" placeholder="ex: 22,80,1000-2000" value="${def.ports}" style="font-size: 11px; padding: 4px; font-family: monospace;">
              </td>
              <td style="padding: 8px; vertical-align: middle;">
                <input type="text" class="form-control" name="cidr" value="${def.cidr}" placeholder="ex: 0.0.0.0/0" style="font-size: 11px; padding: 4px; font-family: monospace;">
              </td>
              <td style="padding: 8px; text-align: center; vertical-align: middle;">
                <button class="btn btn-outline-danger btn-xs" onclick="removeRuleRowAll(this)" style="font-size: 9px; padding: 2px 6px; border-radius: 3px;" title="Delete this rule">
                  🗑️
                </button>
              </td>
            `;
            tbody.appendChild(row);
            
            // Check initial protocol and disable port field if needed
            const protocolSelect = row.querySelector('select[name="protocol"]');
            const portInput = row.querySelector('input[name="Ports"]');
            if (protocolSelect.value === "ICMP" || protocolSelect.value === "ALL") {
              portInput.disabled = true;
              portInput.value = "";
              portInput.placeholder = "Not applicable for " + protocolSelect.value;
              portInput.style.backgroundColor = "#f8f9fa";
            }
          };
          
          // Add remove function for rules
          window.removeRuleRowAll = function(button) {
            const row = button.closest('tr');
            const tbody = document.getElementById("sg-rules-all");
            const emptyDiv = document.getElementById("sg-rules-all-empty");
            
            row.remove();
            
            // Show empty state message if no rules left
            if (emptyDiv && tbody.rows.length === 0) {
              emptyDiv.style.display = 'block';
            }
          };
          
          // Function to toggle port field based on protocol selection
          window.togglePortField = function(protocolSelect) {
            const row = protocolSelect.closest('tr');
            const portInput = row.querySelector('input[name="Ports"]');
            const protocol = protocolSelect.value;
            
            if (protocol === "ICMP" || protocol === "ALL") {
              portInput.disabled = true;
              portInput.value = "";
              portInput.placeholder = "Not applicable for " + protocol;
              portInput.style.backgroundColor = "#f8f9fa";
              portInput.style.color = "#6c757d";
            } else {
              portInput.disabled = false;
              portInput.placeholder = "ex: 22,80,1000-2000";
              portInput.style.backgroundColor = "";
              portInput.style.color = "";
            }
          };
          
          window.insertPresetRule = function (presetIdx) {
            const p = presetRules[presetIdx];
            const tbody = document.getElementById("sg-rules-all");
            const emptyDiv = document.getElementById("sg-rules-all-empty");
            
            // Hide empty state message when adding first rule
            if (emptyDiv && tbody.rows.length === 0) {
              emptyDiv.style.display = 'none';
            }
            
            let def = { direction: "inbound", protocol: "TCP" };
            if (firstRule) {
              def.direction = firstRule.Direction || firstRule.direction || "inbound";
              def.protocol = (firstRule.Protocol || firstRule.protocol || "TCP").toUpperCase();
            }
            const row = document.createElement("tr");
            row.style.transition = "background-color 0.2s";
            row.innerHTML = `
              <td style="padding: 8px; vertical-align: middle;">
                <select class="form-control" name="direction" style="font-size: 11px; padding: 4px;">
                  <option value="inbound" ${p.direction === "inbound" ? "selected" : ""}>Inbound</option>
                  <option value="outbound" ${p.direction === "outbound" ? "selected" : ""}>Outbound</option>
                </select>
              </td>
              <td style="padding: 8px; vertical-align: middle;">
                <select class="form-control" name="protocol" style="font-size: 11px; padding: 4px;" onchange="togglePortField(this)">
                  <option value="TCP" ${p.protocol === "TCP" ? "selected" : ""}>TCP</option>
                  <option value="UDP" ${p.protocol === "UDP" ? "selected" : ""}>UDP</option>
                  <option value="ICMP" ${p.protocol === "ICMP" ? "selected" : ""}>ICMP</option>
                  <option value="ALL" ${p.protocol === "ALL" ? "selected" : ""}>ALL</option>
                </select>
              </td>
              <td style="padding: 8px; vertical-align: middle;">
                <input type="text" class="form-control" name="Ports" placeholder="ex: 22,80,1000-2000" value="${p.port}" style="font-size: 11px; padding: 4px; font-family: monospace;">
              </td>
              <td style="padding: 8px; vertical-align: middle;">
                <input type="text" class="form-control" name="cidr" value="${p.cidr}" style="font-size: 11px; padding: 4px; font-family: monospace;">
              </td>
              <td style="padding: 8px; text-align: center; vertical-align: middle;">
                <button class="btn btn-outline-danger btn-xs" onclick="removeRuleRowAll(this)" style="font-size: 9px; padding: 2px 6px; border-radius: 3px;" title="Delete this rule">
                  🗑️
                </button>
              </td>
            `;
            tbody.appendChild(row);
            
            // Check protocol and disable port field if needed
            const protocolSelect = row.querySelector('select[name="protocol"]');
            const portInput = row.querySelector('input[name="Ports"]');
            if (protocolSelect.value === "ICMP" || protocolSelect.value === "ALL") {
              portInput.disabled = true;
              portInput.value = "";
              portInput.placeholder = "Not applicable for " + protocolSelect.value;
              portInput.style.backgroundColor = "#f8f9fa";
            }
          };

          // Start the editor with egress already allowed. Since applying replaces the
          // whole rule set, an editor that starts empty makes "add the inbound ports I
          // need" quietly drop outbound access. Seeding it keeps the common case safe;
          // the row can still be deleted for a deliberately egress-restricted group.
          if (outboundAllPresetIdx >= 0) {
            window.insertPresetRule(outboundAllPresetIdx);
          }

          // Build 🚀 Application Port Presets bar programmatically (non-destructive additive or bulk insert)
          const appPresetContainer = document.getElementById('sgAppPresetsContainer');
          if (appPresetContainer) {
            const box = document.createElement('div');
            box.style.cssText = 'padding:12px; background:#f3fbf5; border-radius:6px; border-left:4px solid #198754; text-align:left;';

            const heading = document.createElement('div');
            heading.style.cssText = 'font-weight:600; color:#0f5132; margin-bottom:8px; font-size:13px;';
            heading.textContent = '🚀 Application Port Presets (vLLM, Ollama, K8s, KServe, MCP, Ray, Monitoring, OpenStack, M-CMP…)';
            box.appendChild(heading);

            const controlsRow = document.createElement('div');
            controlsRow.style.cssText = 'display:flex; flex-wrap:wrap; align-items:flex-end; gap:10px;';

            const appField = document.createElement('div');
            appField.style.cssText = 'display:flex; flex-direction:column; gap:3px; flex:2; min-width:260px;';
            const appLabel = document.createElement('label');
            appLabel.setAttribute('for', 'sgAppPresetSelect');
            appLabel.style.cssText = 'font-size:11px; font-weight:600; color:#333; margin:0;';
            appLabel.textContent = 'Application Preset';
            const appSelect = document.createElement('select');
            appSelect.id = 'sgAppPresetSelect';
            appSelect.name = 'sgAppPresetSelect';
            appSelect.className = 'form-control';
            appSelect.style.cssText = 'font-size:12px; padding:4px 8px; height:auto;';
            _populateAppPresetSelect(appSelect, '-- Select an application --');
            appField.appendChild(appLabel);
            appField.appendChild(appSelect);
            controlsRow.appendChild(appField);

            const cidrField = document.createElement('div');
            cidrField.style.cssText = 'display:flex; flex-direction:column; gap:3px;';
            const cidrLabel = document.createElement('label');
            cidrLabel.setAttribute('for', 'sgAppPresetCidr');
            cidrLabel.style.cssText = 'font-size:11px; font-weight:600; color:#333; margin:0;';
            cidrLabel.textContent = 'Allowed Source CIDR';
            const cidrRow = document.createElement('div');
            cidrRow.style.cssText = 'display:flex; align-items:center; gap:5px;';
            const cidrInput = document.createElement('input');
            cidrInput.type = 'text';
            cidrInput.id = 'sgAppPresetCidr';
            cidrInput.name = 'sgAppPresetCidr';
            cidrInput.value = '0.0.0.0/0';
            cidrInput.setAttribute('autocorrect', 'off');
            cidrInput.setAttribute('autocapitalize', 'none');
            cidrInput.setAttribute('spellcheck', 'false');
            cidrInput.className = 'form-control';
            cidrInput.style.cssText = 'width:155px; font-size:12px; padding:4px 8px; height:auto; font-family:monospace;';
            cidrInput.addEventListener('input', () => {
              if (cidrInput.getAttribute('aria-invalid') === 'true' && _validateCidr(cidrInput.value)) {
                cidrInput.removeAttribute('aria-invalid');
                cidrInput.style.borderColor = '';
              }
            });

            const myIpBtn = document.createElement('button');
            myIpBtn.type = 'button';
            myIpBtn.className = 'btn btn-outline-primary btn-sm';
            myIpBtn.style.cssText = 'font-size:11px; padding:4px 8px; white-space:nowrap;';
            myIpBtn.textContent = '📍 My IP (/32)';
            myIpBtn.addEventListener('click', async () => {
              if (typeof window.detectClientPublicCidr !== 'function') return;
              myIpBtn.disabled = true;
              const detected = await window.detectClientPublicCidr();
              myIpBtn.disabled = false;
              const statusEl = document.getElementById('sgAppPresetLiveStatus');
              if (detected) {
                cidrInput.value = detected;
                cidrInput.removeAttribute('aria-invalid');
                cidrInput.style.borderColor = '';
                if (statusEl) statusEl.textContent = `✓ Set Allowed Source CIDR to ${detected}.`;
              } else if (statusEl) {
                statusEl.textContent = '⚠ Could not auto-detect public IP; enter x.x.x.x/32 manually.';
              }
            });

            cidrRow.appendChild(cidrInput);
            cidrRow.appendChild(myIpBtn);
            cidrField.appendChild(cidrLabel);
            cidrField.appendChild(cidrRow);
            controlsRow.appendChild(cidrField);

            const btnsWrap = document.createElement('div');
            btnsWrap.style.cssText = 'display:flex; flex-wrap:wrap; align-items:center; gap:6px;';

            const addAdditiveBtn = document.createElement('button');
            addAdditiveBtn.type = 'button';
            addAdditiveBtn.className = 'btn btn-success btn-sm';
            addAdditiveBtn.style.cssText = 'font-size:11px; font-weight:600; padding:5px 10px; white-space:nowrap;';
            addAdditiveBtn.textContent = '➕ Add Missing Ports to Infra SGs (Keep Existing)';

            const insertBulkBtn = document.createElement('button');
            insertBulkBtn.type = 'button';
            insertBulkBtn.className = 'btn btn-outline-secondary btn-sm';
            insertBulkBtn.style.cssText = 'font-size:11px; padding:5px 10px; white-space:nowrap;';
            insertBulkBtn.textContent = '📝 Insert into Bulk Table';

            btnsWrap.appendChild(addAdditiveBtn);
            btnsWrap.appendChild(insertBulkBtn);
            controlsRow.appendChild(btnsWrap);
            box.appendChild(controlsRow);

            const hintLine = document.createElement('div');
            hintLine.style.cssText = 'font-size:11px; color:#555; margin-top:6px;';
            hintLine.textContent = 'Tip: "Add Missing Ports to Infra SGs" safely appends only missing rules via POST /rules while preserving SSH (22) and outbound rules.';
            box.appendChild(hintLine);

            const statusRow = document.createElement('div');
            statusRow.style.cssText = 'display:flex; align-items:center; gap:8px; margin-top:5px;';
            const liveStatus = document.createElement('div');
            liveStatus.id = 'sgAppPresetLiveStatus';
            liveStatus.setAttribute('role', 'status');
            liveStatus.setAttribute('aria-live', 'polite');
            liveStatus.style.cssText = 'font-size:11px; font-weight:600; color:#0f5132;';
            statusRow.appendChild(liveStatus);
            box.appendChild(statusRow);

            appSelect.addEventListener('change', () => {
              const presets = _getAppPortPresets();
              const p = presets[Number(appSelect.value)];
              if (p && p.restrictCidrRecommended) {
                hintLine.textContent = '⚠ Security note: this application exposes an unauthenticated dashboard/API — click "📍 My IP (/32)" before opening ports.';
                hintLine.style.color = '#664d03';
              } else {
                hintLine.textContent = 'Tip: "Add Missing Ports to Infra SGs" safely appends only missing rules via POST /rules while preserving SSH (22) and outbound rules.';
                hintLine.style.color = '#555';
              }
            });

            insertBulkBtn.addEventListener('click', () => {
              const presets = _getAppPortPresets();
              const p = presets[Number(appSelect.value)];
              if (!p) {
                liveStatus.style.color = '#842029';
                liveStatus.textContent = '⚠ Select an Application Preset first.';
                appSelect.focus();
                return;
              }
              const cidrVal = cidrInput.value.trim();
              if (!_validateCidr(cidrVal)) {
                cidrInput.setAttribute('aria-invalid', 'true');
                cidrInput.style.borderColor = '#dc3545';
                liveStatus.style.color = '#842029';
                liveStatus.textContent = '⚠ Enter a valid CIDR (e.g. 203.0.113.10/32 or 0.0.0.0/0).';
                cidrInput.focus();
                return;
              }
              const tbody = document.getElementById('sg-rules-all');
              const emptyDiv = document.getElementById('sg-rules-all-empty');
              if (!tbody) return;
              if (emptyDiv) emptyDiv.style.display = 'none';

              (p.rules || []).forEach((r) => {
                window.addRuleRowAll();
                const lastRow = tbody.rows[tbody.rows.length - 1];
                if (!lastRow) return;
                const dirSel = lastRow.querySelector('select[name="direction"]');
                const protoSel = lastRow.querySelector('select[name="protocol"]');
                const portInp = lastRow.querySelector('input[name="Ports"]');
                const cidrInp = lastRow.querySelector('input[name="cidr"]');
                if (dirSel) dirSel.value = (r.Direction || 'inbound').toLowerCase();
                if (protoSel) {
                  protoSel.value = (r.Protocol || 'TCP').toUpperCase();
                  window.togglePortField(protoSel);
                }
                if (portInp && !portInp.disabled) portInp.value = r.Ports || '';
                if (cidrInp) cidrInp.value = cidrVal;
              });

              liveStatus.style.color = '#0f5132';
              liveStatus.textContent = `✓ Inserted ${p.rules.length} rule(s) for "${p.label}" into Bulk Table below (include SSH 22 before clicking Apply if you want to keep SSH).`;
            });

            addAdditiveBtn.addEventListener('click', async () => {
              const presets = _getAppPortPresets();
              const p = presets[Number(appSelect.value)];
              if (!p) {
                liveStatus.style.color = '#842029';
                liveStatus.textContent = '⚠ Select an Application Preset first.';
                appSelect.focus();
                return;
              }
              const cidrVal = cidrInput.value.trim();
              if (!_validateCidr(cidrVal)) {
                cidrInput.setAttribute('aria-invalid', 'true');
                cidrInput.style.borderColor = '#dc3545';
                liveStatus.style.color = '#842029';
                liveStatus.textContent = '⚠ Enter a valid CIDR (e.g. 203.0.113.10/32 or 0.0.0.0/0).';
                cidrInput.focus();
                return;
              }

              const jobs = [];
              let rulesCount = 0;
              sgList.forEach((sg, sgIdx) => {
                const missing = (p.rules || []).filter((r) => {
                  if (_sgHasExactRule(sg, r.Direction || 'inbound', r.Protocol || 'TCP', r.Ports, cidrVal)) return false;
                  if (cidrVal === '0.0.0.0/0' && typeof window.doesSgAllowPort === 'function') {
                    const cov = window.doesSgAllowPort(sg, r.Protocol || 'TCP', r.Ports);
                    if (cov.allowed && cov.cidrs.includes('0.0.0.0/0')) return false;
                  }
                  return true;
                }).map(r => ({
                  Direction: r.Direction || 'inbound',
                  Protocol: r.Protocol || 'TCP',
                  Ports: r.Ports,
                  CIDR: cidrVal
                }));

                if (missing.length > 0) {
                  rulesCount += missing.length;
                  jobs.push(
                    axios.post(
                      `${tbApiBase()}/ns/${nsId}/resources/securityGroup/${encodeURIComponent(sg.id)}/rules`,
                      { firewallRules: missing },
                      { auth: { username, password } }
                    ).then((res) => {
                      const updatedSg = res.data?.updated;
                      if (updatedSg && Array.isArray(updatedSg.firewallRules)) {
                        sg.firewallRules = updatedSg.firewallRules;
                        const badge = document.querySelector(`#sg-tab-${sgIdx} span:last-child`);
                        if (badge) badge.textContent = String(sg.firewallRules.length);
                      }
                      return { sg: sg.name || sg.id, ok: res.data?.success !== false, msg: res.data?.message || '' };
                    }).catch(err => ({
                      sg: sg.name || sg.id,
                      ok: false,
                      msg: err?.response?.data?.message || err?.message || 'Request failed'
                    }))
                  );
                }
              });

              if (jobs.length === 0) {
                liveStatus.style.color = '#0f5132';
                liveStatus.textContent = `✓ All ports for "${p.label}" (${cidrVal}) are already open across all ${sgList.length} Security Group(s).`;
                return;
              }

              addAdditiveBtn.disabled = true;
              const origBtnText = addAdditiveBtn.textContent;
              addAdditiveBtn.textContent = 'Adding rules...';
              const results = await Promise.all(jobs);
              addAdditiveBtn.disabled = false;
              addAdditiveBtn.textContent = origBtnText;

              if (window.invalidateAppAccessCache) window.invalidateAppAccessCache(infraId);

              const ok = results.filter(r => r.ok);
              const failed = results.filter(r => !r.ok);
              const existingReloadBtn = document.getElementById('sgAppPresetReloadBtn');
              if (existingReloadBtn) existingReloadBtn.remove();

              if (failed.length === 0) {
                liveStatus.style.color = '#0f5132';
                liveStatus.textContent = `✓ Added ${rulesCount} inbound rule(s) to ${ok.length} Security Group(s) (${cidrVal}). Existing rules preserved.`;
              } else {
                liveStatus.style.color = '#842029';
                liveStatus.textContent = `⚠ Updated ${ok.length}/${results.length} SG(s); failed on ${failed.map(f => `${f.sg}: ${f.msg}`).join('; ')}`;
              }

              if (ok.length > 0) {
                const reloadBtn = document.createElement('button');
                reloadBtn.type = 'button';
                reloadBtn.id = 'sgAppPresetReloadBtn';
                reloadBtn.className = 'btn btn-outline-success btn-sm';
                reloadBtn.style.cssText = 'font-size:10px; padding:2px 8px;';
                reloadBtn.textContent = '↻ Refresh Rule Tables';
                reloadBtn.addEventListener('click', () => {
                  updateFirewallRules({ infraId, preselectSgId });
                });
                statusRow.appendChild(reloadBtn);
              }
            });

            appPresetContainer.replaceChildren(box);
          }
        },
        preConfirm: () => {

          const tbody = document.getElementById("sg-rules-all");
          let rules = [];
          for (let row of tbody.rows) {
            const direction = row.querySelector('select[name="direction"]').value;
            const protocol = row.querySelector('select[name="protocol"]').value;
            const port = row.querySelector('input[name="Ports"]').value.trim();
            const cidr = row.querySelector('input[name="cidr"]').value.trim();
            
            // For ICMP and ALL protocols, port is not required
            const isPortRequired = (protocol === "TCP" || protocol === "UDP");
            const isValidRule = direction && protocol && cidr && (!isPortRequired || (isPortRequired && port));
            
            if (isValidRule) {
              rules.push({
                Ports: port || "", // Use empty string for ICMP/ALL protocols
                Protocol: protocol,
                Direction: direction,
                CIDR: cidr
              });
            }
          }
          if (rules.length === 0) {
            Swal.showValidationMessage("Add at least one rule before applying.");
            return false;
          }
          // Applying replaces every existing rule, so a set without an outbound entry
          // takes egress away. Say so rather than letting the node lose outbound access
          // silently — inbound SSH keeps working, so the loss is easy to miss.
          if (!rules.some(r => String(r.Direction).toLowerCase() === "outbound")) {
            Swal.showValidationMessage(
              "No outbound rule defined. Applying would remove outbound access from these Security Groups " +
              "(inbound SSH would still work, so this is easy to miss). Add an outbound rule, " +
              "or use the \"↗ All Outbound\" preset."
            );
            return false;
          }
          return sgList.map(sg => ({ id: sg.id, name: sg.name, firewallRules: rules }));
        }
      }).then((result) => {
        if (result.isConfirmed) {
          
          // Show loading message
          Swal.fire({
            title: 'Updating Security Groups...',
            text: 'Please wait while we update the security group rules.',
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            didOpen: () => {
              Swal.showLoading();
            }
          });

          // Since we now use UpdateMultipleFirewallRules, make a single API call instead of multiple calls
          const updatePromise = axios({
            method: "put",
            url: `${tbApiBase()}/ns/${nsId}/infra/${infraId}/associatedSecurityGroups`,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify({
              firewallRules: result.value[0].firewallRules // All SGs get the same rules
            }),
            auth: { username, password },
          }).then(response => {
            // Check if response has the new batch format with response array and summary
            const responseData = response.data;
            if (responseData && responseData.response && Array.isArray(responseData.response)) {
              // New batch response format - extract individual results
              return responseData.response.map(sgResponse => ({
                id: sgResponse.id,
                name: sgResponse.name,
                success: sgResponse.success,
                message: sgResponse.message || "Successfully updated",
                response: sgResponse,
                summary: responseData.summary // Include summary information
              }));
            } else {
              // Fallback for unexpected response format
              return sgList.map(sg => ({
                id: sg.id,
                name: sg.name,
                success: false,
                message: "Unexpected response format",
                response: responseData
              }));
            }
          }).catch(error => {
            // Return error result for each security group
            return sgList.map(sg => ({
              id: sg.id,
              name: sg.name,
              success: false,
              message: error.response?.data?.message || error.message || "Unknown error",
              error: error
            }));
          });

          updatePromise.then((results) => {
            if (window.invalidateAppAccessCache) window.invalidateAppAccessCache(infraId);
            const successCount = results.filter(r => r.success).length;
            const failedCount = results.filter(r => r.success === false).length;
            const allSuccess = failedCount === 0;
            
            // Extract summary if available
            const summary = results.length > 0 && results[0].summary ? results[0].summary : null;

            // Calculate update time and other details
            const updateTime = new Date().toLocaleString();
            
            // Create detailed result table with summary information
            let resultHtml = `
              <div style="text-align: left;">
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                  <h5 style="margin: 0 0 12px 0; color: #495057; display: flex; align-items: center;">
                    <span style="margin-right: 8px;">📊</span>
                    Security Group Update Results Summary
                    ${summary ? '<span style="font-size: 12px; color: #6c757d; margin-left: 10px;">(Parallel Processing)</span>' : ''}
                  </h5>
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px; margin-bottom: 10px;">
                    <div style="text-align: center; padding: 8px; background: white; border-radius: 6px; border-left: 4px solid #6c757d;">
                      <div style="font-size: 18px; font-weight: bold; color: #6c757d;">${summary ? summary.total : results.length}</div>
                      <div style="font-size: 12px; color: #6c757d;">Total</div>
                    </div>
                    <div style="text-align: center; padding: 8px; background: white; border-radius: 6px; border-left: 4px solid #28a745;">
                      <div style="font-size: 18px; font-weight: bold; color: #28a745;">${summary ? summary.success : successCount}</div>
                      <div style="font-size: 12px; color: #28a745;">Success</div>
                    </div>
                    <div style="text-align: center; padding: 8px; background: white; border-radius: 6px; border-left: 4px solid #dc3545;">
                      <div style="font-size: 18px; font-weight: bold; color: #dc3545;">${summary ? summary.failed : failedCount}</div>
                      <div style="font-size: 12px; color: #dc3545;">Failed</div>
                    </div>
                    <div style="text-align: center; padding: 8px; background: white; border-radius: 6px; border-left: 4px solid #17a2b8;">
                      <div style="font-size: 11px; font-weight: bold; color: #17a2b8;">${updateTime}</div>
                      <div style="font-size: 12px; color: #17a2b8;">Updated</div>
                    </div>
                  </div>
                  ${summary && summary.allSuccess ? 
                    '<div style="background: #d4edda; color: #155724; padding: 8px; border-radius: 4px; font-size: 12px; text-align: center;"><strong>✅ All security groups updated successfully!</strong></div>' : 
                    summary && !summary.allSuccess ? 
                    '<div style="background: #fff3cd; color: #856404; padding: 8px; border-radius: 4px; font-size: 12px; text-align: center;"><strong>⚠️ Some security groups failed to update</strong></div>' : ''
                  }
                </div>
                
                <div style="background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <div style="background: #343a40; color: white; padding: 12px; font-weight: bold;">
                    <span style="margin-right: 8px;">📋</span>
                    Detailed Update Results
                  </div>
                  <div style="max-height: 400px; overflow-y: auto;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                      <thead style="background: #f8f9fa; position: sticky; top: 0; z-index: 1;">
                        <tr>
                          <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; color: #495057; width: 50px;">#</th>
                          <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; color: #495057; width: 80px;">Status</th>
                          <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; color: #495057; min-width: 150px;">Security Group</th>
                          <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; color: #495057;">ID</th>
                          <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; color: #495057; min-width: 200px;">Message</th>
                          <th style="padding: 12px 8px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; color: #495057; width: 100px;">Details</th>
                        </tr>
                      </thead>
                      <tbody>
            `;

            results.forEach((result, index) => {
              const statusIcon = result.success ? '✅' : '❌';
              const statusText = result.success ? 'Success' : 'Failed';
              const statusColor = result.success ? '#28a745' : '#dc3545';
              const rowBgColor = result.success ? '#f8fff8' : '#fff5f5';
              const rulesCount = result.response?.firewallRules?.length || result.response?.updated?.firewallRules?.length || 'N/A';
              
              resultHtml += `
                <tr style="background-color: ${rowBgColor}; border-bottom: 1px solid #f0f0f0;">
                  <td style="padding: 12px 8px; text-align: center; font-weight: bold; color: #6c757d;">${index + 1}</td>
                  <td style="padding: 12px 8px; text-align: center;">
                    <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
                      <span style="font-size: 16px;">${statusIcon}</span>
                      <span style="font-weight: 600; color: ${statusColor}; font-size: 12px;">${statusText}</span>
                    </div>
                  </td>
                  <td style="padding: 12px 8px;">
                    <div style="font-weight: 600; color: #212529; margin-bottom: 2px;">${result.name}</div>
                    <div style="font-size: 11px; color: #6c757d;">Rules: ${rulesCount}</div>
                  </td>
                  <td style="padding: 12px 8px;">
                    <code style="background: #f8f9fa; padding: 2px 6px; border-radius: 3px; font-size: 11px; color: #495057;">${result.id}</code>
                  </td>
                  <td style="padding: 12px 8px;">
                    <div style="color: #495057; line-height: 1.4; word-break: break-word;">
                      ${result.message}
                    </div>
                  </td>
                  <td style="padding: 12px 8px; text-align: center;">
                    <button onclick="showSgDetails('${result.id}', '${result.name}', ${index})" 
                            style="background: #17a2b8; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; transition: background 0.2s;"
                            onmouseover="this.style.background='#138496'" 
                            onmouseout="this.style.background='#17a2b8'">
                      View
                    </button>
                  </td>
                </tr>
              `;
            });

            resultHtml += `
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            `;

            // Add global function for showing details
            window.showSgDetails = function(sgId, sgName, index) {
              const result = results[index];
              let detailsHtml = `
                <div style="text-align: left;">
                  <h6 style="color: #495057; margin-bottom: 15px;">
                    <strong>Security Group:</strong> ${sgName} 
                    <span style="font-size: 12px; color: #6c757d;">(${sgId})</span>
                  </h6>
              `;
              
              if (result.success && result.response) {
                const sgData = result.response.updated || result.response;
                if (sgData.firewallRules && sgData.firewallRules.length > 0) {
                  detailsHtml += `
                    <div style="margin-bottom: 15px;">
                      <strong style="color: #28a745;">✅ Updated Rules (${sgData.firewallRules.length}):</strong>
                      <div style="max-height: 200px; overflow-y: auto; margin-top: 8px; border: 1px solid #dee2e6; border-radius: 4px;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                          <thead style="background: #f8f9fa;">
                            <tr>
                              <th style="padding: 6px; border-bottom: 1px solid #dee2e6;">Direction</th>
                              <th style="padding: 6px; border-bottom: 1px solid #dee2e6;">Protocol</th>
                              <th style="padding: 6px; border-bottom: 1px solid #dee2e6;">Port</th>
                              <th style="padding: 6px; border-bottom: 1px solid #dee2e6;">CIDR</th>
                            </tr>
                          </thead>
                          <tbody>
                  `;
                  
                  sgData.firewallRules.forEach(rule => {
                    detailsHtml += `
                      <tr>
                        <td style="padding: 6px; border-bottom: 1px solid #f0f0f0;">${rule.Direction || rule.direction || 'N/A'}</td>
                        <td style="padding: 6px; border-bottom: 1px solid #f0f0f0;">${rule.Protocol || rule.protocol || 'N/A'}</td>
                        <td style="padding: 6px; border-bottom: 1px solid #f0f0f0;">${rule.Port || rule.port || rule.Ports || 'N/A'}</td>
                        <td style="padding: 6px; border-bottom: 1px solid #f0f0f0;">${rule.CIDR || rule.cidr || 'N/A'}</td>
                      </tr>
                    `;
                  });
                  
                  detailsHtml += `
                          </tbody>
                        </table>
                      </div>
                    </div>
                  `;
                }
              } else {
                detailsHtml += `
                  <div style="color: #dc3545; background: #f8d7da; padding: 10px; border-radius: 4px; margin-bottom: 10px;">
                    <strong>❌ Update Failed:</strong><br>
                    ${result.message}
                  </div>
                `;
                
                if (result.error && result.error.response) {
                  detailsHtml += `
                    <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; border-left: 4px solid #dc3545;">
                      <strong>Error Details:</strong><br>
                      <code style="font-size: 11px; color: #dc3545;">${JSON.stringify(result.error.response.data, null, 2)}</code>
                    </div>
                  `;
                }
              }
              
              detailsHtml += `</div>`;
              
              Swal.fire({
                title: `Security Group Details`,
                html: detailsHtml,
                width: 600,
                confirmButtonText: "Close",
                confirmButtonColor: "#6c757d"
              });
            };

            if (allSuccess) {
              Swal.fire({
                title: "🎉 All Updates Successful!",
                html: resultHtml,
                icon: "success",
                width: 900,
                confirmButtonText: "Excellent!",
                confirmButtonColor: "#28a745"
              });
            } else if (successCount > 0) {
              Swal.fire({
                title: "⚠️ Partial Success",
                html: resultHtml,
                icon: "warning",
                width: 900,
                confirmButtonText: "Got it",
                confirmButtonColor: "#ffc107"
              });
            } else {
              Swal.fire({
                title: "❌ Update Failed",
                html: resultHtml,
                icon: "error",
                width: 900,
                confirmButtonText: "Retry",
                confirmButtonColor: "#dc3545"
              });
            }
          }).catch((err) => {
            Swal.fire({
              title: "💥 Unexpected Error",
              html: `
                <div style="text-align: left;">
                  <p>An unexpected error occurred while updating security group rules:</p>
                  <div style="background-color: #f8f9fa; padding: 12px; border-radius: 6px; border-left: 4px solid #dc3545;">
                    <code style="color: #dc3545;">${err.response?.data?.message || err.message || err}</code>
                  </div>
                  <p style="margin-top: 12px; color: #6c757d;">Please check your connection and try again.</p>
                </div>
              `,
              icon: "error",
              width: 600,
              confirmButtonText: "Close",
              confirmButtonColor: "#dc3545"
            });
          });
        }
      }).catch((err) => {
        if (err) errorAlert("Popup error: " + err);
      });
    }).catch((err) => {
      errorAlert("Failed to load security group details: " + (err.response?.data?.message || err));
    });
  }).catch((err) => {
    errorAlert("Failed to load associated security group IDs: " + (err.response?.data?.message || err));
  });
}
window.updateFirewallRules = updateFirewallRules;

// Function to delete individual firewall rule
function deleteFirewallRule(sgId, sgName, ruleData) {
  try {
    const rule = JSON.parse(decodeURIComponent(ruleData));
    
    Swal.fire({
      title: "Delete Firewall Rule",
      html: `
        <div style="text-align: left;">
          <p><strong>Security Group:</strong> ${sgName}</p>
          <p><strong>Rule to delete:</strong></p>
          <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; border-left: 4px solid #dc3545;">
            <strong>Direction:</strong> ${rule.Direction || rule.direction || 'N/A'}<br>
            <strong>Protocol:</strong> ${rule.Protocol || rule.protocol || 'N/A'}<br>
            <strong>Port:</strong> ${rule.Port || rule.port || rule.Ports || 'N/A'}<br>
            <strong>CIDR:</strong> ${rule.CIDR || rule.cidr || 'N/A'}
          </div>
          <p style="color: #dc3545; margin-top: 10px;">⚠️ This action cannot be undone.</p>
        </div>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#dc3545",
      cancelButtonText: "Cancel",
      cancelButtonColor: "#6c757d"
    }).then((result) => {
      if (result.isConfirmed) {
        // Show loading
        Swal.fire({
          title: 'Deleting Rule...',
          text: 'Please wait while we delete the firewall rule.',
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });

        var config = getConfig(); var hostname = config.hostname;
        var port = config.port;
        var username = config.username;
        var password = config.password;
        var nsId = config.namespace || window.configNamespace || '';

        // Prepare request data for deletion
        const deleteRule = {
          Direction: rule.Direction || rule.direction,
          Protocol: rule.Protocol || rule.protocol,
          Ports: rule.Port || rule.port || rule.Ports,
          CIDR: rule.CIDR || rule.cidr
        };

        axios({
          method: "delete",
          url: `${tbApiBase()}/ns/${nsId}/resources/securityGroup/${sgId}/rules`,
          headers: { "Content-Type": "application/json" },
          data: JSON.stringify({
            firewallRules: [deleteRule]
          }),
          auth: { username, password },
        }).then((response) => {
          const responseData = response.data;
          // Check if the response indicates success
          const isSuccess = responseData.success !== false;
          
          if (isSuccess) {
            Swal.fire({
              title: "✅ Rule Deleted Successfully",
              html: `
                <div style="text-align: left;">
                  <p>The firewall rule has been successfully deleted from security group <strong>${sgName}</strong>.</p>
                  <div style="background: #d4edda; padding: 10px; border-radius: 4px; border-left: 4px solid #28a745; margin-top: 10px;">
                    <strong>Deleted Rule:</strong><br>
                    Direction: ${deleteRule.Direction}<br>
                    Protocol: ${deleteRule.Protocol}<br>
                    Port: ${deleteRule.Ports}<br>
                    CIDR: ${deleteRule.CIDR}
                  </div>
                  ${responseData.message ? `<p style="margin-top: 10px; color: #28a745;"><strong>Message:</strong> ${responseData.message}</p>` : ''}
                </div>
              `,
              icon: "success",
              confirmButtonText: "Refresh View",
              confirmButtonColor: "#28a745"
            }).then(() => {
              if (window.invalidateAppAccessCache) window.invalidateAppAccessCache(window._lastManagedSgContext?.infraId);
              // Refresh the firewall rules view preserving target Infra and active SG tab
              updateFirewallRules({ ...(window._lastManagedSgContext || {}), preselectSgId: sgId });
            });
          } else {
            throw new Error(responseData.message || 'Failed to delete rule');
          }
        }).catch((error) => {
          Swal.fire({
            title: "❌ Delete Failed",
            html: `
              <div style="text-align: left;">
                <p>Failed to delete the firewall rule:</p>
                <div style="background: #f8d7da; padding: 10px; border-radius: 4px; border-left: 4px solid #dc3545;">
                  <code style="color: #dc3545;">${error.response?.data?.message || error.message || 'Unknown error'}</code>
                </div>
              </div>
            `,
            icon: "error",
            confirmButtonText: "Close",
            confirmButtonColor: "#dc3545"
          });
        });
      }
    });
  } catch (err) {
    errorAlert("Error parsing rule data: " + err.message);
  }
}
window.deleteFirewallRule = deleteFirewallRule;

// Function to add new firewall rule to specific security group
function addNewRuleToSg(sgId, sgName) {
  let activeMultiProtoPreset = null;

  Swal.fire({
    title: `Add New Rule to ${sgName}`,
    html: `
      <div style="text-align: left;">
        <div id="newRuleAppPresetWrap" style="margin-bottom: 15px; padding: 10px; background: #f3fbf5; border: 1px solid #c3e6cb; border-radius: 6px;"></div>
        <div style="margin-bottom: 15px;">
          <label for="newRuleDirection" style="font-weight: bold; margin-bottom: 5px; display: block;">Direction:</label>
          <select id="newRuleDirection" name="newRuleDirection" class="form-control">
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
          </select>
        </div>
        <div style="margin-bottom: 15px;">
          <label for="newRuleProtocol" style="font-weight: bold; margin-bottom: 5px; display: block;">Protocol:</label>
          <select id="newRuleProtocol" name="newRuleProtocol" class="form-control" onchange="togglePortFieldIndividual()">
            <option value="TCP">TCP</option>
            <option value="UDP">UDP</option>
            <option value="ICMP">ICMP</option>
            <option value="ALL">ALL</option>
          </select>
        </div>
        <div style="margin-bottom: 15px;">
          <label for="newRulePort" style="font-weight: bold; margin-bottom: 5px; display: block;">Port:</label>
          <input type="text" id="newRulePort" name="newRulePort" autocorrect="off" autocapitalize="none" spellcheck="false" class="form-control" placeholder="ex: 22, 80-100, 22,80,443" />
          <small id="newRulePortHint" style="color: #6c757d;">Enter single port (22), port range (80-100), or multiple (22,80,443)</small>
        </div>
        <div style="margin-bottom: 15px;">
          <label for="newRuleCidr" style="font-weight: bold; margin-bottom: 5px; display: block;">CIDR:</label>
          <div style="display: flex; gap: 6px; align-items: center;">
            <input type="text" id="newRuleCidr" name="newRuleCidr" autocorrect="off" autocapitalize="none" spellcheck="false" class="form-control" placeholder="ex: 0.0.0.0/0, 192.168.1.0/24" value="0.0.0.0/0" />
            <button type="button" id="newRuleMyIpBtn" class="btn btn-outline-primary btn-sm" style="white-space: nowrap;">📍 My IP (/32)</button>
          </div>
          <small style="color: #6c757d;">IP address range in CIDR notation</small>
        </div>
        <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; margin-top: 15px;">
          <strong>Quick Templates:</strong><br>
          <button type="button" class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('SSH')" style="margin: 2px;">SSH (22)</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('HTTP')" style="margin: 2px;">HTTP (80)</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('HTTPS')" style="margin: 2px;">HTTPS (443)</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('MYSQL')" style="margin: 2px;">MySQL (3306)</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('POSTGRES')" style="margin: 2px;">PostgreSQL (5432)</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('ALL_TCP')" style="margin: 2px;">All TCP Ports</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('ALL_UDP')" style="margin: 2px;">All UDP Ports</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('ICMP')" style="margin: 2px;">ICMP</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('ALL_PROTOCOLS')" style="margin: 2px;">All Protocols</button>
        </div>
      </div>
    `,
    width: 540,
    showCancelButton: true,
    confirmButtonText: "Add Rule",
    confirmButtonColor: "#28a745",
    cancelButtonText: "Cancel",
    cancelButtonColor: "#6c757d",
    didOpen: () => {
      // Populate Application Preset selector programmatically
      const presetWrap = document.getElementById('newRuleAppPresetWrap');
      if (presetWrap) {
        const lbl = document.createElement('label');
        lbl.setAttribute('for', 'newRuleAppPreset');
        lbl.style.cssText = 'font-weight: bold; font-size: 12px; color: #0f5132; margin-bottom: 4px; display: block;';
        lbl.textContent = '🚀 Application Port Preset (auto-fills ports):';
        const sel = document.createElement('select');
        sel.id = 'newRuleAppPreset';
        sel.name = 'newRuleAppPreset';
        sel.className = 'form-control';
        sel.style.cssText = 'font-size: 12px;';
        _populateAppPresetSelect(sel, '-- Choose application preset (optional) --');

        const note = document.createElement('small');
        note.style.cssText = 'display:block; margin-top:4px; color:#495057; font-size:11px;';
        note.textContent = 'Existing rules in this Security Group are kept intact.';

        sel.addEventListener('change', () => {
          const presets = _getAppPortPresets();
          const p = presets[Number(sel.value)];
          const dirSel = document.getElementById('newRuleDirection');
          const protoSel = document.getElementById('newRuleProtocol');
          const portInp = document.getElementById('newRulePort');
          const portHint = document.getElementById('newRulePortHint');
          if (!p || !Array.isArray(p.rules) || p.rules.length === 0) {
            activeMultiProtoPreset = null;
            return;
          }
          const protos = Array.from(new Set(p.rules.map(r => String(r.Protocol || 'TCP').toUpperCase())));
          dirSel.value = 'inbound';
          if (protos.length === 1) {
            activeMultiProtoPreset = null;
            protoSel.value = protos[0];
            togglePortFieldIndividual();
            portInp.value = p.rules.map(r => r.Ports).join(',');
            if (portHint) {
              portHint.textContent = `Preset "${p.label}" (${protos[0]} ${portInp.value})`;
            }
          } else {
            activeMultiProtoPreset = p;
            protoSel.value = protos[0];
            togglePortFieldIndividual();
            portInp.value = p.rules.filter(r => String(r.Protocol).toUpperCase() === protos[0]).map(r => r.Ports).join(',');
            if (portHint) {
              portHint.textContent = `Multi-protocol preset "${p.label}" — will add both ${p.rules.map(r => `${r.Protocol} ${r.Ports}`).join(', ')}.`;
            }
          }
          if (p.restrictCidrRecommended) {
            note.textContent = '⚠ Unauthenticated UI/API — click "📍 My IP (/32)" below to restrict access.';
            note.style.color = '#664d03';
          } else {
            note.textContent = 'Existing rules in this Security Group are kept intact.';
            note.style.color = '#495057';
          }
        });

        presetWrap.appendChild(lbl);
        presetWrap.appendChild(sel);
        presetWrap.appendChild(note);
      }

      // Clear multi-protocol override if user manually edits direction, protocol, or port
      ['newRuleDirection', 'newRuleProtocol', 'newRulePort'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('input', () => { activeMultiProtoPreset = null; });
          el.addEventListener('change', () => { activeMultiProtoPreset = null; });
        }
      });

      const myIpBtn = document.getElementById('newRuleMyIpBtn');
      if (myIpBtn) {
        myIpBtn.addEventListener('click', async () => {
          if (typeof window.detectClientPublicCidr !== 'function') return;
          myIpBtn.disabled = true;
          const detected = await window.detectClientPublicCidr();
          myIpBtn.disabled = false;
          const cidrInp = document.getElementById('newRuleCidr');
          if (detected && cidrInp) cidrInp.value = detected;
        });
      }

      // Function to toggle port field for individual rule addition
      function togglePortFieldIndividual() {
        const protocolSelect = document.getElementById("newRuleProtocol");
        const portInput = document.getElementById("newRulePort");
        const protocol = protocolSelect.value;
        
        if (protocol === "ICMP" || protocol === "ALL") {
          portInput.disabled = true;
          portInput.value = "";
          portInput.placeholder = "Not applicable for " + protocol;
          portInput.style.backgroundColor = "#f8f9fa";
          portInput.style.color = "#6c757d";
        } else {
          portInput.disabled = false;
          portInput.placeholder = "ex: 22, 80-100, 22,80,443";
          portInput.style.backgroundColor = "";
          portInput.style.color = "";
        }
      }
      window.togglePortFieldIndividual = togglePortFieldIndividual;
      
      // Initialize port field state
      togglePortFieldIndividual();
      
      // Define quick template function
      window.setQuickTemplate = function(template) {
        activeMultiProtoPreset = null;
        const protocolSelect = document.getElementById("newRuleProtocol");
        const portInput = document.getElementById("newRulePort");
        const cidrInput = document.getElementById("newRuleCidr");
        
        switch(template) {
          case 'SSH':
            protocolSelect.value = "TCP";
            portInput.value = "22";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'HTTP':
            protocolSelect.value = "TCP";
            portInput.value = "80";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'HTTPS':
            protocolSelect.value = "TCP";
            portInput.value = "443";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'MYSQL':
            protocolSelect.value = "TCP";
            portInput.value = "3306";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'POSTGRES':
            protocolSelect.value = "TCP";
            portInput.value = "5432";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'ALL_TCP':
            protocolSelect.value = "TCP";
            portInput.value = "1-65535";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'ALL_UDP':
            protocolSelect.value = "UDP";
            portInput.value = "1-65535";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'ICMP':
            protocolSelect.value = "ICMP";
            portInput.value = "";
            cidrInput.value = "0.0.0.0/0";
            break;
          case 'ALL_PROTOCOLS':
            protocolSelect.value = "ALL";
            portInput.value = "";
            cidrInput.value = "0.0.0.0/0";
            break;
        }
        
        // Update port field state after template selection
        togglePortFieldIndividual();
      };
    },
    preConfirm: () => {
      const direction = document.getElementById("newRuleDirection").value;
      const protocol = document.getElementById("newRuleProtocol").value;
      const port = document.getElementById("newRulePort").value.trim();
      const cidr = document.getElementById("newRuleCidr").value.trim();
      
      // For ICMP and ALL protocols, port is not required
      if (!direction || !protocol || !cidr) {
        Swal.showValidationMessage("Direction, Protocol, and CIDR are required");
        return false;
      }
      
      // Check port requirement based on protocol
      if ((protocol === "TCP" || protocol === "UDP") && !port) {
        Swal.showValidationMessage("Port is required for TCP and UDP protocols");
        return false;
      }
      
      // Basic CIDR validation
      if (!_validateCidr(cidr)) {
        Swal.showValidationMessage("Enter a valid CIDR notation (e.g., 0.0.0.0/0 or 203.0.113.10/32)");
        return false;
      }

      const rulesPayload = activeMultiProtoPreset
        ? activeMultiProtoPreset.rules.map(r => ({
            Direction: r.Direction || 'inbound',
            Protocol: r.Protocol || 'TCP',
            Ports: r.Ports || '',
            CIDR: cidr
          }))
        : (port && (protocol === 'TCP' || protocol === 'UDP')
            ? port.split(',').map(s => s.trim()).filter(Boolean).map(pt => ({
                Direction: direction,
                Protocol: protocol,
                Ports: pt,
                CIDR: cidr
              }))
            : [{
                Direction: direction,
                Protocol: protocol,
                Ports: port || "",
                CIDR: cidr
              }]);

      return { direction, protocol, port: port || "", cidr, rulesPayload };
    }
  }).then((result) => {
    if (result.isConfirmed) {
      const { direction, protocol, port, cidr, rulesPayload } = result.value;
      
      // Show loading
      Swal.fire({
        title: 'Adding Rule...',
        text: 'Please wait while we add the new firewall rule.',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      var config = getConfig();
      var username = config.username;
      var password = config.password;
      var nsId = config.namespace || window.configNamespace || '';

      // Fetch current SG first to skip exact duplicates so multi-port presets never fail on partial overlap
      axios.get(`${tbApiBase()}/ns/${nsId}/resources/securityGroup/${encodeURIComponent(sgId)}`, {
        auth: { username, password }
      }).catch(() => ({ data: null })).then((sgGetRes) => {
        const currentSg = sgGetRes.data;
        const filteredRules = currentSg
          ? rulesPayload.filter(r => !_sgHasExactRule(currentSg, r.Direction, r.Protocol, r.Ports, r.CIDR))
          : rulesPayload;

        if (filteredRules.length === 0) {
          return { data: { success: true, message: 'All specified rules already exist on this Security Group.' } };
        }

        return axios({
          method: "post",
          url: `${tbApiBase()}/ns/${nsId}/resources/securityGroup/${encodeURIComponent(sgId)}/rules`,
          headers: { "Content-Type": "application/json" },
          data: JSON.stringify({
            firewallRules: filteredRules
          }),
          auth: { username, password },
        });
      }).then((response) => {
        const responseData = response.data;
        // Check if the response indicates success
        const isSuccess = responseData.success !== false;
        
        if (isSuccess) {
          if (window.invalidateAppAccessCache) window.invalidateAppAccessCache(window._lastManagedSgContext?.infraId);
          const summaryLines = rulesPayload.map(r => `${r.Direction} · ${r.Protocol}${r.Ports ? ` ${r.Ports}` : ''} · ${r.CIDR}`).join('<br>');
          Swal.fire({
            title: "✅ Rule Added Successfully",
            html: `
              <div style="text-align: left;">
                <p>The firewall rule(s) have been processed for security group <strong>${escapeHtml(sgName)}</strong>.</p>
                <div style="background: #d4edda; padding: 10px; border-radius: 4px; border-left: 4px solid #28a745; margin-top: 10px; font-size: 12px;">
                  <strong>Rule(s):</strong><br>
                  ${summaryLines}
                </div>
                ${responseData.message ? `<p style="margin-top: 10px; color: #28a745;"><strong>Message:</strong> ${escapeHtml(responseData.message)}</p>` : ''}
              </div>
            `,
            icon: "success",
            confirmButtonText: "Refresh View",
            confirmButtonColor: "#28a745"
          }).then(() => {
            // Refresh the firewall rules view preserving target Infra and SG tab
            updateFirewallRules({ ...(window._lastManagedSgContext || {}), preselectSgId: sgId });
          });
        } else {
          throw new Error(responseData.message || 'Failed to add rule');
        }
      }).catch((error) => {
        Swal.fire({
          title: "❌ Add Failed",
          html: `
            <div style="text-align: left;">
              <p>Failed to add the new firewall rule:</p>
              <div style="background: #f8d7da; padding: 10px; border-radius: 4px; border-left: 4px solid #dc3545;">
                <code style="color: #dc3545;">${error.response?.data?.message || error.message || 'Unknown error'}</code>
              </div>
            </div>
          `,
          icon: "error",
          confirmButtonText: "Close",
          confirmButtonColor: "#dc3545"
        });
      });
    }
  });
}
window.addNewRuleToSg = addNewRuleToSg;
