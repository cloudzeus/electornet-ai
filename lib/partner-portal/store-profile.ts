/** Τι μπορεί να αλλάξει ένα μέλος στο κατάστημά του (κοινό server/client) και οι έλεγχοι. */
export const DAYS = [[1, "Δευτέρα"], [2, "Τρίτη"], [3, "Τετάρτη"], [4, "Πέμπτη"], [5, "Παρασκευή"], [6, "Σάββατο"], [0, "Κυριακή"]] as const;
export const STORE_SERVICES: { key: string; label: string; help: string }[] = [
  { key: "click-collect", label: "Παραλαβή παραγγελιών eshop", help: "Οι πελάτες διαλέγουν το κατάστημα στο checkout." },
  { key: "installation", label: "Εγκατάσταση από τεχνικό", help: "Κλιματιστικά, εντοιχιζόμενα, τηλεοράσεις." },
  { key: "service-point", label: "Σημείο service / επισκευών", help: "Παραλαβή συσκευών για επισκευή." },
  { key: "recycling", label: "Ανακύκλωση παλιάς συσκευής", help: "Παραλαβή ΑΗΗΕ." },
  { key: "delivery", label: "Παράδοση κατ' οίκον", help: "Από το κατάστημα στο σπίτι." },
  { key: "parking", label: "Parking", help: "Χώρος στάθμευσης πελατών." },
  { key: "showroom", label: "Showroom / έκθεση", help: "Μεγάλη έκθεση συσκευών." },
  { key: "b2b", label: "Επαγγελματικές πωλήσεις", help: "Τιμολόγηση σε επιχειρήσεις." },
];
export type Hours = { day: number; open: string; close: string }[];
export type StoreProfile = { phone: string; mobile: string; email: string; hours: Hours; services: string[]; notes: string };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export function checkProfile(p: StoreProfile) {
  const errors: Record<string, string> = {};
  const digits = (s: string) => s.replace(/[\s.-]/g, "");
  if (p.phone && !/^(\+30)?2\d{9}$/.test(digits(p.phone))) errors.phone = "Σταθερό 10 ψηφίων που ξεκινά από 2";
  if (p.mobile && !/^(\+30)?69\d{8}$/.test(digits(p.mobile))) errors.mobile = "Κινητό 10 ψηφίων που ξεκινά από 69";
  if (!p.phone && !p.mobile) errors.phone = "Χρειάζεται τουλάχιστον ένα τηλέφωνο για τους πελάτες";
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.email.trim())) errors.email = "Το email δεν φαίνεται σωστό";
  for (const h of p.hours) {
    if (!TIME.test(h.open) || !TIME.test(h.close)) errors[`h${h.day}`] = "Ώρα σε μορφή ΩΩ:ΛΛ";
    else if (h.close <= h.open) errors[`h${h.day}`] = "Το κλείσιμο πρέπει να είναι μετά το άνοιγμα";
  }
  if (!p.hours.length) errors.hours = "Δήλωσε τουλάχιστον μία ημέρα λειτουργίας";
  if (p.notes.length > 600) errors.notes = "Έως 600 χαρακτήρες";
  return errors;
}
export const hoursOf = (v: unknown): Hours => (Array.isArray(v) ? (v as Hours).filter((h) => typeof h?.day === "number") : []);
export const servicesOf = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]).filter((s) => typeof s === "string") : []);
