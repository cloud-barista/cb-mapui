/**
 * Resource Graph Module for CB-MapUI
 * 
 * Interactive resource relationship visualization using Cytoscape.js
 * 
 * Features:
 * - Automatic resource tree generation from Infra data
 * - Expand/collapse compound nodes
 * - Click to focus on related resources
 * - Right-click context menu for actions
 * - Real-time updates when Infra data changes
 * 
 * @author Cloud-Barista
 * @license Apache-2.0
 */

import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import Swal from 'sweetalert2';
import JSONFormatter from 'json-formatter-js';
import axios from 'axios';

// Register layout extension
cytoscape.use(fcose);

// ============================================================================
// CONFIGURATION
// ============================================================================

const GRAPH_CONFIG = {
  // Character width approximation for 12px font (used for label wrapping)
  charWidth: 7,
  
  // Node colors by resource type
  nodeColors: {
    namespace: '#e8eaed',    // Very light gray - namespace container
    infra: '#007bff',
    cluster: '#17a2b8',      // Teal - infra cluster (vNet-based grouping)
    nodegroup: '#6610f2',   // Indigo - distinct from subnet
    node: '#28a745',       // Green - Node
    gpu: '#ff6b6b',        // Coral red - GPU/Accelerator (AI workload emphasis)
    vnet: '#e6a700',       // Dark Gold - parent network
    subnet: '#ffc107',     // Yellow/Gold - child of vnet
    securityGroup: '#dc3545',
    sshKey: '#6f42c1',
    dataDisk: '#20c997',
    customImage: '#9c27b0',  // Purple - custom/snapshot images
    spec: '#e83e8c',
    image: '#795548',
    // CSP hierarchy colors
    cspRoot: '#2c3e50',    // Dark blue-gray - CSP container
    csp: '#ff6b35',        // Orange - cloud provider
    region: '#1e90ff',     // DodgerBlue - region
    zone: '#32cd32',       // LimeGreen - availability zone
    // Unused resources group
    unusedGroup: '#d5d8dc' // Very light gray - unused resources container
  },
  // Node shapes by resource type
  nodeShapes: {
    namespace: 'round-rectangle',
    infra: 'round-rectangle',
    cluster: 'round-rectangle',
    nodegroup: 'round-rectangle',
    node: 'ellipse',
    gpu: 'rhomboid',        // Parallelogram shape - distinct for GPU
    vnet: 'diamond',
    subnet: 'diamond',
    securityGroup: 'hexagon',
    sshKey: 'pentagon',
    dataDisk: 'barrel',
    customImage: 'octagon',  // Distinct shape for custom images
    spec: 'rectangle',
    image: 'rectangle',
    // CSP hierarchy shapes
    cspRoot: 'round-rectangle',
    csp: 'round-rectangle',
    region: 'round-rectangle',
    zone: 'round-rectangle'
  },
  // Layout options - fcose (faster, better compound node handling)
  layout: {
    name: 'fcose',
    quality: 'default',            // 'draft', 'default', 'proof'
    animate: true,
    animationDuration: 500,
    nodeDimensionsIncludeLabels: true,
    nodeSeparation: 40,            // Minimum distance between nodes (lower = tighter grid)
    idealEdgeLength: edge => 50,   // Edge length (shorter = children closer)
    nodeRepulsion: node => 4500,   // Node repulsion force
    nestingFactor: 0.1,            // Children closer to parent center
    gravity: 0.4,                  // Pull toward center
    gravityRange: 3.8,
    gravityCompound: 1.5,          // Pull compound members closer together
    gravityRangeCompound: 2.0,
    numIter: 2500,
    tile: true,
    tilingPaddingVertical: 5,      // Padding between tiled nodes (grid spacing)
    tilingPaddingHorizontal: 5,    // Padding between tiled nodes (grid spacing)
    edgeElasticity: edge => 0.45,  // Edge flexibility
    randomize: false,              // Consistent layout
    fit: true,
    padding: 30,
    // Packing options for disconnected components (compound nodes)
    packComponents: true,
    componentSpacing: 60           // Space between disconnected components
  },
  // Alternative layout - Concentric (type-based layers, flat nodes only)
  layoutConcentric: {
    name: 'concentric',
    animate: true,
    animationDuration: 500,
    fit: true,
    padding: 30,
    minNodeSpacing: 20,
    avoidOverlap: true,
    nodeDimensionsIncludeLabels: true,
    startAngle: 3 / 2 * Math.PI,
    clockwise: true,
    equidistant: false,
    spacingFactor: 0.6,
    concentric: function(node) {
      const type = node.data('type');
      const levels = {
        namespace: 6,
        cspRoot: 6,
        csp: 5,
        region: 4,
        zone: 3,
        infra: 4,
        cluster: 3.5,
        nodegroup: 3,
        node: 2,
        gpu: 2,   // Same level as Node (attached to Node)
        vnet: 2,
        subnet: 1,
        securityGroup: 1,
        sshKey: 1,
        dataDisk: 1,
        customImage: 1,
        spec: 0,
        image: 0
      };
      return levels[type] !== undefined ? levels[type] : 0;
    },
    levelWidth: function() { return 2; }
  },
  // Zoom limits
  zoom: {
    min: 0.1,
    max: 2.0,
    postFitMax: 1.5              // Maximum zoom after auto-fit (prevents over-zoom on few nodes)
  }
};

// ============================================================================
// GRAPH STATE
// ============================================================================

let cy = null;
let isGraphVisible = false;
let currentNamespace = null;
let lastDataHash = null;  // For change detection

// Focus state tracking - preserved across graph updates
let focusedNodeIds = new Set();  // Set of node IDs that are currently focused
let isCompactViewActive = false; // Whether compact view is active

// Node type visibility settings (toggled via legend)
// Some types are disabled by default to reduce visual complexity
const nodeTypeVisibility = {
  // Infrastructure (toggleable)
  infra: true,
  cluster: true,
  nodegroup: true,
  node: true,
  gpu: true,  // GPU nodes attached to Nodes (enabled by default for AI workload visibility)
  // Network resources
  vnet: true,
  subnet: false,  // Disabled by default (child of VNet)
  securityGroup: true,
  sshKey: true,
  dataDisk: false,  // Disabled by default
  customImage: true,  // Custom/snapshot images
  // CSP/Location hierarchy (disabled by default)
  cspRoot: false,
  csp: false,
  region: false,
  zone: false,
  // Spec/Image (disabled by default - too many connections)
  spec: false,
  image: false,
  // Unused resources group (enabled by default)
  unusedGroup: true
};

// Hierarchical dependencies: child -> parent chain
// When enabling a child, all parents must also be enabled
const nodeTypeDependencies = {
  // Location hierarchy: zone -> region -> csp -> cspRoot
  zone: ['region', 'csp', 'cspRoot'],
  region: ['csp', 'cspRoot'],
  csp: ['cspRoot'],
  // Network hierarchy: subnet -> vnet
  subnet: ['vnet'],
  // Infrastructure hierarchy: gpu -> node -> nodegroup -> infra (cluster is optional)
  gpu: ['node', 'nodegroup', 'infra'],
  node: ['nodegroup', 'infra'],
  nodegroup: ['infra'],
  cluster: ['infra'],
};

// Reverse dependencies: parent -> children
// When disabling a parent, all children should also be disabled
const nodeTypeChildren = {
  cspRoot: ['csp', 'region', 'zone'],
  csp: ['region', 'zone'],
  region: ['zone'],
  vnet: ['subnet'],
  infra: ['cluster', 'nodegroup', 'node', 'gpu'],
  cluster: [],
  nodegroup: ['node', 'gpu'],
  node: ['gpu']
};

/**
 * Get maximum width for a node type
 * @param {string} type - Node type
 * @returns {number} - Maximum width in pixels
 */
function getNodeMaxWidth(type) {
  switch (type) {
    case 'namespace':
    case 'cspRoot':
      return 200;
    case 'infra':
    case 'csp':
      return 160;
    case 'cluster':
    case 'nodegroup':
    case 'region':
      return 140;
    case 'node':
    case 'zone':
      return 130;
    case 'gpu':
      return 120;  // Compact for GPU info
    case 'vnet':
    case 'subnet':
      return 150;
    case 'securityGroup':
    case 'sshKey':
    case 'dataDisk':
    case 'customImage':
      return 130;
    case 'spec':
    case 'image':
      return 140;
    default:
      return 130;
  }
}

/**
 * Get max characters per line for a node type
 * @param {string} type - Node type
 * @returns {number} - Max characters per line
 */
function getMaxCharsPerLine(type) {
  const maxWidth = getNodeMaxWidth(type);
  return Math.floor(maxWidth / GRAPH_CONFIG.charWidth);
}

/**
 * Check if a node type is a compound/group node
 * Compound nodes expand to fit children, so their width is dynamic
 * @param {string} type - Node type
 * @returns {boolean} - True if compound node
 */
function isCompoundNodeType(type) {
  const compoundTypes = ['namespace', 'infra', 'cluster', 'nodegroup', 'vnet', 'cspRoot', 'csp', 'region'];
  return compoundTypes.includes(type);
}

/**
 * Format label with line breaks for long text
 * Cytoscape's text-wrap: 'wrap' only breaks on whitespace,
 * so we manually insert newlines for long continuous strings.
 * For compound nodes, returns label without line breaks (will be updated after layout)
 * @param {string} icon - Emoji icon
 * @param {string} text - Label text
 * @param {number} maxCharsPerLine - Max characters per line
 * @param {string} [nodeType] - Optional node type to check if compound
 * @returns {string} - Formatted label with newlines
 */
function formatLabel(icon, text, maxCharsPerLine, nodeType) {
  // Compound nodes: return without line breaks, will be reformatted after layout
  // based on actual rendered width
  if (nodeType && isCompoundNodeType(nodeType)) {
    return `${icon} ${text}`;
  }
  
  // Account for icon (2 chars including space after)
  const firstLineMax = maxCharsPerLine - 2;
  
  if (text.length <= firstLineMax) {
    return `${icon} ${text}`;
  }
  
  // Split long text into multiple lines
  const lines = [];
  let remaining = text;
  let isFirstLine = true;
  
  while (remaining.length > 0) {
    const lineMax = isFirstLine ? firstLineMax : maxCharsPerLine;
    
    if (remaining.length <= lineMax) {
      lines.push(remaining);
      break;
    }
    
    // Find best break point (prefer after hyphen, underscore, or dot)
    let breakPoint = lineMax;
    const breakChars = ['-', '_', '.', '/'];
    
    for (const char of breakChars) {
      const pos = remaining.lastIndexOf(char, lineMax);
      if (pos > lineMax * 0.4) {  // At least 40% of the line
        breakPoint = pos + 1;  // Break after the character
        break;
      }
    }
    
    lines.push(remaining.substring(0, breakPoint));
    remaining = remaining.substring(breakPoint);
    isFirstLine = false;
  }
  
  return `${icon} ${lines.join('\n')}`;
}

/**
 * Reformat compound node labels based on actual rendered width or node max width
 * Called after layout is complete
 * - For nodes with children (:parent): use actual bounding box width
 * - For nodes without children: use predefined max width (like regular nodes)
 */
function reformatCompoundNodeLabels() {
  if (!cy) return;
  
  // Process all nodes that are compound types (not just :parent)
  cy.nodes().forEach(node => {
    const type = node.data('type');
    if (!isCompoundNodeType(type)) return;
    
    const label = node.data('label') || '';
    // Skip if already has newlines (already formatted)
    if (label.includes('\n')) return;
    
    // Check if this node has children (is actually acting as a parent)
    const hasChildren = node.children().length > 0;
    
    let maxCharsPerLine;
    
    if (hasChildren) {
      // Has children: use actual bounding box width
      const bb = node.boundingBox();
      const actualWidth = bb.w;
      maxCharsPerLine = Math.floor(actualWidth / GRAPH_CONFIG.charWidth);
    } else {
      // No children: use predefined max width (like regular nodes)
      const maxWidth = getNodeMaxWidth(type);
      maxCharsPerLine = Math.floor(maxWidth / GRAPH_CONFIG.charWidth);
    }
    
    if (maxCharsPerLine < 10) return;  // Too narrow, skip
    
    // Extract icon and text from current label
    const iconMatch = label.match(/^([\p{Emoji}\p{Emoji_Presentation}]+)\s*/u);
    if (!iconMatch) return;
    
    const icon = iconMatch[1];
    const text = label.substring(iconMatch[0].length);
    
    // Reformat with calculated width (pass null for nodeType to force formatting)
    const newLabel = formatLabel(icon, text, maxCharsPerLine, null);
    if (newLabel !== label) {
      node.data('label', newLabel);
    }
  });
}

/**
 * Arrange nodes inside "Unused Resources" group in a compact grid layout
 * Called after main layout completes to organize unused resources neatly
 */
function arrangeUnusedResourcesInGrid() {
  if (!cy) return;
  
  // Find all unusedGroup nodes
  const unusedGroups = cy.nodes('[type="unusedGroup"]');
  if (unusedGroups.length === 0) return;
  
  unusedGroups.forEach(group => {
    const children = group.children();
    if (children.length === 0) return;
    
    // Get group's current bounding box center
    const groupBB = group.boundingBox();
    const centerX = (groupBB.x1 + groupBB.x2) / 2;
    const centerY = (groupBB.y1 + groupBB.y2) / 2;
    
    // Grid configuration
    const padding = 20;
    const cellWidth = 120;  // Width per cell
    const cellHeight = 80;  // Height per cell
    
    // Calculate optimal columns (aim for roughly square grid)
    const numNodes = children.length;
    const cols = Math.ceil(Math.sqrt(numNodes));
    const rows = Math.ceil(numNodes / cols);
    
    // Calculate grid dimensions
    const gridWidth = cols * cellWidth;
    const gridHeight = rows * cellHeight;
    
    // Starting position (top-left of grid, centered on group)
    const startX = centerX - (gridWidth / 2) + (cellWidth / 2);
    const startY = centerY - (gridHeight / 2) + (cellHeight / 2) + padding; // Extra padding for label
    
    // Position each child in grid
    children.forEach((child, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      
      const x = startX + (col * cellWidth);
      const y = startY + (row * cellHeight);
      
      child.position({ x, y });
    });
    
    console.debug(`[ResourceGraph] Arranged ${numNodes} unused resources in ${cols}x${rows} grid`);
  });
}

/**
 * Generate a simple hash for data comparison
 * @param {*} data - Data to hash
 * @returns {string} - Hash string
 */
function generateDataHash(data) {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

// ============================================================================
// GRAPH INITIALIZATION
// ============================================================================

/**
 * Initialize the Cytoscape graph instance
 * @param {string} containerId - DOM container ID for the graph
 */
// ── Edge line pattern (user-selectable at runtime) ──
// Three presets; different situations read better with different routing.
const EDGE_STYLES = {
  straight: { 'curve-style': 'bezier' }, // single edges straight, parallels fan
  arc: { 'curve-style': 'unbundled-bezier', 'control-point-distances': [36], 'control-point-weights': [0.5] },
  orthogonal: { 'curve-style': 'round-taxi', 'taxi-direction': 'auto', 'taxi-turn': 30, 'taxi-turn-min-distance': 10 },
};
let currentEdgeMode = 'arc'; // default

// Re-apply the chosen pattern as inline style on all edges (needed after
// updateGraph rebuilds edges, since new edges get the base stylesheet only).
function applyCurrentEdgeStyle() {
  if (!cy) return;
  cy.edges().style(EDGE_STYLES[currentEdgeMode]);
}

// Switch the edge line pattern: 'straight' | 'arc' | 'orthogonal'.
export function setEdgeStyle(mode) {
  if (!EDGE_STYLES[mode]) return;
  currentEdgeMode = mode;
  applyCurrentEdgeStyle();
  // Reflect the active button on the toolbar, if present.
  document.querySelectorAll('[data-edge-style]').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-edge-style') === mode);
  });
}

