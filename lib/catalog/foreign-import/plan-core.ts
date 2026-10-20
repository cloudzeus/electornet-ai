import { labelKey, normEan, gtin14, type ForeignRow, type MatchKind } from "@/lib/catalog/foreign-import/core";
import { parseMoney, priceFrom, type Rounding } from "@/lib/catalog/pricing/markup";

/**
 * Σχέδιο εισαγωγής από ξένο Excel — καθαρές αποφάσεις (χωρίς βάση): κατάσταση γραμμής, διπλά νέα είδη, χαρακτηριστικά με
 * τα ονόματα της ομάδας, τιμή από κανόνα markup. Ο server.ts τις τροφοδοτεί με δεδομένα και εκτελεί.
 */
export type RowStatus = "update" | "unchanged" | "new" | "waiting" | "problem";
export type ForeignPrice = { cost: number; price: number; rule: string; capped: boolean; margin: number };
export type ForeignPlanRow = {
  rowNo: number; title: string; status: RowStatus; mtrl?: number; code?: string;
  /** υπάρχον είδος: το όνομα της γραμμής στο αρχείο (δίπλα στο δικό μας) και με ποιο κλειδί βρέθηκε — για να φαίνεται λάθος ταίριασμα */
  fileName?: string; matchedBy?: MatchKind;
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
    const e = gtin14(r.fields.barcode); // GTIN-14: «012345678905» = «0012345678905»
    if (e) keys.set(`e:${e}`, `Το EAN ${normEan(r.fields.barcode!)}`);
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

/** Στην εκτέλεση: η φρέσκια αντιστοίχιση διαφέρει από αυτή που είδε ο χρήστης στον έλεγχο (άλλο είδος, ή νέο ↔ υπάρχον) → δεν εκτελείται. */
export function matchChanged(stored: { mtrl?: number } | undefined, fresh: { mtrl?: number }): boolean {
  return !stored || (stored.mtrl ?? null) !== (fresh.mtrl ?? null);
}

/** Γραμμές του αρχείου που δείχνουν στο ίδιο είδος (ίδιο μήνυμα με το resolveMatches) — για όταν ξαναϋπολογίζεται μόνο ένα μέρος των γραμμών. */
export function sameItemRows(mtrlOf: Map<number, number | null>): Map<number, string> {
  const per = new Map<number, number[]>();
  for (const [rowNo, m] of mtrlOf) if (m != null) per.set(m, [...(per.get(m) ?? []), rowNo]);
  const out = new Map<number, string>();
  for (const [m, rows] of per) if (rows.length > 1) for (const n of rows) out.set(n, `Το ίδιο είδος (MTRL ${m}) βρέθηκε σε περισσότερες γραμμές: ${[...rows].sort((a, b) => a - b).join(", ")}`);
  return out;
}

/** Κομμάτια το πολύ n στοιχείων (για λίστες `in` κάτω από το όριο παραμέτρων της βάσης). */
export function chunks<T>(list: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

export const SECTION_TITLE = "Γραμμή χωρίς κωδικό και κόστος — μάλλον τίτλος ενότητας.";

/**
 * Νέα γραμμή που μοιάζει με τίτλο ενότητας του τιμοκαταλόγου (π.χ. «IP VIDEO DOOR PHONES»), όχι με είδος: χωρίς έγκυρο
 * κόστος ΚΑΙ (κανένα κλειδί — κωδικός / κωδικός κατασκευαστή / EAN — ή ένα μόνο κείμενο σε όλη τη γραμμή, όπως ένα
 * συγχωνευμένο κελί ή ο τίτλος στη στήλη «Part Number»). Ρητό MTRL = υπάρχον είδος, ποτέ τίτλος.
 */
export function sectionTitle(r: ForeignRow): boolean {
  const t = (s?: string | null) => (s ?? "").trim();
  if (t(r.fields.mtrl)) return false;
  if (r.cost && parseMoney(r.cost) != null) return false;
  if (!t(r.fields.code) && !t(r.fields.factoryCode) && !t(r.fields.barcode)) return true;
  const texts = [...Object.values(r.fields), ...Object.values(r.specs), r.cost, r.rrp, ...r.media.image, ...r.media.banner, ...r.media.video].map(t).filter(Boolean);
  return new Set(texts).size <= 1;
}

/** Σημείωση στις γραμμές με τιμή όταν η εγγραφή τιμής web (S1_WEB_PRICE_WRITE) είναι κλειστή. */
export const PRICE_OFF_NOTE = "Η τιμή δεν θα γραφτεί — η εγγραφή τιμής δεν έχει ενεργοποιηθεί.";

const words = (s: string) => new Set(s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/ς/g, "σ").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3));

/** Το όνομα του αρχείου και το δικό μας δεν έχουν ΚΑΜΙΑ κοινή λέξη ≥3 χαρακτήρων (χωρίς τόνους/πεζά) → μάλλον λάθος ταίριασμα. Χωρίς τέτοιες λέξεις δεν κρίνεται. */
export function namesDiffer(ours: string, file: string): boolean {
  const a = words(ours ?? ""), b = words(file ?? "");
  if (!a.size || !b.size) return false;
  for (const w of a) if (b.has(w)) return false;
  return true;
}

export const ALREADY_PENDING = "Υπάρχει ήδη στη λίστα «Νέα είδη»";

/**
 * Νέες γραμμές που υπάρχουν ΗΔΗ ανοιχτές (pending / error / creating) στα «Νέα είδη» από άλλη εισαγωγή ή γραμμή: ίδιος
 * κωδικός (πεζά/κεφαλαία) ή ίδιο EAN (GTIN-14). Η ίδια εισαγωγή + γραμμή είναι ξανα-εκτέλεση — την καλύπτει το unique.
 */
export function openDuplicates(jobId: string, rows: { rowNo: number; code?: string; barcode?: string }[], open: { jobId: string; rowNo: number; code: string; fields: unknown }[]): Map<number, string> {
  const byCode = new Map<string, { jobId: string; rowNo: number }>(), byEan = new Map<string, { jobId: string; rowNo: number }>();
  for (const p of open) {
    const c = (p.code ?? "").trim().toLowerCase(); if (c && !byCode.has(c)) byCode.set(c, p);
    const f = p.fields && typeof p.fields === "object" && !Array.isArray(p.fields) ? (p.fields as Record<string, unknown>) : {};
    const e = typeof f.barcode === "string" ? gtin14(f.barcode) : null; if (e && !byEan.has(e)) byEan.set(e, p);
  }
  const out = new Map<number, string>();
  for (const r of rows) {
    const c = (r.code ?? "").trim().toLowerCase(), e = gtin14(r.barcode);
    const hit = [c ? byCode.get(c) : undefined, e ? byEan.get(e) : undefined].find((h) => h && !(h.jobId === jobId && h.rowNo === r.rowNo));
    if (hit) out.set(r.rowNo, `${ALREADY_PENDING} (${c && byCode.get(c) === hit ? `κωδικός ${r.code!.trim()}` : `EAN ${normEan(r.barcode!)}`}) — δεν μπήκε δεύτερη φορά.`);
  }
  return out;
}
