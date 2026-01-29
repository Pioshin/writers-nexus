# Piano di Miglioramento - Writer's Nexus

> Documento guida per l'implementazione delle migliorie identificate.
> Creato: Gennaio 2025 | Versione attuale: v2.0

---

## Indice

1. [Panoramica](#panoramica)
2. [Fase 1: Fix Critici di Sicurezza](#fase-1-fix-critici-di-sicurezza)
3. [Fase 2: Stabilizzazione e Memory Leak](#fase-2-stabilizzazione-e-memory-leak)
4. [Fase 3: Testing Framework](#fase-3-testing-framework)
5. [Fase 4: Completamento Modulo Editing](#fase-4-completamento-modulo-editing)
6. [Fase 5: Sistema Internazionalizzazione (i18n)](#fase-5-sistema-internazionalizzazione-i18n)
7. [Fase 6: Refactoring Modali e Componenti](#fase-6-refactoring-modali-e-componenti)
8. [Fase 7: Accessibilita (a11y)](#fase-7-accessibilita-a11y)
9. [Fase 8: Performance e Ottimizzazioni](#fase-8-performance-e-ottimizzazioni)
10. [Fase 9: Documentazione](#fase-9-documentazione)
11. [Fase 10: Mobile e UX](#fase-10-mobile-e-ux)
12. [Checklist Finale](#checklist-finale)

---

## Panoramica

### Stato Attuale
- **31 file JavaScript** principali
- **24 file HTML** (views + modals)
- **Zero test coverage**
- **UI solo in italiano**
- **Alcune vulnerabilita di sicurezza**

### Priorita
| Livello | Descrizione | Fasi |
|---------|-------------|------|
| CRITICA | Sicurezza, stabilita | 1, 2 |
| ALTA | Testing, funzionalita mancanti | 3, 4 |
| MEDIA | i18n, refactoring, a11y | 5, 6, 7 |
| BASSA | Performance, docs, mobile | 8, 9, 10 |

### Effort Stimato Totale
- **Minimo**: ~80-100 ore
- **Consigliato**: ~120-150 ore (con test completi)

---

## Fase 1: Fix Critici di Sicurezza

**Priorita**: CRITICA
**Effort**: 4-6 ore
**Rischio se non fatto**: Alto (esposizione credenziali)

### 1.1 API Key nelle URL (GET Request)

**Problema**: In `views/modals/config.js:209-210`, la API key viene inviata come parametro GET:
```javascript
// PROBLEMA - API key visibile in browser history e logs
const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
);
```

**Soluzione**: Usare header Authorization o POST request.

**File da modificare**:
- `views/modals/config.js` (linee 195-264)

**Implementazione**:
```javascript
// SOLUZIONE - Usa l'SDK ufficiale Google che gestisce correttamente l'auth
import { GoogleGenerativeAI } from '@google/generative-ai';

async function loadGoogleModels() {
  const apiKey = aiApiKeyInput?.value?.trim() || geminiApiKeyInput?.value?.trim() || '';
  if (!apiKey) {
    googleModelsStatusEl.textContent = 'Inserisci una API Key per caricare i modelli.';
    return;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // L'SDK gestisce l'auth internamente in modo sicuro
    const models = await genAI.listModels();
    // ... resto della logica
  } catch (e) {
    // gestione errore
  }
}
```

**Alternativa** (se SDK non supporta listModels):
```javascript
// Usa POST con body invece di GET con query param
const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey  // Header invece di URL
  }
});
```

**Checklist**:
- [ ] Rimuovere API key dalle URL
- [ ] Usare header per autenticazione
- [ ] Verificare che la chiave non appaia in console/network tab

---

### 1.2 Validazione Input File Import

**Problema**: In `views/modals/import-text.js`, nessun limite su dimensione file:
```javascript
async function readFileAsText(file) {
  if (!file) return '';
  // Nessun controllo dimensione!
  return await file.text();
}
```

**File da modificare**:
- `views/modals/import-text.js`

**Implementazione**:
```javascript
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = ['.txt', '.md', '.markdown'];

async function readFileAsText(file) {
  if (!file) return '';

  // Controllo estensione
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Formato non supportato. Usa: ${ALLOWED_EXTENSIONS.join(', ')}`);
  }

  // Controllo dimensione
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File troppo grande. Massimo: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  // Controllo MIME type (opzionale ma consigliato)
  const allowedMimes = ['text/plain', 'text/markdown', 'text/x-markdown'];
  if (file.type && !allowedMimes.includes(file.type)) {
    console.warn('MIME type non riconosciuto, procedo comunque:', file.type);
  }

  return await file.text();
}
```

**Checklist**:
- [ ] Aggiungere limite dimensione file (5MB suggerito)
- [ ] Validare estensioni permesse
- [ ] Mostrare errore user-friendly se validazione fallisce

---

### 1.3 Sanitizzazione Password Post-Login

**Problema**: In `main.js:301`, la password rimane in memoria dopo login.

**File da modificare**:
- `main.js`

**Implementazione**:
```javascript
async function handleLogin() {
  const passwordInput = document.getElementById('login-password');
  const password = passwordInput.value;

  try {
    const result = await FirebaseSync.login(email, password);
    // ... gestione successo
  } finally {
    // Pulisci sempre la password dalla memoria e dal DOM
    passwordInput.value = '';
  }
}
```

**Checklist**:
- [ ] Pulire campo password dopo login (successo o fallimento)
- [ ] Non loggare mai password in console

---

## Fase 2: Stabilizzazione e Memory Leak

**Priorita**: CRITICA
**Effort**: 6-8 ore
**Rischio se non fatto**: Medio-Alto (crash con uso prolungato)

### 2.1 Event Listener Leak nei Modali

**Problema**: In tutti i modali, gli event listener vengono aggiunti ad ogni `open()` ma mai rimossi.

**File interessati** (tutti i modali):
- `views/modals/new-project.js`
- `views/modals/character.js`
- `views/modals/location.js`
- `views/modals/object.js`
- `views/modals/geography.js`
- `views/modals/history.js`
- `views/modals/culture.js`
- `views/modals/plotline.js`
- `views/modals/system.js`
- `views/modals/scene-editor.js`
- `views/modals/import-text.js`
- `views/modals/config.js`

**Pattern attuale (PROBLEMATICO)**:
```javascript
function init() {
  // Listener aggiunti una volta - OK
  cancelBtn.addEventListener('click', close);
  saveBtn.addEventListener('click', save);
}

function open() {
  // PROBLEMA: se ci sono listener qui, vengono aggiunti ogni volta
  form.addEventListener('submit', handleSubmit);
  modal.classList.remove('hidden');
}

function close() {
  modal.classList.add('hidden');
  // PROBLEMA: listener non rimossi!
}
```

**Pattern corretto**:
```javascript
// Opzione 1: AbortController (consigliato per browser moderni)
let abortController;

function open() {
  abortController = new AbortController();

  form.addEventListener('submit', handleSubmit, { signal: abortController.signal });
  modal.classList.remove('hidden');
}

function close() {
  modal.classList.add('hidden');
  abortController?.abort(); // Rimuove tutti i listener
}

// Opzione 2: Rimozione manuale
function open() {
  form.addEventListener('submit', handleSubmit);
  modal.classList.remove('hidden');
}

function close() {
  modal.classList.add('hidden');
  form.removeEventListener('submit', handleSubmit);
}

// Opzione 3: Flag per evitare duplicati
let listenersAttached = false;

function open() {
  if (!listenersAttached) {
    form.addEventListener('submit', handleSubmit);
    listenersAttached = true;
  }
  modal.classList.remove('hidden');
}
```

**Checklist**:
- [ ] Auditare tutti i 12+ modali per listener leak
- [ ] Implementare pattern AbortController o rimozione manuale
- [ ] Testare apertura/chiusura ripetuta senza aumento memoria

---

### 2.2 Limite Stack Undo

**Problema**: `views/shared/stage-undo.js` non ha limite sullo stack.

**File da modificare**:
- `views/shared/stage-undo.js`

**Implementazione**:
```javascript
const MAX_UNDO_STACK = 50;

class StageUndo {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
  }

  push(state) {
    this.undoStack.push(state);

    // Limita dimensione stack
    if (this.undoStack.length > MAX_UNDO_STACK) {
      this.undoStack.shift(); // Rimuovi il piu vecchio
    }

    this.redoStack = []; // Clear redo on new action
  }
}
```

**Checklist**:
- [ ] Aggiungere costante MAX_UNDO_STACK
- [ ] Implementare logica di trimming
- [ ] Considerare salvataggio su IndexedDB per undo persistente (opzionale)

---

### 2.3 Gestione Errori Centralizzata

**Problema**: Error handling inconsistente, molti `catch {}` vuoti.

**Soluzione**: Creare utility centralizzata.

**Nuovo file**: `js/ErrorHandler.js`
```javascript
export const ErrorHandler = {
  // Categorie errori
  NETWORK: 'network',
  VALIDATION: 'validation',
  DATABASE: 'database',
  AI_SERVICE: 'ai_service',

  handle(error, context = '', options = {}) {
    const { silent = false, rethrow = false } = options;

    // Log strutturato
    console.error(`[${context}]`, error);

    // Notifica utente (se non silent)
    if (!silent) {
      const message = this.getUserMessage(error);
      toast.error(message);
    }

    // Analytics/monitoring (futuro)
    // this.reportToMonitoring(error, context);

    if (rethrow) throw error;
  },

  getUserMessage(error) {
    if (error.message?.includes('Failed to fetch')) {
      return 'Errore di connessione. Verifica la tua rete.';
    }
    if (error.message?.includes('401') || error.message?.includes('403')) {
      return 'Errore di autenticazione. Verifica le credenziali.';
    }
    if (error.message?.includes('QuotaExceeded')) {
      return 'Spazio di archiviazione esaurito.';
    }
    return error.message || 'Si e verificato un errore imprevisto.';
  }
};
```

**Utilizzo**:
```javascript
import { ErrorHandler } from '../js/ErrorHandler.js';

try {
  await DataManager.saveScene(scene);
} catch (error) {
  ErrorHandler.handle(error, 'saveScene');
}
```

**Checklist**:
- [ ] Creare `js/ErrorHandler.js`
- [ ] Sostituire catch vuoti nei file principali
- [ ] Aggiungere messaggi user-friendly per errori comuni

---

## Fase 3: Testing Framework

**Priorita**: ALTA
**Effort**: 16-24 ore (setup + primi test)
**Rischio se non fatto**: Medio (regressioni non rilevate)

### 3.1 Setup Vitest

**Perche Vitest**: Compatibile con ES modules, veloce, sintassi simile a Jest.

**Aggiornare `package.json`**:
```json
{
  "devDependencies": {
    "vitest": "^1.2.0",
    "jsdom": "^24.0.0",
    "@vitest/coverage-v8": "^1.2.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```

**Creare `vitest.config.js`**:
```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'tests/']
    }
  }
});
```

**Checklist**:
- [ ] Installare Vitest e dipendenze
- [ ] Creare configurazione
- [ ] Creare cartella `tests/`
- [ ] Aggiungere script npm

---

### 3.2 Test Prioritari

**Ordine di priorita per i test**:

#### 3.2.1 DataManager.js (CRITICO)
```
tests/
  DataManager.test.js
```

**Aree da testare**:
- CRUD operazioni (create, read, update, delete)
- Sync logic
- Error handling
- Edge cases (dati mancanti, ID duplicati)

**Esempio test**:
```javascript
// tests/DataManager.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { DataManager } from '../DataManager.js';

describe('DataManager', () => {
  beforeEach(async () => {
    // Reset database prima di ogni test
    await DataManager.clearAll();
  });

  describe('Projects', () => {
    it('should create a new project', async () => {
      const project = await DataManager.saveProject({
        title: 'Test Project',
        genre: 'fantasy'
      });

      expect(project.id).toBeDefined();
      expect(project.title).toBe('Test Project');
    });

    it('should retrieve project by id', async () => {
      const created = await DataManager.saveProject({ title: 'Test' });
      const retrieved = await DataManager.getProject(created.id);

      expect(retrieved.title).toBe('Test');
    });

    it('should update existing project', async () => {
      const project = await DataManager.saveProject({ title: 'Original' });
      await DataManager.saveProject({ ...project, title: 'Updated' });

      const updated = await DataManager.getProject(project.id);
      expect(updated.title).toBe('Updated');
    });
  });

  describe('Scenes', () => {
    it('should associate scene with project', async () => {
      const project = await DataManager.saveProject({ title: 'Test' });
      const scene = await DataManager.saveScene({
        projectId: project.id,
        title: 'Scene 1',
        content: 'Content here'
      });

      const scenes = await DataManager.getScenes(project.id);
      expect(scenes).toHaveLength(1);
      expect(scenes[0].title).toBe('Scene 1');
    });
  });
});
```

#### 3.2.2 AIService.js
```
tests/
  AIService.test.js
```

**Aree da testare**:
- Inizializzazione provider
- Fallback comportamento
- Parsing risposte
- Error handling per timeout/network

**Esempio**:
```javascript
// tests/AIService.test.js
import { describe, it, expect, vi } from 'vitest';
import { AIService } from '../ai/AIService.js';

describe('AIService', () => {
  describe('init', () => {
    it('should initialize with OpenAI provider', () => {
      AIService.init({
        provider: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-4'
      });

      expect(AIService.isConfigured()).toBe(true);
    });

    it('should handle missing API key gracefully', () => {
      AIService.init({
        provider: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4'
        // apiKey mancante
      });

      expect(AIService.isConfigured()).toBe(false);
    });
  });

  describe('complete', () => {
    it('should handle network timeout', async () => {
      // Mock fetch con timeout
      vi.spyOn(global, 'fetch').mockImplementation(() =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      );

      await expect(AIService.complete({ prompt: 'test' }))
        .rejects.toThrow('Timeout');
    });
  });
});
```

#### 3.2.3 ConsistencyEngine.js
```
tests/
  ConsistencyEngine.test.js
```

**Aree da testare**:
- Rilevamento personaggi fantasma
- Identificazione trame abbandonate
- Scene vuote
- Report generation

#### 3.2.4 Import Text Parser
```
tests/
  ImportText.test.js
```

**Aree da testare**:
- Parsing testo semplice
- Segmentazione in scene
- Gestione caratteri speciali
- Merge con contenuto esistente

**Checklist**:
- [ ] Scrivere test per DataManager.js (minimo 10 test)
- [ ] Scrivere test per AIService.js (minimo 8 test)
- [ ] Scrivere test per ConsistencyEngine.js (minimo 6 test)
- [ ] Scrivere test per import-text.js (minimo 5 test)
- [ ] Raggiungere 60%+ coverage sui file critici

---

### 3.3 Mock e Fixtures

**Creare `tests/fixtures/`**:
```
tests/
  fixtures/
    project.json
    scenes.json
    characters.json
    sample-import.txt
  mocks/
    indexeddb.js
    fetch.js
```

**Esempio fixture**:
```javascript
// tests/fixtures/project.json
{
  "id": "test-project-1",
  "title": "Il Viaggio dell'Eroe",
  "genre": "fantasy",
  "tone": "epic",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

**Esempio mock IndexedDB**:
```javascript
// tests/mocks/indexeddb.js
import { vi } from 'vitest';

export function mockIndexedDB() {
  const store = new Map();

  return {
    open: vi.fn(() => Promise.resolve({
      get: (key) => Promise.resolve(store.get(key)),
      put: (key, value) => { store.set(key, value); return Promise.resolve(); },
      delete: (key) => { store.delete(key); return Promise.resolve(); },
      getAll: () => Promise.resolve([...store.values()])
    }))
  };
}
```

---

## Fase 4: Completamento Modulo Editing

**Priorita**: ALTA
**Effort**: 20-30 ore
**Rischio se non fatto**: Funzionalita incompleta

### 4.1 Analisi Requisiti

Il modulo `views/editing/editing.js` e attualmente uno stub (11 righe).

**Funzionalita da implementare**:

1. **Editor Avanzato**
   - Formattazione testo (grassetto, corsivo, sottolineato)
   - Intestazioni (H1, H2, H3)
   - Liste puntate/numerate
   - Citazioni

2. **Strumenti di Revisione**
   - Evidenziazione testo
   - Commenti inline
   - Track changes (opzionale)
   - Note a margine

3. **Analisi Testo**
   - Conteggio parole/caratteri/paragrafi
   - Tempo di lettura stimato
   - Rilevamento ripetizioni
   - Analisi leggibilita (indice Gulpease per italiano)

4. **Esportazione**
   - Export in Markdown
   - Export in HTML
   - Export in DOCX (opzionale, richiede libreria)
   - Export in PDF (opzionale)

### 4.2 Struttura File

```
views/
  editing/
    editing.html        # Template view
    editing.js          # Logica principale
    editing.css         # Stili specifici (opzionale)

js/
  TextAnalyzer.js       # Utility analisi testo
  ExportManager.js      # Gestione export
```

### 4.3 Implementazione editing.html

```html
<div id="editing-view" class="flex flex-col h-full">
  <!-- Toolbar -->
  <div class="editing-toolbar flex items-center gap-2 p-2 border-b border-white/10">
    <!-- Formattazione -->
    <div class="toolbar-group flex gap-1">
      <button id="btn-bold" class="toolbar-btn" title="Grassetto (Ctrl+B)">
        <i data-lucide="bold"></i>
      </button>
      <button id="btn-italic" class="toolbar-btn" title="Corsivo (Ctrl+I)">
        <i data-lucide="italic"></i>
      </button>
      <button id="btn-underline" class="toolbar-btn" title="Sottolineato (Ctrl+U)">
        <i data-lucide="underline"></i>
      </button>
    </div>

    <div class="toolbar-divider"></div>

    <!-- Intestazioni -->
    <div class="toolbar-group flex gap-1">
      <select id="heading-select" class="toolbar-select">
        <option value="p">Paragrafo</option>
        <option value="h1">Titolo 1</option>
        <option value="h2">Titolo 2</option>
        <option value="h3">Titolo 3</option>
      </select>
    </div>

    <div class="toolbar-divider"></div>

    <!-- Strumenti revisione -->
    <div class="toolbar-group flex gap-1">
      <button id="btn-highlight" class="toolbar-btn" title="Evidenzia">
        <i data-lucide="highlighter"></i>
      </button>
      <button id="btn-comment" class="toolbar-btn" title="Aggiungi commento">
        <i data-lucide="message-square"></i>
      </button>
    </div>

    <div class="flex-1"></div>

    <!-- Export -->
    <div class="toolbar-group flex gap-1">
      <button id="btn-export" class="toolbar-btn-primary">
        <i data-lucide="download"></i>
        <span>Esporta</span>
      </button>
    </div>
  </div>

  <!-- Editor Area -->
  <div class="flex-1 flex overflow-hidden">
    <!-- Main Editor -->
    <div id="editing-main" class="flex-1 overflow-auto p-4">
      <div id="editor-container" class="prose prose-invert max-w-none" contenteditable="true">
        <!-- Contenuto editabile -->
      </div>
    </div>

    <!-- Sidebar Analisi -->
    <div id="editing-sidebar" class="w-64 border-l border-white/10 p-4 overflow-auto">
      <h3 class="text-sm font-semibold mb-3">Statistiche</h3>
      <div class="stats-grid text-sm space-y-2">
        <div class="flex justify-between">
          <span class="text-white/60">Parole</span>
          <span id="stat-words">0</span>
        </div>
        <div class="flex justify-between">
          <span class="text-white/60">Caratteri</span>
          <span id="stat-chars">0</span>
        </div>
        <div class="flex justify-between">
          <span class="text-white/60">Paragrafi</span>
          <span id="stat-paragraphs">0</span>
        </div>
        <div class="flex justify-between">
          <span class="text-white/60">Tempo lettura</span>
          <span id="stat-reading-time">0 min</span>
        </div>
      </div>

      <h3 class="text-sm font-semibold mt-6 mb-3">Leggibilita</h3>
      <div id="readability-score" class="text-center">
        <div class="text-3xl font-bold">--</div>
        <div class="text-xs text-white/60">Indice Gulpease</div>
      </div>

      <h3 class="text-sm font-semibold mt-6 mb-3">Avvisi</h3>
      <div id="warnings-list" class="text-sm space-y-2">
        <!-- Avvisi dinamici -->
      </div>
    </div>
  </div>
</div>
```

### 4.4 Implementazione editing.js

```javascript
// views/editing/editing.js
import { TextAnalyzer } from '../../js/TextAnalyzer.js';
import { ExportManager } from '../../js/ExportManager.js';

let DataManager, FirebaseSync, loadModal;
let editorContainer, statsElements, warningsList;
let analyzer;

export default {
  init(dataManager, firebaseSync, modalLoader) {
    DataManager = dataManager;
    FirebaseSync = firebaseSync;
    loadModal = modalLoader;
    analyzer = new TextAnalyzer();

    initElements();
    initToolbar();
    initEditor();
  }
};

function initElements() {
  editorContainer = document.getElementById('editor-container');
  statsElements = {
    words: document.getElementById('stat-words'),
    chars: document.getElementById('stat-chars'),
    paragraphs: document.getElementById('stat-paragraphs'),
    readingTime: document.getElementById('stat-reading-time'),
    readability: document.getElementById('readability-score')
  };
  warningsList = document.getElementById('warnings-list');
}

function initToolbar() {
  // Formattazione
  document.getElementById('btn-bold')?.addEventListener('click', () => execCommand('bold'));
  document.getElementById('btn-italic')?.addEventListener('click', () => execCommand('italic'));
  document.getElementById('btn-underline')?.addEventListener('click', () => execCommand('underline'));

  // Heading select
  document.getElementById('heading-select')?.addEventListener('change', (e) => {
    execCommand('formatBlock', e.target.value);
  });

  // Highlight
  document.getElementById('btn-highlight')?.addEventListener('click', toggleHighlight);

  // Export
  document.getElementById('btn-export')?.addEventListener('click', showExportDialog);

  // Keyboard shortcuts
  editorContainer?.addEventListener('keydown', handleKeyboardShortcuts);
}

function initEditor() {
  if (!editorContainer) return;

  // Carica contenuto progetto corrente
  loadContent();

  // Aggiorna statistiche su input
  let debounceTimer;
  editorContainer.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updateStats();
      autoSave();
    }, 300);
  });
}

async function loadContent() {
  const projectId = DataManager.getCurrentProjectId();
  if (!projectId) return;

  const scenes = await DataManager.getScenes(projectId);
  const fullText = scenes
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map(s => s.content || '')
    .join('\n\n---\n\n');

  editorContainer.innerHTML = formatForEditor(fullText);
  updateStats();
}

function formatForEditor(text) {
  // Converti markdown base in HTML
  return text
    .split('\n')
    .map(line => `<p>${line || '<br>'}</p>`)
    .join('');
}

function execCommand(command, value = null) {
  document.execCommand(command, false, value);
  editorContainer.focus();
}

function toggleHighlight() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const span = document.createElement('span');
  span.className = 'bg-yellow-500/30';
  range.surroundContents(span);
}

function handleKeyboardShortcuts(e) {
  if (e.ctrlKey || e.metaKey) {
    switch (e.key.toLowerCase()) {
      case 'b':
        e.preventDefault();
        execCommand('bold');
        break;
      case 'i':
        e.preventDefault();
        execCommand('italic');
        break;
      case 'u':
        e.preventDefault();
        execCommand('underline');
        break;
      case 's':
        e.preventDefault();
        autoSave();
        break;
    }
  }
}

function updateStats() {
  const text = editorContainer.innerText || '';
  const stats = analyzer.analyze(text);

  statsElements.words.textContent = stats.words.toLocaleString();
  statsElements.chars.textContent = stats.characters.toLocaleString();
  statsElements.paragraphs.textContent = stats.paragraphs.toLocaleString();
  statsElements.readingTime.textContent = `${stats.readingTimeMinutes} min`;

  // Indice Gulpease (0-100, piu alto = piu leggibile)
  const readabilityEl = statsElements.readability.querySelector('.text-3xl');
  if (readabilityEl) {
    readabilityEl.textContent = stats.gulpiease;
    readabilityEl.className = `text-3xl font-bold ${getReadabilityColor(stats.gulpiease)}`;
  }

  // Aggiorna avvisi
  updateWarnings(stats.warnings);
}

function getReadabilityColor(score) {
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-yellow-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

function updateWarnings(warnings) {
  if (!warningsList) return;

  warningsList.innerHTML = warnings.length === 0
    ? '<p class="text-white/40 text-xs">Nessun avviso</p>'
    : warnings.map(w => `
        <div class="p-2 rounded bg-yellow-500/10 border border-yellow-500/20">
          <p class="text-yellow-400">${w.message}</p>
          ${w.suggestion ? `<p class="text-xs text-white/60 mt-1">${w.suggestion}</p>` : ''}
        </div>
      `).join('');
}

let saveTimeout;
function autoSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    // Implementa logica di salvataggio
    console.log('Auto-saving...');
  }, 2000);
}

async function showExportDialog() {
  // Mostra dialog export con opzioni
  const format = await showFormatPicker();
  if (!format) return;

  const content = editorContainer.innerHTML;
  await ExportManager.export(content, format);
}
```

### 4.5 TextAnalyzer.js

```javascript
// js/TextAnalyzer.js
export class TextAnalyzer {
  analyze(text) {
    const words = this.countWords(text);
    const sentences = this.countSentences(text);
    const syllables = this.countSyllables(text);
    const paragraphs = this.countParagraphs(text);

    return {
      words,
      characters: text.length,
      charactersNoSpaces: text.replace(/\s/g, '').length,
      sentences,
      paragraphs,
      syllables,
      readingTimeMinutes: Math.ceil(words / 200),
      gulpiease: this.calculateGulpease(words, sentences, text.length),
      warnings: this.detectWarnings(text)
    };
  }

  countWords(text) {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
  }

  countSentences(text) {
    return (text.match(/[.!?]+/g) || []).length || 1;
  }

  countParagraphs(text) {
    return text.split(/\n\n+/).filter(p => p.trim().length > 0).length || 1;
  }

  countSyllables(text) {
    // Approssimazione per italiano
    const vowels = text.toLowerCase().match(/[aeiou]/g) || [];
    return vowels.length;
  }

  calculateGulpease(words, sentences, chars) {
    // Indice Gulpease per testi italiani
    // Formula: 89 + (300 * frasi - 10 * lettere) / parole
    if (words === 0) return 0;
    const letters = chars;
    return Math.round(89 + (300 * sentences - 10 * letters) / words);
  }

  detectWarnings(text) {
    const warnings = [];

    // Frasi troppo lunghe
    const sentences = text.split(/[.!?]+/);
    sentences.forEach((s, i) => {
      const wordCount = this.countWords(s);
      if (wordCount > 40) {
        warnings.push({
          type: 'long_sentence',
          message: `Frase ${i + 1}: ${wordCount} parole (consigliato < 40)`,
          suggestion: 'Considera di spezzare la frase in due.'
        });
      }
    });

    // Ripetizioni parole
    const wordFreq = {};
    text.toLowerCase().match(/\b\w{4,}\b/g)?.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    Object.entries(wordFreq)
      .filter(([_, count]) => count > 5)
      .slice(0, 3)
      .forEach(([word, count]) => {
        warnings.push({
          type: 'repetition',
          message: `"${word}" ripetuto ${count} volte`,
          suggestion: 'Considera sinonimi o riformulazioni.'
        });
      });

    return warnings;
  }
}
```

**Checklist Fase 4**:
- [ ] Creare `views/editing/editing.html`
- [ ] Implementare `views/editing/editing.js`
- [ ] Creare `js/TextAnalyzer.js`
- [ ] Creare `js/ExportManager.js`
- [ ] Testare formattazione (bold, italic, ecc.)
- [ ] Testare statistiche real-time
- [ ] Testare export in almeno 2 formati

---

## Fase 5: Sistema Internazionalizzazione (i18n)

**Priorita**: MEDIA
**Effort**: 12-16 ore
**Rischio se non fatto**: Limita espansione mercato

### 5.1 Struttura i18n

```
locales/
  it.json       # Italiano (default)
  en.json       # Inglese

js/
  i18n.js       # Modulo gestione traduzioni
```

### 5.2 Modulo i18n.js

```javascript
// js/i18n.js
const SUPPORTED_LOCALES = ['it', 'en'];
const DEFAULT_LOCALE = 'it';

let currentLocale = DEFAULT_LOCALE;
let translations = {};

export const i18n = {
  async init(locale = null) {
    // Determina locale
    currentLocale = locale
      || localStorage.getItem('locale')
      || navigator.language.split('-')[0]
      || DEFAULT_LOCALE;

    if (!SUPPORTED_LOCALES.includes(currentLocale)) {
      currentLocale = DEFAULT_LOCALE;
    }

    await this.loadTranslations(currentLocale);
  },

  async loadTranslations(locale) {
    try {
      const response = await fetch(`/locales/${locale}.json`);
      translations = await response.json();
    } catch (e) {
      console.error(`Failed to load locale: ${locale}`, e);
      if (locale !== DEFAULT_LOCALE) {
        await this.loadTranslations(DEFAULT_LOCALE);
      }
    }
  },

  t(key, params = {}) {
    // Supporta chiavi annidate: "nav.dashboard"
    const value = key.split('.').reduce((obj, k) => obj?.[k], translations);

    if (!value) {
      console.warn(`Missing translation: ${key}`);
      return key;
    }

    // Sostituisci parametri: "Ciao {name}" -> "Ciao Mario"
    return value.replace(/\{(\w+)\}/g, (_, param) => params[param] ?? `{${param}}`);
  },

  async setLocale(locale) {
    if (!SUPPORTED_LOCALES.includes(locale)) return;

    currentLocale = locale;
    localStorage.setItem('locale', locale);
    await this.loadTranslations(locale);

    // Trigger aggiornamento UI
    document.dispatchEvent(new CustomEvent('localeChanged', { detail: locale }));
  },

  getLocale() {
    return currentLocale;
  },

  getSupportedLocales() {
    return SUPPORTED_LOCALES;
  }
};

// Helper globale per template
window.t = (key, params) => i18n.t(key, params);
```

### 5.3 File Traduzioni

**locales/it.json**:
```json
{
  "app": {
    "name": "Writer's Nexus",
    "tagline": "Il tuo copilota per la scrittura creativa"
  },
  "nav": {
    "dashboard": "Dashboard",
    "ideation": "Ideazione",
    "structure": "Struttura",
    "writing": "Scrittura",
    "editing": "Revisione",
    "analysis": "Analisi",
    "settings": "Impostazioni"
  },
  "dashboard": {
    "title": "I tuoi progetti",
    "newProject": "Nuovo progetto",
    "noProjects": "Nessun progetto. Crea il tuo primo!",
    "lastModified": "Ultima modifica: {date}"
  },
  "ideation": {
    "title": "Ideazione",
    "characters": "Personaggi",
    "locations": "Luoghi",
    "objects": "Oggetti",
    "newCharacter": "Nuovo personaggio",
    "newLocation": "Nuovo luogo"
  },
  "structure": {
    "title": "Struttura Narrativa",
    "heroJourney": "Viaggio dell'Eroe",
    "stages": {
      "ordinaryWorld": "Mondo Ordinario",
      "callToAdventure": "Chiamata all'Avventura",
      "refusalOfCall": "Rifiuto della Chiamata",
      "meetingMentor": "Incontro col Mentore",
      "crossingThreshold": "Varco della Soglia",
      "testsAlliesEnemies": "Prove, Alleati, Nemici",
      "approachInmostCave": "Avvicinamento alla Caverna",
      "ordeal": "Prova Centrale",
      "reward": "Ricompensa",
      "roadBack": "Via del Ritorno",
      "resurrection": "Resurrezione",
      "returnWithElixir": "Ritorno con l'Elisir"
    },
    "unassigned": "Scene non assegnate"
  },
  "writing": {
    "title": "Scrittura",
    "wordCount": "{count} parole",
    "pageCount": "{count} pagine",
    "focusMode": "Modalita focus"
  },
  "common": {
    "save": "Salva",
    "cancel": "Annulla",
    "delete": "Elimina",
    "edit": "Modifica",
    "create": "Crea",
    "close": "Chiudi",
    "confirm": "Conferma",
    "loading": "Caricamento...",
    "error": "Errore",
    "success": "Operazione completata"
  },
  "errors": {
    "network": "Errore di connessione. Verifica la tua rete.",
    "auth": "Errore di autenticazione. Verifica le credenziali.",
    "storage": "Spazio di archiviazione esaurito.",
    "generic": "Si e verificato un errore imprevisto."
  },
  "ai": {
    "panel": {
      "title": "Assistente AI",
      "placeholder": "Chiedi all'AI...",
      "send": "Invia",
      "thinking": "Sto pensando..."
    }
  }
}
```

**locales/en.json**:
```json
{
  "app": {
    "name": "Writer's Nexus",
    "tagline": "Your creative writing copilot"
  },
  "nav": {
    "dashboard": "Dashboard",
    "ideation": "Ideation",
    "structure": "Structure",
    "writing": "Writing",
    "editing": "Editing",
    "analysis": "Analysis",
    "settings": "Settings"
  },
  "dashboard": {
    "title": "Your projects",
    "newProject": "New project",
    "noProjects": "No projects yet. Create your first one!",
    "lastModified": "Last modified: {date}"
  },
  "ideation": {
    "title": "Ideation",
    "characters": "Characters",
    "locations": "Locations",
    "objects": "Objects",
    "newCharacter": "New character",
    "newLocation": "New location"
  },
  "structure": {
    "title": "Narrative Structure",
    "heroJourney": "Hero's Journey",
    "stages": {
      "ordinaryWorld": "Ordinary World",
      "callToAdventure": "Call to Adventure",
      "refusalOfCall": "Refusal of the Call",
      "meetingMentor": "Meeting the Mentor",
      "crossingThreshold": "Crossing the Threshold",
      "testsAlliesEnemies": "Tests, Allies, Enemies",
      "approachInmostCave": "Approach to the Inmost Cave",
      "ordeal": "The Ordeal",
      "reward": "Reward",
      "roadBack": "The Road Back",
      "resurrection": "Resurrection",
      "returnWithElixir": "Return with the Elixir"
    },
    "unassigned": "Unassigned scenes"
  },
  "writing": {
    "title": "Writing",
    "wordCount": "{count} words",
    "pageCount": "{count} pages",
    "focusMode": "Focus mode"
  },
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "create": "Create",
    "close": "Close",
    "confirm": "Confirm",
    "loading": "Loading...",
    "error": "Error",
    "success": "Operation completed"
  },
  "errors": {
    "network": "Connection error. Check your network.",
    "auth": "Authentication error. Check your credentials.",
    "storage": "Storage quota exceeded.",
    "generic": "An unexpected error occurred."
  },
  "ai": {
    "panel": {
      "title": "AI Assistant",
      "placeholder": "Ask the AI...",
      "send": "Send",
      "thinking": "Thinking..."
    }
  }
}
```

### 5.4 Integrazione nei View

**Esempio - Prima (hardcoded)**:
```html
<button>Salva</button>
<span>Caricamento...</span>
```

**Esempio - Dopo (i18n)**:
```html
<button data-i18n="common.save">Salva</button>
<span data-i18n="common.loading">Caricamento...</span>
```

**Auto-update DOM**:
```javascript
// In main.js o utility
function updateI18nDOM() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = i18n.t(key);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = i18n.t(key);
  });
}

