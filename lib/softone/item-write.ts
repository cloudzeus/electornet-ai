import "server-only";
import { s1, getS1Config } from "@/lib/softone";
import { getTable, selectorRows } from "@/lib/softone/lookups";
import { getSetting } from "@/lib/settings/store";
import { EXTRA_FIELDS, pickExtraRow, extraDiff, type ExtraRow } from "@/lib/softone/web-price-core";
import { toCp1253, unsupportedCp1253 } from "@/lib/softone/cp1253";

/**
 * Εγγραφή στοιχείων ενός είδους στο SoftOne από την καρτέλα προϊόντος — με την επίσημη υπηρεσία setData (ITEM, EditMaster:
 * ενημερώνει μόνο τα πεδία που στέλνουμε). Τρεις φραγμοί, γιατί το ERP είναι σε παραγωγή:
 * 1. **Σύγκρουση:** πριν γράψουμε διαβάζουμε το είδος· αν κάποιο πεδίο δεν είναι πια αυτό που είδε ο διαχειριστής (το άλλαξε
 *    κάποιος στο ERP), δεν γράφεται τίποτα.
 * 2. **Μόνο ό,τι άλλαξε** — κανένα άλλο πεδίο δεν στέλνεται.
 * 3. **Επαλήθευση:** νέα ανάγνωση μετά την εγγραφή. Το «success» του SoftOne δεν σημαίνει πάντα ότι η τιμή γράφτηκε.
 */
export type ItemField = "name" | "barcode" | "factoryCode" | "active" | "shortDesc" | "longDesc" | "availText" | "extWarranty" | "guaranteeMonths" | "weightKg" | "lengthCm" | "widthCm" | "heightCm" | "webGroup" | "webCat1" | "webCat2" | "webName";
/** Τα πεδία της καρτέλας προϊόντος — η web ομάδα / κατηγορίες αλλάζουν μόνο από την εισαγωγή (με έγκριση στο σχέδιο) */
export const WEB_FIELDS = ["webGroup", "webCat1", "webCat2", "webName"] as const;
export type EditorField = Exclude<ItemField, (typeof WEB_FIELDS)[number]>;
type Kind = "text" | "memo" | "bool" | "int" | "num";
export const ITEM_FIELDS: Record<ItemField, { s1: string; label: string; kind: Kind; max?: number }> = {
  name: { s1: "NAME", label: "Όνομα", kind: "text", max: 128 },
  barcode: { s1: "CODE1", label: "Barcode", kind: "text", max: 50 },
  factoryCode: { s1: "CODE2", label: "Κωδικός κατασκευαστή", kind: "text", max: 50 },
  active: { s1: "ISACTIVE", label: "Ενεργό", kind: "bool" },
  shortDesc: { s1: "CCCWREMARKS1", label: "Σύντομη περιγραφή", kind: "text", max: 4000 },
  longDesc: { s1: "CCCWREMARKS", label: "Αναλυτική περιγραφή & χαρακτηριστικά", kind: "memo" },
  availText: { s1: "CCCAVAIL", label: "Κείμενο διαθεσιμότητας", kind: "text", max: 1000 },
  extWarranty: { s1: "CCCWARRANTY", label: "Επέκταση εγγύησης", kind: "bool" },
  guaranteeMonths: { s1: "GUARTIME", label: "Εγγύηση (μήνες)", kind: "int" },
  weightKg: { s1: "CCCWEIGHT", label: "Βάρος (kg)", kind: "num" },
  lengthCm: { s1: "CCCLENGTH", label: "Μήκος / βάθος (εκ.)", kind: "num" },
  widthCm: { s1: "CCCWIDTH", label: "Πλάτος (εκ.)", kind: "num" },
  heightCm: { s1: "CCCHEIGHT", label: "Ύψος (εκ.)", kind: "num" },
  // web ομάδα χαρακτηριστικών και web κατηγορίες: με αυτά το είδος περνά στο web (WEB_FILTER του καταλόγου)
  webGroup: { s1: "CCCWEBGRSPECS", label: "Web ομάδα χαρακτηριστικών", kind: "int" },
  webCat1: { s1: "CCCWEBCATEGORY1", label: "Web κατηγορία 1", kind: "int" },
  webCat2: { s1: "CCCWEBCATEGORY2", label: "Web κατηγορία 2", kind: "int" },
  // «Περιγραφή για Web» (MTRL.WEBNAME, 64 χαρ.): τη συμπληρώνουν σχεδόν όλα τα είδη web του ERP και τη δείχνει το παλιό site
  webName: { s1: "WEBNAME", label: "Περιγραφή για Web", kind: "text", max: 64 },
};
export type ItemValue = string | number | boolean | null;
export type ItemChanges = Partial<Record<ItemField, { from: ItemValue; to: ItemValue }>>;

