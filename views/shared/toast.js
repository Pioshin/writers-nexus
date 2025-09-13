// Semplice gestore di toast non bloccanti
const CONTAINER_ID = 'toast-container';

function ensureContainer() {
  let el = document.getElementById(CONTAINER_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = CONTAINER_ID;
    el.className = 'toast-container';
    document.body.appendChild(el);
  }
  return el;
}

function createToast(message, { type = 'info', duration = 3000 } = {}) {
  const container = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-body">${message}</div>
    <button class="toast-close" aria-label="Chiudi">&times;</button>
  `;
  container.appendChild(toast);

  const close = () => {
    toast.classList.add('toast-hide');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };
  toast.querySelector('.toast-close').addEventListener('click', close);
  if (duration > 0) setTimeout(close, duration);
}

export const toast = {
  show: createToast,
  info: (msg, opts = {}) => createToast(msg, { type: 'info', duration: 3000, ...opts }),
  success: (msg, opts = {}) => createToast(msg, { type: 'success', duration: 2500, ...opts }),
  error: (msg, opts = {}) => createToast(msg, { type: 'error', duration: 5000, ...opts })
};
