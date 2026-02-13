import { DataManager } from '../../DataManager.js';
import { toast } from '../shared/toast.js';

let modal, form, cancelBtn, saveBtn;
let idInput, nameInput, descriptionInput, historyInput, roleInput;
let isInitialized = false;

function init() {
  if (isInitialized) return;
  modal = document.getElementById('location-modal');
  form = document.getElementById('location-form');
  cancelBtn = document.getElementById('cancel-location-modal');
  saveBtn = document.getElementById('save-location-btn');

  idInput = document.getElementById('location-id');
  nameInput = document.getElementById('loc-name');
  descriptionInput = document.getElementById('loc-description');
  historyInput = document.getElementById('loc-history');
  roleInput = document.getElementById('loc-role');

  cancelBtn.addEventListener('click', close);
  saveBtn.addEventListener('click', save);
  form.addEventListener('submit', e => {
    e.preventDefault();
    save();
  });

  isInitialized = true;
}

function open(location = {}) {
  form.reset();
  idInput.value = location.id || '';
  nameInput.value = location.name || '';
  descriptionInput.value = location.description || '';
  historyInput.value = location.history || '';
  roleInput.value = location.role || '';
  modal.classList.remove('hidden');
  if (window.lucide) window.lucide.createIcons();
}

function close() {
  modal.classList.add('hidden');
}

async function save() {
  const data = {
    id: idInput.value || undefined,
    name: nameInput.value.trim(),
    description: descriptionInput.value.trim(),
    history: historyInput.value.trim(),
    role: roleInput.value.trim(),
  };

  if (!data.name) {
    toast.error('Il nome del luogo è obbligatorio.');
    return;
  }

  const projectId = await DataManager.getCurrentProjectId();
  if (!projectId) {
    toast.error('Nessun progetto selezionato.');
    return;
  }

  try {
    await DataManager.saveProjectItem(projectId, 'locations', data);
    document.dispatchEvent(new CustomEvent('location-saved'));
    close();
  } catch (error) {
    console.error('Error saving location:', error);
    toast.error(`Errore: ${error.message}`);
  }
}

export default { init, open, close };