export function initResourceGraph(containerId = 'resource-graph-container') {
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn('[ResourceGraph] Container not found:', containerId);
    return null;
  }

  cy = cytoscape({
    container: container,
    // wheelSensitivity: 0.8,  // Removed: custom value causes unnatural zoom with standard mice
    minZoom: GRAPH_CONFIG.zoom.min,
    maxZoom: GRAPH_CONFIG.zoom.max,
    
    style: [
      // Base node style - rounded rectangle with manual line breaks (GoJS-like)
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'text-wrap': 'wrap',           // Required for \n to work in labels
          'font-size': '12px',
          'font-weight': 'bold',
          'color': '#fff',
          'text-outline-color': '#000',  // Black outline for better readability
          'text-outline-width': 2,
          'background-color': 'data(color)',
          'shape': 'round-rectangle',    // Rounded rectangle like GoJS
          'width': function(ele) {       // Fixed max width per type, min based on label
            const label = ele.data('label') || '';
            const type = ele.data('type');
            const maxWidth = getNodeMaxWidth(type);
            // Get longest line for width calculation
            const lines = label.split('\n');
            const longestLine = lines.reduce((a, b) => a.length > b.length ? a : b, '');
            const labelWidth = longestLine.length * 7;  // Approx width for 12px font
            return Math.max(80, Math.min(maxWidth, labelWidth + 20));
          },
          'height': function(ele) {      // Dynamic height based on actual newlines in label
            const label = ele.data('label') || '';
            const lines = label.split('\n').length;
            return Math.max(36, lines * 16 + 12);  // 16px per line + padding
          },
          'padding': '6px',
          // Shadow effect using underlay
          'underlay-color': '#555',
          'underlay-opacity': 0.18,
          'underlay-padding': 2,
          'underlay-shape': 'round-rectangle'
        }
      },
      // Compound node (parent) style - manual line breaks for group labels
      {
        selector: 'node:parent',
        style: {
          'text-valign': 'top',
          'text-halign': 'center',
          'text-wrap': 'wrap',           // Required for \n to work in labels
          'background-color': 'data(color)',
          'background-opacity': 0.25,    // Slightly transparent but visible
          'border-width': 2,
          'border-color': 'data(color)',
          'padding': '20px',
          // Shadow effect for compound nodes
          'underlay-color': '#666',
          'underlay-opacity': 0.15,
          'underlay-padding': 3,
          'underlay-shape': 'round-rectangle'
        }
      },
      // VNet compound node - distinct style
      {
        selector: 'node[type="vnet"]:parent',
        style: {
          'shape': 'round-rectangle',
          'background-opacity': 0.3,
          'border-style': 'dashed',
          'border-width': 3,
          'underlay-shape': 'round-rectangle'
        }
      },
      // Unused Resources compound node - distinct style
      {
        selector: 'node[type="unusedGroup"]',
        style: {
          'shape': 'round-rectangle',
          'background-color': GRAPH_CONFIG.nodeColors.unusedGroup,
          'background-opacity': 0.15,
          'border-style': 'dashed',
          'border-width': 2,
          'border-color': GRAPH_CONFIG.nodeColors.unusedGroup,
          'text-valign': 'top',
          'text-halign': 'center',
          'font-weight': 'bold',
          'padding': '25px',
          'underlay-color': GRAPH_CONFIG.nodeColors.unusedGroup,
          'underlay-opacity': 0.1,
          'underlay-padding': 10,
          'underlay-shape': 'round-rectangle'
        }
      },
      // Edge style
      {
        selector: 'edge',
        style: {
          'width': 2,
          'line-color': '#999',
          'target-arrow-color': '#999',
          'target-arrow-shape': 'triangle',
          // Default line pattern = Arc (smooth). The user can switch between
          // Straight / Arc / Orthogonal at runtime via setEdgeStyle() — see
          // EDGE_STYLES. These base props match the 'arc' preset for first paint.
          'curve-style': 'unbundled-bezier',
          'control-point-distances': [36],  // arc height at the midpoint
          'control-point-weights': [0.5],   // control point at the edge midpoint
          'control-point-step-size': 40,    // spacing when parallel edges fan out
          'opacity': 0.7,
          'events': 'no'  // Disable mouse events on edges (not selectable)
        }
      },
      // Selected node style
      {
        selector: 'node:selected',
        style: {
          'border-width': 4,
          'border-color': '#ff6b6b',
          'background-opacity': 1
        }
      },
      // Highlighted (neighbor) node style
      {
        selector: 'node.highlighted',
        style: {
          'border-width': 3,
          'border-color': '#ffd93d',
          'background-opacity': 0.9
        }
      },
      // Faded style for non-focused elements
      {
        selector: '.faded',
        style: {
          'opacity': 0.2
        }
      },
      // Hidden style for completely invisible elements (second click on focused node)
      {
        selector: '.hidden',
        style: {
          'display': 'none'
        }
      },
      // Type-hidden style for nodes hidden via legend toggle
      {
        selector: '.type-hidden',
        style: {
          'display': 'none'
        }
      },
      // Highlighted edge style for focus view
      {
        selector: 'edge.highlighted-edge',
        style: {
          'width': 3,
          'opacity': 1,
          'line-color': '#333333',
          'target-arrow-color': '#333333',
          'z-index': 999
        }
      },
      // Status-based text colors for Node and Infra (text-outline stays black for contrast)
      // Running states - Green
      {
        selector: 'node[status="Running"]',
        style: {
          'color': '#10b981'  // emerald-500
        }
      },
      // Creating/Starting states - Blue
      {
        selector: 'node[status="Creating"]',
        style: {
          'color': '#3b82f6'  // blue-500
        }
      },
      // Registering state - Teal (registering existing CSP Node)
      {
        selector: 'node[status="Registering"]',
        style: {
          'color': '#14b8a6'  // teal-500
        }
      },
      // Reconciling state - Indigo (re-syncing Node with CSP truth)
      {
        selector: 'node[status="Reconciling"]',
        style: {
          'color': '#6366f1'  // indigo-500
        }
      },
      {
        selector: 'node[status="Resuming"]',
        style: {
          'color': '#06b6d4'  // cyan-500
        }
      },
      // Preparing states - Orange
      {
        selector: 'node[status="Preparing"]',
        style: {
          'color': '#f97316'  // orange-500
        }
      },
      {
        selector: 'node[status="Prepared"]',
        style: {
          'color': '#ea580c'  // orange-600
        }
      },
      // Empty state - Gray
      {
        selector: 'node[status="Empty"]',
        style: {
          'color': '#9ca3af'  // gray-400
        }
      },
      // Suspended states - Amber
      {
        selector: 'node[status="Suspended"]',
        style: {
          'color': '#f59e0b'  // amber-500
        }
      },
      {
        selector: 'node[status="Suspending"]',
        style: {
          'color': '#d97706'  // amber-600
        }
      },
      // Rebooting - Purple
      {
        selector: 'node[status="Rebooting"]',
        style: {
          'color': '#8b5cf6'  // violet-500
        }
      },
      // Terminating/Terminated - Red
      {
        selector: 'node[status="Terminating"]',
        style: {
          'color': '#ef4444'  // red-500
        }
      },
      {
        selector: 'node[status="Terminated"]',
        style: {
          'color': '#dc2626'  // red-600
        }
      },
      // Failed - Dark red
      {
        selector: 'node[status="Failed"]',
        style: {
          'color': '#b91c1c'  // red-700
        }
      },
      // Undefined - Gray
      {
        selector: 'node[status="Undefined"]',
        style: {
          'color': '#6b7280'  // gray-500
        }
      },
      // Collapsed node indicator
      {
        selector: 'node.collapsed',
        style: {
          'background-image': 'none',
          'border-style': 'double',
          'border-width': 4
        }
      },
      // Unknown resource indicator (dashed border, slightly transparent)
      {
        selector: 'node[?isUnknown]',
        style: {
          'border-style': 'dashed',
          'border-width': 3,
          'border-color': '#888',
          'opacity': 0.7
        }
      },
      // Invisible edge style (for keeping siblings close)
      {
        selector: 'edge[?invisible]',
        style: {
          'opacity': 0,
          'width': 0
        }
      }
    ],
    
    // Interaction options (zoom levels defined above)
    boxSelectionEnabled: true,
    autounselectify: false
  });

  // Register event handlers
  registerGraphEvents();

  console.log('[ResourceGraph] Initialized successfully');
  return cy;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function registerGraphEvents() {
  if (!cy) return;

  // Single click - focus on neighbors (accumulative selection)
  cy.on('tap', 'node', function(evt) {
    evt.stopPropagation();  // Prevent background click handler
    const node = evt.target;
    focusOnNeighbors(node);
  });

  // Double click - show node info popup
  cy.on('dbltap', 'node', function(evt) {
    evt.stopPropagation();  // Prevent background click handler
    const node = evt.target;
    showNodeInfo(node);
  });

  // Right click - context menu
  cy.on('cxttap', 'node', function(evt) {
    evt.preventDefault();
    evt.stopPropagation();  // Prevent background click handler
    const node = evt.target;
    // Use browser's mouse position (clientX/clientY) for accurate fixed positioning
    const position = {
      x: evt.originalEvent.clientX,
      y: evt.originalEvent.clientY
    };
    showContextMenu(node, position);
  });

  // Click on background - reset focus
  cy.on('tap', function(evt) {
    if (evt.target === cy) {
      resetFocus();
      hideContextMenu();
    }
  });

  // Mouse hover - show tooltip
  cy.on('mouseover', 'node', function(evt) {
    const node = evt.target;
    showTooltip(node, evt.renderedPosition);
  });

  cy.on('mouseout', 'node', function() {
    hideTooltip();
  });
}

// ============================================================================
// DATA TRANSFORMATION
// ============================================================================

/**
 * Transform Infra data to Cytoscape graph format
 * @param {Array} infraList - Array of Infra objects from CB-Tumblebug
 * @param {string} namespace - Current namespace
 * @returns {Object} - { nodes: [], edges: [] }
 */
