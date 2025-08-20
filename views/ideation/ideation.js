let DataManager, FirebaseSync, loadModal, switchView;
let currentProjectId;
let newIdeaModal = null;
let characterModal = null;
let locationModal = null;
let objectModal = null;
let systemModal = null;

// --- Character Relationship Filtering ---
const RELATION_CATEGORIES = {
    positive: ['Amicizia', 'Alleanza', 'Amore', 'Rispetto'],
    negative: ['Rivalità', 'Inimicizia'],
    neutral: ['Famiglia', 'Mentore/Allievo', 'Sospetto']
};
const RELATION_COLORS = {
    positive: 'border-sky-400',
    negative: 'border-red-500',
    neutral: 'border-slate-400'
};
let activeRelationFilter = null; // { sourceId: 'char-id', category: 'positive' }

function getRelationCategory(type) {
    for (const category in RELATION_CATEGORIES) {
        if (RELATION_CATEGORIES[category].includes(type)) {
            return category;
        }
    }
    return 'neutral';
}

function setRelationFilter(sourceId, category) {
    console.log('ideation.js: setRelationFilter called with', sourceId, category);
    if (activeRelationFilter && activeRelationFilter.sourceId === sourceId && activeRelationFilter.category === category) {
        activeRelationFilter = null; // Toggle off
    } else {
        activeRelationFilter = { sourceId, category };
    }
    loadCharacters(); // Re-render with the new filter
}
// --------------------------------------

async function switchIdeationTab(tabName) {
    console.log('ideation.js: switchIdeationTab called with', tabName);
    document.querySelectorAll('.ideation-tab-btn').forEach(btn => {
        const isTarget = btn.dataset.tab === tabName;
        btn.classList.toggle('accent', isTarget);
        btn.classList.toggle('border-accent', isTarget);
        btn.classList.toggle('text-secondary', !isTarget);
        btn.classList.toggle('border-transparent', !isTarget);
    });
    document.querySelectorAll('.ideation-tab-content').forEach(content => {
        const isTarget = content.id === `${tabName}-content`;
        content.classList.toggle('hidden', !isTarget);
    });

    activeRelationFilter = null; // Reset filter when switching tabs

    if (tabName === 'ideas-ai') {
        loadIdeas();
    } else if (tabName === 'characters') {
        loadCharacters();
    } else if (tabName === 'worldbuilding') {
        loadLocations();
        loadObjects();
        loadSystems();
    }
}

async function loadIdeas() {
    // ... (implementation is unchanged)
}

async function loadCharacters() {
    console.log('ideation.js: loadCharacters called');
    const charactersListEl = document.getElementById('characters-list');
    if (!charactersListEl) return;

    const allCharacters = await DataManager.getProjectItems(currentProjectId, 'characters');
    const charactersById = Object.fromEntries(allCharacters.map(c => [c.id, c]));
    charactersListEl.innerHTML = '';

    if (allCharacters.length === 0) {
        charactersListEl.innerHTML = `<p class="text-secondary text-sm p-4 text-center col-span-full">Nessun personaggio creato.</p>`;
        return;
    }

    let highlightedIds = null;
    if (activeRelationFilter) {
        const sourceChar = charactersById[activeRelationFilter.sourceId];
        if (sourceChar && sourceChar.relationships) {
            highlightedIds = sourceChar.relationships
                .filter(rel => getRelationCategory(rel.type) === activeRelationFilter.category)
                .map(rel => rel.targetCharacterId);
            highlightedIds.push(sourceChar.id); // Also highlight the source character
        }
    }

    const overlayModule = await import('../shared/overlay.js');
    allCharacters.forEach(character => {
        const card = document.createElement('div');
        const isFaded = highlightedIds && !highlightedIds.includes(character.id);
        card.className = `bg-secondary p-4 rounded-xl border border-border-color hover:border-accent transition-all duration-300 group relative cursor-pointer ${isFaded ? 'opacity-30' : ''}`;
        
        const tagsHTML = [character.archetype, character.narrativeRole, character.importance]
            .filter(tag => tag)
            .map(tag => `<span class="bg-primary text-secondary text-xs font-medium me-2 px-2.5 py-0.5 rounded-full">${tag}</span>`)
            .join('');

        const relationsHTML = (character.relationships || [])
            .map(rel => {
                const targetChar = charactersById[rel.targetCharacterId];
                if (!targetChar) return '';
                const category = getRelationCategory(rel.type);
                const colorClass = RELATION_COLORS[category];
                const initials = targetChar.name.split(' ').map(n => n[0]).join('');
                return `<div class="relation-avatar ${colorClass}" title="${rel.type} con ${targetChar.name}" data-category="${category}" data-source-id="${character.id}">${initials}</div>`;
            })
            .join('');

        card.innerHTML = `
            <div class="card-content">
                <h4 class="text-lg font-bold font-display text-primary mb-2">${character.name}</h4>
                <p class="text-secondary text-sm mb-3 h-5 overflow-hidden">${character.role || 'Ruolo non definito'}</p>
                <div class="h-6 mb-3">${tagsHTML}</div>
                <div class="relations-container">${relationsHTML}</div>
            </div>
        `;

        overlayModule.addOverlayTo(card, {
            positionClass: 'overlay-actions', // Using the new shared class
            onEdit: () => characterModal.open(character),
            onDelete: async () => {
                if (confirm(`Sei sicuro di voler eliminare ${character.name}?`)) {
                    await DataManager.deleteProjectItem('characters', character.id);
                    loadCharacters();
                }
            }
        });

        card.addEventListener('click', (e) => {
            if (!e.target.closest('button') && !e.target.closest('.relation-avatar')) {
                characterModal.open(character);
            }
        });

        card.querySelectorAll('.relation-avatar').forEach(avatar => {
            avatar.addEventListener('click', (e) => {
                e.stopPropagation();
                const sourceId = avatar.dataset.sourceId;
                const category = avatar.dataset.category;
                setRelationFilter(sourceId, category);
            });
        });
        
        charactersListEl.appendChild(card);
    });
    lucide.createIcons();
}


