"""Train and evaluate Startup Compass on the committed SYNTHETIC dataset."""

from __future__ import annotations

import json
import struct
import sys
import time
import zlib
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, cross_validate, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.features import CAT, ENGINEERED, FEATURES, NUM_RAW, Winsorizer, add_features


DATA_PATH = ROOT / "data" / "startups_synthetic.csv"
MODEL_PATH = ROOT / "models" / "model.joblib"
METRICS_PATH = ROOT / "models" / "metrics.json"
REPORTS_DIR = ROOT / "reports"
TARGET = "failed_within_24m"
NUMERIC_FEATURES = NUM_RAW + ENGINEERED
SIMPLICITY_ORDER = {
    "Logistic Regression": 0,
    "HistGradientBoosting": 1,
    "Random Forest": 2,
}


class RGBCanvas:
    """Small standard-library PNG canvas for reports; adds no plotting dependency."""

    def __init__(self, width: int, height: int, background: tuple[int, int, int] = (255, 255, 255)):
        self.width = width
        self.height = height
        self.pixels = bytearray(bytes(background) * width * height)

    def point(self, x: int, y: int, color: tuple[int, int, int]) -> None:
        if 0 <= x < self.width and 0 <= y < self.height:
            offset = (y * self.width + x) * 3
            self.pixels[offset : offset + 3] = bytes(color)

    def line(
        self,
        x0: int,
        y0: int,
        x1: int,
        y1: int,
        color: tuple[int, int, int],
        thickness: int = 1,
    ) -> None:
        dx = abs(x1 - x0)
        sx = 1 if x0 < x1 else -1
        dy = -abs(y1 - y0)
        sy = 1 if y0 < y1 else -1
        error = dx + dy
        radius = max(0, thickness // 2)
        while True:
            for offset_y in range(-radius, radius + 1):
                for offset_x in range(-radius, radius + 1):
                    self.point(x0 + offset_x, y0 + offset_y, color)
            if x0 == x1 and y0 == y1:
                break
            doubled_error = 2 * error
            if doubled_error >= dy:
                error += dy
                x0 += sx
            if doubled_error <= dx:
                error += dx
                y0 += sy

    def rectangle(
        self,
        x0: int,
        y0: int,
        x1: int,
        y1: int,
        color: tuple[int, int, int],
    ) -> None:
        left, right = sorted((max(0, x0), min(self.width, x1)))
        top, bottom = sorted((max(0, y0), min(self.height, y1)))
        row = bytes(color) * max(0, right - left)
        for y in range(top, bottom):
            offset = (y * self.width + left) * 3
            self.pixels[offset : offset + len(row)] = row

    def circle(self, cx: int, cy: int, radius: int, color: tuple[int, int, int]) -> None:
        for y in range(-radius, radius + 1):
            for x in range(-radius, radius + 1):
                if x * x + y * y <= radius * radius:
                    self.point(cx + x, cy + y, color)

    def save(self, path: Path) -> None:
        def chunk(kind: bytes, data: bytes) -> bytes:
            payload = kind + data
            return struct.pack(">I", len(data)) + payload + struct.pack(">I", zlib.crc32(payload) & 0xFFFFFFFF)

        scanlines = b"".join(
            b"\x00" + self.pixels[y * self.width * 3 : (y + 1) * self.width * 3]
            for y in range(self.height)
        )
        png = (
            b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">2I5B", self.width, self.height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(scanlines, level=7))
            + chunk(b"IEND", b"")
        )
        path.write_bytes(png)


def build_pipeline(classifier: Any) -> Pipeline:
    numeric_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
            ("scaler", StandardScaler()),
        ]
    )
    preprocessor = ColumnTransformer(
        transformers=[
            ("numeric", numeric_pipeline, NUMERIC_FEATURES),
            (
                "categorical",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                CAT,
            ),
        ],
        remainder="drop",
    )
    return Pipeline(
        steps=[
            ("winsorizer", Winsorizer(NUMERIC_FEATURES)),
            ("preprocessor", preprocessor),
            ("classifier", classifier),
        ]
    )