export function infraDataToGraph(infraList, namespace) {
  const nodes = [];
  const edges = [];
  const resourceSet = new Set(); // Track unique resources
  
  // Get resource data from central store
  const centralData = window.cloudBaristaCentralData || {};
  const vNetList = centralData.vNet || [];
  const securityGroupList = centralData.securityGroup || [];
  const sshKeyList = centralData.sshKey || [];
  
  // Build lookup maps for resources
  const vNetMap = new Map();
  const subnetToVNetMap = new Map();
  vNetList.forEach(vnet => {
    vNetMap.set(vnet.id, vnet);
    if (vnet.subnetInfoList) {
      vnet.subnetInfoList.forEach(subnet => {
        subnetToVNetMap.set(subnet.id, vnet.id);
      });
    }
  });
  
  const sgMap = new Map();
  securityGroupList.forEach(sg => sgMap.set(sg.id, sg));
  
  const sshKeyMap = new Map();
  sshKeyList.forEach(key => sshKeyMap.set(key.id, key));

  // Namespace node (root)
  const nsId = `ns-${namespace}`;
  nodes.push({
    data: {
      id: nsId,
      label: formatLabel('📁', namespace, getMaxCharsPerLine('namespace'), 'namespace'),
      type: 'namespace',
      color: GRAPH_CONFIG.nodeColors.namespace,
      originalData: { id: namespace, type: 'namespace' }
    }
  });

  // ========== CSP / Region / Zone hierarchy ==========
  // Track created CSP/Region/Zone nodes to avoid duplicates
  const cspNodes = new Set();
  const regionNodes = new Set();
  const zoneNodes = new Set();
  
  // Helper function to extract location info from resource
  function getLocationInfo(resource) {
    if (!resource || !resource.connectionConfig) return null;
    const cc = resource.connectionConfig;
    const rz = cc.regionZoneInfo || {};
    return {
      provider: cc.providerName || null,
      region: rz.assignedRegion || null,
      zone: rz.assignedZone || null
    };
  }
  
  // Helper function to create CSP/Region/Zone hierarchy nodes and return the target node ID
  function ensureLocationNodes(locationInfo) {
    // Skip if CSP nodes are disabled via legend toggle
    if (!nodeTypeVisibility.csp) return null;
    if (!locationInfo || !locationInfo.provider) return null;
    
    const { provider, region, zone } = locationInfo;
    
    // Create CSP root group node if not exists (independent of namespace)
    const cspRootId = 'csp-root';
    if (nodeTypeVisibility.cspRoot && !resourceSet.has(cspRootId)) {
      resourceSet.add(cspRootId);
      nodes.push({
        data: {
          id: cspRootId,
          label: '☁️ Cloud Providers',
          type: 'cspRoot',
          color: GRAPH_CONFIG.nodeColors.cspRoot,
          originalData: { id: 'csp-root', type: 'cspRoot' }
        }
      });
    }
    
    const cspNodeId = `csp-${provider}`;
    
    // Create CSP node if not exists (parent is csp-root if visible, otherwise no parent)
    if (!cspNodes.has(cspNodeId)) {
      cspNodes.add(cspNodeId);
      nodes.push({
        data: {
          id: cspNodeId,
          label: formatLabel('☁️', provider.toUpperCase(), getMaxCharsPerLine('csp'), 'csp'),
          parent: nodeTypeVisibility.cspRoot ? cspRootId : undefined,
          type: 'csp',
          color: GRAPH_CONFIG.nodeColors.csp,
          provider: provider,
          originalData: { id: provider, type: 'csp', provider }
        }
      });
    }
    
    // If no region or region visibility disabled, return CSP node
    if (!region || !nodeTypeVisibility.region) return cspNodeId;
    
    const regionNodeId = `region-${provider}-${region}`;
    
    // Create Region node if not exists
    if (!regionNodes.has(regionNodeId)) {
      regionNodes.add(regionNodeId);
      nodes.push({
        data: {
          id: regionNodeId,
          label: formatLabel('🌍', region, getMaxCharsPerLine('region'), 'region'),
          parent: cspNodeId,
          type: 'region',
          color: GRAPH_CONFIG.nodeColors.region,
          provider: provider,
          region: region,
          originalData: { id: region, type: 'region', provider, region }
        }
      });
    }
    
    // If no zone or zone visibility disabled, return Region node
    if (!zone || !nodeTypeVisibility.zone) return regionNodeId;
    
    const zoneNodeId = `zone-${provider}-${region}-${zone}`;
    
    // Create Zone node if not exists
    if (!zoneNodes.has(zoneNodeId)) {
      zoneNodes.add(zoneNodeId);
      nodes.push({
        data: {
          id: zoneNodeId,
          label: formatLabel('📍', zone, getMaxCharsPerLine('zone')),
          parent: regionNodeId,
          type: 'zone',
          color: GRAPH_CONFIG.nodeColors.zone,
          provider: provider,
          region: region,
          zone: zone,
          originalData: { id: zone, type: 'zone', provider, region, zone }
        }
      });
    }
    
    return zoneNodeId;
  }
  
  // Helper to create edge from resource to its location (Zone > Region > CSP)
  function createLocationEdge(sourceNodeId, resource, edgeSet) {
    const locationInfo = getLocationInfo(resource);
    const targetNodeId = ensureLocationNodes(locationInfo);
    if (targetNodeId) {
      const edgeId = `edge-${sourceNodeId}-${targetNodeId}`;
      if (!edgeSet.has(edgeId)) {
        edgeSet.add(edgeId);
        edges.push({
          data: {
            id: edgeId,
            source: sourceNodeId,
            target: targetNodeId,
            type: 'location',  // Mark as location edge for filtering
            relationship: 'hosted-in'
          }
        });
      }
    }
    return targetNodeId;
  }
  
  // Track location edges to avoid duplicates
  const locationEdgeSet = new Set();
  // Create VNet nodes with their Subnets as children (compound structure)
  const vnetNodeIds = [];  // Track for sibling edges
  if (nodeTypeVisibility.vnet) {
    vNetList.forEach(vnet => {
      if (resourceSet.has(`vnet-${vnet.id}`)) return;
      resourceSet.add(`vnet-${vnet.id}`);
      
      const vnetNodeId = `vnet-${vnet.id}`;
      vnetNodeIds.push(vnetNodeId);  // Track for sibling edges
      
      // VNet as compound node (parent of subnets)
      nodes.push({
        data: {
          id: vnetNodeId,
          label: formatLabel('🌐', vnet.id, getMaxCharsPerLine('vnet'), 'vnet'),
          parent: nsId,
          type: 'vnet',
          color: GRAPH_CONFIG.nodeColors.vnet,
          fullId: vnet.id,
          cidrBlock: vnet.cidrBlock,
          originalData: vnet
        }
      });
      
      // Create edge to CSP/Region/Zone if location info exists
      createLocationEdge(vnetNodeId, vnet, locationEdgeSet);
      
      // Add Subnet nodes as children of VNet (only if subnet visibility is enabled)
      const subnetNodeIds = [];
      if (nodeTypeVisibility.subnet && vnet.subnetInfoList && Array.isArray(vnet.subnetInfoList)) {
        vnet.subnetInfoList.forEach(subnet => {
          // Include vnet.id in subnet node ID for uniqueness across VNets
          const subnetNodeId = `subnet-${vnet.id}-${subnet.id}`;
          if (!resourceSet.has(subnetNodeId)) {
            resourceSet.add(subnetNodeId);
            subnetNodeIds.push(subnetNodeId);
            nodes.push({
              data: {
                id: subnetNodeId,
                label: formatLabel('🔀', subnet.name || subnet.id, getMaxCharsPerLine('subnet')),
                parent: vnetNodeId, // Subnet is child of VNet
                type: 'subnet',
                color: GRAPH_CONFIG.nodeColors.subnet,
                fullId: subnet.id,
                vNetId: vnet.id,
                ipv4_CIDR: subnet.ipv4_CIDR,
                originalData: subnet
              }
            });
          }
        });
        
        // Add invisible edges between subnets in the same VNet to keep them close
        // (Subnets are typically few, so invisible edges work better than tiling)
        for (let i = 0; i < subnetNodeIds.length - 1; i++) {
          edges.push({
            data: {
              id: `subnet-link-${vnetNodeId}-${i}`,
              source: subnetNodeIds[i],
              target: subnetNodeIds[i + 1],
              type: 'subnet-sibling',
              invisible: true
            }
          });
        }
      }
    });
  }

  // Add invisible edges between VNets to keep them grouped
  for (let i = 0; i < vnetNodeIds.length - 1; i++) {
    edges.push({
      data: {
        id: `vnet-link-${i}`,
        source: vnetNodeIds[i],
        target: vnetNodeIds[i + 1],
        type: 'vnet-sibling',
        invisible: true
      }
    });
  }

  // Create SecurityGroup nodes (bound to namespace)
  const sgNodeIds = [];  // Track for sibling edges
  if (nodeTypeVisibility.securityGroup) {
    securityGroupList.forEach(sg => {
      if (resourceSet.has(`sg-${sg.id}`)) return;
      resourceSet.add(`sg-${sg.id}`);
      sgNodeIds.push(`sg-${sg.id}`);  // Track for sibling edges
      
      nodes.push({
        data: {
          id: `sg-${sg.id}`,
          label: formatLabel('🛡️', sg.id, getMaxCharsPerLine('securityGroup')),
          parent: nsId,
          type: 'securityGroup',
          color: GRAPH_CONFIG.nodeColors.securityGroup,
          fullId: sg.id,
          vNetId: sg.vNetId,  // Store vNetId for edge creation
          originalData: sg
        }
      });
      
      // Create edge to VNet if vNetId exists and vnet visibility is enabled
      if (sg.vNetId && nodeTypeVisibility.vnet) {
        const vnetNodeId = `vnet-${sg.vNetId}`;
        const edgeId = `edge-sg-vnet-${sg.id}-${sg.vNetId}`;
        // Only create edge if VNet node exists
        if (resourceSet.has(vnetNodeId) && !edges.find(e => e.data.id === edgeId)) {
          edges.push({
            data: {
              id: edgeId,
              source: `sg-${sg.id}`,
              target: vnetNodeId,
              relationship: 'belongs-to',
              type: 'sg-vnet'
            }
          });
        }
      }
      
      // Create edge to CSP/Region/Zone if location info exists
      createLocationEdge(`sg-${sg.id}`, sg, locationEdgeSet);
    });
  }

  // Add invisible edges between SecurityGroups to keep them grouped
  for (let i = 0; i < sgNodeIds.length - 1; i++) {
    edges.push({
      data: {
        id: `sg-link-${i}`,
        source: sgNodeIds[i],
        target: sgNodeIds[i + 1],
        type: 'sg-sibling',
        invisible: true
      }
    });
  }

  // Create SSHKey nodes (bound to namespace)
  const sshKeyNodeIds = [];  // Track for sibling edges
  if (nodeTypeVisibility.sshKey) {
    sshKeyList.forEach(key => {
      if (resourceSet.has(`sshkey-${key.id}`)) return;
      resourceSet.add(`sshkey-${key.id}`);
      sshKeyNodeIds.push(`sshkey-${key.id}`);  // Track for sibling edges
      
      nodes.push({
        data: {
          id: `sshkey-${key.id}`,
          label: formatLabel('🔑', key.id, getMaxCharsPerLine('sshKey')),
          parent: nsId,
          type: 'sshKey',
          color: GRAPH_CONFIG.nodeColors.sshKey,
          fullId: key.id,
          originalData: key
        }
      });
      
      // Create edge to CSP/Region/Zone if location info exists
      createLocationEdge(`sshkey-${key.id}`, key, locationEdgeSet);
    });
  }

  // Add invisible edges between SSHKeys to keep them grouped
  for (let i = 0; i < sshKeyNodeIds.length - 1; i++) {
    edges.push({
      data: {
        id: `sshkey-link-${i}`,
        source: sshKeyNodeIds[i],
        target: sshKeyNodeIds[i + 1],
        type: 'sshkey-sibling',
        invisible: true
      }
    });
  }

  // Create DataDisk nodes (bound to namespace)
  const dataDiskList = centralData.dataDisk || [];
  const dataDiskNodeIds = [];  // Track for sibling edges
  
  // Debug: Log namespace-level dataDisk list
  if (dataDiskList.length > 0) {
    console.debug(`[ResourceGraph] Namespace has ${dataDiskList.length} DataDisks:`, dataDiskList.map(d => d.id));
  }
  
  // Build lookup map for dataDisk
  const dataDiskMap = new Map();
  dataDiskList.forEach(disk => dataDiskMap.set(disk.id, disk));
  
  if (nodeTypeVisibility.dataDisk) {
    dataDiskList.forEach(disk => {
      if (resourceSet.has(`disk-${disk.id}`)) return;
      resourceSet.add(`disk-${disk.id}`);
      dataDiskNodeIds.push(`disk-${disk.id}`);  // Track for sibling edges
      
      nodes.push({
        data: {
          id: `disk-${disk.id}`,
          label: formatLabel('💾', disk.id, getMaxCharsPerLine('dataDisk')),
          parent: nsId,
          type: 'dataDisk',
          color: GRAPH_CONFIG.nodeColors.dataDisk,
          fullId: disk.id,
          diskType: disk.diskSize,
          diskSize: disk.diskSize,
          originalData: disk
        }
      });
      
      // Create edge to CSP/Region/Zone if location info exists
      createLocationEdge(`disk-${disk.id}`, disk, locationEdgeSet);
    });
  }

  // Add invisible edges between DataDisks to keep them grouped
  for (let i = 0; i < dataDiskNodeIds.length - 1; i++) {
    edges.push({
      data: {
        id: `disk-link-${i}`,
        source: dataDiskNodeIds[i],
        target: dataDiskNodeIds[i + 1],
        type: 'disk-sibling',
        invisible: true
      }
    });
  }

  // Create CustomImage nodes (bound to namespace)
  // CustomImage is a user-created snapshot image, different from public CSP images
  const customImageList = centralData.customImage || [];
  const customImageNodeIds = [];  // Track for sibling edges
  
  // Debug: Log namespace-level customImage list
  if (customImageList.length > 0) {
    console.debug(`[ResourceGraph] Namespace has ${customImageList.length} CustomImages:`, customImageList.map(img => img.id));
  }
  
  // Build lookup map for customImage
  const customImageMap = new Map();
  customImageList.forEach(img => customImageMap.set(img.id, img));
  
  if (nodeTypeVisibility.customImage) {
    customImageList.forEach(img => {
      if (resourceSet.has(`customimg-${img.id}`)) return;
      resourceSet.add(`customimg-${img.id}`);
      customImageNodeIds.push(`customimg-${img.id}`);  // Track for sibling edges
      
      nodes.push({
        data: {
          id: `customimg-${img.id}`,
          label: formatLabel('📷', img.id, getMaxCharsPerLine('customImage')),
          parent: nsId,
          type: 'customImage',
          color: GRAPH_CONFIG.nodeColors.customImage,
          fullId: img.id,
          sourceNodeId: img.sourceNodeId || '',
          status: img.status || '',
          originalData: img
        }
      });
      
      // Create edge to CSP/Region/Zone if location info exists
      createLocationEdge(`customimg-${img.id}`, img, locationEdgeSet);
    });
  }

  // Add invisible edges between CustomImages to keep them grouped
  for (let i = 0; i < customImageNodeIds.length - 1; i++) {
    edges.push({
      data: {
        id: `customimg-link-${i}`,
        source: customImageNodeIds[i],
        target: customImageNodeIds[i + 1],
        type: 'customImage-sibling',
        invisible: true
      }
    });
  }

  // Return early if no Infra data (but we still show resources)
  if (!infraList || infraList.length === 0) {
    return { nodes, edges };
  }

  const infraNodeIds = [];  // Track for sibling edges
  const specNodeIds = [];  // Track Spec nodes for sibling edges
  const imageNodeIds = [];  // Track Image nodes for sibling edges

  infraList.forEach(infra => {
    // Skip Infra if visibility disabled
    if (!nodeTypeVisibility.infra) return;
    
    const infraId = `infra-${infra.id}`;
    infraNodeIds.push(infraId);  // Track for sibling edges
    
    // Infra node (compound parent)
    nodes.push({
      data: {
        id: infraId,
        label: formatLabel('🖥️', infra.name || infra.id, getMaxCharsPerLine('infra'), 'infra'),
        parent: nsId,
        type: 'infra',
        status: infra.status,
        color: GRAPH_CONFIG.nodeColors.infra,
        originalData: infra
      }
    });

    // Process Nodes
    if (infra.node && Array.isArray(infra.node)) {
      // Build cluster lookup: nodeGroupId -> clusterId
      const nodeGroupToCluster = {};
      if (infra.cluster && Array.isArray(infra.cluster)) {
        infra.cluster.forEach(cluster => {
          if (cluster.nodeGroupIds && Array.isArray(cluster.nodeGroupIds)) {
            cluster.nodeGroupIds.forEach(ngId => {
              nodeGroupToCluster[ngId] = cluster.id;
            });
          }
        });
        
        // Create cluster compound nodes
        if (nodeTypeVisibility.cluster) {
          infra.cluster.forEach(cluster => {
            const clusterNodeId = `cluster-${infra.id}-${cluster.id}`;
            nodes.push({
              data: {
                id: clusterNodeId,
                label: formatLabel('🗂️', cluster.id, getMaxCharsPerLine('cluster'), 'cluster'),
                parent: infraId,
                type: 'cluster',
                color: GRAPH_CONFIG.nodeColors.cluster,
                originalData: { id: cluster.id, type: 'cluster', infraId: infra.id, vNetId: cluster.vNetId, nodeCount: cluster.nodeCount, connectionNames: cluster.connectionNames }
              }
            });
          });
        }
      }
      
      // Group Nodes by nodeGroupId
      const nodeGroups = {};
      
      infra.node.forEach(nd => {
        const sgId = nd.nodeGroupId || 'default';
        if (!nodeGroups[sgId]) {
          nodeGroups[sgId] = [];
        }
        nodeGroups[sgId].push(nd);
      });

      // Always create nodegroup nodes (even if only 1 nodegroup)
      const nodeGroupIds = Object.keys(nodeGroups);
      const hasSingleNodeGroup = nodeGroupIds.length === 1;
      
      // Track nodegroup node IDs for invisible sibling edges
      const nodeGroupNodeIds = [];

      // Track edges at different levels for consolidation
      const infraEdges = {
        vNets: new Set(),
        subnets: new Set(),
        securityGroups: new Set(),
        sshKeys: new Set(),
        specs: new Set(),
        images: new Set(),
        dataDisks: new Set()
      };

      Object.entries(nodeGroups).forEach(([nodeGroupId, groupNodes]) => {
        const nodeGroupNodeId = `nodegroup-${infra.id}-${nodeGroupId}`;
        nodeGroupNodeIds.push(nodeGroupNodeId);  // Track for sibling edges
        
        // Create nodegroup node only if visibility enabled
        if (nodeTypeVisibility.nodegroup) {
          const clusterOfThisGroup = nodeGroupToCluster[nodeGroupId];
          const nodegroupParent = (clusterOfThisGroup && nodeTypeVisibility.cluster)
            ? `cluster-${infra.id}-${clusterOfThisGroup}`
            : infraId;
          nodes.push({
            data: {
              id: nodeGroupNodeId,
              label: formatLabel('📦', nodeGroupId, getMaxCharsPerLine('nodegroup'), 'nodegroup'),
              parent: nodegroupParent,
              type: 'nodegroup',
              color: GRAPH_CONFIG.nodeColors.nodegroup,
              originalData: { id: nodeGroupId, type: 'nodegroup', infraId: infra.id, nodeCount: groupNodes.length }
            }
          });
        }

        // Track edges at nodegroup level for consolidation
        const nodeGroupEdges = {
          vNets: new Set(),
          subnets: new Set(),
          securityGroups: new Set(),
          sshKeys: new Set(),
          specs: new Set(),
          images: new Set(),
          dataDisks: new Set()
        };

        // Track Node IDs for invisible sibling edges within nodegroup
        const computeNodeIds = [];

        groupNodes.forEach(nd => {
          // Include Infra ID in Node ID to ensure uniqueness across Infras
          const computeNodeId = `node-${infra.id}-${nd.id}`;
          computeNodeIds.push(computeNodeId);  // Track for sibling edges
          
          // Skip Node creation if visibility disabled
          if (!nodeTypeVisibility.node) return;
          
          // Debug: Log dataDiskIds for each Node
          if (nd.dataDiskIds && nd.dataDiskIds.length > 0) {
            console.debug(`[ResourceGraph] Node ${nd.id} has dataDiskIds:`, nd.dataDiskIds);
          }
          
          // Node - parent is nodegroup if visible, otherwise Infra
          const nodeParent = nodeTypeVisibility.nodegroup ? nodeGroupNodeId : infraId;

          // Determine Node icon based on GPU/accelerator availability
          // Note: spec/image fields contain summary info (not specSummary/imageSummary)
          const nodeSpec = nd.spec || nd.specSummary || {};
          const hasGpu = nodeSpec.acceleratorType?.toLowerCase() === 'gpu' ||
                        nodeSpec.acceleratorModel ||
                        nodeSpec.acceleratorCount > 0;

          // Node label: "💻 node-name" (GPU indicator removed - separate GPU node exists)
          const ndName = nd.name || nd.id;
          const ndLabelText = ndName;

          nodes.push({
            data: {
              id: computeNodeId,
              label: formatLabel('💻', ndLabelText, getMaxCharsPerLine('node')),
              parent: nodeParent,
              type: 'node',
              status: nd.status,
              color: GRAPH_CONFIG.nodeColors.node,
              publicIP: nd.publicIP,
              privateIP: nd.privateIP,
              hasGpu: hasGpu,
              infraId: infra.id,
              originalData: nd
            }
          });

          // Create GPU node if Node has GPU and gpu visibility is enabled
          if (hasGpu && nodeTypeVisibility.gpu) {
            const gpuNodeId = `gpu-${infra.id}-${nd.id}`;

            // GPU label: model name only (details available in View Details)
            const gpuLabel = nodeSpec.acceleratorModel || 'GPU';

            nodes.push({
              data: {
                id: gpuNodeId,
                label: gpuLabel,  // No icon, model + details on separate lines
                parent: nodeParent,  // Same parent as Node (nodegroup or Infra)
                type: 'gpu',
                color: GRAPH_CONFIG.nodeColors.gpu,
                acceleratorModel: nodeSpec.acceleratorModel,
                acceleratorCount: nodeSpec.acceleratorCount,
                acceleratorMemoryGB: nodeSpec.acceleratorMemoryGB,
                acceleratorType: nodeSpec.acceleratorType,
                originalData: {
                  id: gpuNodeId,
                  type: 'gpu',
                  nodeId: nd.id,
                  ndName: nd.name,
                  ...nodeSpec
                }
              }
            });

            // Create edge from Node to GPU (tight coupling)
            edges.push({
              data: {
                id: `edge-${computeNodeId}-${gpuNodeId}`,
                source: computeNodeId,
                target: gpuNodeId,
                relationship: 'has-gpu',
                type: 'gpu-link'  // Mark for special styling if needed
              }
            });
          }

          // Create edge to CSP/Region/Zone if location info exists
          createLocationEdge(computeNodeId, nd, locationEdgeSet);

          // Collect subnet connections for consolidation
          // Collect VNet and Subnet connections for consolidation (only if visibility enabled)
          if (nd.subnetId && nodeTypeVisibility.vnet) {
            const isSubnetUnknown = nd.subnetId === 'unknown';
            const isVNetUnknown = !nd.vNetId || nd.vNetId === 'unknown';
            
            // Determine VNet node ID
            const vnetNodeId = isVNetUnknown ? 'vnet-unknown' : `vnet-${nd.vNetId}`;
            
            // Create VNet node if unknown (known VNets are created from vNetList)
            if (isVNetUnknown && !resourceSet.has(vnetNodeId)) {
              resourceSet.add(vnetNodeId);
              nodes.push({
                data: {
                  id: vnetNodeId,
                  label: '🌐 VNet (unknown)',
                  parent: nsId,
                  type: 'vnet',
                  color: GRAPH_CONFIG.nodeColors.vnet,
                  isUnknown: true,
                  fullId: 'unknown',
                  originalData: { id: 'unknown', type: 'vnet' }
                }
              });
            }
            
            // Track VNet edge
            nodeGroupEdges.vNets.add(vnetNodeId);
            
            // Subnet node ID includes VNet ID for uniqueness (same subnet ID can exist in different VNets)
            const vnetIdForSubnet = isVNetUnknown ? 'unknown' : nd.vNetId;
            const subnetNodeId = isSubnetUnknown 
              ? 'subnet-unknown'  // Single shared node for all unknown subnets
              : `subnet-${vnetIdForSubnet}-${nd.subnetId}`;
            
            // Create subnet node only if it doesn't exist and subnet visibility is enabled
            if (nodeTypeVisibility.subnet && !resourceSet.has(subnetNodeId)) {
              resourceSet.add(subnetNodeId);
              const subnetText = isSubnetUnknown 
                ? 'Subnet (unknown)'
                : nd.subnetId;
              
              nodes.push({
                data: {
                  id: subnetNodeId,
                  label: formatLabel('🔀', subnetText, getMaxCharsPerLine('subnet')),
                  parent: vnetNodeId,  // Subnet is always child of VNet
                  type: 'subnet',
                  color: GRAPH_CONFIG.nodeColors.subnet,
                  isUnknown: isSubnetUnknown,
                  fullId: nd.subnetId,
                  vNetId: vnetIdForSubnet,
                  originalData: { id: nd.subnetId, vNetId: vnetIdForSubnet, type: 'subnet' }
                }
              });
            }
            if (nodeTypeVisibility.subnet) nodeGroupEdges.subnets.add(subnetNodeId);
          }

          // Collect SecurityGroup connections for consolidation (only if visibility enabled)
          if (nodeTypeVisibility.securityGroup && nd.securityGroupIds && Array.isArray(nd.securityGroupIds)) {
            nd.securityGroupIds.forEach(sgId => {
              if (!sgId) return;
              
              const sgNodeId = `sg-${sgId}`;
              const isUnknown = sgId === 'unknown';
              
              if (!resourceSet.has(sgNodeId)) {
                resourceSet.add(sgNodeId);
                const sgText = isUnknown ? 'SG (unknown)' : sgId;
                nodes.push({
                  data: {
                    id: sgNodeId,
                    label: formatLabel('🛡️', sgText, getMaxCharsPerLine('securityGroup')),
                    parent: nsId,
                    type: 'securityGroup',
                    color: GRAPH_CONFIG.nodeColors.securityGroup,
                    isUnknown: isUnknown,
                    fullId: sgId,
                    originalData: { id: sgId, type: 'securityGroup' }
                  }
                });
              }
              nodeGroupEdges.securityGroups.add(sgNodeId);
            });
          }

          // Collect SSHKey connections for consolidation (only if visibility enabled)
          if (nd.sshKeyId && nodeTypeVisibility.sshKey) {
            const isUnknown = nd.sshKeyId === 'unknown';
            const sshKeyNodeId = `sshkey-${nd.sshKeyId}`;  // Shared node for unknown
            
            if (!resourceSet.has(sshKeyNodeId)) {
              resourceSet.add(sshKeyNodeId);
              const sshText = isUnknown ? 'SSHKey (unknown)' : nd.sshKeyId;
              nodes.push({
                data: {
                  id: sshKeyNodeId,
                  label: formatLabel('🔑', sshText, getMaxCharsPerLine('sshKey')),
                  parent: nsId,
                  type: 'sshKey',
                  color: GRAPH_CONFIG.nodeColors.sshKey,
                  fullId: nd.sshKeyId,
                  isUnknown: isUnknown,
                  originalData: { id: nd.sshKeyId, type: 'sshKey' }
                }
              });
            }
            nodeGroupEdges.sshKeys.add(sshKeyNodeId);
          }

          // Collect Spec connections for consolidation (only if spec visibility enabled)
          if (nd.specId && nodeTypeVisibility.spec) {
            const isUnknown = nd.specId === 'unknown';
            const specNodeId = `spec-${nd.specId}`;  // Shared node for unknown

            if (!resourceSet.has(specNodeId)) {
              resourceSet.add(specNodeId);
              if (!isUnknown) specNodeIds.push(specNodeId);  // Track for sibling edges (not for unknown)
              const specText = isUnknown
                ? 'Spec (unknown)'
                : (() => {
                    const specParts = nd.specId.split('+');
                    return specParts.length === 3
                      ? `${specParts[0]}/${specParts[2]}`
                      : nd.specId;
                  })();

              // Determine icon based on GPU availability
              // Note: spec field contains summary info (not specSummary)
              const specData = nd.spec || nd.specSummary || {};
              const specHasGpu = specData.acceleratorType?.toLowerCase() === 'gpu' ||
                                specData.acceleratorModel ||
                                specData.acceleratorCount > 0;
              const specIcon = specHasGpu ? '📐🧮' : '📐';

              nodes.push({
                data: {
                  id: specNodeId,
                  label: formatLabel(specIcon, specText, getMaxCharsPerLine('spec')),
                  type: 'spec',
                  color: GRAPH_CONFIG.nodeColors.spec,
                  fullId: nd.specId,
                  isUnknown: isUnknown,
                  hasGpu: specHasGpu,
                  // Include spec data for detailed view
                  originalData: {
                    id: nd.specId,
                    type: 'spec',
                    ...specData
                  }
                }
              });
            }
            nodeGroupEdges.specs.add(specNodeId);
          }

          // Collect Image connections for consolidation
          // Note: resourceType can be "image" (public) or "customImage" (user snapshot)
          if (nd.imageId) {
            const isUnknown = nd.imageId === 'unknown';
            const imageData = nd.image || nd.imageSummary || {};
            const isCustomImage = imageData.resourceType === 'customImage';

            // Determine which node type to connect based on resourceType
            // customImage nodes use 'customimg-' prefix, image nodes use 'image-' prefix
            if (isCustomImage && nodeTypeVisibility.customImage) {
              // Connect to customImage node
              const customImageNodeId = `customimg-${nd.imageId}`;

              // Create customImage node if it doesn't exist (Node references unknown customImage)
              if (!resourceSet.has(customImageNodeId)) {
                resourceSet.add(customImageNodeId);
                customImageNodeIds.push(customImageNodeId);

                const imageLabel = isUnknown
                  ? 'CustomImage (unknown)'
                  : (imageData.osDistribution || imageData.osType || nd.imageId);

                nodes.push({
                  data: {
                    id: customImageNodeId,
                    label: formatLabel('📷', imageLabel, getMaxCharsPerLine('customImage')),
                    parent: nsId,
                    type: 'customImage',
                    color: GRAPH_CONFIG.nodeColors.customImage,
                    fullId: nd.imageId,
                    isUnknown: isUnknown,
                    originalData: {
                      id: nd.imageId,
                      type: 'customImage',
                      ...imageData
                    }
                  }
                });
              }
              nodeGroupEdges.images.add(customImageNodeId);

            } else if (nodeTypeVisibility.image) {
              // Connect to regular image node (public CSP image)
              const imageNodeId = `image-${nd.imageId}`;

              if (!resourceSet.has(imageNodeId)) {
                resourceSet.add(imageNodeId);
                if (!isUnknown) imageNodeIds.push(imageNodeId);

                const imageLabel = isUnknown
                  ? 'Image (unknown)'
                  : (imageData.osDistribution || imageData.osType || nd.imageId);

                nodes.push({
                  data: {
                    id: imageNodeId,
                    label: formatLabel('🖼️', imageLabel, getMaxCharsPerLine('image')),
                    type: 'image',
                    color: GRAPH_CONFIG.nodeColors.image,
                    fullId: nd.imageId,
                    isUnknown: isUnknown,
                    originalData: {
                      id: nd.imageId,
                      type: 'image',
                      ...imageData
                    }
                  }
                });
              }
              nodeGroupEdges.images.add(imageNodeId);
            }
          }

          // DataDisk connections - always individual (each Node has its own disks)
          // No nodegroup/Infra level consolidation - each Node connects directly to its disks
          if (nodeTypeVisibility.dataDisk && nd.dataDiskIds && Array.isArray(nd.dataDiskIds) && nd.dataDiskIds.length > 0) {
            nd.dataDiskIds.forEach(diskId => {
              if (!diskId) return;
              
              const isUnknown = diskId === 'unknown';
              const diskNodeId = `disk-${diskId}`;
              
              // Check if disk exists in namespace-level dataDiskMap
              const diskData = dataDiskMap.get(diskId);
              
              // Create node only if not already created (from namespace-level or previous Node)
              if (!resourceSet.has(diskNodeId)) {
                resourceSet.add(diskNodeId);
                const diskText = isUnknown ? 'Disk (unknown)' : diskId;
                nodes.push({
                  data: {
                    id: diskNodeId,
                    label: formatLabel('💾', diskText, getMaxCharsPerLine('dataDisk')),
                    parent: nsId,  // DataDisk belongs to namespace
                    type: 'dataDisk',
                    color: GRAPH_CONFIG.nodeColors.dataDisk,
                    fullId: diskId,
                    diskType: diskData?.diskType,
                    diskSize: diskData?.diskSize,
                    isUnknown: isUnknown,
                    originalData: diskData || { id: diskId, type: 'dataDisk' }
                  }
                });
              }
              
              edges.push({
                data: {
                  id: `edge-${computeNodeId}-${diskNodeId}`,
                  source: computeNodeId,
                  target: diskNodeId,
                  relationship: 'attached'
                }
              });
            });
          }
        }); // end groupNodes.forEach

        // VMs within NodeGroup rely on tiling for compact layout (no invisible edges)

        // Check if all VMs in nodegroup share the same resources
        const allNodesShareVNet = nodeGroupEdges.vNets.size === 1 && groupNodes.every(nd => nd.vNetId || nd.subnetId);
        const allNodesShareSubnet = nodeGroupEdges.subnets.size === 1 && groupNodes.every(nd => nd.subnetId);
        const allNodesShareSG = nodeGroupEdges.securityGroups.size > 0 && 
          groupNodes.every(nd => nd.securityGroupIds && nd.securityGroupIds.length > 0);
        const allNodesShareSSHKey = nodeGroupEdges.sshKeys.size === 1 && groupNodes.every(nd => nd.sshKeyId);
        const allNodesShareSpec = nodeGroupEdges.specs.size === 1 && groupNodes.every(nd => nd.specId);
        const allNodesShareImage = nodeGroupEdges.images.size === 1 && groupNodes.every(nd => nd.imageId);

        // Create edges from nodegroup if all VMs share the same target, else from individual VMs
        // VNet edges
        if (allNodesShareVNet) {
          nodeGroupEdges.vNets.forEach(target => infraEdges.vNets.add(target));
          
          if (!hasSingleNodeGroup) {
            nodeGroupEdges.vNets.forEach(target => {
              edges.push({
                data: {
                  id: `edge-${nodeGroupNodeId}-${target}`,
                  source: nodeGroupNodeId,
                  target: target,
                  relationship: 'uses'
                }
              });
            });
          }
        } else {
          // Create individual edges from Nodes to VNet
          groupNodes.forEach(nd => {
            const computeNodeId = `node-${infra.id}-${nd.id}`;
            const isVNetUnknown = !nd.vNetId || nd.vNetId === 'unknown';
            const vnetNodeId = isVNetUnknown ? 'vnet-unknown' : `vnet-${nd.vNetId}`;
            edges.push({
              data: {
                id: `edge-${computeNodeId}-${vnetNodeId}`,
                source: computeNodeId,
                target: vnetNodeId,
                relationship: 'uses'
              }
            });
          });
        }

        // Subnet edges
        if (allNodesShareSubnet) {
          // Add to Infra-level tracking for further consolidation
          nodeGroupEdges.subnets.forEach(target => infraEdges.subnets.add(target));
          
          // If not single nodegroup, create edge from nodegroup
          if (!hasSingleNodeGroup) {
            nodeGroupEdges.subnets.forEach(target => {
              edges.push({
                data: {
                  id: `edge-${nodeGroupNodeId}-${target}`,
                  source: nodeGroupNodeId,
                  target: target,
                  relationship: 'uses'
                }
              });
            });
          }
        } else {
          // Create individual edges from Nodes to Subnet
          groupNodes.forEach(nd => {
            if (nd.subnetId) {
              const computeNodeId = `node-${infra.id}-${nd.id}`;
              const isSubnetUnknown = nd.subnetId === 'unknown';
              const isVNetUnknown = !nd.vNetId || nd.vNetId === 'unknown';
              const vnetIdForSubnet = isVNetUnknown ? 'unknown' : nd.vNetId;
              const subnetNodeId = isSubnetUnknown 
                ? 'subnet-unknown' 
                : `subnet-${vnetIdForSubnet}-${nd.subnetId}`;
              edges.push({
                data: {
                  id: `edge-${computeNodeId}-${subnetNodeId}`,
                  source: computeNodeId,
                  target: subnetNodeId,
                  relationship: 'uses'
                }
              });
            }
          });
        }

        // SecurityGroup edges
        if (allNodesShareSG && nodeGroupEdges.securityGroups.size <= 2) {
          nodeGroupEdges.securityGroups.forEach(target => infraEdges.securityGroups.add(target));
          
          if (!hasSingleNodeGroup) {
            nodeGroupEdges.securityGroups.forEach(target => {
              edges.push({
                data: {
                  id: `edge-${nodeGroupNodeId}-${target}`,
                  source: nodeGroupNodeId,
                  target: target,
                  relationship: 'protected-by'
                }
              });
            });
          }
        } else {
          // Create individual edges from Nodes to SecurityGroup
          groupNodes.forEach(nd => {
            if (nd.securityGroupIds && Array.isArray(nd.securityGroupIds)) {
              const computeNodeId = `node-${infra.id}-${nd.id}`;
              nd.securityGroupIds.forEach(sgId => {
                if (sgId) {
                  edges.push({
                    data: {
                      id: `edge-${computeNodeId}-sg-${sgId}`,
                      source: computeNodeId,
                      target: `sg-${sgId}`,
                      relationship: 'protected-by'
                    }
                  });
                }
              });
            }
          });
        }

        // SSHKey edges
        if (allNodesShareSSHKey) {
          nodeGroupEdges.sshKeys.forEach(target => infraEdges.sshKeys.add(target));
          
          if (!hasSingleNodeGroup) {
            nodeGroupEdges.sshKeys.forEach(target => {
              edges.push({
                data: {
                  id: `edge-${nodeGroupNodeId}-${target}`,
                  source: nodeGroupNodeId,
                  target: target,
                  relationship: 'uses'
                }
              });
            });
          }
        } else {
          groupNodes.forEach(nd => {
            if (nd.sshKeyId && nd.sshKeyId !== 'unknown') {
              const computeNodeId = `node-${infra.id}-${nd.id}`;
              edges.push({
                data: {
                  id: `edge-${computeNodeId}-sshkey-${nd.sshKeyId}`,
                  source: computeNodeId,
                  target: `sshkey-${nd.sshKeyId}`,
                  relationship: 'uses'
                }
              });
            }
          });
        }

        // Spec edges
        if (allNodesShareSpec) {
          nodeGroupEdges.specs.forEach(target => infraEdges.specs.add(target));
          
          if (!hasSingleNodeGroup) {
            nodeGroupEdges.specs.forEach(target => {
              edges.push({
                data: {
                  id: `edge-${nodeGroupNodeId}-${target}`,
                  source: nodeGroupNodeId,
                  target: target,
                  relationship: 'instance-of'
                }
              });
            });
          }
        } else {
          groupNodes.forEach(nd => {
            if (nd.specId && nd.specId !== 'unknown') {
              const computeNodeId = `node-${infra.id}-${nd.id}`;
              edges.push({
                data: {
                  id: `edge-${computeNodeId}-spec-${nd.specId}`,
                  source: computeNodeId,
                  target: `spec-${nd.specId}`,
                  relationship: 'instance-of'
                }
              });
            }
          });
        }

        // Image edges
        if (allNodesShareImage) {
          nodeGroupEdges.images.forEach(target => infraEdges.images.add(target));
          
          if (!hasSingleNodeGroup) {
            nodeGroupEdges.images.forEach(target => {
              edges.push({
                data: {
                  id: `edge-${nodeGroupNodeId}-${target}`,
                  source: nodeGroupNodeId,
                  target: target,
                  relationship: 'based-on'
                }
              });
            });
          }
        } else {
          groupNodes.forEach(nd => {
            if (nd.imageId && nd.imageId !== 'unknown') {
              const computeNodeId = `node-${infra.id}-${nd.id}`;
              const ndImageData = nd.image || nd.imageSummary || {};
              const isCustomImage = ndImageData.resourceType === 'customImage';

              // Determine target node based on resourceType
              const targetNodeId = isCustomImage
                ? `customimg-${nd.imageId}`
                : `image-${nd.imageId}`;

              // Only create edge if target visibility is enabled
              const shouldCreateEdge = isCustomImage
                ? nodeTypeVisibility.customImage
                : nodeTypeVisibility.image;

              if (shouldCreateEdge) {
                edges.push({
                  data: {
                    id: `edge-${computeNodeId}-${isCustomImage ? 'customimg' : 'image'}-${nd.imageId}`,
                    source: computeNodeId,
                    target: targetNodeId,
                    relationship: 'based-on'
                  }
                });
              }
            }
          });
        }
      }); // end nodeGroups forEach

      // Add invisible edges between nodegroups in the same Infra to keep them close
      for (let i = 0; i < nodeGroupNodeIds.length - 1; i++) {
        edges.push({
          data: {
            id: `nodegroup-link-${infraId}-${i}`,
            source: nodeGroupNodeIds[i],
            target: nodeGroupNodeIds[i + 1],
            type: 'nodegroup-sibling',
            invisible: true
          }
        });
      }

      // If single nodegroup and all share same resources, create edges from Infra
      if (hasSingleNodeGroup) {
        infraEdges.vNets.forEach(target => {
          edges.push({
            data: {
              id: `edge-${infraId}-${target}`,
              source: infraId,
              target: target,
              relationship: 'uses'
            }
          });
        });
        infraEdges.subnets.forEach(target => {
          edges.push({
            data: {
              id: `edge-${infraId}-${target}`,
              source: infraId,
              target: target,
              relationship: 'uses'
            }
          });
        });
        infraEdges.securityGroups.forEach(target => {
          edges.push({
            data: {
              id: `edge-${infraId}-${target}`,
              source: infraId,
              target: target,
              relationship: 'protected-by'
            }
          });
        });
        infraEdges.sshKeys.forEach(target => {
          edges.push({
            data: {
              id: `edge-${infraId}-${target}`,
              source: infraId,
              target: target,
              relationship: 'uses'
            }
          });
        });
        infraEdges.specs.forEach(target => {
          edges.push({
            data: {
              id: `edge-${infraId}-${target}`,
              source: infraId,
              target: target,
              relationship: 'instance-of'
            }
          });
        });
        infraEdges.images.forEach(target => {
          edges.push({
            data: {
              id: `edge-${infraId}-${target}`,
              source: infraId,
              target: target,
              relationship: 'based-on'
            }
          });
        });
        // Note: DataDisk edges are always from individual VMs, not consolidated to Infra level
      }
    }
  });

  // Add invisible edges between Infras to keep them grouped
  for (let i = 0; i < infraNodeIds.length - 1; i++) {
    edges.push({
      data: {
        id: `infra-link-${i}`,
        source: infraNodeIds[i],
        target: infraNodeIds[i + 1],
        type: 'infra-sibling',
        invisible: true
      }
    });
  }

  // Add invisible edges between Specs to keep them grouped
  for (let i = 0; i < specNodeIds.length - 1; i++) {
    edges.push({
      data: {
        id: `spec-link-${i}`,
        source: specNodeIds[i],
        target: specNodeIds[i + 1],
        type: 'spec-sibling',
        invisible: true
      }
    });
  }
  
  // Connect ALL Spec nodes to namespace to keep them near namespace resources
  // (Spec nodes often have 2+ visible edges, so sibling edges get filtered out)
  specNodeIds.forEach((specNodeId, idx) => {
    edges.push({
      data: {
        id: `spec-ns-anchor-${idx}`,
        source: specNodeId,
        target: nsId,
        type: 'ns-anchor',
        invisible: true
      }
    });
  });

  // Add invisible edges between Images to keep them grouped
  for (let i = 0; i < imageNodeIds.length - 1; i++) {
    edges.push({
      data: {
        id: `image-link-${i}`,
        source: imageNodeIds[i],
        target: imageNodeIds[i + 1],
        type: 'image-sibling',
        invisible: true
      }
    });
  }
  
  // Connect ALL Image nodes to namespace to keep them near namespace resources
  // (Image nodes often have 2+ visible edges, so sibling edges get filtered out)
  imageNodeIds.forEach((imageNodeId, idx) => {
    edges.push({
      data: {
        id: `image-ns-anchor-${idx}`,
        source: imageNodeId,
        target: nsId,
        type: 'ns-anchor',
        invisible: true
      }
    });
  });

  // Add invisible edges between CSP nodes to keep them grouped
  const cspNodeArray = Array.from(cspNodes);
  for (let i = 0; i < cspNodeArray.length - 1; i++) {
    edges.push({
      data: {
        id: `csp-link-${i}`,
        source: cspNodeArray[i],
        target: cspNodeArray[i + 1],
        type: 'csp-sibling',
        invisible: true
      }
    });
  }

  // ========== Filter Invisible Sibling Edges ==========
  // If a node has 2+ visible edges (real relationships), remove its sibling edges
  // This allows nodes with actual relationships to be positioned by those relationships
  // while keeping unconnected nodes grouped by type
  
  // Count visible edges per node (excluding invisible sibling edges and location edges)
  const visibleEdgeCount = new Map();
  const locationEdgeTypes = ['location', 'node-location', 'vnet-location', 'sg-location', 'sshkey-location', 'disk-location', 'ns-anchor'];
  
  edges.forEach(edge => {
    // Skip invisible edges and location edges (they connect to CSP/Region/Zone which is everywhere)
    if (edge.data.invisible) return;
    if (locationEdgeTypes.includes(edge.data.type)) return;
    
    const source = edge.data.source;
    const target = edge.data.target;
    
    visibleEdgeCount.set(source, (visibleEdgeCount.get(source) || 0) + 1);
    visibleEdgeCount.set(target, (visibleEdgeCount.get(target) || 0) + 1);
  });
  
  // Filter out sibling edges for nodes with 2+ visible connections
  let filteredEdges = edges.filter(edge => {
    if (!edge.data.invisible) return true;  // Keep all visible edges
    
    const source = edge.data.source;
    const target = edge.data.target;
    
    // If either source or target has 2+ visible edges, remove this sibling edge
    const sourceCount = visibleEdgeCount.get(source) || 0;
    const targetCount = visibleEdgeCount.get(target) || 0;
    
    if (sourceCount >= 2 || targetCount >= 2) {
      return false;  // Remove this sibling edge
    }
    
    return true;  // Keep sibling edge for nodes with <2 visible connections
  });

  // ========== Anchor Isolated Groups to Main Cluster ==========
  // Isolated resource groups (no visible edges) would float away from main cluster.
  // Connect first node of each isolated group to the most connected node (hub).
  
  // Find the hub node (most visible connections, preferring Infra/NodeGroup/Node)
  let hubNodeId = null;
  let hubConnectionCount = 0;
  
  visibleEdgeCount.forEach((count, nodeId) => {
    if (count > hubConnectionCount) {
      hubConnectionCount = count;
      hubNodeId = nodeId;
    }
  });
  
  // If no hub found (no visible edges at all), use first Infra node as fallback
  if (!hubNodeId) {
    const infraNode = nodes.find(n => n.data.type === 'infra');
    if (infraNode) hubNodeId = infraNode.data.id;
  }
  
  // Resource types that can be isolated
  const isolatableTypes = ['vnet', 'securityGroup', 'sshKey', 'dataDisk', 'spec', 'image'];
  
  if (hubNodeId) {
    // Group nodes by type and check if they're isolated
    isolatableTypes.forEach(resType => {
      const nodesOfType = nodes.filter(n => n.data.type === resType);
      if (nodesOfType.length === 0) return;
      
      // Check if ALL nodes of this type have 0 visible edges (isolated group)
      const allIsolated = nodesOfType.every(n => (visibleEdgeCount.get(n.data.id) || 0) === 0);
      
      if (allIsolated && nodesOfType.length > 0) {
        // Connect first node of this isolated group to hub with invisible anchor edge
        const firstNode = nodesOfType[0];
        filteredEdges.push({
          data: {
            id: `anchor-${resType}-to-hub`,
            source: firstNode.data.id,
            target: hubNodeId,
            type: 'anchor',
            invisible: true
          }
        });
      }
    });
  }

  // ========== Group Unused Resources ==========
  // Find resources not connected to Infra/NodeGroup/Node and group them under "Unused Resources"
  if (nodeTypeVisibility.unusedGroup) {
    const infraTypes = new Set(['infra', 'nodegroup', 'node']);
    const resourceTypes = new Set(['vnet', 'subnet', 'securityGroup', 'sshKey', 'dataDisk']);
    const nodeMap = new Map(nodes.map(n => [n.data.id, n]));
    
    // Get all nodes connected to infrastructure via visible, non-location edges
    const connectedToInfra = new Set();
    
    // Helper: recursively collect connected nodes (similar to focusRelated traversal)
    const collectConnected = (nodeId, visited = new Set()) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      connectedToInfra.add(nodeId);
      
      // Find edges connected to this node
      filteredEdges.forEach(edge => {
        if (edge.data.invisible || edge.data.type === 'location') return;
        
        let neighborId = null;
        if (edge.data.source === nodeId) neighborId = edge.data.target;
        else if (edge.data.target === nodeId) neighborId = edge.data.source;
        
        if (neighborId && !visited.has(neighborId)) {
          const neighborNode = nodeMap.get(neighborId);
          // Only traverse to resource nodes, not CSP hierarchy
          if (neighborNode && resourceTypes.has(neighborNode.data.type)) {
            collectConnected(neighborId, visited);
          }
        }
      });
      
      // Also traverse to children (for compound nodes like VNet→Subnet)
      nodes.forEach(n => {
        if (n.data.parent === nodeId && !visited.has(n.data.id)) {
          collectConnected(n.data.id, visited);
        }
      });
    };
    
    // Start traversal from all infrastructure nodes
    nodes.forEach(n => {
      if (infraTypes.has(n.data.type)) {
        collectConnected(n.data.id, new Set());
      }
    });
    
    // Find resource nodes NOT connected to infrastructure (direct children of namespace only)
    const unusedResources = nodes.filter(n => {
      if (!resourceTypes.has(n.data.type)) return false;
      if (connectedToInfra.has(n.data.id)) return false;
      if (n.data.parent !== nsId) return false;  // Only top-level resources
      return true;
    });
    
    // Create "Unused Resources" group if there are any
    if (unusedResources.length > 0) {
      const unusedGroupId = `unused-resources-${nsId}`;
      
      nodes.push({
        data: {
          id: unusedGroupId,
          label: '📦 Unused Resources',
          parent: nsId,
          type: 'unusedGroup',
          color: GRAPH_CONFIG.nodeColors.unusedGroup,
          originalData: { id: unusedGroupId, type: 'unusedGroup' }
        }
      });
      
      unusedResources.forEach(n => {
        n.data.parent = unusedGroupId;
        n.data.isUnused = true;
      });
      
      console.debug(`[ResourceGraph] Grouped ${unusedResources.length} unused resources`);
    }
  }

  return { nodes, edges: filteredEdges };
}

