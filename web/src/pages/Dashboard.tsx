import { AlertTriangle, Download, Gauge, Loader2, PencilLine, Save, SlidersHorizontal } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { DriversChart, PercentileBars, RunwayChart } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Chip, RiskBadge, Skeleton, SyntheticBadge } from "@/components/ui/primitives";
import { DeltaChip, EmptyState, ErrorState, KpiCard, Radar, RiskGauge } from "@/components/viz";
import { api, InputError } from "@/lib/api";
import { isNum, monthToDate, months, pct, prob, pts, ratio } from "@/lib/format";
import { exportReport } from "@/lib/report";
import { PRESETS } from "@/lib/schema";
import { useApp, ZERO_LEVERS } from "@/lib/store";
import { useAsync } from "@/lib/useAsync";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { input, hasStartup, setPage, setInput, saveScenario, mode } = useApp();
  const key = JSON.stringify(input) + mode;
  const pred = useAsync(() => api.predict(input), key, hasStartup);
  const ex = useAsync(() => api.explain(input), key, hasStartup);
  const bench = useAsync(() => api.benchmark(input), key, hasStartup);
  const ref = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const name = input.name || "My startup";

  const onExport = useCallback(async () => {
    if (!pred.data || !ref.current) return;
    setExporting(true);
    const id = toast.loading("Building PDF report...");
    try {
      await exportReport(ref.current, pred.data, name, mode);
      toast.success("PDF downloaded", { id });
    } catch (e) {
      toast.error("PDF export failed", { id, description: e instanceof Error ? e.message : String(e) });
    } finally {
      setExporting(false);
    }
  }, [pred.data, name, mode]);

  if (!hasStartup) {
    return (
      <EmptyState
        icon={<Gauge />}
        title="No startup yet"
        body="Enter your numbers or load the demo to see your 24-month risk, drivers and runway."
        action={
          <>
            <Button variant="primary" onClick={() => setInput(PRESETS["High-growth Fintech"])}>Load demo startup</Button>
            <Button onClick={() => setPage("input")}><PencilLine /> Enter your startup</Button>
          </>
        }
      />
    );
  }
  if (pred.error) {
    const errs = pred.error instanceof InputError ? pred.error.errors : [pred.error.message];
    return (
      <div className="space-y-4">
        <ErrorState title={pred.error instanceof InputError ? "Some inputs are invalid" : "Could not score this startup"} errors={errs} onRetry={pred.reload} />
        <Button onClick={() => setPage("input")}><PencilLine /> Fix inputs</Button>
      </div>
    );
  }
  if (!pred.data) return <DashboardSkeleton />;

  const d = pred.data, r = d.result, k = d.kpis, pm = d.peer_medians, s = d.projection.series;
  const last = s[s.length - 1];
  const riskTrend = (last.risk - s[0].risk) * 100;
  const co = d.projection.cashout_month;

  return (
    <div ref={ref} className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-semibold tracking-tight text-fg">{name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Chip>{d.input.sector}</Chip>
            <Chip>{d.input.stage}</Chip>
            <RiskBadge band={r.band} />
            <SyntheticBadge />
            {pred.loading && <Loader2 className="h-4 w-4 animate-spin text-muted" aria-label="Updating" />}
          </div>
        </div>
        <div className="no-print ml-auto flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setPage("input")}><PencilLine /> Edit inputs</Button>
          <Button size="sm" onClick={() => setPage("simulator")}><SlidersHorizontal /> What-if</Button>
          <Button
            size="sm"
            onClick={() => {
              saveScenario({ id: crypto.randomUUID(), name: `${name} · baseline`, savedAt: new Date().toISOString(), input, levers: ZERO_LEVERS, probability: r.probability });
              toast.success("Scenario saved", { description: "Compare it in the What-if simulator." });
            }}
          >
            <Save /> Save
          </Button>
          <Button size="sm" variant="primary" onClick={onExport} disabled={exporting}>
            {exporting ? <Loader2 className="animate-spin" /> : <Download />} Export PDF
          </Button>
        </div>
      </div>

      {r.warnings.length > 0 && (
        <div className="glass flex gap-3 border-medium/40 p-3 text-xs text-fg" role="status">
          <AlertTriangle className="h-4 w-4 shrink-0 text-medium" />
          <ul className="space-y-0.5">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}

      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          glow
          label="Risk probability"
          value={r.probability}
          format={prob}
          hint="Probability of failing within 24 months. The sparkline re-scores your startup month by month if nothing changes."
          spark={s.map((p) => p.risk * 100)}
          sparkFormat={(v) => `${v.toFixed(1)}%`}
          delta={<span className={cn("text-[11px] font-medium", riskTrend > 0.05 ? "text-high" : riskTrend < -0.05 ? "text-low" : "text-muted")}>{pts(riskTrend)} in 12 months if unchanged</span>}
        >
          <RiskGauge probability={r.probability} band={r.band} size={190} />
        </KpiCard>
        <KpiCard
          label="Runway"
          value={k.runway_months}
          format={(v) => (v >= 60 ? "60+ mo" : `${v.toFixed(1)} mo`)}
          hint="Cash ÷ net burn, where net burn = burn − MRR × gross margin. Capped at 60 months."
          spark={s.map((p) => p.runway)}
          sparkFormat={months}
          delta={<DeltaChip you={k.runway_months} peer={pm.runway_months} format={(v) => `${v.toFixed(1)} mo`} />}
        />
        <KpiCard
          label="LTV:CAC"
          value={k.ltv_cac}
          format={(v) => `${v.toFixed(1)}×`}
          hint="Lifetime value ÷ acquisition cost. LTV = ARPU × gross margin ÷ churn. 3× or more is healthy."
          spark={s.map((p) => p.ltv_cac)}
          sparkFormat={ratio}
          delta={<DeltaChip you={k.ltv_cac} peer={pm.ltv_cac} format={(v) => `${v.toFixed(1)}×`} />}
        />
        <KpiCard
          label="Burn multiple"
          value={k.burn_multiple}
          format={(v) => `${v.toFixed(1)}×`}
          hint="Net burn ÷ net new MRR. Below 2× is efficient; n/a when MRR is not growing."
          spark={s.map((p) => p.burn_multiple)}
          sparkFormat={ratio}
          delta={<DeltaChip you={k.burn_multiple} peer={pm.burn_multiple} lowerIsBetter format={(v) => `${v.toFixed(1)}×`} />}
        />
        <KpiCard
          label="Monthly churn"
          value={k.churn_pct}
          format={(v) => `${v.toFixed(1)}%`}
          hint="Share of customers or revenue lost each month. Held constant in the projection."
          spark={s.map((p) => p.churn)}
          sparkFormat={pct}
          delta={<DeltaChip you={k.churn_pct} peer={pm.churn_pct} lowerIsBetter format={(v) => `${v.toFixed(1)}%`} />}
        />
        <KpiCard
          label="Readiness score"
          value={r.readiness_score}
          format={(v) => v.toFixed(0)}
          hint="0–100 composite of runway, unit economics, growth, retention and traction, minus 15 × risk."
          spark={s.map((p) => p.readiness)}
          sparkFormat={(v) => v.toFixed(0)}
          delta={<span className="text-[11px] text-muted">{(last.readiness - s[0].readiness >= 0 ? "▲ " : "▼ ") + Math.abs(last.readiness - s[0].readiness).toFixed(0)} in 12 months if unchanged</span>}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Risk drivers" subtitle="Each factor group swapped for the training median; bars show its push on your risk, in points." />
          {ex.data ? (
            <>
              <DriversChart drivers={ex.data.drivers} />
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {ex.data.drivers.filter((x) => Math.abs(x.delta_pp) >= 0.05).map((x) => (
                  <li key={x.group} className="flex gap-2 rounded-xl bg-[var(--surface)] p-3 text-sm leading-snug text-fg">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", x.delta_pp > 0 ? "bg-high" : "bg-low")} aria-hidden />
                    {x.sentence}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-muted">{ex.data.caveat}</p>
            </>
          ) : ex.error ? (
            <ErrorState errors={[ex.error.message]} onRetry={ex.reload} />
          ) : (
            <Skeleton className="h-64" />
          )}
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Readiness radar" subtitle="Sub-scores 0–100; 50 when an input is missing." />
          <div className="flex justify-center">
            <Radar scores={r.subscores} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title="Cash runway projection"
            subtitle={`Base case cash-out: ${co.base === null ? "beyond 12 months" : `~${monthToDate(co.base)} (month ${co.base.toFixed(1)})`}. Band spans worst to best case.`}
          />
          <RunwayChart projection={d.projection} />
          <p className="mt-2 text-[11px] text-muted">
            Base: {String(d.projection.assumptions.base)} Best: {String(d.projection.assumptions.best)} Worst: {String(d.projection.assumptions.worst)}
          </p>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader
            title="Peer benchmark"
            subtitle={bench.data ? `${bench.data.n.toLocaleString()} ${bench.data.fallback ? "same-stage" : "same sector & stage"} peers (synthetic). Tick = median.` : "Loading peers..."}
          />
          {bench.data ? <PercentileBars metrics={bench.data.metrics} /> : bench.error ? <ErrorState errors={[bench.error.message]} onRetry={bench.reload} /> : <Skeleton className="h-64" />}
        </Card>
      </div>
      <p className="text-[11px] text-muted">
        Inputs: burn {isNum(d.input.monthly_burn) ? `₹${d.input.monthly_burn} L` : "n/a"}/mo, cash ₹{d.input.cash_balance} L, MRR ₹{d.input.mrr} L, growth {d.input.mrr_growth_pct}% MoM.
        Scored by the {mode === "api" ? "calibrated FastAPI model" : "in-browser logistic fallback"}.
      </p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Scoring your startup">
      <Skeleton className="h-12 w-72" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        <Skeleton className="h-80 xl:col-span-3" />
        <Skeleton className="h-80 xl:col-span-2" />
      </div>
    </div>
  );
}
