let DataManager, FirebaseSync, loadModal;
let newProjectModal = null;

async function handleNewProjectClick() {
    if (!newProjectModal) {
        newProjectModal = await loadModal('new-project');
    }
    if (newProjectModal) {
        newProjectModal.open();
    }
}

export default {
    init: function(dataManager, firebaseSync, modalLoader) {
        DataManager = dataManager;
        FirebaseSync = firebaseSync;
        loadModal = modalLoader;

        const newProjectBtn = document.getElementById('new-project-btn');
        if (newProjectBtn) {
            newProjectBtn.addEventListener('click', handleNewProjectClick);
        }

        // TODO: Implementare il caricamento dinamico dei progetti
        // loadProjects();
    }
};