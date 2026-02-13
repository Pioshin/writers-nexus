import { DataManager } from '../../DataManager.js';
import { toast } from '../shared/toast.js';

let modal, form, cancelBtn, saveBtn;
let idInput, nameInput, detailsInput;
let isInitialized = false;

function init() {
  if (isInitialized) return;
  modal = document.getElementById('culture-modal');
  form = document.getElementById('culture-form');
  cancelBtn = document.getElementById('cancel-culture-modal');
  saveBtn = document.getElementById('save-culture-btn');

  idInput = document.getElementById('culture-id');
  nameInput = document.getElementById('cult-name');
  detailsInput = document.getElementById('cult-details');

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
  nameInput.value = item.name || '';
  detailsInput.value = item.details || '';
  modal.classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

function close() {
  modal.classList.add('hidden');
}

async function save() {
  const name = nameInput.value.trim();
  if (!name) {
    toast.error('Il nome è obbligatorio.');
    return;
  }
  const projectId = await DataManager.getCurrentProjectId();
  if (!projectId) {
    toast.error('Nessun progetto selezionato.');
    return;
  }

  const payload = {
    id: idInput.value || undefined,
    name,
    details: detailsInput.value.trim(),
  };

  try {
    await DataManager.saveProjectItem(projectId, 'culture', payload);
    document.dispatchEvent(new CustomEvent('culture-saved'));
    close();
  } catch (error) {
    console.error('Error saving culture:', error);
    toast.error(`Errore: ${error.message}`);
  }
}

export default { init, open, close };
