let DataManager, FirebaseSync, loadModal, switchView;
let currentProjectId;
let sceneEditorModal = null;
const UNASSIGNED_KEY = 'unassigned';
let unassignedSelection = new Set();
import { StageUndo } from '../shared/stage-undo.js';

const HERO_JOURNEY_STAGES = {
  act1: [
    { key: 'ordinary_world', title: 'Mondo Ordinario' },
    { key: 'call_to_adventure', title: "Chiamata all'Avventura" },
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
    { key: 'return_with_elixir', title: "Ritorno con l'Elisir" },
  ],
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
    document.getElementById('structure-container').innerHTML =
      '<p class="text-secondary text-center col-span-full">Seleziona un progetto dalla dashboard per iniziare.</p>';
    return;
  }

  renderStructure();

  // Hook Expand/Collapse All per ogni atto
  const bindBulkToggle = actId => {
    const expandBtn = document.getElementById(`${actId}-expand-all`);
    const collapseBtn = document.getElementById(`${actId}-collapse-all`);
    expandBtn?.addEventListener('click', () => toggleAllStages(actId, true));
    collapseBtn?.addEventListener('click', () => toggleAllStages(actId, false));
  };
  bindBulkToggle('act-1');
  bindBulkToggle('act-2');
  bindBulkToggle('act-3');

  // Hook globale
  document
    .getElementById('global-expand-all')
    ?.addEventListener('click', () => {
      ['act-1', 'act-2', 'act-3'].forEach(id => toggleAllStages(id, true));
    });
  document
    .getElementById('global-collapse-all')
    ?.addEventListener('click', () => {
      ['act-1', 'act-2', 'act-3'].forEach(id => toggleAllStages(id, false));
    });

  document.addEventListener('hero-suggestions-applied', () => {
    // Ricarica tutte le liste per riflettere nuovi stage
    const unassignedContainer = document.getElementById('unassigned-scenes');
    loadUnassignedScenes(unassignedContainer);
    document.querySelectorAll('[data-stage-key]').forEach(stageEl => {
      const key = stageEl.getAttribute('data-stage-key');
      const list = stageEl.querySelector('.scenes-list');
      if (list) loadScenesForStage(key, list);
    });
  });
}

function renderStructure() {
  const act1Container = document.getElementById('act-1-stages');
  const act2Container = document.getElementById('act-2-stages');
  const act3Container = document.getElementById('act-3-stages');
  const unassignedContainer = document.getElementById('unassigned-scenes');

  act1Container.innerHTML = '';
  act2Container.innerHTML = '';
  act3Container.innerHTML = '';

  HERO_JOURNEY_STAGES.act1.forEach(stage =>
    act1Container.appendChild(createStageElement(stage))
  );
  HERO_JOURNEY_STAGES.act2.forEach(stage =>
    act2Container.appendChild(createStageElement(stage))
  );
  HERO_JOURNEY_STAGES.act3.forEach(stage =>
    act3Container.appendChild(createStageElement(stage))
  );
  // Carica unassigned
  loadUnassignedScenes(unassignedContainer);
  bindUnassignedControls();

  lucide.createIcons();
}

async function loadUnassignedScenes(container) {
  if (!container) return;
  container.innerHTML = '';
  const scenes = await DataManager.getScenesForStage(
    currentProjectId,
    UNASSIGNED_KEY
  );
  if (!scenes.length) {
    container.innerHTML =
      '<p class="text-xs text-secondary italic col-span-full">Nessuna scena non assegnata.</p>';
    return;
  }
  scenes.forEach(scene => container.appendChild(createSceneCard(scene, true)));
  // reinizializza selezioni non più presenti
  unassignedSelection.forEach(id => {
    if (!scenes.find(s => s.id === id)) unassignedSelection.delete(id);
  });
  updateUnassignedSelectionUI();
}

