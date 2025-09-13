let DataManager, switchView;
let currentScene = null;
let sceneTitleEl, wordCountEl, backBtn;
let blocksContainer, scenesNav, sceneMetaEl, prevBtn, nextBtn, addBlockBtn;
let orderedScenes = [];
let saveTimeout;
let manuscriptOverlay, manuscriptContent, manuscriptToggleBtn, manuscriptCloseBtn, manuscriptWordsEl, manuscriptPagesEl, focusToggleBtn, anchorsNav;
const WORDS_PER_PAGE = 300;

async function init(dataManager, firebaseSync, modalLoader, viewSwitcher) {
    DataManager = dataManager;
    switchView = viewSwitcher;

    // DOM refs
    sceneTitleEl = document.getElementById('writing-scene-title');
    wordCountEl = document.getElementById('word-count');
    backBtn = document.getElementById('back-to-structure-btn');
    blocksContainer = document.getElementById('blocks-container');
    scenesNav = document.getElementById('scenes-nav');
    sceneMetaEl = document.getElementById('scene-meta');
    prevBtn = document.getElementById('prev-scene-btn');
    nextBtn = document.getElementById('next-scene-btn');
    addBlockBtn = document.getElementById('add-block-btn');
    manuscriptOverlay = document.getElementById('manuscript-overlay');
    manuscriptContent = document.getElementById('manuscript-content');
    manuscriptToggleBtn = document.getElementById('toggle-manuscript-edit');
    manuscriptCloseBtn = document.getElementById('close-manuscript-btn');
    manuscriptWordsEl = document.getElementById('manuscript-words');
    manuscriptPagesEl = document.getElementById('manuscript-pages');
    focusToggleBtn = document.getElementById('toggle-focus-mode');
    anchorsNav = document.getElementById('manuscript-anchors');

    backBtn.addEventListener('click', () => switchView('structure'));

    const projectId = await DataManager.getCurrentProjectId();
    if (!projectId) {
        renderEmpty('Seleziona un progetto dalla dashboard per iniziare.');
        return;
    }

    // Preleva l'ordine delle scene dalla Struttura (tutte le tappe in sequenza)
    const stages = ['ordinary_world','call_to_adventure','refusal_of_call','meeting_mentor','crossing_threshold','tests_allies_enemies','inmost_cave','ordeal','reward','road_back','resurrection','return_with_elixir'];
    orderedScenes = [];
    for (const stageKey of stages) {
        const scenes = await DataManager.getScenesForStage(projectId, stageKey);
        orderedScenes.push(...scenes);
    }

    // Se non ci sono scene
    if (orderedScenes.length === 0) {
        renderEmpty('Non ci sono scene nella Struttura. Aggiungine una dalla pagina Struttura.');
        return;
    }

    // Carica scena corrente o la prima
    let sceneId = await DataManager.getCurrentSceneId();
    if (!sceneId || !orderedScenes.find(s => s.id === sceneId)) {
        sceneId = orderedScenes[0].id;
        await DataManager.setCurrentSceneId(sceneId);
    }
    currentScene = await DataManager.getScene(sceneId);

    // Render nav e editor
    renderScenesNav();
    await loadSceneIntoEditor(currentScene);

    prevBtn.addEventListener('click', () => goToAdjacent(-1));
    nextBtn.addEventListener('click', () => goToAdjacent(1));
    addBlockBtn.addEventListener('click', () => {
        appendTextBlock('');
        updateWordCount();
    });

    // IA entry-point: continuazione scena
    try {
        const aiModal = await modalLoader('ai-assistant');
        const aiBtn = document.getElementById('open-ai-writing');
        aiBtn?.addEventListener('click', async () => {
            const goalEl = document.getElementById('ai-goal');
            if (goalEl && currentScene) {
                goalEl.value = `Continua la scena "${currentScene.title || 'Senza titolo'}" nello stesso tono. Sinossi: ${currentScene.synopsis || 'N/A'}`;
            }
            aiModal?.open?.();
        });
    } catch {}

        // Manuscript overlay events
        document.getElementById('open-manuscript-btn').addEventListener('click', openManuscript);
        manuscriptCloseBtn.addEventListener('click', closeManuscript);
        manuscriptToggleBtn.addEventListener('click', toggleManuscriptMode);
        focusToggleBtn.addEventListener('click', toggleFocusMode);
        document.addEventListener('keydown', (e) => {
            if (manuscriptOverlay.classList.contains('hidden')) return;
            if (e.key === 'Escape') closeManuscript();
            // Scorciatoie tastiera in modalità modifica
            const isEdit = manuscriptToggleBtn.dataset.mode === 'edit';
            if (!isEdit) return;
            const active = document.activeElement;
            if (!active || active.closest('#manuscript-content') == null) return;
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); document.execCommand('bold'); }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); document.execCommand('italic'); }
            if (e.altKey && e.key === '1') { e.preventDefault(); toggleHeading(active, 'h1'); }
            if (e.altKey && e.key === '2') { e.preventDefault(); toggleHeading(active, 'h2'); }
        });
}

