import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/rbac/audit";
import { renderTemplate } from "@/lib/email/templates";
import { sendMail } from "@/lib/email/send";
import { emailCtx } from "@/lib/email/layout";
import { payLabel } from "@/lib/account/labels";
import { rollbackPromos, sendConfirmation } from "@/lib/payments/order-payment";
import { NOTIFY_ON, ORDER_STATUS, RETURN_NEXT, RETURN_STATUS, canTransition, type OrderStatus, type ShipTo } from "./model";

/**
 * Αλλαγές σε παραγγελίες από τη διαχείριση: κατάσταση (μόνο επιτρεπτοί δρόμοι, με προαιρετικό email στον πελάτη),
 * ακύρωση με επιστροφή χρήσεων κουπονιού / προσφορών, σημειώσεις, επιστροφές, καταγραφή επιστροφής χρημάτων.
 * Κάθε αλλαγή γράφεται στο ιστορικό (AuditLog, entity "Order" / "Return").
 */
type Staff = { id: string; name?: string | null };
type Result = { ok: true; message: string } | { ok: false; error: string };

const DAY = (d: Date) => d.toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Athens" });
const DAYS = ["Κυρ", "Δευ", "Τρί", "Τετ", "Πέμ", "Παρ", "Σάβ"];
function hoursText(h: unknown): string {
  const rows = Array.isArray(h) ? (h as { day: number; open?: string; close?: string }[]) : [];
  return rows.filter((r) => r.open && r.close).map((r) => `${DAYS[r.day] ?? r.day} ${r.open}–${r.close}`).join(", ");
}

async function recipient(orderId: string) {
  const o = await db.order.findUnique({ where: { id: orderId }, select: { id: true, number: true, total: true, paymentMethod: true, shipping: true, guestEmail: true, customer: { select: { email: true, firstName: true } }, payment: { select: { status: true, method: true } } } });
  if (!o) return null;
  const s = (o.shipping ?? {}) as ShipTo;
  return { o, to: s.email ?? o.customer?.email ?? o.guestEmail ?? null, firstName: s.firstName ?? o.customer?.firstName ?? "" };
}

/** Το email που αντιστοιχεί στη νέα κατάσταση (ακύρωση, έτοιμη για παραλαβή, παραδόθηκε). */
async function notifyStatus(orderId: string, to: OrderStatus, reason: string | null): Promise<string | null> {
  const key = NOTIFY_ON[to];
  if (!key) return null;
  const r = await recipient(orderId);
  if (!r?.to) return "χωρίς email πελάτη";
  const { o, firstName } = r;
  const { baseUrl } = await emailCtx();
  let m: { subject: string; html: string; text: string };
  if (to === "cancelled") {
    const paid = o.payment?.status === "paid" || o.payment?.status === "refunded";
    m = await renderTemplate("order-cancelled", { firstName, number: o.number, reason: reason || "Ακύρωση από το κατάστημα", refund: paid ? Number(o.total) : null, method: payLabel(o.payment?.method ?? o.paymentMethod) });
  } else if (to === "ready-for-pickup") {
    const full = await db.order.findUnique({ where: { id: orderId }, select: { pickupStore: { select: { name: true, address: true, city: true, zip: true, phone: true, hours: true, lat: true, lng: true } } } });
    const st = full?.pickupStore;
    if (!st) return "χωρίς κατάστημα παραλαβής";
    const until = new Date(Date.now() + 7 * 86400_000);
    m = await renderTemplate("order-ready-for-pickup", { firstName, number: o.number, store: { name: st.name, address: st.address, city: st.city, zip: st.zip, phone: st.phone ?? "", hours: hoursText(st.hours), lat: st.lat, lng: st.lng }, until: DAY(until), code: pickupCode(o.number) });
  } else {
    const lines = await db.orderLine.findMany({ where: { orderId, isGift: false }, take: 4, select: { title: true, unitPrice: true, listPrice: true, variant: { select: { product: { select: { slug: true, brand: { select: { name: true } }, media: { where: { kind: "image", hidden: false }, orderBy: { sortNo: "asc" }, take: 1, select: { url: true } } } } } } } });
    m = await renderTemplate("order-delivered", { firstName, number: o.number, reviewUrl: `${baseUrl}/logariasmos/paraggelies/${encodeURIComponent(o.number)}#review`, items: lines.map((l) => ({ title: l.title, brand: l.variant.product.brand.name, image: l.variant.product.media[0]?.url ?? "", price: Number(l.unitPrice), wasPrice: l.listPrice && Number(l.listPrice) > Number(l.unitPrice) ? Number(l.listPrice) : Number(l.unitPrice), href: `/proion/${l.variant.product.slug}` })) });
  }
  await sendMail({ to: r.to, template: key, meta: { orderId }, ...m });
  return null;
}

