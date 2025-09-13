import { AIService } from '../../ai/AIService.js';
let DataManager, FirebaseSync, loadModal, switchView;
let currentProjectId;
let newIdeaModal = null;
let characterModal = null;
let locationModal = null;
let objectModal = null;
let systemModal = null;
let geographyModal = null; // New modal variable
let historyModal = null;   // New modal variable
let cultureModal = null;   // New modal variable

// Audio context per effetti UI
let audioCtx = null;
let swordBuffer = null; // sample audio opzionale
let heartBuffer = null; // sample audio opzionale per Amore
let uiSoundEnabled = true; // in futuro: leggere/impostare da settings

// --- Character Relationship Filtering ---
const RELATION_CATEGORIES = {
    positive: ['Amicizia', 'Alleanza', 'Amore', 'Rispetto'],
    negative: ['Rivalità', 'Inimicizia'],
    neutral: ['Famiglia', 'Mentore/Allievo', 'Sospetto']
};
const RELATION_COLORS = {
    positive: 'border-sky-400',
    negative: 'border-red-500',
    neutral: 'border-slate-400'
};
let activeRelationFilter = null; // { sourceId: 'char-id', category: 'positive' }

function getRelationCategory(type) {
    for (const category in RELATION_CATEGORIES) {
        if (RELATION_CATEGORIES[category].includes(type)) {
            return category;
        }
    }
    return 'neutral';
}

function setRelationFilter(sourceId, category) {
    if (activeRelationFilter && activeRelationFilter.sourceId === sourceId && activeRelationFilter.category === category) {
        activeRelationFilter = null; // Toggle off
    } else {
        activeRelationFilter = { sourceId, category };
    }
    loadCharacters(); // Re-render with the new filter
}
// --------------------------------------

// --- Narrative Tag Filtering ---
const NARRATIVE_TAGS = {
    archetype: ['eroe', 'mentore', 'ombra', 'alleato', 'guardiano della soglia', 'messaggero', 'mutafaccia'],
    role: ['protagonista', 'antagonista', 'deuteragonista', 'secondario'],
    importance: ['principale', 'secondario', 'ricorrente', 'cameo']
};
let activeTagFilters = { archetype: null, role: null, importance: null };

function populateTagFilters() {
    for (const category in NARRATIVE_TAGS) {
        const container = document.getElementById(`filter-${category}-tags`);
        if (!container) continue;

        container.innerHTML = ''; // Clear previous tags
        
        // Add a "clear filter" option
        const clearTag = document.createElement('span');
        clearTag.className = `tag-filter text-secondary text-xs font-medium me-2 px-2.5 py-0.5 rounded-full border border-transparent cursor-pointer hover:border-accent ${activeTagFilters[category] === null ? 'bg-accent text-primary' : ''}`;
        clearTag.textContent = 'Tutti';
        clearTag.addEventListener('click', () => toggleTagFilter(category, null));
        container.appendChild(clearTag);

        NARRATIVE_TAGS[category].forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.className = `tag-filter text-secondary text-xs font-medium me-2 px-2.5 py-0.5 rounded-full border border-transparent cursor-pointer hover:border-accent ${activeTagFilters[category] === tag ? 'bg-accent text-primary' : ''}`;
            tagEl.textContent = tag.charAt(0).toUpperCase() + tag.slice(1);
            tagEl.addEventListener('click', () => toggleTagFilter(category, tag));
            container.appendChild(tagEl);
        });
    }
}

function toggleTagFilter(category, value) {
    if (activeTagFilters[category] === value) {
        activeTagFilters[category] = null; // Toggle off
    } else {
        activeTagFilters[category] = value;
    }
    populateTagFilters(); // Update UI of filter tags
    loadCharacters(); // Re-render characters with new filter
}
// --------------------------------------

