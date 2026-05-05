"""Metadata + cross-reference extraction via Gemini.

Uses google-genai SDK with a JSON-schema-constrained response to obtain a
strict object matching DocumentMetadata. If the API key is not configured,
returns an empty stub so the pipeline still works in MVP mode.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from pydantic import BaseModel, Field

from .config import settings

log = logging.getLogger(__name__)

PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "extract_metadata.md"


class RiferimentoEsterno(BaseModel):
    tipo: str  # "ISO", "GDPR", "Legge", ...
    identificativo: str
    descrizione: str | None = None


class DocumentMetadata(BaseModel):
    codice: str = Field(description="Codice univoco della procedura")
    titolo: str
    versione: str = "1.0"
    data_approvazione: str | None = None  # ISO date
    redattore: str | None = None
    approvatore: str | None = None
    impattati: list[str] = Field(default_factory=list)
    ambito: str | None = None
    area: str | None = None
    processo: str | None = None
    riferimenti_esterni: list[RiferimentoEsterno] = Field(default_factory=list)
    cross_references: list[str] = Field(
        default_factory=list,
        description="Codici di altre procedure citate nel documento",
    )
    glossario: list[str] = Field(
        default_factory=list,
        description="Termini tecnici da promuovere a voce di glossario",
    )


def _stub_metadata(filename: str) -> DocumentMetadata:
    return DocumentMetadata(
        codice=Path(filename).stem.upper().replace(" ", "-"),
        titolo=Path(filename).stem,
    )


def extract_metadata(markdown: str, filename: str) -> DocumentMetadata:
    """Extract structured metadata from markdown content. Returns a stub if
    Gemini is not configured (useful for MVP testing)."""
    if not settings.gemini_enabled:
        log.warning("Gemini not configured; returning stub metadata for %s", filename)
        return _stub_metadata(filename)

    # Imported lazily so the module is importable without the SDK present
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.gemini_api_key)
    prompt_template = PROMPT_PATH.read_text(encoding="utf-8")
    prompt = prompt_template.replace("{{FILENAME}}", filename).replace(
        "{{CONTENT}}", markdown[:60_000]
    )

    response = client.models.generate_content(
        model=settings.gemini_model_heavy,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=DocumentMetadata,
            temperature=0.1,
        ),
    )
    try:
        data = json.loads(response.text)
        return DocumentMetadata.model_validate(data)
    except Exception as exc:  # noqa: BLE001
        log.exception("metadata extraction failed for %s: %s", filename, exc)
        return _stub_metadata(filename)
