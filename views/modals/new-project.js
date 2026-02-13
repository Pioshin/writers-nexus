let DataManager;
let modal, form, cancelBtn, titleInput, premiseInput, genreInput, toneInput;
let resolvePromise, rejectPromise;
let currentEditingProjectId = null;
let isInitialized = false;

async function handleFormSubmit(e) {
  e.preventDefault();
  const title = titleInput.value.trim();
  const premise = premiseInput.value.trim();
  const genre = genreInput.value.trim();
  const tone = toneInput.value.trim();

  if (!title) return;

  // Reset previous errors
  const errorEl = document.getElementById('new-project-error');
  errorEl.textContent = '';
  errorEl.classList.add('hidden');

  try {
    const payload = currentEditingProjectId
      ? { id: currentEditingProjectId, title, premise, genre, tone }
      : { title, premise, genre, tone };
    const newProject = await DataManager.saveProject(payload);
    close();
    if (resolvePromise) {
      resolvePromise(newProject);
    }
  } catch (error) {
    errorEl.textContent = error.message;
    errorEl.classList.remove('hidden');
    if (rejectPromise) {
      // We don't reject the promise here because the modal stays open for correction
      // rejectPromise(error);
    }
  }
}

function handleCancel() {
  if (rejectPromise) {
    rejectPromise(new Error('Modal cancelled'));
  }
  close();
}

function open(project = null) {
  form.reset();
  currentEditingProjectId = project && project.id ? project.id : null;

  // Dynamic title and button label
  const titleEl = modal.querySelector('h3');
  const submitBtn = form.querySelector('button[type="submit"]');
  if (currentEditingProjectId) {
    titleEl.textContent = 'Modifica Progetto';
    submitBtn.textContent = 'Salva';
    titleInput.value = project.title || '';
    premiseInput.value = project.premise || '';
    genreInput.value = project.genre || '';
    toneInput.value = project.tone || '';
  } else {
    titleEl.textContent = 'Crea un Nuovo Progetto';
    submitBtn.textContent = 'Crea';
    genreInput.value = '';
    toneInput.value = '';
  }

  modal.classList.remove('hidden');

  return new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
}

function close() {
  modal.classList.add('hidden');
  resolvePromise = null;
  rejectPromise = null;
  currentEditingProjectId = null;
}

function init(dataManager) {
  if (isInitialized) return;
  DataManager = dataManager;

  modal = document.getElementById('new-project-modal');
  form = document.getElementById('new-project-form');
  cancelBtn = document.getElementById('cancel-project-modal');
  titleInput = document.getElementById('new-project-title');
  premiseInput = document.getElementById('new-project-premise');
  genreInput = document.getElementById('new-project-genre');
  toneInput = document.getElementById('new-project-tone');

  form.addEventListener('submit', handleFormSubmit);
  cancelBtn.addEventListener('click', handleCancel);
  isInitialized = true;
}

export default { init, open, close };
