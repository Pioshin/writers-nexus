import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, setDoc, doc, getDoc, collection, addDoc, onSnapshot, query, Timestamp, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- STATE ---
let currentUserId = null;
let currentProjectId = null;
let currentProjectData = {};
let isFirebaseInitialized = false;
let auth, db, GEMINI_API_KEY;
let unsubscribeProjects = () => {};
let unsubscribeIdeas = () => {};
let unsubscribeCharacters = () => {};
let unsubscribeLocations = () => {};
let isRegistering = false;

// --- DOM ELEMENT VARIABLES ---
let authScreen, appScreen, loginForm, loginEmailInput, loginPasswordInput, loginSubmitBtn, showRegisterBtn, authError, logoutBtn, userEmailDisplay, mainNav, contentPanels, themeSelector, showConfigBtn, configModal, configForm, saveConfigBtn, cancelConfigModalBtn, configStatus, configJsonError, projectsList, newProjectBtn, newProjectModal, newProjectForm, cancelProjectModalBtn, currentProjectName, ideationTabs, ideationTabContents, ideationPremise, ideasList, charactersList, locationsList, newIdeaBtn, newIdeaModal, newIdeaForm, cancelIdeaModalBtn, newCharacterBtn, characterModal, saveCharacterBtn, cancelCharacterModalBtn, characterForm, newLocationBtn, locationModal, locationForm, saveLocationBtn, cancelLocationModalBtn, geminiSubmitBtn, geminiPrompt, geminiResponse, saveGeminiResponseBtn, sidebarSettingsBtn;

// --- CONFIGURATION MANAGEMENT ---
function saveConfig(config) { localStorage.setItem('writerNexusConfig', JSON.stringify(config)); }
function loadConfig() {
    const savedConfig = localStorage.getItem('writerNexusConfig');
    if (savedConfig) {
        try { return JSON.parse(savedConfig); } catch (e) { console.error("Error parsing saved config:", e); return null; }
    }
    return null;
}

