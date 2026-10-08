/**
 * Object Storage Management Feature Module for cb-mapui
 * Provides all-in-one bucket lifecycle management and object browsing via SweetAlert2.
 * @module features/object-storage
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import { tbApiBase, getConfig } from '../../core/api.js';
import { escapeHtml } from '../../core/utils.js';

const addSpinnerTask = (name) => (window.addSpinnerTask ? window.addSpinnerTask(name) : name);
const removeSpinnerTask = (id) => { if (window.removeSpinnerTask) window.removeSpinnerTask(id); };

// --- In-Modal Notification & Overlay Confirmation Handlers ---
let noticeTimeoutId = null;

export function showModalNotice(message, type = 'info', autoDismissMs = 4500) {
  const banner = document.getElementById('osNoticeBanner');
  if (!banner) {
    console.log(`[ObjectStorage ${type}]`, message);
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

  banner.className = `os-notice-banner os-notice-${type}`;
  banner.innerHTML = `
    <div class="os-notice-content">
      <span class="os-notice-icon">${icons[type] || icons.info}</span>
      <span class="os-notice-text">${escapeHtml(message)}</span>
    </div>
    <button type="button" class="os-notice-close" title="Dismiss">&times;</button>
  `;
  banner.style.display = 'flex';
  banner.style.opacity = '1';

  const closeBtn = banner.querySelector('.os-notice-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => dismissModalNotice());
  }

  const modalContainer = document.getElementById('osModalContent');
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
  const banner = document.getElementById('osNoticeBanner');
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
  icon = 'warning', // 'warning' | 'danger' | 'info'
  confirmText = 'Confirm',
  confirmButtonClass = 'os-btn-danger',
  cancelText = 'Cancel',
}) {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    const overlay = document.getElementById('osConfirmOverlay');
    const titleEl = document.getElementById('osConfirmTitle');
    const bodyEl = document.getElementById('osConfirmBody');
    const iconEl = document.getElementById('osConfirmIcon');
    const actionsEl = document.getElementById('osConfirmActions');

    if (!overlay || !titleEl || !bodyEl || !actionsEl) {
      resolve(confirm(title + '\n' + html.replace(/<[^>]*>/g, '')));
      return;
    }

    titleEl.innerText = title;
    bodyEl.innerHTML = html;

    const iconMap = {
      warning: '<div style="width:52px;height:52px;border-radius:50%;background:#fef3c7;display:flex;align-items:center;justify-content:center;margin:0 auto 14px auto;"><i class="fas fa-exclamation-triangle" style="font-size:24px;color:#d97706;"></i></div>',
      danger: '<div style="width:52px;height:52px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;margin:0 auto 14px auto;"><i class="fas fa-trash-alt" style="font-size:22px;color:#dc2626;"></i></div>',
      info: '<div style="width:52px;height:52px;border-radius:50%;background:#e0f2fe;display:flex;align-items:center;justify-content:center;margin:0 auto 14px auto;"><i class="fas fa-info-circle" style="font-size:24px;color:#0284c7;"></i></div>',
    };
    if (iconEl) {
      iconEl.innerHTML = iconMap[icon] || iconMap.warning;
    }

    actionsEl.innerHTML = `
      <button id="osConfirmCancelBtn" class="os-btn os-btn-secondary" style="padding: 8px 20px; font-size: 14px; font-weight: 600;">${escapeHtml(cancelText)}</button>
      <button id="osConfirmOkBtn" class="os-btn ${confirmButtonClass}" style="padding: 8px 22px; font-size: 14px; font-weight: 600;">${escapeHtml(confirmText)}</button>
    `;

    overlay.style.display = 'flex';

    const cancelBtn = document.getElementById('osConfirmCancelBtn');
    const okBtn = document.getElementById('osConfirmOkBtn');

    if (cancelBtn) {
      cancelBtn.onclick = () => {
        overlay.style.display = 'none';
        if (confirmResolver) {
          confirmResolver(false);
          confirmResolver = null;
        }
      };
    }

    if (okBtn) {
      okBtn.onclick = () => {
        okBtn.disabled = true;
        okBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processing...';
        overlay.style.display = 'none';
        if (confirmResolver) {
          confirmResolver(true);
          confirmResolver = null;
        }
      };
    }
  });
}

export function showModalCorsDialog(bucketId, currentRules) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('osConfirmOverlay');
    const titleEl = document.getElementById('osConfirmTitle');
    const bodyEl = document.getElementById('osConfirmBody');
    const iconEl = document.getElementById('osConfirmIcon');
    const actionsEl = document.getElementById('osConfirmActions');

    if (!overlay || !titleEl || !bodyEl || !actionsEl) {
      resolve('cancel');
      return;
    }

    const hasCors = currentRules && currentRules.length > 0;
    titleEl.innerText = `🌐 CORS Configuration: ${bucketId}`;
    if (iconEl) {
      iconEl.innerHTML = '<div style="width:52px;height:52px;border-radius:50%;background:#e0f2fe;display:flex;align-items:center;justify-content:center;margin:0 auto 14px auto;"><i class="fas fa-globe" style="font-size:24px;color:#0284c7;"></i></div>';
    }

    bodyEl.innerHTML = `
      <div style="text-align: left; font-size: 14px; line-height: 1.6; margin-bottom: 12px;">
        <p style="margin-bottom: 10px;">CORS (Cross-Origin Resource Sharing) allows web browsers to interact directly with this bucket for Presigned URL uploads and downloads.</p>
        <div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 8px;">
          <b>Current Status:</b> 
          ${hasCors ? '<span class="os-badge os-badge-success" style="margin-left:6px;">Configured</span>' : '<span class="os-badge os-badge-warning" style="margin-left:6px;">Not Configured</span>'}
          ${hasCors ? `<pre style="font-size:12px; margin-top:8px; max-height:140px; overflow:auto; background:#ffffff; padding:10px; border-radius:6px; border:1px solid #cbd5e1;">${escapeHtml(JSON.stringify(currentRules, null, 2))}</pre>` : ''}
        </div>
      </div>
    `;

    actionsEl.innerHTML = `
      <div style="display: flex; gap: 10px; justify-content: flex-end; width: 100%; flex-wrap: wrap;">
        <button id="osCorsCloseBtn" class="os-btn os-btn-secondary" style="padding: 8px 18px; font-size: 14px; font-weight: 600;">Close</button>
        ${hasCors ? `<button id="osCorsDeleteBtn" class="os-btn os-btn-danger" style="padding: 8px 18px; font-size: 14px; font-weight: 600;"><i class="fas fa-trash-alt"></i> Delete CORS</button>` : ''}
        <button id="osCorsApplyBtn" class="os-btn os-btn-primary" style="padding: 8px 20px; font-size: 14px; font-weight: 600;"><i class="fas fa-check"></i> Apply Default CORS (*)</button>
      </div>
    `;

    overlay.style.display = 'flex';

    const closeBtn = document.getElementById('osCorsCloseBtn');
    const deleteBtn = document.getElementById('osCorsDeleteBtn');
    const applyBtn = document.getElementById('osCorsApplyBtn');

    if (closeBtn) closeBtn.onclick = () => { overlay.style.display = 'none'; resolve('cancel'); };
    if (deleteBtn) deleteBtn.onclick = () => { overlay.style.display = 'none'; resolve('delete'); };
    if (applyBtn) applyBtn.onclick = () => { overlay.style.display = 'none'; resolve('apply'); };
  });
}

const errorAlert = (msg) => showModalNotice(msg, 'error');
const successAlert = (msg) => showModalNotice(msg, 'success');

// Helper to format bytes into readable units
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Validate bucket name against standard S3/CSP rules: 3-63 chars, lowercase, numbers, hyphens
function isValidBucketName(name) {
  if (!name || name.length < 3 || name.length > 63) return false;
  const regex = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
  return regex.test(name);
}

const CSP_ORDER = ['aws', 'alibaba', 'tencent', 'ncp', 'gcp', 'azure', 'ibm', 'kt', 'nhn', 'openstack'];

const CSP_NAMES = {
  aws: 'AWS',
  alibaba: 'Alibaba Cloud',
  tencent: 'Tencent Cloud',
  ncp: 'Naver Cloud (NCP)',
  gcp: 'Google Cloud (GCP)',
  azure: 'Microsoft Azure',
  ibm: 'IBM Cloud',
  kt: 'KT Cloud',
  nhn: 'NHN Cloud',
  openstack: 'OpenStack',
};

function getProviderMetadata(providerName) {
  const p = (providerName || '').toLowerCase();
  return {
    id: p,
    name: CSP_NAMES[p] || (providerName ? providerName.toUpperCase() : 'UNKNOWN'),
    icon: `/img/csp-${p}.png`,
  };
}

function groupConnectionsByProvider(connections) {
  const providerMap = {};
  for (const c of (connections || [])) {
    let p = (c.providerName || '').toLowerCase();
    if (!p && c.configName) {
      p = c.configName.split('-')[0].toLowerCase();
    }
    if (!providerMap[p]) {
      providerMap[p] = [];
    }
    providerMap[p].push(c);
  }
  return providerMap;
}

function getRegionDisplay(conn) {
  const rawDisp = (conn.regionDetail?.location?.display || conn.regionDetail?.description || '').trim();
  const reg = (conn.regionDetail?.regionName || conn.regionZoneInfo?.assignedRegion || conn.configName || '').trim();
  const cfg = (conn.configName || '').trim();
  const t = `${rawDisp} ${reg} ${cfg}`.toLowerCase();

  let flag = '🌐';
  let cleanName = rawDisp;

  if (t.includes('korea') || t.includes('seoul') || t.includes('pangyo') || t.includes('pyeongchon') || t.includes('gasan') || t.includes('mok-dong') || t.includes('kr1') || t.includes('kr2') || cfg.includes('-kr')) {
    flag = '🇰🇷';
    cleanName = (t.includes('seoul') || reg === 'kr' || reg.startsWith('kr-') || reg === 'kr1') ? 'Seoul, South Korea' : (t.includes('pangyo') ? 'Pangyo, South Korea' : 'South Korea');
  } else if (t.includes('japan') || t.includes('tokyo') || t.includes('osaka') || t.includes('jp1') || t.includes('jpn') || reg === 'ap-northeast-1' || reg === 'ap-northeast-3') {
    flag = '🇯🇵';
    cleanName = t.includes('osaka') || reg === 'ap-northeast-3' ? 'Osaka, Japan' : 'Tokyo, Japan';
  } else if (t.includes('singapore') || t.includes('southeast-1') || reg === 'sgn') {
    flag = '🇸🇬';
    cleanName = 'Singapore';
  } else if (t.includes('china') || t.includes('beijing') || t.includes('shanghai') || t.includes('guangzhou') || t.includes('shenzhen') || t.includes('chengdu') || t.includes('hangzhou') || t.includes('qingdao') || t.includes('wuhan') || t.includes('ulanqab') || t.includes('zhangjiakou') || t.includes('zhongwei') || t.includes('heyuan') || t.includes('hohhot') || t.includes('nanjing') || t.includes('fuzhou') || reg.startsWith('cn-')) {
    flag = '🇨🇳';
    const cities = ['Beijing', 'Shanghai', 'Guangzhou', 'Shenzhen', 'Chengdu', 'Hangzhou', 'Qingdao', 'Wuhan', 'Ulanqab', 'Zhangjiakou', 'Zhongwei', 'Heyuan', 'Hohhot', 'Nanjing', 'Fuzhou'];
    const found = cities.find(c => t.includes(c.toLowerCase()));
    cleanName = found ? `${found}, China` : 'China';
  } else if (t.includes('hong kong') || t.includes('hongkong')) {
    flag = '🇭🇰';
    cleanName = 'Hong Kong';
  } else if (t.includes('taiwan') || t.includes('taipei')) {
    flag = '🇹🇼';
    cleanName = 'Taipei, Taiwan';
  } else if (t.includes('india') || t.includes('mumbai') || t.includes('delhi') || t.includes('hyderabad') || t.includes('chennai') || t.includes('bengaluru') || t.includes('bangalore')) {
    flag = '🇮🇳';
    const cities = ['Mumbai', 'Delhi', 'Hyderabad', 'Chennai', 'Bengaluru'];
    const found = cities.find(c => t.includes(c.toLowerCase()));
    cleanName = found ? `${found}, India` : 'India';
  } else if (t.includes('australia') || t.includes('sydney') || t.includes('melbourne') || t.includes('canberra') || t.includes('perth') || t.includes('brisbane') || reg.includes('australia')) {
    flag = '🇦🇺';
    cleanName = t.includes('melbourne') ? 'Melbourne, Australia' : 'Sydney, Australia';
  } else if (t.includes('new zealand') || t.includes('auckland')) {
    flag = '🇳🇿';
    cleanName = 'Auckland, New Zealand';
  } else if (t.includes('malaysia') || t.includes('kuala lumpur') || t.includes('johor')) {
    flag = '🇲🇾';
    cleanName = t.includes('kuala') ? 'Kuala Lumpur, Malaysia' : 'Malaysia';
  } else if (t.includes('indonesia') || t.includes('jakarta')) {
    flag = '🇮🇩';
    cleanName = 'Jakarta, Indonesia';
  } else if (t.includes('philippines') || t.includes('manila')) {
    flag = '🇵🇭';
    cleanName = 'Manila, Philippines';
  } else if (t.includes('thailand') || t.includes('bangkok')) {
    flag = '🇹🇭';
    cleanName = 'Bangkok, Thailand';
  } else if (t.includes('vietnam') || t.includes('hanoi') || t.includes('ho chi minh')) {
    flag = '🇻🇳';
    cleanName = 'Vietnam';
  } else if (t.includes('united states') || t.includes('usa') || t.includes('us (') || t.includes('virginia') || t.includes('ohio') || t.includes('oregon') || t.includes('california') || t.includes('silicon valley') || t.includes('texas') || t.includes('dallas') || t.includes('iowa') || t.includes('arizona') || t.includes('salt lake') || t.includes('las vegas') || t.includes('washington') || reg.includes('centralus') || reg.includes('eastus') || reg.includes('westus') || reg.includes('northcentralus') || reg.includes('southcentralus') || reg.includes('westcentralus') || reg.startsWith('us-')) {
    flag = '🇺🇸';
    if (t.includes('virginia') || reg === 'us-east-1') cleanName = 'N. Virginia, USA';
    else if (t.includes('ohio') || reg === 'us-east-2') cleanName = 'Ohio, USA';
    else if (t.includes('oregon') || reg === 'us-west-2') cleanName = 'Oregon, USA';
    else if (t.includes('california') || t.includes('silicon valley')) cleanName = 'N. California, USA';
    else if (t.includes('texas') || t.includes('dallas')) cleanName = 'Texas, USA';
    else if (t.includes('iowa')) cleanName = 'Iowa, USA';
    else if (t.includes('arizona')) cleanName = 'Arizona, USA';
    else if (t.includes('salt lake')) cleanName = 'Utah, USA';
    else if (t.includes('las vegas') || t.includes('nevada')) cleanName = 'Nevada, USA';
    else if (t.includes('washington')) cleanName = 'Washington DC, USA';
    else if (reg === 'centralus') cleanName = 'Central US';
    else if (reg === 'eastus2') cleanName = 'East US 2';
    else if (reg === 'eastus') cleanName = 'East US';
    else if (reg === 'westus3') cleanName = 'West US 3';
    else if (reg === 'westus2') cleanName = 'West US 2';
    else if (reg === 'westus') cleanName = 'West US';
    else if (reg === 'northcentralus') cleanName = 'North Central US';
    else if (reg === 'southcentralus') cleanName = 'South Central US';
    else if (reg === 'westcentralus') cleanName = 'West Central US';
    else cleanName = 'United States';
  } else if (t.includes('canada') || t.includes('toronto') || t.includes('montreal') || t.includes('calgary') || t.includes('vancouver') || t.includes('quebec') || reg.includes('canada')) {
    flag = '🇨🇦';
    const cities = ['Montreal', 'Toronto', 'Calgary', 'Vancouver', 'Quebec'];
    const found = cities.find(c => t.includes(c.toLowerCase()));
    cleanName = found ? `${found}, Canada` : 'Canada';
  } else if (t.includes('germany') || t.includes('frankfurt') || t.includes('berlin')) {
    flag = '🇩🇪';
    cleanName = 'Frankfurt, Germany';
  } else if (t.includes('united kingdom') || t.includes('london') || t.includes('cardiff') || reg.includes('uksouth') || reg.includes('ukwest')) {
    flag = '🇬🇧';
    cleanName = t.includes('london') || reg.includes('south') ? 'London, UK' : 'UK West';
  } else if (t.includes('france') || t.includes('paris') || t.includes('marseille')) {
    flag = '🇫🇷';
    cleanName = 'Paris, France';
  } else if (t.includes('netherlands') || t.includes('amsterdam') || t.includes('eemshaven') || reg === 'westeurope') {
    flag = '🇳🇱';
    cleanName = 'Amsterdam, Netherlands';
  } else if (t.includes('ireland') || t.includes('dublin') || reg === 'northeurope') {
    flag = '🇮🇪';
    cleanName = 'Dublin, Ireland';
  } else if (t.includes('italy') || t.includes('milan') || t.includes('turin') || t.includes('rome') || t.includes('lombardy') || reg.includes('italy')) {
    flag = '🇮🇹';
    cleanName = t.includes('turin') ? 'Turin, Italy' : 'Milan, Italy';
  } else if (t.includes('spain') || t.includes('madrid')) {
    flag = '🇪🇸';
    cleanName = 'Madrid, Spain';
  } else if (t.includes('sweden') || t.includes('stockholm')) {
    flag = '🇸🇪';
    cleanName = 'Stockholm, Sweden';
  } else if (t.includes('switzerland') || t.includes('zurich') || t.includes('geneva')) {
    flag = '🇨🇭';
    cleanName = 'Zurich, Switzerland';
  } else if (t.includes('norway') || t.includes('oslo')) {
    flag = '🇳🇴';
    cleanName = 'Norway';
  } else if (t.includes('finland') || t.includes('helsinki') || t.includes('hamina')) {
    flag = '🇫🇮';
    cleanName = 'Finland';
  } else if (t.includes('denmark') || t.includes('copenhagen')) {
    flag = '🇩🇰';
    cleanName = 'Denmark';
  } else if (t.includes('poland') || t.includes('warsaw')) {
    flag = '🇵🇱';
    cleanName = 'Warsaw, Poland';
  } else if (t.includes('austria') || t.includes('vienna')) {
    flag = '🇦🇹';
    cleanName = 'Vienna, Austria';
  } else if (t.includes('belgium') || t.includes('brussels')) {
    flag = '🇧🇪';
    cleanName = 'Brussels, Belgium';
  } else if (t.includes('brazil') || t.includes('sao paulo') || t.includes('rio') || reg.includes('brazil')) {
    flag = '🇧🇷';
    cleanName = 'Sao Paulo, Brazil';
  } else if (t.includes('chile') || t.includes('santiago')) {
    flag = '🇨🇱';
    cleanName = 'Santiago, Chile';
  } else if (t.includes('mexico') || t.includes('querétaro') || t.includes('monterrey') || reg.includes('mexico')) {
    flag = '🇲🇽';
    cleanName = 'Mexico';
  } else if (t.includes('south africa') || t.includes('johannesburg') || t.includes('cape town') || reg.includes('southafrica')) {
    flag = '🇿🇦';
    cleanName = t.includes('johannesburg') || reg.includes('north') ? 'Johannesburg, S. Africa' : 'Cape Town, S. Africa';
  } else if (t.includes('uae') || t.includes('dubai') || t.includes('abu dhabi') || reg.includes('uae')) {
    flag = '🇦🇪';
    cleanName = 'Dubai, UAE';
  } else if (t.includes('saudi arabia') || t.includes('riyadh') || t.includes('dammam')) {
    flag = '🇸🇦';
    cleanName = t.includes('riyadh') ? 'Riyadh, Saudi Arabia' : 'Dammam, Saudi Arabia';
  } else if (t.includes('qatar') || t.includes('doha')) {
    flag = '🇶🇦';
    cleanName = 'Doha, Qatar';
  } else if (t.includes('israel') || t.includes('tel aviv') || t.includes('jerusalem')) {
    flag = '🇮🇱';
    cleanName = 'Tel Aviv, Israel';
  }

  if (!cleanName) cleanName = reg;
  return `${flag} ${cleanName} (${reg})`;
}

function sortConnections(connList) {
  return [...connList].sort((a, b) => {
    const dispA = getRegionDisplay(a);
    const dispB = getRegionDisplay(b);
    const isKrA = dispA.includes('🇰🇷');
    const isKrB = dispB.includes('🇰🇷');
    if (isKrA && !isKrB) return -1;
    if (!isKrA && isKrB) return 1;
    return dispA.localeCompare(dispB);
  });
}

// Internal state of the object storage modal
let osState = {
  namespace: '',
  view: 'buckets', // 'buckets' | 'objects'
  currentBucket: null,
  bucketList: [],
  objectList: [],
  connections: [],
  supportMatrix: {},
  filterText: '',
  isUploading: false,
  selectedProvider: 'aws',
};

/**
 * Open the Object Storage Management Modal
 * @param {string} [initialBucketId] - Optional bucket ID to open directly into object view
 */
