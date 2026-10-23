/**
 * RDBMS (Managed Relational Database) Management Feature Module for cb-mapui
 * Provides all-in-one RDBMS lifecycle management, dry-run validation,
 * logical database CRUD, and TLS/CA certificate management via SweetAlert2.
 * @module features/rdbms
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import { tbApiBase, getConfig } from '../../core/api.js';
import { escapeHtml } from '../../core/utils.js';

const addSpinnerTask = (name) => (window.addSpinnerTask ? window.addSpinnerTask(name) : name);
const removeSpinnerTask = (id) => { if (window.removeSpinnerTask) window.removeSpinnerTask(id); };

// --- Global Animation & Spinner Styles for RDBMS ---
(function injectRdbmsGlobalStyles() {
  if (typeof document === 'undefined' || document.getElementById('rdbms-global-styles')) return;
  const style = document.createElement('style');
  style.id = 'rdbms-global-styles';
  style.textContent = `
    @keyframes rdbmsRotate {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .rdbms-spin, .fa-spin {
      display: inline-block !important;
      animation: rdbmsRotate 0.85s infinite linear !important;
      transform-origin: 50% 50% !important;
    }
    .rdbms-spinner {
      display: inline-block;
      width: 18px;
      height: 18px;
      border: 2.5px solid rgba(2, 132, 199, 0.2);
      border-top-color: #0284c7;
      border-radius: 50%;
      animation: rdbmsRotate 0.85s infinite linear;
      box-sizing: border-box;
      vertical-align: middle;
    }
    .rdbms-spinner-sm {
      width: 14px;
      height: 14px;
      border-width: 2px;
    }
    .rdbms-spinner-danger {
      border-top-color: #dc2626 !important;
    }
  `;
  document.head.appendChild(style);
})();

// --- In-Modal Notification & Overlay Confirmation Handlers ---
let noticeTimeoutId = null;

export function showModalNotice(message, type = 'info', autoDismissMs = 4500) {
  const banner = document.getElementById('rdbmsNoticeBanner');
  if (!banner) {
    console.log(`[RDBMS ${type}]`, message);
    return;
  }

  if (noticeTimeoutId) {
    clearTimeout(noticeTimeoutId);
    noticeTimeoutId = null;
  }

  const icons = {
    success: '<i class="fas fa-check-circle" style="color: #16a34a; font-size: 18px;"></i>',
    error: '<i class="fas fa-exclamation-circle" style="color: #dc2626; font-size: 18px;"></i>',
    warning: '<i class="fas fa-exclamation-triangle" style="color: #d97706; font-size: 18px;"></i>',
    info: '<i class="fas fa-info-circle" style="color: #2563eb; font-size: 18px;"></i>',
  };

  banner.className = `rdbms-notice-banner rdbms-notice-${type}`;
  banner.innerHTML = `
    <div class="rdbms-notice-content">
      <span class="rdbms-notice-icon">${icons[type] || icons.info}</span>
      <span class="rdbms-notice-text">${escapeHtml(message)}</span>
    </div>
    <button type="button" class="rdbms-notice-close" title="Dismiss">&times;</button>
  `;
  banner.style.display = 'flex';
  banner.style.opacity = '1';

  const closeBtn = banner.querySelector('.rdbms-notice-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => dismissModalNotice());
  }

  const modalContainer = document.getElementById('rdbmsModalContent');
  if (modalContainer) {
    modalContainer.scrollTop = 0;
  }

  if (autoDismissMs > 0 && type !== 'error') {
    noticeTimeoutId = setTimeout(() => {
      dismissModalNotice();
    }, autoDismissMs);
  }
}

export function dismissModalNotice() {
  const banner = document.getElementById('rdbmsNoticeBanner');
  if (!banner) return;
  banner.style.opacity = '0';
  setTimeout(() => {
    banner.style.display = 'none';
  }, 200);
}

let confirmResolver = null;

export function showModalConfirm({
  title = 'Confirmation',
  html = '',
  icon = 'warning',
  confirmText = 'Confirm',
  confirmButtonClass = 'rdbms-btn-danger',
  cancelText = 'Cancel',
}) {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    const overlay = document.getElementById('rdbmsConfirmOverlay');
    const titleEl = document.getElementById('rdbmsConfirmTitle');
    const bodyEl = document.getElementById('rdbmsConfirmBody');
    const iconEl = document.getElementById('rdbmsConfirmIcon');
    const actionsEl = document.getElementById('rdbmsConfirmActions');

    if (!overlay || !titleEl || !bodyEl || !actionsEl) {
      resolve(confirm(title + '\n' + html.replace(/<[^>]*>/g, '')));
      return;
    }

    titleEl.innerText = title;
    bodyEl.innerHTML = html;

    const iconMap = {
      warning: '<div style="width:52px;height:52px;border-radius:50%;background:#fef3c7;display:flex;align-items:center;justify-content:center;margin:0 auto 14px auto;"><i class="fas fa-exclamation-triangle" style="font-size:24px;color:#d97706;"></i></div>',
      danger: '<div style="width:52px;height:52px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;margin:0 auto 14px auto;"><i class="fas fa-trash-alt" style="font-size:24px;color:#dc2626;"></i></div>',
      info: '<div style="width:52px;height:52px;border-radius:50%;background:#e0f2fe;display:flex;align-items:center;justify-content:center;margin:0 auto 14px auto;"><i class="fas fa-info-circle" style="font-size:24px;color:#0284c7;"></i></div>',
    };
    iconEl.innerHTML = iconMap[icon] || iconMap.warning;

    actionsEl.innerHTML = `
      <button type="button" class="rdbms-btn rdbms-btn-secondary" id="rdbmsConfirmCancelBtn" style="padding: 8px 20px; font-size: 14px;">${escapeHtml(cancelText)}</button>
      <button type="button" class="rdbms-btn ${confirmButtonClass}" id="rdbmsConfirmOkBtn" style="padding: 8px 20px; font-size: 14px;">${escapeHtml(confirmText)}</button>
    `;

    overlay.style.display = 'flex';

    document.getElementById('rdbmsConfirmCancelBtn').onclick = () => {
      overlay.style.display = 'none';
      if (confirmResolver) { confirmResolver(false); confirmResolver = null; }
    };
    document.getElementById('rdbmsConfirmOkBtn').onclick = () => {
      const isChecked = Boolean(document.getElementById('rdbmsDeleteBastionCheck')?.checked);
      overlay.style.display = 'none';
      if (confirmResolver) { confirmResolver(isChecked ? { confirmed: true, deleteBastion: true } : true); confirmResolver = null; }
    };
  });
}

let customDialogResolver = null;

export function showDialogValidationMessage(msg) {
  const valEl = document.getElementById('rdbmsDialogValidation');
  if (!valEl) return;
  if (msg) {
    valEl.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${escapeHtml(msg)}`;
    valEl.style.display = 'block';
  } else {
    valEl.innerHTML = '';
    valEl.style.display = 'none';
  }
}

export function showInModalDialog({
  title = '',
  html = '',
  maxWidth = '740px',
  confirmText = 'Run',
  confirmButtonClass = 'rdbms-btn-primary',
  cancelText = 'Cancel',
  didOpen = null,
  preConfirm = null,
}) {
  return new Promise((resolve) => {
    customDialogResolver = resolve;
    const overlay = document.getElementById('rdbmsDialogOverlay');
    const cardEl = document.getElementById('rdbmsDialogCard');
    const titleEl = document.getElementById('rdbmsDialogTitle');
    const bodyEl = document.getElementById('rdbmsDialogBody');
    const actionsEl = document.getElementById('rdbmsDialogActions');
    const closeBtn = document.getElementById('rdbmsDialogCloseBtn');

    if (!overlay || !cardEl || !titleEl || !bodyEl || !actionsEl) {
      console.warn('rdbmsDialogOverlay elements not found in modal');
      resolve({ isConfirmed: false });
      return;
    }

    if (maxWidth) {
      cardEl.style.maxWidth = maxWidth;
    }

    showDialogValidationMessage(null);
    titleEl.innerHTML = title;
    bodyEl.innerHTML = html;

    actionsEl.innerHTML = `
      <button type="button" class="rdbms-btn rdbms-btn-secondary" id="rdbmsDialogCancelBtn" style="padding: 8px 18px; font-size: 13.5px;">${escapeHtml(cancelText)}</button>
      <button type="button" class="rdbms-btn ${confirmButtonClass}" id="rdbmsDialogOkBtn" style="padding: 8px 20px; font-size: 13.5px;">${confirmText}</button>
    `;

    overlay.style.display = 'flex';

    if (typeof didOpen === 'function') {
      try {
        didOpen();
      } catch (err) {
        console.error('Error in didOpen callback:', err);
      }
    }

    const keyHandler = (e) => {
      if (e.key === 'Escape' && overlay.style.display !== 'none') {
        e.stopPropagation();
        closeDialog({ isConfirmed: false });
      }
    };
    document.addEventListener('keydown', keyHandler);

    const closeDialog = (result) => {
      document.removeEventListener('keydown', keyHandler);
      overlay.style.display = 'none';
      if (customDialogResolver) {
        const res = customDialogResolver;
        customDialogResolver = null;
        res(result);
      }
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        closeDialog({ isConfirmed: false });
      }
    };

    if (closeBtn) {
      closeBtn.onclick = () => closeDialog({ isConfirmed: false });
    }
    const cancelBtn = document.getElementById('rdbmsDialogCancelBtn');
    if (cancelBtn) {
      cancelBtn.onclick = () => closeDialog({ isConfirmed: false });
    }

    const okBtn = document.getElementById('rdbmsDialogOkBtn');
    if (okBtn) {
      okBtn.onclick = async () => {
        let val = true;
        if (typeof preConfirm === 'function') {
          try {
            val = await preConfirm();
            if (val === false) return;
          } catch (err) {
            console.error('Error in preConfirm:', err);
            return;
          }
        }
        closeDialog({ isConfirmed: true, value: val });
      };
    }
  });
}

// --- Provider Metadata ---
const PROVIDER_META = {
  aws: { name: 'AWS', icon: '/img/csp-aws.png', badge: 'Amazon RDS' },
  azure: { name: 'Azure', icon: '/img/csp-azure.png', badge: 'Azure MySQL Flexible' },
  gcp: { name: 'GCP', icon: '/img/csp-gcp.png', badge: 'Cloud SQL' },
  alibaba: { name: 'Alibaba', icon: '/img/csp-alibaba.png', badge: 'ApsaraDB RDS' },
  tencent: { name: 'Tencent', icon: '/img/csp-tencent.png', badge: 'TencentDB' },
  ibm: { name: 'IBM', icon: '/img/csp-ibm.png', badge: 'Cloud Databases' },
  ncp: { name: 'NCP', icon: '/img/csp-ncp.png', badge: 'Cloud DB for MySQL' },
  nhn: { name: 'NHN', icon: '/img/csp-nhn.png', badge: 'NHN Cloud RDS' },
  openstack: { name: 'OpenStack', icon: '/img/csp-openstack.png', badge: 'OpenStack Trove' },
};

function getProviderMeta(providerName) {
  const p = (providerName || '').toLowerCase().trim();
  if (PROVIDER_META[p]) return PROVIDER_META[p];
  return {
    name: providerName || 'Unknown',
    icon: `/img/csp-${p}.png`,
    badge: 'Managed RDBMS',
  };
}

// --- Default Embedded Bastion Template (matches init/templates/infra-db-bastion.json) ---
const DEFAULT_BASTION_TEMPLATE = {
  resourceType: 'infra',
  name: 'infra-db-bastion',
  description: 'Multi-CSP DB Bastion template for secure in-VPC RDBMS access and testing across CSPs (pre-installed mysql/mariadb clients)',
  infraDynamicReq: {
    installMonAgent: 'no',
    nodeGroups: [
      { name: 'g-aws', nodeGroupSize: 1, specId: 'aws+ap-northeast-2+t3.nano', imageId: 'ami-0fde5763b4c293a0b', rootDiskType: 'gp3', rootDiskSize: 30 },
      { name: 'g-azure', nodeGroupSize: 1, specId: 'azure+koreacentral+standard_b2ts_v2', imageId: 'Canonical:0001-com-ubuntu-minimal-jammy:minimal-22_04-lts-gen2:22.04.202607290', rootDiskType: 'default', rootDiskSize: 30 },
      { name: 'g-gcp', nodeGroupSize: 1, specId: 'gcp+asia-northeast3+n1-standard-1', imageId: 'https://www.googleapis.com/compute/v1/projects/ubuntu-os-cloud/global/images/ubuntu-2204-jammy-v20260820', rootDiskType: 'default', rootDiskSize: 30 },
      { name: 'g-ncp', nodeGroupSize: 1, specId: 'ncp+kr+s2-g3a', imageId: '23214590', rootDiskType: 'default', rootDiskSize: 50 },
      { name: 'g-nhn', nodeGroupSize: 1, specId: 'nhn+kr2+c2.c2m2', imageId: '8fab9909-617f-4bf4-8cd7-38bfc27a0129', rootDiskType: 'default', rootDiskSize: 30 },
      { name: 'g-alibaba', nodeGroupSize: 1, specId: 'alibaba+ap-northeast-2+ecs.e-c1m2.large', zone: 'ap-northeast-2a', imageId: 'ubuntu_22_04_x64_20G_alibase_20260810.vhd', rootDiskType: 'default', rootDiskSize: 40 },
      { name: 'g-tencent', nodeGroupSize: 1, specId: 'tencent+ap-seoul+s2.medium2', imageId: 'img-487zeit5', rootDiskType: 'default', rootDiskSize: 50 },
      { name: 'g-ibm', nodeGroupSize: 1, specId: 'ibm+us-south+bxf-2x8', imageId: 'r006-23020f83-9547-4501-a96a-a28b96671308', rootDiskType: 'default', rootDiskSize: 30 },
      { name: 'g-openstack', nodeGroupSize: 1, specId: 'openstack+regionone+m1.medium', imageId: '0b583339-0a62-4e5d-9cfb-4666539961d0', rootDiskType: 'default', rootDiskSize: 40 },
    ],
    postCommands: [
      {
        command: [
          'for i in 1 2 3 4 5 6 7 8 9 10; do sudo apt-get update -y && (sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-client netcat-openbsd || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-client netcat-openbsd) && break || (sudo yum install -y mariadb nc && break) || sleep 5; done',
        ],
      },
    ],
  },
};

// --- State Management ---
const rdbmsState = {
  namespace: '',
  view: 'instances', // 'instances' | 'detail'
  currentInstance: null,
  instanceList: [],
  connections: [],
  supportMatrix: null,
  selectedProvider: 'all',
  filterText: '',
  selectedInstanceIds: new Set(),
  isFormOpen: false,
  activeCapability: null,
  // Provisioning Mode: 'bastion-set' | 'manual'
  provisionMode: 'bastion-set',
  multiCspSelected: ['aws'],
  bastionTemplate: DEFAULT_BASTION_TEMPLATE,
  // Database sub-management
  adminUser: '',
  adminPassword: '',
  databases: [],
  isLoadingDatabases: false,
  secureTransport: null,
  isLoadingSecureTransport: false,
  currentBastionNode: null,
  currentBastionLabel: null,
};

// --- LocalStorage Credential Persistence (Opt-In Security Policy) ---
const RDBMS_STORAGE_KEY_OPTIN = 'cb_rdbms_remember_pass_optin';
const RDBMS_STORAGE_KEY_USER = 'cb_rdbms_admin_user';
const RDBMS_STORAGE_KEY_PASS = 'cb_rdbms_admin_pass';
const RDBMS_STORAGE_KEY_INST_CREDS = 'cb_rdbms_instance_credentials';

// In-memory cache for current browser session (zero disk exposure by default)
const rdbmsMemoryCreds = {};

function isRememberPasswordEnabled() {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(RDBMS_STORAGE_KEY_OPTIN) === 'true';
  } catch (e) {
    return false;
  }
}

// Cleanse any old unapproved passwords on initial script evaluation if opt-in is false
try {
  if (typeof localStorage !== 'undefined' && !isRememberPasswordEnabled()) {
    if (localStorage.getItem(RDBMS_STORAGE_KEY_PASS)) {
      localStorage.removeItem(RDBMS_STORAGE_KEY_PASS);
    }
    const raw = localStorage.getItem(RDBMS_STORAGE_KEY_INST_CREDS);
    if (raw) {
      const map = JSON.parse(raw);
      let changed = false;
      for (const k of Object.keys(map)) {
        if (map[k]?.pass) {
          delete map[k].pass;
          changed = true;
        }
      }
      if (changed) {
        localStorage.setItem(RDBMS_STORAGE_KEY_INST_CREDS, JSON.stringify(map));
      }
    }
  }
} catch (e) {
  // Ignore
}

function setRememberPasswordEnabled(enabled) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (enabled) {
      localStorage.setItem(RDBMS_STORAGE_KEY_OPTIN, 'true');
      const pass = rdbmsState?.adminPassword
        || document.getElementById('rdbmsAdminPassInput')?.value
        || document.getElementById('rdbmsTestAdminPass')?.value
        || document.getElementById('rdbmsDbAdminPass')?.value;
      if (pass) {
        localStorage.setItem(RDBMS_STORAGE_KEY_PASS, pass);
      }
      if (Object.keys(rdbmsMemoryCreds).length > 0) {
        const raw = localStorage.getItem(RDBMS_STORAGE_KEY_INST_CREDS);
        const map = raw ? JSON.parse(raw) : {};
        for (const [id, cred] of Object.entries(rdbmsMemoryCreds)) {
          map[id] = {
            user: cred.user || map[id]?.user || '',
            pass: cred.pass || map[id]?.pass || '',
            updatedAt: Date.now(),
          };
        }
        localStorage.setItem(RDBMS_STORAGE_KEY_INST_CREDS, JSON.stringify(map));
      }
    } else {
      localStorage.setItem(RDBMS_STORAGE_KEY_OPTIN, 'false');
      localStorage.removeItem(RDBMS_STORAGE_KEY_PASS);
      const raw = localStorage.getItem(RDBMS_STORAGE_KEY_INST_CREDS);
      if (raw) {
        const map = JSON.parse(raw);
        for (const k of Object.keys(map)) {
          delete map[k].pass;
        }
        localStorage.setItem(RDBMS_STORAGE_KEY_INST_CREDS, JSON.stringify(map));
      }
    }
    // Synchronize all checkboxes in DOM
    document.querySelectorAll('.rdbms-remember-pass-chk').forEach(c => {
      c.checked = !!enabled;
    });
  } catch (e) {
    console.warn('Failed to update remember password setting', e);
  }
}

function clearAllSavedRdbmsPasswords(showNotice = true) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(RDBMS_STORAGE_KEY_PASS);
      const raw = localStorage.getItem(RDBMS_STORAGE_KEY_INST_CREDS);
      if (raw) {
        const map = JSON.parse(raw);
        for (const k of Object.keys(map)) {
          delete map[k].pass;
        }
        localStorage.setItem(RDBMS_STORAGE_KEY_INST_CREDS, JSON.stringify(map));
      }
      localStorage.setItem(RDBMS_STORAGE_KEY_OPTIN, 'false');
    }
    if (rdbmsState) {
      rdbmsState.adminPassword = '';
    }
    for (const k of Object.keys(rdbmsMemoryCreds)) {
      delete rdbmsMemoryCreds[k].pass;
    }
    const passInputs = document.querySelectorAll('#rdbmsAdminPassInput, #rdbmsTestAdminPass, #rdbmsDbAdminPass');
    passInputs.forEach(input => { input.value = ''; });

    document.querySelectorAll('.rdbms-remember-pass-chk').forEach(chk => {
      chk.checked = false;
    });

    if (showNotice) {
      showModalNotice('All saved database passwords have been wiped from browser storage.', 'success');
    }
  } catch (e) {
    console.warn('Failed to clear saved passwords', e);
  }
}

function getSavedRdbmsUser(instId = null) {
  try {
    if (instId && rdbmsMemoryCreds[instId]?.user) return rdbmsMemoryCreds[instId].user;
    if (typeof localStorage === 'undefined') return rdbmsState?.adminUser || 'dbadmin';
    if (instId) {
      const raw = localStorage.getItem(RDBMS_STORAGE_KEY_INST_CREDS);
      if (raw) {
        const map = JSON.parse(raw);
        if (map[instId]?.user) return map[instId].user;
      }
    }
    return localStorage.getItem(RDBMS_STORAGE_KEY_USER) || rdbmsState?.adminUser || 'dbadmin';
  } catch (e) {
    return rdbmsState?.adminUser || 'dbadmin';
  }
}

function getSavedRdbmsPassword(instId = null) {
  try {
    // 1. In-memory check first (accessible during active page session)
    if (instId && rdbmsMemoryCreds[instId]?.pass) return rdbmsMemoryCreds[instId].pass;
    if (rdbmsState?.adminPassword) return rdbmsState.adminPassword;

    // 2. Only read from localStorage if explicitly opted in
    if (!isRememberPasswordEnabled()) return '';

    if (typeof localStorage === 'undefined') return '';
    if (instId) {
      const raw = localStorage.getItem(RDBMS_STORAGE_KEY_INST_CREDS);
      if (raw) {
        const map = JSON.parse(raw);
        if (map[instId]?.pass) return map[instId].pass;
      }
    }
    return localStorage.getItem(RDBMS_STORAGE_KEY_PASS) || '';
  } catch (e) {
    return rdbmsState?.adminPassword || '';
  }
}

function saveRdbmsSessionCredentials(user, pass, instId = null) {
  try {
    // Session in-memory state
    if (user && rdbmsState) rdbmsState.adminUser = user;
    if (pass && rdbmsState) rdbmsState.adminPassword = pass;

    if (instId) {
      if (!rdbmsMemoryCreds[instId]) rdbmsMemoryCreds[instId] = {};
      if (user) rdbmsMemoryCreds[instId].user = user;
      if (pass) rdbmsMemoryCreds[instId].pass = pass;
    }

    if (typeof localStorage === 'undefined') return;

    // Username (non-sensitive) is safely saved for usability
    if (user) {
      localStorage.setItem(RDBMS_STORAGE_KEY_USER, user);
    }

    const optIn = isRememberPasswordEnabled();

    // Passwords are ONLY written to localStorage if opt-in is enabled
    if (optIn && pass) {
      localStorage.setItem(RDBMS_STORAGE_KEY_PASS, pass);
    }

    const raw = localStorage.getItem(RDBMS_STORAGE_KEY_INST_CREDS);
    const map = raw ? JSON.parse(raw) : {};
    const key = instId || 'last';
    map[key] = {
      user: user || map[key]?.user || '',
      pass: optIn ? (pass || map[key]?.pass || '') : '',
      updatedAt: Date.now(),
    };
    if (!optIn) {
      delete map[key].pass;
    }
    localStorage.setItem(RDBMS_STORAGE_KEY_INST_CREDS, JSON.stringify(map));
  } catch (e) {
    console.warn('Failed to save RDBMS credentials', e);
  }
}

function renderRememberPasswordCheckboxHtml(extraStyle = '') {
  const isChecked = isRememberPasswordEnabled();
  return `
    <div style="margin-top: 6px; display: flex; align-items: center; justify-content: space-between; ${extraStyle}">
      <label style="font-size: 11.5px; color: #475569; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; margin: 0;">
        <input type="checkbox" class="rdbms-remember-pass-chk" ${isChecked ? 'checked' : ''} style="margin: 0; cursor: pointer;">
        <span>Remember password in browser storage <span style="color: #b45309; font-size: 10.5px;">(Not recommended on shared devices)</span></span>
      </label>
    </div>
  `;
}

function attachRememberPassCheckboxListeners(container = document) {
  const chks = container.querySelectorAll('.rdbms-remember-pass-chk');
  chks.forEach(chk => {
    chk.onchange = (e) => {
      const checked = e.target.checked;
      setRememberPasswordEnabled(checked);
      if (checked) {
        showModalNotice('Password storage enabled. Passwords will be saved in browser storage.', 'info');
      } else {
        showModalNotice('Password storage disabled. Saved passwords purged from browser storage.', 'info');
      }
    };
  });
}

// --- Active Background Operations Registry ---
const rdbmsActiveOperations = [];
let rdbmsOpsTimerId = null;

function formatElapsedTime(startTime, endTime) {
  const end = endTime || Date.now();
  const diffSec = Math.max(0, Math.floor((end - startTime) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  return `${m}m ${s}s`;
}

function ensureOpsTimer() {
  if (rdbmsOpsTimerId) return;
  rdbmsOpsTimerId = setInterval(() => {
    const hasRunning = rdbmsActiveOperations.some(op => op.status === 'running');
    if (hasRunning) {
      renderActiveOperationsPanelIfOpen();
    } else {
      clearInterval(rdbmsOpsTimerId);
      rdbmsOpsTimerId = null;
    }
  }, 1500);
}

function generateSingleOpCardHtml(op) {
  const isRunning = op.status === 'running';
  const isSuccess = op.status === 'success';
  const isWarning = op.status === 'warning';
  const isError = op.status === 'error';
  const elapsedStr = formatElapsedTime(op.startTime, op.endTime);

  let statusBadgeClass = 'rdbms-badge-info';
  let statusText = 'In Progress';
  let statusIcon = '<span class="rdbms-spinner rdbms-spinner-sm"></span>';

  if (isSuccess) {
    statusBadgeClass = 'rdbms-badge-success';
    statusText = 'Completed';
    statusIcon = '<i class="fas fa-check-circle" style="color: #16a34a;"></i>';
  } else if (isWarning) {
    statusBadgeClass = 'rdbms-badge-warning';
    statusText = 'Completed with Warnings';
    statusIcon = '<i class="fas fa-exclamation-triangle" style="color: #d97706;"></i>';
  } else if (isError) {
    statusBadgeClass = 'rdbms-badge-danger';
    statusText = 'Failed';
    statusIcon = '<i class="fas fa-times-circle" style="color: #dc2626;"></i>';
  }

  const isDelOp = op.type === 'delete-instance' || op.type === 'batch-delete';
  const opIcon = isDelOp ? '🗑️' : (op.type === 'batch-test' ? '⚡' : '🚀');

  return `
    <div style="background: #ffffff; border: 1px solid ${isRunning ? '#bae6fd' : (isSuccess ? '#bbf7d0' : (isWarning ? '#fde68a' : '#fecaca'))}; border-radius: 8px; padding: 12px 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 15px;">${opIcon}</span>
          <span style="font-weight: 700; font-size: 13.5px; color: #0f172a;">${escapeHtml(op.title)}</span>
          <span class="rdbms-badge ${statusBadgeClass}" style="display: inline-flex; align-items: center; gap: 5px; font-size: 11px;">
            ${statusIcon} ${statusText}
          </span>
          <span style="font-size: 12px; color: #64748b;">· ${elapsedStr}</span>
        </div>
        ${!isRunning ? `
          <button type="button" class="rdbms-btn rdbms-btn-secondary btn-dismiss-op" data-op-id="${escapeHtml(op.id)}" style="padding: 2px 8px; font-size: 11px;" title="Dismiss this operation">
            ✕ Clear
          </button>
        ` : ''}
      </div>

      <!-- Step items -->
      <div style="display: flex; flex-direction: column; gap: 6px;">
        ${(op.steps || []).map(st => {
          let stepBorderLeft = '#cbd5e1';
          let stepBg = '#f8fafc';
          let stepBorder = '#e2e8f0';
          let stepIcon = '<i class="far fa-circle" style="color: #94a3b8; font-size: 13px;"></i>';
          let opacity = '0.65';

          if (st.status === 'running') {
            stepBorderLeft = isDelOp ? '#dc2626' : '#0284c7';
            stepBg = '#f0f9ff';
            stepBorder = '#bae6fd';
            stepIcon = `<span class="rdbms-spinner rdbms-spinner-sm ${isDelOp ? 'rdbms-spinner-danger' : ''}"></span>`;
            opacity = '1';
          } else if (st.status === 'success') {
            stepBorderLeft = '#16a34a';
            stepBg = '#f0fdf4';
            stepBorder = '#bbf7d0';
            stepIcon = '<i class="fas fa-check-circle" style="color: #16a34a; font-size: 14px;"></i>';
            opacity = '1';
          } else if (st.status === 'warning') {
            stepBorderLeft = '#d97706';
            stepBg = '#fffbeb';
            stepBorder = '#fef3c7';
            stepIcon = '<i class="fas fa-exclamation-triangle" style="color: #d97706; font-size: 14px;"></i>';
            opacity = '1';
          } else if (st.status === 'error') {
            stepBorderLeft = '#dc2626';
            stepBg = '#fef2f2';
            stepBorder = '#fecaca';
            stepIcon = '<i class="fas fa-times-circle" style="color: #dc2626; font-size: 14px;"></i>';
            opacity = '1';
          }

          return `
            <div style="display: flex; gap: 8px; align-items: flex-start; padding: 7px 10px; border-radius: 6px; background: ${stepBg}; border: 1px solid ${stepBorder}; border-left: 3px solid ${stepBorderLeft}; opacity: ${opacity};">
              <div style="min-width: 18px; display: flex; align-items: center; justify-content: center; margin-top: 2px;">
                ${stepIcon}
              </div>
              <div style="flex: 1; font-size: 12.5px;">
                <div style="font-weight: 600; color: #1e293b;">${escapeHtml(st.title)}</div>
                <div style="font-size: 12px; color: #64748b; margin-top: 1px;">
                  ${st.descHtml || escapeHtml(st.desc || '')}
                </div>
                ${st.detailsHtml ? `<div style="margin-top: 6px; font-size: 12px;">${st.detailsHtml}</div>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Summary box -->
      ${op.summaryHtml ? `
        <div style="margin-top: 8px; padding: 8px 12px; border-radius: 6px; font-size: 12px; background: ${isSuccess ? '#f0fdf4' : (isWarning ? '#fffbeb' : '#fef2f2')}; border: 1px solid ${isSuccess ? '#bbf7d0' : (isWarning ? '#fef3c7' : '#fecaca')}; color: ${isSuccess ? '#166534' : (isWarning ? '#92400e' : '#991b1b')};">
          ${op.summaryHtml}
        </div>
      ` : ''}
    </div>
  `;
}

function generateActiveOperationsHtml() {
  const visibleOps = rdbmsActiveOperations.filter(op => !op.dismissed);
  if (visibleOps.length === 0) return '';

  const runningOps = visibleOps.filter(op => op.status === 'running');
  const completedOps = visibleOps.filter(op => op.status !== 'running');

  return `
    <div class="rdbms-card" style="padding: 14px 16px; margin-bottom: 14px; border-left: 4px solid #0284c7; background: #fafcfe;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
        <div style="font-weight: 700; font-size: 13.5px; color: #1e293b; display: flex; align-items: center; gap: 8px;">
          <span>⚡ Background Operations</span>
          ${runningOps.length > 0 ? `<span class="rdbms-badge rdbms-badge-info" style="font-size: 11.5px; display: inline-flex; align-items: center; gap: 4px;"><span class="rdbms-spinner rdbms-spinner-sm"></span> ${runningOps.length} Running</span>` : ''}
          ${completedOps.length > 0 ? `<span class="rdbms-badge rdbms-badge-secondary" style="font-size: 11.5px;">${completedOps.length} Finished</span>` : ''}
        </div>
        ${completedOps.length > 0 ? `
          <button type="button" class="rdbms-btn rdbms-btn-secondary btn-clear-all-ops" style="padding: 3px 9px; font-size: 11.5px;">
            ✕ Clear Finished
          </button>
        ` : ''}
      </div>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${visibleOps.map(op => generateSingleOpCardHtml(op)).join('')}
      </div>
    </div>
  `;
}

function renderActiveOperationsPanelIfOpen() {
  const container = document.getElementById('rdbmsActiveOpsContainer');
  if (!container) return;
  container.innerHTML = generateActiveOperationsHtml();
  attachActiveOperationsEvents();
}

function attachActiveOperationsEvents() {
  document.querySelectorAll('.btn-dismiss-op').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const opId = btn.dataset.opId;
      const op = rdbmsActiveOperations.find(o => o.id === opId);
      if (op) {
        op.dismissed = true;
        renderActiveOperationsPanelIfOpen();
      }
    };
  });

  document.querySelectorAll('.btn-clear-all-ops').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      rdbmsActiveOperations.forEach(o => {
        if (o.status !== 'running') {
          o.dismissed = true;
        }
      });
      renderActiveOperationsPanelIfOpen();
    };
  });

  document.querySelectorAll('.btn-retry-single-csp').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const opId = btn.dataset.opId;
      const csp = btn.dataset.csp;
      const op = rdbmsActiveOperations.find(o => o.id === opId);
      if (op && op.deployContext) {
        await retryFailedCsps(op, [csp]);
      }
    };
  });

  document.querySelectorAll('.btn-retry-all-failed').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const opId = btn.dataset.opId;
      const op = rdbmsActiveOperations.find(o => o.id === opId);
      if (op && op.deployContext && op.failedCsps?.length > 0) {
        await retryFailedCsps(op, [...op.failedCsps]);
      }
    };
  });

  // Toggle Command Output in Batch Test Operations
  document.querySelectorAll('.btn-toggle-test-output').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const pre = btn.nextElementSibling;
      if (pre) {
        const isHidden = pre.style.display === 'none';
        pre.style.display = isHidden ? 'block' : 'none';
        const span = btn.querySelector('span');
        if (span) span.textContent = isHidden ? 'Hide Output' : 'View Output';
        const icon = btn.querySelector('.fa-chevron-down, .fa-chevron-up');
        if (icon) icon.className = isHidden ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
      }
    };
  });
}

async function refreshRdbmsInstancesSilently() {
  const config = getConfig();
  try {
    const res = await axios.get(`${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms`, {
      auth: { username: config.username, password: config.password },
    });
    rdbmsState.instanceList = res.data?.rdbms || res.data || [];
    if (!Array.isArray(rdbmsState.instanceList)) rdbmsState.instanceList = [];
    if (!rdbmsState.selectedInstanceIds) rdbmsState.selectedInstanceIds = new Set();
    const liveIds = new Set(rdbmsState.instanceList.map(i => i.id));
    for (const selId of rdbmsState.selectedInstanceIds) {
      if (!liveIds.has(selId)) rdbmsState.selectedInstanceIds.delete(selId);
    }
    if (window.cloudBaristaCentralData) {
      window.cloudBaristaCentralData.rdbms = rdbmsState.instanceList;
      if (typeof window.notifyDataSubscribers === 'function') {
        window.notifyDataSubscribers();
      }
    }
    const tbody = document.getElementById('rdbmsTableBody');
    if (tbody) {
      tbody.innerHTML = renderInstanceRows();
      attachRowEvents();
    }
    if (typeof updateBatchToolbarState === 'function') {
      updateBatchToolbarState();
    }
  } catch (e) {
    console.warn('Silent refresh failed:', e);
  }
}

function notifyOperationComplete(op) {
  const modalContent = document.getElementById('rdbmsModalContent');
  const type = op.status === 'success' ? 'success' : (op.status === 'warning' ? 'warning' : 'error');
  if (modalContent) {
    showModalNotice(op.summaryText, type, 7000);
  } else {
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: type,
      title: op.status === 'success' ? 'Operation Completed' : 'Operation Notice',
      text: op.summaryText,
      showConfirmButton: false,
      timer: 7000,
      timerProgressBar: true,
    });
  }
}

/**
 * Open the RDBMS Management Modal
 * @param {string} [initialRdbmsId] - Optional instance ID to open directly into detail view
 */
