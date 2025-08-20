import { DataManager } from '../../DataManager.js';

const NARRATIVE_TAGS = {
    archetype: ['eroe', 'mentore', 'ombra', 'alleato', 'guardiano della soglia', 'messaggero', 'mutafaccia'],
    role: ['protagonista', 'antagonista', 'deuteragonista', 'secondario'],
    importance: ['principale', 'secondario', 'ricorrente', 'cameo']
};

const RELATIONSHIP_TYPES = { 
    'Amicizia': 'Amicizia', 'Alleanza': 'Alleanza', 'Amore': 'Amore', 'Famiglia': 'Famiglia', 
    'Mentore/Allievo': 'Mentore/Allievo', 'Rivalità': 'Rivalità', 'Inimicizia': 'Inimicizia', 
    'Rispetto': 'Rispetto', 'Sospetto': 'Sospetto' 
};

let modal, form, modalTitle, saveBtn, cancelBtn;
let characterIdInput, nameInput, roleInput, appearanceInput, psychologyInput, pastInput, voiceInput;
let archetypeSelect, narrativeRoleSelect, importanceSelect;
let relationsEditor, addRelationBtn;

let allCharacters = []; // To populate relationship target dropdown

function init() {
    modal = document.getElementById('character-modal');
    form = document.getElementById('character-form');
    modalTitle = document.getElementById('character-modal-title');
    saveBtn = document.getElementById('save-character-btn');
    cancelBtn = document.getElementById('cancel-character-btn');

    // Standard fields
    characterIdInput = document.getElementById('character-id');
    nameInput = document.getElementById('character-name');
    roleInput = document.getElementById('character-role');
    appearanceInput = document.getElementById('character-appearance');
    psychologyInput = document.getElementById('character-psychology');
    pastInput = document.getElementById('character-past');
    voiceInput = document.getElementById('character-voice');

    // Tags
    archetypeSelect = document.getElementById('character-archetype');
    narrativeRoleSelect = document.getElementById('character-narrative-role');
    importanceSelect = document.getElementById('character-importance');

    // Relations
    relationsEditor = document.getElementById('character-relations-editor');
    addRelationBtn = document.getElementById('add-relation-btn');

    populateSelects();

    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', save);
    addRelationBtn.addEventListener('click', () => addRelationRow());
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
    NARRATIVE_TAGS.importance.forEach(tag => {
        importanceSelect.add(new Option(tag.charAt(0).toUpperCase() + tag.slice(1), tag));
    });
}

async function open(character = {}) {
    form.reset();
    
    // Fetch all characters for relationship dropdowns
    const currentProjectId = await DataManager.getCurrentProjectId();
    if (!currentProjectId) {
        modal.classList.add('hidden'); // Ensure modal is hidden if no project
        alert("Nessun progetto selezionato. Seleziona un progetto dalla dashboard per aggiungere personaggi.");
        return;
    }

    try {
        allCharacters = await DataManager.getProjectItems(currentProjectId, 'characters');
    } catch (error) {
        console.error('character.js: Error fetching allCharacters:', error);
        allCharacters = []; // Ensure it's an empty array on error
    }

    characterIdInput.value = character.id || '';
    nameInput.value = character.name || '';
    roleInput.value = character.role || '';
    appearanceInput.value = character.appearance || '';
    psychologyInput.value = character.psychology || '';
    pastInput.value = character.past || '';
    voiceInput.value = character.voice || '';
    archetypeSelect.value = character.archetype || '';
    narrativeRoleSelect.value = character.narrativeRole || '';
    importanceSelect.value = character.importance || '';

    renderRelations(character.relationships || []);

    modalTitle.textContent = character.id ? 'Modifica Personaggio' : 'Crea Nuovo Personaggio';
    modal.classList.remove('hidden');
}

function close() {
    modal.classList.add('hidden');
}

async function save() {
    const relationships = [];
    document.querySelectorAll('#character-relations-editor .relation-row').forEach(row => {
        const targetId = row.querySelector('.relation-target').value;
        const type = row.querySelector('.relation-type').value;
        if (targetId && type) {
            relationships.push({ targetCharacterId: targetId, type: type });
        }
    });

    const characterData = {
        id: characterIdInput.value || undefined,
        name: nameInput.value.trim(),
        role: roleInput.value.trim(),
        appearance: appearanceInput.value.trim(),
        psychology: psychologyInput.value.trim(),
        past: pastInput.value.trim(),
        voice: voiceInput.value.trim(),
        archetype: archetypeSelect.value,
        narrativeRole: narrativeRoleSelect.value,
        importance: importanceSelect.value,
        relationships: relationships
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

    try {
        await DataManager.saveProjectItem(currentProjectId, 'characters', characterData);
        document.dispatchEvent(new CustomEvent('character-saved'));
        close();
    } catch (error) {
        console.error('Error saving character:', error);
        alert(`Errore durante il salvataggio del personaggio: ${error.message}`);
    }
}

function renderRelations(relations = []) {
    relationsEditor.innerHTML = '';
    relations.forEach(rel => addRelationRow(rel));
}

function addRelationRow(relation = {}) {
    const row = document.createElement('div');
    row.className = 'relation-row flex items-center gap-2 mb-2';

    // Dropdown for target character
    const targetSelect = document.createElement('select');
    targetSelect.className = 'relation-target flex-1 px-4 py-2 bg-primary border border-accent/30 rounded-lg';
    targetSelect.add(new Option('Seleziona personaggio...', ''));
    
    const currentCharacterId = characterIdInput.value;
    allCharacters.forEach(char => {
        if (char.id !== currentCharacterId) { // Prevent self-relation
            targetSelect.add(new Option(char.name, char.id));
        }
    });
    targetSelect.value = relation.targetCharacterId || '';

    // Dropdown for relationship type
    const typeSelect = document.createElement('select');
    typeSelect.className = 'relation-type flex-1 px-4 py-2 bg-primary border border-accent/30 rounded-lg';
    for (const [key, value] of Object.entries(RELATIONSHIP_TYPES)) {
        typeSelect.add(new Option(value, key));
    }
    typeSelect.value = relation.type || 'Amicizia';

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.innerHTML = '<i data-lucide="trash-2" class="w-5 h-5 text-red-500"></i>';
    removeBtn.className = 'p-2 hover:bg-primary rounded-full';
    removeBtn.addEventListener('click', () => row.remove());

    row.appendChild(targetSelect);
    row.appendChild(typeSelect);
    row.appendChild(removeBtn);
    relationsEditor.appendChild(row);
    
    lucide.createIcons();
}

export default { init, open, close };