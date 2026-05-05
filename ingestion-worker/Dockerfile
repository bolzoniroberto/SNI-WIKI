FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# OCR + PDF stack: Tesseract (italian), Ghostscript, pandoc, poppler
RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-ita \
        tesseract-ocr-eng \
        ghostscript \
        poppler-utils \
        pandoc \
        libreoffice-core \
        libreoffice-writer \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir \
        "fastapi>=0.110" \
        "uvicorn[standard]>=0.29" \
        "psycopg[binary,pool]>=3.1" \
        "httpx>=0.27" \
        "pdfplumber>=0.11" \
        "ocrmypdf>=16" \
        "mammoth>=1.7" \
        "python-multipart>=0.0.9" \
        "watchfiles>=0.21" \
        "google-genai>=0.3" \
        "pydantic>=2" \
        "pydantic-settings>=2"

COPY src ./src
COPY prompts ./prompts

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
