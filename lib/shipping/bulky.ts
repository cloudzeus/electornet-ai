/**
 * Ποια προϊόντα μπορούν να φύγουν με courier ή σε θυρίδα — καθαρές συναρτήσεις, ίδιες σε server και tests.
 * Σειρά απόφασης:
 *  1. ρητή επιλογή του διαχειριστή στην κατηγορία (ή στην πιο κοντινή γονική): «courier» ή «store» (μόνο από κατάστημα)
 *  2. προεπιλογή του καταστήματος για τις μεγάλες συσκευές (ψυγεία, πλυντήρια, κουζίνες, κλιματιστικά…)
 *  3. βάρος συσκευασίας / μέγεθος πάνω από τα όρια → μόνο από κατάστημα (παράδοση με ραντεβού ή παραλαβή)
 * Θυρίδα BOX NOW: επιπλέον ≤ 20 κιλά και να χωράει στο μεγάλο ντουλάπι 36 × 45 × 60 cm.
 */
export type ShipChoice = "courier" | "store";
export interface BulkyRules { categories: Record<string, ShipChoice>; maxKg: number; maxSideCm: number; lockerMaxKg: number; lockerBox: [number, number, number] }

/** Οι μεγάλες συσκευές που πηγαίνουν από το κατάστημα, εκτός αν ο διαχειριστής ορίσει αλλιώς (slug → υποδέντρο). */
export const DEFAULT_STORE_ONLY: Record<string, ShipChoice> = {
  psygeia: "store", "mikra-psygeia-mini-bars": "courier",
  "plyntiria-stegnotiria": "store", koyzines: "store",
  "klimatistika-inverter": "store", imiepaggelmatika: "store",
  "iliakoi-thermosifones": "store",
  "psygeia-entoichizomena": "store", "set-entoichismoy-entoichizomena": "store",
};
export const DEFAULT_RULES: BulkyRules = { categories: {}, maxKg: 30, maxSideCm: 150, lockerMaxKg: 20, lockerBox: [36, 45, 60] };

export interface ShipFacts { categoryPath: string[]; weightKg: number | null; dimsCm: [number, number, number] | null }
export interface ShipVerdict { courier: boolean; locker: boolean; reason: string | null }

/** Κιλά από ελεύθερο κείμενο («65 kg», «65,5 κιλά», «850 g», «12.3»). */
export function parseKg(v: string | null | undefined): number | null {
  const m = String(v ?? "").replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(kg|κιλ|κgr|gr|g\b|γρ)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  const kg = /^(gr|g|γρ)$/i.test(m[2] ?? "") ? n / 1000 : n;
  return kg > 0 && kg < 1000 ? Math.round(kg * 10) / 10 : null;
}

/** Βάρος για αποστολή από τα χαρακτηριστικά: πρώτα της συσκευασίας, μετά του προϊόντος (το μεγαλύτερο αν έχει πολλά). */
export function shippingWeight(specs: { key: string; value: string }[]): number | null {
  const pick = (re: RegExp) => { const v = specs.filter((s) => re.test(s.key)).map((s) => parseKg(s.value)).filter((x): x is number => x != null); return v.length ? Math.max(...v) : null; };
  return pick(/βάρος πακέτου|μεικτό βάρος|μικτό βάρος|βάρος χαρτοκιβωτ|βάρος συσκευασ/i) ?? pick(/^βάρος|καθαρό βάρος/i);
}

export function decideShipping(f: ShipFacts, rules: BulkyRules): ShipVerdict {
  const own = f.categoryPath.map((s) => rules.categories[s]).find(Boolean) ?? f.categoryPath.map((s) => DEFAULT_STORE_ONLY[s]).find(Boolean);
  const longest = f.dimsCm ? Math.max(...f.dimsCm) : null;
  let courier = true, reason: string | null = null;
  if (own === "store") { courier = false; reason = "Μεγάλη συσκευή: παράδοση με ραντεβού από το κατάστημα ή παραλαβή"; }
  else if (own !== "courier" && f.weightKg != null && f.weightKg > rules.maxKg) { courier = false; reason = `Βάρος ${f.weightKg.toLocaleString("el-GR")} κιλά: παράδοση από το κατάστημα`; }
  else if (own !== "courier" && longest != null && longest > rules.maxSideCm) { courier = false; reason = `Διάσταση ${Math.round(longest)} εκ.: παράδοση από το κατάστημα`; }
  const box = [...rules.lockerBox].sort((a, b) => a - b), dims = f.dimsCm ? [...f.dimsCm].sort((a, b) => a - b) : null;
  const fits = dims ? dims.every((d, i) => d <= box[i]) : false;
  // θυρίδα μόνο όταν ξέρουμε ότι χωράει (διαστάσεις) και δεν είναι βαρύ
  const locker = courier && fits && (f.weightKg == null || f.weightKg <= rules.lockerMaxKg);
  return { courier, locker, reason };
}

export function normalizeBulkyRules(raw: unknown): BulkyRules {
  const o = (raw ?? {}) as Partial<Record<keyof BulkyRules, unknown>>;
  const num = (v: unknown, d: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : d; };
  const categories: Record<string, ShipChoice> = {};
  for (const [k, v] of Object.entries((o.categories as Record<string, unknown>) ?? {})) if ((v === "courier" || v === "store") && k) categories[k.slice(0, 160)] = v;
  return {
    categories,
    maxKg: num(o.maxKg, DEFAULT_RULES.maxKg, 1, 200), maxSideCm: num(o.maxSideCm, DEFAULT_RULES.maxSideCm, 20, 400),
    lockerMaxKg: num(o.lockerMaxKg, DEFAULT_RULES.lockerMaxKg, 1, 50),
    lockerBox: Array.isArray(o.lockerBox) && o.lockerBox.length === 3 && o.lockerBox.every((x) => Number(x) > 0) ? (o.lockerBox.map(Number) as [number, number, number]) : DEFAULT_RULES.lockerBox,
  };
}
