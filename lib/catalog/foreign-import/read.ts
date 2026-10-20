import "server-only";
import ExcelJS from "exceljs";
import iconv from "iconv-lite";
import { db } from "@/lib/db";
import { cellText } from "@/lib/catalog/supplier-sheet";
import { configToSaved, headerSignature, parseCsv, type MappingConfig, type SavedConfig } from "@/lib/catalog/foreign-import/core";

/**
 * Ανάγνωση ξένου αρχείου (xlsx / csv) σε πίνακα κειμένων και αποθηκευμένες αντιστοιχίσεις στηλών ανά υπογραφή επικεφαλίδων.
 * Ο πίνακας κρατά τους αριθμούς γραμμών του Excel (index 0 = γραμμή 1): οι κενές γραμμές είναι [].
 */
export type Sheet = { name: string; matrix: string[][] };

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_ROWS = 5000;
const BAD_TYPE = "Το αρχείο πρέπει να είναι .xlsx ή .csv — άνοιξέ το στο Excel και αποθήκευσέ το ως .xlsx.";

const nonEmpty = (r: string[]) => r.some((c) => c);

/** Όριο γραμμών: μη κενές γραμμές μείον μία (επικεφαλίδα) — απλό και συντηρητικό. */
function checkRows(sheets: Sheet[]) {
  for (const s of sheets) if (s.matrix.filter(nonEmpty).length - 1 > MAX_ROWS) throw new Error("Το αρχείο έχει πάνω από 5.000 γραμμές.");
}

async function readXlsx(buf: ArrayBuffer): Promise<Sheet[]> {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf as unknown as ExcelJS.Buffer); } catch { throw new Error("Το αρχείο δεν διαβάζεται ως .xlsx — ίσως είναι κατεστραμμένο ή προστατευμένο με κωδικό."); }
  const sheets: Sheet[] = [];
  for (const ws of wb.worksheets) {
    if (ws.name === "_meta") continue;
    const matrix: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNo) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell, col) => { const t = cellText(cell.value); if (t) { while (cells.length < col - 1) cells.push(""); cells[col - 1] = t; } });
      if (!cells.length) return;
      while (matrix.length < rowNo - 1) matrix.push([]); // κενές γραμμές ανάμεσα → [] ώστε index = γραμμή Excel − 1
      matrix[rowNo - 1] = cells;
    });
    if (matrix.some(nonEmpty)) sheets.push({ name: ws.name, matrix });
  }
  return sheets;
}

function readCsv(buf: ArrayBuffer, fileName: string): Sheet[] {
  let text = new TextDecoder("utf-8").decode(buf);
  if (text.includes("�")) text = iconv.decode(Buffer.from(buf), "win1253"); // όχι έγκυρο UTF-8 → ελληνικό Excel (ANSI)
  const matrix = parseCsv(text);
  while (matrix.length && !nonEmpty(matrix[matrix.length - 1])) matrix.pop();
  if (!matrix.length) return [];
  return [{ name: fileName.replace(/^.*[\\/]/, "").replace(/\.csv$/i, "") || "csv", matrix }];
}

/** Διαβάζει .xlsx (όλα τα φύλλα με περιεχόμενο) ή .csv (ένα φύλλο, διαχωριστής `;` `,` ή tab). Άλλος τύπος ή υπέρβαση ορίων → Error με ελληνικό μήνυμα. */
export async function readWorkbook(buf: ArrayBuffer, fileName: string): Promise<{ sheets: Sheet[] }> {
  const ext = /\.([^./\\]+)$/.exec(fileName)?.[1]?.toLowerCase();
  if (ext !== "xlsx" && ext !== "csv") throw new Error(BAD_TYPE);
  if (buf.byteLength > MAX_BYTES) throw new Error("Το αρχείο ξεπερνά τα 15 MB.");
  const sheets = ext === "xlsx" ? await readXlsx(buf) : readCsv(buf, fileName);
  checkRows(sheets);
  return { sheets };
}

// ---------- Αποθηκευμένες αντιστοιχίσεις ----------

export type StoredMapping = { id: string; name: string; headerSignature: string; config: SavedConfig; createdById: string | null; createdAt: Date; updatedAt: Date };

/** Αποθηκεύει την αντιστοίχιση στηλών (με κλειδί επικεφαλίδας). Ίδια υπογραφή επικεφαλίδων → ενημέρωση ονόματος/ρυθμίσεων της υπάρχουσας. */
export async function saveMapping(name: string, headers: string[], config: MappingConfig, staffId: string | null): Promise<StoredMapping> {
  const signature = headerSignature(headers);
  const data = { name, config: configToSaved(config, headers) as object };
  const existing = await db.importMapping.findFirst({ where: { headerSignature: signature }, orderBy: { updatedAt: "desc" } });
  const row = existing
    ? await db.importMapping.update({ where: { id: existing.id }, data })
    : await db.importMapping.create({ data: { ...data, headerSignature: signature, createdById: staffId } });
  return row as unknown as StoredMapping;
}

/** Η αποθηκευμένη αντιστοίχιση για αυτές τις επικεφαλίδες (ίδια υπογραφή), ή null. Δείκτες στηλών: `configForHeaders(m.config, headers)`. */
export async function findMapping(headers: string[]): Promise<StoredMapping | null> {
  const signature = headerSignature(headers);
  if (!signature) return null;
  const row = await db.importMapping.findFirst({ where: { headerSignature: signature }, orderBy: { updatedAt: "desc" } });
  return row as unknown as StoredMapping | null;
}
