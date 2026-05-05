# SNI-WIKI — Sistema Normativo Interno

Wiki aziendale per la gestione delle procedure normative interne, basato su
**Wiki.js** con due servizi sidecar:

- **ingestion-worker** (Python/FastAPI): converte PDF/DOC in markdown,
  applica OCR ai documenti scansionati, estrae metadati e cross-reference
  via Gemini, crea pagine draft su Wiki.js.
- **agent-service** (Node/TypeScript): chat assistente per gli admin che
  propone modifiche guidate alle procedure. Le modifiche sono sempre
  registrate come *proposal* e applicate solo dopo approvazione esplicita.

## Architettura

```
Caddy (TLS) ──► Wiki.js ──┐
                          ├─► PostgreSQL 16 + pgvector
ingestion-worker ─────────┤
agent-service ────────────┘
```

## Quick start

```bash
cp .env.example .env
# editare .env: POSTGRES_PASSWORD, GEMINI_API_KEY
docker compose up -d postgres
docker compose up -d wiki
# completare il setup di Wiki.js da http://localhost (admin locale)
# generare un API token: Administration → API Access
# riportare il token in .env come WIKIJS_TOKEN
docker compose up -d ingestion agent caddy
```

## Ingestion

- **Batch**: copiare file in `./inbox/`, l'ingestion-worker li processa
  automaticamente e crea pagine draft sotto `/normative/<area>/<codice>`.
- **Upload UI**: `POST /api/ingestion/ingest` (multipart) — pulsante da
  esporre nel layout admin di Wiki.js.

OCR automatico: i PDF con bassa densità di testo (< 100 char/pagina) sono
processati con `ocrmypdf` + Tesseract italiano.

## Agente admin

Endpoint protetti dal gruppo `admins` (header `X-User` iniettato dal
proxy):

- `POST /api/agent/chat` — chat conversazionale con tool-use Gemini
- `GET  /api/agent/proposals` — lista proposte
- `POST /api/agent/proposals/:id/approve` — applica la proposta
- `POST /api/agent/proposals/:id/reject` — scarta la proposta

L'agente non scrive mai direttamente: ogni modifica è una proposta in
`sni.agent_proposals` da approvare.

## Permessi

Gruppi Wiki.js da configurare manualmente al primo avvio:

| Gruppo | Capability |
|---|---|
| `viewers` | read su `/normative/**` e `/glossario/**` |
| `editor-<area>` | read globale + write sul path della propria area |
| `editors-global` | read + write su `/normative/**` |
| `admins` | manage globale + accesso `/api/agent/*` |

## Schema dati

Vedi [`infra/postgres/init.sql`](infra/postgres/init.sql).

- `sni.document_metadata` — metadati strutturati per pagina
- `sni.page_embeddings` — vettori per ricerca semantica (pgvector)
- `sni.ingestion_jobs` — coda job di ingestion
- `sni.agent_proposals` — proposte di modifica dell'agente

## Sviluppo

Vedi [`docs/operations.md`](docs/operations.md) per il runbook operativo.
