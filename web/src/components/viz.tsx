import * as d3 from "d3";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import type { Band } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Tip } from "./ui/primitives";

export const RISK_COLORS = { low: "#22c55e", medium: "#f59e0b", high: "#ef4444" };
export const bandColor = (b: Band) => (b === "Low" ? "var(--low)" : b === "Medium" ? "var(--medium)" : "var(--high)");

/** Animated count-up number (respects reduced motion). */
export function CountUp({ value, format, className }: { value: number | null; format: (v: number) => string; className?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const [text, setText] = useState(value === null ? "n/a" : format(reduce ? value : 0));
  useEffect(() => {
    if (value === null || !Number.isFinite(value)) {
      setText("n/a");
      return;
    }
    if (reduce) {
      setText(format(value));
      return;
    }
    const controls = animate(mv, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setText(format(v)) });
    return () => controls.stop();
  }, [value, reduce, format, mv]);
  return <span className={cn("num", className)}>{text}</span>;
}

/** Radial risk gauge: a D3 arc band (green → amber → red) and a needle that sweeps to the value. */
export function RiskGauge({ probability, band, size = 240, label = "24-month failure risk" }: { probability: number; band: Band; size?: number; label?: string }) {
  const reduce = useReducedMotion();
  const w = size, h = size * 0.62, r = size * 0.42, cx = w / 2, cy = h - 8;
  const segments = useMemo(() => {
    const n = 48;
    const color = d3.scaleLinear<string>().domain([0, 0.5, 1]).range([RISK_COLORS.low, RISK_COLORS.medium, RISK_COLORS.high]);
    const arc = d3.arc<number>().innerRadius(r * 0.8).outerRadius(r).padAngle(0.012);
    return d3.range(n).map((i) => {
      const a0 = -Math.PI / 2 + (i / n) * Math.PI, a1 = -Math.PI / 2 + ((i + 1) / n) * Math.PI;
      return { d: arc.startAngle(a0).endAngle(a1)(i) ?? "", fill: color((i + 0.5) / n), t: (i + 0.5) / n };
    });
  }, [r]);
  const p = Math.min(Math.max(probability, 0), 1);
  const angle = useMotionValue(reduce ? -90 + p * 180 : -90);
  useEffect(() => {
    const c = animate(angle, -90 + p * 180, { duration: reduce ? 0 : 1.2, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [p, reduce, angle]);
  const transform = useTransform(angle, (a) => `translate(${cx}px, ${cy}px) rotate(${a}deg)`);
  return (
    <figure className="flex flex-col items-center" aria-label={`${label}: ${(p * 100).toFixed(1)} percent, ${band} risk`}>
      <Tip content={<span>Calibrated probability of failing within 24 months. Bands: Low &lt; 25%, Medium 25–50%, High &gt; 50%.</span>}>
        <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ maxWidth: w }} role="img">
          <title>{`${label}: ${(p * 100).toFixed(1)}%`}</title>
          <g transform={`translate(${cx},${cy})`}>
            {segments.map((s, i) => (
              <path key={i} d={s.d} fill={s.fill} opacity={s.t <= p ? 1 : 0.28} />
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const a = -Math.PI + t * Math.PI;
              return (
                <line key={t} x1={Math.cos(a) * r * 0.72} y1={Math.sin(a) * r * 0.72} x2={Math.cos(a) * r * 0.77} y2={Math.sin(a) * r * 0.77} stroke="var(--muted)" strokeWidth={1.5} />
              );
            })}
          </g>
          <motion.g style={{ transform }}>
            <path d={`M -4 0 L 0 ${-r * 0.74} L 4 0 Z`} fill="var(--fg)" />
          </motion.g>
          <circle cx={cx} cy={cy} r={7} fill="var(--fg)" stroke="var(--surface-2)" strokeWidth={3} />
          <text x={cx - r} y={cy + 4} textAnchor="middle" fontSize={10} fill="var(--muted)">0</text>
          <text x={cx + r} y={cy + 4} textAnchor="middle" fontSize={10} fill="var(--muted)">100</text>
        </svg>
      </Tip>
      <figcaption className="-mt-1 flex flex-col items-center">
        <CountUp value={p * 100} format={(v) => `${v.toFixed(1)}%`} className="text-4xl font-semibold text-fg" />
        <span className="mt-1 text-xs font-semibold" style={{ color: bandColor(band) }}>
          {band} risk
        </span>
      </figcaption>
    </figure>
  );
}

/** Five-axis readiness radar drawn with D3 scales. */
export function Radar({ scores, compare, size = 280 }: { scores: Record<string, number>; compare?: Record<string, number>; size?: number }) {
  const keys = Object.keys(scores);
  const r = size * 0.36, c = size / 2;
  const angle = (i: number) => (i / keys.length) * Math.PI * 2 - Math.PI / 2;
  const scale = d3.scaleLinear().domain([0, 100]).range([0, r]);
  const line = d3.lineRadial<number>().angle((_, i) => angle(i) + Math.PI / 2).radius((v) => scale(v)).curve(d3.curveLinearClosed);
  const path = line(keys.map((k) => scores[k])) ?? "";
  const cmp = compare ? line(keys.map((k) => compare[k])) ?? "" : null;
  return (
    <svg viewBox={`-95 -10 ${size + 190} ${size + 20}`} width="100%" style={{ maxWidth: size + 190 }} role="img" aria-label="Readiness sub-scores radar">
      <title>Readiness sub-scores</title>
      <defs>
        <linearGradient id="radarFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14b8a6" stopOpacity={0.45} />
          <stop offset="1" stopColor="#6366f1" stopOpacity={0.35} />
        </linearGradient>
      </defs>
      <g transform={`translate(${c},${c})`}>
        {[25, 50, 75, 100].map((t) => (
          <polygon
            key={t}
            points={keys.map((_, i) => `${Math.cos(angle(i)) * scale(t)},${Math.sin(angle(i)) * scale(t)}`).join(" ")}
            fill="none"
            stroke="var(--grid)"
          />
        ))}
        {keys.map((k, i) => (
          <line key={k} x1={0} y1={0} x2={Math.cos(angle(i)) * r} y2={Math.sin(angle(i)) * r} stroke="var(--grid)" />
        ))}
        {cmp && <path d={cmp} fill="none" stroke="var(--muted)" strokeDasharray="4 4" strokeWidth={1.5} />}
        <motion.path d={path} fill="url(#radarFill)" stroke="#2dd4bf" strokeWidth={2} initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
        {keys.map((k, i) => {
          const v = scores[k];
          return (
            <Tip key={k} content={`${k}: ${v.toFixed(0)} / 100`}>
              <circle cx={Math.cos(angle(i)) * scale(v)} cy={Math.sin(angle(i)) * scale(v)} r={5} fill="#2dd4bf" stroke="var(--surface-2)" strokeWidth={2} tabIndex={0} aria-label={`${k} ${v.toFixed(0)}`} />
            </Tip>
          );
        })}
        {keys.map((k, i) => {
          const x = Math.cos(angle(i)) * (r + 22), y = Math.sin(angle(i)) * (r + 18);
          return (
            <text key={k} x={x} y={y} textAnchor={Math.abs(x) < 5 ? "middle" : x > 0 ? "start" : "end"} dominantBaseline="middle" fontSize={11} fill="var(--muted)">
              {k} <tspan className="num" fill="var(--fg)">{scores[k].toFixed(0)}</tspan>
            </text>
          );
        })}
      </g>
    </svg>
  );
}

/** Tiny area sparkline with a hover tooltip. */
export function Sparkline({ data, color = "#2dd4bf", format, label }: { data: (number | null)[]; color?: string; format: (v: number) => string; label: string }) {
  const points = data.map((v, i) => ({ m: i, v: v ?? null }));
  const id = useMemo(() => `sp${Math.random().toString(36).slice(2, 8)}`, []);
  if (points.every((p) => p.v === null)) return <div className="h-10 text-[11px] text-muted">No trend available</div>;
  return (
    <div className="h-10 w-full" aria-label={`${label} 12-month projection`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={0.4} />
              <stop offset="1" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
            content={({ active, payload }) =>
              active && payload?.length && payload[0].value !== null ? (
                <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-[11px] text-fg shadow">
                  Month {payload[0].payload.m}: <span className="num">{format(Number(payload[0].value))}</span>
                </div>
              ) : null
            }
          />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.75} fill={`url(#${id})`} connectNulls isAnimationActive />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Benchmark delta chip: compares you with the peer median, coloured by whether that is good. */
export function DeltaChip({ you, peer, lowerIsBetter, format }: { you: number | null; peer: number | null; lowerIsBetter?: boolean; format: (v: number) => string }) {
  if (you === null || peer === null || !Number.isFinite(you) || !Number.isFinite(peer)) {
    return <span className="text-[11px] text-muted">No peer comparison</span>;
  }
  const diff = you - peer;
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  const flat = Math.abs(diff) < 1e-9;
  return (
    <span className={cn("text-[11px] font-medium", flat ? "text-muted" : good ? "text-low" : "text-high")}>
      {flat ? "=" : diff > 0 ? "▲" : "▼"} {format(Math.abs(diff))} vs peer median {format(peer)}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  format,
  hint,
  spark,
  sparkFormat,
  delta,
  glow,
  children,
}: {
  label: string;
  value: number | null;
  format: (v: number) => string;
  hint: string;
  spark?: (number | null)[];
  sparkFormat?: (v: number) => string;
  delta?: ReactNode;
  glow?: boolean;
  children?: ReactNode;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className={cn("glass flex min-w-0 flex-col p-4", glow && "glow")}>
      <Tip content={hint}>
        <span className="w-fit cursor-help text-xs font-medium text-muted underline decoration-dotted underline-offset-4">{label}</span>
      </Tip>
      {children ?? <CountUp value={value} format={format} className="mt-2 text-[28px] font-semibold leading-none text-fg" />}
      <div className="mt-2 min-h-4">{delta}</div>
      {spark && <div className="mt-2"><Sparkline data={spark} format={sparkFormat ?? format} label={label} /></div>}
    </motion.div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="glass flex flex-col items-center px-6 py-14 text-center">
      <div className="accent-gradient mb-4 flex h-12 w-12 items-center justify-center rounded-2xl text-white">{icon}</div>
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted">{body}</p>
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", errors, onRetry }: { title?: string; errors: string[]; onRetry?: () => void }) {
  return (
    <div role="alert" className="glass border-high/40 p-5">
      <h2 className="font-semibold text-high">{title}</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg">
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 cursor-pointer text-sm font-medium text-teal hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}
