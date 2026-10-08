"""Funding-readiness sub-scores and composite score (documented in README)."""

from __future__ import annotations

import math
from typing import Any

import numpy as np

MISSING_SCORE = 50.0
WEIGHTS = {
    "Runway": 0.25,
    "Unit economics": 0.25,
    "Growth": 0.20,
    "Retention": 0.15,
    "Traction": 0.15,
}
PROBABILITY_PENALTY = 15.0


def _ok(value: Any) -> bool:
    return value is not None and not (isinstance(value, float) and math.isnan(value))


def subscores(features: dict[str, Any]) -> dict[str, float]:
    """features: one engineered row (raw inputs plus add_features columns)."""
    runway = features.get("runway_months")
    ltv_cac = features.get("ltv_cac_ratio")
    growth = features.get("mrr_growth_pct")
    churn = features.get("monthly_churn_pct")
    cover = features.get("revenue_cover")
    months = features.get("months_operating")

    runway_s = min(runway / 18.0, 1.0) * 100 if _ok(runway) else MISSING_SCORE
    unit_s = min(ltv_cac / 3.0, 1.0) * 100 if _ok(ltv_cac) else MISSING_SCORE
    growth_s = float(np.clip((growth + 5.0) / 15.0, 0, 1)) * 100 if _ok(growth) else MISSING_SCORE
    retention_s = max(0.0, 100.0 - 8.0 * churn) if _ok(churn) else MISSING_SCORE
    if _ok(cover) and _ok(months):
        traction_s = float(np.mean([min(cover / 0.6, 1.0), min(months / 24.0, 1.0)])) * 100
    else:
        traction_s = MISSING_SCORE
    return {
        "Runway": float(max(runway_s, 0.0)),
        "Unit economics": float(max(unit_s, 0.0)),
        "Growth": float(growth_s),
        "Retention": float(retention_s),
        "Traction": float(traction_s),
    }


def readiness(sub: dict[str, float], probability: float) -> float:
    total = sum(WEIGHTS[k] * sub[k] for k in WEIGHTS) - PROBABILITY_PENALTY * probability
    return float(np.clip(total, 0, 100))
