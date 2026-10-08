"""Export model artefacts the web client needs to work without the API.

Writes web/src/data/offline.json: the fallback logistic model, training
medians/modes, peer rows and a demo sample of the SYNTHETIC dataset.
Run after src/train_model.py:  python scripts/export_web_assets.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.predict import load_artifact  # noqa: E402

OUT = ROOT / "web" / "src" / "data" / "offline.json"


def _records(frame: pd.DataFrame) -> list[dict]:
    frame = frame.round(4)
    return frame.astype(object).where(frame.notna(), None).to_dict(orient="records")


def _columnar(frame: pd.DataFrame) -> dict:
    frame = frame.round(3)
    rows = frame.astype(object).where(frame.notna(), None).values.tolist()
    return {"columns": list(frame.columns), "rows": rows}


def main() -> None:
    art = load_artifact()
    metrics = json.loads((ROOT / "models" / "metrics.json").read_text(encoding="utf-8"))
    data = pd.read_csv(ROOT / "data" / "startups_synthetic.csv")
    demo = data.sample(300, random_state=7).drop(columns=["failed_within_24m"])
    payload = {
        "synthetic": True,
        "fallback_model": metrics["fallback_model"],
        "raw_medians": {k: float(v) for k, v in art["raw_medians"].items()},
        "categorical_modes": art["categorical_modes"],
        "peers": _columnar(art["peer_data"]),
        "demo_rows": _records(demo),
        # Model-lab metrics so the static build can show them without the API.
        "model_lab": {k: v for k, v in metrics.items() if k not in ("fallback_model", "top_permutation_importance")},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB): "
          f"{len(payload['peers']['rows'])} peer rows, {len(payload['demo_rows'])} demo rows")


if __name__ == "__main__":
    main()
