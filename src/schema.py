"""Input schema, allowed ranges and validation shared by the UI and both backends.

All money values are INR lakh. Data used by the demo is SYNTHETIC.
"""

from __future__ import annotations

import math
from typing import Any

SECTORS = ["SaaS", "Fintech", "Edtech", "Healthtech", "D2C", "Agritech", "Deeptech"]
STAGES = ["Pre-seed", "Seed", "Series A"]

# field -> (min, max); None means no upper bound.
NUMERIC_RANGES: dict[str, tuple[float, float | None]] = {
    "team_size": (1, 1000),
    "months_operating": (0, 240),
    "founder_experience_yrs": (0, 50),
    "monthly_burn": (0.01, 100000),
    "cash_balance": (0, 1000000),
    "mrr": (0, 100000),
    "mrr_growth_pct": (-50, 200),
    "gross_margin_pct": (-100, 100),
    "monthly_churn_pct": (0, 100),
    "cac": (0, None),
    "ltv": (0, None),
    "total_funding_raised": (0, None),
    "prior_rounds": (0, 15),
}
NUMERIC_FIELDS = list(NUMERIC_RANGES)
CATEGORICAL_FIELDS = ["sector", "stage"]
INPUT_FIELDS = CATEGORICAL_FIELDS + NUMERIC_FIELDS
OPTIONAL_FIELDS = [
    "founder_experience_yrs",
    "gross_margin_pct",
    "monthly_churn_pct",
    "cac",
    "ltv",
]
REQUIRED_FIELDS = [f for f in INPUT_FIELDS if f not in OPTIONAL_FIELDS]

LABELS = {
    "sector": "Sector",
    "stage": "Stage",
    "team_size": "Team size",
    "months_operating": "Months operating",
    "founder_experience_yrs": "Founder experience",
    "monthly_burn": "Monthly burn",
    "cash_balance": "Cash balance",
    "mrr": "MRR",
    "mrr_growth_pct": "MoM growth",
    "gross_margin_pct": "Gross margin",
    "monthly_churn_pct": "Monthly churn",
    "cac": "CAC",
    "ltv": "LTV",
    "total_funding_raised": "Total funding raised",
    "prior_rounds": "Prior rounds",
}


def _is_blank(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    try:
        return isinstance(value, float) and math.isnan(value)
    except TypeError:
        return False


def _num(x: float) -> str:
    return str(int(x)) if float(x).is_integer() else f"{x}"


def _range_message(field: str) -> str:
    low, high = NUMERIC_RANGES[field]
    name = LABELS[field]
    if high is None:
        return f"{name} must be {_num(low)} or more"
    return f"{name} must be between {_num(low)} and {_num(high)}"


def validate_input(d: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """Return (clean, errors).

    clean holds floats for numeric fields (NaN for blank optional fields) and
    strings for categorical fields. errors is a list of user-facing sentences,
    one per bad field. Never raises for bad values.
    """
    if not isinstance(d, dict):
        return {}, ["Input must be a set of named fields"]
    clean: dict[str, Any] = {}
    errors: list[str] = []

    for field, allowed in (("sector", SECTORS), ("stage", STAGES)):
        value = d.get(field)
        if _is_blank(value):
            errors.append(f"{LABELS[field]} is required")
        elif str(value).strip() not in allowed:
            errors.append(f"{LABELS[field]} must be one of: {', '.join(allowed)}")
        else:
            clean[field] = str(value).strip()

    for field in NUMERIC_FIELDS:
        value = d.get(field)
        if _is_blank(value):
            if field in OPTIONAL_FIELDS:
                clean[field] = float("nan")
            else:
                errors.append(f"{LABELS[field]} is required")
            continue
        if isinstance(value, bool):
            errors.append(f"{LABELS[field]} must be a number")
            continue
        try:
            number = float(str(value).replace(",", "").strip()) if isinstance(value, str) else float(value)
        except (TypeError, ValueError):
            errors.append(f"{LABELS[field]} must be a number")
            continue
        if math.isnan(number) or math.isinf(number):
            if field in OPTIONAL_FIELDS and math.isnan(number):
                clean[field] = float("nan")
            else:
                errors.append(f"{LABELS[field]} must be a number")
            continue
        low, high = NUMERIC_RANGES[field]
        if number < low or (high is not None and number > high):
            errors.append(_range_message(field))
            continue
        clean[field] = number

    return clean, errors


def missing_optional(clean: dict[str, Any]) -> list[str]:
    return [f for f in OPTIONAL_FIELDS if _is_blank(clean.get(f))]


def band_for(probability: float) -> str:
    if probability < 0.25:
        return "Low"
    if probability <= 0.50:
        return "Medium"
    return "High"
