import type { FieldKey } from "@/lib/catalog/supplier-sheet";

/**
 * Εισαγωγή προϊόντων από ξένο Excel — καθαρή λογική (χωρίς βάση, δίκτυο ή server-only): από έναν τυχαίο πίνακα κελιών
 * βγάζει γραμμές εισαγωγής και τις αντιστοιχίζει σε είδη του SoftOne. Τον διακομιστή (σχέδιο/εκτέλεση) και το UI τα
 * χτίζουν πάνω σε αυτές ακριβώς τις υπογραφές.
 */
export type Target =
  | { kind: "field"; key: FieldKey }
  | { kind: "spec"; label: string }
  | { kind: "media"; type: "image" | "banner" | "video" }
  | { kind: "brand" }
  | { kind: "category" }
  | { kind: "cost" }
  | { kind: "rrp" }
  | { kind: "ignore" };

/** Σφάλμα με μήνυμα για τον χρήστη (ελληνικά, ασφαλές να φανεί)· κάθε άλλο σφάλμα δείχνεται ως γενικό μήνυμα. */
export class UserError extends Error {
  constructor(message: string) { super(message); this.name = "UserError"; }
}

export type ForeignRow = {
  rowNo: number; // αριθμός γραμμής στο Excel (1-based)
  fields: Partial<Record<FieldKey, string>>;
  specs: Record<string, string>;
  media: { image: string[]; banner: string[]; video: string[] };
  brandId: string | null;
  categoryId: string | null;
  cost: string | null; // ακατέργαστο κείμενο — η μετατροπή σε αριθμό γίνεται στο επόμενο στάδιο
  rrp: string | null;
};

/** Κανονικοποίηση για σύγκριση κειμένου: κενά στις άκρες, πεζά, χωρίς τόνους, ένα κενό ανάμεσα. */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const txt = (v: unknown) => (v == null ? "" : String(v)).trim();

// ---------- Επικεφαλίδες ----------

/** «Ετικέτα» = κείμενο επικεφαλίδας: ≥ 2 γράμματα, γράμματα ≥ 50% των μη κενών χαρακτήρων, όχι URL (οι αριθμοί, EAN, τιμές και σύνδεσμοι είναι δεδομένα). */
const isLabel = (c: string) => {
  const t = txt(c).replace(/\s+/g, "");
  if (!t || /^(https?:\/\/|www\.)/i.test(t)) return false;
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  return letters >= 2 && letters * 2 >= t.length;
};

/** Επικεφαλίδα: στις πρώτες 30 γραμμές που έχουν μη κενή γραμμή από κάτω, score = πλήθος κελιών-ετικετών (συγχωνευμένος τίτλος με ίδιο κείμενο παντού → 1).
 * Επιλέγεται η ΠΡΩΤΗ γραμμή με score ≥ 0,8 × το καλύτερο· αν κανένα κελί δεν μοιάζει με ετικέτα → 0. */
export function detectHeaderRow(matrix: string[][]): number {
  const filled = (r: string[]) => r.some((c) => txt(c));
  const scores: number[] = [];
  for (let i = 0; i < Math.min(matrix.length, 30); i++) {
    const cells = matrix[i].map(txt).filter(Boolean);
    scores.push(cells.length && matrix.slice(i + 1).some(filled) ? (new Set(cells).size === 1 ? Number(isLabel(cells[0])) : cells.filter(isLabel).length) : 0);
  }
  const best = Math.max(0, ...scores);
  return best > 0 ? scores.findIndex((n) => n >= 0.8 * best) : 0;
}

/** Η προεπισκόπηση στέλνει στον browser κελιά έως τόσους χαρακτήρες (τα μεγαλύτερα κόβονται με «…»). */
export const PREVIEW_CELL = 160;
/**
 * Κλειδί επικεφαλίδας: κανονικοποιημένο και ΜΟΝΟ από τους πρώτους PREVIEW_CELL−1 χαρακτήρες (χωρίς τελικό «…»), ώστε η
 * κομμένη επικεφαλίδα της προεπισκόπησης και η πλήρης του αρχείου να δίνουν το ίδιο κλειδί/υπογραφή.
 */
const headKey = (h: string) => norm(txt(h).replace(/…$/, "").slice(0, PREVIEW_CELL - 1)).replace(/ /g, "");

