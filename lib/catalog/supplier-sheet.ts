import "server-only";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { parseDescription, toPlainText } from "@/lib/softone/describe";
import { syncSpecGroups } from "@/lib/softone/catalog";

/**
 * Templates προμηθευτών: ένα Excel ανά μάρκα, με ένα sheet ανά ομάδα χαρακτηριστικών (τύπο προϊόντος) του SoftOne.
 * Οι στήλες είναι τα βασικά στοιχεία του είδους και τα χαρακτηριστικά της ομάδας — όπως είναι ΤΩΡΑ στο SoftOne: τα
 * αρχεία φτιάχνονται τη στιγμή της λήψης και δεν αποθηκεύονται, γιατί οι ομάδες αλλάζουν.
 *
 * Στην εισαγωγή οι στήλες αντιστοιχίζονται με το όνομά τους στις τρέχουσες ομάδες· ό,τι δεν υπάρχει πια αγνοείται με
 * προειδοποίηση. Τα χαρακτηριστικά ενός είδους ζουν στο SoftOne ως γραμμές «Ετικέτα : τιμή» της αναλυτικής περιγραφής
 * (CCCWREMARKS) — από εκεί τα διαβάζει και η προβολή του καταστήματος.
 */
export const SHEET_VERSION = 1;
export type SheetKind = "existing" | "new" | "media";

export type FieldKey = "mtrl" | "code" | "name" | "barcode" | "factoryCode" | "shortDesc" | "descText" | "guaranteeMonths" | "widthCm" | "heightCm" | "lengthCm" | "weightKg";
type FieldKind = "text" | "int" | "num";
export const FIELDS: { key: FieldKey; header: string; kind: FieldKind; width: number; note: string; only?: SheetKind; required?: boolean }[] = [
  { key: "mtrl", header: "MTRL", kind: "int", width: 10, only: "existing", note: "Αριθμός είδους στο SoftOne — μην τον αλλάξεις, με αυτόν βρίσκουμε το προϊόν." },
  { key: "code", header: "Κωδικός είδους", kind: "text", width: 18, note: "Ο κωδικός του είδους στο SoftOne. Στα νέα: αν μείνει κενός, μπαίνει ο κωδικός κατασκευαστή. Στα υπάρχοντα δεν αλλάζει από εδώ." },
  { key: "name", header: "Όνομα", kind: "text", width: 44, required: true, note: "Το όνομα του είδους (έως 128 χαρακτήρες), π.χ. «WW90T554DAW ΠΛΥΝΤΗΡΙΟ ΡΟΥΧΩΝ 9KG»." },
  { key: "barcode", header: "Barcode (EAN)", kind: "text", width: 16, note: "EAN-13 / UPC. Πρέπει να είναι μοναδικό — το SoftOne δεν δέχεται δύο είδη με το ίδιο." },
  { key: "factoryCode", header: "Κωδικός κατασκευαστή", kind: "text", width: 18, note: "Το μοντέλο / part number του κατασκευαστή." },
  { key: "shortDesc", header: "Σύντομη περιγραφή", kind: "text", width: 40, note: "Μία–δύο προτάσεις για τη λίστα προϊόντων." },
  { key: "descText", header: "Περιγραφή", kind: "text", width: 50, note: "Ελεύθερο κείμενο για τη σελίδα του προϊόντος. Τα χαρακτηριστικά ΔΕΝ γράφονται εδώ — έχουν δικές τους στήλες δεξιά." },
  { key: "guaranteeMonths", header: "Εγγύηση (μήνες)", kind: "int", width: 10, note: "Ακέραιος αριθμός μηνών, π.χ. 24." },
  { key: "widthCm", header: "Πλάτος (εκ.)", kind: "num", width: 10, note: "Εξωτερικό πλάτος σε εκατοστά (όχι mm)." },
  { key: "heightCm", header: "Ύψος (εκ.)", kind: "num", width: 10, note: "Εξωτερικό ύψος σε εκατοστά. Τηλεοράσεις: χωρίς βάση." },
  { key: "lengthCm", header: "Βάθος (εκ.)", kind: "num", width: 10, note: "Εξωτερικό βάθος σε εκατοστά." },
  { key: "weightKg", header: "Βάρος (kg)", kind: "num", width: 10, note: "Καθαρό βάρος σε κιλά." },
];
export const RESERVED = new Set(["Οδηγίες", "_meta", "_lists"]);
const DATA_ROWS_NEW = 200;

