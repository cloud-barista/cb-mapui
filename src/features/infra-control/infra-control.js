/**
 * Infra Control & Resource Lifecycle Actions Feature Module
 * @module features/infra-control
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import { tbApiBase, getConfig } from '../../core/api.js';
import { escapeHtml } from '../../core/utils.js';

const addSpinnerTask = (name) => (window.addSpinnerTask ? window.addSpinnerTask(name) : name);
const removeSpinnerTask = (id) => { if (window.removeSpinnerTask) window.removeSpinnerTask(id); };
const errorAlert = (msg) => (window.errorAlert ? window.errorAlert(msg) : Swal.fire({ icon: 'error', title: msg, showConfirmButton: true }));
const successAlert = (msg) => (window.successAlert ? window.successAlert(msg) : Swal.fire({ icon: 'success', title: msg, showConfirmButton: false, timer: 2500 }));
const infoAlert = (msg) => (window.infoAlert ? window.infoAlert(msg) : Swal.fire({ icon: 'info', title: msg, showConfirmButton: false, timer: 2500 }));

const getSelectedInfraId = () => (window.getSelectedInfraId ? window.getSelectedInfraId() : (document.getElementById('infraid')?.value || null));
const displayJsonData = (...args) => { if (window.displayJsonData) window.displayJsonData(...args); };
const displayInfraStatusGui = (...args) => { if (window.displayInfraStatusGui) window.displayInfraStatusGui(...args); };

const map = new Proxy({}, {
  get: (target, prop) => {
    const m = window.map;
    if (m && typeof m[prop] === 'function') {
      return m[prop].bind(m);
    }
    return () => {};
  }
});

let infraList = new Proxy([], {
  get: (target, prop) => (window.infraList || [])[prop],
  set: (target, prop, val) => {
    if (!window.infraList) window.infraList = [];
    window.infraList[prop] = val;
    return true;
  }
});

let infraHideList = new Proxy([], {
  get: (target, prop) => (window.infraHideList || [])[prop],
  set: (target, prop, val) => {
    if (!window.infraHideList) window.infraHideList = [];
    window.infraHideList[prop] = val;
    return true;
  }
});

const infraRenderMap = new Proxy(new Map(), {
  get: (target, prop) => {
    const irm = window.infraRenderMap || target;
    const val = irm[prop];
    return typeof val === 'function' ? val.bind(irm) : val;
  }
});

const updateInfraList = () => { if (window.updateInfraList) window.updateInfraList(); };
const updateNsList = () => { if (window.updateNsList) window.updateNsList(); };
const typeInfo = window.typeInfo || 'info';
const typeError = window.typeError || 'error';

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
  var namespace = window.configNamespace || config.namespace || '';
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

  var url = `${tbApiBase()}/ns/${namespace}/control/infra/${infraid}?action=${action}`;

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

        const data = res.data;
        const msg = (data && data.message) ? String(data.message) : '';

        // Check for partial or full failures
        if (data && data.failedNodeCount > 0) {
          let failureDetailsHtml = '';
          if (data.nodeResults && Array.isArray(data.nodeResults)) {
            const failedResults = data.nodeResults.filter(r => !r.success);
            if (failedResults.length > 0) {
              const rows = failedResults.map(r => `
                <tr style="border-bottom: 1px solid #444;">
                  <td style="padding: 6px 10px; font-weight: bold; color: #ff6b6b; font-family: monospace;">${escapeHtml(r.nodeId || '')}</td>
                  <td style="padding: 6px 10px; font-size: 11px;">${escapeHtml(r.providerName || '')}</td>
                  <td style="padding: 6px 10px; font-size: 11px; color: #ffc107;">${escapeHtml(r.status || '')}</td>
                  <td style="padding: 6px 10px; font-size: 11px; color: #ffa8a8; text-align: left;">${escapeHtml(r.error || r.message || 'Unknown error')}</td>
                </tr>
              `).join('');

              failureDetailsHtml = `
                <div style="margin-top: 15px; max-height: 250px; overflow-y: auto; text-align: left;">
                  <table style="width: 100%; border-collapse: collapse; font-size: 12px; background: rgba(0,0,0,0.2);">
                    <thead>
                      <tr style="border-bottom: 2px solid #555; background: rgba(255,255,255,0.05);">
                        <th style="padding: 6px 10px;">Node ID</th>
                        <th style="padding: 6px 10px;">CSP</th>
                        <th style="padding: 6px 10px;">Status</th>
                        <th style="padding: 6px 10px;">Error Reason</th>
                      </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                  </table>
                </div>
              `;
            }
          }

          Swal.fire({
            icon: 'warning',
            title: `Action '${action}' Partially Completed`,
            html: `<div style="font-size: 14px; margin-bottom: 10px;">${escapeHtml(msg)}</div>${failureDetailsHtml}`,
            width: '650px',
            showConfirmButton: true,
            confirmButtonText: 'OK',
            confirmButtonColor: '#ff9800'
          });
        } else {
          successAlert(msg || `Action '${action}' completed successfully`);
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
  var namespace = window.configNamespace || config.namespace || '';

  var url = `${tbApiBase()}/ns/${namespace}/infra?option=id`;

  var hideListString = "";
  for (let i = 0; i < infraHideList.length; i++) {
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
      window.infraList = res.data.output;
      infraList = window.infraList;

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
                window.infraHideList = (window.infraHideList || []).filter(
                  (a) => a !== (window.infraHideList || [])[result.value]
                );
                infraHideList = window.infraHideList;

                for (let i = 0; i < infraHideList.length; i++) {
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
                window.infraHideList = [...new Set(window.infraHideList || infraHideList)];
                infraHideList = window.infraHideList;

                for (let i = 0; i < infraHideList.length; i++) {
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
  var namespace = window.configNamespace || config.namespace || '';
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

  var url = `${tbApiBase()}/ns/${namespace}/infra/${infraid}`;

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
      displayInfraStatusGui(res.data);
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
  var namespace = window.configNamespace || config.namespace || '';
  var infraid = getSelectedInfraId();

  var url = `${tbApiBase()}/ns/${namespace}/infra/${infraid}?option=terminate`;

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
  var namespace = window.configNamespace || config.namespace || '';

  var url = `${tbApiBase()}/ns/${namespace}/sharedResources`;

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
      var total = (data && data.total) || 0;
      var successCount = (data && data.successCount) || 0;
      var failedCount = (data && data.failedCount) || 0;
      var icon = failedCount > 0 ? "warning" : "success";
      var title = failedCount > 0
        ? "Release Resources Completed with Failures"
        : "Release Resources Completed";
      var summary = "Total: " + total + ", Success: " + successCount + ", Failed: " + failedCount;

      Swal.fire({
        icon: icon,
        title: title,
        html:
          "<b>" + summary + "</b><br><br>" +
          "To retry releasing resources, click <b>🔄 Retry</b>.<br>" +
          "If orphaned dependencies are blocking deletion, click <b>🔧 Recover Dependencies</b>.",
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: "🔄 Retry Release Resources",
        denyButtonText: "🔧 Recover Dependencies",
        cancelButtonText: "OK",
        confirmButtonColor: "#e67e22",
        denyButtonColor: "#1565c0",
        cancelButtonColor: "#6c757d",
      }).then(function (result) {
        displayJsonData(data, typeInfo);
        if (result.isConfirmed) {
          releaseResources();
        } else if (result.isDenied) {
          recoverSharedResourceDependencies();
        }
      });
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

  var url = `${tbApiBase()}/inspectResourcesOverview`;

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
function recoverSharedResourceDependencies() {
  var spinnerId = addSpinnerTask("Recovering orphaned dependency resources");
  infoAlert("Scanning and registering orphaned CSP resources...");

  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = window.configNamespace || config.namespace || '';

  var url = `${tbApiBase()}/ns/${namespace}/sharedResources/recoverDependencies`;

  axios({
    method: "post",
    url: url,
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify({}),
    auth: {
      username: `${username}`,
      password: `${password}`,
    },
  })
    .then(function (res) {
      console.log(res); // for debug

      var data = res.data;
      var ov = (data && data.registerationOverview) || {};
      var totalRegistered =
        (ov.vNet || 0) + (ov.securityGroup || 0) + (ov.sshKey || 0) + (ov.node || 0);

      if (totalRegistered > 0) {
        Swal.fire({
          icon: "success",
          title: "Dependency Recovery Complete",
          html:
            "<b>" + totalRegistered + " orphaned resource(s) registered</b><br>" +
            "Node: " + (ov.node || 0) +
            ", SSHKey: " + (ov.sshKey || 0) +
            ", SecurityGroup: " + (ov.securityGroup || 0) +
            ", vNet: " + (ov.vNet || 0) +
            "<br><br>" +
            "The recovered resources appear as <b>dep-*</b> Infra(s) in the Infra list.<br>" +
            "Please <b>terminate and delete</b> them, then retry <b>Release Resources</b>.",
          confirmButtonText: "OK",
        });
      } else {
        Swal.fire({
          icon: "info",
          title: "No Orphaned Resources Found",
          text: "No CSP resources outside CB-Tumblebug were detected. The dependency may be caused by a non-VM resource (e.g., ENI, Lambda, RDS) that requires manual cleanup on the CSP console.",
          confirmButtonText: "OK",
        });
      }

      displayJsonData(data, typeInfo);
    })
    .catch(function (err) {
      console.error(err);
      var msg = err.response ? JSON.stringify(err.response.data) : err.message;
      errorAlert("Dependency recovery failed: " + msg);
    })
    .finally(function () {
      removeSpinnerTask(spinnerId);
    });
}
window.recoverSharedResourceDependencies = recoverSharedResourceDependencies;

function registerCspResource() {
  var spinnerId = addSpinnerTask("Registering all CSP's resources");
  infoAlert("Registering all CSP's resources");

  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = window.configNamespace || config.namespace || '';

  var url = `${tbApiBase()}/registerCspResourcesAll?infraFlag=n`;

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

