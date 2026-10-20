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

/** Η πρώτη γραμμή με ≥ 2 μη κενά κελιά που ακολουθείται από γραμμή δεδομένων· αλλιώς 0. */
export function detectHeaderRow(matrix: string[][]): number {
  const count = (r: string[]) => r.filter((c) => txt(c)).length;
  for (let i = 0; i < matrix.length; i++) {
    if (count(matrix[i]) >= 2 && matrix.slice(i + 1).some((r) => count(r) > 0)) return i;
  }
  return 0;
}

/** Υπογραφή συνόλου επικεφαλίδων — ίδια για διαφορετική σειρά, πεζά/κεφαλαία, τόνους και κενά (για να θυμόμαστε αντιστοιχίσεις). */
export function headerSignature(headers: string[]): string {
  return headers.map((h) => norm(txt(h)).replace(/ /g, "")).filter(Boolean).sort().join("|");
}

/** Μοτίβα ανά στόχο, με σειρά: τα πιο ειδικά πρώτα. `w` = ολόκληρη λέξη (λατινικά/σύντομα), `s` = υπο-συμβολοσειρά. */
const RULES: { target: Target; w?: string[]; s?: string[] }[] = [
  { target: { kind: "media", type: "banner" }, w: ["banner"], s: ["μπανερ"] },
  { target: { kind: "media", type: "video" }, w: ["video"], s: ["βιντεο"] },
  { target: { kind: "media", type: "image" }, w: ["image", "img", "photo", "picture", "pic"], s: ["φωτογραφι", "εικονα", "εικονες", "εικονας"] },
  { target: { kind: "field", key: "factoryCode" }, w: ["mpn", "model", "part"], s: ["κωδικος κατασκευαστη", "κωδ κατασκευαστη", "manufacturer code", "manufacturer part", "mfr", "μοντελο"] },
  { target: { kind: "field", key: "barcode" }, w: ["ean", "barcode", "gtin", "upc"], s: ["μπαρκοντ"] },
  { target: { kind: "brand" }, w: ["brand", "manufacturer", "vendor"], s: ["μαρκα", "κατασκευαστη"] },
  { target: { kind: "category" }, w: ["category"], s: ["κατηγορια"] },
  { target: { kind: "cost" }, w: ["cost", "net"], s: ["κοστος", "τιμη αγορας", "τιμη κτησης", "τιμη χονδρικης"] },
  { target: { kind: "rrp" }, w: ["rrp", "msrp", "pvp"], s: ["λιανικη", "τιμη πωλησης"] },
  { target: { kind: "field", key: "shortDesc" }, s: ["συντομη περιγραφη", "short description"] },
  { target: { kind: "field", key: "name" }, w: ["name", "title"], s: ["περιγραφη ειδους", "ονομα", "τιτλος", "ονομασια", "product description"] },
  { target: { kind: "field", key: "descText" }, w: ["description"], s: ["περιγραφη"] },
  { target: { kind: "field", key: "code" }, w: ["sku", "code"], s: ["κωδικος", "κωδ"] },
];

/** Πρόταση στόχου για μια επικεφαλίδα (ο χρήστης μπορεί πάντα να την αλλάξει). Τελικοί αριθμοί π.χ. «Φωτογραφία 2» αγνοούνται. */
export function suggestTarget(header: string): Target {
  const h = norm(txt(header)).replace(/[\s_\-.]*\d+$/, "").replace(/(?<=[a-zα-ω])\d+(?=\W|$)/g, "");
  if (!h) return { kind: "ignore" };
  const words = h.split(/[^a-zα-ω0-9]+/).filter(Boolean);
  for (const r of RULES) {
    if (r.w?.some((w) => words.includes(w))) return r.target;
    if (r.s?.some((s) => h.includes(norm(s)))) return r.target;
  }
  return { kind: "ignore" };
}

// ---------- EAN ----------

const EAN_LEN = new Set([8, 12, 13, 14]);

/** Έγκυρο EAN/UPC/GTIN ως ψηφία ή null. Η επιστημονική μορφή (Excel) δεχόμαστε μόνο όταν δεν έχουν χαθεί ψηφία. */
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
  return d && EAN_LEN.has(d.length) ? d : null;
}

// ---------- Γραμμές ----------

const URL_SPLIT = /[\s,;|]+/;
const urls = (cell: string) => cell.split(URL_SPLIT).filter((u) => /^https?:\/\/\S+$/i.test(u));

