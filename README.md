# Startup Compass

Startup Compass is an AVENIR Hackathon 4.0 (StartupSpark AI) decision-support
prototype for exploring synthetic startup failure-risk and funding-readiness
signals. All monetary values are INR lakh.

> **SYNTHETIC DATA:** The committed dataset and its failure labels are generated
> for this demo. Model outputs are probabilities for decision support, never
> guarantees. Synthetic-data metrics do not establish real-world predictive
> performance.

## Current build checkpoint

This checkpoint contains the synthetic-data generator, shared feature
engineering, model comparison, calibrated model, evaluation metrics, and
training reports. The Streamlit pages are intentionally not included yet; the
build pauses here for review of the evaluation table before app implementation.

## Reproduce the data and training run

Use Python 3.11:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python src/data_generation.py
python src/train_model.py
```

The generator writes `data/startups_synthetic.csv` with 6,000 rows by default.
Pass `--n` and `--seed` to vary the sample count or random seed.

Training writes:

- `models/model.joblib` — calibrated scikit-learn pipeline and its fitted
  training metadata.
- `models/metrics.json` — the actual cross-validation and held-out test
  metrics from the latest run, marked as synthetic.
- `reports/calibration_curve.png` and `reports/permutation_importance.png`,
  with their corresponding CSV values.

## Data and model notes

The failure label is generated from runway, churn, growth, LTV:CAC, founder
experience, prior funding rounds, and random noise. The threshold is the
generated 68th percentile, giving an approximately 32% positive label share.
Selected numeric fields have 4–8% missingness; 25 monthly-burn rows are
multiplied by ten as synthetic outliers.

The shared `add_features` function is used for feature creation. The training
pipeline clips numeric features to 1st/99th percentiles, imputes numeric
missingness with medians and missing indicators, scales numeric values, and
one-hot encodes categories. The split is stratified 80/20 with seed 42.
Three classifiers are compared using five-fold cross-validation on the training
split. The highest mean ROC-AUC model is selected, preferring the simpler model
when it is within 0.01. The chosen pipeline is calibrated with five-fold
isotonic calibration. The held-out test split is evaluated once after selection.

## Limitations

The labels, features, and resulting scores are synthetic. Reported metrics show
how well the model reproduces the artificial label-generation process only.
They do not prove that the model predicts startup outcomes in the real world
and must not be used as a guarantee or as the sole basis for a funding decision.
