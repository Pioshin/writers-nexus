import { DataManager } from '../../DataManager.js';
import { toast } from '../shared/toast.js';
import { AIService } from '../../ai/AIService.js';

let modal,
  form,
  saveBtn,
  cancelBtn,
  geminiApiKeyInput,
  firebaseConfigTextarea,
  jsonError;
let aiBaseUrlInput, aiModelInput, aiApiKeyInput, aiProviderSelect;
let genericModelContainer, googleModelContainer, configGoogleModelSelect;
let refreshGoogleModelsBtn, googleModelsStatusEl;

function init() {
  modal = document.getElementById('config-modal');
  form = document.getElementById('config-form');
  saveBtn = document.getElementById('save-config-btn');
  cancelBtn = document.getElementById('cancel-config-modal');
  geminiApiKeyInput = document.getElementById('config-geminiApiKey');
  firebaseConfigTextarea = document.getElementById('config-firebase-json');
  jsonError = document.getElementById('config-json-error');
  aiBaseUrlInput = document.getElementById('config-ai-baseurl');
  aiModelInput = document.getElementById('config-ai-model');
  aiApiKeyInput = document.getElementById('config-ai-apikey');
  aiProviderSelect = document.getElementById('config-ai-provider');
  genericModelContainer = document.getElementById('generic-model-container');
  googleModelContainer = document.getElementById('google-model-container');
  configGoogleModelSelect = document.getElementById('config-google-model');
  refreshGoogleModelsBtn = document.getElementById('refresh-google-models');
  googleModelsStatusEl = document.getElementById('google-models-status');
  const testConnectionBtn = document.getElementById('test-connection-btn'); // New

  cancelBtn.addEventListener('click', close);
  saveBtn.addEventListener('click', save);
  aiProviderSelect.addEventListener('change', updateAIProviderUI);
  refreshGoogleModelsBtn?.addEventListener('click', loadGoogleModels);
  testConnectionBtn?.addEventListener('click', testConnection); // New
}

