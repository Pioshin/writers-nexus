const DB_NAME = 'WriterNexusDB';
const DB_VERSION = 1;
const STORE_NAMES = ['projects', 'ideas', 'characters', 'locations', 'objects', 'systems', 'settings'];

// --- Utility per ID univoci ---
function generateId(prefix = 'item') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// --- Connessione al DB ---
let dbPromise = null;
function getDb() {
    if (!dbPromise) {
        dbPromise = idb.openDB(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion, newVersion, transaction) {
                console.log(`Upgrading DB from ${oldVersion} to ${newVersion}`);
                STORE_NAMES.forEach(storeName => {
                    if (!db.objectStoreNames.contains(storeName)) {
                        const store = db.createObjectStore(storeName, { keyPath: 'id' });
                        // Aggiungiamo indici per recuperare gli elementi per progetto
                        if (storeName !== 'projects' && storeName !== 'settings') {
                            store.createIndex('by_projectId', 'projectId');
                        }
                    }
                });
            },
        });
    }
    return dbPromise;
}

// --- API Pubblica del DataManager (versione IndexedDB) ---

export const DataManager = {
    // --- Progetti ---
    async getProjects() {
        const db = await getDb();
        const projects = await db.getAll('projects');
        return projects.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },

    async getProject(id) {
        const db = await getDb();
        return db.get('projects', id);
    },

    async saveProject(projectData) {
        const db = await getDb();
        const id = projectData.id || generateId('proj');
        const project = { ...projectData, id };
        if (!project.createdAt) {
            project.createdAt = Date.now();
        }
        await db.put('projects', project);
        return project;
    },
    
    async deleteProject(id) {
        const db = await getDb();
        const tx = db.transaction(STORE_NAMES, 'readwrite');
        const stores = {};
        STORE_NAMES.forEach(name => stores[name] = tx.objectStore(name));

        // Elimina progetto
        await stores.projects.delete(id);

        // Elimina dati collegati
        const itemTypes = ['ideas', 'characters', 'locations', 'objects', 'systems'];
        for (const type of itemTypes) {
            const index = stores[type].index('by_projectId');
            let cursor = await index.openCursor(id);
            while (cursor) {
                await cursor.delete();
                cursor = await cursor.continue();
            }
        }
        await tx.done;
    },

    // --- Elementi del Progetto ---
    async getProjectItems(projectId, itemType) {
        const db = await getDb();
        const items = await db.getAllFromIndex(itemType, 'by_projectId', projectId);
        return items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },

    async saveProjectItem(projectId, itemType, itemData) {
        const db = await getDb();
        const id = itemData.id || generateId(itemType.slice(0, 4));
        const item = { ...itemData, id, projectId };
         if (!item.createdAt) {
            item.createdAt = Date.now();
        }
        await db.put(itemType, item);
        return item;
    },
    
    async deleteProjectItem(itemType, itemId) {
        const db = await getDb();
        await db.delete(itemType, itemId);
    },

    // --- Impostazioni ---
    async getSettings() {
        const db = await getDb();
        // Le impostazioni sono salvate come un singolo oggetto con id fisso
        let settings = await db.get('settings', 'user_settings');
        if (!settings) {
            settings = { id: 'user_settings', theme: 'scifi', currentProjectId: null };
        }
        return settings;
    },

    async saveSettings(settingsData) {
        const db = await getDb();
        const currentSettings = await this.getSettings();
        const newSettings = { ...currentSettings, ...settingsData, id: 'user_settings' };
        await db.put('settings', newSettings);
        return newSettings;
    },
    
    async getCurrentProjectId() {
        const settings = await this.getSettings();
        return settings.currentProjectId;
    },

    async setCurrentProjectId(projectId) {
        await this.saveSettings({ currentProjectId: projectId });
    }
};