function bindUnassignedControls() {
  document
    .getElementById('unassigned-refresh')
    ?.addEventListener('click', async () => {
      const c = document.getElementById('unassigned-scenes');
      loadUnassignedScenes(c);
    });
  document.getElementById('unassigned-add')?.addEventListener('click', () => {
    sceneEditorModal.open({ stageKey: UNASSIGNED_KEY });
  });
  const selectAll = document.getElementById('unassigned-select-all');
  const batchTarget = document.getElementById('unassigned-batch-target');
  const batchApply = document.getElementById('unassigned-batch-apply');
  selectAll?.addEventListener('change', () => {
    const cards = document.querySelectorAll('#unassigned-scenes .scene-card');
    unassignedSelection.clear();
    if (selectAll.checked)
      cards.forEach(c => unassignedSelection.add(c.dataset.sceneId));
    updateUnassignedSelectionUI();
  });
  batchTarget?.addEventListener('change', () => {
    updateUnassignedSelectionUI();
  });
  batchApply?.addEventListener('click', async () => {
    const target = batchTarget.value;
    if (!target) return;
    const ids = Array.from(unassignedSelection);
    if (!ids.length) return;
    batchApply.disabled = true;
    batchApply.textContent = 'Assegno...';
    try {
      for (const id of ids) {
        const scene = await DataManager.getScene(id);
        if (!scene) continue;
        scene.stageKey = target;
        await DataManager.saveScene(scene);
      }
    } finally {
      batchApply.textContent = 'Applica';
      batchApply.disabled = false;
    }
    unassignedSelection.clear();
    const container = document.getElementById('unassigned-scenes');
    loadUnassignedScenes(container);
    // ricarica stage destinatario
    const stageContainer = document.querySelector(
      `[data-stage-key="${target}"]`
    );
    if (stageContainer)
      loadScenesForStage(target, stageContainer.querySelector('.scenes-list'));
  });
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
    toggleStageList(scenesList, toggleBtn);
  });

  addBtn.addEventListener('click', () => {
    sceneEditorModal.open({ stageKey: stage.key });
  });

  loadScenesForStage(stage.key, scenesList);
  enableDropForStage(scenesList, stage.key);

  return stageEl;
}

function toggleStageList(scenesList, toggleBtn) {
  scenesList.classList.toggle('hidden');
  const icon = toggleBtn.querySelector('i');
  icon.setAttribute(
    'data-lucide',
    scenesList.classList.contains('hidden')
      ? 'chevrons-up-down'
      : 'chevrons-down-up'
  );
  lucide.createIcons();
}

function toggleAllStages(actId, expand) {
  const container = document.getElementById(`${actId}-stages`);
  if (!container) return;
  const stages = container.querySelectorAll('.stage-container');
  stages.forEach(stage => {
    const scenesList = stage.querySelector('.scenes-list');
    const toggleBtn = stage.querySelector('.toggle-scenes-btn');
    if (!scenesList || !toggleBtn) return;
    setStageListState(scenesList, toggleBtn, expand);
  });
  // Aggiorna le icone una sola volta dopo l'operazione bulk
  lucide.createIcons();
}

function setStageListState(scenesList, toggleBtn, expand) {
  if (expand) {
    scenesList.classList.remove('hidden');
  } else {
    scenesList.classList.add('hidden');
  }
  const icon = toggleBtn?.querySelector('i');
  if (icon) {
    icon.setAttribute(
      'data-lucide',
      scenesList.classList.contains('hidden')
        ? 'chevrons-up-down'
        : 'chevrons-down-up'
    );
  }
}

async function loadScenesForStage(stageKey, scenesListContainer) {
  scenesListContainer.innerHTML = '';
  let scenes = await DataManager.getScenesForStage(currentProjectId, stageKey);
  // Inizializza order se mancante (assegna step 100)
  let dirty = false;
  let maxOrder = scenes.reduce(
    (m, s) => (typeof s.order === 'number' ? Math.max(m, s.order) : m),
    0
  );
  if (!maxOrder) maxOrder = 0;
  scenes.forEach((s, i) => {
    if (typeof s.order !== 'number') {
      s.order = maxOrder + (i + 1) * 100;
      dirty = true;
    }
  });
  if (dirty) {
    for (const s of scenes) await DataManager.saveScene(s);
    scenes = await DataManager.getScenesForStage(currentProjectId, stageKey); // ricarica ordinati
  }
  if (scenes.length === 0) {
    scenesListContainer.innerHTML = `<p class="text-xs text-secondary italic p-2">Nessuna scena.</p>`;
  }
  scenes.forEach(scene => {
    const sceneCard = createSceneCard(scene);
    enableCardReorder(sceneCard, scene, stageKey, scenesListContainer);
    scenesListContainer.appendChild(sceneCard);
  });
  lucide.createIcons();
}

