/**
 * Spec Recommendation, Configuration & NodeGroup Management Feature Module
 * @module features/spec
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import { tbApiBase, getConfig } from '../../core/api.js';
import { escapeHtml } from '../../core/utils.js';

const esc = escapeHtml;
const addSpinnerTask = (name) => (window.addSpinnerTask ? window.addSpinnerTask(name) : name);
const removeSpinnerTask = (id) => { if (window.removeSpinnerTask) window.removeSpinnerTask(id); };
const errorAlert = (msg) => (window.errorAlert ? window.errorAlert(msg) : Swal.fire({ icon: 'error', title: msg, showConfirmButton: true }));
const successAlert = (msg) => (window.successAlert ? window.successAlert(msg) : Swal.fire({ icon: 'success', title: msg, showConfirmButton: false, timer: 2500 }));
const infoAlert = (msg) => (window.infoAlert ? window.infoAlert(msg) : Swal.fire({ icon: 'info', title: msg, showConfirmButton: false, timer: 2500 }));

const renderMapFromConfig = () => { if (window.renderMapFromConfig) window.renderMapFromConfig(); };
const getSelectedProviders = () => (window.getSelectedProviders ? window.getSelectedProviders() : []);
const createInfra = () => { if (window.createInfra) window.createInfra(); };
const createK8sCluster = () => { if (window.createK8sCluster) window.createK8sCluster(); };
const addNodeGroupToK8sCluster = () => { if (window.addNodeGroupToK8sCluster) window.addNodeGroupToK8sCluster(); };
const scaleOutInfraWithConfiguration = () => { if (window.scaleOutInfraWithConfiguration) window.scaleOutInfraWithConfiguration(); };
const getCurrentWorkloadType = () => (window.getCurrentWorkloadType ? window.getCurrentWorkloadType() : 'vm');
const handleAxiosResponse = (res) => (window.handleAxiosResponse ? window.handleAxiosResponse(res) : res);
const confirmClearInfraConfiguration = () => { if (window.confirmClearInfraConfiguration) window.confirmClearInfraConfiguration(); };

const makeArrayProxy = (getArr) => new Proxy([], {
  get: (target, prop) => {
    const arr = getArr() || [];
    const val = arr[prop];
    return typeof val === 'function' ? val.bind(arr) : val;
  },
  set: (target, prop, value) => {
    const arr = getArr();
    if (arr) arr[prop] = value;
    return true;
  },
  has: (target, prop) => prop in (getArr() || []),
  ownKeys: () => Reflect.ownKeys(getArr() || []),
  getOwnPropertyDescriptor: (target, prop) => {
    const arr = getArr() || [];
    return Object.getOwnPropertyDescriptor(arr, prop);
  }
});

const nodeGroupRequestFromSpecList = makeArrayProxy(() => window.nodeGroupRequestFromSpecList);
const recommendedSpecList = makeArrayProxy(() => window.recommendedSpecList);

const $ = (...args) => (window.$ || window.jQuery)(...args);
$.extend = (...args) => (window.$ || window.jQuery).extend(...args);
$.fn = (window.$ || window.jQuery)?.fn || {};

const typeInfo = window.typeInfo || 'info';
const typeError = window.typeError || 'error';

const displayJsonData = (...args) => { if (window.displayJsonData) window.displayJsonData(...args); };
const checkConnectionWithRetry = (...args) => { if (window.checkConnectionWithRetry) window.checkConnectionWithRetry(...args); };
const selectSpecRow = (...args) => { if (window.selectSpecRow) window.selectSpecRow(...args); };
const selectImageRow = (...args) => { if (window.selectImageRow) window.selectImageRow(...args); };
const resolveCloudPlatform = (p) => (window.resolveCloudPlatform ? window.resolveCloudPlatform(p) : p);

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

const recommendPolicy = new Proxy({}, {
  get: (target, prop) => {
    const el = document.getElementById('recommendPolicy');
    return el ? el[prop] : undefined;
  }
});

const knownPlatforms = makeArrayProxy(() => window.knownPlatforms);

function getRecommendedSpec(idx, latitude, longitude) {
  const cfg = getConfig();
  var hostname = window.configHostname || cfg.hostname || '';
  var port = window.configPort || cfg.port || '';
  var username = window.configUsername || cfg.username || '';
  var password = window.configPassword || cfg.password || '';

  var minVCPU = document.getElementById("minVCPU").value;
  var maxVCPU = document.getElementById("maxVCPU").value;
  var minRAM = document.getElementById("minRAM").value;
  var maxRAM = document.getElementById("maxRAM").value;
  var specName = document.getElementById("specName").value;
  var architecture = document.getElementById("architecture").value;
  var selectedProviders = getSelectedProviders();
  var acceleratorModel = document.getElementById("acceleratorModel").value;
  var minAcceleratorCount = document.getElementById("minAcceleratorCount").value;
  var maxAcceleratorCount = document.getElementById("maxAcceleratorCount").value;
  var minAMEM = document.getElementById("minAMEM").value;
  var maxAMEM = document.getElementById("maxAMEM").value;

  var url = `${tbApiBase()}/recommendSpec`;

  function createPolicyConditions(metric, values, type) {
    const conditions = [];

    if (type === 'range') {
      if (values.min) conditions.push({ operand: `${values.min}`, operator: ">=" });
      if (values.max) conditions.push({ operand: `${values.max}`, operator: "<=" });
    } else if (type === 'single') {
      if (values.value) conditions.push({ operand: `${values.value}` });
    }

    return { metric: metric, condition: conditions };
  }

  // Handle GPU-related conditions
  var gpuPolicies = [];
  if (acceleratorModel === "any") {
    // For "Any GPU", add acceleratorType as "gpu" but exclude AcceleratorModel
    gpuPolicies.push(createPolicyConditions("AcceleratorType", { value: "gpu" }, "single"));
  } else if (acceleratorModel && acceleratorModel !== "") {
    // For specific GPU models, add AcceleratorModel condition
    gpuPolicies.push(createPolicyConditions("AcceleratorModel", { value: acceleratorModel }, "single"));
  }

  // Handle provider conditions - support multiple providers with comma-separated values
  var providerPolicies = [];
  if (selectedProviders && selectedProviders.length > 0) {
    // Check if ALL is selected or if no specific providers are selected
    var isAllSelected = selectedProviders.includes("ALL") || selectedProviders.length === 0;
    
    if (!isAllSelected) {
      // Create a single condition with comma-separated provider names
      var providerString = selectedProviders.join(",");
      providerPolicies.push(createPolicyConditions("ProviderName", { value: providerString }, "single"));
      console.log("Provider filter applied:", providerString);
    } else {
      console.log("No provider filter applied (ALL selected or none specified)");
    }
  }
  // If no providers selected or ALL is selected, don't add provider conditions (means all providers)

  var policies = [
    createPolicyConditions("vCPU", { min: minVCPU, max: maxVCPU }, "range"),
    createPolicyConditions("MemoryGiB", { min: minRAM, max: maxRAM }, "range"),
    createPolicyConditions("CspSpecName", { value: specName }, "single"),
    ...providerPolicies, // Spread the provider policies array (now supports comma-separated values)
    createPolicyConditions("Architecture", { value: architecture }, "single"), // Architecture can also support comma-separated values
    ...gpuPolicies,
    createPolicyConditions("AcceleratorMemoryGB", { min: minAMEM, max: maxAMEM }, "range"),
    createPolicyConditions("AcceleratorCount", { min: minAcceleratorCount, max: maxAcceleratorCount }, "range"),
  ];

  var recommendationPolicy = recommendPolicy.value;
  var priorities = {
    "location": {
      metric: "location",
      parameter: [{ key: "coordinateClose", val: [`${latitude}/${longitude}`] }],
      weight: 1.0
    },
    "cost": {
      metric: "cost",
      weight: 1.0
    },
    "performance": {
      metric: "performance",
      weight: 1.0
    },
    "random": {
      metric: "random",
      weight: 1.0
    }
  };

  var struct = {
    filter: { policy: policies },
    limit: 200,
    priority: { policy: [priorities[recommendationPolicy]] }
  };

  var jsonBody = JSON.stringify(struct);
  console.log("Request body for infraDynamicCheckRequest:", jsonBody);

  // // Show loading popup while API is processing
  // Swal.fire({
  //   title: 'Recommending Specification list',
  //   text: 'Please wait for a moment...',
  //   allowOutsideClick: false,
  //   allowEscapeKey: false,
  //   showConfirmButton: false,
  //   didOpen: () => {
  //     Swal.showLoading();
  //   }
  // });

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
    // Close loading popup
    Swal.close();
    console.log(res); // for debug
    handleAxiosResponse(res);

    if (res.data == null || res.data.length == 0) {
      errorAlert("No recommended spec found with the given condition");
      return;
    }

    // User selects a spec from recommendation list
    openSpecSelectionDialog(res.data).then((selectedSpec) => {
      if (!selectedSpec) {
        console.log("Spec selection canceled");
        window.editingNodeGroupIndex = -1;
        if (window.latLonInputPairIdx > 0) window.latLonInputPairIdx--;
        renderMapFromConfig();
        return;
      }

      console.log("User selected spec:", selectedSpec);

      // User selects an image for the chosen spec
      openImageSelectionDialog(selectedSpec).then((imageResult) => {
        if (!imageResult) {
          console.log("Image selection canceled");
          window.editingNodeGroupIndex = -1;
          if (window.latLonInputPairIdx > 0) window.latLonInputPairIdx--;
          renderMapFromConfig();
          return;
        }

        const selectedImage = imageResult.selectedImage;
        const selectedImageId = imageResult.selectedImageId;

        // Now proceed to the final spec confirmation step
        var createInfraReqVm = $.extend({}, createInfraReqVmTmplt);
        var recommendedSpec = selectedSpec;

        createInfraReqVm.name = "g" + (nodeGroupRequestFromSpecList.length + 1).toString();

        var diskSize = document.getElementById("diskSize");
        createInfraReqVm.specId = selectedSpec.id;
        createInfraReqVm.imageId = selectedImageId;
        createInfraReqVm.rootDiskType = selectedSpec.rootDiskType;

        var diskSizeInput = diskSize ? parseInt(diskSize.value, 10) : 0;
        if (isNaN(diskSizeInput) || diskSizeInput <= 0) {
          diskSizeInput = 0;
        }
        createInfraReqVm.rootDiskSize = diskSizeInput;

        let imageSelectHTML = `
          <div>
            <div style="font-size: 0.85rem; font-weight: 600; color: #333; margin-bottom: 4px; word-break: break-word;">
              ${selectedImage.isCustomImage ? '📸 ' : ''}${window.escapeHtml(selectedImage.osDistribution || selectedImage.description || 'OS Image')}
            </div>
            <code style="font-size: 0.8rem; color: #666; background: #e9ecef; padding: 4px 8px; border-radius: 4px; display: block; word-break: break-all; max-height: 60px; overflow-y: auto;">${window.escapeHtml(selectedImage.cspImageName || selectedImageId)}</code>
          </div>
        `;

        let costPerHour = selectedSpec.costPerHour;
        if (costPerHour < 0 || !costPerHour) {
          costPerHour = "unknown";
        }
        selectedSpec.costPerHour = costPerHour;

        openNodeGroupConfigModal(selectedSpec, createInfraReqVm, imageSelectHTML, recommendedSpec);
      }).catch(error => {
        console.error("Failed to select image:", error);
      });
    }).catch(function (error) {
      console.log(error);
      errorAlert("Cannot show spec selection dialog (Check log for details)");
      if (error.response && error.response.data) {
        displayJsonData(error.response.data, typeError);
      }
    });
  }).catch(function (error) {
    // Close loading popup on error
    Swal.close();

    console.log(error);

    // Check if it's a connection error (network issue or server down)
    if (error.code === 'ECONNREFUSED' || error.code === 'ERR_NETWORK' ||
        error.message?.includes('Network Error') || !error.response) {
      // Connection error - re-check CB-Tumblebug connection status
      Swal.fire({
        icon: 'error',
        title: 'Cannot recommend a spec',
        html: 'Connection to CB-Tumblebug server may have been lost.<br>Would you like to check the connection status?',
        showCancelButton: true,
        confirmButtonText: 'Check Connection',
        cancelButtonText: 'Close'
      }).then((result) => {
        if (result.isConfirmed) {
          checkConnectionWithRetry();
        }
      });
    } else {
      errorAlert("Cannot recommend a spec (Check log for details)");
    }

    if (error.response && error.response.data) {
      displayJsonData(error.response.data, typeError);
    }
  });
}
window.getRecommendedSpec = getRecommendedSpec;

// Global variable for NodeGroup editing mode (-1 means new, >= 0 means editing existing index)
window.editingNodeGroupIndex = -1;

// ========== Common Helper Functions for Spec Configuration Popup ==========

// Cache of diskOptions responses keyed by specId|imageId (plain object: `Map` here is OpenLayers' Map).
const diskOptionsCache = {};

/**
 * Fetch GET /ns/system/resources/spec/{specId}/diskOptions (CSP-native disk types usable with the spec).
 * @returns {Promise<object|null>} response body, or null on failure
 */
async function fetchSpecDiskOptions(specId, imageId = '') {
  if (!specId) return null;
  const cacheKey = `${specId}|${imageId}`;
  if (cacheKey in diskOptionsCache) return diskOptionsCache[cacheKey];
  try {
    // imageId lets the server pick OS-specific root size rules and apply the image's minimum OS disk size.
    const qs = imageId ? `?imageId=${encodeURIComponent(imageId)}` : '';
    const cfg = getConfig();
    const resp = await fetch(`${tbApiBase()}/ns/system/resources/spec/${encodeURIComponent(specId)}/diskOptions${qs}`, {
      headers: { 'Authorization': 'Basic ' + btoa((window.configUsername || cfg.username || '') + ':' + (window.configPassword || cfg.password || '')) }
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    diskOptionsCache[cacheKey] = data;
    return data;
  } catch (e) {
    console.warn('diskOptions fetch failed:', e);
    return null;
  }
}

/** Human-readable size rule, e.g. "10–65536 GB", "50 / 100 GB", "≥ 50 GB". */
function formatDiskSizeRule(rule) {
  if (!rule) return '';
  if (rule.allowed && rule.allowed.length) return rule.allowed.join(' / ') + ' GB';
  let txt = '';
  if (rule.min && rule.max) txt = `${rule.min}–${rule.max} GB`;
  else if (rule.min) txt = `≥ ${rule.min} GB`;
  else if (rule.max) txt = `≤ ${rule.max} GB`;
  if (rule.step && rule.step > 1) txt += ` (step ${rule.step})`;
  return txt;
}

/** Validate a size (GB) against a rule; returns '' if ok, else a message. 0/empty = CSP default, always ok. */
function validateDiskSizeAgainstRule(size, rule) {
  if (!size || !rule) return '';
  if (rule.allowed && rule.allowed.length && !rule.allowed.includes(size)) {
    return `Disk size must be one of ${rule.allowed.join(', ')} GB`;
  }
  if (rule.min && size < rule.min) return `Disk size must be at least ${rule.min} GB`;
  if (rule.max && size > rule.max) return `Disk size must be at most ${rule.max} GB`;
  if (rule.step && rule.step > 1 && size % rule.step !== 0) return `Disk size must be a multiple of ${rule.step} GB`;
  return '';
}

/**
 * Root disk size rule (rootDiskSizeGB, already resolved for the image's OS by the API) of the selected option.
 * @param {HTMLSelectElement} select - the root disk type select populated by populateRootDiskTypeSelect
 */
function getSelectedRootDiskRule(select) {
  if (!select) return null;
  const opt = select.options[select.selectedIndex];
  if (!opt || !opt.dataset.rule) return null;
  return JSON.parse(opt.dataset.rule);
}

/** Update the size placeholder and the tooltip (ⓘ icon + input title) next to a root disk type select. */
function refreshRootDiskSizeHint(selectId, sizeInputId, hintId) {
  const select = document.getElementById(selectId);
  const sizeInput = document.getElementById(sizeInputId);
  const hint = document.getElementById(hintId);
  const rule = getSelectedRootDiskRule(select);
  const txt = formatDiskSizeRule(rule);
  if (sizeInput) sizeInput.placeholder = txt ? `Default (${txt})` : 'Default';
  // Details stay hidden behind a tooltip (ⓘ icon / input hover) to keep the form compact.
  const opt = select && select.options[select.selectedIndex];
  const note = opt && opt.dataset.note ? opt.dataset.note : '';
  const tip = [txt ? `Allowed: ${txt}` : '', note].filter(Boolean).join('\n');
  if (sizeInput) sizeInput.title = tip;
  if (hint) {
    hint.title = tip;
    hint.style.display = tip ? 'inline' : 'none';
  }
}

/**
 * Populate RootDiskType dropdown from GET .../spec/{specId}/diskOptions?imageId=.
 * Option labels show the CSP-native identifier plus size range; each option carries its
 * rootDiskSizeGB rule (resolved for the image's OS / minimum size) in data-rule.
 * On API failure only "default" is offered.
 * @param {string} selectId - DOM element ID of the select dropdown
 * @param {object} spec - spec object ({id, providerName})
 * @param {string} currentValue - Currently selected disk type value
 * @param {object} [opts] - {sizeInputId, hintId, imageId}; imageId may be a string or a function
 */
async function populateRootDiskTypeSelect(selectId, spec, currentValue, opts = {}) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const specId = spec && spec.id ? spec.id : '';
  select.innerHTML = '';

  const addOption = (value, label, rule, note) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    if (rule) option.dataset.rule = JSON.stringify(rule);
    if (note) option.dataset.note = note;
    if (value === currentValue) option.selected = true;
    select.appendChild(option);
    return option;
  };

  const imageId = typeof opts.imageId === 'function' ? opts.imageId() : (opts.imageId || '');
  const data = await fetchSpecDiskOptions(specId, imageId);
  if (data && data.supported && Array.isArray(data.diskTypes)) {
    const defaultLabel = data.defaultRootDiskType ? `default (${data.defaultRootDiskType})` : 'default';
    const imgNote = data.imageMinRootDiskSizeGB ? `Image needs ≥ ${data.imageMinRootDiskSizeGB} GB` : '';
    addOption('default', defaultLabel, null, [imgNote, data.note || ''].filter(Boolean).join(' · '));
    data.diskTypes.filter(t => t.rootDisk && t.available !== false).forEach(t => {
      const range = formatDiskSizeRule(t.rootDiskSizeGB);
      const label = `${t.diskType}${t.displayName && t.displayName !== t.diskType ? ' — ' + t.displayName : ''}${range ? ' (' + range + ')' : ''}`;
      addOption(t.diskType, label, t.rootDiskSizeGB || null, t.note || (t.availability && t.availability.note) || '');
    });
    if (!data.rootDiskSelectable) select.disabled = true;
  } else {
    addOption('default', 'default', null, 'Disk options unavailable (diskOptions API failed)');
  }
  // Keep a previously chosen value even if it is not in the list (e.g. legacy CB-Spider alias).
  if (currentValue && currentValue !== 'default' && !Array.from(select.options).some(o => o.value === currentValue)) {
    addOption(currentValue, `${currentValue} (custom)`).selected = true;
  }
  if (opts.sizeInputId) {
    const refresh = () => refreshRootDiskSizeHint(selectId, opts.sizeInputId, opts.hintId);
    select.addEventListener('change', refresh);
    refresh();
  }
}

