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
// Deployment-provided parameter defaults (MAPUI_PARAM_* envs -> docker-entrypoint.sh)
import runtimeParams from "../../runtime-params.json";
window.RUNTIME_PARAM_DEFAULTS = runtimeParams || {};

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

import { cspIconImg } from './gis-styling.js';

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
window.iconStyleCircle = iconStyleCircle;

var cspIconMode = 'logo';
window.cspIconMode = cspIconMode;

const getCspStyle = (...args) => window.getCspStyle ? window.getCspStyle(...args) : null;
const getSelectedProviders = () => window.getSelectedProviders ? window.getSelectedProviders() : [];
const getNodeStatusColor = (...args) => window.getNodeStatusColor ? window.getNodeStatusColor(...args) : { fill: '#9ca3af', stroke: '#6b7280' };
const getK8sStatusColor = (...args) => window.getK8sStatusColor ? window.getK8sStatusColor(...args) : { fill: '#9ca3af', stroke: '#6b7280' };
const createNodeStyleWithStatusBadge = (...args) => window.createNodeStyleWithStatusBadge ? window.createNodeStyleWithStatusBadge(...args) : [];
const splitInfraNameToLines = (...args) => window.splitInfraNameToLines ? window.splitInfraNameToLines(...args) : [''];
const splitK8sNameToLines = (...args) => window.splitK8sNameToLines ? window.splitK8sNameToLines(...args) : [''];
const changeSizeByName = (...args) => window.changeSizeByName ? window.changeSizeByName(...args) : 1;
const changeSizeStatus = (...args) => window.changeSizeStatus ? window.changeSizeStatus(...args) : 1;
const hexToRgb = (...args) => window.hexToRgb ? window.hexToRgb(...args) : [100, 100, 100];
const isTombstoneResource = (...args) => window.isTombstoneResource ? window.isTombstoneResource(...args) : false;
const updateTombstoneBanner = (...args) => window.updateTombstoneBanner && window.updateTombstoneBanner(...args);
const checkConnectionWithRetry = (...args) => window.checkConnectionWithRetry && window.checkConnectionWithRetry(...args);
const updateCredentialHolderList = (...args) => window.updateCredentialHolderList && window.updateCredentialHolderList(...args);
const updateNsList = (...args) => window.updateNsList && window.updateNsList(...args);
const loadK8sClusterData = (...args) => window.loadK8sClusterData && window.loadK8sClusterData(...args);
const loadNlbData = (...args) => window.loadNlbData && window.loadNlbData(...args);
const loadVpnDataFromInfras = (...args) => window.loadVpnDataFromInfras && window.loadVpnDataFromInfras(...args);
const applyNamespace = (...args) => window.applyNamespace && window.applyNamespace(...args);
const applyCredentialHolder = (...args) => window.applyCredentialHolder && window.applyCredentialHolder(...args);
const showActionsMenu = (...args) => window.showActionsMenu && window.showActionsMenu(...args);
const executeAction = (...args) => window.executeAction && window.executeAction(...args);
const downloadAllSshKeys = (...args) => window.downloadAllSshKeys && window.downloadAllSshKeys(...args);
const scaleOutInfraFromContext = (...args) => window.scaleOutInfraFromContext && window.scaleOutInfraFromContext(...args);
const copyInfraConfig = (...args) => window.copyInfraConfig && window.copyInfraConfig(...args);
const saveInfraAsTemplate = (...args) => window.saveInfraAsTemplate && window.saveInfraAsTemplate(...args);
const manageNLB = (...args) => window.manageNLB && window.manageNLB(...args);
const manageMCNLB = (...args) => window.manageMCNLB && window.manageMCNLB(...args);
const manageVPN = (...args) => window.manageVPN && window.manageVPN(...args);
const showDnsManagementModal = (...args) => window.showDnsManagementModal && window.showDnsManagementModal(...args);
const showGatewayModal = (...args) => window.showGatewayModal && window.showGatewayModal(...args);
const showMap = (...args) => window.showMap && window.showMap(...args);
const pollExternalRequests = (...args) => window.pollExternalRequests && window.pollExternalRequests(...args);
const handleInfraWithoutNodes = (...args) => window.handleInfraWithoutNodes && window.handleInfraWithoutNodes(...args);
const guiActivityStart = (...args) => window.guiActivityStart && window.guiActivityStart(...args);
const guiActivityEnd = (...args) => window.guiActivityEnd && window.guiActivityEnd(...args);
const isNormalInteger = (str) => {
  var n = Math.floor(Number(str));
  return n !== Infinity && String(n) === str && n > 0;
};
window.isNormalInteger = isNormalInteger;

const REFRESH_INTERVAL_STORAGE_KEY = 'cb_mapui_refresh_interval';
const savedRefreshInterval = typeof localStorage !== 'undefined' ? localStorage.getItem(REFRESH_INTERVAL_STORAGE_KEY) : null;
var refreshInterval = (savedRefreshInterval && isNormalInteger(savedRefreshInterval)) ? parseInt(savedRefreshInterval, 10) : 5;
window.refreshInterval = refreshInterval;

const MAX_VISIBLE_NODES_STORAGE_KEY = 'cb_mapui_max_visible_nodes';
const savedMaxVisibleNodes = typeof localStorage !== 'undefined' ? localStorage.getItem(MAX_VISIBLE_NODES_STORAGE_KEY) : null;
var maxVisibleNodes = (savedMaxVisibleNodes && isNormalInteger(savedMaxVisibleNodes)) ? parseInt(savedMaxVisibleNodes, 10) : 20;
window.maxVisibleNodes = maxVisibleNodes;

let infraTimer = null;
let isFetchingInfra = false;
let isPollingPaused = false;
window.infraTimer = infraTimer;

var xRequestIds = [];
window.xRequestIds = xRequestIds;

var infraHideList = [];
window.infraHideList = infraHideList;

const displayJsonData = (...args) => window.displayJsonData ? window.displayJsonData(...args) : console.log(...args);
const hudChipsContainer = (...args) => window.hudChipsContainer ? window.hudChipsContainer(...args) : null;
const changePoints = (...args) => window.changePoints ? window.changePoints(...args) : null;
const updateNodeGroupReview = (...args) => window.updateNodeGroupReview && window.updateNodeGroupReview(...args);


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
window.infraRenderMap = infraRenderMap;

// Constants for positioning locationless Infras (preparing, prepared, failed, empty states)
// Infra name/status label placement (all in screen pixels, so the clearance
// from the Node icons is the same at every zoom level).
// Located Infra: the label block sits BELOW the bottommost Node, centred on the
// mean Node x. The VM icon's lower half (~19px) and the status badge (~18px)
// end just under the icon centre, so 24px clears them with a margin. When a
// NodeGroup label already hangs under that same Node, the block moves down by
// the chip height so the two never overlap.
const INFRA_LABEL_CLEARANCE_BELOW_PX = 24;
const INFRA_LABEL_LINE_GAP_PX = 6;
// Preferred placement is the centre of the Node cluster (mean x / mean y). It
// is used only when no Node icon would be covered; otherwise the block falls
// back to hanging below the bottommost Node. Icon box around a Node centre
// (px): VM icon ±19, provider icon up to 27 above, status badge to 24 below.
const NODE_ICON_HALF_W_PX = 19;
const NODE_ICON_UP_PX = 27;
const NODE_ICON_DOWN_PX = 24;
const INFRA_LABEL_CENTER_MARGIN_PX = 4;
// Infra without Node locations (Preparing/Prepared/Failed/Empty): docked in a
// pixel-anchored list at the top-left of the map, to the right of the
// OpenLayers zoom control (~50px wide), each with a placeholder marker.
const LOCATIONLESS_DOCK_LEFT_PX = 64;
const LOCATIONLESS_DOCK_TOP_PX = 22;
const LOCATIONLESS_DOCK_GAP_PX = 14;
const LOCATIONLESS_MARKER_RADIUS_PX = 9;

var k8sName = new Array();
var k8sStatus = new Array();
var k8sCoords = new Array(); // Store individual coordinates for text rendering
var k8sClusterGroups = new Array(); // Store cluster group polygons (from clustergroup label)
var k8sClusterGroupNames = new Array(); // Store cluster group names

// Infra VNet cluster visualization storage
var infraClusterPolygons = new globalThis.Map(); // Map<infraId, Array<Polygon>>
var infraClusterNames = new globalThis.Map();    // Map<infraId, Array<clusterId>>
var infraClusterColors = new globalThis.Map();   // Map<infraId, Map<clusterId, color>>

