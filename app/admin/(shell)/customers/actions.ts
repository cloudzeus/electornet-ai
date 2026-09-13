"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { pushCustomerToErp, pullCustomerFromErp, searchErpCustomers, linkCustomerToErp } from "@/lib/softone/customers";
import { requestPasswordReset } from "@/lib/account/password-reset";

export interface CustomerInput {
  type: "individual" | "business"; email: string; firstName: string; lastName: string; company: string; vatNumber: string; doy: string; profession: string;
  phone: string; mobile: string; birthday: string; gender: string; status: "active" | "blocked"; newsletter: boolean; tags: string[]; preferredStoreId: string; loyaltyTier: string; loyaltyCard: string; notes: string;
}
export interface AddressInput { label: string; kind: string; recipient: string; street: string; number: string; floor: string; doorbell: string; city: string; zip: string; region: string; phone: string; notes: string; isDefault: boolean; isBilling: boolean }

const ev = (customerId: string, kind: string, meta: unknown, staffId: string) => db.customerEvent.create({ data: { customerId, kind, meta: meta as object, staffId } }).catch(() => null);
const paths = (id?: string) => { revalidatePath("/admin/customers"); if (id) revalidatePath(`/admin/customers/${id}`); };

export async function saveCustomer(id: string | null, input: CustomerInput) {
  const user = await requirePermission("customers.write");
  const email = input.email.trim().toLowerCase();
  if (!email || !input.firstName.trim() || !input.lastName.trim()) return { ok: false as const, error: "Email, όνομα και επώνυμο είναι υποχρεωτικά." };
  if (input.type === "business" && !input.company.trim()) return { ok: false as const, error: "Η εταιρεία χρειάζεται επωνυμία." };
  if (input.vatNumber && !/^\d{9}$/.test(input.vatNumber.trim())) return { ok: false as const, error: "Το ΑΦΜ έχει 9 ψηφία." };
  const clash = await db.customer.findUnique({ where: { email } });
  if (clash && clash.id !== id) return { ok: false as const, error: "Υπάρχει ήδη πελάτης με αυτό το email." };
  const before = id ? await db.customer.findUnique({ where: { id } }) : null;
  const data = {
    type: input.type, email, firstName: input.firstName.trim(), lastName: input.lastName.trim(), company: input.company.trim() || null, vatNumber: input.vatNumber.trim() || null, doy: input.doy.trim() || null, profession: input.profession.trim() || null,
    phone: input.phone.trim() || null, mobile: input.mobile.trim() || null, birthday: input.birthday ? new Date(input.birthday) : null, gender: input.gender || null, status: input.status, newsletter: input.newsletter, tags: input.tags, preferredStoreId: input.preferredStoreId || null, loyaltyTier: input.loyaltyTier || null, loyaltyCard: input.loyaltyCard.trim() || null, notes: input.notes.trim() || null,
  };
  const row = id ? await db.customer.update({ where: { id }, data }) : await db.customer.create({ data: { ...data, source: "store" } });
  await audit(user.id, id ? "customer.update" : "customer.create", "Customer", row.id, before ? { email: before.email, name: `${before.lastName} ${before.firstName}`, status: before.status, vat: before.vatNumber } : null, { email, name: `${data.lastName} ${data.firstName}`, status: data.status, vat: data.vatNumber });
  await ev(row.id, "profile", { by: user.name, fields: Object.keys(data).filter((k) => before && (before as Record<string, unknown>)[k] !== (data as Record<string, unknown>)[k]) }, user.id);
  if (before && before.newsletter !== data.newsletter) await db.consent.create({ data: { customerId: row.id, topic: "newsletter", channel: "email", granted: data.newsletter, source: "admin", staffId: user.id } });
  if (before?.erpTrdr && before.erpSyncStatus !== "failed") await db.customer.update({ where: { id: row.id }, data: { erpSyncStatus: "queued" } });
  paths(row.id);
  return { ok: true as const, id: row.id };
}

export async function saveAddress(customerId: string, addressId: string | null, a: AddressInput) {
  const user = await requirePermission("customers.write");
  if (!a.street.trim() || !a.city.trim() || !a.zip.trim()) return { ok: false as const, error: "Οδός, πόλη και ΤΚ είναι υποχρεωτικά." };
  const data = { label: a.label.trim() || null, kind: a.kind || "shipping", recipient: a.recipient.trim() || null, street: a.street.trim(), number: a.number.trim() || null, floor: a.floor.trim() || null, doorbell: a.doorbell.trim() || null, city: a.city.trim(), zip: a.zip.trim(), region: a.region.trim(), phone: a.phone.trim() || null, notes: a.notes.trim() || null, isDefault: a.isDefault, isBilling: a.isBilling };
  if (a.isDefault) await db.address.updateMany({ where: { customerId }, data: { isDefault: false } });
  if (a.isBilling) await db.address.updateMany({ where: { customerId }, data: { isBilling: false } });
  const row = addressId ? await db.address.update({ where: { id: addressId }, data }) : await db.address.create({ data: { ...data, customerId } });
  await ev(customerId, "address", { by: user.name, id: row.id, label: row.label, city: row.city }, user.id);
  paths(customerId);
  return { ok: true as const, id: row.id };
}
export async function deleteAddress(customerId: string, addressId: string) {
  const user = await requirePermission("customers.write");
  await db.address.delete({ where: { id: addressId } });
  await ev(customerId, "address", { by: user.name, deleted: addressId }, user.id);
  paths(customerId);
  return { ok: true as const };
}