/** Κωδικός παραλαβής: τα 4 τελευταία ψηφία της παραγγελίας (ίδιος στο email και στην καρτέλα). */
export const pickupCode = (number: string) => `EU-${number.replace(/\D/g, "").slice(-4)}`;

export async function changeStatus(orderId: string, to: OrderStatus, opts: { notify: boolean; reason?: string | null }, staff: Staff): Promise<Result> {
  const o = await db.order.findUnique({ where: { id: orderId }, select: { id: true, number: true, status: true, fulfilment: true, couponCode: true, pickupStoreId: true, payment: { select: { status: true } }, erpSync: { select: { status: true } } } });
  if (!o) return { ok: false, error: "Η παραγγελία δεν βρέθηκε." };
  if (!canTransition(o.status, to, o.fulfilment)) return { ok: false, error: `Δεν γίνεται από «${ORDER_STATUS[o.status as OrderStatus]?.label ?? o.status}» σε «${ORDER_STATUS[to].label}».` };
  if (to === "ready-for-pickup" && !o.pickupStoreId) return { ok: false, error: "Η παραγγελία δεν έχει κατάστημα παραλαβής." };
  const reason = opts.reason?.trim().slice(0, 300) || null;
  const changed = await db.$transaction(async (tx) => {
    // αισιόδοξος έλεγχος: αν άλλαξε στο μεταξύ (άλλος χρήστης, cron), δεν πατάμε πάνω
    const n = await tx.order.updateMany({ where: { id: o.id, status: o.status }, data: { status: to } });
    if (n.count !== 1) return false;
    if (to === "paid") await tx.payment.updateMany({ where: { orderId: o.id, status: { not: "paid" } }, data: { status: "paid" } });
    if (to === "cancelled") {
      await rollbackPromos(tx, o.id, o.couponCode);
      // πληρωμένη: τα χρήματα επιστρέφονται χωριστά («Επιστροφή χρημάτων»)· απλήρωτη: η πληρωμή ακυρώνεται
      if (o.payment && o.payment.status !== "paid") await tx.payment.update({ where: { orderId: o.id }, data: { status: "cancelled" } });
      // ό,τι δεν έχει φτάσει στο SoftOne δεν στέλνεται πια
      await tx.erpSync.deleteMany({ where: { orderId: o.id, status: { in: ["preview", "awaiting-payment", "queued"] } } });
    }
    return true;
  });
  if (!changed) return { ok: false, error: "Η παραγγελία άλλαξε στο μεταξύ — ανανέωσε τη σελίδα." };
  let mail: string | null = null;
  if (opts.notify && NOTIFY_ON[to]) mail = await notifyStatus(o.id, to, reason).catch((e) => (e instanceof Error ? e.message : "σφάλμα email"));
  await audit(staff.id, "order.status", "Order", o.id, { status: o.status }, { status: to, reason, notify: opts.notify && !!NOTIFY_ON[to], ...(mail ? { mailError: mail } : {}) });
  const label = ORDER_STATUS[to].label;
  return { ok: true, message: opts.notify && NOTIFY_ON[to] ? (mail ? `${label} — το email δεν στάλθηκε (${mail}).` : `${label} — ο πελάτης ενημερώθηκε με email.`) : `${label}.` };
}

export async function resendConfirmation(orderId: string, staff: Staff): Promise<Result> {
  const r = await recipient(orderId);
  if (!r) return { ok: false, error: "Η παραγγελία δεν βρέθηκε." };
  if (!r.to) return { ok: false, error: "Η παραγγελία δεν έχει email πελάτη." };
  await sendConfirmation(orderId);
  await audit(staff.id, "order.email", "Order", orderId, null, { template: "order-confirmation" });
  return { ok: true, message: "Η επιβεβαίωση στάλθηκε ξανά." };
}

export async function addNote(orderId: string, text: string, staff: Staff): Promise<Result> {
  const t = text.trim().slice(0, 2000);
  if (!t) return { ok: false, error: "Γράψε κάτι στη σημείωση." };
  await db.orderNote.create({ data: { orderId, text: t, staffId: staff.id, staffName: staff.name ?? null } });
  await audit(staff.id, "order.note", "Order", orderId, null, { text: t.slice(0, 200) });
  return { ok: true, message: "Η σημείωση αποθηκεύτηκε." };
}
export async function pinNote(noteId: string, pinned: boolean): Promise<Result> {
  await db.orderNote.update({ where: { id: noteId }, data: { pinned } });
  return { ok: true, message: pinned ? "Καρφιτσώθηκε." : "Ξεκαρφιτσώθηκε." };
}
export async function deleteNote(noteId: string, staff: Staff): Promise<Result> {
  const n = await db.orderNote.findUnique({ where: { id: noteId }, select: { orderId: true, staffId: true, text: true } });
  if (!n) return { ok: false, error: "Η σημείωση δεν βρέθηκε." };
  await db.orderNote.delete({ where: { id: noteId } });
  await audit(staff.id, "order.note.delete", "Order", n.orderId, { text: n.text.slice(0, 200) }, null);
  return { ok: true, message: "Η σημείωση διαγράφηκε." };
}

