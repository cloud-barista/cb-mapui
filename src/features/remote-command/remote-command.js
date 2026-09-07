/**
 * Remote Command Execution, SSE Streaming & File Transfer Module
 * @module features/remote-command
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import JSZip from 'jszip';
import runtimeParams from '../../../runtime-params.json';
import { tbApiBase, getConfig } from '../../core/api.js';
import { escapeHtml } from '../../core/utils.js';

import { POPUP_STYLES } from '../../common/popup-styles.js';

const addPhaseBlock = (...args) => (window.addPhaseBlock ? window.addPhaseBlock(...args) : undefined);
const updateSelectedLabelsDisplay = (...args) => (window.updateSelectedLabelsDisplay ? window.updateSelectedLabelsDisplay(...args) : undefined);
const updateLabelMatchPreview = (...args) => (window.updateLabelMatchPreview ? window.updateLabelMatchPreview(...args) : undefined);
const updateAvailableLabelChipStyles = (...args) => (window.updateAvailableLabelChipStyles ? window.updateAvailableLabelChipStyles(...args) : undefined);
const updateAvailableLabels = (...args) => (window.updateAvailableLabels ? window.updateAvailableLabels(...args) : undefined);
const extractLabelsFromInfra = (...args) => (window.extractLabelsFromInfra ? window.extractLabelsFromInfra(...args) : { labels: {}, ndCount: 0, nodes: [] });
const setupLabelChipEventListeners = (...args) => (window.setupLabelChipEventListeners ? window.setupLabelChipEventListeners(...args) : undefined);
const setupCommandsPopup = (...args) => (window.setupCommandsPopup ? window.setupCommandsPopup(...args) : undefined);
const setupInfraSelectorForLabels = (...args) => (window.setupInfraSelectorForLabels ? window.setupInfraSelectorForLabels(...args) : undefined);
const setupClearLabelButtonListener = (...args) => (window.setupClearLabelButtonListener ? window.setupClearLabelButtonListener(...args) : undefined);
const collectCommands = (...args) => (window.collectCommands ? window.collectCommands(...args) : []);
const autoResizeTextarea = (...args) => (window.autoResizeTextarea ? window.autoResizeTextarea(...args) : undefined);
const setDefaultRemoteCommandsByApp = (...args) => (window.setDefaultRemoteCommandsByApp ? window.setDefaultRemoteCommandsByApp(...args) : undefined);
const displayAccessInfoGui = (...args) => (window.displayAccessInfoGui ? window.displayAccessInfoGui(...args) : undefined);
const buildPostCommandStatusHtml = (...args) => (window.buildPostCommandStatusHtml ? window.buildPostCommandStatusHtml(...args) : '');
const errorAlert = (msg) => (window.errorAlert ? window.errorAlert(msg) : Swal.fire({ icon: 'error', title: msg, showConfirmButton: true }));
const displayJsonData = (...args) => { if (window.displayJsonData) window.displayJsonData(...args); };
const typeInfo = window.typeInfo || 'info';
const getSelectedInfraId = () => (window.getSelectedInfraId ? window.getSelectedInfraId() : (document.getElementById('infraid')?.value || null));
const getNodeGroupIdFromNodeSelection = () => (window.getNodeGroupIdFromNodeSelection ? window.getNodeGroupIdFromNodeSelection() : '');
const generateRandomRequestId = (prefix, len) => (window.generateRandomRequestId ? window.generateRandomRequestId(prefix, len) : (prefix + Math.random().toString(36).substring(2, 2 + len)));
const addRequestIdToSelect = (id) => { if (window.addRequestIdToSelect) window.addRequestIdToSelect(id); };

const defaultRemoteCommand = new Proxy([], {
  get: (target, prop) => (window.defaultRemoteCommand || [])[prop],
  set: (target, prop, val) => {
    if (!window.defaultRemoteCommand) window.defaultRemoteCommand = [];
    window.defaultRemoteCommand[prop] = val;
    return true;
  }
});

const defaultRemoteCommandTimeout = {
  valueOf: () => (window.defaultRemoteCommandTimeout || 0),
  toString: () => String(window.defaultRemoteCommandTimeout || 0),
  [Symbol.toPrimitive]: (hint) => (hint === 'string' ? String(window.defaultRemoteCommandTimeout || 0) : Number(window.defaultRemoteCommandTimeout || 0))
};

const infraidElement = new Proxy({}, {
  get: (target, prop) => (window.infraidElement || document.getElementById('infraid') || {})[prop]
});

// Helper aliases for spinner functions
const addSpinnerTask = (name) => (window.addSpinnerTask ? window.addSpinnerTask(name) : name);
const removeSpinnerTask = (id) => { if (window.removeSpinnerTask) window.removeSpinnerTask(id); };

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
  'REPLICA_COUNT': {
    description: 'Number of pod replicas',
    hint: '3',
    secret: false,
  },
  'REGISTRY_WEB_REPLICAS': {
    description: 'Registry web replica count (scale-out demo)',
    hint: '30',
    secret: false,
  },
  'K8S_CNI': {
    description: 'CNI plugin — empty/flannel (default) or cilium (enables the optional Hubble UI step)',
    hint: 'flannel',
    secret: false,
  },
  'K8S_EXTERNAL_IP': {
    description: 'Externally reachable API server address (IP or DNS) — added to the cert SAN and written into the kubeconfig',
    hint: '15.161.132.237',
    secret: false,
  },
  'K8S_API_PORT': {
    description: 'External API server port — must be forwarded to :6443 on the control plane',
    hint: '6443',
    default: '6443',
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
  // Hermes Agent
  'HERMES_API_KEY': {
    description: 'Hermes API key (leave blank to auto-generate)',
    hint: '',
    secret: true,
  },
  'VLLM_VERSION': {
    description: 'vLLM version to install (leave blank for latest)',
    hint: '',
    default: '',
    secret: false,
  },
  // Hermes Agent uses vLLM — same VRAM rules as VLLM_MODEL.
  // CTX_LEN default 65536 adds significant KV cache; prefer smaller models on 24 GB.
  // Best for agents: Qwen2.5/3 (tool calling), Llama3.1/3.3 (built-in tool use), Phi-4-mini (compact agent).
  'HERMES_MODEL': {
    description: 'LLM model for Hermes Agent (served via vLLM — pick a model that fits your GPU VRAM)',
    hint: 'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8',
    default: 'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8',
    secret: false,
    refs: [
      { label: 'HuggingFace Models', url: 'https://huggingface.co/models?pipeline_tag=text-generation&sort=downloads' }
    ],
    presets: [
      // ── 24 GB · L4 (Ampere, BF16 only) 
      { label: '24GB · Phi-4-mini      (BF16≈8GB)',        value: 'microsoft/Phi-4-mini-instruct' },
      { label: '24GB · Qwen3-8B        (BF16≈16GB)',       value: 'Qwen/Qwen3-8B' },
      { label: '24GB · Qwen2.5-7B      (BF16≈14GB)',       value: 'Qwen/Qwen2.5-7B-Instruct' },
      // ── 24 GB · L40S (Ada Lovelace, FP8 supported) 
      { label: '24GB · Qwen2.5-14B     (FP8≈14GB, L40S)',  value: 'Qwen/Qwen2.5-14B-Instruct' },
      { label: '24GB · Qwen3-14B       (FP8≈14GB, L40S)',  value: 'Qwen/Qwen3-14B' },
      // ── 80 GB · A100 / H100 ──
      { label: '80GB · Qwen3-30B-A3B   (FP8≈30GB)',        value: 'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8' },
      { label: '80GB · Qwen2.5-32B     (FP8≈32GB)',        value: 'Qwen/Qwen2.5-32B-Instruct' },
      { label: '80GB · Llama3.3-70B    (FP8≈70GB, H100)',  value: 'meta-llama/Llama-3.3-70B-Instruct' },
      { label: '80GB · Qwen2.5-72B     (FP8≈72GB, H100)',  value: 'Qwen/Qwen2.5-72B-Instruct' }
    ]
  },
  'CTX_LEN': {
    description: 'Max context length (tokens). Larger = more KV cache VRAM. GQA models (Qwen2.5/3, Llama3) are efficient; non-GQA models cost more.',
    hint: '65536',
    default: '65536',
    secret: false,
    presets: [
      { label: '8K  · test / very tight 24GB',  value: '8192' },
      { label: '16K · 24GB conservative',        value: '16384' },
      { label: '32K · 24GB recommended',         value: '32768' },
      { label: '64K · 80GB recommended',         value: '65536' },
      { label: '128K · H100 large context',      value: '131072' }
    ]
  },
  'DISCORD_TOKEN': {
    description: 'Discord bot token',
    hint: 'your-discord-bot-token',
    secret: true,
  },
  'DISCORD_HOME_CHANNEL': {
    description: 'Discord home channel ID',
    hint: '1509132101184913488',
    default: '1509132101184913488',
    secret: false,
  },
  'DISCORD_HOME_CHANNEL_NAME': {
    description: 'Discord home channel name',
    hint: 'hermes-bot',
    default: 'hermes-bot',
    secret: false,
  },
  'NTFY_TOPIC': {
    description: 'ntfy notification topic',
    hint: 'etri-son-hermes-agent',
    default: 'etri-son-hermes-agent',
    secret: false,
  },
  'TAVILY_API_KEY': {
    description: 'Tavily search API key',
    hint: 'tvly-xxxxxxxxxxxxxxxx',
    secret: true,
  },
  // vLLM — VRAM guide: BF16 ≈ 2 GB/B · FP8 ≈ 1 GB/B
  // L4 (Ampere 24GB): BF16 only → ≤12B safe  |  L40S (Ada 48GB): FP8 → ≤40B
  // A100 80GB: BF16 ≤40B  |  H100 80GB: FP8 W8A8 → ≤72B single card
  // Time-sliced (shared) GPU: divide the budget — 2 models on one L40S ≈ 24GB each
  'VLLM_MODEL': {
    description: 'HuggingFace model name to serve',
    hint: 'meta-llama/Llama-3.1-8B-Instruct',
    default: 'meta-llama/Llama-3.1-8B-Instruct',
    secret: false,
    refs: [
      { label: 'HuggingFace Models', url: 'https://huggingface.co/models?pipeline_tag=text-generation&sort=downloads' }
    ],
    presets: [
      // ── 24 GB L4 · BF16 only (Ampere, ≤12B safe) — 8 presets ──
      { label: '24GB · Phi-4-mini           (BF16≈8GB,  L4)',    value: 'microsoft/Phi-4-mini-instruct' },
      { label: '24GB · Llama3.2-3B          (BF16≈6GB,  L4)',    value: 'meta-llama/Llama-3.2-3B-Instruct' },
      { label: '24GB · Qwen2.5-7B           (BF16≈14GB, L4)',    value: 'Qwen/Qwen2.5-7B-Instruct' },
      { label: '24GB · Mistral-7B           (BF16≈14GB, L4)',    value: 'mistralai/Mistral-7B-Instruct-v0.3' },
      { label: '24GB · Qwen2.5-Coder-7B     (BF16≈14GB, L4)',    value: 'Qwen/Qwen2.5-Coder-7B-Instruct' },
      { label: '24GB · Llama3.1-8B          (BF16≈16GB, L4)',    value: 'meta-llama/Llama-3.1-8B-Instruct' },
      { label: '24GB · Qwen3-8B             (BF16≈16GB, L4)',    value: 'Qwen/Qwen3-8B' },
      { label: '24GB · DeepSeek-R1-8B       (BF16≈16GB, L4)',    value: 'deepseek-ai/DeepSeek-R1-Distill-Llama-8B' },
      // ── 48 GB L40S · FP8 (Ada Lovelace, ≤40B; ≤14B fits a half-sliced GPU) — 10 presets ──
      { label: '48GB · Gemma3-12B           (FP8≈12GB,  L40S)',  value: 'google/gemma-3-12b-it' },
      { label: '48GB · Mistral-Nemo-12B     (FP8≈12GB,  L40S)',  value: 'mistralai/Mistral-Nemo-Instruct-2407' },
      { label: '48GB · Phi-4                (FP8≈14GB,  L40S)',  value: 'microsoft/Phi-4' },
      { label: '48GB · Qwen2.5-14B          (FP8≈14GB,  L40S)',  value: 'Qwen/Qwen2.5-14B-Instruct' },
      { label: '48GB · Qwen3-14B            (FP8≈14GB,  L40S)',  value: 'Qwen/Qwen3-14B' },
      { label: '48GB · DeepSeek-R1-14B      (FP8≈14GB,  L40S)',  value: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B' },
      { label: '48GB · Qwen2.5-Coder-14B    (FP8≈14GB,  L40S)',  value: 'Qwen/Qwen2.5-Coder-14B-Instruct' },
      { label: '48GB · Mistral-Small3.1-24B (FP8≈24GB,  L40S)',  value: 'mistralai/Mistral-Small-3.1-24B-Instruct-2503' },
      { label: '48GB · Qwen3-30B-A3B        (FP8≈30GB,  L40S)',  value: 'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8' },
      { label: '48GB · Qwen2.5-32B          (FP8≈32GB,  L40S)',  value: 'Qwen/Qwen2.5-32B-Instruct' },
      // ── 80 GB A100 · FP8 mid (24-40B, good headroom) — 8 presets ─
      { label: '80GB · Mistral-Small3.1-24B (FP8≈24GB,  A100)',  value: 'mistralai/Mistral-Small-3.1-24B-Instruct-2503' },
      { label: '80GB · Gemma3-27B           (FP8≈27GB,  A100)',  value: 'google/gemma-3-27b-it' },
      { label: '80GB · Qwen3-30B-A3B        (FP8≈30GB,  A100)',  value: 'Qwen/Qwen3-30B-A3B-Instruct-2507-FP8' },
      { label: '80GB · Qwen3-32B            (FP8≈32GB,  A100)',  value: 'Qwen/Qwen3-32B' },
      { label: '80GB · Qwen2.5-32B          (FP8≈32GB,  A100)',  value: 'Qwen/Qwen2.5-32B-Instruct' },
      { label: '80GB · DeepSeek-R1-32B      (FP8≈32GB,  A100)',  value: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B' },
      { label: '80GB · Qwen2.5-Coder-32B    (FP8≈32GB,  A100)',  value: 'Qwen/Qwen2.5-Coder-32B-Instruct' },
      { label: '80GB · Qwen2.5-Math-32B     (FP8≈32GB,  A100)',  value: 'Qwen/Qwen2.5-Math-32B-Instruct' },
      // ── 80 GB H100 · FP8 W8A8 large (70B+) — 8 presets ──
      { label: '80GB · Llama3.3-70B         (FP8≈70GB,  H100)',  value: 'meta-llama/Llama-3.3-70B-Instruct' },
      { label: '80GB · Llama3.1-70B         (FP8≈70GB,  H100)',  value: 'meta-llama/Llama-3.1-70B-Instruct' },
      { label: '80GB · Qwen3-72B            (FP8≈72GB,  H100)',  value: 'Qwen/Qwen3-72B' },
      { label: '80GB · Qwen2.5-72B          (FP8≈72GB,  H100)',  value: 'Qwen/Qwen2.5-72B-Instruct' },
      { label: '80GB · DeepSeek-R1-70B      (FP8≈70GB,  H100)',  value: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B' },
      { label: '80GB · Qwen2.5-Coder-72B    (FP8≈72GB,  H100)',  value: 'Qwen/Qwen2.5-Coder-72B-Instruct' },
      { label: '80GB · Qwen2.5-Math-72B     (FP8≈72GB,  H100)',  value: 'Qwen/Qwen2.5-Math-72B-Instruct' },
      { label: '80GB · Mixtral-8x7B         (FP8≈47GB,  H100)',  value: 'mistralai/Mixtral-8x7B-Instruct-v0.1' }
    ]
  },
  'VLLM_HF_TOKEN': {
    description: 'HuggingFace token for gated models (leave blank for public models)',
    hint: 'hf_xxxxxxxxxxxxxxxx',
    default: '',
    secret: true,
  },
  'VLLM_GPU_UTIL': {
    description: 'GPU memory utilization fraction 0.0–1.0 (leave blank for vLLM default)',
    hint: '0.9',
    default: '',
    secret: false,
  },
  'VLLM_CTX_LEN': {
    description: 'Max context length (--max-model-len). Leave blank for model default. Larger = more KV cache VRAM.',
    hint: '8192',
    default: '',
    secret: false,
    presets: [
      { label: '8K  · 24GB safe',         value: '8192' },
      { label: '16K · 24GB balanced',     value: '16384' },
      { label: '32K · 24GB / 80GB',       value: '32768' },
      { label: '64K · 80GB recommended',  value: '65536' },
      { label: '128K · H100 large',       value: '131072' }
    ]
  },
  'VLLM_ISVC_NAME': {
    description: 'InferenceService name — use a unique name (llm2, llm3, ...) to ADD a model instead of replacing',
    hint: 'llm',
    default: 'llm',
    secret: false,
    presets: [
      { label: 'llm  (1st model, port 30800)', value: 'llm' },
      { label: 'llm2 (2nd model, port 30801)', value: 'llm2' },
      { label: 'llm3 (3rd model, port 30802)', value: 'llm3' },
      { label: 'llm4 (4th model, port 30803)', value: 'llm4' }
    ]
  },
  'VLLM_NODEPORT': {
    description: 'NodePort for this model\'s OpenAI API (unique per model; allow in the Security Group)',
    hint: '30800',
    default: '30800',
    secret: false,
    presets: [
      { label: '30800 (llm)',  value: '30800' },
      { label: '30801 (llm2)', value: '30801' },
      { label: '30802 (llm3)', value: '30802' },
      { label: '30803 (llm4)', value: '30803' }
    ]
  },
  'GPU_TIMESLICE_REPLICAS': {
    description: 'Pods per physical GPU (time-slicing; no VRAM isolation — cap each model with GPU_UTIL)',
    hint: '2',
    default: '2',
    secret: false,
  },
  'GPU_TIMESLICE_NODE': {
    description: 'Node name to time-slice (blank = all GPU nodes; set on mixed clusters, e.g. slice only the L40S node)',
    hint: 'mc-xxx-g1-1',
    default: '',
    secret: false,
  },
  'VLLM_TARGET_NODE': {
    description: 'Pin this model to a node (blank = scheduler decides; set on mixed GPU types)',
    hint: 'mc-xxx-g1-1',
    default: '',
    secret: false,
  },
  'MIG_PROFILE': {
    description: 'MIG profile (A100/H100 only) — each slice is an isolated GPU; no GPU_UTIL needed',
    hint: 'all-3g.40gb',
    default: 'all-3g.40gb',
    secret: false,
    presets: [
      { label: '80GB · all-3g.40gb (2 slices x 40GB, ≤32B FP8 each)', value: 'all-3g.40gb' },
      { label: '80GB · all-2g.20gb (3 slices x 20GB, ≤14B FP8 each)', value: 'all-2g.20gb' },
      { label: '80GB · all-1g.10gb (7 slices x 10GB, ≤8B FP8 each)',  value: 'all-1g.10gb' },
      { label: 'Disable MIG (restore full GPUs)',                     value: 'all-disabled' }
    ]
  },
  // GuideLLM Benchmark
  'GUIDELLM_PROFILE': {
    description: 'Benchmark profile (throughput, concurrent, constant, poisson, sweep, synchronous). Ignored when a concurrency sweep is set',
    hint: 'throughput',
    default: 'throughput',
    secret: false,
  },
  'GUIDELLM_MAX_SECONDS': {
    description: 'Duration per target in seconds (per step when sweeping)',
    hint: '180',
    default: '180',
    secret: false,
  },
  'GUIDELLM_RATE': {
    description: 'Load level per profile: throughput=max concurrency (default 32), concurrent=streams, constant/poisson=req/s, sweep=step count. Comma list runs one step per value',
    hint: '',
    default: '',
    secret: false,
  },
  'GUIDELLM_CONCURRENCY_SWEEP': {
    description: 'Concurrency sweep START:END:STEP (e.g. 10:150:10). Runs each step for MAX_SECONDS and writes a summary CSV (TTFT/TPOT/ITL per concurrency, per node)',
    hint: '10:150:10',
    default: '',
    secret: false,
    presets: [
      { label: 'quick  · 10,20,30 (3 steps)',        value: '10:30:10' },
      { label: 'medium · 10..100 step 10 (10 steps)', value: '10:100:10' },
      { label: 'full   · 10..150 step 10 (15 steps)', value: '10:150:10' }
    ]
  },
  'GUIDELLM_DATA': {
    description: 'Dataset source — HuggingFace dataset ID, or leave blank for synthetic data',
    hint: 'HuggingFaceH4/ultrachat_200k',
    default: 'HuggingFaceH4/ultrachat_200k',
    secret: false,
  },
  'GUIDELLM_DATA_COLUMN_MAPPER': {
    description: 'Dataset column mapping in JSON (e.g. {"text_column":"prompt"})',
    hint: '{"text_column":"prompt"}',
    default: '{"text_column":"prompt"}',
    secret: false,
  },
  // Ollama — VRAM guide: Q4 ≈ 0.5 GB/B  (8B≈5GB · 14B≈9GB · 32B≈20GB · 70B≈43GB)
  'OLLAMA_MODELS': {
    description: 'Comma-separated list of Ollama models to pull (one per VM via AssignTask)',
    hint: 'llama3.1:8b, qwen2.5:7b, mistral:7b, phi4-mini',
    default: 'llama3.1:8b, qwen2.5:7b, mistral:7b, phi4-mini',
    secret: false,
    refs: [
      { label: 'Ollama Model Library', url: 'https://ollama.com/library' }
    ],
    presets: [
      // ── 24 GB GPU · Tiny 3-4B (~2GB Q4) — 8 models 
      { label: '24GB · 3-4B   (~2GB Q4)',
        value: 'llama3.2:3b, qwen2.5:3b, qwen3:4b, gemma3:4b, phi4-mini, qwen3:1.7b, qwen2.5:1.5b, smollm2:1.7b' },
      // ── 24 GB GPU · General 7-14B (~5-9GB Q4) — 8 models ─
      { label: '24GB · 7-14B  (~5-9GB Q4)',
        value: 'llama3.1:8b, qwen3:8b, qwen2.5:7b, mistral:7b, gemma3:9b, deepseek-r1:8b, qwen2.5:14b, gemma3:12b' },
      // ── 24 GB GPU · Large 22-32B (~14-20GB Q4) — 8 models 
      { label: '24GB · 22-32B (~14-20GB Q4)',
        value: 'deepseek-r1:32b, qwen2.5:32b, qwen3:32b, qwen3-coder:30b, devstral:24b, codestral:22b, gemma3:27b, qwen2.5-coder:32b' },
      // ── 80 GB GPU (A100 / H100) · 70B+ (~43GB Q4) — 8 models ──
      { label: '80GB · 70B+   (~43GB Q4)',
        value: 'llama3.3:70b, llama3.1:70b, qwen2.5:72b, qwen3:72b, deepseek-r1:70b, qwen2.5-coder:72b, mixtral:8x7b, command-r-plus' }
    ]
  },
};

/**
 * Script-level quick reference metadata for scripts that don't use <PLACEHOLDER> parameters.
 */
