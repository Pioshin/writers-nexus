import { AIService } from '../../ai/AIService.js';

let modalEl, fileInput, textArea, runBtn, closeBtn, commitBtn, logEl, statusEl;
let splitScenesEl, extractEntitiesEl, analyzeStyleEl, splitStrategyEl, minSceneLenEl;

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
  if (/mondo\s+ordinario/.test(t)) return 'ordinary_world';
  if (/(richiamo|chiamata).*(avventura)/.test(t)) return 'call_to_adventure';
  if (/rifiuto.*(richiamo|chiamata)/.test(t)) return 'refusal_of_call';
  if (/(incontro).*mentore/.test(t)) return 'meeting_mentor';
  if (/(varco|superamento).*soglia/.test(t)) return 'crossing_threshold';
  // TODO: aggiungere mapping per atti II/III quando disponibili
  return 'imported';
}

function parseRomanzoStructuredMD(raw) {
  if (!raw || !/###\s*SCENA\s+\d+/i.test(raw)) return null;
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

    if (h2Match) {
      const title = h2Match[1].trim();
      if (/^IDEE\s+E\s+NOTE/i.test(title)) {
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

    if (inIdeas) {
      const ideaHeader = line.match(/^##\s*IDEA\s+\d+\s*[–-]\s*(.+)$/i);
      if (ideaHeader) {
        flushIdea();
        currentIdea = { title: `IDEA - ${ideaHeader[1].trim()}`, buffer: [] };
        continue;
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

  const ctxHeader = `Analizza il seguente testo e restituisci JSON con campi: characters(name, role, archetype?), locations(name, description?), objects(name, description?), geography(name, description?), history(name, description?), culture(name, description?), relations(source, target, type), plotlines(list of names with brief description), style(voice, pacing, lexical richness, tone).`;

  if (doExtract || doStyle) {
    // Riduci testo per token; prendi prime ~6000 char
    const sample = rawText.slice(0, 6000);
    const prompt = `${ctxHeader}\n\nTESTO:\n${sample}`;
    log('Invio richiesta IA per estrazione entità e stile...');
    try {
      const { text } = await AIService.complete({ prompt, system: 'Rispondi esclusivamente con JSON valido.', temperature: 0.2, maxTokens: 1200 });
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      const body = jsonStart >= 0 ? text.slice(jsonStart, jsonEnd + 1) : '{}';
      const parsed = JSON.parse(body);
      entities.characters = parsed.characters || [];
      entities.locations = parsed.locations || [];
      entities.objects = parsed.objects || [];
      entities.geography = parsed.geography || [];
      entities.history = parsed.history || [];
      entities.culture = parsed.culture || [];
  relations = parsed.relations || [];
  plotlines = parsed.plotlines || [];
      style = parsed.style || null;
      log('IA: estrazione completata.');
    } catch (e) {
      log('Errore IA o parsing JSON, procedo con fallback vuoto.');
    }
  }

  return { scenes, entities, relations, plotlines, style, ideas: ideasFromDoc };
}

async function commitToProject(dataManager, projectId, result) {
  log('Scrittura nel progetto...');
  // Scene
  for (let i = 0; i < result.scenes.length; i++) {
    const s = result.scenes[i];
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
      await dataManager.saveProjectItem(projectId, 'ideas', { content });
    }
  }
  // Items generici helper
  const saveItems = async (type, items, fieldsMapper) => {
    for (const it of items) {
      const data = fieldsMapper(it);
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
  });

  commitBtn.addEventListener('click', async () => {
    const projectId = await dataManager.getCurrentProjectId();
    if (!projectId || !lastResult) return;
    statusEl.textContent = 'Import in corso...';
    commitBtn.disabled = true;
    await commitToProject(dataManager, projectId, lastResult);
    statusEl.textContent = 'Import completato.';
  });

  closeBtn.addEventListener('click', hide);

  return { open: show, hide };
}

export default { init, show, hide, open };
