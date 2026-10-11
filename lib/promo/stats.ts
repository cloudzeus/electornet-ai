import "server-only";
import { db } from "@/lib/db";

/**
 * Απόδοση προσφορών από τις χρήσεις (PromotionUsage): ανά ημέρα για `days` ημέρες, σύνολα της περιόδου και της
 * προηγούμενης ίσης περιόδου (για σύγκριση), και ανά προσφορά. Ένα query για λίστα, αναφορές και καρτέλα προσφοράς.
 */
export type PromoStats = {
  labels: string[];
  discount: number[];
  orders: number[];
  total: { discount: number; orders: number };
  prev: { discount: number; orders: number };
  byPromo: Map<string, { discount: number; orders: number }>;
};

const DAY = 86400_000;
const pct = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);
export const delta = (now: number, before: number, good: "up" | "down" = "up") => { const p = pct(now, before); return p == null ? null : { pct: p, good }; };

export async function promoStats(days: number, promotionId?: string, nowMs = Date.now()): Promise<PromoStats> {
  const end = nowMs, start = end - days * DAY, prevStart = start - days * DAY;
  const rows = await db.promotionUsage.findMany({
    where: { createdAt: { gte: new Date(prevStart) }, ...(promotionId ? { promotionId } : {}) },
    select: { promotionId: true, orderId: true, amount: true, createdAt: true },
    take: 50000,
  });
  const step = days > 90 ? 7 : 1;
  const buckets = Math.ceil(days / step);
  const labels: string[] = [], discount = new Array(buckets).fill(0), orderSets = Array.from({ length: buckets }, () => new Set<string>());
  for (let i = 0; i < buckets; i++) labels.push(new Date(start + (i + 1) * step * DAY - 1).toLocaleDateString("el-GR", { day: "numeric", month: "numeric" }));
  const cur = new Set<string>(), prev = new Set<string>();
  let curD = 0, prevD = 0;
  const byPromo = new Map<string, { discount: number; orders: Set<string> }>();
  for (const r of rows) {
    const t = r.createdAt.getTime(), a = Number(r.amount);
    if (t >= start) {
      const b = Math.min(buckets - 1, Math.floor((t - start) / (step * DAY)));
      discount[b] += a; orderSets[b].add(r.orderId); cur.add(r.orderId); curD += a;
      const p = byPromo.get(r.promotionId) ?? { discount: 0, orders: new Set<string>() };
      p.discount += a; p.orders.add(r.orderId); byPromo.set(r.promotionId, p);
    } else { prev.add(r.orderId); prevD += a; }
  }
  return {
    labels, discount: discount.map((v) => Math.round(v)), orders: orderSets.map((s) => s.size),
    total: { discount: curD, orders: cur.size }, prev: { discount: prevD, orders: prev.size },
    byPromo: new Map([...byPromo].map(([k, v]) => [k, { discount: v.discount, orders: v.orders.size }])),
  };
}
