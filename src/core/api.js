/**
 * CB-Tumblebug API client and endpoint configuration
 * @module core/api
 */
import axios from 'axios';

export function normalizeHostname(h) {
  return h.includes(':') && !h.startsWith('[') ? '[' + h + ']' : h;
}

const API_CONFIG_KEY = 'mapui-api-config';
export const isValidHostname = (v) => typeof v === 'string' && /^[A-Za-z0-9.\-:[\]]{1,253}$/.test(v);
export const isValidPort = (v) => typeof v === 'string' && /^\d{1,5}$/.test(v) && Number(v) <= 65535;
export const isValidName = (v) => typeof v === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(v);
export const isValidBaseUrl = (v) =>
  typeof v === 'string' &&
  /^https?:\/\/[A-Za-z0-9.\-:[\]]+(\/[A-Za-z0-9._\-/]*)?$/.test(v) &&
  !/[<>"'\s]/.test(v);

window.isValidHostname = isValidHostname;
window.isValidPort = isValidPort;
window.isValidName = isValidName;
window.isValidBaseUrl = isValidBaseUrl;

export let configHostname = normalizeHostname(window.location.hostname || 'localhost');
export let configPort = '1323';
export let configUsername = 'default';
export let configPassword = 'default';
export let configCredentialHolder = 'admin';
export let configNamespace = 'default';
export let configApiBaseUrl = '';

try {
  const saved = JSON.parse(localStorage.getItem(API_CONFIG_KEY) || '{}');
  if (isValidHostname(saved.hostname)) configHostname = normalizeHostname(saved.hostname);
  if (isValidPort(saved.port)) configPort = saved.port;
  if (isValidName(saved.username)) configUsername = saved.username;
  if (isValidName(saved.credentialHolder)) configCredentialHolder = saved.credentialHolder;
  if (isValidBaseUrl(saved.apiBaseUrl)) configApiBaseUrl = saved.apiBaseUrl.replace(/\/+$/, '');
  if (isValidName(saved.namespace)) configNamespace = saved.namespace;
} catch (e) {
  console.warn('Failed to load saved API config:', e);
}

if (!configApiBaseUrl && window.location.port !== '1324' && window.location.protocol !== 'file:') {
  configApiBaseUrl = `${window.location.protocol}//${window.location.host}/tumblebug`;
}

export function saveApiConfig() {
  try {
    localStorage.setItem(API_CONFIG_KEY, JSON.stringify({
      hostname: configHostname,
      port: configPort,
      username: configUsername,
      credentialHolder: configCredentialHolder,
      apiBaseUrl: configApiBaseUrl,
      namespace: configNamespace,
    }));
  } catch (e) {
    console.warn('Failed to save API config:', e);
  }
}

export function tbApiBase() {
  const baseUrl = window.configApiBaseUrl || configApiBaseUrl;
  const hostname = window.configHostname || configHostname;
  const port = window.configPort || configPort;
  return baseUrl || `http://${hostname}:${port}/tumblebug`;
}

export function getConfig() {
  return {
    hostname: window.configHostname || configHostname,
    port: window.configPort || configPort,
    apiBaseUrl: window.configApiBaseUrl || configApiBaseUrl,
    username: window.configUsername || configUsername,
    password: window.configPassword || configPassword,
    credentialHolder: window.configCredentialHolder || configCredentialHolder,
    namespace: window.configNamespace || configNamespace
  };
}

export function setNamespace(ns) {
  configNamespace = ns;
  window.configNamespace = ns;
}

// Global window registrations for backwards compatibility
window.tbApiBase = tbApiBase;
window.getConfig = getConfig;
window.saveApiConfig = saveApiConfig;
window.setNamespace = setNamespace;
window.configNamespace = configNamespace;

// Dynamic properties on window for seamless inter-module access
Object.defineProperty(window, 'configHostname', {
  get: () => configHostname,
  set: (v) => { configHostname = v; },
  configurable: true
});
Object.defineProperty(window, 'configPort', {
  get: () => configPort,
  set: (v) => { configPort = v; },
  configurable: true
});
Object.defineProperty(window, 'configUsername', {
  get: () => configUsername,
  set: (v) => { configUsername = v; },
  configurable: true
});
Object.defineProperty(window, 'configPassword', {
  get: () => configPassword,
  set: (v) => { configPassword = v; },
  configurable: true
});
Object.defineProperty(window, 'configCredentialHolder', {
  get: () => configCredentialHolder,
  set: (v) => { configCredentialHolder = v; },
  configurable: true
});
Object.defineProperty(window, 'configApiBaseUrl', {
  get: () => configApiBaseUrl,
  set: (v) => { configApiBaseUrl = v; },
  configurable: true
});
Object.defineProperty(window, 'configNamespace', {
  get: () => configNamespace,
  set: (v) => { configNamespace = v; },
  configurable: true
});

// Interceptor for X-Credential-Holder (scoped to CB-Tumblebug API requests only
// so external third-party URLs neither receive internal headers nor fail CORS preflight)
axios.interceptors.request.use(function (axiosConfig) {
  const rawUrl = String(axiosConfig.url || '');
  const base = tbApiBase();
  const isExternalOrigin = /^https?:\/\//i.test(rawUrl)
    && !rawUrl.startsWith(base)
    && !rawUrl.startsWith(window.location.origin);
  if (isExternalOrigin) {
    return axiosConfig;
  }
  const holder = configCredentialHolder || window.getConfig?.()?.credentialHolder;
  if (holder && holder !== '') {
    if (!axiosConfig.headers) {
      axiosConfig.headers = {};
    }
    axiosConfig.headers['X-Credential-Holder'] = holder;
  }
  return axiosConfig;
});
