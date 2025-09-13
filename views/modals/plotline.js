import { DataManager } from '../../DataManager.js';
import { toast } from '../shared/toast.js';

let modal, listEl, form, idEl, nameEl, typeEl, colorEl, statusEl, loglineEl, descriptionEl, beatsEl;
let saveBtn, cancelBtn, newBtn, addBeatBtn, deleteBtn;
let currentProjectId;

function beatRowTemplate(beat) {
  const id = beat.id || `beat-${Math.random().toString(36).slice(2,9)}`;
  const stage = beat.stage || '';
  const title = beat.title || '';
  const summary = beat.summary || '';
  const sceneIds = Array.isArray(beat.sceneIds) ? beat.sceneIds.join(',') : '';
  return `<div class="p-3 bg-primary border border-accent/30 rounded beat-row" data-id="${id}">
    <div class="grid grid-cols-1 md:grid-cols-6 gap-2 items-start">
      <div class="md:col-span-2">
        <label class="text-xs text-secondary">Titolo beat</label>
        <input type="text" class="beat-title w-full mt-1 px-2 py-1 bg-secondary border border-accent/20 rounded" value="${title}">
      </div>
      <div>
        <label class="text-xs text-secondary">Stage</label>
        <select class="beat-stage w-full mt-1 px-2 py-1 bg-secondary border border-accent/20 rounded">
          <option value="">—</option>
          <option value="hook" ${stage==='hook'?'selected':''}>Hook</option>
          <option value="inciting" ${stage==='inciting'?'selected':''}>Inciting</option>
          <option value="plot_point_1" ${stage==='plot_point_1'?'selected':''}>First Plot Point</option>
          <option value="pinch_1" ${stage==='pinch_1'?'selected':''}>First Pinch</option>
          <option value="midpoint" ${stage==='midpoint'?'selected':''}>Midpoint</option>
          <option value="pinch_2" ${stage==='pinch_2'?'selected':''}>Second Pinch</option>
          <option value="plot_point_2" ${stage==='plot_point_2'?'selected':''}>Second Plot Point</option>
          <option value="climax" ${stage==='climax'?'selected':''}>Climax</option>
          <option value="resolution" ${stage==='resolution'?'selected':''}>Resolution</option>
        </select>
      </div>
      <div class="md:col-span-2">
        <label class="text-xs text-secondary">Sintesi</label>
        <input type="text" class="beat-summary w-full mt-1 px-2 py-1 bg-secondary border border-accent/20 rounded" value="${summary}">
      </div>
      <div>
        <label class="text-xs text-secondary">Scene (ids, csv)</label>
        <input type="text" class="beat-scenes w-full mt-1 px-2 py-1 bg-secondary border border-accent/20 rounded" value="${sceneIds}" placeholder="scene-...,scene-...">
      </div>
    </div>
    <div class="flex justify-end mt-2">
      <button type="button" class="beat-del-btn text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded border border-red-500/40">Rimuovi</button>
    </div>
  </div>`;
}

async function loadList() {
  listEl.innerHTML = '';
  const projectId = await DataManager.getCurrentProjectId();
  currentProjectId = projectId;
  const items = await DataManager.getProjectItems(projectId, 'plotlines');
  if (!items || items.length === 0) {
    listEl.innerHTML = '<p class="text-xs text-secondary p-2">Nessuna linea.</p>';
    return;
  }
  items.forEach(pl => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between px-3 py-2 hover:bg-secondary border-b border-accent/10';
    const left = document.createElement('button');
    left.className = 'flex-1 text-left';
    left.innerHTML = `<span class="inline-block w-3 h-3 rounded mr-2" style="background:${pl.color||'#22d3ee'}"></span>${pl.name}`;
    left.addEventListener('click', () => fillForm(pl));
    const del = document.createElement('button');
    del.className = 'text-xs px-2 py-1 bg-red-500/20 text-red-300 rounded border border-red-500/40 ml-2';
    del.textContent = 'Elimina';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await window.appConfirm(`Eliminare la linea "${pl.name}"?`, { title: 'Conferma eliminazione', confirmText: 'Elimina' });
      if (!ok) return;
      await DataManager.deleteProjectItem('plotlines', pl.id);
      // se stiamo visualizzando questa linea, reset
      if (idEl.value === pl.id) newPlotline();
      await loadList();
      toast.success('Linea eliminata');
    });
    row.appendChild(left);
    row.appendChild(del);
    listEl.appendChild(row);
  });
}

