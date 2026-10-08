"""Plotly figures for Startup Compass. All charts share the 'compass' template."""

from __future__ import annotations

import numpy as np
import plotly.graph_objects as go
import plotly.io as pio

from ui.theme import (
    BODY_FONT,
    CARD,
    GREY_DOT,
    HAIRLINE,
    HEAD_FONT,
    INK,
    MUTED,
    RISK,
    RISK_TEXT,
    TEAL,
)

CONFIG = {"displayModeBar": False, "responsive": True}

pio.templates["compass"] = go.layout.Template(
    layout=dict(
        font=dict(family=BODY_FONT, size=13, color=INK),
        paper_bgcolor=CARD,
        plot_bgcolor=CARD,
        colorway=[TEAL, MUTED, RISK["Medium"], RISK["High"], RISK["Low"]],
        margin=dict(l=8, r=8, t=8, b=8),
        xaxis=dict(automargin=True, gridcolor=HAIRLINE, zerolinecolor=HAIRLINE, linecolor=HAIRLINE, tickfont=dict(color=MUTED, size=12)),
        yaxis=dict(automargin=True, gridcolor=HAIRLINE, zerolinecolor=HAIRLINE, linecolor=HAIRLINE, tickfont=dict(color=MUTED, size=12)),
        hoverlabel=dict(font=dict(family=BODY_FONT, size=12), bgcolor=CARD, bordercolor=HAIRLINE),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, x=0, font=dict(size=12, color=MUTED)),
    )
)
pio.templates.default = "compass"


