import "server-only";
import { db } from "@/lib/db";
import { renderTemplate } from "@/lib/email/templates";
import { sendMail } from "@/lib/email/send";
import { getPromoPolicy } from "./policy";
import { couponValueLabel, issueCoupon, issueTriggerCoupon, marketingAllowed } from "./issue";

/**
 * Αυτόματες ενέργειες της Φάσης 2 που τρέχουν από το cron (/api/cron/promos):
 *  - κουπόνι γενεθλίων: μία φορά την ημέρα, σε πελάτες με γενέθλια σήμερα και συναίνεση για προωθητικά
 *  - εγκαταλελειμμένο καλάθι: υπενθύμιση με email (και προαιρετικό κουπόνι) σε πελάτες με λογαριασμό και συναίνεση,
 *    μία φορά ανά καλάθι, αν δεν ολοκλήρωσαν παραγγελία στο μεταξύ
 * Καμία ενέργεια δεν τρέχει αν δεν έχει ενεργοποιηθεί στους «Κανόνες» προσφορών.
 */

const JOBS = "promo-jobs";
const today = (d = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Athens" });

/** Μία φορά την ημέρα ανά εργασία, ακόμη και με πολλές διεργασίες (ατομικό UPDATE στη βάση). */
async function onceToday(job: string): Promise<boolean> {
  const day = today();
  await db.$executeRaw`INSERT INTO "Setting" (section, data, "updatedAt", "createdAt") VALUES (${JOBS}, '{}'::jsonb, now(), now()) ON CONFLICT (section) DO NOTHING`;
  const n = await db.$executeRaw`UPDATE "Setting" SET data = data || jsonb_build_object(${job}::text, ${day}::text), "updatedAt" = now() WHERE section = ${JOBS} AND COALESCE(data->>${job}, '') <> ${day}`;
  return n > 0;
}

export async function runBirthdays(opts: { force?: boolean } = {}) {
  const policy = await getPromoPolicy();
  if (!policy.birthdayPromotion) return { skipped: "off" as const };
  if (!opts.force && !(await onceToday("birthdays"))) return { skipped: "done-today" as const };
  const now = new Date();
  const [, m, d] = today(now).split("-").map(Number);
  const people = await db.$queryRaw<{ id: string; email: string; firstName: string }[]>`SELECT id, email, "firstName" FROM "Customer" WHERE status = 'active' AND "anonymisedAt" IS NULL AND birthday IS NOT NULL AND EXTRACT(MONTH FROM birthday) = ${m} AND EXTRACT(DAY FROM birthday) = ${d} LIMIT 5000`;
  const allowed = await marketingAllowed(people.map((p) => p.id));
  let issued = 0;
  for (const p of people) {
    if (!allowed.has(p.id)) continue;
    const r = await issueTriggerCoupon("birthday", { email: p.email, customerId: p.id, firstName: p.firstName }, { send: true });
    if (r?.ok && r.created) issued++;
  }
  return { candidates: people.length, consent: allowed.size, issued };
}

let lastCart = 0;
export async function runCartReminders(opts: { force?: boolean } = {}) {
  const policy = await getPromoPolicy();
  if (!policy.cartReminders) return { skipped: "off" as const };
  if (!opts.force && Date.now() - lastCart < 15 * 60_000) return { skipped: "recent" as const };
  lastCart = Date.now();
  const now = Date.now();
  const carts = await db.cart.findMany({
    where: { customerId: { not: null }, remindedAt: null, updatedAt: { lt: new Date(now - policy.cartReminderHours * 3_600_000), gt: new Date(now - 48 * 3_600_000) }, lines: { some: {} } },
    include: { customer: { select: { id: true, email: true, firstName: true, status: true } }, lines: { include: { variant: { select: { price: true, product: { select: { title: true, brand: { select: { name: true } }, media: { where: { hidden: false, kind: "image" }, orderBy: { sortNo: "asc" }, take: 1, select: { url: true } } } } } } } } },
    take: 200,
  });
  const allowed = await marketingAllowed(carts.flatMap((c) => (c.customerId ? [c.customerId] : [])));
  const base = process.env.AUTH_URL?.replace(/\/$/, "") ?? "https://www.euronics.gr";
  let sent = 0;
  for (const c of carts) {
    const cu = c.customer;
    if (!cu || cu.status !== "active" || !allowed.has(cu.id)) continue;
    // ολοκλήρωσε παραγγελία μετά την τελευταία αλλαγή του καλαθιού; τότε δεν είναι εγκαταλελειμμένο
    if (await db.order.count({ where: { customerId: cu.id, createdAt: { gte: c.updatedAt } } })) { await db.$executeRaw`UPDATE "Cart" SET "remindedAt" = now() WHERE id = ${c.id}`; continue; }
    const lines = c.lines.map((l) => ({ title: l.variant.product.title, brand: l.variant.product.brand.name, image: l.variant.product.media[0]?.url ?? null, qty: l.qty, unitPrice: Number(l.variant.price) }));
    const total = lines.reduce((a, l) => a + l.unitPrice * l.qty, 0);
    let coupon: { code: string; value: string; until: string | null } | null = null;
    if (policy.cartPromotion) {
      const r = await issueCoupon({ promotionCode: policy.cartPromotion, trigger: "cart", email: cu.email, customerId: cu.id, firstName: cu.firstName, send: false, dedupe: "active", validDays: 7 }).catch(() => null);
      if (r?.ok) { const p = await db.promotion.findUnique({ where: { id: r.coupon.promotionId }, select: { mechanism: true, reward: true } }); coupon = { code: r.coupon.code, value: p ? couponValueLabel(p) : "", until: r.coupon.expiresAt?.toLocaleDateString("el-GR", { day: "numeric", month: "long" }) ?? null }; }
    }
    const m = await renderTemplate("cart-abandoned", { firstName: cu.firstName, lines, total, cartUrl: `${base}/kalathi`, code: coupon?.code ?? null, value: coupon?.value ?? null, until: coupon?.until ?? null }).catch(() => null);
    if (!m) continue;
    await sendMail({ to: cu.email, template: "cart-abandoned", meta: { cartId: c.id, coupon: coupon?.code ?? null }, ...m }).catch(() => null);
    // raw SQL: να μην αλλάξει το updatedAt του καλαθιού
    await db.$executeRaw`UPDATE "Cart" SET "remindedAt" = now() WHERE id = ${c.id}`;
    sent++;
  }
  return { carts: carts.length, sent };
}
