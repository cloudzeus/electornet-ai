/** Καθαρές συναρτήσεις της αναφοράς δραστηριότητας προσωπικού (χωρίς βάση — ελέγχονται στο core.test.ts). */

const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" });
/** Ημέρα στην ώρα Ελλάδας, "2026-11-13". */
export const athensDay = (d: Date) => DAY.format(d);

/**
 * Πόσα δευτερόλεπτα πιστώνει ένα ping, με βάση το προηγούμενο ping του ίδιου ατόμου.
 * <45″: δεύτερη καρτέλα ή διπλό ping → 0 (να μη μετρηθεί δύο φορές).
 * ≤150″: συνεχόμενη παρουσία → ο πραγματικός χρόνος που πέρασε.
 * αλλιώς: νέα έναρξη μετά από διάλειμμα → 30″ (το διάλειμμα δεν μετρά).
 */
export function creditSeconds(msSinceLastPing: number): number {
  if (msSinceLastPing < 45_000) return 0;
  if (msSinceLastPing <= 150_000) return Math.round(msSinceLastPing / 1000);
  return 30;
}

/** "7 ώ 25 λ" / "25 λ" / "<1 λ" */
export function fmtDuration(seconds: number): string {
  if (seconds <= 0) return "0 λ";
  const m = Math.round(seconds / 60);
  if (m < 1) return "<1 λ";
  return m >= 60 ? `${Math.floor(m / 60)} ώ ${m % 60} λ` : `${m} λ`;
}

/** Όλες οι ημέρες από..έως (συμπεριλαμβανομένων), το πολύ `max`. */
export function daysBetween(from: string, to: string, max = 92): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T12:00:00Z`); out.length < max && d.toISOString().slice(0, 10) <= to; d = new Date(d.getTime() + 86_400_000)) out.push(d.toISOString().slice(0, 10));
  return out;
}

const AREAS: Record<string, string> = {
  catalog: "Κατάλογος", category: "Κατάλογος", customField: "Κατάλογος", eprel: "Κατάλογος", keyvoto: "Κατάλογος", cms: "Περιεχόμενο", media: "Πολυμέσα", campaign: "Καμπάνιες", promo: "Προσφορές",
  orders: "Παραγγελίες", order: "Παραγγελίες", staff: "Χρήστες", role: "Ρόλοι", store: "Καταστήματα", brand: "Μάρκες", competitor: "Ανταγωνισμός", ar: "AR", newsletter: "Newsletter",
  b2b: "Συνεργάτες", partner: "Συνεργάτες", softone: "SoftOne", sticker: "Stickers", security: "Ασφάλεια", backup: "Backups", shipping: "Αποστολές", carrier: "Αποστολές", services: "Υπηρεσίες",
  settings: "Ρυθμίσεις", ai: "AI", wishlist: "Wishlist", voice: "Ερμής", customer: "Πελάτες", customers: "Πελάτες", gdpr: "GDPR",
};
const VERBS: Record<string, string> = {
  create: "δημιουργία", add: "προσθήκη", update: "αλλαγή", edit: "αλλαγή", save: "αποθήκευση", delete: "διαγραφή", remove: "αφαίρεση", publish: "δημοσίευση", approve: "έγκριση", reject: "απόρριψη",
  run: "εκτέλεση", rerun: "επανεκτέλεση", import: "εισαγωγή", export: "εξαγωγή", apply: "εφαρμογή", archive: "αρχειοθέτηση", download: "λήψη", enable: "ενεργοποίηση", disable: "απενεργοποίηση", upload: "ανέβασμα",
};
/** Κωδικός audit → απλά ελληνικά: "cms.hero.publish" → { area: "Περιεχόμενο", text: "hero · δημοσίευση" }. */
export function describeAction(action: string): { area: string; text: string } {
  const parts = action.split(".");
  const area = AREAS[parts[0]] ?? parts[0];
  const last = parts.at(-1)!;
  const verb = parts.length > 1 ? VERBS[last] : undefined;
  const middle = parts.slice(1, verb ? -1 : undefined).join(" ");
  return { area, text: [middle, verb].filter(Boolean).join(" · ") || action };
}
