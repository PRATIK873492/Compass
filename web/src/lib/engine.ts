// Offline scoring engine: used automatically when the FastAPI backend is not
// reachable. It re-implements src/features.py exactly and scores with the
// exported plain logistic regression (models/fallback_model.json), so results
// are close to, but not identical with, the API's calibrated model.

import { bandFor, validate, type Clean } from "./schema";
import type {
  Action,
  BatchResponse,
  BatchRow,
  BenchmarkResponse,
  Driver,
  ExplainResponse,
  Kpis,
  Levers,
  PeerMedians,
  PredictResponse,
  Projection,
  ProjectionPoint,
  SimulateResponse,
  StartupInput,
} from "./types";

export interface FallbackModel {
  numeric_features: string[];
  categorical_features: string[];
  winsor_lower: number[];
  winsor_upper: number[];
  impute_median: number[];
  indicator_features: string[];
  scaler_mean: number[];
  scaler_scale: number[];
  categories: Record<string, string[]>;
  coef: number[];
  intercept: number;
  test_roc_auc: number;
  fixtures: { input: Record<string, unknown>; probability: number }[];
}

export interface OfflineData {
  fallback_model: FallbackModel;
  raw_medians: Record<string, number>;
  categorical_modes: Record<string, string>;
  peers: { columns: string[]; rows: (number | string | null)[][] };
  demo_rows: Record<string, unknown>[];
}

type Row = Record<string, number | string | null>;
const NaN_ = Number.NaN;
const has = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const num = (v: unknown): number => (v === null || v === undefined || v === "" ? NaN_ : Number(v));
const clip = (v: number, lo: number, hi: number) => (Number.isNaN(v) ? v : Math.min(Math.max(v, lo), hi));

/** Exact port of src/features.py add_features for one row. */
export function addFeatures(r: Row): Record<string, number> {
  const burn = num(r.monthly_burn), mrr = num(r.mrr), gm = num(r.gross_margin_pct), cash = num(r.cash_balance);
  const cac = num(r.cac), ltv = num(r.ltv), team = num(r.team_size);
  let net = burn - (mrr * gm) / 100;
  if (!Number.isNaN(net)) net = Math.max(net, 0.05);
  const runway = Number.isNaN(net) || Number.isNaN(cash) ? NaN_ : clip(cash / net, 0, 60);
  let ratio = NaN_;
  if (!Number.isNaN(cac) && !Number.isNaN(ltv)) {
    if (cac > 0) ratio = ltv / cac;
    else ratio = ltv > 0 ? 15 : 0;
  }
  ratio = clip(ratio, 0, 15);
  let bm = NaN_;
  if (!Number.isNaN(net) && !Number.isNaN(mrr)) bm = mrr > 0 ? net / mrr : 60;
  bm = clip(bm, 0, 60);
  const cover = burn > 0 ? clip(mrr / burn, 0, 3) : NaN_;
  const perHead = team > 0 ? burn / team : NaN_;
  const gp = (mrr * gm) / 100;
  const profitable = Number.isNaN(gp) || Number.isNaN(burn) ? NaN_ : gp >= burn ? 1 : 0;
  const out: Record<string, number> = {};
  for (const k of [
    "team_size", "months_operating", "founder_experience_yrs", "monthly_burn", "cash_balance", "mrr",
    "mrr_growth_pct", "gross_margin_pct", "monthly_churn_pct", "cac", "ltv", "total_funding_raised", "prior_rounds",
  ]) out[k] = num(r[k]);
  Object.assign(out, {
    net_burn: net, runway_months: runway, ltv_cac_ratio: ratio, burn_multiple: bm,
    revenue_cover: cover, burn_per_head: perHead, is_profitable: profitable,
  });
  return out;
}

export class Engine {
  constructor(private data: OfflineData) {}

  get model() {
    return this.data.fallback_model;
  }

