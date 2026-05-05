"""DOCX/DOC -> markdown.

DOCX uses mammoth (HTML -> markdown via pandoc).
DOC (legacy binary) is converted to DOCX via libreoffice headless first.
"""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

import mammoth


def _docx_html(path: Path) -> str:
    with path.open("rb") as fh:
        result = mammoth.convert_to_html(fh)
    return result.value


def _html_to_markdown(html: str) -> str:
    proc = subprocess.run(
        ["pandoc", "--from=html", "--to=gfm", "--wrap=none"],
        input=html,
        capture_output=True,
        text=True,
        check=True,
    )
    return proc.stdout


def _doc_to_docx(path: Path) -> Path:
    out_dir = Path(tempfile.mkdtemp())
    subprocess.run(
        ["libreoffice", "--headless", "--convert-to", "docx",
         "--outdir", str(out_dir), str(path)],
        check=True, capture_output=True,
    )
    converted = out_dir / (path.stem + ".docx")
    if not converted.exists():
        raise RuntimeError(f"libreoffice failed to convert {path}")
    return converted


def docx_to_markdown(path: Path) -> str:
    if path.suffix.lower() == ".doc":
        path = _doc_to_docx(path)
    return _html_to_markdown(_docx_html(path)).strip()
