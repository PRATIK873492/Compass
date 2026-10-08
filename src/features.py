"""Shared raw-input schema and deterministic engineered features."""

from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin


NUM_RAW = [
    "team_size",
    "months_operating",
    "founder_experience_yrs",
    "monthly_burn",
    "cash_balance",
    "mrr",
    "mrr_growth_pct",
    "gross_margin_pct",
    "monthly_churn_pct",
    "cac",
    "ltv",
    "total_funding_raised",
    "prior_rounds",
]
CATS = ["sector", "stage"]
# Public alias retained as CAT to match the input brief's named feature list.
CAT = CATS
ENGINEERED = [
    "net_burn",
    "runway_months",
    "ltv_cac_ratio",
    "burn_multiple",
    "revenue_cover",
    "burn_per_head",
    "is_profitable",
]
FEATURES = CAT + NUM_RAW + ENGINEERED


class Winsorizer(BaseEstimator, TransformerMixin):
    """Clip numeric columns to fitted 1st/99th percentiles."""

    def __init__(self, columns: list[str]):
        self.columns = columns

    def fit(self, X: pd.DataFrame, y: pd.Series | None = None) -> "Winsorizer":
        numeric = X.loc[:, self.columns].apply(pd.to_numeric, errors="coerce")
        self.lower_bounds_ = numeric.quantile(0.01).fillna(0.0)
        self.upper_bounds_ = numeric.quantile(0.99).fillna(self.lower_bounds_)
        self.upper_bounds_ = self.upper_bounds_.where(
            self.upper_bounds_ >= self.lower_bounds_,
            self.lower_bounds_,
        )
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        transformed = X.copy()
        values = transformed.loc[:, self.columns].apply(pd.to_numeric, errors="coerce")
        clipped = values.clip(
            lower=self.lower_bounds_,
            upper=self.upper_bounds_,
            axis="columns",
        )
        for column in self.columns:
            transformed[column] = clipped[column].astype(float)
        return transformed


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """Return a copy of df with the shared model features appended.

    The same function is used by model training and will be used by inference.
    It is deterministic and leaves missing optional measurements as NaN for
    the model's fitted imputer.
    """
    needed = set(NUM_RAW + CAT)
    missing = sorted(needed.difference(df.columns))
    if missing:
        raise ValueError(f"Missing required startup fields: {', '.join(missing)}")

    result = df.copy()
    numeric = {name: pd.to_numeric(result[name], errors="coerce") for name in NUM_RAW}

    net_burn = numeric["monthly_burn"] - (
        numeric["mrr"] * numeric["gross_margin_pct"] / 100.0
    )
    net_burn = net_burn.clip(lower=0.05)
    result["net_burn"] = net_burn
    result["runway_months"] = (numeric["cash_balance"] / net_burn).clip(lower=0, upper=60)

    cac = numeric["cac"]
    ltv = numeric["ltv"]
    ratio = ltv / cac.where(cac > 0)
    ratio = ratio.mask((cac == 0) & (ltv > 0), 15.0)
    ratio = ratio.mask((cac == 0) & (ltv == 0), 0.0)
    result["ltv_cac_ratio"] = ratio.clip(lower=0, upper=15)

    mrr = numeric["mrr"]
    burn_multiple = net_burn / mrr.where(mrr > 0)
    burn_multiple = burn_multiple.mask((mrr == 0) & net_burn.notna(), 60.0)
    result["burn_multiple"] = burn_multiple.clip(lower=0, upper=60)

    monthly_burn = numeric["monthly_burn"]
    result["revenue_cover"] = (mrr / monthly_burn.where(monthly_burn > 0)).clip(lower=0, upper=3)
    team_size = numeric["team_size"]
    result["burn_per_head"] = monthly_burn / team_size.where(team_size > 0)

    gross_margin = numeric["gross_margin_pct"]
    gross_profit = mrr * gross_margin / 100.0
    profitable = gross_profit >= monthly_burn
    has_profit_inputs = gross_profit.notna() & monthly_burn.notna()
    result["is_profitable"] = np.where(
        has_profit_inputs,
        profitable.astype(float),
        np.nan,
    )
    return result
