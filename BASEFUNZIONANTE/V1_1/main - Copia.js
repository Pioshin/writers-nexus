import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, setDoc, doc, getDoc, collection, addDoc, onSnapshot, query, where, Timestamp, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- STATE ---
let currentUserId = null;
let currentProjectId = null;
let isFirebaseInitialized = false;
let auth, db, GEMINI_API_KEY;
let unsubscribeProjects = () => {};
let unsubscribeIdeas = () => {};
let unsubscribeCharacters = () => {};
let isRegistering = false;

// --- DOM ELEMENT VARIABLES (declared globally, assigned when DOM is ready) ---
let authScreen, appScreen, loginForm, loginEmailInput, loginPasswordInput, loginSubmitBtn, showRegisterBtn, authError, logoutBtn, userEmailDisplay, mainNav, contentPanels, themeSelector, showConfigBtn, configModal, configForm, saveConfigBtn, cancelConfigModalBtn, configStatus, configJsonError, projectsList, newProjectBtn, newProjectModal, newProjectForm, cancelProjectModalBtn, currentProjectName, ideasList, charactersList, newIdeaBtn, newIdeaModal, newIdeaForm, cancelIdeaModalBtn, newCharacterBtn, characterModal, saveCharacterBtn, cancelCharacterModalBtn, characterForm, geminiSubmitBtn, geminiPrompt, geminiResponse, saveGeminiResponseBtn;

// --- CONFIGURATION MANAGEMENT ---
function saveConfig(config) {
    localStorage.setItem('writerNexusConfig', JSON.stringify(config));
}

function loadConfig() {
    const savedConfig = localStorage.getItem('writerNexusConfig');
    if (savedConfig) {
        try {
            return JSON.parse(savedConfig);
        } catch (e) {
            console.error("Error parsing saved config:", e);
            localStorage.removeItem('writerNexusConfig');
            return null;
        }
    }
    return null;
}

function initializeServices(config) {
    try {
        if (!config || !config.firebaseConfig) {
            throw new Error("Configurazione Firebase mancante.");
        }
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
        console.error("Firebase initialization failed:", error);
        isFirebaseInitialized = false;
        updateConfigStatus(false, `Inizializzazione fallita: ${error.message}`);
    }
}

