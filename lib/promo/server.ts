import "server-only";
import { db } from "@/lib/db";
import type { EngineLine, EnginePromo, PromoReward, PromoRules, PromoTarget, Stacking } from "./engine";

/**
 * Η μηχανή προσφορών απέναντι στη βάση: φόρτωση ενεργών προσφορών (με μικρή cache στη μνήμη — το καλάθι δεν
 * ρωτά τη βάση για κάθε υπολογισμό), γραμμές καλαθιού από τα πραγματικά προϊόντα, κουπόνια, χαμηλότερη τιμή 30 ημερών.
 */

const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);

// ---- προσφορές: μόνο όσες μπορεί να ισχύουν τώρα ή σύντομα, με cache 15 s (ακυρώνεται σε κάθε αλλαγή από το admin) ----
let cache: { at: number; promos: EnginePromo[] } | null = null;
export function invalidatePromos() { cache = null; }
type PromoRow = Awaited<ReturnType<typeof db.promotion.findMany<{ include: { targets: true } }>>>[number];
export const toEngine = (p: PromoRow): EnginePromo => ({
  id: p.id, code: p.code, version: p.version, name: p.name, mechanism: p.mechanism, status: p.status, held: p.held,
  priority: p.priority, stacking: p.stacking as Stacking, startsAt: p.startsAt, endsAt: p.endsAt,
  reward: p.reward as PromoReward, rules: (p.rules ?? {}) as PromoRules,
  targets: p.targets.map((t) => ({ kind: t.kind as PromoTarget["kind"], refId: t.refId, exclude: t.exclude })),
  maxUses: p.maxUses, usedCount: p.usedCount, maxPerCustomer: p.maxPerCustomer,
  budgetCents: p.budgetEur != null ? cents(p.budgetEur) : null, spentCents: cents(p.spentEur), tagLabel: p.tagLabel,
});

/** Για τον προσομοιωτή: και μη δημοσιευμένες (πρόχειρες, σε παύση, σε αναμονή), χωρίς cache. */
export async function promosWith(statuses: string[]): Promise<EnginePromo[]> {
  const rows = await db.promotion.findMany({ where: { status: { in: statuses } }, include: { targets: true }, orderBy: { priority: "asc" } });
  return rows.map(toEngine);
}

export async function activePromos(now = new Date()): Promise<EnginePromo[]> {
  if (cache && Date.now() - cache.at < 15_000) return cache.promos;
  const rows = await db.promotion.findMany({
    where: { status: { in: ["active", "scheduled"] }, OR: [{ endsAt: null }, { endsAt: { gte: new Date(now.getTime() - 86400000) } }] },
    include: { targets: true },
    orderBy: { priority: "asc" },
  });
  const promos = rows.map(toEngine);
  cache = { at: Date.now(), promos };
  return promos;
}

// ---- γραμμές: τιμή του variant (ERP), brand, κατηγορία + όλοι οι πρόγονοί της ----
let catParents: { at: number; map: Map<string, string | null> } | null = null;
async function categoryChain(id: string): Promise<string[]> {
  if (!catParents || Date.now() - catParents.at > 600_000) {
    const all = await db.category.findMany({ select: { id: true, parentId: true } });
    catParents = { at: Date.now(), map: new Map(all.map((c) => [c.id, c.parentId])) };
  }
  const out: string[] = [];
  for (let c: string | null | undefined = id, guard = 0; c && guard < 8; c = catParents.map.get(c), guard++) out.push(c);
  return out;
}

