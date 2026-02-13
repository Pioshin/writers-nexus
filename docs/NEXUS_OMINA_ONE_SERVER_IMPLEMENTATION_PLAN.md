# NEXUS OMINA ONE SERVER — Piano di Implementazione Dettagliato

## 0) Obiettivo operativo

Passare da storage browser-centrico per app singola a piattaforma locale multi-app con Hub centralizzato, mantenendo offline-first e portabilità completa.

## 1) Milestone roadmap (10 settimane)

### M1 — Foundation Hub (Settimane 1-2)

#### Deliverable
- servizio Hub headless avviabile localmente,
- health endpoint,
- session handshake,
- writer.db e suite.db creati via Hub,
- config e logging base.

#### Task
1. bootstrap progetto Hub (runtime + struttura moduli)
2. layer config (`hub/config.json`)
3. layer storage SQLite (connessione + migrazioni)
4. endpoints `/v1/health`, `/v1/session/open`, `/v1/session/close`
5. auth locale minima (token sessione)

#### Acceptance criteria
- app client apre sessione e riceve token valido
- hub risponde health < 100ms locale
- db creati e versionati correttamente

---

### M2 — CRUD applicativo via Hub (Settimane 3-4)

#### Deliverable
- CRUD progetti + entità via API,
- Writer integrato in read/write con Hub dietro feature flag,
- fallback temporaneo su IndexedDB.

#### Task
1. endpoint projects ed entities generic
2. mapping schema API -> SQLite
3. adapter client per Writers Nexus (`HubClient`)
4. dual-write controllato (hub + legacy) per finestra transitoria
5. telemetria base request/errore

#### Acceptance criteria
- creazione/modifica progetto persistono via Hub
- riavvio app mantiene dati senza dipendere da origin browser
- rollback a legacy possibile via flag

---

### M3 — Exchange canonico Suite -> Writer (Settimane 5-6)

#### Deliverable
- formato canonico versionato,
- pipeline export/import via Hub,
- primo mapping ufficiale `suite -> writer`.

#### Task
1. definire `schemaVersion=1` (manifest + entities + relations)
2. endpoint `/v1/exchange/export` e `/v1/exchange/import`
3. mapper `suite_to_canonical`
4. mapper `canonical_to_writer`
5. report import con conteggi e conflitti

#### Acceptance criteria
- dataset Suite importato in Writer con integrità > 99%
- conflitti tracciati con report esplicito
- pacchetto exchange portabile tra macchine

---

### M4 — RAG layer MemVid gestito da Hub (Settimane 7-8)

#### Deliverable
- indexing MemVid incrementale,
- query RAG centralizzata,
- stato indice monitorabile.

#### Task
1. modulo `RagIndexer` (full + incremental)
2. endpoint `/v1/rag/index/*` e `/v1/rag/query`
3. provenance per chunk (`sourceApp`, `projectId`, `entityRef`, timestamp)
4. policy freshness (`needs_reindex`)

#### Acceptance criteria
- query RAG restituisce risultati coerenti cross-app
- reindex incrementale attivo su modifiche scene/entità
- nessun blocco transazionale sul DB primario

---

### M5 — Hardening, packaging e rollout (Settimane 9-10)

#### Deliverable
- migrazione da IndexedDB a Hub-ready,
- gestione lock/concorrenza,
- documentazione API + runbook ops,
- rollout beta interna.

#### Task
1. tool migrazione (`indexeddb -> hub sqlite`)
2. lock manager (file lock + timeout + recovery)
3. job queue robusta con retry/backoff
4. OpenAPI completa + SDK client interno
5. checklist QA + benchmark performance

#### Acceptance criteria
- migrazione idempotente e reversibile
- nessuna perdita dati in test crash/restart
- API documentata e consultabile

---

## 2) Backlog tecnico per componenti

### 2.1 Hub Core
- `SessionManager`
- `AuthGuard`
- `CapabilityPolicy`
- `JobQueue`
- `AuditLogger`

### 2.2 Storage
- `DbManager` (writer/suite/exchange)
- `MigrationRunner`
- `Repository<T>`

### 2.3 Exchange
- `CanonicalSchemaValidator`
- `MapperSuiteToCanonical`
- `MapperCanonicalToWriter`
- `ConflictResolver`

### 2.4 RAG
- `MemVidAdapter`
- `RagIndexer`
- `RagQueryService`

### 2.5 Client SDK
- `HubClient` (session, retry, errors)
- `WriterDataAdapter`
- `SuiteDataAdapter`

## 3) Piano test dettagliato

### 3.1 Unit
- validazione schema canonico
- mapping suite->canonical->writer
- auth/token/session expiry
- merge e conflict resolution

### 3.2 Integration
- writer CRUD via Hub
- suite export -> writer import
- rebuild index e rag query
- migrazione legacy -> hub

### 3.3 Chaos / resilienza
- kill hub durante import
- lock contention multi-client
- db recovery dopo crash

## 4) KPI e SLO

- Availability locale Hub: 99.5%
- Latency CRUD locale p95: < 120ms
- Import exchange p95 (progetto medio): < 5s
- Reindex incrementale p95 (100 scene): < 30s

## 5) Governance e versioning

- `schemaVersion` su DB e payload exchange
- API major versioning (`/v1`, `/v2`)
- deprecazione con finestra minima 2 release

## 6) Rischi e mitigazioni

1. **Conflitti multi-app**
   - Mitigazione: lock manager + job serialization.
2. **Drift schema tra app**
   - Mitigazione: canonical contract + validator obbligatorio.
3. **Reindex costoso**
   - Mitigazione: incremental indexing e batching.
4. **Migrazione utenti legacy complessa**
   - Mitigazione: wizard guidato + backup auto.

## 7) Sequenza di adozione consigliata

1. Attivare Hub in shadow mode (log-only).
2. Abilitare Writer in dual-write.
3. Abilitare exchange Suite->Writer.
4. Spostare RAG su Hub.
5. Spegnere path legacy gradualmente.

## 8) Done definition (programma)

Il programma è completato quando:
- tutte le app usano Hub per persistenza,
- exchange canonico è stabile,
- MemVid è gestito dal Hub,
- API sono documentate e versionate,
- migrazione legacy è completata senza perdita dati.
