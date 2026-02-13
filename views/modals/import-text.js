import { AIService } from '../../ai/AIService.js';
import { toast } from '../shared/toast.js';

let modalEl,
  fileInput,
  textArea,
  runBtn,
  aiRunBtn,
  heroSuggestBtn,
  closeBtn,
  commitBtn,
  logEl,
  statusEl;
let splitScenesEl,
  extractEntitiesEl,
  analyzeStyleEl,
  splitStrategyEl,
  minSceneLenEl,
  analysisFocusEl;
// Preview elements
let previewBox,
  previewScenes,
  previewIdeas,
  previewCharacters,
  previewPlotlines,
  previewScenesCount,
  previewIdeasCount,
  previewCharactersCount,
  previewPlotlinesCount,
  selectAllScenesEl,
  selectAllIdeasEl,
  selectAllCharactersEl,
  selectAllPlotlinesEl,
  previewLocations,
  previewObjects,
  previewGeography,
  previewHistory,
  previewCulture,
  previewLocationsCount,
  previewObjectsCount,
  previewGeographyCount,
  previewHistoryCount,
  previewCultureCount,
  selectAllLocationsEl,
  selectAllObjectsEl,
  selectAllGeographyEl,
  selectAllHistoryEl,
  selectAllCultureEl;
let selectionState = {
  scenes: new Set(),
  ideas: new Set(),
  characters: new Set(),
  plotlines: new Set(),
  locations: new Set(),
  objects: new Set(),
  geography: new Set(),
  history: new Set(),
  culture: new Set(),
};

// Stato ultimo parsing (senza AI) e ultima analisi AI
let lastParsed = null; // { scenes, ideas }
let lastAIEnrichment = null; // { entities, relations, plotlines, style }

const DEBUG_IMPORT = false; // attiva log lunghezze scene
const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMPORT_EXTENSIONS = new Set(['txt', 'md', 'markdown']);
let isInitialized = false;

function show() {
  modalEl.classList.remove('hidden');
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.classList.remove('text-red-400', 'text-green-400', 'text-yellow-300');
    statusEl.classList.add('text-secondary');
  }
  try {
    window.lucide?.createIcons?.();
  } catch { }
  setTimeout(() => textArea?.focus(), 0);
}
function hide() {
  modalEl.classList.add('hidden');
}
function open() {
  show();
}

