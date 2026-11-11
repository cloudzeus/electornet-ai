/** Τελευταία επιλογή παράδοσης του επισκέπτη (σελίδα προϊόντος ↔ ταμείο), μόνο στον browser. */
export interface PickupPref { where: "store" | "home"; storeId?: string }
const K = "euronics.pickup";

export function readPickup(): PickupPref | null {
  try { return JSON.parse(localStorage.getItem(K) ?? "null") as PickupPref | null; } catch { return null; }
}
export function savePickup(p: PickupPref) {
  try { localStorage.setItem(K, JSON.stringify(p)); } catch {}
}