async function switchIdeationTab(tabName) {
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

    activeRelationFilter = null; // Reset relation filter when switching tabs
    activeTagFilters = { archetype: null, role: null, importance: null }; // Reset tag filters

    if (tabName === 'ideas-ai') {
        loadIdeas();
    } else if (tabName === 'characters') {
        populateTagFilters(); // Populate filters when switching to characters tab
        loadCharacters();
    } else if (tabName === 'worldbuilding') {
        loadLocations();
        loadObjects();
        loadSystems();
        loadGeography(); // New load function call
        loadHistory();   // New load function call
        loadCulture();   // New load function call
    }
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

    const overlayModule = await import('../shared/overlay.js');
    ideas.forEach((idea, index) => {
        const ideaEl = document.createElement('div');
        ideaEl.className = 'bg-primary p-3 rounded-lg border border-accent/30 text-sm text-secondary relative group';
        ideaEl.innerHTML = `
            <div class="flex items-start gap-3">
                <span class="bg-accent text-primary text-xs font-bold px-2 py-1 rounded-full flex-shrink-0">${index + 1}</span>
                <div class="idea-content whitespace-pre-wrap flex-1">${idea.content}</div>
            </div>
        `;

        overlayModule.addOverlayTo(ideaEl, {
            onEdit: async () => {
                if (!newIdeaModal) newIdeaModal = await loadModal('new-idea');
                newIdeaModal.open(idea);
            },
            onDelete: async () => {
                if (await window.appConfirm('Eliminare questa idea?', { title: 'Conferma eliminazione', confirmText: 'Elimina' })) {
                    await DataManager.deleteProjectItem('ideas', idea.id);
                    loadIdeas();
                }
            }
        });

        ideasListEl.appendChild(ideaEl);
    });
    lucide.createIcons();
}

async function generateIdeasShortcut() {
    const submitBtn = document.getElementById('gemini-submit');
    const responseEl = document.getElementById('gemini-response');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Generazione...';
    responseEl.innerHTML = '<div class="flex items-center justify-center p-4"><i data-lucide="loader" class="animate-spin"></i><span class="ml-2">L\'IA sta pensando...</span></div>';
    lucide.createIcons();

    try {
        const project = await DataManager.getProject(currentProjectId);
        const premise = project?.premise;

        if (!premise) {
            responseEl.textContent = 'Errore: La premessa del progetto non è stata trovata. Aggiungila nella Dashboard.';
            return;
        }

        const prompt = `Basandoti sulla seguente premessa, genera 3 idee distinte e concise per una storia. Ogni idea dovrebbe essere un singolo paragrafo. Formatta l'output in questo modo: numera ogni idea e separala con '---'. Esempio: 1. [Idea 1] --- 2. [Idea 2] --- 3. [Idea 3]\n\nPremessa: "${premise}"`;

        const aiResponse = await AIService.complete({ prompt });
        const ideasText = aiResponse.text;

        const ideas = ideasText.split('---').map(idea => idea.replace(/^\d+\.\s*/, '').trim()).filter(Boolean);

        if (ideas.length === 0) {
            responseEl.textContent = 'L\'IA non ha generato idee valide. Prova a riformulare la premessa.';
            return;
        }

        // Mostra solo le idee generate senza salvarle automaticamente
        responseEl.innerHTML = ideas.map((idea, index) => `<div class="p-2 my-1 bg-primary rounded"><b>${index + 1}.</b> ${idea}</div>`).join('');

        // Mostra il bottone per salvare la risposta come idea
        const saveBtn = document.getElementById('save-gemini-response-btn');
        if (saveBtn) {
            saveBtn.classList.remove('hidden');
        }

    } catch (error) {
        console.error('Error generating ideas:', error);
        responseEl.textContent = `Si è verificato un errore: ${error.message}`;
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Interroga l'IA";
    }
}