export async function setConsent(customerId: string, topic: string, channel: string, granted: boolean) {
  const user = await requirePermission("customers.write");
  await db.consent.create({ data: { customerId, topic, channel, granted, source: "admin", staffId: user.id, textVersion: "admin" } });
  if (topic === "newsletter" && channel === "email") await db.customer.update({ where: { id: customerId }, data: { newsletter: granted } });
  await ev(customerId, "consent", { by: user.name, topic, channel, granted }, user.id);
  await audit(user.id, "customer.consent", "Customer", customerId, null, { topic, channel, granted });
  paths(customerId);
  return { ok: true as const };
}

export async function addNote(customerId: string, text: string, pinned: boolean) {
  const user = await requirePermission("customers.write");
  if (!text.trim()) return { ok: false as const, error: "Κενή σημείωση." };
  await db.customerNote.create({ data: { customerId, text: text.trim(), pinned, staffId: user.id, staffName: user.name ?? null } });
  await ev(customerId, "note", { by: user.name }, user.id);
  paths(customerId);
  return { ok: true as const };
}

export async function addLoyalty(customerId: string, points: number, reason: string, note: string) {
  const user = await requirePermission("customers.write");
  if (!points || !Number.isInteger(points)) return { ok: false as const, error: "Δώσε ακέραιο αριθμό πόντων (+/−)." };
  await db.$transaction([db.loyaltyTransaction.create({ data: { customerId, points, reason: reason || "manual", note: note || null, staffId: user.id } }), db.customer.update({ where: { id: customerId }, data: { loyaltyPoints: { increment: points } } })]);
  await ev(customerId, "loyalty", { by: user.name, points, reason }, user.id);
  await audit(user.id, "customer.loyalty", "Customer", customerId, null, { points, reason, note });
  paths(customerId);
  return { ok: true as const };
}

export async function saveDevice(customerId: string, deviceId: string | null, d: { brand: string; title: string; model: string; serial: string; purchasedAt: string; warrantyMonths: number; extendedUntil: string; extendedPlan: string; invoiceNo: string; notes: string }) {
  const user = await requirePermission("customers.write");
  if (!d.brand.trim() || !d.title.trim()) return { ok: false as const, error: "Μάρκα και περιγραφή είναι υποχρεωτικά." };
  const purchasedAt = d.purchasedAt ? new Date(d.purchasedAt) : null;
  const warrantyUntil = purchasedAt ? new Date(new Date(purchasedAt).setMonth(purchasedAt.getMonth() + (d.warrantyMonths || 24))) : null;
  const data = { brand: d.brand.trim(), title: d.title.trim(), model: d.model.trim() || null, serial: d.serial.trim() || null, purchasedAt, warrantyMonths: d.warrantyMonths || 24, warrantyUntil, extendedUntil: d.extendedUntil ? new Date(d.extendedUntil) : null, extendedPlan: d.extendedPlan.trim() || null, invoiceNo: d.invoiceNo.trim() || null, notes: d.notes.trim() || null, registeredBy: "staff" };
  const row = deviceId ? await db.customerDevice.update({ where: { id: deviceId }, data }) : await db.customerDevice.create({ data: { ...data, customerId } });
  await ev(customerId, "device", { by: user.name, id: row.id, title: row.title }, user.id);
  paths(customerId);
  return { ok: true as const, id: row.id };
}

export async function updateTicket(customerId: string, ticketId: string, patch: { status?: string; scheduledAt?: string; slot?: string; technician?: string; note?: string; erpJob?: string }) {
  const user = await requirePermission("service.tickets.write");
  const t = await db.serviceTicket.findUniqueOrThrow({ where: { id: ticketId } });
  const timeline = [...((t.timeline as { at: string; status: string; note?: string; by?: string }[] | null) ?? []), { at: new Date().toISOString(), status: patch.status ?? t.status, note: patch.note ?? "", by: user.name ?? "staff" }];
  await db.serviceTicket.update({ where: { id: ticketId }, data: { status: patch.status ?? t.status, scheduledAt: patch.scheduledAt ? new Date(patch.scheduledAt) : t.scheduledAt, slot: patch.slot ?? t.slot, technician: patch.technician ?? t.technician, erpJob: patch.erpJob ?? t.erpJob, timeline } });
  await ev(customerId, "ticket", { by: user.name, number: t.number, status: patch.status ?? t.status }, user.id);
  paths(customerId);
  return { ok: true as const };
}

