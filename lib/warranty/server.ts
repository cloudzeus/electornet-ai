import "server-only";
import { db } from "@/lib/db";
import { addMonths, canExtend, EXTENSION_MONTHS, EXTENSION_SLUG, LEGAL_WARRANTY_MONTHS, warrantyFromSpecs } from "./policy";

/** Ποια προϊόντα δικαιούνται τη δωρεάν επέκταση: το είδος τους στο SoftOne έχει «Επέκταση Εγγύησης» (CCCWARRANTY). */
export async function extEligibleMap(productIds: string[]): Promise<Map<string, boolean>> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await db.$queryRawUnsafe<{ id: string }[]>(
    `SELECT p.id FROM "Product" p JOIN "S1Item" s ON s.mtrl::text = p."erpCode" WHERE p.id = ANY($1::text[]) AND s."extWarranty" = true`, ids).catch(() => []);
  const yes = new Set(rows.map((r) => r.id));
  return new Map(ids.map((id) => [id, yes.has(id)]));
}

/** Η εγγύηση του κατασκευαστή για ένα προϊόν (από τη γραμμή «Εγγύηση : …» της περιγραφής) — αλλιώς null (= νόμιμη 2ετής). */
export async function productWarranty(productId: string): Promise<{ months: number; text: string } | null> {
  const specs = await db.spec.findMany({ where: { productId, key: { contains: "γγ", mode: "insensitive" } }, select: { key: true, value: true }, orderBy: [{ sortNo: "asc" }] }).catch(() => []);
  return warrantyFromSpecs(specs);
}

const DEVICE_MIN_PRICE = 50; // όπως στις αγορές καταστημάτων: κάτω από αυτό αξεσουάρ / αναλώσιμα

/**
 * Παραγγελία e-shop → «Οι συσκευές μου» του πελάτη (μόνο με λογαριασμό): μία συσκευή ανά γραμμή και τεμάχιο (έως 5),
 * με την εγγύηση του κατασκευαστή και, όπου υπάρχει η δωρεάν επέκταση στη γραμμή, +24 μήνες. Ιδεμπότητη.
 */
export async function devicesFromOrder(orderId: string) {
  const o = await db.order.findUnique({ where: { id: orderId }, select: { id: true, number: true, customerId: true, createdAt: true, lines: { select: { id: true, title: true, qty: true, unitPrice: true, addons: { select: { service: { select: { slug: true } } } }, variant: { select: { product: { select: { id: true, modelCode: true, brand: { select: { name: true } } } } } } } } } });
  if (!o?.customerId) return 0;
  let n = 0;
  for (const l of o.lines) {
    if (Number(l.unitPrice) < DEVICE_MIN_PRICE) continue;
    const p = l.variant.product;
    const months = (await productWarranty(p.id))?.months ?? LEGAL_WARRANTY_MONTHS;
    const until = addMonths(o.createdAt, months);
    const ext = l.addons.some((a) => a.service.slug === EXTENSION_SLUG);
    for (let u = 1; u <= Math.min(5, Math.max(1, l.qty)); u++) {
      const exists = await db.customerDevice.findFirst({ where: { orderLineId: l.id, unitNo: u }, select: { id: true } });
      if (exists) continue;
      await db.customerDevice.create({ data: {
        customerId: o.customerId, productId: p.id, brand: p.brand.name, title: l.title, model: p.modelCode, purchasedAt: o.createdAt,
        orderId: o.id, orderLineId: l.id, unitNo: u, invoiceNo: o.number, warrantyMonths: months, warrantyUntil: until,
        ...(ext ? { extendedUntil: addMonths(until, EXTENSION_MONTHS), extendedPlan: "free-24" } : {}), registeredBy: "order",
      } });
      n++;
    }
  }
  return n;
}

/** Δωρεάν επέκταση από το προφίλ, για παλιά αγορά (βλ. canExtend). Ο έλεγχος γίνεται εδώ, στον server. */
export async function extendDevice(customerId: string, deviceId: string): Promise<{ ok: true; extendedUntil: Date } | { ok: false; error: string }> {
  const d = await db.customerDevice.findFirst({ where: { id: deviceId, customerId }, select: { id: true, productId: true, registeredBy: true, warrantyUntil: true, extendedUntil: true, title: true } });
  if (!d) return { ok: false, error: "Η συσκευή δεν βρέθηκε." };
  const eligible = d.productId ? (await extEligibleMap([d.productId])).get(d.productId) ?? false : false;
  const check = canExtend({ registeredBy: d.registeredBy, productEligible: eligible, warrantyUntil: d.warrantyUntil, extendedUntil: d.extendedUntil });
  if (!check.eligible) return { ok: false, error: check.reason ?? "Δεν γίνεται επέκταση." };
  const extendedUntil = addMonths(d.warrantyUntil!, EXTENSION_MONTHS);
  const n = await db.customerDevice.updateMany({ where: { id: d.id, extendedUntil: null }, data: { extendedUntil, extendedPlan: "free-24" } });
  if (n.count !== 1) return { ok: false, error: "Έχει ήδη επέκταση εγγύησης." };
  await db.customerEvent.create({ data: { customerId, kind: "device", meta: { by: "customer", id: d.id, title: d.title, action: "warranty-extended", until: extendedUntil.toISOString().slice(0, 10) } } }).catch(() => null);
  return { ok: true, extendedUntil };
}

/** «Οι συσκευές μου» του συνδεδεμένου πελάτη: εγγύηση, επέκταση και αν μπορεί να την ενεργοποιήσει τώρα. */
export async function customerDevices(customerId: string, now = new Date()) {
  const devs = await db.customerDevice.findMany({ where: { customerId }, orderBy: [{ purchasedAt: "desc" }, { createdAt: "desc" }] });
  const pids = devs.map((d) => d.productId).filter((x): x is string => !!x);
  const [eligible, prods] = await Promise.all([
    extEligibleMap(pids),
    pids.length ? db.product.findMany({ where: { id: { in: pids } }, select: { id: true, slug: true, active: true, media: { where: { kind: "image", hidden: false }, orderBy: { sortNo: "asc" }, take: 1, select: { url: true } } } }) : Promise.resolve([]),
  ]);
  const pm = new Map(prods.map((p) => [p.id, p]));
  return devs.map((d) => {
    const p = d.productId ? pm.get(d.productId) : undefined;
    const from = d.purchasedAt ?? d.createdAt;
    const until = d.warrantyUntil ?? addMonths(from, d.warrantyMonths || LEGAL_WARRANTY_MONTHS);
    const to = d.extendedUntil ?? until;
    const total = Math.max(1, to.getTime() - from.getTime()), left = Math.max(0, to.getTime() - now.getTime());
    const check = canExtend({ registeredBy: d.registeredBy, productEligible: d.productId ? eligible.get(d.productId) ?? false : false, warrantyUntil: until, extendedUntil: d.extendedUntil }, now);
    return {
      key: d.id, deviceId: d.id, productId: p?.slug ?? d.id, href: p?.active ? `/proion/${p.slug}` : null, title: d.title, brand: d.brand, image: p?.media[0]?.url ?? null,
      order: d.invoiceNo ?? "", bought: from.toISOString(), years: Math.round(((to.getTime() - from.getTime()) / (365.25 * 86400000)) * 10) / 10,
      ext: !!d.extendedUntil, to: to.toISOString().slice(0, 10), daysLeft: Math.ceil(left / 86400000), pct: Math.round((left / total) * 100),
      real: true as const, extendable: check.eligible, extendNote: check.eligible ? null : d.extendedUntil ? null : check.reason,
    };
  });
}
