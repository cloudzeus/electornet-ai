"use server";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { normalizeRates, quoteRate } from "@/lib/delivery/rates";
import { isCarrierRole, normalizeDelivery, type StepKey } from "@/lib/delivery/routing";
import { carrierUsage, importCarriersFromSoftOne } from "@/lib/delivery/carrier-import";
import { chooseCarrier, freightOptions, markStep, rerouteOrder, resetPartnerCache, resetRateCache } from "@/lib/delivery/server";

const RATE_CARRIERS = /^(acs|geniki|elta|boxnow|freight|carrier:[\w-]{8,40})$/;

/** Αποθήκευση τιμοκαταλόγου (πρόχειρο ή δημοσίευση). Η δημοσίευση αποσύρει τον προηγούμενο δημοσιευμένο του ίδιου μεταφορέα. */
export async function saveRateTableAction(input: { id?: string | null; carrier: string; name: string; data: unknown; publish: boolean; validFrom?: string | null }) {
  const user = await requirePermission("settings.write");
  if (!RATE_CARRIERS.test(input.carrier)) throw new Error("Άγνωστος μεταφορέας");
  const data = normalizeRates(input.data) as unknown as Prisma.InputJsonValue;
  const name = input.name.trim().slice(0, 80) || "Τιμοκατάλογος";
  const validFrom = input.validFrom ? new Date(input.validFrom) : null;
  const row = await db.$transaction(async (tx) => {
    if (input.publish) await tx.shippingRateTable.updateMany({ where: { carrier: input.carrier, status: "published", NOT: input.id ? { id: input.id } : undefined }, data: { status: "draft" } });
    const fields = { carrier: input.carrier, name, data, status: input.publish ? "published" : "draft", validFrom, updatedById: user.id };
    return input.id ? tx.shippingRateTable.update({ where: { id: input.id }, data: fields }) : tx.shippingRateTable.create({ data: fields });
  });
  await audit(user.id, input.publish ? "shipping.rates.publish" : "shipping.rates.save", "ShippingRateTable", row.id, null, { carrier: row.carrier, name });
  resetRateCache();
  revalidatePath("/admin/apostoles/timokatalogoi");
  return { id: row.id, status: row.status };
}

/** Δοκιμαστικός υπολογισμός με τον τιμοκατάλογο της φόρμας (χωρίς αποθήκευση). */
export async function testRateAction(data: unknown, zip: string, kg: number, goods: number, bulky: boolean) {
  await requirePermission("catalog.products.read");
  const q = quoteRate(normalizeRates(data), { zip, kg: Math.max(0, Number(kg) || 0), goods: Math.round((Number(goods) || 0) * 100), bulky });
  return q && { fee: q.fee, baseFee: q.baseFee, cost: q.cost, zone: q.zone.name, remote: q.remote, free: q.free };
}

/** Ρόλος και στοιχεία μεταφορέα (πρακτορεία). Δεν αγγίζει το SoftOne. */
export async function saveCarrierAction(id: string, f: { role: string; afm?: string; address?: string; city?: string; zip?: string; hours?: string; email?: string; phone?: string; notes?: string }) {
  const user = await requirePermission("settings.write");
  if (!isCarrierRole(f.role)) throw new Error("Άγνωστος ρόλος");
  const t = (s: string | undefined, n = 120) => (s ?? "").trim().slice(0, n) || null;
  const before = await db.carrier.findUnique({ where: { id }, select: { role: true } });
  await db.carrier.update({ where: { id }, data: { role: f.role, ...(f.afm !== undefined ? { afm: (f.afm ?? "").replace(/\D/g, "").slice(0, 12) || null } : {}), address: t(f.address), city: t(f.city, 60), zip: t(f.zip, 5), hours: t(f.hours), email: t(f.email), phone: t(f.phone, 30), notes: t(f.notes, 1000) } });
  await audit(user.id, "carrier.update", "Carrier", id, before, { role: f.role });
  revalidatePath(`/admin/apostoles/praktoreia/${id}`);
  revalidatePath("/admin/apostoles/praktoreia");
  return { ok: true as const };
}

