"""Design tokens, global CSS and small HTML helpers for Startup Compass."""

from __future__ import annotations

import html

PAPER = "#F2F5F7"
CARD = "#FFFFFF"
INK = "#0F1B2D"
MUTED = "#5B6B7F"
HAIRLINE = "#D5DDE5"
TEAL = "#0E7C7B"
TEAL_HOVER = "#0A6362"
RISK = {"Low": "#1E9E5A", "Medium": "#D9901A", "High": "#D63F3F"}
# Darker variants of the risk hues for text on white, keeping contrast >= 4.5:1.
RISK_TEXT = {"Low": "#13703F", "Medium": "#8A5A0B", "High": "#B02A2A"}
RISK_TINT = {"Low": "#E6F4EC", "Medium": "#FBF1E0", "High": "#FBE7E7"}
GREY_DOT = "#A9B5C2"

HEAD_FONT = "'Space Grotesk', system-ui, -apple-system, 'Segoe UI', sans-serif"
BODY_FONT = "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"

COMPASS_SVG = f"""<svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
<circle cx="12" cy="12" r="10.5" stroke="{INK}" stroke-width="1.5"/>
<path d="M12 4.5 L14.2 12 L12 19.5 L9.8 12 Z" fill="{TEAL}"/>
<path d="M12 4.5 L14.2 12 L9.8 12 Z" fill="{INK}"/>
<circle cx="12" cy="12" r="1.3" fill="#FFFFFF"/>
</svg>"""

CSS = f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap');

:root {{
  --paper:{PAPER}; --card:{CARD}; --ink:{INK}; --muted:{MUTED}; --hairline:{HAIRLINE};
  --teal:{TEAL}; --teal-hover:{TEAL_HOVER};
}}

html, body, .stApp, [data-testid="stAppViewContainer"] {{
  background: var(--paper);
  color: var(--ink);
  font-family: {BODY_FONT};
  font-size: 14px;
}}
.stApp p, .stApp li, .stApp label, .stApp input, .stApp textarea,
.stApp [data-testid="stMarkdownContainer"] {{ font-family: {BODY_FONT}; }}
.stApp [data-testid="stIconMaterial"], .stApp .material-symbols-rounded {{ font-family: 'Material Symbols Rounded' !important; }}
.stApp h1, .stApp h2, .stApp h3, .stApp h4 {{ font-family: {HEAD_FONT}; color: var(--ink); letter-spacing: -0.01em; }}

/* Hide default Streamlit chrome */
[data-testid="stToolbarActions"], [data-testid="stDecoration"], [data-testid="stMainMenu"],
[data-testid="stAppDeployButton"], footer, #MainMenu, [data-testid="stStatusWidget"] {{ display: none !important; }}
/* Keep the header only as a carrier for the sidebar expand button */
header[data-testid="stHeader"] {{ background: transparent !important; height: 0 !important; min-height: 0 !important; }}
[data-testid="stExpandSidebarButton"], [data-testid="stSidebarCollapsedControl"] {{
  position: fixed !important; top: 44px; left: 8px; z-index: 999991; background: var(--card);
  border: 1px solid var(--hairline); border-radius: 10px; visibility: visible !important; display: flex !important;
}}

.block-container {{ max-width: 1280px; padding: 52px 24px 48px 24px; }}

/* Slim fixed banner */
.sc-banner {{
  position: fixed; top: 0; left: 0; right: 0; height: 36px; z-index: 999990;
  background: var(--paper); border-bottom: 1px solid var(--hairline);
  color: var(--muted); font-size: 12px; display: flex; align-items: center; justify-content: center;
  padding: 0 16px; text-align: center;
}}
.sc-banner b {{ color: var(--ink); font-weight: 600; }}

/* Sidebar */
section[data-testid="stSidebar"][aria-expanded="true"] {{ width: 320px !important; min-width: 320px !important; }}
section[data-testid="stSidebar"] {{ background: var(--card); border-right: 1px solid var(--hairline); }}
section[data-testid="stSidebar"] > div {{ padding-top: 44px; }}
.sc-wordmark {{ display: flex; align-items: center; gap: 10px; margin: 0 0 16px 0; }}
.sc-wordmark span {{ font-family: {HEAD_FONT}; font-weight: 700; font-size: 18px; color: var(--ink); }}

