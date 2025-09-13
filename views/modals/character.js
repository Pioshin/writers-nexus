import { DataManager } from '../../DataManager.js';
import { AIService } from '../../ai/AIService.js';
import { toast } from '../shared/toast.js';

const NARRATIVE_TAGS = {
    archetype: ['eroe', 'mentore', 'ombra', 'alleato', 'guardiano della soglia', 'messaggero', 'mutafaccia'],
    role: ['protagonista', 'antagonista', 'deuteragonista', 'secondario'],
    importance: ['principale', 'secondario', 'ricorrente', 'cameo']
};

const RELATIONSHIP_TYPES = { 
    'Amicizia': 'Amicizia', 'Alleanza': 'Alleanza', 'Amore': 'Amore', 'Famiglia': 'Famiglia', 
    'Mentore/Allievo': 'Mentore/Allievo', 'Rivalità': 'Rivalità', 'Inimicizia': 'Inimicizia', 
    'Rispetto': 'Rispetto', 'Sospetto': 'Sospetto' 
};

let modal, form, modalTitle, saveBtn, cancelBtn;
let characterIdInput, nameInput, roleInput, appearanceInput, psychologyInput, pastInput, voiceInput;
let archetypeSelect, narrativeRoleSelect, importanceSelect;
let relationsEditor, addRelationBtn;
// Tabs & IA elements
let tabDetailsBtn, tabAiBtn, tabDetailsPane, tabAiPane;
let aiInstructionsInput, aiTempRange, aiTempVal, aiMaxTokInput, aiGenerateBtn, aiImproveBtn, aiStopBtn, aiOutputPre, aiApplyBtn, aiCopyBtn;
let aiUseContextCkb, aiContextStatus;
let aiGenreInput, aiToneInput;

let allCharacters = []; // To populate relationship target dropdown

function init() {
    modal = document.getElementById('character-modal');
    form = document.getElementById('character-form');
    modalTitle = document.getElementById('character-modal-title');
    saveBtn = document.getElementById('save-character-btn');
    cancelBtn = document.getElementById('cancel-character-btn');

    // Tabs
    tabDetailsBtn = document.getElementById('tab-details');
    tabAiBtn = document.getElementById('tab-ai');
    tabDetailsPane = document.getElementById('character-tab-details');
    tabAiPane = document.getElementById('character-tab-ai');

    // Standard fields
    characterIdInput = document.getElementById('character-id');
    nameInput = document.getElementById('character-name');
    roleInput = document.getElementById('character-role');
    appearanceInput = document.getElementById('character-appearance');
    psychologyInput = document.getElementById('character-psychology');
    pastInput = document.getElementById('character-past');
    voiceInput = document.getElementById('character-voice');

    // Tags
    archetypeSelect = document.getElementById('character-archetype');
    narrativeRoleSelect = document.getElementById('character-narrative-role');
    importanceSelect = document.getElementById('character-importance');

    // Relations
    relationsEditor = document.getElementById('character-relations-editor');
    addRelationBtn = document.getElementById('add-relation-btn');

    // IA controls
    aiInstructionsInput = document.getElementById('ai-character-instructions');
    aiTempRange = document.getElementById('ai-character-temp');
    aiTempVal = document.getElementById('ai-character-temp-val');
    aiMaxTokInput = document.getElementById('ai-character-maxtok');
    aiGenerateBtn = document.getElementById('ai-character-generate');
    aiImproveBtn = document.getElementById('ai-character-improve');
    aiStopBtn = document.getElementById('ai-character-stop');
    aiOutputPre = document.getElementById('ai-character-output');
    aiApplyBtn = document.getElementById('ai-character-apply');
    aiCopyBtn = document.getElementById('ai-character-copy');
    aiUseContextCkb = document.getElementById('ai-character-use-context');
    aiContextStatus = document.getElementById('ai-character-context-status');
    aiGenreInput = document.getElementById('ai-character-genre');
    aiToneInput = document.getElementById('ai-character-tone');

    populateSelects();

    cancelBtn.addEventListener('click', close);
    saveBtn.addEventListener('click', save);
    addRelationBtn.addEventListener('click', () => addRelationRow());
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        save();
    });

    // Tabs handlers
    if (tabDetailsBtn && tabAiBtn) {
        tabDetailsBtn.addEventListener('click', () => switchTab('details'));
        tabAiBtn.addEventListener('click', () => switchTab('ai'));
    }
    if (aiTempRange && aiTempVal) {
        aiTempRange.addEventListener('input', () => aiTempVal.textContent = aiTempRange.value);
    }
    // IA buttons
    aiGenerateBtn?.addEventListener('click', () => runAI('create'));
    aiImproveBtn?.addEventListener('click', () => runAI('improve'));
    aiStopBtn?.addEventListener('click', () => AIService.abort());
    aiApplyBtn?.addEventListener('click', applyAIToFields);
    aiCopyBtn?.addEventListener('click', copyAIOutput);
}

