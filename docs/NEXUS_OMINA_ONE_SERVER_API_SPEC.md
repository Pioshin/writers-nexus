# NEXUS OMINA ONE SERVER — API Specification (v1)

## 1) Scope

API locali per integrazione tra app della suite e Hub.

- Trasporto: HTTP locale
- Bind: `127.0.0.1`
- Base path: `/v1`
- Content-Type: `application/json`

## 2) Security model

- Header richiesti:
  - `X-Nexus-App-Id`
  - `X-Nexus-Token`
- Token emesso tramite handshake iniziale.
- Capability per app: `writer`, `suite`, `admin-tools`.

## 3) Endpoints principali

### 3.1 Health & session

- `GET /v1/health`
  - scopo: stato servizio
- `POST /v1/session/open`
  - scopo: handshake app + emissione token
- `POST /v1/session/close`
  - scopo: chiusura sessione

### 3.2 Project CRUD (app scoped)

- `GET /v1/projects?app=writer`
- `POST /v1/projects?app=writer`
- `GET /v1/projects/{projectId}?app=writer`
- `PATCH /v1/projects/{projectId}?app=writer`
- `DELETE /v1/projects/{projectId}?app=writer`

### 3.3 Entity CRUD (generic)

- `GET /v1/entities/{entityType}?app=writer&projectId=...`
- `POST /v1/entities/{entityType}?app=writer`
- `PATCH /v1/entities/{entityType}/{id}?app=writer`
- `DELETE /v1/entities/{entityType}/{id}?app=writer`

EntityType ammessi (v1):
- `scenes`, `ideas`, `characters`, `locations`, `objects`, `systems`, `plotlines`, `geography`, `history`, `culture`

### 3.4 Exchange (cross-app)

- `POST /v1/exchange/export`
  - sourceApp + projectId + scope
  - output: package canonico versionato
- `POST /v1/exchange/import`
  - targetApp + packageId|payload
  - output: summary import
- `GET /v1/exchange/packages/{packageId}`

### 3.5 RAG / MemVid

- `POST /v1/rag/index/rebuild`
- `POST /v1/rag/index/incremental`
- `POST /v1/rag/query`
- `GET /v1/rag/index/status?app=writer&projectId=...`

### 3.6 Jobs

- `POST /v1/jobs`
- `GET /v1/jobs/{jobId}`
- `GET /v1/jobs?status=pending|running|failed|done`

## 4) Payload canonico minimo (exchange)

Oggetto root:
- `schemaVersion`
- `sourceApp`
- `targetApp` (opzionale)
- `exportedAt`
- `project`
- `entities`
- `relations`
- `provenance`

`entities` include array per tipo con campi standard:
- `id`, `externalId`, `name/title`, `description/content`, `tags[]`, `metadata{}`

## 5) Error model

Formato errore unico:
- `code`
- `message`
- `details`
- `traceId`

Codici consigliati:
- `AUTH_INVALID`
- `APP_NOT_ALLOWED`
- `SCHEMA_UNSUPPORTED`
- `MIGRATION_REQUIRED`
- `RESOURCE_NOT_FOUND`
- `DB_LOCKED`
- `INDEX_OUTDATED`

## 6) Versioning policy

- Breaking change -> nuovo path major (`/v2`).
- Non-breaking -> additive in `/v1`.
- Ogni risposta include `apiVersion`.

## 7) Observability

- Ogni request riceve `traceId`.
- Log strutturati nel Hub (`logs/`).
- Metriche minime:
  - latency p50/p95,
  - error rate,
  - queue depth jobs,
  - index freshness.

## 8) OpenAPI source of truth

Questo file è guida funzionale.
Lo schema machine-readable definitivo deve essere pubblicato come:
- `docs/nexus-omina-one-server.openapi.yaml`
