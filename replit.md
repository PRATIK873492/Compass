# Startup Compass

Startup Compass is a startup-risk and funding-readiness decision-support prototype for AVENIR Hackathon 4.0 (StartupSpark AI).

## Run & Operate

- `python src/data_generation.py` — generate the committed SYNTHETIC dataset.
- `python src/train_model.py` — compare models, calibrate the selected model, and write reports.
- `python -m pip install -r requirements.txt` — install the pinned Python dependencies.

## Stack

- Python 3.11
- pandas, NumPy, scikit-learn, joblib
- Streamlit and Plotly for the planned app interface
- No external API keys, paid services, or LLM calls

## Where things live

- `src/data_generation.py` — deterministic synthetic startup data generation.
- `src/features.py` — shared raw schema and engineered features.
- `src/train_model.py` — model selection, calibration, evaluation, and reports.
- `data/`, `models/`, and `reports/` — generated demo dataset and model outputs.

## Architecture decisions

- Startup outcomes and all model metrics are synthetic and must be identified as such.
- Probabilities are decision-support signals, never guarantees.
- All monetary values use INR lakh.
- Training and future inference must call the same `add_features` function.

## Product

The planned Streamlit experience will assess 24-month startup failure risk and funding readiness, compare peers, explore scenarios, screen batches, and explain model drivers.

## User preferences

- Use free/open-source tools only; do not add API keys or LLM calls.

## Gotchas

- Synthetic-data results do not establish real-world model performance.
- Keep the shared feature function identical between model training and inference.

## Pointers

- See `README.md` for the current build checkpoint and training commands.