/** Υπογραφή συνόλου επικεφαλίδων — ίδια για διαφορετική σειρά, πεζά/κεφαλαία, τόνους και κενά (για να θυμόμαστε αντιστοιχίσεις). */
export function headerSignature(headers: string[]): string {
  return headers.map(headKey).filter(Boolean).sort().join("|");
}

// ---------- Αποθηκευμένες αντιστοιχίσεις ----------

/** sheetBrandId / sheetCategoryId: μάρκα / κατηγορία όλου του φύλλου, όταν η γραμμή δεν έχει τιμή στη στήλη (ή δεν υπάρχει στήλη — π.χ. τιμοκατάλογος μίας μάρκας). */
type SheetDefaults = { sheetBrandId?: string | null; sheetCategoryId?: string | null };
export type MappingConfig = { columns: Record<number, Target>; brandMap: Record<string, string | null>; categoryMap: Record<string, string | null> } & SheetDefaults;
/** Ό,τι αποθηκεύεται: οι στήλες με κλειδί την κανονικοποιημένη επικεφαλίδα (όχι θέση), ώστε να ισχύουν και όταν αλλάζει η σειρά. */
export type SavedConfig = { columns: Record<string, Target>; brandMap: Record<string, string | null>; categoryMap: Record<string, string | null> } & SheetDefaults;
const sheetDefaults = (c: SheetDefaults): SheetDefaults => ({ ...(c.sheetBrandId ? { sheetBrandId: c.sheetBrandId } : {}), ...(c.sheetCategoryId ? { sheetCategoryId: c.sheetCategoryId } : {}) });

/** Κλειδί ανά στήλη: κανονικοποιημένη επικεφαλίδα (όπως στο headerSignature)· η 2η, 3η… ίδια επικεφαλίδα παίρνει «#2», «#3»· κενή → null. */
function headerKeys(headers: string[]): (string | null)[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    const k = headKey(h);
    if (!k) return null;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n === 1 ? k : `${k}#${n}`;
  });
}

/** Στήλες με δείκτη → στήλες με κλειδί επικεφαλίδας (για αποθήκευση). */
export function configToSaved(config: MappingConfig, headers: string[]): SavedConfig {
  const keys = headerKeys(headers);
  const columns: Record<string, Target> = {};
  for (const [i, t] of Object.entries(config.columns)) { const k = keys[Number(i)]; if (k) columns[k] = t; }
  return { columns, brandMap: config.brandMap, categoryMap: config.categoryMap, ...sheetDefaults(config) };
}

/** Αποθηκευμένη αντιστοίχιση → δείκτες στηλών για τις επικεφαλίδες ΑΥΤΟΥ του αρχείου· άγνωστες επικεφαλίδες μένουν χωρίς στόχο. */
export function configForHeaders(saved: SavedConfig, headers: string[]): MappingConfig {
  const columns: Record<number, Target> = {};
  headerKeys(headers).forEach((k, i) => { const t = k ? saved.columns[k] : undefined; if (t) columns[i] = t; });
  return { columns, brandMap: saved.brandMap ?? {}, categoryMap: saved.categoryMap ?? {}, ...sheetDefaults(saved) };
}

// ---------- CSV ----------

/** Διαχωριστής CSV: το συχνότερο από ; , tab στις πρώτες 10 μη κενές γραμμές (εκτός εισαγωγικών — ένας τίτλος με κόμμα στην αρχή δεν μετρά)· ισοπαλία/τίποτα → κόμμα. */
export function detectDelimiter(text: string): string {
  const t = text.replace(/^\uFEFF/, "");
  const n: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let q = false, lines = 0, filled = false;
  for (const ch of t) {
    if (ch === '"') { q = !q; filled = true; }
    else if (!q && (ch === "\n" || ch === "\r")) { if (filled && ++lines >= 10) break; filled = false; }
    else { if (!q && ch in n) n[ch]++; if (ch.trim()) filled = true; }
  }
  return n[";"] > n[","] && n[";"] >= n["\t"] ? ";" : n["\t"] > n[","] ? "\t" : ",";
}

/** Μικρός parser RFC-4180: εισαγωγικά, "" ως ", αλλαγή γραμμής μέσα σε εισαγωγικά, BOM, CRLF. Κελιά trimmed, ουρά κενών κομμένη, κενή γραμμή → [] (ώστε index = γραμμή Excel − 1). */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const d = delimiter ?? detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false, any = false;
  const endCell = () => { row.push(cell.trim()); cell = ""; };
  const endRow = () => { endCell(); while (row.length && !row[row.length - 1]) row.pop(); rows.push(row); row = []; any = false; };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"' && !cell.trim()) { q = true; cell = ""; any = true; }
    else if (ch === d) { endCell(); any = true; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && src[i + 1] === "\n") i++; endRow(); }
    else { cell += ch; any = true; }
  }
  if (any || cell || row.length) endRow(); // τελευταία γραμμή χωρίς newline
  return rows;
}

