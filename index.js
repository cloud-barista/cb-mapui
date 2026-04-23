/*
Copyright 2019 The Cloud-Barista Authors.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
    http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

----
Copyright for OpenLayers (https://openlayers.org/)

BSD 2-Clause License

Copyright 2005-present, OpenLayers Contributors
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
----
*/

// Debug Configuration
const DEBUG_CONFIG = {
  ENABLE_PERFORMANCE_LOGS: false,  // Map performance related logs
  ENABLE_API_RESPONSE_LOGS: false, // API response logs 
  ENABLE_NODE_DEBUG_LOGS: false,     // Detailed Node structure logs
  ENABLE_RESOURCE_LOGS: false,     // Resource loading logs
  ENABLE_MAP_OPERATION_LOGS: false // Map operation logs
};

// Debug helper functions
const debugLog = {
  performance: (...args) => DEBUG_CONFIG.ENABLE_PERFORMANCE_LOGS && console.log('[Performance]', ...args),
  api: (...args) => DEBUG_CONFIG.ENABLE_API_RESPONSE_LOGS && console.log('[API]', ...args),
  node: (...args) => DEBUG_CONFIG.ENABLE_NODE_DEBUG_LOGS && console.log('[Node Debug]', ...args),
  resource: (...args) => DEBUG_CONFIG.ENABLE_RESOURCE_LOGS && console.log('[Resource]', ...args),
  mapOp: (...args) => DEBUG_CONFIG.ENABLE_MAP_OPERATION_LOGS && console.log('[Map]', ...args)
};

// OpenLayers CSS
import "ol/ol.css";

// OpenLayers core components
import Map from "ol/Map";
import View from "ol/View";
import Feature from "ol/Feature";
import Overlay from "ol/Overlay";

// OpenLayers geometry types
import { MultiPoint, Point, LineString, Polygon } from "ol/geom";

// OpenLayers layer types
import TileLayer from "ol/layer/Tile";
import { Vector as VectorLayer } from "ol/layer";

// OpenLayers source types
import OSM from "ol/source/OSM";
import { TileJSON, Vector as VectorSource } from "ol/source";

// OpenLayers style components
import {
  Circle as CircleStyle,
  Fill,
  Stroke,
  Style,
  Text,
  Icon,
} from "ol/style";

// OpenLayers utilities and controls
import { getVectorContext } from "ol/render";
import { useGeographic, toLonLat } from "ol/proj";
import { toStringHDMS, createStringXY } from "ol/coordinate";
import MousePosition from "ol/control/MousePosition";
import { defaults as defaultControls } from "ol/control";

// Third-party libraries
import Swal from "sweetalert2";
import axios, { AxiosError } from "axios";
import JSONFormatter from "json-formatter-js";
import JSZip from "jszip";

// Expose Swal globally for inline onclick handlers
window.Swal = Swal;

// ========== RESOURCE GRAPH MODULE (Resource Graph Feature) ==========
// Import resource graph module for interactive resource visualization
import './resource-graph.js';
// ========== END RESOURCE GRAPH MODULE ==========

useGeographic();
var i, j;
var cnti, cntj;

function getActionAnimation(targetAction) {
  if (!targetAction || targetAction === "None" || targetAction === "") {
    return "";
  }
  
  const spinChars = ['◐', '◓', '◑', '◒'];
  const index = Math.floor(Date.now() / 150) % spinChars.length;
  return ' ' + spinChars[index];
}

// Get color for target action spinner
function getTargetActionColor(targetAction) {
  if (!targetAction) return [0, 0, 0, 1]; // black for default/no action
  
  const action = targetAction.toLowerCase();
  
  switch (action) {
    case 'create':
      return [59, 130, 246, 1]; // blue #3b82f6
    case 'terminate':
      return [239, 68, 68, 1]; // red #ef4444
    case 'suspend':
      return [107, 114, 128, 1]; // gray #6b7280
    case 'resume':
      return [59, 130, 246, 1]; // blue #3b82f6
    case 'restart':
    case 'reboot':
      return [249, 115, 22, 1]; // orange #f97316
    default:
      return [0, 0, 0, 1]; // black for unknown actions
  }
}

// Map-based Infra render data store: Map<infraId, InfraRenderData>
// Each entry holds all render data for a single Infra, enabling O(1) add/remove.
// InfraRenderData = { id, name, status, targetAction, geometry, geometryPoints, geo, isLocationless }
// Note: Use globalThis.Map to avoid collision with OpenLayers' Map import (ol/Map)
var infraRenderMap = new globalThis.Map();

// Constants for positioning locationless Infras (preparing, prepared, failed, empty states)
const LOCATIONLESS_Infra_LEFT_OFFSET = 0.12;    // 12% offset from left edge to prevent name clipping
const LOCATIONLESS_Infra_TOP_OFFSET = 0.03;     // 3% offset from top edge
const LOCATIONLESS_Infra_VERTICAL_SPACING = 0.05; // 5% of map height between stacked Infras

var k8sName = new Array();
var k8sStatus = new Array();
var k8sCoords = new Array(); // Store individual coordinates for text rendering
var k8sClusterGroups = new Array(); // Store cluster group polygons (from clustergroup label)
var k8sClusterGroupNames = new Array(); // Store cluster group names

// Infra VNet cluster visualization storage
var infraClusterPolygons = new globalThis.Map(); // Map<infraId, Array<Polygon>>
var infraClusterNames = new globalThis.Map();    // Map<infraId, Array<clusterId>>
var infraClusterColors = new globalThis.Map();   // Map<infraId, Map<clusterId, color>>

var cspListDisplayEnabled = document.getElementById("displayOn");
var recommendPolicy = document.getElementById("recommendPolicy");
var selectApp = document.getElementById("selectApp");
var showInfraClusterLabels = false;

// Configuration variables (previously from removed form elements)
var configHostname = "localhost";
var configPort = "1323";
var configUsername = "default";
var configPassword = "default";
var configCredentialHolder = "admin";
var configNamespace = "";
window.configNamespace = configNamespace;
var cachedNamespaceList = [];

// Helper function to get current configuration
function getConfig() {
  return {
    hostname: configHostname,
    port: configPort,
    username: configUsername,
    password: configPassword,
    credentialHolder: configCredentialHolder,
    namespace: configNamespace
  };
}
window.getConfig = getConfig;

// Axios interceptor: inject X-Credential-Holder header into all requests
axios.interceptors.request.use(function (axiosConfig) {
  if (configCredentialHolder && configCredentialHolder !== "") {
    if (!axiosConfig.headers) {
      axiosConfig.headers = {};
    }
    axiosConfig.headers["X-Credential-Holder"] = configCredentialHolder;
  }
  return axiosConfig;
});

var infraidElement = document.getElementById("infraid");

// Central Data Store for sharing with Dashboard
window.cloudBaristaCentralData = {
  infraData: [],
  vmData: [],
  resourceData: {},
  vNet: [],
  securityGroup: [],
  sshKey: [],
  k8sCluster: [],
  connection: [],
  vpn: [],
  customImage: [],
  dataDisk: [],
  objectStorage: [],
  sqlDb: [],
  lastUpdated: null,
  subscribers: [],
  // API status tracking for better error handling
  apiStatus: {
    k8sCluster: 'unknown', // 'loading', 'success', 'error', 'unknown'
    lastK8sClusterUpdate: null,
    lastK8sClusterError: null
  }
};

// Subscribe to data updates
window.subscribeToDataUpdates = function(callback) {
  window.cloudBaristaCentralData.subscribers.push(callback);
};

// Notify all subscribers when data changes
function notifyDataSubscribers() {
  window.cloudBaristaCentralData.lastUpdated = new Date();
  window.cloudBaristaCentralData.subscribers.forEach(callback => {
    try {
      callback(window.cloudBaristaCentralData);
    } catch (error) {
      console.log('Error notifying subscriber:', error);
    }
  });
}

// Initialize map's Last Updated display (no-op: timestamp removed from banner)
function initializeMapLastUpdated() {
  // Timestamp display was removed from the map controls banner.
  // This function is kept as a no-op to avoid breaking callers.
}

// Update map connection status
function updateMapConnectionStatus(status) {
  const statusElement = document.getElementById('mapConnectionStatus');
  if (!statusElement) return;
  
  // Set consistent styling for all states (icon-only)
  statusElement.style.fontSize = '10px';
  statusElement.style.textAlign = 'center';
  statusElement.style.display = 'inline-block';
  
  switch (status) {
    case 'connected':
      statusElement.className = 'badge badge-success';
      statusElement.innerHTML = '<i class="fas fa-check-circle"></i>';
      statusElement.title = 'Connected';
      break;
    case 'connecting':
      statusElement.className = 'badge badge-warning';
      statusElement.innerHTML = '<i class="fas fa-sync fa-spin"></i>';
      statusElement.title = 'Updating';
      break;
    case 'disconnected':
      statusElement.className = 'badge badge-danger';
      statusElement.innerHTML = '<i class="fas fa-times-circle"></i>';
      statusElement.title = 'No Data';
      break;
    default:
      statusElement.className = 'badge badge-secondary';
      statusElement.innerHTML = '<i class="fas fa-question-circle"></i>';
      statusElement.title = 'Unknown';
  }
}

// Show/hide map refresh indicator
function showMapRefreshIndicator(show) {
  const indicator = document.getElementById('mapRefreshIndicator');
  if (indicator) {
    indicator.style.visibility = show ? 'visible' : 'hidden';
  }
}

// Show map settings
function showMapSettings() {
  // Get current refresh interval from global variable
  const currentRefreshInterval = refreshInterval.toString();
  
  // Define available refresh intervals
  const intervals = [1, 5, 10, 20, 30, 40, 50, 100];
  
  // Generate interval pill options
  const intervalPills = intervals.map(interval => {
    return `<label class="refresh-pill">
      <input class="refresh-pill-input" type="radio" name="refreshInterval" value="${interval}" ${currentRefreshInterval == interval ? 'checked' : ''}>
      <span class="refresh-pill-label">${interval}s</span>
    </label>`;
  }).join('');

  // Generic icon mode
  const genericIconChecked = useGenericCspIcons ? 'checked' : '';
  const infraClusterLabelChecked = showInfraClusterLabels ? 'checked' : '';

  // Build namespace options
  const nsOptions = cachedNamespaceList.map(ns => {
    const safeNs = window.escapeHtml(ns);
    const selected = ns === configNamespace ? 'selected' : '';
    return `<option value="${safeNs}" ${selected}>${safeNs}</option>`;
  }).join('');
  const nsSelectHtml = nsOptions || `<option value="${window.escapeHtml(configNamespace)}" selected>${window.escapeHtml(configNamespace) || '(none)'}</option>`;

  // Build credential holder options
  const holderOptions = cachedCredentialHolderList.map(holder => {
    const holderId = window.escapeHtml(holder.credentialHolder || holder.id || '');
    const connCount = holder.verifiedConnectionCount || holder.connectionCount || 0;
    const providers = window.escapeHtml((holder.providers || []).join(', '));
    const selected = (holder.credentialHolder || holder.id || '') === configCredentialHolder ? 'selected' : '';
    return `<option value="${holderId}" ${selected} title="Providers: ${providers || 'none'}">${holderId} (${connCount} conn${connCount !== 1 ? 's' : ''})</option>`;
  }).join('');
  const holderSelectHtml = holderOptions || `<option value="${window.escapeHtml(configCredentialHolder)}" selected>${window.escapeHtml(configCredentialHolder)}</option>`;
  
  Swal.fire({
    title: '',
    html: `
    <style>
      .settings-section { text-align:left; margin:0 0 16px 0; }
      .settings-label { font-size:12px; font-weight:600; color:#495057; margin-bottom:6px; display:flex; align-items:center; gap:6px; }
      .settings-label i { font-size:13px; color:#6c757d; width:16px; text-align:center; }
      .settings-hint { font-size:11px; color:#9ca3af; margin-top:4px; }
      .settings-select { width:100%; padding:7px 10px; border:1px solid #dee2e6; border-radius:6px; font-size:13px; color:#212529; background:#fff; transition:border-color .15s; outline:none; }
      .settings-select:focus { border-color:#86b7fe; box-shadow:0 0 0 3px rgba(13,110,253,.15); }
      .settings-divider { border:none; border-top:1px solid #f0f0f0; margin:16px 0; }
      .settings-pills { text-align:center; }
      .refresh-pill { position:relative; display:inline-block; margin:3px; cursor:pointer; }
      .refresh-pill-input { position:absolute; opacity:0; width:1px; height:1px; margin:0; }
      .refresh-pill-label { display:inline-block; padding:4px 12px; border-radius:16px; border:1px solid #ced4da; background:#fff; color:#495057; font-size:12px; font-weight:500; transition:all .15s; }
      .refresh-pill-input:checked + .refresh-pill-label { background:#0d6efd; color:#fff; border-color:#0d6efd; }
      .refresh-pill-input:focus + .refresh-pill-label, .refresh-pill-input:focus-visible + .refresh-pill-label { outline:2px solid #86b7fe; outline-offset:2px; }
      .settings-toggle { display:flex; align-items:center; gap:8px; cursor:pointer; }
      .settings-toggle input[type="checkbox"] { width:16px; height:16px; accent-color:#0d6efd; cursor:pointer; }
      .settings-toggle span { font-size:13px; color:#495057; }
      .settings-csp-preview { margin-top:8px; display:flex; flex-wrap:wrap; gap:4px; justify-content:center; }
      .settings-csp-pill { display:inline-flex; align-items:center; gap:3px; padding:2px 7px; border-radius:10px; color:#fff; font-size:9px; font-weight:600; letter-spacing:.3px; }
    </style>
    <div style="text-align:center;margin-bottom:16px;">
      <i class="fas fa-cog" style="font-size:20px;color:#6c757d;"></i>
      <div style="font-size:16px;font-weight:600;color:#212529;margin-top:4px;">Settings</div>
    </div>

    <div class="settings-section">
      <div class="settings-label"><i class="fas fa-tag"></i> Namespace</div>
      <select id="settings-namespace" class="settings-select">${nsSelectHtml}</select>
      <div class="settings-hint">Active namespace for Provision and Control panels</div>
    </div>

    <hr class="settings-divider">

    <div class="settings-section">
      <div class="settings-label"><i class="fas fa-key"></i> Credential Holder</div>
      <select id="settings-credentialHolder" class="settings-select">${holderSelectHtml}</select>
      <div class="settings-hint">Filter connections and map icons by holder</div>
    </div>

    <hr class="settings-divider">

    <div class="settings-section">
      <div class="settings-label"><i class="fas fa-sync-alt"></i> Refresh Interval</div>
      <div class="settings-pills">${intervalPills}</div>
    </div>

    <hr class="settings-divider">

    <div class="settings-section">
      <div class="settings-label"><i class="fas fa-palette"></i> CSP Icon Style</div>
      <label class="settings-toggle">
        <input type="checkbox" id="genericIconToggle" ${genericIconChecked}>
        <span>Use generic colored icons (hide CSP logos)</span>
      </label>
      <div class="settings-csp-preview">
        ${Object.keys(cspGenericColors).map(csp => {
          const color = cspGenericColors[csp];
          return '<span class="settings-csp-pill" style="background:' + color + ';">' +
            '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.4);"></span>' +
            csp.toUpperCase() + '</span>';
        }).join('')}
      </div>
    </div>

    <hr class="settings-divider">

    <div class="settings-section">
      <div class="settings-label"><i class="fas fa-font"></i> Cluster Labels</div>
      <label class="settings-toggle">
        <input type="checkbox" id="infraClusterLabelToggle" ${infraClusterLabelChecked}>
        <span>Show infra cluster labels on map</span>
      </label>
      <div class="settings-hint">Display cluster IDs above cluster boundaries</div>
    </div>
  `,
    showCancelButton: true,
    confirmButtonText: 'Apply',
    cancelButtonText: 'Cancel',
    customClass: {
      popup: 'swal2-popup',
      confirmButton: 'swal2-confirm',
      cancelButton: 'swal2-cancel'
    },
    width: 380,
    preConfirm: () => {
      const selectedInterval = document.querySelector('input[name="refreshInterval"]:checked');
      if (!selectedInterval) {
        Swal.showValidationMessage('Please select a refresh interval');
        return false;
      }
      const genericIconEnabled = document.getElementById('genericIconToggle')?.checked || false;
      const infraClusterLabelEnabled = document.getElementById('infraClusterLabelToggle')?.checked || false;
      const selectedHolder = document.getElementById('settings-credentialHolder')?.value || configCredentialHolder;
      const selectedNs = document.getElementById('settings-namespace')?.value || configNamespace;
      return {
        refreshInterval: selectedInterval.value,
        genericIcons: genericIconEnabled,
        infraClusterLabels: infraClusterLabelEnabled,
        credentialHolder: selectedHolder,
        namespace: selectedNs
      };
    }
  }).then((result) => {
    if (result.isConfirmed) {
      const newRefreshInterval = parseInt(result.value.refreshInterval);
      const holderChanged = result.value.credentialHolder !== configCredentialHolder;
      
      // Update global refresh interval variable
      refreshInterval = newRefreshInterval;

      // Update generic icon mode
      useGenericCspIcons = result.value.genericIcons;
      window.useGenericCspIcons = useGenericCspIcons;
      showInfraClusterLabels = result.value.infraClusterLabels;
      // Clear cached generic styles so they can be regenerated if needed
      Object.keys(cspGenericStyles).forEach(k => delete cspGenericStyles[k]);
      Object.keys(nodeGenericCloudStyleCache).forEach(k => delete nodeGenericCloudStyleCache[k]);
      // Force map re-render to apply icon change
      map.render();
      const view = map.getView();
      if (view) view.changed();

      // Apply namespace change
      const nsChanged = result.value.namespace !== configNamespace;
      if (nsChanged) {
        applyNamespace(result.value.namespace);
      }

      // Apply credential holder change (triggers connection reload + map refresh)
      if (holderChanged) {
        applyCredentialHolder(result.value.credentialHolder);
      }

      // Show brief confirmation
      var statusParts = [];
      statusParts.push(`NS: ${result.value.namespace}`);
      statusParts.push(`Holder: ${result.value.credentialHolder}`);
      statusParts.push(`Refresh: ${newRefreshInterval}s`);
      if (useGenericCspIcons) statusParts.push('Generic icons: ON');
      if (showInfraClusterLabels) statusParts.push('Cluster labels: ON');
      
      Swal.fire({
        icon: 'success',
        text: statusParts.join(' · '),
        timer: 1500,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
    }
  });
}

// Performance monitoring and memory management
let mapPerformanceMetrics = {
  layerCount: 0,
  featureCount: 0,
  lastCleanupTime: Date.now(),
  renderCount: 0
};

// Map performance cleanup function
function performMapCleanup() {
  const now = Date.now();
  const timeSinceLastCleanup = now - mapPerformanceMetrics.lastCleanupTime;
  
  // Run cleanup every 10 minutes or when layer count is high
  if (timeSinceLastCleanup > 600000 || mapPerformanceMetrics.layerCount > 50) {
    debugLog.performance('Running map cleanup...');
    
    // Count current layers
    let currentLayerCount = 0;
    map.getLayers().forEach(() => currentLayerCount++);
    
    // If too many layers, clear and refresh
    if (currentLayerCount > 50) {
      debugLog.performance(`Too many layers (${currentLayerCount}), clearing map...`);
      clearMap();
    }
    
    mapPerformanceMetrics.lastCleanupTime = now;
    mapPerformanceMetrics.layerCount = currentLayerCount;
    
    debugLog.performance(`Cleanup completed. Current layers: ${currentLayerCount}`);
  }
}

// Map cleanup on page unload
function performMapFinalCleanup() {
  debugLog.performance('Performing final map cleanup...');
  
  // Clear all timers
  if (window.mapRenderTimeout) {
    clearTimeout(window.mapRenderTimeout);
  }
  
  // Clear map properly
  clearMap();
  
  // Reset performance metrics
  mapPerformanceMetrics = {
    layerCount: 0,
    featureCount: 0,
    lastCleanupTime: Date.now(),
    renderCount: 0
  };
  
  debugLog.performance('Final cleanup completed');
}

// Add cleanup events
window.addEventListener('beforeunload', performMapFinalCleanup);
window.addEventListener('unload', performMapFinalCleanup);
window.addEventListener('pagehide', performMapFinalCleanup);

// Periodic map performance monitoring
setInterval(performMapCleanup, 300000); // Check every 5 minutes

// Export functions for global access
window.updateMapConnectionStatus = updateMapConnectionStatus;
window.showMapSettings = showMapSettings;
window.showMapRefreshIndicator = showMapRefreshIndicator;
window.performMapCleanup = performMapCleanup;

const typeStringConnection = "connection";
const typeStringProvider = "provider";
const typeStringImage = "image";
const typeStringSpec = "spec";
const typeStringSG = "securityGroup";
const typeStringSshKey = "sshKey";
const typeStringVNet = "vNet";
const typeInfo = "info";
const typeError = "error";

var tileLayer = new TileLayer({
  source: new OSM(),
});

/*
 * Create the map.
 */
var map = new Map({
  layers: [tileLayer],
  target: "map",
  view: new View({
    center: [30, 30],
    zoom: 3,
  }),
  //projection: 'EPSG:4326'
});

// Optimized clearMap function to prevent memory leaks
function clearMap() {
  debugLog.mapOp("Map cleared - optimized");
  
  // Clear Infra render data
  infraRenderMap.clear();
  
  // Clear resource location data
  geoResourceLocation.k8s = [];
  geoResourceLocation.sg = [];
  geoResourceLocation.sshKey = [];
  geoResourceLocation.vnet = [];
  geoResourceLocation.vpn = [];

  // Remove all layers except the base tile layer to prevent memory leaks
  const layersToRemove = [];
  map.getLayers().forEach(function(layer) {
    if (layer !== tileLayer) {
      layersToRemove.push(layer);
    }
  });
  
  layersToRemove.forEach(function(layer) {
    map.removeLayer(layer);
    if (layer.getSource && typeof layer.getSource === 'function') {
      const source = layer.getSource();
      if (source && source.clear && typeof source.clear === 'function') {
        source.clear();
      }
      if (source && source.getFeatures && typeof source.getFeatures === 'function') {
        const features = source.getFeatures();
        features.forEach(feature => {
          if (feature.dispose && typeof feature.dispose === 'function') {
            feature.dispose();
          }
        });
      }
    }
  });

  debugLog.performance(`Removed ${layersToRemove.length} layers`);
  map.render();
}
window.clearMap = clearMap;

function clearCircle(option) {
  //document.getElementById("latLonInputPairArea").innerHTML = '';
  if (option == "clearText") {
    debugLog.mapOp("Circle configuration cleared");
  }
  latLonInputPairIdx = 0;
  nodeGroupRequestFromSpecList = [];
  recommendedSpecList = [];
  cspPointsCircle = [];
  geoCspPointsCircle = [];
  
  // Update NodeGroup review panel
  if (typeof updateNodeGroupReview === 'function') {
    updateNodeGroupReview();
  }
}
window.clearCircle = clearCircle;

function writeLatLonInputPair(idx, lat, lon) {
  var recommendedSpec = getRecommendedSpec(idx, lat, lon);
  var latf = lat.toFixed(4);
  var lonf = lon.toFixed(4);

  //document.getElementById("latLonInputPairArea").innerHTML +=
  `Node ${idx + 1}: (${latf}, ${lonf}) / `;
  if (idx == 0) {
    debugLog.mapOp("Started Infra configuration");
  }
  debugLog.mapOp(`Node-${idx + 1} Location: ${latf}, ${lonf} | Best Spec: `);
}

var latLonInputPairIdx = 0;
var nodeGroupRequestFromSpecList = new Array();
var recommendedSpecList = new Array();

// ========== LABEL RECOMMENDATION SYSTEM ==========
// Predefined common labels for NodeGroup configuration
const PREDEFINED_LABELS = [
  { key: 'role', value: 'control', description: 'Control plane node' },
  { key: 'role', value: 'node', description: 'General node' },
  { key: 'role', value: 'head', description: 'Head node (cluster manager)' },
  { key: 'role', value: 'worker', description: 'Worker node' },
  { key: 'role', value: 'model', description: 'LLM model serving node' },
  { key: 'role', value: 'gui', description: 'GUI/Dashboard node' },
  { key: 'role', value: 'benchmark', description: 'Benchmark manager node' },
  { key: 'role', value: 'observability', description: 'Monitoring/telemetry node' },
  { key: 'accelerator', value: 'gpu', description: 'GPU-enabled node' }
];

// ========== SHARED HELPER FUNCTIONS ==========

// Helper: recursively extract all string values from JSON object
window.extractStringValuesFromJson = function(obj, path = '', results = []) {
  if (typeof obj === 'string') {
    results.push({ path, value: obj });
  } else if (Array.isArray(obj)) {
    obj.forEach((item, idx) => window.extractStringValuesFromJson(item, `${path}[${idx}]`, results));
  } else if (obj && typeof obj === 'object') {
    Object.keys(obj).forEach(key => {
      const newPath = path ? `${path}.${key}` : key;
      window.extractStringValuesFromJson(obj[key], newPath, results);
    });
  }
  return results;
};

// Helper: collect likely Base64 strings from string values (using Set for O(1) dedup)
window.collectBase64FromStringValues = function(stringValues) {
  const foundSet = new Set();
  
  stringValues.forEach(({ path, value }) => {
    // Split by newlines and whitespace boundaries to find base64 segments
    const segments = value.split(/[\r\n\s]+/);
    
    segments.forEach(segment => {
      const trimmed = segment.trim();
      if (trimmed.length < 40) return; // Skip short segments
      if (!/^[A-Za-z0-9+/=]+$/.test(trimmed)) return; // Only valid chars
      if (trimmed.toLowerCase().includes('http')) return; // Skip URLs
      
      try {
        const testDecode = atob(trimmed);
        if (testDecode.length > 0) {
          foundSet.add(trimmed);
        }
      } catch (e) {
        // Not valid base64
      }
    });
    
    // Also check for inline base64 (entire string is base64 with whitespace)
    if (value.length >= 40 && /^[A-Za-z0-9+/=\s]+$/.test(value)) {
      const cleaned = value.replace(/\s/g, '');
      if (cleaned.length >= 40) {
        try {
          atob(cleaned);
          foundSet.add(cleaned);
        } catch (e) {}
      }
    }
  });
  
  return Array.from(foundSet);
};

// ========== END SHARED HELPER FUNCTIONS ==========

// Recently used labels (in-memory storage)
window._recentlyUsedLabels = [];
const MAX_RECENT_LABELS = 10;

// Add label to recently used list
window.addToRecentLabels = function(labelPair) {
  if (!labelPair || !labelPair.includes('=')) return;
  
  // Remove if already exists
  window._recentlyUsedLabels = window._recentlyUsedLabels.filter(l => l !== labelPair);
  
  // Add to front
  window._recentlyUsedLabels.unshift(labelPair);
  
  // Keep only recent N
  if (window._recentlyUsedLabels.length > MAX_RECENT_LABELS) {
    window._recentlyUsedLabels = window._recentlyUsedLabels.slice(0, MAX_RECENT_LABELS);
  }
};

// Add suggested label to input field
window.addSuggestedLabel = function(labelPair, inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  const currentValue = input.value.trim();
  const existingLabels = currentValue ? currentValue.split(',').map(l => l.trim()).filter(l => l) : [];
  
  // Check if label already exists
  if (existingLabels.includes(labelPair)) {
    console.log('Label already exists:', labelPair);
    return;
  }
  
  // Add the new label
  existingLabels.push(labelPair);
  input.value = existingLabels.join(', ');
  
  // Update chip styling
  updateLabelSuggestionChipStyle(labelPair, inputId, true);
  
  // Add to recently used
  window.addToRecentLabels(labelPair);
};

// Remove suggested label from input field
window.removeSuggestedLabel = function(labelPair, inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  const currentValue = input.value.trim();
  const existingLabels = currentValue ? currentValue.split(',').map(l => l.trim()).filter(l => l) : [];
  
  // Remove the label
  const newLabels = existingLabels.filter(l => l !== labelPair);
  input.value = newLabels.join(', ');
  
  // Update chip styling
  updateLabelSuggestionChipStyle(labelPair, inputId, false);
};

// Toggle label in input field
window.toggleSuggestedLabel = function(labelPair, inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  const currentValue = input.value.trim();
  const existingLabels = currentValue ? currentValue.split(',').map(l => l.trim()).filter(l => l) : [];
  
  if (existingLabels.includes(labelPair)) {
    window.removeSuggestedLabel(labelPair, inputId);
  } else {
    window.addSuggestedLabel(labelPair, inputId);
  }
};

// Update chip style based on selection state
window.updateLabelSuggestionChipStyle = function(labelPair, inputId, isSelected) {
  const container = document.getElementById(`${inputId}-suggestions`);
  if (!container) return;
  
  const chips = container.querySelectorAll('.label-suggestion-chip');
  chips.forEach(chip => {
    if (chip.dataset.label === labelPair) {
      if (isSelected) {
        chip.classList.add('selected');
        chip.style.background = '#28a745';
        chip.style.borderColor = '#28a745';
      } else {
        chip.classList.remove('selected');
        chip.style.background = '#e9ecef';
        chip.style.borderColor = '#ced4da';
      }
    }
  });
};

// Sync all chip styles with current input value
window.syncLabelSuggestionChips = function(inputId) {
  const input = document.getElementById(inputId);
  const container = document.getElementById(`${inputId}-suggestions`);
  if (!input || !container) return;
  
  const currentLabels = input.value.trim().split(',').map(l => l.trim()).filter(l => l);
  const chips = container.querySelectorAll('.label-suggestion-chip');
  
  chips.forEach(chip => {
    const labelPair = chip.dataset.label;
    const isSelected = currentLabels.includes(labelPair);
    
    if (isSelected) {
      chip.classList.add('selected');
      chip.style.background = '#28a745';
      chip.style.borderColor = '#28a745';
      chip.style.color = 'white';
    } else {
      chip.classList.remove('selected');
      chip.style.background = '#e9ecef';
      chip.style.borderColor = '#ced4da';
      chip.style.color = '#495057';
    }
  });
};

// Generate label suggestion chips HTML
window.generateLabelSuggestionChipsHtml = function(inputId, hasGpu = false, currentLabels = '') {
  const existingLabels = currentLabels ? currentLabels.split(',').map(l => l.trim()).filter(l => l) : [];
  
  let html = `<div id="${inputId}-suggestions" style="margin-top: 6px;">`;
  html += '<div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">';
  
  // Get unique labels to show (predefined + recent, avoiding duplicates)
  const labelsToShow = [];
  const addedLabels = new Set();
  
  // Add predefined labels
  PREDEFINED_LABELS.forEach(label => {
    const labelPair = `${label.key}=${label.value}`;
    if (!addedLabels.has(labelPair)) {
      labelsToShow.push({ ...label, labelPair, isRecent: false });
      addedLabels.add(labelPair);
    }
  });
  
  // Add recent labels (that are not in predefined)
  window._recentlyUsedLabels.forEach(labelPair => {
    if (!addedLabels.has(labelPair)) {
      const [key, value] = labelPair.split('=');
      labelsToShow.push({ key, value, labelPair, isRecent: true, description: 'Recently used' });
      addedLabels.add(labelPair);
    }
  });
  
  // Generate chips (with XSS protection)
  labelsToShow.forEach(label => {
    const isSelected = existingLabels.includes(label.labelPair);
    const isGpuLabel = label.labelPair === 'accelerator=gpu';
    const chipStyle = isSelected 
      ? 'background: #28a745; border-color: #28a745; color: white;'
      : 'background: #e9ecef; border-color: #ced4da; color: #495057;';
    const recentBadge = label.isRecent ? '<span style="font-size: 8px; margin-left: 2px;">⏱</span>' : '';
    const gpuBadge = isGpuLabel && hasGpu ? '<span style="font-size: 8px; margin-left: 2px;">🎮</span>' : '';
    
    // Escape values to prevent XSS
    const escapedLabelPair = (label.labelPair || '').replace(/'/g, "&#39;").replace(/"/g, '&quot;');
    const escapedInputId = (inputId || '').replace(/'/g, "&#39;").replace(/"/g, '&quot;');
    const escapedValue = (label.value || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapedDescription = (label.description || label.labelPair || '').replace(/"/g, '&quot;');
    
    html += `<button type="button" class="label-suggestion-chip ${isSelected ? 'selected' : ''}" 
      data-label="${escapedLabelPair}"
      onclick="toggleSuggestedLabel('${escapedLabelPair}', '${escapedInputId}')"
      style="padding: 2px 8px; border: 1px solid #ced4da; border-radius: 12px; 
             font-size: 0.7rem; cursor: pointer; transition: all 0.2s; ${chipStyle}"
      title="${escapedDescription}">
      ${escapedValue}${recentBadge}${gpuBadge}
    </button>`;
  });
  
  html += '</div></div>';
  return html;
};

// Auto-add GPU label if spec has GPU
window.autoAddGpuLabel = function(hasGpu, inputId) {
  if (!hasGpu) return;
  
  const input = document.getElementById(inputId);
  if (!input) return;
  
  const gpuLabel = 'accelerator=gpu';
  const currentValue = input.value.trim();
  const existingLabels = currentValue ? currentValue.split(',').map(l => l.trim()).filter(l => l) : [];
  
  // Only auto-add if not already present
  if (!existingLabels.includes(gpuLabel)) {
    existingLabels.push(gpuLabel);
    input.value = existingLabels.join(', ');
    
    // Sync chips after auto-add
    setTimeout(() => window.syncLabelSuggestionChips(inputId), 100);
  }
};

// Setup input listener for label suggestions sync
window.setupLabelInputListener = function(inputId) {
  const input = document.getElementById(inputId);
  if (!input || input._labelListenerAttached) return;
  
  input.addEventListener('input', function() {
    window.syncLabelSuggestionChips(inputId);
  });
  
  input._labelListenerAttached = true;
};
// ========== END LABEL RECOMMENDATION SYSTEM ==========

map.on("singleclick", function (event) {
  const coord = event.coordinate;
  // document.getElementById('latitude').value = coord[1];
  // document.getElementById('longitude').value = coord[0];

  // Activate provision-tab when user clicks on map to place circle
  try {
    // Remove active class from all tabs
    document.querySelectorAll('.nav-link').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.remove('show', 'active');
    });
    
    // Activate provision-tab
    const provisionTab = document.getElementById('provision-tab');
    const provisionPane = document.getElementById('provision');
    
    if (provisionTab && provisionPane) {
      provisionTab.classList.add('active');
      provisionPane.classList.add('show', 'active');
      
      // Trigger Bootstrap tab shown event if needed
      if (typeof $ !== 'undefined' && $.fn.tab) {
        $(provisionTab).tab('show');
      }
    }
  } catch (error) {
    console.log('Failed to activate provision tab:', error);
  }

  writeLatLonInputPair(latLonInputPairIdx, coord[1], coord[0]);
  latLonInputPairIdx++;
});

// Right-click context menu for Infra control
map.on("contextmenu", function (event) {
  event.preventDefault(); // Prevent default browser context menu
  
  const coord = event.coordinate;
  const nearestInfra = findNearestInfra(coord);
  
  if (nearestInfra) {
    showInfraContextMenu(event.pixel, nearestInfra);
  } else {
    // Show general utility menu when no Infra is nearby
    Swal.fire({
      title: '🛠️ Utilities',
      html: `
        <div style="display: grid; grid-template-columns: 1fr; gap: 8px; margin-top: 10px;">
          <button onclick="showDnsManagementModal(); Swal.close();" class="btn btn-info btn-context">🌐 Global DNS Management</button>
        </div>
      `,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: '❌ Close',
      width: '400px',
      customClass: {
        popup: 'swal2-infra-context'
      }
    });
  }
});

// Mouse hover effect to show when Infra is selectable
map.on("pointermove", function (event) {
  const coord = event.coordinate;
  const nearestInfra = findNearestInfra(coord);
  const mapElement = map.getTargetElement();
  const tooltip = document.getElementById('mouseTooltip');
  
  if (nearestInfra) {
    // Change cursor to pointer when Infra is nearby
    mapElement.style.cursor = 'pointer';
    
    // Update tooltip to show Infra name and hint
    if (tooltip) {
      tooltip.innerHTML = `➕ ┃ 🕹️ ${nearestInfra.name}`;
    }
  } else {
    // Reset cursor to default crosshair
    mapElement.style.cursor = 'crosshair';
    
    // Reset tooltip to original content
    if (tooltip) {
      tooltip.innerHTML = '➕ ┃ 🕹️';
    }
  }
});

// Function to find the nearest Infra to clicked coordinates
function findNearestInfra(clickCoord) {
  let nearestInfra = null;
  let minDistance = Infinity;
  
  const clickPixel = map.getPixelFromCoordinate(clickCoord);
  
  // Search through all Infra entries in the render map
  for (const [infraId, data] of infraRenderMap) {
    if (data.geometry && data.name) {
      let infraCoord;
      
      if (data.geometry.getType() === 'Point') {
        infraCoord = data.geometry.getCoordinates();
      } else if (data.geometry.getType() === 'Polygon') {
        // Use cached interior point to match OpenLayers text rendering anchor
        infraCoord = data.anchorCoord || data.geometry.getInteriorPoint().getCoordinates();
      }
      
      if (infraCoord) {
        const infraPixel = map.getPixelFromCoordinate(infraCoord);
        
        const nameLines = splitInfraNameToLines(data.name);
        const baseScale = changeSizeByName(data.name + data.status) + 0.1;
        const baseOffsetY = 32 * changeSizeByName(data.name + data.status);
        const lineHeight = 12 * baseScale;
        
        const textCenterY = infraPixel[1] + baseOffsetY + (nameLines.length * lineHeight / 2);
        const textPixel = [infraPixel[0], textCenterY];
        
        const dx = clickPixel[0] - textPixel[0];
        const dy = clickPixel[1] - textPixel[1];
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < minDistance) {
          minDistance = distance;
          nearestInfra = {
            name: data.name,
            status: data.status,
            id: infraId,
            distance: distance
          };
        }
      }
    }
  }
  
  return (minDistance < 100) ? nearestInfra : null;
}

// Store the Infra selected via right-click context menu
let contextMenuSelectedInfra = null;

// Helper function to get the currently selected Infra ID
// Prioritizes context menu selection over dropdown selection
function getSelectedInfraId() {
  if (contextMenuSelectedInfra) {
    return contextMenuSelectedInfra;
  }
  return infraidElement ? infraidElement.value : null;
}

// Function to show Infra context menu
function showInfraContextMenu(pixel, infraInfo) {
  // Store the selected Infra for use in control actions
  contextMenuSelectedInfra = infraInfo.name;
  
  // Namespace is managed globally via configNamespace

  // Set the selected Infra in the control panel
  const infraSelect = document.getElementById('infraid');
  if (infraSelect) {
    // Check if the Infra option exists, if not, add it
    let optionExists = false;
    for (let option of infraSelect.options) {
      if (option.value === infraInfo.name) {
        optionExists = true;
        break;
      }
    }
    if (!optionExists) {
      // Add the Infra option if it doesn't exist (for failed Infras that weren't loaded to control tab)
      const newOption = document.createElement('option');
      newOption.value = infraInfo.name;
      newOption.text = infraInfo.name;
      infraSelect.add(newOption);
    }
    // Set value without triggering change event
    infraSelect.value = infraInfo.name;
  }
  
  // Show context menu using SweetAlert
  Swal.fire({
    title: `🕹️ Control Infra: ${infraInfo.name}`,
    html: `
      <div style="text-align: left; margin-bottom: 20px;">
        <p><strong>Status:</strong> ${infraInfo.status}</p>
        <p><strong>Distance:</strong> ${infraInfo.distance.toFixed(3)} units</p>
      </div>
      <div class="infra-context-grid" style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; margin-top: 15px;">

        <button class="btn btn-success btn-context btn-infra-action" data-action="control">🕹️ Control</button>
        <button onclick="statusInfra(); Swal.close();" class="btn btn-success btn-context">📊 Status</button>
        <button onclick="getAccessInfo(); Swal.close();" class="btn btn-success btn-context">🔑 Access Info</button>
        <button class="btn btn-success btn-context btn-infra-action" data-action="sshKeys">📦 SSH Keys</button>

        <button onclick="executeRemoteCmd(); Swal.close();" class="btn btn-warning btn-context">💻 Remote Cmd</button>
        <button onclick="showTaskManagementModal(); Swal.close();" class="btn btn-warning btn-context">📋 Cmd Status</button>
        <button onclick="transferFileToInfra(); Swal.close();" class="btn btn-warning btn-context">📁 File Transfer</button>
        <button class="btn btn-warning btn-context btn-infra-action" data-action="dns">🌐 Global DNS</button>
        <button onclick="setBastionNode(); Swal.close();" class="btn btn-warning btn-context">🔗 Set Bastion</button>

        <button class="btn btn-info btn-context btn-infra-action" data-action="nlb">⚖️ NLB</button>
        <button onclick="updateFirewallRules(); Swal.close();" class="btn btn-info btn-context">🔥 Firewall</button>
        <button onclick="showSnapshotManagementModal(); Swal.close();" class="btn btn-info btn-context">📸 Snapshots</button>
        <button class="btn btn-info btn-context btn-infra-action" data-action="scaleOut">⬆️ Scale Out</button>

        <button class="btn btn-primary btn-context btn-infra-action" data-action="copyConfig">📋 Copy Config</button>
        <button class="btn btn-primary btn-context btn-infra-action" data-action="saveTemplate">📄 Save Template</button>
        <button class="btn btn-danger btn-context btn-infra-action" data-action="delete">🗑️ Delete Infra</button>

      </div>
    `,
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '❌ Close',
    width: '850px',
    customClass: {
      popup: 'swal2-infra-context'
    },
    didOpen: (popup) => {
      const infraName = infraInfo.name;
      popup.querySelectorAll('.btn-infra-action').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          // Functions that open their own Swal (no explicit close needed)
          if (action === 'control') { showActionsMenu(); return; }
          if (action === 'nlb') { manageNLB(); return; }
          if (action === 'delete') { executeAction('delete'); return; }
          if (action === 'sshKeys') { downloadAllSshKeys(); return; }
          // Functions that don't open Swal — close context menu after
          if (action === 'scaleOut') scaleOutInfraFromContext(infraName);
          else if (action === 'copyConfig') copyInfraConfig(infraName);
          else if (action === 'saveTemplate') saveInfraAsTemplate(infraName);
          else if (action === 'dns') showDnsManagementModal(infraName);
          Swal.close();
        });
      });
      // Auto-span Delete Infra button to fill remaining columns in last row
      const grid = popup.querySelector('.infra-context-grid');
      if (grid) {
        const cols = 4;
        const total = grid.children.length;
        const span = cols - ((total - 1) % cols);
        if (span > 1) grid.lastElementChild.style.gridColumn = 'span ' + span;
      }
    },
    willClose: () => {
      // Clear context menu selection when popup closes
      // This allows normal dropdown selection to work again
      setTimeout(() => {
        contextMenuSelectedInfra = null;
      }, 100);
    }
  });
}

// Initialize an object to keep track of the active spinner tasks
let spinnerStack = {};
// A counter to generate unique IDs for spinner tasks
let currentSpinnerId = 0;

// Function to create a unique spinner task ID based on the function name
function generateSpinnerId(functionName) {
  currentSpinnerId++; // Increment the ID
  return "[" + currentSpinnerId + "] " + functionName; // Return the unique task ID
}

// Function to add a new task to the spinner stack and update the spinner's visibility
function addSpinnerTask(functionName) {
  const taskId = generateSpinnerId(functionName); // Create a unique task ID
  spinnerStack[taskId] = true; // Add the task to the stack
  updateSpinnerVisibility(); // Update the spinner display
  return taskId; // Return the task ID for later reference
}

// Function to remove a task from the spinner stack by its ID and update the spinner's visibility
function removeSpinnerTask(taskId) {
  if (spinnerStack[taskId]) {
    delete spinnerStack[taskId]; // Remove the task from the stack
    updateSpinnerVisibility(); // Update the spinner display
  }
}

// Function to update the spinner's visibility based on the active tasks in the stack
function updateSpinnerVisibility() {
  const spinnerContainer = document.getElementById("spinner-container"); // Get the spinner container element
  const spinnerText = document.getElementById("spinner-text"); // Get the spinner text element

  // Check if there are any tasks remaining in the stack
  const tasksRemaining = Object.keys(spinnerStack).length > 0;

  if (tasksRemaining) {
    spinnerContainer.style.display = "flex"; // If there are tasks, display the spinner
    // Update the spinner text to show all active task names
    spinnerText.textContent = Object.keys(spinnerStack).join(",  ");
  } else {
    spinnerContainer.style.display = "none"; // If no tasks, hide the spinner
  }
}

// Display Icon for Cloud locations
// npm i -s csv-parser
const http = require("http");
const csv = require("csv-parser");

const csvPath =
  "https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/assets/cloudlocation.csv";
var cloudLocation = [];
var cspPointsCircle = [];
var geoCspPointsCircle = new Array();
var geoResourceLocation = {
  sshKey: [],
  sg: [],
  k8s: [],
  vnet: [],
  vpn: []
};

var cspPoints = {};
var geoCspPoints = {};

function displayCSPListOn() {
  if (cspListDisplayEnabled.checked) {
    cloudLocation = [];
    http.get(csvPath, (response) => {
      response
        .pipe(csv())
        .on("data", (chunk) => cloudLocation.push(chunk))
        .on("end", () => {
          debugLog.resource('Loaded cloud location data:', cloudLocation.length, 'regions');

          debugLog.mapOp(
            "[Complete] Display Known Cloud Regions: " +
            cloudLocation.length
          );

          cloudLocation.forEach((location) => {
            const { CloudType, Longitude, Latitude } = location;
            const cloudTypeLower = CloudType.toLowerCase();
            if (!cspPoints[cloudTypeLower]) {
              cspPoints[cloudTypeLower] = [];
            }
            if (!geoCspPoints[cloudTypeLower]) {
              geoCspPoints[cloudTypeLower] = [];
            }

            cspPoints[cloudTypeLower].push([
              parseFloat(Longitude),
              parseFloat(Latitude),
            ]);
          });

          Object.keys(cspPoints).forEach((csp) => {
            if (cspPoints[csp].length > 0) {
              geoCspPoints[csp][0] = new MultiPoint(cspPoints[csp]);
            }
          });
        });
    });
  } else {
    Object.keys(cspPoints).forEach((csp) => {
      cspPoints[csp] = [];
      geoCspPoints[csp] = [];
    });
  }
}
window.displayCSPListOn = displayCSPListOn;

function endpointChanged() {
  //getInfra();
  var iframe = document.getElementById('iframe');
  var iframe2 = document.getElementById('iframe2');

  iframe.src = "http://" + configHostname + ":1324/swagger.html";
  iframe2.src = "http://" + configHostname + ":1024/spider/adminweb";
}
window.endpointChanged = endpointChanged;


var alpha = 0.3;
var cororList = [
  [153, 255, 51, alpha],
  [210, 210, 10, alpha],
  [0, 176, 244, alpha],
  [200, 10, 10, alpha],
  [0, 162, 194, alpha],
  [38, 63, 143, alpha],
  [58, 58, 58, alpha],
  [81, 45, 23, alpha],
  [225, 136, 65, alpha],
  [106, 34, 134, alpha],
  [255, 162, 191, alpha],
  [239, 45, 53, alpha],
  [255, 255, 255, alpha],
  [154, 135, 199, alpha],
];

alpha = 0.6;
var cororLineList = [
  [0, 255, 0, alpha],
  [210, 210, 10, alpha],
  [0, 176, 244, alpha],
  [200, 10, 10, alpha],
  [0, 162, 194, alpha],
  [38, 63, 143, alpha],
  [58, 58, 58, alpha],
  [81, 45, 23, alpha],
  [225, 136, 65, alpha],
  [106, 34, 134, alpha],
  [255, 162, 191, alpha],
  [239, 45, 53, alpha],
  [255, 255, 255, alpha],
  [154, 135, 199, alpha],
];

var polygonFeature = new Feature(
  new Polygon([
    [
      [10, -3],
      [-5, 2],
      [-1, 1],
    ],
  ])
);

function createStyle(src) {
  return new Style({
    image: new Icon({
      anchor: [0.5, 0.5],
      crossOrigin: "anonymous",
      src: src,
      imgSize: [50, 50],
      scale: 0.1,
    }),
  });
}

// temporary point
var pnt = new Point([-68, -50]);

addIconToMap("img/icon-vm.png", pnt, "001");
var iconStyleNode = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/icon-vm.png",
    opacity: 1.0,
    scale: 0.7,
  }),
});
addIconToMap("img/icon-k8s.png", pnt, "001");
var iconStyleK8s = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/icon-k8s.png",
    opacity: 1.0,
    scale: 0.7,
  }),
});


addIconToMap("img/icon-nlb.png", pnt, "001");
var iconStyleNlb = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/icon-nlb.png",
    opacity: 1.0,
    scale: 0.8,
  }),
});
addIconToMap("img/icon-vpn.png", pnt, "001");
var iconStyleVPN = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/icon-vpn.png",
    opacity: 1.0,
    scale: 0.8,
  }),
});

addIconToMap("img/icon-vnet.png", pnt, "001");
var iconStyleVnet = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/icon-vnet.png",
    opacity: 1.0,
    scale: 0.8,
  }),
});
addIconToMap("img/icon-sg.png", pnt, "001");
var iconStyleSG = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/icon-sg.png",
    opacity: 1.0,
    scale: 0.8,
  }),
});
addIconToMap("img/icon-key.png", pnt, "001");
var iconStyleKey = new Style({
  image: new Icon({
    crossOrigin: "anonymous",
    src: "img/icon-key.png",
    opacity: 1.0,
    scale: 0.8,
  }),
});

addIconToMap("img/circle.png", pnt, "001");
// Pin emoji style for Infra configuration points
var iconStyleCircle = new Style({
  text: new Text({
    text: '📍',
    font: '32px Arial', 
    fill: new Fill({
      color: '#ff4444'
    }),
    stroke: new Stroke({
      color: '#ffffff',
      width: 4
    }),
    offsetY: -16, 
    scale: 1.0   
  })
});

// CSP location icon styles
const cspIconImg = {
  azure: new URL("img/csp-azure.png", import.meta.url).href,
  aws: new URL("img/csp-aws.png", import.meta.url).href,
  gcp: new URL("img/csp-gcp.png", import.meta.url).href,
  alibaba: new URL("img/csp-alibaba.png", import.meta.url).href,
  ibm: new URL("img/csp-ibm.png", import.meta.url).href,
  tencent: new URL("img/csp-tencent.png", import.meta.url).href,
  ncp: new URL("img/csp-ncp.png", import.meta.url).href,
  kt: new URL("img/csp-kt.png", import.meta.url).href,
  nhn: new URL("img/csp-nhn.png", import.meta.url).href,
  openstack: new URL("img/csp-openstack.png", import.meta.url).href,

  // Add more CSP icons here
};

// Generic CSP icon mode toggle (false = branded icons, true = colored cloud icons)
var useGenericCspIcons = false;
window.useGenericCspIcons = useGenericCspIcons;

// Per-CSP distinct colors for generic cloud icon mode
const cspGenericColors = {
  azure: '#0078D4',
  aws: '#FF9900',
  gcp: '#4285F4',
  alibaba: '#FF6A00',
  ibm: '#054ADA',
  tencent: '#00C2FF',
  ncp: '#2DB400',
  kt: '#E52528',
  nhn: '#1A6DFF',
  openstack: '#ED1944',
};
// Fallback color for unknown CSPs
const CSP_GENERIC_FALLBACK_COLOR = '#888888';

// Draw a cloud shape onto a Canvas and return a pixel-ready HTMLCanvasElement.
// Using Canvas 2D avoids async image loading issues with vectorContext.setStyle().
function createCloudCanvas(fillColor) {
  const W = 44, H = 32;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Cloud shape: 5 overlapping circles
  const circles = [
    { x: 14, y: 20, r: 8 },   // left
    { x: 22, y: 16, r: 10 },  // center-top
    { x: 30, y: 19, r: 7 },   // right
    { x: 18, y: 22, r: 7 },   // bottom-left
    { x: 26, y: 22, r: 7 },   // bottom-right
  ];

  // White outline pass
  ctx.fillStyle = '#ffffff';
  circles.forEach(c => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r + 2, 0, Math.PI * 2);
    ctx.fill();
  });

  // Colored fill pass
  ctx.fillStyle = fillColor;
  circles.forEach(c => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  });

  return canvas;
}

// Create a generic colored cloud style for a CSP using a pre-rendered Canvas.
// Canvas-based icons are synchronously available to vectorContext.setStyle().
function createGenericCloudStyle(csp) {
  const color = cspGenericColors[csp] || CSP_GENERIC_FALLBACK_COLOR;
  return new Style({
    image: new Icon({
      img: createCloudCanvas(color),
      scale: 0.72,
    }),
  });
}

// Cache for generic cloud styles (background CSP map points)
const cspGenericStyles = {};
function getGenericCloudStyle(csp) {
  if (!cspGenericStyles[csp]) {
    cspGenericStyles[csp] = createGenericCloudStyle(csp);
  }
  return cspGenericStyles[csp];
}

// Cache for Node overlay generic cloud styles keyed by "csp:scale"
// Separate from cspGenericStyles because scale varies per Node
const nodeGenericCloudStyleCache = {};
function getNodeGenericCloudStyle(csp, scale) {
  const key = `${csp}:${scale}`;
  if (!nodeGenericCloudStyleCache[key]) {
    const platform = resolveCloudPlatform(csp);
    const color = cspGenericColors[platform] || cspGenericColors[csp] || CSP_GENERIC_FALLBACK_COLOR;
    nodeGenericCloudStyleCache[key] = new Style({
      image: new Icon({
        img: createCloudCanvas(color),
        scale: scale,
        anchor: [0.5, 0.75],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
      }),
    });
  }
  return nodeGenericCloudStyleCache[key];
}

// Get the appropriate CSP style based on current icon mode
function getCspStyle(csp) {
  if (useGenericCspIcons) {
    return getGenericCloudStyle(csp);
  }
  // Branded mode: prefer exact CSP match, then fall back via platform, then generic style
  let style = cspIconStyles[csp];
  if (!style) {
    const platform = resolveCloudPlatform(csp);
    if (platform && cspIconStyles[platform]) {
      style = cspIconStyles[platform];
    }
  }
  // Final fallback to generic icon to avoid returning undefined
  if (!style) {
    style = getGenericCloudStyle(csp);
  }
  return style;
}

// cspIconStyles
const cspIconStyles = {};

function createIconStyle(imageSrc) {
  return new Style({
    image: new Icon({
      crossOrigin: "anonymous",
      src: imageSrc,
      opacity: 1.0,
      scale: 1.0,
    }),
  });
}

// addIconToMap
Object.keys(cspIconImg).forEach((csp) => {
  cspIconStyles[csp] = createIconStyle(cspIconImg[csp]);
});
// Optimized addIconToMap function to prevent layer accumulation
function addIconToMap(imageSrc, point, index) {
  var vectorSource = new VectorSource({ projection: "EPSG:4326" });
  var iconFeature = new Feature(point);
  iconFeature.set("style", createStyle(imageSrc));
  iconFeature.set("index", index);
  vectorSource.addFeature(iconFeature);
  var iconLayer = new VectorLayer({
    style: function (feature) {
      return feature.get("style");
    },
    source: vectorSource,
  });
  
  // Set a unique identifier for this layer for potential cleanup
  iconLayer.set('layerType', 'iconLayer');
  iconLayer.set('layerIndex', index);
  
  map.addLayer(iconLayer);
  
  // Update performance metrics
  mapPerformanceMetrics.layerCount++;
  mapPerformanceMetrics.featureCount++;
  
  // Use debounced render to improve performance
  if (window.mapRenderTimeout) {
    clearTimeout(window.mapRenderTimeout);
  }
  window.mapRenderTimeout = setTimeout(() => {
    map.render();
    mapPerformanceMetrics.renderCount++;
  }, 10);
}
Object.keys(cspIconImg).forEach((csp, index) => {
  const iconIndex = index.toString().padStart(3, "0");
  addIconToMap(cspIconImg[csp], pnt, iconIndex);
});

// Known cloud platform names (used for platform-based fallback resolution)
const knownPlatforms = Object.keys(cspIconImg);

/**
 * Resolve a CSP name to its base cloud platform.
 * e.g., "openstack-new01" → "openstack", "aws" → "aws"
 * If the provider starts with a known platform name followed by '-',
 * the base platform is returned. Otherwise, the lowercased original name is returned.
 */
function resolveCloudPlatform(providerName) {
  if (!providerName) return '';
  const lower = providerName.toLowerCase();
  // Exact match first
  if (knownPlatforms.includes(lower)) return lower;
  // Prefix match: e.g., "openstack-new01" starts with "openstack-"
  for (const platform of knownPlatforms) {
    if (lower.startsWith(platform + '-')) return platform;
  }
  return lower;
}

// Provider Icon Mapping for Node visualization (using existing cspIconImg)
function getProviderIcon(providerName) {
  if (useGenericCspIcons) return null; // signal to use generic style instead
  const provider = providerName?.toLowerCase();
  const platform = resolveCloudPlatform(provider);
  const iconPath = cspIconImg[provider] || cspIconImg[platform] || "img/circle.png"; // fallback icon
  return iconPath;
}


// Helper function to convert hex color to RGB array [r, g, b]
function hexToRgb(hex) {
  // Remove # if present
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substr(0, 2), 16);
  const g = parseInt(cleanHex.substr(2, 2), 16);
  const b = parseInt(cleanHex.substr(4, 2), 16);
  return [r, g, b];
}

// Helper function to calculate luminance and determine contrast color
function getContrastColor(hexColor) {
  // Remove # if present and handle alpha values
  const cleanHex = hexColor.replace('#', '').replace(/ff$/i, '');
  
  // Convert hex to RGB
  const r = parseInt(cleanHex.substr(0, 2), 16);
  const g = parseInt(cleanHex.substr(2, 2), 16);
  const b = parseInt(cleanHex.substr(4, 2), 16);
  
  // Calculate relative luminance (W3C formula)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return black for bright colors, white for dark colors
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

// Unified Node/Infra Status Color Mapping with improved visibility and contrasting borders
function getNodeStatusColor(status) {
  // Handle both exact status and status that includes keywords (for backward compatibility)
  const statusStr = status?.toString().toLowerCase() || '';
  
  let fillColor;
  
  // Running states - Green shades (healthy/active)
  if (status === "Running" || statusStr.includes("running")) {
    fillColor = "#10b981"; // emerald-500 - bright green for active/healthy state
  }
  // Creating/Starting states - Blue shades (in progress)
  else if (status === "Creating" || statusStr.includes("creating")) {
    fillColor = "#3b82f6"; // blue-500 - bright blue for creation progress
  }
  // Registering state - Teal (registering existing CSP Node))
  else if (status === "Registering" || statusStr.includes("registering")) {
    fillColor = "#14b8a6"; // teal-500 - teal for registration progress
  }
  else if (status === "Resuming" || statusStr.includes("resuming")) {
    fillColor = "#06b6d4"; // cyan-500 - cyan for resuming
  }
  // Preparing states - Orange shades (preparation phase)
  else if (status === "Preparing" || statusStr.includes("Preparing")) {
    fillColor = "#f97316"; // orange-500 - orange for preparing state
  }
  else if (status === "Prepared" || statusStr.includes("Prepared")) {
    fillColor = "#ea580c"; // orange-600 - darker orange for prepared state
  }
  // Empty state - Gray (Infra exists but has no Nodes)
  else if (status === "Empty" || statusStr.includes("Empty")) {
    fillColor = "#9ca3af"; // gray-400 - gray for empty Infra (no Nodes)
  }
  // Suspended/Paused states - Yellow/Orange shades (paused but recoverable)
  else if (status === "Suspended" || statusStr.includes("suspended")) {
    fillColor = "#f59e0b"; // amber-500 - amber for suspended/paused state
  }
  else if (status === "Suspending" || statusStr.includes("suspending")) {
    fillColor = "#d97706"; // amber-600 - darker amber for suspending process
  }
  // Rebooting state - Purple (special operation)
  else if (status === "Rebooting" || statusStr.includes("rebooting")) {
    fillColor = "#8b5cf6"; // violet-500 - purple for reboot operation
  }
  // Terminating states - Red shades (destructive operations)
  else if (status === "Terminating" || statusStr.includes("terminating")) {
    fillColor = "#ef4444"; // red-500 - bright red for terminating
  }
  else if (status === "Terminated" || statusStr.includes("terminated")) {
    fillColor = "#dc2626"; // red-600 - darker red for terminated
  }
  // Failed/Error states - Dark red (critical issues)
  else if (status === "Failed" || statusStr.includes("failed")) {
    fillColor = "#b91c1c"; // red-700 - dark red for failed state
  }
  // Undefined/Unknown states - Gray (neutral/unknown)
  else if (status === "Undefined" || statusStr.includes("undefined")) {
    fillColor = "#6b7280"; // gray-500 - medium gray for undefined
  }
  // Default fallback
  else {
    fillColor = "#9ca3af"; // gray-400 - light gray for unknown states
  }
  
  return {
    fill: fillColor,
    stroke: getContrastColor(fillColor)
  };
}

// Legacy function for Infra status - returns only fill color for backward compatibility
function changeColorStatus(status) {
  const colorObj = getNodeStatusColor(status);
  return typeof colorObj === 'object' ? colorObj.fill : colorObj;
}

// K8s Cluster Status Color Mapping
function getK8sStatusColor(status) {
  const statusStr = status?.toString().toLowerCase() || '';
  
  let fillColor;
  
  // Active/Running states - Green (healthy)
  if (status === "Active" || statusStr.includes("active") || 
      status === "Running" || statusStr.includes("running")) {
    fillColor = "#10b981"; // emerald-500
  }
  // Creating/Provisioning states - Blue (in progress)
  else if (status === "Creating" || statusStr.includes("creating") ||
           status === "Provisioning" || statusStr.includes("provisioning")) {
    fillColor = "#3b82f6"; // blue-500
  }
  // Updating/Upgrading states - Orange (maintenance)
  else if (status === "Updating" || statusStr.includes("updating") ||
           status === "Upgrading" || statusStr.includes("upgrading")) {
    fillColor = "#f97316"; // orange-500
  }
  // Error/Failed states - Red (critical)
  else if (status === "Error" || statusStr.includes("error") ||
           status === "Failed" || statusStr.includes("failed")) {
    fillColor = "#ef4444"; // red-500
  }
  // Deleting/Terminating states - Dark red (destructive)
  else if (status === "Deleting" || statusStr.includes("deleting") ||
           status === "Terminating" || statusStr.includes("terminating")) {
    fillColor = "#dc2626"; // red-600
  }
  // Suspended/Stopped states - Yellow (paused)
  else if (status === "Suspended" || statusStr.includes("suspended") ||
           status === "Stopped" || statusStr.includes("stopped")) {
    fillColor = "#f59e0b"; // amber-500
  }
  // Unknown/Default states - Gray
  else {
    fillColor = "#6b7280"; // gray-500
  }
  
  return {
    fill: fillColor,
    stroke: getContrastColor(fillColor)
  };
}

// K8s Cluster Status Color Mapping
function getK8sStatusColor(status) {
  const statusStr = status?.toString().toLowerCase() || '';
  
  let fillColor;
  
  // Active/Running states - Green
  if (status === "Active" || statusStr.includes("active") || 
      status === "Running" || statusStr.includes("running")) {
    fillColor = "#10b981"; // emerald-500 - bright green for active
  }
  // Creating states - Blue
  else if (status === "Creating" || statusStr.includes("creating") ||
           status === "Provisioning" || statusStr.includes("provisioning")) {
    fillColor = "#3b82f6"; // blue-500 - bright blue for creation
  }
  // Updating states - Orange
  else if (status === "Updating" || statusStr.includes("updating") ||
           status === "Upgrading" || statusStr.includes("upgrading")) {
    fillColor = "#f97316"; // orange-500 - orange for updating
  }
  // Error/Failed states - Red
  else if (status === "Error" || statusStr.includes("error") ||
           status === "Failed" || statusStr.includes("failed")) {
    fillColor = "#dc2626"; // red-600 - red for errors
  }
  // Deleting states - Dark red
  else if (status === "Deleting" || statusStr.includes("deleting") ||
           status === "Terminating" || statusStr.includes("terminating")) {
    fillColor = "#b91c1c"; // red-700 - dark red for deletion
  }
  // Suspended/Stopped states - Yellow
  else if (status === "Suspended" || statusStr.includes("suspended") ||
           status === "Stopped" || statusStr.includes("stopped")) {
    fillColor = "#f59e0b"; // amber-500 - amber for suspended
  }
  // Unknown/Default states - Gray
  else {
    fillColor = "#6b7280"; // gray-500 - gray for unknown
  }
  
  return {
    fill: fillColor,
    stroke: getContrastColor(fillColor)
  };
}

// Helper function to truncate Infra name with ellipsis
function truncateInfraName(name, maxLength = 25) {
  if (!name) return '';
  if (name.length <= maxLength) return name;
  return name.substring(0, maxLength) + '..';
}

// Helper function to split Infra name into multiple lines for better display
function splitInfraNameToLines(name, maxLineLength = 12) {
  if (!name) return [''];
  
  // If the name is short enough, return as single line
  if (name.length <= maxLineLength) {
    return [name];
  }
  
  // Split by common separators first
  const separators = ['-', '_', '.', ' '];
  let parts = [name];
  
  for (const sep of separators) {
    if (name.includes(sep)) {
      parts = name.split(sep);
      break;
    }
  }
  
  // If no separators found or parts are still too long, split by length
  if (parts.length === 1 || parts.some(part => part.length > maxLineLength)) {
    const lines = [];
    let currentLine = '';
    
    for (let i = 0; i < name.length; i++) {
      if (currentLine.length >= maxLineLength && (name[i] === '-' || name[i] === '_' || name[i] === '.' || name[i] === ' ')) {
        lines.push(currentLine);
        currentLine = '';
      } else if (currentLine.length >= maxLineLength * 1.5) {
        lines.push(currentLine);
        currentLine = '';
      }
      currentLine += name[i];
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines.slice(0, 3); // Limit to 3 lines maximum
  }
  
  // Combine parts intelligently to create 2-3 lines
  const lines = [];
  let currentLine = '';
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const separator = i < parts.length - 1 ? (name.includes('-') ? '-' : name.includes('_') ? '_' : '.') : '';
    
    if (currentLine.length + part.length + separator.length <= maxLineLength || currentLine === '') {
      currentLine += part + separator;
    } else {
      if (currentLine) {
        lines.push(currentLine.replace(/[-_.]$/, '')); // Remove trailing separator
        currentLine = part + separator;
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine.replace(/[-_.]$/, '')); // Remove trailing separator
  }
  
  return lines.slice(0, 3); // Limit to 3 lines maximum
}

// Generate random string for resource naming
function generateRandomString() {
  return Math.random().toString(36).substr(2, 5);
}

// Infra name word pool — familiar words across animals, fruits, flowers, nature, snacks, fantasy, gems, space
const _infraNameWordPool = [
  // 🐾 Animals
  'lion','tiger','eagle','wolf','bear','fox','panda','hawk','dolphin','penguin',
  'rabbit','shark','whale','parrot','dragon',
  // 🍎 Fruits
  'apple','banana','orange','grape','mango','lemon','peach','cherry','melon','coconut',
  'kiwi','lime','plum','pear','strawberry',
  // 🌸 Flowers
  'rose','lily','daisy','tulip','poppy','violet','orchid','lavender','jasmine','sunflower',
  // 🌍 Nature
  'rainbow','storm','thunder','wind','fire','ice','snow','river','ocean','island',
  'forest','mountain','volcano','desert','glacier',
  // 🍪 Snacks & Drinks
  'cookie','candy','waffle','donut','muffin','brownie','caramel','honey','latte','cocoa',
  // 🎮 Fantasy
  'wizard','knight','ninja','pirate','viking','samurai','hunter','ranger','shadow','blaze',
  // 💎 Gems
  'ruby','sapphire','emerald','diamond','pearl','jade','amber','topaz','opal','crystal',
  // 🚀 Space
  'sun','moon','star','mars','venus','saturn','jupiter','comet','meteor','galaxy',
  'nebula','aurora','eclipse','rocket','orbit',
];

// Returns an Infra-friendly name like "mc-panda", preferring words not recently used.
// Usage history is stored in localStorage so it persists across sessions.
function generateInfraName() {
  const STORAGE_KEY = 'infraNameUsedWords';
  const used = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

  const unused = _infraNameWordPool.filter(w => !used.includes(w));
  const pool = unused.length > 0 ? unused : _infraNameWordPool; // reset when all used
  const word = pool[Math.floor(Math.random() * pool.length)];

  // Record usage (keep last 100 entries max)
  const updated = [...used.filter(w => w !== word), word].slice(-100);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

  return word;
}

// Helper function to split K8s cluster name into multiple lines for better display
function splitK8sNameToLines(name, maxLineLength = 18) {
  if (!name) return [''];
  
  // If the name is short enough, return as single line
  if (name.length <= maxLineLength) {
    return [name];
  }
  
  // Split by common separators first
  const separators = ['-', '_', '.', ' '];
  let parts = [name];
  
  for (const sep of separators) {
    if (name.includes(sep)) {
      parts = name.split(sep);
      break;
    }
  }
  
  // If no separators found or parts are still too long, split by length
  if (parts.length === 1 || parts.some(part => part.length > maxLineLength)) {
    const lines = [];
    let currentLine = '';
    
    for (let i = 0; i < name.length; i++) {
      if (currentLine.length >= maxLineLength && (name[i] === '-' || name[i] === '_' || name[i] === '.' || name[i] === ' ')) {
        lines.push(currentLine);
        currentLine = '';
      } else if (currentLine.length >= maxLineLength * 1.5) {
        lines.push(currentLine);
        currentLine = '';
      }
      currentLine += name[i];
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines.slice(0, 3); // Allow up to 3 lines for longer K8s cluster names
  }
  
  // Combine parts intelligently to create lines
  const lines = [];
  let currentLine = '';
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const testLine = currentLine ? currentLine + '-' + part : part;
    
    if (testLine.length <= maxLineLength || currentLine === '') {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = part;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines.slice(0, 3); // Allow up to 3 lines for longer K8s cluster names
}

function changeSizeStatus(status) {
  if (status.includes("-df")) {
    return 0.4;
  } else if (status.includes("-ws")) {
    return 0.4;
  } else if (status.includes("NLB")) {
    return 1.5;
  } else if (status.includes("Failed")) {
    return 2.2; // Make Failed Nodes more visible with medium-large size
  } else if (status.includes("Partial")) {
    return 2.4;
  } else if (status.includes("Running")) {
    return 2.4;
  } else if (status.includes("Suspending")) {
    return 2.4;
  } else if (status.includes("Suspended")) {
    return 2.4;
  } else if (status.includes("Creating")) {
    return 2.4;
  } else if (status.includes("Resuming")) {
    return 2.4;
  } else if (status.includes("Terminated")) {
    return 2.4;
  } else if (status.includes("Terminating")) {
    return 2.4;
  } else {
    return 2.4;
  }
}

// Create Node icon style with status badge and provider icon
function createNodeStyleWithStatusBadge(nodeStatus, providerName = null, baseScale = 1.0, nodeCoords = null, commandStatus = "None") {
  const statusColors = getNodeStatusColor(nodeStatus);
  
  const styles = [
    // Main Node icon (center)
    new Style({
      image: new Icon({
        crossOrigin: "anonymous",
        src: "img/icon-vm.png",
        opacity: 1.0,
        scale: baseScale * 0.3,
        anchor: [0.5, 0.5], // Center anchor
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
      }),
    }),
    // Status badge (bottom-right using displacement)
    new Style({
      image: new CircleStyle({
        radius: 4,
        fill: new Fill({
          color: statusColors.fill,
        }),
        stroke: new Stroke({
          color: statusColors.stroke,
          width: 1.5, // Slightly thicker border for better visibility
        }),
        displacement: [12, -13], // Move right and down (negative Y for down)
      }),
    })
  ];

  // Add command status icon if there are active commands
  if (commandStatus === "Queued" || commandStatus === "Handling") {
    // Create gear icon using text symbol
    const gearSymbol = commandStatus === "Handling" ? "⚡" : "⏳"; // Same gear symbol
    const rotation = commandStatus === "Handling" ? (Date.now() / 100) % (2 * Math.PI) : 0; // Rotate for Handling
    
    styles.push(
      new Style({
        text: new Text({
          text: gearSymbol,
          font: commandStatus === "Queued" ? '16px sans-serif' : '12px sans-serif', // Larger for Queued
          fill: new Fill({
            color: commandStatus === "Handling" ? '#FF6B35' : '#FFB84D', // Orange for Handling, Yellow-orange for Queued
          }),
          stroke: new Stroke({
            color: '#333',
            width: 0.5,
          }),
          offsetX: 8, // Reduced radius - smaller circular motion
          offsetY: -2, // Adjusted Y offset proportionally
          rotation: rotation, // Animate rotation for Handling
        }),
      })
    );
  }

  // Add provider icon if provider information is available (center-top using anchor)
  if (providerName && providerName !== 'unknown') {
    const providerIconSrc = getProviderIcon(providerName);
    if (providerIconSrc) {
      // Branded image icon mode
      styles.push(
        new Style({
          image: new Icon({
            crossOrigin: "anonymous",
            src: providerIconSrc,
            opacity: 0.9,
            scale: baseScale * 0.3,
            anchor: [0.5, 0.75], 
            anchorXUnits: 'fraction',
            anchorYUnits: 'fraction',
          }),
        })
      );
    }
    // Generic colored cloud icon mode — no overlay icon
  }

  return styles;
}

// Create individual Node point with offset for status badge
function createNodePointWithOffset(coordinates, offsetX = 0.008, offsetY = 0.008) {
  return new Point([coordinates[0] + offsetX, coordinates[1] + offsetY]);
}

function changeSizeByName(status) {
  if (status.includes("-best")) {
    return 3.5;
  } else if (status.includes("-df")) {
    return 0.4;
  } else if (status.includes("-ws")) {
    return 0.4;
  } else if (status.includes("NLB")) {
    return 1.5;
  } else {
    return 2.5;
  }
}

/**
 * Compute inter-Infra offset for Nodes at shared locations.
 * When multiple Infras have Nodes at the same region, each Infra gets a directional
 * offset so their Node icons don't fully overlap.
 * @param {number} infraIndex - This Infra's index at the shared location (0-based)
 * @param {number} totalInfras - Total Infras sharing this location
 * @returns {{ox: number, oy: number}} offset in coordinate units
 */
function getInfraLocationOffset(infraIndex, totalInfras) {
  if (totalInfras <= 1 || infraIndex === 0) return { ox: 0, oy: 0 };
  // Place Infras on a ring around the base location
  const ringRadius = 1.5; // coordinate-space radius (scaled by zoom later)
  const angleStep = 2 * Math.PI / totalInfras;
  const startAngle = 3 * Math.PI / 2; // base angle; first offset (index=1) lands near top
  const angle = startAngle + angleStep * infraIndex;
  return {
    ox: ringRadius * Math.cos(angle),
    oy: ringRadius * Math.sin(angle) * 0.78 // compress Y for map projection
  };
}

function returnAdjustmentPoint(index, totalNodes) {
  // Initialize coordinates
  let ax = 0.0;
  let ay = 0.0;

  // First Node (index 0) is placed at center
  if (index === 0) {
    ax = 0;
    ay = 0;
  } else {
    // Circle radius
    const radius = 0.75;

    // Calculate angle step (divide 360° by total Nodes))
    const angleStep = 2 * Math.PI / totalNodes;

    // Start at 12 o'clock position
    const startAngle = 3 * Math.PI / 2;

    // Calculate angle for current Node
    const angle = startAngle + (angleStep * index);

    // Convert polar coordinates to Cartesian
    ax = radius * Math.cos(angle);
    ay = radius * Math.sin(angle);
  }

  // Add small random offset to prevent exact overlapping
  ax = ax + (Math.random() * 0.01);
  ay = ay + (Math.random() * 0.01);

  // Compress y-axis for better map projection appearance
  ay = ay * 0.78;

  return { ax, ay };
}

var n = 400;
var omegaTheta = 600000; // Rotation period in ms
var R = 7;
var r = 2;
var p = 2;

var coordinates = [];
coordinates.push([-180, -90]);

var coordinatesFromX = [];
coordinatesFromX.push([0]);
var coordinatesFromY = [];
coordinatesFromY.push([0]);

var coordinatesToX = [];
coordinatesToX.push([1]);
var coordinatesToY = [];
coordinatesToY.push([1]);

function makeTria(ip1, ip2, ip3) {
  changePoints(ip1, ip2);
  changePoints(ip2, ip3);
  changePoints(ip3, ip1);
  // makeTria is legacy/unused — kept for reference
}

// Build Node dot geometry data for an Infra entry in infraRenderMap
function makePolyDot(infraEntry, nodePoints, nodeStatuses = [], nodeProviders = [], nodeCommandStatuses = []) {
  var resourcePoints = [];
  for (i = 0; i < nodePoints.length; i++) {
    resourcePoints.push(nodePoints[i]);
  }
  infraEntry.geometryPoints = {
    geometry: new MultiPoint(resourcePoints),
    nodePoints: nodePoints,
    nodeStatuses: nodeStatuses,
    nodeProviders: nodeProviders,
    nodeCommandStatuses: nodeCommandStatuses
  };
}

// Build polygon geometry for an Infra entry in infraRenderMap
function makePolyArray(infraEntry, nodePoints) {
  var resourcePoints = [];
  for (i = 0; i < nodePoints.length; i++) {
    resourcePoints.push(nodePoints[i]);
  }
  resourcePoints.push(nodePoints[0]);
  infraEntry.geometry = new Polygon([resourcePoints]);
  infraEntry.geo = new Polygon([resourcePoints]);
  // Cache interior point for fast lookup in findNearestInfra (avoids recomputing on every pointermove)
  const ip = infraEntry.geometry.getInteriorPoint().getCoordinates();
  infraEntry.anchorCoord = [ip[0], ip[1]];
}

function cross(a, b, o) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

// Build a visible polygon ring for a cluster even when it has only 1-2 nodes.
function buildClusterPolygonRing(clusterPoints, zoomLevel, radius) {
  if (!clusterPoints || clusterPoints.length === 0) {
    return null;
  }

  const safeZoom = Math.max(zoomLevel || 1, 1);
  const delta = (2.5 / safeZoom) * radius;
  const circleSegments = 32;

  // 1-node cluster: draw a circle centered on the point.
  if (clusterPoints.length === 1) {
    const [cx, cy] = clusterPoints[0];
    const r = delta;
    const ring = [];
    for (let i = 0; i < circleSegments; i++) {
      const angle = (2 * Math.PI * i) / circleSegments;
      ring.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    ring.push(ring[0]);
    return ring;
  }

  // 2-node cluster: draw a circle enclosing both nodes.
  if (clusterPoints.length === 2) {
    const [p1, p2] = clusterPoints;
    const cx = (p1[0] + p2[0]) / 2;
    const cy = (p1[1] + p2[1]) / 2;
    const halfDist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 2;
    const r = halfDist + delta * 0.5;
    const ring = [];
    for (let i = 0; i < circleSegments; i++) {
      const angle = (2 * Math.PI * i) / circleSegments;
      ring.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
    }
    ring.push(ring[0]);
    return ring;
  }

  // 3+ nodes: standard convex hull.
  const hull = convexHull(clusterPoints.map((p) => [p[0], p[1]]));
  if (!hull || hull.length < 3) {
    return null;
  }

  return [...hull, hull[0]];
}

/**
 * @param points An array of [X, Y] coordinates
 */
function convexHull(points) {
  points.sort(function (a, b) {
    return a[0] == b[0] ? a[1] - b[1] : a[0] - b[0];
  });

  var lower = [];
  for (var i = 0; i < points.length; i++) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], points[i]) <= 0
    ) {
      lower.pop();
    }
    lower.push(points[i]);
  }

  var upper = [];
  for (var i = points.length - 1; i >= 0; i--) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], points[i]) <= 0
    ) {
      upper.pop();
    }
    upper.push(points[i]);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function changePoints(ipFrom, ipTo) {
  var lon = 360 * Math.random() - 180;
  var lat = 180 * Math.random() - 90;

  var lon1 = 360 * Math.random() - 180;
  var lat1 = 180 * Math.random() - 90;

  // Debug: uncomment if needed for troubleshooting
  // console.log(ipFrom);
  // console.log(ipTo);

  coordinates.push(ipFrom);
  coordinates.push(ipTo);

  var i, j;

  var xFrom = ipFrom[0];
  var yFrom = ipFrom[1];
  var xTo = ipTo[0];
  var yTo = ipTo[1];
  for (j = 1; j < n; ++j) {
    var goX = xFrom + (j * (xTo - xFrom)) / n;
    var goY = ((yTo - yFrom) / (xTo - xFrom)) * (goX - xFrom) + yFrom;
  }
}

var refreshInterval = 5;
// setTimeout(() => getInfra(), refreshInterval*1000);
//setTimeout(() => console.log(getConnection()), refreshInterval*1000);

function infoAlert(message) {
  Swal.fire({
    // position: 'top-end',
    icon: "info",
    title: message,
    showConfirmButton: false,
    timer: 2500,
  });
}

function errorAlert(message) {
  Swal.fire({
    // position: 'bottom-start',
    icon: "error",
    title: message,
    showConfirmButton: true,
    //timer: 2000
  });
}

function successAlert(message) {
  Swal.fire({
    // position: 'top-end',
    icon: "success",
    title: message,
    showConfirmButton: false,
    timer: 2500,
  });
}

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

// ========== JSON OUTPUT TOOLBAR FUNCTIONS ==========

// Copy JSON to clipboard
window.copyJsonToClipboard = function() {
  const jsonString = window._currentJsonString;
  if (!jsonString) {
    console.error('No JSON data available to copy');
    return;
  }
  
  navigator.clipboard.writeText(jsonString).then(() => {
    // Show brief success feedback
    const btn = document.getElementById('copyJsonBtn');
    if (btn) {
      const originalText = btn.innerHTML;
      btn.innerHTML = '✓ Copied!';
      btn.style.background = '#155724';
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.style.background = '#28a745';
      }, 1500);
    }
  }).catch(err => {
    console.error('Failed to copy:', err);
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = jsonString;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  });
};

// Download JSON as file
window.downloadJsonFile = function() {
  const jsonString = window._currentJsonString;
  if (!jsonString) {
    console.error('No JSON data available to download');
    return;
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `response-${timestamp}.json`;
  
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  // Show brief success feedback
  const btn = document.getElementById('downloadJsonBtn');
  if (btn) {
    const originalText = btn.innerHTML;
    btn.innerHTML = '✓ Saved!';
    btn.style.background = '#155724';
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.style.background = '#6c757d';
    }, 1500);
  }
};

// ========== INTEGRATED BASE64 PANEL FUNCTIONS ==========

// Toggle Base64 Panel visibility
window.toggleBase64Panel = function() {
  const panel = document.getElementById('base64Panel');
  if (!panel) return;
  
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
    // Reduce JSON output height when panel is open
    const jsonOutput = document.getElementById('json-output');
    if (jsonOutput) {
      jsonOutput.style.maxHeight = '250px';
    }
  } else {
    panel.style.display = 'none';
    // Restore JSON output height when panel is closed
    const jsonOutput = document.getElementById('json-output');
    if (jsonOutput) {
      jsonOutput.style.maxHeight = '350px';
    }
  }
};

// Auto-find Base64 strings in JSON (for integrated panel)
window.autoFindBase64InJson = function() {
  const jsonData = window._currentJsonOutput;
  if (!jsonData) return;
  
  const chipsContainer = document.getElementById('base64FoundChips');
  const input = document.getElementById('base64Input');
  const output = document.getElementById('base64Output');
  
  if (!chipsContainer || !input || !output) return;
  
  // Use shared helper functions
  const stringValues = window.extractStringValuesFromJson(jsonData);
  const likelyBase64 = window.collectBase64FromStringValues(stringValues);
  
  if (likelyBase64.length === 0) {
    output.value = 'No Base64 strings found in JSON.';
    chipsContainer.style.display = 'none';
    return;
  }
  
  // Decode all and store
  window._base64FoundResults = likelyBase64.map((b64, idx) => {
    try {
      const decoded = atob(b64);
      const decodedUtf8 = decodeURIComponent(escape(decoded));
      return { original: b64, decoded: decodedUtf8 };
    } catch (e) {
      return { original: b64, decoded: '[Decode Error]' };
    }
  });
  
  // Build chips
  let chipsHtml = '<span style="color: #aaa; font-size: 10px; margin-right: 6px;">Found:</span>';
  likelyBase64.slice(0, 8).forEach((b64, idx) => {
    const preview = b64.substring(0, 12) + '...';
    chipsHtml += `
      <button type="button" onclick="selectBase64Chip(${idx})" 
        style="display: inline-block; padding: 2px 6px; margin: 2px; font-size: 10px; 
               background: #3d5a80; color: #fff; border: none; border-radius: 3px; cursor: pointer;"
        title="${b64.substring(0, 50)}">
        #${idx + 1} ${preview}
      </button>
    `;
  });
  if (likelyBase64.length > 8) {
    chipsHtml += `<span style="color: #aaa; font-size: 10px;">+${likelyBase64.length - 8} more</span>`;
  }
  
  chipsContainer.innerHTML = chipsHtml;
  chipsContainer.style.display = 'block';
  
  // Show all decoded results
  output.value = window._base64FoundResults.map((r, i) => `=== #${i + 1} ===\n${r.decoded}`).join('\n\n');
};

// Select a Base64 chip
window.selectBase64Chip = function(index) {
  const results = window._base64FoundResults;
  if (!results || !results[index]) return;
  
  const input = document.getElementById('base64Input');
  const output = document.getElementById('base64Output');
  
  if (input) input.value = results[index].original;
  if (output) output.value = results[index].decoded;
};

// Decode Base64 inline
window.decodeBase64Inline = function() {
  const input = document.getElementById('base64Input');
  const output = document.getElementById('base64Output');
  if (!input || !output) return;
  
  const base64Text = input.value.trim();
  if (!base64Text) {
    output.value = 'Error: No input provided';
    return;
  }
  
  try {
    const decoded = atob(base64Text);
    try {
      output.value = decodeURIComponent(escape(decoded));
    } catch (e) {
      output.value = decoded;
    }
  } catch (err) {
    output.value = `Error: Invalid Base64 string\n${err.message}`;
  }
};

// Encode to Base64 inline
window.encodeBase64Inline = function() {
  const input = document.getElementById('base64Input');
  const output = document.getElementById('base64Output');
  if (!input || !output) return;
  
  const text = input.value;
  if (!text) {
    output.value = 'Error: No input provided';
    return;
  }
  
  try {
    const encoded = btoa(unescape(encodeURIComponent(text)));
    output.value = encoded;
  } catch (err) {
    output.value = `Error: Failed to encode\n${err.message}`;
  }
};

// Clear Base64 inline fields
window.clearBase64Inline = function() {
  const input = document.getElementById('base64Input');
  const output = document.getElementById('base64Output');
  const chipsContainer = document.getElementById('base64FoundChips');
  
  if (input) input.value = '';
  if (output) output.value = '';
  if (chipsContainer) chipsContainer.style.display = 'none';
};

// Copy Base64 result
window.copyBase64Result = function() {
  const output = document.getElementById('base64Output');
  if (!output || !output.value) return;
  
  navigator.clipboard.writeText(output.value).then(() => {
    const originalBg = output.style.background;
    output.style.background = '#1a4d1a';
    setTimeout(() => { output.style.background = originalBg || '#1e1e30'; }, 500);
  }).catch(err => {
    output.select();
    document.execCommand('copy');
  });
};

// Save Base64 result
window.saveBase64Result = function() {
  const output = document.getElementById('base64Output');
  if (!output || !output.value) return;
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `decoded-${timestamp}.txt`;
  
  const blob = new Blob([output.value], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// ========== END INTEGRATED BASE64 PANEL FUNCTIONS ==========

// Open Base64 Decoder window (legacy - kept for backward compatibility)
window.openBase64DecoderWindow = function() {
  Swal.fire({
    title: '🔓 Base64 Decoder',
    width: 700,
    html: `
      <div style="text-align: left;">
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: bold; margin-bottom: 4px; color: #333;">Input (Base64 encoded text)</label>
          <textarea id="base64Input" rows="5" 
            style="width: 100%; font-family: monospace; font-size: 12px; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; resize: vertical;"
            placeholder="Paste Base64 encoded text here..."></textarea>
        </div>
        <div style="margin-bottom: 12px; display: flex; gap: 8px;">
          <button type="button" onclick="decodeBase64Input()" 
            style="padding: 6px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            🔓 Decode
          </button>
          <button type="button" onclick="encodeBase64Input()" 
            style="padding: 6px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            🔒 Encode
          </button>
          <button type="button" onclick="clearBase64Fields()" 
            style="padding: 6px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            🗑️ Clear
          </button>
          <button type="button" onclick="findAndDecodeBase64InJson()" 
            style="padding: 6px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;"
            title="Find and decode all Base64 strings in the original JSON">
            🔍 Auto-find in JSON
          </button>
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: bold; margin-bottom: 4px; color: #333;">Output (Decoded text)</label>
          <textarea id="base64Output" rows="8" readonly
            style="width: 100%; font-family: monospace; font-size: 12px; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; 
                   background: #f8f9fa; resize: vertical;"
            placeholder="Decoded result will appear here..."></textarea>
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" onclick="copyBase64Output()" 
            style="padding: 6px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            📋 Copy Output
          </button>
          <button type="button" onclick="downloadBase64Output()" 
            style="padding: 6px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            💾 Save Output
          </button>
        </div>
        <div id="base64FoundList" style="margin-top: 12px; display: none;">
          <label style="display: block; font-weight: bold; margin-bottom: 4px; color: #333;">Found Base64 strings in JSON:</label>
          <div id="base64FoundItems" style="max-height: 150px; overflow-y: auto; background: #f8f9fa; padding: 8px; border-radius: 4px; font-size: 11px;"></div>
        </div>
      </div>
    `,
    showCloseButton: true,
    showConfirmButton: false,
    customClass: {
      popup: 'base64-decoder-popup'
    }
  });
};

// Decode Base64 input
window.decodeBase64Input = function() {
  const input = document.getElementById('base64Input');
  const output = document.getElementById('base64Output');
  if (!input || !output) return;
  
  const base64Text = input.value.trim();
  if (!base64Text) {
    output.value = 'Error: No input provided';
    return;
  }
  
  try {
    // Try standard Base64 decode
    const decoded = atob(base64Text);
    // Try to parse as UTF-8
    try {
      output.value = decodeURIComponent(escape(decoded));
    } catch (e) {
      output.value = decoded;
    }
  } catch (err) {
    output.value = `Error: Invalid Base64 string\n${err.message}`;
  }
};

// Encode to Base64
window.encodeBase64Input = function() {
  const input = document.getElementById('base64Input');
  const output = document.getElementById('base64Output');
  if (!input || !output) return;
  
  const text = input.value;
  if (!text) {
    output.value = 'Error: No input provided';
    return;
  }
  
  try {
    // Encode to Base64 with UTF-8 support
    const encoded = btoa(unescape(encodeURIComponent(text)));
    output.value = encoded;
  } catch (err) {
    output.value = `Error: Failed to encode\n${err.message}`;
  }
};

// Clear Base64 fields
window.clearBase64Fields = function() {
  const input = document.getElementById('base64Input');
  const output = document.getElementById('base64Output');
  if (input) input.value = '';
  if (output) output.value = '';
  
  const foundList = document.getElementById('base64FoundList');
  if (foundList) foundList.style.display = 'none';
};

// Find and decode Base64 strings in JSON
window.findAndDecodeBase64InJson = function() {
  const jsonData = window._currentJsonOutput;
  if (!jsonData) {
    document.getElementById('base64Output').value = 'Error: No JSON data available';
    return;
  }
  
  const foundList = document.getElementById('base64FoundList');
  const foundItems = document.getElementById('base64FoundItems');
  const output = document.getElementById('base64Output');
  
  // Use shared helper functions
  const stringValues = window.extractStringValuesFromJson(jsonData);
  const likelyBase64 = window.collectBase64FromStringValues(stringValues);
  
  if (likelyBase64.length === 0) {
    output.value = 'No Base64 encoded strings found in the JSON response.';
    foundList.style.display = 'none';
    return;
  }
  
  // Show found Base64 strings
  foundList.style.display = 'block';
  let itemsHtml = '';
  const decodedResults = [];
  
  likelyBase64.slice(0, 10).forEach((b64, idx) => {
    try {
      const decoded = atob(b64);
      const decodedUtf8 = decodeURIComponent(escape(decoded));
      const preview = decodedUtf8.length > 100 ? decodedUtf8.substring(0, 100) + '...' : decodedUtf8;
      decodedResults.push({ original: b64, decoded: decodedUtf8 });
      
      itemsHtml += `
        <div style="margin-bottom: 8px; padding: 6px; background: white; border-radius: 4px; border: 1px solid #dee2e6;">
          <div style="color: #666; font-size: 10px; margin-bottom: 2px;">Found #${idx + 1} (${b64.length} chars)</div>
          <div style="color: #007bff; word-break: break-all; margin-bottom: 4px;">${b64.substring(0, 50)}${b64.length > 50 ? '...' : ''}</div>
          <div style="color: #28a745;"><strong>→</strong> ${window.escapeHtml ? window.escapeHtml(preview) : preview}</div>
          <button type="button" onclick="selectBase64Found(${idx})" 
            style="margin-top: 4px; padding: 2px 8px; font-size: 10px; background: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer;">
            Use this
          </button>
        </div>
      `;
    } catch (e) {
      // Skip invalid entries
    }
  });
  
  foundItems.innerHTML = itemsHtml;
  window._base64FoundResults = decodedResults;
  
  // Show first result in output
  if (decodedResults.length > 0) {
    output.value = decodedResults.map((r, i) => `=== Found #${i + 1} ===\n${r.decoded}`).join('\n\n');
  }
};

// Select a specific found Base64 result
window.selectBase64Found = function(index) {
  const results = window._base64FoundResults;
  if (!results || !results[index]) return;
  
  const input = document.getElementById('base64Input');
  const output = document.getElementById('base64Output');
  
  if (input) input.value = results[index].original;
  if (output) output.value = results[index].decoded;
};

// Copy Base64 output
window.copyBase64Output = function() {
  const output = document.getElementById('base64Output');
  if (!output || !output.value) return;
  
  navigator.clipboard.writeText(output.value).then(() => {
    // Brief feedback
    const originalBg = output.style.background;
    output.style.background = '#d4edda';
    setTimeout(() => { output.style.background = originalBg || '#f8f9fa'; }, 500);
  }).catch(err => {
    console.error('Copy failed:', err);
    output.select();
    document.execCommand('copy');
  });
};

// Download Base64 output as file
window.downloadBase64Output = function() {
  const output = document.getElementById('base64Output');
  if (!output || !output.value) return;
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `decoded-${timestamp}.txt`;
  
  const blob = new Blob([output.value], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// ========== END JSON OUTPUT TOOLBAR FUNCTIONS ==========

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
  for (const [, data] of infraRenderMap) {
    if (data.isLocationless) {
      preparingInfraCount++;
    }
  }
  defaultLat -= verticalSpacing * preparingInfraCount;
  
  var newName = infraItem.name;
  if (newName.includes("-nlb")) {
    newName = "NLB";
  }
  
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
  infraRenderMap.set(infraItem.id, infraEntry);
}

function getInfra() {
  var hostname = configHostname;
  var port = configPort;
  var username = configUsername;
  var password = configPassword;
  var namespace = configNamespace;

  // Use global refreshInterval variable instead of DOM element
  var filteredRefreshInterval = isNormalInteger(refreshInterval.toString())
    ? refreshInterval
    : 5;
  setTimeout(() => getInfra(), filteredRefreshInterval * 1000);

  // Show refresh indicator
  showMapRefreshIndicator(true);

  var zoomLevel = map.getView().getZoom() * 2.0;
  var radius = 4.0;

  if (namespace && namespace != "") {
    // get infra list and put them on the map - full details including connectionConfig
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
      timeout: 600000,
    })
      .then((res) => {
        var obj = res.data;

        // Update central data store for Dashboard
        if (obj.infra) {
          window.cloudBaristaCentralData.infraData = obj.infra;
          
          // Extract Node data from Infra data
          const allNodes = [];
          obj.infra.forEach(infra => {
            if (infra.node && Array.isArray(infra.node)) {
              infra.node.forEach(nd => {
                allNodes.push({
                  ...nd,
                  infraId: infra.id,
                  infraName: infra.name
                });
              });
            }
          });
          window.cloudBaristaCentralData.nodeData = allNodes;
          
          // Load VPN data from the Infras we just fetched (reusing Infra data)
          loadVpnDataFromInfras();
          
          // Notify Dashboard subscribers
          notifyDataSubscribers();
          
          // Update map connection status to connected
          updateMapConnectionStatus('connected');
          
          // Hide refresh indicator
          showMapRefreshIndicator(false);
        }

        // Also load K8s cluster data for dashboard
        loadK8sClusterData();

        // Rebuild infraRenderMap from fresh API data
        infraRenderMap.clear();
        infraClusterPolygons.clear();
        infraClusterNames.clear();
        infraClusterColors.clear();
        
        // Track how many Infras share each base location, so overlapping Infras get offset
        // Key: "roundedLon,roundedLat" → counter (incremented per Infra at that location)
        const locationInfraCounter = new globalThis.Map();
        // For each Infra, store its assigned index per location
        // Key: "infraId:locationKey" → infraIndexAtLocation
        const infraLocationIndex = new globalThis.Map();

        if (obj.infra != null && obj.infra.length > 0) {
          debugLog.api(`Processing ${obj.infra.length} Infras for map display`);

          // First pass: assign Infra index per shared location
          for (let item of obj.infra) {
            if (item.node == null || item.node.length === 0) continue;
            const seenLocations = new Set();
            for (const nd of item.node) {
              if (!nd.location || nd.location.longitude === undefined || nd.location.latitude === undefined) continue;
              // Round to ~0.5 degree to group nearby regions
              const locKey = Math.round(nd.location.longitude * 2) / 2 + ',' + Math.round(nd.location.latitude * 2) / 2;
              if (!seenLocations.has(locKey)) {
                seenLocations.add(locKey);
                const idx = locationInfraCounter.get(locKey) || 0;
                infraLocationIndex.set(item.id + ':' + locKey, idx);
                locationInfraCounter.set(locKey, idx + 1);
              }
            }
          }

          for (let item of obj.infra) {

            var hideFlag = false;
            for (let hideName of infraHideList) {
              if (item.id == hideName) {
                hideFlag = true;
                break;
              }
            }
            if (hideFlag) {
              continue;
            }

            // Handle Infra without Nodes (preparing, prepared, empty, failed states)
            if (item.node == null || item.node.length === 0) {
              if (item.status === "Preparing" || item.status === "Prepared" || item.status === "Failed" || item.status.includes("Empty")) {
                handleInfraWithoutNodes(item);
              }
              continue;
            }

            var vmGeo = [];

            // Build intra-Infra location groups: VMs within same ~0.5° grid get spread out
            // Key: "roundedLon,roundedLat" → array of Node indices in that cell
            const intraLocGroups = new globalThis.Map();
            for (let vi = 0; vi < item.node.length; vi++) {
              const v = item.node[vi];
              if (!v.location || v.location.longitude === undefined || v.location.latitude === undefined) continue;
              const gKey = Math.round(v.location.longitude * 2) / 2 + ',' + Math.round(v.location.latitude * 2) / 2;
              if (!intraLocGroups.has(gKey)) intraLocGroups.set(gKey, []);
              intraLocGroups.get(gKey).push(vi);
            }
            // Build per-Node lookup: nodeIndex → { indexInGroup, groupSize }
            const vmGroupInfo = new globalThis.Map();
            for (const [, indices] of intraLocGroups) {
              for (let gi = 0; gi < indices.length; gi++) {
                vmGroupInfo.set(indices[gi], { indexInGroup: gi, groupSize: indices.length });
              }
            }

            // Build per-Node render point lookup to keep cluster geometry aligned with node dots.
            const nodeRenderPointById = new globalThis.Map();

            var validateNum = 0;
            for (j = 0; j < item.node.length; j++) {
              const nd = item.node[j];
              if (!nd.location || nd.location.longitude === undefined || nd.location.latitude === undefined) {
                console.warn(`Node ${nd.id || j}: missing location data, skipping`);
                continue;
              }

              // Compute inter-Infra offset for this Node's location
              const nodeLocKey = Math.round(nd.location.longitude * 2) / 2 + ',' + Math.round(nd.location.latitude * 2) / 2;
              const infraIdxAtLoc = infraLocationIndex.get(item.id + ':' + nodeLocKey) || 0;
              const totalInfrasAtLoc = locationInfraCounter.get(nodeLocKey) || 1;
              const infraOff = getInfraLocationOffset(infraIdxAtLoc, totalInfrasAtLoc);
              const infraOffX = (infraOff.ox / zoomLevel) * radius;
              const infraOffY = (infraOff.oy / zoomLevel) * radius;

              // Compute intra-Infra offset: spread VMs sharing the same location group
              const gInfo = vmGroupInfo.get(j);
              let intraOffX = 0, intraOffY = 0;
              if (gInfo && gInfo.groupSize > 1 && gInfo.indexInGroup > 0) {
                const adj = returnAdjustmentPoint(gInfo.indexInGroup, gInfo.groupSize);
                intraOffX = (adj.ax / zoomLevel) * radius;
                intraOffY = (adj.ay / zoomLevel) * radius;
              }

              vmGeo.push([
                nd.location.longitude * 1 + infraOffX + intraOffX,
                nd.location.latitude * 1 + infraOffY + intraOffY,
              ]);
              validateNum++;
            }
            if (item.node.length == 1 && item.node[0].location && item.node[0].location.longitude !== undefined && item.node[0].location.latitude !== undefined) {
              const singleVm = item.node[0];
              const sLocKey = Math.round(singleVm.location.longitude * 2) / 2 + ',' + Math.round(singleVm.location.latitude * 2) / 2;
              const sIdx = infraLocationIndex.get(item.id + ':' + sLocKey) || 0;
              const sTotal = locationInfraCounter.get(sLocKey) || 1;
              const sOff = getInfraLocationOffset(sIdx, sTotal);
              const sOffX = (sOff.ox / zoomLevel) * radius;
              const sOffY = (sOff.oy / zoomLevel) * radius;
              vmGeo.pop();
              vmGeo.push([
                singleVm.location.longitude * 1 + sOffX,
                singleVm.location.latitude * 1 + sOffY,
              ]);
              vmGeo.push([
                singleVm.location.longitude * 1 + sOffX + Math.random() * 0.001,
                singleVm.location.latitude * 1 + sOffY + Math.random() * 0.001,
              ]);
              vmGeo.push([
                singleVm.location.longitude * 1 + sOffX + Math.random() * 0.001,
                singleVm.location.latitude * 1 + sOffY + Math.random() * 0.001,
              ]);
            }
            if (validateNum == item.node.length) {
              var nodeStatuses = [];
              var nodeProviders = [];
              var nodeCommandStatuses = [];
              var nodePoints = [];
              
              for (let nodeIndex = 0; nodeIndex < item.node.length; nodeIndex++) {
                const nd = item.node[nodeIndex];
                
                if (nodeIndex === 0) {
                  debugLog.node(`Node ${nd.id || 'unknown'} structure:`, nd);
                }
                
                nodeStatuses.push(nd.status || "Undefined");
                
                let commandStatus = "None";
                if (nd.commandStatus) {
                  const queuedCmd = nd.commandStatus.find(cmd => cmd.status === "Queued");
                  const handlingCmd = nd.commandStatus.find(cmd => cmd.status === "Handling");
                  
                  if (handlingCmd) {
                    commandStatus = "Handling";
                  } else if (queuedCmd) {
                    commandStatus = "Queued";
                  }
                }
                nodeCommandStatuses.push(commandStatus);
                
                if (nodeIndex === 0 && nd.commandStatus) {
                  debugLog.node(`Node ${nd.id || 'unknown'} commandStatus:`, nd.commandStatus);
                  debugLog.node(`Node ${nd.id} command status:`, commandStatus);
                }
                
                let provider = "unknown";
                
                if (nodeIndex === 0) {
                  debugLog.node(`Node ${nd.id}: connectionName =`, nd.connectionName);
                  debugLog.node(`Node ${nd.id}: connectionConfig =`, nd.connectionConfig);
                }
                
                if (nd.connectionConfig && nd.connectionConfig.providerName) {
                  provider = nd.connectionConfig.providerName;
                  if (nodeIndex === 0) debugLog.node(`Node ${nd.id}: found provider in connectionConfig = ${provider}`);
                } else if (nd.connectionName) {
                  provider = nd.connectionName.split('-')[0];
                  if (nodeIndex === 0) debugLog.node(`Node ${nd.id}: extracted provider from connectionName = ${provider}`);
                } else {
                  if (nodeIndex === 0) {
                    debugLog.node(`Node ${nd.id}: no provider info found, using unknown`);
                    debugLog.node(`Node ${nd.id}: available properties:`, Object.keys(nd));
                  }
                }
                
                nodeProviders.push(provider);

                // Compute inter-Infra offset for this Node's location
                const nodeLocKey2 = Math.round(nd.location.longitude * 2) / 2 + ',' + Math.round(nd.location.latitude * 2) / 2;
                const infraIdx2 = infraLocationIndex.get(item.id + ':' + nodeLocKey2) || 0;
                const totalInfras2 = locationInfraCounter.get(nodeLocKey2) || 1;
                const infraOff2 = getInfraLocationOffset(infraIdx2, totalInfras2);
                const infraOffX2 = (infraOff2.ox / zoomLevel) * radius;
                const infraOffY2 = (infraOff2.oy / zoomLevel) * radius;
                
                // Compute intra-Infra offset: spread VMs sharing the same location group
                const gInfo2 = vmGroupInfo.get(nodeIndex);
                let intraOffX2 = 0, intraOffY2 = 0;
                if (gInfo2 && gInfo2.groupSize > 1 && gInfo2.indexInGroup > 0) {
                  const adj2 = returnAdjustmentPoint(gInfo2.indexInGroup, gInfo2.groupSize);
                  intraOffX2 = (adj2.ax / zoomLevel) * radius;
                  intraOffY2 = (adj2.ay / zoomLevel) * radius;
                }
                nodePoints.push([
                  nd.location.longitude * 1 + infraOffX2 + intraOffX2,
                  nd.location.latitude * 1 + infraOffY2 + intraOffY2,
                ]);

                if (nd.id) {
                  nodeRenderPointById.set(nd.id, nodePoints[nodePoints.length - 1]);
                }
              }

              var newName = item.name;
              if (newName.includes("-nlb")) {
                newName = "NLB";
              }

              // Create Infra render entry
              var infraEntry = {
                id: item.id,
                name: newName,
                status: item.status,
                targetAction: (item.targetAction && item.targetAction !== "None" && item.targetAction !== "") 
                  ? item.targetAction : null,
                geometry: null,
                geometryPoints: null,
                geo: null,
                isLocationless: false
              };

              // Build Node dots and polygon geometry into the entry
              makePolyDot(infraEntry, vmGeo, nodeStatuses, nodeProviders, nodeCommandStatuses);
              // convexHull sorts in-place; pass a copy so vmGeo (stored in
              // geometryPoints.nodePoints by reference) keeps the original
              // item.node order aligned with nodeProviders/nodeStatuses.
              const hullGeo = convexHull([...vmGeo]);
              makePolyArray(infraEntry, hullGeo);

              // Process cluster polygons (if cluster data exists)
              if (item.cluster && Array.isArray(item.cluster) && item.cluster.length > 0) {
                debugLog.mapOp(`[ClusterPolygon] Processing ${item.cluster.length} clusters for infra: ${item.id}`);
                
                const clusterPolygons = [];
                const clusterNames = [];
                const clusterColorMap = new globalThis.Map();
                
                // Generate distinct colors for clusters
                const baseColors = ['#FF5733', '#33FF57', '#3357FF', '#FF33F7', '#F7FF33', '#33FFF7', '#FF8C33', '#8C33FF'];
                
                item.cluster.forEach((cluster, idx) => {
                  const clusterColor = baseColors[idx % baseColors.length];
                  clusterColorMap.set(cluster.id, clusterColor);
                  clusterNames.push(cluster.id);
                  
                  // Collect node coordinates for this cluster
                  const clusterNodeGeo = [];
                  
                  if (cluster.nodeIds && Array.isArray(cluster.nodeIds)) {
                    cluster.nodeIds.forEach(nodeId => {
                      const renderPoint = nodeRenderPointById.get(nodeId);
                      if (renderPoint && renderPoint.length === 2) {
                        clusterNodeGeo.push([renderPoint[0], renderPoint[1]]);
                      }
                    });
                  }
                  
                  // Generate visible polygon for this cluster (supports 1/2/3+ nodes)
                  if (clusterNodeGeo.length > 0) {
                    const clusterRing = buildClusterPolygonRing(clusterNodeGeo, zoomLevel, radius);
                    if (clusterRing && clusterRing.length >= 4) {
                      const clusterPolygon = new Polygon([clusterRing]);
                      clusterPolygon.set('fill', true);
                      clusterPolygon.set('fillColor', clusterColor);
                      clusterPolygon.set('fillOpacity', 0.18);
                      clusterPolygon.set('stroke', true);
                      clusterPolygon.set('strokeColor', clusterColor);
                      clusterPolygon.set('strokeWidth', 2.5);
                      clusterPolygon.set('strokeOpacity', 0.95);
                      clusterPolygon.set('clusterNodeCount', clusterNodeGeo.length);
                      clusterPolygon.set('name', `Cluster: ${cluster.id}`);
                      
                      clusterPolygons.push(clusterPolygon);
                      debugLog.mapOp(`[ClusterPolygon] Created polygon for cluster ${cluster.id}: ${clusterNodeGeo.length} nodes`);
                    }
                  }
                });
                
                // Store cluster polygons and names for rendering
                if (clusterPolygons.length > 0) {
                  infraClusterPolygons.set(item.id, clusterPolygons);
                  infraClusterNames.set(item.id, clusterNames);
                  infraClusterColors.set(item.id, clusterColorMap);
                  debugLog.mapOp(`[ClusterPolygon] Stored ${clusterPolygons.length} cluster polygons for infra: ${item.id}`);
                }
              }

              infraRenderMap.set(item.id, infraEntry);
            }
          }
        } else {
          // No Infra data — map is already cleared above
          console.log("No Infra data found, clearing map objects");
          map.render();
        }
      })
      .catch(function (error) {
        console.log("Infra API error:", error);
        // Don't update geometries on API error to preserve current state
        
        // Update map connection status to disconnected
        updateMapConnectionStatus('disconnected');
        
        // Hide refresh indicator
        showMapRefreshIndicator(false);
      });

    // get vnet list and put them on the map
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/vNet`;
    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
      timeout: 600000,
    }).then((res) => {
      var obj = res.data;
      debugLog.api('vNet API response:', obj);
      
      // Update central data store
      if (obj.vNet) {
        window.cloudBaristaCentralData.vNet = obj.vNet;
        window.cloudBaristaCentralData.resourceData.vNet = obj.vNet;
        debugLog.resource('vNet data stored in central store:', obj.vNet.length, 'items');
      }
      
      if (obj.vNet != null && obj.vNet.length > 0) {
        var resourceLocation = [];
        for (let item of obj.vNet) {
          resourceLocation.push([
            item.connectionConfig.regionDetail.location.longitude * 1,
            item.connectionConfig.regionDetail.location.latitude * 1 - 0.05,
          ]);
        }
        geoResourceLocation.vnet[0] = new MultiPoint([resourceLocation]);
      } else {
        // Clear vnet icons when list is empty
        geoResourceLocation.vnet = [];
      }
      
      // Notify Dashboard of data update
      notifyDataSubscribers();
    })
      .catch(function (error) {
        console.log("vNet API error:", error);
        // Don't update icons on API error to preserve current state
      });

    // get securityGroup list and put them on the map
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/securityGroup`;
    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
      timeout: 600000,
    }).then((res) => {
      var obj = res.data;
      debugLog.api('Security Group API response:', obj);
      
      // Update central data store
      if (obj.securityGroup) {
        window.cloudBaristaCentralData.securityGroup = obj.securityGroup;
        window.cloudBaristaCentralData.resourceData.securityGroup = obj.securityGroup;
        debugLog.resource('Security Group data stored in central store:', obj.securityGroup.length, 'items');
      }
      
      if (obj.securityGroup != null && obj.securityGroup.length > 0) {
        var resourceLocation = [];
        for (let item of obj.securityGroup) {
          resourceLocation.push([
            item.connectionConfig.regionDetail.location.longitude * 1 - 0.05,
            item.connectionConfig.regionDetail.location.latitude * 1,
          ]);
        }
        geoResourceLocation.sg[0] = new MultiPoint([resourceLocation]);
      } else {
        // Clear securityGroup icons when list is empty
        geoResourceLocation.sg = [];
      }
      
      // Notify Dashboard of data update
      notifyDataSubscribers();
    })
      .catch(function (error) {
        console.log("securityGroup API error:", error);
        // Don't update icons on API error to preserve current state
      });


    // get sshKey list and put them on the map
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/sshKey`;
    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
      timeout: 600000,
    }).then((res) => {
      var obj = res.data;
      debugLog.api('SSH Key API response:', obj);
      
      // Update central data store
      if (obj.sshKey) {
        window.cloudBaristaCentralData.sshKey = obj.sshKey;
        window.cloudBaristaCentralData.resourceData.sshKey = obj.sshKey;
        debugLog.resource('SSH Key data stored in central store:', obj.sshKey.length, 'items');
      }
      
      if (obj.sshKey != null && obj.sshKey.length > 0) {
        var resourceLocation = [];
        for (let item of obj.sshKey) {
          resourceLocation.push([
            item.connectionConfig.regionDetail.location.longitude * 1 + 0.05,
            item.connectionConfig.regionDetail.location.latitude * 1,
          ]);
        }
        geoResourceLocation.sshKey[0] = new MultiPoint([resourceLocation]);
      } else {
        // Clear sshKey icons when list is empty
        geoResourceLocation.sshKey = [];
      }
      
      // Notify Dashboard of data update
      notifyDataSubscribers();
    })
      .catch(function (error) {
        console.log("sshKey API error:", error);
        // Don't update icons on API error to preserve current state
      });

    // Load VPN data from all Infras (reuses Infra data from central store)
    loadVpnDataFromInfras();

    // Get custom images
    var customImageUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/customImage`;
    axios({
      method: "get",
      url: customImageUrl,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
      timeout: 600000,
    }).then((res) => {
      var obj = res.data;
      debugLog.api('Custom Image API response:', obj);
      
      // Handle different possible response structures
      let customImages = [];
      if (obj && obj.customImage && Array.isArray(obj.customImage)) {
        customImages = obj.customImage;
      } else if (obj && Array.isArray(obj)) {
        customImages = obj;
      }
      
      window.cloudBaristaCentralData.customImage = customImages;
      debugLog.resource('Custom Image data stored:', customImages.length, 'items');
    }).catch(function (error) {
      console.log("Custom Image API error:", error);
      // Set empty array on error to prevent undefined issues
      window.cloudBaristaCentralData.customImage = [];
    });

    // Get data disks
    var dataDiskUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/dataDisk`;
    axios({
      method: "get",
      url: dataDiskUrl,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
      timeout: 600000,
    }).then((res) => {
      var obj = res.data;
      debugLog.api('Data Disk API response:', obj);
      
      // Handle different possible response structures
      let dataDisks = [];
      if (obj && obj.dataDisk && Array.isArray(obj.dataDisk)) {
        dataDisks = obj.dataDisk;
      } else if (obj && obj.dataDiskInfo && Array.isArray(obj.dataDiskInfo)) {
        dataDisks = obj.dataDiskInfo;
      } else if (obj && Array.isArray(obj)) {
        dataDisks = obj;
      }
      
      window.cloudBaristaCentralData.dataDisk = dataDisks;
      debugLog.resource('Data Disk data stored:', dataDisks.length, 'items');
    }).catch(function (error) {
      console.log("Data Disk API error:", error);
      // Set empty array on error to prevent undefined issues
      window.cloudBaristaCentralData.dataDisk = [];
    });

    // TODO: Object Storage API not yet available in CB-Tumblebug
    // Get object storage - DISABLED until API is implemented
    // var objectStorageUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/objectStorage`;
    // axios({
    //   method: "get",
    //   url: objectStorageUrl,
    //   auth: {
    //     username: `${username}`,
    //     password: `${password}`,
    //   },
    //   timeout: 10000,
    // }).then((res) => {
    //   var obj = res.data;
    //   if (obj && obj.objectStorages) {
    //     window.cloudBaristaCentralData.objectStorage = obj.objectStorages;
    //   }
    // }).catch(function (error) {
    //   console.log("Object Storage API error:", error);
    // });

    // TODO: SQL Database API not yet available in CB-Tumblebug
    // Get SQL databases - DISABLED until API is implemented
    // var sqlDbUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/sqlDb`;
    // axios({
    //   method: "get",
    //   url: sqlDbUrl,
    //   auth: {
    //     username: `${username}`,
    //     password: `${password}`,
    //   },
    //   timeout: 10000,
    // }).then((res) => {
    //   var obj = res.data;
    //   if (obj && obj.sqlDbs) {
    //     window.cloudBaristaCentralData.sqlDb = obj.sqlDbs;
    //   }
    // }).catch(function (error) {
    //   console.log("SQL DB API error:", error);
    // });
  }
}

// Connection status constants
const CONNECTION_STATUS = {
  CHECKING: 'checking',
  CONNECTION_FAILED: 'connection_failed',
  NOT_INITIALIZED: 'not_initialized',
  SUCCESS: 'success'
};

// Check CB-Tumblebug connection with automatic retry
// Shows a persistent popup with status updates and allows endpoint configuration
function checkConnectionWithRetry() {
  const maxRetries = 60;      // Maximum retry attempts (60 * 3s = ~3 minutes)
  const retryInterval = 3000; // Retry every 3 seconds
  let retryCount = 0;
  let intervalId = null;
  let isPaused = false;
  let currentStatus = CONNECTION_STATUS.CHECKING;

  // Build the popup HTML content
  function buildPopupHtml() {
    return `
      <style>
        .connection-status-container {
          text-align: center;
          padding: 10px;
        }
        .status-icon {
          font-size: 48px;
          margin-bottom: 10px;
        }
        .status-message {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 5px;
        }
        .status-detail {
          font-size: 13px;
          color: #666;
          margin-bottom: 15px;
        }
        .retry-info {
          font-size: 12px;
          color: #888;
          padding: 8px;
          background: #f5f5f5;
          border-radius: 4px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .retry-info-left {
          display: flex;
          gap: 15px;
        }
        .pause-btn {
          background: none;
          border: 1px solid #ccc;
          border-radius: 4px;
          padding: 2px 8px;
          cursor: pointer;
          font-size: 11px;
        }
        .pause-btn:hover {
          background: #eee;
        }
        .config-section {
          margin-top: 15px;
          text-align: left;
        }
        .config-section summary {
          cursor: pointer;
          padding: 8px;
          background: #f0f0f0;
          border-radius: 4px;
          font-weight: bold;
        }
        .config-section summary:hover {
          background: #e5e5e5;
        }
        .config-form {
          padding: 15px;
          background: #fafafa;
          border: 1px solid #eee;
          border-radius: 0 0 4px 4px;
        }
        .config-input-group {
          margin-bottom: 10px;
        }
        .config-input-group label {
          display: block;
          font-weight: bold;
          margin-bottom: 3px;
          font-size: 13px;
        }
        .config-input-group input {
          width: 100%;
          padding: 6px 10px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 14px;
        }
        .apply-config-btn {
          width: 100%;
          padding: 8px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          margin-top: 10px;
        }
        .apply-config-btn:hover {
          background: #0056b3;
        }
        .spinner {
          display: inline-block;
          width: 20px;
          height: 20px;
          border: 3px solid #f3f3f3;
          border-top: 3px solid #3498db;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          vertical-align: middle;
          margin-right: 8px;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>

      <div class="connection-status-container">
        <div id="status-icon" class="status-icon">⏳</div>
        <div id="status-message" class="status-message">Checking connection...</div>
        <div id="status-detail" class="status-detail">Connecting to CB-Tumblebug server</div>

        <div class="retry-info">
          <div class="retry-info-left">
            <span>Attempt: <span id="retry-count">0</span>/${maxRetries}</span>
            <span id="next-check-info">Next check: 3s</span>
          </div>
          <button id="pause-btn" class="pause-btn">⏸️ Pause</button>
        </div>
      </div>

      <details class="config-section" id="config-details">
        <summary>⚙️ API Endpoint Configuration</summary>
        <div class="config-form">
          <div class="config-input-group">
            <label for="config-hostname">Hostname:</label>
            <input type="text" id="config-hostname" value="${configHostname}">
          </div>
          <div class="config-input-group">
            <label for="config-port">Port:</label>
            <input type="text" id="config-port" value="${configPort}">
          </div>
          <div class="config-input-group">
            <label for="config-username">Username:</label>
            <input type="text" id="config-username" value="${configUsername}">
          </div>
          <div class="config-input-group">
            <label for="config-password">Password:</label>
            <input type="password" id="config-password" value="${configPassword}">
          </div>
          <div class="config-input-group">
            <label for="config-credentialHolder">Credential Holder:</label>
            <input type="text" id="config-credentialHolder" value="${window.escapeHtml(configCredentialHolder)}">
          </div>
          <button id="apply-config-btn" class="apply-config-btn">Apply & Retry Now</button>
        </div>
      </details>
    `;
  }

  // Update the popup UI based on current status
  function updateStatusUI(status, detail = '') {
    const iconEl = document.getElementById('status-icon');
    const messageEl = document.getElementById('status-message');
    const detailEl = document.getElementById('status-detail');
    const retryCountEl = document.getElementById('retry-count');

    if (retryCountEl) retryCountEl.textContent = retryCount;

    if (!iconEl || !messageEl || !detailEl) return;

    switch (status) {
      case CONNECTION_STATUS.CHECKING:
        iconEl.innerHTML = '<div class="spinner"></div>';
        messageEl.textContent = 'Checking connection...';
        detailEl.textContent = 'Connecting to CB-Tumblebug server';
        break;

      case CONNECTION_STATUS.CONNECTION_FAILED:
        iconEl.textContent = '🔴';
        messageEl.textContent = 'Cannot connect to server';
        detailEl.innerHTML = `
          Please check:<br>
          • Is CB-Tumblebug server running?<br>
          • Is the endpoint address correct?<br>
          <small style="color:#999">${detail}</small>
        `;
        break;

      case CONNECTION_STATUS.NOT_INITIALIZED:
        iconEl.textContent = '🟡';
        messageEl.textContent = 'Waiting for initialization';
        detailEl.innerHTML = `
          CB-Tumblebug server is running but initialization is not complete.<br>
          • Waiting for init.py to finish registering cloud providers...<br>
          • This may take up to 30 seconds or more.
        `;
        break;

      case CONNECTION_STATUS.SUCCESS:
        iconEl.textContent = '🟢';
        messageEl.textContent = 'Connection successful!';
        detailEl.innerHTML = `
          <div style="margin-top: 10px;">
            <span style="font-size: 36px; font-weight: bold; color: #28a745;">${detail}</span>
            <span style="font-size: 14px; color: #666;"> cloud regions loaded</span>
          </div>
          <div style="margin-top: 8px; font-size: 12px; color: #888;">
            ☁️ Ready to provision multi-cloud infrastructure
          </div>
        `;
        // Hide retry info on success
        const retryInfo = document.querySelector('.retry-info');
        if (retryInfo) retryInfo.style.display = 'none';
        break;
    }
  }

  // Perform the actual connection check
  async function checkStatus() {
    retryCount++;
    updateStatusUI(CONNECTION_STATUS.CHECKING);

    const readyzUrl = `http://${configHostname}:${configPort}/tumblebug/readyz`;
    const connConfigUrl = `http://${configHostname}:${configPort}/tumblebug/connConfig?filterVerified=true&filterRegionRepresentative=true&filterCredentialHolder=${encodeURIComponent(configCredentialHolder)}`;

    try {
      // Step 1: Check readyz status first
      const readyzResponse = await axios({
        method: 'get',
        url: readyzUrl,
        auth: {
          username: configUsername,
          password: configPassword
        },
        timeout: 10000
      });

      const readyzData = readyzResponse.data;
      console.log('[Connection Check] readyz response:', readyzData);

      // Check if server is ready
      if (!readyzData.ready) {
        currentStatus = CONNECTION_STATUS.CONNECTION_FAILED;
        updateStatusUI(CONNECTION_STATUS.CONNECTION_FAILED, 'Server not ready');
        console.log('[Connection Check] Server is not ready');
        return;
      }

      // Check if server is initialized (init.py completed)
      if (!readyzData.initialized) {
        currentStatus = CONNECTION_STATUS.NOT_INITIALIZED;
        updateStatusUI(CONNECTION_STATUS.NOT_INITIALIZED);
        console.log('[Connection Check] Server is ready but not initialized (waiting for init.py)');
        return;
      }

      // Step 2: Server is ready and initialized, now fetch connection configs
      const connResponse = await axios({
        method: 'get',
        url: connConfigUrl,
        auth: {
          username: configUsername,
          password: configPassword
        },
        timeout: 10000
      });

      const connData = connResponse.data;

      if (connData.connectionconfig && connData.connectionconfig.length > 0) {
        // Success - we have connection data
        currentStatus = CONNECTION_STATUS.SUCCESS;
        updateStatusUI(CONNECTION_STATUS.SUCCESS, connData.connectionconfig.length);

        // Stop the retry interval
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }

        // Process the connection data (use existing logic)
        processConnectionData(connData);

        // Load namespace list and Infra data now that server is ready
        updateNsList();
        getInfra();

        // Close popup after showing success message
        setTimeout(() => {
          Swal.close();
          // infoAlert removed - success message already shown in connection check popup
        }, 2000);

      } else {
        // Initialized but no connection configs - unusual state
        currentStatus = CONNECTION_STATUS.NOT_INITIALIZED;
        updateStatusUI(CONNECTION_STATUS.NOT_INITIALIZED);
        console.log('[Connection Check] Server initialized but no connection configs available');
      }

    } catch (error) {
      // Connection failed
      currentStatus = CONNECTION_STATUS.CONNECTION_FAILED;
      const errorMsg = error.code || error.message || 'Unknown error';
      updateStatusUI(CONNECTION_STATUS.CONNECTION_FAILED, errorMsg);
      console.log('[Connection Check] Failed:', error);

      // Mark hostname/port as error in main UI
      const hostnameEl = document.getElementById('hostname');
      const portEl = document.getElementById('port');
      if (hostnameEl) hostnameEl.style.color = '#FF0000';
      if (portEl) portEl.style.color = '#FF0000';
    }

    // Check if max retries reached
    if (retryCount >= maxRetries && currentStatus !== CONNECTION_STATUS.SUCCESS) {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      const nextCheckInfo = document.getElementById('next-check-info');
      if (nextCheckInfo) {
        nextCheckInfo.textContent = 'Max retries reached';
      }
      const pauseBtn = document.getElementById('pause-btn');
      if (pauseBtn) {
        pauseBtn.textContent = '🔄 Retry';
        pauseBtn.onclick = () => {
          retryCount = 0;
          isPaused = false;
          intervalId = setInterval(() => {
            if (!isPaused) checkStatus();
          }, retryInterval);
          checkStatus();
        };
      }
    }
  }

  // Process connection data and update map (extracted from getConnection)
  function processConnectionData(data) {
    console.log('[Complete] Registered Cloud Regions: ' + data.connectionconfig.length);

    // Store connection data in central store
    window.cloudBaristaCentralData.connection = data.connectionconfig;

    // Clear existing CSP points
    Object.keys(cspPoints).forEach(key => {
      cspPoints[key] = [];
    });
    Object.keys(geoCspPoints).forEach(key => {
      geoCspPoints[key] = [];
    });

    // Initialize provider checkboxes container
    var providerCheckboxContainer = document.getElementById('provider-checkboxes');
    if (providerCheckboxContainer) {
      providerCheckboxContainer.innerHTML = '';
    }

    // Setup "ALL" checkbox handler
    var allCheckbox = document.getElementById('provider-all');
    if (allCheckbox) {
      allCheckbox.checked = true;
      allCheckbox.onchange = function() {
        var providerCheckboxes = document.querySelectorAll('#provider-checkboxes input[type="checkbox"]');
        if (this.checked) {
          providerCheckboxes.forEach(cb => cb.checked = false);
        }
        updateMapBasedOnProviders();
        updateProviderDropdownText();
      };
    }

    // Process each connection config
    data.connectionconfig.forEach((config, i) => {
      const providerName = config.providerName;
      const longitude = config.regionDetail.location.longitude;
      const latitude = config.regionDetail.location.latitude;
      const briefAddr = config.regionDetail.location.display;
      const nativeRegion = config.regionDetail.regionName;

      console.log(
        '[' + i + '] ' + providerName + '(' + nativeRegion + ')' +
        '\t\t\tLocation: ' + longitude + '|' + latitude + ' (' + briefAddr + ')'
      );

      // Add to cspPoints
      if (!cspPoints[providerName]) {
        cspPoints[providerName] = [];
      }
      cspPoints[providerName].push([longitude, latitude]);

      // Add provider checkbox if not exists
      if (providerCheckboxContainer) {
        var existingCheckbox = document.getElementById('provider-' + providerName);
        if (!existingCheckbox) {
          var checkboxDiv = document.createElement('div');
          checkboxDiv.className = 'dropdown-item-text';

          var formCheckDiv = document.createElement('div');
          formCheckDiv.className = 'form-check';

          var checkbox = document.createElement('input');
          checkbox.className = 'form-check-input';
          checkbox.type = 'checkbox';
          checkbox.id = 'provider-' + providerName;
          checkbox.value = providerName;

          var label = document.createElement('label');
          label.className = 'form-check-label';
          label.setAttribute('for', 'provider-' + providerName);
          label.textContent = providerName.toUpperCase();

          formCheckDiv.appendChild(checkbox);
          formCheckDiv.appendChild(label);
          checkboxDiv.appendChild(formCheckDiv);
          providerCheckboxContainer.appendChild(checkboxDiv);

          checkbox.addEventListener('change', function() {
            var allCb = document.getElementById('provider-all');
            if (this.checked && allCb) {
              allCb.checked = false;
            }
            updateMapBasedOnProviders();
            updateProviderDropdownText();
          });
        }
      }

      // Create MultiPoint geometry
      if (!geoCspPoints[providerName]) {
        geoCspPoints[providerName] = [];
      }
      geoCspPoints[providerName][0] = new MultiPoint(cspPoints[providerName]);

      // Dynamically register icon style for unknown providers using platform fallback
      if (!cspIconStyles[providerName]) {
        const platform = resolveCloudPlatform(providerName);
        if (cspIconImg[platform]) {
          cspIconStyles[providerName] = createIconStyle(cspIconImg[platform]);
        }
      }
      // Also register generic color for dynamically discovered providers
      if (!cspGenericColors[providerName]) {
        const platform = resolveCloudPlatform(providerName);
        if (cspGenericColors[platform]) {
          cspGenericColors[providerName] = cspGenericColors[platform];
        }
      }
    });

    // Render the map with forced view update to trigger postrender event
    // Single map.render() only schedules the next render cycle but may not trigger postrender
    // Using view.changed() forces the rendering loop to activate immediately
    map.render();
    const view = map.getView();
    if (view) {
      view.changed();  // Signal view change to force postrender event
    }
    // Additional render calls with slight delay to ensure icons are displayed
    setTimeout(() => map.render(), 100);
    setTimeout(() => map.render(), 500);

    // Reset hostname/port color to normal
    const hostnameEl = document.getElementById('hostname');
    const portEl = document.getElementById('port');
    if (hostnameEl) hostnameEl.style.color = '';
    if (portEl) portEl.style.color = '';
  }

  // Setup event listeners for the popup
  function setupEventListeners() {
    // Pause/Resume button
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.onclick = () => {
        isPaused = !isPaused;
        pauseBtn.textContent = isPaused ? '▶️ Resume' : '⏸️ Pause';
        const nextCheckInfo = document.getElementById('next-check-info');
        if (nextCheckInfo) {
          nextCheckInfo.textContent = isPaused ? 'Paused' : 'Next check: 3s';
        }
      };
    }

    // Apply config button
    const applyBtn = document.getElementById('apply-config-btn');
    if (applyBtn) {
      applyBtn.onclick = () => {
        // Update config from input fields
        const newHostname = document.getElementById('config-hostname').value;
        const newPort = document.getElementById('config-port').value;
        const newUsername = document.getElementById('config-username').value;
        const newPassword = document.getElementById('config-password').value;

        if (newHostname) configHostname = newHostname;
        if (newPort) configPort = newPort;
        if (newUsername) configUsername = newUsername;
        if (newPassword) configPassword = newPassword;

        const newCredentialHolder = document.getElementById('config-credentialHolder').value;
        if (newCredentialHolder) configCredentialHolder = newCredentialHolder;

        console.log('[Config Updated] ' + configHostname + ':' + configPort + ' holder=' + configCredentialHolder);

        // Reset retry count and check immediately
        retryCount = 0;
        isPaused = false;
        const pauseBtn = document.getElementById('pause-btn');
        if (pauseBtn) pauseBtn.textContent = '⏸️ Pause';

        // Collapse the config section
        const configDetails = document.getElementById('config-details');
        if (configDetails) configDetails.removeAttribute('open');

        // Check immediately
        checkStatus();
      };
    }

    // Update countdown display
    let countdown = 3;
    setInterval(() => {
      if (!isPaused && currentStatus !== CONNECTION_STATUS.SUCCESS) {
        countdown--;
        if (countdown <= 0) countdown = 3;
        const nextCheckInfo = document.getElementById('next-check-info');
        if (nextCheckInfo && !isPaused) {
          nextCheckInfo.textContent = 'Next check: ' + countdown + 's';
        }
      }
    }, 1000);
  }

  // Show the main popup
  Swal.fire({
    title: 'CB-Tumblebug Connection Check',
    html: buildPopupHtml(),
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: 'Skip',
    allowOutsideClick: false,
    width: '480px',
    didOpen: () => {
      setupEventListeners();
      // Initial check
      checkStatus();
      // Start periodic checks
      intervalId = setInterval(() => {
        if (!isPaused && currentStatus !== CONNECTION_STATUS.SUCCESS) {
          checkStatus();
        }
      }, retryInterval);
    },
    willClose: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }
  }).then((result) => {
    if (result.dismiss === Swal.DismissReason.cancel) {
      console.log('[Connection Check] Skipped by user');
    }
  });
}
window.checkConnectionWithRetry = checkConnectionWithRetry;

// Get list of cloud connections (legacy function, kept for compatibility)
function getConnection() {
  // let timerInterval;
  // Swal.fire({
  //   title: "Show registered Cloud Regions to the Map",
  //   html: "closed in <b></b> milliseconds.",
  //   timer: 2000,
  //   timerProgressBar: true,
  //   position: "top-end",
  //   didOpen: () => {
  //     Swal.showLoading();
  //     const b = Swal.getHtmlContainer().querySelector("b");
  //     timerInterval = setInterval(() => {
  //       b.textContent = Swal.getTimerLeft();
  //     }, 100);
  //   },
  //   willClose: () => {
  //     clearInterval(timerInterval);
  //   },
  // }).then((result) => {
  //   /* Read more about handling dismissals below */
  //   if (result.dismiss === Swal.DismissReason.timer) {
  //     console.log("I was closed by the timer");
  //   }
  // });

  // Initialize provider checkboxes with "ALL" option
  var providerCheckboxContainer = document.getElementById("provider-checkboxes");
  if (providerCheckboxContainer) {
    providerCheckboxContainer.innerHTML = ''; // Clear existing checkboxes
  }

  // Handle "ALL" checkbox behavior
  var allCheckbox = document.getElementById("provider-all");
  if (allCheckbox) {
    allCheckbox.addEventListener('change', function() {
      var providerCheckboxes = document.querySelectorAll('#provider-checkboxes input[type="checkbox"]');
      if (this.checked) {
        // Uncheck all individual providers when ALL is selected
        providerCheckboxes.forEach(cb => cb.checked = false);
      }
      // Update map display and dropdown text
      updateMapBasedOnProviders();
      updateProviderDropdownText();
    });
  }

  var hostname = configHostname;
  var port = configPort;
  var username = configUsername;
  var password = configPassword;

  // Use global refreshInterval variable instead of DOM element
  var filteredRefreshInterval = isNormalInteger(refreshInterval.toString())
    ? refreshInterval
    : 5;
  //setTimeout(() => console.log(getConnection()), filteredRefreshInterval*1000);

  var url = `http://${hostname}:${port}/tumblebug/connConfig?filterVerified=true&filterRegionRepresentative=true&filterCredentialHolder=${encodeURIComponent(configCredentialHolder)}`;

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 600000,
  })
    .then((res) => {
      var obj = res.data;
      if (obj.connectionconfig != null) {
        console.log(
          "[Complete] Registered Cloud Regions: " +
          obj.connectionconfig.length
        );

        // Store connection data in central store
        window.cloudBaristaCentralData.connection = obj.connectionconfig;

        obj.connectionconfig.forEach((config, i) => {
          const providerName = config.providerName;
          const longitude = config.regionDetail.location.longitude;
          const latitude = config.regionDetail.location.latitude;
          const briefAddr = config.regionDetail.location.display;
          const nativeRegion = config.regionDetail.regionName;

          console.log(
            "[" +
            i +
            "] " +
            config.providerName +
            "(" +
            nativeRegion +
            ")" +
            "\t\t\t" +
            "Location: " +
            longitude +
            "|" +
            latitude +
            " (" +
            briefAddr +
            ")"
          );

          if (!cspPoints[providerName]) {
            cspPoints[providerName] = [];
          }

          cspPoints[providerName].push([longitude, latitude]);

          // Add the provider to the provider checkboxes if it doesn't already exist
          var providerCheckboxContainer = document.getElementById("provider-checkboxes");
          if (providerCheckboxContainer) {
            var existingCheckbox = document.getElementById(`provider-${providerName}`);
            if (!existingCheckbox) {
              var checkboxDiv = document.createElement("div");
              checkboxDiv.className = "dropdown-item-text";
              
              var formCheckDiv = document.createElement("div");
              formCheckDiv.className = "form-check";
              
              var checkbox = document.createElement("input");
              checkbox.className = "form-check-input";
              checkbox.type = "checkbox";
              checkbox.id = `provider-${providerName}`;
              checkbox.value = providerName;
              
              var label = document.createElement("label");
              label.className = "form-check-label";
              label.setAttribute("for", `provider-${providerName}`);
              label.textContent = providerName.toUpperCase();
              
              formCheckDiv.appendChild(checkbox);
              formCheckDiv.appendChild(label);
              checkboxDiv.appendChild(formCheckDiv);
              providerCheckboxContainer.appendChild(checkboxDiv);
              
              // Add event listener to uncheck "ALL" when individual provider is selected
              checkbox.addEventListener('change', function() {
                var allCheckbox = document.getElementById("provider-all");
                if (this.checked && allCheckbox) {
                  allCheckbox.checked = false;
                }
                // Update map display and dropdown text
                updateMapBasedOnProviders();
                updateProviderDropdownText();
              });
            }
          }

          if (!geoCspPoints[providerName]) {
            geoCspPoints[providerName] = [];
          }
          geoCspPoints[providerName][0] = new MultiPoint(
            cspPoints[providerName]
          );
        });

        // Render the map with forced view update to trigger postrender event
        map.render();
        const view = map.getView();
        if (view) {
          view.changed();  // Signal view change to force postrender event
        }
        // Additional render calls with slight delay to ensure icons are displayed
        setTimeout(() => map.render(), 100);
        setTimeout(() => map.render(), 500);

        infoAlert("Registered Cloud Regions: " + obj.connectionconfig.length);
      }
    })
    .catch(function (error) {
      // Legacy error handling - just log the error
      // The new checkConnectionWithRetry() handles errors with a better UI
      if (error.request) {
        document.getElementById("hostname").style.color = "#FF0000";
        document.getElementById("port").style.color = "#FF0000";
      }
      console.log('[getConnection] Error:', error);
    });
}
window.getConnection = getConnection;

// Helper function to get selected providers
function getSelectedProviders() {
  var allCheckbox = document.getElementById("provider-all");
  if (allCheckbox && allCheckbox.checked) {
    return []; // Empty array means all providers
  }
  
  var selectedProviders = [];
  var providerCheckboxes = document.querySelectorAll('#provider-checkboxes input[type="checkbox"]:checked');
  providerCheckboxes.forEach(cb => {
    selectedProviders.push(cb.value);
  });
  
  return selectedProviders;
}
window.getSelectedProviders = getSelectedProviders;

// Function to update provider dropdown button text
function updateProviderDropdownText() {
  var allCheckbox = document.getElementById("provider-all");
  var dropdownText = document.getElementById("provider-selection-text");
  
  if (!dropdownText) return;
  
  if (allCheckbox && allCheckbox.checked) {
    dropdownText.textContent = "ALL";
    return;
  }
  
  var selectedProviders = [];
  var providerCheckboxes = document.querySelectorAll('#provider-checkboxes input[type="checkbox"]:checked');
  providerCheckboxes.forEach(cb => {
    selectedProviders.push(cb.value.toUpperCase());
  });
  
  if (selectedProviders.length === 0) {
    dropdownText.textContent = "None selected";
  } else if (selectedProviders.length === 1) {
    dropdownText.textContent = selectedProviders[0];
  } else if (selectedProviders.length <= 3) {
    dropdownText.textContent = selectedProviders.join(", ");
  } else {
    dropdownText.textContent = `${selectedProviders.slice(0, 2).join(", ")} + ${selectedProviders.length - 2}`;
  }
}
window.updateProviderDropdownText = updateProviderDropdownText;

// Function to update map display based on selected providers
function updateMapBasedOnProviders() {
  var selectedProviders = getSelectedProviders();
  var allCheckbox = document.getElementById("provider-all");
  var showAll = allCheckbox && allCheckbox.checked;
  
  // If showing all or no specific providers selected, show all CSP points
  if (showAll || selectedProviders.length === 0) {
    Object.keys(geoCspPoints).forEach((csp) => {
      if (geoCspPoints[csp] && geoCspPoints[csp][0]) {
        // Show all CSP points
        var layer = map.getLayers().getArray().find(l => l.get('cspType') === csp);
        if (layer) {
          layer.setVisible(true);
        }
      }
    });
  } else {
    // Show only selected providers
    Object.keys(geoCspPoints).forEach((csp) => {
      if (geoCspPoints[csp] && geoCspPoints[csp][0]) {
        var shouldShow = selectedProviders.includes(csp);
        var layer = map.getLayers().getArray().find(l => l.get('cspType') === csp);
        if (layer) {
          layer.setVisible(shouldShow);
        }
      }
    });
  }
  
  map.render();
}
window.updateMapBasedOnProviders = updateMapBasedOnProviders;

function isNormalInteger(str) {
  var n = Math.floor(Number(str));
  return n !== Infinity && String(n) === str && n > 0;
}

var createInfraReqTmplt = {
  description: "Made via cb-mapui",
  installMonAgent: "no",
  name: "infra",
  nodeGroups: [],
};

var createInfraReqVmTmplt = {
  imageId: "ubuntu22.04",
  specId: "",
  description: "mapui",
  rootDiskType: "default",
  rootDiskSize: 0,
  nodeGroupSize: 1,
  name: "",
};

// Final Infra Creation Confirmation with options
function showFinalInfraConfirmation(createInfraReq, url, totalCost, totalNodeScale, costDetailsHtml, nodeGroupReqString, username, password) {
  Swal.fire({
    title: "Are you sure you want to create this Infra?",
    width: 750,
    html:
      "<font size=4>" +
      "<br><b><span style='color: black; font-size: larger;'>" + createInfraReq.name + " </b> (" + totalNodeScale + " node(s))" + "</span><br>" +
      "<hr>" +
      costDetailsHtml +
      "<hr>" +
      nodeGroupReqString +
      "<br><br><input type='checkbox' id='hold-checkbox'> Hold Node provisioning of the Infra" +
      "<br><input type='checkbox' id='monitoring-checkbox'> Deploy a monitoring agent" +
      "<br><input type='checkbox' id='postcommand-checkbox'> Add post-deployment commands",
    showCancelButton: true,
    confirmButtonText: "Confirm",
    scrollbarPadding: false,
    preConfirm: () => {
      return {
        monitoring: document.getElementById('monitoring-checkbox').checked,
        hold: document.getElementById('hold-checkbox').checked,
        addPostCommand: document.getElementById('postcommand-checkbox').checked
      };
    }
  }).then((result) => {
    if (result.isConfirmed) {
      createInfraReq.installMonAgent = "no";
      if (result.value.monitoring) {
        Swal.fire("Create Infra with a monitoring agent");
        createInfraReq.installMonAgent = "yes";
      }
      if (result.value.hold) {
        Swal.fire("Create Infra with hold option. It will not be deployed immediately. Use Action:Continue when you are ready.");
        url += "?option=hold";
      }

      if (result.value.addPostCommand) {
        // Show postCommand input popup
        Swal.fire({
          title: "<font size=5><b>Add post-deployment commands</b></font>",
          width: 900,
          html: `
            <div id="dynamicContainer" style="text-align: left;">
              ${generateCommandsHtml(defaultRemoteCommand)}
              ${generatePredefinedScriptsHtml(false)}
              ${generateLabelSelectorHtml(true)}
            </div>`,
          showCancelButton: true,
          confirmButtonText: "Confirm",
          didOpen: () => setupCommandsPopup(10),
          preConfirm: () => collectCommands(),
        }).then((cmdResult) => {
          if (cmdResult.isConfirmed && cmdResult.value && cmdResult.value.length > 0) {
            createInfraReq.postCommand = {
              command: cmdResult.value,
              userName: "cb-user"
            };
            proceedWithInfraCreation(createInfraReq, url, username, password);
          }
          // User cancelled the postCommand dialog or no commands were entered
        });
      } else {
        // No postCommand needed, proceed with Infra creation
        proceedWithInfraCreation(createInfraReq, url, username, password);
      }
    }
  });
}

// Infra Creation execution
// Function to build cloud-agnostic custom images
function proceedWithBuildAgnosticImage(createInfraReq, snapshotName, snapshotDescription, cleanupInfraAfterSnapshot, username, password) {
  const hostname = configHostname;
  const port = configPort;
  const namespace = configNamespace;
  const url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/buildAgnosticImage`;
  
  // Prepare buildAgnosticImage request body
  const buildImageReq = {
    sourceInfraReq: createInfraReq,
    snapshotReq: {
      name: snapshotName,
      description: snapshotDescription
    },
    cleanupInfraAfterSnapshot: cleanupInfraAfterSnapshot
  };
  
  const jsonBody = JSON.stringify(buildImageReq, undefined, 4);
  const spinnerId = addSpinnerTask("Building custom images from: " + createInfraReq.name);
  const requestId = generateRandomRequestId("build-image-" + createInfraReq.name + "-", 10);
  addRequestIdToSelect(requestId);

  // Show progress notification
  Swal.fire({
    title: "📦 Building Cloud-Agnostic Images",
    html: `
      <div style="text-align: left; padding: 15px;">
        <p><strong>Starting workflow...</strong></p>
        <p style="color: #666; font-size: 0.9em;">
          ⏳ This process may take 10-20 minutes<br>
          1️⃣ Creating Infra infrastructure<br>
          2️⃣ Executing post-deployment commands<br>
          3️⃣ Creating custom snapshots<br>
          4️⃣ Waiting for images to become Available<br>
          ${cleanupInfraAfterSnapshot ? '5️⃣ Cleaning up infrastructure' : '5️⃣ Preserving infrastructure'}
        </p>
      </div>
    `,
    icon: "info",
    showConfirmButton: true,
    confirmButtonText: "OK, Continue",
    timer: 5000,
    timerProgressBar: true
  });

  axios({
    method: "post",
    url: url,
    headers: { "Content-Type": "application/json", "x-request-id": requestId },
    data: jsonBody,
    auth: {
      username: username,
      password: password,
    },
  })
    .then((res) => {
      console.log("BuildAgnosticImage completed:", res.data);
      
      const result = res.data;
      
      // Activate control-tab after successful operation
      try {
        document.querySelectorAll('.nav-link').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('show', 'active'));
        
        const controlTab = document.getElementById('control-tab');
        const controlPane = document.getElementById('control');
        
        if (controlTab && controlPane) {
          controlTab.classList.add('active');
          controlPane.classList.add('show', 'active');
          if (typeof $ !== 'undefined' && $.fn.tab) {
            $(controlTab).tab('show');
          }
        }
      } catch (error) {
        console.log('Failed to activate control tab:', error);
      }

      // Display success message with details
      Swal.fire({
        icon: "success",
        title: "✅ Custom Images Created Successfully!",
        html: `
          <div style="text-align: left; padding: 15px;">
            <p><strong>Build Summary:</strong></p>
            <ul style="list-style: none; padding-left: 0;">
              <li>📦 <strong>Infra:</strong> ${result.infraId || 'N/A'}</li>
              <li>⏱️ <strong>Duration:</strong> ${result.totalDuration || 'N/A'}</li>
              <li>✅ <strong>Success:</strong> ${result.snapshotResult?.successCount || 0} images</li>
              <li>❌ <strong>Failed:</strong> ${result.snapshotResult?.failCount || 0} images</li>
              <li>🗑️ <strong>Infra Cleaned:</strong> ${result.infraCleanedUp ? 'Yes' : 'No'}</li>
            </ul>
            ${result.snapshotResult?.results ? `
              <p><strong>Created Images:</strong></p>
              <ul style="max-height: 200px; overflow-y: auto;">
                ${result.snapshotResult.results.map(img => 
                  `<li><strong>${img.imageId}</strong> (${img.nodeGroupId}) - ${img.status}</li>`
                ).join('')}
              </ul>
            ` : ''}
            <p style="color: #666; font-size: 0.9em; margin-top: 10px;">
              ${result.message || 'Operation completed'}
            </p>
          </div>
        `,
        confirmButtonText: "View Custom Images",
        showCancelButton: true,
        cancelButtonText: "Close"
      }).then((result) => {
        if (result.isConfirmed) {
          // Open Snapshot Management modal to show created images
          showSnapshotManagementModal();
        }
      });

      displayJsonData(res.data, typeInfo);
      handleAxiosResponse(res);
      updateInfraList();
      // Keep configuration for reuse - user can manually clear if needed
    })
    .catch(function (error) {
      errorAlert("Failed to build agnostic images from: " + createInfraReq.name);
      
      let errorDetail = "Unknown error occurred";
      if (error.response) {
        console.log(error.response.data);
        console.log(error.response.status);
        console.log(error.response.headers);
        displayJsonData(error.response.data, typeError);
        errorDetail = error.response.data?.message || JSON.stringify(error.response.data);
      } else {
        console.log("Error", error.message);
        errorDetail = error.message;
      }
      
      Swal.fire({
        icon: "error",
        title: "❌ Image Build Failed",
        html: `
          <div style="text-align: left; padding: 15px;">
            <p><strong>Error Details:</strong></p>
            <div style="background-color: #f8f9fa; padding: 10px; border-radius: 5px; max-height: 200px; overflow-y: auto;">
              <code>${errorDetail}</code>
            </div>
          </div>
        `,
        confirmButtonText: "Close"
      });
      
      console.log(error.config);
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}

function proceedWithInfraCreation(createInfraReq, url, username, password) {
  var jsonBody = JSON.stringify(createInfraReq, undefined, 4);
  // Infra creation now tracked by spinner instead of console log
  var spinnerId = addSpinnerTask("Creating Infra: " + createInfraReq.name);

  var requestId = generateRandomRequestId("infra-" + createInfraReq.name + "-", 10);
  addRequestIdToSelect(requestId);

  axios({
    method: "post",
    url: url,
    headers: { "Content-Type": "application/json", "x-request-id": requestId },
    data: jsonBody,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then((res) => {
      // Debug: uncomment if detailed response debugging needed
      // console.log(res); // for debug

      // Activate control-tab after successful Infra creation
      try {
        // Remove active class from all tabs
        document.querySelectorAll('.nav-link').forEach(tab => {
          tab.classList.remove('active');
        });
        document.querySelectorAll('.tab-pane').forEach(pane => {
          pane.classList.remove('show', 'active');
        });
        
        // Activate control-tab
        const controlTab = document.getElementById('control-tab');
        const controlPane = document.getElementById('control');
        
        if (controlTab && controlPane) {
          controlTab.classList.add('active');
          controlPane.classList.add('show', 'active');
          
          // Trigger Bootstrap tab shown event if needed
          if (typeof $ !== 'undefined' && $.fn.tab) {
            $(controlTab).tab('show');
          }
        }
      } catch (error) {
        console.log('Failed to activate control tab:', error);
      }

      displayJsonData(res.data, typeInfo);
      handleAxiosResponse(res);

      updateInfraList();

      // Keep configuration for reuse - user can manually clear if needed
      console.log("Created " + createInfraReq.name);
    })
    .catch(function (error) {
      errorAlert("Failed to create Infra: " + createInfraReq.name);
      if (error.response) {
        // status code is not 2xx
        console.log(error.response.data);
        console.log(error.response.status);
        console.log(error.response.headers);
        displayJsonData(error.response.data, typeError);
      } else {
        console.log("Error", error.message);
      }
      console.log(error.config);
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}

// Generate Custom Image Settings HTML (for Build Agnostic Image workflow)
function generateCustomImageSettingsHtml() {
  return `
    <hr style="margin: 20px 0;">
    <p><font size=4><b>[Custom Image Settings]</b></font></p>
    <div style="margin-bottom: 15px;">
      <label style="display: block; margin-bottom: 8px;">
        <strong>Image Name Prefix:</strong>
        <input type="text" id="snapshotName" style="width: 75%; margin-top: 5px;"
               placeholder="custom-image" value="custom-image">
      </label>
      <div style="font-size: 0.8em; color: #666; margin-top: 3px;">
        The final image name will be: prefix-nodegroupname (e.g., custom-image-g1)
      </div>
    </div>

    <div style="margin-bottom: 15px;">
      <label style="display: block; margin-bottom: 8px;">
        <strong>Image Description:</strong>
        <textarea id="snapshotDescription" style="width: 75%; height: 60px; margin-top: 5px; padding: 5px;"
                  placeholder="Description about this custom image">Custom image created with BuildAgnosticImage workflow</textarea>
      </label>
    </div>

    <div style="margin-bottom: 15px;">
      <label style="display: flex; align-items: center; cursor: pointer;">
        <input type="checkbox" id="cleanupInfraCheckbox" checked style="margin-right: 8px; transform: scale(1.2);">
        <span style="color: #333; font-weight: 500;">🗑️ Cleanup Infra after image creation</span>
      </label>
      <div style="font-size: 0.8em; color: #666; margin-top: 3px; margin-left: 28px;">
        Automatically terminate and delete Infra after custom images are created and available
      </div>
    </div>`;
}

// Show post-deployment command dialog
function showPostCommandDialog(createInfraReq, infraCreationUrl, username, password, buildAgnosticImage = false) {
  const workflowInfoHtml = buildAgnosticImage ? `
    <div style="background-color: #e3f2fd; padding: 12px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #2196f3;">
      <p style="margin: 0; font-size: 0.9em; color: #1565c0;">
        <strong>🔧 Image Building Workflow:</strong><br>
        1️⃣ Create Infra infrastructure<br>
        2️⃣ Execute post-deployment commands (setup software)<br>
        3️⃣ Create custom snapshots from Nodes<br>
        4️⃣ Wait for images to become Available<br>
        5️⃣ Cleanup infrastructure (optional)
      </p>
    </div>` : '';

  Swal.fire({
    title: buildAgnosticImage ?
      "<font size=5><b>📦 Build Cloud-Agnostic Custom Image</b></font>" :
      "<font size=5><b>Add post-deployment commands</b></font>",
    width: 900,
    html: `
      <div id="dynamicContainer" style="text-align: left;">
        ${workflowInfoHtml}
        ${generateCommandsHtml(defaultRemoteCommand)}
        ${generatePredefinedScriptsHtml(false)}
        ${generateLabelSelectorHtml(true)}
        ${buildAgnosticImage ? generateCustomImageSettingsHtml() : ''}
      </div>`,
    showCancelButton: true,
    confirmButtonText: buildAgnosticImage ? "🚀 Build Custom Images" : "Add & Create Infra",
    didOpen: () => setupCommandsPopup(10),
    preConfirm: () => {
      const commands = collectCommands();
      const labelSelector = document.getElementById('labelSelector')?.value?.trim() || '';
      const result = { commands, labelSelector };

      // Add buildAgnosticImage specific parameters if applicable
      if (buildAgnosticImage) {
        result.snapshotName = document.getElementById('snapshotName')?.value?.trim() || 'custom-image';
        result.snapshotDescription = document.getElementById('snapshotDescription')?.value?.trim() || 'Custom image created with BuildAgnosticImage workflow';
        result.cleanupInfraAfterSnapshot = document.getElementById('cleanupInfraCheckbox')?.checked !== false;
      }

      return result;
    }
  }).then((commandResult) => {
    if (commandResult.isConfirmed) {
      if (commandResult.value.commands && commandResult.value.commands.length > 0) {
        createInfraReq.postCommand = {
          command: commandResult.value.commands,
          userName: "cb-user"
        };
        if (commandResult.value.labelSelector) {
          createInfraReq.postCommand.labelSelector = commandResult.value.labelSelector;
        }
      }

      // Handle buildAgnosticImage workflow
      if (buildAgnosticImage) {
        proceedWithBuildAgnosticImage(
          createInfraReq,
          commandResult.value.snapshotName,
          commandResult.value.snapshotDescription,
          commandResult.value.cleanupInfraAfterSnapshot,
          username,
          password
        );
      } else {
        proceedWithInfraCreation(createInfraReq, infraCreationUrl, username, password);
      }
    }
  });
}

// Infra Review function - checks configuration before creation
function reviewInfraConfiguration(createInfraReq, hostname, port, username, password, namespace, finalUrl, totalCost, totalNodeScale, costDetailsHtml, nodeGroupReqString) {
  var reviewUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infraDynamicReview`;
  
  // Show loading spinner for review
  Swal.fire({
    title: "Reviewing Configuration...",
    html: "Please wait while we validate your Infra configuration",
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  var jsonBody = JSON.stringify(createInfraReq, undefined, 4);
  var requestId = generateRandomRequestId("review-" + createInfraReq.name + "-", 10);

  // Call Infra Dynamic Review API
  axios({
    method: "post",
    url: reviewUrl,
    headers: { 
      "Content-Type": "application/json", 
      "x-request-id": requestId 
    },
    data: jsonBody,
    auth: {
      username: username,
      password: password,
    },
  })
  .then((res) => {
    // Debug: uncomment if detailed review response debugging needed
    // console.log("Review Response:", res); // for debug
    
    var reviewData = res.data;
    var validationStatus = "success";
    var validationDetails = "";
    var warnings = [];
    var errors = [];
    var infos = [];
    var nodeDetailsList = [];
    var resourceSummary = {
      totalEstimatedTime: "N/A",
      totalResources: 0,
      providerBreakdown: {},
      regionBreakdown: {},
      specBreakdown: {}
    };
    
    // Parse enhanced review response to extract comprehensive validation information
    if (reviewData) {
      // Extract Infra-level information (prioritize backend-calculated values)
      if (reviewData.infraName) infos.push(`Infra Name: ${reviewData.infraName}`);
      // Use backend-calculated totalNodeCount if available, fallback to frontend calculation
      if (reviewData.totalNodeCount) {
        infos.push(`NodeGroups: ${reviewData.totalNodeCount}`);
        // Update totalNodeScale with backend value if available
        totalNodeScale = reviewData.totalNodeCount;
      } else {
        infos.push(`NodeGroups: ${totalNodeScale} (frontend calculated)`);
      }
      // Use backend-calculated estimatedCost if available
      if (reviewData.estimatedCost) {
        infos.push(`Estimated Cost: ${reviewData.estimatedCost}`);
        // Parse and update totalCost with backend value if numeric
        var backendCostMatch = String(reviewData.estimatedCost).match(/\$?([\d.]+)/);
        if (backendCostMatch) {
          totalCost = parseFloat(backendCostMatch[1]);
        }
      }
      if (reviewData.overallStatus) {
        infos.push(`Overall Status: ${reviewData.overallStatus}`);
        if (reviewData.overallStatus.toLowerCase().includes("error")) {
          errors.push(`Infra Status Error: ${reviewData.overallMessage || reviewData.overallStatus}`);
          validationStatus = "error";
        } else if (reviewData.overallStatus.toLowerCase().includes("warning")) {
          warnings.push(`Infra Status Warning: ${reviewData.overallMessage || reviewData.overallStatus}`);
        }
      }
      
      if (reviewData.overallMessage) infos.push(`Message: ${reviewData.overallMessage}`);
      if (reviewData.creationViable !== undefined) infos.push(`Creation Viable: ${reviewData.creationViable ? 'Yes' : 'No'}`);
      if (reviewData.policyOnPartialFailure) infos.push(`Failure Policy: ${reviewData.policyOnPartialFailure}`);
      if (reviewData.policyDescription) infos.push(`Policy Description: ${reviewData.policyDescription}`);
      
      // Extract ResourceSummary information
      if (reviewData.resourceSummary) {
        var rs = reviewData.resourceSummary;
        if (rs.totalProviders) resourceSummary.totalProviders = rs.totalProviders;
        if (rs.totalRegions) resourceSummary.totalRegions = rs.totalRegions;
        if (rs.availableSpecs !== undefined) resourceSummary.availableSpecs = rs.availableSpecs;
        if (rs.unavailableSpecs !== undefined) resourceSummary.unavailableSpecs = rs.unavailableSpecs;
        if (rs.availableImages !== undefined) resourceSummary.availableImages = rs.availableImages;
        if (rs.unavailableImages !== undefined) resourceSummary.unavailableImages = rs.unavailableImages;
        
        // Provider breakdown
        if (rs.providerNames && Array.isArray(rs.providerNames)) {
          rs.providerNames.forEach(provider => {
            resourceSummary.providerBreakdown[provider] = (resourceSummary.providerBreakdown[provider] || 0) + 1;
          });
        }
        
        // Region breakdown  
        if (rs.regionNames && Array.isArray(rs.regionNames)) {
          rs.regionNames.forEach(region => {
            resourceSummary.regionBreakdown[region] = (resourceSummary.regionBreakdown[region] || 0) + 1;
          });
        }
        
        // Spec breakdown
        if (rs.uniqueSpecs && Array.isArray(rs.uniqueSpecs)) {
          rs.uniqueSpecs.forEach(spec => {
            resourceSummary.specBreakdown[spec] = (resourceSummary.specBreakdown[spec] || 0) + 1;
          });
        }
      }
      
      // Parse Node review results in detail and group by NodeGroup
      if (reviewData.nodeReviews && Array.isArray(reviewData.nodeReviews)) {
        resourceSummary.totalResources = reviewData.nodeReviews.length;
        
        // Group Nodes by NodeGroup name for better organization
        var nodeGroupVMs = {};
        
        reviewData.nodeReviews.forEach((nodeReview, index) => {
          var nodeDetails = {
            index: index + 1,
            name: nodeReview.nodeName || `Node-${index + 1}`,
            nodeGroupName: nodeReview.nodeGroupName || nodeReview.nodeName || `Node-${index + 1}`,
            nodeGroupSize: nodeReview.nodeGroupSize || 1,
            status: nodeReview.status || "Unknown",
            message: nodeReview.message || "",
            canCreate: nodeReview.canCreate || false,
            estimatedCost: nodeReview.estimatedCost || "Unknown",
            issues: [],
            info: [],
            validations: {}
          };
          
          // Node basic information with enhanced NodeGroup details
          if (nodeReview.nodeGroupSize) {
            var actualNodes = parseInt(nodeReview.nodeGroupSize) || 1;
            nodeDetails.info.push(`NodeGroup Size: ${nodeReview.nodeGroupSize} Node${actualNodes > 1 ? 's' : ''}`);
            if (actualNodes > 1) {
              nodeDetails.info.push(`Total Nodes in NodeGroup: ${actualNodes} instances`);
            }
          }
          if (nodeReview.connectionName) nodeDetails.info.push(`Connection: ${nodeReview.connectionName}`);
          if (nodeReview.providerName) nodeDetails.info.push(`Provider: ${nodeReview.providerName}`);
          if (nodeReview.regionName) nodeDetails.info.push(`Region: ${nodeReview.regionName}`);
          
          // Group Nodes by NodeGroup name
          var groupKey = nodeDetails.nodeGroupName;
          if (!nodeGroupVMs[groupKey]) {
            nodeGroupVMs[groupKey] = [];
          }
          nodeGroupVMs[groupKey].push(nodeDetails);
          
          // Spec validation details
          if (nodeReview.specValidation) {
            var sv = nodeReview.specValidation;
            nodeDetails.validations.spec = {
              resourceId: sv.resourceId,
              resourceName: sv.resourceName,
              isAvailable: sv.isAvailable,
              status: sv.status,
              message: sv.message,
              cspResourceId: sv.cspResourceId
            };
            
            if (!sv.isAvailable) {
              nodeDetails.issues.push(`Spec Issue: ${sv.message || 'Spec not available'}`);
            }
          }
          
          // Image validation details
          if (nodeReview.imageValidation) {
            var iv = nodeReview.imageValidation;
            nodeDetails.validations.image = {
              resourceId: iv.resourceId,
              resourceName: iv.resourceName,
              isAvailable: iv.isAvailable,
              status: iv.status,
              message: iv.message,
              cspResourceId: iv.cspResourceId
            };
            
            if (!iv.isAvailable) {
              nodeDetails.issues.push(`Image Issue: ${iv.message || 'Image not available'}`);
            }
          }
          
          // Node-level errors, warnings, and info
          if (nodeReview.errors && Array.isArray(nodeReview.errors)) {
            nodeReview.errors.forEach(error => {
              nodeDetails.issues.push(`Error: ${error}`);
              errors.push(`Node ${index + 1} (${nodeDetails.name}): ${error}`);
              validationStatus = "error";
            });
          }
          
          if (nodeReview.warnings && Array.isArray(nodeReview.warnings)) {
            nodeReview.warnings.forEach(warning => {
              nodeDetails.issues.push(`Warning: ${warning}`);
              warnings.push(`Node ${index + 1} (${nodeDetails.name}): ${warning}`);
            });
          }
          
          if (nodeReview.info && Array.isArray(nodeReview.info)) {
            nodeReview.info.forEach(info => {
              nodeDetails.info.push(info);
            });
          }
          
          // Don't add individual VMs to nodeDetailsList anymore, we'll use nodeGroupVMs
        });
        
        // Convert nodeGroupVMs to organized nodeDetailsList
        Object.keys(nodeGroupVMs).forEach(groupName => {
          var groupVMs = nodeGroupVMs[groupName];
          // Add NodeGroup as a single entry with consolidated information
          if (groupVMs.length > 0) {
            var representativeVM = groupVMs[0];
            var nodeGroupSize = parseInt(representativeVM.nodeGroupSize) || 1;
            
            // Find corresponding Node configuration from createInfraReq for additional spec details
            var nodeConfig = null;
            if (createInfraReq && createInfraReq.nodeGroups) {
              nodeConfig = createInfraReq.nodeGroups.find(nd => nd.name === groupName);
            }
            
            var groupDetails = {
              index: representativeVM.index,
              name: groupName,
              isNodeGroup: true,
              nodeGroupSize: nodeGroupSize,
              status: representativeVM.status,
              message: representativeVM.message,
              canCreate: representativeVM.canCreate,
              estimatedCost: representativeVM.estimatedCost,
              issues: representativeVM.issues,
              info: representativeVM.info,
              validations: representativeVM.validations,
              vmInstances: groupVMs.length,
              // Add Node configuration details
              nodeConfig: nodeConfig
            };
            
            // Calculate total cost for NodeGroup if cost per Node is available
            if (representativeVM.estimatedCost && representativeVM.estimatedCost !== 'Unknown') {
              var costMatch = String(representativeVM.estimatedCost).match(/\$?([\d.]+)/);
              if (costMatch) {
                var costPerVM = parseFloat(costMatch[1]);
                var totalNodeGroupCost = (costPerVM * nodeGroupSize).toFixed(4);
                groupDetails.estimatedCost = `$${totalNodeGroupCost}/hour (${nodeGroupSize} × $${costPerVM})`;
              }
            }
            
            nodeDetailsList.push(groupDetails);
          }
        });
      }
      
      // Extract recommendations
      if (reviewData.recommendations && Array.isArray(reviewData.recommendations)) {
        reviewData.recommendations.forEach(rec => {
          if (rec.toLowerCase().includes('warning') || rec.toLowerCase().includes('caution')) {
            warnings.push(`Recommendation: ${rec}`);
          } else {
            infos.push(`Recommendation: ${rec}`);
          }
        });
      }
      
      // Check for any additional validation messages
      if (reviewData.description && reviewData.description.includes("validation")) {
        validationDetails = reviewData.description;
      }
    }

    // Build validation summary HTML
    var validationSummaryHtml = "";
    
    if (validationStatus === "success" && warnings.length === 0 && errors.length === 0) {
      validationSummaryHtml = `
        <div style="margin: 15px 0; padding: 12px; background-color: #f0f8f0; border: 1px solid #28a745; border-radius: 5px;">
          <h4 style="color: #28a745; margin: 0 0 8px 0; font-size: 1em;">✅ Configuration Valid</h4>
          <p style="color: #666; margin: 0; font-size: 0.9em;">Your Infra configuration has been validated successfully. All resources can be provisioned as configured.</p>
        </div>
      `;
    } else {
      if (errors.length > 0) {
        validationSummaryHtml += `
          <div style="margin: 15px 0; padding: 12px; background-color: #fff0f0; border: 1px solid #dc3545; border-radius: 5px;">
            <h4 style="color: #dc3545; margin: 0 0 8px 0; font-size: 1em;">❌ Configuration Errors</h4>
            <ul style="color: #666; margin: 0; padding-left: 20px; font-size: 0.9em;">
              ${errors.map(error => `<li>${error}</li>`).join('')}
            </ul>
          </div>
        `;
      }
      
      if (warnings.length > 0) {
        validationSummaryHtml += `
          <div style="margin: 15px 0; padding: 12px; background-color: #fff8f0; border: 1px solid #ffc107; border-radius: 5px;">
            <h4 style="color: #ffc107; margin: 0 0 8px 0; font-size: 1em;">⚠️ Configuration Warnings</h4>
            <ul style="color: #666; margin: 0; padding-left: 20px; font-size: 0.9em;">
              ${warnings.map(warning => `<li>${warning}</li>`).join('')}
            </ul>
          </div>
        `;
      }
    }

    // Build comprehensive information sections with structured layout
    var infraInfoHtml = "";
    if (infos.length > 0) {
      // Parse structured information from the review response
      var structuredInfo = {
        basic: [],
        status: [],
        policy: [],
        recommendations: []
      };
      
      infos.forEach(info => {
        if (info.includes('Infra Name:') || info.includes('Total Node Count:') || info.includes('Estimated Cost:')) {
          // Special handling for estimated cost
          if (info.includes('Estimated Cost:')) {
            const costValue = info.split(': ')[1];
            if (costValue && (costValue.includes('unavailable') || costValue.includes('Cost estimation'))) {
              // Parse cost unavailability messages
              if (costValue.includes('unavailable for all')) {
                const ndCount = costValue.match(/\d+/);
                structuredInfo.basic.push(`Estimated Cost: Not available (${ndCount ? ndCount[0] : 'all'} Nodes)`);
              } else if (costValue.includes('unavailable')) {
                structuredInfo.basic.push(`Estimated Cost: Not available`);
              } else {
                structuredInfo.basic.push(info);
              }
            } else {
              structuredInfo.basic.push(info);
            }
          } else {
            structuredInfo.basic.push(info);
          }
        } else if (info.includes('Message:')) {
          structuredInfo.basic.push(info);
        } else if (info.includes('Overall Status:') || info.includes('Creation Viable:')) {
          structuredInfo.status.push(info);
        } else if (info.includes('Failure Policy:') || info.includes('Policy Description:')) {
          structuredInfo.policy.push(info);
        } else if (info.includes('Recommendation:')) {
          structuredInfo.recommendations.push(info.replace('Recommendation: ', ''));
        } else {
          structuredInfo.basic.push(info);
        }
      });
      
      infraInfoHtml = `
        <div style="margin: 15px 0; padding: 0; background-color: #f8f9fa; border: 1px solid #ddd; border-radius: 5px; overflow: hidden;">
          
          <div style="padding: 16px;">
            ${structuredInfo.status.length > 0 ? `
              <div style="margin-bottom: 16px;">
                <div style="margin-top: 8px;">
                  ${(() => {
                    // Separate status items
                    let overallStatus = null;
                    let creationViable = null;
                    let otherStatus = [];
                    
                    structuredInfo.status.forEach(info => {
                      const colonIndex = info.indexOf(': ');
                      if (colonIndex !== -1) {
                        const label = info.substring(0, colonIndex);
                        const value = info.substring(colonIndex + 2);
                        if (label === 'Overall Status') {
                          overallStatus = { label, value };
                        } else if (label === 'Creation Viable') {
                          creationViable = { label, value };
                        } else {
                          otherStatus.push({ label, value });
                        }
                      }
                    });
                    
                    let html = '';
                    
                    // Display Overall Status and Creation Viable in one row
                    if (overallStatus || creationViable) {
                      html += `
                        <div style="display: flex; gap: 12px; margin: 6px 0; flex-wrap: wrap;">
                      `;
                      
                      if (overallStatus) {
                        let valueStyle = 'color: #666; font-size: 1em; font-weight: bold; line-height: 1.4;';
                        let borderColor = '#007bff';
                        let backgroundColor = '#f8f9fa';
                        let statusIcon = '';
                        
                        if (overallStatus.value && overallStatus.value.toLowerCase().includes('ready')) {
                          valueStyle = 'color: #28a745; font-size: 1em; font-weight: bold; line-height: 1.4;';
                          borderColor = '#28a745';
                          backgroundColor = '#f0f8f0';
                          statusIcon = '✅ ';
                        } else if (overallStatus.value && overallStatus.value.toLowerCase().includes('warning')) {
                          valueStyle = 'color: #ffc107; font-size: 1em; font-weight: bold; line-height: 1.4;';
                          borderColor = '#ffc107';
                          backgroundColor = '#fff8f0';
                          statusIcon = '⚠️ ';
                        } else if (overallStatus.value && overallStatus.value.toLowerCase().includes('error')) {
                          valueStyle = 'color: #dc3545; font-size: 1em; font-weight: bold; line-height: 1.4;';
                          borderColor = '#dc3545';
                          backgroundColor = '#fff0f0';
                          statusIcon = '❌ ';
                        }
                        
                        html += `
                          <div style="flex: 1; min-width: 200px; padding: 8px 12px; background: ${backgroundColor}; border-radius: 4px; border-left: 3px solid ${borderColor};">
                            <div style="font-weight: 600; color: #333; margin-bottom: 4px; font-size: 0.9em;">${overallStatus.label}:</div>
                            <div style="${valueStyle}">${statusIcon}${overallStatus.value || 'N/A'}</div>
                          </div>
                        `;
                      }
                      
                      if (creationViable) {
                        let valueStyle = 'color: #666; font-size: 1em; font-weight: bold; line-height: 1.4;';
                        let borderColor = '#007bff';
                        let backgroundColor = '#f8f9fa';
                        let statusIcon = '';
                        
                        if (creationViable.value === 'Yes') {
                          valueStyle = 'color: #28a745; font-size: 1em; font-weight: bold; line-height: 1.4;';
                          borderColor = '#28a745';
                          backgroundColor = '#f0f8f0';
                          statusIcon = '✅ ';
                        } else if (creationViable.value === 'No') {
                          valueStyle = 'color: #dc3545; font-size: 1em; font-weight: bold; line-height: 1.4;';
                          borderColor = '#dc3545';
                          backgroundColor = '#fff0f0';
                          statusIcon = '❌ ';
                        }
                        
                        html += `
                          <div style="flex: 1; min-width: 200px; padding: 8px 12px; background: ${backgroundColor}; border-radius: 4px; border-left: 3px solid ${borderColor};">
                            <div style="font-weight: 600; color: #333; margin-bottom: 4px; font-size: 0.9em;">${creationViable.label}:</div>
                            <div style="${valueStyle}">${statusIcon}${creationViable.value || 'N/A'}</div>
                          </div>
                        `;
                      }
                      
                      html += '</div>';
                    }
                    
                    // Display other status items
                    otherStatus.forEach(statusInfo => {
                      html += `
                        <div style="margin: 6px 0; padding: 8px 12px; background: #f8f9fa; border-radius: 4px; border-left: 3px solid #007bff;">
                          <div style="font-weight: 600; color: #333; margin-bottom: 4px; font-size: 0.9em;">${statusInfo.label}:</div>
                          <div style="color: #666; font-size: 0.9em; line-height: 1.4; word-wrap: break-word; white-space: normal;">${statusInfo.value || 'N/A'}</div>
                        </div>
                      `;
                    });
                    
                    return html;
                  })()}
                </div>
              </div>
            ` : ''}
          
            ${structuredInfo.basic.length > 0 ? `
              <div style="margin-bottom: 16px;">
                
                <div style="margin-top: 8px;">
                  ${(() => {
                    // Separate Message from other basic info but don't display it here
                    const basicInfoWithoutMessage = [];
                    let messageInfo = null;
                    
                    structuredInfo.basic.forEach(info => {
                      const colonIndex = info.indexOf(': ');
                      if (colonIndex !== -1) {
                        const label = info.substring(0, colonIndex);
                        const value = info.substring(colonIndex + 2);
                        if (label === 'Message') {
                          messageInfo = { label, value };
                        } else {
                          basicInfoWithoutMessage.push({ label, value });
                        }
                      }
                    });
                    
                    // Sort basic info (excluding Message)
                    basicInfoWithoutMessage.sort((a, b) => {
                      const order = ['Infra Name', 'Total Node Count', 'Estimated Cost'];
                      const indexA = order.indexOf(a.label);
                      const indexB = order.indexOf(b.label);
                      
                      if (indexA !== -1 && indexB !== -1) {
                        return indexA - indexB;
                      } else if (indexA !== -1) {
                        return -1;
                      } else if (indexB !== -1) {
                        return 1;
                      } else {
                        return a.label.localeCompare(b.label);
                      }
                    });
                    
                    let html = '';
                    
                    // Display basic info in grid (Message will be shown later)
                    if (basicInfoWithoutMessage.length > 0) {
                      html += `
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 8px;">
                          ${basicInfoWithoutMessage.map(info => `
                            <div style="display: flex; align-items: center; padding: 8px 10px; background: #f8f9fa; border-radius: 4px; border-left: 3px solid #007bff;">
                              <span style="font-weight: 600; color: #333; margin-right: 8px; min-width: 80px; font-size: 0.9em;">${info.label}:</span>
                              <span style="color: #666; font-size: 0.9em;">${info.value || 'N/A'}</span>
                            </div>
                          `).join('')}
                        </div>
                      `;
                    }
                    
                    // Store messageInfo in a global variable to use later
                    window.tempMessageInfo = messageInfo;
                    
                    return html;
                  })()}
                </div>
              </div>
            ` : ''}


            ${(() => {
              // Display Message section after Status Information
              const messageInfo = window.tempMessageInfo;
              if (messageInfo) {
                return `
                  <div style="margin-bottom: 16px;">
                    <div style="margin-top: 8px;">
                      <div style="padding: 10px 12px; background: #f0f8ff; border-radius: 4px; border-left: 3px solid #007bff; border: 1px solid #e3f2fd; width: 100%; box-sizing: border-box;">
                        <div style="color: #333; font-size: 0.9em; line-height: 1.6; background: white; padding: 8px; border-radius: 3px; border: 1px solid #dee2e6; word-wrap: break-word; overflow-wrap: break-word; white-space: normal;">💬 ${messageInfo.value || 'N/A'}</div>
                      </div>
                    </div>
                  </div>
                `;
              }
              return '';
            })()}

            ${structuredInfo.recommendations.length > 0 ? `
              <div style="margin-bottom: 8px;">
                <h6 style="margin: 0 0 8px 0; color: #007bff; font-size: 0.9em; font-weight: 600; border-bottom: 1px solid #ddd; padding-bottom: 4px;">💡 Recommendations</h6>
                <div style="margin-top: 8px;">
                  ${structuredInfo.recommendations.map(rec => {
                    return `
                      <div style="margin: 6px 0; padding: 8px 12px; background: #f8f9fa; border-radius: 4px; border-left: 3px solid #ffc107;">
                        <div style="display: flex; align-items: flex-start;">
                          <span style="margin-right: 8px;">💡</span>
                          <span style="color: #666; font-size: 0.9em; line-height: 1.4;">${rec}</span>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    // Build resource summary HTML
    var resourceSummaryHtml = `
      <div style="margin: 15px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
          <tr style="background-color: #f8f9fa;">
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left; color: #333;">Resource Type</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left; color: #333;">Count/Details</th>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px; color: #666;">Total Nodes</td>
            <td style="border: 1px solid #ddd; padding: 8px; color: #333;"><strong>${resourceSummary.totalResources}</strong></td>
          </tr>
          ${Object.keys(resourceSummary.providerBreakdown).length > 0 ? `
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px; color: #666;">Cloud Providers</td>
            <td style="border: 1px solid #ddd; padding: 8px; color: #333;">
              ${Object.entries(resourceSummary.providerBreakdown).map(([provider, count]) => 
                `<span style="margin-right: 10px;"><strong>${provider}:</strong> ${count}</span>`
              ).join('')}
            </td>
          </tr>` : ''}
          ${Object.keys(resourceSummary.regionBreakdown).length > 0 ? `
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px; color: #666;">Regions</td>
            <td style="border: 1px solid #ddd; padding: 8px; color: #333;">
              ${Object.entries(resourceSummary.regionBreakdown).map(([region, count]) => 
                `<span style="margin-right: 10px;"><strong>${region}:</strong> ${count}</span>`
              ).join('')}
            </td>
          </tr>` : ''}
        </table>
      </div>
    `;

    // Build detailed Node information HTML with enhanced NodeGroup validation details
    var nodeDetailsHtml = "";
    if (nodeDetailsList.length > 0) {
      nodeDetailsHtml = nodeDetailsList.map(nd => {
        var statusIcon = nd.canCreate ? '✅' : '❌';
        var statusColor = nd.canCreate ? '#28a745' : '#dc3545';
        var bgColor = '#f8f9fa';
        
        // NodeGroup-specific display
        var nodeGroupIndicator = '';
        var nodeTitle = '';
        if (nd.isNodeGroup) {
          nodeGroupIndicator = `
            <div style="display: inline-flex; align-items: center; margin-left: 10px; padding: 2px 8px; background: #f0f8ff; border: 1px solid #007bff; border-radius: 12px; font-size: 0.8em; color: #007bff;">
             🖥️ X ${nd.nodeGroupSize}
            </div>
          `;
          nodeTitle = `${nd.name}`;
        } else {
          nodeTitle = `${nd.name} (Node #${nd.index})`;
        }
        
        return `
        <div style="margin: 10px 0; padding: 12px; border: 1px solid #ddd; border-radius: 5px; background-color: ${bgColor};">
          <div style="display: flex; align-items: center; margin-bottom: 10px; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; margin-right: 8px; cursor: pointer;">
              <input type="checkbox" class="nodegroup-checkbox" data-nodegroup-name="${nd.name}" style="margin-right: 6px; transform: scale(1.1);" checked onchange="updateReviewButtonState()">
            </label>
            <span style="font-size: 1em; margin-right: 8px;">${statusIcon}</span>
            <h6 style="margin: 0; color: ${statusColor}; font-size: 1em;">${nodeTitle}</h6>
            ${nodeGroupIndicator}
            ${nd.estimatedCost !== 'Unknown' && nd.estimatedCost !== 'Cost estimation unavailable' ? 
              `<span style="margin-left: auto; padding: 3px 8px; background: #28a745; color: white; border-radius: 14px; font-size: 0.8em;">💰 ${nd.estimatedCost}</span>` : 
              `<span style="margin-left: auto; padding: 3px 8px; background: #ffc107; color: white; border-radius: 14px; font-size: 0.8em;">⚠️ Cost N/A</span>`
            }
          </div>
          
          <div style="margin-bottom: 8px;">
            <div style="margin-bottom: 4px;">
              <strong style="font-size: 0.9em;">Status:</strong> 
              <span style="color: ${statusColor}; font-weight: bold; font-size: 0.9em;">
                ${nd.status}
              </span>
            </div>
            ${nd.message ? `<div style="margin-left: 0; color: #666; font-size: 0.8em; line-height: 1.4; word-wrap: break-word; white-space: normal;">(${nd.message})</div>` : ''}
          </div>
          
          ${nd.isNodeGroup ? `
          <div style="margin: 8px 0; padding: 8px; background: #f0f8ff; border-radius: 4px; border-left: 3px solid #007bff;">
            
            ${(() => {
              // Extract Provider and Region from Node info
              var provider = '';
              var region = '';
              if (nd.info && Array.isArray(nd.info)) {
                nd.info.forEach(info => {
                  if (info.includes('Provider:')) provider = info.split(': ')[1] || '';
                  if (info.includes('Region:')) region = info.split(': ')[1] || '';
                });
              }
              
              // Extract spec details from nodeConfig if available
              var specDetails = '';
              if (nd.nodeConfig) {
                var specs = [];
                
                // Try to find detailed spec info from recommendedSpecList if available
                var detailedSpec = null;
                if (nd.nodeConfig.specId && typeof recommendedSpecList !== 'undefined' && Array.isArray(recommendedSpecList)) {
                  detailedSpec = recommendedSpecList.find(spec => 
                    spec.id === nd.nodeConfig.specId || 
                    spec.name === nd.nodeConfig.specId ||
                    nd.nodeConfig.specId.includes(spec.id)
                  );
                }
                
                if (detailedSpec) {
                  // Use detailed spec information from recommendedSpecList
                  if (detailedSpec.vCPU) {
                    specs.push(`💻 <strong>vCPU:</strong> ${detailedSpec.vCPU}`);
                  }
                  if (detailedSpec.memoryGiB) {
                    specs.push(`🧠 <strong>Memory:</strong> ${detailedSpec.memoryGiB} GiB`);
                  }
                  if (detailedSpec.acceleratorType && detailedSpec.acceleratorType !== 'N/A') {
                    var acceleratorInfo = detailedSpec.acceleratorType;
                    if (detailedSpec.acceleratorModel && detailedSpec.acceleratorModel !== 'N/A') {
                      acceleratorInfo += ` (${detailedSpec.acceleratorModel})`;
                    }
                    specs.push(`⚡ <strong>Accelerator:</strong> ${acceleratorInfo}`);
                  }
                } else if (nd.nodeConfig.specId) {
                  // Fallback: Try to extract vCPU and memory from spec name if available
                  var specMatch = nd.nodeConfig.specId.match(/([0-9]+)vcpu_([0-9.]+)gb/i);
                  if (specMatch) {
                    specs.push(`💻 <strong>vCPU:</strong> ${specMatch[1]}`);
                    specs.push(`🧠 <strong>Memory:</strong> ${specMatch[2]} GB`);
                  } else {
                    // Show spec ID as fallback
                    specs.push(`🖥️ <strong>Spec:</strong> ${nd.nodeConfig.specId.split('+').pop() || nd.nodeConfig.specId}`);
                  }
                }
                
                // Add RootDisk information if available
                if (nd.nodeConfig.rootDiskSize && nd.nodeConfig.rootDiskSize > 0) {
                  specs.push(`💽 <strong>Root Disk:</strong> ${nd.nodeConfig.rootDiskSize} GB`);
                } else {
                  // Show default if 0 or not specified
                  specs.push(`💽 <strong>Root Disk:</strong> Default`);
                }
                
                // Add RootDisk type if available
                if (nd.nodeConfig.rootDiskType && nd.nodeConfig.rootDiskType !== 'default') {
                  specs.push(`📀 <strong>Disk Type:</strong> ${nd.nodeConfig.rootDiskType}`);
                }
                
                // Check for accelerator/GPU information from spec name if not found in detailed spec
                if (!detailedSpec && nd.nodeConfig.specId && 
                    (nd.nodeConfig.specId.toLowerCase().includes('gpu') || 
                     nd.nodeConfig.specId.toLowerCase().includes('accelerator'))) {
                  specs.push(`⚡ <strong>Accelerator:</strong> GPU-enabled`);
                }
                
                if (specs.length > 0) {
                  specDetails = `
                    <div style="margin: 8px 0; padding: 8px; background: #f0f8ff; border-radius: 4px; border: 1px solid #b3d9ff;">
                      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 4px; font-size: 0.8em;">
                        ${specs.map(spec => `<div style="color: #004499;">${spec}</div>`).join('')}
                      </div>
                    </div>
                  `;
                }
              }
              
              // Create location info section
              var locationInfo = '';
              if (provider || region) {
                locationInfo = `
                  <div style="margin: 8px 0; padding: 8px; background: #f0f8ff; border-radius: 4px; border: 1px solid #b3d9ff;">
                    <div style="display: flex; gap: 12px; font-size: 0.8em; color: #228b22;">
                      ${provider ? `<div>🏢 <strong>Provider:</strong> ${provider}</div>` : ''}
                      ${region ? `<div>📍 <strong>Region:</strong> ${region}</div>` : ''}
                    </div>
                  </div>
                `;
              }
              
              return locationInfo + specDetails ;
            })()}
          </div>` : ''}
          
          ${nd.validations && (nd.validations.spec || nd.validations.image) ? `
          <div style="margin: 10px 0; padding: 8px; background: #f1f3f4; border-radius: 4px; border-left: 3px solid #007bff;">
            <strong style="color: #495057; font-size: 0.95em;">🔍 Resource Validation</strong>
            ${nd.validations.spec ? `
            <div style="margin: 6px 0; padding: 6px; background: ${nd.validations.spec.isAvailable ? '#e8f5e8' : '#ffe8e8'}; border-radius: 4px;">
              <div style="font-size: 0.9em;"><strong>🖥️ Spec:</strong> ${nd.validations.spec.resourceId || 'N/A'}</div>
              <div style="font-size: 0.8em; color: #666; line-height: 1.4;">
                Status: ${nd.validations.spec.status || 'Unknown'} | 
                Available: ${nd.validations.spec.isAvailable ? 'Yes' : 'No'}
                ${nd.validations.spec.message ? `<div style="margin-top: 4px; word-wrap: break-word; white-space: normal;">📝 ${nd.validations.spec.message}</div>` : ''}
              </div>
            </div>` : ''}
            ${nd.validations.image ? `
            <div style="margin: 6px 0; padding: 6px; background: ${nd.validations.image.isAvailable ? '#e8f5e8' : '#ffe8e8'}; border-radius: 4px;">
              <div style="font-size: 0.9em;"><strong>💿 Image:</strong> ${nd.validations.image.resourceId || 'N/A'}</div>
              <div style="font-size: 0.8em; color: #666; line-height: 1.4;">
                Status: ${nd.validations.image.status || 'Unknown'} | 
                Available: ${nd.validations.image.isAvailable ? 'Yes' : 'No'}
                ${nd.validations.image.message ? `<div style="margin-top: 4px; word-wrap: break-word; white-space: normal;">📝 ${nd.validations.image.message}</div>` : ''}
              </div>
            </div>` : ''}
          </div>` : ''}
          
          ${nd.issues.length > 0 ? `
          <div style="margin: 10px 0; padding: 8px; background: #ffe6e6; border-radius: 4px; border-left: 3px solid #dc3545;">
            <strong style="color: #dc3545; font-size: 0.95em;">⚠️ Issues Found</strong>
            <ul style="margin: 5px 0; padding-left: 20px; color: #dc3545; font-size: 0.85em;">
              ${nd.issues.map(issue => `<li>${issue}</li>`).join('')}
            </ul>
          </div>` : ''}
          
          ${nd.info.length > 0 ? `
          <details style="margin-top: 10px;">
            <summary style="cursor: pointer; font-size: 0.9em; color: #6c757d; font-weight: bold;">📋 View Additional Details</summary>
            <div style="margin: 8px 0; padding: 8px; background: #f8f9fa; border-radius: 4px;">
              <ul style="margin: 0; padding-left: 20px; font-size: 0.85em; color: #6c757d;">
                ${nd.info.filter(info => 
                  !info.includes('Provider:') && 
                  !info.includes('Region:') && 
                  !info.includes('NodeGroup Size:') &&
                  !info.includes('Total Nodes in NodeGroup:')
                ).map(info => `<li style="margin: 2px 0;">${info}</li>`).join('')}
              </ul>
            </div>
          </details>` : ''}
        </div>`;
      }).join('');
    }
    
    // Create enhanced resource summary HTML
    var resourceSummaryHtml = "";
    if (resourceSummary && (resourceSummary.totalProviders || resourceSummary.totalRegions || Object.keys(resourceSummary.providerBreakdown).length > 0)) {
      resourceSummaryHtml = `
        <div style="margin: 12px 0; padding: 12px; border: 1px solid #ddd; border-radius: 5px; background: #f8f9fa;">
          <strong style="color: #333; font-size: 1em;">📊 Resource Summary</strong>
          <div style="margin: 8px 0; font-size: 0.9em; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px;">
            ${resourceSummary.availableSpecs !== undefined ? `<div>✅ Available Specs: <span style="font-weight: bold; color: #28a745;">${resourceSummary.availableSpecs}</span></div>` : ''}
            ${resourceSummary.availableImages !== undefined ? `<div>✅ Available Images: <span style="font-weight: bold; color: #28a745;">${resourceSummary.availableImages}</span></div>` : ''}
            ${resourceSummary.unavailableSpecs !== undefined ? `<div>❌ Unavailable Specs: <span style="font-weight: bold; color: #dc3545;">${resourceSummary.unavailableSpecs}</span></div>` : ''}
            ${resourceSummary.unavailableImages !== undefined ? `<div>❌ Unavailable Images: <span style="font-weight: bold; color: #dc3545;">${resourceSummary.unavailableImages}</span></div>` : ''}
          </div>
          
          ${Object.keys(resourceSummary.providerBreakdown).length > 0 ? `
            <div style="margin: 8px 0;">
              <strong style="font-size: 0.9em; color: #333;">Cloud Provider Distribution:</strong>
              <div style="margin-top: 4px;">
                ${Object.entries(resourceSummary.providerBreakdown).map(([provider, count]) => 
                  `<span style="display: inline-block; margin: 2px 4px; padding: 3px 8px; background: #f0f8ff; border: 1px solid #007bff; border-radius: 12px; font-size: 0.8em; color: #007bff;">${provider}: ${count}</span>`
                ).join('')}
              </div>
            </div>
          ` : ''}
          
          ${Object.keys(resourceSummary.regionBreakdown).length > 0 ? `
            <div style="margin: 8px 0;">
              <strong style="font-size: 0.9em; color: #333;">Region Distribution:</strong>
              <div style="margin-top: 4px;">
                ${Object.entries(resourceSummary.regionBreakdown).map(([region, count]) => 
                  `<span style="display: inline-block; margin: 2px 4px; padding: 3px 8px; background: #f0f8f0; border: 1px solid #28a745; border-radius: 12px; font-size: 0.8em; color: #28a745;">${region}: ${count}</span>`
                ).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }

    // Show review results
    Swal.fire({
      title: "Infra Configuration Review Results",
      width: 1000,
      html: `
        ${validationSummaryHtml}
        ${infraInfoHtml}
        <div style="text-align: left;">
          <details>
            <summary style="font-weight: bold; font-size: 1em; margin: 10px 0; cursor: pointer; color: #333;">📋 Configuration Summary</summary>
            <div style="margin-left: 20px;">
              ${resourceSummaryHtml}
            </div>
          </details>
          
          <details>
            <summary style="font-weight: bold; font-size: 1em; margin: 10px 0; cursor: pointer; color: #333;">🖥️ NodeGroup Configuration Status</summary>
            <div style="margin-left: 20px;">
              <div style="margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 5px; border-left: 4px solid #007bff;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                  <strong style="color: #007bff; font-size: 0.95em;">📋 NodeGroup Selection</strong>
                  <button id="reviewWithSelectedNodeGroups" style="padding: 4px 12px; background: #28a745; color: white; border: none; border-radius: 4px; font-size: 0.8em; cursor: pointer;">
                    🔄 re-validate
                  </button>
                </div>
                <div style="font-size: 0.85em; color: #666; margin-bottom: 8px;">
                  Uncheck NodeGroups to exclude them from Infra creation. Click "re-validate" to re-validate your configuration.
                </div>
                <div style="margin: 8px 0;">
                  <label style="display: flex; align-items: center; cursor: pointer; font-size: 0.85em; margin-bottom: 4px;">
                    <input type="checkbox" id="selectAllNodeGroups" style="margin-right: 6px;" checked onchange="toggleAllNodeGroups()">
                    <span style="color: #333; font-weight: 500;">Select/Deselect All NodeGroups</span>
                  </label>
                </div>
              </div>
              ${nodeDetailsHtml.length > 0 ? nodeDetailsHtml : '<p style="color: #666; font-style: italic; font-size: 0.9em;">No NodeGroup details available</p>'}
            </div>
          </details>
          
          <details>
            <summary style="font-weight: bold; font-size: 1em; margin: 10px 0; cursor: pointer; color: #333;">🔍 Raw Review Response</summary>
            <div style="margin-left: 20px;">
              <pre style="background-color: #f8f9fa; padding: 10px; border-radius: 5px; overflow: auto; max-height: 300px; font-size: 0.8em; border: 1px solid #ddd; color: #666;">${JSON.stringify(reviewData, null, 2)}</pre>
            </div>
          </details>
          
          <details>
            <summary style="font-weight: bold; font-size: 1em; margin: 10px 0; cursor: pointer; color: #333;">📋 Current Configuration</summary>
            <div style="margin-left: 20px;">
              <div style="margin-bottom: 15px;">
                <div style="font-size: 0.9em; color: #666; margin-bottom: 8px;">
                  This shows the current Infra request body that will be sent to create the infrastructure.
                </div>
              </div>
              <pre style="background-color: #f8f9fa; padding: 10px; border-radius: 5px; overflow: auto; max-height: 400px; font-size: 0.8em; border: 1px solid #ddd; color: #666;">${JSON.stringify(createInfraReq, null, 2)}</pre>
            </div>
          </details>
          
          <div style="margin: 20px 0; padding: 16px; background-color: #f8f9fa; border: 1px solid #ddd; border-radius: 5px;">
            <details>
              <summary style="cursor: pointer; list-style: none;">
                <h6 style="margin: 0; color: #007bff; font-size: 1em; font-weight: 600; border-bottom: 1px solid #ddd; padding-bottom: 4px; display: inline-flex; align-items: center; gap: 6px;">
                  <span style="font-size: 0.85em; color: #888;">▸</span>
                  ⚙️ Deployment Options
                  <span style="font-size: 0.8em; font-weight: normal; color: #888;">(advanced — click to expand)</span>
                </h6>
              </summary>
              <div style="margin-top: 12px;">
              
              <div style="margin: 8px 0;">
                <label style="display: flex; align-items: center; cursor: not-allowed; font-size: 0.9em; opacity: 0.5;">
                  <input type="checkbox" id="monitoring-checkbox" style="margin-right: 8px; transform: scale(1.2);" disabled>
                  <span style="color: #999; font-weight: 500;">📊 Deploy a monitoring agent (temporarily disabled)</span>
                </label>
                <div style="margin-left: 24px; margin-top: 4px; color: #999; font-size: 0.8em;">
                  Install CB-Dragonfly monitoring agent on all Nodes for performance monitoring.
                </div>
              </div>

              <div style="margin: 8px 0;">
                <label style="display: flex; align-items: center; cursor: pointer; font-size: 0.9em;">
                  <input type="checkbox" id="hold-checkbox" style="margin-right: 8px; transform: scale(1.2);">
                  <span style="color: #333; font-weight: 500;">⏸️ Hold Node provisioning of the Infra</span>
                </label>
                <div style="margin-left: 24px; margin-top: 4px; color: #666; font-size: 0.8em;">
                  Create Infra structure without deploying Nodes immediately. Use "Continue" action when ready.
                </div>
              </div>

              
              <div style="margin: 8px 0;">
                <label style="display: flex; align-items: center; cursor: pointer; font-size: 0.9em;">
                  <input type="checkbox" id="postcommand-checkbox" style="margin-right: 8px; transform: scale(1.2);">
                  <span style="color: #333; font-weight: 500;">🚀 Add post-deployment commands</span>
                </label>
                <div style="margin-left: 24px; margin-top: 4px; color: #666; font-size: 0.8em;">
                  Execute custom commands on all Nodes after successful deployment.
                </div>
              </div>
              
              <div style="margin: 8px 0;">
                <label style="display: flex; align-items: center; cursor: pointer; font-size: 0.9em;">
                  <input type="checkbox" id="buildimage-checkbox" style="margin-right: 8px; transform: scale(1.2);">
                  <span style="color: #333; font-weight: 500;">📦 Build Cloud-Agnostic Custom Image</span>
                </label>
                <div style="margin-left: 24px; margin-top: 4px; color: #666; font-size: 0.8em;">
                  Create custom images from deployed Nodes and optionally cleanup infrastructure.
                </div>
              </div>
              </div>
            </details>
          </div>
        </div>
        
        <script>
          function copyToClipboard(text) {
            try {
              navigator.clipboard.writeText(text);
            } catch (err) {
              // Fallback for older browsers
              const textArea = document.createElement('textarea');
              textArea.value = text;
              document.body.appendChild(textArea);
              textArea.select();
              document.execCommand('copy');
              document.body.removeChild(textArea);
            }
          }
          
          function downloadJson(jsonData, filename) {
            try {
              const jsonString = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData, null, 2);
              const blob = new Blob([jsonString], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = filename || 'config.json';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
            } catch (err) {
              console.error('Failed to download JSON:', err);
              alert('Failed to download JSON file.');
            }
          }
          
        </script>
      `,
      showCancelButton: true,
      confirmButtonText: "Create Infra",
      cancelButtonText: "Cancel",
      confirmButtonColor: validationStatus === "error" ? "#ffc107" : "#28a745",
      scrollbarPadding: false,
      didOpen: () => {
        // Initialize NodeGroup management functions
        window.toggleAllNodeGroups = function() {
          const selectAllCheckbox = document.getElementById('selectAllNodeGroups');
          const nodegroupCheckboxes = document.querySelectorAll('.nodegroup-checkbox');
          
          nodegroupCheckboxes.forEach(checkbox => {
            checkbox.checked = selectAllCheckbox.checked;
          });
          
          updateReviewButtonState();
        };
        
          window.updateReviewButtonState = function() {
          const selectedNodeGroups = document.querySelectorAll('.nodegroup-checkbox:checked');
          const reviewButton = document.getElementById('reviewWithSelectedNodeGroups');
          const selectAllCheckbox = document.getElementById('selectAllNodeGroups');
          
          if (reviewButton) {
            if (selectedNodeGroups.length === 0) {
              reviewButton.style.background = '#dc3545';
              reviewButton.textContent = '⚠️ No NodeGroups Selected';
              reviewButton.disabled = true;
            } else {
              reviewButton.style.background = '#28a745';
              reviewButton.textContent = '🔄 Review Selected (' + selectedNodeGroups.length + ')';
              reviewButton.disabled = false;
            }
          }
          
          // Update "Select All" checkbox state
          const allNodeGroups = document.querySelectorAll('.nodegroup-checkbox');
          if (selectAllCheckbox && allNodeGroups.length > 0) {
            selectAllCheckbox.checked = selectedNodeGroups.length === allNodeGroups.length;
            selectAllCheckbox.indeterminate = selectedNodeGroups.length > 0 && selectedNodeGroups.length < allNodeGroups.length;
          }
        };
        
        // Toggle Build Image options visibility
        window.toggleBuildImageOptions = function() {
          const buildImageCheckbox = document.getElementById('buildimage-checkbox');
          const postCommandCheckbox = document.getElementById('postcommand-checkbox');
          
          if (buildImageCheckbox && buildImageCheckbox.checked) {
            // When build image is enabled, automatically enable post-commands
            if (postCommandCheckbox) {
              postCommandCheckbox.checked = true;
              postCommandCheckbox.disabled = false;
            }
          }
        };
        window.getSelectedNodeGroups = function() {
          const selectedCheckboxes = document.querySelectorAll('.nodegroup-checkbox:checked');
          return Array.from(selectedCheckboxes).map(cb => cb.getAttribute('data-nodegroup-name'));
        };
        
        // Set up event listeners
        const reviewButton = document.getElementById('reviewWithSelectedNodeGroups');
        if (reviewButton) {
          reviewButton.addEventListener('click', function() {
            const selectedNodeGroups = getSelectedNodeGroups();
            if (selectedNodeGroups.length === 0) {
              alert('Please select at least one NodeGroup to review.');
              return;
            }
            
            // Store selected nodegroups and current config for re-review
            window.selectedNodeGroupsForReview = selectedNodeGroups;
            
            // Close current modal and trigger re-review
            Swal.close();
            
            // Use setTimeout to ensure modal is closed before starting new review
            setTimeout(() => {
              reviewWithSelectedNodeGroups(selectedNodeGroups);
            }, 100);
          });
        }
        
        // Initialize button state
        updateReviewButtonState();
        
        // Add change listeners to all nodegroup checkboxes
        const nodegroupCheckboxes = document.querySelectorAll('.nodegroup-checkbox');
        nodegroupCheckboxes.forEach(checkbox => {
          checkbox.addEventListener('change', updateReviewButtonState);
        });
        
        // Add change listener for build image checkbox
        const buildImageCheckbox = document.getElementById('buildimage-checkbox');
        if (buildImageCheckbox) {
          buildImageCheckbox.addEventListener('change', toggleBuildImageOptions);
        }
      },
      preConfirm: () => {
        if (validationStatus !== "error") {
          return {
            monitoring: document.getElementById('monitoring-checkbox') ? document.getElementById('monitoring-checkbox').checked : false,
            hold: document.getElementById('hold-checkbox') ? document.getElementById('hold-checkbox').checked : false,
            addPostCommand: document.getElementById('postcommand-checkbox') ? document.getElementById('postcommand-checkbox').checked : false,
            buildAgnosticImage: document.getElementById('buildimage-checkbox') ? document.getElementById('buildimage-checkbox').checked : false
          };
        }
        return null;
      }
    }).then((result) => {
      if (result.isConfirmed) {
        if (validationStatus === "error") {
          // Show warning and ask for confirmation to proceed despite errors
          Swal.fire({
            icon: "warning",
            title: "⚠️ Configuration Has Errors",
            html: `
              <p><strong>Your Infra configuration has validation errors.</strong></p>
              <p>Proceeding may result in deployment failures or unexpected behavior.</p>
              <p>Do you want to proceed anyway?</p>
            `,
            showCancelButton: true,
            confirmButtonText: "Yes, Create Anyway",
            cancelButtonText: "Cancel",
            confirmButtonColor: "#dc3545",
            cancelButtonColor: "#6c757d"
          }).then((forceResult) => {
            if (forceResult.isConfirmed) {
              // Force proceed with Infra creation using selected options
              const options = result.value || { monitoring: false, hold: false, addPostCommand: false };
              
              createInfraReq.installMonAgent = "no";
              var infraCreationUrl = finalUrl;
              
              if (options.monitoring) {
                createInfraReq.installMonAgent = "yes";
              }
              if (options.hold) {
                infraCreationUrl += "?option=hold";
              }
              
              // Handle post-deployment commands for force creation
              if (options.addPostCommand || options.buildAgnosticImage) {
                // Show the same post-command dialog as normal flow (with buildAgnosticImage flag)
                showPostCommandDialog(createInfraReq, infraCreationUrl, username, password, options.buildAgnosticImage);
              } else {
                proceedWithInfraCreation(createInfraReq, infraCreationUrl, username, password);
              }
            }
          });
        } else {
          // Proceed directly to Infra creation with selected options
          const options = result.value || { monitoring: false, hold: false, addPostCommand: false };
          
          createInfraReq.installMonAgent = "no";
          var infraCreationUrl = finalUrl;
          
          if (options.monitoring) {
            createInfraReq.installMonAgent = "yes";
          }
          if (options.hold) {
            infraCreationUrl += "?option=hold";
          }

          if (options.addPostCommand || options.buildAgnosticImage) {
            // Show post-command dialog (with buildAgnosticImage flag)
            showPostCommandDialog(createInfraReq, infraCreationUrl, username, password, options.buildAgnosticImage);
          } else {
            proceedWithInfraCreation(createInfraReq, infraCreationUrl, username, password);
          }
        }
      }
    });
  })
  .catch(function (error) {
    console.error("Review failed:", error);
    
    var errorMessage = "Unknown error occurred during review";
    if (error.response && error.response.data) {
      errorMessage = error.response.data.message || JSON.stringify(error.response.data);
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    Swal.fire({
      icon: "error",
      title: "Review Failed",
      html: `
        <p>Unable to review Infra configuration:</p>
        <div style="background-color: #f8f9fa; padding: 10px; border-radius: 5px; margin: 10px 0;">
          <code>${errorMessage}</code>
        </div>
        <p>Would you like to proceed without review?</p>
      `,
      showCancelButton: true,
      confirmButtonText: "Proceed Anyway",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#ffc107",
    }).then((result) => {
      if (result.isConfirmed) {
        // Proceed to final confirmation even without review - call the same logic as successful review
        const options = { monitoring: false, hold: false, addPostCommand: false };
        
        createInfraReq.installMonAgent = "no";
        
        proceedWithInfraCreation(createInfraReq, finalUrl, username, password);
      }
    });
  });
}

// Function to review Infra with selected NodeGroups only
function reviewWithSelectedNodeGroups(selectedNodeGroups) {
  // Get current Infra request data
  var hostname = configHostname;
  var port = configPort;
  var username = configUsername;
  var password = configPassword;
  var namespace = configNamespace;
  
  // Get current createInfraReq from global nodeGroupRequestFromSpecList
  if (nodeGroupRequestFromSpecList.length === 0) {
    Swal.fire({
      icon: "error",
      title: "No Configuration Found",
      text: "No Infra configuration found. Please create a new configuration first."
    });
    return;
  }
  
  // Filter Node requests to include only selected NodeGroups
  var filteredNodeRequests = nodeGroupRequestFromSpecList.filter(nodeReq => {
    return selectedNodeGroups.includes(nodeReq.name);
  });
  
  if (filteredNodeRequests.length === 0) {
    Swal.fire({
      icon: "warning",
      title: "No NodeGroups Selected",
      text: "Please select at least one NodeGroup to proceed with the review."
    });
    return;
  }
  
  // Create modified Infra request with filtered VMs
  var modifiedCreateInfraReq = JSON.parse(JSON.stringify(createInfraReqTmplt));
  modifiedCreateInfraReq.name = "mc-" + generateInfraName();
  modifiedCreateInfraReq.nodeGroups = filteredNodeRequests;
  
  // Calculate costs and details for selected NodeGroups
  let totalCost = 0;
  let totalNodeScale = 0;
  let costDetailsHtml = "";
  let nodeGroupReqString = "";
  
  filteredNodeRequests.forEach(nodeReq => {
    totalNodeScale += parseInt(nodeReq.nodeGroupSize || 1);
    nodeGroupReqString += `<b>${nodeReq.name}</b> (${nodeReq.nodeGroupSize || 1} Nodes)<br>`;
  });
  
  costDetailsHtml = `
    <div style="text-align: left; margin: 10px 0;">
      <strong>Selected NodeGroups: ${filteredNodeRequests.length}</strong><br>
      <strong>Total Nodes: ${totalNodeScale}</strong><br>
      <div style="font-size: 0.9em; color: #666; margin-top: 5px;">
        ${nodeGroupReqString}
      </div>
    </div>
  `;
  
  var finalUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infraDynamic`;
  
  // Show loading message
  Swal.fire({
    title: "Reviewing Modified Configuration",
    html: `
      <div style="text-align: center;">
        <div style="margin: 20px 0;">
          <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #007bff; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        </div>
        <p>Validating configuration with ${filteredNodeRequests.length} selected NodeGroups...</p>
      </div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `,
    showConfirmButton: false,
    allowOutsideClick: false
  });
  
  // Trigger review with modified configuration
  setTimeout(() => {
    reviewInfraConfiguration(modifiedCreateInfraReq, hostname, port, username, password, namespace, finalUrl, totalCost, totalNodeScale, costDetailsHtml, nodeGroupReqString);
  }, 1000);
}

function createInfra() {
  // Scroll Provision panel to top
  var scrollableCol = document.querySelector('.scrollable-column');
  if (scrollableCol) scrollableCol.scrollTop = 0;

  if (nodeGroupRequestFromSpecList.length != 0) {
    var hostname = configHostname;
    var port = configPort;
    var username = configUsername;
    var password = configPassword;
    var namespace = configNamespace;

    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infraDynamic`;

    var createInfraReq = createInfraReqTmplt;
    createInfraReq.name = "mc-" + generateInfraName();
    createInfraReq.nodeGroups = nodeGroupRequestFromSpecList;
    let totalCost = 0;
    let totalNodeScale = 0;

    var nodeGroupReqString = "";
    for (i = 0; i < createInfraReq.nodeGroups.length; i++) {

      totalNodeScale += parseInt(createInfraReq.nodeGroups[i].nodeGroupSize);
      let costPerHour = recommendedSpecList[i].costPerHour;
      let subTotalCost = "unknown";
      if (costPerHour < 0 || !costPerHour) {
        costPerHour = "unknown";
        costPerHour = "<tr><th style='width: 50%;'>Estimated Price(USD/1H)</th><td><b><span style='color: red; '>$" + subTotalCost + "  ($" + costPerHour + " * " + createInfraReq.nodeGroups[i].nodeGroupSize + ")" + "</span></b></td></tr>";
      } else {
        totalCost += parseFloat(costPerHour) * createInfraReq.nodeGroups[i].nodeGroupSize;

        subTotalCost = (parseFloat(costPerHour) * createInfraReq.nodeGroups[i].nodeGroupSize).toFixed(4);
        costPerHour = "<tr><th style='width: 50%;'>Estimated Price(USD/1H)</th><td><b><span style='color: red; '>$" + subTotalCost + "  ($" + costPerHour + " * " + createInfraReq.nodeGroups[i].nodeGroupSize + ")" + "</span></b></td></tr>";
      }
      let acceleratorType = recommendedSpecList[i].acceleratorType;
      let acceleratorModel = recommendedSpecList[i].acceleratorModel;
      if (acceleratorType == "gpu") {
        acceleratorType = "<tr><th style='width: 50%;'>Accelerator</th><td><b><span style='color: red; '>GPU (" + acceleratorModel + ")</span></b></td></tr>"
      } else {
        acceleratorType = "<tr><th style='width: 50%;'>Accelerator</th><td><b><span style='color: black;'>none</span></b></td></tr>"
      }

      var html =
        "<font size=3>" +
        "<table style='width:80%; text-align:left; margin-top:20px; margin-left:10px; table-layout: auto;'>" +
        "<tr><th style='width: 50%;'>[#" + (i + 1).toString() + "] NodeGroup Name</th><td><b><span style='color: black; '>" + createInfraReq.nodeGroups[i].name + " (" + createInfraReq.nodeGroups[i].nodeGroupSize + " node(s))</span></b></td></tr>" +
        costPerHour +
        "<tr><th style='width: 50%;'>Spec</th><td><b><span style='color: blue; '>" + createInfraReq.nodeGroups[i].specId + "</span></b></td></tr>" +
        "<tr><th style='width: 50%;'>vCPU</th><td><b>" + recommendedSpecList[i].vCPU + "</b></td></tr>" +
        "<tr><th style='width: 50%;'>Mem(GiB)</th><td><b>" + recommendedSpecList[i].memoryGiB + "</b></td></tr>" +
        acceleratorType +
        "<tr><th style='width: 50%;'>RootDisk(GB)</th><td><b>" + (createInfraReq.nodeGroups[i].rootDiskSize > 0 ? createInfraReq.nodeGroups[i].rootDiskSize : 'Default') + " (type: " + createInfraReq.nodeGroups[i].rootDiskType + ")</b></td></tr>" +
        "<tr><th style='width: 50%;'>Selected Image</th><td><b><span style='color: green; '>" + createInfraReq.nodeGroups[i].imageId + "</span></b></td></tr>" +

        ((createInfraReq.nodeGroups[i].label && Object.keys(createInfraReq.nodeGroups[i].label).length > 0) ?
          "<tr><th style='width: 50%;'>Labels</th><td><b><span style='color: purple; '>" +
          Object.entries(createInfraReq.nodeGroups[i].label).map(([key, value]) =>
            `${key}=${value}`
          ).join(", ") +
          "</span></b></td></tr>" : "") +

        "</table>" +
        "<hr>"
        ;

      nodeGroupReqString = nodeGroupReqString + html;
    }

    var costDetailsHtml =
      "<table style='width:80%; text-align:left; margin-top:20px; margin-left:10px; table-layout: auto;'>" +
      "<tr><th><b>Usage Period</b></th><td><b>Estimated Cost</b></td></tr>" +
      "<tr><th>Hourly</th><td><span style='color: red; '><b>$" + totalCost.toFixed(4) + "</span></td></tr>" +
      "<tr><th>Daily</th><td><span style='color: red; '><b>$" + (totalCost * 24).toFixed(4) + "</span></td></tr>" +
      "<tr><th>Monthly</th><td><span style='color: red; '><b>$" + (totalCost * 24 * 31).toFixed(4) + "</span></td></tr>" +
      "</table> <br>(Do not rely on this estimated cost. It is just an estimation using spec price.)<br>";

    // Step 1: Infra Name Input
    Swal.fire({
      title: "Enter the name of the Infra you wish to create",
      input: "text",
      inputAttributes: {
        autocapitalize: "off",
      },
      inputValue: createInfraReq.name,
      showCancelButton: true,
      confirmButtonText: "Next: Review Configuration",
    }).then((result) => {
      if (result.value) {
        createInfraReq.name = result.value;
        
        // Step 2: Start Infra Review process
        reviewInfraConfiguration(createInfraReq, hostname, port, username, password, namespace, url, totalCost, totalNodeScale, costDetailsHtml, nodeGroupReqString);
      }
    });
  } else {
    console.log(
      "To create a Infra, Nodes should be configured! Click the Map to add a config for Node request."
    );
    errorAlert("Please configure Infra first\n(Click the Map to add Nodes)");
  }
}
window.createInfra = createInfra;
window.proceedWithBuildAgnosticImage = proceedWithBuildAgnosticImage;

// Function to check if K8s node image designation is needed
async function checkK8sNodeImageDesignation(providerName, hostname, port, username, password) {
  try {
    const url = `http://${hostname}:${port}/tumblebug/checkK8sNodeImageDesignation?providerName=${providerName}`;
    
    const response = await axios.get(url, {
      auth: {
        username: username,
        password: password
      },
      headers: {
        'accept': 'application/json'
      }
    });
    
    // Return true if image designation is needed, false if should use "default"
    return response.data?.result === "true";
  } catch (error) {
    console.warn("Failed to check K8s node image designation:", error);
    // Default to true (use provided imageId) if check fails
    return true;
  }
}

// K8s Cluster creation function (supports single and multi-cluster creation)
function createK8sCluster() {
  if (nodeGroupRequestFromSpecList.length < 1) {
    errorAlert("Please configure at least one NodeGroup to create K8s Cluster(s)");
    return;
  }

  const isMultiCluster = nodeGroupRequestFromSpecList.length > 1;
  const nodeGroup = nodeGroupRequestFromSpecList[0];
  const spec = recommendedSpecList[0];
  
  // Generate random names for K8s resources
  const k8sClusterRandomName = "k8s-" + generateRandomString();
  const k8sNodeGroupRandomName = "ng-" + generateRandomString();
  
  const hostname = configHostname;
  const port = configPort;
  const username = configUsername;
  const password = configPassword;
  const namespace = configNamespace;

  // For multi-cluster, use namePrefix approach (simplified dialog)
  if (isMultiCluster) {
    // Build cluster configuration summary
    const clusterSummary = nodeGroupRequestFromSpecList.map((sg, idx) => {
      const sp = recommendedSpecList[idx];
      return `<tr>
        <td>${idx + 1}</td>
        <td>${sp?.providerName || 'Unknown'}</td>
        <td>${sp?.regionName || 'Unknown'}</td>
        <td style="font-size: 0.8em;">${sp?.cspSpecName || 'Unknown'}</td>
      </tr>`;
    }).join('');

    Swal.fire({
      title: `Create ${nodeGroupRequestFromSpecList.length} K8s Clusters`,
      html: `
        <div style="text-align: left; padding: 15px;">
          <div style="margin-bottom: 15px;">
            <label style="font-weight: bold;">Cluster Name Prefix:</label><br>
            <input type="text" id="k8sNamePrefix" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" 
                   value="${k8sClusterRandomName}" placeholder="Enter name prefix">
            <div style="font-size: 0.8em; color: #666; margin-top: 5px;">
              Clusters will be named: {prefix}-{csp}-{number} (e.g., ${k8sClusterRandomName}-aws-1)
            </div>
          </div>
          <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin-bottom: 15px; max-height: 200px; overflow-y: auto;">
            <strong>Clusters to create (${nodeGroupRequestFromSpecList.length}):</strong>
            <table style="width: 100%; font-size: 0.85em; margin-top: 8px;">
              <tr style="background: #e9ecef;"><th>#</th><th>Provider</th><th>Region</th><th>Spec</th></tr>
              ${clusterSummary}
            </table>
          </div>
          <div style="font-size: 0.9em; color: #666;">
            Note: All clusters will be created in parallel. K8s versions will use defaults for each provider.
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: `Create ${nodeGroupRequestFromSpecList.length} Clusters`,
      cancelButtonText: "Cancel",
      preConfirm: () => {
        const namePrefix = document.getElementById('k8sNamePrefix').value.trim();
        if (!namePrefix) {
          Swal.showValidationMessage('Please enter name prefix');
          return false;
        }
        return { namePrefix };
      }
    }).then((result) => {
      if (result.isConfirmed) {
        const { namePrefix } = result.value;
        
        // Build multi-cluster request
        const clusters = nodeGroupRequestFromSpecList.map((sg, idx) => {
          const clusterReq = {
            imageId: sg.imageId || "default",
            specId: sg.specId
          };
          if (sg.rootDiskType) clusterReq.rootDiskType = sg.rootDiskType;
          if (sg.rootDiskSize) clusterReq.rootDiskSize = sg.rootDiskSize;
          return clusterReq;
        });

        const multiClusterReq = {
          namePrefix: namePrefix,
          clusters: clusters
        };

        // Do not use skipVersionCheck without explicit version - let CB-TB use default versions per CSP
        const url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/k8sMultiClusterDynamic`;
        const taskId = addSpinnerTask(`Create ${clusters.length} K8s Clusters`);

        axios.post(url, multiClusterReq, {
          auth: { username, password },
          headers: { 'Content-Type': 'application/json' }
        }).then(function (response) {
          removeSpinnerTask(taskId);
          const createdClusters = response.data?.clusters || [];
          const failedClusters = response.data?.failedClusters || [];
          const successCount = createdClusters.length;
          const failedCount = failedClusters.length;
          const totalCount = clusters.length;
          
          const clusterList = createdClusters.length > 0 
            ? createdClusters.map(c => `<li style="color: #28a745;">\u2713 ${c.name || c.id || 'Unknown'} (${c.connectionName || 'N/A'})</li>`).join('')
            : '<li>No clusters created</li>';

          // Build failed clusters list with details
          const failedList = failedClusters.length > 0
            ? failedClusters.map(f => `<li style="color: #dc3545;">\u2717 ${f.name || 'Unknown'} (${f.connectionName || 'N/A'})<br><small style="color: #888; margin-left: 20px;">${f.error || 'Unknown error'}</small></li>`).join('')
            : '';

          // Check if partial success (HTTP 207)
          const isPartialSuccess = response.status === 207;
          const title = isPartialSuccess ? "Partial Success" : 
                       (successCount === totalCount && successCount > 0 ? "All Clusters Created!" : "Cluster Creation Failed");
          const icon = isPartialSuccess ? "warning" :
                      (successCount === totalCount && successCount > 0 ? "success" : "error");

          Swal.fire({
            title: title,
            html: `
              <div style="text-align: left;">
                <p><strong>Created:</strong> ${successCount} / ${totalCount}</p>
                <ul style="max-height: 150px; overflow-y: auto; list-style: none; padding-left: 0;">${clusterList}</ul>
                ${failedCount > 0 ? `
                  <p style="margin-top: 15px;"><strong>Failed:</strong> ${failedCount}</p>
                  <ul style="max-height: 150px; overflow-y: auto; list-style: none; padding-left: 0;">${failedList}</ul>
                ` : ''}
              </div>
            `,
            icon: icon,
            confirmButtonText: "OK"
          });
        }).catch(function (error) {
          removeSpinnerTask(taskId);
          console.error("Multi-cluster creation failed:", error);
          
          let errorMessage = "Failed to create K8s Clusters";
          if (error.response?.data) {
            errorMessage += `\n${error.response.data.message || error.response.data.error || ''}`;
          }
          errorAlert(errorMessage);
        });
      }
    });
    return;
  }

  // Single cluster creation (original flow)
  // First, get available K8s versions
  const versionUrl = `http://${hostname}:${port}/tumblebug/availableK8sVersion?providerName=${spec.providerName}&regionName=${spec.regionName}`;
  
  const versionTaskId = addSpinnerTask("getK8sVersions");
  
  axios.get(versionUrl, {
    auth: {
      username: username,
      password: password
    }
  }).then(function (versionResponse) {
    removeSpinnerTask(versionTaskId);
    
    const availableVersions = versionResponse.data || [];
    console.log("Available K8s versions:", availableVersions);
    
    // Create version options
    let versionOptions = '<option value="">-- Select K8s Version --</option>';
    if (availableVersions.length > 0) {
      versionOptions += availableVersions.map(version => 
        `<option value="${version.id}">${version.name} (${version.id})</option>`
      ).join('');
    }
    versionOptions += '<option value="custom">-- Custom Version --</option>';

    // Create confirmation dialog with version selection
    Swal.fire({
      title: "Create Kubernetes Cluster",
      html: `
        <div style="text-align: left; padding: 15px;">
          <div style="margin-bottom: 15px;">
            <label style="font-weight: bold;">Cluster Name:</label><br>
            <input type="text" id="k8sClusterName" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" 
                   value="${k8sClusterRandomName}" placeholder="Enter cluster name">
          </div>
          <div style="margin-bottom: 15px;">
            <label style="font-weight: bold;">Node Group Name:</label><br>
            <input type="text" id="k8sNodeGroupName" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" 
                   value="${k8sNodeGroupRandomName}" placeholder="Enter node group name">
          </div>
          <div style="margin-bottom: 15px;">
            <label style="font-weight: bold;">Kubernetes Version:</label><br>
            <select id="k8sVersionSelect" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 8px;">
              ${versionOptions}
            </select>
            <input type="text" id="k8sCustomVersion" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; display: none;" 
                   placeholder="Enter custom K8s version (e.g., 1.30.12-gke.1086000)">
            <div style="font-size: 0.8em; color: #666; margin-top: 5px;">
              ${availableVersions.length > 0 ? 'Select from available versions or choose custom to enter manually' : 'No versions available, please enter custom version'}
            </div>
          </div>
          <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
            <strong>Configuration:</strong><br>
            <small>Provider: ${spec.providerName}</small><br>
            <small>Region: ${spec.regionName}</small><br>
            <small>Spec: ${spec.cspSpecName}</small><br>
            <small>Image: ${nodeGroup.imageId}</small>
          </div>
          <div style="font-size: 0.9em; color: #666;">
            Note: This will create a new Kubernetes cluster using the configured NodeGroup settings.
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Create K8s Cluster",
      cancelButtonText: "Cancel",
      didOpen: () => {
        // Handle version selection change
        const versionSelect = document.getElementById('k8sVersionSelect');
        const customVersionInput = document.getElementById('k8sCustomVersion');
        
        versionSelect.addEventListener('change', function() {
          if (this.value === 'custom') {
            customVersionInput.style.display = 'block';
            customVersionInput.focus();
          } else {
            customVersionInput.style.display = 'none';
            customVersionInput.value = '';
          }
        });
      },
      preConfirm: () => {
        const clusterName = document.getElementById('k8sClusterName').value.trim();
        const nodeGroupName = document.getElementById('k8sNodeGroupName').value.trim();
        const selectedVersion = document.getElementById('k8sVersionSelect').value;
        const customVersion = document.getElementById('k8sCustomVersion').value.trim();
        
        if (!clusterName) {
          Swal.showValidationMessage('Please enter cluster name');
          return false;
        }
        if (!nodeGroupName) {
          Swal.showValidationMessage('Please enter node group name');
          return false;
        }
        
        let k8sVersion = '';
        if (selectedVersion === 'custom') {
          if (!customVersion) {
            Swal.showValidationMessage('Please enter custom K8s version');
            return false;
          }
          k8sVersion = customVersion;
        } else if (selectedVersion) {
          k8sVersion = selectedVersion;
        }
        // If no version selected, k8sVersion will be empty (default behavior)
        
        return { clusterName, nodeGroupName, k8sVersion };
      }
    }).then((result) => {
      let taskId; // Declare taskId in higher scope for error handling
      
      if (result.isConfirmed) {
        const { clusterName, nodeGroupName, k8sVersion } = result.value;
        
        // Check if image designation is needed
        taskId = addSpinnerTask("Checking image requirements");
        
        checkK8sNodeImageDesignation(spec.providerName, hostname, port, username, password)
          .then(imageDesignationNeeded => {
            removeSpinnerTask(taskId);
            
            // Create K8s cluster request body
            const k8sClusterReq = {
              imageId: imageDesignationNeeded ? (nodeGroup.imageId || "default") : "default",
              specId: nodeGroup.specId,
              name: clusterName,
              nodeGroupName: nodeGroupName
            };
            
            // Add version if specified
            if (k8sVersion) {
              k8sClusterReq.version = k8sVersion;
            }
            
            // Add rootDiskType and rootDiskSize if available
            if (nodeGroup.rootDiskType) {
              k8sClusterReq.rootDiskType = nodeGroup.rootDiskType;
            }
            if (nodeGroup.rootDiskSize) {
              k8sClusterReq.rootDiskSize = nodeGroup.rootDiskSize;
            }

            // Check if using custom version (not from available versions list)
            const selectedVersion = document.getElementById('k8sVersionSelect').value;
            const isCustomVersion = selectedVersion === 'custom';
            
            // Add skipVersionCheck parameter for custom versions
            const skipVersionParam = isCustomVersion ? '?skipVersionCheck=true' : '';
            const url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/k8sClusterDynamic${skipVersionParam}`;
            
            // Debug: uncomment if K8s creation debugging needed
            // console.log("Creating K8s Cluster:", k8sClusterReq);
            // console.log("Image designation needed:", imageDesignationNeeded);
            // console.log("Using custom version:", isCustomVersion);
            
            taskId = addSpinnerTask("Create K8s "+k8sClusterReq.name);
            
            axios.post(url, k8sClusterReq, {
          auth: {
            username: username,
            password: password
          },
          headers: {
            'Content-Type': 'application/json'
          }
        }).then(function (response) {
          removeSpinnerTask(taskId);
          // Debug: uncomment if K8s creation response debugging needed
          // console.log("K8s Cluster creation response:", response.data);
          
          Swal.fire({
            title: "K8s Cluster Created Successfully!",
            html: `
              <div style="text-align: left;">
                <p><strong>Cluster ID:</strong> ${response.data?.id || 'Unknown'}</p>
                <p><strong>Status:</strong> ${response.data?.status || 'Unknown'}</p>
                <p><strong>Provider:</strong> ${response.data?.connectionName || 'Unknown'}</p>
                ${k8sVersion ? `<p><strong>Version:</strong> ${k8sVersion}</p>` : ''}
              </div>
            `,
            icon: "success",
            confirmButtonText: "OK"
          });
          
          // K8s cluster created successfully, no additional refresh needed
          
        }).catch(function (error) {
          removeSpinnerTask(taskId);
          console.error("K8s Cluster creation failed:", error);
          
          let errorMessage = "Failed to create K8s Cluster";
          if (error.response && error.response.data) {
            errorMessage += `\n${error.response.data.message || error.response.data.error || ''}`;
          }
          
          errorAlert(errorMessage);
        });
          })
          .catch(function (error) {
            removeSpinnerTask(taskId);
            console.error("Failed to check image designation:", error);
            errorAlert("Failed to check image requirements. Please try again.");
          });
      }
    }).catch(function (error) {
      // Handle any unexpected errors in the Swal dialog
      console.error("K8s Cluster creation dialog error:", error);
      // Clean up spinner if it was started
      if (taskId) {
        removeSpinnerTask(taskId);
      }
    });
    
  }).catch(function (error) {
    removeSpinnerTask(versionTaskId);
    console.error("Failed to get K8s versions:", error);
    
    // Extract error message from server response
    let errorMessage = 'Unknown error occurred';
    if (error.response && error.response.data && error.response.data.message) {
      errorMessage = error.response.data.message;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    // Show error message and stop execution
    errorAlert(`Failed to get available Kubernetes versions.\n\nError: ${errorMessage}\n\nProvider: ${spec.providerName}\nRegion: ${spec.regionName}`);
    return; // Stop execution
  });
}
window.createK8sCluster = createK8sCluster;

// Add NodeGroup to existing K8s Cluster function (supports single and multi-NodeGroup)
function addNodeGroupToK8sCluster() {
  if (nodeGroupRequestFromSpecList.length < 1) {
    errorAlert("Please configure at least one NodeGroup to add NodeGroup(s) to K8s Cluster");
    return;
  }

  const hostname = configHostname;
  const port = configPort;
  const username = configUsername;
  const password = configPassword;
  const namespace = configNamespace;

  // First, get list of existing K8s clusters
  const listUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/k8sCluster`;
  const listTaskId = addSpinnerTask("listK8sClusters");
  
  axios.get(listUrl, { auth: { username, password } }).then(function (response) {
    removeSpinnerTask(listTaskId);
    
    const clusters = response.data?.cluster || response.data?.K8sClusterInfo || [];
    
    if (clusters.length === 0) {
      errorAlert("No K8s clusters found. Please create a K8s cluster first.");
      return;
    }

    const isMultiNodeGroup = nodeGroupRequestFromSpecList.length > 1;

    if (isMultiNodeGroup) {
      // Multi-NodeGroup: Each NodeGroup maps to a compatible cluster
      showMultiNodeGroupDialog(clusters, hostname, port, username, password, namespace);
    } else {
      // Single NodeGroup (original flow)
      showSingleNodeGroupDialog(clusters, hostname, port, username, password, namespace);
    }
  }).catch(function (error) {
    removeSpinnerTask(listTaskId);
    console.error("Failed to get K8s cluster list:", error);
    errorAlert("Failed to get K8s cluster list");
  });
}

// Single NodeGroup dialog (original behavior)
function showSingleNodeGroupDialog(clusters, hostname, port, username, password, namespace) {
  const nodeGroup = nodeGroupRequestFromSpecList[0];
  const spec = recommendedSpecList[0];
  const k8sNodeGroupRandomName = "ng-" + generateRandomString();
  const nodeGroupProvider = spec.providerName;
  const nodeGroupRegion = spec.regionName;
    
    const clusterOptions = clusters.map(cluster => {
      // Use cluster-level status for determining availability
      const clusterStatus = cluster?.status || 'Unknown';
      const isActive = clusterStatus === 'Active';
      
      // Check if provider and region match
      const clusterProvider = cluster?.connectionConfig?.providerName || '';
      const clusterRegion = cluster?.connectionConfig?.regionDetail?.regionId || '';
      
      const providerRegionMatch = (clusterProvider === nodeGroupProvider && clusterRegion === nodeGroupRegion);
      
      // Enable only if cluster is Active AND provider/region matches
      const isSelectable = isActive && providerRegionMatch;
      const disabled = !isSelectable ? 'disabled' : '';
      
      // Set colors based on status and compatibility
      let statusColor = '#6c757d'; // Default gray for disabled
      let statusText = clusterStatus;
      
      if (isActive && providerRegionMatch) {
        statusColor = '#28a745'; // Green for selectable
        statusText = `${clusterStatus} ✓`;
      } else if (isActive && !providerRegionMatch) {
        statusColor = '#ffc107'; // Yellow for active but incompatible
        statusText = `${clusterStatus} (Provider/Region mismatch)`;
      }
      
      const clusterId = cluster?.id || '';
      const clusterName = cluster?.name || 'Unknown';
      const connectionName = cluster?.connectionName || 'Unknown';
      
      return `<option value="${clusterId}" ${disabled} style="color: ${statusColor};">
        ${clusterName} (${connectionName}) - ${statusText}
      </option>`;
    }).join('');
    
    // Check if there are any selectable clusters
    const selectableClusters = clusters.filter(cluster => {
      const clusterStatus = cluster?.status || 'Unknown';
      const isActive = clusterStatus === 'Active';
      const clusterProvider = cluster?.connectionConfig?.providerName || '';
      const clusterRegion = cluster?.connectionConfig?.regionDetail?.regionId || '';
      const providerRegionMatch = (clusterProvider === nodeGroupProvider && clusterRegion === nodeGroupRegion);
      return isActive && providerRegionMatch;
    });
    
    if (selectableClusters.length === 0) {
      errorAlert(`No compatible K8s clusters found.\n\nRequired:\n- Status: Active\n- Provider: ${nodeGroupProvider}\n- Region: ${nodeGroupRegion}\n\nPlease create a compatible K8s cluster first or check existing cluster configurations.`);
      return;
    }
    
    Swal.fire({
      title: "Add NodeGroup to K8s Cluster",
      html: `
        <div style="text-align: left; padding: 15px;">
          <div style="margin-bottom: 15px;">
            <label style="font-weight: bold;">Select K8s Cluster:</label><br>
            <select id="k8sClusterSelect" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
              <option value="">-- Select a cluster --</option>
              ${clusterOptions}
            </select>
            <div style="font-size: 0.8em; color: #666; margin-top: 5px;">
              Note: Only Active clusters with matching Provider (${nodeGroupProvider}) and Region (${nodeGroupRegion}) can be selected
            </div>
          </div>
          <div style="margin-bottom: 15px;">
            <label style="font-weight: bold;">Node Group Name:</label><br>
            <input type="text" id="newNodeGroupName" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" 
                   value="${k8sNodeGroupRandomName}" placeholder="Enter node group name">
          </div>
          <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
            <strong>NodeGroup Configuration:</strong><br>
            <small>Provider: ${spec.providerName}</small><br>
            <small>Region: ${spec.regionName}</small><br>
            <small>Spec: ${spec.cspSpecName}</small><br>
            <small>Image: ${nodeGroup.imageId}</small>
          </div>
          <div style="font-size: 0.9em; color: #666;">
            Note: This will add a new NodeGroup to the selected active K8s cluster.
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Add NodeGroup",
      cancelButtonText: "Cancel",
      preConfirm: () => {
        const clusterId = document.getElementById('k8sClusterSelect').value;
        const nodeGroupName = document.getElementById('newNodeGroupName').value.trim();
        
        if (!clusterId) {
          Swal.showValidationMessage('Please select a K8s cluster');
          return false;
        }
        
        // Find selected cluster and check if it's Active
        const selectedCluster = clusters.find(cluster => cluster?.id === clusterId);
        if (!selectedCluster) {
          Swal.showValidationMessage('Selected cluster not found');
          return false;
        }
        
        // Check cluster status - only Active clusters can have NodeGroups added
        const clusterStatus = selectedCluster?.status || 'Unknown';
        if (clusterStatus !== 'Active') {
          Swal.showValidationMessage(`Cluster is not Active (current status: ${clusterStatus}). Please wait for cluster to become Active.`);
          return false;
        }
        
        if (!nodeGroupName) {
          Swal.showValidationMessage('Please enter node group name');
          return false;
        }
        
        return { clusterId, nodeGroupName };
      }
    }).then((result) => {
      let taskId; // Declare taskId in higher scope for error handling
      
      if (result.isConfirmed) {
        const { clusterId, nodeGroupName } = result.value;
        
        // Check if image designation is needed
        taskId = addSpinnerTask("Checking image requirements");
        
        checkK8sNodeImageDesignation(spec.providerName, hostname, port, username, password)
          .then(imageDesignationNeeded => {
            removeSpinnerTask(taskId);
            
            // Create NodeGroup request body
            const nodeGroupReq = {
              imageId: imageDesignationNeeded ? (nodeGroup.imageId || "default") : "default",
              specId: nodeGroup.specId,
              name: nodeGroupName
            };
            
            // Add rootDiskType and rootDiskSize if available
            if (nodeGroup.rootDiskType) {
              nodeGroupReq.rootDiskType = nodeGroup.rootDiskType;
            }
            if (nodeGroup.rootDiskSize) {
              nodeGroupReq.rootDiskSize = nodeGroup.rootDiskSize;
            }

            const url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/k8sCluster/${clusterId}/k8sNodeGroupDynamic`;
            
            console.log("Adding NodeGroup to K8s Cluster:", nodeGroupReq);
            console.log("Image designation needed:", imageDesignationNeeded);

            taskId = addSpinnerTask("Add NodeGroup " + nodeGroupReq.name);

            axios.post(url, nodeGroupReq, {
          auth: {
            username: username,
            password: password
          },
          headers: {
            'Content-Type': 'application/json'
          }
        }).then(function (response) {
          removeSpinnerTask(taskId);
          console.log("NodeGroup addition response:", response.data);
          
          // Safely extract response data with fallbacks
          const clusterId = response.data?.id || 'Unknown';
          const clusterStatus = response.data?.status || 'Unknown';
          
          Swal.fire({
            title: "NodeGroup Added Successfully!",
            html: `
              <div style="text-align: left;">
                <p><strong>Cluster ID:</strong> ${clusterId}</p>
                <p><strong>NodeGroup:</strong> ${nodeGroupName}</p>
                <p><strong>Status:</strong> ${clusterStatus}</p>
              </div>
            `,
            icon: "success",
            confirmButtonText: "OK"
          });
          
          // NodeGroup added successfully, no additional refresh needed
          
        }).catch(function (error) {
          removeSpinnerTask(taskId);
          console.error("NodeGroup addition failed:", error);
          
          let errorMessage = "Failed to add NodeGroup to K8s Cluster";
          if (error.response && error.response.data) {
            errorMessage += `\n${error.response.data.message || error.response.data.error || ''}`;
          }
          
          errorAlert(errorMessage);
        });
          })
          .catch(function (error) {
            removeSpinnerTask(taskId);
            console.error("Failed to check image designation:", error);
            errorAlert("Failed to check image requirements. Please try again.");
          });
      }
    }).catch(function (error) {
      // Handle any unexpected errors in the NodeGroup dialog
      console.error("NodeGroup addition dialog error:", error);
    });
}

// Multi-NodeGroup dialog: maps each NodeGroup to compatible clusters
function showMultiNodeGroupDialog(clusters, hostname, port, username, password, namespace) {
  const nodeGroupPrefix = "ng-" + generateRandomString();
  
  // Build mapping of NodeGroups to compatible clusters
  const nodeGroupMappings = nodeGroupRequestFromSpecList.map((sg, idx) => {
    const spec = recommendedSpecList[idx];
    const provider = spec?.providerName || '';
    const region = spec?.regionName || '';
    
    // Find compatible clusters (Active + matching provider/region)
    const compatibleClusters = clusters.filter(c => {
      const cProvider = c?.connectionConfig?.providerName || '';
      const cRegion = c?.connectionConfig?.regionDetail?.regionId || '';
      return c?.status === 'Active' && cProvider === provider && cRegion === region;
    });
    
    return { idx, sg, spec, provider, region, compatibleClusters };
  });

  // Check if any NodeGroup has compatible clusters
  const hasAnyCompatible = nodeGroupMappings.some(m => m.compatibleClusters.length > 0);
  if (!hasAnyCompatible) {
    errorAlert("No compatible K8s clusters found for any NodeGroup configuration.\n\nEnsure you have Active clusters matching the Provider/Region of your NodeGroups.");
    return;
  }

  // Build HTML for cluster selection per NodeGroup
  const mappingRows = nodeGroupMappings.map(m => {
    const clusterOpts = m.compatibleClusters.length > 0
      ? m.compatibleClusters.map(c => `<option value="${c.id}">${c.name}</option>`).join('')
      : '<option value="" disabled>No compatible cluster</option>';
    
    return `<tr>
      <td>${m.idx + 1}</td>
      <td>${m.provider}</td>
      <td style="font-size:0.8em;">${m.region}</td>
      <td><select id="clusterSelect_${m.idx}" style="width:100%;padding:4px;font-size:0.85em;" ${m.compatibleClusters.length === 0 ? 'disabled' : ''}>
        ${clusterOpts}
      </select></td>
    </tr>`;
  }).join('');

  Swal.fire({
    title: `Add ${nodeGroupRequestFromSpecList.length} NodeGroups`,
    html: `
      <div style="text-align: left; padding: 10px;">
        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold;">NodeGroup Name Prefix:</label><br>
          <input type="text" id="ngNamePrefix" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" 
                 value="${nodeGroupPrefix}" placeholder="Enter prefix">
        </div>
        <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; max-height: 250px; overflow-y: auto;">
          <strong>NodeGroup → Cluster Mapping:</strong>
          <table style="width: 100%; font-size: 0.85em; margin-top: 8px;">
            <tr style="background: #e9ecef;"><th>#</th><th>Provider</th><th>Region</th><th>Target Cluster</th></tr>
            ${mappingRows}
          </table>
        </div>
        <div style="font-size: 0.85em; color: #666; margin-top: 10px;">
          Each NodeGroup will be added to its selected cluster sequentially.
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: `Add ${nodeGroupRequestFromSpecList.length} NodeGroups`,
    cancelButtonText: "Cancel",
    preConfirm: () => {
      const prefix = document.getElementById('ngNamePrefix').value.trim();
      if (!prefix) {
        Swal.showValidationMessage('Please enter name prefix');
        return false;
      }
      
      // Collect cluster selections
      const selections = [];
      for (let i = 0; i < nodeGroupRequestFromSpecList.length; i++) {
        const sel = document.getElementById(`clusterSelect_${i}`);
        if (sel && sel.value) {
          selections.push({ idx: i, clusterId: sel.value });
        }
      }
      
      if (selections.length === 0) {
        Swal.showValidationMessage('No valid cluster selections');
        return false;
      }
      
      return { prefix, selections };
    }
  }).then((result) => {
    if (result.isConfirmed) {
      const { prefix, selections } = result.value;
      executeMultiNodeGroupAddition(selections, prefix, hostname, port, username, password, namespace);
    }
  });
}

// Execute multiple NodeGroup additions sequentially
async function executeMultiNodeGroupAddition(selections, prefix, hostname, port, username, password, namespace) {
  const results = [];
  const taskId = addSpinnerTask(`Add ${selections.length} NodeGroups`);

  try {
    for (const sel of selections) {
      const sg = nodeGroupRequestFromSpecList[sel.idx];
      const ngName = `${prefix}-${sel.idx + 1}`;
      
      const nodeGroupReq = {
        imageId: sg.imageId || "default",
        specId: sg.specId,
        name: ngName
      };
      if (sg.rootDiskType) nodeGroupReq.rootDiskType = sg.rootDiskType;
      if (sg.rootDiskSize) nodeGroupReq.rootDiskSize = sg.rootDiskSize;

      const url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/k8sCluster/${sel.clusterId}/k8sNodeGroupDynamic`;
      
      try {
        await axios.post(url, nodeGroupReq, {
          auth: { username, password },
          headers: { 'Content-Type': 'application/json' }
        });
        results.push({ ngName, clusterId: sel.clusterId, success: true });
      } catch (error) {
        console.error(`Failed to add NodeGroup ${ngName}:`, error);
        results.push({ ngName, clusterId: sel.clusterId, success: false, error: error.response?.data?.message || error.message });
      }
    }
  } finally {
    removeSpinnerTask(taskId);
  }

  const successCount = results.filter(r => r.success).length;
  const resultList = results.map(r => 
    `<li style="color: ${r.success ? '#28a745' : '#dc3545'};">${r.ngName} → ${r.clusterId}: ${r.success ? '✓' : '✗ ' + (r.error || 'Failed')}</li>`
  ).join('');

  Swal.fire({
    title: successCount === results.length ? "All NodeGroups Added!" : "NodeGroups Added (Partial)",
    html: `
      <div style="text-align: left;">
        <p><strong>Added:</strong> ${successCount} / ${results.length}</p>
        <ul style="max-height: 150px; overflow-y: auto; font-size: 0.9em;">${resultList}</ul>
      </div>
    `,
    icon: successCount === results.length ? "success" : "warning",
    confirmButtonText: "OK"
  });
}

window.addNodeGroupToK8sCluster = addNodeGroupToK8sCluster;

// Function to set Kubernetes-appropriate configuration values
function setKubernetesConfig() {
  // Set recommended Kubernetes values
  document.getElementById("minVCPU").value = "4";
  document.getElementById("minRAM").value = "16";
  document.getElementById("diskSize").value = "100";
  
  // Get selected providers for display
  var selectedProviders = getSelectedProviders();
  var allCheckbox = document.getElementById("provider-all");
  var providerInfo = "";
  
  if (allCheckbox && allCheckbox.checked) {
    providerInfo = "All Providers";
  } else if (selectedProviders.length > 0) {
    providerInfo = selectedProviders.map(p => p.toUpperCase()).join(", ");
  } else {
    providerInfo = "No Providers Selected";
  }
  
  // Show comprehensive Kubernetes information
  Swal.fire({
    title: "⚙️ Kubernetes Configuration Guide",
    html: `
      <div style="text-align: left; font-size: 13px; line-height: 1.4;">
        <div style="background: #fff3cd; padding: 8px; border-radius: 4px; margin-bottom: 12px; border-left: 4px solid #ffc107;">
          <strong>⚠️ Notice:</strong> Managed Kubernetes Provisioning is under development and may have stability issues.
        </div>
        
        <div style="background: #d1ecf1; padding: 8px; border-radius: 4px; margin-bottom: 12px; border-left: 4px solid #17a2b8;">
          <strong>✅ Configuration Set:</strong> Min vCPU: 4, Min Memory: 16GB, Disk: 100GB<br>
          <strong>🏢 Selected Providers:</strong> ${providerInfo}
        </div>
        
        
        <div style="margin-bottom: 12px;">
          <strong style="color: #28a745;">Node Group created with cluster:</strong><br>
          🟦 Azure, 🟩 GCP, 🟫 IBM, 🟧 NHN
        </div>
        
        <div style="margin-bottom: 15px;">
          <strong style="color: #dc3545;">Node Group added separately after cluster creation:</strong><br>
          🟫 AWS, 🟨 Alibaba, 🟥 Tencent
        </div>

        <details style="margin-bottom: 10px;">
          <summary style="cursor: pointer; font-weight: bold; color: #495057; margin-bottom: 8px;">
            📖 CSP-specific Details & Examples
          </summary>
          <div style="margin-left: 15px; margin-top: 8px; font-size: 12px;">
            
            <div style="margin-bottom: 12px;">
              <strong>🟫 AWS</strong><br>
              • Prerequisites: awscli + <code>aws configure</code><br>
              • Cluster creates without NodeGroup, add separately after status becomes <code>Active</code><br>
              • Example: <code>{"imageId": "default", "specId": "aws+ap-northeast-2+t3a.xlarge"}</code>
            </div>

            <div style="margin-bottom: 12px;">
              <strong>🟨 Alibaba Cloud</strong><br>
              • Use Kubernetes-optimized images<br>
              • Example: <code>{"imageId": "aliyun_3_x64_20G_container_optimized_*.vhd", "specId": "alibaba+ap-northeast-2+ecs.g6e.xlarge"}</code>
            </div>

            <div style="margin-bottom: 12px;">
              <strong>🟦 Azure</strong><br>
              • NodeGroup name must follow <code>^[a-z][a-z0-9]*$</code> regex<br>
              • Example: <code>{"imageId": "default", "specId": "azure+koreacentral+standard_b4ms"}</code>
            </div>

            <div style="margin-bottom: 12px;">
              <strong>🟩 GCP</strong><br>
              • Prerequisites: <code>gcloud</code> CLI + <code>google-cloud-sdk-gke-gcloud-auth-plugin</code><br>
              • Run <code>gcloud auth login</code> first<br>
              • Example: <code>{"imageId": "default", "specId": "gcp+asia-east1+e2-standard-4"}</code>
            </div>

            <div style="margin-bottom: 12px;">
              <strong>🟧 NHN Cloud</strong><br>
              • Use Container-optimized images<br>
              • Example: <code>{"imageId": "efe7f58f-*", "specId": "nhn+kr1+m2.c4m8"}</code>
            </div>

            <div style="margin-bottom: 12px;">
              <strong>🟥 Tencent Cloud</strong><br>
              • ap-hongkong region has kubeconfig access limitations<br>
              • NodeGroup creation enables kubeconfig usage<br>
              • Example: <code>{"imageId": "img-22trbn9x", "specId": "tencent+ap-seoul+s5.medium4"}</code>
            </div>
          </div>
        </details>
      </div>
    `,
    icon: "info",
    confirmButtonText: "OK",
    confirmButtonColor: "#007bff",
    width: "700px"
  });
}
window.setKubernetesConfig = setKubernetesConfig;

// Workload type management - store previous configurations
let workloadConfigurations = {
  vmInfra: {
    minVCPU: "1",
    minRAM: "0.5",
    diskSize: "",
    isActive: true
  },
  k8sInfra: {
    minVCPU: "4",
    minRAM: "16",
    diskSize: "100",
    isActive: false
  }
};

// Store K8s cluster information
let k8sClusterInfo = null;

// Global variable to track current workload type
let currentWorkloadType = 'node'; // default to VM/Node mode (not k8s)

// Helper function to check current workload type
function getCurrentWorkloadType() {
  // First try to get from radio buttons
  const nodeModeInput = document.getElementById("nodeMode");
  const k8sModeInput = document.getElementById("k8sMode");
  
  // Debug: uncomment if workload type debugging needed
  // console.log('getCurrentWorkloadType() called');
  // console.log('nodeModeInput:', nodeModeInput);
  // console.log('k8sModeInput:', k8sModeInput);
  // console.log('nodeModeInput.checked:', nodeModeInput?.checked);
  // console.log('k8sModeInput.checked:', k8sModeInput?.checked);
  
  if (k8sModeInput && k8sModeInput.checked) {
    console.log('Returning k8s from radio button');
    currentWorkloadType = 'k8s';
    return 'k8s';
  } else if (nodeModeInput && nodeModeInput.checked) {
    console.log('Returning node mode from radio button');
    currentWorkloadType = 'node';
    return 'node';
  }
  
  // Fallback to global variable
  console.log('Returning from global variable:', currentWorkloadType);
  return currentWorkloadType;
}
window.getCurrentWorkloadType = getCurrentWorkloadType;

// Function to fetch K8s cluster information
async function fetchK8sClusterInfo() {
  const hostname = configHostname;
  const port = configPort;
  const username = configUsername;
  const password = configPassword;
  
  const url = `http://${hostname}:${port}/tumblebug/k8sClusterInfo`;
  const auth = btoa(`${username}:${password}`);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Basic ${auth}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      k8sClusterInfo = data;
      return data;
    } else {
      console.error('Failed to fetch K8s cluster info:', response.status);
      return null;
    }
  } catch (error) {
    console.error('Error fetching K8s cluster info:', error);
    return null;
  }
}

// Function to update provider selection based on K8s availability
function updateProvidersForK8s(k8sInfo) {
  if (!k8sInfo || !k8sInfo.k8s_cluster) {
    return;
  }
  
  // Get available K8s providers
  const availableProviders = Object.keys(k8sInfo.k8s_cluster);
  
  // Uncheck ALL first
  const allCheckbox = document.getElementById("provider-all");
  if (allCheckbox) {
    allCheckbox.checked = false;
  }
  
  // Uncheck all individual providers first
  const allProviderCheckboxes = document.querySelectorAll('#provider-checkboxes input[type="checkbox"]');
  allProviderCheckboxes.forEach(cb => cb.checked = false);
  
  // Check only available K8s providers
  availableProviders.forEach(provider => {
    const checkbox = document.getElementById(`provider-${provider}`);
    if (checkbox) {
      checkbox.checked = true;
    }
  });
  
  // Update dropdown text
  updateProviderDropdownText();
}

// Function to toggle between MC-Infra (Node) and K8s-Infra
async function toggleWorkloadType() {
  const nodeModeInput = document.getElementById("nodeMode");
  const k8sModeInput = document.getElementById("k8sMode");
  const isK8sMode = k8sModeInput && k8sModeInput.checked;
  
  // Update global workload type
  currentWorkloadType = isK8sMode ? 'k8s' : 'node';
  console.log('toggleWorkloadType: currentWorkloadType set to', currentWorkloadType);
  
  // Save current configuration before switching
  if (isK8sMode) {
    // Switching from Node to K8s - save Node config
    workloadConfigurations.vmInfra.minVCPU = document.getElementById("minVCPU").value || "1";
    workloadConfigurations.vmInfra.minRAM = document.getElementById("minRAM").value || "0.5";
    workloadConfigurations.vmInfra.diskSize = document.getElementById("diskSize").value || "";
    
    // Store current Node provider selection
    workloadConfigurations.vmInfra.selectedProviders = getSelectedProviders();
    workloadConfigurations.vmInfra.allSelected = document.getElementById("provider-all")?.checked || false;
    
    // Apply K8s configuration
    document.getElementById("minVCPU").value = workloadConfigurations.k8sInfra.minVCPU;
    document.getElementById("minRAM").value = workloadConfigurations.k8sInfra.minRAM;
    document.getElementById("diskSize").value = workloadConfigurations.k8sInfra.diskSize;
    
    // Fetch K8s cluster info and update providers
    const k8sInfo = await fetchK8sClusterInfo();
    if (k8sInfo) {
      updateProvidersForK8s(k8sInfo);
    }
    
    // Show K8s configuration info with dynamic data
    showK8sConfigurationInfo(k8sInfo);
    
    // Update active state
    workloadConfigurations.vmInfra.isActive = false;
    workloadConfigurations.k8sInfra.isActive = true;
    
  } else {
    // Switching from K8s to Node - save Node config
    workloadConfigurations.k8sInfra.minVCPU = document.getElementById("minVCPU").value || "4";
    workloadConfigurations.k8sInfra.minRAM = document.getElementById("minRAM").value || "16";
    workloadConfigurations.k8sInfra.diskSize = document.getElementById("diskSize").value || "100";
    
    // Apply Node configuration (restore previous or defaults)
    document.getElementById("minVCPU").value = workloadConfigurations.vmInfra.minVCPU;
    document.getElementById("minRAM").value = workloadConfigurations.vmInfra.minRAM;
    document.getElementById("diskSize").value = workloadConfigurations.vmInfra.diskSize;
    
    // Restore Node provider selection
    if (workloadConfigurations.vmInfra.allSelected) {
      const allCheckbox = document.getElementById("provider-all");
      if (allCheckbox) {
        allCheckbox.checked = true;
        // Uncheck individual providers
        const providerCheckboxes = document.querySelectorAll('#provider-checkboxes input[type="checkbox"]');
        providerCheckboxes.forEach(cb => cb.checked = false);
      }
    } else {
      // Uncheck ALL first
      const allCheckbox = document.getElementById("provider-all");
      if (allCheckbox) {
        allCheckbox.checked = false;
      }
      
      // Restore individual provider selections
      const allProviderCheckboxes = document.querySelectorAll('#provider-checkboxes input[type="checkbox"]');
      allProviderCheckboxes.forEach(cb => cb.checked = false);
      
      if (workloadConfigurations.vmInfra.selectedProviders) {
        workloadConfigurations.vmInfra.selectedProviders.forEach(provider => {
          const checkbox = document.getElementById(`provider-${provider}`);
          if (checkbox) {
            checkbox.checked = true;
          }
        });
      }
    }
    
    // Update dropdown text
    updateProviderDropdownText();
    
    // Update active state
    workloadConfigurations.vmInfra.isActive = true;
    workloadConfigurations.k8sInfra.isActive = false;
    
    // No alert needed for Node mode as requested
  }
  
  console.log('Workload Type Changed:', isK8sMode ? 'K8s-Infra' : 'MC-Infra (Node)');
  console.log('Current Configuration:', workloadConfigurations);
}
window.toggleWorkloadType = toggleWorkloadType;

// Function to show K8s configuration information with dynamic data
function showK8sConfigurationInfo(k8sInfo = null) {
  // Get selected providers for display
  var selectedProviders = getSelectedProviders();
  var allCheckbox = document.getElementById("provider-all");
  var providerInfo = "";
  
  if (allCheckbox && allCheckbox.checked) {
    providerInfo = "All Providers";
  } else if (selectedProviders.length > 0) {
    providerInfo = selectedProviders.map(p => p.toUpperCase()).join(", ");
  } else {
    providerInfo = "No Providers Selected";
  }
  
  // Generate dynamic provider-specific information
  let providerDetailsHtml = "";
  let nodeGroupCreationInfo = "";
  let nodeGroupSeparateInfo = "";
  
  if (k8sInfo && k8sInfo.k8s_cluster) {
    const providers = k8sInfo.k8s_cluster;
    
    // Separate providers by nodegroups_on_creation
    const withNodeGroups = [];
    const withoutNodeGroups = [];
    
    Object.keys(providers).forEach(provider => {
      const info = providers[provider];
      if (info.nodegroups_on_creation) {
        withNodeGroups.push(provider.toUpperCase());
      } else {
        withoutNodeGroups.push(provider.toUpperCase());
      }
    });
    
    nodeGroupCreationInfo = withNodeGroups.length > 0 ? 
      `🟢 ${withNodeGroups.join(", ")}` : "None";
    nodeGroupSeparateInfo = withoutNodeGroups.length > 0 ? 
      `🔴 ${withoutNodeGroups.join(", ")}` : "None";
    
    // Generate provider details
    Object.keys(providers).forEach(provider => {
      const info = providers[provider];
      const providerUpper = provider.toUpperCase();
      
      providerDetailsHtml += `
        <div style="margin-bottom: 12px;">
          <strong>${providerUpper}</strong><br>
          • NodeGroups on Creation: ${info.nodegroups_on_creation ? '✅ Yes' : '❌ No'}<br>
          • Node Image Designation: ${info.node_image_designation ? '✅ Required' : '❌ Not Required'}<br>
          • Required Subnet Count: ${info.required_subnet_count}<br>
          ${info.nodegroup_naming_rule ? `• NodeGroup Naming Rule: <code>${info.nodegroup_naming_rule}</code><br>` : ''}
        </div>
      `;
    });
  } else {
    nodeGroupCreationInfo = "Unable to fetch current data";
    nodeGroupSeparateInfo = "Unable to fetch current data";
    providerDetailsHtml = "<div>Unable to fetch provider-specific information</div>";
  }
  
  // Show comprehensive Kubernetes information
  Swal.fire({
    title: "⚙️ K8s-Infra Mode Activated",
    html: `
      <div style="text-align: left; font-size: 13px; line-height: 1.4;">
        <div style="background: #fff3cd; padding: 8px; border-radius: 4px; margin-bottom: 12px; border-left: 4px solid #ffc107;">
          <strong>⚠️ Notice:</strong> Managed Kubernetes Provisioning is under development and may have stability issues.
        </div>
        
        <div style="background: #d1ecf1; padding: 8px; border-radius: 4px; margin-bottom: 12px; border-left: 4px solid #17a2b8;">
          <strong>✅ Configuration Applied:</strong> Min vCPU: 4, Min Memory: 16GB, Disk: 100GB<br>
          <strong>🏢 Available K8s Providers:</strong> ${providerInfo}
        </div>
        
        <div style="margin-bottom: 12px;">
          <strong style="color: #28a745;">Node Group created with cluster:</strong><br>
          ${nodeGroupCreationInfo}
        </div>
        
        <div style="margin-bottom: 15px;">
          <strong style="color: #dc3545;">Node Group added separately after cluster creation:</strong><br>
          ${nodeGroupSeparateInfo}
        </div>

        <details style="margin-bottom: 10px;">
          <summary style="cursor: pointer; font-weight: bold; color: #495057; margin-bottom: 8px;">
            📖 Provider-specific Details
          </summary>
          <div style="margin-left: 15px; margin-top: 8px; font-size: 12px;">
            ${providerDetailsHtml}
          </div>
        </details>

        <details style="margin-bottom: 10px;">
          <summary style="cursor: pointer; font-weight: bold; color: #495057; margin-bottom: 8px;">
            📄 Raw K8s Cluster Info (JSON)
          </summary>
          <div style="margin-left: 15px; margin-top: 8px;">
            <pre style="background: #f8f9fa; padding: 10px; border-radius: 4px; font-size: 10px; max-height: 300px; overflow-y: auto; text-align: left;">${k8sInfo ? JSON.stringify(k8sInfo, null, 2) : 'Unable to fetch data'}</pre>
          </div>
        </details>
      </div>
    `,
    icon: "info",
    confirmButtonText: "OK",
    confirmButtonColor: "#007bff",
    width: "700px"
  });
}

// Function to get current workload type
// Function to get workload configuration
function getWorkloadConfiguration() {
  return {
    currentType: getCurrentWorkloadType(),
    configurations: workloadConfigurations
  };
}
window.getWorkloadConfiguration = getWorkloadConfiguration;

function getRecommendedSpec(idx, latitude, longitude) {
  var hostname = configHostname;
  var port = configPort;
  var username = configUsername;
  var password = configPassword;

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

  var url = `http://${hostname}:${port}/tumblebug/recommendSpec`;

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

    // Spec selection popup
    Swal.fire({
      title: "Select a Spec from the Recommendation List",
      width: 1200,
      position: 'center',

      // Spec selection popup HTML part with row selection instead of buttons
      html: `
  <div class="compact-datatable">
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
          ${res.data.map((spec, index) => {
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
    /* Apply compact styling to all DataTable elements */
    .compact-datatable {
      font-size: 0.8rem;
    }
    
    /* Stronger highlight for selected row */
    .selected-spec {
      background-color: rgba(40, 167, 69, 0.35) !important;
      border-left: 5px solid rgb(40, 167, 69) !important;
      font-weight: bold;
    }
    table.dataTable tbody tr.selected-spec {
      background-color: rgba(40, 167, 69, 0.35) !important;
      border-left: 5px solid rgb(40, 167, 69) !important;
    }
    
    /* Make rows clickable */
    #specSelectionTable tbody tr {
      cursor: pointer;
    }
    #specSelectionTable tbody tr:hover {
      background-color: rgba(0, 123, 255, 0.08) !important;
    }
    
    /* Reduce spacing in details section */
    #specDetailsContent .row p {
      margin-bottom: 0.2rem;
    }
  </style>
`,
      didOpen: () => {
        // Set up row click event for the table
        $('#specSelectionTable tbody').on('click', 'tr', function () {
          const index = $(this).data('index');
          selectSpecRow(index);
        });

        // Spec selection function
        window.selectSpecRow = function (index) {
          // Reset previous selection
          document.querySelectorAll('#specSelectionTable tbody tr').forEach(row => {
            row.classList.remove('selected-spec');
          });

          // Select new row
          const selectedRow = document.getElementById(`spec-row-${index}`);
          if (selectedRow) {
            selectedRow.classList.add('selected-spec');
          }

          // Save selected index and update details
          document.getElementById('selectedSpecIndex').value = index;
          updateSpecDetails(index);
        };

        // Update spec details function
        function updateSpecDetails(index) {
          const spec = res.data[index];
          let costPerHour = spec.costPerHour < 0 || !spec.costPerHour ? "unknown" : `$${spec.costPerHour}`;

          // Basic spec information - styled to match image details
          const specInfoHTML = `
            <div style="margin:0; padding:0; text-align: left;">
              <div style="margin-bottom:3px; text-align: left;">
                <strong>CSP:</strong> ${spec.providerName.toUpperCase()}
              </div>
              <div style="margin-bottom:3px; text-align: left;">
                <strong>Region:</strong> ${spec.regionName}
              </div>
              <div style="margin-bottom:3px; text-align: left;">
                <strong>Spec Name:</strong> ${spec.cspSpecName}
              </div>
              <div style="margin-bottom:3px; text-align: left;">
                <strong>Architecture:</strong> ${spec.architecture}
              </div>
              <div style="margin-bottom:3px; text-align: left;">
                <strong>vCPU:</strong> ${spec.vCPU}
              </div>
              <div style="margin-bottom:3px; text-align: left;">
                <strong>Memory:</strong> ${spec.memoryGiB} GiB
              </div>
              <div style="margin-bottom:3px; text-align: left;">
                <strong>Cost:</strong> <span style="color: ${costPerHour === 'unknown' ? 'orange' : 'green'};">${costPerHour}/hour</span>
              </div>
              ${spec.acceleratorType === "gpu" ? `
                <div style="margin-bottom:3px; text-align: left;">
                  <strong>Accelerator:</strong> <span style="color: red; font-weight: bold;">✓ GPU (${spec.acceleratorModel})</span>
                </div>
                <div style="margin-bottom:3px; text-align: left;">
                  <strong>GPU Count:</strong> ${spec.acceleratorCount}
                </div>
                <div style="margin-bottom:3px; text-align: left;">
                  <strong>GPU Memory:</strong> ${spec.acceleratorMemoryGB} GB
                </div>
              ` : `
                <div style="margin-bottom:3px; text-align: left;">
                  <strong>Accelerator:</strong> <span style="color: gray;">None</span>
                </div>
              `}
            </div>
          `;

          // Details table - styled to match image details
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

          document.getElementById('specDetailsContent').innerHTML = detailsHTML;
        }

        // Initialize DataTable
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
          "columnDefs": [
            {
              "targets": -1,
              "orderable": false
            }
          ],
          "language": {
            "search": "Filtering Keyword:",
            "lengthMenu": "Show _MENU_ entries",
            "info": "_START_ - _END_ of _TOTAL_",
            "infoEmpty": "No data available",
            "paginate": {
              "first": "First",
              "last": "Last",
              "next": "Next",
              "previous": "Previous"
            }
          }
        });

        // Initialize spec details
        updateSpecDetails(0);
      },
      showCancelButton: true,
      confirmButtonText: "Continue",
      cancelButtonText: "Cancel",
      preConfirm: () => {
        return parseInt(document.getElementById('selectedSpecIndex').value);
      }
    }).then((result) => {
      if (result.isConfirmed) {
        // User selected a spec and confirmed
        var selectedSpec = res.data[result.value];
        console.log("User selected spec:", selectedSpec);

        // Search for images based on the selected spec
        const searchImageURL = `http://${hostname}:${port}/tumblebug/ns/system/resources/searchImage`;
        const searchImageBody = {
          matchedSpecId: selectedSpec.id,
          osType: document.getElementById("osImage").value,
        };

        console.log("Searching images for selected spec:", selectedSpec.id);

        // Get namespace for custom image API call
        var namespace = configNamespace;

        // Search images API call and custom images API call in parallel
        Promise.all([
          // Regular images search
          axios({
            method: "post",
            url: searchImageURL,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify(searchImageBody),
            auth: {
              username: `${username}`,
              password: `${password}`,
            },
          }),
          // Custom images fetch
          axios({
            method: "get",
            url: `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/customImage`,
            headers: { "Content-Type": "application/json" },
            auth: {
              username: `${username}`,
              password: `${password}`,
            },
          }).catch(err => {
            console.log("Failed to fetch custom images (will continue with regular images only):", err);
            return { data: { customImage: [] } }; // Return empty array if custom images API fails
          })
        ]).then(([searchRes, customImageRes]) => {
          console.log("searchImage response:", searchRes.data);
          console.log("customImage response:", customImageRes.data);

          let availableImages = [];
          let customImages = [];
          
          // Process regular images
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
              isCustomImage: false,
              details: img.details || []
            }));

            console.log("Available regular images for this spec:");
            console.table(availableImages);
          }

          // Process custom images - filter by matching provider and region
          if (customImageRes.data && customImageRes.data.customImage && customImageRes.data.customImage.length > 0) {
            const selectedProvider = selectedSpec.providerName;
            const selectedRegion = selectedSpec.regionName;
            
            customImages = customImageRes.data.customImage
              .filter(img => {
                // Match provider
                const imgProvider = img.providerName || '';
                if (imgProvider !== selectedProvider) return false;
                
                // Match region (regionList is an array)
                const imgRegions = Array.isArray(img.regionList) ? img.regionList : [img.regionList];
                if (!imgRegions.includes(selectedRegion)) return false;
                
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
                isCustomImage: true, // Mark as custom image
                details: img.details || []
              }));

            console.log("Available custom images for this spec:");
            console.table(customImages);
          }

          // Merge custom images at the top, then regular images
          availableImages = [...customImages, ...availableImages];

          if (availableImages.length === 0) {
            errorAlert("No images found for the selected specification");
            return;
          }

          // Image selection popup
          Swal.fire({
            title: "Select an Image from the Image Search List",
            width: 1200,
            html: `
              <div class="compact-datatable">
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
                        // Simple T/F display for GPU and Kubernetes support
                        const gpuSupport = image.isGPUImage ? 'T' : 'F';
                        const k8sSupport = image.isKubernetesImage ? 'T' : 'F';
                        
                        // Add special styling for custom images and basic images
                        const isCustomClass = image.isCustomImage ? 'custom-image-row' : '';
                        const isBasicClass = image.isBasicImage ? 'basic-image-row' : '';
                        const customIcon = image.isCustomImage ? ' <span class="custom-image-icon" title="Custom Image (Snapshot)">📸</span>' : '';
                        const basicIcon = image.isBasicImage ? ' <span class="basic-image-icon" title="Basic OS Image">⭐</span>' : '';
                        const mlIcon = image.isGPUImage ? ' <span class="ml-image-icon" title="GPU Support">🧮</span>' : '';
                        const k8sIcon = image.isKubernetesImage ? ' <span class="k8s-image-icon" title="Kubernetes Support">☸️</span>' : '';
                        
                        // Truncate long text for better table layout - increased limits for more space
                        const truncateText = (text, maxLength) => {
                          if (text.length <= maxLength) return text;
                          return text.substring(0, maxLength) + '..';
                        };
                        
                        const truncatedImageName = truncateText(image.cspImageName, 70);
                        const truncatedDistribution = truncateText(image.osDistribution, 70);
                        
                        return `
                          <tr id="image-row-${index}" class="${index === 0 ? 'selected-image' : ''} ${isCustomClass} ${isBasicClass}" data-index="${index}">
                            <td class="text-left">${index + 1}${customIcon}${basicIcon}</td>
                            <td class="text-left">${image.osType}</td>
                            <td class="text-left" style="font-size: 0.85em; color: #0066cc;" title="${image.cspImageName}">${truncatedImageName}</td>
                            <td class="text-left" style="font-size: 0.9em;" title="${image.osDistribution}">${truncatedDistribution}</td>
                            <td class="text-center">${mlIcon}${k8sIcon}</td>
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
                <input type="hidden" id="selectedImageIndex" value="0">
                <input type="hidden" id="useDirectImageIdFlag" value="false">
                <input type="hidden" id="directImageIdValue" value="">
              </div>
              <style>
                /* Apply compact styling to all DataTable elements */
                .compact-datatable {
                  font-size: 0.8rem;
                }
                
                /* Fix table layout for consistent column widths */
                #imageSelectionTable {
                  table-layout: fixed !important;
                  width: 100% !important;
                }
                
                /* Set specific column widths */
                #imageSelectionTable th:nth-child(1),  /* # */
                #imageSelectionTable td:nth-child(1) {
                  width: 8%;
                }
                
                #imageSelectionTable th:nth-child(2),  /* OS Type */
                #imageSelectionTable td:nth-child(2) {
                  width: 12%;
                }
                
                #imageSelectionTable th:nth-child(3),  /* Image Name */
                #imageSelectionTable td:nth-child(3) {
                  width: 35% !important;
                  max-width: 35% !important;
                  min-width: 35% !important;
                }
                
                #imageSelectionTable th:nth-child(4),  /* OS Distribution */
                #imageSelectionTable td:nth-child(4) {
                  width: 35% !important;
                  max-width: 35% !important;
                  min-width: 35% !important;
                }
                
                #imageSelectionTable th:nth-child(5),  /* Support */
                #imageSelectionTable td:nth-child(5) {
                  width: 10%;
                }
                
                #imageSelectionTable th:nth-child(6),  /* Architecture */
                #imageSelectionTable td:nth-child(6) {
                  width: 10%;
                }
                
                #imageSelectionTable th,
                #imageSelectionTable td {
                  overflow: hidden;
                  text-overflow: ellipsis;
                  white-space: nowrap;
                }
                
                /* Allow text wrapping only for specific columns that need it */
                #imageSelectionTable td:nth-child(3),  /* Image Name */
                #imageSelectionTable td:nth-child(4) { /* OS Distribution */
                  white-space: normal;
                  word-wrap: break-word;
                  word-break: break-all;
                }
                
                /* Stronger highlight for selected row */
                .selected-image {
                  background-color: rgba(40, 167, 69, 0.35) !important;
                  border-left: 5px solid rgb(40, 167, 69) !important;
                  font-weight: bold;
                }
                table.dataTable tbody tr.selected-image {
                  background-color: rgba(40, 167, 69, 0.35) !important;
                  border-left: 5px solid rgb(40, 167, 69) !important;
                }
                
                /* Make rows clickable */
                #imageSelectionTable tbody tr {
                  cursor: pointer;
                }
                #imageSelectionTable tbody tr:hover {
                  background-color: rgba(0, 123, 255, 0.08) !important;
                }
                
                /* Basic Image row styling */
                .basic-image-row {
                  background-color: rgba(255, 193, 7, 0.1) !important;
                  border-left: 3px solid #ffc107 !important;
                }
                .basic-image-row:hover {
                  background-color: rgba(255, 193, 7, 0.15) !important;
                }
                
                /* Custom Image row styling */
                .custom-image-row {
                  background-color: rgba(138, 43, 226, 0.1) !important;
                  border-left: 3px solid #8a2be2 !important;
                }
                .custom-image-row:hover {
                  background-color: rgba(138, 43, 226, 0.15) !important;
                }
                
                /* Custom Image icon */
                .custom-image-icon {
                  color: #8a2be2;
                  font-size: 1.1em;
                  margin-left: 5px;
                  text-shadow: 0 0 3px rgba(138, 43, 226, 0.5);
                }
                
                /* Basic Image icon */
                .basic-image-icon {
                  color: #ffc107;
                  font-size: 1.1em;
                  margin-left: 5px;
                  text-shadow: 0 0 3px rgba(255, 193, 7, 0.5);
                }
                
                /* ML Image icon */
                .ml-image-icon {
                  color: #e74c3c;
                  font-size: 1.1em;
                  margin-left: 3px;
                  text-shadow: 0 0 3px rgba(231, 76, 60, 0.5);
                }
                
                /* K8s Image icon */
                .k8s-image-icon {
                  color: #3498db;
                  font-size: 1.1em;
                  margin-left: 3px;
                  text-shadow: 0 0 3px rgba(52, 152, 219, 0.5);
                }
                
                /* Reduce spacing in details section */
                #imageDetailsContent {
                  line-height: 1.2;
                }
                #imageDetailsContent .row {
                  margin: 0;
                }
                #imageDetailsContent p {
                  margin: 2px 0;
                }
                
                /* Details table styling */
                .image-details-table {
                  font-size: 0.75rem;
                  max-height: 200px;
                  overflow-y: auto;
                }
                .image-details-table td {
                  padding: 0.25rem 0.5rem;
                  border: 1px solid #dee2e6;
                }
                .image-details-table th {
                  padding: 0.25rem 0.5rem;
                  background-color: #f8f9fa;
                  border: 1px solid #dee2e6;
                  font-weight: bold;
                }
              </style>
            `,
            didOpen: () => {
              // Set up row click event for the table
              $('#imageSelectionTable tbody').on('click', 'tr', function () {
                const index = $(this).data('index');
                selectImageRow(index);
              });

              // Image selection function
              window.selectImageRow = function (index) {
                // Reset previous selection
                document.querySelectorAll('#imageSelectionTable tbody tr').forEach(row => {
                  row.classList.remove('selected-image');
                });

                // Select new row
                const selectedRow = document.getElementById(`image-row-${index}`);
                if (selectedRow) {
                  selectedRow.classList.add('selected-image');
                }

                // Save selected index and update details
                document.getElementById('selectedImageIndex').value = index;
                updateImageDetails(index);
              };

              // Update image details function
              function updateImageDetails(index) {
                const image = availableImages[index];
                
                // Combined image information - simplified layout
                const imageInfoHTML = `
                  <div style="margin:0; padding:0; text-align: left;">
                    <div style="margin-bottom:3px; text-align: left;">
                      <strong>Name:</strong> ${image.cspImageName}
                    </div>
                    <div style="margin-bottom:3px; text-align: left;">
                      <strong>Distribution:</strong> ${image.osDistribution}
                    </div>
                    <div style="margin-bottom:3px; text-align: left;">
                      <strong>Description:</strong> ${image.description}
                    </div>
                    <div style="margin-bottom:3px; text-align: left;">
                      <strong>Status:</strong> <span style="color: ${image.imageStatus === 'Available' || image.imageStatus === 'available' ? 'green' : 'orange'};">${image.imageStatus}</span>
                    </div>
                    ${image.isKubernetesImage ? `<div style="margin-bottom:3px; text-align: left;"><strong>K8s Support:</strong> <span style="color: blue; font-weight: bold;">✓ Yes</span></div>` : ''}
                    ${image.isGPUImage ? `<div style="margin-bottom:3px; text-align: left;"><strong>GPU Support:</strong> <span style="color: red; font-weight: bold;">✓ Yes</span></div>` : ''}
                    ${image.isBasicImage ? `<div style="margin-bottom:3px; text-align: left;"><strong>Basic Image:</strong> <span style="color: green; font-weight: bold;">✓ Yes</span></div>` : ''}
                  </div>
                `;

                // Details table - simplified
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

                document.getElementById('imageDetailsContent').innerHTML = detailsHTML;
              }

              // Initialize DataTable
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
                  {
                    "targets": 0,
                    "type": "num"
                  },
                  {
                    "targets": -1,
                    "orderable": false
                  },
                  {
                    "targets": -2,
                    "orderable": false
                  }
                ],
                "language": {
                  "search": "Filtering Keyword:",
                  "lengthMenu": "Show _MENU_ entries",
                  "info": "_START_ - _END_ of _TOTAL_",
                  "infoEmpty": "No data available",
                  "paginate": {
                    "first": "First",
                    "last": "Last",
                    "next": "Next",
                    "previous": "Previous"
                  }
                }
              });

              // Initialize image details
              updateImageDetails(0);

              // Direct Image ID button handlers
              $('#useDirectImageIdBtn').on('click', function() {
                const directImageId = $('#directImageIdInput').val().trim();
                if (!directImageId) {
                  $('#directImageIdStatus').html('<span style="color:red;">⚠️ Please enter an Image ID</span>');
                  return;
                }
                // Set the flags and value
                $('#useDirectImageIdFlag').val('true');
                $('#directImageIdValue').val(directImageId);
                // Clear table selection and show status
                $('#imageSelectionTable tbody tr').removeClass('selected-image');
                // XSS-safe: escape user input before inserting into HTML
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
                // Re-select the first row
                selectImageRow(0);
              });
            },
            showCancelButton: true,
            confirmButtonText: "Continue",
            cancelButtonText: "Cancel",
            preConfirm: () => {
              const useDirect = document.getElementById('useDirectImageIdFlag').value === 'true';
              const directImageId = document.getElementById('directImageIdValue').value;
              const selectedIndex = parseInt(document.getElementById('selectedImageIndex').value);
              return {
                useDirectImageId: useDirect,
                directImageId: directImageId,
                selectedIndex: selectedIndex
              };
            }
          }).then((imageResult) => {
            if (imageResult.isConfirmed) {
              // Determine which image to use
              let selectedImageId;
              let selectedImage;
              
              if (imageResult.value.useDirectImageId && imageResult.value.directImageId) {
                // User specified a direct image ID
                selectedImageId = imageResult.value.directImageId;
                selectedImage = {
                  cspImageName: selectedImageId,
                  osDistribution: "Direct Image ID (will be auto-registered if available in CSP)",
                  osType: "Unknown",
                  osArchitecture: "Unknown",
                  isDirectInput: true
                };
                console.log("User specified direct image ID:", selectedImageId);
              } else {
                // User selected from the list
                selectedImage = availableImages[imageResult.value.selectedIndex];
                selectedImageId = selectedImage.cspImageName;
                console.log("User selected image from list:", selectedImage);
              }

              // Now proceed to the final spec confirmation step
              addRegionMarker(selectedSpec.id);

              var createInfraReqVm = $.extend({}, createInfraReqVmTmplt);
              var recommendedSpec = selectedSpec;

              createInfraReqVm.name = "g" + (nodeGroupRequestFromSpecList.length + 1).toString();

              var osImage = document.getElementById("osImage");
              var diskSize = document.getElementById("diskSize");

              createInfraReqVm.specId = selectedSpec.id;
              createInfraReqVm.imageId = selectedImageId; // Use selected image ID (from list or custom input)
              createInfraReqVm.rootDiskType = selectedSpec.rootDiskType;

              var diskSizeInput = parseInt(diskSize.value, 10);
              if (isNaN(diskSizeInput) || diskSizeInput <= 0) {
                diskSizeInput = 0; // 0 means use CSP default
              }
              createInfraReqVm.rootDiskSize = diskSizeInput;
              // Note: 0 means use CSP default, positive values specify exact size
              // selectedSpec.rootDiskSize is now an integer from the API

              // Create image display for the confirmation popup (full width available)
              let imageSelectHTML = `
                <div>
                  <div style="font-size: 0.85rem; font-weight: 600; color: #333; margin-bottom: 4px; word-break: break-word;">
                    ${selectedImage.osDistribution}
                  </div>
                  <code style="font-size: 0.8rem; color: #666; background: #e9ecef; padding: 4px 8px; border-radius: 4px; display: block; word-break: break-all; max-height: 60px; overflow-y: auto;">${selectedImage.cspImageName}</code>
                </div>
              `;

              let costPerHour = selectedSpec.costPerHour;
          if (costPerHour < 0 || !costPerHour) {
            costPerHour = "unknown";
          }
          
          // Store costPerHour in selectedSpec for buildSpecConfigPopupHtml
          selectedSpec.costPerHour = costPerHour;

          // Use setTimeout to open as independent popup (not nested)
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
              // Helper: read current dropdown values for refining the review.
              // Empty/"default" rootDiskType means "let CSP/Spider pick its
              // default"; the backend treats both as the same sentinel.
              const getReviewRefinements = () => {
                const rdtEl = document.getElementById('rootDiskTypeSelect');
                const zoneEl = document.getElementById('zoneSelect');
                return {
                  rootDiskType: rdtEl ? rdtEl.value : '',
                  zone: zoneEl ? zoneEl.value : ''
                };
              };

              // Call specImagePairReview API. Re-fires whenever rootDiskType
              // or zone changes so the user sees real-time stock feedback.
              // A monotonic request counter ensures that out-of-order responses
              // (a slower earlier request resolving after a newer one) cannot
              // overwrite the UI with stale validity/suggestions.
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
                  // Match the page protocol so HTTPS deployments don't trip
                  // mixed-content blocking on this fetch.
                  const reviewApiProtocol = window.location.protocol === 'https:' ? 'https' : 'http';
                  const response = await fetch(`${reviewApiProtocol}://${hostname}:${port}/tumblebug/specImagePairReview`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': 'Basic ' + btoa(configUsername + ':' + configPassword)
                    },
                    body: JSON.stringify({
                      specId: selectedSpec.id,
                      imageId: selectedImageId,
                      rootDiskType: refinements.rootDiskType,
                      zone: refinements.zone
                    })
                  });
                  
                  if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                  }
                  
                  const result = await response.json();
                  // Drop stale responses: a newer review has been kicked off
                  // since this one started.
                  if (mySeq !== reviewRequestSeq) return;
                  if (spinnerEl) spinnerEl.style.display = 'none';
                  
                  // Helper function to escape HTML (prevent XSS)
                  const escapeHtml = (str) => $('<div>').text(str).html();

                  // Build a "suggestion" line from availability hints.
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

                  if (result.isValid) {
                    statusEl.textContent = '✓ Valid';
                    statusEl.style.backgroundColor = '#28a745';
                    sectionEl.style.borderColor = '#28a745';
                    sectionEl.style.backgroundColor = '#d4edda';
                    
                    let details = [];
                    // Show main message first
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
                    
                    // Show main message prominently
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

              // Populate RootDiskType dropdown based on CSP (using common helper)
              populateRootDiskTypeSelect('rootDiskTypeSelect', selectedSpec.providerName, selectedSpec.rootDiskType || 'default');

              // Fetch and populate Zone dropdown using the new availableZonesForSpec API (GET method)
              const zonePopulatePromise = populateZoneSelect('zoneSelect', 'zoneLoadingSpinner', selectedSpec.id, '', 'zoneStatusMessage');

              // Re-fire the pair review whenever the user refines rootDiskType
              // or zone, so the suggestion/warning reflects the actual choice.
              // Debounced to avoid bursting the API on rapid changes.
              let reviewDebounce = null;
              const scheduleReview = () => {
                if (reviewDebounce) clearTimeout(reviewDebounce);
                reviewDebounce = setTimeout(reviewSpecImagePair, 250);
              };
              const rdtEl = document.getElementById('rootDiskTypeSelect');
              if (rdtEl) rdtEl.addEventListener('change', scheduleReview);
              const zoneEl = document.getElementById('zoneSelect');
              if (zoneEl) zoneEl.addEventListener('change', scheduleReview);

              // Initial review (uses whatever default values the dropdowns have).
              reviewSpecImagePair();

              // populateZoneSelect is async; once zones are loaded the select
              // may have a non-empty default value. Re-run the review so the
              // first result reflects the actually-selected zone instead of
              // the empty placeholder.
              if (zonePopulatePromise && typeof zonePopulatePromise.then === 'function') {
                zonePopulatePromise.then(() => {
                  const zSel = document.getElementById('zoneSelect');
                  if (zSel && zSel.value) scheduleReview();
                }).catch(() => { /* populateZoneSelect logs its own errors */ });
              }

              // Focus on the Node count input for better user experience
              const vmCountInput = document.getElementById('ndCount');
              if (vmCountInput) {
                vmCountInput.focus();
              }

              // Add input validation feedback for Node count
              if (vmCountInput) {
                vmCountInput.addEventListener('input', function() {
                  const value = parseInt(this.value, 10);
                  const isValid = !isNaN(value) && value >= 1 && value <= 1000;
                  
                  if (isValid) {
                    this.style.borderColor = '#28a745';
                    this.style.backgroundColor = '#f8fff9';
                  } else {
                    this.style.borderColor = '#dc3545';
                    this.style.backgroundColor = '#fff5f5';
                  }
                });
              }

              // Add input validation feedback for root disk size
              const rootDiskInput = document.getElementById('rootDiskSizeCustom');
              if (rootDiskInput) {
                rootDiskInput.addEventListener('input', function() {
                  const value = this.value.trim();
                  const isValid = value === 'default' || value === '' || /^\d+$/.test(value);
                  
                  if (isValid) {
                    this.style.borderColor = '#28a745';
                    this.style.backgroundColor = '#f8fff9';
                  } else {
                    this.style.borderColor = '#dc3545';
                    this.style.backgroundColor = '#fff5f5';
                  }
                });
              }

              // Add input validation feedback for labels
              const labelsInput = document.getElementById('vmLabels');
              if (labelsInput) {
                // Setup label input listener for chip sync
                window.setupLabelInputListener('vmLabels');
                
                // Auto-add GPU label if spec has GPU
                const hasGpu = selectedSpec.acceleratorType === "gpu" || selectedSpec.acceleratorModel;
                if (hasGpu) {
                  window.autoAddGpuLabel(true, 'vmLabels');
                }
                
                labelsInput.addEventListener('input', function() {
                  const value = this.value.trim();
                  // Basic validation for key=value,key=value format
                  const isValid = value === '' || /^[a-zA-Z0-9_-]+=.+?(,[a-zA-Z0-9_-]+=.+?)*$/.test(value);
                  
                  if (isValid) {
                    this.style.borderColor = '#28a745';
                    this.style.backgroundColor = '#f8fff9';
                  } else {
                    this.style.borderColor = '#ffc107';
                    this.style.backgroundColor = '#fffef5';
                  }
                  
                  // Sync label suggestion chips with input
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
            //showLoaderOnConfirm: true,
            position: "center",
            //back(disabled section)ground color
            backdrop: `rgba(0, 0, 0, 0.08)`,
            preConfirm: () => {
              // ndCount input validation
              const vmCountInput = document.getElementById('ndCount');
              let ndCount = parseInt(vmCountInput.value, 10);
              if (isNaN(ndCount) || ndCount < 1 || ndCount > 100) {
                Swal.showValidationMessage('Enter a valid number between 1 and 100');
                return false;
              }

              // rootDiskType select validation
              const rootDiskTypeSelect = document.getElementById('rootDiskTypeSelect');
              let rootDiskTypeValue = rootDiskTypeSelect ? rootDiskTypeSelect.value : "default";
              if (!rootDiskTypeValue) {
                rootDiskTypeValue = "default";
              }

              // rootDiskSize input validation (actual value is retrieved after confirmation below)
              const rootDiskSizeInput = document.getElementById('rootDiskSizeCustom');
              let rootDiskSizeValue = rootDiskSizeInput.value.trim();
              // Empty or 0 means use CSP default
              if (rootDiskSizeValue !== "" && rootDiskSizeValue !== "0") {
                if (!/^\d+$/.test(rootDiskSizeValue)) {
                  Swal.showValidationMessage('Disk size must be empty (default) or a positive number');
                  return false;
                }
              }

              const osImageSelect = document.getElementById('osImageSelect');
              if (osImageSelect && osImageSelect.value) {
                console.log(osImageSelect.value);
                createInfraReqVm.imageId = osImageSelect.value;
              }
              if (!createInfraReqVm.imageId) {
                Swal.showValidationMessage('Select an OS image');
                return false;
              }

              return ndCount;
            },


          }).then((result) => {
            // result.value is false if result.isDenied or another key such as result.isDismissed
            if (result.value) {

              createInfraReqVm.nodeGroupSize = parseInt(result.value, 10) || 1;
              if (createInfraReqVm.nodeGroupSize <= 0) {
                createInfraReqVm.nodeGroupSize = 1;
              }

              const rootDiskTypeSelect = document.getElementById('rootDiskTypeSelect');
              const rootDiskTypeValue = rootDiskTypeSelect ? rootDiskTypeSelect.value : "default";
              console.log("RootDiskType:", rootDiskTypeValue);
              createInfraReqVm.rootDiskType = rootDiskTypeValue || "default";

              const rootDiskSizeInput = document.getElementById('rootDiskSizeCustom').value.trim();
              if (rootDiskSizeInput) {
                console.log("RootDiskSize:", rootDiskSizeInput);
                createInfraReqVm.rootDiskSize = parseInt(rootDiskSizeInput, 10) || 0;
              } else {
                createInfraReqVm.rootDiskSize = 0;
              }

              // Get selected zone (optional)
              const zoneSelect = document.getElementById('zoneSelect');
              const selectedZone = zoneSelect ? zoneSelect.value : "";
              if (selectedZone) {
                console.log("Zone:", selectedZone);
                createInfraReqVm.zone = selectedZone;
              }

              // Parse labels using common helper function
              const vmLabelsInput = document.getElementById('vmLabels').value.trim();
              const labels = parseLabelsString(vmLabelsInput);
              if (Object.keys(labels).length > 0) {
                createInfraReqVm.label = labels;
                
                // Add used labels to recently used list
                Object.entries(labels).forEach(([key, value]) => {
                  window.addToRecentLabels(`${key}=${value}`);
                });
              }


              console.log(
                `${createInfraReqVm.specId}` +
                `\t(${createInfraReqVm.nodeGroupSize})`
              );
              
              // Check if we're editing an existing NodeGroup or adding a new one
              if (window.editingNodeGroupIndex >= 0) {
                // Update existing NodeGroup
                nodeGroupRequestFromSpecList[window.editingNodeGroupIndex] = createInfraReqVm;
                recommendedSpecList[window.editingNodeGroupIndex] = recommendedSpec;
                console.log(`Updated NodeGroup at index ${window.editingNodeGroupIndex}`);
                window.editingNodeGroupIndex = -1; // Reset editing mode
              } else {
                // Add new NodeGroup
                nodeGroupRequestFromSpecList.push(createInfraReqVm);
                recommendedSpecList.push(recommendedSpec);
              }
              
              // Update NodeGroup review panel
              updateNodeGroupReview();
              
              // Activate provision-tab after successful configuration
              try {
                // Remove active class from all tabs
                document.querySelectorAll('.nav-link').forEach(tab => {
                  tab.classList.remove('active');
                });
                document.querySelectorAll('.tab-pane').forEach(pane => {
                  pane.classList.remove('show', 'active');
                });
                
                // Activate provision-tab
                const provisionTab = document.getElementById('provision-tab');
                const provisionPane = document.getElementById('provision');
                
                if (provisionTab && provisionPane) {
                  provisionTab.classList.add('active');
                  provisionPane.classList.add('show', 'active');
                  
                  // Trigger Bootstrap tab shown event if needed
                  if (typeof $ !== 'undefined' && $.fn.tab) {
                    $(provisionTab).tab('show');
                  }
                }
              } catch (error) {
                console.log('Failed to activate provision tab:', error);
              }
            } else {
              console.log("Node configuration failed for this location");
              latLonInputPairIdx--;
              cspPointsCircle.pop();
              if (cspPointsCircle.length > 0) {
                geoCspPointsCircle[0] = new MultiPoint(cspPointsCircle);
              } else {
                geoCspPointsCircle = [];
              }
            }
          });
          // Delay (ms) to ensure previous popup is fully closed before opening new one
          }, 100);
            } else {
              // User canceled image selection
              console.log("Image selection canceled");
              window.editingNodeGroupIndex = -1; // Reset editing mode
              latLonInputPairIdx--;
              cspPointsCircle.pop();
              if (cspPointsCircle.length > 0) {
                geoCspPointsCircle[0] = new MultiPoint(cspPointsCircle);
              } else {
                geoCspPointsCircle = [];
              }
            }
          });
        }).catch(error => {
          console.error("Failed to get image information:", error);
        });
      } else {
        // User canceled spec selection
        console.log("Spec selection canceled");
        window.editingNodeGroupIndex = -1; // Reset editing mode
        latLonInputPairIdx--;
        cspPointsCircle.pop();
        if (cspPointsCircle.length > 0) {
          geoCspPointsCircle[0] = new MultiPoint(cspPointsCircle);
        } else {
          geoCspPointsCircle = [];
        }
        return;
      }
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

// Root disk type options per CSP (based on cloudos_meta.yaml)
const ROOT_DISK_TYPES = {
  'aws': ['default', 'standard', 'gp2', 'gp3'],
  'azure': ['default', 'PremiumSSD', 'StandardSSD', 'StandardHDD'],
  'gcp': ['default', 'pd-standard', 'pd-balanced', 'pd-ssd', 'pd-extreme'],
  'alibaba': ['default', 'cloud_essd', 'cloud_efficiency', 'cloud', 'cloud_ssd'],
  'tencent': ['default', 'CLOUD_PREMIUM', 'CLOUD_SSD'],
  'ibm': ['default'],
  'ncp': ['default', 'SSD', 'HDD'],
  'nhn': ['default', 'General_HDD', 'General_SSD'],
  'kt': ['default', 'HDD', 'SSD']
};

/**
 * Populate RootDiskType dropdown based on cloud provider.
 * @param {string} selectId - DOM element ID of the select dropdown
 * @param {string} providerName - Cloud provider name (e.g., 'aws', 'gcp')
 * @param {string} currentValue - Currently selected disk type value
 */
function populateRootDiskTypeSelect(selectId, providerName, currentValue) {
  const select = document.getElementById(selectId);
  if (!select) return;
  
  const validTypes = ROOT_DISK_TYPES[providerName.toLowerCase()] || ['default'];
  validTypes.forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    if (type === currentValue) option.selected = true;
    select.appendChild(option);
  });
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
    const response = await fetch(`${apiProtocol}://${configHostname}:${configPort}/tumblebug/availableZonesForSpec?specId=${encodeURIComponent(specId)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + btoa(configUsername + ':' + configPassword)
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
        labels[key.trim()] = value.trim();
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
  html += `
    <div class="popup-section">
      <div class="popup-section-title">🖼️ Image</div>
      <div class="popup-row">
        <div class="popup-col">
          <div class="popup-field">
            ${isEdit ? `<span class="popup-value-sm">${nodeConf.imageId || 'N/A'}</span>` : imageSelectHTML}
          </div>
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
            <label class="popup-label">Disk Size (GB)</label>
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
            <label class="popup-label">Node Count (1-1000)</label>
            <input type="number" id="${isEdit ? 'editVmCount' : 'ndCount'}" class="popup-input" 
                   min="1" max="1000" value="${nodeConf.nodeGroupSize || '1'}">
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
      <button type="button" onClick="createInfra();" class="btn btn-success btn-sm" style="font-size: 0.85rem; padding: 8px 12px;">
        🚀 Create Infra
      </button>
      <div class="d-flex" style="gap: 4px;">
        <button type="button" onClick="scaleOutInfraWithConfiguration();" class="btn btn-info btn-sm ${!hasOneNodeGroup ? 'disabled' : ''}" 
                style="font-size: 0.75rem; padding: 6px 8px; flex: 1;" ${!hasOneNodeGroup ? 'disabled' : ''}>
          ➕ ScaleOut existing Infra
        </button>
        <button type="button" onClick="clearCircle('clearText');" class="btn btn-outline-secondary btn-sm" 
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
        <button type="button" onClick="createK8sCluster();" class="btn btn-primary btn-sm ${!hasNodeGroups ? 'disabled' : ''}" 
                style="font-size: 0.85rem; padding: 8px 12px; width: 100%; margin-bottom: 4px;" ${!hasNodeGroups ? 'disabled' : ''}>
          ☸️ Create K8s Cluster${nodeGroupRequestFromSpecList.length > 1 ? 's (' + nodeGroupRequestFromSpecList.length + ')' : ''}
        </button>
        <div class="d-flex" style="gap: 4px;">
          <button type="button" onClick="addNodeGroupToK8sCluster();" class="btn btn-outline-primary btn-sm ${!hasNodeGroups ? 'disabled' : ''}" 
                  style="font-size: 0.75rem; padding: 6px 8px; flex: 1;" ${!hasNodeGroups ? 'disabled' : ''}>
            ➕ Add NodeGroup${nodeGroupRequestFromSpecList.length > 1 ? 's' : ''} to K8s Cluster
          </button>
          <button type="button" onClick="clearCircle('clearText');" class="btn btn-outline-secondary btn-sm" 
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
      <button type="button" onClick="createInfra();" class="btn btn-success btn-sm" style="font-size: 0.85rem; padding: 8px 12px;">
        🚀 Create Infra
      </button>
      <div class="d-flex" style="gap: 4px;">
        <button type="button" onClick="scaleOutInfraWithConfiguration();" class="btn btn-info btn-sm ${!hasOneNodeGroup ? 'disabled' : ''}" 
                style="font-size: 0.75rem; padding: 6px 8px; flex: 1;" ${!hasOneNodeGroup ? 'disabled' : ''}>
          ➕ ScaleOut existing Infra
        </button>
        <button type="button" onClick="clearCircle('clearText');" class="btn btn-outline-secondary btn-sm" 
                style="font-size: 0.7rem; padding: 6px 8px; min-width: 60px;">
          🗑️
        </button>
      </div>
    `;
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
            ${useGenericCspIcons ? 'Cloud' : (spec?.providerName || 'Unknown').toUpperCase()}
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

function editNodeGroup(index) {
  const nodeConf = nodeGroupRequestFromSpecList[index];
  const spec = recommendedSpecList[index];
  
  if (!spec || !nodeConf) {
    console.error('Spec or Node config not found for index:', index);
    return;
  }
  
  // Set editing mode
  window.editingNodeGroupIndex = index;
  
  // Build zone options (will be populated after dialog opens)
  const currentZone = nodeConf.zone || '';
  
  // Parse current labels using common helper
  const currentLabels = labelsToString(nodeConf.label);
  
  Swal.fire({
    title: "✏️ Edit NodeGroup Configuration",
    width: 650,
    html: buildSpecConfigPopupHtml(spec, nodeConf, {
      isEdit: true,
      currentLabels: currentLabels
    }),
    didOpen: () => {
      // Use common helpers for dropdown population
      populateRootDiskTypeSelect('editRootDiskTypeSelect', spec.providerName, nodeConf.rootDiskType || 'default');
      populateZoneSelect('editZoneSelect', 'editZoneLoadingSpinner', spec.id, currentZone, null);
      
      // Setup label input listener for chip sync
      window.setupLabelInputListener('editVmLabels');
      
      // Sync initial chip states
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
      const labelsText = document.getElementById('editVmLabels').value.trim();
      
      if (isNaN(count) || count < 1) {
        Swal.showValidationMessage('Please provide valid Node count');
        return false;
      }
      
      // Use common helper for label parsing
      const labels = parseLabelsString(labelsText);
      
      return { name, count, diskType, diskSize: parseInt(diskSize, 10) || 0, zone, labels };
    }
  }).then((result) => {
    window.editingNodeGroupIndex = -1; // Reset editing mode
    
    if (result.isConfirmed) {
      // Update the Node configuration
      nodeGroupRequestFromSpecList[index].name = result.value.name;
      nodeGroupRequestFromSpecList[index].nodeGroupSize = result.value.count;
      nodeGroupRequestFromSpecList[index].rootDiskType = result.value.diskType;
      nodeGroupRequestFromSpecList[index].rootDiskSize = result.value.diskSize;
      
      if (result.value.zone) {
        nodeGroupRequestFromSpecList[index].zone = result.value.zone;
      } else {
        delete nodeGroupRequestFromSpecList[index].zone;
      }
      
      if (Object.keys(result.value.labels).length > 0) {
        nodeGroupRequestFromSpecList[index].label = result.value.labels;
        
        // Add used labels to recently used list
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

function removeNodeGroup(index) {
  const nodeConf = nodeGroupRequestFromSpecList[index];
  
  Swal.fire({
    title: 'Remove NodeGroup?',
    text: `Are you sure you want to remove "${nodeConf.name || `NodeGroup-${index + 1}`}"?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, Remove',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#dc3545'
  }).then((result) => {
    if (result.isConfirmed) {
      // Remove from arrays
      nodeGroupRequestFromSpecList.splice(index, 1);
      recommendedSpecList.splice(index, 1);
      
      // Remove corresponding coordinate point
      if (cspPointsCircle.length > index) {
        cspPointsCircle.splice(index, 1);
        if (cspPointsCircle.length > 0) {
          geoCspPointsCircle[0] = new MultiPoint(cspPointsCircle);
        } else {
          geoCspPointsCircle = [];
        }
      }
      
      // Decrease the index counter
      if (latLonInputPairIdx > 0) {
        latLonInputPairIdx--;
      }
      
      updateNodeGroupReview();
      // successAlert('NodeGroup removed successfully!');
    }
  });
}

// Make functions available globally
window.updateNodeGroupReview = updateNodeGroupReview;
window.editNodeGroup = editNodeGroup;
window.removeNodeGroup = removeNodeGroup;

function range_change(obj) {
  document.getElementById("myvalue").value = obj.value;
}
window.range_change = range_change;

(function () {
  const parentS = document.querySelectorAll(".range-slider");

  if (!parentS) {
    return;
  }

  parentS.forEach((parent) => {
    const rangeS = parent.querySelectorAll('input[type="range"]'),
      numberS = parent.querySelectorAll('input[type="number"]');

    rangeS.forEach((el) => {
      el.oninput = () => {
        let slide1 = parseFloat(rangeS[0].value),
          slide2 = parseFloat(rangeS[1].value);

        if (slide1 > slide2) {
          [slide1, slide2] = [slide2, slide1];
        }

        numberS[0].value = slide1;
        numberS[1].value = slide2;
      };
    });

    numberS.forEach((el) => {
      el.oninput = () => {
        let number1 = parseFloat(numberS[0].value),
          number2 = parseFloat(numberS[1].value);

        if (number1 > number2) {
          let tmp = number1;
          numberS[0].value = number2;
          numberS[1].value = tmp;
        }

        rangeS[0].value = number1;
        rangeS[1].value = number2;
      };
    });
  });
})();

function addRegionMarker(spec) {
  var hostname = configHostname;
  var port = configPort;
  var username = configUsername;
  var password = configPassword;

  var url = `http://${hostname}:${port}/tumblebug/ns/system/resources/spec/${spec}`;

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  }).then((res) => {
    console.log(res);

    var connConfig = res.data.connectionName;
    console.log(connConfig);

    url = `http://${hostname}:${port}/tumblebug/connConfig/${connConfig}`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    }).then((res2) => {
      console.log(
        "Best cloud location: [" +
        res2.data.regionDetail.location.latitude +
        "," +
        res2.data.regionDetail.location.longitude +
        "]"
      ); // for debug

      // push order [longitute, latitude]
      cspPointsCircle.push([
        res2.data.regionDetail.location.longitude,
        res2.data.regionDetail.location.latitude,
      ]);
      geoCspPointsCircle[0] = new MultiPoint(cspPointsCircle);
    });
  });
}
window.addRegionMarker = addRegionMarker;

function controlInfra(action) {
  switch (action) {
    case "refine":
    case "suspend":
    case "resume":
    case "reboot":
    case "terminate":
    case "continue":
    case "withdraw":
    case "reconcile":
    case "abort":
      break;
    default:
      console.log(
        `The action ${action} is not supported. Supported actions: refine, continue, withdraw, reconcile, abort, suspend, resume, reboot, terminate.`
      );
      return;
  }
  //console.log("[Infra " +action +"]");

  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;
  var infraid = getSelectedInfraId();

  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }
  if (!infraid) {
    errorAlert("Please select an Infra first");
    return;
  }

  var spinnerId = addSpinnerTask(action + ": " + infraid);
  infoAlert(action + ": " + infraid);

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/control/infra/${infraid}?action=${action}`;

  console.log("Infra control:[" + action + "]");

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then((res) => {
      if (res.data != null) {
        console.log(res.data);
        displayJsonData(res.data, typeInfo);
        switch (action) {
          case "refine":
          case "suspend":
          case "resume":
          case "reboot":
          case "terminate":
          case "continue":
          case "withdraw":
          case "reconcile":
          case "abort":
            infoAlert(
              JSON.stringify(res.data.message, null, 2).replace(/['",]+/g, "")
            );
            break;
          default:
            console.log(
              `The action ${action} is not supported. Supported actions: refine, continue, withdraw, reconcile, abort, suspend, resume, reboot, terminate.`
            );
        }
      }
    })
    .catch(function (error) {
      if (error.response) {
        // status code is not 2xx
        console.log(error.response.data);
        console.log(error.response.status);
        console.log(error.response.headers);
      } else {
        console.log("Error", error.message);
      }
      console.log(error.config);
      errorAlert(
        JSON.stringify(error.response.data, null, 2).replace(/['",]+/g, "")
      );
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}
window.controlInfra = controlInfra;

function hideInfra() {
  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra?option=id`;

  var hideListString = "";
  for (i = 0; i < infraHideList.length; i++) {
    var html = "<br>[" + i + "]" + ": <b>" + infraHideList[i] + "</b> (hidden)";

    hideListString = hideListString + html;
  }

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  }).then((res) => {
    if (res.data.output != null) {
      infraList = res.data.output;

      Swal.fire({
        title: "Hide/Show a Infra from the Map",
        html: "<font size=3>" + hideListString,
        showCancelButton: true,
        confirmButtonText: "Show",
        showDenyButton: true,
        denyButtonText: "Hide",
      }).then((result) => {
        hideListString = "";

        if (result.isConfirmed) {
          if (infraHideList.length != 0) {
            Swal.fire({
              title: "Show a Infra from the Map",
              html: "<font size=3>" + hideListString,
              input: "select",
              inputOptions: infraHideList,
              inputPlaceholder: "Select from dropdown",
              inputAttributes: {
                autocapitalize: "off",
              },
              showCancelButton: true,
              confirmButtonText: "Show",
            }).then((result) => {
              if (result.isConfirmed) {
                infraHideList = infraHideList.filter(
                  (a) => a !== infraHideList[result.value]
                );

                for (i = 0; i < infraHideList.length; i++) {
                  var html =
                    "<br>[" +
                    i +
                    "]" +
                    ": <b>" +
                    infraHideList[i] +
                    "</b> (hidden)";
                  hideListString = hideListString + html;
                }
                infoAlert(
                  "Show: " +
                  infraHideList[result.value] +
                  "<br>" +
                  hideListString
                );
              }
            });
          } else {
            infoAlert("There is no hidden Infra yet");
          }
        } else if (result.isDenied) {
          if (infraList.length != 0) {
            Swal.fire({
              title: "Hide a Infra from the Map",
              html: "<font size=3>" + hideListString,
              input: "select",
              inputOptions: infraList.filter(
                (val) => !infraHideList.includes(val)
              ),
              inputPlaceholder: "Select from dropdown",
              inputAttributes: {
                autocapitalize: "off",
              },
              showCancelButton: true,
              confirmButtonText: "Hide",
            }).then((result) => {
              if (result.isConfirmed) {
                infraHideList.push(infraList[result.value]);
                // remove duplicated items
                infraHideList = [...new Set(infraHideList)];

                for (i = 0; i < infraHideList.length; i++) {
                  var html =
                    "<br>[" +
                    i +
                    "]" +
                    ": <b>" +
                    infraHideList[i] +
                    "</b> (hidden)";
                  hideListString = hideListString + html;
                }
                infoAlert(
                  "Hide: " + infraList[result.value] + "<br>" + hideListString
                );
              }
            });
          } else {
            infoAlert("There is no Infra yet");
          }
        }
      });
    }
  });
}
window.hideInfra = hideInfra;

function statusInfra() {
  console.log("[Get Infra status]");

  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;
  var infraid = getSelectedInfraId();

  // Validate required parameters
  if (!namespace || namespace === "") {
    errorAlert("Namespace is not selected. Please select a namespace first or switch to Control tab and back.");
    return;
  }
  if (!infraid || infraid === "") {
    errorAlert("Infra ID is not selected. Please select an Infra first.");
    return;
  }

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraid}`;

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 600000,
  })
    .then((res) => {
      console.log("[Status Infra]");
      displayJsonData(res.data, typeInfo);
    })
    .catch(function (error) {
      if (error.response) {
        // status code is not 2xx
        console.log(error.response.data);
        console.log(error.response.status);
        console.log(error.response.headers);
        // Provide more detailed error message
        const errorData = error.response.data;
        const status = error.response.status;
        let errorMsg = "";
        if (status === 404) {
          errorMsg = `Infra '${infraid}' not found in namespace '${namespace}'.\n\nThis may happen if:\n- The Infra was deleted\n- The namespace is incorrect\n- The Infra creation failed completely`;
        } else {
          errorMsg = JSON.stringify(errorData, null, 2).replace(/['",]+/g, "");
        }
        errorAlert(errorMsg);
      } else {
        console.log("Error", error.message);
        errorAlert("Network error: " + error.message);
      }
      console.log(error.config);
    });
}
window.statusInfra = statusInfra;

function deleteInfra() {
  console.log("Deleting Infra");

  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;
  var infraid = getSelectedInfraId();

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraid}?option=terminate`;

  var spinnerId = addSpinnerTask("Deleting Infra: " + infraid);
  infoAlert("Delete: " + infraid + " (option=terminate)");

  axios({
    method: "delete",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then((res) => {
      console.log(res);
      displayJsonData(res.data, typeInfo);
      // Targeted removal: only remove the deleted Infra from the render map
      infraRenderMap.delete(infraid);
      map.render();
      updateInfraList();
    })
    .catch(function (error) {
      console.log(error);
      errorAlert("Failed to delete Infra: " + infraid);
      if (error.response && error.response.data) {
        displayJsonData(error.response.data, typeError);
      }
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}
window.deleteInfra = deleteInfra;

function releaseResources() {
  var spinnerId = addSpinnerTask("Removing associated default resources");
  infoAlert("Removing all associated default resources");

  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/sharedResources`;

  axios({
    method: "delete",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then((res) => {
      updateNsList();

      console.log(res); // for debug

      var data = res.data;
      // Show summary using structured response (total, successCount, failedCount, results[])
      if (data && typeof data.total === "number") {
        var summary = `Total: ${data.total}, Success: ${data.successCount}, Failed: ${data.failedCount}`;
        if (data.failedCount > 0) {
          var failedItems = (data.results || []).filter(function (r) { return !r.success; });
          var failedDetail = failedItems
            .map(function (r) { return r.resourceType + ": " + r.resourceId + " (" + r.message + ")"; })
            .join("\n");
          console.warn("Failed resource deletions:\n" + failedDetail);
          errorAlert("Release resources completed with failures\n" + summary);
        } else {
          successAlert("All resources released successfully (" + data.total + ")");
        }
      }

      displayJsonData(data, typeInfo);
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}
window.releaseResources = releaseResources;

function resourceOverview() {
  var spinnerId = addSpinnerTask("Inspect all resources and overview");
  infoAlert("Inspect all resources and overview");

  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;

  var url = `http://${hostname}:${port}/tumblebug/inspectResourcesOverview`;

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then((res) => {
      console.log(res); // for debug
      displayJsonData(res.data, typeInfo);
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}
window.resourceOverview = resourceOverview;

// function for registerCspResource by registerCspResource button item
function registerCspResource() {
  var spinnerId = addSpinnerTask("Registering all CSP's resources");
  infoAlert("Registering all CSP's resources");

  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;

  var url = `http://${hostname}:${port}/tumblebug/registerCspResourcesAll?infraFlag=n`;

  var commandReqTmp = {
    infraName: "csp",
    nsId: `${namespace}`,
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
  })
    .then((res) => {
      console.log(res); // for debug

      console.log("[Complete: Registering all CSP's resources]\n");
      displayJsonData(res.data, typeInfo);
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}
window.registerCspResource = registerCspResource;

// ==================== Schedule Resource Registration Functions ====================

// Global variables for schedule job auto-refresh
window.scheduleJobAutoRefreshEnabled = false;
window.scheduleJobAutoRefreshInterval = null;

// Main Schedule Job Management Modal
async function showScheduleJobManagement() {
  const config = getConfig();
  const hostname = config.hostname;
  const port = config.port;
  const username = config.username;
  const password = config.password;

  // Generate random Infra name prefix (reg-xxxx)
  const randomSuffix = Math.random().toString(36).substring(2, 6).toLowerCase();
  const defaultInfraPrefix = `reg-${randomSuffix}`;

  // Load namespace and connection lists
  let namespaces = [];
  let connections = [];
  
  try {
    const [nsResponse, connResponse] = await Promise.all([
      axios.get(`http://${hostname}:${port}/tumblebug/ns?option=id`, {
        auth: { username, password }
      }),
      axios.get(`http://${hostname}:${port}/tumblebug/connConfig`, {
        auth: { username, password }
      })
    ]);
    
    namespaces = nsResponse.data.output || nsResponse.data.ns || [];
    connections = connResponse.data.connectionconfig || [];
  } catch (error) {
    console.error('Error loading namespace/connection list:', error);
    Swal.fire('❌ Error', 'Failed to load namespace/connection list', 'error');
    return;
  }

  // Build options
  const nsOptions = namespaces.map(ns => {
    const nsId = typeof ns === 'string' ? ns : (ns.id || ns);
    return `<option value="${nsId}">${nsId}</option>`;
  }).join('');

  // Build provider/region/zone hierarchy
  const providerMap = {};
  connections.forEach(conn => {
    const provider = conn.providerName;
    const region = conn.regionZoneInfo?.assignedRegion || '';
    const zone = conn.regionZoneInfo?.assignedZone || '';

    if (!providerMap[provider]) {
      providerMap[provider] = { regions: {} };
    }
    if (region && !providerMap[provider].regions[region]) {
      providerMap[provider].regions[region] = { zones: [] };
    }
    if (zone && !providerMap[provider].regions[region].zones.includes(zone)) {
      providerMap[provider].regions[region].zones.push(zone);
    }
  });

  // Build provider options
  const providerOptions = '<option value="">All Providers</option>' +
    Object.keys(providerMap).sort().map(provider =>
      `<option value="${provider}">${provider}</option>`
    ).join('');

  const connOptions = '<option value="">All Connections</option>' +
    connections.map(conn =>
      `<option value="${conn.configName}">${conn.configName} (${conn.providerName})</option>`
    ).join('');

  Swal.fire({
    title: '📅 Schedule Job Management',
    html: `
      <style>
        .schedule-job-modal-popup { min-width: 600px; max-width: 900px; }
        .schedule-compact-form { text-align: left; padding: 0; margin: 0; }
        .schedule-compact-form h5 { margin: 0 0 10px 0; font-size: 16px; }
        .schedule-compact-form .form-row { display: flex; gap: 10px; margin-bottom: 8px; }
        .schedule-compact-form .form-col { flex: 1; min-width: 0; }
        .schedule-compact-form .form-col-full { flex: 1 0 100%; }
        .schedule-compact-form label { display: block; margin: 0 0 3px 0; font-size: 13px; font-weight: 500; }
        .schedule-compact-form .form-control-sm { height: 28px; font-size: 13px; padding: 3px 8px; }
        .schedule-compact-form select.form-control-sm { height: 30px; }
        .schedule-option-dropdown { position: relative; width: 100%; }
        .schedule-option-btn { width: 100%; height: 34px; font-size: 14.5px; padding: 4px 10px; padding-right: 36px; text-align: left; background-color: #fff; border: 1px solid #ced4da; border-radius: 0.25rem; cursor: pointer; color: #495057; position: relative; }
        .schedule-option-btn::after { content: ""; position: absolute; right: 4px; top: 50%; width: 0.45em; height: 0.45em; border-right: 0.16em solid #495057; border-bottom: 0.16em solid #495057; transform: translateY(-65%) rotate(45deg); pointer-events: none; color: #495057; opacity: 0.85; }
        .schedule-option-btn:hover { background-color: #fff; border-color: #ced4da; }
        .schedule-option-menu { display: none; position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #ced4da; border-radius: 0.25rem; margin-top: 2px; max-height: 200px; overflow-y: auto; z-index: 1000; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .schedule-option-menu.show { display: block; }
        .schedule-option-item { padding: 6px 10px; cursor: pointer; font-size: 13px; }
        .schedule-option-item:hover { background-color: #f8f9fa; }
        .schedule-option-item .form-check { margin-bottom: 0; }
        .schedule-option-item .form-check-label { cursor: pointer; width: 100%; }
        .schedule-compact-form hr { margin: 12px 0; border-top: 1px solid #dee2e6; }
        .schedule-compact-form .btn { margin: 8px 0; }
        .schedule-compact-form small { font-size: 11px; color: #6c757d; margin-top: 2px; display: block; }
        .job-card { border: 1px solid #dee2e6; border-radius: 6px; padding: 12px; margin-bottom: 10px; background: #f8f9fa; }
        .job-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .job-card-title { font-weight: 600; font-size: 13px; color: #333; }
        .job-card-body { font-size: 12px; }
        .job-card-footer { margin-top: 8px; display: flex; gap: 5px; flex-wrap: wrap; }
        .job-card-footer .btn { margin: 0; font-size: 11px; padding: 2px 8px; }
        .filter-mode-tabs { display: flex; gap: 5px; margin-bottom: 10px; }
        .filter-mode-tab { flex: 1; padding: 6px; border: 1px solid #dee2e6; border-radius: 4px; text-align: center; cursor: pointer; font-size: 12px; background: #fff; }
        .filter-mode-tab.active { background: #007bff; color: white; border-color: #007bff; }
        .filter-mode-content { display: none; }
        .filter-mode-content.active { display: block; }
      </style>
      <div class="schedule-compact-form">
        <h5>➕ Create New Schedule Job</h5>
        <div class="form-row">
          <div class="form-col">
            <label>Namespace ID *</label>
            <select id="sched-nsId" class="form-control form-control-sm">
              ${nsOptions}
            </select>
          </div>
        </div>

        <div class="filter-mode-tabs">
          <div class="filter-mode-tab active" data-mode="hierarchy">
            🌐 Provider/Region/Zone (Recommended)
          </div>
          <div class="filter-mode-tab" data-mode="connection">
            🔗 Connection Name (Legacy)
          </div>
        </div>

        <div id="filter-hierarchy" class="filter-mode-content active">
          <div class="form-row">
            <div class="form-col">
              <label>Provider</label>
              <select id="sched-provider" class="form-control form-control-sm">
                ${providerOptions}
              </select>
              <small>Leave empty for all providers</small>
            </div>
          </div>
          <div class="form-row">
            <div class="form-col">
              <label>Region</label>
              <select id="sched-region" class="form-control form-control-sm" disabled>
                <option value="">All Regions</option>
              </select>
              <small>Select provider first</small>
            </div>
            <div class="form-col">
              <label>Zone</label>
              <select id="sched-zone" class="form-control form-control-sm" disabled>
                <option value="">All Zones</option>
              </select>
              <small>Select region first</small>
            </div>
          </div>
        </div>

        <div id="filter-connection" class="filter-mode-content">
          <div class="form-row">
            <div class="form-col">
              <label>Connection Name</label>
              <select id="sched-connection" class="form-control form-control-sm">
                ${connOptions}
              </select>
              <small>Leave empty for all connections</small>
            </div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-col">
            <label>Interval (seconds) *</label>
            <input type="number" id="sched-interval" class="form-control form-control-sm" value="3600" min="10">
            <small>Min: 10s, Recommended: 1800s+</small>
          </div>
          <div class="form-col">
            <label>Infra Name Prefix</label>
            <input type="text" id="sched-infraPrefix" class="form-control form-control-sm" value="${defaultInfraPrefix}" placeholder="e.g., reg-a3f9">
            <small>Auto-generated: reg-xxxx</small>
          </div>
        </div>
        <div class="form-row">
          <div class="form-col">
            <label>Registration Option</label>
            <div class="schedule-option-dropdown">
              <button type="button" class="schedule-option-btn" id="sched-option-btn">
                <span id="sched-option-text">All Resources</span>
              </button>
              <div class="schedule-option-menu" id="sched-option-menu">
                <div class="schedule-option-item">
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="sched-option-all" value="" checked>
                    <label class="form-check-label" for="sched-option-all">All Resources</label>
                  </div>
                </div>
                <div class="schedule-option-item">
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="sched-option-vnet" value="vNet">
                    <label class="form-check-label" for="sched-option-vnet">vNet</label>
                  </div>
                </div>
                <div class="schedule-option-item">
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="sched-option-sg" value="securityGroup">
                    <label class="form-check-label" for="sched-option-sg">securityGroup</label>
                  </div>
                </div>
                <div class="schedule-option-item">
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="sched-option-sshkey" value="sshKey">
                    <label class="form-check-label" for="sched-option-sshkey">sshKey</label>
                  </div>
                </div>
                <div class="schedule-option-item">
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="sched-option-node" value="node">
                    <label class="form-check-label" for="sched-option-node">node</label>
                  </div>
                </div>
                <div class="schedule-option-item">
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" id="sched-option-customimage" value="customImage">
                    <label class="form-check-label" for="sched-option-customimage">customImage</label>
                  </div>
                </div>
              </div>
            </div>
            <small>Default : All Resources</small>
          </div>
          <div class="form-col">
            <label>Infra Flag</label>
            <select id="sched-infraFlag" class="form-control form-control-sm">
              <option value="y">Single Infra</option>
              <option value="n">Separate per Node</option>
            </select>
          </div>
        </div>
        <button onclick="createScheduleJobFromModal()" class="btn btn-primary btn-block">➕ Create Schedule Job</button>
        
        <hr>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h5 style="margin: 0;">📋 Existing Schedule Jobs</h5>
          <div>
            <button id="refreshJobsBtn" class="btn btn-info btn-sm" style="margin-right: 5px;">🔄 Refresh</button>
            <button id="toggleJobAutoRefreshBtn" class="btn btn-success btn-sm">⏸️ Pause Auto-refresh</button>
          </div>
        </div>
        <div style="font-size: 11px; color: #6c757d; margin-bottom: 8px;">
          <span id="jobAutoRefreshStatus">🟢 Auto-refreshing every 10 seconds</span> | 
          <span id="jobLastRefreshTime">Last refresh: -</span>
        </div>
        <div id="scheduleJobListContainer" style="max-height: 450px; overflow-y: auto;">
          <p class="text-muted">Loading schedule jobs...</p>
        </div>
      </div>
    `,
    width: '50%',
    customClass: {
      popup: 'schedule-job-modal-popup'
    },
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '❌ Close',
    didOpen: () => {
      // Store providerMap for later use
      window.scheduleProviderMap = providerMap;

      // Enable auto-refresh
      window.scheduleJobAutoRefreshEnabled = true;

      // Setup filter mode tabs
      const filterModeTabs = document.querySelectorAll('.filter-mode-tab');
      const filterModeContents = document.querySelectorAll('.filter-mode-content');

      filterModeTabs.forEach(tab => {
        tab.addEventListener('click', function() {
          const mode = this.getAttribute('data-mode');

          // Update tabs
          filterModeTabs.forEach(t => t.classList.remove('active'));
          this.classList.add('active');

          // Update content
          filterModeContents.forEach(content => {
            content.classList.remove('active');
          });
          document.getElementById(`filter-${mode}`).classList.add('active');
        });
      });

      // Setup provider/region/zone cascading selects
      const providerSelect = document.getElementById('sched-provider');
      const regionSelect = document.getElementById('sched-region');
      const zoneSelect = document.getElementById('sched-zone');

      if (providerSelect && regionSelect && zoneSelect) {
        providerSelect.addEventListener('change', function() {
          const selectedProvider = this.value;

          // Reset and disable region/zone
          regionSelect.innerHTML = '<option value="">All Regions</option>';
          regionSelect.disabled = !selectedProvider;
          zoneSelect.innerHTML = '<option value="">All Zones</option>';
          zoneSelect.disabled = true;

          if (selectedProvider && providerMap[selectedProvider]) {
            const regions = Object.keys(providerMap[selectedProvider].regions).sort();
            regions.forEach(region => {
              const option = document.createElement('option');
              option.value = region;
              option.textContent = region;
              regionSelect.appendChild(option);
            });
          }
        });

        regionSelect.addEventListener('change', function() {
          const selectedProvider = providerSelect.value;
          const selectedRegion = this.value;

          // Reset and disable zone
          zoneSelect.innerHTML = '<option value="">All Zones</option>';
          zoneSelect.disabled = !selectedRegion;

          if (selectedProvider && selectedRegion &&
              providerMap[selectedProvider]?.regions[selectedRegion]) {
            const zones = providerMap[selectedProvider].regions[selectedRegion].zones.sort();
            zones.forEach(zone => {
              const option = document.createElement('option');
              option.value = zone;
              option.textContent = zone;
              zoneSelect.appendChild(option);
            });
          }
        });
      }

      // Setup dropdown toggle
      const dropdownBtn = document.getElementById('sched-option-btn');
      const dropdownMenu = document.getElementById('sched-option-menu');
      const dropdownText = document.getElementById('sched-option-text');
      
      if (dropdownBtn && dropdownMenu) {
        dropdownBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          dropdownMenu.classList.toggle('show');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
          if (!dropdownMenu.contains(e.target) && e.target !== dropdownBtn) {
            dropdownMenu.classList.remove('show');
          }
        });
      }
      
      // Function to update button text based on selections
      const updateDropdownText = () => {
        const allCheckbox = document.getElementById('sched-option-all');
        if (allCheckbox && allCheckbox.checked) {
          dropdownText.textContent = 'All Resources';
          return;
        }
        
        const selected = [];
        const checkboxes = [
          { id: 'sched-option-vnet', label: 'vNet' },
          { id: 'sched-option-sg', label: 'securityGroup' },
          { id: 'sched-option-sshkey', label: 'sshKey' },
          { id: 'sched-option-node', label: 'node' },
          { id: 'sched-option-customimage', label: 'customImage' }
        ];
        
        checkboxes.forEach(cb => {
          const checkbox = document.getElementById(cb.id);
          if (checkbox && checkbox.checked) {
            selected.push(cb.label);
          }
        });
        
        if (selected.length === 0) {
          dropdownText.textContent = 'Select options...';
        } else if (selected.length <= 2) {
          dropdownText.textContent = selected.join(', ');
        } else {
          dropdownText.textContent = `${selected.length} options selected`;
        }
      };
      
      // Setup checkbox behavior for Registration Option
      const allCheckbox = document.getElementById('sched-option-all');
      const resourceCheckboxes = [
        'sched-option-vnet',
        'sched-option-sg',
        'sched-option-sshkey',
        'sched-option-node',
        'sched-option-customimage'
      ];
      
      if (allCheckbox) {
        allCheckbox.addEventListener('change', function() {
          if (this.checked) {
            resourceCheckboxes.forEach(id => {
              const cb = document.getElementById(id);
              if (cb) cb.checked = false;
            });
          }
          updateDropdownText();
        });
      }
      
      resourceCheckboxes.forEach(id => {
        const cb = document.getElementById(id);
        if (cb) {
          cb.addEventListener('change', function() {
            if (this.checked && allCheckbox) {
              allCheckbox.checked = false;
            }
            updateDropdownText();
          });
        }
      });
      
      // Setup refresh now button
      const refreshBtn = document.getElementById('refreshJobsBtn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadScheduleJobsInModal());
      }
      
      // Setup toggle auto-refresh button
      const toggleBtn = document.getElementById('toggleJobAutoRefreshBtn');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          window.scheduleJobAutoRefreshEnabled = !window.scheduleJobAutoRefreshEnabled;
          const status = document.getElementById('jobAutoRefreshStatus');
          
          if (window.scheduleJobAutoRefreshEnabled) {
            toggleBtn.innerHTML = '⏸️ Pause Auto-refresh';
            toggleBtn.className = 'btn btn-success btn-sm';
            if (status) status.innerHTML = '🟢 Auto-refreshing every 10 seconds';
          } else {
            toggleBtn.innerHTML = '▶️ Resume Auto-refresh';
            toggleBtn.className = 'btn btn-warning btn-sm';
            if (status) status.innerHTML = '🔴 Auto-refresh paused';
          }
        });
      }
      
      // Initial load
      setTimeout(() => loadScheduleJobsInModal(), 100);
      
      // Start auto-refresh timer (10 seconds)
      if (window.scheduleJobAutoRefreshInterval) {
        clearInterval(window.scheduleJobAutoRefreshInterval);
      }
      window.scheduleJobAutoRefreshInterval = setInterval(() => {
        if (window.scheduleJobAutoRefreshEnabled && Swal.isVisible()) {
          loadScheduleJobsInModal();
        }
      }, 10000);
    },
    willClose: () => {
      // Stop auto-refresh
      window.scheduleJobAutoRefreshEnabled = false;
      if (window.scheduleJobAutoRefreshInterval) {
        clearInterval(window.scheduleJobAutoRefreshInterval);
        window.scheduleJobAutoRefreshInterval = null;
      }
    }
  });
}
window.showScheduleJobManagement = showScheduleJobManagement;

// Load Schedule Jobs in Modal
async function loadScheduleJobsInModal() {
  const config = getConfig();
  const container = document.getElementById('scheduleJobListContainer');
  const lastRefreshTime = document.getElementById('jobLastRefreshTime');
  
  if (!container) return;
  
  try {
    const response = await axios.get(
      `http://${config.hostname}:${config.port}/tumblebug/registerCspResources/schedule`,
      { auth: { username: config.username, password: config.password } }
    );
    
    const jobs = response.data.jobs || [];
    
    if (lastRefreshTime) {
      lastRefreshTime.innerHTML = `Last refresh: ${new Date().toLocaleTimeString()}`;
    }
    
    if (jobs.length === 0) {
      container.innerHTML = '<p class="text-muted text-center" style="padding: 20px;">No schedule jobs found. Create one above!</p>';
      return;
    }
    
    // Build job cards
    container.innerHTML = jobs.map(job => {
      // Execution State Badge (Scheduled, Executing, Stopped)
      let executionStateBadge = '';
      if (job.status === 'Executing') {
        executionStateBadge = '<span class="badge badge-warning">⚙️ Executing</span>';
      } else if (job.status === 'Stopped') {
        executionStateBadge = '<span class="badge badge-secondary">⏹️ Stopped</span>';
      } else { // Default to Scheduled
        executionStateBadge = '<span class="badge badge-info">📅 Scheduled</span>';
      }
      
      // Enabled/Paused Badge (only for active jobs, not for stopped)
      let enabledBadge = '';
      if (job.status !== 'Stopped') {
        enabledBadge = job.enabled ? 
          '<span class="badge badge-success">✅ Active</span>' : 
          '<span class="badge badge-dark">⏸️ Paused</span>';
      }
      
      // Auto-Disabled Warning
      const autoDisabledBadge = job.autoDisabled ? 
        '<span class="badge badge-danger">⚠️ Auto-Disabled</span>' : '';
      
      return `
        <div class="job-card">
          <div class="job-card-header">
            <div class="job-card-title">${job.jobId}</div>
            <div>${executionStateBadge} ${enabledBadge} ${autoDisabledBadge}</div>
          </div>
          <div class="job-card-body" style="padding: 8px 12px;">
            <div style="font-size: 0.9em; line-height: 1.6;">
              <strong>NS:</strong> ${job.nsId} |
              ${job.provider || job.region || job.zone ?
                `<strong>Filter:</strong> ${job.provider || 'All'}${job.region ? `/${job.region}` : ''}${job.zone ? `/${job.zone}` : ''} | ` :
                `<strong>Conn:</strong> ${job.connectionName || 'All'} | `
              }
              <strong>Interval:</strong> ${job.intervalSeconds}s (${Math.round(job.intervalSeconds/60)}m) |
              <strong>Infra Prefix:</strong> ${job.infraNamePrefix || '-'} |
              <strong>Stats:</strong> Exec: ${job.executionCount}, Success: <span class="text-success">${job.successCount}</span>, Fail: <span class="text-danger">${job.failureCount}</span> (Consecutive: ${job.consecutiveFailures}) |
              <strong>Next:</strong> ${new Date(job.nextExecutionAt).toLocaleString()}${job.lastExecutionAt ? ` | <strong>Last:</strong> ${new Date(job.lastExecutionAt).toLocaleString()}` : ''}
            </div>
          </div>
          <div class="job-card-footer">
            <button class="btn btn-info btn-sm" onclick="viewJobDetails('${job.jobId}')">🔍 Details</button>
            ${job.enabled ? 
              `<button class="btn btn-warning btn-sm" onclick="pauseJobFromModal('${job.jobId}')">⏸️ Pause</button>` :
              `<button class="btn btn-success btn-sm" onclick="resumeJobFromModal('${job.jobId}')">▶️ Resume</button>`
            }
            <button class="btn btn-danger btn-sm" onclick="deleteJobFromModal('${job.jobId}')">🗑️ Delete</button>
          </div>
        </div>
      `;
    }).join('');
    
  } catch (error) {
    console.error('Error loading schedule jobs:', error);
    container.innerHTML = '<p class="text-danger text-center">Error loading jobs. Please try again.</p>';
  }
}
window.loadScheduleJobsInModal = loadScheduleJobsInModal;

// Create Schedule Job from Modal
async function createScheduleJobFromModal() {
  const config = getConfig();
  const nsId = document.getElementById('sched-nsId').value;
  const intervalSeconds = parseInt(document.getElementById('sched-interval').value);
  const infraNamePrefix = document.getElementById('sched-infraPrefix').value;

  // Determine active filter mode
  const activeFilterMode = document.querySelector('.filter-mode-tab.active')?.getAttribute('data-mode') || 'hierarchy';

  // Get filter values based on mode
  let connectionName = '';
  let provider = '';
  let region = '';
  let zone = '';

  if (activeFilterMode === 'connection') {
    connectionName = document.getElementById('sched-connection')?.value || '';
  } else {
    // hierarchy mode
    provider = document.getElementById('sched-provider')?.value || '';
    region = document.getElementById('sched-region')?.value || '';
    zone = document.getElementById('sched-zone')?.value || '';
  }

  // Get selected options from checkboxes
  const allCheckbox = document.getElementById('sched-option-all');
  let option = '';
  if (allCheckbox && allCheckbox.checked) {
    option = ''; // All Resources (empty string)
  } else {
    const selectedOptions = [];
    const optionCheckboxes = [
      { id: 'sched-option-vnet', value: 'vNet' },
      { id: 'sched-option-sg', value: 'securityGroup' },
      { id: 'sched-option-sshkey', value: 'sshKey' },
      { id: 'sched-option-node', value: 'node' },
      { id: 'sched-option-customimage', value: 'customImage' }
    ];
    optionCheckboxes.forEach(opt => {
      const checkbox = document.getElementById(opt.id);
      if (checkbox && checkbox.checked) {
        selectedOptions.push(opt.value);
      }
    });
    option = selectedOptions.join(',');
  }

  const infraFlag = document.getElementById('sched-infraFlag').value;

  if (!nsId || !intervalSeconds || intervalSeconds < 10) {
    Swal.fire('❌ Error', 'Please fill required fields correctly (interval min: 10s)', 'error');
    return;
  }

  const spinnerId = addSpinnerTask("Creating schedule job");

  try {
    const requestBody = {
      jobType: "registerCspResources",
      nsId,
      intervalSeconds,
      infraNamePrefix,
      option,
      infraFlag
    };

    // Add filter fields based on mode
    if (activeFilterMode === 'connection') {
      if (connectionName) requestBody.connectionName = connectionName;
    } else {
      if (provider) requestBody.provider = provider;
      if (region) requestBody.region = region;
      if (zone) requestBody.zone = zone;
    }
    
    const response = await axios.post(
      `http://${config.hostname}:${config.port}/tumblebug/registerCspResources/schedule`,
      requestBody,
      {
        headers: { "Content-Type": "application/json" },
        auth: { username: config.username, password: config.password }
      }
    );
    
    console.log("Schedule Job Created:", response.data);
    displayJsonData(response.data, typeInfo);
    
    Swal.fire({
      icon: 'success',
      title: '✅ Job Created!',
      html: `Schedule job created successfully: <br><code>${response.data.jobId}</code>`,
      timer: 2000,
      showConfirmButton: false
    }).then(() => {
      // Refresh job list
      loadScheduleJobsInModal();
      // Reopen management modal
      showScheduleJobManagement();
    });
    
  } catch (error) {
    console.error("Error creating schedule job:", error);
    const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
    Swal.fire('❌ Error', `Failed to create job: ${errorMsg}`, 'error');
  } finally {
    removeSpinnerTask(spinnerId);
  }
}
window.createScheduleJobFromModal = createScheduleJobFromModal;

// View Job Details
async function viewJobDetails(jobId) {
  const config = getConfig();
  const spinnerId = addSpinnerTask("Loading job details");
  
  try {
    const response = await axios.get(
      `http://${config.hostname}:${config.port}/tumblebug/registerCspResources/schedule/${jobId}`,
      { auth: { username: config.username, password: config.password } }
    );
    
    const job = response.data;
    displayJsonData(response.data, typeInfo);
    
    const detailsHtml = `
      <div style="text-align: left; font-size: 13px;">
        <table class="table table-sm table-bordered">
          <tr><th style="width: 40%; background-color: #f8f9fa;">Job ID</th><td style="font-family: monospace; font-size: 11px;">${job.jobId}</td></tr>
          <tr><th style="background-color: #f8f9fa;">Job Type</th><td>${job.jobType}</td></tr>
          <tr><th style="background-color: #f8f9fa;">Namespace</th><td><span class="badge badge-info">${job.nsId}</span></td></tr>
          ${job.provider || job.region || job.zone ?
            `<tr><th style="background-color: #f8f9fa;">Target Filter</th><td>
              <strong>Provider:</strong> ${job.provider || 'All'}<br>
              <strong>Region:</strong> ${job.region || 'All'}<br>
              <strong>Zone:</strong> ${job.zone || 'All'}
            </td></tr>` :
            `<tr><th style="background-color: #f8f9fa;">Connection</th><td>${job.connectionName || '<span class="badge badge-secondary">All Connections</span>'}</td></tr>`
          }
          <tr><th style="background-color: #f8f9fa;">Infra Prefix</th><td>${job.infraNamePrefix || '-'}</td></tr>
          <tr><th style="background-color: #f8f9fa;">Option</th><td>${job.option || 'All Resources'}</td></tr>
          <tr><th style="background-color: #f8f9fa;">Infra Flag</th><td>${job.infraFlag === 'y' ? 'Single Infra' : 'Separate per Node'}</td></tr>
          <tr><th style="background-color: #f8f9fa;">Interval</th><td><strong>${job.intervalSeconds}</strong> seconds (${Math.round(job.intervalSeconds/60)} minutes)</td></tr>
          <tr><th style="background-color: #f8f9fa;">Status</th><td>
            ${job.enabled ? '<span class="badge badge-success">🟢 Enabled</span>' : '<span class="badge badge-secondary">⚫ Disabled</span>'}
            ${job.autoDisabled ? '<span class="badge badge-warning">⚠️ Auto-Disabled</span>' : ''}
          </td></tr>
          <tr><th style="background-color: #f8f9fa;">Execution Count</th><td>${job.executionCount}</td></tr>
          <tr><th style="background-color: #f8f9fa;">Success Count</th><td class="text-success"><strong>${job.successCount}</strong></td></tr>
          <tr><th style="background-color: #f8f9fa;">Failure Count</th><td class="text-danger"><strong>${job.failureCount}</strong></td></tr>
          <tr><th style="background-color: #f8f9fa;">Consecutive Failures</th><td>${job.consecutiveFailures}</td></tr>
          <tr><th style="background-color: #f8f9fa;">Next Execution</th><td><strong>${new Date(job.nextExecutionAt).toLocaleString()}</strong></td></tr>
          <tr><th style="background-color: #f8f9fa;">Created At</th><td>${new Date(job.createdAt).toLocaleString()}</td></tr>
          ${job.lastExecutionAt ? `<tr><th style="background-color: #f8f9fa;">Last Execution</th><td>${new Date(job.lastExecutionAt).toLocaleString()}</td></tr>` : ''}
        </table>
      </div>
    `;
    
    Swal.fire({
      title: '🔍 Job Details',
      html: detailsHtml,
      width: '650px',
      confirmButtonText: '👍 OK'
    }).then(() => {
      showScheduleJobManagement();
    });
    
  } catch (error) {
    console.error("Error loading job details:", error);
    const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
    Swal.fire('❌ Error', `Failed to load job details: ${errorMsg}`, 'error');
  } finally {
    removeSpinnerTask(spinnerId);
  }
}
window.viewJobDetails = viewJobDetails;

// Pause Job from Modal
async function pauseJobFromModal(jobId) {
  const config = getConfig();
  const spinnerId = addSpinnerTask("Pausing job");
  
  try {
    await axios.put(
      `http://${config.hostname}:${config.port}/tumblebug/registerCspResources/schedule/${jobId}/pause`,
      {},
      { auth: { username: config.username, password: config.password } }
    );
    
    Swal.fire({
      icon: 'success',
      title: '⏸️ Job Paused',
      text: `Job paused: ${jobId}`,
      timer: 1500,
      showConfirmButton: false
    }).then(() => {
      // Reopen Schedule Job Management modal
      showScheduleJobManagement();
    });
    
  } catch (error) {
    console.error("Error pausing job:", error);
    const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
    Swal.fire('❌ Error', `Failed to pause job: ${errorMsg}`, 'error');
  } finally {
    removeSpinnerTask(spinnerId);
  }
}
window.pauseJobFromModal = pauseJobFromModal;

// Resume Job from Modal
async function resumeJobFromModal(jobId) {
  const config = getConfig();
  const spinnerId = addSpinnerTask("Resuming job");
  
  try {
    await axios.put(
      `http://${config.hostname}:${config.port}/tumblebug/registerCspResources/schedule/${jobId}/resume`,
      {},
      { auth: { username: config.username, password: config.password } }
    );
    
    Swal.fire({
      icon: 'success',
      title: '▶️ Job Resumed',
      text: `Job resumed: ${jobId}`,
      timer: 1500,
      showConfirmButton: false
    }).then(() => {
      // Reopen Schedule Job Management modal
      showScheduleJobManagement();
    });
    
  } catch (error) {
    console.error("Error resuming job:", error);
    const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
    Swal.fire('❌ Error', `Failed to resume job: ${errorMsg}`, 'error');
  } finally {
    removeSpinnerTask(spinnerId);
  }
}
window.resumeJobFromModal = resumeJobFromModal;

// Delete Job from Modal
async function deleteJobFromModal(jobId) {
  const result = await Swal.fire({
    title: '⚠️ Confirm Delete',
    html: `Are you sure you want to delete this job?<br><code>${jobId}</code>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: '✅ Yes, delete it',
    confirmButtonColor: '#dc3545',
    cancelButtonText: '❌ Cancel'
  });
  
  if (!result.isConfirmed) return;
  
  const config = getConfig();
  const spinnerId = addSpinnerTask("Deleting job");
  
  try {
    await axios.delete(
      `http://${config.hostname}:${config.port}/tumblebug/registerCspResources/schedule/${jobId}`,
      { auth: { username: config.username, password: config.password } }
    );
    
    Swal.fire({
      icon: 'success',
      title: '🗑️ Job Deleted',
      text: `Job deleted: ${jobId}`,
      timer: 1500,
      showConfirmButton: false
    }).then(() => {
      // Reopen Schedule Job Management modal
      showScheduleJobManagement();
    });
    
  } catch (error) {
    console.error("Error deleting job:", error);
    const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
    Swal.fire('❌ Error', `Failed to delete job: ${errorMsg}`, 'error');
  } finally {
    removeSpinnerTask(spinnerId);
  }
}
window.deleteJobFromModal = deleteJobFromModal;

// ==================== End of Schedule Resource Registration Functions ====================

// ==================== Credential Holder Functions ====================

// Cached credential holder list (populated at startup)
var cachedCredentialHolderList = [];

// Load credential holder list from CB-Tumblebug API
function updateCredentialHolderList(callback) {
  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;

  if (hostname && hostname != "" && port && port != "") {
    var url = `http://${hostname}:${port}/tumblebug/credentialHolder`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    })
      .then((res) => {
        cachedCredentialHolderList = res.data.credentialHolderList || [];
        console.log('[CredentialHolder] Loaded ' + cachedCredentialHolderList.length + ' holders');
        // Update UI displays
        updateHolderStatusDisplays();
        if (callback) callback(cachedCredentialHolderList);
      })
      .catch((err) => {
        console.warn("[CredentialHolder] Failed to load holder list:", err.message || err);
        cachedCredentialHolderList = [{ credentialHolder: "admin", providers: [], verifiedConnectionCount: 0 }];
        updateHolderStatusDisplays();
        if (callback) callback(cachedCredentialHolderList);
      });
  }
}

// Update all UI displays showing current holder
function updateHolderStatusDisplays() {
  // Update map controls badge
  var holderNameEl = document.getElementById('mapHolderName');
  if (holderNameEl) {
    holderNameEl.textContent = configCredentialHolder;
  }

}

// Update NS ID map badge
function updateNsDisplays() {
  var nsName = configNamespace || '—';
  var mapNsNameEl = document.getElementById('mapNsName');
  if (mapNsNameEl) mapNsNameEl.textContent = nsName;
}

// Change active namespace and refresh dependent lists
function applyNamespace(newNs) {
  if (newNs === configNamespace) return;
  var oldNs = configNamespace;
  configNamespace = newNs;
  window.configNamespace = newNs;
  console.log('[Namespace] Changed: ' + oldNs + ' → ' + newNs);
  updateNsDisplays();
  updateInfraList();
}

// Change credential holder and reload connections + map
function applyCredentialHolder(newHolder) {
  if (newHolder === configCredentialHolder) return;
  
  var oldHolder = configCredentialHolder;
  configCredentialHolder = newHolder;
  console.log('[CredentialHolder] Changed: ' + oldHolder + ' → ' + newHolder);

  // Update all status displays
  updateHolderStatusDisplays();

  // Reload connections filtered by new holder → re-render map
  reloadConnectionsForHolder();
}

// Reload connections from CB-TB with current holder filter, then refresh map
function reloadConnectionsForHolder() {
  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;

  var url = `http://${hostname}:${port}/tumblebug/connConfig?filterVerified=true&filterRegionRepresentative=true&filterCredentialHolder=${encodeURIComponent(configCredentialHolder)}`;

  console.log('[CredentialHolder] Reloading connections for holder:', configCredentialHolder);
  updateMapConnectionStatus('connecting');

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 15000,
  })
    .then((res) => {
      var connData = res.data;
      if (connData.connectionconfig) {
        console.log('[CredentialHolder] Loaded ' + connData.connectionconfig.length + ' connections for holder: ' + configCredentialHolder);
        
        // Clear and re-process connection data on the map
        // We need to use the same processConnectionData logic
        // Since processConnectionData is a closure in checkConnectionWithRetry,
        // we replicate the essential logic here:
        window.cloudBaristaCentralData.connection = connData.connectionconfig;

        // Clear existing CSP points
        Object.keys(cspPoints).forEach(key => { cspPoints[key] = []; });
        Object.keys(geoCspPoints).forEach(key => { geoCspPoints[key] = []; });

        // Re-populate from new connection data
        connData.connectionconfig.forEach((connConfig) => {
          var providerName = connConfig.providerName;
          if (!providerName) return;
          var longitude = connConfig.regionDetail?.location?.longitude;
          var latitude = connConfig.regionDetail?.location?.latitude;
          if (longitude == null || latitude == null) return;

          if (!cspPoints[providerName]) {
            cspPoints[providerName] = [];
          }
          cspPoints[providerName].push([parseFloat(longitude), parseFloat(latitude)]);
        });

        // Rebuild geoCspPoints with MultiPoint geometries
        Object.keys(cspPoints).forEach(providerName => {
          if (cspPoints[providerName].length > 0) {
            if (!geoCspPoints[providerName]) {
              geoCspPoints[providerName] = [];
            }
            geoCspPoints[providerName][0] = new MultiPoint(cspPoints[providerName]);
          }
        });

        // Refresh provider checkboxes to match new connection data
        var providerCheckboxContainer = document.getElementById('provider-checkboxes');
        if (providerCheckboxContainer) {
          providerCheckboxContainer.innerHTML = '';
          Object.keys(cspPoints).forEach(providerName => {
            if (cspPoints[providerName].length === 0) return;
            var checkboxDiv = document.createElement('div');
            checkboxDiv.className = 'dropdown-item-text';
            var formCheckDiv = document.createElement('div');
            formCheckDiv.className = 'form-check';
            var checkbox = document.createElement('input');
            checkbox.className = 'form-check-input';
            checkbox.type = 'checkbox';
            checkbox.id = 'provider-' + providerName;
            checkbox.value = providerName;
            var label = document.createElement('label');
            label.className = 'form-check-label';
            label.setAttribute('for', 'provider-' + providerName);
            label.textContent = providerName.toUpperCase();
            formCheckDiv.appendChild(checkbox);
            formCheckDiv.appendChild(label);
            checkboxDiv.appendChild(formCheckDiv);
            providerCheckboxContainer.appendChild(checkboxDiv);
            checkbox.addEventListener('change', function() {
              var allCb = document.getElementById('provider-all');
              if (this.checked && allCb) { allCb.checked = false; }
              updateMapBasedOnProviders();
              updateProviderDropdownText();
            });
          });
          // Reset "ALL" checkbox to checked
          var allCb = document.getElementById('provider-all');
          if (allCb) { allCb.checked = true; }
          updateProviderDropdownText();
        }

        // Force map re-render
        map.render();
        var view = map.getView();
        if (view) view.changed();
        setTimeout(() => { map.render(); }, 100);
        setTimeout(() => { map.render(); }, 500);

        updateMapConnectionStatus('connected');

        // Also refresh Infra data and namespace list for new holder context
        updateNsList();
        getInfra();
      } else {
        console.log('[CredentialHolder] No connections for holder:', configCredentialHolder);
        // Clear map points
        Object.keys(cspPoints).forEach(key => { cspPoints[key] = []; });
        Object.keys(geoCspPoints).forEach(key => { geoCspPoints[key] = []; });
        window.cloudBaristaCentralData.connection = [];
        map.render();
        updateMapConnectionStatus('connected');
      }
    })
    .catch((err) => {
      console.error('[CredentialHolder] Failed to reload connections:', err);
      updateMapConnectionStatus('disconnected');
    });
}
window.reloadConnectionsForHolder = reloadConnectionsForHolder;

// ==================== End of Credential Holder Functions ====================

function updateNsList() {
  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;

  if (!hostname || hostname === "" || !port || port === "") return;

  var url = `http://${hostname}:${port}/tumblebug/ns?option=id`;

  axios({
    method: "get",
    url: url,
    auth: { username, password },
  })
    .then((res) => {
      if (res.data.output != null) {
        cachedNamespaceList = res.data.output.filter(item => item && item.trim() !== "");

        // If no namespace selected yet, pick the first one
        if (!configNamespace && cachedNamespaceList.length > 0) {
          configNamespace = cachedNamespaceList[0];
          window.configNamespace = configNamespace;
        }
        // If current selection no longer in list, reset to first
        if (configNamespace && !cachedNamespaceList.includes(configNamespace) && cachedNamespaceList.length > 0) {
          configNamespace = cachedNamespaceList[0];
          window.configNamespace = configNamespace;
        }

        updateNsDisplays();

        // Update Settings modal NS select if currently open
        var settingsNsSelect = document.getElementById('settings-namespace');
        if (settingsNsSelect) {
          settingsNsSelect.innerHTML = cachedNamespaceList.map(ns => {
            const safeNs = window.escapeHtml(ns);
            const selected = ns === configNamespace ? 'selected' : '';
            return `<option value="${safeNs}" ${selected}>${safeNs}</option>`;
          }).join('');
        }
      }
    })
    .finally(function () {
      updateInfraList();
    });
}

// (syncNamespaceSelection removed — namespace is now a global configNamespace)

var infraList = [];
var infraHideList = [];

function updateInfraList() {
  // Clear options in 'select'
  var selectElement = document.getElementById("infraid");
  var previousSelection = selectElement.value;
  var i,
    L = selectElement.options.length - 1;
  for (i = L; i >= 0; i--) {
    selectElement.remove(i);
  }

  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;

  if (namespace && namespace != "") {
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra?option=id`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    })
      .then((res) => {
        if (res.data.output != null) {
          // infraList = res.data.output;
          for (let item of res.data.output) {
            if (item && item.trim() !== "") {
              var option = document.createElement("option");
              option.value = item;
              option.text = item;
              selectElement.appendChild(option);
            }
          }
          for (let i = 0; i < selectElement.options.length; i++) {
            if (selectElement.options[i].value == previousSelection) {
              selectElement.options[i].selected = true;
              break;
            }
          }
        }
      })
      .finally(function () {
        updateNodeAndIpListsFromInfra();
        updateResourceList(typeStringVNet);
        updateResourceList(typeStringSG);
        updateResourceList(typeStringSshKey);
        // updateResourceList(typeStringSpec);
        // updateResourceList(typeStringImage);
      });
  }
}
window.updateInfraList = updateInfraList;

document.getElementById("infraid").onmouseover = function () {
  updateInfraList();
};
document.getElementById("infraid").onchange = function () {
  updateNodeAndIpListsFromInfra();
};

function updateVmList() {
  // This function is now deprecated as Node list is updated via updateNodeAndIpListsFromInfra()
  // Keeping for backward compatibility, but functionality moved to unified function
}
window.updateVmList = updateVmList;

document.getElementById("nodeid").addEventListener('change', function () {
  // When Node is selected, auto-select corresponding IP
  var selectedNodeId = this.value;
  var pubipSelect = document.getElementById("pubip");
  
  // Find and select the IP option that contains this Node ID
  for (let i = 0; i < pubipSelect.options.length; i++) {
    var optionText = pubipSelect.options[i].text;
    if (optionText.includes(`(${selectedNodeId},`)) {
      pubipSelect.options[i].selected = true;
      break;
    }
  }
});

function updateIpList() {
  // This function is now deprecated as IP list is updated via updateNodeAndIpListsFromInfra()
  // Keeping for backward compatibility, but functionality moved to unified function
}
window.updateIpList = updateIpList;

function updateNodeGroupList() {
  // This function is now deprecated as NodeGroup selection is removed from UI
  // NodeGroup information is now shown in Node ID dropdown as "node-id (nodegroup-id)"
}
window.updateNodeGroupList = updateNodeGroupList;

// NodeGroup selection element no longer exists in UI

// New unified function to update Node and IP lists from Infra data
function updateNodeAndIpListsFromInfra() {
  var nodeSelectElement = document.getElementById("nodeid");
  var ipSelectElement = document.getElementById("pubip");
  var previousNodeSelection = nodeSelectElement.value;
  var previousIpSelection = ipSelectElement.value;
  
  // Clear existing options
  while (nodeSelectElement.options.length > 0) {
    nodeSelectElement.remove(0);
  }
  while (ipSelectElement.options.length > 0) {
    ipSelectElement.remove(0);
  }

  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;
  var infraid = infraidElement.value;

  if (namespace && namespace != "" && infraid && infraid != "") {
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraid}`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    })
      .then((res) => {
        if (res.data && res.data.node) {
          res.data.node.forEach(nd => {
            // Add Node option with NodeGroup info
            var nodeOption = document.createElement("option");
            nodeOption.value = nd.id;
            nodeOption.text = `${nd.id} (${nd.nodeGroupId || 'default'})`;
            nodeSelectElement.appendChild(nodeOption);

            // Add IP option with Node and NodeGroup info
            if (nd.publicIP && nd.publicIP.trim() !== "") {
              var ipOption = document.createElement("option");
              ipOption.value = nd.publicIP;
              ipOption.text = `${nd.publicIP} (${nd.id}, ${nd.nodeGroupId || 'default'})`;
              ipSelectElement.appendChild(ipOption);
            }
          });

          // Restore previous selections if they still exist
          for (let i = 0; i < nodeSelectElement.options.length; i++) {
            if (nodeSelectElement.options[i].value === previousNodeSelection) {
              nodeSelectElement.options[i].selected = true;
              break;
            }
          }
          for (let i = 0; i < ipSelectElement.options.length; i++) {
            if (ipSelectElement.options[i].value === previousIpSelection) {
              ipSelectElement.options[i].selected = true;
              break;
            }
          }
        }
      })
      .catch(function (error) {
        console.error("Error updating Node and IP lists:", error);
      });
  }
}
window.updateNodeAndIpListsFromInfra = updateNodeAndIpListsFromInfra;

// Helper function to extract NodeGroup ID from Node selection text
function getNodeGroupIdFromNodeSelection() {
  var nodeSelect = document.getElementById("nodeid");
  var selectedOption = nodeSelect.options[nodeSelect.selectedIndex];
  if (selectedOption && selectedOption.text) {
    // Extract NodeGroup ID from text like "node-id (nodegroup-id)"
    var match = selectedOption.text.match(/\(([^)]+)\)$/);
    if (match) {
      return match[1];
    }
  }
  return "";
}

function updateResourceList(resourceType) {
  var selectElement = document.getElementById(resourceType);
  var previousSelection = selectElement.value;
  var i,
    L = selectElement.options.length - 1;
  for (i = L; i >= 0; i--) {
    selectElement.remove(i);
  }

  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;

  if (namespace && namespace != "" && resourceType && resourceType != "") {
    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/resources/${resourceType}?option=id`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    }).then((res) => {
      if (res.data.output != null) {
        for (let item of res.data.output) {
          if (item && item.trim() !== "") {
            var option = document.createElement("option");
            option.value = item;
            option.text = item;
            document.getElementById(resourceType).appendChild(option);
          }
        }
        for (let i = 0; i < selectElement.options.length; i++) {
          if (selectElement.options[i].value == previousSelection) {
            selectElement.options[i].selected = true;
            break;
          }
        }
      }
    });
  }
}

// Initialize DOM event handlers when document is ready
document.addEventListener('DOMContentLoaded', function() {
  // Initialize map's Last Updated display
  initializeMapLastUpdated();
  
  // Initialize map's Connection Status
  updateMapConnectionStatus('unknown');
  
  // Initialize provider dropdown text
  updateProviderDropdownText();
  
  // Namespace is now managed via Map Settings (configNamespace global)
  
  // Resource list event handlers
  const vNetElement = document.getElementById(typeStringVNet);
  if (vNetElement) {
    vNetElement.onmouseover = function () {
      updateResourceList(typeStringVNet);
    };
  }
  
  const securityGroupElement = document.getElementById(typeStringSG);
  if (securityGroupElement) {
    securityGroupElement.onmouseover = function () {
      updateResourceList(typeStringSG);
    };
  }
  
  const sshKeyElement = document.getElementById(typeStringSshKey);
  if (sshKeyElement) {
    sshKeyElement.onmouseover = function () {
      updateResourceList(typeStringSshKey);
    };
  }
  
  // document.getElementById(typeStringImage).onmouseover = function () {
  //   //updateResourceList(typeStringImage);
  // };
  // document.getElementById(typeStringSpec).onmouseover = function () {
  //   //updateResourceList(typeStringSpec);
  // };
});

function updateConnectionList() {
  var selectElement = document.getElementById(typeStringConnection);
  var previousSelection = selectElement.value;
  var i,
    L = selectElement.options.length - 1;
  for (i = L; i >= 0; i--) {
    selectElement.remove(i);
  }

  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;

  var url = `http://${hostname}:${port}/tumblebug/connConfig?filterVerified=true&filterRegionRepresentative=true&filterCredentialHolder=${encodeURIComponent(configCredentialHolder)}`;

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  }).then((res) => {
    if (res.data.connectionconfig != null) {
      for (let item of res.data.connectionconfig) {
        var option = document.createElement("option");
        option.value = item.configName;
        option.text = item.configName;
        //option.text = item.providerName + "/" + item.regionDetail.regionName;
        document.getElementById(typeStringConnection).appendChild(option);
      }
      for (let i = 0; i < selectElement.options.length; i++) {
        if (selectElement.options[i].value == previousSelection) {
          selectElement.options[i].selected = true;
          break;
        }
      }
    }
  }).catch(function (error) {
    console.log(error);
    //errorAlert("Failed to get connection list");
    if (error.response && error.response.data) {
      displayJsonData(error.response.data, typeError);
    }
  });
}

document.getElementById(typeStringConnection).onmouseover = function () {
  updateConnectionList();
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
  var namespace = configNamespace;

  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraid}/mcSwNlb`;

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
          Interval: "default",
          Timeout: "default",
          Threshold: "default",
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
  var namespace = configNamespace;
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
  var nodeGroupUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraid}/nodegroup`;
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
  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraid}/nlb`;

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
      Interval: "default",
      Timeout: "default",
      Threshold: "default",
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
  var namespace = configNamespace;
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
  var nodeGroupUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraid}/nodegroup`;
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
  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraid}/nlb/${nodegroupid}`;
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

// Unified NLB Management function
function manageNLB() {
  Swal.fire({
    title: '⚖️ NLB Management',
    html: `
      <div style="text-align: left; margin-bottom: 20px;">
        <p><strong>Select NLB Operation:</strong></p>
      </div>
      <div style="display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 15px;">
        <button onclick="executeNLBAction('addGlobal')" class="btn btn-success btn-context" style="width: 100%; padding: 12px;">
          🌍 Add Global-NLB (Multi-Cloud SW NLB)
        </button>
        <button onclick="executeNLBAction('addRegional')" class="btn btn-info btn-context" style="width: 100%; padding: 12px;">
          🏗️ Add Regional-NLB (CSP NLB)
        </button>
        <button onclick="executeNLBAction('delete')" class="btn btn-danger btn-context" style="width: 100%; padding: 12px;">
          🗑️ Delete Regional-NLB
        </button>
      </div>
    `,
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '❌ Close',
    width: '500px',
    customClass: {
      popup: 'swal2-infra-context'
    }
  });
}
window.manageNLB = manageNLB;

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

/**
 * Sets default remote commands based on application type
 * 
 * @param {string} appName - The name of the application to configure commands for
 * @returns {void} - Modifies the defaultRemoteCommand array directly
 */
function setDefaultRemoteCommandsByApp(appName) {
  // Reset array to ensure clean state (prevent leftover elements from previous selections)
  defaultRemoteCommand.length = 0;

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
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/deployvLLM.sh | bash";
      defaultRemoteCommand[1] = "echo '$$Func(GetPublicIP(target=this, prefix=http://, postfix=:8000/v1))'";
      defaultRemoteCommand[2] = "";
      break;
    case "vLLMServe":
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/servevLLM.sh | bash -s -- $$Func(AssignTask(task='Qwen/Qwen2.5-1.5B-Instruct, meta-llama/Llama-3.2-3B-Instruct, mistralai/Mistral-7B-Instruct-v0.3, deepseek-ai/DeepSeek-R1-Distill-Qwen-7B'))";
      defaultRemoteCommand[1] = "echo '$$Func(GetPublicIP(target=this, prefix=http://, postfix=:8000/v1))'";
      break;
    case "Nvidia":
      // Install NVIDIA CUDA driver with Container Toolkit
      // Note: System will automatically reboot after installation
      // Use download-then-execute pattern (not curl|bash) to prevent truncated script execution
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/installGpuDriver.sh -o /tmp/installGpuDriver.sh && bash /tmp/installGpuDriver.sh";
      defaultRemoteCommand[1] = "echo '[INFO] GPU driver installation started. System will reboot automatically in ~5 seconds after completion.'";
      defaultRemoteCommand[2] = "echo '[INFO] After reboot, verify with: nvidia-smi'";
      break;
    case "NvidiaVgpu":
      // Install NVIDIA driver for fractional/vGPU instances (e.g., AWS g6f, Azure NCas fractional)
      // --vgpu flag forces proprietary driver (open kernel modules do NOT support vGPU)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/installGpuDriver.sh -o /tmp/installGpuDriver.sh && bash /tmp/installGpuDriver.sh --vgpu";
      defaultRemoteCommand[1] = "echo '[INFO] GPU driver (vGPU/proprietary) installation started. System will reboot automatically.'";
      defaultRemoteCommand[2] = "echo '[INFO] After reboot, verify with: nvidia-smi'";
      break;
    case "RebootVM":
      // Reboot Node - useful after GPU driver installation
      defaultRemoteCommand[0] = "sudo reboot";
      defaultRemoteCommand[1] = "";
      defaultRemoteCommand[2] = "";
      break;
    case "Nvidia-Status":
      defaultRemoteCommand[0] = "nvidia-smi";
      // Show Fabric Manager status on multi-GPU NVSwitch systems (A100/H100/H200 SXM)
      defaultRemoteCommand[1] = "GPU_COUNT=$(nvidia-smi -L 2>/dev/null | grep -c '^GPU') || GPU_COUNT=0; if [ \"$GPU_COUNT\" -ge 4 ]; then echo '=== Fabric Manager (required for NVSwitch multi-GPU) ==='; systemctl is-active nvidia-fabricmanager 2>/dev/null && echo 'Status: RUNNING' || echo 'Status: NOT RUNNING (multi-GPU may not work!)'; echo '=== nvidia-persistenced ==='; systemctl is-active nvidia-persistenced 2>/dev/null && echo 'Status: RUNNING' || echo 'Status: not running'; fi";
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
      defaultRemoteCommand[0] = "OLLAMA_HOST=0.0.0.0:3000 ollama pull $$Func(AssignTask(task='deepseek-r1, gemma3n, gemma3, qwen3, llama3.3, mistral, phi4-reasoning'))";
      defaultRemoteCommand[1] = "echo '$$Func(GetPublicIP(target=this, prefix=http://, postfix=:3000))'";
      defaultRemoteCommand[2] = "OLLAMA_HOST=0.0.0.0:3000 ollama list";
      break;
    case "OpenWebUI":
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/deployOpenWebUI.sh | bash -s -- ollama \"$$Func(GetPublicIPs(target=this, separator=;, prefix=http://, postfix=:3000))\"";
      defaultRemoteCommand[1] = "echo 'Access to $$Func(GetPublicIP(target=this, prefix=http://))'";
      defaultRemoteCommand[2] = "";
      break;
    case "OpenWebUI-vLLM":
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/deployOpenWebUI.sh | bash -s -- vllm \"$$Func(GetPublicIPs(target=this, separator=;, prefix=http://, postfix=:8000/v1))\"";
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
      // Uses per-Node model assignment via $$Func(AssignTask(...)) from a predefined model list
      // Assumes GPU driver is already installed (use 'Install GPU Driver' step first)
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/telemetry/setupBenchmarkTarget.sh | bash -s -- $$Func(AssignTask(task='Qwen/Qwen2.5-1.5B-Instruct, meta-llama/Llama-3.2-3B-Instruct, mistralai/Mistral-7B-Instruct-v0.3, deepseek-ai/DeepSeek-R1-Distill-Qwen-7B'))";
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
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/llm/telemetry/run_guidellm.sh | bash -s -- --ip $$Func(GetPublicIPs(separator=' ', label='accelerator=gpu')) --seconds 60";
      defaultRemoteCommand[1] = "ls -la ~/guidellm_bench/bench_*";
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
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/k8s/k8s-control-plane-setup.sh | bash";
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
    case "M-CMP-Deploy":
      defaultRemoteCommand[0] = "curl -sSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/set-tb.sh | bash";
      defaultRemoteCommand[1] = "curl -sSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/set-mcmp.sh | sudo bash";
      defaultRemoteCommand[2] = "echo '$$Func(GetPublicIP(target=this, prefix=http://, postfix=:3001))'";
      break;
    case "DevStack-Install":
      // Install DevStack on bare-metal VMs (e.g., AWS m5.metal)
      // CSP name is derived from Infra ID + Node ID for unique provider registration
      // Location info is automatically populated from the Node's deployment location
      defaultRemoteCommand[0] = "curl -fsSL https://raw.githubusercontent.com/cloud-barista/cb-tumblebug/main/scripts/usecases/openstack/1.installDevStack.sh -o /tmp/installDevStack.sh && bash /tmp/installDevStack.sh --csp-name openstack-$$Func(GetInfraId())-$$Func(GetNodeId()) --latitude $$Func(GetLocationLatitude()) --longitude $$Func(GetLocationLongitude()) --location \"$$Func(GetLocationDisplay())\"";
      defaultRemoteCommand[1] = "echo 'DevStack installed. Horizon: $$Func(GetPublicIP(target=this, prefix=http://, postfix=/dashboard))'";
      defaultRemoteCommand[2] = "";
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
    var namespace = configNamespace;

    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/infra/${infraid}`;
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
  var namespace = configNamespace;
  var infraid = infraidElement.value;

  if (infraid) {
    console.log(" Getting status " + selectApp.value);

    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/infra/${infraid}`;
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

// Auto-resize textarea based on content
window.autoResizeTextarea = function (textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = Math.max(textarea.scrollHeight, 24) + 'px'; // minimum 24px (approx 1 line)
};

// Reset commands to initial state (3 empty fields)
window.resetCommands = function () {
  const cmdContainer = document.getElementById('cmdContainer');
  if (!cmdContainer) return;

  // Remove all cmdDiv elements except the button
  const cmdDivs = cmdContainer.querySelectorAll('[id^="cmdDiv"]');
  cmdDivs.forEach(div => div.remove());

  // Recreate 3 empty command fields
  const addCmdBtn = cmdContainer.querySelector('#addCmd');
  for (let i = 1; i <= 3; i++) {
    const newCmdDiv = document.createElement('div');
    newCmdDiv.id = `cmdDiv${i}`;
    newCmdDiv.className = 'cmdRow';
    newCmdDiv.innerHTML = `
      Command ${i}: <textarea id="cmd${i}" rows="1" style="width: 75%; resize: vertical; vertical-align: top; overflow: hidden;" oninput="autoResizeTextarea(this)"></textarea>
      <button onclick="document.getElementById('cmd${i}').value = ''; autoResizeTextarea(document.getElementById('cmd${i}'));" style="vertical-align: top;">Clear</button>
    `;
    if (addCmdBtn) {
      cmdContainer.insertBefore(newCmdDiv, addCmdBtn);
    } else {
      cmdContainer.appendChild(newCmdDiv);
    }
  }

  // Reset predefined script dropdown
  const scriptSelect = document.getElementById('predefinedScripts');
  if (scriptSelect) {
    scriptSelect.selectedIndex = 0;
  }

  console.log('Commands reset to 3 empty fields');

  // Re-render placeholder inputs to clear stale panels
  if (typeof window.renderPlaceholderInputs === 'function') {
    window.renderPlaceholderInputs();
  }
};

// ============================================================
// Placeholder System for Remote Commands
// ============================================================
// Detects <PLACEHOLDER_NAME> patterns in commands and renders
// separate input fields for each. Secret placeholders (defined in
// PLACEHOLDER_METADATA with secret:true) use masked password inputs.

/**
 * Metadata for known placeholders: description, input hint, and secret flag.
 * Placeholders not listed here still get auto-detected input fields.
 */
window.PLACEHOLDER_METADATA = {
  'PASTE_JOIN_COMMAND_HERE': {
    description: 'K8s join command from control plane',
    hint: 'kubeadm join 10.0.0.1:6443 --token abc.123 --discovery-token-ca-cert-hash sha256:xyz',
    secret: false,
  },
  'HF_TOKEN': {
    description: 'Hugging Face API token',
    hint: 'hf_xxxxxxxxxxxxxxxxxxxxx',
    secret: true,
  },
  'DNS_DOMAIN': {
    description: 'DNS domain name',
    hint: 'meet.example.com',
    secret: false,
  },
  'EMAIL_ADDRESS': {
    description: 'Admin email address',
    hint: 'admin@example.com',
    secret: false,
  },
  'TELEMETRY_GPU_VM_IPS': {
    description: 'GPU Node public IPs (space-separated)',
    hint: '104.42.74.157 3.96.201.235',
    secret: false,
  },
  'TELEMETRY_GPU_VM_IPS_CSV': {
    description: 'GPU Node public IPs (comma-separated)',
    hint: '104.42.74.157,3.96.201.235',
    secret: false,
  },
  'EXPORT_MINUTES': {
    description: 'Time range in minutes for metrics export',
    hint: '60',
    secret: false,
  },
  'NODES_MAPPING': {
    description: 'public_ip:wg_ip pairs, comma-separated',
    hint: '54.1.1.1:10.200.0.1,35.2.2.2:10.200.0.2',
    secret: false,
  },
  'FLOATING_IP': {
    description: 'Target IP to forward to (e.g. OpenStack floating IP)',
    hint: '172.24.4.99',
    secret: false,
  },
  'EXT_PORT': {
    description: 'External port to expose on this Node',
    hint: '80',
    secret: false,
  },
  'TARGET_PORT': {
    description: 'Target port on the destination Node',
    hint: '80',
    secret: false,
  },
  'RULE_NUM': {
    description: 'Rule line number to delete (from PortForward-List output)',
    hint: '1',
    secret: false,
  },
};

/**
 * Extract user-input placeholders from command text.
 * Matches <UPPERCASE_NAME> patterns, excluding shell defaults like ${VAR:-<DEFAULT>}.
 * @param {string} text - Command text to scan
 * @returns {Array<{name: string, fullMatch: string, isSecret: boolean, description: string, hint: string}>}
 */
window.extractPlaceholders = function(text) {
  if (!text) return [];
  const regex = /(?<!:-)<([A-Z][A-Z0-9_-]*)>/g;
  const placeholders = [];
  const seen = new Set();
  let match;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    const meta = window.PLACEHOLDER_METADATA[name] || {};
    placeholders.push({
      name: name,
      fullMatch: match[0],
      isSecret: meta.secret === true,
      description: meta.description || '',
      hint: meta.hint || '',
    });
  }
  return placeholders;
};

/**
 * Render placeholder input fields below each command textarea that contains placeholders.
 * Preserves existing input values when re-rendering (e.g., after textarea edit).
 */
window.renderPlaceholderInputs = function() {
  const cmdContainer = document.getElementById('cmdContainer');
  if (!cmdContainer) return;

  const cmdDivs = cmdContainer.querySelectorAll('[id^="cmdDiv"]');
  cmdDivs.forEach((div, idx) => {
    const cmdIndex = idx + 1;
    const textarea = document.getElementById(`cmd${cmdIndex}`);
    if (!textarea) return;

    const placeholders = window.extractPlaceholders(textarea.value);

    // Preserve existing input values before removing panel
    const existingPanel = div.querySelector('.placeholder-panel');
    const existingValues = {};
    if (existingPanel) {
      existingPanel.querySelectorAll('.placeholder-input').forEach(input => {
        if (input.value) {
          existingValues[input.dataset.placeholderName] = input.value;
        }
      });
      existingPanel.remove();
    }

    if (placeholders.length === 0) return;

    // Create placeholder input panel
    const panel = document.createElement('div');
    panel.className = 'placeholder-panel';
    panel.style.cssText = 'margin: 4px 0 8px 0; padding: 8px 12px; background: #f0f7ff; border: 1px solid #b3d7ff; border-radius: 6px; font-size: 0.8rem;';

    placeholders.forEach(ph => {
      const inputId = `ph_cmd${cmdIndex}_${ph.name}`;
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 4px;';

      // Label
      const label = document.createElement('label');
      label.htmlFor = inputId;
      label.style.cssText = 'min-width: 100px; font-weight: 600; color: #0d6efd; font-size: 0.75rem; white-space: nowrap;';
      label.textContent = (ph.isSecret ? '🔒 ' : '📝 ') + ph.name;

      // Input field
      const input = document.createElement('input');
      input.id = inputId;
      input.type = ph.isSecret ? 'password' : 'text';
      input.className = 'popup-input placeholder-input';
      input.dataset.cmdIndex = String(cmdIndex);
      input.dataset.placeholderName = ph.name;
      input.dataset.fullMatch = ph.fullMatch;
      input.dataset.isSecret = String(ph.isSecret);
      input.placeholder = ph.hint || `Enter ${ph.name.replace(/_/g, ' ').toLowerCase()}`;
      input.style.cssText = 'flex: 1; padding: 4px 8px; font-size: 0.8rem; border: 1px solid #b3d7ff; border-radius: 4px;';

      // Restore previous value
      if (existingValues[ph.name]) {
        input.value = existingValues[ph.name];
      }

      row.appendChild(label);
      row.appendChild(input);

      // Toggle visibility button for secret fields
      if (ph.isSecret) {
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.textContent = '👁';
        toggleBtn.title = 'Toggle visibility';
        toggleBtn.style.cssText = 'padding: 2px 6px; border: 1px solid #ccc; border-radius: 3px; background: #f8f9fa; cursor: pointer; font-size: 0.8rem;';
        toggleBtn.onclick = () => {
          input.type = input.type === 'password' ? 'text' : 'password';
          toggleBtn.textContent = input.type === 'password' ? '👁' : '🙈';
        };
        row.appendChild(toggleBtn);
      }

      // Description
      if (ph.description) {
        const desc = document.createElement('span');
        desc.style.cssText = 'font-size: 0.65rem; color: #888; white-space: nowrap;';
        desc.textContent = ph.description;
        row.appendChild(desc);
      }

      panel.appendChild(row);
    });

    div.appendChild(panel);
  });
};

// ============================================================
// Common HTML generators and utilities for Commands popups
// ============================================================

// Generate Commands section HTML
window.generateCommandsHtml = function (defaultCommands = ['', '', '']) {
  let html = `
    <p><font size=4><b>[Commands]</b></font> <button onclick="resetCommands()" style="font-size: 12px; padding: 2px 8px; margin-left: 10px;">Reset</button></p>
    <div id="cmdContainer" style="margin-bottom: 20px;">`;

  for (let i = 0; i < 3; i++) {
    const value = defaultCommands[i] || '';
    html += `
      <div id="cmdDiv${i + 1}" class="cmdRow">
        Command ${i + 1}: <textarea id="cmd${i + 1}" rows="1" style="width: 75%; resize: vertical; vertical-align: top; overflow: hidden;" oninput="autoResizeTextarea(this)">${value}</textarea>
        <button onclick="document.getElementById('cmd${i + 1}').value = ''; autoResizeTextarea(document.getElementById('cmd${i + 1}'));" style="vertical-align: top;">Clear</button>
      </div>`;
  }

  html += `
      <button id="addCmd" onclick="addCmd()" style="margin-left: 1px;"> + </button>
    </div>`;

  return html;
};

// Generate Predefined Scripts section HTML
// Predefined scripts organized by category
window.predefinedScriptCategories = {
  'llm-ollama': {
    label: '🤖 LLM (Ollama)',
    description: 'Ollama-based LLM service deployment',
    scripts: [
      { value: 'Nvidia', label: '1. Install GPU Driver', step: 1 },
      { value: 'RebootVM', label: '2. Reboot Node', step: 2 },
      { value: 'Nvidia-Status', label: '3. Check GPU Driver', step: 3 },
      { value: 'Ollama', label: '4. Install Ollama', step: 4 },
      { value: 'OllamaPull', label: '5. Pull LLM Model', step: 5 },
      { value: 'Netdata', label: '6. Install Monitoring', step: 6, optional: true },
      { value: 'OpenWebUI', label: '7. Install Open WebUI', step: 7 }
    ]
  },
  'llm-vllm': {
    label: '🤖 LLM (vLLM)',
    description: 'vLLM-based high-performance LLM service',
    scripts: [
      { value: 'Nvidia', label: '1. Install GPU Driver', step: 1, targetLabel: 'accelerator=gpu' },
      { value: 'RebootVM', label: '2. Reboot Node', step: 2, targetLabel: 'accelerator=gpu' },
      { value: 'Nvidia-Status', label: '3. Check GPU Driver', step: 3, targetLabel: 'accelerator=gpu' },
      { value: 'vLLM', label: '4. Install vLLM', step: 4, targetLabel: 'accelerator=gpu' },
      { value: 'vLLMServe', label: '5. Serve LLM Model', step: 5, targetLabel: 'accelerator=gpu' },
      { value: 'Netdata', label: '6. Install Monitoring', step: 6, optional: true },
      { value: 'OpenWebUI-vLLM', label: '7. Install Open WebUI (vLLM)', step: 7 },
      { value: 'TelemetrySensor', label: '8. Setup GPU Telemetry Sensor', step: 8, experimental: true, targetLabel: 'accelerator=gpu' },
      { value: 'TelemetryMonitor', label: '9. Setup Monitoring Server', step: 9, experimental: true, targetLabel: 'role=observability' },
      { value: 'TelemetryExport', label: '10. Export Metrics to CSV', step: 10, experimental: true, targetLabel: 'role=observability' }
    ]
  },
  'llm-benchmark': {
    label: '📊 LLM Benchmark',
    description: 'LLM benchmark environment (vLLM + GuideLLM + Monitoring)',
    scripts: [
      { value: 'Nvidia', label: '1. Install GPU Driver', step: 1, targetLabel: 'accelerator=gpu' },
      { value: 'RebootVM', label: '2. Reboot Node', step: 2, targetLabel: 'accelerator=gpu' },
      { value: 'Nvidia-Status', label: '3. Check GPU Driver', step: 3, targetLabel: 'accelerator=gpu' },
      { value: 'BenchmarkTarget', label: '4. Setup Benchmark Target (vLLM+Model+Telemetry)', step: 4, targetLabel: 'accelerator=gpu' },
      { value: 'BenchmarkManager', label: '5. Setup Benchmark Manager (Monitoring+Tools)', step: 5, targetLabel: 'role=benchmark', targetLabels: ['role=benchmark', 'role=observability'] },
      { value: 'RunBenchmark', label: '6. Run Benchmark', step: 6, targetLabel: 'role=benchmark', targetLabels: ['role=benchmark', 'role=observability'] },
      { value: 'BenchmarkTelemetryExport', label: '7. Export Metrics to CSV', step: 7, optional: true, targetLabel: 'role=benchmark', targetLabels: ['role=benchmark', 'role=observability'] }
    ]
  },
  'k8s': {
    label: '☸️ Kubernetes',
    description: 'Kubernetes cluster deployment — Standard, GPU, or llm-d (distributed LLM inference). Steps 4-6 are for GPU workers; steps 9-13 are for llm-d only.',
    scripts: [
      { value: 'Setup-WireGuard',        label: '0. Setup WireGuard VPN (optional)',         step: 0,  optional: true },
      { value: 'K8sControlPlane-Deploy', label: '1. Deploy Control Plane (Standard)',         step: 1,  targetLabel: 'role=control' },
      { value: 'K8sLlmdControlPlane',    label: '1-alt. Deploy Control Plane (llm-d)',        step: 1,  targetLabel: 'role=control', optional: true },
      { value: 'K8sGetJoinCommand',      label: '2. Get Join Command',                        step: 2,  targetLabel: 'role=control', syncMode: true },
      { value: 'K8sGetKubeconfig',       label: '3. Get Kubeconfig (Base64)',                 step: 3,  targetLabel: 'role=control', syncMode: true },
      { value: 'Nvidia',                 label: '4. Install GPU Driver (GPU worker only)',    step: 4,  targetLabel: 'accelerator=gpu', optional: true },
      { value: 'RebootVM',               label: '5. Reboot Node (GPU worker only)',             step: 5,  targetLabel: 'role=node', optional: true },
      { value: 'Nvidia-Status',          label: '6. Check GPU Driver (GPU worker only)',      step: 6,  targetLabel: 'accelerator=gpu', optional: true, syncMode: true },
      { value: 'K8sWorker-Deploy',       label: '7. Deploy Worker & Join Cluster',           step: 7,  targetLabel: 'role=node' },
      { value: 'K8sClusterStatus',       label: '8. Check Cluster Status',                   step: 8,  targetLabel: 'role=control', syncMode: true },
      { value: 'K8sGpuStatus',           label: '9. Check GPU Operator Status (GPU/llm-d)',  step: 9,  targetLabel: 'role=control', optional: true, syncMode: true },
      { value: 'LlmdCheck',              label: '10. Check llm-d Prerequisites (llm-d only)',step: 10, targetLabel: 'role=control', optional: true, syncMode: true },
      { value: 'LlmdDeployWithModel',    label: '11. Deploy llm-d with Model (llm-d only)',  step: 11, targetLabel: 'role=control', optional: true },
      { value: 'LlmdStatus',             label: '12. Check llm-d Status (llm-d only)',       step: 12, targetLabel: 'role=control', optional: true, syncMode: true },
      { value: 'LlmdUninstall',          label: '13. Uninstall llm-d (llm-d only)',          step: 13, targetLabel: 'role=control', optional: true }
    ]
  },
  'ml-ray': {
    label: '🔬 ML (Ray)',
    description: 'Ray distributed computing cluster',
    scripts: [
      { value: 'RayHead-Deploy', label: '1. Deploy Ray Head', step: 1, targetLabel: 'role=head' },
      { value: 'RayWorker-Deploy', label: '2. Deploy Ray Worker', step: 2, targetLabel: 'role=worker' }
    ]
  },
  'game': {
    label: '🎮 Game',
    description: 'Game server deployment',
    scripts: [
      { value: 'Xonotic', label: 'Xonotic (FPS Game)', step: 1 },
      { value: 'Westward', label: 'Westward (Strategy)', step: 2 }
    ]
  },
  'platform': {
    label: '🏗️ Platform',
    description: 'Cloud-Barista platform deployment',
    scripts: [
      { value: 'CB-TB-Deploy', label: 'Deploy CB-Tumblebug', step: 1 },
      { value: 'M-CMP-Deploy', label: 'Deploy M-CMP', step: 2 }
    ]
  },
  'openstack-devstack': {
    label: '☁️ OpenStack (DevStack)',
    description: 'Deploy OpenStack via DevStack — lightweight, dev/test only, does NOT survive reboot',
    scripts: [
      { value: 'DevStack-Install', label: '1. Install DevStack', step: 1, experimental: true },
      { value: 'DevStack-Info', label: '2. Get Registration Info', step: 2 },
      { value: 'DevStack-UpdateEndpoints', label: '3. Update Endpoints (IP changed)', step: 3 },
      { value: 'DevStack-Clean', label: '4. Clean / Rollback', step: 4 }
    ]
  },
  'openstack-kolla': {
    label: '☁️ OpenStack (Kolla-Ansible)',
    description: 'Deploy OpenStack via Kolla-Ansible — Docker-based, production-grade, survives reboot',
    scripts: [
      { value: 'Kolla-Install', label: '1. Install Kolla-Ansible', step: 1, experimental: true },
      { value: 'Kolla-Info', label: '2. Get Registration Info', step: 2 },
      { value: 'Kolla-UpdateEndpoints', label: '3. Update Endpoints (IP changed)', step: 3 },
      { value: 'Kolla-Clean', label: '4. Clean / Rollback', step: 4 }
    ]
  },
  'monitoring': {
    label: '📊 Monitoring',
    description: 'Monitoring and observability tools',
    scripts: [
      { value: 'Netdata', label: 'Install Netdata', step: 1 },
      { value: 'Netdata-Status', label: 'Check Netdata Status', step: 2 },
      { value: 'WeaveScope', label: 'Install WeaveScope', step: 3 }
    ]
  },
  'network': {
    label: '🌐 Network',
    description: 'Network configuration tools',
    scripts: [
      { value: 'Setup-CrossNAT', label: 'Setup Cross-Cloud NAT', step: 1 },
      { value: 'Setup-WireGuard', label: 'Setup WireGuard Mesh VPN', step: 2 },
      { value: 'PortForward-Add', label: '🔀 Port Forwarding: Add rule', step: 3 },
      { value: 'PortForward-List', label: '🔀 Port Forwarding: List rules', step: 4 },
      { value: 'PortForward-Del', label: '🔀 Port Forwarding: Delete rule', step: 5 },
      { value: 'PortForward-Save', label: '🔀 Port Forwarding: Save (persist on reboot)', step: 6, optional: true }
    ]
  },
  'utility': {
    label: '🔧 Utility',
    description: 'Utility scripts and tools',
    scripts: [
      { value: 'RebootVM', label: 'Reboot Node', step: 1 },
      { value: 'Nginx', label: 'Install Web Server', step: 2 },
      { value: 'MvToWebRoot', label: 'Move files to web root (/var/www/html/)', step: 3 },
      { value: 'ExtractToWebRoot', label: 'Extract archive to web root (auto-detect format)', step: 4 },
      { value: 'Jitsi', label: 'Install Jitsi (Video Conf)', step: 5 },
      { value: 'Stress', label: 'CPU Stress Test', step: 6 }
    ]
  },
  'all': {
    label: '📋 All Scripts',
    description: 'View all available scripts',
    scripts: [] // Will be populated dynamically
  }
};

// Build the "All Scripts" category from all other categories
// Using plain object instead of Map for better compatibility
(function() {
  const allScriptsArray = [];
  const categories = window.predefinedScriptCategories;
  const catKeys = Object.keys(categories);
  const seenScripts = {};
  
  // Iterate through categories in order to group by category
  for (let i = 0; i < catKeys.length; i++) {
    const catKey = catKeys[i];
    if (catKey === 'all') continue;
    
    const cat = categories[catKey];
    const scripts = cat.scripts || [];
    
    for (let j = 0; j < scripts.length; j++) {
      const script = scripts[j];
      // Only add if not already seen (avoid duplicates)
      if (!seenScripts[script.value]) {
        seenScripts[script.value] = true;
        var entry = {
          value: script.value,
          label: script.label,
          step: script.step,
          optional: script.optional,
          experimental: script.experimental,
          category: cat.label
        };
        if (script.targetLabel) entry.targetLabel = script.targetLabel;
        if (script.syncMode) entry.syncMode = script.syncMode;
        allScriptsArray.push(entry);
      }
    }
  }
  
  // Sort by category first, then by label within category
  allScriptsArray.sort(function(a, b) {
    // First sort by category
    const catCompare = a.category.localeCompare(b.category);
    if (catCompare !== 0) return catCompare;
    // Then sort by label within same category
    return a.label.localeCompare(b.label);
  });
  
  window.predefinedScriptCategories.all.scripts = allScriptsArray;
})();

window.generatePredefinedScriptsHtml = function (includeDeployOptions = false) {
  const categories = window.predefinedScriptCategories;
  
  // Generate category tabs (remember last selected category)
  let categoryTabs = '';
  const defaultCategory = window._currentScriptCategory || 'llm-ollama';
  
  Object.entries(categories).forEach(([key, cat]) => {
    // Skip platform category if not includeDeployOptions
    if (key === 'platform' && !includeDeployOptions) return;
    
    const isActive = key === defaultCategory ? 'active' : '';
    const bgColor = key === defaultCategory ? '#007bff' : '#e9ecef';
    const textColor = key === defaultCategory ? 'white' : '#495057';
    
    categoryTabs += `<button type="button" 
      class="script-category-tab ${isActive}" 
      data-category="${key}"
      onclick="switchScriptCategory('${key}')"
      style="padding: 6px 12px; margin: 2px; border: none; border-radius: 15px; 
             background: ${bgColor}; color: ${textColor}; font-size: 11px; 
             cursor: pointer; white-space: nowrap; transition: all 0.2s;"
      onmouseover="if(!this.classList.contains('active')) { this.style.background='#dee2e6'; }"
      onmouseout="if(!this.classList.contains('active')) { this.style.background='#e9ecef'; }">
      ${cat.label}
    </button>`;
  });

  // Generate initial script list for default category
  const defaultCat = categories[defaultCategory];
  let scriptOptions = window.generateScriptOptionsHtml(defaultCat.scripts);

  return `
    <p><font size=4><b>[Predefined Scripts]</b></font></p>
    <div style="margin-bottom: 15px;">
      <div id="scriptCategoryTabs" style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; padding: 8px; background: #f8f9fa; border-radius: 8px;">
        ${categoryTabs}
      </div>
      <div id="categoryDescription" style="font-size: 11px; color: #666; margin-bottom: 8px; padding: 5px 10px; background: #fff3cd; border-radius: 4px;">
        📝 ${defaultCat.description}
      </div>
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
        <select id="predefinedScripts" style="width: 60%; padding: 8px; border-radius: 4px; border: 1px solid #ced4da;" onchange="loadPredefinedScript()">
          ${scriptOptions}
        </select>
        <label style="display: flex; align-items: center; gap: 5px; font-size: 12px;">
          <input type="checkbox" id="scriptAppendMode"> Append
        </label>
      </div>
    </div>`;
};

// Generate script category tabs HTML only (for inline use)
window.generateScriptCategoryTabsHtml = function(includeDeployOptions = false) {
  const categories = window.predefinedScriptCategories;
  const defaultCategory = window._currentScriptCategory || 'llm-ollama';
  let html = '';
  
  Object.entries(categories).forEach(([key, cat]) => {
    if (key === 'platform' && !includeDeployOptions) return;
    
    const isActive = key === defaultCategory;
    const bgColor = isActive ? '#007bff' : '#e9ecef';
    const textColor = isActive ? 'white' : '#495057';
    
    html += `<button type="button" 
      class="script-category-tab ${isActive ? 'active' : ''}" 
      data-category="${key}"
      onclick="switchScriptCategory('${key}')"
      style="padding: 4px 10px; margin: 1px; border: none; border-radius: 12px; 
             background: ${bgColor}; color: ${textColor}; font-size: 0.7rem; 
             cursor: pointer; white-space: nowrap; transition: all 0.2s;"
      onmouseover="if(!this.classList.contains('active')) { this.style.background='#dee2e6'; }"
      onmouseout="if(!this.classList.contains('active')) { this.style.background='#e9ecef'; }">
      ${cat.label}
    </button>`;
  });
  
  return html;
};

// Generate script options HTML for a category
window.generateScriptOptionsHtml = function(scripts) {
  let options = `<option value="">-- Select a script --</option>`;
  scripts.forEach(script => {
    const optionalTag = script.optional ? ' [Optional]' : '';
    const experimentalTag = script.experimental ? ' [Experimental]' : '';
    const categoryTag = script.category ? ` [${script.category}]` : '';
    options += `<option value="${script.value}">${script.label}${optionalTag}${experimentalTag}${categoryTag}</option>`;
  });
  return options;
};

// Switch script category
window.switchScriptCategory = function(categoryKey) {
  const categories = window.predefinedScriptCategories;
  const category = categories[categoryKey];
  if (!category) return;
  
  // Update active tab styling
  document.querySelectorAll('.script-category-tab').forEach(tab => {
    if (tab.dataset.category === categoryKey) {
      tab.classList.add('active');
      tab.style.background = '#007bff';
      tab.style.color = 'white';
    } else {
      tab.classList.remove('active');
      tab.style.background = '#e9ecef';
      tab.style.color = '#495057';
    }
  });
  
  // Update description
  const descDiv = document.getElementById('categoryDescription');
  if (descDiv) {
    descDiv.innerHTML = `📝 ${category.description}`;
  }
  
  // Update script dropdown
  const scriptSelect = document.getElementById('predefinedScripts');
  if (scriptSelect) {
    scriptSelect.innerHTML = window.generateScriptOptionsHtml(category.scripts);
  }
  
  // Store current category
  window._currentScriptCategory = categoryKey;
};

// Generate Label Selector section HTML with clickable label chips
// usePopupStyle: true for new POPUP_STYLES, false for legacy style
window.generateLabelSelectorHtml = function (isOptional = false, usePopupStyle = false) {
  if (usePopupStyle) {
    const hintText = isOptional ? '<span class="popup-hint">(Optional - filter Nodes by labels)</span>' : '';
    return `
      <div class="popup-section">
        <div class="popup-section-title">🏷️ Label Selector ${hintText}</div>
        <div id="selectedLabelsDisplay" style="min-height: 28px; padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px; 
             background: white; margin-bottom: 6px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px;">
          <span id="labelPlaceholder" style="color: #999; font-size: 0.75rem;">Click labels below to select...</span>
        </div>
        <input type="hidden" id="labelSelector" value="">
        <div class="popup-inline" style="margin-bottom: 6px;">
          <button type="button" id="clearLabelSelector" 
            style="padding: 3px 8px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 10px;">
            Clear All
          </button>
        </div>
        <div style="font-size: 0.7rem; color: #666; margin-bottom: 4px;"><strong>Available Labels</strong> (click to add/remove)</div>
        <div id="availableLabelsContainer" style="padding: 8px; background: #f8f9fa; border-radius: 4px; min-height: 36px;">
          <span style="color: #999; font-size: 0.75rem;">Select an Infra to see available labels...</span>
        </div>
        <div id="labelMatchPreview" style="margin-top: 6px; padding: 6px; background: #e7f3ff; border-radius: 4px; display: none;">
          <span style="font-size: 0.75rem; color: #0066cc;">
            <strong>Matching Nodes:</strong> <span id="matchingNodeCount">0</span> / <span id="totalNodeCount">0</span>
          </span>
          <div id="matchingVmList" style="margin-top: 4px; font-size: 0.7rem; color: #666; max-height: 50px; overflow-y: auto;"></div>
        </div>
      </div>`;
  }
  
  // Legacy style (for backward compatibility)
  const optionalText = isOptional ? ' (optional)' : '';
  return `
    <p><font size=4><b>[Label Selector]${optionalText}</b></font></p>
    <div style="margin-bottom: 15px;">
      <div id="selectedLabelsDisplay" style="min-height: 32px; padding: 5px; border: 1px solid #ced4da; border-radius: 4px; 
           background: white; margin-bottom: 5px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px;">
        <span id="labelPlaceholder" style="color: #999; font-size: 12px;">Click labels below to select...</span>
      </div>
      <input type="hidden" id="labelSelector" value="">
      <button type="button" id="clearLabelSelector" 
        style="padding: 5px 10px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 11px;">
        Clear All
      </button>
      <p style="margin: 8px 0 5px 0; font-size: 12px; color: #666;"><strong>Available Labels</strong> (click to add/remove)</p>
      <div id="availableLabelsContainer" style="padding: 10px; background: #f8f9fa; border-radius: 5px; min-height: 40px;">
        <span style="color: #999; font-size: 12px;">Select an Infra to see available labels...</span>
      </div>
      <div id="labelMatchPreview" style="margin-top: 8px; padding: 8px; background: #e7f3ff; border-radius: 5px; display: none;">
        <span style="font-size: 12px; color: #0066cc;">
          <strong>Matching Nodes:</strong> <span id="matchingNodeCount">0</span> / <span id="totalNodeCount">0</span>
        </span>
        <div id="matchingVmList" style="margin-top: 5px; font-size: 11px; color: #666; max-height: 60px; overflow-y: auto;"></div>
      </div>
    </div>`;
};

// Clear label selector input
window.clearLabelSelector = function() {
  const labelInput = document.getElementById('labelSelector');
  if (labelInput) {
    labelInput.value = '';
    updateSelectedLabelsDisplay();
    updateLabelMatchPreview();
    updateAvailableLabelChipStyles();
  }
};

// Setup Clear All button listener (avoiding inline onclick for XSS safety)
window.setupClearLabelButtonListener = function() {
  const clearBtn = document.getElementById('clearLabelSelector');
  if (clearBtn && !clearBtn._listenerAttached) {
    clearBtn.addEventListener('click', window.clearLabelSelector);
    clearBtn._listenerAttached = true;
  }
};

// Extract unique labels from Infra VMs
window.extractLabelsFromInfra = function(infraId) {
  const infraData = window.cloudBaristaCentralData?.infraData || [];
  const infra = infraData.find(m => m.id === infraId || m.name === infraId);
  
  if (!infra || !infra.node || infra.node.length === 0) {
    return { labels: {}, ndCount: 0, nodes: [] };
  }
  
  const labelMap = {}; // key -> Set of values
  const nodes = [];
  
  infra.node.forEach(nd => {
    nodes.push({
      id: nd.id,
      name: nd.name || nd.id,
      label: nodeConf.label || {}
    });
    
    if (nodeConf.label && typeof nodeConf.label === 'object') {
      Object.entries(nodeConf.label).forEach(([key, value]) => {
        if (!labelMap[key]) {
          labelMap[key] = new Set();
        }
        labelMap[key].add(value);
      });
    }
  });
  
  // Convert Sets to arrays for easier handling
  const labels = {};
  Object.entries(labelMap).forEach(([key, valueSet]) => {
    labels[key] = Array.from(valueSet);
  });
  
  return { labels, ndCount: infra.node.length, nodes };
};

// Update available labels display when Infra is selected
window.updateAvailableLabels = function(infraId) {
  const container = document.getElementById('availableLabelsContainer');
  if (!container) return;
  
  const { labels, ndCount, nodes } = extractLabelsFromInfra(infraId);
  
  // Store nodes data for preview
  window._currentInfraNodes = nodes;
  window._currentInfraLabels = labels;
  
  if (Object.keys(labels).length === 0) {
    container.innerHTML = '<span style="color: #999; font-size: 12px;">No labels found in this Infra\'s Nodes</span>';
    return;
  }
  
  const labelEntries = Object.entries(labels);
  const maxVisibleKeys = 2;
  const hasMore = labelEntries.length > maxVisibleKeys;
  
  let html = '<div id="labelGroupsContainer">';
  
  // Group by label key
  labelEntries.forEach(([key, values], index) => {
    const isHidden = index >= maxVisibleKeys;
    html += `<div class="label-group" style="margin-bottom: 10px; display: flex; align-items: flex-start; gap: 8px; ${isHidden ? 'display: none;' : ''}" data-label-group="${index}">
      <span style="display: inline-block; padding: 3px 10px; background: #6c757d; color: white; 
             border-radius: 12px; font-size: 11px; font-weight: bold; white-space: nowrap;">
        ${window.escapeHtml(key)}
      </span>
      <div style="display: flex; flex-wrap: wrap; gap: 4px;">`;
    
    values.forEach(value => {
      const labelPair = `${key}=${value}`;
      html += `<button type="button" class="label-value-chip" 
        data-label="${window.escapeHtml(labelPair)}"
        style="display: inline-block; padding: 3px 10px; background: #007bff; color: white; 
               border-radius: 12px; font-size: 11px; cursor: pointer; transition: all 0.2s; border: none;"
        title="Click to add: ${window.escapeHtml(labelPair)}">
        ${window.escapeHtml(value)}
      </button>`;
    });
    
    html += '</div></div>';
  });
  
  html += '</div>';
  
  // Add "Show more" / "Show less" toggle if needed
  if (hasMore) {
    const hiddenCount = labelEntries.length - maxVisibleKeys;
    html += `<div style="margin-top: 8px; text-align: center;">
      <button type="button" id="toggleLabelsBtn" onclick="toggleLabelGroups()" 
        style="padding: 4px 12px; background: #e9ecef; color: #495057; border: 1px solid #ced4da; 
               border-radius: 15px; font-size: 11px; cursor: pointer;">
        Show ${hiddenCount} more label${hiddenCount > 1 ? 's' : ''} ▼
      </button>
    </div>`;
  }
  
  html += `<p style="margin: 10px 0 0 0; font-size: 11px; color: #666;">Total: ${Object.keys(labels).length} label keys, ${ndCount} Nodes</p>`;
  
  container.innerHTML = html;
  
  // Setup delegated event listeners for label chips (XSS-safe)
  setupLabelChipEventListeners(container);
  
  // Update chip styles based on current selection
  updateAvailableLabelChipStyles();
  updateLabelMatchPreview();
};

// Setup delegated event listeners for label value chips (avoids XSS from inline onclick)
window.setupLabelChipEventListeners = function(container) {
  if (!container) return;
  
  // Delegated click handler for label-value-chip buttons
  container.addEventListener('click', function(event) {
    const chip = event.target.closest('.label-value-chip');
    if (chip && chip.dataset.label) {
      window.addLabelToSelector(chip.dataset.label);
    }
  });
  
  // Hover effects for chips
  container.addEventListener('mouseover', function(event) {
    const chip = event.target.closest('.label-value-chip');
    if (chip && !chip.classList.contains('selected')) {
      chip.style.background = '#0056b3';
    }
  });
  
  container.addEventListener('mouseout', function(event) {
    const chip = event.target.closest('.label-value-chip');
    if (chip && !chip.classList.contains('selected')) {
      chip.style.background = '#007bff';
    }
  });
};

// Setup delegated event listener for selected labels display (remove buttons)
window.setupSelectedLabelsEventListeners = function() {
  const displayDiv = document.getElementById('selectedLabelsDisplay');
  if (!displayDiv || displayDiv._labelListenerAttached) return;
  
  displayDiv.addEventListener('click', function(event) {
    const removeBtn = event.target.closest('.remove-label-btn');
    if (removeBtn && removeBtn.dataset.label) {
      window.removeLabelFromSelector(removeBtn.dataset.label);
    }
  });
  
  displayDiv._labelListenerAttached = true;
};

// Toggle visibility of additional label groups
window.toggleLabelGroups = function() {
  const groups = document.querySelectorAll('.label-group[data-label-group]');
  const toggleBtn = document.getElementById('toggleLabelsBtn');
  if (!toggleBtn) return;
  
  const isExpanded = toggleBtn.dataset.expanded === 'true';
  
  groups.forEach((group, index) => {
    if (index >= 2) {
      group.style.display = isExpanded ? 'none' : 'flex';
    }
  });
  
  if (isExpanded) {
    const hiddenCount = groups.length - 2;
    toggleBtn.innerHTML = `Show ${hiddenCount} more label${hiddenCount > 1 ? 's' : ''} ▼`;
    toggleBtn.dataset.expanded = 'false';
  } else {
    toggleBtn.innerHTML = 'Show less ▲';
    toggleBtn.dataset.expanded = 'true';
  }
};

// Update the selected labels display (chip-style in input area)
window.updateSelectedLabelsDisplay = function() {
  const displayDiv = document.getElementById('selectedLabelsDisplay');
  const placeholder = document.getElementById('labelPlaceholder');
  const labelInput = document.getElementById('labelSelector');
  
  if (!displayDiv || !labelInput) return;
  
  const labelValue = labelInput.value.trim();
  const labels = labelValue.split(',').map(l => l.trim()).filter(l => l && l.includes('='));
  
  if (labels.length === 0) {
    displayDiv.innerHTML = '<span id="labelPlaceholder" style="color: #999; font-size: 12px;">Click labels below to select...</span>';
    return;
  }
  
  let html = '';
  labels.forEach(label => {
    const [key, value] = label.split('=');
    html += `<span class="selected-label-chip" style="display: inline-flex; align-items: center; padding: 2px 4px 2px 8px; 
             background: #e7f3ff; border: 1px solid #007bff; border-radius: 12px; font-size: 11px; gap: 4px;">
      <span style="color: #6c757d; font-weight: bold;">${window.escapeHtml(key)}</span>
      <span style="color: #333;">=</span>
      <span style="color: #007bff; font-weight: bold;">${window.escapeHtml(value)}</span>
      <button type="button" class="remove-label-btn" data-label="${window.escapeHtml(label)}"
        style="cursor: pointer; color: #dc3545; font-weight: bold; padding: 0 4px; margin-left: 2px; background: none; border: none;"
        title="Remove this label" aria-label="Remove label ${window.escapeHtml(label)}">×</button>
    </span>`;
  });
  
  displayDiv.innerHTML = html;
  
  // Setup delegated event listeners for remove buttons (XSS-safe)
  window.setupSelectedLabelsEventListeners();
};

// Remove a specific label from selector
window.removeLabelFromSelector = function(labelPair) {
  const labelInput = document.getElementById('labelSelector');
  if (!labelInput) return;
  
  const currentLabels = labelInput.value.split(',').map(l => l.trim()).filter(l => l);
  const newLabels = currentLabels.filter(l => l !== labelPair);
  labelInput.value = newLabels.join(',');
  
  updateSelectedLabelsDisplay();
  updateLabelMatchPreview();
  updateAvailableLabelChipStyles();
};

// Update available label chip styles based on selection
window.updateAvailableLabelChipStyles = function() {
  const labelInput = document.getElementById('labelSelector');
  if (!labelInput) return;
  
  const selectedLabels = labelInput.value.split(',').map(l => l.trim()).filter(l => l);
  const chips = document.querySelectorAll('.label-value-chip');
  
  chips.forEach(chip => {
    const labelPair = chip.dataset.label;
    if (selectedLabels.includes(labelPair)) {
      chip.classList.add('selected');
      chip.style.background = '#28a745';
      chip.style.boxShadow = '0 0 0 2px #28a74566';
    } else {
      chip.classList.remove('selected');
      chip.style.background = '#007bff';
      chip.style.boxShadow = 'none';
    }
  });
};

// Add label to selector input
window.addLabelToSelector = function(labelPair) {
  const labelInput = document.getElementById('labelSelector');
  if (!labelInput) return;
  
  const currentValue = labelInput.value.trim();
  
  // Check if label already exists
  const existingLabels = currentValue.split(',').map(l => l.trim()).filter(l => l);
  if (existingLabels.includes(labelPair)) {
    // Remove if already exists (toggle behavior)
    const newLabels = existingLabels.filter(l => l !== labelPair);
    labelInput.value = newLabels.join(',');
  } else {
    // Add new label
    if (currentValue) {
      labelInput.value = currentValue + ',' + labelPair;
    } else {
      labelInput.value = labelPair;
    }
  }
  
  updateSelectedLabelsDisplay();
  updateLabelMatchPreview();
  updateAvailableLabelChipStyles();
};

// Update preview of matching VMs
window.updateLabelMatchPreview = function() {
  const previewDiv = document.getElementById('labelMatchPreview');
  const matchingCountSpan = document.getElementById('matchingNodeCount');
  const totalCountSpan = document.getElementById('totalNodeCount');
  const matchingListDiv = document.getElementById('matchingVmList');
  const labelInput = document.getElementById('labelSelector');
  
  if (!previewDiv || !labelInput || !window._currentInfraNodes) return;
  
  const nodes = window._currentInfraNodes;
  const labelSelector = labelInput.value.trim();
  
  totalCountSpan.textContent = nodes.length;
  
  if (!labelSelector) {
    previewDiv.style.display = 'none';
    return;
  }
  
  // Parse label selector into array of {key, value} pairs
  // Each pair must be satisfied (AND condition)
  const requiredLabelPairs = [];
  labelSelector.split(',').forEach(pair => {
    const [key, value] = pair.split('=').map(s => s.trim());
    if (key && value) {
      requiredLabelPairs.push({ key, value });
    }
  });
  
  // Find matching VMs - ALL label pairs must match (AND condition)
  const matchingNodes = nodes.filter(nd => {
    if (!nodeConf.label || requiredLabelPairs.length === 0) return false;
    
    // Every required label pair must exist in Node's labels
    return requiredLabelPairs.every(({ key, value }) => {
      return nodeConf.label[key] === value;
    });
  });
  
  matchingCountSpan.textContent = matchingNodes.length;
  
  if (matchingNodes.length > 0) {
    matchingListDiv.innerHTML = matchingNodes.map(nd => 
      `<span style="display: inline-block; padding: 2px 6px; margin: 2px; background: #d4edda; border-radius: 3px;">${escapeHtml(nd.name)}</span>`
    ).join('');
    previewDiv.style.background = '#d4edda';
  } else {
    matchingListDiv.innerHTML = '<span style="color: #dc3545;">No Nodes match the current selector</span>';
    previewDiv.style.background = '#f8d7da';
  }
  
  previewDiv.style.display = 'block';
};

// Helper function to escape HTML
window.escapeHtml = function(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

// Setup Infra selector change handler for label updates
window.setupInfraSelectorForLabels = function() {
  const infraSelector = document.getElementById('infraSelector');
  if (!infraSelector) return;
  
  // Update labels when Infra selection changes
  infraSelector.addEventListener('change', function() {
    // Clear previous selection when changing Infra
    const labelInput = document.getElementById('labelSelector');
    if (labelInput) {
      labelInput.value = '';
      updateSelectedLabelsDisplay();
    }
    updateAvailableLabels(this.value);
  });
  
  // Note: Label input is now hidden, so no need for direct input listener
  // Interaction happens through chip clicks which call addLabelToSelector()
  
  // Initialize with current selection
  if (infraSelector.value) {
    updateAvailableLabels(infraSelector.value);
  }
};

// Setup Commands popup (call in didOpen)
window.setupCommandsPopup = function (maxCommands = 10) {
  // Define addCmd function
  window.addCmd = function () {
    const cmdContainer = document.getElementById('cmdContainer');
    if (!cmdContainer) return;

    const cmdCount = cmdContainer.querySelectorAll('[id^="cmdDiv"]').length + 1;

    if (maxCommands > 0 && cmdCount > maxCommands) {
      Swal.showValidationMessage(`Maximum ${maxCommands} commands allowed`);
      return;
    }

    const newCmdDiv = document.createElement('div');
    newCmdDiv.id = `cmdDiv${cmdCount}`;
    newCmdDiv.className = 'cmdRow';
    newCmdDiv.style.marginBottom = '6px';
    newCmdDiv.innerHTML = `
      <div class="popup-field">
        <div class="popup-inline" style="justify-content: space-between;">
          <label class="popup-label">Command ${cmdCount}</label>
          <button type="button" onclick="document.getElementById('cmd${cmdCount}').value = ''; autoResizeTextarea(document.getElementById('cmd${cmdCount}'));" 
            style="font-size: 10px; padding: 1px 6px; border: 1px solid #ccc; border-radius: 3px; background: #f8f9fa; cursor: pointer;">Clear</button>
        </div>
        <textarea id="cmd${cmdCount}" rows="1" class="popup-input" style="resize: vertical; overflow: hidden; min-height: 32px;" 
          oninput="autoResizeTextarea(this)"></textarea>
      </div>
    `;

    // Insert before the buttons row (find by #addCmd button's parent)
    const addCmdBtn = cmdContainer.querySelector('#addCmd');
    const buttonsRow = addCmdBtn ? addCmdBtn.parentElement : null;
    if (buttonsRow && buttonsRow.parentElement === cmdContainer) {
      cmdContainer.insertBefore(newCmdDiv, buttonsRow);
    } else {
      // Fallback: append before the last child if it's the buttons row
      const lastChild = cmdContainer.lastElementChild;
      if (lastChild && lastChild.querySelector('#addCmd')) {
        cmdContainer.insertBefore(newCmdDiv, lastChild);
      } else {
        cmdContainer.appendChild(newCmdDiv);
      }
    }
  };

  // Setup predefined script dropdown listener
  const scriptSelect = document.getElementById('predefinedScripts');
  if (scriptSelect) {
    scriptSelect.removeEventListener('change', window.loadPredefinedScript);
    scriptSelect.addEventListener('change', window.loadPredefinedScript);
  }

  // Setup placeholder auto-detection: re-render placeholder inputs when textarea content changes
  const phCmdContainer = document.getElementById('cmdContainer');
  if (phCmdContainer && !phCmdContainer.dataset.phDelegationAttached) {
    phCmdContainer.dataset.phDelegationAttached = 'true';
    let phDebounce;
    phCmdContainer.addEventListener('input', (e) => {
      if (e.target.tagName === 'TEXTAREA') {
        clearTimeout(phDebounce);
        phDebounce = setTimeout(() => window.renderPlaceholderInputs(), 500);
      }
    });
  }

  // Initial render of placeholder inputs for pre-filled commands
  window.renderPlaceholderInputs();
};

// Collect commands from popup (call in preConfirm)
// Substitutes placeholder values from placeholder input fields before returning.
window.collectCommands = function () {
  const commands = [];
  const cmdContainer = document.getElementById('cmdContainer');
  if (!cmdContainer) return commands;

  const cmdDivs = cmdContainer.querySelectorAll('[id^="cmdDiv"]');
  cmdDivs.forEach((div, index) => {
    const cmdInput = document.getElementById(`cmd${index + 1}`);
    if (cmdInput && cmdInput.value && cmdInput.value.trim()) {
      let cmdText = cmdInput.value.trim();

      // Substitute placeholders with values from placeholder input fields
      const phInputs = div.querySelectorAll('.placeholder-input');
      phInputs.forEach(phInput => {
        const fullMatch = phInput.dataset.fullMatch;
        const value = phInput.value;
        if (fullMatch && value) {
          cmdText = cmdText.replaceAll(fullMatch, value);
        }
      });

      commands.push(cmdText);
    }
  });

  return commands;
};

// ============================================================

// loadPredefinedScript function for loading predefined script
// Supports two modes: Replace (default) and Append
window.loadPredefinedScript = function () {
  const scriptTypeSelect = document.getElementById("predefinedScripts");
  if (!scriptTypeSelect) return;

  const scriptType = scriptTypeSelect.value;
  if (!scriptType) return;

  // Check if append mode is enabled
  const appendModeCheckbox = document.getElementById("scriptAppendMode");
  const isAppendMode = appendModeCheckbox && appendModeCheckbox.checked;

  console.log("Loading predefined script:", scriptType, "| Mode:", isAppendMode ? "Append" : "Replace");

  // Get the new commands from predefined script
  setDefaultRemoteCommandsByApp(scriptType);
  // Filter out empty strings to avoid appending blank commands
  const newCommands = [...defaultRemoteCommand].filter(cmd => cmd && cmd.trim());
  console.log("New commands from script:", newCommands);

  if (isAppendMode) {
    // Append mode: compact existing commands (remove empty gaps), then append new commands
    // Step 1: Collect all existing non-empty commands
    const existingCommands = [];
    let maxCmdIndex = 0;

    for (let i = 1; i <= 20; i++) {
      const cmdField = document.getElementById(`cmd${i}`);
      if (!cmdField) break;
      maxCmdIndex = i;
      if (cmdField.value && cmdField.value.trim()) {
        existingCommands.push(cmdField.value.trim());
      }
    }
    console.log("Existing commands:", existingCommands.length, "New commands:", newCommands.length);

    // Step 2: Combine existing + new commands
    const allCommands = [...existingCommands, ...newCommands];

    // Step 3: Fill cmd fields from cmd1 (compact)
    for (let i = 0; i < allCommands.length; i++) {
      const targetIndex = i + 1;
      let cmdField = document.getElementById(`cmd${targetIndex}`);

      // If field doesn't exist, create it
      if (!cmdField && window.addCmd) {
        window.addCmd();
        cmdField = document.getElementById(`cmd${targetIndex}`);
      }

      if (cmdField) {
        cmdField.value = allCommands[i];
        autoResizeTextarea(cmdField);
        console.log(`Set cmd${targetIndex}:`, cmdField.value);
      }
    }

    // Step 4: Remove extra empty cmd fields (keep minimum 3)
    const minCmdCount = 3;
    const targetCmdCount = Math.max(allCommands.length, minCmdCount);

    for (let i = maxCmdIndex; i > targetCmdCount; i--) {
      const cmdDiv = document.getElementById(`cmdDiv${i}`);
      if (cmdDiv) {
        cmdDiv.remove();
        console.log(`Removed cmdDiv${i}`);
      }
    }

    // Clear any remaining fields beyond allCommands.length but within targetCmdCount
    for (let i = allCommands.length + 1; i <= targetCmdCount; i++) {
      const cmdField = document.getElementById(`cmd${i}`);
      if (cmdField) {
        cmdField.value = "";
        autoResizeTextarea(cmdField);
      }
    }
  } else {
    // Replace mode: clear and set new commands
    for (let i = 0; i < newCommands.length; i++) {
      const cmdField = document.getElementById(`cmd${i + 1}`);
      if (cmdField) {
        cmdField.value = newCommands[i] || "";
        autoResizeTextarea(cmdField);
        console.log(`Set cmd${i + 1} to:`, cmdField.value);
      }
    }
    // Clear remaining fields
    for (let i = newCommands.length + 1; i <= 10; i++) {
      const cmdField = document.getElementById(`cmd${i}`);
      if (cmdField) {
        cmdField.value = "";
        autoResizeTextarea(cmdField);
      }
    }
  }

  // Reset the select to allow selecting the same script again
  scriptTypeSelect.selectedIndex = 0;

  // Auto-set label selector based on script's targetLabel (if available)
  window.applyScriptTargetLabel(scriptType);

  // Auto-toggle sync mode based on script's syncMode property
  window.applyScriptSyncMode(scriptType);

  // Render placeholder input fields for any detected placeholders in commands
  window.renderPlaceholderInputs();
};

// Apply targetLabel from predefined script to Label Selector
// Only sets the label if:
// 1. The script has a targetLabel defined
// 2. The target label is available in the current Infra's VMs
window.applyScriptTargetLabel = function(scriptValue) {
  if (!scriptValue) return;
  
  // Find the script definition with targetLabel / targetLabels
  const currentCategory = window._currentScriptCategory;
  let targetLabel = null;
  let targetLabels = null;
  
  // Search in current category first, then all categories
  const categoriesToSearch = currentCategory 
    ? [currentCategory, ...Object.keys(window.predefinedScriptCategories).filter(k => k !== currentCategory)]
    : Object.keys(window.predefinedScriptCategories);
  
  for (const catKey of categoriesToSearch) {
    const cat = window.predefinedScriptCategories[catKey];
    if (!cat || !cat.scripts) continue;
    const script = cat.scripts.find(s => s.value === scriptValue);
    if (script && (script.targetLabel || script.targetLabels)) {
      targetLabel = script.targetLabel;
      targetLabels = script.targetLabels || null;
      break;
    }
  }
  
  // Build ordered list of labels to try (targetLabels array first, then single targetLabel as fallback)
  const labelsToTry = targetLabels ? [...targetLabels] : (targetLabel ? [targetLabel] : []);
  if (labelsToTry.length === 0) return; // No targetLabel for this script
  
  // Check if any target label is available in current Infra's VMs
  const availableLabels = window._currentInfraLabels;
  if (!availableLabels || Object.keys(availableLabels).length === 0) return;
  
  let matchedLabel = null;
  for (const candidate of labelsToTry) {
    const [candKey, candValue] = candidate.split('=');
    if (!candKey || !candValue) continue;
    const availableValues = availableLabels[candKey];
    if (availableValues && availableValues.includes(candValue)) {
      matchedLabel = candidate;
      break;
    }
  }
  
  if (!matchedLabel) return; // None of the target labels are available in the Infra
  
  // Set the label in the selector
  const labelInput = document.getElementById('labelSelector');
  if (!labelInput) return;
  
  // Replace current label (don't append - the script target is specific)
  labelInput.value = matchedLabel;
  
  // Update UI
  if (window.updateSelectedLabelsDisplay) window.updateSelectedLabelsDisplay();
  if (window.updateLabelMatchPreview) window.updateLabelMatchPreview();
  if (window.updateAvailableLabelChipStyles) window.updateAvailableLabelChipStyles();
  
  console.log(`Auto-set label selector: ${matchedLabel} (from script: ${scriptValue})`);
};

// Auto-toggle sync mode checkbox based on script's syncMode property
window.applyScriptSyncMode = function(scriptValue) {
  const syncToggle = document.getElementById('syncModeToggle');
  if (!syncToggle) return;

  if (!scriptValue) {
    syncToggle.checked = false;
    return;
  }

  // Find the script definition with syncMode
  const currentCategory = window._currentScriptCategory;
  let hasSyncMode = false;

  const categoriesToSearch = currentCategory
    ? [currentCategory, ...Object.keys(window.predefinedScriptCategories).filter(k => k !== currentCategory)]
    : Object.keys(window.predefinedScriptCategories);

  for (const catKey of categoriesToSearch) {
    const cat = window.predefinedScriptCategories[catKey];
    if (!cat || !cat.scripts) continue;
    const script = cat.scripts.find(s => s.value === scriptValue);
    if (script) {
      hasSyncMode = !!script.syncMode;
      break;
    }
  }

  syncToggle.checked = hasSyncMode;
  if (hasSyncMode) {
    console.log(`Auto-enabled sync mode for script: ${scriptValue}`);
  }
};

// ============================================================
// Remote Command Result Viewer
// ============================================================
// Shows a formatted, human-readable view of remote command execution results.
// Groups output by Node and command index for easy readability.
// Provides a "View Raw JSON" button to see the original JSON output.

/**
 * Truncates text to last N lines and returns { truncated, visible, fullText, totalLines }
 */
function _tailLines(text, n) {
  if (!text || !text.trim()) return null;
  const lines = text.split('\n');
  // Remove trailing empty line (common from shell output)
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length === 0) return null;
  const totalLines = lines.length;
  const visible = lines.slice(-n);
  return { truncated: totalLines > n, visible, fullText: lines.join('\n'), totalLines };
}

/**
 * Escapes HTML then converts URLs and bare IP:port patterns into clickable links.
 * Handles: http(s)://..., and standalone IP:port like 52.14.140.219:8081
 */
function _escAndLinkify(text) {
  let safe = window.escapeHtml(text);
  const linkStyle = 'color:#64b5f6; text-decoration:underline;';
  // 1) http(s):// URLs  (greedy up to whitespace/angle-bracket)
  safe = safe.replace(/(https?:\/\/[^\s<&'")\]]+)/g, (url) =>
    `<a href="${url}" target="_blank" rel="noopener" style="${linkStyle}">${url}</a>`
  );
  // 2) Bare IP(:port)(/path) not already linked — e.g. 52.14.140.219:8081
  //    Use a two-pass approach: split by existing <a...>...</a>, linkify only outside.
  const parts = safe.split(/(<a\s[^>]*>.*?<\/a>)/g);
  for (let i = 0; i < parts.length; i++) {
    // Even indices are plain text; odd indices are <a> tags (leave untouched)
    if (i % 2 === 0) {
      parts[i] = parts[i].replace(/\b((?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?::\d{1,5})?(?:\/[^\s<&'"]*)?)\b/g, (m) =>
        `<a href="http://${m}" target="_blank" rel="noopener" style="${linkStyle}">${m}</a>`
      );
    }
  }
  return parts.join('');
}

/**
 * Shows formatted remote command execution results in a SweetAlert window. 
 * Groups output by Node → Command for readability.
 * @param {Object} data - The API response with data.results[]
 */
function showRemoteCmdResult(data, appliedDnsUrl) {
  if (!data || !Array.isArray(data.results) || data.results.length === 0) {
    displayJsonData(data, typeInfo);
    return;
  }

  const results = data.results;
  const ndCount = results.length;
  const TAIL_LINES = 10;
  const MAX_CMD_DISPLAY = 120; // Max chars for command preview in header

  // --- Build per-Node tab content ---
  const ndTabs = results.map((nd, ndIdx) => {
    const ndLabel = nd.nodeId || `node-${ndIdx}`;
    const ndIp = nd.nodeIp || '';
    const hasError = nd.error && nd.error.trim();
    const cmdKeys = Object.keys(nd.command || {}).sort((a, b) => Number(a) - Number(b));

    // Build command groups
    const cmdGroupsHtml = cmdKeys.map((key) => {
      const cmdText = (nd.command[key] || '').trim();
      const stdoutInfo = _tailLines(nd.stdout?.[key] || '', TAIL_LINES);
      const stderrInfo = _tailLines(nd.stderr?.[key] || '', TAIL_LINES);
      const cmdIdx = Number(key) + 1;

      // Truncated command display (long curl commands, etc.)
      const cmdShort = cmdText.length > MAX_CMD_DISPLAY ? cmdText.substring(0, MAX_CMD_DISPLAY - 3) + '...' : cmdText;

      let html = `
        <div style="margin-bottom: 12px; border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden;">
          <div style="background: #f1f3f5; padding: 6px 10px; font-size: 12px; border-bottom: 1px solid #e0e0e0; display: flex; align-items: center; gap: 6px;">
            <span style="background: #495057; color: #fff; padding: 1px 7px; border-radius: 3px; font-size: 11px; font-weight: 600;">CMD ${cmdIdx}</span>
            <code style="font-size: 11px; color: #333; word-break: break-all;" title="${window.escapeHtml(cmdText)}">${window.escapeHtml(cmdShort)}</code>
          </div>`;

      // stdout block
      if (stdoutInfo) {
        const blockId = `stdout-${ndIdx}-${key}`;
        html += `
          <div style="padding: 0;">
            <div style="background: #e8f5e9; padding: 3px 10px; font-size: 11px; color: #2e7d32; font-weight: 600; display: flex; justify-content: space-between; align-items: center;">
              <span>stdout</span>
              <span style="font-weight: normal; color: #666; font-size: 10px;">${stdoutInfo.totalLines} line${stdoutInfo.totalLines > 1 ? 's' : ''}</span>
            </div>
            <div id="${blockId}-wrapper" style="position: relative;">
              ${stdoutInfo.truncated ? `
                <div id="${blockId}-full" style="display: none;">
                  <pre style="margin: 0; padding: 8px 10px; background: #1e1e1e; color: #d4d4d4; font-size: 11px; line-height: 1.5; overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 400px; overflow-y: auto;">${_escAndLinkify(stdoutInfo.fullText)}</pre>
                </div>
                <div id="${blockId}-tail">
                  <button type="button" style="display: block; width: 100%; text-align: center; padding: 3px; background: #f5f5f5; cursor: pointer; font-size: 10px; color: #1976d2; border: none;" 
                       onclick="document.getElementById('${blockId}-full').style.display='block'; document.getElementById('${blockId}-tail').style.display='none';">
                    ▲ Show all ${stdoutInfo.totalLines} lines (${stdoutInfo.totalLines - TAIL_LINES} more above)
                  </button>
                  <pre style="margin: 0; padding: 8px 10px; background: #1e1e1e; color: #d4d4d4; font-size: 11px; line-height: 1.5; overflow-x: auto; white-space: pre-wrap; word-break: break-all;">${_escAndLinkify(stdoutInfo.visible.join('\n'))}</pre>
                </div>
              ` : `
                <pre style="margin: 0; padding: 8px 10px; background: #1e1e1e; color: #d4d4d4; font-size: 11px; line-height: 1.5; overflow-x: auto; white-space: pre-wrap; word-break: break-all;">${_escAndLinkify(stdoutInfo.fullText)}</pre>
              `}
            </div>
          </div>`;
      }

      // stderr block (only if non-empty)
      if (stderrInfo) {
        const blockId = `stderr-${ndIdx}-${key}`;
        html += `
          <div style="padding: 0;">
            <div style="background: #fff3e0; padding: 3px 10px; font-size: 11px; color: #e65100; font-weight: 600; display: flex; justify-content: space-between; align-items: center;">
              <span>stderr</span>
              <span style="font-weight: normal; color: #666; font-size: 10px;">${stderrInfo.totalLines} line${stderrInfo.totalLines > 1 ? 's' : ''}</span>
            </div>
            <div id="${blockId}-wrapper" style="position: relative;">
              ${stderrInfo.truncated ? `
                <div id="${blockId}-full" style="display: none;">
                  <pre style="margin: 0; padding: 8px 10px; background: #2e1e1e; color: #ffab91; font-size: 11px; line-height: 1.5; overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 400px; overflow-y: auto;">${_escAndLinkify(stderrInfo.fullText)}</pre>
                </div>
                <div id="${blockId}-tail">
                  <button type="button" style="display: block; width: 100%; text-align: center; padding: 3px; background: #fff8f0; cursor: pointer; font-size: 10px; color: #e65100; border: none;"
                       onclick="document.getElementById('${blockId}-full').style.display='block'; document.getElementById('${blockId}-tail').style.display='none';">
                    ▲ Show all ${stderrInfo.totalLines} lines (${stderrInfo.totalLines - TAIL_LINES} more above)
                  </button>
                  <pre style="margin: 0; padding: 8px 10px; background: #2e1e1e; color: #ffab91; font-size: 11px; line-height: 1.5; overflow-x: auto; white-space: pre-wrap; word-break: break-all;">${_escAndLinkify(stderrInfo.visible.join('\n'))}</pre>
                </div>
              ` : `
                <pre style="margin: 0; padding: 8px 10px; background: #2e1e1e; color: #ffab91; font-size: 11px; line-height: 1.5; overflow-x: auto; white-space: pre-wrap; word-break: break-all;">${_escAndLinkify(stderrInfo.fullText)}</pre>
              `}
            </div>
          </div>`;
      }

      html += `</div>`; // end cmd group border
      return html;
    }).join('');

    // Node-level error
    const ndErrorHtml = hasError ? `
      <div style="margin-bottom: 8px; padding: 6px 10px; background: #ffebee; border-left: 4px solid #d32f2f; border-radius: 4px; font-size: 12px; color: #c62828;">
        <b>Error:</b> ${window.escapeHtml(nd.error)}
      </div>` : '';

    return { ndLabel, ndIp, ndIdx, cmdGroupsHtml, ndErrorHtml, cmdCount: cmdKeys.length };
  });

  // --- Determine if we need Node tabs or single Node view ---
  const buildNodeContent = (nd) => `
    <div style="margin-bottom: 4px; font-size: 12px; color: #666;">
      <span style="font-weight: 600; color: #333;">${window.escapeHtml(nd.ndLabel)}</span>
      ${nd.ndIp ? `<span style="margin-left: 6px; color: #888;">(${window.escapeHtml(nd.ndIp)})</span>` : ''}
      <span style="margin-left: 6px; color: #999;">${nd.cmdCount} command${nd.cmdCount > 1 ? 's' : ''}</span>
    </div>
    ${nd.ndErrorHtml}
    ${nd.cmdGroupsHtml}`;

  let bodyHtml;
  if (ndCount === 1) {
    bodyHtml = buildNodeContent(ndTabs[0]);
  } else {
    // Node tab buttons
    const tabBtns = ndTabs.map((nd, i) => `
      <button type="button" class="rcr-tab-btn${i === 0 ? ' rcr-tab-active' : ''}" data-idx="${i}"
        style="padding: 4px 10px; font-size: 11px; border: 1px solid #dee2e6; border-bottom: none; border-radius: 5px 5px 0 0; 
               cursor: pointer; background: ${i === 0 ? '#fff' : '#f1f3f5'}; color: ${i === 0 ? '#333' : '#888'}; font-weight: ${i === 0 ? '600' : '400'};">
        ${window.escapeHtml(nd.ndLabel)} <span style="font-size: 10px; color: #999;">${window.escapeHtml(nd.ndIp)}</span>
      </button>`).join('');

    const tabPanels = ndTabs.map((nd, i) => `
      <div class="rcr-tab-panel" data-idx="${i}" style="display: ${i === 0 ? 'block' : 'none'}; padding: 10px 0 0 0;">
        ${buildNodeContent(nd)}
      </div>`).join('');

    bodyHtml = `
      <div style="display: flex; gap: 2px; border-bottom: 2px solid #dee2e6; margin-bottom: 0;">
        ${tabBtns}
      </div>
      ${tabPanels}`;
  }

  // --- Summary bar ---
  const totalCmds = results.reduce((s, nd) => s + Object.keys(nd.command || {}).length, 0);
  const hasAnyError = results.some(nd => (nd.error && nd.error.trim()));
  const hasAnyStderr = results.some(nd => {
    const keys = Object.keys(nd.stderr || {});
    return keys.some(k => nd.stderr[k] && nd.stderr[k].trim());
  });
  const statusIcon = hasAnyError ? '⚠️' : (hasAnyStderr ? '⚡' : '✅');
  const statusColor = hasAnyError ? '#d32f2f' : (hasAnyStderr ? '#e65100' : '#2e7d32');
  const statusText = hasAnyError ? 'Error' : (hasAnyStderr ? 'Completed (with stderr)' : 'Success');

  const dnsLinkHtml = appliedDnsUrl ? `
    <div style="padding: 6px 12px; background: #e8f4fd; border: 1px solid #b8daff; border-radius: 6px; margin-bottom: 8px; font-size: 12px; display: flex; align-items: center; gap: 8px;">
      <span>🌐</span>
      <span style="color: #555;">DNS:</span>
      <a href="${appliedDnsUrl}" target="_blank" style="color: #0d6efd; font-weight: 600; text-decoration: none;">${window.escapeHtml(appliedDnsUrl)}</a>
      <span style="color: #888; font-size: 11px;">(click to open in new tab)</span>
    </div>` : '';

  const summaryHtml = `
    ${dnsLinkHtml}
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 6px; margin-bottom: 10px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 18px;">${statusIcon}</span>
        <span style="font-weight: 600; font-size: 13px; color: ${statusColor};">${statusText}</span>
        <span style="font-size: 11px; color: #888;">${ndCount} Node${ndCount > 1 ? 's' : ''} · ${totalCmds} command${totalCmds > 1 ? 's' : ''}</span>
      </div>
      <button type="button" id="rcr-raw-json-btn"
        style="padding: 4px 10px; font-size: 11px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">
        { } Raw JSON
      </button>
    </div>`;

  // --- Show SweetAlert ---
  Swal.fire({
    title: '🖥️ Remote Command Result',
    width: 750,
    html: `
      <div style="text-align: left; max-height: 65vh; overflow-y: auto;">
        ${summaryHtml}
        ${bodyHtml}
      </div>`,
    showConfirmButton: true,
    confirmButtonText: 'Close',
    didOpen: () => {
      // Tab switching logic
      const popup = Swal.getPopup();
      popup.querySelectorAll('.rcr-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = btn.dataset.idx;
          popup.querySelectorAll('.rcr-tab-btn').forEach(b => {
            b.classList.remove('rcr-tab-active');
            b.style.background = '#f1f3f5';
            b.style.color = '#888';
            b.style.fontWeight = '400';
          });
          btn.classList.add('rcr-tab-active');
          btn.style.background = '#fff';
          btn.style.color = '#333';
          btn.style.fontWeight = '600';
          popup.querySelectorAll('.rcr-tab-panel').forEach(p => {
            p.style.display = p.dataset.idx === idx ? 'block' : 'none';
          });
        });
      });

      // "Raw JSON" button → show original JSON viewer
      const rawBtn = popup.querySelector('#rcr-raw-json-btn');
      if (rawBtn) {
        rawBtn.addEventListener('click', () => {
          displayJsonData(data, typeInfo);
        });
      }

      // Scroll all stdout/stderr tail blocks to bottom
      popup.querySelectorAll('pre').forEach(pre => {
        pre.scrollTop = pre.scrollHeight;
      });
    }
  });
}
window.showRemoteCmdResult = showRemoteCmdResult;

// ============================================================
// Real-time Streaming Command Sessions (SSE-based)
// ============================================================
// Architecture: SSE streams run in background, independent of any modal.
// The Swal modal is just a "view" into a session. Closing it does NOT
// kill the stream. Users can re-open any session from the floating badge.
// ============================================================

/**
 * Global registry of active command streaming sessions.
 * Key: xRequestId, Value: session object
 */
window._cmdStreamSessions = {};

/**
 * Create a new streaming session, start SSE consumption in background,
 * and open the streaming modal.
 */
function startStreamingSession(streamUrl, username, password, xRequestId, infraId, spinnerId, appliedDnsUrl) {
  const session = {
    xRequestId,
    infraId,
    spinnerId,
    streamUrl,
    appliedDnsUrl: appliedDnsUrl || null,
    startTime: Date.now(),
    nodeState: {},        // { nodeId: { status, stdoutLines: [], stderrLines: [], statusInfo: null } }
    doneSummary: null,
    abortController: new AbortController(),
    rebuildCallback: null,   // set when modal is open, null when closed
    cleanupTimer: null,
    error: null,          // SSE transport/connection error
    commandError: null,   // Server-side command execution error (from CommandDone summary)
  };

  window._cmdStreamSessions[xRequestId] = session;
  updateStreamingBadge();

  const getOrCreateNode = (nodeId) => {
    if (!session.nodeState[nodeId]) {
      session.nodeState[nodeId] = { status: 'Queued', stdoutLines: [], stderrLines: [], statusInfo: null };
    }
    return session.nodeState[nodeId];
  };

  // Start background SSE consumption
  consumeSSEStream(streamUrl, username, password, session.abortController, (event) => {
    console.log('[SSE] Event received:', event.type, event.nodeId || '', event);
    if (event.type === 'CommandStatus' && event.nodeId) {
      const nd = getOrCreateNode(event.nodeId);
      nd.status = event.status?.status || nd.status;
      nd.statusInfo = event.status || nd.statusInfo;
    } else if (event.type === 'CommandLog' && event.nodeId && event.log) {
      const nd = getOrCreateNode(event.nodeId);
      const line = event.log.line || '';
      if (event.log.stream === 'stdout') {
        nd.stdoutLines.push(line);
      } else if (event.log.stream === 'stderr') {
        nd.stderrLines.push(line);
      }
    } else if (event.type === 'CommandDone') {
      const totalNodes = Object.keys(session.nodeState).length;
      session.doneSummary = event.summary || { totalNodes, completedNodes: 0, failedNodes: 0, elapsedSeconds: 0 };
      // Propagate server-side error from CommandDone summary
      if (event.summary && event.summary.error) {
        session.commandError = event.summary.error;
      }
      removeSpinnerTask(session.spinnerId);
      // Auto-cleanup session after 5 minutes
      session.cleanupTimer = setTimeout(() => {
        delete window._cmdStreamSessions[xRequestId];
        updateStreamingBadge();
      }, 5 * 60 * 1000);
    }
    updateStreamingBadge();
    // Notify modal view if open
    if (session.rebuildCallback) session.rebuildCallback();
  }).catch(err => {
    if (err.name !== 'AbortError') {
      console.error('SSE stream error:', err);
      session.error = err.message || 'Connection failed';
      removeSpinnerTask(session.spinnerId);
      updateStreamingBadge();
      if (session.rebuildCallback) session.rebuildCallback();
    }
  });

  // Periodic timer to update "Waiting..." elapsed counter and detect timeout
  session._waitingTimer = setInterval(() => {
    if (session.doneSummary || session.error || session.commandError) {
      clearInterval(session._waitingTimer);
      return;
    }
    const elapsed = (Date.now() - session.startTime) / 1000;
    // After 60 seconds with no events and no VMs, treat as connection issue
    if (elapsed > 60 && Object.keys(session.nodeState).length === 0) {
      session.error = 'No events received within 60 seconds. The command may have failed silently.';
      removeSpinnerTask(session.spinnerId);
      clearInterval(session._waitingTimer);
    }
    updateStreamingBadge();
    if (session.rebuildCallback) session.rebuildCallback();
  }, 2000);

  // Open modal immediately
  openStreamingSessionModal(xRequestId);
}

/**
 * Open (or re-open) the streaming modal for a given session.
 */
function openStreamingSessionModal(xRequestId) {
  const session = window._cmdStreamSessions[xRequestId];
  if (!session) {
    Swal.fire({ icon: 'info', title: 'Session Expired', text: 'This streaming session is no longer available.' });
    return;
  }

  const statusBadge = (status) => {
    const colors = {
      'Queued': '#6c757d', 'Handling': '#0d6efd', 'Completed': '#198754',
      'Failed': '#dc3545', 'Timeout': '#fd7e14', 'Cancelled': '#6c757d', 'Interrupted': '#ffc107'
    };
    const bg = colors[status] || '#6c757d';
    return `<span style="display:inline-block;padding:1px 7px;border-radius:3px;font-size:10px;font-weight:600;color:#fff;background:${bg};">${window.escapeHtml(status)}</span>`;
  };

  const renderNodePanel = (nodeId) => {
    const nd = session.nodeState[nodeId];
    if (!nd) return '';
    const stdoutText = nd.stdoutLines.join('\n');
    const stderrText = nd.stderrLines.join('\n');

    let html = `
      <div style="margin-bottom:4px;display:flex;align-items:center;gap:8px;">
        <span style="font-weight:600;font-size:12px;color:#333;">${window.escapeHtml(nodeId)}</span>
        ${statusBadge(nd.status)}
        ${nd.statusInfo && nd.statusInfo.elapsedTime ? `<span style="font-size:10px;color:#888;">${nd.statusInfo.elapsedTime}s</span>` : ''}
      </div>`;

    // Show error details when status is Failed/Timeout (e.g. SSH connection failure, command timeout)
    if (['Failed', 'Timeout'].includes(nd.status) && nd.statusInfo) {
      const errMsg = nd.statusInfo.errorMessage;
      const summary = nd.statusInfo.resultSummary;
      if (errMsg || summary) {
        html += `
      <div style="margin-bottom:4px;padding:8px;background:#ffebee;border-left:4px solid #d32f2f;border-radius:4px;">`;
        if (summary) {
          html += `<div style="font-size:11px;font-weight:600;color:#c62828;margin-bottom:2px;">${window.escapeHtml(summary)}</div>`;
        }
        if (errMsg) {
          html += `<div style="font-size:11px;color:#b71c1c;word-break:break-all;white-space:pre-wrap;">${window.escapeHtml(errMsg)}</div>`;
        }
        html += `</div>`;
      }
    }

    if (stdoutText) {
      html += `
      <div style="margin-bottom:4px;">
        <div style="background:#e8f5e9;padding:2px 8px;font-size:10px;color:#2e7d32;font-weight:600;">stdout (${nd.stdoutLines.length} lines)</div>
        <pre style="margin:0;padding:6px 8px;background:#1e1e1e;color:#d4d4d4;font-size:11px;line-height:1.4;overflow-x:auto;white-space:pre-wrap;word-break:break-all;max-height:300px;overflow-y:auto;">${_escAndLinkify(stdoutText)}</pre>
      </div>`;
    }

    if (stderrText) {
      html += `
      <div style="margin-bottom:4px;">
        <div style="background:#fff3e0;padding:2px 8px;font-size:10px;color:#e65100;font-weight:600;">stderr (${nd.stderrLines.length} lines)</div>
        <pre style="margin:0;padding:6px 8px;background:#2e1e1e;color:#ffab91;font-size:11px;line-height:1.4;overflow-x:auto;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto;">${_escAndLinkify(stderrText)}</pre>
      </div>`;
    }

    return html;
  };

  // Throttled rebuild
  let rebuildTimer = null;
  const scheduleRebuild = () => {
    if (!rebuildTimer) {
      rebuildTimer = setTimeout(() => {
        rebuildTimer = null;
        rebuildModal();
      }, 100);
    }
  };

  const rebuildModal = () => {
    const popup = Swal.getPopup();
    if (!popup) return;
    const container = popup.querySelector('#stream-body');
    if (!container) return;

    const nodeIds = Object.keys(session.nodeState).sort();
    const totalNodes = nodeIds.length;
    const completedCount = nodeIds.filter(id => ['Completed','Failed','Timeout','Cancelled','Interrupted'].includes(session.nodeState[id].status)).length;
    const handlingCount = nodeIds.filter(id => session.nodeState[id].status === 'Handling').length;
    const isFinished = session.doneSummary !== null;

    const streamDnsLinkHtml = session.appliedDnsUrl ? `
      <div style="padding:5px 10px;background:#e8f4fd;border:1px solid #b8daff;border-radius:5px;margin-bottom:6px;font-size:11px;display:flex;align-items:center;gap:6px;">
        <span>🌐</span>
        <a href="${session.appliedDnsUrl}" target="_blank" style="color:#0d6efd;font-weight:600;text-decoration:none;">${window.escapeHtml(session.appliedDnsUrl)}</a>
        <span style="color:#888;">(open in new tab)</span>
      </div>` : '';

    let summaryHtml = `
      ${streamDnsLinkHtml}
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:#f8f9fa;border:1px solid #e0e0e0;border-radius:5px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:16px;">${isFinished ? (session.commandError || session.doneSummary.failedNodes > 0 ? '⚠️' : '✅') : '⏳'}</span>
          <span style="font-size:12px;font-weight:600;color:#333;">${isFinished ? (session.commandError ? 'Failed' : 'Completed') : 'Streaming...'}</span>
          <span style="font-size:10px;color:#888;">${completedCount}/${totalNodes} Nodes done${handlingCount > 0 ? ` · ${handlingCount} running` : ''}</span>
          ${session.doneSummary ? `<span style="font-size:10px;color:#888;">· ${session.doneSummary.elapsedSeconds}s total</span>` : ''}
        </div>
        <span style="font-size:10px;color:#aaa;">Infra: ${window.escapeHtml(session.infraId)} | x-request-id: ${window.escapeHtml(xRequestId)}</span>
      </div>`;

    if (session.error) {
      summaryHtml += `<div style="margin-bottom:8px;padding:8px;background:#ffebee;border-left:4px solid #d32f2f;border-radius:4px;font-size:12px;color:#c62828;">
        <b>Stream Error:</b> ${window.escapeHtml(session.error)}
      </div>`;
    }

    // Waiting state
    if (nodeIds.length === 0 && !isFinished) {
      if (session.commandError) {
        // Error before any VMs started (e.g., preprocessing failure)
        container.innerHTML = summaryHtml + `<div style="padding:16px;text-align:center;">
          <div style="margin-bottom:8px;padding:10px;background:#ffebee;border-left:4px solid #d32f2f;border-radius:4px;font-size:12px;color:#c62828;text-align:left;">
            <b>Command Failed:</b> ${window.escapeHtml(session.commandError)}
          </div>
          <div style="font-size:11px;color:#888;">The command failed before reaching any Nodes.</div>
        </div>`;
      } else if (session.error) {
        // SSE transport error while waiting
        container.innerHTML = summaryHtml + `<div style="padding:16px;text-align:center;">
          <div style="font-size:11px;color:#888;">No Node execution results available.</div>
        </div>`;
      } else {
        // Still waiting for events
        const waitingSec = Math.floor((Date.now() - session.startTime) / 1000);
        container.innerHTML = summaryHtml + `<div style="padding:20px;text-align:center;color:#888;">
          <span style="font-size:24px;">⏳</span><br>Waiting for first event... (${waitingSec}s)
        </div>`;
      }
      return;
    }

    // Finished with error but no VMs processed
    if (nodeIds.length === 0 && isFinished) {
      let errorHtml = '';
      if (session.commandError) {
        errorHtml = `<div style="margin-bottom:8px;padding:10px;background:#ffebee;border-left:4px solid #d32f2f;border-radius:4px;font-size:12px;color:#c62828;text-align:left;">
          <b>Command Failed:</b> ${window.escapeHtml(session.commandError)}
        </div>`;
      }
      container.innerHTML = summaryHtml + `<div style="padding:16px;text-align:center;">
        ${errorHtml}
        <div style="font-size:11px;color:#888;">No Node execution results available.</div>
      </div>`;
      return;
    }

    // Node panels with tabs
    let bodyHtml;
    if (nodeIds.length <= 1) {
      bodyHtml = nodeIds.map(id => renderNodePanel(id)).join('');
    } else {
      const activeTab = popup.querySelector('.stream-tab-btn.stream-tab-active')?.dataset?.nodeid || nodeIds[0];
      const tabBtns = nodeIds.map(id => {
        const isActive = id === activeTab;
        const nd = session.nodeState[id];
        const statusDot = nd.status === 'Handling' ? '🔵' : (nd.status === 'Completed' ? '🟢' : (nd.status === 'Failed' ? '🔴' : '⚪'));
        return `<button type="button" class="stream-tab-btn${isActive ? ' stream-tab-active' : ''}" data-nodeid="${window.escapeHtml(id)}"
          style="padding:3px 8px;font-size:10px;border:1px solid #dee2e6;border-bottom:none;border-radius:4px 4px 0 0;cursor:pointer;
                 background:${isActive ? '#fff' : '#f1f3f5'};color:${isActive ? '#333' : '#888'};font-weight:${isActive ? '600' : '400'};">
          ${statusDot} ${window.escapeHtml(id)}
        </button>`;
      }).join('');

      const tabPanels = nodeIds.map(id => {
        const isActive = id === activeTab;
        return `<div class="stream-tab-panel" data-nodeid="${window.escapeHtml(id)}" style="display:${isActive ? 'block' : 'none'};padding:8px 0 0 0;">
          ${renderNodePanel(id)}
        </div>`;
      }).join('');

      bodyHtml = `
        <div style="display:flex;flex-wrap:wrap;gap:2px;border-bottom:2px solid #dee2e6;margin-bottom:0;">
          ${tabBtns}
        </div>
        ${tabPanels}`;
    }

    container.innerHTML = summaryHtml + bodyHtml;

    // Tab click listeners
    container.querySelectorAll('.stream-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const nodeid = btn.dataset.nodeid;
        container.querySelectorAll('.stream-tab-btn').forEach(b => {
          b.classList.remove('stream-tab-active');
          b.style.background = '#f1f3f5'; b.style.color = '#888'; b.style.fontWeight = '400';
        });
        btn.classList.add('stream-tab-active');
        btn.style.background = '#fff'; btn.style.color = '#333'; btn.style.fontWeight = '600';
        container.querySelectorAll('.stream-tab-panel').forEach(p => {
          p.style.display = p.dataset.nodeid === nodeid ? 'block' : 'none';
        });
      });
    });

    // Auto-scroll
    container.querySelectorAll('pre').forEach(pre => { pre.scrollTop = pre.scrollHeight; });
  };

  // Register rebuild callback on the session
  session.rebuildCallback = scheduleRebuild;

  Swal.fire({
    title: '🖥️ Remote Command (Streaming)',
    width: 750,
    html: `<div id="stream-body" style="text-align:left;max-height:65vh;overflow-y:auto;">
      <div style="padding:20px;text-align:center;color:#888;">
        <span style="font-size:24px;">⏳</span><br>Connecting to stream...
      </div>
    </div>`,
    showConfirmButton: true,
    confirmButtonText: 'Close',
    showCancelButton: !session.doneSummary,
    cancelButtonText: '⏹️ Stop streaming',
    cancelButtonColor: '#dc3545',
    allowOutsideClick: true,
    didOpen: () => {
      // Render current state immediately (for re-open case)
      rebuildModal();
    },
    willClose: () => {
      // Detach view callback — stream continues in background
      session.rebuildCallback = null;
      if (rebuildTimer) clearTimeout(rebuildTimer);
    },
    preDeny: () => false,
  }).then(result => {
    if (result.dismiss === Swal.DismissReason.cancel) {
      // User chose "Stop streaming" — abort the SSE stream
      session.abortController.abort();
      removeSpinnerTask(session.spinnerId);
      session.error = 'Stopped by user';
      updateStreamingBadge();
    }
  });
}
window.openStreamingSessionModal = openStreamingSessionModal;

/**
 * Show a list of all active/recent streaming sessions so user can re-open any.
 */
function showStreamingSessionList() {
  const sessions = window._cmdStreamSessions;
  const keys = Object.keys(sessions);

  if (keys.length === 0) {
    Swal.fire({ icon: 'info', title: 'No Active Sessions', text: 'There are no active or recent command streaming sessions.' });
    return;
  }

  const rows = keys.map(reqId => {
    const s = sessions[reqId];
    const nodeIds = Object.keys(s.nodeState);
    const totalNodes = nodeIds.length;
    const completedNodes = nodeIds.filter(id => ['Completed','Failed','Timeout','Cancelled','Interrupted'].includes(s.nodeState[id].status)).length;
    const isFinished = s.doneSummary !== null;
    const elapsed = ((Date.now() - s.startTime) / 1000).toFixed(0);
    const statusIcon = isFinished ? (s.commandError || s.doneSummary.failedNodes > 0 ? '⚠️' : '✅') : (s.error ? '❌' : '⏳');
    const statusText = isFinished ? (s.commandError ? 'Failed' : 'Done') : (s.error ? 'Error' : 'Running');

    return `<tr style="cursor:pointer;" onclick="openStreamingSessionModal('${window.escapeHtml(reqId)}')">
      <td style="padding:6px 8px;font-size:11px;">${statusIcon} ${statusText}</td>
      <td style="padding:6px 8px;font-size:11px;font-weight:600;">${window.escapeHtml(s.infraId)}</td>
      <td style="padding:6px 8px;font-size:11px;">${completedNodes}/${totalNodes} Nodes</td>
      <td style="padding:6px 8px;font-size:11px;color:#888;">${elapsed}s ago</td>
      <td style="padding:6px 8px;font-size:10px;color:#aaa;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${window.escapeHtml(reqId)}</td>
      <td style="padding:6px 8px;">
        ${!isFinished && !s.error ? `<button onclick="event.stopPropagation(); abortStreamingSession('${window.escapeHtml(reqId)}');" 
          style="font-size:10px;padding:2px 6px;border:1px solid #dc3545;border-radius:3px;background:#fff;color:#dc3545;cursor:pointer;">Stop</button>` : 
          `<button onclick="event.stopPropagation(); dismissStreamingSession('${window.escapeHtml(reqId)}');" 
          style="font-size:10px;padding:2px 6px;border:1px solid #6c757d;border-radius:3px;background:#fff;color:#6c757d;cursor:pointer;">Dismiss</button>`}
      </td>
    </tr>`;
  }).join('');

  Swal.fire({
    title: '📡 Streaming Command Sessions',
    width: 700,
    html: `<div style="text-align:left;">
      <table style="width:100%;border-collapse:collapse;border:1px solid #dee2e6;">
        <thead>
          <tr style="background:#f8f9fa;border-bottom:2px solid #dee2e6;">
            <th style="padding:6px 8px;font-size:11px;text-align:left;">Status</th>
            <th style="padding:6px 8px;font-size:11px;text-align:left;">Infra</th>
            <th style="padding:6px 8px;font-size:11px;text-align:left;">Progress</th>
            <th style="padding:6px 8px;font-size:11px;text-align:left;">Elapsed</th>
            <th style="padding:6px 8px;font-size:11px;text-align:left;">Request ID</th>
            <th style="padding:6px 8px;font-size:11px;text-align:left;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <div style="margin-top:8px;font-size:10px;color:#888;">Click a row to open the streaming view. Sessions auto-dismiss 5 minutes after completion.</div>
    </div>`,
    showConfirmButton: true,
    confirmButtonText: 'Close',
  });
}
window.showStreamingSessionList = showStreamingSessionList;

/**
 * Safely clean up all resources for a streaming session (timers, abort controller, spinner).
 */
function cleanupStreamingSession(session) {
  if (!session) return;
  if (session._waitingTimer) clearInterval(session._waitingTimer);
  if (session.cleanupTimer) clearTimeout(session.cleanupTimer);
  session.abortController.abort();
  removeSpinnerTask(session.spinnerId);
}

function abortStreamingSession(xRequestId) {
  const session = window._cmdStreamSessions[xRequestId];
  if (session) {
    cleanupStreamingSession(session);
    delete window._cmdStreamSessions[xRequestId];
    updateStreamingBadge();
  }
  // Refresh the session list if it's open
  const popup = Swal.getPopup();
  if (popup && popup.querySelector('table')) {
    showStreamingSessionList();
  }
}
window.abortStreamingSession = abortStreamingSession;

function dismissStreamingSession(xRequestId) {
  const session = window._cmdStreamSessions[xRequestId];
  if (session) {
    cleanupStreamingSession(session);
    delete window._cmdStreamSessions[xRequestId];
    updateStreamingBadge();
  }
  const popup = Swal.getPopup();
  if (popup && popup.querySelector('table')) {
    showStreamingSessionList();
  }
}
window.dismissStreamingSession = dismissStreamingSession;

/**
 * Update the floating badge that shows the count of active streaming sessions.
 * Creates the badge element if it doesn't exist yet.
 */
function updateStreamingBadge() {
  const sessions = window._cmdStreamSessions;
  const total = Object.keys(sessions).length;
  const running = Object.values(sessions).filter(s => !s.doneSummary && !s.error && !s.commandError).length;

  let badge = document.getElementById('streaming-sessions-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'streaming-sessions-badge';
    badge.style.cssText = 'position:fixed;bottom:15px;right:20px;z-index:10000;cursor:pointer;display:none;' +
      'background:linear-gradient(135deg,#0d6efd,#6610f2);color:#fff;border-radius:24px;padding:8px 16px;' +
      'box-shadow:0 4px 16px rgba(13,110,253,0.4);font-size:12px;font-weight:600;' +
      'transition:all 0.3s ease;user-select:none;';
    badge.addEventListener('click', () => showStreamingSessionList());
    badge.addEventListener('mouseenter', () => { badge.style.transform = 'scale(1.05)'; badge.style.boxShadow = '0 6px 20px rgba(13,110,253,0.5)'; });
    badge.addEventListener('mouseleave', () => { badge.style.transform = 'scale(1)'; badge.style.boxShadow = '0 4px 16px rgba(13,110,253,0.4)'; });
    document.body.appendChild(badge);
  }

  if (total === 0) {
    badge.style.display = 'none';
  } else {
    badge.style.display = 'flex';
    badge.style.alignItems = 'center';
    badge.style.gap = '6px';
    const pulseHtml = running > 0 ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#00ff88;animation:stream-pulse 1.5s infinite;"></span>' : '';
    badge.innerHTML = `${pulseHtml} 📡 ${running > 0 ? running + ' streaming' : ''} ${total - running > 0 ? (running > 0 ? '· ' : '') + (total - running) + ' done' : ''}`;

    // Inject pulse animation if not already present
    if (!document.getElementById('stream-pulse-style')) {
      const style = document.createElement('style');
      style.id = 'stream-pulse-style';
      style.textContent = '@keyframes stream-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }';
      document.head.appendChild(style);
    }
  }
}

/**
 * Consumes an SSE stream using fetch() + ReadableStream.
 * This approach (vs EventSource) supports custom Authorization headers for BasicAuth.
 *
 * @param {string} url - SSE endpoint URL
 * @param {string} username - BasicAuth username
 * @param {string} password - BasicAuth password
 * @param {AbortController} abortController - Controller to abort the stream
 * @param {Function} onEvent - Callback invoked with parsed JSON event objects
 * @returns {Promise<void>}
 */
async function consumeSSEStream(url, username, password, abortController, onEvent) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      'Authorization': 'Basic ' + btoa(username + ':' + password),
    },
    signal: abortController.signal,
  });

  if (!response.ok) {
    throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE messages (delimited by double newline)
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const message = buffer.substring(0, boundary);
      buffer = buffer.substring(boundary + 2);

      // Parse SSE lines
      for (const line of message.split('\n')) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.substring(6).trim();
          if (jsonStr) {
            try {
              const event = JSON.parse(jsonStr);
              onEvent(event);
            } catch (e) {
              console.warn('Failed to parse SSE event:', jsonStr, e);
            }
          }
        }
      }
    }
  }
}


// === Recent Remote Commands (localStorage) ===
const RECENT_CMDS_KEY = 'recentRemoteCmds';
const RECENT_CMDS_MAX = 30;

function loadRecentCmds() {
  try {
    const raw = localStorage.getItem(RECENT_CMDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveRecentCmd(commands, options = {}) {
  const filtered = commands.filter(c => c.trim());
  if (filtered.length === 0) return;
  const history = loadRecentCmds();
  // Deduplicate: remove existing entry with same commands
  const key = JSON.stringify(filtered);
  const deduped = history.filter(h => JSON.stringify(h.commands) !== key);
  const entry = { timestamp: new Date().toISOString(), commands: filtered };
  if (options.labelSelector) entry.labelSelector = options.labelSelector;
  if (options.syncMode) entry.syncMode = true;
  deduped.unshift(entry);
  if (deduped.length > RECENT_CMDS_MAX) deduped.length = RECENT_CMDS_MAX;
  try {
    localStorage.setItem(RECENT_CMDS_KEY, JSON.stringify(deduped));
  } catch (e) {
    // Ignore storage errors (quota exceeded, disabled, Safari private mode)
  }
}

function buildRecentCmdsSectionHtml() {
  const history = loadRecentCmds();
  if (history.length === 0) return '';
  const options = history.map((h, i) => {
    const preview = h.commands.join(' && ').substring(0, 70) + (h.commands.join(' && ').length > 70 ? '...' : '');
    const ago = getTimeAgo(h.timestamp);
    const tags = [ago];
    if (h.labelSelector) tags.push('🏷️');
    if (h.syncMode) tags.push('⏱️');
    return `<option value="${i}">${tags.join(' ')} — ${window.escapeHtml(preview)}</option>`;
  }).join('');
  return `
    <div class="popup-section" id="recentCmdsSection">
      <div class="popup-section-title" style="display: flex; justify-content: space-between; align-items: center;">
        <span>📋 Recent Commands (${history.length})</span>
        <button type="button" onclick="clearRecentCmds()"
          style="font-size: 10px; padding: 1px 6px; border: 1px solid #ccc; border-radius: 3px; background: #f8f9fa; cursor: pointer; font-weight: normal;">Clear History</button>
      </div>
      <div class="popup-row">
        <div class="popup-col" style="flex: 3;">
          <div class="popup-field">
            <select id="recentCmdSelector" class="popup-select" onchange="applyRecentCmd(this.value)">
              <option value="" selected>— Select from history —</option>
              ${options}
            </select>
          </div>
        </div>
        <div class="popup-col" style="flex: 1;">
          <div class="popup-field">
            <label class="popup-inline" style="font-size: 0.8rem;">
              <input type="checkbox" id="recentAppendMode"> Append
            </label>
          </div>
        </div>
      </div>
    </div>`;
}

function getTimeAgo(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime();
  if (isNaN(diff) || diff < 0) return 'unknown';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

window.applyRecentCmd = function(idx) {
  if (idx === '') return;
  const history = loadRecentCmds();
  const entry = history[parseInt(idx)];
  if (!entry) return;
  const appendMode = document.getElementById('recentAppendMode')?.checked || false;

  const cmdContainer = document.getElementById('cmdContainer');
  if (!cmdContainer) return;

  const existingRows = cmdContainer.querySelectorAll('.cmdRow');
  let startIdx = 0;

  if (appendMode) {
    // Append after the last non-empty command (skip trailing empty rows)
    let lastNonEmpty = -1;
    existingRows.forEach((row, i) => {
      const ta = document.getElementById(`cmd${i + 1}`);
      if (ta && ta.value.trim() !== '') lastNonEmpty = i;
    });
    startIdx = lastNonEmpty + 1;
  } else {
    // Clear all existing textareas (don't remove DOM — just blank them)
    existingRows.forEach((row, i) => {
      const ta = document.getElementById(`cmd${i + 1}`);
      if (ta) { ta.value = ''; autoResizeTextarea(ta); }
    });
  }

  entry.commands.forEach((cmd, i) => {
    const n = startIdx + i + 1;
    const el = document.getElementById(`cmd${n}`);
    if (el) {
      el.value = cmd;
      autoResizeTextarea(el);
    } else if (typeof window.addCmd === 'function') {
      window.addCmd();
      const newEl = document.getElementById(`cmd${n}`);
      if (newEl) { newEl.value = cmd; autoResizeTextarea(newEl); }
    }
  });

  // Restore label selector if saved (non-append mode only)
  if (!appendMode && entry.labelSelector) {
    const labelInput = document.getElementById('labelSelector');
    if (labelInput) {
      labelInput.value = entry.labelSelector;
      if (window.updateSelectedLabelsDisplay) window.updateSelectedLabelsDisplay();
      if (window.updateLabelMatchPreview) window.updateLabelMatchPreview();
      if (window.updateAvailableLabelChipStyles) window.updateAvailableLabelChipStyles();
    }
  }

  // Restore sync mode toggle if saved
  if (!appendMode) {
    const syncToggle = document.getElementById('syncModeToggle');
    if (syncToggle) syncToggle.checked = !!entry.syncMode;
  }

  // Re-render placeholder inputs if available
  if (typeof window.renderPlaceholderInputs === 'function') {
    window.renderPlaceholderInputs();
  }

  // Reset selector
  const selector = document.getElementById('recentCmdSelector');
  if (selector) selector.value = '';
};

window.clearRecentCmds = function() {
  localStorage.removeItem(RECENT_CMDS_KEY);
  const section = document.getElementById('recentCmdsSection');
  if (section) section.style.display = 'none';
};

async function setBastionNode() {
  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;
  var infraid = getSelectedInfraId();

  if (!namespace || !infraid) {
    errorAlert("Please select a namespace and Infra first");
    return;
  }

  // Load VMs in the current (target) Infra
  let targetNodeOptions = '<option value="">-- select Node --</option>';
  try {
    const infraRes = await axios.get(
      `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraid}`,
      { auth: { username, password } }
    );
    const nodes = infraRes.data.node || [];
    nodes.forEach(nd => {
      const rawLabel = nd.publicIP ? `${nd.id} (${nd.publicIP})` : nd.id;
      const escapedValue = window.escapeHtml(String(nd.id));
      const escapedLabel = window.escapeHtml(String(rawLabel));
      targetNodeOptions += `<option value="${escapedValue}">${escapedLabel}</option>`;
    });
  } catch (err) {
    console.error("Failed to fetch target Infra Nodes:", err);
  }

  Swal.fire({
    title: "🔗 Set Bastion Node",
    width: 680,
    html: `
    ${POPUP_STYLES}
    <div class="popup-container">

      <!-- Target Node Section -->
      <div class="popup-section">
        <div class="popup-section-title">🎯 Target Node (needs bastion access)</div>
        <div class="popup-row">
          <div class="popup-col">
            <div class="popup-field">
              <label class="popup-label">Namespace</label>
              <span class="popup-value">${window.escapeHtml(namespace)}</span>
            </div>
          </div>
          <div class="popup-col">
            <div class="popup-field">
              <label class="popup-label">Infra</label>
              <span class="popup-value">${window.escapeHtml(infraid)}</span>
            </div>
          </div>
          <div class="popup-col" style="flex: 2;">
            <div class="popup-field">
              <label class="popup-label">Target Node</label>
              <select id="bastionTargetNodeId" class="popup-select">${targetNodeOptions}</select>
            </div>
          </div>
        </div>
      </div>

      <!-- Bastion Node Section -->
      <div class="popup-section">
        <div class="popup-section-title">🛡️ Bastion Node (jump host — can be from another namespace/Infra)</div>
        <div class="popup-row">
          <div class="popup-col">
            <div class="popup-field">
              <label class="popup-label">Namespace</label>
              <input type="text" id="bastionNsId" class="popup-input" value="${namespace}"
                placeholder="${namespace}" title="Bastion Node's namespace (leave as-is for same namespace)">
            </div>
          </div>
          <div class="popup-col" style="flex: 0 0 auto;">
            <div class="popup-field">
              <label class="popup-label">&nbsp;</label>
              <button type="button" id="loadBastionInfraBtn"
                style="padding: 6px 12px; background: #0d6efd; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 0.82rem; white-space: nowrap;">
                🔄 Load Infras
              </button>
            </div>
          </div>
          <div class="popup-col" style="flex: 2;">
            <div class="popup-field">
              <label class="popup-label">Infra</label>
              <select id="bastionInfraId" class="popup-select">
                <option value="">-- click Load Infras --</option>
              </select>
            </div>
          </div>
          <div class="popup-col" style="flex: 2;">
            <div class="popup-field">
              <label class="popup-label">Bastion Node</label>
              <select id="bastionNodeId" class="popup-select">
                <option value="">-- select Infra first --</option>
              </select>
            </div>
          </div>
        </div>
        <div class="popup-row">
          <div class="popup-col">
            <span class="popup-hint">💡 For cross-namespace bastions (e.g. AWS Node in a shared-services namespace), change the namespace above and click Load Infras.</span>
          </div>
        </div>
      </div>

    </div>`,
    showCancelButton: true,
    confirmButtonText: "Set Bastion",
    cancelButtonText: "Cancel",
    didOpen: () => {
      // Load Infras button handler
      document.getElementById('loadBastionInfraBtn').addEventListener('click', async () => {
        const bastionNs = document.getElementById('bastionNsId').value.trim();
        if (!bastionNs) { return; }
        const infraSel = document.getElementById('bastionInfraId');
        infraSel.innerHTML = '<option value="">Loading...</option>';
        document.getElementById('bastionNodeId').innerHTML = '<option value="">-- select Infra first --</option>';
        try {
          const res = await axios.get(
            `http://${hostname}:${port}/tumblebug/ns/${bastionNs}/infra?option=id`,
            { auth: { username, password } }
          );
          const infras = Array.isArray(res.data.output) ? res.data.output : [];
          infraSel.innerHTML = '<option value="">-- select Infra --</option>';
          infras.forEach(m => {
            const opt = document.createElement('option');
            opt.value = String(m);
            opt.textContent = String(m);
            infraSel.appendChild(opt);
          });
        } catch (err) {
          infraSel.innerHTML = '<option value="">Failed to load</option>';
          console.error("Failed to load bastion Infras:", err);
        }
      });

      // Infra change → load VMs
      document.getElementById('bastionInfraId').addEventListener('change', async () => {
        const bastionNs = document.getElementById('bastionNsId').value.trim();
        const bastionInfra = document.getElementById('bastionInfraId').value;
        const nodeSel = document.getElementById('bastionNodeId');
        if (!bastionInfra) {
          nodeSel.innerHTML = '<option value="">-- select Infra first --</option>';
          return;
        }
        nodeSel.innerHTML = '<option value="">Loading...</option>';
        try {
          const res = await axios.get(
            `http://${hostname}:${port}/tumblebug/ns/${bastionNs}/infra/${bastionInfra}`,
            { auth: { username, password } }
          );
          const nodes = res.data.node || [];
          // Only show VMs — no auto-select placeholder (auto-select is not supported)
          nodeSel.innerHTML = '<option value="">-- select Node --</option>';
          nodes.forEach(nd => {
            const hasPublic = !!nd.publicIP;
            const opt = document.createElement('option');
            opt.value = String(nd.id);
            opt.textContent = hasPublic ? `${nd.id}  ✅ ${nd.publicIP}` : `${nd.id}  (no public IP)`;
            if (!hasPublic) opt.style.color = '#aaa';
            nodeSel.appendChild(opt);
          });
        } catch (err) {
          nodeSel.innerHTML = '<option value="">Failed to load</option>';
          console.error("Failed to load bastion Nodes:", err);
        }
      });
    },
    preConfirm: () => {
      const targetNodeId = document.getElementById('bastionTargetNodeId').value;
      const bastionNsId = document.getElementById('bastionNsId').value.trim();
      const bastionInfraId = document.getElementById('bastionInfraId').value;
      const bastionNodeId = document.getElementById('bastionNodeId').value; // may be empty → auto-select
      if (!targetNodeId) {
        Swal.showValidationMessage("Please select a target Node");
        return false;
      }
      if (!bastionInfraId) {
        Swal.showValidationMessage("Please load Infras and select a bastion Infra");
        return false;
      }
      return { targetNodeId, bastionNsId, bastionInfraId, bastionNodeId };
    },
  }).then(async (result) => {
    if (!result.isConfirmed || !result.value) return;

    const { targetNodeId, bastionNsId, bastionInfraId, bastionNodeId } = result.value;

    // Build URL based on how many components differ
    let url;
    const sameBastionNs = bastionNsId === namespace;
    const sameBastionInfra = bastionInfraId === infraid;

    if (sameBastionNs && sameBastionInfra && bastionNodeId) {
      // Same NS, same Infra
      url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraid}/node/${targetNodeId}/bastion/${bastionNodeId}`;
    } else if (sameBastionNs && bastionNodeId) {
      // Same NS, different Infra
      url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraid}/node/${targetNodeId}/bastion/${bastionInfraId}/${bastionNodeId}`;
    } else if (sameBastionNs && !bastionNodeId) {
      // Same NS, different Infra, auto-select Node
      url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraid}/node/${targetNodeId}/bastion/${bastionInfraId}/`;
    } else if (bastionNodeId) {
      // Cross-NS with explicit Node
      url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraid}/node/${targetNodeId}/bastion/${bastionNsId}/${bastionInfraId}/${bastionNodeId}`;
    } else {
      // Cross-NS, auto-select Node — not supported via URL params; fall back to explicit auto-select call
      url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraid}/node/${targetNodeId}/bastion/${bastionNsId}/${bastionInfraId}/`;
    }

    // Remove trailing slash if bastionNodeId is empty (auto-select not available via 3-segment route)
    // For auto-select, use the existing same-Infra route which auto-picks a public-IP Node in bastionInfraId
    if (!bastionNodeId) {
      // Use bastionInfraId route without Node ID — not directly supported; show guidance
      Swal.fire({
        icon: 'info',
        title: 'Auto-select requires a Node ID',
        text: `Please select a specific bastion Node. Auto-selection across Infra/namespaces is not supported via the UI — select a Node with a ✅ public IP from the list.`,
        confirmButtonText: 'OK'
      });
      return;
    }

    const spinnerId = addSpinnerTask("Setting bastion node...");
    try {
      const res = await axios({
        method: 'put',
        url: url,
        auth: { username, password },
        timeout: 30000,
      });
      removeSpinnerTask(spinnerId);
      Swal.fire({
        icon: 'success',
        title: '✅ Bastion Set',
        text: JSON.stringify(res.data, null, 2),
        width: 600,
      });
    } catch (err) {
      removeSpinnerTask(spinnerId);
      const msg = err.response?.data?.message || err.message;
      Swal.fire({ icon: 'error', title: 'Failed to set bastion', text: msg });
    }
  });
}

async function executeRemoteCmd() {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;
  var infraid = getSelectedInfraId();
  var nodegroupid = getNodeGroupIdFromNodeSelection();
  var nodeid = document.getElementById("nodeid").value;
  let _appliedDnsUrl = null; // set when Apply DNS succeeds

  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }

  // Fetch Infra list for selector
  let infraListOptions = [];
  try {
    const infraListUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra?option=id`;
    const infraRes = await axios.get(infraListUrl, {
      auth: { username: username, password: password }
    });
    if (infraRes.data.output && infraRes.data.output.length > 0) {
      infraListOptions = infraRes.data.output;
    }
  } catch (err) {
    console.error("Failed to fetch Infra list:", err);
  }

  if (infraListOptions.length === 0) {
    errorAlert("No Infra available. Please create an Infra first.");
    return;
  }

  // Build Infra selector options HTML
  const infraOptionsHtml = infraListOptions.map(m => 
    `<option value="${m}" ${m === infraid ? 'selected' : ''}>${m}</option>`
  ).join('');

  var spinnerId = "";

  console.log("Opening remote command dialog (context Infra: " + infraid + ")");

  var cmd = [];

  // Generate target selection HTML
  const targetSelectionHtml = `
    <p><font size=4><b>[Select target]</b></font></p>
    <div style="display: flex; align-items: center; margin-bottom: 15px;">
      <div style="margin-right: 10px;">
        <input type="radio" id="infraOption" name="selectOption" value="Infra" checked>
        <label for="infraOption">Infra (all Nodes)</label>
      </div>
      <div style="margin-right: 10px;">
        <input type="radio" id="nodeGroupOption" name="selectOption" value="NodeGroup" ${nodegroupid ? '' : 'disabled'}>
        <label for="nodeGroupOption">NodeGroup: <span style="color:green;">${nodegroupid || 'N/A'}</span></label>
      </div>
      <div>
        <input type="radio" id="nodeOption" name="selectOption" value="Node" ${nodeid ? '' : 'disabled'}>
        <label for="nodeOption">Node: <span style="color:red;">${nodeid || 'N/A'}</span></label>
      </div>
    </div>`;

  Swal.fire({
    title: "🖥️ Application Deployment",
    width: 850,
    html: `
    ${POPUP_STYLES}
    <div class="popup-container">
      <!-- Infra & Target Selection Section (Combined) -->
      <div class="popup-section">
        <div class="popup-section-title">🎯 Target Selection</div>
        <div class="popup-row">
          <div class="popup-col" style="flex: 1;">
            <div class="popup-field">
              <label class="popup-label">Infra</label>
              <select id="infraSelector" class="popup-select">
                ${infraOptionsHtml}
              </select>
            </div>
          </div>
          <div class="popup-col" style="flex: 2;">
            <div class="popup-field">
              <label class="popup-label">Scope</label>
              <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center; min-height: 32px;">
                <label class="popup-inline" style="cursor: pointer;">
                  <input type="radio" id="infraOption" name="selectOption" value="Infra" checked>
                  <span class="popup-badge" style="background: #0d6efd; color: white;">All Nodes</span>
                </label>
                <label class="popup-inline" style="cursor: pointer; ${nodegroupid ? '' : 'opacity: 0.5;'}">
                  <input type="radio" id="nodeGroupOption" name="selectOption" value="NodeGroup" ${nodegroupid ? '' : 'disabled'}>
                  <span class="popup-badge" style="background: #28a745; color: white;">NodeGroup</span>
                  <span style="font-size: 0.75rem; color: #666;">${nodegroupid || 'N/A'}</span>
                </label>
                <label class="popup-inline" style="cursor: pointer; ${nodeid ? '' : 'opacity: 0.5;'}">
                  <input type="radio" id="nodeOption" name="selectOption" value="Node" ${nodeid ? '' : 'disabled'}>
                  <span class="popup-badge" style="background: #dc3545; color: white;">Node</span>
                  <span style="font-size: 0.75rem; color: #666;">${nodeid || 'N/A'}</span>
                </label>
              </div>
            </div>
          </div>
          <div class="popup-col" style="flex: 0 0 auto;">
            <div class="popup-field">
              <label class="popup-label">Timeout</label>
              <div class="popup-inline">
                <input type="number" id="timeoutMinutes" class="popup-input" style="width: 60px;" value="30" min="1" max="120">
                <span style="font-size: 0.75rem; color: #666;">min</span>
              </div>
            </div>
          </div>
          <div class="popup-col" style="flex: 0 0 auto;">
            <div class="popup-field">
              <label class="popup-label">SSH User</label>
              <input type="text" id="sshUserName" class="popup-input" style="width: 90px;" placeholder="auto"
                title="Leave blank to auto-detect (tries cb-user, ubuntu, root, ec2-user). Set explicitly for OpenStack (ubuntu) or custom images.">
            </div>
          </div>
        </div>
      </div>

      <!-- DNS Update - shown only if hosted zones are available -->
      <div id="dnsUpdateSection" style="display:none; margin-top: 8px;">
        <div class="popup-section" style="border: 1px solid #b8daff; background: #f0f7ff;">
          <div class="popup-section-title" id="dnsPanelToggle"
            style="cursor:pointer; user-select:none; display:flex; justify-content:space-between; align-items:center;"
            onclick="document.getElementById('dnsPanelBody').style.display = document.getElementById('dnsPanelBody').style.display === 'none' ? '' : 'none'; this.querySelector('.dns-chevron').textContent = document.getElementById('dnsPanelBody').style.display === 'none' ? '▶' : '▼';">
            <span>🌐 DNS Update</span>
            <span class="dns-chevron" style="font-size:0.7rem; color:#555;">▶</span>
          </div>
          <div id="dnsPanelBody" style="display:none; margin-top: 8px;">
            <div class="popup-row">
              <div class="popup-col" style="flex: 1.5;">
                <div class="popup-field">
                  <label class="popup-label">Hosted Zone</label>
                  <select id="dnsHostedZone" class="popup-input"></select>
                </div>
              </div>
              <div class="popup-col" style="flex: 1.5;">
                <div class="popup-field">
                  <label class="popup-label">Record Name <span style="font-weight:normal;color:#888;">(subdomain or blank for apex)</span></label>
                  <input type="text" id="dnsRecordName" class="popup-input" placeholder="e.g., www  or  api.myapp">
                </div>
              </div>
            </div>
            <div class="popup-row">
              <div class="popup-col" style="flex: 0.5;">
                <div class="popup-field">
                  <label class="popup-label">Type</label>
                  <select id="dnsRecordType" class="popup-input">
                    <option value="A">A</option>
                    <option value="AAAA">AAAA</option>
                    <option value="CNAME">CNAME</option>
                  </select>
                </div>
              </div>
              <div class="popup-col" style="flex: 0.5;">
                <div class="popup-field">
                  <label class="popup-label">TTL (s)</label>
                  <input type="number" id="dnsTtl" class="popup-input" value="300" min="1">
                </div>
              </div>
              <div class="popup-col" style="flex: 1; display:flex; align-items:flex-end;">
                <button type="button" id="applyDnsBtn"
                  style="width:100%; padding:6px 12px; background:#0d6efd; color:white; border:none; border-radius:4px; cursor:pointer; font-size:0.85rem;">
                  🌐 Apply DNS
                </button>
              </div>
            </div>
            <div id="dnsApplyResult" style="margin-top:6px; font-size:0.78rem;"></div>
          </div>
        </div>
      </div>

      <!-- Upload Files Section -->
      <div class="popup-section">
        <div class="popup-section-title">📁 Upload Files <span style="font-weight:normal; font-size:0.75rem; color:#888;">(optional, uploaded to /home/cb-user/ before commands run)</span></div>
        <div class="popup-row">
          <div class="popup-col" style="flex:1;">
            <input type="file" id="rcUploadFileInput" class="popup-input" style="padding:4px;" multiple>
          </div>
          <div class="popup-col" style="flex:0 0 auto;">
            <button type="button" id="rcUploadBtn"
              style="padding:5px 14px; background:#6c757d; color:white; border:none; border-radius:4px; cursor:pointer; font-size:0.85rem; white-space:nowrap;">
              ⬆️ Upload Now
            </button>
          </div>
        </div>
        <div id="rcUploadStatus" style="margin-top:5px; font-size:0.78rem;"></div>
      </div>

      <!-- Predefined Scripts Section -->
      <div class="popup-section">
        <div class="popup-section-title">📜 Predefined Scripts</div>
        <div id="scriptCategoryTabs" style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;">
          ${window.generateScriptCategoryTabsHtml(true)}
        </div>
        <div id="categoryDescription" style="font-size: 0.7rem; color: #666; margin-bottom: 6px; padding: 4px 8px; background: #fff3cd; border-radius: 4px;">
          📝 ${(window.predefinedScriptCategories[window._currentScriptCategory || 'llm-ollama'] || window.predefinedScriptCategories['llm-ollama']).description}
        </div>
        <div class="popup-row">
          <div class="popup-col" style="flex: 3;">
            <div class="popup-field">
              <select id="predefinedScripts" class="popup-select">
                ${window.generateScriptOptionsHtml((window.predefinedScriptCategories[window._currentScriptCategory || 'llm-ollama'] || window.predefinedScriptCategories['llm-ollama']).scripts)}
              </select>
            </div>
          </div>
          <div class="popup-col" style="flex: 1;">
            <div class="popup-field">
              <label class="popup-inline" style="font-size: 0.8rem;">
                <input type="checkbox" id="scriptAppendMode"> Append
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Commands Section -->
      <div class="popup-section">
        <div class="popup-section-title">⌨️ Commands</div>
        <div id="cmdContainer">
          <div id="cmdDiv1" class="cmdRow" style="margin-bottom: 6px;">
            <div class="popup-field">
              <div class="popup-inline" style="justify-content: space-between;">
                <label class="popup-label">Command 1</label>
                <button type="button" onclick="document.getElementById('cmd1').value = ''; autoResizeTextarea(document.getElementById('cmd1'));" 
                  style="font-size: 10px; padding: 1px 6px; border: 1px solid #ccc; border-radius: 3px; background: #f8f9fa; cursor: pointer;">Clear</button>
              </div>
              <textarea id="cmd1" rows="1" class="popup-input" style="resize: vertical; overflow: hidden; min-height: 32px;" 
                oninput="autoResizeTextarea(this)">${defaultRemoteCommand[0] || ''}</textarea>
            </div>
          </div>
          <div id="cmdDiv2" class="cmdRow" style="margin-bottom: 6px;">
            <div class="popup-field">
              <div class="popup-inline" style="justify-content: space-between;">
                <label class="popup-label">Command 2</label>
                <button type="button" onclick="document.getElementById('cmd2').value = ''; autoResizeTextarea(document.getElementById('cmd2'));" 
                  style="font-size: 10px; padding: 1px 6px; border: 1px solid #ccc; border-radius: 3px; background: #f8f9fa; cursor: pointer;">Clear</button>
              </div>
              <textarea id="cmd2" rows="1" class="popup-input" style="resize: vertical; overflow: hidden; min-height: 32px;" 
                oninput="autoResizeTextarea(this)">${defaultRemoteCommand[1] || ''}</textarea>
            </div>
          </div>
          <div id="cmdDiv3" class="cmdRow" style="margin-bottom: 6px;">
            <div class="popup-field">
              <div class="popup-inline" style="justify-content: space-between;">
                <label class="popup-label">Command 3</label>
                <button type="button" onclick="document.getElementById('cmd3').value = ''; autoResizeTextarea(document.getElementById('cmd3'));" 
                  style="font-size: 10px; padding: 1px 6px; border: 1px solid #ccc; border-radius: 3px; background: #f8f9fa; cursor: pointer;">Clear</button>
              </div>
              <textarea id="cmd3" rows="1" class="popup-input" style="resize: vertical; overflow: hidden; min-height: 32px;" 
                oninput="autoResizeTextarea(this)">${defaultRemoteCommand[2] || ''}</textarea>
            </div>
          </div>
          <div class="popup-inline" style="gap: 8px; margin-top: 8px;">
            <button id="addCmd" type="button" onclick="addCmd()" 
              style="padding: 4px 12px; border: 1px solid #28a745; border-radius: 4px; background: #28a745; color: white; cursor: pointer; font-size: 12px;">
              + Add Command
            </button>
            <button type="button" onclick="resetCommands()" 
              style="padding: 4px 12px; border: 1px solid #6c757d; border-radius: 4px; background: #f8f9fa; color: #333; cursor: pointer; font-size: 12px;">
              Reset
            </button>
          </div>
        </div>
      </div>

      <!-- Recent Commands Section -->
      ${buildRecentCmdsSectionHtml()}

      <!-- Label Selector Section (generated by helper function) -->
      ${window.generateLabelSelectorHtml(true, true)}

      <!-- Execution Options -->
      <div class="popup-section">
        <div class="popup-section-title">⚙️ Execution Options</div>
        <div class="popup-row">
          <div class="popup-col" style="flex: 1;">
            <label class="popup-inline" style="font-size: 0.8rem; cursor: pointer;">
              <input type="checkbox" id="syncModeToggle">
              <span>Sync Response</span>
              <span style="font-size: 0.65rem; color: #888; margin-left: 4px;">(wait for result &amp; show as formatted view)</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Task Management -->
      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee; text-align: right;">
        <button type="button" onclick="showTaskManagementModal()"
          style="background: #6c757d; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.8rem;">
          📋 View Running Tasks
        </button>
      </div>
    </div>`,
    showCancelButton: true,
    confirmButtonText: "Execute",
    didOpen: () => {
      setupCommandsPopup(0); // 0 means no limit
      setupInfraSelectorForLabels(); // Setup Infra selector for label updates
      setupClearLabelButtonListener(); // Setup Clear All button listener
      // Auto-resize textareas on open
      document.querySelectorAll('#cmdContainer textarea').forEach(ta => autoResizeTextarea(ta));

      // Upload Files handler (parallel, 5 at a time)
      document.getElementById('rcUploadBtn').addEventListener('click', async () => {
        const fileInput = document.getElementById('rcUploadFileInput');
        const statusEl = document.getElementById('rcUploadStatus');
        const files = Array.from(fileInput.files);
        if (files.length === 0) {
          statusEl.innerHTML = '<span style="color:#dc3545;">⚠️ No files selected.</span>';
          return;
        }
        const oversized = files.find(f => f.size > 50 * 1024 * 1024);
        if (oversized) {
          statusEl.innerHTML = `<span style="color:#dc3545;">⚠️ "${window.escapeHtml(oversized.name)}" exceeds 50MB limit.</span>`;
          return;
        }
        const infraId = document.getElementById('infraSelector').value;
        if (!infraId) {
          statusEl.innerHTML = '<span style="color:#dc3545;">⚠️ Select an Infra first.</span>';
          return;
        }

        const radioEl = Swal.getPopup().querySelector('input[name="selectOption"]:checked');
        const radioValue = radioEl ? radioEl.value : 'Infra';
        let uploadUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/transferFile/infra/${infraId}`;
        if (radioValue === 'NodeGroup') uploadUrl += `?nodeGroupId=${encodeURIComponent(nodegroupid)}`;
        else if (radioValue === 'Node') uploadUrl += `?nodeId=${encodeURIComponent(nodeid)}`;

        const btn = document.getElementById('rcUploadBtn');
        btn.disabled = true;
        statusEl.innerHTML = `<span style="color:#0d6efd;">⏳ Uploading 0/${files.length}...</span>`;

        const CONCURRENCY = 3;
        let completed = 0;
        let succeeded = 0;
        let failed = 0;

        // Upload in batches of CONCURRENCY
        const nodeFailDetails = []; // { fileName, nodeId, error }
        for (let i = 0; i < files.length; i += CONCURRENCY) {
          const batch = files.slice(i, i + CONCURRENCY);
          await Promise.all(batch.map(async (file) => {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('path', '/home/cb-user');
            try {
              const res = await axios.post(uploadUrl, fd, {
                headers: {
                  'Authorization': `Basic ${btoa(`${username}:${password}`)}`,
                  'Content-Type': 'multipart/form-data',
                },
              });
              // Check per-Node results inside the response body
              const results = res.data?.results || [];
              const nodeFails = results.filter(r => r.error && r.error.trim());
              if (nodeFails.length > 0) {
                nodeFails.forEach(r => nodeFailDetails.push({ fileName: file.name, nodeId: r.nodeId || '?', error: r.error }));
                failed++;
                console.warn(`RC upload Node-level failure for ${file.name}:`, nodeFails);
              } else {
                succeeded++;
              }
            } catch (e) {
              failed++;
              console.error(`RC upload error for ${file.name}:`, e);
            }
            completed++;
            statusEl.innerHTML = `<span style="color:#0d6efd;">⏳ Uploading ${completed}/${files.length}... ✅${succeeded} ❌${failed}</span>`;
          }));
        }

        btn.disabled = false;
        const color = failed === 0 ? '#198754' : '#fd7e14';
        let statusMsg = `<span style="color:${color};">✅ ${succeeded} uploaded${failed > 0 ? `, ❌ ${failed} failed` : ''} (${files.length} total)</span>`;
        if (nodeFailDetails.length > 0) {
          const detailLines = nodeFailDetails.map(d =>
            `<div style="margin-top:2px;">• ${window.escapeHtml(d.fileName)} → Node <b>${window.escapeHtml(d.nodeId)}</b>: ${window.escapeHtml(d.error)}</div>`
          ).join('');
          statusMsg += `<div style="margin-top:4px; color:#dc3545; font-size:0.75rem;">${detailLines}</div>`;
        }
        statusEl.innerHTML = statusMsg;
      });

      // Load Route53 hosted zones; show DNS section only if available
      (async () => {
        try {
          const res = await axios.get(
            `http://${hostname}:${port}/tumblebug/resources/globalDns/hostedZone`,
            { headers: { 'Authorization': `Basic ${btoa(`${username}:${password}`)}` } }
          );
          const zones = res.data?.hostedZones || [];
          if (zones.length === 0) return; // No Route53 access — keep section hidden

          const zoneSelect = document.getElementById('dnsHostedZone');
          zoneSelect.innerHTML = zones.map(z =>
            `<option value="${window.escapeHtml(z.name)}">${window.escapeHtml(z.name)} (${z.recordCount} records)</option>`
          ).join('');
          // Pre-fill record name with the currently selected Infra ID
          const currentInfraId = document.getElementById('infraSelector')?.value || '';
          if (currentInfraId) {
            document.getElementById('dnsRecordName').value = currentInfraId;
          }
          document.getElementById('dnsUpdateSection').style.display = '';
        } catch (_) {
          // Route53 not available or credentials missing — silently hide
        }
      })();

      // Apply DNS button handler
      document.getElementById('applyDnsBtn').addEventListener('click', async () => {
        const domainName = document.getElementById('dnsHostedZone').value;
        const recordName = document.getElementById('dnsRecordName').value.trim();
        const recordType = document.getElementById('dnsRecordType').value;
        const ttl = parseInt(document.getElementById('dnsTtl').value) || 300;
        const infraId = document.getElementById('infraSelector').value;
        const resultEl = document.getElementById('dnsApplyResult');

        if (!infraId) {
          resultEl.innerHTML = '<span style="color:#dc3545;">⚠️ Select an Infra first.</span>';
          return;
        }

        const btn = document.getElementById('applyDnsBtn');
        btn.disabled = true;
        btn.textContent = '⏳ Applying...';
        resultEl.innerHTML = '';

        try {
          const body = {
            domainName,
            recordName,
            recordType,
            ttl,
            routingPolicy: 'simple',
            setBy: { infra: { nsId: namespace, infraId } },
          };
          await axios.put(
            `http://${hostname}:${port}/tumblebug/resources/globalDns/record`,
            body,
            { headers: { 'Authorization': `Basic ${btoa(`${username}:${password}`)}` } }
          );
          const fullRecord = (recordName ? `${recordName}.${domainName}` : domainName).replace(/\.$/, '');
          _appliedDnsUrl = `http://${fullRecord}`;
          resultEl.innerHTML = `<span style="color:#198754;">✅ DNS record updated: <a href="${_appliedDnsUrl}" target="_blank" style="color:#198754; font-weight:bold;">${window.escapeHtml(fullRecord)}</a> → Infra public IPs (TTL ${ttl}s)</span>`;
        } catch (err) {
          const msg = err.response?.data?.message || err.message || 'Request failed';
          resultEl.innerHTML = `<span style="color:#dc3545;">❌ ${window.escapeHtml(msg)}</span>`;
        } finally {
          btn.disabled = false;
          btn.textContent = '🌐 Apply DNS';
        }
      });
    },
    preConfirm: () => {
      const commands = collectCommands();
      const selectedInfra = document.getElementById("infraSelector").value;
      const timeout = parseInt(document.getElementById("timeoutMinutes").value) || 30;
      const syncMode = document.getElementById("syncModeToggle")?.checked || false;
      const labelSelector = document.getElementById('labelSelector')?.value || '';
      const sshUserName = document.getElementById('sshUserName')?.value?.trim() || '';
      return { commands, selectedInfra, timeout, syncMode, labelSelector, sshUserName, appliedDnsUrl: _appliedDnsUrl };
    },
  }).then((result) => {
      // result.value is false if result.isDenied or another key such as result.isDismissed
      if (result.value && result.value.commands && result.value.commands.length > 0) {
        // Save to recent commands history (with label & sync context)
        saveRecentCmd(result.value.commands, { labelSelector: result.value.labelSelector, syncMode: result.value.syncMode });
        const selectedInfraId = result.value.selectedInfra;
        // Validate timeout is within allowed range (1-120 minutes)
        const timeoutMinutes = Math.max(1, Math.min(120, parseInt(result.value.timeout, 10) || 30));
        const useSyncMode = result.value.syncMode;
        const appliedDnsUrl = result.value.appliedDnsUrl || null;
        
        // Handle radio button value
        const radioValue = Swal.getPopup().querySelector(
          'input[name="selectOption"]:checked'
        ).value;
        if (radioValue === "Infra") {
          var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/infra/${selectedInfraId}`;
          console.log("Performing remote command for Infra:", selectedInfraId);
        } else if (radioValue === "NodeGroup") {
          var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/infra/${selectedInfraId}?nodeGroupId=${encodeURIComponent(nodegroupid)}`;
          console.log("Performing remote command for NodeGroup:", nodegroupid, "in Infra:", selectedInfraId);
        } else if (radioValue === "Node") {
          var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/infra/${selectedInfraId}?nodeId=${encodeURIComponent(nodeid)}`;
          console.log("Performing remote command for Node:", nodeid, "in Infra:", selectedInfraId);
        }

        // Get label selector value and add to URL if provided
        const labelSelector = Swal.getPopup().querySelector('#labelSelector').value;
        if (labelSelector && labelSelector.trim() !== '') {
          url += (url.includes('?') ? '&' : '?') + `labelSelector=${encodeURIComponent(labelSelector)}`;
          console.log("Added labelSelector:", labelSelector);
        }

        cmd = result.value.commands;
        console.log(cmd.join(", "));

        const sshUserName = (result.value.sshUserName || '').trim();
        var commandReqTmp = {
          command: cmd,
          timeoutMinutes: timeoutMinutes,
        };
        if (sshUserName !== '') {
          commandReqTmp.userName = sshUserName;
        }

        var jsonBody = JSON.stringify(commandReqTmp, undefined, 4);

        spinnerId = addSpinnerTask("Remote command to " + selectedInfraId);

        var requestId = generateRandomRequestId("cmd-" + selectedInfraId + "-", 10);
        addRequestIdToSelect(requestId);

        if (useSyncMode) {
          // Sync mode: wait for full response and show formatted result
          console.log('[RemoteCmd] Using sync mode');
          axios({
            method: "post",
            url: url,
            headers: { "Content-Type": "application/json", "x-request-id": requestId },
            data: jsonBody,
            auth: {
              username: `${username}`,
              password: `${password}`,
            },
          }).then((res) => {
            console.log('[RemoteCmd] Sync response:', 'status=' + res.status, res);
            showRemoteCmdResult(res.data, appliedDnsUrl);
            removeSpinnerTask(spinnerId);
          }).catch(function (error) {
            if (error.response) {
              console.log(error.response.data);
              console.log(error.response.status);
              console.log(error.response.headers);
            } else {
              console.log("Error", error.message);
            }
            console.log(error.config);
            var errMsg = error.response && error.response.data
              ? JSON.stringify(error.response.data, null, 2).replace(/['",]+/g, "")
              : error.message || "Unknown error";
            errorAlert(errMsg);
            removeSpinnerTask(spinnerId);
          });
        } else {
          // Async mode: use SSE streaming for real-time log output
          var asyncUrl = url + (url.includes('?') ? '&' : '?') + 'async=true';

          axios({
            method: "post",
            url: asyncUrl,
            headers: { "Content-Type": "application/json", "x-request-id": requestId },
            data: jsonBody,
            auth: {
              username: `${username}`,
              password: `${password}`,
            },
          }).then((res) => {
            console.log('[RemoteCmd] POST response:', 'status=' + res.status, 'hasXRequestId=' + !!(res.data && res.data.xRequestId), 'url=' + asyncUrl, res);

            if (res.status === 202 && res.data && res.data.xRequestId) {
              // Async mode accepted - start background SSE session and open streaming modal
              var xReqId = res.data.xRequestId;
              var streamUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/stream/cmd/infra/${selectedInfraId}?xRequestId=${encodeURIComponent(xReqId)}`;
              console.log('[RemoteCmd] Starting streaming session:', xReqId);
              startStreamingSession(streamUrl, username, password, xReqId, selectedInfraId, spinnerId, appliedDnsUrl);
            } else {
              // Fallback: sync response (async=true not in URL or server returned non-202)
              console.warn('[RemoteCmd] Sync fallback - status:', res.status, 'data:', res.data);
              showRemoteCmdResult(res.data, appliedDnsUrl);
              removeSpinnerTask(spinnerId);
            }
          })
            .catch(function (error) {
              if (error.response) {
                // status code is not 2xx
                console.log(error.response.data);
                console.log(error.response.status);
                console.log(error.response.headers);
              } else {
                console.log("Error", error.message);
              }
              console.log(error.config);

              var errMsg = error.response && error.response.data
                ? JSON.stringify(error.response.data, null, 2).replace(/['",]+/g, "")
                : error.message || "Unknown error";
              errorAlert(errMsg);
              removeSpinnerTask(spinnerId);
            });
        }

      } else {
        console.log("Cannot set command");
        removeSpinnerTask(spinnerId);
      }
    });
}
window.setBastionNode = setBastionNode;
window.executeRemoteCmd = executeRemoteCmd;

// Function for transferFileToInfra by remoteCmd button item
async function transferFileToInfra() {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;
  var infraid = infraidElement.value;
  var nodegroupid = getNodeGroupIdFromNodeSelection();
  var nodeid = document.getElementById("nodeid").value;

  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }

  // Fetch Infra list for selector
  let infraListOptions = [];
  try {
    const infraListUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra?option=id`;
    const infraRes = await axios.get(infraListUrl, {
      auth: { username: username, password: password }
    });
    if (infraRes.data.output && infraRes.data.output.length > 0) {
      infraListOptions = infraRes.data.output;
    }
  } catch (err) {
    console.error("Failed to fetch Infra list:", err);
  }

  if (infraListOptions.length === 0) {
    errorAlert("No Infra available. Please create an Infra first.");
    return;
  }

  // Build Infra selector options HTML
  const infraOptionsHtml = infraListOptions.map(m =>
    `<option value="${window.escapeHtml(m)}" ${m === infraid ? 'selected' : ''}>${window.escapeHtml(m)}</option>`
  ).join('');

  // Fetch Node list for the selected Infra (for download target)
  let vmListOptions = [];
  const fetchVmList = async (targetInfraId) => {
    try {
      const vmListUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${targetInfraId}`;
      const vmRes = await axios.get(vmListUrl, {
        auth: { username: username, password: password }
      });
      if (vmRes.data && vmRes.data.node) {
        return vmRes.data.node.map(nd => ({
          id: nd.id,
          nodeGroupId: nd.nodeGroupId || 'default',
          publicIP: nd.publicIP || ''
        }));
      }
    } catch (err) {
      console.error("Failed to fetch Node list:", err);
    }
    return [];
  };

  vmListOptions = await fetchVmList(infraid || infraListOptions[0]);

  const buildNodeOptionsHtml = (nodes) => {
    if (nodes.length === 0) return '<option value="">No Nodes available</option>';
    return nodes.map(nd =>
      `<option value="${window.escapeHtml(nd.id)}" ${nd.id === nodeid ? 'selected' : ''}>${window.escapeHtml(nd.id)} (${window.escapeHtml(nd.nodeGroupId)}) ${nd.publicIP ? '- ' + window.escapeHtml(nd.publicIP) : ''}</option>`
    ).join('');
  };

  console.log("Opening file transfer dialog (context Infra: " + infraid + ")");

  Swal.fire({
    title: "📁 File Transfer",
    width: 800,
    html: `
    ${POPUP_STYLES}
    <div class="popup-container">
      <!-- Mode Toggle -->
      <div class="popup-section">
        <div class="popup-section-title">📂 Transfer Mode</div>
        <div class="popup-row">
          <div class="popup-col" style="flex: 1;">
            <div style="display: flex; gap: 8px;">
              <button type="button" id="uploadModeBtn" class="popup-badge" onclick="switchFileTransferMode('upload')"
                style="padding: 8px 20px; font-size: 0.9rem; cursor: pointer; border: 2px solid #28a745; background: #28a745; color: white; border-radius: 6px; flex: 1; text-align: center;">
                ⬆️ Upload to Node
              </button>
              <button type="button" id="downloadModeBtn" class="popup-badge" onclick="switchFileTransferMode('download')"
                style="padding: 8px 20px; font-size: 0.9rem; cursor: pointer; border: 2px solid #0d6efd; background: #f8f9fa; color: #333; border-radius: 6px; flex: 1; text-align: center;">
                ⬇️ Download from Node
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Target Selection -->
      <div class="popup-section">
        <div class="popup-section-title">🎯 Target Selection</div>
        <div class="popup-row">
          <div class="popup-col" style="flex: 1;">
            <div class="popup-field">
              <label class="popup-label">Infra</label>
              <select id="infraSelector" class="popup-select">
                ${infraOptionsHtml}
              </select>
            </div>
          </div>
          <!-- Upload: scope selection -->
          <div id="uploadTargetScope" class="popup-col" style="flex: 2;">
            <div class="popup-field">
              <label class="popup-label">Scope</label>
              <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center; min-height: 32px;">
                <label class="popup-inline" style="cursor: pointer;">
                  <input type="radio" id="infraOption" name="selectOption" value="Infra" checked>
                  <span class="popup-badge" style="background: #0d6efd; color: white;">All Nodes</span>
                </label>
                <label class="popup-inline" style="cursor: pointer; ${nodegroupid ? '' : 'opacity: 0.5;'}">
                  <input type="radio" id="nodeGroupOption" name="selectOption" value="NodeGroup" ${nodegroupid ? '' : 'disabled'}>
                  <span class="popup-badge" style="background: #28a745; color: white;">NodeGroup</span>
                  <span style="font-size: 0.75rem; color: #666;">${nodegroupid || 'N/A'}</span>
                </label>
                <label class="popup-inline" style="cursor: pointer; ${nodeid ? '' : 'opacity: 0.5;'}">
                  <input type="radio" id="nodeOption" name="selectOption" value="Node" ${nodeid ? '' : 'disabled'}>
                  <span class="popup-badge" style="background: #dc3545; color: white;">Node</span>
                  <span style="font-size: 0.75rem; color: #666;">${nodeid || 'N/A'}</span>
                </label>
              </div>
            </div>
          </div>
          <!-- Download: Node selector -->
          <div id="downloadTargetVm" class="popup-col" style="flex: 2; display: none;">
            <div class="popup-field">
              <label class="popup-label">Node</label>
              <select id="downloadNodeSelector" class="popup-select">
                ${buildNodeOptionsHtml(vmListOptions)}
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Upload Section -->
      <div id="uploadSection">
        <div class="popup-section">
          <div class="popup-section-title">⬆️ Upload Settings</div>
          <div class="popup-row">
            <div class="popup-col" style="flex: 1;">
              <div class="popup-field">
                <label class="popup-label">File(s) (max 50MB each)</label>
                <input type="file" id="fileInput" class="popup-input" style="padding: 4px;" multiple />
              </div>
            </div>
          </div>
          <div class="popup-row">
            <div class="popup-col" style="flex: 1;">
              <div class="popup-field">
                <label class="popup-label">Target Path on Node</label>
                <input type="text" id="targetPathInput" class="popup-input" value="/home/cb-user/" placeholder="/home/cb-user/">
              </div>
            </div>
          </div>
          <div class="popup-row">
            <div class="popup-col" style="flex: 1;">
              <div class="popup-field">
                <label class="popup-label">Post-transfer Command <span style="font-weight: normal; color: #888;">(optional)</span>
                  <span id="favoritesCountBadge" style="display:none; font-size:0.7rem; background:#ffc107; color:#333; border-radius:3px; padding:1px 5px; margin-left:4px;"></span>
                  <span style="font-size:0.7rem; color:#0d6efd; margin-left:4px;" title="Use {filename} to insert the uploaded file's name into the command">💡 use <code>{filename}</code> for per-file substitution</span>
                </label>
                <div style="display:flex; gap:6px; align-items:center;">
                  <input type="text" id="postTransferCmd" class="popup-input" value="" placeholder="e.g., sudo mv /home/cb-user/{filename} /var/www/html/{filename}" style="flex:1;">
                  <button type="button" id="saveFavBtn" title="Save to favorites" style="padding:4px 8px; border:1px solid #ffc107; background:#fff8e1; border-radius:4px; cursor:pointer; font-size:0.85rem; white-space:nowrap;">⭐</button>
                  <button type="button" id="showFavBtn" title="Show favorites" style="padding:4px 8px; border:1px solid #0d6efd; background:#e7f0ff; border-radius:4px; cursor:pointer; font-size:0.85rem; white-space:nowrap;">📋</button>
                </div>
                <div id="favoritesDropdown" style="display:none; margin-top:4px; border:1px solid #ddd; border-radius:4px; background:#fff; max-height:140px; overflow-y:auto; box-shadow:0 2px 6px rgba(0,0,0,0.1);"></div>
              </div>
            </div>
          </div>
          <div style="font-size: 0.7rem; color: #666; padding: 4px 8px; background: #fff3cd; border-radius: 4px;">
            📝 File(s) will be uploaded to the specified path on all targeted Nodes via SCP through bastion hosts. Multiple files can be selected.<br>
            🔧 If a post-transfer command is provided, it will be executed on each Node after successful file transfer (e.g., move file to a privileged location).
          </div>
        </div>
      </div>

      <!-- Download Section -->
      <div id="downloadSection" style="display: none;">
        <div class="popup-section">
          <div class="popup-section-title">⬇️ Download Settings</div>
          <div class="popup-row">
            <div class="popup-col" style="flex: 1;">
              <div class="popup-field">
                <label class="popup-label">Source Path on Node (full file path)</label>
                <input type="text" id="sourcePathInput" class="popup-input" value="" placeholder="/home/cb-user/result.json">
              </div>
            </div>
          </div>
          <div style="font-size: 0.7rem; color: #666; padding: 4px 8px; background: #d1ecf1; border-radius: 4px;">
            📝 The file will be downloaded from the selected Node via SCP through bastion host. Max file size: 200MB.
          </div>
        </div>
      </div>
    </div>`,
    showCancelButton: true,
    confirmButtonText: "⬆️ Upload",
    cancelButtonText: "Close",
    didOpen: () => {
      // Make mode switch function available
      window.switchFileTransferMode = (mode) => {
        const uploadBtn = document.getElementById('uploadModeBtn');
        const downloadBtn = document.getElementById('downloadModeBtn');
        const uploadSection = document.getElementById('uploadSection');
        const downloadSection = document.getElementById('downloadSection');
        const uploadTargetScope = document.getElementById('uploadTargetScope');
        const downloadTargetVm = document.getElementById('downloadTargetVm');
        const confirmBtn = Swal.getConfirmButton();

        if (mode === 'upload') {
          uploadBtn.style.background = '#28a745';
          uploadBtn.style.color = 'white';
          uploadBtn.style.borderColor = '#28a745';
          downloadBtn.style.background = '#f8f9fa';
          downloadBtn.style.color = '#333';
          downloadBtn.style.borderColor = '#0d6efd';
          uploadSection.style.display = '';
          downloadSection.style.display = 'none';
          uploadTargetScope.style.display = '';
          downloadTargetVm.style.display = 'none';
          confirmBtn.textContent = '⬆️ Upload';
          confirmBtn.style.background = '#28a745';
          confirmBtn.classList.remove('swal2-styled-download');
          document.getElementById('fileTransferMode').value = 'upload';
        } else {
          downloadBtn.style.background = '#0d6efd';
          downloadBtn.style.color = 'white';
          downloadBtn.style.borderColor = '#0d6efd';
          uploadBtn.style.background = '#f8f9fa';
          uploadBtn.style.color = '#333';
          uploadBtn.style.borderColor = '#28a745';
          uploadSection.style.display = 'none';
          downloadSection.style.display = '';
          uploadTargetScope.style.display = 'none';
          downloadTargetVm.style.display = '';
          confirmBtn.textContent = '⬇️ Download';
          confirmBtn.style.background = '#0d6efd';
          document.getElementById('fileTransferMode').value = 'download';
        }
      };

      // Add hidden input to track mode
      const hiddenInput = document.createElement('input');
      hiddenInput.type = 'hidden';
      hiddenInput.id = 'fileTransferMode';
      hiddenInput.value = 'upload';
      Swal.getPopup().appendChild(hiddenInput);

      // Update Node list when Infra selector changes
      document.getElementById('infraSelector').addEventListener('change', async (e) => {
        const selectedInfra = e.target.value;
        const newNodeList = await fetchVmList(selectedInfra);
        const nodeSelector = document.getElementById('downloadNodeSelector');
        nodeSelector.innerHTML = buildNodeOptionsHtml(newNodeList);
      });

      // Favorites for post-transfer command (persisted via localStorage)
      const FAV_KEY = 'postTransferCmdFavorites';
      const getFavs = () => JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
      const setFavs = (f) => localStorage.setItem(FAV_KEY, JSON.stringify(f));

      // Seed default favorites on first use
      if (!localStorage.getItem(FAV_KEY)) {
        setFavs([
          // Web server deployment
          'sudo mv /home/cb-user/* /var/www/html/',
          'sudo cp /home/cb-user/nginx.conf /etc/nginx/sites-available/default && sudo systemctl restart nginx',
          'sudo cp /home/cb-user/nginx.conf /etc/nginx/ && sudo nginx -t && sudo systemctl reload nginx',
          // Directory creation
          'sudo mkdir -p /var/www/html && sudo mv /home/cb-user/* /var/www/html/',
          'mkdir -p /home/cb-user/app && mv /home/cb-user/* /home/cb-user/app/',
          // Permissions & script execution
          'chmod +x /home/cb-user/*.sh && bash /home/cb-user/*.sh',
          'sudo chmod +x /home/cb-user/*.sh && sudo bash /home/cb-user/*.sh',
          // Archive extraction to web root (auto-detect format, overwrite-safe)
          'which unzip || sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y unzip; f=/home/cb-user/{filename}; case "$f" in *.zip) sudo unzip -o "$f" -d /var/www/html/ ;; *.tar.gz|*.tgz) sudo tar -xzf "$f" -C /var/www/html/ ;; *.tar.bz2) sudo tar -xjf "$f" -C /var/www/html/ ;; esac',
          // Archive extraction to home dir
          'tar -xzf /home/cb-user/*.tar.gz -C /home/cb-user/',
          'unzip /home/cb-user/*.zip -d /home/cb-user/',
          // Docker
          'docker load -i /home/cb-user/*.tar',
          'cd /home/cb-user && docker compose up -d',
          // Package install
          'sudo dpkg -i /home/cb-user/*.deb',
          // Systemd service
          'sudo cp /home/cb-user/*.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now $(basename /home/cb-user/*.service)',
          // Disk & system usage
          'df -h',
          'du -sh /home/cb-user/*',
          'free -h && df -h',
        ]);
      }

      const refreshFavBadge = () => {
        const f = getFavs();
        const badge = document.getElementById('favoritesCountBadge');
        badge.style.display = f.length > 0 ? '' : 'none';
        badge.textContent = `${f.length} saved`;
      };

      const renderFavList = () => {
        const f = getFavs();
        const dropdown = document.getElementById('favoritesDropdown');
        if (f.length === 0) {
          dropdown.innerHTML = '<div style="padding:8px;color:#888;font-size:0.8rem;">No favorites saved yet.</div>';
          return;
        }
        dropdown.innerHTML = f.map((cmd, i) =>
          `<div style="display:flex;align-items:center;gap:4px;padding:5px 8px;border-bottom:1px solid #eee;">
            <span class="fav-cmd-item" data-idx="${i}" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;color:#0d6efd;font-size:0.8rem;" title="${cmd.replace(/"/g,'&quot;')}">${cmd}</span>
            <button type="button" class="fav-del-btn" data-idx="${i}" style="border:none;background:none;color:#dc3545;cursor:pointer;padding:0 4px;font-size:0.85rem;" title="Remove">✕</button>
          </div>`
        ).join('');
      };

      refreshFavBadge();

      document.getElementById('saveFavBtn').addEventListener('click', () => {
        const cmd = document.getElementById('postTransferCmd').value.trim();
        if (!cmd) return;
        const f = getFavs();
        if (f.includes(cmd)) {
          const btn = document.getElementById('saveFavBtn');
          btn.style.borderColor = '#aaa';
          setTimeout(() => { btn.style.borderColor = '#ffc107'; }, 1500);
          return;
        }
        f.push(cmd);
        setFavs(f);
        refreshFavBadge();
        const btn = document.getElementById('saveFavBtn');
        btn.textContent = '✅';
        setTimeout(() => { btn.textContent = '⭐'; }, 1200);
      });

      document.getElementById('showFavBtn').addEventListener('click', () => {
        const dropdown = document.getElementById('favoritesDropdown');
        if (dropdown.style.display === 'none') {
          renderFavList();
          dropdown.style.display = '';
        } else {
          dropdown.style.display = 'none';
        }
      });

      document.getElementById('favoritesDropdown').addEventListener('click', (e) => {
        const item = e.target.closest('.fav-cmd-item');
        const delBtn = e.target.closest('.fav-del-btn');
        if (item) {
          const f = getFavs();
          document.getElementById('postTransferCmd').value = f[+item.dataset.idx] || '';
          document.getElementById('favoritesDropdown').style.display = 'none';
        } else if (delBtn) {
          const f = getFavs();
          f.splice(+delBtn.dataset.idx, 1);
          setFavs(f);
          refreshFavBadge();
          renderFavList();
        }
      });
    },
    preConfirm: () => {
      const mode = document.getElementById('fileTransferMode').value;
      const selectedInfra = document.getElementById('infraSelector').value;

      if (mode === 'upload') {
        const fileInput = document.getElementById('fileInput');
        const targetPath = document.getElementById('targetPathInput').value;
        const files = Array.from(fileInput.files);
        if (files.length === 0) {
          Swal.showValidationMessage('Please select file(s) to upload.');
          return false;
        }
        const fileSizeLimit = 50 * 1024 * 1024; // 50MB
        const oversized = files.find(f => f.size > fileSizeLimit);
        if (oversized) {
          Swal.showValidationMessage(`File "${oversized.name}" is too large. Maximum upload size is 50MB per file.`);
          return false;
        }
        if (!targetPath) {
          Swal.showValidationMessage('Please specify the target path.');
          return false;
        }
        const postTransferCmd = document.getElementById('postTransferCmd').value.trim();
        return { mode, selectedInfra, files, targetPath, postTransferCmd };
      } else {
        const selectedVm = document.getElementById('downloadNodeSelector').value;
        const sourcePath = document.getElementById('sourcePathInput').value;
        if (!selectedVm) {
          Swal.showValidationMessage('Please select a Node.');
          return false;
        }
        if (!sourcePath) {
          Swal.showValidationMessage('Please specify the source file path on the Node.');
          return false;
        }
        return { mode, selectedInfra, selectedVm, sourcePath };
      }
    },
  }).then((result) => {
    if (result.value) {
      const { mode, selectedInfra } = result.value;

      if (mode === 'upload') {
        // === UPLOAD (supports multiple files) ===
        const { files, targetPath, postTransferCmd } = result.value;
        const radioValue = Swal.getPopup().querySelector('input[name="selectOption"]:checked').value;
        const endpoint = postTransferCmd ? 'transferFileAndCmd' : 'transferFile';
        let url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/${endpoint}/infra/${selectedInfra}`;
        if (radioValue === 'NodeGroup') {
          url += `?nodeGroupId=${encodeURIComponent(nodegroupid)}`;
        } else if (radioValue === 'Node') {
          url += `?nodeId=${encodeURIComponent(nodeid)}`;
        }

        const totalFiles = files.length;
        const scopeLabel = radioValue === 'NodeGroup' ? nodegroupid : radioValue === 'Node' ? nodeid : selectedInfra;

        Swal.fire({
          title: `⬆️ Uploading (0/${totalFiles})...`,
          html: `<div style="text-align: left; padding: 10px;">
            <p><b>Files:</b> ${totalFiles} file(s) selected</p>
            <p><b>Target:</b> ${window.escapeHtml(targetPath)}</p>
            <p><b>Scope:</b> ${window.escapeHtml(radioValue)} ${window.escapeHtml(scopeLabel)}</p>
            ${postTransferCmd ? `<p><b>Post-cmd:</b> <code style="font-size:0.8rem;" id="postCmdPreview">${window.escapeHtml(postTransferCmd)}</code></p>` : ''}
            <div id="uploadProgressDetail" style="margin-top: 8px; font-size: 0.8rem; color: #666;">Preparing...</div>
          </div>`,
          allowOutsideClick: false,
          didOpen: () => { Swal.showLoading(); },
        });

        // Upload files in parallel batches of 5
        (async () => {
          const allResults = [];
          const fileErrors = [];
          let lastResData = null;
          const allResData = [];
          let completed = 0;
          const CONCURRENCY = 3;

          const uploadFile = async (file) => {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('path', targetPath.replace(/\/+$/, ''));
            if (postTransferCmd) {
              formData.append('command', postTransferCmd.replaceAll('{filename}', file.name));
            }
            try {
              const res = await axios({
                method: 'post',
                url: url,
                headers: {
                  'Authorization': `Basic ${btoa(`${username}:${password}`)}`,
                  'Content-Type': 'multipart/form-data',
                },
                data: formData,
              });
              lastResData = res.data;
              allResData.push({ fileName: file.name, ...res.data });
              const results = res.data.results || [];
              results.forEach(r => allResults.push({ ...r, _fileName: file.name }));
            } catch (error) {
              console.error(`Upload error for ${file.name}:`, error);
              const errMsg = error.response?.data?.message || error.message || 'Request failed';
              fileErrors.push({ name: file.name, error: errMsg });
            }
            completed++;
            const progressEl = document.getElementById('uploadProgressDetail');
            if (progressEl) progressEl.textContent = `${completed}/${totalFiles} done...`;
            Swal.update({ title: `⬆️ Uploading (${completed}/${totalFiles})...` });
          };

          for (let i = 0; i < totalFiles; i += CONCURRENCY) {
            await Promise.all(files.slice(i, i + CONCURRENCY).map(uploadFile));
          }

          // Show accumulated results
          const successCount = allResults.filter(r => !r.error).length;
          const failCount = allResults.filter(r => r.error).length + fileErrors.length;

          let resultHtml = `<div style="text-align: left; padding: 10px; max-height: 400px; overflow-y: auto;">`;
          resultHtml += `<p style="font-size: 1.1rem; margin-bottom: 12px;">📁 <b>${totalFiles}</b> file(s) — ✅ <b>${successCount}</b> succeeded, ❌ <b>${failCount}</b> failed</p>`;

          // Per-file request errors
          fileErrors.forEach(fe => {
            resultHtml += `<div style="padding: 6px 10px; margin-bottom: 4px; border-radius: 4px; background: #f8d7da; font-size: 0.8rem;">
              ❌ <b>${window.escapeHtml(fe.name)}</b> — ${window.escapeHtml(fe.error)}
            </div>`;
          });

          // Per-Node results
          allResults.forEach(r => {
            const isSuccess = !r.error;
            const safeNodeId = window.escapeHtml(r.nodeId || '');
            const safeNodeIp = window.escapeHtml(r.nodeIp || 'N/A');
            const safeFileName = window.escapeHtml(r._fileName || '');
            const safeDetail = isSuccess
              ? '✅ ' + window.escapeHtml(r.stdout && r.stdout['0'] || 'OK')
              : '❌ ' + window.escapeHtml(r.error || r.stderr && r.stderr['0'] || 'Failed');
            resultHtml += `<div style="padding: 6px 10px; margin-bottom: 4px; border-radius: 4px; background: ${isSuccess ? '#d4edda' : '#f8d7da'}; font-size: 0.8rem;">
              <b>${safeNodeId}</b> (${safeNodeIp}) — ${safeFileName} — ${safeDetail}
            </div>`;
          });
          resultHtml += `</div>`;

          Swal.fire({
            icon: failCount === 0 ? 'success' : 'warning',
            title: `Upload ${failCount === 0 ? 'Complete' : 'Partial'}`,
            html: resultHtml,
            width: 700,
          });
          if (lastResData) {
            // Show combined results for all files in JSON panel
            const combinedData = totalFiles > 1
              ? { totalFiles, results: allResData }
              : lastResData;
            displayJsonData(combinedData, typeInfo);
          }
        })();

      } else {
        // === DOWNLOAD ===
        const { selectedVm, sourcePath } = result.value;
        const url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/downloadFile/infra/${selectedInfra}/node/${selectedVm}`;

        Swal.fire({
          title: '⬇️ Downloading...',
          html: `<div style="text-align: left; padding: 10px;">
            <p><b>File:</b> ${window.escapeHtml(sourcePath)}</p>
            <p><b>From:</b> ${window.escapeHtml(selectedVm)} in ${window.escapeHtml(selectedInfra)}</p>
          </div>`,
          allowOutsideClick: false,
          didOpen: () => { Swal.showLoading(); },
        });

        axios({
          method: 'post',
          url: url,
          headers: {
            'Authorization': `Basic ${btoa(`${username}:${password}`)}`,
            'Content-Type': 'application/json',
          },
          data: JSON.stringify({ sourcePath: sourcePath }),
          responseType: 'blob',
        })
          .then((res) => {
            // Extract filename from Content-Disposition header or use source path
            let downloadFileName = sourcePath.split('/').pop() || 'downloaded_file';
            const contentDisposition = res.headers['content-disposition'];
            if (contentDisposition) {
              const match = contentDisposition.match(/filename="?([^";\n]+)"?/);
              if (match) downloadFileName = match[1];
            }

            // Create download link
            const blob = new Blob([res.data]);
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = downloadFileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);

            Swal.fire({
              icon: 'success',
              title: 'Download Complete',
              html: `<div style="text-align: left; padding: 10px;">
                <p>✅ File <b>${window.escapeHtml(downloadFileName)}</b> (${(blob.size / 1024).toFixed(1)} KB) downloaded successfully.</p>
                <p style="font-size: 0.8rem; color: #666;">Source: ${window.escapeHtml(selectedVm)} in ${window.escapeHtml(selectedInfra)}</p>
              </div>`,
            });
          })
          .catch(async (error) => {
            console.error('Download error:', error);
            // For blob responseType, error response data needs special handling
            let errMsg = error.message || 'Unknown error';
            if (error.response?.data instanceof Blob) {
              try {
                const text = await error.response.data.text();
                const parsed = JSON.parse(text);
                errMsg = parsed.message || JSON.stringify(parsed, null, 2);
              } catch (e) {
                errMsg = 'Download failed. Check if the file path is correct and the Node is running.';
              }
            } else if (error.response?.data) {
              errMsg = JSON.stringify(error.response.data, null, 2).replace(/['",]+/g, '');
            }
            errorAlert(errMsg);
          });
      }
    } else {
      console.log('File transfer was canceled.');
    }
  });
}
window.transferFileToInfra = transferFileToInfra;

// function for getAccessInfo of Infra
function getAccessInfo() {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;
  var infraid = getSelectedInfraId();

  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }
  if (!infraid) {
    errorAlert("Please select an Infra first");
    return;
  }

  console.log(
    "Retrieve access information for Infra:" + infraid
  );

    var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraid}?option=accessinfo`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    }).then((res) => {
      console.log(res); // for debug
      displayJsonData(res.data, typeInfo);
    });
}
window.getAccessInfo = getAccessInfo;


// SSH Key save function (single Node)
const saveBtn = document.querySelector(".save-file");
saveBtn.addEventListener("click", function () {
  console.log(" [Retrieve Infra Access Information ...]\n");

  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;
  var infraid = infraidElement.value;
  var groupid = getNodeGroupIdFromNodeSelection();
  var nodeid = document.getElementById("nodeid").value;

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraid}?option=accessinfo&accessInfoOption=showSshKey`;

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  }).then((res) => {
    console.log(res); // for debug
    displayJsonData(res.data, typeInfo);
    var privateKey = "";

    for (let nodeGroupAccessInfo of res.data.InfraNodeGroupAccessInfo) {
      if (nodeGroupAccessInfo.NodeGroupId == groupid) {
        for (let nodeAccessInfo of nodeGroupAccessInfo.NodeAccessInfo) {
          if (nodeAccessInfo.nodeId == nodeid) {
            privateKey = nodeAccessInfo.privateKey.replace(/['",]+/g, "");
            break;
          }
        }
      }
    }

    var tempLink = document.createElement("a");
    var taBlob = new Blob([privateKey], { type: "text/plain" });

    tempLink.setAttribute("href", URL.createObjectURL(taBlob));
    tempLink.setAttribute("download", `${namespace}-${infraid}-${nodeid}.pem`);
    tempLink.click();

    URL.revokeObjectURL(tempLink.href);
  });
});

// Download ALL Node SSH keys in an Infra as a single zip file
function downloadAllSshKeys() {
  console.log(" [Download All SSH Keys as ZIP ...]\n");

  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;
  var infraid = infraidElement.value;

  if (!namespace || !infraid) {
    Swal.fire("Error", "Please select a namespace and Infra first.", "warning");
    return;
  }

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraid}?option=accessinfo&accessInfoOption=showSshKey`;

  Swal.fire({
    title: "Downloading SSH Keys...",
    html: "Retrieving access information for all Nodes.",
    allowOutsideClick: false,
    didOpen: () => { Swal.showLoading(); }
  });

  // Fetch both Infra info and access info in parallel
  var infraInfoUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraid}`;
  var authConfig = { username: username, password: password };

  Promise.all([
    axios({ method: "get", url: url, auth: authConfig }),
    axios({ method: "get", url: infraInfoUrl, auth: authConfig })
  ]).then(([accessRes, infoRes]) => {
    const zip = new JSZip();
    let keyCount = 0;

    // Sanitize path component to prevent zip-slip (strip path separators and traversal segments)
    const safeName = (name) => String(name).replace(/[\\/]/g, "_").replace(/\.\./g, "_").replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown";

    for (let nodeGroupAccessInfo of (accessRes.data.InfraNodeGroupAccessInfo || [])) {
      const nodeGroupId = safeName(nodeGroupAccessInfo.NodeGroupId || "unknown");
      const nodeGroupVmSummaries = [];
      for (let nodeAccessInfo of (nodeGroupAccessInfo.NodeAccessInfo || [])) {
        const nodeId = safeName(nodeAccessInfo.nodeId || "unknown");
        const privateKey = (nodeAccessInfo.privateKey || "").replace(/['",]+/g, "");
        if (privateKey) {
          zip.file(`${nodeGroupId}/${safeName(namespace)}-${safeName(infraid)}-${nodeId}.pem`, privateKey);
          keyCount++;
        }
        // Collect per-Node summary for nodegroup JSON
        nodeGroupVmSummaries.push({
          nodeId: nodeId,
          publicIP: nodeAccessInfo.publicIP || "",
          privateIP: nodeAccessInfo.privateIP || "",
          sshPort: nodeAccessInfo.sshPort || 22,
          nodeUserName: nodeAccessInfo.nodeUserName || "",
          keyFile: `${safeName(namespace)}-${safeName(infraid)}-${nodeId}.pem`
        });
      }
      // Add per-nodegroup access info JSON
      if (nodeGroupVmSummaries.length > 0) {
        zip.file(`${nodeGroupId}/access-info.json`, JSON.stringify({
          nodeGroupId: nodeGroupId,
          ndCount: nodeGroupVmSummaries.length,
          nodes: nodeGroupVmSummaries
        }, null, 2));
      }
    }

    if (keyCount === 0) {
      Swal.fire("No Keys Found", "No SSH private keys were found for this Infra.", "info");
      return;
    }

    // Add Infra info JSON
    zip.file(`${safeName(infraid)}-info.json`, JSON.stringify(infoRes.data, null, 2));

    // Add access info JSON (redact privateKey to avoid duplication with .pem files)
    const redactedAccessInfoJson = JSON.stringify(
      accessRes.data,
      (key, value) => (key === "privateKey" ? undefined : value),
      2
    );
    zip.file(`${safeName(infraid)}-access-info.json`, redactedAccessInfoJson);

    return zip.generateAsync({ type: "blob" }).then((content) => {
      var tempLink = document.createElement("a");
      tempLink.setAttribute("href", URL.createObjectURL(content));
      tempLink.setAttribute("download", `${namespace}-${infraid}-ssh-keys.zip`);
      tempLink.click();
      URL.revokeObjectURL(tempLink.href);

      Swal.fire({
        icon: "success",
        title: "Download Complete",
        html: `Downloaded <strong>${keyCount}</strong> SSH key(s) as a ZIP file.<br><code>${window.escapeHtml(namespace)}-${window.escapeHtml(infraid)}-ssh-keys.zip</code>`,
        timer: 3000,
        showConfirmButton: false
      });
    });
  }).catch((err) => {
    console.error(err);
    Swal.fire("Error", "Failed to retrieve SSH keys: " + (err.message || err), "error");
  });
}
window.downloadAllSshKeys = downloadAllSshKeys;

// Global array to store X-Request-Ids
let xRequestIds = [];

// Function to handle Axios response and extract X-Request-Id
function handleAxiosResponse(response) {
  // Extract X-Request-Id from the response headers
  console.log("Response Headers:", response.headers);
  const requestId = response.headers["x-request-id"];
  console.log("X-Request-Id:", requestId);
  if (requestId) {
    addRequestIdToSelect(requestId);
  }
}

// Function to add X-Request-Id to the select element
function addRequestIdToSelect(requestId) {
  // Add X-Request-Id to the global array if it's not already present
  if (!xRequestIds.includes(requestId)) {
    xRequestIds.push(requestId);
    const select = document.getElementById("xRequestIdSelect");
    const option = document.createElement("option");
    option.value = requestId;
    option.text = requestId;
    select.appendChild(option);
  }
}

// Function to generate a random X-Request-Id with a prefix and specified total length
function generateRandomRequestId(prefix, totalLength) {
  const characters = '0123456789';
  let result = prefix;
  const charactersLength = characters.length;
  const randomPartLength = totalLength;
  for (let i = 0; i < randomPartLength; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

// Function to handle selection of an X-Request-Id
function handleRequestIdSelection() {
  const select = document.getElementById("xRequestIdSelect");
  const selectedRequestId = select.value;
  console.log("Selected X-Request-Id:", selectedRequestId);

  // actions based on the selected X-Request-Id

  if (selectedRequestId) {
    var config = getConfig(); var hostname = config.hostname;
    var port = config.port;
    var username = config.username;
    var password = config.password;

    var url = `http://${hostname}:${port}/tumblebug/request/${selectedRequestId}`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    }).then((res) => {
      console.log(res); // for debug
      displayJsonData(res.data, typeInfo);
    });
  } else {
    console.log("No X-Request-Id selected");
  }
}
window.handleRequestIdSelection = handleRequestIdSelection;

window.onload = function () {
  // Get host address and update configuration
  var tbServerAp = window.location.host;
  var strArray = tbServerAp.split(":");
  console.log("Host address: " + strArray[0]);
  configHostname = strArray[0];

  // Use the new connection check with retry instead of single getConnection call
  setTimeout(checkConnectionWithRetry, 1000);

  updateCredentialHolderList();
  updateNsList();

  getInfra();

  // Add event listener for Provision tab to show map when clicked
  const provisionTab = document.getElementById('provision-tab');
  if (provisionTab) {
    provisionTab.addEventListener('click', function(e) {
      console.log('Provision tab clicked, switching to map view');
      // Small delay to allow tab to activate first
      setTimeout(function() {
        if (typeof showMap === 'function') {
          showMap();
        } else {
          console.log('showMap function not found');
        }
      }, 100);
    });
  }
};

let drawCounter = 0;
const shuffleInterval = 200; // Shuffle every shuffleInterval draws
let shuffledKeys = Object.keys(cspIconStyles); // Initialize with original keys

function shuffleKeys() {
  shuffledKeys = Object.keys(cspIconStyles)
    .map((key) => ({ key, sort: Math.random() })) // Map to array of objects with random sort values
    .sort((a, b) => a.sort - b.sort) // Sort by random values
    .map(({ key }) => key); // Extract the keys
}

// Section for general tools

function jsonToTable(jsonText) {
  let arr00 = new Array();
  let arr01 = new Array();
  let arr02 = new Array();
  let arr03 = new Array();
  let arr04 = new Array();
  let arr05 = new Array();

  let json = JSON.parse(jsonText);

  for (i = 0; i < json.length; i++) {
    arr00[i] = json[i].connectionName;
    arr01[i] = json[i].cspSpecName;
    arr02[i] = json[i].vCPU;
    arr03[i] = json[i].memoryGiB;
    arr04[i] = json[i].costPerHour;
    arr05[i] = json[i].evaluationScore09;
  }

  // Header
  let tr0 = document.createElement("tr");

  let th0 = document.createElement("th");
  th0.appendChild(document.createTextNode("   cspRegion"));
  let th1 = document.createElement("th");
  th1.appendChild(document.createTextNode("   cspSpecName"));
  let th2 = document.createElement("th");
  th2.appendChild(document.createTextNode("   vCPU"));
  let th3 = document.createElement("th");
  th3.appendChild(document.createTextNode("   memoryGiB"));
  let th4 = document.createElement("th");
  th4.appendChild(document.createTextNode("   costPerHour"));
  let th5 = document.createElement("th");
  th5.appendChild(document.createTextNode("   evaluationScore"));

  tr0.appendChild(th0);
  tr0.appendChild(th1);
  tr0.appendChild(th2);
  tr0.appendChild(th3);
  tr0.appendChild(th4);
  tr0.appendChild(th5);
  table.appendChild(tr0);

  for (i = 0; i < arr01.length; i++) {
    let tr = document.createElement("tr");

    let td0 = document.createElement("td");
    td0.appendChild(document.createTextNode(" " + arr00[i] + ""));

    let td1 = document.createElement("td");
    td1.appendChild(document.createTextNode(" " + arr01[i] + ""));

    let td2 = document.createElement("td");
    td2.appendChild(document.createTextNode(" " + arr02[i] + ""));

    let td3 = document.createElement("td");
    td3.appendChild(document.createTextNode(" " + arr03[i] + ""));

    let td4 = document.createElement("td");
    td4.appendChild(document.createTextNode(" " + arr04[i] + ""));

    let td5 = document.createElement("td");
    td5.appendChild(document.createTextNode(" " + arr05[i] + ""));

    tr.appendChild(td0);
    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tr.appendChild(td4);
    tr.appendChild(td5);

    table.appendChild(tr);
  }
}


function updateFirewallRules() {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var nsId = configNamespace;
  var infraId = infraidElement.value;
  var nodegroupid = getNodeGroupIdFromNodeSelection();
  var nodeid = document.getElementById("nodeid").value;

  if (!nsId) {
    errorAlert("Please select a namespace first");
    return;
  }
  if (!infraId) {
    errorAlert("Please select an Infra first");
    return;
  }

  const assocUrl = `http://${hostname}:${port}/tumblebug/ns/${nsId}/infra/${infraId}/associatedResources`;
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
        url: `http://${hostname}:${port}/tumblebug/ns/${nsId}/resources/securityGroup/${sgId}`,
        auth: { username, password },
      }).then(res => res.data)
    )).then((sgList) => {

      let summaryHtml = `
        <div style="margin-bottom:8px; font-size:12px; color:#444;">
          <b style="font-size:13px;">Security Group Rule Summary</b>
          <div style="margin-top: 10px;">
            <!-- Tab Navigation -->
            <ul class="nav nav-tabs" id="sgTabs" role="tablist" style="margin-bottom: 15px; border-bottom: 2px solid #dee2e6;">
              ${sgList.map((sg, idx) => `
                <li class="nav-item" role="presentation">
                  <button class="nav-link ${idx === 0 ? 'active' : ''}" id="sg-tab-${idx}" data-bs-toggle="tab" data-bs-target="#sg-content-${idx}" type="button" role="tab" aria-controls="sg-content-${idx}" aria-selected="${idx === 0}"
                          style="border: none; border-bottom: 3px solid transparent; padding: 10px 15px; margin-right: 5px; background: none; color: #6c757d; font-weight: 500; transition: all 0.3s ease; ${idx === 0 ? 'color: #007bff; border-bottom-color: #007bff;' : ''}"
                          onmouseover="if(!this.classList.contains('active')) { this.style.color='#007bff'; this.style.backgroundColor='#f8f9fa'; }"
                          onmouseout="if(!this.classList.contains('active')) { this.style.color='#6c757d'; this.style.backgroundColor='transparent'; }">
                    <span style="font-size: 12px; font-weight: 600;">${sg.name}</span>
                    <span style="margin-left: 6px; background-color: ${idx === 0 ? '#007bff' : '#6c757d'}; color: white; font-size: 9px; padding: 2px 6px; border-radius: 10px; font-weight: bold;">${(sg.firewallRules||[]).length}</span>
                  </button>
                </li>
              `).join("")}
            </ul>
            
            <!-- Tab Content -->
            <div class="tab-content" id="sgTabContent">
              ${sgList.map((sg, idx) => `
                <div class="tab-pane fade ${idx === 0 ? 'show active' : ''}" id="sg-content-${idx}" role="tabpanel" aria-labelledby="sg-tab-${idx}">
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
      ];
      let presetHtml = presetRules.map((p, i) =>
        `<button class="btn btn-outline-secondary btn-sm" style="margin:3px; font-size:11px; padding:4px 8px; border-radius:4px;" onclick="insertPresetRule(${i})">${p.label}</button>`
      ).join("");

      Swal.fire({
        title: "Update Security Group Rules",
        html: `
          <div>
            ${summaryHtml}
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
              document.querySelectorAll('.tab-pane').forEach(pane => {
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
            url: `http://${hostname}:${port}/tumblebug/ns/${nsId}/infra/${infraId}/associatedSecurityGroups`,
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
        var nsId = configNamespace;

        // Prepare request data for deletion
        const deleteRule = {
          Direction: rule.Direction || rule.direction,
          Protocol: rule.Protocol || rule.protocol,
          Ports: rule.Port || rule.port || rule.Ports,
          CIDR: rule.CIDR || rule.cidr
        };

        axios({
          method: "delete",
          url: `http://${hostname}:${port}/tumblebug/ns/${nsId}/resources/securityGroup/${sgId}/rules`,
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
              // Refresh the firewall rules view
              updateFirewallRules();
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
  Swal.fire({
    title: `Add New Rule to ${sgName}`,
    html: `
      <div style="text-align: left;">
        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; margin-bottom: 5px; display: block;">Direction:</label>
          <select id="newRuleDirection" class="form-control">
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
          </select>
        </div>
        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; margin-bottom: 5px; display: block;">Protocol:</label>
          <select id="newRuleProtocol" class="form-control" onchange="togglePortFieldIndividual()">
            <option value="TCP">TCP</option>
            <option value="UDP">UDP</option>
            <option value="ICMP">ICMP</option>
            <option value="ALL">ALL</option>
          </select>
        </div>
        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; margin-bottom: 5px; display: block;">Port:</label>
          <input type="text" id="newRulePort" class="form-control" placeholder="ex: 22, 80-100, 22,80,443" />
          <small style="color: #6c757d;">Enter single port (22), port range (80-100), or multiple (22,80,443)</small>
        </div>
        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; margin-bottom: 5px; display: block;">CIDR:</label>
          <input type="text" id="newRuleCidr" class="form-control" placeholder="ex: 0.0.0.0/0, 192.168.1.0/24" value="0.0.0.0/0" />
          <small style="color: #6c757d;">IP address range in CIDR notation</small>
        </div>
        <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; margin-top: 15px;">
          <strong>Quick Templates:</strong><br>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('SSH')" style="margin: 2px;">SSH (22)</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('HTTP')" style="margin: 2px;">HTTP (80)</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('HTTPS')" style="margin: 2px;">HTTPS (443)</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('MYSQL')" style="margin: 2px;">MySQL (3306)</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('POSTGRES')" style="margin: 2px;">PostgreSQL (5432)</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('ALL_TCP')" style="margin: 2px;">All TCP Ports</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('ALL_UDP')" style="margin: 2px;">All UDP Ports</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('ICMP')" style="margin: 2px;">ICMP</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setQuickTemplate('ALL_PROTOCOLS')" style="margin: 2px;">All Protocols</button>
        </div>
      </div>
    `,
    width: 500,
    showCancelButton: true,
    confirmButtonText: "Add Rule",
    confirmButtonColor: "#28a745",
    cancelButtonText: "Cancel",
    cancelButtonColor: "#6c757d",
    didOpen: () => {
      // Function to toggle port field for individual rule addition
      window.togglePortFieldIndividual = function() {
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
      };
      
      // Initialize port field state
      togglePortFieldIndividual();
      
      // Define quick template function
      window.setQuickTemplate = function(template) {
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
      if (!cidr.includes('/')) {
        Swal.showValidationMessage("CIDR must include network prefix (e.g., 0.0.0.0/0)");
        return false;
      }
      
      return { direction, protocol, port: port || "", cidr };
    }
  }).then((result) => {
    if (result.isConfirmed) {
      const { direction, protocol, port, cidr } = result.value;
      
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

      var config = getConfig(); var hostname = config.hostname;
      var portVal = config.port;
      var username = config.username;
      var password = config.password;
      var nsId = configNamespace;

      // Prepare request data for addition
      const newRule = {
        Direction: direction,
        Protocol: protocol,
        Ports: port,
        CIDR: cidr
      };

      axios({
        method: "post",
        url: `http://${hostname}:${portVal}/tumblebug/ns/${nsId}/resources/securityGroup/${sgId}/rules`,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({
          firewallRules: [newRule]
        }),
        auth: { username, password },
      }).then((response) => {
        const responseData = response.data;
        // Check if the response indicates success
        const isSuccess = responseData.success !== false;
        
        if (isSuccess) {
          Swal.fire({
            title: "✅ Rule Added Successfully",
            html: `
              <div style="text-align: left;">
                <p>The new firewall rule has been successfully added to security group <strong>${sgName}</strong>.</p>
                <div style="background: #d4edda; padding: 10px; border-radius: 4px; border-left: 4px solid #28a745; margin-top: 10px;">
                  <strong>Added Rule:</strong><br>
                  Direction: ${newRule.Direction}<br>
                  Protocol: ${newRule.Protocol}<br>
                  ${newRule.Ports ? `Port: ${newRule.Ports}<br>` : ''}
                  CIDR: ${newRule.CIDR}
                </div>
                ${responseData.message ? `<p style="margin-top: 10px; color: #28a745;"><strong>Message:</strong> ${responseData.message}</p>` : ''}
              </div>
            `,
            icon: "success",
            confirmButtonText: "Refresh View",
            confirmButtonColor: "#28a745"
          }).then(() => {
            // Refresh the firewall rules view
            updateFirewallRules();
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

// Function for Scale Out NodeGroup
function scaleOutNodeGroup() {
  var infraid = document.getElementById("infraid").value;
  var nodegroupid = getNodeGroupIdFromNodeSelection();

  if (!infraid) {
    errorAlert("Please select an Infra first");
    return;
  }

  if (!nodegroupid) {
    errorAlert("Please select a NodeGroup first");
    return;
  }

  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;

  // Show dialog to get number of Nodes to add
  Swal.fire({
    title: "Scale Out NodeGroup",
    width: 600,
    html:
      "<font size=3>" +
      "<div style='text-align: left; margin: 20px;'>" +
      "<p><b>Target Infra:</b> " + infraid + "</p>" +
      "<p><b>Target NodeGroup:</b> " + nodegroupid + "</p>" +
      "<hr>" +
      "<p><b>Enter the number of Nodes to add:</b></p>" +
      "</div>",
    input: "number",
    inputValue: 1,
    inputAttributes: {
      min: 1,
      max: 20,
      step: 1,
      autocapitalize: "off"
    },
    showCancelButton: true,
    confirmButtonText: "Scale Out",
    confirmButtonColor: "#28a745",
    cancelButtonText: "Cancel",
    position: "top",
    backdrop: `rgba(0, 0, 0, 0.4)`,
    inputValidator: (value) => {
      if (!value || value < 1) {
        return 'Please enter a valid number (minimum 1)';
      }
      if (value > 20) {
        return 'Maximum 20 Nodes can be added at once';
      }
    }
  }).then((result) => {
    if (result.isConfirmed) {
      var numNodesToAdd = parseInt(result.value);
      
      // Confirmation dialog
      Swal.fire({
        title: "Confirm Scale Out",
        html: 
          "<div style='text-align: left; margin: 20px;'>" +
          "<p>You are about to add <b>" + numNodesToAdd + " Node(s)</b> to:</p>" +
          "<ul>" +
          "<li>Infra: <b>" + infraid + "</b></li>" +
          "<li>NodeGroup: <b>" + nodegroupid + "</b></li>" +
          "</ul>" +
          "<p style='color: #dc3545; margin-top: 15px;'><b>⚠️ Warning:</b> This will incur additional costs.</p>" +
          "</div>",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Proceed with Scale Out",
        cancelButtonText: "Cancel",
        confirmButtonColor: "#28a745",
        cancelButtonColor: "#dc3545"
      }).then((confirmResult) => {
        if (confirmResult.isConfirmed) {
          executeScaleOut(namespace, infraid, nodegroupid, numNodesToAdd, hostname, port, username, password);
        }
      });
    }
  });
}
window.scaleOutNodeGroup = scaleOutNodeGroup;

// Improved Scale Out NodeGroup function with Infra and NodeGroup selection
function scaleOutNodeGroupWithSelection() {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;

  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }

  // Use the common Infra selection dialog for ScaleOut operations
  showInfraSelectionForScaleOut(
    "Select Infra for Scale Out",
    "Select the Infra to scale out",
    (selectedInfraId) => {
      showNodeGroupSelectionForScaleOut(selectedInfraId, namespace, hostname, port, username, password);
    }
  );
}
window.scaleOutNodeGroupWithSelection = scaleOutNodeGroupWithSelection;

// Scale Out function for context menu - bypasses Infra selection
function scaleOutInfraFromContext(infraId) {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;

  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }

  if (!infraId) {
    errorAlert("Infra ID is required");
    return;
  }

  // Directly show NodeGroup selection for the specified Infra
  showNodeGroupSelectionForScaleOut(infraId, namespace, hostname, port, username, password);
}
window.scaleOutInfraFromContext = scaleOutInfraFromContext;

// Copy Infra Configuration - extract Infra config and populate left panel for re-creation
function copyInfraConfig(infraId) {
  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;

  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }

  if (!infraId) {
    errorAlert("Infra ID is required");
    return;
  }

  var spinnerId = addSpinnerTask("Copying Infra configuration");

  // Fetch both configCopy and Infra info in parallel
  var configCopyUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraId}/configCopy`;
  var infraInfoUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraId}`;
  var authConfig = { username: username, password: password };

  Promise.all([
    axios({ method: "get", url: configCopyUrl, auth: authConfig }),
    axios({ method: "get", url: infraInfoUrl, auth: authConfig })
  ]).then(function([configRes, infoRes]) {
    removeSpinnerTask(spinnerId);

    var infraReq = configRes.data;
    var infraInfo = infoRes.data;

    if (!infraReq || !infraReq.nodeGroups || infraReq.nodeGroups.length === 0) {
      errorAlert("No NodeGroup configuration found in Infra: " + infraId);
      return;
    }

    // Clear existing configuration
    clearCircle('');

    // Group VMs from Infra info by nodeGroupId for spec metadata extraction
    var nodeByGroup = {};
    if (infraInfo && infraInfo.node) {
      infraInfo.node.forEach(function(nd) {
        var sgId = nd.nodeGroupId || nd.id;
        if (!nodeByGroup[sgId]) {
          nodeByGroup[sgId] = nd;
        }
      });
    }

    // Populate nodeGroupRequestFromSpecList and recommendedSpecList
    infraReq.nodeGroups.forEach(function(sg) {
      var nodeConfig = $.extend({}, createInfraReqVmTmplt);
      nodeConfig.name = sg.name || ("g" + (nodeGroupRequestFromSpecList.length + 1));
      nodeConfig.specId = sg.specId || "";
      nodeConfig.imageId = sg.imageId || "ubuntu22.04";
      nodeConfig.rootDiskType = sg.rootDiskType || "default";
      nodeConfig.rootDiskSize = sg.rootDiskSize || 0;
      nodeConfig.nodeGroupSize = sg.nodeGroupSize || 1;
      nodeConfig.description = sg.description || "mapui";
      nodeConfig.connectionName = sg.connectionName || "";
      nodeConfig.zone = sg.zone || "";
      if (sg.label && Object.keys(sg.label).length > 0) {
        nodeConfig.label = sg.label;
      }

      nodeGroupRequestFromSpecList.push(nodeConfig);

      // Build recommendedSpec from Infra Node info for display in the review panel
      // Look up by sg.name first (matches nodeGroupId), then try specId-based fallback
      var repVm = nodeByGroup[sg.name] || nodeByGroup[nodeConfig.name];
      var specInfo = {
        id: sg.specId || "",
        providerName: repVm?.connectionConfig?.providerName || extractProviderFromSpecId(sg.specId),
        regionName: repVm?.region?.region || extractRegionFromSpecId(sg.specId),
        cspSpecName: repVm?.spec?.cspSpecName || repVm?.cspSpecName || sg.specId,
        vCPU: repVm?.spec?.vCPU || "N/A",
        memoryGiB: repVm?.spec?.memoryGiB || "N/A",
        costPerHour: repVm?.spec?.costPerHour || 0,
        acceleratorType: repVm?.spec?.acceleratorType || "",
        acceleratorModel: repVm?.spec?.acceleratorModel || "",
        acceleratorCount: repVm?.spec?.acceleratorCount || 0,
        acceleratorMemoryGB: repVm?.spec?.acceleratorMemoryGB || "",
        connectionName: sg.connectionName || "",
        rootDiskType: sg.rootDiskType || "default"
      };
      recommendedSpecList.push(specInfo);
    });

    // Update the left panel NodeGroup review
    updateNodeGroupReview();

    // Switch to Provision tab to show the configuration
    var provisionTab = document.getElementById('provision-tab');
    if (provisionTab) {
      provisionTab.click();
    }

    // Show the configCopy response in the standard JSON viewer
    outputAlert(infraReq, "success");

    // Offer to save as template with a toast notification
    Swal.fire({
      toast: true,
      position: 'bottom-end',
      icon: 'success',
      title: 'Config copied to Provision panel',
      html: '<button class="btn btn-sm btn-primary mt-2 save-as-template-btn" style="font-size:12px;">📄 Save as Template</button>',
      showConfirmButton: false,
      timer: 6000,
      timerProgressBar: true,
      didOpen: (toast) => {
        var btn = toast.querySelector('.save-as-template-btn');
        if (btn) {
          btn.addEventListener('click', function() {
            Swal.close();
            saveConfigAsTemplate(namespace, infraId, infraReq);
          });
        }
      }
    });

  }).catch(function(err) {
    removeSpinnerTask(spinnerId);
    console.error("Failed to copy Infra config:", err);
    errorAlert("Failed to copy Infra configuration: " + (err.response?.data?.message || err.message));
  });
}
window.copyInfraConfig = copyInfraConfig;

// Helper: extract provider name from specId (e.g., "aws+ap-southeast-1+t3.medium" -> "aws")
function extractProviderFromSpecId(specId) {
  if (!specId) return "Unknown";
  var parts = specId.split("+");
  return parts.length > 0 ? parts[0] : "Unknown";
}

// Helper: extract region from specId (e.g., "aws+ap-southeast-1+t3.medium" -> "ap-southeast-1")
function extractRegionFromSpecId(specId) {
  if (!specId) return "Unknown";
  var parts = specId.split("+");
  return parts.length > 1 ? parts[1] : "Unknown";
}

// Save Infra config as template directly (context menu shortcut)
function saveInfraAsTemplate(infraId) {
  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;

  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }

  var spinnerId = addSpinnerTask("Extracting Infra configuration");
  var configCopyUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraId}/configCopy`;

  axios({
    method: "get",
    url: configCopyUrl,
    auth: { username: username, password: password }
  }).then(function(res) {
    removeSpinnerTask(spinnerId);
    var infraReq = res.data;
    if (!infraReq || !infraReq.nodeGroups || infraReq.nodeGroups.length === 0) {
      errorAlert("No NodeGroup configuration found in Infra: " + infraId);
      return;
    }
    saveConfigAsTemplate(namespace, infraId, infraReq);
  }).catch(function(err) {
    removeSpinnerTask(spinnerId);
    errorAlert("Failed to extract Infra configuration: " + (err.response?.data?.message || err.message));
  });
}
window.saveInfraAsTemplate = saveInfraAsTemplate;

// Step 2: Show NodeGroup selection dialog
function showNodeGroupSelectionForScaleOut(selectedInfraId, namespace, hostname, port, username, password) {
  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${selectedInfraId}/nodegroup`;
  
  var spinnerId = addSpinnerTask("Loading NodeGroup list");

  axios({
    method: "get",
    url: url,
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

        // Show NodeGroup selection dialog
        Swal.fire({
          title: "Select NodeGroup for Scale Out",
          width: 600,
          html:
            "<div style='text-align: left; margin: 20px;'>" +
            "<p><b>Step 2:</b> Select the NodeGroup to scale out</p>" +
            "<p><b>Selected Infra:</b> " + selectedInfraId + "</p>" +
            "<hr>" +
            "<div class='form-group'>" +
            "<label for='nodegroup-select'><b>Available NodeGroups:</b></label>" +
            "<select id='nodegroup-select' class='form-control' style='margin-top: 10px;'>" +
            "<option value=''>-- Select NodeGroup --</option>" +
            nodeGroupOptions +
            "</select>" +
            "</div>" +
            "</div>",
          showCancelButton: true,
          confirmButtonText: "Next: Configure Scale Out",
          cancelButtonText: "Back",
          confirmButtonColor: "#007bff",
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
            showScaleOutConfiguration(selectedInfraId, result.value, namespace, hostname, port, username, password);
          } else if (result.dismiss === Swal.DismissReason.cancel) {
            // Go back to Infra selection
            scaleOutNodeGroupWithSelection();
          }
        });
      } else {
        errorAlert("No NodeGroups found in the selected Infra");
      }
    })
    .catch(function (error) {
      console.log("Failed to get NodeGroup list:", error);
      errorAlert("Failed to load NodeGroup list. Please check your connection.");
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}

// Step 3: Show scale out configuration dialog
function showScaleOutConfiguration(infraId, nodeGroupId, namespace, hostname, port, username, password) {
  Swal.fire({
    title: "Configure Scale Out",
    width: 600,
    html:
      "<div style='text-align: left; margin: 20px;'>" +
      "<p><b>Step 3:</b> Configure the scale out operation</p>" +
      "<p><b>Selected Infra:</b> " + infraId + "</p>" +
      "<p><b>Selected NodeGroup:</b> " + nodeGroupId + "</p>" +
      "<hr>" +
      "<p><b>Enter the number of Nodes to add:</b></p>" +
      "</div>",
    input: "number",
    inputValue: 1,
    inputAttributes: {
      min: 1,
      max: 20,
      step: 1,
      autocapitalize: "off"
    },
    showCancelButton: true,
    confirmButtonText: "Scale Out",
    confirmButtonColor: "#28a745",
    cancelButtonText: "Back",
    inputValidator: (value) => {
      if (!value || value < 1) {
        return 'Please enter a valid number (minimum 1)';
      }
      if (value > 20) {
        return 'Maximum 20 Nodes can be added at once';
      }
    }
  }).then((result) => {
    if (result.isConfirmed) {
      var numNodesToAdd = parseInt(result.value);
      
      // Final confirmation dialog
      Swal.fire({
        title: "Confirm Scale Out",
        html: 
          "<div style='text-align: left; margin: 20px;'>" +
          "<p>You are about to add <b>" + numNodesToAdd + " Node(s)</b> to:</p>" +
          "<ul>" +
          "<li>Infra: <b>" + infraId + "</b></li>" +
          "<li>NodeGroup: <b>" + nodeGroupId + "</b></li>" +
          "</ul>" +
          "<p style='color: #dc3545; margin-top: 15px;'><b>⚠️ Warning:</b> This will incur additional costs.</p>" +
          "</div>",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Proceed with Scale Out",
        cancelButtonText: "Cancel",
        confirmButtonColor: "#28a745",
        cancelButtonColor: "#dc3545"
      }).then((confirmResult) => {
        if (confirmResult.isConfirmed) {
          executeScaleOut(namespace, infraId, nodeGroupId, numNodesToAdd, hostname, port, username, password);
        }
      });
    } else if (result.dismiss === Swal.DismissReason.cancel) {
      // Go back to NodeGroup selection
      showNodeGroupSelectionForScaleOut(infraId, namespace, hostname, port, username, password);
    }
  });
}

// Function to execute the scale out operation
function executeScaleOut(namespace, infraid, nodegroupid, numNodesToAdd, hostname, port, username, password) {
  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraid}/nodegroup/${nodegroupid}`;
  
  var scaleOutReq = {
    numNodesToAdd: numNodesToAdd
  };

  var jsonBody = JSON.stringify(scaleOutReq, undefined, 4);
  
  console.log(` Scaling out NodeGroup ${nodegroupid} by adding ${numNodesToAdd} Node(s)...`);
  var spinnerId = addSpinnerTask(`Scale Out: ${infraid}/${nodegroupid} (+${numNodesToAdd} Nodes)`);
  infoAlert(`Starting Scale Out: Adding ${numNodesToAdd} Node(s) to ${nodegroupid}`);

  var requestId = generateRandomRequestId("scaleout-" + infraid + "-" + nodegroupid + "-", 10);
  addRequestIdToSelect(requestId);

  axios({
    method: "post",
    url: url,
    headers: { 
      "Content-Type": "application/json",
      "x-request-id": requestId 
    },
    data: jsonBody,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 600000  // 10 minutes timeout for scale out operation
  })
    .then((res) => {
      console.log("Scale out response:", res);
      
      displayJsonData(res.data, typeInfo);
      handleAxiosResponse(res);
      
      console.log(`Successfully scaled out NodeGroup ${nodegroupid} by adding ${numNodesToAdd} Node(s)`);
      
      Swal.fire({
        icon: "success",
        title: "Scale Out Successful!",
        html: 
          "<div style='text-align: left;'>" +
          "<p><b>" + numNodesToAdd + " Node(s)</b> have been successfully added to:</p>" +
          "<ul>" +
          "<li>Infra: <b>" + infraid + "</b></li>" +
          "<li>NodeGroup: <b>" + nodegroupid + "</b></li>" +
          "</ul>" +
          "<p style='margin-top: 15px; color: #28a745;'>✓ The new Nodes are being provisioned.</p>" +
          "</div>",
        confirmButtonText: "OK"
      });
      
      // Refresh Infra status after scale out
      setTimeout(() => {
        getInfra();
        updateNodeGroupList();
        updateVmList();
      }, 3000);
    })
    .catch(function (error) {
      var errorMsg = "Failed to scale out NodeGroup";
      
      if (error.response) {
        console.log(error.response.data);
        console.log(error.response.status);
        
        if (error.response.data) {
          if (typeof error.response.data === 'string') {
            errorMsg = error.response.data;
          } else if (error.response.data.message) {
            errorMsg = error.response.data.message;
          } else if (error.response.data.error) {
            errorMsg = error.response.data.error;
          }
        }
        
        displayJsonData(error.response.data, typeError);
      } else if (error.request) {
        errorMsg = "No response from server. Please check the connection.";
        console.log(error.request);
      } else {
        errorMsg = error.message;
        console.log('Error', error.message);
      }
      
      console.log(errorMsg);
      
      Swal.fire({
        icon: "error",
        title: "Scale Out Failed",
        html: 
          "<div style='text-align: left;'>" +
          "<p>Failed to scale out NodeGroup <b>" + nodegroupid + "</b></p>" +
          "<p style='margin-top: 10px; color: #dc3545;'>Error: " + errorMsg + "</p>" +
          "</div>",
        confirmButtonText: "OK",
        confirmButtonColor: "#dc3545"
      });
      
      console.log(error.config);
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}

// Function to show Infra Actions menu in SweetAlert
function showActionsMenu() {
  var namespace = configNamespace;
  var infraid = getSelectedInfraId();
  var safeInfraid = window.escapeHtml ? window.escapeHtml(infraid) : infraid;
  
  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }
  if (!infraid) {
    errorAlert("Please select an Infra first");
    return;
  }

  Swal.fire({
    title: "Control Infra",
    width: 600,
    showCancelButton: true,
    showConfirmButton: false,
    cancelButtonText: "Cancel",
    cancelButtonColor: "#6c757d",
    position: "center",
    backdrop: `rgba(0, 0, 0, 0.4)`,
    html: `
      <div style="text-align: left; margin: 20px;">
        <p><b>Selected Infra:</b> ${safeInfraid}</p>
        <hr>
        <p><b>Choose a lifecycle control action:</b></p>

        <!-- Row 1: Power lifecycle (most common) -->
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 20px;">
          <button type="button" class="btn btn-warning" onclick="executeAction('suspend')" style="margin: 5px;" title="Stop all Nodes without termination (can be resumed later).">
            ⏸️ Suspend
          </button>
          <button type="button" class="btn btn-warning" onclick="executeAction('resume')" style="margin: 5px;" title="Resume all suspended Nodes.">
            ▶️ Resume
          </button>
          <button type="button" class="btn btn-warning" onclick="executeAction('reboot')" style="margin: 5px;" title="Reboot all Nodes.">
            🔄 Reboot
          </button>
        </div>

        <!-- Row 2: Refine (frequently used) + Terminate (primary tear-down) -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
          <button type="button" class="btn btn-primary" onclick="executeAction('refine')" style="margin: 5px;" title="Drop Failed/Undefined Nodes from this Infra (metadata only — does not call CSP). Use after partial provisioning failures across CSPs.">
            🧹 Refine
          </button>
          <button type="button" class="btn btn-danger" onclick="executeAction('terminate')" style="margin: 5px;" title="Terminate all Nodes through the normal lifecycle path.">
            ⏹️ Terminate
          </button>
        </div>

        <!-- Row 3: Sub-menus for exceptional cases (held / stuck Infra) -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
          <button type="button" class="btn btn-outline-secondary" onclick="executeAction('holdControl')" style="margin: 5px;" title="Continue or Withdraw a held provisioning (only valid right after creating with the hold option).">
            🔒 Hold Control
          </button>
          <button type="button" class="btn btn-outline-secondary" onclick="executeAction('recoveryControl')" style="margin: 5px;" title="Reconcile or Abort an Infra stuck after a server restart or partial provisioning failure.">
            🛠️ Recovery Control
          </button>
        </div>
      </div>
    `,
    customClass: {
      popup: 'swal-wide'
    }
  });
}
window.showActionsMenu = showActionsMenu;

// Hold-gate sub-menu: only valid right after creating an Infra with option=hold.
// Continue / Withdraw signal an in-memory holding goroutine. They will fail
// after a server restart — for that, use Reconcile or Abort from the parent menu.
function showHoldControlMenu() {
  var infraid = getSelectedInfraId();
  var safeInfraid = window.escapeHtml ? window.escapeHtml(infraid) : infraid;
  if (!infraid) {
    errorAlert("Please select an Infra first");
    return;
  }
  Swal.fire({
    title: "🔒 Hold Control",
    width: 560,
    showCancelButton: true,
    showConfirmButton: false,
    cancelButtonText: "Cancel",
    cancelButtonColor: "#6c757d",
    html: `
      <div style="text-align: left; margin: 20px;">
        <p><b>Selected Infra:</b> ${safeInfraid}</p>
        <hr>
        <p>For Infras created with the <b>hold</b> option, decide whether to proceed or cancel
        the held provisioning.</p>
        <p style="color:#888; font-size: 0.9em;"><i>Note: these only work while a holding goroutine
        is alive in memory. If the server was restarted, use <b>Reconcile</b> or <b>Abort</b> instead.</i></p>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 20px;">
          <button type="button" class="btn btn-success" onclick="executeHoldAction('continue')" style="margin: 5px;" title="Resume the held provisioning and create the Nodes.">
            ⏭️ Continue
          </button>
          <button type="button" class="btn btn-warning" onclick="executeHoldAction('withdraw')" style="margin: 5px;" title="Cancel the held provisioning before any Nodes are created.">
            ⬅️ Withdraw
          </button>
        </div>
      </div>
    `
  });
}
window.showHoldControlMenu = showHoldControlMenu;

// Confirm + dispatch a hold-gate action (continue / withdraw)
function executeHoldAction(action) {
  Swal.close();
  var infraid = getSelectedInfraId();
  var safeInfraid = window.escapeHtml ? window.escapeHtml(infraid) : infraid;
  var isContinue = (action === 'continue');
  Swal.fire({
    title: isContinue ? "Confirm Continue" : "⚠️ Confirm Withdraw",
    html: `
      <div style="text-align: left; margin: 20px;">
        <p>You are about to <b style="color:${isContinue ? '#28a745' : '#ffc107'};">${action.toUpperCase()}</b>
        the held Infra:</p>
        <p><b>${safeInfraid}</b></p>
        <br>
        <p>${isContinue
          ? 'The held provisioning will proceed and Nodes will be created.'
          : 'The held provisioning will be cancelled. No Nodes will be created.'}</p>
      </div>
    `,
    icon: isContinue ? "question" : "warning",
    showCancelButton: true,
    confirmButtonText: `Yes, ${action.charAt(0).toUpperCase() + action.slice(1)}`,
    cancelButtonText: "Cancel",
    confirmButtonColor: isContinue ? "#28a745" : "#ffc107",
    cancelButtonColor: "#6c757d"
  }).then((result) => {
    if (result.isConfirmed) {
      controlInfra(action);
    }
  });
}
window.executeHoldAction = executeHoldAction;

// Recovery Control sub-menu: groups Reconcile / Abort.
// Use these after a server restart or when an Infra is stuck.
function showRecoveryControlMenu() {
  var infraid = getSelectedInfraId();
  var safeInfraid = window.escapeHtml ? window.escapeHtml(infraid) : infraid;
  if (!infraid) {
    errorAlert("Please select an Infra first");
    return;
  }
  Swal.fire({
    title: "🛠️ Recovery Control",
    width: 600,
    showCancelButton: true,
    showConfirmButton: false,
    cancelButtonText: "Cancel",
    cancelButtonColor: "#6c757d",
    html: `
      <div style="text-align: left; margin: 20px;">
        <p><b>Selected Infra:</b> ${safeInfraid}</p>
        <hr>
        <p>Recover an Infra that is <b>stuck</b> after a server restart or partial provisioning failure.</p>
        <p style="color:#888; font-size: 0.9em;"><i>For normal teardown, use <b>Terminate</b> instead. These actions are exceptional.</i></p>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 20px;">
          <button type="button" class="btn btn-info" onclick="executeAction('reconcile')" style="margin: 5px;" title="Sync Infra with CSP truth: absorb orphan VMs, mark unmatched Nodes Failed.">
            🩹 Reconcile
          </button>
          <button type="button" class="btn btn-danger" onclick="executeAction('abort')" style="margin: 5px;" title="Force-terminate every non-final Node (parallel + orphan rescue), then sweep Failed remnants.">
            🛑 Abort
          </button>
        </div>
      </div>
    `
  });
}
window.showRecoveryControlMenu = showRecoveryControlMenu;

// Function to execute selected action and close SweetAlert
function executeAction(action) {
  Swal.close(); // Close the current SweetAlert

  // Hold Control sub-menu: groups Continue / Withdraw (in-memory hold gate only)
  if (action === 'holdControl') {
    showHoldControlMenu();
    return;
  }

  // Recovery Control sub-menu: groups Reconcile / Abort (for held / stuck Infras)
  if (action === 'recoveryControl') {
    showRecoveryControlMenu();
    return;
  }

  // Add confirmation for dangerous actions
  if (action === 'terminate') {
    var infraid = getSelectedInfraId();
    var safeInfraid = window.escapeHtml ? window.escapeHtml(infraid) : infraid;
    Swal.fire({
      title: "⚠️ Confirm Termination",
      html: `
        <div style="text-align: left; margin: 20px;">
          <p>You are about to <b style="color: #dc3545;">TERMINATE</b> Infra:</p>
          <p><b>${safeInfraid}</b></p>
          <br>
          <p style="color: #dc3545;"><b>⚠️ WARNING:</b> This action is <b>IRREVERSIBLE</b>!</p>
          <p style="color: #dc3545;">All Nodes and associated resources will be permanently deleted.</p>
        </div>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Terminate",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc3545",
      cancelButtonColor: "#6c757d"
    }).then((result) => {
      if (result.isConfirmed) {
        controlInfra(action);
      }
    });
  } else if (action === 'withdraw') {
    var infraid = getSelectedInfraId();
    var safeInfraid = window.escapeHtml ? window.escapeHtml(infraid) : infraid;
    Swal.fire({
      title: "⚠️ Confirm Withdraw",
      html: `
        <div style="text-align: left; margin: 20px;">
          <p>You are about to <b style="color: #ffc107;">WITHDRAW</b> Infra:</p>
          <p><b>${safeInfraid}</b></p>
          <br>
          <p style="color: #ffc107;"><b>⚠️ WARNING:</b> This will shut down all Nodes in the Infra.</p>
        </div>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Withdraw",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#ffc107",
      cancelButtonColor: "#6c757d"
    }).then((result) => {
      if (result.isConfirmed) {
        controlInfra(action);
      }
    });
  } else if (action === 'abort') {
    var infraid = getSelectedInfraId();
    var safeInfraid = window.escapeHtml ? window.escapeHtml(infraid) : infraid;
    Swal.fire({
      title: "⚠️ Confirm Abort",
      html: `
        <div style="text-align: left; margin: 20px;">
          <p>You are about to <b style="color: #dc3545;">ABORT</b> Infra:</p>
          <p><b>${safeInfraid}</b></p>
          <br>
          <p style="color: #dc3545;"><b>⚠️ WARNING:</b> This force-terminates every non-final Node in parallel
          (with orphan rescue) and sweeps any <code>Failed</code> remnants.</p>
          <p>This is intended for Infras that are <b>stuck</b> after a server restart or partial provisioning failure.</p>
          <p>The final <code>DELETE</code> is <b>not</b> issued automatically — run it after termination completes.</p>
        </div>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Abort",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc3545",
      cancelButtonColor: "#6c757d"
    }).then((result) => {
      if (result.isConfirmed) {
        controlInfra(action);
      }
    });
  } else if (action === 'reconcile') {
    var infraid = getSelectedInfraId();
    var safeInfraid = window.escapeHtml ? window.escapeHtml(infraid) : infraid;
    Swal.fire({
      title: "🩹 Confirm Reconcile",
      html: `
        <div style="text-align: left; margin: 20px;">
          <p>Reconcile Infra: <b>${safeInfraid}</b></p>
          <br>
          <p>This queries Spider for the real CSP status of every transient Node and absorbs CSP-side
          orphan VMs created before a server crash. Nodes that cannot be matched are marked
          <code>Failed</code> so a subsequent <b>Refine</b> can clean them up.</p>
          <p style="color:#666;"><i>No new VMs are created.</i></p>
        </div>
      `,
      icon: "info",
      showCancelButton: true,
      confirmButtonText: "Yes, Reconcile",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#17a2b8",
      cancelButtonColor: "#6c757d"
    }).then((result) => {
      if (result.isConfirmed) {
        controlInfra(action);
      }
    });
  } else if (action === 'delete') {
    var infraid = getSelectedInfraId();
    var safeInfraid = window.escapeHtml ? window.escapeHtml(infraid) : infraid;
    Swal.fire({
      title: "⚠️ Confirm Delete",
      html: `
        <div style="text-align: left; margin: 20px;">
          <p>You are about to <b style="color: #dc3545;">DELETE</b> Infra:</p>
          <p><b>${safeInfraid}</b></p>
          <br>
          <p style="color: #dc3545;"><b>⚠️ WARNING:</b> This action is <b>IRREVERSIBLE</b>!</p>
          <p style="color: #dc3545;">The Infra and all associated resources will be permanently removed.</p>
        </div>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc3545",
      cancelButtonColor: "#6c757d"
    }).then((result) => {
      if (result.isConfirmed) {
        deleteInfra();
      }
    });
  } else {
    // For other actions, execute directly with brief confirmation
    var infraid = document.getElementById("infraid").value;
    var safeInfraid = window.escapeHtml ? window.escapeHtml(infraid) : infraid;
    var actionName = action.charAt(0).toUpperCase() + action.slice(1);
    
    Swal.fire({
      title: `Confirm ${actionName}`,
      html: `
        <div style="text-align: center; margin: 20px;">
          <p>Execute <b>${actionName}</b> on Infra: <b>${safeInfraid}</b>?</p>
        </div>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: `Yes, ${actionName}`,
      cancelButtonText: "Cancel",
      confirmButtonColor: "#007bff",
      cancelButtonColor: "#6c757d"
    }).then((result) => {
      if (result.isConfirmed) {
        controlInfra(action);
      }
    });
  }
}
window.executeAction = executeAction;

// Common function for ScaleOut operations - Infra selection dialog
function showInfraSelectionForScaleOut(title, description, successCallback) {
  // Get Infra list specifically for ScaleOut operations
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;

  if (!namespace || namespace === "") {
    errorAlert("Please select a namespace first");
    return;
  }

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra?option=id`;
  var spinnerId = addSpinnerTask("Loading Infra list for ScaleOut");

  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 600000,
  })
    .then((res) => {
      var infraOptions = '';
      
      if (res.data.output && res.data.output.length > 0) {
        res.data.output.forEach((infraId) => {
          if (infraId && infraId.trim() !== "") {
            infraOptions += `<option value="${infraId}">${infraId}</option>`;
          }
        });

        if (infraOptions) {
          // Show Infra selection dialog
          Swal.fire({
            title: title,
            width: 600,
            html:
              "<div style='text-align: left; margin: 20px;'>" +
              "<p><b>Step 1:</b> " + description + "</p>" +
              (nodeGroupRequestFromSpecList && nodeGroupRequestFromSpecList.length > 0 ? 
                "<p><b>Available Node Configurations:</b> " + nodeGroupRequestFromSpecList.length + " location(s)</p>" : "") +
              "<hr>" +
              "<div class='form-group'>" +
              "<label for='infra-select'><b>Available Infras:</b></label>" +
              "<select id='infra-select' class='form-control' style='margin-top: 10px;'>" +
              "<option value=''>-- Select Infra --</option>" +
              infraOptions +
              "</select>" +
              "</div>" +
              "</div>",
            showCancelButton: true,
            confirmButtonText: "Next",
            cancelButtonText: "Cancel",
            confirmButtonColor: "#28a745",
            preConfirm: () => {
              const selectedInfra = document.getElementById('infra-select').value;
              if (!selectedInfra) {
                Swal.showValidationMessage('Please select an Infra');
                return false;
              }
              return selectedInfra;
            }
          }).then((result) => {
            if (result.isConfirmed) {
              successCallback(result.value);
            }
          });
        } else {
          errorAlert("No Infras found in the selected namespace");
        }
      } else {
        errorAlert("No Infras found in the selected namespace");
      }
    })
    .catch(function (error) {
      console.log("Failed to get Infra list for ScaleOut:", error);
      errorAlert("Failed to load Infra list. Please check your connection.");
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}

// ScaleOut Infra function with current map configuration
function scaleOutInfraWithConfiguration() {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;

  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }

  // Check if we have any Node configuration from the map
  if (!nodeGroupRequestFromSpecList || nodeGroupRequestFromSpecList.length === 0) {
    errorAlert("Please configure Node specifications first by clicking on the map or using the configuration form");
    return;
  }

  // Use the common Infra selection dialog for ScaleOut operations
  showInfraSelectionForScaleOut(
    "Select Infra for Node Addition",
    "Select the Infra to add new Nodes",
    (selectedInfraId) => {
      showInfraScaleOutConfiguration(selectedInfraId, namespace, hostname, port, username, password);
    }
  );
}
window.scaleOutInfraWithConfiguration = scaleOutInfraWithConfiguration;

// Step 2: Show Infra scale out configuration dialog
function showInfraScaleOutConfiguration(selectedInfraId, namespace, hostname, port, username, password) {
  // Build Node configuration summary from current map settings
  var vmConfigSummary = "";
  var totalNodes = 0;
  
  if (nodeGroupRequestFromSpecList && nodeGroupRequestFromSpecList.length > 0) {
    nodeGroupRequestFromSpecList.forEach((nodeConfig, index) => {
      var ndCount = 1; // Default Node count per location
      totalNodes += ndCount;
      vmConfigSummary += 
        "<div style='margin: 5px 0; padding: 8px; background: #f8f9fa; border-radius: 4px;'>" +
        "<b>Location " + (index + 1) + ":</b><br>" +
        "Spec: " + (nodeConfig.specId || "Auto-selected") + "<br>" +
        "Image: " + (nodeConfig.imageId || "Auto-selected") + "<br>" +
        "Count: " + ndCount + " Node(s)" +
        "</div>";
    });
  }

  Swal.fire({
    title: "Configure Infra Scale Out",
    width: 700,
    html:
      "<div style='text-align: left; margin: 20px;'>" +
      "<p><b>Step 2:</b> Configure Node addition to Infra</p>" +
      "<p><b>Selected Infra:</b> " + selectedInfraId + "</p>" +
      "<hr>" +
      "<div style='margin-bottom: 15px;'>" +
      "<label for='nodegroup-name'><b>New NodeGroup Name:</b></label>" +
      "<input id='nodegroup-name' class='form-control' style='margin-top: 5px;' " +
      "placeholder='Enter nodegroup name (e.g., web-servers-2)' value='dynamic-group-" + Date.now() + "'>" +
      "</div>" +
      "<div style='margin-bottom: 15px;'>" +
      "<label for='node-count'><b>Number of Nodes per location:</b></label>" +
      "<input id='node-count' type='number' class='form-control' style='margin-top: 5px;' " +
      "min='1' max='10' value='1' placeholder='Enter number of Nodes'>" +
      "</div>" +
      "<hr>" +
      "<p><b>Node Configuration Summary:</b></p>" +
      "<div style='max-height: 200px; overflow-y: auto;'>" +
      vmConfigSummary +
      "</div>" +
      "<hr>" +
      "<p><b>Total Nodes to add:</b> <span id='total-nodes'>" + totalNodes + "</span></p>" +
      "</div>",
    showCancelButton: true,
    confirmButtonText: "Review Configuration",
    cancelButtonText: "Back",
    confirmButtonColor: "#17a2b8",
    didOpen: () => {
      // Update total Node count when Node count per location changes
      document.getElementById('node-count').addEventListener('input', function() {
        var vmPerLocation = parseInt(this.value) || 1;
        var totalLocations = nodeGroupRequestFromSpecList.length;
        var newTotal = vmPerLocation * totalLocations;
        document.getElementById('total-nodes').textContent = newTotal;
      });
    },
    preConfirm: () => {
      const nodeGroupName = document.getElementById('nodegroup-name').value.trim();
      const ndCount = parseInt(document.getElementById('node-count').value) || 1;
      
      if (!nodeGroupName) {
        Swal.showValidationMessage('Please enter a NodeGroup name');
        return false;
      }
      
      if (ndCount < 1 || ndCount > 10) {
        Swal.showValidationMessage('Node count must be between 1 and 10');
        return false;
      }
      
      return { nodeGroupName, ndCount };
    }
  }).then((result) => {
    if (result.isConfirmed) {
      var config = result.value;
      // Go to review step first
      showInfraScaleOutReview(selectedInfraId, config.nodeGroupName, config.ndCount, namespace, hostname, port, username, password);
    } else if (result.dismiss === Swal.DismissReason.cancel) {
      // Go back to Infra selection
      scaleOutInfraWithConfiguration();
    }
  });
}

// Step 2.5: Show Infra scale out review
function showInfraScaleOutReview(selectedInfraId, nodeGroupName, nodeCountPerLocation, namespace, hostname, port, username, password) {
  // Use the first Node configuration from the map as the template for review
  if (!nodeGroupRequestFromSpecList || nodeGroupRequestFromSpecList.length === 0) {
    errorAlert("No Node configuration available for review");
    return;
  }

  var vmTemplate = nodeGroupRequestFromSpecList[0];
  
  // Build the review request using the template
  var reviewReq = {
    name: nodeGroupName,
    nodeGroupSize: nodeCountPerLocation,
    specId: vmTemplate.specId,
    imageId: vmTemplate.imageId,
    description: "Dynamically added via CB-MapUI Scale Out Infra",
    label: {
      "created-by": "cb-mapui",
      "creation-type": "scale-out-infra",
      "timestamp": new Date().toISOString()
    }
  };

  // Add optional fields if available
  if (vmTemplate.rootDiskType) {
    reviewReq.rootDiskType = vmTemplate.rootDiskType;
  }
  if (vmTemplate.rootDiskSize) {
    reviewReq.rootDiskSize = vmTemplate.rootDiskSize;
  }
  if (vmTemplate.connectionName) {
    reviewReq.connectionName = vmTemplate.connectionName;
  }

  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${selectedInfraId}/nodeGroupDynamicReview`;
  var jsonBody = JSON.stringify(reviewReq, undefined, 4);
  
  console.log("Reviewing NodeGroup configuration...");
  var spinnerId = addSpinnerTask(`Reviewing NodeGroup: ${nodeGroupName}`);
  infoAlert(`Reviewing NodeGroup configuration for ${selectedInfraId}...`);

  var requestId = generateRandomRequestId("review-nodegroup-" + selectedInfraId + "-" + nodeGroupName + "-", 10);
  addRequestIdToSelect(requestId);

  axios({
    method: "post",
    url: url,
    headers: { 
      "Content-Type": "application/json",
      "x-request-id": requestId 
    },
    data: jsonBody,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 600000
  })
    .then((res) => {
      console.log("NodeGroup review completed successfully");
      console.log("Review response data:", res.data);
      successAlert("NodeGroup configuration reviewed successfully");
      
      var reviewData = res.data;
      showInfraScaleOutReviewResults(selectedInfraId, nodeGroupName, nodeCountPerLocation, reviewData, namespace, hostname, port, username, password);
    })
    .catch(function (error) {
      console.log("Failed to review NodeGroup configuration:", error);
      console.log("Error details:", error.response ? error.response.data : error.message);
      
      var errorMsg = "Failed to review NodeGroup configuration";
      if (error.response && error.response.data) {
        if (typeof error.response.data === 'string') {
          errorMsg += ": " + error.response.data;
        } else if (error.response.data.message) {
          errorMsg += ": " + error.response.data.message;
        } else if (error.response.data.error) {
          errorMsg += ": " + error.response.data.error;
        }
      } else if (error.message) {
        errorMsg += ": " + error.message;
      }
      errorAlert(errorMsg);
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}

// Step 2.6: Show review results and proceed to confirmation
function showInfraScaleOutReviewResults(selectedInfraId, nodeGroupName, nodeCountPerLocation, reviewData, namespace, hostname, port, username, password) {
  console.log("Processing review results:", reviewData);
  
  // Safely extract data with fallbacks
  var canCreate = reviewData.canCreate !== undefined ? reviewData.canCreate : true;
  var status = reviewData.status || 'Unknown';
  var message = reviewData.message || 'No detailed message available';
  var estimatedCost = reviewData.estimatedCost || 'Cost estimation unavailable';
  
  // Build status display
  var statusColor = canCreate ? 
    (status === 'Ready' ? '#28a745' : '#ffc107') : '#dc3545';
  var statusIcon = canCreate ? 
    (status === 'Ready' ? '✅' : '⚠️') : '❌';
  
  // Build warnings and errors display
  var warningsHtml = '';
  if (reviewData.warnings && Array.isArray(reviewData.warnings) && reviewData.warnings.length > 0) {
    warningsHtml = '<div style="margin-top: 15px;"><strong>⚠️ Warnings:</strong><ul>';
    reviewData.warnings.forEach(warning => {
      warningsHtml += `<li style="color: #856404;">${warning}</li>`;
    });
    warningsHtml += '</ul></div>';
  }
  
  var errorsHtml = '';
  if (reviewData.errors && Array.isArray(reviewData.errors) && reviewData.errors.length > 0) {
    errorsHtml = '<div style="margin-top: 15px;"><strong>❌ Errors:</strong><ul>';
    reviewData.errors.forEach(error => {
      errorsHtml += `<li style="color: #721c24;">${error}</li>`;
    });
    errorsHtml += '</ul></div>';
  }
  
  // Build resource validation display
  var validationHtml = '';
  if (reviewData.specValidation) {
    var specStatus = reviewData.specValidation.isAvailable ? '✅' : '❌';
    var specStatusText = reviewData.specValidation.status || 'No status';
    validationHtml += `<p><strong>Spec Validation:</strong> ${specStatus} ${specStatusText}</p>`;
  }
  if (reviewData.imageValidation) {
    var imageStatus = reviewData.imageValidation.isAvailable ? '✅' : '❌';
    var imageStatusText = reviewData.imageValidation.status || 'No status';
    validationHtml += `<p><strong>Image Validation:</strong> ${imageStatus} ${imageStatusText}</p>`;
  }
  
  // Add info section if available
  var infoHtml = '';
  if (reviewData.info && Array.isArray(reviewData.info) && reviewData.info.length > 0) {
    infoHtml = '<div style="margin-top: 15px;"><strong>ℹ️ Additional Information:</strong><ul>';
    reviewData.info.forEach(info => {
      infoHtml += `<li style="color: #0c5460;">${info}</li>`;
    });
    infoHtml += '</ul></div>';
  }
  
  var totalNodes = nodeCountPerLocation * nodeGroupRequestFromSpecList.length;
  
  Swal.fire({
    title: "NodeGroup Configuration Review",
    width: 700,
    html:
      "<div style='text-align: left; margin: 20px;'>" +
      "<p><b>Review Results for NodeGroup Addition</b></p>" +
      "<hr>" +
      "<div style='background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 15px;'>" +
      "<h5>📋 Configuration Summary</h5>" +
      "<p><b>Target Infra:</b> " + selectedInfraId + "</p>" +
      "<p><b>NodeGroup Name:</b> " + nodeGroupName + "</p>" +
      "<p><b>Nodes per location:</b> " + nodeCountPerLocation + "</p>" +
      "<p><b>Total locations:</b> " + nodeGroupRequestFromSpecList.length + "</p>" +
      "<p><b>Total Nodes to add:</b> " + totalNodes + "</p>" +
      "<p><b>Estimated Cost:</b> " + estimatedCost + "</p>" +
      "</div>" +
      "<div style='background: " + statusColor + "20; padding: 15px; border-radius: 8px; border-left: 4px solid " + statusColor + "; margin-bottom: 15px;'>" +
      "<h5>" + statusIcon + " Review Status</h5>" +
      "<p><b>Status:</b> <span style='color: " + statusColor + "; font-weight: bold;'>" + status + "</span></p>" +
      "<p><b>Message:</b> " + message + "</p>" +
      validationHtml +
      "</div>" +
      infoHtml +
      warningsHtml +
      errorsHtml +
      "</div>",
    showCancelButton: true,
    confirmButtonText: canCreate ? "Proceed with Creation" : "Back to Configuration",
    cancelButtonText: "Cancel",
    confirmButtonColor: canCreate ? "#28a745" : "#6c757d",
    cancelButtonColor: "#dc3545",
    allowOutsideClick: false
  }).then((result) => {
    if (result.isConfirmed) {
      if (canCreate) {
        // Proceed to final confirmation
        showInfraScaleOutConfirmation(selectedInfraId, nodeGroupName, nodeCountPerLocation, namespace, hostname, port, username, password);
      } else {
        // Go back to configuration
        showInfraScaleOutConfiguration(selectedInfraId, namespace, hostname, port, username, password);
      }
    } else {
      // Cancel the entire operation
      infoAlert("NodeGroup addition cancelled");
    }
  });
}

// Step 3: Show final confirmation and execute Infra scale out
function showInfraScaleOutConfirmation(infraId, nodeGroupName, nodeCountPerLocation, namespace, hostname, port, username, password) {
  var totalNodes = nodeCountPerLocation * nodeGroupRequestFromSpecList.length;
  
  Swal.fire({
    title: "Confirm Infra Scale Out",
    html: 
      "<div style='text-align: left; margin: 20px;'>" +
      "<p>You are about to add <b>" + totalNodes + " Node(s)</b> to Infra:</p>" +
      "<ul>" +
      "<li>Infra: <b>" + infraId + "</b></li>" +
      "<li>New NodeGroup: <b>" + nodeGroupName + "</b></li>" +
      "<li>Nodes per location: <b>" + nodeCountPerLocation + "</b></li>" +
      "<li>Total locations: <b>" + nodeGroupRequestFromSpecList.length + "</b></li>" +
      "</ul>" +
      "<p style='color: #dc3545; margin-top: 15px;'><b>⚠️ Warning:</b> This will incur additional costs.</p>" +
      "</div>",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Proceed with Node Addition",
    cancelButtonText: "Cancel",
    confirmButtonColor: "#28a745",
    cancelButtonColor: "#dc3545"
  }).then((confirmResult) => {
    if (confirmResult.isConfirmed) {
      executeInfraScaleOut(namespace, infraId, nodeGroupName, nodeCountPerLocation, hostname, port, username, password);
    }
  });
}

// Execute Infra scale out operation
function executeInfraScaleOut(namespace, infraId, nodeGroupName, nodeCountPerLocation, hostname, port, username, password) {
  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infraId}/nodeGroupDynamic`;
  
  // Build the request body using current map configuration
  var nodeGroupDynamicReq = {
    name: nodeGroupName,
    nodeGroupSize: nodeCountPerLocation,
    description: "Dynamically added via CB-MapUI Scale Out Infra",
    label: {
      "created-by": "cb-mapui",
      "creation-type": "scale-out-infra",
      "timestamp": new Date().toISOString()
    }
  };

  // Use the first Node configuration from the map as the template
  // In a real scenario, you might want to let users select which configuration to use
  if (nodeGroupRequestFromSpecList && nodeGroupRequestFromSpecList.length > 0) {
    var templateVm = nodeGroupRequestFromSpecList[0];
    
    if (templateVm.specId) {
      nodeGroupDynamicReq.specId = templateVm.specId;
    }
    if (templateVm.imageId) {
      nodeGroupDynamicReq.imageId = templateVm.imageId;
    }
    if (templateVm.rootDiskType) {
      nodeGroupDynamicReq.rootDiskType = templateVm.rootDiskType;
    }
    if (templateVm.rootDiskSize) {
      nodeGroupDynamicReq.rootDiskSize = templateVm.rootDiskSize;
    }
    if (templateVm.connectionName) {
      nodeGroupDynamicReq.connectionName = templateVm.connectionName;
    }
  }

  var jsonBody = JSON.stringify(nodeGroupDynamicReq, undefined, 4);
  
  console.log(`Adding Nodes to Infra ${infraId} with nodegroup ${nodeGroupName}...`);
  var spinnerId = addSpinnerTask(`Scale Out Infra: ${infraId} (+${nodeCountPerLocation * nodeGroupRequestFromSpecList.length} Nodes)`);
  infoAlert(`Starting Infra Scale Out: Adding ${nodeCountPerLocation * nodeGroupRequestFromSpecList.length} Node(s) to ${infraId}`);

  var requestId = generateRandomRequestId("infra-scaleout-" + infraId + "-" + nodeGroupName + "-", 10);
  addRequestIdToSelect(requestId);

  axios({
    method: "post",
    url: url,
    headers: { 
      "Content-Type": "application/json",
      "x-request-id": requestId 
    },
    data: jsonBody,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 600000  // 10 minutes timeout for scale out operation
  })
    .then((res) => {
      console.log("Infra scale out response:", res);
      
      displayJsonData(res.data, typeInfo);
      handleAxiosResponse(res);
      
      // Switch to Control tab after successful scale out (like createInfra)
      try {
        // Deactivate all tabs first
        document.querySelectorAll('.nav-link').forEach(tab => {
          tab.classList.remove('active');
        });
        document.querySelectorAll('.tab-pane').forEach(pane => {
          pane.classList.remove('show', 'active');
        });
        
        // Activate control-tab
        const controlTab = document.getElementById('control-tab');
        const controlPane = document.getElementById('control');
        
        if (controlTab && controlPane) {
          controlTab.classList.add('active');
          controlPane.classList.add('show', 'active');
          
          // Trigger Bootstrap tab shown event if needed
          if (typeof $ !== 'undefined' && $.fn.tab) {
            $(controlTab).tab('show');
          }
        }
      } catch (error) {
        console.log('Failed to activate control tab:', error);
      }
      
      console.log(`Successfully added Nodes to Infra ${infraId}`);
      
      Swal.fire({
        icon: "success",
        title: "Infra Scale Out Successful!",
        html: 
          "<div style='text-align: left;'>" +
          "<p><b>" + (nodeCountPerLocation * nodeGroupRequestFromSpecList.length) + " Node(s)</b> have been successfully added to:</p>" +
          "<ul>" +
          "<li>Infra: <b>" + infraId + "</b></li>" +
          "<li>NodeGroup: <b>" + nodeGroupName + "</b></li>" +
          "</ul>" +
          "<p style='margin-top: 15px; color: #28a745;'>✓ The new Nodes are being provisioned.</p>" +
          "</div>",
        confirmButtonText: "OK"
      });
      
      // Keep configuration for reuse - user can manually clear if needed
      
      // Refresh Infra status after scale out
      setTimeout(() => {
        getInfra();
        updateInfraList();
      }, 3000);
    })
    .catch(function (error) {
      var errorMsg = "Failed to scale out Infra";
      
      if (error.response) {
        console.log(error.response.data);
        console.log(error.response.status);
        
        if (error.response.data) {
          if (typeof error.response.data === 'string') {
            errorMsg = error.response.data;
          } else if (error.response.data.message) {
            errorMsg = error.response.data.message;
          } else if (error.response.data.error) {
            errorMsg = error.response.data.error;
          }
        }
        
        displayJsonData(error.response.data, typeError);
      } else if (error.request) {
        errorMsg = "No response from server. Please check the connection.";
        console.log(error.request);
      } else {
        errorMsg = error.message;
        console.log('Error', error.message);
      }
      
      console.log(errorMsg);
      
      Swal.fire({
        icon: "error",
        title: "Infra Scale Out Failed",
        html: 
          "<div style='text-align: left;'>" +
          "<p>Failed to scale out Infra <b>" + infraId + "</b></p>" +
          "<p style='margin-top: 10px; color: #dc3545;'>Error: " + errorMsg + "</p>" +
          "</div>",
        confirmButtonText: "OK",
        confirmButtonColor: "#dc3545"
      });
      
      console.log(error.config);
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}


// Draw Objects to the Map
function drawObjects(event) {

  // Update locationless Infra positions in real-time for smooth animation
  // Calculate map view bounds once outside the loop to avoid redundant calculations per frame
  var mapView = map.getView();
  var mapExtent = mapView.calculateExtent(map.getSize());
  var leftBound = mapExtent[0];
  var rightBound = mapExtent[2];
  var bottomBound = mapExtent[1];
  var topBound = mapExtent[3];
  var verticalSpacing = (topBound - bottomBound) * LOCATIONLESS_Infra_VERTICAL_SPACING;
  var defaultLon = leftBound + (rightBound - leftBound) * LOCATIONLESS_Infra_LEFT_OFFSET;
  var baseDefaultLat = topBound - (topBound - bottomBound) * LOCATIONLESS_Infra_TOP_OFFSET;

  var locationlessIdx = 0;
  for (const [, data] of infraRenderMap) {
    if (data.isLocationless) {
      var defaultLat = baseDefaultLat - verticalSpacing * locationlessIdx;
      data.geometry.setCoordinates([defaultLon, defaultLat]);
      locationlessIdx++;
    }
  }

  var vectorContext = getVectorContext(event);
  var frameState = event.frameState;
  var theta = (2 * Math.PI * frameState.time) / omegaTheta;

  // Shuffle keys every shuffleInterval draws
  drawCounter++;
  if (drawCounter % shuffleInterval === 0) {
    shuffleKeys();
  }

  // Get the selected providers from checkboxes
  var selectedProviders = getSelectedProviders();
  var isAllSelected = selectedProviders.includes("ALL") || selectedProviders.length === 0;

  // Draw CSP location first with the stored random order
  shuffledKeys.forEach((key) => {
    if (isAllSelected || selectedProviders.includes(key)) {
      if (Array.isArray(geoCspPoints[key]) && geoCspPoints[key].length) {
        const style = getCspStyle(key);
        if (!style) return;
        const styles = Array.isArray(style) ? style : [style];
        const validStyles = styles.filter(Boolean);
        if (!validStyles.length) return;
        validStyles.forEach((s) => {
          vectorContext.setStyle(s);
          vectorContext.drawGeometry(geoCspPoints[key][0]);
        });
      }
    }
  });

  // Draw Infra Geometry (polygons and points from infraRenderMap)
  {
    let colorIdx = 0;
    for (const [, data] of infraRenderMap) {
      if (data.geometry) {
        var polyStyle = new Style({
          stroke: new Stroke({
            width: 1,
            color: cororLineList[colorIdx % cororList.length],
          }),
          fill: new Fill({
            color: cororList[colorIdx % cororList.length],
          }),
        });
        vectorContext.setStyle(polyStyle);
        vectorContext.drawGeometry(data.geometry);
        colorIdx++;
      }
    }
  }

  // Draw K8s Cluster Group Geometry (clusters with same clustergroup label)
  for (i = k8sClusterGroups.length - 1; i >= 0; --i) {
    var k8sGroupPolyStyle = new Style({
      stroke: new Stroke({
        width: 2,
        color: [75, 0, 130, 0.8], // Indigo color for K8s groups
        lineDash: [8, 4] // Dashed line to distinguish from Infra
      }),
      fill: new Fill({
        color: [138, 43, 226, 0.15], // BlueViolet with transparency
      }),
    });

    vectorContext.setStyle(k8sGroupPolyStyle);
    vectorContext.drawGeometry(k8sClusterGroups[i]);
  }

  // Draw Infra Cluster Geometry (clusters within infra)
  if (infraClusterPolygons.size > 0) {
    for (const [infraId, polygons] of infraClusterPolygons) {
      if (Array.isArray(polygons)) {
        polygons.forEach((polygon, idx) => {
          // Get cluster color and info
          const clusterNames = infraClusterNames.get(infraId) || [];
          const clusterColors = infraClusterColors.get(infraId) || new globalThis.Map();
          const clusterName = clusterNames[idx] || `Cluster ${idx}`;
          const clusterColor = clusterColors.get(clusterName) || '#FF5733';
          
          // Parse hex color to RGBA
          const rgbColor = hexToRgb(clusterColor);
          const clusterNodeCount = polygon.get('clusterNodeCount') || 0;
          const isSmallCluster = clusterNodeCount <= 2;
          const clusterStyle = new Style({
            stroke: new Stroke({
              width: isSmallCluster ? 3.2 : 2.8,
              lineDash: isSmallCluster ? [6, 4] : undefined,
              color: [...rgbColor, 0.9]
            }),
            fill: new Fill({
              color: [...rgbColor, isSmallCluster ? 0.2 : 0.12]
            })
          });
          
          vectorContext.setStyle(clusterStyle);
          vectorContext.drawGeometry(polygon);
        });
      }
    }
  }

  if (cspPointsCircle.length) {
    //console.log("cspPointsCircle.length:" +cspPointsCircle.length + "cspPointsCircle["+cspPointsCircle+"]")
    // Fix: Create MultiPoint with proper coordinate structure
    geoCspPointsCircle[0] = new MultiPoint(cspPointsCircle);
    vectorContext.setStyle(iconStyleCircle);
    vectorContext.drawGeometry(geoCspPointsCircle[0]);
    
    // Draw convex hull polygon for configuration points (like existing Infra VMs)
    if (cspPointsCircle.length >= 3) {
      // Create deep copy to avoid modifying original array (convexHull sorts input)
      const pointsCopy = cspPointsCircle.map(point => [point[0], point[1]]);
      
      // Debug: log points before convex hull
      console.log("Original points:", cspPointsCircle);
      console.log("Points copy:", pointsCopy);
      
      const hullPoints = convexHull(pointsCopy);
      
      // Debug: log hull result
      console.log("Hull points:", hullPoints);
      
      if (hullPoints.length >= 3) {
        // Ensure the polygon is closed by adding the first point at the end
        const closedHull = [...hullPoints, hullPoints[0]];
        const configPolygon = new Polygon([closedHull]);
        const configPolyStyle = new Style({
          stroke: new Stroke({
            width: 2,
            color: [169, 169, 169, 0.8], // Light gray with transparency
            lineDash: [5, 5] // Dashed line for config state
          }),
          fill: new Fill({
            color: [192, 192, 192, 0.1], // Very light gray fill
          }),
        });
        vectorContext.setStyle(configPolyStyle);
        vectorContext.drawGeometry(configPolygon);
      }
    }
  }

  if (geoResourceLocation.vnet[0]) {
    vectorContext.setStyle(iconStyleVnet);
    vectorContext.drawGeometry(geoResourceLocation.vnet[0]);
  }
  if (geoResourceLocation.sg[0]) {
    vectorContext.setStyle(iconStyleSG);
    vectorContext.drawGeometry(geoResourceLocation.sg[0]);
  }
  if (geoResourceLocation.sshKey[0]) {
    vectorContext.setStyle(iconStyleKey);
    vectorContext.drawGeometry(geoResourceLocation.sshKey[0]);
  }
  if (geoResourceLocation.k8s[0]) {
    vectorContext.setStyle(iconStyleK8s);
    vectorContext.drawGeometry(geoResourceLocation.k8s[0]);
  }
  if (geoResourceLocation.vpn[0]) {
    vectorContext.setStyle(iconStyleVPN);
    vectorContext.drawGeometry(geoResourceLocation.vpn[0]);
  }

  // Draw Infra Points and Individual Node Status Badges
  for (const [, data] of infraRenderMap) {
    const geometryPoint = data.geometryPoints;
    
    // Skip if no geometry point (e.g., preparing/prepared Infra)
    if (!geometryPoint) {
      continue;
    }
    
    // Check if geometryPoint has the new structure with Node data
    if (geometryPoint && typeof geometryPoint === 'object' && geometryPoint.geometry) {
      const { geometry, nodePoints, nodeStatuses, nodeProviders, nodeCommandStatuses } = geometryPoint;
      const vmBaseScale = changeSizeStatus(data.name + data.status);
      
      if (nodePoints && nodeStatuses) {
        nodeStatuses.forEach((nodeStatus, nodeIndex) => {
          if (nodePoints[nodeIndex]) {
            const nodeCoords = nodePoints[nodeIndex];
            const vmProvider = nodeProviders ? nodeProviders[nodeIndex] : null;
            const commandStatus = nodeCommandStatuses ? nodeCommandStatuses[nodeIndex] : "None";
            const vmStyles = createNodeStyleWithStatusBadge(nodeStatus, vmProvider, vmBaseScale, nodeCoords, commandStatus);
            
            const vmPoint = new Point(nodeCoords);
            vmStyles.forEach(style => {
              vectorContext.setStyle(style);
              vectorContext.drawGeometry(vmPoint);
            });
          }
        });
      }
    } else {
      // Legacy structure: Draw single Infra icon (fallback)
      if (data.name.includes("NLB")) {
        vectorContext.setStyle(iconStyleNlb);
      } else {
        vectorContext.setStyle(iconStyleNode);
      }
      if (geometryPoint) {
        vectorContext.drawGeometry(geometryPoint);
      }
    }
  }

  // Draw K8s cluster text (name and status)
  for (i = 0; i < k8sName.length; i++) {
    if (k8sCoords[i] && k8sName[i]) {
      // Create Point geometry from stored coordinates
      const k8sPoint = new Point(k8sCoords[i]);
      
      // Split K8s cluster name into lines for better display
      const nameLines = splitK8sNameToLines(k8sName[i]);
      const lineHeight = 28; // Spacing between lines (slightly larger than Infra due to bigger font)
      const baseOffsetY = 30; // Position below the icon
      
      // Draw each line of the K8s cluster name
      nameLines.forEach((line, lineIndex) => {
        const k8sNameStyle = new Style({
          text: new Text({
            text: line,
            font: "bold 24px sans-serif", // Increased from 20px to 24px (20% larger)
            scale: 1.0, // Fixed scale for K8s clusters
            offsetY: baseOffsetY + (lineIndex * lineHeight), // Offset each line down
            stroke: new Stroke({
              color: [255, 255, 255, 1], // white stroke
              width: 2, // Adjusted stroke width proportionally
            }),
            fill: new Fill({
              color: [0, 0, 0, 1], // black text
            }),
          }),
        });
        
        vectorContext.setStyle(k8sNameStyle);
        vectorContext.drawGeometry(k8sPoint);
      });

      // K8s cluster status text with appropriate color
      const statusOffsetY = baseOffsetY + (nameLines.length * lineHeight) + 8; // Position below the name lines with gap
      const statusColors = getK8sStatusColor(k8sStatus[i]);
      const k8sStatusStyle = new Style({
        text: new Text({
          text: k8sStatus[i],
          font: "bold 22px sans-serif", // Increased from 18px to 22px (20% larger)
          scale: 0.9, // Slightly smaller for status
          offsetY: statusOffsetY, // Use calculated offset based on name lines
          stroke: new Stroke({
            color: statusColors.stroke,
            width: 2, // Adjusted stroke width proportionally
          }),
          fill: new Fill({
            color: statusColors.fill,
          }),
        }),
      });

      // Draw status text
      vectorContext.setStyle(k8sStatusStyle);
      vectorContext.drawGeometry(k8sPoint);
    }
  }

  // Draw Infra name text
  {
    let infraDrawIdx = 0;
    for (const [, data] of infraRenderMap) {
      const nameLines = splitInfraNameToLines(data.name);
      const baseScale = changeSizeByName(data.name + data.status) + 0.1;
      const baseOffsetY = 32 * changeSizeByName(data.name + data.status);
      const lineHeight = 12 * baseScale;
      
      nameLines.forEach((line, lineIndex) => {
        let displayText = line;
        
        if (lineIndex === 0 && data.targetAction) {
          const spinChars = ['⠿', '⠷', '⠯', '⠟', '⠻', '⠽', '⠾', '⠷','⠿'];
          const animIndex = Math.floor(drawCounter / 10 + infraDrawIdx) % spinChars.length;
          displayText = spinChars[animIndex] + ' ' + displayText;
        }
        
        const textColor = (lineIndex === 0 && data.targetAction) 
          ? getTargetActionColor(data.targetAction)
          : [0, 0, 0, 1];
        
        var polyNameTextStyle = new Style({
          text: new Text({
            text: displayText,
            font: "bold 10px sans-serif",
            scale: baseScale,
            offsetY: baseOffsetY + (lineIndex * lineHeight),
            stroke: new Stroke({
              color: [255, 255, 255, 1],
              width: 1,
            }),
            fill: new Fill({
              color: textColor,
            }),
          }),
        });

        vectorContext.setStyle(polyNameTextStyle);
        vectorContext.drawGeometry(data.geometry);
      });
      infraDrawIdx++;
    }
  }

  // Draw Infra status text
  for (const [, data] of infraRenderMap) {
    const statusColors = getNodeStatusColor(data.status);
    
    const nameLines = splitInfraNameToLines(data.name);
    const baseScale = changeSizeByName(data.name + data.status) + 0.1;
    const lineHeight = 12 * baseScale;
    const nameHeight = nameLines.length * lineHeight;
    const statusOffsetY = 32 * changeSizeByName(data.name + data.status) + nameHeight + 8;
    
    var polyStatusTextStyle = new Style({
      text: new Text({
        text: data.status,
        font: "bold 10px sans-serif",
        scale: changeSizeStatus(data.name + data.status),
        offsetY: statusOffsetY,
        stroke: new Stroke({
          color: statusColors.stroke,
          width: 2,
        }),
        fill: new Fill({
          color: statusColors.fill,
        }),
      }),
    });
    vectorContext.setStyle(polyStatusTextStyle);
    vectorContext.drawGeometry(data.geometry);
  }

  // Draw Infra Cluster labels (drawn last to appear on top of polygons)
  if (showInfraClusterLabels && infraClusterPolygons.size > 0) {
    for (const [infraId, polygons] of infraClusterPolygons) {
      if (Array.isArray(polygons)) {
        const clusterNames = infraClusterNames.get(infraId) || [];
        const clusterColors = infraClusterColors.get(infraId) || new globalThis.Map();
        
        polygons.forEach((polygon, idx) => {
          if (polygon && clusterNames[idx]) {
            const extent = polygon.getExtent();
            const centerX = (extent[0] + extent[2]) / 2;
            const topY = extent[3]; // Use top of polygon
            const labelPoint = new Point([centerX, topY]);
            
            const clusterName = clusterNames[idx];
            const clusterColor = clusterColors.get(clusterName) || '#FF5733';
            const rgbColor = hexToRgb(clusterColor);
            
            const clusterNodeCount = polygon.get('clusterNodeCount') || 0;
            const infraClusterNameStyle = new Style({
              text: new Text({
                text: `${clusterName} (${clusterNodeCount})`,
                font: "bold 14px sans-serif",
                scale: 1.0,
                offsetY: 0,
                stroke: new Stroke({
                  color: [255, 255, 255, 1],
                  width: 2,
                }),
                fill: new Fill({
                  color: rgbColor,
                }),
              }),
            });
            
            vectorContext.setStyle(infraClusterNameStyle);
            vectorContext.drawGeometry(labelPoint);
          }
        });
      }
    }
  }

  // Draw K8s Cluster Group labels (drawn last to appear on top of polygons)
  for (i = k8sClusterGroups.length - 1; i >= 0; --i) {
    if (k8sClusterGroupNames[i]) {
      const extent = k8sClusterGroups[i].getExtent();
      const centerX = (extent[0] + extent[2]) / 2;
      const topY = extent[3]; // Use top of polygon instead of center
      const labelPoint = new Point([centerX, topY]);
      
      const k8sGroupNameStyle = new Style({
        text: new Text({
          text: `⎈ ${k8sClusterGroupNames[i]}`, // Kubernetes helm symbol
          font: "bold 28px sans-serif", // Larger than individual K8s cluster labels (24px)
          scale: 1.0,
          offsetY: 0, // Label at the top edge of the polygon
          stroke: new Stroke({
            color: [255, 255, 255, 1], // White stroke
            width: 3,
          }),
          fill: new Fill({
            color: [75, 0, 130, 1], // Indigo text
          }),
        }),
      });
      
      vectorContext.setStyle(k8sGroupNameStyle);
      vectorContext.drawGeometry(labelPoint);
    }
  }


  map.render();
}

tileLayer.on("postrender", function (event) {
  drawObjects(event);
});

// Function to sync Infra selection from Dashboard
function syncInfraSelectionFromDashboard(infraId) {
  console.log(`[SYNC] Attempting to sync Infra selection: ${infraId}`);
  console.log(`[SYNC] infraidElement exists:`, !!infraidElement);
  
  if (infraidElement && infraId) {
    console.log(`[SYNC] Current value: ${infraidElement.value}, New value: ${infraId}`);
    
    // Check if the option exists in the select element
    const optionExists = Array.from(infraidElement.options).some(option => option.value === infraId);
    console.log(`[SYNC] Option exists in select:`, optionExists);
    
    if (optionExists) {
      // Set the value in the Infra select element
      infraidElement.value = infraId;
      
      // Trigger change event to update dependent dropdowns
      const changeEvent = new Event('change', { bubbles: true });
      infraidElement.dispatchEvent(changeEvent);
      
      console.log(`[SYNC] Infra selection synced successfully: ${infraId}`);
    } else {
      console.log(`[SYNC] Infra ${infraId} not found in select options`);
    }
  } else {
    console.log(`[SYNC] Failed - infraidElement:`, !!infraidElement, `infraId:`, infraId);
  }
}

// Load K8s cluster data for dashboard and map
function loadK8sClusterData() {
  var hostname = configHostname;
  var port = configPort;
  var username = configUsername;
  var password = configPassword;
  var namespace = configNamespace;

  if (!namespace || namespace === "") {
    console.log("No namespace specified for K8s cluster data load");
    return;
  }

  // Set loading status
  window.cloudBaristaCentralData.apiStatus.k8sCluster = 'loading';

  // get k8sCluster list and put them on the map
  var url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/k8sCluster`;
  axios({
    method: "get",
    url: url,
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
    timeout: 600000,
  }).then((res) => {
    var obj = res.data;
    // console.log('K8s cluster API response:', obj);
    // console.log('K8s cluster API response structure:', JSON.stringify(obj, null, 2));
    
    // Update central data store - handle both response formats
    let k8sClusterData = [];
    if (obj.K8sClusterInfo) {
      k8sClusterData = obj.K8sClusterInfo;
      // console.log('Using K8sClusterInfo field');
    } else if (obj.cluster) {
      k8sClusterData = obj.cluster;
      // console.log('Using cluster field');
    }
    
    // console.log('Final k8sClusterData:', k8sClusterData);
    
    window.cloudBaristaCentralData.k8sCluster = k8sClusterData;
    window.cloudBaristaCentralData.resourceData.k8sCluster = k8sClusterData;
    
    // Update API status to success
    window.cloudBaristaCentralData.apiStatus.k8sCluster = 'success';
    window.cloudBaristaCentralData.apiStatus.lastK8sClusterUpdate = new Date();
    window.cloudBaristaCentralData.apiStatus.lastK8sClusterError = null;
    
    // Notify dashboard subscribers
    notifyDataSubscribers();
    
    // Update map icons and store name/status data
    if (k8sClusterData != null && k8sClusterData.length > 0) {
      var resourceLocation = [];
      
      // Clear previous K8s data
      k8sName = [];
      k8sStatus = [];
      k8sCoords = [];
      k8sClusterGroups = [];
      k8sClusterGroupNames = [];
      
      // Temporary object to group clusters by clustergroup label
      // Note: Using plain object instead of Map because 'Map' is overridden by OpenLayers import
      const clusterGroupMap = {};
      
      console.log("resourceLocation k8s[0]");
      for (let i = 0; i < k8sClusterData.length; i++) {
        const item = k8sClusterData[i];
        if (item.connectionConfig && item.connectionConfig.regionDetail && item.connectionConfig.regionDetail.location) {
          const coords = [
            item.connectionConfig.regionDetail.location.longitude * 1,
            item.connectionConfig.regionDetail.location.latitude * 1 + 0.05,
          ];
          resourceLocation.push(coords);
          
          // Store K8s cluster name, status, and coordinates
          k8sName.push(item.name || item.id);
          k8sStatus.push(item.status || 'Unknown');
          k8sCoords.push(coords);
          
          // Group by clustergroup label if present
          if (item.label && item.label.clustergroup) {
            const groupName = item.label.clustergroup;
            if (!clusterGroupMap[groupName]) {
              clusterGroupMap[groupName] = [];
            }
            clusterGroupMap[groupName].push(coords);
          }
        }
      }
      
      // Create polygons for cluster groups with 2+ clusters
      // Note: 2 points create a line connecting clusters, which is intentional
      Object.entries(clusterGroupMap).forEach(([groupName, coords]) => {
        if (coords.length >= 2) {
          // Create deep copy for convexHull (it modifies the array)
          const pointsCopy = coords.map(c => [...c]);
          const hullPoints = convexHull(pointsCopy);
          
          if (hullPoints.length >= 2) {
            // Close the polygon (or line for 2 points)
            const closedHull = [...hullPoints, hullPoints[0]];
            k8sClusterGroups.push(new Polygon([closedHull]));
            k8sClusterGroupNames.push(groupName);
          }
        }
      });
      
      if (resourceLocation.length > 0) {
        geoResourceLocation.k8s[0] = new MultiPoint(resourceLocation);
      }
      
      // Trigger map re-render to display updated K8s cluster data
      map.render();
    } else {
      // Clear k8s icons when list is empty
      geoResourceLocation.k8s = [];
      k8sName = [];
      k8sStatus = [];
      k8sCoords = [];
      k8sClusterGroups = [];
      k8sClusterGroupNames = [];
      
      // Trigger map re-render to clear K8s icons
      map.render();
    }
    
    // console.log('K8s cluster data loaded successfully:', k8sClusterData.length, 'clusters');
  })
    .catch(function (error) {
      // console.log("k8sCluster API error:", error);
      // console.log("Keeping existing K8s cluster data to preserve user experience");
      
      // Update API status to error but don't clear existing data
      window.cloudBaristaCentralData.apiStatus.k8sCluster = 'error';
      window.cloudBaristaCentralData.apiStatus.lastK8sClusterError = {
        timestamp: new Date(),
        message: error.message || 'Unknown error',
        code: error.code || 'UNKNOWN_ERROR'
      };
      
      // Don't clear existing data on API error - keep current state
      // This prevents UI from showing empty state when there are temporary API issues
      
      // Optional: Show user notification about the error while keeping data
      if (typeof updateMapConnectionStatus === 'function') {
        updateMapConnectionStatus('error');
        // Reset to normal status after a short delay
        setTimeout(() => {
          updateMapConnectionStatus('connected');
        }, 3000);
      }
      
      // Notify subscribers even on error so dashboard knows about the failed update attempt
      notifyDataSubscribers();
    });
}

// Load VPN data from all Infras (reusing existing Infra data)
async function loadVpnDataFromInfras() {
  try {
    const config = getConfig();
    const { hostname, port, username, password } = config;
    const namespace = configNamespace || config.username;
    
    // Use existing Infra data from central store - no fallback API call
    let infraData = [];
    if (window.cloudBaristaCentralData && window.cloudBaristaCentralData.infra) {
      infraData = window.cloudBaristaCentralData.infra;
      debugLog.resource('Using cached Infra data for VPN loading:', infraData.length, 'Infras');
    } else {
      debugLog.resource('Central Infra data not available, skipping VPN loading');
      // Clear VPN data and return early - no point in loading VPN without Infras
      window.cloudBaristaCentralData.vpn = [];
      geoResourceLocation.vpn = [];
      return;
    }
    
    // If no Infras exist, no point in trying to load VPN data
    if (!infraData || infraData.length === 0) {
      debugLog.resource('No Infras available, skipping VPN loading');
      window.cloudBaristaCentralData.vpn = [];
      geoResourceLocation.vpn = [];
      return;
    }
    
    let allVpnData = [];
    let resourceLocation = [];
    
    // Load VPN data from each Infra
    for (const infra of infraData) {
      try {
        const vpnUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra/${infra.id}/vpn`;
        const vpnResponse = await axios({
          method: "get",
          url: vpnUrl,
          auth: { username, password },
          timeout: 5000
        });
        
        const vpnData = vpnResponse.data?.vpn || [];
        debugLog.api(`VPN data for Infra ${infra.id}:`, vpnData.length, 'VPNs');
        
        // Add Infra ID to each VPN for reference
        vpnData.forEach(vpn => {
          vpn.infraId = infra.id;
          allVpnData.push(vpn);
          
          // Extract location data for map display
          if (vpn.vpnSites && vpn.vpnSites.length > 0) {
            for (let site of vpn.vpnSites) {
              if (site.connectionConfig?.regionDetail?.location) {
                resourceLocation.push([
                  site.connectionConfig.regionDetail.location.longitude * 1,
                  site.connectionConfig.regionDetail.location.latitude * 1 + 0.05,
                ]);
              }
            }
          } else if (vpn.connectionConfig?.regionDetail?.location) {
            resourceLocation.push([
              vpn.connectionConfig.regionDetail.location.longitude * 1,
              vpn.connectionConfig.regionDetail.location.latitude * 1 + 0.05,
            ]);
          }
        });
        
      } catch (vpnError) {
        // Silently continue if VPN API fails for individual Infra
        debugLog.api(`VPN API error for Infra ${infra.id}:`, vpnError.message);
      }
    }
    
    // Store VPN data in central store
    window.cloudBaristaCentralData.vpn = allVpnData;
    debugLog.resource('Total VPN data stored:', allVpnData.length, 'VPNs from', infraData.length, 'Infras');
    
    // Notify Dashboard subscribers about VPN data update
    notifyDataSubscribers();
    
    // Update map display
    if (resourceLocation.length > 0) {
      geoResourceLocation.vpn[0] = new MultiPoint([resourceLocation]);
      debugLog.mapOp("geoResourceLocation.vpn[0] updated with", resourceLocation.length, "locations");
    } else {
      geoResourceLocation.vpn = [];
    }
    
  } catch (error) {
    debugLog.api("VPN data loading error:", error);
    window.cloudBaristaCentralData.vpn = [];
    geoResourceLocation.vpn = [];
  }
}

// Make function available globally for Dashboard to call
window.syncInfraSelectionFromDashboard = syncInfraSelectionFromDashboard;

// ============================================
// Snapshot Management Functions
// ============================================

// Global variables for snapshot auto-refresh
window.snapshotAutoRefreshEnabled = false;
window.snapshotAutoRefreshInterval = null;
window.snapshotLastImageData = null; // Store last image data to prevent unnecessary re-renders

// Toggle Auto-refresh for Snapshot Management
function toggleSnapshotAutoRefresh() {
  window.snapshotAutoRefreshEnabled = !window.snapshotAutoRefreshEnabled;
  
  const btn = document.getElementById('toggleAutoRefreshBtn');
  const status = document.getElementById('autoRefreshStatus');
  
  if (window.snapshotAutoRefreshEnabled) {
    btn.innerHTML = '⏸️ Pause Auto-refresh';
    btn.className = 'btn btn-success btn-sm';
    status.innerHTML = '🟢 Auto-refreshing every 5 seconds';
  } else {
    btn.innerHTML = '▶️ Resume Auto-refresh';
    btn.className = 'btn btn-warning btn-sm';
    status.innerHTML = '🔴 Auto-refresh paused';
  }
}

// Show Snapshot Management Modal
async function showSnapshotManagementModal() {
  const namespace = configNamespace;
  if (!namespace) {
    Swal.fire('Warning', 'Please select a namespace first', 'warning');
    return;
  }

  // Get pre-selected Infra from control panel (if any)
  const preSelectedInfra = document.getElementById('infraid')?.value || '';

  // Load Infra list
  const config = getConfig();
  let infraList = [];
  try {
    const response = await axios.get(`http://${config.hostname}:${config.port}/tumblebug/ns/${namespace}/infra`, {
      auth: { username: config.username, password: config.password },
      headers: { 'Content-Type': 'application/json' }
    });
    infraList = response.data.infra || [];
  } catch (error) {
    console.error('Error loading Infra list:', error);
  }

  Swal.fire({
    title: '📸 Snapshot Management',
    html: `
      <style>
        .swal2-html-container { padding: 0 1.6em !important; }
        .snapshot-compact-form { text-align: left; padding: 0; margin: 0; }
        .snapshot-compact-form h5 { margin: 0 0 10px 0; font-size: 16px; }
        .snapshot-compact-form .form-row { display: flex; gap: 10px; margin-bottom: 8px; }
        .snapshot-compact-form .form-col { flex: 1; min-width: 0; }
        .snapshot-compact-form label { display: block; margin: 0 0 3px 0; font-size: 13px; font-weight: 500; }
        .snapshot-compact-form .form-control-sm { height: 28px; font-size: 13px; padding: 3px 8px; }
        .snapshot-compact-form hr { margin: 12px 0; border-top: 1px solid #dee2e6; }
        .snapshot-compact-form .btn { margin: 8px 0; }
      </style>
      <div class="snapshot-compact-form">
        <h5>Create Node Snapshot</h5>
        <div class="form-row">
          <div class="form-col">
            <label>Select Infra:</label>
            <select id="snapshotInfraSelect" class="form-control form-control-sm">
              <option value="">-- Select Infra --</option>
              ${infraList.map(infra => `<option value="${infra.id}" ${infra.id === preSelectedInfra ? 'selected' : ''}>${infra.id}</option>`).join('')}
            </select>
          </div>
          <div class="form-col">
            <label>Select Node:</label>
            <select id="snapshotNodeSelect" class="form-control form-control-sm">
              <option value="">-- Select Infra First --</option>
            </select>
            <small class="form-text text-muted" style="margin-top: 2px;">Select "🌐 All Nodes" for Infra-wide snapshot</small>
          </div>
        </div>
        <div class="form-row">
          <div class="form-col">
            <label>Snapshot Name (optional):</label>
            <input type="text" id="snapshotName" class="form-control form-control-sm" placeholder="Auto-generated if empty">
          </div>
          <div class="form-col">
            <label>Description (optional):</label>
            <input type="text" id="snapshotDescription" class="form-control form-control-sm" placeholder="Snapshot description">
          </div>
        </div>
        <button onclick="createNodeSnapshotFromModal()" class="btn btn-primary btn-block">📸 Create Snapshot</button>
        
        <hr>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h5 style="margin: 0;">Custom Images</h5>
          <div>
            <button id="refreshNowBtn" class="btn btn-info btn-sm" style="margin-right: 5px;">🔄 Refresh Now</button>
            <button id="toggleAutoRefreshBtn" class="btn btn-success btn-sm">⏸️ Pause Auto-refresh</button>
          </div>
        </div>
        <div style="font-size: 11px; color: #6c757d; margin-bottom: 5px;">
          <span id="autoRefreshStatus">🟢 Auto-refreshing every 5 seconds</span> | 
          <span id="lastRefreshTime">Last refresh: -</span>
        </div>
        <div id="customImageListContainer" style="max-height: 400px; overflow-y: auto;">
          <p class="text-muted">Loading custom images...</p>
        </div>
      </div>
    `,
    width: '80%',
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '❌ Close',
    customClass: {
      htmlContainer: 'swal2-html-container-compact'
    },
    didOpen: async () => {
      // Store namespace in window for access from modal functions
      window.currentSnapshotNamespace = namespace;
      
      // Infra selection change handler
      const loadVmsForInfra = async function(infraId) {
        const nodeSelect = document.getElementById('snapshotNodeSelect');
        nodeSelect.innerHTML = '<option value="">-- Loading Nodes --</option>';
        
        if (!infraId) {
          nodeSelect.innerHTML = '<option value="">-- Select Infra First --</option>';
          return;
        }

        try {
          const response = await axios.get(
            `http://${config.hostname}:${config.port}/tumblebug/ns/${namespace}/infra/${infraId}`,
            {
              auth: { username: config.username, password: config.password },
              headers: { 'Content-Type': 'application/json' }
            }
          );
          
          const nodes = response.data.node || [];
          // Add "All Nodes" option for Infra-wide snapshot
          nodeSelect.innerHTML = '<option value="">-- Select Node or All --</option>' + 
            '<option value="__ALL_NODES__">🌐 All Nodes (Infra Snapshot - one per nodegroup)</option>' +
            nodes.map(nd => `<option value="${nd.id}">${nd.id} (${nd.status})</option>`).join('');
        } catch (error) {
          console.error('Error loading Node list:', error);
          nodeSelect.innerHTML = '<option value="">-- Error loading Nodes --</option>';
        }
      };
      
      document.getElementById('snapshotInfraSelect').addEventListener('change', async function() {
        await loadVmsForInfra(this.value);
      });
      
      // If Infra is pre-selected, auto-load its VMs
      if (preSelectedInfra) {
        await loadVmsForInfra(preSelectedInfra);
      }
      
      // Auto-refresh setup (5 seconds interval)
      window.snapshotAutoRefreshEnabled = true;
      window.snapshotAutoRefreshInterval = null;
      window.snapshotLastImageData = null; // Reset cached data
      
      // Setup refresh now button event listener
      const refreshNowBtn = document.getElementById('refreshNowBtn');
      if (refreshNowBtn) {
        refreshNowBtn.addEventListener('click', function() {
          loadCustomImagesInModal(namespace);
        });
      }
      
      // Setup toggle button event listener
      const toggleBtn = document.getElementById('toggleAutoRefreshBtn');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
          window.snapshotAutoRefreshEnabled = !window.snapshotAutoRefreshEnabled;
          
          const status = document.getElementById('autoRefreshStatus');
          
          if (window.snapshotAutoRefreshEnabled) {
            this.innerHTML = '⏸️ Pause Auto-refresh';
            this.className = 'btn btn-success btn-sm';
            if (status) status.innerHTML = '🟢 Auto-refreshing every 5 seconds';
          } else {
            this.innerHTML = '▶️ Resume Auto-refresh';
            this.className = 'btn btn-warning btn-sm';
            if (status) status.innerHTML = '🔴 Auto-refresh paused';
          }
        });
      }
      
      // Initial load with slight delay to ensure DOM is ready
      setTimeout(() => {
        loadCustomImagesInModal(namespace);
      }, 100);
      
      // Start auto-refresh timer
      window.snapshotAutoRefreshInterval = setInterval(() => {
        if (window.snapshotAutoRefreshEnabled) {
          loadCustomImagesInModal(namespace);
        }
      }, 5000); // 5 seconds
    },
    willClose: () => {
      // Cleanup: clear auto-refresh timer when modal closes
      if (window.snapshotAutoRefreshInterval) {
        clearInterval(window.snapshotAutoRefreshInterval);
        window.snapshotAutoRefreshInterval = null;
      }
      window.snapshotAutoRefreshEnabled = false;
      // Note: Don't clear window.currentSnapshotNamespace here
      // It will be updated when a new modal opens
    }
  });
}

// Create Node Snapshot (supports both single Node and Infra-wide snapshots)
async function createNodeSnapshotFromModal() {
  const namespace = configNamespace;
  const infraId = document.getElementById('snapshotInfraSelect').value;
  const nodeId = document.getElementById('snapshotNodeSelect').value;
  const snapshotName = document.getElementById('snapshotName').value;
  const description = document.getElementById('snapshotDescription').value;

  if (!infraId || !nodeId) {
    Swal.fire('Warning', 'Please select Infra and Node (or All Nodes)', 'warning');
    return;
  }

  const config = getConfig();
  const isInfraSnapshot = (nodeId === '__ALL_NODES__');
  
  try {
    Swal.fire({
      title: isInfraSnapshot ? 'Creating Infra Snapshots...' : 'Creating Node Snapshot...',
      html: isInfraSnapshot ? 
        'Creating snapshots for all nodegroups in parallel...<br>This may take several minutes...' : 
        'This may take a few minutes...',
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });

    const requestBody = {
      name: snapshotName || undefined,
      description: description || undefined
    };

    let response;
    if (isInfraSnapshot) {
      // Infra-wide snapshot (all nodegroups)
      response = await axios.post(
        `http://${config.hostname}:${config.port}/tumblebug/ns/${namespace}/infra/${infraId}/snapshot`,
        requestBody,
        {
          auth: { username: config.username, password: config.password },
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      // Display Infra snapshot results
      const results = response.data.results || [];
      const successCount = response.data.successCount || 0;
      const failCount = response.data.failCount || 0;
      
      const resultsHtml = results.map(result => {
        const statusIcon = result.status === 'Success' ? '✅' : '❌';
        const statusClass = result.status === 'Success' ? 'success' : 'danger';
        const statusBadge = result.imageInfo?.imageStatus ? 
          `<span class="badge badge-info" style="font-size: 11px;">${result.imageInfo.imageStatus}</span>` : '';
        
        return `
          <tr>
            <td>${statusIcon}</td>
            <td>${result.nodeGroupId}</td>
            <td>${result.nodeId}</td>
            <td>${result.imageId || 'N/A'} ${statusBadge}</td>
            <td><span class="badge badge-${statusClass}">${result.status}</span></td>
            <td style="font-size: 11px; color: ${result.error ? 'red' : 'inherit'};">${result.error || '-'}</td>
          </tr>
        `;
      }).join('');
      
      Swal.fire({
        icon: successCount > 0 ? 'success' : 'error',
        title: 'Infra Snapshot Completed',
        html: `
          <div style="text-align: left; padding: 10px;">
            <p><strong>Infra ID:</strong> ${response.data.infraId}</p>
            <p><strong>Summary:</strong> 
              <span class="badge badge-success">${successCount} Success</span> 
              <span class="badge badge-danger">${failCount} Failed</span>
            </p>
            <div style="max-height: 400px; overflow-y: auto; margin-top: 10px;">
              <table class="table table-sm table-bordered">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>NodeGroup</th>
                    <th>Node ID</th>
                    <th>Image ID</th>
                    <th>Result</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  ${resultsHtml}
                </tbody>
              </table>
            </div>
            ${failCount > 0 ? 
              '<p class="text-warning"><strong>⚠️ Note:</strong> Some snapshots failed. Check error details above.</p>' : 
              '<p class="text-success"><strong>✅ All snapshots created successfully!</strong></p>'}
          </div>
        `,
        width: '900px',
        confirmButtonText: 'OK'
      }).then(() => {
        showSnapshotManagementModal();
      });
      
    } else {
      // Single Node snapshot
      response = await axios.post(
        `http://${config.hostname}:${config.port}/tumblebug/ns/${namespace}/infra/${infraId}/node/${nodeId}/snapshot`,
        requestBody,
        {
          auth: { username: config.username, password: config.password },
          headers: { 'Content-Type': 'application/json' }
        }
      );

      // Create status badge with color
      const statusClass = response.data.imageStatus === 'Available' ? 'success' : 
                         response.data.imageStatus === 'Creating' ? 'info' : 
                         response.data.imageStatus === 'Failed' ? 'danger' : 'warning';
      
      Swal.fire({
        icon: 'success',
        title: 'Node Snapshot Created!',
        html: `
          <div style="text-align: left; padding: 10px;">
            <p><strong>Image ID:</strong> ${response.data.id}</p>
            <p><strong>Image Status:</strong> <span class="badge badge-${statusClass}" style="font-size: 14px;">${response.data.imageStatus}</span></p>
            <p><strong>Provider:</strong> ${response.data.providerName || 'N/A'}</p>
            <p><strong>Region:</strong> ${response.data.regionList ? response.data.regionList.join(', ') : 'N/A'}</p>
            <p><strong>Description:</strong> ${response.data.description || 'N/A'}</p>
            ${response.data.imageStatus !== 'Available' ? 
              '<p class="text-warning"><strong>⚠️ Note:</strong> Snapshot is being created. Status will be updated shortly.</p>' : 
              '<p class="text-success"><strong>✅ Snapshot is ready to use!</strong></p>'}
          </div>
        `,
        confirmButtonText: 'OK'
      }).then(() => {
        showSnapshotManagementModal();
      });
    }

  } catch (error) {
    console.error('Error creating snapshot:', error);
    Swal.fire({
      icon: 'error',
      title: 'Snapshot Creation Failed',
      text: error.response?.data?.message || error.message || 'Unknown error occurred'
    });
  }
}

// Load Custom Images (with smart refresh to prevent flickering)
async function loadCustomImagesInModal(namespace) {
  // Priority: passed parameter > window storage > input field
  if (!namespace) {
    namespace = window.currentSnapshotNamespace || configNamespace;
  }
  
  console.log('loadCustomImagesInModal called with namespace:', namespace);
  
  if (!namespace) {
    console.error('Namespace not available in loadCustomImagesInModal');
    const container = document.getElementById('customImageListContainer');
    if (container) {
      container.innerHTML = '<p class="text-danger">Error: Namespace not available</p>';
    }
    return;
  }
  
  const config = getConfig();
  const container = document.getElementById('customImageListContainer');
  
  if (!container) {
    console.error('customImageListContainer element not found');
    return;
  }
  
  // Update last refresh time
  const lastRefreshElement = document.getElementById('lastRefreshTime');
  if (lastRefreshElement) {
    const now = new Date();
    lastRefreshElement.innerHTML = `Last refresh: ${now.toLocaleTimeString()}`;
  }
  
  // Show loading only on first load
  if (!window.snapshotLastImageData) {
    container.innerHTML = '<p class="text-muted">Loading...</p>';
  }

  try {
    const response = await axios.get(
      `http://${config.hostname}:${config.port}/tumblebug/ns/${namespace}/resources/customImage`,
      {
        auth: { username: config.username, password: config.password },
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const images = response.data.customImage || [];
    
    // Compare with last data to prevent unnecessary re-render
    const currentDataString = JSON.stringify(images);
    if (window.snapshotLastImageData === currentDataString) {
      // Data hasn't changed, skip re-render
      return;
    }
    
    // Update stored data
    window.snapshotLastImageData = currentDataString;
    
    if (images.length === 0) {
      container.innerHTML = '<p class="text-muted">No custom images found</p>';
      return;
    }

    let html = '<div style="overflow-x: auto;"><table class="table table-sm table-striped" style="font-size: 12px;"><thead><tr><th>Provider (Region)</th><th>ID (Status)</th><th>OS (Arch)</th><th>Description</th><th>Source Node UID</th><th>Created</th><th>Action</th></tr></thead><tbody>';
    
    images.forEach(img => {
      // Enhanced status badge with icons and colors
      let statusIcon = '';
      
      if (img.imageStatus === 'Available') {
        statusIcon = '✅';
      } else if (img.imageStatus === 'Unavailable') {
        statusIcon = '⏳';
      } else {
        statusIcon = '⚠️';
      }
      
      // Combine provider and region
      const providerRegion = `${img.providerName || 'N/A'} (${img.regionList && img.regionList.length > 0 ? img.regionList[0] : 'N/A'})`;
      
      // Combine ID and status
      const idWithStatus = `${img.id.substring(0, 12)}${img.id.length > 12 ? '...' : ''} (${statusIcon})`;
      
      // Combine OS type and architecture
      const osInfo = `${img.osType || 'N/A'} (${img.osArchitecture || 'N/A'})`;
      
      // Truncate long description
      const descShort = img.description && img.description.length > 40 ? 
        img.description.substring(0, 40) + '...' : (img.description || 'N/A');
      
      html += `
        <tr>
          <td>${providerRegion}</td>
          <td title="${img.id} - Status: ${img.imageStatus}">${idWithStatus}</td>
          <td>${osInfo}</td>
          <td title="${img.description || 'N/A'}">${descShort}</td>
          <td title="${img.sourceNodeUid || 'N/A'}">${img.sourceNodeUid ? img.sourceNodeUid.substring(0, 12) + '...' : 'N/A'}</td>
          <td>${img.creationDate ? new Date(img.creationDate).toLocaleDateString() : 'N/A'}</td>
          <td style="white-space: nowrap;">
            <button onclick="viewCustomImageDetails('${img.id}')" class="btn btn-sm btn-info" title="View Details">👁️</button>
            <button onclick="deleteCustomImageFromModal('${img.id}')" class="btn btn-sm btn-danger" title="Delete">🗑️</button>
          </td>
        </tr>
      `;
    });
    
    html += '</tbody></table></div>';
    container.innerHTML = html;

  } catch (error) {
    console.error('Error loading custom images:', error);
    container.innerHTML = '<p class="text-danger">Error loading custom images</p>';
  }
}

// View Custom Image Details
async function viewCustomImageDetails(imageId) {
  const namespace = window.currentSnapshotNamespace || configNamespace;
  if (!namespace) {
    Swal.fire('Error', 'Namespace not available', 'error');
    return;
  }
  const config = getConfig();

  try {
    const response = await axios.get(
      `http://${config.hostname}:${config.port}/tumblebug/ns/${namespace}/resources/customImage/${imageId}`,
      {
        auth: { username: config.username, password: config.password },
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const img = response.data;
    
    // Create enhanced status badge with icon
    let statusIcon = '';
    let statusClass = 'warning';
    let statusMessage = '';
    
    if (img.imageStatus === 'Available') {
      statusIcon = '✅';
      statusClass = 'success';
      statusMessage = '<p class="text-success"><strong>This snapshot is ready to use for Node creation.</strong></p>';
    } else if (img.imageStatus === 'Creating') {
      statusIcon = '🔄';
      statusClass = 'info';
      statusMessage = '<p class="text-info"><strong>⏳ Snapshot is being created. Please wait until status becomes Available.</strong></p>';
    } else if (img.imageStatus === 'Failed') {
      statusIcon = '❌';
      statusClass = 'danger';
      statusMessage = '<p class="text-danger"><strong>⚠️ Snapshot creation failed. This image cannot be used.</strong></p>';
    } else {
      statusIcon = '⚠️';
      statusClass = 'warning';
      statusMessage = '<p class="text-warning"><strong>⚠️ Image status is ' + img.imageStatus + '. Check before using.</strong></p>';
    }
    
    Swal.fire({
      title: `📸 ${img.id}`,
      html: `
        <div style="text-align: left; padding: 10px;">
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 15px; border-left: 4px solid var(--${statusClass});">
            <p style="margin: 0;"><strong>Image Status:</strong></p>
            <p style="margin: 10px 0; font-size: 16px;">
              <span class="badge badge-${statusClass}" style="font-size: 16px; padding: 8px 12px;">${statusIcon} ${img.imageStatus}</span>
            </p>
            ${statusMessage}
          </div>
          <p><strong>Provider:</strong> ${img.providerName}</p>
          <p><strong>Region:</strong> ${img.regionList ? img.regionList.join(', ') : 'N/A'}</p>
          <p><strong>OS Type:</strong> ${img.osType || 'N/A'}</p>
          <p><strong>OS Architecture:</strong> ${img.osArchitecture || 'N/A'}</p>
          <p><strong>Description:</strong> ${img.description || 'N/A'}</p>
          <p><strong>Created:</strong> ${img.creationDate || 'N/A'}</p>
          <p><strong>Source Node UID:</strong> ${img.sourceNodeUid || 'N/A'}</p>
        </div>
      `,
      confirmButtonText: 'Close',
      width: '600px'
    }).then(() => {
      // Return to Snapshot Management modal after closing
      showSnapshotManagementModal();
    });

  } catch (error) {
    console.error('Error loading custom image details:', error);
    Swal.fire('Error', 'Failed to load image details', 'error').then(() => {
      // Return to Snapshot Management modal even on error
      showSnapshotManagementModal();
    });
  }
}

// Delete Custom Image
async function deleteCustomImageFromModal(imageId) {
  const result = await Swal.fire({
    title: 'Delete Custom Image?',
    text: `Are you sure you want to delete "${imageId}"?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'Yes, delete it!',
    cancelButtonText: 'Cancel'
  });

  if (!result.isConfirmed) return;

  const namespace = window.currentSnapshotNamespace || configNamespace;
  if (!namespace) {
    Swal.fire('Error', 'Namespace not available', 'error');
    return;
  }
  const config = getConfig();

  try {
    await axios.delete(
      `http://${config.hostname}:${config.port}/tumblebug/ns/${namespace}/resources/customImage/${imageId}`,
      {
        auth: { username: config.username, password: config.password },
        headers: { 'Content-Type': 'application/json' }
      }
    );

    Swal.fire('Deleted!', 'Custom image has been deleted.', 'success').then(() => {
      // Return to Snapshot Management modal after deletion
      showSnapshotManagementModal();
    });

  } catch (error) {
    console.error('Error deleting custom image:', error);
    Swal.fire('Error', error.response?.data?.message || 'Failed to delete custom image', 'error').then(() => {
      // Return to Snapshot Management modal even on error
      showSnapshotManagementModal();
    });
  }
}

// Make functions globally available
window.showSnapshotManagementModal = showSnapshotManagementModal;
window.createNodeSnapshotFromModal = createNodeSnapshotFromModal;
window.loadCustomImagesInModal = loadCustomImagesInModal;
window.viewCustomImageDetails = viewCustomImageDetails;
window.deleteCustomImageFromModal = deleteCustomImageFromModal;

// ==========================================
// Task Management Functions
// ==========================================

// Global variables for task auto-refresh
window.taskAutoRefreshEnabled = false;
window.taskAutoRefreshInterval = null;
window.taskLastData = null; // Store last task data to prevent unnecessary re-renders

// Load task list and update the modal content
async function loadTaskListInModal(namespace, infraid) {
  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;

  const url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/cmd/infra/${infraid}/task`;

  try {
    const res = await axios.get(url, {
      auth: { username: username, password: password }
    });

    const tasks = res.data.tasks || [];
    
    // Check if data has changed (to avoid unnecessary re-render)
    const currentDataStr = JSON.stringify(tasks);
    if (window.taskLastData === currentDataStr) {
      // Only update the last refresh time
      const lastRefreshEl = document.getElementById('taskLastRefreshTime');
      if (lastRefreshEl) {
        lastRefreshEl.textContent = `Last refresh: ${new Date().toLocaleTimeString('en-US', { hour12: false })}`;
      }
      return;
    }
    window.taskLastData = currentDataStr;
    
    // Sort tasks: active tasks first (Handling, Queued), then by startedAt descending
    const sortedTasks = [...tasks].sort((a, b) => {
      const aActive = ['handling', 'queued'].includes((a.status || '').toLowerCase());
      const bActive = ['handling', 'queued'].includes((b.status || '').toLowerCase());
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      // Both same priority, sort by startedAt descending (newest first)
      return new Date(b.startedAt || 0) - new Date(a.startedAt || 0);
    });

    let tasksHtml = '';
    if (sortedTasks.length === 0) {
      tasksHtml = '<p style="text-align: center; color: #666;">No command execution history</p>';
    } else {
      tasksHtml = `
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Command</th>
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Infra / Node</th>
              <th style="padding: 8px; text-align: center; border-bottom: 2px solid #ddd;">Status</th>
              <th style="padding: 8px; text-align: center; border-bottom: 2px solid #ddd;">Started At</th>
              <th style="padding: 8px; text-align: center; border-bottom: 2px solid #ddd;">Duration</th>
              <th style="padding: 8px; text-align: center; border-bottom: 2px solid #ddd;">Action</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      sortedTasks.forEach(task => {
        // Status uses CommandExecutionStatus: Queued, Handling, Completed, Failed, Timeout, Cancelled, Interrupted
        const statusLower = (task.status || '').toLowerCase();
        let statusColor, statusIcon;
        switch (statusLower) {
          case 'handling':
            statusColor = '#28a745'; // Green
            statusIcon = '⏳';
            break;
          case 'queued':
            statusColor = '#6c757d'; // Gray
            statusIcon = '⏸️';
            break;
          case 'completed':
            statusColor = '#17a2b8'; // Cyan
            statusIcon = '✅';
            break;
          case 'cancelled':
            statusColor = '#ffc107'; // Yellow
            statusIcon = '⚠️';
            break;
          case 'interrupted':
            statusColor = '#fd7e14'; // Orange
            statusIcon = '🔄';
            break;
          case 'failed':
            statusColor = '#dc3545'; // Red
            statusIcon = '❌';
            break;
          case 'timeout':
            statusColor = '#dc3545'; // Red
            statusIcon = '⏰';
            break;
          default:
            statusColor = '#6c757d'; // Gray
            statusIcon = '❓';
            break;
        }
        
        // Format command - show truncated command with tooltip
        const cmdArray = task.command || [];
        const cmdText = Array.isArray(cmdArray) ? cmdArray.join(' ') : String(cmdArray);
        const cmdTruncated = cmdText.length > 40 ? cmdText.substring(0, 40) + '...' : cmdText;
        const cmdEscaped = cmdText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        // Also escape cmdTruncated for HTML content
        const cmdTruncatedEscaped = cmdTruncated.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        // Format target - show Node info
        let targetText = task.nodeId || 'N/A';
        if (task.infraId && task.nodeId) {
          targetText = `${task.infraId} / ${task.nodeId}`;
        } else if (task.infraId) {
          targetText = task.infraId;
        }
        // Escape for HTML content
        const targetTextEscaped = targetText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        // Started At: format the start time for display
        let startedAtText = '-';
        let startedAtFull = '';
        if (task.startedAt) {
          const startDate = new Date(task.startedAt);
          if (!isNaN(startDate.getTime())) {
            // Short format for table (HH:MM:SS) - use en-US locale for consistency
            startedAtText = startDate.toLocaleTimeString('en-US', { hour12: false });
            // Full format for tooltip
            startedAtFull = startDate.toLocaleString('en-US');
          }
        }
        
        // Duration: show elapsed time or calculate from start time for running tasks
        let durationText = '-';
        let durationTooltip = '';
        if (task.elapsedSeconds && task.elapsedSeconds > 0) {
          // Use provided elapsed time (for completed tasks)
          const totalSecs = task.elapsedSeconds;
          const mins = Math.floor(totalSecs / 60);
          const secs = totalSecs % 60;
          durationText = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
          durationTooltip = `Elapsed: ${totalSecs} seconds`;
        } else if (task.startedAt && (statusLower === 'handling' || statusLower === 'queued')) {
          // Calculate elapsed time for running tasks
          const startDate = new Date(task.startedAt);
          if (!isNaN(startDate.getTime())) {
            const now = new Date();
            const elapsedMs = now - startDate;
            const totalSecs = Math.floor(elapsedMs / 1000);
            const mins = Math.floor(totalSecs / 60);
            const secs = totalSecs % 60;
            durationText = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
            durationTooltip = `Running since ${startedAtFull}`;
          }
        }
        
        // End time for tooltip
        const endTime = task.completedAt ? new Date(task.completedAt).toLocaleString('en-US') : '';
        if (endTime) {
          durationTooltip = `Started: ${startedAtFull}\nEnded: ${endTime}`;
        }
        
        // Can cancel if task is actively running (Handling or Queued)
        const canCancel = statusLower === 'handling' || statusLower === 'queued';
        
        // Escape taskId, nsId, infraId for safe use in data attributes
        const taskIdEscaped = (task.taskId || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const nsIdEscaped = (task.nsId || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const infraIdEscaped = (task.infraId || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        const statusEscaped = (task.status || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        tasksHtml += `
          <tr style="border-bottom: 1px solid #eee; ${canCancel ? 'background-color: #f8fff8;' : ''}">
            <td style="padding: 8px; max-width: 200px;" title="${cmdEscaped}">
              <code style="font-size: 12px; background: #f4f4f4; padding: 2px 5px; border-radius: 3px;">${cmdTruncatedEscaped}</code>
            </td>
            <td style="padding: 8px; font-size: 12px;">${targetTextEscaped}</td>
            <td style="padding: 8px; text-align: center;">
              <span title="${statusEscaped}" style="font-size: 16px;">${statusIcon}</span>
              <div style="font-size: 10px; color: ${statusColor}; font-weight: bold;">${statusEscaped}</div>
            </td>
            <td style="padding: 8px; text-align: center;" title="${startedAtFull}">
              <span style="font-size: 11px; color: #666;">${startedAtText}</span>
            </td>
            <td style="padding: 8px; text-align: center;" title="${durationTooltip}">
              <span style="font-size: 12px;">${durationText}</span>
            </td>
            <td style="padding: 8px; text-align: center;">
              ${canCancel ? 
                `<button class="task-cancel-btn" data-task-id="${taskIdEscaped}" data-ns-id="${nsIdEscaped}" data-infra-id="${infraIdEscaped}"
                  style="background-color: #dc3545; color: white; border: none; padding: 4px 12px; border-radius: 3px; cursor: pointer; font-size: 12px;">
                  Cancel
                </button>` : 
                '<span style="color: #ccc; font-size: 11px;">-</span>'
              }
            </td>
          </tr>
        `;
      });
      
      tasksHtml += '</tbody></table>';
    }

    // Update the container
    const container = document.getElementById('taskListContainer');
    if (container) {
      container.innerHTML = tasksHtml;
      
      // Attach event listeners to cancel buttons (safer than inline onclick with interpolated values)
      container.querySelectorAll('.task-cancel-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          const taskId = this.dataset.taskId;
          const nsId = this.dataset.nsId;
          const infraId = this.dataset.infraId;
          cancelTaskFromModal(taskId, nsId, infraId);
        });
      });
    }

    // Update active task count in title
    const activeTasks = sortedTasks.filter(t => ['handling', 'queued'].includes((t.status || '').toLowerCase()));
    const activeCountEl = document.getElementById('taskActiveCount');
    if (activeCountEl) {
      activeCountEl.innerHTML = activeTasks.length > 0 
        ? `<span style="font-size: 14px; color: #28a745;">(${activeTasks.length} active)</span>`
        : '';
    }

    // Update last refresh time
    const lastRefreshEl = document.getElementById('taskLastRefreshTime');
    if (lastRefreshEl) {
      lastRefreshEl.textContent = `Last refresh: ${new Date().toLocaleTimeString('en-US', { hour12: false })}`;
    }

  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    const container = document.getElementById('taskListContainer');
    if (container) {
      container.innerHTML = `<p style="text-align: center; color: #dc3545;">Failed to load tasks: ${error.message}</p>`;
    }
  }
}

// Show Task Management Modal
async function showTaskManagementModal() {
  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = configNamespace;
  var infraid = getSelectedInfraId();

  if (!namespace) {
    Swal.fire({
      icon: 'info',
      title: 'Select Namespace',
      text: 'Please select a namespace first.',
      confirmButtonColor: '#3085d6'
    });
    return;
  }

  // Fetch Infra list for selector
  let infraListOptions = [];
  try {
    const infraListUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}/infra?option=id`;
    const infraRes = await axios.get(infraListUrl, {
      auth: { username: username, password: password }
    });
    if (infraRes.data.output && infraRes.data.output.length > 0) {
      infraListOptions = infraRes.data.output;
    }
  } catch (err) {
    console.error("Failed to fetch Infra list:", err);
  }

  if (infraListOptions.length === 0) {
    Swal.fire({
      icon: 'info',
      title: 'No Infra Available',
      text: 'No Infra available in this namespace. Please create an Infra first.',
      confirmButtonColor: '#3085d6'
    });
    return;
  }

  // If no Infra selected, use the first one from the list
  if (!infraid) {
    infraid = infraListOptions[0];
  }

  // Build Infra selector options HTML
  const infraOptionsHtml = infraListOptions.map(m => 
    `<option value="${m}" ${m === infraid ? 'selected' : ''}>${m}</option>`
  ).join('');

  Swal.fire({
    title: `<span>📋 Command Execution History</span> <span id="taskActiveCount"></span>`,
    html: `
      <div style="text-align: left;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <label style="font-weight: bold; margin: 0;">Infra:</label>
            <select id="taskInfraSelector" style="padding: 5px; min-width: 200px;">
              ${infraOptionsHtml}
            </select>
          </div>
          <div>
            <button id="taskRefreshNowBtn" class="btn btn-info btn-sm" style="margin-right: 5px;">🔄 Refresh Now</button>
            <button id="taskToggleAutoRefreshBtn" class="btn btn-success btn-sm">⏸️ Pause Auto-refresh</button>
          </div>
        </div>
        <div style="font-size: 11px; color: #6c757d; margin-bottom: 8px;">
          <span id="taskAutoRefreshStatus">🟢 Auto-refreshing every 3 seconds</span> | 
          <span id="taskLastRefreshTime">Last refresh: -</span>
        </div>
        <div id="taskListContainer" style="max-height: 400px; overflow-y: auto;">
          <p class="text-muted" style="text-align: center;">Loading tasks...</p>
        </div>
      </div>
    `,
    width: '1000px',
    showCancelButton: false,
    confirmButtonText: '❌ Close',
    didOpen: async () => {
      // Store context for access from modal functions
      window.currentTaskNamespace = namespace;
      window.currentTaskInfraId = infraid;
      
      // Auto-refresh setup
      window.taskAutoRefreshEnabled = true;
      window.taskAutoRefreshInterval = null;
      window.taskLastData = null; // Reset cached data
      
      // Infra selector change handler
      const infraSelector = document.getElementById('taskInfraSelector');
      if (infraSelector) {
        infraSelector.addEventListener('change', function() {
          window.currentTaskInfraId = this.value;
          window.taskLastData = null; // Force refresh on Infra change
          loadTaskListInModal(window.currentTaskNamespace, window.currentTaskInfraId);
        });
      }
      
      // Setup refresh now button event listener
      const refreshNowBtn = document.getElementById('taskRefreshNowBtn');
      if (refreshNowBtn) {
        refreshNowBtn.addEventListener('click', function() {
          window.taskLastData = null; // Force refresh
          loadTaskListInModal(window.currentTaskNamespace, window.currentTaskInfraId);
        });
      }
      
      // Setup toggle button event listener
      const toggleBtn = document.getElementById('taskToggleAutoRefreshBtn');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
          window.taskAutoRefreshEnabled = !window.taskAutoRefreshEnabled;
          
          const status = document.getElementById('taskAutoRefreshStatus');
          
          if (window.taskAutoRefreshEnabled) {
            this.innerHTML = '⏸️ Pause Auto-refresh';
            this.className = 'btn btn-success btn-sm';
            if (status) status.innerHTML = '🟢 Auto-refreshing every 3 seconds';
          } else {
            this.innerHTML = '▶️ Resume Auto-refresh';
            this.className = 'btn btn-warning btn-sm';
            if (status) status.innerHTML = '🔴 Auto-refresh paused';
          }
        });
      }
      
      // Initial load with slight delay to ensure DOM is ready
      setTimeout(() => {
        loadTaskListInModal(window.currentTaskNamespace, window.currentTaskInfraId);
      }, 100);
      
      // Clear any existing interval before creating a new one (prevent memory leaks)
      if (window.taskAutoRefreshInterval) {
        clearInterval(window.taskAutoRefreshInterval);
      }
      
      // Start auto-refresh timer (3 seconds for tasks - faster than snapshots)
      window.taskAutoRefreshInterval = setInterval(() => {
        if (window.taskAutoRefreshEnabled) {
          loadTaskListInModal(window.currentTaskNamespace, window.currentTaskInfraId);
        }
      }, 3000); // 3 seconds
    },
    willClose: () => {
      // Cleanup: clear auto-refresh timer when modal closes
      if (window.taskAutoRefreshInterval) {
        clearInterval(window.taskAutoRefreshInterval);
        window.taskAutoRefreshInterval = null;
      }
      window.taskAutoRefreshEnabled = false;
      window.taskLastData = null;
    }
  });
}
window.showTaskManagementModal = showTaskManagementModal;

// Cancel a specific task from the modal
async function cancelTaskFromModal(taskId, nsId, infraId) {
  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;

  // nsId and infraId are required (passed from task data)
  if (!nsId || !infraId || nsId === 'undefined' || infraId === 'undefined') {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'Missing namespace or Infra information for this task.',
      confirmButtonColor: '#3085d6'
    });
    return;
  }

  const url = `http://${hostname}:${port}/tumblebug/ns/${nsId}/cmd/infra/${infraId}/task/${taskId}/cancel`;

  const result = await Swal.fire({
    title: 'Cancel Task?',
    text: `Are you sure you want to cancel task "${taskId.substring(0, 20)}..."?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    cancelButtonColor: '#6c757d',
    confirmButtonText: 'Yes, cancel it!',
    cancelButtonText: 'No'
  });

  if (!result.isConfirmed) return;

  try {
    await axios.post(url, {}, {
      auth: { username: username, password: password }
    });

    // Show brief success toast
    Swal.fire({
      icon: 'success',
      title: 'Task Cancelled',
      text: 'The task has been cancelled successfully.',
      timer: 1500,
      showConfirmButton: false,
      toast: true,
      position: 'top-end'
    });
    
    // Force refresh the task list immediately
    window.taskLastData = null;
    if (window.currentTaskNamespace && window.currentTaskInfraId) {
      loadTaskListInModal(window.currentTaskNamespace, window.currentTaskInfraId);
    }

  } catch (error) {
    console.error("Failed to cancel task:", error);
    Swal.fire({
      icon: 'error',
      title: 'Failed to Cancel',
      text: error.response?.data?.message || error.message,
      toast: true,
      position: 'top-end',
      timer: 3000,
      showConfirmButton: false
    });
  }
}
window.cancelTaskFromModal = cancelTaskFromModal;

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

  // Determine initial namespace
  const currentNs = overrideNs || configNamespace || '';

  // Load namespace list
  let namespaces = [];
  try {
    const nsRes = await axios.get(`http://${hostname}:${port}/tumblebug/ns?option=id`, { auth: authConfig });
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
  const baseUrl = `http://${hostname}:${port}/tumblebug/ns/${namespace}`;
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
  const url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/template/${type}/${templateId}`;
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
    const nsRes = await axios.get(`http://${hostname}:${port}/tumblebug/ns?option=id`, { auth: authConfig });
    namespaces = nsRes.data.output || nsRes.data.ns || [];
  } catch (e) {
    console.error('Error loading namespaces:', e);
  }

  // Default target namespace: use the main panel's namespace (not the template source ns)
  const mainNs = configNamespace || sourceNs;
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
          <label style="font-size:13px;font-weight:500;">Name <span style="color:red;">*</span></label>
          <input id="tmplApplyName" class="swal2-input" placeholder="my-new-resource" value="mc-${generateInfraName()}" style="margin:4px 0;width:100%;font-size:14px;">
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
        Swal.showValidationMessage('Name is required');
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
  const targetBaseUrl = `http://${hostname}:${port}/tumblebug/ns/${targetNs}`;

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
      res = await axios.post(url, { name: formValues.name, description: formValues.description }, { auth: authConfig });
    } else {
      // Cross-namespace: GET template from source ns, then directly create in target ns
      const templateUrl = `http://${hostname}:${port}/tumblebug/ns/${sourceNs}/template/${type}/${templateId}`;
      const tmplRes = await axios.get(templateUrl, { auth: authConfig });
      const tmplData = tmplRes.data;

      // Extract the request body from template
      const reqBody = tmplData[typeMeta.bodyFieldName];
      if (!reqBody) {
        throw new Error(`Template does not contain '${typeMeta.bodyFieldName}' field`);
      }

      // Apply name and description overrides
      reqBody.name = formValues.name;
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
  const url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/template/${type}/${templateId}`;

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
  const url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/template/${type}`;

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
  const url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/template/infra`;

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
  const url = `http://${hostname}:${port}/tumblebug/ns/${namespace}/template/infra/${templateId}`;

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

  // Populate nodeGroupRequestFromSpecList and recommendedSpecList (mirrors copyInfraConfig logic)
  // Fetch spec details for each nodeGroup in parallel via specId
  const specFetches = infraReq.nodeGroups.map(function(sg) {
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
    if (sg.specId) {
      const specUrl = `http://${hostname}:${port}/tumblebug/ns/system/resources/spec/${sg.specId}`;
      return axios.get(specUrl, { auth: { username, password } })
        .then(function(specRes) {
          const s = specRes.data;
          return {
            id:                  sg.specId,
            providerName:        s.providerName         || extractProviderFromSpecId(sg.specId),
            regionName:          s.regionName           || extractRegionFromSpecId(sg.specId),
            cspSpecName:         s.cspSpecName          || sg.specId,
            vCPU:                s.vCPU                 ?? 'N/A',
            memoryGiB:           s.memoryGiB            ?? 'N/A',
            costPerHour:         s.costPerHour          || 0,
            acceleratorType:     s.acceleratorType      || '',
            acceleratorModel:    s.acceleratorModel     || '',
            acceleratorCount:    s.acceleratorCount     || 0,
            acceleratorMemoryGB: s.acceleratorMemoryGB  || '',
            connectionName:      sg.connectionName      || '',
            rootDiskType:        sg.rootDiskType        || 'default'
          };
        })
        .catch(function() {
          // Fallback to parsed values if spec fetch fails
          return {
            id:                  sg.specId,
            providerName:        extractProviderFromSpecId(sg.specId),
            regionName:          extractRegionFromSpecId(sg.specId),
            cspSpecName:         sg.specId,
            vCPU:                'N/A',
            memoryGiB:           'N/A',
            costPerHour:         0,
            acceleratorType:     '',
            acceleratorModel:    '',
            acceleratorCount:    0,
            acceleratorMemoryGB: '',
            connectionName:      sg.connectionName || '',
            rootDiskType:        sg.rootDiskType   || 'default'
          };
        });
    } else {
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
        rootDiskType:        sg.rootDiskType   || 'default'
      });
    }
  });

  // Wait for all spec fetches, then render
  try {
    const specInfoList = await Promise.all(specFetches);
    specInfoList.forEach(function(specInfo) {
      recommendedSpecList.push(specInfo);
    });
    updateNodeGroupReview();

    // Switch to Provision tab
    var provisionTab = document.getElementById('provision-tab');
    if (provisionTab) provisionTab.click();

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

// =====================================================================
// Global DNS Management (Route53)
// =====================================================================

async function showDnsManagementModal(preselectedInfraId) {
  const config = getConfig();
  const namespace = configNamespace || 'default';

  // Build Infra source section - if preselectedInfraId, pre-fill it
  const infraSourceChecked = preselectedInfraId ? 'checked' : '';
  const ipsSourceChecked = preselectedInfraId ? '' : 'checked';
  const infraIdValue = preselectedInfraId || '';

  // Load hosted zones dynamically
  let hostedZoneOptions = '<option value="">Loading...</option>';
  let hostedZoneWarning = '';
  try {
    const hzResp = await axios.get(`http://${config.hostname}:${config.port}/tumblebug/resources/globalDns/hostedZone`, {
      auth: { username: config.username, password: config.password }, timeout: 15000
    });
    const zones = hzResp.data?.hostedZones || [];
    if (zones.length > 0) {
      hostedZoneOptions = zones.map(z => {
        const name = z.name.replace(/\.$/, '');
        const safeName = window.escapeHtml(name);
        return `<option value="${safeName}">${safeName} (${z.recordCount} records)</option>`;
      }).join('');
    } else {
      hostedZoneOptions = '<option value="">(No hosted zones)</option>';
      hostedZoneWarning = '<div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 10px; margin-bottom: 12px; font-size: 11px; color: #856404;">'
        + '<b>⚠️ No hosted zones found.</b><br>'
        + 'AWS credentials are configured, but no Route53 hosted zones exist.<br>'
        + 'To use this feature, create a hosted zone in <a href="https://console.aws.amazon.com/route53/v2/hostedzones" target="_blank" style="color: #533f03;">AWS Route53 Console</a>.'
        + '</div>';
    }
  } catch (e) {
    const errMsg = e.response?.data?.message || e.message || '';
    hostedZoneOptions = '<option value="">(Unavailable)</option>';
    if (errMsg.includes('VAULT_TOKEN') || errMsg.includes('OpenBao') || errMsg.includes('secret')) {
      hostedZoneWarning = '<div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 6px; padding: 10px; margin-bottom: 12px; font-size: 11px; color: #721c24;">'
        + '<b>🔑 AWS credentials not configured.</b><br>'
        + 'This feature requires AWS credentials stored in OpenBao (Vault).<br>'
        + '<b>Setup:</b> Store <code>AWS_ACCESS_KEY_ID</code>, <code>AWS_SECRET_ACCESS_KEY</code>, <code>AWS_DEFAULT_REGION</code> at <code>secret/csp/aws</code> in OpenBao, and set <code>VAULT_TOKEN</code> env variable.'
        + '</div>';
    } else {
      hostedZoneWarning = '<div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 6px; padding: 10px; margin-bottom: 12px; font-size: 11px; color: #721c24;">'
        + '<b>❌ Failed to load hosted zones.</b><br>'
        + (errMsg ? window.escapeHtml(errMsg) : 'Could not connect to the server or an unexpected error occurred.')
        + '</div>';
    }
  }

  const html = `
    <div style="text-align: left; font-size: 14px;">
      ${hostedZoneWarning}
      <!-- Hosted Zone Selector -->
      <div style="margin-bottom: 12px;">
        <label style="font-size: 12px; color: #6c757d; font-weight: bold;">Hosted Zone (Domain)</label>
        <select id="dns-hosted-zone" class="swal2-input" style="margin: 4px 0; font-size: 13px; height: 40px; width: 100%;">
          ${hostedZoneOptions}
        </select>
      </div>

      <!-- Query Section -->
      <div style="background: #f8f9fa; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
        <h6 style="margin: 0 0 10px 0; color: #495057;">🔍 Query DNS Records</h6>
        <div style="display: flex; gap: 8px; align-items: end;">
          <div style="flex: 1;">
            <label style="font-size: 12px; color: #6c757d;">Record Name (optional)</label>
            <input type="text" id="dns-query-record" class="swal2-input" style="margin: 4px 0; font-size: 13px;" placeholder="subdomain">
          </div>
          <div>
            <button id="dns-query-btn" class="btn btn-primary" style="height: 40px; white-space: nowrap;">Query</button>
          </div>
        </div>
        <div id="dns-query-result" style="margin-top: 10px; display: none; max-height: 300px; overflow-y: auto;">
        </div>
      </div>

      <!-- Upsert Section -->
      <div style="background: #f0f8ff; border-radius: 8px; padding: 15px;">
        <h6 style="margin: 0 0 10px 0; color: #495057;">✏️ Create / Update DNS Record (UPSERT)</h6>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <label style="font-size: 12px; color: #6c757d;">Record Name</label>
            <input type="text" id="dns-upsert-record" class="swal2-input" style="margin: 4px 0; font-size: 13px;" placeholder="subdomain (auto-appended to domain)">
          </div>
          <div>
            <label style="font-size: 12px; color: #6c757d;">Record Type</label>
            <select id="dns-upsert-type" class="swal2-input" style="margin: 4px 0; font-size: 13px; height: 40px;">
              <option value="A">A</option>
              <option value="AAAA">AAAA</option>
              <option value="CNAME">CNAME</option>
              <option value="TXT">TXT</option>
            </select>
          </div>
          <div>
            <label style="font-size: 12px; color: #6c757d;">TTL (seconds)</label>
            <input type="number" id="dns-upsert-ttl" class="swal2-input" style="margin: 4px 0; font-size: 13px;" value="300" min="1">
          </div>
          <div>
            <label style="font-size: 12px; color: #6c757d;">Routing Policy</label>
            <select id="dns-routing-policy" class="swal2-input" style="margin: 4px 0; font-size: 13px; height: 40px;">
              <option value="simple">Simple (all IPs returned)</option>
              <option value="geoproximity">Geoproximity (nearest server)</option>
            </select>
          </div>
        </div>

        <div id="dns-geoproxy-info" style="display: none; margin-top: 8px; padding: 8px; background: #e8f4f8; border-radius: 4px; font-size: 12px; color: #0c5460;">
          ℹ️ <strong>Geoproximity</strong>: Each Node gets its own record with lat/lng coordinates. Route53 routes users to the nearest server. Infra source required (Node location data needed).
        </div>

        <div style="margin-top: 12px;">
          <label style="font-size: 12px; color: #6c757d; font-weight: bold;">IP Source (choose one):</label>
          
          <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 8px;">
            <!-- Method 1: Infra + optional Label filter -->
            <div style="background: white; border: 1px solid #dee2e6; border-radius: 6px; padding: 10px;">
              <label style="font-size: 13px; cursor: pointer;">
                <input type="radio" name="dns-ip-source" value="infra" ${infraSourceChecked} style="margin-right: 6px;">
                <strong>Infra</strong> — Collect Public IPs from Nodes in Infra
              </label>
              <div id="dns-source-infra-fields" style="margin-top: 6px; display: ${preselectedInfraId ? 'block' : 'none'};">
                <div style="display: flex; gap: 8px; align-items: center;">
                  <div style="flex: 1;">
                    <label style="font-size: 11px; color: #888;">Namespace</label>
                    <input type="text" id="dns-infra-nsid" class="swal2-input" style="margin: 2px 0; font-size: 12px;" placeholder="Namespace" value="${namespace}">
                  </div>
                  <div style="flex: 1;">
                    <label style="font-size: 11px; color: #888;">Infra</label>
                    <select id="dns-infra-id" class="swal2-input" style="margin: 2px 0; font-size: 12px; height: 38px;">
                      <option value="">Loading...</option>
                    </select>
                  </div>
                </div>
                <!-- Optional Label Filter -->
                <div style="margin-top: 10px; border-top: 1px dashed #dee2e6; padding-top: 8px;">
                  <div style="font-size: 11px; color: #495057; margin-bottom: 6px;">🏷️ <strong>Label Filter</strong> <span style="color: #888;">(optional — narrow down Nodes by labels)</span></div>
                  <div id="selectedLabelsDisplay" style="min-height: 28px; padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px;
                       background: white; margin-bottom: 6px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px;">
                    <span id="labelPlaceholder" style="color: #999; font-size: 11px;">No filter — all Nodes in Infra will be used</span>
                  </div>
                  <input type="hidden" id="labelSelector" value="">
                  <div style="margin-bottom: 6px;">
                    <button type="button" id="clearLabelSelector"
                      style="padding: 3px 8px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 10px;">
                      Clear All
                    </button>
                  </div>
                  <div style="font-size: 11px; color: #666; margin-bottom: 4px;"><strong>Available Labels</strong> (click to add/remove)</div>
                  <div id="availableLabelsContainer" style="padding: 8px; background: #f8f9fa; border-radius: 4px; min-height: 36px;">
                    <span style="color: #999; font-size: 11px;">Select an Infra to see available labels...</span>
                  </div>
                  <div id="labelMatchPreview" style="margin-top: 6px; padding: 6px; background: #e7f3ff; border-radius: 4px; display: none;">
                    <span style="font-size: 11px; color: #0066cc;">
                      <strong>Matching Nodes:</strong> <span id="matchingNodeCount">0</span> / <span id="totalNodeCount">0</span>
                    </span>
                    <div id="matchingVmList" style="margin-top: 4px; font-size: 10px; color: #666; max-height: 50px; overflow-y: auto;"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Method 2: Manual IPs -->
            <div id="dns-source-ips-container" style="background: white; border: 1px solid #dee2e6; border-radius: 6px; padding: 10px;">
              <label style="font-size: 13px; cursor: pointer;">
                <input type="radio" name="dns-ip-source" value="ips" ${ipsSourceChecked} style="margin-right: 6px;">
                <strong>Manual IPs</strong> — Enter IP addresses directly
              </label>
              <div id="dns-source-ips-fields" style="margin-top: 6px; display: ${preselectedInfraId ? 'none' : 'block'};">
                <input type="text" id="dns-manual-ips" class="swal2-input" style="margin: 2px 0; font-size: 12px;" placeholder="1.2.3.4, 5.6.7.8 (comma-separated)">
              </div>
            </div>
          </div>
        </div>

        <div style="margin-top: 12px; text-align: right;">
          <button id="dns-upsert-btn" class="btn btn-success" style="padding: 8px 24px;">
            Update DNS Record
          </button>
        </div>
        <div id="dns-upsert-result" style="margin-top: 10px; display: none;"></div>
      </div>
    </div>
  `;

  Swal.fire({
    title: '🌐 Global DNS Management (Route53)',
    html: html,
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '❌ Close',
    width: '780px',
    customClass: {
      popup: 'swal2-infra-context'
    },
    didOpen: () => {
      // Routing policy toggle
      const policySelect = document.getElementById('dns-routing-policy');
      const geoInfo = document.getElementById('dns-geoproxy-info');
      const ipsContainer = document.getElementById('dns-source-ips-container');

      policySelect.addEventListener('change', function() {
        const isGeo = this.value === 'geoproximity';
        geoInfo.style.display = isGeo ? 'block' : 'none';
        ipsContainer.style.opacity = isGeo ? '0.5' : '1';
        if (isGeo) {
          const ipsRadio = document.querySelector('input[name="dns-ip-source"][value="ips"]');
          if (ipsRadio.checked) {
            const infraRadio = document.querySelector('input[name="dns-ip-source"][value="infra"]');
            infraRadio.checked = true;
            infraRadio.dispatchEvent(new Event('change'));
          }
          ipsRadio.disabled = true;
        } else {
          document.querySelector('input[name="dns-ip-source"][value="ips"]').disabled = false;
        }
      });

      // Radio button toggle for IP source fields
      document.querySelectorAll('input[name="dns-ip-source"]').forEach(radio => {
        radio.addEventListener('change', function() {
          document.getElementById('dns-source-infra-fields').style.display = this.value === 'infra' ? 'block' : 'none';
          document.getElementById('dns-source-ips-fields').style.display = this.value === 'ips' ? 'block' : 'none';
        });
      });

      // When Infra dropdown changes, fetch Node data and update available labels
      document.getElementById('dns-infra-id').addEventListener('change', async function() {
        var infraId = this.value;
        var labelContainer = document.getElementById('availableLabelsContainer');
        var preview = document.getElementById('labelMatchPreview');
        // Clear label state
        var labelInput = document.getElementById('labelSelector');
        if (labelInput) labelInput.value = '';
        if (window.updateSelectedLabelsDisplay) window.updateSelectedLabelsDisplay();
        if (preview) preview.style.display = 'none';

        if (!infraId) {
          if (labelContainer) labelContainer.innerHTML = '<span style="color: #999; font-size: 11px;">Select an Infra to see available labels...</span>';
          return;
        }
        // Always fetch fresh Infra detail (cached data may lack Node labels)
        if (labelContainer) labelContainer.innerHTML = '<span style="color: #999; font-size: 11px;"><i class="fas fa-spinner fa-spin"></i> Loading labels...</span>';
        try {
          var nsId = document.getElementById('dns-infra-nsid').value.trim();
          var infraDetailUrl = 'http://' + config.hostname + ':' + config.port + '/tumblebug/ns/' + nsId + '/infra/' + infraId;
          var resp = await axios.get(infraDetailUrl, { auth: { username: config.username, password: config.password }, timeout: 15000 });
          var infraDetail = resp.data;
          if (infraDetail && infraDetail.node) {
            if (!window.cloudBaristaCentralData) window.cloudBaristaCentralData = {};
            if (!window.cloudBaristaCentralData.infraData) window.cloudBaristaCentralData.infraData = [];
            window.cloudBaristaCentralData.infraData = window.cloudBaristaCentralData.infraData.filter(function(m) { return m.id !== infraId; });
            window.cloudBaristaCentralData.infraData.push(infraDetail);
          }
        } catch (e) {
          console.error('[DNS] Failed to fetch Infra detail for labels:', e);
          if (labelContainer) labelContainer.innerHTML = '<span style="color: #dc3545; font-size: 11px;">Failed to load labels</span>';
        }
        if (window.updateAvailableLabels) {
          window.updateAvailableLabels(infraId);
          if (window.setupClearLabelButtonListener) window.setupClearLabelButtonListener();
          if (window.setupSelectedLabelsEventListeners) window.setupSelectedLabelsEventListeners();
        }
      });

      // Helper: Load Infra list into a <select> element
      async function loadInfraList(nsId, selectEl, preselect) {
        selectEl.innerHTML = '<option value="">Loading...</option>';
        if (!nsId) { selectEl.innerHTML = '<option value="">(No namespace)</option>'; return; }
        try {
          var infraUrl = 'http://' + config.hostname + ':' + config.port + '/tumblebug/ns/' + nsId + '/infra?option=id';
          const infraResp = await axios.get(infraUrl, {
            auth: { username: config.username, password: config.password }, timeout: 15000
          });
          const infraList = infraResp.data?.output || [];
          if (infraList.length === 0) {
            selectEl.innerHTML = '<option value="">(No Infras found)</option>';
            return;
          }
          selectEl.innerHTML = '';
          infraList.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            if (m === preselect) opt.selected = true;
            selectEl.appendChild(opt);
          });
        } catch (e) {
          selectEl.innerHTML = '<option value="">(Failed to load)</option>';
        }
      }

      // Initialize Infra dropdown and auto-load labels
      const infraSelect = document.getElementById('dns-infra-id');
      loadInfraList(namespace, infraSelect, infraIdValue).then(function() {
        if (infraSelect.value) {
          infraSelect.dispatchEvent(new Event('change'));
        }
      });

      // Reload Infra list when namespace changes
      const nsInput = document.getElementById('dns-infra-nsid');
      if (nsInput) {
        nsInput.addEventListener('change', function() {
          loadInfraList(this.value, infraSelect, '').then(function() {
            if (infraSelect.value) infraSelect.dispatchEvent(new Event('change'));
          });
        });
      }

      // Query button handler
      document.getElementById('dns-query-btn').addEventListener('click', async function() {
        const domain = document.getElementById('dns-hosted-zone').value;
        if (!domain) {
          document.getElementById('dns-query-result').style.display = 'block';
          document.getElementById('dns-query-result').innerHTML = '<div style="color: red;">Please select a hosted zone first.</div>';
          return;
        }
        const recordName = document.getElementById('dns-query-record').value.trim();
        const resultDiv = document.getElementById('dns-query-result');
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<div style="color: #6c757d;"><i class="fas fa-spinner fa-spin"></i> Querying...</div>';

        try {
          let url = `http://${config.hostname}:${config.port}/tumblebug/resources/globalDns/record?domainName=${encodeURIComponent(domain)}`;
          if (recordName) url += `&recordName=${encodeURIComponent(recordName)}`;
          const resp = await axios.get(url, { auth: { username: config.username, password: config.password }, timeout: 30000 });
          const records = resp.data?.record || [];
          if (records.length === 0) {
            resultDiv.innerHTML = '<div style="color: #6c757d;">No records found.</div>';
          } else {
            // Count deletable records (not NS/SOA)
            const deletableRecords = records.filter(r => r.type !== 'NS' && r.type !== 'SOA');
            let bulkBar = '';
            if (deletableRecords.length > 1) {
              bulkBar = `<div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                <label style="font-size: 11px; cursor: pointer; user-select: none;">
                  <input type="checkbox" id="dns-select-all" style="margin-right: 4px;">Select All
                </label>
                <span id="dns-selected-count" style="font-size: 11px; color: #6c757d;">0 selected</span>
                <button id="dns-bulk-delete-btn" class="btn btn-sm btn-danger" style="padding: 2px 10px; font-size: 11px; margin-left: auto;" disabled>
                  🗑️ Delete Selected
                </button>
              </div>`;
            }

            let tableHtml = '<table style="width: 100%; font-size: 11px; border-collapse: collapse;">';
            tableHtml += '<tr style="background: #e9ecef;"><th style="padding: 5px; border: 1px solid #dee2e6; width: 24px;"></th><th style="padding: 5px; border: 1px solid #dee2e6;">Name</th><th style="padding: 5px; border: 1px solid #dee2e6;">Type</th><th style="padding: 5px; border: 1px solid #dee2e6;">TTL</th><th style="padding: 5px; border: 1px solid #dee2e6;">Values</th><th style="padding: 5px; border: 1px solid #dee2e6;">Policy</th><th style="padding: 5px; border: 1px solid #dee2e6;">Actions</th></tr>';
            records.forEach((r, idx) => {
              const esc = window.escapeHtml;
              const policyBadge = r.routingPolicy === 'geoproximity'
                ? `<span style="background: #17a2b8; color: white; padding: 1px 5px; border-radius: 3px; font-size: 10px;">geo</span> ${esc(r.geoLatitude || '')},${esc(r.geoLongitude || '')}`
                : `<span style="background: #6c757d; color: white; padding: 1px 5px; border-radius: 3px; font-size: 10px;">${esc(r.routingPolicy || 'simple')}</span>`;
              const setIdInfo = r.setIdentifier ? `<br><span style="color: #888; font-size: 10px;">id: ${esc(r.setIdentifier)}</span>` : '';
              const isDeletable = r.type !== 'NS' && r.type !== 'SOA';
              const checkbox = isDeletable
                ? `<input type="checkbox" class="dns-row-check" data-idx="${idx}" data-name="${esc(r.name)}" data-type="${esc(r.type)}" data-setid="${esc(r.setIdentifier || '')}">`
                : '';
              const deleteBtn = isDeletable
                ? `<button class="btn btn-sm btn-outline-danger dns-delete-btn" data-name="${esc(r.name)}" data-type="${esc(r.type)}" data-setid="${esc(r.setIdentifier || '')}" style="padding: 1px 6px; font-size: 11px;">🗑️</button>`
                : '';
              tableHtml += `<tr>
                <td style="padding: 5px; border: 1px solid #dee2e6; text-align: center;">${checkbox}</td>
                <td style="padding: 5px; border: 1px solid #dee2e6; word-break: break-all;">${esc(r.name)}${setIdInfo}</td>
                <td style="padding: 5px; border: 1px solid #dee2e6;">${esc(r.type)}</td>
                <td style="padding: 5px; border: 1px solid #dee2e6;">${r.ttl}</td>
                <td style="padding: 5px; border: 1px solid #dee2e6; word-break: break-all;">${(r.values || []).map(v => esc(v)).join(', ')}</td>
                <td style="padding: 5px; border: 1px solid #dee2e6;">${policyBadge}</td>
                <td style="padding: 5px; border: 1px solid #dee2e6; text-align: center;">${deleteBtn}</td>
              </tr>`;
            });
            tableHtml += '</table>';
            resultDiv.innerHTML = bulkBar + tableHtml;

            // Helper: update selected count and bulk button state
            function updateBulkState() {
              const checked = resultDiv.querySelectorAll('.dns-row-check:checked');
              const countSpan = document.getElementById('dns-selected-count');
              const bulkBtn = document.getElementById('dns-bulk-delete-btn');
              if (countSpan) countSpan.textContent = checked.length + ' selected';
              if (bulkBtn) bulkBtn.disabled = checked.length === 0;
              // Sync "select all" checkbox
              const selectAll = document.getElementById('dns-select-all');
              const allChecks = resultDiv.querySelectorAll('.dns-row-check');
              if (selectAll && allChecks.length > 0) {
                selectAll.checked = checked.length === allChecks.length;
                selectAll.indeterminate = checked.length > 0 && checked.length < allChecks.length;
              }
            }

            // Select all checkbox
            const selectAllEl = document.getElementById('dns-select-all');
            if (selectAllEl) {
              selectAllEl.addEventListener('change', function() {
                resultDiv.querySelectorAll('.dns-row-check').forEach(cb => { cb.checked = this.checked; });
                updateBulkState();
              });
            }

            // Individual checkbox change
            resultDiv.querySelectorAll('.dns-row-check').forEach(cb => {
              cb.addEventListener('change', updateBulkState);
            });

            // Bulk delete button
            const bulkDeleteBtn = document.getElementById('dns-bulk-delete-btn');
            if (bulkDeleteBtn) {
              bulkDeleteBtn.addEventListener('click', async function() {
                const checked = resultDiv.querySelectorAll('.dns-row-check:checked');
                if (checked.length === 0) return;

                const items = [];
                checked.forEach(cb => {
                  items.push({ name: cb.dataset.name, type: cb.dataset.type, setId: cb.dataset.setid });
                });

                const confirmed = await Swal.fire({
                  title: 'Bulk Delete',
                  html: `Delete <strong>${items.length}</strong> selected record(s)?`,
                  icon: 'warning',
                  showCancelButton: true,
                  confirmButtonColor: '#d33',
                  confirmButtonText: 'Delete All'
                });
                if (!confirmed.isConfirmed) return;

                bulkDeleteBtn.disabled = true;
                bulkDeleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';

                try {
                  const records = items.map(item => {
                    const rec = { domainName: domain, recordName: item.name.replace(/\.$/, ''), recordType: item.type };
                    if (item.setId) rec.setIdentifier = item.setId;
                    return rec;
                  });

                  const resp = await axios.delete(`http://${config.hostname}:${config.port}/tumblebug/resources/globalDns/records`, {
                    data: { records },
                    auth: { username: config.username, password: config.password },
                    timeout: 60000
                  });

                  const data = resp.data;
                  if (data.failed === 0) {
                    Swal.fire({ icon: 'success', title: 'Bulk Delete Complete', text: `${data.succeeded} record(s) deleted successfully.`, timer: 2000, showConfirmButton: false });
                  } else {
                    const failedItems = (data.results || []).filter(r => !r.success).map(r => window.escapeHtml(r.message || 'Unknown error'));
                    Swal.fire({ icon: 'warning', title: 'Partial Delete', html: `<p>${data.succeeded} succeeded, ${data.failed} failed.</p><p style="font-size:12px;color:#dc3545;">${failedItems.join('<br>')}</p>` });
                  }
                } catch (e) {
                  Swal.fire({ icon: 'error', title: 'Bulk Delete Failed', text: e.response?.data?.message || e.message });
                }
                setTimeout(() => showDnsManagementModal(preselectedInfraId), 2100);
              });
            }

            // Attach delete handlers
            resultDiv.querySelectorAll('.dns-delete-btn').forEach(btn => {
              btn.addEventListener('click', async function() {
                const recName = this.dataset.name.replace(/\.$/, '');
                const recType = this.dataset.type;
                const setId = this.dataset.setid;
                const confirmMsg = setId
                  ? `Delete record "${recName}" (${recType}, id: ${setId})?`
                  : `Delete ALL "${recName}" (${recType}) records?`;

                const confirmed = await Swal.fire({
                  title: 'Confirm Delete',
                  text: confirmMsg,
                  icon: 'warning',
                  showCancelButton: true,
                  confirmButtonColor: '#d33',
                  confirmButtonText: 'Delete'
                });
                if (!confirmed.isConfirmed) return;

                try {
                  const delBody = { domainName: domain, recordName: recName, recordType: recType };
                  if (setId) delBody.setIdentifier = setId;
                  await axios.delete(`http://${config.hostname}:${config.port}/tumblebug/resources/globalDns/record`, {
                    data: delBody,
                    auth: { username: config.username, password: config.password },
                    timeout: 30000
                  });
                  Swal.fire({ icon: 'success', title: 'Deleted', text: 'Record deleted successfully.', timer: 2000, showConfirmButton: false });
                  // Re-open the DNS modal to refresh
                  setTimeout(() => showDnsManagementModal(preselectedInfraId), 2100);
                } catch (err) {
                  Swal.fire({ icon: 'error', title: 'Delete Failed', text: err.response?.data?.message || err.message });
                }
              });
            });
          }
        } catch (err) {
          resultDiv.innerHTML = `<div style="color: red;">Error: ${window.escapeHtml(err.response?.data?.message || err.message)}</div>`;
        }
      });

      // Upsert button handler
      document.getElementById('dns-upsert-btn').addEventListener('click', async function() {
        const domain = document.getElementById('dns-hosted-zone').value;
        if (!domain) {
          Swal.showValidationMessage('Please select a hosted zone first.');
          return;
        }
        const recordName = document.getElementById('dns-upsert-record').value.trim();
        const recordType = document.getElementById('dns-upsert-type').value;
        const ttl = parseInt(document.getElementById('dns-upsert-ttl').value) || 300;
        const routingPolicy = document.getElementById('dns-routing-policy').value;
        const source = document.querySelector('input[name="dns-ip-source"]:checked')?.value;

        if (routingPolicy === 'geoproximity' && source === 'ips') {
          Swal.showValidationMessage('Geoproximity routing requires Infra or Label source (for Node location data).');
          return;
        }

        const body = {
          domainName: domain,
          recordName: recordName || domain,
          recordType: recordType,
          ttl: ttl,
          routingPolicy: routingPolicy,
          setBy: {}
        };

        if (source === 'infra') {
          const nsId = document.getElementById('dns-infra-nsid').value.trim();
          const infraId = document.getElementById('dns-infra-id').value;
          if (!nsId || !infraId) {
            Swal.showValidationMessage('Namespace and Infra are required.');
            return;
          }
          // If label filter is set, use label source; otherwise use infra source
          const labelSelector = document.getElementById('labelSelector').value.trim();
          if (labelSelector) {
            // Prepend sys.infraId to scope label query within the selected Infra
            const scopedSelector = 'sys.infraId=' + infraId + ',' + labelSelector;
            body.setBy.label = { nsId, labelSelector: scopedSelector };
          } else {
            body.setBy.infra = { nsId, infraId };
          }
        } else {
          const ipsStr = document.getElementById('dns-manual-ips').value.trim();
          if (!ipsStr) {
            Swal.showValidationMessage('At least one IP address is required.');
            return;
          }
          body.setBy.ips = ipsStr.split(',').map(ip => ip.trim()).filter(ip => ip);
        }

        const resultDiv = document.getElementById('dns-upsert-result');
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<div style="color: #6c757d;"><i class="fas fa-spinner fa-spin"></i> Updating DNS record...</div>';
        this.disabled = true;

        try {
          const url = `http://${config.hostname}:${config.port}/tumblebug/resources/globalDns/record`;
          const resp = await axios.put(url, body, { auth: { username: config.username, password: config.password }, timeout: 60000 });

          // After success, query the updated records to show detailed result
          resultDiv.innerHTML = '<div style="color: #6c757d;"><i class="fas fa-spinner fa-spin"></i> Record updated. Fetching results...</div>';
          try {
            await new Promise(resolve => setTimeout(resolve, 500)); // brief delay for Route53 consistency
            let queryUrl = `http://${config.hostname}:${config.port}/tumblebug/resources/globalDns/record?domainName=${encodeURIComponent(domain)}`;
            if (recordName) queryUrl += `&recordName=${encodeURIComponent(recordName)}`;
            console.log('[DNS] Auto-query URL:', queryUrl);
            const qResp = await axios.get(queryUrl, { auth: { username: config.username, password: config.password }, timeout: 30000 });
            console.log('[DNS] Auto-query response:', JSON.stringify(qResp.data).substring(0, 500));
            const records = (qResp.data?.record || []).filter(r => r.type !== 'NS' && r.type !== 'SOA');
            console.log('[DNS] Filtered records count:', records.length);
            if (records.length > 0) {
              let html = '<div style="color: green; font-weight: bold; margin-bottom: 8px;">✅ DNS record updated successfully.</div>';
              html += '<div style="font-size: 11px; color: #495057; margin-bottom: 4px;">📋 Current records for <b>' + (recordName ? recordName + '.' + domain : domain) + '</b>:</div>';
              html += '<table style="width: 100%; font-size: 11px; border-collapse: collapse;">';
              html += '<tr style="background: #d4edda;"><th style="padding: 5px; border: 1px solid #c3e6cb;">Name</th><th style="padding: 5px; border: 1px solid #c3e6cb;">Type</th><th style="padding: 5px; border: 1px solid #c3e6cb;">TTL</th><th style="padding: 5px; border: 1px solid #c3e6cb;">Values</th><th style="padding: 5px; border: 1px solid #c3e6cb;">Policy</th></tr>';
              records.forEach(r => {
                const esc = window.escapeHtml;
                const policyBadge = r.routingPolicy === 'geoproximity'
                  ? `<span style="background: #17a2b8; color: white; padding: 1px 5px; border-radius: 3px; font-size: 10px;">geo</span> ${esc(r.geoLatitude || '')},${esc(r.geoLongitude || '')}`
                  : `<span style="background: #6c757d; color: white; padding: 1px 5px; border-radius: 3px; font-size: 10px;">${esc(r.routingPolicy || 'simple')}</span>`;
                const setIdInfo = r.setIdentifier ? `<br><span style="color: #888; font-size: 10px;">id: ${esc(r.setIdentifier)}</span>` : '';
                html += `<tr>
                  <td style="padding: 5px; border: 1px solid #c3e6cb; word-break: break-all;">${esc(r.name)}${setIdInfo}</td>
                  <td style="padding: 5px; border: 1px solid #c3e6cb;">${esc(r.type)}</td>
                  <td style="padding: 5px; border: 1px solid #c3e6cb;">${r.ttl}</td>
                  <td style="padding: 5px; border: 1px solid #c3e6cb; word-break: break-all;">${(r.values || []).map(v => esc(v)).join(', ')}</td>
                  <td style="padding: 5px; border: 1px solid #c3e6cb;">${policyBadge}</td>
                </tr>`;
              });
              html += '</table>';
              resultDiv.innerHTML = html;
            } else {
              resultDiv.innerHTML = `<div style="color: green; font-weight: bold;">✅ ${resp.data?.message || 'DNS record updated successfully.'}</div>`;
            }
          } catch (qErr) {
            // Query failed but upsert succeeded
            console.warn('[DNS] Auto-query after upsert failed:', qErr);
            resultDiv.innerHTML = `<div style="color: green; font-weight: bold;">✅ ${resp.data?.message || 'DNS record updated successfully.'}</div>`;
          }
        } catch (err) {
          resultDiv.innerHTML = `<div style="color: red;">❌ Error: ${window.escapeHtml(err.response?.data?.message || err.message)}</div>`;
        } finally {
          this.disabled = false;
        }
      });
    }
  });
}
window.showDnsManagementModal = showDnsManagementModal;
