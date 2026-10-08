"""What-If levers and model-estimated action plan.

All risk changes are model estimates on SYNTHETIC data, not guaranteed outcomes.
"""

from __future__ import annotations

import math
from typing import Any

from src.predict import probabilities
from src.schema import NUMERIC_RANGES, validate_input


def _has(v: Any) -> bool:
    return v is not None and not (isinstance(v, float) and math.isnan(v))


def _clip(field: str, value: float) -> float:
    low, high = NUMERIC_RANGES[field]
    value = max(value, low)
    return min(value, high) if high is not None else value


def apply_levers(
    d: dict[str, Any],
    burn_pct: float = 0,
    churn_pct: float = 0,
    growth_pts: float = 0,
    cac_pct: float = 0,
    price_pct: float = 0,
) -> dict[str, Any]:
    """Return a modified copy. Churn scaling also rescales LTV by old/new churn.

    price_pct raises ARPU: MRR and LTV scale by (1 + price_pct/100), holding
    customer count and churn constant (no demand response is modelled).
    """
    out = dict(d)
    if price_pct:
        factor = 1 + price_pct / 100
        out["mrr"] = _clip("mrr", d["mrr"] * factor)
        if _has(d.get("ltv")):
            out["ltv"] = d["ltv"] * factor
    out["monthly_burn"] = _clip("monthly_burn", d["monthly_burn"] * (1 + burn_pct / 100))
    out["mrr_growth_pct"] = _clip("mrr_growth_pct", d["mrr_growth_pct"] + growth_pts)
    if _has(d.get("cac")):
        out["cac"] = _clip("cac", d["cac"] * (1 + cac_pct / 100))
    old = d.get("monthly_churn_pct")
    if _has(old) and churn_pct:
        new = _clip("monthly_churn_pct", old * (1 + churn_pct / 100))
        out["monthly_churn_pct"] = new
        if _has(out.get("ltv")) and old > 0 and new > 0:
            out["ltv"] = out["ltv"] * old / new
    return out


def _deltas(base: dict[str, Any], variants: list[dict[str, Any]]) -> list[float]:
    probs = probabilities([base] + variants)
    return [(float(p) - float(probs[0])) * 100 for p in probs[1:]]


def lever_effects(
    d: dict[str, Any], burn_pct: float = 0, churn_pct: float = 0, growth_pts: float = 0, cac_pct: float = 0
) -> list[dict[str, Any]]:
    """Risk change (percentage points) from each lever applied on its own."""
    clean, errors = validate_input(d)
    if errors:
        raise ValueError("; ".join(errors))
    variants = [
        apply_levers(clean, burn_pct=burn_pct),
        apply_levers(clean, churn_pct=churn_pct),
        apply_levers(clean, growth_pts=growth_pts),
        apply_levers(clean, cac_pct=cac_pct),
    ]
    deltas = _deltas(clean, variants)
    return [{"lever": name, "delta_pp": dl} for name, dl in zip(["Burn", "Churn", "Growth", "CAC"], deltas)]


def action_scenarios(clean: dict[str, Any]) -> list[tuple[str, str, dict[str, Any]]]:
    more_cash = dict(clean)
    more_cash["cash_balance"] = _clip("cash_balance", clean["cash_balance"] + 6 * clean["monthly_burn"])
    rows = [
        ("Cut burn 15%", "Lower monthly burn by 15%; trim non-core spend first.", apply_levers(clean, burn_pct=-15)),
        ("Cut churn 30%", "Lower monthly churn by 30%; LTV rises in proportion.", apply_levers(clean, churn_pct=-30)),
        ("Grow MRR 3 pts faster", "Add 3 points to month-on-month MRR growth.", apply_levers(clean, growth_pts=3)),
        ("Cut CAC 20%", "Lower customer acquisition cost by 20%.", apply_levers(clean, cac_pct=-20)),
        ("Raise prices 10%", "ARPU +10% with churn held constant (no demand response modelled).",
         apply_levers(clean, price_pct=10)),
        ("Add 6 months of burn to cash", "Raise or bridge 6 x monthly burn in new cash.", more_cash),
    ]
    if not _has(clean.get("monthly_churn_pct")):
        rows[1] = (rows[1][0], "Churn not provided, so this action cannot be estimated.", dict(clean))
    if not _has(clean.get("cac")):
        rows[3] = (rows[3][0], "CAC not provided, so this action cannot be estimated.", dict(clean))
    return rows


def action_plan(d: dict[str, Any]) -> list[dict[str, Any]]:
    """Six standard actions, each re-run through the model, sorted by risk reduction."""
    clean, errors = validate_input(d)
    if errors:
        raise ValueError("; ".join(errors))
    scenarios = action_scenarios(clean)
    deltas = _deltas(clean, [s[2] for s in scenarios])
    plan = [
        {"action": name, "risk_change_pp": dl, "note": note}
        for (name, note, _), dl in zip(scenarios, deltas)
    ]
    return sorted(plan, key=lambda r: r["risk_change_pp"])
