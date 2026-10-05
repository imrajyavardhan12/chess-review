"""HTTP API for the web UI. Reviews run in a background thread and are cached on disk."""
import hashlib
import json
import os
import re
import shutil
import threading
from dataclasses import asdict
from pathlib import Path

import requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel

from . import chesscom
from .analysis import review_game

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "cache"
WEB_DIST = ROOT / "web" / "dist"
DEPTH, NODES = 16, 1_500_000
ANALYSIS_VERSION = 2  # bump when the review format changes so old cache entries are ignored
ENGINE = os.environ.get("CHESSREVIEW_ENGINE") or shutil.which("stockfish") or "stockfish"

app = FastAPI(title="chessreview")
# Local tool: only answer requests addressed to loopback names, which blocks DNS-rebinding
# attacks where a web page tricks the browser into talking to this server under another hostname.
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "[::1]"])
jobs: dict[str, dict] = {}
engine_lock = threading.Lock()  # Stockfish already uses several threads; run one review at a time


def review_id(pgn: str) -> str:
    return hashlib.sha1(f"{pgn}|{DEPTH}|{NODES}|v{ANALYSIS_VERSION}".encode()).hexdigest()[:16]


def cache_path(rid: str) -> Path:
    if not re.fullmatch(r"[0-9a-f]{16}", rid):  # ids are hash prefixes; never build paths from other input
        raise HTTPException(404, "Review not found.")
    return CACHE / f"{rid}.json"


def summary_of(rid: str) -> dict | None:
    """Accuracy and a downsampled win% trace for a cached review, for the game list."""
    path = cache_path(rid)
    if not path.exists():
        return None
    r = json.loads(path.read_text())
    ws = r["win_series"]
    step = max(1, len(ws) // 40)
    spark = ws[::step]
    if (len(ws) - 1) % step:
        spark.append(ws[-1])
    return {"accuracy": r["accuracy"], "spark": spark}


class ReviewRequest(BaseModel):
    pgn: str


def run_job(rid: str, pgn: str) -> None:
    job = jobs[rid]

    def progress(done: int, total: int) -> None:
        job.update(status="running", done=done, total=total)

    try:
        with engine_lock:
            review = review_game(pgn, ENGINE, DEPTH, NODES, progress=progress)
        CACHE.mkdir(exist_ok=True)
        cache_path(rid).write_text(json.dumps(review.to_dict()))
        job["status"] = "done"
    except Exception as e:  # surfaced to the UI instead of dying silently in the thread
        job.update(status="error", error=str(e) or type(e).__name__)


@app.post("/api/reviews")
def start_review(req: ReviewRequest) -> dict:
    rid = review_id(req.pgn)
    if cache_path(rid).exists():
        return {"id": rid, "status": "done"}
    if jobs.get(rid, {}).get("status") in ("queued", "running"):
        return {"id": rid, "status": jobs[rid]["status"]}
    if "1." not in req.pgn:
        raise HTTPException(422, "That doesn't look like a PGN. It needs a move list.")
    jobs[rid] = {"status": "queued", "done": 0, "total": 0}
    threading.Thread(target=run_job, args=(rid, req.pgn), daemon=True).start()
    return {"id": rid, "status": "queued"}


@app.get("/api/reviews/{rid}")
def get_review(rid: str) -> dict:
    path = cache_path(rid)
    if path.exists():
        return {"status": "done", "review": json.loads(path.read_text())}
    if rid in jobs:
        return jobs[rid]
    raise HTTPException(404, "Review not found. Open the game again from the list.")


@app.get("/api/chesscom/{user}")
def chesscom_games(user: str, month: str | None = None) -> dict:
    try:
        archives = chesscom.list_archives(user)
        months = [a.split("/games/")[1] for a in reversed(archives)][:24]
        month = month or (months[0] if months else None)
        games = chesscom.fetch_month(user, month) if month else []
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            raise HTTPException(404, f"chess.com has no player named “{user}”.")
        raise HTTPException(502, "chess.com isn't responding. Try again in a moment.")
    except requests.RequestException:
        raise HTTPException(502, "Couldn't reach chess.com. Check your connection.")
    out = []
    for g in games[:100]:
        rid = review_id(g.pgn)
        summary = summary_of(rid)
        out.append({**asdict(g), "id": rid, "reviewed": summary is not None, "summary": summary})
    return {"month": month, "months": months, "games": out}


if WEB_DIST.exists():
    app.mount("/assets", StaticFiles(directory=WEB_DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str) -> FileResponse:
        file = (WEB_DIST / path).resolve()
        inside = file.is_relative_to(WEB_DIST.resolve())  # no serving files outside the build dir
        return FileResponse(file if path and inside and file.is_file() else WEB_DIST / "index.html")
