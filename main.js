
import { DataManager } from './DataManager.js';
import { ThemeManager } from './ThemeManager.js';
import { AIService } from './ai/AIService.js';
import { AIPanel } from './ai/AIPanel.js';
import { ConsistencyEngine } from './js/ConsistencyEngine.js';

// --- STATE ---
let syncModal = null;
let configModal = null;
let importTextModal = null;
let consistencyEngine;
let currentView = 'dashboard';
let OverlayModule;

// --- DOM ELEMENT VARIABLES ---
let appScreen,
  mainNav,
  mainContentArea,
  viewContainer,
  themeSelector,
  sidebarSettingsBtn,
  modalContainer,
  currentProjectNameEl;
let openAiBtn;
let openImportBtn;
let mobileMenuBtn, sidebar, mobileOverlay;
let aiAssistantModal;
let confirmModal;

// --- RACE CONTROL / AI CONFIG CACHE ---
let currentViewToken = 0;
let lastAIConfig = null;

// --- UI NOTIFIER ---
const uiNotifier = {
  showStatus(
    message,
    { isLoading = false, isError = false, autoClose = 0 } = {}
  ) {
    if (!syncModal) return;
    syncModal.show({
      title: isError ? 'Errore' : 'Stato',
      message,
      isLoading,
      secondaryBtnText: 'Chiudi',
    });
    if (autoClose > 0) {
      setTimeout(() => syncModal.hide(), autoClose);
    }
  },
  closeStatus() {
    if (syncModal) syncModal.hide();
  },
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
  // Assign DOM variables
  appScreen = document.getElementById('app-screen');
  mainNav = document.getElementById('main-nav');
  mainContentArea = document.getElementById('main-content-area');
  viewContainer = document.getElementById('view-container') || mainContentArea;
  themeSelector = document.getElementById('theme-selector');
  sidebarSettingsBtn = document.getElementById('sidebar-settings-btn');
  mobileMenuBtn = document.getElementById('mobile-menu-btn');
  sidebar = document.getElementById('sidebar');
  mobileOverlay = document.getElementById('mobile-overlay');
  openAiBtn = document.getElementById('open-ai-assistant');
  openImportBtn = document.getElementById('open-import-text');
  modalContainer = document.getElementById('modal-container');
  currentProjectNameEl = document.getElementById('current-project-name');

  await ThemeManager.init(themeSelector);
  const settings = await DataManager.getSettings();

  // Initialize Global AI Panel
  window.aiPanel = new AIPanel(DataManager);

  // Init Consistency Engine
  const toast = window.toast || console.log;
  consistencyEngine = new ConsistencyEngine(DataManager, toast, AIService);
  window.consistencyEngine = consistencyEngine;
  consistencyEngine.init();

  // Pre-load modals
  configModal = await loadModal('config');
  syncModal = await loadModal('sync');
  confirmModal = await loadModal('confirm');
  aiAssistantModal = await loadModal('ai-assistant');
  importTextModal = await loadModal('import-text');

  setupEventListeners();
  DataManager.init(uiNotifier);

  // Esponi un helper globale per conferme custom
  window.appConfirm = async (message, opts = {}) => {
    try {
      const m = confirmModal || (await loadModal('confirm'));
      if (!m || !m.confirm) return window.confirm(message);
      return await m.confirm(message, opts);
    } catch {
      return window.confirm(message);
    }
  };

  // Set initial UI states
  await updateActiveProjectIndicator();

  // Init AI with settings
  const initialAI = {
    provider: settings.aiProvider || 'openai-compatible',
    baseUrl: settings.aiBaseUrl || '',
    apiKey: settings.aiApiKey || settings.geminiApiKey || '',
    model: settings.aiModel || '',
    headers: settings.aiHeaders || {},
  };
  AIService.init(initialAI);
  lastAIConfig = { ...initialAI };

  // Avvio diretto - nessun auth richiesto
  appScreen.classList.remove('hidden');
  switchView('dashboard');
}

async function updateActiveProjectIndicator() {
  if (!currentProjectNameEl) return;
  const projectId = await DataManager.getCurrentProjectId();
  if (projectId) {
    const project = await DataManager.getProject(projectId);
    currentProjectNameEl.textContent = project ? project.title : 'Nessuno';

    // Reset and restart Consistency Engine on project switch
    if (window.consistencyEngine) {
      window.consistencyEngine.reset();
      setTimeout(() => window.consistencyEngine.run(), 1000);
    }
  } else {
    currentProjectNameEl.textContent = 'Nessuno';
  }
}

