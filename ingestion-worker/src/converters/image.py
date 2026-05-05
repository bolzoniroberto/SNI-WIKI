"""Standalone image (PNG/JPG/TIFF) -> markdown via Tesseract."""
from __future__ import annotations

import subprocess
from pathlib import Path

from ..config import settings


def image_to_markdown(path: Path) -> str:
    proc = subprocess.run(
        ["tesseract", str(path), "-", "-l", settings.ocr_lang],
        capture_output=True,
        text=True,
        check=True,
    )
    return proc.stdout.strip()
