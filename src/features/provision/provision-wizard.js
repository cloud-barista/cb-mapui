/**
 * Infra Provisioning Wizard & Configuration Review Feature Module
 * @module features/provision
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import { tbApiBase, getConfig } from '../../core/api.js';
import { generateInfraName, escapeHtml } from '../../core/utils.js';

import { POPUP_STYLES } from '../../common/popup-styles.js';

const $ = (...args) => (window.$ || window.jQuery)(...args);
$.fn = (window.$ || window.jQuery)?.fn || {};

const typeInfo = window.typeInfo || 'info';
const typeError = window.typeError || 'error';

const setupCommandsPopup = (...args) => { if (window.setupCommandsPopup) window.setupCommandsPopup(...args); };
const collectPhases = (...args) => (window.collectPhases ? window.collectPhases(...args) : []);
const collectCommands = (...args) => (window.collectCommands ? window.collectCommands(...args) : []);
const updateReviewButtonState = (...args) => (window.updateReviewButtonState ? window.updateReviewButtonState(...args) : undefined);
const toggleBuildImageOptions = (...args) => (window.toggleBuildImageOptions ? window.toggleBuildImageOptions(...args) : undefined);
const getSelectedNodeGroups = (...args) => (window.getSelectedNodeGroups ? window.getSelectedNodeGroups(...args) : []);
const generateCommandsHtml = (...args) => (window.generateCommandsHtml ? window.generateCommandsHtml(...args) : '');
const generatePredefinedScriptsHtml = (...args) => (window.generatePredefinedScriptsHtml ? window.generatePredefinedScriptsHtml(...args) : '');
const generateLabelSelectorHtml = (...args) => (window.generateLabelSelectorHtml ? window.generateLabelSelectorHtml(...args) : '');
const showSnapshotManagementModal = (...args) => { if (window.showSnapshotManagementModal) window.showSnapshotManagementModal(...args); };

const addSpinnerTask = (name) => (window.addSpinnerTask ? window.addSpinnerTask(name) : name);
const removeSpinnerTask = (id) => { if (window.removeSpinnerTask) window.removeSpinnerTask(id); };
const errorAlert = (msg) => (window.errorAlert ? window.errorAlert(msg) : Swal.fire({ icon: 'error', title: msg, showConfirmButton: true }));
const successAlert = (msg) => (window.successAlert ? window.successAlert(msg) : Swal.fire({ icon: 'success', title: msg, showConfirmButton: false, timer: 2500 }));

const displayInfraDynamicResultGui = (...args) => { if (window.displayInfraDynamicResultGui) window.displayInfraDynamicResultGui(...args); };
const displayJsonData = (...args) => { if (window.displayJsonData) window.displayJsonData(...args); };
const generateRandomRequestId = (prefix, len) => (window.generateRandomRequestId ? window.generateRandomRequestId(prefix, len) : (prefix + Math.random().toString(36).substring(2, 2 + len)));
const addRequestIdToSelect = (id) => { if (window.addRequestIdToSelect) window.addRequestIdToSelect(id); };
const updateInfraList = () => { if (window.updateInfraList) window.updateInfraList(); };
const handleAxiosResponse = (res) => (window.handleAxiosResponse ? window.handleAxiosResponse(res) : res);

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

      displayInfraDynamicResultGui(res.data);
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
      "📦 Build Cloud-Agnostic Custom Image" :
      "🚀 Post-deployment Commands",
    width: 850,
    html: `
    ${POPUP_STYLES}
    <div id="dynamicContainer" class="popup-container">
      ${workflowInfoHtml}
      <div class="popup-section" style="background:#f8fbff; border:1px solid #b3d7ff;">
        <div class="popup-section-title" style="color:#0d6efd;">🎯 Scope</div>
        <div style="font-size:0.78rem; color:#495057;">
          Runs on the new Infra's nodes right after provisioning${buildAgnosticImage ?
            ' — the result is required before snapshotting, so it runs synchronously.' :
            '. Creation returns as soon as nodes are ready; watch the bootstrap live from the result popup.'}
        </div>
        <div class="popup-row" style="margin-top:8px;">
          <div class="popup-col" style="flex:0 0 auto;">
            <div class="popup-field">
              <label class="popup-label">Timeout</label>
              <div class="popup-inline">
                <input type="number" id="postCmdTimeout" class="popup-input" style="width:60px;" value="30" min="1" max="120">
                <span style="font-size:0.75rem; color:#666;">min</span>
              </div>
            </div>
          </div>
          <div class="popup-col" style="flex:0 0 auto;">
            <div class="popup-field">
              <label class="popup-label">SSH User</label>
              <input type="text" id="postCmdSshUser" class="popup-input" style="width:110px;" placeholder="auto"
                title="Leave blank so each node uses its own verified username (recommended for mixed images).">
            </div>
          </div>
        </div>
      </div>
      ${window.generateCommandComposerHtml({
        commands: ['', '', ''],
        showPhases: true,
        showLabelSelector: true,
        includeDeployOptions: false,
      })}
      ${buildAgnosticImage ? generateCustomImageSettingsHtml() : ''}
    </div>`,
    showCancelButton: true,
    confirmButtonText: buildAgnosticImage ? "🚀 Build Custom Images" : "Add & Create Infra",
    didOpen: () => setupCommandsPopup(10),
    preConfirm: () => {
      const phases = collectPhases();
      const commands = phases ? [] : collectCommands();
      const labelSelector = document.getElementById('labelSelector')?.value?.trim() || '';
      const timeoutMinutes = parseInt(document.getElementById('postCmdTimeout')?.value) || 0;
      const sshUserName = document.getElementById('postCmdSshUser')?.value?.trim() || '';
      const result = { commands, phases, labelSelector, timeoutMinutes, sshUserName };

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
      const cv = commandResult.value;
      // Options shared by both shapes (blank userName = per-node auto-resolution)
      const applyOpts = (target) => {
        if (cv.timeoutMinutes > 0) target.timeoutMinutes = cv.timeoutMinutes;
        if (cv.sshUserName) target.userName = cv.sshUserName;
        return target;
      };

      if (cv.phases && cv.phases.length > 0) {
        // Ordered phases (server runs them sequentially with per-phase targets)
        createInfraReq.postCommands = cv.phases.map(p => applyOpts(p));
        // Async: return once nodes are provisioned; watch the bootstrap via streaming
        if (!buildAgnosticImage) createInfraReq.postCommandAsync = true;
      } else if (cv.commands && cv.commands.length > 0) {
        const single = applyOpts({ command: cv.commands });
        if (cv.labelSelector) single.labelSelector = cv.labelSelector;
        createInfraReq.postCommands = [single];
        // Async: return once nodes are provisioned; watch the bootstrap via streaming
        // (image building needs the result before snapshotting, so it stays synchronous)
        if (!buildAgnosticImage) createInfraReq.postCommandAsync = true;
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
  var reviewUrl = `${tbApiBase()}/ns/${namespace}/infraDynamicReview`;
  
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
        
        // regionBreakdown is rebuilt from nodeReviews below using provider+region keys
        // to avoid counting same-named regions across different CSPs as one region.
        
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
        var nodeGroupRegions = {}; // nodeGroupName -> {provider, region}
        
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

          // Record provider+region for this nodegroup (first occurrence wins)
          if (!nodeGroupRegions[groupKey] && nodeReview.regionName) {
            nodeGroupRegions[groupKey] = {
              provider: nodeReview.providerName || '',
              region: nodeReview.regionName
            };
          }
          
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
      
      // Build regionBreakdown using provider+region keys to correctly distinguish
      // same-named regions across different CSPs (e.g., alibaba ap-northeast-2 vs aws ap-northeast-2)
      if (nodeGroupRegions) {
        Object.values(nodeGroupRegions).forEach(function(info) {
          var key = info.provider ? (info.provider + ' (' + info.region + ')') : info.region;
          resourceSummary.regionBreakdown[key] = (resourceSummary.regionBreakdown[key] || 0) + 1;
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

    // Helper function to format an individual issue item (warning or error) as a compact card
    function renderReviewIssueCard(issueText, type) {
      if (!issueText) return '';
      var isError = type === 'error';
      var typeColor = isError ? '#dc3545' : '#f59e0b';
      var icon = isError ? '❌' : '⚠️';

      // 1. Separate source prefix (e.g., "Node 1 (g1-aws-af-south-1):" or "Infra Status Warning:")
      var sourceTitle = "";
      var content = String(issueText);
      var prefixMatch = content.match(/^([^:]+):\s*(.*)$/s);
      if (prefixMatch && (prefixMatch[1].startsWith('Node') || prefixMatch[1].startsWith('Infra Status') || prefixMatch[1].startsWith('Recommendation'))) {
        sourceTitle = prefixMatch[1].trim();
        content = prefixMatch[2].trim();
      } else {
        sourceTitle = isError ? "Configuration Error" : "Configuration Warning";
      }

      // 2. Separate recent failure examples / raw CSP error logs if present
      var rawLog = null;
      var logMatch = content.match(/Recent failure examples?:\s*(.*)$/is);
      if (logMatch) {
        content = content.substring(0, logMatch.index).trim();
        rawLog = logMatch[1].trim();
      }

      // 3. Detect issue badges
      var badges = [];
      if (/AccountQuota|VcpuLimitExceeded/i.test(issueText)) {
        badges.push(`<span style="display: inline-block; padding: 2px 7px; background: #fff3cd; color: #856404; border: 1px solid #ffeeba; border-radius: 10px; font-size: 0.73em; font-weight: 600;">Quota Limit</span>`);
      }
      if (/ZoneCapacity|RegionCapacity|InsufficientInstanceCapacity/i.test(issueText)) {
        badges.push(`<span style="display: inline-block; padding: 2px 7px; background: #cce5ff; color: #004085; border: 1px solid #b8daff; border-radius: 10px; font-size: 0.73em; font-weight: 600;">Capacity</span>`);
      }
      if (/Throttling|RequestLimitExceeded/i.test(issueText)) {
        badges.push(`<span style="display: inline-block; padding: 2px 7px; background: #e2e3e5; color: #383d41; border: 1px solid #d6d8db; border-radius: 10px; font-size: 0.73em; font-weight: 600;">Throttling</span>`);
      }
      if (/ImageSpecMismatch|InvalidRequest/i.test(issueText)) {
        badges.push(`<span style="display: inline-block; padding: 2px 7px; background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; border-radius: 10px; font-size: 0.73em; font-weight: 600;">Incompatible</span>`);
      }
      var rateMatch = content.match(/(\d+%\s*failure rate)/i);
      if (rateMatch) {
        badges.push(`<span style="display: inline-block; padding: 2px 7px; background: #fee2e2; color: #991b1b; border-radius: 10px; font-size: 0.73em; font-weight: 600;">${rateMatch[1]}</span>`);
      }

      // 4. Compact long region lists if present in Infra Status Warning
      if (content.includes('Regions: [')) {
        content = content.replace(/Regions:\s*\[([^\]]+)\]/g, function(match, regList) {
          var regs = regList.trim().split(/\s+/);
          if (regs.length > 4) {
            return `Regions: <strong>${regs.length} regions</strong> <details style="display:inline-block; margin-left:4px;"><summary style="cursor:pointer; color:#007bff; font-size:0.85em; outline:none;">View list</summary><div style="display:flex; flex-wrap:wrap; gap:3px; margin-top:4px; max-width:600px;">${regs.map(r => `<span style="padding:1px 5px; background:#e9ecef; border-radius:3px; font-size:0.75em; color:#495057;">${r}</span>`).join('')}</div></details>`;
          }
          return match;
        });
      }

      // Clean trailing punctuation
      content = content.replace(/[;,\s]+$/, '');

      // 5. Build raw log collapsible section
      var rawLogHtml = '';
      if (rawLog) {
        var rawLogItems = rawLog.split('; ').filter(Boolean);
        var exampleCount = rawLogItems.length > 1 ? ` (${rawLogItems.length} events)` : '';
        rawLogHtml = `
          <details style="margin-top: 6px; text-align: left;">
            <summary style="cursor: pointer; font-size: 0.78em; color: #007bff; font-weight: 600; outline: none; user-select: none;">
              🔍 View failure logs${exampleCount}
            </summary>
            <div style="margin-top: 5px; padding: 8px 10px; background: #1e1e1e; color: #d4d4d4; border-radius: 4px; font-family: SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.73em; line-height: 1.4; max-height: 120px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; border: 1px solid #333;">
              ${escapeHtml(rawLog)}
            </div>
          </details>
        `;
      }

      return `
        <div style="margin-bottom: 8px; padding: 8px 12px; background: #ffffff; border-radius: 5px; border: 1px solid #e2e8f0; border-left: 4px solid ${typeColor}; box-shadow: 0 1px 2px rgba(0,0,0,0.03); text-align: left;">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; margin-bottom: 4px;">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <span style="font-size: 0.9em;">${icon}</span>
              <strong style="font-size: 0.88em; color: #2d3748;">${sourceTitle}</strong>
              ${badges.join(' ')}
            </div>
          </div>
          <div style="font-size: 0.83em; color: #4a5568; line-height: 1.45; word-break: break-word;">
            ${content}
          </div>
          ${rawLogHtml}
        </div>
      `;
    }

    // Top Dashboard KPI Summary Banner
    var overallStatus = reviewData.overallStatus || "Unknown";
    var isWarning = overallStatus.toLowerCase().includes("warning");
    var isError = overallStatus.toLowerCase().includes("error") || validationStatus === "error";
    var isSuccess = !isWarning && !isError;

    var statusBg = isSuccess ? "#f0fdf4" : isWarning ? "#fffbeb" : "#fef2f2";
    var statusBorder = isSuccess ? "#22c55e" : isWarning ? "#f59e0b" : "#ef4444";
    var statusColor = isSuccess ? "#16a34a" : isWarning ? "#d97706" : "#dc2626";
    var statusIcon = isSuccess ? "✅" : isWarning ? "⚠️" : "❌";

    var isViable = reviewData.creationViable === true;
    var viableText = reviewData.creationViable ? "Yes" : (reviewData.creationViable === false ? "No" : "N/A");
    var viableBg = isViable ? "#f0fdf4" : "#fef2f2";
    var viableBorder = isViable ? "#22c55e" : "#ef4444";
    var viableColor = isViable ? "#16a34a" : "#dc2626";
    var viableIcon = isViable ? "✅" : "❌";

    var infraName = reviewData.infraName || (createInfraReq && createInfraReq.name) || "N/A";
    var nodeScaleCount = reviewData.totalNodeCount || totalNodeScale || "N/A";
    var estCost = reviewData.estimatedCost || (totalCost ? `$${totalCost.toFixed(4)}/hour` : "N/A");

    var topDashboardHtml = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; margin: 4px 0 12px 0;">
        <div style="padding: 8px 12px; background: ${statusBg}; border-radius: 6px; border-left: 4px solid ${statusBorder}; text-align: left; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
          <div style="font-size: 0.72em; text-transform: uppercase; color: #6b7280; font-weight: 600;">Overall Status</div>
          <div style="font-size: 0.95em; font-weight: 700; color: ${statusColor}; margin-top: 2px;">${statusIcon} ${overallStatus}</div>
        </div>
        <div style="padding: 8px 12px; background: ${viableBg}; border-radius: 6px; border-left: 4px solid ${viableBorder}; text-align: left; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
          <div style="font-size: 0.72em; text-transform: uppercase; color: #6b7280; font-weight: 600;">Creation Viable</div>
          <div style="font-size: 0.95em; font-weight: 700; color: ${viableColor}; margin-top: 2px;">${viableIcon} ${viableText}</div>
        </div>
        <div style="padding: 8px 12px; background: #f8fafc; border-radius: 6px; border-left: 4px solid #64748b; text-align: left; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
          <div style="font-size: 0.72em; text-transform: uppercase; color: #6b7280; font-weight: 600;">Infra Name</div>
          <div style="font-size: 0.95em; font-weight: 700; color: #1e293b; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(infraName)}">${escapeHtml(infraName)}</div>
        </div>
        <div style="padding: 8px 12px; background: #f8fafc; border-radius: 6px; border-left: 4px solid #3b82f6; text-align: left; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
          <div style="font-size: 0.72em; text-transform: uppercase; color: #6b7280; font-weight: 600;">Scale</div>
          <div style="font-size: 0.95em; font-weight: 700; color: #2563eb; margin-top: 2px;">🖥️ ${nodeScaleCount} NodeGroups</div>
        </div>
        <div style="padding: 8px 12px; background: #f8fafc; border-radius: 6px; border-left: 4px solid #10b981; text-align: left; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
          <div style="font-size: 0.72em; text-transform: uppercase; color: #6b7280; font-weight: 600;">Estimated Cost</div>
          <div style="font-size: 0.95em; font-weight: 700; color: #059669; margin-top: 2px;">💰 ${estCost}</div>
        </div>
      </div>
    `;

    // Extract issue category summary chips
    var quotaCount = 0;
    var capacityCount = 0;
    var throttledCount = 0;
    var incompCount = 0;
    warnings.concat(errors).forEach(item => {
      if (/AccountQuota|VcpuLimitExceeded/i.test(item)) quotaCount++;
      if (/ZoneCapacity|RegionCapacity|InsufficientInstanceCapacity/i.test(item)) capacityCount++;
      if (/Throttling|RequestLimitExceeded/i.test(item)) throttledCount++;
      if (/ImageSpecMismatch|InvalidRequest/i.test(item)) incompCount++;
    });
    var issueChips = [];
    if (quotaCount > 0) issueChips.push(`<span style="padding: 2px 7px; background: #fff3cd; color: #856404; border: 1px solid #ffeeba; border-radius: 10px; font-size: 0.74em; font-weight: 600;">📌 Quota: ${quotaCount}</span>`);
    if (capacityCount > 0) issueChips.push(`<span style="padding: 2px 7px; background: #cce5ff; color: #004085; border: 1px solid #b8daff; border-radius: 10px; font-size: 0.74em; font-weight: 600;">📌 Capacity: ${capacityCount}</span>`);
    if (throttledCount > 0) issueChips.push(`<span style="padding: 2px 7px; background: #e2e3e5; color: #383d41; border: 1px solid #d6d8db; border-radius: 10px; font-size: 0.74em; font-weight: 600;">📌 Throttling: ${throttledCount}</span>`);
    if (incompCount > 0) issueChips.push(`<span style="padding: 2px 7px; background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; border-radius: 10px; font-size: 0.74em; font-weight: 600;">📌 Incompatible: ${incompCount}</span>`);

    // Build validation summary HTML
    var validationSummaryHtml = "";
    if (validationStatus === "success" && warnings.length === 0 && errors.length === 0) {
      validationSummaryHtml = `
        <div style="margin: 12px 0; padding: 12px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; text-align: left;">
          <h4 style="color: #16a34a; margin: 0 0 4px 0; font-size: 0.95em; font-weight: 700;">✅ Configuration Valid</h4>
          <p style="color: #4b5563; margin: 0; font-size: 0.85em;">Your Infra configuration has been validated successfully. All resources can be provisioned as configured.</p>
        </div>
      `;
    } else {
      if (errors.length > 0) {
        validationSummaryHtml += `
          <div style="margin: 10px 0; padding: 12px; background-color: #fff5f5; border: 1px solid #fed7d7; border-radius: 6px; text-align: left;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
              <h4 style="color: #dc3545; margin: 0; font-size: 0.95em; font-weight: 700;">❌ Configuration Errors (${errors.length})</h4>
              <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                ${issueChips.join('')}
              </div>
            </div>
            <div style="max-height: 240px; overflow-y: auto; padding-right: 4px;">
              ${errors.map(err => renderReviewIssueCard(err, 'error')).join('')}
            </div>
          </div>
        `;
      }
      
      if (warnings.length > 0) {
        validationSummaryHtml += `
          <div style="margin: 10px 0; padding: 12px; background-color: #fffaf0; border: 1px solid #feebc8; border-radius: 6px; text-align: left;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
              <h4 style="color: #d97706; margin: 0; font-size: 0.95em; font-weight: 700;">⚠️ Configuration Warnings (${warnings.length})</h4>
              <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                ${issueChips.join('')}
              </div>
            </div>
            <div style="max-height: 260px; overflow-y: auto; padding-right: 4px;">
              ${warnings.map(warn => renderReviewIssueCard(warn, 'warning')).join('')}
            </div>
          </div>
        `;
      }
    }

    // Overall Message & Policy notice (compact)
    var infraNoticeHtml = "";
    var noticeItems = [];
    if (reviewData.overallMessage) {
      var cleanMsg = reviewData.overallMessage;
      if (cleanMsg.includes('Regions: [')) {
        cleanMsg = cleanMsg.replace(/Regions:\s*\[([^\]]+)\]/g, function(match, regList) {
          var regs = regList.trim().split(/\s+/);
          if (regs.length > 4) {
            return `Regions: <strong>${regs.length} regions</strong> <details style="display:inline-block; margin-left:4px;"><summary style="cursor:pointer; color:#007bff; font-size:0.85em; outline:none;">View list</summary><div style="display:flex; flex-wrap:wrap; gap:3px; margin-top:4px; max-width:600px;">${regs.map(r => `<span style="padding:1px 5px; background:#e9ecef; border-radius:3px; font-size:0.75em; color:#495057;">${r}</span>`).join('')}</div></details>`;
          }
          return match;
        });
      }
      noticeItems.push(`<div style="padding: 6px 10px; background: #eff6ff; border-radius: 4px; border-left: 3px solid #3b82f6; font-size: 0.84em; color: #1e3a8a;">💬 ${cleanMsg}</div>`);
    }
    if (reviewData.policyOnPartialFailure) {
      noticeItems.push(`<div style="padding: 6px 10px; background: #f8fafc; border-radius: 4px; border-left: 3px solid #64748b; font-size: 0.82em; color: #475569;">⚙️ <strong>Failure Policy:</strong> ${reviewData.policyOnPartialFailure}${reviewData.policyDescription ? ` (${reviewData.policyDescription})` : ''}</div>`);
    }
    if (noticeItems.length > 0) {
      infraNoticeHtml = `
        <div style="display: flex; flex-direction: column; gap: 6px; margin: 8px 0; text-align: left;">
          ${noticeItems.join('')}
        </div>
      `;
    }

    // Recommendations HTML (compact card list)
    var recommendationsHtml = "";
    if (reviewData.recommendations && reviewData.recommendations.length > 0) {
      recommendationsHtml = `
        <div style="margin: 10px 0; text-align: left;">
          <details ${reviewData.recommendations.length <= 3 ? 'open' : ''}>
            <summary style="font-weight: 600; font-size: 0.9em; color: #334155; cursor: pointer; margin-bottom: 6px; outline: none;">
              💡 Recommendations (${reviewData.recommendations.length})
            </summary>
            <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 6px;">
              ${reviewData.recommendations.map(rec => `
                <div style="padding: 6px 10px; background: #fffbeb; border-radius: 4px; border-left: 3px solid #f59e0b; font-size: 0.83em; color: #78350f; display: flex; align-items: flex-start; gap: 6px;">
                  <span>💡</span>
                  <span style="line-height: 1.4;">${escapeHtml(rec)}</span>
                </div>
              `).join('')}
            </div>
          </details>
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
                `<span style="margin-right: 12px; display: inline-flex; align-items: center; gap: 4px;">${window.renderCspWithIconHtml ? window.renderCspWithIconHtml(provider, { size: 15, bold: true }) : '<strong>' + window.escapeHtml(provider) + '</strong>'}: ${count}</span>`
              ).join('')}
            </td>
          </tr>` : ''}
          ${Object.keys(resourceSummary.regionBreakdown).length > 0 ? `
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px; color: #666;">Regions</td>
            <td style="border: 1px solid #ddd; padding: 8px; color: #333;">
              ${Object.entries(resourceSummary.regionBreakdown).map(([region, count]) =>
                `<span style="margin-right: 10px;"><strong>${window.escapeHtml(region)}:</strong> ${count}</span>`
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
                    <div style="display: flex; align-items: center; gap: 12px; font-size: 0.8em; color: #228b22;">
                      ${provider ? `<div style="display:inline-flex;align-items:center;gap:4px;">🏢 <strong>Provider:</strong> ${window.renderCspWithIconHtml ? window.renderCspWithIconHtml(provider, { size: 14 }) : provider}</div>` : ''}
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
                  `<span style="display: inline-block; margin: 2px 4px; padding: 3px 8px; background: #f0f8ff; border: 1px solid #007bff; border-radius: 12px; font-size: 0.8em; color: #007bff;">${window.escapeHtml(provider)}: ${count}</span>`
                ).join('')}
              </div>
            </div>
          ` : ''}

          ${Object.keys(resourceSummary.regionBreakdown).length > 0 ? `
            <div style="margin: 8px 0;">
              <strong style="font-size: 0.9em; color: #333;">Region Distribution:</strong>
              <div style="margin-top: 4px;">
                ${Object.entries(resourceSummary.regionBreakdown).map(([region, count]) =>
                  `<span style="display: inline-block; margin: 2px 4px; padding: 3px 8px; background: #f0f8f0; border: 1px solid #28a745; border-radius: 12px; font-size: 0.8em; color: #28a745;">${window.escapeHtml(region)}: ${count}</span>`
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
        ${topDashboardHtml}
        ${infraNoticeHtml}
        ${validationSummaryHtml}
        ${recommendationsHtml}
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
            <div style="margin-top: 16px;">${initScriptSectionHtml(createInfraReq.nodeGroups)}</div>
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
        loadInitScriptTemplateOptions().then(() => {
          prefillInitScriptForm(createInfraReq.initScript, createInfraReq.nodeGroups);
          window._initScriptFormSnapshot = JSON.stringify(collectInitScript() ?? null);
          window._initScriptGroupSnapshot = JSON.stringify(collectInitScriptGroups() || {});
        });
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
        const collected = collectInitScript();
        if (collected === false) return false;
        const groups = collectInitScriptGroups();
        if (groups === false) return false;
        const untouched = JSON.stringify(collected ?? null) === window._initScriptFormSnapshot;
        const initScript = untouched ? createInfraReq.initScript : collected;
        if (validationStatus !== "error") {
          return {
            hold: document.getElementById('hold-checkbox') ? document.getElementById('hold-checkbox').checked : false,
            addPostCommand: document.getElementById('postcommand-checkbox') ? document.getElementById('postcommand-checkbox').checked : false,
            buildAgnosticImage: document.getElementById('buildimage-checkbox') ? document.getElementById('buildimage-checkbox').checked : false,
            initScript, initScriptGroups: groups
          };
        }
        return { initScript, initScriptGroups: groups };
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
              const options = result.value || { hold: false, addPostCommand: false };
              applyInitScriptChoice(createInfraReq, options);
              
              var infraCreationUrl = finalUrl;
              
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
          const options = result.value || { hold: false, addPostCommand: false };
          applyInitScriptChoice(createInfraReq, options);
          
          var infraCreationUrl = finalUrl;
          
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
        proceedWithInfraCreation(createInfraReq, finalUrl, username, password);
      }
    });
  });
}

// Function to review Infra with selected NodeGroups only
function reviewWithSelectedNodeGroups(selectedNodeGroups) {
  // Get current Infra request data
  const cfg = getConfig();
  var hostname = window.configHostname || cfg.hostname || '';
  var port = window.configPort || cfg.port || '';
  var username = window.configUsername || cfg.username || '';
  var password = window.configPassword || cfg.password || '';
  var namespace = window.configNamespace || cfg.namespace || '';
  
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
  
  var finalUrl = `${tbApiBase()}/ns/${namespace}/infraDynamic`;
  
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
    const cfg = getConfig();
    var hostname = window.configHostname || cfg.hostname || '';
    var port = window.configPort || cfg.port || '';
    var username = window.configUsername || cfg.username || '';
    var password = window.configPassword || cfg.password || '';
    var namespace = window.configNamespace || cfg.namespace || '';

    var url = `${tbApiBase()}/ns/${namespace}/infraDynamic`;

    var createInfraReq = JSON.parse(JSON.stringify(createInfraReqTmplt));
    createInfraReq.name = "mc-" + generateInfraName();
    createInfraReq.nodeGroups = Array.from(nodeGroupRequestFromSpecList);
    // Settings loaded from an Infra template (init script, SG/vNet templates, post commands, ...)
    if (window.infraConfigFromTemplate?.settings) {
      Object.assign(createInfraReq, JSON.parse(JSON.stringify(window.infraConfigFromTemplate.settings)));
    }
    let totalCost = 0;
    let totalNodeScale = 0;

    var nodeGroupReqString = "";
    for (let i = 0; i < createInfraReq.nodeGroups.length; i++) {

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


function isNormalInteger(str) {
  var n = Math.floor(Number(str));
  return n !== Infinity && String(n) === str && n > 0;
}

var createInfraReqTmplt = {
  description: "Made via cb-mapui",
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
window.createInfraReqVmTmplt = createInfraReqVmTmplt;

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
      templateSettingsHtml(createInfraReq) +
      "<br><br><input type='checkbox' id='hold-checkbox'> Hold Node provisioning of the Infra" +
      "<br><input type='checkbox' id='postcommand-checkbox'> Add post-deployment commands" +
      "</font>" + '<div style="text-align:left;margin-top:16px;padding:16px;background-color:#f8f9fa;border:1px solid #ddd;border-radius:5px;">' + initScriptSectionHtml(createInfraReq.nodeGroups) + '</div>',
    showCancelButton: true,
    confirmButtonText: "Confirm",
    scrollbarPadding: false,
    didOpen: () => loadInitScriptTemplateOptions().then(() => {
      prefillInitScriptForm(createInfraReq.initScript, createInfraReq.nodeGroups);
      window._initScriptFormSnapshot = JSON.stringify(collectInitScript() ?? null);
      window._initScriptGroupSnapshot = JSON.stringify(collectInitScriptGroups() || {});
    }),
    preConfirm: () => {
      const collected = collectInitScript();
      if (collected === false) return false;
      // An untouched form keeps the loaded initScript as is (it may hold inline steps the form cannot show)
      const untouched = JSON.stringify(collected ?? null) === window._initScriptFormSnapshot;
      const groups = collectInitScriptGroups();
      if (groups === false) return false;
      return {
        hold: document.getElementById('hold-checkbox').checked,
        addPostCommand: document.getElementById('postcommand-checkbox').checked,
        initScript: untouched ? createInfraReq.initScript : collected,
        initScriptGroups: groups,
      };
    }
  }).then((result) => {
    if (result.isConfirmed) {
      if (result.value.initScript) createInfraReq.initScript = result.value.initScript;
      else delete createInfraReq.initScript;
      applyInitScriptGroups(createInfraReq, result.value.initScriptGroups, window._initScriptGroupSnapshot);
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
              ${generateCommandsHtml(['', '', ''])}
              ${generatePredefinedScriptsHtml(false)}
              ${generateLabelSelectorHtml(true)}
            </div>`,
          showCancelButton: true,
          confirmButtonText: "Confirm",
          didOpen: () => setupCommandsPopup(10),
          preConfirm: () => collectCommands(),
        }).then((cmdResult) => {
          if (cmdResult.isConfirmed && cmdResult.value && cmdResult.value.length > 0) {
            // Single command set = one phase
            createInfraReq.postCommands = [{ command: cmdResult.value }];
            // Async: creation returns once nodes are provisioned (watch bootstrap live)
            createInfraReq.postCommandAsync = true;
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

// ---- Init script (first boot) section of the final confirmation ----
// Leaving everything at its default keeps the request without initScript, which CB-Tumblebug
// treats as "mode default": the cb-user account is created and the node reports when it has booted.
function initScriptSectionHtml(nodeGroups) {
  const esc = window.escapeHtml || (x => String(x));
  // Same visual system as the Deployment Options block: one field style, 0.9em labels, 0.8em hints
  const F = 'font-size:0.9em;padding:4px 8px;border:1px solid #ced4da;border-radius:4px;background:#fff;color:#333;font-family:inherit;box-sizing:border-box;';
  const L = 'font-size:0.9em;color:#333;font-weight:500;';
  const H = 'font-size:0.8em;color:#666;';
  const groups = (nodeGroups || []).filter(ng => ng && ng.name);
  const groupRows = groups.map(ng => `
          <div class="init-group-row" data-group="${esc(ng.name)}" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:6px 0;">
            <b style="${L}min-width:100px;" title="${esc(ng.name)}">${esc(ng.name)}</b>
            <select class="init-group-template" style="${F}flex:1;min-width:160px;"><option value="">(none)</option></select>
            <input class="init-group-env" placeholder="ROLE=web, X=1" style="${F}width:200px;">
            <details style="width:100%;"><summary style="cursor:pointer;${H}">Inline script for ${esc(ng.name)}</summary>
              <textarea class="init-group-inline" rows="3" placeholder="#!/bin/bash" style="${F}width:100%;margin-top:4px;font-family:monospace;font-size:0.85em;"></textarea>
            </details>
          </div>`).join('');
  const perGroup = groups.length > 1 ? `
        <div style="margin:8px 0;">
          <label style="${L}display:flex;align-items:center;cursor:pointer;margin:0;">
            <input type="checkbox" id="initScriptPerGroup" onchange="toggleInitScriptPerGroup(this.checked)" style="margin-right:8px;transform:scale(1.2);">Customize per NodeGroup
          </label>
          <div style="${H}margin-left:24px;margin-top:4px;">Adds template or inline steps after the Infra-level steps, for that NodeGroup only.</div>
          <div id="initScriptGroupRows" style="display:none;margin:8px 0 0 24px;">${groupRows}</div>
        </div>` : '';
  return `
    <details open>
      <summary style="cursor:pointer;list-style:none;">
        <h6 style="margin:0;color:#007bff;font-size:1em;font-weight:600;border-bottom:1px solid #ddd;padding-bottom:4px;display:inline-flex;align-items:center;gap:6px;">
          <span style="font-size:0.85em;color:#888;">▸</span>
          🧩 Init Script
          <span style="font-size:0.8em;font-weight:normal;color:#888;">(first boot — account, template steps, result report)</span>
        </h6>
      </summary>
      <div style="margin-top:12px;">
        <div style="margin:8px 0;display:flex;gap:16px;flex-wrap:wrap;align-items:center;">
          <label style="${L}display:flex;align-items:center;gap:6px;margin:0;">Mode
            <select id="initScriptMode" style="${F}">
              <option value="default" selected>default (create cb-user, run steps)</option>
              <option value="custom">custom (steps only, keep image account)</option>
              <option value="none">none (CB-Spider default user data)</option>
            </select>
          </label>
          <label style="${L}display:flex;align-items:center;gap:6px;margin:0;">User
            <input id="initScriptUser" value="cb-user" style="${F}width:120px;">
          </label>
          <label style="${L}display:flex;align-items:center;cursor:pointer;margin:0;">
            <input type="checkbox" id="initScriptNotify" checked style="margin-right:8px;transform:scale(1.2);">Report result to notifier
          </label>
        </div>
        <div style="margin:8px 0;">
          <label for="initScriptTemplate" style="${L}display:block;margin-bottom:4px;">Template</label>
          <select id="initScriptTemplate" style="${F}width:100%;">
            <option value="">(none: account only)</option>
          </select>
          <div style="${H}margin-top:4px;">Its steps run first, in order. Templates come from this namespace and system.</div>
        </div>
        <details style="margin:8px 0;">
          <summary style="cursor:pointer;${L}">Inline script and environment variables</summary>
          <textarea id="initScriptInline" rows="4" placeholder="#!/bin/bash&#10;# runs after the template's steps" style="${F}width:100%;margin-top:6px;font-family:monospace;font-size:0.85em;"></textarea>
          <input id="initScriptEnv" placeholder="ROLE=web, OTEL_ENDPOINT=https://otel.example.com" style="${F}width:100%;margin-top:6px;">
          <div style="${H}margin-top:4px;">The inline script runs after the template steps. Env is exported to every step as KEY=VALUE pairs.</div>
        </details>${perGroup}
      </div>
    </details>`;
}

// Lines for settings that came from a loaded Infra template, so the user sees them before confirming
function templateSettingsHtml(req) {
  const src = window.infraConfigFromTemplate;
  const items = [];
  if (req.sgTemplateId) items.push(`SG template: <b>${req.sgTemplateId}</b>`);
  if (req.vNetTemplateId) items.push(`vNet template: <b>${req.vNetTemplateId}</b>`);
  if (req.postCommands?.length) items.push(`post-deployment commands: <b>${req.postCommands.length} phase(s)</b>`);
  if (items.length === 0) return '';
  return `<div style="text-align:left;margin-top:10px;font-size:13px;color:#475569;">📋 From template${src ? ` <b>${src.templateId}</b>` : ''}: ${items.join(' · ')}</div>`;
}

// Fills the init script form from a request (e.g. loaded from an Infra template)
function prefillInitScriptForm(is, nodeGroups) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  // group rows: a loaded template may carry per-group additions
  const withGroup = (nodeGroups || []).filter(ng => ng && ng.initScript);
  if (withGroup.length > 0 && document.getElementById('initScriptPerGroup')) {
    document.getElementById('initScriptPerGroup').checked = true;
    window.toggleInitScriptPerGroup(true);
    withGroup.forEach(ng => {
      const row = document.querySelector(`.init-group-row[data-group="${CSS.escape(ng.name)}"]`);
      if (!row) return;
      const g = ng.initScript;
      row.querySelector('.init-group-template').value = g.templateId || '';
      row.querySelector('.init-group-inline').value = g.script || '';
      row.querySelector('.init-group-env').value = Object.entries(g.env || {}).map(([k, v]) => `${k}=${v}`).join(', ');
      if (g.script) row.querySelector('details').open = true;
      if (g.mode || g.userName || g.notify === false) {
        row.querySelector('b').title = `replaces the Infra-level init script (mode ${g.mode || 'default'})`;
        row.querySelector('b').textContent = ng.name + ' *';
      }
    });
  }
  if (!is) return;
  set('initScriptMode', is.mode || 'default');
  set('initScriptUser', is.userName || 'cb-user');
  const notify = document.getElementById('initScriptNotify'); if (notify) notify.checked = is.notify !== false;
  set('initScriptTemplate', is.templateId || '');
  set('initScriptInline', is.script || '');
  set('initScriptEnv', Object.entries(is.env || {}).map(([k, v]) => `${k}=${v}`).join(', '));
  const details = document.querySelector('#initScriptInline')?.closest('details');
  if (details && (is.script || is.env)) details.open = true;
}

// Init script templates visible from the current namespace (namespace first, then system), cached briefly
// so the review dialog, the per-NodeGroup rows and the command composer do not each call the API.
window.fetchInitScriptTemplates = async function () {
  const cfg = getConfig();
  const ns = window.configNamespace || cfg.namespace || 'default';
  const cache = window._initScriptTemplateCache;
  if (cache && cache.ns === ns && Date.now() - cache.at < 30000) return cache.list;
  const auth = { username: window.configUsername || cfg.username, password: window.configPassword || cfg.password };
  const sources = ns === 'system' ? ['system'] : [ns, 'system'];
  const seen = new Set();
  const list = [];
  for (const source of sources) {
    try {
      const res = await axios.get(`${tbApiBase()}/ns/${source}/template/initScript`, { auth });
      (res.data.templates || []).forEach(t => {
        if (seen.has(t.id)) return; // a namespace template shadows the system one of the same id
        seen.add(t.id);
        list.push({ id: t.id, steps: (t.scripts || []).length, source, description: t.description || '' });
      });
    } catch (e) { /* namespace may have none */ }
  }
  window._initScriptTemplateCache = { ns, at: Date.now(), list };
  return list;
};

