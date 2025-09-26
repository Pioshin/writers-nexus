const DB_NAME = 'WriterNexusDB';
const DB_VERSION = 4;
const STORE_NAMES = [
  'projects',
  'ideas',
  'characters',
  'locations',
  'objects',
  'systems',
  'settings',
  'scenes',
  'geography',
  'history',
  'culture',
  'plotlines',
];

let dbPromise = null;
let firebaseSync = null;
let uiNotifier = null;

function generateId(prefix = 'item') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getDb() {
  if (!dbPromise) {
    dbPromise = idb.openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        console.log(`Upgrading DB from ${oldVersion} to ${DB_VERSION}`);
        // Create stores if missing (handles all upgrade paths)
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
  init(fs, notifier) {
    firebaseSync = fs;
    uiNotifier = notifier;
  },

  // ... (sync methods remain the same) ...

  // --- Metodi per le Scene ---
  async getScenesForStage(projectId, stageKey) {
    const db = await getDb();
    const allScenes = await db.getAllFromIndex(
      'scenes',
      'by_projectId',
      projectId
    );
    return allScenes
      .filter(scene => scene.stageKey === stageKey)
      .sort((a, b) => a.order - b.order);
  },

  async getScene(sceneId) {
    const db = await getDb();
    return db.get('scenes', sceneId);
  },

  async saveScene(sceneData) {
    const db = await getDb();
    const id = sceneData.id || generateId('scene');
    const now = Date.now();

    // Ensure projectId is set
    if (!sceneData.projectId) {
      sceneData.projectId = await this.getCurrentProjectId();
    }

    const scene = {
      content: '',
      ...sceneData,
      id,
      lastModified: now,
    };
    if (!scene.createdAt) {
      scene.createdAt = now;
    }
    await db.put('scenes', scene);
    return scene;
  },

  async deleteScene(sceneId) {
    const db = await getDb();
    await db.delete('scenes', sceneId);
  },

  // --- Metodi per Progetti e Impostazioni ---
  async deleteProject(id) {
    const db = await getDb();
    const tx = db.transaction(STORE_NAMES, 'readwrite');
    await tx.objectStore('projects').delete(id);
    const scenesIndex = tx.objectStore('scenes').index('by_projectId');
    for await (const cursor of scenesIndex.iterate(id)) {
      await cursor.delete();
    }
    const itemStores = STORE_NAMES.filter(
      s => s !== 'projects' && s !== 'settings' && s !== 'scenes'
    );
    for (const storeName of itemStores) {
      const index = tx.objectStore(storeName).index('by_projectId');
      for await (const cursor of index.iterate(id)) {
        await cursor.delete();
      }
    }
    await tx.done;
    // Se il progetto cancellato era quello corrente, azzera le impostazioni correnti
    const settings = await this.getSettings();
    if (settings.currentProjectId === id) {
      await this.saveSettings({ currentProjectId: null, currentSceneId: null });
    }

    // Dispatch change event
    window.dispatchEvent(
      new CustomEvent('datachanged', { detail: { storeName: 'projects' } })
    );
  },

  async getSettings() {
    const db = await getDb();
    let settings = await db.get('settings', 'user_settings');
    if (!settings) {
      settings = {
        id: 'user_settings',
        theme: 'scifi',
        currentProjectId: null,
        currentSceneId: null,
        lastModified: Date.now(),
        // IA defaults
        aiProvider: 'openai-compatible',
        aiBaseUrl: '',
        aiModel: '',
        aiHeaders: {},
        aiApiKey: '',
      };
    }
    return settings;
  },

  async saveSettings(settingsData) {
    const db = await getDb();
    const currentSettings = await this.getSettings();
    const newSettings = {
      ...currentSettings,
      ...settingsData,
      id: 'user_settings',
      lastModified: Date.now(),
    };
    await db.put('settings', newSettings);

    // Dispatch change event
    window.dispatchEvent(
      new CustomEvent('settingschanged', { detail: { newSettings } })
    );

    return newSettings;
  },

  async getCurrentProjectId() {
    const settings = await this.getSettings();
    return settings.currentProjectId;
  },

  async setCurrentProjectId(projectId) {
    await this.saveSettings({
      currentProjectId: projectId,
      currentSceneId: null,
    }); // Reset scene when project changes
  },

  async getCurrentSceneId() {
    const settings = await this.getSettings();
    return settings.currentSceneId;
  },

  async setCurrentSceneId(sceneId) {
    await this.saveSettings({ currentSceneId: sceneId });
  },
};

// Fill in the other existing methods to keep the object complete
Object.assign(DataManager, {
  async sync() {
    if (
      !firebaseSync ||
      !uiNotifier ||
      !(await firebaseSync.checkConnection())
    ) {
      console.log('Sync skipped: Firebase not connected or configured.');
      uiNotifier.showStatus('Modalità offline', { autoClose: 3000 });
      return;
    }
    uiNotifier.showStatus('Verifica dati remoti...', { isloading: true });
    const remoteTs = await firebaseSync.getRemoteTimestamps();
    const localData = await getAllLocalData();
    if (!remoteTs) {
      uiNotifier.showStatus('Errore nel recupero dati remoti.', {
        isError: true,
        autoClose: 5000,
      });
      return;
    }
    const comparison = this._compareTimestamps(localData, remoteTs);
    uiNotifier.closeStatus();
    switch (comparison.status) {
      case 'REMOTE_EMPTY':
        uiNotifier.showStatus(
          'Nessun dato remoto, carico la versione locale...',
          { isLoading: true }
        );
        await this.uploadLocalData();
        uiNotifier.showStatus('Dati locali caricati con successo!', {
          autoClose: 3000,
        });
        break;
      case 'SYNCED':
        uiNotifier.showStatus('Dati sincronizzati.', { autoClose: 2000 });
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
    if (localNewerCount === 0 && remoteNewerCount === 0)
      return { status: 'SYNCED' };
    const isRemoteEmpty = Object.values(remoteTs).every(
      s => Object.keys(s).length === 0
    );
    if (isRemoteEmpty) return { status: 'REMOTE_EMPTY' };
    if (localNewerCount > 0 && remoteNewerCount === 0)
      return { status: 'LOCAL_NEWER', diff };
    if (remoteNewerCount > 0 && localNewerCount === 0)
      return { status: 'REMOTE_NEWER', diff };
    return { status: 'DIVERGED', diff };
  },
  async uploadLocalData() {
    uiNotifier.showStatus('Caricamento dati su server...', { isLoading: true });
    const result = await firebaseSync.uploadData(this);
    if (result.success) {
      uiNotifier.showStatus('Caricamento completato!', { autoClose: 3000 });
    } else {
      uiNotifier.showStatus(`Errore: ${result.error}`, {
        isError: true,
        autoClose: 5000,
      });
    }
  },
  async downloadRemoteData() {
    uiNotifier.showStatus('Scaricando dati dal server...', { isLoading: true });
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
      uiNotifier.showStatus('Dati scaricati e aggiornati localmente!', {
        autoClose: 3000,
      });
      window.location.reload();
    } else {
      uiNotifier.showStatus('Errore durante il download.', {
        isError: true,
        autoClose: 5000,
      });
    }
  },
  async syncOnClose() {
    if (!firebaseSync || !(await firebaseSync.checkConnection())) return;
    const remoteTs = await firebaseSync.getRemoteTimestamps();
    const localData = await getAllLocalData();
    const comparison = this._compareTimestamps(localData, remoteTs);
    if (comparison.status === 'LOCAL_NEWER') {
      console.log('Syncing on close: local data is newer, uploading.');
      await firebaseSync.uploadData(this);
    }
  },
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

    // Check for duplicates
    const allProjects = await this.getProjects();
    if (
      allProjects.some(
        p =>
          p.title.toLowerCase() === projectData.title.toLowerCase() &&
          p.id !== projectData.id
      )
    ) {
      throw new Error('A project with this title already exists.');
    }

    const id = projectData.id || generateId('proj');
    const now = Date.now();
    const project = { ...projectData, id, lastModified: now };
    if (!project.createdAt) {
      project.createdAt = now;
    }
    await db.put('projects', project);

    // Dispatch change event
    window.dispatchEvent(
      new CustomEvent('datachanged', { detail: { storeName: 'projects' } })
    );

    // Aggiorna anche il progetto corrente nelle impostazioni
    await this.setCurrentProjectId(id);
    return project;
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
});

// Helpers per import sostitutivo: pulizia dati per progetto
Object.assign(DataManager, {
  async clearProjectStore(projectId, storeName) {
    const db = await getDb();
    const tx = db.transaction(storeName, 'readwrite');
    const index = tx.store.index('by_projectId');
    for await (const cursor of index.iterate(projectId)) {
      await cursor.delete();
    }
    await tx.done;
  },
  async clearProjectStores(projectId, storeNames) {
    for (const s of storeNames) {
      await this.clearProjectStore(projectId, s);
    }
  },
});
