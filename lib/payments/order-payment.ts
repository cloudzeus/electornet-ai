import "server-only";
import type { Prisma } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { renderTemplate } from "@/lib/email/templates";
import { sendMail } from "@/lib/email/send";
import { checkoutUrl, judgeTransaction, type VivaPay, type VivaVerdict } from "./viva-core";
import { createVivaOrder, getVivaTransaction, vivaConfig, vivaOrderTransactions } from "./viva";
import { bankTransfer } from "./bank-transfer";
import { payLabel } from "@/lib/account/labels";
import { payable, payUntil } from "@/lib/orders/model";

/**
 * Ο κύκλος ζωής μιας online πληρωμής (Viva):
 * 1. η παραγγελία καταχωρείται «αναμένει πληρωμή» (payment pending, ERP «awaiting-payment», χωρίς email)
 * 2. payment order στη Viva → ο πελάτης πληρώνει εκεί
 * 3. επιστροφή ή webhook → η συναλλαγή επιβεβαιώνεται ΠΑΝΤΑ από το API της Viva (κωδικός + ποσό) → πληρωμένη, ERP, email
 * 4. αποτυχία → η παραγγελία μένει εκκρεμής, με «Δοκίμασε ξανά» (ασφαλής σύνδεσμος)· μετά από 24 ώρες ακυρώνεται
 *    και οι χρήσεις προσφορών / κουπονιού επιστρέφουν.
 * 5. ο πελάτης έφυγε από τη σελίδα της Viva χωρίς να γυρίσει → μετά από 30′ παίρνει email με τον ίδιο σύνδεσμο και
 *    ενημερώνεται το προσωπικό· ο σύνδεσμος φαίνεται και στον λογαριασμό του, στον εντοπισμό και στη διαχείριση.
 */

/** Online παραγγελία που περιμένει ακόμη πληρωμή: ούτε πληρωμένη, ούτε υπό επιβεβαίωση από την τράπεζα. */
const UNPAID: Prisma.OrderWhereInput = { status: "pending", payment: { psp: { in: ["viva", "klarna"] }, status: { notIn: ["paid", "processing", "review"] } } };
export { payable, payUntil };

// ---------- ασφαλής σύνδεσμος της σελίδας πληρωμής ----------
const secret = () => process.env.SETTINGS_KEY || process.env.AUTH_SECRET || "dev-only";
const sign = (number: string) => createHmac("sha256", secret()).update(`pay:${number}`).digest("base64url").slice(0, 22);
export const paymentKey = sign;
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
  // «Δοκίμασε ξανά»: αν η προηγούμενη προσπάθεια τελικά πέρασε στη Viva, δεν ανοίγει δεύτερη πληρωμή
  if (await reconcileViva(orderId)) throw new Error("Η παραγγελία έχει ήδη πληρωθεί.");
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

/**
 * Ρωτά τη Viva αν το τελευταίο payment order της παραγγελίας έχει ολοκληρωμένη συναλλαγή που δεν μάθαμε (ο πελάτης έκλεισε
 * τη σελίδα πριν γυρίσει, το webhook χάθηκε) και την περνά ως πληρωμένη. true = η παραγγελία είναι πληρωμένη.
 */
export async function reconcileViva(orderId: string): Promise<boolean> {
  const pay = await db.payment.findUnique({ where: { orderId }, select: { psp: true, pspRef: true, status: true } });
  if (pay?.status === "paid") return true;
  const c = pay?.psp === "viva" && pay.pspRef ? await vivaConfig() : null;
  if (!c) return false;
  const done = (await vivaOrderTransactions(c, pay!.pspRef!.split(":")[0]).catch(() => [])).find((t) => t.StatusId === "F");
  return done ? (await settleViva(done.TransactionId)).verdict === "paid" : false;
}

