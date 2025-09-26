# Writers Nexus

Un'app web offline‑first per organizzare, scrivere e analizzare storie. Pensata per lavorare anche senza connessione, con sincronizzazione remota opzionale.

![GitHub Release](https://img.shields.io/github/v/release/Pioshin/writers-nexus)
![License](https://img.shields.io/badge/license-MIT-blue)
[![Discussions](https://img.shields.io/badge/Join-Discussions-4b8bbe)](https://github.com/Pioshin/writers-nexus/discussions)
[![Issues](https://img.shields.io/badge/Report-Issues-orange)](https://github.com/Pioshin/writers-nexus/issues)
[![Ko‑fi](https://img.shields.io/badge/Ko--fi-Donate-ff5f5f)](https://ko-fi.com/Pioshin)
[![PayPal](https://img.shields.io/badge/PayPal-Donate-00457C)](https://www.paypal.me/Pioshin)

## Caratteristiche (v1.0)

- Importazione testo e segmentazione in scene (senza IA di default)
- Struttura (Viaggio dell’Eroe)
  - Sezione “Scene non assegnate” + batch tagging
  - Drag & drop tra tappe
  - Riordino intra‑stage con campo `order` persistente
  - Badge stage e cambio stage in linea
  - Undo cambio stage (scorciatoia: Ctrl+Alt+Z)
- Suggerimenti IA (Viaggio dell’Eroe)
  - Prompt e parsing robusti (stadi consentiti, IDX, JSON cleaning)
  - Dedup per scena (mantiene confidenza più alta)
  - Filtro per confidenza, selezione, auto‑assegna ≥ soglia
- Scrittura
  - Editor a blocchi con conteggio parole
  - Navigator scene in ordine struttura
  - Badge stage e “Cambia” in linea (Ctrl+Shift+J)
  - Vista “Manoscritto” full screen
- UI/Temi
  - Palette per generi (sci‑fi, fantasy, thriller, romance)
  - Sfondi opachi per massima leggibilità

## Requisiti

- Node.js ≥ 18
- NPM

## Avvio locale

1. Installa le dipendenze
   ```bash
   npm install
   ```
2. Avvia il server di sviluppo
   ```bash
   npm run start
   ```
3. Apri il browser sull’URL mostrato in console (es. http://127.0.0.1:55099)

## Screenshots

> Alcune schermate dell’app (le immagini sono in `docs/screenshots/`).

- Dashboard
  
  ![Dashboard](./docs/screenshots/dashboard.png)

- Ideazione
  
  ![Ideazione](./docs/screenshots/ideation.png)

- Struttura (con "Scene non assegnate")
  
  ![Struttura](./docs/screenshots/structure.png)

- Suggerimenti IA (modale)
  
  ![Suggerimenti IA](./docs/screenshots/hero-suggestions.png)

- Scrittura
  
  ![Scrittura](./docs/screenshots/writing.png)

## Configurazioni opzionali

### IA
- Apri Impostazioni → sezione IA.
- Imposta Provider (OpenAI‑compatibile, Ollama, Anthropic, Google), Base URL (se richiesto), Modello, API Key.
- La funzionalità “Suggerimenti Viaggio dell’Eroe” ne farà uso quando richiesta.

### Sincronizzazione (Firebase)
- L’app funziona interamente in locale (IndexedDB). La sincronizzazione remota è facoltativa.
- Per abilitarla, inserisci in Impostazioni le credenziali Firebase (config oggetto) ed effettua login.
- Senza configurazione, l’app resta in Modalità Offline e i dati restano sul tuo dispositivo.

## Limitazioni (v1.0)

- Nessun collegamento obbligatorio al database remoto (sync Firebase opzionale)
- Editing avanzato e Analisi in via di sviluppo
- Undo batch (es. per riordino) non ancora disponibile

## Architettura dati

- Storage locale: IndexedDB (via libreria `idb`), orchestrato da `DataManager`
- Store principali: `projects`, `scenes`, `ideas`, `characters`, `locations`, `objects`, `geography`, `history`, `culture`, `plotlines`, `systems`, `settings`
- `scenes` include `stageKey` (tappa Viaggio dell’Eroe) e `order` (ordinamento intra‑stage)
- Sincronizzazione opzionale con Firestore tramite `FirebaseSync`

## Roadmap

- Migliorie undo/redo (batch, riordino)
- Analisi e editing avanzati
- Esportazione/Importazione progetto JSON

## Community & Contributi

- Partecipa alle [Discussions](https://github.com/Pioshin/writers-nexus/discussions) per idee, domande e feedback.
- Segnala bug e proponi feature in [Issues](https://github.com/Pioshin/writers-nexus/issues).
- Leggi [CONTRIBUTING](./.github/CONTRIBUTING.md) e apri una PR.
- Se vuoi supportare il progetto: [Ko‑fi](https://ko-fi.com/Pioshin) • [PayPal](https://www.paypal.me/Pioshin)

---

Copyright © 2025
