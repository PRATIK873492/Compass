// Field metadata and validation. Mirrors src/schema.py so the API and the
// offline engine reject the same inputs with the same messages.

import type { StartupInput } from "./types";

export const SECTORS = ["SaaS", "Fintech", "Edtech", "Healthtech", "D2C", "Agritech", "Deeptech"] as const;
export const STAGES = ["Pre-seed", "Seed", "Series A"] as const;

export type NumericField =
  | "team_size"
  | "months_operating"
  | "founder_experience_yrs"
  | "monthly_burn"
  | "cash_balance"
  | "mrr"
  | "mrr_growth_pct"
  | "gross_margin_pct"
  | "monthly_churn_pct"
  | "cac"
  | "ltv"
  | "arpu"
  | "total_funding_raised"
  | "prior_rounds";

export const RANGES: Record<NumericField, [number, number | null]> = {
  team_size: [1, 1000],
  months_operating: [0, 240],
  founder_experience_yrs: [0, 50],
  monthly_burn: [0.01, 100000],
  cash_balance: [0, 1000000],
  mrr: [0, 100000],
  mrr_growth_pct: [-50, 200],
  gross_margin_pct: [-100, 100],
  monthly_churn_pct: [0, 100],
  cac: [0, null],
  ltv: [0, null],
  arpu: [0, null],
  total_funding_raised: [0, null],
  prior_rounds: [0, 15],
};

export const LABELS: Record<string, string> = {
  sector: "Sector",
  stage: "Stage",
  team_size: "Team size",
  months_operating: "Months operating",
  founder_experience_yrs: "Founder experience",
  monthly_burn: "Monthly burn",
  cash_balance: "Cash balance",
  mrr: "MRR",
  mrr_growth_pct: "MoM growth",
  gross_margin_pct: "Gross margin",
  monthly_churn_pct: "Monthly churn",
  cac: "CAC",
  ltv: "LTV",
  arpu: "ARPU",
  total_funding_raised: "Total funding raised",
  prior_rounds: "Prior rounds",
};

export const OPTIONAL: NumericField[] = ["founder_experience_yrs", "gross_margin_pct", "monthly_churn_pct", "cac", "ltv", "arpu"];
export const MODEL_NUMERIC = [
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
] as const;

export interface FieldMeta {
  key: NumericField;
  label: string;
  unit: string;
  hint: string;
  step: number;
  integer?: boolean;
}

export const STEPS: { title: string; blurb: string; fields: (NumericField | "sector" | "stage")[] }[] = [
  {
    title: "Company",
    blurb: "Who you are and how far along.",
    fields: ["sector", "stage", "team_size", "months_operating", "founder_experience_yrs"],
  },
  { title: "Cash & burn", blurb: "Money in the bank and money going out.", fields: ["cash_balance", "monthly_burn", "total_funding_raised", "prior_rounds"] },
  { title: "Revenue", blurb: "Recurring revenue and its momentum.", fields: ["mrr", "mrr_growth_pct", "gross_margin_pct"] },
  { title: "Unit economics", blurb: "What a customer is worth and costs.", fields: ["arpu", "monthly_churn_pct", "cac", "ltv"] },
];

export const META: Record<NumericField, FieldMeta> = {
  team_size: { key: "team_size", label: "Team size", unit: "people", hint: "Full-time people on payroll, including founders.", step: 1, integer: true },
  months_operating: { key: "months_operating", label: "Months operating", unit: "months", hint: "Months since you started operating.", step: 1, integer: true },
  founder_experience_yrs: { key: "founder_experience_yrs", label: "Founder experience", unit: "years", hint: "Most experienced founder's relevant years. Optional.", step: 0.5 },
  monthly_burn: { key: "monthly_burn", label: "Monthly burn", unit: "₹ lakh", hint: "Total monthly operating spend before revenue.", step: 0.5 },
  cash_balance: { key: "cash_balance", label: "Cash balance", unit: "₹ lakh", hint: "Cash in the bank today.", step: 1 },
  mrr: { key: "mrr", label: "MRR", unit: "₹ lakh / mo", hint: "Monthly recurring revenue.", step: 0.5 },
  mrr_growth_pct: { key: "mrr_growth_pct", label: "MoM growth", unit: "%", hint: "Average month-on-month MRR growth, last 3 months.", step: 0.5 },
  gross_margin_pct: { key: "gross_margin_pct", label: "Gross margin", unit: "%", hint: "(Revenue - direct costs) / revenue. Optional.", step: 1 },
  monthly_churn_pct: { key: "monthly_churn_pct", label: "Monthly churn", unit: "%", hint: "Customers or revenue lost per month. Optional.", step: 0.5 },
  cac: { key: "cac", label: "CAC", unit: "₹ lakh / customer", hint: "Cost to acquire one customer. Optional.", step: 0.05 },
  ltv: { key: "ltv", label: "LTV", unit: "₹ lakh / customer", hint: "Leave blank to compute ARPU × margin ÷ churn.", step: 0.05 },
  arpu: { key: "arpu", label: "ARPU", unit: "₹ lakh / customer / mo", hint: "Average monthly revenue per customer. Used to derive LTV.", step: 0.01 },
  total_funding_raised: { key: "total_funding_raised", label: "Total funding raised", unit: "₹ lakh", hint: "All equity and grants to date.", step: 5 },
  prior_rounds: { key: "prior_rounds", label: "Prior rounds", unit: "count", hint: "Funding rounds closed so far.", step: 1, integer: true },
};