/** Πληρωμένη: κατάσταση, παραστατικό προς ERP, email επιβεβαίωσης. Μόνο μία φορά (ατομικός έλεγχος). */
export async function markPaid(orderId: string, pspRef: string) {
  const n = await db.payment.updateMany({ where: { orderId, status: { not: "paid" } }, data: { status: "paid", pspRef, scaDone: true } });
  if (n.count !== 1) return;
  await db.order.update({ where: { id: orderId }, data: { status: "paid" } });
  await db.erpSync.updateMany({ where: { orderId, status: "awaiting-payment" }, data: { status: "preview" } });
  // ο τελικός τρόπος πληρωμής (μπορεί να άλλαξε στο «Δοκίμασε ξανά») στο παραστατικό
  await import("@/lib/softone/order-doc").then((m) => m.refreshSaldocPreview(orderId)).catch(() => null);
  // αποστολή στο ERP μόνο όταν ο διακόπτης είναι σε «Αποστολή» (αλλιώς δεν γίνεται καμία κλήση)
  await import("@/lib/softone/order-doc").then((m) => m.maybeSendSaldoc(orderId)).catch(() => null);
  await sendConfirmation(orderId).catch(() => null);
  await import("@/lib/orders/staff-mail").then((m) => m.sendStaffOrderMail(orderId, "new")).catch(() => null);
  await import("@/lib/warranty/server").then((m) => m.devicesFromOrder(orderId)).catch(() => null);
}

/** Email επιβεβαίωσης από τα στοιχεία της παραγγελίας στη βάση (για πληρωμές που ολοκληρώνονται αργότερα). */
export async function sendConfirmation(orderId: string) {
  const o = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, number: true, fulfilment: true, shipping: true, subtotal: true, shippingFee: true, total: true, paymentMethod: true, guestEmail: true, customer: { select: { email: true } },
      lines: { select: { title: true, qty: true, unitPrice: true, variant: { select: { product: { select: { brand: { select: { name: true } }, media: { where: { kind: "image", hidden: false }, orderBy: { sortNo: "asc" }, take: 1, select: { url: true, emailUrl: true } } } } } } } } },
  });
  if (!o) return;
  const s = (o.shipping ?? {}) as { firstName?: string; email?: string; street?: string; number?: string; zip?: string; city?: string; carrierName?: string; locker?: { name?: string; address?: string; zip?: string } };
  const to = s.email ?? o.customer?.email ?? o.guestEmail;
  if (!to) return;
  const tpl = await renderTemplate("order-confirmation", {
    firstName: s.firstName ?? "", number: o.number,
    lines: o.lines.map((l) => ({ title: l.title, brand: l.variant.product.brand.name, image: l.variant.product.media[0]?.emailUrl ?? l.variant.product.media[0]?.url ?? null, qty: l.qty, unitPrice: Number(l.unitPrice), addons: [] })),
    subtotal: Number(o.subtotal), shippingFee: Number(o.shippingFee), total: Number(o.total), payment: payLabel(o.paymentMethod), fulfilment: o.fulfilment,
    ...(o.paymentMethod === "bank" ? { bankAccounts: (await bankTransfer()).accounts } : {}),
    address: s.locker ? `Θυρίδα BOX NOW: ${[s.locker.name, s.locker.address, s.locker.zip].filter(Boolean).join(", ")}` : [s.street, s.number, s.zip, s.city].filter(Boolean).join(" "),
    eta: s.carrierName ? `${s.carrierName}` : "1–3 εργάσιμες",
  });
  await sendMail({ to, subject: tpl.subject, html: tpl.html, text: tpl.text, template: "order-confirmation", meta: { orderId: o.id } });
}

