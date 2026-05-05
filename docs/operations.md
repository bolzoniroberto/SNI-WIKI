# Operations runbook

## Primo avvio

1. `cp .env.example .env` e impostare almeno `POSTGRES_PASSWORD`.
2. `docker compose up -d postgres wiki`
3. Aprire Wiki.js e completare il wizard:
   - creare l'amministratore locale;
   - lingua di default `it`;
   - storage: il modulo Postgres è già configurato.
4. **Administration → API Access**: generare un token con permessi
   `manage:pages`. Salvarlo come `WIKIJS_TOKEN` nel file `.env`.
5. **Administration → Groups**: creare i gruppi `viewers`, `editors-global`,
   `admins` e gli `editor-<area>` necessari. Configurare le regole di path
   come da README.
6. `docker compose up -d ingestion agent caddy` per avviare i sidecar.

## Configurazione Gemini

Impostare `GEMINI_API_KEY` in `.env`. Senza chiave, l'ingestion-worker
funziona comunque ma usa metadati stub (codice = nome file).

Modelli usati:
- `gemini-2.5-flash` — search/embedding leggeri
- `gemini-2.5-pro` — estrazione metadati e agent admin
- `text-embedding-004` — embeddings per ricerca semantica

## Ingestion massiva

```bash
cp /path/to/procedures/*.pdf ./inbox/
docker compose logs -f ingestion
# monitorare lo stato:
curl -s http://localhost/api/ingestion/jobs | jq
```

I documenti sono creati come **draft** (non pubblicati). Un editor li
revisiona e li pubblica dal Wiki.js.

## Backup

Backup giornaliero raccomandato:

```bash
docker compose exec postgres pg_dump -U wiki wiki > backup-$(date +%F).sql
docker run --rm -v sni-wiki_wiki-data:/data -v $(pwd):/out alpine \
  tar czf /out/wiki-data-$(date +%F).tar.gz -C /data .
```

## Troubleshooting

- **OCR lento**: ridurre il DPI di Tesseract o disabilitare l'escalation a
  Gemini multimodale.
- **GraphQL `unauthorized`**: rigenerare `WIKIJS_TOKEN` dall'admin UI.
- **`pgvector` non trovato**: verificare di usare l'immagine
  `pgvector/pgvector:pg16` (non `postgres:16`).

## Aggiornamenti

```bash
docker compose pull
docker compose up -d
```

Wiki.js mantiene lo schema retrocompatibile fra versioni minor, ma
**fare sempre backup prima di un upgrade major**.