/** Σύγκριση «ίδιας τιμής»: CRLF ↔ LF, κενά στις άκρες, 0 ↔ κενό για αριθμούς, 1/0 ↔ ναι/όχι, και το κείμενο όπως το
 *  αποθηκεύει το SoftOne (Windows-1253: «USB‑C» με U+2011 = «USB-C»). */
export function norm(kind: Kind, v: unknown): string {
  if (v == null || v === "") return kind === "bool" ? "0" : "";
  if (kind === "bool") return v === true || v === 1 || v === "1" || /^true$/i.test(String(v)) ? "1" : "0";
  if (kind === "int" || kind === "num") { const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) && n !== 0 ? String(Math.round(n * 1000) / 1000) : ""; }
  return toCp1253(String(v)).replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim();
}

/** Η τιμή όπως τη θέλει το SoftOne: οι γραμμές του memo με CRLF, όπως είναι γραμμένα τα υπόλοιπα είδη. */
function toS1(kind: Kind, v: ItemValue): string | number {
  if (kind === "bool") return norm("bool", v) === "1" ? 1 : 0;
  if (kind === "int" || kind === "num") { const s = norm(kind, v); return s ? Number(s) : 0; }
  const s = norm(kind, v);
  return kind === "memo" ? s.replace(/\n/g, "\r\n") : s;
}

/**
 * Ένα είδος με τον αριθμό του, **και όταν είναι ανενεργό**: πρώτα GetTable (γρήγορο, αλλά τυφλό στα ανενεργά), μετά
 * `selectorFields`. Χωρίς το δεύτερο, κάθε ανάγνωση μετά από «ανενεργό» (νέο είδος, απενεργοποίηση) έβγαινε «δεν βρέθηκε».
 */
async function itemRow(mtrl: number, fields: string[]): Promise<Record<string, string> | null> {
  const rows = await getTable("MTRL", ["MTRL", ...fields], `MTRL=${mtrl}`);
  const row = rows.find((r) => Number(r[0]) === mtrl);
  if (row) return Object.fromEntries(fields.map((f, i) => [f, row[i + 1] ?? ""]));
  const alt = (await selectorRows("MTRL", "MTRL", mtrl, ["MTRL", ...fields])).find((r) => Number(r.MTRL) === mtrl);
  return alt ?? null;
}

async function readFields(mtrl: number, keys: ItemField[]) {
  const row = await itemRow(mtrl, keys.map((k) => ITEM_FIELDS[k].s1));
  if (!row) return null;
  return Object.fromEntries(keys.map((k) => [k, row[ITEM_FIELDS[k].s1] ?? ""])) as Record<ItemField, string>;
}

export async function itemWriteEnabled() {
  const s = await getSetting("softone").catch(() => null);
  const d = (s?.data ?? {}) as Record<string, unknown>;
  // Μόνο ο δικός του διακόπτης: το «Ενεργός συγχρονισμός» δεν ελέγχεται πουθενά (ούτε στις αναγνώσεις ούτε στο cron)
  return String(d.itemsWrite ?? "off") === "on";
}

export interface WriteResult {
  ok: boolean;
  written: ItemField[];
  /** άλλαξαν στο SoftOne από τότε που άνοιξε η καρτέλα — δεν γράφτηκε τίποτα */
  conflicts: { field: ItemField; saw: string; now: string }[];
  /** το SoftOne είπε «success» αλλά η τιμή που διαβάστηκε μετά δεν είναι αυτή που στείλαμε */
  mismatches: { field: ItemField; sent: string; got: string }[];
  /** το setData πέρασε: κάτι άλλαξε στο SoftOne, ακόμη κι αν η επαλήθευση βρήκε διαφορά */
  stored?: boolean;
  error?: string;
}

