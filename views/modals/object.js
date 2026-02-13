import { DataManager } from '../../DataManager.js';
import { toast } from '../shared/toast.js';

let modal, form, cancelBtn, saveBtn;
let idInput, nameInput, descriptionInput, importanceInput;
let isInitialized = false;

function init() {
  if (isInitialized) return;
  modal = document.getElementById('object-modal');
  form = document.getElementById('object-form');
  cancelBtn = document.getElementById('cancel-object-modal');
  saveBtn = document.getElementById('save-object-btn');

  idInput = document.getElementById('object-id');
  nameInput = document.getElementById('obj-name');
  descriptionInput = document.getElementById('obj-description');
  importanceInput = document.getElementById('obj-importance');

  cancelBtn.addEventListener('click', close);
  saveBtn.addEventListener('click', save);
  form.addEventListener('submit', e => {
    e.preventDefault();
    save();
  });

  isInitialized = true;
}

function open(obj = {}) {
  form.reset();
  idInput.value = obj.id || '';
  nameInput.value = obj.name || '';
  descriptionInput.value = obj.description || '';
  importanceInput.value = obj.importance || '';
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
    description: descriptionInput.value.trim(),
    importance: importanceInput.value.trim(),
  };

  try {
    await DataManager.saveProjectItem(projectId, 'objects', payload);
    document.dispatchEvent(new CustomEvent('object-saved'));
    close();
  } catch (error) {
    console.error('Error saving object:', error);
    toast.error(`Errore: ${error.message}`);
  }
}

export default { init, open, close };