document.addEventListener('localeChanged', updateI18nDOM);
```

### 5.5 Selector Lingua in Settings

Aggiungere in `config.html`:
```html
<div class="form-group">
  <label for="language-select">Lingua / Language</label>
  <select id="language-select">
    <option value="it">Italiano</option>
    <option value="en">English</option>
  </select>
</div>
```

**Checklist Fase 5**:
- [ ] Creare `js/i18n.js`
- [ ] Creare `locales/it.json` con tutte le stringhe
- [ ] Creare `locales/en.json` (traduzione completa)
- [ ] Aggiungere `data-i18n` attributes a tutti gli elementi HTML
- [ ] Integrare selector lingua in Settings
- [ ] Testare switch lingua runtime
- [ ] Documentare processo per aggiungere nuove lingue

---

## Fase 6: Refactoring Modali e Componenti

**Priorita**: MEDIA
**Effort**: 12-16 ore
**Rischio se non fatto**: Manutenzione difficile, bug duplicati

### 6.1 Problema Attuale

Ci sono 16+ modali con codice quasi identico:
- `character.html/js`
- `location.html/js`
- `object.html/js`
- `geography.html/js`
- `history.html/js`
- `culture.html/js`
- `plotline.html/js`
- `system.html/js`
- ecc.

### 6.2 Soluzione: Base Modal Component

**Nuovo file**: `views/shared/BaseModal.js`

```javascript
// views/shared/BaseModal.js
export class BaseModal {
  constructor(options) {
    this.id = options.id;
    this.entityType = options.entityType;
    this.fields = options.fields || [];
    this.onSave = options.onSave;
    this.onDelete = options.onDelete;

    this.modal = null;
    this.form = null;
    this.currentEntity = null;
    this.abortController = null;
  }