export async function showRdbmsModal(initialRdbmsId = null) {
  const namespace = window.configNamespace || '';
  if (!namespace) {
    Swal.fire({
      icon: 'warning',
      title: 'Namespace Required',
      text: 'Please select a namespace from the top bar or settings first.',
      confirmButtonColor: '#3085d6',
    });
    return;
  }

  rdbmsState.namespace = namespace;
  rdbmsState.view = initialRdbmsId ? 'detail' : 'instances';
  rdbmsState.currentInstance = initialRdbmsId ? { id: initialRdbmsId, name: initialRdbmsId } : null;
  rdbmsState.filterText = '';
  rdbmsState.selectedProvider = 'all';
  rdbmsState.isFormOpen = false;
  rdbmsState.activeCapability = null;
  rdbmsState.adminUser = getSavedRdbmsUser();
  rdbmsState.adminPassword = getSavedRdbmsPassword();
  rdbmsState.databases = [];
  rdbmsState.secureTransport = null;

  ensureOpsTimer();

  // Load connection configurations & support matrix in background
  loadConnectionsAndSupport();

  Swal.fire({
    title: '🗄️ RDBMS Management (Relational DB)',
    html: `
      <style>
        .swal2-rdbms-modal { max-width: 1250px !important; position: relative !important; overflow: hidden !important; }
        .rdbms-modal-container { 
          text-align: left; 
          font-size: 14px; 
          line-height: 1.5; 
          color: #1e293b; 
          max-height: 78vh; 
          overflow-y: auto; 
          padding: 6px 10px; 
        }
        .rdbms-header-bar { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          background: #f8fafc; 
          padding: 12px 18px; 
          border-radius: 8px; 
          margin-bottom: 14px; 
          border: 1px solid #e2e8f0; 
        }
        .rdbms-header-title { 
          font-weight: 700; 
          font-size: 16px; 
          color: #0f172a; 
          display: flex; 
          align-items: center; 
          gap: 10px; 
        }
        .rdbms-badge { 
          padding: 4px 10px; 
          border-radius: 6px; 
          font-size: 12px; 
          font-weight: 600; 
          display: inline-block; 
        }
        .rdbms-badge-success { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
        .rdbms-badge-danger { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
        .rdbms-badge-warning { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
        .rdbms-badge-info { background: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc; }
        .rdbms-badge-secondary { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }

        .rdbms-card { 
          background: #ffffff; 
          border: 1px solid #e2e8f0; 
          border-radius: 8px; 
          padding: 16px; 
          margin-bottom: 14px; 
          box-shadow: 0 1px 3px rgba(0,0,0,0.05); 
        }
        .rdbms-card h6 { 
          margin: 0 0 14px 0; 
          font-size: 15px; 
          font-weight: 700; 
          color: #1e293b; 
          display: flex; 
          align-items: center; 
          justify-content: space-between; 
        }
        .rdbms-form-row { display: flex; gap: 14px; margin-bottom: 12px; flex-wrap: wrap; }
        .rdbms-form-col { flex: 1; min-width: 220px; }
        .rdbms-form-col label { 
          display: block; 
          margin-bottom: 6px; 
          font-size: 13.5px; 
          font-weight: 700; 
          color: #334155; 
        }
        .rdbms-form-control { 
          width: 100%; 
          height: 38px; 
          padding: 6px 12px; 
          font-size: 13.5px; 
          border: 1.5px solid #cbd5e1; 
          border-radius: 6px; 
          box-sizing: border-box; 
          background: #ffffff;
          color: #0f172a;
        }
        .rdbms-form-control:focus { 
          outline: none; 
          border-color: #0284c7; 
          box-shadow: 0 0 0 3px rgba(2,132,199,0.15); 
        }

        .rdbms-table-container { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #fff; }
        .rdbms-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .rdbms-table th { 
          background: #f8fafc; 
          color: #334155; 
          font-weight: 700; 
          font-size: 13.5px; 
          text-align: left; 
          padding: 11px 13px; 
          border-bottom: 1.5px solid #e2e8f0; 
        }
        .rdbms-table td { padding: 11px 13px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
        .rdbms-table tr:hover td { background-color: #f8fafc; }

        .rdbms-btn { 
          display: inline-flex; 
          align-items: center; 
          gap: 6px; 
          padding: 6px 12px; 
          font-size: 13px; 
          font-weight: 600; 
          border-radius: 6px; 
          border: 1px solid transparent; 
          cursor: pointer; 
          text-decoration: none; 
          transition: all 0.15s; 
        }
        .rdbms-btn:disabled, .rdbms-btn[disabled] { opacity: 0.65; cursor: not-allowed !important; }
        .rdbms-btn-primary { background: #0284c7; color: #fff; border-color: #0369a1; }
        .rdbms-btn-primary:hover { background: #0369a1; }
        .rdbms-btn-success { background: #16a34a; color: #fff; border-color: #15803d; }
        .rdbms-btn-success:hover { background: #15803d; }
        .rdbms-btn-secondary { background: #f1f5f9; color: #334155; border-color: #cbd5e1; }
        .rdbms-btn-secondary:hover { background: #e2e8f0; }
        .rdbms-btn-danger { background: #fff; color: #dc2626; border-color: #fca5a5; }
        .rdbms-btn-danger:hover { background: #fee2e2; }

        /* CSP Tiles */
        .rdbms-csp-container { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
        .rdbms-csp-tile {
          display: flex; align-items: center; gap: 8px; padding: 7px 13px;
          border: 1.5px solid #cbd5e1; border-radius: 8px; background: #ffffff;
          cursor: pointer; transition: all 0.15s ease; user-select: none;
        }
        .rdbms-csp-tile:hover { border-color: #7dd3fc; background: #f8fafc; }
        .rdbms-csp-tile.active {
          border-color: #0284c7; background: #f0f9ff;
          box-shadow: 0 0 0 2px rgba(2,132,199,0.25);
        }
        .rdbms-csp-logo { width: 20px; height: 20px; object-fit: contain; }
        .rdbms-csp-name { font-weight: 700; font-size: 13px; color: #0f172a; }
        .rdbms-csp-count { font-size: 11.5px; font-weight: 600; color: #475569; background: #f1f5f9; padding: 2px 7px; border-radius: 10px; }
        .rdbms-csp-tile.active .rdbms-csp-count { background: #bae6fd; color: #0369a1; }

        .rdbms-csp-info-box {
          background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
          padding: 10px 16px; margin-bottom: 14px; font-size: 13px; line-height: 1.6;
        }

        .rdbms-notice-banner {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; padding: 12px 18px; border-radius: 8px; margin: 6px 10px 14px 10px;
          font-size: 13.5px; line-height: 1.5; box-shadow: 0 1px 3px rgba(0,0,0,0.06);
          animation: rdbmsSlideDown 0.25s ease-out;
        }
        .rdbms-notice-content { display: flex; align-items: center; gap: 10px; flex: 1; text-align: left; }
        .rdbms-notice-icon { font-size: 18px; }
        .rdbms-notice-text { font-weight: 500; word-break: break-word; }
        .rdbms-notice-success { background: #f0fdf4; border: 1.5px solid #86efac; color: #166534; }
        .rdbms-notice-error { background: #fef2f2; border: 1.5px solid #fca5a5; color: #991b1b; }
        .rdbms-notice-warning { background: #fffbeb; border: 1.5px solid #fde68a; color: #92400e; }
        .rdbms-notice-info { background: #eff6ff; border: 1.5px solid #bfdbfe; color: #1e40af; }
        .rdbms-notice-close { background: none; border: none; font-size: 20px; cursor: pointer; color: inherit; line-height: 1; }

        .rdbms-confirm-overlay {
          position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(3px); z-index: 1000;
          display: flex; align-items: center; justify-content: center; padding: 24px;
          box-sizing: border-box; border-radius: 15px; animation: rdbmsFadeIn 0.15s ease-out;
        }
        .rdbms-confirm-card {
          background: #ffffff; border-radius: 12px; padding: 26px 28px; max-width: 520px;
          width: 100%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3); text-align: center;
          border: 1px solid #e2e8f0;
        }
        .rdbms-confirm-title { margin: 0 0 10px 0; font-size: 18px; font-weight: 700; color: #0f172a; }
        .rdbms-confirm-body { font-size: 14px; color: #334155; margin-bottom: 20px; line-height: 1.6; }
        .rdbms-confirm-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }

        .rdbms-dialog-overlay {
          position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 23, 42, 0.68); backdrop-filter: blur(4px); z-index: 1050;
          display: flex; align-items: center; justify-content: center; padding: 20px;
          box-sizing: border-box; border-radius: 12px; animation: rdbmsFadeIn 0.15s ease-out;
        }
        .rdbms-dialog-card {
          background: #ffffff; border-radius: 12px; padding: 22px 24px; max-width: 740px;
          width: 100%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3); text-align: left;
          border: 1px solid #e2e8f0; max-height: 85vh; display: flex; flex-direction: column;
          box-sizing: border-box;
        }
        .rdbms-dialog-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1.5px solid #e2e8f0;
        }
        .rdbms-dialog-title {
          margin: 0; font-size: 17px; font-weight: 700; color: #0f172a;
          display: flex; align-items: center; gap: 8px;
        }
        .rdbms-dialog-close {
          background: none; border: none; font-size: 24px; color: #94a3b8;
          cursor: pointer; line-height: 1; padding: 0 4px; transition: color 0.15s ease;
        }
        .rdbms-dialog-close:hover { color: #0f172a; }
        .rdbms-dialog-body {
          font-size: 13.5px; color: #334155; margin-bottom: 16px; line-height: 1.5;
          overflow-y: auto; flex: 1; padding-right: 4px;
        }
        .rdbms-dialog-actions {
          display: flex; gap: 10px; justify-content: flex-end; padding-top: 12px;
          border-top: 1.5px solid #f1f5f9;
        }

        @keyframes rdbmsSlideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes rdbmsFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes rdbmsRotate { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .rdbms-spin, .fa-spin {
          display: inline-block !important;
          animation: rdbmsRotate 0.85s infinite linear !important;
          transform-origin: 50% 50% !important;
        }
        .rdbms-spinner {
          display: inline-block;
          width: 18px;
          height: 18px;
          border: 2.5px solid rgba(2, 132, 199, 0.2);
          border-top-color: #0284c7;
          border-radius: 50%;
          animation: rdbmsRotate 0.85s infinite linear;
          box-sizing: border-box;
          vertical-align: middle;
        }
        .rdbms-spinner-sm {
          width: 14px;
          height: 14px;
          border-width: 2px;
        }
        .rdbms-table tr.rdbms-row-selected td {
          background-color: #f0f9ff !important;
        }
        .rdbms-dropdown-item {
          transition: background 0.12s ease;
        }
        .rdbms-dropdown-item:hover {
          background-color: #f1f5f9 !important;
        }
      </style>
      <div class="rdbms-modal-wrapper" style="position: relative; width: 100%;">
        <!-- In-Modal Notice Banner -->
        <div id="rdbmsNoticeBanner" class="rdbms-notice-banner" style="display: none;"></div>

        <!-- In-Modal Main Content -->
        <div id="rdbmsModalContent" class="rdbms-modal-container">
          <div style="text-align: center; padding: 30px;">
            <i class="fas fa-circle-notch rdbms-spin fa-2x" style="color: #0284c7;"></i>
            <div class="mt-2 text-muted">Loading RDBMS data and support matrix...</div>
          </div>
        </div>

        <!-- In-Modal Confirm Overlay -->
        <div id="rdbmsConfirmOverlay" class="rdbms-confirm-overlay" style="display: none;">
          <div class="rdbms-confirm-card" id="rdbmsConfirmCard">
            <div id="rdbmsConfirmIcon"></div>
            <h4 id="rdbmsConfirmTitle" class="rdbms-confirm-title"></h4>
            <div id="rdbmsConfirmBody" class="rdbms-confirm-body"></div>
            <div id="rdbmsConfirmActions" class="rdbms-confirm-actions"></div>
          </div>
        </div>

        <!-- In-Modal Custom Dialog Overlay (for Batch Remote Test & Sub-Modals) -->
        <div id="rdbmsDialogOverlay" class="rdbms-dialog-overlay" style="display: none;">
          <div class="rdbms-dialog-card" id="rdbmsDialogCard">
            <div class="rdbms-dialog-header">
              <h4 id="rdbmsDialogTitle" class="rdbms-dialog-title"></h4>
              <button type="button" class="rdbms-dialog-close" id="rdbmsDialogCloseBtn" title="Close">&times;</button>
            </div>
            <div id="rdbmsDialogValidation" style="display: none; color: #b91c1c; background: #fee2e2; border: 1px solid #fca5a5; padding: 7px 12px; border-radius: 6px; font-size: 12.5px; margin-bottom: 12px;"></div>
            <div id="rdbmsDialogBody" class="rdbms-dialog-body"></div>
            <div id="rdbmsDialogActions" class="rdbms-dialog-actions"></div>
          </div>
        </div>
      </div>
    `,
    width: '85%',
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '✖ Close',
    customClass: {
      popup: 'swal2-rdbms-modal',
    },
    didOpen: async () => {
      await renderModalView();
      if (rdbmsState.pendingNotice) {
        showModalNotice(rdbmsState.pendingNotice.message, rdbmsState.pendingNotice.type);
        rdbmsState.pendingNotice = null;
      }
    },
  });
}

// --- Background Data Loaders ---
async function loadConnectionsAndSupport() {
  const config = getConfig();
  try {
    const [connRes, supRes, tmplRes] = await Promise.all([
      axios.get(`${tbApiBase()}/connConfig?filterVerified=true`, {
        auth: { username: config.username, password: config.password },
      }).catch(() => ({ data: { connectionconfig: [] } })),
      axios.get(`${tbApiBase()}/rdbms/support`, {
        auth: { username: config.username, password: config.password },
      }).catch(() => ({ data: { supports: {} } })),
      axios.get(`${tbApiBase()}/ns/system/template/infra/infra-db-bastion`, {
        auth: { username: config.username, password: config.password },
      }).catch(() => null),
    ]);

    rdbmsState.connections = connRes.data?.connectionconfig || [];
    rdbmsState.supportMatrix = supRes.data?.supports || {};
    if (tmplRes?.data && tmplRes.data.infraDynamicReq) {
      rdbmsState.bastionTemplate = tmplRes.data;
    } else {
      rdbmsState.bastionTemplate = DEFAULT_BASTION_TEMPLATE;
    }
  } catch (e) {
    console.warn('Failed loading connections or support matrix', e);
  }
}

// --- Main View Router ---
async function renderModalView() {
  const container = document.getElementById('rdbmsModalContent');
  if (!container) return;

  if (rdbmsState.view === 'instances') {
    await renderInstanceListView(container);
  } else if (rdbmsState.view === 'detail') {
    await renderInstanceDetailView(container);
  }
}

// --- View 1: RDBMS Instance List View ---
async function renderInstanceListView(container) {
  const config = getConfig();
  container.innerHTML = `
    <div style="text-align: center; padding: 25px;">
      <i class="fas fa-circle-notch rdbms-spin fa-2x" style="color: #0284c7;"></i>
      <div class="mt-2 text-muted">Refreshing RDBMS instances...</div>
    </div>
  `;

  // Fetch instances from Tumblebug
  try {
    const res = await axios.get(`${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms`, {
      auth: { username: config.username, password: config.password },
    });
    rdbmsState.instanceList = res.data?.rdbms || res.data || [];
    if (!Array.isArray(rdbmsState.instanceList)) rdbmsState.instanceList = [];
    if (!rdbmsState.selectedInstanceIds) rdbmsState.selectedInstanceIds = new Set();
    const liveIds = new Set(rdbmsState.instanceList.map(i => i.id));
    for (const selId of rdbmsState.selectedInstanceIds) {
      if (!liveIds.has(selId)) rdbmsState.selectedInstanceIds.delete(selId);
    }
    if (window.cloudBaristaCentralData) {
      window.cloudBaristaCentralData.rdbms = rdbmsState.instanceList;
      if (typeof window.notifyDataSubscribers === 'function') {
        window.notifyDataSubscribers();
      }
    }
  } catch (e) {
    console.error('Failed to load RDBMS instances:', e);
    rdbmsState.instanceList = [];
  }

  // Ensure support matrix & connections are loaded
  if (!rdbmsState.supportMatrix) {
    await loadConnectionsAndSupport();
  }

  // Group instances by provider
  const instancesByProvider = {};
  (rdbmsState.instanceList || []).forEach(inst => {
    const prov = (inst.connectionConfig?.providerName || inst.connectionName?.split('-')[0] || 'other').toLowerCase();
    instancesByProvider[prov] = (instancesByProvider[prov] || 0) + 1;
  });

  const totalCount = (rdbmsState.instanceList || []).length;

  // Providers list
  const knownProviders = ['aws', 'azure', 'gcp', 'alibaba', 'tencent', 'ibm', 'ncp', 'nhn', 'openstack'];

  const isAllActive = (!rdbmsState.selectedProvider || rdbmsState.selectedProvider === 'all') ? 'active' : '';
  const allTileHtml = `
    <div class="rdbms-csp-tile ${isAllActive}" data-provider="all" title="All Clouds (${totalCount} instances)">
      <i class="fas fa-globe" style="font-size: 18px; color: #0284c7; margin-bottom: 2px;"></i>
      <span class="rdbms-csp-name">ALL</span>
      <span class="rdbms-csp-count">${totalCount}</span>
    </div>
  `;

  const cspTilesHtml = allTileHtml + knownProviders.map(p => {
    const meta = getProviderMeta(p);
    const count = instancesByProvider[p] || 0;
    const isActive = rdbmsState.selectedProvider === p ? 'active' : '';
    const isSupported = rdbmsState.supportMatrix?.[p]?.supported !== false;
    return `
      <div class="rdbms-csp-tile ${isActive}" data-provider="${p}" title="${escapeHtml(meta.name)} (${count} instances)">
        <img src="${meta.icon}" class="rdbms-csp-logo" onerror="this.src='/img/circle.png';">
        <span class="rdbms-csp-name">${escapeHtml(meta.name)}</span>
        <span class="rdbms-csp-count">${count}</span>
        ${!isSupported ? '<span style="color:#ef4444;font-size:10px;">(N/A)</span>' : ''}
      </div>
    `;
  }).join('');

  // CSP Info Box
  let infoBoxContent = '';
  if (!rdbmsState.selectedProvider || rdbmsState.selectedProvider === 'all') {
    infoBoxContent = `
      <div style="display: flex; gap: 16px; flex-wrap: wrap;">
        <div><strong>Scope:</strong> <span class="rdbms-badge rdbms-badge-info" style="padding: 2px 6px;">All Supported Clouds (9 Providers)</span></div>
        <div><strong>Supported Engines:</strong> MySQL, MariaDB</div>
        <div><strong>Total Instances:</strong> ${totalCount} Instance${totalCount === 1 ? '' : 's'}</div>
      </div>
      <div style="margin-top: 4px; color: #64748b; font-size: 12px;">ℹ️ Showing RDBMS instances across all cloud providers. Select a specific cloud above to filter instances and inspect provider-native capabilities and constraints.</div>
    `;
  } else {
    const selCsp = rdbmsState.selectedProvider;
    const cspSup = rdbmsState.supportMatrix?.[selCsp] || {};
    const enginesStr = (cspSup.supportedDBEngines || ['mysql']).join(', ');
    const opMethod = cspSup.dbOperationMethod || 'cspNativeApi';
    const tagStr = cspSup.supportsTag ? '✅ Supported' : '❌ Unsupported';
    const storageSelectStr = cspSup.storageTypeSelectable ? '✅ User Selectable' : '⚙️ Auto-managed';
    const cspNote = cspSup.note ? `<div style="margin-top:4px;color:#64748b;font-size:12px;">ℹ️ ${escapeHtml(cspSup.note)}</div>` : '';
    infoBoxContent = `
      <div style="display: flex; gap: 16px; flex-wrap: wrap;">
        <div><strong>Engines:</strong> <span class="rdbms-badge rdbms-badge-info" style="padding: 2px 6px;">${escapeHtml(enginesStr)}</span></div>
        <div><strong>DB Op Method:</strong> <code>${escapeHtml(opMethod)}</code></div>
        <div><strong>Tag Support:</strong> ${tagStr}</div>
        <div><strong>Storage Type:</strong> ${storageSelectStr}</div>
      </div>
      ${cspNote}
    `;
  }

  container.innerHTML = `
    <!-- Top Header Bar -->
    <div class="rdbms-header-bar">
      <div class="rdbms-header-title">
        <span>🗄️ Managed RDBMS</span>
        <span class="rdbms-badge rdbms-badge-info">Namespace: ${escapeHtml(rdbmsState.namespace)}</span>
        <span class="rdbms-badge rdbms-badge-secondary">${totalCount} Total Instance${totalCount === 1 ? '' : 's'}</span>
      </div>
      <div style="display: flex; gap: 8px;">
        <button type="button" class="rdbms-btn rdbms-btn-secondary" id="rdbmsClearCredsBtn" title="Purge saved DB passwords from browser storage" style="color: #dc2626;">
          <i class="fas fa-trash-alt"></i> Clear Passwords
        </button>
        <button type="button" class="rdbms-btn rdbms-btn-secondary" id="rdbmsRefreshBtn" title="Refresh instances">
          <i class="fas fa-sync-alt"></i> Refresh
        </button>
        <button type="button" class="rdbms-btn rdbms-btn-secondary" id="rdbmsReconcileAllBtn" title="Reconcile all RDBMS instances">
          <i class="fas fa-tools"></i> Reconcile All
        </button>
        <button type="button" class="rdbms-btn rdbms-btn-primary" id="rdbmsToggleCreateFormBtn">
          <i class="fas fa-plus"></i> ${rdbmsState.isFormOpen ? 'Cancel' : 'New RDBMS Instance'}
        </button>
      </div>
    </div>

    <!-- Active Background Operations Panel -->
    <div id="rdbmsActiveOpsContainer">
      ${generateActiveOperationsHtml()}
    </div>

    <!-- CSP Filter & Info Box -->
    <div class="rdbms-card" style="padding: 12px 16px; margin-bottom: 12px;">
      <div style="font-weight: 700; font-size: 13px; color: #475569; margin-bottom: 8px;">Filter by Cloud Service Provider (CSP)</div>
      <div id="rdbmsCspContainer" class="rdbms-csp-container">
        ${cspTilesHtml}
      </div>
      <div class="rdbms-csp-info-box" id="rdbmsCspInfoBox">
        ${infoBoxContent}
      </div>
    </div>

    <!-- Create Instance Collapsible Form -->
    <div id="rdbmsCreateFormCard" class="rdbms-card" style="display: ${rdbmsState.isFormOpen ? 'block' : 'none'}; border-left: 4px solid #0284c7;">
      <h6>
        <span><i class="fas fa-database" style="color: #0284c7; margin-right: 6px;"></i> Create New RDBMS Instance</span>
        <button type="button" class="rdbms-btn rdbms-btn-secondary" id="rdbmsCloseFormBtn" style="padding: 2px 8px; font-size: 12px;">✕ Close</button>
      </h6>

      <!-- Mode Selector Tabs -->
      <div style="display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
        <button type="button" class="rdbms-btn ${rdbmsState.provisionMode === 'bastion-set' ? 'rdbms-btn-primary' : 'rdbms-btn-secondary'}" id="rdbmsModeBastionBtn" style="font-weight: 700;">
          <i class="fas fa-rocket"></i> 🚀 Bastion Set Provisioning (Recommended)
        </button>
        <button type="button" class="rdbms-btn ${rdbmsState.provisionMode === 'manual' ? 'rdbms-btn-primary' : 'rdbms-btn-secondary'}" id="rdbmsModeManualBtn" style="font-weight: 700;">
          <i class="fas fa-network-wired"></i> ⚙️ Existing Network (Advanced)
        </button>
      </div>

      <form id="rdbmsCreateForm" novalidate onsubmit="return false;">
        <!-- MODE 1: Bastion Set Provisioning (Single or Multi-CSP) -->
        <div id="rdbmsBastionSetSection" style="display: ${rdbmsState.provisionMode === 'bastion-set' ? 'block' : 'none'};">
          <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
            <div style="font-weight: 700; color: #0369a1; font-size: 13.5px; margin-bottom: 6px;">
              <i class="fas fa-shield-alt"></i> Zero-Config Multi-Cloud Bastion & Private RDBMS Set
            </div>
            <div style="font-size: 12.5px; color: #0c4a6e; line-height: 1.5;">
              Automatically provisions dedicated Bastion Infras (<code>infra-db-&lt;name&gt;-&lt;csp&gt;-&lt;region&gt;</code>) per NodeGroup/CSP preloaded with <code>mysql-client</code>, <code>mariadb-client</code>, and <code>netcat</code>, paired with isolated private VNets and security groups. Select one or more CSPs below to deploy in a single cloud or orchestrate a multi-cloud database laboratory.
            </div>
          </div>

          <!-- Target CSP Selection (Multi-select) -->
          <div style="margin-bottom: 14px;">
            <label style="font-weight: 700; color: #334155; margin-bottom: 6px; display: block;">Select Target CSP(s) (Single or Multi-Cloud):</label>
            <div id="rdbmsMultiCspCheckboxes" style="display: flex; gap: 10px; flex-wrap: wrap;">
              ${['aws', 'azure', 'gcp', 'ncp', 'nhn', 'alibaba', 'tencent', 'ibm', 'openstack'].map(p => {
                const meta = getProviderMeta(p);
                const checked = rdbmsState.multiCspSelected.includes(p) ? 'checked' : '';
                return `
                  <label style="display: flex; align-items: center; gap: 6px; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 13px; font-weight: 600;">
                    <input type="checkbox" class="rdbms-csp-check" value="${p}" ${checked} style="accent-color: #0284c7; width: 15px; height: 15px;">
                    <img src="${meta.icon}" style="width: 16px; height: 16px; object-fit: contain;" onerror="this.src='/img/circle.png';">
                    ${meta.name}
                  </label>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Network Exposure & Public Access Policy -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; margin-bottom: 14px;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
              <label style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #334155; margin: 0; cursor: pointer; font-size: 13px;">
                <input type="checkbox" id="rdbmsBastionPublicAccessCheck" style="width: 16px; height: 16px; accent-color: #0284c7;">
                <span>Public Access (Assign Public IP / FQDN)</span>
              </label>
              <div id="rdbmsPublicAccessLockNote"></div>
            </div>
            <div style="font-size: 12px; color: #64748b; margin-top: 4px; margin-left: 24px;">
              Default is isolated private VPC mode (internal Bastion access only). When enabled, databases are also accessible externally via public endpoints.
            </div>
            <div id="rdbmsCspPublicAccessPreview" style="margin-top: 6px;"></div>
          </div>
        </div>

        <!-- MODE 2: Manual / Existing Network Config -->
        <div id="rdbmsManualNetSection" style="display: ${rdbmsState.provisionMode === 'manual' ? 'block' : 'none'};">
          <div class="rdbms-form-row">
            <div class="rdbms-form-col">
              <label for="rdbmsConnSelect">Target Connection (Region) *</label>
              <select class="rdbms-form-control" id="rdbmsConnSelect">
                <option value="">-- Select Connection --</option>
              </select>
            </div>
            <div class="rdbms-form-col">
              <label for="rdbmsVNetSelect">VNet (Virtual Network) *</label>
              <select class="rdbms-form-control" id="rdbmsVNetSelect">
                <option value="">-- Select VNet --</option>
              </select>
            </div>
            <div class="rdbms-form-col">
              <label for="rdbmsSubnetSelect">Subnet(s)</label>
              <select class="rdbms-form-control" id="rdbmsSubnetSelect">
                <option value="">-- Select Subnet (or leave empty) --</option>
              </select>
            </div>
            <div class="rdbms-form-col">
              <label for="rdbmsSgSelect">Security Group(s)</label>
              <select class="rdbms-form-control" id="rdbmsSgSelect">
                <option value="">-- Select Security Group --</option>
              </select>
            </div>
          </div>

          <!-- AutoFill Defaults Option -->
          <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px;">
            <label style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #15803d; margin: 0; cursor: pointer;">
              <input type="checkbox" id="rdbmsAutoFillDefaults" checked style="width: 16px; height: 16px; accent-color: #16a34a;">
              AutoFill Recommended Defaults (Recommended)
            </label>
            <div style="font-size: 12.5px; color: #166534; margin-top: 4px; margin-left: 24px;">
              CB-Tumblebug will automatically choose the verified engine version, smallest reliable DB instance spec, and compatible storage type for this CSP.
            </div>
          </div>

          <!-- Custom Spec & Storage (Shown if AutoFill is unchecked) -->
          <div id="rdbmsManualSpecFields" style="display: none; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 14px;">
            <div style="font-weight: 700; font-size: 13px; color: #334155; margin-bottom: 8px;">Custom Specification & Storage Configuration</div>
            <div class="rdbms-form-row">
              <div class="rdbms-form-col">
                <label for="rdbmsEngineVersionInput">Engine Version</label>
                <input type="text" class="rdbms-form-control" id="rdbmsEngineVersionInput" placeholder="e.g. 8.0">
              </div>
              <div class="rdbms-form-col">
                <label for="rdbmsSpecInput">DB Instance Spec</label>
                <input type="text" class="rdbms-form-control" id="rdbmsSpecInput" placeholder="e.g. db.t3.medium">
              </div>
              <div class="rdbms-form-col">
                <label for="rdbmsStorageTypeInput">Storage Type</label>
                <input type="text" class="rdbms-form-control" id="rdbmsStorageTypeInput" placeholder="e.g. gp3">
              </div>
              <div class="rdbms-form-col">
                <label for="rdbmsStorageSizeInput">Storage Size (GB)</label>
                <input type="number" class="rdbms-form-control" id="rdbmsStorageSizeInput" placeholder="e.g. 100" min="10">
              </div>
            </div>
          </div>

          <!-- Options: HA, Public Access, Deletion Protection -->
          <div class="rdbms-form-row" style="background: #f8fafc; padding: 10px 14px; border-radius: 6px; align-items: center; margin-bottom: 14px;">
            <div style="display: flex; gap: 20px; flex-wrap: wrap;">
              <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
                <input type="checkbox" id="rdbmsHaCheck"> High Availability (Multi-AZ)
              </label>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
                <input type="checkbox" id="rdbmsPublicAccessCheck"> Public Access
              </label>
              <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;">
                <input type="checkbox" id="rdbmsDelProtectCheck"> Deletion Protection
              </label>
            </div>
          </div>
        </div>

        <!-- Common Fields: Instance Name, Engine, Credentials -->
        <div class="rdbms-form-row">
          <div class="rdbms-form-col">
            <label for="rdbmsNameInput">Instance Name / Prefix *</label>
            <input type="text" class="rdbms-form-control" id="rdbmsNameInput" placeholder="e.g. rdbms-01">
          </div>
          <div class="rdbms-form-col">
            <label for="rdbmsEngineSelect">Database Engine *</label>
            <select class="rdbms-form-control" id="rdbmsEngineSelect">
              <option value="mysql">MySQL</option>
              <option value="mariadb">MariaDB</option>
            </select>
          </div>
        </div>

        <div class="rdbms-form-row">
          <div class="rdbms-form-col">
            <label for="rdbmsAdminUserInput">Master Admin Username *</label>
            <input type="text" class="rdbms-form-control" id="rdbmsAdminUserInput" placeholder="e.g. dbadmin" value="${escapeHtml(getSavedRdbmsUser() || 'dbadmin')}">
            <div id="rdbmsCspUserPreview">
              ${renderCspUserPreviewHtml(rdbmsState.multiCspSelected, getSavedRdbmsUser() || 'dbadmin')}
            </div>
          </div>
          <div class="rdbms-form-col">
            <label for="rdbmsAdminPassInput">Master Admin Password *</label>
            <div style="position: relative;">
              <input type="password" class="rdbms-form-control" id="rdbmsAdminPassInput" placeholder="Min 8 chars (15 for IBM), letters + digits/symbols" autocomplete="new-password" value="${escapeHtml(getSavedRdbmsPassword() || '')}" style="padding-right: 36px;">
              <button type="button" id="rdbmsTogglePassBtn" style="position: absolute; right: 8px; top: 8px; background: none; border: none; color: #64748b; cursor: pointer;">
                <i class="fas fa-eye"></i>
              </button>
            </div>
            <small class="text-muted" style="font-size: 11.5px;">Letters + numbers/symbols (min 8 chars, 15 for IBM). Zero-credential policy.</small>
            ${renderRememberPasswordCheckboxHtml()}
          </div>
        </div>

        <!-- Buttons: Validate & Create -->
        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px;">
          <button type="button" class="rdbms-btn rdbms-btn-secondary" id="rdbmsValidateBtn" style="display: ${rdbmsState.provisionMode === 'manual' ? 'inline-flex' : 'none'};">
            <i class="fas fa-check-double"></i> Validate (Dry Run)
          </button>
          <button type="button" class="rdbms-btn rdbms-btn-primary" id="rdbmsSubmitCreateBtn">
            <i class="fas fa-rocket"></i> ${rdbmsState.provisionMode === 'bastion-set' ? 'Deploy DB & Bastion Set' : 'Create RDBMS Instance'}
          </button>
        </div>
      </form>
    </div>

    <!-- Instances Table Card -->
    <div class="rdbms-card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <h6 style="margin: 0;">Instances in Namespace</h6>
          <span class="rdbms-badge rdbms-badge-info" id="rdbmsSelectedCountBadge" style="display: none; font-size: 11.5px; padding: 2px 7px;">0 Selected</span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <!-- Quick Selection Dropdown -->
          <div style="position: relative; display: inline-block;">
            <button type="button" class="rdbms-btn rdbms-btn-secondary" id="rdbmsQuickSelectBtn" style="padding: 5px 10px; font-size: 12px;" title="Quick Select Instances">
              <i class="far fa-check-square"></i> Select <i class="fas fa-caret-down" style="font-size: 10px; margin-left: 2px;"></i>
            </button>
            <div id="rdbmsQuickSelectMenu" style="display: none; position: absolute; right: 0; top: calc(100% + 4px); z-index: 200; min-width: 170px; background: #fff; border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.12); padding: 4px 0; font-size: 12.5px;">
              <a href="javascript:void(0)" class="rdbms-dropdown-item" data-select="available" style="display: flex; align-items: center; gap: 8px; padding: 6px 12px; color: #1e293b; text-decoration: none;">
                <span class="rdbms-badge rdbms-badge-success" style="font-size: 10px; padding: 1px 5px;">Available</span> Active Only
              </a>
              <a href="javascript:void(0)" class="rdbms-dropdown-item" data-select="failed" style="display: flex; align-items: center; gap: 8px; padding: 6px 12px; color: #1e293b; text-decoration: none;">
                <span class="rdbms-badge rdbms-badge-danger" style="font-size: 10px; padding: 1px 5px;">Failed</span> Failed Only
              </a>
              <a href="javascript:void(0)" class="rdbms-dropdown-item" data-select="all" style="display: flex; align-items: center; gap: 8px; padding: 6px 12px; color: #1e293b; text-decoration: none;">
                <i class="fas fa-check-double text-muted" style="width: 14px;"></i> All Visible
              </a>
              <div style="border-top: 1px solid #f1f5f9; margin: 3px 0;"></div>
              <a href="javascript:void(0)" class="rdbms-dropdown-item" data-select="none" style="display: flex; align-items: center; gap: 8px; padding: 6px 12px; color: #64748b; text-decoration: none;">
                <i class="fas fa-ban text-muted" style="width: 14px;"></i> Clear Selection
              </a>
            </div>
          </div>

          <!-- Batch Action Buttons -->
          <button type="button" class="rdbms-btn rdbms-btn-primary" id="rdbmsBatchTestBtn" disabled title="Test selected instances in parallel via in-VPC Bastion nodes" style="padding: 5px 11px; font-size: 12px;">
            <i class="fas fa-bolt"></i> Batch Test
          </button>
          <button type="button" class="rdbms-btn rdbms-btn-secondary" id="rdbmsBatchReconcileBtn" disabled title="Reconcile selected instances against CSP status" style="padding: 5px 10px; font-size: 12px;">
            <i class="fas fa-tools"></i> Reconcile
          </button>
          <button type="button" class="rdbms-btn rdbms-btn-danger" id="rdbmsBatchDeleteBtn" disabled title="Permanently delete selected instances" style="padding: 5px 11px; font-size: 12px;">
            <i class="fas fa-trash-alt"></i> Batch Terminate
          </button>

          <!-- Search Filter -->
          <input type="text" class="rdbms-form-control" id="rdbmsFilterInput" placeholder="🔍 Search name, endpoint..." style="width: 180px; height: 32px; font-size: 12px;" value="${escapeHtml(rdbmsState.filterText)}">
        </div>
      </div>
      <div class="rdbms-table-container">
        <table class="rdbms-table">
          <thead>
            <tr>
              <th style="width: 36px; text-align: center; padding: 10px 4px;">
                <input type="checkbox" id="rdbmsSelectAllCheck" style="width: 15px; height: 15px; accent-color: #0284c7; cursor: pointer; vertical-align: middle;" title="Select / Deselect all visible instances">
              </th>
              <th>Instance Name / ID</th>
              <th>Status</th>
              <th>CSP / Region</th>
              <th>Engine</th>
              <th>Spec / Storage</th>
              <th>Endpoint</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody id="rdbmsTableBody">
            ${renderInstanceRows()}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Bind Event Listeners
  attachInstanceListEvents();
}

