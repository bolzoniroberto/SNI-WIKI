"""Post-processing: turn cited document codes into wiki-style links."""
from __future__ import annotations

import re

CODE_PATTERN = re.compile(r"\b([A-Z]{2,5}(?:-[A-Z]{2,5})?-\d{2,4})\b")


def linkify_codes(markdown: str, known_codes: set[str]) -> str:
    """Wrap any occurrence of a known code with a markdown link to /normative/<code>."""
    def repl(match: re.Match[str]) -> str:
        code = match.group(1)
        if code in known_codes:
            return f"[{code}](/normative/{code.lower()})"
        return code
    return CODE_PATTERN.sub(repl, markdown)