// ============================================================================
// GRAPH UPDATE & RENDER
// ============================================================================

/**
 * Update graph with new data
 * @param {Array} infraList - Infra data array
 * @param {string} namespace - Current namespace
 * @param {boolean} force - Force update even if data unchanged
 * @param {Object} centralData - Full central data object for change detection
 */
export function updateGraph(infraList, namespace, force = false, centralData = null) {
  console.debug(`[ResourceGraph] updateGraph called: force=${force}, focusedNodeIds=${focusedNodeIds.size}, compact=${isCompactViewActive}`);
  
  if (!cy) {
    console.warn('[ResourceGraph] Graph not initialized');
    return;
  }

  // Check if data has changed (skip update if unchanged)
  // Hash only the actual resource data (exclude subscribers, lastUpdated, apiStatus etc.)
  const dataForHash = centralData ? {
    namespace,
    infraData: centralData.infraData,
    vNet: centralData.vNet,
    securityGroup: centralData.securityGroup,
    sshKey: centralData.sshKey,
    dataDisk: centralData.dataDisk,
    customImage: centralData.customImage,
    k8sCluster: centralData.k8sCluster,
    vpn: centralData.vpn
  } : { infraList, namespace };
  
  const newHash = generateDataHash(dataForHash);
  
  if (!force && lastDataHash === newHash) {
    // Data unchanged, skip update
    return;
  }
  
  console.debug(`[ResourceGraph] Data changed (hash: ${lastDataHash?.slice(0,8) || 'null'} -> ${newHash.slice(0,8)}), updating graph...`);
  lastDataHash = newHash;

  currentNamespace = namespace;
  const graphData = infraDataToGraph(infraList, namespace);

  // Build set of node IDs for edge validation
  const nodeIdSet = new Set(graphData.nodes.map(n => n.data.id));
  
  // Filter edges to only include those with valid source and target nodes
  const validEdges = graphData.edges.filter(edge => {
    const sourceExists = nodeIdSet.has(edge.data.source);
    const targetExists = nodeIdSet.has(edge.data.target);
    if (!sourceExists || !targetExists) {
      console.debug(`[ResourceGraph] Skipping edge ${edge.data.id}: source=${sourceExists}, target=${targetExists}`);
      return false;
    }
    return true;
  });

  // Batch update for performance
  cy.batch(() => {
    cy.elements().remove();
    cy.add(graphData.nodes);
    cy.add(validEdges);
  });

  // Keep the user's chosen line pattern on the freshly-added edges.
  applyCurrentEdgeStyle();

  // Run layout (will restore focus state after layout completes)
  runLayout();

  console.debug(`[ResourceGraph] Updated with ${graphData.nodes.length} nodes, ${validEdges.length} edges (${graphData.edges.length - validEdges.length} skipped)`);
}

