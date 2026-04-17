import { toast } from '../shared/toast.js';
import { HubJobService } from '../../ai/HubJobService.js';
let DataManager, loadModal;
let charts = { hero: null, pie: null };

function wordsCount(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

async function renderAnalysis() {
  const projectId = await DataManager.getCurrentProjectId();
  if (!projectId) return;

  const [scenes, characters, plotlines, locations, geography, objects, culture] = await Promise.all([
    DataManager.getProjectItems(projectId, 'scenes'),
    DataManager.getProjectItems(projectId, 'characters'),
    DataManager.getProjectItems(projectId, 'plotlines'),
    DataManager.getProjectItems(projectId, 'locations'),
    DataManager.getProjectItems(projectId, 'geography'),
    DataManager.getProjectItems(projectId, 'objects'),
    DataManager.getProjectItems(projectId, 'culture'),
  ]);

  // Precompute ordered scenes and a quick index lookup
  const orderedScenes = [...(scenes || [])].sort(
    (a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0)
  );
  const scenePos = new Map(orderedScenes.map((s, i) => [s.id, i]));

  // Plotlines list with simple coverage
  const plList = document.getElementById('plotlines-list');
  plList.innerHTML = '';
  if (!plotlines.length) {
    plList.innerHTML =
      '<p class="text-secondary text-sm">Nessuna linea narrativa importata.</p>';
  } else {
    plotlines.forEach(pl => {
      const beats = Array.isArray(pl.beats) ? pl.beats : [];
      const totalBeats = beats.length;
      const covered = beats.filter(
        b => Array.isArray(b.sceneIds) && b.sceneIds.length > 0
      ).length;
      const coverage = totalBeats
        ? Math.round((covered / totalBeats) * 100)
        : 0;
      const div = document.createElement('div');
      div.className =
        'bg-primary/50 p-4 rounded-lg border border-white/5 hover:bg-primary transition-colors';
      div.innerHTML = `<div class="font-semibold text-primary flex items-center justify-between mb-1">
                <div class="flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full" style="background-color: ${pl.color || '#22d3ee'}"></span>
                    <span>${pl.name}</span>
                </div>
                <span class="text-[10px] uppercase tracking-wider bg-secondary/50 px-2 py-0.5 rounded text-accent">Copertura: ${coverage}%</span>
            </div>
            <div class="text-sm text-secondary mb-2">${pl.description || ''}</div>
            <div class="w-full bg-secondary/50 rounded-full h-1.5 mt-2">
                <div class="bg-accent h-1.5 rounded-full" style="width: ${coverage}%"></div>
            </div>`;
      plList.appendChild(div);
    });
  }

  // Character balance: conteggio occorrenze (menzioni) + scene con menzione, alias e ranking per ruolo
  const cbody = document.getElementById('character-balance-body');
  cbody.innerHTML = '';
  const sceneTextsRaw = scenes.map(s => `${s.title || ''}\n${s.content || ''}`);
  // Normalizzazione diacritici per matching più robusto
  function normalize(str) {
    return (str || '').normalize('NFD').replace(/\p{Diacritic}+/gu, '');
  }
  const sceneTexts = sceneTextsRaw.map(normalize);

  const ROLE_WEIGHT = {
    protagonista: 10,
    antagonista: 7,
    deuteragonista: 6,
    secondario: 2,
  };

  const STOP_TOKENS = new Set([
    'di',
    'de',
    'del',
    'della',
    'dello',
    'delle',
    'dei',
    'da',
    'dal',
    'dai',
    'dalla',
    'dalle',
    'van',
    'von',
    'la',
    'il',
    'lo',
    'le',
    'gli',
    'i',
    'l',
  ]);

  function buildPatterns(name, aliases = []) {
    const base = (name || '').trim();
    const aliasList = Array.isArray(aliases) ? aliases : [];
    const variants = [base, ...aliasList]
      .map(v => normalize(v))
      .filter(Boolean);
    const n = base;
    if (!n) return [];
    const esc = s => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const tokenize = v =>
      v
        .split(/\s+/)
        .filter(t => t.length >= 3 && !STOP_TOKENS.has(t.toLowerCase()));
    const parts = new Set();
    for (const v of variants) {
      const toks = tokenize(v);
      parts.add(normalize(v));
      toks.forEach(t => parts.add(normalize(t)));
    }
    return Array.from(parts).map(
      p => new RegExp(`(?:^|[^A-Za-z])${esc(p)}(?:[^A-Za-z]|$)`, 'gi')
    );
  }

  const rows = characters
    .map(c => {
      const pats = buildPatterns(c.name, c.aliases || c.aka || []);
      let mentions = 0;
      let scenesWithMention = 0;
      for (const txt of sceneTexts) {
        let foundInScene = false;
        for (const rx of pats) {
          const matches = txt.match(rx);
          if (matches && matches.length) {
            mentions += matches.length;
            foundInScene = true;
          }
        }
        if (foundInScene) scenesWithMention += 1;
      }
      const roleKey = String(c.narrativeRole || c.role || '').toLowerCase();
      const weight = ROLE_WEIGHT[roleKey] || 0;
      const score = mentions + weight; // semplice boost per dare priorità al protagonista
      return { c, mentions, scenesWithMention, score, roleKey };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.mentions - a.mentions ||
        b.scenesWithMention - a.scenesWithMention
    );

  // --- CHART.JS INTEGRAZIONE ---

  // 1. Pacing Chart (Parole per Scena)
  const pacingCtx = document.getElementById('pacing-chart')?.getContext('2d');
  if (pacingCtx) {
    if (charts.pacing) charts.pacing.destroy();

    const sceneLabels = orderedScenes.map(s => s.title || `Scena ${s.order}`);
    const wordCounts = orderedScenes.map(s => wordsCount(s.content));

    charts.pacing = new Chart(pacingCtx, {
      type: 'bar',
      data: {
        labels: sceneLabels,
        datasets: [{
          label: 'Conteggio Parole',
          data: wordCounts,
          backgroundColor: wordCounts.map(wc => wc > 1500 ? '#f87171' : wc > 800 ? '#fbbf24' : '#22d3ee'),
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: true, text: 'Ritmo (Lunghezza Scene)', color: '#94a3b8' }
        },
        scales: {
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#94a3b8' }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8', maxRotation: 45, minRotation: 45 }
          }
        }
      }
    });
  }

  // 2. Character Presence (Line Chart over Scenes)
  const charCtx = document.getElementById('characters-chart')?.getContext('2d');
  if (charCtx) {
    if (charts.presence) charts.presence.destroy();

    // Top 5 characters by mentions
    const topChars = rows.slice(0, 5).map(r => r.c);
    const datasets = topChars.map((char, i) => {
      const pats = buildPatterns(char.name, char.aliases);
      const data = sceneTexts.map(txt => {
        let count = 0;
        pats.forEach(rx => { const m = txt.match(rx); if (m) count += m.length; });
        return count;
      });
      const colors = ['#22d3ee', '#a78bfa', '#34d399', '#f472b6', '#fbbf24'];
      return {
        label: char.name,
        data: data,
        borderColor: colors[i % colors.length],
        backgroundColor: colors[i % colors.length] + '20',
        tension: 0.4,
        fill: true,
        pointRadius: 2
      };
    });

    charts.presence = new Chart(charCtx, {
      type: 'line',
      data: {
        labels: orderedScenes.map((s, i) => `Sc. ${i + 1}`),
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#cbd5e1' } },
          title: { display: true, text: 'Presenza Personaggi per Scena', color: '#94a3b8' }
        },
        scales: {
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#94a3b8' }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8' }
          }
        }
      }
    });
  }


  // Sequenza temporale non vincolante: rileva regressioni di stadio rispetto all'ordine delle scene
  try {
    const stageOrder = [
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
    const stageIndex = Object.fromEntries(stageOrder.map((k, i) => [k, i]));
    const warnings = [];
    let maxStageSoFar = -1;
    for (const s of orderedScenes) {
      const idx = stageIndex[s.stageKey] ?? null;
      if (idx == null) continue;
      if (idx < maxStageSoFar) {
        // possibile regressione: scena torna a uno stadio precedente
        // trova l'ultima scena con stadio maxStageSoFar per suggerimento
        const prev = orderedScenes
          .slice(0, orderedScenes.indexOf(s))
          .reverse()
          .find(p => (stageIndex[p.stageKey] ?? -1) === maxStageSoFar);
        warnings.push({
          scene: s.title || 'Scena',
          from: stageOrder[idx],
          after: prev ? prev.title || 'scena precedente' : 'scena precedente',
          expectedAtLeast: stageOrder[maxStageSoFar],
        });
      }
      if (idx > maxStageSoFar) maxStageSoFar = idx;
    }
    const seqEl = document.getElementById('sequence-check');
    const container = document.createElement('div');
    // Blocco 1: stadi eroe
    const stageBlock = document.createElement('div');
    stageBlock.className = 'mb-3';
    if (warnings.length === 0) {
      stageBlock.innerHTML =
        '<div class="text-secondary">Nessuna anomalia rilevata nella progressione degli stadi.</div>';
    } else {
      const list = document.createElement('ul');
      list.className = 'space-y-1 list-disc pl-5';
      warnings.slice(0, 20).forEach(w => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="text-accent">${w.scene}</span>: torna da <span class="font-semibold">${w.expectedAtLeast}</span> a <span class="font-semibold">${w.from}</span> dopo <span class="text-secondary">${w.after}</span>.`;
        list.appendChild(li);
      });
      stageBlock.appendChild(list);
      if (warnings.length > 20) {
        const more = document.createElement('div');
        more.className = 'text-xs text-secondary mt-2';
        more.textContent = `Altri ${warnings.length - 20} avvisi non mostrati.`;
        stageBlock.appendChild(more);
      }
    }
    container.appendChild(stageBlock);

    // Blocco 2: regressioni per linee narrative (beats)
    const beatOrder = [
      'hook',
      'inciting',
      'plot_point_1',
      'pinch_1',
      'midpoint',
      'pinch_2',
      'plot_point_2',
      'climax',
      'resolution',
    ];
    const beatIndex = Object.fromEntries(beatOrder.map((k, i) => [k, i]));
    const plHeader = document.createElement('div');
    plHeader.className = 'text-secondary mt-2 mb-1';
    plHeader.textContent = 'Controllo per linee narrative:';
    container.appendChild(plHeader);
    const plList = document.createElement('ul');
    plList.className = 'space-y-2 list-disc pl-5';
    (plotlines || []).forEach(pl => {
      const beats = (pl.beats || []).filter(b => beatIndex[b.stage] != null);
      if (beats.length < 2) return; // niente da controllare
      // posizione minima per stage in timeline scene
      const positions = beats
        .map(b => ({
          stage: b.stage,
          idx: Math.min(
            ...(b.sceneIds || [])
              .map(id => scenePos.get(id))
              .filter(n => Number.isInteger(n))
          ),
        }))
        .filter(p => Number.isInteger(p.idx));
      if (positions.length < 2) return;
      // ordina per idx timeline e cerca regressioni nell'ordine dei beat
      positions.sort((a, b) => a.idx - b.idx);
      let maxBeatSoFar = -1;
      const localWarnings = [];
      for (const p of positions) {
        const bIdx = beatIndex[p.stage];
        if (bIdx < maxBeatSoFar) {
          localWarnings.push(p.stage);
        }
        if (bIdx > maxBeatSoFar) maxBeatSoFar = bIdx;
      }
      if (localWarnings.length) {
        const li = document.createElement('li');
        li.innerHTML = `<span class="text-accent">${pl.name}</span>: possibile inversione nell'ordine dei beats → ${localWarnings.map(s => `<span class=\"font-semibold\">${s}</span>`).join(', ')}.`;
        plList.appendChild(li);
      }
    });
    if (plList.children.length === 0) {
      const ok = document.createElement('div');
      ok.className = 'text-secondary';
      ok.textContent = 'Nessuna anomalia per le linee narrative.';
      container.appendChild(ok);
    } else {
      container.appendChild(plList);
    }

    seqEl.innerHTML = '';
    seqEl.appendChild(container);
  } catch { }

  // Plotlines matrix (scene vs plotline presence by keyword)
  try {
    const matrixEl = document.getElementById('plotlines-matrix');
    matrixEl.innerHTML = '';
    if ((plotlines || []).length === 0 || (scenes || []).length === 0) {
      matrixEl.innerHTML = '<p class="text-secondary">Dati insufficienti.</p>';
    } else {
      const tbl = document.createElement('table');
      tbl.className = 'w-full text-xs border-collapse';
      const thead = document.createElement('thead');
      thead.innerHTML = `<tr class="text-secondary border-b border-accent/20">
          <th class="text-left p-3 font-medium bg-secondary/50 sticky left-0 z-10 backdrop-blur-sm">Scena</th>
          ${plotlines.map(pl => `<th class="text-center p-3 font-medium min-w-[100px]" style="color:${pl.color}">${pl.name}</th>`).join('')}
      </tr>`;
      tbl.appendChild(thead);
      const tbody = document.createElement('tbody');

      // Extended Plotline Detection with Keywords
      const pls = plotlines.map(pl => {
        const terms = [pl.name, ...(pl.keywords || [])].filter(Boolean);
        // Create regex that matches any of the terms as whole words
        // sort by length desc to match longest first
        const sortedTerms = terms.sort((a, b) => b.length - a.length);
        const pattern = sortedTerms
          .map(t => t.trim().replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'))
          .join('|');
        return {
          name: pl.name,
          rx: new RegExp(pattern ? `\\b(${pattern})\\b` : pl.name, 'i'),
          color: pl.color,
        };
      });

      scenes.forEach((s, i) => {
        const row = document.createElement('tr');
        row.className =
          'border-b border-white/5 hover:bg-white/5 transition-colors';
        const text = `${s.title || ''} ${s.content || ''}`;

        const tds = pls.map(pl =>
          pl.rx.test(text)
            ? `<div class="w-3 h-3 rounded-full mx-auto shadow-[0_0_8px] shadow-current" style="background-color:${pl.color}; color:${pl.color}"></div>`
            : '<span class="text-white/10 text-[10px]">•</span>'
        );

        row.innerHTML =
          `<td class="p-3 whitespace-nowrap font-medium text-primary sticky left-0 bg-secondary/30 backdrop-blur-sm border-r border-white/5">${s.title || 'Scena ' + (i + 1)}</td>` +
          tds
            .map(v => `<td class="p-3 text-center align-middle">${v}</td>`)
            .join('');
        tbody.appendChild(row);
      });
      tbl.appendChild(tbody);
      matrixEl.appendChild(tbl);
    }
  } catch { }

  // Style profile (if saved into project settings in the future)
  const styleEl = document.getElementById('style-profile');
  styleEl.innerHTML = '';
  // For now, attempt to fetch a project-level idea named "Profilo Stile" as placeholder
  styleEl.innerHTML = `<p class="text-secondary">Profilo stile sarà popolato dall'import IA (voice, pacing, lessico, tono).</p>`;
}

