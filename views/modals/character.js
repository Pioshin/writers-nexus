import { DataManager } from '../../DataManager.js';

let modal, form, saveBtn, cancelBtn, modalTitle;
let charIdInput, charNameInput, charRoleInput, charAppearanceInput, charPsychologyInput, charPastInput, charVoiceInput;

function init() {
    modal = document.getElementById('character-modal');
    form = document.getElementById('character-form');
    saveBtn = document.getElementById('save-character-btn');
    cancelBtn = document.getElementById('cancel-character-btn');
    modalTitle = document.getElementById('character-modal-title');

    // Form fields
    charIdInput = document.getElementById('character-id');
    charNameInput = document.getElementById('char-name');
    charRoleInput = document.getElementById('char-role');
    charAppearanceInput = document.getElementById('char-appearance');
    charPsychologyInput = document.getElementById('char-psychology');
    charPastInput = document.getElementById('char-past');
    charVoiceInput = document.getElementById('char-voice');

    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', save);
    form.addEventListener('submit', e => {
        e.preventDefault();
        save();
    });
}

function open(character = {}) {
    form.reset();
    charIdInput.value = character.id || '';
    charNameInput.value = character.name || '';
    charRoleInput.value = character.role || '';
    charAppearanceInput.value = character.appearance || '';
    charPsychologyInput.value = character.psychology || '';
    charPastInput.value = character.past || '';
    charVoiceInput.value = character.voice || '';

    modalTitle.textContent = character.id ? 'Modifica Personaggio' : 'Crea Nuovo Personaggio';
    modal.classList.remove('hidden');
}

function close() {
    modal.classList.add('hidden');
}

async function save() {
    const characterData = {
        id: charIdInput.value || undefined,
        name: charNameInput.value.trim(),
        role: charRoleInput.value.trim(),
        appearance: charAppearanceInput.value.trim(),
        psychology: charPsychologyInput.value.trim(),
        past: charPastInput.value.trim(),
        voice: charVoiceInput.value.trim(),
    };

    if (!characterData.name) {
        alert('Il nome del personaggio è obbligatorio.');
        return;
    }

    const currentProjectId = await DataManager.getCurrentProjectId();
    if (!currentProjectId) {
        alert("Nessun progetto selezionato.");
        return;
    }

    await DataManager.saveProjectItem(currentProjectId, 'characters', characterData);
    
    document.dispatchEvent(new CustomEvent('character-saved'));

    close();
}

export default { init, open, close };
