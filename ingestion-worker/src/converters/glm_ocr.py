"""PDF/image OCR via GLM-OCR model served by Ollama."""
from __future__ import annotations

import base64
import logging
import subprocess
import tempfile
from pathlib import Path

import httpx

from ..config import settings

log = logging.getLogger(__name__)

_PROMPT = (
    "This is a page from an Italian corporate document. "
    "Transcribe ALL text exactly as it appears, in reading order (left to right, top to bottom). "
    "Preserve paragraph breaks. "
    "For tables, use markdown table format. "
    "For lists, use markdown list format. "
    "Do NOT add explanations, summaries, or comments. Output only the transcribed text."
)


def _pdf_to_images(path: Path, dpi: int = 150) -> list[bytes]:
    with tempfile.TemporaryDirectory() as tmp:
        prefix = Path(tmp) / "page"
        subprocess.run(
            ["pdftoppm", "-r", str(dpi), "-png", str(path), str(prefix)],
            check=True,
            capture_output=True,
        )
        return [p.read_bytes() for p in sorted(Path(tmp).glob("page-*.png"))]


def _ocr_image_bytes(image_bytes: bytes) -> str:
    b64 = base64.b64encode(image_bytes).decode()
    resp = httpx.post(
        f"{settings.glm_ocr_url}/api/chat",
        json={
            "model": settings.glm_ocr_model,
            "messages": [{"role": "user", "content": _PROMPT, "images": [b64]}],
            "stream": False,
        },
        timeout=300.0,
    )
    resp.raise_for_status()
    return resp.json()["message"]["content"].strip()


def _clean_page(text: str) -> str:
    """Clean a single OCR-extracted page via Gemma4 on Ollama."""
    from ..clean import _clean_chunk
    from ..config import settings as _s
    if not _s.clean_enabled:
        return text
    log.info("CLEAN: page (%d chars) via %s", len(text), _s.clean_model)
    cleaned = _clean_chunk(text, _s.clean_model_url, _s.clean_model)
    log.info("CLEAN done: %d chars → %d chars", len(text), len(cleaned))
    return cleaned


def glm_ocr_pdf(path: Path) -> str:
    log.info("GLM-OCR: %s", path.name)
    images = _pdf_to_images(path)
    log.info("GLM-OCR: %d pages", len(images))
    parts = []
    for i, img in enumerate(images, start=1):
        log.info("GLM-OCR: page %d/%d", i, len(images))
        raw_page = _ocr_image_bytes(img)
        cleaned = _clean_page(raw_page)
        parts.append(f"\n\n<!-- page {i} -->\n\n{cleaned}")
    return "\n".join(parts).strip()


def glm_ocr_image(path: Path) -> str:
    return _clean_page(_ocr_image_bytes(path.read_bytes()))
