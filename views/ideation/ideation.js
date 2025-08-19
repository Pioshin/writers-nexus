let DataManager, FirebaseSync, loadModal, switchView;
let currentProjectId;
let newIdeaModal = null;
let characterModal = null;

async function switchIdeationTab(tabName) {
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

    // Load data based on active tab
    if (tabName === 'ideas-ai') {
        loadIdeas();
    } else if (tabName === 'characters') {
        loadCharacters();
    } else if (tabName === 'worldbuilding') {
        // TODO: Load worldbuilding data
    }
}

async function loadIdeas() {
    const ideasListEl = document.getElementById('ideas-list');
    if (!ideasListEl) return;

    const ideas = await DataManager.getProjectItems(currentProjectId, 'ideas');
    ideasListEl.innerHTML = '';

    if (ideas.length === 0) {
        ideasListEl.innerHTML = `<p class="text-secondary text-sm p-4 text-center">Nessuna idea salvata.</p>`;
        return;
    }

    ideas.forEach(idea => {
        const ideaEl = document.createElement('div');
        ideaEl.className = 'bg-primary p-3 rounded-lg text-sm text-secondary';
        ideaEl.textContent = idea.content;
        ideasListEl.appendChild(ideaEl);
    });
}

async function loadCharacters() {
    const charactersListEl = document.getElementById('characters-list');
    if (!charactersListEl) return;

    const characters = await DataManager.getProjectItems(currentProjectId, 'characters');
    charactersListEl.innerHTML = '';

    if (characters.length === 0) {
        charactersListEl.innerHTML = `<p class="text-secondary text-sm p-4 text-center">Nessun personaggio creato.</p>`;
        return;
    }

    characters.forEach(character => {
        const card = document.createElement('div');
        card.className = 'bg-primary p-4 rounded-lg flex items-center justify-between';
        card.innerHTML = `
            <div>
                <p class="font-bold">${character.name}</p>
                <p class="text-xs text-secondary">${character.role || 'Ruolo non definito'}</p>
            </div>
            <div class="flex gap-2">
                <button class="edit-character-btn p-1 hover:text-accent" data-char-id="${character.id}"><i data-lucide="file-edit" class="w-4 h-4"></i></button>
                <button class="delete-character-btn p-1 hover:text-red-500" data-char-id="${character.id}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
        `;
        charactersListEl.appendChild(card);

        // Add event listeners for edit and delete buttons
        card.querySelector('.edit-character-btn').addEventListener('click', () => characterModal.open(character));
        card.querySelector('.delete-character-btn').addEventListener('click', async () => {
            if (confirm(`Sei sicuro di voler eliminare ${character.name}?`)) {
                await DataManager.deleteProjectItem('characters', character.id);
                loadCharacters(); // Refresh list
            }
        });
    });
    lucide.createIcons();
}

async function handleNewIdeaClick() {
    if (!newIdeaModal) {
        newIdeaModal = await loadModal('new-idea');
    }
    if (newIdeaModal) {
        newIdeaModal.open();
    }
}

async function handleNewCharacterClick() {
    if (!characterModal) {
        characterModal = await loadModal('character');
    }
    if (characterModal) {
        characterModal.open();
    }
}

export default {
    init: async function(dataManager, firebaseSync, modalLoader, viewSwitcher) {
        DataManager = dataManager;
        FirebaseSync = firebaseSync;
        loadModal = modalLoader;
        switchView = viewSwitcher;

        currentProjectId = await DataManager.getCurrentProjectId();
        if (!currentProjectId) {
            document.getElementById('view-ideation').innerHTML = '<p class="text-secondary text-center col-span-full">Seleziona un progetto dalla dashboard per iniziare.</p>';
            return;
        }

        // Load modals
        newIdeaModal = await loadModal('new-idea');
        characterModal = await loadModal('character');

        // Tab switching logic
        document.querySelectorAll('.ideation-tab-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                switchIdeationTab(tabName);
            });
        });

        // Button event listeners
        document.getElementById('new-idea-btn').addEventListener('click', handleNewIdeaClick);
        document.getElementById('new-character-btn').addEventListener('click', handleNewCharacterClick);

        // Custom event listeners for data changes
        document.addEventListener('idea-saved', loadIdeas);
        document.addEventListener('character-saved', loadCharacters);

        // Initial state: activate first tab and load its data
        switchIdeationTab('ideas-ai');
    }
};