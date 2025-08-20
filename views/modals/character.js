import { DataManager } from '../../DataManager.js';

const NARRATIVE_TAGS = {
    archetype: ['eroe', 'mentore', 'ombra', 'alleato', 'guardiano della soglia', 'messaggero', 'mutafaccia'],
    role: ['protagonista', 'antagonista', 'deuteragonista', 'secondario']
};

let modal, form, modalTitle, saveBtn, cancelBtn;
let characterIdInput, nameInput, roleInput, appearanceInput, psychologyInput, pastInput, voiceInput, archetypeSelect, narrativeRoleSelect;

function init() {
    modal = document.getElementById('character-modal');
    form = document.getElementById('character-form');
    modalTitle = document.getElementById('character-modal-title');
    saveBtn = document.getElementById('save-character-btn');
    cancelBtn = document.getElementById('cancel-character-btn');

    characterIdInput = document.getElementById('character-id');
    nameInput = document.getElementById('character-name');
    roleInput = document.getElementById('character-role');
    appearanceInput = document.getElementById('character-appearance');
    psychologyInput = document.getElementById('character-psychology');
    pastInput = document.getElementById('character-past');
    voiceInput = document.getElementById('character-voice');
    archetypeSelect = document.getElementById('character-archetype');
    narrativeRoleSelect = document.getElementById('character-narrative-role');

    populateSelects();

    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', save);
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        save();
    });
}

function populateSelects() {
    NARRATIVE_TAGS.archetype.forEach(tag => {
        archetypeSelect.add(new Option(tag.charAt(0).toUpperCase() + tag.slice(1), tag));
    });
    NARRATIVE_TAGS.role.forEach(tag => {
        narrativeRoleSelect.add(new Option(tag.charAt(0).toUpperCase() + tag.slice(1), tag));
    });
}

function open(character = {}) {
    form.reset();
    characterIdInput.value = character.id || '';
    nameInput.value = character.name || '';
    roleInput.value = character.role || '';
    appearanceInput.value = character.appearance || '';
    psychologyInput.value = character.psychology || '';
    pastInput.value = character.past || '';
    voiceInput.value = character.voice || '';
    archetypeSelect.value = character.archetype || '';
    narrativeRoleSelect.value = character.narrativeRole || '';

    modalTitle.textContent = character.id ? 'Modifica Personaggio' : 'Crea Nuovo Personaggio';
    modal.classList.remove('hidden');
}

function close() {
    modal.classList.add('hidden');
}

async function save() {
    const characterData = {
        id: characterIdInput.value || undefined,
        name: nameInput.value.trim(),
        role: roleInput.value.trim(),
        appearance: appearanceInput.value.trim(),
        psychology: psychologyInput.value.trim(),
        past: pastInput.value.trim(),
        voice: voiceInput.value.trim(),
        archetype: archetypeSelect.value,
        narrativeRole: narrativeRoleSelect.value
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