export async function showObjectStorageModal(initialBucketId = null) {
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

  osState.namespace = namespace;
  osState.view = initialBucketId ? 'objects' : 'buckets';
  osState.currentBucket = initialBucketId ? { id: initialBucketId, name: initialBucketId } : null;
  osState.filterText = '';
  osState.isUploading = false;

  // Load connection configurations & support matrix in parallel
  loadConnectionsAndSupport();

  Swal.fire({
    title: '🪣 Object Storage Management',
    html: `
      <style>
        .swal2-os-modal { max-width: 1250px !important; position: relative !important; overflow: hidden !important; }
        .os-modal-container { 
          text-align: left; 
          font-size: 14.5px; 
          line-height: 1.5; 
          color: #1e293b; 
          max-height: 78vh; 
          overflow-y: auto; 
          padding: 6px 10px; 
        }
        .os-header-bar { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          background: #f8fafc; 
          padding: 12px 18px; 
          border-radius: 8px; 
          margin-bottom: 14px; 
          border: 1px solid #e2e8f0; 
        }
        .os-header-title { 
          font-weight: 700; 
          font-size: 16.5px; 
          color: #0f172a; 
          display: flex; 
          align-items: center; 
          gap: 10px; 
        }
        .os-badge { 
          padding: 4px 10px; 
          border-radius: 6px; 
          font-size: 12.5px; 
          font-weight: 600; 
          display: inline-block; 
        }
        .os-badge-success { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
        .os-badge-danger { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
        .os-badge-warning { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
        .os-badge-info { background: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc; }
        .os-badge-secondary { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }

        .os-card { 
          background: #ffffff; 
          border: 1px solid #e2e8f0; 
          border-radius: 8px; 
          padding: 16px; 
          margin-bottom: 14px; 
          box-shadow: 0 1px 3px rgba(0,0,0,0.05); 
        }
        .os-card h6 { 
          margin: 0 0 14px 0; 
          font-size: 15.5px; 
          font-weight: 700; 
          color: #1e293b; 
          display: flex; 
          align-items: center; 
          justify-content: space-between; 
        }
        .os-form-row { display: flex; gap: 14px; margin-bottom: 12px; flex-wrap: wrap; }
        .os-form-col { flex: 1; min-width: 220px; }
        .os-form-col label { 
          display: block; 
          margin-bottom: 6px; 
          font-size: 14px; 
          font-weight: 700; 
          color: #334155; 
        }
        .os-form-control { 
          width: 100%; 
          height: 42px; 
          padding: 6px 12px; 
          font-size: 14px; 
          border: 1.5px solid #cbd5e1; 
          border-radius: 6px; 
          box-sizing: border-box; 
          background: #ffffff;
          color: #0f172a;
        }
        .os-form-control:focus { 
          outline: none; 
          border-color: #2563eb; 
          box-shadow: 0 0 0 3px rgba(37,99,235,0.15); 
        }
        .os-validation-hint { font-size: 12.5px; margin-top: 5px; }

        .os-table-container { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #fff; }
        .os-table { width: 100%; border-collapse: collapse; font-size: 14px; }
        .os-table th { 
          background: #f8fafc; 
          color: #334155; 
          font-weight: 700; 
          font-size: 14px; 
          text-align: left; 
          padding: 12px 14px; 
          border-bottom: 1.5px solid #e2e8f0; 
        }
        .os-table td { padding: 12px 14px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
        .os-table tr:hover td { background-color: #f8fafc; }

        .os-btn { 
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
        .os-btn:disabled, .os-btn[disabled] {
          opacity: 0.65;
          cursor: not-allowed !important;
        }
        .os-btn i {
          display: inline-block !important;
        }
        .os-btn-primary { background: #2563eb; color: #fff; border-color: #1d4ed8; }
        .os-btn-primary:hover { background: #1d4ed8; }
        .os-btn-secondary { background: #f1f5f9; color: #334155; border-color: #cbd5e1; }
        .os-btn-secondary:hover { background: #e2e8f0; }
        .os-btn-danger { background: #fff; color: #dc2626; border-color: #fca5a5; }
        .os-btn-danger:hover { background: #fee2e2; }
        .os-btn-info { background: #0284c7; color: #fff; border-color: #0369a1; }
        .os-btn-info:hover { background: #0369a1; }

        .os-dropzone { 
          border: 2px dashed #94a3b8; 
          border-radius: 8px; 
          padding: 24px; 
          text-align: center; 
          background: #f8fafc; 
          cursor: pointer; 
          transition: all 0.2s; 
          margin-bottom: 14px; 
          font-size: 14.5px;
        }
        .os-dropzone:hover, .os-dropzone.dragover { border-color: #2563eb; background: #eff6ff; }
        .os-progress-bar { width: 100%; height: 10px; background: #e2e8f0; border-radius: 5px; overflow: hidden; margin-top: 8px; }
        .os-progress-fill { height: 100%; background: #2563eb; width: 0%; transition: width 0.15s; }

        /* Enhanced CSP Selection Styles */
        .os-csp-container { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
        .os-csp-tile {
          display: flex; align-items: center; gap: 8px; padding: 8px 14px;
          border: 1.5px solid #cbd5e1; border-radius: 8px; background: #ffffff;
          cursor: pointer; transition: all 0.15s ease; user-select: none;
        }
        .os-csp-tile:hover { border-color: #93c5fd; background: #f8fafc; }
        .os-csp-tile.active {
          border-color: #2563eb; background: #eff6ff;
          box-shadow: 0 0 0 2px rgba(37,99,235,0.25);
        }
        .os-csp-logo { width: 22px; height: 22px; object-fit: contain; }
        .os-csp-name { font-weight: 700; font-size: 13.5px; color: #0f172a; }
        .os-csp-count { font-size: 12px; font-weight: 600; color: #475569; background: #f1f5f9; padding: 2px 7px; border-radius: 10px; }
        .os-csp-tile.active .os-csp-count { background: #dbeafe; color: #1d4ed8; }

        .os-csp-info-box {
          background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
          padding: 10px 16px; margin-bottom: 14px; display: flex; align-items: center;
          justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 13.5px;
          line-height: 1.6;
        }
        .os-conn-hint { font-size: 13px; color: #475569; margin-top: 6px; display: flex; align-items: center; gap: 8px; }

        /* In-Modal Notice Banner Styles */
        .os-notice-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 18px;
          border-radius: 8px;
          margin: 6px 10px 14px 10px;
          font-size: 14px;
          line-height: 1.5;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
          transition: opacity 0.2s ease, transform 0.2s ease;
          animation: osSlideDown 0.25s ease-out;
        }
        .os-notice-content { display: flex; align-items: center; gap: 10px; flex: 1; text-align: left; }
        .os-notice-icon { font-size: 18px; display: flex; align-items: center; }
        .os-notice-text { font-weight: 500; word-break: break-word; }
        .os-notice-success { background: #f0fdf4; border: 1.5px solid #86efac; color: #166534; }
        .os-notice-error { background: #fef2f2; border: 1.5px solid #fca5a5; color: #991b1b; }
        .os-notice-warning { background: #fffbeb; border: 1.5px solid #fde68a; color: #92400e; }
        .os-notice-info { background: #eff6ff; border: 1.5px solid #bfdbfe; color: #1e40af; }
        .os-notice-close {
          background: transparent;
          border: none;
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
          opacity: 0.6;
          padding: 0 4px;
          color: inherit;
          transition: opacity 0.15s;
        }
        .os-notice-close:hover { opacity: 1; }

        /* In-Modal Confirm Overlay Styles */
        .os-confirm-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(3px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          box-sizing: border-box;
          border-radius: 15px;
          animation: osFadeIn 0.15s ease-out;
        }
        .os-confirm-card {
          background: #ffffff;
          border-radius: 12px;
          padding: 28px 30px;
          max-width: 520px;
          width: 100%;
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3), 0 8px 10px -6px rgba(0,0,0,0.15);
          text-align: center;
          border: 1px solid #e2e8f0;
          animation: osScaleUp 0.18s ease-out;
        }
        .os-confirm-title {
          margin: 0 0 10px 0;
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
        }
        .os-confirm-body {
          font-size: 14.5px;
          color: #334155;
          margin-bottom: 22px;
          line-height: 1.6;
        }
        .os-confirm-actions {
          display: flex;
          gap: 10px;
          justify-content: center;
          flex-wrap: wrap;
        }

        @keyframes osSlideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes osFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes osScaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes osSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .fa-spin, .os-spin {
          display: inline-block !important;
          animation: osSpin 0.9s infinite linear !important;
          transform-origin: 50% 50% !important;
        }
      </style>
      <div class="os-modal-wrapper" style="position: relative; width: 100%;">
        <!-- In-Modal Notice Banner -->
        <div id="osNoticeBanner" class="os-notice-banner" style="display: none;"></div>

        <!-- In-Modal Main Content -->
        <div id="osModalContent" class="os-modal-container">
          <div style="text-align: center; padding: 30px;"><i class="fas fa-circle-notch fa-spin fa-2x text-primary"></i><div class="mt-2 text-muted">Loading Object Storage data...</div></div>
        </div>

        <!-- In-Modal Confirm / Prompt Overlay -->
        <div id="osConfirmOverlay" class="os-confirm-overlay" style="display: none;">
          <div class="os-confirm-card" id="osConfirmCard">
            <div id="osConfirmIcon"></div>
            <h4 id="osConfirmTitle" class="os-confirm-title"></h4>
            <div id="osConfirmBody" class="os-confirm-body"></div>
            <div id="osConfirmActions" class="os-confirm-actions"></div>
          </div>
        </div>
      </div>
    `,
    width: '85%',
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '✖ Close',
    customClass: {
      popup: 'swal2-os-modal',
      htmlContainer: 'p-0',
    },
    didOpen: async () => {
      await loadConnectionsAndSupport();
      await renderModalView();
    },
    didClose: () => {
      if (noticeTimeoutId) {
        clearTimeout(noticeTimeoutId);
        noticeTimeoutId = null;
      }
    }
  });
}

