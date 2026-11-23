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
 * Μία κλίμακα για σελίδα προϊόντος, καλάθι, ταμείο και server, μέχρι το όριο των ρυθμίσεων πληρωμών (cap).
 */
const INSTALMENT_STEPS: [min: number, months: number][] = [[800, 24], [400, 12], [200, 6], [100, 3]];
// shortcut: κοινή τιμή του process, όπως τα κείμενα UI (setCopy)· το πρώτο αίτημα μετά από εκκίνηση μπορεί να δει 24 για μια στιγμή
let CAP = 24;
/** Το όριο από Ρυθμίσεις › Πληρωμές › «Μέγιστες άτοκες δόσεις» (0 = χωρίς δόσεις). Το ορίζουν το getSettings (server) και το SettingsProvider (browser). */
export function setInstalmentCap(n: number) { CAP = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 24; }
export function maxInstalments(amount: number, cap = CAP) {
  const n = INSTALMENT_STEPS.find(([min]) => amount >= min)?.[1] ?? 1;
  return Math.max(1, Math.min(n, Math.floor(cap)));
}
/** «3 από 100 €, 6 από 200 €, 12 από 400 €»: η κλίμακα μέχρι το όριο των ρυθμίσεων, για κείμενα· "" όταν δεν δίνονται δόσεις. */
export function instalmentScale(cap = CAP) {
  return INSTALMENT_STEPS.filter(([, n]) => n <= cap).reverse().map(([min, n]) => `${n} από ${min} €`).join(", ");
}
/** «12 άτοκες δόσεις × 33,25 €» (short: «12 × 33,25 €») με τις περισσότερες δόσεις του ποσού· null όταν δεν βγαίνει σε δόσεις. */
export function instalmentLine(amount: number, short = false) {
  const n = maxInstalments(amount);
  return n > 1 ? `${n}${short ? "" : " άτοκες δόσεις"} × ${priceLong(instalment(amount, n))}` : null;
}
export function weekday(d: Date) {
  return new Intl.DateTimeFormat("el-GR", { weekday: "short", day: "numeric", month: "numeric" }).format(d);
}
