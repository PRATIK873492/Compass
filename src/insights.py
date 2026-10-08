"""Runway forecast, peer percentiles and stored model metrics."""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from src.predict import engineer, load_artifact, probabilities
from src.schema import validate_input
from src.whatif import action_scenarios

ROOT = Path(__file__).resolve().parents[1]
METRICS_PATH = ROOT / "models" / "metrics.json"
MIN_PEERS = 30
PEER_METRICS = [
    ("runway_months", "Runway", "months", False),
    ("mrr_growth_pct", "MoM growth", "%", False),
    ("monthly_churn_pct", "Monthly churn", "%", True),
    ("ltv_cac_ratio", "LTV:CAC", "x", False),
    ("burn_multiple", "Burn multiple", "x", True),
]


def _net_burn(clean: dict[str, Any]) -> float:
    """Monthly burn minus gross profit; missing margin uses the training median."""
    margin = clean.get("gross_margin_pct")
    if margin is None or (isinstance(margin, float) and math.isnan(margin)):
        margin = float(load_artifact()["raw_medians"]["gross_margin_pct"])
    return clean["monthly_burn"] - clean["mrr"] * margin / 100.0


def _series(clean: dict[str, Any], months: int) -> tuple[list[float], int | None, bool]:
    net = _net_burn(clean)
    profitable = net <= 0
    rate = 0.0 if profitable else net  # conservative: no credit for surplus
    cash = [clean["cash_balance"] - rate * t for t in range(months + 1)]
    cashout = next((t for t, c in enumerate(cash) if c <= 0), None)
    return cash, cashout, profitable


def runway_forecast(d: dict[str, Any], months: int = 24) -> dict[str, Any]:
    clean, errors = validate_input(d)
    if errors:
        raise ValueError("; ".join(errors))
    current, cash_cur, profitable = _series(clean, months)
    scenarios = action_scenarios(clean)
    probs = probabilities([s[2] for s in scenarios])
    best = int(np.argmin(probs))
    name, _, best_input = scenarios[best]
    improved, cash_imp, _ = _series(best_input, months)
    return {
        "months": list(range(months + 1)),
        "current": current,
        "improved": improved,
        "improved_label": name,
        "cashout_current": cash_cur,
        "cashout_improved": cash_imp,
        "profitable": profitable,
    }


def peer_percentiles(d: dict[str, Any]) -> dict[str, Any]:
    clean, errors = validate_input(d)
    if errors:
        raise ValueError("; ".join(errors))
    data: pd.DataFrame = load_artifact()["peer_data"]
    peers = data[(data["sector"] == clean["sector"]) & (data["stage"] == clean["stage"])]
    fallback = len(peers) < MIN_PEERS
    if fallback:
        peers = data[data["stage"] == clean["stage"]]
    mine = engineer([clean]).iloc[0]
    metrics = []
    for key, label, unit, lower_better in PEER_METRICS:
        col = peers[key].dropna()
        value = mine[key]
        if value is None or (isinstance(value, float) and math.isnan(value)) or col.empty:
            better = None
        elif lower_better:
            better = float((col > value).mean() * 100)
        else:
            better = float((col < value).mean() * 100)
        metrics.append({
            "key": key, "label": label, "unit": unit, "lower_is_better": lower_better,
            "value": None if better is None and (value is None or value != value) else float(value),
            "median": float(col.median()) if not col.empty else None,
            "better_than": better,
        })
    sample = peers[["runway_months", "monthly_churn_pct"]].dropna()
    if len(sample) > 600:
        sample = sample.sample(600, random_state=0)
    churn = mine["monthly_churn_pct"]
    return {
        "n": int(len(peers)),
        "sector": clean["sector"] if not fallback else "All sectors",
        "stage": clean["stage"],
        "fallback": fallback,
        "metrics": metrics,
        "peers": sample.reset_index(drop=True),
        "you": {
            "runway_months": float(mine["runway_months"]),
            "monthly_churn_pct": None if churn != churn else float(churn),
        },
    }


@lru_cache(maxsize=1)
def load_metrics() -> dict[str, Any]:
    if not METRICS_PATH.exists():
        raise FileNotFoundError("models/metrics.json not found. Run: python src/train_model.py")
    return json.loads(METRICS_PATH.read_text(encoding="utf-8"))