function log(msg) {
  const time = new Date().toLocaleTimeString();
  logEl.textContent += `[${time}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

async function readFileAsText(file) {
  if (!file) return '';
  const fileName = file.name || '';
  const extension = fileName.includes('.')
    ? fileName.split('.').pop().toLowerCase()
    : '';

  if (!ALLOWED_IMPORT_EXTENSIONS.has(extension)) {
    throw new Error(
      `Formato non supportato. Usa solo: ${Array.from(ALLOWED_IMPORT_EXTENSIONS)
        .map(ext => `.${ext}`)
        .join(', ')}`
    );
  }

  if (file.size > MAX_IMPORT_FILE_SIZE) {
    throw new Error(
      `File troppo grande. Dimensione massima: ${Math.round(MAX_IMPORT_FILE_SIZE / (1024 * 1024))}MB.`
    );
  }

  return await file.text();
}

function naiveSplitIntoScenes(raw, strategy, minLen) {
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  if (strategy === 'chapters') {
    return text
      .split(/\n\s*(Capitolo\s+\d+|Chapter\s+\d+|# .+)\s*\n/i)
      .filter(Boolean);
  }
  if (strategy === 'paragraphs') {
    const paras = text.split(/\n{2,}/);
    const scenes = [];
    let buf = '';
    for (const p of paras) {
      if ((buf + '\n\n' + p).length < minLen) {
        buf += (buf ? '\n\n' : '') + p;
      } else {
        if (buf) scenes.push(buf);
        buf = p;
      }
    }
    if (buf) scenes.push(buf);
    return scenes;
  }
  // auto: headings / scene cues (***, ###) / long gaps
  const parts = text.split(
    /\n\s*(\*\*\*|###|\*\s\*\s\*|\-\-\-|\=\=\=)\s*\n|\n{3,}/
  );
  const scenes = [];
  let buf = '';
  for (const part of parts) {
    if (!part || /^[*#=\-]{3,}$/.test(part.trim())) continue;
    if ((buf + '\n\n' + part).length < minLen) {
      buf += (buf ? '\n\n' : '') + part;
    } else {
      if (buf) scenes.push(buf);
      buf = part;
    }
  }
  if (buf) scenes.push(buf);
  return scenes;
}

// --- Parser per romanzo_strutturato.md (top-level, usato da runAnalysis) ---
function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function mapStageTitleToKey(title) {
  const t = normalize(title);
  // Atto I / Setup (mappa su chiavi esistenti)
  if (/mondo\s+ordinario|ordinary\s+world|setup|impostazione/.test(t))
    return 'ordinary_world';
  if (/evento\s+scatenante|inciting\s+incident/.test(t))
    return 'call_to_adventure';
  if (/(richiamo|chiamata).*(avventura)|call\s+to\s+adventure/.test(t))
    return 'call_to_adventure';
  if (/rifiuto.*(richiamo|chiamata)|refusal\s+of\s+the?\s*call/.test(t))
    return 'refusal_of_call';
  if (/(incontro).*mentore|meeting\s+the?\s*mentor/.test(t))
    return 'meeting_mentor';
  if (
    /(varco|superamento|attraversamento).*soglia|cross(ing)?\s+the?\s*threshold/.test(
      t
    )
  )
    return 'crossing_threshold';

  // Atto II / Confronto (sinonimi -> chiavi esistenti)
  if (/prove.*alleati.*nemici|tests.*allies.*enemies/.test(t))
    return 'tests_allies_enemies';
  if (/primo\s+punto\s+di\s+attacco|first\s+pinch\s+point/.test(t))
    return 'tests_allies_enemies';
  if (/punto\s+di\s+mezzo|mid\s*point|midpoint/.test(t)) return 'inmost_cave';
  if (/secondo\s+punto\s+di\s+attacco|second\s+pinch\s+point/.test(t))
    return 'inmost_cave';
  if (
    /avvicinamento.*(caverna|nucleo|piu.*profonda)|approach.*inmost.*cave/.test(
      t
    )
  )
    return 'inmost_cave';
  if (/prova\s+centrale|ordeal|calvario|prova\s+suprema/.test(t))
    return 'ordeal';
  if (/ricompensa|reward|presa\s+del\s+premio/.test(t)) return 'reward';
  if (/tutto\s+e'?\s+perduto|all\s+is\s+lost/.test(t)) return 'ordeal';
  if (/notte\s+oscura|dark\s+night\s+of\s+the?\s*soul/.test(t)) return 'ordeal';

  // Atto III / Ritorno e Risoluzione (mantieni via del ritorno nel terzo atto)
  if (/via\s+del\s+ritorno|road\s+back/.test(t)) return 'road_back';
  if (/climax|finale\s+epico|confronto\s+finale/.test(t)) return 'resurrection';
  if (/resurrezione|ressurrezione|resurrection/.test(t)) return 'resurrection';
  if (/ritorno.*elisir|return.*elixir|ritorno\s+con\s+l.?elisir/.test(t))
    return 'return_with_elixir';
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
    // Mantieni contenuto integrale; la sinossi è solo un estratto ma non sostituisce il content
    currentScene.content = currentScene.buffer.join('\n');
    currentScene.synopsis =
      currentScene.synopsis || currentScene.content.trim().slice(0, 240);
    const k = currentScene.stageKey || 'imported';
    stageOrderCounters[k] = (stageOrderCounters[k] || 0) + 1;
    currentScene.order = stageOrderCounters[k];
    scenes.push({
      title: currentScene.title,
      synopsis: currentScene.synopsis,
      content: currentScene.content,
      stageKey: currentScene.stageKey,
      order: currentScene.order,
    });
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
    const h3Scene =
      line.match(/^###\s*SCENA\s+(\d+)(?:\s*[–-]\s*(.+))?/i) ||
      line.match(/^###\s*SCENA\s+(\d+)\s*(\(.+\))?/i);

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
      const ideaOpener = line.match(
        /^(?:##|###)\s*IDEA[\.:\s]*(\d+)?\s*[–\-\.:]?\s*(.+)?$/i
      );
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
      const ideaHeader =
        line.match(/^(?:##|###)\s*IDEA[\.:\s]*(\d+)?\s*[–\-\.:]?\s*(.+)?$/i) ||
        line.match(/^[-*]\s+\[(?:x| )\]\s+(.+)$/i) ||
        line.match(/^[-*]\s+(.+)$/);
      if (ideaHeader) {
        flushIdea();
        const titleTxt = ideaHeader[2] || ideaHeader[1];
        currentIdea = {
          title: `IDEA - ${(titleTxt || '').toString().trim()}`,
          buffer: [],
        };
        continue;
      }
      if (line.trim().length && !currentIdea) {
        // Start a new idea from the first non-empty line
        const titleSeed = line.trim().slice(0, 80);
        currentIdea = { title: `IDEA - ${titleSeed}`, buffer: [] };
      }
      if (currentIdea) {
        currentIdea.buffer.push(line);
      }
      continue;
    }

    if (h3Scene) {
      flushScene();
      const num = h3Scene[1];
      const rest = (h3Scene[2] || '').trim();
      const title = rest
        ? `SCENA ${num} - ${rest.replace(/^\(|\)$/g, '')}`
        : `SCENA ${num}`;
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

// --- Parsing puro (no AI) ---
function parseOnly(rawText) {
  const doSplit = splitScenesEl.checked;
  const strategy = splitStrategyEl.value;
  const minLen = parseInt(minSceneLenEl.value || '300', 10);
  const structured = parseRomanzoStructuredMD(rawText);
  let scenes = structured?.scenes?.length
    ? structured.scenes
    : [{ title: 'Manoscritto', synopsis: '', content: rawText }];
  let ideasFromDoc = structured?.ideas || [];
  if (!structured?.scenes?.length && doSplit) {
    const chunks = naiveSplitIntoScenes(rawText, strategy, minLen);
    scenes = chunks.map((c, i) => ({
      title: `Scena ${i + 1}`,
      synopsis: '',
      content: c,
    }));
    log(`Segmentazione (solo parsing): trovate ${scenes.length} scene.`);
  } else if (structured?.scenes?.length) {
    log(
      `Formato strutturato rilevato: ${scenes.length} scene, ${ideasFromDoc.length} idee.`
    );
  }
  if (DEBUG_IMPORT)
    scenes.forEach(s =>
      console.log('[IMPORT][SCENA]', s.title, s.content?.length)
    );
  return { scenes, ideas: ideasFromDoc };
}

// --- Analisi AI opzionale (entità & stile) ---
async function runAIEnrichment(rawText) {
  const doExtract = extractEntitiesEl.checked;
  const doStyle = analyzeStyleEl.checked;
  if (!doExtract && !doStyle) {
    log('Analisi AI non richiesta (nessuna opzione attiva).');
    return {
      entities: {
        characters: [],
        locations: [],
        objects: [],
        geography: [],
        history: [],
        culture: [],
      },
      relations: [],
      plotlines: [],
      style: null,
      ideas: [],
    };
  }
  const focus = (analysisFocusEl?.value || '').trim();
  log('Avvio analisi AI differita (Background Worker)...');

  let entities = {
    characters: [],
    locations: [],
    objects: [],
    geography: [],
    history: [],
    culture: [],
  };
  let relations = [];
  let plotlines = [];
  let style = null;

  if (doExtract || doStyle) {
    // Analisi più accurata: chunking su tutto il manoscritto 
    // TOON permette chunk più grandi (8000 char)
    const chunks = [];
    const max = 8000;
    for (let i = 0; i < rawText.length; i += max) {
      chunks.push(rawText.slice(i, i + max));
    }

    const collation = {
      characters: new Map(),
      locations: new Map(),
      objects: new Map(),
      geography: new Map(),
      history: new Map(),
      culture: new Map(),
      relations: [],
      plotlines: [],
      ideas: [],
    };

    log(`IA: analisi in ${chunks.length} parti (Code in background)...`);

    // Invia tutti i chunk al worker. Il worker ha una coda interna.
    // Usiamo Promise.all per attendere che tutti completino (o falliscano)
    const promises = chunks.map((chunk, ci) =>
      AIService.analyzeBackground(chunk, 'extraction')
        .then(toonData => ({ ci, data: toonData }))
        .catch(err => {
          console.error(`Chunk ${ci} failed`, err);
          log(`Parte ${ci + 1} fallita, continuo...`);
          return null;
        })
    );

    const results = await Promise.all(promises);

    // Processa risultati TOON
    const mapToonItems = (items, targetMap, typeLabel) => {
      if (!Array.isArray(items)) return;
      items.forEach(it => {
        const name = it.n;
        if (!name || typeof name !== 'string' || name.length < 2) return;
        const k = name.toLowerCase().trim();
        const description = it.d || '';
        const role = it.r || '';
        const type = it.t || typeLabel || '';

        const prev = targetMap.get(k);
        let finalDesc = description;
        if (prev && prev.description && description) {
          finalDesc = prev.description.length > description.length ? prev.description : description;
        }

        targetMap.set(k, {
          name,
          description: finalDesc,
          role, // char role
          type, // obj type
          ...prev,
          ...{ name, description: finalDesc, role, type }
        });
      });
    };

    for (const res of results) {
      if (!res || !res.data) continue;
      const d = res.data;

      mapToonItems(d.c, collation.characters, 'Personaggio');
      mapToonItems(d.l, collation.locations, 'Luogo');
      mapToonItems(d.g, collation.geography, 'Geografia');
      mapToonItems(d.o, collation.objects, 'Oggetto');
      mapToonItems(d.k, collation.culture, 'Cultura');

      if (Array.isArray(d.p)) {
        d.p.forEach(pl => {
          if (pl.n) collation.plotlines.push({ name: pl.n, description: pl.d });
        });
      }
    }

    entities.characters = Array.from(collation.characters.values());
    entities.locations = Array.from(collation.locations.values());
    entities.objects = Array.from(collation.objects.values());
    entities.geography = Array.from(collation.geography.values());
    entities.history = Array.from(collation.history.values());
    entities.culture = Array.from(collation.culture.values());
    plotlines = collation.plotlines;

    // Stile: per ora non implementato nel worker TOON (richiede analisi full text non compressa)
    // Se necessario, potremmo fare una chiamata dedicata per lo stile su un campione casuale
  }

  return { entities, relations, plotlines, style };
}

async function commitToProject(
  dataManager,
  projectId,
  result,
  options = { mode: 'merge' }
) {
  log('Scrittura nel progetto...');
  const mode = options.mode || 'merge';
  // In modalità merge, carica esistenti per dedup
  const existing = {
    characters: [],
    locations: [],
    objects: [],
    geography: [],
    history: [],
    culture: [],
    plotlines: [],
    ideas: [],
    scenes: [],
  };
  if (mode === 'merge') {
    existing.characters = await dataManager.getProjectItems(
      projectId,
      'characters'
    );
    existing.locations = await dataManager.getProjectItems(
      projectId,
      'locations'
    );
    existing.objects = await dataManager.getProjectItems(projectId, 'objects');
    existing.geography = await dataManager.getProjectItems(
      projectId,
      'geography'
    );
    existing.history = await dataManager.getProjectItems(projectId, 'history');
    existing.culture = await dataManager.getProjectItems(projectId, 'culture');
    existing.plotlines = await dataManager.getProjectItems(
      projectId,
      'plotlines'
    );
    existing.ideas = await dataManager.getProjectItems(projectId, 'ideas');
    existing.scenes = await dataManager.getProjectItems(projectId, 'scenes');
  }
  // Scene (result.scenes atteso da parsing)
  for (let i = 0; i < (result.scenes || []).length; i++) {
    const s = result.scenes[i];
    if (!s.stageKey || s.stageKey === 'imported') s.stageKey = 'unassigned';
    if (mode === 'merge') {
      const dup = existing.scenes.find(
        x =>
          (x.title || '').toLowerCase() === (s.title || '').toLowerCase() &&
          (x.stageKey || '') === (s.stageKey || '') &&
          (x.order || '') === (s.order || '')
      );
      if (dup) continue;
    }
    await dataManager.saveScene({
      projectId,
      title: s.title,
      synopsis: s.synopsis || '',
      content: s.content, // contenuto integrale
      stageKey: s.stageKey || 'unassigned',
      order: s.order || i + 1,
    });
  }
  // Idee dal documento
  if (result.ideas?.length) {
    for (const idea of result.ideas) {
      const content = idea.title
        ? `${idea.title}\n\n${idea.content || ''}`
        : idea.content || '';
      if (mode === 'merge') {
        const dup = existing.ideas.find(
          x => (x.content || '').trim() === content.trim()
        );
        if (dup) continue;
      }
      const saved = await dataManager.saveProjectItem(projectId, 'ideas', {
        content,
      });
      try {
        document.dispatchEvent(
          new CustomEvent('idea-saved', { detail: { idea: saved } })
        );
      } catch { }
    }
  }
  // Items generici helper
  const saveItems = async (type, items, fieldsMapper, nameKey = 'name') => {
    for (const it of items) {
      const data = fieldsMapper(it);
      if (mode === 'merge') {
        const list = existing[type] || [];
        const nm = (data[nameKey] || '').toLowerCase();
        if (nm && list.find(x => (x[nameKey] || '').toLowerCase() === nm))
          continue;
      }
      await dataManager.saveProjectItem(projectId, type, data);
    }
  };
  if (result.entities) {
    await saveItems('characters', result.entities.characters, it => ({
      name: it.name,
      role: it.role || '',
      archetype: it.archetype || '',
      narrativeRole: it.role || '',
    }));
    await saveItems('locations', result.entities.locations, it => ({
      name: it.name,
      description: it.description || '',
    }));
    await saveItems('objects', result.entities.objects, it => ({
      name: it.name,
      description: it.description || '',
    }));
    await saveItems('geography', result.entities.geography, it => ({
      name: it.name,
      description: it.description || '',
    }));
    await saveItems('history', result.entities.history, it => ({
      name: it.name,
      description: it.description || '',
    }));
    await saveItems('culture', result.entities.culture, it => ({
      name: it.name,
      description: it.description || '',
    }));
    await saveItems('plotlines', result.plotlines || [], it => ({
      name: it.name || it.title || 'Linea narrativa',
      description: it.description || '',
    }));
  }

  // Relazioni personaggi
  if (result.entities.characters?.length && result.relations?.length) {
    const chars = await dataManager.getProjectItems(projectId, 'characters');
    const byName = Object.fromEntries(
      chars.map(c => [c.name.toLowerCase(), c])
    );
    // Aggiorna relazioni
    for (const rel of result.relations) {
      const source = byName[rel.source?.toLowerCase?.()];
      const target = byName[rel.target?.toLowerCase?.()];
      if (!source || !target) continue;
      const updated = { ...source };
      updated.relationships = updated.relationships || [];
      if (
        !updated.relationships.find(
          r => r.targetCharacterId === target.id && r.type === rel.type
        )
      ) {
        updated.relationships.push({
          targetCharacterId: target.id,
          type: rel.type || 'Relazione',
        });
        await dataManager.saveProjectItem(projectId, 'characters', updated);
      }
    }
  }
}

function init(dataManager) {
  if (isInitialized) return;
  modalEl = document.getElementById('import-text-modal');
  fileInput = document.getElementById('import-file');
  textArea = document.getElementById('import-text');
  runBtn = document.getElementById('import-run-btn');
  aiRunBtn = document.getElementById('import-ai-run-btn');
  heroSuggestBtn = document.getElementById('import-hero-suggest-btn');
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

  let lastResult = null; // compat legacy (contiene sia scenes che arricchimento se presente)

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      if (statusEl) {
        statusEl.textContent = 'Nessun file selezionato.';
        statusEl.classList.remove('text-secondary', 'text-red-400', 'text-green-400');
        statusEl.classList.add('text-yellow-300');
      }
      return;
    }
    try {
      const txt = await readFileAsText(file);
      textArea.value = txt;
      if (statusEl) {
        statusEl.textContent = `File caricato: ${file.name}`;
        statusEl.classList.remove('text-secondary', 'text-red-400', 'text-yellow-300');
        statusEl.classList.add('text-green-400');
      }
      log(`Caricato file: ${file?.name || 'n/d'} (${txt.length} caratteri)`);
    } catch (error) {
      textArea.value = '';
      if (statusEl) {
        statusEl.textContent = error.message || 'Errore durante il caricamento file.';
        statusEl.classList.remove('text-secondary', 'text-green-400', 'text-yellow-300');
        statusEl.classList.add('text-red-400');
      }
      log(`Errore import file: ${error.message || error}`);
      toast?.error?.(error.message || 'Errore durante il caricamento file.');
      fileInput.value = '';
    }
  });

  isInitialized = true;

  // IMPORT (solo parsing + anteprima base)
  runBtn.addEventListener('click', async () => {
    const projectId = await dataManager.getCurrentProjectId();
    if (!projectId) {
      statusEl.textContent = 'Seleziona un progetto prima.';
      return;
    }
    const raw = textArea.value.trim();
    if (!raw) {
      statusEl.textContent = 'Inserisci o carica un testo.';
      return;
    }
    statusEl.textContent = 'Parsing in corso...';
    commitBtn.disabled = true;
    lastParsed = parseOnly(raw);
    // Reset arricchimento precedente
    lastAIEnrichment = null;
    lastResult = {
      ...lastParsed,
      entities: {
        characters: [],
        locations: [],
        objects: [],
        geography: [],
        history: [],
        culture: [],
      },
      relations: [],
      plotlines: [],
      style: null,
    };
    statusEl.textContent =
      'Parsing completato. Puoi importare e (facoltativamente) analizzare dopo.';
    commitBtn.disabled = false;
    aiRunBtn.disabled = false;
    heroSuggestBtn.disabled = false; // potrà proporre stage dopo import effettivo
    // Render preview
    try {
      selectionState = {
        scenes: new Set(),
        ideas: new Set(),
        characters: new Set(),
        plotlines: new Set(),
        locations: new Set(),
        objects: new Set(),
        geography: new Set(),
        history: new Set(),
        culture: new Set(),
      };
      const renderList = (container, items, type) => {
        container.innerHTML = items
          .map((item, idx) => {
            const id = `${type}-${idx}`;
            selectionState[type].add(idx);
            if (type === 'scenes') {
              return `<li class="text-xs flex items-start gap-2"><input type="checkbox" class="mt-0.5 item-check" data-type="${type}" data-idx="${idx}" checked><span class="text-secondary">${item.stageKey ? `[${item.stageKey}] ` : ''}</span><span class="truncate">${item.title}</span></li>`;
            }
            if (type === 'ideas') {
              return `<li class="text-xs flex items-start gap-2"><input type="checkbox" class="mt-0.5 item-check" data-type="${type}" data-idx="${idx}" checked><span class="bg-accent text-primary text-[10px] px-1 py-0.5 rounded">${idx + 1}</span><span class="truncate">${item.title ? `${item.title} — ` : ''}${(item.content || '').slice(0, 120)}</span></li>`;
            }
            if (type === 'characters') {
              return `<li class="text-xs flex items-start gap-2"><input type="checkbox" class="mt-0.5 item-check" data-type="${type}" data-idx="${idx}" checked><span>${item.name}${item.role ? ` — ${item.role}` : ''}</span></li>`;
            }
            if (type === 'plotlines') {
              return `<li class="text-xs flex items-start gap-2"><input type="checkbox" class="mt-0.5 item-check" data-type="${type}" data-idx="${idx}" checked><span>${item.name || item.title || 'Linea'}</span></li>`;
            }
            if (
              type === 'locations' ||
              type === 'objects' ||
              type === 'geography' ||
              type === 'history' ||
              type === 'culture'
            ) {
              const label =
                item.name || (item.title || '').slice(0, 60) || 'Elemento';
              const desc = item.description
                ? ` — ${item.description.slice(0, 80)}`
                : '';
              return `<li class="text-xs flex items-start gap-2"><input type="checkbox" class="mt-0.5 item-check" data-type="${type}" data-idx="${idx}" checked><span>${label}${desc}</span></li>`;
            }
          })
          .join('');
      };
      renderList(previewScenes, lastResult.scenes || [], 'scenes');
      renderList(previewIdeas, lastResult.ideas || [], 'ideas');
      // Nessuna entità finché non si esegue l'analisi AI
      renderList(previewCharacters, [], 'characters');
      renderList(previewPlotlines, [], 'plotlines');
      renderList(previewLocations, [], 'locations');
      renderList(previewObjects, [], 'objects');
      renderList(previewGeography, [], 'geography');
      renderList(previewHistory, [], 'history');
      renderList(previewCulture, [], 'culture');
      previewScenesCount.textContent = lastResult.scenes?.length || 0;
      previewIdeasCount.textContent = lastResult.ideas?.length || 0;
      previewCharactersCount.textContent = 0;
      previewPlotlinesCount.textContent = 0;
      previewLocationsCount.textContent = 0;
      previewObjectsCount.textContent = 0;
      previewGeographyCount.textContent = 0;
      previewHistoryCount.textContent = 0;
      previewCultureCount.textContent = 0;
      previewBox.classList.remove('hidden');

      // Hook per-item selection
      previewBox.querySelectorAll('.item-check').forEach(chk => {
        chk.addEventListener('change', e => {
          const type = e.target.getAttribute('data-type');
          const idx = parseInt(e.target.getAttribute('data-idx'), 10);
          if (e.target.checked) selectionState[type].add(idx);
          else selectionState[type].delete(idx);
        });
      });

      // Hook select-all toggles
      const bindSelectAll = (el, type, itemsLen) => {
        if (!el) return;
        el.checked = true;
        el.onchange = () => {
          selectionState[type] = new Set();
          previewBox
            .querySelectorAll(`.item-check[data-type="${type}"]`)
            .forEach((c, i) => {
              c.checked = el.checked;
              if (el.checked)
                selectionState[type].add(
                  parseInt(c.getAttribute('data-idx'), 10)
                );
            });
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
    } catch { }
  });

  // COMMIT (importa ciò che è attualmente in lastResult – che può essere solo parsing o parsing+AI)
  commitBtn.addEventListener('click', async () => {
    const projectId = await dataManager.getCurrentProjectId();
    if (!projectId || !lastResult) return;
    statusEl.textContent = 'Import in corso...';
    commitBtn.disabled = true;
    // Filtra in base alla selezione
    const pick = (arr, type) =>
      arr.filter((_, idx) => selectionState[type]?.has(idx));
    const filtered = {
      scenes: pick(lastResult.scenes || [], 'scenes'),
      ideas: pick(lastResult.ideas || [], 'ideas'),
      entities: {
        ...lastResult.entities,
        characters: pick(lastResult.entities?.characters || [], 'characters'),
        locations: pick(lastResult.entities?.locations || [], 'locations'),
        objects: pick(lastResult.entities?.objects || [], 'objects'),
        geography: pick(lastResult.entities?.geography || [], 'geography'),
        history: pick(lastResult.entities?.history || [], 'history'),
        culture: pick(lastResult.entities?.culture || [], 'culture'),
      },
      relations: lastResult.relations || [],
      plotlines: pick(lastResult.plotlines || [], 'plotlines'),
      style: lastResult.style || null,
    };
    // Modalità import
    const mode = importModeReplaceEl?.checked ? 'replace' : 'merge';
    if (mode === 'replace') {
      // Cancella SOLO gli store per i quali l'utente ha effettivamente selezionato almeno un elemento da importare.
      const toClear = [];
      if (filtered.scenes.length) toClear.push('scenes');
      if (filtered.ideas.length) toClear.push('ideas');
      if (filtered.entities.characters.length) toClear.push('characters');
      if (filtered.entities.locations.length) toClear.push('locations');
      if (filtered.entities.objects.length) toClear.push('objects');
      if (filtered.entities.geography.length) toClear.push('geography');
      if (filtered.entities.history.length) toClear.push('history');
      if (filtered.entities.culture.length) toClear.push('culture');
      if (filtered.plotlines.length) toClear.push('plotlines');
      if (toClear.length) {
        log(`Modalità: Sostituisci. Pulizia mirata: ${toClear.join(', ')}`);
        await dataManager.clearProjectStores(projectId, toClear);
      } else {
        log(
          'Modalità: Sostituisci ma nessun tipo selezionato -> nessuna cancellazione eseguita.'
        );
      }
    } else {
      log('Modalità: Unisci (con deduplica).');
    }
    // Deduplica preventiva nelle liste selezionate
    const dedupByKey = (arr, keyFn) => {
      const seen = new Set();
      return (arr || []).filter(it => {
        const k = keyFn(it);
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    };
    const norm = s => (s || '').toLowerCase().trim();
    filtered.scenes = dedupByKey(
      filtered.scenes,
      s =>
        `${norm(s.title)}|${norm(s.stageKey)}|${s.order || ''}|${norm((s.content || '').slice(0, 80))}`
    );
    filtered.ideas = dedupByKey(
      filtered.ideas,
      i => `${norm(i.title)}|${norm((i.content || '').slice(0, 120))}`
    );
    filtered.entities.characters = dedupByKey(filtered.entities.characters, c =>
      norm(c.name)
    );
    filtered.entities.locations = dedupByKey(filtered.entities.locations, l =>
      norm(l.name)
    );
    filtered.entities.objects = dedupByKey(filtered.entities.objects, o =>
      norm(o.name)
    );
    filtered.entities.geography = dedupByKey(filtered.entities.geography, g =>
      norm(g.name)
    );
    filtered.entities.history = dedupByKey(filtered.entities.history, h =>
      norm(h.name)
    );
    filtered.entities.culture = dedupByKey(filtered.entities.culture, c =>
      norm(c.name)
    );
    filtered.plotlines = dedupByKey(filtered.plotlines, p =>
      norm(p.name || p.title)
    );

    await commitToProject(dataManager, projectId, filtered, { mode });
    statusEl.textContent = 'Import completato.';
  });

  // ANALISI AI differita (arricchisce lastResult e aggiorna anteprima)
  aiRunBtn?.addEventListener('click', async () => {
    const raw = textArea.value.trim();
    if (!lastParsed || !raw) {
      statusEl.textContent = 'Nessun parsing iniziale.';
      return;
    }
    aiRunBtn.disabled = true;
    aiRunBtn.textContent = 'Analisi...';
    try {
      const enrich = await runAIEnrichment(raw);
      lastAIEnrichment = enrich;
      // unisci
      lastResult = { ...lastParsed, ...enrich, ideas: lastParsed.ideas };
      // Rirender entità
      const renderList = (container, items, type) => {
        container.innerHTML = items
          .map(
            (item, idx) =>
              `<li class="text-xs flex items-start gap-2"><input type="checkbox" class="mt-0.5 item-check" data-type="${type}" data-idx="${idx}" checked><span>${item.name || item.title || 'Elemento'}</span></li>`
          )
          .join('');
        selectionState[type] = new Set(items.map((_, i) => i));
      };
      renderList(
        previewCharacters,
        lastResult.entities?.characters || [],
        'characters'
      );
      renderList(previewPlotlines, lastResult.plotlines || [], 'plotlines');
      renderList(
        previewLocations,
        lastResult.entities?.locations || [],
        'locations'
      );
      renderList(previewObjects, lastResult.entities?.objects || [], 'objects');
      renderList(
        previewGeography,
        lastResult.entities?.geography || [],
        'geography'
      );
      renderList(previewHistory, lastResult.entities?.history || [], 'history');
      renderList(previewCulture, lastResult.entities?.culture || [], 'culture');
      previewCharactersCount.textContent =
        lastResult.entities?.characters?.length || 0;
      previewPlotlinesCount.textContent = lastResult.plotlines?.length || 0;
      previewLocationsCount.textContent =
        lastResult.entities?.locations?.length || 0;
      previewObjectsCount.textContent =
        lastResult.entities?.objects?.length || 0;
      previewGeographyCount.textContent =
        lastResult.entities?.geography?.length || 0;
      previewHistoryCount.textContent =
        lastResult.entities?.history?.length || 0;
      previewCultureCount.textContent =
        lastResult.entities?.culture?.length || 0;
      // Ricollega checkbox
      previewBox.querySelectorAll('.item-check').forEach(chk => {
        chk.addEventListener('change', e => {
          const type = e.target.getAttribute('data-type');
          const idx = parseInt(e.target.getAttribute('data-idx'), 10);
          if (e.target.checked) selectionState[type].add(idx);
          else selectionState[type].delete(idx);
        });
      });
      aiRunBtn.textContent = 'Analisi AI';
      statusEl.textContent = 'Analisi AI completata.';
    } catch (e) {
      statusEl.textContent = 'Errore analisi AI.';
      aiRunBtn.textContent = 'Analisi AI';
    } finally {
      aiRunBtn.disabled = false;
    }
  });

  // SUGGERIMENTI VIAGGIO DELL'EROE (solo suggerimenti, non salva)
  heroSuggestBtn?.addEventListener('click', async () => {
    const projectId = await dataManager.getCurrentProjectId();
    if (!projectId) {
      statusEl.textContent = 'Seleziona progetto.';
      return;
    }
    heroSuggestBtn.disabled = true;
    heroSuggestBtn.textContent = 'Suggerisco...';
    try {
      const scenes = await dataManager.getProjectItems(projectId, 'scenes');
      if (!scenes.length) {
        statusEl.textContent = 'Nessuna scena importata.';
        return;
      }
      // Costruisci prompt con titoli + prime 400 battute
      const catalogue = scenes
        .map(s => ({
          id: s.id,
          title: s.title || '',
          excerpt: (s.content || '').slice(0, 400),
        }))
        .slice(0, 60); // limite di sicurezza
      const heroStages = [
        'ordinary_world',
        'call_to_adventure',
        'refusal_of_call',
        'meeting_mentor',
        'crossing_threshold',
        'tests_allies_enemies',
        'inmost_cave',
        'ordeal',
        'reward',
        'road_back',
        'resurrection',
        'return_with_elixir',
      ];
      const system =
        'Rispondi SOLO con JSON valido. Nessun commento o testo fuori dal JSON.';
      const N = catalogue.length;
      const stageHints = `ALLOWED_STAGES (usa le chiavi esatte):\n- ordinary_world: Mondo Ordinario\n- call_to_adventure: Chiamata\n- refusal_of_call: Rifiuto\n- meeting_mentor: Mentore\n- crossing_threshold: Soglia\n- tests_allies_enemies: Prove/Alleati/Nemici\n- inmost_cave: Avvicinamento\n- ordeal: Prova Centrale\n- reward: Ricompensa\n- road_back: Via del Ritorno\n- resurrection: Resurrezione\n- return_with_elixir: Ritorno con l'Elisir`;
      const constraints = `CONSTRAINTS:\n- Restituisci un ARRAY JSON di LUNGHEZZA ESATTAMENTE ${N}.\n- Ogni elemento deve avere: {"id":"sceneId","idx":number,"suggestedStage":"<allowed>","confidence":0-1}.\n- Copia esattamente l'id fornito per la scena corrispondente e imposta idx con il numero IDX.\n- Usa solo gli stage di ALLOWED_STAGES; se incerto usa "unassigned".\n- Non inventare scene, non duplicare elementi, non saltare scene.`;
      const sceneList =
        'SCENES:\n' +
        catalogue
          .map(
            (c, i) =>
              `IDX:${i + 1} | ID:${c.id}\nTitolo:${c.title}\nTesto:${c.excerpt.replace(/\n/g, ' ')}`
          )
          .join('\n---\n');
      const outputFormat =
        'OUTPUT_FORMAT: [{"id":"...","idx":1,"suggestedStage":"ordinary_world","confidence":0.85}, ...]';
      const prompt = `${stageHints}\n\n${constraints}\n\n${sceneList}\n\n${outputFormat}`;
      const { text } = await AIService.complete({
        prompt,
        system,
        temperature: 0.1,
        maxTokens: 900,
      });
      let body = text.replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
      const a = body.indexOf('[');
      const b = body.lastIndexOf(']');
      if (a !== -1 && b !== -1) body = body.slice(a, b + 1);
      let arr = [];
      try {
        arr = JSON.parse(body);
      } catch { }
      if (!Array.isArray(arr)) {
        statusEl.textContent = 'Parsing suggerimenti fallito.';
        return;
      }
      const validSet = new Set(heroStages);
      const map = new Map();
      for (const s of arr) {
        if (!s || (!s.id && !s.idx)) continue;
        let id = s.id;
        const idx = Number.isInteger(s.idx)
          ? s.idx
          : Number.parseInt(s.idx, 10);
        if (
          (!id || !scenes.find(c => c.id === id)) &&
          idx &&
          idx >= 1 &&
          idx <= catalogue.length
        )
          id = catalogue[idx - 1].id;
        if (!id) continue;
        const norm = {
          id,
          suggestedStage: validSet.has(s.suggestedStage)
            ? s.suggestedStage
            : 'unassigned',
          confidence:
            typeof s.confidence === 'number'
              ? Math.max(0, Math.min(1, s.confidence))
              : 0,
        };
        const prev = map.get(norm.id);
        if (!prev || norm.confidence > prev.confidence) map.set(norm.id, norm);
      }
      const unique = Array.from(map.values());
      console.table(
        unique.map(s => ({
          id: s.id,
          stage: s.suggestedStage,
          conf: s.confidence,
        }))
      );
      const raw = arr.length;
      const unici = unique.length;
      const dups = Math.max(0, raw - unici);
      statusEl.textContent = `Suggerimenti ricevuti: ${raw} (unici: ${unici}${dups ? `, duplicati scartati: ${dups}` : ''}). Apri console per dettagli.`;
    } catch (e) {
      statusEl.textContent = 'Errore suggerimenti Hero Journey.';
    } finally {
      heroSuggestBtn.textContent = 'Hero Journey';
      heroSuggestBtn.disabled = false;
    }
  });

  closeBtn.addEventListener('click', hide);

  return { open: show, hide };
}

