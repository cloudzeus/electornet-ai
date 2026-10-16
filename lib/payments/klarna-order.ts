import "server-only";
import { db } from "@/lib/db";
import { judgeKlarna, hppSession, klarnaSession, type KlarnaVerdict } from "./klarna-core";
import { cancelKlarna, captureKlarna, createHpp, createKpSession, getHpp, getKlarnaOrder, klarnaConfig, refundKlarna } from "./klarna";
import { markPaid, paymentKey } from "./order-payment";

/**
 * Ο κύκλος ζωής μιας πληρωμής Klarna (απευθείας σύμβαση), όπως της Viva:
 * 1. η παραγγελία καταχωρείται «αναμένει πληρωμή» (ERP «awaiting-payment», χωρίς email)
 * 2. session στην Klarna + Hosted Payment Page → ο πελάτης εγκρίνεται εκεί (Pay in 3 κ.λπ.)
 * 3. επιστροφή ή status_update → η κατάσταση επιβεβαιώνεται ΠΑΝΤΑ από το API της Klarna (αριθμός + ποσό + έλεγχος απάτης)
 * 4. χρέωση (capture) με την αποστολή / «έτοιμη για παραλαβή» — ή αμέσως, αν έτσι ορίστηκε· ακύρωση πριν τη χρέωση → cancel
 * pspRef: «hpp:<HPP session>» όσο εκκρεμεί → «klarna:<order_id>» όταν εγκριθεί → «klarna:<order_id>:captured» όταν χρεωθεί.
 */
const cents = (d: unknown) => Math.round(Number(d) * 100);
const orderIdOf = (ref: string | null | undefined) => (ref?.startsWith("klarna:") ? ref.split(":")[1] : null);

/** Νέα σελίδα πληρωμής Klarna για εκκρεμή παραγγελία → η διεύθυνση όπου πηγαίνει ο πελάτης. */
export async function startKlarnaPayment(orderId: string, origin: string): Promise<string> {
  const c = await klarnaConfig();
  if (!c) throw new Error("Η Klarna δεν έχει ρυθμιστεί.");
  const o = await db.order.findUnique({
    where: { id: orderId },
    select: { number: true, total: true, status: true, shipping: true, shippingFee: true, guestEmail: true, customer: { select: { email: true } }, payment: { select: { status: true } },
      lines: { orderBy: { id: "asc" }, select: { title: true, qty: true, listPrice: true, unitPrice: true, lineTotal: true, erpCode: true, variant: { select: { product: { select: { vatRate: true } } } }, addons: { select: { price: true, service: { select: { title: true } } } } } } },
  });
  if (!o) throw new Error("Η παραγγελία δεν βρέθηκε.");
  if (o.status !== "pending" || o.payment?.status === "paid") throw new Error("Η παραγγελία δεν περιμένει πληρωμή.");
  const s = (o.shipping ?? {}) as { firstName?: string; lastName?: string; email?: string; phone?: string; street?: string; number?: string; zip?: string; city?: string };
  const lines = o.lines.flatMap((l) => [
    { reference: l.erpCode, name: l.title, qty: l.qty, unitPrice: Number(l.listPrice ?? l.unitPrice), lineTotal: Number(l.lineTotal ?? Number(l.unitPrice) * l.qty), vatRate: Number(l.variant.product.vatRate) || 24 },
    ...l.addons.map((a) => ({ name: a.service.title, qty: 1, unitPrice: Number(a.price), lineTotal: Number(a.price), vatRate: 24, kind: "digital" as const })),
  ]);
  const kp = await createKpSession(c, klarnaSession({
    number: o.number, total: Number(o.total), shippingFee: Number(o.shippingFee), lines,
    customer: { email: s.email ?? o.customer?.email ?? o.guestEmail, firstName: s.firstName, lastName: s.lastName, phone: s.phone, street: [s.street, s.number].filter(Boolean).join(" ") || undefined, zip: s.zip, city: s.city },
  }));
  const q = `no=${encodeURIComponent(o.number)}&k=${paymentKey(o.number)}`;
  const back = (r: string) => `${origin}/api/payments/klarna/return?${q}&r=${r}`;
  const hpp = await createHpp(c, hppSession(kp.session_id, c.mode, { success: back("ok"), cancel: back("cancel"), back: back("back"), failure: back("failed"), error: back("error"), status: `${origin}/api/payments/klarna/status?${q}` }, c.capture));
  await db.payment.update({ where: { orderId }, data: { psp: "klarna", pspRef: `hpp:${hpp.session_id}`, method: "klarna", status: "pending" } });
  return hpp.redirect_url;
}

/**
 * Επιβεβαίωση από την Klarna (επιστροφή πελάτη ή status_update): HPP session → παραγγελία Klarna → έλεγχος → ενημέρωση.
 * Ιδεμπότητη — για ήδη πληρωμένη παραγγελία δεν κάνει τίποτα.
 */