// Load Connections and CSP Feature Support Information
async function loadConnectionsAndSupport() {
  const config = getConfig();
  try {
    const [connRes, suppRes] = await Promise.all([
      axios.get(`${tbApiBase()}/connConfig`, {
        auth: { username: config.username, password: config.password },
      }),
      axios.get(`${tbApiBase()}/objectStorage/support`, {
        auth: { username: config.username, password: config.password },
      }).catch(() => ({ data: { supports: {} } })),
    ]);

    if (connRes.data && connRes.data.connectionconfig) {
      osState.connections = connRes.data.connectionconfig;
    }
    if (suppRes.data && suppRes.data.supports) {
      osState.supportMatrix = suppRes.data.supports;
    }
  } catch (err) {
    console.warn('[ObjectStorage] Failed to preload connections/support:', err);
  }
}

// Render the entire modal content according to current view ('buckets' or 'objects')
async function renderModalView() {
  const container = document.getElementById('osModalContent');
  if (!container) return;

  if (osState.view === 'buckets') {
    await renderBucketListView(container);
  } else if (osState.view === 'objects') {
    await renderObjectExplorerView(container);
  }
}

// -------------------------------------------------------------------------------------------------
// VIEW 1: BUCKET LIST & CREATION VIEW
// -------------------------------------------------------------------------------------------------
async function renderBucketListView(container) {
  container.innerHTML = `
    <div style="text-align: center; padding: 25px;"><i class="fas fa-circle-notch fa-spin fa-2x text-primary"></i><div class="mt-2 text-muted">Fetching bucket list...</div></div>
  `;

  const config = getConfig();
  try {
    const res = await axios.get(`${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage`, {
      auth: { username: config.username, password: config.password },
    });
    osState.bucketList = (res.data && res.data.objectStorage) ? res.data.objectStorage : [];
  } catch (err) {
    console.error('[ObjectStorage] List error:', err);
    osState.bucketList = [];
  }

  // Fallback connections if not loaded yet
  // Group connections by provider
  const providerMap = groupConnectionsByProvider(osState.connections);
  const availableProviders = Object.keys(providerMap);

  // Set default provider if needed
  if (!osState.selectedProvider || !providerMap[osState.selectedProvider]) {
    if (providerMap['aws']) {
      osState.selectedProvider = 'aws';
    } else if (availableProviders.length > 0) {
      osState.selectedProvider = availableProviders[0];
    }
  }

  // Build CSP Tiles
  const sortedProviderList = CSP_ORDER
    .filter(p => providerMap[p] && providerMap[p].length > 0)
    .concat(availableProviders.filter(p => !CSP_ORDER.includes(p)));

  const cspTilesHtml = sortedProviderList.map(p => {
    const meta = getProviderMetadata(p);
    const conns = providerMap[p] || [];
    const isActive = p === osState.selectedProvider ? 'active' : '';
    return `
      <div class="os-csp-tile ${isActive}" data-provider="${p}" title="${escapeHtml(meta.name)} (${conns.length} regions available)">
        <img src="${meta.icon}" class="os-csp-logo" onerror="this.src='/img/circle.png';">
        <span class="os-csp-name">${escapeHtml(meta.name)}</span>
        <span class="os-csp-count">${conns.length}</span>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <!-- Top Header Bar -->
    <div class="os-header-bar">
      <div class="os-header-title">
        <i class="fas fa-cubes text-primary" style="font-size: 16px;"></i>
        <span>Object Storage Buckets</span>
        <span class="os-badge os-badge-info">Namespace: ${escapeHtml(osState.namespace)}</span>
        <span class="os-badge os-badge-secondary">${osState.bucketList.length} bucket(s)</span>
      </div>
      <div>
        <button id="osRefreshBucketsBtn" class="os-btn os-btn-secondary" title="Refresh list">
          <i class="fas fa-sync-alt"></i> Refresh
        </button>
      </div>
    </div>

    <!-- Create Bucket Card (Collapsible) -->
    <div class="os-card">
      <h6>
        <span><i class="fas fa-plus-circle text-primary"></i> Create New Bucket</span>
        <button id="osToggleCreateCardBtn" class="os-btn os-btn-secondary" style="padding: 2px 6px; font-size: 10px;">Collapse</button>
      </h6>
      <div id="osCreateFormBody">
        <!-- 1. Cloud Provider (CSP) Selection -->
        <label style="display: block; margin-bottom: 6px; font-size: 12px; font-weight: 700; color: #334155;">
          1. Select Cloud Provider (CSP)
        </label>
        <div id="osCspContainer" class="os-csp-container">
          ${cspTilesHtml}
        </div>

        <!-- Dynamic CSP Capability & Guidance Banner -->
        <div id="osCspInfoBox" class="os-csp-info-box">
          <!-- Populated by updateCreateFormForProvider -->
        </div>

        <!-- 2. Bucket Name & Region Selection -->
        <div class="os-form-row">
          <div class="os-form-col">
            <label for="osBucketNameInput">2. Bucket Name <span class="text-danger">*</span></label>
            <input type="text" id="osBucketNameInput" class="os-form-control" placeholder="ex: my-bucket-01 (lowercase, digits, -)">
            <div id="osBucketNameHint" class="os-validation-hint text-muted">3-63 characters, lowercase letters, numbers, and hyphens only.</div>
          </div>
          <div class="os-form-col">
            <label for="osRegionSelect">3. Region / Location <span class="text-danger">*</span></label>
            <select id="osRegionSelect" class="os-form-control">
              <!-- Populated dynamically by updateCreateFormForProvider -->
            </select>
            <div class="os-conn-hint">
              <span>Cloud Connection:</span>
              <span id="osResolvedConnBadge" class="os-badge os-badge-info" style="font-family: monospace; font-size: 11px;">-</span>
            </div>
          </div>
        </div>

        <!-- 3. Description & Options -->
        <div class="os-form-row">
          <div class="os-form-col" style="flex: 2;">
            <label for="osDescriptionInput">Description (Optional)</label>
            <input type="text" id="osDescriptionInput" class="os-form-control" placeholder="Object storage bucket description">
          </div>
          <div class="os-form-col" style="flex: 1; display: flex; align-items: center; padding-top: 18px;">
            <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="osAutoCorsCheckbox" checked>
              <span id="osAutoCorsLabel">Auto-enable CORS for Browser Upload</span>
            </label>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; margin-top: 8px;">
          <button id="osCreateBucketSubmitBtn" class="os-btn os-btn-primary" style="padding: 6px 16px; font-size: 12px; font-weight: 600;">
            <i class="fas fa-cloud-upload-alt"></i> Create Bucket
          </button>
        </div>
      </div>
    </div>

    <!-- Buckets List Table -->
    <div class="os-card" style="margin-bottom: 0;">
      <h6>
        <span><i class="fas fa-list text-secondary"></i> Existing Buckets</span>
        <input type="text" id="osBucketSearchInput" placeholder="🔍 Search buckets..." style="padding: 2px 8px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px; width: 180px;">
      </h6>
      <div class="os-table-container">
        <table class="os-table" id="osBucketsTable">
          <thead>
            <tr>
              <th>Bucket Name / ID</th>
              <th>Cloud Provider & Connection</th>
              <th>Status</th>
              <th>Created Date</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody id="osBucketsTableBody">
            ${renderBucketRows(osState.bucketList)}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Attach event handlers for Bucket List View
  setupBucketViewEvents();
}

function renderBucketRows(buckets) {
  if (!buckets || buckets.length === 0) {
    return `
      <tr>
        <td colspan="5" style="text-align: center; color: #94a3b8; padding: 24px;">
          <i class="fas fa-box-open fa-2x mb-2" style="display: block; opacity: 0.5;"></i>
          No object storage buckets found in namespace <b>${escapeHtml(osState.namespace)}</b>.<br>
          Create one above to get started!
        </td>
      </tr>
    `;
  }

  return buckets.map(b => {
    const bId = escapeHtml(b.id || b.name || '');
    const conn = escapeHtml(b.connectionName || '');
    const provider = (b.connectionConfig?.providerName || (b.connectionName ? b.connectionName.split('-')[0] : '')).toLowerCase();
    const provMeta = getProviderMetadata(provider);
    const status = b.status || 'Available';
    const statusClass = status === 'Available' ? 'os-badge-success' : (status === 'Failed' ? 'os-badge-danger' : 'os-badge-warning');
    const created = escapeHtml(b.creationDate || (b.conditions && b.conditions[0]?.lastTransitionTime ? b.conditions[0].lastTransitionTime.split('T')[0] : '-'));
    const errMsg = escapeHtml(b.systemMessage || '');

    return `
      <tr data-bucket-id="${bId}">
        <td>
          <a href="javascript:void(0)" class="os-open-bucket" data-id="${bId}" style="font-weight: 600; color: #2563eb; text-decoration: none;">
            📁 ${bId}
          </a>
          ${b.description ? `<div style="font-size: 11px; color: #64748b;">${escapeHtml(b.description)}</div>` : ''}
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 6px;">
            <img src="${provMeta.icon}" class="os-csp-logo" onerror="this.src='/img/circle.png';" style="width: 16px; height: 16px;">
            <span style="font-weight: 600; font-size: 12px;">${escapeHtml(provMeta.name)}</span>
          </div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
            <span class="os-badge os-badge-secondary" style="font-family: monospace; font-size: 10px;">${conn}</span>
          </div>
        </td>
        <td>
          <span class="os-badge ${statusClass}" ${errMsg ? `title="${errMsg}" style="cursor:help;"` : ''}>
            ${escapeHtml(status)} ${errMsg ? '⚠️' : ''}
          </span>
        </td>
        <td style="color: #64748b;">${created}</td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="os-btn os-btn-primary os-btn-explore" data-id="${bId}" title="Browse and upload/download objects">
            <i class="fas fa-folder-open"></i> Explore
          </button>
          <button class="os-btn os-btn-secondary os-btn-cors" data-id="${bId}" title="Set CORS rules for web access">
            <i class="fas fa-shield-alt"></i> CORS
          </button>
          <button class="os-btn os-btn-danger os-btn-delete" data-id="${bId}" title="Delete bucket">
            <i class="fas fa-trash-alt"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function updateCreateFormForProvider(provider) {
  const providerMap = groupConnectionsByProvider(osState.connections);
  const conns = sortConnections(providerMap[provider] || []);
  const meta = getProviderMetadata(provider);
  const supports = osState.supportMatrix[provider] || {};

  // 1. Update Info Box
  const infoBox = document.getElementById('osCspInfoBox');
  if (infoBox) {
    const corsBadge = supports.cors
      ? '<span class="os-badge os-badge-success">✓ CORS</span>'
      : '<span class="os-badge os-badge-secondary" title="API does not support CORS configuration">✗ CORS</span>';
    const versBadge = supports.versioning
      ? '<span class="os-badge os-badge-success">✓ Versioning</span>'
      : '<span class="os-badge os-badge-secondary">✗ Versioning</span>';
    const presignBadge = supports.presignedUrl !== false
      ? '<span class="os-badge os-badge-success">✓ Presigned URL</span>'
      : '<span class="os-badge os-badge-secondary">✗ Presigned URL</span>';

    let tip = '';
    if (provider === 'tencent') {
      tip = '<span style="color:#b45309; font-size:11px;">💡 Tencent COS: Bucket names typically follow <code>name-appid</code> (e.g. test-1250000000).</span>';
    } else if (provider === 'ncp') {
      tip = '<span style="color:#0369a1; font-size:11px;">ℹ️ NCP: Standard S3 API. CORS is managed via NCP console.</span>';
    }

    infoBox.innerHTML = `
      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
        <strong>${escapeHtml(meta.name)} Features:</strong>
        ${corsBadge} ${versBadge} ${presignBadge}
      </div>
      ${tip ? `<div>${tip}</div>` : ''}
    `;
  }

  // 2. Update Region Dropdown
  const regionSelect = document.getElementById('osRegionSelect');
  const badge = document.getElementById('osResolvedConnBadge');
  if (regionSelect) {
    if (conns.length === 0) {
      regionSelect.innerHTML = '<option value="">No connections configured for this CSP</option>';
      if (badge) badge.innerText = '-';
    } else {
      regionSelect.innerHTML = conns.map(c => `
        <option value="${escapeHtml(c.configName)}">${escapeHtml(getRegionDisplay(c))}</option>
      `).join('');
      if (badge) badge.innerText = regionSelect.value;
    }
  }

  // 3. Update Auto-CORS checkbox
  const corsCheck = document.getElementById('osAutoCorsCheckbox');
  const corsLabel = document.getElementById('osAutoCorsLabel');
  if (corsCheck && corsLabel) {
    if (supports.cors === false) {
      corsCheck.checked = false;
      corsCheck.disabled = true;
      corsLabel.innerText = `Auto-enable CORS (${meta.name} API does not support CORS)`;
      corsLabel.style.color = '#94a3b8';
    } else {
      corsCheck.disabled = false;
      corsCheck.checked = true;
      corsLabel.innerText = 'Auto-enable CORS for Browser Upload';
      corsLabel.style.color = '#334155';
    }
  }

  // 4. Update Submit Button
  const submitBtn = document.getElementById('osCreateBucketSubmitBtn');
  if (submitBtn) {
    submitBtn.innerHTML = `<i class="fas fa-cloud-upload-alt"></i> Create Bucket on ${escapeHtml(meta.name)}`;
  }
}

function setupBucketViewEvents() {
  // Update create form with currently selected provider
  updateCreateFormForProvider(osState.selectedProvider);

  // CSP Tile Selection Events
  const cspTiles = document.querySelectorAll('.os-csp-tile');
  cspTiles.forEach(tile => {
    tile.addEventListener('click', () => {
      const p = tile.getAttribute('data-provider');
      if (!p) return;
      osState.selectedProvider = p;
      cspTiles.forEach(t => t.classList.remove('active'));
      tile.classList.add('active');
      updateCreateFormForProvider(p);
    });
  });

  // Region dropdown change event
  const regionSelect = document.getElementById('osRegionSelect');
  if (regionSelect) {
    regionSelect.addEventListener('change', () => {
      const badge = document.getElementById('osResolvedConnBadge');
      if (badge) badge.innerText = regionSelect.value;
    });
  }

  // Real-time bucket name validation
  const nameInput = document.getElementById('osBucketNameInput');
  const nameHint = document.getElementById('osBucketNameHint');
  if (nameInput && nameHint) {
    nameInput.addEventListener('input', () => {
      const val = nameInput.value.trim();
      if (!val) {
        nameHint.className = 'os-validation-hint text-muted';
        nameHint.innerText = '3-63 characters, lowercase letters, numbers, and hyphens only.';
      } else if (isValidBucketName(val)) {
        nameHint.className = 'os-validation-hint text-success';
        nameHint.innerHTML = '<i class="fas fa-check-circle"></i> Valid bucket name.';
      } else {
        nameHint.className = 'os-validation-hint text-danger';
        nameHint.innerHTML = '<i class="fas fa-times-circle"></i> Must be 3-63 chars, lowercase alphanumeric, and hyphens only (no spaces/caps).';
      }
    });
  }

  // Refresh button
  const refreshBtn = document.getElementById('osRefreshBucketsBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => renderModalView());
  }

  // Toggle Collapse Create Card
  const toggleBtn = document.getElementById('osToggleCreateCardBtn');
  const formBody = document.getElementById('osCreateFormBody');
  if (toggleBtn && formBody) {
    toggleBtn.addEventListener('click', () => {
      if (formBody.style.display === 'none') {
        formBody.style.display = 'block';
        toggleBtn.innerText = 'Collapse';
      } else {
        formBody.style.display = 'none';
        toggleBtn.innerText = 'Expand';
      }
    });
  }

  // Bucket Search Filter
  const searchInput = document.getElementById('osBucketSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const rows = document.querySelectorAll('#osBucketsTableBody tr');
      rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(query) ? '' : 'none';
      });
    });
  }

  // Create Bucket Submit
  const submitBtn = document.getElementById('osCreateBucketSubmitBtn');
  if (submitBtn) {
    submitBtn.addEventListener('click', handleCreateBucket);
  }

  // Table row actions
  const table = document.getElementById('osBucketsTable');
  if (table) {
    table.addEventListener('click', async (e) => {
      const exploreBtn = e.target.closest('.os-btn-explore') || e.target.closest('.os-open-bucket');
      if (exploreBtn) {
        const bucketId = exploreBtn.getAttribute('data-id');
        const matched = osState.bucketList.find(b => b.id === bucketId || b.name === bucketId);
        osState.currentBucket = matched || { id: bucketId, name: bucketId };
        osState.view = 'objects';
        renderModalView();
        return;
      }

      const corsBtn = e.target.closest('.os-btn-cors');
      if (corsBtn) {
        const bucketId = corsBtn.getAttribute('data-id');
        handleConfigureCors(bucketId);
        return;
      }

      const deleteBtn = e.target.closest('.os-btn-delete');
      if (deleteBtn) {
        const bucketId = deleteBtn.getAttribute('data-id');
        handleDeleteBucket(bucketId);
        return;
      }
    });
  }
}