function updateConfigStatus(isSuccess, message = '') {
    if (isSuccess) {
        configStatus.textContent = 'Configurazione caricata con successo.';
        configStatus.className = 'text-center text-xs p-2 rounded-lg bg-green-500/20 text-green-300';
        loginSubmitBtn.disabled = false;
    } else {
        configStatus.textContent = message || 'Backend non configurato. Clicca l\'icona Impostazioni ⚙️.';
        configStatus.className = 'text-center text-xs p-2 rounded-lg bg-yellow-500/20 text-yellow-300';
        loginSubmitBtn.disabled = true;
    }
    // This button should always be enabled.
    if(showRegisterBtn) showRegisterBtn.disabled = false; 
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    console.log("Setting up event listeners...");

    showConfigBtn.addEventListener('click', () => {
        console.log("Settings button clicked.");
        configJsonError.textContent = '';
        const currentConfig = loadConfig();
        if (currentConfig && currentConfig.firebaseConfig) {
            document.getElementById('config-firebase-json').value = JSON.stringify(currentConfig.firebaseConfig, null, 2);
        } else {
             document.getElementById('config-firebase-json').value = '';
        }
        if(currentConfig && currentConfig.geminiApiKey) {
            document.getElementById('config-geminiApiKey').value = currentConfig.geminiApiKey;
        } else {
            document.getElementById('config-geminiApiKey').value = '';
        }
        configModal.classList.remove('hidden');
    });

    cancelConfigModalBtn.addEventListener('click', () => configModal.classList.add('hidden'));

    saveConfigBtn.addEventListener('click', () => {
        const firebaseJsonString = document.getElementById('config-firebase-json').value;
        const geminiKey = document.getElementById('config-geminiApiKey').value;
        let firebaseConfigObject;
        configJsonError.textContent = '';

        try {
            if (!firebaseJsonString) throw new Error("Il campo non può essere vuoto.");
            firebaseConfigObject = JSON.parse(firebaseJsonString);
        } catch (e) {
            configJsonError.textContent = 'Formato JSON non valido: ' + e.message;
            return;
        }

        const newConfig = {
            firebaseConfig: firebaseConfigObject,
            geminiApiKey: geminiKey,
        };

        saveConfig(newConfig);
        window.location.reload();
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!isFirebaseInitialized) {
            authError.textContent = 'Firebase non è inizializzato.';
            return;
        }
        const email = loginEmailInput.value;
        const password = loginPasswordInput.value;
        authError.textContent = '';

        try {
            if (isRegistering) {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await setDoc(doc(db, "users", userCredential.user.uid), {
                    email: userCredential.user.email,
                    createdAt: Timestamp.now()
                });
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
        } catch (error) {
            console.error("Auth Error:", error);
            authError.textContent = getFriendlyAuthError(error.code);
        }
    });

    logoutBtn.addEventListener('click', () => {
        if(auth) signOut(auth);
    });

    showRegisterBtn.addEventListener('click', () => {
        isRegistering = !isRegistering;
        loginSubmitBtn.textContent = isRegistering ? 'Registrati' : 'Accedi';
        const registerLink = showRegisterBtn.querySelector('button') || showRegisterBtn;
        registerLink.textContent = isRegistering ? 'Hai già un account? Accedi' : 'Non hai un account? Registrati';
    });
    
    themeSelector.addEventListener('change', (e) => {
        document.documentElement.setAttribute('data-theme', e.target.value);
        localStorage.setItem('writer-nexus-theme', e.target.value);
    });
    
    mainNav.addEventListener('click', (e) => {
        const navItem = e.target.closest('.nav-item');
        if (navItem) switchView(navItem.dataset.view);
    });

    newProjectBtn.addEventListener('click', () => newProjectModal.classList.remove('hidden'));
    cancelProjectModalBtn.addEventListener('click', () => newProjectModal.classList.add('hidden'));
    newProjectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('new-project-title').value;
        const premise = document.getElementById('new-project-premise').value;
        if (!currentUserId || !title) return;

        await addDoc(collection(db, 'users', currentUserId, 'projects'), {
            title,
            premise,
            createdAt: Timestamp.now()
        });
        newProjectForm.reset();
        newProjectModal.classList.add('hidden');
    });

    newIdeaBtn.addEventListener('click', () => newIdeaModal.classList.remove('hidden'));
    cancelIdeaModalBtn.addEventListener('click', () => newIdeaModal.classList.add('hidden'));
    newIdeaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = document.getElementById('new-idea-content').value;
        if (!currentProjectId || !content) return;
        await addDoc(collection(db, 'users', currentUserId, 'projects', currentProjectId, 'ideas'), {
            content,
            createdAt: Timestamp.now()
        });
        newIdeaForm.reset();
        newIdeaModal.classList.add('hidden');
    });

    newCharacterBtn.addEventListener('click', () => {
        characterForm.reset();
        document.getElementById('character-id').value = '';
        characterModal.classList.remove('hidden');
    });
    cancelCharacterModalBtn.addEventListener('click', () => characterModal.classList.add('hidden'));
    saveCharacterBtn.addEventListener('click', async () => {
        const charData = {
            name: document.getElementById('char-name').value,
            context: document.getElementById('char-context').value,
            psychology: document.getElementById('char-psychology').value,
            past: document.getElementById('char-past').value,
            appearance: document.getElementById('char-appearance').value,
            voice: document.getElementById('char-voice').value,
        };
        if (!currentProjectId || !charData.name) {
            // Sostituito alert con console.error per un'esperienza utente migliore
            console.error("Il nome del personaggio è obbligatorio.");
            return;
        }
        
        const charId = document.getElementById('character-id').value;
        const collectionRef = collection(db, 'users', currentUserId, 'projects', currentProjectId, 'characters');
        
        try {
            if (charId) {
                const charRef = doc(collectionRef, charId);
                await setDoc(charRef, charData, { merge: true });
            } else {
                await addDoc(collectionRef, {...charData, createdAt: Timestamp.now() });
            }
        } catch(error) {
            console.error("Errore nel salvataggio del personaggio: ", error);
        }


        characterModal.classList.add('hidden');
        characterForm.reset();
    });

    // *** NUOVO: Event Listener per modificare i personaggi (usando event delegation) ***
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
            } else {
                console.error("Personaggio non trovato!");
            }
        }
    });


    geminiSubmitBtn.addEventListener('click', async () => {
        const prompt = geminiPrompt.value;
        if (!prompt) {
            geminiResponse.textContent = "Per favore, inserisci un prompt.";
            return;
        }
        geminiResponse.textContent = "L'IA sta pensando...";
        geminiSubmitBtn.disabled = true;
        try {
            const responseText = await callGeminiApi(prompt);
            geminiResponse.textContent = responseText;
            saveGeminiResponseBtn.classList.remove('hidden');
        } catch (error) {
            console.error("Gemini API Error:", error);
            geminiResponse.textContent = `Si è verificato un errore con l'IA: ${error.message}`;
        } finally {
            geminiSubmitBtn.disabled = false;
        }
    });

    saveGeminiResponseBtn.addEventListener('click', async () => {
        const content = geminiResponse.textContent;
        if (!currentProjectId || !content || content.startsWith("Le risposte")) return;
        await addDoc(collection(db, 'users', currentUserId, 'projects', currentProjectId, 'ideas'), {
            content,
            createdAt: Timestamp.now()
        });
        saveGeminiResponseBtn.classList.add('hidden');
        geminiResponse.textContent = "Idea salvata!";
        setTimeout(() => { 
            geminiResponse.textContent = "Le risposte dell'IA appariranno qui...";
            geminiPrompt.value = '';
        }, 2000);
    });
    console.log("Event listeners setup complete.");
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
    // NOTA: Le query con `orderBy` richiedono un indice composito in Firestore.
    // Se ricevi un errore nel log della console che menziona la mancanza di un indice,
    // segui il link fornito nell'errore per crearlo nella console di Firebase.
    const projectsRef = collection(db, 'users', currentUserId, 'projects');
    const q = query(projectsRef, orderBy('createdAt', 'desc'));
    
    unsubscribeProjects = onSnapshot(q, (snapshot) => {
        projectsList.innerHTML = '';
        if (snapshot.empty) {
            projectsList.innerHTML = `<p class="text-secondary col-span-full">Non hai ancora nessun progetto. Creane uno per iniziare!</p>`;
            return;
        }
        snapshot.forEach(doc => {
            const project = { id: doc.id, ...doc.data() };
            const projectCard = document.createElement('div');
            projectCard.className = 'bg-secondary p-6 rounded-xl border border-accent/20 hover:border-accent transition cursor-pointer';
            projectCard.dataset.projectId = project.id;
            projectCard.innerHTML = `
                <h3 class="text-xl font-bold font-display">${project.title}</h3>
                <p class="text-secondary text-sm mt-2 h-10 overflow-hidden">${project.premise || 'Nessuna premessa definita.'}</p>
                <p class="text-xs text-secondary mt-4">${project.createdAt ? new Date(project.createdAt.seconds * 1000).toLocaleDateString() : ''}</p>
            `;
            projectCard.addEventListener('click', () => selectProject(project.id, project.title));
            projectsList.appendChild(projectCard);
        });
        lucide.createIcons();
    }, error => {
        console.error("Errore nel caricamento dei progetti: ", error);
        projectsList.innerHTML = `<p class="text-red-400 col-span-full">Errore nel caricamento dei progetti. Controlla la console per i dettagli (potrebbe mancare un indice in Firestore).</p>`;
    });
}
function selectProject(projectId, projectTitle) {
    currentProjectId = projectId;
    currentProjectName.textContent = projectTitle;
    switchView('ideation');
    loadProjectData(projectId);
}
function loadProjectData(projectId) {
    unsubscribeIdeas();
    unsubscribeCharacters();
    loadIdeas(projectId);
    loadCharacters(projectId);
}

