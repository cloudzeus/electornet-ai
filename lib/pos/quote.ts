import "server-only";
import { db } from "@/lib/db";
import { evaluate } from "@/lib/promo/engine";
import { activePromos, isNewCustomer, linesFor, resolveCoupon, usesByPromo } from "@/lib/promo/server";
import { getPromoPolicy } from "@/lib/promo/policy";
import { segmentsOf } from "@/lib/promo/segments";

/** Υπολογισμός καλαθιού ταμείου (POS) — η λογική του /api/pos/v1/quote, χωρίς τον έλεγχο κλειδιού. Βλ. docs/pos-api.md */
export interface PosBody { store?: string; lines?: { code?: string; qty?: number; price?: number }[]; coupon?: string | null; email?: string | null; payment?: string | null }
export type PosResult = { status: number; body: Record<string, unknown> };

export async function posQuote(b: PosBody | null): Promise<PosResult> {
  if (!b?.store || !Array.isArray(b.lines) || !b.lines.length) return { status: 400, body: { ok: false, error: "store και lines είναι υποχρεωτικά" } };
  if (b.lines.length > 100) return { status: 400, body: { ok: false, error: "έως 100 γραμμές" } };

  const store = await db.store.findFirst({ where: { OR: [{ erpBranch: b.store }, { id: b.store }, { slug: b.store }] }, select: { id: true, name: true, erpBranch: true } });
  if (!store) return { status: 404, body: { ok: false, error: `άγνωστο κατάστημα: ${b.store}` } };

  const codes = [...new Set(b.lines.map((l) => String(l.code ?? "").trim()).filter(Boolean))];
  const products = await db.product.findMany({ where: { OR: [{ sku: { in: codes } }, { ean: { in: codes } }, { erpCode: { in: codes } }] }, select: { id: true, sku: true, ean: true, erpCode: true } });
  const find = (c: string) => products.find((p) => p.sku === c || p.ean === c || p.erpCode === c);
  const unknown: string[] = [];
  const items = b.lines.flatMap((l, i) => { const code = String(l.code ?? "").trim(); const p = find(code); if (!p) { unknown.push(code); return []; } return [{ key: `l${i}`, productId: p.id, qty: Math.max(1, Math.min(999, Math.floor(Number(l.qty) || 1))), code, price: Number.isFinite(Number(l.price)) && Number(l.price) > 0 ? Number(l.price) : null }]; });
  const { lines, missing } = await linesFor(items);
  // τιμή ραφιού του καταστήματος, αν τη στείλει το ταμείο
  for (const l of lines) { const it = items.find((x) => x.key === l.key); if (it?.price) l.unit = Math.round(it.price * 100); }

  const email = b.email?.trim().toLowerCase() || null;
  const cust = email ? await db.customer.findUnique({ where: { email }, select: { id: true, status: true } }) : null;
  const who = { customerId: cust?.status === "active" ? cust.id : null, email };
  const [promos, coupon, uses, isNew, policy, segments] = await Promise.all([activePromos(), resolveCoupon(b.coupon, who), usesByPromo(who), isNewCustomer(who), getPromoPolicy(), segmentsOf(who.customerId)]);
  const r = evaluate(lines, promos, {
    now: new Date(), channel: "pos", storeId: store.id, payment: b.payment ?? null, delivery: null, zip: null, coupon,
    customer: { id: who.customerId, email, registered: !!who.customerId, isNew, usesByPromo: uses, segments },
    maxLinePct: policy.maxLinePct, costFloor: policy.belowCost === "block",
  });
  const eur = (c: number) => Math.round(c) / 100;
  return { status: 200, body: {
    ok: true, store: { id: store.id, name: store.name, erpBranch: store.erpBranch },
    unknown: [...unknown, ...missing],
    lines: r.lines.map((l) => {
      const it = items.find((x) => x.key === l.key)!, info = lines.find((x) => x.key === l.key)!;
      return {
        code: it.code, MTRL: info.erpCode, title: info.title, qty: l.qty,
        PRICE: eur(l.unit), NODSCLNVAL: eur(l.listTotal), DISC1VAL: eur(l.discPrice), DISC2VAL: eur(l.discCoupon), DISC3VAL: eur(l.discPayment), LINEVAL: eur(l.total),
        COMMENTS: l.adjustments.map((a) => `${a.code} v${a.version}`).join(" · ") || null,
        promotions: l.adjustments.map((a) => ({ code: a.code, version: a.version, kind: a.kind, label: a.label, amount: eur(a.amount) })),
      };
    }),
    totals: { list: eur(r.listTotal), promotions: eur(r.discPrice), coupon: eur(r.discCoupon), payment: eur(r.discPayment), total: eur(r.total) },
    coupon: { applied: r.couponApplied, message: r.couponMessage },
    gifts: r.gifts.map((g) => ({ promotion: g.code, label: g.label, productId: g.productId, qty: g.qty })),
    hints: r.hints,
    applied: r.trace.filter((t) => t.applied).map((t) => ({ code: t.code, name: t.name, amount: eur(t.amount) })),
  } };
}
