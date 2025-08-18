import { DataManager } from './DataManager.js';

// --- STATE ---
let GEMINI_API_KEY = null;

// --- DOM ELEMENT VARIABLES ---
let authScreen, appScreen, mainNav, contentPanels, themeSelector, showConfigBtn, configModal, configForm, saveConfigBtn, cancelConfigModalBtn, projectsList, newProjectBtn, newProjectModal, newProjectForm, cancelProjectModalBtn, currentProjectName, ideationTabs, ideationTabContents, ideationPremise, ideasList, charactersList, locationsList, objectsList, systemsList, newIdeaBtn, newIdeaModal, newIdeaForm, cancelIdeaModalBtn, newCharacterBtn, characterModal, saveCharacterBtn, cancelCharacterModalBtn, characterForm, newLocationBtn, locationModal, locationForm, saveLocationBtn, cancelLocationModalBtn, newObjectBtn, objectModal, objectForm, saveObjectBtn, cancelObjectModalBtn, newSystemBtn, systemModal, systemForm, saveSystemBtn, cancelSystemModalBtn, geminiSubmitBtn, geminiPrompt, geminiResponse, saveGeminiResponseBtn, sidebarSettingsBtn;

// --- CONFIGURATION ---
async function loadAndApplyConfig() {
    const settings = await DataManager.getSettings();
    if (settings.geminiApiKey) {
        GEMINI_API_KEY = settings.geminiApiKey;
    }
    const savedTheme = settings.theme || 'scifi';
    document.documentElement.setAttribute('data-theme', savedTheme);
    if(themeSelector) themeSelector.value = savedTheme;
}

async function openConfigModal() {
    const settings = await DataManager.getSettings();
    document.getElementById('config-geminiApiKey').value = settings.geminiApiKey || '';
    document.getElementById('firebase-config-container').style.display = 'none';
    configModal.classList.remove('hidden');
}

// --- RENDERING ---
async function renderProjects() {
    const projects = await DataManager.getProjects();
    projectsList.innerHTML = projects.length === 0 ? `<p class="text-secondary col-span-full">Nessun progetto. Creane uno!</p>` : '';
    projects.forEach(project => {
        const card = document.createElement('div');
        card.className = 'bg-secondary p-6 rounded-xl border border-accent/20 hover:border-accent transition cursor-pointer';
        card.innerHTML = `<h3 class="text-xl font-bold font-display">${project.title}</h3><p class="text-secondary text-sm mt-2 h-10 overflow-hidden">${project.premise || 'Nessuna premessa.'}</p>`;
        card.addEventListener('click', () => selectProject(project.id));
        projectsList.appendChild(card);
    });
}

async function renderProjectItems(projectId, itemType, listElement) {
    const items = await DataManager.getProjectItems(projectId, itemType);
    listElement.innerHTML = items.length === 0 ? `<p class="text-secondary p-4 text-center">Nessun elemento creato.</p>` : '';
    
    items.forEach(item => {
        let card;
        switch (itemType) {
            case 'ideas':
                card = document.createElement('div');
                card.className = 'bg-primary p-3 rounded-lg text-sm text-secondary';
                card.textContent = item.content;
                break;
            case 'characters':
                card = document.createElement('div');
                card.className = 'bg-primary p-4 rounded-lg flex items-center justify-between';
                card.innerHTML = `<div><p class="font-bold">${item.name}</p><p class="text-xs text-secondary">${(item.context || '').substring(0, 50)}...</p></div><button class="edit-item-btn p-1 hover:accent" data-item-id="${item.id}" data-item-type="characters"><i data-lucide="edit" class="h-4 w-4"></i></button>`;
                break;
            case 'locations':
                 card = document.createElement('div');
                 card.className = 'bg-primary p-4 rounded-lg';
                 card.innerHTML = `<div class="flex justify-between items-center"><div><p class="font-bold">${item.name}</p><p class="text-xs text-secondary mt-1">${(item.description || '').substring(0, 80)}...</p></div><button class="edit-item-btn p-1 hover:accent" data-item-id="${item.id}" data-item-type="locations"><i data-lucide="edit" class="h-4 w-4"></i></button></div>`;
                break;
            case 'objects':
                 card = document.createElement('div');
                 card.className = 'bg-primary p-4 rounded-lg';
                 card.innerHTML = `<div class="flex justify-between items-center"><div><p class="font-bold">${item.name}</p><p class="text-xs text-secondary mt-1">${(item.importance || '').substring(0, 80)}...</p></div><button class="edit-item-btn p-1 hover:accent" data-item-id="${item.id}" data-item-type="objects"><i data-lucide="edit" class="h-4 w-4"></i></button></div>`;
                break;
            case 'systems':
                 card = document.createElement('div');
                 card.className = 'bg-primary p-4 rounded-lg';
                 card.innerHTML = `<div class="flex justify-between items-center"><div><p class="font-bold">${item.name}</p><p class="text-xs text-secondary mt-1">${(item.rules || '').substring(0, 80)}...</p></div><button class="edit-item-btn p-1 hover:accent" data-item-id="${item.id}" data-item-type="systems"><i data-lucide="edit" class="h-4 w-4"></i></button></div>`;
                break;
        }
        if(card) listElement.appendChild(card);
    });
    lucide.createIcons();
}

