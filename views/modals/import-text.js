import { AIService } from '../../ai/AIService.js';

let modalEl, fileInput, textArea, runBtn, closeBtn, commitBtn, logEl, statusEl;
let splitScenesEl, extractEntitiesEl, analyzeStyleEl, splitStrategyEl, minSceneLenEl, analysisFocusEl;
// Preview elements
let previewBox, previewScenes, previewIdeas, previewCharacters, previewPlotlines,
  previewScenesCount, previewIdeasCount, previewCharactersCount, previewPlotlinesCount,
  selectAllScenesEl, selectAllIdeasEl, selectAllCharactersEl, selectAllPlotlinesEl,
  previewLocations, previewObjects, previewGeography, previewHistory, previewCulture,
  previewLocationsCount, previewObjectsCount, previewGeographyCount, previewHistoryCount, previewCultureCount,
  selectAllLocationsEl, selectAllObjectsEl, selectAllGeographyEl, selectAllHistoryEl, selectAllCultureEl;
let selectionState = { scenes: new Set(), ideas: new Set(), characters: new Set(), plotlines: new Set(), locations: new Set(), objects: new Set(), geography: new Set(), history: new Set(), culture: new Set() };

function show() {
  modalEl.classList.remove('hidden');
  try { window.lucide?.createIcons?.(); } catch {}
  setTimeout(() => textArea?.focus(), 0);
}
function hide() { modalEl.classList.add('hidden'); }
function open() { show(); }