// API programmatica aggiornata (mantiene retro-compat ma separa parsing/AI)
export async function importRawText(
  dataManager,
  projectId,
  rawText,
  {
    mode = 'merge',
    split = true,
    strategy = 'auto',
    minSceneLength = 300,
    extract = true,
    analyzeStyle = true,
    focus = '',
  } = {}
) {
  // local copies of inner helpers
  const run = async () => {
    // mimic runAnalysis options
    const raw = rawText;
    const structured = parseRomanzoStructuredMD(raw);
    let scenes = structured?.scenes?.length
      ? structured.scenes
      : [{ title: 'Manoscritto', synopsis: '', content: raw }];
    let ideasFromDoc = structured?.ideas || [];
    if (!structured?.scenes?.length && split) {
      const chunks = naiveSplitIntoScenes(raw, strategy, minSceneLength);
      scenes = chunks.map((c, i) => ({
        title: `Scena ${i + 1}`,
        synopsis: '',
        content: c,
      }));
    }
    let entities = {
      characters: [],
      locations: [],
      objects: [],
      geography: [],
      history: [],
      culture: [],
    };
    let relations = [];
    let plotlines = [];
    let style = null;
    if (extract || analyzeStyle) {
      // reuse the same IA chunking logic (inline minimal copy)
      const header = `Analizza il seguente testo narrativo e restituisci un JSON valido.
Obiettivo: Estrarre elementi del world building e personaggi con precisione.

SCHEMA JSON RICHIESTO:
{
  "characters": [{ "name": "Nome", "role": "Ruolo (Protagonista/Antagonista/Secondario)", "archetype": "Archetipo", "description": "Breve descrizione fisica e caratteriale" }],
  "locations": [{ "name": "Nome Luogo", "description": "Descrizione", "type": "Luogo specifico (stanza, edificio)" }],
  "geography": [{ "name": "Nome Geografico", "description": "Descrizione", "type": "Pianeta, Regione, Continente, Foresta, Mare" }],
  "objects": [{ "name": "Nome Oggetto", "description": "Descrizione", "type": "Veicolo, Arma, Oggetto chiave" }],
  "history": [{ "name": "Nome Evento", "description": "Evento passato menzionato" }],
  "culture": [{ "name": "Nome Gruppo/Concetto", "description": "Religione, Fazione, Organizzazione, Usanza" }],
  "relations": [{ "source": "Nome Personaggio A", "target": "Nome Personaggio B", "type": "Tipo relazione" }],
  "plotlines": [{ "name": "Nome Trama", "description": "Descrizione linea narrativa" }],
  "style": { "voice": "Voce narrante", "pacing": "Ritmo", "lexical_richness": "Ricchezza lessicale", "tone": "Tono prevalente" },
  "ideas": [{ "title": "Titolo idea", "content": "Contenuto dell'appunto o nota trovata nel testo" }]
}

REGOLE CRITICHE DI CATEGORIZZAZIONE:
1. PERSONAGGI (characters): Includi SOLO esseri senzienti/viventi (umani, alieni, robot senzienti).
2. NON INSERIRE MAI PIANETI, ASTRONAVI, CITTÀ O ORGANIZZAZIONI IN "characters".
   - Pianeti/Regioni -> "geography"
   - Astronavi/Veicoli -> "objects"
   - Città/Edifici -> "locations"
   - Fazioni/Gruppi -> "culture"
3. Se un'entità è ambigua, privilegia "objects" o "locations" rispetto a "characters" se non parla/agisce come persona.
`;

      const chunks = [];
      const max = 6000; // Aumentato leggermente per ridurre numero chiamate se il modello regge
      for (let i = 0; i < raw.length; i += max)
        chunks.push(raw.slice(i, i + max));

      const collation = {
        characters: new Map(),
        locations: new Map(),
        objects: new Map(),
        geography: new Map(),
        history: new Map(),
        culture: new Map(),
        relations: [],
        plotlines: [],
        styleSamples: [],
        ideas: [],
      };

      const systemMsg = 'Sei un analista letterario preciso. Rispondi esclusivamente con JSON valido. Rispetta rigorosamente la distinzione tra personaggi (viventi) e oggetti/luoghi.';
      const focusHint = focus ? `\nFOCUS SPECIFICO RICHIESTO: ${focus}` : '';

      // Helper robusto per JSON repair
      const repairAndParse = (text) => {
        try {
          return JSON.parse(text);
        } catch (e) {
          // 1. Rimuovi markdown fences
          let clean = text.replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
          // 2. Trova il primo { e l'ultimo }
          const firstOpen = clean.indexOf('{');
          const lastClose = clean.lastIndexOf('}');
          if (firstOpen === -1 || lastClose === -1) return {};
          clean = clean.slice(firstOpen, lastClose + 1);

          // 3. Fix comuni: trailing commas
          clean = clean.replace(/,\s*([}\]])/g, '$1');
          // 4. Quote chiavi non quotate (spesso succede con modelli locali)
          clean = clean.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

          try {
            return JSON.parse(clean);
          } catch (e2) {
            console.warn("JSON repair failed 2nd attempt", e2);
            return {};
          }
        }
      };

      for (let ci = 0; ci < chunks.length; ci++) {
        const prompt = `${header}${focusHint}\n\n--- TESTO DA ANALIZZARE (PARTE ${ci + 1}/${chunks.length}) ---\n${chunks[ci]}`;
        try {
          const { text } = await AIService.complete({
            prompt,
            system: systemMsg,
            temperature: 0.1, // Temperatura bassa per maggiore determinismo json
            maxTokens: 1500, // Aumentato per permettere JSON completi
          });

          const parsed = repairAndParse(text);

          // Deduplicazione "Smart": usa nome normalizzato ma arricchisci descrizione
          const addList = (lst, map, key = 'name') => {
            (lst || []).forEach(it => {
              const rawName = it?.[key];
              if (!rawName || typeof rawName !== 'string') return;
              const k = rawName.toLowerCase().trim();
              if (k.length < 2) return; // ignora rumore

              const prev = map.get(k);

              // Se esiste già, uniamo le descrizioni se nuove
              let finalDesc = it.description || '';
              if (prev && prev.description) {
                if (it.description && !prev.description.includes(it.description.slice(0, 20))) {
                  // Evita di accodare se sembra già presente
                  finalDesc = prev.description.length > it.description.length ? prev.description : it.description;
                } else {
                  finalDesc = prev.description;
                }
              }

              map.set(k, { ...prev, ...it, description: finalDesc });
            });
          };

          addList(parsed.characters, collation.characters);
          addList(parsed.locations, collation.locations);
          addList(parsed.objects, collation.objects);
          addList(parsed.geography, collation.geography);
          addList(parsed.history, collation.history);
          addList(parsed.culture, collation.culture);

          if (parsed.relations) collation.relations.push(...parsed.relations);
          if (parsed.plotlines) collation.plotlines.push(...parsed.plotlines);
          if (parsed.style) collation.styleSamples.push(parsed.style);
          if (Array.isArray(parsed.ideas))
            collation.ideas.push(
              ...parsed.ideas.filter(it => it?.title || it?.content)
            );
        } catch (err) {
          console.error(`Error analyzing chunk ${ci}`, err);
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

      // Idee: merge
      if (
        (!ideasFromDoc || ideasFromDoc.length === 0) &&
        collation.ideas.length
      ) {
        const seen = new Set();
        ideasFromDoc = collation.ideas.filter(it => {
          const key = `${(it.title || '').toLowerCase()}::${(it.content || '').toLowerCase()}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      if (collation.styleSamples.length) {
        // Simple tone voting
        const tones = {};
        for (const s of collation.styleSamples) {
          if (s?.tone) tones[s.tone] = (tones[s.tone] || 0) + 1;
        }
        const topTone =
          Object.entries(tones).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        style = { ...(collation.styleSamples[0] || {}), tone: topTone };
      }
    }
    return {
      scenes,
      entities,
      relations,
      plotlines,
      style,
      ideas: ideasFromDoc,
    };
  };
  const result = await run();
  await commitToProject(dataManager, projectId, result, { mode });
  return {
    ok: true,
    scenes: result.scenes?.length || 0,
    ideas: result.ideas?.length || 0,
    characters: result.entities?.characters?.length || 0,
  };
}

export default { init, show, hide, open };