// Infra NodeGroup visualization storage
var infraNodeGroupPolygons = new globalThis.Map(); // Map<infraId, Array<Polygon>>
// Vertical gap (px) from a Node icon's center to the top of its NodeGroup label:
// clears the icon's lower half (~19px) and the status badge (~18px) with margin.
const NODEGROUP_LABEL_OFFSET_PX = 24;
const NODEGROUP_LABEL_FONT = 'bold 13px sans-serif';
const NODEGROUP_LABEL_FONT_PX = 13;
const NODEGROUP_CHIP_PAD_X = 6;
const NODEGROUP_CHIP_PAD_Y = 3;
// Chip background behind each NodeGroup label. The immediate renderer used in
// drawObjects ignores Text.backgroundFill/padding, so the chip is a cached
// canvas drawn once per label text and handed to OpenLayers as an Icon.
const nodeGroupChipCache = new globalThis.Map(); // "text|r,g,b" -> Icon
function getNodeGroupLabelChip(text, borderRgb) {
  const key = text + '|' + borderRgb.join(',');
  let icon = nodeGroupChipCache.get(key);
  if (icon) return icon;
  if (nodeGroupChipCache.size > 500) nodeGroupChipCache.clear();

  const ratio = 2; // render at 2x and scale down for crisp edges on HiDPI
  const border = 1.5, radius = 6;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = NODEGROUP_LABEL_FONT;
  const w = Math.ceil(ctx.measureText(text).width) + NODEGROUP_CHIP_PAD_X * 2;
  const h = NODEGROUP_LABEL_FONT_PX + NODEGROUP_CHIP_PAD_Y * 2 + 2;
  canvas.width = (w + border * 2) * ratio;
  canvas.height = (h + border * 2) * ratio;
  ctx.scale(ratio, ratio);
  ctx.translate(border, border);
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(w - radius, 0);
  ctx.arcTo(w, 0, w, radius, radius);
  ctx.lineTo(w, h - radius);
  ctx.arcTo(w, h, w - radius, h, radius);
  ctx.lineTo(radius, h);
  ctx.arcTo(0, h, 0, h - radius, radius);
  ctx.lineTo(0, radius);
  ctx.arcTo(0, 0, radius, 0, radius);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fill();
  ctx.lineWidth = border;
  ctx.strokeStyle = `rgba(${borderRgb[0]},${borderRgb[1]},${borderRgb[2]},0.9)`;
  ctx.stroke();

  icon = new Icon({
    img: canvas,
    scale: 1 / ratio,
    anchor: [0.5, 0],          // top-centre of the chip sits on the anchor point...
    anchorXUnits: 'fraction',
    anchorYUnits: 'fraction',
    displacement: [0, -NODEGROUP_LABEL_OFFSET_PX], // ...then shifted down below the Node icon
  });
  nodeGroupChipCache.set(key, icon);
  return icon;
}

// Style for displaying node count suffix "(totalCount)" to the right of the rightmost node icon
function createNodeCountSuffixStyle(text) {
  return new Style({
    text: new Text({
      text: text,
      font: "bold 13px sans-serif",
      textAlign: "left",
      textBaseline: "middle",
      offsetX: 24, // spaced comfortably to the right of the node icon
      fill: new Fill({ color: [30, 41, 59, 1] }),
      stroke: new Stroke({ color: [255, 255, 255, 0.95], width: 3 }),
    }),
    zIndex: 105
  });
}
window.createNodeCountSuffixStyle = createNodeCountSuffixStyle;

var infraNodeGroupNames = new globalThis.Map();    // Map<infraId, Array<nodeGroupId>>
var infraNodeGroupColors = new globalThis.Map();   // Map<infraId, Map<nodeGroupId, color>>

var cspListDisplayEnabled = document.getElementById("displayOn");
var recommendPolicy = document.getElementById("recommendPolicy");
var selectApp = document.getElementById("selectApp");
var showInfraClusterLabels = false;
var showInfraNodeGroupLabels = false;

// Configuration variables (previously from removed form elements)
// Bracket bare IPv6 literals so http://${host}:${port} URLs stay valid
function normalizeHostname(h) {
  return h.includes(":") && !h.startsWith("[") ? "[" + h + "]" : h;
}
// Default hostname follows the page origin so remote/ingress access works without manual setup
var configHostname = normalizeHostname(window.location.hostname || "localhost");
var configPort = "1323";
var configUsername = "default";
var configPassword = "default";
var configCredentialHolder = "admin";
var configNamespace = window.configNamespace || "default";
window.configNamespace = configNamespace;
var cachedNamespaceList = window.cachedNamespaceList || [];
window.cachedNamespaceList = cachedNamespaceList;

// Persist API endpoint settings across reloads (password excluded)
// Values are validated on load to keep stored strings out of HTML/URL injection range
const API_CONFIG_KEY = "mapui-api-config";
const isValidHostname = (v) => typeof v === "string" && /^[A-Za-z0-9.\-:[\]]{1,253}$/.test(v);
const isValidPort = (v) => typeof v === "string" && /^\d{1,5}$/.test(v) && Number(v) <= 65535;
const isValidName = (v) => typeof v === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(v);
try {
  const saved = JSON.parse(localStorage.getItem(API_CONFIG_KEY) || "{}");
  if (isValidHostname(saved.hostname)) configHostname = normalizeHostname(saved.hostname);
  if (isValidPort(saved.port)) configPort = saved.port;
  if (isValidName(saved.username)) configUsername = saved.username;
  if (isValidName(saved.credentialHolder)) configCredentialHolder = saved.credentialHolder;
} catch (e) {
  console.warn("Failed to load saved API config:", e);
}

function saveApiConfig() {
  try {
    localStorage.setItem(API_CONFIG_KEY, JSON.stringify({
      hostname: configHostname,
      port: configPort,
      username: configUsername,
      credentialHolder: configCredentialHolder,
      apiBaseUrl: configApiBaseUrl,
    }));
  } catch (e) {
    console.warn("Failed to save API config:", e);
  }
}