async function loadCharacters() {
    const charactersListEl = document.getElementById('characters-list');
    if (!charactersListEl) return;

    const allCharacters = await DataManager.getProjectItems(currentProjectId, 'characters');
    const charactersById = Object.fromEntries(allCharacters.map(c => [c.id, c]));
    charactersListEl.innerHTML = '';

    if (allCharacters.length === 0) {
        charactersListEl.innerHTML = `<p class="text-secondary text-sm p-4 text-center col-span-full">Nessun personaggio creato.</p>`;
        return;
    }

    let filteredCharacters = allCharacters;

    // Apply Narrative Tag Filters
    for (const category in activeTagFilters) {
        const filterValue = activeTagFilters[category];
        if (filterValue) {
            filteredCharacters = filteredCharacters.filter(char => {
                // Determine which property to filter on based on category
                const charProperty = char[category]; // This is 'archetype', 'role', or 'importance'
                
                // Correctly access the narrative role property if category is 'role'
                const valueToCompare = (category === 'role') ? char.narrativeRole : charProperty;
                
                return valueToCompare && valueToCompare.toLowerCase() === filterValue.toLowerCase();
            });
        }
    }

    let highlightedIds = null;
    if (activeRelationFilter) {
        const sourceChar = charactersById[activeRelationFilter.sourceId];
        if (sourceChar && sourceChar.relationships) {
            highlightedIds = sourceChar.relationships
                .filter(rel => getRelationCategory(rel.type) === activeRelationFilter.category)
                .map(rel => rel.targetCharacterId);
            highlightedIds.push(sourceChar.id); // Also highlight the source character
        }
    }

    const overlayModule = await import('../shared/overlay.js');
    filteredCharacters.forEach(character => {
        const card = document.createElement('div');
        const isFaded = highlightedIds && !highlightedIds.includes(character.id);
        card.className = `bg-secondary p-4 rounded-xl border border-border-color hover:border-accent transition-all duration-300 group relative cursor-pointer ${isFaded ? 'opacity-30' : ''}`;
        
        const tagsHTML = [character.archetype, character.narrativeRole, character.importance]
            .filter(tag => tag)
            .map(tag => `<span class="bg-primary text-secondary text-xs font-medium me-2 px-2.5 py-0.5 rounded-full">${tag}</span>`)
            .join('');

        const relationsHTML = (character.relationships || [])
            .map(rel => {
                const targetChar = charactersById[rel.targetCharacterId];
                if (!targetChar) return '';
                const category = getRelationCategory(rel.type);
                const colorClass = RELATION_COLORS[category];
                const initials = targetChar.name.split(' ').map(n => n[0]).join('');
                return `<div class="relation-avatar ${colorClass}" title="${rel.type} con ${targetChar.name}" data-category="${category}" data-source-id="${character.id}">${initials}</div>`;
            })
            .join('');

        card.innerHTML = `
            <div class="card-content">
                <h4 class="text-lg font-bold font-display text-primary mb-2">${character.name}</h4>
                <p class="text-secondary text-sm mb-3 h-5 overflow-hidden"><span>${character.role || 'Ruolo non definito'}</span></p>
                <div class="h-6 mb-3">${tagsHTML}</div>
                <div class="relations-container">${relationsHTML}</div>
            </div>
        `;

        overlayModule.addOverlayTo(card, {
            positionClass: 'overlay-actions', // Using the new shared class
            onEdit: () => characterModal.open(character),
            onDelete: async () => {
                if (await window.appConfirm(`Sei sicuro di voler eliminare ${character.name}?`, { title: 'Conferma eliminazione', confirmText: 'Elimina' })) {
                    await DataManager.deleteProjectItem('characters', character.id);
                    loadCharacters();
                }
            }
        });

        card.addEventListener('click', (e) => {
            if (!e.target.closest('button') && !e.target.closest('.relation-avatar')) {
                characterModal.open(character);
            }
        });

        card.querySelectorAll('.relation-avatar').forEach(avatar => {
            avatar.addEventListener('click', (e) => {
                e.stopPropagation();
                const sourceId = avatar.dataset.sourceId;
                const category = avatar.dataset.category;
                                // Animazione sul badge cliccato
                avatar.classList.remove('pulse-scale');
                // forza reflow per ri-trigger animazione
                void avatar.offsetWidth;
                avatar.classList.add('pulse-scale');
                // Suono: per "Inimicizia" riproduci effetto "spade"
                const title = avatar.getAttribute('title') || '';
                const isInimicizia = /Inimicizia/i.test(title);
                const isAmore = /Amore/i.test(title);
                if (isInimicizia) {
                    // Precarica il sample al primo click se non ancora caricato
                    if (!swordBuffer) {
                        loadSwordSample().catch(() => {});
                    }
                    playSwordClash();
                                        // Visual: spade incrociate al punto di click
                                        const swords = document.createElement('div');
                                        swords.className = 'swords-effect';
                                        swords.style.left = `${e.clientX}px`;
                                        swords.style.top = `${e.clientY}px`;
                                                            swords.innerHTML = `
                    <svg fill="currentColor" width="64" height="64" viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <g>
                            <g transform="translate(0.000000,511.000000) scale(0.100000,-0.100000)">
                                <path d="M9336.9,4935.4c-208.7-106.5-366.3-342.9-366.3-551.6c0-44.7-121.4-176.8-585.7-641.1l-585.7-585.7l-372.7,372.7c-308.8,308.8-372.7,383.4-372.7,432.4c0,187.4-225.8,308.8-402.6,219.4c-213-110.8-172.5-438.8,59.7-502.7c57.5-14.9,155.5-98,374.8-319.5l298.2-298.2l-176.8-176.8l-174.6-174.7v-285.4v-285.4l283.3,14.9l281.2,14.9l170.4,168.3l170.4,170.4l336.5-336.5c183.2-183.2,334.4-349.3,334.4-366.3c0-57.5,83.1-168.3,151.2-204.5c78.8-40.5,204.5-31.9,283.3,19.2c74.5,49,125.7,174.7,108.6,264.1c-19.2,108.6-129.9,217.2-234.3,234.3c-76.7,10.6-127.8,53.2-475,398.3l-387.6,385.5l590,590c519.7,519.7,600.6,592.1,658.1,592.1c251.3,0,543.1,264.1,592.1,536.7c19.2,110.7-17.1,232.2-93.7,304.6c-55.4,51.1-85.2,63.9-198.1,70.3C9488.1,5001.4,9454.1,4992.9,9336.9,4935.4z M7647.9,2664.9c-34.1-200.2-27.7-191.7-193.8-219.4c-83.1-12.8-153.4-21.3-155.5-19.2c-8.5,8.5,46.9,293.9,57.5,306.7c10.6,8.5,300.3,68.2,308.8,61.8C7669.2,2792.7,7660.7,2735.2,7647.9,2664.9z"/>
                                <path d="M244.5,4914.1c-38.3-21.3-85.2-66-106.5-98c-55.4-85.2-49-270.5,10.6-391.9c98-204.5,342.9-383.4,526.1-383.4c83.1,0,100.1-14.9,677.3-592.1l590-590l-368.5-368.5c-285.4-285.4-379.1-366.3-421.7-366.3c-76.7,0-193.8-83.1-238.5-170.4c-66-129.9-10.6-285.4,123.5-349.3c151.2-72.4,304.6-12.8,372.7,142.7c25.6,57.5,147,196,338.6,387.6l300.3,298.2l166.1-166.1l164-164h291.8h289.7l-10.6,272.6l-10.6,270.5l-168.3,170.4l-168.3,170.4l347.2,347.2c189.6,189.6,362.1,345,381.3,345c59.6,0,164,106.5,187.4,191.7c49,178.9-78.8,340.8-272.6,340.8c-80.9,0-106.5-10.6-176.8-83.1c-63.9-63.9-83.1-100.1-83.1-153.3c0-66-38.3-110.7-394-466.4l-394-394L1614,3697.9c-581.5,581.5-581.5,581.5-594.2,688C972.9,4769.2,517.2,5080.2,244.5,4914.1z M2502.2,2696.9l119.3-25.5l23.4-119.3c12.8-66,29.8-136.3,34.1-155.5c6.4-23.4,0-38.3-19.2-38.3c-68.2,0-283.3,51.1-296.1,70.3c-6.4,12.8-19.2,66-27.7,119.3c-6.4,53.2-17,115-23.4,136.3C2299.8,2728.8,2331.8,2731,2502.2,2696.9z"/>
                                <path d="M5839.7,1516.9L4955.8,633L4106,1480.7l-847.7,845.6l10.7-270.5l10.6-272.6h-291.8h-289.7l851.9-851.9L4402,79.3L2568.2-1756.7L734.4-3594.7L564-3871.6C385.1-4163.4,189.2-4534,165.7-4632c-6.4-32-4.3-61.8,6.4-70.3c59.6-36.2,647.5,264.1,1024.5,523.9c147,100.1,749.7,692.2,3130.9,3075.5l2949.9,2949.8l-279-12.8l-281.1-14.9l12.8,291.8c4.3,159.7,6.4,289.7,2.1,289.7C6727.8,2400.8,6325.3,2002.5,5839.7,1516.9z"/>
                                <path d="M5556.4-534.1l-270.5-270.5L6983.4-2500C8813-4323.1,8700.1-4223,9256-4542.5c232.1-134.2,453.7-234.3,513.3-234.3c76.7,0,10.6,183.2-217.3,592.1c-276.9,498.4-238.5,455.8-2027.6,2247C6604.3-1015.4,5846.1-261.5,5839.7-261.5S5705.5-382.9,5556.4-534.1z"/>
                            </g>
                        </g>
                    </svg>`;
                                        document.body.appendChild(swords);
                                        swords.addEventListener('animationend', () => swords.remove());
                } else if (isAmore) {
                    // Precarica il sample al primo click se non ancora caricato
                    if (!heartBuffer) {
                        loadHeartSample().catch(() => {});
                    }
                    playHeartbeat();
                    // Visual: cuore che si espande al punto di click
                    const heart = document.createElement('div');
                    heart.className = 'heart-effect';
                    heart.style.left = `${e.clientX}px`;
                    heart.style.top = `${e.clientY}px`;
                    heart.innerHTML = `
                        <svg fill="currentColor" width="64" height="64" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <path d="M12 21s-6.716-4.52-9.33-7.135C.733 11.93.5 9.23 2.05 7.39 3.6 5.55 6.21 5.3 8 6.86c.49.43.87.95 1.13 1.52.26-.57.64-1.09 1.13-1.52 1.79-1.56 4.4-1.31 5.95.53 1.55 1.84 1.32 4.54-.62 6.476C18.716 16.48 12 21 12 21z"/>
                        </svg>`;
                    document.body.appendChild(heart);
                    heart.addEventListener('animationend', () => heart.remove());
                }
                setRelationFilter(sourceId, category);
            });
        });
        
        charactersListEl.appendChild(card);
    });
    lucide.createIcons();
}

