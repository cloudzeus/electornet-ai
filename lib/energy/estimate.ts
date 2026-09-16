import type { Product } from "@/lib/data/types";

/** Typical annual kWh of a 10–15-year-old appliance per category (Greek household, EU reference). */
export const OLD_APPLIANCE_KWH: Record<string, number> = {
  psygeia: 420,
  plyntiria: 260,
  stegnotiria: 480,
  "air-condition": 780,
  tileoraseis: 190,
  "plyntiria-piaton": 320,
  koyzines: 260,
};

/** New-appliance annual kWh by category and class (EU 2021 label scale). */
const BY_CLASS: Record<string, Partial<Record<string, number>>> = {
  psygeia: { A: 110, B: 140, C: 170, D: 200, E: 240, F: 280, G: 320 },
  plyntiria: { A: 48, B: 58, C: 66, D: 74, E: 84, F: 96 },
  stegnotiria: { "A+++": 176, "A++": 210, "A+": 260, A: 300, B: 380, C: 460 },
  "air-condition": { "A+++": 160, "A++": 190, "A+": 230, A: 280, B: 330 },
  tileoraseis: { A: 50, B: 60, C: 70, D: 80, E: 95, F: 110, G: 130 },
  "plyntiria-piaton": { A: 60, B: 70, C: 80, D: 90, E: 100 },
  koyzines: { "A+": 150, A: 170, B: 200 },
};

export function estimateKwh(p: Product): { kwh: number; source: "eprel" | "specs" | "estimate" } | null {
  // Δηλωμένη τιμή από το EPREL (ετήσια kWh με τις παραδοχές του κανονισμού) — η πιο αξιόπιστη
  if (p.energy?.kwh && Number.isFinite(p.energy.kwh)) return { kwh: p.energy.kwh, source: "eprel" };
  const spec = (p.specs ?? []).find((s) => /Ετήσια κατανάλωση|kWh\/έτος|kWh\/annum/i.test(s.key) || /kWh\/(annum|έτος)/i.test(s.value));
  if (spec) {
    const v = parseFloat(spec.value.replace(",", "."));
    if (Number.isFinite(v)) return { kwh: v, source: "specs" };
  }
  const table = BY_CLASS[p.subcategory] ?? BY_CLASS[p.category];
  const cls = p.energy?.cls;
  if (!table || !cls) return null;
  const v = table[cls] ?? table[cls.replace(/\+/g, "")] ?? null;
  return v ? { kwh: v, source: "estimate" } : null;
}