function populateSelects() {
    NARRATIVE_TAGS.archetype.forEach(tag => {
        archetypeSelect.add(new Option(tag.charAt(0).toUpperCase() + tag.slice(1), tag));
    });
    NARRATIVE_TAGS.role.forEach(tag => {
        narrativeRoleSelect.add(new Option(tag.charAt(0).toUpperCase() + tag.slice(1), tag));
    });
    NARRATIVE_TAGS.importance.forEach(tag => {
        importanceSelect.add(new Option(tag.charAt(0).toUpperCase() + tag.slice(1), tag));
    });
}

async function open(character = {}) {
    form.reset();
    
    // Fetch all characters for relationship dropdowns
    const currentProjectId = await DataManager.getCurrentProjectId();
    if (!currentProjectId) {
    modal.classList.add('hidden');
    toast.error('Nessun progetto selezionato. Seleziona un progetto dalla dashboard per aggiungere personaggi.');
        return;
    }

    try {
        allCharacters = await DataManager.getProjectItems(currentProjectId, 'characters');
    } catch (error) {
        console.error('character.js: Error fetching allCharacters:', error);
        allCharacters = []; // Ensure it's an empty array on error
    }

    characterIdInput.value = character.id || '';
    nameInput.value = character.name || '';
    roleInput.value = character.role || '';
    appearanceInput.value = character.appearance || '';
    psychologyInput.value = character.psychology || '';
    pastInput.value = character.past || '';
    voiceInput.value = character.voice || '';
    archetypeSelect.value = character.archetype || '';
    narrativeRoleSelect.value = character.narrativeRole || '';
    importanceSelect.value = character.importance || '';

    renderRelations(character.relationships || []);

    modalTitle.textContent = character.id ? 'Modifica Personaggio' : 'Crea Nuovo Personaggio';
    modal.classList.remove('hidden');
    switchTab('details');

    // Prefill IA Genre/Tone from project settings if available
    try {
        const project = await DataManager.getProject(currentProjectId);
        if (project) {
            if (aiGenreInput && !aiGenreInput.value) aiGenreInput.value = project.genre || '';
            if (aiToneInput && !aiToneInput.value) aiToneInput.value = project.tone || '';
        }
    } catch {}
}

function close() {
    modal.classList.add('hidden');
}

async function save() {
    const relationships = [];
    document.querySelectorAll('#character-relations-editor .relation-row').forEach(row => {
        const targetId = row.querySelector('.relation-target').value;
        const type = row.querySelector('.relation-type').value;
        if (targetId && type) {
            relationships.push({ targetCharacterId: targetId, type: type });
        }
    });

    const characterData = {
        id: characterIdInput.value || undefined,
        name: nameInput.value.trim(),
        role: roleInput.value.trim(),
        appearance: appearanceInput.value.trim(),
        psychology: psychologyInput.value.trim(),
        past: pastInput.value.trim(),
        voice: voiceInput.value.trim(),
        archetype: archetypeSelect.value,
        narrativeRole: narrativeRoleSelect.value,
        importance: importanceSelect.value,
        relationships: relationships
    };

    if (!characterData.name) { toast.error('Il nome del personaggio è obbligatorio.'); return; }

    const currentProjectId = await DataManager.getCurrentProjectId();
    if (!currentProjectId) { toast.error('Nessun progetto selezionato.'); return; }

    try {
        await DataManager.saveProjectItem(currentProjectId, 'characters', characterData);
        document.dispatchEvent(new CustomEvent('character-saved'));
        close();
    } catch (error) {
        console.error('Error saving character:', error);
    toast.error(`Errore durante il salvataggio del personaggio: ${error.message}`);
    }
}

