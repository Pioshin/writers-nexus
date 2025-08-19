import { DataManager } from '../../DataManager.js';

let modal, form, cancelBtn, titleInput, premiseInput;

function init() {
    modal = document.getElementById('new-project-modal');
    form = document.getElementById('new-project-form');
    cancelBtn = document.getElementById('cancel-project-modal');
    titleInput = document.getElementById('new-project-title');
    premiseInput = document.getElementById('new-project-premise');

    cancelBtn.addEventListener('click', close);
    form.addEventListener('submit', save);
}

function open() {
    form.reset();
    modal.classList.remove('hidden');
}

function close() {
    modal.classList.add('hidden');
}

async function save(e) {
    e.preventDefault();
    const title = titleInput.value.trim();
    const premise = premiseInput.value.trim();

    if (!title) return;

    const newProject = await DataManager.saveProject({ title, premise });
    await DataManager.setCurrentProjectId(newProject.id);

    close();
    // Ricarica l'app per mostrare il nuovo progetto come attivo
    // Una soluzione più elegante sarebbe un pub/sub o un event emitter
    window.location.reload(); 
}

export default { init, open, close };