window.SCRIPT_QUICK_REF = {};

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
      default: meta.default || '',
      refs: meta.refs || [],
      presets: meta.presets || [],
    });
  }
  return placeholders;
};

/**
 * Render placeholder input fields for <PLACEHOLDER> patterns detected in commands.
 *
 * Consolidated mode (when #cmdParamsPanel exists in the DOM):
 *   Scans all commands, deduplicates placeholders, and renders them in one shared
 *   section (#cmdParamsSection / #cmdParamsPanel) placed above the commands area.
 *   The user fills each parameter once; collectCommands() substitutes the value into
 *   every command that contains that placeholder.
 *
 * Inline legacy mode (old popups without #cmdParamsPanel):
 *   Falls back to per-command input panels appended below each textarea.
 */
window.renderPlaceholderInputs = function() {
  const cmdContainer = document.getElementById('cmdContainer');
  if (!cmdContainer) return;

  const paramsSection = document.getElementById('cmdParamsSection');
  const paramsPanel   = document.getElementById('cmdParamsPanel');

  if (paramsPanel) {
    // ── Consolidated mode ──
    // Save existing values by placeholder name
    const savedValues = {};
    paramsPanel.querySelectorAll('.placeholder-input').forEach(input => {
      if (input.value && input.dataset.placeholderName) {
        savedValues[input.dataset.placeholderName] = input.value;
      }
    });
    paramsPanel.innerHTML = '';
    // Remove any stale inline panels
    cmdContainer.querySelectorAll('.placeholder-panel').forEach(p => p.remove());

    // Collect unique placeholders across all commands
    const phMap = {}; // name → { ph, cmdIndices[] }
    cmdContainer.querySelectorAll('[id^="cmdDiv"]').forEach((div, idx) => {
      const ta = document.getElementById(`cmd${idx + 1}`);
      if (!ta) return;
      window.extractPlaceholders(ta.value).forEach(ph => {
        if (!phMap[ph.name]) phMap[ph.name] = { ph, cmdIndices: [] };
        phMap[ph.name].cmdIndices.push(idx + 1);
      });
    });

    if (Object.keys(phMap).length === 0) {
      if (paramsSection) paramsSection.style.display = 'none';
      return;
    }
    if (paramsSection) paramsSection.style.display = '';

    Object.entries(phMap).forEach(([name, { ph, cmdIndices }]) => {
      const inputId = `ph_param_${name}`;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;';

      const label = document.createElement('label');
      label.htmlFor = inputId;
      label.style.cssText = 'min-width:130px; font-weight:600; color:#0d6efd; font-size:0.78rem; white-space:nowrap;';
      label.textContent = (ph.isSecret ? '🔒 ' : '📝 ') + name;

      const input = document.createElement('input');
      input.id = inputId;
      input.type = ph.isSecret ? 'password' : 'text';
      input.className = 'popup-input placeholder-input';
      input.dataset.placeholderName = name;
      input.dataset.fullMatch = ph.fullMatch;
      input.dataset.isSecret = String(ph.isSecret);
      input.placeholder = ph.hint || `Enter ${name.replace(/_/g, ' ').toLowerCase()}`;
      input.style.cssText = 'flex:1; min-width:160px; padding:4px 8px; font-size:0.8rem;';
      // Pre-fill non-secret fields with the hint value as a sensible default;
      // secret fields (tokens, keys) are intentionally left blank.
      if (savedValues[name]) {
        input.value = savedValues[name];
      } else if (window.RUNTIME_PARAM_DEFAULTS[name]) {
        input.value = window.RUNTIME_PARAM_DEFAULTS[name];
      } else if (!ph.isSecret && ph.default) {
        input.value = ph.default;
      }

      row.appendChild(label);
      row.appendChild(input);

      if (ph.isSecret) {
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.textContent = '👁';
        toggleBtn.title = 'Show / hide value';
        toggleBtn.style.cssText = 'padding:2px 8px; border:1px solid #ccc; border-radius:3px; background:#f8f9fa; cursor:pointer; font-size:0.85rem;';
        toggleBtn.onclick = () => {
          input.type = input.type === 'password' ? 'text' : 'password';
          toggleBtn.textContent = input.type === 'password' ? '👁' : '🙈';
        };
        row.appendChild(toggleBtn);
      }

      const meta = document.createElement('span');
      meta.style.cssText = 'font-size:0.68rem; color:#888;';
      const descText = ph.description || '';
      const cmdText  = `cmd ${cmdIndices.join(', ')}`;
      meta.textContent = descText ? `${descText}  •  ${cmdText}` : cmdText;
      row.appendChild(meta);

      // Refs: clickable link badges after description
      if (ph.refs && ph.refs.length > 0) {
        ph.refs.forEach(ref => {
          const a = document.createElement('a');
          a.href = ref.url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.title = ref.label;
          a.style.cssText = 'font-size:0.68rem; color:#0d6efd; text-decoration:none; white-space:nowrap; padding:1px 6px; border:1px solid #b3d7ff; border-radius:8px; background:#f0f7ff;';
          a.textContent = `🔗 ${ref.label}`;
          a.onmouseover = () => { a.style.background = '#cce5ff'; };
          a.onmouseout  = () => { a.style.background = '#f0f7ff'; };
          row.appendChild(a);
        });
      }

      paramsPanel.appendChild(row);

      // Presets: grid of chips that click to fill the input
      if (ph.presets && ph.presets.length > 0) {
        const presetsWrapper = document.createElement('div');
        presetsWrapper.style.cssText = 'margin-bottom:8px; margin-left:138px;';

        const presetsLabel = document.createElement('span');
        presetsLabel.style.cssText = 'font-size:0.65rem; color:#666; display:block; margin-bottom:3px;';
        presetsLabel.textContent = 'Presets:';
        presetsWrapper.appendChild(presetsLabel);

        const presetsGrid = document.createElement('div');
        presetsGrid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:4px;';

        ph.presets.forEach(preset => {
          const val   = typeof preset === 'string' ? preset : preset.value;
          const lbl   = typeof preset === 'string' ? null   : preset.label;
          const chip  = document.createElement('button');
          chip.type = 'button';
          chip.title = 'Click to fill';
          chip.style.cssText = 'padding:4px 8px; border:1px solid #b3d7ff; border-radius:6px; background:#e8f3ff; color:#0056b3; cursor:pointer; font-size:0.68rem; text-align:left; display:flex; flex-direction:column; gap:1px; width:100%;';
          chip.onmouseover = () => { chip.style.background = '#cce5ff'; };
          chip.onmouseout  = () => { chip.style.background = '#e8f3ff'; };
          if (lbl) {
            const ls = document.createElement('span');
            ls.style.cssText = 'font-size:0.62rem; color:#444; font-weight:600;';
            ls.textContent = lbl;
            chip.appendChild(ls);
          }
          const vs = document.createElement('span');
          vs.style.cssText = 'font-family:monospace; font-size:0.68rem; color:#003d80; word-break:break-all; white-space:normal;';
          vs.textContent = val;
          chip.appendChild(vs);
          chip.onclick = () => {
            const inp = document.getElementById(inputId);
            if (inp) { inp.value = val; inp.dispatchEvent(new Event('input')); }
          };
          presetsGrid.appendChild(chip);
        });

        presetsWrapper.appendChild(presetsGrid);
        paramsPanel.appendChild(presetsWrapper);
      }
    });
    return;
  }

  // ── Inline legacy mode (old popups without #cmdParamsPanel) ───
  const savedValues = {};
  cmdContainer.querySelectorAll('.placeholder-panel').forEach(panel => {
    panel.querySelectorAll('.placeholder-input').forEach(input => {
      if (input.value && input.dataset.cmdIndex && input.dataset.placeholderName) {
        const ci = input.dataset.cmdIndex;
        if (!savedValues[ci]) savedValues[ci] = {};
        savedValues[ci][input.dataset.placeholderName] = input.value;
      }
    });
    panel.remove();
  });

  cmdContainer.querySelectorAll('[id^="cmdDiv"]').forEach((div, idx) => {
    const cmdIndex = idx + 1;
    const textarea = document.getElementById(`cmd${cmdIndex}`);
    if (!textarea) return;

    const placeholders = window.extractPlaceholders(textarea.value);
    if (placeholders.length === 0) return;

    const existingValues = savedValues[String(cmdIndex)] || {};
    const panel = document.createElement('div');
    panel.className = 'placeholder-panel';
    panel.style.cssText = 'margin:4px 0 8px 0; padding:8px 12px; background:#f0f7ff; border:1px solid #b3d7ff; border-radius:6px; font-size:0.8rem;';

    placeholders.forEach(ph => {
      const inputId = `ph_cmd${cmdIndex}_${ph.name}`;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:4px;';

      const label = document.createElement('label');
      label.htmlFor = inputId;
      label.style.cssText = 'min-width:100px; font-weight:600; color:#0d6efd; font-size:0.75rem; white-space:nowrap;';
      label.textContent = (ph.isSecret ? '🔒 ' : '📝 ') + ph.name;

      const input = document.createElement('input');
      input.id = inputId;
      input.type = ph.isSecret ? 'password' : 'text';
      input.className = 'popup-input placeholder-input';
      input.dataset.cmdIndex = String(cmdIndex);
      input.dataset.placeholderName = ph.name;
      input.dataset.fullMatch = ph.fullMatch;
      input.dataset.isSecret = String(ph.isSecret);
      input.placeholder = ph.hint || `Enter ${ph.name.replace(/_/g, ' ').toLowerCase()}`;
      input.style.cssText = 'flex:1; padding:4px 8px; font-size:0.8rem; border:1px solid #b3d7ff; border-radius:4px;';
      if (existingValues[ph.name]) {
        input.value = existingValues[ph.name];
      } else if (window.RUNTIME_PARAM_DEFAULTS[ph.name]) {
        input.value = window.RUNTIME_PARAM_DEFAULTS[ph.name];
      } else if (!ph.isSecret && ph.default) {
        input.value = ph.default;
      }

      row.appendChild(label);
      row.appendChild(input);

      if (ph.isSecret) {
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.textContent = '👁';
        toggleBtn.title = 'Toggle visibility';
        toggleBtn.style.cssText = 'padding:2px 6px; border:1px solid #ccc; border-radius:3px; background:#f8f9fa; cursor:pointer; font-size:0.8rem;';
        toggleBtn.onclick = () => {
          input.type = input.type === 'password' ? 'text' : 'password';
          toggleBtn.textContent = input.type === 'password' ? '👁' : '🙈';
        };
        row.appendChild(toggleBtn);
      }

      if (ph.description) {
        const desc = document.createElement('span');
        desc.style.cssText = 'font-size:0.65rem; color:#888; white-space:nowrap;';
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
// ── Shared NodeGroup configuration ──
// Used when adding a NodeGroup to an existing Infra; mirrors the sections of the
// Infra creation flow (identity → labels → spec summary) so both look the same.
window.generateNodeGroupConfigHtml = function (opts = {}) {
  const o = Object.assign({
    infraId: '', nodeGroupName: '', specSummaryHtml: '', totalNodes: 0,
  }, opts);
  const esc = window.escapeHtml || (s => String(s));

  return `
      <div class="popup-section">
        <div class="popup-section-title">🎯 Target Infra</div>
        <div style="font-size:0.82rem; color:#495057;">
          Adding a new NodeGroup to <b>${esc(o.infraId)}</b> — existing nodes are not touched.
        </div>
      </div>

      <div class="popup-section">
        <div class="popup-section-title">🧩 NodeGroup</div>
        <div class="popup-row">
          <div class="popup-col" style="flex:2;">
            <div class="popup-field">
              <label class="popup-label">Name</label>
              <input id="nodegroup-name" class="popup-input" placeholder="e.g., web-servers-2" value="${esc(o.nodeGroupName)}">
            </div>
          </div>
          <div class="popup-col" style="flex:1;">
            <div class="popup-field">
              <label class="popup-label">Nodes per location</label>
              <input id="node-count" type="number" class="popup-input" min="1" max="10" value="1">
            </div>
          </div>
          <div class="popup-col" style="flex:1;">
            <div class="popup-field">
              <label class="popup-label">Total nodes to add</label>
              <div class="popup-inline" style="min-height:32px;">
                <span class="popup-badge" style="background:#0d6efd; color:white;" id="total-nodes">${o.totalNodes}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="popup-section">
        <div class="popup-section-title">🏷️ Labels <span style="font-weight:normal; font-size:0.72rem; color:#666;">— key=value; enables labelSelector targeting later</span></div>
        <div id="nodegroup-label-rows"></div>
        <button type="button" id="add-label-row"
          style="margin-top:6px; padding:4px 12px; border:1px solid #6c757d; border-radius:4px; background:#f8f9fa; color:#333; cursor:pointer; font-size:12px;">
          + Add label
        </button>
      </div>

      <div class="popup-section">
        <div class="popup-section-title">🖥️ Node Specification <span style="font-weight:normal; font-size:0.72rem; color:#666;">— from the map configuration</span></div>
        <div style="max-height:180px; overflow-y:auto;">${o.specSummaryHtml}</div>
      </div>
`;
};

// Label editor wiring for the NodeGroup config section
window.setupNodeGroupLabelEditor = function (prefillLabels = {}, suggestedKeys = ['role']) {
  const rows = document.getElementById('nodegroup-label-rows');
  if (!rows) return;
  const esc = window.escapeHtml || (s => String(s));
  const addLabelRow = (k, v) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; gap:6px; margin-bottom:4px;';
    row.innerHTML = `<input class="popup-input label-key" style="flex:1;" placeholder="key" value="${esc(k || '')}">
                     <input class="popup-input label-val" style="flex:1;" placeholder="value" value="${esc(v || '')}">
                     <button type="button" class="label-del"
                       style="padding:2px 10px; border:1px solid #dc3545; border-radius:4px; background:#fff; color:#dc3545; cursor:pointer;">✕</button>`;
    row.querySelector('.label-del').onclick = () => row.remove();
    rows.appendChild(row);
  };
  const keys = Object.keys(prefillLabels || {});
  if (keys.length === 0) {
    suggestedKeys.forEach(k => addLabelRow(k, ''));
  } else {
    keys.forEach(k => addLabelRow(k, prefillLabels[k]));
  }
  const addBtn = document.getElementById('add-label-row');
  if (addBtn) addBtn.onclick = () => addLabelRow('', '');

  const countInput = document.getElementById('node-count');
  if (countInput) {
    countInput.addEventListener('input', function () {
      const perLocation = parseInt(this.value) || 1;
      const locations = (window.nodeGroupRequestFromSpecList || []).length || 1;
      const totalEl = document.getElementById('total-nodes');
      if (totalEl) totalEl.textContent = perLocation * locations;
    });
  }
};

// Validate + read the NodeGroup config section
window.collectNodeGroupConfig = function () {
  const nodeGroupName = (document.getElementById('nodegroup-name')?.value || '').trim();
  const ndCount = parseInt(document.getElementById('node-count')?.value) || 1;
  if (!nodeGroupName) return { error: 'Please enter a NodeGroup name' };
  if (ndCount < 1 || ndCount > 10) return { error: 'Node count must be between 1 and 10' };

  const labels = {};
  document.querySelectorAll('#nodegroup-label-rows > div').forEach(row => {
    const k = (row.querySelector('.label-key')?.value || '').trim();
    const v = (row.querySelector('.label-val')?.value || '').trim();
    if (k) labels[k] = v;
  });
  return { nodeGroupName, ndCount, labels };
};

// ── Shared command composer ─
// Single source for the "Predefined Scripts / Parameters / Commands" UI used by
// the Application Deployment popup, the post-deployment command dialog, and the
// NodeGroup add dialog. The markup is the one from Application Deployment, so
// that popup renders identically after the extraction.
//
// Wiring is unchanged: setupCommandsPopup() (didOpen) + collectCommands() /
// collectPhases() (preConfirm) work on the ids emitted here.
window.generateCommandComposerHtml = function (opts = {}) {
  const o = Object.assign({
    commands: ['', '', ''],        // initial command values
    showScripts: true,             // 📜 Predefined Scripts (with category tabs)
    showParams: true,              // 📋 Parameters (consolidated placeholder panel)
    showCommands: true,            // ⌨️ Commands
    showPhases: false,             // ordered post-deployment phases (postCommands[])
    showLabelSelector: false,      // target filter by labels
    labelSelectorOptional: true,
    includeDeployOptions: true,    // show the 'platform' script category
  }, opts);

  const defaultCat = window._currentScriptCategory || 'llm-ollama';
  const cat = (window.predefinedScriptCategories || {})[defaultCat] ||
              (window.predefinedScriptCategories || {})['llm-ollama'] || { description: '', scripts: [] };

  let html = '';

  if (o.showScripts) {
    html += `
      <!-- Predefined Scripts Section -->
      <div class="popup-section">
        <div class="popup-section-title">📜 Predefined Scripts</div>
        <div id="scriptCategoryTabs" style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;">
          ${window.generateScriptCategoryTabsHtml(o.includeDeployOptions)}
        </div>
        <div id="categoryDescription" style="font-size: 0.7rem; color: #666; margin-bottom: 6px; padding: 4px 8px; background: #fff3cd; border-radius: 4px;">
          📝 ${cat.description}
        </div>
        <div class="popup-row">
          <div class="popup-col" style="flex: 3;">
            <div class="popup-field">
              <select id="predefinedScripts" class="popup-select">
                ${window.generateScriptOptionsHtml(cat.scripts)}
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

        <!-- Quick Reference: shown when a script has refs/presets but no <PLACEHOLDER> params -->
        <div id="scriptQuickRef" style="display:none; margin-top:8px; padding:8px 12px; background:#f8fbff; border:1px dashed #b3d7ff; border-radius:6px;">
          <div id="scriptQuickRefRefs" style="display:flex; flex-wrap:wrap; align-items:center; gap:6px;"></div>
          <div id="scriptQuickRefPresets"></div>
        </div>
      </div>
`;
  }

  if (o.showParams) {
    html += `
      <!-- Parameters Section: auto-shown when commands contain <PLACEHOLDER> tokens -->
      <div id="cmdParamsSection" class="popup-section" style="display:none; border:1px solid #b3d7ff; background:#f0f7ff;">
        <div class="popup-section-title" style="color:#0d6efd;">
          📋 Parameters
          <span style="font-weight:normal; font-size:0.72rem; color:#555; margin-left:6px;">— detected from commands. Fill values before executing.</span>
        </div>
        <div id="cmdParamsPanel"></div>
      </div>
`;
  }

  if (o.showCommands) {
    let cmdRows = '';
    for (let i = 1; i <= 3; i++) {
      cmdRows += `
          <div id="cmdDiv${i}" class="cmdRow" style="margin-bottom: 6px;">
            <div class="popup-field">
              <div class="popup-inline" style="justify-content: space-between;">
                <label class="popup-label">Command ${i}</label>
                <button type="button" onclick="document.getElementById('cmd${i}').value = ''; autoResizeTextarea(document.getElementById('cmd${i}'));"
                  style="font-size: 10px; padding: 1px 6px; border: 1px solid #ccc; border-radius: 3px; background: #f8f9fa; cursor: pointer;">Clear</button>
              </div>
              <textarea id="cmd${i}" rows="1" class="popup-input" style="resize: vertical; overflow: hidden; min-height: 32px;"
                oninput="autoResizeTextarea(this)">${o.commands[i - 1] || ''}</textarea>
            </div>
          </div>`;
    }
    html += `
      <!-- Commands Section -->
      <div class="popup-section">
        <div class="popup-section-title">⌨️ Commands</div>
        <div id="cmdContainer">${cmdRows}
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
`;
  }

  if (o.showPhases) {
    html += `
      <div class="popup-section">
        <div class="popup-section-title">🧭 Ordered Phases <span style="font-weight:normal; font-size:0.72rem; color:#666;">— optional: run groups of commands in order, each with its own target</span></div>
        ${window.generatePhaseEditorHtml()}
      </div>
`;
  }

  if (o.showLabelSelector) {
    html += window.generateLabelSelectorHtml(o.labelSelectorOptional, true);
  }

  return html;
};

// ── Post-deployment phase editor ─
// Optional multi-phase bootstrap: each phase runs in order against its own
// target (all nodes / nodeGroup / labelSelector). Server contract: postCommands[].
window.generatePhaseEditorHtml = function () {
  return `
    <div id="phaseEditorWrap" style="display:none; margin-top:10px; border:1px solid #b3d7ff; border-radius:8px; padding:10px; background:#f8fbff;">
      <div style="font-size:0.85em;color:#495057;margin-bottom:6px;">
        Phases run <b>in order</b>. A failed phase stops the rest unless "continue on error" is checked.
      </div>
      <div id="phaseList"></div>
      <button type="button" onclick="addPhaseBlock()" class="btn btn-sm btn-outline-primary" style="margin-top:6px;">+ Add phase</button>
    </div>
    <div style="margin-top:8px;">
      <label style="font-weight:600;font-size:0.9em;cursor:pointer;">
        <input type="checkbox" id="usePhasesToggle" onchange="togglePhaseEditor(this.checked)"> Use ordered phases (per-phase targets)
      </label>
    </div>`;
};

window.togglePhaseEditor = function (on) {
  const wrap = document.getElementById('phaseEditorWrap');
  const cmds = document.getElementById('cmdContainer');
  if (wrap) wrap.style.display = on ? '' : 'none';
  if (cmds) cmds.style.display = on ? 'none' : '';
  if (on && document.querySelectorAll('#phaseList .phase-block').length === 0) addPhaseBlock();
};

window.addPhaseBlock = function () {
  const list = document.getElementById('phaseList');
  if (!list) return;
  const idx = list.querySelectorAll('.phase-block').length + 1;
  const block = document.createElement('div');
  block.className = 'phase-block';
  block.style.cssText = 'border:1px solid #d0e3ff;border-radius:6px;padding:8px;margin-bottom:8px;background:#fff;';
  block.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <b class="phase-title" style="font-size:0.9em;">Phase ${idx}</b>
      <select class="form-control form-control-sm phase-target-type" style="width:auto;">
        <option value="">All nodes</option>
        <option value="nodeGroupId">nodeGroupId</option>
        <option value="labelSelector">labelSelector</option>
        <option value="nodeId">nodeId</option>
      </select>
      <input class="form-control form-control-sm phase-target-val" style="width:auto;flex:1;" placeholder="target value" disabled>
      <label style="font-size:0.8em;white-space:nowrap;margin:0;cursor:pointer;">
        <input type="checkbox" class="phase-continue"> continue on error
      </label>
      <button type="button" class="btn btn-sm btn-outline-danger phase-del">✕</button>
    </div>
    <textarea class="form-control form-control-sm phase-cmds" rows="2" placeholder="One command per line"></textarea>`;
  block.querySelector('.phase-target-type').onchange = function () {
    const val = block.querySelector('.phase-target-val');
    val.disabled = !this.value;
    if (!this.value) val.value = '';
  };
  block.querySelector('.phase-del').onclick = function () {
    block.remove();
    document.querySelectorAll('#phaseList .phase-block').forEach((b, i) => {
      b.querySelector('.phase-title').textContent = 'Phase ' + (i + 1);
    });
  };
  list.appendChild(block);
};

// Returns postCommands[] when the phase editor is active, else null
window.collectPhases = function () {
  const toggle = document.getElementById('usePhasesToggle');
  if (!toggle || !toggle.checked) return null;
  const phases = [];
  document.querySelectorAll('#phaseList .phase-block').forEach(block => {
    const commands = block.querySelector('.phase-cmds').value
      .split('\n').map(c => c.trim()).filter(c => c.length > 0);
    if (commands.length === 0) return;
    const phase = { command: commands };
    const type = block.querySelector('.phase-target-type').value;
    const val = block.querySelector('.phase-target-val').value.trim();
    if (type && val) phase[type] = val;
    if (block.querySelector('.phase-continue').checked) phase.continueOnError = true;
    phases.push(phase);
  });
  return phases.length > 0 ? phases : null;
};

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
      { value: 'Nvidia', label: '1. Install GPU Driver (NVIDIA/AMD auto-detect)', step: 1 },
      { value: 'RebootVM', label: '2. Reboot Node', step: 2 },
      { value: 'Nvidia-Status', label: '3. Check GPU Driver (NVIDIA/AMD)', step: 3 },
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
      { value: 'Nvidia', label: '1. Install GPU Driver (NVIDIA/AMD auto-detect)', step: 1, targetLabel: 'accelerator=gpu' },
      { value: 'RebootVM', label: '2. Reboot Node', step: 2, targetLabel: 'accelerator=gpu' },
      { value: 'Nvidia-Status', label: '3. Check GPU Driver (NVIDIA/AMD)', step: 3, targetLabel: 'accelerator=gpu' },
      { value: 'vLLM', label: '4. Install vLLM', step: 4, targetLabel: 'accelerator=gpu' },
      { value: 'vLLMServe', label: '5. Serve LLM Model', step: 5, targetLabel: 'accelerator=gpu' },
      { value: 'Netdata', label: '6. Install Monitoring', step: 6, optional: true },
      { value: 'OpenWebUI-vLLM', label: '7. Install Open WebUI (vLLM)', step: 7 },
      { value: 'TelemetrySensor', label: '8. Setup GPU Telemetry Sensor', step: 8, experimental: true, targetLabel: 'accelerator=gpu' },
      { value: 'TelemetryMonitor', label: '9. Setup Monitoring Server', step: 9, experimental: true, targetLabel: 'role=observability' },
      { value: 'TelemetryExport', label: '10. Export Metrics to CSV', step: 10, experimental: true, targetLabel: 'role=observability' },
      { value: 'HermesAgent', label: 'Deploy Hermes Agent', targetLabel: 'accelerator=gpu' }
    ]
  },
  'llm-benchmark': {
    label: '📊 LLM Benchmark',
    description: 'LLM benchmark environment (vLLM + GuideLLM + Monitoring)',
    scripts: [
      { value: 'Nvidia', label: '1. Install GPU Driver (NVIDIA/AMD auto-detect)', step: 1, targetLabel: 'accelerator=gpu' },
      { value: 'RebootVM', label: '2. Reboot Node', step: 2, targetLabel: 'accelerator=gpu' },
      { value: 'Nvidia-Status', label: '3. Check GPU Driver (NVIDIA/AMD)', step: 3, targetLabel: 'accelerator=gpu' },
      { value: 'BenchmarkTarget', label: '4. Setup Benchmark Target (vLLM+Model+Telemetry)', step: 4, targetLabel: 'accelerator=gpu' },
      { value: 'BenchmarkManager', label: '5. Setup Benchmark Manager (Monitoring+Tools)', step: 5, targetLabel: 'role=benchmark', targetLabels: ['role=benchmark', 'role=observability'] },
      { value: 'vLLMServe', label: '6. Serve LLM Model (change model on GPU nodes)', step: 6, targetLabel: 'accelerator=gpu' },
      { value: 'RunBenchmark', label: '7. Run Benchmark', step: 7, targetLabel: 'role=benchmark', targetLabels: ['role=benchmark', 'role=observability'] },
      { value: 'BenchmarkTelemetryExport', label: '8. Export Metrics to CSV', step: 8, optional: true, targetLabel: 'role=benchmark', targetLabels: ['role=benchmark', 'role=observability'] }
    ]
  },
  'k8s': {
    label: '☸️ Kubernetes',
    description: 'Kubernetes cluster deployment — Standard, GPU, or llm-d (distributed LLM inference). Steps 4-6 are for GPU workers; steps 9-13 are for llm-d only. Steps 14-17 are demo apps and visualization tools.',
    scripts: [
      { value: 'Setup-WireGuard',        label: '0. Setup WireGuard VPN (optional)',              step: 0,  optional: true },
      { value: 'K8sControlPlane-Deploy', label: '1. Deploy Control Plane (Standard; opt CNI=cilium)', step: 1,  targetLabel: 'role=control' },
      { value: 'K8sLlmdControlPlane',    label: '1-alt. Deploy Control Plane (llm-d)',             step: 1,  targetLabel: 'role=control', optional: true },
      { value: 'K8sGetJoinCommand',      label: '2. Get Join Command',                             step: 2,  targetLabel: 'role=control', syncMode: true },
      { value: 'K8sGetKubeconfig',       label: '3. Get Kubeconfig (Base64)',                      step: 3,  targetLabel: 'role=control', syncMode: true },
      { value: 'K8sGetKubeconfigExternal', label: '3-alt. Get Kubeconfig for a designated IP (nested/NAT — re-issues cert SAN)', step: 3, targetLabel: 'role=control', optional: true, syncMode: true },
      { value: 'Nvidia',                 label: '4. Install GPU Driver — NVIDIA/AMD auto-detect (GPU worker only)', step: 4,  targetLabel: 'accelerator=gpu', optional: true },
      { value: 'RebootVM',               label: '5. Reboot Node (GPU worker only)',                step: 5,  targetLabel: 'role=node', optional: true },
      { value: 'Nvidia-Status',          label: '6. Check GPU Driver — NVIDIA/AMD (GPU worker only)', step: 6,  targetLabel: 'accelerator=gpu', optional: true, syncMode: true },
      { value: 'K8sWorker-Deploy',       label: '7. Deploy Worker & Join Cluster',                step: 7,  targetLabel: 'role=node' },
      { value: 'K8sClusterStatus',       label: '8. Check Cluster Status',                        step: 8,  targetLabel: 'role=control', syncMode: true },
      { value: 'K8sGpuStatus',           label: '9. Check GPU Operator Status (GPU/llm-d)',       step: 9,  targetLabel: 'role=control', optional: true, syncMode: true },
      { value: 'LlmdCheck',              label: '10. Check llm-d Prerequisites (llm-d only)',     step: 10, targetLabel: 'role=control', optional: true, syncMode: true },
      { value: 'LlmdDeployWithModel',    label: '11. Deploy llm-d with Model (llm-d only)',       step: 11, targetLabel: 'role=control', optional: true },
      { value: 'LlmdStatus',             label: '12. Check llm-d Status (llm-d only)',            step: 12, targetLabel: 'role=control', optional: true, syncMode: true },
      { value: 'LlmdUninstall',          label: '13. Uninstall llm-d (llm-d only)',               step: 13, targetLabel: 'role=control', optional: true },
      { value: 'K8sDemoApp',             label: '14. Deploy Demo Web App (NodePort)',              step: 14, targetLabel: 'role=control', syncMode: true },
      { value: 'K8sScaleApp',            label: '15. Scale Demo App (set replica count)',          step: 15, targetLabel: 'role=control', syncMode: true },
      { value: 'K8sLoadTest',            label: '16. Run Load Test (Batch Job → demo app)',        step: 16, targetLabel: 'role=control', syncMode: true },
      { value: 'K8sDashboard',           label: '17. Install K8s Dashboard (Visualization)',       step: 17, targetLabel: 'role=control', syncMode: true },
      { value: 'K8sPortainer',           label: '18. Install Portainer CE (Visual Cluster Monitor)', step: 18, targetLabel: 'role=control', syncMode: true },
      { value: 'WeaveScopeK8s',          label: '19. Install Weave Scope (Live Topology Map — NodePort 30040)', step: 19, targetLabel: 'role=control', optional: true },
      { value: 'K8sHubbleUI',            label: '20. Enable Hubble UI (Cilium service map — NodePort 30012)', step: 20, targetLabel: 'role=control', optional: true }
    ]
  },
  'kserve': {
    label: '🚀 KServe (LLM Serving)',
    description: 'KServe(RawDeployment) + vLLM + Open WebUI on K8s — build the cluster with steps 1-4 (GPU driver steps only if not pre-installed on the image), then deploy serving with steps 5-8. Multiple LLMs: repeat step 6 with unique name/port per model (one GPU each; 5-opt shares a GPU across models), then re-run step 8 to connect all of them to the WebUI',
    scripts: [
      { value: 'K8sControlPlane-Deploy', label: '1. Deploy Control Plane (opt CNI=cilium)', step: 1, targetLabel: 'role=control' },
      { value: 'K8sGetJoinCommand',      label: '2. Get Join Command',                              step: 2, targetLabel: 'role=control', syncMode: true },
      { value: 'Nvidia',                 label: '2-opt. Install GPU Driver (skip on GPU-ready images)', step: 2, targetLabel: 'accelerator=gpu', optional: true },
      { value: 'RebootVM',               label: '2-opt. Reboot GPU Node (after driver install)',    step: 2, targetLabel: 'accelerator=gpu', optional: true },
      { value: 'K8sWorker-Deploy',       label: '3. Deploy Worker & Join Cluster',                  step: 3, targetLabel: 'role=node' },
      { value: 'K8sClusterStatus',       label: '4. Check Cluster Status',                          step: 4, targetLabel: 'role=control', syncMode: true },
      { value: 'KServeDeploy',           label: '5. Deploy KServe Stack (GPU Operator + cert-manager + KServe)', step: 5, targetLabel: 'role=control' },
      { value: 'KServeGpuTimeslice',     label: '5-opt. Enable GPU Time-Slicing (share one GPU across LLMs)', step: 5, targetLabel: 'role=control', optional: true },
      { value: 'KServeGpuMig',           label: '5-opt. Enable MIG Partitioning (A100/H100 only, isolated slices)', step: 5, targetLabel: 'role=control', optional: true },
      { value: 'KServeVllmServe',        label: '6. Serve LLM Model (repeat per model: unique name/port)', step: 6, targetLabel: 'role=control' },
      { value: 'KServeStatus',           label: '7. Check Serving Status',                          step: 7, targetLabel: 'role=control', syncMode: true },
      { value: 'KServeOpenWebUI',        label: '8. Install Open WebUI (KServe)',                   step: 8, targetLabel: 'role=control' },
      { value: 'HermesAgent-KServe',     label: '9. Deploy Hermes Agent (uses KServe endpoint)',    step: 9, targetLabel: 'role=control', optional: true, experimental: true },
      { value: 'KServeExampleA',         label: '10. Example: serve sklearn model (no image build)', step: 10, targetLabel: 'role=control', optional: true },
      { value: 'KServeExampleC',         label: '11. Example: plain Deployment serving (no KServe)', step: 11, targetLabel: 'role=control', optional: true },
      { value: 'KServeRegistryDeploy',   label: '12. Deploy Private Registry (in-cluster)',          step: 12, targetLabel: 'role=control', optional: true },
      { value: 'KServeRegistryAccess',   label: '13. Enable Registry Access (run on ALL nodes)',     step: 13, optional: true },
      { value: 'KServeExampleB',         label: '14. Example: build & serve custom model (registry)', step: 14, targetLabel: 'role=control', optional: true },
      { value: 'KServeMonitoring',       label: '15. Deploy Monitoring (Prometheus + Grafana, GPU/LLM dashboards)', step: 15, targetLabel: 'role=control', optional: true }
    ]
  },
  'mcp': {
    label: '🔌 MCP (agentgateway)',
    description: 'AI-operated model registry demo — a Hugging Face-style model catalog (web + REST + PostgreSQL) exposed as MCP adapters, federated by agentgateway into one external endpoint (NodePort 30900). Build the cluster with steps 1-4 (CPU nodes are enough), then deploy the registry + MCP stack with steps 5-11',
    scripts: [
      { value: 'K8sControlPlane-Deploy', label: '1. Deploy Control Plane (opt CNI=cilium)',  step: 1,  targetLabel: 'role=control' },
      { value: 'K8sGetJoinCommand',      label: '2. Get Join Command',                                    step: 2,  targetLabel: 'role=control', syncMode: true },
      { value: 'K8sWorker-Deploy',       label: '3. Deploy Worker & Join Cluster',                        step: 3,  targetLabel: 'role=node' },
      { value: 'K8sClusterStatus',       label: '4. Check Cluster Status',                                step: 4,  targetLabel: 'role=control', syncMode: true },
      { value: 'McpRegistryDb',          label: '5. Deploy Model Registry DB (+ agri/livestock sample catalog)', step: 5,  targetLabel: 'role=control' },
      { value: 'McpRegistryBackend',     label: '6. Deploy Model Registry Backend (REST API)',            step: 6,  targetLabel: 'role=control' },
      { value: 'McpRegistryWeb',         label: '7. Deploy Model Registry Web (NodePort 30902)',          step: 7,  targetLabel: 'role=control' },
      { value: 'McpRegistryWebScaleOut', label: '7-opt. Scale OUT Registry Web (traffic-burst demo — watch in Headlamp)', step: 7, targetLabel: 'role=control', optional: true, syncMode: true },
      { value: 'McpRegistryWebScaleIn',  label: '7-opt. Scale IN Registry Web (back to 1 replica)',       step: 7,  targetLabel: 'role=control', optional: true, syncMode: true },
      { value: 'McpServers',             label: '8. Deploy MCP Adapters (catalog tools + read-only SQL)', step: 8,  targetLabel: 'role=control' },
      { value: 'McpServingAdapter',      label: '8-opt. Deploy KServe Serving Adapter (same-cluster KServe)', step: 8, targetLabel: 'role=control', optional: true },
      { value: 'McpAgentgateway',        label: '9. Deploy agentgateway (federated MCP endpoint)',        step: 9,  targetLabel: 'role=control' },
      { value: 'McpE2eTest',             label: '10. Run E2E Demo (tools via gateway)',                   step: 10, targetLabel: 'role=control', syncMode: true },
      { value: 'McpStatus',              label: '11. Check MCP Stack Status',                             step: 11, targetLabel: 'role=control', syncMode: true },
      { value: 'WeaveScopeK8s',          label: '11-opt. Install Weave Scope (Live Topology Map — NodePort 30040)', step: 11, targetLabel: 'role=control', optional: true },
      { value: 'K8sHubbleUI',            label: '11-opt. Enable Hubble UI (Cilium service map — NodePort 30012)', step: 11, targetLabel: 'role=control', optional: true }
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
      { value: 'CB-TB-Deploy',  label: 'Deploy CB-Tumblebug',         step: 1 },
      { value: 'M-CMP-Install', label: '1. M-CMP: Install (Stage 1)', step: 2 },
      { value: 'M-CMP-Pull',    label: '2. M-CMP: Pull Images',        step: 3 },
      { value: 'M-CMP-Run',     label: '3. M-CMP: Run (Stage 2)',      step: 4 },
      { value: 'M-CMP-Info',    label: '4. M-CMP: Check Status',       step: 5 },
      { value: 'M-CMP-Stop',    label: '5. M-CMP: Stop',               step: 6 }
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
      label: nd.label || {}
    });

    if (nd.label && typeof nd.label === 'object') {
      Object.entries(nd.label).forEach(([key, value]) => {
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
    if (!nd.label || requiredLabelPairs.length === 0) return false;
    
    // Every required label pair must exist in Node's labels
    return requiredLabelPairs.every(({ key, value }) => {
      return nd.label[key] === value;
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
  // textContent->innerHTML escapes & < > but NOT quotes; escape them too so
  // the result is safe inside double- or single-quoted HTML attributes
  // (e.g., data-nodeid="${escapeHtml(id)}") as well as in text nodes.
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

// Collect commands from popup (call in preConfirm).
// Substitutes <PLACEHOLDER> tokens with values before returning.
// - Consolidated mode (#cmdParamsPanel present): reads from shared params panel;
//   each unique param is entered once and substituted into all commands.
// - Legacy inline mode: reads per-command .placeholder-input panels.
window.collectCommands = function () {
  const commands = [];
  const cmdContainer = document.getElementById('cmdContainer');
  if (!cmdContainer) return commands;

  // Build consolidated substitution map from #cmdParamsPanel (if present)
  const consolidatedMap = {}; // fullMatch → value
  const paramsPanel = document.getElementById('cmdParamsPanel');
  if (paramsPanel) {
    paramsPanel.querySelectorAll('.placeholder-input').forEach(input => {
      const fullMatch = input.dataset.fullMatch;
      // Always substitute: empty value → empty string (prevents literal <TOKEN> reaching remote)
      if (fullMatch) consolidatedMap[fullMatch] = input.value;
    });
  }
  const useConsolidated = paramsPanel !== null;

  cmdContainer.querySelectorAll('[id^="cmdDiv"]').forEach((div, index) => {
    const cmdInput = document.getElementById(`cmd${index + 1}`);
    if (cmdInput && cmdInput.value && cmdInput.value.trim()) {
      let cmdText = cmdInput.value.trim();

      if (useConsolidated) {
        Object.entries(consolidatedMap).forEach(([fullMatch, value]) => {
          // Use a function replacement so '$' in the value is preserved literally
          // (a string replacement would interpret $$, $&, $`, $' specials).
          cmdText = cmdText.replaceAll(fullMatch, () => value);
        });
      } else {
        div.querySelectorAll('.placeholder-input').forEach(phInput => {
          const fullMatch = phInput.dataset.fullMatch;
          if (fullMatch) cmdText = cmdText.replaceAll(fullMatch, () => phInput.value);
        });
      }

      commands.push(cmdText);
    }
  });

  return commands;
};

