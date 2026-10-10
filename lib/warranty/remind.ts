import "server-only";
import { db } from "@/lib/db";
import { renderTemplate } from "@/lib/email/templates";
import { emailCtx } from "@/lib/email/layout";
import { sendMail } from "@/lib/email/send";
import { addMonths, LEGAL_WARRANTY_MONTHS } from "./policy";
import { extOffers } from "./server";

/**
 * Υπενθύμιση «η εγγύηση λήγει» (email warranty-expiring): συσκευές αγορασμένες από Euronics, χωρίς επέκταση, που λήγουν
 * μέσα στις επόμενες `days` ημέρες και μπορούν να πάρουν επέκταση (δωρεάν ή επί πληρωμή). Μία φορά ανά συσκευή
 * (CustomerEvent «warranty-reminder»). Μόνο ενεργοί πελάτες με email, που δεν έχουν αρνηθεί τις «Υπενθυμίσεις service
 * & εγγύησης» με email. `dryRun`: μετρά χωρίς να στείλει ή να καταγράψει τίποτα.
 */
export async function runWarrantyReminders(opts: { dryRun?: boolean; days?: number; limit?: number } = {}) {
  const now = new Date(), days = opts.days ?? 60;
  const horizon = new Date(now.getTime() + days * 86400000);
  const devs = await db.customerDevice.findMany({
    where: { extendedUntil: null, registeredBy: { in: ["order", "erp"] }, warrantyUntil: { gt: now, lte: horizon }, customer: { status: "active", email: { not: null } } },
    select: { id: true, title: true, brand: true, productId: true, registeredBy: true, warrantyUntil: true, warrantyMonths: true, purchasedAt: true, createdAt: true, extendedUntil: true, orderLineId: true, purchaseLineId: true, customerId: true, customer: { select: { email: true, firstName: true } } },
    orderBy: { warrantyUntil: "asc" }, take: opts.limit ?? 1000,
  });
  const customerIds = [...new Set(devs.map((d) => d.customerId))];
  const [sent, refused] = await Promise.all([
    db.customerEvent.findMany({ where: { kind: "warranty-reminder", customerId: { in: customerIds } }, select: { meta: true } }),
    db.consent.findMany({ where: { topic: "service", channel: "email", customerId: { in: customerIds } }, orderBy: { at: "desc" }, distinct: ["customerId"], select: { customerId: true, granted: true } }),
  ]);
  const done = new Set(sent.map((e) => (e.meta as { deviceId?: string } | null)?.deviceId).filter(Boolean));
  const no = new Set(refused.filter((c) => !c.granted).map((c) => c.customerId));
  const todo = devs.filter((d) => !done.has(d.id) && !no.has(d.customerId));
  const offers = await extOffers(todo.map((d) => ({ ...d, warrantyUntil: d.warrantyUntil ?? addMonths(d.purchasedAt ?? d.createdAt, d.warrantyMonths || LEGAL_WARRANTY_MONTHS) })), now);
  const base = opts.dryRun || !todo.length ? "" : (await emailCtx()).baseUrl;
  let free = 0, paid = 0, noOffer = 0, failed = 0;
  for (const d of todo) {
    const o = offers.get(d.id);
    if (!o || o.kind === null) { noOffer++; continue; }
    if (o.kind === "free") free++; else paid++;
    if (opts.dryRun) continue;
    try {
      const m = await renderTemplate("warranty-expiring", {
        firstName: d.customer.firstName, device: `${d.brand} ${d.title}`.trim(),
        until: d.warrantyUntil!.toLocaleDateString("el-GR", { day: "numeric", month: "long", year: "numeric" }),
        extendUrl: `${base}/logariasmos/eggyiseis`, price: o.kind === "paid" ? o.price : null,
      });
      await sendMail({ to: d.customer.email!, template: "warranty-expiring", meta: { customerId: d.customerId, deviceId: d.id }, ...m });
      await db.customerEvent.create({ data: { customerId: d.customerId, kind: "warranty-reminder", meta: { deviceId: d.id, offer: o.kind, price: o.kind === "paid" ? o.price : 0, until: d.warrantyUntil!.toISOString().slice(0, 10) } } });
    } catch { failed++; }
  }
  return { dryRun: !!opts.dryRun, days, due: devs.length, alreadyReminded: devs.filter((d) => done.has(d.id)).length, optedOut: devs.filter((d) => no.has(d.customerId)).length, free, paid, noOffer, failed };
}