function renderInstanceRows() {
  let list = rdbmsState.instanceList || [];

  // Filter by selected provider
  if (rdbmsState.selectedProvider && rdbmsState.selectedProvider !== 'all') {
    list = list.filter(inst => {
      const prov = (inst.connectionConfig?.providerName || inst.connectionName?.split('-')[0] || '').toLowerCase();
      return prov === rdbmsState.selectedProvider;
    });
  }

  // Filter by text
  if (rdbmsState.filterText) {
    const q = rdbmsState.filterText.toLowerCase();
    list = list.filter(inst => {
      const accessLabel = inst.publicAccess ? 'public' : 'private';
      return (inst.name && inst.name.toLowerCase().includes(q)) ||
        (inst.id && inst.id.toLowerCase().includes(q)) ||
        (inst.endpoint && inst.endpoint.toLowerCase().includes(q)) ||
        (inst.dbEngine && inst.dbEngine.toLowerCase().includes(q)) ||
        (inst.status && inst.status.toLowerCase().includes(q)) ||
        accessLabel.includes(q);
    });
  }

  if (list.length === 0) {
    const provLabel = (!rdbmsState.selectedProvider || rdbmsState.selectedProvider === 'all')
      ? ''
      : ` in <strong>${escapeHtml(rdbmsState.selectedProvider.toUpperCase())}</strong>`;
    return `
      <tr>
        <td colspan="8" style="text-align: center; padding: 30px; color: #64748b;">
          <i class="fas fa-database fa-2x" style="color: #cbd5e1; margin-bottom: 8px;"></i>
          <div>No RDBMS instances found${provLabel} for namespace <strong>${escapeHtml(rdbmsState.namespace)}</strong>.</div>
        </td>
      </tr>
    `;
  }

  return list.map(inst => {
    const isSelected = rdbmsState.selectedInstanceIds && rdbmsState.selectedInstanceIds.has(inst.id);
    const prov = (inst.connectionConfig?.providerName || inst.connectionName?.split('-')[0] || 'other').toLowerCase();
    const meta = getProviderMeta(prov);
    const activeDeletion = rdbmsActiveOperations.find(op =>
      (op.type === 'delete-instance' && op.status === 'running' && (op.instanceId === inst.id || op.instanceName === inst.name)) ||
      (op.type === 'batch-delete' && op.status === 'running' && op.instanceIds && (op.instanceIds.includes(inst.id) || op.instanceIds.includes(inst.name)))
    );

    const status = inst.status || 'Unknown';
    let statusBadge = 'rdbms-badge-secondary';
    if (activeDeletion) {
      statusBadge = 'rdbms-badge-danger';
    } else if (status.toLowerCase() === 'available') {
      statusBadge = 'rdbms-badge-success';
    } else if (status.toLowerCase().includes('creating') || status.toLowerCase().includes('handling')) {
      statusBadge = 'rdbms-badge-warning';
    } else if (status.toLowerCase().includes('fail') || status.toLowerCase().includes('error')) {
      statusBadge = 'rdbms-badge-danger';
    }

    const statusHtml = activeDeletion
      ? `<span class="rdbms-badge rdbms-badge-danger"><span class="rdbms-spinner rdbms-spinner-danger rdbms-spinner-sm" style="margin-right: 4px;"></span> Terminating...</span>`
      : `<span class="rdbms-badge ${statusBadge}">${escapeHtml(status)}</span>`;

    const accessBadgeHtml = inst.publicAccess
      ? `<span class="rdbms-badge" style="background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; font-size: 10.5px; padding: 1px 6px;" title="Public Access Enabled (External IP / FQDN)">🌐 Public</span>`
      : `<span class="rdbms-badge" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; font-size: 10.5px; padding: 1px 6px;" title="Private VPC Only (Internal Access)">🔒 Private</span>`;

    const endpointStr = inst.endpoint
      ? `<div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
           ${accessBadgeHtml}
           <span style="font-family: monospace; font-size: 12px;">${escapeHtml(inst.endpoint)}</span>
           <button type="button" class="btn btn-sm btn-link p-0 text-primary copy-btn" data-copy="${escapeHtml(inst.endpoint)}" title="Copy endpoint">
             <i class="far fa-copy"></i>
           </button>
         </div>`
      : `<div style="display: flex; align-items: center; gap: 5px;">
           ${accessBadgeHtml}
           <span class="text-muted" style="font-size: 12px;">Pending</span>
         </div>`;

    const specStorageStr = `${escapeHtml(inst.dbInstanceSpec || 'default')}` +
      (inst.storageSize ? ` · ${inst.storageSize}GB ${escapeHtml(inst.storageType || '')}` : '');

    const isFailed = status.toLowerCase().includes('fail') || status.toLowerCase().includes('error');

    const actionButtonsHtml = activeDeletion
      ? `
        <button type="button" class="rdbms-btn rdbms-btn-secondary" disabled title="Termination in progress in background...">
          <i class="fas fa-terminal"></i> Test
        </button>
        <button type="button" class="rdbms-btn rdbms-btn-primary" disabled title="Termination in progress in background...">
          <i class="fas fa-sliders-h"></i> Manage
        </button>
        <button type="button" class="rdbms-btn rdbms-btn-secondary" disabled title="Termination in progress in background...">
          <i class="fas fa-sync-alt"></i>
        </button>
        <button type="button" class="rdbms-btn rdbms-btn-danger" disabled title="Termination in progress in background...">
          <i class="fas fa-trash-alt"></i>
        </button>
      `
      : `
        ${isFailed ? `
        <button type="button" class="rdbms-btn rdbms-btn-warning btn-retry-instance" data-id="${escapeHtml(inst.id)}" title="Retry provisioning this failed RDBMS instance" style="background: #fef3c7; color: #b45309; border-color: #fde68a;">
          <i class="fas fa-redo"></i> Retry
        </button>
        ` : ''}
        <button type="button" class="rdbms-btn rdbms-btn-secondary btn-test-bastion" data-id="${escapeHtml(inst.id)}" title="Test connection via in-VPC Bastion Node">
          <i class="fas fa-terminal"></i> Test
        </button>
        <button type="button" class="rdbms-btn rdbms-btn-primary btn-manage-instance" data-id="${escapeHtml(inst.id)}" title="Manage databases & TLS">
          <i class="fas fa-sliders-h"></i> Manage
        </button>
        <button type="button" class="rdbms-btn rdbms-btn-secondary btn-reconcile-instance" data-id="${escapeHtml(inst.id)}" title="Reconcile instance">
          <i class="fas fa-sync-alt"></i>
        </button>
        <button type="button" class="rdbms-btn rdbms-btn-danger btn-delete-instance" data-id="${escapeHtml(inst.id)}" data-name="${escapeHtml(inst.name || inst.id)}" title="Delete instance">
          <i class="fas fa-trash-alt"></i>
        </button>
      `;

    return `
      <tr class="${isSelected ? 'rdbms-row-selected' : ''}">
        <td style="text-align: center; padding: 10px 4px;">
          <input type="checkbox" class="rdbms-instance-check" data-id="${escapeHtml(inst.id)}" ${isSelected ? 'checked' : ''} ${activeDeletion ? 'disabled' : ''} style="width: 15px; height: 15px; accent-color: #0284c7; cursor: pointer; vertical-align: middle;">
        </td>
        <td>
          <div style="font-weight: 700; color: #0f172a;">${escapeHtml(inst.name || inst.id)}</div>
          <div style="font-size: 11px; color: #64748b; font-family: monospace;">${escapeHtml(inst.id)}</div>
        </td>
        <td>${statusHtml}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 6px;">
            <img src="${meta.icon}" class="rdbms-csp-logo" onerror="this.src='/img/circle.png';">
            <div>
              <div style="font-weight: 600;">${escapeHtml(meta.name)}</div>
              <div style="font-size: 11px; color: #64748b;">${escapeHtml(inst.connectionConfig?.regionDetail?.regionName || inst.connectionName || '')}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="rdbms-badge rdbms-badge-info" style="font-size: 12px;">${escapeHtml(inst.dbEngine || 'mysql')} ${escapeHtml(inst.dbEngineVersion || '')}</span>
        </td>
        <td style="font-size: 12.5px;">${specStorageStr}</td>
        <td>${endpointStr}</td>
        <td style="text-align: right; white-space: nowrap;">
          ${actionButtonsHtml}
        </td>
      </tr>
    `;
  }).join('');
}

// --- Multi-Cloud Username & Password Compatibility ---
// IBM strictly requires 'admin', Tencent strictly requires 'root',
// while NCP, NHN, Azure, Alibaba, and AWS RDS forbid certain system keywords ('admin', 'root').
function getCspAdminUserDetail(csp, userInput) {
  const c = (csp || '').toLowerCase();
  const input = (userInput || '').trim();
  const fallback = 'dbadmin';

  if (c === 'ibm') {
    return {
      effectiveUser: 'admin',
      isAdapted: input !== 'admin',
      ruleType: 'fixed',
      reason: "IBM strictly requires 'admin'",
    };
  }

  if (c === 'tencent') {
    return {
      effectiveUser: 'root',
      isAdapted: input !== 'root',
      ruleType: 'fixed',
      reason: "Tencent strictly requires 'root'",
    };
  }

  const reservedPerCsp = {
    azure: { forbidden: ['admin'], reason: "Azure forbids 'admin'" },
    alibaba: { forbidden: ['admin'], reason: "Alibaba RDS forbids 'admin'" },
    ncp: {
      forbidden: ['root', 'admin', 'radmin', 'agent', 'api_admin', 'ha_admin', 'ragent'],
      reason: "NCP forbids reserved system accounts ('root', 'admin')",
    },
    nhn: {
      forbidden: ['admin', 'root', 'rds_admin', 'rds_mha', 'rds_repl', 'sqlgw', 'etladm'],
      reason: "NHN Cloud forbids reserved system accounts ('root', 'admin')",
    },
    aws: { forbidden: ['root'], reason: "AWS RDS forbids 'root'" },
    openstack: { forbidden: ['root'], reason: "OpenStack Trove 'root' creates unpredictable auto-generated password" },
  };

  const lowerInput = input.toLowerCase();
  const rule = reservedPerCsp[c];
  if (rule && (rule.forbidden.includes(lowerInput) || !input)) {
    return {
      effectiveUser: fallback,
      isAdapted: input !== fallback,
      ruleType: 'reserved',
      reason: rule.reason,
    };
  }

  const eff = input || fallback;
  return {
    effectiveUser: eff,
    isAdapted: false,
    ruleType: 'custom',
    reason: 'Standard username accepted',
  };
}

function getCspCompliantAdminUser(csp, userInput) {
  return getCspAdminUserDetail(csp, userInput).effectiveUser;
}

function renderCspUserPreviewHtml(selectedCsps = [], userInput = 'dbadmin') {
  if (!selectedCsps || selectedCsps.length === 0) {
    return '<small class="text-muted" style="font-size: 11.5px; display: block; margin-top: 4px;">Select at least one CSP to preview username compatibility.</small>';
  }
  const input = (userInput || '').trim() || 'dbadmin';

  const details = selectedCsps.map(c => ({
    csp: c.toLowerCase(),
    ...getCspAdminUserDetail(c, input),
  }));

  const hasAdapted = details.some(d => d.isAdapted);

  return `
    <div style="margin-top: 6px; padding: 8px 10px; background: ${hasAdapted ? '#eff6ff' : '#f8fafc'}; border: 1px solid ${hasAdapted ? '#bfdbfe' : '#e2e8f0'}; border-radius: 6px; font-size: 11.5px; line-height: 1.5;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; font-weight: 600; color: #334155;">
        <span><i class="fas fa-user-shield" style="color: #0284c7; margin-right: 4px;"></i> CSP Admin Username Compatibility Preview:</span>
        ${hasAdapted 
          ? '<span style="color: #2563eb; font-size: 11px;"><i class="fas fa-info-circle"></i> Some clouds adapt incompatible names</span>' 
          : '<span style="color: #16a34a; font-size: 11px;"><i class="fas fa-check-circle"></i> All selected clouds accept "' + escapeHtml(input) + '"</span>'}
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        ${details.map(d => {
          if (d.isAdapted) {
            return `
              <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; background: #dbeafe; border: 1px solid #93c5fd; border-radius: 4px; color: #1e40af;" title="${escapeHtml(d.reason)}">
                <strong>${d.csp.toUpperCase()}:</strong>
                <code style="background: #ffffff; padding: 1px 4px; border-radius: 3px; font-size: 11px; font-weight: 700; color: #1d4ed8;">${escapeHtml(d.effectiveUser)}</code>
                <small style="color: #1e40af; font-size: 10px;">(${escapeHtml(d.reason)})</small>
              </span>
            `;
          } else {
            return `
              <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; color: #475569;" title="${escapeHtml(d.reason)}">
                <strong>${d.csp.toUpperCase()}:</strong>
                <code style="font-size: 11px; font-weight: 600; color: #1e293b;">${escapeHtml(d.effectiveUser)}</code>
              </span>
            `;
          }
        }).join('')}
      </div>
    </div>
  `;
}

// --- Public Access & Network Policy Adaptation ---
// IBM Cloud Databases requires public access (service-endpoints: public) to be provisioned via Spider.
// GCP Cloud SQL Private IP requires pre-configured Service Networking VPC Peering; adapt to publicAccess=true.
// NCP Cloud DB only supports VPC-private mode (publicAccess=false) and rejects publicAccess=true.
// AWS, Azure, Alibaba, Tencent, OpenStack, NHN support both private VPC and public access.
function getCspPublicAccessDetail(csp, userPublicAccess = false) {
  const c = (csp || '').toLowerCase();
  const userRequested = !!userPublicAccess;

  if (c === 'ibm') {
    return {
      effective: true,
      isAdapted: !userRequested,
      ruleType: 'fixed-public',
      reason: 'IBM strictly requires publicAccess=true (service-endpoints)',
    };
  }

  if (c === 'gcp') {
    return {
      effective: true,
      isAdapted: !userRequested,
      ruleType: 'fixed-public',
      reason: 'GCP Private IP requires Service Networking VPC Peering; adapted to publicAccess=true',
    };
  }

  if (c === 'ncp') {
    return {
      effective: false,
      isAdapted: userRequested,
      ruleType: 'fixed-private',
      reason: 'NCP Cloud DB only supports VPC-private mode (publicAccess=false)',
    };
  }

  return {
    effective: userRequested,
    isAdapted: false,
    ruleType: 'custom',
    reason: userRequested ? 'Public endpoint enabled' : 'Private VPC-only (isolated)',
  };
}

function renderCspPublicAccessPreviewHtml(selectedCsps = [], userPublicAccess = false) {
  if (!selectedCsps || selectedCsps.length === 0) return '';

  const details = selectedCsps.map(c => ({
    csp: c.toLowerCase(),
    ...getCspPublicAccessDetail(c, userPublicAccess),
  }));

  const hasAdapted = details.some(d => d.isAdapted);

  return `
    <div style="margin-top: 6px; padding: 8px 10px; background: ${hasAdapted ? '#eff6ff' : '#f8fafc'}; border: 1px solid ${hasAdapted ? '#bfdbfe' : '#e2e8f0'}; border-radius: 6px; font-size: 11.5px; line-height: 1.5;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; font-weight: 600; color: #334155;">
        <span><i class="fas fa-network-wired" style="color: #0284c7; margin-right: 4px;"></i> CSP Network Access Policy Preview:</span>
        ${hasAdapted 
          ? '<span style="color: #2563eb; font-size: 11px;"><i class="fas fa-info-circle"></i> Provider rules adapt access mode (e.g. GCP/IBM use public endpoint)</span>' 
          : '<span style="color: #16a34a; font-size: 11px;"><i class="fas fa-check-circle"></i> All selected clouds accept ' + (userPublicAccess ? 'Public Access' : 'Private VPC mode') + '</span>'}
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        ${details.map(d => {
          if (d.isAdapted) {
            return `
              <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; background: #dbeafe; border: 1px solid #93c5fd; border-radius: 4px; color: #1e40af;" title="${escapeHtml(d.reason)}">
                <strong>${d.csp.toUpperCase()}:</strong>
                <code style="background: #ffffff; padding: 1px 4px; border-radius: 3px; font-size: 11px; font-weight: 700; color: #1d4ed8;">${d.effective ? 'PUBLIC' : 'PRIVATE'}</code>
                <small style="color: #1e40af; font-size: 10px;">(${escapeHtml(d.reason)})</small>
              </span>
            `;
          } else {
            return `
              <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; color: #475569;" title="${escapeHtml(d.reason)}">
                <strong>${d.csp.toUpperCase()}:</strong>
                <code style="font-size: 11px; font-weight: 600; color: ${d.effective ? '#b45309' : '#1e293b'};">${d.effective ? 'PUBLIC' : 'PRIVATE'}</code>
              </span>
            `;
          }
        }).join('')}
      </div>
    </div>
  `;
}

function updatePublicAccessControl() {
  const chk = document.getElementById('rdbmsBastionPublicAccessCheck');
  const lockNote = document.getElementById('rdbmsPublicAccessLockNote');
  const preview = document.getElementById('rdbmsCspPublicAccessPreview');
  if (!chk) return;

  const selectedCsps = rdbmsState.multiCspSelected || [];
  const onlyFixedPublic = selectedCsps.length > 0 && selectedCsps.every(c => c === 'ibm' || c === 'gcp');
  const onlyNcp = selectedCsps.length === 1 && selectedCsps[0] === 'ncp';

  if (onlyFixedPublic) {
    chk.checked = true;
    chk.disabled = true;
    if (lockNote) {
      lockNote.innerHTML = `<span class="rdbms-badge rdbms-badge-warning" style="font-size: 11px;"><i class="fas fa-lock"></i> Locked to ON: ${selectedCsps.map(c => c.toUpperCase()).join('/')} requires public access</span>`;
    }
  } else if (onlyNcp) {
    chk.checked = false;
    chk.disabled = true;
    if (lockNote) {
      lockNote.innerHTML = `<span class="rdbms-badge rdbms-badge-secondary" style="font-size: 11px;"><i class="fas fa-lock"></i> Locked to OFF: NCP Cloud DB supports VPC-private only</span>`;
    }
  } else {
    chk.disabled = false;
    if (lockNote) {
      lockNote.innerHTML = '';
    }
  }

  if (preview) {
    preview.innerHTML = renderCspPublicAccessPreviewHtml(selectedCsps, chk.checked);
  }
}

