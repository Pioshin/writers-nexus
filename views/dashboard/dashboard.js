let DataManager, FirebaseSync, loadModal;

export default {
    init: function(dataManager, firebaseSync, modalLoader) {
        DataManager = dataManager;
        FirebaseSync = firebaseSync;
        loadModal = modalLoader;

        document.getElementById('new-project-btn').addEventListener('click', () => {
            loadModal('new-project', true);
        });

        // Placeholder for loading projects
        // loadProjects();
    }
};
