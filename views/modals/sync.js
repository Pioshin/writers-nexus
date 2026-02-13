let modal,
  titleEl,
  messageEl,
  closeBtn,
  primaryBtn,
  secondaryBtn,
  loadingIndicator,
  actionsContainer;
let primaryAction = null;
let secondaryAction = null;
let isInitialized = false;

function init() {
  if (isInitialized) return;
  modal = document.getElementById('sync-modal');
  titleEl = document.getElementById('sync-modal-title');
  messageEl = document.getElementById('sync-modal-message');
  closeBtn = document.getElementById('sync-modal-close-btn');
  primaryBtn = document.getElementById('sync-action-primary-btn');
  secondaryBtn = document.getElementById('sync-action-secondary-btn');
  loadingIndicator = document.getElementById('sync-loading-indicator');
  actionsContainer = document.getElementById('sync-modal-actions');

  closeBtn.addEventListener('click', hide);
  secondaryBtn.addEventListener('click', () => {
    if (secondaryAction) secondaryAction();
    hide();
  });
  primaryBtn.addEventListener('click', () => {
    if (primaryAction) primaryAction();
    // Non nascondere automaticamente, l'azione primaria potrebbe avere un suo feedback
  });
  isInitialized = true;
}

function show({
  title = 'Sincronizzazione',
  message = '',
  isLoading = false,
  primaryBtnText = null,
  onPrimary = null,
  secondaryBtnText = 'Chiudi',
  onSecondary = null,
} = {}) {
  titleEl.textContent = title;
  messageEl.textContent = message;
  primaryAction = onPrimary;
  secondaryAction = onSecondary;

  if (isLoading) {
    messageEl.classList.add('hidden');
    actionsContainer.classList.add('hidden');
    loadingIndicator.classList.remove('hidden');
    loadingIndicator.classList.add('flex');
  } else {
    messageEl.classList.remove('hidden');
    loadingIndicator.classList.add('hidden');
    loadingIndicator.classList.remove('flex');
    actionsContainer.classList.remove('hidden');
  }

  if (primaryBtnText && onPrimary) {
    primaryBtn.textContent = primaryBtnText;
    primaryBtn.classList.remove('hidden');
  } else {
    primaryBtn.classList.add('hidden');
  }

  secondaryBtn.textContent = secondaryBtnText;

  modal.classList.remove('hidden');
  lucide.createIcons();
}

function hide() {
  modal.classList.add('hidden');
  primaryAction = null;
  secondaryAction = null;
}

export default { init, show, hide };
