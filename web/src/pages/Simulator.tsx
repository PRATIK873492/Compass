import { motion } from "framer-motion";
import { ArrowRight, Info, ListOrdered, Loader2, RotateCcw, Save, SlidersHorizontal, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { WaterfallChart } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, RiskBadge, Skeleton, Slider } from "@/components/ui/primitives";
import { EmptyState, ErrorState, RiskGauge } from "@/components/viz";
import { api, InputError } from "@/lib/api";
import { months, prob, pts } from "@/lib/format";
import { PRESETS } from "@/lib/schema";
import { useApp, type SavedScenario } from "@/lib/store";
import type { Action, Levers } from "@/lib/types";
import { useAsync, useDebounced } from "@/lib/useAsync";
import { cn } from "@/lib/utils";

const LEVERS: { key: keyof Levers; label: string; min: number; max: number; unit: string; hint: string }[] = [
  { key: "burn_pct", label: "Monthly burn", min: -50, max: 50, unit: "%", hint: "Scale total monthly spend." },
  { key: "churn_pct", label: "Monthly churn", min: -80, max: 50, unit: "%", hint: "Scale churn; LTV rescales by old ÷ new churn." },
  { key: "cac_pct", label: "CAC", min: -50, max: 50, unit: "%", hint: "Scale customer acquisition cost." },
  { key: "growth_pts", label: "MoM growth", min: -10, max: 10, unit: " pts", hint: "Add or remove points of monthly growth." },
  { key: "price_pct", label: "Price (ARPU)", min: -30, max: 30, unit: "%", hint: "Scales MRR and LTV; no demand response is modelled." },
];

const ACTION_LEVERS: Record<string, Partial<Levers>> = {
  "Cut burn 15%": { burn_pct: -15 },
  "Cut churn 30%": { churn_pct: -30 },
  "Grow MRR 3 pts faster": { growth_pts: 3 },
  "Cut CAC 20%": { cac_pct: -20 },
  "Raise prices 10%": { price_pct: 10 },
};

