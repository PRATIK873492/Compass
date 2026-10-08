"""Startup Compass: SYNTHETIC-data startup survival-risk and funding-readiness dashboard.

Run with:  streamlit run app.py
"""

from __future__ import annotations

import io
import math
from datetime import date
from typing import Any, Callable

import pandas as pd
import streamlit as st

st.set_page_config(
    page_title="Startup Compass",
    page_icon="🧭",
    layout="wide",
    initial_sidebar_state="expanded",
)

from src import backend as B  # noqa: E402
from src.schema import INPUT_FIELDS, LABELS, OPTIONAL_FIELDS, SECTORS, STAGES  # noqa: E402
from ui import charts  # noqa: E402
from ui import state as S  # noqa: E402
from ui import theme as T  # noqa: E402

st.markdown(T.CSS, unsafe_allow_html=True)
st.markdown(T.banner(), unsafe_allow_html=True)
S.init_state()


# --------------------------------------------------------------------------- helpers

def _freeze(d: dict[str, Any]) -> tuple:
    out = []
    for k in sorted(d):
        v = d[k]
        if isinstance(v, float) and math.isnan(v):
            v = None
        out.append((k, v))
    return tuple(out)


@st.cache_resource(show_spinner=False)
def model_artifact() -> dict[str, Any]:
    return B.load_artifact()


@st.cache_data(show_spinner=False)
def dataset_summary() -> dict[str, Any]:
    return B.load_metrics()["dataset"]


@st.cache_data(show_spinner=False, max_entries=512)
def score(frozen: tuple) -> dict[str, Any]:
    return B.predict_one(dict(frozen))


@st.cache_data(show_spinner=False, max_entries=256)
def cached_forecast(frozen: tuple) -> dict[str, Any]:
    return B.runway_forecast(dict(frozen), 24)


@st.cache_data(show_spinner=False, max_entries=256)
def cached_plan(frozen: tuple) -> list[dict[str, Any]]:
    return B.action_plan(dict(frozen))


@st.cache_data(show_spinner=False, max_entries=256)
def cached_peers(frozen: tuple) -> dict[str, Any]:
    return B.peer_percentiles(dict(frozen))


@st.cache_data(show_spinner=False, max_entries=1024)
def cached_levers(frozen: tuple, burn: float, churn: float, growth: float, cac: float) -> list[dict[str, Any]]:
    return B.lever_effects(dict(frozen), burn, churn, growth, cac)


@st.cache_data(show_spinner=False)
def cached_metrics() -> dict[str, Any]:
    return B.load_metrics()


@st.cache_data(show_spinner=False, max_entries=16)
def cached_batch(raw: bytes) -> pd.DataFrame:
    df = pd.read_csv(io.BytesIO(raw))
    return B.predict_batch(df)


def guarded(fn: Callable[..., Any], *args: Any, message: str = "This section could not be computed.") -> Any:
    """Run fn; on any failure show a friendly message, never a traceback."""
    try:
        return fn(*args)
    except Exception as exc:  # noqa: BLE001 - user-facing guard
        detail = str(exc).strip() or exc.__class__.__name__
        st.error(f"{message} {detail}")
        return None


def html(markup: str) -> None:
    st.markdown(markup, unsafe_allow_html=True)


def card(name: str):
    return st.container(border=True, key=f"card_{name}")


def empty_state() -> None:
    html(
        '<div class="sc-card"><div class="sc-section">No startup yet</div>'
        '<div class="sc-body">Pick a preset or enter your numbers to see your risk.</div></div>'
    )


def plot(fig, key: str) -> None:
    fig.update_layout(template="compass", paper_bgcolor=T.CARD, plot_bgcolor=T.CARD)
    st.plotly_chart(fig, width="stretch", theme=None, config=charts.CONFIG, key=key)


def cashout_text(months: float, profitable: bool) -> str:
    if profitable or months >= 60:
        return "Cash-flow positive or 5+ years of runway at current burn."
    today = date.today()
    total = today.year * 12 + (today.month - 1) + int(months)
    return f"Cash runs out around {date(total // 12, total % 12 + 1, 1):%b %Y} at current net burn."


# --------------------------------------------------------------------------- sidebar