// --- APP LOGIC ---
async function selectProject(projectId) {
    await DataManager.setCurrentProjectId(projectId);
    const project = await DataManager.getProject(projectId);
    if (project) {
        currentProjectName.textContent = project.title;
        ideationPremise.textContent = project.premise || "Nessuna premessa definita per questo progetto.";
        switchView('ideation');
        await loadProjectData(projectId);
    }
}

async function loadProjectData(projectId) {
    await Promise.all([
        renderProjectItems(projectId, 'ideas', ideasList),
        renderProjectItems(projectId, 'characters', charactersList),
        renderProjectItems(projectId, 'locations', locationsList),
        renderProjectItems(projectId, 'objects', objectsList),
        renderProjectItems(projectId, 'systems', systemsList)
    ]);
}

async function saveAndCloseForm(formType, modalElement, formElement) {
    const projectId = await DataManager.getCurrentProjectId();
    if (!projectId) return;

    const formData = new FormData(formElement);
    const itemData = Object.fromEntries(formData.entries());
    
    await DataManager.saveProjectItem(projectId, formType, itemData);
    
    modalElement.classList.add('hidden');
    formElement.reset();
    
    const listElement = document.getElementById(`${formType}-list`);
    if(listElement) await renderProjectItems(projectId, formType, listElement);
}

async function openEditModal(itemId, itemType) {
    const projectId = await DataManager.getCurrentProjectId();
    const items = await DataManager.getProjectItems(projectId, itemType);
    const itemData = items.find(item => item.id === itemId);
    if (!itemData) return;

    const modal = document.getElementById(`${itemType.slice(0, -1)}-modal`);
    const form = document.getElementById(`${itemType.slice(0, -1)}-form`);

    if (!modal || !form) return;

    for (const key in itemData) {
        const input = form.querySelector(`[name="${key}"]`);
        if (input) {
            input.value = itemData[key];
        }
    }
    modal.classList.remove('hidden');
}