// --- Effetti sonori ---
function ensureAudioContext() {
    if (!audioCtx) {
        try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        // Prova a sbloccare l'audio in seguito a gesture dell'utente
        audioCtx.resume().catch(() => {});
    }
}

function playSwordClash() {
    if (!uiSoundEnabled) return;
    ensureAudioContext();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }

    if (swordBuffer) {
        const src = audioCtx.createBufferSource();
        src.buffer = swordBuffer;
        const g = audioCtx.createGain();
        g.gain.value = 0.18;
        src.connect(g).connect(audioCtx.destination);
        src.start();
        return;
    }

    // Fallback sintetico se non c'è sample
    const now = audioCtx.currentTime;
    const master = audioCtx.createGain();
    master.gain.value = 0.18;
    master.connect(audioCtx.destination);

    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(650, now);
    osc.frequency.exponentialRampToValueAtTime(250, now + 0.08);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.exponentialRampToValueAtTime(0.8, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    const bp = audioCtx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2200, now);
    osc.connect(bp).connect(g).connect(master);
    osc.start(now);
    osc.stop(now + 0.13);
}

// Facoltativo: caricamento di un sample remoto/locale (se aggiungi un file es. assets/sword.mp3)
async function loadSwordSample(url = 'assets/sword.mp3') {
    ensureAudioContext();
    if (!audioCtx) return;
    try {
        const res = await fetch(url);
        const arr = await res.arrayBuffer();
        swordBuffer = await audioCtx.decodeAudioData(arr);
    } catch (e) { console.warn('Impossibile caricare sample spade:', e); }
}

