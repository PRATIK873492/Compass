"""Backend tests for Startup Compass (SYNTHETIC data)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src import backend as B  # noqa: E402
from src.schema import INPUT_FIELDS, OPTIONAL_FIELDS  # noqa: E402
from ui.state import PRESETS  # noqa: E402

NORMAL = PRESETS["High-growth Fintech"]
HEALTHY = PRESETS["Healthy SaaS"]
KEYS = {
    "probability", "band", "readiness_score", "subscores", "top_negative", "top_positive",
    "runway_months", "missing_count", "warnings",
}


def test_normal_input_probability_in_unit_interval():
    r = B.predict_one(NORMAL)
    assert 0.0 <= r["probability"] <= 1.0
    assert r["band"] in {"Low", "Medium", "High"}
    assert 0.0 <= r["readiness_score"] <= 100.0


def test_predict_one_keys_complete():
    r = B.predict_one(NORMAL)
    assert KEYS <= set(r)
    assert set(r["subscores"]) == {"Runway", "Unit economics", "Growth", "Retention", "Traction"}
    assert len(r["top_negative"]) <= 3 and len(r["top_positive"]) <= 3
    for item in r["top_negative"] + r["top_positive"]:
        assert item["sentence"].endswith("points.")


@pytest.mark.parametrize("field", OPTIONAL_FIELDS)
def test_each_optional_field_missing_still_predicts(field):
    d = dict(NORMAL, **{field: None})
    r = B.predict_one(d)
    assert 0.0 <= r["probability"] <= 1.0
    assert r["missing_count"] == 1
    assert any("missing" in w for w in r["warnings"])


def test_all_optional_missing_still_predicts():
    d = dict(NORMAL, **{f: None for f in OPTIONAL_FIELDS})
    assert B.predict_one(d)["missing_count"] == len(OPTIONAL_FIELDS)


@pytest.mark.parametrize(
    "field,value,fragment",
    [
        ("monthly_burn", "abc", "Monthly burn must be a number"),
        ("cash_balance", -5, "Cash balance must be between 0 and 1000000"),
        ("monthly_churn_pct", 150, "Monthly churn must be between 0 and 100"),
        ("team_size", 0, "Team size must be between 1 and 1000"),
        ("cac", -1, "CAC must be 0 or more"),
        ("prior_rounds", 99, "Prior rounds must be between 0 and 15"),
        ("sector", "Crypto", "Sector must be one of"),
        ("mrr", None, "MRR is required"),
    ],
)
def test_bad_values_return_errors(field, value, fragment):
    _, errors = B.validate_input(dict(NORMAL, **{field: value}))
    assert any(fragment in e for e in errors), errors
    with pytest.raises(ValueError):
        B.predict_one(dict(NORMAL, **{field: value}))


@pytest.mark.parametrize(
    "override",
    [
        {"cash_balance": 0},
        {"monthly_burn": PRESETS["Healthy SaaS"]["monthly_burn"] * 1000},
        {"monthly_churn_pct": 100},
        {"mrr": 0, "cac": 0, "ltv": 0},
        {"gross_margin_pct": -100},
    ],
)
def test_extremes_do_not_crash(override):
    d = dict(HEALTHY, **override)
    r = B.predict_one(d)
    assert 0.0 <= r["probability"] <= 1.0
    B.action_plan(d)
    B.runway_forecast(d)
    B.peer_percentiles(d)
    B.lever_effects(d, -50, -80, 10, -50)


def test_preset_risk_ordering():
    healthy = B.predict_one(PRESETS["Healthy SaaS"])["probability"]
    growth = B.predict_one(PRESETS["High-growth Fintech"])["probability"]
    struggling = B.predict_one(PRESETS["Struggling D2C"])["probability"]
    print(f"\nhealthy={healthy:.3f} high-growth={growth:.3f} struggling={struggling:.3f}")
    assert healthy < growth < struggling


def test_lowering_churn_never_raises_risk():
    data = pd.read_csv(ROOT / "data" / "startups_synthetic.csv")
    sample = data.dropna(subset=["monthly_churn_pct"]).sample(50, random_state=1)
    failures = []
    for _, row in sample.iterrows():
        d = {f: (None if pd.isna(row[f]) else row[f]) for f in INPUT_FIELDS}
        clean, errors = B.validate_input(d)
        if errors:
            continue
        base = B.predict_one(clean)["probability"]
        lower = B.predict_one(dict(clean, monthly_churn_pct=clean["monthly_churn_pct"] * 0.5))["probability"]
        if lower > base + 0.02:
            failures.append((row["startup_id"], round(base, 4), round(lower, 4)))
    print(f"\nchurn monotonicity failures: {len(failures)} of 50 {failures}")
    assert not failures


def test_apply_levers_keeps_unit_economics_consistent():
    out = B.apply_levers(NORMAL, churn_pct=-50)
    assert out["monthly_churn_pct"] == pytest.approx(NORMAL["monthly_churn_pct"] * 0.5)
    assert out["ltv"] == pytest.approx(NORMAL["ltv"] * 2)
    assert NORMAL["monthly_churn_pct"] == 5.0  # original untouched


def test_action_plan_sorted_and_real():
    plan = B.action_plan(NORMAL)
    assert len(plan) == 6
    changes = [p["risk_change_pp"] for p in plan]
    assert changes == sorted(changes)
    assert any(abs(c) > 0.1 for c in changes)


def test_runway_forecast_cashout():
    f = B.runway_forecast(dict(NORMAL, cash_balance=100))
    assert f["cashout_current"] is not None
    assert f["current"][0] == 100
    profitable = B.runway_forecast(dict(NORMAL, monthly_burn=10, mrr=100, gross_margin_pct=80))
    assert profitable["profitable"] and profitable["cashout_current"] is None


def test_peer_percentiles_shape():
    p = B.peer_percentiles(NORMAL)
    assert p["n"] >= 30
    assert [m["label"] for m in p["metrics"]] == ["Runway", "MoM growth", "Monthly churn", "LTV:CAC", "Burn multiple"]
    for m in p["metrics"]:
        assert 0 <= m["better_than"] <= 100


def test_batch_with_two_bad_rows():
    df = B.batch_template()
    bad = df.iloc[[0, 1]].copy().astype(object)
    bad["startup_id"] = ["BAD-1", "BAD-2"]
    bad.loc[bad.index[0], "monthly_churn_pct"] = 250
    bad.loc[bad.index[1], "monthly_burn"] = "lots"
    combined = pd.concat([df, bad], ignore_index=True)
    out = B.predict_batch(combined)
    assert len(out) == len(combined)
    flagged = out[out["error"] != ""]
    assert list(flagged["startup_id"]) == ["BAD-1", "BAD-2"]
    assert "Monthly churn must be between 0 and 100" in flagged.iloc[0]["error"]
    assert "Monthly burn must be a number" in flagged.iloc[1]["error"]
    good = out[out["error"] == ""]
    assert len(good) == len(df)
    assert good["probability"].between(0, 1).all()


def test_metrics_json_is_synthetic_and_complete():
    m = json.loads((ROOT / "models" / "metrics.json").read_text(encoding="utf-8"))
    assert m["synthetic"] is True
    assert m["dataset"]["rows"] == 6000 and m["dataset"]["random_seed"] == 42
    assert set(m["cross_validation"]["metrics"]) == {"Logistic Regression", "Random Forest", "HistGradientBoosting"}
    assert len(m["calibration_points"]) >= 5
    assert m["permutation_importance"]
    assert m == B.load_metrics()