// Handle bucket creation
async function handleCreateBucket() {
  const nameInput = document.getElementById('osBucketNameInput');
  const regionSelect = document.getElementById('osRegionSelect');
  const descInput = document.getElementById('osDescriptionInput');
  const autoCors = document.getElementById('osAutoCorsCheckbox')?.checked ?? false;

  const bucketName = nameInput?.value.trim() || '';
  const connectionName = regionSelect?.value.trim() || '';
  const description = descInput?.value.trim() || '';

  if (!bucketName) {
    showModalNotice('Please provide a bucket name.', 'warning');
    nameInput?.focus();
    return;
  }
  if (!isValidBucketName(bucketName)) {
    showModalNotice('Invalid bucket name. S3 rules require 3–63 lowercase alphanumeric characters or hyphens.', 'warning');
    nameInput?.focus();
    return;
  }
  if (!connectionName) {
    showModalNotice('Please select a cloud provider and region.', 'warning');
    regionSelect?.focus();
    return;
  }

  const submitBtn = document.getElementById('osCreateBucketSubmitBtn');
  const meta = getProviderMetadata(osState.selectedProvider);
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Creating Bucket on ${escapeHtml(meta.name)}...`;
  }

  const config = getConfig();
  try {
    const res = await axios.put(`${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage`, {
      bucketName,
      connectionName,
      description,
    }, {
      auth: { username: config.username, password: config.password },
      headers: { 'Content-Type': 'application/json' },
    });

    // Optionally enable CORS automatically for smooth browser access
    if (autoCors && res.data && res.data.status === 'Available') {
      try {
        await enableDefaultCors(osState.namespace, bucketName);
      } catch (corsErr) {
        console.warn('[ObjectStorage] Auto-CORS warning:', corsErr);
      }
    }

    showModalNotice(`Bucket "${bucketName}" created successfully!`, 'success');
    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';
    await renderModalView();
  } catch (err) {
    console.error('[ObjectStorage] Bucket creation failed:', err);
    const msg = err.response?.data?.message || err.message || 'Bucket creation failed';
    showModalNotice(`Bucket creation failed: ${msg}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      const m = getProviderMetadata(osState.selectedProvider);
      submitBtn.innerHTML = `<i class="fas fa-cloud-upload-alt"></i> Create Bucket on ${escapeHtml(m.name)}`;
    }
  }
}

