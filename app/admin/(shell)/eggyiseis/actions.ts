"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";

export interface DeviceInput {
  brand: string; title: string; model: string; serial: string;
  purchasedAt: string; warrantyMonths: number;
  /** true = η λήξη ορίζεται χειροκίνητα· αλλιώς υπολογίζεται από αγορά + μήνες */
  warrantyOverride: boolean; warrantyUntil: string;
  extendedUntil: string; extendedPlan: string; invoiceNo: string; notes: string;
}

type Result = { ok: true; id: string } | { ok: false; error: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (s: string) => { const v = s.trim(); if (!v) return null; if (!DAY.test(v)) return undefined; const d = new Date(`${v}T00:00:00.000Z`); return Number.isNaN(d.getTime()) ? undefined : d; };
const addMonths = (d: Date, m: number) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + m); return x; };
/** ΕΕΕΕ-ΜΜ-ΗΗ σε ώρα Ελλάδας — όπως τη δείχνει η φόρμα (οι ημερομηνίες του SoftOne είναι μεσάνυχτα Ελλάδας) */
const iso = (d: Date | null | undefined) => (d ? d.toLocaleDateString("sv-SE", { timeZone: "Europe/Athens" }) : null);
const txt = (s: string, max: number) => s.trim().slice(0, max) || null;

/** Έλεγχος και κανονικοποίηση των πεδίων της φόρμας. */
function validate(d: DeviceInput, requireNames: boolean): { ok: false; error: string } | { ok: true; data: Omit<Prisma.CustomerDeviceUncheckedCreateInput, "customerId"> } {
  const brand = d.brand.trim(), title = d.title.trim();
  if (requireNames && (!brand || !title)) return { ok: false, error: "Η μάρκα και η περιγραφή είναι υποχρεωτικές." };
  const purchasedAt = day(d.purchasedAt), manualUntil = day(d.warrantyUntil), extendedUntil = day(d.extendedUntil);
  if (purchasedAt === undefined || manualUntil === undefined || extendedUntil === undefined) return { ok: false, error: "Μη έγκυρη ημερομηνία (μορφή ΕΕΕΕ-ΜΜ-ΗΗ)." };
  const months = Math.trunc(Number(d.warrantyMonths));
  if (!Number.isFinite(months) || months < 0 || months > 240) return { ok: false, error: "Οι μήνες εγγύησης πρέπει να είναι από 0 έως 240." };
  if (purchasedAt && purchasedAt.getTime() > Date.now() + 86400_000) return { ok: false, error: "Η ημερομηνία αγοράς είναι στο μέλλον." };
  if (purchasedAt && purchasedAt.getUTCFullYear() < 1990) return { ok: false, error: "Η ημερομηνία αγοράς είναι πολύ παλιά." };
  if (d.warrantyOverride && !manualUntil) return { ok: false, error: "Συμπλήρωσε τη λήξη εγγύησης ή ξετσέκαρε τον χειροκίνητο ορισμό." };
  const warrantyUntil = d.warrantyOverride ? manualUntil : purchasedAt ? addMonths(purchasedAt, months) : null;
  if (purchasedAt && warrantyUntil && warrantyUntil < purchasedAt) return { ok: false, error: "Η λήξη εγγύησης είναι πριν από την αγορά." };
  if (purchasedAt && extendedUntil && extendedUntil < purchasedAt) return { ok: false, error: "Η επέκταση λήγει πριν από την αγορά." };
  if (warrantyUntil && extendedUntil && extendedUntil <= warrantyUntil) return { ok: false, error: "Η επέκταση πρέπει να λήγει μετά την κανονική εγγύηση." };
  const serial = txt(d.serial, 80);
  if (serial && !/^[\p{L}\p{N}][\p{L}\p{N}\-./ ]*$/u.test(serial)) return { ok: false, error: "Ο σειριακός αριθμός έχει μη επιτρεπτούς χαρακτήρες." };
  return {
    ok: true,
    data: {
      ...(brand ? { brand: brand.slice(0, 80) } : {}), ...(title ? { title: title.slice(0, 200) } : {}),
      model: txt(d.model, 80), serial, purchasedAt, warrantyMonths: months, warrantyUntil, extendedUntil,
      extendedPlan: txt(d.extendedPlan, 80), invoiceNo: txt(d.invoiceNo, 60), notes: txt(d.notes, 2000),
    } as Omit<Prisma.CustomerDeviceUncheckedCreateInput, "customerId">,
  };
}

const FIELDS = ["brand", "title", "model", "serial", "purchasedAt", "warrantyMonths", "warrantyUntil", "extendedUntil", "extendedPlan", "invoiceNo", "notes"] as const;
const show = (v: unknown) => (v instanceof Date ? iso(v) : v ?? null);

function paths(customerId: string) {
  revalidatePath("/admin/eggyiseis");
  revalidatePath(`/admin/customers/${customerId}`);
}