/** Μοτίβα ανά στόχο, με σειρά: τα πιο ειδικά πρώτα. `w` = ολόκληρη λέξη (λατινικά/σύντομα), `s` = υπο-συμβολοσειρά. */
const RULES: { target: Target; w?: string[]; s?: string[] }[] = [
  { target: { kind: "field", key: "weightKg" }, w: ["weight"], s: ["βαρος"] }, // πριν το «net» (Net weight ≠ κόστος)
  { target: { kind: "media", type: "banner" }, w: ["banner"], s: ["μπανερ"] },
  { target: { kind: "media", type: "video" }, w: ["video"], s: ["βιντεο"] },
  { target: { kind: "media", type: "image" }, w: ["image", "img", "photo", "picture", "pic"], s: ["φωτογραφι", "εικονα", "εικονες", "εικονας"] },
  { target: { kind: "field", key: "factoryCode" }, w: ["mpn", "model", "part"], s: ["κωδικος κατασκευαστη", "κωδ κατασκευαστη", "manufacturer code", "manufacturer part", "mfr", "μοντελο"] },
  { target: { kind: "field", key: "barcode" }, w: ["ean", "barcode", "gtin", "upc"], s: ["μπαρκοντ"] },
  { target: { kind: "brand" }, w: ["brand", "manufacturer"], s: ["μαρκα", "κατασκευαστη"] },
  { target: { kind: "category" }, w: ["category"], s: ["κατηγορια"] },
  { target: { kind: "cost" }, w: ["cost", "net", "dealer", "χονδρικη"], s: ["κοστος", "τιμη αγορας", "τιμη κτησης", "τιμη χονδρικης", "τιμη μοναδος", "unit price"] },
  { target: { kind: "rrp" }, w: ["rrp", "msrp", "pvp"], s: ["λιανικη", "τιμη πωλησης"] },
  { target: { kind: "field", key: "shortDesc" }, s: ["συντομη περιγραφη", "short description"] },
  { target: { kind: "field", key: "name" }, w: ["name", "title"], s: ["περιγραφη ειδους", "ονομα", "τιτλος", "ονομασια", "product description"] },
  { target: { kind: "field", key: "descText" }, w: ["description"], s: ["περιγραφη"] },
];
// Ο «κωδικός» είναι κλειδί αντιστοίχισης: μόνο ακριβώς αυτές οι επικεφαλίδες τον δίνουν — «Κωδικός χρώματος» ή του προμηθευτή ΟΧΙ.
const CODE_HEADERS = new Set(["κωδικος", "κωδ", "code", "sku", "κωδικος ειδους", "κωδ ειδους", "item code", "product code", "κωδικος προιοντος"]);

/** Πρόταση στόχου για μια επικεφαλίδα (ο χρήστης μπορεί πάντα να την αλλάξει). Τελικοί αριθμοί π.χ. «Φωτογραφία 2» αγνοούνται. */
export function suggestTarget(header: string): Target {
  const h = norm(txt(header).replace(/[.,/\\\-_()]+/g, " ")).replace(/ ?\d+$/, "").replace(/(?<=[a-zα-ω])\d+(?=\W|$)/g, "");
  if (!h) return { kind: "ignore" };
  const words = h.split(/[^a-zα-ω0-9]+/).filter(Boolean);
  const has = (...ws: string[]) => ws.some((w) => words.includes(w));
  // Προτεινόμενη λιανική ΠΡΙΝ από τον κανόνα του ΦΠΑ: «Λιανική με ΦΠΑ», «ΤΛΤ», «Retail price» είναι ΤΛΤ, όχι στήλη για αγνόηση
  if (has("rrp", "msrp", "pvp", "retail", "τλτ") || h.includes("λιανικ")) return { kind: "rrp" };
  if (has("vat", "φπα")) return { kind: "ignore" }; // «Κατηγορία ΦΠΑ» δεν είναι κατηγορία προϊόντος
  if ((has("supplier", "vendor") || h.includes("προμηθευτ")) && (has("code", "sku", "κωδ", "κωδικος") || h.includes("κωδικ"))) return { kind: "ignore" }; // ο κωδικός του προμηθευτή δεν είναι δικός μας
  if (has("model") && has("name", "title")) return { kind: "field", key: "name" };
  for (const r of RULES) {
    if (r.w?.some((w) => words.includes(w))) return r.target;
    if (r.s?.some((s) => h.includes(norm(s)))) return r.target;
  }
  return CODE_HEADERS.has(h) ? { kind: "field", key: "code" } : { kind: "ignore" };
}

