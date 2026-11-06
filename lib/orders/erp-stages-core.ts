/**
 * Ενημέρωση πελάτη από τα στάδια της παραγγελίας στο SoftOne — καθαρή λογική (χωρίς I/O).
 * Ο διαχειριστής διαλέγει στις «Ρυθμίσεις ενημέρωσης» ποιοι τύποι παραστατικών στέλνουν email και με ποιο κείμενο.
 */
export interface StageType { fprms: string; notify: boolean; title: string | null; message: string | null }
export interface StageDoc { findoc: number; fprms: string | null; docNo: string; date: string }

/** Οι μεταβλητές που γράφει ο διαχειριστής στο κείμενο. */
export const PLACEHOLDERS = [
  { key: "όνομα", help: "Το μικρό όνομα του πελάτη" },
  { key: "παραγγελία", help: "Ο αριθμός της παραγγελίας στο eshop" },
  { key: "παραστατικό", help: "Ο αριθμός του παραστατικού στο SoftOne (π.χ. της απόδειξης)" },
  { key: "ημερομηνία", help: "Η ημερομηνία του παραστατικού" },
] as const;

export function fillMessage(text: string, vars: Record<string, string>) {
  return text.replace(/\{([^{}]+)\}/g, (m, k: string) => vars[k.trim()] ?? m);
}

/** Παλαιότερα παραστατικά δεν στέλνουν email (π.χ. την πρώτη φορά που ανοίγει η λειτουργία ή ο τύπος). */
export const MAX_AGE_DAYS = 2;

/**
 * Ποια παραστατικά είναι καινούργια (για καταγραφή) και ποια από αυτά στέλνουν email.
 * - η ρίζα (η ίδια η παραγγελία) ποτέ: ο πελάτης έχει ήδη την επιβεβαίωση του checkout
 * - μόνο επιλεγμένοι τύποι με κείμενο, μόνο πρόσφατα, και μία φορά ανά τύπο σε κάθε παραγγελία
 */
export function decide(input: { root: number; docs: StageDoc[]; seen: { findoc: number; fprms: string | null; notified: boolean }[]; types: StageType[]; today: string }) {
  const seenIds = new Set(input.seen.map((s) => s.findoc));
  const sentTypes = new Set(input.seen.filter((s) => s.notified && s.fprms).map((s) => s.fprms!));
  const byType = new Map(input.types.map((t) => [t.fprms, t]));
  const fresh = input.docs.filter((d) => !seenIds.has(d.findoc));
  const notify: StageDoc[] = [];
  for (const d of [...fresh].sort((a, b) => a.date.localeCompare(b.date) || a.findoc - b.findoc)) {
    const t = d.fprms ? byType.get(d.fprms) : undefined;
    if (d.findoc === input.root || !t?.notify || !t.message?.trim() || sentTypes.has(d.fprms!)) continue;
    if ((Date.parse(input.today) - Date.parse(d.date)) / 864e5 > MAX_AGE_DAYS) continue;
    sentTypes.add(d.fprms!);
    notify.push(d);
  }
  return { fresh, notify };
}