/**
 * Run the graph layout algorithm
 * @param {string} layoutName - Layout algorithm name (null for default fcose)
 * @param {boolean} preserveFocus - Whether to preserve and restore focus state
 */
export function runLayout(layoutName = null, preserveFocus = true) {
  if (!cy) return;

  // Check if we're in focus mode and should preserve it
  const hasFocusState = preserveFocus && focusedNodeIds.size > 0;
  const wasCompactView = isCompactViewActive;
  
  console.debug(`[ResourceGraph] runLayout called: focusedNodes=${focusedNodeIds.size}, compact=${wasCompactView}, preserve=${preserveFocus}`);
  
  // If in focus mode, pre-apply faded/hidden classes BEFORE layout
  // This prevents the "flash" of full view before focus is restored
  if (hasFocusState) {
    // Temporarily store the focus state
    const savedFocusIds = new Set(focusedNodeIds);
    
    console.debug(`[ResourceGraph] Preserving focus for nodes: ${Array.from(savedFocusIds).join(', ')}`);
    
    // Re-apply focus immediately (synchronously) to avoid flicker
    cy.elements().addClass('faded');
    cy.elements().removeClass('highlighted highlighted-edge');
    
    savedFocusIds.forEach(nodeId => {
      const node = cy.getElementById(nodeId);
      if (node && node.length > 0) {
        // Get related elements for this node
        const related = getRelatedElements(node);
        related.removeClass('faded');
        node.addClass('highlighted');
        console.debug(`[ResourceGraph] Restored focus for ${nodeId}: ${related.length} related elements`);
      } else {
        console.debug(`[ResourceGraph] Node ${nodeId} no longer exists`);
      }
    });
    
    // If compact view was active, hide faded elements before layout
    if (wasCompactView) {
      const fadedCount = cy.elements('.faded').length;
      cy.elements('.faded').addClass('hidden');
      console.debug(`[ResourceGraph] Applied compact view: ${fadedCount} elements hidden`);
    }
  }

  let options;
  if (layoutName === 'concentric') {
    options = GRAPH_CONFIG.layoutConcentric;
  } else if (layoutName === 'fcose' || layoutName === null) {
    options = { ...GRAPH_CONFIG.layout };  // Default is fcose
    
    // Add relative placement constraint: namespace on left, cloud nodes on right
    const nsNodes = cy.nodes('[type="namespace"]');
    const cspRootNode = cy.getElementById('csp-root');
    const cspNodes = cy.nodes('[type="csp"]');
    
    const constraints = [];
    
    if (nsNodes.length) {
      // If cspRoot exists and is visible, use it
      if (cspRootNode.length && cspRootNode.visible()) {
        nsNodes.forEach(ns => {
          constraints.push({ left: ns.id(), right: 'csp-root', gap: 150 });
        });
      } 
      // Otherwise, constrain against individual csp nodes (top-level when cspRoot is hidden)
      else if (cspNodes.length) {
        const topLevelCspNodes = cspNodes.filter(node => !node.parent().length);
        nsNodes.forEach(ns => {
          topLevelCspNodes.forEach(csp => {
            constraints.push({ left: ns.id(), right: csp.id(), gap: 120 });
          });
        });
      }
      
      if (constraints.length) {
        options.relativePlacementConstraint = constraints;
      }
    }
  } else {
    options = { ...GRAPH_CONFIG.layout, name: layoutName };
  }
  
  // If in compact view, only layout visible elements (exclude hidden and type-hidden)
  let elementsToLayout = cy.elements().not('.type-hidden');
  if (wasCompactView) {
    elementsToLayout = elementsToLayout.not('.hidden');
  }
  
  const layout = elementsToLayout.layout(options);
  
  // Reformat compound node labels after layout completes
  layout.on('layoutstop', () => {
    reformatCompoundNodeLabels();
    arrangeUnusedResourcesInGrid();
    // Note: Focus state is pre-applied above, no need to restore again
  });
  
  layout.run();
}

// ============================================================================
// FOCUS & HIGHLIGHT
// ============================================================================

/**
 * Focus on a node and highlight its neighbors (supports accumulative selection)
 * @param {Object} node - Cytoscape node object
 * @param {boolean} reset - If true, reset previous selection before focusing
 */