// ---------- EAN ----------

/** Ψηφίο ελέγχου GS1 (EAN-8/UPC-A/EAN-13/GTIN-14): ίδιος υπολογισμός για κάθε μήκος — τα αριστερά μηδενικά δεν τον αλλάζουν. */
export function gs1Valid(d: string): boolean {
  if (!/^\d{2,}$/.test(d)) return false;
  let sum = 0;
  for (let i = d.length - 2, w = 3; i >= 0; i--, w = 4 - w) sum += Number(d[i]) * w;
  return (10 - (sum % 10)) % 10 === Number(d[d.length - 1]);
}

/**
 * Έγκυρο EAN/UPC/GTIN ως ψηφία ή null (λάθος ψηφίο ελέγχου = άκυρο). Η επιστημονική μορφή (Excel) δεχόμαστε μόνο όταν δεν
 * έχουν χαθεί ψηφία. 9–11 ψηφία = EAN-13/UPC-A που το Excel έχασε τα αριστερά μηδενικά → συμπληρώνεται σε 13.
 * Η μορφή που επιστρέφεται είναι αυτή που γράφεται· για σύγκριση/αναζήτηση χρησιμοποίησε το `gtin14`.
 */
export function normEan(v: string): string | null {
  const s = txt(v).replace(/\s+/g, "");
  let d: string | null = null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d+)(?:\.0*)?$/.exec(s))) d = m[1];
  else if ((m = /^(\d+)(?:\.(\d+))?[eE]\+?(\d+)$/.exec(s))) {
    const frac = m[2] ?? "";
    if (frac.length !== Number(m[3])) return null; // θα χρειαζόταν συμπλήρωση με μηδενικά = χαμένα ψηφία
    d = m[1] + frac;
  }
  if (!d || d.length < 8 || d.length > 14 || /^0+$/.test(d) || !gs1Valid(d)) return null;
  return d.length >= 9 && d.length <= 11 ? d.padStart(13, "0") : d;
}

/** Κλειδί σύγκρισης EAN: GTIN-14 (αριστερά μηδενικά ως τα 14) — «012345678905», «0012345678905» και «12345678905» είναι το ίδιο. */
export const gtin14 = (v: string | null | undefined): string | null => (v ? normEan(v)?.padStart(14, "0") ?? null : null);

/** Οι μορφές με τις οποίες μπορεί να είναι γραμμένο το ίδιο EAN στο SoftOne (8/12/13/14 ψηφία) — για αναζήτηση με `in`. */
export function eanVariants(v: string | null | undefined): string[] {
  const g = gtin14(v);
  if (!g) return [];
  const s = g.replace(/^0+/, "");
  return [8, 12, 13, 14].filter((n) => n >= s.length).map((n) => s.padStart(n, "0"));
}

/** Ίδιο barcode: ίδιο GTIN-14 όταν και τα δύο είναι έγκυρα EAN, αλλιώς ίδιο κείμενο (trim). */
export const sameEan = (a: string | null | undefined, b: string | null | undefined) => {
  const ga = gtin14(a), gb = gtin14(b);
  return ga && gb ? ga === gb : !!a && (a ?? "").trim() === (b ?? "").trim();
};

/**
 * Κελί xlsx που είναι αριθμός (ή τύπος με αριθμητικό αποτέλεσμα) → κείμενο που δεν διαβάζεται λάθος από το parseMoney:
 * ο αριθμός 1.234 (ένα κόμμα διακόσια…) θα έβγαινε «1.234» = χίλια διακόσια τριάντα τέσσερα στον κανόνα χιλιάδων. Γι' αυτό
 * μόνο όταν το String() μοιάζει με «χιλιάδες» (1–3 ψηφία, τελεία, ακριβώς 3 ψηφία) προστίθεται ένα «0» — ίδια αριθμητική τιμή.
 * Ακέραιοι (π.χ. EAN) μένουν ως έχουν. Κείμενο → null (το χειρίζεται το cellText).
 */