// ─── Hub AI Analysis ───

async function initHubAnalysis() {
  const section     = document.getElementById('hub-analysis-section');
  const btnManuscript   = document.getElementById('hub-analyze-manuscript');
  const btnConsistency  = document.getElementById('hub-analyze-consistency');
  const btnEntities     = document.getElementById('hub-extract-entities');
  const progressWrap    = document.getElementById('hub-analysis-progress');
  const progressLabel   = document.getElementById('hub-analysis-progress-label');
  const progressBar     = document.getElementById('hub-analysis-progress-bar');
  const progressMsg     = document.getElementById('hub-analysis-progress-msg');
  const resultEl        = document.getElementById('hub-analysis-result');

  if (!section) return;

  const hubOk = await HubJobService.isAvailable();
  if (!hubOk) return;
  section.classList.remove('hidden');

  let busy = false;

  function setBusy(b, label) {
    busy = b;
    btnManuscript.disabled = b;
    btnConsistency.disabled = b;
    btnEntities.disabled = b;
    if (b) {
      progressWrap.classList.remove('hidden');
      progressLabel.textContent = label || 'Analisi in corso...';
      progressBar.style.width = '0%';
      progressMsg.textContent = 'In attesa...';
      resultEl.classList.add('hidden');
    } else {
      progressWrap.classList.add('hidden');
    }
    if (window.lucide) window.lucide.createIcons();
  }

  function showResult(content) {
    resultEl.classList.remove('hidden');
    if (typeof content === 'string') {
      resultEl.textContent = content;
    } else {
      resultEl.textContent = JSON.stringify(content, null, 2);
    }
  }

  function onProgress(p) {
    if (p.percent >= 0) progressBar.style.width = `${Math.min(p.percent, 100)}%`;
    progressMsg.textContent = p.message || p.phase || 'Elaborazione...';
  }

  // Analyze Manuscript
  btnManuscript.addEventListener('click', async () => {
    if (busy) return;
    const projectId = await DataManager.getCurrentProjectId();
    if (!projectId) return;

    setBusy(true, 'Analisi manoscritto...');
    try {
      const scenes = await DataManager.getProjectItems(projectId, 'scenes');
      const fullText = scenes
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(s => s.content || '')
        .join('\n\n---\n\n');
      if (!fullText.trim()) throw new Error('Nessun testo nel manoscritto.');

      const result = await HubJobService.analyzeManuscript(projectId, {
        text: fullText.substring(0, 10000),
        analysisDepth: 'standard',
      }, onProgress);

      setBusy(false);
      const artifact = result?.result?.artifact || result?.artifact;
      showResult(artifact || 'Analisi completata (nessun dettaglio restituito).');
    } catch (err) {
      setBusy(false);
      showResult(`Errore: ${err.message}`);
    }
  });

  // Consistency Check
  btnConsistency.addEventListener('click', async () => {
    if (busy) return;
    const projectId = await DataManager.getCurrentProjectId();
    if (!projectId) return;

    setBusy(true, 'Check consistenza...');
    try {
      const scenes = await DataManager.getProjectItems(projectId, 'scenes');
      const sceneData = scenes
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(s => ({ title: s.title, content: (s.content || '').substring(0, 2000) }));
      if (sceneData.length === 0) throw new Error('Nessuna scena da analizzare.');

      const result = await HubJobService.analyzeConsistency(projectId, {
        scenes: sceneData,
        focusAreas: ['characters', 'timeline', 'setting'],
      }, onProgress);

      setBusy(false);
      const artifact = result?.result?.artifact || result?.artifact;
      showResult(artifact || 'Check completato.');
    } catch (err) {
      setBusy(false);
      showResult(`Errore: ${err.message}`);
    }
  });

  // Extract Entities
  btnEntities.addEventListener('click', async () => {
    if (busy) return;
    const projectId = await DataManager.getCurrentProjectId();
    if (!projectId) return;

    setBusy(true, 'Estrazione entità...');
    try {
      const scenes = await DataManager.getProjectItems(projectId, 'scenes');
      const fullText = scenes
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(s => s.content || '')
        .join('\n\n');
      if (!fullText.trim()) throw new Error('Nessun testo da cui estrarre.');

      const result = await HubJobService.extractEntities(projectId, {
        text: fullText.substring(0, 10000),
        entityTypes: ['characters', 'locations', 'objects'],
      }, onProgress);

      setBusy(false);
      const artifact = result?.result?.artifact || result?.artifact;
      showResult(artifact || 'Estrazione completata.');
    } catch (err) {
      setBusy(false);
      showResult(`Errore: ${err.message}`);
    }
  });
}

