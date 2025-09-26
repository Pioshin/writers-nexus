import { DataManager } from '../../DataManager.js';
import { toast } from '../shared/toast.js';

let modal,
  form,
  saveBtn,
  cancelBtn,
  geminiApiKeyInput,
  firebaseConfigTextarea,
  jsonError;
let aiBaseUrlInput, aiModelInput, aiApiKeyInput, aiProviderSelect;
let genericModelContainer, googleModelContainer, configGoogleModelSelect;

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

  cancelBtn.addEventListener('click', close);
  saveBtn.addEventListener('click', save);
  aiProviderSelect.addEventListener('change', updateAIProviderUI);
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
  if (aiApiKeyInput) aiApiKeyInput.value = settings.aiApiKey || '';
  jsonError.textContent = '';
  updateAIProviderUI(); // Set initial UI state
  modal.classList.remove('hidden');
}

function close() {
  modal.classList.add('hidden');
}

async function save() {
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

  await DataManager.saveSettings({
    geminiApiKey: geminiKey,
    firebaseConfig: firebaseConfig, // Sarà undefined se la stringa è vuota, che è ok
    aiProvider: provider,
    aiBaseUrl: aiBaseUrlInput?.value.trim() || '',
    aiModel: model,
    aiApiKey: aiApiKeyInput?.value.trim() || '',
  });

  close();
  toast.success('Configurazione salvata. Ricarico la pagina...');
  setTimeout(() => location.reload(), 600);
}

export default { init, open, close };
