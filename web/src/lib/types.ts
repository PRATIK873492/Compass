// Shapes shared by the FastAPI backend and the offline engine.

export type Band = "Low" | "Medium" | "High";
export type Sector = "SaaS" | "Fintech" | "Edtech" | "Healthtech" | "D2C" | "Agritech" | "Deeptech";
export type Stage = "Pre-seed" | "Seed" | "Series A";

export interface StartupInput {
  startup_id?: string;
  name?: string;
  sector: Sector | string | null;
  stage: Stage | string | null;
  team_size: number | null;
  months_operating: number | null;
  founder_experience_yrs: number | null;
  monthly_burn: number | null;
  cash_balance: number | null;
  mrr: number | null;
  mrr_growth_pct: number | null;
  gross_margin_pct: number | null;
  monthly_churn_pct: number | null;
  cac: number | null;
  ltv: number | null;
  arpu: number | null;
  total_funding_raised: number | null;
  prior_rounds: number | null;
}

export interface Driver {
  group: string;
  delta_pp: number;
  sentence: string;
}

export interface PredictResult {
  probability: number;
  band: Band;
  readiness_score: number;
  subscores: Record<"Runway" | "Unit economics" | "Growth" | "Retention" | "Traction", number>;
  top_negative: Driver[];
  top_positive: Driver[];
  runway_months: number;
  net_burn: number | null;
  missing_count: number;
  missing_fields: string[];
  warnings: string[];
}

export interface Kpis {
  net_burn: number;
  runway_months: number;
  profitable: boolean;
  ltv: number | null;
  ltv_cac: number | null;
  burn_multiple: number | null;
  churn_pct: number | null;
  growth_pct: number;
  arpu: number | null;
}

export interface ProjectionPoint {
  month: number;
  cash_base: number;
  cash_best: number;
  cash_worst: number;
  mrr: number;
  risk: number;
  readiness: number;
  runway: number;
  burn_multiple: number | null;
  ltv_cac: number | null;
  churn: number | null;
}

export interface Projection {
  series: ProjectionPoint[];
  cashout_month: { best: number | null; base: number | null; worst: number | null };
  assumptions: Record<string, string | number>;
}

export interface PeerMedians {
  n: number;
  runway_months: number;
  ltv_cac: number;
  burn_multiple: number | null;
  churn_pct: number;
  growth_pct: number;
}

export interface PredictResponse {
  input: StartupInput;
  result: PredictResult;
  kpis: Kpis;
  peer_medians: PeerMedians;
  projection: Projection;
  synthetic: boolean;
}

export interface ExplainResponse {
  drivers: (Driver & { fields?: string[] })[];
  method: string;
  caveat: string;
}

export interface Levers {
  burn_pct: number;
  churn_pct: number;
  cac_pct: number;
  growth_pts: number;
  price_pct: number;
}

export interface ScenarioSummary {
  probability: number;
  band: Band;
  readiness: number;
  runway_months: number;
}

export interface Action {
  action: string;
  risk_change_pp: number;
  note: string;
}

export interface SimulateResponse {
  baseline: ScenarioSummary;
  scenario: ScenarioSummary;
  delta_pp: number;
  waterfall: { lever: string; key: keyof Levers; value: number; delta_pp: number }[];
  individual: { lever: string; key: keyof Levers; delta_pp: number }[];
  action_plan?: Action[];
  caveat: string;
}

export interface PeerMetric {
  key: string;
  label: string;
  unit: string;
  lower_is_better: boolean;
  value: number | null;
  median: number | null;
  better_than: number | null;
}

export interface BenchmarkResponse {
  n: number;
  sector: string;
  stage: string;
  fallback: boolean;
  metrics: PeerMetric[];
  peers: { runway_months: number; monthly_churn_pct: number }[];
  you: { runway_months: number; monthly_churn_pct: number | null };
}

export interface BatchRow {
  startup_id: string;
  error: string | null;
  sector?: string;
  stage?: string;
  probability?: number;
  band?: Band;
  readiness?: number;
  runway_months?: number;
  mrr?: number;
  churn_pct?: number | null;
  ltv_cac?: number | null;
  burn_multiple?: number | null;
  missing?: string[];
}

export interface BatchResponse {
  rows: BatchRow[];
  summary: { total: number; ok: number; errors: number; bands: Record<Band, number> };
}

export interface CvMetrics {
  roc_auc_mean: number;
  roc_auc_std: number;
  pr_auc_mean: number;
  pr_auc_std: number;
  f1_mean: number;
  f1_std: number;
  precision_mean: number;
  precision_std: number;
  recall_mean: number;
  recall_std: number;
  brier_mean: number;
  brier_std: number;
}

export interface ModelLab {
  synthetic: boolean;
  dataset: {
    rows: number;
    columns: number;
    generated_failure_rate: number;
    train_rows: number;
    test_rows: number;
    random_seed: number;
  };
  cross_validation: { folds: number; metrics: Record<string, CvMetrics> };
  selection: { selected_model: string; rule: string; explanation: string };
  test_metrics: Record<"roc_auc" | "pr_auc" | "f1" | "precision" | "recall" | "brier" | "accuracy", number>;
  calibration_points: { predicted: number; observed: number }[];
  calibration_before: { predicted: number; observed: number }[];
  brier_before_calibration: number;
  roc_curves_cv: Record<string, { fpr: number[]; tpr: number[] }>;
  permutation_importance: { feature: string; importance_mean: number; importance_std: number }[];
  limitations: string[];
}

export type Mode = "api" | "offline";
