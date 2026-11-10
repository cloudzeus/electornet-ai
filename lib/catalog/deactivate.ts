import "server-only";
import { db } from "@/lib/db";
import { buildMatchIndex, eanVariants, keyRows, resolveMatches, UserError, type ForeignRow } from "@/lib/catalog/foreign-import/core";
import { findOffWebItems, syncItem } from "@/lib/softone/catalog";
import { projectItem } from "@/lib/softone/project";
import { itemWriteEnabled, webFlagWriteEnabled, writeItem, writeWebExcluded } from "@/lib/softone/item-write";
import { selectorRows } from "@/lib/softone/lookups";
import { deactApplies, deactState, type DeactMode, type DeactState } from "@/lib/catalog/deactivate-core";

/**
 * **Απενεργοποίηση προϊόντων από Excel.** Το αρχείο απαριθμεί είδη (κωδικός, barcode ή MTRL)· εδώ βρίσκεται ποιο είδος
 * είναι το καθένα και τι είναι σήμερα, χωρίς καμία εγγραφή (`planDeactivation`), και μετά — μόνο για όσα διάλεξε ο
 * χρήστης — γίνεται η αλλαγή στο SoftOne και περνά αμέσως στο eshop (`deactivateItems`). Το «ενεργό» ορίζεται στο
 * SoftOne: το eshop το παίρνει από εκεί, γι' αυτό καμία αλλαγή δεν γίνεται μόνο στη δική μας βάση (θα γύριζε πίσω στον
 * επόμενο συγχρονισμό).
 */
export interface DeactRow {
  rowNo: number; sheet: string; line: number;
  /** ό,τι έγραφε η γραμμή του αρχείου: το κλειδί της και το όνομα, αν είχε */
  key: string; fileName: string;
  state: DeactState; problem?: string;
  mtrl?: number; code?: string; title?: string;
  /** στοιχεία που βοηθούν την απόφαση: απόθεμα κεντρικής και τιμή web */
  stock?: number; price?: number | null;
}

const MAX_ROWS = 5000;
const t = (s?: string | null) => (s ?? "").trim();

export async function planDeactivation(sheets: { name: string; matrix: string[][] }[]): Promise<DeactRow[]> {
  const { rows, sheetOf } = keyRows(sheets);
  if (!rows.length) throw new UserError("Δεν βρήκα είδη στο αρχείο: χρειάζεται στήλη με κωδικό είδους, barcode (EAN) ή MTRL.");
  if (rows.length > MAX_ROWS) throw new UserError(`Το αρχείο έχει ${rows.length.toLocaleString("el-GR")} είδη — έως ${MAX_ROWS.toLocaleString("el-GR")} ανά αρχείο.`);

  const mtrls = rows.map((r) => Number(t(r.fields.mtrl))).filter((n) => Number.isInteger(n) && n > 0);
  const codes = [...new Set(rows.flatMap((r) => [t(r.fields.code), t(r.fields.factoryCode)]).filter(Boolean))];
  const eans = [...new Set(rows.flatMap((r) => { const v = eanVariants(r.fields.barcode); return v.length ? v : t(r.fields.barcode) ? [t(r.fields.barcode)] : []; }))];
  const select = { mtrl: true, code: true, name: true, barcode: true, factoryCode: true, active: true, webExcluded: true, stockCentral: true, eshopPrice: true } as const;
  const mirrored = await db.s1Item.findMany({ where: { missing: false, OR: [{ mtrl: { in: mtrls } }, { code: { in: codes, mode: "insensitive" } }, { barcode: { in: eans } }, { factoryCode: { in: codes, mode: "insensitive" } }] }, select });
  // είδη του ERP εκτός καθρέφτη (χωρίς web κατηγορία): ενεργά, αλλά στο eshop δεν φαίνονται
  const hasCode = new Set(mirrored.flatMap((i) => [i.code, i.factoryCode].filter((x): x is string => !!x).map((x) => x.toLowerCase())));
  const off = await findOffWebItems({ codes: codes.filter((c) => !hasCode.has(c.toLowerCase())), barcodes: eans.filter((e) => !mirrored.some((i) => i.barcode === e)) });
  type It = { mtrl: number; code: string; name: string; barcode: string | null; factoryCode: string | null; active: boolean; webExcluded: boolean; onWeb: boolean; stock: number; price: number | null };
  const items: It[] = [
    ...mirrored.map((i) => ({ mtrl: i.mtrl, code: i.code, name: i.name, barcode: i.barcode, factoryCode: i.factoryCode, active: i.active, webExcluded: i.webExcluded, onWeb: true, stock: Number(i.stockCentral ?? 0), price: i.eshopPrice })),
    ...off.filter((o) => !mirrored.some((i) => i.mtrl === o.mtrl)).map((o) => ({ mtrl: o.mtrl, code: o.code, name: o.name, barcode: o.barcode, factoryCode: o.factoryCode, active: true, webExcluded: false, onWeb: false, stock: 0, price: null })),
  ];
  const itemOf = new Map(items.map((i) => [i.mtrl, i]));
  // ο κωδικός κατασκευαστή ταιριάζει μόνο μαζί με μάρκα, και εδώ δεν υπάρχει μάρκα: κλειδιά είναι MTRL, κωδικός, barcode
  const matches = resolveMatches(rows as ForeignRow[], buildMatchIndex(items.map((i) => ({ mtrl: i.mtrl, code: i.code, barcode: i.barcode, factoryCode: null, brandId: null }))));

  const out: DeactRow[] = [];
  let lookups = 0;
  const seen = new Map<number, string>();
  for (const [n, row] of rows.entries()) {
    const where = sheetOf.get(row.rowNo)!;
    let m = matches[n];
    // Το ίδιο είδος δύο φορές στη λίστα δεν είναι λάθος εδώ: μετρά η πρώτη γραμμή, οι επόμενες απλώς σημειώνονται
    if (m.mtrl != null && m.problem?.includes("περισσότερες γραμμές")) {
      const id = m.mtrl, first = seen.get(id);
      m = { ...m, problem: first ? `Υπάρχει ήδη πιο πάνω (${first}) — μετρά μία φορά.` : null };
      if (!first) seen.set(id, `${where.sheet}, γραμμή ${where.line}`);
    }
    const key = t(row.fields.mtrl) ? `MTRL ${t(row.fields.mtrl)}` : t(row.fields.code) || t(row.fields.barcode) || t(row.fields.factoryCode);
    let it: It | null = m.mtrl != null ? itemOf.get(m.mtrl) ?? null : null;
    // Δεν βρέθηκε πουθενά: ίσως είναι ήδη ανενεργό — τα ανενεργά δεν τα βλέπουν ούτε ο καθρέφτης ούτε το GetTable
    if (!it && !m.problem && t(row.fields.code) && lookups++ < 300) {
      const h = (await selectorRows("MTRL", "CODE", t(row.fields.code), ["MTRL", "CODE", "NAME", "ISACTIVE", "SODTYPE"]).catch(() => [])).find((x) => t(x.CODE).toLowerCase() === t(row.fields.code).toLowerCase() && (!x.SODTYPE || Number(x.SODTYPE) === 51));
      if (h) it = { mtrl: Number(h.MTRL), code: t(h.CODE), name: t(h.NAME), barcode: null, factoryCode: null, active: /^(1|true)$/i.test(t(h.ISACTIVE)), webExcluded: false, onWeb: false, stock: 0, price: null };
    }
    out.push({
      rowNo: row.rowNo, sheet: where.sheet, line: where.line, key, fileName: t(row.fields.name),
      state: deactState(it, m.problem), ...(m.problem ? { problem: m.problem } : {}),
      ...(it ? { mtrl: it.mtrl, code: it.code, title: it.name, stock: it.stock, price: it.price } : {}),
    });
  }
  return out;
}