function initializeServices(config) {
    try {
        const app = initializeApp(config.firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        GEMINI_API_KEY = config.geminiApiKey;
        isFirebaseInitialized = true;
        
        onAuthStateChanged(auth, user => {
            if (user) {
                currentUserId = user.uid;
                authScreen.classList.add('hidden');
                appScreen.classList.remove('hidden');
                if(userEmailDisplay) userEmailDisplay.textContent = user.email;
                loadUserProjects();
            } else {
                currentUserId = null;
                authScreen.classList.remove('hidden');
                appScreen.classList.add('hidden');
                unsubscribeAll();
            }
            lucide.createIcons();
        });
        updateConfigStatus(true);
    } catch (error) {
        isFirebaseInitialized = false;
        updateConfigStatus(false, `Inizializzazione fallita: ${error.message}`);
    }
}

function updateConfigStatus(isSuccess, message = '') {
    if (isSuccess) {
        configStatus.textContent = 'Configurazione caricata con successo.';
        configStatus.className = 'text-center text-xs p-2 rounded-lg bg-green-500/20 text-green-300';
        if(loginSubmitBtn) loginSubmitBtn.disabled = false;
    } else {
        configStatus.textContent = message || 'Backend non configurato. Clicca l\'icona Impostazioni ⚙️.';
        configStatus.className = 'text-center text-xs p-2 rounded-lg bg-yellow-500/20 text-yellow-300';
        if(loginSubmitBtn) loginSubmitBtn.disabled = true;
    }
    if(showRegisterBtn) showRegisterBtn.disabled = false; 
}

function openConfigModal() {
    configJsonError.textContent = '';
    const currentConfig = loadConfig();
    if (currentConfig && currentConfig.firebaseConfig) {
        document.getElementById('config-firebase-json').value = JSON.stringify(currentConfig.firebaseConfig, null, 2);
    } else {
         document.getElementById('config-firebase-json').value = '';
    }
    if(currentConfig && currentConfig.geminiApiKey) {
        document.getElementById('config-geminiApiKey').value = currentConfig.geminiApiKey;
    }
    configModal.classList.remove('hidden');
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    showConfigBtn.addEventListener('click', openConfigModal);
    sidebarSettingsBtn.addEventListener('click', openConfigModal);
    cancelConfigModalBtn.addEventListener('click', () => configModal.classList.add('hidden'));

    saveConfigBtn.addEventListener('click', () => {
        const firebaseJsonString = document.getElementById('config-firebase-json').value;
        const geminiKey = document.getElementById('config-geminiApiKey').value;
        try {
            const firebaseConfigObject = JSON.parse(firebaseJsonString);
            saveConfig({ firebaseConfig: firebaseConfigObject, geminiApiKey: geminiKey });
            window.location.reload();
        } catch (e) {
            configJsonError.textContent = 'Formato JSON non valido: ' + e.message;
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginEmailInput.value;
        const password = loginPasswordInput.value;
        authError.textContent = '';
        try {
            if (isRegistering) {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await setDoc(doc(db, "users", userCredential.user.uid), { email: userCredential.user.email, createdAt: Timestamp.now() });
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
        } catch (error) { authError.textContent = getFriendlyAuthError(error.code); }
    });

    logoutBtn.addEventListener('click', () => { if(auth) signOut(auth); });

    showRegisterBtn.addEventListener('click', () => {
        isRegistering = !isRegistering;
        loginSubmitBtn.textContent = isRegistering ? 'Registrati' : 'Accedi';
        showRegisterBtn.textContent = isRegistering ? 'Hai già un account? Accedi' : 'Non hai un account? Registrati';
    });
    
    themeSelector.addEventListener('change', (e) => {
        document.documentElement.setAttribute('data-theme', e.target.value);
        localStorage.setItem('writer-nexus-theme', e.target.value);
    });
    
    mainNav.addEventListener('click', (e) => {
        const navItem = e.target.closest('.nav-item');
        if (navItem && navItem.dataset.view) switchView(navItem.dataset.view);
    });

    newProjectBtn.addEventListener('click', () => newProjectModal.classList.remove('hidden'));
    cancelProjectModalBtn.addEventListener('click', () => newProjectModal.classList.add('hidden'));
    newProjectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('new-project-title').value;
        const premise = document.getElementById('new-project-premise').value;
        if (!currentUserId || !title) return;
        await addDoc(collection(db, 'users', currentUserId, 'projects'), { title, premise, createdAt: Timestamp.now() });
        newProjectForm.reset();
        newProjectModal.classList.add('hidden');
    });

    newIdeaBtn.addEventListener('click', () => newIdeaModal.classList.remove('hidden'));
    cancelIdeaModalBtn.addEventListener('click', () => newIdeaModal.classList.add('hidden'));
    newIdeaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = document.getElementById('new-idea-content').value;
        if (!currentProjectId || !content) return;
        await addDoc(collection(db, 'users', currentUserId, 'projects', currentProjectId, 'ideas'), { content, createdAt: Timestamp.now() });
        newIdeaForm.reset();
        newIdeaModal.classList.add('hidden');
    });

    newCharacterBtn.addEventListener('click', () => {
        characterForm.reset();
        document.getElementById('character-id').value = '';
        characterModal.classList.remove('hidden');
    });
    cancelCharacterModalBtn.addEventListener('click', () => characterModal.classList.add('hidden'));
    saveCharacterBtn.addEventListener('click', saveCharacter);
    
    // Listener per la modifica dei personaggi
    charactersList.addEventListener('click', async (e) => {
        const editButton = e.target.closest('.edit-character-btn');
        if (editButton) {
            const charId = editButton.dataset.charId;
            if (!charId) return;
            const charRef = doc(db, 'users', currentUserId, 'projects', currentProjectId, 'characters', charId);
            const charSnap = await getDoc(charRef);
            if (charSnap.exists()) {
                const charData = charSnap.data();
                document.getElementById('character-id').value = charId;
                document.getElementById('char-name').value = charData.name || '';
                document.getElementById('char-context').value = charData.context || '';
                document.getElementById('char-psychology').value = charData.psychology || '';
                document.getElementById('char-past').value = charData.past || '';
                document.getElementById('char-appearance').value = charData.appearance || '';
                document.getElementById('char-voice').value = charData.voice || '';
                characterModal.classList.remove('hidden');
            }
        }
    });

    newLocationBtn.addEventListener('click', () => {
        locationForm.reset();
        document.getElementById('location-id').value = '';
        locationModal.classList.remove('hidden');
    });
    cancelLocationModalBtn.addEventListener('click', () => locationModal.classList.add('hidden'));
    saveLocationBtn.addEventListener('click', saveLocation);

    // *** NUOVO: Listener per la modifica dei luoghi ***
    locationsList.addEventListener('click', async (e) => {
        const editButton = e.target.closest('.edit-location-btn');
        if (editButton) {
            const locId = editButton.dataset.locId;
            if (!locId) return;

            const locRef = doc(db, 'users', currentUserId, 'projects', currentProjectId, 'locations', locId);
            const locSnap = await getDoc(locRef);

            if (locSnap.exists()) {
                const locData = locSnap.data();
                document.getElementById('location-id').value = locId;
                document.getElementById('loc-name').value = locData.name || '';
                document.getElementById('loc-description').value = locData.description || '';
                document.getElementById('loc-history').value = locData.history || '';
                document.getElementById('loc-role').value = locData.role || '';
                locationModal.classList.remove('hidden');
            } else {
                console.error("Luogo non trovato!");
            }
        }
    });

    ideationTabs.addEventListener('click', (e) => {
        const tabButton = e.target.closest('.ideation-tab-btn');
        if (tabButton) switchIdeationTab(tabButton.dataset.tab);
    });
}