/** Αίτημα επιστροφής: εγκρίθηκε → παραλήφθηκε → επιστράφηκαν χρήματα (ή απορρίφθηκε). Στην παραλαβή, προαιρετικό email. */
export async function setReturnStatus(returnId: string, to: string, opts: { notify: boolean; refund?: number | null }, staff: Staff): Promise<Result> {
  const r = await db.return.findUnique({ where: { id: returnId }, select: { id: true, status: true, orderId: true, lines: true } });
  if (!r) return { ok: false, error: "Το αίτημα δεν βρέθηκε." };
  if (!(RETURN_NEXT[r.status] ?? []).includes(to)) return { ok: false, error: `Δεν γίνεται από «${RETURN_STATUS[r.status]?.label ?? r.status}» σε «${RETURN_STATUS[to]?.label ?? to}».` };
  const n = await db.return.updateMany({ where: { id: r.id, status: r.status }, data: { status: to } });
  if (n.count !== 1) return { ok: false, error: "Το αίτημα άλλαξε στο μεταξύ — ανανέωσε τη σελίδα." };
  let mail: string | null = null;
  if (opts.notify && (to === "received" || to === "refunded")) {
    const rc = await recipient(r.orderId);
    if (!rc?.to) mail = "χωρίς email πελάτη";
    else {
      const items = (Array.isArray(r.lines) ? (r.lines as { title?: string; qty?: number }[]) : []).map((l) => `${l.title ?? "Προϊόν"}${l.qty && l.qty > 1 ? ` ×${l.qty}` : ""}`);
      const m = await renderTemplate("order-return", { firstName: rc.firstName, number: rc.o.number, rma: rmaOf(r.id), items, refund: Number(opts.refund ?? 0), method: payLabel(rc.o.payment?.method ?? rc.o.paymentMethod) });
      await sendMail({ to: rc.to, template: "order-return", meta: { orderId: r.orderId, returnId: r.id }, ...m }).catch((e) => { mail = e instanceof Error ? e.message : "σφάλμα email"; });
    }
  }
  await audit(staff.id, "return.status", "Return", r.id, { status: r.status }, { status: to, orderId: r.orderId, notify: opts.notify, ...(opts.refund ? { refund: opts.refund } : {}), ...(mail ? { mailError: mail } : {}) });
  return { ok: true, message: `${RETURN_STATUS[to]?.label ?? to}${mail ? ` — το email δεν στάλθηκε (${mail})` : opts.notify && (to === "received" || to === "refunded") ? " — ο πελάτης ενημερώθηκε" : ""}.` };
}
/** Ο αριθμός RMA όπως τον βλέπει ο πελάτης (app/api/account/returns). */
export const rmaOf = (id: string) => `RMA-${id.slice(-6).toUpperCase()}`;

/**
 * Καταγραφή επιστροφής χρημάτων που έγινε εκτός συστήματος (τράπεζα / Viva / ταμείο) — δεν κινεί χρήματα. Η πληρωμή
 * γίνεται «Επιστράφηκαν» (ή «Μερική επιστροφή») και μένει σημείωση με ποσό και τρόπο.
 */
export async function recordRefund(orderId: string, amount: number, method: string, staff: Staff): Promise<Result> {
  const o = await db.order.findUnique({ where: { id: orderId }, select: { id: true, total: true, payment: { select: { status: true } } } });
  if (!o?.payment) return { ok: false, error: "Η παραγγελία δεν έχει πληρωμή." };
  const total = Number(o.total), amt = Math.round(Number(amount) * 100) / 100;
  if (!(amt > 0) || amt > total + 0.001) return { ok: false, error: `Το ποσό πρέπει να είναι από 0,01 έως ${total.toLocaleString("el-GR", { minimumFractionDigits: 2 })} €.` };
  const status = amt >= total - 0.001 ? "refunded" : "partially-refunded";
  await db.payment.update({ where: { orderId }, data: { status } });
  const text = `Επιστροφή χρημάτων ${amt.toLocaleString("el-GR", { style: "currency", currency: "EUR" })}${method.trim() ? ` · ${method.trim().slice(0, 120)}` : ""}`;
  await db.orderNote.create({ data: { orderId, text, staffId: staff.id, staffName: staff.name ?? null, pinned: true } });
  await audit(staff.id, "order.refund", "Order", orderId, { payment: o.payment.status }, { payment: status, amount: amt, method });
  return { ok: true, message: `Καταγράφηκε: ${text}.` };
}
