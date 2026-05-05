from pathlib import Path

from .docx import docx_to_markdown
from .pdf import pdf_to_markdown


def convert(path: Path) -> str:
    """Dispatch on file extension. Returns markdown text."""
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return pdf_to_markdown(path)
    if suffix in {".docx", ".doc"}:
        return docx_to_markdown(path)
    if suffix in {".png", ".jpg", ".jpeg", ".tiff", ".tif"}:
        from .image import image_to_markdown
        return image_to_markdown(path)
    raise ValueError(f"Unsupported file type: {suffix}")
