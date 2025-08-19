const DB_NAME = 'WriterNexusDB';
const DB_VERSION = 1;
const STORE_NAMES = ['projects', 'ideas', 'characters', 'locations', 'objects', 'systems', 'settings'];

let dbPromise = null;
let firebaseSync = null;
let uiNotifier = null;

function generateId(prefix = 'item') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getDb() {
    if (!dbPromise) {
        dbPromise = idb.openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                STORE_NAMES.forEach(storeName => {
                    if (!db.objectStoreNames.contains(storeName)) {
                        const store = db.createObjectStore(storeName, { keyPath: 'id' });
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

async function getAllLocalData() {
    const db = await getDb();
    const allData = {};
    for (const storeName of STORE_NAMES) {
        allData[storeName] = await db.getAll(storeName);
    }
    return allData;
}

export const DataManager = {
    // --- Inizializzazione e Sincronizzazione ---
    init(fs, notifier) {
        firebaseSync = fs;
        uiNotifier = notifier;
    },

    async sync() {
        if (!firebaseSync || !uiNotifier || !(await firebaseSync.checkConnection())) {
            console.log("Sync skipped: Firebase not connected or configured.");
            uiNotifier.showStatus("Modalità offline", { autoClose: 3000 });
            return;
        }

        uiNotifier.showStatus("Verifica dati remoti...", { isLoading: true });
        const remoteTs = await firebaseSync.getRemoteTimestamps();
        const localData = await getAllLocalData();

        if (!remoteTs) {
            uiNotifier.showStatus("Errore nel recupero dati remoti.", { isError: true, autoClose: 5000 });
            return;
        }

        const comparison = this._compareTimestamps(localData, remoteTs);
        uiNotifier.closeStatus();

        switch (comparison.status) {
            case 'REMOTE_EMPTY':
                uiNotifier.showStatus("Nessun dato remoto, carico la versione locale...", { isLoading: true });
                await this.uploadLocalData();
                uiNotifier.showStatus("Dati locali caricati con successo!", { autoClose: 3000 });
                break;
            case 'SYNCED':
                uiNotifier.showStatus("Dati sincronizzati.", { autoClose: 2000 });
                break;
            case 'LOCAL_NEWER':
                uiNotifier.showConflict('LOCAL_NEWER', comparison.diff);
                break;
            case 'REMOTE_NEWER':
                uiNotifier.showConflict('REMOTE_NEWER', comparison.diff);
                break;
            case 'DIVERGED':
                uiNotifier.showConflict('DIVERGED', comparison.diff);
                break;
        }
    },

    _compareTimestamps(localData, remoteTs) {
        let localNewerCount = 0;
        let remoteNewerCount = 0;
        const diff = { local: [], remote: [] };

        STORE_NAMES.forEach(store => {
            const localItems = localData[store] || [];
            const remoteItems = remoteTs[store] || {};

            localItems.forEach(item => {
                const remoteTimestamp = remoteItems[item.id];
                if (!remoteTimestamp) {
                    localNewerCount++;
                    diff.local.push(item.id);
                } else if (item.lastModified > remoteTimestamp) {
                    localNewerCount++;
                    diff.local.push(item.id);
                }
            });

            Object.keys(remoteItems).forEach(id => {
                const localItem = localItems.find(item => item.id === id);
                if (!localItem) {
                    remoteNewerCount++;
                    diff.remote.push(id);
                } else if (remoteItems[id] > localItem.lastModified) {
                    remoteNewerCount++;
                    diff.remote.push(id);
                }
            });
        });

        if (localNewerCount === 0 && remoteNewerCount === 0) return { status: 'SYNCED' };
        const isRemoteEmpty = Object.values(remoteTs).every(s => Object.keys(s).length === 0);
        if (isRemoteEmpty) return { status: 'REMOTE_EMPTY' };
        if (localNewerCount > 0 && remoteNewerCount === 0) return { status: 'LOCAL_NEWER', diff };
        if (remoteNewerCount > 0 && localNewerCount === 0) return { status: 'REMOTE_NEWER', diff };
        return { status: 'DIVERGED', diff };
    },

    async uploadLocalData() {
        uiNotifier.showStatus("Caricamento dati su server...", { isLoading: true });
        const result = await firebaseSync.uploadData(this);
        if (result.success) {
            uiNotifier.showStatus("Caricamento completato!", { autoClose: 3000 });
        } else {
            uiNotifier.showStatus(`Errore: ${result.error}`, { isError: true, autoClose: 5000 });
        }
    },

    async downloadRemoteData() {
        uiNotifier.showStatus("Scaricando dati dal server...", { isLoading: true });
        const remoteData = await firebaseSync.downloadData();
        if (remoteData) {
            const db = await getDb();
            const tx = db.transaction(STORE_NAMES, 'readwrite');
            for (const storeName of STORE_NAMES) {
                await tx.objectStore(storeName).clear();
                for (const item of remoteData[storeName]) {
                    await tx.objectStore(storeName).put(item);
                }
            }
            await tx.done;
            uiNotifier.showStatus("Dati scaricati e aggiornati localmente!", { autoClose: 3000 });
            window.location.reload();
        } else {
            uiNotifier.showStatus("Errore durante il download.", { isError: true, autoClose: 5000 });
        }
    },

    async syncOnClose() {
        if (!firebaseSync || !(await firebaseSync.checkConnection())) return;
        const remoteTs = await firebaseSync.getRemoteTimestamps();
        const localData = await getAllLocalData();
        const comparison = this._compareTimestamps(localData, remoteTs);
        if (comparison.status === 'LOCAL_NEWER') {
            console.log("Syncing on close: local data is newer, uploading.");
            await firebaseSync.uploadData(this);
        }
    },

    // --- Metodi DB Esistenti ---
    async getProjects() {
        const db = await getDb();
        return db.getAll('projects');
    },
    async getProject(id) {
        const db = await getDb();
        return db.get('projects', id);
    },
    async saveProject(projectData) {
        const db = await getDb();
        const id = projectData.id || generateId('proj');
        const now = Date.now();
        const project = { ...projectData, id, lastModified: now };
        if (!project.createdAt) project.createdAt = now;
        await db.put('projects', project);
        return project;
    },
    async deleteProject(id) {
        const db = await getDb();
        const tx = db.transaction(STORE_NAMES, 'readwrite');
        await tx.objectStore('projects').delete(id);
        const itemStores = STORE_NAMES.filter(s => s !== 'projects' && s !== 'settings');
        for (const storeName of itemStores) {
            const index = tx.objectStore(storeName).index('by_projectId');
            for await (const cursor of index.iterate(id)) {
                await cursor.delete();
            }
        }
        await tx.done;
    },
    async getProjectItems(projectId, itemType) {
        const db = await getDb();
        return db.getAllFromIndex(itemType, 'by_projectId', projectId);
    },
    async saveProjectItem(projectId, itemType, itemData) {
        const db = await getDb();
        const id = itemData.id || generateId(itemType.slice(0, 4));
        const now = Date.now();
        const item = { ...itemData, id, projectId, lastModified: now };
        if (!item.createdAt) item.createdAt = now;
        await db.put(itemType, item);
        return item;
    },
    async deleteProjectItem(itemType, itemId) {
        const db = await getDb();
        await db.delete(itemType, itemId);
    },
    async getSettings() {
        const db = await getDb();
        let settings = await db.get('settings', 'user_settings');
        if (!settings) {
            settings = { id: 'user_settings', theme: 'scifi', currentProjectId: null, lastModified: Date.now() };
        }
        return settings;
    },
    async saveSettings(settingsData) {
        const db = await getDb();
        const currentSettings = await this.getSettings();
        const newSettings = { ...currentSettings, ...settingsData, id: 'user_settings', lastModified: Date.now() };
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