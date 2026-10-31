/**
 * Πρόταση χαρακτηριστικών / διαστάσεων / βάρους από το κείμενο της απόδελτίωσης — ο καθαρός έλεγχος της απάντησης του AI.
 * Κρατιέται μόνο ό,τι (α) είναι χαρακτηριστικό της ομάδας της κατηγορίας, (β) σε χαρακτηριστικό με λίστα τιμών είναι μία
 * από αυτές, (γ) στηρίζεται σε απόσπασμα που υπάρχει ΠΡΑΓΜΑΤΙΚΑ στο κείμενο. Ό,τι δεν ελέγχεται, πετιέται.
 */
export interface SpecDefLite { name: string; options: string[] }
export interface SuggestedSpec { label: string; value: string; quote: string; exists: boolean }
export interface SuggestedNum { value: number; quote: string; source: string }
export interface SuggestedDims { w: number; h: number; d: number; quote: string; source: string }
export interface SpecSuggestion { specs: SuggestedSpec[]; dims: SuggestedDims[]; weight: SuggestedNum | null }

export interface AiAnswer {
  specs?: { name?: unknown; value?: unknown; quote?: unknown }[];
  dims?: { w?: unknown; h?: unknown; d?: unknown; unit?: unknown; quote?: unknown } | null;
  weight?: { value?: unknown; unit?: unknown; quote?: unknown } | null;
}

export const plainKey = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ς/g, "σ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** Για τιμές λίστας: κρατά τα σύμβολα («A+++» ≠ «A»), αγνοεί τόνους, κεφαλαία και κενά */
const optKey = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ς/g, "σ").replace(/\s+/g, "");
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };
/** Το απόσπασμα υπάρχει στο κείμενο (χωρίς τόνους, κεφαλαία, στίξη) και έχει ουσία. */
export const quoted = (quote: unknown, text: string) => {
  const q = plainKey(String(quote ?? ""));
  return q.length >= 3 && plainKey(text).includes(q);
};
const CM: Record<string, number> = { mm: 0.1, cm: 1, m: 100, in: 2.54, inch: 2.54 };
const KG: Record<string, number> = { g: 0.001, gr: 0.001, kg: 1 };
const round = (n: number) => Math.round(n * 10) / 10;

export function validateSuggestion(ans: AiAnswer | null, defs: SpecDefLite[], text: string, existing: string[]): Omit<SpecSuggestion, "dims"> & { dims: SuggestedDims | null } {
  const byKey = new Map(defs.map((d) => [plainKey(d.name), d]));
  const have = new Set(existing.map(plainKey));
  const seen = new Set<string>();
  const specs: SuggestedSpec[] = [];
  for (const s of ans?.specs ?? []) {
    const def = byKey.get(plainKey(String(s.name ?? "")));
    let value = String(s.value ?? "").trim();
    if (!def || !value || value.length > 200 || seen.has(def.name) || !quoted(s.quote, text)) continue;
    if (def.options.length) {
      const opt = def.options.find((o) => optKey(o) === optKey(value));
      if (!opt) continue;
      value = opt;
    }
    seen.add(def.name);
    specs.push({ label: def.name, value, quote: String(s.quote).trim().slice(0, 160), exists: have.has(plainKey(def.name)) });
  }
  let dims: SuggestedDims | null = null;
  const d = ans?.dims;
  if (d && quoted(d.quote, text)) {
    const f = CM[String(d.unit ?? "cm").toLowerCase()] ?? null;
    const w = num(d.w), h = num(d.h), dd = num(d.d);
    if (f && w && h && dd) {
      const cm = [w, h, dd].map((x) => round(x * f));
      // λογικά όρια οικιακής συσκευής: 1 εκ. – 4 μ.
      if (cm.every((x) => x >= 1 && x <= 400)) dims = { w: cm[0], h: cm[1], d: cm[2], quote: String(d.quote).trim().slice(0, 160), source: "απόδελτίωση" };
    }
  }
  let weight: SuggestedNum | null = null;
  const wt = ans?.weight;
  if (wt && quoted(wt.quote, text)) {
    const f = KG[String(wt.unit ?? "kg").toLowerCase()] ?? null;
    const v = num(wt.value);
    if (f && v) { const kg = Math.round(v * f * 1000) / 1000; if (kg > 0.01 && kg <= 500) weight = { value: kg, quote: String(wt.quote).trim().slice(0, 160), source: "απόδελτίωση" }; }
  }
  return { specs, dims, weight };
}
