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
    "Estrai il testo da questa pagina di documento aziendale italiano. "
    "Mantieni la struttura markdown (titoli, tabelle, elenchi puntati). "
    "Restituisci solo il testo estratto, senza commenti aggiuntivi."
)


def _pdf_to_images(path: Path, dpi: int = 200) -> list[bytes]:
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
        timeout=120.0,
    )
    resp.raise_for_status()
    return resp.json()["message"]["content"].strip()


def glm_ocr_pdf(path: Path) -> str:
    log.info("GLM-OCR: %s", path.name)
    images = _pdf_to_images(path)
    log.info("GLM-OCR: %d pages", len(images))
    parts = []
    for i, img in enumerate(images, start=1):
        log.info("GLM-OCR: page %d/%d", i, len(images))
        parts.append(f"\n\n<!-- page {i} -->\n\n{_ocr_image_bytes(img)}")
    return "\n".join(parts).strip()


def glm_ocr_image(path: Path) -> str:
    return _ocr_image_bytes(path.read_bytes())
