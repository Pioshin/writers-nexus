import { DataManager } from '../../DataManager.js';
import { toast } from '../shared/toast.js';
import { AIService } from '../../ai/AIService.js';
import { HubClient } from '../../HubClient.js';
import { HubSync } from '../../HubSync.js';

let modal, form, saveBtn, cancelBtn;
let aiBaseUrlInput, aiModelInput, aiApiKeyInput, aiProviderSelect;
let genericModelContainer, googleModelContainer, configGoogleModelSelect;
let refreshGoogleModelsBtn, googleModelsStatusEl, genericModelsStatusEl, modelSuggestionsEl, aiModelListSelect;
let hubEnabledToggle, hubUrlInput, hubTokenInput, testHubBtn, hubTestStatusEl;
let isInitialized = false;

function normalizeBaseUrl(url) {
  return (url || '').trim().replace(/\/+$/, '');
}

function getProviderDefaults(provider) {
  if (provider === 'ollama') {
    return { baseUrl: 'http://127.0.0.1:11434', model: '' };
  }
  if (provider === 'google') {
    return { baseUrl: '', model: 'gemini-1.5-flash' };
  }
  return { baseUrl: '', model: '' };
}

function init() {
  if (isInitialized) return;
  modal = document.getElementById('config-modal');
  form = document.getElementById('config-form');
  saveBtn = document.getElementById('save-config-btn');
  cancelBtn = document.getElementById('cancel-config-modal');
  aiBaseUrlInput = document.getElementById('config-ai-baseurl');
  aiModelInput = document.getElementById('config-ai-model');
  aiApiKeyInput = document.getElementById('config-ai-apikey');
  aiProviderSelect = document.getElementById('config-ai-provider');
  genericModelContainer = document.getElementById('generic-model-container');
  googleModelContainer = document.getElementById('google-model-container');
  configGoogleModelSelect = document.getElementById('config-google-model');
  refreshGoogleModelsBtn = document.getElementById('refresh-google-models');
  googleModelsStatusEl = document.getElementById('google-models-status');
  genericModelsStatusEl = document.getElementById('generic-models-status');
  modelSuggestionsEl = document.getElementById('config-model-suggestions');
  aiModelListSelect = document.getElementById('config-ai-model-list');
  const testConnectionBtn = document.getElementById('test-connection-btn');

  // Hub elements
  hubEnabledToggle = document.getElementById('config-hub-enabled');
  hubUrlInput = document.getElementById('config-hub-url');
  hubTokenInput = document.getElementById('config-hub-token');
  testHubBtn = document.getElementById('test-hub-btn');
  hubTestStatusEl = document.getElementById('hub-test-status');

  cancelBtn.addEventListener('click', close);
  saveBtn.addEventListener('click', save);
  aiProviderSelect.addEventListener('change', updateAIProviderUI);
  refreshGoogleModelsBtn?.addEventListener('click', loadGoogleModels);
  testConnectionBtn?.addEventListener('click', testConnection);
  testHubBtn?.addEventListener('click', testHubConnection);
  aiModelListSelect?.addEventListener('change', () => {
    const selected = aiModelListSelect.value;
    if (selected) aiModelInput.value = selected;
  });
  isInitialized = true;
}

async function testConnection() {
  const testBtn = document.getElementById('test-connection-btn');
  if (testBtn) { testBtn.textContent = 'Testing...'; testBtn.disabled = true; }

  const provider = aiProviderSelect.value;
  const baseUrl = normalizeBaseUrl(aiBaseUrlInput.value);
  const apiKey = aiApiKeyInput?.value?.trim() || '';

  try {
    const models = await fetchProviderModels(provider, baseUrl, apiKey);

    if (provider === 'google') {
      await loadGoogleModels();
      toast.success(`Connessione OK! (${provider})`);
      return;
    } else {
      applyModelSuggestions(models || []);
      const count = Array.isArray(models) ? models.length : 0;
      const msg = count
        ? `Connessione OK! (${provider}) • Modelli trovati: ${count}`
        : `Connessione OK! (${provider}) • Nessun modello elencato`;
      genericModelsStatusEl.textContent = msg;
      toast.success(msg);
    }
  } catch (e) {
    console.error("Connection Test Failed:", e);
    if (genericModelsStatusEl) {
      genericModelsStatusEl.textContent = `Errore connessione: ${e.message}`;
    }
    toast.error(`Errore Connessione: ${e.message}. Verifica CORS e URL.`);
  } finally {
    if (testBtn) { testBtn.textContent = 'Test Connessione'; testBtn.disabled = false; }
  }
}