/* Type scale */
.sc-title {{ font-family: {HEAD_FONT}; font-size: 30px; font-weight: 700; line-height: 1.2; margin: 0 0 4px 0; color: var(--ink); }}
.sc-section {{ font-family: {HEAD_FONT}; font-size: 18px; font-weight: 600; margin: 0 0 8px 0; color: var(--ink); }}
.sc-caption {{ font-size: 12px; color: var(--muted); line-height: 1.5; max-width: 70ch; }}
.sc-body {{ font-size: 14px; line-height: 1.55; max-width: 70ch; color: var(--ink); }}
.sc-big {{ font-family: {HEAD_FONT}; font-size: 40px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.1; color: var(--ink); }}
.sc-num {{ font-family: {HEAD_FONT}; font-variant-numeric: tabular-nums; }}

/* Cards: st.container(border=True, key="card_*") gets class st-key-card_* */
[class*="st-key-card"] {{
  background: var(--card); border: 1px solid var(--hairline) !important; border-radius: 14px;
  padding: 20px; box-shadow: 0 1px 2px rgba(15,27,45,.06);
}}
.sc-card {{
  background: var(--card); border: 1px solid var(--hairline); border-radius: 14px; padding: 20px;
  box-shadow: 0 1px 2px rgba(15,27,45,.06); margin-bottom: 16px;
}}

/* Compass readout */
.sc-readout {{ display: flex; align-items: flex-start; justify-content: space-between; margin-top: -4px; }}
.sc-readout .sc-end {{ font-size: 12px; padding-top: 2px; min-width: 48px; }}
.sc-readout .sc-end:last-child {{ text-align: right; }}
.sc-band {{ text-align: center; font-size: 14px; font-weight: 600; margin-top: 2px; }}

/* KPI */
.sc-kpi-label {{ font-size: 12px; color: var(--muted); margin-bottom: 4px; }}
.sc-kpi-sub {{ font-size: 12px; color: var(--muted); margin-top: 6px; }}

/* Badge + chip */
.sc-badge {{ display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 2px 10px;
  font-size: 12px; font-weight: 600; border: 1px solid currentColor; }}
.sc-badge::before {{ content: ""; width: 8px; height: 8px; border-radius: 50%; background: currentColor; }}
.sc-chip {{ display: inline-block; border: 1px solid var(--hairline); background: var(--card); border-radius: 999px;
  padding: 3px 12px; font-size: 12px; color: var(--ink); margin: 0 8px 8px 0; }}
.sc-delta {{ display: inline-block; border-radius: 10px; padding: 6px 12px; font-family: {HEAD_FONT};
  font-weight: 600; font-size: 16px; font-variant-numeric: tabular-nums; border: 1px solid currentColor; }}

.sc-why {{ list-style: none; padding: 0; margin: 0; }}
.sc-why li {{ padding: 8px 0; border-bottom: 1px solid var(--hairline); font-size: 14px; line-height: 1.5; }}
.sc-why li:last-child {{ border-bottom: none; }}

