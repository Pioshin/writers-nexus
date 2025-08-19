let DataManager, FirebaseSync, loadModal, switchView;
let newProjectModal = null;

async function handleNewProjectClick() {
    if (!newProjectModal) {
        newProjectModal = await loadModal('new-project');
    }
    if (newProjectModal) {
        newProjectModal.open();
    }
}

async function selectProject(projectId) {
    await DataManager.setCurrentProjectId(projectId);
    // L'utente passa prima per l'ideazione
    switchView('ideation');
}

async function deleteProject(projectId, cardElement) {
    if (confirm('Sei sicuro di voler eliminare questo progetto e tutti i suoi dati? L\'azione è irreversibile.')) {
        await DataManager.deleteProject(projectId);
        cardElement.remove();
        // Potremmo anche controllare se la lista progetti è vuota e mostrare il messaggio
    }
}

async function loadProjects() {
    const projectsListEl = document.getElementById('projects-list');
    if (!projectsListEl) return;

    const projects = await DataManager.getProjects();
    projectsListEl.innerHTML = ''; // Pulisce la lista

    if (projects.length === 0) {
        projectsListEl.innerHTML = `<p class="text-secondary col-span-full">Non hai ancora nessun progetto. Creane uno per iniziare!</p>`;
        return;
    }

    projects.forEach(project => {
        const card = document.createElement('div');
        card.className = 'bg-secondary p-6 rounded-xl border border-border-color hover:border-accent transition group relative';
        
        const cardContent = document.createElement('div');
        cardContent.className = 'cursor-pointer';
        cardContent.innerHTML = `
            <h3 class="text-xl font-bold font-display">${project.title}</h3>
            <p class="text-secondary text-sm mt-2 h-10 overflow-hidden">${project.premise || 'Nessuna premessa definita.'}</p>
            <p class="text-xs text-secondary mt-4">Ultima modifica: ${new Date(project.lastModified).toLocaleDateString()}</p>
        `;
        cardContent.addEventListener('click', () => selectProject(project.id));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'absolute top-3 right-3 p-1 text-secondary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity';
        deleteBtn.innerHTML = `<i data-lucide="trash-2" class="w-4 h-4"></i>`;
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteProject(project.id, card);
        });

        card.appendChild(deleteBtn);
        card.appendChild(cardContent);
        projectsListEl.appendChild(card);
    });
    lucide.createIcons();
}

export default {
    init: function(dataManager, firebaseSync, modalLoader, viewSwitcher) {
        DataManager = dataManager;
        FirebaseSync = firebaseSync;
        loadModal = modalLoader;
        switchView = viewSwitcher;

        const newProjectBtn = document.getElementById('new-project-btn');
        if (newProjectBtn) {
            newProjectBtn.addEventListener('click', handleNewProjectClick);
        }

        loadProjects();
    }
};
