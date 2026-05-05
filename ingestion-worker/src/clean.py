"""CLEAN phase: post-OCR markdown cleanup via Gemma4 on Ollama.

Processes text chunk by chunk (page by page) to prevent the model from
summarizing instead of cleaning. Each chunk is cleaned independently.
Skipped if CLEAN_MODEL_URL is not configured.
"""
from __future__ import annotations

import logging
import re

import httpx

from .config import settings

log = logging.getLogger(__name__)

_SYSTEM = """\
Sei un editor OCR. Ricevi il testo grezzo di UNA PAGINA di documento aziendale italiano estratto via OCR.
Restituisci la stessa pagina pulita. NON riassumere, NON accorciare: l'output deve contenere
tutto il contenuto informativo dell'input.

APPLICA SOLO QUESTE CORREZIONI:

1. RIMUOVI intestazioni/piè di pagina ripetitivi dell'impaginazione (numeri pagina, nome documento ripetuto, disclaimer boilerplate)
2. RIUNISCI parole spezzate da a-capo di fine riga (es: "infor-\nmatica" → "informatica")
3. CORREGGI errori OCR evidenti (l→1, O→0, rn→m) — se incerto lascia com'è con [?]
4. CONVERTI testo tabulare allineato con spazi in tabelle Markdown
5. CONVERTI elenchi scritti come testo in liste Markdown (- o 1. 2. 3.)
6. UNISCI paragrafi spezzati artificialmente (frase senza punto finale → continua nel paragrafo successivo)
7. USA # ## ### per i titoli in base alla gerarchia visiva

NON aggiungere informazioni. NON riassumere. NON omettere contenuto reale.
Restituisci SOLO il markdown pulito della pagina.\
"""


def _clean_chunk(text: str, model_url: str, model: str) -> str:
    resp = httpx.post(
        f"{model_url}/api/chat",
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": text},
            ],
            "stream": False,
        },
        timeout=300.0,
    )
    resp.raise_for_status()
    return resp.json()["message"]["content"].strip()


def clean_markdown(raw: str, filename: str) -> str:
    """Clean raw OCR text page by page. Returns raw unchanged if not configured."""
    if not settings.clean_enabled:
        return raw

    url = settings.clean_model_url
    model = settings.clean_model

    # Split on page markers inserted by _extract_text / glm_ocr
    page_pattern = re.compile(r"(<!-- page \d+ -->)", re.MULTILINE)
    parts = page_pattern.split(raw)

    # parts alternates: [pre, marker, content, marker, content, ...]
    # Rebuild as list of (marker, content) pairs
    chunks: list[tuple[str, str]] = []
    i = 0
    preamble = parts[0].strip()
    if preamble:
        chunks.append(("", preamble))
    i = 1
    while i < len(parts) - 1:
        marker = parts[i]
        content = parts[i + 1].strip()
        chunks.append((marker, content))
        i += 2

    if not chunks:
        # No page markers — treat whole document as one chunk
        chunks = [("", raw)]

    log.info("CLEAN: %s — %d chunks via %s", filename, len(chunks), model)
    cleaned_parts: list[str] = []
    for idx, (marker, content) in enumerate(chunks, start=1):
        if not content:
            continue
        log.info("CLEAN: chunk %d/%d (%d chars)", idx, len(chunks), len(content))
        cleaned = _clean_chunk(content, url, model)
        if marker:
            cleaned_parts.append(f"{marker}\n\n{cleaned}")
        else:
            cleaned_parts.append(cleaned)

    result = "\n\n".join(cleaned_parts)
    log.info("CLEAN done: %s → %d chars (was %d)", filename, len(result), len(raw))
    return result