export async function writeItem(mtrl: number, changes: ItemChanges): Promise<WriteResult> {
  const keys = (Object.keys(changes) as ItemField[]).filter((k) => ITEM_FIELDS[k] && norm(ITEM_FIELDS[k].kind, changes[k]!.from) !== norm(ITEM_FIELDS[k].kind, changes[k]!.to));
  const empty: WriteResult = { ok: true, written: [], conflicts: [], mismatches: [] };
  if (!keys.length) return empty;
  for (const k of keys) {
    const f = ITEM_FIELDS[k], v = norm(f.kind, changes[k]!.to);
    if (f.max && v.length > f.max) return { ...empty, ok: false, error: `«${f.label}»: έως ${f.max} χαρακτήρες (τώρα ${v.length}).` };
    if ((f.kind === "int" || f.kind === "num") && v && !Number.isFinite(Number(v))) return { ...empty, ok: false, error: `«${f.label}»: δεν είναι αριθμός.` };
    if (k === "name" && !v) return { ...empty, ok: false, error: "Το όνομα δεν μπορεί να είναι κενό." };
    // emoji κ.λπ. δεν χωρούν στο Windows-1253 του SoftOne: θα γράφονταν αλλοιωμένα — σταματάμε πριν την εγγραφή
    const bad = f.kind === "text" || f.kind === "memo" ? unsupportedCp1253(v) : [];
    if (bad.length) return { ...empty, ok: false, error: `«${f.label}»: το SoftOne δεν αποθηκεύει τους χαρακτήρες ${bad.slice(0, 6).map((c) => `«${c}»`).join(" ")} — αφαίρεσέ τους και ξαναδοκίμασε.` };
  }

  // 1. σύγκρουση
  const now = await readFields(mtrl, keys);
  if (!now) return { ...empty, ok: false, error: "Το είδος δεν βρέθηκε στο SoftOne." };
  const conflicts = keys.filter((k) => norm(ITEM_FIELDS[k].kind, now[k]) !== norm(ITEM_FIELDS[k].kind, changes[k]!.from))
    .map((k) => ({ field: k, saw: norm(ITEM_FIELDS[k].kind, changes[k]!.from), now: norm(ITEM_FIELDS[k].kind, now[k]) }));
  if (conflicts.length) return { ...empty, ok: false, conflicts, error: "Κάποια πεδία άλλαξαν στο SoftOne από τότε που άνοιξες την καρτέλα. Δεν γράφτηκε τίποτα — ενημέρωσε από το SoftOne και ξαναδοκίμασε." };

  // 2. εγγραφή — μόνο τα πεδία που άλλαξαν
  const row = Object.fromEntries(keys.map((k) => [ITEM_FIELDS[k].s1, toS1(ITEM_FIELDS[k].kind, changes[k]!.to)]));
  const r = await s1("setData", { OBJECT: "ITEM", KEY: String(mtrl), data: { ITEM: [row] } }).catch((e: Error) => ({ success: false, error: e.message }));
  if (!r?.success) return { ...empty, ok: false, error: `Το SoftOne αρνήθηκε την εγγραφή: ${r?.error ?? "άγνωστο σφάλμα"}` };

  // 3. επαλήθευση
  const after = await readFields(mtrl, keys);
  const mismatches = keys.filter((k) => !after || norm(ITEM_FIELDS[k].kind, after[k]) !== norm(ITEM_FIELDS[k].kind, changes[k]!.to))
    .map((k) => ({ field: k, sent: norm(ITEM_FIELDS[k].kind, changes[k]!.to), got: after ? norm(ITEM_FIELDS[k].kind, after[k]) : "—" }));
  return { ok: !mismatches.length, stored: true, written: keys.filter((k) => !mismatches.some((m) => m.field === k)), conflicts: [], mismatches, ...(mismatches.length ? { error: "Το SoftOne απάντησε «επιτυχία» αλλά κάποια πεδία δεν γράφτηκαν όπως στάλθηκαν." } : {}) };
}

