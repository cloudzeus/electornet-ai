import "server-only";
import { db } from "@/lib/db";
import { renderTemplate } from "@/lib/email/templates";
import { emailCtx } from "@/lib/email/layout";
import { sendMail } from "@/lib/email/send";
import { sendSms, smsReady } from "@/lib/sms/send";
import { greekMobile } from "@/lib/sms/gsm";
import { reminderSms } from "./sms-text";
import { addMonths, LEGAL_WARRANTY_MONTHS } from "./policy";
import { devicePath } from "./link";
import { extOffers } from "./server";

/**
 * Υπενθύμιση «η εγγύηση λήγει»: συσκευές αγορασμένες από Euronics, χωρίς επέκταση, που λήγουν μέσα στις επόμενες
 * `days` ημέρες και μπορούν να πάρουν επέκταση (δωρεάν ή επί πληρωμή). Με email (όσοι έχουν) και SMS (όσοι έχουν κινητό
 * και υπάρχει πάροχος), μία φορά ανά συσκευή και κανάλι (CustomerEvent «warranty-reminder»). Παραλείπει όσους έχουν
 * αρνηθεί τις «Υπενθυμίσεις service & εγγύησης» στο αντίστοιχο κανάλι. Ο σύνδεσμος είναι προσωπικός (/eg/…) και
 * λειτουργεί χωρίς λογαριασμό. `dryRun`: μετρά χωρίς να στείλει ή να καταγράψει τίποτα.
 */
export async function runWarrantyReminders(opts: { dryRun?: boolean; days?: number; limit?: number } = {}) {
  const now = new Date(), days = opts.days ?? 60;
  const horizon = new Date(now.getTime() + days * 86400000);
  const devs = await db.customerDevice.findMany({
    where: { extendedUntil: null, registeredBy: { in: ["order", "erp"] }, warrantyUntil: { gt: now, lte: horizon }, customer: { status: "active" } },
    select: { id: true, title: true, brand: true, productId: true, registeredBy: true, warrantyUntil: true, warrantyMonths: true, purchasedAt: true, createdAt: true, extendedUntil: true, orderLineId: true, purchaseLineId: true, customerId: true, customer: { select: { email: true, firstName: true, mobile: true, phone: true } } },
    orderBy: { warrantyUntil: "asc" }, take: opts.limit ?? 2000,
  });
  const customerIds = [...new Set(devs.map((d) => d.customerId))];
  const [sent, refused, smsOn] = await Promise.all([
    db.customerEvent.findMany({ where: { kind: "warranty-reminder", customerId: { in: customerIds } }, select: { meta: true } }),
    db.consent.findMany({ where: { topic: "service", channel: { in: ["email", "sms"] }, customerId: { in: customerIds } }, orderBy: { at: "desc" }, distinct: ["customerId", "channel"], select: { customerId: true, channel: true, granted: true } }),
    smsReady(),
  ]);
  const done = new Set(sent.map((e) => { const m = (e.meta ?? {}) as { deviceId?: string; channel?: string }; return `${m.deviceId}:${m.channel ?? "email"}`; }));
  const no = new Set(refused.filter((c) => !c.granted).map((c) => `${c.customerId}:${c.channel}`));
  const plan = devs.map((d) => {
    const mobile = greekMobile(d.customer.mobile) ?? greekMobile(d.customer.phone);
    return {
      d, mobile,
      email: !!d.customer.email && !done.has(`${d.id}:email`) && !no.has(`${d.customerId}:email`),
      sms: !!mobile && !done.has(`${d.id}:sms`) && !no.has(`${d.customerId}:sms`),
    };
  }).filter((p) => p.email || p.sms);
  const offers = await extOffers(plan.map(({ d }) => ({ ...d, warrantyUntil: d.warrantyUntil ?? addMonths(d.purchasedAt ?? d.createdAt, d.warrantyMonths || LEGAL_WARRANTY_MONTHS) })), now);
  const base = opts.dryRun || !plan.length ? "https://www.euronics.gr" : (await emailCtx()).baseUrl;
  const short = base.replace(/^https?:\/\/(www\.)?/, "");
  const r = { dryRun: !!opts.dryRun, days, due: devs.length, smsProvider: smsOn, free: 0, paid: 0, noOffer: 0, emails: 0, sms: 0, smsNoProvider: 0, failed: 0, sample: null as string | null };
  for (const { d, mobile, email, sms } of plan) {
    const o = offers.get(d.id);
    if (!o || o.kind === null) { r.noOffer++; continue; }
    if (o.kind === "free") r.free++; else r.paid++;
    const price = o.kind === "paid" ? o.price : null;
    const device = d.title.toLowerCase().startsWith(d.brand.toLowerCase()) ? d.title : `${d.brand} ${d.title}`.trim();
    const path = devicePath(d.id);
    if (sms) r.sample ??= reminderSms(device, d.warrantyUntil!, price, `${short}${path}`).replace(/\/eg\/\S+/, "/eg/…");
    if (opts.dryRun) { if (email) r.emails++; if (sms) { if (smsOn) r.sms++; else r.smsNoProvider++; } continue; }
    const log = (channel: string) => db.customerEvent.create({ data: { customerId: d.customerId, kind: "warranty-reminder", meta: { deviceId: d.id, channel, offer: o.kind, price: price ?? 0, until: d.warrantyUntil!.toISOString().slice(0, 10) } } });
    if (email) {
      try {
        const m = await renderTemplate("warranty-expiring", { firstName: d.customer.firstName, device, until: d.warrantyUntil!.toLocaleDateString("el-GR", { day: "numeric", month: "long", year: "numeric" }), extendUrl: `${base}${path}`, price });
        const s = await sendMail({ to: d.customer.email!, template: "warranty-expiring", meta: { customerId: d.customerId, deviceId: d.id }, ...m });
        if (s.ok) { await log("email"); r.emails++; } else if (!("skipped" in s && s.skipped)) r.failed++;
      } catch { r.failed++; }
    }
    if (sms && mobile) {
      if (!smsOn) { r.smsNoProvider++; continue; }
      const s = await sendSms({ to: mobile, text: reminderSms(device, d.warrantyUntil!, price, `${short}${path}`), template: "warranty-expiring", meta: { customerId: d.customerId, deviceId: d.id } });
      if (s.ok) { await log("sms"); r.sms++; } else r.failed++;
    }
  }
  return r;
}
