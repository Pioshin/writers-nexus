import { DataManager } from '../../DataManager.js';

let modal, form, saveBtn, cancelBtn, geminiApiKeyInput, firebaseConfigTextarea, jsonError;
let aiBaseUrlInput, aiModelInput, aiApiKeyInput, aiProviderSelect;

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

    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', save);
}

async function open() {
    const settings = await DataManager.getSettings();
    geminiApiKeyInput.value = settings.geminiApiKey || '';
    if (settings.firebaseConfig) {
        firebaseConfigTextarea.value = JSON.stringify(settings.firebaseConfig, null, 2);
    }
    if (aiProviderSelect) aiProviderSelect.value = settings.aiProvider || 'openai-compatible';
    if (aiBaseUrlInput) aiBaseUrlInput.value = settings.aiBaseUrl || '';
    if (aiModelInput) aiModelInput.value = settings.aiModel || '';
    if (aiApiKeyInput) aiApiKeyInput.value = settings.aiApiKey || '';
    jsonError.textContent = '';
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

    await DataManager.saveSettings({ 
        geminiApiKey: geminiKey,
        firebaseConfig: firebaseConfig, // Sarà undefined se la stringa è vuota, che è ok
    aiProvider: aiProviderSelect?.value || 'openai-compatible',
    aiBaseUrl: aiBaseUrlInput?.value.trim() || '',
        aiModel: aiModelInput?.value.trim() || '',
        aiApiKey: aiApiKeyInput?.value.trim() || ''
    });

    close();
    // Mostra un messaggio di ricarica
    alert('Configurazione salvata. La pagina verrà ricaricata per applicare le modifiche.');
    location.reload();
}

export default { init, open, close };