  init() {
    this.modal = document.getElementById(`${this.id}-modal`);
    this.form = document.getElementById(`${this.id}-form`);

    if (!this.modal || !this.form) {
      console.error(`Modal elements not found for: ${this.id}`);
      return;
    }

    // Setup comune
    this.setupCloseHandlers();
  }

  setupCloseHandlers() {
    // Click fuori modal
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    // Tasto ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.modal.classList.contains('hidden')) {
        this.close();
      }
    });
  }

  open(entity = null) {
    this.currentEntity = entity;
    this.abortController = new AbortController();

    // Popola form
    this.fields.forEach(field => {
      const input = document.getElementById(`${this.id}-${field.name}`);
      if (input) {
        input.value = entity?.[field.name] || field.default || '';
      }
    });

    // Setup listeners con abort
    this.form.addEventListener('submit', (e) => this.handleSubmit(e),
      { signal: this.abortController.signal });

    this.modal.classList.remove('hidden');

    // Focus primo campo
    const firstInput = this.form.querySelector('input, textarea, select');
    firstInput?.focus();
  }

  close() {
    this.modal.classList.add('hidden');
    this.abortController?.abort();
    this.currentEntity = null;
    this.form.reset();
  }

  async handleSubmit(e) {
    e.preventDefault();

    const formData = {};
    this.fields.forEach(field => {
      const input = document.getElementById(`${this.id}-${field.name}`);
      formData[field.name] = input?.value || '';
    });

    if (this.currentEntity?.id) {
      formData.id = this.currentEntity.id;
    }

    try {
      await this.onSave?.(formData);
      this.close();
    } catch (error) {
      console.error('Save failed:', error);
      // Mostra errore all'utente
    }
  }

  async delete() {
    if (!this.currentEntity?.id) return;

    try {
      await this.onDelete?.(this.currentEntity.id);
      this.close();
    } catch (error) {
      console.error('Delete failed:', error);
    }
  }
}
```

### 6.3 Esempio Utilizzo

**Prima (character.js - ~150 righe)**:
```javascript
// Codice ripetitivo e lungo
```

**Dopo (character.js - ~40 righe)**:
```javascript
import { BaseModal } from '../shared/BaseModal.js';
import { DataManager } from '../../DataManager.js';