export interface CartItemRef { key: string; productId: string; qty: number }
export interface LineInfo extends EngineLine { title: string; brand: string; image: string | null; erpCode: string; slug: string }
/** Από ids προϊόντων → γραμμές της μηχανής. Όσα δεν υπάρχουν ή δεν έχουν τιμή, επιστρέφονται χωριστά. */
export async function linesFor(items: CartItemRef[]): Promise<{ lines: LineInfo[]; missing: string[] }> {
  const ids = [...new Set(items.map((i) => i.productId))];
  const products = await db.product.findMany({
    where: { id: { in: ids }, active: true },
    select: { id: true, title: true, slug: true, brandId: true, categoryId: true, brand: { select: { name: true } }, variants: { select: { id: true, price: true, erpCode: true }, take: 1 }, media: { where: { hidden: false, kind: "image" }, orderBy: { sortNo: "asc" }, take: 1, select: { url: true } } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: LineInfo[] = [], missing: string[] = [];
  for (const it of items) {
    const p = byId.get(it.productId), v = p?.variants[0];
    if (!p || !v || Number(v.price) <= 0) { missing.push(it.productId); continue; }
    lines.push({ key: it.key, productId: p.id, variantId: v.id, brandId: p.brandId, categoryIds: await categoryChain(p.categoryId), qty: Math.max(1, Math.min(99, Math.floor(it.qty))), unit: cents(v.price), title: p.title, brand: p.brand.name, image: p.media[0]?.url ?? null, erpCode: v.erpCode, slug: p.slug });
  }
  return { lines, missing };
}

// ---- κουπόνι: υπάρχει; έχει λήξει; ανήκει σε άλλον πελάτη; εξαντλήθηκε; ----
export async function resolveCoupon(code: string | null | undefined, who: { customerId?: string | null; email?: string | null }) {
  const c = (code ?? "").trim().toUpperCase();
  if (!c) return null;
  const row = await db.coupon.findUnique({ where: { code: c } });
  if (!row) return { code: c, promotionId: null, problem: "ο κωδικός δεν υπάρχει" };
  if (row.expiresAt && row.expiresAt < new Date()) return { code: c, promotionId: row.promotionId, problem: "ο κωδικός έχει λήξει" };
  if (row.maxUses != null && row.usedCount >= row.maxUses) return { code: c, promotionId: row.promotionId, problem: "ο κωδικός έχει ήδη χρησιμοποιηθεί" };
  if (row.kind === "unique" && ((row.customerId && row.customerId !== who.customerId) || (!row.customerId && row.email && row.email !== who.email?.toLowerCase())))
    return { code: c, promotionId: row.promotionId, problem: "ο κωδικός είναι προσωπικός και ανήκει σε άλλο λογαριασμό" };
  return { code: c, promotionId: row.promotionId };
}

/** Πόσες φορές έχει χρησιμοποιήσει ο πελάτης κάθε προσφορά (για «μέγιστο ανά πελάτη»). */
export async function usesByPromo(who: { customerId?: string | null; email?: string | null }): Promise<Record<string, number>> {
  if (!who.customerId && !who.email) return {};
  const rows = await db.promotionUsage.groupBy({ by: ["promotionId", "orderId"], where: who.customerId ? { customerId: who.customerId } : { email: who.email!.toLowerCase() } });
  const out: Record<string, number> = {};
  for (const r of rows) out[r.promotionId] = (out[r.promotionId] ?? 0) + 1;
  return out;
}

/** Νέος πελάτης = καμία παραγγελία που δεν ακυρώθηκε. */
export async function isNewCustomer(who: { customerId?: string | null; email?: string | null }) {
  if (!who.customerId && !who.email) return true;
  const n = await db.order.count({ where: { status: { notIn: ["cancelled"] }, ...(who.customerId ? { customerId: who.customerId } : { guestEmail: who.email!.toLowerCase() }) } });
  return n === 0;
}

/**
 * Omnibus: η χαμηλότερη τιμή των τελευταίων 30 ημερών ανά variant, από το ιστορικό τιμών του συγχρονισμού με το SoftOne.
 * Είναι η «προηγούμενη τιμή» που επιτρέπεται να φαίνεται σε κάθε ανακοινωμένη μείωση.
 */
export async function lowest30(variantIds: string[], now = new Date()): Promise<Map<string, number>> {
  if (!variantIds.length) return new Map();
  const since = new Date(now.getTime() - 30 * 86400000);
  const rows = await db.priceHistory.groupBy({ by: ["variantId"], where: { variantId: { in: variantIds }, from: { lte: now }, OR: [{ to: null }, { to: { gte: since } }] }, _min: { price: true } });
  return new Map(rows.filter((r) => r._min.price != null).map((r) => [r.variantId, cents(r._min.price)]));
}