// --- AUTH HELPER ---
function getFriendlyAuthError(code) {
    switch (code) {
        case 'auth/wrong-password': return 'Password errata.';
        case 'auth/user-not-found': return 'Nessun utente trovato con questa email.';
        case 'auth/email-already-in-use': return 'Questa email è già stata registrata.';
        case 'auth/weak-password': return 'La password deve essere di almeno 6 caratteri.';
        case 'auth/invalid-credential': return 'Credenziali non valide.';
        default: return 'Si è verificato un errore.';
    }
}

// --- APP LOGIC ---
function loadUserProjects() {
    if (!currentUserId) return;
    const q = query(collection(db, 'users', currentUserId, 'projects'), orderBy('createdAt', 'desc'));
    unsubscribeProjects = onSnapshot(q, (snapshot) => {
        projectsList.innerHTML = snapshot.empty ? `<p class="text-secondary col-span-full">Nessun progetto. Creane uno!</p>` : '';
        snapshot.forEach(doc => {
            const project = { id: doc.id, ...doc.data() };
            const card = document.createElement('div');
            card.className = 'bg-secondary p-6 rounded-xl border border-accent/20 hover:border-accent transition cursor-pointer';
            card.innerHTML = `<h3 class="text-xl font-bold font-display">${project.title}</h3><p class="text-secondary text-sm mt-2 h-10 overflow-hidden">${project.premise || 'Nessuna premessa.'}</p>`;
            card.addEventListener('click', () => selectProject(project));
            projectsList.appendChild(card);
        });
    });
}

function selectProject(project) {
    currentProjectId = project.id;
    currentProjectData = project;
    currentProjectName.textContent = project.title;
    ideationPremise.textContent = project.premise || "Nessuna premessa definita per questo progetto.";
    switchView('ideation');
    loadProjectData(project.id);
}

function loadProjectData(projectId) {
    unsubscribeAllSubCollections();
    loadIdeas(projectId);
    loadCharacters(projectId);
    loadLocations(projectId);
}

function loadIdeas(projectId) {
    const q = query(collection(db, 'users', currentUserId, 'projects', projectId, 'ideas'), orderBy('createdAt', 'desc'));
    unsubscribeIdeas = onSnapshot(q, (snapshot) => {
        ideasList.innerHTML = snapshot.empty ? `<p class="text-secondary p-4 text-center">Nessuna idea salvata.</p>` : '';
        snapshot.forEach(doc => {
            const idea = { id: doc.id, ...doc.data() };
            const el = document.createElement('div');
            el.className = 'bg-primary p-3 rounded-lg text-sm text-secondary';
            el.textContent = idea.content;
            ideasList.appendChild(el);
        });
    });
}