/** Διόρθωση στοιχείων συσκευής/εγγύησης από το προσωπικό· καταγράφει τις αλλαγές στο ιστορικό του πελάτη. */
export async function updateDevice(id: string, input: DeviceInput): Promise<Result> {
  const user = await requirePermission("service.tickets.write");
  const before = await db.customerDevice.findUnique({ where: { id } });
  if (!before) return { ok: false, error: "Η συσκευή δεν βρέθηκε (ίσως διαγράφηκε)." };
  const v = validate(input, true);
  if (!v.ok) return v;
  const changes: Record<string, [unknown, unknown]> = {};
  for (const k of FIELDS) {
    const a = show(before[k]), b = show((v.data as Record<string, unknown>)[k]);
    if (a !== b) changes[k] = [a, b];
  }
  if (!Object.keys(changes).length) return { ok: true, id };
  // μόνο τα πεδία που άλλαξαν — οι υπόλοιπες ημερομηνίες κρατούν την ακριβή ώρα τους (π.χ. από SoftOne)
  const data = Object.fromEntries(Object.keys(changes).map((k) => [k, (v.data as Record<string, unknown>)[k] ?? null])) as Prisma.CustomerDeviceUpdateInput;
  await db.customerDevice.update({ where: { id }, data });
  await db.customerEvent.create({ data: { customerId: before.customerId, kind: "device", meta: { by: user.name ?? null, id, changes } as Prisma.InputJsonValue, staffId: user.id } }).catch(() => null);
  await audit(user.id, "device.update", "CustomerDevice", id, null, changes);
  paths(before.customerId);
  return { ok: true, id };
}

/** Νέα καταχώριση συσκευής σε πελάτη από το προσωπικό (registeredBy = staff). */
export async function createDevice(customerId: string, input: DeviceInput): Promise<Result> {
  const user = await requirePermission("service.tickets.write");
  const c = await db.customer.findUnique({ where: { id: customerId }, select: { id: true, status: true } });
  if (!c) return { ok: false, error: "Ο πελάτης δεν βρέθηκε." };
  if (c.status === "anonymised") return { ok: false, error: "Ο πελάτης είναι ανωνυμοποιημένος." };
  const v = validate(input, true);
  if (!v.ok) return v;
  const row = await db.customerDevice.create({ data: { ...(v.data as Prisma.CustomerDeviceUncheckedCreateInput), customerId, registeredBy: "staff" } });
  const changes = Object.fromEntries(FIELDS.map((k) => [k, [null, show(row[k])]]).filter(([, [, b]]) => b != null));
  await db.customerEvent.create({ data: { customerId, kind: "device", meta: { by: user.name ?? null, id: row.id, created: true, changes } as Prisma.InputJsonValue, staffId: user.id } }).catch(() => null);
  await audit(user.id, "device.create", "CustomerDevice", row.id, null, { customerId, ...changes });
  paths(customerId);
  return { ok: true, id: row.id };
}

export interface CustomerHit { id: string; number: number; name: string; email: string | null; phone: string | null }

/** Αναζήτηση πελάτη για νέα καταχώριση: όνομα, email, τηλέφωνο ή αριθμός πελάτη — έως 8. */
export async function searchCustomers(q: string): Promise<CustomerHit[]> {
  await requirePermission("service.tickets.write");
  const s = q.trim().slice(0, 80);
  if (s.length < 2) return [];
  const digits = s.replace(/\D/g, "");
  const words = s.split(/\s+/).filter(Boolean);
  const OR: Prisma.CustomerWhereInput[] = [
    { email: { contains: s, mode: "insensitive" } },
    { company: { contains: s, mode: "insensitive" } },
    words.length > 1
      ? { AND: words.map((w) => ({ OR: [{ firstName: { contains: w, mode: "insensitive" as const } }, { lastName: { contains: w, mode: "insensitive" as const } }] })) }
      : { OR: [{ firstName: { contains: s, mode: "insensitive" } }, { lastName: { contains: s, mode: "insensitive" } }] },
  ];
  if (digits.length >= 6) OR.push({ phoneKey: { contains: digits.slice(-10) } }, { mobile: { contains: digits } }, { phone: { contains: digits } });
  if (/^\d{1,9}$/.test(s)) OR.push({ number: Number(s) });
  const rows = await db.customer.findMany({ where: { status: { not: "anonymised" }, OR }, take: 8, orderBy: [{ lastPurchaseAt: { sort: "desc", nulls: "last" } }, { number: "desc" }], select: { id: true, number: true, firstName: true, lastName: true, company: true, type: true, email: true, mobile: true, phone: true } });
  return rows.map((c) => ({ id: c.id, number: c.number, name: c.type === "business" && c.company ? `${c.company} (${c.lastName} ${c.firstName})` : `${c.lastName} ${c.firstName}`, email: c.email, phone: c.mobile ?? c.phone }));
}
