import { ArrowDown, ArrowUp, Briefcase, Database, Download, FileUp, Loader2, Search, Trash2 } from "lucide-react";
import Papa from "papaparse";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PortfolioScatter, RiskHistogram } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Chip, Input, RiskBadge, Select, SyntheticBadge } from "@/components/ui/primitives";
import { CountUp, EmptyState } from "@/components/viz";
import { api, demoRows } from "@/lib/api";
import { months, prob, ratio } from "@/lib/format";
import { LABELS, OPTIONAL, SECTORS, STAGES } from "@/lib/schema";
import { useApp } from "@/lib/store";
import type { Band, BatchRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const TARGETS = ["startup_id", "sector", "stage", "team_size", "months_operating", "founder_experience_yrs", "monthly_burn", "cash_balance", "mrr", "mrr_growth_pct", "gross_margin_pct", "monthly_churn_pct", "cac", "ltv", "arpu", "total_funding_raised", "prior_rounds"] as const;
const REQUIRED = ["sector", "stage", "team_size", "months_operating", "monthly_burn", "cash_balance", "mrr", "mrr_growth_pct", "total_funding_raised", "prior_rounds"];
const ALIASES: Record<string, string[]> = {
  startup_id: ["id", "startup", "name", "company", "startup_name", "company_name"],
  cash_balance: ["cash", "cash_in_bank", "bank_balance", "cash_lakh"],
  monthly_burn: ["burn", "burn_rate", "monthly_burn_rate", "opex"],
  mrr: ["monthly_recurring_revenue", "revenue", "monthly_revenue"],
  mrr_growth_pct: ["growth", "mom_growth", "growth_pct", "mom_growth_pct", "growth_rate"],
  gross_margin_pct: ["gross_margin", "margin", "gm", "gm_pct"],
  monthly_churn_pct: ["churn", "churn_pct", "monthly_churn", "churn_rate"],
  team_size: ["team", "headcount", "employees"],
  months_operating: ["age_months", "months", "company_age_months", "age"],
  founder_experience_yrs: ["founder_experience", "experience", "experience_yrs"],
  total_funding_raised: ["funding", "total_funding", "funding_raised", "raised"],
  prior_rounds: ["rounds", "funding_rounds", "num_rounds"],
  arpu: ["average_revenue_per_user", "arpa"],
};
const norm = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

function autoMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const byNorm = new Map(headers.map((h) => [norm(h), h]));
  for (const t of TARGETS) {
    const hit = [t, ...(ALIASES[t] ?? [])].map((c) => byNorm.get(c)).find(Boolean);
    if (hit) map[t] = hit;
  }
  return map;
}

type SortKey = "probability" | "runway_months" | "readiness" | "startup_id" | "mrr";

