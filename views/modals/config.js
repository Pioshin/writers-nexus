import { DataManager } from '../../DataManager.js';

let modal, form, saveBtn, cancelBtn, geminiApiKeyInput, firebaseConfigTextarea, jsonError;

function init() {
    modal = document.getElementById('config-modal');
    form = document.getElementById('config-form');
    saveBtn = document.getElementById('save-config-btn');
    cancelBtn = document.getElementById('cancel-config-modal');
    geminiApiKeyInput = document.getElementById('config-geminiApiKey');
    firebaseConfigTextarea = document.getElementById('config-firebase-json');
    jsonError = document.getElementById('config-json-error');

    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', save);
}

async function open() {
    const settings = await DataManager.getSettings();
    geminiApiKeyInput.value = settings.geminiApiKey || '';
    if (settings.firebaseConfig) {
        firebaseConfigTextarea.value = JSON.stringify(settings.firebaseConfig, null, 2);
    }
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
        firebaseConfig: firebaseConfig // Sarà undefined se la stringa è vuota, che è ok
    });

    close();
    // Mostra un messaggio di ricarica
    alert('Configurazione salvata. La pagina verrà ricaricata per applicare le modifiche.');
    location.reload();
}

export default { init, open, close };