// --- API base URL (single-entrypoint / same-origin support) -----------------
// All Tumblebug API calls go through tbApiBase(). Default behavior:
//  - mapui on its canonical port 1324 (compose / direct port-forward):
//    legacy model http://<hostname>:<port>/tumblebug  (unchanged)
//  - any other port (served behind a gateway, e.g. Gateway API entrypoint):
//    same-origin  <origin>/tumblebug  (fixes CORS/mixed-content, no setup)
// A persisted explicit Base URL (settings popup) overrides both.
const isValidBaseUrl = (v) =>
  typeof v === "string" &&
  /^https?:\/\/[A-Za-z0-9.\-:[\]]+(\/[A-Za-z0-9._\-/]*)?$/.test(v) &&
  !/[<>"'\s]/.test(v);
var configApiBaseUrl = "";
try {
  const savedBase = JSON.parse(localStorage.getItem(API_CONFIG_KEY) || "{}").apiBaseUrl;
  if (isValidBaseUrl(savedBase)) configApiBaseUrl = savedBase.replace(/\/+$/, "");
} catch (e) { /* ignore */ }
if (!configApiBaseUrl && window.location.port !== "1324" && window.location.protocol !== "file:") {
  configApiBaseUrl = `${window.location.protocol}//${window.location.host}/tumblebug`;
}
function tbApiBase() {
  return configApiBaseUrl || `http://${configHostname}:${configPort}/tumblebug`;
}

// Helper function to get current configuration
function getConfig() {
  return {
    hostname: configHostname,
    port: configPort,
    // Gateway/base URL override (e.g. https://host/tumblebug). When set, callers
    // must prefer this over hostname:port so requests go through the gateway
    // instead of the direct TB port, which may be unreachable from the browser.
    apiBaseUrl: configApiBaseUrl,
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
  nlb: [],
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

// Helper to extract flattened/hydrated nodes from an Infra object, supporting both
// the new nodeGroup[].nodes structure and the legacy infra.node array.
export function getInfraNodes(infra) {
  if (!infra) return [];
  if (infra.nodeGroup && Array.isArray(infra.nodeGroup)) {
    const nodes = [];
    infra.nodeGroup.forEach(ng => {
      if (ng.nodes && Array.isArray(ng.nodes)) {
        const { nodes: _unused, ...groupProps } = ng;
        ng.nodes.forEach(nd => {
          nodes.push({
            ...groupProps,
            ...nd,
            nodeGroupId: nd.nodeGroupId || ng.id,
            label: { ...(ng.label || {}), ...(nd.label || {}) },
            infraId: infra.id,
            infraName: infra.name,
          });
        });
      }
    });
    if (nodes.length > 0) return nodes;
  }
  if (infra.node && Array.isArray(infra.node)) {
    return infra.node.map(nd => ({
      ...nd,
      infraId: infra.id,
      infraName: infra.name,
    }));
  }
  return [];
}
window.getInfraNodes = getInfraNodes;

// Automatically normalize any Infra object with nodeGroup[].nodes into infra.node
axios.interceptors.response.use((response) => {
  if (response && response.data) {
    const data = response.data;
    if (Array.isArray(data.infra)) {
      data.infra.forEach(inf => {
        if ((!inf.node || inf.node.length === 0) && inf.nodeGroup) {
          inf.node = getInfraNodes(inf);
        }
      });
    } else if (data.nodeGroup && (!data.node || data.node.length === 0)) {
      data.node = getInfraNodes(data);
    }
  }
  return response;
});

function updateRunningCostDisplay(infraList) {
  hudChipsContainer(); // adopt the cost pill into the shared bottom-right chip stack
  const el = document.getElementById('running-cost-display');
  const valEl = document.getElementById('running-cost-value');
  const badgeEl = document.getElementById('running-cost-unknown-badge');
  if (!el || !valEl || !badgeEl) return;

  let total = 0;
  let runningCount = 0;
  let unknownCount = 0;

  (infraList || []).forEach(infra => {
    getInfraNodes(infra).forEach(nd => {
      if (nd.status !== 'Running') return;
      runningCount++;
      const cost = nd.spec?.costPerHour;
      if (cost == null || cost < 0) {
        unknownCount++;
      } else {
        total += cost;
      }
    });
  });

  if (runningCount === 0) {
    el.style.display = 'none';
    return;
  }

  el.style.display = 'block';
  valEl.textContent = `$${total.toFixed(4)}/h+`;
  if (unknownCount > 0) {
    badgeEl.style.display = 'inline';
    badgeEl.title = `${unknownCount} running node${unknownCount > 1 ? 's have' : ' has'} no cost info`;
  } else {
    badgeEl.style.display = 'none';
  }
}

// Show map settings
function showMapSettings() {
  // Get current refresh interval from global variable
  const currentRefreshInterval = refreshInterval.toString();
  
  // Define available refresh intervals (minimum 3s to prevent server 429 rate limit errors)
  const intervals = [3, 5, 10, 20, 30, 40, 50, 100];
  
  // Generate interval pill options
  const intervalPills = intervals.map(interval => {
    return `<label class="refresh-pill">
      <input class="refresh-pill-input" type="radio" name="refreshInterval" value="${interval}" ${currentRefreshInterval == interval ? 'checked' : ''}>
      <span class="refresh-pill-label">${interval}s</span>
    </label>`;
  }).join('');

  // CSP icon mode
  const curIconMode = window.cspIconMode || cspIconMode || 'logo';
  const infraClusterLabelChecked = showInfraClusterLabels ? 'checked' : '';
  const infraNodeGroupLabelChecked = showInfraNodeGroupLabels ? 'checked' : '';
  const curMaxVisibleNodes = window.maxVisibleNodes || maxVisibleNodes || 20;

  // Build namespace options
  const activeNsList = (window.cachedNamespaceList && window.cachedNamespaceList.length > 0) ? window.cachedNamespaceList : (cachedNamespaceList || []);
  const curNs = window.configNamespace || configNamespace || 'default';
  const nsOptions = activeNsList.map(ns => {
    const safeNs = window.escapeHtml ? window.escapeHtml(ns) : ns;
    const selected = ns === curNs ? 'selected' : '';
    return `<option value="${safeNs}" ${selected}>${safeNs}</option>`;
  }).join('');
  const nsSelectHtml = nsOptions || `<option value="${window.escapeHtml ? window.escapeHtml(curNs) : curNs}" selected>${window.escapeHtml ? window.escapeHtml(curNs) : curNs}</option>`;

  // Build credential holder options
  const cachedHolders = window.cachedCredentialHolderList || (typeof cachedCredentialHolderList !== 'undefined' ? cachedCredentialHolderList : []);
  const holderOptions = cachedHolders.map(holder => {
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
      <select id="cspIconModeSelect" class="settings-select">
        <option value="logo"       ${curIconMode==='logo'        ?'selected':''}>Use CSP logos (branded icons)</option>
        <option value="cloud"      ${curIconMode==='cloud'       ?'selected':''}>Use generic colored icons (hide CSP logos)</option>
        <option value="datacenter" ${curIconMode==='datacenter'  ?'selected':''}>Use 3D datacenter icons (colored rack)</option>
      </select>
      <div class="settings-csp-preview">
        ${Object.keys(window.cspGenericColors || {}).map(csp => {
          const color = (window.cspGenericColors || {})[csp];
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

    <div class="settings-section">
      <div class="settings-label"><i class="fas fa-layer-group"></i> NodeGroup Labels</div>
      <label class="settings-toggle">
        <input type="checkbox" id="infraNodeGroupLabelToggle" ${infraNodeGroupLabelChecked}>
        <span>Show nodegroup IDs on map</span>
      </label>
      <div class="settings-hint">Display nodegroup IDs above nodegroup boundaries</div>
    </div>

    <hr class="settings-divider">

    <div class="settings-section">
      <div class="settings-label"><i class="fas fa-server"></i> Max Visible Nodes per Group</div>
      <select id="maxVisibleNodesSelect" class="settings-select">
        <option value="10" ${curMaxVisibleNodes === 10 ? 'selected' : ''}>10 nodes</option>
        <option value="20" ${curMaxVisibleNodes === 20 ? 'selected' : ''}>20 nodes (default)</option>
        <option value="30" ${curMaxVisibleNodes === 30 ? 'selected' : ''}>30 nodes</option>
        <option value="50" ${curMaxVisibleNodes === 50 ? 'selected' : ''}>50 nodes</option>
        <option value="100" ${curMaxVisibleNodes === 100 ? 'selected' : ''}>100 nodes</option>
        <option value="99999" ${curMaxVisibleNodes >= 99999 ? 'selected' : ''}>Unlimited (show all)</option>
      </select>
      <div class="settings-hint">Caps rendered node icons per group and displays a total count badge</div>
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
      const selectedIconMode = document.getElementById('cspIconModeSelect')?.value || 'logo';
      const infraClusterLabelEnabled = document.getElementById('infraClusterLabelToggle')?.checked || false;
      const infraNodeGroupLabelEnabled = document.getElementById('infraNodeGroupLabelToggle')?.checked || false;
      const selectedMaxVisible = parseInt(document.getElementById('maxVisibleNodesSelect')?.value || '20', 10);
      const selectedHolder = document.getElementById('settings-credentialHolder')?.value || configCredentialHolder;
      const selectedNs = document.getElementById('settings-namespace')?.value || configNamespace;
      return {
        refreshInterval: selectedInterval.value,
        iconMode: selectedIconMode,
        infraClusterLabels: infraClusterLabelEnabled,
        infraNodeGroupLabels: infraNodeGroupLabelEnabled,
        maxVisibleNodes: selectedMaxVisible,
        credentialHolder: selectedHolder,
        namespace: selectedNs
      };
    }
  }).then((result) => {
    if (result.isConfirmed) {
      const newRefreshInterval = parseInt(result.value.refreshInterval);
      const holderChanged = result.value.credentialHolder !== configCredentialHolder;
      
      // Update global refresh interval variable and persist to localStorage
      refreshInterval = newRefreshInterval;
      window.refreshInterval = newRefreshInterval;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(REFRESH_INTERVAL_STORAGE_KEY, newRefreshInterval.toString());
      }
      isPollingPaused = false;
      if (infraTimer) {
        clearTimeout(infraTimer);
        infraTimer = setTimeout(() => getInfra(), newRefreshInterval * 1000);
      }

      // Update max visible nodes per group
      const newMaxVisibleNodes = result.value.maxVisibleNodes || 20;
      const maxVisibleChanged = newMaxVisibleNodes !== maxVisibleNodes;
      maxVisibleNodes = newMaxVisibleNodes;
      window.maxVisibleNodes = newMaxVisibleNodes;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(MAX_VISIBLE_NODES_STORAGE_KEY, newMaxVisibleNodes.toString());
      }

      // Update CSP icon mode
      cspIconMode = result.value.iconMode || 'logo';
      window.cspIconMode = cspIconMode;
      showInfraClusterLabels = result.value.infraClusterLabels;
      showInfraNodeGroupLabels = result.value.infraNodeGroupLabels;
      // Clear all cached generic styles so they are regenerated with the new mode
      if (typeof window.clearCspStyleCaches === 'function') {
        window.clearCspStyleCaches();
      } else {
        const cspGenericStyles = window.cspGenericStyles || {};
        const nodeGenericCloudStyleCache = window.nodeGenericCloudStyleCache || {};
        const cspDcStyles = window.cspDcStyles || {};
        const nodeDcStyleCache = window.nodeDcStyleCache || {};
        Object.keys(cspGenericStyles).forEach(k => delete cspGenericStyles[k]);
        Object.keys(nodeGenericCloudStyleCache).forEach(k => delete nodeGenericCloudStyleCache[k]);
        Object.keys(cspDcStyles).forEach(k => delete cspDcStyles[k]);
        Object.keys(nodeDcStyleCache).forEach(k => delete nodeDcStyleCache[k]);
      }
      // Force map re-render to apply icon change
      map.render();
      const view = map.getView();
      if (view) view.changed();

      // Apply namespace change
      const curConfigNs = window.configNamespace || configNamespace;
      const nsChanged = result.value.namespace !== curConfigNs;
      if (nsChanged) {
        configNamespace = result.value.namespace;
        window.configNamespace = result.value.namespace;
        if (typeof applyNamespace === 'function') {
          applyNamespace(result.value.namespace);
        } else if (typeof window.applyNamespace === 'function') {
          window.applyNamespace(result.value.namespace);
        }
        if (typeof getInfra === 'function') {
          getInfra();
        } else if (typeof window.getInfra === 'function') {
          window.getInfra();
        }
      } else if (maxVisibleChanged) {
        if (typeof getInfra === 'function') {
          getInfra();
        } else if (typeof window.getInfra === 'function') {
          window.getInfra();
        }
      }

      // Apply credential holder change (triggers connection reload + map refresh)
      if (holderChanged) {
        configCredentialHolder = result.value.credentialHolder;
        window.configCredentialHolder = result.value.credentialHolder;
        if (typeof applyCredentialHolder === 'function') {
          applyCredentialHolder(result.value.credentialHolder);
        } else if (typeof window.applyCredentialHolder === 'function') {
          window.applyCredentialHolder(result.value.credentialHolder);
        }
      }

      // Show brief confirmation
      var statusParts = [];
      statusParts.push(`NS: ${result.value.namespace}`);
      statusParts.push(`Holder: ${result.value.credentialHolder}`);
      statusParts.push(`Refresh: ${newRefreshInterval}s`);
      if (cspIconMode !== 'logo') statusParts.push('Icons: ' + cspIconMode);
      if (showInfraClusterLabels) statusParts.push('Cluster labels: ON');
      if (showInfraNodeGroupLabels) statusParts.push('NodeGroup labels: ON');
      
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
  if (infraTimer) {
    clearTimeout(infraTimer);
    infraTimer = null;
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

// Resume polling immediately when tab becomes visible or network comes online
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !isPollingPaused) {
    if (!isFetchingInfra) {
      if (infraTimer) clearTimeout(infraTimer);
      getInfra();
    }
  }
});

window.addEventListener('online', () => {
  if (!document.hidden && !isPollingPaused) {
    if (!isFetchingInfra) {
      if (infraTimer) clearTimeout(infraTimer);
      getInfra();
    }
  }
});

// Periodic map performance monitoring
setInterval(performMapCleanup, 300000); // Check every 5 minutes

// Export functions for global access
window.updateMapConnectionStatus = updateMapConnectionStatus;
window.showMapSettings = showMapSettings;
window.showMapRefreshIndicator = showMapRefreshIndicator;
window.performMapCleanup = performMapCleanup;
window.getInfra = getInfra;

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
window.map = map;

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
  window.latLonInputPairIdx = 0;
  nodeGroupRequestFromSpecList.length = 0;
  recommendedSpecList.length = 0;
  window.nodeGroupRequestFromSpecList = nodeGroupRequestFromSpecList;
  window.recommendedSpecList = recommendedSpecList;
  renderMapFromConfig();

  // Update NodeGroup review panel
  if (typeof window.updateNodeGroupReview === 'function') {
    window.updateNodeGroupReview();
  } else if (typeof updateNodeGroupReview === 'function') {
    updateNodeGroupReview();
  }
}
window.clearCircle = clearCircle;

// Asks before wiping the whole MC-Infra configuration (all NodeGroups at once).
// Individual NodeGroup removal stays confirmation-free — this guards only the
// bulk clear. Skips the prompt when there is nothing to clear.
function confirmClearInfraConfiguration() {
  const currentList = window.nodeGroupRequestFromSpecList || nodeGroupRequestFromSpecList;
  if (!currentList || currentList.length === 0) {
    clearCircle("clearText");
    return;
  }
  Swal.fire({
    title: 'Remove Infra Configuration?',
    text: `This will remove all ${currentList.length} configured NodeGroup(s).`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, Remove All',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#dc3545'
  }).then((result) => {
    if (result.isConfirmed) {
      clearCircle("clearText");
    }
  });
}
window.confirmClearInfraConfiguration = confirmClearInfraConfiguration;

function writeLatLonInputPair(idx, lat, lon) {
  var fn = window.getRecommendedSpec || (typeof getRecommendedSpec === 'function' ? getRecommendedSpec : null);
  var recommendedSpec = fn ? fn(idx, lat, lon) : null;
  var latf = lat.toFixed(4);
  var lonf = lon.toFixed(4);

  //document.getElementById("latLonInputPairArea").innerHTML +=
  `Node ${idx + 1}: (${latf}, ${lonf}) / `;
  if (idx == 0) {
    debugLog.mapOp("Started Infra configuration");
  }
  debugLog.mapOp(`Node-${idx + 1} Location: ${latf}, ${lonf} | Best Spec: `);
}
window.writeLatLonInputPair = writeLatLonInputPair;

var latLonInputPairIdx = 0;
var nodeGroupRequestFromSpecList = new Array();
var recommendedSpecList = new Array();
window.latLonInputPairIdx = latLonInputPairIdx;
window.nodeGroupRequestFromSpecList = nodeGroupRequestFromSpecList;
window.recommendedSpecList = recommendedSpecList;

map.on("singleclick", function (event) {
  const coord = event.coordinate;

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
      if (typeof $ !== 'undefined' && $.fn && $.fn.tab) {
        $(provisionTab).tab('show');
      }
    }
  } catch (error) {
    console.log('Failed to activate provision tab:', error);
  }

  let currentIdx = (typeof window.latLonInputPairIdx === 'number') ? window.latLonInputPairIdx : latLonInputPairIdx;
  writeLatLonInputPair(currentIdx, coord[1], coord[0]);
  currentIdx++;
  latLonInputPairIdx = currentIdx;
  window.latLonInputPairIdx = currentIdx;
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
          <button onclick="showGatewayModal(); Swal.close();" class="btn btn-info btn-context">🔀 Nginx Gateway</button>
          <button onclick="showRegisterCspModal();" class="btn btn-info btn-context">☁️ Register a CSP (runtime)</button>
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

function findNearestInfra(clickCoord) {
  let nearestInfra = null;
  let minDistance = Infinity;
  
  const clickPixel = map.getPixelFromCoordinate(clickCoord);
  
  // Search through all Infra entries in the render map. Distance is measured to
  // the centre of the label block exactly as drawObjects lays it out.
  for (const [infraId, data] of infraRenderMap) {
    if (!data.name) continue;
    const layout = getInfraLabelLayout(data);
    if (!layout) continue;
    const anchorPixel = map.getPixelFromCoordinate(layout.anchor);
    if (!anchorPixel) continue;
    const textPixel = [anchorPixel[0] + layout.center[0], anchorPixel[1] + layout.center[1]];
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
        <button class="btn btn-warning btn-context btn-infra-action" data-action="gateway">🔀 Gateway</button>
        <button onclick="showRegisterCspModal();" class="btn btn-warning btn-context">☁️ Register CSP</button>
        <button onclick="setBastionNode(); Swal.close();" class="btn btn-warning btn-context">🔗 Set Bastion</button>

        <button class="btn btn-info btn-context btn-infra-action" data-action="nlb">⚖️ NLB</button>
        <button class="btn btn-info btn-context btn-infra-action" data-action="mcnlb">🌐 Global NLB</button>
        <button class="btn btn-info btn-context btn-infra-action" data-action="vpn">🔒 VPN</button>
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
          if (action === 'mcnlb') { manageMCNLB(); return; }
          if (action === 'vpn') { manageVPN(); return; }
          if (action === 'delete') { executeAction('delete'); return; }
          if (action === 'sshKeys') { downloadAllSshKeys(); return; }
          // Functions that don't open Swal — close context menu after
          if (action === 'scaleOut') scaleOutInfraFromContext(infraName);
          else if (action === 'copyConfig') copyInfraConfig(infraName);
          else if (action === 'saveTemplate') saveInfraAsTemplate(infraName);
          else if (action === 'dns')     showDnsManagementModal(infraName);
          else if (action === 'gateway') showGatewayModal(infraName);
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
window.spinnerStack = spinnerStack;
// A counter to generate unique IDs for spinner tasks
let currentSpinnerId = 0;

// Function to create a unique spinner task ID based on the function name
function generateSpinnerId(functionName) {
  currentSpinnerId++; // Increment the ID
  return "[" + currentSpinnerId + "] " + functionName; // Return the unique task ID
}

// Add a task: render a live "GUI" card in the unified activity feed (top-right).
// The taskId/return contract is unchanged, so existing call sites are untouched.
function addSpinnerTask(functionName) {
  const taskId = generateSpinnerId(functionName);
  spinnerStack[taskId] = true;
  guiActivityStart(taskId, functionName); // defined in the activity-feed module below
  return taskId;
}

// Remove a task: mark its activity card done so it settles and fades out.
// guiActivityEnd is idempotent, so this is safe to call more than once per task.
function removeSpinnerTask(taskId, ok = true) {
  delete spinnerStack[taskId];
  guiActivityEnd(taskId, ok);
}
window.addSpinnerTask = addSpinnerTask;
window.removeSpinnerTask = removeSpinnerTask;
window.spinnerStack = spinnerStack;

// Display Icon for Cloud locations
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
window.geoResourceLocation = geoResourceLocation;

var cspPoints = {};
var geoCspPoints = {};
window.cspPoints = cspPoints;
window.geoCspPoints = geoCspPoints;


async function displayCSPListOn() {
  const checkbox = typeof cspListDisplayEnabled !== 'undefined' ? cspListDisplayEnabled : document.getElementById('cspListDisplayEnabled');
  if (checkbox && checkbox.checked) {
    cloudLocation = [];
    try {
      const response = await fetch(csvPath);
      if (!response.ok) {
        debugLog.resource('Failed to load cloud location CSV:', response.status);
        return;
      }
      const text = await response.text();
      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length > 1) {
        const headers = lines[0].split(",").map(h => h.trim());
        for (let idx = 1; idx < lines.length; idx++) {
          const values = lines[idx].split(",").map(v => v.trim());
          const row = {};
          headers.forEach((h, i) => { row[h] = values[i]; });
          cloudLocation.push(row);
        }
      }
      debugLog.resource('Loaded cloud location data:', cloudLocation.length, 'regions');
      debugLog.mapOp("[Complete] Display Known Cloud Regions: " + cloudLocation.length);

      cloudLocation.forEach((location) => {
        const { CloudType, Longitude, Latitude } = location;
        if (!CloudType || !Longitude || !Latitude) return;
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
    } catch (err) {
      debugLog.resource('Error loading cloud location CSV:', err);
    }
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

  // Same-origin: swagger.html is served by mapui itself (works at :1324 and behind a gateway)
  iframe.src = "/swagger.html";
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

// Tombstone marker: a rose halo drawn behind the resource's normal icon, flagging a
// resource whose deletion was requested but is not yet confirmed gone on the CSP.
// Image-based (CircleStyle) so it renders on MultiPoint geometries like the icons do.
var tombstoneHaloStyle = new Style({
  image: new CircleStyle({
    radius: 22,
    fill: new Fill({ color: "rgba(251,113,133,0.5)" }),
    stroke: new Stroke({ color: "#e11d48", width: 3 }),
  }),
});

// A resource is a deletion tombstone when its deletion was requested but not yet confirmed
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

// cspIconStyles
const cspIconStyles = {};
window.cspIconStyles = cspIconStyles;

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

/**
 * Generate a consistent coordinate key for grouping resources at the same location.
 * Uses 3 decimal places (~100m) to preserve distinct CSP region coordinates (e.g. AWS vs Azure Seoul)
 * while correctly clustering resources and nodes that share the exact same region.
 */
function getLocationCoordKey(lon, lat) {
  if (lon === undefined || lat === undefined || lon === null || lat === null) return "0,0";
  return Number(lon).toFixed(3) + ',' + Number(lat).toFixed(3);
}

/**
 * Compute inter-NodeGroup offset for NodeGroups within the same Infra sharing the exact same region.
 * The primary NodeGroup (ngIndex === 0) remains anchored at the exact base location (0, 0),
 * perfectly centered among vNet, SG, SSHKey, and CSP icons.
 * Subsequent NodeGroups (ngIndex > 0) receive a modest offset so their clusters do not collide.
 * @param {number} ngIndex - This NodeGroup's index at the shared location (0-based)
 * @param {number} totalNg - Total NodeGroups sharing this location in the Infra
 * @returns {{ox: number, oy: number}} offset in coordinate units
 */
function getNodeGroupLocationOffset(ngIndex, totalNg) {
  if (totalNg <= 1 || ngIndex === 0) return { ox: 0, oy: 0 };
  if (totalNg === 2) {
    return { ox: 0.6, oy: 0 };
  }
  const ringRadius = 0.6;
  const angleStep = 2 * Math.PI / (totalNg - 1);
  const startAngle = 0;
  const angle = startAngle + angleStep * (ngIndex - 1);
  return {
    ox: ringRadius * Math.cos(angle),
    oy: ringRadius * Math.sin(angle) * 0.78
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
function makePolyDot(infraEntry, nodePoints, nodeStatuses = [], nodeProviders = [], nodeCommandStatuses = [], overLimitLabels = [], nodeCenterFlags = []) {
  var resourcePoints = [];
  for (i = 0; i < nodePoints.length; i++) {
    resourcePoints.push(nodePoints[i]);
  }
  infraEntry.geometryPoints = {
    geometry: new MultiPoint(resourcePoints),
    nodePoints: nodePoints,
    nodeStatuses: nodeStatuses,
    nodeProviders: nodeProviders,
    nodeCommandStatuses: nodeCommandStatuses,
    overLimitLabels: overLimitLabels,
    nodeCenterFlags: nodeCenterFlags
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

// Label anchor for a located Infra: mean x of its Nodes, y of the bottommost
// Node. Computed once from the render points (not from the hull polygon), so it
// does not move with the zoom-dependent geometry simplification the immediate
// renderer applies before it picks a polygon's interior point.
function computeInfraLabelAnchor(nodePoints) {
  if (!nodePoints || nodePoints.length === 0) return null;
  let sumX = 0, minY = Infinity;
  for (const p of nodePoints) {
    sumX += p[0];
    if (p[1] < minY) minY = p[1];
  }
  return [sumX / nodePoints.length, minY];
}

// Centre of the Node cluster (mean x / mean y) for the preferred label spot.
function computeInfraLabelCentroid(nodePoints) {
  if (!nodePoints || nodePoints.length === 0) return null;
  let sumX = 0, sumY = 0;
  for (const p of nodePoints) { sumX += p[0]; sumY += p[1]; }
  return [sumX / nodePoints.length, sumY / nodePoints.length];
}

// Text width in px for the given font, cached (called every frame).
const textWidthCache = new globalThis.Map();
let textMeasureCtx = null;
function measureTextWidth(text, font) {
  const key = font + '|' + text;
  let w = textWidthCache.get(key);
  if (w !== undefined) return w;
  if (textWidthCache.size > 2000) textWidthCache.clear();
  if (!textMeasureCtx) textMeasureCtx = document.createElement('canvas').getContext('2d');
  textMeasureCtx.font = font;
  w = textMeasureCtx.measureText(text).width;
  textWidthCache.set(key, w);
  return w;
}

// True when a label block of blockW x blockH px centred on `centroid` would
// cover any Node icon of this Infra (all in screen pixels, current view).
function infraLabelCoversNodeIcon(data, centroid, blockW, blockH) {
  const pts = data.geometryPoints && data.geometryPoints.nodePoints;
  if (!pts || pts.length === 0) return true;
  const c = map.getPixelFromCoordinate(centroid);
  if (!c) return true;
  const m = INFRA_LABEL_CENTER_MARGIN_PX;
  const l = c[0] - blockW / 2 - m, r = c[0] + blockW / 2 + m;
  const t = c[1] - blockH / 2 - m, b = c[1] + blockH / 2 + m;
  // With NodeGroup labels on, a chip may hang under any Node: treat that
  // strip as part of the icon so the centred block never covers a chip.
  const down = showInfraNodeGroupLabels
    ? NODEGROUP_LABEL_OFFSET_PX + NODEGROUP_LABEL_FONT_PX + NODEGROUP_CHIP_PAD_Y * 2 + 5
    : NODE_ICON_DOWN_PX;
  for (const p of pts) {
    const px = map.getPixelFromCoordinate(p);
    if (!px) continue;
    if (px[0] + NODE_ICON_HALF_W_PX > l && px[0] - NODE_ICON_HALF_W_PX < r &&
        px[1] + down > t && px[1] - NODE_ICON_UP_PX < b) {
      return true;
    }
  }
  return false;
}

// Extra downward clearance for an Infra label when a NodeGroup label (drawn
// under each group's first Node) sits on the same bottom row as the anchor.
function nodeGroupLabelClearance(data, anchor) {
  if (!showInfraNodeGroupLabels || !data || !data.id) return 0;
  const polys = infraNodeGroupPolygons.get(data.id);
  if (!Array.isArray(polys)) return 0;
  const sameRow = polys.some((poly) => {
    const a = poly && poly.get('labelAnchor');
    return a && Math.abs(a[1] - anchor[1]) < 1e-9;
  });
  if (!sameRow) return 0;
  // chip: border + padding + font + padding + border, then a small gap
  return NODEGROUP_LABEL_FONT_PX + NODEGROUP_CHIP_PAD_Y * 2 + 2 + 3 + INFRA_LABEL_LINE_GAP_PX;
}

// Shared label geometry for an Infra so drawing (drawObjects) and hit-testing
// (findNearestInfra) agree. Offsets are screen pixels relative to `anchor`.
//  - located: block centred on the Node cluster's centroid when that covers
//    no Node icon; otherwise stacked downward below the bottommost Node
//    (reading order top-down: the Node icons, then name lines, then status)
//  - pinned locationless: stacked downward below the placeholder marker
//  - docked (no location): block laid out downward to the right of the
//    placeholder marker, left-aligned so long names never clip at the edge
function getInfraLabelLayout(data) {
  if (!data || !data.name) return null;
  let anchor = null;
  if (data.isLocationless) {
    anchor = data.geometry ? data.geometry.getCoordinates() : null;
  } else {
    anchor = data.labelAnchor || data.anchorCoord ||
      (data.geometry && data.geometry.getType() === 'Polygon'
        ? data.geometry.getInteriorPoint().getCoordinates() : null);
  }
  if (!anchor) return null;

  const nameLines = splitInfraNameToLines(data.name);
  const nameScale = changeSizeByName(data.name + data.status) + 0.1;
  const statusScale = changeSizeStatus(data.name + data.status);
  const lineHeight = 12 * nameScale;
  const statusHeight = 10 * statusScale;
  const n = nameLines.length;

  if (data.isLocationless && data.isDocked) {
    const offsetX = LOCATIONLESS_MARKER_RADIUS_PX + 10;
    const name = nameLines.map((text, k) => ({ text, offsetX, offsetY: k * lineHeight }));
    const statusY = n * lineHeight + INFRA_LABEL_LINE_GAP_PX / 2;
    const top = -Math.max(lineHeight / 2, LOCATIONLESS_MARKER_RADIUS_PX);
    const bottom = statusY + statusHeight / 2;
    return {
      anchor, nameScale, statusScale,
      textAlign: 'left', textBaseline: 'middle',
      name, status: { offsetX, offsetY: statusY },
      center: [offsetX + 40, (top + bottom) / 2],
      top, height: bottom - top,
    };
  }

  const blockH = n * lineHeight + INFRA_LABEL_LINE_GAP_PX + statusHeight;

  // Preferred: centred on the Node cluster, if that covers no Node icon.
  if (!data.isLocationless && data.labelCentroid) {
    const nameFont = `bold ${10 * nameScale}px sans-serif`;
    const statusFont = `bold ${10 * statusScale}px sans-serif`;
    let blockW = measureTextWidth(data.status, statusFont);
    for (const line of nameLines) blockW = Math.max(blockW, measureTextWidth(line, nameFont));
    if (!infraLabelCoversNodeIcon(data, data.labelCentroid, blockW, blockH)) {
      const top = -blockH / 2;
      const name = nameLines.map((text, k) => ({ text, offsetX: 0, offsetY: top + k * lineHeight }));
      const statusTop = top + n * lineHeight + INFRA_LABEL_LINE_GAP_PX;
      return {
        anchor: data.labelCentroid, nameScale, statusScale,
        textAlign: 'center', textBaseline: 'top',
        name, status: { offsetX: 0, offsetY: statusTop },
        center: [0, 0],
        top, height: blockH,
      };
    }
  }

  // Fallback: hang below the bottommost Node (or the placeholder marker).
  const clearance = data.isLocationless
    ? LOCATIONLESS_MARKER_RADIUS_PX + INFRA_LABEL_LINE_GAP_PX
    : INFRA_LABEL_CLEARANCE_BELOW_PX + nodeGroupLabelClearance(data, anchor);
  const name = nameLines.map((text, k) => ({
    text, offsetX: 0, offsetY: clearance + k * lineHeight,
  }));
  const statusTop = clearance + n * lineHeight + INFRA_LABEL_LINE_GAP_PX;
  const bottom = statusTop + statusHeight;
  return {
    anchor, nameScale, statusScale,
    textAlign: 'center', textBaseline: 'top',
    name, status: { offsetX: 0, offsetY: statusTop },
    center: [0, (clearance + bottom) / 2],
    top: clearance, height: bottom - clearance,
  };
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

// Helper to reliably extract coordinates for an MC-Infra configuration nodeGroup
function getCoordinatesForConfig(spec, nodeConfig) {
  // 1. Direct check on spec region coordinates
  let lon = parseFloat(spec?.regionLongitude);
  let lat = parseFloat(spec?.regionLatitude);
  if (Number.isFinite(lon) && Number.isFinite(lat)) {
    return [lon, lat];
  }

  // 2. Direct check on location object if available
  if (spec?.location) {
    lon = parseFloat(spec.location.longitude);
    lat = parseFloat(spec.location.latitude);
    if (Number.isFinite(lon) && Number.isFinite(lat)) return [lon, lat];
  }

  // 3. Fallback: Lookup from registered connections in central store
  const connections = window.cloudBaristaCentralData?.connection || [];
  const connName = nodeConfig?.connectionName || spec?.connectionName;
  const specId = nodeConfig?.specId || spec?.id || '';

  const extractProvider = (id) => (id && id.includes('+') ? id.split('+')[0] : (spec?.providerName || ''));
  const extractRegion = (id) => (id && id.includes('+') ? id.split('+')[1] : (spec?.regionName || ''));

  const provider = (spec?.providerName || extractProvider(specId)).toLowerCase();
  const region = (spec?.regionName || extractRegion(specId)).toLowerCase();

  // Try matching by connectionName
  if (connName && connections.length > 0) {
    const matched = connections.find(c => c.configName === connName);
    if (matched?.regionDetail?.location) {
      lon = parseFloat(matched.regionDetail.location.longitude);
      lat = parseFloat(matched.regionDetail.location.latitude);
      if (Number.isFinite(lon) && Number.isFinite(lat)) return [lon, lat];
    }
  }

  // Try matching by provider + region
  if (provider && region && connections.length > 0) {
    const matched = connections.find(c =>
      (c.providerName || '').toLowerCase() === provider &&
      (c.regionDetail?.regionName || '').toLowerCase() === region
    );
    if (matched?.regionDetail?.location) {
      lon = parseFloat(matched.regionDetail.location.longitude);
      lat = parseFloat(matched.regionDetail.location.latitude);
      if (Number.isFinite(lon) && Number.isFinite(lat)) return [lon, lat];
    }
  }

  return null;
}

function renderMapFromConfig() {
  const specs = window.recommendedSpecList || recommendedSpecList || [];
  const nodeConfigs = window.nodeGroupRequestFromSpecList || nodeGroupRequestFromSpecList || [];
  const totalItems = Math.max(specs.length, nodeConfigs.length);

  const points = [];
  for (let i = 0; i < totalItems; i++) {
    const sp = specs[i];
    const nc = nodeConfigs[i];
    const coords = getCoordinatesForConfig(sp, nc);
    if (coords) {
      points.push(coords);
      // Cache coordinates back to spec for subsequent operations
      if (sp) {
        if (!Number.isFinite(parseFloat(sp.regionLongitude))) sp.regionLongitude = coords[0];
        if (!Number.isFinite(parseFloat(sp.regionLatitude))) sp.regionLatitude = coords[1];
      }
    }
  }

  cspPointsCircle = points;
  geoCspPointsCircle = cspPointsCircle.length
    ? [new MultiPoint(cspPointsCircle)]
    : [];
  map.render();
}
window.renderMapFromConfig = renderMapFromConfig;

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

    var url = `${tbApiBase()}/request/${selectedRequestId}`;

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

function getInfra() {
  // Clear any existing scheduled timer to prevent duplicate timer leaks
  if (infraTimer) {
    clearTimeout(infraTimer);
    infraTimer = null;
  }

  var hostname = window.configHostname || configHostname;
  var port = window.configPort || configPort;
  var username = window.configUsername || configUsername;
  var password = window.configPassword || configPassword;
  var namespace = window.configNamespace || configNamespace || 'default';

  // Use global refreshInterval variable instead of DOM element
  var filteredRefreshInterval = isNormalInteger(refreshInterval.toString())
    ? refreshInterval
    : 5;
  var nextIntervalMs = filteredRefreshInterval * 1000;

  const scheduleNext = (delayMs = nextIntervalMs) => {
    if (infraTimer) {
      clearTimeout(infraTimer);
    }
    if (!isPollingPaused && !document.hidden) {
      infraTimer = setTimeout(() => getInfra(), delayMs);
    }
  };

  // [Guard 1: Page hidden] Tab in background -> pause polling until tab becomes visible
  if (document.hidden) {
    debugLog.api('getInfra: tab hidden, polling paused');
    return;
  }

  // [Guard 2: Offline] Browser offline -> wait for online event or next interval
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    debugLog.api('getInfra: network offline, skipping poll');
    scheduleNext();
    return;
  }

  // [Guard 3: Polling explicitly paused due to fatal auth error]
  if (isPollingPaused) {
    debugLog.api('getInfra: polling paused due to authentication error');
    return;
  }

  // [Guard 4: Missing namespace]
  if (!namespace || namespace.trim() === '') {
    debugLog.api('getInfra: no namespace selected, skipping poll');
    scheduleNext();
    return;
  }

  // [Guard 5: In-flight request overlap]
  if (isFetchingInfra) {
    debugLog.api('getInfra: previous request still in flight, skipping overlapping call');
    return;
  }

  isFetchingInfra = true;
  pollExternalRequests();

  // Show refresh indicator
  showMapRefreshIndicator(true);

  var zoomLevel = map.getView().getZoom() * 2.0;
  var radius = 4.0;

  if (namespace && namespace != "") {
    // get infra list and put them on the map - full details including connectionConfig
    var url = `${tbApiBase()}/ns/${namespace}/infra`;

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
            getInfraNodes(infra).forEach(nd => {
              allNodes.push(nd);
            });
          });
          window.cloudBaristaCentralData.nodeData = allNodes;
          
          // Load VPN data (feeds the always-visible map icons).
          loadVpnDataFromInfras();
          // NLBs come from one namespace-wide call, so they are refreshed every cycle
          // for the Net graph, the NLB manager and the Board table alike.
          loadNlbData();

          // Update running cost display
          updateRunningCostDisplay(obj.infra);

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
        infraNodeGroupPolygons.clear();
        infraNodeGroupNames.clear();
        infraNodeGroupColors.clear();
        
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
              // Group by precise coordinates (~100m) to keep distinct CSP regions separate
              const locKey = getLocationCoordKey(nd.location.longitude, nd.location.latitude);
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

            // Build per-NodeGroup location groups within this Infra:
            // Key: gid (nodeGroupId) -> { nodeIndices: number[], locKey: string }
            const ngMap = new globalThis.Map();
            for (let vi = 0; vi < item.node.length; vi++) {
              const v = item.node[vi];
              if (!v.location || v.location.longitude === undefined || v.location.latitude === undefined) continue;
              const locKey = getLocationCoordKey(v.location.longitude, v.location.latitude);
              const gid = v.nodeGroupId || ('default_' + locKey);
              if (!ngMap.has(gid)) {
                ngMap.set(gid, { nodeIndices: [], locKey: locKey });
              }
              ngMap.get(gid).nodeIndices.push(vi);
            }

            // Group NodeGroups in this Infra by their location to offset overlapping NodeGroups
            // locKey -> [gid1, gid2, ...]
            const locToNgList = new globalThis.Map();
            for (const [gid, data] of ngMap) {
              if (!locToNgList.has(data.locKey)) locToNgList.set(data.locKey, []);
              locToNgList.get(data.locKey).push(gid);
            }

            // Build per-Node lookup: nodeIndex -> { indexInGroup, groupSize, ngOffsetIndex, totalNgAtLoc, nodeGroupId }
            const vmGroupInfo = new globalThis.Map();
            for (const [gid, data] of ngMap) {
              const ngList = locToNgList.get(data.locKey);
              const ngOffsetIndex = ngList.indexOf(gid);
              const totalNgAtLoc = ngList.length;
              const groupSize = data.nodeIndices.length;

              for (let gi = 0; gi < data.nodeIndices.length; gi++) {
                const nodeIdx = data.nodeIndices[gi];
                vmGroupInfo.set(nodeIdx, {
                  indexInGroup: gi,
                  groupSize: groupSize,
                  ngOffsetIndex: ngOffsetIndex,
                  totalNgAtLoc: totalNgAtLoc,
                  nodeGroupId: gid
                });
              }
            }

            // Build per-Node render point lookup to keep cluster geometry aligned with node dots.
            const nodeRenderPointById = new globalThis.Map();

            const limit = window.maxVisibleNodes || maxVisibleNodes || 20;
            const groupFirstCoordMap = new globalThis.Map(); // gid -> [x, y] of first rendered node
            const groupRightmostCoordMap = new globalThis.Map(); // gid -> { coord: [x, y], totalCount: number }
            var nodeStatuses = [];
            var nodeProviders = [];
            var nodeCommandStatuses = [];
            var nodePoints = [];
            var nodeCenterFlags = [];
            var validateNum = 0;

            for (let nodeIndex = 0; nodeIndex < item.node.length; nodeIndex++) {
              const nd = item.node[nodeIndex];
              if (!nd.location || nd.location.longitude === undefined || nd.location.latitude === undefined) {
                console.warn(`Node ${nd.id || nodeIndex}: missing location data, skipping`);
                continue;
              }
              validateNum++;

              // 1. Inter-Infra offset: separate overlapping Infras at shared location
              const nodeLocKey2 = getLocationCoordKey(nd.location.longitude, nd.location.latitude);
              const infraIdx2 = infraLocationIndex.get(item.id + ':' + nodeLocKey2) || 0;
              const totalInfras2 = locationInfraCounter.get(nodeLocKey2) || 1;
              const infraOff2 = getInfraLocationOffset(infraIdx2, totalInfras2);
              const infraOffX2 = (infraOff2.ox / zoomLevel) * radius;
              const infraOffY2 = (infraOff2.oy / zoomLevel) * radius;

              // 2. NodeGroup info for this node
              const gInfo2 = vmGroupInfo.get(nodeIndex);
              const gid = gInfo2 ? gInfo2.nodeGroupId : (nd.nodeGroupId || 'default');
              const groupSize = gInfo2 ? gInfo2.groupSize : 1;
              const indexInGroup = gInfo2 ? gInfo2.indexInGroup : 0;
              const ngOffsetIndex = gInfo2 ? gInfo2.ngOffsetIndex : 0;
              const totalNgAtLoc = gInfo2 ? gInfo2.totalNgAtLoc : 1;

              // 3. Inter-NodeGroup offset: separate multiple NodeGroups of this Infra at the same location
              const ngOff = getNodeGroupLocationOffset(ngOffsetIndex, totalNgAtLoc);
              const ngOffX = (ngOff.ox / zoomLevel) * radius;
              const ngOffY = (ngOff.oy / zoomLevel) * radius;

              // 4. Intra-NodeGroup circular layout
              const isOverLimit = groupSize > limit;
              const effectiveGroupSize = isOverLimit ? limit : groupSize;
              const isCenterNode = (indexInGroup === 0);

              // If this NodeGroup exceeds limit and we've already reached the limit, omit rendering
              if (isOverLimit && indexInGroup >= limit) {
                const repPt = groupFirstCoordMap.get(gid);
                if (nd.id && repPt) {
                  nodeRenderPointById.set(nd.id, repPt);
                }
                continue;
              }

              // Compute intra-NodeGroup offset: spread VMs belonging to this NodeGroup around its center
              let intraOffX2 = 0, intraOffY2 = 0;
              if (effectiveGroupSize > 1 && indexInGroup > 0) {
                const adj2 = returnAdjustmentPoint(indexInGroup, effectiveGroupSize);
                intraOffX2 = (adj2.ax / zoomLevel) * radius;
                intraOffY2 = (adj2.ay / zoomLevel) * radius;
              }

              const coords = [
                nd.location.longitude * 1 + infraOffX2 + ngOffX + intraOffX2,
                nd.location.latitude * 1 + infraOffY2 + ngOffY + intraOffY2,
              ];

              if (!groupFirstCoordMap.has(gid)) {
                groupFirstCoordMap.set(gid, coords);
              }

              // Track rightmost node for over-limit groups to place "(count)" label per NodeGroup
              if (isOverLimit) {
                const currentRightmost = groupRightmostCoordMap.get(gid);
                if (!currentRightmost || coords[0] > currentRightmost.coord[0]) {
                  groupRightmostCoordMap.set(gid, { coord: coords, totalCount: groupSize });
                }
              }

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
              if (commandStatus === "None" && window._cmdStreamSessions) {
                Object.values(window._cmdStreamSessions).forEach((s) => {
                  if (!s || s.doneSummary || s.error || s.commandError) return;
                  if (!s.infraId || s.infraId === item.id) {
                    const ns = s.nodeState && s.nodeState[nd.id];
                    if (ns) {
                      if (ns.status === 'Handling') commandStatus = 'Handling';
                      else if (ns.status === 'Queued' && commandStatus !== 'Handling') commandStatus = 'Queued';
                    } else if (!s.targetNodeId || s.targetNodeId === nd.id) {
                      commandStatus = 'Handling';
                    }
                  }
                });
              }
              nodeCommandStatuses.push(commandStatus);

              let provider = "unknown";
              if (nd.connectionConfig && nd.connectionConfig.providerName) {
                provider = nd.connectionConfig.providerName;
              } else if (nd.connectionName) {
                provider = nd.connectionName.split('-')[0];
              }
              nodeProviders.push(provider);

              vmGeo.push(coords);
              nodePoints.push(coords);
              nodeCenterFlags.push(isCenterNode);
              if (nd.id) {
                nodeRenderPointById.set(nd.id, coords);
              }
            }

            // Build overLimitLabels: for each group that exceeded limit, place "(totalCount)" at the rightmost node
            const overLimitLabels = [];
            for (const [, info] of groupRightmostCoordMap) {
              overLimitLabels.push({
                coord: info.coord,
                text: `(${info.totalCount})`
              });
            }

            // Single node fallback to create minimal convex hull
            if (vmGeo.length === 1) {
              const singleCoord = vmGeo[0];
              vmGeo.push([
                singleCoord[0] + Math.random() * 0.001,
                singleCoord[1] + Math.random() * 0.001,
              ]);
              vmGeo.push([
                singleCoord[0] + Math.random() * 0.001,
                singleCoord[1] + Math.random() * 0.001,
              ]);
            }

            if (validateNum === item.node.length) {
              // Keep the original Infra name/id (no "-nlb" -> "NLB" relabel) so a
              // Global NLB host remains identifiable/operable as its own Infra.
              var newName = item.name;

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
              makePolyDot(infraEntry, vmGeo, nodeStatuses, nodeProviders, nodeCommandStatuses, overLimitLabels, nodeCenterFlags);
              // convexHull sorts in-place; pass a copy so vmGeo (stored in
              // geometryPoints.nodePoints by reference) keeps the original
              // item.node order aligned with nodeProviders/nodeStatuses.
              const hullGeo = convexHull([...vmGeo]);
              makePolyArray(infraEntry, hullGeo);
              // Name/status label anchor: below the bottommost Node, centred on the
              // mean Node x (see getInfraLabelLayout).
              infraEntry.labelAnchor = computeInfraLabelAnchor(vmGeo);
              infraEntry.labelCentroid = computeInfraLabelCentroid(vmGeo);

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

              // Process NodeGroup polygons — group nodes by nodeGroupId
              {
                const ngBaseColors = ['#2196F3','#FF9800','#9C27B0','#4CAF50','#F44336','#00BCD4','#FF5722','#607D8B'];
                const ngGroupMap = new globalThis.Map(); // nodeGroupId → [[x,y], ...]
                item.node.forEach(nd => {
                  const gid = nd.nodeGroupId;
                  if (!gid || !nd.id) return;
                  const pt = nodeRenderPointById.get(nd.id);
                  if (!pt) return;
                  if (!ngGroupMap.has(gid)) ngGroupMap.set(gid, []);
                  ngGroupMap.get(gid).push(pt);
                });

                if (ngGroupMap.size > 0) {
                  const ngPolygons = [], ngNames = [];
                  const ngColorMap = new globalThis.Map();
                  let ngIdx = 0;
                  for (const [gid, pts] of ngGroupMap) {
                    const color = ngBaseColors[ngIdx % ngBaseColors.length];
                    ngColorMap.set(gid, color);
                    ngNames.push(gid);
                    const ring = buildClusterPolygonRing(pts, zoomLevel, radius);
                    if (ring && ring.length >= 4) {
                      const poly = new Polygon([ring]);
                      poly.set('clusterNodeCount', pts.length);
                      poly.set('nodeGroupId', gid);
                      // Label anchor: the group's first Node (API order). The render
                      // point is shared by reference with nodePoints, so a locationless
                      // Infra that moves at draw time keeps its label attached.
                      poly.set('labelAnchor', pts[0]);
                      ngPolygons.push(poly);
                    }
                    ngIdx++;
                  }
                  if (ngPolygons.length > 0) {
                    infraNodeGroupPolygons.set(item.id, ngPolygons);
                    infraNodeGroupNames.set(item.id, ngNames);
                    infraNodeGroupColors.set(item.id, ngColorMap);
                  }
                }
              }

              infraRenderMap.set(item.id, infraEntry);
            }
          }
        } else {
          // No Infra data — map is already cleared above
          console.log("No Infra data found, clearing map objects");
          updateRunningCostDisplay([]);
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

        const status = error.response ? error.response.status : null;
        if (status === 401 || status === 403) {
          console.error(`Authentication error (${status}): Polling paused. Please check credentials in settings.`);
          isPollingPaused = true;
          return;
        }
      })
      .finally(function () {
        isFetchingInfra = false;
        scheduleNext();
      });

    // get vnet list and put them on the map
    var url = `${tbApiBase()}/ns/${namespace}/resources/vNet`;
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
        var normalLoc = [], tombLoc = [], tombItems = [];
        for (let item of obj.vNet) {
          var pt = [
            item.connectionConfig.regionDetail.location.longitude * 1,
            item.connectionConfig.regionDetail.location.latitude * 1 - 0.05,
          ];
          if (isTombstoneResource(item)) { tombLoc.push(pt); tombItems.push(item); }
          else normalLoc.push(pt);
        }
        geoResourceLocation.vnet = normalLoc.length ? [new MultiPoint([normalLoc])] : [];
        geoResourceLocation.vnetTombstone = tombLoc.length ? [new MultiPoint([tombLoc])] : [];
        window.tombstoneRegistry.vNet = tombItems;
      } else {
        geoResourceLocation.vnet = [];
        geoResourceLocation.vnetTombstone = [];
        window.tombstoneRegistry.vNet = [];
      }
      updateTombstoneBanner();
      
      // Notify Dashboard of data update
      notifyDataSubscribers();
    })
      .catch(function (error) {
        console.log("vNet API error:", error);
        // Don't update icons on API error to preserve current state
      });

    // get securityGroup list and put them on the map
    var url = `${tbApiBase()}/ns/${namespace}/resources/securityGroup`;
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
        var normalLoc = [], tombLoc = [], tombItems = [];
        for (let item of obj.securityGroup) {
          var pt = [
            item.connectionConfig.regionDetail.location.longitude * 1 - 0.05,
            item.connectionConfig.regionDetail.location.latitude * 1,
          ];
          if (isTombstoneResource(item)) { tombLoc.push(pt); tombItems.push(item); }
          else normalLoc.push(pt);
        }
        geoResourceLocation.sg = normalLoc.length ? [new MultiPoint([normalLoc])] : [];
        geoResourceLocation.sgTombstone = tombLoc.length ? [new MultiPoint([tombLoc])] : [];
        window.tombstoneRegistry.securityGroup = tombItems;
      } else {
        geoResourceLocation.sg = [];
        geoResourceLocation.sgTombstone = [];
        window.tombstoneRegistry.securityGroup = [];
      }
      updateTombstoneBanner();
      
      // Notify Dashboard of data update
      notifyDataSubscribers();
    })
      .catch(function (error) {
        console.log("securityGroup API error:", error);
        // Don't update icons on API error to preserve current state
      });


    // get sshKey list and put them on the map
    var url = `${tbApiBase()}/ns/${namespace}/resources/sshKey`;
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
        var normalLoc = [], tombLoc = [], tombItems = [];
        for (let item of obj.sshKey) {
          var pt = [
            item.connectionConfig.regionDetail.location.longitude * 1 + 0.05,
            item.connectionConfig.regionDetail.location.latitude * 1,
          ];
          if (isTombstoneResource(item)) { tombLoc.push(pt); tombItems.push(item); }
          else normalLoc.push(pt);
        }
        geoResourceLocation.sshKey = normalLoc.length ? [new MultiPoint([normalLoc])] : [];
        geoResourceLocation.sshKeyTombstone = tombLoc.length ? [new MultiPoint([tombLoc])] : [];
        window.tombstoneRegistry.sshKey = tombItems;
      } else {
        geoResourceLocation.sshKey = [];
        geoResourceLocation.sshKeyTombstone = [];
        window.tombstoneRegistry.sshKey = [];
      }
      updateTombstoneBanner();
      
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
    var customImageUrl = `${tbApiBase()}/ns/${namespace}/resources/customImage`;
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
    var dataDiskUrl = `${tbApiBase()}/ns/${namespace}/resources/dataDisk`;
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
    // var objectStorageUrl = `${tbApiBase()}/ns/${namespace}/resources/objectStorage`;
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
    // var sqlDbUrl = `${tbApiBase()}/ns/${namespace}/resources/sqlDb`;
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
  let table = document.createElement("table");
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


// Draw Objects to the Map
function drawObjects(event) {

  // Place docked (locationless) Infras: a pixel-anchored list at the top-left,
  // re-derived every frame so it stays put through pan/zoom/resize. Each slot
  // is as tall as its own label block, so multi-line names never overlap.
  {
    let dockY = LOCATIONLESS_DOCK_TOP_PX;
    for (const [, data] of infraRenderMap) {
      if (!data.isLocationless || !data.isDocked) continue;
      const layout = getInfraLabelLayout(data);
      if (!layout) continue;
      const markerY = dockY - layout.top; // layout.top is negative (block starts above the marker centre)
      const coord = map.getCoordinateFromPixel([LOCATIONLESS_DOCK_LEFT_PX, markerY]);
      if (coord) data.geometry.setCoordinates(coord);
      dockY += layout.height + LOCATIONLESS_DOCK_GAP_PX;
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
      
      // Debug: log points before convex hull (controlled via DEBUG_CONFIG)
      debugLog.mapOp("Original points:", cspPointsCircle);
      debugLog.mapOp("Points copy:", pointsCopy);
      
      const hullPoints = convexHull(pointsCopy);
      
      // Debug: log hull result (controlled via DEBUG_CONFIG)
      debugLog.mapOp("Hull points:", hullPoints);
      
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
  // Tombstoned resources: rose halo drawn behind the resource's normal icon.
  const drawTombstones = (geom, iconStyle) => {
    if (!geom) return;
    vectorContext.setStyle(tombstoneHaloStyle);
    vectorContext.drawGeometry(geom);
    vectorContext.setStyle(iconStyle);
    vectorContext.drawGeometry(geom);
  };
  drawTombstones(geoResourceLocation.vnetTombstone && geoResourceLocation.vnetTombstone[0], iconStyleVnet);
  drawTombstones(geoResourceLocation.sgTombstone && geoResourceLocation.sgTombstone[0], iconStyleSG);
  drawTombstones(geoResourceLocation.sshKeyTombstone && geoResourceLocation.sshKeyTombstone[0], iconStyleKey);
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
      const { geometry, nodePoints, nodeStatuses, nodeProviders, nodeCommandStatuses, overLimitLabels, nodeCenterFlags } = geometryPoint;
      const vmBaseScale = changeSizeStatus(data.name + data.status);
      
      if (nodePoints && nodeStatuses) {
        const renderSingleNode = (nodeIndex) => {
          if (nodePoints[nodeIndex]) {
            const nodeCoords = nodePoints[nodeIndex];
            const nodeStatus = nodeStatuses[nodeIndex];
            const vmPoint = new Point(nodeCoords);
            const vmProvider = nodeProviders ? nodeProviders[nodeIndex] : null;
            const commandStatus = nodeCommandStatuses ? nodeCommandStatuses[nodeIndex] : "None";
            const vmStyles = createNodeStyleWithStatusBadge(nodeStatus, vmProvider, vmBaseScale, nodeCoords, commandStatus);
            
            vmStyles.forEach(style => {
              vectorContext.setStyle(style);
              vectorContext.drawGeometry(vmPoint);
            });
          }
        };

        // 1. Draw outer ring nodes first
        nodeStatuses.forEach((_, nodeIndex) => {
          if (!nodeCenterFlags || !nodeCenterFlags[nodeIndex]) {
            renderSingleNode(nodeIndex);
          }
        });

        // 2. Draw center nodes last so they stay on top and are never covered when zoomed out
        nodeStatuses.forEach((_, nodeIndex) => {
          if (nodeCenterFlags && nodeCenterFlags[nodeIndex]) {
            renderSingleNode(nodeIndex);
          }
        });
      }

      // If group exceeded maxVisibleNodes, display "(totalCount)" to the right of the rightmost node icon
      if (overLimitLabels && overLimitLabels.length > 0) {
        overLimitLabels.forEach(lbl => {
          const lblPoint = new Point(lbl.coord);
          vectorContext.setStyle(createNodeCountSuffixStyle(lbl.text));
          vectorContext.drawGeometry(lblPoint);
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

  // Draw Infra name + status labels (layout shared with findNearestInfra)
  {
    let infraDrawIdx = 0;
    for (const [, data] of infraRenderMap) {
      const layout = getInfraLabelLayout(data);
      if (!layout) { infraDrawIdx++; continue; }
      const anchorPoint = new Point(layout.anchor);
      const statusColors = getNodeStatusColor(data.status);

      // Placeholder marker for an Infra that has no Node positions yet
      if (data.isLocationless) {
        vectorContext.setStyle(new Style({
          image: new CircleStyle({
            radius: LOCATIONLESS_MARKER_RADIUS_PX,
            fill: new Fill({ color: [255, 255, 255, 0.85] }),
            stroke: new Stroke({ color: statusColors.stroke, width: 2, lineDash: [4, 3] }),
          }),
        }));
        vectorContext.drawGeometry(anchorPoint);
        vectorContext.setStyle(new Style({
          text: new Text({ text: '⏳', font: '11px sans-serif', textBaseline: 'middle' }),
        }));
        vectorContext.drawGeometry(anchorPoint);
      }

      layout.name.forEach((line, lineIndex) => {
        let displayText = line.text;
        
        if (lineIndex === 0 && data.targetAction) {
          const spinChars = ['⠿', '⠷', '⠯', '⠟', '⠻', '⠽', '⠾', '⠷','⠿'];
          const animIndex = Math.floor(drawCounter / 10 + infraDrawIdx) % spinChars.length;
          displayText = spinChars[animIndex] + ' ' + displayText;
        }
        
        const textColor = (lineIndex === 0 && data.targetAction) 
          ? getTargetActionColor(data.targetAction)
          : [0, 0, 0, 1];
        
        vectorContext.setStyle(new Style({
          text: new Text({
            text: displayText,
            font: "bold 10px sans-serif",
            scale: layout.nameScale,
            textAlign: layout.textAlign,
            textBaseline: layout.textBaseline,
            offsetX: line.offsetX,
            offsetY: line.offsetY,
            stroke: new Stroke({
              color: [255, 255, 255, 1],
              width: 1,
            }),
            fill: new Fill({
              color: textColor,
            }),
          }),
        }));
        vectorContext.drawGeometry(anchorPoint);
      });

      vectorContext.setStyle(new Style({
        text: new Text({
          text: data.status,
          font: "bold 10px sans-serif",
          scale: layout.statusScale,
          textAlign: layout.textAlign,
          textBaseline: layout.textBaseline,
          offsetX: layout.status.offsetX,
          offsetY: layout.status.offsetY,
          stroke: new Stroke({
            color: statusColors.stroke,
            width: 2,
          }),
          fill: new Fill({
            color: statusColors.fill,
          }),
        }),
      }));
      vectorContext.drawGeometry(anchorPoint);
      infraDrawIdx++;
    }
  }

  // Draw Infra NodeGroup labels
  if (showInfraNodeGroupLabels && infraNodeGroupPolygons.size > 0) {
    for (const [infraId, polygons] of infraNodeGroupPolygons) {
      if (Array.isArray(polygons)) {
        const ngNames = infraNodeGroupNames.get(infraId) || [];
        const ngColors = infraNodeGroupColors.get(infraId) || new globalThis.Map();
        polygons.forEach((polygon, idx) => {
          const ngName = polygon && (polygon.get('nodeGroupId') || ngNames[idx]);
          if (polygon && ngName) {
            // Anchor the label to the group's first Node icon rather than the hull
            // top: the hull is inflated in map units, so its top edge drifts
            // relative to the icons as the zoom changes and ends up on top of them.
            let anchor = polygon.get('labelAnchor');
            if (!anchor) {
              const extent = polygon.getExtent();
              anchor = [(extent[0] + extent[2]) / 2, extent[3]];
            }
            const labelPoint = new Point(anchor);
            const ngColor = ngColors.get(ngName) || '#2196F3';
            const ngRgb = hexToRgb(ngColor);
            const nodeCount = polygon.get('clusterNodeCount') || 0;
            const labelText = `${ngName} (${nodeCount})`;
            // Readability over map tiles: black text on a translucent white chip.
            // The group colour (not drawn anywhere else) survives only as the
            // chip border so groups stay distinguishable.
            // Icon is 52px * (2.4 * 0.3) ≈ 37px tall, centered on the point, and
            // the status badge sits ~18px below center. Pixel offsets keep this
            // clearance constant at every zoom level.
            vectorContext.setStyle(new Style({ image: getNodeGroupLabelChip(labelText, ngRgb) }));
            vectorContext.drawGeometry(labelPoint);
            vectorContext.setStyle(new Style({
              text: new Text({
                text: labelText,
                font: NODEGROUP_LABEL_FONT,
                textAlign: 'center',
                textBaseline: 'top',
                offsetY: NODEGROUP_LABEL_OFFSET_PX + 1.5 + NODEGROUP_CHIP_PAD_Y,
                fill: new Fill({ color: [20, 20, 20, 1] }),
              }),
            }));
            vectorContext.drawGeometry(labelPoint);
          }
        });
      }
    }
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
            const topY = extent[3];
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
                offsetY: 12,
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

