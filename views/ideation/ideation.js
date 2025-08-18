let DataManager, FirebaseSync, loadModal;

export default {
    init: function(dataManager, firebaseSync, modalLoader) {
        DataManager = dataManager;
        FirebaseSync = firebaseSync;
        loadModal = modalLoader;

        // Tab switching logic
        document.querySelectorAll('.ideation-tab-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                // Update active tab button styles
                document.querySelectorAll('.ideation-tab-btn').forEach(btn => {
                    if (btn.dataset.tab === tabName) {
                        btn.classList.add('accent', 'border-accent');
                        btn.classList.remove('text-secondary', 'border-transparent');
                    } else {
                        btn.classList.remove('accent', 'border-accent');
                        btn.classList.add('text-secondary', 'border-transparent');
                    }
                });
                // Show/hide tab content
                document.querySelectorAll('.ideation-tab-content').forEach(content => {
                    if (content.id === `${tabName}-content`) {
                        content.classList.remove('hidden');
                    } else {
                        content.classList.add('hidden');
                    }
                });
            });
        });

        // Modal triggers
        document.getElementById('new-idea-btn').addEventListener('click', () => {
            loadModal('new-idea', true);
        });
        document.getElementById('new-character-btn').addEventListener('click', () => {
            loadModal('character', true);
        });
        document.getElementById('new-location-btn').addEventListener('click', () => {
            loadModal('location', true);
        });
        document.getElementById('new-object-btn').addEventListener('click', () => {
            loadModal('object', true);
        });
        document.getElementById('new-system-btn').addEventListener('click', () => {
            loadModal('system', true);
        });

        // Initial load of ideas (example)
        // loadIdeas();
    }
};