async function loadLocations() { /* ... unchanged ... */ }
async function loadObjects() { /* ... unchanged ... */ }
async function loadSystems() { /* ... unchanged ... */ }
async function handleNewIdeaClick() { /* ... unchanged ... */ }
async function handleNewCharacterClick() {
    console.log('ideation.js: handleNewCharacterClick called');
    if (!characterModal) {
        console.log('ideation.js: characterModal is null, loading it...');
        characterModal = await loadModal('character');
        console.log('ideation.js: characterModal loaded:', characterModal);
    }
    if (characterModal) {
        console.log('ideation.js: Opening characterModal...');
        characterModal.open();
        console.log('ideation.js: characterModal.open() called.');
    } else {
        console.error('ideation.js: characterModal is still null after loading attempt.');
    }
}

export default {
    init: async function(dataManager, firebaseSync, modalLoader, viewSwitcher) {
        console.log('ideation.js: init() called');
        DataManager = dataManager;
        FirebaseSync = firebaseSync;
        loadModal = modalLoader;
        switchView = viewSwitcher;

        currentProjectId = await DataManager.getCurrentProjectId();
        console.log('ideation.js: currentProjectId in init():', currentProjectId);
        if (!currentProjectId) {
            document.getElementById('view-ideation').innerHTML = '<p class="text-secondary text-center col-span-full">Seleziona un progetto dalla dashboard per iniziare.</p>';
            console.log('ideation.js: No current project, displaying message.');
            return;
        }

        // Load modals
        console.log('ideation.js: Loading character modal...');
        characterModal = await loadModal('character');
        console.log('ideation.js: Character modal loaded:', characterModal);
        locationModal = await loadModal('location');
        objectModal = await loadModal('object');
        systemModal = await loadModal('system');
        newIdeaModal = await loadModal('new-idea');
        console.log('ideation.js: All modals loaded.');

        // Tab switching logic
        document.querySelectorAll('.ideation-tab-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                switchIdeationTab(tabName);
            });
        });

        // Button event listeners
        document.getElementById('new-character-btn').addEventListener('click', handleNewCharacterClick);
        document.getElementById('new-idea-btn').addEventListener('click', handleNewIdeaClick);
        document.getElementById('new-location-btn').addEventListener('click', () => locationModal.open());
        document.getElementById('new-object-btn').addEventListener('click', () => objectModal.open());
        document.getElementById('new-system-btn').addEventListener('click', () => systemModal.open());

        // Custom event listeners for data changes
        document.addEventListener('character-saved', loadCharacters);
        document.addEventListener('location-saved', loadLocations);
        document.addEventListener('object-saved', loadObjects);
        document.addEventListener('system-saved', loadSystems);
        document.addEventListener('idea-saved', loadIdeas);

        // Initial state: activate first tab and load its data
        switchIdeationTab('ideas-ai');
        console.log('ideation.js: init() finished.');
    }
};