export const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ς/g, "σ").replace(/\s*\*\s*$/, "").replace(/\s+/g, " ").trim();
const SPEC_LINE = /^(?:[•\-–*·]\s*)?([^:\n]{2,60}?)\s*:\s*(\S.*)$/;
const isHtml = (s: string | null | undefined) => !!s && /<\s*[a-z][^>]*>/i.test(s);

// ---------- Ομάδες χαρακτηριστικών (πάντα φρέσκες) ----------

/** Οι ομάδες αλλάζουν στο SoftOne: πριν φτιάξουμε ή διαβάσουμε αρχείο, τις ξαναδιαβάζουμε αν η τελευταία ανάγνωση είναι παλιά. */
export async function ensureFreshSpecGroups(maxAgeMin = 15) {
  const st = await db.s1SyncState.findUnique({ where: { kind: "specgroup" } });
  if (st?.lastFullAt && Date.now() - st.lastFullAt.getTime() < maxAgeMin * 60_000) return { refreshed: false, at: st.lastFullAt };
  const r = await syncSpecGroups("manual");
  return { refreshed: r.ok, at: new Date(), error: r.ok ? undefined : r.error };
}

export async function loadGroups(ids: number[]) {
  const groups = await db.s1SpecGroup.findMany({
    where: { s1Id: { in: ids }, missing: false },
    include: { specs: { where: { missing: false, active: true }, orderBy: { code: "asc" }, include: { options: { where: { missing: false, active: true }, orderBy: { code: "asc" } } } } },
  });
  return new Map(groups.map((g) => [g.s1Id, g]));
}
type Group = NonNullable<Awaited<ReturnType<typeof loadGroups>> extends Map<number, infer G> ? G : never>;

export const groupOfCategory = (erpCode: string | null) => { const m = /^s1:g:(\d+)$/.exec(erpCode ?? ""); return m ? Number(m[1]) : null; };

// ---------- Επισκόπηση μάρκας ----------

export interface BrandGroupRow { groupS1Id: number; name: string; path: string; products: number; active: number; withSpecs: number; specCount: number }
export interface BrandOverview { brandId: string; name: string; s1Id: string | null; products: number; groups: BrandGroupRow[] }

/** Τι έχει η μάρκα: τα προϊόντα της ανά ομάδα χαρακτηριστικών. */
export async function brandOverview(brandIds: string[]): Promise<BrandOverview[]> {
  const brands = await db.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true, name: true, s1Id: true } });
  const rows = await db.product.findMany({ where: { brandId: { in: brandIds } }, select: { brandId: true, active: true, erpCode: true, category: { select: { erpCode: true, name: true, parent: { select: { name: true, parent: { select: { name: true } } } } } }, _count: { select: { specs: true } } } });
  const groupIds = [...new Set(rows.map((r) => groupOfCategory(r.category.erpCode)).filter((x): x is number => x != null))];
  const defs = await db.s1SpecDef.groupBy({ by: ["groupS1Id"], where: { groupS1Id: { in: groupIds }, missing: false, active: true }, _count: { _all: true } });
  const specCount = new Map(defs.map((d) => [d.groupS1Id, d._count._all]));
  return brandIds.map((id) => {
    const b = brands.find((x) => x.id === id);
    const mine = rows.filter((r) => r.brandId === id);
    const by = new Map<number, BrandGroupRow>();
    for (const r of mine) {
      const g = groupOfCategory(r.category.erpCode); if (g == null) continue;
      const row = by.get(g) ?? { groupS1Id: g, name: r.category.name, path: [r.category.parent?.parent?.name, r.category.parent?.name].filter(Boolean).join(" › "), products: 0, active: 0, withSpecs: 0, specCount: specCount.get(g) ?? 0 };
      row.products++; if (r.active) row.active++; if (r._count.specs > 0) row.withSpecs++;
      by.set(g, row);
    }
    return { brandId: id, name: b?.name ?? "—", s1Id: b?.s1Id ?? null, products: mine.length, groups: [...by.values()].sort((a, b) => b.products - a.products) };
  });
}

// ---------- Δημιουργία αρχείου ----------

