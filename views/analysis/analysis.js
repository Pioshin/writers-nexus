let DataManager, FirebaseSync, loadModal;

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
