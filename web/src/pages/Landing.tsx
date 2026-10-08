import { motion } from "framer-motion";
import { ArrowRight, Briefcase, Database, Gauge, LineChart, PencilLine, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SyntheticBadge } from "@/components/ui/primitives";
import { PRESETS } from "@/lib/schema";
import { useApp } from "@/lib/store";

const FEATURES = [
  { icon: <Gauge />, title: "Calibrated risk", body: "A 24-month failure probability from a cross-validated, isotonic-calibrated model." },
  { icon: <LineChart />, title: "Plain-English drivers", body: "Each factor's push on your risk, e.g. “Runway of 3.2 months is increasing your risk”." },
  { icon: <SlidersHorizontal />, title: "Live what-if", body: "Move burn, churn, CAC, growth and price. The model re-runs on every change." },
  { icon: <Briefcase />, title: "Portfolio screening", body: "Upload a CSV of startups, map columns, flag bad rows and rank by risk." },
];

export default function Landing() {
  const { setPage, setInput } = useApp();
  const demo = () => {
    setInput(PRESETS["High-growth Fintech"]);
    setPage("dashboard");
    toast.success("Loaded demo startup", { description: "High-growth Fintech · Series A (synthetic)" });
  };
  return (
    <div className="space-y-10">
      <section className="glass relative overflow-hidden px-6 py-12 sm:px-12 sm:py-16">
        <div className="accent-gradient pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-25 blur-3xl" />
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative max-w-3xl">
          <SyntheticBadge />
          <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-fg sm:text-5xl">
            Know your odds. <span className="accent-text">Then change them.</span>
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
            Startup Compass estimates the probability that an early-stage startup fails within 24 months, explains what drives it, and ranks the
            moves that reduce it. Built on unit economics: runway, burn multiple, LTV:CAC and churn.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="primary" size="lg" onClick={demo}>
              <Database /> Try demo data
            </Button>
            <Button size="lg" onClick={() => setPage("input")}>
              <PencilLine /> Enter your startup <ArrowRight />
            </Button>
          </div>
        </motion.div>
      </section>

      <section aria-label="Features" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 * i + 0.15 }}
            className="glass p-5 transition-transform hover:-translate-y-0.5"
          >
            <div className="accent-gradient flex h-9 w-9 items-center justify-center rounded-xl text-white [&_svg]:h-4 [&_svg]:w-4">{f.icon}</div>
            <h3 className="mt-4 font-semibold text-fg">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
          </motion.div>
        ))}
      </section>

      <section className="glass flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
        <ShieldCheck className="h-6 w-6 shrink-0 text-medium" />
        <p className="text-sm leading-relaxed text-muted">
          <strong className="text-fg">Synthetic data.</strong> The bundled dataset and its failure labels are generated from startup-finance relationships plus noise. Metrics
          show how well the model recovers those generated labels, not real-world accuracy. Use outputs as decision support, never as guarantees.
        </p>
        <Button variant="ghost" className="sm:ml-auto" onClick={() => setPage("methodology")}>
          Read the methodology
        </Button>
      </section>
    </div>
  );
}
