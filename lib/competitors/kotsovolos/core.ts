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
// Ο Κωτσόβολος κόβει την κατάληξη περιοχής (QE65QN90DATXXH → qe65qn90da). Το slug χωρίζεται σε κομμάτια και
// η γραμμή ταιριάζει με κωδικό που προκύπτει από έως 4 διαδοχικά κομμάτια. Σχέση με τον δικό μας κωδικό:
// ίσοι ή ο δικός τους πρόθεμα του δικού μας με υπόλοιπο ≥ 3 → matched· υπόλοιπο 1–2 ή ο δικός μας πρόθεμα του δικού τους → suggested.
const MIN_MODEL = 5;
const MIN_REGION = 3;
const slugWords = (last: string) => last.split("-").slice(1).map(norm).filter(Boolean); // slice(1): ο αριθμός είδους δεν είναι κωδικός
const slugRuns = (last: string) => {
  const t = slugWords(last), out: string[] = [];
  for (let i = 0; i < t.length; i++) for (let j = i, s = ""; j < Math.min(t.length, i + 4); j++) out.push((s += t[j]));
  return out;
};
// Η μάρκα (ή το alias) ως ολόκληρο κομμάτι ή σειρά διαδοχικών κομματιών (De Longhi = de + longhi), όχι υπο-συμβολοσειρά.
export const hasBrand = (last: string, ...names: (string | null | undefined)[]) => {
  const runs = new Set(slugRuns(last));
  return names.some((n) => { const b = norm(n ?? ""); return b !== "" && runs.has(b); });
};

/** Ευρετήριο μάρκας: κάθε κομμάτι/σειρά κομματιών του slug → είδη. Χτίζεται μία φορά ανά εκτέλεση (24k είδη). */
export function slugIndex(items: KotItem[]): Map<string, KotItem[]> {
  const ix = new Map<string, KotItem[]>();
  for (const it of items) for (const r of new Set(slugRuns(it.last))) { const a = ix.get(r); if (a) a.push(it); else ix.set(r, [it]); }
  return ix;
}
/** Όλα τα είδη της μάρκας (ή του alias) στο sitemap, με ταίριασμα ολόκληρου κομματιού όπως το hasBrand. */
export function brandPool(ix: Map<string, KotItem[]>, ...names: (string | null | undefined)[]): KotItem[] {
  const out = new Set<KotItem>();
  for (const n of names) { const b = norm(n ?? ""); if (b) for (const it of ix.get(b) ?? []) out.add(it); }
  return [...out];
}

const NUM_UNIT = /^\d+([.,]\d+)?(gb|tb|w|kw|kwh|kg|cm|mm|hz|mah|ah|btu|lt|l|v|rpm|ml|mp|pa|bar|db|inch)?$/i;
/** Κωδικοί μοντέλου μέσα στον τίτλο: κομμάτια ≥5 χαρακτήρων με γράμμα και ψηφίο, όχι μονάδες (2000W, 8GB/256GB, 2x50W, 1400rpm). */
export const modelTokens = (title: string) => [...new Set(title.split(/[\s,()\[\]]+/).map((x) => x.replace(/^["“”'«]+|["“”'».]+$/g, ""))
  .filter((x) => x.length >= 5 && /\d/.test(x) && /[a-z]/i.test(x) && !x.split(/[\/x]/i).every((part) => NUM_UNIT.test(part))))];

const words = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-zα-ω0-9]+/).filter((w) => w.length >= 2);
/** Υποψήφια για το AI: επικάλυψη λέξεων τίτλου/κωδικού με το slug (κοινό πρόθεμα ≥ 4), τα καλύτερα n. */
export function rankCandidates(o: { title: string; model: string | null }, cands: KotItem[], n = 12): KotItem[] {
  const q = [...new Set(words(o.title + " " + (o.model ?? "")))];
  return cands.map((c, i) => ({ c, i, s: words(c.last).filter((w) => q.some((x) => x === w || (x.length >= 4 && (w.startsWith(x) || x.startsWith(w))))).length }))
    .filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, n).map((x) => x.c);
}

/** Η απάντηση του AI ({"pick": n, "why"}) → υποψήφιο ή null (εκτός λίστας, μη αριθμός, null, όχι JSON). */
export function pickFrom(text: string, cands: KotItem[]): { item: KotItem; why: string } | null {
  let j: { pick?: unknown; why?: unknown } | null = null;
  try { j = JSON.parse(/\{[\s\S]*\}/.exec(text)?.[0] ?? "null"); } catch { return null; }
  const n = typeof j?.pick === "number" ? j.pick : typeof j?.pick === "string" ? Number(j.pick) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > cands.length) return null;
  return { item: cands[n - 1], why: typeof j?.why === "string" ? j.why.slice(0, 200) : "" };
}

type Rel = { strong: boolean; reason: string } | null;
const relation = (theirs: string, model: string): Rel => {
  if (Math.min(theirs.length, model.length) < MIN_MODEL || !/\d/.test(theirs.length <= model.length ? theirs : model)) return null;
  if (theirs === model) return { strong: true, reason: "" };
  if (model.startsWith(theirs)) { const rem = model.slice(theirs.length); return { strong: rem.length >= MIN_REGION, reason: `διαφέρει κατάληξη: ${rem}` }; }
  if (theirs.startsWith(model)) return { strong: false, reason: `ο κωδικός τους έχει επιπλέον: ${theirs.slice(model.length)}` };
  return null;
};