export interface DeactResult { mtrl: number; ok: boolean; error?: string }

/**
 * Εκτέλεση για τα είδη που διάλεξε ο χρήστης. Κάθε είδος ξαναδιαβάζεται ζωντανά από το SoftOne μέσα στις ίδιες τις
 * συναρτήσεις εγγραφής (αν άλλαξε στο μεταξύ, δεν γράφεται) και μετά συγχρονίζεται, ώστε το eshop να το δει αμέσως.
 * Μία-μία, γιατί το SoftOne δεν θέλει παράλληλες εγγραφές.
 */
export async function deactivateItems(mtrls: number[], mode: DeactMode): Promise<DeactResult[]> {
  if (!(await itemWriteEnabled())) throw new UserError("Οι αλλαγές προς το SoftOne είναι κλειστές (Ρυθμίσεις → SoftOne) — η απενεργοποίηση γίνεται εκεί.");
  if (mode === "web" && !webFlagWriteEnabled()) throw new UserError("Η εγγραφή της «Εξαίρεσης Web» δεν έχει ενεργοποιηθεί σε αυτό το περιβάλλον (S1_WEB_FLAG_WRITE).");
  const out: DeactResult[] = [];
  for (const mtrl of [...new Set(mtrls.filter((n) => Number.isInteger(n) && n > 0))]) {
    try {
      const it = await db.s1Item.findUnique({ where: { mtrl }, select: { active: true, webExcluded: true, missing: true } });
      const state = deactState(it && !it.missing ? { active: it.active, webExcluded: it.webExcluded, onWeb: true } : { active: true, webExcluded: false, onWeb: false }, null);
      if (!deactApplies(state, mode)) { out.push({ mtrl, ok: true, error: state === "inactive" ? "Ήταν ήδη ανενεργό." : "Ήταν ήδη εκτός eshop." }); continue; }
      const w = mode === "web" ? await writeWebExcluded(mtrl, true) : await writeItem(mtrl, { active: { from: true, to: false } });
      if (!w.ok) { out.push({ mtrl, ok: false, error: w.error ?? "Το SoftOne δεν δέχτηκε την αλλαγή." }); continue; }
      await syncItem(mtrl, "manual"); await projectItem(mtrl);
      out.push({ mtrl, ok: true });
    } catch (e) { console.error("[deactivate]", mtrl, e); out.push({ mtrl, ok: false, error: "Απρόσμενο σφάλμα — ξαναδοκίμασε." }); }
  }
  return out;
}