window.initScriptTemplateOptionsHtml = function (list, noneLabel) {
  const esc = window.escapeHtml || (x => String(x));
  return `<option value="">${noneLabel}</option>` + list.map(t =>
    `<option value="${t.id}" title="${esc(t.description)}">${t.id}  (${t.steps} step${t.steps === 1 ? '' : 's'}${t.source === 'system' ? ', system' : ''})</option>`).join('');
};

async function loadInitScriptTemplateOptions() {
  const sel = document.getElementById('initScriptTemplate');
  if (!sel) return;
  const list = await window.fetchInitScriptTemplates();
  sel.innerHTML = window.initScriptTemplateOptionsHtml(list, '(none: account only)');
  document.querySelectorAll('.init-group-template').forEach(g => { g.innerHTML = window.initScriptTemplateOptionsHtml(list, '(none)'); });
}

// Parses "KEY=VALUE, KEY2=VALUE2" into an object; returns false (with a validation message) on a bad entry
window.parseInitScriptEnvText = function (envText) {
  const env = {};
  for (const pair of envText.split(',')) {
    const idx = pair.indexOf('=');
    const k = pair.slice(0, idx).trim(), v = pair.slice(idx + 1).trim();
    if (idx < 1 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) || k.startsWith('TB_') || /['\n]/.test(v)) {
      Swal.showValidationMessage(`Invalid env entry "${pair.trim()}": use KEY=VALUE, no TB_ prefix, no quotes`);
      return false;
    }
    env[k] = v;
  }
  return env;
};