/** Ακύρωση παραγγελίας: οι χρήσεις προσφορών (μετρητής + budget) και του κουπονιού επιστρέφουν. Μέσα σε transaction. */
export async function rollbackPromos(tx: Prisma.TransactionClient, orderId: string, couponCode: string | null) {
  const uses = await tx.promotionUsage.groupBy({ by: ["promotionId"], where: { orderId }, _sum: { amount: true } });
  for (const u of uses) await tx.$executeRaw`UPDATE "Promotion" SET "usedCount" = GREATEST("usedCount" - 1, 0), "spentEur" = GREATEST("spentEur" - ${Number(u._sum.amount ?? 0)}, 0) WHERE id = ${u.promotionId}`;
  await tx.promotionUsage.deleteMany({ where: { orderId } });
  if (couponCode) await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = GREATEST("usedCount" - 1, 0) WHERE code = ${couponCode}`;
}

/**
 * Απλήρωτες online παραγγελίες μετά από `hours`: ακύρωση, επιστροφή χρήσεων προσφορών (μετρητής + budget) και κουπονιού,
 * καμία αποστολή στο ERP. Τρέχει από το cron.
 */
export async function cancelUnpaidOnline(hours = 24) {
  const since = new Date(Date.now() - hours * 3600_000);
  const due = await db.order.findMany({ where: { ...UNPAID, createdAt: { lt: since } }, select: { id: true, couponCode: true }, take: 100 });
  for (const o of due) {
    if (await reconcileViva(o.id).catch(() => false)) continue; // πληρώθηκε χωρίς να το μάθουμε: δεν ακυρώνεται
    await db.$transaction(async (tx) => {
      const n = await tx.order.updateMany({ where: { id: o.id, status: "pending" }, data: { status: "cancelled" } });
      if (n.count !== 1) return;
      await rollbackPromos(tx, o.id, o.couponCode);
      await tx.payment.update({ where: { orderId: o.id }, data: { status: "cancelled" } });
      await tx.erpSync.deleteMany({ where: { orderId: o.id, status: "awaiting-payment" } });
    });
  }
  return { cancelled: due.length };
}

/**
 * Απλήρωτες online παραγγελίες μετά από `minutes` (η σελίδα πληρωμής της Viva λήγει στα 30′): ένα email στον πελάτη με τον
 * σύνδεσμο πληρωμής της ίδιας παραγγελίας και ένα στο προσωπικό. Μία φορά ανά παραγγελία — το σημάδι είναι το EmailLog,
 * άρα και αποτυχημένη αποστολή δεν ξαναστέλνεται. Την τελευταία ώρα πριν από την ακύρωση δεν στέλνεται. Τρέχει από τον scheduler.
 */
export async function remindUnpaidOnline(minutes = 30) {
  const now = Date.now();
  const due = await db.order.findMany({
    where: { ...UNPAID, createdAt: { lt: new Date(now - minutes * 60_000), gt: new Date(now - 23 * 3600_000) } }, take: 50, orderBy: { createdAt: "asc" },
    select: { id: true, number: true, createdAt: true, total: true, shipping: true, guestEmail: true, customer: { select: { email: true } },
      lines: { select: { title: true, qty: true, unitPrice: true, variant: { select: { product: { select: { brand: { select: { name: true } }, media: { where: { kind: "image", hidden: false }, orderBy: { sortNo: "asc" }, take: 1, select: { url: true, emailUrl: true } } } } } } } } },
  });
  let sent = 0;
  for (const o of due) {
    const byOrder = { meta: { path: ["orderId"], equals: o.id } };
    if (await db.emailLog.count({ where: { at: { gte: o.createdAt }, OR: [{ template: "payment-pending", ...byOrder }, { template: "staff-order", AND: [byOrder, { meta: { path: ["event"], equals: "unpaid" } }] }] } })) continue;
    if (await reconcileViva(o.id).catch(() => false)) continue; // πλήρωσε τελικά: παίρνει την επιβεβαίωση, όχι υπενθύμιση
    const s = (o.shipping ?? {}) as { firstName?: string; email?: string };
    const to = s.email ?? o.customer?.email ?? o.guestEmail;
    // έκανε νεότερη παραγγελία (π.χ. την ξαναπέρασε από την αρχή): η υπενθύμιση αφορά μόνο την τελευταία του
    if (to && (await db.order.count({ where: { createdAt: { gt: o.createdAt }, status: { not: "cancelled" }, OR: [{ guestEmail: to }, { customer: { email: to } }, { shipping: { path: ["email"], equals: to } }] } }))) continue;
    if (to) {
      const base = (await import("@/lib/email/layout").then((m) => m.emailCtx())).baseUrl;
      const tpl = await renderTemplate("payment-pending", { firstName: s.firstName ?? "", number: o.number, total: Number(o.total), payUrl: `${base}${paymentPagePath(o.number)}`, until: payUntil(o.createdAt),
        lines: o.lines.map((l) => ({ title: l.title, brand: l.variant.product.brand.name, image: l.variant.product.media[0]?.emailUrl ?? l.variant.product.media[0]?.url ?? null, qty: l.qty, unitPrice: Number(l.unitPrice), addons: [] })) });
      await sendMail({ to, subject: tpl.subject, html: tpl.html, text: tpl.text, template: "payment-pending", meta: { orderId: o.id } }).catch(() => null);
    }
    await import("@/lib/orders/staff-mail").then((m) => m.sendStaffOrderMail(o.id, "unpaid")).catch(() => null);
    sent++;
  }
  return { due: due.length, sent };
}
