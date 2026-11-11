// Καθαρές συναρτήσεις ταιριάσματος με τον Κωτσόβολο: χωρίς I/O, χωρίς DB.
export type KotItem = { art: string; path: string; last: string };

const safeDecode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
const locs = (xml: string) => [...xml.matchAll(/<loc>\s*https?:\/\/(?:www\.)?kotsovolos\.gr\/([^<\s]*)\s*<\/loc>/g)].map((m) => safeDecode(m[1]).replace(/\/+$/, ""));
const split = (p: string) => { const i = p.lastIndexOf("/"); return { path: p.slice(0, i < 0 ? 0 : i), last: p.slice(i + 1) }; };

export function parseSitemap(xml: string): KotItem[] {
  const out: KotItem[] = [];
  for (const p of locs(xml)) {
    const { path, last } = split(p);
    const art = /^\d+/.exec(last)?.[0];
    if (art) out.push({ art, path, last });
  }
  return out;
}

export function parseCategories(xml: string): { path: string; label: string }[] {
  return locs(xml).filter(Boolean).map((p) => ({ path: p, label: split(p).last }));
}

/** Μικρά, μόνο a-z0-9 (τα ελληνικά φεύγουν, γι' αυτό η μάρκα ελέγχεται με λατινικό όνομα). */
export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");

// ---- Ταίριασμα με κωδικό μοντέλου ----
// Ο Κωτσόβολος κόβει την κατάληξη περιοχής (QE65QN90DATXXH → qe65qn90da): ένα κομμάτι του slug ή δύο διαδοχικά
// και το μοντέλο είναι το ένα αρχή του άλλου, το μικρότερο ≥ 5 χαρακτήρες με ψηφίο.
const MIN_MODEL = 5;
const slugTokens = (last: string) => {
  const t = last.split("-").slice(1).map(norm).filter(Boolean); // slice(1): ο αριθμός είδους δεν είναι κωδικός
  return [...t, ...t.slice(1).map((x, i) => t[i] + x)];
};
const hasBrand = (last: string, ...names: (string | null | undefined)[]) => {
  const l = norm(last);
  return names.some((n) => { const b = norm(n ?? ""); return b !== "" && l.includes(b); });
};

type ModelMatch = { kind: "matched"; item: KotItem } | { kind: "ambiguous"; items: KotItem[] } | { kind: "none" };
export function matchByModel(o: { brand: string; alias?: string | null; model: string | null }, cands: KotItem[]): ModelMatch {
  const model = norm(o.model ?? "");
  if (model.length < MIN_MODEL) return { kind: "none" };
  const items = cands.filter((c) =>
    hasBrand(c.last, o.brand, o.alias) &&
    slugTokens(c.last).some((t) => {
      const [a, b] = t.length <= model.length ? [t, model] : [model, t];
      return a.length >= MIN_MODEL && /\d/.test(a) && b.startsWith(a);
    }));
  return items.length === 1 ? { kind: "matched", item: items[0] } : items.length ? { kind: "ambiguous", items } : { kind: "none" };
}

// ---- Κινητά: το slug έχει όνομα, όχι κωδικό ----
const ACCESSORY = /θηκ|μεμβραν|τζαμ|γυαλι|set-/i;
const VARIANTS = ["ultra", "pro", "max", "plus", "fe", "mini", "flip", "fold", "lite"];
const wordsOf = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
const gb = (t: string) => { const m = /^(\d+)(gb|g|tb|t)$/.exec(t); return m ? Number(m[1]) * (m[2][0] === "t" ? 1024 : 1) : null; };
const hasVariant = (toks: string[], v: string) => toks.some((t) => t === v || (v === "ultra" && t === "ult"));

/** Πάντα πρόταση (ο διαχειριστής την επιβεβαιώνει). Σιγουριά μόνο από: μάρκα, παραλλαγή (ultra/pro/…), αριθμός σειράς, μνήμη. */
export function matchPhone(o: { brand: string; alias?: string | null; title: string }, cands: KotItem[]): KotItem | null {
  const tt = wordsOf(o.title);
  const mems = tt.map(gb).filter((x): x is number => x != null);
  const storage = mems.length ? Math.max(...mems) : null;
  const series = tt.filter((t) => /^\d{1,2}$/.test(t) || /^[a-z]\d{1,2}$/.test(t)); // "8", "s25"
  const words = tt.filter((t) => t.length >= 3 && gb(t) == null && !/^[45]g$/.test(t) && !/\d/.test(t));
  let best: { c: KotItem; score: number } | null = null;
  for (const c of cands) {
    if (ACCESSORY.test(c.last) || !hasBrand(c.last, o.brand, o.alias)) continue;
    const st = wordsOf(c.last).slice(1);
    if (VARIANTS.some((v) => hasVariant(tt, v) !== hasVariant(st, v))) continue;
    if (series.some((s) => !st.includes(s))) continue;
    if (storage != null && !st.some((t) => gb(t) === storage)) continue;
    // χρώμα και λέξεις του ονόματος: κοινό πρόθεμα ≥ 4 γράμματα
    const score = words.filter((w) => st.some((t) => t.length >= 4 && (w.startsWith(t) || t.startsWith(w)))).length;
    if (!best || score > best.score) best = { c, score };
  }
  return best?.c ?? null;
}

export function isBundle(title: string, kind: string): boolean {
  return kind === "set" || /\+\s*δωρο|\bδωρο\b/.test(title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
}

// ---- Απάντηση API ----
const price = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
export function parseProduct(json: unknown): { title: string; list: number | null; offer: number | null; buyable: boolean } | { error: string } {
  const e = (json as any)?.catalogEntryView?.[0];
  if (!e || typeof e !== "object") return { error: typeof json === "string" ? "η απάντηση δεν ήταν JSON" : "άδεια απάντηση" };
  const rows: any[] = Array.isArray(e.price) ? e.price.filter((r: unknown) => r && typeof r === "object") : [];
  const by = (u: string) => price(rows.find((r) => r.usage === u)?.value);
  return { title: typeof e.name === "string" ? e.name : "", list: by("Display"), offer: by("Offer"), buyable: e.buyable === true || e.buyable === "true" };
}

/** (εμείς − Κωτσ.) / Κωτσ. · 100, 1 δεκαδικό. */
export const diffPct = (ours: number, theirs: number) => Math.round(((ours - theirs) / theirs) * 1000) / 10;

/** up = εμείς ακριβότεροι, down = φθηνότεροι, eq = |diff| ≤ 0,5. */
export function badgeState(diff: number | null, available: boolean): "up" | "down" | "eq" | "gone" | "none" {
  if (!available) return "gone";
  if (diff == null) return "none";
  return Math.abs(diff) <= 0.5 ? "eq" : diff > 0 ? "up" : "down";
}
