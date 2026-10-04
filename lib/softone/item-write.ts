import "server-only";
import { s1 } from "@/lib/softone";
import { getTable } from "@/lib/softone/lookups";
import { getSetting } from "@/lib/settings/store";

/**
 * Εγγραφή στοιχείων ενός είδους στο SoftOne από την καρτέλα προϊόντος — με την επίσημη υπηρεσία setData (ITEM, EditMaster:
 * ενημερώνει μόνο τα πεδία που στέλνουμε). Τρεις φραγμοί, γιατί το ERP είναι σε παραγωγή:
 * 1. **Σύγκρουση:** πριν γράψουμε διαβάζουμε το είδος· αν κάποιο πεδίο δεν είναι πια αυτό που είδε ο διαχειριστής (το άλλαξε
 *    κάποιος στο ERP), δεν γράφεται τίποτα.
 * 2. **Μόνο ό,τι άλλαξε** — κανένα άλλο πεδίο δεν στέλνεται.
 * 3. **Επαλήθευση:** νέα ανάγνωση μετά την εγγραφή. Το «success» του SoftOne δεν σημαίνει πάντα ότι η τιμή γράφτηκε.
 */
export type ItemField = "name" | "barcode" | "factoryCode" | "active" | "shortDesc" | "longDesc" | "availText" | "extWarranty" | "guaranteeMonths" | "weightKg" | "lengthCm" | "widthCm" | "heightCm";
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
};
export type ItemValue = string | number | boolean | null;
export type ItemChanges = Partial<Record<ItemField, { from: ItemValue; to: ItemValue }>>;

/** Σύγκριση «ίδιας τιμής»: CRLF ↔ LF, κενά στις άκρες, 0 ↔ κενό για αριθμούς, 1/0 ↔ ναι/όχι. */
export function norm(kind: Kind, v: unknown): string {
  if (v == null || v === "") return kind === "bool" ? "0" : "";
  if (kind === "bool") return v === true || v === 1 || v === "1" || /^true$/i.test(String(v)) ? "1" : "0";
  if (kind === "int" || kind === "num") { const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) && n !== 0 ? String(Math.round(n * 1000) / 1000) : ""; }
  return String(v).replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim();
}

/** Η τιμή όπως τη θέλει το SoftOne: οι γραμμές του memo με CRLF, όπως είναι γραμμένα τα υπόλοιπα είδη. */
function toS1(kind: Kind, v: ItemValue): string | number {
  if (kind === "bool") return norm("bool", v) === "1" ? 1 : 0;
  if (kind === "int" || kind === "num") { const s = norm(kind, v); return s ? Number(s) : 0; }
  const s = norm(kind, v);
  return kind === "memo" ? s.replace(/\n/g, "\r\n") : s;
}

async function readFields(mtrl: number, keys: ItemField[]) {
  const s1Fields = keys.map((k) => ITEM_FIELDS[k].s1);
  const rows = await getTable("MTRL", ["MTRL", ...s1Fields], `MTRL=${mtrl}`);
  const row = rows.find((r) => Number(r[0]) === mtrl);
  if (!row) return null;
  return Object.fromEntries(keys.map((k, i) => [k, row[i + 1] ?? ""])) as Record<ItemField, string>;
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
  return { ok: !mismatches.length, written: keys.filter((k) => !mismatches.some((m) => m.field === k)), conflicts: [], mismatches, ...(mismatches.length ? { error: "Το SoftOne απάντησε «επιτυχία» αλλά κάποια πεδία δεν γράφτηκαν όπως στάλθηκαν." } : {}) };
}

/** Υπάρχει ήδη είδος με αυτόν τον κωδικό στο SoftOne; (ο κωδικός είναι μοναδικός ανά εταιρεία — η συνεδρία είναι ήδη σε αυτήν) */
export async function itemCodeTaken(code: string): Promise<number | null> {
  const rows = await getTable("MTRL", ["MTRL", "CODE"], `SODTYPE=51 AND CODE='${code.replace(/'/g, "''")}'`);
  const r = rows.find((x) => x[1]?.trim().toLowerCase() === code.trim().toLowerCase());
  return r ? Number(r[0]) : null;
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
  const back = await getTable("MTRL", ["MTRL", "CODE", "NAME"], `MTRL=${mtrl}`);
  const b = back.find((x) => Number(x[0]) === mtrl);
  if (!b || b[1]?.trim() !== code || norm("text", b[2]) !== name) return { ok: false, mtrl, error: `Το είδος MTRL ${mtrl} δημιουργήθηκε αλλά η ανάγνωση δεν ταιριάζει (${b ? `${b[1]} · ${b[2]}` : "δεν βρέθηκε"}) — έλεγξε στο ERP.` };
  return { ok: true, mtrl };
}
