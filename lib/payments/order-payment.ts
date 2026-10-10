import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { renderTemplate } from "@/lib/email/templates";
import { sendMail } from "@/lib/email/send";
import { checkoutUrl, judgeTransaction, type VivaPay, type VivaVerdict } from "./viva-core";
import { createVivaOrder, getVivaTransaction, vivaConfig } from "./viva";

/**
 * Ο κύκλος ζωής μιας online πληρωμής (Viva):
 * 1. η παραγγελία καταχωρείται «αναμένει πληρωμή» (payment pending, ERP «awaiting-payment», χωρίς email)
 * 2. payment order στη Viva → ο πελάτης πληρώνει εκεί
 * 3. επιστροφή ή webhook → η συναλλαγή επιβεβαιώνεται ΠΑΝΤΑ από το API της Viva (κωδικός + ποσό) → πληρωμένη, ERP, email
 * 4. αποτυχία → η παραγγελία μένει εκκρεμής, με «Δοκίμασε ξανά» (ασφαλής σύνδεσμος)· μετά από 24 ώρες ακυρώνεται
 *    και οι χρήσεις προσφορών / κουπονιού επιστρέφουν.
 */

// ---------- ασφαλής σύνδεσμος της σελίδας πληρωμής ----------
const secret = () => process.env.SETTINGS_KEY || process.env.AUTH_SECRET || "dev-only";
const sign = (number: string) => createHmac("sha256", secret()).update(`pay:${number}`).digest("base64url").slice(0, 22);
export const paymentPagePath = (number: string, extra = "") => `/checkout/pliromi?no=${encodeURIComponent(number)}&k=${sign(number)}${extra}`;
export function validPaymentKey(number: string, k: string | null | undefined) {
  const a = Buffer.from(sign(number)), b = Buffer.from(k ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

const cents = (d: unknown) => Math.round(Number(d) * 100);

/** Νέο payment order στη Viva για εκκρεμή παραγγελία → η διεύθυνση της σελίδας πληρωμής (με τον τρόπο προεπιλεγμένο). */
export async function startVivaPayment(orderId: string, pay: VivaPay): Promise<string> {
  const c = await vivaConfig();
  if (!c) throw new Error("Η Viva δεν έχει ρυθμιστεί.");
  const o = await db.order.findUnique({ where: { id: orderId }, select: { number: true, total: true, status: true, shipping: true, guestEmail: true, customer: { select: { email: true } }, payment: { select: { instalments: true, status: true } } } });
  if (!o) throw new Error("Η παραγγελία δεν βρέθηκε.");
  if (o.status !== "pending" || o.payment?.status === "paid") throw new Error("Η παραγγελία δεν περιμένει πληρωμή.");
  const s = (o.shipping ?? {}) as { firstName?: string; lastName?: string; email?: string; phone?: string };
  const code = await createVivaOrder(c, {
    amount: cents(o.total), number: o.number, instalments: o.payment?.instalments,
    customer: { email: s.email ?? o.customer?.email ?? o.guestEmail ?? "", fullName: [s.firstName, s.lastName].filter(Boolean).join(" "), phone: s.phone ?? null },
  });
  await db.payment.update({ where: { orderId }, data: { psp: "viva", pspRef: code, method: pay, status: "pending" } });
  return checkoutUrl(c.mode, code, pay);
}

/**
 * Επιβεβαίωση από τη Viva (επιστροφή πελάτη ή webhook): ανάκτηση της συναλλαγής, έλεγχος κωδικού και ποσού, ενημέρωση.
 * Ιδεμπότητη — δεύτερη κλήση για ήδη πληρωμένη παραγγελία δεν κάνει τίποτα.
 */
export async function settleViva(transactionId: string): Promise<{ number: string | null; verdict: VivaVerdict | "unknown"; kind?: "order" | "warranty" }> {
  const c = await vivaConfig();
  if (!c) return { number: null, verdict: "unknown" };
  const t = await getVivaTransaction(c, transactionId);
  const pay = await db.payment.findFirst({ where: { psp: "viva", pspRef: { startsWith: String(t.orderCode) } }, select: { orderId: true, pspRef: true, status: true, order: { select: { number: true, total: true } } } });
  if (!pay) {
    // όχι παραγγελία: ίσως αγορά επέκτασης εγγύησης από το προφίλ
    const ext = await import("@/lib/warranty/paid").then((m) => m.settleExtension(t, transactionId));
    return ext ? { ...ext, kind: "warranty" } : { number: null, verdict: "unknown" };
  }
  const code = pay.pspRef!.split(":")[0];
  const verdict = judgeTransaction(t, { orderCode: code, totalCents: cents(pay.order.total) });
  if (pay.status === "paid") return { number: pay.order.number, verdict: "paid", kind: "order" };
  if (verdict === "paid") await markPaid(pay.orderId, `${code}:${transactionId}`);
  else await db.payment.update({ where: { orderId: pay.orderId }, data: { status: verdict === "pending" ? "processing" : verdict === "mismatch" ? "review" : "failed" } });
  return { number: pay.order.number, verdict, kind: "order" };
}

/** Πληρωμένη: κατάσταση, παραστατικό προς ERP, email επιβεβαίωσης. Μόνο μία φορά (ατομικός έλεγχος). */
export async function markPaid(orderId: string, pspRef: string) {
  const n = await db.payment.updateMany({ where: { orderId, status: { not: "paid" } }, data: { status: "paid", pspRef, scaDone: true } });
  if (n.count !== 1) return;
  await db.order.update({ where: { id: orderId }, data: { status: "paid" } });
  await db.erpSync.updateMany({ where: { orderId, status: "awaiting-payment" }, data: { status: "preview" } });
  await sendConfirmation(orderId).catch(() => null);
  await import("@/lib/warranty/server").then((m) => m.devicesFromOrder(orderId)).catch(() => null);
}

/** Email επιβεβαίωσης από τα στοιχεία της παραγγελίας στη βάση (για πληρωμές που ολοκληρώνονται αργότερα). */
export async function sendConfirmation(orderId: string) {
  const o = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, number: true, fulfilment: true, shipping: true, subtotal: true, shippingFee: true, total: true, paymentMethod: true, guestEmail: true, customer: { select: { email: true } },
      lines: { select: { title: true, qty: true, unitPrice: true, variant: { select: { product: { select: { brand: { select: { name: true } }, media: { where: { kind: "image", hidden: false }, orderBy: { sortNo: "asc" }, take: 1, select: { url: true } } } } } } } } },
  });
  if (!o) return;
  const s = (o.shipping ?? {}) as { firstName?: string; email?: string; street?: string; number?: string; zip?: string; city?: string; carrierName?: string; locker?: { name?: string; address?: string; zip?: string } };
  const to = s.email ?? o.customer?.email ?? o.guestEmail;
  if (!to) return;
  const tpl = await renderTemplate("order-confirmation", {
    firstName: s.firstName ?? "", number: o.number,
    lines: o.lines.map((l) => ({ title: l.title, brand: l.variant.product.brand.name, image: l.variant.product.media[0]?.url ?? null, qty: l.qty, unitPrice: Number(l.unitPrice), addons: [] })),
    subtotal: Number(o.subtotal), shippingFee: Number(o.shippingFee), total: Number(o.total), payment: o.paymentMethod ?? "", fulfilment: o.fulfilment,
    address: s.locker ? `Θυρίδα BOX NOW: ${[s.locker.name, s.locker.address, s.locker.zip].filter(Boolean).join(", ")}` : [s.street, s.number, s.zip, s.city].filter(Boolean).join(" "),
    eta: s.carrierName ? `${s.carrierName}` : "1–3 εργάσιμες",
  });
  await sendMail({ to, subject: tpl.subject, html: tpl.html, text: tpl.text, template: "order-confirmation", meta: { orderId: o.id } });
}