export default {
  init: function (dataManager, modalLoader) {
    DataManager = dataManager;
    loadModal = modalLoader;
    document
      .getElementById('refresh-analysis')
      ?.addEventListener('click', renderAnalysis);
    document
      .getElementById('open-plotlines')
      ?.addEventListener('click', async () => {
        const plModal = await loadModal('plotline');
        plModal?.open?.();
      });
    document
      .getElementById('import-fixture')
      ?.addEventListener('click', async ev => {
        const btn = ev.currentTarget;
        try {
          let projectId = await DataManager.getCurrentProjectId();
          if (!projectId) {
            const existing = await DataManager.getProjects();
            if (existing && existing.length) {
              projectId = existing[0].id;
              await DataManager.setCurrentProjectId(projectId);
            } else {
              const proj = await DataManager.saveProject({
                title: 'Fixture Test',
              });
              projectId = proj.id;
              await DataManager.setCurrentProjectId(projectId);
            }
          }
          btn.disabled = true;
          const old = btn.textContent;
          btn.textContent = 'Import in corso…';
          toast.info('Import fixture avviato…');
          // fetch robusto con fallback
          let resp = await fetch('/fixtures/test-manuscript.txt');
          if (!resp.ok) {
            resp = await fetch('fixtures/test-manuscript.txt');
          }
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const txt = await resp.text();
          const mod = await import('../modals/import-text.js');
          const summary = await mod.importRawText(DataManager, projectId, txt, {
            mode: 'merge',
            split: true,
            strategy: 'auto',
            minSceneLength: 80,
            extract: false,
            analyzeStyle: false,
          });
          if (summary && summary.scenes >= 1) {
            toast.success(
              `Import riuscito: ${summary.scenes} scene, ${summary.characters} personaggi, ${summary.ideas} idee. Ricalcolo…`
            );
          } else {
            toast.warning?.(
              'Nessuna scena importata: controlla il file di fixture o i parametri.'
            );
          }
          await renderAnalysis();
          btn.textContent = old;
          btn.disabled = false;
        } catch (e) {
          console.error('Fixture import failed', e);
          toast.error('Import fixture fallito. Vedi console.');
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Importa Fixture';
          }
        }
      });
    renderAnalysis();
    initHubAnalysis();
  },
};