// Handle bucket deletion
async function handleDeleteBucket(bucketId) {
  const confirmed = await showModalConfirm({
    title: 'Delete Bucket?',
    html: `Are you sure you want to delete bucket <b>${escapeHtml(bucketId)}</b>?<br><small style="color: #dc2626; display: block; margin-top: 8px; font-weight: 500;">Note: The bucket must be empty on the CSP before deletion.</small>`,
    icon: 'danger',
    confirmText: 'Yes, delete bucket',
    confirmButtonClass: 'os-btn-danger',
    cancelText: 'Cancel',
  });

  if (!confirmed) return;

  const config = getConfig();
  const spinnerId = addSpinnerTask(`Deleting bucket ${bucketId}`);
  try {
    await axios.delete(`${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bucketId}`, {
      auth: { username: config.username, password: config.password },
    });
    showModalNotice(`Bucket "${bucketId}" deleted successfully.`, 'success');
    await renderModalView();
  } catch (err) {
    console.error('[ObjectStorage] Delete error:', err);
    const msg = err.response?.data?.message || err.message || 'Deletion failed';
    showModalNotice(`Failed to delete bucket: ${msg}`, 'error');
  } finally {
    removeSpinnerTask(spinnerId);
  }
}

// -------------------------------------------------------------------------------------------------
// VIEW 2: OBJECT (FILE) EXPLORER VIEW
// -------------------------------------------------------------------------------------------------
async function renderObjectExplorerView(container) {
  const b = osState.currentBucket || {};
  const bId = escapeHtml(b.id || b.name || '');
  const conn = escapeHtml(b.connectionName || '');

  container.innerHTML = `
    <!-- Top Explorer Bar -->
    <div class="os-header-bar">
      <div class="os-header-title">
        <button id="osBackToBucketsBtn" class="os-btn os-btn-secondary" style="font-weight: 600;">
          <i class="fas fa-arrow-left"></i> Buckets
        </button>
        <span>📁 <b>${bId}</b></span>
        ${conn ? `<span class="os-badge os-badge-secondary">${conn}</span>` : ''}
      </div>
      <div style="display: flex; gap: 6px;">
        <button id="osEnableCorsBtn" class="os-btn os-btn-secondary" title="Ensure CORS is enabled on this bucket">
          <i class="fas fa-globe"></i> Setup CORS
        </button>
        <button id="osRefreshObjectsBtn" class="os-btn os-btn-secondary" title="Refresh object list">
          <i class="fas fa-sync-alt"></i> Refresh
        </button>
      </div>
    </div>

    <!-- Drag & Drop Upload Zone -->
    <div class="os-card">
      <div id="osDropzone" class="os-dropzone">
        <i class="fas fa-cloud-upload-alt fa-2x text-primary" style="margin-bottom: 6px;"></i>
        <div style="font-weight: 600; font-size: 13px;">Drag & Drop files here, or <span style="color:#2563eb; text-decoration:underline;">Browse</span></div>
        <div class="text-muted" style="font-size: 11px; margin-top: 2px;">Direct upload to Cloud Storage via secure Presigned URL</div>
        <input type="file" id="osFileInput" style="display: none;">
      </div>
      <!-- Progress Bar (Hidden initially) -->
      <div id="osUploadProgressContainer" style="display: none;">
        <div style="display: flex; justify-content: space-between; font-size: 11px; color: #475569;">
          <span id="osUploadFileName">Uploading file...</span>
          <span id="osUploadPercentage">0%</span>
        </div>
        <div class="os-progress-bar">
          <div id="osProgressFill" class="os-progress-fill"></div>
        </div>
      </div>
    </div>

    <!-- Objects List Card -->
    <div class="os-card" style="margin-bottom: 0;">
      <h6>
        <span><i class="fas fa-file-alt text-secondary"></i> Objects / Files</span>
        <input type="text" id="osObjectSearchInput" placeholder="🔍 Search files..." style="padding: 2px 8px; font-size: 11px; border: 1px solid #cbd5e1; border-radius: 4px; width: 180px;">
      </h6>
      <div class="os-table-container">
        <table class="os-table" id="osObjectsTable">
          <thead>
            <tr>
              <th>File Name (Key)</th>
              <th>Size</th>
              <th>Storage Class</th>
              <th>Last Modified</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody id="osObjectsTableBody">
            <tr><td colspan="5" style="text-align: center; padding: 20px; color:#94a3b8;"><i class="fas fa-circle-notch fa-spin"></i> Loading objects...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  setupObjectViewEvents();
  await loadObjectsList(b.id || b.name);
}

async function loadObjectsList(bucketId) {
  const tbody = document.getElementById('osObjectsTableBody');
  if (!tbody) return;

  const config = getConfig();
  try {
    const res = await axios.get(`${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bucketId}/object`, {
      auth: { username: config.username, password: config.password },
    });
    osState.objectList = (res.data && res.data.objects) ? res.data.objects : [];
  } catch (err) {
    console.error('[ObjectStorage] Load objects error:', err);
    osState.objectList = [];
  }

  tbody.innerHTML = renderObjectRows(osState.objectList);
}

function renderObjectRows(objects) {
  if (!objects || objects.length === 0) {
    return `
      <tr>
        <td colspan="5" style="text-align: center; color: #94a3b8; padding: 24px;">
          <i class="fas fa-folder-open fa-2x mb-2" style="display: block; opacity: 0.5;"></i>
          No files in this bucket yet.<br>
          Drag and drop a file above to upload!
        </td>
      </tr>
    `;
  }

  return objects.map(o => {
    const key = escapeHtml(o.key || '');
    const size = formatBytes(o.size);
    const storageClass = escapeHtml(o.storageClass || 'STANDARD');
    const lastMod = o.lastModified ? escapeHtml(o.lastModified.replace('T', ' ').replace('Z', '')) : '-';

    return `
      <tr data-key="${key}">
        <td>
          <i class="far fa-file-alt text-primary" style="margin-right: 5px;"></i>
          <b>${key}</b>
        </td>
        <td><span class="os-badge os-badge-secondary">${size}</span></td>
        <td><span class="os-badge os-badge-info">${storageClass}</span></td>
        <td style="color: #64748b;">${lastMod}</td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="os-btn os-btn-primary os-btn-download" data-key="${key}" title="Download file via Presigned URL">
            <i class="fas fa-download"></i> Download
          </button>
          <button class="os-btn os-btn-danger os-btn-delete-object" data-key="${key}" title="Delete file">
            <i class="fas fa-trash-alt"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function setupObjectViewEvents() {
  const bucketId = osState.currentBucket?.id || osState.currentBucket?.name;

  // Back to Buckets
  const backBtn = document.getElementById('osBackToBucketsBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      osState.view = 'buckets';
      renderModalView();
    });
  }

  // Refresh Objects
  const refreshBtn = document.getElementById('osRefreshObjectsBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadObjectsList(bucketId));
  }

  // Setup CORS Button
  const corsBtn = document.getElementById('osEnableCorsBtn');
  if (corsBtn) {
    corsBtn.addEventListener('click', () => handleConfigureCors(bucketId));
  }

  // Object Search Filter
  const searchInput = document.getElementById('osObjectSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const rows = document.querySelectorAll('#osObjectsTableBody tr');
      rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(query) ? '' : 'none';
      });
    });
  }

  // Drag & Drop Zone and File Input
  const dropzone = document.getElementById('osDropzone');
  const fileInput = document.getElementById('osFileInput');
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer?.files?.length > 0) {
        uploadFileToBucket(e.dataTransfer.files[0], bucketId);
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files?.length > 0) {
        uploadFileToBucket(fileInput.files[0], bucketId);
      }
    });
  }

  // Download & Delete Actions
  const table = document.getElementById('osObjectsTable');
  if (table) {
    table.addEventListener('click', async (e) => {
      const downloadBtn = e.target.closest('.os-btn-download');
      if (downloadBtn) {
        const key = downloadBtn.getAttribute('data-key');
        handleDownloadObject(bucketId, key);
        return;
      }

      const deleteBtn = e.target.closest('.os-btn-delete-object');
      if (deleteBtn) {
        const key = deleteBtn.getAttribute('data-key');
        handleDeleteObject(bucketId, key);
        return;
      }
    });
  }
}