function buildProviderHeaders(provider, apiKey = '') {
  const headers = {};
  if (!apiKey) return headers;
  if (provider === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['Authorization'] = `Bearer ${apiKey}`;
    return headers;
  }
  headers['Authorization'] = `Bearer ${apiKey}`;
  return headers;
}

function extractModelNames(provider, data) {
  if (!data || typeof data !== 'object') return [];

  if (provider === 'ollama') {
    const models = Array.isArray(data.models) ? data.models : [];
    return models
      .map(m => m?.name || m?.model)
      .filter(Boolean)
      .map(String);
  }

  if (provider === 'google') {
    const models = Array.isArray(data.models) ? data.models : [];
    return models
      .map(m => m?.name)
      .filter(Boolean)
      .map(n => (n.includes('/') ? n.split('/').pop() : n));
  }

  const list = Array.isArray(data.data)
    ? data.data
    : Array.isArray(data.models)
      ? data.models
      : [];
  return list
    .map(item => item?.id || item?.name || item?.model)
    .filter(Boolean)
    .map(String);
}

async function fetchProviderModels(provider, inputBaseUrl, apiKey = '') {
  if (provider === 'google') return [];

  const defaults = getProviderDefaults(provider);
  const baseUrl = normalizeBaseUrl(inputBaseUrl) || defaults.baseUrl;
  if (!baseUrl) throw new Error('Base URL mancante');

  const headers = buildProviderHeaders(provider, apiKey);
  const endpoints = [];

  if (provider === 'ollama') {
    const root = baseUrl.replace(/\/v1$/, '');
    endpoints.push(`${root}/api/tags`, `${root}/v1/models`, `${root}/models`);
  } else {
    endpoints.push(`${baseUrl}/models`, `${baseUrl}/v1/models`);
  }

  let lastError = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const names = extractModelNames(provider, data)
        .filter((v, i, a) => a.indexOf(v) === i)
        .sort((a, b) => a.localeCompare(b));
      return names;
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('Impossibile recuperare i modelli');
}

function applyModelSuggestions(models) {
  if (!aiModelInput) return;

  const normalized = (models || []).filter(Boolean);

  if (modelSuggestionsEl) modelSuggestionsEl.innerHTML = '';
  normalized.forEach(model => {
    const opt = document.createElement('option');
    opt.value = model;
    modelSuggestionsEl?.appendChild(opt);
  });

  if (aiModelListSelect) {
    aiModelListSelect.innerHTML = '';
    if (normalized.length) {
      normalized.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        aiModelListSelect.appendChild(option);
      });
      aiModelListSelect.classList.remove('hidden');
      if (!aiModelInput.value.trim()) {
        aiModelListSelect.value = normalized[0];
        aiModelInput.value = normalized[0];
      } else if (normalized.includes(aiModelInput.value.trim())) {
        aiModelListSelect.value = aiModelInput.value.trim();
      }
    } else {
      aiModelListSelect.classList.add('hidden');
    }
  }

  const current = (aiModelInput.value || '').trim();
  if (!current && normalized.length) {
    aiModelInput.value = normalized[0];
  }
}

function updateAIProviderUI() {
  const provider = aiProviderSelect.value;
  const defaults = getProviderDefaults(provider);

  if (!aiBaseUrlInput.value.trim() && defaults.baseUrl) {
    aiBaseUrlInput.value = defaults.baseUrl;
  }
  if (!aiModelInput.value.trim() && provider !== 'google' && defaults.model) {
    aiModelInput.value = defaults.model;
  }
  if (provider === 'google' && configGoogleModelSelect && !configGoogleModelSelect.value) {
    configGoogleModelSelect.value = defaults.model;
  }

  if (provider === 'google') {
    genericModelContainer.classList.add('hidden');
    googleModelContainer.classList.remove('hidden');
  } else {
    genericModelContainer.classList.remove('hidden');
    googleModelContainer.classList.add('hidden');
    if (aiModelListSelect && !aiModelListSelect.options.length) {
      aiModelListSelect.classList.add('hidden');
    }
  }
}

