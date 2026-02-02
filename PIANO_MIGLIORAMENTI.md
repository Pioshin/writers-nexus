# Piano di Miglioramento - Writer's Nexus

> Documento guida per l'implementazione delle migliorie identificate.
> Creato: Gennaio 2025 | **Ultimo aggiornamento: 30 Gennaio 2026**
> **Versione attuale: v0.1.0-alpha**

---

## Indice

1. [Panoramica](#panoramica)
2. [Changelog Recente](#changelog-recente)
3. [Fase 1: Fix Critici di Sicurezza](#fase-1-fix-critici-di-sicurezza)
4. [Fase 2: Stabilizzazione e Memory Leak](#fase-2-stabilizzazione-e-memory-leak)
5. [Fase 3: Testing Framework](#fase-3-testing-framework)
6. [Fase 4: Completamento Modulo Editing](#fase-4-completamento-modulo-editing)
7. [Fase 5: Sistema Internazionalizzazione (i18n)](#fase-5-sistema-internazionalizzazione-i18n)
8. [Fase 6: Refactoring Modali e Componenti](#fase-6-refactoring-modali-e-componenti)
9. [Fase 7: Accessibilita (a11y)](#fase-7-accessibilita-a11y)
10. [Fase 8: Performance e Ottimizzazioni](#fase-8-performance-e-ottimizzazioni)
11. [Fase 9: Documentazione](#fase-9-documentazione)
12. [Fase 10: Mobile e UX](#fase-10-mobile-e-ux)
13. [Checklist Finale](#checklist-finale)

---

## Panoramica

### Stato Attuale (v0.1.0-alpha - 30 Gennaio 2026)
- **31+ file JavaScript** principali
- **24 file HTML** (views + modals)
- **Zero test coverage**
- **UI solo in italiano**
- **Nuove funzionalita AI** (Streaming Terminal, MemVid, multi-provider)

### Cosa e Cambiato dall'Ultima Analisi

| Feature | Stato | Note |
|---------|-------|------|
| Export/Import Progetti | ✅ NUOVO | Backup JSON completo con ripristino |
| Test Connessione AI | ✅ NUOVO | Verifica endpoint prima di salvare |
| Streaming Terminal UI | ✅ NUOVO | Output real-time "AI Neural Link" |
| Data Inspector | ✅ NUOVO | Visualizzatore dati scene |
| MemVid Integration | ✅ NUOVO | Upload video per memoria |
| Supporto Ollama | ✅ NUOVO | LLM locali come backend |
| Null-checks migliorati | ✅ NUOVO | Prevenzione crash in main.js |
| AI Worker stabilizzato | ✅ NUOVO | Parsing JSON robusto |

### Priorita Aggiornate
| Livello | Descrizione | Fasi |
|---------|-------------|------|
| CRITICA | Sicurezza, stabilita | 1, 2 |
| ALTA | Testing, funzionalita mancanti | 3, 4 |
| MEDIA | i18n, refactoring, a11y | 5, 6, 7 |
| BASSA | Performance, docs, mobile | 8, 9, 10 |

### Effort Stimato Totale (Aggiornato)
- **Minimo**: ~70-90 ore (alcuni miglioramenti gia fatti)
- **Consigliato**: ~100-130 ore (con test completi)

---

## Changelog Recente

### v0.1.0-alpha (30 Gennaio 2026)
- **Export/Import**: Nuovi metodi `importProjectData()` e `getProjectData()` in DataManager
- **UI Export/Import**: Pulsanti in main.js con conferme e validazione
- **Streaming Terminal**: Pannello "AI Neural Link" con output real-time stile Matrix
- **Data Inspector**: `window.renderDataInspector()` per debug scene
- **Test Connessione**: Bottone per verificare endpoint AI in config.js
- **Error Handling**: Null-checks aggiunti per prevenire crash

### v2.0 (Dicembre 2025)
- ConsistencyEngine completo
- AIPanel globale
- Multi-provider AI (OpenAI, Gemini, Anthropic, Ollama)
- Ideation UI overhaul

---

## Fase 1: Fix Critici di Sicurezza

**Priorita**: CRITICA
**Effort**: 3-5 ore (ridotto grazie a miglioramenti recenti)
**Rischio se non fatto**: Alto (esposizione credenziali)

### 1.1 API Key nelle URL (GET Request)

**Stato**: ⚠️ ANCORA DA FARE

**Problema**: In `views/modals/config.js:209-210`, la API key viene ancora inviata come parametro GET:
```javascript
// PROBLEMA - API key visibile in browser history e logs
const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
);
```

> **Nota**: Il nuovo "Test Connessione" (linee 42-76) usa correttamente endpoint senza API key in URL per Ollama/OpenAI, ma `loadGoogleModels()` ha ancora il problema.

**Soluzione**: Usare header `x-goog-api-key` invece di query parameter.

**File da modificare**:
- `views/modals/config.js` (funzione `loadGoogleModels`, linee 195-264)

**Implementazione consigliata**:
```javascript
async function loadGoogleModels() {
  const apiKey = aiApiKeyInput?.value?.trim() || geminiApiKeyInput?.value?.trim() || '';
  if (!apiKey) {
    googleModelsStatusEl.textContent = 'Inserisci una API Key per caricare i modelli.';
    return;
  }

  try {
    // USA HEADER invece di query parameter
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: {
        'x-goog-api-key': apiKey
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // ... resto della logica invariato
  } catch (e) {
    // gestione errore
  }
}
```

**Checklist**:
- [ ] Modificare `loadGoogleModels()` per usare header
- [ ] Verificare che la chiave non appaia in console/network tab
- [x] ~~Test connessione per altri provider~~ (gia implementato correttamente)

---

### 1.2 Validazione Input File Import

**Stato**: ⚠️ PARZIALMENTE MIGLIORATO

Il nuovo sistema di import progetti (`main.js`) ha validazione per JSON, ma `import-text.js` per testo/markdown non ha ancora limiti.

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

  return await file.text();
}
```

**Checklist**:
- [x] ~~Import JSON progetti con validazione~~ (implementato in v0.1.0-alpha)
- [ ] Aggiungere limite dimensione file per import testo
- [ ] Validare estensioni permesse
- [ ] Mostrare errore user-friendly se validazione fallisce

---

### 1.3 Sanitizzazione Password Post-Login

**Stato**: ⚠️ DA VERIFICARE

**File da modificare**:
- `main.js`

**Checklist**:
- [ ] Verificare che il campo password venga pulito dopo login
- [ ] Non loggare mai password in console

---

## Fase 2: Stabilizzazione e Memory Leak

**Priorita**: CRITICA
**Effort**: 5-7 ore (ridotto grazie a null-checks aggiunti)
**Rischio se non fatto**: Medio-Alto (crash con uso prolungato)

### 2.1 Event Listener Leak nei Modali

**Stato**: ⚠️ ANCORA DA FARE

I null-checks aggiunti in v0.1.0-alpha migliorano la stabilita ma non risolvono il problema dei listener duplicati.

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

**Pattern consigliato con AbortController**:
```javascript
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
```

**Checklist**:
- [ ] Auditare tutti i 12+ modali per listener leak
- [ ] Implementare pattern AbortController o rimozione manuale
- [ ] Testare apertura/chiusura ripetuta senza aumento memoria

---

### 2.2 Limite Stack Undo

**Stato**: ⚠️ DA FARE

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
    if (this.undoStack.length > MAX_UNDO_STACK) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }
}
```

**Checklist**:
- [ ] Aggiungere costante MAX_UNDO_STACK
- [ ] Implementare logica di trimming
- [ ] Considerare salvataggio su IndexedDB per undo persistente (opzionale)

---

### 2.3 Gestione Errori Centralizzata

**Stato**: ⚠️ PARZIALMENTE MIGLIORATO

I null-checks in `updateConsistencyIndicator()` sono un buon inizio, ma serve un sistema centralizzato.

**Nuovo file consigliato**: `js/ErrorHandler.js`
```javascript
export const ErrorHandler = {
  NETWORK: 'network',
  VALIDATION: 'validation',
  DATABASE: 'database',
  AI_SERVICE: 'ai_service',

  handle(error, context = '', options = {}) {
    const { silent = false, rethrow = false } = options;
    console.error(`[${context}]`, error);

    if (!silent) {
      const message = this.getUserMessage(error);
      toast.error(message);
    }

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

**Checklist**:
- [x] ~~Null-checks per elementi UI critici~~ (fatto in v0.1.0-alpha)
- [ ] Creare `js/ErrorHandler.js`
- [ ] Sostituire catch vuoti nei file principali
- [ ] Aggiungere messaggi user-friendly per errori comuni

---

## Fase 3: Testing Framework

**Priorita**: ALTA
**Effort**: 16-24 ore (setup + primi test)
**Rischio se non fatto**: Medio (regressioni non rilevate)

### 3.1 Setup Vitest

**Stato**: ❌ DA FARE

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

### 3.2 Test Prioritari (Aggiornati)

**Ordine di priorita per i test**:

#### 3.2.1 DataManager.js (CRITICO)

**Aree da testare** (aggiornate con nuove funzionalita):
- CRUD operazioni (create, read, update, delete)
- **NUOVO**: `importProjectData()` - validazione e ripristino
- **NUOVO**: `getProjectData()` - export completo
- Sync logic
- Error handling
- Edge cases (dati mancanti, ID duplicati)

**Esempio test per nuove funzionalita**:
```javascript
describe('DataManager - Import/Export', () => {
  it('should export complete project data', async () => {
    const project = await DataManager.saveProject({ title: 'Test' });
    await DataManager.saveCharacter({ name: 'Hero', projectId: project.id });

    const exportData = await DataManager.getProjectData(project.id);

    expect(exportData.project).toBeDefined();
    expect(exportData.characters).toHaveLength(1);
  });

  it('should import and restore project', async () => {
    const backupData = {
      project: { title: 'Imported Project' },
      characters: [{ name: 'Imported Hero' }],
      scenes: []
    };

    await DataManager.importProjectData(backupData);

    const projects = await DataManager.getAllProjects();
    expect(projects.some(p => p.title === 'Imported Project')).toBe(true);
  });

  it('should validate backup format before import', async () => {
    const invalidData = { invalid: 'structure' };

    await expect(DataManager.importProjectData(invalidData))
      .rejects.toThrow();
  });
});
```

#### 3.2.2 AIService.js

**Aree da testare** (aggiornate):
- Inizializzazione multi-provider (OpenAI, Gemini, Anthropic, **Ollama**)
- **NUOVO**: `checkConnection()` - test connessione
- Fallback comportamento
- Parsing risposte
- Error handling per timeout/network

#### 3.2.3 ConsistencyEngine.js

**Aree da testare**:
- Rilevamento personaggi fantasma
- Identificazione trame abbandonate
- Scene vuote
- **NUOVO**: Log history buffer
- Report generation

#### 3.2.4 Import Text Parser

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
- [ ] **NUOVO**: Test per import/export progetti
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
    project-backup.json    # NUOVO: per testare import
  mocks/
    indexeddb.js
    fetch.js
    ai-responses.js        # NUOVO: mock risposte AI
```

---

## Fase 4: Completamento Modulo Editing

**Priorita**: ALTA
**Effort**: 20-30 ore
**Rischio se non fatto**: Funzionalita incompleta

### 4.1 Analisi Requisiti

**Stato**: ❌ DA FARE

Il modulo `views/editing/editing.js` e attualmente uno stub.

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

4. **Esportazione** (complementare a Export progetti esistente)
   - Export in Markdown
   - Export in HTML
   - Export in DOCX (opzionale)
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
  ExportManager.js      # Gestione export formati
```

### 4.3-4.5 Implementazioni

*Vedere dettagli nel documento originale - le specifiche rimangono invariate.*

**Checklist Fase 4**:
- [ ] Creare `views/editing/editing.html`
- [ ] Implementare `views/editing/editing.js`
- [ ] Creare `js/TextAnalyzer.js`
- [ ] Creare `js/ExportManager.js`
- [ ] Testare formattazione (bold, italic, ecc.)
- [ ] Testare statistiche real-time
- [ ] Testare export in almeno 2 formati
- [ ] Integrare con sistema export esistente

---

## Fase 5: Sistema Internazionalizzazione (i18n)

**Priorita**: MEDIA
**Effort**: 12-16 ore
**Rischio se non fatto**: Limita espansione mercato

### 5.1 Struttura i18n

**Stato**: ❌ DA FARE

```
locales/
  it.json       # Italiano (default)
  en.json       # Inglese

js/
  i18n.js       # Modulo gestione traduzioni
```

### 5.2-5.5 Implementazioni

*Vedere dettagli nel documento originale - le specifiche rimangono invariate.*

**Nuove stringhe da includere** (per v0.1.0-alpha):
```json
{
  "export": {
    "title": "Esporta Progetto",
    "success": "Progetto esportato con successo",
    "filename": "backup-{title}-{date}.json"
  },
  "import": {
    "title": "Importa Progetto",
    "confirm": "Vuoi importare questo progetto?",
    "overwriteWarning": "Se esiste gia un progetto con lo stesso titolo, verra sovrascritto.",
    "success": "Progetto importato con successo"
  },
  "ai": {
    "neuralLink": "AI Neural Link",
    "connectionTest": "Test Connessione",
    "connectionSuccess": "Connessione OK!",
    "connectionError": "Errore Connessione"
  }
}
```

**Checklist Fase 5**:
- [ ] Creare `js/i18n.js`
- [ ] Creare `locales/it.json` con tutte le stringhe
- [ ] Creare `locales/en.json` (traduzione completa)
- [ ] **NUOVO**: Includere stringhe per export/import
- [ ] **NUOVO**: Includere stringhe per Streaming Terminal
- [ ] Aggiungere `data-i18n` attributes a tutti gli elementi HTML
- [ ] Integrare selector lingua in Settings
- [ ] Testare switch lingua runtime

---

## Fase 6: Refactoring Modali e Componenti

**Priorita**: MEDIA
**Effort**: 12-16 ore
**Rischio se non fatto**: Manutenzione difficile, bug duplicati

### 6.1 Problema Attuale

Ci sono 16+ modali con codice quasi identico.

### 6.2-6.4 Implementazioni

*Vedere dettagli nel documento originale - le specifiche rimangono invariate.*

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

### 7.1-7.6 Implementazioni

*Vedere dettagli nel documento originale - le specifiche rimangono invariate.*

**Nuove considerazioni per v0.1.0-alpha**:
- Il Streaming Terminal deve avere `aria-live="polite"` per annunciare nuovi messaggi
- I pulsanti Export/Import devono avere labels accessibili

**Checklist Fase 7**:
- [ ] Aggiungere ARIA attributes a tutti i modali
- [ ] Implementare focus trap nei modali
- [ ] Aggiungere labels a tutti gli input
- [ ] Creare skip link
- [ ] Rendere drag-and-drop accessibile da tastiera
- [ ] Implementare sistema announcements
- [ ] **NUOVO**: Accessibilita per Streaming Terminal
- [ ] Testare con screen reader (NVDA o VoiceOver)

---

## Fase 8: Performance e Ottimizzazioni

**Priorita**: BASSA
**Effort**: 8-12 ore
**Rischio se non fatto**: UX degradata con progetti grandi

### 8.1-8.4 Implementazioni

*Vedere dettagli nel documento originale - le specifiche rimangono invariate.*

**Nuove considerazioni**:
- Il Streaming Terminal puo accumulare molto testo - considerare limite buffer
- Export di progetti grandi potrebbe bloccare UI - considerare Web Worker

**Checklist Fase 8**:
- [ ] Implementare paginazione in DataManager
- [ ] Aggiungere debounce a input frequenti
- [ ] Migrare Tailwind da CDN a build locale
- [ ] **NUOVO**: Limite buffer per Streaming Terminal
- [ ] **NUOVO**: Export asincrono per progetti grandi
- [ ] Valutare code splitting con Vite
- [ ] Profilare con Chrome DevTools
- [ ] Testare con progetto da 100+ scene

---

## Fase 9: Documentazione

**Priorita**: BASSA
**Effort**: 8-10 ore
**Rischio se non fatto**: Onboarding difficile, contributi esterni limitati

### 9.1-9.3 Implementazioni

*Vedere dettagli nel documento originale.*

**Nuova documentazione necessaria**:
- Documentare funzionalita Export/Import
- Documentare configurazione multi-provider AI
- Documentare Streaming Terminal e Data Inspector
- Aggiornare ARCHITECTURE.md con nuovi moduli

**Checklist Fase 9**:
- [ ] Aggiungere JSDoc a tutte le funzioni esportate
- [ ] Creare CONTRIBUTING.md
- [ ] Creare docs/ARCHITECTURE.md
- [ ] **NUOVO**: Documentare Export/Import progetti
- [ ] **NUOVO**: Documentare configurazione Ollama
- [ ] Aggiornare README.md con badge e quick start
- [ ] Documentare API DataManager
- [ ] Documentare configurazione AI providers

---

## Fase 10: Mobile e UX

**Priorita**: BASSA
**Effort**: 6-8 ore
**Rischio se non fatto**: Esperienza mobile subottimale

### 10.1-10.4 Implementazioni

*Vedere dettagli nel documento originale - le specifiche rimangono invariate.*

**Nuove considerazioni**:
- Lo Streaming Terminal deve essere responsive o nascosto su mobile
- I pulsanti Export/Import devono essere accessibili su touch

**Checklist Fase 10**:
- [ ] Audit responsive tutte le view
- [ ] Verificare touch targets >= 44px
- [ ] Implementare layout mobile per Structure
- [ ] **NUOVO**: Streaming Terminal responsive
- [ ] Testare su dispositivi reali (iOS/Android)
- [ ] Valutare PWA manifest
- [ ] Ottimizzare immagini per mobile

---

## Checklist Finale

### Prima del Rilascio v1.0

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

### Funzionalita Completate (v0.1.0-alpha)

| Funzionalita | Stato | Data |
|--------------|-------|------|
| Export progetti JSON | ✅ | 30/01/2026 |
| Import progetti JSON | ✅ | 30/01/2026 |
| Test connessione AI | ✅ | 30/01/2026 |
| Streaming Terminal | ✅ | 30/01/2026 |
| Data Inspector | ✅ | 30/01/2026 |
| Supporto Ollama | ✅ | Dic 2025 |
| ConsistencyEngine | ✅ | Dic 2025 |
| Multi-provider AI | ✅ | Dic 2025 |

### Note Finali

- Ogni fase puo essere implementata indipendentemente
- Prioritizzare Fasi 1-4 prima di qualsiasi release stabile
- Documentare ogni modifica nel CHANGELOG
- Creare branch separati per ogni fase
- **Il progetto e in alpha** - alcune funzionalita potrebbero cambiare

---

*Documento generato con l'assistenza di Claude AI*
*Creato: Gennaio 2025 | Ultimo aggiornamento: 30 Gennaio 2026*
