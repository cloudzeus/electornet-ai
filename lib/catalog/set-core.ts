/**
 * Σετ ειδών ως προϊόντα — καθαρή λογική (χωρίς βάση): κωδικοί, τιμή, απόθεμα, «Πωλείται και μόνο του», τίτλος.
 * Στο SoftOne το σετ δεν έχει τιμή: το κύριο είδος έχει την τιμή όλου του σετ και τα μέλη 0, οπότε το άθροισμα των
 * μελών ισούται με την τιμή του κύριου. Προδιαγραφή: docs/superpowers/specs/2026-10-16-item-sets-design.md
 */
const SET_PREFIX = "SET-";

export const setErp = (spcs: number) => `${SET_PREFIX}${spcs}`;
export function spcsOf(erpCode: string | null | undefined): number | null {
  if (!erpCode?.startsWith(SET_PREFIX)) return null;
  const n = Number(erpCode.slice(SET_PREFIX.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Τιμή σετ με ΦΠΑ = τιμή web του κύριου είδους × την ποσότητά του. Έτσι είναι στημένο το SoftOne: το κύριο έχει την τιμή
 * όλου του σετ και στο παραστατικό τα υπόλοιπα μέλη (εξαρτήματα, δώρα) γράφονται με 0 — άρα το «άθροισμα των μελών».
 * Διπλή γραμμή κύριου (λάθος στο ERP) μετρά μία φορά.
 */
export function setPrice(members: { price: number | null; qty: number; isMain?: boolean }[], kind: "parts" | "gift" = "parts"): number {
  void kind;
  const main = members.find((m) => m.isMain);
  const sum = main ? (main.price ?? 0) * (main.qty || 1) : 0;
  return Math.round((sum + Number.EPSILON) * 100) / 100;
}

/** Έγκυρο σετ: περιέχει το κύριο είδος και τουλάχιστον ένα άλλο. */
export const validSet = (lines: { mtrl: number }[], main: number) => lines.some((l) => l.mtrl === main) && lines.some((l) => l.mtrl !== main);

/** Πόσα πλήρη σετ βγαίνουν από το απόθεμα των μελών. Και στα σετ με δώρο το δώρο απαιτείται. */
export function setStock(members: { stock: number; qty: number; isMain: boolean }[], kind: "parts" | "gift"): number {
  void kind;
  if (!members.length) return 0;
  return Math.max(0, Math.min(...members.map((m) => Math.floor(Math.max(0, m.stock) / (m.qty || 1)))));
}

/** «Πωλείται και μόνο του»: yes / no ρητά από τη διαχείριση· auto → όχι μόνο όταν είναι κύριο σε σετ εξαρτημάτων. */
export const soldAloneFor = (mode: string, mainOfParts: boolean) => (mode === "yes" ? true : mode === "no" ? false : !mainOfParts);

/** Τίτλος προϊόντος-σετ: το όνομα του SoftOne, χωρίς διπλά κενά, με τη μάρκα μία φορά. */
export function setTitle(name: string, brand: string): string {
  const t = name.replace(/\s+/g, " ").trim();
  const plain = (s: string) => s.toLocaleLowerCase("el-GR").normalize("NFD").replace(/[̀-ͯ]/g, "");
  return plain(t).includes(plain(brand)) ? t : `${brand} ${t}`;
}

export type SetPart = { mtrl: number; qty: number; name: string; main: boolean };
/** Τα μέλη ενός σετ όπως αποθηκεύονται στη γραμμή παραγγελίας (για το παραστατικό): κύριο πρώτο, χωρίς διπλές γραμμές του κύριου. */
export function setPartsSnapshot(set: { mtrl: number; lines: { mtrl: number; qty: number; name: string }[] }): SetPart[] {
  const main = set.lines.find((l) => l.mtrl === set.mtrl);
  return [
    ...(main ? [{ mtrl: main.mtrl, qty: main.qty || 1, name: main.name, main: true }] : []),
    ...set.lines.filter((l) => l.mtrl !== set.mtrl).map((l) => ({ mtrl: l.mtrl, qty: l.qty || 1, name: l.name, main: false })),
  ];
}