export function numCell(v: unknown): string | null {
  const n = typeof v === "number" ? v : v && typeof v === "object" && "result" in v && typeof (v as { result: unknown }).result === "number" ? (v as { result: number }).result : null;
  if (n == null || !Number.isFinite(n)) return null;
  const s = String(n);
  return /^-?\d{1,3}\.\d{3}$/.test(s) ? `${s}0` : s;
}

// ---------- Γραμμές ----------

const URL_SPLIT = /[\s,;|]+/;
const urls = (cell: string) => cell.split(URL_SPLIT).filter((u) => /^https?:\/\/\S+$/i.test(u));

/**
 * Μετατρέπει τον πίνακα (μετά την επικεφαλίδα) σε γραμμές εισαγωγής. Κενές γραμμές (όλες οι αντιστοιχισμένες στήλες κενές) παραλείπονται.
 * Κενό κελί μάρκας/κατηγορίας (ή καμία τέτοια στήλη) → μάρκα/κατηγορία του φύλλου· τιμή που ο χρήστης άφησε χωρίς αντιστοίχιση μένει null.
 */
export function toRows(matrix: string[][], headerRow: number, config: MappingConfig): ForeignRow[] {
  const cols = Object.entries(config.columns).map(([i, t]) => [Number(i), t] as const).filter(([, t]) => t.kind !== "ignore").sort((a, b) => a[0] - b[0]);
  const out: ForeignRow[] = [];
  for (let r = headerRow + 1; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    const cells = cols.map(([i, t]) => [t, txt(line[i])] as const);
    if (cells.every(([, c]) => !c)) continue;
    const row: ForeignRow = { rowNo: r + 1, fields: {}, specs: {}, media: { image: [], banner: [], video: [] }, brandId: config.sheetBrandId ?? null, categoryId: config.sheetCategoryId ?? null, cost: null, rrp: null };
    for (const [t, c] of cells) {
      if (!c) continue;
      switch (t.kind) {
        case "field": if (!row.fields[t.key]) row.fields[t.key] = c; break;
        case "spec": row.specs[t.label] = c; break;
        case "media": row.media[t.type].push(...urls(c)); break;
        // Object.hasOwn: τιμή «constructor» / «toString» δεν είναι ιδιότητα του prototype
        case "brand": row.brandId = Object.hasOwn(config.brandMap, c) ? config.brandMap[c] ?? null : null; break;
        case "category": row.categoryId = Object.hasOwn(config.categoryMap, c) ? config.categoryMap[c] ?? null : null; break;
        case "cost": row.cost = c; break;
        case "rrp": row.rrp = c; break;
      }
    }
    out.push(row);
  }
  return out;
}

// ---------- Αντιστοίχιση με το SoftOne ----------

export type MatchIndex = {
  byMtrl: Map<number, number>; byCode: Map<string, number>; byEan: Map<string, number>; byFactory: Map<string, number>;
  /** κλειδιά που ανήκουν σε 2+ είδη (με τα MTRL τους) — δεν υπάρχουν στους παραπάνω χάρτες· όποια γραμμή τα χτυπήσει έχει πρόβλημα */
  ambiguous?: { byCode: Map<string, number[]>; byEan: Map<string, number[]>; byFactory: Map<string, number[]> };
};

/** Ευρετήριο για το resolveMatches από είδη του SoftOne (brandId = η μάρκα του site του κατασκευαστή). EAN με κλειδί GTIN-14. Κλειδί σε 2+ είδη → μόνο στο `ambiguous`. */
export function buildMatchIndex(items: { mtrl: number; code: string; barcode: string | null; factoryCode: string | null; brandId: string | null }[]): MatchIndex {
  const all = { byCode: new Map<string, number[]>(), byEan: new Map<string, number[]>(), byFactory: new Map<string, number[]>() };
  const add = (m: Map<string, number[]>, k: string, mtrl: number) => { const l = m.get(k) ?? []; if (!l.includes(mtrl)) l.push(mtrl); m.set(k, l); };
  const byMtrl = new Map<number, number>();
  for (const it of items) {
    byMtrl.set(it.mtrl, it.mtrl);
    const code = txt(it.code).toLowerCase(); if (code) add(all.byCode, code, it.mtrl);
    const e = gtin14(it.barcode); if (e) add(all.byEan, e, it.mtrl);
    const fc = txt(it.factoryCode).toLowerCase(); if (fc && it.brandId) add(all.byFactory, `${it.brandId}|${fc}`, it.mtrl);
  }
  const split = (m: Map<string, number[]>) => {
    const one = new Map<string, number>(), many = new Map<string, number[]>();
    for (const [k, l] of m) if (l.length === 1) one.set(k, l[0]); else many.set(k, [...l].sort((a, b) => a - b));
    return [one, many] as const;
  };
  const [byCode, aCode] = split(all.byCode), [byEan, aEan] = split(all.byEan), [byFactory, aFactory] = split(all.byFactory);
  return { byMtrl, byCode, byEan, byFactory, ambiguous: { byCode: aCode, byEan: aEan, byFactory: aFactory } };
}

