/**
 * Οι ώρες που μπορεί να καλέσει το συνεργαζόμενο κατάστημα για να κανονίσετε την παράδοση: ωράριο 09:00–17:00, ανά
 * ώρα. Ο πελάτης διαλέγει όσες τον βολεύουν (καμία = οποιαδήποτε). Δεν δεσμεύουν ώρα παράδοσης — αυτή συμφωνείται
 * στο τηλέφωνο. Ο ίδιος κατάλογος στο ταμείο και στον έλεγχο του server.
 */
export const DELIVERY_HOURS = Array.from({ length: 8 }, (_, i) => `${String(9 + i).padStart(2, "0")}:00–${String(10 + i).padStart(2, "0")}:00`);

/** Καθαρές ώρες από ό,τι έστειλε ο browser: μόνο ώρες του ωραρίου, χωρίς διπλές, σε σειρά. */
export function cleanSlots(v: unknown): string[] {
  const all = Array.isArray(v) ? v : [];
  return [...new Set(all.filter((x): x is string => typeof x === "string" && DELIVERY_HOURS.includes(x)))].sort();
}