function loadIdeas(projectId) {
    const ideasRef = collection(db, 'users', currentUserId, 'projects', projectId, 'ideas');
    const q = query(ideasRef, orderBy('createdAt', 'desc'));
    unsubscribeIdeas = onSnapshot(q, (snapshot) => {
        ideasList.innerHTML = '';
        if (snapshot.empty) {
            ideasList.innerHTML = `<p class="text-secondary text-sm p-4 text-center">Nessuna idea salvata.</p>`;
        }
        snapshot.forEach(doc => {
            const idea = { id: doc.id, ...doc.data() };
            const ideaEl = document.createElement('div');
            ideaEl.className = 'bg-primary p-3 rounded-lg text-sm text-secondary';
            ideaEl.textContent = idea.content;
            ideasList.appendChild(ideaEl);
        });
    }, error => {
        console.error("Errore nel caricamento delle idee: ", error);
    });
}

function loadCharacters(projectId) {
    const charactersRef = collection(db, 'users', currentUserId, 'projects', projectId, 'characters');
    const q = query(charactersRef, orderBy('name'));
    unsubscribeCharacters = onSnapshot(q, (snapshot) => {
        charactersList.innerHTML = '';
        if(snapshot.empty) {
             charactersList.innerHTML = `<p class="text-secondary text-sm p-4 text-center">Nessun personaggio creato.</p>`;
        }
        snapshot.forEach(doc => {
            const char = { id: doc.id, ...doc.data() };
            const charCard = document.createElement('div');
            charCard.className = 'bg-primary p-4 rounded-lg flex items-center justify-between';
            charCard.innerHTML = `
                <div>
                    <p class="font-bold">${char.name}</p>
                    <p class="text-xs text-secondary">${(char.context || '').substring(0, 50)}...</p>
                </div>
                <button class="edit-character-btn p-1 hover:accent" data-char-id="${char.id}"><i data-lucide="edit" class="h-4 w-4"></i></button>
            `;
            charactersList.appendChild(charCard);
        });
        lucide.createIcons();
    }, error => {
        console.error("Errore nel caricamento dei personaggi: ", error);
    });
}