def render_sidebar() -> None:
    with st.sidebar:
        html(T.wordmark())
        st.selectbox(
            "Preset",
            S.PRESET_NAMES,
            index=None,
            key="preset",
            placeholder="Choose a preset",
            on_change=S.apply_preset,
            help="Load an example startup. Editing any field switches to Custom.",
        )
        st.multiselect(
            "I don't know these",
            OPTIONAL_FIELDS,
            key="unknown",
            format_func=lambda f: S.OPTIONAL_LABELS[f],
            help="Optional fields left out are filled from training medians and lower confidence.",
        )
        unknown = set(st.session_state.get("unknown", []))
        for group, fields in S.GROUPS.items():
            with st.expander(group, expanded=group == "Business"):
                for field in fields:
                    if field == "sector":
                        st.selectbox("Sector", SECTORS, index=None, key=S.key(field), placeholder="Select sector",
                                     on_change=S.mark_custom, help="Primary industry of the startup.")
                    elif field == "stage":
                        st.selectbox("Stage", STAGES, index=None, key=S.key(field), placeholder="Select stage",
                                     on_change=S.mark_custom, help="Latest funding stage reached.")
                    else:
                        label, help_text, step, fmt, _ = S.FIELD_META[field]
                        is_int = field in S.INTEGER_FIELDS
                        current = st.session_state.get(S.key(field))
                        if current is not None:
                            st.session_state[S.key(field)] = int(current) if is_int else float(current)
                        st.number_input(
                            label,
                            step=int(step) if is_int else float(step),
                            format=fmt,
                            key=S.key(field),
                            help=help_text + (" Optional." if field in OPTIONAL_FIELDS else ""),
                            disabled=field in unknown,
                            placeholder="Not provided" if field in unknown else None,
                            on_change=S.mark_custom,
                        )

        result = st.session_state.get("result")
        d = st.session_state.get("input") or {}
        if result:
            html(
                '<div class="sc-card" style="margin-top:16px"><div class="sc-kpi-label">Current startup</div>'
                f'<div class="sc-body" style="font-weight:600">{T.esc(d.get("sector"))} · {T.esc(d.get("stage"))}</div>'
                f'<div style="margin-top:8px">{T.badge(result["band"])}</div></div>'
            )
        else:
            html('<div class="sc-card" style="margin-top:16px"><div class="sc-kpi-label">Current startup</div>'
                 '<div class="sc-caption">Nothing scored yet.</div></div>')


# --------------------------------------------------------------------------- compute

def compute() -> tuple[str, Any]:
    """Return (status, payload). status in {'empty','error','ok'}."""
    d = S.collect_input()
    if S.is_empty(d):
        return "empty", None
    clean, errors = B.validate_input(d)
    if errors:
        return "error", errors
    with st.spinner("Scoring your startup..."):
        try:
            result = score(_freeze(clean))
        except Exception as exc:  # noqa: BLE001
            return "error", [f"Scoring failed: {exc}"]
    st.session_state["input"] = clean
    return "ok", result


# --------------------------------------------------------------------------- tabs

