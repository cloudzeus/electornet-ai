/**
 * Συσκευές & εγγυήσεις από ένα παραστατικό του SoftOne — καθαρή λογική (χωρίς βάση), κοινή για τον συγχρονισμό και τον
 * επανυπολογισμό. Τι δείχνουν τα δεδομένα:
 *  - Το GUARTIME των ειδών είναι κενό → η εγγύηση κατασκευαστή έρχεται από τα χαρακτηριστικά του προϊόντος
 *    («Εγγύηση: 5 χρόνια»), αλλιώς η νόμιμη 2ετής.
 *  - Η «Επέκταση εγγύησης» (είδος ΕΓΓΥΗΣΗ) είναι μία γραμμή ανά καλυπτόμενη συσκευή και κοστίζει 15,5 % της τιμής της →
 *    δένεται με τη συσκευή που ταιριάζει στην τιμή (όχι με όλες τις συσκευές του παραστατικού).
 */
export const DEVICE_MIN_PRICE = 50; // κάτω από αυτό: αξεσουάρ / αναλώσιμα, όχι συσκευή
export const LEGAL_WARRANTY = 24;
/** Η επέκταση επί πληρωμή είναι +24 μήνες (όπως στο e-shop), εκτός αν η γραμμή γράφει άλλη διάρκεια. */
export const EXTENSION_MONTHS = 24;
export const EXTENSION_RATE = 0.155;

export function isExtensionLine(title: string, code?: string | null) {
  return code === "ΕΓΓΥΗΣΗ" || /επ[εέ]κτασ\S*\s+εγγ[υύ]ησ|extended\s+warranty/i.test(title);
}
/** Διάρκεια επέκτασης από τον τίτλο («+3 έτη», «2 years») σε μήνες, αλλιώς η προεπιλογή. */
export function extensionMonths(title: string) {
  const m = /(\d)\s*(?:ετ|έτ|χρ|years?|y\b)/i.exec(title) ?? /\+\s*(\d)/.exec(title);
  return m ? Number(m[1]) * 12 : EXTENSION_MONTHS;
}

export type PlanLine = { lineNo: number; mtrl: number | null; code: string | null; title: string; qty: number; unitPrice: number | null; productId?: string | null };
export type PlannedDevice = { lineNo: number; unit: number; months: number; extMonths: number | null; extPlan: string | null };

/**
 * Ποιες γραμμές είναι συσκευές (ανά τεμάχιο, έως 5), η εγγύηση κατασκευαστή καθεμιάς και ποια παίρνει επέκταση.
 * `warrantyOf(line)` = μήνες κατασκευαστή (GUARTIME ή χαρακτηριστικά) ή null.
 */
export function planDevices(lines: PlanLine[], warrantyOf: (l: PlanLine) => number | null): PlannedDevice[] {
  const devices: PlannedDevice[] = [];
  for (const l of lines) {
    if (!l.mtrl || (l.unitPrice ?? 0) < DEVICE_MIN_PRICE || isExtensionLine(l.title, l.code)) continue;
    const months = warrantyOf(l) || LEGAL_WARRANTY;
    for (let u = 1; u <= Math.min(5, Math.max(1, Math.round(l.qty))); u++) devices.push({ lineNo: l.lineNo, unit: u, months, extMonths: null, extPlan: null });
  }
  // κάθε τεμάχιο επέκτασης → η συσκευή χωρίς επέκταση με την πιο κοντινή τιμή (≈ 15,5 %)· αν υπάρχει μόνο μία συσκευή, αυτή
  const priceOf = new Map(lines.map((l) => [l.lineNo, l.unitPrice ?? 0]));
  for (const e of lines.filter((l) => isExtensionLine(l.title, l.code))) {
    for (let k = 0; k < Math.max(1, Math.round(e.qty)); k++) {
      const free = devices.filter((d) => d.extMonths == null);
      if (!free.length) break;
      const want = (e.unitPrice ?? 0) / EXTENSION_RATE;
      const best = free.map((d) => ({ d, diff: Math.abs((priceOf.get(d.lineNo) ?? 0) - want) })).sort((a, b) => a.diff - b.diff)[0];
      const ok = devices.length === 1 || (want > 0 && best.diff <= Math.max(2, want * 0.03));
      if (!ok) continue;
      best.d.extMonths = extensionMonths(e.title);
      best.d.extPlan = e.title;
    }
  }
  return devices;
}