function createSceneCard(scene, isUnassigned = false) {
  const template = document.getElementById('scene-card-template');
  const cardEl = template.content.cloneNode(true).firstElementChild;
  cardEl.dataset.sceneId = scene.id;
  cardEl.draggable = true;
  cardEl.querySelector('.scene-title').textContent = scene.title;
  // Mini badge stage (spostato top-left con tooltip)
  const badge = document.createElement('span');
  badge.className =
    'absolute top-1 left-1 stage-badge-mini ' + stageBadgeClass(scene.stageKey);
  badge.textContent = shortStageLabel(scene.stageKey);
  badge.title = fullStageLabel(scene.stageKey);
  cardEl.appendChild(badge);
  cardEl.querySelector('.scene-synopsis').textContent = scene.synopsis;
  const select = cardEl.querySelector('.scene-stage-select');
  if (select) {
    select.value = scene.stageKey || 'unassigned';
    select.addEventListener('change', async e => {
      const newKey = e.target.value;
      if (newKey === scene.stageKey) return;
      const fresh = await DataManager.getScene(scene.id);
      StageUndo.record(scene.id, fresh.stageKey, newKey);
      fresh.stageKey = newKey;
      await DataManager.saveScene(fresh);
      // ricarica contenitori interessati
      const unassignedC = document.getElementById('unassigned-scenes');
      loadUnassignedScenes(unassignedC);
      const stageContainer = document.querySelector(
        `[data-stage-key="${newKey}"]`
      );
      if (stageContainer) {
        const list = stageContainer.querySelector('.scenes-list');
        loadScenesForStage(newKey, list);
      }
      if (scene.stageKey && scene.stageKey !== 'unassigned') {
        const oldContainer = document.querySelector(
          `[data-stage-key="${scene.stageKey}"]`
        );
        if (oldContainer)
          loadScenesForStage(
            scene.stageKey,
            oldContainer.querySelector('.scenes-list')
          );
      }
    });
  }

  // Overlay condiviso
  import('../shared/overlay.js').then(({ addOverlayTo }) => {
    addOverlayTo(cardEl, {
      positionClass: 'absolute top-2 right-2',
      onEdit: () => sceneEditorModal.open({ scene }),
      onDelete: async () => {
        if (
          await window.appConfirm(
            `Sei sicuro di voler eliminare la scena "${scene.title}"?`,
            { title: 'Conferma eliminazione', confirmText: 'Elimina' }
          )
        ) {
          await DataManager.deleteScene(scene.id);
          cardEl.remove();
        }
      },
    });
    lucide.createIcons();
  });

  // Pulsante Apri esplicito
  cardEl
    .querySelector('[data-edit-scene]')
    ?.addEventListener('click', async e => {
      e.stopPropagation();
      await DataManager.setCurrentSceneId(scene.id);
      switchView('writing');
    });
  // Click su card (fuori dal select) apre
  cardEl.addEventListener('click', async e => {
    if (e.target.closest('select')) return;
    if (cardEl.dataset.dragging === '1') return;
    await DataManager.setCurrentSceneId(scene.id);
    switchView('writing');
  });

  // Drag handlers
  cardEl.addEventListener('dragstart', e => {
    cardEl.dataset.dragging = '1';
    cardEl.classList.add('dragging');
    e.dataTransfer.setData('text/scene-id', scene.id);
    e.dataTransfer.effectAllowed = 'move';
  });
  cardEl.addEventListener('dragend', () => {
    delete cardEl.dataset.dragging;
    cardEl.classList.remove('dragging');
  });
  // Checkbox selezione batch (solo se unassigned)
  if (isUnassigned) {
    const selBox = document.createElement('div');
    selBox.className = 'absolute top-1 left-1';
    selBox.innerHTML = `<input type="checkbox" class="scene-batch-chk accent-accent" data-scene-id="${scene.id}">`;
    cardEl.appendChild(selBox);
    const chk = selBox.querySelector('input');
    chk.addEventListener('change', () => {
      if (chk.checked) unassignedSelection.add(scene.id);
      else unassignedSelection.delete(scene.id);
      updateUnassignedSelectionUI();
    });
    if (unassignedSelection.has(scene.id)) chk.checked = true;
  }

  return cardEl;
}

