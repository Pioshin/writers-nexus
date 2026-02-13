# Programma Operativo Dettagliato (14 giorni)

> Progetto: Writer's Nexus  
> Stato corrente: **v0.1.0-alpha** (non public-ready)  
> Data piano: **12 febbraio 2026**

## Obiettivo del ciclo (14 giorni)

Portare il progetto da alpha non stabile a **alpha affidabile pronta per beta interna**, con priorità assoluta a:
- sicurezza,
- stabilità,
- coerenza funzionale,
- qualità minima automatizzata (test + gate).

## Vincoli e principi di esecuzione

- Nessuna comunicazione “public-ready” finché i criteri Go/No-Go non sono tutti verdi.
- Le attività P0 bloccano tutto il resto.
- Ogni giornata deve chiudere con output verificabile (deliverable + check).
- Evitare scope creep: prima affidabilità, poi rifiniture.

---

## Roadmap sintetica

- **Settimana 1 (Giorni 1–7):** P0 sicurezza e stabilità + chiusura gap critici.
- **Settimana 2 (Giorni 8–14):** P1 completamento moduli mancanti, test, CI, UAT e freeze.

---

## Giorno 1 — Hardening sicurezza (P0)

### Obiettivi
- Eliminare passaggio API key Google in query string.
- Rinforzare import testo con validazioni robuste.

### Attività
1. `views/modals/config.js`
   - Aggiornare `loadGoogleModels()` per usare header `x-goog-api-key`.
   - Gestire errori HTTP con messaggi user-friendly.
2. `views/modals/import-text.js`
   - Introdurre whitelist estensioni (`.txt`, `.md`, `.markdown`).
   - Introdurre limite dimensione file (es. 5MB) configurabile come costante.
   - Bloccare fallback permissivi su formati non previsti.

### Deliverable
- API key non visibile in URL/network query.
- Import blocca file non consentiti o troppo grandi con errore chiaro.

### Verifica
- Smoke manuale: 1 file valido + 2 invalidi (estensione, size).
- Nessuna regressione nel flusso import standard.

---

## Giorno 2 — Stabilità modali parte 1 (P0)

### Obiettivi
- Rimuovere duplicazioni listener nei modali più usati.

### Attività
- Audit e patch su modali core:
  - `new-project`
  - `character`
  - `scene-editor`
  - `config`
  - `import-text`
- Introdurre pattern lifecycle coerente:
  - bind listener una sola volta in `init()`, oppure
  - cleanup esplicito su `close()`.

### Deliverable
- Nessun submit duplicato, nessun doppio save o doppio toast.

### Verifica
- 30 aperture/chiusure consecutive per ciascun modale core.

---

## Giorno 3 — Stabilità modali parte 2 (P0)

### Obiettivi
- Estendere fix listener a modali secondari.

### Attività
- Audit e fix su modali rimanenti (`location`, `object`, `plotline`, `system`, ecc.).
- Uniformare utility comuni di show/hide e reset stato form.

### Deliverable
- Comportamento omogeneo di apertura/chiusura su tutta la suite modali.

### Verifica
- Test regressione su flussi dashboard → ideation → structure.

---

## Giorno 4 — Undo e ordinamento struttura (P0)

### Obiettivi
- Chiudere il gap su undo batch nel riordino scene.

### Attività
- `views/structure/structure.js`
  - Implementare registrazione stato batch per reorder intra-stage.
  - Integrare ripristino coerente con `StageUndo`.
- `views/shared/stage-undo.js`
  - Estendere stack con payload reorder.

### Deliverable
- Undo funzionante su:
  - cambio stage singolo,
  - batch tagging,
  - riordino intra-stage.

### Verifica
- Sequenza test: 10 operazioni miste + undo multipli senza inconsistenze.

---

## Giorno 5 — Smoke E2E e stabilizzazione P0

### Obiettivi
- Consolidare i fix P0 e chiudere bug bloccanti emersi.

### Attività
- Test end-to-end:
  1. crea progetto,
  2. importa testo,
  3. struttura scene,
  4. scrittura,
  5. export JSON,
  6. import JSON e verifica integrità.
- Correggere regressioni P0/P1 immediate.

### Deliverable
- Smoke checklist completa e ripetibile.

### Verifica
- 3 run completi E2E con esito coerente.

---

## Giorno 6 — Modulo Editing minimo operativo (P1)

### Obiettivi
- Eliminare lo stato stub della view Editing.

### Attività
- `views/editing/editing.js`
  - Caricamento scena corrente.
  - Editor minimo con salvataggio.
  - Indicatori base revisione (es. word count delta, note campo semplice).

### Deliverable
- View Editing usabile (non placeholder).

### Verifica
- Salvataggio persistente e riapertura dati corretta.

---

## Giorno 7 — Cleanup placeholder Ideation/Analysis (P1)

### Obiettivi
- Rimuovere ambiguità tra feature reali e non implementate.

### Attività
- `views/ideation/ideation.js`
  - Implementare minimo reale per Geography/History/Culture **oppure**
  - mostrare stato esplicito “non disponibile in alpha”.
- `views/analysis/analysis.js`
  - Gestire placeholder profilo stile con fallback esplicito.

### Deliverable
- Nessuna sezione che sembri completa ma non lo sia.

### Verifica
- UX review rapida: ogni sezione comunica chiaramente il proprio stato.

---

## Giorno 8 — Setup testing foundation (P1)

