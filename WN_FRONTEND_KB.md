# Writer's Nexus — Manuale Frontend

> **Versione**: 0.6.0 — Ultimo aggiornamento: 17 aprile 2026
> **Stack**: Vanilla JS (ES Modules) · IndexedDB · Tailwind CSS · Chart.js · NOOS Hub

---

## Indice

1. [Panoramica Architetturale](#1-panoramica-architetturale)
2. [Bootstrap e Navigazione](#2-bootstrap-e-navigazione)
3. [Data Layer](#3-data-layer)
4. [NOOS Hub Sync](#4-noos-hub-sync)
5. [Le 6 Viste](#5-le-6-viste)
6. [Layer AI](#6-layer-ai)
7. [Sistema Modale](#7-sistema-modale)
8. [Temi e Stile](#8-temi-e-stile)
9. [Utility e Helper](#9-utility-e-helper)
10. [Lifecycle Manager](#10-lifecycle-manager)

---

## 1. Panoramica Architetturale

### Principi fondamentali

Writer's Nexus è una **Single Page Application** (SPA) in vanilla JavaScript con moduli ES. Non usa framework (React, Vue, ecc.): ogni vista è un file HTML + JS caricato dinamicamente.

### Flusso dei dati

```
Utente → Viste → DataManager (IndexedDB)
                       ↓ (dual-write, fire-and-forget)
                  HubSync → HubClient → NOOS Hub API (:9090)
```

**IndexedDB è la Source of Truth**: il frontend funziona completamente offline. Se il NOOS Hub è abilitato, HubSync replica ogni operazione in background senza bloccare l'interfaccia.

### Flusso AI

```
Utente → AIPanel / ConsistencyEngine → AIService → ai.worker.js (Web Worker) → LLM API
                                                                          ↓ (streaming)
Utente → AIPanel / Viste → HubJobService → HubClient → NOOS Hub → Worker BKA/KRONK
```

Due percorsi:
- **Diretto** (AIService): chat libera, completamenti, analisi background via Web Worker → collegamento diretto a Ollama o altro provider
- **Orchestrato** (HubJobService): job strutturati via NOOS Hub con workers dedicati (BKA, KRONK), polling, progress, quality gate

### Porta e binding

- **Frontend**: `http://127.0.0.1:55099` (live-server)
- **NOOS Hub**: `http://127.0.0.1:9090`
- **Ollama**: `http://127.0.0.1:11434`

---

## 2. Bootstrap e Navigazione

### Sequenza di avvio (`main.js → initializeApp()`)

```
1. Cache di tutti gli elementi DOM (sidebar, nav, modali, bottoni)
2. ThemeManager.init(themeSelector)
3. new AIPanel(DataManager) → window.aiPanel
4. new ConsistencyEngine(DataManager, toast, AIService) → window.consistencyEngine
5. Pre-caricamento 5 modali: config, sync, confirm, ai-assistant, import-text
6. setupEventListeners()
7. DataManager.init(uiNotifier)
8. HubSync.install(DataManager)         ← monkey-patching dual-write
9. HubSync.configure(settings)          ← abilita/disabilita sync
10. HubJobService.configure(hubClient)   ← se Hub abilitato
11. Controllo porta sorgente
12. window.appConfirm() → dialog modale asincrono
13. AIService.init(buildAIConfig(settings))
14. Mostra app → switchView('dashboard')
```

### Navigazione (SPA)

La funzione `switchView(viewName)` gestisce il cambio vista:

1. Incrementa un **race token** (previene rendering di viste obsolete)
2. Fetch `views/{name}/{name}.html`
3. Inietta l'HTML in `#view-container`
4. Import dinamico `views/{name}/{name}.js`
5. Chiama `module.default.init(DataManager, loadModal, switchView)`

### Modali

`loadModal(modalName)` carica dinamicamente:
1. Fetch `views/modals/{name}.html` → inserisce in `#modal-container`
2. Import `views/modals/{name}.js` → chiama `init()`

### Eventi globali

| Evento | Trigger | Effetto |
|--------|---------|---------|
| `settingschanged` | Cambio impostazioni | Reinit AIService, riconfigura HubJobService |
| `projectchanged` | Cambio progetto attivo | Aggiorna indicatore sidebar |
| `datachanged` | Salvataggio/cancellazione dati | Ricarica indicatore progetto |
| `consistency-progress` | Analisi coerenza | Aggiorna indicatore stato in basso a SX |

### Scorciatoie tastiera globali

| Combinazione | Azione |
|--------------|--------|
| `Ctrl+K` | Apri/chiudi pannello AI |

---

## 3. Data Layer

### 3.1 IndexedDB (`idb.js`)

Wrapper promise-based su IndexedDB (libreria [jakearchibald/idb](https://github.com/jakearchibald/idb) vendorizzata).

- **DB**: `WriterNexusDB`, **versione**: 4
- API usate: `openDB`, `get`, `getAll`, `getAllFromIndex`, `put`, `delete`, `transaction`

### 3.2 DataManager (`DataManager.js`)

12 object store:

| Store | Indice | Descrizione |
|-------|--------|-------------|
| `projects` | — | Progetti con titolo, genere, premessa |
| `settings` | — | Impostazioni utente (singleton) |
| `ideas` | `by_projectId` | Idee libere |
| `characters` | `by_projectId` | Personaggi con relazioni |
| `locations` | `by_projectId` | Luoghi |
| `objects` | `by_projectId` | Oggetti |
| `systems` | `by_projectId` | Sistemi (magia, tecnologia...) |
| `scenes` | `by_projectId` | Scene con blocchi di testo |
| `plotlines` | `by_projectId` | Trame con beat |
| `geography` | `by_projectId` | Elementi geografici |
| `history` | `by_projectId` | Elementi storici |
| `culture` | `by_projectId` | Elementi culturali |

### Metodi principali

**Progetti**:
- `getProjects()` — Tutti i progetti
- `getProject(id)` — Singolo progetto
- `saveProject(data)` — Upsert con titolo univoco (case-insensitive), auto-imposta come attivo
- `deleteProject(id)` — Cancellazione transazionale: rimuove progetto + tutti gli item in tutti gli store

**Scene**:
- `getScenesForStage(projectId, stageKey)` — Filtra per stage del Viaggio dell'Eroe, ordina per `order`
- `getScene(id)` — Singola scena
- `saveScene(data)` — Upsert con auto-ID (`scene-{timestamp}-{random}`)
- `deleteScene(id)` — Cancella scena

**CRUD generico**:
- `getProjectItems(projectId, itemType)` — Tutti gli item di un tipo
- `saveProjectItem(projectId, itemType, data)` — Upsert generico
- `deleteProjectItem(itemType, itemId)` — Cancella singolo item

**Impostazioni**:
- `getSettings()` — Con valori di default (tema=scifi, aiProvider=openai-compatible)
- `saveSettings(data)` — Merge e dispatch di `settingschanged`
- `getCurrentProjectId()` / `setCurrentProjectId(id)` — Progetto attivo
- `getCurrentSceneId()` / `setCurrentSceneId(id)` — Scena attiva

**Import/Export**:
- `getProjectData(projectId)` — Esporta progetto completo con tutti gli store
- `importProjectData(jsonData, options)` — Validazione struttura, max 5000 item, sanitizzazione, import transazionale
- `exportAllProjects()` / `importAllProjects(jsonData, options)` — Backup completo

---

## 4. NOOS Hub Sync

### 4.1 HubClient — Client REST

Classe che wrappa le chiamate HTTP verso il NOOS Hub.

**Configurazione**:
```javascript
new HubClient({ baseUrl: 'http://127.0.0.1:9090', token: 'eyJ...', app: 'writer', timeoutMs: 10000 })
```

**Endpoint mappati**:

| Metodo | Endpoint |
|--------|----------|
| `health()` | `GET /v1/health` |
| `createProject(payload)` | `POST /v1/projects?app=writer` |
| `getProject(id)` | `GET /v1/projects/:id?app=writer` |
| `listProjects()` | `GET /v1/projects?app=writer` |
| `updateProject(id, patch)` | `PATCH /v1/projects/:id?app=writer` |
| `deleteProject(id)` | `DELETE /v1/projects/:id?app=writer` |
| `createEntity(type, pid, payload)` | `POST /v1/entities/:type?app=writer&projectId=:pid` |
| `getEntity(type, id)` | `GET /v1/entities/:type/:id?app=writer` |
| `listEntities(type, pid)` | `GET /v1/entities/:type?app=writer&projectId=:pid` |
| `updateEntity(type, id, patch)` | `PATCH /v1/entities/:type/:id?app=writer` |
| `deleteEntity(type, id)` | `DELETE /v1/entities/:type/:id?app=writer` |
| `createJob(...)` | `POST /v1/jobs/create` |
| `getJob(id)` | `GET /v1/jobs/:id` |
| `listJobs()` | `GET /v1/jobs` |
| `migrateIdb(dump)` | `POST /v1/migrate/import-idb` |
| `streamEvents(filter, onEvent)` | `EventSource /v1/events/stream` |

**Resilienza HTTP**:
- Autenticazione Bearer via header `Authorization`
- `AbortController` con timeout configurabile (default 10s)
- Retry con backoff `[200ms, 500ms, 1500ms]` su GET/PATCH/DELETE (mai su POST)
- Nessun retry su errori 4xx (tranne 409)
- Classe `HubError` con helper: `.isNetworkError`, `.isNotFound`, `.isConflict`, `.isAuthError`

### 4.2 HubSync — Dual-write bridge

**Principio**: Monkey-patching dei metodi di DataManager per replicare automaticamente le operazioni su NOOS Hub.

**Store sincronizzati**: `characters`, `scenes`, `plotlines`, `locations`, `ideas`, `objects`, `systems`, `geography`, `history`, `culture`

**Metodi patchati**:

| Metodo originale | Operazione Hub |
|-----------------|----------------|
| `saveProject(data)` | `createProject()` — se 409 → `updateProject()` |
| `deleteProject(id)` | `deleteProject()` — se 404 → ok silenzioso |
| `saveScene(data)` | `createEntity('scenes', ...)` — se 409 → `updateEntity()` |
| `deleteScene(id)` | `deleteEntity('scenes', ...)` |
| `saveProjectItem(pid, type, data)` | `createEntity(type, ...)` se tipo in ENTITY_STORES |
| `deleteProjectItem(type, id)` | `deleteEntity(type, ...)` |

**Gestione conflitti**:
- **409 Conflict**: Prova update anziché create
- **404 Not Found** (su delete): Successo silenzioso
- **Tutti gli errori**: Fire-and-forget (`_fireAndForget`) — nessun blocco UI

**Configurazione**:
```javascript
HubSync.configure({ hubEnabled: true, hubUrl: 'http://...', hubToken: 'eyJ...' })
HubSync.isEnabled()   // → boolean
HubSync.getClient()   // → HubClient | null
```

---

## 5. Le 6 Viste

### 5.1 Dashboard — `views/dashboard/`

Pagina iniziale con la lista dei progetti.

**Funzionalità**:
- **Crea progetto**: Apre modale `new-project`, al successo imposta come attivo e naviga a ideation
- **Seleziona progetto**: Click su card → imposta come attivo → va a ideation
- **Azioni overlay** (hover sulla card): Modifica, Cancella, Esporta (JSON download)
- **Aggiornamento live**: Listener su `datachanged` per refresh automatico

### 5.2 Ideation — `views/ideation/`

Worldbuilding e ideazione creativa. 3 tab:

| Tab | Contenuti |
|-----|-----------|
| **Ideas & AI** | Idee libere (testo + titolo), CRUD con overlay |
| **Characters** | Schede personaggi con sistema relazioni |
| **Worldbuilding** | Luoghi, oggetti, sistemi, geografia, storia, cultura |

**Sistema relazioni personaggi**:
- Categorie: positive (Amicizia, Alleanza, Amore, Rispetto), negative (Rivalità, Inimicizia), neutre (Famiglia, Mentore/Allievo, Sospetto)
- Colori: sky-400 / red-500 / slate-400
- Filtro interattivo: click su avatar relazione → evidenzia solo personaggi collegati (altri sfumano a 30%)
- Effetti audio/video: animazione spada SVG su "Inimicizia", heartbeat su "Amore" (via `AudioContext`)

**Tag narrativi** per filtro personaggi: archetipo, ruolo, importanza

**Inserimento AI**: Listener su evento `ai-action-insert` per inserire testo generato dall'AI come nuova idea

### 5.3 Structure — `views/structure/`

Organizzazione scene nel **Viaggio dell'Eroe** con drag-and-drop.

**12 stage su 3 atti**:

| Atto | Stage |
|------|-------|
| Atto 1 | Ordinary World, Call to Adventure, Refusal, Meeting Mentor, Crossing Threshold |
| Atto 2 | Tests/Allies/Enemies, Inmost Cave, Ordeal, Reward |
| Atto 3 | Road Back, Resurrection, Return with Elixir |
| — | Non assegnate |

**Funzionalità**:
- **Stage collassabili**: Ogni stage si espande/collassa, con toggle per atto e globale
- **Drag-and-drop**: Spostamento scene tra stage con registrazione undo
- **Riordino intra-stage**: Drag per cambiare l'ordine all'interno di uno stage con calcolo gap ordine
- **Selezione batch**: Per le scene non assegnate, checkbox + assegnazione multipla a uno stage
- **Undo**: `Ctrl+Alt+Z` annulla l'ultimo cambio di stage (stack LIFO, max 100 entry)

### 5.4 Writing — `views/writing/`

Editor di scrittura a blocchi con vista manoscritto.

**Editor a blocchi**:
- Ogni blocco è un `<div contenteditable>` con:
  - Grip per drag
  - Bottone "aggiungi sotto"
  - Bottone elimina
- Auto-salvataggio su debounce 1.2s
- Dati salvati come array `blocks[]` + stringa `content` unificata

**Navigazione scene**:
- Sidebar sinistra con lista scene in ordine del Viaggio dell'Eroe
- Navigazione precedente/successiva
- Badge stage con colore per atto

**Vista manoscritto** (overlay full-screen):
- Genera manoscritto completo da tutte le scene ordinate
- Modalità lettura / modifica
- Focus mode: sfuma tutti i paragrafi tranne quello attivo
- Conteggio parole → stima pagine (300 parole/pagina)
- Editing in-place con save su debounce 600ms

**Toolbar Hub** (se NOOS Hub disponibile):
- **Genera capitolo**: `HubJobService.writeChapter()` con nomi personaggi e contesto
- **Revisiona scena**: `HubJobService.reviseChapter()`
- Risultato inseribile come nuovi blocchi o dismissibile

**Scorciatoie**:

| Combinazione | Azione |
|--------------|--------|
| `Ctrl+B` | Grassetto |
| `Ctrl+I` | Corsivo |
| `Alt+1` | Titolo H1 |
| `Alt+2` | Titolo H2 |
| `Ctrl+Shift+J` | Cambia stage inline |
| `Ctrl+Alt+Z` | Undo stage |
| `Escape` | Chiudi manoscritto |

### 5.5 Editing — `views/editing/`

Revisione/riscrittura via NOOS Hub con confronto split-pane.

**Funzionalità**:
- Selettore scena dal dropdown
- Visualizzazione testo corrente con word/char count
- Indicatore stato Hub (dot verde = online)
- Job task disponibili: `revise.chapter`, `rewrite.section` (via KRONK)
- Barra progresso durante l'esecuzione del job
- Visualizzazione risultato con conteggio parole e quality flag
- **Applica risultato**: Sostituisce il contenuto della scena con la revisione

### 5.6 Analysis — `views/analysis/`

Analisi del progetto con grafici e metriche.

**Sezioni**:

| Sezione | Dettagli |
|---------|----------|
| **Copertura trame** | Percentuale beat completati per trama |
| **Bilanciamento personaggi** | Tabella con conteggio menzioni, presenza scene, peso ruolo |
| **Pacing** (grafico a barre) | Parole per scena. Colori: <800 cyan, 800-1500 giallo, >1500 rosso |
| **Presenza personaggi** (grafico a linee) | Top 5 personaggi sulle scene (Chart.js) |
| **Controllo sequenza** | Rileva regressioni nel Viaggio dell'Eroe |
| **Regressione beat trame** | Rileva problemi d'ordine nei beat |
| **Matrice trame** | Griglia scene × trame con matching keyword |
| **Profilo stile** | Placeholder per analisi stilistica AI |

**Analisi Hub** (pulsanti AI se Hub disponibile):
- `HubJobService.analyzeManuscript()` — Analisi testo completo (max 10K char)
- `HubJobService.analyzeConsistency()` — Verifica coerenza cross-scena
- `HubJobService.extractEntities()` — Estrazione entità dal manoscritto

**Rilevamento menzioni personaggi**:
- Normalizzazione NFD per accenti
- Matching multi-token con stop words italiane
- Supporto alias
- Peso per ruolo (protagonista=10, antagonista=7, ecc.)

---

## 6. Layer AI

### 6.1 AIService — Interfaccia LLM

Supporta 4 provider: `ollama`, `google`, `openai-compatible`, `anthropic`.

**Metodi**:

| Metodo | Descrizione |
|--------|-------------|
| `init(opts)` | Config provider con default, init Web Worker |
| `getConfig()` | Copia config corrente |
| `checkConnection()` | Test connettività via Worker (verifica modello per Ollama) |
| `complete({prompt, system, temperature, maxTokens})` | Completamento singolo turno |
| `chat({messages, temperature, maxTokens})` | Chat multi-turno |
| `analyzeBackground(chunk, type, context)` | Analisi via Worker con timeout 5 min |

**Costruzione URL**:
- Ollama: `{base}/v1/chat/completions` (rimuove `/v1` finale)
- Altri: `{base}/chat/completions`

### 6.2 AIPanel — Chat e azioni contestuali

Pannello laterale destro (320-384px) con:
- **Indicatore contesto**: Mostra la vista corrente
- **Azioni rapide**: Griglia di bottoni diversi per ogni vista
- **Chat**: Thread di messaggi (utente a destra, assistente a sinistra, sistema centrato)
- **Input**: Textarea + bottone invio

**Azioni contestuali per vista**:

| Vista | Azioni |
|-------|--------|
| Dashboard | Suggerisci premessa, analizza genere |
| Ideation | Idee personaggi, luoghi, oggetti, brainstorm |
| Structure | Sviluppa trama, suggerisci scene, colpo di scena |
| Writing | Continua scena, dialogo, descrivi ambiente, aggiungi emozione |
| Editing | Riscrivi passo, riduci, espandi, correggi tono |
| Analysis | Analizza pacing, personaggi, trova buchi trama |

**Integrazione Hub**: Se Hub disponibile, aggiunge bottoni NOOS (KRONK per writing/editing, BKA per analysis) accanto alle azioni standard.

**Import controller**: Modalità speciale per importare testo da file/incolla con checkboxes e pipeline di processamento.

**Prompt di contesto**: `buildSystemPrompt()` inietta dati progetto, scena corrente, personaggi, trame in base alla vista attiva.

### 6.3 HubJobService — Job Manager

Polling ogni 2.5s fino a stato terminale, timeout 10 min.

**Metodi convenience**:

| Metodo | Engine | Task | Priorità |
|--------|--------|------|----------|
| `writeChapter(pid, payload, onProgress)` | KRONK | `write.chapter` | interactive |
| `reviseChapter(pid, payload, onProgress)` | KRONK | `revise.chapter` | standard |
| `rewriteSection(pid, payload, onProgress)` | KRONK | `rewrite.section` | standard |
| `analyzeManuscript(pid, payload, onProgress)` | BKA | `analyze.manuscript` | standard |
| `analyzeConsistency(pid, payload, onProgress)` | BKA | `analyze.consistency` | batch |
| `extractEntities(pid, payload, onProgress)` | BKA | `extract.entities` | batch |

**Eventi emessi**: `hub-job-queued`, `hub-job-progress`, `hub-job-done`

### 6.4 AIWorldbuilding — Generatore worldbuilding

Genera e applica contenuti AI direttamente nelle modali di worldbuilding.

**Tipi supportati**: character, location, object, system, geography, history, culture

Per ogni tipo: campi, mapping campi→ID DOM, schema JSON, prompt create/improve in italiano.

| Metodo | Descrizione |
|--------|-------------|
| `generate(type, mode)` | Costruisce prompt con contesto progetto, chiama `AIService.complete()` |
| `applyToFields(type, data)` | Scrive i dati generati nei campi del form modale |
| `generateAndApply(type, mode)` | Generate + parse JSON + apply in un passo |
| `repairJson(str)` | Rimuove code fence, fix virgole trailing, estrae oggetto JSON |

### 6.5 Web Worker (`ai.worker.js`)

Worker dedicato per operazioni AI non bloccanti:

| Messaggio | Funzione |
|-----------|----------|
| `CONFIG` | Aggiorna config interna |
| `CHECK_CONNECTION` | Ping Ollama `/api/tags` o `/models` |
| `ENQUEUE_ANALYSIS` | Coda analisi, processamento sequenziale |

**Tipi di analisi**:
- `extraction` — Estrazione entità con protocollo compatto TOON: `{"c":[],"l":[],"o":[],"k":[]}`
- `consolidation` — Merge duplicati, assegnazione categorie

**Streaming**: Usa `stream: true` con parsing SSE, posta `JOB_PROGRESS` per aggiornamento live.

---

## 7. Sistema Modale

16 modali in `views/modals/`, caricati dinamicamente:

| Modale | Scopo |
|--------|-------|
| `new-project` | Creazione progetto (titolo, genere, premessa, tono) |
| `character` | Scheda personaggio (nome, ruolo, archetipo, aspetto, psicologia, arco, relazioni) |
| `location` | Luogo (nome, tipo, descrizione, atmosfera) |
| `object` | Oggetto (nome, tipo, proprietà, importanza narrativa) |
| `system` | Sistema (magia, tecnologia, regole, limiti) |
| `geography` | Geografia (nome, tipo, clima, relazioni spaziali) |
| `history` | Storia (epoca, eventi, conseguenze) |
| `culture` | Cultura (nome, valori, tradizioni, conflitti) |
| `plotline` | Trama (titolo, tipo, beat, personaggi coinvolti) |
| `scene-editor` | Editor scena (titolo, stage, testo, note) |
| `ai-assistant` | Assistente AI (configurazione provider e modello) |
| `config` | Impostazioni generali (tema, Hub, AI) |
| `confirm` | Dialog di conferma generico asincrono |
| `sync` | Sincronizzazione Hub (stato, migrazione IDB) |
| `import-text` | Import testo da file o incolla |
| `hero-suggestions` | Suggerimenti AI per stage del Viaggio dell'Eroe |

Le modali per worldbuilding (character, location, object, system, geography, history, culture) integrano il generatore AIWorldbuilding con bottoni **Genera**, **Migliora**, **Stop**, **Applica**.

---

## 8. Temi e Stile

### 4 temi disponibili

| Tema | Font display | Background | Palette |
|------|-------------|------------|---------|
| **Sci-Fi** (default) | Cinzel (serif) | `BKG/sci-fi.png` | Blu/cyan neon, sfondo scuro |
| **Fantasy** | MedievalSharp (cursive) | `BKG/fantasy.png` | Ambra/oro, sfondo pergamena scuro |
| **Thriller** | Special Elite (cursive) | `BKG/thriller.png` | Rosso/nero, sfondo fumoso |
| **Romance** | Dancing Script (cursive) | `BKG/romance.png` | Rosa/viola, sfondo tenue |

Ogni tema definisce CSS custom properties via `[data-theme='X']`:
- `--bg-primary`, `--bg-secondary`, `--bg-tertiary`
- `--text-primary`, `--text-secondary`
- `--accent`, `--accent-glow`, `--accent-hover`
- `--border-color`
- `--font-display`

### Font system

| Variabile | Font | Uso |
|-----------|------|-----|
| `--font-main` | Inter | Testo UI generale |
| `--font-display` | Varia per tema | Titoli, headings |
| `--font-body` | Merriweather | Testo narrativo, manoscritto |
| `--font-mono` | JetBrains Mono | Codice, contatori |

### Classi CSS principali

| Classe | Stile |
|--------|-------|
| `.card-glass` | Glass-morphism: bg-secondary + blur + shadow |
| `.manuscript-body` | Merriweather, 18px, line-height 1.8, max-width 65ch |
| `.scene-card` | Card trascinabile con hover border accent |
| `.stage-badge-mini` | Badge colorato per atto (act1/act2/act3/unassigned) |
| `.modal-backdrop` | Fullscreen fisso con blur |
| `.toast` | Notifica slide-in con varianti success/error |
| `.progress-bar` | Gradient con animazione shimmer |
| `.overlay-actions` | Bottoni azione reveal-on-hover su card |
| `.drop-indicator-before/after` | Marker inserimento drag-and-drop |

### Responsive

- Breakpoint: **768px** (Tailwind `md:`)
- **Desktop**: Sidebar visibile (288px), AI Panel a destra (320-384px)
- **Mobile**: Sidebar off-screen (`-translate-x-full`), hamburger menu, overlay mobile

---

## 9. Utility e Helper

### 9.1 ConsistencyEngine

Motore di verifica coerenza con analisi AI progressiva.

**Regole base** (sincrone):
1. `checkGhostCharacters()` — Nomi nel testo non presenti nei database
2. `checkAbandonedPlotlines()` — Trame senza beat assegnati a scene
3. `checkEmptyScenes()` — Scene con < 50 caratteri

**Pipeline AI** (3 fasi):
1. **Extraction**: Per ogni scena, hash del contenuto → se cambiato, AI extraction via Worker o fallback euristico
2. **Consolidation**: Merge alias/refusi tra tutte le scene via Worker (`consolidation`)
3. **Commit**: Salva nomi canonici, rileva entità fantasma

**Fallback euristico**: Regex `/\b[A-Z][a-z]{2,}\b/g` con stop words italiane, soglia frequenza ≥ 3

**Checkpoint**: Salvataggio incrementale tra le fasi per recovery.

**Progresso**: Broadcast di eventi `consistency-progress` + `analysis-progress` con stima tempo.

### 9.2 VectorStore

Cache AI su IndexedDB `writers-nexus-rag`, store `vectors`:
- `saveAnalysis(id, content, analysis)` — Salva con hash SHA-256
- `getCachedAnalysis(id, content)` — Ritorna cache se hash coincide
- `clear()` — Pulisce tutto

### 9.3 Overlay (`views/shared/overlay.js`)

Barra azioni hover su card:
- `createActionOverlay({onEdit, onDelete, actions})` — Crea con icone Lucide
- `addOverlayTo(container, options)` — Appende al container

### 9.4 Stage Undo (`views/shared/stage-undo.js`)

Stack LIFO, massimo 100 entry:
- `record(sceneId, fromStage, toStage)` — Registra cambio stage
- `recordReorder(stageKey, before, after)` — Registra riordino con snapshot
- `undoLast()` — Pop e ripristina → dispatch `stage-undo-applied`

### 9.5 Toast (`views/shared/toast.js`)

Notifiche non bloccanti con auto-distruzione:
- `toast.info(msg)` — 3s
- `toast.success(msg)` — 2.5s
- `toast.error(msg)` — 5s
- `toast.show(msg, {type, duration})` — Custom

---

## 10. Lifecycle Manager

Lo script `toggle-writers-nexus.sh` (~960 righe) gestisce l'intero stack.

### Logica toggle

Se la porta frontend (55099) o backend (9090) è in uso → **stop tutto**; altrimenti → **start tutto**.

### Sequenza di avvio

```
1. Ollama serve             (se non attivo, attende max 8s)
2. NOOS Hub Backend         (uvicorn :9090, attende max 10s)
   → Generazione JWT secret (se assente)
   → Creazione token per workers, IODA, frontend
3. Push policy IODA         (auto-detect modello Ollama, PUT /v1/llm/policy)
4. Check VRAM               (warning se offload parziale CPU)
5. Frontend live-server     (:55099, attende max 5s)
6. Worker BKA               (python -m bka.main)
7. Worker KRONK             (python -m kronk.main)
8. Apertura browser         (http://127.0.0.1:55099)
```

### Sequenza di stop

```
1. Kill workers (BKA, KRONK) via PID file
2. Kill backend via PID file + fallback porta
3. Kill frontend via PID file + fallback porta
4. Force kill (kill -9) se graceful shutdown fallisce
```

### Scope JWT per componente

| Componente | Scope |
|-----------|-------|
| **Worker** | `jobs:poll`, `jobs:report`, `llm:chat`, `llm:complete` |
| **IODA** | `llm:policy`, `llm:chat`, `llm:complete` |
| **Frontend** | `jobs:create`, `jobs:read`, `jobs:cancel`, `events:listen` |

### Percorsi file

| File | Percorso |
|------|----------|
| PID backend | `NOOS/.run/backend.pid` |
| PID frontend | `NOOS/.run/frontend.pid` |
| PID workers | `NOOS/.run/worker-*.pid` |
| Log backend | `.writers-nexus-backend.log` |
| Log frontend | `.writers-nexus-frontend.log` |
| Log workers | `.run/worker-*.log` |
| JWT secret | `.run/jwt_secret` |
| Token frontend | `.run/frontend_token` |

### Dipendenze CDN (frontend)

| Libreria | Versione | Uso |
|----------|----------|-----|
| Tailwind CSS | 3.x | Framework CSS utility-first |
| Chart.js | 4.4.1 | Grafici analysis view |
| Lucide Icons | latest | Icone SVG |
| @google/generative-ai | latest (esm.run) | Provider Google Gemini |
| Google Fonts | — | 8 font families |