function loadCharacters(projectId) {
    const q = query(collection(db, 'users', currentUserId, 'projects', projectId, 'characters'), orderBy('name'));
    unsubscribeCharacters = onSnapshot(q, (snapshot) => {
        charactersList.innerHTML = snapshot.empty ? `<p class="text-secondary p-4 text-center">Nessun personaggio creato.</p>` : '';
        snapshot.forEach(doc => {
            const char = { id: doc.id, ...doc.data() };
            const card = document.createElement('div');
            card.className = 'bg-primary p-4 rounded-lg flex items-center justify-between';
            card.innerHTML = `<div><p class="font-bold">${char.name}</p><p class="text-xs text-secondary">${(char.context || '').substring(0, 50)}...</p></div><button class="edit-character-btn p-1 hover:accent" data-char-id="${char.id}"><i data-lucide="edit" class="h-4 w-4"></i></button>`;
            charactersList.appendChild(card);
        });
        lucide.createIcons();
    });
}

// *** MODIFICATO: Aggiunto pulsante di modifica ***
function loadLocations(projectId) {
    const q = query(collection(db, 'users', currentUserId, 'projects', projectId, 'locations'), orderBy('name'));
    unsubscribeLocations = onSnapshot(q, (snapshot) => {
        locationsList.innerHTML = snapshot.empty ? `<p class="text-secondary p-4 text-center">Nessun luogo creato.</p>` : '';
        snapshot.forEach(doc => {
            const loc = { id: doc.id, ...doc.data() };
            const card = document.createElement('div');
            card.className = 'bg-primary p-4 rounded-lg';
            card.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <p class="font-bold">${loc.name}</p>
                        <p class="text-xs text-secondary mt-1">${(loc.description || '').substring(0, 80)}...</p>
                    </div>
                    <button class="edit-location-btn p-1 hover:accent" data-loc-id="${loc.id}"><i data-lucide="edit" class="h-4 w-4"></i></button>
                </div>
            `;
            locationsList.appendChild(card);
        });
        lucide.createIcons();
    });
}

async function saveLocation() {
    const locData = {
        name: document.getElementById('loc-name').value,
        description: document.getElementById('loc-description').value,
        history: document.getElementById('loc-history').value,
        role: document.getElementById('loc-role').value,
    };
    if (!currentProjectId || !locData.name) {
        console.error("Nome del luogo obbligatorio.");
        return;
    }
    
    const locId = document.getElementById('location-id').value;
    const collectionRef = collection(db, 'users', currentUserId, 'projects', currentProjectId, 'locations');
    
    try {
        if (locId) {
            await setDoc(doc(collectionRef, locId), locData, { merge: true });
        } else {
            await addDoc(collectionRef, {...locData, createdAt: Timestamp.now() });
        }
    } catch(error) {
        console.error("Errore nel salvataggio del luogo: ", error);
    }

    locationModal.classList.add('hidden');
    locationForm.reset();
}

async function saveCharacter() {
    const charData = {
        name: document.getElementById('char-name').value,
        context: document.getElementById('char-context').value,
        psychology: document.getElementById('char-psychology').value,
        past: document.getElementById('char-past').value,
        appearance: document.getElementById('char-appearance').value,
        voice: document.getElementById('char-voice').value,
    };
    if (!currentProjectId || !charData.name) {
        console.error("Il nome del personaggio è obbligatorio.");
        return;
    }
    
    const charId = document.getElementById('character-id').value;
    const collectionRef = collection(db, 'users', currentUserId, 'projects', currentProjectId, 'characters');
    
    try {
        if (charId) {
            await setDoc(doc(collectionRef, charId), charData, { merge: true });
        } else {
            await addDoc(collectionRef, {...charData, createdAt: Timestamp.now() });
        }
    } catch(error) {
        console.error("Errore nel salvataggio del personaggio: ", error);
    }

    characterModal.classList.add('hidden');
    characterForm.reset();
}

function switchView(viewName) {
    document.querySelectorAll('#main-nav .nav-item').forEach(item => {
        const isTarget = item.dataset.view === viewName;
        item.classList.toggle('bg-primary', isTarget);
        const icon = item.querySelector('i') || item.querySelector('svg');
        if (icon) {
            icon.classList.toggle('accent', isTarget);
            icon.classList.toggle('text-secondary', !isTarget);
        }
    });
    contentPanels.forEach(panel => {
        panel.id === `view-${viewName}` ? panel.classList.remove('hidden') : panel.classList.add('hidden');
    });
}

function switchIdeationTab(tabName) {
    document.querySelectorAll('.ideation-tab-btn').forEach(btn => {
        const isTarget = btn.dataset.tab === tabName;
        btn.classList.toggle('accent', isTarget);
        btn.classList.toggle('border-accent', isTarget);
        btn.classList.toggle('text-secondary', !isTarget);
        btn.classList.toggle('border-transparent', !isTarget);
    });
    ideationTabContents.forEach(content => {
        content.id === `${tabName}-content` ? content.classList.remove('hidden') : content.classList.add('hidden');
    });
}

// --- UTILS ---
function unsubscribeAll() {
    unsubscribeProjects();
    unsubscribeAllSubCollections();
}
function unsubscribeAllSubCollections() {
    unsubscribeIdeas();
    unsubscribeCharacters();
    unsubscribeLocations();
}

// --- INITIALIZATION ---
function startApp() {
    // Assegnazione variabili DOM
    authScreen = document.getElementById('auth-screen');
    appScreen = document.getElementById('app-screen');
    loginForm = document.getElementById('login-form');
    loginEmailInput = document.getElementById('login-email');
    loginPasswordInput = document.getElementById('login-password');
    loginSubmitBtn = document.getElementById('login-submit-btn');
    showRegisterBtn = document.getElementById('show-register-btn');
    authError = document.getElementById('auth-error');
    logoutBtn = document.getElementById('logout-btn');
    userEmailDisplay = document.getElementById('user-email');
    mainNav = document.getElementById('main-nav');
    contentPanels = document.querySelectorAll('.view-content');
    themeSelector = document.getElementById('theme-selector');
    showConfigBtn = document.getElementById('show-config-btn');
    configModal = document.getElementById('config-modal');
    configForm = document.getElementById('config-form');
    saveConfigBtn = document.getElementById('save-config-btn');
    cancelConfigModalBtn = document.getElementById('cancel-config-modal');
    configStatus = document.getElementById('config-status');
    configJsonError = document.getElementById('config-json-error');
    projectsList = document.getElementById('projects-list');
    newProjectBtn = document.getElementById('new-project-btn');
    newProjectModal = document.getElementById('new-project-modal');
    newProjectForm = document.getElementById('new-project-form');
    cancelProjectModalBtn = document.getElementById('cancel-project-modal');
    currentProjectName = document.getElementById('current-project-name');
    ideationTabs = document.getElementById('ideation-tabs');
    ideationTabContents = document.querySelectorAll('.ideation-tab-content');
    ideationPremise = document.getElementById('ideation-premise');
    ideasList = document.getElementById('ideas-list');
    charactersList = document.getElementById('characters-list');
    locationsList = document.getElementById('locations-list');
    newIdeaBtn = document.getElementById('new-idea-btn');
    newIdeaModal = document.getElementById('new-idea-modal');
    newIdeaForm = document.getElementById('new-idea-form');
    cancelIdeaModalBtn = document.getElementById('cancel-idea-modal');
    newCharacterBtn = document.getElementById('new-character-btn');
    characterModal = document.getElementById('character-modal');
    saveCharacterBtn = document.getElementById('save-character-btn');
    cancelCharacterModalBtn = document.getElementById('cancel-character-modal');
    characterForm = document.getElementById('character-form');
    newLocationBtn = document.getElementById('new-location-btn');
    locationModal = document.getElementById('location-modal');
    locationForm = document.getElementById('location-form');
    saveLocationBtn = document.getElementById('save-location-btn');
    cancelLocationModalBtn = document.getElementById('cancel-location-modal');
    geminiSubmitBtn = document.getElementById('gemini-submit');
    geminiPrompt = document.getElementById('gemini-prompt');
    geminiResponse = document.getElementById('gemini-response');
    saveGeminiResponseBtn = document.getElementById('save-gemini-response-btn');
    sidebarSettingsBtn = document.getElementById('sidebar-settings-btn');

    setupEventListeners();
    const config = loadConfig();
    if (config) {
        initializeServices(config);
    } else {
        updateConfigStatus(false);
    }
    const savedTheme = localStorage.getItem('writer-nexus-theme') || 'scifi';
    document.documentElement.setAttribute('data-theme', savedTheme);
    if(themeSelector) themeSelector.value = savedTheme;
    lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', startApp);
