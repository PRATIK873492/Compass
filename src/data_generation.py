"""Generate deterministic SYNTHETIC startup data for Startup Compass."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd


SECTORS = [
    "SaaS",
    "Fintech",
    "Edtech",
    "Healthtech",
    "D2C",
    "Agritech",
    "Deeptech",
]
STAGES = ["Pre-seed", "Seed", "Series A"]
SECTOR_GROSS_MARGIN = {
    "SaaS": 82.0,
    "Fintech": 68.0,
    "Edtech": 67.0,
    "Healthtech": 63.0,
    "D2C": 48.0,
    "Agritech": 52.0,
    "Deeptech": 58.0,
}


def generate(n: int = 6000, seed: int = 42) -> pd.DataFrame:
    """Return n reproducible synthetic startup records.

    All money values are INR lakh. The failure label is a generated teaching
    target, not observed company data or a claim about real startup outcomes.
    """
    if not isinstance(n, int) or n < 100:
        raise ValueError("n must be an integer of at least 100.")

    rng = np.random.default_rng(seed)
    sector = rng.choice(SECTORS, size=n, p=[0.24, 0.15, 0.12, 0.12, 0.14, 0.10, 0.13])
    stage = rng.choice(STAGES, size=n, p=[0.42, 0.38, 0.20])

    stage_index = pd.Series(stage).map({"Pre-seed": 0, "Seed": 1, "Series A": 2}).to_numpy()
    sector_margin = pd.Series(sector).map(SECTOR_GROSS_MARGIN).to_numpy(dtype=float)

    team_size = np.clip(
        np.rint(rng.lognormal(mean=1.35 + stage_index * 0.48, sigma=0.62)),
        1,
        180,
    ).astype(int)
    months_operating = np.clip(
        np.rint(rng.gamma(shape=2.8 + stage_index * 0.55, scale=6.5)),
        1,
        120,
    ).astype(int)
    founder_experience = np.clip(rng.gamma(shape=2.4, scale=4.0, size=n), 0, 35)

    sector_burn = pd.Series(sector).map(
        {
            "SaaS": 1.0,
            "Fintech": 1.35,
            "Edtech": 0.88,
            "Healthtech": 1.2,
            "D2C": 1.05,
            "Agritech": 0.92,
            "Deeptech": 1.55,
        }
    ).to_numpy(dtype=float)
    monthly_burn = np.clip(
        rng.lognormal(mean=1.35 + stage_index * 0.65, sigma=0.72, size=n)
        * sector_burn,
        0.1,
        3500,
    )
    mrr_fraction = np.clip(
        rng.beta(a=2.1 + stage_index * 0.6, b=3.4, size=n),
        0.03,
        1.55,
    )
    mrr = monthly_burn * mrr_fraction
    mrr_growth_pct = np.clip(
        rng.normal(loc=17 - stage_index * 1.5, scale=21, size=n),
        -48,
        145,
    )
    gross_margin_pct = np.clip(
        rng.normal(loc=sector_margin, scale=11, size=n),
        12,
        96,
    )
    monthly_churn_pct = np.clip(
        rng.lognormal(mean=np.log(5.0), sigma=0.58, size=n)
        + np.maximum(0, 0.48 * (12 - mrr_growth_pct)),
        0.15,
        45,
    )

    net_burn_for_generation = np.maximum(
        monthly_burn - mrr * gross_margin_pct / 100.0,
        0.05,
    )
    runway_for_generation = np.clip(
        rng.lognormal(mean=np.log(13.0 + stage_index * 2.2), sigma=0.78, size=n),
        0.2,
        72,
    )
    cash_balance = np.clip(net_burn_for_generation * runway_for_generation, 0, 1_000_000)

    arpu_lakh = rng.lognormal(mean=np.log(0.075), sigma=0.74, size=n)
    ltv = np.clip(
        arpu_lakh * (gross_margin_pct / 100.0) / np.maximum(monthly_churn_pct / 100.0, 0.002),
        0.001,
        180,
    )
    cac = np.clip(
        ltv / rng.lognormal(mean=np.log(2.3), sigma=0.65, size=n),
        0.001,
        100,
    )

    prior_rounds = np.where(
        stage == "Pre-seed",
        rng.choice([0, 1], size=n, p=[0.78, 0.22]),
        np.where(
            stage == "Seed",
            rng.choice([0, 1, 2], size=n, p=[0.13, 0.68, 0.19]),
            rng.choice([1, 2, 3, 4], size=n, p=[0.08, 0.48, 0.34, 0.10]),
        ),
    ).astype(int)
    round_size = np.select(
        [stage == "Pre-seed", stage == "Seed", stage == "Series A"],
        [rng.lognormal(np.log(18), 0.72, n), rng.lognormal(np.log(95), 0.68, n), rng.lognormal(np.log(480), 0.62, n)],
        default=20,
    )
    total_funding_raised = np.clip(round_size * np.maximum(prior_rounds, 1), 0, 100_000)

    ltv_cac_ratio = np.divide(ltv, cac, out=np.zeros_like(ltv), where=cac > 0)
    latent_risk = (
        1.35 * (18.0 - runway_for_generation) / 12.0
        + 0.045 * (monthly_churn_pct - 5.0)
        - 0.018 * mrr_growth_pct
        + 0.8 * (1.5 - ltv_cac_ratio)
        - 0.045 * founder_experience
        - 0.16 * prior_rounds
        + rng.normal(0, 1.2, size=n)
    )
    failure_cutoff = float(np.quantile(latent_risk, 0.68))
    failed_within_24m = (latent_risk >= failure_cutoff).astype(int)

    frame = pd.DataFrame(
        {
            "startup_id": [f"ST-{index:06d}" for index in range(1, n + 1)],
            "sector": sector,
            "stage": stage,
            "team_size": team_size,
            "months_operating": months_operating,
            "founder_experience_yrs": founder_experience.round(2),
            "monthly_burn": monthly_burn.round(3),
            "cash_balance": cash_balance.round(3),
            "mrr": mrr.round(3),
            "mrr_growth_pct": mrr_growth_pct.round(2),
            "gross_margin_pct": gross_margin_pct.round(2),
            "monthly_churn_pct": monthly_churn_pct.round(2),
            "cac": cac.round(4),
            "ltv": ltv.round(4),
            "total_funding_raised": total_funding_raised.round(3),
            "prior_rounds": prior_rounds,
            "failed_within_24m": failed_within_24m,
        }
    )

    # SYNTHETIC missingness is introduced after label generation so missing
    # values are not themselves an input to the latent target.
    for column in [
        "founder_experience_yrs",
        "cac",
        "ltv",
        "monthly_churn_pct",
        "gross_margin_pct",
    ]:
        missing_rate = float(rng.uniform(0.04, 0.08))
        missing_rows = rng.choice(n, size=max(1, int(round(n * missing_rate))), replace=False)
        frame.loc[missing_rows, column] = np.nan

    # SYNTHETIC data quality challenge: exactly 25 burn values are multiplied
    # by ten when at least 25 records are requested.
    outlier_count = min(25, n)
    outlier_rows = rng.choice(n, size=outlier_count, replace=False)
    frame.loc[outlier_rows, "monthly_burn"] *= 10

    return frame


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate the SYNTHETIC Startup Compass dataset.")
    parser.add_argument("--n", type=int, default=6000, help="Number of synthetic startups (default: 6000).")
    parser.add_argument("--seed", type=int, default=42, help="Random seed (default: 42).")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/startups_synthetic.csv"),
        help="Output CSV path (default: data/startups_synthetic.csv).",
    )
    args = parser.parse_args()
    data = generate(n=args.n, seed=args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    data.to_csv(args.output, index=False)
    rate = data["failed_within_24m"].mean()
    print(
        f"Generated {len(data):,} SYNTHETIC startups "
        f"({data.shape[1]} columns, {rate:.1%} generated failure labels) -> {args.output}"
    )


if __name__ == "__main__":
    main()
