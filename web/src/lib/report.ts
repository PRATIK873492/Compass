// PDF export of the founder dashboard: a text summary page plus a snapshot of the dashboard.

import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { lakh, monthToDate, months, pct, prob, ratio } from "./format";
import type { Mode, PredictResponse } from "./types";

export async function exportReport(node: HTMLElement, data: PredictResponse, name: string, mode: Mode | "checking") {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const m = 44;
  let y = m;
  const line = (text: string, size = 10, bold = false, color: [number, number, number] = [30, 41, 59]) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    for (const l of pdf.splitTextToSize(text, W - 2 * m)) {
      if (y > H - m) {
        pdf.addPage();
        y = m;
      }
      pdf.text(l, m, y);
      y += size * 1.45;
    }
  };
  const r = data.result, k = data.kpis;
  // jsPDF's core fonts lack the rupee sign, so the PDF uses "Rs".
  const rs = (v: number | null) => lakh(v).replace("₹", "Rs ");
  line("Startup Compass report", 20, true, [15, 23, 42]);
  line(`${name} · ${data.input.sector} · ${data.input.stage} · generated ${new Date().toLocaleString("en-IN")}`, 9, false, [100, 116, 139]);
  line(
    "SYNTHETIC DATA. The model is trained on generated records. Outputs are probabilities for decision support, never guarantees.",
    9, true, [180, 83, 9],
  );
  y += 6;
  line(`24-month failure risk: ${prob(r.probability)} (${r.band} risk)`, 14, true);
  line(`Funding-readiness score: ${r.readiness_score.toFixed(0)} / 100`, 11);
  line(`Scored by: ${mode === "api" ? "FastAPI calibrated model" : "in-browser logistic fallback"}`, 9, false, [100, 116, 139]);
  y += 6;
  line("Key metrics", 12, true);
  line(`Runway ${months(k.runway_months)} · Net burn ${rs(k.net_burn)}/mo · LTV:CAC ${ratio(k.ltv_cac)} · Burn multiple ${ratio(k.burn_multiple)} · Churn ${pct(k.churn_pct)} · Growth ${pct(k.growth_pct)} MoM`);
  const co = data.projection.cashout_month;
  line(`Projected cash-out: base ${co.base === null ? "beyond 12 months" : monthToDate(co.base)}, worst ${co.worst === null ? "beyond 12 months" : monthToDate(co.worst)}, best ${co.best === null ? "beyond 12 months" : monthToDate(co.best)}`);
  y += 6;
  line("Risk drivers", 12, true);
  for (const d of [...r.top_negative, ...r.top_positive]) line(`• ${d.sentence.replace(/₹/g, "Rs ")}`);
  for (const w of r.warnings) line(`Note: ${w}`, 9, false, [100, 116, 139]);
  y += 6;
  line("Peer medians", 12, true);
  const p = data.peer_medians;
  line(`n = ${p.n} · runway ${months(p.runway_months)} · LTV:CAC ${ratio(p.ltv_cac)} · burn multiple ${ratio(p.burn_multiple)} · churn ${pct(p.churn_pct)}`);

  const png = await toPng(node, {
    pixelRatio: 1.5,
    backgroundColor: getComputedStyle(document.body).getPropertyValue("--bg").trim() || "#0a101c",
    filter: (n) => !(n instanceof HTMLElement && n.classList.contains("no-print")),
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = png;
  });
  const iw = W - 2 * m;
  const ih = (img.height / img.width) * iw;
  pdf.addPage();
  let offset = 0;
  const pageH = H - 2 * m;
  while (offset < ih) {
    pdf.addImage(png, "PNG", m, m - offset, iw, ih);
    offset += pageH;
    if (offset < ih) pdf.addPage();
  }
  pdf.save(`startup-compass-${name.replace(/\W+/g, "-").toLowerCase()}.pdf`);
}
