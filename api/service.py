"""Business logic behind the FastAPI endpoints.

Wraps the shared src/ modules (same features, model and validation as the
Streamlit app) and adds web-dashboard extras: ARPU-derived LTV, the
growth-based burn multiple, 12-month projections and scenario bands.
All data is SYNTHETIC; outputs are decision-support probabilities.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

from src import scoring
from src.explain import GROUPS, _subject, group_deltas
from src.insights import load_metrics, peer_percentiles
from src.predict import engineer, load_artifact, predict_one, probabilities
from src.schema import LABELS, OPTIONAL_FIELDS, band_for, validate_input
from src.whatif import action_plan, apply_levers

PROJECTION_MONTHS = 12
GROWTH_CAP_PCT = 30.0  # projection-only cap on compounding MoM growth
LEVER_ORDER = ["burn_pct", "churn_pct", "cac_pct", "growth_pts", "price_pct"]
LEVER_LABELS = {
    "burn_pct": "Burn",
    "churn_pct": "Churn",
    "cac_pct": "CAC",
    "growth_pts": "Growth",
    "price_pct": "Price",
}
SCENARIOS = {
    # name: (growth multiplier or shift, burn multiplier)
    "best": {"growth": lambda g: g * 1.25 if g > 0 else g + 2, "burn": 0.90},
    "base": {"growth": lambda g: g, "burn": 1.00},
    "worst": {"growth": lambda g: g * 0.5 - 2, "burn": 1.10},
}


class InputError(ValueError):
    """Validation failure carrying one message per bad field."""

    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


def _has(v: Any) -> bool:
    return v is not None and not (isinstance(v, float) and math.isnan(v))


def _num(v: Any) -> float | None:
    if not _has(v):
        return None
    f = float(v)
    return None if math.isnan(f) or math.isinf(f) else f


def normalise(raw: dict[str, Any]) -> dict[str, Any]:
    """Validate; derive LTV from ARPU when LTV is not given. Raises InputError."""
    d = dict(raw)
    arpu = d.pop("arpu", None)
    clean, errors = validate_input(d)
    if _has(arpu):
        try:
            arpu_f = float(arpu)
            if arpu_f < 0:
                errors.append("ARPU must be 0 or more")
        except (TypeError, ValueError):
            errors.append("ARPU must be a number")
            arpu_f = None
    else:
        arpu_f = None
    if errors:
        raise InputError(errors)
    if not _has(clean.get("ltv")) and arpu_f is not None:
        churn, gm = clean.get("monthly_churn_pct"), clean.get("gross_margin_pct")
        if _has(churn) and churn > 0 and _has(gm):
            clean["ltv"] = arpu_f * (gm / 100.0) / (churn / 100.0)
    clean["_arpu"] = arpu_f
    return clean


def _model_input(clean: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in clean.items() if not k.startswith("_")}


def _gm(clean: dict[str, Any]) -> float:
    gm = clean.get("gross_margin_pct")
    return gm if _has(gm) else float(load_artifact()["raw_medians"]["gross_margin_pct"])


def growth_burn_multiple(net_burn: float, mrr: float, growth_pct: float) -> float | None:
    """Net burn / net new MRR. None when MRR is not growing (undefined)."""
    net_new = mrr * growth_pct / 100.0
    if net_new <= 0:
        return None
    return max(net_burn, 0.0) / net_new


def kpis(clean: dict[str, Any]) -> dict[str, Any]:
    feats = engineer([_model_input(clean)]).iloc[0]
    net_burn = clean["monthly_burn"] - clean["mrr"] * _gm(clean) / 100.0
    ltv = clean.get("ltv")
    return {
        "net_burn": float(net_burn),
        "runway_months": float(feats["runway_months"]),
        "profitable": bool(net_burn <= 0),
        "ltv": _num(ltv),
        "ltv_cac": _num(feats["ltv_cac_ratio"]),
        "burn_multiple": growth_burn_multiple(net_burn, clean["mrr"], clean["mrr_growth_pct"]),
        "churn_pct": _num(clean.get("monthly_churn_pct")),
        "growth_pct": float(clean["mrr_growth_pct"]),
        "arpu": clean.get("_arpu"),
    }


def _project(clean: dict[str, Any], growth_pct: float, burn_mult: float, months: int) -> list[dict[str, float]]:
    g = min(growth_pct, GROWTH_CAP_PCT) / 100.0
    gm = _gm(clean) / 100.0
    burn = clean["monthly_burn"] * burn_mult
    cash, mrr = clean["cash_balance"], clean["mrr"]
    rows = []
    for t in range(months + 1):
        net = burn - mrr * gm
        rows.append({"month": t, "cash": cash, "mrr": mrr, "net_burn": net})
        cash = cash - net
        mrr = max(mrr * (1 + g), 0.0)
    return rows


def _cashout(rows: list[dict[str, float]]) -> float | None:
    """Fractional month when cash first reaches zero; None if never in horizon."""
    if rows[0]["cash"] <= 0:
        return 0.0
    for prev, cur in zip(rows, rows[1:]):
        if cur["cash"] <= 0:
            return prev["month"] + prev["cash"] / (prev["cash"] - cur["cash"])
    return None


def projection(clean: dict[str, Any], months: int = PROJECTION_MONTHS) -> dict[str, Any]:
    """Cash bands plus per-month KPI trajectories for sparklines (base scenario)."""
    bands = {
        name: _project(clean, cfg["growth"](clean["mrr_growth_pct"]), cfg["burn"], months)
        for name, cfg in SCENARIOS.items()
    }
    base = bands["base"]
    # Risk and readiness if nothing changes: re-score each projected month.
    rows = []
    for r in base:
        rows.append(dict(
            _model_input(clean),
            cash_balance=max(r["cash"], 0.0),
            mrr=min(r["mrr"], 100000.0),
            months_operating=min(clean["months_operating"] + r["month"], 240),
        ))
    probs = probabilities(rows)
    feats = engineer(rows)
    series = []
    for i, r in enumerate(base):
        f = feats.iloc[i].to_dict()
        sub = scoring.subscores(f)
        prev_mrr = base[i - 1]["mrr"] if i else r["mrr"] / (1 + min(clean["mrr_growth_pct"], GROWTH_CAP_PCT) / 100)
        net_new = r["mrr"] - prev_mrr
        series.append({
            "month": r["month"],
            "cash_base": r["cash"],
            "cash_best": bands["best"][i]["cash"],
            "cash_worst": bands["worst"][i]["cash"],
            "mrr": r["mrr"],
            "risk": float(probs[i]),
            "readiness": scoring.readiness(sub, float(probs[i])),
            "runway": float(f["runway_months"]),
            "burn_multiple": (max(r["net_burn"], 0) / net_new) if net_new > 0 else None,
            "ltv_cac": _num(f["ltv_cac_ratio"]),
            "churn": _num(clean.get("monthly_churn_pct")),
        })
    return {
        "series": series,
        "cashout_month": {name: _cashout(rows_) for name, rows_ in bands.items()},
        "assumptions": {
            "base": "Current burn and MoM growth held constant.",
            "best": "Growth x1.25 (or +2 pts if not positive), burn -10%.",
            "worst": "Growth x0.5 - 2 pts, burn +10%.",
            "growth_cap_pct": GROWTH_CAP_PCT,
        },
    }


def peer_medians(clean: dict[str, Any]) -> dict[str, Any]:
    data: pd.DataFrame = load_artifact()["peer_data"]
    peers = data[(data["sector"] == clean["sector"]) & (data["stage"] == clean["stage"])]
    if len(peers) < 30:
        peers = data[data["stage"] == clean["stage"]]
    growth_bm = []
    for nb, mrr, g in zip(peers["net_burn"], peers["mrr"], peers["mrr_growth_pct"]):
        if not (_has(nb) and _has(mrr) and _has(g)):
            continue
        v = growth_burn_multiple(nb, mrr, g)
        if v is not None:
            growth_bm.append(min(v, 60.0))
    return {
        "n": int(len(peers)),
        "runway_months": float(peers["runway_months"].median()),
        "ltv_cac": float(peers["ltv_cac_ratio"].median()),
        "burn_multiple": float(np.median(growth_bm)) if growth_bm else None,
        "churn_pct": float(peers["monthly_churn_pct"].median()),
        "growth_pct": float(peers["mrr_growth_pct"].median()),
    }


def predict(raw: dict[str, Any]) -> dict[str, Any]:
    clean = normalise(raw)
    result = predict_one(_model_input(clean))
    medians = peer_medians(clean)
    return {
        "input": {k: v for k, v in _model_input(clean).items()},
        "result": result,
        "kpis": kpis(clean),
        "peer_medians": medians,
        "projection": projection(clean),
        "synthetic": True,
    }


def explain(raw: dict[str, Any]) -> dict[str, Any]:
    clean = _model_input(normalise(raw))
    deltas = group_deltas(clean)
    feats = engineer([clean]).iloc[0].to_dict()
    drivers = []
    for group, delta in sorted(deltas.items(), key=lambda kv: -kv[1]):
        subject = _subject(group, clean, feats)
        if abs(delta) < 0.05:
            sentence = f"{subject} is not moving your risk."
        else:
            verb = "increasing" if delta > 0 else "decreasing"
            sentence = f"{subject} is {verb} your risk by {abs(delta):.1f} points."
        drivers.append({"group": group, "fields": GROUPS[group], "delta_pp": delta, "sentence": sentence})
    return {
        "drivers": drivers,
        "method": "Each factor group is replaced by the training median/mode and the model re-run; "
                  "delta = your risk - replaced risk, in percentage points.",
        "caveat": "Model-based association, not causation.",
    }


def simulate(raw: dict[str, Any], levers: dict[str, float], with_plan: bool = False) -> dict[str, Any]:
    clean = _model_input(normalise(raw))
    levers = {k: float(levers.get(k, 0) or 0) for k in LEVER_ORDER}
    scenario = apply_levers(clean, **levers)
    # Waterfall: apply levers cumulatively in a fixed order; steps sum to the total.
    cumulative, partial = [], {k: 0.0 for k in LEVER_ORDER}
    for k in LEVER_ORDER:
        partial[k] = levers[k]
        cumulative.append(apply_levers(clean, **partial))
    singles = [apply_levers(clean, **{k: levers[k]}) for k in LEVER_ORDER]
    probs = probabilities([clean, scenario] + cumulative + singles)
    base_p, scen_p = float(probs[0]), float(probs[1])
    cum = [float(p) for p in probs[2 : 2 + len(LEVER_ORDER)]]
    single = [float(p) for p in probs[2 + len(LEVER_ORDER) :]]
    waterfall, prev = [], base_p
    for k, p in zip(LEVER_ORDER, cum):
        waterfall.append({"lever": LEVER_LABELS[k], "key": k, "value": levers[k], "delta_pp": (p - prev) * 100})
        prev = p
    feats = engineer([clean, scenario])
    ready = [
        scoring.readiness(scoring.subscores(feats.iloc[i].to_dict()), p)
        for i, p in enumerate([base_p, scen_p])
    ]
    out = {
        "baseline": {"probability": base_p, "band": band_for(base_p), "readiness": ready[0],
                     "runway_months": float(feats.iloc[0]["runway_months"])},
        "scenario": {"probability": scen_p, "band": band_for(scen_p), "readiness": ready[1],
                     "runway_months": float(feats.iloc[1]["runway_months"])},
        "delta_pp": (scen_p - base_p) * 100,
        "waterfall": waterfall,
        "individual": [{"lever": LEVER_LABELS[k], "key": k, "delta_pp": (p - base_p) * 100}
                       for k, p in zip(LEVER_ORDER, single)],
        "scenario_input": scenario,
        "caveat": "Model-based association, not causation. Estimates on SYNTHETIC data.",
    }
    if with_plan:
        out["action_plan"] = action_plan(clean)
    return out


def benchmark(raw: dict[str, Any]) -> dict[str, Any]:
    clean = _model_input(normalise(raw))
    p = peer_percentiles(clean)
    peers = p.pop("peers")
    return {**p, "peers": peers.to_dict(orient="records")}


BATCH_ALIASES = {
    "startup_id": ["id", "startup", "name", "company", "startup_name", "company_name"],
    "cash_balance": ["cash", "cash_in_bank", "bank_balance"],
    "monthly_burn": ["burn", "burn_rate", "monthly_burn_rate", "opex"],
    "mrr": ["monthly_recurring_revenue", "revenue", "monthly_revenue"],
    "mrr_growth_pct": ["growth", "mom_growth", "growth_pct", "mom_growth_pct"],
    "gross_margin_pct": ["gross_margin", "margin", "gm", "gm_pct"],
    "monthly_churn_pct": ["churn", "churn_pct", "monthly_churn"],
    "team_size": ["team", "headcount", "employees"],
    "months_operating": ["age_months", "months", "company_age_months"],
    "founder_experience_yrs": ["founder_experience", "experience", "experience_yrs"],
    "total_funding_raised": ["funding", "total_funding", "funding_raised"],
    "prior_rounds": ["rounds", "funding_rounds"],
}


def batch_score(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Score rows; each bad row keeps its data and gets an error. Never drops rows."""
    out, valid, idx = [], [], []
    for i, row in enumerate(rows):
        sid = row.get("startup_id") or f"ROW-{i + 1:05d}"
        rec = {k: (None if (v == "" or (isinstance(v, float) and math.isnan(v))) else v) for k, v in row.items()}
        try:
            clean = normalise(rec)
            valid.append(_model_input(clean))
            idx.append(i)
            out.append({"startup_id": str(sid), "error": None, "_clean": clean})
        except InputError as exc:
            out.append({"startup_id": str(sid), "error": "; ".join(exc.errors), "_clean": None})
    if valid:
        probs = probabilities(valid)
        feats = engineer(valid)
        for k, i in enumerate(idx):
            clean = out[i].pop("_clean")
            f = feats.iloc[k].to_dict()
            p = float(probs[k])
            kp = kpis(clean)
            out[i].update({
                "sector": clean["sector"], "stage": clean["stage"],
                "probability": p, "band": band_for(p),
                "readiness": scoring.readiness(scoring.subscores(f), p),
                "runway_months": float(f["runway_months"]),
                "mrr": clean["mrr"], "churn_pct": kp["churn_pct"],
                "ltv_cac": kp["ltv_cac"], "burn_multiple": kp["burn_multiple"],
                "missing": [LABELS[m] for m in OPTIONAL_FIELDS if not _has(clean.get(m))],
            })
    for r in out:
        r.pop("_clean", None)
    ok = [r for r in out if r["error"] is None]
    return {
        "rows": out,
        "summary": {
            "total": len(out),
            "ok": len(ok),
            "errors": len(out) - len(ok),
            "bands": {b: sum(1 for r in ok if r["band"] == b) for b in ("Low", "Medium", "High")},
        },
    }


def model_lab() -> dict[str, Any]:
    return load_metrics()