async function open() {
  const settings = await DataManager.getSettings();
  const provider = settings.aiProvider || 'openai-compatible';
  const defaults = getProviderDefaults(provider);
  if (aiProviderSelect)
    aiProviderSelect.value = provider;
  if (aiBaseUrlInput)
    aiBaseUrlInput.value = (settings.aiBaseUrl || '').trim() || defaults.baseUrl;
  if (aiModelInput)
    aiModelInput.value = (settings.aiModel || '').trim() || (provider === 'google' ? '' : defaults.model);
  if (configGoogleModelSelect)
    configGoogleModelSelect.value = (settings.aiModel || '').trim() || 'gemini-1.5-flash';
  if (aiApiKeyInput)
    aiApiKeyInput.value = settings.aiApiKey || '';

  // Hub fields
  if (hubEnabledToggle)
    hubEnabledToggle.checked = !!settings.hubEnabled;
  if (hubUrlInput)
    hubUrlInput.value = settings.hubUrl || 'http://127.0.0.1:9090';
  if (hubTokenInput)
    hubTokenInput.value = settings.hubToken || '';
  if (hubTestStatusEl)
    hubTestStatusEl.textContent = '';

  if (genericModelsStatusEl) {
    genericModelsStatusEl.textContent = '';
  }
  if (aiModelListSelect) {
    aiModelListSelect.innerHTML = '';
    aiModelListSelect.classList.add('hidden');
  }

  updateAIProviderUI();
  if (aiProviderSelect?.value === 'google') {
    await loadGoogleModels();
  } else {
    const baseUrl = normalizeBaseUrl(aiBaseUrlInput?.value || '');
    const apiKey = aiApiKeyInput?.value?.trim() || '';
    const provider = aiProviderSelect?.value || 'openai-compatible';
    if (baseUrl) {
      try {
        const models = await fetchProviderModels(provider, baseUrl, apiKey);
        applyModelSuggestions(models || []);
        if (genericModelsStatusEl) {
          genericModelsStatusEl.textContent = Array.isArray(models) && models.length
            ? `Modelli disponibili: ${models.length}`
            : 'Connessione OK, nessun modello elencato';
        }
      } catch {
        // Non bloccare l'apertura del modal: il test connessione resta disponibile.
      }
    }
  }
  modal.classList.remove('hidden');
}

function close() {
  modal.classList.add('hidden');
}

async function save(e) {
  if (e) e.preventDefault();

  const provider = aiProviderSelect?.value || 'openai-compatible';
  const selectedFromList = aiModelListSelect?.value?.trim() || '';
  const inputModel = aiModelInput?.value?.trim() || '';
  const model =
    provider === 'google'
      ? configGoogleModelSelect.value
      : inputModel || selectedFromList;
  const apiKey = aiApiKeyInput?.value.trim() || '';

  const hubEnabled = hubEnabledToggle?.checked || false;
  const hubUrl = hubUrlInput?.value.trim() || '';
  const hubToken = hubTokenInput?.value.trim() || '';

  await DataManager.saveSettings({
    aiProvider: provider,
    aiBaseUrl: aiBaseUrlInput?.value.trim() || '',
    aiModel: model,
    aiApiKey: apiKey,
    hubEnabled,
    hubUrl,
    hubToken,
  });

  AIService.init({
    provider: provider,
    apiKey: apiKey,
    baseUrl: aiBaseUrlInput?.value.trim() || '',
    model: model
  });

  // Reconfigure HubSync live
  HubSync.configure({ hubEnabled, hubUrl, hubToken });

  close();
  toast.success('Configurazione salvata.');
}