// ============================================================

/**
 * Update the script-level quick reference panel (#scriptQuickRef).
 * Used for scripts that have no <PLACEHOLDER> parameters but still need refs/presets.
 */
window.updateScriptQuickRef = function(scriptValue) {
  const panel = document.getElementById('scriptQuickRef');
  if (!panel) return;
  const meta = window.SCRIPT_QUICK_REF && window.SCRIPT_QUICK_REF[scriptValue];
  const refsDiv    = document.getElementById('scriptQuickRefRefs');
  const presetsDiv = document.getElementById('scriptQuickRefPresets');
  if (!meta || (!meta.refs?.length && !meta.presets?.length)) {
    panel.style.display = 'none';
    return;
  }
  if (refsDiv)    refsDiv.innerHTML    = '';
  if (presetsDiv) presetsDiv.innerHTML = '';
  if (meta.refs && meta.refs.length > 0 && refsDiv) {
    const h = document.createElement('span');
    h.style.cssText = 'font-size:0.72rem; color:#555; font-weight:600; margin-right:6px;';
    h.textContent = '🔗 References:';
    refsDiv.appendChild(h);
    meta.refs.forEach(ref => {
      const a = document.createElement('a');
      a.href = ref.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = ref.label;
      a.style.cssText = 'font-size:0.72rem; color:#0d6efd; text-decoration:none; padding:1px 8px; border:1px solid #b3d7ff; border-radius:8px; background:#f0f7ff; margin-right:6px;';
      a.onmouseover = () => { a.style.background = '#cce5ff'; };
      a.onmouseout  = () => { a.style.background = '#f0f7ff'; };
      refsDiv.appendChild(a);
    });
  }
  if (meta.presets && meta.presets.length > 0 && presetsDiv) {
    presetsDiv.style.cssText = 'display:flex; flex-wrap:wrap; align-items:center; gap:4px; margin-top:6px;';
    const h = document.createElement('span');
    h.style.cssText = 'font-size:0.72rem; color:#555; font-weight:600; white-space:nowrap;';
    h.textContent = '📋 Quick Copy:';
    presetsDiv.appendChild(h);
    meta.presets.forEach(preset => {
      const val  = preset.value || preset;
      const lbl  = preset.label || val;
      const chip = document.createElement('button');
      chip.type = 'button'; chip.textContent = lbl; chip.title = val;
      chip.style.cssText = 'padding:3px 10px; border:1px solid #ffc107; border-radius:10px; background:#fff8e1; color:#664d03; cursor:pointer; font-size:0.7rem; white-space:nowrap;';
      chip.onmouseover = () => { chip.style.background = '#ffe69c'; };
      chip.onmouseout  = () => { chip.style.background = '#fff8e1'; };
      chip.onclick = () => {
        const orig = chip.textContent;
        const done = () => { chip.textContent = '✅ Copied!'; setTimeout(() => { chip.textContent = orig; }, 1500); };
        if (navigator.clipboard) { navigator.clipboard.writeText(val).then(done).catch(() => { document.execCommand('copy'); done(); }); }
        else { const el = document.createElement('textarea'); el.value = val; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); done(); }
      };
      presetsDiv.appendChild(chip);
    });
  }
  panel.style.display = '';
};

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

  // Raise the timeout for long-running usecases. Only ever raises it, so a value the
  // user typed themselves is never cut down.
  const timeoutField = document.getElementById("timeoutMinutes");
  if (timeoutField && defaultRemoteCommandTimeout > 0) {
    const current = parseInt(timeoutField.value, 10) || 0;
    if (defaultRemoteCommandTimeout > current) {
      timeoutField.value = defaultRemoteCommandTimeout;
      console.log("Raised command timeout to", defaultRemoteCommandTimeout, "min for", scriptType);
    }
  }

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

  // Update script-level quick reference panel (refs + copy presets)
  window.updateScriptQuickRef(scriptType);

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
 *
 * Strategy: Extract $$MARKER patterns FIRST and stash their chip HTML in a side table,
 * leaving opaque placeholder tokens (\u0001RC_CHIP_<n>\u0002) in the text. Then escape
 * the text, linkify URLs/IPs (which can safely process the now-clean text), and finally
 * substitute the chip HTML back in. This prevents the linkifier from mangling chip
 * attributes like data-copy="http://...", which used to break the buttons.
 */
