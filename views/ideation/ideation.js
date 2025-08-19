let DataManager, FirebaseSync, loadModal, switchView;
let currentProjectId;
let newIdeaModal = null;

function switchIdeationTab(tabName) {
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

async function handleNewIdeaClick() {
    if (!newIdeaModal) {
        newIdeaModal = await loadModal('new-idea');
    }
    if (newIdeaModal) {
        newIdeaModal.open();
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

        document.querySelectorAll('.ideation-tab-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                switchIdeationTab(tabName);
            });
        });

        document.getElementById('new-idea-btn').addEventListener('click', handleNewIdeaClick);
        document.addEventListener('idea-saved', loadIdeas);

        // TODO: Fix other modal buttons
        document.getElementById('new-character-btn').addEventListener('click', () => console.log('TODO: Open character modal'));
        document.getElementById('new-location-btn').addEventListener('click', () => console.log('TODO: Open location modal'));
        document.getElementById('new-object-btn').addEventListener('click', () => console.log('TODO: Open object modal'));
        document.getElementById('new-system-btn').addEventListener('click', () => console.log('TODO: Open system modal'));

        // Initial state
        switchIdeationTab('ideas-ai');
        loadIdeas();
    }
};