// Per-NodeGroup additions: each row yields {templateId, script, env} that CB-Tumblebug appends to the
// Infra-level steps for that group. Returns null when the toggle is off, false on a validation error.
function collectInitScriptGroups() {
  if (!document.getElementById('initScriptPerGroup')?.checked) return null;
  const out = {};
  for (const row of document.querySelectorAll('.init-group-row')) {
    const g = {};
    const templateId = row.querySelector('.init-group-template')?.value || '';
    const inline = (row.querySelector('.init-group-inline')?.value || '').trim();
    const envText = (row.querySelector('.init-group-env')?.value || '').trim();
    if (templateId) g.templateId = templateId;
    if (inline) g.script = inline.endsWith('\n') ? inline : inline + '\n';
    if (envText) {
      const env = window.parseInitScriptEnvText(envText);
      if (env === false) return false;
      g.env = env;
    }
    out[row.dataset.group] = Object.keys(g).length > 0 ? g : undefined;
  }
  return out;
}

// Writes the per-NodeGroup rows onto the request. A row left as it was prefilled keeps the group's loaded
// initScript (it may hold steps the row cannot show); an emptied row removes it.
function applyInitScriptGroups(req, groups, snapshot) {
  if (!groups || !Array.isArray(req.nodeGroups)) return;
  const before = snapshot ? JSON.parse(snapshot) : {};
  req.nodeGroups.forEach(ng => {
    if (!(ng.name in groups)) return;
    if (JSON.stringify(groups[ng.name] ?? null) === JSON.stringify(before[ng.name] ?? null)) return;
    if (groups[ng.name]) ng.initScript = groups[ng.name];
    else delete ng.initScript;
  });
}