// --- EVENT LISTENERS ---
function setupEventListeners() {
    mainNav.addEventListener('click', (e) => {
        const navItem = e.target.closest('.nav-item');
        if (navItem && navItem.dataset.view) switchView(navItem.dataset.view);
    });

    themeSelector.addEventListener('change', async (e) => {
        const newTheme = e.target.value;
        document.documentElement.setAttribute('data-theme', newTheme);
        await DataManager.saveSettings({ theme: newTheme });
    });

    showConfigBtn.addEventListener('click', openConfigModal);
    sidebarSettingsBtn.addEventListener('click', openConfigModal);
    cancelConfigModalBtn.addEventListener('click', () => configModal.classList.add('hidden'));
    saveConfigBtn.addEventListener('click', async () => {
        const geminiKey = document.getElementById('config-geminiApiKey').value;
        await DataManager.saveSettings({ geminiApiKey: geminiKey });
        GEMINI_API_KEY = geminiKey;
        configModal.classList.add('hidden');
    });

    newProjectBtn.addEventListener('click', () => newProjectModal.classList.remove('hidden'));
    cancelProjectModalBtn.addEventListener('click', () => newProjectModal.classList.add('hidden'));
    newProjectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('new-project-title').value;
        const premise = document.getElementById('new-project-premise').value;
        if (!title) return;
        await DataManager.saveProject({ title, premise });
        newProjectForm.reset();
        newProjectModal.classList.add('hidden');
        await renderProjects();
    });

    appScreen.addEventListener('click', (e) => {
        const editButton = e.target.closest('.edit-item-btn');
        if (editButton) {
            const { itemId, itemType } = editButton.dataset;
            if (itemId && itemType) {
                openEditModal(itemId, itemType);
            }
        }
    });

    ideationTabs.addEventListener('click', (e) => {
        const tabButton = e.target.closest('.ideation-tab-btn');
        if (tabButton) switchIdeationTab(tabButton.dataset.tab);
    });

    newIdeaBtn.addEventListener('click', () => newIdeaModal.classList.remove('hidden'));
    cancelIdeaModalBtn.addEventListener('click', () => newIdeaModal.classList.add('hidden'));
    newIdeaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const projectId = await DataManager.getCurrentProjectId();
        const content = document.getElementById('new-idea-content').value;
        if (!projectId || !content) return;
        await DataManager.saveProjectItem(projectId, 'ideas', { content });
        newIdeaForm.reset();
        newIdeaModal.classList.add('hidden');
        await renderProjectItems(projectId, 'ideas', ideasList);
    });

    newCharacterBtn.addEventListener('click', () => {
        characterForm.reset();
        characterForm.querySelector('[name="id"]').value = '';
        characterModal.classList.remove('hidden');
    });
    cancelCharacterModalBtn.addEventListener('click', () => characterModal.classList.add('hidden'));
    saveCharacterBtn.addEventListener('click', () => saveAndCloseForm('characters', characterModal, characterForm));

    newLocationBtn.addEventListener('click', () => {
        locationForm.reset();
        locationForm.querySelector('[name="id"]').value = '';
        locationModal.classList.remove('hidden');
    });
    cancelLocationModalBtn.addEventListener('click', () => locationModal.classList.add('hidden'));
    saveLocationBtn.addEventListener('click', () => saveAndCloseForm('locations', locationModal, locationForm));
    
    newObjectBtn.addEventListener('click', () => {
        objectForm.reset();
        objectForm.querySelector('[name="id"]').value = '';
        objectModal.classList.remove('hidden');
    });
    cancelObjectModalBtn.addEventListener('click', () => objectModal.classList.add('hidden'));
    saveObjectBtn.addEventListener('click', () => saveAndCloseForm('objects', objectModal, objectForm));

    newSystemBtn.addEventListener('click', () => {
        systemForm.reset();
        systemForm.querySelector('[name="id"]').value = '';
        systemModal.classList.remove('hidden');
    });
    cancelSystemModalBtn.addEventListener('click', () => systemModal.classList.add('hidden'));
    saveSystemBtn.addEventListener('click', () => saveAndCloseForm('systems', systemModal, systemForm));
}

// --- UI UTILITIES ---
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
    document.querySelectorAll('.ideation-tab-content').forEach(content => {
        content.id === `${tabName}-content` ? content.classList.remove('hidden') : content.classList.add('hidden');
    });
}

// --- INITIALIZATION ---
async function startApp() {
    // Assegnazione variabili DOM
    authScreen = document.getElementById('auth-screen');
    appScreen = document.getElementById('app-screen');
    mainNav = document.getElementById('main-nav');
    contentPanels = document.querySelectorAll('.view-content');
    themeSelector = document.getElementById('theme-selector');
    showConfigBtn = document.getElementById('show-config-btn');
    configModal = document.getElementById('config-modal');
    configForm = document.getElementById('config-form');
    saveConfigBtn = document.getElementById('save-config-btn');
    cancelConfigModalBtn = document.getElementById('cancel-config-modal');
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
    objectsList = document.getElementById('objects-list');
    systemsList = document.getElementById('systems-list');
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
    newObjectBtn = document.getElementById('new-object-btn');
    objectModal = document.getElementById('object-modal');
    objectForm = document.getElementById('object-form');
    saveObjectBtn = document.getElementById('save-object-btn');
    cancelObjectModalBtn = document.getElementById('cancel-object-modal');
    newSystemBtn = document.getElementById('new-system-btn');
    systemModal = document.getElementById('system-modal');
    systemForm = document.getElementById('system-form');
    saveSystemBtn = document.getElementById('save-system-btn');
    cancelSystemModalBtn = document.getElementById('cancel-system-modal');
    geminiSubmitBtn = document.getElementById('gemini-submit');
    geminiPrompt = document.getElementById('gemini-prompt');
    geminiResponse = document.getElementById('gemini-response');
    saveGeminiResponseBtn = document.getElementById('save-gemini-response-btn');
    sidebarSettingsBtn = document.getElementById('sidebar-settings-btn');

    authScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    document.getElementById('user-info').style.display = 'none';

    setupEventListeners();
    await loadAndApplyConfig();
    
    const currentProjectId = await DataManager.getCurrentProjectId();
    if (currentProjectId) {
        await selectProject(currentProjectId);
    } else {
        switchView('dashboard');
    }
    
    await renderProjects();
    lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', startApp);