  /** Logistic fallback probability for an already-validated row. */
  probability(r: Row): number {
    const m = this.data.fallback_model;
    const f = addFeatures(r);
    const values = m.numeric_features.map((k, i) => {
      const v = f[k];
      return Number.isNaN(v) ? NaN_ : clip(v, m.winsor_lower[i], m.winsor_upper[i]);
    });
    const imputed = values.map((v, i) => (Number.isNaN(v) ? m.impute_median[i] : v));
    const indicators = m.indicator_features.map((k) => (Number.isNaN(values[m.numeric_features.indexOf(k)]) ? 1 : 0));
    const block = [...imputed, ...indicators].map((v, i) => (v - m.scaler_mean[i]) / (m.scaler_scale[i] || 1));
    for (const c of m.categorical_features) {
      for (const cat of m.categories[c]) block.push(String(r[c]) === cat ? 1 : 0);
    }
    const z = block.reduce((s, v, i) => s + v * m.coef[i], m.intercept);
    return 1 / (1 + Math.exp(-z));
  }

  normalise(raw: Partial<StartupInput>): { clean: Row; errors: string[] } {
    const { clean, errors } = validate(raw);
    if (errors.length) return { clean, errors };
    const arpu = clean.arpu as number | null;
    if (!has(clean.ltv) && has(arpu)) {
      const churn = clean.monthly_churn_pct, gm = clean.gross_margin_pct;
      if (has(churn) && churn > 0 && has(gm)) clean.ltv = (arpu * (gm / 100)) / (churn / 100);
    }
    return { clean, errors };
  }

  private gm(r: Row) {
    return has(r.gross_margin_pct) ? r.gross_margin_pct : this.data.raw_medians.gross_margin_pct;
  }

  subscores(f: Record<string, number>) {
    const ok = (v: number) => !Number.isNaN(v);
    const runway = ok(f.runway_months) ? Math.min(f.runway_months / 18, 1) * 100 : 50;
    const unit = ok(f.ltv_cac_ratio) ? Math.min(f.ltv_cac_ratio / 3, 1) * 100 : 50;
    const growth = ok(f.mrr_growth_pct) ? clip((f.mrr_growth_pct + 5) / 15, 0, 1) * 100 : 50;
    const retention = ok(f.monthly_churn_pct) ? Math.max(0, 100 - 8 * f.monthly_churn_pct) : 50;
    const traction =
      ok(f.revenue_cover) && ok(f.months_operating)
        ? ((Math.min(f.revenue_cover / 0.6, 1) + Math.min(f.months_operating / 24, 1)) / 2) * 100
        : 50;
    return { Runway: Math.max(runway, 0), "Unit economics": Math.max(unit, 0), Growth: growth, Retention: retention, Traction: traction };
  }

  readiness(sub: ReturnType<Engine["subscores"]>, p: number) {
    const v = 0.25 * sub.Runway + 0.25 * sub["Unit economics"] + 0.2 * sub.Growth + 0.15 * sub.Retention + 0.15 * sub.Traction - 15 * p;
    return clip(v, 0, 100);
  }

  growthBurnMultiple(net: number, mrr: number, g: number): number | null {
    const netNew = (mrr * g) / 100;
    return netNew > 0 ? Math.max(net, 0) / netNew : null;
  }

  kpis(r: Row): Kpis {
    const f = addFeatures(r);
    const net = (r.monthly_burn as number) - ((r.mrr as number) * this.gm(r)) / 100;
    return {
      net_burn: net,
      runway_months: f.runway_months,
      profitable: net <= 0,
      ltv: has(r.ltv) ? r.ltv : null,
      ltv_cac: Number.isNaN(f.ltv_cac_ratio) ? null : f.ltv_cac_ratio,
      burn_multiple: this.growthBurnMultiple(net, r.mrr as number, r.mrr_growth_pct as number),
      churn_pct: has(r.monthly_churn_pct) ? r.monthly_churn_pct : null,
      growth_pct: r.mrr_growth_pct as number,
      arpu: has(r.arpu) ? r.arpu : null,
    };
  }

  private replaceGroups(r: Row) {
    const groups: Record<string, string[]> = {
      "Runway and burn": ["monthly_burn", "cash_balance"],
      "Revenue and growth": ["mrr", "mrr_growth_pct"],
      "Unit economics": ["cac", "ltv", "gross_margin_pct"],
      Retention: ["monthly_churn_pct"],
      "Team and experience": ["team_size", "founder_experience_yrs", "months_operating"],
      "Funding history": ["total_funding_raised", "prior_rounds", "stage", "sector"],
    };
    return Object.entries(groups).map(([g, fields]) => {
      const v: Row = { ...r };
      for (const k of fields) v[k] = k in this.data.categorical_modes ? this.data.categorical_modes[k] : this.data.raw_medians[k];
      return [g, v] as const;
    });
  }

