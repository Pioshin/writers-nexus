import { toast } from '../shared/toast.js';
let DataManager, FirebaseSync, loadModal;
let charts = { hero: null, pie: null };

function wordsCount(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

async function renderAnalysis() {
  const projectId = await DataManager.getCurrentProjectId();
  if (!projectId) return;

  const [scenes, characters, plotlines] = await Promise.all([
    DataManager.getProjectItems(projectId, 'scenes'),
    DataManager.getProjectItems(projectId, 'characters'),
    DataManager.getProjectItems(projectId, 'plotlines'),
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
      div.className = 'bg-primary p-3 rounded border border-accent/20';
      div.innerHTML = `<div class="font-semibold text-primary flex items-center justify-between">
                <span>${pl.name}</span>
                <span class="text-xs text-secondary">Copertura beats: ${covered}/${totalBeats} (${coverage}%)</span>
            </div>
            <div class="text-xs text-secondary mt-1">${pl.description || ''}</div>`;
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

  rows.forEach(({ c, mentions, scenesWithMention }) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
            <td class="py-2 pr-2">${c.name}</td>
            <td class="py-2 pr-2">${mentions}</td>
            <td class="py-2 pr-2">${scenesWithMention}</td>
            <td class="py-2 pr-2">${c.narrativeRole || c.role || ''}</td>
            <td class="py-2 pr-2">${c.archetype || ''}</td>`;
    cbody.appendChild(tr);
  });

  // Character distribution pie (share of mentions)
  try {
    const total = rows.reduce((a, b) => a + b.mentions, 0) || 1;
    const labels = rows.map(r => r.c.name);
    const dataVals = rows.map(r => Math.round((r.mentions / total) * 100));
    const ctx = document.getElementById('character-pie').getContext('2d');
    charts.pie?.destroy?.();
    charts.pie = new Chart(ctx, {
      type: 'pie',
      data: {
        labels,
        datasets: [
          {
            data: dataVals,
            backgroundColor: [
              '#22d3ee',
              '#a78bfa',
              '#34d399',
              '#fbbf24',
              '#f472b6',
              '#60a5fa',
              '#f87171',
              '#94a3b8',
            ],
          },
        ],
      },
      options: { plugins: { legend: { position: 'bottom' } } },
    });
  } catch {}

  // Scene metrics
  const sbody = document.getElementById('scene-metrics-body');
  sbody.innerHTML = '';
  scenes
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .forEach(s => {
      const wc = wordsCount(s.content);
      const pace = wc < 200 ? 'Veloce' : wc < 500 ? 'Medio' : 'Lento';
      const tr = document.createElement('tr');
      tr.innerHTML = `
            <td class="py-2 pr-2">${s.title || 'Scena'}</td>
            <td class="py-2 pr-2">${wc}</td>
            <td class="py-2 pr-2">${pace}</td>`;
      sbody.appendChild(tr);
    });

  // Hero Journey gauge: posizione percentuale lungo gli stadi
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
    const stageSeen = new Set(
      (scenes || []).map(s => s.stageKey).filter(Boolean)
    );
    let idx = 0;
    for (let i = stageOrder.length - 1; i >= 0; i--) {
      if (stageSeen.has(stageOrder[i])) {
        idx = i;
        break;
      }
    }
    const progress = Math.round(((idx + 1) / stageOrder.length) * 100);
    const ctxHero = document.getElementById('hero-gauge').getContext('2d');
    charts.hero?.destroy?.();
    charts.hero = new Chart(ctxHero, {
      type: 'doughnut',
      data: {
        labels: ['Progresso', 'Resto'],
        datasets: [
          {
            data: [progress, 100 - progress],
            backgroundColor: ['#22d3ee', '#1f2937'],
          },
        ],
      },
      options: {
        circumference: 180,
        rotation: -90,
        cutout: '70%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
    });
    const legend = document.getElementById('hero-gauge-legend');
    legend.innerHTML = `<span class="text-secondary">Stadio corrente:</span> <span class="font-semibold">${stageOrder[idx]}</span> — ${progress}%`;
  } catch {}

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
  } catch {}

  // Plotlines matrix (scene vs plotline presence by keyword)
  try {
    const matrixEl = document.getElementById('plotlines-matrix');
    matrixEl.innerHTML = '';
    if ((plotlines || []).length === 0 || (scenes || []).length === 0) {
      matrixEl.innerHTML = '<p class="text-secondary">Dati insufficienti.</p>';
    } else {
      const tbl = document.createElement('table');
      tbl.className = 'w-full text-xs';
      const thead = document.createElement('thead');
      thead.innerHTML = `<tr class="text-secondary border-b border-accent/20"><th class="text-left p-2">Scena</th>${plotlines.map(pl => `<th class="text-left p-2">${pl.name}</th>`).join('')}</tr>`;
      tbl.appendChild(thead);
      const tbody = document.createElement('tbody');
      const pls = plotlines.map(pl => ({
        name: pl.name,
        rx: new RegExp(pl.name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i'),
      }));
      scenes.forEach((s, i) => {
        const row = document.createElement('tr');
        const text = `${s.title || ''} ${s.content || ''}`;
        const tds = pls.map(pl =>
          pls.length > 20 ? '' : pl.rx.test(text) ? '●' : ''
        );
        row.innerHTML =
          `<td class="p-2 whitespace-nowrap">${s.title || 'Scena ' + (i + 1)}</td>` +
          tds.map(v => `<td class="p-2 text-center">${v}</td>`).join('');
        tbody.appendChild(row);
      });
      tbl.appendChild(tbody);
      matrixEl.appendChild(tbl);
    }
  } catch {}

  // Style profile (if saved into project settings in the future)
  const styleEl = document.getElementById('style-profile');
  styleEl.innerHTML = '';
  // For now, attempt to fetch a project-level idea named "Profilo Stile" as placeholder
  styleEl.innerHTML = `<p class="text-secondary">Profilo stile sarà popolato dall'import IA (voice, pacing, lessico, tono).</p>`;
}

export default {
  init: function (dataManager, firebaseSync, modalLoader) {
    DataManager = dataManager;
    FirebaseSync = firebaseSync;
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
  },
};