export async function settleKlarna(number: string): Promise<KlarnaVerdict | "unknown"> {
  const c = await klarnaConfig();
  const pay = await db.payment.findFirst({ where: { psp: "klarna", order: { number } }, select: { orderId: true, pspRef: true, status: true, order: { select: { total: true } } } });
  if (!c || !pay?.pspRef) return "unknown";
  if (pay.status === "paid") return "paid";
  if (!pay.pspRef.startsWith("hpp:")) return "unknown";
  const h = await getHpp(c, pay.pspRef.slice(4));
  const ko = h.order_id ? await getKlarnaOrder(c, h.order_id) : null;
  const v = judgeKlarna(h, ko, { number, totalCents: cents(pay.order.total) });
  if (v === "paid") {
    const captured = (ko?.captured_amount ?? 0) >= cents(pay.order.total);
    await markPaid(pay.orderId, `klarna:${h.order_id}${captured ? ":captured" : ""}`);
  } else if (v !== "waiting") {
    await db.payment.update({ where: { orderId: pay.orderId }, data: { status: v === "pending" ? "processing" : v === "mismatch" ? "review" : "failed" } });
  }
  return v;
}

/**
 * Μετά από αλλαγή κατάστασης στη διαχείριση: αποστολή / έτοιμη για παραλαβή / παραδόθηκε → χρέωση (capture)·
 * ακύρωση πριν τη χρέωση → ακύρωση στην Klarna. Επιστρέφει μήνυμα για τον χρήστη (ή null αν δεν αφορά Klarna).
 */
export async function klarnaAfterStatus(orderId: string, to: string): Promise<string | null> {
  const p = await db.payment.findUnique({ where: { orderId }, select: { psp: true, pspRef: true, status: true, order: { select: { total: true, number: true } } } });
  const kid = orderIdOf(p?.pspRef);
  if (p?.psp !== "klarna" || !kid) return null;
  const c = await klarnaConfig();
  if (!c) return "Klarna: δεν έχει ρυθμιστεί — η χρέωση / ακύρωση γίνεται από το Klarna Merchant Portal.";
  const captured = p.pspRef!.endsWith(":captured");
  try {
    if (["shipped", "ready-for-pickup", "delivered"].includes(to) && !captured) {
      await captureKlarna(c, kid, cents(p.order.total), `capture-${p.order.number}`);
      await db.payment.update({ where: { orderId }, data: { pspRef: `klarna:${kid}:captured` } });
      return "Klarna: το ποσό χρεώθηκε στον πελάτη.";
    }
    if (to === "cancelled" && !captured) { await cancelKlarna(c, kid); await db.payment.update({ where: { orderId }, data: { status: "cancelled" } }); return "Klarna: η έγκριση ακυρώθηκε — ο πελάτης δεν χρεώνεται."; }
    if (to === "cancelled" && captured) return "Klarna: έχει χρεωθεί — κάνε «Επιστροφή χρημάτων» για να επιστραφεί το ποσό.";
  } catch (e) {
    return e instanceof Error ? e.message : "Klarna: σφάλμα.";
  }
  return null;
}

/** «Επιστροφή χρημάτων» για παραγγελία Klarna: επιστροφή μέσω API (αν έχει χρεωθεί) ή ακύρωση της έγκρισης (αν όχι). */
export async function klarnaRefund(orderId: string, amount: number): Promise<{ ok: boolean; message: string } | null> {
  const p = await db.payment.findUnique({ where: { orderId }, select: { psp: true, pspRef: true, order: { select: { total: true, number: true } } } });
  const kid = orderIdOf(p?.pspRef);
  if (p?.psp !== "klarna" || !kid) return null;
  const c = await klarnaConfig();
  if (!c) return { ok: false, message: "Η Klarna δεν έχει ρυθμιστεί — κάνε την επιστροφή από το Klarna Merchant Portal." };
  try {
    if (!p.pspRef!.endsWith(":captured")) {
      if (cents(amount) < cents(p.order.total)) return { ok: false, message: "Η παραγγελία Klarna δεν έχει χρεωθεί ακόμη: μερική επιστροφή δεν γίνεται — ακύρωσέ την ή χρέωσέ την πρώτα." };
      await cancelKlarna(c, kid);
      return { ok: true, message: "Klarna: η έγκριση ακυρώθηκε, ο πελάτης δεν χρεώνεται." };
    }
    await refundKlarna(c, kid, cents(amount), `refund-${p.order.number}-${cents(amount)}-${Date.now()}`);
    return { ok: true, message: "Klarna: η επιστροφή στάλθηκε στην Klarna." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Klarna: σφάλμα επιστροφής." };
  }
}
