/**
 * Τιμή web (MTREXTRA.NUM04) — καθαρές αποφάσεις για την εγγραφή της (χωρίς δίκτυο): ποια γραμμή MTREXTRA είναι του είδους
 * και αν μετά την εγγραφή άλλαξε ΟΤΙΔΗΠΟΤΕ άλλο εκτός από το NUM04 (τα EditList του SoftOne μπορεί να ξαναγράφουν όλη τη γραμμή).
 */
/** Οι στήλες του MTREXTRA που διαβάζονται με GetTable (από getTableFields ITEM/ITEEXTRA· τα LOADATTRIBUTES, CPV δίνουν σφάλμα στο GetTable). */
export const EXTRA_COLS = ["VARCHAR01", "VARCHAR02", "VARCHAR03", "VARCHAR04", "VARCHAR05", "NUM01", "NUM02", "NUM03", "NUM04", "NUM05", "UTBL01", "UTBL02", "UTBL03", "UTBL04", "UTBL05", "DATE01", "DATE02", "DATE03", "DATE04", "DATE05", "BOOL01", "BOOL02", "BOOL03", "BOOL04", "PRINTLABEL", "SOESHOP", "CPVCODE", "MTRATTRIBUTEG", "ISLOTIFY", "EUDRREFERENCE", "EUDRVERIFICATION"] as const;
/** Τα πεδία του GetTable με τη σειρά: MTRL, COMPANY, …EXTRA_COLS */
export const EXTRA_FIELDS = ["MTRL", "COMPANY", ...EXTRA_COLS];
export type ExtraRow = Record<string, string>;
export const MANY_ROWS = "Βρέθηκαν πολλές γραμμές MTREXTRA για το είδος — η τιμή web δεν γράφεται.";

/** Η γραμμή MTREXTRA του είδους για την εταιρεία της συνεδρίας: καμία → null· μία → αυτή (αν είναι της εταιρείας)· πολλές → μόνο αν μία είναι της εταιρείας. */
export function pickExtraRow(rows: string[][], mtrl: number, company: string): { row: ExtraRow | null; error?: undefined } | { row?: undefined; error: string } {
  const mine = rows.filter((r) => Number(r[0]) === mtrl);
  if (!mine.length) return { row: null };
  const co = company.trim();
  const pick = mine.length === 1 && (!co || mine[0][1] === co) ? mine : co ? mine.filter((r) => r[1] === co) : [];
  if (pick.length !== 1) return { error: mine.length > 1 ? MANY_ROWS : `Η γραμμή MTREXTRA του είδους είναι άλλης εταιρείας (${mine[0][1]}) — η τιμή web δεν γράφεται.` };
  return { row: Object.fromEntries(EXTRA_FIELDS.map((f, i) => [f, (pick[0][i] ?? "").trim()])) };
}

/** 0 / 0.0 / κενό = ίδια (νέα γραμμή MTREXTRA έχει 0 στους αριθμούς και κενό στα κείμενα). */
const same = (v: string | undefined) => { const s = (v ?? "").trim(); return /^0+(?:[.,]0*)?$/.test(s) ? "" : s; };

/** Ποιες στήλες εκτός από το NUM04 άλλαξαν (πριν null = δεν υπήρχε γραμμή → όλες πρέπει να είναι κενές/0). */
export function extraDiff(before: ExtraRow | null, after: ExtraRow): { col: string; from: string; to: string }[] {
  return EXTRA_COLS.filter((c) => c !== "NUM04" && same(before?.[c]) !== same(after[c])).map((c) => ({ col: c, from: before?.[c] ?? "", to: after[c] ?? "" }));
}