async function callGeminiApi(prompt) {
    if (!GEMINI_API_KEY) {
        throw new Error("Gemini API Key not configured.");
    }
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error.message || "Errore sconosciuto dall'API");
    }
    const data = await response.json();
    if (data.candidates && data.candidates.length > 0 && data.candidates[0].content.parts.length > 0) {
        return data.candidates[0].content.parts[0].text;
    } else {
        return "Nessuna risposta valida ricevuta dall'IA.";
    }
}

function switchView(viewName) {
     document.querySelectorAll('#main-nav .nav-item').forEach(item => {
        const isTarget = item.dataset.view === viewName;
        item.classList.toggle('bg-primary', isTarget);
        item.querySelector('i').classList.toggle('accent', isTarget);
        item.querySelector('i').classList.toggle('text-secondary', !isTarget);
    });
    contentPanels.forEach(panel => {
        panel.id === `view-${viewName}` ? panel.classList.remove('hidden') : panel.classList.add('hidden');
    });
}

// --- UTILS ---
function unsubscribeAll() {
    if(unsubscribeProjects) unsubscribeProjects();
    if(unsubscribeIdeas) unsubscribeIdeas();
    if(unsubscribeCharacters) unsubscribeCharacters();
}

// --- INITIALIZATION ---
function startApp() {
    console.log("App starting...");
    // 1. Assign all DOM element variables
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
    ideasList = document.getElementById('ideas-list');
    charactersList = document.getElementById('characters-list');
    newIdeaBtn = document.getElementById('new-idea-btn');
    newIdeaModal = document.getElementById('new-idea-modal');
    newIdeaForm = document.getElementById('new-idea-form');
    cancelIdeaModalBtn = document.getElementById('cancel-idea-modal');
    newCharacterBtn = document.getElementById('new-character-btn');
    characterModal = document.getElementById('character-modal');
    saveCharacterBtn = document.getElementById('save-character-btn');
    cancelCharacterModalBtn = document.getElementById('cancel-character-modal');
    characterForm = document.getElementById('character-form');
    geminiSubmitBtn = document.getElementById('gemini-submit');
    geminiPrompt = document.getElementById('gemini-prompt');
    geminiResponse = document.getElementById('gemini-response');
    saveGeminiResponseBtn = document.getElementById('save-gemini-response-btn');

    // 2. Setup event listeners
    setupEventListeners();

    // 3. Load config and initialize services
    const config = loadConfig();
    if (config) {
        initializeServices(config);
    } else {
        updateConfigStatus(false);
    }

    // 4. Set theme
    const savedTheme = localStorage.getItem('writer-nexus-theme') || 'scifi';
    document.documentElement.setAttribute('data-theme', savedTheme);
    if(themeSelector) themeSelector.value = savedTheme;
    
    // 5. Initial icon render
    lucide.createIcons();
    console.log("App started successfully.");
}

// Wait for the DOM to be fully loaded before starting the app.
document.addEventListener('DOMContentLoaded', startApp);