/** Ξεχωριστός διακόπτης για την τιμή web — ανοίγει μόνο με S1_WEB_PRICE_WRITE=1. Η εγγραφή ITEEXTRA δοκιμάστηκε σε πραγματικό είδος στις 10/11/2026 (MTRL 111750, με υπάρχουσα γραμμή MTREXTRA: γράφτηκε, διαβάστηκε πίσω, κανένα άλλο πεδίο δεν άλλαξε)· είδος ΧΩΡΙΣ γραμμή MTREXTRA δεν έχει δοκιμαστεί. */
export const webPriceWriteEnabled = () => process.env.S1_WEB_PRICE_WRITE === "1";
export const WEB_PRICE_OFF = "Η εγγραφή τιμής web στο SoftOne δεν έχει ενεργοποιηθεί ακόμη.";

/** Η γραμμή MTREXTRA του είδους με ΟΛΕΣ τις στήλες που διαβάζονται, για την εταιρεία της συνεδρίας (null = δεν έχει γραμμή). */
async function readExtra(mtrl: number): Promise<{ row: ExtraRow | null; error?: string }> {
  const [rows, cfg] = await Promise.all([getTable("MTREXTRA", EXTRA_FIELDS, `MTRL=${mtrl}`), getS1Config()]);
  const r = pickExtraRow(rows, mtrl, cfg?.company ?? "");
  return r.error ? { row: null, error: r.error } : { row: r.row ?? null };
}
const num04 = (row: ExtraRow | null) => { if (!row) return null; const n = Number(String(row.NUM04 ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };

/**
 * Τιμή web ενός είδους στο SoftOne: setData ITEM με τον πίνακα ITEEXTRA (έτσι εμφανίζεται ο MTREXTRA μέσα στο αντικείμενο
 * ITEM — επιβεβαιωμένο με getData) και μόνο το NUM04. Δύο διακόπτες: ο «Αλλαγές προϊόντων προς SoftOne» ΚΑΙ το
 * S1_WEB_PRICE_WRITE=1 (χωρίς αυτό: καμία κλήση δικτύου). Πριν και μετά διαβάζεται ΟΛΗ η γραμμή MTREXTRA (της εταιρείας της
 * συνεδρίας· πολλές γραμμές → άρνηση): αν μετά την εγγραφή άλλαξε οποιαδήποτε άλλη στήλη (τα EditList ξαναγράφουν όλη τη
 * γραμμή), αποτυχία με τη διαφορά. Με `onlyIfBlank` γράφει μόνο αν η τρέχουσα τιμή στο SoftOne (ζωντανή ανάγνωση) είναι κενή/0.
 * Το `written` μένει πάντα [] (το NUM04 δεν είναι ItemField) — το αποτέλεσμα το λένε τα `ok` / `error`.
 */
export async function writeWebPrice(mtrl: number, price: number, opts?: { onlyIfBlank?: boolean; /** `higher`: γράφει όταν δεν υπάρχει τιμή ή η νέα είναι μεγαλύτερη (ζωντανή ανάγνωση)· `any`: όποτε διαφέρει */ mode?: "higher" | "any" }): Promise<WriteResult> {
  const fail = (error: string): WriteResult => ({ ok: false, written: [], conflicts: [], mismatches: [], error });
  if (!webPriceWriteEnabled()) return fail(WEB_PRICE_OFF);
  if (!(await itemWriteEnabled())) return fail("Η εγγραφή στο SoftOne είναι κλειστή (Ρυθμίσεις → SoftOne → Αλλαγές προϊόντων προς SoftOne).");
  if (!Number.isInteger(mtrl) || mtrl <= 0) return fail("Μη έγκυρο είδος.");
  if (!Number.isFinite(price) || price <= 0) return fail("Η τιμή web πρέπει να είναι αριθμός μεγαλύτερος από 0.");
  const value = Math.round(price * 100) / 100;
  const same = (n: number | null) => n != null && Math.abs(n - value) < 0.005;

  // (και ανενεργό: ένα νέο είδος παίρνει τιμή πριν ενεργοποιηθεί)
  const exists = await itemRow(mtrl, ["CODE"]).then((r) => (r ? 1 : 0)).catch(() => null);
  if (exists == null) return fail("Δεν ήταν δυνατή η ανάγνωση του είδους από το SoftOne.");
  if (!exists) return fail("Το είδος δεν βρέθηκε στο SoftOne.");
  let before: Awaited<ReturnType<typeof readExtra>>;
  try { before = await readExtra(mtrl); } catch { return fail("Δεν ήταν δυνατή η ανάγνωση της τιμής web από το SoftOne."); }
  if (before.error) return fail(before.error);
  const cur = num04(before.row);
  if (opts?.onlyIfBlank && cur != null && cur > 0) return fail(`Το είδος έχει ήδη τιμή web (${cur} €) — δεν αλλάζει.`);
  // Η προεπισκόπηση έκρινε με τον καθρέφτη· εδώ κρίνει η ζωντανή τιμή: αν στο μεταξύ έγινε ίση ή μεγαλύτερη, δεν τη ρίχνουμε
  if (opts?.mode === "higher" && cur != null && cur > 0 && value <= cur) return fail(`Το είδος έχει ήδη τιμή web ${cur} €, ίση ή μεγαλύτερη από τη νέα (${value} €) — δεν αλλάζει.`);
  if (same(cur)) return { ok: true, written: [], conflicts: [], mismatches: [] };

  const r = await s1("setData", { OBJECT: "ITEM", KEY: String(mtrl), data: { ITEEXTRA: [{ NUM04: value }] } }).catch((e: Error) => ({ success: false, error: e.message }));
  if (!r?.success) return fail(`Το SoftOne αρνήθηκε την εγγραφή της τιμής web: ${r?.error ?? "άγνωστο σφάλμα"}`);

  const after = await readExtra(mtrl).catch(() => null);
  if (!after || after.error || !after.row) return fail(`Το SoftOne απάντησε «επιτυχία» αλλά η γραμμή MTREXTRA δεν διαβάζεται μετά την εγγραφή (${after?.error ?? "καμία γραμμή"}) — έλεγξε στο ERP.`);
  const diff = extraDiff(before.row, after.row);
  if (diff.length) {
    console.error("[writeWebPrice] άλλαξαν και άλλα πεδία του MTREXTRA", mtrl, diff);
    return fail(`ΠΡΟΣΟΧΗ: η εγγραφή της τιμής web άλλαξε και άλλα πεδία του είδους στο SoftOne (MTREXTRA): ${diff.map((d) => `${d.col} «${d.from || "—"}» → «${d.to || "—"}»`).join(", ")}. Έλεγξε και διόρθωσε άμεσα στο ERP.`);
  }
  if (!same(num04(after.row))) return fail(`Το SoftOne απάντησε «επιτυχία» αλλά η τιμή web δεν γράφτηκε (στάλθηκε ${value}, διαβάστηκε ${num04(after.row) ?? "—"}).`);
  return { ok: true, written: [], conflicts: [], mismatches: [] };
}

/**
 * Ξεχωριστός διακόπτης για την «Εξαίρεση Web» (MTREXTRA.BOOL04) — ανοίγει μόνο με S1_WEB_FLAG_WRITE=1. Ίδια εγγραφή
 * ITEEXTRA με την τιμή web· δοκιμάστηκε μαζί της στις 10/11/2026 (MTRL 111750: 1 → 0 → 1, κανένα άλλο πεδίο δεν άλλαξε).
 */
export const webFlagWriteEnabled = () => process.env.S1_WEB_FLAG_WRITE === "1";
export const WEB_FLAG_OFF = "Η εγγραφή της «Εξαίρεσης Web» στο SoftOne δεν έχει ενεργοποιηθεί ακόμη.";

/**
 * «Εξαίρεση Web» ενός είδους (το πεδίο που ορίζει αν ανεβαίνει στο site): setData ITEM / ITEEXTRA με μόνο το BOOL04.
 * Ίδιοι φραγμοί με την τιμή web — δύο διακόπτες, ανάγνωση ΟΛΗΣ της γραμμής MTREXTRA πριν και μετά, αποτυχία αν άλλαξε
 * οποιοδήποτε άλλο πεδίο ή αν η τιμή δεν διαβάζεται πίσω όπως στάλθηκε.
 */
export async function writeWebExcluded(mtrl: number, excluded: boolean): Promise<WriteResult> {
  const fail = (error: string): WriteResult => ({ ok: false, written: [], conflicts: [], mismatches: [], error });
  if (!webFlagWriteEnabled()) return fail(WEB_FLAG_OFF);
  if (!(await itemWriteEnabled())) return fail("Η εγγραφή στο SoftOne είναι κλειστή (Ρυθμίσεις → SoftOne → Αλλαγές προϊόντων προς SoftOne).");
  if (!Number.isInteger(mtrl) || mtrl <= 0) return fail("Μη έγκυρο είδος.");
  const on = (row: ExtraRow | null) => /^(1|true)$/i.test(String(row?.BOOL04 ?? "").trim());
  let before: Awaited<ReturnType<typeof readExtra>>;
  try { before = await readExtra(mtrl); } catch { return fail("Δεν ήταν δυνατή η ανάγνωση της «Εξαίρεσης Web» από το SoftOne."); }
  if (before.error) return fail(before.error);
  if (on(before.row) === excluded) return { ok: true, written: [], conflicts: [], mismatches: [] };

  const r = await s1("setData", { OBJECT: "ITEM", KEY: String(mtrl), data: { ITEEXTRA: [{ BOOL04: excluded ? 1 : 0 }] } }).catch((e: Error) => ({ success: false, error: e.message }));
  if (!r?.success) return fail(`Το SoftOne αρνήθηκε την εγγραφή της «Εξαίρεσης Web»: ${r?.error ?? "άγνωστο σφάλμα"}`);

  const after = await readExtra(mtrl).catch(() => null);
  if (!after || after.error || !after.row) return fail(`Το SoftOne απάντησε «επιτυχία» αλλά η γραμμή MTREXTRA δεν διαβάζεται μετά την εγγραφή (${after?.error ?? "καμία γραμμή"}) — έλεγξε το είδος στο SoftOne.`);
  // το extraDiff αγνοεί το NUM04 (τιμή web)· εδώ το πεδίο που αλλάζουμε εμείς είναι το BOOL04, άρα το NUM04 ελέγχεται ρητά
  const diff = [...extraDiff(before.row, after.row).filter((d) => d.col !== "BOOL04"), ...((before.row?.NUM04 ?? "") !== (after.row.NUM04 ?? "") && Number(before.row?.NUM04 ?? 0) !== Number(after.row.NUM04 ?? 0) ? [{ col: "NUM04", from: before.row?.NUM04 ?? "", to: after.row.NUM04 ?? "" }] : [])];
  if (diff.length) {
    console.error("[writeWebExcluded] άλλαξαν και άλλα πεδία του MTREXTRA", mtrl, diff);
    return fail(`ΠΡΟΣΟΧΗ: η εγγραφή της «Εξαίρεσης Web» άλλαξε και άλλα πεδία του είδους στο SoftOne (MTREXTRA): ${diff.map((d) => `${d.col} «${d.from || "—"}» → «${d.to || "—"}»`).join(", ")}. Έλεγξε το είδος στο SoftOne.`);
  }
  if (on(after.row) !== excluded) return fail("Το SoftOne απάντησε «επιτυχία» αλλά η «Εξαίρεση Web» δεν γράφτηκε.");
  return { ok: true, written: [], conflicts: [], mismatches: [] };
}

/** Υπάρχει ήδη είδος με αυτόν τον κωδικό στο SoftOne; (ο κωδικός είναι μοναδικός ανά εταιρεία — η συνεδρία είναι ήδη σε αυτήν) */
export async function itemCodeTaken(code: string): Promise<number | null> {
  const same = (c: string | undefined) => c?.trim().toLowerCase() === code.trim().toLowerCase();
  const rows = await getTable("MTRL", ["MTRL", "CODE"], `SODTYPE=51 AND CODE='${code.replace(/'/g, "''")}'`);
  const r = rows.find((x) => same(x[1]));
  if (r) return Number(r[0]);
  // Ανενεργό είδος με αυτόν τον κωδικό: το GetTable δεν το βλέπει — χωρίς αυτόν τον έλεγχο θα δημιουργούσαμε ΔΕΥΤΕΡΟ είδος
  const hidden = (await selectorRows("MTRL", "CODE", code.trim(), ["MTRL", "CODE", "SODTYPE"])).find((x) => same(x.CODE) && (!x.SODTYPE || Number(x.SODTYPE) === 51));
  return hidden ? Number(hidden.MTRL) : null;
}

export interface NewItem {
  code: string;
  fields: Partial<Record<ItemField, ItemValue>>;
  /** MTRMANFCTR, CCCWEBGRSPECS, CCCWEBCATEGORY1/2 και ό,τι αντιγράφεται από ένα είδος της ίδιας ομάδας (ΦΠΑ, μονάδα, ομάδα, κατηγορία, μάρκα) */
  refs: { manufacturer: number; specGroup: number; webCat1: number | null; webCat2: number | null; vat: number | null; unit: number | null; itemGroup: number | null; commCategory: number | null; mark: number | null };
}

/**
 * Νέο είδος στο SoftOne με setData ITEM χωρίς KEY (εισαγωγή). Ο κωδικός ελέγχεται πρώτα ότι είναι ελεύθερος· μετά την
 * εγγραφή το είδος ξαναδιαβάζεται και επαληθεύονται κωδικός και όνομα. Το ERP είναι σε παραγωγή: τίποτα «έξυπνο» εδώ —
 * μόνο τα πεδία που ξέρουμε, με τιμές αντιγραμμένες από υπάρχον είδος της ίδιας ομάδας.
 */
export async function createItem(item: NewItem): Promise<{ ok: boolean; mtrl?: number; error?: string }> {
  const code = item.code.trim();
  if (!code || code.length > 25) return { ok: false, error: "Ο κωδικός είδους χρειάζεται 1–25 χαρακτήρες." };
  const name = norm("text", item.fields.name);
  if (!name) return { ok: false, error: "Το όνομα δεν μπορεί να είναι κενό." };
  for (const [k, v] of Object.entries(item.fields) as [ItemField, ItemValue][]) {
    const f = ITEM_FIELDS[k], s = norm(f.kind, v);
    if (f.max && s.length > f.max) return { ok: false, error: `«${f.label}»: έως ${f.max} χαρακτήρες (τώρα ${s.length}).` };
  }
  const taken = await itemCodeTaken(code);
  if (taken) return { ok: false, error: `Ο κωδικός «${code}» υπάρχει ήδη στο SoftOne (MTRL ${taken}).` };

  const row: Record<string, string | number> = { CODE: code, MTRMANFCTR: item.refs.manufacturer, CCCWEBGRSPECS: item.refs.specGroup };
  const refs: [string, number | null][] = [["CCCWEBCATEGORY1", item.refs.webCat1], ["CCCWEBCATEGORY2", item.refs.webCat2], ["VAT", item.refs.vat], ["MTRUNIT1", item.refs.unit], ["MTRGROUP", item.refs.itemGroup], ["MTRCATEGORY", item.refs.commCategory], ["MTRMARK", item.refs.mark]];
  for (const [k, v] of refs) if (v != null) row[k] = v;
  for (const [k, v] of Object.entries(item.fields) as [ItemField, ItemValue][]) { const f = ITEM_FIELDS[k]; if (norm(f.kind, v) !== "" || f.kind === "bool") row[f.s1] = toS1(f.kind, v); }

  const r = await s1("setData", { OBJECT: "ITEM", data: { ITEM: [row] } }).catch((e: Error) => ({ success: false, error: e.message }));
  if (!r?.success) return { ok: false, error: `Το SoftOne αρνήθηκε τη δημιουργία: ${r?.error ?? "άγνωστο σφάλμα"}` };
  const mtrl = Number(r.id);
  if (!Number.isInteger(mtrl) || mtrl <= 0) return { ok: false, error: "Το SoftOne απάντησε «επιτυχία» χωρίς αριθμό είδους — έλεγξε στο ERP." };
  // το είδος δημιουργείται συνήθως ΑΝΕΝΕΡΓΟ, άρα η ανάγνωση πρέπει να βλέπει και ανενεργά (`itemRow`)
  const b = await itemRow(mtrl, ["CODE", "NAME"]);
  if (!b || b.CODE?.trim() !== code || norm("text", b.NAME) !== name) return { ok: false, mtrl, error: `Το είδος MTRL ${mtrl} δημιουργήθηκε αλλά η ανάγνωση δεν ταιριάζει (${b ? `${b.CODE} · ${b.NAME}` : "δεν βρέθηκε"}) — έλεγξε στο ERP.` };
  return { ok: true, mtrl };
}