const characterModal = new BaseModal({
  id: 'character',
  entityType: 'character',
  fields: [
    { name: 'name', required: true },
    { name: 'description' },
    { name: 'archetype', default: 'protagonist' },
    { name: 'notes' }
  ],
  onSave: async (data) => {
    const projectId = DataManager.getCurrentProjectId();
    await DataManager.saveCharacter({ ...data, projectId });
  },
  onDelete: async (id) => {
    await DataManager.deleteCharacter(id);
  }
});

export default {
  init: () => characterModal.init(),
  open: (entity) => characterModal.open(entity),
  close: () => characterModal.close()
};
```

### 6.4 Template HTML Condiviso

**Nuovo file**: `views/shared/modal-template.html`

```html
<!-- Template base per modali CRUD -->
<template id="modal-template">
  <div class="modal-overlay hidden" id="{id}-modal">
    <div class="modal-content">
      <div class="modal-header">
        <h2 id="{id}-title">{title}</h2>
        <button class="modal-close" aria-label="Chiudi">
          <i data-lucide="x"></i>
        </button>
      </div>

      <form id="{id}-form">
        <div class="modal-body">
          <!-- Campi dinamici -->
        </div>

        <div class="modal-footer">
          <button type="button" class="btn-secondary" data-action="cancel">
            Annulla
          </button>
          <button type="submit" class="btn-primary">
            Salva
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
```

**Checklist Fase 6**:
- [ ] Creare `views/shared/BaseModal.js`
- [ ] Creare template HTML condiviso
- [ ] Refactorare `character.js` come esempio
- [ ] Refactorare altri modali uno alla volta
- [ ] Verificare che tutti i modali funzionino
- [ ] Rimuovere codice duplicato

---

## Fase 7: Accessibilita (a11y)

**Priorita**: MEDIA
**Effort**: 10-14 ore
**Rischio se non fatto**: Esclusione utenti, possibili problemi legali

### 7.1 ARIA per Modali

Ogni modale deve avere:

```html
<div
  id="character-modal"
  class="modal-overlay hidden"
  role="dialog"
  aria-modal="true"
  aria-labelledby="character-modal-title"
  aria-describedby="character-modal-desc"