export function focusOnNeighbors(node, reset = false) {
  if (!cy) return;

  // Check if we're in focus mode (some elements are faded)
  const isInFocusMode = cy.elements('.faded').length > 0;
  
  // If this node is already highlighted, remove it from focus (toggle off)
  if (node.hasClass('highlighted')) {
    removeFromFocus(node);
    return;
  }
  
  // If reset is requested, clear previous selection first
  if (reset) {
    cy.elements().removeClass('faded highlighted highlighted-edge hidden');
    console.debug('[ResourceGraph] focusedNodeIds.clear() called from focusOnNeighbors(reset=true)');
    focusedNodeIds.clear();
  }
  
  // Track this node as focused
  focusedNodeIds.add(node.id());
  console.debug(`[ResourceGraph] Focus added: ${node.id()}, total focused: ${focusedNodeIds.size}`);

  // Helper: Filter out container/hierarchy compound nodes to avoid selecting all children
  // These nodes have many children that shouldn't be auto-included in focus
  const filterContainerNodes = (nodes) => {
    return nodes.filter(n => {
      const type = n.data('type');
      // Exclude namespace, cspRoot, csp, region - these are container nodes
      return !['namespace', 'cspRoot', 'csp', 'region'].includes(type);
    });
  };

  // Get neighborhood (connected elements), excluding invisible edges
  const visibleEdges = node.connectedEdges().filter(edge => !edge.data('invisible'));
  const visibleNeighborNodes = visibleEdges.connectedNodes();
  const neighborhood = node.union(visibleEdges).union(visibleNeighborNodes);
  
  // Also include parent and children for compound nodes
  const parents = node.ancestors();
  const children = node.descendants();
  
  // Get ancestors of all neighbor nodes (to show VNets when Subnets are connected)
  const neighborAncestors = visibleNeighborNodes.ancestors();
  
  // Get descendants of neighbor nodes, but exclude container nodes
  // to avoid selecting all nodes in the graph
  const filteredNeighbors = filterContainerNodes(visibleNeighborNodes);
  const neighborDescendants = filteredNeighbors.descendants();
  
  // Get neighbors of parent nodes (for consolidated edges), excluding invisible edges
  // When edges are consolidated at NodeGroup/Infra level, Node/NodeGroup nodes need to show parent's connections
  let parentNeighbors = cy.collection();
  parents.forEach(parent => {
    const parentVisibleEdges = parent.connectedEdges().filter(edge => !edge.data('invisible'));
    const parentVisibleNodes = parentVisibleEdges.connectedNodes();
    parentNeighbors = parentNeighbors.union(parent).union(parentVisibleEdges).union(parentVisibleNodes);
  });
  
  // Also get ancestors of parent's neighbors (to show VNets for parent-connected Subnets)
  const parentNeighborAncestors = parentNeighbors.nodes().ancestors();
  
  // Get descendants of parent's neighbors, but filter out container nodes
  const filteredParentNeighbors = filterContainerNodes(parentNeighbors.nodes());
  const parentNeighborDescendants = filteredParentNeighbors.descendants();
  
  // Get neighbors of child nodes (for compound nodes like Infra, NodeGroup, VNet)
  // When Infra is selected, show all connections of its NodeGroups and VMs
  let childNeighbors = cy.collection();
  children.forEach(child => {
    const childVisibleEdges = child.connectedEdges().filter(edge => !edge.data('invisible'));
    const childVisibleNodes = childVisibleEdges.connectedNodes();
    childNeighbors = childNeighbors.union(childVisibleEdges).union(childVisibleNodes);
  });
  
  // Get ancestors of child's neighbors (to show VNets for child-connected Subnets)
  const childNeighborAncestors = childNeighbors.nodes().ancestors();
  
  // Get descendants of child's neighbors, but filter out container nodes
  const filteredChildNeighbors = filterContainerNodes(childNeighbors.nodes());
  const childNeighborDescendants = filteredChildNeighbors.descendants();
  
  // Combine all related elements
  const related = neighborhood
    .union(parents)
    .union(children)
    .union(neighborAncestors)
    .union(neighborDescendants)
    .union(parentNeighbors)
    .union(parentNeighborAncestors)
    .union(parentNeighborDescendants)
    .union(childNeighbors)
    .union(childNeighborAncestors)
    .union(childNeighborDescendants);

  // Get all edges connected to related nodes (for proper edge fading)
  // Exclude invisible edges from display
  const relatedNodes = related.nodes();
  const allRelatedEdges = relatedNodes.connectedEdges().filter(edge => {
    // Exclude invisible edges
    if (edge.data('invisible')) return false;
    // Only include edges where BOTH source and target are in related nodes
    const source = edge.source();
    const target = edge.target();
    return relatedNodes.contains(source) && relatedNodes.contains(target);
  });

  // Check if we're in accumulative mode (already in focus mode, adding more nodes)
  const accumulativeMode = isInFocusMode && !reset;
  
  if (accumulativeMode) {
    // Accumulative mode: keep existing highlighted elements, add new ones
    // Get currently highlighted nodes to include in fit calculation
    const previouslyHighlighted = cy.elements('.highlighted').union(cy.elements().not('.faded'));
    
    // Highlight new related elements (keep existing highlights)
    related.removeClass('faded');
    allRelatedEdges.removeClass('faded');
    node.removeClass('faded').addClass('highlighted');
    
    // Also need to un-fade edges between previously highlighted and newly highlighted nodes
    const allHighlightedNodes = previouslyHighlighted.nodes().union(relatedNodes);
    const crossEdges = allHighlightedNodes.connectedEdges().filter(edge => {
      if (edge.data('invisible')) return false;
      const source = edge.source();
      const target = edge.target();
      return allHighlightedNodes.contains(source) && allHighlightedNodes.contains(target);
    });
    crossEdges.removeClass('faded');
    
    // Highlight edges for new node
    let parentVisibleEdges = cy.collection();
    parents.forEach(parent => {
      parentVisibleEdges = parentVisibleEdges.union(
        parent.connectedEdges().filter(edge => !edge.data('invisible'))
      );
    });
    
    const highlightEdges = visibleEdges
      .union(childNeighbors.edges())
      .union(parentVisibleEdges)
      .filter(edge => !edge.data('invisible'));
    highlightEdges.addClass('highlighted-edge');
    
    // Fit view to all highlighted elements (previous + new)
    const allVisible = cy.elements().not('.faded');
    cy.fit(allVisible, 50);
  } else {
    // Fresh focus mode: fade all, then highlight selected
    cy.elements().addClass('faded');
    cy.elements().removeClass('highlighted').removeClass('highlighted-edge');
    
    // Highlight related elements
    related.removeClass('faded');
    allRelatedEdges.removeClass('faded');
    node.removeClass('faded').addClass('highlighted');
    
    // Highlight edges connected to the selected node, its descendants, and parent (consolidated edges)
    // Collect parent visible edges for consolidated edge highlighting
    let parentVisibleEdges = cy.collection();
    parents.forEach(parent => {
      parentVisibleEdges = parentVisibleEdges.union(
        parent.connectedEdges().filter(edge => !edge.data('invisible'))
      );
    });
    
    // Highlight primary edges (directly connected to selected node or its hierarchy)
    const highlightEdges = visibleEdges
      .union(childNeighbors.edges())
      .union(parentVisibleEdges)
      .filter(edge => !edge.data('invisible'));
    highlightEdges.addClass('highlighted-edge');

    // Fit view to related elements
    cy.fit(related, 50);
  }
}

/**
 * Reset focus - show all elements
 */
export function resetFocus() {
  if (!cy) return;

  // Clear focus tracking
  console.debug('[ResourceGraph] focusedNodeIds.clear() called from resetFocus()');
  focusedNodeIds.clear();
  isCompactViewActive = false;

  // Remove all focus-related classes from all elements
  cy.elements().removeClass('faded highlighted highlighted-edge hidden');
  
  // Fit view with padding
  cy.fit(undefined, 30);
  
  console.debug('[ResourceGraph] Focus reset');
}

/**
 * Restore focus state after graph update
 * Re-applies focus to previously focused nodes if they still exist
 */
/**
 * Get all elements related to a node (for focus highlighting)
 * This is a simplified version of the logic in focusOnNeighbors
 * @param {Object} node - Cytoscape node object
 * @returns {Object} - Collection of related elements
 */
function getRelatedElements(node) {
  if (!cy || !node) return cy.collection();
  
  // Get neighborhood (connected elements), excluding invisible edges
  const visibleEdges = node.connectedEdges().filter(edge => !edge.data('invisible'));
  const visibleNeighborNodes = visibleEdges.connectedNodes();
  
  // Include parent and children for compound nodes
  const parents = node.ancestors();
  const children = node.descendants();
  
  // Get ancestors of all neighbor nodes
  const neighborAncestors = visibleNeighborNodes.ancestors();
  
  // Get neighbors of parent nodes (for consolidated edges)
  let parentNeighbors = cy.collection();
  parents.forEach(parent => {
    const parentVisibleEdges = parent.connectedEdges().filter(edge => !edge.data('invisible'));
    const parentVisibleNodes = parentVisibleEdges.connectedNodes();
    parentNeighbors = parentNeighbors.union(parent).union(parentVisibleEdges).union(parentVisibleNodes);
  });
  
  // Get neighbors of child nodes
  let childNeighbors = cy.collection();
  children.forEach(child => {
    const childVisibleEdges = child.connectedEdges().filter(edge => !edge.data('invisible'));
    const childVisibleNodes = childVisibleEdges.connectedNodes();
    childNeighbors = childNeighbors.union(childVisibleEdges).union(childVisibleNodes);
  });
  
  // Combine all related elements
  return node
    .union(visibleEdges)
    .union(visibleNeighborNodes)
    .union(parents)
    .union(children)
    .union(neighborAncestors)
    .union(parentNeighbors)
    .union(childNeighbors)
    .union(childNeighbors.nodes().ancestors());
}

/**
 * Restore focus state after graph update
 * Re-applies focus to previously focused nodes if they still exist
 */
function restoreFocusState() {
  if (!cy || focusedNodeIds.size === 0) return;
  
  console.debug(`[ResourceGraph] Restoring focus for ${focusedNodeIds.size} nodes`);
  
  // Find nodes that still exist in the graph
  const existingNodes = [];
  focusedNodeIds.forEach(nodeId => {
    const node = cy.getElementById(nodeId);
    if (node && node.length > 0) {
      existingNodes.push(node);
    }
  });
  
  // Clear tracking (will be repopulated by focusOnNeighbors)
  console.debug('[ResourceGraph] focusedNodeIds.clear() called from restoreFocusState()');
  focusedNodeIds.clear();
  
  if (existingNodes.length === 0) {
    isCompactViewActive = false;
    return;
  }
  
  // Re-apply focus to existing nodes
  existingNodes.forEach((node, index) => {
    focusOnNeighbors(node, index === 0); // Reset on first, accumulate on rest
  });
  
  // Re-apply compact view if it was active
  if (isCompactViewActive) {
    const fadedElements = cy.elements('.faded');
    if (fadedElements.length > 0) {
      fadedElements.addClass('hidden');
    }
  }
  
  console.debug(`[ResourceGraph] Focus restored for ${existingNodes.length} nodes`);
}

/**
 * Check if focus mode is currently active
 * @returns {boolean} - True if in focus mode
 */
export function isInFocusMode() {
  return focusedNodeIds.size > 0;
}

/**
 * Remove a node from focus (unfocus a highlighted node)
 * @param {Object} node - Cytoscape node object to remove from focus
 */
function removeFromFocus(node) {
  if (!cy || !node.hasClass('highlighted')) return;
  
  // Remove from focus tracking
  focusedNodeIds.delete(node.id());
  
  // Remove highlight from this node
  node.removeClass('highlighted');
  
  // Get all elements that were related to this node
  const visibleEdges = node.connectedEdges().filter(edge => !edge.data('invisible'));
  const visibleNeighborNodes = visibleEdges.connectedNodes();
  const parents = node.ancestors();
  const children = node.descendants();
  
  // Collect all potentially affected elements
  const affectedElements = node
    .union(visibleEdges)
    .union(visibleNeighborNodes)
    .union(parents)
    .union(children);
  
  // Get remaining highlighted nodes
  const remainingHighlighted = cy.nodes('.highlighted');
  
  // If no highlighted nodes remain, reset focus entirely
  if (remainingHighlighted.length === 0) {
    resetFocus();
    return;
  }
  
  // For each affected element, check if it's still connected to a highlighted node
  affectedElements.forEach(ele => {
    if (ele.hasClass('highlighted')) return; // Skip still-highlighted nodes
    
    let stillConnected = false;
    
    if (ele.isNode()) {
      // Check if this node is connected to any remaining highlighted node
      remainingHighlighted.forEach(highlightedNode => {
        // Direct connection
        if (ele.edgesWith(highlightedNode).filter(e => !e.data('invisible')).length > 0) {
          stillConnected = true;
        }
        // Is ancestor/descendant of highlighted node
        if (highlightedNode.ancestors().contains(ele) || highlightedNode.descendants().contains(ele)) {
          stillConnected = true;
        }
        // Is neighbor of highlighted node
        const highlightedNeighbors = highlightedNode.connectedEdges().filter(e => !e.data('invisible')).connectedNodes();
        if (highlightedNeighbors.contains(ele)) {
          stillConnected = true;
        }
        // Check ancestors of neighbors
        if (highlightedNeighbors.ancestors().contains(ele)) {
          stillConnected = true;
        }
      });
    } else if (ele.isEdge()) {
      // Edge: check if both source and target are still visible (not faded)
      const source = ele.source();
      const target = ele.target();
      stillConnected = !source.hasClass('faded') && !target.hasClass('faded');
    }
    
    if (!stillConnected) {
      ele.addClass('faded');
      ele.removeClass('highlighted-edge');
    }
  });
  
  // Update edges: fade edges where either endpoint is now faded
  cy.edges().forEach(edge => {
    if (edge.data('invisible')) return;
    const source = edge.source();
    const target = edge.target();
    if (source.hasClass('faded') || target.hasClass('faded')) {
      edge.addClass('faded');
      edge.removeClass('highlighted-edge');
    }
  });
  
  // Fit view to remaining visible elements
  const visibleElements = cy.elements().not('.faded');
  if (visibleElements.length > 0) {
    cy.fit(visibleElements, 50);
  }
  
  console.debug('[ResourceGraph] Node removed from focus:', node.id());
}

/**
 * Compact view - hide faded elements and re-layout
 */
export function compactFocusView() {
  if (!cy) return;
  
  const fadedElements = cy.elements('.faded');
  if (fadedElements.length === 0) {
    console.debug('[ResourceGraph] No faded elements to hide');
    return;
  }
  
  // Mark compact view as active
  isCompactViewActive = true;
  console.debug(`[ResourceGraph] Compact view activated. focusedNodeIds: ${focusedNodeIds.size}, faded: ${fadedElements.length}`);
  
  // Hide all faded elements
  fadedElements.addClass('hidden');
  
  // Re-run layout on visible elements only (don't trigger focus restore)
  const visibleElements = cy.elements().not('.hidden');
  visibleElements.layout({
    ...GRAPH_CONFIG.layout,
    fit: true,
    padding: 50
  }).run();
  
  console.debug('[ResourceGraph] Compact view applied');
}

// ============================================================================
// NODE INFORMATION DISPLAY
// ============================================================================

/**
 * Show detailed information for a node
 * Uses JSONFormatter for rich JSON viewing when available
 * @param {Object} node - Cytoscape node object
 */
function showNodeInfo(node) {
  // Hide tooltip before showing Swal modal
  hideTooltip();
  
  try {
    const data = node.data();
    const originalData = data.originalData || {};
    const type = data.type || 'unknown';
    const label = data.label || data.id || 'Unknown';

    console.debug('[ResourceGraph] showNodeInfo called for:', type, label);

    // Build summary content for quick overview
    let summaryContent = buildSummaryContent(type, originalData, data);

    // Check if JSONFormatter is available for full details view
    const hasJsonFormatter = typeof JSONFormatter !== 'undefined';

    // Extract display name from label (remove emoji prefix if present)
    const displayName = label.replace(/^[^\s]+\s/, '') || label;

    if (Swal) {
      Swal.fire({
        title: `${getTypeEmoji(type)} ${displayName}`,
        html: `<div style="text-align: left; padding: 15px; color: #e0e0e0;">${summaryContent}</div>`,
        background: "#0e1746",
        color: "#fff",
        confirmButtonText: 'Close',
        showDenyButton: hasJsonFormatter && Object.keys(originalData).length > 0,
        denyButtonText: '📋 Full JSON',
        denyButtonColor: '#6c757d',
        showCancelButton: false,
        confirmButtonColor: '#3085d6',
        width: '500px'
      }).then((result) => {
        if (result.isDenied) {
          showFullJsonDetails(type, originalData, data);
        }
      });
    } else {
      console.warn('[ResourceGraph] Swal not available for showNodeInfo');
      alert(`${type}: ${displayName}\n\n${JSON.stringify(originalData, null, 2).substring(0, 500)}`);
    }
  } catch (error) {
    console.error('[ResourceGraph] Error in showNodeInfo:', error);
  }
}

/**
 * Build summary HTML content for a node based on its type
 */