function log(msg) {
  const time = new Date().toLocaleTimeString();
  logEl.textContent += `[${time}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

async function readFileAsText(file) {
  if (!file) return '';
  if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
    return await file.text();
  }
  // Docx/rtf basic fallback: attempt as text
  try { return await file.text(); } catch { return ''; }
}

function naiveSplitIntoScenes(raw, strategy, minLen) {
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  if (strategy === 'chapters') {
    return text.split(/\n\s*(Capitolo\s+\d+|Chapter\s+\d+|# .+)\s*\n/i).filter(Boolean);
  }
  if (strategy === 'paragraphs') {
    const paras = text.split(/\n{2,}/);
    const scenes = [];
    let buf = '';
    for (const p of paras) {
      if ((buf + '\n\n' + p).length < minLen) { buf += (buf ? '\n\n' : '') + p; }
      else { if (buf) scenes.push(buf); buf = p; }
    }
    if (buf) scenes.push(buf);
    return scenes;
  }
  // auto: headings / scene cues (***, ###) / long gaps
  const parts = text.split(/\n\s*(\*\*\*|###|\*\s\*\s\*|\-\-\-|\=\=\=)\s*\n|\n{3,}/);
  const scenes = [];
  let buf = '';
  for (const part of parts) {
    if (!part || /^[*#=\-]{3,}$/.test(part.trim())) continue;
    if ((buf + '\n\n' + part).length < minLen) { buf += (buf ? '\n\n' : '') + part; }
    else { if (buf) scenes.push(buf); buf = part; }
  }
  if (buf) scenes.push(buf);
  return scenes;
}

// --- Parser per romanzo_strutturato.md (top-level, usato da runAnalysis) ---
function normalize(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

function mapStageTitleToKey(title) {
  const t = normalize(title);
  // Atto I / Setup (mappa su chiavi esistenti)
  if (/mondo\s+ordinario|ordinary\s+world|setup|impostazione/.test(t)) return 'ordinary_world';
  if (/evento\s+scatenante|inciting\s+incident/.test(t)) return 'call_to_adventure';
  if (/(richiamo|chiamata).*(avventura)|call\s+to\s+adventure/.test(t)) return 'call_to_adventure';
  if (/rifiuto.*(richiamo|chiamata)|refusal\s+of\s+the?\s*call/.test(t)) return 'refusal_of_call';
  if (/(incontro).*mentore|meeting\s+the?\s*mentor/.test(t)) return 'meeting_mentor';
  if (/(varco|superamento|attraversamento).*soglia|cross(ing)?\s+the?\s*threshold/.test(t)) return 'crossing_threshold';

  // Atto II / Confronto (sinonimi -> chiavi esistenti)
  if (/prove.*alleati.*nemici|tests.*allies.*enemies/.test(t)) return 'tests_allies_enemies';
  if (/primo\s+punto\s+di\s+attacco|first\s+pinch\s+point/.test(t)) return 'tests_allies_enemies';
  if (/punto\s+di\s+mezzo|mid\s*point|midpoint/.test(t)) return 'inmost_cave';
  if (/secondo\s+punto\s+di\s+attacco|second\s+pinch\s+point/.test(t)) return 'inmost_cave';
  if (/avvicinamento.*(caverna|nucleo|piu.*profonda)|approach.*inmost.*cave/.test(t)) return 'inmost_cave';
  if (/prova\s+centrale|ordeal|calvario|prova\s+suprema/.test(t)) return 'ordeal';
  if (/ricompensa|reward|presa\s+del\s+premio/.test(t)) return 'reward';
  if (/tutto\s+e'?\s+perduto|all\s+is\s+lost/.test(t)) return 'ordeal';
  if (/notte\s+oscura|dark\s+night\s+of\s+the?\s*soul/.test(t)) return 'ordeal';

  // Atto III / Ritorno e Risoluzione (mantieni via del ritorno nel terzo atto)
  if (/via\s+del\s+ritorno|road\s+back/.test(t)) return 'road_back';
  if (/climax|finale\s+epico|confronto\s+finale/.test(t)) return 'resurrection';
  if (/resurrezione|ressurrezione|resurrection/.test(t)) return 'resurrection';
  if (/ritorno.*elisir|return.*elixir|ritorno\s+con\s+l.?elisir/.test(t)) return 'return_with_elixir';
  if (/epilogo|denouement|scioglimento/.test(t)) return 'return_with_elixir';

  return 'imported';
}

function parseRomanzoStructuredMD(raw) {
  if (!raw) return null;
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  let inIdeas = false;
  let currentStageKey = 'imported';
  let currentScene = null;
  const scenes = [];
  const ideas = [];
  const stageOrderCounters = {};

  const flushScene = () => {
    if (!currentScene) return;
    currentScene.content = currentScene.buffer.join('\n').trim();
    currentScene.synopsis = currentScene.synopsis || currentScene.content.slice(0, 240);
    const k = currentScene.stageKey || 'imported';
    stageOrderCounters[k] = (stageOrderCounters[k] || 0) + 1;
    currentScene.order = stageOrderCounters[k];
    scenes.push({ title: currentScene.title, synopsis: currentScene.synopsis, content: currentScene.content, stageKey: currentScene.stageKey, order: currentScene.order });
    currentScene = null;
  };

  let currentIdea = null;
  const flushIdea = () => {
    if (!currentIdea) return;
    currentIdea.content = currentIdea.buffer.join('\n').trim();
    ideas.push({ title: currentIdea.title, content: currentIdea.content });
    currentIdea = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h2Match = line.match(/^##\s+(.+)$/);
    const h3Scene = line.match(/^###\s*SCENA\s+(\d+)(?:\s*[–-]\s*(.+))?/i) || line.match(/^###\s*SCENA\s+(\d+)\s*(\(.+\))?/i);

    if (/^---+$/.test(line.trim())) continue;

    // Plain 'IDEE' line (no markdown heading)
    if (/^IDEE(\s+E\s+NOTE)?\s*:?\s*$/i.test(line.trim())) {
      flushScene();
      inIdeas = true;
      continue;
    }

    if (h2Match) {
      const title = h2Match[1].trim();
      if (/^(IDEE(\s+E\s+NOTE)?|NOTE|IDEAS?)$/i.test(title)) {
        flushScene();
        inIdeas = true;
        continue;
      }
      const stageKey = mapStageTitleToKey(title);
      if (stageKey !== 'imported') {
        flushScene();
        inIdeas = false;
        currentStageKey = stageKey;
        continue;
      }
    }

    // IDEA header che apre direttamente la sezione idee anche senza titolo "IDEE"
    if (!inIdeas) {
      const ideaOpener = line.match(/^(?:##|###)\s*IDEA[\.:\s]*(\d+)?\s*[–\-\.:]?\s*(.+)?$/i);
      if (ideaOpener) {
        flushScene();
        inIdeas = true;
        flushIdea();
        const num = ideaOpener[1];
        const ttl = ideaOpener[2] || (num ? `#${num}` : '');
        currentIdea = { title: `IDEA - ${ttl.toString().trim()}`, buffer: [] };
        continue;
      }
    }

    if (inIdeas) {
      const ideaHeader = line.match(/^(?:##|###)\s*IDEA[\.:\s]*(\d+)?\s*[–\-\.:]?\s*(.+)?$/i) || line.match(/^[-*]\s+\[(?:x| )\]\s+(.+)$/i) || line.match(/^[-*]\s+(.+)$/);
      if (ideaHeader) {
        flushIdea();
        const titleTxt = ideaHeader[2] || ideaHeader[1];
        currentIdea = { title: `IDEA - ${(titleTxt||'').toString().trim()}`, buffer: [] };
        continue;
      }
      if (line.trim().length && !currentIdea) {
        // Start a new idea from the first non-empty line
        const titleSeed = line.trim().slice(0, 80);
        currentIdea = { title: `IDEA - ${titleSeed}`, buffer: [] };
      }
      if (currentIdea) { currentIdea.buffer.push(line); }
      continue;
    }

    if (h3Scene) {
      flushScene();
      const num = h3Scene[1];
      const rest = (h3Scene[2] || '').trim();
      const title = rest ? `SCENA ${num} - ${rest.replace(/^\(|\)$/g,'')}` : `SCENA ${num}`;
      currentScene = { title, buffer: [], stageKey: currentStageKey };
      continue;
    }

    if (currentScene) {
      currentScene.buffer.push(line);
    }
  }
  flushScene();
  flushIdea();

  if (!scenes.length && !ideas.length) return null;
  return { scenes, ideas };
}

