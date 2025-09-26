let modal, titleEl, messageEl, primaryBtn, secondaryBtn, closeBtn;
let resolver = null;
let lastFocused = null;
let trapCleanup = null;

function trapFocus(container) {
  const FOCUSABLE =
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const nodes = Array.from(container.querySelectorAll(FOCUSABLE)).filter(
    el => !el.disabled && el.offsetParent !== null
  );
  if (!nodes.length) return () => {};
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  function handle(e) {
    if (e.key === 'Tab') {
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    } else if (e.key === 'Escape') {
      // ESC = annulla
      if (resolver) {
        const r = resolver;
        resolver = null;
        hide();
        r(false);
      } else hide();
    }
  }
  container.addEventListener('keydown', handle);
  first.focus();
  return () => container.removeEventListener('keydown', handle);
}

function init() {
  modal = document.getElementById('confirm-modal');
  titleEl = document.getElementById('confirm-modal-title');
  messageEl = document.getElementById('confirm-modal-message');
  primaryBtn = document.getElementById('confirm-primary-btn');
  secondaryBtn = document.getElementById('confirm-secondary-btn');
  closeBtn = document.getElementById('confirm-modal-close-btn');

  const resolveAndHide = value => {
    if (resolver) resolver(value);
    resolver = null;
    hide();
  };

  primaryBtn.addEventListener('click', () => resolveAndHide(true));
  secondaryBtn.addEventListener('click', () => resolveAndHide(false));
  closeBtn.addEventListener('click', () => resolveAndHide(false));
}

function open({
  title = 'Conferma',
  message = 'Sei sicuro?',
  confirmText = 'Conferma',
  cancelText = 'Annulla',
} = {}) {
  titleEl.textContent = title;
  messageEl.textContent = message;
  primaryBtn.textContent = confirmText;
  secondaryBtn.textContent = cancelText;
  lastFocused = document.activeElement;
  modal.classList.remove('hidden');
  trapCleanup = trapFocus(modal);
  try {
    lucide.createIcons();
  } catch {}
}

function hide() {
  modal.classList.add('hidden');
  if (trapCleanup) {
    trapCleanup();
    trapCleanup = null;
  }
  if (lastFocused && typeof lastFocused.focus === 'function') {
    try {
      lastFocused.focus();
    } catch {}
    lastFocused = null;
  }
}

function confirm(message, options = {}) {
  return new Promise(async resolve => {
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