function newPlotline() {
  fillForm({ id: '', name: '', type: 'subplot', color: '#22d3ee', status: 'active', logline: '', description: '', beats: [] });
}

function fillForm(pl) {
  idEl.value = pl.id || '';
  nameEl.value = pl.name || '';
  typeEl.value = pl.type || 'subplot';
  colorEl.value = pl.color || '#22d3ee';
  statusEl.value = pl.status || 'active';
  loglineEl.value = pl.logline || '';
  descriptionEl.value = pl.description || '';
  beatsEl.innerHTML = '';
  (pl.beats || []).forEach(b => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = beatRowTemplate(b);
    beatsEl.appendChild(wrapper.firstChild);
  });
}

function addBeat() {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = beatRowTemplate({});
  beatsEl.appendChild(wrapper.firstChild);
}

function collectBeats() {
  const rows = Array.from(beatsEl.querySelectorAll('.beat-row'));
  return rows.map(r => ({
    id: r.dataset.id,
    title: r.querySelector('.beat-title').value.trim(),
    stage: r.querySelector('.beat-stage').value,
    summary: r.querySelector('.beat-summary').value.trim(),
    sceneIds: r.querySelector('.beat-scenes').value.split(',').map(s => s.trim()).filter(Boolean)
  }));
}

async function save() {
  const name = nameEl.value.trim();
  if (!name) { toast.error('Titolo linea obbligatorio.'); return; }
  const pl = {
    id: idEl.value || undefined,
    projectId: currentProjectId,
    name,
    type: typeEl.value,
    color: colorEl.value || '#22d3ee',
    status: statusEl.value,
    logline: loglineEl.value.trim(),
    description: descriptionEl.value.trim(),
    beats: collectBeats()
  };
  const saved = await DataManager.saveProjectItem(currentProjectId, 'plotlines', pl);
  fillForm(saved);
  await loadList();
  toast.success('Linea salvata.');
}

async function remove() {
  const id = idEl.value;
  if (!id) { toast.error('Seleziona una linea da eliminare.'); return; }
  const ok = await window.appConfirm('Eliminare questa linea narrativa?', { title: 'Conferma', confirmText: 'Elimina' });
  if (!ok) return;
  await DataManager.deleteProjectItem('plotlines', id);
  newPlotline();
  await loadList();
}

function bindBeatDeletes() {
  beatsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.beat-del-btn');
    if (!btn) return;
    btn.closest('.beat-row')?.remove();
  });
}

function init() {
  modal = document.getElementById('plotline-modal');
  listEl = document.getElementById('pl-list');
  form = document.getElementById('pl-form');
  idEl = document.getElementById('pl-id');
  nameEl = document.getElementById('pl-name');
  typeEl = document.getElementById('pl-type');
  colorEl = document.getElementById('pl-color');
  statusEl = document.getElementById('pl-status');
  loglineEl = document.getElementById('pl-logline');
  descriptionEl = document.getElementById('pl-description');
  beatsEl = document.getElementById('pl-beats');
  saveBtn = document.getElementById('pl-save-btn');
  cancelBtn = document.getElementById('pl-cancel-btn');
  newBtn = document.getElementById('pl-new-btn');
  addBeatBtn = document.getElementById('pl-add-beat');
  deleteBtn = document.getElementById('pl-delete-btn');

  cancelBtn.addEventListener('click', hide);
  saveBtn.addEventListener('click', save);
  newBtn.addEventListener('click', newPlotline);
  addBeatBtn.addEventListener('click', addBeat);
  deleteBtn.addEventListener('click', remove);
  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
  bindBeatDeletes();

  loadList();
}

function open() {
  modal.classList.remove('hidden');
}

function hide() {
  modal.classList.add('hidden');
}

export default { init, open, hide };