  private subject(group: string, r: Row, f: Record<string, number>) {
    const fx = (v: number, d = 1) => v.toFixed(d);
    switch (group) {
      case "Runway and burn":
        return f.runway_months >= 60 ? "Runway of 60+ months" : `Runway of ${fx(f.runway_months)} months`;
      case "Revenue and growth":
        return `MRR of ₹${fx(r.mrr as number)} L growing ${fx(r.mrr_growth_pct as number)}% MoM`;
      case "Unit economics":
        if (!Number.isNaN(f.ltv_cac_ratio)) return `LTV:CAC of ${fx(f.ltv_cac_ratio)}`;
        return has(r.gross_margin_pct) ? `Gross margin of ${fx(r.gross_margin_pct)}%` : "Missing unit-economics data";
      case "Retention":
        return has(r.monthly_churn_pct) ? `Monthly churn of ${fx(r.monthly_churn_pct)}%` : "Missing churn data";
      case "Team and experience":
        return has(r.founder_experience_yrs) ? `Founder experience of ${fx(r.founder_experience_yrs)} years` : `A team of ${r.team_size} people`;
      default: {
        const n = r.prior_rounds as number;
        return `${n} prior round${n === 1 ? "" : "s"} (₹${fx(r.total_funding_raised as number)} L raised)`;
      }
    }
  }

  explainRow(r: Row): ExplainResponse {
    const base = this.probability(r);
    const f = addFeatures(r);
    const drivers = this.replaceGroups(r)
      .map(([group, v]) => {
        const delta = (base - this.probability(v)) * 100;
        const subj = this.subject(group, r, f);
        const sentence =
          Math.abs(delta) < 0.05 ? `${subj} is not moving your risk.` : `${subj} is ${delta > 0 ? "increasing" : "decreasing"} your risk by ${Math.abs(delta).toFixed(1)} points.`;
        return { group, delta_pp: delta, sentence };
      })
      .sort((a, b) => b.delta_pp - a.delta_pp);
    return {
      drivers,
      method: "Each factor group is replaced by the training median/mode and the model re-run (offline logistic fallback).",
      caveat: "Model-based association, not causation.",
    };
  }

  projection(r: Row, months = 12): Projection {
    const g0 = r.mrr_growth_pct as number;
    const scen = {
      best: { g: g0 > 0 ? g0 * 1.25 : g0 + 2, b: 0.9 },
      base: { g: g0, b: 1 },
      worst: { g: g0 * 0.5 - 2, b: 1.1 },
    };
    const gm = this.gm(r) / 100;
    const run = (g: number, bm: number) => {
      const gg = Math.min(g, 30) / 100;
      const burn = (r.monthly_burn as number) * bm;
      let cash = r.cash_balance as number, mrr = r.mrr as number;
      const rows = [];
      for (let t = 0; t <= months; t++) {
        const net = burn - mrr * gm;
        rows.push({ month: t, cash, mrr, net });
        cash -= net;
        mrr = Math.max(mrr * (1 + gg), 0);
      }
      return rows;
    };
    const bands = { best: run(scen.best.g, scen.best.b), base: run(scen.base.g, 1), worst: run(scen.worst.g, scen.worst.b) };
    const cashout = (rows: { month: number; cash: number }[]) => {
      if (rows[0].cash <= 0) return 0;
      for (let i = 1; i < rows.length; i++) if (rows[i].cash <= 0) return rows[i - 1].month + rows[i - 1].cash / (rows[i - 1].cash - rows[i].cash);
      return null;
    };
    const series: ProjectionPoint[] = bands.base.map((b, i) => {
      const row: Row = { ...r, cash_balance: Math.max(b.cash, 0), mrr: Math.min(b.mrr, 100000), months_operating: Math.min((r.months_operating as number) + b.month, 240) };
      const p = this.probability(row);
      const f = addFeatures(row);
      const prev = i ? bands.base[i - 1].mrr : b.mrr / (1 + Math.min(g0, 30) / 100);
      const netNew = b.mrr - prev;
      return {
        month: b.month,
        cash_base: b.cash,
        cash_best: bands.best[i].cash,
        cash_worst: bands.worst[i].cash,
        mrr: b.mrr,
        risk: p,
        readiness: this.readiness(this.subscores(f), p),
        runway: f.runway_months,
        burn_multiple: netNew > 0 ? Math.max(b.net, 0) / netNew : null,
        ltv_cac: Number.isNaN(f.ltv_cac_ratio) ? null : f.ltv_cac_ratio,
        churn: has(r.monthly_churn_pct) ? r.monthly_churn_pct : null,
      };
    });
    return {
      series,
      cashout_month: { best: cashout(bands.best), base: cashout(bands.base), worst: cashout(bands.worst) },
      assumptions: {
        base: "Current burn and MoM growth held constant.",
        best: "Growth x1.25 (or +2 pts if not positive), burn -10%.",
        worst: "Growth x0.5 - 2 pts, burn +10%.",
        growth_cap_pct: 30,
      },
    };
  }