/** Οι τιμές ενός είδους όπως μπαίνουν στο αρχείο — και όπως συγκρίνονται στην εισαγωγή («άλλαξε κάτι;»). */
export function itemValues(it: { mtrl: number; code: string; name: string; barcode: string | null; factoryCode: string | null; shortDesc: string | null; longDesc: string | null; guaranteeMonths: number | null; widthCm: number | null; heightCm: number | null; lengthCm: number | null; weightKg: number | null }, group: Group) {
  const parsed = parseDescription(it.longDesc);
  const byKey = new Map(parsed.specs.map((s) => [plain(s.key), s.value]));
  const fields: Record<FieldKey, string> = {
    mtrl: String(it.mtrl), code: it.code, name: it.name, barcode: it.barcode ?? "", factoryCode: it.factoryCode ?? "", shortDesc: it.shortDesc ? toPlainText(it.shortDesc) : "",
    descText: parsed.text, guaranteeMonths: it.guaranteeMonths ? String(it.guaranteeMonths) : "",
    widthCm: it.widthCm ? String(it.widthCm) : "", heightCm: it.heightCm ? String(it.heightCm) : "", lengthCm: it.lengthCm ? String(it.lengthCm) : "", weightKg: it.weightKg ? String(it.weightKg) : "",
  };
  const specs = Object.fromEntries(group.specs.map((d) => [d.name, byKey.get(plain(d.name)) ?? ""]));
  return { fields, specs };
}