function setupEventListeners() {
  mainNav.addEventListener('click', e => {
    const navItem = e.target.closest('.nav-item');
    if (navItem && navItem.dataset.view) {
      switchView(navItem.dataset.view);
      if (window.innerWidth < 768) {
        closeMobileMenu();
      }
    }
  });

  // Mobile Menu Toggles
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('-translate-x-full');
      mobileOverlay.classList.toggle('hidden');
    });
  }
  if (mobileOverlay) {
    mobileOverlay.addEventListener('click', closeMobileMenu);
  }

  // Shortcut per aprire l'assistente IA
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      aiAssistantModal?.open?.();
    }
  });
  sidebarSettingsBtn?.addEventListener('click', () => configModal?.open());
  openAiBtn?.addEventListener('click', () => aiAssistantModal?.open?.());
  openImportBtn?.addEventListener('click', () => importTextModal?.open?.());

  // --- EXPORT / IMPORT HANDLERS ---
  const exportBtn = document.getElementById('export-project-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      const projectId = await DataManager.getCurrentProjectId();
      if (!projectId) {
        uiNotifier.showStatus("Nessun progetto attivo da esportare.", { isError: true, autoClose: 3000 });
        return;
      }

      uiNotifier.showStatus("Preparazione backup...", { isLoading: true });
      try {
        const data = await DataManager.getProjectData(projectId);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().split('T')[0];
        const title = data.project.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        a.download = `writers-nexus-${title}-${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        uiNotifier.showStatus("Backup scaricato!", { autoClose: 2000 });
      } catch (e) {
        console.error(e);
        uiNotifier.showStatus("Errore durante l'export.", { isError: true, autoClose: 4000 });
      }
    });
  }

  const importBtn = document.getElementById('import-project-btn');
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Limite 10MB
        if (file.size > 10 * 1024 * 1024) {
          uiNotifier.showStatus("File troppo grande (max 10MB).", { isError: true, autoClose: 4000 });
          return;
        }

        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            const json = JSON.parse(evt.target.result);
            const title = json.project?.title || 'Sconosciuto';

            if (await window.appConfirm(`Vuoi importare il progetto "${title}"?\nATTENZIONE: Se esiste già un progetto con questo ID, verrà sovrascritto completamente.`, { title: 'Conferma Importazione', confirmText: 'Importa e Sovrascrivi' })) {
              uiNotifier.showStatus("Importazione in corso...", { isLoading: true });
              const result = await DataManager.importProjectData(json);
              uiNotifier.showStatus(`Progetto "${result.title}" importato (${result.itemCount} elementi)!`, { autoClose: 3000 });
              setTimeout(() => window.location.reload(), 1500);
            }
          } catch (err) {
            console.error(err);
            uiNotifier.showStatus("Errore importazione: " + err.message, { isError: true, autoClose: 5000 });
          }
        };
        reader.readAsText(file);
      };
      input.click();
    });
  }

  // Listen for settings changes
  window.addEventListener('settingschanged', onSettingsChanged);
  window.addEventListener('projectchanged', updateActiveProjectIndicator);
  window.addEventListener('datachanged', e => {
    if (e.detail?.type === 'projects') updateActiveProjectIndicator();
  });

  // Listen for Consistency Engine progress
  window.addEventListener('consistency-progress', e => {
    const { status, message, details } = e.detail;
    updateConsistencyIndicator(status, message, details);
  });
}

function updateConsistencyIndicator(status, message, details) {
  const indicator = document.getElementById('consistency-status-indicator');
  if (!indicator) return;

  const msgEl = indicator.querySelector('p');
  const detailsEl = document.getElementById('consistency-status-details');
  const icon = indicator.querySelector('i');

  if (status === 'idle') {
    indicator.classList.remove('translate-y-0');
    indicator.classList.add('translate-y-full');
    return;
  }

  indicator.classList.remove('translate-y-full', 'hidden');
  indicator.classList.add('translate-y-0');

  if (message && msgEl) msgEl.textContent = message;
  if (details && detailsEl) detailsEl.textContent = details;

  if (!icon) return;

  if (status === 'error') {
    icon.setAttribute('data-lucide', 'alert-triangle');
    icon.classList.remove('animate-spin', 'text-accent');
    icon.classList.add('text-red-500');
  } else if (status === 'complete') {
    icon.setAttribute('data-lucide', 'check-circle');
    icon.classList.remove('animate-spin');
    icon.classList.add('text-green-500');
  } else {
    icon.setAttribute('data-lucide', 'loader-2');
    icon.classList.add('animate-spin', 'text-accent');
    icon.classList.remove('text-red-500', 'text-green-500');
  }
  lucide.createIcons();
}

async function switchView(viewName) {
  const myToken = ++currentViewToken;

  // Notify AI Panel of context change
  if (window.aiPanel) window.aiPanel.updateContext(viewName);

  // Update Nav State
  document.querySelectorAll('#main-nav .nav-item').forEach(item => {
    const isActive = item.dataset.view === viewName;
    const innerDiv = item.firstElementChild;
    if (innerDiv) {
      if (isActive) {
        innerDiv.setAttribute('data-active', 'true');
        innerDiv.classList.add('bg-accent/10', 'text-accent');
      } else {
        innerDiv.setAttribute('data-active', 'false');
        innerDiv.classList.remove('bg-accent/10', 'text-accent');
      }
    }
  });

  // Loading state with fade
  const container = viewContainer || mainContentArea;
  container.style.opacity = '0';

  setTimeout(async () => {
    container.innerHTML = `<div class="flex flex-col items-center justify-center py-20 text-secondary animate-pulse"><i data-lucide="loader" class="animate-spin mb-4 w-8 h-8"></i><p>Caricamento ${viewName}...</p></div>`;
    container.style.opacity = '1';
    lucide.createIcons();

    try {
      const response = await fetch(`views/${viewName}/${viewName}.html`);
      if (!response.ok) throw new Error(`Could not load view: ${viewName}`);
      const html = await response.text();

      if (myToken !== currentViewToken) return;

      container.style.opacity = '0';
      setTimeout(async () => {
        container.innerHTML = html;
        container.style.opacity = '1';

        const module = await import(`./views/${viewName}/${viewName}.js`);
        if (myToken !== currentViewToken) return;

        if (module.default && typeof module.default.init === 'function') {
          module.default.init(
            DataManager,
            loadModal,
            switchView
          );
        }
        lucide.createIcons();
      }, 150);
    } catch (error) {
      if (myToken !== currentViewToken) return;
      console.error('Error loading view:', error);
      container.innerHTML = `<div class=\"p-6 text-center\"><div class=\"inline-block p-4 bg-red-500/10 rounded-lg\"><h3 class=\"text-red-400 font-bold mb-2\">Errore</h3><p class=\"text-secondary\">Impossibile caricare la vista: ${viewName}</p><p class=\"text-xs text-secondary mt-2\">${error.message}</p></div></div>`;
      container.style.opacity = '1';
    }
  }, 100);
}