  private peerFrame(sector: string, stage: string) {
    const { columns, rows } = this.data.peers;
    const ix = (c: string) => columns.indexOf(c);
    let sel = rows.filter((r) => r[ix("sector")] === sector && r[ix("stage")] === stage);
    const fallback = sel.length < 30;
    if (fallback) sel = rows.filter((r) => r[ix("stage")] === stage);
    const col = (c: string) => sel.map((r) => r[ix(c)]).filter((v): v is number => typeof v === "number");
    return { sel, col, fallback };
  }

  peerMedians(r: Row): PeerMedians {
    const { sel, col } = this.peerFrame(r.sector as string, r.stage as string);
    const { columns } = this.data.peers;
    const ix = (c: string) => columns.indexOf(c);
    const bm = sel
      .map((p) => this.growthBurnMultiple(p[ix("net_burn")] as number, p[ix("mrr")] as number, p[ix("mrr_growth_pct")] as number))
      .filter((v): v is number => v !== null && Number.isFinite(v))
      .map((v) => Math.min(v, 60));
    return {
      n: sel.length,
      runway_months: median(col("runway_months")),
      ltv_cac: median(col("ltv_cac_ratio")),
      burn_multiple: bm.length ? median(bm) : null,
      churn_pct: median(col("monthly_churn_pct")),
      growth_pct: median(col("mrr_growth_pct")),
    };
  }

  benchmarkRow(r: Row): BenchmarkResponse {
    const { sel, col, fallback } = this.peerFrame(r.sector as string, r.stage as string);
    const f = addFeatures(r);
    const defs: [string, string, string, boolean][] = [
      ["runway_months", "Runway", "months", false],
      ["mrr_growth_pct", "MoM growth", "%", false],
      ["monthly_churn_pct", "Monthly churn", "%", true],
      ["ltv_cac_ratio", "LTV:CAC", "x", false],
      ["burn_multiple", "Burn multiple", "x", true],
    ];
    const metrics = defs.map(([key, label, unit, lower]) => {
      const c = col(key);
      const v = f[key];
      const ok = !Number.isNaN(v) && c.length > 0;
      const better = ok ? (c.filter((x) => (lower ? x > v : x < v)).length / c.length) * 100 : null;
      return { key, label, unit, lower_is_better: lower, value: Number.isNaN(v) ? null : v, median: c.length ? median(c) : null, better_than: better };
    });
    const { columns } = this.data.peers;
    const ix = (c: string) => columns.indexOf(c);
    const peers = sel
      .filter((p) => typeof p[ix("monthly_churn_pct")] === "number")
      .slice(0, 600)
      .map((p) => ({ runway_months: p[ix("runway_months")] as number, monthly_churn_pct: p[ix("monthly_churn_pct")] as number }));
    return {
      n: sel.length,
      sector: fallback ? "All sectors" : (r.sector as string),
      stage: r.stage as string,
      fallback,
      metrics,
      peers,
      you: { runway_months: f.runway_months, monthly_churn_pct: has(r.monthly_churn_pct) ? r.monthly_churn_pct : null },
    };
  }

