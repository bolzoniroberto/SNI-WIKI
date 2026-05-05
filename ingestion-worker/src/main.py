"""FastAPI entrypoint for ingestion-worker.

Endpoints:
  POST /ingest          - upload a single file (multipart)
  GET  /jobs            - list ingestion jobs
  GET  /jobs/{id}       - job detail
  GET  /healthz

Also runs a background watcher on settings.inbox_dir.
"""
from __future__ import annotations

import asyncio
import contextlib
import hashlib
import logging
import shutil
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException, UploadFile
from watchfiles import awatch

from . import db
from .config import settings
from .pipeline import ingest_file

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s :: %(message)s")
log = logging.getLogger("ingestion")


def _file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _create_job(source_path: str, source_hash: str | None) -> int:
    with db.conn() as c, c.cursor() as cur:
        cur.execute(
            """INSERT INTO sni.ingestion_jobs (source_path, source_hash, status)
               VALUES (%s, %s, 'queued') RETURNING id""",
            (source_path, source_hash),
        )
        row = cur.fetchone()
        return row[0]


def _update_job(
    job_id: int, *, status: str, page_id: int | None = None, error: str | None = None
) -> None:
    with db.conn() as c, c.cursor() as cur:
        cur.execute(
            """UPDATE sni.ingestion_jobs
               SET status=%s, page_id=%s, error=%s, updated_at=now()
               WHERE id=%s""",
            (status, page_id, error, job_id),
        )


def _process(job_id: int, path: Path) -> None:
    _update_job(job_id, status="running")
    try:
        page_id = ingest_file(path)
        _update_job(job_id, status="done", page_id=page_id)
    except Exception as exc:  # noqa: BLE001
        log.exception("job %d failed", job_id)
        _update_job(job_id, status="error", error=str(exc))


async def _watch_inbox() -> None:
    inbox = settings.inbox_dir
    inbox.mkdir(parents=True, exist_ok=True)
    log.info("watching inbox %s", inbox)
    seen: set[str] = set()
    # initial sweep
    for f in inbox.iterdir():
        if f.is_file() and f.suffix.lower() in {".pdf", ".doc", ".docx"}:
            digest = _file_hash(f)
            if digest in seen:
                continue
            seen.add(digest)
            job_id = _create_job(str(f), digest)
            asyncio.get_running_loop().run_in_executor(None, _process, job_id, f)
    async for changes in awatch(str(inbox)):
        for _change, fpath in changes:
            p = Path(fpath)
            if not p.exists() or not p.is_file():
                continue
            if p.suffix.lower() not in {".pdf", ".doc", ".docx"}:
                continue
            digest = _file_hash(p)
            if digest in seen:
                continue
            seen.add(digest)
            job_id = _create_job(str(p), digest)
            asyncio.get_running_loop().run_in_executor(None, _process, job_id, p)


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()
    task = asyncio.create_task(_watch_inbox())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        db.close()


app = FastAPI(title="SNI Ingestion Worker", lifespan=lifespan)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/ingest")
async def ingest(file: UploadFile, background: BackgroundTasks) -> dict[str, int | str]:
    if not file.filename:
        raise HTTPException(400, "missing filename")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".tiff", ".tif"}:
        raise HTTPException(415, f"unsupported file type: {suffix}")

    target = settings.inbox_dir / file.filename
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    job_id = _create_job(str(target), _file_hash(target))
    background.add_task(_process, job_id, target)
    return {"job_id": job_id, "status": "queued", "path": str(target)}


@app.get("/jobs")
def list_jobs(limit: int = 50) -> list[dict]:
    with db.conn() as c, c.cursor() as cur:
        cur.execute(
            """SELECT id, source_path, status, page_id, error, created_at, updated_at
               FROM sni.ingestion_jobs ORDER BY id DESC LIMIT %s""",
            (limit,),
        )
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


@app.get("/jobs/{job_id}")
def get_job(job_id: int) -> dict:
    with db.conn() as c, c.cursor() as cur:
        cur.execute(
            """SELECT id, source_path, status, page_id, error, created_at, updated_at
               FROM sni.ingestion_jobs WHERE id=%s""",
            (job_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "job not found")
        cols = [d[0] for d in cur.description]
        return dict(zip(cols, row))