/** Νέος μεταφορέας μόνο στο eshop (το SoftOne είναι σε παύση εγγραφών). Αν υπάρχει ίδιο όνομα ή ΑΦΜ, επιστρέφει τον υπάρχοντα. */
export async function createCarrierAction(f: { role: string; name: string; phone?: string; email?: string; afm?: string; address?: string; city?: string; zip?: string; hours?: string; notes?: string; partnerIds?: string[] }) {
  const user = await requirePermission("settings.write");
  if (!isCarrierRole(f.role)) throw new Error("Άγνωστος ρόλος");
  const t = (s: string | undefined, n = 120) => (s ?? "").trim().slice(0, n) || null;
  const name = (f.name ?? "").trim().replace(/\s+/g, " ").toUpperCase().slice(0, 120);
  if (name.length < 3) throw new Error("Γράψε όνομα (τουλάχιστον 3 γράμματα)");
  const afm = (f.afm ?? "").replace(/\D/g, "").slice(0, 12) || null;
  const dup = await db.carrier.findFirst({ where: { OR: [{ name: { equals: name, mode: "insensitive" } }, ...(afm ? [{ afm }] : [])] }, select: { id: true, name: true } });
  if (dup) return { ok: false as const, existing: dup };
  let code = `AG-${name}`.slice(0, 60);
  if (await db.carrier.findUnique({ where: { code }, select: { id: true } })) code = `${code}-${Date.now().toString(36)}`;
  const c = await db.carrier.create({ data: { code, name, role: f.role, afm, phone: t(f.phone, 30), email: t(f.email), address: t(f.address), city: t(f.city, 60), zip: t(f.zip, 5), hours: t(f.hours), notes: t(f.notes, 1000) } });
  const ids = (f.partnerIds ?? []).slice(0, 50);
  if (ids.length && f.role === "agency") await db.partner.updateMany({ where: { id: { in: ids } }, data: { agencyId: c.id } });
  await audit(user.id, "carrier.create", "Carrier", c.id, null, { name, role: f.role, partners: ids.length });
  resetPartnerCache();
  revalidatePath("/admin/apostoles/praktoreia");
  return { ok: true as const, id: c.id };
}

/** Εισαγωγή από SoftOne: μεταφορείς, οχήματα, προεπιλεγμένος μεταφορέας συνεργατών. Μόνο ανάγνωση στο SoftOne. */
export async function importCarriersAction() {
  const user = await requirePermission("settings.write");
  const r = await importCarriersFromSoftOne();
  await audit(user.id, "carrier.import", "Carrier", "softone", null, r);
  revalidatePath("/admin/apostoles/praktoreia");
  return r;
}

/** Συνεργάτης ↔ πρακτορείο από την καρτέλα του μεταφορέα (carrierId=null: αφαίρεση). */
export async function setPartnerAgencyAction(partnerId: string, carrierId: string | null) {
  const user = await requirePermission("stores.partners.write");
  if (carrierId && !(await db.carrier.findUnique({ where: { id: carrierId }, select: { id: true } }))) throw new Error("Δεν βρέθηκε ο μεταφορέας");
  const before = await db.partner.findUnique({ where: { id: partnerId }, select: { agencyId: true } });
  if (!before) throw new Error("Δεν βρέθηκε ο συνεργάτης");
  await db.partner.update({ where: { id: partnerId }, data: { agencyId: carrierId } });
  await audit(user.id, "partner.agency", "Partner", partnerId, before, { agencyId: carrierId });
  resetPartnerCache();
  revalidatePath(`/admin/apostoles/praktoreia/${carrierId ?? before.agencyId ?? ""}`);
  revalidatePath(`/admin/synergates/${partnerId}`);
  return { ok: true as const };
}

/** Χρήση του μεταφορέα στα παραστατικά του SoftOne (12 μήνες). */
export async function carrierUsageAction(carrierId: string, force = false) {
  await requirePermission("stores.partners.read");
  try { return { ok: true as const, usage: await carrierUsage(carrierId, force) }; } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "Σφάλμα SoftOne" }; }
}