function renderRelations(relations = []) {
    relationsEditor.innerHTML = '';
    relations.forEach(rel => addRelationRow(rel));
}

function addRelationRow(relation = {}) {
    const row = document.createElement('div');
    row.className = 'relation-row flex items-center gap-2 mb-2';

    // Dropdown for target character
    const targetSelect = document.createElement('select');
    targetSelect.className = 'relation-target flex-1 px-4 py-2 bg-primary border border-accent/30 rounded-lg';
    targetSelect.add(new Option('Seleziona personaggio...', ''));
    
    const currentCharacterId = characterIdInput.value;
    allCharacters.forEach(char => {
        if (char.id !== currentCharacterId) { // Prevent self-relation
            targetSelect.add(new Option(char.name, char.id));
        }
    });
    targetSelect.value = relation.targetCharacterId || '';

    // Dropdown for relationship type
    const typeSelect = document.createElement('select');
    typeSelect.className = 'relation-type flex-1 px-4 py-2 bg-primary border border-accent/30 rounded-lg';
    for (const [key, value] of Object.entries(RELATIONSHIP_TYPES)) {
        typeSelect.add(new Option(value, key));
    }
    typeSelect.value = relation.type || 'Amicizia';

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.innerHTML = '<i data-lucide="trash-2" class="w-5 h-5 text-red-500"></i>';
    removeBtn.className = 'p-2 hover:bg-primary rounded-full';
    removeBtn.addEventListener('click', () => row.remove());

    row.appendChild(targetSelect);
    row.appendChild(typeSelect);
    row.appendChild(removeBtn);
    relationsEditor.appendChild(row);
    
    lucide.createIcons();
}

export default { init, open, close };

// --- Tabs ---
function switchTab(which) {
    const isDetails = which === 'details';
    tabDetailsPane?.classList.toggle('hidden', !isDetails);
    tabAiPane?.classList.toggle('hidden', isDetails);
    if (tabDetailsBtn && tabAiBtn) {
        tabDetailsBtn.classList.toggle('bg-accent/20', isDetails);
        tabDetailsBtn.classList.toggle('text-accent', isDetails);
        tabAiBtn.classList.toggle('bg-accent/20', !isDetails);
        tabAiBtn.classList.toggle('text-accent', !isDetails);
    }
}

// --- IA helpers ---
function buildCharacterContext() {
    const ctx = {
        name: nameInput?.value?.trim(),
        role: roleInput?.value?.trim(),
        appearance: appearanceInput?.value?.trim(),
        psychology: psychologyInput?.value?.trim(),
        past: pastInput?.value?.trim(),
        voice: voiceInput?.value?.trim(),
        archetype: archetypeSelect?.value,
        narrativeRole: narrativeRoleSelect?.value,
    importance: importanceSelect?.value,
    genre: aiGenreInput?.value?.trim(),
    tone: aiToneInput?.value?.trim()
    };
    return ctx;
}

function buildSystemPrompt() {
    return `Sei un assistente narrativo esperto. Genera un JSON compatibile per il personaggio con le seguenti chiavi:
{
  "name": string,
  "role": string,
  "appearance": string,
  "psychology": string,
  "past": string,
  "voice": string,
  "archetype": string,
  "narrativeRole": string,
  "importance": string,
  "relationships": [ { "targetName": string, "type": string } ]
}
Rispondi SOLO con JSON valido, senza testo aggiuntivo.`;
}

