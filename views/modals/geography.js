import { DataManager } from '../../DataManager.js';

let modal, form, cancelBtn, saveBtn;
let idInput, nameInput, descriptionInput;

function init() {
    modal = document.getElementById('geography-modal');
    form = document.getElementById('geography-form');
    cancelBtn = document.getElementById('cancel-geography-modal');
    saveBtn = document.getElementById('save-geography-btn');

    idInput = document.getElementById('geography-id');
    nameInput = document.getElementById('geo-name');
    descriptionInput = document.getElementById('geo-description');

    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', save);
    form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
}

function open(item = {}) {
    form.reset();
    idInput.value = item.id || '';
    nameInput.value = item.name || '';
    descriptionInput.value = item.description || '';
    modal.classList.remove('hidden');
}

function close() {
    modal.classList.add('hidden');
}

async function save() {
    const name = nameInput.value.trim();
    if (!name) return;
    const currentProjectId = await DataManager.getCurrentProjectId();
    if (!currentProjectId) return alert('Nessun progetto selezionato.');

    const payload = {
        id: idInput.value || undefined,
        name,
        description: descriptionInput.value.trim()
    };

    await DataManager.saveProjectItem(currentProjectId, 'geography', payload);
    document.dispatchEvent(new CustomEvent('geography-saved'));
    close();
}

export default { init, open, close };