export const safeSheetName = (name: string, taken: Set<string>) => {
  const base = name.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) || "Ομάδα";
  let n = base; for (let i = 2; taken.has(n.toLowerCase()) || RESERVED.has(n); i++) n = `${base.slice(0, 26)} ${i}`;
  taken.add(n.toLowerCase()); return n;
};
export const colName = (i: number) => { let s = ""; for (let n = i; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

export interface SheetMeta { v: number; kind: SheetKind; brandId: string; brand: string; generatedAt: string; sheets: { name: string; groupS1Id: number; group: string }[] }

export async function buildTemplate(brandId: string, groupIds: number[], kind: SheetKind): Promise<{ buffer: Buffer; filename: string; rows: number }> {
  const brand = await db.brand.findUnique({ where: { id: brandId }, select: { id: true, name: true } });
  if (!brand) throw new Error("Η μάρκα δεν βρέθηκε.");
  const groups = await loadGroups(groupIds);
  const ordered = groupIds.map((id) => groups.get(id)).filter((g): g is Group => !!g);
  if (!ordered.length) throw new Error("Καμία από τις ομάδες δεν υπάρχει πια στο SoftOne.");

  // Υπάρχοντα είδη της μάρκας στις ομάδες (από τον καθρέφτη του SoftOne) και προτάσεις τιμών ανά χαρακτηριστικό
  const cats = await db.category.findMany({ where: { erpCode: { in: ordered.map((g) => `s1:g:${g.s1Id}`) } }, select: { id: true, erpCode: true } });
  const catOf = new Map(cats.map((c) => [groupOfCategory(c.erpCode)!, c.id]));
  const products = await db.product.findMany({ where: { categoryId: { in: cats.map((c) => c.id) } }, select: { brandId: true, erpCode: true, categoryId: true, specs: { select: { key: true, value: true } } } });
  const items = kind === "existing" ? await db.s1Item.findMany({ where: { mtrl: { in: products.filter((p) => p.brandId === brandId && /^\d+$/.test(p.erpCode)).map((p) => Number(p.erpCode)) }, missing: false }, orderBy: { name: "asc" } }) : [];

  const wb = new ExcelJS.Workbook();
  wb.creator = "Euronics admin"; wb.created = new Date();
  const navy = "FF0B1F4D", blue = "FF1E5AAB", grey = "FFEEF1F6", yellow = "FFFFF4CC";
  const intro = wb.addWorksheet("Οδηγίες", { properties: { tabColor: { argb: navy } } });
  const lists = wb.addWorksheet("_lists", { state: "veryHidden" });
  const metaWs = wb.addWorksheet("_meta", { state: "veryHidden" });
  const taken = new Set<string>();
  const meta: SheetMeta = { v: SHEET_VERSION, kind, brandId: brand.id, brand: brand.name, generatedAt: new Date().toISOString(), sheets: [] };
  let listCol = 0, total = 0;

  for (const g of ordered) {
    const name = safeSheetName(g.name, taken);
    meta.sheets.push({ name, groupS1Id: g.s1Id, group: g.name });
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", xSplit: kind === "existing" ? 3 : 2, ySplit: 1 }] });
    const fields = FIELDS.filter((f) => !f.only || f.only === kind);
    const cols = [...fields.map((f) => ({ header: `${f.header}${f.required ? " *" : ""}`, width: f.width })), ...g.specs.map((d) => ({ header: d.name, width: Math.min(28, Math.max(14, d.name.length + 4)) }))];
    ws.columns = cols.map((c) => ({ header: c.header, width: c.width }));
    const head = ws.getRow(1);
    head.height = 34;
    head.eachCell((cell, i) => {
      const isSpec = i > fields.length;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isSpec ? blue : navy } };
      cell.alignment = { vertical: "middle", wrapText: true };
      const f = fields[i - 1], d = g.specs[i - 1 - fields.length];
      cell.note = f ? f.note : `Χαρακτηριστικό της ομάδας «${g.name}».${d?.isFilter ? " Χρησιμοποιείται και ως φίλτρο στο κατάστημα — γράψε την τιμή όπως στις προτάσεις της λίστας." : ""} Κενό = καμία αλλαγή.`;
    });

    // Γραμμές
    const catId = catOf.get(g.s1Id);
    const rowsHere = kind === "existing" ? items.filter((it) => it.specGroupS1Id === g.s1Id) : [];
    for (const it of rowsHere) {
      const v = itemValues(it, g);
      ws.addRow([...fields.map((f) => { const s = v.fields[f.key]; return f.kind !== "text" && s ? Number(s) : s; }), ...g.specs.map((d) => v.specs[d.name])]);
    }
    total += rowsHere.length;
    const last = Math.max(2, (kind === "existing" ? rowsHere.length + 1 : 1) + (kind === "existing" ? 20 : DATA_ROWS_NEW));
    // Κλειδωμένες (γκρι) στήλες στα υπάρχοντα: MTRL και κωδικός
    if (kind === "existing") for (let r = 2; r <= last; r++) for (const c of [1, 2]) ws.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: grey } };
    // Αριθμητικές στήλες: μόνο θετικοί αριθμοί
    fields.forEach((f, i) => {
      if (f.kind === "text" || f.key === "mtrl") return;
      const dv: ExcelJS.DataValidation = { type: f.kind === "int" ? "whole" : "decimal", operator: "between", formulae: [0, 100000], allowBlank: true, showErrorMessage: true, errorTitle: f.header, error: "Γράψε θετικό αριθμό (π.χ. 59,5)." };
      for (let r = 2; r <= last; r++) ws.getCell(r, i + 1).dataValidation = dv; // το exceljs τα ενώνει σε μία περιοχή
    });
    // Χαρακτηριστικά: λίστα με προτάσεις (τιμές του SoftOne + όσες ήδη χρησιμοποιούνται) — επιτρέπεται και δική σου τιμή
    g.specs.forEach((d, i) => {
      const used = new Map<string, number>();
      for (const p of products) if (p.categoryId === catId) for (const s of p.specs) if (plain(s.key) === plain(d.name) && s.value.length <= 60) used.set(s.value, (used.get(s.value) ?? 0) + 1);
      const values = [...new Set([...d.options.map((o) => o.name), ...[...used.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v)])].slice(0, 60);
      if (!values.length) return;
      listCol++;
      const lc = colName(listCol);
      values.forEach((v, k) => { lists.getCell(`${lc}${k + 1}`).value = v; });
      const dv: ExcelJS.DataValidation = { type: "list", allowBlank: true, formulae: [`_lists!$${lc}$1:$${lc}$${values.length}`], showErrorMessage: false, showInputMessage: true, promptTitle: d.name.slice(0, 32), prompt: "Διάλεξε από τη λίστα ή γράψε δική σου τιμή." };
      for (let r = 2; r <= last; r++) ws.getCell(r, fields.length + i + 1).dataValidation = dv;
    });
    // Υποχρεωτικό όνομα: κίτρινο φόντο στα κενά
    const nameCol = colName(fields.findIndex((f) => f.key === "name") + 1);
    ws.addConditionalFormatting({ ref: `${nameCol}2:${nameCol}${last}`, rules: [{ type: "expression", priority: 1, formulae: [`AND(LEN(${nameCol}2)=0,COUNTA($A2:$${colName(cols.length)}2)>0)`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: yellow } } } }] });
  }

  // Οδηγίες
  intro.columns = [{ width: 4 }, { width: 110 }];
  const lines: [string, boolean?][] = [
    [`${brand.name} — ${kind === "existing" ? "ενημέρωση υπαρχόντων προϊόντων" : "νέα προϊόντα"}`, true],
    [`Δημιουργήθηκε ${new Date().toLocaleString("el-GR")} · ${ordered.length} ${ordered.length === 1 ? "κατηγορία" : "κατηγορίες"}${kind === "existing" ? ` · ${total} προϊόντα` : ""}`],
    [""],
    ["Πώς συμπληρώνεται", true],
    ["• Κάθε φύλλο (κάτω) είναι μία κατηγορία προϊόντων. Οι στήλες δεξιά (μπλε) είναι τα χαρακτηριστικά της κατηγορίας."],
    ["• Μία γραμμή = ένα προϊόν. Το «Όνομα» είναι υποχρεωτικό. Στα κελιά των χαρακτηριστικών υπάρχει λίστα με προτάσεις — μπορείς να γράψεις και δική σου τιμή."],
    ["• Διαστάσεις σε εκατοστά, βάρος σε κιλά, εγγύηση σε μήνες. Δεκαδικά με κόμμα ή τελεία."],
    [kind === "existing" ? "• Μην αλλάξεις το MTRL και τον κωδικό (γκρι στήλες). Κενό κελί σημαίνει «καμία αλλαγή» — δεν σβήνει την τιμή που υπάρχει." : "• Ο «Κωδικός είδους» είναι προαιρετικός: αν μείνει κενός, χρησιμοποιείται ο κωδικός κατασκευαστή."],
    ["• Μην αλλάξεις τα ονόματα των φύλλων και των στηλών, και μην προσθέσεις στήλες — με αυτά αναγνωρίζουμε το αρχείο."],
    ["• Τα σχόλια (κόκκινο τρίγωνο) στις επικεφαλίδες εξηγούν κάθε στήλη."],
  ];
  lines.forEach(([t, bold], i) => { const c = intro.getCell(`B${i + 2}`); c.value = t; c.font = bold ? { bold: true, size: i === 0 ? 16 : 12, color: { argb: navy } } : { size: 11 }; c.alignment = { wrapText: true }; });
  metaWs.getCell("A1").value = JSON.stringify(meta);
  wb.views = [{ x: 0, y: 0, width: 12000, height: 8000, firstSheet: 0, activeTab: 0, visibility: "visible" }];

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = brand.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "brand";
  return { buffer, filename: `${slug}-${kind === "existing" ? "yparxonta" : "nea"}-${stamp}.xlsx`, rows: total };
}

