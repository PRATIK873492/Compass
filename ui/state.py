"""Presets, form field metadata and session-state helpers."""

from __future__ import annotations

from typing import Any

import streamlit as st

from src.schema import INPUT_FIELDS, NUMERIC_RANGES, OPTIONAL_FIELDS, SECTORS, STAGES

PRESET_NAMES = ["Healthy SaaS", "Struggling D2C", "High-growth Fintech", "Custom"]

PRESETS: dict[str, dict[str, Any]] = {
    "Healthy SaaS": {
        "sector": "SaaS", "stage": "Seed", "team_size": 14, "months_operating": 30,
        "founder_experience_yrs": 9.0, "monthly_burn": 30.0, "cash_balance": 350.0, "mrr": 16.0,
        "mrr_growth_pct": 8.0, "gross_margin_pct": 80.0, "monthly_churn_pct": 2.0, "cac": 0.5,
        "ltv": 1.2, "total_funding_raised": 450.0, "prior_rounds": 2,
    },
    "Struggling D2C": {
        "sector": "D2C", "stage": "Pre-seed", "team_size": 10, "months_operating": 16,
        "founder_experience_yrs": 2.0, "monthly_burn": 24.0, "cash_balance": 200.0, "mrr": 7.0,
        "mrr_growth_pct": -3.0, "gross_margin_pct": 38.0, "monthly_churn_pct": 9.0, "cac": 1.0,
        "ltv": 1.2, "total_funding_raised": 60.0, "prior_rounds": 1,
    },
    "High-growth Fintech": {
        "sector": "Fintech", "stage": "Series A", "team_size": 45, "months_operating": 28,
        "founder_experience_yrs": 6.0, "monthly_burn": 120.0, "cash_balance": 1100.0, "mrr": 45.0,
        "mrr_growth_pct": 22.0, "gross_margin_pct": 62.0, "monthly_churn_pct": 5.0, "cac": 1.5,
        "ltv": 3.0, "total_funding_raised": 2200.0, "prior_rounds": 3,
    },
}

# field -> (label with unit, help, step, format, group)
FIELD_META: dict[str, tuple[str, str, float, str, str]] = {
    "team_size": ("Team size (people)", "Full-time people on payroll, including founders.", 1, "%d", "Business"),
    "months_operating": ("Months operating (months)", "Months since the company started operating.", 1, "%d", "Business"),
    "founder_experience_yrs": ("Founder experience (years)", "Most experienced founder's years of relevant work.", 0.5, "%.1f", "Business"),
    "monthly_burn": ("Monthly burn (Rs lakh)", "Total monthly operating spend before revenue, in INR lakh.", 0.5, "%.2f", "Cash and burn"),
    "cash_balance": ("Cash balance (Rs lakh)", "Cash in the bank today, in INR lakh.", 1.0, "%.2f", "Cash and burn"),
    "mrr": ("MRR (Rs lakh / month)", "Monthly recurring revenue, in INR lakh.", 0.5, "%.2f", "Revenue"),
    "mrr_growth_pct": ("MoM growth (%)", "Average month-on-month MRR growth over the last 3 months. Allowed -50 to 200.", 0.5, "%.1f", "Revenue"),
    "gross_margin_pct": ("Gross margin (%)", "Revenue minus direct costs, as a % of revenue. Allowed -100 to 100.", 1.0, "%.1f", "Revenue"),
    "monthly_churn_pct": ("Monthly churn (%)", "Share of customers or revenue lost each month. Allowed 0 to 100.", 0.5, "%.1f", "Unit economics"),
    "cac": ("CAC (Rs lakh / customer)", "Average cost to acquire one customer, in INR lakh.", 0.05, "%.3f", "Unit economics"),
    "ltv": ("LTV (Rs lakh / customer)", "Gross-margin lifetime value of one customer, in INR lakh.", 0.05, "%.3f", "Unit economics"),
    "total_funding_raised": ("Total funding raised (Rs lakh)", "All equity and grant funding raised to date, in INR lakh.", 5.0, "%.1f", "Unit economics"),
    "prior_rounds": ("Prior rounds (count)", "Number of priced or SAFE rounds closed. Allowed 0 to 15.", 1, "%d", "Unit economics"),
}
GROUPS = {
    "Business": ["sector", "stage", "team_size", "months_operating", "founder_experience_yrs"],
    "Cash and burn": ["monthly_burn", "cash_balance"],
    "Revenue": ["mrr", "mrr_growth_pct", "gross_margin_pct"],
    "Unit economics": ["monthly_churn_pct", "cac", "ltv", "total_funding_raised", "prior_rounds"],
}
INTEGER_FIELDS = {"team_size", "months_operating", "prior_rounds"}
OPTIONAL_LABELS = {
    "founder_experience_yrs": "Founder experience",
    "gross_margin_pct": "Gross margin",
    "monthly_churn_pct": "Monthly churn",
    "cac": "CAC",
    "ltv": "LTV",
}
LEVER_KEYS = {"lever_burn": 0, "lever_churn": 0, "lever_growth": 0, "lever_cac": 0}


def key(field: str) -> str:
    return f"in_{field}"


def init_state() -> None:
    ss = st.session_state
    ss.setdefault("preset", None)
    ss.setdefault("unknown", [])
    for field in INPUT_FIELDS:
        ss.setdefault(key(field), None)
    for k, v in LEVER_KEYS.items():
        ss.setdefault(k, v)


def apply_preset() -> None:
    """on_change callback for the preset selector."""
    name = st.session_state.get("preset")
    if name in PRESETS:
        for field, value in PRESETS[name].items():
            st.session_state[key(field)] = value
        st.session_state["unknown"] = []
    reset_levers()


def mark_custom() -> None:
    """on_change callback for any input: the form no longer matches a preset."""
    if st.session_state.get("preset") in PRESETS:
        st.session_state["preset"] = "Custom"


def reset_levers() -> None:
    for k, v in LEVER_KEYS.items():
        st.session_state[k] = v


def collect_input() -> dict[str, Any]:
    ss = st.session_state
    unknown = set(ss.get("unknown", []))
    out: dict[str, Any] = {}
    for field in INPUT_FIELDS:
        value = ss.get(key(field))
        if field in unknown and field in OPTIONAL_FIELDS:
            value = None
        out[field] = value
    return out


def is_empty(d: dict[str, Any]) -> bool:
    return all(d.get(f) is None for f in INPUT_FIELDS)


def number_bounds(field: str) -> tuple[float | None, float | None]:
    low, high = NUMERIC_RANGES[field]
    return low, high


__all__ = [
    "PRESET_NAMES", "PRESETS", "FIELD_META", "GROUPS", "INTEGER_FIELDS", "OPTIONAL_LABELS",
    "SECTORS", "STAGES", "key", "init_state", "apply_preset", "mark_custom", "reset_levers",
    "collect_input", "is_empty", "number_bounds",
]