>
  <div class="modal-content">
    <h2 id="character-modal-title">Modifica Personaggio</h2>
    <p id="character-modal-desc" class="sr-only">
      Form per creare o modificare un personaggio
    </p>
    <!-- contenuto -->
  </div>
</div>
```

### 7.2 Focus Management

```javascript
// In BaseModal.js
open(entity = null) {
  // ... codice esistente ...

  // Salva elemento che aveva focus
  this.previousFocus = document.activeElement;

  // Trap focus nel modal
  this.trapFocus();

  this.modal.classList.remove('hidden');
}

close() {
  this.modal.classList.add('hidden');

  // Ripristina focus
  this.previousFocus?.focus();
}

trapFocus() {
  const focusable = this.modal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  this.modal.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, { signal: this.abortController.signal });

  first?.focus();
}
```

### 7.3 Labels per Form

**Prima**:
```html
<input id="character-name" placeholder="Nome personaggio">
```

**Dopo**:
```html
<label for="character-name" class="form-label">Nome personaggio</label>
<input
  id="character-name"
  aria-required="true"
  aria-describedby="character-name-hint"
>
<span id="character-name-hint" class="form-hint">
  Il nome come apparira nel manoscritto
</span>
```

### 7.4 Skip Link

Aggiungere all'inizio di `index.html`:

```html
<body>
  <a href="#main-content" class="skip-link">
    Salta al contenuto principale
  </a>

  <!-- sidebar -->

  <main id="main-content" tabindex="-1">
    <!-- contenuto view -->
  </main>
