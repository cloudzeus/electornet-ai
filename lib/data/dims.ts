import type { Product } from "./types";

export interface Dims {
  /** centimetres */
  w: number;
  h: number;
  d: number;
  /** από πού: EPREL (δηλωμένες από τον κατασκευαστή), specs του προϊόντος, ή τυπικές της κατηγορίας */
  source: "eprel" | "specs" | "category";
}

const CATEGORY_DEFAULTS: Record<string, [number, number, number]> = {
  tileoraseis: [123, 71, 26],
  "air-condition": [80, 29, 20],
  plyntiria: [60, 85, 60],
  stegnotiria: [60, 85, 60],
  psygeia: [60, 180, 66],
  koyzines: [60, 85, 60],
  laptops: [30, 1.2, 21.5],
  tablets: [25, 0.7, 18],
  smartphones: [7.6, 15, 0.8],
  kinita: [7.6, 15, 0.8],
  "kafes-rofimata": [24, 35, 43],
  skoypes: [30, 25, 45],
  "foritos-ichos": [7, 18, 7],
  sideroma: [13, 15, 30],
  mageiriki: [30, 32, 40],
  andras: [6, 16, 6],
};

const num = (s: string) => parseFloat(s.replace(",", "."));

/**
 * @dynamic Outer dimensions of a product in cm, for Fit-My-Space and AR.
 * Reads "Υ × Π × Β" / "Πλάτος" / "Ύψος" / "Βάθος" specs when present
 * (ERP attributes, EPREL or Icecat in production); otherwise a category
 * default, flagged as such so the UI can say «τυπικές διαστάσεις».
 */
export function dimsFor(p: Product): Dims | null {
  // Δηλωμένες διαστάσεις από το EPREL: προτεραιότητα σε ό,τι άλλο
  if (p.dims && p.dims.w > 0 && p.dims.h > 0 && p.dims.d > 0) return p.dims;
  const specs = p.specs ?? [];
  const hwd = specs.find((s) => /Υ\s*[×x]\s*Π\s*[×x]\s*Β/i.test(s.key) || /^Διαστάσεις/i.test(s.key));
  if (hwd) {
    const m = hwd.value.match(/([\d.,]+)\s*[×x]\s*([\d.,]+)\s*[×x]\s*([\d.,]+)/);
    if (m) {
      const [h, w, d] = [num(m[1]), num(m[2]), num(m[3])];
      const k = /mm/.test(hwd.value) ? 0.1 : /\bm\b/.test(hwd.value) && h < 10 ? 100 : 1;
      return { w: w * k, h: h * k, d: d * k, source: "specs" };
    }
  }
  const get = (re: RegExp) => {
    const s = specs.find((x) => re.test(x.key));
    if (!s) return null;
    const v = num(s.value);
    if (!Number.isFinite(v)) return null;
    return /\bm\b/.test(s.value) && v < 10 ? v * 100 : /mm/.test(s.value) ? v / 10 : v;
  };
  // TVs: derive from the diagonal in the title (16:9 panel + stand), e.g. 43", 55", 65"
  if (p.subcategory === "tileoraseis" || p.category === "eikona-ixos") {
    const m = p.title.match(/(\d{2,3})\s*["″”]/) ?? p.title.match(/\b(32|40|43|50|55|65|75|85)\b/);
    if (m) {
      const inch = Number(m[1]);
      return { w: Math.round(inch * 2.54 * 0.8716 + 1), h: Math.round(inch * 2.54 * 0.4903 + 6), d: inch >= 55 ? 26 : 20, source: "specs" };
    }
  }
  const w = get(/^Πλάτος/i);
  const h = get(/^Ύψος/i);
  const d = get(/^Βάθος/i);
  const def = CATEGORY_DEFAULTS[p.subcategory] ?? CATEGORY_DEFAULTS[p.category];
  if (w && h && d) return { w, h, d, source: "specs" };
  if (def) return { w: w ?? def[0], h: h ?? def[1], d: d ?? def[2], source: w || h || d ? "specs" : "category" };
  return null;
}