// Upload file using Presigned URL
async function uploadFileToBucket(file, bucketId) {
  if (!file) return;

  const objectKey = file.name;
  const progressContainer = document.getElementById('osUploadProgressContainer');
  const fileNameLabel = document.getElementById('osUploadFileName');
  const percentLabel = document.getElementById('osUploadPercentage');
  const progressFill = document.getElementById('osProgressFill');

  if (progressContainer) progressContainer.style.display = 'block';
  if (fileNameLabel) fileNameLabel.innerText = `Uploading ${file.name} (${formatBytes(file.size)})...`;
  if (percentLabel) percentLabel.innerText = '0%';
  if (progressFill) progressFill.style.width = '0%';

  const config = getConfig();
  try {
    // 1. Request presigned upload URL from Tumblebug
    const urlRes = await axios.post(
      `${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bucketId}/object/${encodeURIComponent(objectKey)}/presignedUrl?operation=upload&expires=3600`,
      {},
      { auth: { username: config.username, password: config.password } }
    );

    const presignedURL = urlRes.data?.presignedURL;
    if (!presignedURL) {
      throw new Error('Did not receive a presigned URL from server');
    }

    // 2. Perform direct binary PUT upload to the CSP
    await axios.put(presignedURL, file, {
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          if (percentLabel) percentLabel.innerText = `${percent}%`;
          if (progressFill) progressFill.style.width = `${percent}%`;
        }
      },
    });

    showModalNotice(`File "${file.name}" uploaded successfully!`, 'success');
    await loadObjectsList(bucketId);
  } catch (err) {
    console.error('[ObjectStorage] Upload failed:', err);
    // Helpful diagnostic for CORS / CSP issues
    if (err.message && (err.message.includes('Network Error') || err.message.includes('CORS'))) {
      const askCors = await showModalConfirm({
        title: 'Upload Blocked (CORS)',
        html: `Browser direct upload was blocked by CSP CORS policy.<br><small class="text-muted" style="display:block; margin-top:6px;">Would you like to auto-configure CORS rules on bucket <b>${escapeHtml(bucketId)}</b> and retry?</small>`,
        icon: 'warning',
        confirmText: '🌐 Enable CORS & Retry',
        confirmButtonClass: 'os-btn-primary',
        cancelText: 'Cancel',
      });
      if (askCors) {
        try {
          await enableDefaultCors(osState.namespace, bucketId);
          showModalNotice('CORS enabled! Please retry uploading the file.', 'success');
        } catch (corsErr) {
          showModalNotice(`Failed to enable CORS: ${corsErr.message}`, 'error');
        }
      }
    } else {
      showModalNotice(`Upload failed: ${err.response?.data?.message || err.message}`, 'error');
    }
  } finally {
    if (progressContainer) progressContainer.style.display = 'none';
    const fileInput = document.getElementById('osFileInput');
    if (fileInput) fileInput.value = '';
  }
}