/**
 * Απλήρωτες online παραγγελίες μετά από `hours`: ακύρωση, επιστροφή χρήσεων προσφορών (μετρητής + budget) και κουπονιού,
 * καμία αποστολή στο ERP. Τρέχει από το cron.
 */
export async function cancelUnpaidOnline(hours = 24) {
  const since = new Date(Date.now() - hours * 3600_000);
  const due = await db.order.findMany({ where: { status: "pending", createdAt: { lt: since }, payment: { psp: "viva", status: { notIn: ["paid", "processing", "review"] } } }, select: { id: true, couponCode: true }, take: 100 });
  for (const o of due) {
    await db.$transaction(async (tx) => {
      const n = await tx.order.updateMany({ where: { id: o.id, status: "pending" }, data: { status: "cancelled" } });
      if (n.count !== 1) return;
      const uses = await tx.promotionUsage.groupBy({ by: ["promotionId"], where: { orderId: o.id }, _sum: { amount: true } });
      for (const u of uses) await tx.$executeRaw`UPDATE "Promotion" SET "usedCount" = GREATEST("usedCount" - 1, 0), "spentEur" = GREATEST("spentEur" - ${Number(u._sum.amount ?? 0)}, 0) WHERE id = ${u.promotionId}`;
      await tx.promotionUsage.deleteMany({ where: { orderId: o.id } });
      if (o.couponCode) await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = GREATEST("usedCount" - 1, 0) WHERE code = ${o.couponCode}`;
      await tx.payment.update({ where: { orderId: o.id }, data: { status: "cancelled" } });
      await tx.erpSync.deleteMany({ where: { orderId: o.id, status: "awaiting-payment" } });
    });
  }
  return { cancelled: due.length };
}
