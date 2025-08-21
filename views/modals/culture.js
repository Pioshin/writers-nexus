import { DataManager } from '../../DataManager.js';

let modal, form, cancelBtn, saveBtn;
let idInput, nameInput, detailsInput;

function init() {
    modal = document.getElementById('culture-modal');
    form = document.getElementById('culture-form');
    cancelBtn = document.getElementById('cancel-culture-modal');
    saveBtn = document.getElementById('save-culture-btn');

    idInput = document.getElementById('culture-id');
    nameInput = document.getElementById('cult-name');
    detailsInput = document.getElementById('cult-details');

    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', save);
    form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
}

function open(item = {}) {
    form.reset();
    idInput.value = item.id || '';
    nameInput.value = item.name || '';
    detailsInput.value = item.details || '';
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
        details: detailsInput.value.trim()
    };

    await DataManager.saveProjectItem(currentProjectId, 'culture', payload);
    document.dispatchEvent(new CustomEvent('culture-saved'));
    close();
}

export default { init, open, close };
