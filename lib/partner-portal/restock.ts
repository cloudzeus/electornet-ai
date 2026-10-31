import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/email/send";
import { renderTemplate } from "@/lib/email/templates";
import { distanceKm } from "@/lib/stores/geocode";
import { portalLog } from "./log";
import { portalUrl } from "./url";
import { isShipMode, linesOf, MAX_QTY, modeOf, OPEN_RESTOCK, SHIP_MODE, type RestockLine, type ShipMode } from "./restock-model";

/**
 * Αναπλήρωση αποθέματος από τη μαμά εταιρία: το μέλος το ζητά από μια παραγγελία του eshop στην πύλη (υποχρεούται να την
 * παραδώσει — δεν εγκρίνει/απορρίπτει παραγγελίες), η Euronics το εγκρίνει στη διαχείριση → παραγγελία αναπλήρωσης και
 * ενημέρωση του μέλους (πύλη + email). Τρόποι: μαζική αποστολή, άμεσα, ή παραλαβή από το πλησιέστερο κατάστημα με απόθεμα.
 * Ροή: requested → approved → (pickup: ready →) shipped · ή rejected / cancelled. Το SoftOne έρχεται αργότερα.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
type MailEvent = "approved" | "rejected" | "ready" | "cancelled";

/** ΑΝ-YYYYMMDD-NNN — αύξων ανά ημέρα (Αθήνα). */
async function nextNumber(tx: Prisma.TransactionClient) {
  const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Athens" }).replace(/-/g, "");
  const prefix = `ΑΝ-${day}-`;
  const last = await tx.partnerRestock.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: "desc" }, select: { number: true } });
  const n = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
  return prefix + String(n).padStart(3, "0");
}

/** Αίτημα από την πύλη. Γραμμές μόνο από τα προϊόντα της παραγγελίας. */
export async function createRestock(input: { partnerId: string; accountId: string; orderId: string; lines: { variantId: string; qty: number }[]; shipMode: string; note?: string }): Promise<Result<{ number: string }>> {
  if (!isShipMode(input.shipMode)) return { ok: false, error: "Διαλέξτε τρόπο αποστολής." };
  const order = await db.order.findFirst({ where: { id: input.orderId, pickupStore: { partnerId: input.partnerId } }, select: { id: true, number: true, pickupStoreId: true, lines: { select: { variantId: true, erpCode: true, title: true, qty: true } } } });
  if (!order) return { ok: false, error: "Η παραγγελία δεν βρέθηκε." };
  const open = await db.partnerRestock.findFirst({ where: { orderId: order.id, status: { in: OPEN_RESTOCK } }, select: { number: true } });
  if (open) return { ok: false, error: `Υπάρχει ήδη ανοιχτό αίτημα (${open.number}) για αυτή την παραγγελία.` };
  const lines: RestockLine[] = [];
  for (const want of input.lines) {
    const qty = Math.floor(Number(want.qty));
    if (!qty) continue;
    const l = order.lines.find((x) => x.variantId === want.variantId);
    if (!l) return { ok: false, error: "Ένα προϊόν δεν ανήκει στην παραγγελία." };
    if (qty < 1 || qty > MAX_QTY) return { ok: false, error: `Ποσότητα από 1 έως ${MAX_QTY}.` };
    lines.push({ variantId: l.variantId, erpCode: l.erpCode, title: l.title, qty });
  }
  if (!lines.length) return { ok: false, error: "Διαλέξτε τουλάχιστον ένα προϊόν." };
  const note = input.note?.trim().slice(0, 1000) || null;
  const r = await db.$transaction(async (tx) => {
    const number = await nextNumber(tx);
    return tx.partnerRestock.create({ data: { number, partnerId: input.partnerId, storeId: order.pickupStoreId, orderId: order.id, accountId: input.accountId, lines: lines as unknown as Prisma.InputJsonValue, shipMode: input.shipMode, note } });
  });
  await portalLog(input.partnerId, "restock", true, `Αίτημα αναπλήρωσης ${r.number} για την παραγγελία ${order.number} (${SHIP_MODE[input.shipMode].label.toLowerCase()})`, { accountId: input.accountId, detail: { restockId: r.id, lines: lines.length } });
  return { ok: true, number: r.number };
}

/** Ακύρωση από το μέλος — μόνο όσο αναμένει έγκριση. */
export async function cancelRestock(partnerId: string, accountId: string, id: string): Promise<Result> {
  const r = await db.partnerRestock.updateMany({ where: { id, partnerId, status: "requested" }, data: { status: "cancelled" } });
  if (!r.count) return { ok: false, error: "Το αίτημα δεν μπορεί πια να ακυρωθεί." };
  await portalLog(partnerId, "restock", true, "Ακύρωση αιτήματος αναπλήρωσης από το μέλος", { accountId, detail: { restockId: id } });
  return { ok: true };
}

