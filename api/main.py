"""Startup Compass REST API (FastAPI).

Run:  uvicorn api.main:app --reload --port 8000
Docs: http://localhost:8000/docs

All data is SYNTHETIC. Outputs are decision-support probabilities, never guarantees.
"""

from __future__ import annotations

import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api import service  # noqa: E402
from src import insights, predict as predict_mod  # noqa: E402
from src.data_generation import generate  # noqa: E402
from src.train_model import DATA_PATH, TARGET, train_and_evaluate  # noqa: E402

app = FastAPI(
    title="Startup Compass API",
    version="1.0.0",
    description="24-month startup failure-risk model on SYNTHETIC data. Decision support, not a guarantee.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)
_train_lock = threading.Lock()


class StartupIn(BaseModel):
    startup: dict[str, Any] = Field(..., description="Raw startup fields; money in INR lakh. Optional 'arpu'.")


class SimulateIn(StartupIn):
    levers: dict[str, float] = Field(default_factory=dict, description="burn_pct, churn_pct, cac_pct, growth_pts, price_pct")
    action_plan: bool = False


class BatchIn(BaseModel):
    rows: list[dict[str, Any]]


class TrainIn(BaseModel):
    source: str = Field("synthetic", pattern="^(synthetic|rows)$")
    n: int = Field(6000, ge=1000, le=50000)
    seed: int = 42
    rows: list[dict[str, Any]] | None = None


@app.exception_handler(service.InputError)
async def _input_error(_: Request, exc: service.InputError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": "Invalid input", "errors": exc.errors})


@app.exception_handler(RequestValidationError)
async def _request_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    errors = [f"{'.'.join(str(p) for p in e['loc'][1:])}: {e['msg']}" for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": "Invalid request", "errors": errors})


@app.get("/health")
def health() -> dict[str, Any]:
    art = predict_mod.load_artifact()
    return {"status": "ok", "model": art["model_name"], "synthetic": True}


@app.post("/predict")
def predict(body: StartupIn) -> dict[str, Any]:
    return service.predict(body.startup)


@app.post("/explain")
def explain(body: StartupIn) -> dict[str, Any]:
    return service.explain(body.startup)


@app.post("/simulate")
def simulate(body: SimulateIn) -> dict[str, Any]:
    return service.simulate(body.startup, body.levers, body.action_plan)


@app.post("/benchmark")
def benchmark(body: StartupIn) -> dict[str, Any]:
    return service.benchmark(body.startup)


@app.post("/batch-score")
def batch_score(body: BatchIn) -> dict[str, Any]:
    if len(body.rows) > 20000:
        raise HTTPException(413, "At most 20,000 rows per request.")
    return service.batch_score(body.rows)


@app.get("/model-lab")
def model_lab() -> dict[str, Any]:
    return service.model_lab()


@app.get("/fallback-model")
def fallback_model() -> dict[str, Any]:
    return service.model_lab()["fallback_model"]


@app.get("/dataset")
def dataset(limit: int = 300, seed: int = 7) -> dict[str, Any]:
    """A sample of the bundled SYNTHETIC dataset (generated labels removed)."""
    data = pd.read_csv(DATA_PATH)
    sample = data.sample(min(limit, len(data)), random_state=seed).drop(columns=[TARGET])
    records = sample.astype(object).where(sample.notna(), None).to_dict(orient="records")
    return {"rows": records, "synthetic": True, "total_rows": int(len(data))}


@app.post("/train")
def train(body: TrainIn) -> dict[str, Any]:
    """Regenerate SYNTHETIC data and retrain, or retrain on supplied labelled rows."""
    if not _train_lock.acquire(blocking=False):
        raise HTTPException(409, "Training is already running.")
    try:
        started = time.perf_counter()
        if body.source == "rows":
            if not body.rows:
                raise HTTPException(422, "source='rows' requires labelled rows.")
            frame = pd.DataFrame(body.rows)
            if TARGET not in frame.columns or frame[TARGET].nunique() != 2:
                raise HTTPException(422, f"Rows need a binary '{TARGET}' column with both classes.")
            with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8") as fh:
                frame.to_csv(fh, index=False)
                path = Path(fh.name)
        else:
            generate(n=body.n, seed=body.seed).to_csv(DATA_PATH, index=False)
            path = DATA_PATH
        try:
            metrics, _, test = train_and_evaluate(path, seed=body.seed)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        predict_mod.load_artifact.cache_clear()
        insights.load_metrics.cache_clear()
        return {
            "selected_model": metrics["selection"]["selected_model"],
            "explanation": metrics["selection"]["explanation"],
            "test_metrics": metrics["test_metrics"],
            "rows": metrics["dataset"]["rows"],
            "seconds": round(time.perf_counter() - started, 1),
            "synthetic": body.source == "synthetic",
        }
    finally:
        _train_lock.release()