// Effetto sonoro per Amore (battito)
function playHeartbeat() {
    if (!uiSoundEnabled) return;
    ensureAudioContext();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }

    if (heartBuffer) {
        const src = audioCtx.createBufferSource();
        src.buffer = heartBuffer;
        const g = audioCtx.createGain();
        g.gain.value = 0.22;
        src.connect(g).connect(audioCtx.destination);
        src.start();
        return;
    }

    // Fallback sintetico: doppio impulso tipo battito (lub-dub)
    const now = audioCtx.currentTime;
    const master = audioCtx.createGain();
    master.gain.value = 0.22;
    master.connect(audioCtx.destination);

    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, now);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.9, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    // secondo impulso
    g.gain.setValueAtTime(0.0001, now + 0.12);
    g.gain.exponentialRampToValueAtTime(0.7, now + 0.14);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(g).connect(master);
    osc.start(now);
    osc.stop(now + 0.24);
}

async function loadHeartSample(url = 'assets/battito.mp3') {
    ensureAudioContext();
    if (!audioCtx) return;
    try {
        const res = await fetch(url);
        const arr = await res.arrayBuffer();
        heartBuffer = await audioCtx.decodeAudioData(arr);
    } catch (e) { console.warn('Impossibile caricare sample battito:', e); }
}