// Download object via Presigned URL
async function handleDownloadObject(bucketId, objectKey) {
  const config = getConfig();
  try {
    const res = await axios.post(
      `${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bucketId}/object/${encodeURIComponent(objectKey)}/presignedUrl?operation=download&expires=3600`,
      {},
      { auth: { username: config.username, password: config.password } }
    );

    const downloadUrl = res.data?.presignedURL;
    if (!downloadUrl) throw new Error('Failed to generate download URL');

    // Trigger direct browser download via hidden anchor (avoids CORS restrictions)
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = objectKey;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('[ObjectStorage] Download error:', err);
    showModalNotice(`Download failed: ${err.response?.data?.message || err.message}`, 'error');
  }
}

// Delete object
async function handleDeleteObject(bucketId, objectKey) {
  const confirmed = await showModalConfirm({
    title: 'Delete File?',
    html: `Are you sure you want to delete file "<b>${escapeHtml(objectKey)}</b>"?`,
    icon: 'danger',
    confirmText: 'Yes, delete file',
    confirmButtonClass: 'os-btn-danger',
    cancelText: 'Cancel',
  });

  if (!confirmed) return;

  const config = getConfig();
  try {
    await axios.delete(
      `${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bucketId}/object/${encodeURIComponent(objectKey)}`,
      { auth: { username: config.username, password: config.password } }
    );
    showModalNotice(`Object "${objectKey}" deleted.`, 'success');
    await loadObjectsList(bucketId);
  } catch (err) {
    console.error('[ObjectStorage] Object deletion failed:', err);
    showModalNotice(`Failed to delete object: ${err.response?.data?.message || err.message}`, 'error');
  }
}