/** Ρόλοι για πολλούς μαζί (π.χ. «αποδοχή όλων των προτάσεων»). */
export async function setRolesAction(changes: { id: string; role: string }[]) {
  const user = await requirePermission("settings.write");
  const ok = changes.filter((c) => isCarrierRole(c.role)).slice(0, 300);
  await db.$transaction(ok.map((c) => db.carrier.update({ where: { id: c.id }, data: { role: c.role } })));
  await audit(user.id, "carrier.roles", "Carrier", "bulk", null, { count: ok.length });
  revalidatePath("/admin/apostoles/praktoreia");
  return { count: ok.length };
}

/** Αρχικοποίηση συνεργάτη για το eshop: περιοχές, δυνατότητες, πρακτορείο. */
export async function savePartnerDeliveryAction(partnerId: string, raw: unknown, agencyId: string | null) {
  const user = await requirePermission("stores.partners.write");
  const delivery = normalizeDelivery(raw);
  if (agencyId && !(await db.carrier.findUnique({ where: { id: agencyId }, select: { id: true } }))) throw new Error("Δεν βρέθηκε το πρακτορείο");
  const before = await db.partner.findUnique({ where: { id: partnerId }, select: { delivery: true, agencyId: true } });
  await db.partner.update({ where: { id: partnerId }, data: { delivery: delivery as unknown as Prisma.InputJsonValue, agencyId } });
  await audit(user.id, "partner.delivery", "Partner", partnerId, before, { delivery, agencyId });
  resetPartnerCache();
  revalidatePath(`/admin/synergates/${partnerId}`);
  return { ok: true as const, zips: delivery.zips.length };
}

/** Τι θα άλλαζε: πόσες παραγγελίες μεταφορικής / ραντεβού των τελευταίων 6 μηνών είχαν Τ.Κ. στη λίστα. */
export async function partnerImpactAction(zipsText: string) {
  await requirePermission("stores.partners.read");
  const zips = normalizeDelivery({ zips: zipsText }).zips;
  if (!zips.length) return { orders: 0, total: 0 };
  const since = new Date(Date.now() - 183 * 86400_000);
  const rows = await db.order.findMany({ where: { createdAt: { gte: since }, fulfilment: { in: ["freight", "appointment"] } }, select: { shipping: true }, take: 5000 });
  const hit = rows.filter((r) => { const z = String((r.shipping as Record<string, unknown> | null)?.zip ?? ""); return zips.some((p) => z.startsWith(p)); });
  return { orders: hit.length, total: rows.length };
}

/** Κέντρο ελέγχου: ένα βήμα έγινε (ή αναίρεση). */
export async function markStepAction(orderId: string, key: StepKey, f: { ref?: string; proof?: string; note?: string; undo?: boolean }) {
  const user = await requirePermission("orders.write");
  await markStep(orderId, key, user.id, f);
  await audit(user.id, f.undo ? "route.step.undo" : "route.step", "Order", orderId, null, { key, ref: f.ref ?? null });
  revalidatePath("/admin/apostoles/kentro");
  return { ok: true as const };
}

export async function freightOptionsAction(orderId: string) {
  await requirePermission("orders.read");
  return freightOptions(orderId);
}

/** Μεταφορική απευθείας στον πελάτη, όταν δεν εξυπηρετεί συνεργάτης. */
export async function chooseCarrierAction(orderId: string, carrierId: string, cost: number | null) {
  const user = await requirePermission("orders.write");
  await chooseCarrier(orderId, carrierId, user.id, cost);
  await audit(user.id, "route.carrier", "Order", orderId, null, { carrierId, cost });
  revalidatePath("/admin/apostoles/kentro");
  return { ok: true as const };
}

export async function rerouteAction(orderId: string) {
  const user = await requirePermission("orders.write");
  const r = await rerouteOrder(orderId, user.id);
  await audit(user.id, "route.reroute", "Order", orderId, null, { mode: r.mode });
  revalidatePath("/admin/apostoles/kentro");
  return { mode: r.mode, reason: r.reason };
}