function buildUserPrompt(mode) {
    const ctx = buildCharacterContext();
    const instructions = aiInstructionsInput?.value?.trim();
    const base = mode === 'create' ? 'Crea un personaggio coerente con le istruzioni.' : 'Migliora/Completa questo personaggio mantenendo i campi già buoni e armonizzando il resto.';
    return [
        base,
        instructions ? `Istruzioni: ${instructions}` : null,
        ctx.genre || ctx.tone ? `Genere/Tono del romanzo: ${[ctx.genre, ctx.tone].filter(Boolean).join(' | ')}` : null,
        ctx.name || ctx.role || ctx.appearance || ctx.psychology || ctx.past || ctx.voice ? `Dati attuali: ${JSON.stringify(ctx)}` : null
    ].filter(Boolean).join('\n\n');
}

function repairJson(str) {
    if (!str) return '';
    let s = String(str).trim();
    // Strip code fences
    s = s.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '');
    // Remove trailing commas
    s = s.replace(/,\s*([}\]])/g, '$1');
    // Try to wrap top if it's inside text
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start !== -1 && end !== -1) s = s.slice(start, end + 1);
    return s;
}

async function runAI(mode) {
    aiOutputPre.textContent = '...';
    const system = buildSystemPrompt();
    let prompt = buildUserPrompt(mode);
    // Optional: add manuscript context
    if (aiUseContextCkb?.checked) {
        try {
            const ctxBlock = await buildManuscriptContext();
            if (ctxBlock) {
                prompt += `\n\nContesto dal romanzo (estratto rilevante):\n${ctxBlock}`;
            }
        } catch (e) {
            console.warn('Context build failed', e);
        }
    }
    const temperature = parseFloat(aiTempRange?.value ?? '0.7') || 0.7;
    const maxTokens = parseInt(aiMaxTokInput?.value ?? '700', 10) || 700;
    try {
        const { text } = await AIService.complete({ prompt, system, temperature, maxTokens });
        aiOutputPre.textContent = text || '';
    } catch (err) {
        aiOutputPre.textContent = `Errore IA: ${err.message}`;
        console.error('AI character error:', err);
    }
}

function applyAIToFields() {
    const raw = aiOutputPre.textContent || '';
    const repaired = repairJson(raw);
    let obj;
    try {
        obj = JSON.parse(repaired);
    } catch (e) {
    toast.error('JSON IA non valido, correggi e riprova.');
        return;
    }
    // Apply conservatively: only set if provided
    if (obj.name) nameInput.value = obj.name;
    if (obj.role) roleInput.value = obj.role;
    if (obj.appearance) appearanceInput.value = obj.appearance;
    if (obj.psychology) psychologyInput.value = obj.psychology;
    if (obj.past) pastInput.value = obj.past;
    if (obj.voice) voiceInput.value = obj.voice;
    if (obj.archetype) archetypeSelect.value = obj.archetype;
    if (obj.narrativeRole) narrativeRoleSelect.value = obj.narrativeRole;
    if (obj.importance) importanceSelect.value = obj.importance;
    if (Array.isArray(obj.relationships)) {
        // Try map by targetName to existing characters
        const map = new Map(allCharacters.map(c => [c.name.toLowerCase(), c.id]));
        renderRelations(obj.relationships
            .map(r => ({ targetCharacterId: map.get((r.targetName||'').toLowerCase()) || '', type: r.type || 'Amicizia' }))
        );
    }
}

function copyAIOutput() {
    const txt = aiOutputPre.textContent || '';
    navigator.clipboard?.writeText(txt).then(() => {}, () => {});
}

