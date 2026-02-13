# NEXUS OMINA ONE SERVER — Architettura di Riferimento

> Nome interno: **NEXUS OMINA ONE SERVER** (hub locale unico per la suite)  
> Scopo: persistenza e interoperabilità tra applicazioni della suite in modalità offline-first, con Hub nascosto e API documentate.

## 1) Obiettivo

Realizzare un motore locale unico (Hub) che:
- sia invisibile all’utente finale,
- centralizzi accesso ai database,
- esponga API locali documentate per tutte le app della suite,
- mantenga portabilità completa dei dati,
- supporti crescita futura (nuove app, nuove capability, nuovi formati).

## 2) Principi non negoziabili

1. **Offline-first reale**: tutte le operazioni core devono funzionare senza cloud.
2. **Hub-only DB access**: nessuna app parla direttamente al DB.
3. **Portabilità**: dati spostabili con copia cartella/pacchetto.
4. **Interoperabilità**: formato canonico comune tra app.
5. **Evolvibilità**: schema versionato + migrazioni additive.
6. **Sicurezza locale**: bind localhost, auth inter-app, audit log.

## 3) Scelta tecnologica consigliata

### 3.1 Source of truth
- **SQLite** come database transazionale principale (per app e exchange).

### 3.2 Layer RAG
- **MemVid** come indice/knowledge layer derivato dal DB (non DB primario).

### 3.3 Motore unico
- **Nexus Hub** come servizio locale headless (daemon), avviato in background.

## 4) Topologia logica

- `Nexus Writer` (client UI)
- `Nexus Suite` (client UI)
- `Future App X` (client UI)
- `Nexus Hub` (API locali + orchestrazione + migrazioni + sync jobs)
- `SQLite DBs` (writer/suite/exchange)
- `MemVid Indexes` (per retrieval condiviso)

Flusso:
1. Le app inviano richieste al Hub via API localhost.
2. Hub valida, autorizza, scrive/legge DB, aggiorna index MemVid quando necessario.
3. Hub restituisce payload app-specifico o canonico.

## 5) Layout dati su disco (cartella condivisa)

Struttura consigliata:

- `NexusData/`
  - `hub/`
    - `config.json`
    - `logs/`
    - `jobs/`
    - `locks/`
  - `db/`
    - `writer.db`
    - `suite.db`
    - `exchange.db`
  - `indexes/`
    - `writer.memvid`
    - `suite.memvid`
    - `shared.memvid`
  - `packages/`
    - `exports/`
    - `imports/`
  - `contracts/`
    - `schema-v1.json`
    - `mapping-suite-to-writer-v1.json`

## 6) Modello dati: tre livelli

### 6.1 Livello App
Schema interno per ciascuna app (writer/suite), indipendente e ottimizzato per UX.

### 6.2 Livello Canonico (Exchange)
Schema comune minimo per lo scambio inter-app:
- metadata progetto,
- personaggi,
- scene,
- ambientazioni,
- linee narrative,
- tag e relazioni.

### 6.3 Livello RAG
Indice MemVid costruito dal canonico o dagli store app, con provenance.

## 7) Contratto API Hub

- API documentate e consultabili (OpenAPI), ma **Hub senza UI utente**.
- Endpoint solo su `127.0.0.1`.
- Versionamento API (`/v1`, `/v2`).
- Capability per app (`writer`, `suite`, `admin-tools`).

## 8) Sicurezza e governance

1. Bind solo localhost.
2. Token inter-app per sessione + registrazione appId.
3. Nessun endpoint SQL/raw file exposure.
4. Audit log per operazioni critiche (import/export/migration).
5. Locking e transazioni su operazioni batch.

## 9) Lifecycle operativo

- Auto-start Hub all’avvio della prima app.
- Health check periodico dalle app.
- Retry con backoff su operazioni transient.
- Recovery:
  - check integrity DB,
  - replay job pending,
  - rebuild index MemVid incrementale.

## 10) Compatibilità e migrazioni

- Ogni DB include `schema_version`.
- Migrazioni gestite solo dal Hub.
- Strategy:
  - additive-first,
  - backup prima di migrare,
  - rollback assistito su errore.

## 11) Flusso Suite -> Writer (use case principale)

1. Suite invia `export` al Hub (scope: progetto, entità, contesto).
2. Hub traduce in payload canonico versionato.
3. Writer chiede `import` dal Hub.
4. Hub mappa canonico -> schema Writer.
5. Hub scrive `writer.db` e aggiorna indice MemVid Writer.

## 12) KPI architetturali

- Tempo apertura progetto < 2s su dataset medio.
- Import inter-app < 5s per progetto standard.
- Rebuild index incrementale < 30s per 100 scene modificate.
- Zero corruzioni dati in test crash/restart.

## 13) Anti-pattern da evitare

- Accesso diretto DB dalle app.
- Un solo DB condiviso scritto da tutte le app.
- MemVid usato come unico database transazionale.
- Migrazioni schema lato client UI.

## 14) Decisione finale

Architettura raccomandata:
- **Hub nascosto + SQLite source-of-truth + MemVid index layer + schema canonico exchange.**

Questa configurazione massimizza affidabilità, portabilità e scalabilità della suite locale.
