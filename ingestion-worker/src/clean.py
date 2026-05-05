"""CLEAN phase: post-OCR markdown cleanup via Gemini Flash.

Takes raw text (from pdfplumber or GLM-OCR) and returns clean markdown
ready for metadata extraction and Wiki.js publication.
Skipped if Gemini is not configured (returns raw text unchanged).
"""
from __future__ import annotations

import logging

from .config import settings

log = logging.getLogger(__name__)

_SYSTEM = """\
Sei un sistema di pulizia per documenti normativi aziendali italiani estratti via OCR.
Ricevi testo grezzo e restituisci markdown pulito seguendo QUESTE REGOLE:

ELIMINA:
- Intestazioni e piè di pagina ripetitivi (nome documento, numero pagina, data, logo testuale, disclaimer boilerplate)
- Artefatti OCR (|||, ___, blocchi di simboli, caratteri spuri)
- Marcatori di pagina grezzi (--- pagina 3 ---, [p.3], ecc.) se non indicano sezioni reali

CORREGGI:
- Errori OCR classici: lettere scambiate (l/1, O/0, rn/m), parole spezzate da a-capo nel mezzo di frase
- Righe spezzate artificialmente dall'impaginazione: uniscile in un unico paragrafo
- Mantieni le interruzioni di paragrafo reali (doppio a-capo)

STRUTTURA MARKDOWN:
- Titoli e sezioni → heading (#, ##, ###)
- Dati tabulari → tabelle Markdown
- Elenchi → liste puntate o numerate
- Note a piè di pagina con contenuto non ridondante → sezione ## Note in fondo

OUTPUT: solo il markdown pulito. Nessun commento, nessuna spiegazione, nessun frontmatter.\
"""


def clean_markdown(raw: str, filename: str) -> str:
    """Clean raw OCR text with Gemini Flash. Returns raw unchanged if Gemini not configured."""
    if not settings.gemini_enabled:
        return raw

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.gemini_api_key)
    log.info("CLEAN: %s (%d chars)", filename, len(raw))

    response = client.models.generate_content(
        model=settings.gemini_model,  # flash — fast + cheap for text cleanup
        contents=f"{_SYSTEM}\n\n---\n\n{raw[:80_000]}",
        config=types.GenerateContentConfig(temperature=0.1),
    )
    cleaned = response.text.strip()
    log.info("CLEAN: %s → %d chars (was %d)", filename, len(cleaned), len(raw))
    return cleaned