def _hex_to_rgb(color: str) -> tuple[int, int, int]:
    color = color.lstrip("#")
    return tuple(int(color[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _mix(a: str, b: str, t: float) -> str:
    ra, rb = _hex_to_rgb(a), _hex_to_rgb(b)
    return "rgb({},{},{})".format(*[round(x + (y - x) * t) for x, y in zip(ra, rb)])


def _dial_color(p: float) -> str:
    if p <= 0.5:
        return _mix(RISK["Low"], RISK["Medium"], p / 0.5)
    return _mix(RISK["Medium"], RISK["High"], (p - 0.5) / 0.5)


def compass_gauge(probability: float, band: str, title: str | None = None, height: int = 190) -> go.Figure:
    """Half-circle compass dial: Safe (left, green) to Critical (right, red).

    The probability readout is rendered by theme.gauge_readout directly beneath
    the needle pivot, so it stays aligned at every width.
    """
    p = float(np.clip(probability, 0, 1))
    segments = 60
    width = 180 / segments
    centres = [180 - (i + 0.5) * width for i in range(segments)]
    colors = [_dial_color((i + 0.5) / segments) for i in range(segments)]

    fig = go.Figure()
    fig.add_trace(go.Barpolar(
        r=[0.16] * segments, base=0.84, theta=centres, width=[width] * segments,
        marker=dict(color=colors, line=dict(width=0)), hoverinfo="skip", showlegend=False,
    ))
    # Ticks every 10 percentage points
    for tick in np.linspace(0, 1, 11):
        angle = 180 - tick * 180
        major = round(tick * 10) % 5 == 0
        fig.add_trace(go.Scatterpolar(
            r=[0.74 if major else 0.78, 0.82], theta=[angle, angle], mode="lines",
            line=dict(color=INK if major else MUTED, width=1.5 if major else 1), hoverinfo="skip", showlegend=False,
        ))
    angle = 180 - p * 180
    fig.add_trace(go.Scatterpolar(
        r=[0, 0.78], theta=[angle, angle], mode="lines",
        line=dict(color=INK, width=3), hoverinfo="skip", showlegend=False,
    ))
    fig.add_trace(go.Scatterpolar(
        r=[0], theta=[0], mode="markers", marker=dict(size=12, color=INK, line=dict(color=CARD, width=2)),
        hoverinfo="skip", showlegend=False,
    ))
    fig.update_layout(
        height=height,
        margin=dict(l=12, r=12, t=30 if title else 6, b=0),
        polar=dict(
            sector=[0, 180], hole=0.0, bgcolor=CARD,
            radialaxis=dict(visible=False, range=[0, 1]),
            angularaxis=dict(visible=False),
            domain=dict(x=[0, 1], y=[0, 1]),
        ),
        annotations=[dict(text=title, x=0.5, y=1.0, yshift=26, xref="paper", yref="paper", showarrow=False,
                          font=dict(family=HEAD_FONT, size=15, color=INK))] if title else [],
    )
    return fig


def readiness_ring(score: float, height: int = 230) -> go.Figure:
    s = float(np.clip(score, 0, 100))
    fig = go.Figure(go.Pie(
        values=[s, 100 - s], hole=0.78, sort=False, direction="clockwise", rotation=0,
        marker=dict(colors=[TEAL, HAIRLINE], line=dict(width=0)), textinfo="none", hoverinfo="skip",
        showlegend=False,
    ))
    fig.update_layout(
        height=height, margin=dict(l=10, r=10, t=10, b=10),
        annotations=[
            dict(text=f"{s:.0f}", x=0.5, y=0.55, showarrow=False, font=dict(family=HEAD_FONT, size=40, color=INK)),
            dict(text="out of 100", x=0.5, y=0.36, showarrow=False, font=dict(size=12, color=MUTED)),
        ],
    )
    return fig


def radar(subscores: dict[str, float], height: int = 300) -> go.Figure:
    labels = list(subscores)
    values = [float(subscores[k]) for k in labels]
    fig = go.Figure(go.Scatterpolar(
        r=values + values[:1], theta=labels + labels[:1], fill="toself",
        fillcolor="rgba(14,124,123,0.16)", line=dict(color=TEAL, width=2), mode="lines+markers",
        marker=dict(size=6, color=TEAL), hovertemplate="%{theta}: %{r:.0f}/100<extra></extra>",
    ))
    fig.update_layout(
        height=height, margin=dict(l=48, r=48, t=24, b=24), showlegend=False,
        polar=dict(
            bgcolor=CARD,
            radialaxis=dict(range=[0, 100], tickvals=[25, 50, 75, 100], tickfont=dict(size=10, color=MUTED),
                            gridcolor=HAIRLINE, linecolor=HAIRLINE, angle=90),
            angularaxis=dict(gridcolor=HAIRLINE, linecolor=HAIRLINE, tickfont=dict(size=12, color=INK)),
        ),
    )
    return fig


def runway_chart(forecast: dict, height: int = 320) -> go.Figure:
    months = forecast["months"]
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=months, y=forecast["current"], name="Current plan", mode="lines",
        line=dict(color=MUTED, width=2), fill="tozeroy", fillcolor="rgba(91,107,127,0.10)",
        hovertemplate="Month %{x}: Rs %{y:,.1f} L<extra>Current</extra>",
    ))
    fig.add_trace(go.Scatter(
        x=months, y=forecast["improved"], name=f"Improved: {forecast['improved_label']}", mode="lines",
        line=dict(color=TEAL, width=2.5), fill="tozeroy", fillcolor="rgba(14,124,123,0.10)",
        hovertemplate="Month %{x}: Rs %{y:,.1f} L<extra>Improved</extra>",
    ))
    fig.add_hline(y=0, line=dict(color=INK, width=1))
    for key, color, label in (("cashout_current", RISK_TEXT["High"], "Cash-out (current)"),
                              ("cashout_improved", TEAL, "Cash-out (improved)")):
        month = forecast.get(key)
        if month is not None:
            fig.add_vline(x=month, line=dict(color=color, width=1.5, dash="dash"))
            fig.add_annotation(x=month, y=1, yref="paper", text=f"{label}: month {month}", showarrow=False,
                               xanchor="left", yanchor="top", xshift=4, font=dict(size=11, color=color),
                               bgcolor=CARD)
    fig.update_layout(
        height=height, margin=dict(l=64, r=16, t=36, b=56),
        xaxis=dict(title=dict(text="Months from today", font=dict(size=12, color=MUTED)), dtick=3),
        yaxis=dict(title=dict(text="Cash (Rs lakh)", font=dict(size=12, color=MUTED))),
        hovermode="x unified",
    )
    return fig


def percentile_bars(metrics: list[dict], height: int | None = None) -> go.Figure:
    labels = [m["label"] for m in metrics][::-1]
    raw = [m["better_than"] for m in metrics][::-1]
    values = [0.0 if v is None else float(v) for v in raw]
    text = ["No data provided" if v is None else f"Better than {v:.0f}% of peers" for v in raw]
    fig = go.Figure()
    fig.add_trace(go.Bar(
        y=labels, x=[100] * len(labels), orientation="h", marker=dict(color="#EEF2F5"),
        hoverinfo="skip", showlegend=False, width=0.56,
    ))
    fig.add_trace(go.Bar(
        y=labels, x=values, orientation="h", marker=dict(color=TEAL), text=text, textposition="outside",
        cliponaxis=False, textfont=dict(size=12, color=INK), showlegend=False, width=0.56,
        hovertemplate="%{y}: better than %{x:.0f}% of peers<extra></extra>",
    ))
    fig.add_vline(x=50, line=dict(color=INK, width=1.5))
    fig.add_annotation(x=50, y=1, yref="paper", text="Peer median", showarrow=False, yanchor="bottom",
                       font=dict(size=11, color=MUTED))
    fig.update_layout(
        barmode="overlay", height=height or 60 + 52 * len(labels), margin=dict(l=8, r=150, t=28, b=40),
        xaxis=dict(range=[0, 100], ticksuffix="%", showgrid=False),
        yaxis=dict(showgrid=False, tickfont=dict(size=13, color=INK)),
    )
    return fig


def peer_scatter(peers, you: dict, height: int = 360) -> go.Figure:
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=peers["runway_months"], y=peers["monthly_churn_pct"], mode="markers", name="Peers",
        marker=dict(size=6, color=GREY_DOT, opacity=0.7),
        hovertemplate="Runway %{x:.1f} months, churn %{y:.1f}%<extra>Peer</extra>",
    ))
    if you.get("monthly_churn_pct") is None:
        fig.update_layout(height=height, margin=dict(l=64, r=16, t=36, b=56),
                          xaxis=dict(title=dict(text="Runway (months)", font=dict(size=12, color=MUTED))),
                          yaxis=dict(title=dict(text="Monthly churn (%)", font=dict(size=12, color=MUTED))))
        return fig
    fig.add_trace(go.Scatter(
        x=[you["runway_months"]], y=[you["monthly_churn_pct"]], mode="markers+text", name="This startup",
        marker=dict(symbol="diamond", size=16, color=TEAL, line=dict(color=INK, width=1.5)),
        text=["This startup"], textposition="top center", textfont=dict(color=INK, size=12),
        hovertemplate="Runway %{x:.1f} months, churn %{y:.1f}%<extra>This startup</extra>",
    ))
    fig.update_layout(
        height=height, margin=dict(l=64, r=16, t=36, b=56),
        xaxis=dict(title=dict(text="Runway (months)", font=dict(size=12, color=MUTED))),
        yaxis=dict(title=dict(text="Monthly churn (%)", font=dict(size=12, color=MUTED))),
    )
    return fig