async function testHubConnection() {
  if (testHubBtn) { testHubBtn.textContent = 'Testing...'; testHubBtn.disabled = true; }
  if (hubTestStatusEl) hubTestStatusEl.textContent = '';

  const baseUrl = (hubUrlInput?.value || '').trim().replace(/\/+$/, '');
  const token = (hubTokenInput?.value || '').trim();

  if (!baseUrl) {
    if (hubTestStatusEl) hubTestStatusEl.textContent = 'Inserisci un URL.';
    if (testHubBtn) { testHubBtn.textContent = 'Test Connessione'; testHubBtn.disabled = false; }
    return;
  }

  try {
    const hub = new HubClient({ baseUrl, token });
    const data = await hub.health();
    const msg = `Connessione OK! (${data.status || 'ok'})`;
    if (hubTestStatusEl) hubTestStatusEl.textContent = msg;
    toast.success(msg);
  } catch (e) {
    const errMsg = `Errore: ${e.message}`;
    if (hubTestStatusEl) hubTestStatusEl.textContent = errMsg;
    toast.error(`Hub non raggiungibile: ${e.message}`);
  } finally {
    if (testHubBtn) { testHubBtn.textContent = 'Test Connessione'; testHubBtn.disabled = false; }
  }
}

export default { init, open, close };

// --- Helpers ---
function normalizeGoogleModel(model) {
  if (!model || typeof model !== 'string') return 'gemini-1.5-flash';
  const m = model.trim();
  const cleanModel = m.startsWith('models/') ? m.replace('models/', '') : m;

  const modelMap = {
    'gemini-pro': 'gemini-1.5-pro',
    'gemini-pro-vision': 'gemini-1.5-pro',
    'gemini-1.5-pro-latest': 'gemini-1.5-pro',
    'gemini-1.5-flash-latest': 'gemini-1.5-flash',
    'gemini-1.0-pro-latest': 'gemini-1.0-pro',
    'gemini-1.5-pro-002': 'gemini-1.5-pro',
    'gemini-1.5-flash-001': 'gemini-1.5-flash',
  };

  return modelMap[cleanModel] || cleanModel;
}

async function loadGoogleModels() {
  if (!googleModelContainer || !configGoogleModelSelect) return;
  const apiKey = aiApiKeyInput?.value?.trim() || '';
  googleModelsStatusEl.textContent = 'Caricamento modelli…';
  configGoogleModelSelect.innerHTML =
    '<option value="" disabled>Carica modelli...</option>';
  if (!apiKey) {
    googleModelsStatusEl.textContent =
      'Inserisci una API Key di AI Studio per caricare i modelli.';
    return;
  }
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      method: 'GET',
      headers: {
        'x-goog-api-key': apiKey,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = Array.isArray(data.models) ? data.models : [];
    const rawOptions = items
      .map(m => m?.name)
      .filter(Boolean)
      .map(n => (n.includes('/') ? n.split('/').pop() : n))
      .filter(n => n.startsWith('gemini-'))
      .map(n => normalizeGoogleModel(n))
      .filter((v, i, a) => a.indexOf(v) === i);

    const prev = configGoogleModelSelect.value;
    const defaultModels = [
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-1.0-pro',
    ];
    const finalList = rawOptions.length ? rawOptions : defaultModels;
    configGoogleModelSelect.innerHTML = '';
    for (const m of finalList) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      configGoogleModelSelect.appendChild(opt);
    }
    if (prev && finalList.includes(prev)) configGoogleModelSelect.value = prev;
    googleModelsStatusEl.textContent = rawOptions.length
      ? `Modelli caricati: ${rawOptions.length}`
      : 'Nessun elenco disponibile: uso set di default';
  } catch (e) {
    console.warn('Impossibile caricare modelli Gemini:', e);
    const errorMsg = e.message?.includes('403')
      ? 'API Key non valida o senza permessi'
      : e.message?.includes('404')
        ? 'Endpoint non trovato - verifica la configurazione'
        : `Errore: ${e.message}`;

    configGoogleModelSelect.innerHTML = '';
    const defaultModels = [
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-1.0-pro',
    ];
    for (const m of defaultModels) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      configGoogleModelSelect.appendChild(opt);
    }
    googleModelsStatusEl.textContent = `${errorMsg}. Uso modelli di default.`;
  }
}