</body>
```

**CSS**:
```css
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: var(--primary);
  color: white;
  padding: 8px 16px;
  z-index: 100;
  transition: top 0.3s;
}

.skip-link:focus {
  top: 0;
}
```

### 7.5 Drag and Drop Accessibile

Per la vista Structure, aggiungere controlli keyboard:

```html
<div
  class="scene-card"
  draggable="true"
  role="listitem"
  aria-grabbed="false"
  tabindex="0"
>
  <span class="scene-title">Scena 1</span>
  <div class="scene-actions">
    <button aria-label="Sposta su" class="move-up">
      <i data-lucide="chevron-up"></i>
    </button>
    <button aria-label="Sposta giu" class="move-down">
      <i data-lucide="chevron-down"></i>
    </button>
  </div>
</div>
```

### 7.6 Screen Reader Announcements

```javascript
// js/a11y.js
export function announce(message, priority = 'polite') {
  const announcer = document.getElementById('sr-announcer')
    || createAnnouncer();

  announcer.setAttribute('aria-live', priority);
  announcer.textContent = message;

  // Clear dopo annuncio
  setTimeout(() => { announcer.textContent = ''; }, 1000);
}

function createAnnouncer() {
  const el = document.createElement('div');
  el.id = 'sr-announcer';
  el.className = 'sr-only';
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  document.body.appendChild(el);
  return el;
}
```

**Utilizzo**:
```javascript
import { announce } from '../js/a11y.js';