/**
 * Βρίσκει το είδος του SoftOne για κάθε γραμμή (MTRL → κωδικός → EAN → κωδικός κατασκευαστή + μάρκα). Αν τα κλειδιά
 * δείχνουν σε διαφορετικά είδη, ή το ίδιο είδος βγαίνει από 2+ γραμμές, επιστρέφεται πρόβλημα. Κανένα κλειδί = νέο είδος.
 * Τα κλειδιά των χαρτών είναι ήδη κανονικοποιημένα από τον καλούντα (κωδικός: πεζά/trim, EAN: GTIN-14, factory: `brandId|κωδικός`).
 * `matchedBy`: με ποιο κλειδί βρέθηκε το είδος (μόνο όταν βρέθηκε) — για να φαίνεται στην προεπισκόπηση.
 */
export type MatchKind = "mtrl" | "code" | "ean" | "factory";
export type Match = { rowNo: number; mtrl: number | null; problem: string | null; matchedBy?: MatchKind };
export function resolveMatches(rows: ForeignRow[], index: MatchIndex): Match[] {
  const res = rows.map((row): Match => {
    const hits: { key: string; mtrl: number; kind: MatchKind }[] = [];
    let problem: string | null = null;
    const rawMtrl = row.fields.mtrl?.trim();
    if (rawMtrl) {
      const n = Number(rawMtrl);
      const m = Number.isInteger(n) ? index.byMtrl.get(n) : undefined;
      if (m == null) problem = `Το MTRL ${rawMtrl} δεν υπάρχει στο SoftOne`;
      else hits.push({ key: `MTRL ${rawMtrl}`, mtrl: m, kind: "mtrl" });
    }
    const amb = (m: Map<string, number[]> | undefined, k: string, label: string) => {
      const l = m?.get(k); if (l) problem ??= `${label} ανήκει σε περισσότερα από ένα είδη (MTRL ${l.join(", ")})`;
      return !!l;
    };
    const code = row.fields.code?.trim();
    if (code && !amb(index.ambiguous?.byCode, code.toLowerCase(), `Ο κωδικός ${code}`)) { const m = index.byCode.get(code.toLowerCase()); if (m != null) hits.push({ key: `κωδικός ${code}`, mtrl: m, kind: "code" }); }
    const bc = row.fields.barcode?.trim();
    if (bc) {
      const e = normEan(bc);
      if (e == null) problem ??= "Μη έγκυρο EAN";
      else { const g = e.padStart(14, "0"); if (!amb(index.ambiguous?.byEan, g, `Το EAN ${e}`)) { const m = index.byEan.get(g); if (m != null) hits.push({ key: `EAN ${e}`, mtrl: m, kind: "ean" }); } }
    }
    const fc = row.fields.factoryCode?.trim();
    if (fc && row.brandId && !amb(index.ambiguous?.byFactory, `${row.brandId}|${fc.toLowerCase()}`, `Ο κωδικός κατασκευαστή ${fc}`)) { const m = index.byFactory.get(`${row.brandId}|${fc.toLowerCase()}`); if (m != null) hits.push({ key: `κωδικός κατασκευαστή ${fc}`, mtrl: m, kind: "factory" }); }
    const distinct = new Set(hits.map((h) => h.mtrl));
    if (distinct.size > 1) {
      return { rowNo: row.rowNo, mtrl: null, problem: `Τα κλειδιά δείχνουν σε διαφορετικά είδη: ${hits.map((h) => `${h.key} → ${h.mtrl}`).join(", ")}` };
    }
    return hits.length ? { rowNo: row.rowNo, mtrl: hits[0].mtrl, problem, matchedBy: hits[0].kind } : { rowNo: row.rowNo, mtrl: null, problem };
  });
  const perMtrl = new Map<number, number[]>();
  for (const r of res) if (r.mtrl != null) perMtrl.set(r.mtrl, [...(perMtrl.get(r.mtrl) ?? []), r.rowNo]);
  for (const r of res) {
    const rowsOf = r.mtrl != null ? perMtrl.get(r.mtrl)! : [];
    if (rowsOf.length > 1) r.problem ??= `Το ίδιο είδος (MTRL ${r.mtrl}) βρέθηκε σε περισσότερες γραμμές: ${rowsOf.join(", ")}`;
  }
  return res;
}

