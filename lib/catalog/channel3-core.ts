/**
 * Channel3 (channel3.ai): ανάλυση της απάντησης του `POST /v1/search` — χωρίς I/O, για να ελέγχεται με tests.
 * Η Channel3 συγκεντρώνει τα προϊόντα των καταστημάτων: τίτλος, μάρκα, `key_features`, `structured_attributes`,
 * φωτογραφίες και ανά κατάστημα (offer) τιμή και διαστάσεις. Δεν δίνει barcode, άρα το ταίριασμα γίνεται με τον
 * κωδικό του κατασκευαστή μέσα στον τίτλο — αλλιώς δεν κρατάμε τίποτα (λάθος προϊόν = λάθος χαρακτηριστικά στο site).
 */
export interface C3Dim { number: number; unit: string }
export interface C3Offer { url: string; domain: string; price?: { price?: number; currency?: string }; availability?: string; dimensions?: { length?: C3Dim | null; width?: C3Dim | null; height?: C3Dim | null; weight?: C3Dim | null } | null }
export interface C3Product {
  id: string; title: string; description?: string | null;
  brands?: { id?: string; name: string }[];
  images?: { url: string; cleaned_url?: string | null; is_main_image?: boolean; shot_type?: string | null }[];
  key_features?: string[] | null;
  structured_attributes?: Record<string, string[]>;
  offers?: C3Offer[];
  category?: { title?: string; path?: string[] } | null;
}
export interface C3Spec { group: string; key: string; value: string }

/** Κωδικός για σύγκριση: πεζά, μόνο γράμματα και ψηφία (το «WM-8014 /EU» ταιριάζει με «wm8014eu»). */
export const normCode = (s: string | null | undefined) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

/** Κωδικοί που αναζητούμε στον τίτλο: κωδικός κατασκευαστή, μετά SKU — μόνο αν είναι αρκετά μακριοί για να μη μοιάζουν τυχαία. */
export function matchCodes(p: { modelCode: string | null; sku: string }): string[] {
  return [...new Set([p.modelCode, p.sku].map(normCode).filter((c) => c.length >= 4 && /\d/.test(c)))];
}

export function c3Query(p: { brand: string; modelCode: string | null; sku: string; title: string }): string {
  const code = p.modelCode?.trim() || p.sku.trim();
  return `${p.brand} ${code}`.trim().slice(0, 200);
}

/** λέξεις του τίτλου που μοιάζουν με κωδικό μοντέλου: ≥ 6 χαρακτήρες, γράμματα και ψηφία */
const codeWords = (t: string) => t.split(/[^\p{L}\p{N}]+/u).map(normCode).filter((w) => w.length >= 6 && /\d/.test(w) && /[a-z]/.test(w));

/**
 * Ταίριασμα κωδικού: ολόκληρος μέσα στον τίτλο, ή ο «βασικός» κωδικός χωρίς την κατάληξη αγοράς/χρώματος — τα καταστήματα
 * γράφουν «QE55Q7F» για το δικό μας «QE55Q7FAAUXXH». Ο βασικός πρέπει να είναι τουλάχιστον το μισό του κωδικού.
 */
export function codeMatch(title: string, code: string): "exact" | "base" | null {
  if (normCode(title).includes(code)) return "exact";
  return codeWords(title).some((w) => (code.startsWith(w) && w.length * 2 >= code.length) || w.startsWith(code)) ? "base" : null;
}

/** Αποτέλεσμα ίδιας μάρκας με τον κωδικό μας στον τίτλο — πρώτα ολόκληρος κωδικός, μετά ο βασικός. */
export function pickMatch(products: C3Product[], p: { brand: string; modelCode: string | null; sku: string }): C3Product | null {
  const codes = matchCodes(p), brand = normCode(p.brand);
  if (!codes.length) return null;
  const sameBrand = products.filter((x) => !brand || (x.brands ?? []).some((b) => { const n = normCode(b.name); return n && (n.includes(brand) || brand.includes(n)); }) || normCode(x.title).includes(brand));
  const rank = { exact: 2, base: 1 } as const;
  const level = (x: C3Product) => codes.reduce<number>((m, c) => { const k = codeMatch(x.title, c); return Math.max(m, k ? rank[k] : 0); }, 0);
  return sameBrand.find((x) => level(x) === 2) ?? sameBrand.find((x) => level(x) === 1) ?? null;
}

const USELESS = /^(ναι|yes|y|-|—|n\/a|na|null|0|όχι|no|none|unknown)$/i;
const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
/** «screen_size» → «Screen size» */
const humanize = (h: string) => { const t = clean(h.replace(/[_-]+/g, " ")); return t.charAt(0).toUpperCase() + t.slice(1); };
const SKIP_ATTR = new Set(["gender", "age", "condition", "availability"]);
const DIM_LABEL: Record<string, string> = { length: "Μήκος", width: "Πλάτος", height: "Ύψος", weight: "Βάρος" };
const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString("el-GR");

/** Χαρακτηριστικά: structured_attributes, «κλειδί: τιμή» από τα key_features, διαστάσεις/βάρος του πρώτου καταστήματος που τα δίνει. */
export function c3Specs(x: C3Product): C3Spec[] {
  const out: C3Spec[] = [], seen = new Set<string>();
  const add = (group: string, key: string, value: string) => {
    const k = clean(key).slice(0, 120), v = clean(value).slice(0, 500), id = k.toLowerCase();
    if (!k || !v || USELESS.test(v) || seen.has(id) || k.length > 60) return;
    seen.add(id); out.push({ group, key: k, value: v });
  };
  for (const [h, vals] of Object.entries(x.structured_attributes ?? {})) if (!SKIP_ATTR.has(h) && Array.isArray(vals)) add("Χαρακτηριστικά", humanize(h), vals.map(clean).filter(Boolean).join(", "));
  const plain: string[] = [];
  for (const f of x.key_features ?? []) {
    const m = /^([^:]{2,60}):\s*(.+)$/.exec(clean(f));
    if (m) add("Βασικά χαρακτηριστικά", m[1], m[2]); else if (clean(f)) plain.push(clean(f));
  }
  // τα σημεία χωρίς «κλειδί: τιμή» («QLED Display», «HDR10+») μαζεμένα σε μία γραμμή
  if (plain.length) add("Βασικά χαρακτηριστικά", "Βασικά σημεία", plain.join(" · "));
  const dims = (x.offers ?? []).map((o) => o.dimensions).find((d) => d && (d.width || d.height || d.length || d.weight));
  if (dims) for (const k of ["width", "height", "length", "weight"] as const) { const d = dims[k]; if (d && d.number > 0) add("Διαστάσεις & βάρος", DIM_LABEL[k], `${fmt(d.number)} ${d.unit}`); }
  return out;
}

/** Φωτογραφίες: η κύρια πρώτα, η κανονική λήψη (όχι η κομμένη της Channel3), έως 12. */
export function c3Images(x: C3Product, max = 12): string[] {
  const imgs = [...(x.images ?? [])].sort((a, b) => Number(!!b.is_main_image) - Number(!!a.is_main_image));
  return [...new Set(imgs.map((i) => i.url).filter((u) => /^https:\/\//.test(u ?? "")))].slice(0, max);
}

/** Η σελίδα του προϊόντος σε κατάστημα (για αναφορά πηγής) — πρώτα όσα έχουν απόθεμα. */
export function c3Offer(x: C3Product, blocked: (url: string) => boolean): C3Offer | null {
  const offers = (x.offers ?? []).filter((o) => o.url && !blocked(o.url));
  return offers.find((o) => o.availability === "InStock") ?? offers[0] ?? null;
}
