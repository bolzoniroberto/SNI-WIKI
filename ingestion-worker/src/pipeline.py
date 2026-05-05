"""End-to-end ingestion pipeline.

Steps:
  1. Convert PDF/DOC -> markdown (with OCR fallback for scanned PDFs).
  2. Extract metadata via Gemini (or stub).
  3. Build path /normative/<area>/<codice> and create draft page on Wiki.js.
  4. Persist structured metadata to sni.document_metadata.
"""
from __future__ import annotations

import logging
import re
from pathlib import Path

from .converters import convert
from .db import conn
from .extract import DocumentMetadata, extract_metadata
from .wikijs import WikiJSClient

log = logging.getLogger(__name__)


def _slug(value: str) -> str:
    s = value.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "documento"


def _build_path(meta: DocumentMetadata) -> str:
    area = _slug(meta.area or meta.ambito or "generale")
    code = _slug(meta.codice)
    return f"normative/{area}/{code}"


def _frontmatter(meta: DocumentMetadata) -> str:
    lines = ["---"]
    lines.append(f"codice: {meta.codice}")
    lines.append(f"versione: {meta.versione}")
    if meta.data_approvazione:
        lines.append(f"data_approvazione: {meta.data_approvazione}")
    if meta.redattore:
        lines.append(f"redattore: {meta.redattore}")
    if meta.approvatore:
        lines.append(f"approvatore: {meta.approvatore}")
    if meta.ambito:
        lines.append(f"ambito: {meta.ambito}")
    if meta.area:
        lines.append(f"area: {meta.area}")
    if meta.processo:
        lines.append(f"processo: {meta.processo}")
    lines.append("---\n")
    return "\n".join(lines)


def _persist_metadata(page_id: int, meta: DocumentMetadata) -> None:
    with conn() as c, c.cursor() as cur:
        cur.execute(
            """
            INSERT INTO sni.document_metadata
              (page_id, codice, versione, data_approvazione, redattore,
               approvatore, impattati, ambito, area, processo, riferimenti_ext)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (page_id) DO UPDATE SET
              codice = EXCLUDED.codice,
              versione = EXCLUDED.versione,
              data_approvazione = EXCLUDED.data_approvazione,
              redattore = EXCLUDED.redattore,
              approvatore = EXCLUDED.approvatore,
              impattati = EXCLUDED.impattati,
              ambito = EXCLUDED.ambito,
              area = EXCLUDED.area,
              processo = EXCLUDED.processo,
              riferimenti_ext = EXCLUDED.riferimenti_ext,
              updated_at = now()
            """,
            (
                page_id,
                meta.codice,
                meta.versione,
                meta.data_approvazione,
                meta.redattore,
                meta.approvatore,
                meta.impattati,
                meta.ambito,
                meta.area,
                meta.processo,
                _json_dumps([r.model_dump() for r in meta.riferimenti_esterni]),
            ),
        )


def _json_dumps(value: object) -> str:
    import json
    return json.dumps(value, ensure_ascii=False)


def ingest_file(path: Path) -> int:
    """Run the full pipeline for one file. Returns the Wiki.js page id."""
    log.info("ingesting %s", path)
    markdown = convert(path)
    meta = extract_metadata(markdown, path.name)

    body = _frontmatter(meta) + markdown
    wiki_path = _build_path(meta)
    title = meta.codice + " — " + Path(path).stem

    tags = [t for t in [meta.ambito, meta.area, meta.processo] if t]

    client = WikiJSClient()
    try:
        page_id = client.create_page(
            path=wiki_path,
            title=title,
            content=body,
            description=meta.codice,
            tags=tags,
            published=False,
        )
    finally:
        client.close()

    _persist_metadata(page_id, meta)
    log.info("page %d created at /%s", page_id, wiki_path)
    return page_id