function escapeHtml(value) {
  const str = String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildSummaryContent(type, originalData, data) {
  switch (type) {
    case 'node':
      // Build Spec Summary section
      // Note: Node data uses 'spec' field (not 'specSummary')
      const specInfo = originalData.spec || originalData.specSummary || {};
      const hasGpuSpec = specInfo.acceleratorType?.toLowerCase() === 'gpu' ||
                         specInfo.acceleratorModel ||
                         specInfo.acceleratorCount > 0;

      let specSection = '';
      if (specInfo.cspSpecName || specInfo.vCPU || specInfo.memoryGiB) {
        specSection = `
          <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.2);">
            <p style="margin-bottom: 5px; color: #e83e8c;"><strong>━━━ Spec ━━━</strong></p>
            ${specInfo.cspSpecName ? `<p>🖥️ <strong>Type:</strong> ${specInfo.cspSpecName}</p>` : ''}
            ${specInfo.vCPU ? `<p>💻 <strong>vCPU:</strong> ${specInfo.vCPU}</p>` : ''}
            ${specInfo.memoryGiB ? `<p>🧠 <strong>Memory:</strong> ${specInfo.memoryGiB} GiB</p>` : ''}
            ${hasGpuSpec ? `
              <p>🧮 <strong>GPU:</strong> <span style="color: #ff6b6b; font-weight: bold;">${specInfo.acceleratorModel || specInfo.acceleratorType?.toUpperCase() || 'GPU'}</span>
              ${specInfo.acceleratorCount ? ` (${specInfo.acceleratorCount}x` : ''}${specInfo.acceleratorMemoryGB ? `, ${specInfo.acceleratorMemoryGB}GB)` : specInfo.acceleratorCount ? ')' : ''}</p>
            ` : ''}
            ${specInfo.costPerHour ? `<p>💰 <strong>Cost:</strong> $${specInfo.costPerHour}/hr</p>` : ''}
          </div>
        `;
      }

      // Build Image Summary section
      // Note: Node data uses 'image' field (not 'imageSummary')
      const imageInfo = originalData.image || originalData.imageSummary || {};
      let imageSection = '';
      if (imageInfo.osType || imageInfo.osDistribution || imageInfo.cspImageName) {
        imageSection = `
          <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.2);">
            <p style="margin-bottom: 5px; color: #795548;"><strong>━━━ Image ━━━</strong></p>
            ${imageInfo.osDistribution ? `<p>🖼️ <strong>OS:</strong> ${imageInfo.osDistribution}</p>` :
              imageInfo.osType ? `<p>🖼️ <strong>OS:</strong> ${imageInfo.osType}</p>` : ''}
            ${imageInfo.osArchitecture ? `<p>🏗️ <strong>Arch:</strong> ${imageInfo.osArchitecture}</p>` : ''}
            ${imageInfo.resourceType ? `<p>📦 <strong>Type:</strong> ${imageInfo.resourceType}</p>` : ''}
          </div>
        `;
      }

      return `
        <div style="text-align: left;">
          <p><strong>Name:</strong> ${originalData.name || 'N/A'}</p>
          <p><strong>ID:</strong> ${originalData.id || 'N/A'}</p>
          <p><strong>Status:</strong> <span style="color: ${getStatusColor(originalData.status)}">${originalData.status || 'N/A'}</span></p>
          <p><strong>Public IP:</strong> ${originalData.publicIP || 'N/A'}</p>
          <p><strong>Private IP:</strong> ${originalData.privateIP || 'N/A'}</p>
          <p><strong>Region:</strong> ${originalData.region?.Region || 'N/A'}</p>
          <p><strong>Zone:</strong> ${originalData.region?.Zone || 'N/A'}</p>
          <p><strong>Connection:</strong> ${originalData.connectionName || 'N/A'}</p>
          ${specSection}
          ${imageSection}
        </div>
      `;

    case 'infra':
      return `
        <div style="text-align: left;">
          <p><strong>Name:</strong> ${originalData.name || 'N/A'}</p>
          <p><strong>ID:</strong> ${originalData.id || 'N/A'}</p>
          <p><strong>Status:</strong> <span style="color: ${getStatusColor(originalData.status)}">${originalData.status || 'N/A'}</span></p>
          <p><strong>Nodes:</strong> ${originalData.node?.length || 0}</p>
          <p><strong>Description:</strong> ${originalData.description || 'N/A'}</p>
          <p><strong>Install Mon Agent:</strong> ${originalData.installMonAgent || 'N/A'}</p>
        </div>
      `;

    case 'vnet':
      return `
        <div style="text-align: left;">
          <p><strong>Name:</strong> ${originalData.name || 'N/A'}</p>
          <p><strong>ID:</strong> ${originalData.id || 'N/A'}</p>
          <p><strong>CIDR Block:</strong> ${originalData.cidrBlock || 'N/A'}</p>
          <p><strong>Subnets:</strong> ${originalData.subnetInfoList?.length || 0}</p>
          <p><strong>Connection:</strong> ${originalData.connectionName || 'N/A'}</p>
          <p><strong>CSP Resource ID:</strong> ${originalData.cspResourceId || 'N/A'}</p>
        </div>
      `;

    case 'subnet':
      return `
        <div style="text-align: left;">
          <p><strong>Name:</strong> ${originalData.name || 'N/A'}</p>
          <p><strong>ID:</strong> ${originalData.id || 'N/A'}</p>
          <p><strong>IPv4 CIDR:</strong> ${originalData.ipv4CIDR || 'N/A'}</p>
          <p><strong>Zone:</strong> ${originalData.zone || 'N/A'}</p>
          <p><strong>CSP Resource ID:</strong> ${originalData.cspResourceId || 'N/A'}</p>
        </div>
      `;

    case 'securityGroup':
      const rulesCount = originalData.firewallRules?.length || 0;
      return `
        <div style="text-align: left;">
          <p><strong>Name:</strong> ${originalData.name || 'N/A'}</p>
          <p><strong>ID:</strong> ${originalData.id || 'N/A'}</p>
          <p><strong>VNet ID:</strong> ${originalData.vNetId || 'N/A'}</p>
          <p><strong>Firewall Rules:</strong> ${rulesCount}</p>
          <p><strong>Connection:</strong> ${originalData.connectionName || 'N/A'}</p>
          <p><strong>CSP Resource ID:</strong> ${originalData.cspResourceId || 'N/A'}</p>
        </div>
      `;

    case 'sshKey':
      return `
        <div style="text-align: left;">
          <p><strong>Name:</strong> ${originalData.name || 'N/A'}</p>
          <p><strong>ID:</strong> ${originalData.id || 'N/A'}</p>
          <p><strong>Username:</strong> ${originalData.username || 'N/A'}</p>
          <p><strong>Fingerprint:</strong> ${originalData.fingerprint || 'N/A'}</p>
          <p><strong>Connection:</strong> ${originalData.connectionName || 'N/A'}</p>
          <p><strong>CSP Resource ID:</strong> ${originalData.cspResourceId || 'N/A'}</p>
        </div>
      `;

    case 'dataDisk':
      return `
        <div style="text-align: left;">
          <p><strong>Name:</strong> ${originalData.name || 'N/A'}</p>
          <p><strong>ID:</strong> ${originalData.id || 'N/A'}</p>
          <p><strong>Size (GB):</strong> ${originalData.diskSize || 'N/A'}</p>
          <p><strong>Type:</strong> ${originalData.diskType || 'N/A'}</p>
          <p><strong>Status:</strong> ${originalData.status || 'N/A'}</p>
          <p><strong>Connection:</strong> ${originalData.connectionName || 'N/A'}</p>
        </div>
      `;

    case 'customImage':
      return `
        <div style="text-align: left;">
          <p><strong>ID:</strong> ${originalData.id || 'N/A'}</p>
          <p>📷 <strong>Type:</strong> Custom Image (Node Snapshot)</p>
          ${originalData.osDistribution ? `<p>🖼️ <strong>OS:</strong> ${originalData.osDistribution}</p>` :
            originalData.osType ? `<p>🖼️ <strong>OS:</strong> ${originalData.osType}</p>` : ''}
          ${originalData.osArchitecture ? `<p>🏗️ <strong>Architecture:</strong> ${originalData.osArchitecture}</p>` : ''}
          ${originalData.cspImageName ? `<p>☁️ <strong>CSP Image:</strong> ${originalData.cspImageName}</p>` : ''}
          ${originalData.sourceNodeId ? `<p>💻 <strong>Source Node:</strong> ${originalData.sourceNodeId}</p>` : ''}
          ${originalData.status ? `<p>📊 <strong>Status:</strong> ${originalData.status}</p>` : ''}
          ${originalData.connectionName ? `<p>🔗 <strong>Connection:</strong> ${originalData.connectionName}</p>` : ''}
        </div>
      `;

    case 'gpu':
      return `
        <div style="text-align: left;">
          <div style="padding: 10px; background: rgba(255,107,107,0.15); border-radius: 6px; border-left: 4px solid #ff6b6b;">
            <p style="margin: 0 0 8px 0; color: #ff6b6b; font-size: 1.1em;"><strong>🧮 GPU/Accelerator</strong></p>
            ${originalData.acceleratorModel ? `<p style="margin: 4px 0;"><strong>Model:</strong> <span style="color: #ff6b6b; font-weight: bold;">${originalData.acceleratorModel}</span></p>` : ''}
            ${originalData.acceleratorType ? `<p style="margin: 4px 0;"><strong>Type:</strong> ${originalData.acceleratorType.toUpperCase()}</p>` : ''}
            ${originalData.acceleratorCount ? `<p style="margin: 4px 0;"><strong>Count:</strong> ${originalData.acceleratorCount}</p>` : ''}
            ${originalData.acceleratorMemoryGB ? `<p style="margin: 4px 0;"><strong>Memory:</strong> ${originalData.acceleratorMemoryGB} GB</p>` : ''}
          </div>
          ${originalData.ndName ? `<p style="margin-top: 10px;">💻 <strong>Attached to Node:</strong> ${originalData.ndName}</p>` : ''}
          ${originalData.cspSpecName ? `<p>🖥️ <strong>Spec:</strong> ${originalData.cspSpecName}</p>` : ''}
          ${originalData.costPerHour ? `<p>💰 <strong>Cost:</strong> $${originalData.costPerHour}/hr</p>` : ''}
        </div>
      `;

    case 'spec':
      // Check for GPU with case-insensitive comparison
      const specHasGpuInfo = originalData.acceleratorType?.toLowerCase() === 'gpu' ||
                             originalData.acceleratorModel ||
                             originalData.acceleratorCount > 0;
      return `
        <div style="text-align: left;">
          <p><strong>ID:</strong> ${originalData.id || 'N/A'}</p>
          ${originalData.cspSpecName ? `<p>🖥️ <strong>CSP Spec:</strong> ${originalData.cspSpecName}</p>` : ''}
          ${originalData.vCPU ? `<p>💻 <strong>vCPU:</strong> ${originalData.vCPU}</p>` : ''}
          ${originalData.memoryGiB ? `<p>🧠 <strong>Memory:</strong> ${originalData.memoryGiB} GiB</p>` : ''}
          ${specHasGpuInfo ? `
            <div style="margin-top: 8px; padding: 8px; background: rgba(255,107,107,0.1); border-radius: 4px; border-left: 3px solid #ff6b6b;">
              <p style="margin: 0 0 5px 0; color: #ff6b6b;"><strong>🧮 GPU/Accelerator</strong></p>
              ${originalData.acceleratorModel ? `<p style="margin: 2px 0;">Model: <strong>${originalData.acceleratorModel}</strong></p>` : ''}
              ${originalData.acceleratorType ? `<p style="margin: 2px 0;">Type: ${originalData.acceleratorType.toUpperCase()}</p>` : ''}
              ${originalData.acceleratorCount ? `<p style="margin: 2px 0;">Count: ${originalData.acceleratorCount}</p>` : ''}
              ${originalData.acceleratorMemoryGB ? `<p style="margin: 2px 0;">Memory: ${originalData.acceleratorMemoryGB} GB</p>` : ''}
            </div>
          ` : ''}
          ${originalData.costPerHour ? `<p>💰 <strong>Cost:</strong> $${originalData.costPerHour}/hr</p>` : ''}
        </div>
      `;

    case 'image':
      return `
        <div style="text-align: left;">
          <p><strong>ID:</strong> ${originalData.id || 'N/A'}</p>
          ${originalData.osDistribution ? `<p>🖼️ <strong>OS:</strong> ${originalData.osDistribution}</p>` :
            originalData.osType ? `<p>🖼️ <strong>OS:</strong> ${originalData.osType}</p>` : ''}
          ${originalData.osArchitecture ? `<p>🏗️ <strong>Architecture:</strong> ${originalData.osArchitecture}</p>` : ''}
          ${originalData.resourceType ? `<p>📦 <strong>Resource Type:</strong> ${originalData.resourceType}</p>` : ''}
          ${originalData.cspImageName ? `<p>☁️ <strong>CSP Image:</strong> ${originalData.cspImageName}</p>` : ''}
        </div>
      `;

    case 'cluster':
      const clusterId = escapeHtml(originalData.id || data.id || 'N/A');
      const vNetId = escapeHtml(originalData.vNetId || 'N/A');
      const nodeCount = escapeHtml(originalData.nodeCount ?? 'N/A');
      const connections = Array.isArray(originalData.connectionNames)
        ? originalData.connectionNames.map(name => escapeHtml(name)).join(', ')
        : '';
      return `
        <div style="text-align: left;">
          <p><strong>Cluster ID:</strong> ${clusterId}</p>
          <p><strong>VNet ID:</strong> ${vNetId}</p>
          <p><strong>Nodes:</strong> ${nodeCount}</p>
          ${connections ? `<p><strong>Connections:</strong> ${connections}</p>` : ''}
        </div>
      `;

    case 'nodegroup':
      return `
        <div style="text-align: left;">
          <p><strong>Name:</strong> ${originalData.name || data.label || 'N/A'}</p>
          <p><strong>ID:</strong> ${originalData.id || data.id || 'N/A'}</p>
          <p><strong>Nodes:</strong> ${originalData.nodeCount || 'N/A'}</p>
        </div>
      `;

    case 'namespace':
      return `
        <div style="text-align: left;">
          <p><strong>Name:</strong> ${originalData.name || data.label || 'N/A'}</p>
          <p><strong>ID:</strong> ${originalData.id || data.id || 'N/A'}</p>
          <p><strong>Description:</strong> ${originalData.description || 'N/A'}</p>
        </div>
      `;

    default:
      return `
        <div style="text-align: left;">
          <p><strong>Type:</strong> ${type}</p>
          <p><strong>ID:</strong> ${originalData.id || data.id || 'N/A'}</p>
          <p><strong>Name:</strong> ${originalData.name || data.label || 'N/A'}</p>
        </div>
      `;
  }
}

/**
 * Show full JSON details using JSONFormatter
 * Styled similar to index.js Get Status popup
 */
function showFullJsonDetails(type, originalData, data) {
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

  const title = `${getTypeEmoji(type)} ${originalData.name || originalData.id || data.label || 'Details'}`;

  if (typeof JSONFormatter === 'undefined') {
    // Fallback to plain JSON with dark style
    Swal.fire({
      title: title,
      html: `<div id="json-output" class="form-control" style="height: auto; background-color: black; text-align: left; padding: 10px; overflow: auto; max-height: 400px;">
        <pre style="color: #fff; margin: 0; white-space: pre-wrap; word-break: break-all;">${JSON.stringify(originalData, null, 2)}</pre>
      </div>`,
      background: "#0e1746",
      width: '50%',
      showCloseButton: true,
      showConfirmButton: true,
      confirmButtonText: 'Close'
    });
    return;
  }

  Swal.fire({
    title: title,
    html: '<div id="resource-json-output" class="form-control" style="height: auto; background-color: black; text-align: left; padding: 10px; overflow: auto; max-height: 400px;"></div>',
    background: "#0e1746",
    width: '50%',
    showCloseButton: true,
    showConfirmButton: true,
    confirmButtonText: 'Close',
    didOpen: () => {
      setTimeout(() => {
        const container = document.getElementById('resource-json-output');
        if (container) {
          const formatter = new JSONFormatter(originalData, 2, jsonOutputConfig);
          const renderedElement = formatter.render();
          container.appendChild(renderedElement);

          // Remove quotes from string values
          setTimeout(() => {
            const stringElements = container.querySelectorAll('.json-formatter-string');
            stringElements.forEach(element => {
              if (element.textContent.startsWith('"') && element.textContent.endsWith('"')) {
                element.textContent = element.textContent.slice(1, -1);
              }
            });
          }, 100);

          // Apply custom styles for JSONFormatter value strings
          const existingStyle = document.getElementById('resource-graph-json-style');
          if (!existingStyle) {
            const style = document.createElement('style');
            style.id = 'resource-graph-json-style';
            style.textContent = `
              #resource-json-output .json-formatter-string {
                word-wrap: break-word !important;
                overflow-wrap: break-word !important;
                white-space: pre-wrap !important;
                word-break: break-all !important;
                max-width: 100% !important;
              }
              #resource-json-output .json-formatter-row .json-formatter-string {
                word-wrap: break-word !important;
                overflow-wrap: break-word !important;
                white-space: pre-wrap !important;
                word-break: break-all !important;
              }
            `;
            document.head.appendChild(style);
          }
        }
      }, 50);
    }
  });
}

function getStatusColor(status) {
  if (!status) return '#6c757d';
  if (status.includes('Running')) return '#28a745';
  if (status.includes('Suspended')) return '#ffc107';
  if (status.includes('Failed')) return '#dc3545';
  return '#17a2b8';
}

function getTypeEmoji(type) {
  const emojis = {
    namespace: '📁',
    infra: '🖥️',
    nodegroup: '📦',
    node: '💻',
    gpu: '🧮',
    vnet: '🌐',
    subnet: '🔀',
    securityGroup: '🛡️',
    sshKey: '🔑',
    dataDisk: '💾',
    customImage: '📷',
    spec: '📐',
    image: '🖼️'
  };
  return emojis[type] || '📌';
}

// ============================================================================
// CONTEXT MENU
// ============================================================================

let contextMenuElement = null;

function showContextMenu(node, position) {
  hideContextMenu();

  const data = node.data();
  const type = data.type;
  const originalData = data.originalData || {};

  const menuItems = [
    { label: '🔍 View Details', action: () => showNodeInfo(node) },
    { label: '🪢 Focus Related', action: () => focusOnNeighbors(node, true) },
    { label: '🎯 Compact View', action: () => compactFocusView() },
    { label: '↩️ Reset View', action: () => resetFocus() },
    { label: '✖️ Cancel', action: () => hideContextMenu() }
  ];

  // Type-specific menu items
  if (type === 'node' && originalData.publicIP) {
    menuItems.push({ label: '🔗 Copy Public IP', action: () => copyToClipboard(originalData.publicIP) });
  }

  if (type === 'infra') {
    menuItems.push({ label: '📋 Show Nodes', action: () => highlightInfraNodes(node) });
  }

  // Deregister / Delete action items for resource nodes
  const resourceId = originalData.id;
  const infraId = data.infraId || null;
  const actionableTypes = ['node', 'vnet', 'securityGroup', 'sshKey', 'dataDisk', 'customImage'];
  if (actionableTypes.includes(type) && resourceId && resourceId !== 'unknown') {
    menuItems.push({ separator: true });
    menuItems.push({
      label: '🔓 Deregister',
      color: '#e67e22',
      action: () => performGraphDeregister(type, resourceId, infraId)
    });
    menuItems.push({
      label: '🗑️ Delete',
      color: '#e74c3c',
      action: () => performGraphDelete(type, resourceId, infraId)
    });
  }

  // Create menu element
  contextMenuElement = document.createElement('div');
  contextMenuElement.id = 'resource-graph-context-menu';
  contextMenuElement.style.cssText = `
    position: fixed;
    left: -9999px;
    top: -9999px;
    background: white;
    border: 1px solid #ccc;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    min-width: 160px;
    padding: 4px 0;
  `;

  menuItems.forEach(item => {
    if (item.separator) {
      const sep = document.createElement('hr');
      sep.style.cssText = 'margin: 4px 0; border: none; border-top: 1px solid #e8e8e8;';
      contextMenuElement.appendChild(sep);
      return;
    }
    const menuItem = document.createElement('div');
    menuItem.textContent = item.label;
    menuItem.style.cssText = `
      padding: 8px 16px;
      cursor: pointer;
      font-size: 13px;
      transition: background 0.2s;
      ${item.color ? `color: ${item.color}; font-weight: 500;` : ''}
    `;
    menuItem.onmouseover = () => menuItem.style.background = '#f0f0f0';
    menuItem.onmouseout = () => menuItem.style.background = 'transparent';
    menuItem.onclick = () => {
      item.action();
      hideContextMenu();
    };
    contextMenuElement.appendChild(menuItem);
  });

  document.body.appendChild(contextMenuElement);

  // Measure menu size and adjust position to stay within viewport
  const menuRect = contextMenuElement.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  let finalX = position.x + 8;
  let finalY = position.y;
  
  // If menu would overflow right edge, show to the left of cursor
  if (finalX + menuRect.width > viewportWidth) {
    finalX = position.x - menuRect.width - 8;
  }
  
  // If menu would overflow bottom edge, show above cursor
  if (finalY + menuRect.height > viewportHeight) {
    finalY = viewportHeight - menuRect.height - 8;
  }
  
  // Ensure menu doesn't go off left or top edge
  if (finalX < 0) finalX = 8;
  if (finalY < 0) finalY = 8;
  
  contextMenuElement.style.left = `${finalX}px`;
  contextMenuElement.style.top = `${finalY}px`;

  // Close menu on outside click (remove any existing listener first)
  document.removeEventListener('click', hideContextMenu);
  setTimeout(() => {
    document.addEventListener('click', hideContextMenu, { once: true });
  }, 0);
}

function hideContextMenu() {
  if (contextMenuElement) {
    contextMenuElement.remove();
    contextMenuElement = null;
  }
}

function _escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _getGraphApiConfig() {
  const cfg = window.getConfig ? window.getConfig() : {};
  return {
    hostname: cfg.hostname || 'localhost',
    port: cfg.port || '1323',
    username: cfg.username || 'default',
    password: cfg.password || 'default',
    credentialHolder: cfg.credentialHolder || 'admin'
  };
}

function _graphDeregisterEndpoint(type, resourceId, infraId, ns) {
  switch (type) {
    case 'node':
      return infraId ? `/ns/${ns}/deregisterResource/infra/${infraId}/node/${resourceId}` : null;
    case 'vnet':
      return `/ns/${ns}/deregisterResource/vNet/${resourceId}?withSubnets=true`;
    case 'securityGroup':
      return `/ns/${ns}/deregisterResource/securityGroup/${resourceId}`;
    case 'sshKey':
      return `/ns/${ns}/deregisterResource/sshKey/${resourceId}`;
    case 'customImage':
      return `/ns/${ns}/deregisterResource/customImage/${resourceId}`;
    case 'dataDisk':
      return `/ns/${ns}/deregisterResource/dataDisk/${resourceId}`;
    default:
      return null;
  }
}

function _graphDeleteEndpoint(type, resourceId, infraId, ns) {
  switch (type) {
    case 'node':
      return infraId ? `/ns/${ns}/infra/${infraId}/node/${resourceId}` : null;
    case 'vnet':
      return `/ns/${ns}/resources/vNet/${resourceId}?action=withsubnets`;
    case 'securityGroup':
      return `/ns/${ns}/resources/securityGroup/${resourceId}`;
    case 'sshKey':
      return `/ns/${ns}/resources/sshKey/${resourceId}`;
    case 'customImage':
      return `/ns/${ns}/resources/customImage/${resourceId}`;
    case 'dataDisk':
      return `/ns/${ns}/resources/dataDisk/${resourceId}`;
    default:
      return null;
  }
}

async function performGraphDeregister(type, resourceId, infraId) {
  const typeLabels = {
    node: 'Node', vnet: 'vNet', securityGroup: 'Security Group',
    sshKey: 'SSH Key', dataDisk: 'Data Disk', customImage: 'Custom Image'
  };
  const label = typeLabels[type] || type;
  const ns = window.configNamespace || 'default';

  if (type === 'node' && !infraId) {
    await Swal.fire('Error', 'Could not determine Infra ID for this node.', 'error');
    return;
  }

  const endpoint = _graphDeregisterEndpoint(type, resourceId, infraId, ns);
  if (!endpoint) return;

  const confirm = await Swal.fire({
    title: `Deregister ${label}?`,
    html: `<p><strong>${_escapeHtml(resourceId)}</strong> will be removed from the CB-Tumblebug registry only.</p>
           <p><strong>The actual CSP resource will NOT be deleted.</strong></p>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#e67e22',
    confirmButtonText: 'Yes, deregister',
    cancelButtonText: 'Cancel'
  });
  if (!confirm.isConfirmed) return;

  const cfg = _getGraphApiConfig();
  try {
    Swal.fire({ title: 'Deregistering...', allowOutsideClick: true, didOpen: () => Swal.showLoading() });
    await axios({
      method: 'DELETE',
      url: `http://${cfg.hostname}:${cfg.port}/tumblebug${endpoint}`,
      headers: { 'X-Credential-Holder': cfg.credentialHolder },
      auth: { username: cfg.username, password: cfg.password },
      timeout: 60000
    });
    await Swal.fire({ title: 'Deregistered!', text: `${label} "${resourceId}" removed from registry.`, icon: 'success', timer: 2000, showConfirmButton: false });
    if (window.getInfra) window.getInfra();
  } catch (err) {
    const msg = err?.response?.data?.message || err?.message || 'Unknown error';
    await Swal.fire({ title: 'Deregister Failed', text: msg, icon: 'error' });
  }
}