export type PickupOption = { id: string; name: string; city: string; km: number | null; covered: number; total: number; own: boolean };

/**
 * Καταστήματα για παραλαβή: όλα τα ενεργά εκτός από αυτό του μέλους, με το πόσες γραμμές καλύπτει το απόθεμά τους
 * (StoreStock) και την απόσταση από το κατάστημα του αιτήματος. Πρώτα όσα τα καλύπτουν όλα, μετά κατά απόσταση.
 */
export async function pickupOptions(restockId: string, limit = 12): Promise<PickupOption[]> {
  const r = await db.partnerRestock.findUnique({ where: { id: restockId }, select: { lines: true, partnerId: true, store: { select: { id: true, lat: true, lng: true } } } });
  if (!r) return [];
  const lines = linesOf(r.lines);
  const stocks = await db.storeStock.findMany({ where: { variantId: { in: lines.map((l) => l.variantId) }, qty: { gt: 0 } }, select: { storeId: true, variantId: true, qty: true } });
  const stores = await db.store.findMany({ where: { active: true, ...(r.store ? { id: { not: r.store.id } } : {}) }, select: { id: true, name: true, city: true, lat: true, lng: true, partnerId: true } });
  const from = r.store && (r.store.lat || r.store.lng) ? r.store : null;
  return stores
    .map((s) => ({
      id: s.id, name: s.name, city: s.city, own: s.partnerId === r.partnerId,
      km: from && (s.lat || s.lng) ? Math.round(distanceKm(from, s) * 10) / 10 : null,
      covered: lines.filter((l) => stocks.some((x) => x.storeId === s.id && x.variantId === l.variantId && x.qty >= l.qty)).length,
      total: lines.length,
    }))
    .sort((a, b) => Number(b.covered === b.total) - Number(a.covered === a.total) || (a.km ?? 1e9) - (b.km ?? 1e9) || b.covered - a.covered)
    .slice(0, limit);
}

/** Έγκριση (με τον τελικό τρόπο αποστολής και, για παραλαβή, το κατάστημα) ή απόρριψη από τη διαχείριση· email στο μέλος. */
export async function decideRestock(id: string, staffId: string, d: { approve: boolean; mode?: ShipMode; pickupStoreId?: string | null; reply?: string }): Promise<Result<{ mailed: boolean }>> {
  const reply = d.reply?.trim().slice(0, 1000) || null;
  if (!d.approve && !reply) return { ok: false, error: "Γράψε στο μέλος γιατί δεν εγκρίνεται." };
  const cur = await db.partnerRestock.findUnique({ where: { id }, select: { status: true, shipMode: true } });
  if (!cur) return { ok: false, error: "Το αίτημα δεν βρέθηκε." };
  if (cur.status !== "requested") return { ok: false, error: "Το αίτημα έχει ήδη απαντηθεί ή ακυρωθεί." };
  const mode = d.approve ? (isShipMode(d.mode) ? d.mode : modeOf(cur)) : null;
  let pickupStoreId: string | null = null;
  if (mode === "pickup") {
    if (!d.pickupStoreId) return { ok: false, error: "Διάλεξε το κατάστημα παραλαβής." };
    const s = await db.store.findFirst({ where: { id: d.pickupStoreId, active: true }, select: { id: true } });
    if (!s) return { ok: false, error: "Το κατάστημα παραλαβής δεν βρέθηκε." };
    pickupStoreId = s.id;
  }
  const r = await db.partnerRestock.update({ where: { id }, data: { status: d.approve ? "approved" : "rejected", approvedMode: mode, pickupStoreId, reply, decidedBy: staffId, decidedAt: new Date(), seenAt: null } });
  await portalLog(r.partnerId, "restock", d.approve, d.approve ? `Εγκρίθηκε η αναπλήρωση ${r.number} — ${SHIP_MODE[mode!].label.toLowerCase()}` : `Δεν εγκρίθηκε η αναπλήρωση ${r.number}`, { staffId, detail: { restockId: r.id, reply, pickupStoreId } });
  return { ok: true, mailed: await mailMember(r.id, d.approve ? "approved" : "rejected") };
}