  applyLevers(r: Row, l: Partial<Levers>): Row {
    const c = (k: string, v: number) => {
      const bounds: Record<string, [number, number]> = {
        monthly_burn: [0.01, 100000], mrr_growth_pct: [-50, 200], cac: [0, Infinity], monthly_churn_pct: [0, 100], mrr: [0, 100000],
      };
      const [lo, hi] = bounds[k];
      return Math.min(Math.max(v, lo), hi);
    };
    const out: Row = { ...r };
    const price = l.price_pct ?? 0;
    if (price) {
      out.mrr = c("mrr", (r.mrr as number) * (1 + price / 100));
      if (has(r.ltv)) out.ltv = r.ltv * (1 + price / 100);
    }
    out.monthly_burn = c("monthly_burn", (r.monthly_burn as number) * (1 + (l.burn_pct ?? 0) / 100));
    out.mrr_growth_pct = c("mrr_growth_pct", (r.mrr_growth_pct as number) + (l.growth_pts ?? 0));
    if (has(r.cac)) out.cac = c("cac", r.cac * (1 + (l.cac_pct ?? 0) / 100));
    const old = r.monthly_churn_pct;
    if (has(old) && l.churn_pct) {
      const nw = c("monthly_churn_pct", old * (1 + l.churn_pct / 100));
      out.monthly_churn_pct = nw;
      if (has(out.ltv) && old > 0 && nw > 0) out.ltv = (out.ltv as number) * (old / nw);
    }
    return out;
  }

  actionPlan(r: Row): Action[] {
    const base = this.probability(r);
    const more = { ...r, cash_balance: Math.min((r.cash_balance as number) + 6 * (r.monthly_burn as number), 1000000) };
    const items: [string, string, Row][] = [
      ["Cut burn 15%", "Lower monthly burn by 15%; trim non-core spend first.", this.applyLevers(r, { burn_pct: -15 })],
      ["Cut churn 30%", "Lower monthly churn by 30%; LTV rises in proportion.", this.applyLevers(r, { churn_pct: -30 })],
      ["Grow MRR 3 pts faster", "Add 3 points to month-on-month MRR growth.", this.applyLevers(r, { growth_pts: 3 })],
      ["Cut CAC 20%", "Lower customer acquisition cost by 20%.", this.applyLevers(r, { cac_pct: -20 })],
      ["Raise prices 10%", "ARPU +10% with churn held constant (no demand response modelled).", this.applyLevers(r, { price_pct: 10 })],
      ["Add 6 months of burn to cash", "Raise or bridge 6 x monthly burn in new cash.", more],
    ];
    return items
      .map(([action, note, v]) => ({ action, note, risk_change_pp: (this.probability(v) - base) * 100 }))
      .sort((a, b) => a.risk_change_pp - b.risk_change_pp);
  }

  predict(raw: Partial<StartupInput>): PredictResponse {
    const { clean, errors } = this.normalise(raw);
    if (errors.length) throw new InputError(errors);
    const p = this.probability(clean);
    const f = addFeatures(clean);
    const sub = this.subscores(f);
    const missing = ["founder_experience_yrs", "gross_margin_pct", "monthly_churn_pct", "cac", "ltv"].filter((k) => !has(clean[k]));
    const ex = this.explainRow(clean).drivers;
    const pick = (d: Driver[]) => d.map(({ group, delta_pp, sentence }) => ({ group, delta_pp, sentence }));
    const warnings = [
      ...(missing.length ? [`${missing.length} fields missing: lower confidence.`] : []),
      "Offline mode: scored in your browser with a plain logistic fallback; it is not the calibrated API model.",
    ];
    return {
      input: clean as unknown as StartupInput,
      result: {
        probability: p,
        band: bandFor(p),
        readiness_score: this.readiness(sub, p),
        subscores: sub,
        top_negative: pick(ex.filter((d) => d.delta_pp >= 0.05).slice(0, 3)),
        top_positive: pick(ex.filter((d) => d.delta_pp <= -0.05).reverse().slice(0, 3)),
        runway_months: f.runway_months,
        net_burn: Number.isNaN(f.net_burn) ? null : f.net_burn,
        missing_count: missing.length,
        missing_fields: missing,
        warnings,
      },
      kpis: this.kpis(clean),
      peer_medians: this.peerMedians(clean),
      projection: this.projection(clean),
      synthetic: true,
    };
  }