async function runAnalysis(projectId, rawText) {
  log('Avvio analisi...');
  const doSplit = splitScenesEl.checked;
  const doExtract = extractEntitiesEl.checked;
  const doStyle = analyzeStyleEl.checked;
  const strategy = splitStrategyEl.value;
  const minLen = parseInt(minSceneLenEl.value || '300', 10);
  const focus = (analysisFocusEl?.value || '').trim();

  // 1) Prova parsing formato romanzo_strutturato.md
  const structured = parseRomanzoStructuredMD(rawText);
  let scenes = structured?.scenes?.length ? structured.scenes : [{ title: 'Manoscritto', synopsis: '', content: rawText }];
  let ideasFromDoc = structured?.ideas || [];
  if (!structured?.scenes?.length && doSplit) {
    const chunks = naiveSplitIntoScenes(rawText, strategy, minLen);
    scenes = chunks.map((c, i) => ({ title: `Scena ${i+1}`, synopsis: '', content: c }));
    log(`Segmentazione: trovate ${scenes.length} scene (naive).`);
  } else if (structured?.scenes?.length) {
    log(`Rilevato formato strutturato: importo ${scenes.length} scene e ${ideasFromDoc.length} idee.`);
  }

  let entities = { characters: [], locations: [], objects: [], geography: [], history: [], culture: [] };
  let relations = [];
  let plotlines = [];
  let style = null;

  const ctxHeader = `Analizza il seguente testo e restituisci JSON con campi: characters(name, role, archetype?), locations(name, description?), objects(name, description?), geography(name, description?), history(name, description?), culture(name, description?), relations(source, target, type), plotlines(list of names with brief description), style(voice, pacing, lexical richness, tone), ideas(optional list: title, content) se nel testo esiste una sezione idee/note.`;

  if (doExtract || doStyle) {
    // Analisi più accurata: chunking su tutto il manoscritto (finestre ~5000-6000 char)
    const chunks = [];
    const max = 5500;
    for (let i = 0; i < rawText.length; i += max) {
      chunks.push(rawText.slice(i, i + max));
    }
  const collation = { characters: new Map(), locations: new Map(), objects: new Map(), geography: new Map(), history: new Map(), culture: new Map(), relations: [], plotlines: [], styleSamples: [], ideas: [] };
    const systemMsg = 'Rispondi esclusivamente con JSON valido.';
    const focusHint = focus ? `\nFOCUS: ${focus}` : '';
    log(`IA: analisi in ${chunks.length} parti per copertura completa...`);
    for (let ci = 0; ci < chunks.length; ci++) {
      const sample = chunks[ci];
      const prompt = `${ctxHeader}${focusHint}\n\nESTRATTO ${ci+1}/${chunks.length}:\n${sample}`;
      try {
        const { text } = await AIService.complete({ prompt, system: systemMsg, temperature: 0.2, maxTokens: 900 });
        // remove fences and extract JSON-ish
        const stripped = text.replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
        const jsonStart = stripped.indexOf('{');
        const jsonEnd = stripped.lastIndexOf('}');
        let body = jsonStart >= 0 ? stripped.slice(jsonStart, jsonEnd + 1) : '{}';
        // tiny repair: remove trailing commas and quote simple keys
        body = body.replace(/,\s*([}\]])/g, '$1').replace(/([,{]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
        const parsed = JSON.parse(body);
        const addList = (lst, map, key='name') => {
          (lst||[]).forEach(it => { const k = (it?.[key]||'').toLowerCase(); if (!k) return; const prev = map.get(k)||it; map.set(k, { ...prev, ...it }); });
        };
        addList(parsed.characters, collation.characters);
        addList(parsed.locations, collation.locations);
        addList(parsed.objects, collation.objects);
        addList(parsed.geography, collation.geography);
        addList(parsed.history, collation.history);
        addList(parsed.culture, collation.culture);
        collation.relations.push(...(parsed.relations||[]));
        collation.plotlines.push(...(parsed.plotlines||[]));
  if (parsed.style) collation.styleSamples.push(parsed.style);
  if (Array.isArray(parsed.ideas)) collation.ideas.push(...parsed.ideas.filter(it => (it?.title || it?.content)));
      } catch (e) {
        const preview = (e?.message || '').slice(0,80);
        log(`Parte ${ci+1}: parsing IA fallito (${preview}), continuo...`);
      }
    }
    entities.characters = Array.from(collation.characters.values());
    entities.locations = Array.from(collation.locations.values());
    entities.objects = Array.from(collation.objects.values());
    entities.geography = Array.from(collation.geography.values());
    entities.history = Array.from(collation.history.values());
    entities.culture = Array.from(collation.culture.values());
    relations = collation.relations;
    plotlines = collation.plotlines;
    // Idee: usa IA come fallback o merged
    if ((!ideasFromDoc || ideasFromDoc.length === 0) && collation.ideas.length) {
      // Deduplica semplice per titolo+contenuto
      const seen = new Set();
      ideasFromDoc = collation.ideas.filter(it => {
        const key = `${(it.title||'').toLowerCase()}::${(it.content||'').toLowerCase()}`;
        if (seen.has(key)) return false; seen.add(key); return true;
      });
    }
    // Fusiona profili di stile basilare (placeholder): prende il più frequente tono
    if (collation.styleSamples.length) {
      const tones = {};
      for (const s of collation.styleSamples) { if (s?.tone) tones[s.tone] = (tones[s.tone]||0)+1; }
      const topTone = Object.entries(tones).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;
      style = { ...(collation.styleSamples[0]||{}), tone: topTone };
    }
  }

  return { scenes, entities, relations, plotlines, style, ideas: ideasFromDoc };
}

async function commitToProject(dataManager, projectId, result, options = { mode: 'merge' }) {
  log('Scrittura nel progetto...');
  const mode = options.mode || 'merge';
  // In modalità merge, carica esistenti per dedup
  const existing = { characters: [], locations: [], objects: [], geography: [], history: [], culture: [], plotlines: [], ideas: [], scenes: [] };
  if (mode === 'merge') {
    existing.characters = await dataManager.getProjectItems(projectId, 'characters');
    existing.locations = await dataManager.getProjectItems(projectId, 'locations');
    existing.objects = await dataManager.getProjectItems(projectId, 'objects');
    existing.geography = await dataManager.getProjectItems(projectId, 'geography');
    existing.history = await dataManager.getProjectItems(projectId, 'history');
    existing.culture = await dataManager.getProjectItems(projectId, 'culture');
    existing.plotlines = await dataManager.getProjectItems(projectId, 'plotlines');
    existing.ideas = await dataManager.getProjectItems(projectId, 'ideas');
    existing.scenes = await dataManager.getProjectItems(projectId, 'scenes');
  }
  // Scene
  for (let i = 0; i < result.scenes.length; i++) {
    const s = result.scenes[i];
    if (mode === 'merge') {
      const dup = existing.scenes.find(x => (x.title||'').toLowerCase() === (s.title||'').toLowerCase() && (x.stageKey||'') === (s.stageKey||'') && (x.order||'') === (s.order||''));
      if (dup) continue;
    }
    await dataManager.saveScene({
      projectId,
      title: s.title,
      synopsis: s.synopsis || '',
      content: s.content,
      stageKey: s.stageKey || 'imported',
      order: s.order || (i + 1)
    });
  }
  // Idee dal documento
  if (result.ideas?.length) {
    for (const idea of result.ideas) {
      const content = idea.title ? `${idea.title}\n\n${idea.content || ''}` : (idea.content || '');
      if (mode === 'merge') {
        const dup = existing.ideas.find(x => (x.content||'').trim() === content.trim());
        if (dup) continue;
      }
      const saved = await dataManager.saveProjectItem(projectId, 'ideas', { content });
  try { document.dispatchEvent(new CustomEvent('idea-saved', { detail: { idea: saved } })); } catch {}
    }
  }
  // Items generici helper
  const saveItems = async (type, items, fieldsMapper, nameKey = 'name') => {
    for (const it of items) {
      const data = fieldsMapper(it);
      if (mode === 'merge') {
        const list = existing[type] || [];
        const nm = (data[nameKey] || '').toLowerCase();
        if (nm && list.find(x => (x[nameKey]||'').toLowerCase() === nm)) continue;
      }
      await dataManager.saveProjectItem(projectId, type, data);
    }
  };
  await saveItems('characters', result.entities.characters, it => ({ name: it.name, role: it.role || '', archetype: it.archetype || '', narrativeRole: it.role || '' }));
  await saveItems('locations', result.entities.locations, it => ({ name: it.name, description: it.description || '' }));
  await saveItems('objects', result.entities.objects, it => ({ name: it.name, description: it.description || '' }));
  await saveItems('geography', result.entities.geography, it => ({ name: it.name, description: it.description || '' }));
  await saveItems('history', result.entities.history, it => ({ name: it.name, description: it.description || '' }));
  await saveItems('culture', result.entities.culture, it => ({ name: it.name, description: it.description || '' }));
  await saveItems('plotlines', result.plotlines || [], it => ({ name: it.name || it.title || 'Linea narrativa', description: it.description || '' }));

  // Relazioni personaggi
  if (result.entities.characters?.length && result.relations?.length) {
    const chars = await dataManager.getProjectItems(projectId, 'characters');
    const byName = Object.fromEntries(chars.map(c => [c.name.toLowerCase(), c]));
    // Aggiorna relazioni
    for (const rel of result.relations) {
      const source = byName[rel.source?.toLowerCase?.()];
      const target = byName[rel.target?.toLowerCase?.()];
      if (!source || !target) continue;
      const updated = { ...source };
      updated.relationships = updated.relationships || [];
      if (!updated.relationships.find(r => r.targetCharacterId === target.id && r.type === rel.type)) {
        updated.relationships.push({ targetCharacterId: target.id, type: rel.type || 'Relazione' });
        await dataManager.saveProjectItem(projectId, 'characters', updated);
      }
    }
  }
}

function init(dataManager) {
  modalEl = document.getElementById('import-text-modal');
  fileInput = document.getElementById('import-file');
  textArea = document.getElementById('import-text');
  runBtn = document.getElementById('import-run-btn');
  closeBtn = document.getElementById('import-close-btn');
  commitBtn = document.getElementById('import-commit-btn');
  logEl = document.getElementById('import-log');
  statusEl = document.getElementById('import-status');
  splitScenesEl = document.getElementById('import-split-scenes');
  extractEntitiesEl = document.getElementById('import-extract-entities');
  analyzeStyleEl = document.getElementById('import-analyze-style');
  splitStrategyEl = document.getElementById('import-split-strategy');
  minSceneLenEl = document.getElementById('import-min-scene-length');
  analysisFocusEl = document.getElementById('import-analysis-focus');
  // Import mode
  const importModeMergeEl = document.getElementById('import-mode-merge');
  const importModeReplaceEl = document.getElementById('import-mode-replace');
  // Preview refs
  previewBox = document.getElementById('import-preview');
  previewScenes = document.getElementById('preview-scenes');
  previewIdeas = document.getElementById('preview-ideas');
  previewCharacters = document.getElementById('preview-characters');
  previewPlotlines = document.getElementById('preview-plotlines');
  previewScenesCount = document.getElementById('preview-scenes-count');
  previewIdeasCount = document.getElementById('preview-ideas-count');
  previewCharactersCount = document.getElementById('preview-characters-count');
  previewPlotlinesCount = document.getElementById('preview-plotlines-count');
  previewLocations = document.getElementById('preview-locations');
  previewObjects = document.getElementById('preview-objects');
  previewGeography = document.getElementById('preview-geography');
  previewHistory = document.getElementById('preview-history');
  previewCulture = document.getElementById('preview-culture');
  previewLocationsCount = document.getElementById('preview-locations-count');
  previewObjectsCount = document.getElementById('preview-objects-count');
  previewGeographyCount = document.getElementById('preview-geography-count');
  previewHistoryCount = document.getElementById('preview-history-count');
  previewCultureCount = document.getElementById('preview-culture-count');
  selectAllScenesEl = document.getElementById('select-all-scenes');
  selectAllIdeasEl = document.getElementById('select-all-ideas');
  selectAllCharactersEl = document.getElementById('select-all-characters');
  selectAllPlotlinesEl = document.getElementById('select-all-plotlines');
  selectAllLocationsEl = document.getElementById('select-all-locations');
  selectAllObjectsEl = document.getElementById('select-all-objects');
  selectAllGeographyEl = document.getElementById('select-all-geography');
  selectAllHistoryEl = document.getElementById('select-all-history');
  selectAllCultureEl = document.getElementById('select-all-culture');

  let lastResult = null;

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    const txt = await readFileAsText(file);
    textArea.value = txt;
    log(`Caricato file: ${file?.name || 'n/d'} (${txt.length} caratteri)`);
  });

  runBtn.addEventListener('click', async () => {
    const projectId = await dataManager.getCurrentProjectId();
    if (!projectId) { statusEl.textContent = 'Seleziona un progetto prima.'; return; }
    const raw = textArea.value.trim();
    if (!raw) { statusEl.textContent = 'Inserisci o carica un testo.'; return; }
    statusEl.textContent = 'Analisi in corso...';
    commitBtn.disabled = true;
    lastResult = await runAnalysis(projectId, raw);
    statusEl.textContent = 'Analisi completata. Puoi importare i risultati.';
    commitBtn.disabled = false;
    // Render preview
    try {
      selectionState = { scenes: new Set(), ideas: new Set(), characters: new Set(), plotlines: new Set(), locations: new Set(), objects: new Set(), geography: new Set(), history: new Set(), culture: new Set() };
      const renderList = (container, items, type) => {
        container.innerHTML = items.map((item, idx) => {
          const id = `${type}-${idx}`;
          selectionState[type].add(idx);
          if (type === 'scenes') {
            return `<li class="text-xs flex items-start gap-2"><input type="checkbox" class="mt-0.5 item-check" data-type="${type}" data-idx="${idx}" checked><span class="text-secondary">${item.stageKey?`[${item.stageKey}] `:''}</span><span class="truncate">${item.title}</span></li>`;
          }
          if (type === 'ideas') {
            return `<li class="text-xs flex items-start gap-2"><input type="checkbox" class="mt-0.5 item-check" data-type="${type}" data-idx="${idx}" checked><span class="bg-accent text-primary text-[10px] px-1 py-0.5 rounded">${idx+1}</span><span class="truncate">${(item.title? `${item.title} — `:'')}${(item.content||'').slice(0,120)}</span></li>`;
          }
          if (type === 'characters') {
            return `<li class="text-xs flex items-start gap-2"><input type="checkbox" class="mt-0.5 item-check" data-type="${type}" data-idx="${idx}" checked><span>${item.name}${item.role?` — ${item.role}`:''}</span></li>`;
          }
          if (type === 'plotlines') {
            return `<li class="text-xs flex items-start gap-2"><input type="checkbox" class="mt-0.5 item-check" data-type="${type}" data-idx="${idx}" checked><span>${item.name||item.title||'Linea'}</span></li>`;
          }
          if (type === 'locations' || type === 'objects' || type === 'geography' || type === 'history' || type === 'culture') {
            const label = item.name || (item.title||'').slice(0,60) || 'Elemento';
            const desc = item.description ? ` — ${item.description.slice(0,80)}` : '';
            return `<li class="text-xs flex items-start gap-2"><input type="checkbox" class="mt-0.5 item-check" data-type="${type}" data-idx="${idx}" checked><span>${label}${desc}</span></li>`;
          }
        }).join('');
      };
  renderList(previewScenes, (lastResult.scenes||[]), 'scenes');
  renderList(previewIdeas, (lastResult.ideas||[]), 'ideas');
  renderList(previewCharacters, (lastResult.entities?.characters||[]), 'characters');
  renderList(previewPlotlines, (lastResult.plotlines||[]), 'plotlines');
      renderList(previewLocations, (lastResult.entities?.locations||[]), 'locations');
      renderList(previewObjects, (lastResult.entities?.objects||[]), 'objects');
      renderList(previewGeography, (lastResult.entities?.geography||[]), 'geography');
      renderList(previewHistory, (lastResult.entities?.history||[]), 'history');
      renderList(previewCulture, (lastResult.entities?.culture||[]), 'culture');
      previewScenesCount.textContent = lastResult.scenes?.length||0;
      previewIdeasCount.textContent = lastResult.ideas?.length||0;
      previewCharactersCount.textContent = lastResult.entities?.characters?.length||0;
      previewPlotlinesCount.textContent = lastResult.plotlines?.length||0;
      previewLocationsCount.textContent = lastResult.entities?.locations?.length||0;
      previewObjectsCount.textContent = lastResult.entities?.objects?.length||0;
      previewGeographyCount.textContent = lastResult.entities?.geography?.length||0;
      previewHistoryCount.textContent = lastResult.entities?.history?.length||0;
      previewCultureCount.textContent = lastResult.entities?.culture?.length||0;
      previewBox.classList.remove('hidden');

      // Hook per-item selection
      previewBox.querySelectorAll('.item-check').forEach(chk => {
        chk.addEventListener('change', (e) => {
          const type = e.target.getAttribute('data-type');
          const idx = parseInt(e.target.getAttribute('data-idx'), 10);
          if (e.target.checked) selectionState[type].add(idx); else selectionState[type].delete(idx);
        });
      });

      // Hook select-all toggles
      const bindSelectAll = (el, type, itemsLen) => {
        if (!el) return;
        el.checked = true;
        el.onchange = () => {
          selectionState[type] = new Set();
          previewBox.querySelectorAll(`.item-check[data-type="${type}"]`).forEach((c,i) => { c.checked = el.checked; if (el.checked) selectionState[type].add(parseInt(c.getAttribute('data-idx'),10)); });
        };
      };
  bindSelectAll(selectAllScenesEl, 'scenes');
  bindSelectAll(selectAllIdeasEl, 'ideas');
  bindSelectAll(selectAllCharactersEl, 'characters');
  bindSelectAll(selectAllPlotlinesEl, 'plotlines');
  bindSelectAll(selectAllLocationsEl, 'locations');
  bindSelectAll(selectAllObjectsEl, 'objects');
  bindSelectAll(selectAllGeographyEl, 'geography');
  bindSelectAll(selectAllHistoryEl, 'history');
  bindSelectAll(selectAllCultureEl, 'culture');
    } catch {}
  });

  commitBtn.addEventListener('click', async () => {
    const projectId = await dataManager.getCurrentProjectId();
    if (!projectId || !lastResult) return;
    statusEl.textContent = 'Import in corso...';
    commitBtn.disabled = true;
    // Filtra in base alla selezione
    const pick = (arr, type) => arr.filter((_, idx) => selectionState[type]?.has(idx));
  const filtered = {
      scenes: pick(lastResult.scenes||[], 'scenes'),
      ideas: pick(lastResult.ideas||[], 'ideas'),
      entities: {
        ...lastResult.entities,
    characters: pick(lastResult.entities?.characters||[], 'characters'),
    locations: pick(lastResult.entities?.locations||[], 'locations'),
    objects: pick(lastResult.entities?.objects||[], 'objects'),
    geography: pick(lastResult.entities?.geography||[], 'geography'),
    history: pick(lastResult.entities?.history||[], 'history'),
    culture: pick(lastResult.entities?.culture||[], 'culture'),
      },
      relations: lastResult.relations||[],
      plotlines: pick(lastResult.plotlines||[], 'plotlines'),
      style: lastResult.style || null
    };
    // Modalità import
    const mode = importModeReplaceEl?.checked ? 'replace' : 'merge';
    if (mode === 'replace') {
      log('Modalità: Sostituisci. Pulizia dati esistenti...');
      await dataManager.clearProjectStores(projectId, ['scenes','ideas','characters','locations','objects','geography','history','culture','plotlines']);
    } else {
      log('Modalità: Unisci (con deduplica).');
    }
    // Deduplica preventiva nelle liste selezionate
    const dedupByKey = (arr, keyFn) => {
      const seen = new Set();
      return (arr||[]).filter(it => { const k = keyFn(it); if (!k || seen.has(k)) return false; seen.add(k); return true; });
    };
    const norm = s => (s||'').toLowerCase().trim();
    filtered.scenes = dedupByKey(filtered.scenes, s => `${norm(s.title)}|${norm(s.stageKey)}|${s.order||''}|${norm((s.content||'').slice(0,80))}`);
    filtered.ideas = dedupByKey(filtered.ideas, i => `${norm(i.title)}|${norm((i.content||'').slice(0,120))}`);
    filtered.entities.characters = dedupByKey(filtered.entities.characters, c => norm(c.name));
    filtered.entities.locations = dedupByKey(filtered.entities.locations, l => norm(l.name));
    filtered.entities.objects = dedupByKey(filtered.entities.objects, o => norm(o.name));
    filtered.entities.geography = dedupByKey(filtered.entities.geography, g => norm(g.name));
    filtered.entities.history = dedupByKey(filtered.entities.history, h => norm(h.name));
    filtered.entities.culture = dedupByKey(filtered.entities.culture, c => norm(c.name));
    filtered.plotlines = dedupByKey(filtered.plotlines, p => norm(p.name||p.title));

    await commitToProject(dataManager, projectId, filtered, { mode });
    statusEl.textContent = 'Import completato.';
  });

  closeBtn.addEventListener('click', hide);

  return { open: show, hide };
}

export default { init, show, hide, open };
