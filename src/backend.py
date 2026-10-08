"""Backend facade used by app.py: the real model-backed implementation.

src/mock_backend.py exposes the same names and return shapes for UI work.
"""

from src.insights import load_metrics, peer_percentiles, runway_forecast
from src.predict import batch_template, load_artifact, predict_batch, predict_one, validate_input
from src.whatif import action_plan, apply_levers, lever_effects

__all__ = [
    "validate_input",
    "predict_one",
    "predict_batch",
    "apply_levers",
    "lever_effects",
    "action_plan",
    "runway_forecast",
    "peer_percentiles",
    "load_metrics",
    "batch_template",
    "load_artifact",
]
