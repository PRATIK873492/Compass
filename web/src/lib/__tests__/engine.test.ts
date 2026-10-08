import { describe, expect, it } from "vitest";
import data from "../../data/offline.json";
import { addFeatures, Engine, type OfflineData } from "../engine";
import { PRESETS, validate } from "../schema";

const engine = new Engine(data as unknown as OfflineData);

describe("offline engine", () => {
  it("matches Python's fallback logistic probabilities on exported fixtures", () => {
    for (const fx of engine.model.fixtures) {
      const p = engine.probability(fx.input as Record<string, number | string | null>);
      expect(Math.abs(p - fx.probability)).toBeLessThan(1e-9);
    }
    expect(engine.model.fixtures.length).toBe(12);
  });

  it("engineers features like src/features.py", () => {
    const f = addFeatures({ monthly_burn: 10, mrr: 20, gross_margin_pct: 80, cash_balance: 100, cac: 0, ltv: 2, team_size: 5 });
    expect(f.net_burn).toBe(0.05);
    expect(f.runway_months).toBe(60);
    expect(f.ltv_cac_ratio).toBe(15);
    expect(f.is_profitable).toBe(1);
  });

  it("orders presets healthy < high-growth < struggling", () => {
    const p = (k: string) => engine.predict(PRESETS[k]).result.probability;
    expect(p("Healthy SaaS")).toBeLessThan(p("High-growth Fintech"));
    expect(p("High-growth Fintech")).toBeLessThan(p("Struggling D2C"));
  });

  it("validation messages mirror the API", () => {
    const { errors } = validate({ ...PRESETS["Healthy SaaS"], monthly_churn_pct: 150, mrr: "x" as never });
    expect(errors).toContain("Monthly churn must be between 0 and 100");
    expect(errors).toContain("MRR must be a number");
  });

  it("waterfall sums to the scenario delta and batch keeps bad rows", () => {
    const s = engine.simulate(PRESETS["High-growth Fintech"], { burn_pct: -20, churn_pct: -30, cac_pct: -10, growth_pts: 3, price_pct: 10 });
    const sum = s.waterfall.reduce((a, w) => a + w.delta_pp, 0);
    expect(sum).toBeCloseTo(s.delta_pp, 9);
    const b = engine.batch([{ ...PRESETS["Healthy SaaS"] }, { ...PRESETS["Healthy SaaS"], cash_balance: -1 }]);
    expect(b.summary).toMatchObject({ total: 2, ok: 1, errors: 1 });
  });

  it("derives LTV from ARPU", () => {
    const r = engine.predict({ ...PRESETS["High-growth Fintech"], ltv: null, arpu: 0.2 });
    expect(r.kpis.ltv).toBeCloseTo((0.2 * 0.62) / 0.05, 9);
  });
});
