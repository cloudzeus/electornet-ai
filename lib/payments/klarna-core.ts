/**
 * Klarna (απευθείας σύμβαση) — ό,τι δεν χρειάζεται δίκτυο: διευθύνσεις, γραμμές παραγγελίας, αξιολόγηση.
 * Ροή: Klarna Payments session (/payments/v1/sessions) → Hosted Payment Page (/hpp/v1/sessions) → ο πελάτης
 * εγκρίνεται στη σελίδα της Klarna → η HPP δημιουργεί την παραγγελία (place_order_mode PLACE_ORDER) → χρέωση (capture)
 * με την αποστολή μέσω Order Management (/ordermanagement/v1/orders/{id}/captures). Ποσά σε λεπτά, ΦΠΑ σε εκατοστά
 * του τοις εκατό (24 % = 2400). Τεκμηρίωση: docs.klarna.com → Klarna Payments, Hosted Payment Page, Order management.
 */
export type KlarnaMode = "test" | "live";
export const klarnaHost = (mode: KlarnaMode) => (mode === "live" ? "https://api.klarna.com" : "https://api.playground.klarna.com");

export interface KlarnaLine {
  type: "physical" | "digital" | "shipping_fee" | "surcharge" | "discount";
  reference?: string; name: string; quantity: number;
  unit_price: number; tax_rate: number; total_amount: number; total_discount_amount: number; total_tax_amount: number;
}
export interface KlarnaOrderIn {
  number: string; total: number; locale?: string;
  lines: { reference?: string | null; name: string; qty: number; unitPrice: number; lineTotal: number; vatRate: number; kind?: "physical" | "digital" }[];
  shippingFee: number;
  customer?: { email?: string | null; firstName?: string; lastName?: string; phone?: string; street?: string; zip?: string; city?: string };
}

const c = (eur: number) => Math.round(eur * 100);
/** ΦΠΑ που περιέχεται σε ποσό με ΦΠΑ (λεπτά) — όπως τον ζητά η Klarna: total − total·10000/(10000+rate) */
export const taxOf = (totalCents: number, rate: number) => totalCents - Math.round((totalCents * 10000) / (10000 + rate));

/**
 * Γραμμές για την Klarna: κάθε είδος με τιμή μονάδας πριν τις εκπτώσεις και την έκπτωση της γραμμής, μεταφορικά, και
 * (αν μένει διαφορά από στρογγύλεμα) μία γραμμή έκπτωσης/χρέωσης ώστε Σ γραμμών = σύνολο — η Klarna το απαιτεί.
 */
export function klarnaSession(o: KlarnaOrderIn) {
  const lines: KlarnaLine[] = o.lines.map((l) => {
    const rate = Math.round(l.vatRate * 100), unit = c(l.unitPrice), total = c(l.lineTotal), gross = unit * l.qty;
    return { type: l.kind ?? "physical", ...(l.reference ? { reference: l.reference.slice(0, 64) } : {}), name: l.name.slice(0, 255), quantity: l.qty, unit_price: unit, tax_rate: rate, total_amount: total, total_discount_amount: Math.max(0, gross - total), total_tax_amount: taxOf(total, rate) };
  });
  if (o.shippingFee > 0) { const t = c(o.shippingFee); lines.push({ type: "shipping_fee", name: "Μεταφορικά", quantity: 1, unit_price: t, tax_rate: 2400, total_amount: t, total_discount_amount: 0, total_tax_amount: taxOf(t, 2400) }); }
  const amount = c(o.total);
  const diff = amount - lines.reduce((a, l) => a + l.total_amount, 0);
  if (diff) lines.push({ type: diff < 0 ? "discount" : "surcharge", name: diff < 0 ? "Έκπτωση" : "Στρογγύλεμα", quantity: 1, unit_price: diff, tax_rate: 2400, total_amount: diff, total_discount_amount: 0, total_tax_amount: taxOf(diff, 2400) });
  const cu = o.customer;
  const address = cu ? { given_name: cu.firstName, family_name: cu.lastName, email: cu.email ?? undefined, phone: cu.phone, street_address: cu.street, postal_code: cu.zip, city: cu.city, country: "GR" } : undefined;
  return {
    acquiring_channel: "ECOMMERCE", intent: "buy", purchase_country: "GR", purchase_currency: "EUR", locale: o.locale ?? "el-GR",
    order_amount: amount, order_tax_amount: lines.reduce((a, l) => a + l.total_tax_amount, 0), order_lines: lines,
    merchant_reference1: o.number, merchant_reference2: "eshop",
    ...(address ? { billing_address: address } : {}),
  };
}

export const hppSession = (kpSessionId: string, mode: KlarnaMode, urls: { success: string; cancel: string; back: string; failure: string; error: string; status: string }, capture: "shipment" | "immediate") => ({
  payment_session_url: `${klarnaHost(mode)}/payments/v1/sessions/${kpSessionId}`,
  merchant_urls: { success: urls.success, cancel: urls.cancel, back: urls.back, failure: urls.failure, error: urls.error, status_update: urls.status },
  options: { place_order_mode: capture === "immediate" ? "CAPTURE_ORDER" : "PLACE_ORDER" },
});

/** Η HPP session όπως την επιστρέφει το GET /hpp/v1/sessions/{id}. */
export interface HppStatus { status: string; order_id?: string | null; authorization_token?: string | null; klarna_reference?: string | null }
/** Η παραγγελία της Klarna (GET /ordermanagement/v1/orders/{id}). */
export interface KlarnaOrder { order_id: string; status: string; fraud_status?: string; order_amount: number; captured_amount?: number; refunded_amount?: number; merchant_reference1?: string | null; klarna_reference?: string | null }
export type KlarnaVerdict = "paid" | "pending" | "failed" | "waiting" | "mismatch";

/**
 * Πληρωμένη (εγκεκριμένη) ΜΟΝΟ αν η Klarna έφτιαξε παραγγελία με τον αριθμό και το ποσό της δικής μας και ο έλεγχος
 * απάτης είναι ACCEPTED. PENDING = η Klarna ελέγχει ακόμη· η σελίδα σε αναμονή = ο πελάτης δεν ολοκλήρωσε ακόμη.
 */
export function judgeKlarna(h: HppStatus, order: KlarnaOrder | null, expect: { number: string; totalCents: number }): KlarnaVerdict {
  const st = h.status.toUpperCase();
  if (["CANCELLED", "FAILED", "ERROR", "DISABLED"].includes(st)) return "failed";
  if (st !== "COMPLETED" && st !== "COMPLETE") return "waiting";
  if (!order) return "pending";
  if (order.merchant_reference1 !== expect.number || order.order_amount !== expect.totalCents) return "mismatch";
  if (order.status === "CANCELLED") return "failed";
  if (order.fraud_status === "PENDING") return "pending";
  if (order.fraud_status && order.fraud_status !== "ACCEPTED") return "failed";
  return "paid";
}