// Dopo salvataggio
announce('Personaggio salvato con successo');

// Dopo errore
announce('Errore nel salvataggio', 'assertive');
```

**Checklist Fase 7**:
- [ ] Aggiungere ARIA attributes a tutti i modali
- [ ] Implementare focus trap nei modali
- [ ] Aggiungere labels a tutti gli input
- [ ] Creare skip link
- [ ] Rendere drag-and-drop accessibile da tastiera
- [ ] Implementare sistema announcements
- [ ] Testare con screen reader (NVDA o VoiceOver)

---

## Fase 8: Performance e Ottimizzazioni

**Priorita**: BASSA
**Effort**: 8-12 ore
**Rischio se non fatto**: UX degradata con progetti grandi

### 8.1 Lazy Loading Dati

**Problema**: `ideation.js` carica tutto in memoria.

**Soluzione**: Paginazione e virtual scrolling.

```javascript
// DataManager.js - aggiungere metodo paginato
async getCharactersPaginated(projectId, { page = 1, limit = 20 } = {}) {
  const allCharacters = await this.getCharacters(projectId);
  const start = (page - 1) * limit;

  return {
    data: allCharacters.slice(start, start + limit),
    total: allCharacters.length,
    page,
    totalPages: Math.ceil(allCharacters.length / limit)
  };
}
```

### 8.2 Debounce e Throttle

**Utility**: `js/utils.js`

```javascript
export function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

export function throttle(fn, limit) {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
}
```

**Utilizzo**:
```javascript
import { debounce } from '../js/utils.js';

// Invece di aggiornare ad ogni keystroke
const debouncedSave = debounce(saveContent, 500);
editor.addEventListener('input', debouncedSave);
```

### 8.3 Build Locale Tailwind

Invece di CDN, usa build locale:

```bash
npm install -D tailwindcss
npx tailwindcss init
```

**tailwind.config.js**:
```javascript
module.exports = {
  content: ['./**/*.html', './**/*.js'],
  theme: {
    extend: {}
  },
  plugins: []
};
```

**package.json**:
```json
{
  "scripts": {
    "build:css": "tailwindcss -i ./src/input.css -o ./style.css --minify"
  }
}
```

### 8.4 Code Splitting (Futuro)

Per progetti molto grandi, considerare bundler come Vite:

```bash
npm install -D vite
```

**vite.config.js**:
```javascript
export default {
  build: {
    rollupOptions: {
      input: {
        main: 'index.html'
      },
      output: {
        manualChunks: {
          vendor: ['@google/generative-ai'],
          ai: ['./ai/AIService.js', './ai/AIPanel.js']
        }
      }
    }
  }
};
```

**Checklist Fase 8**:
- [ ] Implementare paginazione in DataManager
- [ ] Aggiungere debounce a input frequenti
- [ ] Migrare Tailwind da CDN a build locale
- [ ] Valutare code splitting con Vite
- [ ] Profilare con Chrome DevTools
- [ ] Testare con progetto da 100+ scene

---

## Fase 9: Documentazione

**Priorita**: BASSA
**Effort**: 8-10 ore
**Rischio se non fatto**: Onboarding difficile, contributi esterni limitati

### 9.1 JSDoc per Funzioni Pubbliche

**Esempio**:
```javascript
/**
 * Salva un personaggio nel database locale.
 *
 * @param {Object} character - Dati del personaggio
 * @param {string} character.name - Nome del personaggio (obbligatorio)
 * @param {string} [character.description] - Descrizione del personaggio
 * @param {string} [character.archetype] - Archetipo narrativo
 * @param {string} character.projectId - ID del progetto associato
 * @returns {Promise<Object>} Il personaggio salvato con ID generato
 * @throws {Error} Se projectId e mancante
 *
 * @example
 * const hero = await DataManager.saveCharacter({
 *   name: 'Aragorn',
 *   archetype: 'hero',
 *   projectId: 'proj-123'
 * });
 */