def _candidate_models(seed: int) -> dict[str, Any]:
    return {
        "Logistic Regression": LogisticRegression(
            max_iter=2000,
            class_weight="balanced",
            random_state=seed,
        ),
        "Random Forest": RandomForestClassifier(
            n_estimators=300,
            min_samples_leaf=5,
            class_weight="balanced",
            random_state=seed,
            n_jobs=-1,
        ),
        "HistGradientBoosting": HistGradientBoostingClassifier(random_state=seed),
    }


def _choose_model(cv_results: dict[str, dict[str, float]]) -> tuple[str, str]:
    best_name = max(cv_results, key=lambda name: cv_results[name]["roc_auc_mean"])
    best_score = cv_results[best_name]["roc_auc_mean"]
    near_best = [
        name
        for name, result in cv_results.items()
        if best_score - result["roc_auc_mean"] <= 0.01
    ]
    chosen = min(near_best, key=lambda name: SIMPLICITY_ORDER[name])
    if chosen == best_name:
        explanation = (
            f"{chosen} had the highest mean cross-validation ROC-AUC "
            f"({best_score:.4f})."
        )
    else:
        explanation = (
            f"{chosen} was selected as the simpler model: its mean CV ROC-AUC "
            f"({cv_results[chosen]['roc_auc_mean']:.4f}) was within 0.01 of "
            f"the best score ({best_score:.4f} from {best_name})."
        )
    return chosen, explanation


def _save_calibration_png(path: Path, predicted: np.ndarray, observed: np.ndarray) -> None:
    canvas = RGBCanvas(960, 620)
    left, top, right, bottom = 90, 48, 914, 530
    grid = (222, 228, 238)
    axis = (68, 78, 99)
    purple = (99, 102, 241)
    for step in range(6):
        x = left + round((right - left) * step / 5)
        y = bottom - round((bottom - top) * step / 5)
        canvas.line(x, top, x, bottom, grid)
        canvas.line(left, y, right, y, grid)
    canvas.line(left, bottom, right, bottom, axis, thickness=2)
    canvas.line(left, top, left, bottom, axis, thickness=2)
    canvas.line(left, bottom, right, top, (160, 168, 183), thickness=2)

    points = [
        (
            left + round(float(x) * (right - left)),
            bottom - round(float(y) * (bottom - top)),
        )
        for x, y in zip(predicted, observed, strict=False)
    ]
    for first, second in zip(points, points[1:]):
        canvas.line(first[0], first[1], second[0], second[1], purple, thickness=4)
    for x, y in points:
        canvas.circle(x, y, 7, purple)
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def _save_importance_png(path: Path, importance: pd.DataFrame) -> None:
    canvas = RGBCanvas(960, 620)
    left, top, right, bottom = 310, 54, 914, 552
    grid = (228, 232, 239)
    axis = (68, 78, 99)
    bar_color = (99, 102, 241)
    values = importance.head(20).iloc[::-1]["importance_mean"].to_numpy(dtype=float)
    maximum = max(float(values.max()) if len(values) else 0.0, 0.001)
    canvas.line(left, top, left, bottom, axis, thickness=2)
    canvas.line(left, bottom, right, bottom, axis, thickness=2)
    for step in range(6):
        x = left + round((right - left) * step / 5)
        canvas.line(x, top, x, bottom, grid)
    if len(values):
        band = (bottom - top) / len(values)
        for index, value in enumerate(values):
            center_y = top + round((index + 0.5) * band)
            bar_end = left + round(max(0.0, value) / maximum * (right - left))
            canvas.rectangle(left + 2, center_y - max(3, int(band * 0.31)), bar_end, center_y + max(3, int(band * 0.31)), bar_color)
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    return value


