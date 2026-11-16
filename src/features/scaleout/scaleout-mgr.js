/**
 * Scale-Out Operations & Lifecycle Action Menus Feature Module
 * @module features/scaleout
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import { tbApiBase, getConfig } from '../../core/api.js';
import { escapeHtml } from '../../core/utils.js';
import { POPUP_STYLES } from '../../common/popup-styles.js';

const esc = escapeHtml;
const addSpinnerTask = (name) => (window.addSpinnerTask ? window.addSpinnerTask(name) : name);
const removeSpinnerTask = (id) => { if (window.removeSpinnerTask) window.removeSpinnerTask(id); };
const errorAlert = (msg) => (window.errorAlert ? window.errorAlert(msg) : Swal.fire({ icon: 'error', title: msg, showConfirmButton: true }));
const successAlert = (msg) => (window.successAlert ? window.successAlert(msg) : Swal.fire({ icon: 'success', title: msg, showConfirmButton: false, timer: 2500 }));
const infoAlert = (msg) => (window.infoAlert ? window.infoAlert(msg) : Swal.fire({ icon: 'info', title: msg, showConfirmButton: false, timer: 2500 }));

const getNodeGroupIdFromNodeSelection = () => (window.getNodeGroupIdFromNodeSelection ? window.getNodeGroupIdFromNodeSelection() : '');
const getSelectedInfraId = () => (window.getSelectedInfraId ? window.getSelectedInfraId() : (document.getElementById('infraid')?.value || null));
const renderMapFromConfig = () => { if (window.renderMapFromConfig) window.renderMapFromConfig(); };
const clearCircle = () => { if (window.clearCircle) window.clearCircle(); };
const getInfra = () => { if (window.getInfra) window.getInfra(); };
const controlInfra = (action) => { if (window.controlInfra) window.controlInfra(action); };
const deleteInfra = () => { if (window.deleteInfra) window.deleteInfra(); };
const displayJsonData = (...args) => { if (window.displayJsonData) window.displayJsonData(...args); };
const outputAlert = (...args) => { if (window.outputAlert) window.outputAlert(...args); };
const updateNodeGroupReview = () => { if (window.updateNodeGroupReview) window.updateNodeGroupReview(); };
const updateInfraList = () => { if (window.updateInfraList) window.updateInfraList(); };
const updateVmList = () => { if (window.updateVmList) window.updateVmList(); };
const updateNodeGroupList = () => { if (window.updateNodeGroupList) window.updateNodeGroupList(); };
const generateRandomRequestId = (prefix, len) => (window.generateRandomRequestId ? window.generateRandomRequestId(prefix, len) : (prefix + Math.random().toString(36).substring(2, 2 + len)));
const addRequestIdToSelect = (id) => { if (window.addRequestIdToSelect) window.addRequestIdToSelect(id); };
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

const $ = (...args) => (window.$ || window.jQuery)(...args);
$.extend = (...args) => (window.$ || window.jQuery).extend(...args);

const typeInfo = window.typeInfo || 'info';
const typeError = window.typeError || 'error';

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

const saveConfigAsTemplate = (...args) => { if (window.saveConfigAsTemplate) window.saveConfigAsTemplate(...args); };
const setupCommandsPopup = (...args) => { if (window.setupCommandsPopup) window.setupCommandsPopup(...args); };
const setupNodeGroupLabelEditor = (...args) => { if (window.setupNodeGroupLabelEditor) window.setupNodeGroupLabelEditor(...args); };
const collectNodeGroupConfig = (...args) => (window.collectNodeGroupConfig ? window.collectNodeGroupConfig(...args) : {});
const collectPhases = (...args) => (window.collectPhases ? window.collectPhases(...args) : []);
const collectCommands = (...args) => (window.collectCommands ? window.collectCommands(...args) : []);

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
  var namespace = window.configNamespace || config.namespace || '';

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
  var namespace = window.configNamespace || config.namespace || '';

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
  var namespace = window.configNamespace || config.namespace || '';

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
  var namespace = window.configNamespace || config.namespace || '';

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
  var configCopyUrl = `${tbApiBase()}/ns/${namespace}/infra/${infraId}/configCopy`;
  var infraInfoUrl = `${tbApiBase()}/ns/${namespace}/infra/${infraId}`;
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
        rootDiskType: sg.rootDiskType || "default",
        regionLatitude: repVm?.location?.latitude ?? repVm?.connectionConfig?.regionDetail?.location?.latitude ?? "",
        regionLongitude: repVm?.location?.longitude ?? repVm?.connectionConfig?.regionDetail?.location?.longitude ?? ""
      };
      recommendedSpecList.push(specInfo);
    });

    // Update the left panel NodeGroup review
    renderMapFromConfig();
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
  var namespace = window.configNamespace || config.namespace || '';

  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }

  var spinnerId = addSpinnerTask("Extracting Infra configuration");
  var configCopyUrl = `${tbApiBase()}/ns/${namespace}/infra/${infraId}/configCopy`;

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
  var url = `${tbApiBase()}/ns/${namespace}/infra/${selectedInfraId}/nodegroup`;
  
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
  var url = `${tbApiBase()}/ns/${namespace}/infra/${infraid}/nodegroup/${nodegroupid}`;
  
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
  var config = getConfig();
  var namespace = window.configNamespace || config.namespace || '';
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
  var namespace = window.configNamespace || config.namespace || '';

  if (!namespace || namespace === "") {
    errorAlert("Please select a namespace first");
    return;
  }

  var url = `${tbApiBase()}/ns/${namespace}/infra?option=id`;
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
  var namespace = window.configNamespace || config.namespace || '';

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
  // Collect label keys already used by this infra so the editor can suggest them
  // (keeps label schemes consistent for labelSelector targeting)
  window._scaleOutExistingLabelKeys = ['role'];
  axios({ method: "get", url: `${tbApiBase()}/ns/${namespace}/infra/${selectedInfraId}`,
          auth: { username: username, password: password } })
    .then(function (res) {
      var keys = new Set();
      (res.data.node || []).forEach(function (nd) {
        Object.keys(nd.label || {}).forEach(function (k) { if (!k.startsWith('sys.') && k !== 'Name') keys.add(k); });
      });
      if (keys.size > 0) window._scaleOutExistingLabelKeys = Array.from(keys);
    })
    .catch(function () { /* suggestion only; keep the default */ });

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
    title: "➕ Add NodeGroup to " + selectedInfraId,
    width: 850,
    html: `
    ${POPUP_STYLES}
    <div class="popup-container">
      ${window.generateNodeGroupConfigHtml({
        infraId: selectedInfraId,
        nodeGroupName: 'dynamic-group-' + Date.now(),
        specSummaryHtml: vmConfigSummary,
        totalNodes: totalNodes,
      })}
      ${window.generateCommandComposerHtml({
        commands: ['', '', ''],
        showPhases: true,
        includeDeployOptions: false,
      })}
    </div>`,
    showCancelButton: true,
    confirmButtonText: "Review Configuration",
    cancelButtonText: "Back",
    confirmButtonColor: "#17a2b8",
    didOpen: () => {
      setupCommandsPopup(10);
      // Update total Node count when Node count per location changes
      document.getElementById('node-count').addEventListener('input', function() {
        var vmPerLocation = parseInt(this.value) || 1;
        var totalLocations = nodeGroupRequestFromSpecList.length;
        var newTotal = vmPerLocation * totalLocations;
        document.getElementById('total-nodes').textContent = newTotal;
      });
      // Label editor: prefill from the map configuration, else from existing infra groups
      setupNodeGroupLabelEditor(
        (nodeGroupRequestFromSpecList && nodeGroupRequestFromSpecList[0] && nodeGroupRequestFromSpecList[0].label) || {},
        window._scaleOutExistingLabelKeys || ['role']
      );
    },
    preConfirm: () => {
      const cfg = collectNodeGroupConfig();
      if (cfg.error) {
        Swal.showValidationMessage(cfg.error);
        return false;
      }
      const phases = collectPhases();
      const commands = phases ? [] : ((typeof collectCommands === 'function' ? collectCommands() : []) || []);
      return { nodeGroupName: cfg.nodeGroupName, ndCount: cfg.ndCount, labels: cfg.labels, commands, phases };
    }
  }).then((result) => {
    if (result.isConfirmed) {
      var config = result.value;
      // Carry the dialog's labels/bootstrap commands into the review + execute steps
      window.pendingNodeGroupLabels = config.labels || {};
      window.pendingNodeGroupPostScriptCommands = (config.commands && config.commands.length > 0) ? config.commands : null;
      window.pendingNodeGroupPostScriptPhases = (config.phases && config.phases.length > 0) ? config.phases : null;
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
    // User-configured labels win; mapui provenance labels are added underneath
    label: Object.assign({
      "created-by": "cb-mapui",
      "creation-type": "scale-out-infra",
      "timestamp": new Date().toISOString()
    }, vmTemplate.label || {}, window.pendingNodeGroupLabels || {})
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

  var url = `${tbApiBase()}/ns/${namespace}/infra/${selectedInfraId}/nodeGroupDynamicReview`;
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
  var url = `${tbApiBase()}/ns/${namespace}/infra/${infraId}/nodeGroupDynamic`;
  
  // Build the request body using current map configuration
  var templateLabel = (nodeGroupRequestFromSpecList && nodeGroupRequestFromSpecList.length > 0)
    ? (nodeGroupRequestFromSpecList[0].label || {}) : {};
  var nodeGroupDynamicReq = {
    name: nodeGroupName,
    nodeGroupSize: nodeCountPerLocation,
    description: "Dynamically added via CB-MapUI Scale Out Infra",
    // User-configured labels win; mapui provenance labels are added underneath
    label: Object.assign({
      "created-by": "cb-mapui",
      "creation-type": "scale-out-infra",
      "timestamp": new Date().toISOString()
    }, templateLabel, window.pendingNodeGroupLabels || {})
  };

  // Bootstrap for the newly added nodeGroup (optional; runs on the NEW nodes only).
  // Async so the call returns once the nodes are provisioned.
  if (window.pendingNodeGroupPostScriptPhases && window.pendingNodeGroupPostScriptPhases.length > 0) {
    nodeGroupDynamicReq.postScript = { phases: window.pendingNodeGroupPostScriptPhases };
    window.pendingNodeGroupPostScriptPhases = null;
  } else if (window.pendingNodeGroupPostScriptCommands && window.pendingNodeGroupPostScriptCommands.length > 0) {
    nodeGroupDynamicReq.postScript = { phases: [{ command: window.pendingNodeGroupPostScriptCommands }] };
  }
  window.pendingNodeGroupPostScriptCommands = null;
  if (nodeGroupDynamicReq.postScript) url += '?postScriptAsync=true';

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