def tab_analyze(clean: dict[str, Any], result: dict[str, Any]) -> None:
    frozen = _freeze(clean)
    forecast = guarded(cached_forecast, frozen, message="Runway forecast unavailable.")
    c1, c2, c3 = st.columns([5, 3, 4])
    with c1:
        with card("gauge"):
            html(T.section("Failure risk", "Probability of failing within 24 months"))
            plot(charts.compass_gauge(result["probability"], result["band"], height=210), "gauge_main")
            html(T.gauge_readout(result["probability"], result["band"]))
            if result["missing_count"]:
                html(f'<div class="sc-caption">{result["missing_count"]} fields missing: lower confidence.</div>')
    with c2:
        with card("ring"):
            html(T.section("Funding readiness", "0-100 composite score"))
            plot(charts.readiness_ring(result["readiness_score"]), "ring_main")
    with c3:
        profitable = bool(forecast and forecast.get("profitable"))
        runway = result["runway_months"]
        value = "60+ months" if runway >= 60 else T.fmt_months(runway)
        html(T.kpi_card("Runway at current net burn", value, cashout_text(runway, profitable)))
        html(T.kpi_card("Net burn", T.fmt_lakh(result.get("net_burn")), "Monthly burn minus gross profit"))

    c4, c5 = st.columns([5, 7])
    with c4:
        with card("radar"):
            html(T.section("Sub-scores", "Each 0-100; 50 when an input is missing"))
            plot(charts.radar(result["subscores"]), "radar_main")
    with c5:
        with card("why"):
            html(T.section("Why this result", "Each factor group swapped for the training median; change in points"))
            raising, reducing = st.columns(2)
            with raising:
                html(f'<div class="sc-kpi-label" style="color:{T.RISK_TEXT["High"]};font-weight:600">Raising risk</div>')
                items = result["top_negative"] or [{"sentence": "No factor is raising risk."}]
                html('<ul class="sc-why">' + "".join(f"<li>{T.esc(i['sentence'])}</li>" for i in items) + "</ul>")
            with reducing:
                html(f'<div class="sc-kpi-label" style="color:{T.RISK_TEXT["Low"]};font-weight:600">Reducing risk</div>')
                items = result["top_positive"] or [{"sentence": "No factor is reducing risk."}]
                html('<ul class="sc-why">' + "".join(f"<li>{T.esc(i['sentence'])}</li>" for i in items) + "</ul>")
            for w in result.get("warnings", []):
                html(f'<div class="sc-caption" style="margin-top:8px">{T.esc(w)}</div>')

    with card("runway"):
        html(T.section("Runway forecast", "Next 24 months, constant net burn (conservative)"))
        if forecast:
            plot(charts.runway_chart(forecast), "runway_main")

    with card("plan"):
        html(T.section("Action plan", "Model estimates, not guaranteed outcomes. Each action re-runs the model."))
        plan = guarded(cached_plan, frozen, message="Action plan unavailable.")
        if plan:
            biggest = max(abs(p["risk_change_pp"]) for p in plan) or 1.0
            table = pd.DataFrame({
                "Action": [p["action"] for p in plan],
                "Risk change (pp)": [p["risk_change_pp"] for p in plan],
                "Impact": [abs(p["risk_change_pp"]) / biggest * 100 for p in plan],
                "Note": [p["note"] for p in plan],
            })
            st.dataframe(
                table, hide_index=True, width="stretch",
                column_config={
                    "Risk change (pp)": st.column_config.NumberColumn(format="%+.1f"),
                    "Impact": st.column_config.ProgressColumn(min_value=0, max_value=100, format=" "),
                    "Note": st.column_config.TextColumn(width="large"),
                },
            )


def tab_whatif(clean: dict[str, Any], result: dict[str, Any]) -> None:
    left, right = st.columns([4, 8])
    with left:
        with card("levers"):
            html(T.section("Levers", "Applied to a copy of your inputs; the form is unchanged"))
            st.slider("Monthly burn change (%)", -50, 50, key="lever_burn", step=1,
                      help="Scale monthly burn up or down.")
            st.slider("Monthly churn change (%)", -80, 50, key="lever_churn", step=1,
                      help="Scale churn. LTV is rescaled by old/new churn to keep unit economics consistent.")
            st.slider("MoM growth change (points)", -10, 10, key="lever_growth", step=1,
                      help="Add or subtract percentage points of monthly growth.")
            st.slider("CAC change (%)", -50, 50, key="lever_cac", step=1, help="Scale customer acquisition cost.")
            st.button("Reset levers", on_click=S.reset_levers, width="stretch")
    ss = st.session_state
    levers = (float(ss["lever_burn"]), float(ss["lever_churn"]), float(ss["lever_growth"]), float(ss["lever_cac"]))
    scenario_input = B.apply_levers(clean, *levers)
    scenario = guarded(score, _freeze(scenario_input), message="Scenario could not be scored.")
    with right:
        if scenario is None:
            return
        with card("compare"):
            g1, g2 = st.columns(2)
            with g1:
                plot(charts.compass_gauge(result["probability"], result["band"], title="Baseline"), "gauge_base")
                html(T.gauge_readout(result["probability"], result["band"]))
            with g2:
                plot(charts.compass_gauge(scenario["probability"], scenario["band"], title="Scenario"), "gauge_scen")
                html(T.gauge_readout(scenario["probability"], scenario["band"]))
            delta = (scenario["probability"] - result["probability"]) * 100
            html(f'<div style="text-align:center;margin:4px 0 8px 0">{T.delta_chip(delta)}</div>')
            html(f'<div class="sc-caption" style="text-align:center;margin:0 auto">Readiness {result["readiness_score"]:.0f} → '
                 f'{scenario["readiness_score"]:.0f}. Runway {T.fmt_months(result["runway_months"])} → '
                 f'{T.fmt_months(scenario["runway_months"])}.</div>')
        with card("lever_effects"):
            html(T.section("Effect of each lever alone", "Model estimates, not guaranteed outcomes"))
            effects = guarded(cached_levers, _freeze(clean), *levers, message="Lever effects unavailable.")
            if effects:
                plot(charts.lever_bars(effects), "lever_bars")