def lever_bars(effects: list[dict], height: int = 260) -> go.Figure:
    labels = [e["lever"] for e in effects][::-1]
    values = [float(e["delta_pp"]) for e in effects][::-1]
    colors = [RISK["Low"] if v < 0 else (RISK["High"] if v > 0 else MUTED) for v in values]
    text = [f"{v:+.1f} pts {'lower' if v < 0 else 'higher' if v > 0 else 'no change'}" for v in values]
    fig = go.Figure(go.Bar(
        y=labels, x=values, orientation="h", marker=dict(color=colors), text=text, textposition="outside",
        cliponaxis=False, textfont=dict(size=12, color=INK),
        hovertemplate="%{y}: %{x:+.1f} percentage points<extra></extra>",
    ))
    span = max([abs(v) for v in values] + [1.0]) * 1.6
    fig.add_vline(x=0, line=dict(color=INK, width=1))
    fig.update_layout(
        height=height, margin=dict(l=72, r=16, t=8, b=56), showlegend=False,
        xaxis=dict(range=[-span, span], title=dict(text="Risk change from this lever alone (points)",
                                                    font=dict(size=12, color=MUTED))),
    )
    return fig


def impact_bars(plan: list[dict], height: int | None = None) -> go.Figure:
    labels = [p["action"] for p in plan][::-1]
    values = [float(p["risk_change_pp"]) for p in plan][::-1]
    colors = [RISK["Low"] if v < 0 else RISK["High"] for v in values]
    fig = go.Figure(go.Bar(
        y=labels, x=values, orientation="h", marker=dict(color=colors),
        text=[f"{v:+.1f} pts" for v in values], textposition="outside", cliponaxis=False,
        hovertemplate="%{y}: %{x:+.1f} points<extra></extra>",
    ))
    fig.add_vline(x=0, line=dict(color=INK, width=1))
    lo = min(values + [0]) * 1.35 - 0.5
    hi = max(values + [0]) * 1.35 + 0.5
    fig.update_layout(height=height or 50 + 44 * len(labels), margin=dict(l=8, r=8, t=8, b=8),
                      xaxis=dict(range=[lo, hi], title=dict(text="Risk change (points)", font=dict(size=12, color=MUTED))))
    return fig


def calibration_chart(points: list[dict], height: int = 320) -> go.Figure:
    xs = [pt["predicted"] for pt in points]
    ys = [pt["observed"] for pt in points]
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=[0, 1], y=[0, 1], mode="lines", name="Perfect calibration",
                             line=dict(color=MUTED, dash="dot", width=1)))
    fig.add_trace(go.Scatter(x=xs, y=ys, mode="lines+markers", name="Model (test set)",
                             line=dict(color=TEAL, width=2.5), marker=dict(size=8, color=TEAL),
                             hovertemplate="Predicted %{x:.2f}, observed %{y:.2f}<extra></extra>"))
    fig.update_layout(height=height, margin=dict(l=64, r=16, t=36, b=56),
                      xaxis=dict(range=[0, 1], title=dict(text="Mean predicted probability", font=dict(size=12, color=MUTED))),
                      yaxis=dict(range=[0, 1], title=dict(text="Observed failure rate", font=dict(size=12, color=MUTED))))
    return fig


def importance_chart(items: list[dict], top: int = 12, height: int | None = None) -> go.Figure:
    data = sorted(items, key=lambda d: d["importance_mean"], reverse=True)[:top][::-1]
    fig = go.Figure(go.Bar(
        y=[d["feature"] for d in data], x=[d["importance_mean"] for d in data], orientation="h",
        marker=dict(color=TEAL), error_x=dict(type="data", array=[d.get("importance_std", 0) for d in data],
                                              color=MUTED, thickness=1),
        hovertemplate="%{y}: %{x:.4f} ROC-AUC drop<extra></extra>",
    ))
    fig.update_layout(height=height or 60 + 28 * len(data), margin=dict(l=8, r=16, t=8, b=56),
                      xaxis=dict(title=dict(text="Mean ROC-AUC drop when shuffled", font=dict(size=12, color=MUTED))))
    return fig
