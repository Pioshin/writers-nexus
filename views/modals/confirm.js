let modal, titleEl, messageEl, primaryBtn, secondaryBtn, closeBtn;
let resolver = null;

function init() {
  modal = document.getElementById('confirm-modal');
  titleEl = document.getElementById('confirm-modal-title');
  messageEl = document.getElementById('confirm-modal-message');
  primaryBtn = document.getElementById('confirm-primary-btn');
  secondaryBtn = document.getElementById('confirm-secondary-btn');
  closeBtn = document.getElementById('confirm-modal-close-btn');

  const resolveAndHide = (value) => {
    if (resolver) resolver(value);
    resolver = null;
    hide();
  };

  primaryBtn.addEventListener('click', () => resolveAndHide(true));
  secondaryBtn.addEventListener('click', () => resolveAndHide(false));
  closeBtn.addEventListener('click', () => resolveAndHide(false));
}

function open({ title = 'Conferma', message = 'Sei sicuro?', confirmText = 'Conferma', cancelText = 'Annulla' } = {}) {
  titleEl.textContent = title;
  messageEl.textContent = message;
  primaryBtn.textContent = confirmText;
  secondaryBtn.textContent = cancelText;
  modal.classList.remove('hidden');
  try { lucide.createIcons(); } catch {}
}

function hide() {
  modal.classList.add('hidden');
}

function confirm(message, options = {}) {
  return new Promise(async (resolve) => {
    if (!modal) {
      // Lazy init via dynamic import compatibile con main.loadModal
      try {
        const m = await import('./confirm.js');
        if (m.default && typeof m.default.init === 'function') m.default.init();
      } catch {}
    }
    resolver = resolve;
    open({ message, ...(options || {}) });
  });
}

export default { init, open, hide, confirm };