async function loadLocations() {
    const listEl = document.getElementById('locations-list');
    if (!listEl) return;
    const items = await DataManager.getProjectItems(currentProjectId, 'locations');
    listEl.innerHTML = '';
    if (items.length === 0) {
        listEl.innerHTML = `<p class="text-secondary text-sm p-4 text-center">Nessun luogo.</p>`;
        return;
    }
    const overlayModule = await import('../shared/overlay.js');
    items.forEach(loc => {
        const el = document.createElement('div');
        el.className = 'bg-primary p-3 rounded-lg text-sm text-secondary relative group';
        el.innerHTML = `
            <div class="font-semibold text-primary">${loc.name}</div>
            <div class="opacity-80 text-xs">${loc.description || ''}</div>
        `;
        overlayModule.addOverlayTo(el, {
            onEdit: () => locationModal.open(loc),
            onDelete: async () => {
                if (await window.appConfirm(`Eliminare il luogo \"${loc.name}\"?`, { title: 'Conferma eliminazione', confirmText: 'Elimina' })) {
                    await DataManager.deleteProjectItem('locations', loc.id);
                    loadLocations();
                }
            }
        });
        listEl.appendChild(el);
    });
    lucide.createIcons();
}

async function loadObjects() {
    const listEl = document.getElementById('objects-list');
    if (!listEl) return;
    const items = await DataManager.getProjectItems(currentProjectId, 'objects');
    listEl.innerHTML = '';
    if (items.length === 0) {
        listEl.innerHTML = `<p class="text-secondary text-sm p-4 text-center">Nessun oggetto.</p>`;
        return;
    }
    const overlayModule = await import('../shared/overlay.js');
    items.forEach(obj => {
        const el = document.createElement('div');
        el.className = 'bg-primary p-3 rounded-lg text-sm text-secondary relative group';
        el.innerHTML = `
            <div class="font-semibold text-primary">${obj.name}</div>
            <div class="opacity-80 text-xs">${obj.description || ''}</div>
        `;
        overlayModule.addOverlayTo(el, {
            onEdit: () => objectModal.open(obj),
            onDelete: async () => {
                if (await window.appConfirm(`Eliminare l'oggetto \"${obj.name}\"?`, { title: 'Conferma eliminazione', confirmText: 'Elimina' })) {
                    await DataManager.deleteProjectItem('objects', obj.id);
                    loadObjects();
                }
            }
        });
        listEl.appendChild(el);
    });
    lucide.createIcons();
}

async function loadSystems() {
    const listEl = document.getElementById('systems-list');
    if (!listEl) return;
    const items = await DataManager.getProjectItems(currentProjectId, 'systems');
    listEl.innerHTML = '';
    if (items.length === 0) {
        listEl.innerHTML = `<p class="text-secondary text-sm p-4 text-center">Nessun sistema.</p>`;
        return;
    }
    const overlayModule = await import('../shared/overlay.js');
    items.forEach(sys => {
        const el = document.createElement('div');
        el.className = 'bg-primary p-3 rounded-lg text-sm text-secondary relative group';
        el.innerHTML = `
            <div class="font-semibold text-primary">${sys.name}</div>
            <div class="opacity-80 text-xs">${sys.rules || ''}</div>
        `;
        overlayModule.addOverlayTo(el, {
            onEdit: () => systemModal.open(sys),
            onDelete: async () => {
                if (await window.appConfirm(`Eliminare il sistema \"${sys.name}\"?`, { title: 'Conferma eliminazione', confirmText: 'Elimina' })) {
                    await DataManager.deleteProjectItem('systems', sys.id);
                    loadSystems();
                }
            }
        });
        listEl.appendChild(el);
    });
    lucide.createIcons();
}

// --- Worldbuilding extra (stub in attesa di store/modali dedicati) ---
async function loadGeography() {
    const listEl = document.getElementById('geography-list');
    if (!listEl) return;
    // Placeholder finché non esistono store e modali dedicati
    listEl.innerHTML = `<p class="text-secondary text-sm p-4 text-center">Nessun elemento. (Sezione in arrivo)</p>`;
}

async function loadHistory() {
    const listEl = document.getElementById('history-list');
    if (!listEl) return;
    // Placeholder finché non esistono store e modali dedicati
    listEl.innerHTML = `<p class="text-secondary text-sm p-4 text-center">Nessun elemento. (Sezione in arrivo)</p>`;
}

async function loadCulture() {
    const listEl = document.getElementById('culture-list');
    if (!listEl) return;
    // Placeholder finché non esistono store e modali dedicati
    listEl.innerHTML = `<p class="text-secondary text-sm p-4 text-center">Nessun elemento. (Sezione in arrivo)</p>`;
}

