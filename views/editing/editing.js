import { HubJobService } from '../../ai/HubJobService.js';

let DataManager, loadModal;
let currentSceneId = null;
let currentSceneText = '';
let _activeJobId = null;

// ─── DOM cache ───
const el = {};

function $(id) { return document.getElementById(id); }

function cacheElements() {
  el.sceneSelect   = $('editing-scene-select');
  el.sceneTitle    = $('editing-scene-title');
  el.originalText  = $('editing-original-text');
  el.wordCount     = $('editing-word-count');
  el.charCount     = $('editing-char-count');
  el.hubToolbar    = $('editing-hub-toolbar');
  el.hubDot        = $('editing-hub-dot');
  el.hubLabel      = $('editing-hub-label');
  el.btnRevise     = $('editing-btn-revise');
  el.btnRewrite    = $('editing-btn-rewrite');
  el.btnCancel     = $('editing-btn-cancel');
  el.instructions  = $('editing-instructions');
  el.focusAreas    = $('editing-focus-areas');
  el.progressWrap  = $('editing-progress-wrap');
  el.progressLabel = $('editing-progress-label');
  el.progressBar   = $('editing-progress-bar');
  el.progressMsg   = $('editing-progress-msg');
  el.resultPane    = $('editing-result-pane');
  el.resultText    = $('editing-result-text');
  el.resultWordCnt = $('editing-result-word-count');
  el.qualityFlags  = $('editing-quality-flags');
  el.btnApply      = $('editing-btn-apply');
  el.btnDiscard    = $('editing-btn-discard');
}

// ─── Hub availability ───

async function checkHub() {
  try {
    const ok = await HubJobService.isAvailable();
    if (ok) {
      el.hubDot.className = 'w-2 h-2 rounded-full bg-green-500 inline-block';
      el.hubLabel.textContent = 'Hub online';
      el.hubToolbar.classList.remove('hidden');
      updateButtonState();
    } else {
      hubOffline();
    }
  } catch {
    hubOffline();
  }
}

function hubOffline() {
  el.hubDot.className = 'w-2 h-2 rounded-full bg-zinc-500 inline-block';
  el.hubLabel.textContent = 'Hub offline';
  el.hubToolbar.classList.add('hidden');
}

// ─── Scene loading ───