async function testConnection() {
  const testBtn = document.getElementById('test-connection-btn');
  if (testBtn) { testBtn.textContent = 'Testing...'; testBtn.disabled = true; }

  const provider = aiProviderSelect.value;
  const baseUrl = aiBaseUrlInput.value.replace(/\/$/, ''); // Remove trailing slash
  const model = aiModelInput.value;

  try {
    let url;
    if (provider === 'ollama') {
      // For Ollama, we can try to list tags or just ping
      // Standard Ollama endpoint for tags is GET /api/tags
      // But if user set standard OpenAI-compat URL (v1), we check models there
      if (baseUrl.includes('/v1')) {
        url = `${baseUrl}/models`;
      } else {
        url = `${baseUrl}/api/tags`; // Direct Ollama
      }
    } else {
      // OpenAI Format
      url = `${baseUrl}/models`;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    toast.success(`Connessione OK! (${provider})`);
  } catch (e) {
    console.error("Connection Test Failed:", e);
    toast.error(`Errore Connessione: ${e.message}. Verifica CORS e URL.`);
  } finally {
    if (testBtn) { testBtn.textContent = 'Test Connessione'; testBtn.disabled = false; }
  }
}

function updateAIProviderUI() {
  const provider = aiProviderSelect.value;
  if (provider === 'google') {
    genericModelContainer.classList.add('hidden');
    googleModelContainer.classList.remove('hidden');
  } else {
    genericModelContainer.classList.remove('hidden');
    googleModelContainer.classList.add('hidden');
  }
}

async function open() {
  const settings = await DataManager.getSettings();
  geminiApiKeyInput.value = settings.geminiApiKey || '';
  if (settings.firebaseConfig) {
    firebaseConfigTextarea.value = JSON.stringify(
      settings.firebaseConfig,
      null,
      2
    );
  }
  if (aiProviderSelect)
    aiProviderSelect.value = settings.aiProvider || 'openai-compatible';
  if (aiBaseUrlInput) aiBaseUrlInput.value = settings.aiBaseUrl || '';
  if (aiModelInput) aiModelInput.value = settings.aiModel || '';
  if (configGoogleModelSelect)
    configGoogleModelSelect.value = settings.aiModel || 'gemini-1.5-flash';
  if (aiApiKeyInput)
    aiApiKeyInput.value = settings.aiApiKey || settings.geminiApiKey || '';
  jsonError.textContent = '';
  updateAIProviderUI(); // Set initial UI state
  // Se provider Google, prova a caricare la lista modelli
  if (aiProviderSelect?.value === 'google') {
    await loadGoogleModels();
  }
  modal.classList.remove('hidden');
}

function close() {
  modal.classList.add('hidden');
}

async function save(e) {
  if (e) e.preventDefault();
  const geminiKey = geminiApiKeyInput.value.trim();
  const firebaseConfigStr = firebaseConfigTextarea.value.trim();
  let firebaseConfig;

  jsonError.textContent = '';

  if (firebaseConfigStr) {
    try {
      firebaseConfig = JSON.parse(firebaseConfigStr);
    } catch (e) {
      jsonError.textContent = 'Errore: Il JSON di Firebase non è valido.';
      return;
    }
  }

  const provider = aiProviderSelect?.value || 'openai-compatible';
  const model =
    provider === 'google'
      ? configGoogleModelSelect.value
      : aiModelInput?.value.trim() || '';
  // Preferred AI API key field. If provider is Google and explicit aiApiKey is empty, use geminiKey for aiApiKey too.
  const typedApiKey = aiApiKeyInput?.value.trim() || '';
  const effectiveAiApiKey =
    provider === 'google' ? typedApiKey || geminiKey : typedApiKey;

  await DataManager.saveSettings({
    geminiApiKey: geminiKey,
    firebaseConfig: firebaseConfig, // Sarà undefined se la stringa è vuota, che è ok
    aiProvider: provider,
    aiBaseUrl: aiBaseUrlInput?.value.trim() || '',
    aiModel: model,
    aiApiKey: effectiveAiApiKey,
  });

  // Hot Reload AI Service
  AIService.init({
    provider: provider,
    apiKey: effectiveAiApiKey,
    baseUrl: aiBaseUrlInput?.value.trim() || '',
    model: model
  });

  close();
  toast.success('Configurazione salvata e applicata.');
  // Removed explicit reload: setTimeout(() => location.reload(), 600);
}

export default { init, open, close };

// --- Helpers ---
function normalizeGoogleModel(model) {
  if (!model || typeof model !== 'string') return 'gemini-1.5-flash';
  const m = model.trim();

  // Rimuovi prefissi "models/" se presenti
  const cleanModel = m.startsWith('models/') ? m.replace('models/', '') : m;

  // Mappature per compatibilità AI Studio (stesso mapping di AIService.js)
  const modelMap = {
    'gemini-pro': 'gemini-1.5-pro',
    'gemini-pro-vision': 'gemini-1.5-pro',
    // Rimuovi suffissi -latest che possono causare problemi
    'gemini-1.5-pro-latest': 'gemini-1.5-pro',
    'gemini-1.5-flash-latest': 'gemini-1.5-flash',
    'gemini-1.0-pro-latest': 'gemini-1.0-pro',
    // Varianti comuni che potrebbero non funzionare
    'gemini-1.5-pro-002': 'gemini-1.5-pro',
    'gemini-1.5-flash-001': 'gemini-1.5-flash',
  };

  return modelMap[cleanModel] || cleanModel;
}

async function loadGoogleModels() {
  if (!googleModelContainer || !configGoogleModelSelect) return;
  const apiKey =
    aiApiKeyInput?.value?.trim() || geminiApiKeyInput?.value?.trim() || '';
  googleModelsStatusEl.textContent = 'Caricamento modelli…';
  configGoogleModelSelect.innerHTML =
    '<option value="" disabled>Carica modelli...</option>';
  if (!apiKey) {
    googleModelsStatusEl.textContent =
      'Inserisci una API Key di AI Studio per caricare i modelli.';
    return;
  }
  try {
    // Endpoint pubblico AI Studio models list
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
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

    // Mantieni selezione precedente, fallback se vuota
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
