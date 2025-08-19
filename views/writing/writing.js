let DataManager, switchView;
let currentScene = null;
let editorEl, sceneTitleEl, wordCountEl, backBtn;
let saveTimeout;

async function init(dataManager, firebaseSync, modalLoader, viewSwitcher) {
    DataManager = dataManager;
    switchView = viewSwitcher;

    editorEl = document.getElementById('writing-editor');
    sceneTitleEl = document.getElementById('writing-scene-title');
    wordCountEl = document.getElementById('word-count');
    backBtn = document.getElementById('back-to-structure-btn');

    const sceneId = await DataManager.getCurrentSceneId();

    if (!sceneId) {
        document.getElementById('writing-editor-container').innerHTML = 
            `<div class="text-center text-secondary"> 
                <p>Nessuna scena selezionata.</p>
                <button id="go-to-structure-link" class="accent hover:underline mt-4">Torna alla pagina Struttura per scegliere una scena.</button>
            </div>`;
        document.getElementById('go-to-structure-link').addEventListener('click', () => switchView('structure'));
        sceneTitleEl.textContent = 'Nessuna Scena';
        return;
    }

    currentScene = await DataManager.getScene(sceneId);

    if (currentScene) {
        sceneTitleEl.textContent = currentScene.title;
        editorEl.value = currentScene.content || '';
        updateWordCount();

        editorEl.addEventListener('input', handleInput);
        backBtn.addEventListener('click', () => switchView('structure'));
    } else {
        sceneTitleEl.textContent = 'Errore: Scena non trovata';
    }
}

function handleInput() {
    clearTimeout(saveTimeout);
    updateWordCount();
    saveTimeout = setTimeout(saveContent, 1500); // Debounce: salva dopo 1.5s di inattività
}

async function saveContent() {
    if (!currentScene) return;
    
    const newContent = editorEl.value;
    if (newContent === currentScene.content) return; // Non salvare se non ci sono modifiche

    currentScene.content = newContent;
    await DataManager.saveScene(currentScene);
    console.log(`Scene ${currentScene.id} saved.`);
    // Potremmo aggiungere un piccolo indicatore di "salvato"
}

function updateWordCount() {
    const text = editorEl.value.trim();
    if (text === '') {
        wordCountEl.textContent = 0;
        return;
    }
    const words = text.split(/\s+/).filter(word => word.length > 0);
    wordCountEl.textContent = words.length;
}

export default { init };