/** Επόμενο βήμα μετά την έγκριση: παραλαβή → «έτοιμο» → «παραλήφθηκε»· αποστολή → «στάλθηκε». */
export async function advanceRestock(id: string, staffId: string, to: "ready" | "shipped"): Promise<Result<{ mailed: boolean }>> {
  const cur = await db.partnerRestock.findUnique({ where: { id }, select: { status: true, shipMode: true, approvedMode: true, partnerId: true, number: true } });
  if (!cur) return { ok: false, error: "Το αίτημα δεν βρέθηκε." };
  const pickup = modeOf(cur) === "pickup";
  const allowed = to === "ready" ? pickup && cur.status === "approved" : pickup ? cur.status === "ready" : cur.status === "approved";
  if (!allowed) return { ok: false, error: "Η ενέργεια δεν ταιριάζει στην κατάσταση του αιτήματος." };
  await db.partnerRestock.update({ where: { id }, data: to === "ready" ? { status: "ready", readyAt: new Date(), seenAt: null } : { status: "shipped", shippedAt: new Date(), seenAt: null } });
  const label = to === "ready" ? "Έτοιμη για παραλαβή" : pickup ? "Παραλήφθηκε" : "Στάλθηκε";
  await portalLog(cur.partnerId, "restock", true, `${label} η αναπλήρωση ${cur.number}`, { staffId, detail: { restockId: id } });
  return { ok: true, mailed: to === "ready" ? await mailMember(id, "ready") : false };
}

/** Ακύρωση από τη διαχείριση (π.χ. το είδος δεν ήρθε) — μετά την έγκριση, με απάντηση προς το μέλος. */
export async function staffCancelRestock(id: string, staffId: string, reply: string): Promise<Result<{ mailed: boolean }>> {
  const text = reply.trim().slice(0, 1000);
  if (!text) return { ok: false, error: "Γράψε στο μέλος γιατί ακυρώνεται." };
  const r = await db.partnerRestock.updateMany({ where: { id, status: { in: OPEN_RESTOCK } }, data: { status: "cancelled", reply: text, decidedBy: staffId, decidedAt: new Date(), seenAt: null } });
  if (!r.count) return { ok: false, error: "Το αίτημα έχει ήδη κλείσει." };
  const x = await db.partnerRestock.findUnique({ where: { id }, select: { partnerId: true, number: true } });
  if (x) await portalLog(x.partnerId, "restock", false, `Ακυρώθηκε από την Euronics η αναπλήρωση ${x.number}`, { staffId, detail: { restockId: id, reply: text } });
  return { ok: true, mailed: await mailMember(id, "cancelled") };
}

/** Email στον λογαριασμό που έκανε το αίτημα (αλλιώς στους λογαριασμούς πύλης του μέλους). Ποτέ δεν πετά. */
async function mailMember(id: string, event: MailEvent): Promise<boolean> {
  try {
    const r = await db.partnerRestock.findUnique({ where: { id }, include: { partner: { select: { name: true } }, order: { select: { number: true } }, pickupStore: { select: { name: true, address: true, city: true, phone: true } } } });
    if (!r) return false;
    const accounts = await db.partnerAccount.findMany({
      where: r.accountId ? { id: r.accountId, active: true } : { active: true, contact: { partnerId: r.partnerId } },
      select: { email: true, contact: { select: { name: true } } },
    });
    const lines = linesOf(r.lines).map((l) => ({ title: l.title, qty: l.qty }));
    const p = r.pickupStore;
    let sent = false;
    for (const a of accounts) {
      const m = await renderTemplate("partner-restock-decided", { name: a.contact.name, partner: r.partner.name, number: r.number, order: r.order?.number ?? null, event, mode: SHIP_MODE[modeOf(r)].label, pickup: p ? [p.name, [p.address, p.city].filter(Boolean).join(", "), p.phone].filter(Boolean).join(" · ") : null, reply: r.reply, lines, url: portalUrl("/paraggelies") });
      await sendMail({ to: a.email, subject: m.subject, html: m.html, text: m.text, template: "partner-restock-decided", meta: { restockId: r.id, event } });
      sent = true;
    }
    return sent;
  } catch {
    return false;
  }
}

/** Αποφάσεις που δεν έχει δει ακόμη το μέλος (ειδοποίηση στην αρχική της πύλης). */
export const unseenRestocks = (partnerId: string) =>
  db.partnerRestock.findMany({ where: { partnerId, seenAt: null, status: { notIn: ["requested"] }, decidedAt: { not: null } }, orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, number: true, status: true, approvedMode: true, shipMode: true, reply: true, order: { select: { number: true } }, pickupStore: { select: { name: true, city: true } } } });

export const markRestocksSeen = (partnerId: string, ids: string[]) =>
  ids.length ? db.partnerRestock.updateMany({ where: { partnerId, id: { in: ids }, seenAt: null }, data: { seenAt: new Date() } }) : Promise.resolve({ count: 0 });
