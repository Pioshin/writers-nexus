import { AIService } from '../../ai/AIService.js';
let DataManager, loadModal, switchView;
let modalEl;
let fetchBtn, closeBtn, tbodyEl, selectAllEl, applyBtn, autoBtn, clearBtn, minConfInput, autoThresholdInput, summaryEl, logEl;
let countBarEl;
let suggestionsState = []; // {id, suggestedStage, confidence, applied:boolean}
let selection = new Set();
let rawSuggestionsCount = 0; // numero totale suggerimenti grezzi (prima della dedup)

const HERO_STAGE_LABEL = {
  ordinary_world: 'Mondo Ordinario',
  call_to_adventure: 'Chiamata',
  refusal_of_call: 'Rifiuto',
  meeting_mentor: 'Mentore',
  crossing_threshold: 'Soglia',
  tests_allies_enemies: 'Prove/All/En',
  inmost_cave: 'Avvicinamento',
  ordeal: 'Prova Centrale',
  reward: 'Ricompensa',
  road_back: 'Ritorno',
  resurrection: 'Resurrezione',
  return_with_elixir: 'Elisir',
  unassigned: '—'
};

function stageBadgeClass(key) {
  if (['ordinary_world','call_to_adventure','refusal_of_call','meeting_mentor'].includes(key)) return 'stage-badge-act1';
  if (['crossing_threshold','tests_allies_enemies','inmost_cave'].includes(key)) return 'stage-badge-act2';
  if (['ordeal','reward','road_back','resurrection','return_with_elixir'].includes(key)) return 'stage-badge-act3';
  return 'stage-badge-unassigned';
}

async function init(dataManager, modalLoader, viewSwitcher) {
  DataManager = dataManager;
  loadModal = modalLoader;
  switchView = viewSwitcher;
  modalEl = document.getElementById('hero-suggestions-modal');
  if (!modalEl) return;
  fetchBtn = document.getElementById('hero-sug-fetch');
  closeBtn = document.getElementById('hero-sug-close');
  tbodyEl = document.getElementById('hero-sug-tbody');
  selectAllEl = document.getElementById('hero-sug-select-all');
  applyBtn = document.getElementById('hero-sug-apply-selected');
  autoBtn = document.getElementById('hero-sug-auto-apply');
  clearBtn = document.getElementById('hero-sug-clear');
  minConfInput = document.getElementById('hero-sug-min-conf');
  autoThresholdInput = document.getElementById('hero-sug-auto-threshold');
  summaryEl = document.getElementById('hero-sug-summary');
  logEl = document.getElementById('hero-sug-log');
  countBarEl = document.getElementById('hero-sug-count');

  fetchBtn?.addEventListener('click', fetchSuggestions);
  closeBtn?.addEventListener('click', hide);
  selectAllEl?.addEventListener('change', () => {
    if (selectAllEl.checked) suggestionsState.forEach(s => selection.add(s.id));
    else selection.clear();
    renderBody();
  });
  applyBtn?.addEventListener('click', applySelected);
  autoBtn?.addEventListener('click', autoApplyThreshold);
  clearBtn?.addEventListener('click', () => { suggestionsState = []; selection.clear(); renderBody(); updateSummary(); });
  minConfInput?.addEventListener('input', renderBody);
  autoThresholdInput?.addEventListener('input', () => updateButtons());
}

function open() { modalEl?.classList.remove('hidden'); }
function hide() { modalEl?.classList.add('hidden'); }