async function populateScenes() {
  const projectId = await DataManager.getCurrentProjectId();
  if (!projectId) {
    el.sceneSelect.innerHTML = '<option value="">— Nessun progetto attivo —</option>';
    return;
  }
  const scenes = await DataManager.getProjectItems(projectId, 'scenes');
  scenes.sort((a, b) => (a.order || 0) - (b.order || 0));
  el.sceneSelect.innerHTML = '<option value="">— Seleziona scena —</option>';
  scenes.forEach((s, i) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${i + 1}. ${s.title || 'Senza titolo'}`;
    el.sceneSelect.appendChild(opt);
  });

  // Pre-select current scene if any
  const curId = await DataManager.getCurrentSceneId?.();
  if (curId) {
    el.sceneSelect.value = curId;
    await loadScene(curId);
  }
}

async function loadScene(sceneId) {
  if (!sceneId) {
    currentSceneId = null;
    currentSceneText = '';
    el.originalText.innerHTML = '<p class="text-secondary italic">Seleziona una scena dal menu in alto per iniziare l\'editing.</p>';
    el.sceneTitle.textContent = '';
    updateCounts(el.wordCount, el.charCount, '');
    updateButtonState();
    hideResult();
    return;
  }
  const scene = await DataManager.getScene(sceneId);
  if (!scene) return;
  currentSceneId = sceneId;
  currentSceneText = scene.content || '';
  el.sceneTitle.textContent = scene.title || 'Senza titolo';
  el.originalText.textContent = currentSceneText || '(scena vuota)';
  updateCounts(el.wordCount, el.charCount, currentSceneText);
  updateButtonState();
  hideResult();
}

// ─── Counts ───

function countWords(text) {
  const m = (text || '').trim().match(/\S+/g);
  return m ? m.length : 0;
}

function updateCounts(wordEl, charEl, text) {
  wordEl.textContent = countWords(text);
  charEl.textContent = (text || '').length;
}

function updateButtonState() {
  const hasText = currentSceneText.trim().length > 0;
  const busy = !!_activeJobId;
  el.btnRevise.disabled = !hasText || busy;
  el.btnRewrite.disabled = !hasText || busy;
}

// ─── Hub Jobs ───

async function executeHubJob(taskType) {
  const projectId = await DataManager.getCurrentProjectId();
  if (!projectId || !currentSceneText.trim()) return;

  _activeJobId = 'pending';
  showProgress(taskType === 'revise.chapter' ? 'Revisione in corso...' : 'Riscrittura in corso...');
  updateButtonState();
  el.btnCancel.classList.remove('hidden');
  hideResult();

  const userInstructions = (el.instructions.value || '').trim();
  const focus = el.focusAreas.value;

  let payload;
  if (taskType === 'revise.chapter') {
    const focusAreas = focus === 'all'
      ? ['style', 'pacing', 'coherence']
      : [focus];
    payload = {
      text: currentSceneText,
      instructions: userInstructions || 'Migliora stile, coerenza e ritmo mantenendo la voce narrativa.',
      focusAreas,
    };
  } else {
    // rewrite.section
    payload = {
      text: currentSceneText.substring(0, 4000),
      instructions: userInstructions || 'Riscrivi migliorando la prosa e l\'impatto narrativo.',
      style: 'literary',
    };
  }

  try {
    const result = await HubJobService.submitJob('KRONK', taskType, projectId, payload, {
      onProgress: (p) => {
        updateProgress(p.percent, p.message || p.phase || 'Elaborazione...');
      },
    });

    hideProgress();
    el.btnCancel.classList.add('hidden');
    _activeJobId = null;
    updateButtonState();
    showResult(result, taskType);
  } catch (err) {
    hideProgress();
    el.btnCancel.classList.add('hidden');
    _activeJobId = null;
    updateButtonState();
    showError(err.message);
  }
}

function cancelCurrentJob() {
  if (_activeJobId) {
    HubJobService.cancelJob(_activeJobId);
    _activeJobId = null;
    hideProgress();
    el.btnCancel.classList.add('hidden');
    updateButtonState();
  }
}

// ─── Progress ───

function showProgress(label) {
  el.progressWrap.classList.remove('hidden');
  el.progressLabel.textContent = label;
  el.progressBar.style.width = '0%';
  el.progressMsg.textContent = 'In attesa...';
}

function updateProgress(percent, message) {
  if (percent >= 0) el.progressBar.style.width = `${Math.min(percent, 100)}%`;
  el.progressMsg.textContent = message;
}

function hideProgress() {
  el.progressWrap.classList.add('hidden');
}

// ─── Result display ───

function showResult(jobResource, taskType) {
  const result = jobResource.result || jobResource;
  const artifact = result?.artifact;
  const text = typeof artifact === 'string'
    ? artifact
    : artifact?.text || artifact?.content || '';

  if (!text) {
    showError('Job completato, ma nessun testo restituito.');
    return;
  }

  el.resultPane.classList.remove('hidden');
  el.resultText.textContent = text;
  updateCounts(el.resultWordCnt, { textContent: '' }, text);

  const flags = result?.qualityFlags;
  if (flags && Object.keys(flags).length > 0) {
    el.qualityFlags.textContent = Object.entries(flags).map(([k, v]) => `${k}: ${v}`).join(' | ');
  } else {
    el.qualityFlags.textContent = '';
  }
}

function showError(msg) {
  el.resultPane.classList.remove('hidden');
  el.resultText.innerHTML = `<p class="text-red-400">${escapeHtml(msg)}</p>`;
  el.resultWordCnt.textContent = '0';
  el.qualityFlags.textContent = '';
}

function hideResult() {
  el.resultPane.classList.add('hidden');
  el.resultText.textContent = '';
}

async function applyResult() {
  if (!currentSceneId) return;
  const newText = el.resultText.textContent;
  if (!newText.trim()) return;

  const scene = await DataManager.getScene(currentSceneId);
  if (!scene) return;

  const blocks = [{ type: 'text', content: newText }];
  const merged = { ...scene, blocks, content: newText };
  await DataManager.saveScene(merged);

  // Reload scene in editor
  currentSceneText = newText;
  el.originalText.textContent = newText;
  updateCounts(el.wordCount, el.charCount, newText);
  hideResult();
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Init ───

export default {
  init: function (dataManager, modalLoader) {
    DataManager = dataManager;
    loadModal = modalLoader;

    cacheElements();

    el.sceneSelect.addEventListener('change', () => loadScene(el.sceneSelect.value));
    el.btnRevise.addEventListener('click', () => executeHubJob('revise.chapter'));
    el.btnRewrite.addEventListener('click', () => executeHubJob('rewrite.section'));
    el.btnCancel.addEventListener('click', cancelCurrentJob);
    el.btnApply.addEventListener('click', applyResult);
    el.btnDiscard.addEventListener('click', hideResult);

    populateScenes();
    checkHub();
  },
};
