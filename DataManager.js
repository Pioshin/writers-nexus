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
let uiNotifier = null;

function generateId(prefix = 'item') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getDb() {
  if (!dbPromise) {
    dbPromise = idb.openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        console.log(`Upgrading DB from ${oldVersion} to ${DB_VERSION}`);
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

export const DataManager = {
  init(notifier) {
    uiNotifier = notifier;
  },

  // --- Scene Methods ---
  async getScenesForStage(projectId, stageKey) {
    const db = await getDb();
    const allScenes = await db.getAllFromIndex('scenes', 'by_projectId', projectId);
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

  // --- Project Data Export/Import ---
  async getProjectData(projectId) {
    const db = await getDb();
    const data = { projectId, exportedAt: new Date().toISOString() };

    for (const store of STORE_NAMES) {
      if (store === 'settings') continue;
      if (store === 'projects') {
        const p = await db.get('projects', projectId);
        if (p) data.project = p;
      } else {
        const items = await db.getAllFromIndex(store, 'by_projectId', projectId);
        data[store] = items;
      }
    }
    return data;
  },

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

    const settings = await this.getSettings();
    if (settings.currentProjectId === id) {
      await this.saveSettings({ currentProjectId: null, currentSceneId: null });
    }

    window.dispatchEvent(
      new CustomEvent('datachanged', { detail: { storeName: 'projects' } })
    );
  },

  async importProjectData(jsonData, options = {}) {
    const { maxItems = 5000, overwrite = true } = options;
    const db = await getDb();

    // Validazione struttura base
    if (!jsonData || typeof jsonData !== 'object') {
      throw new Error("Formato non valido: il file deve contenere un oggetto JSON.");
    }
    if (!jsonData.project || !jsonData.project.id || !jsonData.project.title) {
      throw new Error("Formato non valido: manca il campo 'project' con 'id' e 'title'.");
    }

    const projectId = jsonData.project.id;
    const projectTitle = jsonData.project.title;

    // Verifica se il progetto esiste già
    const existingProject = await db.get('projects', projectId);
    if (existingProject && !overwrite) {
      throw new Error(`Il progetto "${projectTitle}" esiste già. Usa overwrite:true per sovrascrivere.`);
    }

    // Validazione dimensione (protezione da file enormi)
    let totalItems = 0;
    const storesToValidate = STORE_NAMES.filter(s => s !== 'projects' && s !== 'settings');
    for (const storeName of storesToValidate) {
      const items = jsonData[storeName];
      if (Array.isArray(items)) {
        totalItems += items.length;
        if (totalItems > maxItems) {
          throw new Error(`File troppo grande: superato il limite di ${maxItems} elementi totali.`);
        }
        // Valida che ogni item abbia un id
        for (const item of items) {
          if (!item.id) {
            throw new Error(`Elemento senza id trovato in ${storeName}.`);
          }
        }
      }
    }

    // Sanitizza il progetto
    const projectToSave = {
      ...jsonData.project,
      id: projectId,
      importedAt: Date.now(),
      lastModified: Date.now()
    };

    const tx = db.transaction(STORE_NAMES, 'readwrite');

    await tx.objectStore('projects').put(projectToSave);

    for (const storeName of storesToValidate) {
      const store = tx.objectStore(storeName);
      const index = store.index('by_projectId');

      // Pulisci dati esistenti per questo progetto
      const keys = await index.getAllKeys(projectId);
      for (const key of keys) {
        await store.delete(key);
      }

      // Inserisci nuovi dati
      const items = jsonData[storeName] || [];
      for (const item of items) {
        const sanitizedItem = {
          ...item,
          projectId: projectId,
          lastModified: item.lastModified || Date.now()
        };
        await store.put(sanitizedItem);
      }
    }

    await tx.done;

    await this.setCurrentProjectId(projectId);

    return { title: projectTitle, itemCount: totalItems };
  },

  // Export tutti i progetti
  async exportAllProjects() {
    const projects = await this.getProjects();
    const allData = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      projectCount: projects.length,
      projects: []
    };

    for (const project of projects) {
      const projectData = await this.getProjectData(project.id);
      allData.projects.push(projectData);
    }

    return allData;
  },

  // Import tutti i progetti da backup completo
  async importAllProjects(jsonData, options = {}) {
    if (!jsonData.projects || !Array.isArray(jsonData.projects)) {
      throw new Error("Formato non valido: manca l'array 'projects'.");
    }

    const results = [];
    for (const projectData of jsonData.projects) {
      try {
        const result = await this.importProjectData(projectData, options);
        results.push({ success: true, ...result });
      } catch (e) {
        results.push({ success: false, error: e.message, title: projectData?.project?.title || 'Unknown' });
      }
    }

    return results;
  },

  // --- Settings ---
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
    });
  },

  async getCurrentSceneId() {
    const settings = await this.getSettings();
    return settings.currentSceneId;
  },

  async setCurrentSceneId(sceneId) {
    await this.saveSettings({ currentSceneId: sceneId });
  },

  // --- Projects CRUD ---
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

    window.dispatchEvent(
      new CustomEvent('datachanged', { detail: { storeName: 'projects' } })
    );

    await this.setCurrentProjectId(id);
    return project;
  },

  // --- Project Items CRUD ---
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

  // --- Helpers for project store cleanup ---
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
};