// ---------- «Μόνο κενά» ----------

/** Από τα εισερχόμενα πεδία κρατά μόνο όσα έχουν τιμή και είναι ΚΕΝΑ στο τρέχον είδος (δεν αλλάζει ό,τι υπάρχει ήδη). */
export function blankOnly(current: Partial<Record<FieldKey, string | null>>, incoming: Partial<Record<FieldKey, string>>): Partial<Record<FieldKey, string>> {
  const out: Partial<Record<FieldKey, string>> = {};
  for (const k of Object.keys(incoming) as FieldKey[]) {
    const inc = incoming[k];
    if (inc != null && inc.trim() && !(current[k] ?? "").trim()) out[k] = inc;
  }
  return out;
}

/** ΠΡΕΠΕΙ να μένει ίδια με το `plain` του supplier-sheet.ts (εκεί είναι server-only): ς→σ, χωρίς τελικό «*», ένα κενό. Αλλιώς το newSpecs θα θεωρεί «νέα» μια ετικέτα που το composeMemo θα αντικαταστήσει. */
export const labelKey = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ς/g, "σ").replace(/\s*\*\s*$/, "").replace(/\s+/g, " ").trim();

// Ίδια γραμμή «Ετικέτα : τιμή» με το composeMemo του supplier-sheet (εκεί ζουν τα χαρακτηριστικά ενός είδους).
const SPEC_LINE = /^(?:[•\-–*·]\s*)?([^:\n]{2,60}?)\s*:\s*(\S.*)$/;

/** Χαρακτηριστικά που ΔΕΝ υπάρχουν ήδη στην αναλυτική περιγραφή (σύγκριση ετικέτας χωρίς πεζά/τόνους). */
export function newSpecs(currentMemo: string, incoming: Record<string, string>): Record<string, string> {
  const have = new Set<string>();
  for (const l of currentMemo.replace(/\r\n?/g, "\n").split("\n")) { const m = SPEC_LINE.exec(l.trim()); if (m) have.add(labelKey(m[1])); }
  const out: Record<string, string> = {};
  for (const [label, value] of Object.entries(incoming)) if (value.trim() && !have.has(labelKey(label))) out[label] = value;
  return out;
}

/**
 * Αναλυτική περιγραφή για «μόνο κενά»: ο τρέχων memo μένει ΑΥΤΟΥΣΙΟΣ (καμία γραμμή δεν αλλάζει, φεύγουν μόνο κενές
 * γραμμές στην αρχή/στο τέλος)· τα χαρακτηριστικά που λείπουν μπαίνουν στο τέλος ως «Ετικέτα : τιμή» και η περιγραφή μπαίνει
 * από πάνω μόνο αν ο memo δεν έχει ήδη ελεύθερο κείμενο. Όχι composeMemo: εκείνο με νέο κείμενο ξαναγράφει όλα τα χαρακτηριστικά.
 */
export function fillBlankMemo(current: string, specs: { label: string; value: string }[], newText?: string): string {
  const lines = current.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const missing = newSpecs(current, Object.fromEntries(specs.map((s) => [s.label, s.value])));
  const seen = new Set<string>(), add: string[] = [];
  for (const s of specs) {
    const k = labelKey(s.label), v = s.value.trim();
    if (!v || seen.has(k) || !Object.hasOwn(missing, s.label)) continue;
    seen.add(k); add.push(`${s.label.trim()} : ${v}`);
  }
  const hasText = lines.some((l) => l.trim() && !SPEC_LINE.exec(l.trim()));
  const text = hasText ? "" : (newText ?? "").replace(/\r\n?/g, "\n").trim();
  const body = [...lines, ...add];
  return (text && body.length ? [text, "", ...body] : text ? [text] : body).join("\n");
}
