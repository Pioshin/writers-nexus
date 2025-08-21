import { DataManager } from '../../DataManager.js';

let modal, form, cancelBtn, saveBtn;
let idInput, titleInput, narrationInput;

function init() {
    modal = document.getElementById('history-modal');
    form = document.getElementById('history-form');
    cancelBtn = document.getElementById('cancel-history-modal');
    saveBtn = document.getElementById('save-history-btn');

    idInput = document.getElementById('history-id');
    titleInput = document.getElementById('hist-title');
    narrationInput = document.getElementById('hist-narration');

    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', save);
    form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
}

function open(item = {}) {
    form.reset();
    idInput.value = item.id || '';
    titleInput.value = item.title || '';
    narrationInput.value = item.narration || '';
    modal.classList.remove('hidden');
}

function close() {
    modal.classList.add('hidden');
}

async function save() {
    const title = titleInput.value.trim();
    if (!title) return;
    const currentProjectId = await DataManager.getCurrentProjectId();
    if (!currentProjectId) return alert('Nessun progetto selezionato.');

    const payload = {
        id: idInput.value || undefined,
        title,
        narration: narrationInput.value.trim()
    };

    await DataManager.saveProjectItem(currentProjectId, 'history', payload);
    document.dispatchEvent(new CustomEvent('history-saved'));
    close();
}

export default { init, open, close };