// CSPs have strictly incompatible password validation rules:
// - IBM: 15~72 characters, NO special characters (letters and numbers only)
// - NCP: at least 1 special character required, 8~20 characters
// - Tencent: 8~64 characters, at least 2 character types from letters, digits, and symbols (_+&=!@#$%^*())
// - Azure/AWS/GCP/NHN/Alibaba/OpenStack: standard 8+ characters
function getCspCompliantAdminPassword(csp, userInput) {
  const c = (csp || '').toLowerCase();
  let p = (userInput || '').trim();
  if (!p) p = 'Admin1234!';

  if (c === 'ibm') {
    // IBM Cloud Databases (MySQL) requires:
    // 1. Length: 15 to 72 characters
    // 2. Allowed characters: letters (a-z, A-Z), digits (0-9), hyphen (-), underscore (_)
    //    Strictly forbids special symbols like !, @, #, $, etc. Must not begin with - or _
    // 3. Must contain at least one uppercase, one lowercase, and one digit
    // 4. Must NOT contain the admin username ('admin', case-insensitive)
    let clean = p.replace(/[^a-zA-Z0-9_-]/g, '');
    // Replace any occurrence of 'admin' (case-insensitive) with 'Cloud'
    clean = clean.replace(/admin/gi, 'Cloud');
    // Ensure does not start with - or _
    clean = clean.replace(/^[-_]+/, '');

    // Ensure uppercase, lowercase, and digit exist
    if (!/[A-Z]/.test(clean)) clean = 'Tb' + clean;
    if (!/[a-z]/.test(clean)) clean = clean + 'db';
    if (!/[0-9]/.test(clean)) clean = clean + '2026';

    // Ensure minimum length of 16 (IBM requires >= 15)
    if (clean.length < 16) {
      clean = (clean + 'Pass2026ClusterDb').slice(0, 20);
    } else if (clean.length > 72) {
      clean = clean.slice(0, 72);
    }
    return clean;
  }

  if (c === 'ncp') {
    // NCP Cloud DB: 8-20 characters, at least 1 special character required
    let clean = p.slice(0, 20);
    const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(clean);
    if (!hasSpecial) {
      clean = clean + '!';
    }
    if (clean.length < 8) clean = (clean + '1234!').slice(0, 8);
    if (clean.length > 20) clean = clean.slice(0, 20);
    return clean;
  }

  if (c === 'tencent') {
    // Tencent Cloud Database: 8-64 characters, at least 2 of: letters, digits, allowed symbols (_+&=!@#$%^*())
    let clean = p.slice(0, 64);
    if (clean.length < 8) clean = clean + '12345678';
    const hasLetter = /[a-zA-Z]/.test(clean);
    const hasDigit = /[0-9]/.test(clean);
    const hasSymbol = /[_+&=!@#$%^*()]/.test(clean);
    const types = (hasLetter ? 1 : 0) + (hasDigit ? 1 : 0) + (hasSymbol ? 1 : 0);
    if (types < 2) {
      clean = clean + '1!';
    }
    if (clean.length > 64) clean = clean.slice(0, 64);
    return clean;
  }

  if (c === 'alibaba') {
    // Alibaba Cloud RDS: 8-32 chars, at least 3 of (uppercase, lowercase, digits, special characters: !@#$%^&*()_+-=)
    let clean = p.slice(0, 32);
    if (clean.length < 8) clean = (clean + 'Secret1!').slice(0, 8);
    const hasUpper = /[A-Z]/.test(clean);
    const hasLower = /[a-z]/.test(clean);
    const hasDigit = /[0-9]/.test(clean);
    const hasSymbol = /[!@#$%^&*()_+\-=]/.test(clean);
    let types = (hasUpper ? 1 : 0) + (hasLower ? 1 : 0) + (hasDigit ? 1 : 0) + (hasSymbol ? 1 : 0);
    if (!hasUpper && types < 3) { clean += 'A'; types++; }
    if (!hasLower && types < 3) { clean += 'a'; types++; }
    if (!hasDigit && types < 3) { clean += '1'; types++; }
    if (!hasSymbol && types < 3) { clean += '!'; types++; }
    if (clean.length > 32) clean = clean.slice(0, 32);
    return clean;
  }

  // General default for other CSPs
  if (p.length < 8) {
    p = p + '1234!';
  }
  return p;
}

function validateAdminPasswordForCsps(password, csps = []) {
  if (!password || password.length < 8) {
    return 'Master Admin Password must be at least 8 characters long.';
  }
  // Check complexity (at least 2 of: letters, digits, symbols)
  let typesCount = 0;
  if (/[a-zA-Z]/.test(password)) typesCount++;
  if (/[0-9]/.test(password)) typesCount++;
  if (/[_\-+&=!@#$%^*()~]/.test(password)) typesCount++;
  if (typesCount < 2) {
    return 'Password must contain at least 2 categories among letters, numbers, and symbols (_+-&=!@#$%^*()).';
  }
  const hasIbm = csps.some(c => (c || '').toLowerCase().includes('ibm'));
  if (hasIbm && password.length < 15) {
    return 'IBM Cloud Databases requires a password of at least 15 characters (15–72 characters).';
  }
  const hasAlibaba = csps.some(c => (c || '').toLowerCase().includes('alibaba'));
  if (hasAlibaba && password.length > 32) {
    return 'Alibaba Cloud RDS requires a password of at most 32 characters (8–32 characters).';
  }
  return null;
}

// --- Bastion Set Orchestration & Remote Testing ---

function getBastionInfraName(baseName, csp, region) {
  const cleanBase = (baseName || 'db').trim().toLowerCase();
  const cleanCsp = (csp || '').trim().toLowerCase();
  const cleanRegion = (region || '').trim().toLowerCase();
  if (cleanRegion) {
    return `infra-db-${cleanBase}-${cleanCsp}-${cleanRegion}`;
  }
  return `infra-db-${cleanBase}-${cleanCsp}`;
}

async function handleBastionSetCreate(baseName, selectedCsps, engine, adminUser, adminPass, userPublicAccess = false) {
  const config = getConfig();
  const template = rdbmsState.bastionTemplate || DEFAULT_BASTION_TEMPLATE;
  const isMulti = selectedCsps.length > 1;

  // Build target list: one dedicated Infra per NodeGroup/CSP (Track 2 multi-region ready)
  const targets = selectedCsps.map(csp => {
    const c = csp.toLowerCase();
    const ng = (template.infraDynamicReq?.nodeGroups || []).find(g =>
      g.name === `g-${c}` || (g.specId && g.specId.toLowerCase().startsWith(c))
    ) || {
      name: `g-${c}`,
      nodeGroupSize: 1,
      specId: `${c}+default`,
      imageId: 'default',
      rootDiskType: 'default',
      rootDiskSize: 30,
    };
    const specParts = (ng.specId || '').split('+');
    const region = specParts.length >= 2 ? specParts[1] : '';
    const infraName = getBastionInfraName(baseName, c, region);
    const dbInstanceName = isMulti ? `${baseName}-${c}` : baseName;
    return {
      csp: c,
      region,
      nodeGroup: { ...ng },
      infraName,
      dbInstanceName,
      isReused: false,
      infraData: null,
      infraStatus: 'pending',
      infraError: null,
    };
  });

  const accountBreakdownRows = targets.map(t => {
    const userDetail = getCspAdminUserDetail(t.csp, adminUser);
    const netDetail = getCspPublicAccessDetail(t.csp, userPublicAccess);
    let passNote = 'Standard';
    if (t.csp === 'ibm') passNote = 'Alphanumeric only (15+ chars)';
    else if (t.csp === 'ncp') passNote = 'Special character required';
    else if (t.csp === 'tencent') passNote = '2+ character categories required';
    else if (t.csp === 'alibaba') passNote = '8–32 chars, 3+ categories';

    const userBadge = userDetail.isAdapted
      ? `<strong style="color: #2563eb;"><code>${escapeHtml(userDetail.effectiveUser)}</code></strong> <small style="color: #3b82f6;">(${escapeHtml(userDetail.reason)})</small>`
      : `<code>${escapeHtml(userDetail.effectiveUser)}</code>`;

    const netBadge = netDetail.isAdapted
      ? `<span class="rdbms-badge rdbms-badge-info" style="font-size: 11px;">${netDetail.effective ? 'Public Access' : 'Private VPC'} (${escapeHtml(netDetail.reason)})</span>`
      : `<span class="rdbms-badge rdbms-badge-${netDetail.effective ? 'warning' : 'secondary'}" style="font-size: 11px;">${netDetail.effective ? 'Public Access' : 'Private VPC'}</span>`;

    return `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 6px 10px; font-weight: 600;">${escapeHtml(t.csp.toUpperCase())}</td>
        <td style="padding: 6px 10px;"><code>${escapeHtml(t.infraName)}</code></td>
        <td style="padding: 6px 10px;"><code>${escapeHtml(t.dbInstanceName)}</code></td>
        <td style="padding: 6px 10px;">${userBadge}</td>
        <td style="padding: 6px 10px; font-size: 11.5px; color: #64748b;">${escapeHtml(passNote)}</td>
        <td style="padding: 6px 10px;">${netBadge}</td>
      </tr>
    `;
  }).join('');

  const ok = await showModalConfirm({
    title: isMulti ? 'Deploy Multi-Cloud DB & Bastion Sets' : 'Deploy DB & Bastion Set',
    html: `
      <div style="text-align: left; font-size: 13.5px; line-height: 1.6;">
        <div style="margin-bottom: 6px;">
          <strong>Architecture:</strong>
          <span class="rdbms-badge rdbms-badge-info" style="font-size: 11.5px;">
            <i class="fas fa-layer-group"></i> Dedicated Infras (1 Infra per NodeGroup/CSP)
          </span>
        </div>
        <div><strong>Selected CSP(s):</strong> ${selectedCsps.map(c => `<span class="rdbms-badge rdbms-badge-info">${escapeHtml(c.toUpperCase())}</span>`).join(' ')}</div>
        <div><strong>Database Engine:</strong> <span class="rdbms-badge rdbms-badge-secondary">${escapeHtml(engine)}</span></div>
        <div><strong>Target Plan:</strong> ${targets.length}× Dedicated Bastion Infras &amp; ${targets.length}× Managed RDBMS Instances</div>
        <div style="margin-top: 10px; margin-bottom: 6px; font-weight: 700; color: #1e293b; font-size: 13px;">
          <i class="fas fa-cubes" style="color: #0284c7;"></i> Dedicated Bastion Infras &amp; Credential Plan:
        </div>
        <div style="max-height: 220px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 10px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
            <thead style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0;">
              <tr>
                <th style="padding: 6px 10px;">Cloud</th>
                <th style="padding: 6px 10px;">Dedicated Bastion Infra</th>
                <th style="padding: 6px 10px;">Instance ID</th>
                <th style="padding: 6px 10px;">Effective Admin User</th>
                <th style="padding: 6px 10px;">Password Rule</th>
                <th style="padding: 6px 10px;">Network Mode</th>
              </tr>
            </thead>
            <tbody>
              ${accountBreakdownRows}
            </tbody>
          </table>
        </div>
        <small class="text-muted">Each cloud operates in an isolated Bastion Infra container (Track 2 multi-region ready). Provisioning typically takes 3 to 10 minutes.</small>
      </div>
    `,
    icon: 'info',
    confirmText: 'Deploy Dedicated Sets Now',
    confirmButtonClass: 'rdbms-btn-primary',
  });
  if (!ok) return;

  saveRdbmsSessionCredentials(adminUser, adminPass);
  for (const t of targets) {
    const effectiveAdminUser = getCspCompliantAdminUser(t.csp, adminUser);
    const effectiveAdminPass = getCspCompliantAdminPassword(t.csp, adminPass);
    saveRdbmsSessionCredentials(effectiveAdminUser, effectiveAdminPass, t.dbInstanceName);
  }

  rdbmsState.isFormOpen = false;

  const op = {
    id: `op-deploy-${Date.now()}`,
    type: 'deploy-bastion-set',
    title: isMulti ? `Deploy Multi-Cloud DB & Bastion Sets (${selectedCsps.map(c => c.toUpperCase()).join(', ')})` : `Deploy DB & Bastion Set (${selectedCsps[0].toUpperCase()})`,
    baseName,
    targets,
    infraNames: targets.map(t => t.infraName),
    selectedCsps,
    engine,
    startTime: Date.now(),
    endTime: null,
    status: 'running',
    steps: [
      {
        title: 'Step 1: Provisioning Dedicated Bastion VM Infras',
        desc: `Provisioning ${targets.length} dedicated Bastion Infra(s) (${targets.map(t => t.csp.toUpperCase()).join(', ')})...`,
        status: 'running',
        descHtml: '',
        detailsHtml: '',
      },
      {
        title: 'Step 2: Resolving In-VPC Networking & Subnets',
        desc: 'Waiting for Bastion VM provisioning...',
        status: 'pending',
        descHtml: '',
        detailsHtml: '',
      },
      {
        title: 'Step 3: Creating Managed RDBMS Instance(s)',
        desc: 'Waiting for network resolution...',
        status: 'pending',
        descHtml: '',
        detailsHtml: '',
      },
    ],
    summaryHtml: null,
    summaryText: '',
    dismissed: false,
  };

  rdbmsActiveOperations.unshift(op);
  ensureOpsTimer();

  const container = document.getElementById('rdbmsModalContent');
  if (container) {
    await renderInstanceListView(container);
    showModalNotice(`🚀 Deployment of ${targets.length} dedicated Bastion Infra(s) started in background. You can track live progress here or freely navigate other tabs.`, 'info', 7000);
  }

  runBastionSetDeployInBackground(op, targets, selectedCsps, engine, adminUser, adminPass, userPublicAccess, baseName, isMulti);
}

async function runBastionSetDeployInBackground(op, targets, selectedCsps, engine, adminUser, adminPass, userPublicAccess, baseName, isMulti) {
  const config = getConfig();
  const template = rdbmsState.bastionTemplate || DEFAULT_BASTION_TEMPLATE;
  const spinId = addSpinnerTask(`Deploy DB Stacks: ${baseName}`);

  try {
    // --- STEP 1: Provision Dedicated Bastion VM Infras in Parallel (or Reuse Active) ---
    op.steps[0].status = 'running';
    op.steps[0].desc = `Provisioning or verifying ${targets.length} dedicated Bastion Infra(s)...`;

    const updateStep1Details = () => {
      op.steps[0].detailsHtml = targets.map(t => {
        const cUpper = t.csp.toUpperCase();
        if (t.infraStatus === 'running') {
          return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 5px 8px; border-bottom: 1px solid #f1f5f9; background: #f8fafc; border-radius: 4px; margin-top: 3px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="rdbms-spinner rdbms-spinner-sm"></span>
                <strong style="color: #0369a1;">${escapeHtml(cUpper)}:</strong>
                <span style="color: #475569; font-size: 11.5px;">Checking / provisioning dedicated Infra <code>${escapeHtml(t.infraName)}</code>...</span>
              </div>
            </div>
          `;
        } else if (t.infraStatus === 'reused') {
          return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 5px 8px; border-bottom: 1px solid #f1f5f9; background: #f0fdf4; border-radius: 4px; margin-top: 3px; color: #166534;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <i class="fas fa-recycle" style="color: #16a34a; font-size: 13px;"></i>
                <strong>${escapeHtml(cUpper)}:</strong>
                <span style="font-size: 11.5px;">Reusing active Bastion Infra <code>${escapeHtml(t.infraName)}</code></span>
              </div>
            </div>
          `;
        } else if (t.infraStatus === 'success') {
          return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 5px 8px; border-bottom: 1px solid #f1f5f9; background: #f0fdf4; border-radius: 4px; margin-top: 3px; color: #166534;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <i class="fas fa-check-circle" style="color: #16a34a; font-size: 13px;"></i>
                <strong>${escapeHtml(cUpper)}:</strong>
                <span style="font-size: 11.5px;">Created dedicated Bastion Infra <code>${escapeHtml(t.infraName)}</code></span>
              </div>
            </div>
          `;
        } else {
          return `
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; padding: 5px 8px; color: #991b1b; margin-top: 3px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <i class="fas fa-times-circle" style="color: #dc2626; font-size: 13px;"></i>
                <strong>${escapeHtml(cUpper)} Infra Failed:</strong>
                <span style="font-size: 11.5px;"><code>${escapeHtml(t.infraName)}</code></span>
              </div>
              <div style="font-family: monospace; font-size: 10.5px; margin-top: 2px;">${escapeHtml(t.infraError || 'Unknown error')}</div>
            </div>
          `;
        }
      }).join('');
      renderActiveOperationsPanelIfOpen();
    };

    targets.forEach(t => { t.infraStatus = 'running'; });
    updateStep1Details();

    await Promise.allSettled(targets.map(async (t) => {
      // 1. Check if dedicated infra already exists in Tumblebug
      try {
        const getRes = await axios.get(`${tbApiBase()}/ns/${rdbmsState.namespace}/infra/${encodeURIComponent(t.infraName)}`, {
          auth: { username: config.username, password: config.password },
        });
        if (getRes.data && (getRes.data.id === t.infraName || getRes.data.name === t.infraName)) {
          const nodes = getRes.data.node || getRes.data.nodeList || [];
          if (nodes.length > 0) {
            t.isReused = true;
            t.infraData = getRes.data;
            t.infraStatus = 'reused';
            updateStep1Details();
            return;
          }
        }
      } catch (checkErr) {
        // 404 or does not exist, proceed to create
      }

      // 2. Create dedicated infraDynamic for this target
      const infraReq = {
        name: t.infraName,
        installMonAgent: 'no',
        nodeGroups: [t.nodeGroup],
        postCommands: template.infraDynamicReq?.postCommands || [
          {
            command: [
              'for i in 1 2 3 4 5 6 7 8 9 10; do sudo apt-get update -y && (sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-client netcat-openbsd || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-client netcat-openbsd) && break || (sudo yum install -y mariadb nc && break) || sleep 5; done',
            ],
          },
        ],
      };

      try {
        const createRes = await axios.post(`${tbApiBase()}/ns/${rdbmsState.namespace}/infraDynamic`, infraReq, {
          auth: { username: config.username, password: config.password },
        });
        t.isReused = false;
        t.infraData = createRes.data;
        t.infraStatus = 'success';
        updateStep1Details();
      } catch (createErr) {
        t.infraStatus = 'error';
        t.infraError = createErr.response?.data?.message || createErr.message || 'Infra creation failed';
        updateStep1Details();
        throw createErr;
      }
    }));

    const activeTargets = targets.filter(t => t.infraStatus === 'success' || t.infraStatus === 'reused');
    const failedInfraTargets = targets.filter(t => t.infraStatus === 'error');

    if (activeTargets.length === 0) {
      const firstErr = failedInfraTargets[0]?.infraError || 'All dedicated Bastion Infras failed to create';
      throw new Error(`All ${targets.length} Bastion Infra provisioning attempts failed: ${firstErr}`);
    }

    op.steps[0].status = failedInfraTargets.length > 0 ? 'warning' : 'success';
    op.steps[0].descHtml = `<span style="color:#16a34a; font-weight:600;">Active Dedicated Infras (${activeTargets.length}/${targets.length}):</span> ${activeTargets.map(t => `<code>${escapeHtml(t.infraName)}</code>${t.isReused ? ' (reused)' : ''}`).join(', ')}`;
    renderActiveOperationsPanelIfOpen();

    // --- STEP 2: Resolve In-VPC Networking & Subnets ---
    op.steps[1].status = 'running';
    op.steps[1].desc = 'Extracting provisioned VPC, Subnets, and Security Groups from dedicated Bastion node(s)...';
    renderActiveOperationsPanelIfOpen();

    const resolvedNetworks = {};
    for (const t of activeTargets) {
      let infraData = t.infraData;
      if (!infraData?.node || infraData.node.length === 0) {
        try {
          const getInfraRes = await axios.get(`${tbApiBase()}/ns/${rdbmsState.namespace}/infra/${encodeURIComponent(t.infraName)}`, {
            auth: { username: config.username, password: config.password },
          });
          infraData = getInfraRes.data || infraData;
          t.infraData = infraData;
        } catch (e) {
          console.warn('Could not re-fetch infra details for ' + t.infraName, e);
        }
      }

      const node = (infraData?.node || []).find(n => {
        const conn = (n.connectionName || '').toLowerCase();
        const nid = (n.id || '').toLowerCase();
        return conn.startsWith(t.csp) || conn.includes(`-${t.csp}-`) || nid.includes(`g-${t.csp}`);
      }) || (infraData?.node && infraData.node[0]);

      if (node) {
        let subnetIds = [];
        if (node.vNetId) {
          try {
            const vNetRes = await axios.get(`${tbApiBase()}/ns/${rdbmsState.namespace}/resources/vNet/${encodeURIComponent(node.vNetId)}`, {
              auth: { username: config.username, password: config.password },
            });
            let rawSubnets = vNetRes.data?.subnetInfoList || [];
            if (t.csp === 'alibaba') {
              rawSubnets.sort((a, b) => (b.zone === 'ap-northeast-2a' ? 1 : 0) - (a.zone === 'ap-northeast-2a' ? 1 : 0));
            }
            subnetIds = rawSubnets.map(s => s.id);
          } catch (e) {
            if (node.subnetId) subnetIds = [node.subnetId];
          }
        }
        // Ensure DB port (3306 for MySQL/MariaDB, 5432 for Postgres) is allowed in Bastion SecurityGroup
        const portMap = {
          mysql: '3306',
          mariadb: '3306',
          postgres: '5432',
          postgresql: '5432',
        };
        const targetPort = portMap[(engine || 'mysql').toLowerCase()] || '3306';
        if (node.securityGroupIds && node.securityGroupIds.length > 0) {
          for (const sgId of node.securityGroupIds) {
            try {
              await axios.post(`${tbApiBase()}/ns/${rdbmsState.namespace}/resources/securityGroup/${encodeURIComponent(sgId)}/rules`, {
                firewallRules: [{
                  Ports: targetPort,
                  Protocol: 'TCP',
                  Direction: 'inbound',
                  CIDR: '0.0.0.0/0',
                }],
              }, {
                auth: { username: config.username, password: config.password },
              });
            } catch (sgErr) {
              console.warn(`Could not auto-add port ${targetPort} to security group ${sgId}`, sgErr);
            }
          }
        }

        resolvedNetworks[t.csp] = {
          connectionName: node.connectionName,
          vNetId: node.vNetId,
          subnetIds: subnetIds.length > 0 ? subnetIds : (node.subnetId ? [node.subnetId] : undefined),
          securityGroupIds: node.securityGroupIds && node.securityGroupIds.length > 0 ? node.securityGroupIds : undefined,
          infraName: t.infraName,
        };
      } else {
        // Fallback matching template specId region
        const region = t.region || '';
        const conn = (rdbmsState.connections || []).find(c =>
          (c.providerName || '').toLowerCase() === t.csp &&
          (!region || c.configName.includes(region) || c.regionZoneInfo?.assignedRegion === region)
        );
        const connName = conn ? conn.configName : `${t.csp}-default`;
        const sharedVNetId = `${rdbmsState.namespace}-shared-${connName}`;
        let fallbackSubnets = [];
        try {
          const vNetRes = await axios.get(`${tbApiBase()}/ns/${rdbmsState.namespace}/resources/vNet/${encodeURIComponent(sharedVNetId)}`, {
            auth: { username: config.username, password: config.password },
          });
          let rawSubnets = vNetRes.data?.subnetInfoList || [];
          if (t.csp === 'alibaba') {
            rawSubnets.sort((a, b) => (b.zone === 'ap-northeast-2a' ? 1 : 0) - (a.zone === 'ap-northeast-2a' ? 1 : 0));
          }
          fallbackSubnets = rawSubnets.map(s => s.id);
        } catch (e) {}

        resolvedNetworks[t.csp] = {
          connectionName: connName,
          vNetId: sharedVNetId,
          subnetIds: fallbackSubnets.length > 0 ? fallbackSubnets : undefined,
          securityGroupIds: undefined,
          infraName: t.infraName,
        };
      }
    }

    op.steps[1].status = 'success';
    const netSummaries = Object.entries(resolvedNetworks).map(([csp, net]) =>
      `${csp.toUpperCase()} (Infra: <code>${escapeHtml(net.infraName || '')}</code>, VPC: <code>${escapeHtml(net.vNetId || 'default')}</code>, Conn: <code>${escapeHtml(net.connectionName || '')}</code>)`
    ).join('<br>');
    op.steps[1].descHtml = `<span style="color:#16a34a; font-weight:600;">Resolved:</span><br>${netSummaries}`;
    renderActiveOperationsPanelIfOpen();

    // Preserve full deployment context for zero-re-entry retry UX
    op.deployContext = {
      baseName,
      targets,
      selectedCsps,
      engine,
      adminUser,
      adminPass,
      userPublicAccess,
      resolvedNetworks,
      isMulti,
    };

    // Flag any failed infra CSPs directly into cspStatuses
    if (!op.cspStatuses) op.cspStatuses = {};
    failedInfraTargets.forEach(t => {
      op.cspStatuses[t.csp] = {
        status: 'error',
        dbInstanceName: t.dbInstanceName,
        message: `Bastion Infra provisioning failed: ${t.infraError}`,
      };
    });

    // --- STEP 3: Dispatch RDBMS Creation Requests in Parallel ---
    const cspsToCreate = activeTargets.map(t => t.csp);
    if (cspsToCreate.length > 0) {
      await dispatchParallelRdbmsCreation(op, cspsToCreate);
    } else {
      op.endTime = Date.now();
      op.status = 'error';
      op.steps[2].status = 'error';
      op.steps[2].descHtml = '<div style="color: #dc2626;">Aborted: No active Bastion Infras available.</div>';
      op.summaryHtml = '❌ Deployment aborted: All Bastion Infras failed.';
      op.summaryText = `❌ Deployment of "${baseName}" failed.`;
      renderActiveOperationsPanelIfOpen();
      notifyOperationComplete(op);
    }

  } catch (err) {
    op.endTime = Date.now();
    op.status = 'error';
    op.steps[0].status = 'error';
    const errText = err.response?.data?.message || err.message;
    op.steps[0].descHtml = `<div style="color: #dc2626; font-weight: 600;">Bastion Infra creation failed: ${escapeHtml(errText)}</div>`;
    op.summaryHtml = `❌ Deployment aborted due to Bastion Infra error: ${escapeHtml(errText)}`;
    op.summaryText = `❌ Deployment of "${baseName}" failed: ${errText}`;
    renderActiveOperationsPanelIfOpen();
    notifyOperationComplete(op);
  } finally {
    removeSpinnerTask(spinId);
  }
}

async function dispatchParallelRdbmsCreation(op, cspsToDeploy) {
  const config = getConfig();
  const { baseName, engine, adminUser, adminPass, userPublicAccess, resolvedNetworks, isMulti } = op.deployContext;

  op.steps[2].status = 'running';
  op.steps[2].desc = `Dispatching parallel RDBMS creation for ${cspsToDeploy.map(c => c.toUpperCase()).join(', ')}...`;

  if (!op.cspStatuses) op.cspStatuses = {};
  cspsToDeploy.forEach(csp => {
    op.cspStatuses[csp] = {
      status: 'running',
      dbInstanceName: isMulti ? `${baseName}-${csp}` : baseName,
      message: 'Submitting request to cloud provider (polling until Available)...',
    };
  });

  const updateDetailsHtml = () => {
    op.steps[2].detailsHtml = Object.entries(op.cspStatuses).map(([csp, st]) => {
      const cUpper = csp.toUpperCase();
      if (st.status === 'running') {
        return `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border-bottom: 1px solid #f1f5f9; background: #f8fafc; border-radius: 4px; margin-top: 4px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="rdbms-spinner rdbms-spinner-sm"></span>
              <strong style="color: #0369a1;">${escapeHtml(cUpper)}:</strong>
              <span style="color: #475569; font-size: 12px;">Creating <code>${escapeHtml(st.dbInstanceName)}</code> (Initializing on cloud)...</span>
            </div>
          </div>
        `;
      } else if (st.status === 'success') {
        return `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; border-bottom: 1px solid #f1f5f9; background: #f0fdf4; border-radius: 4px; margin-top: 4px; color: #166534;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <i class="fas fa-check-circle" style="color: #16a34a; font-size: 14px;"></i>
              <strong>${escapeHtml(cUpper)}:</strong>
              <span style="font-size: 12px;">Instance <code>${escapeHtml(st.dbInstanceName)}</code> active & available.${st.notes ? ` <span style="color: #64748b;">(${escapeHtml(st.notes)})</span>` : ''}</span>
            </div>
          </div>
        `;
      } else {
        return `
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; padding: 6px 10px; color: #991b1b; margin-top: 4px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <i class="fas fa-times-circle" style="color: #dc2626; font-size: 14px;"></i>
                <strong>${escapeHtml(cUpper)} Failed:</strong>
              </div>
              <button type="button" class="rdbms-btn rdbms-btn-secondary btn-retry-single-csp" data-op-id="${escapeHtml(op.id)}" data-csp="${escapeHtml(csp)}" style="padding: 2px 8px; font-size: 11px; background: #fff; border: 1px solid #fca5a5; color: #b91c1c; cursor: pointer; border-radius: 4px;">
                <i class="fas fa-redo"></i> Retry ${escapeHtml(cUpper)}
              </button>
            </div>
            <div style="font-family: monospace; font-size: 11px; word-break: break-all; margin-top: 4px; color: #7f1d1d;">${escapeHtml(st.message)}</div>
          </div>
        `;
      }
    }).join('');
    renderActiveOperationsPanelIfOpen();
  };

  updateDetailsHtml();

  const promises = cspsToDeploy.map(async (csp) => {
    const dbInstanceName = isMulti ? `${baseName}-${csp}` : baseName;
    const net = resolvedNetworks[csp] || {};
    const effectiveAdminUser = getCspCompliantAdminUser(csp, adminUser);
    const effectiveAdminPass = getCspCompliantAdminPassword(csp, adminPass);

    // CSP-specific adaptations
    const netDetail = getCspPublicAccessDetail(csp, userPublicAccess);
    const effectivePublicAccess = netDetail.effective;
    let targetSubnetIds = net.subnetIds;
    if (csp === 'azure' && Array.isArray(net.subnetIds) && net.subnetIds.length > 1) {
      // Azure MySQL Flexible Server requires a dedicated empty subnet without VM NICs
      targetSubnetIds = [net.subnetIds[1]];
    } else if (csp === 'ibm') {
      // IBM Cloud Databases does not bind to VPC subnets
      targetSubnetIds = undefined;
    }

    const rdbmsReq = {
      name: dbInstanceName,
      connectionName: net.connectionName || `${csp}-default`,
      vNetId: net.vNetId,
      subnetIds: targetSubnetIds,
      securityGroupIds: csp === 'ibm' ? undefined : net.securityGroupIds,
      dbEngine: engine,
      dbEngineVersion: csp === 'openstack' ? (engine === 'mariadb' ? '11.4' : '8.4') : undefined,
      autoFillDefaults: true,
      adminUserName: effectiveAdminUser,
      adminUserPassword: effectiveAdminPass,
      publicAccess: effectivePublicAccess,
      nhnDBSGToAllowAllInbound: (csp === 'nhn'),
      ncpDBACGToAllowAllInbound: (csp === 'ncp'),
      highAvailability: false,
      deletionProtection: false,
    };

    // 0. If retrying a previously failed instance with the same name, purge the failed record first
    try {
      const existingInst = (rdbmsState.instanceList || []).find(i => (i.id || i.name) === dbInstanceName);
      if (existingInst && ((existingInst.status || '').toLowerCase().includes('fail') || (existingInst.status || '').toLowerCase().includes('error'))) {
        await axios.delete(`${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/${encodeURIComponent(dbInstanceName)}?force=true`, {
          auth: { username: config.username, password: config.password },
        });
      }
    } catch (purgeErr) {
      console.warn(`Purge check for ${dbInstanceName} before create:`, purgeErr);
    }

    // 1. Pre-flight Validation
    try {
      await axios.post(`${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/validate`, rdbmsReq, {
        auth: { username: config.username, password: config.password },
      });
    } catch (valErr) {
      const errMsg = valErr.response?.data?.message || valErr.message || 'Validation failed';
      op.cspStatuses[csp] = {
        status: 'error',
        dbInstanceName,
        message: `Validation rejected: ${errMsg}`,
      };
      updateDetailsHtml();
      throw new Error(errMsg);
    }

    // 2. Real Provisioning Call (Blocks server-side until Available or Failed)
    try {
      await axios.post(`${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms`, rdbmsReq, {
        auth: { username: config.username, password: config.password },
      });
      const notes = [];
      if (effectiveAdminUser !== adminUser) notes.push(`user: ${effectiveAdminUser}`);
      if (effectiveAdminPass !== adminPass) notes.push('password adapted');
      if (netDetail.isAdapted) notes.push(effectivePublicAccess ? 'public endpoint' : 'private VPC');
      op.cspStatuses[csp] = {
        status: 'success',
        dbInstanceName,
        message: 'Available',
        notes: notes.join(', '),
      };
      updateDetailsHtml();
      refreshRdbmsInstancesSilently();
    } catch (dbErr) {
      let errMsg = dbErr.response?.data?.message || dbErr.message || 'Unknown error';
      if (csp === 'gcp' && errMsg.includes('SERVICE_NETWORKING_NOT_ENABLED')) {
        errMsg += ' (Hint: Enable Service Networking API on project: gcloud services enable servicenetworking.googleapis.com --project=<PROJECT_ID>)';
      }
      op.cspStatuses[csp] = {
        status: 'error',
        dbInstanceName,
        message: errMsg,
      };
      updateDetailsHtml();
      throw new Error(errMsg);
    }
  });

  await Promise.allSettled(promises);

  const failedCsps = Object.entries(op.cspStatuses)
    .filter(([_, st]) => st.status === 'error')
    .map(([c]) => c);
  op.failedCsps = failedCsps;
  op.endTime = Date.now();

  if (failedCsps.length > 0) {
    op.status = 'warning';
    op.steps[2].status = 'warning';
    op.steps[2].descHtml = `<span style="color: #dc2626; font-weight: 600;">Completed with ${failedCsps.length} failed CSP(s).</span>`;
    op.summaryHtml = `
      <div style="font-weight: 600; margin-bottom: 4px;">⚠️ ${failedCsps.length} of ${Object.keys(op.cspStatuses).length} CSP DB deployments encountered errors.</div>
      <div style="font-size: 12px; color: #475569;">Dedicated Bastion Infras remain active. You can retry failed instances directly below without rebuilding Bastion VMs:</div>
      <div style="margin-top: 8px;">
        <button type="button" class="rdbms-btn rdbms-btn-primary btn-retry-all-failed" data-op-id="${escapeHtml(op.id)}" style="padding: 4px 12px; font-size: 11.5px; display: inline-flex; align-items: center; gap: 5px;">
          <i class="fas fa-redo"></i> Retry All Failed CSPs (${failedCsps.map(c => c.toUpperCase()).join(', ')})
        </button>
      </div>
    `;
    op.summaryText = `⚠️ Deployment of DB Set "${baseName}" finished with ${failedCsps.length} error(s).`;
  } else {
    op.status = 'success';
    op.steps[2].status = 'success';
    op.steps[2].descHtml = '<span style="color: #16a34a; font-weight: 600;">All RDBMS instance creation requests completed successfully!</span>';
    op.summaryHtml = '🎉 Multi-Cloud DB & Bastion Set deployed successfully! All requested databases are ready.';
    op.summaryText = `🎉 DB & Bastion Set "${baseName}" deployed successfully!`;
  }

  updateDetailsHtml();
  await refreshRdbmsInstancesSilently();
  notifyOperationComplete(op);
}

async function retryFailedCsps(parentOp, cspsToRetry) {
  if (!parentOp || !parentOp.deployContext || !cspsToRetry || cspsToRetry.length === 0) return;

  const { baseName, engine, adminUser, adminPass, userPublicAccess, targets, isMulti } = parentOp.deployContext;
  const isMultiRetry = cspsToRetry.length > 1;

  // Filter or reconstruct targets to retry
  const template = rdbmsState.bastionTemplate || DEFAULT_BASTION_TEMPLATE;
  const retryTargets = cspsToRetry.map(csp => {
    const existing = (targets || []).find(t => t.csp === csp);
    if (existing) return { ...existing, infraStatus: 'pending', infraError: null };
    const ng = (template.infraDynamicReq?.nodeGroups || []).find(g =>
      g.name === `g-${csp}` || (g.specId && g.specId.toLowerCase().startsWith(csp))
    ) || {
      name: `g-${csp}`,
      nodeGroupSize: 1,
      specId: `${csp}+default`,
      imageId: 'default',
      rootDiskType: 'default',
      rootDiskSize: 30,
    };
    const specParts = (ng.specId || '').split('+');
    const region = specParts.length >= 2 ? specParts[1] : '';
    const infraName = getBastionInfraName(baseName, csp, region);
    const dbInstanceName = isMulti ? `${baseName}-${csp}` : baseName;
    return {
      csp,
      region,
      nodeGroup: { ...ng },
      infraName,
      dbInstanceName,
      isReused: false,
      infraData: null,
      infraStatus: 'pending',
      infraError: null,
    };
  });

  const retryOp = {
    id: `op-retry-${Date.now()}`,
    type: 'deploy-bastion-set',
    title: isMultiRetry
      ? `Retry RDBMS Provisioning (${cspsToRetry.map(c => c.toUpperCase()).join(', ')})`
      : `Retry RDBMS Provisioning (${cspsToRetry[0].toUpperCase()})`,
    baseName,
    targets: retryTargets,
    infraNames: retryTargets.map(t => t.infraName),
    selectedCsps: cspsToRetry,
    engine,
    startTime: Date.now(),
    endTime: null,
    status: 'running',
    steps: [
      {
        title: 'Step 1: Dedicated Bastion Infra Check',
        desc: `Verifying or provisioning dedicated Bastion Infra(s) for ${cspsToRetry.map(c => c.toUpperCase()).join(', ')}...`,
        status: 'running',
        descHtml: '',
        detailsHtml: '',
      },
      {
        title: 'Step 2: Resolving In-VPC Networking & Subnets',
        desc: 'Reusing or resolving verified VPC networks and security groups...',
        status: 'pending',
        descHtml: '',
        detailsHtml: '',
      },
      {
        title: 'Step 3: Creating Managed RDBMS Instance(s)',
        desc: `Dispatching parallel retry for ${cspsToRetry.map(c => c.toUpperCase()).join(', ')}...`,
        status: 'pending',
        descHtml: '',
        detailsHtml: '',
      },
    ],
    deployContext: {
      ...parentOp.deployContext,
      targets: retryTargets,
    },
    summaryHtml: null,
    summaryText: '',
    dismissed: false,
  };

  rdbmsActiveOperations.unshift(retryOp);
  renderActiveOperationsPanelIfOpen();

  const spinId = addSpinnerTask(`Retry DB: ${cspsToRetry.map(c => c.toUpperCase()).join(', ')}`);
  try {
    await runBastionSetDeployInBackground(retryOp, retryTargets, cspsToRetry, engine, adminUser, adminPass, userPublicAccess, baseName, isMulti);
  } finally {
    removeSpinnerTask(spinId);
  }
}

// --- In-VPC Bastion Node Discovery & Batch Operations ---

async function getNamespaceBastionNodes() {
  const config = getConfig();
  try {
    const infraRes = await axios.get(`${tbApiBase()}/ns/${rdbmsState.namespace}/infra`, {
      auth: { username: config.username, password: config.password },
    });
    const infraList = infraRes.data?.infra || [];
    const candidateNodes = [];
    for (const inf of infraList) {
      let rawNodes = [];
      if (typeof window.getInfraNodes === 'function') {
        try {
          rawNodes = window.getInfraNodes(inf) || [];
        } catch (e) {}
      }
      if (rawNodes.length === 0 && Array.isArray(inf.node)) rawNodes = inf.node;
      if (rawNodes.length === 0 && Array.isArray(inf.nodeList)) rawNodes = inf.nodeList;
      if (rawNodes.length === 0 && Array.isArray(inf.nodeGroup)) {
        for (const ng of inf.nodeGroup) {
          const subNodes = ng.node || ng.nodes || ng.nodeList || [];
          rawNodes.push(...subNodes.map(sn => ({ ...sn, nodeGroupId: sn.nodeGroupId || ng.id })));
        }
      }
      if (rawNodes.length === 0 && Array.isArray(inf.nodeGroupList)) {
        for (const ng of inf.nodeGroupList) {
          const subNodes = ng.node || ng.nodes || ng.nodeList || [];
          rawNodes.push(...subNodes.map(sn => ({ ...sn, nodeGroupId: sn.nodeGroupId || ng.id })));
        }
      }

      for (const n of rawNodes) {
        const isRunning = (n.status || '').toLowerCase() === 'running';
        candidateNodes.push({
          infraId: inf.id,
          nodeGroupId: n.nodeGroupId || 'default',
          nodeId: n.id,
          name: n.name || n.id,
          status: n.status || 'Unknown',
          publicIP: n.publicIP || '',
          privateIP: n.privateIP || '',
          vNetId: n.vNetId || '',
          connectionName: n.connectionName || '',
          isRunning,
        });
      }
    }
    return { infraList, allNodes: candidateNodes };
  } catch (e) {
    console.warn('Could not fetch infra for bastion candidates', e);
    return { infraList: [], allNodes: [] };
  }
}

function findBestBastionNodeForInstance(inst, allNodes) {
  if (!Array.isArray(allNodes) || allNodes.length === 0) return null;
  const instVnet = (inst.vNetId || '').trim();
  const instProv = (inst.connectionConfig?.providerName || inst.connectionName?.split('-')[0] || '').toLowerCase();
  const instName = (inst.name || inst.id || '').toLowerCase();

  // 1. Same exact vNetId & running
  if (instVnet) {
    const match = allNodes.find(n => n.isRunning && n.vNetId === instVnet);
    if (match) return { node: match, matchType: 'in-vpc', label: 'Same In-VPC ★' };
  }

  // 2. Same VNet ID substring & running
  if (instVnet) {
    const match = allNodes.find(n => n.isRunning && n.vNetId && (instVnet.includes(n.vNetId) || n.vNetId.includes(instVnet)));
    if (match) return { node: match, matchType: 'in-vpc', label: 'Same In-VPC ★' };
  }

  // 3. Same CSP & matching infra name prefix (e.g. infra-db-seokho)
  if (instProv) {
    const match = allNodes.find(n => n.isRunning && n.connectionName?.toLowerCase().startsWith(instProv) && (n.infraId?.includes(instName) || n.infraId?.includes('infra-db-')));
    if (match) return { node: match, matchType: 'csp-bastion', label: 'In-VPC Bastion' };
  }

  // 4. Same CSP & running
  if (instProv) {
    const match = allNodes.find(n => n.isRunning && (n.connectionName?.toLowerCase().startsWith(instProv) || n.nodeId?.toLowerCase().includes(instProv)));
    if (match) return { node: match, matchType: 'same-csp', label: 'Same CSP Bastion' };
  }

  // 5. Any running node with public IP
  const anyRunning = allNodes.find(n => n.isRunning && n.publicIP);
  if (anyRunning) return { node: anyRunning, matchType: 'fallback', label: 'Bastion VM' };

  return null;
}

function getVisibleInstances() {
  let list = rdbmsState.instanceList || [];
  if (rdbmsState.selectedProvider && rdbmsState.selectedProvider !== 'all') {
    list = list.filter(inst => {
      const prov = (inst.connectionConfig?.providerName || inst.connectionName?.split('-')[0] || '').toLowerCase();
      return prov === rdbmsState.selectedProvider;
    });
  }
  if (rdbmsState.filterText) {
    const q = rdbmsState.filterText.toLowerCase();
    list = list.filter(inst => {
      const accessLabel = inst.publicAccess ? 'public' : 'private';
      return (inst.name && inst.name.toLowerCase().includes(q)) ||
        (inst.id && inst.id.toLowerCase().includes(q)) ||
        (inst.endpoint && inst.endpoint.toLowerCase().includes(q)) ||
        (inst.dbEngine && inst.dbEngine.toLowerCase().includes(q)) ||
        (inst.status && inst.status.toLowerCase().includes(q)) ||
        accessLabel.includes(q);
    });
  }
  return list;
}

function renderTableRowsAndSync() {
  const tbody = document.getElementById('rdbmsTableBody');
  if (tbody) {
    tbody.innerHTML = renderInstanceRows();
    attachRowEvents();
  }
  updateBatchToolbarState();
}

function updateBatchToolbarState() {
  if (!rdbmsState.selectedInstanceIds) rdbmsState.selectedInstanceIds = new Set();
  const count = rdbmsState.selectedInstanceIds.size;
  const badge = document.getElementById('rdbmsSelectedCountBadge');
  const testBtn = document.getElementById('rdbmsBatchTestBtn');
  const deleteBtn = document.getElementById('rdbmsBatchDeleteBtn');
  const reconcileBtn = document.getElementById('rdbmsBatchReconcileBtn');
  const selectAllCheck = document.getElementById('rdbmsSelectAllCheck');

  if (badge) {
    if (count > 0) {
      badge.style.display = 'inline-block';
      badge.textContent = `${count} Selected`;
      badge.className = 'rdbms-badge rdbms-badge-info';
    } else {
      badge.style.display = 'none';
    }
  }

  if (testBtn) testBtn.disabled = count === 0;
  if (deleteBtn) deleteBtn.disabled = count === 0;
  if (reconcileBtn) reconcileBtn.disabled = count === 0;

  if (selectAllCheck) {
    const visibleChecks = Array.from(document.querySelectorAll('.rdbms-instance-check'));
    if (visibleChecks.length === 0) {
      selectAllCheck.checked = false;
      selectAllCheck.indeterminate = false;
    } else {
      const checkedCount = visibleChecks.filter(c => c.checked).length;
      if (checkedCount === 0) {
        selectAllCheck.checked = false;
        selectAllCheck.indeterminate = false;
      } else if (checkedCount === visibleChecks.length) {
        selectAllCheck.checked = true;
        selectAllCheck.indeterminate = false;
      } else {
        selectAllCheck.checked = false;
        selectAllCheck.indeterminate = true;
      }
    }
  }
}

async function showBatchTestModal() {
  const selected = (rdbmsState.instanceList || []).filter(i => rdbmsState.selectedInstanceIds && rdbmsState.selectedInstanceIds.has(i.id));
  if (selected.length === 0) {
    showModalNotice('Please select at least one RDBMS instance to test.', 'warning');
    return;
  }

  const spinId = addSpinnerTask('Resolving in-VPC Bastion nodes');
  const { allNodes } = await getNamespaceBastionNodes();
  removeSpinnerTask(spinId);

  const paired = selected.map(inst => {
    const prov = (inst.connectionConfig?.providerName || inst.connectionName?.split('-')[0] || 'other').toLowerCase();
    const bastionMatch = findBestBastionNodeForInstance(inst, allNodes);
    const hasEndpoint = Boolean(inst.endpoint);
    const isAvailable = (inst.status || '').toLowerCase() === 'available';
    return {
      instance: inst,
      provider: prov,
      bastionNode: bastionMatch?.node || null,
      bastionLabel: bastionMatch?.label || 'No Bastion node found',
      hasEndpoint,
      isAvailable,
      canTest: Boolean(hasEndpoint && bastionMatch?.node),
    };
  });

  const testable = paired.filter(p => p.canTest);
  if (testable.length === 0) {
    await showModalConfirm({
      title: 'Batch Test Unavailable',
      html: `
        <div style="text-align: left; font-size: 13.5px; line-height: 1.5;">
          None of the <strong>${selected.length}</strong> selected instances can be tested right now.
          <ul style="margin: 10px 0 0 16px; padding: 0; color: #64748b; font-size: 12.5px;">
            <li>Instances must have an active <strong>Endpoint</strong> (status: <code>Available</code>).</li>
            <li>A running <strong>Bastion VM node</strong> must exist in the same VPC or CSP.</li>
          </ul>
        </div>
      `,
      icon: 'warning',
      confirmText: 'Understood',
      showCancel: false,
    });
    return;
  }

  const skipped = paired.filter(p => !p.canTest);
  const defaultPass = getSavedRdbmsPassword() || '';

  const targetsTableHtml = `
    <div style="max-height: 220px; overflow-y: auto; border: 1.5px solid #e2e8f0; border-radius: 8px; margin-bottom: 14px; background: #fff;">
      <table style="width: 100%; border-collapse: collapse; font-size: 12.5px;">
        <thead>
          <tr style="background: #f8fafc; border-bottom: 1.5px solid #e2e8f0; color: #475569; font-weight: 700;">
            <th style="padding: 7px 10px; text-align: left;">Database Instance</th>
            <th style="padding: 7px 10px; text-align: left;">CSP</th>
            <th style="padding: 7px 10px; text-align: left;">In-VPC Bastion Runner</th>
            <th style="padding: 7px 10px; text-align: right;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${paired.map(p => {
            const meta = getProviderMeta(p.provider);
            const inst = p.instance;
            let bastionDesc = '';
            if (p.bastionNode) {
              bastionDesc = `<code>${escapeHtml(p.bastionNode.nodeId)}</code> <span class="badge" style="font-size: 10.5px; background: #e0f2fe; color: #0369a1; padding: 2px 5px; border-radius: 4px;">${escapeHtml(p.bastionLabel)}</span>`;
            } else {
              bastionDesc = `<span style="color: #dc2626; font-size: 11.5px;"><i class="fas fa-exclamation-triangle"></i> No Bastion node</span>`;
            }
            const statusBadge = p.canTest
              ? `<span class="rdbms-badge rdbms-badge-success" style="font-size: 11px; padding: 2px 6px;">Ready</span>`
              : `<span class="rdbms-badge rdbms-badge-secondary" style="font-size: 11px; padding: 2px 6px;" title="Skipped: ${!p.hasEndpoint ? 'No Endpoint' : 'No Bastion'}">Skip</span>`;

            return `
              <tr style="border-bottom: 1px solid #f1f5f9; ${!p.canTest ? 'opacity: 0.6; background: #fafafa;' : ''}">
                <td style="padding: 7px 10px;">
                  <div style="font-weight: 700; color: #0f172a;">${escapeHtml(inst.name || inst.id)}</div>
                  <div style="font-size: 11px; color: #64748b; font-family: monospace;">${escapeHtml(inst.endpoint || 'No endpoint')}</div>
                </td>
                <td style="padding: 7px 10px;">
                  <div style="display: flex; align-items: center; gap: 5px;">
                    <img src="${meta.icon}" style="width: 14px; height: 14px; object-fit: contain;" onerror="this.src='/img/circle.png';">
                    <span>${escapeHtml(meta.name)}</span>
                  </div>
                </td>
                <td style="padding: 7px 10px;">${bastionDesc}</td>
                <td style="padding: 7px 10px; text-align: right;">${statusBadge}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  const res = await showInModalDialog({
    title: `<i class="fas fa-bolt" style="color: #0284c7;"></i> Multi-Cloud Batch Remote Test`,
    html: `
      <div style="text-align: left; font-size: 13px;">
        <div style="margin-bottom: 8px; font-weight: 600; color: #334155;">
          Target Database Instances (${testable.length} Ready, ${skipped.length} Skipped):
        </div>
        ${targetsTableHtml}

        <div class="form-group mb-3">
          <label style="font-weight: 700; color: #334155; margin-bottom: 6px; display: block;">Select Test Scenario:</label>
          <div style="display: flex; flex-direction: column; gap: 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px;">
            <label style="display: flex; align-items: center; gap: 8px; font-weight: 500; cursor: pointer; margin: 0;">
              <input type="radio" name="rdbmsBatchScenario" value="nc" checked style="accent-color: #0284c7;">
              <div>
                <strong>TCP 3306 Port Ping</strong>
                <div style="font-size: 11.5px; color: #64748b;">Fast & parallel (~1s). Verifies routing, ENI, and SecurityGroup / ACG ingress reachability.</div>
              </div>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-weight: 500; cursor: pointer; margin: 0;">
              <input type="radio" name="rdbmsBatchScenario" value="mysql" style="accent-color: #0284c7;">
              <div>
                <strong>SQL Version & Database Query</strong>
                <div style="font-size: 11.5px; color: #64748b;">Authenticates via <code>mysql-client</code> / <code>mariadb-client</code> (<code>SELECT VERSION(); SHOW DATABASES;</code>).</div>
              </div>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-weight: 500; cursor: pointer; margin: 0;">
              <input type="radio" name="rdbmsBatchScenario" value="crud" style="accent-color: #0284c7;">
              <div>
                <strong>Full DB & Table CRUD Lifecycle</strong> <span class="badge" style="background:#dcfce7; color:#15803d; font-size:10px; padding:1px 5px; border-radius:4px; margin-left:4px;">E2E</span>
                <div style="font-size: 11.5px; color: #64748b;">Create DB (<code>tb_crud_test</code>) ➔ Verify DB ➔ Create Table & Data CRUD (INSERT/SELECT/UPDATE/DELETE) ➔ Drop Table ➔ Drop DB.</div>
              </div>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-weight: 500; cursor: pointer; margin: 0;">
              <input type="radio" name="rdbmsBatchScenario" value="custom" style="accent-color: #0284c7;">
              <div>
                <strong>Custom Command Template (Shell / SQL)</strong>
                <div style="font-size: 11.5px; color: #64748b;">Execute custom command template across all in-VPC bastions with dynamic variable interpolation.</div>
              </div>
            </label>
          </div>
        </div>

        <div id="rdbmsBatchSqlAuthSection" style="display: none; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-weight: 700; color: #1e40af; font-size: 12.5px;"><i class="fas fa-key"></i> Master DB Password:</span>
            <span class="badge" style="background:#dbeafe; color:#1e40af; font-size:11px; padding:2px 6px; border-radius:4px;">
              <i class="fas fa-magic"></i> Per-CSP Usernames Auto-Resolved
            </span>
          </div>
          <input type="password" class="form-control form-control-sm" id="rdbmsBatchAdminPassInput" placeholder="Password for databases" value="${escapeHtml(defaultPass)}">
          <small style="color: #3b82f6; font-size: 11.5px; margin-top: 4px; display: block;">
            Usernames are adapted automatically (e.g. <code>root</code> for Tencent, <code>alibaba_root</code> for Alibaba, <code>sysadmin</code> for NHN, <code>dbadmin</code> for AWS/Azure/GCP/NCP).
          </small>
        </div>

        <div id="rdbmsBatchCustomSection" style="display: none; background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <label style="font-weight: 700; color: #0f172a; font-size: 12.5px; margin: 0;"><i class="fas fa-terminal" style="color: #0284c7;"></i> Custom Command Template:</label>
            <span style="font-size: 11px; color: #64748b;">Executes per Bastion node</span>
          </div>
          <textarea class="form-control" id="rdbmsBatchCustomCmdInput" rows="3" style="font-family: monospace; font-size: 12px; background: #0f172a; color: #38bdf8; border-radius: 6px; border: 1px solid #334155;" placeholder="e.g. nc -zv -w 5 \${HOST} \${PORT}"></textarea>
          
          <div style="margin-top: 8px;">
            <div style="font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 4px;">Dynamic Template Variables (Click to insert):</div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;" id="rdbmsBatchVarChips">
              <button type="button" class="btn btn-sm btn-outline-secondary rdbms-var-chip" data-var="\${HOST}" style="font-size: 11px; padding: 2px 7px; font-family: monospace;">\${HOST}</button>
              <button type="button" class="btn btn-sm btn-outline-secondary rdbms-var-chip" data-var="\${PORT}" style="font-size: 11px; padding: 2px 7px; font-family: monospace;">\${PORT}</button>
              <button type="button" class="btn btn-sm btn-outline-secondary rdbms-var-chip" data-var="\${USER}" style="font-size: 11px; padding: 2px 7px; font-family: monospace;">\${USER}</button>
              <button type="button" class="btn btn-sm btn-outline-secondary rdbms-var-chip" data-var="\${PASSWORD}" style="font-size: 11px; padding: 2px 7px; font-family: monospace;">\${PASSWORD}</button>
              <button type="button" class="btn btn-sm btn-outline-secondary rdbms-var-chip" data-var="\${DB_NAME}" style="font-size: 11px; padding: 2px 7px; font-family: monospace;">\${DB_NAME}</button>
              <button type="button" class="btn btn-sm btn-outline-secondary rdbms-var-chip" data-var="\${CSP}" style="font-size: 11px; padding: 2px 7px; font-family: monospace;">\${CSP}</button>
            </div>
          </div>
          <small style="color: #64748b; font-size: 11px; margin-top: 6px; display: block;">
            Each variable is automatically replaced with the target database's credentials and endpoint when executing on its respective Bastion VM node.
          </small>
        </div>
      </div>
    `,
    maxWidth: '740px',
    confirmText: `<i class="fas fa-play"></i> Run Parallel Batch Test (${testable.length} DBs)`,
    cancelText: 'Cancel',
    confirmButtonClass: 'rdbms-btn-primary',
    didOpen: () => {
      const radios = document.querySelectorAll('input[name="rdbmsBatchScenario"]');
      const authSec = document.getElementById('rdbmsBatchSqlAuthSection');
      const customSec = document.getElementById('rdbmsBatchCustomSection');
      const customInput = document.getElementById('rdbmsBatchCustomCmdInput');

      const updateSections = () => {
        const scenario = document.querySelector('input[name="rdbmsBatchScenario"]:checked')?.value;
        if (authSec) authSec.style.display = (scenario === 'mysql' || scenario === 'crud' || scenario === 'custom') ? 'block' : 'none';
        if (customSec) {
          customSec.style.display = scenario === 'custom' ? 'block' : 'none';
          if (scenario === 'custom' && customInput && !customInput.value.trim()) {
            customInput.value = '$(which mysql 2>/dev/null || which mariadb 2>/dev/null || echo mysql) --defaults-extra-file=<(printf "[client]\\npassword=%s\\n" \'${PASSWORD}\') -h ${HOST} -P ${PORT} -u ${USER} -e "SELECT VERSION(); SHOW DATABASES;"';
          }
        }
      };

      radios.forEach(r => r.onchange = updateSections);
      updateSections();

      document.querySelectorAll('.rdbms-var-chip').forEach(chip => {
        chip.onclick = () => {
          const varText = chip.dataset.var;
          if (customInput && varText) {
            const start = customInput.selectionStart || customInput.value.length;
            const end = customInput.selectionEnd || customInput.value.length;
            const text = customInput.value;
            customInput.value = text.substring(0, start) + varText + text.substring(end);
            customInput.focus();
            customInput.selectionStart = customInput.selectionEnd = start + varText.length;
          }
        };
      });
    },
    preConfirm: () => {
      const scenario = document.querySelector('input[name="rdbmsBatchScenario"]:checked')?.value || 'nc';
      const pass = document.getElementById('rdbmsBatchAdminPassInput')?.value || '';
      const customCmd = document.getElementById('rdbmsBatchCustomCmdInput')?.value?.trim() || '';
      if (scenario === 'custom' && !customCmd) {
        showDialogValidationMessage('Custom command template cannot be empty');
        return false;
      }
      return { scenario, pass, customCmd };
    },
  });

  if (res.isConfirmed && res.value) {
    runBatchTestInBackground(testable, res.value.scenario, res.value.pass, res.value.customCmd);
  }
}

function buildCrudLifecycleSqlScript(includeSqlDbCreateDrop = false, dbName = 'tb_crud_test', tblName = 'tb_crud_items') {
  const parts = [];
  if (includeSqlDbCreateDrop) {
    parts.push(`SELECT '=== [1/5] CREATE DATABASE (${dbName}) ===' AS step;`);
    parts.push(`CREATE DATABASE IF NOT EXISTS ${dbName};`);
  }
  parts.push(`SELECT '=== [2/5] VERIFY DATABASE (SHOW DATABASES) ===' AS step;`);
  parts.push(`SHOW DATABASES LIKE '${dbName}';`);
  parts.push(`USE ${dbName};`);
  parts.push(`SELECT '=== [3/5] CREATE TABLE & DATA CRUD (${tblName}) ===' AS step;`);
  parts.push(`DROP TABLE IF EXISTS ${tblName};`);
  parts.push(`CREATE TABLE ${tblName} (id INT AUTO_INCREMENT PRIMARY KEY, item_name VARCHAR(64) NOT NULL, status VARCHAR(32) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
  parts.push(`INSERT INTO ${tblName} (item_name, status) VALUES ('cb-alpha', 'CREATED'), ('cb-beta', 'PENDING');`);
  parts.push(`SELECT '--- [READ AFTER INSERT] ---' AS phase;`);
  parts.push(`SELECT id, item_name, status FROM ${tblName} ORDER BY id;`);
  parts.push(`UPDATE ${tblName} SET status = 'VERIFIED' WHERE item_name = 'cb-beta';`);
  parts.push(`DELETE FROM ${tblName} WHERE item_name = 'cb-alpha';`);
  parts.push(`SELECT '--- [READ AFTER UPDATE & DELETE] ---' AS phase;`);
  parts.push(`SELECT id, item_name, status FROM ${tblName} ORDER BY id;`);
  parts.push(`SELECT '=== [4/5] DROP TABLE (${tblName}) ===' AS step;`);
  parts.push(`DROP TABLE ${tblName};`);
  parts.push(`SHOW TABLES;`);
  if (includeSqlDbCreateDrop) {
    parts.push(`SELECT '=== [5/5] DROP DATABASE (${dbName}) ===' AS step;`);
    parts.push(`DROP DATABASE ${dbName};`);
    parts.push(`SHOW DATABASES LIKE '${dbName}';`);
  }
  parts.push(`SELECT '=== [CRUD LIFECYCLE COMPLETE] ===' AS result;`);
  return parts.join(' ');
}

async function runBatchTestInBackground(testable, scenario, customPass, customCmd = '') {
  const config = getConfig();
  const op = {
    id: `op-batch-test-${Date.now()}`,
    type: 'batch-test',
    title: `Multi-Cloud Batch Remote Test (${testable.length} Instances)`,
    startTime: Date.now(),
    endTime: null,
    status: 'running',
    steps: testable.map(t => {
      const meta = getProviderMeta(t.provider);
      return {
        id: t.instance.id,
        title: `${t.instance.name || t.instance.id} (${meta.name})`,
        desc: scenario === 'crud'
          ? `Running full DB & Table CRUD lifecycle via Bastion ${t.bastionNode.nodeId}...`
          : (scenario === 'custom' ? `Running custom command from Bastion ${t.bastionNode.nodeId}...` : `Testing connection from Bastion ${t.bastionNode.nodeId}...`),
        status: 'running',
        descHtml: '',
        detailsHtml: '',
        rawOutput: '',
      };
    }),
    summaryHtml: null,
    summaryText: '',
    dismissed: false,
  };

  rdbmsActiveOperations.unshift(op);
  ensureOpsTimer();
  renderActiveOperationsPanelIfOpen();

  showModalNotice(`⚡ Parallel test of ${testable.length} database instances dispatched to in-VPC bastions.`, 'info', 7000);

  let passedCount = 0;
  let failedCount = 0;

  await Promise.allSettled(testable.map(async (t, idx) => {
    const step = op.steps[idx];
    const inst = t.instance;
    const prov = t.provider;
    const host = (inst.endpoint || '').split(':')[0];
    const port = (inst.endpoint || '').split(':')[1] || '3306';

    const savedUser = getSavedRdbmsUser(inst.id || inst.name);
    const savedPass = getSavedRdbmsPassword(inst.id || inst.name);
    const effectiveUser = inst.adminUserName || inst.masterUserName || getCspCompliantAdminUser(prov, savedUser || 'dbadmin');
    const effectivePass = getCspCompliantAdminPassword(prov, customPass || savedPass);
    const safePass = effectivePass.replace(/'/g, "'\\''");

    if (scenario === 'crud') {
      const dbName = 'tb_crud_test';
      const tblName = 'tb_crud_items';
      const isDirectSqlDbManage = prov === 'aws' || prov === 'ibm';
      const logLines = [];
      let dbCreatedViaApi = false;
      let stepError = null;

      try {
        if (!isDirectSqlDbManage) {
          step.desc = `[1/5] Creating DB '${dbName}' via Control Plane API...`;
          renderActiveOperationsPanelIfOpen();
          try {
            await axios.post(
              `${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/${encodeURIComponent(inst.id)}/database`,
              { databaseName: dbName },
              {
                auth: { username: config.username, password: config.password },
                headers: {
                  'X-Admin-User-Name': effectiveUser,
                  'X-Admin-User-Password': effectivePass,
                },
              }
            );
            dbCreatedViaApi = true;
            logLines.push(`=== [1/5] CREATE DATABASE (Control Plane API): '${dbName}' created ===`);
          } catch (createErr) {
            const msg = createErr.response?.data?.message || createErr.message || '';
            if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate') || createErr.response?.status === 409) {
              dbCreatedViaApi = true;
              logLines.push(`=== [1/5] CREATE DATABASE (Control Plane API): '${dbName}' already exists (reusing) ===`);
            } else {
              throw new Error(`Create DB '${dbName}' failed: ${msg}`);
            }
          }

          step.desc = `[2/5] Verifying DB '${dbName}' via Control Plane API...`;
          renderActiveOperationsPanelIfOpen();
          const listRes = await axios.get(
            `${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/${encodeURIComponent(inst.id)}/database`,
            {
              auth: { username: config.username, password: config.password },
              headers: {
                'X-Admin-User-Name': effectiveUser,
                'X-Admin-User-Password': effectivePass,
              },
            }
          );
          const dbList = listRes.data?.databases || [];
          logLines.push(`=== [2/5] LIST DATABASES (Control Plane API): [${dbList.join(', ')}] ===`);
        }

        step.desc = `[3/5] Running Table DDL & Row CRUD via Bastion ${t.bastionNode.nodeId}...`;
        renderActiveOperationsPanelIfOpen();
        const sqlScript = buildCrudLifecycleSqlScript(isDirectSqlDbManage, dbName, tblName);
        const clientCheck = 'which mysql >/dev/null 2>&1 || which mariadb >/dev/null 2>&1 || (sudo apt-get update -y >/dev/null 2>&1 && (sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-client >/dev/null 2>&1 || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-client >/dev/null 2>&1) || (sudo yum install -y mariadb >/dev/null 2>&1)) || true; ';
        const clientBin = '$(which mysql 2>/dev/null || which mariadb 2>/dev/null || echo mysql)';
        const crudCmd = `${clientCheck}${clientBin} --defaults-extra-file=<(printf "[client]\\npassword=%s\\n" '${safePass}') -h ${host} -P ${port} -u ${effectiveUser} -e "${sqlScript}"`;

        const cmdUrl = `${tbApiBase()}/ns/${rdbmsState.namespace}/cmd/infra/${encodeURIComponent(t.bastionNode.infraId)}?nodeId=${encodeURIComponent(t.bastionNode.nodeId)}`;
        const cmdRes = await axios.post(cmdUrl, {
          command: [crudCmd],
          timeoutMinutes: 2,
        }, {
          auth: { username: config.username, password: config.password },
        });

        const resData = cmdRes.data?.results?.[0] || cmdRes.data?.result?.[0] || {};
        const stdout = typeof resData.stdout === 'object' ? Object.values(resData.stdout).join('\n') : (resData.stdout || '');
        const stderr = typeof resData.stderr === 'object' ? Object.values(resData.stderr).join('\n') : (resData.stderr || '');
        const error = resData.error || '';
        const combinedOutput = (stdout + (stdout && stderr ? '\n' : '') + stderr).trim();
        logLines.push(combinedOutput || error || '(No SQL output)');

        if (error || !combinedOutput.includes('cb-alpha') || !combinedOutput.includes('VERIFIED') || !combinedOutput.includes('[4/5] DROP TABLE')) {
          throw new Error(error || stderr.split('\n').find(l => !l.toLowerCase().includes('warning')) || 'SQL CRUD verification failed');
        }
      } catch (err) {
        stepError = err;
      } finally {
        if (!isDirectSqlDbManage && dbCreatedViaApi) {
          step.desc = `[5/5] Dropping DB '${dbName}' via Control Plane API...`;
          renderActiveOperationsPanelIfOpen();
          try {
            await axios.delete(
              `${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/${encodeURIComponent(inst.id)}/database/${encodeURIComponent(dbName)}`,
              {
                auth: { username: config.username, password: config.password },
                headers: {
                  'X-Admin-User-Name': effectiveUser,
                  'X-Admin-User-Password': effectivePass,
                },
              }
            );
            logLines.push(`=== [5/5] DROP DATABASE (Control Plane API): '${dbName}' dropped ===`);
          } catch (dropErr) {
            const dropMsg = dropErr.response?.data?.message || dropErr.message || '';
            logLines.push(`=== [5/5] DROP DATABASE ERROR: ${dropMsg} ===`);
            if (!stepError) {
              stepError = new Error(`Drop DB '${dbName}' failed: ${dropMsg}`);
            }
          }
        }
      }

      step.rawOutput = logLines.join('\n').trim() || '(No output returned)';
      const outputToggleHtml = `
        <div style="margin-top: 5px;">
          <a href="javascript:void(0)" class="btn-toggle-test-output" style="font-size: 11.5px; color: #0284c7; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; font-weight: 600;">
            <i class="fas fa-terminal"></i> <span>View Output</span> <i class="fas fa-chevron-down" style="font-size: 10px;"></i>
          </a>
          <pre class="test-output-box" style="display: none; margin: 5px 0 0 0; padding: 7px 10px; background: #0f172a; color: #38bdf8; border-radius: 5px; font-size: 11.5px; font-family: monospace; white-space: pre-wrap; word-break: break-all; max-height: 160px; overflow-y: auto;">${escapeHtml(step.rawOutput)}</pre>
        </div>
      `;

      if (!stepError) {
        passedCount++;
        step.status = 'success';
        step.descHtml = `<span style="color: #16a34a; font-weight: 600;">✓ Full DB & Table CRUD lifecycle verified via ${escapeHtml(t.bastionNode.nodeId)} (${escapeHtml(t.bastionLabel)})</span>`;
        step.detailsHtml = outputToggleHtml;
      } else {
        failedCount++;
        step.status = 'error';
        step.descHtml = `<span style="color: #dc2626; font-weight: 600;">✗ CRUD test failed: ${escapeHtml(stepError.message || String(stepError))}</span>`;
        step.detailsHtml = outputToggleHtml;
      }
      renderActiveOperationsPanelIfOpen();
      return;
    }

    let cmd = '';
    if (scenario === 'nc') {
      const ncCheck = 'which nc >/dev/null 2>&1 || (sudo apt-get update -y >/dev/null 2>&1 && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y netcat-openbsd >/dev/null 2>&1) || (sudo yum install -y nc >/dev/null 2>&1) || true; ';
      cmd = `${ncCheck}nc -zv -w 5 ${host} ${port}`;
    } else if (scenario === 'mysql') {
      const clientCheck = 'which mysql >/dev/null 2>&1 || which mariadb >/dev/null 2>&1 || (sudo apt-get update -y >/dev/null 2>&1 && (sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-client >/dev/null 2>&1 || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-client >/dev/null 2>&1) || (sudo yum install -y mariadb >/dev/null 2>&1)) || true; ';
      const clientBin = '$(which mysql 2>/dev/null || which mariadb 2>/dev/null || echo mysql)';
      cmd = `${clientCheck}${clientBin} --defaults-extra-file=<(printf "[client]\\npassword=%s\\n" '${safePass}') -h ${host} -P ${port} -u ${effectiveUser} -e "SELECT VERSION(); SHOW DATABASES;"`;
    } else {
      let templ = customCmd || '';
      templ = templ.replace(/\$\{HOST\}|\$HOST/g, host);
      templ = templ.replace(/\$\{PORT\}|\$PORT/g, port);
      templ = templ.replace(/\$\{USER\}|\$\{USERNAME\}|\$USER/g, effectiveUser);
      templ = templ.replace(/\$\{PASSWORD\}|\$\{PASS\}|\$PASSWORD|\$PASS/g, safePass);
      templ = templ.replace(/\$\{DB_NAME\}|\$\{NAME\}|\$\{ID\}/g, inst.name || inst.id);
      templ = templ.replace(/\$\{CSP\}/g, prov);

      if (templ.includes('mysql') || templ.includes('mariadb')) {
        const clientCheck = 'which mysql >/dev/null 2>&1 || which mariadb >/dev/null 2>&1 || (sudo apt-get update -y >/dev/null 2>&1 && (sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-client >/dev/null 2>&1 || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-client >/dev/null 2>&1) || (sudo yum install -y mariadb >/dev/null 2>&1)) || true; ';
        cmd = `${clientCheck}${templ}`;
      } else {
        cmd = templ;
      }
    }

    try {
      const cmdUrl = `${tbApiBase()}/ns/${rdbmsState.namespace}/cmd/infra/${encodeURIComponent(t.bastionNode.infraId)}?nodeId=${encodeURIComponent(t.bastionNode.nodeId)}`;
      const cmdRes = await axios.post(cmdUrl, {
        command: [cmd],
        timeoutMinutes: 2,
      }, {
        auth: { username: config.username, password: config.password },
      });

      const resData = cmdRes.data?.results?.[0] || cmdRes.data?.result?.[0] || {};
      const stdout = typeof resData.stdout === 'object' ? Object.values(resData.stdout).join('\n') : (resData.stdout || '');
      const stderr = typeof resData.stderr === 'object' ? Object.values(resData.stderr).join('\n') : (resData.stderr || '');
      const error = resData.error || '';
      const combinedOutput = (stdout + (stdout && stderr ? '\n' : '') + stderr).trim();

      const isNcSuccess = combinedOutput.toLowerCase().includes('succeeded') || combinedOutput.toLowerCase().includes('open');
      const isSqlSuccess = !error && !combinedOutput.toLowerCase().includes('error') && (combinedOutput.includes('VERSION()') || combinedOutput.includes('Database'));
      const isCustomSuccess = !error && !combinedOutput.toLowerCase().includes('command not found') && !combinedOutput.toLowerCase().includes('syntax error');
      const passed = scenario === 'nc' ? (!error && isNcSuccess) : (scenario === 'mysql' ? isSqlSuccess : isCustomSuccess);

      step.rawOutput = combinedOutput || error || '(No output returned)';

      const outputToggleHtml = `
        <div style="margin-top: 5px;">
          <a href="javascript:void(0)" class="btn-toggle-test-output" style="font-size: 11.5px; color: #0284c7; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; font-weight: 600;">
            <i class="fas fa-terminal"></i> <span>View Output</span> <i class="fas fa-chevron-down" style="font-size: 10px;"></i>
          </a>
          <pre class="test-output-box" style="display: none; margin: 5px 0 0 0; padding: 7px 10px; background: #0f172a; color: #38bdf8; border-radius: 5px; font-size: 11.5px; font-family: monospace; white-space: pre-wrap; word-break: break-all; max-height: 120px; overflow-y: auto;">${escapeHtml(step.rawOutput)}</pre>
        </div>
      `;

      if (passed) {
        passedCount++;
        step.status = 'success';
        const okLabel = scenario === 'custom' ? 'Custom command executed successfully' : 'Connected successfully';
        step.descHtml = `<span style="color: #16a34a; font-weight: 600;">✓ ${okLabel} via ${escapeHtml(t.bastionNode.nodeId)} (${escapeHtml(t.bastionLabel)})</span>`;
        step.detailsHtml = outputToggleHtml;
      } else {
        failedCount++;
        step.status = 'error';
        const shortErr = error || stderr.split('\n')[0] || 'Execution or connection failed';
        step.descHtml = `<span style="color: #dc2626; font-weight: 600;">✗ Test failed: ${escapeHtml(shortErr)}</span>`;
        step.detailsHtml = outputToggleHtml;
      }
    } catch (err) {
      failedCount++;
      step.status = 'error';
      step.descHtml = `<span style="color: #dc2626; font-weight: 600;">✗ Remote execution error: ${escapeHtml(err.response?.data?.message || err.message)}</span>`;
    }
    renderActiveOperationsPanelIfOpen();
  }));

  op.endTime = Date.now();
  if (failedCount === 0) {
    op.status = 'success';
    op.summaryText = `Batch Test Completed: All ${passedCount} instances passed!`;
    op.summaryHtml = `<strong>🎉 All Connected:</strong> Successfully verified ${passedCount} database instance${passedCount === 1 ? '' : 's'} via in-VPC Bastion nodes.`;
  } else if (passedCount > 0) {
    op.status = 'warning';
    op.summaryText = `Batch Test Finished: ${passedCount} Passed, ${failedCount} Failed.`;
    op.summaryHtml = `<strong>⚠️ Partial Success:</strong> ${passedCount} instances reachable, ${failedCount} failed connection. Check output details above.`;
  } else {
    op.status = 'error';
    op.summaryText = `Batch Test Failed: All ${failedCount} tests failed.`;
    op.summaryHtml = `<strong>❌ Connection Failed:</strong> All ${failedCount} instances could not be reached. Verify network and security groups.`;
  }
  renderActiveOperationsPanelIfOpen();
  notifyOperationComplete(op);
}

async function showBatchDeleteModal() {
  const selected = (rdbmsState.instanceList || []).filter(i => rdbmsState.selectedInstanceIds && rdbmsState.selectedInstanceIds.has(i.id));
  if (selected.length === 0) {
    showModalNotice('Please select at least one RDBMS instance to delete.', 'warning');
    return;
  }

  const config = getConfig();
  let associatedInfras = [];
  const spinId = addSpinnerTask('Checking associated resources');
  try {
    const infraRes = await axios.get(`${tbApiBase()}/ns/${rdbmsState.namespace}/infra`, {
      auth: { username: config.username, password: config.password },
    });
    const infraList = infraRes.data?.infra || [];
    for (const inf of infraList) {
      const infId = (inf.id || '').toLowerCase();
      const isAssociated = selected.some(inst => {
        const dbName = (inst.name || '').toLowerCase();
        const dbId = (inst.id || '').toLowerCase();
        return infId === `infra-db-${dbName}` ||
          infId === `infra-db-${dbId}` ||
          (infId.startsWith('infra-db-') && (infId.includes(dbName) || infId.includes(dbId)));
      });
      if (isAssociated && !associatedInfras.find(ai => ai.id === inf.id)) {
        associatedInfras.push(inf);
      }
    }
  } catch (e) {
    console.warn('Could not inspect infras for batch deletion', e);
  } finally {
    removeSpinnerTask(spinId);
  }

  let bastionHtml = '';
  if (associatedInfras.length > 0) {
    bastionHtml = `
      <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-top: 14px;">
        <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; margin: 0; user-select: none;">
          <input type="checkbox" id="rdbmsBatchDeleteBastionCheck" checked style="width: 17px; height: 17px; margin-top: 2px; accent-color: #dc2626; cursor: pointer;">
          <div>
            <div style="font-weight: 700; color: #0f172a; font-size: 13.5px;">
              <i class="fas fa-shield-alt" style="color: #0284c7;"></i> Also terminate & delete associated Bastion Infra (${associatedInfras.length})
            </div>
            <div style="font-size: 12px; color: #334155; margin-top: 2px;">
              Target Infra: <code>${associatedInfras.map(inf => escapeHtml(inf.id)).join(', ')}</code>
            </div>
            <div style="font-size: 11.5px; color: #64748b; margin-top: 3px;">
              Terminates bastion VM nodes and frees CSP compute, EBS, and public IPv4 hourly costs.
            </div>
          </div>
        </label>
      </div>
    `;
  }

  const ok = await showModalConfirm({
    title: 'Batch Terminate RDBMS Instances',
    html: `
      <div style="text-align: left; font-size: 13.5px; line-height: 1.5;">
        <div style="margin-bottom: 10px;">
          Are you sure you want to permanently delete the <strong>${selected.length}</strong> selected RDBMS instance${selected.length === 1 ? '' : 's'}?
          <div style="color: #dc2626; font-size: 12.5px; margin-top: 4px;">
            <i class="fas fa-exclamation-triangle"></i> This will terminate managed database instances on cloud providers. All databases and data will be permanently destroyed.
          </div>
        </div>

        <div style="max-height: 180px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px; margin: 10px 0; background: #fff;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; color: #475569;">
                <th style="padding: 6px 10px; text-align: left;">Instance</th>
                <th style="padding: 6px 10px; text-align: left;">CSP</th>
                <th style="padding: 6px 10px; text-align: left;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${selected.map(inst => {
                const prov = (inst.connectionConfig?.providerName || inst.connectionName?.split('-')[0] || '').toLowerCase();
                const meta = getProviderMeta(prov);
                return `
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 6px 10px; font-weight: 600;">${escapeHtml(inst.name || inst.id)}</td>
                    <td style="padding: 6px 10px;">
                      <img src="${meta.icon}" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px;" onerror="this.src='/img/circle.png';">
                      ${escapeHtml(meta.name)}
                    </td>
                    <td style="padding: 6px 10px;">${escapeHtml(inst.status || 'Unknown')}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        ${bastionHtml}
      </div>
    `,
    icon: 'danger',
    confirmText: `Permanently Delete (${selected.length} DBs)`,
    confirmButtonClass: 'rdbms-btn-danger',
  });

  if (!ok) return;

  const shouldDeleteBastion = (typeof ok === 'object' && ok.deleteBastion) || Boolean(document.getElementById('rdbmsBatchDeleteBastionCheck')?.checked);

  runBatchDeleteInBackground(selected, shouldDeleteBastion, associatedInfras);
}

async function runBatchDeleteInBackground(selectedInstances, shouldDeleteBastion, associatedInfras) {
  const config = getConfig();
  const instIds = selectedInstances.map(i => i.id);

  const op = {
    id: `op-batch-del-${Date.now()}`,
    type: 'batch-delete',
    title: `Batch Terminate: ${selectedInstances.length} Instance${selectedInstances.length === 1 ? '' : 's'}${shouldDeleteBastion && associatedInfras.length > 0 ? ' & Bastion' : ''}`,
    instanceIds: instIds,
    startTime: Date.now(),
    endTime: null,
    status: 'running',
    steps: [
      ...selectedInstances.map(inst => ({
        id: inst.id,
        title: `Delete DB: ${inst.name || inst.id}`,
        desc: 'Sending termination request to CSP...',
        status: 'running',
        descHtml: '',
        detailsHtml: '',
      })),
      ...(shouldDeleteBastion && associatedInfras.length > 0 ? associatedInfras.map(inf => ({
        id: inf.id,
        title: `Delete Bastion Infra: ${inf.id}`,
        desc: 'Waiting for database terminations to finalize...',
        status: 'pending',
        descHtml: '',
        detailsHtml: '',
      })) : []),
    ],
    summaryHtml: null,
    summaryText: '',
    dismissed: false,
  };

  rdbmsActiveOperations.unshift(op);
  ensureOpsTimer();

  // Clear selection and re-render rows so "Terminating..." spinners appear immediately
  rdbmsState.selectedInstanceIds.clear();
  renderTableRowsAndSync();
  renderActiveOperationsPanelIfOpen();

  showModalNotice(`🗑️ Batch termination of ${selectedInstances.length} instances initiated. Tracking progress in background operations.`, 'info', 7000);

  // 1. Delete RDBMS instances in parallel
  let successCount = 0;
  let failCount = 0;

  await Promise.allSettled(selectedInstances.map(async (inst, idx) => {
    const step = op.steps[idx];
    try {
      await axios.delete(`${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/${encodeURIComponent(inst.id)}`, {
        auth: { username: config.username, password: config.password },
      });
      step.status = 'success';
      step.descHtml = `<span style="color: #16a34a; font-weight: 600;">✓ Database termination accepted.</span>`;
      successCount++;
    } catch (err) {
      failCount++;
      step.status = 'error';
      step.descHtml = `<span style="color: #dc2626; font-weight: 600;">✗ Deletion failed: ${escapeHtml(err.response?.data?.message || err.message)}</span>`;
    }
    renderActiveOperationsPanelIfOpen();
    refreshRdbmsInstancesSilently();
  }));

  // 2. Cascading Delete Bastion Infra (if requested)
  if (shouldDeleteBastion && associatedInfras.length > 0) {
    const baseIdx = selectedInstances.length;
    await Promise.allSettled(associatedInfras.map(async (inf, idx) => {
      const step = op.steps[baseIdx + idx];
      if (step) {
        step.status = 'running';
        step.desc = 'Terminating Bastion VM nodes and releasing ENIs...';
        renderActiveOperationsPanelIfOpen();
      }
      try {
        await axios.delete(`${tbApiBase()}/ns/${rdbmsState.namespace}/infra/${encodeURIComponent(inf.id)}?option=terminate`, {
          auth: { username: config.username, password: config.password },
          timeout: 1800000,
        });
        if (step) {
          step.status = 'success';
          step.descHtml = `<span style="color: #16a34a; font-weight: 600;">✓ Bastion VM nodes terminated and Infra deleted.</span>`;
        }
      } catch (err) {
        if (step) {
          step.status = 'error';
          step.descHtml = `<span style="color: #dc2626; font-weight: 600;">✗ Bastion termination failed: ${escapeHtml(err.response?.data?.message || err.message)}</span>`;
        }
      }
      renderActiveOperationsPanelIfOpen();
    }));
  }

  op.endTime = Date.now();
  if (failCount === 0) {
    op.status = 'success';
    op.summaryText = `Batch Terminate Completed: All ${successCount} instances deleted.`;
    op.summaryHtml = `<strong>✓ Deletion Complete:</strong> Successfully deleted ${successCount} database instance${successCount === 1 ? '' : 's'}.`;
  } else if (successCount > 0) {
    op.status = 'warning';
    op.summaryText = `Batch Terminate Finished: ${successCount} Deleted, ${failCount} Failed.`;
    op.summaryHtml = `<strong>⚠️ Partial Deletion:</strong> ${successCount} deleted, ${failCount} failed.`;
  } else {
    op.status = 'error';
    op.summaryText = `Batch Terminate Failed: All ${failCount} deletions failed.`;
    op.summaryHtml = `<strong>✗ Failed:</strong> Could not delete instances.`;
  }

  renderActiveOperationsPanelIfOpen();
  refreshRdbmsInstancesSilently();
  notifyOperationComplete(op);
}

async function handleBatchReconcile() {
  const selected = (rdbmsState.instanceList || []).filter(i => rdbmsState.selectedInstanceIds && rdbmsState.selectedInstanceIds.has(i.id));
  if (selected.length === 0) {
    showModalNotice('Please select at least one RDBMS instance to reconcile.', 'warning');
    return;
  }

  const ok = await showModalConfirm({
    title: 'Batch Reconcile Instances',
    html: `Reconcile <strong>${selected.length}</strong> selected RDBMS instance${selected.length === 1 ? '' : 's'} against CSP status?`,
    icon: 'info',
    confirmText: `Reconcile (${selected.length} DBs)`,
    confirmButtonClass: 'rdbms-btn-primary',
  });
  if (!ok) return;

  const config = getConfig();
  const spinId = addSpinnerTask(`Batch Reconcile (${selected.length})`);
  try {
    let successCount = 0;
    await Promise.allSettled(selected.map(async (inst) => {
      try {
        await axios.put(`${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/${encodeURIComponent(inst.id)}/reconcile`, {}, {
          auth: { username: config.username, password: config.password },
        });
        successCount++;
      } catch (e) {
        console.warn(`Reconcile failed for ${inst.id}`, e);
      }
    }));
    showModalNotice(`Batch Reconcile completed: ${successCount}/${selected.length} instances updated.`, 'success');
    await refreshRdbmsInstancesSilently();
  } finally {
    removeSpinnerTask(spinId);
  }
}

async function showTestBastionModal(instanceId) {
  const config = getConfig();
  const returnView = rdbmsState.view || 'instances';
  const returnToParent = () => {
    if (returnView === 'detail' && instanceId) {
      showRdbmsModal(instanceId);
    } else {
      showRdbmsModal();
    }
  };

  const inst = (rdbmsState.instanceList || []).find(i => i.id === instanceId) || rdbmsState.currentInstance;
  if (!inst) return;

  const endpoint = inst.endpoint || '';
  const host = endpoint.split(':')[0] || '';
  const port = endpoint.split(':')[1] || '3306';

  let candidateNodes = [];
  try {
    const { allNodes } = await getNamespaceBastionNodes();
    for (const n of allNodes) {
      const isSameVNet = Boolean(inst.vNetId && n.vNetId && (
        inst.vNetId === n.vNetId ||
        inst.vNetId.includes(n.vNetId) ||
        n.vNetId.includes(inst.vNetId)
      ));
      const isPreferred = isSameVNet ||
        Boolean(inst.name && n.infraId.includes(inst.name)) ||
        n.infraId.includes('bastion') ||
        Boolean(n.name?.includes('bastion'));

      candidateNodes.push({
        ...n,
        isSameVNet,
        isPreferred,
      });
    }
  } catch (e) {
    console.warn('Could not fetch infra for bastion candidates', e);
  }

  // Sort candidate nodes: Running first, then Preferred/Same-VPC, then alphabetically
  candidateNodes.sort((a, b) => {
    if (a.isRunning !== b.isRunning) return a.isRunning ? -1 : 1;
    if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  let nodeOptionsHtml = '';
  if (candidateNodes.length > 0) {
    let hasSelected = false;
    nodeOptionsHtml = candidateNodes.map(n => {
      const vpcBadge = n.isSameVNet ? ' [Same In-VPC ★]' : (n.vNetId ? ` [VPC: ${n.vNetId}]` : '');
      const ip = n.publicIP || n.privateIP || 'IP pending';
      const label = `${n.infraId} ➔ ${n.name} (${ip}) [${n.status}]${vpcBadge}`;
      const shouldSelect = !hasSelected && n.isRunning;
      if (shouldSelect) hasSelected = true;
      return `<option value="${escapeHtml(n.infraId)}|${escapeHtml(n.nodeId)}" ${shouldSelect ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
  } else {
    nodeOptionsHtml = `<option value="">(No active VM nodes found in namespace - please create an Infra first)</option>`;
  }

  const prov = (inst.connectionConfig?.providerName || inst.connectionName?.split('-')[0] || 'other').toLowerCase();
  const savedUser = getSavedRdbmsUser(inst.id || inst.name);
  const savedPass = getSavedRdbmsPassword(inst.id || inst.name);
  const effectiveTestUser = inst.adminUserName || inst.masterUserName || getCspCompliantAdminUser(prov, savedUser || 'dbadmin');
  const effectiveTestPass = getCspCompliantAdminPassword(prov, savedPass);

  const res = await showInModalDialog({
    title: `<i class="fas fa-terminal" style="color: #0284c7;"></i> Test DB Connection via Bastion Node`,
    html: `
      <div style="text-align: left; font-size: 13px;">
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 14px;">
          <div><strong>Target RDBMS:</strong> <code>${escapeHtml(inst.name || inst.id)}</code> (${escapeHtml(inst.dbEngine || 'mysql')})</div>
          <div><strong>Endpoint:</strong> <code>${escapeHtml(endpoint || 'Pending (Wait until status is Available)')}</code></div>
          <div><strong>VNet / Mode:</strong> ${escapeHtml(inst.vNetId || 'N/A')} (${inst.publicAccess ? 'Public Access' : 'Private VPC'})</div>
        </div>

        <div class="form-group mb-3">
          <label style="font-weight: 700; color: #334155; margin-bottom: 4px;">1. Select Client / Bastion Node (In-VPC):</label>
          <select class="form-control form-control-sm" id="rdbmsTestNodeSelect" style="font-family: monospace;">
            ${nodeOptionsHtml}
          </select>
          <small class="text-muted">Command will be executed remotely on this VM via SSH / Remote Command.</small>
        </div>

        <div class="form-group mb-3">
          <label style="font-weight: 700; color: #334155; margin-bottom: 4px;">2. Test Command Scenario:</label>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <label style="display: flex; align-items: center; gap: 8px; font-weight: 500; cursor: pointer;">
              <input type="radio" name="rdbmsTestCmdType" value="nc" checked style="accent-color: #0284c7;">
              <strong>TCP 3306 Port Ping</strong> (Checks network & SecurityGroup/ACG reachability)
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-weight: 500; cursor: pointer;">
              <input type="radio" name="rdbmsTestCmdType" value="mysql_status" style="accent-color: #0284c7;">
              <strong>MySQL/MariaDB Version & DB List</strong> (Authenticates & queries system databases)
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-weight: 500; cursor: pointer;">
              <input type="radio" name="rdbmsTestCmdType" value="crud" style="accent-color: #0284c7;">
              <strong>Full DB & Table CRUD Lifecycle</strong> (Create DB ➔ List DB ➔ Table & Row CRUD ➔ Drop Table ➔ Drop DB)
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-weight: 500; cursor: pointer;">
              <input type="radio" name="rdbmsTestCmdType" value="custom" style="accent-color: #0284c7;">
              <strong>Custom Command</strong>
            </label>
          </div>
        </div>

        <div class="form-group mb-3" id="rdbmsTestAuthSection" style="display: none; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-weight: 700; color: #1e293b; font-size: 12.5px;"><i class="fas fa-key text-warning"></i> Admin Credentials for SQL Authentication:</span>
            <span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:600; font-size:11px; padding:3px 8px; border-radius:4px; border:1px solid #bae6fd;">
              <i class="fas fa-magic"></i> Auto-configured for ${escapeHtml(prov.toUpperCase())}: <code>${escapeHtml(effectiveTestUser)}</code>
            </span>
          </div>
          <div style="display: flex; gap: 10px;">
            <div style="flex: 1;">
              <label style="font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 2px; display: block;">Username</label>
              <input type="text" class="form-control form-control-sm" id="rdbmsTestAdminUser" placeholder="Username" value="${escapeHtml(effectiveTestUser)}">
            </div>
            <div style="flex: 1;">
              <label style="font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 2px; display: block;">Password</label>
              <div style="position: relative;">
                <input type="password" class="form-control form-control-sm" id="rdbmsTestAdminPass" placeholder="Password" value="${escapeHtml(effectiveTestPass)}" style="padding-right: 56px;">
                <button type="button" id="rdbmsTestPassToggleBtn" style="position: absolute; right: 28px; top: 4px; background: none; border: none; color: #64748b; cursor: pointer; font-size: 11px;" title="Show/Hide Password">
                  <i class="fas fa-eye"></i>
                </button>
                <button type="button" id="rdbmsTestPassCopyBtn" style="position: absolute; right: 6px; top: 4px; background: none; border: none; color: #64748b; cursor: pointer; font-size: 11px;" title="Copy Password">
                  <i class="far fa-copy"></i>
                </button>
              </div>
            </div>
          </div>
          ${renderRememberPasswordCheckboxHtml('margin-top: 8px;')}
          <small class="text-muted" style="font-size: 11px; margin-top: 4px; display: block;">
            Credentials automatically resolved per ${escapeHtml(prov.toUpperCase())} requirements. You can override them above if needed.
          </small>
        </div>

        <div class="form-group mb-2">
          <label style="font-weight: 700; color: #334155; margin-bottom: 4px;">Executed Shell Command:</label>
          <textarea class="form-control" id="rdbmsTestCmdPreview" rows="3" style="font-family: monospace; font-size: 12px; background: #0f172a; color: #38bdf8;" readonly></textarea>
        </div>
      </div>
    `,
    maxWidth: '680px',
    confirmText: '<i class="fas fa-play"></i> Run Remote Test (Live SSE)',
    cancelText: 'Cancel',
    confirmButtonClass: 'rdbms-btn-primary',
    didOpen: () => {
      const radios = document.querySelectorAll('input[name="rdbmsTestCmdType"]');
      const authSec = document.getElementById('rdbmsTestAuthSection');
      const preview = document.getElementById('rdbmsTestCmdPreview');
      const userEl = document.getElementById('rdbmsTestAdminUser');
      const passEl = document.getElementById('rdbmsTestAdminPass');
      const testToggleBtn = document.getElementById('rdbmsTestPassToggleBtn');
      const testCopyBtn = document.getElementById('rdbmsTestPassCopyBtn');

      if (testToggleBtn && passEl) {
        testToggleBtn.onclick = () => {
          const isPass = passEl.type === 'password';
          passEl.type = isPass ? 'text' : 'password';
          testToggleBtn.innerHTML = isPass ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
        };
      }
      if (testCopyBtn && passEl) {
        testCopyBtn.onclick = () => {
          if (passEl.value) {
            navigator.clipboard.writeText(passEl.value);
            testCopyBtn.innerHTML = '<i class="fas fa-check" style="color: #16a34a;"></i>';
            setTimeout(() => { testCopyBtn.innerHTML = '<i class="far fa-copy"></i>'; }, 1500);
          }
        };
      }

      attachRememberPassCheckboxListeners(authSec || document);

      let actualCmd = '';
      let displayCmd = '';

      const updatePreview = () => {
        const type = document.querySelector('input[name="rdbmsTestCmdType"]:checked')?.value;
        if (type === 'nc') {
          authSec.style.display = 'none';
          const ncCheck = 'which nc >/dev/null 2>&1 || (sudo apt-get update -y >/dev/null 2>&1 && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y netcat-openbsd >/dev/null 2>&1) || (sudo yum install -y nc >/dev/null 2>&1) || true; ';
          actualCmd = `${ncCheck}nc -zv -w 5 ${host || '<host>'} ${port || 3306}`;
          displayCmd = `nc -zv -w 5 ${host || '<host>'} ${port || 3306}`;
          if (preview) { preview.readOnly = true; preview.value = displayCmd; }
        } else if (type === 'mysql_status') {
          authSec.style.display = 'block';
          const u = userEl?.value || effectiveTestUser;
          const p = passEl?.value || effectiveTestPass;
          const safeP = p.replace(/'/g, "'\\''");
          const clientCheck = 'which mysql >/dev/null 2>&1 || which mariadb >/dev/null 2>&1 || (sudo apt-get update -y >/dev/null 2>&1 && (sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-client >/dev/null 2>&1 || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-client >/dev/null 2>&1) || (sudo yum install -y mariadb >/dev/null 2>&1)) || true; ';
          const clientBin = '$(which mysql 2>/dev/null || which mariadb 2>/dev/null || echo mysql)';
          actualCmd = `${clientCheck}${clientBin} --defaults-extra-file=<(printf "[client]\\npassword=%s\\n" '${safeP}') -h ${host || '<host>'} -P ${port || 3306} -u ${u} -e "SELECT VERSION(); SHOW DATABASES;"`;
          displayCmd = `mysql --defaults-extra-file=<(printf "[client]\\npassword=%s\\n" '••••••••') -h ${host || '<host>'} -P ${port || 3306} -u ${u} -e "SELECT VERSION(); SHOW DATABASES;"`;
          if (preview) {
            preview.readOnly = true;
            preview.value = displayCmd;
          }
        } else if (type === 'crud') {
          authSec.style.display = 'block';
          const u = userEl?.value || effectiveTestUser;
          const p = passEl?.value || effectiveTestPass;
          const safeP = p.replace(/'/g, "'\\''");
          const isDirectSqlDbManage = prov === 'aws' || prov === 'ibm';
          const sqlScript = buildCrudLifecycleSqlScript(isDirectSqlDbManage, 'tb_crud_test', 'tb_crud_items');
          const clientCheck = 'which mysql >/dev/null 2>&1 || which mariadb >/dev/null 2>&1 || (sudo apt-get update -y >/dev/null 2>&1 && (sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-client >/dev/null 2>&1 || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-client >/dev/null 2>&1) || (sudo yum install -y mariadb >/dev/null 2>&1)) || true; ';
          const clientBin = '$(which mysql 2>/dev/null || which mariadb 2>/dev/null || echo mysql)';
          actualCmd = `${clientCheck}${clientBin} --defaults-extra-file=<(printf "[client]\\npassword=%s\\n" '${safeP}') -h ${host || '<host>'} -P ${port || 3306} -u ${u} -e "${sqlScript}"`;
          displayCmd = isDirectSqlDbManage
            ? `mysql --defaults-extra-file=<(printf "[client]\\npassword=%s\\n" '••••••••') -h ${host || '<host>'} -P ${port || 3306} -u ${u} -e "CREATE DATABASE tb_crud_test; SHOW DATABASES; USE tb_crud_test; CREATE TABLE tb_crud_items (...); INSERT / SELECT / UPDATE / DELETE; DROP TABLE tb_crud_items; DROP DATABASE tb_crud_test;"`
            : `[1/5 API] POST /database {tb_crud_test}\n[2-4/5 SQL] mysql --defaults-extra-file=<(printf "[client]\\npassword=%s\\n" '••••••••') -h ${host || '<host>'} -P ${port || 3306} -u ${u} -e "SHOW DATABASES; USE tb_crud_test; CREATE TABLE tb_crud_items (...); INSERT / SELECT / UPDATE / DELETE; DROP TABLE tb_crud_items;"\n[5/5 API] DELETE /database/tb_crud_test`;
          if (preview) {
            preview.readOnly = true;
            preview.value = displayCmd;
          }
        } else {
          authSec.style.display = 'none';
          if (preview) {
            preview.readOnly = false;
            actualCmd = preview.value;
            displayCmd = preview.value;
          }
        }
      };

      radios.forEach(r => r.onchange = updatePreview);
      if (userEl) {
        userEl.oninput = () => {
          saveRdbmsSessionCredentials(userEl.value, null, inst.id || inst.name);
          updatePreview();
        };
      }
      if (passEl) {
        passEl.oninput = () => {
          saveRdbmsSessionCredentials(null, passEl.value, inst.id || inst.name);
          updatePreview();
        };
      }
      updatePreview();

      window._rdbmsGetTestCmd = () => {
        const type = document.querySelector('input[name="rdbmsTestCmdType"]:checked')?.value;
        const authUser = userEl?.value || effectiveTestUser;
        const authPass = passEl?.value || effectiveTestPass;
        if (type === 'custom') {
          const val = preview?.value?.trim() || '';
          return { cmd: val, templateCmd: val, type, authUser, authPass };
        }
        return { cmd: actualCmd, templateCmd: displayCmd, type, authUser, authPass };
      };
    },
    preConfirm: () => {
      const nodeVal = document.getElementById('rdbmsTestNodeSelect')?.value;
      if (!nodeVal) {
        showDialogValidationMessage('Please select a running Bastion VM node');
        return false;
      }
      const [infraId, nodeId] = nodeVal.split('|');
      const { cmd, templateCmd, type, authUser, authPass } = (typeof window._rdbmsGetTestCmd === 'function')
        ? window._rdbmsGetTestCmd()
        : { cmd: document.getElementById('rdbmsTestCmdPreview')?.value?.trim(), templateCmd: '', type: 'nc', authUser: effectiveTestUser, authPass: effectiveTestPass };
      if (!cmd) {
        showDialogValidationMessage('Command cannot be empty');
        return false;
      }
      return { infraId, nodeId, cmd, templateCmd: templateCmd || cmd, type, authUser, authPass };
    },
  });

  if (!res.isConfirmed || !res.value) {
    return;
  }
    const { infraId, nodeId, cmd, templateCmd, type, authUser, authPass } = res.value;
    const isDirectSqlDbManage = prov === 'aws' || prov === 'ibm';
    const crudDbName = 'tb_crud_test';

    const spinId = addSpinnerTask(`Test RDBMS from ${nodeId}`);
    let dbCreatedViaApi = false;
    try {
      let finalCmd = cmd;
      if (type === 'crud' && !isDirectSqlDbManage) {
        try {
          await axios.post(
            `${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/${encodeURIComponent(inst.id)}/database`,
            { databaseName: crudDbName },
            {
              auth: { username: config.username, password: config.password },
              headers: {
                'X-Admin-User-Name': authUser,
                'X-Admin-User-Password': authPass,
              },
            }
          );
          dbCreatedViaApi = true;
        } catch (createErr) {
          const msg = createErr.response?.data?.message || createErr.message || '';
          if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('duplicate') || createErr.response?.status === 409) {
            dbCreatedViaApi = true;
          } else {
            throw new Error(`Create DB '${crudDbName}' failed: ${msg}`);
          }
        }
        const listRes = await axios.get(
          `${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/${encodeURIComponent(inst.id)}/database`,
          {
            auth: { username: config.username, password: config.password },
            headers: {
              'X-Admin-User-Name': authUser,
              'X-Admin-User-Password': authPass,
            },
          }
        );
        const dbListStr = (listRes.data?.databases || []).join(', ');
        finalCmd = `echo "=== [1/5] CREATE DATABASE (Control Plane API): '${crudDbName}' ready ==="; echo "=== [2/5] LIST DATABASES (Control Plane API): [${dbListStr.replace(/"/g, '')}] ==="; ${cmd}`;
      }

      const asyncUrl = `${tbApiBase()}/ns/${rdbmsState.namespace}/cmd/infra/${encodeURIComponent(infraId)}?async=true&nodeId=${encodeURIComponent(nodeId)}`;
      const cmdReq = {
        command: [finalCmd],
        timeoutMinutes: 5,
      };

      const cmdRes = await axios.post(asyncUrl, cmdReq, {
        auth: { username: config.username, password: config.password },
      });

      if (cmdRes.status === 202 && cmdRes.data?.xRequestId) {
        const xReqId = cmdRes.data.xRequestId;
        const streamUrl = `${tbApiBase()}/ns/${rdbmsState.namespace}/stream/cmd/infra/${encodeURIComponent(infraId)}?xRequestId=${encodeURIComponent(xReqId)}`;
        let dropHandled = false;
        const ensureCrudDbDropped = async () => {
          if (dropHandled || type !== 'crud' || isDirectSqlDbManage || !dbCreatedViaApi) return;
          dropHandled = true;
          try {
            await axios.delete(
              `${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/${encodeURIComponent(inst.id)}/database/${encodeURIComponent(crudDbName)}`,
              {
                auth: { username: config.username, password: config.password },
                headers: {
                  'X-Admin-User-Name': authUser,
                  'X-Admin-User-Password': authPass,
                },
              }
            );
            const sess = window._cmdStreamSessions?.[xReqId];
            if (sess?.nodeState?.[nodeId]?.stdoutLines) {
              sess.nodeState[nodeId].stdoutLines.push(`=== [5/5] DROP DATABASE (Control Plane API): '${crudDbName}' dropped ===`);
              if (typeof sess.rebuildCallback === 'function') sess.rebuildCallback();
            }
          } catch (dropErr) {
            const sess = window._cmdStreamSessions?.[xReqId];
            if (sess?.nodeState?.[nodeId]?.stdoutLines) {
              sess.nodeState[nodeId].stdoutLines.push(`=== [5/5] DROP DATABASE ERROR: ${dropErr.response?.data?.message || dropErr.message} ===`);
              if (typeof sess.rebuildCallback === 'function') sess.rebuildCallback();
            }
          }
        };

        if (type === 'crud' && !isDirectSqlDbManage && dbCreatedViaApi) {
          let checks = 0;
          const pollTimer = setInterval(() => {
            checks++;
            const sess = window._cmdStreamSessions?.[xReqId];
            if (!sess || sess.doneSummary || sess.error || checks > 180) {
              clearInterval(pollTimer);
              ensureCrudDbDropped();
            }
          }, 1000);
        }

        if (typeof window.startStreamingSession === 'function') {
          window.startStreamingSession(
            streamUrl,
            config.username,
            config.password,
            xReqId,
            infraId,
            spinId,
            null,
            [templateCmd || cmd],
            async () => {
              await ensureCrudDbDropped();
              returnToParent();
            }
          );
        } else {
          await ensureCrudDbDropped();
          rdbmsState.pendingNotice = {
            message: `Command dispatched (Request ID: ${xReqId}). Check Activity Card for real-time progress.`,
            type: 'success',
          };
          returnToParent();
        }
      } else {
        if (type === 'crud' && !isDirectSqlDbManage && dbCreatedViaApi) {
          await axios.delete(
            `${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/${encodeURIComponent(inst.id)}/database/${encodeURIComponent(crudDbName)}`,
            {
              auth: { username: config.username, password: config.password },
              headers: {
                'X-Admin-User-Name': authUser,
                'X-Admin-User-Password': authPass,
              },
            }
          ).catch(() => {});
        }
        rdbmsState.pendingNotice = {
          message: 'Command executed (sync): ' + JSON.stringify(cmdRes.data),
          type: 'info',
        };
        returnToParent();
      }
    } catch (err) {
      if (type === 'crud' && !isDirectSqlDbManage && dbCreatedViaApi) {
        await axios.delete(
          `${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/${encodeURIComponent(inst.id)}/database/${encodeURIComponent(crudDbName)}`,
          {
            auth: { username: config.username, password: config.password },
            headers: {
              'X-Admin-User-Name': authUser,
              'X-Admin-User-Password': authPass,
            },
          }
        ).catch(() => {});
      }
      rdbmsState.pendingNotice = {
        message: 'Remote test failed: ' + (err.response?.data?.message || err.message),
        type: 'error',
      };
      returnToParent();
    } finally {
      removeSpinnerTask(spinId);
    }
}

function attachInstanceListEvents() {
  attachActiveOperationsEvents();

  // Clear Passwords Button
  const clearCredsBtn = document.getElementById('rdbmsClearCredsBtn');
  if (clearCredsBtn) {
    clearCredsBtn.onclick = async () => {
      const ok = await showModalConfirm({
        title: 'Clear Stored DB Passwords',
        html: `Are you sure you want to clear all stored database passwords from this browser?<br><br><span style="font-size: 12px; color: #64748b;">(Usernames and configurations will be preserved, but passwords will be removed from <code>localStorage</code> and memory)</span>`,
        icon: 'warning',
        confirmText: 'Clear Passwords',
        confirmButtonClass: 'rdbms-btn-danger',
      });
      if (ok) {
        clearAllSavedRdbmsPasswords(true);
      }
    };
  }

  // Attach Remember Password checkbox listeners across the list view
  attachRememberPassCheckboxListeners(document.getElementById('rdbmsModalContent') || document);

  // Refresh Button
  const refreshBtn = document.getElementById('rdbmsRefreshBtn');
  if (refreshBtn) {
    refreshBtn.onclick = async () => {
      await renderInstanceListView(document.getElementById('rdbmsModalContent'));
    };
  }

  // Reconcile All Button
  const recAllBtn = document.getElementById('rdbmsReconcileAllBtn');
  if (recAllBtn) {
    recAllBtn.onclick = async () => {
      const ok = await showModalConfirm({
        title: 'Reconcile All RDBMS Instances',
        html: `Reconcile all RDBMS instances against CSP status for namespace <strong>${escapeHtml(rdbmsState.namespace)}</strong>?`,
        icon: 'info',
        confirmText: 'Reconcile All',
        confirmButtonClass: 'rdbms-btn-primary',
      });
      if (!ok) return;

      const config = getConfig();
      const spinId = addSpinnerTask('Reconcile All RDBMS');
      try {
        await axios.put(`${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/reconcile`, {}, {
          auth: { username: config.username, password: config.password },
        });
        showModalNotice('Reconciliation completed successfully.', 'success');
        await renderInstanceListView(document.getElementById('rdbmsModalContent'));
      } catch (err) {
        showModalNotice('Reconcile failed: ' + (err.response?.data?.message || err.message), 'error');
      } finally {
        removeSpinnerTask(spinId);
      }
    };
  }

  const updateCspUserPreview = () => {
    const container = document.getElementById('rdbmsCspUserPreview');
    if (!container) return;
    const userInput = document.getElementById('rdbmsAdminUserInput')?.value || '';
    let csps = [];
    if (rdbmsState.provisionMode === 'bastion-set') {
      csps = rdbmsState.multiCspSelected || [];
    } else {
      const connName = document.getElementById('rdbmsConnSelect')?.value || '';
      const selectedConn = (window.cloudBaristaCentralData?.connConfig || []).find(c => (c.configName || c.name) === connName);
      const prov = (selectedConn?.providerName || connName.split('-')[0] || rdbmsState.selectedProvider || '').toLowerCase();
      if (prov) csps = [prov];
    }
    container.innerHTML = renderCspUserPreviewHtml(csps, userInput);
  };

  // Toggle Create Form
  const toggleBtn = document.getElementById('rdbmsToggleCreateFormBtn');
  const closeFormBtn = document.getElementById('rdbmsCloseFormBtn');
  const formCard = document.getElementById('rdbmsCreateFormCard');

  const setFormOpen = (open) => {
    rdbmsState.isFormOpen = open;
    if (formCard) formCard.style.display = open ? 'block' : 'none';
    if (toggleBtn) {
      toggleBtn.innerHTML = open ? '<i class="fas fa-times"></i> Cancel' : '<i class="fas fa-plus"></i> New RDBMS Instance';
    }
    if (open) {
      if (rdbmsState.provisionMode === 'manual') {
        populateCreateFormConnections();
      }
      updateCspUserPreview();
      updatePublicAccessControl();
      formCard.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (toggleBtn) toggleBtn.onclick = () => setFormOpen(!rdbmsState.isFormOpen);
  if (closeFormBtn) closeFormBtn.onclick = () => setFormOpen(false);

  // Provisioning Mode Tabs
  const modeBastionBtn = document.getElementById('rdbmsModeBastionBtn');
  const modeManualBtn = document.getElementById('rdbmsModeManualBtn');
  const bastionSection = document.getElementById('rdbmsBastionSetSection');
  const manualSection = document.getElementById('rdbmsManualNetSection');
  const validateBtn = document.getElementById('rdbmsValidateBtn');
  const submitBtn = document.getElementById('rdbmsSubmitCreateBtn');

  const setProvisionMode = (mode) => {
    rdbmsState.provisionMode = mode;
    if (mode === 'bastion-set') {
      if (modeBastionBtn) { modeBastionBtn.className = 'rdbms-btn rdbms-btn-primary'; modeBastionBtn.style.fontWeight = '700'; }
      if (modeManualBtn) { modeManualBtn.className = 'rdbms-btn rdbms-btn-secondary'; modeManualBtn.style.fontWeight = '700'; }
      if (bastionSection) bastionSection.style.display = 'block';
      if (manualSection) manualSection.style.display = 'none';
      if (validateBtn) validateBtn.style.display = 'none';
      if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-rocket"></i> Deploy DB & Bastion Set';
    } else {
      if (modeBastionBtn) { modeBastionBtn.className = 'rdbms-btn rdbms-btn-secondary'; modeBastionBtn.style.fontWeight = '700'; }
      if (modeManualBtn) { modeManualBtn.className = 'rdbms-btn rdbms-btn-primary'; modeManualBtn.style.fontWeight = '700'; }
      if (bastionSection) bastionSection.style.display = 'none';
      if (manualSection) manualSection.style.display = 'block';
      if (validateBtn) validateBtn.style.display = 'inline-flex';
      if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-rocket"></i> Create RDBMS Instance';
      populateCreateFormConnections();
    }
    updateCspUserPreview();
    updatePublicAccessControl();
  };

  if (modeBastionBtn) modeBastionBtn.onclick = () => setProvisionMode('bastion-set');
  if (modeManualBtn) modeManualBtn.onclick = () => setProvisionMode('manual');

  // CSP checkboxes in Bastion Set mode
  document.querySelectorAll('.rdbms-csp-check').forEach(chk => {
    chk.onchange = () => {
      const selected = Array.from(document.querySelectorAll('.rdbms-csp-check:checked')).map(el => el.value);
      rdbmsState.multiCspSelected = selected;
      updateCspUserPreview();
      updatePublicAccessControl();
    };
  });

  const bastionPublicAccessCheck = document.getElementById('rdbmsBastionPublicAccessCheck');
  if (bastionPublicAccessCheck) {
    bastionPublicAccessCheck.onchange = () => {
      updatePublicAccessControl();
    };
  }

  // CSP Tile Selection
  const tiles = document.querySelectorAll('.rdbms-csp-tile');
  tiles.forEach(tile => {
    tile.onclick = () => {
      const p = tile.dataset.provider;
      rdbmsState.selectedProvider = p;
      tiles.forEach(t => t.classList.remove('active'));
      tile.classList.add('active');

      const infoBox = document.getElementById('rdbmsCspInfoBox');
      if (infoBox) {
        if (p === 'all') {
          const totalCount = (rdbmsState.instanceList || []).length;
          infoBox.innerHTML = `
            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
              <div><strong>Scope:</strong> <span class="rdbms-badge rdbms-badge-info" style="padding: 2px 6px;">All Supported Clouds (9 Providers)</span></div>
              <div><strong>Supported Engines:</strong> MySQL, MariaDB</div>
              <div><strong>Total Instances:</strong> ${totalCount} Instance${totalCount === 1 ? '' : 's'}</div>
            </div>
            <div style="margin-top: 4px; color: #64748b; font-size: 12px;">ℹ️ Showing RDBMS instances across all cloud providers. Select a specific cloud above to filter instances and inspect provider-native capabilities and constraints.</div>
          `;
        } else {
          // Update info box
          const cspSup = rdbmsState.supportMatrix?.[p] || {};
          const enginesStr = (cspSup.supportedDBEngines || ['mysql']).join(', ');
          const opMethod = cspSup.dbOperationMethod || 'cspNativeApi';
          const tagStr = cspSup.supportsTag ? '✅ Supported' : '❌ Unsupported';
          const storageSelectStr = cspSup.storageTypeSelectable ? '✅ User Selectable' : '⚙️ Auto-managed';
          const cspNote = cspSup.note ? `<div style="margin-top:4px;color:#64748b;font-size:12px;">ℹ️ ${escapeHtml(cspSup.note)}</div>` : '';

          infoBox.innerHTML = `
            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
              <div><strong>Engines:</strong> <span class="rdbms-badge rdbms-badge-info" style="padding: 2px 6px;">${escapeHtml(enginesStr)}</span></div>
              <div><strong>DB Op Method:</strong> <code>${escapeHtml(opMethod)}</code></div>
              <div><strong>Tag Support:</strong> ${tagStr}</div>
              <div><strong>Storage Type:</strong> ${storageSelectStr}</div>
            </div>
            ${cspNote}
          `;
        }
      }

      // Update create form if open
      if (rdbmsState.isFormOpen && rdbmsState.provisionMode === 'manual') {
        populateCreateFormConnections();
      }
      updateCspUserPreview();
      updatePublicAccessControl();

      // Refresh table rows
      renderTableRowsAndSync();
    };
  });

  // Filter Input
  const filterInput = document.getElementById('rdbmsFilterInput');
  if (filterInput) {
    filterInput.oninput = (e) => {
      rdbmsState.filterText = e.target.value;
      renderTableRowsAndSync();
    };
  }

  // AutoFill Toggle
  const autoFillCheck = document.getElementById('rdbmsAutoFillDefaults');
  const manualFields = document.getElementById('rdbmsManualSpecFields');
  if (autoFillCheck && manualFields) {
    autoFillCheck.onchange = () => {
      manualFields.style.display = autoFillCheck.checked ? 'none' : 'block';
    };
  }

  // Password visibility toggle
  const togglePassBtn = document.getElementById('rdbmsTogglePassBtn');
  const passInput = document.getElementById('rdbmsAdminPassInput');
  if (togglePassBtn && passInput) {
    togglePassBtn.onclick = () => {
      const isPass = passInput.type === 'password';
      passInput.type = isPass ? 'text' : 'password';
      togglePassBtn.innerHTML = isPass ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
    };
  }

  // Connection change -> populate VNet & Subnet
  const connSelect = document.getElementById('rdbmsConnSelect');
  if (connSelect) {
    connSelect.onchange = () => {
      populateVNetOptions(connSelect.value);
      updateCspUserPreview();
    };
  }

  // Admin Username input change -> update compatibility preview & session credentials
  const adminUserInput = document.getElementById('rdbmsAdminUserInput');
  if (adminUserInput) {
    adminUserInput.oninput = () => {
      saveRdbmsSessionCredentials(adminUserInput.value, null);
      updateCspUserPreview();
    };
  }
  if (passInput) {
    passInput.oninput = () => {
      saveRdbmsSessionCredentials(null, passInput.value);
    };
  }

  // VNet change -> populate Subnet & SG
  const vNetSelect = document.getElementById('rdbmsVNetSelect');
  if (vNetSelect) {
    vNetSelect.onchange = () => {
      populateSubnetAndSgOptions(vNetSelect.value);
    };
  }

  // Validate Button (Dry Run)
  if (validateBtn) {
    validateBtn.onclick = async () => {
      const req = buildCreateRequestObject();
      if (!req) return;

      const config = getConfig();
      const spinId = addSpinnerTask('Validate RDBMS');
      try {
        const res = await axios.post(`${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/validate`, req, {
          auth: { username: config.username, password: config.password },
        });
        showModalNotice('✅ Validation passed! Resolved configuration is valid for deployment.', 'success', 8000);
      } catch (err) {
        showModalNotice('❌ Validation failed: ' + (err.response?.data?.message || err.message), 'error');
      } finally {
        removeSpinnerTask(spinId);
      }
    };
  }

  // Submit Create Form
  const handleCreateSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    if (rdbmsState.provisionMode === 'bastion-set') {
      const baseName = (document.getElementById('rdbmsNameInput')?.value || '').trim();
      const engine = document.getElementById('rdbmsEngineSelect')?.value || 'mysql';
      const adminUser = (document.getElementById('rdbmsAdminUserInput')?.value || '').trim();
      const adminPass = (document.getElementById('rdbmsAdminPassInput')?.value || '').trim();
      const selectedCsps = rdbmsState.multiCspSelected || [];
      const userPublicAccess = !!document.getElementById('rdbmsBastionPublicAccessCheck')?.checked;

      if (!baseName) {
        showModalNotice('Please enter an instance name / prefix.', 'warning');
        return;
      }
      if (!/^[a-zA-Z0-9-]+$/.test(baseName)) {
        showModalNotice('Instance name may only contain alphanumeric characters and hyphens.', 'warning');
        return;
      }
      if (selectedCsps.length === 0) {
        showModalNotice('Please select at least one target CSP.', 'warning');
        return;
      }
      if (!adminUser) {
        showModalNotice('Please provide Master Admin Username.', 'warning');
        return;
      }
      if (!adminPass) {
        showModalNotice('Please provide Master Admin Password.', 'warning');
        return;
      }
      const passErr = validateAdminPasswordForCsps(adminPass, selectedCsps);
      if (passErr) {
        showModalNotice(passErr, 'warning');
        return;
      }

      await handleBastionSetCreate(baseName, selectedCsps, engine, adminUser, adminPass, userPublicAccess);
      return;
    }

    // Manual Mode
    const req = buildCreateRequestObject();
    if (!req) return;

    const selectedConn = (window.cloudBaristaCentralData?.connConfig || []).find(c => (c.configName || c.name) === req.connectionName);
    const targetCsp = (selectedConn?.providerName || req.connectionName.split('-')[0] || '').toLowerCase();
    const userDetail = getCspAdminUserDetail(targetCsp, document.getElementById('rdbmsAdminUserInput')?.value?.trim());

    let adaptNote = '';
    if (userDetail.isAdapted) {
      adaptNote = `<div style="margin-top: 8px; padding: 6px 10px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 4px; font-size: 12px; color: #1e40af;">
        <i class="fas fa-info-circle"></i> <strong>${escapeHtml(targetCsp.toUpperCase())} Account Note:</strong> Admin Username will be configured as <code>${escapeHtml(req.adminUserName)}</code> (${escapeHtml(userDetail.reason)})
      </div>`;
    }

    const ok = await showModalConfirm({
      title: 'Create RDBMS Instance',
      html: `
        <div style="text-align: left; font-size: 13.5px; line-height: 1.6;">
          Deploy managed <strong>${escapeHtml(req.dbEngine)}</strong> instance <strong>${escapeHtml(req.name)}</strong> on <strong>${escapeHtml(req.connectionName)}</strong>?
          ${adaptNote}
          <div style="margin-top: 8px;"><small class="text-muted">Cloud database creation typically takes 3 to 8 minutes.</small></div>
        </div>
      `,
      icon: 'info',
      confirmText: 'Create Now',
      confirmButtonClass: 'rdbms-btn-primary',
    });
    if (!ok) return;

    saveRdbmsSessionCredentials(req.adminUserName, req.adminUserPassword, req.name);

    const config = getConfig();
    const spinId = addSpinnerTask(`Create RDBMS: ${req.name}`);
    try {
      showModalNotice(`Creating RDBMS "${req.name}"... request submitted to CB-Tumblebug.`, 'info', 6000);
      await axios.post(`${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms`, req, {
        auth: { username: config.username, password: config.password },
      });
      showModalNotice(`RDBMS "${req.name}" creation initiated successfully!`, 'success');
      setFormOpen(false);
      await renderInstanceListView(document.getElementById('rdbmsModalContent'));
    } catch (err) {
      showModalNotice('Create failed: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      removeSpinnerTask(spinId);
    }
  };

  const form = document.getElementById('rdbmsCreateForm');
  if (form) {
    form.onsubmit = handleCreateSubmit;
  }
  if (submitBtn) {
    submitBtn.onclick = handleCreateSubmit;
  }

  // Select All Checkbox
  const selectAllCheck = document.getElementById('rdbmsSelectAllCheck');
  if (selectAllCheck) {
    selectAllCheck.onchange = () => {
      if (!rdbmsState.selectedInstanceIds) rdbmsState.selectedInstanceIds = new Set();
      const visible = getVisibleInstances();
      if (selectAllCheck.checked) {
        visible.forEach(inst => rdbmsState.selectedInstanceIds.add(inst.id));
      } else {
        visible.forEach(inst => rdbmsState.selectedInstanceIds.delete(inst.id));
      }
      renderTableRowsAndSync();
    };
  }

  // Quick Select Dropdown Button & Menu
  const quickSelectBtn = document.getElementById('rdbmsQuickSelectBtn');
  const quickSelectMenu = document.getElementById('rdbmsQuickSelectMenu');
  if (quickSelectBtn && quickSelectMenu) {
    quickSelectBtn.onclick = (e) => {
      e.stopPropagation();
      quickSelectMenu.style.display = quickSelectMenu.style.display === 'block' ? 'none' : 'block';
    };
    document.addEventListener('click', (e) => {
      if (!quickSelectBtn.contains(e.target) && !quickSelectMenu.contains(e.target)) {
        quickSelectMenu.style.display = 'none';
      }
    });

    quickSelectMenu.querySelectorAll('.rdbms-dropdown-item').forEach(item => {
      item.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        quickSelectMenu.style.display = 'none';
        const mode = item.dataset.select;
        if (!rdbmsState.selectedInstanceIds) rdbmsState.selectedInstanceIds = new Set();
        const visible = getVisibleInstances();

        if (mode === 'available') {
          rdbmsState.selectedInstanceIds.clear();
          visible.forEach(inst => {
            if ((inst.status || '').toLowerCase() === 'available') {
              rdbmsState.selectedInstanceIds.add(inst.id);
            }
          });
        } else if (mode === 'failed') {
          rdbmsState.selectedInstanceIds.clear();
          visible.forEach(inst => {
            const s = (inst.status || '').toLowerCase();
            if (s.includes('fail') || s.includes('error')) {
              rdbmsState.selectedInstanceIds.add(inst.id);
            }
          });
        } else if (mode === 'all') {
          rdbmsState.selectedInstanceIds.clear();
          visible.forEach(inst => rdbmsState.selectedInstanceIds.add(inst.id));
        } else if (mode === 'none') {
          rdbmsState.selectedInstanceIds.clear();
        }

        renderTableRowsAndSync();
      };
    });
  }

  // Batch Test Button
  const batchTestBtn = document.getElementById('rdbmsBatchTestBtn');
  if (batchTestBtn) {
    batchTestBtn.onclick = async () => {
      await showBatchTestModal();
    };
  }

  // Batch Terminate Button
  const batchDeleteBtn = document.getElementById('rdbmsBatchDeleteBtn');
  if (batchDeleteBtn) {
    batchDeleteBtn.onclick = async () => {
      await showBatchDeleteModal();
    };
  }

  // Batch Reconcile Button
  const batchRecBtn = document.getElementById('rdbmsBatchReconcileBtn');
  if (batchRecBtn) {
    batchRecBtn.onclick = async () => {
      await handleBatchReconcile();
    };
  }

  updateCspUserPreview();
  attachRowEvents();
  updateBatchToolbarState();
}

function attachRowEvents() {
  // Row selection checkboxes
  document.querySelectorAll('.rdbms-instance-check').forEach(chk => {
    chk.onchange = (e) => {
      e.stopPropagation();
      const id = chk.dataset.id;
      if (!rdbmsState.selectedInstanceIds) rdbmsState.selectedInstanceIds = new Set();
      if (chk.checked) {
        rdbmsState.selectedInstanceIds.add(id);
      } else {
        rdbmsState.selectedInstanceIds.delete(id);
      }
      const tr = chk.closest('tr');
      if (tr) {
        if (chk.checked) tr.classList.add('rdbms-row-selected');
        else tr.classList.remove('rdbms-row-selected');
      }
      updateBatchToolbarState();
    };
  });

  // Test Bastion button
  document.querySelectorAll('.btn-test-bastion').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      await showTestBastionModal(id);
    };
  });

  // Manage Instance button
  document.querySelectorAll('.btn-manage-instance').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const inst = (rdbmsState.instanceList || []).find(i => i.id === id);
      rdbmsState.currentInstance = inst || { id, name: id };
      rdbmsState.view = 'detail';
      await renderModalView();
    };
  });

  // Reconcile Instance button
  document.querySelectorAll('.btn-reconcile-instance').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const ok = await showModalConfirm({
        title: 'Reconcile Instance',
        html: `Reconcile RDBMS instance <strong>${escapeHtml(id)}</strong> against CSP status?`,
        icon: 'info',
        confirmText: 'Reconcile',
        confirmButtonClass: 'rdbms-btn-primary',
      });
      if (!ok) return;

      const config = getConfig();
      const spinId = addSpinnerTask(`Reconcile RDBMS: ${id}`);
      try {
        await axios.put(`${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/${id}/reconcile`, {}, {
          auth: { username: config.username, password: config.password },
        });
        showModalNotice(`RDBMS "${id}" reconciled successfully.`, 'success');
        await renderInstanceListView(document.getElementById('rdbmsModalContent'));
      } catch (err) {
        showModalNotice('Reconcile failed: ' + (err.response?.data?.message || err.message), 'error');
      } finally {
        removeSpinnerTask(spinId);
      }
    };
  });

  // Retry Failed Instance button
  document.querySelectorAll('.btn-retry-instance').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      await handleRetryFailedInstance(id);
    };
  });

  // Delete Instance button
  document.querySelectorAll('.btn-delete-instance').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      await handleDeleteInstance(id, name);
    };
  });

  // Copy buttons
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const txt = btn.dataset.copy;
      if (txt) {
        navigator.clipboard.writeText(txt);
        btn.innerHTML = '<i class="fas fa-check" style="color:#16a34a;"></i>';
        setTimeout(() => { btn.innerHTML = '<i class="far fa-copy"></i>'; }, 1500);
      }
    };
  });
}

async function handleRetryFailedInstance(id) {
  if (!id) return;
  const inst = (rdbmsState.instanceList || []).find(i => i.id === id);
  if (!inst) {
    showModalNotice(`Instance ${id} not found in current list.`, 'warning');
    return;
  }

  const prov = (inst.connectionConfig?.providerName || inst.connectionName?.split('-')[0] || '').toLowerCase();
  const meta = getProviderMeta(prov);
  const savedUser = getSavedRdbmsUser(inst.id || inst.name);
  const savedPass = getSavedRdbmsPassword(inst.id || inst.name);
  const defaultUser = inst.adminUserName || inst.masterUserName || getCspCompliantAdminUser(prov, savedUser || rdbmsState.adminUser || 'dbadmin');
  const defaultPass = savedPass || rdbmsState.adminPassword || 'Admin1234!';
  const compliantPass = getCspCompliantAdminPassword(prov, defaultPass);
  let defaultEngineVer = inst.dbEngineVersion || '';
  if (prov === 'openstack') {
    if (!defaultEngineVer || defaultEngineVer === '5.7.29') defaultEngineVer = '8.4';
    else if (defaultEngineVer === '10.4') defaultEngineVer = '11.4';
  }

  const res = await showInModalDialog({
    title: `<i class="fas fa-redo" style="color: #d97706;"></i> Retry RDBMS Provisioning`,
    html: `
      <div style="text-align: left; font-size: 13px;">
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 12px; margin-bottom: 14px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <img src="${meta.icon}" class="rdbms-csp-logo" onerror="this.src='/img/circle.png';" style="width: 20px; height: 20px;">
            <strong>Target RDBMS:</strong> <code>${escapeHtml(inst.name || inst.id)}</code>
            <span class="rdbms-badge rdbms-badge-warning" style="font-size: 11px;">${escapeHtml(prov.toUpperCase())}</span>
          </div>
          <div style="font-size: 12px; color: #475569; display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
            <div><strong>Engine:</strong> ${escapeHtml(inst.dbEngine || 'mysql')} ${escapeHtml(inst.dbEngineVersion || '')}</div>
            <div><strong>Spec / Size:</strong> ${escapeHtml(inst.dbInstanceSpec || 'default')} · ${escapeHtml(inst.storageSize || 32)}GB</div>
            <div><strong>VPC / VNet:</strong> <code>${escapeHtml(inst.vNetId || 'N/A')}</code></div>
            <div><strong>Access Mode:</strong> ${inst.publicAccess ? 'Public Access' : 'Private VPC'}</div>
          </div>
          ${inst.systemMessage ? `
            <div style="margin-top: 8px; font-family: monospace; font-size: 11px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 6px; border-radius: 4px; word-break: break-all;">
              <strong>Last Error:</strong> ${escapeHtml(inst.systemMessage)}
            </div>
          ` : ''}
        </div>

        <div style="margin-bottom: 12px;">
          <label style="font-weight: 600; display: block; margin-bottom: 4px;">DB Engine Version <small class="text-muted" style="font-weight: normal;">(Leave blank for CSP Auto-Default)</small></label>
          <input type="text" id="rdbmsRetryEngineVersionInput" class="rdbms-form-control" value="${escapeHtml(defaultEngineVer)}" placeholder="e.g. 8.0 or 8.4" style="width: 100%;">
        </div>

        <div style="margin-bottom: 12px;">
          <label style="font-weight: 600; display: block; margin-bottom: 4px;">Admin Username</label>
          <input type="text" id="rdbmsRetryAdminUserInput" class="rdbms-form-control" value="${escapeHtml(defaultUser)}" style="width: 100%;">
        </div>

        <div style="margin-bottom: 12px;">
          <label style="font-weight: 600; display: block; margin-bottom: 4px;">Admin Password</label>
          <div style="position: relative;">
            <input type="password" id="rdbmsRetryAdminPassInput" class="rdbms-form-control" value="${escapeHtml(defaultPass)}" style="width: 100%; padding-right: 64px;">
            <button type="button" id="rdbmsRetryTogglePassBtn" style="position: absolute; right: 32px; top: 8px; background: none; border: none; color: #64748b; cursor: pointer;" title="Show/Hide Password">
              <i class="fas fa-eye"></i>
            </button>
            <button type="button" id="rdbmsRetryCopyPassBtn" style="position: absolute; right: 8px; top: 8px; background: none; border: none; color: #64748b; cursor: pointer;" title="Copy Password">
              <i class="far fa-copy"></i>
            </button>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 5px; flex-wrap: wrap; gap: 4px;">
            <small class="text-muted" style="font-size: 11px;">
              Auto-adapted for ${escapeHtml(prov.toUpperCase())}: <code id="rdbmsRetryAdaptedCode">${escapeHtml(compliantPass)}</code>
            </small>
            <button type="button" id="rdbmsRetryCopyAdaptedBtn" class="btn btn-sm btn-link p-0" style="font-size: 11px; text-decoration: none; color: #0284c7; display: inline-flex; align-items: center; gap: 4px;" title="Copy Adapted Password">
              <i class="far fa-copy"></i> Copy Adapted
            </button>
          </div>
        </div>

        <div style="font-size: 11.5px; color: #64748b; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px; border-radius: 4px;">
          <i class="fas fa-info-circle" style="color: #0284c7;"></i> The failed record in Tumblebug will be safely purged, and a fresh provisioning job will start in the background.
        </div>
      </div>
    `,
    confirmText: 'Retry Provisioning Now',
    confirmButtonClass: 'rdbms-btn-primary',
    cancelText: 'Cancel',
    didOpen: (content) => {
      const toggleBtn = content.querySelector('#rdbmsRetryTogglePassBtn');
      const passInput = content.querySelector('#rdbmsRetryAdminPassInput');
      const copyBtn = content.querySelector('#rdbmsRetryCopyPassBtn');
      const copyAdaptedBtn = content.querySelector('#rdbmsRetryCopyAdaptedBtn');
      const adaptedCode = content.querySelector('#rdbmsRetryAdaptedCode');

      if (toggleBtn && passInput) {
        toggleBtn.onclick = () => {
          const isPass = passInput.type === 'password';
          passInput.type = isPass ? 'text' : 'password';
          toggleBtn.innerHTML = isPass ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
        };
      }
      if (passInput && adaptedCode) {
        passInput.oninput = () => {
          const adapted = getCspCompliantAdminPassword(prov, passInput.value.trim() || 'Admin1234!');
          adaptedCode.textContent = adapted;
        };
      }
      if (copyBtn && passInput) {
        copyBtn.onclick = () => {
          if (passInput.value) {
            navigator.clipboard.writeText(passInput.value);
            copyBtn.innerHTML = '<i class="fas fa-check" style="color: #16a34a;"></i>';
            setTimeout(() => { copyBtn.innerHTML = '<i class="far fa-copy"></i>'; }, 1500);
          }
        };
      }
      if (copyAdaptedBtn && adaptedCode) {
        copyAdaptedBtn.onclick = () => {
          if (adaptedCode.textContent) {
            navigator.clipboard.writeText(adaptedCode.textContent);
            copyAdaptedBtn.innerHTML = '<i class="fas fa-check" style="color: #16a34a;"></i> Copied!';
            setTimeout(() => { copyAdaptedBtn.innerHTML = '<i class="far fa-copy"></i> Copy Adapted'; }, 1500);
          }
        };
      }
    },
  });

  if (!res || !res.isConfirmed) return;

  const rawUser = (document.getElementById('rdbmsRetryAdminUserInput')?.value || '').trim() || defaultUser;
  const rawPass = (document.getElementById('rdbmsRetryAdminPassInput')?.value || '').trim() || defaultPass;
  const customEngineVer = (document.getElementById('rdbmsRetryEngineVersionInput')?.value || '').trim();
  const effectiveUser = getCspCompliantAdminUser(prov, rawUser);
  const effectivePass = getCspCompliantAdminPassword(prov, rawPass);

  saveRdbmsSessionCredentials(effectiveUser, effectivePass, inst.id || inst.name);

  // Launch Background Operation
  const op = {
    id: `op-retry-single-${Date.now()}`,
    type: 'deploy-bastion-set',
    title: `Retry Provisioning: ${inst.name || inst.id} (${prov.toUpperCase()})`,
    baseName: inst.name || inst.id,
    startTime: Date.now(),
    endTime: null,
    status: 'running',
    steps: [
      { name: '1. Purging Failed Record', status: 'running', descHtml: `Purging failed record <code>${escapeHtml(inst.id)}</code> in Tumblebug...` },
      { name: '2. Provisioning RDBMS', status: 'pending', descHtml: `Sending create request to ${escapeHtml(prov.toUpperCase())}...` },
    ],
    summaryHtml: null,
    summaryText: '',
    dismissed: false,
  };

  rdbmsActiveOperations.unshift(op);
  renderActiveOperationsPanelIfOpen();
  showModalNotice(`Started re-provisioning for ${inst.name || inst.id} in background.`, 'info');

  const config = getConfig();
  const spinId = addSpinnerTask(`Retry DB: ${inst.name || inst.id}`);

  try {
    // Step 1: Delete failed record in Tumblebug
    try {
      await axios.delete(`${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/${encodeURIComponent(inst.id)}?force=true`, {
        auth: { username: config.username, password: config.password },
      });
      op.steps[0].status = 'success';
      op.steps[0].descHtml = `Successfully purged failed record <code>${escapeHtml(inst.id)}</code>`;
    } catch (delErr) {
      console.warn('Purge failed record error (continuing if 404):', delErr);
      op.steps[0].status = 'success';
      op.steps[0].descHtml = `Record purged or already gone.`;
    }

    op.steps[1].status = 'running';
    op.steps[1].descHtml = `<span class="rdbms-spinner rdbms-spinner-sm" style="margin-right: 4px;"></span> Creating <code>${escapeHtml(inst.name || inst.id)}</code> on ${escapeHtml(prov.toUpperCase())} (Provisioning takes ~5-15 mins)...`;
    renderActiveOperationsPanelIfOpen();

    // Step 2: Create RDBMS request
    const createReq = {
      name: inst.name || inst.id,
      connectionName: inst.connectionName,
      vNetId: inst.vNetId,
      subnetIds: Array.isArray(inst.subnetIds) && inst.subnetIds.length > 0 ? inst.subnetIds : undefined,
      securityGroupIds: Array.isArray(inst.securityGroupIds) && inst.securityGroupIds.length > 0 ? inst.securityGroupIds : undefined,
      dbEngine: inst.dbEngine || 'mysql',
      dbEngineVersion: customEngineVer || undefined,
      dbInstanceSpec: inst.dbInstanceSpec || '',
      storageSize: inst.storageSize ? parseInt(inst.storageSize, 10) : 0,
      highAvailability: !!inst.highAvailability,
      publicAccess: !!inst.publicAccess,
      nhnDBSGToAllowAllInbound: (prov === 'nhn'),
      ncpDBACGToAllowAllInbound: (prov === 'ncp'),
      adminUserName: effectiveUser,
      adminUserPassword: effectivePass,
      autoFillDefaults: true,
    };

    const res = await axios.post(`${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms`, createReq, {
      auth: { username: config.username, password: config.password },
      headers: { 'Content-Type': 'application/json' },
      timeout: 1800000, // 30 mins
    });

    op.status = 'success';
    op.endTime = Date.now();
    op.steps[1].status = 'success';
    op.steps[1].descHtml = `Created <code>${escapeHtml(inst.name || inst.id)}</code> successfully! (Endpoint: <code>${escapeHtml(res.data?.endpoint || 'Pending')}</code>)`;
    op.summaryHtml = `🎉 RDBMS <strong>${escapeHtml(inst.name || inst.id)}</strong> (${escapeHtml(prov.toUpperCase())}) deployed successfully!`;
    op.summaryText = `🎉 RDBMS ${inst.name || inst.id} deployed successfully!`;

  } catch (err) {
    op.status = 'warning';
    op.endTime = Date.now();
    op.steps[1].status = 'danger';
    const errMsg = err.response?.data?.message || err.message;
    op.steps[1].descHtml = `<span style="color: #dc2626;">Failed: ${escapeHtml(errMsg)}</span>`;
    op.summaryHtml = `⚠️ Re-provisioning <strong>${escapeHtml(inst.name || inst.id)}</strong> failed: <div style="font-family: monospace; font-size: 11px; color: #dc2626; margin-top: 4px;">${escapeHtml(errMsg)}</div>`;
    op.summaryText = `⚠️ Re-provisioning ${inst.name || inst.id} failed.`;
  } finally {
    removeSpinnerTask(spinId);
    renderActiveOperationsPanelIfOpen();
    await refreshRdbmsInstancesSilently();
    notifyOperationComplete(op);
  }
}

async function handleDeleteInstance(id, name) {
  if (!id) return;
  const config = getConfig();

  // 1. Check for associated Bastion Infra in the namespace
  let associatedInfra = null;
  let nodeCount = 0;
  const lookupSpinId = addSpinnerTask('Checking associated resources');
  try {
    const infraRes = await axios.get(`${tbApiBase()}/ns/${rdbmsState.namespace}/infra`, {
      auth: { username: config.username, password: config.password },
    });
    const infraList = infraRes.data?.infra || [];
    const dbName = (name || '').toLowerCase();
    const dbId = (id || '').toLowerCase();
    associatedInfra = infraList.find(inf => {
      const infId = (inf.id || '').toLowerCase();
      return (
        infId === `infra-db-${dbName}` ||
        infId === `infra-db-${dbId}` ||
        (infId.startsWith('infra-db-') && (infId.includes(dbName) || infId.includes(dbId)))
      );
    });

    if (associatedInfra) {
      if (Array.isArray(associatedInfra.node)) nodeCount += associatedInfra.node.length;
      if (Array.isArray(associatedInfra.nodeList)) nodeCount += associatedInfra.nodeList.length;
      if (Array.isArray(associatedInfra.nodeGroup)) {
        for (const ng of associatedInfra.nodeGroup) {
          nodeCount += (ng.node || ng.nodes || ng.nodeList || []).length;
        }
      }
      if (nodeCount === 0 && Array.isArray(associatedInfra.nodeGroupList)) {
        for (const ng of associatedInfra.nodeGroupList) {
          nodeCount += (ng.node || ng.nodes || ng.nodeList || []).length;
        }
      }
    }
  } catch (e) {
    console.warn('Could not inspect infra for associated bastion', e);
  } finally {
    removeSpinnerTask(lookupSpinId);
  }

  // 2. Build confirmation dialog with cascading option if associated bastion exists
  let confirmHtml = '';
  if (associatedInfra) {
    const nodeDesc = nodeCount > 0 ? `${nodeCount} active VM node(s)` : 'Infra & VM resources';
    confirmHtml = `
      <div style="text-align: left; font-size: 13.5px; line-height: 1.5;">
        <div style="margin-bottom: 12px;">
          Are you sure you want to permanently delete RDBMS instance <strong>${escapeHtml(name)}</strong>?
          <div style="color: #dc2626; font-size: 12.5px; margin-top: 4px;">
            <i class="fas fa-exclamation-triangle"></i> This will terminate the managed database on the CSP. All databases and data will be permanently destroyed.
          </div>
        </div>

        <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-top: 14px;">
          <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; margin: 0; user-select: none;">
            <input type="checkbox" id="rdbmsDeleteBastionCheck" checked style="width: 17px; height: 17px; margin-top: 2px; accent-color: #dc2626; cursor: pointer;">
            <div>
              <div style="font-weight: 700; color: #0f172a; font-size: 13.5px;">
                <i class="fas fa-shield-alt" style="color: #0284c7;"></i> Also terminate & delete associated Bastion Infra
              </div>
              <div style="font-size: 12.5px; color: #334155; margin-top: 2px;">
                Target Infra: <code>${escapeHtml(associatedInfra.id)}</code> (${escapeHtml(nodeDesc)})
              </div>
              <div style="font-size: 11.5px; color: #64748b; margin-top: 3px;">
                Terminates bastion VM nodes and frees CSP compute, EBS, and public IPv4 hourly costs.
              </div>
            </div>
          </label>
        </div>
      </div>
    `;
  } else {
    confirmHtml = `
      Are you sure you want to permanently delete RDBMS instance <strong>${escapeHtml(name)}</strong>?<br>
      <span style="color: #dc2626; font-size: 13px;">This will terminate the managed database on the CSP. All databases and data will be destroyed.</span>
    `;
  }

  const ok = await showModalConfirm({
    title: 'Delete RDBMS Instance',
    html: confirmHtml,
    icon: 'danger',
    confirmText: 'Delete Permanently',
    confirmButtonClass: 'rdbms-btn-danger',
  });
  if (!ok) return;

  const shouldDeleteBastion = (typeof ok === 'object' && ok.deleteBastion) || Boolean(document.getElementById('rdbmsDeleteBastionCheck')?.checked);

  rdbmsState.currentInstance = null;
  rdbmsState.view = 'instances';

  const op = {
    id: `op-del-${Date.now()}`,
    type: 'delete-instance',
    title: shouldDeleteBastion ? `Cascading Termination: ${name} & Bastion` : `Terminating RDBMS: ${name}`,
    instanceId: id,
    instanceName: name,
    associatedInfraId: associatedInfra?.id || null,
    shouldDeleteBastion,
    startTime: Date.now(),
    endTime: null,
    status: 'running',
    steps: [
      {
        title: 'Step 1: Terminating Managed Database on CSP',
        desc: 'Sending deletion request to CSP and destroying database cluster/storage...',
        status: 'running',
        descHtml: '',
        detailsHtml: '',
      },
      ...(shouldDeleteBastion && associatedInfra ? [{
        title: 'Step 2: Terminating Bastion VM Infra & Releasing Network',
        desc: 'Waiting for database termination...',
        status: 'pending',
        descHtml: '',
        detailsHtml: '',
      }] : [])
    ],
    summaryHtml: null,
    summaryText: '',
    dismissed: false,
  };

  rdbmsActiveOperations.unshift(op);
  ensureOpsTimer();

  const container = document.getElementById('rdbmsModalContent');
  if (container) {
    await renderInstanceListView(container);
    showModalNotice(`🗑️ Deletion of "${name}" started in background. You can track live progress here or freely navigate other tabs.`, 'info', 7000);
  }

  runDeleteInstanceInBackground(op, id, name, shouldDeleteBastion, associatedInfra);
}

async function runDeleteInstanceInBackground(op, id, name, shouldDeleteBastion, associatedInfra) {
  const config = getConfig();
  const spinId = addSpinnerTask(`Delete RDBMS: ${name}${shouldDeleteBastion ? ' & Bastion' : ''}`);

  let rdbmsSuccess = false;
  let bastionSuccess = false;
  let rdbmsErrorMsg = '';
  let bastionErrorMsg = '';

  // --- STEP 1: Delete RDBMS Instance ---
  try {
    await axios.delete(`${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/${encodeURIComponent(id)}`, {
      auth: { username: config.username, password: config.password },
    });
    rdbmsSuccess = true;
    op.steps[0].status = 'success';
    op.steps[0].descHtml = `<span style="color: #16a34a; font-weight: 600;">✓ Database termination accepted by CSP. Cloud resources are de-provisioning.</span>`;
    renderActiveOperationsPanelIfOpen();
    refreshRdbmsInstancesSilently();
  } catch (err) {
    rdbmsErrorMsg = err.response?.data?.message || err.message;
    op.steps[0].status = 'error';
    op.steps[0].descHtml = `<span style="color: #dc2626; font-weight: 600;">✗ Deletion failed: ${escapeHtml(rdbmsErrorMsg)}</span>`;
    renderActiveOperationsPanelIfOpen();
  }

  // --- STEP 2: Cascading Delete Bastion Infra (if requested) ---
  if (shouldDeleteBastion && associatedInfra?.id) {
    if (op.steps[1]) {
      op.steps[1].status = 'running';
      op.steps[1].desc = 'Terminating Bastion VM node(s) and unbinding network interfaces (ENIs)...';
      renderActiveOperationsPanelIfOpen();
    }

    try {
      await axios.delete(`${tbApiBase()}/ns/${rdbmsState.namespace}/infra/${encodeURIComponent(associatedInfra.id)}?option=terminate`, {
        auth: { username: config.username, password: config.password },
        timeout: 1800000,
      });
      bastionSuccess = true;
      if (op.steps[1]) {
        op.steps[1].status = 'success';
        op.steps[1].descHtml = `<span style="color: #16a34a; font-weight: 600;">✓ Bastion VM nodes terminated and Infra deleted. Network interfaces freed.</span>`;
        renderActiveOperationsPanelIfOpen();
      }
    } catch (infraErr) {
      bastionErrorMsg = infraErr.response?.data?.message || infraErr.message;
      if (op.steps[1]) {
        op.steps[1].status = 'warning';
        op.steps[1].descHtml = `<span style="color: #d97706; font-weight: 600;">⚠️ Bastion termination encountered: ${escapeHtml(bastionErrorMsg)}</span>`;
        renderActiveOperationsPanelIfOpen();
      }
    }
  }

  // --- SUMMARY ---
  op.endTime = Date.now();
  if (rdbmsSuccess && (!shouldDeleteBastion || bastionSuccess)) {
    op.status = 'success';
    op.summaryHtml = `🎉 <strong>All resources removed:</strong> ${shouldDeleteBastion ? `RDBMS <code>${escapeHtml(name)}</code> and Bastion Infra <code>${escapeHtml(associatedInfra?.id || '')}</code> terminated successfully.` : `RDBMS <code>${escapeHtml(name)}</code> terminated successfully.`}`;
    op.summaryText = `🎉 RDBMS "${name}" ${shouldDeleteBastion ? 'and Bastion Infra' : ''} terminated successfully.`;
  } else if (rdbmsSuccess && shouldDeleteBastion && !bastionSuccess) {
    op.status = 'warning';
    op.summaryHtml = `⚠️ <strong>Partial Deletion:</strong> RDBMS <code>${escapeHtml(name)}</code> was terminated, but Bastion Infra returned: <code>${escapeHtml(bastionErrorMsg)}</code>.`;
    op.summaryText = `⚠️ RDBMS "${name}" terminated with Bastion Infra warning.`;
  } else {
    op.status = 'error';
    op.summaryHtml = `❌ <strong>Deletion failed:</strong> ${escapeHtml(rdbmsErrorMsg)}`;
    op.summaryText = `❌ Deletion of RDBMS "${name}" failed: ${rdbmsErrorMsg}`;
  }

  renderActiveOperationsPanelIfOpen();
  await refreshRdbmsInstancesSilently();
  notifyOperationComplete(op);
  removeSpinnerTask(spinId);
}

function populateCreateFormConnections() {
  const sel = document.getElementById('rdbmsConnSelect');
  if (!sel) return;
  const p = rdbmsState.selectedProvider;

  const conns = (rdbmsState.connections || []).filter(c => {
    if (!p || p === 'all') return true;
    const prov = (c.providerName || '').toLowerCase();
    return prov === p;
  });

  sel.innerHTML = '<option value="">-- Select Connection --</option>' +
    conns.map(c => `<option value="${escapeHtml(c.configName)}">${escapeHtml(c.configName)} (${escapeHtml(c.regionDetail?.regionName || c.regionName)})</option>`).join('');

  if (conns.length > 0) {
    sel.value = conns[0].configName;
    populateVNetOptions(conns[0].configName);
  }
}

function populateVNetOptions(connName) {
  const vNetSel = document.getElementById('rdbmsVNetSelect');
  if (!vNetSel) return;

  const centralVnets = window.cloudBaristaCentralData?.vNet || [];
  const filtered = centralVnets.filter(v => {
    const c = v.connectionName || v.connectionConfig?.configName;
    return !connName || c === connName;
  });

  vNetSel.innerHTML = '<option value="">-- Select VNet --</option>' +
    filtered.map(v => `<option value="${escapeHtml(v.id || v.name)}">${escapeHtml(v.name || v.id)}</option>`).join('');

  if (filtered.length > 0) {
    vNetSel.value = filtered[0].id || filtered[0].name;
    populateSubnetAndSgOptions(vNetSel.value);
  }
}

function populateSubnetAndSgOptions(vNetId) {
  const subSel = document.getElementById('rdbmsSubnetSelect');
  const sgSel = document.getElementById('rdbmsSgSelect');
  if (!subSel || !sgSel) return;

  const centralVnets = window.cloudBaristaCentralData?.vNet || [];
  const vNet = centralVnets.find(v => (v.id === vNetId || v.name === vNetId));

  const subnets = vNet?.subnetInfoList || vNet?.subnetList || [];
  subSel.innerHTML = '<option value="">-- Select Subnet (or leave empty) --</option>' +
    subnets.map(s => `<option value="${escapeHtml(s.id || s.name)}">${escapeHtml(s.name || s.id)} (${escapeHtml(s.ipv4_CIDR || s.zone || '')})</option>`).join('');

  const centralSgs = window.cloudBaristaCentralData?.securityGroup || [];
  const connName = document.getElementById('rdbmsConnSelect')?.value;
  const filteredSgs = centralSgs.filter(sg => {
    const c = sg.connectionName || sg.connectionConfig?.configName;
    return !connName || c === connName;
  });

  sgSel.innerHTML = '<option value="">-- Select Security Group (optional) --</option>' +
    filteredSgs.map(sg => `<option value="${escapeHtml(sg.id || sg.name)}">${escapeHtml(sg.name || sg.id)}</option>`).join('');
}

function buildCreateRequestObject() {
  const name = document.getElementById('rdbmsNameInput')?.value?.trim();
  const conn = document.getElementById('rdbmsConnSelect')?.value;
  const engine = document.getElementById('rdbmsEngineSelect')?.value || 'mysql';
  const vNet = document.getElementById('rdbmsVNetSelect')?.value;
  const adminUser = document.getElementById('rdbmsAdminUserInput')?.value?.trim();
  const adminPass = document.getElementById('rdbmsAdminPassInput')?.value;
  const autoFill = document.getElementById('rdbmsAutoFillDefaults')?.checked ?? true;

  if (!name || !conn || !vNet || !adminUser || !adminPass) {
    showModalNotice('Please fill in all required fields (Name, Connection, VNet, Admin Username, Password).', 'warning');
    return null;
  }
  if (!/^[a-zA-Z0-9-]+$/.test(name)) {
    showModalNotice('Instance name may only contain alphanumeric characters and hyphens.', 'warning');
    return null;
  }
  const selectedConn = (window.cloudBaristaCentralData?.connConfig || []).find(c => (c.configName || c.name) === conn);
  const targetCsp = (selectedConn?.providerName || conn.split('-')[0] || '').toLowerCase();
  const effectiveUser = getCspCompliantAdminUser(targetCsp, adminUser);
  const effectivePass = getCspCompliantAdminPassword(targetCsp, adminPass);

  const passErr = validateAdminPasswordForCsps(adminPass, [targetCsp]);
  if (passErr) {
    showModalNotice(passErr, 'warning');
    return null;
  }

  const req = {
    name,
    connectionName: conn,
    vNetId: vNet,
    dbEngine: engine,
    adminUserName: effectiveUser,
    adminUserPassword: effectivePass,
    autoFillDefaults: autoFill,
    highAvailability: document.getElementById('rdbmsHaCheck')?.checked || false,
    publicAccess: document.getElementById('rdbmsPublicAccessCheck')?.checked || false,
    deletionProtection: document.getElementById('rdbmsDelProtectCheck')?.checked || false,
  };

  const subnet = document.getElementById('rdbmsSubnetSelect')?.value;
  if (subnet) req.subnetIds = [subnet];

  const sg = document.getElementById('rdbmsSgSelect')?.value;
  if (sg) req.securityGroupIds = [sg];

  if (!autoFill) {
    const v = document.getElementById('rdbmsEngineVersionInput')?.value?.trim();
    if (v) req.dbEngineVersion = v;
    const spec = document.getElementById('rdbmsSpecInput')?.value?.trim();
    if (spec) req.dbInstanceSpec = spec;
    const st = document.getElementById('rdbmsStorageTypeInput')?.value?.trim();
    if (st) req.storageType = st;
    const size = parseInt(document.getElementById('rdbmsStorageSizeInput')?.value, 10);
    if (!isNaN(size) && size > 0) req.storageSize = size;
  }

  // Provider specific testing flags
  const prov = targetCsp || (rdbmsState.selectedProvider || '').toLowerCase();
  if (prov === 'ibm' || prov === 'gcp') {
    req.publicAccess = true;
  }
  if (prov === 'nhn') {
    req.nhnDBSGToAllowAllInbound = true;
  }
  if (prov === 'ncp') {
    req.ncpDBACGToAllowAllInbound = true;
    req.publicAccess = false;
  }

  return req;
}

// --- In-VPC Bastion Direct SQL Execution Helper (for AWS, IBM & Private VPC Mode) ---
async function executeBastionDbQuery(inst, bastionNode, user, pass, sqlParam, timeoutMinutes = 2) {
  const host = (inst.endpoint || '').split(':')[0];
  const port = (inst.endpoint || '').split(':')[1] || '3306';
  const safePass = (pass || '').replace(/'/g, "'\\''");
  const clientCheck = 'which mysql >/dev/null 2>&1 || which mariadb >/dev/null 2>&1 || (sudo apt-get update -y >/dev/null 2>&1 && (sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-client >/dev/null 2>&1 || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-client >/dev/null 2>&1) || (sudo yum install -y mariadb >/dev/null 2>&1)) || true; ';
  const clientBin = '$(which mysql 2>/dev/null || which mariadb 2>/dev/null || echo mysql)';
  const cmd = `${clientCheck}${clientBin} --defaults-extra-file=<(printf "[client]\\npassword=%s\\n" '${safePass}') -h ${host} -P ${port} -u ${user} ${sqlParam}`;

  const config = getConfig();
  const cmdUrl = `${tbApiBase()}/ns/${rdbmsState.namespace}/cmd/infra/${encodeURIComponent(bastionNode.infraId)}?nodeId=${encodeURIComponent(bastionNode.nodeId)}`;
  const cmdRes = await axios.post(cmdUrl, {
    command: [cmd],
    timeoutMinutes,
  }, {
    auth: { username: config.username, password: config.password },
  });

  const resData = cmdRes.data?.results?.[0] || cmdRes.data?.result?.[0] || {};
  const stdout = typeof resData.stdout === 'object' ? Object.values(resData.stdout).join('\n') : (resData.stdout || '');
  const stderr = typeof resData.stderr === 'object' ? Object.values(resData.stderr).join('\n') : (resData.stderr || '');
  const error = resData.error || '';
  const combined = (stdout + (stdout && stderr ? '\n' : '') + stderr).trim();

  if (error) {
    throw new Error(error);
  }
  if (combined.toLowerCase().includes('access denied for user')) {
    throw new Error('Access denied: Incorrect master username or password.');
  }
  if (combined.toLowerCase().includes("can't connect to mysql server") ||
      combined.toLowerCase().includes('connection refused') ||
      combined.toLowerCase().includes('operation timed out')) {
    throw new Error(combined.split('\n')[0]);
  }
  if (stderr && stderr.toLowerCase().includes('error') && !stdout) {
    throw new Error(stderr.split('\n')[0]);
  }

  return { stdout, stderr, combined };
}

// --- View 2: RDBMS Instance Detail View (Logical DBs & TLS) ---
async function renderInstanceDetailView(container) {
  let inst = rdbmsState.currentInstance;
  if (!inst) {
    rdbmsState.view = 'instances';
    await renderModalView();
    return;
  }

  // Ensure full instance details if opened directly by ID
  if (!inst.endpoint && !inst.connectionName && inst.id) {
    const config = getConfig();
    try {
      const res = await axios.get(`${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/${encodeURIComponent(inst.id)}`, {
        auth: { username: config.username, password: config.password },
      });
      if (res.data) {
        inst = res.data;
        rdbmsState.currentInstance = inst;
      }
    } catch (e) {
      console.warn('Failed to load instance details for', inst.id, e);
    }
  }

  const prov = (inst.connectionConfig?.providerName || inst.connectionName?.split('-')[0] || 'other').toLowerCase();
  const isAwsOrIbm = prov === 'aws' || prov === 'ibm';

  let bastionMatch = null;
  if (isAwsOrIbm || !inst.publicAccess) {
    const { allNodes } = await getNamespaceBastionNodes();
    bastionMatch = findBestBastionNodeForInstance(inst, allNodes);
  }
  rdbmsState.currentBastionNode = bastionMatch?.node || null;
  rdbmsState.currentBastionLabel = bastionMatch?.label || null;

  let bastionInfoBanner = '';
  if (isAwsOrIbm) {
    if (bastionMatch?.node) {
      bastionInfoBanner = `
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; font-size: 13px; color: #1e40af; line-height: 1.5;">
          <div style="font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
            <i class="fas fa-terminal" style="color: #2563eb;"></i>
            <span>${prov.toUpperCase()} In-VPC SQL Bastion Proxy Active</span>
            <span class="rdbms-badge rdbms-badge-info" style="font-size: 11px;">Bastion: ${escapeHtml(bastionMatch.node.nodeId)} (${escapeHtml(bastionMatch.label)})</span>
          </div>
          <div style="font-size: 12.5px;">
            ℹ️ <strong>Notice:</strong> ${prov.toUpperCase()} does not provide cloud control-plane APIs for database CRUD in private VPC mode.
            MapUI transparently queries and manages logical databases via in-VPC Bastion node <strong><code>${escapeHtml(bastionMatch.node.nodeId)}</code></strong> using direct SQL commands.
          </div>
        </div>
      `;
    } else {
      bastionInfoBanner = `
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; font-size: 13px; color: #92400e; line-height: 1.5;">
          <div style="font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
            <i class="fas fa-exclamation-triangle" style="color: #d97706;"></i>
            <span>${prov.toUpperCase()} In-VPC Bastion Node Needed</span>
          </div>
          <div style="font-size: 12.5px;">
            ⚠️ ${prov.toUpperCase()} does not provide cloud control-plane APIs for database CRUD. In private VPC mode, a running In-VPC Bastion VM node is required to manage databases via SQL.
          </div>
        </div>
      `;
    }
  }

  const savedUser = getSavedRdbmsUser(inst.id);
  const savedPass = getSavedRdbmsPassword(inst.id);
  const effectiveUser = inst.adminUserName || inst.masterUserName || getCspCompliantAdminUser(prov, savedUser || rdbmsState.adminUser || 'dbadmin');
  const effectivePass = getCspCompliantAdminPassword(prov, savedPass || rdbmsState.adminPassword);
  const meta = getProviderMeta(prov);
  const status = inst.status || 'Unknown';
  let statusBadge = 'rdbms-badge-secondary';
  if (status.toLowerCase() === 'available') statusBadge = 'rdbms-badge-success';
  else if (status.toLowerCase().includes('creating') || status.toLowerCase().includes('handling')) statusBadge = 'rdbms-badge-warning';
  else if (status.toLowerCase().includes('fail') || status.toLowerCase().includes('error')) statusBadge = 'rdbms-badge-danger';

  container.innerHTML = `
    <!-- Detail Navigation Header -->
    <div class="rdbms-header-bar">
      <div class="rdbms-header-title">
        <button type="button" class="rdbms-btn rdbms-btn-secondary" id="rdbmsBackToInstancesBtn" style="padding: 4px 10px;">
          <i class="fas fa-arrow-left"></i> Back
        </button>
        <span>🗄️ ${escapeHtml(inst.name || inst.id)}</span>
        <span class="rdbms-badge ${statusBadge}">${escapeHtml(status)}</span>
      </div>
      <div style="display: flex; gap: 8px;">
        <button type="button" class="rdbms-btn rdbms-btn-secondary" id="rdbmsDetailClearCredsBtn" title="Purge saved DB passwords from browser storage" style="color: #dc2626;">
          <i class="fas fa-trash-alt"></i> Clear Passwords
        </button>
        <button type="button" class="rdbms-btn rdbms-btn-secondary" id="rdbmsDetailRefreshBtn">
          <i class="fas fa-sync-alt"></i> Refresh
        </button>
        <button type="button" class="rdbms-btn rdbms-btn-danger" id="rdbmsDetailDeleteBtn">
          <i class="fas fa-trash-alt"></i> Delete
        </button>
      </div>
    </div>

    <!-- Instance Overview Card -->
    <div class="rdbms-card">
      <h6><i class="fas fa-info-circle text-primary"></i> Instance Overview</h6>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; font-size: 13.5px;">
        <div><strong>Provider:</strong> <img src="${meta.icon}" class="rdbms-csp-logo" style="vertical-align:middle;margin-right:4px;" onerror="this.src='/img/circle.png';"> ${escapeHtml(meta.name)}</div>
        <div><strong>Connection:</strong> <code>${escapeHtml(inst.connectionName || '')}</code></div>
        <div><strong>Engine:</strong> <span class="rdbms-badge rdbms-badge-info">${escapeHtml(inst.dbEngine || 'mysql')} ${escapeHtml(inst.dbEngineVersion || '')}</span></div>
        <div><strong>Instance Spec:</strong> <code>${escapeHtml(inst.dbInstanceSpec || 'default')}</code></div>
        <div><strong>Storage:</strong> ${escapeHtml(inst.storageSize ? `${inst.storageSize} GB (${inst.storageType || 'default'})` : 'Auto')}</div>
        <div><strong>Endpoint:</strong> <code>${escapeHtml(inst.endpoint || 'Pending')}</code></div>
        <div><strong>VNet ID:</strong> ${escapeHtml(inst.vNetId || 'N/A')}</div>
        <div><strong>Public Access:</strong> ${inst.publicAccess ? '✅ Enabled' : '🔒 Disabled (VPC Private)'}</div>
        <div><strong>High Availability:</strong> ${inst.highAvailability ? '✅ Enabled' : 'Disabled'}</div>
        <div><strong>Deletion Protection:</strong> ${inst.deletionProtection ? '🛡️ Enabled' : 'Disabled'}</div>
      </div>
    </div>

    <!-- Logical Databases Management Card -->
    <div class="rdbms-card">
      <h6>
        <span><i class="fas fa-database text-primary"></i> Logical Databases (Internal DB CRUD)</span>
      </h6>
      ${bastionInfoBanner}
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 14px; font-size: 13px;">
        🔒 <strong>Zero-Credential Policy:</strong> CB-Tumblebug never persists your database master password.
        To query, create, or drop logical databases, enter your admin credentials below (active for this modal session only).
      </div>

      <!-- Admin Login Fields -->
      <div class="rdbms-form-row" style="align-items: flex-end;">
        <div class="rdbms-form-col">
          <label for="rdbmsDbAdminUser" style="display: flex; justify-content: space-between; align-items: center;">
            <span>Admin Username</span>
            <span style="font-size: 11px; color: #0284c7; font-weight: normal;"><i class="fas fa-magic"></i> Auto: <code>${escapeHtml(effectiveUser)}</code></span>
          </label>
          <input type="text" class="rdbms-form-control" id="rdbmsDbAdminUser" value="${escapeHtml(effectiveUser)}" placeholder="e.g. root or admin">
        </div>
        <div class="rdbms-form-col">
          <label for="rdbmsDbAdminPass">Admin Password</label>
          <div style="position: relative;">
            <input type="password" class="rdbms-form-control" id="rdbmsDbAdminPass" value="${escapeHtml(effectivePass)}" placeholder="Master password" style="padding-right: 64px;">
            <button type="button" id="rdbmsDbAdminPassToggleBtn" style="position: absolute; right: 32px; top: 8px; background: none; border: none; color: #64748b; cursor: pointer;" title="Show/Hide Password">
              <i class="fas fa-eye"></i>
            </button>
            <button type="button" id="rdbmsDbAdminPassCopyBtn" style="position: absolute; right: 8px; top: 8px; background: none; border: none; color: #64748b; cursor: pointer;" title="Copy Password">
              <i class="far fa-copy"></i>
            </button>
          </div>
        </div>
        <div>
          <button type="button" class="rdbms-btn rdbms-btn-primary" id="rdbmsLoadDatabasesBtn" style="height: 38px;">
            <i class="fas fa-sign-in-alt"></i> Connect & Load DBs
          </button>
        </div>
      </div>
      ${renderRememberPasswordCheckboxHtml('margin-top: 6px; margin-bottom: 12px;')}

      <!-- Create New Database Bar -->
      <div id="rdbmsCreateDbSection" style="margin-top: 14px; padding-top: 14px; border-top: 1px solid #e2e8f0;">
        <div style="display: flex; gap: 10px; max-width: 500px;">
          <input type="text" class="rdbms-form-control" id="rdbmsNewDbNameInput" placeholder="New database name (e.g. app_db)">
          <button type="button" class="rdbms-btn rdbms-btn-success" id="rdbmsCreateDbBtn" style="white-space: nowrap;">
            <i class="fas fa-plus"></i> Create Database
          </button>
        </div>
      </div>

      <!-- Databases Table -->
      <div class="rdbms-table-container" style="margin-top: 14px;">
        <table class="rdbms-table">
          <thead>
            <tr>
              <th>Database Name</th>
              <th style="text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody id="rdbmsDatabaseTableBody">
            ${renderDatabaseRows()}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Secure Transport (TLS & CA Certificate) Card -->
    <div class="rdbms-card">
      <h6>
        <span><i class="fas fa-shield-alt text-primary"></i> Secure Transport (TLS) & Server CA Certificate</span>
        <button type="button" class="rdbms-btn rdbms-btn-secondary" id="rdbmsProbeTlsBtn" style="font-size: 12px; padding: 4px 10px;">
          <i class="fas fa-search"></i> Inspect TLS & Cert
        </button>
      </h6>
      <div id="rdbmsTlsContainer">
        <div class="text-muted" style="font-size: 13px;">
          Inspect TLS encryption enforcement, active cipher suite, and download server CA certificate (.pem).
        </div>
      </div>
    </div>

    <!-- Direct SQL Connection & Testing Snippets Card -->
    <div class="rdbms-card">
      <h6>
        <span><i class="fas fa-terminal text-primary"></i> Direct SQL Connection & Testing Snippets</span>
      </h6>
      <div style="font-size: 13px; color: #475569; margin-bottom: 12px; line-height: 1.6;">
        Connect to your database from external client tools (DBeaver, MySQL Workbench) or from compute VMs within the same VPC.
      </div>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div style="background: #0f172a; color: #e2e8f0; padding: 12px 14px; border-radius: 6px; font-family: monospace; font-size: 12.5px; position: relative;">
          <div style="color: #94a3b8; font-size: 11px; margin-bottom: 4px;"># MySQL CLI Connection (Local PC or VPC VM)</div>
          <code>mysql -h ${escapeHtml((inst.endpoint || '').split(':')[0] || 'hostname')} -P ${escapeHtml((inst.endpoint || '').split(':')[1] || '3306')} -u ${escapeHtml(effectiveUser)} -p</code>
          <button type="button" class="btn btn-sm btn-link p-0 text-info copy-btn" data-copy="mysql -h ${(inst.endpoint || '').split(':')[0] || 'hostname'} -P ${(inst.endpoint || '').split(':')[1] || '3306'} -u ${effectiveUser} -p" title="Copy CLI Command" style="position: absolute; right: 10px; top: 10px;">
            <i class="far fa-copy"></i>
          </button>
        </div>
        <div style="background: #0f172a; color: #e2e8f0; padding: 12px 14px; border-radius: 6px; font-family: monospace; font-size: 12.5px; position: relative;">
          <div style="color: #94a3b8; font-size: 11px; margin-bottom: 4px;"># Quick Test SQL (Create Table + Insert + Query)</div>
          <code>mysql -h ${escapeHtml((inst.endpoint || '').split(':')[0] || 'hostname')} -P ${escapeHtml((inst.endpoint || '').split(':')[1] || '3306')} -u ${escapeHtml(effectiveUser)} -p -e "CREATE DATABASE IF NOT EXISTS testdb; USE testdb; CREATE TABLE IF NOT EXISTS notes (id INT AUTO_INCREMENT PRIMARY KEY, msg VARCHAR(100)); INSERT INTO notes (msg) VALUES ('Hello from Cloud-Barista!'); SELECT * FROM notes;"</code>
          <button type="button" class="btn btn-sm btn-link p-0 text-info copy-btn" data-copy="mysql -h ${(inst.endpoint || '').split(':')[0] || 'hostname'} -P ${(inst.endpoint || '').split(':')[1] || '3306'} -u ${effectiveUser} -p -e &quot;CREATE DATABASE IF NOT EXISTS testdb; USE testdb; CREATE TABLE IF NOT EXISTS notes (id INT AUTO_INCREMENT PRIMARY KEY, msg VARCHAR(100)); INSERT INTO notes (msg) VALUES ('Hello from Cloud-Barista!'); SELECT * FROM notes;&quot;" title="Copy Test Query" style="position: absolute; right: 10px; top: 10px;">
            <i class="far fa-copy"></i>
          </button>
        </div>
      </div>
      <div style="margin-top: 10px; font-size: 12px; color: #64748b;">
        💡 <strong>Tip for VPC Private DB (NCP, NHN, etc.):</strong> Use MapUI's <strong>Remote Command</strong> modal to execute the above test command on any VM within the same VPC.
      </div>
    </div>

    <!-- In-VPC Bastion Remote Testing Card -->
    <div class="rdbms-card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <h6 style="margin: 0;"><i class="fas fa-satellite-dish text-primary"></i> In-VPC Bastion Remote Testing</h6>
        <button type="button" class="rdbms-btn rdbms-btn-primary" id="rdbmsDetailTestBastionBtn">
          <i class="fas fa-terminal"></i> Launch Bastion Remote Test
        </button>
      </div>
      <div style="font-size: 13px; color: #475569; line-height: 1.6;">
        If this database is provisioned inside a private VPC, run real-time connectivity probes (TCP Ping, MySQL Client Status, Query Execution) from the accompanying Bastion node via SSH Remote Command (SSE streaming).
      </div>
    </div>
  `;

  attachInstanceDetailEvents();
}

function renderDatabaseRows() {
  const dbs = rdbmsState.databases || [];
  if (dbs.length === 0) {
    return `
      <tr>
        <td colspan="2" style="text-align: center; padding: 20px; color: #64748b;">
          Enter master credentials above and click "Connect & Load DBs" to view and manage databases.
        </td>
      </tr>
    `;
  }

  const systemDbs = ['information_schema', 'mysql', 'performance_schema', 'sys', 'rdsadmin', 'ibm_admin', 'innodb'];

  return dbs.map(dbName => {
    const isSys = systemDbs.includes(dbName.toLowerCase());
    return `
      <tr>
        <td>
          <i class="fas fa-database text-muted" style="margin-right: 6px;"></i>
          <strong>${escapeHtml(dbName)}</strong>
          ${isSys ? '<span class="rdbms-badge rdbms-badge-secondary" style="font-size: 11px; margin-left: 6px;">System</span>' : ''}
        </td>
        <td style="text-align: right;">
          ${!isSys ? `
            <button type="button" class="rdbms-btn rdbms-btn-danger btn-drop-database" data-dbname="${escapeHtml(dbName)}" style="padding: 3px 8px; font-size: 12px;">
              <i class="fas fa-trash-alt"></i> Drop
            </button>
          ` : '<span class="text-muted" style="font-size: 12px;">Protected</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

function attachInstanceDetailEvents() {
  // Clear Passwords Button
  const detailClearCredsBtn = document.getElementById('rdbmsDetailClearCredsBtn');
  if (detailClearCredsBtn) {
    detailClearCredsBtn.onclick = async () => {
      const ok = await showModalConfirm({
        title: 'Clear Stored DB Passwords',
        html: `Are you sure you want to clear all stored database passwords from this browser?<br><br><span style="font-size: 12px; color: #64748b;">(Usernames and configurations will be preserved, but passwords will be removed from <code>localStorage</code> and memory)</span>`,
        icon: 'warning',
        confirmText: 'Clear Passwords',
        confirmButtonClass: 'rdbms-btn-danger',
      });
      if (ok) {
        clearAllSavedRdbmsPasswords(true);
      }
    };
  }

  // Attach Remember Password checkbox listeners across the detail view
  attachRememberPassCheckboxListeners(document.getElementById('rdbmsModalContent') || document);

  // Back to instances button
  const backBtn = document.getElementById('rdbmsBackToInstancesBtn');
  if (backBtn) {
    backBtn.onclick = async () => {
      rdbmsState.view = 'instances';
      await renderModalView();
    };
  }

  // Refresh Detail button
  const refBtn = document.getElementById('rdbmsDetailRefreshBtn');
  if (refBtn) {
    refBtn.onclick = async () => {
      const config = getConfig();
      try {
        const res = await axios.get(`${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/${rdbmsState.currentInstance.id}`, {
          auth: { username: config.username, password: config.password },
        });
        rdbmsState.currentInstance = res.data;
        await renderModalView();
      } catch (e) {
        showModalNotice('Failed refreshing instance details', 'error');
      }
    };
  }

  // Delete Detail button
  const delBtn = document.getElementById('rdbmsDetailDeleteBtn');
  if (delBtn) {
    delBtn.onclick = async () => {
      const inst = rdbmsState.currentInstance;
      if (inst) {
        await handleDeleteInstance(inst.id, inst.name || inst.id);
      }
    };
  }

  // Launch Bastion Test button
  const detailTestBastionBtn = document.getElementById('rdbmsDetailTestBastionBtn');
  if (detailTestBastionBtn) {
    detailTestBastionBtn.onclick = async () => {
      await showTestBastionModal(rdbmsState.currentInstance?.id);
    };
  }

  // Admin Credential fields auto-save
  const detailUserEl = document.getElementById('rdbmsDbAdminUser');
  const detailPassEl = document.getElementById('rdbmsDbAdminPass');
  if (detailUserEl) {
    detailUserEl.oninput = () => saveRdbmsSessionCredentials(detailUserEl.value, null, rdbmsState.currentInstance?.id);
  }
  if (detailPassEl) {
    detailPassEl.oninput = () => saveRdbmsSessionCredentials(null, detailPassEl.value, rdbmsState.currentInstance?.id);
  }
  const detailPassToggleBtn = document.getElementById('rdbmsDbAdminPassToggleBtn');
  if (detailPassToggleBtn && detailPassEl) {
    detailPassToggleBtn.onclick = () => {
      const isPass = detailPassEl.type === 'password';
      detailPassEl.type = isPass ? 'text' : 'password';
      detailPassToggleBtn.innerHTML = isPass ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
    };
  }
  const detailPassCopyBtn = document.getElementById('rdbmsDbAdminPassCopyBtn');
  if (detailPassCopyBtn && detailPassEl) {
    detailPassCopyBtn.onclick = () => {
      if (detailPassEl.value) {
        navigator.clipboard.writeText(detailPassEl.value);
        detailPassCopyBtn.innerHTML = '<i class="fas fa-check" style="color: #16a34a;"></i>';
        setTimeout(() => { detailPassCopyBtn.innerHTML = '<i class="far fa-copy"></i>'; }, 1500);
      }
    };
  }

  // Load Databases
  const loadDbsBtn = document.getElementById('rdbmsLoadDatabasesBtn');
  if (loadDbsBtn) {
    loadDbsBtn.onclick = async () => {
      const user = document.getElementById('rdbmsDbAdminUser')?.value?.trim();
      const pass = document.getElementById('rdbmsDbAdminPass')?.value;
      if (!user || !pass) {
        showModalNotice('Please provide Admin Username and Password to connect.', 'warning');
        return;
      }
      rdbmsState.adminUser = user;
      rdbmsState.adminPassword = pass;
      saveRdbmsSessionCredentials(user, pass, rdbmsState.currentInstance?.id);

      const inst = rdbmsState.currentInstance;
      const prov = (inst?.connectionConfig?.providerName || inst?.connectionName?.split('-')[0] || '').toLowerCase();
      const isAwsOrIbm = prov === 'aws' || prov === 'ibm';
      let bastionNode = rdbmsState.currentBastionNode;

      if (isAwsOrIbm && (bastionNode || !inst.publicAccess)) {
        if (!bastionNode) {
          const { allNodes } = await getNamespaceBastionNodes();
          const retryMatch = findBestBastionNodeForInstance(inst, allNodes);
          if (retryMatch?.node) {
            rdbmsState.currentBastionNode = retryMatch.node;
            rdbmsState.currentBastionLabel = retryMatch.label;
            bastionNode = retryMatch.node;
          }
        }
        if (!bastionNode) {
          showModalNotice(`AWS & IBM private databases require a running In-VPC Bastion node. No active Bastion VM was found in this VPC.`, 'error');
          return;
        }
        const spinId = addSpinnerTask(`Load DBs via Bastion (${bastionNode.nodeId})`);
        try {
          const res = await executeBastionDbQuery(inst, bastionNode, user, pass, '-s -N -e "SHOW DATABASES;"');
          const lines = res.stdout.split('\n')
            .map(s => s.trim())
            .filter(s => s && s !== 'Database' && !s.startsWith('+') && !s.startsWith('|') && !s.toLowerCase().includes('warning'));
          rdbmsState.databases = lines;
          showModalNotice(`Loaded ${lines.length} databases via In-VPC Bastion (${bastionNode.nodeId}).`, 'success');
          const tbody = document.getElementById('rdbmsDatabaseTableBody');
          if (tbody) tbody.innerHTML = renderDatabaseRows();
          attachDatabaseRowEvents();
        } catch (err) {
          showModalNotice('Database connection failed (via In-VPC Bastion): ' + (err.message || err), 'error');
        } finally {
          removeSpinnerTask(spinId);
        }
        return;
      }

      const config = getConfig();
      const spinId = addSpinnerTask('Load RDBMS Databases');
      try {
        const res = await axios.get(`${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/${rdbmsState.currentInstance.id}/database`, {
          auth: { username: config.username, password: config.password },
          headers: {
            'X-Admin-User-Name': user,
            'X-Admin-User-Password': pass,
          },
        });
        rdbmsState.databases = res.data?.databases || [];
        showModalNotice(`Loaded ${rdbmsState.databases.length} databases.`, 'success');
        const tbody = document.getElementById('rdbmsDatabaseTableBody');
        if (tbody) tbody.innerHTML = renderDatabaseRows();
        attachDatabaseRowEvents();
      } catch (err) {
        showModalNotice('Database connection failed: ' + (err.response?.data?.message || err.message), 'error');
      } finally {
        removeSpinnerTask(spinId);
      }
    };
  }

  // Create Database
  const createDbBtn = document.getElementById('rdbmsCreateDbBtn');
  if (createDbBtn) {
    createDbBtn.onclick = async () => {
      const user = rdbmsState.adminUser || document.getElementById('rdbmsDbAdminUser')?.value?.trim();
      const pass = rdbmsState.adminPassword || document.getElementById('rdbmsDbAdminPass')?.value;
      const dbName = document.getElementById('rdbmsNewDbNameInput')?.value?.trim();

      if (!user || !pass) {
        showModalNotice('Please enter admin credentials first.', 'warning');
        return;
      }
      if (!dbName) {
        showModalNotice('Please enter a new database name.', 'warning');
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
        showModalNotice('Database name may only contain alphanumeric characters and underscores.', 'warning');
        return;
      }

      const inst = rdbmsState.currentInstance;
      const prov = (inst?.connectionConfig?.providerName || inst?.connectionName?.split('-')[0] || '').toLowerCase();
      const isAwsOrIbm = prov === 'aws' || prov === 'ibm';
      let bastionNode = rdbmsState.currentBastionNode;

      if (isAwsOrIbm && (bastionNode || !inst.publicAccess)) {
        if (!bastionNode) {
          const { allNodes } = await getNamespaceBastionNodes();
          const retryMatch = findBestBastionNodeForInstance(inst, allNodes);
          if (retryMatch?.node) {
            rdbmsState.currentBastionNode = retryMatch.node;
            rdbmsState.currentBastionLabel = retryMatch.label;
            bastionNode = retryMatch.node;
          }
        }
        if (!bastionNode) {
          showModalNotice(`AWS & IBM private databases require a running In-VPC Bastion node. No active Bastion VM was found in this VPC.`, 'error');
          return;
        }
        const spinId = addSpinnerTask(`Create DB: ${dbName} via Bastion`);
        try {
          await executeBastionDbQuery(inst, bastionNode, user, pass, `-e "CREATE DATABASE IF NOT EXISTS \\\`${dbName}\\\`;"`);
          showModalNotice(`Database "${dbName}" created successfully via In-VPC Bastion (${bastionNode.nodeId})!`, 'success');
          document.getElementById('rdbmsNewDbNameInput').value = '';
          document.getElementById('rdbmsLoadDatabasesBtn')?.click();
        } catch (err) {
          showModalNotice('Create database failed (via In-VPC Bastion): ' + (err.message || err), 'error');
        } finally {
          removeSpinnerTask(spinId);
        }
        return;
      }

      const config = getConfig();
      const spinId = addSpinnerTask(`Create DB: ${dbName}`);
      try {
        await axios.post(
          `${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/${rdbmsState.currentInstance.id}/database`,
          { databaseName: dbName },
          {
            auth: { username: config.username, password: config.password },
            headers: {
              'X-Admin-User-Name': user,
              'X-Admin-User-Password': pass,
            },
          }
        );
        showModalNotice(`Database "${dbName}" created successfully!`, 'success');
        document.getElementById('rdbmsNewDbNameInput').value = '';
        // Reload DB list
        document.getElementById('rdbmsLoadDatabasesBtn')?.click();
      } catch (err) {
        showModalNotice('Create database failed: ' + (err.response?.data?.message || err.message), 'error');
      } finally {
        removeSpinnerTask(spinId);
      }
    };
  }

  // Inspect TLS & Cert
  const probeTlsBtn = document.getElementById('rdbmsProbeTlsBtn');
  if (probeTlsBtn) {
    probeTlsBtn.onclick = async () => {
      const user = rdbmsState.adminUser || document.getElementById('rdbmsDbAdminUser')?.value?.trim();
      const pass = rdbmsState.adminPassword || document.getElementById('rdbmsDbAdminPass')?.value;
      if (!user || !pass) {
        showModalNotice('Please provide Admin Username and Password above to inspect TLS.', 'warning');
        return;
      }

      const inst = rdbmsState.currentInstance;
      const tlsContainer = document.getElementById('rdbmsTlsContainer');

      const inspectTlsViaBastion = async (bastionNode) => {
        const probeRes = await executeBastionDbQuery(
          inst, bastionNode, user, pass,
          `-s -N -e "SHOW STATUS LIKE 'Ssl_cipher'; SHOW VARIABLES LIKE 'require_secure_transport';"`
        );
        const lines = probeRes.stdout.split('\n');
        let cipher = 'N/A';
        let reqSec = 'OFF';
        for (const line of lines) {
          const parts = line.split('\t').map(p => p.trim());
          if (parts[0] === 'Ssl_cipher') cipher = parts[1] || 'N/A';
          if (parts[0] === 'require_secure_transport') reqSec = parts[1] || 'OFF';
        }
        const tlsInUse = Boolean(cipher && cipher !== 'N/A' && cipher !== '');
        const enforced = reqSec.toUpperCase() === 'ON';
        tlsContainer.innerHTML = `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; font-size: 13px; margin-bottom: 12px;">
            <div><strong>Require Secure Transport:</strong> <span class="rdbms-badge ${enforced ? 'rdbms-badge-success' : 'rdbms-badge-secondary'}">${escapeHtml(reqSec)}</span></div>
            <div><strong>TLS in Use:</strong> ${tlsInUse ? '✅ Yes' : '❌ No'}</div>
            <div><strong>Active Cipher:</strong> <code>${escapeHtml(cipher)}</code></div>
            <div><strong>Probe Source:</strong> <span class="rdbms-badge rdbms-badge-info">In-VPC Bastion (${escapeHtml(bastionNode.nodeId)})</span></div>
          </div>
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px; font-size: 12.5px; color: #1e40af;">
            ℹ️ TLS inspection completed directly via In-VPC Bastion node <strong>${escapeHtml(bastionNode.nodeId)}</strong>.
          </div>
        `;
        showModalNotice(`TLS inspected successfully via In-VPC Bastion (${bastionNode.nodeId}).`, 'success');
      };

      // Private VPC instances cannot be reached by CB-Spider's direct TLS probe; query directly via In-VPC Bastion.
      if (!inst?.publicAccess) {
        let bastionNode = rdbmsState.currentBastionNode;
        if (!bastionNode) {
          const { allNodes } = await getNamespaceBastionNodes();
          const retryMatch = findBestBastionNodeForInstance(inst, allNodes);
          if (retryMatch?.node) {
            rdbmsState.currentBastionNode = retryMatch.node;
            rdbmsState.currentBastionLabel = retryMatch.label;
            bastionNode = retryMatch.node;
          }
        }
        if (!bastionNode) {
          showModalNotice('Private VPC databases require a running In-VPC Bastion node to inspect TLS status.', 'error');
          return;
        }
        const spinId = addSpinnerTask(`Inspect TLS via Bastion (${bastionNode.nodeId})`);
        try {
          await inspectTlsViaBastion(bastionNode);
        } catch (bastionErr) {
          showModalNotice('Inspect TLS failed (via In-VPC Bastion): ' + (bastionErr.message || bastionErr), 'error');
        } finally {
          removeSpinnerTask(spinId);
        }
        return;
      }

      const config = getConfig();
      const spinId = addSpinnerTask('Inspect TLS');
      try {
        const res = await axios.get(`${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/${rdbmsState.currentInstance.id}/secure-transport`, {
          auth: { username: config.username, password: config.password },
          headers: {
            'X-Admin-User-Name': user,
            'X-Admin-User-Password': pass,
          },
        });
        const d = res.data || {};
        rdbmsState.secureTransport = d;

        const ca = d.caCertificate || {};
        const hasPem = Boolean(ca.pem);

        tlsContainer.innerHTML = `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; font-size: 13px; margin-bottom: 12px;">
            <div><strong>Require Secure Transport:</strong> <span class="rdbms-badge ${d.enforced ? 'rdbms-badge-success' : 'rdbms-badge-secondary'}">${escapeHtml(d.requireSecureTransport || 'OFF')}</span></div>
            <div><strong>TLS in Use:</strong> ${d.tlsInUse ? '✅ Yes' : '❌ No'}</div>
            <div><strong>Active Cipher:</strong> <code>${escapeHtml(d.tlsCipher || 'N/A')}</code></div>
            <div><strong>Recommended SSL Mode:</strong> <code>${escapeHtml(d.recommendedSSLMode || 'VERIFY_IDENTITY')}</code></div>
          </div>
          ${hasPem ? `
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-top: 10px;">
              <div style="font-weight: 700; margin-bottom: 6px;">Server CA Certificate Details:</div>
              <div style="font-size: 12.5px; color: #475569; line-height: 1.6;">
                <div><strong>Subject:</strong> ${escapeHtml(ca.subject || 'N/A')}</div>
                <div><strong>Issuer:</strong> ${escapeHtml(ca.issuer || 'N/A')}</div>
                <div><strong>Valid Until:</strong> ${escapeHtml(ca.notAfter ? new Date(ca.notAfter).toLocaleDateString() : 'N/A')}</div>
              </div>
              <button type="button" class="rdbms-btn rdbms-btn-primary" id="rdbmsDownloadCaBtn" style="margin-top: 10px;">
                <i class="fas fa-download"></i> Download CA Certificate (.pem)
              </button>
            </div>
          ` : '<div class="text-muted" style="font-size: 12px;">No custom CA certificate returned for this provider.</div>'}
        `;

        if (hasPem) {
          document.getElementById('rdbmsDownloadCaBtn').onclick = () => {
            const blob = new Blob([ca.pem], { type: 'application/x-pem-file' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${rdbmsState.currentInstance.id}-ca-cert.pem`;
            a.click();
            URL.revokeObjectURL(url);
          };
        }
      } catch (err) {
        let bastionNode = rdbmsState.currentBastionNode;
        if (!bastionNode) {
          const { allNodes } = await getNamespaceBastionNodes();
          const retryMatch = findBestBastionNodeForInstance(inst, allNodes);
          if (retryMatch?.node) {
            rdbmsState.currentBastionNode = retryMatch.node;
            rdbmsState.currentBastionLabel = retryMatch.label;
            bastionNode = retryMatch.node;
          }
        }
        if (bastionNode) {
          try {
            await inspectTlsViaBastion(bastionNode);
            return;
          } catch (bastionErr) {
            showModalNotice('Inspect TLS failed: ' + (bastionErr.message || err.message), 'error');
            return;
          }
        }
        showModalNotice('Inspect TLS failed: ' + (err.response?.data?.message || err.message), 'error');
      } finally {
        removeSpinnerTask(spinId);
      }
    };
  }

  attachDatabaseRowEvents();
}

function attachDatabaseRowEvents() {
  document.querySelectorAll('.btn-drop-database').forEach(btn => {
    btn.onclick = async () => {
      const dbName = btn.dataset.dbname;
      const ok = await showModalConfirm({
        title: 'Drop Logical Database',
        html: `Are you sure you want to permanently DROP database <strong>${escapeHtml(dbName)}</strong>?<br><span style="color:#dc2626;font-size:12.5px;">All tables and records in this database will be permanently removed.</span>`,
        icon: 'danger',
        confirmText: 'Drop Database',
        confirmButtonClass: 'rdbms-btn-danger',
      });
      if (!ok) return;

      const user = rdbmsState.adminUser || document.getElementById('rdbmsDbAdminUser')?.value?.trim();
      const pass = rdbmsState.adminPassword || document.getElementById('rdbmsDbAdminPass')?.value;
      const inst = rdbmsState.currentInstance;
      const prov = (inst?.connectionConfig?.providerName || inst?.connectionName?.split('-')[0] || '').toLowerCase();
      const isAwsOrIbm = prov === 'aws' || prov === 'ibm';
      let bastionNode = rdbmsState.currentBastionNode;

      if (isAwsOrIbm && (bastionNode || !inst.publicAccess)) {
        if (!bastionNode) {
          const { allNodes } = await getNamespaceBastionNodes();
          const retryMatch = findBestBastionNodeForInstance(inst, allNodes);
          if (retryMatch?.node) {
            rdbmsState.currentBastionNode = retryMatch.node;
            rdbmsState.currentBastionLabel = retryMatch.label;
            bastionNode = retryMatch.node;
          }
        }
        if (!bastionNode) {
          showModalNotice(`AWS & IBM private databases require a running In-VPC Bastion node. No active Bastion VM was found in this VPC.`, 'error');
          return;
        }
        const spinId = addSpinnerTask(`Drop DB: ${dbName} via Bastion`);
        try {
          await executeBastionDbQuery(inst, bastionNode, user, pass, `-e "DROP DATABASE IF EXISTS \\\`${dbName}\\\`;"`);
          showModalNotice(`Database "${dbName}" dropped successfully via In-VPC Bastion (${bastionNode.nodeId}).`, 'success');
          document.getElementById('rdbmsLoadDatabasesBtn')?.click();
        } catch (err) {
          showModalNotice('Drop database failed (via In-VPC Bastion): ' + (err.message || err), 'error');
        } finally {
          removeSpinnerTask(spinId);
        }
        return;
      }

      const config = getConfig();
      const spinId = addSpinnerTask(`Drop DB: ${dbName}`);
      try {
        await axios.delete(
          `${tbApiBase()}/ns/${rdbmsState.namespace}/resources/rdbms/${rdbmsState.currentInstance.id}/database/${encodeURIComponent(dbName)}`,
          {
            auth: { username: config.username, password: config.password },
            headers: {
              'X-Admin-User-Name': user,
              'X-Admin-User-Password': pass,
            },
          }
        );
        showModalNotice(`Database "${dbName}" dropped successfully.`, 'success');
        document.getElementById('rdbmsLoadDatabasesBtn')?.click();
      } catch (err) {
        showModalNotice('Drop database failed: ' + (err.response?.data?.message || err.message), 'error');
      } finally {
        removeSpinnerTask(spinId);
      }
    };
  });
}

// Global window attachment for UI & event triggers
window.showRdbmsModal = showRdbmsModal;

