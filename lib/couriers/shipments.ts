import "server-only";
import { db } from "@/lib/db";
import { shippingLimits } from "@/lib/shipping/bulky-server";
import { genikiCancel, genikiClose, genikiConfig, genikiCreateVoucher, genikiLabels, genikiTrack, GenikiError } from "./geniki/client";
import { e164, stateFromCheckpoint, zip5 } from "./geniki/soap";
import { renderTemplate } from "@/lib/email/templates";
import { emailCtx } from "@/lib/email/layout";
import { sendMail } from "@/lib/email/send";

/**
 * Αποστολές με courier (προς το παρόν Γενική Ταχυδρομική): προσχέδιο από την παραγγελία, έκδοση voucher, ετικέτες,
 * ακύρωση, κλείσιμο ημέρας και παρακολούθηση. Ο courier είναι αυτός που διάλεξε ο πελάτης στο checkout.
 */
export const COD_MAX = 2000; // Γενική: μέγιστη αντικαταβολή μετρητοίς
const DEFAULT_KG = 2; // όταν δεν ξέρουμε το βάρος ενός προϊόντος (βασική χρέωση Γενικής: έως 2 κιλά)
const ACTIVE = ["created", "closed", "in-transit", "out-for-delivery", "attempted", "on-hold", "returning"];

type ShipTo = { firstName?: string; lastName?: string; email?: string; phone?: string; street?: string; number?: string; floor?: string; zip?: string; city?: string; carrier?: string; locker?: unknown };

export interface ShipmentDraft {
  orderId: string; number: string; carrier: string | null; name: string; address: string; city: string; zip: string; phone: string; email: string | null;
  pieces: number; weightKg: number; weightKnown: boolean; cod: number; comments: string; blockers: string[];
}

