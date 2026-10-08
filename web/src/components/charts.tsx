import { motion } from "framer-motion";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { lakh, monthToDate, pts } from "@/lib/format";
import type { BatchRow, Driver, PeerMetric, Projection } from "@/lib/types";
import { Tip } from "./ui/primitives";

const tooltipBox = "rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-fg shadow-xl";
const axis = { stroke: "var(--border)", tickLine: false, fontSize: 11 };

export function DriversChart({ drivers }: { drivers: Driver[] }) {
  const data = [...drivers].sort((a, b) => b.delta_pp - a.delta_pp).map((d) => ({ ...d, v: Number(d.delta_pp.toFixed(2)) }));
  const max = Math.max(1, ...data.map((d) => Math.abs(d.v))) * 1.15;
  return (
    <div className="h-64 w-full" role="img" aria-label="Risk drivers, increasing and decreasing">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" domain={[-max, max]} {...axis} tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}`} />
          <YAxis type="category" dataKey="group" width={128} {...axis} tick={{ fill: "var(--muted)", fontSize: 11 }} />
          <ReferenceLine x={0} stroke="var(--muted)" />
          <Tooltip
            cursor={{ fill: "var(--surface)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className={tooltipBox}>
                  <div className="font-semibold">{payload[0].payload.group}</div>
                  <div className="mt-1 max-w-56 text-muted">{payload[0].payload.sentence}</div>
                </div>
              ) : null
            }
          />
          <Bar dataKey="v" radius={[4, 4, 4, 4]} barSize={16} isAnimationActive>
            {data.map((d) => (
              <Cell key={d.group} fill={d.v > 0 ? "var(--high)" : "var(--low)"} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RunwayChart({ projection }: { projection: Projection }) {
  const data = projection.series.map((s) => ({ month: s.month, base: s.cash_base, band: [s.cash_worst, s.cash_best] as [number, number] }));
  const co = projection.cashout_month.base;
  return (
    <div className="h-72 w-full" role="img" aria-label="Cash balance projection with best, base and worst band">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ left: 4, right: 16, top: 20, bottom: 4 }}>
          <defs>
            <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#6366f1" stopOpacity={0.35} />
              <stop offset="1" stopColor="#14b8a6" stopOpacity={0.12} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" {...axis} tickFormatter={(m: number) => `M${m}`} />
          <YAxis {...axis} width={64} tickFormatter={(v: number) => `₹${Math.round(v).toLocaleString("en-IN")}L`} />
          <ReferenceLine y={0} stroke="var(--high)" strokeDasharray="4 4" />
          {co !== null && (
            <ReferenceLine
              x={Math.round(co)}
              stroke="var(--high)"
              label={{ value: `Cash-out ~${monthToDate(co)}`, position: "insideTopRight", fill: "var(--high)", fontSize: 11 }}
            />
          )}
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className={tooltipBox}>
                  <div className="font-semibold">Month {label}</div>
                  <div className="num mt-1">Base: {lakh(payload[0].payload.base)}</div>
                  <div className="num text-muted">
                    Worst–best: {lakh(payload[0].payload.band[0])} to {lakh(payload[0].payload.band[1])}
                  </div>
                </div>
              ) : null
            }
          />
          <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
          <Area dataKey="band" name="Best–worst band" stroke="none" fill="url(#bandFill)" isAnimationActive />
          <Line dataKey="base" name="Base case" stroke="#2dd4bf" strokeWidth={2.5} dot={false} isAnimationActive />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PercentileBars({ metrics }: { metrics: PeerMetric[] }) {
  return (
    <ul className="space-y-4">
      {metrics.map((m, i) => {
        const v = m.better_than;
        return (
          <li key={m.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-fg">{m.label}</span>
              <span className="num text-muted">
                you {m.value === null ? "n/a" : `${m.value.toFixed(1)}${m.unit === "%" ? "%" : m.unit === "x" ? "×" : " mo"}`} · median{" "}
                {m.median === null ? "n/a" : `${m.median.toFixed(1)}${m.unit === "%" ? "%" : m.unit === "x" ? "×" : " mo"}`}
              </span>
            </div>
            <Tip content={v === null ? "Not enough data to rank." : `Better than ${v.toFixed(0)}% of peers${m.lower_is_better ? " (lower is better)" : ""}.`}>
              <div className="relative h-2.5 w-full cursor-help overflow-hidden rounded-full bg-[var(--border)]" tabIndex={0} aria-label={`${m.label}: better than ${v?.toFixed(0) ?? "unknown"} percent of peers`}>
                <motion.div
                  className="accent-gradient absolute inset-y-0 left-0 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${v ?? 0}%` }}
                  transition={{ duration: 0.8, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                />
                <div className="absolute inset-y-0 left-1/2 w-px bg-fg/60" />
              </div>
            </Tip>
            <div className="num mt-1 text-[11px] text-muted">{v === null ? "No data" : `Better than ${v.toFixed(0)}% of peers`}</div>
          </li>
        );
      })}
    </ul>
  );
}

export function WaterfallChart({ base, steps }: { base: number; steps: { lever: string; delta_pp: number }[] }) {
  let run = base * 100;
  const data = [{ name: "Baseline", range: [0, run] as [number, number], kind: "total", d: run }];
  for (const s of steps) {
    const start = run;
    run += s.delta_pp;
    data.push({ name: s.lever, range: [Math.min(start, run), Math.max(start, run)], kind: s.delta_pp > 0 ? "up" : s.delta_pp < 0 ? "down" : "flat", d: s.delta_pp });
  }
  data.push({ name: "Scenario", range: [0, run], kind: "total", d: run });
  const color = (k: string) => (k === "total" ? "#6366f1" : k === "up" ? "var(--high)" : k === "down" ? "var(--low)" : "var(--muted)");
  return (
    <div className="h-64 w-full" role="img" aria-label="Waterfall of risk change per lever">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="name" {...axis} interval={0} />
          <YAxis {...axis} width={40} unit="%" />
          <Tooltip
            cursor={{ fill: "var(--surface)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className={tooltipBox}>
                  <div className="font-semibold">{payload[0].payload.name}</div>
                  <div className="num mt-1">
                    {payload[0].payload.kind === "total" ? `${payload[0].payload.d.toFixed(1)}% risk` : pts(payload[0].payload.d)}
                  </div>
                </div>
              ) : null
            }
          />
          <Bar dataKey="range" radius={[4, 4, 4, 4]} isAnimationActive>
            {data.map((d) => (
              <Cell key={d.name} fill={color(d.kind)} fillOpacity={0.9} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const BAND_FILL = { Low: "#22c55e", Medium: "#f59e0b", High: "#ef4444" };

export function PortfolioScatter({ rows }: { rows: BatchRow[] }) {
  const data = rows.filter((r) => !r.error && r.churn_pct != null).map((r) => ({ ...r, x: Math.min(r.runway_months ?? 0, 60), y: r.churn_pct, z: Math.max(r.mrr ?? 0, 0.1) }));
  return (
    <div className="h-80 w-full" role="img" aria-label="Runway versus churn, sized by MRR and coloured by risk">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ left: 0, right: 12, top: 8, bottom: 16 }}>
          <CartesianGrid />
          <XAxis type="number" dataKey="x" name="Runway" unit=" mo" {...axis} label={{ value: "Runway (months)", position: "insideBottom", offset: -8, fill: "var(--muted)", fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name="Churn" unit="%" {...axis} width={44} />
          <ZAxis type="number" dataKey="z" range={[30, 600]} name="MRR" />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className={tooltipBox}>
                  <div className="font-semibold">{payload[0].payload.startup_id}</div>
                  <div className="num mt-1 text-muted">
                    Risk {(payload[0].payload.probability * 100).toFixed(1)}% · runway {payload[0].payload.x.toFixed(1)} mo · churn {payload[0].payload.y.toFixed(1)}% · MRR {lakh(payload[0].payload.mrr)}
                  </div>
                </div>
              ) : null
            }
          />
          {(["Low", "Medium", "High"] as const).map((b) => (
            <Scatter key={b} name={`${b} risk`} data={data.filter((d) => d.band === b)} fill={BAND_FILL[b]} fillOpacity={0.7} isAnimationActive />
          ))}
          <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11 }} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RiskHistogram({ rows }: { rows: BatchRow[] }) {
  const bins = Array.from({ length: 10 }, (_, i) => ({ bin: `${i * 10}–${i * 10 + 10}%`, lo: i / 10, n: 0 }));
  for (const r of rows) if (!r.error && r.probability != null) bins[Math.min(9, Math.floor(r.probability * 10))].n += 1;
  return (
    <div className="h-64 w-full" role="img" aria-label="Risk distribution histogram">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bins} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="bin" {...axis} interval={1} />
          <YAxis {...axis} width={32} allowDecimals={false} />
          <Tooltip cursor={{ fill: "var(--surface)" }} content={({ active, payload }) => (active && payload?.length ? <div className={tooltipBox}>{payload[0].payload.bin}: <span className="num">{payload[0].payload.n}</span> startups</div> : null)} />
          <Bar dataKey="n" radius={[6, 6, 0, 0]} isAnimationActive>
            {bins.map((b) => (
              <Cell key={b.bin} fill={b.lo < 0.25 ? BAND_FILL.Low : b.lo < 0.5 ? BAND_FILL.Medium : BAND_FILL.High} fillOpacity={0.8} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RocChart({ curves }: { curves: Record<string, { fpr: number[]; tpr: number[] }> }) {
  const colors = ["#2dd4bf", "#818cf8", "#f59e0b"];
  const names = Object.keys(curves);
  return (
    <div className="h-72 w-full" role="img" aria-label="ROC curves, cross-validated">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart margin={{ left: 0, right: 12, top: 8, bottom: 16 }}>
          <CartesianGrid />
          <XAxis type="number" dataKey="x" domain={[0, 1]} {...axis} label={{ value: "False positive rate", position: "insideBottom", offset: -8, fill: "var(--muted)", fontSize: 11 }} />
          <YAxis type="number" dataKey="y" domain={[0, 1]} {...axis} width={36} />
          <Tooltip content={({ active, payload }) => (active && payload?.length ? <div className={tooltipBox}>{payload.map((p) => <div key={String(p.name)} className="num">{p.name}: TPR {Number(p.value).toFixed(2)} at FPR {Number(p.payload.x).toFixed(2)}</div>)}</div> : null)} />
          <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11 }} />
          <Line data={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} dataKey="y" name="Chance" stroke="var(--muted)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
          {names.map((n, i) => (
            <Line key={n} data={curves[n].fpr.map((x, j) => ({ x, y: curves[n].tpr[j] }))} dataKey="y" name={n} stroke={colors[i % 3]} strokeWidth={2} dot={false} isAnimationActive />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CalibrationChart({ before, after }: { before: { predicted: number; observed: number }[]; after: { predicted: number; observed: number }[] }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Calibration before and after isotonic calibration">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart margin={{ left: 0, right: 12, top: 8, bottom: 16 }}>
          <CartesianGrid />
          <XAxis type="number" dataKey="x" domain={[0, 1]} {...axis} label={{ value: "Mean predicted probability", position: "insideBottom", offset: -8, fill: "var(--muted)", fontSize: 11 }} />
          <YAxis type="number" dataKey="y" domain={[0, 1]} {...axis} width={36} />
          <Tooltip content={({ active, payload }) => (active && payload?.length ? <div className={tooltipBox}>{payload.map((p) => <div key={String(p.name)} className="num">{p.name}: predicted {Number(p.payload.x).toFixed(2)}, observed {Number(p.value).toFixed(2)}</div>)}</div> : null)} />
          <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11 }} />
          <Line data={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} dataKey="y" name="Perfect" stroke="var(--muted)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
          <Line data={before.map((p) => ({ x: p.predicted, y: p.observed }))} dataKey="y" name="Before (uncalibrated)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} isAnimationActive />
          <Line data={after.map((p) => ({ x: p.predicted, y: p.observed }))} dataKey="y" name="After (isotonic)" stroke="#2dd4bf" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ImportanceChart({ items }: { items: { feature: string; importance_mean: number; importance_std: number }[] }) {
  const data = [...items].sort((a, b) => b.importance_mean - a.importance_mean).slice(0, 12);
  return (
    <div className="h-80 w-full" role="img" aria-label="Permutation importance">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" {...axis} tickFormatter={(v: number) => v.toFixed(2)} />
          <YAxis type="category" dataKey="feature" width={150} {...axis} tick={{ fill: "var(--muted)", fontSize: 11 }} />
          <Tooltip cursor={{ fill: "var(--surface)" }} content={({ active, payload }) => (active && payload?.length ? <div className={tooltipBox}><div className="font-semibold">{payload[0].payload.feature}</div><div className="num mt-1">ROC-AUC drop {payload[0].payload.importance_mean.toFixed(4)} ± {payload[0].payload.importance_std.toFixed(4)}</div></div> : null)} />
          <Bar dataKey="importance_mean" fill="#818cf8" radius={[0, 4, 4, 0]} barSize={14} isAnimationActive />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
