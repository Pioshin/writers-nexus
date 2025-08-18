import { DataManager } from './DataManager.js';
import { FirebaseSync } from './FirebaseSync.js';
import { ThemeManager } from './ThemeManager.js';

// --- STATE ---
let GEMINI_API_KEY = null;
let isOfflineMode = false;

// --- DOM ELEMENT VARIABLES ---
let authScreen, appScreen, mainNav, mainContentArea, themeSelector, showConfigBtn, sidebarSettingsBtn, loginForm, logoutBtn, userEmailEl, loginSubmitBtn, authErrorEl, userInfoEl, configStatusEl, modalContainer;

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

    // Basic UI setup
    lucide.createIcons();
    setupEventListeners();

    // Initialize ThemeManager
    await ThemeManager.init(themeSelector);

    // Load settings and check for config
    const settings = await DataManager.getSettings();

    // Load config modal initially (it's hidden by default)
    await loadModal('config');

    if (settings.firebaseConfig) {
        const initResult = await FirebaseSync.initFirebase(settings.firebaseConfig);
        if (initResult.success) {
            configStatusEl.textContent = 'Firebase Configurato.';
            configStatusEl.className = 'text-center text-xs p-2 rounded-lg bg-green-500/20 text-green-300';
            setupAuthObserver(); // Start listening for auth changes
        } else {
            configStatusEl.textContent = `Errore Firebase: ${initResult.error}`;
            configStatusEl.className = 'text-center text-xs p-2 rounded-lg bg-red-500/20 text-red-300';
            // Fallback to offline mode if Firebase init fails
            launchOfflineMode();
        }
    } else {
        // No Firebase config, launch in offline mode
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
    // Hide elements that require auth
    logoutBtn.style.display = 'none'; 
    switchView('dashboard');
}

function setupAuthObserver() {
    FirebaseSync.onAuthStateChanged(async (user) => {
        if (user) {
            // User is logged in
            isOfflineMode = false;
            authScreen.classList.add('hidden');
            appScreen.classList.remove('hidden');
            userEmailEl.textContent = user.email;
            userInfoEl.style.display = 'flex';
            logoutBtn.style.display = 'block';

            // Re-apply theme in case it was changed while logged out
            const settings = await DataManager.getSettings();
            ThemeManager.applyTheme(settings.theme || 'scifi');

            switchView('dashboard');
        } else {
            // User is logged out
            authScreen.classList.remove('hidden');
            appScreen.classList.add('hidden');
        }
    });
}

// --- CONFIGURATION ---
// loadAndApplyConfig is no longer needed as theme is applied by ThemeManager
async function loadAndApplyConfig() {
    const settings = await DataManager.getSettings();
    if (settings.geminiApiKey) {
        GEMINI_API_KEY = settings.geminiApiKey;
        FirebaseSync.setGeminiApiKey(settings.geminiApiKey);
    }
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    mainNav.addEventListener('click', (e) => {
        const navItem = e.target.closest('.nav-item');
        if (navItem && navItem.dataset.view) switchView(navItem.dataset.view);
    });

    // Theme selector event listener is now in ThemeManager.js

    // Event listeners for modals (now handled by loadModal)
    showConfigBtn.addEventListener('click', () => loadModal('config', true));
    sidebarSettingsBtn.addEventListener('click', () => loadModal('config', true));

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

    const registerBtn = document.getElementById('show-register-btn');
    if(registerBtn) {
        registerBtn.addEventListener('click', () => {
            alert('Funzione di registrazione non ancora implementata.');
        });
    }
}

// --- UI UTILITIES ---
async function switchView(viewName) {
    document.querySelectorAll('#main-nav .nav-item').forEach(item => {
        const isTarget = item.dataset.view === viewName;
        item.classList.toggle('bg-primary', isTarget);
        const icon = item.querySelector('i') || item.querySelector('svg');
        if (icon) {
            icon.classList.toggle('accent', isTarget);
            icon.classList.toggle('text-secondary', !isTarget);
        }
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

async function loadModal(modalName, show = false) {
    try {
        const response = await fetch(`views/modals/${modalName}.html`);
        if (!response.ok) throw new Error(`Could not load modal: ${modalName}`);
        modalContainer.innerHTML = await response.text();

        const module = await import(`./views/modals/${modalName}.js`);
        if (module.init) {
            // Pass necessary elements to the modal's init function
            if (modalName === 'config') {
                module.init(showConfigBtn, sidebarSettingsBtn);
            }
        }
        if (show) {
            document.getElementById(`${modalName}-modal`).classList.remove('hidden');
        }
        lucide.createIcons();
    } catch (error) {
        console.error("Error loading modal:", error);
        // Optionally display an error message to the user
    }
}