// ---------- Ανάγνωση αρχείου ----------

export interface ParsedRow { sheet: string; rowNo: number; groupS1Id: number; fields: Partial<Record<FieldKey, string>>; specs: Record<string, string> }
export interface ParsedFile { meta: SheetMeta | null; rows: ParsedRow[]; warnings: string[]; sheets: { name: string; groupS1Id: number | null; group: string | null; rows: number; ignoredColumns: string[] }[] }

export const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("").trim();
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text).trim();
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return "";
  }
  return String(v).trim();
};

export async function parseWorkbook(buf: ArrayBuffer): Promise<ParsedFile> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const warnings: string[] = [];
  let meta: SheetMeta | null = null;
  try { const raw = cellText(wb.getWorksheet("_meta")?.getCell("A1").value ?? null); if (raw) meta = JSON.parse(raw) as SheetMeta; } catch { warnings.push("Δεν διαβάστηκαν τα στοιχεία του template — οι κατηγορίες αναγνωρίζονται από το όνομα του φύλλου."); }

  const sheets = wb.worksheets.filter((w) => !RESERVED.has(w.name) && w.state === "visible");
  const allGroups = await db.s1SpecGroup.findMany({ where: { missing: false }, select: { s1Id: true, name: true } });
  const ids = sheets.map((w) => meta?.sheets.find((s) => s.name === w.name)?.groupS1Id ?? allGroups.find((g) => plain(g.name).startsWith(plain(w.name)) || plain(w.name) === plain(g.name))?.s1Id).filter((x): x is number => x != null);
  const groups = await loadGroups(ids);
  const out: ParsedFile = { meta, rows: [], warnings, sheets: [] };

  for (const ws of sheets) {
    const gid = meta?.sheets.find((s) => s.name === ws.name)?.groupS1Id ?? allGroups.find((g) => plain(g.name).startsWith(plain(ws.name)) || plain(ws.name) === plain(g.name))?.s1Id ?? null;
    const g = gid != null ? groups.get(gid) : undefined;
    const info = { name: ws.name, groupS1Id: g ? g.s1Id : null, group: g?.name ?? null, rows: 0, ignoredColumns: [] as string[] };
    out.sheets.push(info);
    if (!g) { warnings.push(`Φύλλο «${ws.name}»: η κατηγορία δεν υπάρχει πια στο SoftOne — αγνοείται.`); continue; }
    // Στήλες: βασικά πεδία ή χαρακτηριστικά της ομάδας ΟΠΩΣ ΕΙΝΑΙ ΤΩΡΑ
    const map = new Map<number, { field?: FieldKey; spec?: string }>();
    ws.getRow(1).eachCell((cell, col) => {
      const h = plain(cellText(cell.value)); if (!h) return;
      const f = FIELDS.find((x) => plain(x.header) === h);
      if (f) { map.set(col, { field: f.key }); return; }
      const d = g.specs.find((s) => plain(s.name) === h);
      if (d) map.set(col, { spec: d.name }); else info.ignoredColumns.push(cellText(cell.value));
    });
    if (info.ignoredColumns.length) warnings.push(`Φύλλο «${ws.name}»: ${info.ignoredColumns.length === 1 ? "η στήλη" : "οι στήλες"} ${info.ignoredColumns.map((c) => `«${c}»`).join(", ")} δεν ${info.ignoredColumns.length === 1 ? "είναι" : "είναι"} πια χαρακτηριστικ${info.ignoredColumns.length === 1 ? "ό" : "ά"} της κατηγορίας — αγνοούνται.`);
    ws.eachRow({ includeEmpty: false }, (row, rowNo) => {
      if (rowNo === 1) return;
      const r: ParsedRow = { sheet: ws.name, rowNo, groupS1Id: g.s1Id, fields: {}, specs: {} };
      let any = false;
      for (const [col, m] of map) {
        const t = cellText(row.getCell(col).value); if (!t) continue;
        any = true;
        if (m.field) r.fields[m.field] = t; else if (m.spec) r.specs[m.spec] = t;
      }
      if (any) { out.rows.push(r); info.rows++; }
    });
  }
  return out;
}

