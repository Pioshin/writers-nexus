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
    console.log('character.js: init() called');
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
    console.log('character.js: init() finished');
}

function populateSelects() {
    console.log('character.js: populateSelects() called');
    NARRATIVE_TAGS.archetype.forEach(tag => {
        archetypeSelect.add(new Option(tag.charAt(0).toUpperCase() + tag.slice(1), tag));
    });
    NARRATIVE_TAGS.role.forEach(tag => {
        narrativeRoleSelect.add(new Option(tag.charAt(0).toUpperCase() + tag.slice(1), tag));
    });
    NARRATIVE_TAGS.importance.forEach(tag => {
        importanceSelect.add(new Option(tag.charAt(0).toUpperCase() + tag.slice(1), tag));
    });
    console.log('character.js: populateSelects() finished');
}

async function open(character = {}) {
    console.log('character.js: open() called with character:', character);
    form.reset();
    
    // Fetch all characters for relationship dropdowns
    const currentProjectId = await DataManager.getCurrentProjectId();
    console.log('character.js: currentProjectId in open():', currentProjectId);
    if (!currentProjectId) {
        console.error('character.js: No current project ID found when opening character modal.');
        // This might be the issue. If no project is selected, we can't add characters.
        // The UI should prevent opening this modal if no project is selected.
        // For now, let's just return.
        modal.classList.add('hidden'); // Ensure modal is hidden if no project
        alert("Nessun progetto selezionato. Seleziona un progetto dalla dashboard per aggiungere personaggi.");
        return;
    }

    try {
        allCharacters = await DataManager.getProjectItems(currentProjectId, 'characters');
        console.log('character.js: allCharacters fetched:', allCharacters);
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

    console.log('character.js: Calling renderRelations()');
    renderRelations(character.relationships || []);

    modalTitle.textContent = character.id ? 'Modifica Personaggio' : 'Crea Nuovo Personaggio';
    modal.classList.remove('hidden');
    console.log('character.js: open() finished');
}

function close() {
    console.log('character.js: close() called');
    modal.classList.add('hidden');
}

async function save() {
    console.log('character.js: save() called');
    const relationships = [];
    document.querySelectorAll('#character-relations-editor .relation-row').forEach(row => {
        const targetId = row.querySelector('.relation-target').value;
        const type = row.querySelector('.relation-type').value;
        if (targetId && type) {
            relationships.push({ targetCharacterId: targetId, type: type });
        }
    });
    console.log('character.js: relationships collected:', relationships);

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
    console.log('character.js: characterData to save:', characterData);

    if (!characterData.name) {
        alert('Il nome del personaggio è obbligatorio.');
        console.log('character.js: Name is empty, returning.');
        return;
    }

    const currentProjectId = await DataManager.getCurrentProjectId();
    console.log('character.js: currentProjectId in save():', currentProjectId);
    if (!currentProjectId) {
        alert("Nessun progetto selezionato.");
        console.log('character.js: No project selected, returning.');
        return;
    }

    try {
        await DataManager.saveProjectItem(currentProjectId, 'characters', characterData);
        console.log('character.js: Character saved successfully.');
        document.dispatchEvent(new CustomEvent('character-saved'));
        close();
    } catch (error) {
        console.error('character.js: Error saving character:', error);
        alert(`Errore durante il salvataggio del personaggio: ${error.message}`);
    }
}

function renderRelations(relations = []) {
    console.log('character.js: renderRelations() called with relations:', relations);
    relationsEditor.innerHTML = '';
    relations.forEach(rel => addRelationRow(rel));
    console.log('character.js: renderRelations() finished');
}

function addRelationRow(relation = {}) {
    console.log('character.js: addRelationRow() called with relation:', relation);
    const row = document.createElement('div');
    row.className = 'relation-row flex items-center gap-2 mb-2';

    // Dropdown for target character
    const targetSelect = document.createElement('select');
    targetSelect.className = 'relation-target flex-1 px-4 py-2 bg-primary border border-accent/30 rounded-lg';
    targetSelect.add(new Option('Seleziona personaggio...', ''));
    
    const currentCharacterId = characterIdInput.value;
    console.log('character.js: addRelationRow - currentCharacterId:', currentCharacterId);
    console.log('character.js: addRelationRow - allCharacters:', allCharacters);

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
    console.log('character.js: addRelationRow() finished');
}

export default { init, open, close };