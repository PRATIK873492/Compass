"""FastAPI endpoint tests (TestClient, no network)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api.main import app  # noqa: E402
from ui.state import PRESETS  # noqa: E402

client = TestClient(app)
FINTECH = PRESETS["High-growth Fintech"]


def post(path, body):
    r = client.post(path, json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_health():
    assert client.get("/health").json()["synthetic"] is True


def test_predict_shape_and_kpis():
    out = post("/predict", {"startup": FINTECH})
    assert 0 <= out["result"]["probability"] <= 1
    k = out["kpis"]
    assert k["ltv_cac"] == pytest.approx(FINTECH["ltv"] / FINTECH["cac"])
    net = FINTECH["monthly_burn"] - FINTECH["mrr"] * FINTECH["gross_margin_pct"] / 100
    assert k["net_burn"] == pytest.approx(net)
    assert k["burn_multiple"] == pytest.approx(net / (FINTECH["mrr"] * FINTECH["mrr_growth_pct"] / 100))
    series = out["projection"]["series"]
    assert len(series) == 13 and series[0]["cash_base"] == FINTECH["cash_balance"]
    assert all(s["cash_worst"] <= s["cash_base"] <= s["cash_best"] for s in series)
    assert out["peer_medians"]["n"] >= 30


def test_arpu_derives_ltv():
    d = dict(FINTECH, ltv=None, arpu=0.2)
    out = post("/predict", {"startup": d})
    expected = 0.2 * 0.62 / 0.05
    assert out["kpis"]["ltv"] == pytest.approx(expected)


def test_invalid_input_returns_field_errors():
    r = client.post("/predict", json={"startup": dict(FINTECH, monthly_churn_pct=150, mrr="x")})
    assert r.status_code == 422
    errs = r.json()["errors"]
    assert "Monthly churn must be between 0 and 100" in errs
    assert "MRR must be a number" in errs


def test_explain_sorted_diverging():
    out = post("/explain", {"startup": FINTECH})
    deltas = [d["delta_pp"] for d in out["drivers"]]
    assert deltas == sorted(deltas, reverse=True) and len(deltas) == 6
    assert "not causation" in out["caveat"]


def test_simulate_waterfall_sums_to_total():
    levers = {"burn_pct": -20, "churn_pct": -30, "cac_pct": -10, "growth_pts": 3, "price_pct": 10}
    out = post("/simulate", {"startup": FINTECH, "levers": levers, "action_plan": True})
    total = sum(w["delta_pp"] for w in out["waterfall"])
    assert total == pytest.approx(out["delta_pp"], abs=1e-6)
    assert out["scenario"]["probability"] < out["baseline"]["probability"]
    plan = [a["risk_change_pp"] for a in out["action_plan"]]
    assert plan == sorted(plan)


def test_benchmark():
    out = post("/benchmark", {"startup": FINTECH})
    assert len(out["metrics"]) == 5 and out["peers"]


def test_batch_flags_bad_rows_and_keeps_them():
    rows = [dict(FINTECH, startup_id="A"), dict(FINTECH, startup_id="B", cash_balance=-1),
            dict(PRESETS["Healthy SaaS"], startup_id="C"), dict(FINTECH, startup_id="D", sector="Crypto")]
    out = post("/batch-score", {"rows": rows})
    assert out["summary"] == {"total": 4, "ok": 2, "errors": 2, "bands": out["summary"]["bands"]}
    by_id = {r["startup_id"]: r for r in out["rows"]}
    assert "Cash balance" in by_id["B"]["error"] and "Sector" in by_id["D"]["error"]
    assert by_id["A"]["probability"] is not None


def test_model_lab_contents():
    m = client.get("/model-lab").json()
    assert m["synthetic"] is True
    assert set(m["roc_curves_cv"]) == {"Logistic Regression", "Random Forest", "HistGradientBoosting"}
    assert m["calibration_before"] and m["calibration_points"]
    assert "precision_mean" in m["cross_validation"]["metrics"]["Random Forest"]


def test_dataset_sample_has_no_labels():
    out = client.get("/dataset?limit=50").json()
    assert len(out["rows"]) == 50 and "failed_within_24m" not in out["rows"][0]


def test_train_rejects_bad_rows():
    r = client.post("/train", json={"source": "rows", "rows": [{"a": 1}]})
    assert r.status_code == 422
