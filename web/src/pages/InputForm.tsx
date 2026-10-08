import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, Input, Select, SyntheticBadge } from "@/components/ui/primitives";
import { isNum, lakh, ratio } from "@/lib/format";
import { fieldError, LABELS, META, PRESETS, SECTORS, STAGES, STEPS, validate, type NumericField } from "@/lib/schema";
import { useApp } from "@/lib/store";
import type { StartupInput } from "@/lib/types";
import { cn } from "@/lib/utils";

type Draft = Record<string, string>;
const toDraft = (i: StartupInput): Draft =>
  Object.fromEntries(Object.entries(i).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)]));
const fromDraft = (d: Draft): StartupInput => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (k === "sector" || k === "stage" || k === "name") out[k] = v || null;
    else out[k] = v.trim() === "" ? null : Number.isFinite(Number(v)) ? Number(v) : v;
  }
  return out as unknown as StartupInput;
};

export default function InputForm() {
  const { input, setInput, setPage } = useApp();
  const [draft, setDraft] = useState<Draft>(() => toDraft(input));
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const err = (k: string) => fieldError(k, k === "sector" || k === "stage" ? draft[k] : draft[k] === "" ? null : Number.isFinite(Number(draft[k])) ? Number(draft[k]) : draft[k]);
  const stepErrors = (s: number) => STEPS[s].fields.map((f) => err(f)).filter(Boolean) as string[];
  const derived = useMemo(() => {
    const n = (k: string) => (draft[k] === "" ? NaN : Number(draft[k]));
    const burn = n("monthly_burn"), mrr = n("mrr"), gm = n("gross_margin_pct"), cash = n("cash_balance");
    const churn = n("monthly_churn_pct"), arpu = n("arpu"), cac = n("cac"), ltvIn = n("ltv");
    const net = burn - (mrr * (Number.isFinite(gm) ? gm : 0)) / 100;
    const ltv = Number.isFinite(ltvIn) ? ltvIn : Number.isFinite(arpu) && churn > 0 && Number.isFinite(gm) ? (arpu * gm) / 100 / (churn / 100) : NaN;
    return {
      net: Number.isFinite(net) ? net : null,
      runway: Number.isFinite(net) && Number.isFinite(cash) ? (net <= 0 ? Infinity : cash / Math.max(net, 0.05)) : null,
      ltv: Number.isFinite(ltv) ? ltv : null,
      ltvDerived: !Number.isFinite(ltvIn) && Number.isFinite(ltv),
      ltvCac: Number.isFinite(ltv) && cac > 0 ? ltv / cac : null,
    };
  }, [draft]);

  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const next = () => {
    const errs = stepErrors(step);
    setTouched((t) => ({ ...t, ...Object.fromEntries(STEPS[step].fields.map((f) => [f, true])) }));
    if (errs.length) {
      toast.error(`Fix ${errs.length} field${errs.length > 1 ? "s" : ""} to continue`, { description: errs[0] });
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const submit = () => {
    const value = fromDraft(draft);
    const { errors } = validate(value);
    if (errors.length) {
      setTouched(Object.fromEntries(STEPS.flatMap((s) => s.fields).map((f) => [f, true])));
      const bad = STEPS.findIndex((_, i) => stepErrors(i).length);
      if (bad >= 0) setStep(bad);
      toast.error("Some inputs need attention", { description: errors.join(" · ") });
      return;
    }
    setInput({ ...value, name: value.name || "My startup" });
    toast.success("Startup saved. Scoring now.");
    setPage("dashboard");
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Start from a preset:</span>
          {Object.entries(PRESETS).map(([name, p]) => (
            <Button key={name} size="sm" variant="ghost" className="border border-[var(--border)]" onClick={() => { setDraft(toDraft(p)); setTouched({}); toast(`Loaded ${name}`); }}>
              <Sparkles /> {name}
            </Button>
          ))}
        </div>

        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Form steps">
          {STEPS.map((s, i) => {
            const done = i < step && !stepErrors(i).length;
            return (
              <li key={s.title}>
                <button
                  onClick={() => (i <= step || !stepErrors(step).length ? setStep(i) : next())}
                  aria-current={i === step ? "step" : undefined}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-colors",
                    i === step ? "border-teal/60 bg-teal/10 text-fg" : "border-[var(--border)] text-muted hover:text-fg",
                  )}
                >
                  <span className={cn("num flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]", done ? "bg-low text-black" : i === step ? "accent-gradient text-white" : "bg-[var(--surface)]")}>
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span className="truncate font-medium">{s.title}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <Card>
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
              <h2 className="text-lg font-semibold text-fg">{STEPS[step].title}</h2>
              <p className="mt-1 text-sm text-muted">{STEPS[step].blurb} Money is in INR lakh.</p>
              {step === 0 && (
                <div className="mt-5">
                  <label htmlFor="f-name" className="text-xs font-medium text-fg">Startup name <span className="text-muted">(optional)</span></label>
                  <Input id="f-name" className="mt-1.5" value={draft.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Acme Labs" />
                </div>
              )}
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                {STEPS[step].fields.map((f) => {
                  const e = touched[f] ? err(f) : null;
                  if (f === "sector" || f === "stage") {
                    const opts = f === "sector" ? SECTORS : STAGES;
                    return (
                      <div key={f}>
                        <label htmlFor={`f-${f}`} className="text-xs font-medium text-fg">{LABELS[f]}</label>
                        <Select id={`f-${f}`} className="mt-1.5" value={draft[f] ?? ""} invalid={!!e} aria-describedby={`h-${f}`} onChange={(ev) => set(f, ev.target.value)} onBlur={() => setTouched((t) => ({ ...t, [f]: true }))}>
                          <option value="">Select {LABELS[f].toLowerCase()}</option>
                          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                        </Select>
                        <p id={`h-${f}`} className={cn("mt-1.5 text-[11px]", e ? "text-high" : "text-muted")}>{e ?? (f === "sector" ? "Used for peer benchmarks." : "Latest funding stage reached.")}</p>
                      </div>
                    );
                  }
                  const m = META[f as NumericField];
                  return (
                    <div key={f}>
                      <label htmlFor={`f-${f}`} className="flex items-baseline justify-between text-xs font-medium text-fg">
                        <span>{m.label}</span>
                        <span className="font-normal text-muted">{m.unit}</span>
                      </label>
                      <Input
                        id={`f-${f}`}
                        className="num mt-1.5"
                        inputMode="decimal"
                        value={draft[f] ?? ""}
                        invalid={!!e}
                        aria-describedby={`h-${f}`}
                        onChange={(ev) => set(f, ev.target.value)}
                        onBlur={() => setTouched((t) => ({ ...t, [f]: true }))}
                        placeholder={f === "ltv" && derived.ltvDerived ? `Auto: ${derived.ltv?.toFixed(2)}` : ""}
                      />
                      <p id={`h-${f}`} className={cn("mt-1.5 text-[11px]", e ? "text-high" : "text-muted")}>{e ?? m.hint}</p>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
          <div className="mt-6 flex items-center justify-between border-t border-[var(--border)] pt-4">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button variant="primary" onClick={next}>
                Next <ArrowRight />
              </Button>
            ) : (
              <Button variant="primary" onClick={submit}>
                Analyze startup <ArrowRight />
              </Button>
            )}
          </div>
        </Card>
      </div>

      <aside className="space-y-4">
        <Card>
          <h3 className="text-sm font-semibold text-fg">Live calculations</h3>
          <p className="mt-1 text-xs text-muted">Computed as you type. The model scores on submit.</p>
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="Net burn" hint="Burn − MRR × gross margin" value={derived.net === null ? "n/a" : lakh(derived.net)} />
            <Row label="Runway" hint="Cash ÷ net burn" value={derived.runway === null ? "n/a" : derived.runway === Infinity ? "Profitable" : `${derived.runway.toFixed(1)} months`} />
            <Row label={derived.ltvDerived ? "LTV (derived)" : "LTV"} hint="ARPU × margin ÷ churn" value={isNum(derived.ltv) ? lakh(derived.ltv, 2) : "n/a"} />
            <Row label="LTV:CAC" hint="Healthy is ≥ 3×" value={ratio(derived.ltvCac)} />
          </dl>
        </Card>
        <Card className="text-xs leading-relaxed text-muted">
          <SyntheticBadge />
          <p className="mt-3">Optional fields (experience, margin, churn, CAC, LTV/ARPU) can be left blank. The model fills them from training medians and the dashboard flags lower confidence.</p>
        </Card>
      </aside>
    </div>
  );
}

function Row({ label, hint, value }: { label: string; hint: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt>
        <div className="text-fg">{label}</div>
        <div className="text-[11px] text-muted">{hint}</div>
      </dt>
      <dd className="num text-right font-semibold text-fg">{value}</dd>
    </div>
  );
}
