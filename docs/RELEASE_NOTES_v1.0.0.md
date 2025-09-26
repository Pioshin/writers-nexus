# Writers Nexus v1.0.0 — Public‑ready

> Offline‑first. Import & Struttura solida. Suggerimenti IA per il Viaggio dell'Eroe. Editor a blocchi. UI scura leggibile.

## Highlights

- Offline‑first (IndexedDB), sync Firebase opzionale
- Importazione testo + segmentazione in scene (no IA by default)
- Struttura basata sul Viaggio dell’Eroe
  - Sezione “Scene non assegnate” con batch tagging
  - Drag & drop tra tappe + undo cambio stage (Ctrl+Alt+Z)
  - Riordino intra‑stage con campo `order` persistente
- Suggerimenti IA (Hero Journey)
  - Prompt & parsing robusti (ALLOWED_STAGES, IDX, JSON cleaning)
  - Dedup per scena (mantiene confidenza più alta)
  - Filtri per confidenza, selezione, auto‑assegna ≥ soglia
- Scrittura
  - Editor a blocchi con conteggio parole, badge stage + inline edit (Ctrl+Shift+J)
  - Navigator scene in ordine struttura
  - Vista Manoscritto full‑screen
- UI/Temi
  - Sfondi opachi per leggibilità (coerenti con Ideazione)

## Screenshot

> Inserire gli screenshot PNG dentro `docs/screenshots/` e aggiornare i nomi file qui sotto.

- Dashboard: ![Dashboard](./screenshots/dashboard.png)
- Ideazione: ![Ideazione](./screenshots/ideation.png)
- Struttura (con unassigned): ![Struttura](./screenshots/structure.png)
- Suggerimenti IA (modale): ![Suggerimenti IA](./screenshots/hero-suggestions.png)
- Scrittura: ![Scrittura](./screenshots/writing.png)

## Dettagli funzionali

### Import & Parsing
- Parsing puro separato dall’analisi IA (opzionale e differita)
- Modalità Replace: pulizia mirata solo degli store selezionati
- Default per nuove scene: `stageKey = "unassigned"`

### Struttura
- Stage del Viaggio dell’Eroe suddivisi in Atti
- Dropdown stage su card + mini badge colorati
- Drag & drop tra tappe e sezione Unassigned
- Riordino intra‑stage mediante campo `order` (gap‑based) e normalizzazione quando serve

### Suggerimenti IA
- Prompt con vincoli: ALLOWED_STAGES, lunghezza uguale al numero di scene fornite, IDX di fallback
- Parser con cleanup del JSON, remap idx→id, dedup per id (mantiene confidenza max)
- UI: filtro min confidenza, select all, auto‑apply ≥ soglia, log, contatori (raw/unici/visibili)

### Scrittura
- Editor a blocchi (auto‑save dopo pausa breve)
- Badge stage accanto al titolo + inline edit
- Navigator scene (ordine struttura) + pulsanti scena precedente/successiva
- Vista Manoscritto con ancore e focus mode

## Limitazioni note

- Nessun collegamento obbligatorio al database remoto (sync Firebase opzionale)
- Editing avanzato e Analisi in sviluppo
- Undo batch (es. riordino) non ancora presente

## Migrazioni / Dati

- IndexedDB schema v4: store con indice `by_projectId` (eccetto `projects` e `settings`)
- Campi comuni: `id`, `projectId`, `createdAt`, `lastModified`
- Scene: `stageKey` + `order`

## Bugfix e rifiniture degne di nota
- Allineati prompt/parsing tra modale import e modale suggerimenti
- Fix “replace” per non cancellare store senza selezione
- Sezione Unassigned con batch tagging, drag/drop e contatore selezioni
- Sfondi scuri uniformi per una lettura chiara (Struttura, Scrittura, Import, modali)

## Come provare
1. `npm install`
2. `npm run start`
3. Apri l’URL del server dev (es. http://127.0.0.1:55099)

## Ringraziamenti
- Libreria `idb` per IndexedDB
- `lucide` per le icone
- Provider IA supportati via wrapper `AIService`