// --- Manuscript context ---
async function buildManuscriptContext() {
    aiContextStatus && (aiContextStatus.textContent = 'Raccolgo contesto...');
    const projectId = await DataManager.getCurrentProjectId();
    if (!projectId) {
        aiContextStatus && (aiContextStatus.textContent = 'Nessun progetto.');
        return '';
    }
    const scenes = (await DataManager.getProjectItems(projectId, 'scenes')) || [];
    const ideas = (await DataManager.getProjectItems(projectId, 'ideas')) || [];
    const plotlines = (await DataManager.getProjectItems(projectId, 'plotlines')) || [];
    const targetName = (nameInput?.value || '').trim();
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tokens = targetName ? targetName.split(/\s+|-/).filter(t => t.length >= 3) : [];
    const fullRe = targetName ? new RegExp(`\\b${esc(targetName)}\\b`, 'i') : null;
    const tokenRes = tokens.map(t => new RegExp(`\\b${esc(t)}\\b`, 'i'));
    const scoreText = (txt) => {
        if (!txt) return 0;
        let sc = 0;
        if (fullRe && fullRe.test(txt)) sc += 5;
        for (const r of tokenRes) if (r.test(txt)) sc += 2;
        return sc;
    };
    const centerSnippet = (txt) => {
        if (!txt) return '';
        let idx = -1;
        if (fullRe) { const m = txt.match(fullRe); if (m) idx = txt.indexOf(m[0]); }
        if (idx === -1) {
            for (const r of tokenRes) { const m = txt.match(r); if (m) { idx = txt.indexOf(m[0]); break; } }
        }
        if (idx === -1) return txt.slice(0, 1200);
        const window = 600;
        const start = Math.max(0, idx - window);
        const end = Math.min(txt.length, idx + window);
        return (start > 0 ? '...' : '') + txt.slice(start, end) + (end < txt.length ? '...' : '');
    };
    // Score scenes
    const scored = scenes.map(s => {
        const text = [s.title, s.synopsis, s.content].filter(Boolean).join('\n');
        return { s, text, score: scoreText(text) };
    });
    // Sort by score desc then by order
    scored.sort((a, b) => (b.score - a.score) || ((a.s.order||0) - (b.s.order||0)));
    let selected = scored.filter(x => x.score > 0).slice(0, 6);
    // If few, add neighbors by order
    if (selected.length < 3 && scenes.length) {
        const byOrder = [...scenes].sort((a, b) => (a.order||0) - (b.order||0));
        const pickedIds = new Set(selected.map(x => x.s.id));
        // Seed with top scored if any; else use first scene
        const seed = selected[0]?.s || byOrder[0];
        const idx = byOrder.findIndex(x => x.id === seed.id);
        const neighborIdxs = [idx-1, idx, idx+1, idx+2, idx-2].filter(i => i >=0 && i < byOrder.length);
        for (const i of neighborIdxs) {
            const sc = byOrder[i];
            if (!pickedIds.has(sc.id)) {
                const text = [sc.title, sc.synopsis, sc.content].filter(Boolean).join('\n');
                selected.push({ s: sc, text, score: scoreText(text) });
                pickedIds.add(sc.id);
            }
            if (selected.length >= 6) break;
        }
    }
    // Ideas context
    const ideaHits = [];
    if (ideas.length && (fullRe || tokenRes.length)) {
        for (const it of ideas) {
            const content = it.content || '';
            const sc = scoreText(content);
            if (sc > 0) ideaHits.push({ it, sc, snippet: centerSnippet(content).slice(0, 800) });
            if (ideaHits.length >= 5) break;
        }
    }
    const otherChars = await DataManager.getProjectItems(projectId, 'characters');
    const relNames = otherChars
        .filter(c => c.name && c.name !== targetName)
        .slice(0, 15)
        .map(c => c.name);
    const sceneLines = selected.map(x => `- ${x.s.title ? '[' + x.s.title + ']' : ''} ${centerSnippet(x.text)}`);
    const ideaLines = ideaHits.map(h => `- ${h.snippet}`);
    // Plotlines summary (short)
    const plLines = plotlines.slice(0, 6).map(pl => `- ${pl.name}${pl.description ? ': ' + String(pl.description).slice(0, 140) : ''}`);
    const ctx = [
        plLines.length ? `Linee narrative:` : null,
        ...plLines,
        sceneLines.length ? `Scene correlate (${sceneLines.length}):` : null,
        ...sceneLines,
        ideaLines.length ? `\nIdee correlate (${ideaLines.length}):` : null,
        ...ideaLines,
        relNames.length ? `\nPersonaggi citabili: ${relNames.join(', ')}` : null
    ].filter(Boolean).join('\n');
    aiContextStatus && (aiContextStatus.textContent = sceneLines.length ? `Contesto: ${sceneLines.length} scene, ${ideaLines.length} idee` : 'Contesto: nessuna scena trovata');
    return ctx;
}