def tab_peers(clean: dict[str, Any]) -> None:
    peers = guarded(cached_peers, _freeze(clean), message="Peer benchmark unavailable.")
    if not peers:
        return
    chips = T.chip(f"Sector: {peers['sector']}") + T.chip(f"Stage: {peers['stage']}") + T.chip(f"{peers['n']:,} peers")
    html(f"<div>{chips}</div>")
    if peers.get("fallback"):
        html('<div class="sc-caption">Fewer than 30 peers in this sector and stage, so all sectors at this stage are used.</div>')
    c1, c2 = st.columns([6, 6])
    with c1:
        with card("pct"):
            html(T.section("Percentile vs peers", "Higher is better on every bar; for churn and burn multiple lower raw values rank higher"))
            plot(charts.percentile_bars(peers["metrics"]), "pct_bars")
            rows = []
            for m in peers["metrics"]:
                rows.append({
                    "Metric": m["label"],
                    "You": "Not provided" if m["value"] is None else f"{m['value']:.1f} {m['unit']}",
                    "Peer median": "n/a" if m["median"] is None else f"{m['median']:.1f} {m['unit']}",
                    "Standing": "No data" if m["better_than"] is None else f"Better than {m['better_than']:.0f}% of peers",
                })
            st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch")
    with c2:
        with card("scatter"):
            html(T.section("Runway vs churn", "Grey: SYNTHETIC peers. Teal diamond: this startup."))
            plot(charts.peer_scatter(peers["peers"], peers["you"]), "peer_scatter")


def tab_batch() -> None:
    top_l, top_r = st.columns([8, 4])
    with top_l:
        upload = st.file_uploader("Upload a CSV of startups", type=["csv"],
                                  help="One row per startup, same columns as the template. Money in INR lakh.")
    with top_r:
        template = B.batch_template()
        st.download_button("Download template", template.to_csv(index=False).encode(), "startup_compass_template.csv",
                           "text/csv", width="stretch")
        html('<div class="sc-caption">Columns: startup_id, ' + T.esc(", ".join(INPUT_FIELDS)) + ".</div>")
    if upload is None:
        html('<div class="sc-card"><div class="sc-body">Upload a CSV to screen many startups at once. '
             'Rows with problems are flagged with reasons, never dropped.</div></div>')
        return
    scored = guarded(cached_batch, upload.getvalue(), message="Could not read that file.")
    if scored is None:
        return
    errors = scored[scored["error"].astype(str) != ""]
    ok = scored[scored["error"].astype(str) == ""]
    html(
        '<div class="sc-card"><div class="sc-section">Validation</div>'
        f'<div class="sc-body"><span class="sc-num" style="font-weight:600">{len(ok):,}</span> rows ok · '
        f'<span class="sc-num" style="font-weight:600;color:{T.RISK_TEXT["High"] if len(errors) else T.INK}">{len(errors):,}</span> rows with errors</div></div>'
    )
    b1, b2, b3 = st.columns(3)
    for col, band in zip((b1, b2, b3), ("Low", "Medium", "High")):
        with col:
            count = int((ok["band"] == band).sum())
            html(T.kpi_card(f"{band} risk", f"{count:,}", None, f'<div style="margin-top:6px">{T.badge(band)}</div>'))
    f1, f2 = st.columns([4, 8])
    with f1:
        bands = st.multiselect("Band filter", ["Low", "Medium", "High"], default=["Low", "Medium", "High"])
    with f2:
        query = st.text_input("Search startup_id", placeholder="e.g. ST-0001")
    view = ok[ok["band"].isin(bands)]
    if query and "startup_id" in view.columns:
        view = view[view["startup_id"].astype(str).str.contains(query, case=False, regex=False)]
    view = view.sort_values("probability", ascending=False)
    cols = [c for c in ["startup_id", "probability", "band", "readiness_score", "runway_months"] if c in view.columns]
    st.dataframe(
        view[cols], hide_index=True, width="stretch",
        column_config={
            "probability": st.column_config.ProgressColumn("Failure probability", min_value=0, max_value=1, format="percent"),
            "band": st.column_config.TextColumn("Band"),
            "readiness_score": st.column_config.NumberColumn("Readiness", format="%.0f"),
            "runway_months": st.column_config.NumberColumn("Runway (months)", format="%.1f"),
        },
    )
    st.download_button("Download results", scored.to_csv(index=False).encode(), "startup_compass_results.csv", "text/csv")
    with st.expander(f"Rows with errors ({len(errors)})", expanded=bool(len(errors))):
        if len(errors):
            show = [c for c in ["startup_id", "error"] if c in errors.columns]
            st.dataframe(errors[show], hide_index=True, width="stretch")
        else:
            html('<div class="sc-caption">No rows with errors.</div>')


