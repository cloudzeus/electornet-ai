/**
 * Viva Smart Checkout — ό,τι δεν χρειάζεται δίκτυο: τρόποι πληρωμής (ids της Viva για το `paymentMethod` του
 * redirect), διευθύνσεις demo/live, αξιολόγηση συναλλαγής. Κοινό για server και browser.
 * Τεκμηρίωση: developer.viva.com → Smart Checkout (pre-selected payment method), Webhooks for payments.
 */
export type VivaMode = "test" | "live";
/** Οι τρόποι του δικού μας checkout που πληρώνονται μέσω Viva. Ο πελάτης μπορεί να αλλάξει τρόπο στη σελίδα της Viva. */
export const VIVA_METHODS = { card: 0, apple: 20, google: 21, paypal: 23, klarna: 26, iris: 29 } as const;
export type VivaPay = keyof typeof VIVA_METHODS;
export const isVivaPay = (p: string | null | undefined): p is VivaPay => !!p && p in VIVA_METHODS;

export const vivaHosts = (mode: VivaMode) => mode === "live"
  ? { accounts: "https://accounts.vivapayments.com", api: "https://api.vivapayments.com", web: "https://www.vivapayments.com" }
  : { accounts: "https://demo-accounts.vivapayments.com", api: "https://demo-api.vivapayments.com", web: "https://demo.vivapayments.com" };

export const checkoutUrl = (mode: VivaMode, orderCode: string, pay: VivaPay) =>
  `${vivaHosts(mode).web}/web/checkout?ref=${encodeURIComponent(orderCode)}&paymentMethod=${VIVA_METHODS[pay]}`;

/** Η συναλλαγή όπως την επιστρέφει το Retrieve Transaction (checkout/v2/transactions/{id}). */
export interface VivaTransaction { statusId: string; amount: number; orderCode: number | string; merchantTrns?: string | null; email?: string | null; totalInstallments?: number | null }
export type VivaVerdict = "paid" | "pending" | "failed" | "mismatch";

/**
 * F = ολοκληρώθηκε · A = σε εξέλιξη (ασύγχρονοι τρόποι, π.χ. IRIS) · τα υπόλοιπα = απέτυχε/ακυρώθηκε.
 * Πληρωμένη ΜΟΝΟ αν συμφωνούν κωδικός παραγγελίας Viva και ποσό (σε λεπτά) με τη δική μας παραγγελία.
 */
export function judgeTransaction(t: VivaTransaction, expect: { orderCode: string; totalCents: number }): VivaVerdict {
  if (String(t.orderCode) !== String(expect.orderCode)) return "mismatch";
  if (t.statusId === "F") return Math.round(Number(t.amount) * 100) === expect.totalCents ? "paid" : "mismatch";
  if (t.statusId === "A") return "pending";
  return "failed";
}

/** Οι τρόποι Viva που δείχνει το checkout, από τις δημόσιες ρυθμίσεις πληρωμών (η κάρτα πάντα). */
export function enabledVivaPays(p: Record<string, unknown>): VivaPay[] {
  if (p.provider !== "viva") return [];
  const on = (k: string) => p[k] === true;
  return (["card", "apple", "google", "paypal", "iris", "klarna"] as VivaPay[]).filter((m) => m === "card" || on({ apple: "applePay", google: "googlePay", paypal: "paypal", iris: "iris", klarna: "klarna" }[m]!));
}