function enableDropForStage(listEl, stageKey) {
  listEl.dataset.dropStage = stageKey;
  listEl.addEventListener('dragover', e => {
    e.preventDefault();
    listEl.classList.add('ring', 'ring-accent/60', 'drag-target');
  });
  listEl.addEventListener('dragleave', () => {
    listEl.classList.remove('ring', 'ring-accent/60', 'drag-target');
  });
  listEl.addEventListener('drop', async e => {
    e.preventDefault();
    listEl.classList.remove('ring', 'ring-accent/60', 'drag-target');
    const sceneId = e.dataTransfer.getData('text/scene-id');
    if (!sceneId) return;
    const scene = await DataManager.getScene(sceneId);
    if (!scene) return;
    if (scene.stageKey === stageKey) return;
    const oldStage = scene.stageKey;
    scene.stageKey = stageKey;
    StageUndo.record(scene.id, oldStage, stageKey);
    await DataManager.saveScene(scene);
    // Ricarica nuovo contenitore
    if (stageKey === UNASSIGNED_KEY) {
      loadUnassignedScenes(listEl);
    } else {
      loadScenesForStage(stageKey, listEl);
    }
    // Ricarica vecchio contenitore se diverso
    if (oldStage && oldStage !== stageKey) {
      if (oldStage === UNASSIGNED_KEY) {
        const unC = document.getElementById('unassigned-scenes');
        loadUnassignedScenes(unC);
      } else {
        const oldContainer = document.querySelector(
          `[data-stage-key="${oldStage}"]`
        );
        if (oldContainer) {
          const oldList = oldContainer.querySelector('.scenes-list');
          if (oldList) loadScenesForStage(oldStage, oldList);
        }
      }
    }
    // Aggiorna unassigned se necessario (né origine né destinazione unassigned)
    if (oldStage !== UNASSIGNED_KEY && stageKey !== UNASSIGNED_KEY) {
      const unassignedC = document.getElementById('unassigned-scenes');
      if (unassignedC) loadUnassignedScenes(unassignedC);
    }
    purgeSceneDuplicates(scene.id, stageKey);
  });
}

function shortStageLabel(key) {
  switch (key) {
    case 'ordinary_world':
      return 'ORD';
    case 'call_to_adventure':
      return 'CALL';
    case 'refusal_of_call':
      return 'RIF';
    case 'meeting_mentor':
      return 'MENT';
    case 'crossing_threshold':
      return 'SOGL';
    case 'tests_allies_enemies':
      return 'PROVE';
    case 'inmost_cave':
      return 'CAVER';
    case 'ordeal':
      return 'PROVA';
    case 'reward':
      return 'RIC';
    case 'road_back':
      return 'RITOR';
    case 'resurrection':
      return 'RES';
    case 'return_with_elixir':
      return 'ELIS';
    case 'unassigned':
      return '—';
    default:
      return key?.slice(0, 4)?.toUpperCase() || '?';
  }
}
function stageBadgeClass(key) {
  if (
    [
      'ordinary_world',
      'call_to_adventure',
      'refusal_of_call',
      'meeting_mentor',
    ].includes(key)
  )
    return 'stage-badge-act1';
  if (
    ['crossing_threshold', 'tests_allies_enemies', 'inmost_cave'].includes(key)
  )
    return 'stage-badge-act2';
  if (
    [
      'ordeal',
      'reward',
      'road_back',
      'resurrection',
      'return_with_elixir',
    ].includes(key)
  )
    return 'stage-badge-act3';
  return 'stage-badge-unassigned';
}

