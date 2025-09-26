import { DataManager } from './DataManager.js';
import { FirebaseSync } from './FirebaseSync.js';
import { ThemeManager } from './ThemeManager.js';
import { AIService } from './ai/AIService.js';

// --- STATE ---
let isOfflineMode = false;
let syncModal = null;
let configModal = null;
let importTextModal = null;

// --- DOM ELEMENT VARIABLES ---
let authScreen,
  appScreen,
  mainNav,
  mainContentArea,
  themeSelector,
  showConfigBtn,
  sidebarSettingsBtn,
  loginForm,
  logoutBtn,
  userEmailEl,
  loginSubmitBtn,
  authErrorEl,
  userInfoEl,
  configStatusEl,
  modalContainer,
  currentProjectNameEl;
let openAiBtn;
let openImportBtn;
let aiAssistantModal;
let confirmModal;

// --- RACE CONTROL / AI CONFIG CACHE ---
let currentViewToken = 0; // Incremental token per prevenire race condition nei caricamenti vista
let lastAIConfig = null; // Cache configurazione AI per re-init selettivo

// --- UI NOTIFIER ---
const uiNotifier = {
  showStatus(
    message,
    { isLoading = false, isError = false, autoClose = 0 } = {}
  ) {
    if (!syncModal) return;
    syncModal.show({
      title: isError ? 'Errore' : 'Stato Sincronizzazione',
      message,
      isLoading,
      secondaryBtnText: 'Chiudi',
    });
    if (autoClose > 0) {
      setTimeout(() => syncModal.hide(), autoClose);
    }
  },
  showConflict(status, diff) {
    if (!syncModal) return;
    let title, message, primaryBtnText, onPrimary;

    switch (status) {
      case 'LOCAL_NEWER':
        title = 'Modifiche Locali Rilevate';
        message = `Hai ${diff.local.length} modifiche non sincronizzate. Vuoi caricarle ora?`;
        primaryBtnText = 'Carica Modifiche';
        onPrimary = () => DataManager.uploadLocalData();
        break;
      case 'REMOTE_NEWER':
        title = 'Dati Remoti Più Recenti';
        message = `Ci sono ${diff.remote.length} aggiornamenti sul server. Vuoi scaricarli ora? (Le modifiche locali non sincronizzate verranno perse)`;
        primaryBtnText = 'Scarica Dati';
        onPrimary = () => DataManager.downloadRemoteData();
        break;
      case 'DIVERGED':
        title = 'Dati Divergenti';
        message = `Hai ${diff.local.length} modifiche locali e ${diff.remote.length} modifiche remote. Scegli quale versione mantenere.`;
        primaryBtnText = 'Mantieni Dati Remoti';
        onPrimary = () => DataManager.downloadRemoteData();
        break;
    }

    syncModal.show({
      title,
      message,
      primaryBtnText,
      onPrimary,
      secondaryBtnText: 'Decidi più tardi',
    });
  },
  closeStatus() {
    if (syncModal) syncModal.hide();
  },
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
  // Assign DOM variables
  authScreen = document.getElementById('auth-screen');
  appScreen = document.getElementById('app-screen');
  mainNav = document.getElementById('main-nav');
  mainContentArea = document.getElementById('main-content-area');
  themeSelector = document.getElementById('theme-selector');
  showConfigBtn = document.getElementById('show-config-btn');
  sidebarSettingsBtn = document.getElementById('sidebar-settings-btn');
  openAiBtn = document.getElementById('open-ai-assistant');
  openImportBtn = document.getElementById('open-import-text');
  loginForm = document.getElementById('login-form');
  logoutBtn = document.getElementById('logout-btn');
  userEmailEl = document.getElementById('user-email');
  loginSubmitBtn = document.getElementById('login-submit-btn');
  authErrorEl = document.getElementById('auth-error');
  userInfoEl = document.getElementById('user-info');
  configStatusEl = document.getElementById('config-status');
  modalContainer = document.getElementById('modal-container');
  currentProjectNameEl = document.getElementById('current-project-name');

  await ThemeManager.init(themeSelector);
  const settings = await DataManager.getSettings();

  // Pre-load modals
  configModal = await loadModal('config');
  syncModal = await loadModal('sync');
  confirmModal = await loadModal('confirm');
  aiAssistantModal = await loadModal('ai-assistant');
  importTextModal = await loadModal('import-text');

  setupEventListeners();
  DataManager.init(FirebaseSync, uiNotifier);
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

  // Init AI with settings (cache per confronti futuri)
  const initialAI = {
    provider: settings.aiProvider || 'openai-compatible',
    baseUrl: settings.aiBaseUrl || '',
    apiKey: settings.aiApiKey || '',
    model: settings.aiModel || '',
    headers: settings.aiHeaders || {},
  };
  AIService.init(initialAI);
  lastAIConfig = { ...initialAI };

  if (settings.firebaseConfig && settings.firebaseConfig.apiKey) {
    const initResult = await FirebaseSync.initFirebase(settings.firebaseConfig);
    if (initResult.success) {
      configStatusEl.textContent = 'Firebase Configurato.';
      configStatusEl.className =
        'text-center text-xs p-2 rounded-lg bg-green-500/20 text-green-300';
      setupAuthObserver();
    } else {
      configStatusEl.textContent = `Errore Firebase: ${initResult.error}`;
      configStatusEl.className =
        'text-center text-xs p-2 rounded-lg bg-red-500/20 text-red-300';
      launchOfflineMode();
    }
  } else {
    configStatusEl.textContent = 'Firebase non configurato.';
    configStatusEl.className =
      'text-center text-xs p-2 rounded-lg bg-yellow-500/20 text-yellow-300';
    launchOfflineMode();
  }
}