window.toggleInitScriptPerGroup = function (on) {
  const rows = document.getElementById('initScriptGroupRows');
  if (rows) rows.style.display = on ? '' : 'none';
};

// Puts the dialog's init script choice on the request: an object is used as is, undefined means the implicit
// default (no initScript field), and a missing key leaves the request untouched.
function applyInitScriptChoice(req, options) {
  if (!options || !('initScript' in options)) return;
  if (options.initScript) req.initScript = options.initScript;
  else delete req.initScript;
  applyInitScriptGroups(req, options.initScriptGroups, window._initScriptGroupSnapshot);
}

// Returns undefined for the implicit default, an initScript object otherwise, or false after a validation message.
function collectInitScript() {
  const mode = document.getElementById('initScriptMode')?.value || 'default';
  const userName = (document.getElementById('initScriptUser')?.value || '').trim();
  const notify = document.getElementById('initScriptNotify')?.checked !== false;
  const templateId = document.getElementById('initScriptTemplate')?.value || '';
  const inline = (document.getElementById('initScriptInline')?.value || '').trim();
  const envText = (document.getElementById('initScriptEnv')?.value || '').trim();
  if (mode === 'none') return { mode: 'none' };
  const req = {};
  if (mode !== 'default') req.mode = mode;
  if (userName && userName !== 'cb-user') req.userName = userName;
  if (templateId) req.templateId = templateId;
  if (inline) req.script = inline.endsWith('\n') ? inline : inline + '\n';
  if (envText) {
    const env = window.parseInitScriptEnvText(envText);
    if (env === false) return false;
    req.env = env;
  }
  if (!notify) req.notify = false;
  return Object.keys(req).length > 0 ? req : undefined;
}

// Infra Creation execution
// Function to build cloud-agnostic custom images
function proceedWithBuildAgnosticImage(createInfraReq, snapshotName, snapshotDescription, cleanupInfraAfterSnapshot, username, password) {
  const cfg = getConfig();
  const hostname = window.configHostname || cfg.hostname || '';
  const port = window.configPort || cfg.port || '';
  const namespace = window.configNamespace || cfg.namespace || '';
  const url = `${tbApiBase()}/ns/${namespace}/buildAgnosticImage`;
  
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


window.createInfra = createInfra;
window.createInfraReqVmTmplt = createInfraReqVmTmplt;
window.proceedWithInfraCreation = proceedWithInfraCreation;
window.reviewWithSelectedNodeGroups = reviewWithSelectedNodeGroups;
window.isNormalInteger = isNormalInteger;
window.showFinalInfraConfirmation = showFinalInfraConfirmation;
window.proceedWithBuildAgnosticImage = proceedWithBuildAgnosticImage;

export {
  createInfra,
  createInfraReqVmTmplt,
  proceedWithInfraCreation,
  proceedWithBuildAgnosticImage,
  showFinalInfraConfirmation,
  reviewWithSelectedNodeGroups,
  isNormalInteger,
};
