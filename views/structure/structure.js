let DataManager, FirebaseSync, loadModal, switchView;
let currentProjectId;
let sceneEditorModal = null;

const HERO_JOURNEY_STAGES = {
    act1: [
        { key: 'ordinary_world', title: 'Mondo Ordinario' },
        { key: 'call_to_adventure', title: 'Chiamata all\'Avventura' },
        { key: 'refusal_of_call', title: 'Rifiuto della Chiamata' },
        { key: 'meeting_mentor', title: 'Incontro con il Mentore' },
        { key: 'crossing_threshold', title: 'Superamento della Prima Soglia' },
    ],
    act2: [
        { key: 'tests_allies_enemies', title: 'Prove, Alleati e Nemici' },
        { key: 'inmost_cave', title: 'Avvicinamento alla Caverna' },
        { key: 'ordeal', title: 'Prova Centrale' },
        { key: 'reward', title: 'Ricompensa' },
    ],
    act3: [
        { key: 'road_back', title: 'La Via del Ritorno' },
        { key: 'resurrection', title: 'Resurrezione' },
        { key: 'return_with_elixir', title: 'Ritorno con l\'Elisir' },
    ]
};

async function init(dataManager, firebaseSync, modalLoader, viewSwitcher) {
    DataManager = dataManager;
    FirebaseSync = firebaseSync;
    loadModal = modalLoader;
    switchView = viewSwitcher;

    sceneEditorModal = await loadModal('scene-editor');
    document.addEventListener('scene-saved', handleSceneSaved);

    currentProjectId = await DataManager.getCurrentProjectId();
    if (!currentProjectId) {
        document.getElementById('structure-container').innerHTML = '<p class="text-secondary text-center col-span-full">Seleziona un progetto dalla dashboard per iniziare.</p>';
        return;
    }

    renderStructure();
}

function renderStructure() {
    const act1Container = document.getElementById('act-1-stages');
    const act2Container = document.getElementById('act-2-stages');
    const act3Container = document.getElementById('act-3-stages');

    act1Container.innerHTML = '';
    act2Container.innerHTML = '';
    act3Container.innerHTML = '';

    HERO_JOURNEY_STAGES.act1.forEach(stage => act1Container.appendChild(createStageElement(stage)));
    HERO_JOURNEY_STAGES.act2.forEach(stage => act2Container.appendChild(createStageElement(stage)));
    HERO_JOURNEY_STAGES.act3.forEach(stage => act3Container.appendChild(createStageElement(stage)));
    
    lucide.createIcons();
}

function createStageElement(stage) {
    const template = document.getElementById('stage-template');
    const stageEl = template.content.cloneNode(true).firstElementChild;
    stageEl.dataset.stageKey = stage.key;
    stageEl.querySelector('.stage-title').textContent = stage.title;

    const scenesList = stageEl.querySelector('.scenes-list');
    const toggleBtn = stageEl.querySelector('.toggle-scenes-btn');
    const addBtn = stageEl.querySelector('.add-scene-btn');

    toggleBtn.addEventListener('click', () => {
        scenesList.classList.toggle('hidden');
        const icon = toggleBtn.querySelector('i');
        icon.setAttribute('data-lucide', scenesList.classList.contains('hidden') ? 'chevrons-up-down' : 'chevrons-down-up');
        lucide.createIcons();
    });

    addBtn.addEventListener('click', () => {
        sceneEditorModal.open({ stageKey: stage.key });
    });

    loadScenesForStage(stage.key, scenesList);

    return stageEl;
}

async function loadScenesForStage(stageKey, scenesListContainer) {
    scenesListContainer.innerHTML = '';
    const scenes = await DataManager.getScenesForStage(currentProjectId, stageKey);
    if (scenes.length === 0) {
        scenesListContainer.innerHTML = `<p class="text-xs text-secondary italic p-2">Nessuna scena.</p>`;
    }
    scenes.forEach(scene => {
        const sceneCard = createSceneCard(scene);
        scenesListContainer.appendChild(sceneCard);
    });
    lucide.createIcons();
}

function createSceneCard(scene) {
    const template = document.getElementById('scene-card-template');
    const cardEl = template.content.cloneNode(true).firstElementChild;
    cardEl.dataset.sceneId = scene.id;
    cardEl.querySelector('.scene-title').textContent = scene.title;
    cardEl.querySelector('.scene-synopsis').textContent = scene.synopsis;

    // Overlay condiviso
    import('../shared/overlay.js').then(({ addOverlayTo }) => {
        addOverlayTo(cardEl, {
            positionClass: 'absolute top-2 right-2',
            onEdit: () => sceneEditorModal.open({ scene }),
            onDelete: async () => {
                if (confirm(`Sei sicuro di voler eliminare la scena "${scene.title}"?`)) {
                    await DataManager.deleteScene(scene.id);
                    cardEl.remove();
                }
            }
        });
        lucide.createIcons();
    });
    
    cardEl.addEventListener('click', async () => {
        await DataManager.setCurrentSceneId(scene.id);
        switchView('writing');
    });

    return cardEl;
}

function handleSceneSaved(e) {
    const { stageKey } = e.detail;
    const stageContainer = document.querySelector(`[data-stage-key="${stageKey}"]`);
    if (stageContainer) {
        const scenesList = stageContainer.querySelector('.scenes-list');
        loadScenesForStage(stageKey, scenesList);
    }
}

export default { init };