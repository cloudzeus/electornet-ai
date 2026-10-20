import { labelKey, normEan, type ForeignRow } from "@/lib/catalog/foreign-import/core";
import { parseMoney, priceFrom, type Rounding } from "@/lib/catalog/pricing/markup";

/**
 * Σχέδιο εισαγωγής από ξένο Excel — καθαρές αποφάσεις (χωρίς βάση): κατάσταση γραμμής, διπλά νέα είδη, χαρακτηριστικά με
 * τα ονόματα της ομάδας, τιμή από κανόνα markup. Ο server.ts τις τροφοδοτεί με δεδομένα και εκτελεί.
 */
export type RowStatus = "update" | "unchanged" | "new" | "waiting" | "problem";
export type ForeignPrice = { cost: number; price: number; rule: string; capped: boolean; margin: number };
export type ForeignPlanRow = {
  rowNo: number; title: string; status: RowStatus; mtrl?: number; code?: string;
  /** αλλαγές στο SoftOne («μόνο κενά») — στα νέα είδη τα πεδία που θα μπουν */
  changes: { label: string; from: string; to: string }[];
  /** νέα πολυμέσα (υπάρχοντα: όσα δεν έχει ήδη το προϊόν· νέα: όλες οι διευθύνσεις) */
  media: number;
  price?: ForeignPrice;
  problem?: string;
  warnings: string[];
};

/** Προτεραιότητα: πρόβλημα > νέο > αναμονή (SoftOne κλειστό και υπάρχουν στοιχεία ή τιμή) > ενημέρωση > καμία αλλαγή. Οι φωτογραφίες μόνες είναι «ενημέρωση» ακόμη και με κλειστό SoftOne. */
export function rowStatus(r: { problem: boolean; mtrl: number | null; changes: number; price: boolean; photos: number; writeOn: boolean }): RowStatus {
  if (r.problem) return "problem";
  if (r.mtrl == null) return "new";
  if (!r.writeOn && (r.changes > 0 || r.price)) return "waiting";
  return r.changes > 0 || r.price || r.photos > 0 ? "update" : "unchanged";
}

/** Νέα είδη (χωρίς MTRL) με ίδιο EAN ή ίδιο κωδικό / κωδικό κατασκευαστή σε 2+ γραμμές → μήνυμα προβλήματος για ΚΑΘΕ τέτοια γραμμή. */
export function newDuplicates(rows: ForeignRow[], mtrlOf: Map<number, number | null>): Map<number, string> {
  const groups = new Map<string, { label: string; rows: number[] }>();
  for (const r of rows) {
    if (mtrlOf.get(r.rowNo) != null) continue;
    const keys = new Map<string, string>();
    const e = r.fields.barcode ? normEan(r.fields.barcode) : null;
    if (e) keys.set(`e:${e}`, `Το EAN ${e}`);
    for (const c of [r.fields.code, r.fields.factoryCode]) { const k = (c ?? "").trim().toLowerCase(); if (k && !keys.has(`c:${k}`)) keys.set(`c:${k}`, `Ο κωδικός «${c!.trim()}»`); }
    for (const [k, label] of keys) { const g = groups.get(k) ?? { label, rows: [] }; g.rows.push(r.rowNo); groups.set(k, g); }
  }
  const out = new Map<number, string>();
  for (const g of groups.values()) {
    if (g.rows.length < 2) continue;
    for (const n of g.rows) out.set(n, `${out.has(n) ? `${out.get(n)} · ` : ""}${g.label} υπάρχει σε περισσότερες νέες γραμμές: ${g.rows.join(", ")}`);
  }
  return out;
}

/** Χαρακτηριστικά με τις ετικέτες του χρήστη → με τα ονόματα της ομάδας (ίδια κανονικοποίηση με το supplier-sheet). Χωρίς ομάδα: μένουν ως έχουν. */
export function rekeySpecs(specs: Record<string, string>, groupSpecNames: string[] | null): { specs: Record<string, string>; warnings: string[] } {
  const out: Record<string, string> = {}, warnings: string[] = [];
  const byKey = groupSpecNames ? new Map(groupSpecNames.map((n) => [labelKey(n), n])) : null;
  for (const [label, raw] of Object.entries(specs)) {
    const value = raw.trim();
    if (!value) continue;
    if (!byKey) { out[label] = value; continue; }
    const name = byKey.get(labelKey(label));
    if (name) out[name] = value; else warnings.push(`Το χαρακτηριστικό «${label.trim()}» δεν υπάρχει στην ομάδα — αγνοείται.`);
  }
  return { specs: out, warnings };
}

const pct = (n: number) => `${String(Math.round(n * 100) / 100).replace(".", ",")}%`;

/** Σύντομη περιγραφή κανόνα markup για την προεπισκόπηση: «Γενικός 30%», «Μάρκα LG 25%», «Κατηγορία Ψυγεία 25%», «LG · Ψυγεία 20%». */
export function ruleLabel(rule: { percent: number; brandId: string | null; categoryId: string | null }, names: { brand?: string; category?: string }): string {
  const b = names.brand ?? "—", c = names.category ?? "—";
  if (rule.brandId && rule.categoryId) return `${b} · ${c} ${pct(rule.percent)}`;
  if (rule.brandId) return `Μάρκα ${b} ${pct(rule.percent)}`;
  if (rule.categoryId) return `Κατηγορία ${c} ${pct(rule.percent)}`;
  return `Γενικός ${pct(rule.percent)}`;
}

/** Τιμή από κόστος + κανόνα (με ΦΠΑ, πλαφόν στην ΤΛΤ). Χωρίς κόστος → τίποτα· κόστος που δεν είναι ποσό ή κανένας κανόνας → προειδοποίηση. */
export function planPrice(i: { cost: string | null; rrp: string | null; rule: { percent: number; rounding: Rounding } | null; label: string; vat: number }): { price?: ForeignPrice; warning?: string } {
  if (!i.cost?.trim()) return {};
  const cost = parseMoney(i.cost);
  if (cost == null) return { warning: `Το κόστος «${i.cost.trim()}» δεν είναι ποσό.` };
  if (!i.rule) return { warning: "Δεν υπάρχει κανόνας τιμολόγησης." };
  const p = priceFrom({ cost, percent: i.rule.percent, vat: i.vat, rounding: i.rule.rounding, rrp: i.rrp ? parseMoney(i.rrp) : null });
  return { price: { cost, price: p.price, rule: i.label, capped: p.capped, margin: p.margin } };
}

/** Η συχνότερη τιμή (τα null αγνοούνται)· ισοπαλία → αυτή που εμφανίστηκε πρώτη. */
export function mostCommon<T>(values: (T | null | undefined)[]): T | null {
  const n = new Map<T, number>();
  for (const v of values) if (v != null) n.set(v, (n.get(v) ?? 0) + 1);
  let best: T | null = null, max = 0;
  for (const [v, c] of n) if (c > max) { best = v; max = c; }
  return best;
}
