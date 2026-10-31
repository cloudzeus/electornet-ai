/**
 * Διαθεσιμότητα που δείχνει η βιτρίνα — καθαρή συνάρτηση, χωρίς βάση. Σειρά απόφασης:
 * 1. **Φράση του είδους** (`CCCAVAIL` στο SoftOne, «Κείμενο διαθεσιμότητας» στην καρτέλα) — υπερισχύει πάντα.
 * 2. **Κανόνες** της διαχείρισης, με τη σειρά τους: ο πρώτος που ταιριάζει (όλες οι συνθήκες του) κερδίζει.
 * 3. **Προεπιλογή** όπως το ζωντανό site: απόθεμα στην κεντρική → «Άμεσα διαθέσιμο», αλλιώς «κατόπιν παραγγελίας».
 * Οι συνθήκες είναι δομημένες (όχι κώδικας που εκτελείται), ώστε να αποθηκεύονται και να ελέγχονται με ασφάλεια.
 */
export type AvailState = "in-stock" | "low" | "order" | "unavailable";
export const AVAIL_STATES: { key: AvailState; label: string }[] = [
  { key: "in-stock", label: "Άμεσα διαθέσιμο" },
  { key: "low", label: "Μικρό απόθεμα" },
  { key: "order", label: "Κατόπιν παραγγελίας" },
  { key: "unavailable", label: "Μη διαθέσιμο" },
];
export const isAvailState = (s: unknown): s is AvailState => AVAIL_STATES.some((x) => x.key === s);

const IN_STOCK = "Άμεσα διαθέσιμο";
export type StockOp = ">" | ">=" | "<" | "<=" | "=";
export type AvailCond =
  | { k: "stock"; op: StockOp; n: number }
  /** κατάσταση από το XML του προμηθευτή (μετά την αντιστοίχιση τιμών του feed) */
  | { k: "supplier"; in: AvailState[] }
  | { k: "brand"; in: string[] }
  /** η κατηγορία του προϊόντος ή οποιαδήποτε πάνω από αυτήν */
  | { k: "category"; in: string[] }
  | { k: "price"; has: boolean };

export interface AvailRule { id: string; active: boolean; conditions: AvailCond[]; label: string; state: AvailState; publish: boolean }
export interface AvailInput { stock: number; override?: string | null; supplier?: string | null; brandId: string; categoryIds: string[]; hasPrice: boolean }
export interface AvailResult { label: string; state: AvailState; publish: boolean; source: "override" | "rule" | "default"; ruleId?: string }

const cmp = (a: number, op: StockOp, b: number) => (op === ">" ? a > b : op === ">=" ? a >= b : op === "<" ? a < b : op === "<=" ? a <= b : a === b);

export function condMatches(c: AvailCond, x: AvailInput): boolean {
  switch (c.k) {
    case "stock": return cmp(x.stock, c.op, c.n);
    case "supplier": return !!x.supplier && c.in.includes(x.supplier as AvailState);
    case "brand": return c.in.includes(x.brandId);
    case "category": return x.categoryIds.some((id) => c.in.includes(id));
    case "price": return x.hasPrice === c.has;
  }
}

/** Κανόνας χωρίς συνθήκες ταιριάζει σε όλα (χρήσιμο ως τελευταίος, «για όλα τα υπόλοιπα»). */
export const ruleMatches = (r: AvailRule, x: AvailInput) => r.active && r.conditions.every((c) => condMatches(c, x));

export function defaultAvailability(x: Pick<AvailInput, "stock" | "hasPrice">): Omit<AvailResult, "source"> {
  if (x.stock > 0) return { label: IN_STOCK, state: "in-stock", publish: true };
  return { label: x.hasPrice ? "Διαθέσιμο κατόπιν παραγγελίας" : "Διαθεσιμότητα στο κατάστημα", state: "order", publish: true };
}

export function resolveAvailability(x: AvailInput, rules: AvailRule[]): AvailResult {
  const own = (x.override ?? "").replace(/\s+/g, " ").trim();
  // η φράση του είδους αλλάζει μόνο το κείμενο· η κατάσταση (χρώμα, «άμεσα») ακολουθεί το απόθεμα
  if (own) return { label: own, state: x.stock > 0 ? "in-stock" : "order", publish: true, source: "override" };
  const r = rules.find((y) => ruleMatches(y, x));
  if (r) return { label: r.label.trim() || defaultAvailability(x).label, state: r.state, publish: r.publish, source: "rule", ruleId: r.id };
  return { ...defaultAvailability(x), source: "default" };
}

/** Συνθήκες από JSON της βάσης / της φόρμας — ό,τι δεν αναγνωρίζεται πετιέται (όχι σφάλμα). */
export function parseConds(raw: unknown): AvailCond[] {
  if (!Array.isArray(raw)) return [];
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && !!s) : []);
  const out: AvailCond[] = [];
  for (const c of raw as Record<string, unknown>[]) {
    if (!c || typeof c !== "object") continue;
    if (c.k === "stock" && [">", ">=", "<", "<=", "="].includes(String(c.op)) && Number.isFinite(Number(c.n))) out.push({ k: "stock", op: c.op as StockOp, n: Number(c.n) });
    else if (c.k === "supplier") { const v = strs(c.in).filter(isAvailState); if (v.length) out.push({ k: "supplier", in: v }); }
    else if (c.k === "brand" || c.k === "category") { const v = strs(c.in); if (v.length) out.push({ k: c.k, in: v }); }
    else if (c.k === "price" && typeof c.has === "boolean") out.push({ k: "price", has: c.has });
  }
  return out;
}

/** Η μορφή της βιτρίνας (lib/data/types Availability) από την επιλυμένη κατάσταση. */
export function toShopAvailability(a: { label: string; state: string }, deliveryDate: string):
  | { kind: "in-stock"; deliveryDate: string; label?: string }
  | { kind: "order"; label?: string } {
  // η προεπιλεγμένη φράση δεν περνά: η κάρτα δείχνει τότε «Άμεσα · παράδοση <ημέρα>»
  if (a.state === "in-stock" || a.state === "low") return a.label === IN_STOCK ? { kind: "in-stock", deliveryDate } : { kind: "in-stock", deliveryDate, label: a.label };
  return { kind: "order", label: a.label };
}
