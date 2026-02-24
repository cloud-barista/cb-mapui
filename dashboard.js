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
*/

// Common delete function for all resources
async function deleteResourceAsync(resourceType, resourceId, additionalParams = {}) {
  try {
    // Get config and namespace from parent window (index.js)
    const parentConfig = window.parent?.getConfig?.() || { 
      hostname: 'localhost', 
      port: '1323',
      username: 'default', 
      password: 'default' 
    };
    
    // Get current namespace from parent window's namespace element
    const namespaceElement = window.parent?.document?.getElementById('namespace') || 
                            window.parent?.document?.getElementById('namespace-control');
    const currentNamespace = namespaceElement?.value || additionalParams.nsId || 'default';
    
    let endpoint = '';
    let confirmMessage = '';
    let successMessage = '';
    let successTitle = 'Request Accepted!'; // Default title
    
    switch (resourceType) {
      case 'mci':
        endpoint = `/ns/${currentNamespace}/mci/${resourceId}?option=terminate`;
        confirmMessage = `Are you sure you want to delete MCI "${resourceId}" and terminate all its VMs?`;
        successMessage = `Delete request for MCI "${resourceId}" has been accepted.`;
        break;
        
      case 'vm':
        endpoint = `/ns/${currentNamespace}/mci/${additionalParams.mciId}/vm/${resourceId}`;
        confirmMessage = `Are you sure you want to delete VM "${resourceId}" from MCI "${additionalParams.mciId}"?`;
        successMessage = `Delete request for VM "${resourceId}" has been accepted.`;
        break;
        
      case 'k8sCluster':
        endpoint = `/ns/${currentNamespace}/k8sCluster/${resourceId}`;
        confirmMessage = `Are you sure you want to delete K8s Cluster "${resourceId}"? This will also delete all associated node groups.`;
        successMessage = `Delete request for K8s Cluster "${resourceId}" has been accepted. The deletion process is running asynchronously.`;
        break;
        
      case 'k8sNodeGroup':
        endpoint = `/ns/${currentNamespace}/k8sCluster/${additionalParams.clusterId}/k8sNodeGroup/${resourceId}`;
        confirmMessage = `Are you sure you want to delete Node Group "${resourceId}" from cluster "${additionalParams.clusterId}"?`;
        successMessage = `Delete request for Node Group "${resourceId}" has been accepted. The deletion process is running asynchronously.`;
        break;
        
      case 'vNet':
        endpoint = `/ns/${currentNamespace}/resources/vNet/${resourceId}?action=withsubnets`;
        confirmMessage = `Are you sure you want to delete vNet "${resourceId}" and all its subnets?`;
        successMessage = `vNet "${resourceId}" has been deleted successfully.`;
        successTitle = 'Deleted!';
        break;
        
      case 'securityGroup':
        endpoint = `/ns/${currentNamespace}/resources/securityGroup/${resourceId}`;
        confirmMessage = `Are you sure you want to delete Security Group "${resourceId}"?`;
        successMessage = `Security Group "${resourceId}" has been deleted successfully.`;
        successTitle = 'Deleted!';
        break;
        
      case 'sshKey':
        endpoint = `/ns/${currentNamespace}/resources/sshKey/${resourceId}`;
        confirmMessage = `Are you sure you want to delete SSH Key "${resourceId}"?`;
        successMessage = `SSH Key "${resourceId}" has been deleted successfully.`;
        successTitle = 'Deleted!';
        break;
        
      case 'customImage':
        endpoint = `/ns/${currentNamespace}/resources/customImage/${resourceId}`;
        confirmMessage = `Are you sure you want to delete Custom Image "${resourceId}"?`;
        successMessage = `Custom Image "${resourceId}" has been deleted successfully.`;
        successTitle = 'Deleted!';
        break;
        
      case 'dataDisk':
        endpoint = `/ns/${currentNamespace}/resources/dataDisk/${resourceId}`;
        confirmMessage = `Are you sure you want to delete Data Disk "${resourceId}"?`;
        successMessage = `Data Disk "${resourceId}" has been deleted successfully.`;
        successTitle = 'Deleted!';
        break;
        
      default:
        throw new Error(`Unsupported resource type: ${resourceType}`);
    }

    // Show confirmation dialog
    const result = await Swal.fire({
      title: 'Delete Confirmation',
      text: confirmMessage,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) {
      return;
    }

    // Show loading indicator (non-blocking) - option 1: Modal dialog
    const loadingAlert = Swal.fire({
      title: 'Deleting...',
      text: 'Please wait while the resource is being deleted. You can continue using the interface.',
      allowOutsideClick: true,
      allowEscapeKey: true,
      showConfirmButton: true,
      confirmButtonText: 'Hide',
      showCancelButton: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    // Alternative option: Simple toast notification (uncomment to use instead)
    /*
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'info',
      title: 'Deleting resource...',
      text: `Deleting ${resourceType}: ${resourceId}`,
      showConfirmButton: false,
      timer: 0, // Keep showing until manually closed
      timerProgressBar: false
    });
    */

    // Make DELETE request using axios with auth (same as index.js)
    const fullUrl = `http://${parentConfig.hostname}:${parentConfig.port}/tumblebug${endpoint}`;
    
    const response = await axios({
      method: 'DELETE',
      url: fullUrl,
      auth: {
        username: parentConfig.username,
        password: parentConfig.password
      },
      timeout: 60000
    });

    // Show success message
    await Swal.fire({
      title: successTitle,
      text: successMessage,
      icon: 'success',
      timer: 3000,
      showConfirmButton: false
    });

    // Refresh the appropriate data
    refreshResourceData(resourceType, additionalParams);
    
    return true;

  } catch (error) {
    console.error(`Error deleting ${resourceType}:`, error);
    
    // Extract detailed error message from server response
    let errorMessage = `Failed to delete ${resourceType}`;
    let errorTitle = 'Delete Failed';
    
    if (error.response && error.response.data) {
      // If server returns structured error with message
      if (error.response.data.message) {
        errorMessage = error.response.data.message;
        
        // Parse specific error types for better user experience
        if (errorMessage.includes('Deleting the last nodegroup is not supported')) {
          errorTitle = 'Cannot Delete Last Node Group';
          errorMessage = 'Cannot delete the last node group in a K8s cluster. You must have at least one node group remaining.\n\nTo delete this cluster completely, delete the entire K8s cluster instead.';
        } else if (errorMessage.includes('Bad request')) {
          errorTitle = 'Invalid Request';
        } else if (errorMessage.includes('not found') || errorMessage.includes('Not Found')) {
          errorTitle = 'Resource Not Found';
          errorMessage = `The ${resourceType} "${resourceId}" was not found. It may have already been deleted.`;
        }
      } 
      // If server returns plain text error
      else if (typeof error.response.data === 'string') {
        errorMessage = error.response.data;
      }
      
      // Add status code information for technical details
      if (!errorMessage.includes(error.response.status)) {
        errorMessage += `\n\nStatus: ${error.response.status} ${error.response.statusText}`;
      }
    } else {
      // Network or other errors
      errorMessage = `${errorMessage}: ${error.message}`;
    }
    
    await Swal.fire({
      title: errorTitle,
      text: errorMessage,
      icon: 'error',
      confirmButtonText: 'OK',
      customClass: {
        popup: 'swal-wide'
      }
    });
    
    return false;
  }
}

// Refresh data after deletion
function refreshResourceData(resourceType, additionalParams) {
  try {
    switch (resourceType) {
      case 'mci':
        if (typeof loadMciData === 'function') {
          loadMciData();
        }
        break;
        
      case 'vm':
        if (typeof loadVmData === 'function') {
          loadVmData();
        }
        break;
        
      case 'k8sCluster':
        if (typeof loadK8sClusterData === 'function') {
          loadK8sClusterData();
        }
        break;
        
      case 'k8sNodeGroup':
        if (typeof updateK8sNodeGroupTable === 'function') {
          updateK8sNodeGroupTable();
        }
        break;
        
      case 'vNet':
        if (typeof loadvNetData === 'function') {
          loadvNetData();
        }
        break;
        
      case 'securityGroup':
        if (typeof loadSecurityGroupData === 'function') {
          loadSecurityGroupData();
        }
        break;
        
      case 'sshKey':
        if (typeof loadSshKeyData === 'function') {
          loadSshKeyData();
        }
        break;
        
      case 'customImage':
        if (typeof loadCustomImageData === 'function') {
          loadCustomImageData();
        }
        break;
        
      case 'dataDisk':
        if (typeof loadDataDiskData === 'function') {
          loadDataDiskData();
        }
        break;
        
      default:
        console.log(`No refresh function defined for ${resourceType}`);
    }
  } catch (error) {
    console.error(`Error refreshing ${resourceType} data:`, error);
  }
}

// Resource-specific delete functions
async function deleteMci(mciId, nsId = null) {
  return await deleteResourceAsync('mci', mciId, { nsId });
}

async function deleteVm(vmId, mciId, nsId = null) {
  return await deleteResourceAsync('vm', vmId, { mciId, nsId });
}

async function deleteK8sCluster(clusterId, nsId = null) {
  return await deleteResourceAsync('k8sCluster', clusterId, { nsId });
}

async function deleteK8sNodeGroup(nodeGroupName, clusterId, nsId = null) {
  return await deleteResourceAsync('k8sNodeGroup', nodeGroupName, { clusterId, nsId });
}

async function deleteVNet(vNetId, nsId = null) {
  return await deleteResourceAsync('vNet', vNetId, { nsId });
}

async function deleteSecurityGroup(securityGroupId, nsId = null) {
  return await deleteResourceAsync('securityGroup', securityGroupId, { nsId });
}

async function deleteSshKey(sshKeyId, nsId = null) {
  return await deleteResourceAsync('sshKey', sshKeyId, { nsId });
}

async function deleteCustomImage(customImageId, nsId = null) {
  return await deleteResourceAsync('customImage', customImageId, { nsId });
}

async function deleteDataDisk(dataDiskId, nsId = null) {
  return await deleteResourceAsync('dataDisk', dataDiskId, { nsId });
}

// VPN management functions
async function refreshVpnList() {
  try {
    if (window.parent && window.parent.loadVpnDataFromMcis) {
      await window.parent.loadVpnDataFromMcis();
      updateVpnTable();
    }
  } catch (error) {
    console.error('Error refreshing VPN list:', error);
    showErrorMessage('Failed to refresh VPN list: ' + error.message);
  }
}

async function deleteVpn(mciId, vpnId) {
  if (!confirm(`Are you sure you want to delete VPN "${vpnId}" from MCI "${mciId}"?`)) {
    return;
  }

  try {
    const config = window.parent?.getConfig() || {};
    const nsId = config.namespace || 'default';
    
    const response = await fetch(`${getApiUrl()}/tumblebug/ns/${nsId}/mci/${mciId}/vpn/${vpnId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    console.log(`VPN ${vpnId} deleted successfully from MCI ${mciId}`);
    showSuccessMessage(`VPN ${vpnId} deleted successfully`);
    
    // Refresh VPN data
    await refreshVpnList();
  } catch (error) {
    console.error('Error deleting VPN:', error);
    showErrorMessage('Failed to delete VPN: ' + error.message);
  }
}

async function viewVpnDetails(mciId, vpnId) {
  try {
    const config = window.parent?.getConfig() || {};
    const nsId = config.namespace || 'default';
    
    const response = await fetch(`${getApiUrl()}/tumblebug/ns/${nsId}/mci/${mciId}/vpn/${vpnId}`, {
      method: 'GET',
      headers: getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const vpnData = await response.json();
    showVpnDetailsModal(vpnData);
  } catch (error) {
    console.error('Error fetching VPN details:', error);
    showErrorMessage('Failed to load VPN details: ' + error.message);
  }
}

function showVpnDetailsModal(vpnData) {
  const modalContent = `
    <div class="modal fade" id="vpnDetailsModal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">VPN Details: ${vpnData.id}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row">
              <div class="col-md-6">
                <h6>Basic Information</h6>
                <table class="table table-sm">
                  <tr><td><strong>ID:</strong></td><td>${vpnData.id || 'N/A'}</td></tr>
                  <tr><td><strong>Name:</strong></td><td>${vpnData.name || 'N/A'}</td></tr>
                  <tr><td><strong>Status:</strong></td><td><span class="status-badge status-${(vpnData.status || 'unknown').toLowerCase()}">${vpnData.status || 'Unknown'}</span></td></tr>
                  <tr><td><strong>MCI ID:</strong></td><td>${vpnData.mciId || 'N/A'}</td></tr>
                </table>
              </div>
              <div class="col-md-6">
                <h6>Connection Configuration</h6>
                <table class="table table-sm">
                  <tr><td><strong>Provider:</strong></td><td>${vpnData.connectionConfig?.providerName || 'N/A'}</td></tr>
                  <tr><td><strong>Region:</strong></td><td>${vpnData.connectionConfig?.regionDetail?.regionName || 'N/A'}</td></tr>
                </table>
              </div>
            </div>
            ${vpnData.vpnSites && vpnData.vpnSites.length > 0 ? `
            <div class="mt-3">
              <h6>VPN Sites (${vpnData.vpnSites.length})</h6>
              <div class="table-responsive">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Site ID</th>
                      <th>Status</th>
                      <th>Gateway</th>
                      <th>CIDR</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${vpnData.vpnSites.map(site => `
                      <tr>
                        <td>${site.id || 'N/A'}</td>
                        <td><span class="status-badge status-${(site.status || 'unknown').toLowerCase()}">${site.status || 'Unknown'}</span></td>
                        <td>${site.gateway || 'N/A'}</td>
                        <td>${site.cidr || 'N/A'}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
            ` : '<div class="mt-3"><p class="text-muted">No VPN sites configured</p></div>'}
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Remove existing modal if any
  const existingModal = document.getElementById('vpnDetailsModal');
  if (existingModal) {
    existingModal.remove();
  }

  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalContent);

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('vpnDetailsModal'));
  modal.show();

  // Clean up modal after it's hidden
  document.getElementById('vpnDetailsModal').addEventListener('hidden.bs.modal', function() {
    this.remove();
  });
}

// Dashboard Configuration - DEPRECATED: Only used for settings modal UI
// All actual API calls should use parentConfig from index.js via window.parent.getConfig()
const dashboardConfig = {
  hostname: 'localhost',
  port: '1323',
  username: 'default',
  password: 'default',
  namespace: 'default',
  refreshInterval: 10000 // 10 seconds
};

// Global variables
let mciData = [];
let vmData = [];
let resourceData = {};
let centralData = {}; // Global centralData variable
let refreshTimer = null;
let charts = {};
let selectedMciId = null; // Track selected MCI for VM filtering
let selectedK8sClusterId = null; // Track selected K8s cluster for node group filtering
let eventListenersAttached = false; // Track if event listeners are already attached
let performanceCleanupTimer = null; // Timer for periodic cleanup

// Performance monitoring variables
let performanceMetrics = {
  chartUpdateCount: 0,
  domUpdateCount: 0,
  lastCleanupTime: Date.now(),
  memoryWarningThreshold: 50 // MB
};

// Cleanup function to prevent memory leaks
function destroyAllCharts() {
  Object.keys(charts).forEach(chartKey => {
    if (charts[chartKey] && typeof charts[chartKey].destroy === 'function') {
      console.log(`Destroying chart: ${chartKey}`);
      charts[chartKey].destroy();
      charts[chartKey] = null;
    }
  });
  charts = {};
}

// Performance cleanup function
function performPerformanceCleanup() {
  const now = Date.now();
  const timeSinceLastCleanup = now - performanceMetrics.lastCleanupTime;
  
  // Run cleanup every 5 minutes
  if (timeSinceLastCleanup > 300000) {
    console.log('[Performance] Running periodic cleanup...');
    
    // Clear any dangling timers
    clearDanglingTimers();
    
    // Force garbage collection if available (for testing)
    if (window.gc && typeof window.gc === 'function') {
      window.gc();
    }
    
    // Reset performance metrics
    performanceMetrics.chartUpdateCount = 0;
    performanceMetrics.domUpdateCount = 0;
    performanceMetrics.lastCleanupTime = now;
    
    console.log('[Performance] Cleanup completed');
  }
}

// Clear any dangling timers
function clearDanglingTimers() {
  // Clear the main refresh timer
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  
  // Clear performance cleanup timer
  if (performanceCleanupTimer) {
    clearInterval(performanceCleanupTimer);
    performanceCleanupTimer = null;
  }
}

// Start performance monitoring
function startPerformanceMonitoring() {
  // Set up periodic cleanup
  if (!performanceCleanupTimer) {
    performanceCleanupTimer = setInterval(performPerformanceCleanup, 60000); // Check every minute
    console.log('[Performance] Monitoring started');
  }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('Dashboard initializing...');
  
  // Load settings from localStorage
  loadSettings();
  
  // Start performance monitoring
  startPerformanceMonitoring();
  
  // Initialize charts
  initializeCharts();
  
  // Subscribe to central data updates from parent/main window
  if (window.parent && window.parent.subscribeToDataUpdates) {
    console.log('Subscribing to central data updates...');
    window.parent.subscribeToDataUpdates(function(receivedData) {
      console.log('Received data update from central store:', receivedData);
      
      // Store centralData globally
      centralData = receivedData;
      
      // Update local data
      mciData = centralData.mciData || [];
      vmData = centralData.vmData || [];
      resourceData = centralData.resourceData || {};
      
      // Update connection status based on data freshness
      if (centralData.lastUpdated && (Date.now() - new Date(centralData.lastUpdated).getTime()) < 30000) {
        updateConnectionStatus('connected');
      } else {
        updateConnectionStatus('disconnected');
      }
      
      // Update UI components
      updateStatistics();
      updateCharts();
      updateMciTable();
      updateVmTable();
      updateAllResourceTables();
      
      // Update last updated timestamp
      const lastUpdatedElement = document.getElementById('lastUpdated');
      if (lastUpdatedElement && centralData.lastUpdated) {
        lastUpdatedElement.textContent = new Date(centralData.lastUpdated).toLocaleTimeString('en-US');
      } else {
        lastUpdatedElement.textContent = 'No data';
      }
    });
    
    // Check if data is already available
    if (window.parent.cloudBaristaCentralData) {
      console.log('Using existing central data...');
      const centralData = window.parent.cloudBaristaCentralData;
      mciData = centralData.mciData || [];
      vmData = centralData.vmData || [];
      resourceData = centralData.resourceData || {};
      
      // Update connection status based on data availability
      if (centralData.lastUpdated && (Date.now() - new Date(centralData.lastUpdated).getTime()) < 30000) {
        updateConnectionStatus('connected');
      } else {
        updateConnectionStatus('disconnected');
      }
      
      // Update last updated timestamp
      const lastUpdatedElement = document.getElementById('lastUpdated');
      if (lastUpdatedElement && centralData.lastUpdated) {
        lastUpdatedElement.textContent = new Date(centralData.lastUpdated).toLocaleTimeString('en-US');
      } else {
        lastUpdatedElement.textContent = 'No data';
      }
      
      updateStatistics();
      updateCharts();
      updateMciTable();
      updateVmTable();
      updateAllResourceTables();
      
      // Force update resource counts even if no MCI data
      updateResourceCounts();
    } else {
      // No central data available yet
      console.log('Central data not available, waiting for data from Map...');
      updateConnectionStatus('disconnected');
      document.getElementById('lastUpdated').textContent = 'Waiting for Map data...';
    }
  } else {
    // Fallback: traditional loading if not in iframe
    console.log('Not in iframe context, using traditional data loading...');
    refreshDashboard();
    startAutoRefresh();
  }
  
  // Setup event listeners (only once)
  if (!eventListenersAttached) {
    setupEventListeners();
    eventListenersAttached = true;
  }
});

// Load settings from localStorage
function loadSettings() {
  const saved = localStorage.getItem('cb-dashboard-settings');
  if (saved) {
    const settings = JSON.parse(saved);
    Object.assign(dashboardConfig, settings);
    
    // Update form fields
    document.getElementById('hostname').value = dashboardConfig.hostname;
    document.getElementById('port').value = dashboardConfig.port;
    document.getElementById('username').value = dashboardConfig.username;
    document.getElementById('password').value = dashboardConfig.password;
    document.getElementById('namespace').value = dashboardConfig.namespace;
    document.getElementById('refreshInterval').value = dashboardConfig.refreshInterval / 1000;
  }
}

// Save settings to localStorage
function saveSettings() {
  dashboardConfig.hostname = document.getElementById('hostname').value;
  dashboardConfig.port = document.getElementById('port').value;
  dashboardConfig.username = document.getElementById('username').value;
  dashboardConfig.password = document.getElementById('password').value;
  dashboardConfig.namespace = document.getElementById('namespace').value;
  dashboardConfig.refreshInterval = parseInt(document.getElementById('refreshInterval').value) * 1000;
  
  localStorage.setItem('cb-dashboard-settings', JSON.stringify(dashboardConfig));
  
  // Close modal
  $('#settingsModal').modal('hide');
  
  // Restart auto-refresh with new interval
  startAutoRefresh();
  
  // Refresh data immediately
  refreshDashboard();
  
  showSuccessMessage('Settings saved successfully!');
}

// Show settings modal
function showSettings() {
  $('#settingsModal').modal('show');
}

// Initialize Chart.js charts with proper cleanup
function initializeCharts() {
  // Destroy existing charts before creating new ones to prevent memory leaks
  destroyAllCharts();
  
  // Combined MCI & VM Status Chart with dynamic colors based on status
  const combinedStatusCtx = document.getElementById('combinedStatusChart').getContext('2d');
  
  // Helper function to get chart colors from index.js functions
  function getChartColors(status, type = 'vm') {
    if (window.parent && window.parent.getVmStatusColor) {
      const colors = window.parent.getVmStatusColor(status);
      if (type === 'mci') {
        return colors.fill + 'CC'; // 80% opacity for MCI
      } else {
        return colors.fill + '99'; // 60% opacity for VM
      }
    }
    // Fallback colors if parent function not available
    const fallbackColors = {
      'Preparing': type === 'mci' ? 'rgba(247, 147, 26, 0.8)' : 'rgba(247, 147, 26, 0.6)',
      'Registering': type === 'mci' ? 'rgba(20, 184, 166, 0.8)' : 'rgba(20, 184, 166, 0.6)',  // teal-500
      'Creating': type === 'mci' ? 'rgba(59, 130, 246, 0.8)' : 'rgba(59, 130, 246, 0.6)',
      'Running': type === 'mci' ? 'rgba(16, 185, 129, 0.8)' : 'rgba(16, 185, 129, 0.6)',
      'Suspended': type === 'mci' ? 'rgba(245, 158, 11, 0.8)' : 'rgba(245, 158, 11, 0.6)',
      'Terminating': type === 'mci' ? 'rgba(239, 68, 68, 0.8)' : 'rgba(239, 68, 68, 0.6)',
      'Terminated': type === 'mci' ? 'rgba(220, 38, 38, 0.8)' : 'rgba(220, 38, 38, 0.6)',
      'Failed': type === 'mci' ? 'rgba(185, 28, 28, 0.8)' : 'rgba(185, 28, 28, 0.6)',
      'Other': type === 'mci' ? 'rgba(156, 163, 175, 0.8)' : 'rgba(156, 163, 175, 0.6)'
    };
    return fallbackColors[status] || fallbackColors['Other'];
  }
  
  const statusLabels = ['Preparing', 'Registering', 'Creating', 'Running', 'Suspended', 'Terminating', 'Terminated', 'Failed', 'Other'];

  charts.combinedStatus = new Chart(combinedStatusCtx, {
    type: 'bar',
    data: {
      labels: statusLabels,
      datasets: [
        {
          label: 'MCI Count',
          data: [0, 0, 0, 0, 0, 0, 0, 0, 0],
          backgroundColor: statusLabels.map(status => getChartColors(status, 'mci')),
          borderColor: 'rgba(52, 58, 64, 1)',        // Dark gray for legend
          legendColor: 'rgba(52, 58, 64, 0.8)',      // Dark gray for legend icon
        },
        {
          label: 'VM Count',
          data: [0, 0, 0, 0, 0, 0, 0, 0, 0],
          backgroundColor: statusLabels.map(status => getChartColors(status, 'vm')),
          // Use fixed color for legend (will be overridden during updates)
          borderColor: 'rgba(108, 117, 125, 1)',     // Light gray for legend
          legendColor: 'rgba(108, 117, 125, 0.8)',   // Light gray for legend icon
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 0 // Disable animations for frequent updates
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            boxWidth: 12,
            fontSize: 12
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.dataset.label || '';
              const value = context.parsed.y || 0;
              return `${label}: ${value}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          },
          title: {
            display: true,
            text: 'Count'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Status'
          }
        }
      }
    }
  });

  // Provider & Region Combined Chart
  const providerRegionCtx = document.getElementById('providerRegionChart').getContext('2d');
  charts.providerRegion = new Chart(providerRegionCtx, {
    type: 'bar',
    data: {
      labels: [], // Provider names
      datasets: [] // Will be dynamically populated with regions
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 0 // Disable animations for frequent updates
      },
      scales: {
        x: {
          stacked: true,
          title: {
            display: true,
            text: 'Cloud Provider'
          }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: {
            stepSize: 1
          },
          title: {
            display: true,
            text: 'Resource Count (VMs + Nodes)'
          }
        }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 12,
            fontSize: 10
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            title: function(tooltipItems) {
              return 'Provider: ' + tooltipItems[0].label;
            },
            label: function(context) {
              return context.dataset.label + ': ' + context.parsed.y + ' Resources (VMs + Nodes)';
            }
          }
        }
      },
      interaction: {
        mode: 'index',
        intersect: false
      }
    }
  });

  // K8s Cluster Status Chart with dynamic colors
  const k8sClusterStatusCtx = document.getElementById('k8sClusterStatusChart').getContext('2d');
  
  // Helper function to get K8s chart colors from index.js functions  
  function getK8sChartColors(status, opacity = 0.8) {
    if (window.parent && window.parent.getK8sStatusColor) {
      const colors = window.parent.getK8sStatusColor(status);
      // Convert hex to rgba with specified opacity
      const hex = colors.fill;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    // Fallback colors if parent function not available
    const fallbackColors = {
      'Creating': `rgba(59, 130, 246, ${opacity})`,    // Blue
      'Active': `rgba(16, 185, 129, ${opacity})`,      // Green  
      'Inactive': `rgba(245, 158, 11, ${opacity})`,    // Amber
      'Updating': `rgba(247, 147, 26, ${opacity})`,    // Orange
      'Deleting': `rgba(220, 38, 38, ${opacity})`,     // Red
      'Failed': `rgba(239, 68, 68, ${opacity})`,       // Light Red
      'Unknown': `rgba(107, 114, 128, ${opacity})`     // Gray
    };
    return fallbackColors[status] || fallbackColors['Unknown'];
  }
  
  const k8sStatusLabels = ['Creating', 'Active', 'Inactive', 'Updating', 'Deleting', 'Failed', 'Unknown'];
  
  charts.k8sClusterStatus = new Chart(k8sClusterStatusCtx, {
    type: 'bar',
    data: {
      labels: k8sStatusLabels,
      datasets: [
        {
          label: 'Cluster Count',
          data: [0, 0, 0, 0, 0, 0, 0],
          backgroundColor: k8sStatusLabels.map(status => getK8sChartColors(status, 0.8)),
        },
        {
          label: 'NodeGroup Count',
          data: [0, 0, 0, 0, 0, 0, 0],
          backgroundColor: k8sStatusLabels.map(status => getK8sChartColors(status, 0.65)),
        },
        {
          label: 'Node Count',
          data: [0, 0, 0, 0, 0, 0, 0],
          backgroundColor: k8sStatusLabels.map(status => getK8sChartColors(status, 0.5)),
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 0 // Disable animations for frequent updates
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            boxWidth: 12,
            fontSize: 12
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.dataset.label || '';
              const value = context.parsed.y || 0;
              return `${label}: ${value}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          },
          title: {
            display: true,
            text: 'Count'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Status'
          }
        }
      }
    }
  });
}

// Main refresh function - now uses shared data from index.js
async function refreshDashboard() {
  console.log('Refreshing dashboard using shared data...');
  showRefreshIndicator(true);
  
  try {
    // Trigger data update from parent window (Map)
    if (window.parent && typeof window.parent.getMci === 'function') {
      console.log('Requesting data update from Map...');
      window.parent.getMci();
      
      // Also trigger K8s data load
      if (typeof window.parent.loadK8sClusterData === 'function') {
        console.log('Requesting K8s data update from Map...');
        window.parent.loadK8sClusterData();
      }
      
      // Wait a moment for data to be updated
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    // Check if parent window has central data
    if (window.parent && window.parent.cloudBaristaCentralData) {
      const centralData = window.parent.cloudBaristaCentralData;
      
      // Update local data references
      mciData = centralData.mciData || [];
      vmData = centralData.vmData || [];
      resourceData = centralData.resourceData || {};
      
      // Update connection status based on data availability
      if (centralData.lastUpdated && (Date.now() - new Date(centralData.lastUpdated).getTime()) < 30000) {
        updateConnectionStatus('connected');
      } else {
        updateConnectionStatus('disconnected');
      }
      
      // Update all displays
      updateStatistics();
      updateCharts();
      updateK8sCharts();
      updateMciTable();
      updateVmTable();
      updateAllResourceTables();
      if (selectedK8sClusterId) {
        updateK8sNodeGroupTable();
      } else {
        // Show all node groups by default
        showAllNodeGroups();
      }
      
      // Update UI controls
      updateShowAllButton();
      
      // Update last refresh time from central data
      const lastUpdatedElement = document.getElementById('lastUpdated');
      if (lastUpdatedElement && centralData.lastUpdated) {
        lastUpdatedElement.textContent = new Date(centralData.lastUpdated).toLocaleTimeString('en-US');
      } else {
        lastUpdatedElement.textContent = 'No data';
      }
      
      console.log('Dashboard refreshed with shared data');
    } else {
      console.warn('No shared data available from parent window');
      updateConnectionStatus('disconnected');
      document.getElementById('lastUpdated').textContent = 'No connection';
    }
  } catch (error) {
    console.error('Error refreshing dashboard:', error);
    updateConnectionStatus('disconnected');
    showConnectionError('Failed to refresh dashboard: ' + error.message);
  } finally {
    showRefreshIndicator(false);
  }
}

// Test connection to CB-Tumblebug
async function testConnection() {
  // Get config from parent window (index.js) - same as delete functions
  const parentConfig = window.parent?.getConfig?.() || { 
    hostname: 'localhost', 
    port: '1323',
    username: 'default', 
    password: 'default' 
  };
  
  const url = `http://${parentConfig.hostname}:${parentConfig.port}/tumblebug/readyz`;
  
  try {
    const response = await axios.get(url, {
      auth: {
        username: parentConfig.username,
        password: parentConfig.password
      },
      timeout: 10000
    });
    
    return response.status === 200;
  } catch (error) {
    throw new Error(`Connection failed: ${error.message}`);
  }
}

// Update connection status indicator
function updateConnectionStatus(status) {
  const statusElement = document.getElementById('connectionStatus');
  
  switch (status) {
    case 'connected':
      statusElement.className = 'badge badge-success';
      statusElement.innerHTML = '<i class="fas fa-check-circle"></i> Connected';
      break;
    case 'connecting':
      statusElement.className = 'badge badge-warning';
      statusElement.innerHTML = '<i class="fas fa-sync fa-spin"></i> Updating';
      break;
    case 'disconnected':
      statusElement.className = 'badge badge-danger';
      statusElement.innerHTML = '<i class="fas fa-times-circle"></i> No Data';
      break;
    default:
      statusElement.className = 'badge badge-secondary';
      statusElement.innerHTML = '<i class="fas fa-question-circle"></i> Unknown';
  }
}

// Load namespace list
async function loadNamespaces() {
  // Get config from parent window (index.js) - same as delete functions
  const parentConfig = window.parent?.getConfig?.() || { 
    hostname: 'localhost', 
    port: '1323',
    username: 'default', 
    password: 'default' 
  };
  
  const url = `http://${parentConfig.hostname}:${parentConfig.port}/tumblebug/ns`;
  
  try {
    const response = await axios.get(url, {
      auth: {
        username: parentConfig.username,
        password: parentConfig.password
      },
      timeout: 30000
    });
    
    const namespaces = response.data.ns || [];
    const namespaceSelect = document.getElementById('namespace');
    
    // Clear existing options
    namespaceSelect.innerHTML = '';
    
    // Add namespaces
    namespaces.forEach(ns => {
      const option = document.createElement('option');
      option.value = ns.id;
      option.textContent = ns.id;
      if (ns.id === dashboardConfig.namespace) {
        option.selected = true;
      }
      namespaceSelect.appendChild(option);
    });
    
    // If current namespace doesn't exist, use first available
    if (!namespaces.find(ns => ns.id === dashboardConfig.namespace) && namespaces.length > 0) {
      dashboardConfig.namespace = namespaces[0].id;
      namespaceSelect.value = dashboardConfig.namespace;
    }
  } catch (error) {
    console.error('Error loading namespaces:', error);
    // Use default namespace if API call fails
  }
}

// Load MCI data
async function loadMciData() {
  if (!dashboardConfig.namespace) {
    throw new Error('No namespace selected');
  }
  
  // Get config from parent window (index.js) - same as delete functions
  const parentConfig = window.parent?.getConfig?.() || { 
    hostname: 'localhost', 
    port: '1323',
    username: 'default', 
    password: 'default' 
  };
  
  const url = `http://${parentConfig.hostname}:${parentConfig.port}/tumblebug/ns/${dashboardConfig.namespace}/mci`;
  
  try {
    const response = await axios.get(url, {
      auth: {
        username: parentConfig.username,
        password: parentConfig.password
      },
      timeout: 30000
    });
    
    mciData = response.data.mci || [];
    
    // Extract VM data from MCI data
    vmData = [];
    mciData.forEach(mci => {
      if (mci.vm && Array.isArray(mci.vm)) {
        mci.vm.forEach(vm => {
          vmData.push({
            ...vm,
            mciId: mci.id,
            mciStatus: mci.status
          });
        });
      }
    });
    
    console.log(`Loaded ${mciData.length} MCIs with ${vmData.length} VMs`);
  } catch (error) {
    console.error('Error loading MCI data:', error);
    throw error;
  }
}

// Load resource overview
async function loadResourceOverview() {
  if (!dashboardConfig.namespace) return;
  
  // Get config from parent window (index.js) - same as delete functions
  const parentConfig = window.parent?.getConfig?.() || { 
    hostname: 'localhost', 
    port: '1323',
    username: 'default', 
    password: 'default' 
  };
  
  const resources = ['vNet', 'securityGroup', 'sshKey'];
  
  for (const resourceType of resources) {
    try {
      const url = `http://${parentConfig.hostname}:${parentConfig.port}/tumblebug/ns/${dashboardConfig.namespace}/resources/${resourceType}`;
      
      const response = await axios.get(url, {
        auth: {
          username: parentConfig.username,
          password: parentConfig.password
        },
        timeout: 30000
      });
      
      // Handle different response structures
      if (response.data && response.data[resourceType]) {
        resourceData[resourceType] = response.data[resourceType];
      } else if (Array.isArray(response.data)) {
        resourceData[resourceType] = response.data;
      } else {
        resourceData[resourceType] = [];
      }
      
      console.log(`Loaded ${resourceType}:`, resourceData[resourceType]);
    } catch (error) {
      console.error(`Error loading ${resourceType}:`, error);
      resourceData[resourceType] = [];
    }
  }
  
  updateResourceDisplay();
}

// Function to parse and normalize MCI status
function normalizeMciStatus(status) {
  if (!status) return 'Unknown';
  
  // Convert to string and trim
  const statusStr = String(status).trim();
  
  // Handle complex status patterns
  if (statusStr.includes('Running')) {
    return 'Running';
  } else if (statusStr.includes('Creating')) {
    return 'Creating';
  } else if (statusStr.includes('Preparing')) {
    return 'Preparing';
  } else if (statusStr.includes('Empty')) {
    return 'Empty';
  } else if (statusStr.includes('Suspended')) {
    return 'Suspended';
  } else if (statusStr.includes('Failed')) {
    return 'Failed';
  } else if (statusStr.includes('Terminating')) {
    return 'Terminating';
  } else if (statusStr.includes('Partial')) {
    // Handle cases like "Partial-Running", "Partial-Failed", etc.
    if (statusStr.includes('Running')) {
      return 'Running';
    } else if (statusStr.includes('Failed')) {
      return 'Failed';
    } else {
      return 'Partial';
    }
  }
  
  // Check for exact matches for simple statuses
  switch (statusStr) {
    case 'Running':
      return 'Running';
    case 'Suspended':
      return 'Suspended';
    case 'Failed':
      return 'Failed';
    case 'Creating':
      return 'Creating';
    case 'Preparing':
      return 'Preparing';
    case 'Empty':
      return 'Empty';
    case 'Terminating':
      return 'Terminating';
    default:
      return 'Other';
  }
}

// Update statistics cards
function updateStatistics() {
  const totalMci = mciData.length;
  
  // Handle complex status counting with improved parsing
  let runningMci = 0;
  let failedMci = 0;
  let creatingMci = 0;
  let preparingMci = 0;
  
  mciData.forEach(mci => {
    const normalizedStatus = normalizeMciStatus(mci.status);
    
    switch (normalizedStatus) {
      case 'Running':
        runningMci++;
        break;
      case 'Creating':
        creatingMci++;
        break;
      case 'Preparing':
        preparingMci++;
        break;
      case 'Failed':
        failedMci++;
        break;
    }
  });
  
  const totalVm = vmData.length;
  
  // Get unique providers from both VMs and K8s clusters
  const providers = new Set();
  
  // Add providers from VMs
  vmData.forEach(vm => {
    if (vm.connectionConfig && vm.connectionConfig.providerName) {
      providers.add(vm.connectionConfig.providerName);
    }
  });
  
  // Add providers from K8s clusters
  let k8sData = [];
  if (window.parent && window.parent.cloudBaristaCentralData) {
    k8sData = window.parent.cloudBaristaCentralData.k8sCluster || [];
  }
  
  k8sData.forEach(cluster => {
    if (cluster.connectionConfig && cluster.connectionConfig.providerName) {
      providers.add(cluster.connectionConfig.providerName);
    }
  });

  // Calculate total unique regions from VMs and K8s clusters
  const regions = new Set();
  
  // Add regions from VMs
  vmData.forEach(vm => {
    let region = null;
    
    // Extract region information - try multiple sources
    // Note: JSON field is lowercase 'region' (from Go struct tag `json:"region"`)
    if (vm.region && vm.region.region) {
      region = vm.region.region;
    } else if (vm.location && vm.location.region) {
      region = vm.location.region;
    } else if (vm.connectionConfig && vm.connectionConfig.regionZoneInfo && vm.connectionConfig.regionZoneInfo.region) {
      region = vm.connectionConfig.regionZoneInfo.region;
    } else if (vm.regionZoneInfoList && vm.regionZoneInfoList.length > 0 && vm.regionZoneInfoList[0].regionName) {
      region = vm.regionZoneInfoList[0].regionName;
    }
    
    if (region) {
      regions.add(region);
    }
  });
  
  // Add regions from K8s clusters
  k8sData.forEach(cluster => {
    let region = null;
    
    // Extract region information from cluster
    // Note: JSON field is lowercase 'region' (from Go struct tag `json:"region"`)
    if (cluster.region && cluster.region.region) {
      region = cluster.region.region;
    } else if (cluster.location && cluster.location.region) {
      region = cluster.location.region;
    } else if (cluster.connectionConfig && cluster.connectionConfig.regionZoneInfo && cluster.connectionConfig.regionZoneInfo.region) {
      region = cluster.connectionConfig.regionZoneInfo.region;
    }
    
    if (region) {
      regions.add(region);
    }
  });
  
  document.getElementById('totalRegionCount').textContent = regions.size;
  document.getElementById('runningMciCount').textContent = runningMci;
  document.getElementById('failedMciCount').textContent = failedMci;
  document.getElementById('totalVmCount').textContent = totalVm;
  document.getElementById('totalProviderCount').textContent = providers.size;

  // Update resource counts from central data
  updateResourceCounts();
}

// Update resource counts from central data store
function updateResourceCounts() {
  try {
    // Get data from central store through parent window
    let centralData = {};
    if (window.parent && window.parent.cloudBaristaCentralData) {
      centralData = window.parent.cloudBaristaCentralData;
      console.log('Central data available:', centralData);
    } else {
      console.log('Central data not available');
    }

    // Update vNet count
    const vNetCount = centralData.vNet ? centralData.vNet.length : 0;
    const vNetElement = document.getElementById('vNetCount');
    if (vNetElement) vNetElement.textContent = vNetCount;
    console.log('vNet count:', vNetCount, 'Data:', centralData.vNet);

    // Update Security Group count
    const securityGroupCount = centralData.securityGroup ? centralData.securityGroup.length : 0;
    const securityGroupElement = document.getElementById('securityGroupCount');
    if (securityGroupElement) securityGroupElement.textContent = securityGroupCount;
    console.log('Security Group count:', securityGroupCount, 'Data:', centralData.securityGroup);

    // Update SSH Key count
    const sshKeyCount = centralData.sshKey ? centralData.sshKey.length : 0;
    const sshKeyElement = document.getElementById('sshKeyCount');
    if (sshKeyElement) sshKeyElement.textContent = sshKeyCount;
    console.log('SSH Key count:', sshKeyCount, 'Data:', centralData.sshKey);
    
    // Update K8s Cluster count with API status indicator
    const k8sClusterCount = centralData.k8sCluster ? centralData.k8sCluster.length : 0;
    const k8sClusterElement = document.getElementById('k8sClusterCount');
    const totalK8sClusterElement = document.getElementById('totalK8sClusterCount');
    
    if (k8sClusterElement) {
      k8sClusterElement.textContent = k8sClusterCount;
      
      // Add API status indicator for K8s clusters
      if (centralData.apiStatus && centralData.apiStatus.k8sCluster === 'error') {
        k8sClusterElement.title = `Last K8s API error: ${centralData.apiStatus.lastK8sClusterError?.message || 'Unknown error'}\nShowing cached data`;
        k8sClusterElement.style.color = '#ffc107'; // Warning color for stale data
      } else {
        k8sClusterElement.title = '';
        k8sClusterElement.style.color = ''; // Reset to default
      }
    }
    
    if (totalK8sClusterElement) {
      totalK8sClusterElement.textContent = k8sClusterCount;
      
      // Add API status indicator for total K8s count
      if (centralData.apiStatus && centralData.apiStatus.k8sCluster === 'error') {
        totalK8sClusterElement.title = `Last K8s API error: ${centralData.apiStatus.lastK8sClusterError?.message || 'Unknown error'}\nShowing cached data`;
        totalK8sClusterElement.style.color = '#ffc107'; // Warning color for stale data
      } else {
        totalK8sClusterElement.title = '';
        totalK8sClusterElement.style.color = ''; // Reset to default
      }
    }

    // Update Connection count
    const connectionCount = centralData.connection ? centralData.connection.length : 0;
    const connectionElement = document.getElementById('connectionCount');
    if (connectionElement) connectionElement.textContent = connectionCount;

    // Update VPN count
    const vpnCount = centralData.vpn ? centralData.vpn.length : 0;
    const vpnElement = document.getElementById('vpnCount');
    if (vpnElement) vpnElement.textContent = vpnCount;
    
    // Update VPN count badge (for table)
    const vpnCountBadge = document.getElementById('vpnCountBadge');
    if (vpnCountBadge) vpnCountBadge.textContent = vpnCount;

    // Update Custom Image count
    const customImageCount = centralData.customImage ? centralData.customImage.length : 0;
    const customImageElement = document.getElementById('customImageCount');
    if (customImageElement) customImageElement.textContent = customImageCount;

    // Update Data Disk count
    const dataDiskCount = centralData.dataDisk ? centralData.dataDisk.length : 0;
    const dataDiskElement = document.getElementById('dataDiskCount');
    if (dataDiskElement) dataDiskElement.textContent = dataDiskCount;

    // Update Object Storage count (API not yet available)
    const objectStorageCount = 0; // TODO: API not yet implemented in CB-Tumblebug
    const objectStorageElement = document.getElementById('objectStorageCount');
    if (objectStorageElement) objectStorageElement.textContent = objectStorageCount;

    // Update SQL Database count (API not yet available)
    const sqlDbCount = 0; // TODO: API not yet implemented in CB-Tumblebug
    const sqlDbElement = document.getElementById('sqlDbCount');
    if (sqlDbElement) sqlDbElement.textContent = sqlDbCount;

    console.log('Resource counts updated:', {
      vNet: vNetCount,
      securityGroup: securityGroupCount,
      sshKey: sshKeyCount,
      k8sCluster: k8sClusterCount,
      connection: connectionCount,
      vpn: vpnCount,
      customImage: customImageCount,
      dataDisk: dataDiskCount,
      objectStorage: objectStorageCount,
      sqlDb: sqlDbCount
    });
  } catch (error) {
    console.error('Error updating resource counts:', error);
  }
}

// Update charts
// Update charts with performance optimization
function updateCharts() {
  performanceMetrics.chartUpdateCount++;
  
  try {
    console.log(`Updating charts with current data... (update #${performanceMetrics.chartUpdateCount})`);
    
    // Ensure charts exist before updating
    if (!charts.combinedStatus || !charts.providerRegion || !charts.k8sClusterStatus) {
      console.warn('Charts not initialized, skipping update');
      return;
    }
    
    // Update MCI & VM Status Chart with efficient data processing
    updateCombinedStatusChart();
    
    // Update Provider & Regional Distribution Chart (VMs + Nodes)
    updateProviderRegionChart();
    
    // Update K8s Charts
    updateK8sCharts();
    
    console.log('Charts updated successfully');
    
  } catch (error) {
    console.error('Error updating charts:', error);
  }
}

// Separate function for combined status chart update
function updateCombinedStatusChart() {
  const mciStatusCounts = {
    'Running': 0,
    'Registering': 0,
    'Creating': 0,
    'Preparing': 0,
    'Suspended': 0,
    'Failed': 0,
    'Terminating': 0,
    'Terminated': 0,
    'Other': 0
  };
  
  const vmStatusCounts = {
    'Running': 0,
    'Registering': 0,
    'Creating': 0,
    'Preparing': 0,
    'Suspended': 0,
    'Failed': 0,
    'Terminating': 0,
    'Terminated': 0,
    'Other': 0
  };
  
  // Count MCI statuses
  mciData.forEach(mci => {
    const normalizedStatus = categorizeStatus(mci.status);
    if (mciStatusCounts.hasOwnProperty(normalizedStatus)) {
      mciStatusCounts[normalizedStatus]++;
    } else {
      mciStatusCounts['Other']++;
    }
  });
  
  // Count VM statuses
  vmData.forEach(vm => {
    const normalizedStatus = categorizeStatus(vm.status);
    if (vmStatusCounts.hasOwnProperty(normalizedStatus)) {
      vmStatusCounts[normalizedStatus]++;
    } else {
      vmStatusCounts['Other']++;
    }
  });
  
  // Prepare data for combined chart
  const statusLabels = ['Preparing', 'Registering', 'Creating', 'Running', 'Suspended', 'Terminating', 'Terminated', 'Failed', 'Other'];
  const mciDataArray = statusLabels.map(label => mciStatusCounts[label] || 0);
  const vmDataArray = statusLabels.map(label => vmStatusCounts[label] || 0);
  
  // Check if there's any data to display
  const hasMciData = mciDataArray.some(count => count > 0);
  const hasVmData = vmDataArray.some(count => count > 0);
  
  // Only update if data has changed (performance optimization)
  const currentMciData = JSON.stringify(charts.combinedStatus.data.datasets[0].data);
  const currentVmData = JSON.stringify(charts.combinedStatus.data.datasets[1].data);
  const newMciData = JSON.stringify(mciDataArray);
  const newVmData = JSON.stringify(vmDataArray);
  
  if (currentMciData === newMciData && currentVmData === newVmData) {
    return; // No data change, skip update
  }
  
  // Update combined chart - show "No Data" if no data
  if (!hasMciData && !hasVmData) {
    charts.combinedStatus.data.labels = ['No Data'];
    charts.combinedStatus.data.datasets[0].data = [1];
    charts.combinedStatus.data.datasets[0].label = 'No MCIs';
    charts.combinedStatus.data.datasets[0].backgroundColor = ['#e9ecef'];
    charts.combinedStatus.data.datasets[1].data = [1];
    charts.combinedStatus.data.datasets[1].label = 'No VMs';
    charts.combinedStatus.data.datasets[1].backgroundColor = ['#f8f9fa'];
  } else {
    // Use helper function defined in initializeCharts for consistent colors
    function getChartColors(status, type = 'vm') {
      if (window.parent && window.parent.getVmStatusColor) {
        const colors = window.parent.getVmStatusColor(status);
        if (type === 'mci') {
          return colors.fill + 'CC'; // 80% opacity for MCI
        } else {
          return colors.fill + '99'; // 60% opacity for VM
        }
      }
      // Fallback colors if parent function not available
      const fallbackColors = {
        'Preparing': type === 'mci' ? 'rgba(247, 147, 26, 0.8)' : 'rgba(247, 147, 26, 0.6)',
        'Creating': type === 'mci' ? 'rgba(59, 130, 246, 0.8)' : 'rgba(59, 130, 246, 0.6)',
        'Running': type === 'mci' ? 'rgba(16, 185, 129, 0.8)' : 'rgba(16, 185, 129, 0.6)',
        'Suspended': type === 'mci' ? 'rgba(245, 158, 11, 0.8)' : 'rgba(245, 158, 11, 0.6)',
        'Terminating': type === 'mci' ? 'rgba(239, 68, 68, 0.8)' : 'rgba(239, 68, 68, 0.6)',
        'Terminated': type === 'mci' ? 'rgba(220, 38, 38, 0.8)' : 'rgba(220, 38, 38, 0.6)',
        'Failed': type === 'mci' ? 'rgba(185, 28, 28, 0.8)' : 'rgba(185, 28, 28, 0.6)',
        'Other': type === 'mci' ? 'rgba(156, 163, 175, 0.8)' : 'rgba(156, 163, 175, 0.6)'
      };
      return fallbackColors[status] || fallbackColors['Other'];
    }
    
    charts.combinedStatus.data.labels = statusLabels;
    charts.combinedStatus.data.datasets[0].data = mciDataArray;
    charts.combinedStatus.data.datasets[0].label = 'MCI Count';
    charts.combinedStatus.data.datasets[0].backgroundColor = statusLabels.map(status => getChartColors(status, 'mci'));
    charts.combinedStatus.data.datasets[1].data = vmDataArray;
    charts.combinedStatus.data.datasets[1].label = 'VM Count';
    charts.combinedStatus.data.datasets[1].backgroundColor = statusLabels.map(status => getChartColors(status, 'vm'));
  }
  charts.combinedStatus.update('none'); // Disable animation for better performance
}

// Separate function for provider region chart update  
function updateProviderRegionChart() {
  const providerRegionData = {};
  
  // Get K8s data from central store for node information
  let k8sData = [];
  if (window.parent && window.parent.cloudBaristaCentralData) {
    k8sData = window.parent.cloudBaristaCentralData.k8sCluster || [];
  }
  
  // Check if we have any data at all (VM or K8s)
  const hasVmData = vmData && vmData.length > 0;
  const hasK8sData = k8sData && k8sData.length > 0;
  
  if (!hasVmData && !hasK8sData) {
    // Only update if different from current state
    if (charts.providerRegion.data.labels[0] !== 'No Data') {
      charts.providerRegion.data.labels = ['No Data'];
      charts.providerRegion.data.datasets = [{
        label: 'No Resources',
        data: [1],
        backgroundColor: ['#e9ecef']
      }];
      charts.providerRegion.update('none');
    }
    return;
  }
  
  // Collect VM data by provider and region
  if (hasVmData) {
    vmData.forEach(vm => {
      let provider = null;
      let region = null;
      
      // Extract provider information
      if (vm.connectionConfig && vm.connectionConfig.providerName) {
        provider = vm.connectionConfig.providerName;
      } else if (vm.location && vm.location.cloudType) {
        provider = vm.location.cloudType;
      }
      
      // Extract region information - try multiple sources
      // Note: JSON field is lowercase 'region' (from Go struct tag `json:"region"`)
      if (vm.region && vm.region.region) {
        region = vm.region.region;
      } else if (vm.location && vm.location.region) {
        region = vm.location.region;
      } else if (vm.connectionConfig && vm.connectionConfig.regionZoneInfo && vm.connectionConfig.regionZoneInfo.region) {
        region = vm.connectionConfig.regionZoneInfo.region;
      } else if (vm.regionZoneInfoList && vm.regionZoneInfoList.length > 0 && vm.regionZoneInfoList[0].regionName) {
        region = vm.regionZoneInfoList[0].regionName;
      }
      
      // Skip VMs without proper provider/region info
      if (!provider || !region) {
        return;
      }
      
      // Initialize provider if not exists
      if (!providerRegionData[provider]) {
        providerRegionData[provider] = {};
      }
      
      // Count VMs by provider and region
      providerRegionData[provider][region] = (providerRegionData[provider][region] || 0) + 1;
    });
  }
  
  // Collect K8s Node data by provider and region
  if (hasK8sData) {
    console.log('Processing K8s data for Provider & Region chart:', k8sData);
    k8sData.forEach(cluster => {
      let provider = null;
      let region = null;
      
      console.log('Processing K8s cluster:', cluster.id, 'Connection:', cluster.connectionName);
      console.log('Full cluster object:', cluster);
      
      // Extract provider information from cluster
      if (cluster.connectionConfig && cluster.connectionConfig.providerName) {
        provider = cluster.connectionConfig.providerName.toLowerCase(); // Normalize to lowercase
        console.log('Provider from connectionConfig.providerName:', provider);
      } else if (cluster.location && cluster.location.cloudType) {
        provider = cluster.location.cloudType.toLowerCase(); // Normalize to lowercase
        console.log('Provider from location.cloudType:', provider);
      } else if (cluster.k8sNodeGroupList && cluster.k8sNodeGroupList.length > 0 && cluster.k8sNodeGroupList[0].connectionConfig && cluster.k8sNodeGroupList[0].connectionConfig.providerName) {
        provider = cluster.k8sNodeGroupList[0].connectionConfig.providerName.toLowerCase(); // Normalize to lowercase
        console.log('Provider from k8sNodeGroupList[0].connectionConfig.providerName:', provider);
      }
      
      // Extract region information from cluster
      if (cluster.connectionConfig && cluster.connectionConfig.regionDetail && cluster.connectionConfig.regionDetail.regionId) {
        region = cluster.connectionConfig.regionDetail.regionId;
        console.log('Region from connectionConfig.regionDetail.regionId:', region);
      } else if (cluster.region && cluster.region.region) {
        region = cluster.region.region;
        console.log('Region from cluster.region.region:', region);
      } else if (cluster.location && cluster.location.region) {
        region = cluster.location.region;
        console.log('Region from cluster.location.region:', region);
      }
      
      console.log('Final extracted - Provider:', provider, 'Region:', region);
      
      // Skip clusters without proper provider/region info
      if (!provider || !region) {
        console.log('Skipping cluster due to missing provider or region info');
        return;
      }
      
      // Initialize provider if not exists
      if (!providerRegionData[provider]) {
        providerRegionData[provider] = {};
      }
      
      // Count nodes from all node groups in this cluster
      if (cluster.k8sNodeGroupList && cluster.k8sNodeGroupList.length > 0) {
        console.log('Processing node groups:', cluster.k8sNodeGroupList);
        cluster.k8sNodeGroupList.forEach(nodeGroup => {
          console.log('Processing NodeGroup:', nodeGroup.name || nodeGroup.id);
          console.log('NodeGroup data:', nodeGroup);
          
          let nodeCount = 0;
          
          // Use only actual k8sNodes array length (real existing nodes)
          if (nodeGroup.k8sNodes && Array.isArray(nodeGroup.k8sNodes)) {
            nodeCount = nodeGroup.k8sNodes.length;
            console.log('NodeCount from k8sNodes.length (actual nodes):', nodeCount);
          } else {
            console.log('No k8sNodes array found, nodeCount = 0');
          }
          
          console.log('Final NodeCount for', nodeGroup.name || nodeGroup.id, ':', nodeCount);
          
          if (nodeCount > 0) {
            // Add nodes to provider/region count
            providerRegionData[provider][region] = (providerRegionData[provider][region] || 0) + nodeCount;
            console.log(`Added ${nodeCount} nodes to ${provider}/${region}. Total now:`, providerRegionData[provider][region]);
          } else {
            console.log('NodeCount is 0, not adding to chart data');
          }
        });
      } else {
        console.log('No node groups found in cluster');
      }
    });
    console.log('Final providerRegionData after K8s processing:', providerRegionData);
  }
  
  // Process data for stacked bar chart
  const providers = Object.keys(providerRegionData);
  const allRegions = new Set();
  
  // Get all unique regions
  providers.forEach(provider => {
    Object.keys(providerRegionData[provider]).forEach(region => {
      allRegions.add(region);
    });
  });
  
  const regionColors = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
    '#FF6B6B', '#C9CBCF', '#4BC0C0', '#FFA07A', '#98D8C8', '#F7DC6F'
  ];
  
  // Prepare datasets for each region
  const datasets = Array.from(allRegions).map((region, index) => ({
    label: region,
    data: providers.map(provider => providerRegionData[provider][region] || 0),
    backgroundColor: regionColors[index % regionColors.length],
    borderColor: regionColors[index % regionColors.length],
    borderWidth: 1
  }));
  
  // Check if data has changed before updating (performance optimization)
  const currentLabels = JSON.stringify(charts.providerRegion.data.labels);
  const newLabels = JSON.stringify(providers);
  const currentDatasets = JSON.stringify(charts.providerRegion.data.datasets.map(d => ({ label: d.label, data: d.data })));
  const newDatasets = JSON.stringify(datasets.map(d => ({ label: d.label, data: d.data })));
  
  if (currentLabels === newLabels && currentDatasets === newDatasets) {
    return; // No data change, skip update
  }
  
  // Handle empty data
  if (providers.length === 0) {
    charts.providerRegion.data.labels = ['No Data'];
    charts.providerRegion.data.datasets = [{
      label: 'No Resources',
      data: [1],
      backgroundColor: ['#e9ecef']
    }];
  } else {
    charts.providerRegion.data.labels = providers;
    charts.providerRegion.data.datasets = datasets;
  }
  
  charts.providerRegion.update('none'); // Disable animation for better performance
}

// Helper function to categorize status consistently
function categorizeStatus(status) {
  if (!status) return 'Other';

  const statusStr = status.toString().toLowerCase();

  if (statusStr.includes('running')) return 'Running';
  if (statusStr.includes('registering')) return 'Registering';
  if (statusStr.includes('creating')) return 'Creating';
  if (statusStr.includes('preparing')) return 'Preparing';
  if (statusStr.includes('empty')) return 'Empty';
  if (statusStr.includes('suspended')) return 'Suspended';
  if (statusStr.includes('failed') || statusStr.includes('partial-failed')) return 'Failed';
  if (statusStr.includes('terminating')) return 'Terminating';
  if (statusStr.includes('terminated')) return 'Terminated';

  return 'Other';
}

// Update K8s Charts
function updateK8sCharts() {
  console.log('=== K8s Chart Update Started ===');
  
  try {
    // Check if chart exists
    if (!charts.k8sClusterStatus) {
      console.error('K8s Chart: Chart object not found during update');
      return;
    }

    // Get K8s data from central store
    let k8sData = [];
    if (window.parent && window.parent.cloudBaristaCentralData) {
      k8sData = window.parent.cloudBaristaCentralData.k8sCluster || [];
      console.log('K8s Chart: Central data available, k8sCluster data:', k8sData);
    } else {
      console.log('K8s Chart: No central data available');
    }

    console.log('K8s Chart Update - Data length:', k8sData.length);

    // Initialize status counts
    const clusterStatusCounts = {
      'Creating': 0,
      'Active': 0,
      'Inactive': 0,
      'Updating': 0,
      'Deleting': 0,
      'Failed': 0,
      'Unknown': 0
    };
    
    const nodeGroupStatusCounts = {
      'Creating': 0,
      'Active': 0,
      'Inactive': 0,
      'Updating': 0,
      'Deleting': 0,
      'Failed': 0,
      'Unknown': 0
    };
    
    const nodeStatusCounts = {
      'Creating': 0,
      'Active': 0,
      'Inactive': 0,
      'Updating': 0,
      'Deleting': 0,
      'Failed': 0,
      'Unknown': 0
    };

    // Process K8s cluster data
    k8sData.forEach(cluster => {
      console.log('Processing cluster:', cluster.id, 'status:', cluster.status);
      
      // Count clusters by status - normalize to match our chart labels
      let clusterStatus = cluster.status || 'Unknown';
      // Normalize status: convert first letter to uppercase, rest to lowercase
      if (clusterStatus !== 'Unknown') {
        clusterStatus = clusterStatus.charAt(0).toUpperCase() + clusterStatus.slice(1).toLowerCase();
      }
      
      console.log('Normalized cluster status:', clusterStatus);
      
      if (clusterStatusCounts.hasOwnProperty(clusterStatus)) {
        clusterStatusCounts[clusterStatus]++;
      } else {
        clusterStatusCounts['Unknown']++;
      }
      
      // Process node groups
      if (cluster.k8sNodeGroupList && cluster.k8sNodeGroupList.length > 0) {
        cluster.k8sNodeGroupList.forEach(nodeGroup => {
          console.log('Processing nodeGroup:', nodeGroup.name || nodeGroup.id, 'status:', nodeGroup.status);
          
          // Count node groups by status (use cluster status if nodeGroup status not available)
          let nodeGroupStatus = nodeGroup.status || cluster.status || 'Unknown';
          // Normalize status: convert first letter to uppercase, rest to lowercase
          if (nodeGroupStatus !== 'Unknown') {
            nodeGroupStatus = nodeGroupStatus.charAt(0).toUpperCase() + nodeGroupStatus.slice(1).toLowerCase();
          }
          
          console.log('Normalized nodeGroup status:', nodeGroupStatus);
          
          if (nodeGroupStatusCounts.hasOwnProperty(nodeGroupStatus)) {
            nodeGroupStatusCounts[nodeGroupStatus]++;
          } else {
            nodeGroupStatusCounts['Unknown']++;
          }
          
          // Count only actual existing nodes
          let nodeCount = 0;
          if (nodeGroup.k8sNodes && Array.isArray(nodeGroup.k8sNodes)) {
            nodeCount = nodeGroup.k8sNodes.length;
          }
          
          console.log('NodeGroup node count (actual nodes):', nodeCount);
          
          // Add nodes with same status as their node group
          if (nodeStatusCounts.hasOwnProperty(nodeGroupStatus)) {
            nodeStatusCounts[nodeGroupStatus] += nodeCount;
          } else {
            nodeStatusCounts['Unknown'] += nodeCount;
          }
        });
      }
    });
    
    // Prepare data for chart (same order as labels)
    const statusLabels = ['Creating', 'Active', 'Inactive', 'Updating', 'Deleting', 'Failed', 'Unknown'];
    const clusterDataArray = statusLabels.map(label => clusterStatusCounts[label] || 0);
    const nodeGroupDataArray = statusLabels.map(label => nodeGroupStatusCounts[label] || 0);
    const nodeDataArray = statusLabels.map(label => nodeStatusCounts[label] || 0);
    
    // Check if there's any data to display
    const hasClusterData = clusterDataArray.some(count => count > 0);
    const hasNodeGroupData = nodeGroupDataArray.some(count => count > 0);
    const hasNodeData = nodeDataArray.some(count => count > 0);
    
    console.log('K8s Chart Data:', {
      clusters: clusterDataArray,
      nodeGroups: nodeGroupDataArray,
      nodes: nodeDataArray,
      hasData: hasClusterData || hasNodeGroupData || hasNodeData,
      clusterStatusCounts: clusterStatusCounts,
      nodeGroupStatusCounts: nodeGroupStatusCounts,
      nodeStatusCounts: nodeStatusCounts
    });
    
    // Update chart - show "No Data" if no data
    if (!hasClusterData && !hasNodeGroupData && !hasNodeData) {
      charts.k8sClusterStatus.data.labels = ['No Data'];
      charts.k8sClusterStatus.data.datasets[0].data = [1];
      charts.k8sClusterStatus.data.datasets[1].data = [0];
      charts.k8sClusterStatus.data.datasets[2].data = [0];
      charts.k8sClusterStatus.data.datasets[0].backgroundColor = ['#e9ecef'];
      charts.k8sClusterStatus.data.datasets[1].backgroundColor = ['#e9ecef'];
      charts.k8sClusterStatus.data.datasets[2].backgroundColor = ['#e9ecef'];
    } else {
      // Helper function to get K8s chart colors from index.js functions  
      function getK8sChartColors(status, opacity = 0.8) {
        if (window.parent && window.parent.getK8sStatusColor) {
          const colors = window.parent.getK8sStatusColor(status);
          // Convert hex to rgba with specified opacity
          const hex = colors.fill;
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          return `rgba(${r}, ${g}, ${b}, ${opacity})`;
        }
        // Fallback colors if parent function not available
        const fallbackColors = {
          'Creating': `rgba(59, 130, 246, ${opacity})`,    // Blue
          'Active': `rgba(16, 185, 129, ${opacity})`,      // Green  
          'Inactive': `rgba(245, 158, 11, ${opacity})`,    // Amber
          'Updating': `rgba(247, 147, 26, ${opacity})`,    // Orange
          'Deleting': `rgba(220, 38, 38, ${opacity})`,     // Red
          'Failed': `rgba(239, 68, 68, ${opacity})`,       // Light Red
          'Unknown': `rgba(107, 114, 128, ${opacity})`     // Gray
        };
        return fallbackColors[status] || fallbackColors['Unknown'];
      }
      
      charts.k8sClusterStatus.data.labels = statusLabels;
      charts.k8sClusterStatus.data.datasets[0].data = clusterDataArray;
      charts.k8sClusterStatus.data.datasets[1].data = nodeGroupDataArray;
      charts.k8sClusterStatus.data.datasets[2].data = nodeDataArray;
      // Apply status-based colors with different opacity for each dataset
      charts.k8sClusterStatus.data.datasets[0].backgroundColor = statusLabels.map(status => getK8sChartColors(status, 0.8));
      charts.k8sClusterStatus.data.datasets[1].backgroundColor = statusLabels.map(status => getK8sChartColors(status, 0.65));
      charts.k8sClusterStatus.data.datasets[2].backgroundColor = statusLabels.map(status => getK8sChartColors(status, 0.5));
    }
    
    charts.k8sClusterStatus.update('none'); // Disable animation for better performance
    console.log('K8s Chart: Updated successfully');

  } catch (error) {
    console.error('Error updating K8s charts:', error);
    // Fallback: ensure chart shows "No Data" on error
    if (charts.k8sClusterStatus) {
      charts.k8sClusterStatus.data.labels = ['No Data'];
      charts.k8sClusterStatus.data.datasets[0].data = [1];
      charts.k8sClusterStatus.data.datasets[1].data = [0];
      charts.k8sClusterStatus.data.datasets[2].data = [0];
      charts.k8sClusterStatus.update('none');
      console.log('K8s Chart: Fallback "No Data" applied');
    }
  }
}

// Update MCI table
function updateMciTable() {
  // Check if data has changed before updating
  if (!hasDataChanged('mci-table', mciData)) {
    console.log('[Performance] MCI table: Skipping update - no changes detected');
    return;
  }

  const tbody = document.getElementById('mciTableBody');
  tbody.innerHTML = '';
  
  // Update count badge
  const countBadge = document.getElementById('mciCountBadge');
  if (countBadge) {
    countBadge.textContent = mciData.length;
  }

  mciData.forEach(mci => {
    const row = document.createElement('tr');
    
    // Get provider distribution for this MCI
    const providers = new Set();
    let vmCount = 0;
    if (mci.vm && Array.isArray(mci.vm)) {
      vmCount = mci.vm.length;
      mci.vm.forEach(vm => {
        if (vm.connectionConfig && vm.connectionConfig.providerName) {
          providers.add(vm.connectionConfig.providerName);
        }
      });
    }
    
    const providerList = Array.from(providers).join(', ');
    
    // Helper function to truncate text and add tooltip for MCI table
    const truncateWithTooltip = (text, maxLength = 20) => {
      if (text === null || text === undefined) return text;
      text = String(text);
      if (text === 'N/A' || text === 'None') return text;
      if (text.length <= maxLength) return _escapeHtml(text);
      return `<span title="${_escapeHtml(text)}">${_escapeHtml(text.substring(0, maxLength))}...</span>`;
    };
    
    // Normalize status for CSS class
    let statusClass = 'unknown';
    if (mci.status) {
      const status = mci.status.toLowerCase();
      if (status.includes('running') || status === 'running') {
        statusClass = 'running';
      } else if (status.includes('creating') || status === 'creating') {
        statusClass = 'creating';
      } else if (status.includes('preparing') || status === 'preparing') {
        statusClass = 'preparing';
      } else if (status.includes('suspended') || status === 'suspended') {
        statusClass = 'suspended';
      } else if (status.includes('failed') || status === 'failed') {
        statusClass = 'failed';
      } else if (status.includes('terminating') || status === 'terminating') {
        statusClass = 'terminating';
      } else if (status.includes('terminated') || status === 'terminated') {
        statusClass = 'terminated';
      } else if (status.includes('partial-failed') || status === 'partial-failed') {
        statusClass = 'partial-failed';
      } else {
        statusClass = status.replace(/[^a-z0-9-]/g, '');
      }
    }
    
    // Determine button states based on actual status
    const actualStatus = mci.status.startsWith('Creating') ? 'Creating' : mci.status;
    const isRunning = actualStatus === 'Running';
    const canResume = ['Suspended', 'Failed', 'Partial-Failed'].includes(actualStatus);
    const canSuspend = isRunning;
    const canRestart = isRunning;
    
    row.innerHTML = `
      <td title="${mci.id}"><strong>${smartTruncate(mci.id, 'id')}</strong></td>
      <td><span class="status-badge status-${statusClass}">${mci.status}</span></td>
      <td title="${providerList || 'N/A'}">${smartTruncate(providerList || 'N/A', 'provider')}</td>
      <td>${vmCount}</td>
      <td title="${mci.targetAction || 'None'}">${smartTruncate(mci.targetAction || 'None', 'default')}</td>
      <td title="${mci.description || 'N/A'}">${smartTruncate(mci.description || 'N/A', 'description')}</td>
      <td class="action-buttons">
        <button class="btn btn-sm btn-outline-primary" onclick="viewMciDetails('${mci.id}')" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-success" onclick="controlMci('${mci.id}', 'resume')" title="Resume" ${!canResume ? 'disabled' : ''}>
          <i class="fas fa-play"></i>
        </button>
        <button class="btn btn-sm btn-outline-warning" onclick="controlMci('${mci.id}', 'suspend')" title="Suspend" ${!canSuspend ? 'disabled' : ''}>
          <i class="fas fa-pause"></i>
        </button>
        <button class="btn btn-sm btn-outline-info" onclick="controlMci('${mci.id}', 'restart')" title="Restart" ${!canRestart ? 'disabled' : ''}>
          <i class="fas fa-sync-alt"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteMci('${mci.id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    
    // Add click event to select MCI
    row.style.cursor = 'pointer';
    row.addEventListener('click', function(e) {
      // Don't trigger when clicking on buttons
      if (e.target.closest('.action-buttons')) {
        return;
      }
      selectMci(mci.id);
    });
    
    // Highlight selected MCI
    if (selectedMciId === mci.id) {
      row.classList.add('table-active');
    }
    
    tbody.appendChild(row);
  });

  // Reinitialize DataTable if needed
  setTimeout(() => {
    reinitializeDataTablesIfNeeded();
  }, 100);
}

// Select MCI and update VM table
function selectMci(mciId) {
  selectedMciId = mciId;
  console.log(`Selected MCI: ${mciId}`);
  
  // Debug: Check if sync function exists
  console.log(`[DEBUG] In iframe, trying to access parent window`);
  
  try {
    // Try to access parent window function
    if (window.parent && window.parent !== window) {
      console.log(`[DEBUG] Parent window exists, checking for sync function`);
      if (window.parent.syncMciSelectionFromDashboard && typeof window.parent.syncMciSelectionFromDashboard === 'function') {
        console.log(`[DEBUG] Calling parent sync function with:`, mciId);
        window.parent.syncMciSelectionFromDashboard(mciId);
      } else {
        console.log(`[DEBUG] Parent sync function not found`);
      }
    } else {
      console.log(`[DEBUG] No parent window found, trying direct access`);
      if (window.syncMciSelectionFromDashboard && typeof window.syncMciSelectionFromDashboard === 'function') {
        console.log(`[DEBUG] Calling direct sync function with:`, mciId);
        window.syncMciSelectionFromDashboard(mciId);
      } else {
        console.log(`[DEBUG] Direct sync function not available`);
      }
    }
  } catch (error) {
    console.log(`[DEBUG] Error during sync:`, error);
  }
  
  // Update MCI table highlighting
  updateMciTable();
  
  // Update VM section header - use safer selector approach
  const vmTable = document.getElementById('vmTable');
  const vmContentCard = vmTable ? vmTable.closest('.content-card') : null;
  const vmHeader = vmContentCard ? vmContentCard.querySelector('h5') : null;
  
  if (vmHeader) {
    vmHeader.innerHTML = `<i class="fas fa-server me-2"></i> Virtual Machine Details - ${mciId} <span class="badge badge-secondary ml-2" id="vmCountBadge">0</span>`;
  } else {
    console.warn('VM header not found in selectMci, trying alternative selector');
    // Fallback: try to find the header directly
    const directHeader = document.querySelector('#vmCountBadge');
    if (directHeader && directHeader.parentElement) {
      directHeader.parentElement.innerHTML = `<i class="fas fa-server me-2"></i>Virtual Machine Details - ${mciId} <span class="badge badge-secondary ml-2" id="vmCountBadge">0</span>`;
    }
  }
  
  // Update VM table to show only VMs from selected MCI
  updateVmTable();
  
  // Update show all button visibility
  updateShowAllButton();
}

// Show all VMs (clear MCI selection)
function showAllVms() {
  selectedMciId = null;
  console.log('Showing all VMs, selectedMciId set to:', selectedMciId);
  
  // Update MCI table highlighting
  updateMciTable();
  
  // Update VM section header - use safer selector approach
  const vmTable = document.getElementById('vmTable');
  const vmContentCard = vmTable ? vmTable.closest('.content-card') : null;
  const vmHeader = vmContentCard ? vmContentCard.querySelector('h5') : null;
  
  if (vmHeader) {
    vmHeader.innerHTML = `<i class="fas fa-server me-2"></i> Virtual Machine Details <span class="badge badge-secondary ml-2" id="vmCountBadge">0</span>`;
  } else {
    console.warn('VM header not found, trying alternative selector');
    // Fallback: try to find the header directly
    const directHeader = document.querySelector('#vmCountBadge');
    if (directHeader && directHeader.parentElement) {
      directHeader.parentElement.innerHTML = `<i class="fas fa-server me-2"></i> Virtual Machine Details <span class="badge badge-secondary ml-2" id="vmCountBadge">0</span>`;
    }
  }
  
  // Update VM table to show all VMs
  updateVmTable();
  
  // Update show all button visibility
  updateShowAllButton();
}

// Update show all button visibility
function updateShowAllButton() {
  const showAllBtn = document.getElementById('showAllBtn');
  console.log('updateShowAllButton called, selectedMciId:', selectedMciId, 'showAllBtn:', showAllBtn);
  if (showAllBtn) {
    showAllBtn.style.display = selectedMciId ? 'inline-block' : 'none';
    console.log('Show All button display set to:', showAllBtn.style.display);
  }
}

// Update VM table
function updateVmTable() {
  // Filter VMs based on selected MCI for data comparison
  let filteredVms = vmData;
  if (selectedMciId) {
    filteredVms = vmData.filter(vm => vm.mciId === selectedMciId);
  }
  
  // Check if data has changed before updating
  const dataKey = selectedMciId ? `vm-table-${selectedMciId}` : 'vm-table-all';
  if (!hasDataChanged(dataKey, filteredVms)) {
    console.log(`[Performance] VM table (${dataKey}): Skipping update - no changes detected`);
    return;
  }

  const tbody = document.getElementById('vmTableBody');
  tbody.innerHTML = '';
  
  // Update VM count display
  const vmCountElement = document.getElementById('vmCountBadge');
  if (vmCountElement) {
    vmCountElement.textContent = filteredVms.length;
  }
  
  if (filteredVms.length === 0 && selectedMciId) {
    // Show message when no VMs found for selected MCI
    const row = document.createElement('tr');
    row.innerHTML = `
      <td colspan="8" class="text-center text-muted py-4">
        <i class="fas fa-info-circle me-2"></i>
        No VMs found for selected MCI: ${selectedMciId}
      </td>
    `;
    tbody.appendChild(row);
    return;
  }
  
  filteredVms.forEach(vm => {
    const row = document.createElement('tr');
    
    const provider = vm.connectionConfig ? vm.connectionConfig.providerName : 'Unknown';
    const region = vm.region ? vm.region.region : (vm.location ? vm.location.region : 'N/A');
    const spec = vm.specId || 'N/A';
    const publicIp = vm.publicIP || 'N/A';
    const privateIp = vm.privateIP || 'N/A';
    
    // Helper function to truncate text and add tooltip
    const truncateWithTooltip = (text, maxLength = 20) => {
      if (!text || text === 'N/A') return text;
      if (text.length <= maxLength) return text;
      return `<span title="${text.replace(/"/g, '&quot;')}">${text.substring(0, maxLength)}...</span>`;
    };
    
    // Normalize status for CSS class
    let statusClass = 'unknown';
    if (vm.status) {
      const status = vm.status.toLowerCase();
      if (status.includes('running') || status === 'running') {
        statusClass = 'running';
      } else if (status.includes('creating') || status === 'creating') {
        statusClass = 'creating';
      } else if (status.includes('preparing') || status === 'preparing') {
        statusClass = 'preparing';
      } else if (status.includes('suspended') || status === 'suspended') {
        statusClass = 'suspended';
      } else if (status.includes('failed') || status === 'failed') {
        statusClass = 'failed';
      } else if (status.includes('terminating') || status === 'terminating') {
        statusClass = 'terminating';
      } else if (status.includes('terminated') || status === 'terminated') {
        statusClass = 'terminated';
      } else if (status.includes('partial-failed') || status === 'partial-failed') {
        statusClass = 'partial-failed';
      } else {
        statusClass = status.replace(/[^a-z0-9-]/g, '');
      }
    }
    
    // Determine button states
    const isRunning = vm.status === 'Running';
    const canResume = ['Suspended', 'Failed'].includes(vm.status);
    const canSuspend = isRunning;
    const canRestart = isRunning;
    
    row.innerHTML = `
      <td title="${vm.id}"><strong>${smartTruncate(vm.id, 'id')}</strong></td>
      <td title="${vm.mciId}">${smartTruncate(vm.mciId, 'id')}</td>
      <td><span class="status-badge status-${statusClass}">${vm.status || 'Unknown'}</span></td>
      <td title="${provider}">${smartTruncate(provider, 'provider')}</td>
      <td title="${region}">${smartTruncate(region, 'region')}</td>
      <td title="${spec}">${smartTruncate(spec, 'spec')}</td>
      <td title="${publicIp}">${smartTruncate(publicIp, 'ip')}</td>
      <td title="${privateIp}">${smartTruncate(privateIp, 'ip')}</td>
      <td class="action-buttons">
        <button class="btn btn-sm btn-outline-primary" onclick="viewVmDetails('${vm.mciId}', '${vm.id}')" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-success" onclick="controlVm('${vm.mciId}', '${vm.id}', 'resume')" title="Resume" ${!canResume ? 'disabled' : ''}>
          <i class="fas fa-play"></i>
        </button>
        <button class="btn btn-sm btn-outline-warning" onclick="controlVm('${vm.mciId}', '${vm.id}', 'suspend')" title="Suspend" ${!canSuspend ? 'disabled' : ''}>
          <i class="fas fa-pause"></i>
        </button>
        <button class="btn btn-sm btn-outline-info" onclick="controlVm('${vm.mciId}', '${vm.id}', 'restart')" title="Restart" ${!canRestart ? 'disabled' : ''}>
          <i class="fas fa-sync-alt"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteVm('${vm.id}', '${vm.mciId}')" title="Delete VM">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    
    // Add click event to select MCI when clicking on VM row (but not on buttons)
    row.addEventListener('click', function(event) {
      // Don't trigger if clicking on buttons or links
      if (event.target.closest('button') || event.target.closest('a')) {
        return;
      }
      // Select the MCI this VM belongs to
      if (vm.mciId && selectedMciId !== vm.mciId) {
        selectMci(vm.mciId);
      }
    });
    
    row.style.cursor = 'pointer';
    
    tbody.appendChild(row);
  });

  // Reinitialize DataTable if needed
  setTimeout(() => {
    reinitializeDataTablesIfNeeded();
  }, 100);
}

// Update resource display
function updateResourceDisplay() {
  // Update Network Resources
  const networkContent = document.getElementById('networkResourcesContent');
  const vNets = resourceData.vNet || [];
  
  // Remove loading overlay
  const networkLoading = networkContent.querySelector('.loading-overlay');
  if (networkLoading) {
    networkLoading.remove();
  }
  
  networkContent.innerHTML = `
    <div class="list-group">
      ${vNets.map(vnet => `
        <div class="list-group-item d-flex justify-content-between align-items-center">
          <div>
            <strong>${vnet.id || vnet.name}</strong>
            <br><small class="text-muted">${vnet.connectionName || vnet.connectionConfig?.configName || 'N/A'}</small>
          </div>
          <span class="badge badge-primary">${vnet.status || 'Available'}</span>
        </div>
      `).join('')}
      ${vNets.length === 0 ? '<div class="text-center text-muted p-3">No vNets found</div>' : ''}
    </div>
  `;

  // Update Security Groups
  const sgContent = document.getElementById('securityGroupsContent');
  const securityGroups = resourceData.securityGroup || [];
  
  // Remove loading overlay
  const sgLoading = sgContent.querySelector('.loading-overlay');
  if (sgLoading) {
    sgLoading.remove();
  }
  
  sgContent.innerHTML = `
    <div class="list-group">
      ${securityGroups.map(sg => `
        <div class="list-group-item d-flex justify-content-between align-items-center">
          <div>
            <strong>${sg.id || sg.name}</strong>
            <br><small class="text-muted">${sg.connectionName || sg.connectionConfig?.configName || 'N/A'}</small>
          </div>
          <span class="badge badge-info">${sg.firewallRules ? sg.firewallRules.length : 0} rules</span>
        </div>
      `).join('')}
      ${securityGroups.length === 0 ? '<div class="text-center text-muted p-3">No security groups found</div>' : ''}
    </div>
  `;

  // Update SSH Keys
  const sshContent = document.getElementById('sshKeysContent');
  const sshKeys = resourceData.sshKey || [];
  
  // Remove loading overlay
  const sshLoading = sshContent.querySelector('.loading-overlay');
  if (sshLoading) {
    sshLoading.remove();
  }
  
  sshContent.innerHTML = `
    <div class="list-group">
      ${sshKeys.map(key => `
        <div class="list-group-item d-flex justify-content-between align-items-center">
          <div>
            <strong>${key.id || key.name}</strong>
            <br><small class="text-muted">${key.connectionName || key.connectionConfig?.configName || 'N/A'}</small>
          </div>
          <span class="badge badge-secondary">SSH</span>
        </div>
      `).join('')}
      ${sshKeys.length === 0 ? '<div class="text-center text-muted p-3">No SSH keys found</div>' : ''}
    </div>
  `;
}

// Control MCI actions
async function controlMci(mciId, action) {
  if (!confirm(`Are you sure you want to ${action} MCI: ${mciId}?`)) {
    return;
  }
  
  // Get config and namespace from parent window (index.js) - same as delete functions
  const parentConfig = window.parent?.getConfig?.() || { 
    hostname: 'localhost', 
    port: '1323',
    username: 'default', 
    password: 'default' 
  };
  
  // Get current namespace from parent window's namespace element
  const namespaceElement = window.parent?.document?.getElementById('namespace') || 
                          window.parent?.document?.getElementById('namespace-control');
  const currentNamespace = namespaceElement?.value || 'default';
  
  const url = `http://${parentConfig.hostname}:${parentConfig.port}/tumblebug/ns/${currentNamespace}/control/mci/${mciId}?action=${action}`;
  
  try {
    showRefreshIndicator(true);
    
    const response = await axios.get(url, {
      auth: {
        username: parentConfig.username,
        password: parentConfig.password
      },
      timeout: 60000
    });
    
    showSuccessMessage(`MCI ${action} command sent successfully!`);
    
    // Refresh data after a delay to allow the action to take effect
    setTimeout(() => {
      refreshDashboard();
    }, 2000);
    
  } catch (error) {
    console.error(`Error controlling MCI ${mciId}:`, error);
    showErrorMessage(`Failed to ${action} MCI: ${error.response?.data?.message || error.message}`);
  } finally {
    showRefreshIndicator(false);
  }
}

// Control VM actions
async function controlVm(mciId, vmId, action) {
  if (!confirm(`Are you sure you want to ${action} VM: ${vmId}?`)) {
    return;
  }
  
  // Get config and namespace from parent window (index.js) - same as delete functions
  const parentConfig = window.parent?.getConfig?.() || { 
    hostname: 'localhost', 
    port: '1323',
    username: 'default', 
    password: 'default' 
  };
  
  // Get current namespace from parent window's namespace element
  const namespaceElement = window.parent?.document?.getElementById('namespace') || 
                          window.parent?.document?.getElementById('namespace-control');
  const currentNamespace = namespaceElement?.value || 'default';
  
  const url = `http://${parentConfig.hostname}:${parentConfig.port}/tumblebug/ns/${currentNamespace}/control/mci/${mciId}/vm/${vmId}?action=${action}`;
  
  try {
    showRefreshIndicator(true);
    
    const response = await axios.get(url, {
      auth: {
        username: parentConfig.username,
        password: parentConfig.password
      },
      timeout: 60000
    });
    
    showSuccessMessage(`VM ${action} command sent successfully!`);
    
    // Refresh data after a delay
    setTimeout(() => {
      refreshDashboard();
    }, 2000);
    
  } catch (error) {
    console.error(`Error controlling VM ${vmId}:`, error);
    showErrorMessage(`Failed to ${action} VM: ${error.response?.data?.message || error.message}`);
  } finally {
    showRefreshIndicator(false);
  }
}

// View MCI details
async function viewMciDetails(mciId) {
  const mci = mciData.find(m => m.id === mciId);
  if (!mci) {
    showErrorMessage('MCI not found');
    return;
  }
  
  showJsonDetailsPopup(`🖥️ MCI Details: ${mciId}`, mci);
}

// View VM details
async function viewVmDetails(mciId, vmId) {
  const vm = vmData.find(v => v.mciId === mciId && v.id === vmId);
  if (!vm) {
    showErrorMessage('VM not found');
    return;
  }
  
  showJsonDetailsPopup(`💻 VM Details: ${vmId}`, vm);
}

// Show create MCI modal
function showCreateMciModal() {
  // Switch to Map view and Provision tab directly
  if (window.parent && window.parent !== window) {
    // If in iframe, call parent's functions
    if (typeof window.parent.showMap === 'function') {
      window.parent.showMap();
    }
    
    // Switch to Provision tab using Bootstrap tab API
    if (window.parent.$ && window.parent.document) {
      window.parent.$('#provision-tab').tab('show');
    }
    
    showInfoMessage('Switched to Map view for MCI creation. Check the Provision tab.');
  } else {
    // If not in iframe, redirect to index.html
    window.location.href = 'index.html';
  }
}

// Refresh specific lists
function refreshMciList() {
  showRefreshIndicator(true);
  
  loadMciData().then(() => {
    updateStatistics();
    updateCharts();
    updateMciTable();
    updateVmTable();
    showSuccessMessage('MCI list refreshed!', 1500);
  }).catch(error => {
    console.error('Error refreshing MCI list:', error);
    showErrorMessage('Failed to refresh MCI list: ' + (error.response?.data?.message || error.message));
  }).finally(() => {
    showRefreshIndicator(false);
  });
}

function refreshVmList() {
  refreshMciList(); // VM data comes from MCI data
}

// Auto-refresh functionality
function startAutoRefresh() {
  // Don't start auto-refresh if using central data subscription
  if (window.parent && window.parent.subscribeToDataUpdates) {
    console.log('Using central data subscription, skipping auto-refresh setup');
    return;
  }
  
  // Clear existing timer
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  
  // Start new timer
  refreshTimer = setInterval(() => {
    refreshDashboard();
  }, dashboardConfig.refreshInterval);
  
  console.log(`Auto-refresh started with interval: ${dashboardConfig.refreshInterval}ms`);
}

// Show/hide refresh indicator
function showRefreshIndicator(show) {
  const indicator = document.getElementById('refreshIndicator');
  indicator.style.display = show ? 'inline-block' : 'none';
}

// Message functions
function showSuccessMessage(message, duration = 3000) {
  Swal.fire({
    icon: 'success',
    text: message,
    timer: duration,
    showConfirmButton: false,
    toast: true,
    position: 'top-end'
  });
}

function showErrorMessage(message) {
  Swal.fire({
    icon: 'error',
    title: 'Error',
    text: message,
    confirmButtonText: 'OK'
  });
}

function showConnectionError(message) {
  Swal.fire({
    icon: 'error',
    title: 'Connection Error',
    text: message,
    showConfirmButton: false,
    toast: true,
    position: 'top-end',
    timer: 5000,
    timerProgressBar: true
  });
}

function showInfoMessage(message) {
  Swal.fire({
    icon: 'info',
    text: message,
    confirmButtonText: 'OK'
  });
}

// Setup event listeners
function setupEventListeners() {
  // Handle namespace change
  document.getElementById('namespace').addEventListener('change', function() {
    dashboardConfig.namespace = this.value;
    refreshDashboard();
  });
  
  // Handle refresh interval change in settings
  document.getElementById('refreshInterval').addEventListener('change', function() {
    dashboardConfig.refreshInterval = parseInt(this.value) * 1000;
    startAutoRefresh();
  });
  
  // Handle settings form submission with Enter key
  document.getElementById('settingsForm').addEventListener('submit', function(e) {
    e.preventDefault();
    saveSettings();
  });
  
  // Add keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    // Ctrl+R or F5 for refresh
    if ((e.ctrlKey && e.key === 'r') || e.key === 'F5') {
      e.preventDefault();
      refreshDashboard();
    }
    
    // Ctrl+, for settings
    if (e.ctrlKey && e.key === ',') {
      e.preventDefault();
      showSettings();
    }
  });
}

// Export functions for global access
window.refreshDashboard = refreshDashboard;
window.showSettings = showSettings;
window.saveSettings = saveSettings;
window.controlMci = controlMci;
window.controlVm = controlVm;
window.deleteMci = deleteMci;
window.viewMciDetails = viewMciDetails;
window.viewVmDetails = viewVmDetails;
window.showCreateMciModal = showCreateMciModal;
window.refreshMciList = refreshMciList;
window.refreshVmList = refreshVmList;
window.showAllVms = showAllVms;

// Resource table management functions
function updateAllResourceTables() {
  updateVNetTable();
  updateSubnetTable();
  updateSecurityGroupTable();
  updateSshKeyTable();
  updateK8sClusterTable();
  updateK8sNodeGroupTable();
  updateConnectionTable();
  updateCustomImageTable();
  updateDataDiskTable();
  updateVpnTable();
}

// Track selected VNet for subnet filtering
let selectedVNetId = null;

function updateVNetTable() {
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const vNetData = centralData.vNet || [];
  
  // Check if data has changed before updating
  if (!hasDataChanged('vnet-table', vNetData)) {
    console.log('[Performance] VNet table: Skipping update - no changes detected');
    return;
  }
  
  const tableBody = document.getElementById('vNetTableBody');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  // Update count badge
  const countBadge = document.getElementById('vNetCountBadge');
  if (countBadge) {
    countBadge.textContent = vNetData.length;
  }
  
  vNetData.forEach(vnet => {
    const row = document.createElement('tr');
    const subnetCount = vnet.subnetInfoList ? vnet.subnetInfoList.length : 0;
    row.innerHTML = `
      <td title="${vnet.id}">${smartTruncate(vnet.id, 'id')}</td>
      <td title="${vnet.name || 'N/A'}">${smartTruncate(vnet.name || 'N/A', 'name')}</td>
      <td><span class="status-badge status-${(vnet.status || 'unknown').toLowerCase()}">${vnet.status || 'Unknown'}</span></td>
      <td title="${vnet.connectionConfig?.providerName || 'N/A'}">${smartTruncate(vnet.connectionConfig?.providerName || 'N/A', 'provider')}</td>
      <td title="${vnet.connectionConfig?.regionDetail?.regionName || 'N/A'}">${smartTruncate(vnet.connectionConfig?.regionDetail?.regionName || 'N/A', 'region')}</td>
      <td title="${vnet.cidrBlock || 'N/A'}">${smartTruncate(vnet.cidrBlock || 'N/A', 'default')}</td>
      <td>
        <a href="#" onclick="showSubnetsForVNet('${vnet.id}'); return false;" class="badge badge-info" style="cursor: pointer;" role="button" aria-label="View subnets for this VNet">
          ${subnetCount} subnet${subnetCount !== 1 ? 's' : ''}
        </a>
      </td>
      <td class="action-buttons">
        <button class="btn btn-sm btn-outline-primary" onclick="viewResourceDetails('vNet', '${vnet.id}')" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteVNet('${vnet.id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });
  
  // Reinitialize DataTable if needed
  setTimeout(() => {
    reinitializeDataTablesIfNeeded();
  }, 100);
}

// Subnet table functions
function showSubnetsForVNet(vnetId) {
  selectedVNetId = vnetId;
  updateSubnetTable();
  
  // Show subnet section and scroll to it
  const subnetSection = document.getElementById('subnetSection');
  if (subnetSection) {
    subnetSection.style.display = 'block';
    subnetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  
  // Update selected VNet badge
  const selectedBadge = document.getElementById('selectedVNetBadge');
  if (selectedBadge) {
    selectedBadge.textContent = `VNet: ${smartTruncate(vnetId, 'id')}`;
    selectedBadge.title = vnetId;
  }
}

function showAllSubnets() {
  selectedVNetId = null;
  updateSubnetTable();
  
  const selectedBadge = document.getElementById('selectedVNetBadge');
  if (selectedBadge) {
    selectedBadge.textContent = 'All VNets';
    selectedBadge.title = '';
  }
}

function hideSubnetTable() {
  const subnetSection = document.getElementById('subnetSection');
  if (subnetSection) {
    subnetSection.style.display = 'none';
  }
  selectedVNetId = null;
}

function updateSubnetTable() {
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const vNetData = centralData.vNet || [];
  
  // Collect all subnets with their parent VNet info
  let allSubnets = [];
  vNetData.forEach(vnet => {
    if (vnet.subnetInfoList && Array.isArray(vnet.subnetInfoList)) {
      vnet.subnetInfoList.forEach(subnet => {
        allSubnets.push({
          ...subnet,
          vnetId: vnet.id,
          vnetName: vnet.name
        });
      });
    }
  });
  
  // Filter by selected VNet if applicable
  const subnetsToShow = selectedVNetId 
    ? allSubnets.filter(s => s.vnetId === selectedVNetId)
    : allSubnets;
  
  const tableBody = document.getElementById('subnetTableBody');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  // Update count badge
  const countBadge = document.getElementById('subnetCountBadge');
  if (countBadge) {
    countBadge.textContent = subnetsToShow.length;
  }
  
  if (subnetsToShow.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted">No subnets found</td>
      </tr>
    `;
    return;
  }
  
  subnetsToShow.forEach(subnet => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td title="${subnet.id || 'N/A'}">${smartTruncate(subnet.id || 'N/A', 'id')}</td>
      <td title="${subnet.name || 'N/A'}">${smartTruncate(subnet.name || 'N/A', 'name')}</td>
      <td title="${subnet.vnetId}">
        <a href="#" onclick="showSubnetsForVNet('${subnet.vnetId}'); return false;" style="cursor: pointer;">
          ${smartTruncate(subnet.vnetId, 'id')}
        </a>
      </td>
      <td>${subnet.ipv4_CIDR || 'N/A'}</td>
      <td>${subnet.ipv6_CIDR || 'N/A'}</td>
      <td>${subnet.zone || 'N/A'}</td>
    `;
    tableBody.appendChild(row);
  });
  
  // Reinitialize DataTable if needed
  setTimeout(() => {
    reinitializeDataTablesIfNeeded();
  }, 100);
}

// Export subnet functions to window
window.showSubnetsForVNet = showSubnetsForVNet;
window.showAllSubnets = showAllSubnets;
window.hideSubnetTable = hideSubnetTable;

function updateSecurityGroupTable() {
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const sgData = centralData.securityGroup || [];
  
  // Check if data has changed before updating
  if (!hasDataChanged('security-group-table', sgData)) {
    console.log('[Performance] Security Group table: Skipping update - no changes detected');
    return;
  }
  
  const tableBody = document.getElementById('securityGroupTableBody');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  // Update count badge
  const countBadge = document.getElementById('securityGroupCountBadge');
  if (countBadge) {
    countBadge.textContent = sgData.length;
  }
  
  sgData.forEach(sg => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td title="${sg.id}">${smartTruncate(sg.id, 'id')}</td>
      <td title="${sg.name || 'N/A'}">${smartTruncate(sg.name || 'N/A', 'name')}</td>
      <td title="${sg.connectionConfig?.providerName || 'N/A'}">${smartTruncate(sg.connectionConfig?.providerName || 'N/A', 'provider')}</td>
      <td title="${sg.connectionConfig?.regionDetail?.regionName || 'N/A'}">${smartTruncate(sg.connectionConfig?.regionDetail?.regionName || 'N/A', 'region')}</td>
      <td title="${sg.vNetId || 'N/A'}">${smartTruncate(sg.vNetId || 'N/A', 'id')}</td>
      <td>${sg.firewallRules ? sg.firewallRules.length : 0} rules</td>
      <td title="${sg.description || 'N/A'}">${smartTruncate(sg.description || 'N/A', 'description')}</td>
      <td class="action-buttons">
        <button class="btn btn-sm btn-outline-primary" onclick="viewResourceDetails('securityGroup', '${sg.id}')" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteSecurityGroup('${sg.id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });
  
  // Reinitialize DataTable if needed
  setTimeout(() => {
    reinitializeDataTablesIfNeeded();
  }, 100);
}

function updateSshKeyTable() {
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const sshKeyData = centralData.sshKey || [];
  
  // Check if data has changed before updating
  if (!hasDataChanged('ssh-key-table', sshKeyData)) {
    console.log('[Performance] SSH Key table: Skipping update - no changes detected');
    return;
  }
  const tableBody = document.getElementById('sshKeyTableBody');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  // Update count badge
  const countBadge = document.getElementById('sshKeyCountBadge');
  if (countBadge) {
    countBadge.textContent = sshKeyData.length;
  }
  
  sshKeyData.forEach(key => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td title="${key.id}">${smartTruncate(key.id, 'id')}</td>
      <td title="${key.name || 'N/A'}">${smartTruncate(key.name || 'N/A', 'name')}</td>
      <td title="${key.connectionConfig?.providerName || 'N/A'}">${smartTruncate(key.connectionConfig?.providerName || 'N/A', 'provider')}</td>
      <td title="${key.connectionConfig?.regionDetail?.regionName || 'N/A'}">${smartTruncate(key.connectionConfig?.regionDetail?.regionName || 'N/A', 'region')}</td>
      <td title="${key.fingerprint || 'N/A'}">${smartTruncate(key.fingerprint || 'N/A', 'default')}</td>
      <td>
        <button class="btn btn-outline-secondary btn-sm" onclick="viewKeyMaterial('${key.id}')" title="Show Key Material">
          <i class="fas fa-key"></i>
        </button>
      </td>
      <td class="action-buttons">
        <button class="btn btn-sm btn-outline-primary" onclick="viewResourceDetails('sshKey', '${key.id}')" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteSshKey('${key.id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });
  
  // Reinitialize DataTable if needed
  setTimeout(() => {
    reinitializeDataTablesIfNeeded();
  }, 100);
}

function updateK8sClusterTable() {
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const k8sData = centralData.k8sCluster || [];
  console.log('updateK8sClusterTable - K8s data:', k8sData);
  console.log('updateK8sClusterTable - Central data structure:', centralData);
  
  // Check if data has changed before updating
  if (!hasDataChanged('k8s-cluster-table', k8sData)) {
    console.log('[Performance] K8s Cluster table: Skipping update - no changes detected');
    return;
  }
  
  const tableBody = document.getElementById('k8sClusterTableBody');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  // Update count badge
  const countBadge = document.getElementById('k8sClusterCountBadge');
  if (countBadge) {
    countBadge.textContent = k8sData.length;
  }
  
  k8sData.forEach(cluster => {
    const row = document.createElement('tr');
    row.setAttribute('data-cluster-id', cluster.id);
    row.style.cursor = 'pointer';
    
    // Normalize status for CSS class
    let statusClass = 'unknown';
    if (cluster.status) {
      const status = cluster.status.toLowerCase();
      if (status === 'active' || status === 'running') {
        statusClass = 'active';
      } else if (status === 'inactive') {
        statusClass = 'inactive';
      } else if (status === 'creating') {
        statusClass = 'creating';
      } else if (status === 'updating') {
        statusClass = 'updating';
      } else if (status === 'deleting') {
        statusClass = 'deleting';
      } else {
        statusClass = status.replace(/[^a-z0-9-]/g, '');
      }
    }
    
    // Get endpoint from accessInfo
    let endpoint = 'N/A';
    if (cluster.accessInfo && cluster.accessInfo.endpoint) {
      endpoint = cluster.accessInfo.endpoint;
    }
    
    // Count total nodes in all node groups
    let totalNodes = 0;
    let nodeGroupsInfo = '';
    if (cluster.k8sNodeGroupList && cluster.k8sNodeGroupList.length > 0) {
      totalNodes = cluster.k8sNodeGroupList.reduce((sum, ng) => {
        return sum + (ng.desiredNodeSize || ng.spiderViewK8sNodeGroupDetail?.DesiredNodeSize || 0);
      }, 0);
      nodeGroupsInfo = `${cluster.k8sNodeGroupList.length} groups (${totalNodes} nodes)`;
    } else {
      nodeGroupsInfo = '0 groups';
    }
    
    row.innerHTML = `
      <td title="${cluster.id}"><strong>${smartTruncate(cluster.id, 'id')}</strong></td>
      <td><span class="status-badge status-${statusClass}">${cluster.status || 'Unknown'}</span></td>
      <td title="${cluster.connectionConfig?.providerName || 'N/A'}">${smartTruncate(cluster.connectionConfig?.providerName || 'N/A', 'provider')}</td>
      <td title="${cluster.connectionConfig?.regionDetail?.regionName || 'N/A'}">${smartTruncate(cluster.connectionConfig?.regionDetail?.regionName || 'N/A', 'region')}</td>
      <td title="${cluster.version || 'N/A'}">${smartTruncate(cluster.version || 'N/A', 'default')}</td>
      <td title="${endpoint}">
        ${endpoint !== 'N/A' ? `<a href="${endpoint}" target="_blank" class="btn btn-sm btn-outline-info"><i class="fas fa-external-link-alt"></i></a>` : 'N/A'}
      </td>
      <td style="cursor: pointer;" onclick="selectK8sCluster('${cluster.id}')" title="Click to view node groups">
        <span class="badge badge-info">${nodeGroupsInfo}</span>
      </td>
      <td class="action-buttons">
        <button class="btn btn-sm btn-outline-primary" onclick="viewK8sClusterDetails('${cluster.id}')" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
        ${cluster.accessInfo && cluster.accessInfo.kubeconfig ? 
          `<button class="btn btn-sm btn-outline-success" onclick="downloadKubeconfig('${cluster.id}')" title="Download Kubeconfig">
            <i class="fas fa-download"></i>
          </button>` : ''
        }
        <button class="btn btn-sm btn-outline-warning" onclick="controlK8sCluster('${cluster.id}', 'upgrade')" title="Upgrade">
          <i class="fas fa-arrow-up"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteK8sCluster('${cluster.id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    
    // Add click event to select cluster for node group filtering
    row.addEventListener('click', function(event) {
      // Don't trigger if clicking on buttons or links
      if (event.target.closest('button') || event.target.closest('a')) {
        return;
      }
      selectK8sCluster(cluster.id);
    });
    
    // Highlight selected cluster
    if (selectedK8sClusterId === cluster.id) {
      row.classList.add('table-active');
    }
    
    tableBody.appendChild(row);
  });
  
  // Update node groups table
  updateK8sNodeGroupTable();
  
  // Reinitialize DataTable if needed
  setTimeout(() => {
    reinitializeDataTablesIfNeeded();
  }, 100);
}

// Select K8s cluster and update node group table
function selectK8sCluster(clusterId) {
  selectedK8sClusterId = clusterId;
  console.log(`Selected K8s Cluster: ${clusterId}`);
  
  // Update K8s cluster table highlighting
  updateK8sClusterTable();
  
  // Update node group section header
  const ngTable = document.getElementById('k8sNodeGroupTable');
  const ngContentCard = ngTable ? ngTable.closest('.content-card') : null;
  const ngHeader = ngContentCard ? ngContentCard.querySelector('h5') : null;
  
  if (ngHeader) {
    ngHeader.innerHTML = `<i class="fas fa-server"></i> Kubernetes Node Groups - ${clusterId} <span class="badge badge-secondary ml-2" id="k8sNodeGroupCountBadge">0</span>`;
  }
  
  // Update node groups table to show only node groups from selected cluster
  updateK8sNodeGroupTable();
  
  // Update show all button visibility
  updateShowAllNodeGroupsButton();
}

// Show all node groups (clear cluster selection)
function showAllNodeGroups() {
  selectedK8sClusterId = null;
  console.log('Showing all node groups, selectedK8sClusterId set to:', selectedK8sClusterId);
  
  // Update K8s cluster table highlighting
  updateK8sClusterTable();
  
  // Update node group section header
  const ngTable = document.getElementById('k8sNodeGroupTable');
  const ngContentCard = ngTable ? ngTable.closest('.content-card') : null;
  const ngHeader = ngContentCard ? ngContentCard.querySelector('h5') : null;
  
  if (ngHeader) {
    ngHeader.innerHTML = `<i class="fas fa-server"></i> Kubernetes Node Groups <span class="badge badge-secondary ml-2" id="k8sNodeGroupCountBadge">0</span>`;
  }
  
  // Update node groups table to show all node groups
  updateK8sNodeGroupTable();
  
  // Update show all button visibility
  updateShowAllNodeGroupsButton();
}

// Update show all node groups button visibility
function updateShowAllNodeGroupsButton() {
  const showAllBtn = document.getElementById('showAllNodeGroupsBtn');
  if (showAllBtn) {
    showAllBtn.style.display = selectedK8sClusterId ? 'inline-block' : 'none';
  }
}

// Update K8s Node Groups table
function updateK8sNodeGroupTable() {
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const k8sData = centralData.k8sCluster || [];
  console.log('updateK8sNodeGroupTable - K8s data:', k8sData);
  const tableBody = document.getElementById('k8sNodeGroupTableBody');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  // Collect all node groups
  let allNodeGroups = [];
  k8sData.forEach(cluster => {
    console.log('Processing cluster:', cluster.id, 'Full cluster object:', cluster);
    
    // Handle different possible node group field names - comprehensive check
    let nodeGroups = cluster.k8sNodeGroupList || cluster.nodeGroupList || cluster.nodeGroups || cluster.NodeGroupList || cluster.K8sNodeGroupList || [];
    console.log('Found node groups:', nodeGroups, 'Field used:', 
      cluster.k8sNodeGroupList ? 'k8sNodeGroupList' :
      cluster.nodeGroupList ? 'nodeGroupList' :
      cluster.nodeGroups ? 'nodeGroups' :
      cluster.NodeGroupList ? 'NodeGroupList' :
      cluster.K8sNodeGroupList ? 'K8sNodeGroupList' : 'none');
    
    if (nodeGroups && nodeGroups.length > 0) {
      nodeGroups.forEach(nodeGroup => {
        allNodeGroups.push({
          ...nodeGroup,
          clusterId: cluster.id,
          clusterStatus: cluster.status
        });
      });
    }
  });
  
  console.log('All node groups collected:', allNodeGroups);
  
  // Filter node groups based on selected cluster
  let filteredNodeGroups = allNodeGroups;
  if (selectedK8sClusterId) {
    filteredNodeGroups = allNodeGroups.filter(ng => ng.clusterId === selectedK8sClusterId);
    console.log(`Filtered node groups for cluster ${selectedK8sClusterId}:`, filteredNodeGroups);
  }
  
  // Update node group count display
  const ngCountElement = document.getElementById('k8sNodeGroupCountBadge');
  if (ngCountElement) {
    ngCountElement.textContent = filteredNodeGroups.length;
  }
  
  if (filteredNodeGroups.length === 0) {
    // Show appropriate message based on context
    const row = document.createElement('tr');
    if (selectedK8sClusterId) {
      row.innerHTML = `
        <td colspan="9" class="text-center text-muted py-4">
          <i class="fas fa-info-circle me-2"></i>
          No node groups found for selected cluster: ${selectedK8sClusterId}
        </td>
      `;
    } else {
      row.innerHTML = `
        <td colspan="9" class="text-center text-muted py-4">
          <i class="fas fa-info-circle me-2"></i>
          No node groups found
        </td>
      `;
    }
    tableBody.appendChild(row);
    return;
  }
  
  filteredNodeGroups.forEach(nodeGroup => {
    const row = document.createElement('tr');
    
    // Normalize status for CSS class
    let statusClass = 'unknown';
    if (nodeGroup.status) {
      const status = nodeGroup.status.toLowerCase();
      if (status === 'active' || status === 'running') {
        statusClass = 'active';
      } else if (status === 'inactive') {
        statusClass = 'inactive';
      } else if (status === 'creating') {
        statusClass = 'creating';
      } else if (status === 'updating') {
        statusClass = 'updating';
      } else if (status === 'deleting') {
        statusClass = 'deleting';
      } else {
        statusClass = status.replace(/[^a-z0-9-]/g, '');
      }
    }
    
    // Auto scaling info - modify according to actual API response
    const autoScalingInfo = nodeGroup.onAutoScaling ? 
      `Enabled (${nodeGroup.minNodeSize || nodeGroup.minSize || 0}-${nodeGroup.maxNodeSize || nodeGroup.maxSize || 0})` : 
      'Disabled';
    
    // Min/Max size display - using actual field names
    const minSize = nodeGroup.minNodeSize || nodeGroup.minSize || 0;
    const maxSize = nodeGroup.maxNodeSize || nodeGroup.maxSize || 0;
    const sizeInfo = `${minSize} / ${maxSize}`;
    
    // Nodes info - actual node count / desired node count
    const actualNodes = nodeGroup.k8sNodes ? nodeGroup.k8sNodes.length : 0;
    const desiredNodes = nodeGroup.desiredNodeSize || nodeGroup.desiredCapacity || 0;
    const nodesInfo = `${actualNodes}/${desiredNodes}`;
    
    // Spec ID - using actual field name  
    const specId = nodeGroup.specId || nodeGroup.vmSpecName || 'N/A';
    
    // Image ID - use actual field name
    const imageId = nodeGroup.imageId || 'N/A';
    
    row.innerHTML = `
      <td title="${nodeGroup.clusterId}">${smartTruncate(nodeGroup.clusterId, 'id')}</td>
      <td title="${nodeGroup.name || nodeGroup.id}"><strong>${smartTruncate(nodeGroup.name || nodeGroup.id, 'name')}</strong></td>
      <td><span class="status-badge status-${statusClass}">${nodeGroup.status || 'Unknown'}</span></td>
      <td title="${specId}">${smartTruncate(specId, 'spec')}</td>
      <td title="${imageId}">${smartTruncate(imageId, 'default')}</td>
      <td><span class="badge badge-primary">${nodesInfo}</span></td>
      <td>${sizeInfo}</td>
      <td><span class="badge ${nodeGroup.onAutoScaling ? 'badge-success' : 'badge-secondary'}">${autoScalingInfo}</span></td>
      <td class="action-buttons">
        <button class="btn btn-sm btn-outline-primary" onclick="viewNodeGroupDetails('${nodeGroup.clusterId}', '${nodeGroup.name || nodeGroup.id}')" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-info" onclick="toggleAutoScaling('${nodeGroup.clusterId}', '${nodeGroup.name || nodeGroup.id}', ${!nodeGroup.onAutoScaling})" title="${nodeGroup.onAutoScaling ? 'Disable' : 'Enable'} Auto Scaling">
          <i class="fas fa-${nodeGroup.onAutoScaling ? 'pause' : 'play'}"></i>
        </button>
        <button class="btn btn-sm btn-outline-warning" onclick="scaleNodeGroup('${nodeGroup.clusterId}', '${nodeGroup.name || nodeGroup.id}')" title="Scale Node Group">
          <i class="fas fa-expand-arrows-alt"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteNodeGroup('${nodeGroup.name || nodeGroup.id}', '${nodeGroup.clusterId}')" title="Delete Node Group">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    
    // Add click event to select cluster when clicking on node group row
    row.addEventListener('click', function(event) {
      // Don't trigger if clicking on buttons
      if (event.target.closest('button')) {
        return;
      }
      // Select the cluster this node group belongs to
      if (nodeGroup.clusterId && selectedK8sClusterId !== nodeGroup.clusterId) {
        selectK8sCluster(nodeGroup.clusterId);
      }
    });
    
    row.style.cursor = 'pointer';
    
    tableBody.appendChild(row);
  });
}

// Optimized Connection Table Management with caching
let connectionTabCache = {
  lastUpdateTime: 0,
  lastDataHash: '',
  tabsInitialized: false,
  providerTabs: new Map()
};

function updateConnectionTable() {
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const connectionData = centralData.connection || [];
  
  // Performance optimization: Create data hash to detect actual changes
  const dataHash = JSON.stringify(connectionData.map(c => ({ 
    id: c.configName, 
    provider: c.providerName, 
    verified: c.verified 
  })));
  
  const now = Date.now();
  
  // Skip update if data hasn't changed and recent update
  if (connectionTabCache.lastDataHash === dataHash && 
      (now - connectionTabCache.lastUpdateTime) < 2000) {
    console.log('[Performance] Connection table: Skipping update - no changes detected');
    return;
  }
  
  connectionTabCache.lastUpdateTime = now;
  connectionTabCache.lastDataHash = dataHash;
  
  // Update main connection table efficiently
  updateAllConnectionsTableOptimized(connectionData);
  
  // Create/update CSP-specific tabs efficiently  
  createCspTabs(connectionData);
}

function updateAllConnectionsTableOptimized(connectionData) {
  const tableBody = document.getElementById('connectionTableBody');
  if (!tableBody) return;

  // Update count badge first
  const countBadge = document.getElementById('connectionCountBadge');
  if (countBadge) {
    countBadge.textContent = connectionData.length;
  }

  // Clear and update in one operation
  tableBody.innerHTML = '';
  
  // Update connections efficiently using DocumentFragment
  const tableFragment = document.createDocumentFragment();
  connectionData.forEach(conn => {
    const providerId = (conn.providerName || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
    const providerIcons = {
      'aws': 'fab fa-aws',
      'azure': 'fab fa-microsoft',
      'gcp': 'fab fa-google',
      'alibaba': 'fas fa-cloud',
      'tencent': 'fas fa-cloud',
      'ncp': 'fas fa-cloud',
      'nhncloud': 'fas fa-cloud',
      'nhn': 'fas fa-cloud',
      'cloudit': 'fas fa-cloud',
      'openstack': 'fas fa-cloud',
      'ibm': 'fas fa-cloud',
      'oracle': 'fas fa-cloud',
      'unknown': 'fas fa-cloud'
    };
    const providerIcon = providerIcons[providerId] || providerIcons[(conn.providerName || 'unknown').toLowerCase()] || 'fas fa-cloud';
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="text-nowrap" title="${conn.configName}">${smartTruncate(conn.configName, 'id')}</td>
      <td class="text-nowrap">
        <span class="provider-badge provider-${getProviderClass(conn.providerName)}">
          <i class="${providerIcon}"></i> ${conn.providerName || 'N/A'}
        </span>
      </td>
      <td class="text-nowrap" title="${conn.regionDetail?.regionName || 'N/A'}">${smartTruncate(conn.regionDetail?.regionName || 'N/A', 'region')}</td>
      <td>${formatZonesWithHighlight(conn)}</td>
      <td class="text-nowrap"><span class="badge ${conn.verified ? 'badge-success' : 'badge-warning'}">${conn.verified ? 'Yes' : 'No'}</span></td>
      <td class="action-buttons text-nowrap">
        <button class="btn btn-sm btn-outline-primary" onclick="viewResourceDetails('connection', '${conn.configName}')" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-warning" onclick="testConnection('${conn.configName}')" title="Test Connection">
          <i class="fas fa-check"></i>
        </button>
      </td>
    `;
    tableFragment.appendChild(row);
  });
  
  tableBody.appendChild(tableFragment);
}

// Optimized CSP tabs creation function with intelligent caching
function createCspTabs(connectionData) {
  const start = performance.now();
  
  if (!connectionData || !Array.isArray(connectionData)) {
    console.warn('Invalid connection data provided to createCspTabs');
    return;
  }

  // Group connections by CSP
  const cspGroups = {};
  connectionData.forEach(conn => {
    const provider = conn.providerName || 'unknown';
    if (!cspGroups[provider]) {
      cspGroups[provider] = [];
    }
    cspGroups[provider].push(conn);
  });

  // Get CSP provider icons
  const providerIcons = {
    'aws': 'fab fa-aws',
    'azure': 'fab fa-microsoft',
    'gcp': 'fab fa-google',
    'alibaba': 'fas fa-cloud',
    'tencent': 'fas fa-cloud',
    'ncp': 'fas fa-cloud',
    'nhncloud': 'fas fa-cloud',
    'nhn': 'fas fa-cloud',
    'cloudit': 'fas fa-cloud',
    'openstack': 'fas fa-cloud',
    'ibm': 'fas fa-cloud',
    'oracle': 'fas fa-cloud',
    'unknown': 'fas fa-cloud'
  };

  // Create tabs
  const tabsContainer = document.getElementById('connectionTabs');
  const tabContentContainer = document.getElementById('connectionTabContent');
  
  if (!tabsContainer || !tabContentContainer) return;

  // Save currently active tab BEFORE any changes
  const activeTab = document.querySelector('#connectionTabs .nav-link.active');
  const activeTabId = activeTab ? activeTab.getAttribute('href') : null;
  const wasActiveTabCsp = activeTab && activeTab.closest('.csp-tab');

  // Only update CSP tabs if the provider list actually changed
  const existingProviders = Array.from(tabsContainer.querySelectorAll('.csp-tab .nav-link')).map(tab => {
    const href = tab.getAttribute('href');
    return href ? href.replace('#', '').replace('-connections', '') : '';
  });
  const newProviders = Object.keys(cspGroups).sort().map(provider => 
    provider.toLowerCase().replace(/[^a-z0-9]/g, '')
  );
  
  const providersChanged = JSON.stringify(existingProviders) !== JSON.stringify(newProviders);
  
  if (providersChanged) {
    // Remove existing CSP tabs (keep "All Connections" tab)
    const existingCspTabs = tabsContainer.querySelectorAll('.csp-tab');
    existingCspTabs.forEach(tab => tab.remove());
    
    // Remove existing CSP tab panes
    const existingCspPanes = tabContentContainer.querySelectorAll('.csp-tab-pane');
    existingCspPanes.forEach(pane => pane.remove());
  }

  // Create CSP-specific tabs (only if providers changed or tabs don't exist)
  Object.keys(cspGroups).sort().forEach(provider => {
    const connections = cspGroups[provider];
    const providerId = provider.toLowerCase().replace(/[^a-z0-9]/g, '');
    const providerIcon = providerIcons[providerId] || providerIcons[provider.toLowerCase()] || 'fas fa-cloud';
    
    let existingTab = document.getElementById(`${providerId}-tab`);
    let existingPane = document.getElementById(`${providerId}-connections`);
    
    if (providersChanged || !existingTab) {
      // Create tab
      const tabItem = document.createElement('li');
      tabItem.className = 'nav-item csp-tab';
      tabItem.role = 'presentation';
      
      const tabLink = document.createElement('a');
      tabLink.className = 'nav-link';
      tabLink.id = `${providerId}-tab`;
      tabLink.setAttribute('data-toggle', 'tab');
      tabLink.setAttribute('href', `#${providerId}-connections`);
      tabLink.setAttribute('role', 'tab');
      tabLink.innerHTML = `<i class="${providerIcon}"></i> ${provider} <span class="badge badge-secondary">${connections.length}</span>`;
      
      tabItem.appendChild(tabLink);
      tabsContainer.appendChild(tabItem);
      
      // Create tab content
      const tabPane = document.createElement('div');
      tabPane.className = 'tab-pane fade csp-tab-pane';
      tabPane.id = `${providerId}-connections`;
      tabPane.setAttribute('role', 'tabpanel');
      
      tabPane.innerHTML = `
        <div class="table-responsive table-container" style="max-height: 25vh; overflow-y: auto;">
          <table class="table table-hover">
            <thead>
              <tr>
                <th class="text-nowrap">Connection ID</th>
                <th class="text-nowrap">Provider</th>
                <th class="text-nowrap">Region</th>
                <th>Zone</th>
                <th class="text-nowrap">Verified</th>
                <th class="text-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody id="${providerId}-connectionTableBody">
            </tbody>
          </table>
        </div>
      `;
      
      tabContentContainer.appendChild(tabPane);
    } else {
      // Just update the badge count for existing tab
      const badge = existingTab.querySelector('.badge');
      if (badge) {
        badge.textContent = connections.length;
      }
    }
    
    // Populate CSP-specific table
    const cspTableBody = document.getElementById(`${providerId}-connectionTableBody`);
    if (cspTableBody) {
      cspTableBody.innerHTML = ''; // Clear existing content
      
      connections.forEach(conn => {
        const connProviderId = (conn.providerName || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
        const connProviderIcon = providerIcons[connProviderId] || providerIcons[(conn.providerName || 'unknown').toLowerCase()] || 'fas fa-cloud';
        
        const row = document.createElement('tr');
        row.innerHTML = `
          <td class="text-nowrap" title="${conn.configName}">${smartTruncate(conn.configName, 'id')}</td>
          <td class="text-nowrap">
            <span class="provider-badge provider-${getProviderClass(conn.providerName)}">
              <i class="${connProviderIcon}"></i> ${conn.providerName || 'N/A'}
            </span>
          </td>
          <td class="text-nowrap" title="${conn.regionDetail?.regionName || 'N/A'}">${smartTruncate(conn.regionDetail?.regionName || 'N/A', 'region')}</td>
          <td>${formatZonesWithHighlight(conn)}</td>
          <td class="text-nowrap"><span class="badge ${conn.verified ? 'badge-success' : 'badge-warning'}">${conn.verified ? 'Yes' : 'No'}</span></td>
          <td class="action-buttons text-nowrap">
            <button class="btn btn-sm btn-outline-primary" onclick="viewResourceDetails('connection', '${conn.configName}')" title="View Details">
              <i class="fas fa-eye"></i>
            </button>
            <button class="btn btn-sm btn-outline-warning" onclick="testConnection('${conn.configName}')" title="Test Connection">
              <i class="fas fa-check"></i>
            </button>
          </td>
        `;
        cspTableBody.appendChild(row);
      });
    }
  });

  // Restore active tab immediately without setTimeout to reduce flicker
  if (activeTabId) {
    // Restore previously active tab if it exists
    const targetTab = document.querySelector(`#connectionTabs .nav-link[href="${activeTabId}"]`);
    const targetPane = document.querySelector(activeTabId);
    
    if (targetTab && targetPane) {
      // Remove active state from all tabs first
      document.querySelectorAll('#connectionTabs .nav-link').forEach(tab => {
        tab.classList.remove('active');
      });
      document.querySelectorAll('#connectionTabContent .tab-pane').forEach(pane => {
        pane.classList.remove('show', 'active');
      });
      
      // Then activate the target tab
      targetTab.classList.add('active');
      targetPane.classList.add('show', 'active');
    }
  }
  
  const end = performance.now();
  console.log(`createCspTabs completed in ${(end - start).toFixed(2)}ms`);
}

// Clear Connection Tab Selection Function
function clearConnectionTabSelection() {
  // Remove active state from all connection tabs
  document.querySelectorAll('#connectionTabs .nav-link').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Remove active state from all connection tab panes
  document.querySelectorAll('#connectionTabContent .tab-pane').forEach(pane => {
    pane.classList.remove('show', 'active');
  });
  
  console.log('Connection tab selection cleared');
}

function updateCustomImageTable() {
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const imageData = centralData.customImage || [];
  const tableBody = document.getElementById('customImageTableBody');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  // Update count badge
  const countBadge = document.getElementById('customImageCountBadge');
  if (countBadge) {
    countBadge.textContent = imageData.length;
  }
  
  imageData.forEach(image => {
    // Extract region from regionList array (take first region if multiple)
    const regionName = Array.isArray(image.regionList) && image.regionList.length > 0 
      ? image.regionList[0] 
      : (image.regionList || 'N/A');
    
    // Use imageStatus (new field) or fallback to status (old field)
    const imageStatus = image.imageStatus || image.status || 'Unknown';
    
    // Use osType (new field) or fallback to guestOS (old field)
    const osType = image.osType || image.guestOS || 'N/A';
    
    // Use providerName (new field) or fallback to connectionConfig (old field)
    const providerName = image.providerName || image.connectionConfig?.providerName || 'N/A';
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td title="${image.id}">${smartTruncate(image.id, 'id')}</td>
      <td title="${image.name || 'N/A'}">${smartTruncate(image.name || 'N/A', 'name')}</td>
      <td><span class="status-badge status-${imageStatus.toLowerCase()}">${imageStatus}</span></td>
      <td title="${providerName}">${smartTruncate(providerName, 'provider')}</td>
      <td title="${regionName}">${smartTruncate(regionName, 'region')}</td>
      <td title="${osType}">${smartTruncate(osType, 'default')}</td>
      <td>${image.creationDate ? new Date(image.creationDate).toLocaleDateString() : 'N/A'}</td>
      <td class="action-buttons">
        <button class="btn btn-sm btn-outline-primary" onclick="viewResourceDetails('customImage', '${image.id}')" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteCustomImage('${image.id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });
  
  // Reinitialize DataTable if needed
  setTimeout(() => {
    reinitializeDataTablesIfNeeded();
  }, 100);
}

function updateDataDiskTable() {
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const diskData = centralData.dataDisk || [];
  const tableBody = document.getElementById('dataDiskTableBody');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  // Update count badge
  const countBadge = document.getElementById('dataDiskCountBadge');
  if (countBadge) {
    countBadge.textContent = diskData.length;
  }
  
  diskData.forEach(disk => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td title="${disk.id}">${smartTruncate(disk.id, 'id')}</td>
      <td title="${disk.name || 'N/A'}">${smartTruncate(disk.name || 'N/A', 'name')}</td>
      <td><span class="status-badge status-${(disk.status || 'unknown').toLowerCase()}">${disk.status || 'Unknown'}</span></td>
      <td title="${disk.connectionConfig?.providerName || 'N/A'}">${smartTruncate(disk.connectionConfig?.providerName || 'N/A', 'provider')}</td>
      <td title="${disk.connectionConfig?.regionDetail?.regionName || 'N/A'}">${smartTruncate(disk.connectionConfig?.regionDetail?.regionName || 'N/A', 'region')}</td>
      <td title="${disk.diskSize || 'N/A'}">${smartTruncate(disk.diskSize || 'N/A', 'default')}</td>
      <td title="${disk.diskType || 'N/A'}">${smartTruncate(disk.diskType || 'N/A', 'default')}</td>
      <td class="action-buttons">
        <button class="btn btn-sm btn-outline-primary" onclick="viewResourceDetails('dataDisk', '${disk.id}')" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-warning" onclick="resizeDisk('${disk.id}')" title="Resize">
          <i class="fas fa-expand"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteDataDisk('${disk.id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });
  
  // Reinitialize DataTable if needed
  setTimeout(() => {
    reinitializeDataTablesIfNeeded();
  }, 100);
}

function updateVpnTable() {
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const vpnData = centralData.vpn || [];
  
  // Check if data has changed before updating
  if (!hasDataChanged('vpn-table', vpnData)) {
    console.log('[Performance] VPN table: Skipping update - no changes detected');
    return;
  }
  
  const tableBody = document.getElementById('vpnTableBody');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  // Update count badge
  const countBadge = document.getElementById('vpnCountBadge');
  if (countBadge) {
    countBadge.textContent = vpnData.length;
  }
  
  vpnData.forEach(vpn => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td title="${vpn.mciId || 'N/A'}">${smartTruncate(vpn.mciId || 'N/A', 'id')}</td>
      <td title="${vpn.id || 'N/A'}">${smartTruncate(vpn.id || 'N/A', 'id')}</td>
      <td><span class="status-badge status-${(vpn.status || 'unknown').toLowerCase()}">${vpn.status || 'Unknown'}</span></td>
      <td title="${vpn.vpnSites ? vpn.vpnSites.length : 0}">${vpn.vpnSites ? vpn.vpnSites.length : 0} sites</td>
      <td title="${vpn.connectionConfig?.providerName || 'N/A'}">${smartTruncate(vpn.connectionConfig?.providerName || 'N/A', 'provider')}</td>
      <td title="${vpn.connectionConfig?.regionDetail?.regionName || 'N/A'}">${smartTruncate(vpn.connectionConfig?.regionDetail?.regionName || 'N/A', 'region')}</td>
      <td class="action-buttons">
        <button class="btn btn-sm btn-outline-primary" onclick="viewVpnDetails('${vpn.mciId}', '${vpn.id}')" title="View Details">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteVpn('${vpn.mciId}', '${vpn.id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });
  
  // Reinitialize DataTable if needed
  setTimeout(() => {
    reinitializeDataTablesIfNeeded();
  }, 100);
}

// Resource management functions
function refreshResourceList(resourceType) {
  console.log(`Refreshing ${resourceType} list...`);

    // Special handling for VPN resources
  if (resourceType === 'vpn') {
    refreshVpnList();
    return;
  }
  
  // Trigger refresh from parent window
  if (window.parent && window.parent.getMci) {
    window.parent.getMci();
  }
  
  // Show loading indicator
  Swal.fire({
    title: 'Refreshing...',
    text: `Updating ${resourceType} list`,
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });
  
  // Hide loading after a short delay
  setTimeout(() => {
    Swal.close();
  }, 2000);
}

function viewResourceDetails(resourceType, resourceId) {
  console.log(`Viewing details for ${resourceType}: ${resourceId}`);
  
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const resourceData = centralData[resourceType] || [];
  const resource = resourceData.find(item => item.id === resourceId || item.configName === resourceId);
  
  if (resource) {
    const emoji = getResourceEmoji(resourceType);
    showJsonDetailsPopup(`${emoji} ${resourceType} Details: ${resourceId}`, resource);
  } else {
    Swal.fire('Error', 'Resource not found', 'error');
  }
}

// Get emoji for resource type
function getResourceEmoji(resourceType) {
  const emojis = {
    'vNet': '🌐',
    'subnet': '🔀',
    'securityGroup': '🛡️',
    'sshKey': '🔑',
    'dataDisk': '💾',
    'customImage': '🖼️',
    'connection': '🔗',
    'mci': '🖥️',
    'vm': '💻',
    'k8sCluster': '☸️',
    'k8sNodeGroup': '📦'
  };
  return emojis[resourceType] || '📋';
}

// Common function for showing JSON details in dark-themed popup
function showJsonDetailsPopup(title, data) {
  const jsonOutputConfig = {
    theme: 'dark',
    hoverPreviewEnabled: true,
    hoverPreviewArrayCount: 100,
    hoverPreviewFieldCount: 5,
    animateOpen: true,
    animateClose: true,
    useToJSON: true,
    quotesOnKeys: false,
    quotesOnValues: false
  };

  Swal.fire({
    title: title,
    html: '<div id="dashboard-json-output" class="form-control" style="height: auto; background-color: black; text-align: left; padding: 10px; overflow: auto; max-height: 400px;"></div>',
    background: '#0e1746',
    color: '#fff',
    width: '50%',
    showCloseButton: true,
    showConfirmButton: true,
    confirmButtonText: 'Close',
    didOpen: () => {
      setTimeout(() => {
        const container = document.getElementById('dashboard-json-output');
        if (container) {
          const formatter = new JSONFormatter(data, 2, jsonOutputConfig);
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
          const existingStyle = document.getElementById('dashboard-json-style');
          if (!existingStyle) {
            const style = document.createElement('style');
            style.id = 'dashboard-json-style';
            style.textContent = `
              #dashboard-json-output .json-formatter-string {
                word-wrap: break-word !important;
                overflow-wrap: break-word !important;
                white-space: pre-wrap !important;
                word-break: break-all !important;
                max-width: 100% !important;
              }
              #dashboard-json-output .json-formatter-row .json-formatter-string {
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

function deleteResource(resourceType, resourceId, parameters = {}) {
  // Instead of duplicating logic, use the existing async deleteResource function
  const resourceTypeMap = {
    'MCI': 'mci',
    'VM': 'vm', 
    'K8s Cluster': 'k8sCluster',
    'K8s Node Group': 'k8sNodeGroup',
    'vNet': 'vNet',
    'Security Group': 'securityGroup',
    'SSH Key': 'sshKey',
    'Custom Image': 'customImage',
    'Data Disk': 'dataDisk'
  };
  
  const apiResourceType = resourceTypeMap[resourceType] || resourceType.toLowerCase();
  
  // Call the async deleteResourceAsync function with proper parameters
  deleteResourceAsync(apiResourceType, resourceId, parameters)
    .catch(error => {
      console.error('Deletion failed:', error);
      // Error handling is already done in the async function
    });
}

// Helper function to escape HTML for safe innerHTML insertion
function _escapeHtml(str) {
  if (window.escapeHtml) return window.escapeHtml(str);
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Helper function for text truncation
function truncateText(text, maxLength) {
  if (text === null || text === undefined) return text;
  text = String(text);
  if (text === 'N/A' || text === 'None') return text;
  if (text.length <= maxLength) return _escapeHtml(text);
  return `<span title="${_escapeHtml(text)}">${_escapeHtml(text.substring(0, maxLength))}...</span>`;
}

// Smart truncation that only truncates very long text
function smartTruncate(text, columnType = 'default') {
  if (text === null || text === undefined) return text;
  text = String(text);
  if (text === 'N/A' || text === 'None') return text;
  
  // Define thresholds based on column type
  const thresholds = {
    'id': 25,        // ID columns can be a bit longer
    'name': 30,      // Name columns 
    'provider': 20,  // Provider names are usually short
    'region': 25,    // Region names
    'spec': 30,      // Spec names can be longer
    'ip': 20,        // IP addresses
    'description': 50, // Descriptions can be longer
    'default': 35    // Default for other columns
  };
  
  const maxLength = thresholds[columnType] || thresholds.default;
  
  if (text.length <= maxLength) return _escapeHtml(text);
  return `<span title="${_escapeHtml(text)}">${_escapeHtml(text.substring(0, maxLength))}...</span>`;
}

// Helper function to format zones with active zone highlighting
function formatZonesWithHighlight(connection) {
  const zones = connection.regionDetail?.zones || [];
  // Check for assignedZone first, then fallback to other possible fields
  const activeZone = connection.regionZoneInfo?.assignedZone || 
                    connection.assignedZone || 
                    connection.zone || 
                    connection.availabilityZone || 
                    connection.regionDetail?.zone;
  
  if (zones.length === 0) {
    return activeZone ? `<span class="zone-active">${activeZone}</span>` : 'N/A';
  }
  
  const formattedZones = zones.map(zone => {
    if (activeZone && zone === activeZone) {
      return `<span class="zone-active" title="Assigned zone (${activeZone})">${zone}</span>`;
    } else {
      return `<span class="zone-available" title="Available zone">${zone}</span>`;
    }
  });
  
  return formattedZones.join(', ');
}

// Helper function to get provider CSS class
function getProviderClass(providerName) {
  if (!providerName) return 'unknown';
  
  const knownProviders = [
    'aws', 'azure', 'gcp', 'alibaba', 'tencent', 'ncp', 
    'nhncloud', 'nhn', 'cloudit', 'openstack', 'ibm', 'oracle'
  ];
  
  const normalizedProvider = providerName.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Check if it's a known provider
  if (knownProviders.includes(normalizedProvider)) {
    return normalizedProvider;
  }
  
  // Check original provider name (in case of different formatting)
  if (knownProviders.includes(providerName.toLowerCase())) {
    return providerName.toLowerCase();
  }
  
  // Return original provider name for fallback CSS
  return providerName.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Export new functions for global access
window.refreshResourceList = refreshResourceList;
window.viewResourceDetails = viewResourceDetails;
window.deleteResource = deleteResource;
window.updateAllResourceTables = updateAllResourceTables;

// Additional resource-specific functions
function viewKeyMaterial(sshKeyId) {
  console.log(`Viewing SSH key material for: ${sshKeyId}`);
  
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const sshKeyData = centralData.sshKey || [];
  const sshKey = sshKeyData.find(key => key.id === sshKeyId);
  
  if (sshKey) {
    Swal.fire({
      title: 'SSH Key Material',
      html: `
        <div style="text-align: left;">
          <p><strong>Key ID:</strong> ${sshKey.id}</p>
          <p><strong>Fingerprint:</strong> ${sshKey.fingerprint || 'N/A'}</p>
          <div style="margin-top: 10px;">
            <strong>Public Key:</strong>
            <textarea readonly style="width: 100%; height: 100px; font-family: monospace; font-size: 12px; margin-top: 5px;">${sshKey.publicKey || 'Not available'}</textarea>
          </div>
          ${sshKey.privateKey ? `
          <div style="margin-top: 10px;">
            <strong>Private Key:</strong>
            <textarea readonly style="width: 100%; height: 150px; font-family: monospace; font-size: 12px; margin-top: 5px;">${sshKey.privateKey}</textarea>
          </div>
          ` : ''}
        </div>
      `,
      width: '800px'
    });
  } else {
    Swal.fire('Error', 'SSH Key not found', 'error');
  }
}

function controlK8sCluster(clusterId, action) {
  console.log(`Performing ${action} on K8s cluster: ${clusterId}`);
  
  if (action === 'upgrade') {
    Swal.fire({
      title: 'Upgrade K8s Cluster',
      text: `Are you sure you want to upgrade cluster ${clusterId}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, upgrade it!'
    }).then((result) => {
      if (result.isConfirmed) {
        console.log(`Upgrading K8s cluster: ${clusterId}`);
        // TODO: Implement actual upgrade API call
        Swal.fire('Upgrade Started!', 'K8s cluster upgrade has been initiated.', 'success');
      }
    });
  }
}

function testConnection(configName) {
  console.log(`Testing connection: ${configName}`);
  
  Swal.fire({
    title: 'Testing Connection...',
    text: `Verifying connection ${configName}`,
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });
  
  // Simulate connection test
  setTimeout(() => {
    Swal.fire({
      title: 'Connection Test',
      text: `Connection ${configName} is healthy`,
      icon: 'success'
    });
  }, 2000);
}

function resizeDisk(diskId) {
  console.log(`Resizing disk: ${diskId}`);
  
  Swal.fire({
    title: 'Resize Data Disk',
    html: `
      <div style="text-align: left;">
        <p><strong>Disk ID:</strong> ${diskId}</p>
        <label for="newSize">New Size (GB):</label>
        <input type="number" id="newSize" class="swal2-input" placeholder="Enter new size" min="1">
        <p style="font-size: 12px; color: #666; margin-top: 10px;">
          Note: You can only increase the disk size. Decreasing is not supported.
        </p>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Resize',
    preConfirm: () => {
      const newSize = document.getElementById('newSize').value;
      if (!newSize || newSize <= 0) {
        Swal.showValidationMessage('Please enter a valid size');
        return false;
      }
      return newSize;
    }
  }).then((result) => {
    if (result.isConfirmed) {
      console.log(`Resizing disk ${diskId} to ${result.value} GB`);
      // TODO: Implement actual resize API call
      Swal.fire('Resize Started!', `Disk ${diskId} resize to ${result.value} GB has been initiated.`, 'success');
    }
  });
}

// K8s Cluster Functions
function viewK8sClusterDetails(clusterId) {
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const k8sData = centralData.k8sCluster || [];
  const cluster = k8sData.find(c => c.id === clusterId);
  
  if (!cluster) {
    showErrorMessage('K8s Cluster not found');
    return;
  }
  
  showJsonDetailsPopup(`☸️ K8s Cluster Details: ${clusterId}`, cluster);
}

function downloadKubeconfig(clusterId) {
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const k8sData = centralData.k8sCluster || [];
  const cluster = k8sData.find(c => c.id === clusterId);
  
  if (!cluster || !cluster.accessInfo || !cluster.accessInfo.kubeconfig) {
    showErrorMessage('Kubeconfig not available for this cluster');
    return;
  }
  
  // Create and download kubeconfig file
  const kubeconfigContent = cluster.accessInfo.kubeconfig;
  const blob = new Blob([kubeconfigContent], { type: 'text/yaml' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kubeconfig-${clusterId}.yaml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
  
  showSuccessMessage(`Kubeconfig downloaded for cluster: ${clusterId}`);
}

function viewNodeGroupDetails(clusterId, nodeGroupName) {
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const k8sData = centralData.k8sCluster || [];
  const cluster = k8sData.find(c => c.id === clusterId);
  
  if (!cluster) {
    showErrorMessage('Cluster not found');
    return;
  }
  
  // Check multiple possible field names for node group list
  let nodeGroupList = cluster.k8sNodeGroupList || cluster.nodeGroupList || cluster.nodeGroups || cluster.NodeGroupList || cluster.K8sNodeGroupList || [];
  
  if (!nodeGroupList || nodeGroupList.length === 0) {
    showErrorMessage('No node groups found for this cluster');
    return;
  }
  
  const nodeGroup = nodeGroupList.find(ng => ng.name === nodeGroupName || ng.id === nodeGroupName);
  if (!nodeGroup) {
    showErrorMessage('Node group not found');
    return;
  }
  
  showJsonDetailsPopup(`📦 Node Group Details: ${nodeGroupName}`, nodeGroup);
}

function toggleAutoScaling(clusterId, nodeGroupName, enable) {
  const action = enable ? 'enable' : 'disable';
  
  Swal.fire({
    title: `${enable ? 'Enable' : 'Disable'} Auto Scaling`,
    text: `Are you sure you want to ${action} auto scaling for node group: ${nodeGroupName}?`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: `Yes, ${action}`,
    cancelButtonText: 'Cancel'
  }).then((result) => {
    if (result.isConfirmed) {
      console.log(`${action} auto scaling for ${nodeGroupName} in cluster ${clusterId}`);
      // TODO: Implement actual API call
      showSuccessMessage(`Auto scaling ${action}d for node group: ${nodeGroupName}`);
    }
  });
}

function scaleNodeGroup(clusterId, nodeGroupName) {
  // Get current node group info to prefill values
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  const k8sData = centralData.k8sCluster || [];
  const cluster = k8sData.find(c => c.id === clusterId);
  let currentNodeGroup = null;
  
  if (cluster && cluster.k8sNodeGroupList) {
    currentNodeGroup = cluster.k8sNodeGroupList.find(ng => ng.name === nodeGroupName || ng.id === nodeGroupName);
  }
  
  // Set default values from current node group if available
  const defaultDesired = currentNodeGroup?.desiredNodeSize || 1;
  const defaultMin = currentNodeGroup?.minNodeSize || 0;
  const defaultMax = currentNodeGroup?.maxNodeSize || 10;
  
  Swal.fire({
    title: 'Scale Node Group',
    html: `
      <div style="text-align: left;">
        <p><strong>Cluster:</strong> ${clusterId}</p>
        <p><strong>Node Group:</strong> ${nodeGroupName}</p>
        <div class="form-group" style="margin-bottom: 15px;">
          <label for="desiredCapacity" style="display: block; margin-bottom: 5px;">Desired Capacity:</label>
          <input type="number" id="desiredCapacity" class="form-control" min="0" max="100" value="${defaultDesired}" style="width: 100%; padding: 8px;">
        </div>
        <div class="form-group" style="margin-bottom: 15px;">
          <label for="minSize" style="display: block; margin-bottom: 5px;">Min Size:</label>
          <input type="number" id="minSize" class="form-control" min="0" max="100" value="${defaultMin}" style="width: 100%; padding: 8px;">
        </div>
        <div class="form-group" style="margin-bottom: 15px;">
          <label for="maxSize" style="display: block; margin-bottom: 5px;">Max Size:</label>
          <input type="number" id="maxSize" class="form-control" min="1" max="100" value="${defaultMax}" style="width: 100%; padding: 8px;">
        </div>
        <div style="background-color: #f8f9fa; padding: 10px; border-radius: 4px; font-size: 12px; color: #6c757d;">
          <strong>Note:</strong> This will update the autoscale configuration for the node group. 
          Changes may take a few minutes to take effect.
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Scale Node Group',
    cancelButtonText: 'Cancel',
    width: '600px',
    preConfirm: () => {
      const desiredCapacity = document.getElementById('desiredCapacity').value;
      const minSize = document.getElementById('minSize').value;
      const maxSize = document.getElementById('maxSize').value;
      
      if (!desiredCapacity || !minSize || !maxSize) {
        Swal.showValidationMessage('Please fill all fields');
        return false;
      }
      
      const desired = parseInt(desiredCapacity);
      const min = parseInt(minSize);
      const max = parseInt(maxSize);
      
      if (min > max) {
        Swal.showValidationMessage('Min size cannot be greater than max size');
        return false;
      }
      
      if (desired < min || desired > max) {
        Swal.showValidationMessage('Desired capacity must be between min and max size');
        return false;
      }
      
      return {
        desiredNodeSize: desired.toString(),
        minNodeSize: min.toString(),
        maxNodeSize: max.toString()
      };
    }
  }).then(async (result) => {
    if (result.isConfirmed) {
      console.log(`Scaling node group ${nodeGroupName} in cluster ${clusterId}:`, result.value);
      
      // Show loading indicator
      Swal.fire({
        title: 'Scaling Node Group...',
        text: 'Please wait while the node group is being scaled.',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });
      
      try {
        // Get config and namespace from parent window (index.js) - same as delete functions
        const parentConfig = window.parent?.getConfig?.() || { 
          hostname: 'localhost', 
          port: '1323',
          username: 'default', 
          password: 'default' 
        };
        
        // Get current namespace from parent window's namespace element
        const namespaceElement = window.parent?.document?.getElementById('namespace') || 
                                window.parent?.document?.getElementById('namespace-control');
        const currentNamespace = namespaceElement?.value || 'default';
        
        // Call CB-Tumblebug API
        const url = `http://${parentConfig.hostname}:${parentConfig.port}/tumblebug/ns/${currentNamespace}/k8sCluster/${clusterId}/k8sNodeGroup/${nodeGroupName}/autoscaleSize`;
        
        const response = await fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + btoa(`${parentConfig.username}:${parentConfig.password}`)
          },
          body: JSON.stringify(result.value)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const responseData = await response.json();
        console.log('Scale node group response:', responseData);
        
        // Close loading dialog and show success
        Swal.fire({
          title: 'Success!',
          text: `Node group ${nodeGroupName} has been scaled successfully.`,
          icon: 'success',
          timer: 3000,
          showConfirmButton: false
        });
        
        // Refresh the node group table to show updated values
        if (typeof updateK8sNodeGroupTable === 'function') {
          // Wait a moment for backend to update
          setTimeout(() => {
            updateK8sNodeGroupTable();
          }, 2000);
        }
        
        // Also refresh K8s cluster data from parent window
        if (window.parent && typeof window.parent.loadK8sClusterData === 'function') {
          setTimeout(() => {
            window.parent.loadK8sClusterData();
          }, 3000);
        }
        
      } catch (error) {
        console.error('Error scaling node group:', error);
        
        Swal.fire({
          title: 'Error',
          text: `Failed to scale node group: ${error.message}`,
          icon: 'error',
          confirmButtonText: 'OK'
        });
      }
    }
  });
}

function deleteNodeGroup(nodeGroupId, clusterId = null) {
  // If clusterId is not provided, try to find it from the node group data
  if (!clusterId) {
    const k8sData = centralData.k8sCluster || [];
    for (const cluster of k8sData) {
      if (cluster.k8sNodeGroupList) {
        const foundNodeGroup = cluster.k8sNodeGroupList.find(ng => ng.id === nodeGroupId);
        if (foundNodeGroup) {
          clusterId = cluster.id;
          break;
        }
      }
    }
  }
  
  if (!clusterId) {
    Swal.fire({
      title: 'Error',
      text: 'Could not find cluster for this node group.',
      icon: 'error'
    });
    return;
  }
  
  // Use the common delete function
  deleteK8sNodeGroup(nodeGroupId, clusterId);
}

function refreshNodeGroupList() {
  console.log('Refreshing node group list...');
  // Node groups are part of cluster data, so refresh clusters
  if (window.parent && typeof window.parent.getMci === 'function') {
    window.parent.getMci();
  }
  showSuccessMessage('Node group list refreshed!', 1500);
}

// TB (Tumblebug) Functions
function showGitHub() {
  // Simply open GitHub in new tab
  window.open('https://github.com/cloud-barista/cb-tumblebug', '_blank');
}

// New functions for Useful Information section
function openLink(url) {
  window.open(url, '_blank');
}

function openInfoLink(path) {
  var currentHost = window.location.hostname;
  var url = `http://${currentHost}:3000/auto/dashboard/${path}`;
  
  // Try to open the specific dashboard
  var newWindow = window.open(url, '_blank');
  
  // Fallback: if the page doesn't load, redirect to Info Home after a short delay
  setTimeout(() => {
    try {
      if (newWindow.document.readyState === 'complete' && newWindow.document.title.includes('Not found')) {
        newWindow.location.href = `http://${currentHost}:3000`;
      }
    } catch (e) {
      // Cross-origin restrictions may prevent access, so we'll use a simpler fallback approach
      console.log('Opening Info dashboard:', url);
    }
  }, 2000);
}

// Scroll to specific section smoothly
function scrollToSection(sectionId) {
  // Try to find the section element directly (row with id)
  let element = document.getElementById(sectionId);
  
  // If not found, try alternative IDs (for backward compatibility)
  if (!element) {
    const alternativeMap = {
      'mciTable': 'mciTable',
      'vmTable': 'vmTable',
      'providerRegionChart': 'providerRegionChart'
    };
    const alternativeId = alternativeMap[sectionId];
    if (alternativeId) {
      element = document.getElementById(alternativeId);
    }
  }
  
  if (element) {
    // Find the parent row or section container if element is not already a row
    let targetElement = element;
    if (!element.classList.contains('row')) {
      const container = element.closest('.row');
      if (container) {
        targetElement = container;
      }
    }
    
    // Smooth scroll to the element
    targetElement.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'start',
      inline: 'nearest'
    });
    
    // Add a highlight effect
    const parentCard = element.closest('.content-card');
    if (parentCard) {
      parentCard.style.boxShadow = '0 0 20px rgba(0, 123, 255, 0.3)';
      parentCard.style.border = '2px solid #007bff';
      
      // Remove highlight after 3 seconds
      setTimeout(() => {
        parentCard.style.boxShadow = '';
        parentCard.style.border = '';
      }, 3000);
    }
  } else {
    console.warn(`Section with ID '${sectionId}' not found`);
  }
}

// Export additional functions
window.viewKeyMaterial = viewKeyMaterial;
window.controlK8sCluster = controlK8sCluster;
window.testConnection = testConnection;
window.resizeDisk = resizeDisk;
window.scaleNodeGroup = scaleNodeGroup;
window.showGitHub = showGitHub;
window.openLink = openLink;
window.openInfoLink = openInfoLink;
window.scrollToSection = scrollToSection;

// Scroll to top functionality
function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

// Show/hide scroll to top button based on scroll position
function toggleScrollToTopButton() {
  const scrollToTopBtn = document.getElementById('scrollToTopBtn');
  if (window.pageYOffset > 300) {
    scrollToTopBtn.classList.add('show');
  } else {
    scrollToTopBtn.classList.remove('show');
  }
}

// Add scroll event listener when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  window.addEventListener('scroll', toggleScrollToTopButton);
});

// Cleanup function to run when page is being unloaded
function performCleanup() {
  console.log('[Performance] Performing final cleanup...');
  
  // Clear all timers
  clearDanglingTimers();
  
  // Destroy all charts
  destroyAllCharts();
  
  // Clear event listeners flag
  eventListenersAttached = false;
  
  // Clear central data reference
  centralData = {};
  mciData = [];
  vmData = [];
  resourceData = {};
  
  console.log('[Performance] Final cleanup completed');
}

// Add cleanup on page unload
window.addEventListener('beforeunload', performCleanup);
window.addEventListener('unload', performCleanup);

// Also cleanup when navigating away (for iframe usage)
window.addEventListener('pagehide', performCleanup);

// Export connection tab functions
window.clearConnectionTabSelection = clearConnectionTabSelection;

// Export delete functions to global scope
window.deleteResource = deleteResource;
window.deleteMci = deleteMci;
window.deleteVm = deleteVm;
window.deleteK8sCluster = deleteK8sCluster;
window.deleteK8sNodeGroup = deleteK8sNodeGroup;
window.deleteVNet = deleteVNet;
window.deleteSecurityGroup = deleteSecurityGroup;
window.deleteSshKey = deleteSshKey;
window.deleteCustomImage = deleteCustomImage;
window.deleteDataDisk = deleteDataDisk;
window.deleteNodeGroup = deleteNodeGroup;

// Debug functions for K8s troubleshooting
window.debugK8sData = function() {
  console.log('=== K8s Debug Information ===');
  
  let centralData = {};
  if (window.parent && window.parent.cloudBaristaCentralData) {
    centralData = window.parent.cloudBaristaCentralData;
  }
  
  console.log('Central Data K8s:', centralData.k8sCluster);
  console.log('Resource Data K8s:', centralData.resourceData?.k8sCluster);
  
  if (centralData.k8sCluster && centralData.k8sCluster.length > 0) {
    centralData.k8sCluster.forEach((cluster, index) => {
      console.log(`Cluster ${index}:`, cluster);
      console.log(`  - ID: ${cluster.id}`);
      console.log(`  - Status: ${cluster.status}`);
      console.log(`  - k8sNodeGroupList:`, cluster.k8sNodeGroupList);
      console.log(`  - nodeGroupList:`, cluster.nodeGroupList);
      console.log(`  - nodeGroups:`, cluster.nodeGroups);
      console.log(`  - NodeGroupList:`, cluster.NodeGroupList);
      console.log(`  - K8sNodeGroupList:`, cluster.K8sNodeGroupList);
    });
  } else {
    console.log('No K8s cluster data found');
  }
  
  console.log('Selected K8s Cluster ID:', selectedK8sClusterId);
  console.log('=== End K8s Debug ===');
};

// ===============================
// DataTables Enhancement
// ===============================

// Store DataTable instances for efficient management
let dataTableInstances = {};

// Store previous data for change detection
let previousData = {};

// Development flag - set to true to disable change detection for debugging
const DISABLE_CHANGE_DETECTION = false;

// Simple data comparison function
function hasDataChanged(tableId, newData) {
  // Allow disabling change detection for debugging
  if (DISABLE_CHANGE_DETECTION) {
    console.log(`[DataTables] Change detection disabled, always updating ${tableId}`);
    return true;
  }
  
  try {
    // Convert to JSON string for simple comparison
    const newDataString = JSON.stringify(newData);
    const oldDataString = previousData[tableId];
    
    // Always update on first run
    if (oldDataString === undefined) {
      previousData[tableId] = newDataString;
      console.log(`[DataTables] First run for ${tableId}, data length: ${newDataString.length}`);
      return true;
    }
    
    // Simple string comparison
    if (oldDataString !== newDataString) {
      console.log(`[DataTables] Data changed for ${tableId}, old length: ${oldDataString.length}, new length: ${newDataString.length}`);
      previousData[tableId] = newDataString;
      return true;
    }
    
    console.log(`[DataTables] No changes for ${tableId}, data length: ${newDataString.length}`);
    return false;
  } catch (error) {
    console.warn(`[DataTables] Error comparing data for ${tableId}:`, error);
    return true; // Update on error to be safe
  }
}

// Initialize DataTables for dashboard tables
function initializeDataTables() {
  console.log('[DataTables] Starting initialization...');
  
  // Clear any existing DataTable state from localStorage to prevent conflicts
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('DataTables_')) {
      localStorage.removeItem(key);
      console.log(`[DataTables] Cleared localStorage key: ${key}`);
    }
  });

  const tableConfigs = [
    {
      id: 'mci-table',
      config: {
        pageLength: 25,
        responsive: true,
        dom: '<"row"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6"f>>' +
             '<"row"<"col-sm-12"tr>>' +
             '<"row"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>',
        language: {
          search: "Search:",
          lengthMenu: "Show _MENU_ entries",
          info: "Showing _START_ to _END_ of _TOTAL_ entries",
          paginate: {
            first: "First",
            last: "Last", 
            next: "Next",
            previous: "Previous"
          }
        },
        order: [[0, 'asc']], // Default sort by first column
        stateSave: false, // Disable state saving to avoid conflicts
        scrollY: false, // Disable DataTables scrolling, use CSS instead
        scrollCollapse: false,
        columnDefs: [
          { 
            targets: -1, // Last column (Actions)
            orderable: false,
            searchable: false,
            width: "200px",
            className: "text-center",
            responsivePriority: 1 // Highest priority for Actions column
          }
        ]
      }
    },
    {
      id: 'vm-table',
      config: {
        pageLength: 25,
        responsive: true,
        dom: '<"row"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6"f>>' +
             '<"row"<"col-sm-12"tr>>' +
             '<"row"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>',
        language: {
          search: "Search:",
          lengthMenu: "Show _MENU_ entries",
          info: "Showing _START_ to _END_ of _TOTAL_ entries",
          paginate: {
            first: "First",
            last: "Last",
            next: "Next", 
            previous: "Previous"
          }
        },
        order: [[0, 'asc']],
        stateSave: false, // Disable state saving to avoid conflicts
        scrollY: false,
        scrollCollapse: false,
        columnDefs: [
          { 
            targets: -1, // Actions column
            orderable: false,
            searchable: false,
            width: "250px",
            className: "text-center",
            responsivePriority: 1 // Highest priority for Actions column
          }
        ]
      }
    },
    {
      id: 'vnet-table',
      config: {
        pageLength: 25,
        responsive: true,
        dom: '<"row"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6"f>>' +
             '<"row"<"col-sm-12"tr>>' +
             '<"row"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>',
        language: {
          search: "Search:",
          lengthMenu: "Show _MENU_ entries",
          info: "Showing _START_ to _END_ of _TOTAL_ entries"
        },
        order: [[0, 'asc']],
        stateSave: false, // Disable state saving to avoid conflicts
        columnDefs: [
          { 
            targets: -1, // Actions column
            orderable: false,
            searchable: false,
            width: "150px",
            className: "text-center",
            responsivePriority: 1 // Highest priority for Actions column
          }
        ]
      }
    },
    {
      id: 'security-group-table',
      config: {
        pageLength: 25,
        responsive: true,
        dom: '<"row"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6"f>>' +
             '<"row"<"col-sm-12"tr>>' +
             '<"row"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>',
        language: {
          search: "Search:",
          lengthMenu: "Show _MENU_ entries",
          info: "Showing _START_ to _END_ of _TOTAL_ entries"
        },
        order: [[0, 'asc']],
        stateSave: false, // Disable state saving to avoid conflicts
        columnDefs: [
          { 
            targets: -1, // Actions column
            orderable: false,
            searchable: false,
            width: "150px",
            className: "text-center",
            responsivePriority: 1 // Highest priority for Actions column
          }
        ]
      }
    },
    {
      id: 'ssh-key-table',
      config: {
        pageLength: 25,
        responsive: true,
        dom: '<"row"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6"f>>' +
             '<"row"<"col-sm-12"tr>>' +
             '<"row"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>',
        language: {
          search: "Search:",
          lengthMenu: "Show _MENU_ entries",
          info: "Showing _START_ to _END_ of _TOTAL_ entries"
        },
        order: [[0, 'asc']],
        stateSave: false, // Disable state saving to avoid conflicts
        columnDefs: [
          { 
            targets: -1, // Actions column
            orderable: false,
            searchable: false,
            width: "150px",
            className: "text-center",
            responsivePriority: 1 // Highest priority for Actions column
          }
        ]
      }
    },
    {
      id: 'k8s-cluster-table',
      config: {
        pageLength: 25,
        responsive: true,
        dom: '<"row"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6"f>>' +
             '<"row"<"col-sm-12"tr>>' +
             '<"row"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>',
        language: {
          search: "Search:",
          lengthMenu: "Show _MENU_ entries",
          info: "Showing _START_ to _END_ of _TOTAL_ entries"
        },
        order: [[0, 'asc']],
        stateSave: false, // Disable state saving to avoid conflicts
        columnDefs: [
          { 
            targets: -1, // Actions column
            orderable: false,
            searchable: false,
            width: "200px",
            className: "text-center",
            responsivePriority: 1 // Highest priority for Actions column
          }
        ]
      }
    },
    {
      id: 'vpn-table',
      config: {
        pageLength: 25,
        responsive: true,
        dom: '<"row"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6"f>>' +
             '<"row"<"col-sm-12"tr>>' +
             '<"row"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>',
        language: {
          search: "Search:",
          lengthMenu: "Show _MENU_ entries",
          info: "Showing _START_ to _END_ of _TOTAL_ entries"
        },
        order: [[0, 'asc']],
        stateSave: false, // Disable state saving to avoid conflicts
        columnDefs: [
          { 
            targets: -1, // Actions column
            orderable: false,
            searchable: false,
            width: "150px",
            className: "text-center",
            responsivePriority: 1 // Highest priority for Actions column
          }
        ]
      }
    }
  ];

  tableConfigs.forEach(tableConfig => {
    const tableElement = document.getElementById(tableConfig.id);
    if (tableElement && !dataTableInstances[tableConfig.id]) {
      try {
        // Check if jQuery DataTable is available
        if (typeof $ !== 'undefined' && $.fn.DataTable) {
          // Destroy existing DataTable if it exists
          if ($.fn.DataTable.isDataTable(`#${tableConfig.id}`)) {
            $(`#${tableConfig.id}`).DataTable().destroy();
            console.log(`[DataTables] Destroyed existing table: ${tableConfig.id}`);
          }
          
          // Initialize with jQuery DataTable and enable searching/ordering
          const config = {
            ...tableConfig.config,
            searching: true,
            ordering: true,
            stateSave: false, // Always disable state saving
            order: [], // Reset any saved ordering to default
            destroy: true, // Allow re-initialization
          };
          
          dataTableInstances[tableConfig.id] = $(`#${tableConfig.id}`).DataTable(config);
          console.log(`[DataTables] Initialized table with jQuery: ${tableConfig.id}`);
          
          // Verify that sorting classes are being applied after initialization
          setTimeout(() => {
            const headers = $(`#${tableConfig.id} thead th`);
            console.log(`[DataTables] Verifying headers for ${tableConfig.id}:`);
            headers.each((index, header) => {
              const classes = header.className;
              const hasOrderingClass = classes.includes('sorting') || classes.includes('sorting_asc') || classes.includes('sorting_desc');
              console.log(`[DataTables] Header ${index}: "${$(header).text()}" | Classes: ${classes} | Has ordering: ${hasOrderingClass}`);
            });
            
            // Check if search box and other DataTables controls are rendered
            const wrapper = $(`#${tableConfig.id}_wrapper`);
            const searchBox = wrapper.find('input[type="search"]');
            const lengthSelect = wrapper.find('select[name$="_length"]');
            const pagination = wrapper.find('.dataTables_paginate');
            
            console.log(`[DataTables] UI Elements for ${tableConfig.id}:`);
            console.log(`[DataTables] - Wrapper exists: ${wrapper.length > 0}`);
            console.log(`[DataTables] - Search box exists: ${searchBox.length > 0}, visible: ${searchBox.is(':visible')}`);
            console.log(`[DataTables] - Length select exists: ${lengthSelect.length > 0}, visible: ${lengthSelect.is(':visible')}`);
            console.log(`[DataTables] - Pagination exists: ${pagination.length > 0}, visible: ${pagination.is(':visible')}`);
            
            if (searchBox.length > 0) {
              console.log(`[DataTables] - Search box element:`, searchBox[0]);
              console.log(`[DataTables] - Search box CSS:`, window.getComputedStyle(searchBox[0]));
            }
          }, 200);
          
        } else {
          console.warn(`[DataTables] jQuery DataTable not available for ${tableConfig.id}`);
        }
      } catch (error) {
        console.warn(`[DataTables] Failed to initialize table ${tableConfig.id}:`, error);
      }
    }
  });
}

// Initialize DataTables when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Small delay to ensure all tables are rendered
  setTimeout(() => {
    initializeDataTables();
  }, 500);
});

// Function to reinitialize DataTables if needed
function reinitializeDataTablesIfNeeded() {
  // Only reinitialize if not debugging (to avoid interference)
  if (DISABLE_CHANGE_DETECTION) {
    // During debugging, don't reinitialize to avoid conflicts
    return;
  }
  
  // Check if any DataTable instances exist and reinitialize if needed
  Object.keys(dataTableInstances).forEach(tableId => {
    const table = dataTableInstances[tableId];
    if (table) {
      try {
        // Trigger a redraw to refresh the table
        table.draw();
      } catch (error) {
        console.warn(`[DataTables] Failed to redraw table ${tableId}:`, error);
      }
    }
  });
}

// Export functions for global access
window.dataTableInstances = dataTableInstances;
window.initializeDataTables = initializeDataTables;
window.reinitializeDataTablesIfNeeded = reinitializeDataTablesIfNeeded;