function closeMobileMenu() {
  if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
    sidebar.classList.add('-translate-x-full');
  }
  if (mobileOverlay) {
    mobileOverlay.classList.add('hidden');
  }
}

async function onSettingsChanged() {
  updateActiveProjectIndicator();
  try {
    const s = await DataManager.getSettings();
    const next = {
      provider: s.aiProvider || 'openai-compatible',
      baseUrl: s.aiBaseUrl || '',
      apiKey: s.aiApiKey || s.geminiApiKey || '',
      model: s.aiModel || '',
      headers: s.aiHeaders || {},
    };
    if (
      !lastAIConfig ||
      lastAIConfig.provider !== next.provider ||
      lastAIConfig.baseUrl !== next.baseUrl ||
      lastAIConfig.apiKey !== next.apiKey ||
      lastAIConfig.model !== next.model
    ) {
      AIService.init(next);
      lastAIConfig = { ...next };

      if (window.aiPanel && typeof window.aiPanel.updateModelInfo === 'function') {
        window.aiPanel.updateModelInfo();
      }

      console.info('[AI] Re-inizializzata per modifica configurazione.');
    }
  } catch (err) {
    console.warn('[AI] Aggiornamento configurazione fallito:', err);
  }
}

async function loadModal(modalName) {
  const modalId = `${modalName}-modal`;
  let module;

  if (document.getElementById(modalId)) {
    try {
      module = await import(`./views/modals/${modalName}.js`);
      return module.default;
    } catch (e) {
      console.error(`Failed to re-import modal module: ${modalName}`, e);
      return null;
    }
  }

  try {
    const response = await fetch(`views/modals/${modalName}.html`);
    if (!response.ok)
      throw new Error(`Could not load modal HTML: ${modalName}`);

    const frag = document.createDocumentFragment();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = await response.text();
    frag.appendChild(wrapper.firstElementChild);
    modalContainer.appendChild(frag);

    module = await import(`./views/modals/${modalName}.js`);
    if (module.default && typeof module.default.init === 'function') {
      try {
        module.default.init(DataManager, loadModal, switchView);
      } catch {
        module.default.init();
      }
      return module.default;
    }
    return null;
  } catch (error) {
    console.error(`Error loading modal: ${modalName}`, error);
    return null;
  }
}