def tab_model() -> None:
    m = cached_metrics()
    tm = m["test_metrics"]
    cols = st.columns(4)
    for col, (label, k) in zip(cols, [("ROC-AUC", "roc_auc"), ("PR-AUC", "pr_auc"), ("Brier score", "brier"), ("Recall (failing)", "recall")]):
        with col:
            html(T.kpi_card(label, f"{tm[k]:.3f}", "Held-out test set, SYNTHETIC"))
    html(
        '<div class="sc-card" style="border-left:4px solid #D9901A"><div class="sc-section">Synthetic data disclosure</div>'
        '<div class="sc-body">Every record and every failure label in this demo is SYNTHETIC, generated by '
        '<code>src/data_generation.py</code>. These metrics show how well the model recovers the generated labels. '
        'They do not show real-world predictive performance. Outputs are probabilities for decision support, never guarantees.</div></div>'
    )
    c1, c2 = st.columns([7, 5])
    with c1:
        with card("cv"):
            html(T.section("Model comparison", f"{m['cross_validation']['folds']}-fold cross-validation on the training split, mean ± std"))
            rows = []
            for name, r in m["cross_validation"]["metrics"].items():
                rows.append({"Model": name,
                             **{lbl: f"{r[k + '_mean']:.3f} ± {r[k + '_std']:.3f}" for lbl, k in
                                [("ROC-AUC", "roc_auc"), ("PR-AUC", "pr_auc"), ("F1", "f1"), ("Recall", "recall"), ("Brier", "brier")]}})
            st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch")
            html(f'<div class="sc-caption">Selected: <b>{T.esc(m["selection"]["selected_model"])}</b>. '
                 f'{T.esc(m["selection"]["explanation"])} Calibrated with isotonic regression (5-fold).</div>')
    with c2:
        d = dataset_summary()
        with card("dataset"):
            html(T.section("Dataset"))
            html(
                '<div class="sc-body">'
                f'<div>{d["rows"]:,} SYNTHETIC startups, {d["columns"]} columns</div>'
                f'<div>{d["generated_failure_rate"] * 100:.1f}% generated failure labels</div>'
                f'<div>Train {d["train_rows"]:,} / test {d["test_rows"]:,} (stratified, seed {d["random_seed"]})</div>'
                '<div>4-8% missing values in five optional fields; 25 burn outliers (x10)</div>'
                '<div>Money in INR lakh</div></div>'
            )
    c3, c4 = st.columns(2)
    with c3:
        with card("calib"):
            html(T.section("Calibration curve", "Held-out test set, 10 quantile bins"))
            plot(charts.calibration_chart(m["calibration_points"]), "calib")
    with c4:
        with card("imp"):
            html(T.section("Permutation importance", "Held-out test set, ROC-AUC drop when a feature is shuffled"))
            plot(charts.importance_chart(m["permutation_importance"]), "importance")
    with card("limits"):
        html(T.section("Limitations"))
        html('<ul class="sc-body">' + "".join(f"<li>{T.esc(x)}</li>" for x in m["limitations"]) + "</ul>")


# --------------------------------------------------------------------------- page

guarded(model_artifact, message="The trained model could not be loaded.")
status, payload = compute()
st.session_state["result"] = payload if status == "ok" else None
render_sidebar()

html('<div class="sc-title">Startup Compass</div>'
     '<div class="sc-caption" style="margin-bottom:12px">Survival risk and funding readiness for early-stage startups. '
     'Money in INR lakh. Built on SYNTHETIC data.</div>')

if status == "error":
    for e in payload:
        st.error(e)

tabs = st.tabs(["Analyze", "What-If", "Peer Benchmark", "Batch Screening", "Model & Data"])
clean = st.session_state.get("input") if status == "ok" else None
with tabs[0]:
    if status == "ok":
        guarded(tab_analyze, clean, payload, message="Analyze view failed.")
    elif status == "empty":
        empty_state()
with tabs[1]:
    if status == "ok":
        guarded(tab_whatif, clean, payload, message="What-If view failed.")
    elif status == "empty":
        empty_state()
with tabs[2]:
    if status == "ok":
        guarded(tab_peers, clean, message="Peer view failed.")
    elif status == "empty":
        empty_state()
with tabs[3]:
    guarded(tab_batch, message="Batch view failed.")
with tabs[4]:
    guarded(tab_model, message="Model view failed.")
