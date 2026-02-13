import { DataManager } from '../../DataManager.js';
import { toast } from '../shared/toast.js';

let modal, form, cancelBtn, saveBtn;
let idInput, nameInput, rulesInput, roleInput;
let isInitialized = false;

function init() {
  if (isInitialized) return;
  modal = document.getElementById('system-modal');
  form = document.getElementById('system-form');
  cancelBtn = document.getElementById('cancel-system-modal');
  saveBtn = document.getElementById('save-system-btn');

  idInput = document.getElementById('system-id');
  nameInput = document.getElementById('sys-name');
  rulesInput = document.getElementById('sys-rules');
  roleInput = document.getElementById('sys-role');

  cancelBtn.addEventListener('click', close);
  saveBtn.addEventListener('click', save);
  form.addEventListener('submit', e => {
    e.preventDefault();
    save();
  });

  isInitialized = true;
}

function open(system = {}) {
  form.reset();
  idInput.value = system.id || '';
  nameInput.value = system.name || '';
  rulesInput.value = system.rules || '';
  roleInput.value = system.role || '';
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
    rules: rulesInput.value.trim(),
    role: roleInput.value.trim(),
  };

  try {
    await DataManager.saveProjectItem(projectId, 'systems', payload);
    document.dispatchEvent(new CustomEvent('system-saved'));
    close();
  } catch (error) {
    console.error('Error saving system:', error);
    toast.error(`Errore: ${error.message}`);
  }
}

export default { init, open, close };