function renderEmpty(msg) {
    const container = document.getElementById('view-writing');
    container.innerHTML = `<div class="p-8 text-center text-secondary">${msg}</div>`;
}

function renderScenesNav() {
    scenesNav.innerHTML = '';
    orderedScenes.forEach((s, idx) => {
        const li = document.createElement('li');
        const isActive = currentScene && currentScene.id === s.id;
        li.innerHTML = `<button class="w-full text-left px-2 py-1 rounded ${isActive ? 'bg-primary border border-accent/30' : 'hover:bg-primary/60'}" data-id="${s.id}">${idx + 1}. ${escapeHtml(s.title || 'Senza titolo')}</button>`;
        li.querySelector('button').addEventListener('click', async () => {
            await navigateToSceneId(s.id);
        });
        scenesNav.appendChild(li);
    });
}

async function navigateToSceneId(sceneId) {
    await saveContent();
    currentScene = await DataManager.getScene(sceneId);
    await DataManager.setCurrentSceneId(sceneId);
    await loadSceneIntoEditor(currentScene);
    renderScenesNav();
}

async function goToAdjacent(delta) {
    const idx = orderedScenes.findIndex(s => s.id === currentScene.id);
    if (idx === -1) return;
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= orderedScenes.length) return;
    await navigateToSceneId(orderedScenes[nextIdx].id);
}

async function loadSceneIntoEditor(scene) {
    if (!scene) return;
    sceneTitleEl.textContent = scene.title || 'Scena senza titolo';
    sceneMetaEl.textContent = scene.synopsis ? `Sinossi: ${scene.synopsis}` : '';
    blocksContainer.innerHTML = '';

    const blocks = scene.blocks && Array.isArray(scene.blocks) ? scene.blocks : (scene.content ? [{ type: 'text', content: scene.content }] : []);
    if (blocks.length === 0) {
        appendTextBlock('');
    } else {
        blocks.forEach(b => {
            appendTextBlock(b.content || '');
        });
    }
    updateWordCount();
}

function appendTextBlock(content = '') {
    const block = document.createElement('article');
    block.className = 'bg-primary border border-accent/20 rounded p-3 flex gap-3';
    block.innerHTML = `
        <div class="pt-1 text-secondary select-none cursor-grab"><i data-lucide="grip-vertical" class="w-4 h-4"></i></div>
        <div class="flex-1" contenteditable="true" spellcheck="false">${escapeHtml(content)}</div>
        <div class="flex items-start gap-2 opacity-70">
            <button class="p-1 hover:text-accent" title="Aggiungi sotto"><i data-lucide="plus-square" class="w-4 h-4"></i></button>
            <button class="p-1 hover:text-red-400" title="Elimina"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>`;

    const editorDiv = block.querySelector('[contenteditable]');
    editorDiv.addEventListener('input', onEditorInput);
    block.querySelector('[title="Aggiungi sotto"]').addEventListener('click', () => {
        const newBlock = appendTextBlock('');
        newBlock.querySelector('[contenteditable]').focus();
    });
    block.querySelector('[title="Elimina"]').addEventListener('click', () => {
        block.remove();
        updateWordCount();
        scheduleSave();
    });

    blocksContainer.appendChild(block);
    lucide.createIcons();
    return block;
}

function onEditorInput() {
    updateWordCount();
    scheduleSave();
}

function scheduleSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveContent, 1200);
}

function updateWordCount() {
    const blocks = blocksContainer.querySelectorAll('[contenteditable]');
    let total = 0;
    blocks.forEach(b => {
    const text = (b.textContent || '').trim();
        const words = text.match(/\S+/g);
        total += words ? words.length : 0;
    });
    wordCountEl.textContent = total;
}