async function fetchSuggestions() {
  const projectId = await DataManager.getCurrentProjectId();
  if (!projectId) { log('[ERRORE] Nessun progetto attivo'); return; }
  fetchBtn.disabled = true; fetchBtn.textContent = 'Richiedo...';
  log('Richiesta suggerimenti in corso...');
  try {
    const scenes = await DataManager.getProjectItems(projectId, 'scenes');
    sceneCache = scenes; // popola cache subito per stage corrente
    if (!scenes.length) { log('Nessuna scena disponibile.'); return; }
    const catalogue = scenes.map(s=>({ id: s.id, title: s.title||'', excerpt: (s.content||'').slice(0,400), stageKey: s.stageKey||'unassigned' })).slice(0,90);
  const heroStages = ['ordinary_world','call_to_adventure','refusal_of_call','meeting_mentor','crossing_threshold','tests_allies_enemies','inmost_cave','ordeal','reward','road_back','resurrection','return_with_elixir'];
  const N = catalogue.length;
  const system = 'Rispondi SOLO con JSON valido. Nessun commento o testo fuori dal JSON.';
  const stageHints = `ALLOWED_STAGES (usa le chiavi esatte):\n- ordinary_world: Mondo Ordinario\n- call_to_adventure: Chiamata\n- refusal_of_call: Rifiuto\n- meeting_mentor: Mentore\n- crossing_threshold: Soglia\n- tests_allies_enemies: Prove/Alleati/Nemici\n- inmost_cave: Avvicinamento\n- ordeal: Prova Centrale\n- reward: Ricompensa\n- road_back: Via del Ritorno\n- resurrection: Resurrezione\n- return_with_elixir: Ritorno con l'Elisir`;
  const constraints = `CONSTRAINTS:\n- Restituisci un ARRAY JSON di LUNGHEZZA ESATTAMENTE ${N}.\n- Ogni elemento deve avere: {"id":"sceneId","idx":number,"suggestedStage":"<allowed>","confidence":0-1}.\n- Copia esattamente l'id fornito per la scena corrispondente e imposta idx con il numero IDX.\n- Usa solo gli stage di ALLOWED_STAGES; se incerto usa "unassigned".\n- Non inventare scene, non duplicare elementi, non saltare scene.`;
  const sceneList = 'SCENES:\n' + catalogue.map((c,i)=>`IDX:${i+1} | ID:${c.id}\nTitolo:${c.title}\nTesto:${c.excerpt.replace(/\n/g,' ')}`).join('\n---\n');
  const outputFormat = 'OUTPUT_FORMAT: [{"id":"...","idx":1,"suggestedStage":"ordinary_world","confidence":0.85}, ...]';
  const prompt = `${stageHints}\n\n${constraints}\n\n${sceneList}\n\n${outputFormat}`;
    if (!AIService || !AIService.complete) { log('[ERRORE] AIService non disponibile (mancato import).'); return; }
    const cfg = AIService.getConfig ? AIService.getConfig() : {};
    if (!cfg.model || (!cfg.baseUrl && cfg.provider !== 'google')) {
      log('[ERRORE] Configurazione AI incompleta: imposta provider, baseUrl (se richiesto) e model nelle impostazioni.');
      return;
    }
    const { text } = await AIService.complete({ prompt, system, temperature: 0.1, maxTokens: 900 });
    let body = text.replace(/^```[a-zA-Z]*\n?|```$/g,'').trim();
    const a = body.indexOf('['); const b = body.lastIndexOf(']'); if (a!==-1 && b!==-1) body = body.slice(a,b+1);
    let arr = [];
    try { arr = JSON.parse(body); } catch { log('[ERRORE] Parsing JSON fallito'); return; }
    if (!Array.isArray(arr)) { log('[ERRORE] Formato risposta non array'); return; }
    rawSuggestionsCount = arr.length;
    const validSet = new Set(heroStages);
    // Normalizza + dedup (tiene confidenza più alta)
    const map = new Map();
    for (const s of arr) {
      if (!s || !s.id) continue;
      // Mappa per idx se id non combacia
      let id = s.id;
      const idx = Number.isInteger(s.idx) ? s.idx : Number.parseInt(s.idx, 10);
      if (!sceneCache.find(c => c.id === id) && idx && idx >= 1 && idx <= catalogue.length) {
        id = catalogue[idx - 1].id;
      }
      const norm = {
        id,
        suggestedStage: validSet.has(s.suggestedStage) ? s.suggestedStage : 'unassigned',
        confidence: typeof s.confidence === 'number' ? Math.max(0, Math.min(1, s.confidence)) : 0,
        applied: false
      };
      const prev = map.get(norm.id);
      if (!prev || norm.confidence > prev.confidence) map.set(norm.id, norm);
    }
    suggestionsState = Array.from(map.values()).filter(s => scenes.find(c => c.id === s.id));
    if (suggestionsState.length < rawSuggestionsCount) {
      log(`Deduplicate: ${rawSuggestionsCount - suggestionsState.length} suggerimenti duplicati scartati.`);
    }
    selection.clear();
    suggestionsState.forEach(s => selection.add(s.id));
    renderBody();
    updateSummary();
    log(`Ricevuti ${rawSuggestionsCount} suggerimenti (unici: ${suggestionsState.length}).`);
  } catch (e) {
    console.error(e); log('[ERRORE] Richiesta fallita');
  } finally {
    fetchBtn.disabled = false; fetchBtn.textContent = 'Richiedi Suggerimenti';
  }
}

