"""Mock backend for Part A UI work.

Returns plausible, deterministic outputs with the same function signatures
and return shapes as src/backend.py. No model is loaded. Numbers here are
illustrative placeholders for layout only, not model output.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

from src.schema import (
    INPUT_FIELDS,
    SECTORS,
    STAGES,
    band_for,
    missing_optional,
    validate_input,
)

__all__ = [
    "validate_input",
    "predict_one",
    "predict_batch",
    "apply_levers",
    "lever_effects",
    "action_plan",
    "runway_forecast",
    "peer_percentiles",
    "load_metrics",
    "batch_template",
]


def _nz(value: float, default: float) -> float:
    return default if value is None or (isinstance(value, float) and math.isnan(value)) else float(value)


def _runway(c: dict[str, Any]) -> float:
    net = max(c["monthly_burn"] - c["mrr"] * _nz(c.get("gross_margin_pct"), 60) / 100, 0.05)
    return min(c["cash_balance"] / net, 60.0)


def _prob(c: dict[str, Any]) -> float:
    runway = _runway(c)
    churn = _nz(c.get("monthly_churn_pct"), 6)
    ltv_cac = _nz(c.get("ltv"), 2) / max(_nz(c.get("cac"), 1), 0.01)
    z = 1.2 * (12 - runway) / 10 + 0.08 * (churn - 5) - 0.03 * c["mrr_growth_pct"] + 0.6 * (2 - min(ltv_cac, 6))
    return 1 / (1 + math.exp(-z))


def predict_one(d: dict[str, Any]) -> dict[str, Any]:
    clean, errors = validate_input(d)
    if errors:
        raise ValueError("; ".join(errors))
    p = _prob(clean)
    runway = _runway(clean)
    missing = missing_optional(clean)
    subscores = {
        "Runway": min(runway / 18, 1) * 100,
        "Unit economics": 62.0,
        "Growth": float(np.clip((clean["mrr_growth_pct"] + 5) / 15, 0, 1) * 100),
        "Retention": max(0.0, 100 - 8 * _nz(clean.get("monthly_churn_pct"), 6.25)),
        "Traction": 55.0,
    }
    readiness = float(np.clip(
        0.25 * subscores["Runway"] + 0.25 * subscores["Unit economics"] + 0.20 * subscores["Growth"]
        + 0.15 * subscores["Retention"] + 0.15 * subscores["Traction"] - 15 * p, 0, 100))
    return {
        "probability": p,
        "band": band_for(p),
        "readiness_score": readiness,
        "subscores": subscores,
        "top_negative": [
            {"group": "Runway and burn", "delta_pp": 14.0, "sentence": f"Runway of {runway:.1f} months is raising your risk by 14.0 points."},
            {"group": "Retention", "delta_pp": 6.2, "sentence": "Monthly churn of 9.0% is raising your risk by 6.2 points."},
            {"group": "Team and experience", "delta_pp": 1.1, "sentence": "Founder experience of 2.0 years is raising your risk by 1.1 points."},
        ],
        "top_positive": [
            {"group": "Unit economics", "delta_pp": -8.3, "sentence": "LTV:CAC of 3.4 is reducing your risk by 8.3 points."},
            {"group": "Revenue and growth", "delta_pp": -4.0, "sentence": "MoM growth of 12.0% is reducing your risk by 4.0 points."},
            {"group": "Funding history", "delta_pp": -0.9, "sentence": "2 prior rounds is reducing your risk by 0.9 points."},
        ],
        "runway_months": runway,
        "net_burn": max(clean["monthly_burn"] - clean["mrr"] * _nz(clean.get("gross_margin_pct"), 60) / 100, 0.05),
        "missing_count": len(missing),
        "missing_fields": missing,
        "warnings": [f"{len(missing)} fields missing: lower confidence."] if missing else [],
    }


def apply_levers(d: dict[str, Any], burn_pct: float = 0, churn_pct: float = 0, growth_pts: float = 0, cac_pct: float = 0) -> dict[str, Any]:
    out = dict(d)
    out["monthly_burn"] = d["monthly_burn"] * (1 + burn_pct / 100)
    out["mrr_growth_pct"] = d["mrr_growth_pct"] + growth_pts
    if d.get("cac") is not None:
        out["cac"] = d["cac"] * (1 + cac_pct / 100)
    if d.get("monthly_churn_pct") is not None:
        out["monthly_churn_pct"] = d["monthly_churn_pct"] * (1 + churn_pct / 100)
    return out


def lever_effects(d: dict[str, Any], burn_pct: float = 0, churn_pct: float = 0, growth_pts: float = 0, cac_pct: float = 0) -> list[dict[str, Any]]:
    return [
        {"lever": "Burn", "delta_pp": 0.12 * burn_pct},
        {"lever": "Churn", "delta_pp": 0.05 * churn_pct},
        {"lever": "Growth", "delta_pp": -0.9 * growth_pts},
        {"lever": "CAC", "delta_pp": 0.07 * cac_pct},
    ]


def action_plan(d: dict[str, Any]) -> list[dict[str, Any]]:
    rows = [
        {"action": "Add 6 months of burn to cash", "risk_change_pp": -11.8, "note": "Raise a bridge or extend existing runway."},
        {"action": "Cut burn 15%", "risk_change_pp": -6.4, "note": "Trim non-core spend first."},
        {"action": "Cut churn 30%", "risk_change_pp": -3.9, "note": "LTV rises with lower churn."},
        {"action": "Grow MRR 3 pts faster", "risk_change_pp": -2.6, "note": "Monthly growth plus 3 points."},
        {"action": "Cut CAC 20%", "risk_change_pp": -2.1, "note": "Shift to cheaper channels."},
    ]
    return rows


def runway_forecast(d: dict[str, Any], months: int = 24) -> dict[str, Any]:
    clean, _ = validate_input(d)
    net = max(clean["monthly_burn"] - clean["mrr"] * _nz(clean.get("gross_margin_pct"), 60) / 100, 0.05)
    t = list(range(months + 1))
    current = [clean["cash_balance"] - net * m for m in t]
    improved = [clean["cash_balance"] + 6 * clean["monthly_burn"] - net * m for m in t]

    def cashout(series: list[float]) -> int | None:
        return next((m for m, v in zip(t, series) if v <= 0), None)

    return {
        "months": t,
        "current": current,
        "improved": improved,
        "improved_label": "Add 6 months of burn to cash",
        "cashout_current": cashout(current),
        "cashout_improved": cashout(improved),
        "profitable": False,
    }


def peer_percentiles(d: dict[str, Any]) -> dict[str, Any]:
    rng = np.random.default_rng(7)
    peers = pd.DataFrame({
        "runway_months": rng.gamma(3, 4, 180).clip(0, 60),
        "monthly_churn_pct": rng.gamma(3, 2, 180).clip(0, 40),
    })
    clean, _ = validate_input(d)
    return {
        "n": 180,
        "sector": clean.get("sector", "SaaS"),
        "stage": clean.get("stage", "Seed"),
        "fallback": False,
        "metrics": [
            {"key": "runway_months", "label": "Runway", "unit": "months", "value": _runway(clean), "median": 11.4, "better_than": 72.0, "lower_is_better": False},
            {"key": "mrr_growth_pct", "label": "MoM growth", "unit": "%", "value": clean["mrr_growth_pct"], "median": 15.2, "better_than": 41.0, "lower_is_better": False},
            {"key": "monthly_churn_pct", "label": "Monthly churn", "unit": "%", "value": _nz(clean.get("monthly_churn_pct"), 6), "median": 6.8, "better_than": 58.0, "lower_is_better": True},
            {"key": "ltv_cac_ratio", "label": "LTV:CAC", "unit": "x", "value": 3.4, "median": 2.3, "better_than": 77.0, "lower_is_better": False},
            {"key": "burn_multiple", "label": "Burn multiple", "unit": "x", "value": 1.6, "median": 2.1, "better_than": 63.0, "lower_is_better": True},
        ],
        "peers": peers,
        "you": {"runway_months": _runway(clean), "monthly_churn_pct": _nz(clean.get("monthly_churn_pct"), 6)},
    }


def batch_template() -> pd.DataFrame:
    return pd.DataFrame([
        {"startup_id": "DEMO-001", "sector": "SaaS", "stage": "Seed", "team_size": 14, "months_operating": 26,
         "founder_experience_yrs": 8, "monthly_burn": 18, "cash_balance": 320, "mrr": 14, "mrr_growth_pct": 9,
         "gross_margin_pct": 80, "monthly_churn_pct": 2.5, "cac": 0.6, "ltv": 3.2, "total_funding_raised": 400, "prior_rounds": 2},
        {"startup_id": "DEMO-002", "sector": "D2C", "stage": "Pre-seed", "team_size": 9, "months_operating": 14,
         "founder_experience_yrs": 2, "monthly_burn": 22, "cash_balance": 45, "mrr": 6, "mrr_growth_pct": -2,
         "gross_margin_pct": 38, "monthly_churn_pct": 14, "cac": 0.9, "ltv": 0.7, "total_funding_raised": 60, "prior_rounds": 1},
    ], columns=["startup_id"] + INPUT_FIELDS)


def predict_batch(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    probs, bands, ready, runway, errs = [], [], [], [], []
    for _, row in df.iterrows():
        rec = {k: (None if pd.isna(v) else v) for k, v in row.items()}
        clean, errors = validate_input(rec)
        if errors:
            probs.append(np.nan); bands.append(""); ready.append(np.nan); runway.append(np.nan); errs.append("; ".join(errors))
            continue
        r = predict_one(clean)
        probs.append(r["probability"]); bands.append(r["band"]); ready.append(r["readiness_score"])
        runway.append(r["runway_months"]); errs.append("")
    out["probability"] = probs
    out["band"] = bands
    out["readiness_score"] = ready
    out["runway_months"] = runway
    out["error"] = errs
    return out


def load_metrics() -> dict[str, Any]:
    cv = {
        "Logistic Regression": {"roc_auc_mean": 0.891, "roc_auc_std": 0.005, "pr_auc_mean": 0.782, "pr_auc_std": 0.008, "f1_mean": 0.716, "f1_std": 0.014, "recall_mean": 0.829, "recall_std": 0.010, "brier_mean": 0.138, "brier_std": 0.006},
        "Random Forest": {"roc_auc_mean": 0.879, "roc_auc_std": 0.004, "pr_auc_mean": 0.758, "pr_auc_std": 0.020, "f1_mean": 0.709, "f1_std": 0.008, "recall_mean": 0.781, "recall_std": 0.009, "brier_mean": 0.142, "brier_std": 0.003},
        "HistGradientBoosting": {"roc_auc_mean": 0.874, "roc_auc_std": 0.005, "pr_auc_mean": 0.745, "pr_auc_std": 0.011, "f1_mean": 0.679, "f1_std": 0.013, "recall_mean": 0.661, "recall_std": 0.015, "brier_mean": 0.138, "brier_std": 0.004},
    }
    return {
        "synthetic": True,
        "dataset": {"rows": 6000, "columns": 17, "generated_failure_rate": 0.32, "train_rows": 4800, "test_rows": 1200, "random_seed": 42},
        "cross_validation": {"folds": 5, "metrics": cv},
        "selection": {"selected_model": "Logistic Regression", "explanation": "Mock: highest mean CV ROC-AUC."},
        "test_metrics": {"roc_auc": 0.90, "pr_auc": 0.81, "brier": 0.12, "recall": 0.70, "f1": 0.72, "precision": 0.74, "accuracy": 0.83},
        "calibration_points": [{"predicted": x, "observed": min(1, x * 1.05)} for x in np.linspace(0.05, 0.95, 10)],
        "permutation_importance": [
            {"feature": "runway_months", "importance_mean": 0.19, "importance_std": 0.01},
            {"feature": "ltv_cac_ratio", "importance_mean": 0.17, "importance_std": 0.01},
            {"feature": "mrr_growth_pct", "importance_mean": 0.015, "importance_std": 0.003},
            {"feature": "founder_experience_yrs", "importance_mean": 0.011, "importance_std": 0.002},
            {"feature": "monthly_churn_pct", "importance_mean": 0.007, "importance_std": 0.001},
        ],
        "limitations": [
            "All records and outcomes are SYNTHETIC.",
            "Outputs are decision-support probabilities, never guarantees.",
        ],
        "sectors": SECTORS,
        "stages": STAGES,
    }
