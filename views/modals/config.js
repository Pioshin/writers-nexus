import { DataManager } from '../../DataManager.js';
import { FirebaseSync } from '../../FirebaseSync.js';

let configModal, configForm, saveConfigBtn, cancelConfigModalBtn, geminiApiKeyInput, firebaseConfigTextarea, configJsonError;

async function openConfigModal() {
    const settings = await DataManager.getSettings();
    geminiApiKeyInput.value = settings.geminiApiKey || '';
    firebaseConfigTextarea.value = settings.firebaseConfig ? JSON.stringify(settings.firebaseConfig, null, 2) : '';
    configModal.classList.remove('hidden');
}

function closeConfigModal() {
    configModal.classList.add('hidden');
}

async function saveConfig() {
    const geminiKey = geminiApiKeyInput.value;
    const firebaseConfigStr = firebaseConfigTextarea.value;
    let firebaseConfig;

    if (firebaseConfigStr) {
        try {
            firebaseConfig = JSON.parse(firebaseConfigStr);
            await DataManager.saveSettings({ firebaseConfig });
        } catch (e) {
            configJsonError.textContent = 'JSON non valido.';
            return;
        }
    }

    await DataManager.saveSettings({ geminiApiKey: geminiKey });
    FirebaseSync.setGeminiApiKey(geminiKey);

    closeConfigModal();
    location.reload(); // Reload to apply new settings
}

export function init(showConfigBtn, sidebarSettingsBtn) {
    configModal = document.getElementById('config-modal');
    configForm = document.getElementById('config-form');
    saveConfigBtn = document.getElementById('save-config-btn');
    cancelConfigModalBtn = document.getElementById('cancel-config-modal');
    geminiApiKeyInput = document.getElementById('config-geminiApiKey');
    firebaseConfigTextarea = document.getElementById('config-firebase-json');
    configJsonError = document.getElementById('config-json-error');

    showConfigBtn.addEventListener('click', openConfigModal);
    sidebarSettingsBtn.addEventListener('click', openConfigModal);
    cancelConfigModalBtn.addEventListener('click', closeConfigModal);
    saveConfigBtn.addEventListener('click', saveConfig);
}