/* Inputs and buttons */
.stApp input, .stApp textarea, [data-baseweb="select"] > div {{ border-radius: 10px !important; min-height: 40px; }}
.stButton > button, .stDownloadButton > button, [data-testid="stFormSubmitButton"] > button {{
  border-radius: 10px; min-height: 40px; border: 1px solid var(--teal); color: var(--teal); background: var(--card);
  font-weight: 500; transition: none;
}}
.stButton > button:hover, .stDownloadButton > button:hover {{ background: var(--teal); color: #FFFFFF; border-color: var(--teal-hover); }}
.stButton > button[kind="primary"] {{ background: var(--teal); color: #fff; }}
.stButton > button[kind="primary"]:hover {{ background: var(--teal-hover); }}
.stApp *:focus-visible {{ outline: 2px solid var(--teal) !important; outline-offset: 2px; }}
[data-baseweb="input"]:focus-within, [data-baseweb="select"] > div:focus-within {{ box-shadow: 0 0 0 2px var(--teal) !important; }}

/* Expanders */
[data-testid="stExpander"] details {{ border: 1px solid var(--hairline); border-radius: 10px; background: var(--card); }}
[data-testid="stExpander"] summary p {{ font-weight: 600; }}

/* Tabs */
.stTabs [data-baseweb="tab-list"] {{ gap: 4px; border-bottom: 1px solid var(--hairline); }}
.stTabs [data-baseweb="tab"] {{ font-family: {HEAD_FONT}; font-weight: 600; font-size: 15px; height: 44px; }}
.stTabs [aria-selected="true"] {{ color: var(--teal) !important; }}
.stTabs [data-baseweb="tab-highlight"] {{ background: var(--teal); }}

/* No animation */
*, *::before, *::after {{ animation: none !important; }}
[data-testid="stVerticalBlockBorderWrapper"] {{ transition: none !important; }}

/* Responsive: stack columns under 900px */
@media (max-width: 900px) {{
  [data-testid="stHorizontalBlock"] {{ flex-wrap: wrap !important; gap: 12px !important; }}
  [data-testid="stHorizontalBlock"] > [data-testid="stColumn"],
  [data-testid="stHorizontalBlock"] > [data-testid="column"] {{ width: 100% !important; flex: 1 1 100% !important; min-width: 100% !important; }}
  .block-container {{ padding: 52px 16px 32px 16px; }}
  .sc-title {{ font-size: 24px; }}
  .sc-banner {{ font-size: 11px; }}
}}
</style>
"""


def esc(text: object) -> str:
    return html.escape(str(text))


def banner() -> str:
    return '<div class="sc-banner" role="note">Demo uses&nbsp;<b>SYNTHETIC</b>&nbsp;data. Decision support, not a guarantee.</div>'


def wordmark() -> str:
    return f'<div class="sc-wordmark">{COMPASS_SVG}<span>Startup Compass</span></div>'


def badge(band: str, suffix: str = "risk") -> str:
    color = RISK_TEXT.get(band, MUTED)
    tint = RISK_TINT.get(band, PAPER)
    label = f"{band} {suffix}".strip()
    return f'<span class="sc-badge" style="color:{color};background:{tint}">{esc(label)}</span>'


def chip(text: str) -> str:
    return f'<span class="sc-chip">{esc(text)}</span>'


def section(title: str, caption: str | None = None) -> str:
    cap = f'<div class="sc-caption">{esc(caption)}</div>' if caption else ""
    return f'<div class="sc-section">{esc(title)}</div>{cap}'


def kpi_card(label: str, value: str, sub: str | None = None, extra_html: str = "") -> str:
    sub_html = f'<div class="sc-kpi-sub">{esc(sub)}</div>' if sub else ""
    return (
        f'<div class="sc-card"><div class="sc-kpi-label">{esc(label)}</div>'
        f'<div class="sc-big">{esc(value)}</div>{sub_html}{extra_html}</div>'
    )


def delta_chip(delta_pp: float) -> str:
    """Delta in percentage points; lower risk is green, higher is red, always with words."""
    if abs(delta_pp) < 0.05:
        color, tint, words = MUTED, PAPER, "no change"
    elif delta_pp < 0:
        color, tint, words = RISK_TEXT["Low"], RISK_TINT["Low"], "lower risk"
    else:
        color, tint, words = RISK_TEXT["High"], RISK_TINT["High"], "higher risk"
    sign = "+" if delta_pp > 0 else ("-" if delta_pp < 0 else "")
    return (
        f'<span class="sc-delta" style="color:{color};background:{tint}">'
        f'{sign}{abs(delta_pp):.1f} points · {words}</span>'
    )


def fmt_lakh(value: float | None) -> str:
    if value is None or value != value:
        return "n/a"
    return f"Rs {value:,.1f} L"


def fmt_pct(value: float | None) -> str:
    if value is None or value != value:
        return "n/a"
    return f"{value:.1f}%"


def fmt_months(value: float | None) -> str:
    if value is None or value != value:
        return "n/a"
    return f"{value:.1f} months"


def gauge_readout(probability: float, band: str) -> str:
    color = RISK_TEXT.get(band, MUTED)
    return (
        '<div class="sc-readout">'
        f'<span class="sc-end" style="color:{RISK_TEXT["Low"]}">Safe</span>'
        f'<span class="sc-big">{probability * 100:.1f}%</span>'
        f'<span class="sc-end" style="color:{RISK_TEXT["High"]}">Critical</span></div>'
        f'<div class="sc-band" style="color:{color}">{esc(band)} risk</div>'
    )
