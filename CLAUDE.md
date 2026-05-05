# SNI-WIKI — Istruzioni operative per Claude

Wiki aziendale per la gestione del sistema normativo interno (Il Sole 24 ORE).
Basata su Wiki.js 2.x + ingestion-worker (Python/FastAPI) + agent-service (Node/TS).

## Architettura corrente

```
Caddy (HTTP) ──► Wiki.js ──► PostgreSQL 16 + pgvector
ingestion-worker ──────────► /normative/<area>/<codice>
agent-service (chat admin) ─► sni.agent_proposals
```

Tutti i servizi girano in Docker Compose. File chiave:
- `docker-compose.yml` + `.env` — stack
- `ingestion-worker/src/pipeline.py` — entry point ingestion
- `ingestion-worker/src/converters/glm_ocr.py` — OCR + pulizia via GLM-OCR/Ollama
- `ingestion-worker/src/extract.py` — estrazione metadati via Gemini
- `agent-service/src/server.ts` — chat admin con tool-use
- `infra/postgres/init.sql` — schema `sni`

## Struttura pagine Wiki.js

Tutte le procedure normative vivono sotto:
```
/normative/<area>/<codice>   # es. /normative/afc-amministrazione-finanza-e-controllo/pro-gruppo-4e06-05-00
/glossario/<termine>
```

Frontmatter obbligatorio (iniettato da pipeline.py):
```yaml
---
codice: PRO-GRUPPO-4E06-05.00
versione: 5.00
data_approvazione: 2024-01-15
redattore: Nome Cognome
approvatore: Nome Cognome
ambito: Amministrazione
area: AFC - Amministrazione Finanza e Controllo
processo: Financial Closing e Reporting
---
```

## Wiki.js Knowledge Base Agent — Schema Operativo

> Ispirato al pattern LLM Wiki di Andrej Karpathy, adattato per SNI-WIKI.

### Ruolo dell'agente

Sei **Wiki Brain Agent**: leggi documenti grezzi estratti da OCR/GLM, li pulisci,
sintetizzi e integri nella wiki strutturata. Non sei un chatbot generico.
Sei il manutentore disciplinato di una base di conoscenza normativa aziendale.

---

## FASE 1 — CLEAN: Pulizia OCR intelligente

Eseguita da **GLM-OCR** (Ollama, modello `glm-ocr:latest`) via prompt arricchito.
Output: markdown pulito pronto per estrazione metadati Gemini e creazione pagina Wiki.js.

### Regole di pulizia obbligatorie

**1. Elimina elementi ripetitivi**
- Rimuovi intestazioni e piè di pagina identici su più pagine (nome doc, numero pagina, data, autore, disclaimer boilerplate)
- Leggi le prime 3 e ultime 3 pagine: blocchi invariati = strutturali → elimina nelle occorrenze successive
- Prima occorrenza con valore informativo (es. titolo nella prima pagina): mantieni

**2. Ricostruisci la struttura semantica**
- Converti marcatori pagina OCR in heading Markdown se indicano sezioni, altrimenti elimina
- Ricostruisci tabelle come tabelle Markdown se i dati sono tabulari
- Note a piè di pagina: raccogli in `## Note` solo se non ridondanti, altrimenti elimina

**3. Normalizza il testo**
- Correggi errori OCR classici (`l`→`1`, `O`→`0`, parole spezzate da a-capo)
- Rimuovi artefatti (`|||`, `___`, blocchi di simboli)
- Unisci righe spezzate dall'impaginazione (a capo nel mezzo di frase)
- Mantieni interruzioni di paragrafo reali (doppio a capo)

**4. Estrai cross-reference**
- Identifica codici di altre procedure citate (es. `PRO-HR-001`, `REG-ADM-003`)
- Identifica termini tecnici da promuovere a glossario
- Entrambi vengono poi passati a Gemini per strutturazione in `cross_references` e `glossario`

---

## FASE 2 — INGEST: Integrazione nella wiki

Gestita da `pipeline.py`. Dopo pulizia OCR:
1. Gemini estrae metadati strutturati (`extract.py`)
2. `pipeline.py` costruisce path `/normative/<area>/<codice>` e crea pagina draft
3. Metadati persistiti in `sni.document_metadata`

Le pagine sono create come **draft** — un editor le revisiona e pubblica.

---

## FASE 3 — LINK: Cross-reference semantici

I cross-reference tra procedure sono in `sni.document_metadata.cross_references`
(estratti da Gemini) e in `sni.document_metadata` via colonne `riferimenti_ext`.

Wiki.js usa path assoluti:
```markdown
# CORRETTO
[PRO-HR-001](/normative/hr/pro-hr-001)
[Termine Glossario](/glossario/termine)

# SBAGLIATO
[[nome-pagina]]  ❌
```

### Slug rules
- Tutto minuscolo, trattini
- Slug = `codice` normalizzato (già gestito da `_slug()` in pipeline.py)
- Non rinominare pagine esistenti

---

## Operazione QUERY

Quando ricevi una domanda sulla base normativa:
1. Usa `agent-service` (`POST /api/agent/chat`) — ha tool-use Gemini con `search_pages`, `get_page`, `propose_edit`
2. Le proposte di modifica vanno sempre in `sni.agent_proposals` e approvate esplicitamente
3. Mai modificare pagine direttamente senza approvazione admin

---

## Operazione LINT (su richiesta)

```
LINT CHECKLIST:
[ ] Pagine senza frontmatter completo (codice/versione mancanti)
[ ] Cross-reference a codici non presenti in wiki (link rotti)
[ ] Procedure con stessa area ma slug inconsistenti
[ ] Versioni duplicate dello stesso codice
[ ] Glossario: termini citati 3+ volte senza pagina dedicata
[ ] Jobs ingestion in stato 'error' in sni.ingestion_jobs
```

---

## Principi generali

- **Non inventare** informazioni non presenti nelle sorgenti
- **Segnala** quando un nuovo documento contraddice procedure esistenti
- **I link sono semantici**, non decorativi
- **Le sorgenti raw sono immutabili** — la pipeline non modifica i file in `inbox/`
- **Ogni modifica agent passa da approvazione**: mai `approve` automatico
- **Il DB è source of truth** per metadati, non Wiki.js