async function performGraphDelete(type, resourceId, infraId) {
  const typeLabels = {
    node: 'Node', vnet: 'vNet', securityGroup: 'Security Group',
    sshKey: 'SSH Key', dataDisk: 'Data Disk', customImage: 'Custom Image'
  };
  const label = typeLabels[type] || type;
  const ns = window.configNamespace || 'default';

  if (type === 'node' && !infraId) {
    await Swal.fire('Error', 'Could not determine Infra ID for this node.', 'error');
    return;
  }

  const endpoint = _graphDeleteEndpoint(type, resourceId, infraId, ns);
  if (!endpoint) return;

  const confirm = await Swal.fire({
    title: `Delete ${label}?`,
    html: `<p>Are you sure you want to delete <strong>${_escapeHtml(resourceId)}</strong>?</p>
           <p style="color:#e74c3c;">This will permanently delete the actual CSP resource.</p>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#e74c3c',
    confirmButtonText: 'Yes, delete',
    cancelButtonText: 'Cancel'
  });
  if (!confirm.isConfirmed) return;

  const cfg = _getGraphApiConfig();
  try {
    Swal.fire({ title: 'Deleting...', allowOutsideClick: true, didOpen: () => Swal.showLoading() });
    await axios({
      method: 'DELETE',
      url: `http://${cfg.hostname}:${cfg.port}/tumblebug${endpoint}`,
      headers: { 'X-Credential-Holder': cfg.credentialHolder },
      auth: { username: cfg.username, password: cfg.password },
      timeout: 120000
    });
    await Swal.fire({ title: 'Deleted!', text: `${label} "${resourceId}" has been deleted.`, icon: 'success', timer: 2000, showConfirmButton: false });
    if (window.getInfra) window.getInfra();
  } catch (err) {
    const msg = err?.response?.data?.message || err?.message || 'Unknown error';
    await Swal.fire({ title: 'Delete Failed', text: msg, icon: 'error' });
  }
}

function copyToClipboard(text) {
  if (!navigator.clipboard) {
    // Fallback for non-HTTPS or unsupported browsers
    console.warn('[ResourceGraph] Clipboard API not available');
    if (Swal) {
      Swal.fire({
        title: 'Copy Failed',
        text: 'Clipboard not available in this context',
        icon: 'warning',
        timer: 2000,
        showConfirmButton: false
      });
    }
    return;
  }
  
  navigator.clipboard.writeText(text).then(() => {
    if (Swal) {
      Swal.fire({
        title: 'Copied!',
        text: text,
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });
    }
  }).catch(err => {
    console.error('[ResourceGraph] Failed to copy:', err);
    if (Swal) {
      Swal.fire({
        title: 'Copy Failed',
        text: 'Could not copy to clipboard',
        icon: 'error',
        timer: 2000,
        showConfirmButton: false
      });
    }
  });
}

function highlightInfraNodes(infraNode) {
  const nodes = infraNode.descendants().filter('[type="node"]');
  if (nodes.length > 0) {
    cy.elements().addClass('faded');
    nodes.removeClass('faded').addClass('highlighted');
    infraNode.removeClass('faded');
    cy.fit(nodes, 30);
  }
}

// ============================================================================
// TOOLTIP
// ============================================================================

let tooltipElement = null;

function showTooltip(node, position) {
  hideTooltip();

  // Don't show tooltip if Swal modal is open
  if (Swal && Swal.isVisible && Swal.isVisible()) {
    return;
  }

  const data = node.data();
  const type = data.type;
  const status = data.status || '';
  const originalData = data.originalData || {};

  // Remove emoji icon prefix from label (but GPU nodes have no icon)
  let tooltipText = type === 'gpu'
    ? data.label
    : data.label.replace(/^[^\s]+\s/, '');

  if (status) {
    tooltipText += ` (${status})`;
  }
  if (type === 'node' && originalData.publicIP) {
    tooltipText += `\n${originalData.publicIP}`;
  }
  // GPU node: show accelerator details in tooltip
  if (type === 'gpu') {
    const details = [];
    if (originalData.acceleratorCount) {
      details.push(`${originalData.acceleratorCount}x`);
    }
    if (originalData.acceleratorMemoryGB) {
      details.push(`${originalData.acceleratorMemoryGB}GB`);
    }
    if (details.length > 0) {
      tooltipText += `\n(${details.join(', ')})`;
    }
  }

  const container = document.getElementById('resource-graph-container');
  if (!container) return;

  tooltipElement = document.createElement('div');
  tooltipElement.id = 'resource-graph-tooltip';
  tooltipElement.textContent = tooltipText;
  tooltipElement.style.cssText = `
    position: absolute;
    left: ${position.x + 10}px;
    top: ${position.y + 10}px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    pointer-events: none;
    z-index: 9999;
    white-space: pre-line;
  `;

  container.appendChild(tooltipElement);
}

function hideTooltip() {
  if (tooltipElement) {
    tooltipElement.remove();
    tooltipElement = null;
  }
}

// ============================================================================
// VISIBILITY CONTROL
// ============================================================================

/**
 * Show the resource graph panel
 * Note: The caller should handle hiding/showing other containers (map, console)
 */
export function showResourceGraph() {
  const graphContainer = document.getElementById('resource-graph-container');
  
  if (graphContainer) {
    graphContainer.style.display = 'block';
    isGraphVisible = true;
    
    // Initialize if not already done
    if (!cy) {
      initResourceGraph();
    }

    // Get current data
    const infraData = window.cloudBaristaCentralData?.infraData || [];
    const namespace = window.configNamespace || '';
    
    // Always try to update graph if namespace is available (even with empty data)
    if (namespace) {
      updateGraph(infraData, namespace);
    } else {
      // Show loading message if no namespace selected
      console.log('[ResourceGraph] No namespace selected, waiting for data...');
    }

    // Resize graph to fit container
    setTimeout(() => {
      if (cy) {
        cy.resize();
        // If in focus/compact mode, fit only visible elements
        if (focusedNodeIds.size > 0) {
          const visibleElements = cy.elements().not('.hidden').not('.faded');
          if (visibleElements.length > 0) {
            cy.fit(visibleElements, 30);
          }
        } else {
          cy.fit(undefined, 30);
        }
        // Limit zoom level after fit (prevent over-zoom on few nodes)
        if (cy.zoom() > GRAPH_CONFIG.zoom.postFitMax) {
          cy.zoom(GRAPH_CONFIG.zoom.postFitMax);
          cy.center();
        }
      }
    }, 100);
    
    // Ensure subscription is active
    subscribeToUpdates();
  }
}

/**
 * Hide the resource graph panel
 * Note: Does NOT automatically show the map - let the caller decide what to display
 */
export function hideResourceGraph() {
  const graphContainer = document.getElementById('resource-graph-container');
  
  if (graphContainer) {
    graphContainer.style.display = 'none';
    isGraphVisible = false;
  }
}

/**
 * Toggle resource graph visibility
 */
export function toggleResourceGraph() {
  if (isGraphVisible) {
    hideResourceGraph();
  } else {
    showResourceGraph();
  }
}

// ============================================================================
// AUTO-UPDATE INTEGRATION
// ============================================================================

let isSubscribed = false;

/**
 * Subscribe to central data updates for auto-refresh
 */
export function subscribeToUpdates() {
  // Prevent duplicate subscriptions
  if (isSubscribed) return;
  
  if (window.subscribeToDataUpdates) {
    window.subscribeToDataUpdates((centralData) => {
      if (isGraphVisible) {
        const namespace = window.configNamespace || '';
        if (namespace) {
          // Pass full centralData for comprehensive change detection
          updateGraph(centralData.infraData || [], namespace, false, centralData);
        }
      }
    });
    isSubscribed = true;
    console.log('[ResourceGraph] Subscribed to data updates');
  } else {
    // Retry after a short delay if subscribeToDataUpdates is not yet available
    console.log('[ResourceGraph] subscribeToDataUpdates not available, retrying in 100ms...');
    setTimeout(subscribeToUpdates, 100);
  }
}

// ============================================================================
// EXPORT UTILITIES
// ============================================================================

/**
 * Export graph as PNG image
 */
export function exportGraphAsPng() {
  if (!cy) return;

  const png64 = cy.png({ full: true, scale: 2 });
  const link = document.createElement('a');
  link.href = png64;
  link.download = `resource-graph-${Date.now()}.png`;
  link.click();
  link.remove();  // Clean up DOM element
}

/**
 * Export graph as JSON
 */
export function exportGraphAsJson() {
  if (!cy) return;

  const json = cy.json();
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `resource-graph-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);  // Free up memory
  link.remove();  // Clean up DOM element
}

// ============================================================================
// CSP VISIBILITY TOGGLE
// ============================================================================

/**
 * Toggle CSP/Region/Zone nodes visibility
 * @returns {boolean} - New visibility state
 */
/**
 * Toggle visibility of a specific node type
 * @param {string} nodeType - The node type to toggle (e.g., 'csp', 'region', 'spec', 'image')
 * @returns {boolean} - New visibility state
 */
export function toggleNodeType(nodeType) {
  console.log(`[ResourceGraph] toggleNodeType called: ${nodeType}, current focusedNodeIds: ${focusedNodeIds.size}, compact: ${isCompactViewActive}`);
  
  if (!(nodeType in nodeTypeVisibility)) {
    console.warn(`[ResourceGraph] Unknown node type: ${nodeType}`);
    return { state: false, affectedTypes: [] };
  }
  
  const newState = !nodeTypeVisibility[nodeType];
  nodeTypeVisibility[nodeType] = newState;
  
  const affectedTypes = [nodeType];
  
  if (newState) {
    // Enabling: also enable all parent dependencies
    const parents = nodeTypeDependencies[nodeType] || [];
    parents.forEach(parent => {
      if (!nodeTypeVisibility[parent]) {
        nodeTypeVisibility[parent] = true;
        affectedTypes.push(parent);
      }
    });
  } else {
    // Disabling: also disable all children
    const children = nodeTypeChildren[nodeType] || [];
    children.forEach(child => {
      if (nodeTypeVisibility[child]) {
        nodeTypeVisibility[child] = false;
        affectedTypes.push(child);
      }
    });
  }
  
  console.log(`[ResourceGraph] ${nodeType} visibility: ${newState ? 'ON' : 'OFF'}${affectedTypes.length > 1 ? ` (also affected: ${affectedTypes.slice(1).join(', ')})` : ''}`);
  
  // For visibility toggle, we need to regenerate the graph because:
  // - When enabling: nodes don't exist yet (filtered out in infraDataToGraph)
  // - When disabling: we could hide with CSS, but regenerating is simpler and consistent
  // 
  // The key is to preserve focus state through the regeneration
  lastDataHash = null;  // Reset hash to force update
  
  const centralData = window.cloudBaristaCentralData;
  if (centralData && centralData.infraData && currentNamespace) {
    updateGraph(centralData.infraData, currentNamespace, true, centralData);
  }
  
  // Return both the new state and affected types for UI update
  return { state: nodeTypeVisibility[nodeType], affectedTypes };
}

/**
 * Get visibility state of a specific node type
 * @param {string} nodeType - The node type to check
 * @returns {boolean} - Current visibility state
 */
export function getNodeTypeVisibility(nodeType) {
  return nodeTypeVisibility[nodeType] || false;
}

/**
 * Get all node type visibility states
 * @returns {Object} - Copy of nodeTypeVisibility object
 */
export function getAllNodeTypeVisibility() {
  return { ...nodeTypeVisibility };
}

// ============================================================================
// GLOBAL EXPORTS (for use from HTML)
// ============================================================================

window.ResourceGraph = {
  init: initResourceGraph,
  show: showResourceGraph,
  hide: hideResourceGraph,
  toggle: toggleResourceGraph,
  update: updateGraph,
  focus: focusOnNeighbors,
  reset: resetFocus,
  runLayout: runLayout,
  setEdgeStyle: setEdgeStyle,
  exportPng: exportGraphAsPng,
  exportJson: exportGraphAsJson,
  subscribeToUpdates: subscribeToUpdates,
  toggleNodeType: toggleNodeType,
  getNodeTypeVisibility: getNodeTypeVisibility,
  getAllNodeTypeVisibility: getAllNodeTypeVisibility
};

// Auto-subscribe when module loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', subscribeToUpdates);
} else {
  subscribeToUpdates();
}

console.log('[ResourceGraph] Module loaded');