async saveCharacter(character) {
  // implementazione
}
```

### 9.2 README Tecnico

Creare `CONTRIBUTING.md`:

```markdown
# Guida per Contribuire a Writer's Nexus

## Setup Ambiente

1. Clona il repository
2. Installa dipendenze: `npm install`
3. Avvia server locale: `npm start`
4. Apri `http://localhost:55099`

## Struttura Progetto

\`\`\`
/
├── ai/                  # Moduli AI
│   ├── AIPanel.js       # UI pannello assistente
│   └── AIService.js     # Wrapper provider AI
├── js/                  # Utility e engine
│   ├── ConsistencyEngine.js
│   └── i18n.js
├── views/               # Viste dell'applicazione
│   ├── dashboard/
│   ├── ideation/
│   ├── structure/
│   ├── writing/
│   ├── editing/
│   └── modals/          # Modali condivisi
├── locales/             # File traduzioni
├── tests/               # Test suite
├── DataManager.js       # Gestione dati IndexedDB
├── FirebaseSync.js      # Sync cloud opzionale
└── main.js              # Entry point
\`\`\`

## Convenzioni Codice

- **Formattazione**: Prettier con config default
- **Linting**: ESLint
- **Naming**: camelCase per variabili/funzioni, PascalCase per classi
- **Commenti**: JSDoc per funzioni pubbliche

## Workflow Git

1. Crea branch da `main`: `git checkout -b feature/nome-feature`
2. Commit atomici con messaggi descrittivi
3. Apri PR verso `main`
4. Attendi review

## Test

\`\`\`bash
npm test           # Esegui tutti i test
npm run test:watch # Watch mode
npm run test:coverage # Coverage report
\`\`\`
```

### 9.3 Documentazione Architettura

Creare `docs/ARCHITECTURE.md`:

```markdown
# Architettura Writer's Nexus

## Panoramica

Writer's Nexus e una SPA (Single Page Application) vanilla JavaScript
con storage locale IndexedDB e sync cloud opzionale via Firebase.

## Flusso Dati

\`\`\`
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Views     │────▶│ DataManager │────▶│  IndexedDB  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ FirebaseSync│ (opzionale)
                    └─────────────┘
\`\`\`

## Moduli Principali

### DataManager
- Astrazione su IndexedDB
- CRUD per tutte le entita
- Gestione progetti corrente

### AIService
- Provider pluggabili (OpenAI, Gemini, Ollama, Anthropic)
- Configurazione unificata
- Fallback su errore

### View System
- Routing hash-based
- Lazy loading moduli
- Stato locale per view

## Database Schema

| Store        | Chiave | Indici        |
|--------------|--------|---------------|
| projects     | id     | -             |
| scenes       | id     | projectId     |
| characters   | id     | projectId     |
| locations    | id     | projectId     |
| ...          | ...    | ...           |
```

**Checklist Fase 9**:
- [ ] Aggiungere JSDoc a tutte le funzioni esportate
- [ ] Creare CONTRIBUTING.md
- [ ] Creare docs/ARCHITECTURE.md
- [ ] Aggiornare README.md con badge e quick start
- [ ] Documentare API DataManager
- [ ] Documentare configurazione AI providers

---

## Fase 10: Mobile e UX

**Priorita**: BASSA
**Effort**: 6-8 ore
**Rischio se non fatto**: Esperienza mobile subottimale

### 10.1 Responsive Breakpoints

Verificare e sistemare:

```css
/* Breakpoints Tailwind */
/* sm: 640px */
/* md: 768px */
/* lg: 1024px */
/* xl: 1280px */

/* Assicurarsi che tutte le view abbiano: */
.view-container {
  @apply px-4 md:px-6 lg:px-8;
}

/* Sidebar collassabile */
.sidebar {
  @apply fixed inset-y-0 left-0 z-40 w-64
         transform -translate-x-full md:translate-x-0
         transition-transform duration-300;
}

.sidebar.open {
  @apply translate-x-0;
}
```

### 10.2 Touch Targets

Minimo 44x44px per elementi interattivi:

```css
.btn, .icon-btn {
  min-width: 44px;
  min-height: 44px;
}

.tag-filter {
  padding: 8px 16px;
  /* Garantisce area touch sufficiente */
}
```

### 10.3 Structure View Mobile

Trasformare layout 3 colonne in accordion su mobile:

```html
<div class="structure-view">
  <!-- Desktop: 3 colonne -->
  <div class="hidden md:grid md:grid-cols-3 gap-4">
    <!-- colonne -->
  </div>

  <!-- Mobile: Accordion -->
  <div class="md:hidden">
    <details class="stage-accordion">
      <summary>Atto 1</summary>
      <!-- contenuto -->
    </details>
    <details class="stage-accordion">
      <summary>Atto 2</summary>
      <!-- contenuto -->
    </details>
    <details class="stage-accordion">
      <summary>Atto 3</summary>
      <!-- contenuto -->
    </details>
  </div>
</div>
```

### 10.4 PWA Basics (Opzionale)

Per installabilita su mobile:

**manifest.json**:
```json
{
  "name": "Writer's Nexus",
  "short_name": "Writer's Nexus",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#3b82f6",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

**Checklist Fase 10**:
- [ ] Audit responsive tutte le view
- [ ] Verificare touch targets >= 44px
- [ ] Implementare layout mobile per Structure
- [ ] Testare su dispositivi reali (iOS/Android)
- [ ] Valutare PWA manifest
- [ ] Ottimizzare immagini per mobile

---

## Checklist Finale

### Prima del Rilascio

- [ ] **Fase 1**: Fix sicurezza completati
- [ ] **Fase 2**: Memory leak risolti
- [ ] **Fase 3**: Test coverage >= 60% su file critici
- [ ] **Fase 4**: Modulo Editing funzionante
- [ ] **Fase 5**: i18n implementato (almeno IT + EN)
- [ ] **Fase 6**: Almeno 50% modali refactorizzati
- [ ] **Fase 7**: ARIA base implementato
- [ ] **Fase 8**: Performance accettabile (< 3s load)
- [ ] **Fase 9**: Documentazione aggiornata
- [ ] **Fase 10**: Testato su mobile

### Metriche di Successo

| Metrica | Target | Come Misurare |
|---------|--------|---------------|
| Test Coverage | >= 60% | `npm run test:coverage` |
| Lighthouse Performance | >= 80 | Chrome DevTools |
| Lighthouse Accessibility | >= 90 | Chrome DevTools |
| Bundle Size | < 500KB | Build output |
| First Contentful Paint | < 1.5s | Lighthouse |
| Time to Interactive | < 3s | Lighthouse |

### Note Finali

- Ogni fase puo essere implementata indipendentemente
- Prioritizzare Fasi 1-4 prima di qualsiasi release
- Documentare ogni modifica nel CHANGELOG
- Creare branch separati per ogni fase

---

*Documento generato con l'assistenza di Claude AI*
*Ultima modifica: Gennaio 2025*