function fullStageLabel(key) {
  switch (key) {
    case 'ordinary_world':
      return 'Mondo Ordinario';
    case 'call_to_adventure':
      return "Chiamata all'Avventura";
    case 'refusal_of_call':
      return 'Rifiuto della Chiamata';
    case 'meeting_mentor':
      return 'Incontro con il Mentore';
    case 'crossing_threshold':
      return 'Superamento della Prima Soglia';
    case 'tests_allies_enemies':
      return 'Prove, Alleati e Nemici';
    case 'inmost_cave':
      return 'Avvicinamento alla Caverna';
    case 'ordeal':
      return 'Prova Centrale';
    case 'reward':
      return 'Ricompensa';
    case 'road_back':
      return 'La Via del Ritorno';
    case 'resurrection':
      return 'Resurrezione';
    case 'return_with_elixir':
      return "Ritorno con l'Elisir";
    case 'unassigned':
      return 'Non Assegnata';
    default:
      return key || '';
  }
}

function purgeSceneDuplicates(sceneId, keepStageKey) {
  const cards = document.querySelectorAll(
    `.scene-card[data-scene-id="${sceneId}"]`
  );
  if (cards.length <= 1) return;
  cards.forEach(card => {
    const stageContainer = card.closest('[data-stage-key]');
    const stage = stageContainer
      ? stageContainer.getAttribute('data-stage-key')
      : card.closest('#unassigned-scenes')
        ? UNASSIGNED_KEY
        : null;
    if (stage && stage !== keepStageKey) card.remove();
  });
}

// --- Reorder intra-stage ---
function enableCardReorder(cardEl, scene, stageKey, listEl) {
  cardEl.addEventListener('dragover', e => {
    if (!cardEl.dataset.sceneId) return;
    const dragging = document.querySelector('.scene-card.dragging');
    if (!dragging || dragging === cardEl) return;
    e.preventDefault();
    const rect = cardEl.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const before = y < rect.height / 2;
    cardEl.classList.toggle('drop-indicator-before', before);
    cardEl.classList.toggle('drop-indicator-after', !before);
  });
  cardEl.addEventListener('dragleave', () => {
    cardEl.classList.remove('drop-indicator-before', 'drop-indicator-after');
  });
  cardEl.addEventListener('drop', async e => {
    const dragging = document.querySelector('.scene-card.dragging');
    cardEl.classList.remove('drop-indicator-before', 'drop-indicator-after');
    if (!dragging) return;
    const draggedId = dragging.dataset.sceneId;
    if (!draggedId || draggedId === scene.id) return;
    // Verifica stessa stage list
    if (!listEl.contains(dragging)) return; // spostamento cross-stage già gestito altrove
    e.preventDefault();
    const dragScene = await DataManager.getScene(draggedId);
    const snapshot = snapshotStage(stageKey, listEl);
    const before = cardEl.classList.contains('drop-indicator-before');
    // Ricalcola ordine: prendi ordine target e crea offset
    const targetOrder = scene.order;
    const siblings = Array.from(listEl.querySelectorAll('.scene-card'))
      .map(el => ({ id: el.dataset.sceneId, order: Number(el.dataset.order) }))
      .filter(o => !isNaN(o.order));
    // Trova ordine precedente / successivo per creare gap
    let newOrder;
    if (before) {
      const prev = siblings
        .filter(s => s.order < targetOrder)
        .sort((a, b) => b.order - a.order)[0];
      const prevOrder = prev ? prev.order : targetOrder - 200;
      newOrder = Math.floor((prevOrder + targetOrder) / 2);
    } else {
      const next = siblings
        .filter(s => s.order > targetOrder)
        .sort((a, b) => a.order - b.order)[0];
      const nextOrder = next ? next.order : targetOrder + 200;
      newOrder = Math.floor((targetOrder + nextOrder) / 2);
    }
    // Se collassa (nessun gap) riesegui compattazione
    if (siblings.some(s => s.order === newOrder)) {
      await normalizeStageOrders(stageKey, listEl, siblings);
      const target = siblings.find(s => s.id === scene.id);
      const compactTargetOrder = target ? target.order : targetOrder;
      const compactSiblings = siblings.map(s =>
        s.id === scene.id ? { ...s, order: compactTargetOrder } : s
      );
      if (before) newOrder = compactTargetOrder - 50;
      else newOrder = compactTargetOrder + 50;
    }
    dragScene.order = newOrder;
    await DataManager.saveScene(dragScene);
    await reloadStageList(stageKey, listEl);
    StageUndo.record(dragScene.id, stageKey, stageKey); // per coerenza (from = to stage) non utile a revert ordine; gestiremo undo batch dopo
    // TODO: registro undo batch (todo 30) - snapshot intanto salvato
    cardEl.classList.remove('drop-indicator-before', 'drop-indicator-after');
  });
}