// Helper: Enable default CORS for a bucket
export async function enableDefaultCors(nsId, osId) {
  const config = getConfig();
  const corsPayload = {
    corsRule: [
      {
        allowedMethod: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
        allowedOrigin: ['*'],
        allowedHeader: ['*'],
        exposeHeader: ['ETag', 'x-amz-request-id', 'Content-Length'],
        maxAgeSeconds: 3000,
      }
    ]
  };

  return await axios.put(
    `${tbApiBase()}/ns/${nsId}/resources/objectStorage/${osId}/cors`,
    corsPayload,
    {
      auth: { username: config.username, password: config.password },
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

// Helper: Configure CORS Dialog
async function handleConfigureCors(bucketId) {
  const config = getConfig();
  let currentRules = [];

  try {
    const res = await axios.get(`${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bucketId}/cors`, {
      auth: { username: config.username, password: config.password },
    });
    currentRules = res.data?.corsRule || [];
  } catch (err) {
    console.log('No CORS configured yet or CORS fetch error');
  }

  const action = await showModalCorsDialog(bucketId, currentRules);
  if (action === 'apply') {
    try {
      await enableDefaultCors(osState.namespace, bucketId);
      showModalNotice('Default CORS rules applied successfully.', 'success');
    } catch (err) {
      showModalNotice(`Failed to set CORS: ${err.response?.data?.message || err.message}`, 'error');
    }
  } else if (action === 'delete') {
    try {
      await axios.delete(`${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bucketId}/cors`, {
        auth: { username: config.username, password: config.password },
      });
      showModalNotice('CORS rules removed.', 'success');
    } catch (err) {
      showModalNotice(`Failed to remove CORS: ${err.response?.data?.message || err.message}`, 'error');
    }
  }
}

// Expose globally for index.html and other modules
window.showObjectStorageModal = showObjectStorageModal;
