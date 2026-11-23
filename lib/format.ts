const eur = new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
const eurInt = new Intl.NumberFormat("el-GR", { maximumFractionDigits: 0 });

/** 449 → "449 €" (design: whole euros in cards) */
/** Προϊόν της βάσης χωρίς τιμή ακόμη (Product.noPrice → price 0): ποτέ «0 €» στην οθόνη. */
/** Αδιάσπαστο κενό ανάμεσα σε ποσό και «€»: το σύμβολο δεν πέφτει ποτέ μόνο του στην επόμενη γραμμή. */
const NB = "\u00a0";
export const NO_PRICE = "Τιμή στο κατάστημα";
export function priceShort(v: number) {
  if (!(v > 0)) return NO_PRICE;
  return Number.isInteger(v) ? `${eurInt.format(v)}${NB}€` : eur.format(v).replace(/\s/g, NB);
}
/** 449 → "449,00 €" */
export function priceLong(v: number) {
  if (!(v > 0)) return NO_PRICE;
  return eur.format(v).replace(/\s/g, NB);
}
export function discountPct(price: number, was?: number) {
  if (!was || was <= price) return null;
  return Math.round(((was - price) / was) * 100);
}
/** n ίσες μηνιαίες δόσεις, στρογγυλεμένες στο λεπτό. */
export function instalment(price: number, months = 12) {
  return Math.round((price / months) * 100) / 100;
}
/**
 * Άτοκες δόσεις με κάρτα: οι περισσότερες που δίνουμε για ένα ποσό (1 = χωρίς δόσεις).
 * Μία κλίμακα για σελίδα προϊόντος, καλάθι, ταμείο και server· cap = το όριο των ρυθμίσεων πληρωμών.
 */
export function maxInstalments(amount: number, cap = 24) {
  const n = amount >= 800 ? 24 : amount >= 400 ? 12 : amount >= 200 ? 6 : amount >= 100 ? 3 : 1;
  return Math.max(1, Math.min(n, Math.floor(cap)));
}
/** «12 άτοκες δόσεις × 33,25 €» (short: «12 × 33,25 €») με τις περισσότερες δόσεις του ποσού· null όταν δεν βγαίνει σε δόσεις. */
export function instalmentLine(amount: number, short = false) {
  const n = maxInstalments(amount);
  return n > 1 ? `${n}${short ? "" : " άτοκες δόσεις"} × ${priceLong(instalment(amount, n))}` : null;
}
export function weekday(d: Date) {
  return new Intl.DateTimeFormat("el-GR", { weekday: "short", day: "numeric", month: "numeric" }).format(d);
}