  explain(raw: Partial<StartupInput>): ExplainResponse {
    const { clean, errors } = this.normalise(raw);
    if (errors.length) throw new InputError(errors);
    return this.explainRow(clean);
  }

  benchmark(raw: Partial<StartupInput>): BenchmarkResponse {
    const { clean, errors } = this.normalise(raw);
    if (errors.length) throw new InputError(errors);
    return this.benchmarkRow(clean);
  }

  simulate(raw: Partial<StartupInput>, levers: Levers, withPlan = false): SimulateResponse {
    const { clean, errors } = this.normalise(raw);
    if (errors.length) throw new InputError(errors);
    const order: (keyof Levers)[] = ["burn_pct", "churn_pct", "cac_pct", "growth_pts", "price_pct"];
    const label: Record<keyof Levers, string> = { burn_pct: "Burn", churn_pct: "Churn", cac_pct: "CAC", growth_pts: "Growth", price_pct: "Price" };
    const base = this.probability(clean);
    const scenarioRow = this.applyLevers(clean, levers);
    const scen = this.probability(scenarioRow);
    const partial: Partial<Levers> = {};
    let prev = base;
    const waterfall = order.map((k) => {
      partial[k] = levers[k];
      const p = this.probability(this.applyLevers(clean, partial));
      const step = { lever: label[k], key: k, value: levers[k], delta_pp: (p - prev) * 100 };
      prev = p;
      return step;
    });
    const individual = order.map((k) => ({ lever: label[k], key: k, delta_pp: (this.probability(this.applyLevers(clean, { [k]: levers[k] })) - base) * 100 }));
    const fb = addFeatures(clean), fs = addFeatures(scenarioRow);
    return {
      baseline: { probability: base, band: bandFor(base), readiness: this.readiness(this.subscores(fb), base), runway_months: fb.runway_months },
      scenario: { probability: scen, band: bandFor(scen), readiness: this.readiness(this.subscores(fs), scen), runway_months: fs.runway_months },
      delta_pp: (scen - base) * 100,
      waterfall,
      individual,
      action_plan: withPlan ? this.actionPlan(clean) : undefined,
      caveat: "Model-based association, not causation. Offline logistic fallback on SYNTHETIC data.",
    };
  }

  batch(rows: Record<string, unknown>[]): BatchResponse {
    const out: BatchRow[] = rows.map((row, i) => {
      const id = String(row.startup_id ?? `ROW-${String(i + 1).padStart(5, "0")}`);
      const { clean, errors } = this.normalise(row as Partial<StartupInput>);
      if (errors.length) return { startup_id: id, error: errors.join("; ") };
      const p = this.probability(clean);
      const f = addFeatures(clean);
      const k = this.kpis(clean);
      return {
        startup_id: id, error: null, sector: clean.sector as string, stage: clean.stage as string,
        probability: p, band: bandFor(p), readiness: this.readiness(this.subscores(f), p), runway_months: f.runway_months,
        mrr: clean.mrr as number, churn_pct: k.churn_pct, ltv_cac: k.ltv_cac, burn_multiple: k.burn_multiple,
        missing: ["founder_experience_yrs", "gross_margin_pct", "monthly_churn_pct", "cac", "ltv"].filter((m) => !has(clean[m])),
      };
    });
    const ok = out.filter((r) => !r.error);
    return {
      rows: out,
      summary: {
        total: out.length, ok: ok.length, errors: out.length - ok.length,
        bands: { Low: ok.filter((r) => r.band === "Low").length, Medium: ok.filter((r) => r.band === "Medium").length, High: ok.filter((r) => r.band === "High").length },
      },
    };
  }
}

export class InputError extends Error {
  constructor(public errors: string[]) {
    super(errors.join("; "));
  }
}

export function median(xs: number[]): number {
  if (!xs.length) return NaN_;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type { Clean };