export default function Simulator() {
  const { input, hasStartup, levers, setLevers, resetLevers, setInput, setPage, mode, scenarios, saveScenario, deleteScenario } = useApp();
  const debounced = useDebounced(levers, 120);
  const sim = useAsync(() => api.simulate(input, debounced), JSON.stringify([input, debounced, mode]), hasStartup);
  const [plan, setPlan] = useState<Action[] | null>(null);
  const [planning, setPlanning] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);

  if (!hasStartup) {
    return (
      <EmptyState
        icon={<SlidersHorizontal />}
        title="Nothing to simulate yet"
        body="Load a startup first, then move the levers to see the model's estimate change live."
        action={<Button variant="primary" onClick={() => setInput(PRESETS["High-growth Fintech"])}>Load demo startup</Button>}
      />
    );
  }

  const genPlan = async () => {
    setPlanning(true);
    try {
      const r = await api.simulate(input, levers, true);
      setPlan(r.action_plan ?? []);
      toast.success("Action plan ranked by estimated risk reduction");
    } catch (e) {
      toast.error("Could not build the plan", { description: e instanceof InputError ? e.errors.join("; ") : String(e) });
    } finally {
      setPlanning(false);
    }
  };
  const save = () => {
    const sc: SavedScenario = {
      id: crypto.randomUUID(),
      name: `${input.name || "Startup"} · ${LEVERS.filter((l) => levers[l.key]).map((l) => `${l.label} ${levers[l.key] > 0 ? "+" : ""}${levers[l.key]}${l.unit.trim()}`).join(", ") || "baseline"}`,
      savedAt: new Date().toISOString(),
      input,
      levers,
      probability: sim.data?.scenario.probability ?? null,
    };
    saveScenario(sc);
    toast.success("Scenario saved to this browser");
  };

  const d = sim.data;
  return (
    <div className="space-y-5">
      <div className="glass flex items-start gap-3 border-indigo/30 p-3 text-xs text-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo" />
        <p>
          <strong className="text-fg">Model-based association, not causation.</strong> Each change re-runs the {mode === "api" ? "calibrated API" : "offline fallback"} model on a copy of your inputs. Real outcomes depend on things the model never sees.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader
            title="Levers"
            subtitle={`Applied to ${input.name || "your startup"}; your saved inputs are not changed.`}
            action={<Button size="sm" variant="ghost" onClick={() => { resetLevers(); toast("Levers reset"); }}><RotateCcw /> Reset</Button>}
          />
          <div className="space-y-5">
            {LEVERS.map((l) => (
              <div key={l.key}>
                <div className="flex items-baseline justify-between text-sm">
                  <label id={`lbl-${l.key}`} className="font-medium text-fg">{l.label}</label>
                  <span className={cn("num text-sm font-semibold", levers[l.key] === 0 ? "text-muted" : "text-fg")}>
                    {levers[l.key] > 0 ? "+" : ""}{levers[l.key]}{l.unit}
                  </span>
                </div>
                <Slider
                  aria-labelledby={`lbl-${l.key}`}
                  aria-label={l.label}
                  min={l.min}
                  max={l.max}
                  step={1}
                  value={[levers[l.key]]}
                  onValueChange={([v]) => setLevers({ [l.key]: v })}
                />
                <p className="text-[11px] text-muted">{l.hint}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <Button onClick={save}><Save /> Save scenario</Button>
            <Button variant="primary" onClick={genPlan} disabled={planning}>
              {planning ? <Loader2 className="animate-spin" /> : <ListOrdered />} Auto action plan
            </Button>
          </div>
        </Card>

        <div className="space-y-5">
          {sim.error ? (
            <ErrorState errors={sim.error instanceof InputError ? sim.error.errors : [sim.error.message]} onRetry={sim.reload} />
          ) : !d ? (
            <Skeleton className="h-80" />
          ) : (
            <>
              <Card glow>
                <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
                  <div className="text-center">
                    <div className="mb-1 text-xs font-medium text-muted">Before</div>
                    <RiskGauge probability={d.baseline.probability} band={d.baseline.band} size={220} label="Baseline risk" />
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <ArrowRight className="hidden h-5 w-5 text-muted md:block" />
                    <motion.span
                      key={d.delta_pp.toFixed(1)}
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className={cn(
                        "num rounded-xl px-3 py-1.5 text-sm font-semibold ring-1",
                        Math.abs(d.delta_pp) < 0.05 ? "text-muted ring-[var(--border)]" : d.delta_pp < 0 ? "bg-low/10 text-low ring-low/30" : "bg-high/10 text-high ring-high/30",
                      )}
                      aria-live="polite"
                    >
                      {pts(d.delta_pp)} {Math.abs(d.delta_pp) < 0.05 ? "no change" : d.delta_pp < 0 ? "lower risk" : "higher risk"}
                    </motion.span>
                    {sim.loading && <Loader2 className="h-4 w-4 animate-spin text-muted" aria-label="Updating" />}
                  </div>
                  <div className="text-center">
                    <div className="mb-1 text-xs font-medium text-muted">After</div>
                    <RiskGauge probability={d.scenario.probability} band={d.scenario.band} size={220} label="Scenario risk" />
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-4 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Readiness</dt>
                    <dd className="num font-semibold text-fg">{d.baseline.readiness.toFixed(0)} → {d.scenario.readiness.toFixed(0)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Runway</dt>
                    <dd className="num font-semibold text-fg">{months(d.baseline.runway_months)} → {months(d.scenario.runway_months)}</dd>
                  </div>
                </dl>
              </Card>
              <Card>
                <CardHeader title="Risk change per lever" subtitle="Waterfall: levers applied cumulatively (burn → churn → CAC → growth → price). Steps sum to the total." />
                <WaterfallChart base={d.baseline.probability} steps={d.waterfall} />
                <ul className="mt-3 grid gap-2 text-xs sm:grid-cols-5">
                  {d.individual.map((i) => (
                    <li key={i.key} className="rounded-lg bg-[var(--surface)] px-2 py-1.5">
                      <div className="text-muted">{i.lever} alone</div>
                      <div className={cn("num font-semibold", i.delta_pp < -0.05 ? "text-low" : i.delta_pp > 0.05 ? "text-high" : "text-muted")}>{pts(i.delta_pp)}</div>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}

          {plan && (
            <Card>
              <CardHeader title="Action plan" subtitle="Six standard moves, each re-run through the model and ranked by estimated risk reduction. Estimates, not guaranteed outcomes." />
              <ol className="space-y-2">
                {plan.map((a, i) => {
                  const best = Math.max(...plan.map((p) => Math.abs(p.risk_change_pp)), 0.1);
                  const lev = ACTION_LEVERS[a.action];
                  return (
                    <li key={a.action} className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--surface)] p-3">
                      <span className="num accent-gradient flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white">{i + 1}</span>
                      <div className="min-w-40 flex-1">
                        <div className="text-sm font-medium text-fg">{a.action}</div>
                        <div className="text-[11px] text-muted">{a.note}</div>
                      </div>
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-[var(--border)]" aria-hidden>
                        <motion.div className={cn("h-full", a.risk_change_pp <= 0 ? "bg-low" : "bg-high")} initial={{ width: 0 }} animate={{ width: `${(Math.abs(a.risk_change_pp) / best) * 100}%` }} />
                      </div>
                      <span className={cn("num w-20 text-right text-sm font-semibold", a.risk_change_pp < -0.05 ? "text-low" : a.risk_change_pp > 0.05 ? "text-high" : "text-muted")}>{pts(a.risk_change_pp)}</span>
                      {lev && (
                        <Button size="sm" variant="ghost" onClick={() => { resetLevers(); setLevers(lev); toast(`Applied: ${a.action}`); }}>
                          Try it
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}
        </div>
      </div>

      <ScenarioCompare scenarios={scenarios} selected={compare} setSelected={setCompare} onDelete={deleteScenario} onLoad={(s) => { setInput(s.input); setLevers(s.levers); toast.success(`Loaded “${s.name}”`); }} onDash={() => setPage("dashboard")} />
    </div>
  );
}

function ScenarioCompare({
  scenarios,
  selected,
  setSelected,
  onDelete,
  onLoad,
  onDash,
}: {
  scenarios: SavedScenario[];
  selected: string[];
  setSelected: (s: string[]) => void;
  onDelete: (id: string) => void;
  onLoad: (s: SavedScenario) => void;
  onDash: () => void;
}) {
  const pair = selected.map((id) => scenarios.find((s) => s.id === id)).filter(Boolean) as SavedScenario[];
  const res = useAsync(() => Promise.all(pair.map((s) => api.simulate(s.input, s.levers))), JSON.stringify(pair.map((p) => p.id)), pair.length === 2);
  const toggle = (id: string) =>
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id].slice(-2));
  return (
    <Card>
      <CardHeader title="Saved scenarios" subtitle="Stored in this browser (localStorage). Pick two to compare side by side." action={<Button size="sm" variant="ghost" onClick={onDash}>Dashboard</Button>} />
      {scenarios.length === 0 ? (
        <p className="rounded-xl bg-[var(--surface)] p-4 text-sm text-muted">No saved scenarios yet. Use “Save scenario” above or “Save” on the dashboard.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {scenarios.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} aria-label={`Compare ${s.name}`} className="h-4 w-4 accent-teal-500" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-fg">{s.name}</div>
                <div className="text-[11px] text-muted">{new Date(s.savedAt).toLocaleString("en-IN")}</div>
              </div>
              <span className="num text-sm text-fg">{s.probability === null ? "n/a" : prob(s.probability)}</span>
              <Button size="sm" variant="ghost" onClick={() => onLoad(s)}><Upload /> Load</Button>
              <Button size="icon" variant="ghost" aria-label={`Delete ${s.name}`} onClick={() => { onDelete(s.id); toast("Scenario deleted"); }}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
      {pair.length === 2 && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {pair.map((s, i) => {
            const r = res.data?.[i];
            return (
              <div key={s.id} className="rounded-xl border border-[var(--border)] p-4">
                <div className="truncate text-sm font-semibold text-fg">{s.name}</div>
                {!r ? (
                  <Skeleton className="mt-3 h-40" />
                ) : (
                  <>
                    <RiskGauge probability={r.scenario.probability} band={r.scenario.band} size={200} />
                    <dl className="num mt-2 grid grid-cols-2 gap-2 text-xs">
                      <dt className="text-muted">Band</dt><dd><RiskBadge band={r.scenario.band} /></dd>
                      <dt className="text-muted">Readiness</dt><dd className="text-fg">{r.scenario.readiness.toFixed(0)}</dd>
                      <dt className="text-muted">Runway</dt><dd className="text-fg">{months(r.scenario.runway_months)}</dd>
                      <dt className="text-muted">Burn / MRR</dt><dd className="text-fg">₹{s.input.monthly_burn} L / ₹{s.input.mrr} L</dd>
                      <dt className="text-muted">Levers</dt><dd className="text-fg">{Object.entries(s.levers).filter(([, v]) => v).map(([k, v]) => `${k.replace("_pct", "").replace("_pts", "")} ${v > 0 ? "+" : ""}${v}`).join(", ") || "none"}</dd>
                    </dl>
                  </>
                )}
              </div>
            );
          })}
          {res.data && (
            <p className="text-xs text-muted md:col-span-2">
              Difference: <span className="num font-semibold text-fg">{pts((res.data[1].scenario.probability - res.data[0].scenario.probability) * 100)}</span> (second minus first).
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
