import { DataManager } from '../../DataManager.js';
import { toast } from '../shared/toast.js';

let modal, form, cancelBtn, saveBtn;
let idInput, titleInput, narrationInput;
let isInitialized = false;

function init() {
  if (isInitialized) return;
  modal = document.getElementById('history-modal');
  form = document.getElementById('history-form');
  cancelBtn = document.getElementById('cancel-history-modal');
  saveBtn = document.getElementById('save-history-btn');

  idInput = document.getElementById('history-id');
  titleInput = document.getElementById('hist-title');
  narrationInput = document.getElementById('hist-narration');

  cancelBtn.addEventListener('click', close);
  saveBtn.addEventListener('click', save);
  form.addEventListener('submit', e => {
    e.preventDefault();
    save();
  });

  isInitialized = true;
}

function open(item = {}) {
  form.reset();
  idInput.value = item.id || '';
  titleInput.value = item.title || '';
  narrationInput.value = item.narration || '';
  modal.classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

function close() {
  modal.classList.add('hidden');
}

async function save() {
  const title = titleInput.value.trim();
  if (!title) {
    toast.error('Il titolo è obbligatorio.');
    return;
  }
  const projectId = await DataManager.getCurrentProjectId();
  if (!projectId) {
    toast.error('Nessun progetto selezionato.');
    return;
  }

  const payload = {
    id: idInput.value || undefined,
    title,
    narration: narrationInput.value.trim(),
  };

  try {
    await DataManager.saveProjectItem(projectId, 'history', payload);
    document.dispatchEvent(new CustomEvent('history-saved'));
    close();
  } catch (error) {
    console.error('Error saving history:', error);
    toast.error(`Errore: ${error.message}`);
  }
}

export default { init, open, close };
