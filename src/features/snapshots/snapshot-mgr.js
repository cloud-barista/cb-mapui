/**
 * Snapshot Management Feature Module
 * @module features/snapshots
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import { tbApiBase, getConfig } from '../../core/api.js';
import { escapeHtml } from '../../core/utils.js';

const addSpinnerTask = (name) => (window.addSpinnerTask ? window.addSpinnerTask(name) : name);
const removeSpinnerTask = (id) => { if (window.removeSpinnerTask) window.removeSpinnerTask(id); };
const errorAlert = (msg) => (window.errorAlert ? window.errorAlert(msg) : Swal.fire({ icon: 'error', title: msg, showConfirmButton: true }));
const successAlert = (msg) => (window.successAlert ? window.successAlert(msg) : Swal.fire({ icon: 'success', title: msg, showConfirmButton: false, timer: 2500 }));

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
  const namespace = window.configNamespace || '';
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
    const response = await axios.get(`${tbApiBase()}/ns/${namespace}/infra`, {
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
            `${tbApiBase()}/ns/${namespace}/infra/${infraId}`,
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
  const namespace = window.configNamespace || '';
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
        `${tbApiBase()}/ns/${namespace}/infra/${infraId}/snapshot`,
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
        `${tbApiBase()}/ns/${namespace}/infra/${infraId}/node/${nodeId}/snapshot`,
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
    namespace = window.currentSnapshotNamespace || window.configNamespace || '';
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
      `${tbApiBase()}/ns/${namespace}/resources/customImage`,
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
            ${img.imageStatus === 'Available' ? `<button onclick="deployFromCustomImage('${img.id}')" class="btn btn-sm btn-success" title="Deploy Infra with this Image" style="margin-right: 2px;">🚀</button>` : ''}
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
  const namespace = window.currentSnapshotNamespace || window.configNamespace || '';
  if (!namespace) {
    Swal.fire('Error', 'Namespace not available', 'error');
    return;
  }
  const config = getConfig();

  try {
    const response = await axios.get(
      `${tbApiBase()}/ns/${namespace}/resources/customImage/${imageId}`,
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
          ${img.imageStatus === 'Available' ? `
            <div style="margin-top: 15px;">
              <button type="button" class="btn btn-success btn-block" onclick="deployFromCustomImage('${img.id}')" style="width: 100%; padding: 8px 12px; font-size: 14px; font-weight: 600;">
                🚀 Deploy Infra with this Image
              </button>
            </div>
          ` : ''}
        </div>
      `,
      confirmButtonText: 'Close',
      width: '600px'
    }).then(() => {
      // Return to Snapshot Management modal after closing (unless deploying)
      if (window.skipSnapshotModalReopen) {
        window.skipSnapshotModalReopen = false;
        return;
      }
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

  const namespace = window.currentSnapshotNamespace || window.configNamespace || '';
  if (!namespace) {
    Swal.fire('Error', 'Namespace not available', 'error');
    return;
  }
  const config = getConfig();

  try {
    await axios.delete(
      `${tbApiBase()}/ns/${namespace}/resources/customImage/${imageId}`,
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

// Deploy Infra using selected Custom Image
async function deployFromCustomImage(imageId) {
  window.skipSnapshotModalReopen = true;
  Swal.close();
  setTimeout(() => {
    if (typeof window.selectSpecsForImage === 'function') {
      window.selectSpecsForImage(imageId);
    } else {
      Swal.fire('Error', 'Image deployment feature is not loaded', 'error');
    }
  }, 150);
}

// Make functions globally available
window.showSnapshotManagementModal = showSnapshotManagementModal;
window.createNodeSnapshotFromModal = createNodeSnapshotFromModal;
window.loadCustomImagesInModal = loadCustomImagesInModal;
window.viewCustomImageDetails = viewCustomImageDetails;
window.deleteCustomImageFromModal = deleteCustomImageFromModal;
window.deployFromCustomImage = deployFromCustomImage;
window.toggleSnapshotAutoRefresh = toggleSnapshotAutoRefresh;

export {
  showSnapshotManagementModal,
  createNodeSnapshotFromModal,
  loadCustomImagesInModal,
  viewCustomImageDetails,
  deleteCustomImageFromModal,
  deployFromCustomImage,
  toggleSnapshotAutoRefresh
};