async function saveContent() {
    if (!currentScene) return;
    const blocks = Array.from(blocksContainer.querySelectorAll('[contenteditable]')).map(div => ({ type: 'text', content: div.textContent }));
    const merged = { ...currentScene, blocks, content: blocks.map(b => b.content).join('\n\n') };
    currentScene = await DataManager.saveScene(merged);
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ------------ Manuscript (full-screen) ------------
function openManuscript() {
    // Forza modalità lettura all'apertura
    if (manuscriptToggleBtn) {
        manuscriptToggleBtn.dataset.mode = 'read';
        manuscriptToggleBtn.textContent = 'Modalità modifica';
    }
    generateManuscript(true);
    manuscriptOverlay.classList.remove('hidden');
    // blocca scroll sotto l'overlay
    document.body.style.overflow = 'hidden';
    lucide.createIcons();
}

function closeManuscript() {
    manuscriptOverlay.classList.add('hidden');
    // ripristina scroll
    document.body.style.overflow = '';
}

function toggleManuscriptMode() {
    const wasEdit = manuscriptToggleBtn.dataset.mode === 'edit';
    const newMode = wasEdit ? 'read' : 'edit';
    manuscriptToggleBtn.dataset.mode = newMode;
    manuscriptToggleBtn.textContent = newMode === 'edit' ? 'Solo lettura' : 'Modalità modifica';
    // Rirender con contenteditable on/off (readOnly = newMode !== 'edit')
    generateManuscript(newMode !== 'edit');
}

function generateManuscript(readOnly = true) {
    manuscriptContent.innerHTML = '';
    if (anchorsNav) anchorsNav.innerHTML = '';
    let totalWords = 0;
    orderedScenes.forEach((scene, idx) => {
        const section = document.createElement('section');
        section.className = 'mb-10 manuscript-section';
        const h2 = document.createElement('h2');
        h2.className = 'font-display text-accent text-2xl mb-4';
        h2.id = `scene-${idx + 1}`;
        h2.textContent = `${idx + 1}. ${scene.title || 'Senza titolo'}`;
        const body = document.createElement('div');
        body.className = 'leading-8 text-[1.125rem] manuscript-body max-w-[68ch] mx-auto';
        const blocks = scene.blocks && Array.isArray(scene.blocks) ? scene.blocks : (scene.content ? [{ type: 'text', content: scene.content }] : []);
        if (blocks.length === 0) {
            const p = document.createElement('p');
            p.className = 'text-secondary italic';
            p.textContent = '[Scena vuota]';
            body.appendChild(p);
        } else {
            blocks.forEach((b, bi) => {
                const p = document.createElement('p');
                p.contentEditable = String(!readOnly);
                p.dataset.sceneId = scene.id;
                p.dataset.blockIndex = String(bi);
                p.className = `${readOnly ? '' : 'outline-none focus:ring-2 focus:ring-accent rounded'} manuscript-paragraph py-1`;
        p.textContent = b.content || '';
                if (!readOnly) {
                    p.addEventListener('input', debounce(async () => {
            await saveManuscriptEdit(p.dataset.sceneId, Number(p.dataset.blockIndex), p.textContent);
                        updateManuscriptCounters();
                    }, 600));
                    p.addEventListener('focus', () => applyFocusState(p, true));
                    p.addEventListener('blur', () => applyFocusState(p, false));
                }
                body.appendChild(p);
                totalWords += countWords(p.textContent);
            });
        }
        section.appendChild(h2);
        section.appendChild(body);
        manuscriptContent.appendChild(section);
        if (anchorsNav) {
            const anchorBtn = document.createElement('a');
            anchorBtn.href = `#scene-${idx + 1}`;
            anchorBtn.className = 'px-2 py-1 rounded bg-primary border border-accent/20 hover:bg-opacity-80';
            anchorBtn.textContent = `${idx + 1}`;
            anchorsNav.appendChild(anchorBtn);
        }
    });
    if (manuscriptWordsEl && manuscriptPagesEl) {
        manuscriptWordsEl.textContent = String(totalWords);
        manuscriptPagesEl.textContent = (totalWords / WORDS_PER_PAGE).toFixed(2);
    }
}

async function saveManuscriptEdit(sceneId, blockIndex, newText) {
    const scene = await DataManager.getScene(sceneId);
    const blocks = scene.blocks && Array.isArray(scene.blocks) ? scene.blocks : (scene.content ? [{ type: 'text', content: scene.content }] : []);
    if (!blocks[blockIndex]) return;
    blocks[blockIndex] = { ...blocks[blockIndex], content: newText };
    const merged = { ...scene, blocks, content: blocks.map(b => b.content).join('\n\n') };
    await DataManager.saveScene(merged);
    // Se stiamo modificando la scena corrente, aggiorna editor e word count
    if (currentScene && currentScene.id === sceneId) {
        await navigateToSceneId(sceneId);
    }
}

function debounce(fn, wait = 300) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; }

function updateManuscriptCounters() {
    if (!manuscriptWordsEl || !manuscriptPagesEl) return;
    const paras = manuscriptContent.querySelectorAll('.manuscript-paragraph');
    let total = 0;
    paras.forEach(p => total += countWords(p.textContent || ''));
    manuscriptWordsEl.textContent = String(total);
    manuscriptPagesEl.textContent = (total / WORDS_PER_PAGE).toFixed(2);
}

function countWords(text) {
    const words = (text || '').trim().match(/\S+/g);
    return words ? words.length : 0;
}

function toggleFocusMode() {
    const enabled = !manuscriptOverlay.classList.contains('focus-mode');
    manuscriptOverlay.classList.toggle('focus-mode', enabled);
    if (focusToggleBtn) focusToggleBtn.textContent = enabled ? 'Esci focus' : 'Focus paragrafo';
}

function applyFocusState(p, focused) {
    if (!manuscriptOverlay.classList.contains('focus-mode')) return;
    manuscriptContent.querySelectorAll('.manuscript-paragraph').forEach(el => {
        el.style.opacity = focused && el !== p ? '0.3' : '';
    });
}

function toggleHeading(active, level) {
    if (!active || !active.classList.contains('manuscript-paragraph')) return;
    if (level === 'h1') {
        active.style.fontSize = active.style.fontSize === '1.5rem' ? '' : '1.5rem';
        active.style.fontWeight = active.style.fontWeight === '700' ? '' : '700';
    } else if (level === 'h2') {
        active.style.fontSize = active.style.fontSize === '1.25rem' ? '' : '1.25rem';
        active.style.fontWeight = active.style.fontWeight === '600' ? '' : '600';
    }
}

export default { init };