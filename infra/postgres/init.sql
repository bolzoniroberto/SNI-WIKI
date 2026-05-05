-- Init script: runs once on first Postgres boot.
-- Enables pgvector and creates the `sni` schema used by ingestion-worker
-- and agent-service. Wiki.js will create its own tables in `public`
-- on first launch.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS sni;

CREATE TABLE IF NOT EXISTS sni.document_metadata (
    page_id           INTEGER PRIMARY KEY,
    codice            TEXT UNIQUE NOT NULL,
    versione          TEXT NOT NULL,
    data_approvazione DATE,
    redattore         TEXT,
    approvatore       TEXT,
    impattati         TEXT[] DEFAULT '{}',
    ambito            TEXT,
    area              TEXT,
    processo          TEXT,
    riferimenti_ext   JSONB DEFAULT '[]'::jsonb,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_metadata_area ON sni.document_metadata (area);
CREATE INDEX IF NOT EXISTS idx_document_metadata_ambito ON sni.document_metadata (ambito);

CREATE TABLE IF NOT EXISTS sni.page_embeddings (
    page_id   INTEGER NOT NULL,
    chunk_idx INTEGER NOT NULL,
    embedding vector(768),
    content   TEXT NOT NULL,
    PRIMARY KEY (page_id, chunk_idx)
);

CREATE INDEX IF NOT EXISTS idx_page_embeddings_vec
    ON sni.page_embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

CREATE TABLE IF NOT EXISTS sni.ingestion_jobs (
    id          SERIAL PRIMARY KEY,
    source_path TEXT NOT NULL,
    source_hash TEXT,
    status      TEXT NOT NULL DEFAULT 'queued',
    page_id     INTEGER,
    error       TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status ON sni.ingestion_jobs (status);

CREATE TABLE IF NOT EXISTS sni.agent_proposals (
    id          SERIAL PRIMARY KEY,
    admin_user  TEXT NOT NULL,
    request     TEXT NOT NULL,
    diff        JSONB NOT NULL,           -- [{page_id, before, after}, ...]
    status      TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|rejected|applied
    created_at  TIMESTAMPTZ DEFAULT now(),
    decided_at  TIMESTAMPTZ
);
