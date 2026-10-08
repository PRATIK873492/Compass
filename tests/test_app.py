"""Headless Streamlit AppTest checks for app.py."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
APP = str(ROOT / "app.py")
TABS = ["Analyze", "What-If", "Peer Benchmark", "Batch Screening", "Model & Data"]


def _markdown(at: AppTest) -> str:
    return "\n".join(m.value for m in at.markdown)


def _start(preset: str | None = None) -> AppTest:
    at = AppTest.from_file(APP, default_timeout=120)
    at.run()
    if preset:
        at.sidebar.selectbox(key="preset").set_value(preset).run()
    return at


def test_empty_state():
    at = _start()
    assert not at.exception
    assert [t.label for t in at.tabs] == TABS
    assert "Pick a preset or enter your numbers to see your risk." in _markdown(at)
    assert "SYNTHETIC" in _markdown(at)


@pytest.mark.parametrize("preset", ["Healthy SaaS", "Struggling D2C", "High-growth Fintech"])
def test_presets_render_all_tabs(preset):
    at = _start(preset)
    assert not at.exception, [e.value for e in at.exception]
    assert not at.error, [e.value for e in at.error]
    md = _markdown(at)
    for text in ["Failure risk", "Funding readiness", "Why this result", "Runway forecast", "Action plan",
                 "Effect of each lever alone", "Percentile vs peers", "Model comparison", "Synthetic data disclosure"]:
        assert text in md, text
    assert len(at.get("plotly_chart")) >= 10


def test_validation_error_names_field_and_range():
    at = _start("Healthy SaaS")
    at.sidebar.number_input(key="in_monthly_churn_pct").set_value(150.0).run()
    assert not at.exception
    assert any("Monthly churn must be between 0 and 100" in e.value for e in at.error)


def test_what_if_updates_live():
    at = _start("High-growth Fintech")
    before = [m.value for m in at.markdown if 'class="sc-delta"' in m.value]
    assert before and "no change" in before[0]
    at.slider(key="lever_churn").set_value(-50).run()
    after = [m.value for m in at.markdown if 'class="sc-delta"' in m.value]
    assert after and "lower risk" in after[0], after
    at.button[0].click().run()  # Reset levers
    assert at.session_state["lever_churn"] == 0


def test_unknown_fields_lower_confidence():
    at = _start("Healthy SaaS")
    at.sidebar.multiselect(key="unknown").set_value(["cac", "ltv"]).run()
    assert not at.exception
    assert "2 fields missing: lower confidence." in _markdown(at)


def test_ui_metrics_equal_metrics_json():
    m = json.loads((ROOT / "models" / "metrics.json").read_text(encoding="utf-8"))
    md = _markdown(_start())
    for key in ["roc_auc", "pr_auc", "brier", "recall"]:
        assert f"{m['test_metrics'][key]:.3f}" in md, key
    assert m["selection"]["selected_model"] in md