async function updateActiveProjectIndicator() {
  if (!currentProjectNameEl) return;
  const projectId = await DataManager.getCurrentProjectId();
  if (projectId) {
    const project = await DataManager.getProject(projectId);
    currentProjectNameEl.textContent = project ? project.title : 'Nessuno';
  } else {
    currentProjectNameEl.textContent = 'Nessuno';
  }
}

function launchOfflineMode() {
  isOfflineMode = true;
  console.log('Avvio in modalità offline.');
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  userInfoEl.innerHTML = `<p class="text-xs text-secondary">Modalità offline</p>`;
  userInfoEl.style.display = 'flex';
  logoutBtn.style.display = 'none';
  switchView('dashboard');
}

function setupAuthObserver() {
  FirebaseSync.onAuthStateChanged(async user => {
    if (user) {
      isOfflineMode = false;
      authScreen.classList.add('hidden');
      appScreen.classList.remove('hidden');
      userEmailEl.textContent = user.email;
      userInfoEl.style.display = 'flex';
      logoutBtn.style.display = 'block';

      const settings = await DataManager.getSettings();
      ThemeManager.applyTheme(settings.theme || 'scifi');

      try {
        await DataManager.sync();
      } catch (error) {
        console.error('Sync failed on startup:', error);
        uiNotifier.showStatus(
          'Sincronizzazione iniziale fallita. Controlla la console.',
          { isError: true, autoClose: 5000 }
        );
      }

      switchView('dashboard');
    } else {
      authScreen.classList.remove('hidden');
      appScreen.classList.add('hidden');
    }
  });
}

function setupEventListeners() {
  mainNav.addEventListener('click', e => {
    const navItem = e.target.closest('.nav-item');
    if (navItem && navItem.dataset.view) switchView(navItem.dataset.view);
  });

  showConfigBtn.addEventListener('click', () => configModal?.open());
  // Shortcut per aprire l'assistente IA
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      aiAssistantModal?.open?.();
    }
  });
  sidebarSettingsBtn.addEventListener('click', () => configModal?.open());
  openAiBtn?.addEventListener('click', () => aiAssistantModal?.open?.());
  openImportBtn?.addEventListener('click', () => importTextModal?.open?.());

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (isOfflineMode) return;
    loginSubmitBtn.disabled = true;
    authErrorEl.textContent = '';
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const result = await FirebaseSync.login(email, password);
    if (!result.success) {
      authErrorEl.textContent = 'Credenziali errate.';
      loginSubmitBtn.disabled = false;
    }
  });

  logoutBtn.addEventListener('click', async () => {
    if (isOfflineMode) return;
    await FirebaseSync.logout();
  });

  window.addEventListener('beforeunload', () => {
    if (!isOfflineMode) {
      DataManager.syncOnClose();
    }
  });

  // Listen for settings changes to update UI elements & AI re-init
  window.addEventListener('settingschanged', onSettingsChanged);
  // Project / data changes (aggiornano label progetto corrente)
  window.addEventListener('projectchanged', updateActiveProjectIndicator);
  window.addEventListener('datachanged', e => {
    if (e.detail?.type === 'projects') updateActiveProjectIndicator();
  });
}

async function switchView(viewName) {
  const myToken = ++currentViewToken;

  document.querySelectorAll('#main-nav .nav-item').forEach(item => {
    const isTarget = item.dataset.view === viewName;
    item.classList.toggle('bg-primary', isTarget);
  });

  // Placeholder di caricamento
  mainContentArea.innerHTML = `<div class="flex items-center justify-center py-10 text-secondary text-sm"><i data-lucide="loader" class="animate-spin mr-2"></i>Caricamento ${viewName}...</div>`;
  lucide.createIcons();

  try {
    const response = await fetch(`views/${viewName}/${viewName}.html`);
    if (!response.ok) throw new Error(`Could not load view: ${viewName}`);
    const html = await response.text();
    if (myToken !== currentViewToken) return; // Race abort
    mainContentArea.innerHTML = html;

    const module = await import(`./views/${viewName}/${viewName}.js`);
    if (myToken !== currentViewToken) return; // Race abort
    if (module.default && typeof module.default.init === 'function') {
      module.default.init(
        DataManager,
        isOfflineMode ? null : FirebaseSync,
        loadModal,
        switchView
      );
    }
    lucide.createIcons();
  } catch (error) {
    if (myToken !== currentViewToken) return; // Evita override di errore da view successiva
    console.error('Error loading view:', error);
    mainContentArea.innerHTML = `<p class=\"text-red-500 p-4\">Error loading view: ${viewName}. ${error.message}</p>`;
  }
}

// Gestione cambi settings (AI re-init on demand)
async function onSettingsChanged() {
  updateActiveProjectIndicator();
  try {
    const s = await DataManager.getSettings();
    const next = {
      provider: s.aiProvider || 'openai-compatible',
      baseUrl: s.aiBaseUrl || '',
      apiKey: s.aiApiKey || '',
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
      console.info('[AI] Re-inizializzata per modifica configurazione.');
    }
  } catch (err) {
    console.warn('[AI] Aggiornamento configurazione fallito:', err);
  }
}

async function loadModal(modalName) {
  const modalId = `${modalName}-modal`;
  let module;

  // Prova a vedere se il modulo è già stato caricato in qualche modo (es. in un registro)
  // Per ora, ci basiamo sulla presenza dell'elemento nel DOM e assumiamo che il modulo sia caricato
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
