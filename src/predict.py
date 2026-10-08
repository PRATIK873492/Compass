"""Inference: validation, single and batch prediction for Startup Compass.

Outputs are probabilities on SYNTHETIC training data, for decision support only.
"""

from __future__ import annotations

import math
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from src.features import FEATURES, add_features
from src.schema import (
    INPUT_FIELDS,
    LABELS,
    OPTIONAL_FIELDS,
    band_for,
    missing_optional,
    validate_input,
)
from src import scoring

ROOT = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "models" / "model.joblib"

__all__ = [
    "validate_input",
    "load_artifact",
    "probabilities",
    "engineer",
    "predict_one",
    "predict_batch",
    "batch_template",
]


@lru_cache(maxsize=1)
def load_artifact() -> dict[str, Any]:
    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            "models/model.joblib not found. Run: python src/data_generation.py && python src/train_model.py"
        )
    return joblib.load(MODEL_PATH)


def _to_row(clean: dict[str, Any]) -> dict[str, Any]:
    return {f: (np.nan if clean.get(f) is None else clean.get(f)) for f in INPUT_FIELDS}


def engineer(rows: list[dict[str, Any]]) -> pd.DataFrame:
    frame = pd.DataFrame([_to_row(r) for r in rows], columns=INPUT_FIELDS)
    return add_features(frame)


def probabilities(rows: list[dict[str, Any]]) -> np.ndarray:
    """Failure probabilities for already-validated input dicts."""
    model = load_artifact()["model"]
    features = engineer(rows).loc[:, FEATURES]
    return model.predict_proba(features)[:, 1]


def _range_warnings(row: pd.Series) -> list[str]:
    limits = load_artifact()["winsor_limits"]
    out = []
    for field in ["monthly_burn", "cash_balance", "mrr", "mrr_growth_pct", "monthly_churn_pct", "team_size"]:
        value = row.get(field)
        if value is None or (isinstance(value, float) and math.isnan(value)):
            continue
        low, high = limits[field]
        if value < low or value > high:
            out.append(f"{LABELS[field]} is outside the training range; the estimate is less reliable.")
    return out


def _finite(value: Any) -> float | None:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(v) or math.isinf(v) else v


def predict_one(d: dict[str, Any]) -> dict[str, Any]:
    """Score one startup. Raises ValueError with readable messages on bad input."""
    from src.explain import explain  # local import avoids a cycle

    clean, errors = validate_input(d)
    if errors:
        raise ValueError("; ".join(errors))
    feats = engineer([clean]).iloc[0]
    probability = float(probabilities([clean])[0])
    sub = scoring.subscores(feats.to_dict())
    missing = missing_optional(clean)
    warnings = []
    if missing:
        names = ", ".join(LABELS[m] for m in missing)
        warnings.append(f"{len(missing)} fields missing: lower confidence ({names}).")
    warnings += _range_warnings(feats)
    if probability <= 0.01 or probability >= 0.99:
        warnings.append(
            "This probability is at the edge of the calibrated range, where the isotonic calibration is flat; "
            "small changes may not move it."
        )
    raising, reducing = explain(clean, probability)
    return {
        "probability": probability,
        "band": band_for(probability),
        "readiness_score": scoring.readiness(sub, probability),
        "subscores": sub,
        "top_negative": raising,
        "top_positive": reducing,
        "runway_months": float(feats["runway_months"]),
        "net_burn": _finite(feats["net_burn"]),
        "missing_count": len(missing),
        "missing_fields": missing,
        "warnings": warnings,
    }


def predict_batch(df: pd.DataFrame) -> pd.DataFrame:
    """Score every valid row; bad rows get an error string and are kept."""
    out = df.copy()
    if "startup_id" not in out.columns:
        out.insert(0, "startup_id", [f"ROW-{i + 1:05d}" for i in range(len(out))])
    cleans: list[dict[str, Any]] = []
    valid_idx: list[int] = []
    errors: list[str] = []
    for pos, (_, row) in enumerate(out.iterrows()):
        rec = {}
        for f in INPUT_FIELDS:
            v = row.get(f) if f in out.columns else None
            rec[f] = None if (v is None or (not isinstance(v, str) and pd.isna(v))) else v
        clean, errs = validate_input(rec)
        missing_cols = [f for f in INPUT_FIELDS if f not in out.columns and f not in OPTIONAL_FIELDS]
        if missing_cols:
            errs = [f"Missing column: {c}" for c in missing_cols] + [e for e in errs if not e.endswith("is required")]
        errors.append("; ".join(errs))
        if not errs:
            cleans.append(clean)
            valid_idx.append(pos)

    n = len(out)
    prob = np.full(n, np.nan)
    ready = np.full(n, np.nan)
    runway = np.full(n, np.nan)
    band = [""] * n
    if cleans:
        p = probabilities(cleans)
        feats = engineer(cleans)
        for k, pos in enumerate(valid_idx):
            sub = scoring.subscores(feats.iloc[k].to_dict())
            prob[pos] = p[k]
            ready[pos] = scoring.readiness(sub, float(p[k]))
            runway[pos] = feats.iloc[k]["runway_months"]
            band[pos] = band_for(float(p[k]))
    out["probability"] = prob
    out["band"] = band
    out["readiness_score"] = ready
    out["runway_months"] = runway
    out["error"] = errors
    return out


def batch_template() -> pd.DataFrame:
    """Example CSV: three good rows, one row with a missing optional field."""
    rows = [
        {"startup_id": "DEMO-001", "sector": "SaaS", "stage": "Seed", "team_size": 14, "months_operating": 30,
         "founder_experience_yrs": 9, "monthly_burn": 18, "cash_balance": 380, "mrr": 16, "mrr_growth_pct": 8,
         "gross_margin_pct": 80, "monthly_churn_pct": 2, "cac": 0.5, "ltv": 3.5, "total_funding_raised": 450, "prior_rounds": 2},
        {"startup_id": "DEMO-002", "sector": "D2C", "stage": "Pre-seed", "team_size": 10, "months_operating": 16,
         "founder_experience_yrs": 2, "monthly_burn": 24, "cash_balance": 40, "mrr": 7, "mrr_growth_pct": -3,
         "gross_margin_pct": 38, "monthly_churn_pct": 15, "cac": 1.0, "ltv": 0.4, "total_funding_raised": 60, "prior_rounds": 1},
        {"startup_id": "DEMO-003", "sector": "Fintech", "stage": "Series A", "team_size": 45, "months_operating": 28,
         "founder_experience_yrs": 6, "monthly_burn": 120, "cash_balance": 1100, "mrr": 45, "mrr_growth_pct": 22,
         "gross_margin_pct": 62, "monthly_churn_pct": 5, "cac": 1.5, "ltv": 3.0, "total_funding_raised": 2200, "prior_rounds": 3},
        {"startup_id": "DEMO-004", "sector": "Edtech", "stage": "Seed", "team_size": 20, "months_operating": 22,
         "founder_experience_yrs": None, "monthly_burn": 30, "cash_balance": 210, "mrr": 9, "mrr_growth_pct": 6,
         "gross_margin_pct": 66, "monthly_churn_pct": 7, "cac": 0.4, "ltv": 0.9, "total_funding_raised": 300, "prior_rounds": 1},
    ]
    return pd.DataFrame(rows, columns=["startup_id"] + INPUT_FIELDS)
