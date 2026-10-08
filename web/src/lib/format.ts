export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export const lakh = (v: number | null | undefined, d = 1) => (isNum(v) ? `₹${v.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d })} L` : "n/a");
export const pct = (v: number | null | undefined, d = 1) => (isNum(v) ? `${v.toFixed(d)}%` : "n/a");
export const prob = (v: number | null | undefined, d = 1) => (isNum(v) ? `${(v * 100).toFixed(d)}%` : "n/a");
export const months = (v: number | null | undefined) => (isNum(v) ? (v >= 60 ? "60+ mo" : `${v.toFixed(1)} mo`) : "n/a");
export const ratio = (v: number | null | undefined, d = 1) => (isNum(v) ? `${v.toFixed(d)}×` : "n/a");
export const pts = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)} pts`;

export function monthToDate(monthsFromNow: number | null): string | null {
  if (!isNum(monthsFromNow)) return null;
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + Math.floor(monthsFromNow));
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}