function renderBody() {
  if (!tbodyEl) return;
  const minConf = parseFloat(minConfInput?.value||'0') || 0;
  tbodyEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  const filtered = suggestionsState.filter(s => s.confidence >= minConf).sort((a,b)=>b.confidence-a.confidence);
  if (!filtered.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="6" class="text-center p-4 text-secondary">Nessun suggerimento che soddisfa il filtro.</td>`;
    tbodyEl.appendChild(tr);
  }
  filtered.forEach(s => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-secondary/40 transition';
    const currentStage = getCurrentStageOf(s.id) || 'unassigned';
    tr.innerHTML = `
      <td class="p-2 align-top"><input type="checkbox" data-sel data-id="${s.id}" class="accent-accent" ${selection.has(s.id)?'checked':''} ${s.applied?'disabled':''}></td>
      <td class="p-2 align-top w-44">
        <div class="font-semibold truncate" title="${s.id}">${shorten(getSceneTitle(s.id),50)}</div>
        <div class="mt-1 text-[10px] text-secondary">${s.id.slice(0,8)}</div>
      </td>
      <td class="p-2 align-top">
        <span class="stage-badge-mini ${stageBadgeClass(s.suggestedStage)}" title="${HERO_STAGE_LABEL[s.suggestedStage]||s.suggestedStage}">${shorten(HERO_STAGE_LABEL[s.suggestedStage]||s.suggestedStage,16)}</span>
      </td>
      <td class="p-2 align-top ${confidenceClass(s.confidence)}">${s.confidence.toFixed(2)}</td>
      <td class="p-2 align-top">
        <span class="stage-badge-mini ${stageBadgeClass(currentStage)}" title="Stage Corrente">${shorten(HERO_STAGE_LABEL[currentStage]||currentStage,16)}</span>
      </td>
      <td class="p-2 align-top text-[10px] text-secondary max-w-[260px]">${shorten(getSceneExcerpt(s.id),140)}</td>`;
    if (s.applied) tr.classList.add('opacity-60');
    frag.appendChild(tr);
  });
  tbodyEl.appendChild(frag);
  tbodyEl.querySelectorAll('input[data-sel]').forEach(chk => {
    chk.addEventListener('change', () => {
      const id = chk.getAttribute('data-id');
      if (chk.checked) selection.add(id); else selection.delete(id);
      updateButtons();
    });
  });
  updateButtons();
  updateCountBar(filtered.length);
}

function updateButtons() {
  if (applyBtn) applyBtn.disabled = selection.size === 0;
  const thr = parseFloat(autoThresholdInput?.value||'0.75');
  if (autoBtn) autoBtn.disabled = !(suggestionsState.some(s => !s.applied && s.confidence >= thr));
  if (clearBtn) clearBtn.disabled = suggestionsState.length === 0;
  if (selectAllEl) selectAllEl.checked = (selection.size && selection.size === suggestionsState.length);
}

function updateSummary() {
  if (!summaryEl) return;
  const applied = suggestionsState.filter(s=>s.applied).length;
  if (!suggestionsState.length) { summaryEl.textContent = '(nessun suggerimento)'; return; }
  if (rawSuggestionsCount && rawSuggestionsCount !== suggestionsState.length) {
    summaryEl.textContent = `(${applied}/${suggestionsState.length} applicati • raw ${rawSuggestionsCount})`;
  } else {
    summaryEl.textContent = `(${applied}/${suggestionsState.length} applicati)`;
  }
}

function updateCountBar(visible) {
  if (!countBarEl) return;
  const dups = rawSuggestionsCount - suggestionsState.length;
  const parts = [];
  parts.push(`Visibili: ${visible}`);
  parts.push(`Unici: ${suggestionsState.length}`);
  if (rawSuggestionsCount) parts.push(`Raw: ${rawSuggestionsCount}`);
  if (dups > 0) parts.push(`Duplicati scartati: ${dups}`);
  countBarEl.textContent = parts.join(' • ');
}

function shorten(t, n) { if (!t) return ''; return t.length>n ? t.slice(0,n-1)+'…' : t; }
function confidenceClass(c) { return c>=0.75 ? 'text-green-400' : c>=0.5 ? 'text-yellow-400' : 'text-secondary'; }

let sceneCache = null;
async function ensureSceneCache() {
  if (!sceneCache) {
    const projectId = await DataManager.getCurrentProjectId();
    sceneCache = await DataManager.getProjectItems(projectId, 'scenes');
  }
  return sceneCache;
}
function getSceneTitle(id) { return sceneCache?.find(s=>s.id===id)?.title || id; }
function getSceneExcerpt(id) { return (sceneCache?.find(s=>s.id===id)?.content||'').slice(0,160).replace(/\s+/g,' '); }
function getCurrentStageOf(id) { return sceneCache?.find(s=>s.id===id)?.stageKey; }

async function applySelected() {
  await ensureSceneCache();
  applyBtn.disabled = true; applyBtn.textContent = 'Applico...';
  try {
    for (const s of suggestionsState) {
      if (!selection.has(s.id) || s.applied) continue;
      const sc = sceneCache.find(x=>x.id===s.id); if (!sc) continue;
      sc.stageKey = s.suggestedStage;
      await DataManager.saveScene(sc);
      s.applied = true;
    }
  sceneCache = null; await ensureSceneCache();
    renderBody();
    updateSummary();
    log('Applicazione suggerimenti completata.');
    // Evento per aggiornare la struttura
    document.dispatchEvent(new CustomEvent('hero-suggestions-applied'));
  } finally {
    applyBtn.textContent = 'Applica Selezionati';
    applyBtn.disabled = false;
  }
}

async function autoApplyThreshold() {
  await ensureSceneCache();
  const thr = parseFloat(autoThresholdInput?.value||'0.75');
  autoBtn.disabled = true; autoBtn.textContent = 'Auto-applico...';
  try {
    for (const s of suggestionsState) {
      if (s.applied) continue;
      if (s.confidence >= thr) {
        const sc = sceneCache.find(x=>x.id===s.id); if (!sc) continue;
        sc.stageKey = s.suggestedStage;
        await DataManager.saveScene(sc);
        s.applied = true;
      }
    }
  sceneCache = null; await ensureSceneCache();
    renderBody(); updateSummary();
    log(`Auto-assegnazione completata soglia ${thr}.`);
    document.dispatchEvent(new CustomEvent('hero-suggestions-applied'));
  } finally {
    autoBtn.textContent = 'Auto-assegna >= soglia';
    autoBtn.disabled = false;
  }
}

function log(msg) { if (logEl) { logEl.textContent += (logEl.textContent?'\n':'') + msg; } }

export default { init, open, hide };