/**
 * Fetch available zones from API and populate Zone dropdown.
 * @param {string} selectId - DOM element ID of the zone select dropdown
 * @param {string} spinnerId - DOM element ID of the loading spinner
 * @param {string} specId - Spec ID to query zones for
 * @param {string} currentZone - Currently selected zone value
 * @param {string|null} statusMessageId - DOM element ID for status message display
 */
async function populateZoneSelect(selectId, spinnerId, specId, currentZone, statusMessageId) {
  const zoneSelect = document.getElementById(selectId);
  const spinner = document.getElementById(spinnerId);
  const statusMessage = statusMessageId ? document.getElementById(statusMessageId) : null;
  
  if (!zoneSelect || !specId) {
    if (spinner) spinner.style.display = 'none';
    return;
  }
  
  // Use same protocol as current page for API calls
  const apiProtocol = window.location.protocol === 'https:' ? 'https' : 'http';
  
  try {
    const response = await fetch(`${tbApiBase()}/availableZonesForSpec?specId=${encodeURIComponent(specId)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + btoa((window.configUsername || getConfig().username || '') + ':' + (window.configPassword || getConfig().password || ''))
      }
    });
    
    if (spinner) spinner.style.display = 'none';
    const result = await response.json();
    
    if (response.ok && result.availableZones && result.availableZones.length > 0) {
      result.availableZones.forEach(zone => {
        const option = document.createElement('option');
        option.value = zone;
        option.textContent = zone;
        if (zone === currentZone) option.selected = true;
        zoneSelect.appendChild(option);
      });
      
      if (statusMessage) {
        statusMessage.textContent = `${result.availableZones.length} verified zone(s) available`;
        statusMessage.style.color = '#28a745';
      }
    } else if (result.hasZoneConcept === false) {
      if (statusMessage) {
        statusMessage.textContent = 'Zone not applicable, auto-selection will be used';
        statusMessage.style.color = '#666';
      }
    } else {
      if (statusMessage) {
        statusMessage.textContent = result.errorMessage || 'No verified zones available';
        statusMessage.style.color = '#856404';
      }
    }
  } catch (error) {
    if (spinner) spinner.style.display = 'none';
    if (statusMessage) {
      const errorDetails = error && error.message ? ` (${error.message})` : '';
      statusMessage.textContent = 'Failed to fetch zones. Please check your connection.' + errorDetails;
      statusMessage.style.color = '#dc3545';
    }
    console.warn('Zone fetch failed:', error);
  }
}

/**
 * Parse labels from comma-separated key=value string format.
 * @param {string} labelsText - Comma-separated labels (e.g., "role=worker, env=prod")
 * @returns {Object} Parsed labels as key-value object
 */
function parseLabelsString(labelsText) {
  const labels = {};
  if (labelsText) {
    labelsText.split(',').forEach(pair => {
      const [key, value] = pair.trim().split('=');
      if (key && value) {
        labels[key.trim().toLowerCase()] = value.trim();
      }
    });
  }
  return labels;
}

/**
 * Convert labels object to comma-separated key=value string.
 * @param {Object} labelsObj - Labels as key-value object
 * @returns {string} Comma-separated string (e.g., "role=worker, env=prod")
 */
function labelsToString(labelsObj) {
  if (!labelsObj) return '';
  return Object.entries(labelsObj).map(([k, v]) => `${k}=${v}`).join(', ');
}

// ========== Common Popup Styles ==========
const POPUP_STYLES = `
  <style>
    .popup-container { text-align: left; }
    .popup-section {
      background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 8px;
    }
    .popup-section-title {
      font-size: 0.75rem;
      font-weight: 600;
      color: #6c757d;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid #e9ecef;
    }
    .popup-row {
      display: flex;
      gap: 12px;
      margin-bottom: 6px;
    }
    .popup-row:last-child { margin-bottom: 0; }
    .popup-col { flex: 1; min-width: 0; }
    .popup-col-2 { flex: 2; }
    .popup-field { display: flex; flex-direction: column; gap: 2px; }
    .popup-label { font-size: 0.75rem; color: #888; font-weight: 500; }
    .popup-value { font-size: 0.85rem; font-weight: 600; color: #333; }
    .popup-value-sm { font-size: 0.8rem; color: #555; word-break: break-all; }
    .popup-value-highlight { color: #0d6efd; }
    .popup-value-price { color: #dc3545; }
    .popup-value-gpu { color: #dc3545; font-weight: 700; }
    .popup-input {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid #ced4da;
      border-radius: 5px;
      font-size: 0.85rem;
    }
    .popup-input:focus {
      border-color: #0d6efd;
      box-shadow: 0 0 0 2px rgba(13, 110, 253, 0.15);
      outline: none;
    }
    .popup-select {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid #ced4da;
      border-radius: 5px;
      font-size: 0.85rem;
      background: white;
    }
    .popup-hint { font-size: 0.7rem; color: #999; }
    .popup-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .popup-badge-provider {
      background: linear-gradient(135deg, #0d6efd 0%, #0056b3 100%);
      color: white;
    }
    .popup-inline { display: flex; align-items: center; gap: 6px; }
  </style>
`;

/**
 * Build HTML for NodeGroup Configuration popup with spec, image, and Node settings.
 * Creates a modern, compact layout with grouped sections.
 * @param {Object} spec - Node specification object with provider, region, CPU, memory, etc.
 * @param {Object} nodeConf - Node configuration object with imageId, zone, labels, etc.
 * @param {Object} options - Optional configuration parameters
 * @param {boolean} options.isEdit - Whether this is edit mode (vs new spec selection)
 * @param {string} options.imageSelectHTML - Custom HTML for image selection input
 * @param {boolean} options.showValidation - Show validation section (for new specs)
 * @param {Object} options.validationResult - Validation result object
 * @returns {string} Complete HTML string for the popup content
 */
// Returns a CSP-specific hint describing how "distribute Nodes across subnets" behaves for the
// given provider, based on how CB-Tumblebug provisions subnets per CSP and each CSP's subnet model.
function subnetDistributionCspHint(providerName) {
  const p = resolveCloudPlatform(providerName);
  if (p === 'ibm')
    return "⚠ IBM uses a single subnet (VPC constraint) — distribution has no effect; all Nodes share one subnet.";
  if (p === 'ncp')
    return "⚠ NCP places all subnets in the same zone — Nodes spread across subnets but stay in one AZ.";
  if (p === 'gcp' || p === 'azure')
    return "ℹ " + p.toUpperCase() + " subnets are regional (not per-AZ): this spreads Nodes across subnets, but AZ placement is independent — limited AZ-HA benefit.";
  if (p === 'aws' || p === 'alibaba' || p === 'tencent')
    return "✅ " + p.toUpperCase() + " subnets are per-AZ: distribution spreads Nodes across AZs (higher availability). Note: cross-AZ traffic may incur extra cost/latency.";
  return "ℹ Effect depends on this CSP's subnet/zone model; best-effort across zones where the spec is available.";
}



/**
 * Display a modal to select a specification from the recommendation list.
 * @param {Array} specs - List of spec objects
 * @param {Object} [options] - Optional title, subTitle
 * @returns {Promise<Object|null>} Selected spec or null if canceled
 */
function openSpecSelectionDialog(specs, options = {}) {
  if (!specs || specs.length === 0) {
    errorAlert("No recommended spec found with the given condition");
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    Swal.fire({
      title: options.title || "Select a Spec from the Recommendation List",
      width: 1200,
      position: 'center',
      html: `
        <div class="compact-datatable">
          ${options.subTitle ? `<div style="margin-bottom:8px;padding:6px 12px;background:#e8f4fd;border:1px solid #b6d4fe;border-radius:5px;font-size:0.85rem;color:#084298;font-weight:600;">${options.subTitle}</div>` : ''}
          <div class="table-responsive">
            <table id="specSelectionTable" class="display nowrap" style="width:100%">
              <thead>
                <tr>
                  <th>#</th>
                  <th>CSP</th>
                  <th>Region</th>
                  <th>SpecName</th>
                  <th>Arch</th>
                  <th>vCPU</th>
                  <th>Mem(Gi)</th>
                  <th>Cost($/h)</th>
                  <th>Accelerator</th>
                </tr>
              </thead>
              <tbody>
                ${specs.map((spec, index) => {
                  let costPerHour = spec.costPerHour < 0 || !spec.costPerHour
                    ? "unknown"
                    : `$${spec.costPerHour}`;

                  let acceleratorInfo;
                  if (spec.acceleratorModel && spec.acceleratorModel !== "undefined" && spec.acceleratorModel !== "") {
                    acceleratorInfo = `<span style="color:red;font-weight:bold">${spec.acceleratorModel} (C:${spec.acceleratorCount} ${spec.acceleratorMemoryGB})</span>`;
                  } else {
                    acceleratorInfo = "None";
                  }

                  return `
                    <tr id="spec-row-${index}" class="${index === 0 ? 'selected-spec' : ''}" data-index="${index}">
                      <td class="text-left">${index + 1}</td>
                      <td class="text-left">${spec.providerName.toUpperCase()}</td>
                      <td class="text-left">${spec.regionName}</td>
                      <td class="text-left">${spec.cspSpecName}</td>
                      <td>${spec.architecture}</td>
                      <td>${spec.vCPU}</td>
                      <td>${spec.memoryGiB}</td>
                      <td>${costPerHour}</td>
                      <td class="text-left">${acceleratorInfo}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div id="specDetailsContainer" style="margin-top:15px;padding:8px;border:1px solid #ddd;border-radius:5px;height:280px;overflow-y:auto;display:flex;flex-direction:column;">
            <h5 style="font-size: 0.85rem;margin-bottom:5px;flex-shrink:0;">Selected Spec Details</h5>
            <div id="specDetailsContent" style="flex:1;overflow-y:auto;"></div>
          </div>
          <input type="hidden" id="selectedSpecIndex" value="0">
        </div>
        <style>
          .compact-datatable { font-size: 0.8rem; }
          .selected-spec {
            background-color: rgba(40, 167, 69, 0.35) !important;
            border-left: 5px solid rgb(40, 167, 69) !important;
            font-weight: bold;
          }
          table.dataTable tbody tr.selected-spec {
            background-color: rgba(40, 167, 69, 0.35) !important;
            border-left: 5px solid rgb(40, 167, 69) !important;
          }
          #specSelectionTable tbody tr { cursor: pointer; }
          #specSelectionTable tbody tr:hover { background-color: rgba(0, 123, 255, 0.08) !important; }
          #specDetailsContent .row p { margin-bottom: 0.2rem; }
        </style>
      `,
      didOpen: () => {
        $('#specSelectionTable tbody').on('click', 'tr', function () {
          const index = $(this).data('index');
          selectSpecRow(index);
        });

        window.selectSpecRow = function (index) {
          document.querySelectorAll('#specSelectionTable tbody tr').forEach(row => {
            row.classList.remove('selected-spec');
          });
          const selectedRow = document.getElementById(`spec-row-${index}`);
          if (selectedRow) {
            selectedRow.classList.add('selected-spec');
          }
          const selInput = document.getElementById('selectedSpecIndex');
          if (selInput) selInput.value = index;
          updateSpecDetails(index);
        };

        function updateSpecDetails(index) {
          const spec = specs[index];
          if (!spec) return;
          let costPerHour = spec.costPerHour < 0 || !spec.costPerHour ? "unknown" : `$${spec.costPerHour}`;

          const specInfoHTML = `
            <div style="margin:0; padding:0; text-align: left;">
              <div style="margin-bottom:3px; text-align: left;"><strong>CSP:</strong> ${spec.providerName.toUpperCase()}</div>
              <div style="margin-bottom:3px; text-align: left;"><strong>Region:</strong> ${spec.regionName}</div>
              <div style="margin-bottom:3px; text-align: left;"><strong>Spec Name:</strong> ${spec.cspSpecName}</div>
              <div style="margin-bottom:3px; text-align: left;"><strong>Architecture:</strong> ${spec.architecture}</div>
              <div style="margin-bottom:3px; text-align: left;"><strong>vCPU:</strong> ${spec.vCPU}</div>
              <div style="margin-bottom:3px; text-align: left;"><strong>Memory:</strong> ${spec.memoryGiB} GiB</div>
              <div style="margin-bottom:3px; text-align: left;"><strong>Storage:</strong> ${spec.storageGiB} GiB</div>
              <div style="margin-bottom:3px; text-align: left;"><strong>Cost:</strong> <span style="color: ${costPerHour === 'unknown' ? 'orange' : 'green'};">${costPerHour}/hour</span></div>
              ${spec.acceleratorType === "gpu" ? `
                <div style="margin-bottom:3px; text-align: left;"><strong>Accelerator:</strong> <span style="color: red; font-weight: bold;">✓ GPU (${spec.acceleratorModel})</span></div>
                <div style="margin-bottom:3px; text-align: left;"><strong>GPU Count:</strong> ${spec.acceleratorCount}</div>
                <div style="margin-bottom:3px; text-align: left;"><strong>GPU Memory:</strong> ${spec.acceleratorMemoryGB} GB</div>
              ` : `
                <div style="margin-bottom:3px; text-align: left;"><strong>Accelerator:</strong> <span style="color: gray;">None</span></div>
              `}
            </div>
          `;

          let detailsTableHTML = "";
          if (spec.details && Array.isArray(spec.details) && spec.details.length > 0) {
            detailsTableHTML = `
              <div style="margin-top: 8px; text-align: left;">
                <table style="width:100%; border-collapse: collapse; font-size: 0.75rem; text-align: left;">
                  <thead>
                    <tr>
                      <th style="width: 35%; padding: 3px; border: 1px solid #ddd; background: #f8f9fa; text-align: left;">Property</th>
                      <th style="padding: 3px; border: 1px solid #ddd; background: #f8f9fa; text-align: left;">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${spec.details.map(item =>
                      `<tr>
                        <td style="padding: 3px; border: 1px solid #ddd; text-align: left;"><strong>${item.key}</strong></td>
                        <td style="padding: 3px; border: 1px solid #ddd; word-wrap: break-word; text-align: left;">${item.value}</td>
                      </tr>`
                    ).join('')}
                  </tbody>
                </table>
              </div>
            `;
          }

          const detailsHTML = specInfoHTML + detailsTableHTML;
          const container = document.getElementById('specDetailsContent');
          if (container) container.innerHTML = detailsHTML;
        }

        $('#specSelectionTable').DataTable({
          "paging": true,
          "searching": true,
          "ordering": true,
          "info": true,
          "responsive": true,
          "scrollX": true,
          "pageLength": 5,
          "lengthMenu": [5, 10, 25, 50],
          "order": [[0, 'asc']],
          "columnDefs": [{ "targets": -1, "orderable": false }],
          "language": {
            "search": "Filtering Keyword:",
            "lengthMenu": "Show _MENU_ entries",
            "info": "_START_ - _END_ of _TOTAL_",
            "infoEmpty": "No data available",
            "paginate": { "first": "First", "last": "Last", "next": "Next", "previous": "Previous" }
          }
        });

        updateSpecDetails(0);
      },
      showCancelButton: true,
      confirmButtonText: "Continue",
      cancelButtonText: "Cancel",
      preConfirm: () => {
        const el = document.getElementById('selectedSpecIndex');
        const val = el ? parseInt(el.value, 10) : 0;
        return isNaN(val) ? 0 : val;
      }
    }).then((result) => {
      if (result.isConfirmed) {
        resolve(specs[result.value]);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Search available images and custom images for a given spec.
 * Returns an array of image objects sorted appropriately (with GPU prioritization if applicable).
 * @param {Object} selectedSpec
 * @returns {Promise<Array>}
 */
async function fetchImagesForSpec(selectedSpec) {
  const searchImageURL = `${tbApiBase()}/ns/system/resources/searchImage`;
  const osTypeEl = document.getElementById("osImage");
  const osType = osTypeEl ? osTypeEl.value : "ubuntu";
  const searchImageBody = {
    matchedSpecId: selectedSpec.id,
    osType: osType,
  };

  const username = window.configUsername || getConfig().username || '';
  const password = window.configPassword || getConfig().password || '';
  const namespace = window.configNamespace || getConfig().namespace || '';

  const [searchRes, customImageRes] = await Promise.all([
    axios({
      method: "post",
      url: searchImageURL,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify(searchImageBody),
      auth: { username, password },
    }).catch(err => {
      console.warn("Failed to fetch regular images:", err);
      return { data: { imageList: [] } };
    }),
    axios({
      method: "get",
      url: `${tbApiBase()}/ns/${namespace}/resources/customImage`,
      headers: { "Content-Type": "application/json" },
      auth: { username, password },
    }).catch(err => {
      console.log("Failed to fetch custom images (will continue with regular images only):", err);
      return { data: { customImage: [] } };
    })
  ]);

  let availableImages = [];
  let customImages = [];

  if (searchRes.data && searchRes.data.imageList && searchRes.data.imageList.length > 0) {
    availableImages = searchRes.data.imageList.map(img => ({
      id: img.id || "unknown",
      cspImageName: img.cspImageName || "unknown",
      osType: img.osType || "unknown",
      osDistribution: img.osDistribution || "unknown",
      osArchitecture: img.osArchitecture || "unknown",
      creationDate: img.creationDate || "unknown",
      description: img.description || "No description",
      imageStatus: img.imageStatus || "unknown",
      osPlatform: img.osPlatform || "unknown",
      osDiskType: img.osDiskType || "unknown",
      osDiskSizeGB: img.osDiskSizeGB || "unknown",
      providerName: img.providerName || "unknown",
      connectionName: img.connectionName || "unknown",
      infraType: img.infraType || "unknown",
      isGPUImage: img.isGPUImage || false,
      isKubernetesImage: img.isKubernetesImage || false,
      isBasicImage: img.isBasicImage || false,
      isBasicGpuImage: img.isBasicGpuImage || false,
      isCustomImage: false,
      details: img.details || []
    }));
  }

  if (customImageRes.data && customImageRes.data.customImage && customImageRes.data.customImage.length > 0) {
    const selectedProvider = selectedSpec.providerName;
    const selectedRegion = selectedSpec.regionName;

    customImages = customImageRes.data.customImage
      .filter(img => {
        const imgProvider = img.providerName || '';
        if (imgProvider !== selectedProvider) return false;
        const imgRegions = Array.isArray(img.regionList) ? img.regionList : [img.regionList];
        if (selectedRegion && !imgRegions.includes(selectedRegion)) return false;
        return true;
      })
      .map(img => ({
        id: img.id || "unknown",
        cspImageName: img.cspImageName || img.name || "unknown",
        osType: img.osType || img.guestOS || "unknown",
        osDistribution: img.osDistribution || img.description || "Custom Image",
        osArchitecture: img.osArchitecture || "unknown",
        creationDate: img.creationDate || "unknown",
        description: img.description || "Custom Image",
        imageStatus: img.imageStatus || img.status || "unknown",
        osPlatform: img.osPlatform || "unknown",
        osDiskType: img.osDiskType || "unknown",
        osDiskSizeGB: img.osDiskSizeGB || "unknown",
        providerName: img.providerName || "unknown",
        connectionName: img.connectionName || "unknown",
        infraType: img.infraType || "unknown",
        isGPUImage: false,
        isKubernetesImage: false,
        isBasicImage: false,
        isBasicGpuImage: false,
        isCustomImage: true,
        details: img.details || []
      }));
  }

  availableImages = [...customImages, ...availableImages];

  const isGpuSpec = selectedSpec.acceleratorType === "gpu";
  if (isGpuSpec) {
    const gpuSortScore = img =>
      img.isCustomImage    ? 4 :
      img.isBasicGpuImage  ? 3 :
      img.isBasicImage     ? 2 :
      img.isGPUImage       ? 1 : 0;
    availableImages.sort((a, b) => gpuSortScore(b) - gpuSortScore(a));
  }

  return availableImages;
}

/**
 * Display a modal to select an image for a given specification.
 * Supports direct image ID input and table row selection.
 * @param {Object} selectedSpec - Specification object
 * @param {string|null} [preselectedImageId] - Pre-selected image ID to highlight
 * @returns {Promise<Object|null>} { selectedImage, selectedImageId } or null if canceled
 */
async function openImageSelectionDialog(selectedSpec, preselectedImageId = null) {
  // Show quick loading popup while searching images
  Swal.fire({
    title: 'Loading Images',
    text: 'Searching available images for spec...',
    allowOutsideClick: false,
    didOpen: () => { Swal.showLoading(); }
  });

  let availableImages = [];
  try {
    availableImages = await fetchImagesForSpec(selectedSpec);
  } catch (err) {
    console.error("Failed to fetch images for spec:", err);
  }
  Swal.close();

  if (!availableImages || availableImages.length === 0) {
    errorAlert("No images found for the selected specification");
    return null;
  }

  let initialIndex = 0;
  if (preselectedImageId) {
    const idx = availableImages.findIndex(img => (img.cspImageName === preselectedImageId || img.id === preselectedImageId));
    if (idx >= 0) initialIndex = idx;
  }

  const isGpuSpec = selectedSpec.acceleratorType === "gpu";
  const specCost = (selectedSpec.costPerHour > 0)
    ? `$${parseFloat(selectedSpec.costPerHour).toFixed(5)}/h`
    : 'N/A';
  const specAccel = (selectedSpec.acceleratorType === 'gpu' && selectedSpec.acceleratorModel)
    ? `<span style="color:#c0392b;font-weight:bold;"> | GPU: ${esc(selectedSpec.acceleratorModel)} ×${esc(String(selectedSpec.acceleratorCount || '?'))} (${esc(String(selectedSpec.acceleratorMemoryGB || '?'))}GB/ea)</span>`
    : '';

  return new Promise((resolve) => {
    Swal.fire({
      title: "Select an Image from the Image Search List",
      width: 1200,
      html: `
        <div class="compact-datatable">
          <div style="margin-bottom:8px;padding:6px 12px;background:#f0f4ff;border:1px solid #c5cae9;border-radius:5px;font-size:0.8rem;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="font-weight:bold;color:#1565c0;">Selected Spec</span>
            <span style="font-family:monospace;color:#333;">${esc(selectedSpec.id || '')}</span>
            <span style="color:#555;">| ${esc((selectedSpec.providerName || '').toUpperCase())} ${esc(selectedSpec.regionName || '')}</span>
            <span style="color:#555;">| vCPU: ${esc(String(selectedSpec.vCPU || ''))} | Mem: ${esc(String(selectedSpec.memoryGiB || ''))} GiB | Arch: ${esc(selectedSpec.architecture || 'N/A')}</span>
            <span style="color:#555;">| ${esc(specCost)}</span>
            ${specAccel}
          </div>
          ${isGpuSpec ? `
          <div style="margin-bottom:8px;padding:6px 10px;background:linear-gradient(90deg,#fff3cd,#fff8e1);border:1px solid #ffc107;border-radius:5px;font-size:0.8rem;display:flex;align-items:center;gap:6px;">
            <span style="font-size:1.1em;">⚡</span>
            <span><b>GPU Spec selected</b> — <span style="color:#e74c3c;">⭐🧮 Basic GPU images</span> (GPU drivers pre-installed) are listed first. Plain OS images are also available.</span>
          </div>` : ''}
          <div class="table-responsive">
            <table id="imageSelectionTable" class="display nowrap" style="width:100%">
              <thead>
                <tr>
                  <th>#</th>
                  <th>OS Type</th>
                  <th>Image Name</th>
                  <th>Distribution</th>
                  <th>Support</th>
                  <th>Arch</th>
                </tr>
              </thead>
              <tbody>
                ${availableImages.map((image, index) => {
                  const isRecommendedGpu = isGpuSpec && image.isBasicGpuImage;
                  const isCustomClass = image.isCustomImage ? 'custom-image-row' : '';
                  const rowClass = isRecommendedGpu ? 'recommended-gpu-image-row' : (image.isBasicImage ? 'basic-image-row' : '');
                  const customIcon = image.isCustomImage ? ' <span class="custom-image-icon" title="Custom Image (Snapshot)">📸</span>' : '';
                  const basicIcon = image.isBasicImage ? ' <span class="basic-image-icon" title="Basic OS Image">⭐</span>' : '';
                  const gpuIcon = image.isBasicGpuImage
                    ? ' <span class="recommended-gpu-icon" title="Basic GPU Image (GPU drivers pre-installed)">⭐🧮</span>'
                    : (image.isGPUImage ? ' <span class="ml-image-icon" title="GPU Support">🧮</span>' : '');
                  const k8sIcon = image.isKubernetesImage ? ' <span class="k8s-image-icon" title="Kubernetes Support">☸️</span>' : '';
                  const truncateText = (text, maxLength) => {
                    if (!text) return '';
                    if (text.length <= maxLength) return text;
                    return text.substring(0, maxLength) + '..';
                  };
                  const truncatedImageName = truncateText(image.cspImageName, 70);
                  const truncatedDistribution = truncateText(image.osDistribution, 70);
                  return `
                    <tr id="image-row-${index}" class="${index === initialIndex ? 'selected-image' : ''} ${isCustomClass} ${rowClass}" data-index="${index}">
                      <td class="text-left">${index + 1}${customIcon}${basicIcon}</td>
                      <td class="text-left">${image.osType}</td>
                      <td class="text-left" style="font-size: 0.85em; color: #0066cc;" title="${image.cspImageName}">${truncatedImageName}</td>
                      <td class="text-left" style="font-size: 0.9em;" title="${image.osDistribution}">${truncatedDistribution}</td>
                      <td class="text-center">${gpuIcon}${k8sIcon}</td>
                      <td class="text-center">${image.osArchitecture}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div id="imageDetailsContainer" style="margin-top:15px;padding:8px;border:1px solid #ddd;border-radius:5px;height:280px;overflow-y:auto;display:flex;flex-direction:column;">
            <h5 style="font-size: 0.85rem;margin-bottom:5px;flex-shrink:0;">Selected Image Details</h5>
            <div id="imageDetailsContent" style="flex:1;overflow-y:auto;"></div>
          </div>
          <details id="directImageIdContainer" style="margin-top:10px;border:1px solid #ced4da;border-radius:5px;background-color:#f8f9fa;">
            <summary style="padding:8px 12px;cursor:pointer;font-size:0.8rem;color:#6c757d;user-select:none;">Enter Image ID directly...</summary>
            <div style="padding:10px 12px;border-top:1px solid #ced4da;">
              <div style="display:flex;gap:8px;align-items:center;">
                <input type="text" id="directImageIdInput" placeholder="e.g., ami-0abcdef1234567890" aria-label="Direct Image ID Input" style="flex:1;padding:6px 8px;border:1px solid #ced4da;border-radius:4px;font-size:0.8rem;">
                <button type="button" id="useDirectImageIdBtn" class="btn btn-info btn-sm" style="padding:4px 10px;font-size:0.75rem;">Apply</button>
                <button type="button" id="clearDirectImageIdBtn" class="btn btn-outline-secondary btn-sm" style="padding:4px 8px;font-size:0.75rem;">Clear</button>
              </div>
              <div id="directImageIdStatus" style="margin-top:6px;font-size:0.75rem;"></div>
            </div>
          </details>
          <input type="hidden" id="selectedImageIndex" value="${initialIndex}">
          <input type="hidden" id="useDirectImageIdFlag" value="false">
          <input type="hidden" id="directImageIdValue" value="">
        </div>
        <style>
          .compact-datatable { font-size: 0.8rem; }
          #imageSelectionTable { table-layout: fixed !important; width: 100% !important; }
          #imageSelectionTable th:nth-child(1), #imageSelectionTable td:nth-child(1) { width: 8%; }
          #imageSelectionTable th:nth-child(2), #imageSelectionTable td:nth-child(2) { width: 12%; }
          #imageSelectionTable th:nth-child(3), #imageSelectionTable td:nth-child(3) { width: 35% !important; max-width: 35% !important; min-width: 35% !important; }
          #imageSelectionTable th:nth-child(4), #imageSelectionTable td:nth-child(4) { width: 35% !important; max-width: 35% !important; min-width: 35% !important; }
          #imageSelectionTable th:nth-child(5), #imageSelectionTable td:nth-child(5) { width: 10%; }
          #imageSelectionTable th:nth-child(6), #imageSelectionTable td:nth-child(6) { width: 10%; }
          #imageSelectionTable th, #imageSelectionTable td { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .selected-image { background-color: rgba(40, 167, 69, 0.35) !important; border-left: 5px solid rgb(40, 167, 69) !important; font-weight: bold; }
          table.dataTable tbody tr.selected-image { background-color: rgba(40, 167, 69, 0.35) !important; border-left: 5px solid rgb(40, 167, 69) !important; }
          #imageSelectionTable tbody tr { cursor: pointer; }
          #imageSelectionTable tbody tr:hover { background-color: rgba(0, 123, 255, 0.08) !important; }
          .recommended-gpu-image-row { background-color: rgba(255, 193, 7, 0.1) !important; border-left: 3px solid #ffc107 !important; }
          .recommended-gpu-image-row:hover { background-color: rgba(255, 193, 7, 0.15) !important; }
          .basic-image-row { background-color: rgba(255, 193, 7, 0.1) !important; border-left: 3px solid #ffc107 !important; }
          .basic-image-row:hover { background-color: rgba(255, 193, 7, 0.15) !important; }
          .custom-image-row { background-color: rgba(138, 43, 226, 0.1) !important; border-left: 3px solid #8a2be2 !important; }
          .custom-image-row:hover { background-color: rgba(138, 43, 226, 0.15) !important; }
          .custom-image-icon { color: #8a2be2; font-size: 1.1em; margin-left: 5px; text-shadow: 0 0 3px rgba(138, 43, 226, 0.5); }
          .basic-image-icon { color: #ffc107; font-size: 1.1em; margin-left: 5px; text-shadow: 0 0 3px rgba(255, 193, 7, 0.5); }
          .ml-image-icon { color: #e74c3c; font-size: 1.1em; margin-left: 3px; text-shadow: 0 0 3px rgba(231, 76, 60, 0.5); }
          .k8s-image-icon { color: #3498db; font-size: 1.1em; margin-left: 3px; text-shadow: 0 0 3px rgba(52, 152, 219, 0.5); }
        </style>
      `,
      didOpen: () => {
        $('#imageSelectionTable tbody').on('click', 'tr', function () {
          const index = $(this).data('index');
          selectImageRow(index);
        });

        window.selectImageRow = function (index) {
          document.querySelectorAll('#imageSelectionTable tbody tr').forEach(row => {
            row.classList.remove('selected-image');
          });
          const selectedRow = document.getElementById(`image-row-${index}`);
          if (selectedRow) {
            selectedRow.classList.add('selected-image');
          }
          const selInput = document.getElementById('selectedImageIndex');
          if (selInput) selInput.value = index;
          updateImageDetails(index);
        };

        function updateImageDetails(index) {
          const image = availableImages[index];
          if (!image) return;

          const imageInfoHTML = `
            <div style="margin:0; padding:0; text-align: left;">
              <div style="margin-bottom:3px; text-align: left;"><strong>Name:</strong> ${image.cspImageName}</div>
              <div style="margin-bottom:3px; text-align: left;"><strong>Distribution:</strong> ${image.osDistribution}</div>
              <div style="margin-bottom:3px; text-align: left;"><strong>Description:</strong> ${image.description}</div>
              <div style="margin-bottom:3px; text-align: left;"><strong>Status:</strong> <span style="color: ${image.imageStatus === 'Available' || image.imageStatus === 'available' ? 'green' : 'orange'};">${image.imageStatus}</span></div>
              ${image.isKubernetesImage ? `<div style="margin-bottom:3px; text-align: left;"><strong>K8s Support:</strong> <span style="color: blue; font-weight: bold;">✓ Yes</span></div>` : ''}
              ${image.isGPUImage ? `<div style="margin-bottom:3px; text-align: left;"><strong>GPU Support:</strong> <span style="color: red; font-weight: bold;">✓ Yes</span></div>` : ''}
              ${image.isBasicImage ? `<div style="margin-bottom:3px; text-align: left;"><strong>Basic Image:</strong> <span style="color: green; font-weight: bold;">✓ Yes</span></div>` : ''}
              ${image.isBasicGpuImage ? `<div style="margin-bottom:3px; text-align: left;"><strong>Basic GPU Image:</strong> <span style="color: red; font-weight: bold;">✓ Yes (GPU drivers pre-installed)</span></div>` : ''}
            </div>
          `;

          let detailsTableHTML = "";
          if (image.details && Array.isArray(image.details) && image.details.length > 0) {
            detailsTableHTML = `
              <div style="margin-top: 8px; text-align: left;">
                <table style="width:100%; border-collapse: collapse; font-size: 0.75rem; text-align: left;">
                  <thead>
                    <tr>
                      <th style="width: 35%; padding: 3px; border: 1px solid #ddd; background: #f8f9fa; text-align: left;">Property</th>
                      <th style="padding: 3px; border: 1px solid #ddd; background: #f8f9fa; text-align: left;">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${image.details.map(item =>
                      `<tr>
                        <td style="padding: 3px; border: 1px solid #ddd; text-align: left;"><strong>${item.key}</strong></td>
                        <td style="padding: 3px; border: 1px solid #ddd; word-wrap: break-word; text-align: left;">${item.value}</td>
                      </tr>`
                    ).join('')}
                  </tbody>
                </table>
              </div>
            `;
          }

          const detailsHTML = imageInfoHTML + detailsTableHTML;
          const container = document.getElementById('imageDetailsContent');
          if (container) container.innerHTML = detailsHTML;
        }

        $('#imageSelectionTable').DataTable({
          "paging": true,
          "searching": true,
          "ordering": true,
          "info": true,
          "responsive": true,
          "scrollX": true,
          "pageLength": 5,
          "lengthMenu": [5, 10, 25, 50],
          "order": [[0, 'asc']],
          "columnDefs": [
            { "targets": 0, "type": "num" },
            { "targets": -1, "orderable": false },
            { "targets": -2, "orderable": false }
          ],
          "language": {
            "search": "Filtering Keyword:",
            "lengthMenu": "Show _MENU_ entries",
            "info": "_START_ - _END_ of _TOTAL_",
            "infoEmpty": "No data available",
            "paginate": { "first": "First", "last": "Last", "next": "Next", "previous": "Previous" }
          }
        });

        updateImageDetails(initialIndex);

        $('#useDirectImageIdBtn').on('click', function() {
          const directImageId = $('#directImageIdInput').val().trim();
          if (!directImageId) {
            $('#directImageIdStatus').html('<span style="color:red;">⚠️ Please enter an Image ID</span>');
            return;
          }
          $('#useDirectImageIdFlag').val('true');
          $('#directImageIdValue').val(directImageId);
          $('#imageSelectionTable tbody tr').removeClass('selected-image');
          const escapedId = $('<div>').text(directImageId).html();
          $('#directImageIdStatus').html('<span style="color:green;">✅ Applied: <code>' + escapedId + '</code></span>');
          $('#directImageIdContainer').css('border-color', '#28a745').css('background-color', '#d4edda');
        });

        $('#clearDirectImageIdBtn').on('click', function() {
          $('#useDirectImageIdFlag').val('false');
          $('#directImageIdValue').val('');
          $('#directImageIdInput').val('');
          $('#directImageIdStatus').html('');
          $('#directImageIdContainer').css('border-color', '#ced4da').css('background-color', '#f8f9fa');
          selectImageRow(0);
        });
      },
      showCancelButton: true,
      confirmButtonText: "Continue",
      cancelButtonText: "Cancel",
      preConfirm: () => {
        const useDirect = document.getElementById('useDirectImageIdFlag').value === 'true';
        const directImageId = document.getElementById('directImageIdValue').value;
        const selectedIndex = parseInt(document.getElementById('selectedImageIndex').value, 10);
        return {
          useDirectImageId: useDirect,
          directImageId: directImageId,
          selectedIndex: isNaN(selectedIndex) ? 0 : selectedIndex
        };
      }
    }).then((imageResult) => {
      if (imageResult.isConfirmed) {
        let selectedImageId;
        let selectedImage;
        if (imageResult.value.useDirectImageId && imageResult.value.directImageId) {
          selectedImageId = imageResult.value.directImageId;
          selectedImage = {
            cspImageName: selectedImageId,
            osDistribution: "Direct Image ID (will be auto-registered if available in CSP)",
            osType: "Unknown",
            osArchitecture: "Unknown",
            isDirectInput: true
          };
        } else {
          selectedImage = availableImages[imageResult.value.selectedIndex] || availableImages[0];
          selectedImageId = selectedImage.cspImageName || selectedImage.id;
        }
        resolve({ selectedImage, selectedImageId });
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Populate Image dropdown in Edit NodeGroup modal.
 * Groups images into Custom Images (Snapshot), Basic OS/GPU Images, and Other Images.
 * @param {string} selectId - DOM element ID of select
 * @param {string} spinnerId - DOM element ID of spinner
 * @param {Object} spec - Spec object
 * @param {string} currentImageId - Current image ID
 * @param {string} [infoId] - DOM element ID for text description
 */
async function populateEditImageSelect(selectId, spinnerId, spec, currentImageId, infoId) {
  const select = document.getElementById(selectId);
  const spinner = document.getElementById(spinnerId);
  const infoEl = infoId ? document.getElementById(infoId) : null;
  if (!select) return;

  if (spinner) spinner.style.display = 'inline-block';

  try {
    const images = await fetchImagesForSpec(spec);
    if (spinner) spinner.style.display = 'none';

    select.innerHTML = '';

    const customImgs = images.filter(img => img.isCustomImage);
    const basicImgs = images.filter(img => !img.isCustomImage && (img.isBasicImage || img.isBasicGpuImage));
    const otherImgs = images.filter(img => !img.isCustomImage && !img.isBasicImage && !img.isBasicGpuImage);

    let foundCurrent = false;

    const createGroup = (label, list) => {
      if (!list || list.length === 0) return;
      const grp = document.createElement('optgroup');
      grp.label = label;
      list.forEach(img => {
        const opt = document.createElement('option');
        opt.value = img.cspImageName || img.id;
        const icon = img.isCustomImage ? '📸 ' : (img.isBasicGpuImage ? '⭐🧮 ' : (img.isBasicImage ? '⭐ ' : ''));
        opt.textContent = `${icon}${img.osDistribution || img.description || img.cspImageName} (${img.cspImageName})`;
        opt.dataset.distribution = img.osDistribution || img.description || '';
        opt.dataset.cspName = img.cspImageName || '';
        if (opt.value === currentImageId) {
          opt.selected = true;
          foundCurrent = true;
        }
        grp.appendChild(opt);
      });
      select.appendChild(grp);
    };

    createGroup('📸 Custom Images (Snapshot)', customImgs);
    createGroup('⭐ Basic OS / GPU Images', basicImgs);
    createGroup('🌐 Other Available Images', otherImgs);

    if (!foundCurrent && currentImageId) {
      const curOpt = document.createElement('option');
      curOpt.value = currentImageId;
      curOpt.textContent = `Current: ${currentImageId}`;
      curOpt.selected = true;
      select.insertBefore(curOpt, select.firstChild);
    }

    const updateInfo = () => {
      const opt = select.options[select.selectedIndex];
      if (infoEl) {
        if (opt && opt.dataset.distribution) {
          infoEl.textContent = `${opt.dataset.distribution} | ${opt.value}`;
        } else {
          infoEl.textContent = select.value;
        }
      }
    };

    select.addEventListener('change', updateInfo);
    updateInfo();
  } catch (err) {
    if (spinner) spinner.style.display = 'none';
    console.error('Failed to populate edit image select:', err);
    if (infoEl) infoEl.textContent = currentImageId || 'Failed to load image list';
  }
}

/**
 * Open NodeGroup configuration modal (used for adding or configuring NodeGroup).
 * @param {Object} selectedSpec
 * @param {Object} createInfraReqVm
 * @param {string} imageSelectHTML
 * @param {Object} recommendedSpec
 */
function openNodeGroupConfigModal(selectedSpec, createInfraReqVm, imageSelectHTML, recommendedSpec) {
  setTimeout(() => {
    Swal.fire({
      title: "📋 NodeGroup Configuration",
      width: 650,
      html: buildSpecConfigPopupHtml(selectedSpec, createInfraReqVm, {
        isEdit: false,
        showValidation: true,
        imageSelectHTML: imageSelectHTML,
        currentLabels: ''
      }),

      didOpen: () => {
        const getReviewRefinements = () => {
          const rdtEl = document.getElementById('rootDiskTypeSelect');
          const zoneEl = document.getElementById('zoneSelect');
          return {
            rootDiskType: rdtEl ? rdtEl.value : '',
            zone: zoneEl ? zoneEl.value : ''
          };
        };

        let reviewRequestSeq = 0;
        const reviewSpecImagePair = async () => {
          const statusEl = document.getElementById('specImageReviewStatus');
          const spinnerEl = document.getElementById('specImageReviewSpinner');
          const detailsEl = document.getElementById('specImageReviewDetails');
          const sectionEl = document.getElementById('specImageReviewSection');

          if (!statusEl || !detailsEl || !sectionEl) return;

          const mySeq = ++reviewRequestSeq;

          if (spinnerEl) spinnerEl.style.display = '';
          statusEl.textContent = 'Checking...';
          statusEl.style.backgroundColor = '#6c757d';
          statusEl.style.color = '#fff';

          const refinements = getReviewRefinements();

          try {
            const response = await fetch(`${tbApiBase()}/specImagePairReview`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + btoa((window.configUsername || getConfig().username || '') + ':' + (window.configPassword || getConfig().password || ''))
              },
              body: JSON.stringify({
                specId: selectedSpec.id,
                imageId: createInfraReqVm.imageId,
                rootDiskType: refinements.rootDiskType,
                zone: refinements.zone
              })
            });
            
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            if (mySeq !== reviewRequestSeq) return;
            if (spinnerEl) spinnerEl.style.display = 'none';
            
            const escapeHtml = (str) => $('<div>').text(str).html();

            const suggestionParts = [];
            if (result.suggestedZone) {
              suggestionParts.push('Suggested zone: ' + escapeHtml(result.suggestedZone));
            }
            if (result.suggestedSystemDisk) {
              suggestionParts.push('Suggested rootDiskType: ' + escapeHtml(result.suggestedSystemDisk));
            }
            const suggestionLine = suggestionParts.length > 0
              ? '<br><span style="color:#0c5460;">💡 ' + suggestionParts.join(' · ') + '</span>'
              : '';

            const rdtSelect = document.getElementById('rootDiskTypeSelect');
            if (rdtSelect && result.availability && result.availability.zones) {
              const allDisks = new Set();
              result.availability.zones.forEach(z => {
                if (z.available && z.supportedDisks) {
                  z.supportedDisks.forEach(d => { if (d) allDisks.add(d); });
                }
              });
              const newDisks = Array.from(allDisks).filter(
                disk => !Array.from(rdtSelect.options).some(o => o.value === disk)
              );
              if (newDisks.length > 0) {
                const existingGroup = rdtSelect.querySelector('optgroup[data-validation]');
                if (existingGroup) existingGroup.remove();
                const group = document.createElement('optgroup');
                group.label = '💡 Available (from validation)';
                group.setAttribute('data-validation', '1');
                newDisks.forEach(disk => {
                  const opt = document.createElement('option');
                  opt.value = disk;
                  opt.textContent = disk;
                  group.appendChild(opt);
                });
                rdtSelect.appendChild(group);
              }
              if (result.suggestedSystemDisk && (rdtSelect.value === 'default' || rdtSelect.value === '')) {
                rdtSelect.value = result.suggestedSystemDisk;
                rdtSelect.dispatchEvent(new Event('change'));
              }
            }

            if (result.isValid) {
              statusEl.textContent = '✓ Valid';
              statusEl.style.backgroundColor = '#28a745';
              sectionEl.style.borderColor = '#28a745';
              sectionEl.style.backgroundColor = '#d4edda';
              
              let details = [];
              if (result.message) details.push(escapeHtml(result.message));
              if (result.estimatedCost) details.push('Cost: ' + escapeHtml(result.estimatedCost));
              if (result.info && result.info.length > 0) details.push(...result.info.map(escapeHtml));
              let html = details.join(' | ');
              if (result.warnings && result.warnings.length > 0) {
                html += '<br><span style="color:#856404;">⚠ ' + result.warnings.map(escapeHtml).join('<br>⚠ ') + '</span>';
              }
              detailsEl.innerHTML = html + suggestionLine;
            } else {
              statusEl.textContent = '✗ Risk Detected';
              statusEl.style.backgroundColor = '#dc3545';
              sectionEl.style.borderColor = '#dc3545';
              sectionEl.style.backgroundColor = '#f8d7da';
              
              let content = '';
              if (result.message) {
                content += '<strong>' + escapeHtml(result.message) + '</strong>';
              }
              let errors = result.errors || [];
              if (errors.length > 0) {
                content += '<br><span style="color:#dc3545;">' + errors.map(escapeHtml).join('<br>') + '</span>';
              }
              detailsEl.innerHTML = content + suggestionLine;
            }
          } catch (error) {
            if (mySeq !== reviewRequestSeq) return;
            if (spinnerEl) spinnerEl.style.display = 'none';
            statusEl.textContent = '⚠ Check Failed';
            statusEl.style.backgroundColor = '#ffc107';
            statusEl.style.color = '#212529';
            detailsEl.textContent = 'Could not verify: ' + error.message;
            detailsEl.style.color = '#856404';
          }
        };

        const imageIdForDisk = () => {
          const sel = document.getElementById('osImageSelect');
          if (sel && sel.value) return sel.value;
          return createInfraReqVm.imageId || '';
        };
        populateRootDiskTypeSelect('rootDiskTypeSelect', selectedSpec, selectedSpec.rootDiskType || 'default',
          { sizeInputId: 'rootDiskSizeCustom', hintId: 'rootDiskSizeHint', imageId: imageIdForDisk });

        const zonePopulatePromise = populateZoneSelect('zoneSelect', 'zoneLoadingSpinner', selectedSpec.id, '', 'zoneStatusMessage');

        let reviewDebounce = null;
        const scheduleReview = () => {
          if (reviewDebounce) clearTimeout(reviewDebounce);
          reviewDebounce = setTimeout(reviewSpecImagePair, 250);
        };
        const rdtEl = document.getElementById('rootDiskTypeSelect');
        if (rdtEl) rdtEl.addEventListener('change', scheduleReview);
        const zoneEl = document.getElementById('zoneSelect');
        if (zoneEl) zoneEl.addEventListener('change', scheduleReview);

        reviewSpecImagePair();

        if (zonePopulatePromise && typeof zonePopulatePromise.then === 'function') {
          zonePopulatePromise.then(() => {
            const zSel = document.getElementById('zoneSelect');
            if (zSel && zSel.value) scheduleReview();
          }).catch(() => {});
        }

        const vmCountInput = document.getElementById('ndCount');
        if (vmCountInput) {
          vmCountInput.focus();
          vmCountInput.addEventListener('input', function() {
            const value = parseInt(this.value, 10);
            const isValid = !isNaN(value) && value >= 1 && value <= 1000;
            this.style.borderColor = isValid ? '#28a745' : '#dc3545';
            this.style.backgroundColor = isValid ? '#f8fff9' : '#fff5f5';
          });
        }

        const rootDiskInput = document.getElementById('rootDiskSizeCustom');
        if (rootDiskInput) {
          rootDiskInput.addEventListener('input', function() {
            const value = this.value.trim();
            const isValid = value === 'default' || value === '' || /^\d+$/.test(value);
            this.style.borderColor = isValid ? '#28a745' : '#dc3545';
            this.style.backgroundColor = isValid ? '#f8fff9' : '#fff5f5';
          });
        }

        const labelsInput = document.getElementById('vmLabels');
        if (labelsInput) {
          window.setupLabelInputListener('vmLabels');
          const hasGpu = selectedSpec.acceleratorType === "gpu" || selectedSpec.acceleratorModel;
          if (hasGpu) {
            window.autoAddGpuLabel(true, 'vmLabels');
          }
          labelsInput.addEventListener('input', function() {
            const value = this.value.trim();
            const isValid = value === '' || /^[a-zA-Z0-9_-]+=.+?(,[a-zA-Z0-9_-]+=.+?)*$/.test(value);
            this.style.borderColor = isValid ? '#28a745' : '#ffc107';
            this.style.backgroundColor = isValid ? '#f8fff9' : '#fffef5';
            window.syncLabelSuggestionChips('vmLabels');
          });
        }
      },

      inputAttributes: {
        autocapitalize: "off",
      },
      showCancelButton: true,
      confirmButtonText: "➕ Add NodeGroup",
      confirmButtonColor: '#28a745',
      cancelButtonText: "Cancel",
      position: "center",
      backdrop: `rgba(0, 0, 0, 0.08)`,
      preConfirm: () => {
        const vmCountInput = document.getElementById('ndCount');
        let ndCount = parseInt(vmCountInput.value, 10);
        if (isNaN(ndCount) || ndCount < 1) {
          Swal.showValidationMessage('Enter a valid Node count (1 or more)');
          return false;
        }

        const rootDiskTypeSelect = document.getElementById('rootDiskTypeSelect');
        let rootDiskTypeValue = rootDiskTypeSelect ? rootDiskTypeSelect.value : "default";
        if (!rootDiskTypeValue) {
          rootDiskTypeValue = "default";
        }

        const rootDiskSizeInput = document.getElementById('rootDiskSizeCustom');
        let rootDiskSizeValue = rootDiskSizeInput.value.trim();
        if (rootDiskSizeValue !== "" && rootDiskSizeValue !== "0") {
          if (!/^\d+$/.test(rootDiskSizeValue)) {
            Swal.showValidationMessage('Disk size must be empty (default) or a positive number');
            return false;
          }
          const sizeErr = validateDiskSizeAgainstRule(parseInt(rootDiskSizeValue, 10), getSelectedRootDiskRule(rootDiskTypeSelect));
          if (sizeErr) {
            Swal.showValidationMessage(sizeErr);
            return false;
          }
        }

        const osImageSelect = document.getElementById('osImageSelect');
        if (osImageSelect && osImageSelect.value) {
          createInfraReqVm.imageId = osImageSelect.value;
        }
        if (!createInfraReqVm.imageId) {
          Swal.showValidationMessage('Select an OS image');
          return false;
        }

        return ndCount;
      }
    }).then((result) => {
      if (result.value) {
        createInfraReqVm.nodeGroupSize = parseInt(result.value, 10) || 1;
        if (createInfraReqVm.nodeGroupSize <= 0) {
          createInfraReqVm.nodeGroupSize = 1;
        }

        const rootDiskTypeSelect = document.getElementById('rootDiskTypeSelect');
        const rootDiskTypeValue = rootDiskTypeSelect ? rootDiskTypeSelect.value : "default";
        createInfraReqVm.rootDiskType = rootDiskTypeValue || "default";

        const rootDiskSizeInput = document.getElementById('rootDiskSizeCustom').value.trim();
        if (rootDiskSizeInput) {
          createInfraReqVm.rootDiskSize = parseInt(rootDiskSizeInput, 10) || 0;
        } else {
          createInfraReqVm.rootDiskSize = 0;
        }

        const zoneSelect = document.getElementById('zoneSelect');
        const selectedZone = zoneSelect ? zoneSelect.value : "";
        if (selectedZone) {
          createInfraReqVm.zone = selectedZone;
        }

        const distCb = document.getElementById('distributeSubnetsCheckbox');
        if (distCb) {
          createInfraReqVm.distributeSubnets = distCb.checked;
        }

        const vmLabelsInput = document.getElementById('vmLabels').value.trim();
        const labels = parseLabelsString(vmLabelsInput);
        if (Object.keys(labels).length > 0) {
          createInfraReqVm.label = labels;
          Object.entries(labels).forEach(([key, value]) => {
            window.addToRecentLabels(`${key}=${value}`);
          });
        }

        if (window.editingNodeGroupIndex >= 0) {
          nodeGroupRequestFromSpecList[window.editingNodeGroupIndex] = createInfraReqVm;
          recommendedSpecList[window.editingNodeGroupIndex] = recommendedSpec;
          window.editingNodeGroupIndex = -1;
        } else {
          nodeGroupRequestFromSpecList.push(createInfraReqVm);
          recommendedSpecList.push(recommendedSpec);
        }

        renderMapFromConfig();
        updateNodeGroupReview();

        try {
          document.querySelectorAll('.nav-link').forEach(tab => tab.classList.remove('active'));
          document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('show', 'active'));
          const provisionTab = document.getElementById('provision-tab');
          const provisionPane = document.getElementById('provision');
          if (provisionTab && provisionPane) {
            provisionTab.classList.add('active');
            provisionPane.classList.add('show', 'active');
            if (typeof $ !== 'undefined' && $.fn.tab) {
              $(provisionTab).tab('show');
            }
          }
        } catch (error) {
          console.log('Failed to activate provision tab:', error);
        }
      } else {
        console.log("Node configuration cancelled or failed");
        if (window.latLonInputPairIdx > 0) {
          window.latLonInputPairIdx--;
        }
        renderMapFromConfig();
      }
    });
  }, 100);
}

/**
 * Image-first workflow: Find specs and deploy infra starting from a Custom Image.
 * @param {string} imageId - Custom image ID or name
 */
async function selectSpecsForImage(imageId) {
  const cfg = getConfig();
  const namespace = window.configNamespace || cfg.namespace || '';
  const username = window.configUsername || cfg.username || '';
  const password = window.configPassword || cfg.password || '';

  Swal.fire({
    title: 'Finding Specs for Image',
    html: `Searching specs for image <code>${window.escapeHtml(imageId)}</code>...`,
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  let imageObj = null;

  try {
    const res = await axios.get(`${tbApiBase()}/ns/${namespace}/resources/customImage/${encodeURIComponent(imageId)}`, {
      auth: { username, password }
    });
    if (res.data) imageObj = res.data;
  } catch (err) {
    console.log("Direct custom image fetch failed, searching list:", err);
  }

  if (!imageObj) {
    try {
      const listRes = await axios.get(`${tbApiBase()}/ns/${namespace}/resources/customImage`, {
        auth: { username, password }
      });
      if (listRes.data && Array.isArray(listRes.data.customImage)) {
        imageObj = listRes.data.customImage.find(ci => ci.id === imageId || ci.name === imageId || ci.cspImageName === imageId);
      }
    } catch (err) {
      console.warn("Custom image list lookup failed:", err);
    }
  }

  if (!imageObj) {
    try {
      const sysRes = await axios.get(`${tbApiBase()}/ns/system/resources/image/${encodeURIComponent(imageId)}`, {
        auth: { username, password }
      });
      if (sysRes.data) imageObj = sysRes.data;
    } catch (err) {
      console.warn("System image lookup failed:", err);
    }
  }

  if (!imageObj) {
    Swal.close();
    errorAlert(`Could not retrieve details for image: ${imageId}`);
    return;
  }

  const providerName = imageObj.providerName;
  const regionName = Array.isArray(imageObj.regionList) ? imageObj.regionList[0] : (imageObj.regionList || '');

  if (!providerName) {
    Swal.close();
    errorAlert(`Provider information missing for image: ${imageId}`);
    return;
  }

  const policies = [
    { metric: "ProviderName", condition: [{ operand: providerName }] }
  ];
  if (regionName) {
    policies.push({ metric: "RegionName", condition: [{ operand: regionName }] });
  }

  const recommendReq = {
    filter: { policy: policies },
    limit: 200,
    priority: { policy: [{ metric: "cost", weight: 1.0 }] }
  };

  try {
    const specRes = await axios.post(`${tbApiBase()}/recommendSpec`, JSON.stringify(recommendReq), {
      headers: { "Content-Type": "application/json" },
      auth: { username, password }
    });
    Swal.close();

    const specs = specRes.data;
    if (!specs || specs.length === 0) {
      errorAlert(`No available specs found for provider "${providerName}" and region "${regionName || 'any'}"`);
      return;
    }

    const selectedSpec = await openSpecSelectionDialog(specs, {
      title: `Select a Spec for Image: ${imageObj.name || imageId}`,
      subTitle: `Image: ${imageObj.osDistribution || imageObj.guestOS || 'Custom Image'} (${providerName.toUpperCase()} ${regionName})`
    });

    if (!selectedSpec) {
      console.log("Spec selection canceled for image-first deployment");
      return;
    }

    var createInfraReqVm = $.extend({}, createInfraReqVmTmplt);
    createInfraReqVm.name = "g" + (nodeGroupRequestFromSpecList.length + 1).toString();
    createInfraReqVm.specId = selectedSpec.id;
    createInfraReqVm.imageId = imageObj.cspImageName || imageObj.id || imageId;
    createInfraReqVm.rootDiskType = selectedSpec.rootDiskType || "default";
    createInfraReqVm.rootDiskSize = 0;

    let imageSelectHTML = `
      <div>
        <div style="font-size: 0.85rem; font-weight: 600; color: #333; margin-bottom: 4px; word-break: break-word;">
          📸 ${window.escapeHtml(imageObj.osDistribution || imageObj.description || 'Custom Image')}
        </div>
        <code style="font-size: 0.8rem; color: #666; background: #e9ecef; padding: 4px 8px; border-radius: 4px; display: block; word-break: break-all; max-height: 60px; overflow-y: auto;">${window.escapeHtml(createInfraReqVm.imageId)}</code>
      </div>
    `;

    selectedSpec.costPerHour = (selectedSpec.costPerHour < 0 || !selectedSpec.costPerHour) ? "unknown" : selectedSpec.costPerHour;

    openNodeGroupConfigModal(selectedSpec, createInfraReqVm, imageSelectHTML, selectedSpec);
  } catch (error) {
    Swal.close();
    console.error("Failed to recommend specs for image:", error);
    errorAlert(`Failed to recommend specs for image: ${error.message || 'Unknown error'}`);
  }
}

function buildSpecConfigPopupHtml(spec, nodeConf, options = {}) {
  const isEdit = options.isEdit || false;
  const imageSelectHTML = options.imageSelectHTML || `<span class="popup-value-sm">${nodeConf.imageId || 'N/A'}</span>`;
  const costPerHour = spec.costPerHour || 'N/A';
  const hasGpu = spec.acceleratorType === "gpu" || spec.acceleratorModel;
  
  let html = POPUP_STYLES + '<div class="popup-container">';
  
  // Pair Validation Section (only for new spec selection)
  if (!isEdit && options.showValidation) {
    html += `
      <div id="specImageReviewSection" class="popup-section" style="background: linear-gradient(135deg, #e9ecef 0%, #f8f9fa 100%); padding: 8px 12px;">
        <div class="popup-inline">
          <span style="font-weight: 600; font-size: 0.8rem; color: #495057;">Validation</span>
          <span id="specImageReviewStatus" class="popup-badge" style="background: #6c757d; color: white;">Checking...</span>
          <span id="specImageReviewSpinner">⏳</span>
        </div>
        <div id="specImageReviewDetails" style="font-size: 0.75rem; color: #666; margin-top: 4px;"></div>
      </div>
    `;
  }
  
  // NodeGroup Name (only for edit mode)
  if (isEdit) {
    html += `
      <div class="popup-section">
        <div class="popup-row">
          <div class="popup-col">
            <div class="popup-field">
              <label class="popup-label">📝 NodeGroup Name</label>
              <input type="text" id="editNodeGroupName" class="popup-input" value="${nodeConf.name || ''}" placeholder="Enter name">
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  // ☁️ Provider Section (Provider, Region, Zone)
  html += `
    <div class="popup-section">
      <div class="popup-section-title">☁️ Provider</div>
      <div class="popup-row">
        <div class="popup-col">
          <div class="popup-field">
            <span class="popup-label">Provider</span>
            <span class="popup-badge popup-badge-provider">${spec.providerName.toUpperCase()}</span>
          </div>
        </div>
        <div class="popup-col">
          <div class="popup-field">
            <span class="popup-label">Region</span>
            <span class="popup-value">${spec.regionName}</span>
          </div>
        </div>
        <div class="popup-col popup-col-2">
          <div class="popup-field">
            <label class="popup-label">Zone (Optional)</label>
            <div class="popup-inline">
              <select id="${isEdit ? 'editZoneSelect' : 'zoneSelect'}" class="popup-select" style="flex: 1;">
                <option value="">Auto (default)</option>
              </select>
              <span id="${isEdit ? 'editZoneLoadingSpinner' : 'zoneLoadingSpinner'}">⏳</span>
            </div>
            ${!isEdit ? '<div id="zoneStatusMessage" class="popup-hint"></div>' : ''}
          </div>
        </div>
      </div>
    </div>
  `;

  // 🌐 Subnet distribution (per NodeGroup) with a CSP-specific hint.
  // Default on (opt-out) unless this NodeGroup explicitly disabled it.
  const distCbId = isEdit ? 'editDistributeSubnetsCheckbox' : 'distributeSubnetsCheckbox';
  const distChecked = (nodeConf.distributeSubnets !== false) ? 'checked' : '';
  html += `
    <div class="popup-section">
      <div class="popup-field">
        <label class="popup-label" style="display:flex; align-items:center; cursor:pointer;">
          <input type="checkbox" id="${distCbId}" ${distChecked} style="margin-right:8px; transform:scale(1.1);">
          🌐 Distribute Nodes across subnets (multi-AZ)
        </label>
        <div class="popup-hint" style="margin-top:4px;">
          Spread this NodeGroup's Nodes across the VNet's subnets instead of the first one (best-effort: only zones where the spec is available). Ignored when a Zone is selected above.<br>
          ${subnetDistributionCspHint(spec.providerName)}
        </div>
      </div>
    </div>
  `;

  // 💻 Spec Section
  html += `
    <div class="popup-section">
      <div class="popup-section-title">💻 Spec</div>
      <div class="popup-row">
        <div class="popup-col">
          <div class="popup-field">
            <span class="popup-label">Spec Name</span>
            <span class="popup-value popup-value-highlight">${spec.cspSpecName}</span>
          </div>
        </div>
        <div class="popup-col">
          <div class="popup-field">
            <span class="popup-label">Price/hr</span>
            <span class="popup-value popup-value-price">$${costPerHour}</span>
          </div>
        </div>
        <div class="popup-col">
          <div class="popup-field">
            <span class="popup-label">vCPU</span>
            <span class="popup-value">${spec.vCPU} cores</span>
          </div>
        </div>
        <div class="popup-col">
          <div class="popup-field">
            <span class="popup-label">Memory</span>
            <span class="popup-value">${spec.memoryGiB} GiB</span>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // 🎮 GPU Section (only if applicable)
  if (hasGpu || spec.acceleratorCount) {
    html += `
      <div class="popup-section" style="background: linear-gradient(135deg, #fff5f5 0%, #fff 100%); border-color: #ffcdd2; padding: 8px 12px;">
        <div class="popup-row">
          <div class="popup-col">
            <div class="popup-field">
              <span class="popup-label">🎮 GPU Model</span>
              <span class="popup-value popup-value-gpu">${spec.acceleratorModel || 'None'}</span>
            </div>
          </div>
          <div class="popup-col">
            <div class="popup-field">
              <span class="popup-label">Count</span>
              <span class="popup-value popup-value-gpu">${spec.acceleratorCount || 'N/A'}</span>
            </div>
          </div>
          <div class="popup-col">
            <div class="popup-field">
              <span class="popup-label">GPU Memory</span>
              <span class="popup-value">${spec.acceleratorMemoryGB ? spec.acceleratorMemoryGB + ' GB' : 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  // 🖼️ Image Section
  let imageSectionContent = '';
  if (isEdit) {
    imageSectionContent = `
      <div class="popup-field">
        <label class="popup-label">Operating System Image</label>
        <div class="popup-inline">
          <select id="editImageSelect" class="popup-select" style="flex: 1;">
            <option value="${nodeConf.imageId || ''}">${nodeConf.imageId || 'Loading images...'}</option>
          </select>
          <span id="editImageSpinner" style="display:inline-block;">⏳</span>
          <button type="button" id="editImageBrowseBtn" class="btn btn-sm btn-outline-primary" style="white-space:nowrap;font-size:0.75rem;padding:4px 8px;" title="Browse full image catalog in a table">🔍 Browse</button>
        </div>
        <div id="editImageDetails" style="font-size: 0.75rem; color: #666; margin-top: 4px; word-break: break-all;">${nodeConf.imageId || ''}</div>
      </div>
    `;
  } else {
    imageSectionContent = `
      <div class="popup-field">
        ${imageSelectHTML}
      </div>
    `;
  }

  html += `
    <div class="popup-section">
      <div class="popup-section-title">🖼️ Image</div>
      <div class="popup-row">
        <div class="popup-col">
          ${imageSectionContent}
        </div>
      </div>
    </div>
  `;
  
  // 🏷️ Configuration Section (Disk Type, Disk Size, Labels, Node Count)
  const labelsInputId = isEdit ? 'editVmLabels' : 'vmLabels';
  const currentLabelsValue = options.currentLabels || '';
  
  html += `
    <div class="popup-section">
      <div class="popup-section-title">🏷️ Configuration</div>
      <div class="popup-row">
        <div class="popup-col">
          <div class="popup-field">
            <label class="popup-label">Disk Type</label>
            <select id="${isEdit ? 'editRootDiskTypeSelect' : 'rootDiskTypeSelect'}" class="popup-select"></select>
          </div>
        </div>
        <div class="popup-col">
          <div class="popup-field">
            <label class="popup-label">Disk Size (GB) <span id="${isEdit ? 'editRootDiskSizeHint' : 'rootDiskSizeHint'}" style="display:none;cursor:help;color:#6c757d;" title="">ⓘ</span></label>
            <input type="text" id="${isEdit ? 'editRootDiskSize' : 'rootDiskSizeCustom'}" class="popup-input" value="${nodeConf.rootDiskSize > 0 ? nodeConf.rootDiskSize : ''}" placeholder="Default">
          </div>
        </div>
        <div class="popup-col popup-col-2">
          <div class="popup-field">
            <label class="popup-label">Labels <span class="popup-hint">(key=value, comma separated)</span></label>
            <input type="text" id="${labelsInputId}" class="popup-input" 
                   value="${currentLabelsValue}" placeholder="role=worker, env=prod">
            ${window.generateLabelSuggestionChipsHtml(labelsInputId, hasGpu, currentLabelsValue)}
          </div>
        </div>
      </div>
      <div class="popup-row">
        <div class="popup-col">
          <div class="popup-field">
            <label class="popup-label">Node Count (recommended 1–1000)</label>
            <input type="number" id="${isEdit ? 'editVmCount' : 'ndCount'}" class="popup-input"
                   min="1" value="${nodeConf.nodeGroupSize || '1'}"
                   oninput="(function(el){var w=document.getElementById('ndCountWarn');if(w)w.style.display=(parseInt(el.value,10)>1000)?'block':'none';})(this)">
            <div id="ndCountWarn" style="display:${(parseInt(nodeConf.nodeGroupSize,10)||1)>1000?'block':'none'};margin-top:4px;font-size:0.78rem;color:#fd7e14;">
              ⚠️ Over 1000 nodes — allowed, but provisioning may be slow or exceed CSP quotas.
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  html += '</div>';
  return html;
}

// NodeGroup Management Functions
function updateNodeGroupReview() {
  const reviewCard = document.getElementById('infra-review-card');
  const nodegroupList = document.getElementById('nodegroup-list');
  const noNodeGroups = document.getElementById('no-nodegroups');
  
  // Clear existing items
  nodegroupList.innerHTML = '';
  
  if (nodeGroupRequestFromSpecList.length === 0) {
    reviewCard.style.display = 'none';
    renderMapFromConfig();
    return;
  }
  
  // Show review card
  reviewCard.style.display = 'block';
  noNodeGroups.style.display = 'none';
  
  // Add each NodeGroup item
  nodeGroupRequestFromSpecList.forEach((nodeConf, index) => {
    const spec = recommendedSpecList[index];
    const nodegroupItem = createNodeGroupItem(nodeConf, spec, index);
    nodegroupList.appendChild(nodegroupItem);
  });
  
  // Add action buttons at the bottom of the NodeGroup list
  const actionButtonsContainer = document.createElement('div');
  actionButtonsContainer.className = 'mt-3 pt-3 border-top';
  
  // Check if NodeGroups exist for K8s operations (now supports multi-cluster)
  const hasNodeGroups = nodeGroupRequestFromSpecList.length >= 1;
  const hasOneNodeGroup = nodeGroupRequestFromSpecList.length === 1;
  
  // Get current workload type
  const workloadType = getCurrentWorkloadType();
  console.log('Current workload type:', workloadType);
  console.log('Node radio:', document.getElementById('nodeMode'));
  console.log('K8s radio:', document.getElementById('k8sMode'));
  console.log('Node checked:', document.getElementById('nodeMode')?.checked);
  console.log('K8s checked:', document.getElementById('k8sMode')?.checked);
  
  // Generate buttons based on workload type
  let buttonsHtml = '<div class="d-flex flex-column" style="gap: 8px;">';
  
  if (workloadType === 'node') {
    console.log('Generating Node buttons...');
    // Node workload buttons
    buttonsHtml += `
      <button type="button" onClick="window.createInfra();" class="btn btn-success btn-sm" style="font-size: 0.85rem; padding: 8px 12px;">
        🚀 Create Infra
      </button>
      <div class="d-flex" style="gap: 4px;">
        <button type="button" onClick="window.scaleOutInfraWithConfiguration();" class="btn btn-info btn-sm ${!hasOneNodeGroup ? 'disabled' : ''}" 
                style="font-size: 0.75rem; padding: 6px 8px; flex: 1;" ${!hasOneNodeGroup ? 'disabled' : ''}>
          ➕ ScaleOut existing Infra
        </button>
        <button type="button" onClick="window.confirmClearInfraConfiguration();" class="btn btn-outline-secondary btn-sm" title="Remove all configured NodeGroups" 
                style="font-size: 0.7rem; padding: 6px 8px; min-width: 60px;">
          🗑️
        </button>
      </div>
    `;
  } else if (workloadType === 'k8s') {
    console.log('Generating K8s buttons...');
    // K8s workload buttons - supports both single and multi-cluster creation
    buttonsHtml += `
      <div class="border-top pt-2">
        <small class="text-muted d-block mb-2">Kubernetes Cluster</small>
        <button type="button" onClick="window.createK8sCluster();" class="btn btn-primary btn-sm ${!hasNodeGroups ? 'disabled' : ''}" 
                style="font-size: 0.85rem; padding: 8px 12px; width: 100%; margin-bottom: 4px;" ${!hasNodeGroups ? 'disabled' : ''}>
          ☸️ Create K8s Cluster${nodeGroupRequestFromSpecList.length > 1 ? 's (' + nodeGroupRequestFromSpecList.length + ')' : ''}
        </button>
        <div class="d-flex" style="gap: 4px;">
          <button type="button" onClick="window.addNodeGroupToK8sCluster();" class="btn btn-outline-primary btn-sm ${!hasNodeGroups ? 'disabled' : ''}" 
                  style="font-size: 0.75rem; padding: 6px 8px; flex: 1;" ${!hasNodeGroups ? 'disabled' : ''}>
            ➕ Add NodeGroup${nodeGroupRequestFromSpecList.length > 1 ? 's' : ''} to K8s Cluster
          </button>
          <button type="button" onClick="window.confirmClearInfraConfiguration();" class="btn btn-outline-secondary btn-sm" title="Remove all configured NodeGroups" 
                  style="font-size: 0.7rem; padding: 6px 8px; min-width: 60px;">
            🗑️
          </button>
        </div>
      </div>
    `;
  } else {
    console.log('Generating default Node buttons (fallback)...');
    // Default fallback to Node buttons
    buttonsHtml += `
      <button type="button" onClick="window.createInfra();" class="btn btn-success btn-sm" style="font-size: 0.85rem; padding: 8px 12px;">
        🚀 Create Infra
      </button>
      <div class="d-flex" style="gap: 4px;">
        <button type="button" onClick="window.scaleOutInfraWithConfiguration();" class="btn btn-info btn-sm ${!hasOneNodeGroup ? 'disabled' : ''}" 
                style="font-size: 0.75rem; padding: 6px 8px; flex: 1;" ${!hasOneNodeGroup ? 'disabled' : ''}>
          ➕ ScaleOut existing Infra
        </button>
        <button type="button" onClick="window.confirmClearInfraConfiguration();" class="btn btn-outline-secondary btn-sm" title="Remove all configured NodeGroups" 
                style="font-size: 0.7rem; padding: 6px 8px; min-width: 60px;">
          🗑️
        </button>
      </div>
    `;
  }
  
  if (nodeGroupRequestFromSpecList.length >= 2) {
    buttonsHtml += `
      <button type="button" onClick="window.bulkEditNodeGroups();" class="btn btn-outline-info btn-sm"
              style="font-size: 0.78rem; padding: 6px 8px;" title="Set one key/value across ALL NodeGroups at once">
        ✏️ Bulk Edit All NodeGroups (${nodeGroupRequestFromSpecList.length})
      </button>`;
  }
  buttonsHtml += '</div>';
  actionButtonsContainer.innerHTML = buttonsHtml;
  nodegroupList.appendChild(actionButtonsContainer);
  
  // Auto-scroll to bottom when new items are added (with safety checks)
  setTimeout(() => {
    try {
      const scrollableColumn = document.querySelector('.scrollable-column');
      if (scrollableColumn && scrollableColumn.scrollHeight > scrollableColumn.clientHeight) {
        scrollableColumn.scrollTo({
          top: scrollableColumn.scrollHeight,
          behavior: 'smooth'
        });
      }
    } catch (error) {
      console.log('Auto-scroll failed:', error);
    }
  }, 100);

  // Synchronize map configuration pins and polygons with current review panel state
  renderMapFromConfig();
}

function createNodeGroupItem(nodeConf, spec, index) {
  const item = document.createElement('div');
  item.className = 'list-group-item p-2 mb-2 border rounded';
  item.style.backgroundColor = '#f8f9fa';
  
  const providerColor = getProviderColor(spec?.providerName);
  // Lightening factors for hierarchical badge colors (provider > region > zone)
  const REGION_LIGHTEN_FACTOR = 0.4;  // 40% lighter for region
  const ZONE_LIGHTEN_FACTOR = 0.6;    // 60% lighter for zone
  const regionColor = lightenColor(providerColor, REGION_LIGHTEN_FACTOR);
  const zoneColor = lightenColor(providerColor, ZONE_LIGHTEN_FACTOR);
  // Use contrast calculation for text colors to ensure accessibility
  const providerTextColor = getContrastTextColor(providerColor);
  const regionTextColor = getContrastTextColor(regionColor);
  const zoneTextColor = getContrastTextColor(zoneColor);
  
  // Build zone badge HTML if zone is specified
  const zoneBadge = nodeConf.zone 
    ? `<span class="badge mr-1" style="background-color: ${zoneColor}; color: ${zoneTextColor}; font-size: 0.7rem;">${nodeConf.zone}</span>`
    : '';
  
  item.innerHTML = `
    <div class="d-flex align-items-start justify-content-between">
      <div class="flex-grow-1" style="min-width: 0;">
        <div class="d-flex align-items-center mb-1 flex-wrap">
          <span class="badge mr-1" style="background-color: #343a40; color: white; font-size: 0.75rem;">💻 ${nodeConf.name || `NodeGroup-${index + 1}`} ⨉ ${nodeConf.nodeGroupSize}</span>
          <span class="badge mr-1" style="background-color: ${providerColor}; color: ${providerTextColor}; font-size: 0.7rem;">
            ${(window.cspIconMode || 'logo') === 'datacenter' ? 'DC' : (window.cspIconMode || 'logo') === 'cloud' ? 'Cloud' : (spec?.providerName || 'Unknown').toUpperCase()}
          </span>
          <span class="badge mr-1" style="background-color: ${regionColor}; color: ${regionTextColor}; font-size: 0.7rem;">
            ${spec?.regionName || 'Unknown Region'}
          </span>
          ${zoneBadge}
        </div>
        <div class="small text-muted" style="font-size: 0.7rem; line-height: 1.2;">
          <div style="margin-bottom: 2px;"><strong>Spec:</strong> ${spec?.cspSpecName || nodeConf.specId}</div>
          <div style="margin-bottom: 2px;"><strong>Image:</strong> ${nodeConf.imageId}</div>
          <div><strong>vCPU:</strong> ${spec?.vCPU || 'N/A'} | <strong>Memory:</strong> ${spec?.memoryGiB || 'N/A'}GB | <strong>Cost:</strong> $${spec?.costPerHour || 'N/A'}/h</div>
          ${(spec?.acceleratorModel && spec.acceleratorModel !== '' && spec.acceleratorModel !== 'N/A') ? `<div style="margin-top: 2px;"><span style="color: #e74c3c; font-weight: bold;">⚡GPU: ${spec.acceleratorModel} (${spec.acceleratorCount || 'N/A'}, ${spec.acceleratorMemoryGB || 'N/A'}GB)</span></div>` : ''}
        </div>
      </div>
      <div class="d-flex flex-column ml-2" style="gap: 2px;">
        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="editNodeGroup(${index})" title="Edit" style="width: 28px; height: 28px; padding: 2px; font-size: 0.7rem;">
          ✏️
        </button>
        <button type="button" class="btn btn-sm btn-outline-primary" onclick="findAlternativeNodeConfig(${index})" title="Find alternative config in another CSP/Region" aria-label="Find alternative node config in another CSP/Region" style="width: 28px; height: 28px; padding: 2px; font-size: 0.7rem;">
          🔄
        </button>
        <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeNodeGroup(${index})" title="Remove" style="width: 28px; height: 28px; padding: 2px; font-size: 0.7rem;">
          🗑️
        </button>
      </div>
    </div>
  `;
  
  return item;
}

function getProviderColor(provider) {
  const definedColors = {
    'aws': '#FF9900',
    'azure': '#0078D4',
    'gcp': '#4285F4',
    'alibaba': '#FF6A00',
    'ibm': '#1261FE',
    'tencent': '#006EFF',
    'ncp': '#03C75A',
    'kt': '#E31837',
    'nhn': '#FF6B35',
    'openstack': '#ED1944'
  };
  
  if (!provider) return '#6c757d';
  
  const providerKey = provider.toLowerCase();
  
  if (definedColors[providerKey]) {
    return definedColors[providerKey];
  }
  
  // Platform-based fallback: e.g., "openstack-new01" → "openstack" color
  const platform = resolveCloudPlatform(providerKey);
  if (platform !== providerKey && definedColors[platform]) {
    return definedColors[platform];
  }
  
  return generateProviderColor(provider);
}

// Generate a consistent color for unknown providers based on provider name
function generateProviderColor(provider) {
  if (!provider) return '#6c757d';
  
  // Simple hash function to generate consistent colors
  let hash = 0;
  const str = provider.toLowerCase();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Generate a color from the hash
  const hue = Math.abs(hash) % 360;
  const saturation = 60 + (Math.abs(hash >> 8) % 40); // 60-100%
  const lightness = 40 + (Math.abs(hash >> 16) % 20); // 40-60%
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Lighten a color by mixing with white.
 * Supports HSL, HEX, and RGB color formats.
 * @param {string} color - Color string in HSL, HEX, or RGB format
 * @param {number} amount - Lightening amount (0-1, where 1 is fully white)
 * @returns {string} Lightened color in HSL or RGB format
 */
function lightenColor(color, amount) {
  // HSL lightness thresholds
  const MAX_LIGHTNESS = 95;           // Maximum lightness to prevent pure white
  const LIGHTNESS_MULTIPLIER = 40;    // How much lightness increases per amount unit
  
  // Handle HSL colors
  if (color.startsWith('hsl')) {
    const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (match) {
      const h = parseInt(match[1]);
      const s = parseInt(match[2]);
      const l = Math.min(MAX_LIGHTNESS, parseInt(match[3]) + (amount * LIGHTNESS_MULTIPLIER));
      return `hsl(${h}, ${s}%, ${l}%)`;
    }
  }
  
  // Handle HEX colors
  let hex = color.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Mix with white
  const newR = Math.round(r + (255 - r) * amount);
  const newG = Math.round(g + (255 - g) * amount);
  const newB = Math.round(b + (255 - b) * amount);
  
  return `rgb(${newR}, ${newG}, ${newB})`;
}

/**
 * Get contrasting text color (dark or light) based on background color.
 * Uses luminance calculation for accessibility compliance.
 * @param {string} color - Background color in HSL, HEX, or RGB format
 * @returns {string} Contrasting text color ('#333' for dark text, 'white' for light text)
 */
function getContrastTextColor(color) {
  // Thresholds for determining text color contrast
  // Based on WCAG accessibility guidelines for readable text
  const HSL_LIGHTNESS_THRESHOLD = 60;   // HSL lightness above this gets dark text
  const LUMINANCE_THRESHOLD = 0.6;       // Relative luminance above this gets dark text
  
  let r, g, b;
  
  if (color.startsWith('hsl')) {
    // For HSL, check lightness directly
    const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (match) {
      const l = parseInt(match[3]);
      return l > HSL_LIGHTNESS_THRESHOLD ? '#333' : 'white';
    }
  } else if (color.startsWith('rgb')) {
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      r = parseInt(match[1]);
      g = parseInt(match[2]);
      b = parseInt(match[3]);
    }
  } else {
    // HEX color
    let hex = color.replace('#', '');
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  }
  
  // Calculate relative luminance using ITU-R BT.601 luma coefficients
  // Formula: Y = 0.299*R + 0.587*G + 0.114*B (normalized to 0-1)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > LUMINANCE_THRESHOLD ? '#333' : 'white';
}

// ==== Bulk edit: set one key/path across ALL NodeGroups at once =========================
// Flatten a NodeGroup config to scalar leaf paths (dot notation), so a key that appears at
// different nesting levels stays distinguishable by its full path (e.g. "rootDiskType" vs
// "label.rootDiskType"). Arrays are skipped — not a single scalar to bulk-set.
function bulkFlattenNodeConf(obj, prefix, out) {
  out = out || {}; prefix = prefix || '';
  for (const k in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    const v = obj[k];
    const path = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) bulkFlattenNodeConf(v, path, out);
    else if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[path] = v;
  }
  return out;
}
function bulkSetByPath(obj, path, value) {
  const parts = path.split('.'); let o = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
    o = o[parts[i]];
  }
  o[parts[parts.length - 1]] = value;
}
// Analyse every key-path across all NodeGroups: distinct values, uniform?, missing-in-some?, type.
function bulkCollectKeys() {
  const groups = nodeGroupRequestFromSpecList || [];
  const flats = groups.map(g => bulkFlattenNodeConf(g));
  const paths = new Set(); flats.forEach(f => Object.keys(f).forEach(p => paths.add(p)));
  const info = {};
  paths.forEach(p => {
    const present = flats.filter(f => p in f).map(f => f[p]);
    const distinct = Array.from(new Set(present.map(v => JSON.stringify(v)))).map(s => JSON.parse(s));
    info[p] = {
      uniform: distinct.length <= 1 && present.length === groups.length, // same value & set on every group
      partial: present.length !== groups.length,                          // absent on some groups
      distinct: distinct,
      type: typeof present.find(v => v !== null && v !== undefined),
    };
  });
  return { groups, flats, info, paths: Array.from(paths).sort() };
}
// Render a single value for display: empty string / null / undefined show as a muted "(empty)".
function bulkFmtVal(v) {
  if (v === '' || v === null || v === undefined)
    return '<span style="color:#adb5bd;font-style:italic;">(empty)</span>';
  return '<code>' + escapeHtml(String(v)) + '</code>';
}

// Step 1: list every key as a color-coded button (green = same across all, orange = differs/partial).
window.bulkEditNodeGroups = function () {
  const { groups, info, paths } = bulkCollectKeys();
  if (!groups.length) { if (typeof infoAlert === 'function') infoAlert('No NodeGroups configured yet.'); return; }
  const rows = paths.map(p => {
    const d = info[p];
    let color, disp;
    if (d.uniform) {
      color = '#28a745';                                   // green: identical everywhere
      disp = bulkFmtVal(d.distinct[0]);
    } else {
      color = '#fd7e14';                                   // orange: mixed or missing on some
      const vals = d.distinct.slice(0, 3).map(v => bulkFmtVal(v)).join(', ') + (d.distinct.length > 3 ? ', …' : '');
      disp = '<span style="color:#fd7e14;">' + vals + (d.partial ? ' <i>(missing on some)</i>' : '') + '</span>';
    }
    return `<button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
              style="padding:6px 10px; font-size:0.85rem;" onclick="window.bulkEditKey('${p.replace(/'/g, "\\'")}')">
              <span><span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${color};margin-right:8px;vertical-align:middle;"></span>
              <code style="color:#0d6efd;">${escapeHtml(p)}</code></span>
              <span style="max-width:55%;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${disp}</span>
            </button>`;
  }).join('');
  Swal.fire({
    title: `✏️ Bulk Edit — ${groups.length} NodeGroups`,
    width: 660,
    html: `<div style="text-align:left;font-size:0.8rem;color:#6c757d;margin-bottom:8px;">
             <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#28a745;vertical-align:middle;"></span> same across all &nbsp;
             <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:#fd7e14;vertical-align:middle;"></span> differs / missing on some
             &nbsp;— click a key to set it on <b>all</b> NodeGroups.</div>
           <div class="list-group" style="max-height:52vh;overflow:auto;">${rows}</div>`,
    showConfirmButton: false,
    showCloseButton: true,
  });
};

// Step 2: show current per-group values for the chosen key + one input applied to every group.
window.bulkEditKey = function (path) {
  const { groups, flats, info } = bulkCollectKeys();
  const d = info[path]; if (!d) return;
  const isBool = d.type === 'boolean';
  const isNum = d.type === 'number';
  const seed = d.distinct.length === 1 ? d.distinct[0] : '';
  const table = groups.map((g, i) => {
    const has = path in flats[i]; const v = flats[i][path];
    return `<tr><td style="color:#495057;padding:2px 6px;">${escapeHtml(g.name || ('group ' + i))}</td>
              <td style="text-align:right;padding:2px 6px;">${has ? bulkFmtVal(v) : '<span style="color:#adb5bd;">(none)</span>'}</td></tr>`;
  }).join('');
  const inputHtml = isBool
    ? `<label style="font-size:0.9rem;"><input type="checkbox" id="bulkVal" ${seed ? 'checked' : ''}> set <b>true</b> on all (uncheck for false)</label>`
    : `<input type="${isNum ? 'number' : 'text'}" id="bulkVal" class="swal2-input" style="margin:6px 0;width:90%;" value="${escapeHtml(String(seed ?? ''))}" placeholder="new value for all NodeGroups">`;
  Swal.fire({
    title: `Set "${path}"`,
    width: 560,
    html: `<div style="text-align:left;">
             <div style="font-size:0.82rem;color:#6c757d;margin-bottom:4px;">applied to all <b>${groups.length}</b> NodeGroups</div>
             <div>${inputHtml}</div>
             <details style="margin-top:6px;"><summary style="cursor:pointer;font-size:0.8rem;color:#6c757d;">current values per NodeGroup</summary>
               <div style="max-height:32vh;overflow:auto;margin-top:4px;"><table style="width:100%;font-size:0.8rem;border-collapse:collapse;"><tbody>${table}</tbody></table></div>
             </details></div>`,
    showCancelButton: true,
    confirmButtonText: 'Apply to all',
    confirmButtonColor: '#28a745',
    cancelButtonText: '← Back',
    focusConfirm: false,
    preConfirm: () => {
      const el = document.getElementById('bulkVal');
      if (isBool) return el.checked;
      const raw = el.value;
      if (isNum) { const n = Number(raw); if (raw.trim() === '' || isNaN(n)) { Swal.showValidationMessage('Enter a number'); return false; } return n; }
      return raw;
    }
  }).then(res => {
    if (res.isConfirmed) {
      groups.forEach(g => bulkSetByPath(g, path, res.value));
      if (typeof renderMapFromConfig === 'function') renderMapFromConfig();
      updateNodeGroupReview();
      if (typeof successAlert === 'function') successAlert(`Set "${path}" = ${JSON.stringify(res.value)} on all ${groups.length} NodeGroups.`);
      window.bulkEditNodeGroups();               // reopen the key list with refreshed colors
    } else if (res.dismiss === Swal.DismissReason.cancel) {
      window.bulkEditNodeGroups();               // ← Back to the key list
    }
  });
};

function editNodeGroup(index, previousValues) {
  const nodeConf = nodeGroupRequestFromSpecList[index];
  const spec = recommendedSpecList[index];
  
  if (!spec || !nodeConf) {
    console.error('Spec or Node config not found for index:', index);
    return;
  }
  
  // Merge previous values if returning from Image Browse dialog
  const effectiveConf = previousValues ? {
    ...nodeConf,
    ...previousValues,
    imageId: previousValues.imageId || nodeConf.imageId,
    name: previousValues.name !== undefined ? previousValues.name : nodeConf.name,
    nodeGroupSize: previousValues.count !== undefined ? previousValues.count : nodeConf.nodeGroupSize,
    rootDiskType: previousValues.diskType !== undefined ? previousValues.diskType : nodeConf.rootDiskType,
    rootDiskSize: previousValues.diskSize !== undefined ? previousValues.diskSize : nodeConf.rootDiskSize,
    zone: previousValues.zone !== undefined ? previousValues.zone : nodeConf.zone,
    distributeSubnets: previousValues.distributeSubnets !== undefined ? previousValues.distributeSubnets : nodeConf.distributeSubnets,
  } : nodeConf;

  // Set editing mode
  window.editingNodeGroupIndex = index;
  
  const currentZone = effectiveConf.zone || '';
  const currentLabels = previousValues?.labelsText !== undefined 
    ? previousValues.labelsText 
    : labelsToString(effectiveConf.label);
  
  Swal.fire({
    title: "✏️ Edit NodeGroup Configuration",
    width: 650,
    html: buildSpecConfigPopupHtml(spec, effectiveConf, {
      isEdit: true,
      currentLabels: currentLabels
    }),
    didOpen: () => {
      populateEditImageSelect('editImageSelect', 'editImageSpinner', spec, effectiveConf.imageId, 'editImageDetails');

      const editImgSel = document.getElementById('editImageSelect');
      if (editImgSel) {
        editImgSel.addEventListener('change', () => {
          populateRootDiskTypeSelect('editRootDiskTypeSelect', spec, document.getElementById('editRootDiskTypeSelect')?.value || 'default', {
            sizeInputId: 'editRootDiskSize',
            hintId: 'editRootDiskSizeHint',
            imageId: editImgSel.value
          });
        });
      }

      const browseBtn = document.getElementById('editImageBrowseBtn');
      if (browseBtn) {
        browseBtn.addEventListener('click', () => {
          const curVals = {
            name: document.getElementById('editNodeGroupName')?.value || '',
            count: parseInt(document.getElementById('editVmCount')?.value, 10) || 1,
            diskType: document.getElementById('editRootDiskTypeSelect')?.value || 'default',
            diskSize: document.getElementById('editRootDiskSize')?.value || '',
            zone: document.getElementById('editZoneSelect')?.value || '',
            distributeSubnets: document.getElementById('editDistributeSubnetsCheckbox')?.checked ?? true,
            labelsText: document.getElementById('editVmLabels')?.value || '',
            imageId: document.getElementById('editImageSelect')?.value || effectiveConf.imageId
          };
          Swal.close();
          openImageSelectionDialog(spec, curVals.imageId).then(imgRes => {
            if (imgRes && imgRes.selectedImageId) {
              editNodeGroup(index, { ...curVals, imageId: imgRes.selectedImageId });
            } else {
              editNodeGroup(index, curVals);
            }
          });
        });
      }

      populateRootDiskTypeSelect('editRootDiskTypeSelect', spec, effectiveConf.rootDiskType || 'default',
        { sizeInputId: 'editRootDiskSize', hintId: 'editRootDiskSizeHint', imageId: effectiveConf.imageId || '' });
      populateZoneSelect('editZoneSelect', 'editZoneLoadingSpinner', spec.id, currentZone, null);
      
      window.setupLabelInputListener('editVmLabels');
      window.syncLabelSuggestionChips('editVmLabels');
    },
    showCancelButton: true,
    confirmButtonText: '💾 Save Changes',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#28a745',
    preConfirm: () => {
      const name = document.getElementById('editNodeGroupName').value.trim();
      const count = parseInt(document.getElementById('editVmCount').value);
      const diskType = document.getElementById('editRootDiskTypeSelect').value;
      const diskSize = document.getElementById('editRootDiskSize').value.trim();
      const zone = document.getElementById('editZoneSelect').value;
      const distCb = document.getElementById('editDistributeSubnetsCheckbox');
      const distributeSubnets = distCb ? distCb.checked : true;
      const labelsText = document.getElementById('editVmLabels').value.trim();
      const imageId = document.getElementById('editImageSelect')?.value || effectiveConf.imageId;
      
      if (!imageId) {
        Swal.showValidationMessage('Please select an OS image');
        return false;
      }
      if (isNaN(count) || count < 1) {
        Swal.showValidationMessage('Please provide valid Node count');
        return false;
      }
      if (diskSize && !/^\d+$/.test(diskSize)) {
        Swal.showValidationMessage('Disk size must be empty (default) or a positive number');
        return false;
      }
      const sizeErr = validateDiskSizeAgainstRule(parseInt(diskSize, 10) || 0,
        getSelectedRootDiskRule(document.getElementById('editRootDiskTypeSelect')));
      if (sizeErr) {
        Swal.showValidationMessage(sizeErr);
        return false;
      }
      
      const labels = parseLabelsString(labelsText);
      return { name, count, diskType, diskSize: parseInt(diskSize, 10) || 0, zone, labels, distributeSubnets, imageId };
    }
  }).then((result) => {
    window.editingNodeGroupIndex = -1;
    
    if (result.isConfirmed) {
      nodeGroupRequestFromSpecList[index].name = result.value.name;
      nodeGroupRequestFromSpecList[index].nodeGroupSize = result.value.count;
      nodeGroupRequestFromSpecList[index].rootDiskType = result.value.diskType;
      nodeGroupRequestFromSpecList[index].rootDiskSize = result.value.diskSize;
      nodeGroupRequestFromSpecList[index].distributeSubnets = result.value.distributeSubnets;
      nodeGroupRequestFromSpecList[index].imageId = result.value.imageId;

      if (result.value.zone) {
        nodeGroupRequestFromSpecList[index].zone = result.value.zone;
      } else {
        delete nodeGroupRequestFromSpecList[index].zone;
      }
      
      if (Object.keys(result.value.labels).length > 0) {
        nodeGroupRequestFromSpecList[index].label = result.value.labels;
        Object.entries(result.value.labels).forEach(([key, value]) => {
          window.addToRecentLabels(`${key}=${value}`);
        });
      } else {
        delete nodeGroupRequestFromSpecList[index].label;
      }
      
      updateNodeGroupReview();
      successAlert('NodeGroup updated successfully!');
    }
  });
}

// ─── Find Alternative NodeGroup ──

async function findAlternativeNodeConfig(index) {
  const cfg      = getConfig();
  const hostname = window.configHostname || cfg.hostname || '';
  const port     = window.configPort || cfg.port || '';
  const username = window.configUsername || cfg.username || '';
  const password = window.configPassword || cfg.password || '';
  const nodeConf = nodeGroupRequestFromSpecList[index];
  const spec     = recommendedSpecList[index];
  if (!spec || !nodeConf) return;

  const isGPU = spec.acceleratorType === 'gpu';
  const esc   = window.escapeHtml;

  // Helper: build a colour-coded diff badge
  function diffBadge(val, unit = '', positiveIsGood = false) {
    if (val == null) return '<span style="color:#555;">—</span>';
    const num = Number(val);
    if (!Number.isFinite(num) || num === 0) return '<span style="color:#555;">—</span>';
    const sign   = num > 0 ? '+' : '';
    const colour = positiveIsGood
      ? (num > 0 ? '#27ae60' : '#e74c3c')
      : (num > 0 ? '#e74c3c' : '#27ae60');
    return `<span style="color:${colour};font-weight:bold;">${sign}${esc(String(num))}${esc(unit)}</span>`;
  }

  // ── Step 1: Target CSP / Region / Options ─
  const providerOptions = knownPlatforms
    .map(p => `<option value="${p}">${p.toUpperCase()}</option>`)
    .join('');

  const sourceAccelHtml = isGPU
    ? `<div style="color:#c0392b;font-size:0.78rem;margin-top:2px;">
         GPU: ${esc(spec.acceleratorModel || 'N/A')} ×${spec.acceleratorCount || '?'} (${spec.acceleratorMemoryGB || '?'} GB/ea)
       </div>` : '';

  const step1Result = await Swal.fire({
    title: 'Find Alternative Node Config',
    width: 700,
    html: `
      <div style="font-size:0.85rem;text-align:left;">

        <!-- Source summary -->
        <div style="background:#f0f4ff;border:1px solid #c5cae9;border-radius:6px;padding:8px 12px;margin-bottom:14px;">
          <div style="font-weight:bold;color:#1565c0;margin-bottom:4px;">Source NodeGroup: ${esc(nodeConf.name || `NodeGroup-${index+1}`)}</div>
          <div style="font-family:monospace;font-size:0.8rem;">${esc(spec.id)}</div>
          <div style="margin-top:3px;color:#555;">
            ${esc((spec.providerName || '').toUpperCase())} ${esc(spec.regionName || '')}
            &nbsp;|&nbsp; vCPU: ${spec.vCPU}
            &nbsp;|&nbsp; Mem: ${spec.memoryGiB} GiB
            &nbsp;|&nbsp; Arch: ${esc(spec.architecture || 'N/A')}
            &nbsp;|&nbsp; ${spec.costPerHour > 0 ? '$' + parseFloat(spec.costPerHour).toFixed(5) + '/h' : 'cost N/A'}
          </div>
          ${sourceAccelHtml}
        </div>

        <!-- Target -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
          <div>
            <label style="font-weight:bold;display:block;margin-bottom:4px;">Target CSP <span style="color:red;">*</span></label>
            <select id="eq-target-provider" style="width:100%;padding:6px;border:1px solid #ced4da;border-radius:4px;">
              <option value="">— select CSP —</option>
              ${providerOptions}
            </select>
          </div>
          <div>
            <label style="font-weight:bold;display:block;margin-bottom:4px;">Target Region <small style="font-weight:normal;color:#777;">(optional)</small></label>
            <select id="eq-target-region" style="width:100%;padding:6px;border:1px solid #ced4da;border-radius:4px;" disabled>
              <option value="">All regions</option>
            </select>
          </div>
        </div>

        <!-- Tolerance -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
          <div>
            <label style="font-weight:bold;display:block;margin-bottom:4px;">
              Tolerance (%) <small style="font-weight:normal;color:#777;">for preferred fields</small>
            </label>
            <input id="eq-tolerance" type="number" min="0" max="200" value="20"
              style="width:100%;padding:6px;border:1px solid #ced4da;border-radius:4px;">
          </div>
          <div>
            <label style="font-weight:bold;display:block;margin-bottom:4px;">Max Results</label>
            <input id="eq-limit" type="number" min="1" max="20" value="5"
              style="width:100%;padding:6px;border:1px solid #ced4da;border-radius:4px;">
          </div>
        </div>

        <!-- Advanced: match criteria -->
        <details style="border:1px solid #dee2e6;border-radius:4px;padding:8px 12px;">
          <summary style="cursor:pointer;font-weight:bold;color:#555;">Advanced: per-field match policy</summary>
          <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.8rem;">
            ${buildMatchCriteriaRow('architecture',    'Architecture',      'required', false)}
            ${buildMatchCriteriaRow('vCPU',            'vCPU',             'preferred', false)}
            ${buildMatchCriteriaRow('memoryGiB',       'Memory',           'preferred', false)}
            ${buildMatchCriteriaRow('acceleratorType', 'Accel Type',       'required', false)}
            ${isGPU ? buildMatchCriteriaRow('acceleratorModel','Accel Model','open', true) : ''}
            ${isGPU ? buildMatchCriteriaRow('acceleratorCount','Accel Count','preferred', false) : ''}
            ${isGPU ? buildMatchCriteriaRow('acceleratorMemoryGB','Accel Mem GB','preferred', false) : ''}
            ${buildMatchCriteriaRow('costPerHour',     'Cost/h',           'open', false)}
          </div>
        </details>
      </div>
    `,
    didOpen: () => {
      const provSel = document.getElementById('eq-target-provider');
      const regSel  = document.getElementById('eq-target-region');
      provSel.addEventListener('change', async () => {
        const prov = provSel.value;
        regSel.innerHTML = '<option value="">All regions</option>';
        regSel.disabled = !prov;
        if (!prov) return;
        try {
          const res = await axios.get(
            `${tbApiBase()}/provider/${prov}/region`,
            { auth: { username, password } });
          const regions = (res.data?.regions || [])
            .filter(r => r.regionName)
            .sort((a, b) => a.regionName.localeCompare(b.regionName));
          regions.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.regionName;
            const display = r.location?.display;
            opt.textContent = display ? `${r.regionName} (${display})` : r.regionName;
            regSel.appendChild(opt);
          });
        } catch (e) {
          // Region list unavailable; keep "All regions" only.
        }
      });
    },
    showCancelButton: true,
    confirmButtonText: 'Search →',
    confirmButtonColor: '#1565c0',
    preConfirm: () => {
      const provider = document.getElementById('eq-target-provider').value;
      if (!provider) {
        Swal.showValidationMessage('Please select a target CSP');
        return false;
      }
      return {
        provider,
        region:    document.getElementById('eq-target-region').value,
        tolerance: (() => { const v = parseInt(document.getElementById('eq-tolerance').value, 10); return Number.isNaN(v) ? 20 : v; })(),
        limit:     (() => { const v = parseInt(document.getElementById('eq-limit').value, 10); return Number.isNaN(v) ? 5 : v; })(),
        criteria:  readMatchCriteriaFromForm(),
      };
    }
  });

  if (!step1Result.isConfirmed) return;
  const { provider, region, tolerance, limit, criteria } = step1Result.value;

  // ── Call API ──
  Swal.fire({ title: 'Searching…', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

  let apiResp;
  try {
    const reqBody = {
      sourceSpecId:          spec.id,
      sourceImageId:         nodeConf.imageId || '',
      targetProviderName:    provider,
      targetRegionName:      region || '',
      tolerancePercent:      tolerance,
      specCandidateLimit:    limit,
      imageAlternativeLimit: 3,
      matchCriteria:         criteria,
    };
    const res = await axios.post(
      `${tbApiBase()}/recommendAlternativeNodeConfig`,
      reqBody,
      { auth: { username, password } });
    apiResp = res.data;
  } catch (e) {
    Swal.fire('Error', e?.response?.data?.message || e.message, 'error');
    return;
  }

  if (!apiResp?.candidates?.length) {
    Swal.fire('No Results',
      'No alternative specs found in the target CSP/region with the given criteria. '
      + 'Try relaxing the tolerance or match policies.', 'info');
    return;
  }

  // ── Step 2: Show candidates 
  const src = apiResp.sourceSpec;

  const candidateRows = apiResp.candidates.map((c, i) => {
    const s    = c.spec;
    const d    = c.specDiff;
    const imgName = c.primaryImage
      ? `<span title="${esc(c.primaryImage.osDistribution || '')}" style="color:#0066cc;font-size:0.75rem;">${esc((c.primaryImage.cspImageName || '').substring(0, 30))}${(c.primaryImage.cspImageName||'').length > 30 ? '…' : ''}</span>`
      : '<span style="color:#aaa;font-size:0.75rem;">none</span>';
    const gpuInfo = s.acceleratorModel
      ? `<div style="color:#c0392b;font-size:0.72rem;">${esc(s.acceleratorModel)} ×${s.acceleratorCount}</div>` : '';
    const scoreColour = c.similarityScore >= 80 ? '#27ae60' : c.similarityScore >= 50 ? '#f39c12' : '#e74c3c';
    const archWarn = d.architectureMatch === false
      ? '<div style="color:#e74c3c;font-size:0.7rem;">⚠ arch</div>' : '';

    return `
      <tr class="eq-cand-row" data-index="${i}">
        <td class="text-center eq-sel-indicator" style="width:32px;font-size:1rem;color:#999;">○</td>
        <td style="font-size:0.78rem;padding:4px 6px;">
          <div style="font-family:monospace;">${esc(s.cspSpecName || s.id)}</div>
          <div style="color:#555;font-size:0.72rem;">${esc((s.providerName || '').toUpperCase())} ${esc(s.regionName || '')}</div>
        </td>
        <td class="text-center" style="font-size:0.8rem;">${esc(String(s.vCPU ?? ''))}<br>${diffBadge(d.vCPUDiff)}</td>
        <td class="text-center" style="font-size:0.8rem;">${esc(String(s.memoryGiB ?? ''))}G<br>${diffBadge(d.memoryGiBDiff, 'G')}</td>
        <td class="text-center" style="font-size:0.78rem;">
          ${gpuInfo}
          ${archWarn}
        </td>
        <td class="text-center" style="font-size:0.78rem;">
          ${s.costPerHour > 0 ? '$' + parseFloat(s.costPerHour).toFixed(4) : 'N/A'}<br>
          ${s.costPerHour > 0 && src.costPerHour > 0 ? diffBadge(parseFloat(d.costPerHourDiff.toFixed(4)), '', false) : ''}
        </td>
        <td style="font-size:0.8rem;padding:4px 6px;">${imgName}</td>
        <td class="text-center">
          <span style="font-weight:bold;color:${scoreColour};">${c.similarityScore.toFixed(1)}%</span>
        </td>
      </tr>`;
  }).join('');

  const step2Result = await Swal.fire({
    title: `Alternative Configs in ${esc(provider.toUpperCase())}${region ? ' / ' + esc(region) : ''}`,
    width: 1100,
    html: `
      <style>
        .eq-cand-row { cursor: pointer; transition: background 0.12s; }
        .eq-cand-row:hover td { background: #f0f4ff; }
        .eq-cand-row.eq-selected td { background: #bbdefb !important; }
        .eq-cand-row.eq-selected .eq-sel-indicator { color: #1565c0 !important; font-weight: bold; }
      </style>
      <div style="font-size:0.82rem;text-align:left;">
        <!-- Source row -->
        <div style="background:#f8f9fa;border:1px solid #dee2e6;border-radius:5px;
                    padding:6px 12px;margin-bottom:10px;display:flex;gap:20px;flex-wrap:wrap;align-items:center;">
          <span style="font-weight:bold;color:#1565c0;white-space:nowrap;">▶ Source</span>
          <span style="font-family:monospace;font-size:0.78rem;">${esc(src.cspSpecName || src.id)}</span>
          <span style="color:#555;white-space:nowrap;">${esc((src.providerName || '').toUpperCase())} ${esc(src.regionName || '')}</span>
          <span style="white-space:nowrap;">vCPU: <b>${src.vCPU}</b> &nbsp; Mem: <b>${src.memoryGiB}G</b></span>
          ${src.acceleratorModel ? `<span style="color:#c0392b;white-space:nowrap;">GPU: <b>${esc(src.acceleratorModel)} ×${src.acceleratorCount}</b></span>` : ''}
          <span style="white-space:nowrap;">${src.costPerHour > 0 ? '$' + parseFloat(src.costPerHour).toFixed(5) + '/h' : 'cost N/A'}</span>
        </div>

        <table id="eq-cand-table" style="width:100%;border-collapse:collapse;font-size:0.8rem;">
          <thead>
            <tr style="background:#343a40;color:white;">
              <th style="padding:5px 4px;width:32px;"></th>
              <th style="padding:5px 8px;text-align:left;">Spec / Location</th>
              <th style="padding:5px 4px;">vCPU</th>
              <th style="padding:5px 4px;">Mem</th>
              <th style="padding:5px 4px;">GPU / Arch</th>
              <th style="padding:5px 4px;">Cost/h</th>
              <th style="padding:5px 8px;text-align:left;">Primary Image</th>
              <th style="padding:5px 4px;">Match %</th>
            </tr>
          </thead>
          <tbody id="eq-cand-tbody">
            ${candidateRows}
          </tbody>
        </table>
        <div style="margin-top:6px;font-size:0.73rem;color:#888;">
          Click a row to select &nbsp;|&nbsp; Green diff = improvement over source, red = regression
        </div>
        <input type="hidden" id="eq-selected-idx" value="0">
      </div>
    `,
    didOpen: () => {
      const tbody = document.getElementById('eq-cand-tbody');
      const idxInput = document.getElementById('eq-selected-idx');

      function selectRow(tr) {
        tbody.querySelectorAll('tr.eq-cand-row').forEach(r => {
          r.classList.remove('eq-selected');
          const ind = r.querySelector('.eq-sel-indicator');
          if (ind) ind.textContent = '○';
        });
        tr.classList.add('eq-selected');
        const ind = tr.querySelector('.eq-sel-indicator');
        if (ind) ind.textContent = '◉';
        idxInput.value = tr.dataset.index;
      }

      tbody.querySelectorAll('tr.eq-cand-row').forEach(tr => {
        tr.addEventListener('click', () => selectRow(tr));
      });

      // Auto-select first row
      const firstRow = tbody.querySelector('tr.eq-cand-row');
      if (firstRow) selectRow(firstRow);
    },
    showCancelButton: true,
    showDenyButton:   true,
    confirmButtonText: '➕ Add as New NodeGroup',
    denyButtonText:    '🔄 Replace This NodeGroup',
    cancelButtonText:  'Cancel',
    confirmButtonColor: '#28a745',
    denyButtonColor:    '#1565c0',
    preConfirm: () => parseInt(document.getElementById('eq-selected-idx').value),
    preDeny:    () => {
      Swal.resetValidationMessage();
      return parseInt(document.getElementById('eq-selected-idx').value);
    }
  });

  if (!step2Result.isConfirmed && !step2Result.isDenied) return;

  const selectedCandidateIdx = step2Result.value;
  const candidate = apiResp.candidates[selectedCandidateIdx];
  const isReplace = step2Result.isDenied;

  // ── Step 3: Image selection (reuse existing image-selection flow) ──
  // Build image list from candidate's primary + alternatives
  const candImages = [
    ...(candidate.primaryImage ? [candidate.primaryImage] : []),
    ...(candidate.alternativeImages || []),
  ].map(img => ({
    id:             img.id || img.cspImageName,
    cspImageName:   img.cspImageName || img.id,
    osType:         img.osType || 'N/A',
    osDistribution: img.osDistribution || '',
    osArchitecture: img.osArchitecture || img.osArch || 'N/A',
    creationDate:   img.creationDate || '',
    description:    img.description || img.osDistribution || '',
    imageStatus:    img.imageStatus || 'Available',
    osPlatform:     img.osPlatform || '',
    osDiskType:     img.osDiskType || '',
    osDiskSizeGB:   img.osDiskSizeGB || '',
    providerName:   img.providerName || '',
    connectionName: img.connectionName || '',
    infraType:      img.infraType || '',
    isGPUImage:         img.isGPUImage || false,
    isKubernetesImage:  img.isKubernetesImage || false,
    isBasicImage:       img.isBasicImage || false,
    isBasicGpuImage:    img.isBasicGpuImage || false,
    isCustomImage:      false,
    details:            img.details || [],
  }));

  if (!candImages.length) {
    errorAlert('No images available for the selected spec.');
    return;
  }

  const candSpec  = candidate.spec;
  const candIsGPU = (candSpec.acceleratorType || '').toLowerCase() === 'gpu';

  // Sort: basic GPU first if GPU spec, else basic OS first
  if (candIsGPU) {
    const gpuScore = img => img.isBasicGpuImage ? 3 : img.isBasicImage ? 2 : img.isGPUImage ? 1 : 0;
    candImages.sort((a, b) => gpuScore(b) - gpuScore(a));
  }

  const escL = window.escapeHtml;
  const candSpecCost = candSpec.costPerHour > 0
    ? `$${parseFloat(candSpec.costPerHour).toFixed(5)}/h` : 'N/A';
  const candAccel = (candSpec.acceleratorType === 'gpu' && candSpec.acceleratorModel)
    ? `<span style="color:#c0392b;font-weight:bold;"> | GPU: ${escL(candSpec.acceleratorModel)} ×${escL(String(candSpec.acceleratorCount||'?'))} (${escL(String(candSpec.acceleratorMemoryGB||'?'))}GB/ea)</span>` : '';

  const truncate = (t, n) => (!t || t.length <= n) ? (t || '') : t.substring(0, n) + '…';

  const imgRows = candImages.map((image, idx) => {
    const isRecGpu  = candIsGPU && image.isBasicGpuImage;
    const rowBg     = isRecGpu ? 'rgba(231,76,60,0.07)' : (image.isBasicImage ? 'rgba(40,167,69,0.06)' : '');
    const basicIcon = image.isBasicImage ? ' ⭐' : '';
    const gpuIcon   = image.isBasicGpuImage ? ' ⭐🧮' : (image.isGPUImage ? ' 🧮' : '');
    const k8sIcon   = image.isKubernetesImage ? ' ☸️' : '';
    return `
      <tr class="eq-img-row" data-index="${idx}" style="cursor:pointer;${rowBg ? 'background:' + rowBg + ';' : ''}">
        <td class="eq-img-sel-indicator text-center" style="width:32px;font-size:1rem;color:#999;">○</td>
        <td style="font-size:0.8rem;">${escL(image.osType || '')}</td>
        <td style="font-size:0.78rem;color:#0066cc;" title="${escL(image.cspImageName || '')}">${escL(truncate(image.cspImageName, 55))}</td>
        <td style="font-size:0.78rem;" title="${escL(image.osDistribution || '')}">${escL(truncate(image.osDistribution, 55))}</td>
        <td class="text-center" style="font-size:0.9rem;">${gpuIcon}${k8sIcon}${basicIcon}</td>
        <td class="text-center" style="font-size:0.8rem;">${escL(image.osArchitecture || '')}</td>
      </tr>`;
  }).join('');

  const step3Result = await Swal.fire({
    title: `Select Image — ${escL(candSpec.cspSpecName || candSpec.id || '')}`,
    width: 1100,
    html: `
      <style>
        .eq-img-row { transition: background 0.1s; }
        .eq-img-row:hover td { background: rgba(0,123,255,0.08) !important; }
        .eq-img-row.eq-img-selected td { background: rgba(40,167,69,0.25) !important; border-left: 3px solid #28a745; }
        .eq-img-row.eq-img-selected .eq-img-sel-indicator { color: #28a745 !important; font-weight: bold; }
      </style>
      <div style="font-size:0.82rem;text-align:left;">
        <div style="margin-bottom:8px;padding:6px 12px;background:#f0f4ff;border:1px solid #c5cae9;
                    border-radius:5px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <span style="font-weight:bold;color:#1565c0;">Spec</span>
          <span style="font-family:monospace;font-size:0.78rem;">${escL(candSpec.id||'')}</span>
          <span style="white-space:nowrap;">| ${escL((candSpec.providerName||'').toUpperCase())} ${escL(candSpec.regionName||'')}</span>
          <span style="white-space:nowrap;">| vCPU: <b>${escL(String(candSpec.vCPU||''))}</b> | Mem: <b>${escL(String(candSpec.memoryGiB||''))} GiB</b> | Arch: ${escL(candSpec.architecture||'N/A')}</span>
          <span style="white-space:nowrap;">| ${escL(candSpecCost)}</span>${candAccel}
        </div>
        ${candIsGPU ? `<div style="margin-bottom:8px;padding:5px 10px;background:linear-gradient(90deg,#fff3cd,#fff8e1);
                      border:1px solid #ffc107;border-radius:5px;font-size:0.8rem;">
          ⚡ <b>GPU Spec</b> — <span style="color:#c0392b;">⭐🧮 Basic GPU images</span> (GPU drivers pre-installed) are listed first.
        </div>` : ''}
        <div style="max-height:380px;overflow-y:auto;border:1px solid #dee2e6;border-radius:4px;">
          <table id="eqImgTable" style="width:100%;border-collapse:collapse;font-size:0.8rem;">
            <thead>
              <tr style="background:#343a40;color:white;position:sticky;top:0;z-index:1;">
                <th style="padding:5px 4px;width:32px;"></th>
                <th style="padding:5px 6px;text-align:left;">OS Type</th>
                <th style="padding:5px 6px;text-align:left;">Image Name</th>
                <th style="padding:5px 6px;text-align:left;">Distribution</th>
                <th style="padding:5px 4px;">Support</th>
                <th style="padding:5px 4px;">Arch</th>
              </tr>
            </thead>
            <tbody id="eq-img-tbody">${imgRows}</tbody>
          </table>
        </div>
        <div style="margin-top:5px;font-size:0.72rem;color:#888;">
          ⭐ Basic OS &nbsp; ⭐🧮 Basic GPU &nbsp; 🧮 GPU-enabled &nbsp; ☸️ Kubernetes
        </div>
        <input type="hidden" id="eq-selected-image-idx" value="0">
      </div>`,
    showCancelButton: true,
    confirmButtonText: isReplace ? '🔄 Replace NodeGroup (spec + image)' : '➕ Add NodeGroup',
    confirmButtonColor: isReplace ? '#1565c0' : '#28a745',
    didOpen: () => {
      const tbody    = document.getElementById('eq-img-tbody');
      const idxInput = document.getElementById('eq-selected-image-idx');

      function selectImgRow(tr) {
        tbody.querySelectorAll('tr.eq-img-row').forEach(r => {
          r.classList.remove('eq-img-selected');
          const ind = r.querySelector('.eq-img-sel-indicator');
          if (ind) ind.textContent = '○';
        });
        tr.classList.add('eq-img-selected');
        const ind = tr.querySelector('.eq-img-sel-indicator');
        if (ind) ind.textContent = '◉';
        idxInput.value = tr.dataset.index;
      }

      tbody.querySelectorAll('tr.eq-img-row').forEach(tr => {
        tr.addEventListener('click', () => selectImgRow(tr));
      });

      const firstRow = tbody.querySelector('tr.eq-img-row');
      if (firstRow) selectImgRow(firstRow);
    },
    preConfirm: () => parseInt(document.getElementById('eq-selected-image-idx').value),
  });

  if (!step3Result.isConfirmed) return;

  const selectedImage = candImages[step3Result.value];

  // ── Apply result ───
  // Preserve rootDiskType only when the CSP is unchanged; cross-CSP disk type
  // names are incompatible so fall back to the candidate spec's default.
  const originalProvider = (spec.providerName || '').toLowerCase();
  const candidateProvider = (candSpec.providerName || '').toLowerCase();
  const resolvedDiskType = (originalProvider && originalProvider === candidateProvider)
    ? (nodeConf.rootDiskType || 'default')
    : (candSpec.rootDiskType || 'default');

  const newNodeConf = {
    name:          isReplace
      ? nodeConf.name
      : 'g' + (nodeGroupRequestFromSpecList.length + 1),
    specId:        candSpec.id,
    imageId:       selectedImage.cspImageName || selectedImage.id,
    rootDiskType:  resolvedDiskType,
    rootDiskSize:  nodeConf.rootDiskSize || 0,
    nodeGroupSize: nodeConf.nodeGroupSize,
  };
  // Labels are CSP-agnostic — carry them over unconditionally.
  if (nodeConf.label && Object.keys(nodeConf.label).length > 0) {
    newNodeConf.label = { ...nodeConf.label };
  }

  if (isReplace) {
    nodeGroupRequestFromSpecList[index] = newNodeConf;
    recommendedSpecList[index]          = candSpec;
    successAlert(`NodeGroup "${newNodeConf.name}" replaced with alternative config in ${provider.toUpperCase()}.`);
  } else {
    nodeGroupRequestFromSpecList.push(newNodeConf);
    recommendedSpecList.push(candSpec);
    successAlert(`Added alternative NodeGroup "${newNodeConf.name}" for ${provider.toUpperCase()}.`);
  }

  renderMapFromConfig();
  updateNodeGroupReview();
}

// buildMatchCriteriaRow generates a policy selector row for the advanced section
function buildMatchCriteriaRow(field, label, defaultPolicy, modelOnlyWarning) {
  const opts = ['required','preferred','open'].map(p =>
    `<option value="${p}"${p === defaultPolicy ? ' selected' : ''}>${p}</option>`
  ).join('');
  return `
    <div>
      <label style="display:block;margin-bottom:2px;">${label}</label>
      <select id="eq-criteria-${field}" style="width:100%;padding:4px;border:1px solid #ced4da;border-radius:3px;font-size:0.78rem;">
        ${opts}
      </select>
    </div>`;
}

// readMatchCriteriaFromForm collects the per-field policy values from the Step 1 form
function readMatchCriteriaFromForm() {
  const fields = ['architecture','vCPU','memoryGiB','acceleratorType',
                  'acceleratorModel','acceleratorCount','acceleratorMemoryGB','costPerHour'];
  const result = {};
  fields.forEach(f => {
    const el = document.getElementById(`eq-criteria-${f}`);
    if (el && el.value) result[f] = el.value;
  });
  return result;
}

// Removes a single NodeGroup from the configuration immediately (no confirm:
// it only edits the local, not-yet-provisioned configuration).
function removeNodeGroup(index) {
  // Guard against a stale UI index: splicing would be a no-op but the
  // counter decrement below would still desynchronize the configuration.
  if (!Number.isInteger(index) || index < 0 || index >= nodeGroupRequestFromSpecList.length) {
    return;
  }

  nodeGroupRequestFromSpecList.splice(index, 1);
  recommendedSpecList.splice(index, 1);

  // Decrease the index counter
  if (window.latLonInputPairIdx > 0) {
    window.latLonInputPairIdx--;
  }

  renderMapFromConfig();
  updateNodeGroupReview();
}

// Make functions available globally
window.updateNodeGroupReview = updateNodeGroupReview;
window.editNodeGroup = editNodeGroup;
window.removeNodeGroup = removeNodeGroup;
window.findAlternativeNodeConfig = findAlternativeNodeConfig;
window.openSpecSelectionDialog = openSpecSelectionDialog;
window.fetchImagesForSpec = fetchImagesForSpec;
window.openImageSelectionDialog = openImageSelectionDialog;
window.openNodeGroupConfigModal = openNodeGroupConfigModal;
window.selectSpecsForImage = selectSpecsForImage;
window.populateEditImageSelect = populateEditImageSelect;

export {
  getRecommendedSpec,
  openSpecSelectionDialog,
  fetchImagesForSpec,
  openImageSelectionDialog,
  openNodeGroupConfigModal,
  selectSpecsForImage,
  populateEditImageSelect,
  updateNodeGroupReview,
  editNodeGroup,
  removeNodeGroup,
  findAlternativeNodeConfig,
};
