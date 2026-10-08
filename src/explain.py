"""Local explanations by group replacement with training medians/modes.

For each factor group, its fields are replaced by the training median (numeric)
or mode (categorical) and the model is re-run. delta = baseline - replaced, in
percentage points. Positive delta means the startup's actual values in that
group are raising risk relative to a typical training startup.
"""

from __future__ import annotations

import math
from typing import Any

from src.predict import engineer, load_artifact, probabilities

GROUPS: dict[str, list[str]] = {
    "Runway and burn": ["monthly_burn", "cash_balance"],
    "Revenue and growth": ["mrr", "mrr_growth_pct"],
    "Unit economics": ["cac", "ltv", "gross_margin_pct"],
    "Retention": ["monthly_churn_pct"],
    "Team and experience": ["team_size", "founder_experience_yrs", "months_operating"],
    "Funding history": ["total_funding_raised", "prior_rounds", "stage", "sector"],
}
MIN_DELTA_PP = 0.05


def _has(v: Any) -> bool:
    return v is not None and not (isinstance(v, float) and math.isnan(v))


def _subject(group: str, clean: dict[str, Any], feats: dict[str, Any]) -> str:
    if group == "Runway and burn":
        runway = feats["runway_months"]
        return "Runway of 60+ months" if runway >= 60 else f"Runway of {runway:.1f} months"
    if group == "Revenue and growth":
        return f"MRR of Rs {clean['mrr']:,.1f} L growing {clean['mrr_growth_pct']:.1f}% MoM"
    if group == "Unit economics":
        if _has(feats.get("ltv_cac_ratio")):
            return f"LTV:CAC of {feats['ltv_cac_ratio']:.1f}"
        if _has(clean.get("gross_margin_pct")):
            return f"Gross margin of {clean['gross_margin_pct']:.1f}%"
        return "Missing unit-economics data"
    if group == "Retention":
        if _has(clean.get("monthly_churn_pct")):
            return f"Monthly churn of {clean['monthly_churn_pct']:.1f}%"
        return "Missing churn data"
    if group == "Team and experience":
        if _has(clean.get("founder_experience_yrs")):
            return f"Founder experience of {clean['founder_experience_yrs']:.1f} years"
        return f"A team of {clean['team_size']:.0f} people"
    rounds = int(clean["prior_rounds"])
    return f"{rounds} prior round{'s' if rounds != 1 else ''} (Rs {clean['total_funding_raised']:,.1f} L raised)"


def group_deltas(clean: dict[str, Any], baseline: float | None = None) -> dict[str, float]:
    art = load_artifact()
    medians, modes = art["raw_medians"], art["categorical_modes"]
    variants = []
    for fields in GROUPS.values():
        v = dict(clean)
        for f in fields:
            v[f] = modes[f] if f in modes else float(medians[f])
        variants.append(v)
    rows = variants if baseline is not None else [clean] + variants
    probs = probabilities(rows)
    if baseline is None:
        baseline, probs = float(probs[0]), probs[1:]
    return {g: (baseline - float(p)) * 100 for g, p in zip(GROUPS, probs)}


def explain(clean: dict[str, Any], baseline: float) -> tuple[list[dict], list[dict]]:
    """Return (raising_risk_top3, reducing_risk_top3) as sentence items."""
    deltas = group_deltas(clean, baseline)
    feats = engineer([clean]).iloc[0].to_dict()
    items = []
    for group, delta in deltas.items():
        if abs(delta) < MIN_DELTA_PP:
            continue
        subject = _subject(group, clean, feats)
        verb = "raising" if delta > 0 else "reducing"
        items.append({
            "group": group,
            "delta_pp": delta,
            "sentence": f"{subject} is {verb} your risk by {abs(delta):.1f} points.",
        })
    raising = sorted([i for i in items if i["delta_pp"] > 0], key=lambda i: -i["delta_pp"])[:3]
    reducing = sorted([i for i in items if i["delta_pp"] < 0], key=lambda i: i["delta_pp"])[:3]
    return raising, reducing