const blank = (v: unknown) => v === null || v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v));
const fmtBound = (n: number) => (Number.isInteger(n) ? String(n) : String(n));

export function fieldError(key: string, value: unknown): string | null {
  if (key === "sector" || key === "stage") {
    const allowed: readonly string[] = key === "sector" ? SECTORS : STAGES;
    if (blank(value)) return `${LABELS[key]} is required`;
    return allowed.includes(String(value).trim()) ? null : `${LABELS[key]} must be one of: ${allowed.join(", ")}`;
  }
  const k = key as NumericField;
  if (!(k in RANGES)) return null;
  if (blank(value)) return OPTIONAL.includes(k) ? null : `${LABELS[k]} is required`;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
  if (typeof value === "boolean" || !Number.isFinite(n)) return `${LABELS[k]} must be a number`;
  const [lo, hi] = RANGES[k];
  if (n < lo || (hi !== null && n > hi)) {
    return hi === null ? `${LABELS[k]} must be ${fmtBound(lo)} or more` : `${LABELS[k]} must be between ${fmtBound(lo)} and ${fmtBound(hi)}`;
  }
  return null;
}

export type Clean = Record<string, number | string | null>;

export function validate(input: Partial<StartupInput> | Record<string, unknown>): { clean: Clean; errors: string[] } {
  const src = input as Record<string, unknown>;
  const errors: string[] = [];
  const clean: Clean = {};
  for (const key of ["sector", "stage", ...MODEL_NUMERIC, "arpu"]) {
    const err = fieldError(key, src[key]);
    if (err) {
      errors.push(err);
      continue;
    }
    const v = src[key];
    if (key === "sector" || key === "stage") clean[key] = String(v).trim();
    else clean[key] = blank(v) ? null : Number(String(v).replace(/,/g, ""));
  }
  return { clean, errors };
}

export function bandFor(p: number): "Low" | "Medium" | "High" {
  if (p < 0.25) return "Low";
  if (p <= 0.5) return "Medium";
  return "High";
}

export const EMPTY_INPUT: StartupInput = {
  sector: null,
  stage: null,
  team_size: null,
  months_operating: null,
  founder_experience_yrs: null,
  monthly_burn: null,
  cash_balance: null,
  mrr: null,
  mrr_growth_pct: null,
  gross_margin_pct: null,
  monthly_churn_pct: null,
  cac: null,
  ltv: null,
  arpu: null,
  total_funding_raised: null,
  prior_rounds: null,
};

export const PRESETS: Record<string, StartupInput> = {
  "Healthy SaaS": {
    ...EMPTY_INPUT, name: "Healthy SaaS", sector: "SaaS", stage: "Seed", team_size: 14, months_operating: 30,
    founder_experience_yrs: 9, monthly_burn: 30, cash_balance: 350, mrr: 16, mrr_growth_pct: 8, gross_margin_pct: 80,
    monthly_churn_pct: 2, cac: 0.5, ltv: 1.2, total_funding_raised: 450, prior_rounds: 2,
  },
  "High-growth Fintech": {
    ...EMPTY_INPUT, name: "High-growth Fintech", sector: "Fintech", stage: "Series A", team_size: 45, months_operating: 28,
    founder_experience_yrs: 6, monthly_burn: 120, cash_balance: 1100, mrr: 45, mrr_growth_pct: 22, gross_margin_pct: 62,
    monthly_churn_pct: 5, cac: 1.5, ltv: 3, total_funding_raised: 2200, prior_rounds: 3,
  },
  "Struggling D2C": {
    ...EMPTY_INPUT, name: "Struggling D2C", sector: "D2C", stage: "Pre-seed", team_size: 10, months_operating: 16,
    founder_experience_yrs: 2, monthly_burn: 24, cash_balance: 200, mrr: 7, mrr_growth_pct: -3, gross_margin_pct: 38,
    monthly_churn_pct: 9, cac: 1, ltv: 1.2, total_funding_raised: 60, prior_rounds: 1,
  },
};