function _escAndLinkify(text, ctx = {}) {
  // Inject chip CSS once on first call
  if (!document.getElementById('rc-chip-styles')) {
    const s = document.createElement('style');
    s.id = 'rc-chip-styles';
    s.textContent = '.rc-result-item{display:inline-flex;align-items:center;gap:2px;vertical-align:middle}.rc-btn{display:inline-flex;align-items:center;border:none;background:none;cursor:pointer;padding:0 2px;font-size:12px;line-height:1;opacity:0.6;transition:opacity .12s,transform .12s;text-decoration:none;vertical-align:middle}.rc-btn:hover{opacity:1;transform:scale(1.2)}.rc-btn:active{transform:scale(0.9)}@keyframes rc-flash{0%,100%{opacity:1}50%{opacity:0.25}}.rc-flash{animation:rc-flash .4s ease}';
    document.head.appendChild(s);
  }
  if (!text) return '';
  const linkStyle = 'color:#64b5f6; text-decoration:underline;';

  // Attribute-safe escape (for use inside HTML attribute values that we emit directly)
  const attrEsc = (s) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Text-safe escape (for label rendering)
  const textEsc = (s) => window.escapeHtml(String(s));
  // ENDPOINT: replace 0.0.0.0/localhost bind address with the actual node public IP
  const resolveUrl = (url) =>
    ctx.nodeIp ? url.replace(/\/\/(0\.0\.0\.0|localhost)(?=[:\/]|$)/, `//${ctx.nodeIp}`) : url;

  // Phase 1: Extract $$MARKER chips into a side table, leaving placeholders behind.
  const chips = [];
  const PLACEHOLDER_RE = /\u0001RC_CHIP_(\d+)\u0002/g;
  const RESULT_MARKER = /\$\$([A-Z]+)\[([^\]]{0,80})\]\(([^)]{0,400})\)/g;
  const withPlaceholders = String(text).replace(RESULT_MARKER, (_, type, label, value) => {
    let chipHtml;
    switch (type) {
      case 'ENDPOINT': {
        const resolved = resolveUrl(value);
        if (!/^https?:\/\//i.test(resolved)) return label; // plain label, will be escaped later
        chipHtml = `<span class="rc-result-item">${textEsc(label)}`
          + ` <a class="rc-btn" href="${attrEsc(resolved)}" target="_blank" rel="noopener" title="Open">🔗</a>`
          + ` <button type="button" class="rc-btn" data-copy="${attrEsc(resolved)}" title="Copy URL">📋</button>`
          + `</span>`;
        break;
      }
      case 'FILEPATH': {
        const di = attrEsc(ctx.infraId || '');
        const dn = attrEsc(ctx.nodeId  || '');
        chipHtml = `<span class="rc-result-item">${textEsc(label)}`
          + ` <button type="button" class="rc-btn" data-infra="${di}" data-node="${dn}" data-path="${attrEsc(value)}" title="Download (open File Transfer)">⬇️</button>`
          + ` <button type="button" class="rc-btn" data-copy="${attrEsc(value)}" title="Copy path">📋</button>`
          + `</span>`;
        break;
      }
      case 'CREDENTIAL':
        chipHtml = `<span class="rc-result-item">${textEsc(label)}: <span class="rc-mask">••••</span>`
          + ` <button type="button" class="rc-btn" data-cred="${attrEsc(value)}" data-shown="0" title="Show/hide">👁</button>`
          + ` <button type="button" class="rc-btn" data-copy="${attrEsc(value)}" title="Copy">📋</button>`
          + `</span>`;
        break;
      case 'CMD':
        chipHtml = `<span class="rc-result-item">${textEsc(label)}`
          + ` <button type="button" class="rc-btn" data-copy="${attrEsc(value)}" title="Copy command">📋</button>`
          + `</span>`;
        break;
      default:
        return ''; // suppress unknown marker tokens
    }
    const idx = chips.length;
    chips.push(chipHtml);
    return `\u0001RC_CHIP_${idx}\u0002`;
  });

  // Phase 2: HTML-escape entire text (placeholder bytes are not HTML-special, they survive).
  let safe = window.escapeHtml(withPlaceholders);

  // Phase 3: linkify http(s) URLs (chips are absent from `safe` at this point).
  safe = safe.replace(/(https?:\/\/[^\s<&'")\]]+)/g, (url) =>
    `<a href="${url}" target="_blank" rel="noopener" style="${linkStyle}">${url}</a>`
  );

  // Phase 4: linkify bare IP(:port)(/path) outside existing <a> tags.
  const parts = safe.split(/(<a\s[^>]*>.*?<\/a>)/g);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      parts[i] = parts[i].replace(
        /\b((?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?::\d{1,5})?(?:\/[^\s<&'"]*)?)\b/g,
        (m) => `<a href="http://${m}" target="_blank" rel="noopener" style="${linkStyle}">${m}</a>`
      );
    }
  }
  safe = parts.join('');

  // Phase 5: substitute chip HTML back in. This must run AFTER linkification so the
  // chip HTML (with attributes like data-copy="http://...") is never re-processed.
  safe = safe.replace(PLACEHOLDER_RE, (_, idx) => chips[Number(idx)] || '');

  return safe;
}

/**
 * Shared click handler for $$RESULT chip buttons (.rc-btn). Returns an async listener
 * suitable for a document-level capturing 'click' handler. Used by both the
 * non-streaming result viewer and the live streaming session modal so the chip
 * buttons behave identically in both views.
 *
 * Behavior:
 *  - data-path  → open File Transfer modal preset to Download mode, with the
 *                 Infra / Node / Source Path on Node fields pre-filled.
 *  - data-cred  → toggle credential visibility (eye icon).
 *  - data-copy  → write value to clipboard with a brief visual ack.
 *
 * @param {HTMLElement} popup   The SweetAlert popup element to scope clicks to.
 * @returns {(e: Event) => void}
 */
function _createRcBtnClickHandler(popup) {
  return async (e) => {
    const btn = e.target.closest('.rc-btn');
    if (!btn || !popup.contains(btn)) return;
    // <a> chips already navigate via href; nothing else to do here.
    if (btn.tagName === 'A') return;
    e.stopPropagation();

    if (btn.dataset.path !== undefined) {
      // FILEPATH: open File Transfer modal in Download mode, preset target & source path.
      const infra = btn.dataset.infra || '';
      const node = btn.dataset.node || '';
      const path = btn.dataset.path || '';
      if (!path) {
        if (typeof errorAlert === 'function') errorAlert('Cannot download: source path is missing.');
        return;
      }
      const orig = btn.textContent;
      btn.textContent = '📂';
      try {
        if (typeof window.transferFileToInfra === 'function') {
          await window.transferFileToInfra({
            mode: 'download',
            infraId: infra,
            nodeId: node,
            sourcePath: path,
          });
        } else {
          if (typeof errorAlert === 'function') errorAlert('File Transfer is unavailable.');
        }
      } finally {
        btn.textContent = orig;
      }
      return;
    }

    if (btn.dataset.cred !== undefined) {
      const shown = btn.dataset.shown === '1';
      btn.dataset.shown = shown ? '0' : '1';
      const item = btn.closest('.rc-result-item');
      const mask = item ? item.querySelector('.rc-mask') : null;
      if (mask) mask.textContent = shown ? '••••' : btn.dataset.cred;
      return;
    }

    if (btn.dataset.copy !== undefined) {
      const text = btn.dataset.copy;
      try {
        if (navigator.clipboard && window.isSecureContext !== false) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
      } catch (_) { /* swallow — visual ack covers UX */ }
      const orig = btn.textContent;
      btn.textContent = '✓';
      btn.classList.add('rc-flash');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('rc-flash'); }, 1000);
    }
  };
}

/**
 * Shows formatted remote command execution results in a SweetAlert window. 
 * Groups output by Node → Command for readability.
 * @param {Object} data - The API response with data.results[]
 */
function showRemoteCmdResult(data, appliedDnsUrl, infraId = '') {
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
    const ndCtx = { infraId, nodeId: nd.nodeId || '', nodeIp: ndIp };
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
                  <pre style="margin: 0; padding: 8px 10px; background: #1e1e1e; color: #d4d4d4; font-size: 11px; line-height: 1.5; overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 400px; overflow-y: auto;">${_escAndLinkify(stdoutInfo.fullText, ndCtx)}</pre>
                </div>
                <div id="${blockId}-tail">
                  <button type="button" style="display: block; width: 100%; text-align: center; padding: 3px; background: #f5f5f5; cursor: pointer; font-size: 10px; color: #1976d2; border: none;"
                       onclick="document.getElementById('${blockId}-full').style.display='block'; document.getElementById('${blockId}-tail').style.display='none';">
                    ▲ Show all ${stdoutInfo.totalLines} lines (${stdoutInfo.totalLines - TAIL_LINES} more above)
                  </button>
                  <pre style="margin: 0; padding: 8px 10px; background: #1e1e1e; color: #d4d4d4; font-size: 11px; line-height: 1.5; overflow-x: auto; white-space: pre-wrap; word-break: break-all;">${_escAndLinkify(stdoutInfo.visible.join('\n'), ndCtx)}</pre>
                </div>
              ` : `
                <pre style="margin: 0; padding: 8px 10px; background: #1e1e1e; color: #d4d4d4; font-size: 11px; line-height: 1.5; overflow-x: auto; white-space: pre-wrap; word-break: break-all;">${_escAndLinkify(stdoutInfo.fullText, ndCtx)}</pre>
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
                  <pre style="margin: 0; padding: 8px 10px; background: #2e1e1e; color: #ffab91; font-size: 11px; line-height: 1.5; overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 400px; overflow-y: auto;">${_escAndLinkify(stderrInfo.fullText, ndCtx)}</pre>
                </div>
                <div id="${blockId}-tail">
                  <button type="button" style="display: block; width: 100%; text-align: center; padding: 3px; background: #fff8f0; cursor: pointer; font-size: 10px; color: #e65100; border: none;"
                       onclick="document.getElementById('${blockId}-full').style.display='block'; document.getElementById('${blockId}-tail').style.display='none';">
                    ▲ Show all ${stderrInfo.totalLines} lines (${stderrInfo.totalLines - TAIL_LINES} more above)
                  </button>
                  <pre style="margin: 0; padding: 8px 10px; background: #2e1e1e; color: #ffab91; font-size: 11px; line-height: 1.5; overflow-x: auto; white-space: pre-wrap; word-break: break-all;">${_escAndLinkify(stderrInfo.visible.join('\n'), ndCtx)}</pre>
                </div>
              ` : `
                <pre style="margin: 0; padding: 8px 10px; background: #2e1e1e; color: #ffab91; font-size: 11px; line-height: 1.5; overflow-x: auto; white-space: pre-wrap; word-break: break-all;">${_escAndLinkify(stderrInfo.fullText, ndCtx)}</pre>
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
  let rcBtnClick; // shared between didOpen and willClose for cleanup
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

      // $$RESULT action buttons: document-level capture fires at the very top of the
      // event chain — before SweetAlert2's popup handler or any other listener.
      rcBtnClick = _createRcBtnClickHandler(popup);
      document.addEventListener('click', rcBtnClick, true);
    },
    willClose: () => {
      if (rcBtnClick) document.removeEventListener('click', rcBtnClick, true);
    },
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
// Toggle blur/reveal for the command banner in a streaming modal.
// Called via data-xreqid attribute so xRequestId never needs to be embedded in JS inside an HTML attribute.
window._cmdRevealToggle = function (xReqId, revealed) {
  const s = window._cmdStreamSessions && window._cmdStreamSessions[xReqId];
  if (!s) return;
  s.commandRevealed = !!revealed;
  if (s.rebuildCallback) s.rebuildCallback();
};

function startStreamingSession(streamUrl, username, password, xRequestId, infraId, spinnerId, appliedDnsUrl, templateCommands) {
  const session = {
    xRequestId,
    infraId,
    spinnerId,
    streamUrl,
    appliedDnsUrl: appliedDnsUrl || null,
    templateCommands: templateCommands || [],  // pre-substitution command text (no real secrets)
    commandRevealed: false,                    // blur/reveal toggle state — survives rebuildModal() calls
    startTime: Date.now(),
    nodeState: {},        // { nodeId: { status, stdoutLines: [], stderrLines: [], statusInfo: null } }
    nodeIpMap: {},        // { nodeId: publicIP } populated asynchronously from Tumblebug infra API
    doneSummary: null,
    abortController: new AbortController(),
    rebuildCallback: null,   // set when modal is open, null when closed
    cleanupTimer: null,
    error: null,          // SSE transport/connection error
    commandError: null,   // Server-side command execution error (from CommandDone summary)
    cancelArmed: {},      // { nodeId: expiryTs } — two-click confirm state for per-Node cancel
    cancelPending: {},    // { nodeId: true } — cancel API request in flight
  };

  window._cmdStreamSessions[xRequestId] = session;
  updateStreamingBadge();

  // Best-effort lookup of each Node's public IP so $$ENDPOINT[…](http://0.0.0.0:…)
  // can be rewritten to the actual reachable URL in the live streaming view.
  // Failures are non-fatal: the URL simply stays at its original 0.0.0.0/localhost.
  (async () => {
    try {
      const cfg = (typeof getConfig === 'function') ? getConfig() : {};
      const ns = cfg.namespace || window.configNamespace;
      if (!cfg.hostname || !cfg.port || !ns || !infraId) return;
      const res = await axios.get(
        `${tbApiBase()}/ns/${ns}/infra/${infraId}`,
        { auth: { username: cfg.username, password: cfg.password } }
      );
      const nodes = (res.data && res.data.node) || [];
      nodes.forEach((nd) => {
        if (nd && nd.id) session.nodeIpMap[nd.id] = nd.publicIP || '';
      });
      if (session.rebuildCallback) session.rebuildCallback();
    } catch (err) {
      console.warn('[Streaming] Failed to fetch Node IPs for endpoint rewrite:', err && err.message);
    }
  })();

  const getOrCreateNode = (nodeId) => {
    if (!session.nodeState[nodeId]) {
      session.nodeState[nodeId] = { status: 'Queued', stdoutLines: [], stderrLines: [], statusInfo: null };
    }
    return session.nodeState[nodeId];
  };

  // Start background SSE consumption
  consumeSSEStream(streamUrl, username, password, session.abortController, (event) => {
    // console.log('[SSE] Event received:', event.type, event.nodeId || '', event);
    if (event.type === 'CommandStatus' && event.nodeId) {
      const nd = getOrCreateNode(event.nodeId);
      nd.status = event.status?.status || nd.status;
      nd.statusInfo = event.status || nd.statusInfo;
      // commandIndex is required to build the per-Node taskId ({xRequestId}:{nodeId}:{index})
      // for the task cancel API
      if (typeof event.commandIndex === 'number' && event.commandIndex > 0) nd.commandIndex = event.commandIndex;
    } else if (event.type === 'CommandLog' && event.nodeId && event.log) {
      const nd = getOrCreateNode(event.nodeId);
      if (typeof event.commandIndex === 'number' && event.commandIndex > 0) nd.commandIndex = event.commandIndex;
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
    // No events yet: the run may already have finished before we subscribed
    // (short bootstrap commands complete in seconds). Fall back to the stored
    // result instead of leaving the user with a scary timeout message.
    if (elapsed > 8 && Object.keys(session.nodeState).length === 0 && !session._fallbackTried) {
      session._fallbackTried = true;
      tryPostCommandResultFallback(session);
    }
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
 * Late-subscriber fallback: when a stream produces no events, the run has usually
 * already finished. Read the Infra and render its stored post-deployment result so
 * the user sees the outcome instead of an empty stream.
 */
function tryPostCommandResultFallback(session) {
  if (!session || !session.infraId) return;
  const cfg = getConfig();
  const ns = window.configNamespace || cfg.namespace || '';
  axios({ method: 'get', url: `${tbApiBase()}/ns/${ns}/infra/${session.infraId}`,
          auth: { username: cfg.username, password: cfg.password } })
    .then((res) => {
      const data = res.data || {};
      const status = data.postCommandStatus;
      if (!status || status === 'Running' || status === 'None') return; // still running: keep waiting
      Swal.close();
      Swal.fire({
        title: `Post-deployment result: ${data.id || session.infraId}`,
        width: 800,
        html: `${POPUP_STYLES}
          <div class="popup-container" style="text-align:left;">
            <div style="font-size:0.82rem;color:#475569;margin-bottom:8px;">
              The bootstrap had already finished when the stream was opened, so the recorded result is shown.
            </div>
            ${buildPostCommandStatusHtml(data)}
          </div>`,
        showConfirmButton: false, showCancelButton: true, cancelButtonText: '✕ Close',
      });
      removeSpinnerTask(session.spinnerId);
      if (session._waitingTimer) clearInterval(session._waitingTimer);
    })
    .catch(() => { /* keep the stream waiting; the 60s message still applies */ });
}

/**
 * Cancel a single Node's command execution via the Tumblebug task cancel API.
 * Uses a two-click confirm (arm then confirm) so no extra dialog is needed on
 * top of the streaming modal. taskId format: {xRequestId}:{nodeId}:{commandIndex}
 */
function _cmdCancelNodeTask(session, nodeId) {
  const nd = session.nodeState[nodeId];
  if (!nd || !(nd.commandIndex > 0) || session.cancelPending[nodeId]) return;

  // Repaint via the session's live callback: it is nulled when the modal
  // closes, so async repaints (arm expiry, API response) can never paint
  // this session's state into another session's modal.
  const repaint = () => { if (session.rebuildCallback) session.rebuildCallback(); };

  const now = Date.now();
  if (!session.cancelArmed[nodeId] || session.cancelArmed[nodeId] <= now) {
    // First click: arm the button for 8 seconds
    session.cancelArmed[nodeId] = now + 8000;
    repaint();
    setTimeout(repaint, 8200); // repaint back to normal state after arm expires
    return;
  }

  // Second click within the arm window: fire the cancel API
  delete session.cancelArmed[nodeId];
  session.cancelPending[nodeId] = true;
  nd.cancelError = null;
  repaint();

  const cfg = (typeof getConfig === 'function') ? getConfig() : {};
  const ns = cfg.namespace || window.configNamespace;
  if (!cfg.hostname || !cfg.port || !ns || !session.infraId) {
    delete session.cancelPending[nodeId];
    nd.cancelError = 'Missing server configuration for cancel request';
    repaint();
    return;
  }
  // taskId components (xRequestId, nodeId) are validated lowercase [a-z0-9-]
  // strings and ':' is a legal path character, so no URL encoding — this also
  // keeps compatibility with Tumblebug versions that don't unescape the param.
  const taskId = `${session.xRequestId}:${nodeId}:${nd.commandIndex}`;
  const url = `${tbApiBase()}/ns/${ns}/cmd/infra/${session.infraId}/task/${taskId}/cancel`;
  axios.post(url, { reason: 'Cancelled from streaming view' }, {
    auth: { username: cfg.username, password: cfg.password },
    timeout: 15000,
  }).then(() => {
    // The status flips to Cancelled via the SSE CommandStatus event published
    // by the server — no local state change needed beyond clearing the flag.
    delete session.cancelPending[nodeId];
    repaint();
  }).catch((err) => {
    delete session.cancelPending[nodeId];
    nd.cancelError = (err.response && err.response.data && err.response.data.message) || err.message || 'Cancel request failed';
    repaint();
  });
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
      'Failed': '#dc3545', 'CompletedWithError': '#fd7e14', 'Timeout': '#fd7e14',
      'Cancelled': '#6c757d', 'Interrupted': '#ffc107'
    };
    const bg = colors[status] || '#6c757d';
    return `<span style="display:inline-block;padding:1px 7px;border-radius:3px;font-size:10px;font-weight:600;color:#fff;background:${bg};">${window.escapeHtml(status)}</span>`;
  };

  const renderNodePanel = (nodeId) => {
    const nd = session.nodeState[nodeId];
    if (!nd) return '';
    const stdoutText = nd.stdoutLines.join('\n');
    const stderrText = nd.stderrLines.join('\n');
    // ctx is consumed by _escAndLinkify: nodeIp rewrites 0.0.0.0/localhost URLs,
    // infraId+nodeId carry context for $$FILEPATH download chips.
    const ndCtx = {
      infraId: session.infraId,
      nodeId,
      nodeIp: (session.nodeIpMap && session.nodeIpMap[nodeId]) || '',
    };

    // Per-Node cancel button: only for still-active executions with a known
    // commandIndex (required to build the taskId for the cancel API).
    let cancelBtnHtml = '';
    if (['Queued', 'Handling'].includes(nd.status) && nd.commandIndex > 0) {
      const safeId = window.escapeHtml(nodeId);
      if (session.cancelPending[nodeId]) {
        cancelBtnHtml = `<span style="margin-left:auto;font-size:10px;color:#888;">⏳ Cancelling...</span>`;
      } else if (session.cancelArmed[nodeId] && session.cancelArmed[nodeId] > Date.now()) {
        cancelBtnHtml = `<button class="stream-cancel-btn" data-nodeid="${safeId}" type="button"
          title="Click again to confirm cancellation"
          style="margin-left:auto;padding:1px 8px;font-size:10px;font-weight:600;border:1px solid #dc3545;border-radius:3px;cursor:pointer;background:#dc3545;color:#fff;">⚠️ Confirm cancel?</button>`;
      } else {
        cancelBtnHtml = `<button class="stream-cancel-btn" data-nodeid="${safeId}" type="button"
          title="Cancel this Node's command execution"
          style="margin-left:auto;padding:1px 8px;font-size:10px;border:1px solid #dc3545;border-radius:3px;cursor:pointer;background:#fff;color:#dc3545;">✋ Cancel</button>`;
      }
    }

    let html = `
      <div style="margin-bottom:4px;display:flex;align-items:center;gap:8px;">
        <span style="font-weight:600;font-size:12px;color:#333;">${window.escapeHtml(nodeId)}</span>
        ${statusBadge(nd.status)}
        ${nd.statusInfo && nd.statusInfo.elapsedTime ? `<span style="font-size:10px;color:#888;">${nd.statusInfo.elapsedTime}s</span>` : ''}
        ${cancelBtnHtml}
      </div>`;

    if (nd.cancelError) {
      html += `
      <div style="margin-bottom:4px;padding:4px 8px;background:#fff3e0;border-left:4px solid #e65100;border-radius:4px;font-size:11px;color:#e65100;">
        Cancel failed: ${window.escapeHtml(nd.cancelError)}
      </div>`;
    }

    // Show error details for terminal error states (SSH connection failure,
    // command timeout, non-zero exit, user cancellation)
    if (['Failed', 'Timeout', 'CompletedWithError', 'Cancelled'].includes(nd.status) && nd.statusInfo) {
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
        <div style="background:#e8f5e9;padding:2px 8px;font-size:10px;color:#2e7d32;font-weight:600;display:flex;align-items:center;justify-content:space-between;">
          <span>stdout (${nd.stdoutLines.length} lines)</span>
          <button class="stream-copy-btn" data-nodeid="${window.escapeHtml(nodeId)}" data-type="stdout" type="button"
            title="Copy stdout to clipboard"
            style="padding:0 5px;font-size:10px;line-height:1.6;border:1px solid #a5d6a7;border-radius:3px;cursor:pointer;background:#fff;color:#2e7d32;">📋 Copy</button>
        </div>
        <pre data-scrollkey="${window.escapeHtml(nodeId)}-stdout" style="margin:0;padding:6px 8px;background:#1e1e1e;color:#d4d4d4;font-size:11px;line-height:1.4;overflow-x:auto;white-space:pre-wrap;word-break:break-all;max-height:300px;overflow-y:auto;">${_escAndLinkify(stdoutText, ndCtx)}</pre>
      </div>`;
    }

    if (stderrText) {
      html += `
      <div style="margin-bottom:4px;">
        <div style="background:#fff3e0;padding:2px 8px;font-size:10px;color:#e65100;font-weight:600;display:flex;align-items:center;justify-content:space-between;">
          <span>stderr (${nd.stderrLines.length} lines)</span>
          <button class="stream-copy-btn" data-nodeid="${window.escapeHtml(nodeId)}" data-type="stderr" type="button"
            title="Copy stderr to clipboard"
            style="padding:0 5px;font-size:10px;line-height:1.6;border:1px solid #ffcc80;border-radius:3px;cursor:pointer;background:#fff;color:#e65100;">📋 Copy</button>
        </div>
        <pre data-scrollkey="${window.escapeHtml(nodeId)}-stderr" style="margin:0;padding:6px 8px;background:#2e1e1e;color:#ffab91;font-size:11px;line-height:1.4;overflow-x:auto;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto;">${_escAndLinkify(stderrText, ndCtx)}</pre>
      </div>`;
    }

    return html;
  };

  // Auto-scroll toggle state (default: on)
  let autoScroll = true;

  // Document-level capture listener for $$RESULT chip buttons (copy / open / download).
  // Lives across rebuildModal() innerHTML swaps because it's bound at document scope.
  let streamRcBtnClick = null;

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

    // Save scroll positions before innerHTML replacement (used when autoScroll is OFF)
    const savedScrollPositions = {};
    container.querySelectorAll('pre[data-scrollkey]').forEach(pre => {
      savedScrollPositions[pre.dataset.scrollkey] = pre.scrollTop;
    });

    const nodeIds = Object.keys(session.nodeState).sort();
    const totalNodes = nodeIds.length;
    const completedCount = nodeIds.filter(id => ['Completed','CompletedWithError','Failed','Timeout','Cancelled','Interrupted'].includes(session.nodeState[id].status)).length;
    const handlingCount = nodeIds.filter(id => session.nodeState[id].status === 'Handling').length;
    const isFinished = session.doneSummary !== null;

    const streamDnsLinkHtml = session.appliedDnsUrl ? `
      <div style="padding:5px 10px;background:#e8f4fd;border:1px solid #b8daff;border-radius:5px;margin-bottom:6px;font-size:11px;display:flex;align-items:center;gap:6px;">
        <span>🌐</span>
        <a href="${session.appliedDnsUrl}" target="_blank" style="color:#0d6efd;font-weight:600;text-decoration:none;">${window.escapeHtml(session.appliedDnsUrl)}</a>
        <span style="color:#888;">(open in new tab)</span>
      </div>` : '';

    // Command banner: show pre-substitution template so <PLACEHOLDER> tokens are visible,
    // not actual secret values. Blurred by default; reveal toggle persists across rebuilds
    // via session.commandRevealed (survives the 100 ms rebuildModal() cycle).
    let cmdBannerHtml = '';
    if (session.templateCommands && session.templateCommands.length > 0) {
      const cmdLines = session.templateCommands.map(c => window.escapeHtml(c));
      const blurStyle = session.commandRevealed ? '' : 'filter:blur(5px);user-select:none;';
      const safeXReqId = window.escapeHtml(xRequestId);
      const toggleEmoji = session.commandRevealed ? '🙈' : '👁️';
      const toggleRevealed = session.commandRevealed ? 'false' : 'true';
      cmdBannerHtml = `
        <div style="display:flex;align-items:flex-start;gap:6px;padding:5px 8px;
                    background:#1e1e1e;border:1px solid #333;border-radius:5px;margin-bottom:6px;">
          <button type="button" data-xreqid="${safeXReqId}"
            onclick="window._cmdRevealToggle(this.dataset.xreqid, ${toggleRevealed})"
            title="${session.commandRevealed ? 'Hide command' : 'Reveal command'}"
            style="flex-shrink:0;padding:0;font-size:14px;line-height:1;border:none;
                   background:transparent;cursor:pointer;margin-top:1px;">${toggleEmoji}</button>
          <pre style="margin:0;flex:1;font-size:11px;color:#d4d4d4;
                      white-space:pre-wrap;word-break:break-all;line-height:1.5;
                      max-height:80px;overflow-y:auto;${blurStyle}">${cmdLines.join('\n<span style="color:#569cd6;">&&</span>\n')}</pre>
        </div>`;
    }

    let summaryHtml = `
      ${streamDnsLinkHtml}
      ${cmdBannerHtml}
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
        const statusDot = {
          'Handling': '🔵', 'Completed': '🟢', 'Failed': '🔴',
          'CompletedWithError': '🟠', 'Timeout': '⏰', 'Cancelled': '🚫', 'Interrupted': '🟡'
        }[nd.status] || '⚪';
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

    // Per-Node cancel buttons (two-click confirm; see _cmdCancelNodeTask)
    container.querySelectorAll('.stream-cancel-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _cmdCancelNodeTask(session, btn.dataset.nodeid);
      });
    });

    // Copy-to-clipboard buttons
    container.querySelectorAll('.stream-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const nd = session.nodeState[btn.dataset.nodeid];
        if (!nd) return;
        const text = btn.dataset.type === 'stdout' ? nd.stdoutLines.join('\n') : nd.stderrLines.join('\n');
        const markCopied = () => {
          btn.textContent = '✅ Copied!';
          setTimeout(() => { btn.textContent = '📋 Copy'; }, 1500);
        };
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(markCopied).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            markCopied();
          });
        } else {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          markCopied();
        }
      });
    });

    // Auto-scroll: scroll to bottom when ON, restore previous position when OFF
    if (autoScroll) {
      container.querySelectorAll('pre').forEach(pre => { pre.scrollTop = pre.scrollHeight; });
    } else {
      container.querySelectorAll('pre[data-scrollkey]').forEach(pre => {
        const saved = savedScrollPositions[pre.dataset.scrollkey];
        if (saved !== undefined) pre.scrollTop = saved;
      });
    }
  };

  // Register rebuild callback on the session
  session.rebuildCallback = scheduleRebuild;

  Swal.fire({
    title: '🖥️ Remote Command (Streaming)',
    width: 750,
    html: `
      <div style="display:flex;justify-content:flex-end;margin-bottom:4px;">
        <button id="auto-scroll-toggle" type="button"
          style="padding:2px 10px;font-size:11px;font-weight:600;border:none;border-radius:4px;cursor:pointer;background:#198754;color:#fff;">
          ⬇️ Auto-scroll: ON
        </button>
      </div>
      <div id="stream-body" style="text-align:left;max-height:70vh;overflow-y:auto;">
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
      // Wire up auto-scroll toggle button
      const toggleBtn = Swal.getPopup().querySelector('#auto-scroll-toggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          autoScroll = !autoScroll;
          toggleBtn.textContent = autoScroll ? '⬇️ Auto-scroll: ON' : '⏸️ Auto-scroll: OFF';
          toggleBtn.style.background = autoScroll ? '#198754' : '#6c757d';
          if (autoScroll) {
            // Immediately scroll to bottom when re-enabling
            const container = Swal.getPopup().querySelector('#stream-body');
            if (container) container.querySelectorAll('pre').forEach(pre => { pre.scrollTop = pre.scrollHeight; });
          }
        });
      }
      // Shared $$RESULT chip handler (copy / open / download) — same behavior as
      // the non-streaming result viewer. Uses document-level capture so the
      // listener works across rebuildModal() innerHTML replacements without
      // needing per-button re-binding.
      streamRcBtnClick = _createRcBtnClickHandler(Swal.getPopup());
      document.addEventListener('click', streamRcBtnClick, true);
    },
    willClose: () => {
      // Detach view callback — stream continues in background
      session.rebuildCallback = null;
      if (rebuildTimer) clearTimeout(rebuildTimer);
      if (streamRcBtnClick) document.removeEventListener('click', streamRcBtnClick, true);
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
    const completedNodes = nodeIds.filter(id => ['Completed','CompletedWithError','Failed','Timeout','Cancelled','Interrupted'].includes(s.nodeState[id].status)).length;
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

// Set (register) a bastion for a SUBNET. Bastions are stored per subnet in
// CB-Tumblebug and serve every node in that subnet, so this dialog is framed
// around "which node is the bastion for this subnet" rather than a per-target
// assignment. `preset` (from the Net-graph right-click menu) scopes the dialog
// to a specific subnet and pre-selects the clicked node as the bastion:
//   { targetInfraId, subnetMemberNodeId, subnetId, defaultBastionNodeId }
async function setBastionNode(preset) {
  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = window.configNamespace || config.namespace || '';
  var infraid = (preset && preset.targetInfraId) || getSelectedInfraId();
  const hasPreset = !!(preset && preset.subnetMemberNodeId);
  const presetSubnetMemberNodeId = (preset && preset.subnetMemberNodeId) || '';
  const presetDefaultBastionNodeId = (preset && preset.defaultBastionNodeId) || '';

  if (!namespace || !infraid || infraid === 'all') {
    errorAlert("Please select a namespace and a specific Infra first");
    return;
  }

  // Load the nodes of the (target) Infra so we can group them by subnet.
  let nodes = [];
  try {
    const infraRes = await axios.get(
      `${tbApiBase()}/ns/${namespace}/infra/${infraid}`,
      { auth: { username, password } }
    );
    nodes = infraRes.data.node || [];
  } catch (err) {
    console.error("Failed to fetch target Infra Nodes:", err);
  }

  const esc = (v) => window.escapeHtml(String(v == null ? '' : v));

  // Resolve which subnet this dialog targets.
  let presetSubnetId = (preset && preset.subnetId) || '';
  if (hasPreset && !presetSubnetId) {
    const m = nodes.find(n => String(n.id) === String(presetSubnetMemberNodeId));
    presetSubnetId = m ? (m.subnetId || '') : '';
  }

  // Options for the "pick any node to identify the subnet" selector (no-preset).
  const subnetPickerOptions = ['<option value="">-- select a node in the target subnet --</option>']
    .concat(nodes.map(n => {
      const ip = n.publicIP ? ` (${n.publicIP})` : '';
      return `<option value="${esc(n.id)}" data-subnet="${esc(n.subnetId || '')}">` +
        `${esc(n.id)} — subnet ${esc(n.subnetId || '?')}${esc(ip)}</option>`;
    })).join('');

  // Read-only "serves" block when the subnet is fixed by the preset; otherwise a picker.
  const servesHtml = hasPreset
    ? `<div class="popup-row">
         <div class="popup-col"><div class="popup-field"><label class="popup-label">Namespace</label><span class="popup-value">${esc(namespace)}</span></div></div>
         <div class="popup-col"><div class="popup-field"><label class="popup-label">Infra</label><span class="popup-value">${esc(infraid)}</span></div></div>
         <div class="popup-col" style="flex:2;"><div class="popup-field"><label class="popup-label">Subnet</label><span class="popup-value">${esc(presetSubnetId || '(unknown)')}</span></div></div>
       </div>
       <div class="popup-row"><div class="popup-col"><span class="popup-hint">All nodes in this subnet use this bastion.</span></div></div>`
    : `<div class="popup-row">
         <div class="popup-col"><div class="popup-field"><label class="popup-label">Namespace</label><span class="popup-value">${esc(namespace)}</span></div></div>
         <div class="popup-col"><div class="popup-field"><label class="popup-label">Infra</label><span class="popup-value">${esc(infraid)}</span></div></div>
         <div class="popup-col" style="flex:2;"><div class="popup-field"><label class="popup-label">Subnet (pick any node in it)</label>
           <select id="subnetMemberSel" class="popup-select">${subnetPickerOptions}</select></div></div>
       </div>`;

  Swal.fire({
    title: "🛡️ Set Bastion for Subnet",
    width: 680,
    html: `
    ${POPUP_STYLES}
    <div class="popup-container">

      <!-- Which subnet this bastion serves -->
      <div class="popup-section">
        <div class="popup-section-title">🌐 Bastion serves (subnet)</div>
        ${servesHtml}
      </div>

      <!-- Which node acts as the bastion -->
      <div class="popup-section">
        <div class="popup-section-title">🛡️ Bastion node (jump host)</div>
        <div class="popup-row" style="gap:16px;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9rem;">
            <input type="radio" name="bastionMode" value="subnet" checked> Node in this subnet
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9rem;">
            <input type="radio" name="bastionMode" value="external"> External bastion (other NS / Infra)
          </label>
        </div>

        <!-- Simple: a node in the same subnet -->
        <div id="bastionSubnetBlock" class="popup-row">
          <div class="popup-col" style="flex:2;">
            <div class="popup-field">
              <label class="popup-label">Bastion Node (same subnet)</label>
              <select id="bastionSubnetNodeSel" class="popup-select"><option value="">-- loading --</option></select>
            </div>
          </div>
          <div class="popup-col"><span class="popup-hint">💡 A node with a ✅ public IP is required so CB-TB can reach it to relay remote commands.</span></div>
        </div>

        <!-- Advanced: external bastion (e.g. AWS node running OpenStack that fronts a new provider) -->
        <div id="bastionExternalBlock" style="display:none;">
          <div class="popup-row">
            <div class="popup-col">
              <div class="popup-field">
                <label class="popup-label">Namespace</label>
                <input type="text" id="bastionNsId" class="popup-input" value="${esc(namespace)}"
                  placeholder="${esc(namespace)}" title="Bastion Node's namespace (leave as-is for same namespace)">
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
                <select id="bastionInfraId" class="popup-select"><option value="">-- click Load Infras --</option></select>
              </div>
            </div>
            <div class="popup-col" style="flex: 2;">
              <div class="popup-field">
                <label class="popup-label">Bastion Node</label>
                <select id="bastionNodeId" class="popup-select"><option value="">-- select Infra first --</option></select>
              </div>
            </div>
          </div>
          <div class="popup-row"><div class="popup-col">
            <span class="popup-hint">💡 For cross-namespace bastions (e.g. an AWS node in a shared-services namespace fronting an OpenStack provider), set the namespace and click Load Infras.</span>
          </div></div>
        </div>
      </div>

    </div>`,
    showCancelButton: true,
    confirmButtonText: "Set Bastion",
    cancelButtonText: "Cancel",
    didOpen: () => {
      const subnetSel = document.getElementById('subnetMemberSel'); // null when preset-fixed
      const subnetNodeSel = document.getElementById('bastionSubnetNodeSel');
      const subnetBlock = document.getElementById('bastionSubnetBlock');
      const externalBlock = document.getElementById('bastionExternalBlock');

      const currentSubnetId = () => {
        if (hasPreset) return presetSubnetId;
        const opt = subnetSel && subnetSel.selectedOptions[0];
        return opt ? (opt.getAttribute('data-subnet') || '') : '';
      };
      const repopulateSubnetBastions = (preselectId) => {
        const sid = currentSubnetId();
        const inSubnet = nodes.filter(n => (n.subnetId || '') === sid);
        if (!sid) {
          subnetNodeSel.innerHTML = '<option value="">-- pick the subnet first --</option>';
          return;
        }
        if (!inSubnet.length) {
          subnetNodeSel.innerHTML = '<option value="">-- no nodes in this subnet --</option>';
          return;
        }
        subnetNodeSel.innerHTML = inSubnet.map(n => {
          const has = !!n.publicIP;
          const label = has ? `${n.id}  ✅ ${n.publicIP}` : `${n.id}  (no public IP)`;
          const sel = preselectId && String(n.id) === String(preselectId) ? ' selected' : '';
          const style = has ? '' : ' style="color:#aaa"';
          return `<option value="${esc(n.id)}"${sel}${style}>${esc(label)}</option>`;
        }).join('');
      };
      repopulateSubnetBastions(presetDefaultBastionNodeId);
      if (subnetSel) subnetSel.addEventListener('change', () => repopulateSubnetBastions(''));

      // Mode toggle: show the matching block only.
      document.querySelectorAll('input[name="bastionMode"]').forEach(r => {
        r.addEventListener('change', () => {
          const mode = document.querySelector('input[name="bastionMode"]:checked').value;
          subnetBlock.style.display = mode === 'subnet' ? '' : 'none';
          externalBlock.style.display = mode === 'external' ? '' : 'none';
        });
      });

      // External bastion loaders (advanced).
      document.getElementById('loadBastionInfraBtn').addEventListener('click', async () => {
        const bastionNs = document.getElementById('bastionNsId').value.trim();
        if (!bastionNs) { return; }
        const infraSel = document.getElementById('bastionInfraId');
        infraSel.innerHTML = '<option value="">Loading...</option>';
        document.getElementById('bastionNodeId').innerHTML = '<option value="">-- select Infra first --</option>';
        try {
          const res = await axios.get(
            `${tbApiBase()}/ns/${bastionNs}/infra?option=id`,
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
            `${tbApiBase()}/ns/${bastionNs}/infra/${bastionInfra}`,
            { auth: { username, password } }
          );
          const extNodes = res.data.node || [];
          nodeSel.innerHTML = '<option value="">-- select Node --</option>';
          extNodes.forEach(nd => {
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
      // Any node in the target subnet identifies the subnet for the API.
      const targetNodeId = hasPreset
        ? presetSubnetMemberNodeId
        : (document.getElementById('subnetMemberSel') || {}).value;
      if (!targetNodeId) {
        Swal.showValidationMessage("Please pick the target subnet (select a node in it)");
        return false;
      }
      const mode = (document.querySelector('input[name="bastionMode"]:checked') || {}).value;
      if (mode === 'external') {
        const bastionNsId = document.getElementById('bastionNsId').value.trim();
        const bastionInfraId = document.getElementById('bastionInfraId').value;
        const bastionNodeId = document.getElementById('bastionNodeId').value;
        if (!bastionInfraId || !bastionNodeId) {
          Swal.showValidationMessage("Please load Infras and select an external bastion Node");
          return false;
        }
        return { targetNodeId, bastionNsId, bastionInfraId, bastionNodeId };
      }
      // Same-subnet node acts as the bastion.
      const bastionNodeId = document.getElementById('bastionSubnetNodeSel').value;
      if (!bastionNodeId) {
        Swal.showValidationMessage("Please select a node in this subnet to act as the bastion");
        return false;
      }
      return { targetNodeId, bastionNsId: namespace, bastionInfraId: infraid, bastionNodeId };
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
      url = `${tbApiBase()}/ns/${namespace}/infra/${infraid}/node/${targetNodeId}/bastion/${bastionNodeId}`;
    } else if (sameBastionNs && bastionNodeId) {
      // Same NS, different Infra
      url = `${tbApiBase()}/ns/${namespace}/infra/${infraid}/node/${targetNodeId}/bastion/${bastionInfraId}/${bastionNodeId}`;
    } else if (sameBastionNs && !bastionNodeId) {
      // Same NS, different Infra, auto-select Node
      url = `${tbApiBase()}/ns/${namespace}/infra/${infraid}/node/${targetNodeId}/bastion/${bastionInfraId}/`;
    } else if (bastionNodeId) {
      // Cross-NS with explicit Node
      url = `${tbApiBase()}/ns/${namespace}/infra/${infraid}/node/${targetNodeId}/bastion/${bastionNsId}/${bastionInfraId}/${bastionNodeId}`;
    } else {
      // Cross-NS, auto-select Node — not supported via URL params; fall back to explicit auto-select call
      url = `${tbApiBase()}/ns/${namespace}/infra/${infraid}/node/${targetNodeId}/bastion/${bastionNsId}/${bastionInfraId}/`;
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
  var namespace = window.configNamespace || config.namespace || '';
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
    const infraListUrl = `${tbApiBase()}/ns/${namespace}/infra?option=id`;
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
                <input type="number" id="timeoutMinutes" class="popup-input" style="width: 60px;" value="${defaultRemoteCommandTimeout > 0 ? defaultRemoteCommandTimeout : 30}" min="1" max="120">
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

      <!-- Predefined Scripts + Parameters + Commands (shared command composer) -->
      ${window.generateCommandComposerHtml({ commands: defaultRemoteCommand })}

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
        let uploadUrl = `${tbApiBase()}/ns/${namespace}/transferFile/infra/${infraId}`;
        if (radioValue === 'NodeGroup') uploadUrl += `?nodeGroupId=${encodeURIComponent(nodegroupid)}`;
        else if (radioValue === 'Node') uploadUrl += `?nodeId=${encodeURIComponent(nodeid)}`;

        const btn = document.getElementById('rcUploadBtn');
        btn.disabled = true;
        statusEl.innerHTML = `<span style="color:#0d6efd;">⏳ Uploading 0/${files.length}...</span>`;

        const CONCURRENCY = 3;
        let completed = 0;
        let succeeded = 0;
        let failed = 0;
        const failedNames = new Set();

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
                failedNames.add(file.name);
                console.warn(`RC upload Node-level failure for ${file.name}:`, nodeFails);
              } else {
                succeeded++;
              }
            } catch (e) {
              failed++;
              failedNames.add(file.name);
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

        // Auto-insert run commands for successfully uploaded shell scripts
        const appendRunCommand = (text) => {
          const cmdContainer = document.getElementById('cmdContainer');
          if (!cmdContainer) return;
          let target = Array.from(cmdContainer.querySelectorAll('textarea[id^="cmd"]'))
            .find(t => !t.value.trim());
          if (!target) {
            if (typeof window.addCmd === 'function') window.addCmd();
            const all = cmdContainer.querySelectorAll('textarea[id^="cmd"]');
            target = all[all.length - 1];
          }
          if (target && !target.value.trim()) {
            target.value = text;
            if (typeof autoResizeTextarea === 'function') autoResizeTextarea(target);
          }
        };
        const uploadedScripts = files.filter(f => /\.(sh|bash)$/i.test(f.name) && !failedNames.has(f.name));
        uploadedScripts.forEach(f => appendRunCommand(`bash /home/cb-user/${f.name}`));
        if (uploadedScripts.length > 0) {
          statusMsg += `<div style="margin-top:4px; color:#0d6efd; font-size:0.75rem;">▶ Run command${uploadedScripts.length > 1 ? 's' : ''} added to Commands below</div>`;
        }
        statusEl.innerHTML = statusMsg;
      });

      // Load Route53 hosted zones; show DNS section only if available
      (async () => {
        try {
          const res = await axios.get(
            `${tbApiBase()}/resources/globalDns/hostedZone`,
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
            `${tbApiBase()}/resources/globalDns/record`,
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
      // Capture raw (pre-substitution) command text for safe display in the streaming modal.
      // collectCommands() replaces <PLACEHOLDER> tokens with real values (which may include
      // secrets like API keys); we keep the template so the modal can show intent without
      // exposing the actual secret values.
      const cmdContainer = document.getElementById('cmdContainer');
      const templateCommands = cmdContainer
        ? Array.from(cmdContainer.querySelectorAll('[id^="cmdDiv"]'))
            .map((_, i) => document.getElementById(`cmd${i + 1}`)?.value?.trim() || '')
            .filter(Boolean)
        : [];

      const commands = collectCommands();
      const selectedInfra = document.getElementById("infraSelector").value;
      const timeout = parseInt(document.getElementById("timeoutMinutes").value) || 30;
      const syncMode = document.getElementById("syncModeToggle")?.checked || false;
      const labelSelector = document.getElementById('labelSelector')?.value || '';
      const sshUserName = document.getElementById('sshUserName')?.value?.trim() || '';
      return { commands, templateCommands, selectedInfra, timeout, syncMode, labelSelector, sshUserName, appliedDnsUrl: _appliedDnsUrl };
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
        const templateCommands = result.value.templateCommands || [];
        
        // Handle radio button value
        const radioValue = Swal.getPopup().querySelector(
          'input[name="selectOption"]:checked'
        ).value;
        if (radioValue === "Infra") {
          var url = `${tbApiBase()}/ns/${namespace}/cmd/infra/${selectedInfraId}`;
          console.log("Performing remote command for Infra:", selectedInfraId);
        } else if (radioValue === "NodeGroup") {
          var url = `${tbApiBase()}/ns/${namespace}/cmd/infra/${selectedInfraId}?nodeGroupId=${encodeURIComponent(nodegroupid)}`;
          console.log("Performing remote command for NodeGroup:", nodegroupid, "in Infra:", selectedInfraId);
        } else if (radioValue === "Node") {
          var url = `${tbApiBase()}/ns/${namespace}/cmd/infra/${selectedInfraId}?nodeId=${encodeURIComponent(nodeid)}`;
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
            showRemoteCmdResult(res.data, appliedDnsUrl, selectedInfraId);
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
              var streamUrl = `${tbApiBase()}/ns/${namespace}/stream/cmd/infra/${selectedInfraId}?xRequestId=${encodeURIComponent(xReqId)}`;
              console.log('[RemoteCmd] Starting streaming session:', xReqId);
              startStreamingSession(streamUrl, username, password, xReqId, selectedInfraId, spinnerId, appliedDnsUrl, templateCommands);
            } else {
              // Fallback: sync response (async=true not in URL or server returned non-202)
              console.warn('[RemoteCmd] Sync fallback - status:', res.status, 'data:', res.data);
              showRemoteCmdResult(res.data, appliedDnsUrl, selectedInfraId);
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

// Function for transferFileToInfra by remoteCmd button item.
//
// Optional `opts` lets callers preset the dialog state (used by the $$FILEPATH
// chip in the Remote Command result viewer to launch the dialog with the right
// download target already filled in):
//   - mode:       'upload' | 'download' (default 'upload')
//   - infraId:    initially selected Infra (defaults to current selection)
//   - nodeId:     initially selected Node (defaults to current selection)
//   - sourcePath: pre-filled "Source Path on Node" when mode === 'download'
async function transferFileToInfra(opts = {}) {
  var config = getConfig(); var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = window.configNamespace || config.namespace || '';
  var infraid = opts.infraId || (infraidElement ? infraidElement.value : '');
  var nodegroupid = getNodeGroupIdFromNodeSelection();
  var nodeid = opts.nodeId || document.getElementById("nodeid").value;
  var presetMode = opts.mode === 'download' ? 'download' : 'upload';
  var presetSourcePath = opts.sourcePath || '';

  if (!namespace) {
    errorAlert("Please select a namespace first");
    return;
  }

  // Fetch Infra list for selector
  let infraListOptions = [];
  try {
    const infraListUrl = `${tbApiBase()}/ns/${namespace}/infra?option=id`;
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
      const vmListUrl = `${tbApiBase()}/ns/${namespace}/infra/${targetInfraId}`;
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

      // Apply preset options (e.g., when invoked from a $$FILEPATH chip in the
      // Remote Command result viewer). Switch to download mode and pre-fill the
      // Source Path on Node so the user only has to confirm.
      if (presetMode === 'download') {
        try { window.switchFileTransferMode('download'); } catch (_) { /* noop */ }
        if (presetSourcePath) {
          const sp = document.getElementById('sourcePathInput');
          if (sp) sp.value = presetSourcePath;
        }
        // Ensure the requested Node is selected in the download Node selector.
        if (nodeid) {
          const sel = document.getElementById('downloadNodeSelector');
          if (sel) {
            const hasOpt = Array.from(sel.options).some(o => o.value === nodeid);
            if (hasOpt) sel.value = nodeid;
          }
        }
      }
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
        let url = `${tbApiBase()}/ns/${namespace}/${endpoint}/infra/${selectedInfra}`;
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
        const url = `${tbApiBase()}/ns/${namespace}/downloadFile/infra/${selectedInfra}/node/${selectedVm}`;

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

  console.log(
    "Retrieve access information for Infra:" + infraid
  );

    var url = `${tbApiBase()}/ns/${namespace}/infra/${infraid}?option=accessinfo`;

    axios({
      method: "get",
      url: url,
      auth: {
        username: `${username}`,
        password: `${password}`,
      },
    }).then((res) => {
      console.log(res); // for debug
      displayAccessInfoGui(res.data, infraid);
    });
}
window.getAccessInfo = getAccessInfo;


// SSH Key save function (single Node)
const saveBtn = document.querySelector(".save-file");
if (saveBtn) {
  saveBtn.addEventListener("click", function () {
    console.log(" [Retrieve Infra Access Information ...]\n");

    var config = getConfig(); var hostname = config.hostname;
    var port = config.port;
    var username = config.username;
    var password = config.password;
    var namespace = window.configNamespace || config.namespace || '';
    var infraid = infraidElement.value;
    var groupid = getNodeGroupIdFromNodeSelection();
    var nodeid = document.getElementById("nodeid").value;

    var url = `${tbApiBase()}/ns/${namespace}/infra/${infraid}?option=accessinfo&accessInfoOption=showSshKey`;

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
}

// Download ALL Node SSH keys in an Infra as a single zip file
// infraIdOverride: optional Infra id (e.g., passed from the provisioning result
// popup). When omitted, falls back to the currently selected #infraid input.
function downloadAllSshKeys(infraIdOverride) {
  console.log(" [Download All SSH Keys as ZIP ...]\n");

  var config = getConfig();
  var hostname = config.hostname;
  var port = config.port;
  var username = config.username;
  var password = config.password;
  var namespace = window.configNamespace || config.namespace || '';
  var infraid = infraIdOverride || (infraidElement ? infraidElement.value : "");

  if (!namespace || !infraid) {
    Swal.fire("Error", "Please select a namespace and Infra first.", "warning");
    return;
  }

  var url = `${tbApiBase()}/ns/${namespace}/infra/${infraid}?option=accessinfo&accessInfoOption=showSshKey`;

  Swal.fire({
    title: "Downloading SSH Keys...",
    html: "Retrieving access information for all Nodes.",
    allowOutsideClick: false,
    didOpen: () => { Swal.showLoading(); }
  });

  // Fetch both Infra info and access info in parallel
  var infraInfoUrl = `${tbApiBase()}/ns/${namespace}/infra/${infraid}`;
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
window.startStreamingSession = startStreamingSession;

export {
  executeRemoteCmd,
  transferFileToInfra,
  downloadAllSshKeys,
  getAccessInfo,
  startStreamingSession,
};