### Obiettivi
- Introdurre base di test automatizzati.

### Attività
- Scegliere framework (Vitest consigliato per semplicità con ESM).
- Configurare struttura:
  - `tests/unit/`
  - `tests/integration/`
- Primo set test:
  - DataManager CRUD essenziale,
  - import/export project data,
  - parsing scene/import-text.

### Deliverable
- Test eseguibili in locale con comando unico.

### Verifica
- Minimo 8–12 test verdi.

---

## Giorno 9 — CI quality gate (P1)

### Obiettivi
- Automatizzare controllo qualità su ogni push/PR.

### Attività
- Pipeline CI:
  - install,
  - lint,
  - format check,
  - test.
- Impostare policy “fail fast”.

### Deliverable
- Build fallisce automaticamente con errori qualità.

### Verifica
- Simulare una rottura lint e una rottura test: entrambe devono bloccare.

---

## Giorno 10 — Uniformità error handling UX (P1)

### Obiettivi
- Rendere coerente la gestione errori in tutte le aree.

### Attività
- Standardizzare messaggi e severità (`info/success/warning/error`).
- Uniformare notifiche su import, salvataggi, AI action, fallback.

### Deliverable
- Pattern error UX unico e prevedibile.

### Verifica
- Checklist errori comuni con messaggi comprensibili e non tecnici.

---

## Giorno 11 — Performance base su dataset grandi (P2)

### Obiettivi
- Migliorare reattività su progetti grandi.

### Attività
- Benchmark interno su dataset carico (scene/personaggi/plotline alti).
- Ottimizzazioni veloci:
  - riduzione re-render inutili,
  - debounce dove necessario,
  - uso cache locale su letture ripetute.

### Deliverable
- Navigazione e rendering più fluidi in casi realistici.

### Verifica
- Confronto tempi pre/post su 3 azioni chiave.

---

## Giorno 12 — Allineamento documentazione tecnica/prodotto (P1)

### Obiettivi
- Allineare docs allo stato reale alpha.

### Attività
- Aggiornare README, release notes alpha, roadmap e limiti noti.
- Esplicitare chiaramente:
  - cosa è stabile,
  - cosa è sperimentale,
  - cosa non è ancora disponibile.

### Deliverable
- Documentazione coerente con codice e UX corrente.

### Verifica
- Revisione incrociata: nessun claim fuorviante.

---

## Giorno 13 — UAT interna strutturata

### Obiettivi
- Validare usabilità e robustezza con utenti interni.

### Attività
- Sessione guidata su scenari reali:
  - creazione progetto,
  - import,
  - struttura,
  - scrittura,
  - suggerimenti IA,
  - backup restore.
- Raccolta feedback con severità bug (Critical/High/Medium/Low).

### Deliverable
- Backlog UAT prioritizzato e triage completato.

### Verifica
- Tutti i bug Critical/High assegnati a owner e milestone.

---

## Giorno 14 — Stabilization freeze e decisione Go/No-Go

### Obiettivi
- Chiudere il ciclo con baseline stabile.

### Attività
- Solo bugfix bloccanti, niente nuove feature.
- Eseguire battery finale: lint + test + smoke E2E + UAT recheck.

### Deliverable
- Build alpha stabile candidata a beta interna.

### Verifica
- Go/No-Go meeting con checklist firmata.

---

## Criteri Go/No-Go (uscita da alpha instabile)

### Go se TUTTI veri
- [ ] P0 sicurezza chiusi.
- [ ] P0 stabilità chiusi.
- [ ] Nessun bug critico aperto sui flussi core.
- [ ] Backup/restore verificato più volte senza perdita dati.
- [ ] Lint + test verdi in CI.
- [ ] Documentazione coerente con lo stato reale.

### No-Go se uno o più falsi
- si rinvia il passaggio a beta,
- si apre mini-ciclo correttivo (3–5 giorni),
- si aggiorna roadmap con nuova data realistica.

---

## Backlog operativo prioritizzato (ordine di esecuzione)

### P0 (immediato)
1. API key safety in config modal
2. Validazione import file (size + extension)
3. Listener lifecycle modali
4. Undo batch riordino struttura

### P1 (subito dopo)
5. Editing module minimo operativo
6. Rimozione/gestione placeholder Ideation/Analysis
7. Setup test automatici
8. CI quality gate
9. Uniformità error handling

### P2 (ottimizzazione)
10. Performance dataset grandi
11. Rifiniture UX mobile
12. i18n base (IT/EN)

---

## Capacità team e stima ore

### Stima consigliata
- Totale: **80–120 ore** in 14 giorni (1 dev principale + revisione).
- Breakdown:
  - P0: 30–45 ore
  - P1: 35–50 ore
  - P2 + buffer: 15–25 ore

### Rischi principali
- Debito tecnico nascosto in modali legacy.
- Regressioni su import/structure durante fix undo.
- Tempi setup test iniziale sottostimati.

### Mitigazioni
- Feature freeze su nuove funzioni.
- Regression test giornaliero su flussi core.
- Branching disciplinato + PR piccole e verticali.

---

## Definizione di “Done” del ciclo

Il ciclo è “Done” quando Writer’s Nexus è dichiarato esplicitamente:
- **v0.1.x-alpha stabile**,
- non public-ready,
- pronto a **beta interna** con qualità misurabile e comunicazione onesta dello stato prodotto.