def train_and_evaluate(
    data_path: Path = DATA_PATH,
    seed: int = 42,
) -> tuple[dict[str, Any], pd.DataFrame, dict[str, float]]:
    started_at = time.perf_counter()
    data = pd.read_csv(data_path)
    if TARGET not in data.columns:
        raise ValueError(f"Dataset must include the target column {TARGET!r}.")
    if data[TARGET].nunique() != 2:
        raise ValueError("The generated target must contain both classes.")

    engineered = add_features(data)
    X = engineered.loc[:, FEATURES]
    y = data[TARGET].astype(int)
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        stratify=y,
        random_state=seed,
    )

    scoring = {
        "roc_auc": "roc_auc",
        "pr_auc": "average_precision",
        "f1": "f1",
        "recall": "recall",
        "brier": "neg_brier_score",
    }
    folds = StratifiedKFold(n_splits=5, shuffle=True, random_state=seed)
    cv_results: dict[str, dict[str, float]] = {}
    table_rows: list[dict[str, str]] = []

    for name, classifier in _candidate_models(seed).items():
        scores = cross_validate(
            build_pipeline(classifier),
            X_train,
            y_train,
            scoring=scoring,
            cv=folds,
            n_jobs=1,
            return_train_score=False,
            error_score="raise",
        )
        summary: dict[str, float] = {}
        row: dict[str, str] = {"Model": name}
        for metric in ["roc_auc", "pr_auc", "f1", "recall", "brier"]:
            fold_values = scores[f"test_{metric}"]
            if metric == "brier":
                mean_value = -float(np.mean(fold_values))
            else:
                mean_value = float(np.mean(fold_values))
            std_value = float(np.std(fold_values, ddof=1))
            summary[f"{metric}_mean"] = mean_value
            summary[f"{metric}_std"] = std_value
            row[metric.upper().replace("_", "-")] = f"{mean_value:.3f} ± {std_value:.3f}"
        cv_results[name] = summary
        table_rows.append(row)

    cv_table = pd.DataFrame(
        table_rows,
        columns=["Model", "ROC-AUC", "PR-AUC", "F1", "RECALL", "BRIER"],
    )
    model_name, selection_explanation = _choose_model(cv_results)

    calibrated_model = CalibratedClassifierCV(
        estimator=build_pipeline(_candidate_models(seed)[model_name]),
        method="isotonic",
        cv=5,
        n_jobs=1,
    )
    calibrated_model.fit(X_train, y_train)

    # This is the single final held-out test evaluation; no test-set results
    # are used to select a candidate or tune thresholds.
    probabilities = calibrated_model.predict_proba(X_test)[:, 1]
    predicted_labels = (probabilities >= 0.5).astype(int)
    test_metrics = {
        "roc_auc": float(roc_auc_score(y_test, probabilities)),
        "pr_auc": float(average_precision_score(y_test, probabilities)),
        "f1": float(f1_score(y_test, predicted_labels, zero_division=0)),
        "precision": float(precision_score(y_test, predicted_labels, zero_division=0)),
        "recall": float(recall_score(y_test, predicted_labels, zero_division=0)),
        "brier": float(brier_score_loss(y_test, probabilities)),
        "accuracy": float(accuracy_score(y_test, predicted_labels)),
    }

    permutation = permutation_importance(
        calibrated_model,
        X_test,
        y_test,
        scoring="roc_auc",
        n_repeats=5,
        random_state=seed,
        n_jobs=1,
    )
    importance = pd.DataFrame(
        {
            "feature": FEATURES,
            "importance_mean": permutation.importances_mean,
            "importance_std": permutation.importances_std,
        }
    ).sort_values("importance_mean", ascending=False, ignore_index=True)

    observed_rate, predicted_rate = calibration_curve(
        y_test,
        probabilities,
        n_bins=10,
        strategy="quantile",
    )
    _save_calibration_png(REPORTS_DIR / "calibration_curve.png", predicted_rate, observed_rate)
    _save_importance_png(REPORTS_DIR / "permutation_importance.png", importance)
    importance.to_csv(REPORTS_DIR / "permutation_importance.csv", index=False)
    pd.DataFrame(
        {"mean_predicted_probability": predicted_rate, "observed_failure_rate": observed_rate}
    ).to_csv(REPORTS_DIR / "calibration_curve.csv", index=False)

    raw_medians = X_train[NUM_RAW].median(numeric_only=True).to_dict()
    category_modes = {
        column: str(X_train[column].mode(dropna=True).iloc[0])
        for column in CAT
    }
    training_winsorizer = Winsorizer(NUMERIC_FEATURES).fit(X_train)
    artifact = {
        "model": calibrated_model,
        "model_name": model_name,
        "feature_columns": FEATURES,
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CAT,
        "raw_medians": raw_medians,
        "categorical_modes": category_modes,
        "winsor_limits": {
            column: [
                float(training_winsorizer.lower_bounds_[column]),
                float(training_winsorizer.upper_bounds_[column]),
            ]
            for column in NUMERIC_FEATURES
        },
        "synthetic_data": True,
        "random_seed": seed,
    }
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, MODEL_PATH, compress=3)

    metrics = {
        "synthetic": True,
        "dataset": {
            "file": str(data_path.relative_to(ROOT) if data_path.is_relative_to(ROOT) else data_path),
            "rows": int(len(data)),
            "columns": int(len(data.columns)),
            "generated_failure_rate": float(y.mean()),
            "train_rows": int(len(X_train)),
            "test_rows": int(len(X_test)),
            "train_failure_rate": float(y_train.mean()),
            "test_failure_rate": float(y_test.mean()),
            "random_seed": seed,
        },
        "cross_validation": {
            "folds": 5,
            "training_split_only": True,
            "metrics": cv_results,
        },
        "selection": {
            "selected_model": model_name,
            "rule": "Highest mean CV ROC-AUC; prefer the simpler model when within 0.01.",
            "explanation": selection_explanation,
        },
        "calibration": {
            "method": "isotonic",
            "folds": 5,
            "decision_threshold_for_reported_class_metrics": 0.5,
        },
        "test_metrics": test_metrics,
        "top_permutation_importance": importance.head(20).to_dict(orient="records"),
        "limitations": [
            "All records and outcomes are SYNTHETIC; these scores do not estimate real-world startup failure rates.",
            "Calibration and test metrics measure fit to the generated labels, not performance on external companies.",
            "Outputs are decision-support probabilities, never guarantees.",
        ],
    }
    METRICS_PATH.parent.mkdir(parents=True, exist_ok=True)
    METRICS_PATH.write_text(json.dumps(_json_safe(metrics), indent=2) + "\n", encoding="utf-8")
    elapsed = time.perf_counter() - started_at
    return metrics, cv_table, test_metrics | {"training_seconds": elapsed}


def main() -> None:
    metrics, cv_table, test_metrics = train_and_evaluate()
    print("SYNTHETIC Startup Compass — 5-fold cross-validation on the training split")
    print(cv_table.to_string(index=False))
    print()
    print(f"Selected model: {metrics['selection']['selected_model']}")
    print(metrics["selection"]["explanation"])
    print()
    print("Final calibrated model — held-out test set (evaluated once)")
    display_names = {
        "roc_auc": "ROC-AUC",
        "pr_auc": "PR-AUC",
        "f1": "F1",
        "precision": "Precision",
        "recall": "Recall",
        "brier": "Brier",
        "accuracy": "Accuracy",
    }
    print(
        pd.DataFrame(
            [
                {"Metric": display_names[name], "Value": f"{value:.4f}"}
                for name, value in test_metrics.items()
                if name in display_names
            ]
        ).to_string(index=False)
    )
    print()
    print(
        f"Saved model, metrics, and reports. This run used "
        f"{metrics['dataset']['rows']:,} SYNTHETIC records."
    )
    print("These results describe only the generated labels; they do not prove real-world performance.")


if __name__ == "__main__":
    main()