type ModelMatch =
  | { kind: "matched"; item: KotItem }
  | { kind: "suggested"; item: KotItem; reason: string }
  | { kind: "ambiguous"; items: KotItem[] }
  | { kind: "none" };
export function matchByModel(o: { brand: string; alias?: string | null; model: string | null }, cands: KotItem[]): ModelMatch {
  const model = norm(o.model ?? "");
  const hits: { item: KotItem; rel: NonNullable<Rel> }[] = [];
  for (const c of cands) {
    if (!hasBrand(c.last, o.brand, o.alias)) continue;
    const rels = slugRuns(c.last).map((t) => relation(t, model)).filter((r): r is NonNullable<Rel> => r != null);
    const rel = rels.find((r) => r.strong) ?? rels[0];
    if (rel) hits.push({ item: c, rel });
  }
  if (hits.length > 1) return { kind: "ambiguous", items: hits.map((h) => h.item) };
  if (!hits.length) return { kind: "none" };
  const { item, rel } = hits[0];
  return rel.strong ? { kind: "matched", item } : { kind: "suggested", item, reason: rel.reason };
}

// ---- Κινητά: το slug έχει όνομα, όχι κωδικό ----
const ACCESSORY_STEM = /^(θηκ|μεμβραν|τζαμ|γυαλι|καλυμ|φορτιστ|καλωδ)/;
const ACCESSORY_WORD = new Set(["set", "case", "cover", "βαση"]);
const isAccessory = (last: string) => last.toLowerCase().split("-").some((t) => ACCESSORY_WORD.has(t) || ACCESSORY_STEM.test(t));
const VARIANTS = ["ultra", "pro", "max", "plus", "fe", "mini", "flip", "fold", "lite"];
const wordsOf = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
const gb = (t: string) => { const m = /^(\d+)(gb|g|tb|t)$/.exec(t); return m ? Number(m[1]) * (m[2][0] === "t" ? 1024 : 1) : null; };
const hasVariant = (toks: string[], v: string) => toks.some((t) => t === v || (v === "ultra" && t === "ult"));

/** Πάντα πρόταση (ο διαχειριστής την επιβεβαιώνει). Σιγουριά μόνο από: μάρκα, παραλλαγή (ultra/pro/…), αριθμός σειράς, μνήμη. */
export function matchPhone(o: { brand: string; alias?: string | null; title: string }, cands: KotItem[]): KotItem | null {
  const tt = wordsOf(o.title.replace(/(\d)\s*\+/g, "$1 plus ")); // s25+ = s25 plus
  const mems = tt.map(gb).filter((x): x is number => x != null);
  const storage = mems.length ? Math.max(...mems) : null;
  const series = tt.filter((t) => (/^\d{1,2}[a-z]?$/.test(t) || /^[a-z]\d{1,2}$/.test(t)) && gb(t) == null && !/^[45]g$/.test(t)); // "8", "s25", "16e"
  const words = tt.filter((t) => t.length >= 3 && gb(t) == null && !/^[45]g$/.test(t) && !/\d/.test(t));
  let best: { c: KotItem; score: number } | null = null;
  for (const c of cands) {
    if (isAccessory(c.last) || !hasBrand(c.last, o.brand, o.alias)) continue;
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
  return kind === "set" || /(^|[^α-ωa-z0-9])δωρο([^α-ωa-z0-9]|$)/.test(title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")); // το \b του JS δεν ξέρει ελληνικά
}

// ---- Απάντηση API ----
const price = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
const eanOf = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  return /^\d{8,14}$/.test(s) ? s : null;
};
export function parseProduct(json: unknown): { title: string; list: number | null; offer: number | null; buyable: boolean; ean: string | null } | { error: string } {
  const e = (json as any)?.catalogEntryView?.[0];
  if (!e || typeof e !== "object") return { error: typeof json === "string" ? "η απάντηση δεν ήταν JSON" : "άδεια απάντηση" };
  const rows: any[] = Array.isArray(e.price) ? e.price.filter((r: unknown) => r && typeof r === "object") : [];
  const by = (u: string) => price(rows.find((r) => r.usage === u)?.value);
  const attrs: any[] = Array.isArray(e.attributes) ? e.attributes : [];
  const bar = attrs.find((a) => a && a.identifier === "BarCode");
  const ean = Array.isArray(bar?.values) ? eanOf(bar.values[0]?.value) : null;
  return { title: typeof e.name === "string" ? e.name : "", list: by("Display"), offer: by("Offer"), buyable: e.buyable === true || e.buyable === "true", ean };
}

/** (εμείς − Κωτσ.) / Κωτσ. · 100, 1 δεκαδικό. */
export const diffPct = (ours: number, theirs: number) => Math.round(((ours - theirs) / theirs) * 1000) / 10;

/** up = εμείς ακριβότεροι, down = φθηνότεροι, eq = |diff| ≤ 0,5. */
export function badgeState(diff: number | null, available: boolean): "up" | "down" | "eq" | "gone" | "none" {
  if (!available) return "gone";
  if (diff == null) return "none";
  return Math.abs(diff) <= 0.5 ? "eq" : diff > 0 ? "up" : "down";
}

/** Σύγκριση EAN/UPC: το UPC-A (12 ψηφία) συμπληρώνεται με 0 μπροστά στα 13. null = λείπει ή δεν είναι έγκυρο. */
export function sameEan(a: string | null | undefined, b: string | null | undefined): boolean | null {
  const n = (x: string | null | undefined) => { const e = eanOf(x); return e && e.length === 12 ? "0" + e : e; };
  const x = n(a), y = n(b);
  return x == null || y == null ? null : x === y;
}