/** Το προσχέδιο του voucher από την παραγγελία: παραλήπτης, τεμάχια, βάρος (από τα χαρακτηριστικά), αντικαταβολή. */
export async function shipmentDraft(orderId: string): Promise<ShipmentDraft | null> {
  const o = await db.order.findUnique({ where: { id: orderId }, select: { id: true, number: true, status: true, fulfilment: true, shipping: true, total: true, paymentMethod: true, guestEmail: true, customer: { select: { email: true } }, lines: { select: { qty: true, variant: { select: { productId: true } } } }, shipments: { where: { status: { in: ACTIVE } }, select: { id: true } } } });
  if (!o) return null;
  const s = (o.shipping ?? {}) as ShipTo;
  const limits = await shippingLimits(o.lines.map((l) => l.variant.productId));
  let kg = 0, known = true;
  for (const l of o.lines) { const w = limits.get(l.variant.productId)?.weightKg; if (w == null) known = false; kg += (w ?? DEFAULT_KG) * l.qty; }
  const cod = o.paymentMethod === "cod" ? Number(o.total) : 0;
  const blockers: string[] = [];
  if (o.fulfilment !== "courier") blockers.push("Η παραγγελία δεν είναι για αποστολή με courier.");
  if (s.carrier && s.carrier !== "geniki") blockers.push(`Ο πελάτης διάλεξε άλλον courier (${s.carrier}).`);
  if (o.shipments.length) blockers.push("Υπάρχει ήδη ενεργό voucher.");
  if (o.status === "cancelled" || o.status === "returned") blockers.push("Η παραγγελία έχει ακυρωθεί.");
  if (o.status === "pending" && o.paymentMethod !== "cod") blockers.push("Η παραγγελία δεν έχει πληρωθεί ακόμη.");
  if (cod > COD_MAX) blockers.push(`Αντικαταβολή πάνω από ${COD_MAX} €.`);
  if (o.lines.some((l) => limits.get(l.variant.productId)?.courier === false)) blockers.push("Περιέχει μεγάλη συσκευή (μόνο από κατάστημα).");
  return {
    orderId: o.id, number: o.number, carrier: s.carrier ?? null,
    name: `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim(), address: [s.street, s.number].filter(Boolean).join(" ") + (s.floor ? `, ${s.floor}ος` : ""),
    city: s.city ?? "", zip: zip5(s.zip), phone: e164(s.phone), email: s.email ?? o.customer?.email ?? o.guestEmail ?? null,
    pieces: Math.max(1, o.lines.reduce((a, l) => a + l.qty, 0)), weightKg: Math.max(0.5, Math.round(kg * 10) / 10), weightKnown: known, cod, comments: "", blockers,
  };
}

/** Επόμενη εργάσιμη για την παραλαβή από τη Γενική (σήμερα αν είναι εργάσιμη). */
function receivedDate(now = new Date()) {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export async function createShipment(orderId: string, input: { weightKg: number; pieces: number; comments?: string }, staffId: string | null) {
  const c = await genikiConfig();
  if (!c) return { ok: false as const, error: "Συμπλήρωσε τα στοιχεία της Γενικής Ταχυδρομικής (Ρυθμίσεις → Αποστολές & courier)." };
  const d = await shipmentDraft(orderId);
  if (!d) return { ok: false as const, error: "Η παραγγελία δεν βρέθηκε." };
  if (d.blockers.length) return { ok: false as const, error: d.blockers.join(" ") };
  if (!d.name || !d.address || !d.city || d.zip.length !== 5) return { ok: false as const, error: "Λείπουν στοιχεία παραλήπτη (ονοματεπώνυμο, διεύθυνση, πόλη, ΤΚ)." };
  const weightKg = Math.min(999, Math.max(0.5, Number(input.weightKg) || d.weightKg)), pieces = Math.min(99, Math.max(1, Math.round(Number(input.pieces) || d.pieces)));
  const services = d.cod > 0 ? "αμ" : "";
  try {
    const v = await genikiCreateVoucher(c, {
      OrderId: d.number, Name: d.name.slice(0, 60), Address: d.address.slice(0, 80), Email: d.email ?? undefined, City: d.city.slice(0, 40), Telephone: d.phone, Zip: d.zip,
      Pieces: pieces, Weight: weightKg, Comments: (input.comments ?? "").slice(0, 40) || undefined, Services: services || undefined, CodAmount: d.cod, InsAmount: 0, ReceivedDate: receivedDate(),
    });
    const sh = await db.shipment.create({ data: { orderId, carrier: "geniki", env: c.env, jobId: v.jobId, voucher: v.voucher, subVouchers: v.subVouchers, pieces, weightKg, codAmount: d.cod, services: services || null, createdById: staffId } });
    await db.order.update({ where: { id: orderId }, data: { tracking: v.voucher, courier: "geniki", ...(d.cod === 0 ? { status: "processing" } : {}) } });
    return { ok: true as const, shipment: sh };
  } catch (e) {
    return { ok: false as const, error: e instanceof GenikiError ? e.message : "Η σύνδεση με τη Γενική απέτυχε." };
  }
}

export async function cancelShipment(id: string) {
  const sh = await db.shipment.findUnique({ where: { id }, select: { id: true, jobId: true, status: true, orderId: true, voucher: true, carrier: true } });
  if (!sh || sh.carrier !== "geniki" || !sh.jobId) return { ok: false as const, error: "Η αποστολή δεν βρέθηκε." };
  if (sh.status !== "created") return { ok: false as const, error: "Ακυρώνεται μόνο πριν το κλείσιμο ημέρας. Μετά, επικοινωνία με το κατάστημα της Γενικής." };
  const c = await genikiConfig();
  if (!c) return { ok: false as const, error: "Λείπουν τα στοιχεία της Γενικής." };
  try { await genikiCancel(c, sh.jobId, true); } catch (e) { return { ok: false as const, error: e instanceof GenikiError ? e.message : "Η ακύρωση απέτυχε." }; }
  await db.shipment.update({ where: { id }, data: { status: "cancelled", cancelledAt: new Date() } });
  await db.order.updateMany({ where: { id: sh.orderId, tracking: sh.voucher }, data: { tracking: null } });
  return { ok: true as const };
}

/** Ετικέτες PDF για όσα vouchers δοθούν (ίδιο περιβάλλον). */
export async function shipmentLabels(ids: string[]) {
  const c = await genikiConfig();
  if (!c) throw new GenikiError("Λείπουν τα στοιχεία της Γενικής.");
  const rows = await db.shipment.findMany({ where: { id: { in: ids }, carrier: "geniki", status: { not: "cancelled" } }, select: { voucher: true } });
  const vouchers = rows.map((r) => r.voucher).filter((v): v is string => !!v);
  if (!vouchers.length) throw new GenikiError("Δεν υπάρχουν vouchers για εκτύπωση.");
  return genikiLabels(c, vouchers);
}

const STATE_KEY = "couriers.geniki";
/**
 * Κλείσιμο ημέρας: η Γενική ενημερώνεται για όσα vouchers εκδόθηκαν από το προηγούμενο κλείσιμο (πρόταση της τεκμηρίωσης:
 * ClosePendingJobsByDate από την τελευταία φορά). Οι αποστολές γίνονται «closed» και οι παραγγελίες «shipped».
 */
export async function closeDay() {
  const c = await genikiConfig();
  if (!c) return { ok: false as const, error: "Λείπουν τα στοιχεία της Γενικής." };
  const row = await db.setting.findUnique({ where: { section: STATE_KEY } }).catch(() => null);
  const state = (row?.data ?? {}) as { lastClosedAt?: Record<string, string> };
  const now = new Date();
  const open = await db.shipment.findMany({ where: { carrier: "geniki", env: c.env, status: "created" }, select: { id: true, orderId: true, createdAt: true }, orderBy: { createdAt: "asc" } });
  const from = new Date(Math.min(open[0]?.createdAt.getTime() ?? now.getTime(), state.lastClosedAt?.[c.env] ? new Date(state.lastClosedAt[c.env]).getTime() : now.getTime()) - 60_000);
  try { await genikiClose(c, from, now); } catch (e) { return { ok: false as const, error: e instanceof GenikiError ? e.message : "Το κλείσιμο απέτυχε." }; }
  await db.shipment.updateMany({ where: { id: { in: open.map((s) => s.id) } }, data: { status: "closed", closedAt: now } });
  await db.order.updateMany({ where: { id: { in: open.map((s) => s.orderId) }, status: { in: ["paid", "processing", "pending"] } }, data: { status: "shipped" } });
  if (c.env === "live") await notifyShipped(open.map((s) => s.orderId)).catch(() => null);
  const data = { ...state, lastClosedAt: { ...(state.lastClosedAt ?? {}), [c.env]: now.toISOString() } };
  await db.setting.upsert({ where: { section: STATE_KEY }, update: { data }, create: { section: STATE_KEY, data } });
  return { ok: true as const, closed: open.length };
}

/**
 * Παρακολούθηση (cron): αποστολές που έφυγαν και δεν έχουν παραδοθεί, έλεγχος κάθε 2 ώρες. Παράδοση → η παραγγελία
 * «delivered»· επιστροφή → «returned».
 */
export async function trackShipments(limit = 100) {
  const c = await genikiConfig();
  if (!c) return { checked: 0, updated: 0, skipped: "no-config" };
  const due = await db.shipment.findMany({ where: { carrier: "geniki", env: c.env, status: { in: ["closed", "in-transit", "out-for-delivery", "attempted", "on-hold", "returning"] }, OR: [{ trackedAt: null }, { trackedAt: { lt: new Date(Date.now() - 2 * 3600_000) } }] }, select: { id: true, orderId: true, voucher: true, status: true }, take: limit, orderBy: { trackedAt: { sort: "asc", nulls: "first" } } });
  let updated = 0;
  for (const s of due) {
    if (!s.voucher) continue;
    try {
      const t = await genikiTrack(c, s.voucher);
      const last = t.checkpoints.at(-1) ?? null;
      const state = t.deliveredAt || /DELIVERED/i.test(t.status ?? "") ? (/RETURN/i.test(t.status ?? "") ? "returned" : "delivered") : stateFromCheckpoint(last?.code) ?? s.status;
      await db.shipment.update({ where: { id: s.id }, data: { status: state === "created" ? s.status : state, trackedAt: new Date(), lastCheckpoint: last ?? undefined, error: null, ...(state === "delivered" ? { deliveredAt: t.deliveredAt ? new Date(t.deliveredAt) : new Date() } : {}) } });
      if (state === "delivered") await db.order.updateMany({ where: { id: s.orderId, status: { not: "delivered" } }, data: { status: "delivered" } });
      if (state === "returned") await db.order.updateMany({ where: { id: s.orderId }, data: { status: "returned" } });
      if (state !== s.status) updated++;
    } catch (e) {
      await db.shipment.update({ where: { id: s.id }, data: { trackedAt: new Date(), error: e instanceof Error ? e.message.slice(0, 300) : "tracking failed" } });
    }
  }
  return { checked: due.length, updated };
}

/** Email «Η παραγγελία στάλθηκε» (μόνο σε vouchers παραγωγής), με σύνδεσμο στην παρακολούθηση του site. */
async function notifyShipped(orderIds: string[]) {
  const { baseUrl } = await emailCtx();
  const orders = await db.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, number: true, tracking: true, shipping: true, guestEmail: true, customer: { select: { email: true, firstName: true } } } });
  for (const o of orders) {
    const s = (o.shipping ?? {}) as ShipTo;
    const to = s.email ?? o.customer?.email ?? o.guestEmail;
    if (!to || !o.tracking) continue;
    const m = await renderTemplate("order-shipped", { firstName: s.firstName ?? o.customer?.firstName ?? "", number: o.number, courier: "Γενική Ταχυδρομική", code: o.tracking, url: `${baseUrl}/entopismos?no=${encodeURIComponent(o.number)}`, eta: "1–2 εργάσιμες" });
    await sendMail({ to, template: "order-shipped", meta: { orderId: o.id }, ...m });
  }
}