/** Μετατρέπει τον πίνακα (μετά την επικεφαλίδα) σε γραμμές εισαγωγής. Κενές γραμμές (όλες οι αντιστοιχισμένες στήλες κενές) παραλείπονται. */
export function toRows(
  matrix: string[][],
  headerRow: number,
  config: { columns: Record<number, Target>; brandMap: Record<string, string | null>; categoryMap: Record<string, string | null> },
): ForeignRow[] {
  const cols = Object.entries(config.columns).map(([i, t]) => [Number(i), t] as const).filter(([, t]) => t.kind !== "ignore").sort((a, b) => a[0] - b[0]);
  const out: ForeignRow[] = [];
  for (let r = headerRow + 1; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    const cells = cols.map(([i, t]) => [t, txt(line[i])] as const);
    if (cells.every(([, c]) => !c)) continue;
    const row: ForeignRow = { rowNo: r + 1, fields: {}, specs: {}, media: { image: [], banner: [], video: [] }, brandId: null, categoryId: null, cost: null, rrp: null };
    for (const [t, c] of cells) {
      if (!c) continue;
      switch (t.kind) {
        case "field": if (!row.fields[t.key]) row.fields[t.key] = c; break;
        case "spec": row.specs[t.label] = c; break;
        case "media": row.media[t.type].push(...urls(c)); break;
        case "brand": row.brandId = config.brandMap[c] ?? null; break;
        case "category": row.categoryId = config.categoryMap[c] ?? null; break;
        case "cost": row.cost = c; break;
        case "rrp": row.rrp = c; break;
      }
    }
    out.push(row);
  }
  return out;
}

// ---------- Αντιστοίχιση με το SoftOne ----------

export type MatchIndex = { byMtrl: Map<number, number>; byCode: Map<string, number>; byEan: Map<string, number>; byFactory: Map<string, number> };

/**
 * Βρίσκει το είδος του SoftOne για κάθε γραμμή (MTRL → κωδικός → EAN → κωδικός κατασκευαστή + μάρκα). Αν τα κλειδιά
 * δείχνουν σε διαφορετικά είδη, ή το ίδιο είδος βγαίνει από 2+ γραμμές, επιστρέφεται πρόβλημα. Κανένα κλειδί = νέο είδος.
 * Τα κλειδιά των χαρτών είναι ήδη κανονικοποιημένα από τον καλούντα (κωδικός: πεζά/trim, EAN: ψηφία, factory: `brandId|κωδικός`).
 */
export function resolveMatches(rows: ForeignRow[], index: MatchIndex): { rowNo: number; mtrl: number | null; problem: string | null }[] {
  const res = rows.map((row) => {
    const hits: { key: string; mtrl: number }[] = [];
    let problem: string | null = null;
    const rawMtrl = row.fields.mtrl?.trim();
    if (rawMtrl) {
      const n = Number(rawMtrl);
      const m = Number.isInteger(n) ? index.byMtrl.get(n) : undefined;
      if (m == null) problem = `Το MTRL ${rawMtrl} δεν υπάρχει στο SoftOne`;
      else hits.push({ key: `MTRL ${rawMtrl}`, mtrl: m });
    }
    const code = row.fields.code?.trim();
    if (code) { const m = index.byCode.get(code.toLowerCase()); if (m != null) hits.push({ key: `κωδικός ${code}`, mtrl: m }); }
    const bc = row.fields.barcode?.trim();
    if (bc) {
      const e = normEan(bc);
      if (e == null) problem ??= "Μη έγκυρο EAN";
      else { const m = index.byEan.get(e); if (m != null) hits.push({ key: `EAN ${e}`, mtrl: m }); }
    }
    const fc = row.fields.factoryCode?.trim();
    if (fc && row.brandId) { const m = index.byFactory.get(`${row.brandId}|${fc.toLowerCase()}`); if (m != null) hits.push({ key: `κωδικός κατασκευαστή ${fc}`, mtrl: m }); }
    const distinct = new Set(hits.map((h) => h.mtrl));
    if (distinct.size > 1) {
      return { rowNo: row.rowNo, mtrl: null, problem: `Τα κλειδιά δείχνουν σε διαφορετικά είδη: ${hits.map((h) => `${h.key} → ${h.mtrl}`).join(", ")}` };
    }
    return { rowNo: row.rowNo, mtrl: hits[0]?.mtrl ?? null, problem };
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

// Ίδια γραμμή «Ετικέτα : τιμή» με το composeMemo του supplier-sheet (εκεί ζουν τα χαρακτηριστικά ενός είδους).
const SPEC_LINE = /^(?:[•\-–*·]\s*)?([^:\n]{2,60}?)\s*:\s*(\S.*)$/;

/** Χαρακτηριστικά που ΔΕΝ υπάρχουν ήδη στην αναλυτική περιγραφή (σύγκριση ετικέτας χωρίς πεζά/τόνους). */
export function newSpecs(currentMemo: string, incoming: Record<string, string>): Record<string, string> {
  const have = new Set<string>();
  for (const l of currentMemo.replace(/\r\n?/g, "\n").split("\n")) { const m = SPEC_LINE.exec(l.trim()); if (m) have.add(norm(m[1])); }
  const out: Record<string, string> = {};
  for (const [label, value] of Object.entries(incoming)) if (value.trim() && !have.has(norm(label))) out[label] = value;
  return out;
}
