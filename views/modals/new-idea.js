import { DataManager } from '../../DataManager.js';
import { toast } from '../shared/toast.js';

let modal, form, cancelBtn, contentInput;
let currentEditingIdeaId = null;

function init() {
  modal = document.getElementById('new-idea-modal');
  form = document.getElementById('new-idea-form');
  cancelBtn = document.getElementById('cancel-idea-modal');
  contentInput = document.getElementById('new-idea-content');

  cancelBtn.addEventListener('click', close);
  form.addEventListener('submit', save);
}

function open(idea = null) {
  form.reset();
  currentEditingIdeaId = idea && idea.id ? idea.id : null;
  if (idea && idea.content) contentInput.value = idea.content;
  modal.classList.remove('hidden');
}

function close() {
  modal.classList.add('hidden');
  currentEditingIdeaId = null;
}

async function save(e) {
  e.preventDefault();
  const content = contentInput.value.trim();
  if (!content) return;

  const currentProjectId = await DataManager.getCurrentProjectId();
  if (!currentProjectId) {
    toast.error('Nessun progetto selezionato.');
    return;
  }

  const payload = currentEditingIdeaId
    ? { id: currentEditingIdeaId, content }
    : { content };
  await DataManager.saveProjectItem(currentProjectId, 'ideas', payload);

  document.dispatchEvent(new CustomEvent('idea-saved'));

  close();
}

export default { init, open, close };
