import { DataManager } from './DataManager.js';
import { FirebaseSync } from './FirebaseSync.js';
import { ThemeManager } from './ThemeManager.js';

// --- STATE ---
let isOfflineMode = false;
let syncModal = null;
let configModal = null;

// --- DOM ELEMENT VARIABLES ---
let authScreen, appScreen, mainNav, mainContentArea, themeSelector, showConfigBtn, sidebarSettingsBtn, loginForm, logoutBtn, userEmailEl, loginSubmitBtn, authErrorEl, userInfoEl, configStatusEl, modalContainer;

// --- UI NOTIFIER ---
const uiNotifier = {
    showStatus(message, { isLoading = false, isError = false, autoClose = 0 } = {}) {
        if (!syncModal) return;
        syncModal.show({
            title: isError ? 'Errore' : 'Stato Sincronizzazione',
            message,
            isLoading,
            secondaryBtnText: 'Chiudi'
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
            secondaryBtnText: 'Decidi più tardi'
        });
    },
    closeStatus() {
        if (syncModal) syncModal.hide();
    }
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
    loginForm = document.getElementById('login-form');
    logoutBtn = document.getElementById('logout-btn');
    userEmailEl = document.getElementById('user-email');
    loginSubmitBtn = document.getElementById('login-submit-btn');
    authErrorEl = document.getElementById('auth-error');
    userInfoEl = document.getElementById('user-info');
    configStatusEl = document.getElementById('config-status');
    modalContainer = document.getElementById('modal-container');

    await ThemeManager.init(themeSelector);
    const settings = await DataManager.getSettings();

    // Pre-load modals
    configModal = await loadModal('config');
    syncModal = await loadModal('sync');

    setupEventListeners();
    DataManager.init(FirebaseSync, uiNotifier);

    if (settings.firebaseConfig && settings.firebaseConfig.apiKey) {
        const initResult = await FirebaseSync.initFirebase(settings.firebaseConfig);
        if (initResult.success) {
            configStatusEl.textContent = 'Firebase Configurato.';
            configStatusEl.className = 'text-center text-xs p-2 rounded-lg bg-green-500/20 text-green-300';
            setupAuthObserver();
        } else {
            configStatusEl.textContent = `Errore Firebase: ${initResult.error}`;
            configStatusEl.className = 'text-center text-xs p-2 rounded-lg bg-red-500/20 text-red-300';
            launchOfflineMode();
        }
    } else {
        configStatusEl.textContent = 'Firebase non configurato.';
        configStatusEl.className = 'text-center text-xs p-2 rounded-lg bg-yellow-500/20 text-yellow-300';
        launchOfflineMode();
    }
}

function launchOfflineMode() {
    isOfflineMode = true;
    console.log("Avvio in modalità offline.");
    authScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    userInfoEl.innerHTML = `<p class="text-xs text-secondary">Modalità offline</p>`;
    userInfoEl.style.display = 'flex';
    logoutBtn.style.display = 'none';
    switchView('dashboard');
}

function setupAuthObserver() {
    FirebaseSync.onAuthStateChanged(async (user) => {
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
                console.error("Sync failed on startup:", error);
                uiNotifier.showStatus("Sincronizzazione iniziale fallita. Controlla la console.", { isError: true, autoClose: 5000 });
            }

            switchView('dashboard');
        } else {
            authScreen.classList.remove('hidden');
            appScreen.classList.add('hidden');
        }
    });
}

function setupEventListeners() {
    mainNav.addEventListener('click', (e) => {
        const navItem = e.target.closest('.nav-item');
        if (navItem && navItem.dataset.view) switchView(navItem.dataset.view);
    });

    showConfigBtn.addEventListener('click', () => configModal?.open());
    sidebarSettingsBtn.addEventListener('click', () => configModal?.open());

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isOfflineMode) return;
        loginSubmitBtn.disabled = true;
        authErrorEl.textContent = '';
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const result = await FirebaseSync.login(email, password);
        if (!result.success) {
            authErrorEl.textContent = "Credenziali errate.";
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
}

async function switchView(viewName) {
    document.querySelectorAll('#main-nav .nav-item').forEach(item => {
        const isTarget = item.dataset.view === viewName;
        item.classList.toggle('bg-primary', isTarget);
    });

    try {
        const response = await fetch(`views/${viewName}/${viewName}.html`);
        if (!response.ok) throw new Error(`Could not load view: ${viewName}`);
        mainContentArea.innerHTML = await response.text();

        const module = await import(`./views/${viewName}/${viewName}.js`);
        if (module.default && typeof module.default.init === 'function') {
            module.default.init(DataManager, isOfflineMode ? null : FirebaseSync, loadModal);
        }
        
        lucide.createIcons();

    } catch (error) {
        console.error("Error loading view:", error);
        mainContentArea.innerHTML = `<p class="text-red-500">Error loading view: ${viewName}. ${error.message}</p>`;
    }
}

async function loadModal(modalName) {
    // Evita di ricaricare un modale se è già nel DOM
    if (document.getElementById(`${modalName}-modal`)) {
        // Trova il modulo già caricato se necessario (logica più complessa, per ora non serve)
        // In questo caso, i moduli dei modali non esportano funzioni che devono essere richiamate
        // dopo l'inizializzazione, quindi possiamo semplicemente uscire.
        return; 
    }

    try {
        const response = await fetch(`views/modals/${modalName}.html`);
        if (!response.ok) throw new Error(`Could not load modal: ${modalName}`);
        const modalContent = document.createElement('div');
        modalContent.innerHTML = await response.text();
        modalContainer.appendChild(modalContent);

        const module = await import(`./views/modals/${modalName}.js`);
        if (module.default && typeof module.default.init === 'function') {
            module.default.init();
            return module.default;
        }
        return null;
    } catch (error) {
        console.error("Error loading modal:", error);
        return null;
    }
}
