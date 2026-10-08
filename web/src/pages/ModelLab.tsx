import { CheckCircle2, FlaskConical, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CalibrationChart, ImportanceChart, RocChart } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Input, Skeleton, SyntheticBadge } from "@/components/ui/primitives";
import { CountUp, ErrorState } from "@/components/viz";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { useAsync } from "@/lib/useAsync";
import { cn } from "@/lib/utils";

const COLS: { k: "roc_auc" | "pr_auc" | "precision" | "recall" | "f1" | "brier"; label: string; lowerBetter?: boolean }[] = [
  { k: "roc_auc", label: "ROC-AUC" },
  { k: "pr_auc", label: "PR-AUC" },
  { k: "precision", label: "Precision" },
  { k: "recall", label: "Recall" },
  { k: "f1", label: "F1" },
  { k: "brier", label: "Brier", lowerBetter: true },
];

export default function ModelLab() {
  const { mode } = useApp();
  const lab = useAsync(() => api.modelLab(), mode);
  const [n, setN] = useState("6000");
  const [seed, setSeed] = useState("42");
  const [training, setTraining] = useState(false);

  const retrain = async () => {
    const nn = Number(n), ss = Number(seed);
    if (!Number.isInteger(nn) || nn < 1000 || nn > 50000) return toast.error("Rows must be a whole number from 1,000 to 50,000");
    if (!Number.isInteger(ss)) return toast.error("Seed must be a whole number");
    setTraining(true);
    const id = toast.loading(`Generating ${nn.toLocaleString()} synthetic startups and retraining...`);
    try {
      const r = await api.train(nn, ss);
      toast.success(`Retrained in ${r.seconds}s: ${r.selected_model}`, { id, description: `Test ROC-AUC ${r.test_metrics.roc_auc.toFixed(3)}` });
      lab.reload();
    } catch (e) {
      toast.error("Training failed", { id, description: e instanceof Error ? e.message : String(e) });
    } finally {
      setTraining(false);
    }
  };

  if (lab.error) return <ErrorState title="Model metrics unavailable" errors={[lab.error.message]} onRetry={lab.reload} />;
  if (!lab.data) return <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>;
  const m = lab.data;
  const cv = m.cross_validation.metrics;
  const names = Object.keys(cv);
  const best = (k: (typeof COLS)[number]["k"], lower?: boolean) => {
    const vals = names.map((nm) => cv[nm][`${k}_mean` as keyof (typeof cv)[string]] as number);
    return lower ? Math.min(...vals) : Math.max(...vals);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <SyntheticBadge />
        <span className="text-xs text-muted">
          {m.dataset.rows.toLocaleString()} rows · {(m.dataset.generated_failure_rate * 100).toFixed(0)}% generated failures · train {m.dataset.train_rows.toLocaleString()} / test {m.dataset.test_rows.toLocaleString()} · seed {m.dataset.random_seed}
        </span>
        {mode !== "api" && <span className="text-xs text-medium">Showing the metrics bundled with this build (API offline).</span>}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Held-out test metrics">
        {[
          ["ROC-AUC", m.test_metrics.roc_auc],
          ["Precision", m.test_metrics.precision],
          ["Recall", m.test_metrics.recall],
          ["Brier score", m.test_metrics.brier],
        ].map(([label, v]) => (
          <div key={label as string} className="glass p-4">
            <div className="text-xs text-muted">{label as string} · held-out test</div>
            <CountUp value={v as number} format={(x) => x.toFixed(3)} className="mt-2 block text-3xl font-semibold text-fg" />
          </div>
        ))}
      </section>

      <Card glow>
        <div className="flex flex-wrap items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-low" />
          <div className="flex-1">
            <h3 className="font-semibold text-fg">Selected: {m.selection.selected_model}</h3>
            <p className="mt-1 text-sm text-muted">{m.selection.explanation} Rule: {m.selection.rule} Then calibrated with 5-fold isotonic regression.</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Cross-validation comparison" subtitle={`${m.cross_validation.folds}-fold stratified CV on the training split, mean ± std. Best value in each column highlighted.`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">Model</th>
                {COLS.map((c) => <th key={c.k} scope="col" className="px-3 py-2 font-medium">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {names.map((nm) => (
                <tr key={nm} className="border-t border-[var(--border)]">
                  <td className="py-2.5 pr-3 font-medium text-fg">
                    {nm} {nm === m.selection.selected_model && <span className="ml-1 rounded-full bg-low/15 px-2 py-0.5 text-[10px] font-semibold text-low">selected</span>}
                  </td>
                  {COLS.map((c) => {
                    const mean = cv[nm][`${c.k}_mean` as keyof (typeof cv)[string]] as number;
                    const std = cv[nm][`${c.k}_std` as keyof (typeof cv)[string]] as number;
                    return (
                      <td key={c.k} className={cn("num px-3 py-2.5", mean === best(c.k, c.lowerBetter) ? "font-semibold text-teal" : "text-fg")}>
                        {mean.toFixed(3)} <span className="text-[11px] text-muted">± {std.toFixed(3)}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="ROC curves" subtitle="Out-of-fold predictions from the same CV folds." />
          <RocChart curves={m.roc_curves_cv} />
        </Card>
        <Card>
          <CardHeader title="Calibration: before vs after isotonic" subtitle={`Held-out test, 10 quantile bins. Brier ${m.brier_before_calibration.toFixed(3)} → ${m.test_metrics.brier.toFixed(3)}.`} />
          <CalibrationChart before={m.calibration_before} after={m.calibration_points} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Global permutation importance" subtitle="Drop in test ROC-AUC when one feature is shuffled (5 repeats)." />
          <ImportanceChart items={m.permutation_importance} />
        </Card>
        <Card>
          <CardHeader title="Retrain on fresh synthetic data" subtitle="Regenerates the dataset and reruns the full pipeline on the API server." />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-fg">Rows<Input className="num mt-1" value={n} onChange={(e) => setN(e.target.value)} inputMode="numeric" /></label>
            <label className="text-xs text-fg">Seed<Input className="num mt-1" value={seed} onChange={(e) => setSeed(e.target.value)} inputMode="numeric" /></label>
          </div>
          <Button variant="primary" className="mt-4 w-full" onClick={retrain} disabled={training || mode !== "api"}>
            {training ? <Loader2 className="animate-spin" /> : <RefreshCw />} {mode === "api" ? "Regenerate & retrain" : "Needs the API server"}
          </Button>
          <p className="mt-3 flex gap-2 text-[11px] leading-relaxed text-muted">
            <FlaskConical className="h-4 w-4 shrink-0" />
            Takes about 20–40 seconds for 6,000 rows. The new model replaces the current one on the server. All data stays synthetic.
          </p>
        </Card>
      </div>
    </div>
  );
}
