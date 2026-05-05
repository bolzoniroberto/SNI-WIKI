"""PDF -> markdown.

Strategy:
  1. Try text extraction with pdfplumber.
  2. If average extracted text per page is below the threshold, the PDF is
     likely a scan: run ocrmypdf to add a text layer, then re-extract.
"""
from __future__ import annotations

import logging
import subprocess
import tempfile
from pathlib import Path

import pdfplumber

from ..config import settings

log = logging.getLogger(__name__)


def _extract_text(path: Path) -> tuple[str, int]:
    """Return (markdown, total_chars)."""
    parts: list[str] = []
    total_chars = 0
    with pdfplumber.open(path) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            txt = page.extract_text() or ""
            total_chars += len(txt)
            parts.append(f"\n\n<!-- page {i} -->\n\n{txt.strip()}")
    return ("\n".join(parts).strip(), total_chars)


def _ocr(src: Path) -> Path:
    """Run ocrmypdf and return path to the OCR'd PDF in a temp file."""
    out = Path(tempfile.mkstemp(suffix=".pdf")[1])
    cmd = [
        "ocrmypdf",
        "--language", settings.ocr_lang,
        "--skip-text",
        "--output-type", "pdf",
        str(src),
        str(out),
    ]
    log.info("running OCR: %s", " ".join(cmd))
    subprocess.run(cmd, check=True, capture_output=True)
    return out


def pdf_to_markdown(path: Path) -> str:
    md, chars = _extract_text(path)
    # crude: if very little text relative to pages, treat as scanned
    with pdfplumber.open(path) as pdf:
        pages = len(pdf.pages)
    if pages == 0:
        return md
    avg = chars / pages
    if avg >= settings.ocr_text_threshold_chars:
        return md

    log.info("low text density (%.0f chars/page); applying OCR", avg)
    if settings.glm_ocr_enabled:
        from .glm_ocr import glm_ocr_pdf
        return glm_ocr_pdf(path)
    ocr_pdf = _ocr(path)
    try:
        md_ocr, _ = _extract_text(ocr_pdf)
        return md_ocr
    finally:
        ocr_pdf.unlink(missing_ok=True)