// ---------- Περιγραφή (memo) με χαρακτηριστικά ----------

/**
 * Γράφει τιμές χαρακτηριστικών στην αναλυτική περιγραφή: αλλάζει τη γραμμή «Ετικέτα : τιμή» που υπάρχει, αλλιώς
 * προσθέτει νέα στο τέλος. Με νέο ελεύθερο κείμενο, το κείμενο αντικαθίσταται και οι γραμμές χαρακτηριστικών μπαίνουν από κάτω.
 */
export function composeMemo(current: string, specs: { label: string; value: string }[], newText?: string): string {
  let lines = current.replace(/\r\n?/g, "\n").split("\n");
  for (const s of specs) {
    const i = lines.findIndex((l) => { const m = SPEC_LINE.exec(l.trim()); return !!m && plain(m[1]) === plain(s.label); });
    if (i >= 0) { const m = SPEC_LINE.exec(lines[i].trim())!; lines[i] = `${m[1].trim()} : ${s.value}`; }
    else { while (lines.length && !lines[lines.length - 1].trim()) lines.pop(); lines.push(`${s.label} : ${s.value}`); }
  }
  if (newText != null) {
    const parsed = parseDescription(lines.join("\n"));
    lines = [...newText.replace(/\r\n?/g, "\n").trim().split("\n"), ...(parsed.specs.length ? ["", ...parsed.specs.map((s) => `${s.key} : ${s.value}`)] : [])];
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export const memoIsHtml = isHtml;
