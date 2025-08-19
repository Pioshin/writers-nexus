import { DataManager } from '../../DataManager.js';

let modal, form, titleEl, synopsisEl, sceneIdInput, stageKeyInput, saveBtn, cancelBtn, modalTitle;

function init() {
    modal = document.getElementById('scene-editor-modal');
    form = document.getElementById('scene-editor-form');
    modalTitle = document.getElementById('scene-editor-title');
    titleEl = document.getElementById('scene-title');
    synopsisEl = document.getElementById('scene-synopsis');
    sceneIdInput = document.getElementById('scene-id');
    stageKeyInput = document.getElementById('scene-stage-key');
    saveBtn = document.getElementById('save-scene-btn');
    cancelBtn = document.getElementById('cancel-scene-btn');

    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', save);
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        save();
    });
}

function open({ scene = {}, stageKey = null } = {}) {
    form.reset();
    sceneIdInput.value = scene.id || '';
    stageKeyInput.value = scene.stageKey || stageKey || '';
    titleEl.value = scene.title || '';
    synopsisEl.value = scene.synopsis || '';

    modalTitle.textContent = scene.id ? 'Modifica Scena' : 'Crea Nuova Scena';
    
    modal.classList.remove('hidden');
}

function close() {
    modal.classList.add('hidden');
}

async function save() {
    const sceneData = {
        id: sceneIdInput.value || undefined,
        stageKey: stageKeyInput.value,
        title: titleEl.value.trim(),
        synopsis: synopsisEl.value.trim(),
        // projectId will be added by DataManager if it's a new scene
        // or preserved if it's an existing one.
    };

    if (!sceneData.title || !sceneData.stageKey) {
        alert('Il titolo e la tappa sono obbligatori.');
        return;
    }

    const savedScene = await DataManager.saveScene(sceneData);
    
    // Dispatch a custom event to notify the structure view to refresh
    document.dispatchEvent(new CustomEvent('scene-saved', { 
        detail: { stageKey: savedScene.stageKey }
    }));

    close();
}

export default { init, open, close };