async function handleNewIdeaClick() {
    if (!newIdeaModal) {
        newIdeaModal = await loadModal('new-idea');
    }
    if (newIdeaModal) {
        newIdeaModal.open();
    }
}

async function handleNewCharacterClick() {
    if (!characterModal) {
        characterModal = await loadModal('character');
    }
    if (characterModal) {
        characterModal.open();
    }
}

async function handleNewGeographyClick() {
    if (!geographyModal) {
        geographyModal = await loadModal('geography');
    }
    if (geographyModal) {
        geographyModal.open();
    }
}

async function handleNewHistoryClick() {
    if (!historyModal) {
        historyModal = await loadModal('history');
    }
    if (historyModal) {
        historyModal.open();
    }
}

async function handleNewCultureClick() {
    if (!cultureModal) {
        cultureModal = await loadModal('culture');
    }
    if (cultureModal) {
        cultureModal.open();
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

        // Load modals
        characterModal = await loadModal('character');
        locationModal = await loadModal('location');
        objectModal = await loadModal('object');
        systemModal = await loadModal('system');
        newIdeaModal = await loadModal('new-idea');
        geographyModal = await loadModal('geography'); // New modal load
        historyModal = await loadModal('history');     // New modal load
        cultureModal = await loadModal('culture');     // New modal load

        // Tab switching logic
        document.querySelectorAll('.ideation-tab-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                switchIdeationTab(tabName);
            });
        });

        // Button event listeners
        document.getElementById('gemini-submit').addEventListener('click', generateIdeasShortcut);
        document.getElementById('new-character-btn').addEventListener('click', handleNewCharacterClick);
        document.getElementById('new-idea-btn').addEventListener('click', handleNewIdeaClick);
        document.getElementById('new-location-btn').addEventListener('click', () => locationModal.open());
        document.getElementById('new-object-btn').addEventListener('click', () => objectModal.open());
        document.getElementById('new-system-btn').addEventListener('click', () => systemModal.open());
        document.getElementById('new-geography-btn').addEventListener('click', handleNewGeographyClick); // New button listener
        document.getElementById('new-history-btn').addEventListener('click', handleNewHistoryClick);     // New button listener
        document.getElementById('new-culture-btn').addEventListener('click', handleNewCultureClick);     // New button listener

        // Custom event listeners for data changes
        document.addEventListener('character-saved', loadCharacters);
        document.addEventListener('location-saved', loadLocations);
        document.addEventListener('object-saved', loadObjects);
        document.addEventListener('system-saved', loadSystems);
        document.addEventListener('idea-saved', loadIdeas);
        document.addEventListener('geography-saved', loadGeography); // New event listener
        document.addEventListener('history-saved', loadHistory);     // New event listener
        document.addEventListener('culture-saved', loadCulture);     // New event listener

        // Initial state: activate first tab and load its data
        switchIdeationTab('ideas-ai');

        // Entry-point Assistente IA nella testata Ideazione
        try {
            const aiModal = await loadModal('ai-assistant');
            const importModal = await loadModal('import-text');
            const aiBtn = document.getElementById('open-ai-ideation');
            const importBtn = document.getElementById('open-import-ideation');
            aiBtn?.addEventListener('click', async () => {
                const project = currentProjectId ? await DataManager.getProject(currentProjectId) : null;
                const goalEl = document.getElementById('ai-goal');
                if (goalEl) {
                    goalEl.value = `Genera 10 logline originali e con hook, ispirate alla premessa${project?.premise ? `: ${project.premise}` : ''}`;
                }
                aiModal?.open?.();
            });
            importBtn?.addEventListener('click', () => importModal?.open?.());
        } catch (e) { console.warn('AI modal non disponibile:', e); }

        // Precarica i sample audio al primo gesto dell'utente
        let preloadedSword = false;
        const preloadAudioOnGesture = async () => {
            if (preloadedSword) return;
            preloadedSword = true;
            try { await loadSwordSample('assets/sword.mp3'); } catch {}
            try { await loadHeartSample('assets/battito.mp3'); } catch {}
            document.removeEventListener('pointerdown', preloadAudioOnGesture);
            document.removeEventListener('keydown', preloadAudioOnGesture);
        };
        document.addEventListener('pointerdown', preloadAudioOnGesture, { once: true });
        document.addEventListener('keydown', preloadAudioOnGesture, { once: true });
    }
};