async function reloadStageList(stageKey, listEl) {
  await loadScenesForStage(stageKey, listEl);
}

function snapshotStage(stageKey, listEl) {
  return Array.from(listEl.querySelectorAll('.scene-card')).map(c => ({
    id: c.dataset.sceneId,
    order: Number(c.dataset.order),
    stageKey,
  }));
}

async function normalizeStageOrders(stageKey, listEl, siblingsDomSnapshot) {
  // Reassegna ordini progressivi *100
  const siblings = siblingsDomSnapshot.sort((a, b) => a.order - b.order);
  let i = 1;
  for (const s of siblings) {
    const sc = await DataManager.getScene(s.id);
    sc.order = i * 100;
    await DataManager.saveScene(sc);
    i++;
  }
}

function handleSceneSaved(e) {
  const { stageKey } = e.detail;
  if (stageKey === UNASSIGNED_KEY) {
    const unassignedContainer = document.getElementById('unassigned-scenes');
    loadUnassignedScenes(unassignedContainer);
    return;
  }
  const stageContainer = document.querySelector(
    `[data-stage-key="${stageKey}"]`
  );
  if (stageContainer) {
    const scenesList = stageContainer.querySelector('.scenes-list');
    loadScenesForStage(stageKey, scenesList);
  }
  // aggiorna anche unassigned per eventuali spostamenti
  loadUnassignedScenes(document.getElementById('unassigned-scenes'));
}

function updateUnassignedSelectionUI() {
  const counter = document.getElementById('unassigned-selected-counter');
  const batchApply = document.getElementById('unassigned-batch-apply');
  const batchTarget = document.getElementById('unassigned-batch-target');
  const selectAll = document.getElementById('unassigned-select-all');
  const totalCards = document.querySelectorAll(
    '#unassigned-scenes .scene-card'
  ).length;
  if (counter) counter.textContent = `${unassignedSelection.size} selezionate`;
  if (batchApply)
    batchApply.disabled = !(unassignedSelection.size && batchTarget?.value);
  if (selectAll)
    selectAll.checked =
      unassignedSelection.size && unassignedSelection.size === totalCards;
}

export default { init };

// Shortcut undo stage: Ctrl+Alt+Z (structure view only)
document.addEventListener('keydown', async e => {
  if (e.ctrlKey && e.altKey && (e.key === 'z' || e.key === 'Z')) {
    const view = document.getElementById('view-structure');
    if (!view || view.classList.contains('hidden')) return; // solo se siamo nella vista struttura
    e.preventDefault();
    const res = await StageUndo.undoLast();
    if (res?.ok) {
      // Rinfresca entrambe le aree
      const unassignedC = document.getElementById('unassigned-scenes');
      loadUnassignedScenes(unassignedC);
      document.querySelectorAll('[data-stage-key]').forEach(stageEl => {
        const key = stageEl.getAttribute('data-stage-key');
        const list = stageEl.querySelector('.scenes-list');
        if (list) loadScenesForStage(key, list);
      });
    }
  }
});
