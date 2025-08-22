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
        DataManager.getProjectItems(projectId, 'plotlines')
    ]);

    // Plotlines list
    const plList = document.getElementById('plotlines-list');
    plList.innerHTML = '';
    if (!plotlines.length) {
        plList.innerHTML = '<p class="text-secondary text-sm">Nessuna linea narrativa importata.</p>';
    } else {
        plotlines.forEach(pl => {
            const div = document.createElement('div');
            div.className = 'bg-primary p-3 rounded border border-accent/20';
            div.innerHTML = `<div class="font-semibold text-primary">${pl.name}</div><div class="text-xs text-secondary">${pl.description || ''}</div>`;
            plList.appendChild(div);
        });
    }

    // Character balance: count scenes that mention character name (heuristic)
    const cbody = document.getElementById('character-balance-body');
    cbody.innerHTML = '';
    const sceneTexts = scenes.map(s => `${s.title || ''}\n${s.content || ''}`.toLowerCase());
    const rows = characters.map(c => {
        const name = (c.name || '').trim();
        const rx = new RegExp(`(?:^|[^A-Za-zÀ-ÖØ-öø-ÿ])${name.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')}(?:[^A-Za-zÀ-ÖØ-öø-ÿ]|$)`, 'i');
        const count = sceneTexts.reduce((acc, t) => acc + (rx.test(t) ? 1 : 0), 0);
        return { c, count };
    }).sort((a,b)=>b.count-a.count);
    rows.forEach(({ c, count }) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="py-2 pr-2">${c.name}</td>
            <td class="py-2 pr-2">${count}</td>
            <td class="py-2 pr-2">${c.narrativeRole || c.role || ''}</td>
            <td class="py-2 pr-2">${c.archetype || ''}</td>`;
        cbody.appendChild(tr);
    });

    // Character distribution pie (share of mentions)
    try {
        const total = rows.reduce((a,b)=>a+b.count,0) || 1;
        const labels = rows.map(r=>r.c.name);
        const dataVals = rows.map(r=> Math.round((r.count/total)*100));
        const ctx = document.getElementById('character-pie').getContext('2d');
        charts.pie?.destroy?.();
        charts.pie = new Chart(ctx, {
            type: 'pie',
            data: {
                labels,
                datasets: [{ data: dataVals, backgroundColor: ['#22d3ee','#a78bfa','#34d399','#fbbf24','#f472b6','#60a5fa','#f87171','#94a3b8'] }]
            },
            options: { plugins: { legend: { position: 'bottom' } } }
        });
    } catch {}

    // Scene metrics
    const sbody = document.getElementById('scene-metrics-body');
    sbody.innerHTML = '';
    scenes.sort((a,b)=>(a.order||0)-(b.order||0)).forEach(s => {
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
        const stageOrder = ['ordinary_world','call_to_adventure','refusal_of_call','meeting_mentor','crossing_threshold','tests_allies_enemies','inmost_cave','ordeal','reward','road_back','resurrection','return_with_elixir'];
        const stageSeen = new Set((scenes||[]).map(s=>s.stageKey).filter(Boolean));
        let idx = 0; for (let i=stageOrder.length-1;i>=0;i--) { if (stageSeen.has(stageOrder[i])) { idx = i; break; } }
        const progress = Math.round(((idx+1)/stageOrder.length)*100);
        const ctxHero = document.getElementById('hero-gauge').getContext('2d');
        charts.hero?.destroy?.();
        charts.hero = new Chart(ctxHero, {
            type: 'doughnut',
            data: { labels: ['Progresso','Resto'], datasets: [{ data: [progress, 100-progress], backgroundColor: ['#22d3ee','#1f2937'] }] },
            options: { circumference: 180, rotation: -90, cutout: '70%', plugins: { legend: { display: false }, tooltip: { enabled: false } } }
        });
        const legend = document.getElementById('hero-gauge-legend');
        legend.innerHTML = `<span class="text-secondary">Stadio corrente:</span> <span class="font-semibold">${stageOrder[idx]}</span> — ${progress}%`;
    } catch {}

    // Plotlines matrix (scene vs plotline presence by keyword)
    try {
        const matrixEl = document.getElementById('plotlines-matrix');
        matrixEl.innerHTML = '';
        if ((plotlines||[]).length === 0 || (scenes||[]).length === 0) {
            matrixEl.innerHTML = '<p class="text-secondary">Dati insufficienti.</p>';
        } else {
            const tbl = document.createElement('table');
            tbl.className = 'w-full text-xs';
            const thead = document.createElement('thead');
            thead.innerHTML = `<tr class="text-secondary border-b border-accent/20"><th class="text-left p-2">Scena</th>${plotlines.map(pl=>`<th class="text-left p-2">${pl.name}</th>`).join('')}</tr>`;
            tbl.appendChild(thead);
            const tbody = document.createElement('tbody');
            const pls = plotlines.map(pl => ({ name: pl.name, rx: new RegExp(pl.name.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&'),'i') }));
            scenes.forEach((s,i) => {
                const row = document.createElement('tr');
                const text = `${s.title||''} ${s.content||''}`;
                const tds = pls.map(pl => pls.length>20 ? '' : (pl.rx.test(text) ? '●' : ''));
                row.innerHTML = `<td class="p-2 whitespace-nowrap">${s.title||'Scena '+(i+1)}</td>` + tds.map(v=>`<td class="p-2 text-center">${v}</td>`).join('');
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
    init: function(dataManager, firebaseSync, modalLoader) {
        DataManager = dataManager;
        FirebaseSync = firebaseSync;
        loadModal = modalLoader;
        document.getElementById('refresh-analysis')?.addEventListener('click', renderAnalysis);
        renderAnalysis();
    }
};