export default function Portfolio() {
  const { portfolio, portfolioSource, setPortfolio, clearPortfolio } = useApp();
  const [raw, setRaw] = useState<{ name: string; headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [q, setQ] = useState("");
  const [bands, setBands] = useState<Band[]>(["Low", "Medium", "High"]);
  const [sector, setSector] = useState("");
  const [stage, setStage] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "probability", dir: -1 });
  const fileRef = useRef<HTMLInputElement>(null);

  const parse = (file: File) => {
    if (!/\.(csv|txt)$/i.test(file.name)) {
      toast.error("Please upload a .csv file");
      return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (res) => {
        const headers = res.meta.fields ?? [];
        if (!headers.length || !res.data.length) {
          toast.error("That file has no rows or no header line.");
          return;
        }
        setRaw({ name: file.name, headers, rows: res.data });
        setMapping(autoMap(headers));
        toast.success(`Read ${res.data.length.toLocaleString()} rows from ${file.name}`, { description: "Check the column mapping, then score." });
      },
      error: (err) => toast.error("Could not parse CSV", { description: err.message }),
    });
  };

  const score = async (rows: Record<string, unknown>[], source: string) => {
    setBusy(true);
    const id = toast.loading(`Scoring ${rows.length.toLocaleString()} startups...`);
    try {
      const res = await api.batch(rows);
      setPortfolio(res.rows, source);
      setRaw(null);
      toast.success(`Scored ${res.summary.ok.toLocaleString()} startups`, {
        id,
        description: res.summary.errors ? `${res.summary.errors} rows flagged with errors and kept for review.` : "No invalid rows.",
      });
    } catch (e) {
      toast.error("Scoring failed", { id, description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const mappedRows = () =>
    raw!.rows.map((r, i) => {
      const o: Record<string, unknown> = {};
      for (const t of TARGETS) {
        const col = mapping[t];
        const v = col ? r[col] : undefined;
        o[t] = v === undefined || v === "" ? null : t === "sector" || t === "stage" || t === "startup_id" ? String(v).trim() : Number(String(v).replace(/,/g, "")) || (String(v).trim() === "0" ? 0 : v);
      }
      o.startup_id ??= `ROW-${String(i + 1).padStart(5, "0")}`;
      return o;
    });

  const missingRequired = raw ? REQUIRED.filter((t) => !mapping[t]) : [];

  const view = useMemo(() => {
    const ql = q.toLowerCase();
    return portfolio
      .filter((r) => !r.error)
      .filter((r) => bands.includes(r.band!))
      .filter((r) => (!sector || r.sector === sector) && (!stage || r.stage === stage))
      .filter((r) => !ql || r.startup_id.toLowerCase().includes(ql) || (r.sector ?? "").toLowerCase().includes(ql))
      .sort((a, b) => {
        const av = a[sort.key] as number | string, bv = b[sort.key] as number | string;
        return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir;
      });
  }, [portfolio, q, bands, sector, stage, sort]);
  const bad = portfolio.filter((r) => r.error);
  const ok = portfolio.filter((r) => !r.error);

  const exportCsv = () => {
    const csv = Papa.unparse(
      portfolio.map((r) => ({
        startup_id: r.startup_id, sector: r.sector ?? "", stage: r.stage ?? "",
        failure_probability: r.probability?.toFixed(4) ?? "", risk_band: r.band ?? "", readiness: r.readiness?.toFixed(1) ?? "",
        runway_months: r.runway_months?.toFixed(2) ?? "", mrr_lakh: r.mrr ?? "", churn_pct: r.churn_pct ?? "", ltv_cac: r.ltv_cac?.toFixed(2) ?? "",
        burn_multiple: r.burn_multiple?.toFixed(2) ?? "", missing_optional: (r.missing ?? []).join("|"), error: r.error ?? "",
      })),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "startup-compass-portfolio.csv" });
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${portfolio.length.toLocaleString()} rows`);
  };

  const template = () => {
    const csv = Papa.unparse([
      { startup_id: "ACME-01", sector: "SaaS", stage: "Seed", team_size: 12, months_operating: 24, founder_experience_yrs: 7, monthly_burn: 20, cash_balance: 260, mrr: 9, mrr_growth_pct: 7, gross_margin_pct: 78, monthly_churn_pct: 3, cac: 0.6, ltv: "", arpu: 0.08, total_funding_raised: 300, prior_rounds: 1 },
      { startup_id: "BETA-02", sector: "D2C", stage: "Pre-seed", team_size: 8, months_operating: 14, founder_experience_yrs: "", monthly_burn: 18, cash_balance: 60, mrr: 5, mrr_growth_pct: -1, gross_margin_pct: 40, monthly_churn_pct: 11, cac: 0.9, ltv: 0.5, arpu: "", total_funding_raised: 50, prior_rounds: 0 },
    ]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: "startup-compass-template.csv" }).click();
    URL.revokeObjectURL(url);
  };

  const SortTh = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th scope="col" aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={cn("px-3 py-2 font-medium", className)}>
      <button className="inline-flex cursor-pointer items-center gap-1 hover:text-fg" onClick={() => setSort({ key: k, dir: sort.key === k ? ((-sort.dir) as 1 | -1) : -1 })}>
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );

  return (
    <div className="space-y-5">
      <Card
        className={cn("border-2 border-dashed transition-colors", drag ? "border-teal bg-teal/5" : "border-[var(--border)]")}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) parse(f); }}
      >
        <div className="flex flex-col items-center gap-3 py-4 text-center sm:flex-row sm:text-left">
          <div className="accent-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"><FileUp className="h-5 w-5" /></div>
          <div className="flex-1">
            <h2 className="font-semibold text-fg">Drop a CSV of startups here</h2>
            <p className="text-sm text-muted">Columns are auto-detected (e.g. “burn”, “cash”, “churn”). You can fix the mapping before scoring. Money in INR lakh.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && parse(e.target.files[0])} aria-label="Upload CSV" />
            <Button onClick={() => fileRef.current?.click()}><FileUp /> Choose file</Button>
            <Button variant="ghost" onClick={template}><Download /> Template</Button>
            <Button variant="primary" disabled={busy} onClick={async () => score(await demoRows(), "Bundled synthetic dataset (300 rows)")}>
              {busy ? <Loader2 className="animate-spin" /> : <Database />} Use demo dataset
            </Button>
          </div>
        </div>
      </Card>

      {raw && (
        <Card>
          <CardHeader title={`Column mapping · ${raw.name}`} subtitle={`${raw.rows.length.toLocaleString()} rows · ${Object.keys(mapping).length} of ${TARGETS.length} fields detected`} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {TARGETS.map((t) => (
              <label key={t} className="text-xs">
                <span className="flex justify-between font-medium text-fg">
                  {t === "startup_id" ? "Startup ID" : LABELS[t]}
                  <span className={REQUIRED.includes(t) ? "text-high" : "text-muted"}>{REQUIRED.includes(t) ? "required" : OPTIONAL.includes(t as never) || t === "startup_id" ? "optional" : ""}</span>
                </span>
                <Select className="mt-1 h-9 text-xs" value={mapping[t] ?? ""} invalid={REQUIRED.includes(t) && !mapping[t]} onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value) n[t] = e.target.value; else delete n[t]; return n; })}>
                  <option value="">Not mapped</option>
                  {raw.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </Select>
              </label>
            ))}
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Preview of the first five mapped rows</caption>
              <thead className="bg-[var(--surface)] text-muted">
                <tr>{TARGETS.filter((t) => mapping[t]).map((t) => <th key={t} className="px-3 py-2 font-medium">{t}</th>)}</tr>
              </thead>
              <tbody>
                {raw.rows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t border-[var(--border)]">
                    {TARGETS.filter((t) => mapping[t]).map((t) => <td key={t} className="num whitespace-nowrap px-3 py-1.5 text-fg">{r[mapping[t]] || <span className="text-medium">blank</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {missingRequired.length > 0 && (
            <p className="mt-3 text-xs text-high" role="alert">Map the required fields first: {missingRequired.map((t) => LABELS[t]).join(", ")}. Rows missing a value are flagged, never dropped.</p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRaw(null)}>Cancel</Button>
            <Button variant="primary" disabled={busy || missingRequired.length > 0} onClick={() => score(mappedRows(), raw.name)}>
              {busy && <Loader2 className="animate-spin" />} Score {raw.rows.length.toLocaleString()} startups
            </Button>
          </div>
        </Card>
      )}

      {!portfolio.length && !raw ? (
        <EmptyState icon={<Briefcase />} title="No portfolio yet" body="Upload a CSV or use the bundled synthetic dataset to screen many startups at once." />
      ) : portfolio.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>Source: <span className="text-fg">{portfolioSource}</span></span>
            {portfolioSource?.startsWith("Bundled") && <SyntheticBadge />}
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { clearPortfolio(); toast("Portfolio cleared"); }}><Trash2 /> Clear</Button>
            <Button size="sm" onClick={exportCsv}><Download /> Export CSV</Button>
          </div>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Portfolio summary">
            <Stat label="Scored" value={ok.length} />
            <Stat label="Flagged rows" value={bad.length} tone={bad.length ? "text-high" : undefined} />
            {(["Low", "Medium", "High"] as const).map((b) => (
              <Stat key={b} label={`${b} risk`} value={ok.filter((r) => r.band === b).length} badge={<RiskBadge band={b} />} />
            ))}
          </section>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card><CardHeader title="Runway vs churn" subtitle="Bubble size = MRR, colour = risk band." /><PortfolioScatter rows={view} /></Card>
            <Card><CardHeader title="Risk distribution" subtitle="Failure probability, 10-point bins." /><RiskHistogram rows={view} /></Card>
          </div>
          <Card>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="relative min-w-52 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input className="pl-9" placeholder="Search ID or sector" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search startups" />
              </div>
              <Select className="w-36" value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Filter sector"><option value="">All sectors</option>{SECTORS.map((s) => <option key={s}>{s}</option>)}</Select>
              <Select className="w-32" value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Filter stage"><option value="">All stages</option>{STAGES.map((s) => <option key={s}>{s}</option>)}</Select>
              <div className="flex gap-1" role="group" aria-label="Filter risk tier">
                {(["Low", "Medium", "High"] as const).map((b) => (
                  <button key={b} aria-pressed={bands.includes(b)} onClick={() => setBands(bands.includes(b) ? bands.filter((x) => x !== b) : [...bands, b])} className={cn("cursor-pointer rounded-lg px-2 py-1 transition-opacity", !bands.includes(b) && "opacity-40")}>
                    <RiskBadge band={b} suffix="" />
                  </button>
                ))}
              </div>
              <Chip>{view.length.toLocaleString()} shown</Chip>
            </div>
            <div className="max-h-[560px] overflow-auto rounded-xl border border-[var(--border)]">
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">Scored startups</caption>
                <thead className="sticky top-0 z-10 bg-[var(--surface-2)] text-xs text-muted">
                  <tr>
                    <SortTh k="startup_id">Startup</SortTh>
                    <th scope="col" className="px-3 py-2 font-medium">Sector · stage</th>
                    <SortTh k="probability">Risk</SortTh>
                    <th scope="col" className="px-3 py-2 font-medium">Tier</th>
                    <SortTh k="runway_months">Runway</SortTh>
                    <SortTh k="readiness">Readiness</SortTh>
                    <SortTh k="mrr">MRR</SortTh>
                    <th scope="col" className="px-3 py-2 font-medium">LTV:CAC</th>
                  </tr>
                </thead>
                <tbody>
                  {view.slice(0, 500).map((r) => (
                    <tr key={r.startup_id} className="border-t border-[var(--border)] hover:bg-[var(--surface)]">
                      <td className="num px-3 py-2 text-fg">{r.startup_id}{r.missing?.length ? <span className="ml-1 text-[10px] text-medium" title={`Missing: ${r.missing.join(", ")}`}>·{r.missing.length} missing</span> : null}</td>
                      <td className="px-3 py-2 text-muted">{r.sector} · {r.stage}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--border)]"><div className="h-full" style={{ width: `${(r.probability ?? 0) * 100}%`, background: r.band === "Low" ? "var(--low)" : r.band === "Medium" ? "var(--medium)" : "var(--high)" }} /></div>
                          <span className="num text-fg">{prob(r.probability)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">{r.band && <RiskBadge band={r.band} suffix="" />}</td>
                      <td className="num px-3 py-2 text-fg">{months(r.runway_months)}</td>
                      <td className="num px-3 py-2 text-fg">{r.readiness?.toFixed(0)}</td>
                      <td className="num px-3 py-2 text-fg">₹{r.mrr?.toFixed(1)} L</td>
                      <td className="num px-3 py-2 text-fg">{ratio(r.ltv_cac)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {view.length > 500 && <p className="p-3 text-center text-xs text-muted">Showing the first 500 of {view.length.toLocaleString()}. Export CSV for all rows.</p>}
              {view.length === 0 && <p className="p-6 text-center text-sm text-muted">No startups match these filters.</p>}
            </div>
          </Card>
          {bad.length > 0 && (
            <Card className="border-high/30">
              <CardHeader title={`Flagged rows (${bad.length})`} subtitle="Kept for review, not scored. Fix them in your CSV and upload again." />
              <ul className="max-h-72 divide-y divide-[var(--border)] overflow-auto text-sm">
                {bad.map((r) => (
                  <li key={r.startup_id} className="flex flex-wrap gap-x-4 gap-y-1 py-2">
                    <span className="num w-32 shrink-0 text-fg">{r.startup_id}</span>
                    <span className="text-high">{r.error}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone, badge }: { label: string; value: number; tone?: string; badge?: React.ReactNode }) {
  return (
    <div className="glass p-4">
      <div className="flex items-center justify-between text-xs text-muted">{label}{badge}</div>
      <CountUp value={value} format={(v) => Math.round(v).toLocaleString()} className={cn("mt-2 block text-3xl font-semibold text-fg", tone)} />
    </div>
  );
}

export type { BatchRow };