export async function createTicket(customerId: string, t: { kind: string; description: string; deviceId: string; mode: string; scheduledAt: string; slot: string; storeId: string }) {
  const user = await requirePermission("service.tickets.write");
  if (!t.description.trim()) return { ok: false as const, error: "Περιέγραψε το αίτημα." };
  const n = await db.serviceTicket.count();
  const row = await db.serviceTicket.create({ data: { number: `SRV-${10001 + n}`, customerId, kind: t.kind || "repair", description: t.description.trim(), deviceId: t.deviceId || null, mode: t.mode || null, scheduledAt: t.scheduledAt ? new Date(t.scheduledAt) : null, slot: t.slot || null, storeId: t.storeId || null, status: t.scheduledAt ? "scheduled" : "new", timeline: [{ at: new Date().toISOString(), status: t.scheduledAt ? "scheduled" : "new", note: "Καταχώρηση από διαχείριση", by: user.name ?? "staff" }] } });
  await ev(customerId, "ticket", { by: user.name, number: row.number, kind: row.kind }, user.id);
  paths(customerId);
  return { ok: true as const, id: row.id };
}

/* ---------- ERP ---------- */
export async function erpPush(customerId: string) {
  const user = await requirePermission("customers.write");
  const r = await pushCustomerToErp(customerId, user.id);
  await audit(user.id, "customer.erp.push", "Customer", customerId, null, r);
  paths(customerId);
  return r;
}
export async function erpPull(customerId: string) {
  const user = await requirePermission("customers.write");
  const r = await pullCustomerFromErp(customerId, user.id);
  paths(customerId);
  return r.ok ? { ok: true as const, name: r.row.NAME, code: r.row.CODE } : r;
}
export async function erpSearch(q: { afm?: string; email?: string; name?: string }) {
  await requirePermission("customers.write");
  try { return { ok: true as const, rows: await searchErpCustomers(q) }; } catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : "Αποτυχία" }; }
}
export async function erpLink(customerId: string, trdr: string) {
  const user = await requirePermission("customers.write");
  const r = await linkCustomerToErp(customerId, trdr, user.id);
  await audit(user.id, "customer.erp.link", "Customer", customerId, null, { trdr, ok: r.ok });
  paths(customerId);
  return r.ok ? { ok: true as const } : r;
}

/* ---------- GDPR ---------- */
export async function gdprExport(customerId: string) {
  const user = await requirePermission("customers.export");
  const c = await db.customer.findUniqueOrThrow({ where: { id: customerId }, include: { addresses: true, consents: true, devices: true, tickets: true, loyalty: true, orders: { include: { lines: true } }, social: true, wishlists: { include: { items: true } }, events: true } });
  const { passwordHash, notes, ...rest } = c; void passwordHash; void notes;
  await ev(customerId, "gdpr-export", { by: user.name }, user.id);
  await audit(user.id, "customer.gdpr.export", "Customer", customerId, null, { by: user.name });
  return { ok: true as const, json: JSON.stringify({ exportedAt: new Date().toISOString(), customer: rest }, null, 2) };
}
export async function gdprAnonymise(customerId: string) {
  const user = await requirePermission("customers.write");
  const c = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
  const stub = `anon-${c.id.slice(-8)}`;
  await db.$transaction([
    db.customer.update({ where: { id: customerId }, data: { email: `${stub}@anonymised.invalid`, firstName: "Ανώνυμος", lastName: "Πελάτης", company: null, vatNumber: null, doy: null, phone: null, mobile: null, birthday: null, gender: null, profession: null, passwordHash: null, loyaltyCard: null, notes: null, tags: [...c.tags.filter((t) => t !== "demo"), "anonymised"], status: "anonymised", newsletter: false, anonymisedAt: new Date() } }),
    db.address.deleteMany({ where: { customerId } }),
    db.socialAccount.deleteMany({ where: { customerId } }),
    db.savedCard.deleteMany({ where: { customerId } }),
    db.customerDevice.updateMany({ where: { customerId }, data: { serial: null, notes: null } }),
    db.consent.create({ data: { customerId, topic: "newsletter", channel: "email", granted: false, source: "admin", staffId: user.id, textVersion: "gdpr-erase" } }),
  ]);
  await ev(customerId, "gdpr-anonymise", { by: user.name }, user.id);
  await audit(user.id, "customer.gdpr.anonymise", "Customer", customerId, { email: c.email }, { status: "anonymised" });
  paths(customerId);
  return { ok: true as const };
}

/** Staff-initiated password reset: sends the OTP email to the customer (the staff never sees the code). */
export async function sendPasswordReset(customerId: string) {
  const user = await requirePermission("customers.write");
  const c = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
  const r = await requestPasswordReset(c.email, { staffId: user.id });
  await audit(user.id, "customer.password.reset-request", "Customer", customerId, null, { throttled: r.throttled });
  paths(customerId);
  return r.throttled ? { ok: false as const, error: "Πολλά αιτήματα — δοκίμασε σε 15 λεπτά." } : { ok: true as const };
}
