import "server-only";
import { db } from "@/lib/db";
import type { StickerParams } from "./model";
import type { CardSticker } from "./layout";
import { matches, type PromoTarget } from "@/lib/promo/engine";

interface Rule { id: string; key: string; params: StickerParams; targets: PromoTarget[]; minPrice: number | null; maxPrice: number | null; onlyInStock: boolean; startsAt: Date | null; endsAt: Date | null; priority: number }

/**
 * Από πού παίρνει stickers ένα προϊόν: η προσφορά του (Promotion.stickerKey, όσο ισχύει), οι ετικέτες του
 * (Tag.stickerKey), τα χειροκίνητα (ProductSticker, εντός ημερομηνιών) και οι γενικοί κανόνες (StickerRule). Μικρή cache (1′) για τις αντιστοιχίσεις,
 * ώστε οι λίστες να μην κάνουν ερώτημα ανά προϊόν. Προτεραιότητα: προσφορά (η δική της) → χειροκίνητα → κανόνες → ετικέτες.
 */
let cache: { at: number; byKey: Map<string, StickerParams>; promo: Map<string, { key: string; priority: number }>; rules: Rule[]; parent: Map<string, string | null> } | null = null;
const EMPTY = { byKey: new Map<string, StickerParams>(), promo: new Map<string, { key: string; priority: number }>(), rules: [] as Rule[], parent: new Map<string, string | null>() };

export async function loadStickerCatalog() {
  if (cache && Date.now() - cache.at < 60_000) return cache;
  try {
    const [stickers, promos] = await Promise.all([
      db.sticker.findMany({ where: { active: true }, select: { key: true, params: true } }),
      db.promotion.findMany({ where: { stickerKey: { not: null }, status: { in: ["active", "scheduled"] } }, select: { id: true, stickerKey: true, priority: true } }),
    ]);
    // κανόνες (ξεχωριστά: πριν εφαρμοστεί ο πίνακας, χωρίς κανόνες αντί για σφάλμα) και δέντρο κατηγοριών για τις υποκατηγορίες
    const [rules, cats] = await Promise.all([
      db.stickerRule.findMany({ where: { active: true, sticker: { active: true } }, orderBy: { priority: "asc" }, select: { id: true, targets: true, minPrice: true, maxPrice: true, onlyInStock: true, startsAt: true, endsAt: true, priority: true, sticker: { select: { key: true, params: true } } } }).catch(() => []),
      db.category.findMany({ select: { id: true, parentId: true } }),
    ]);
    cache = {
      at: Date.now(), byKey: new Map(stickers.map((s) => [s.key, s.params as unknown as StickerParams])), promo: new Map(promos.map((p) => [p.id, { key: p.stickerKey!, priority: p.priority }])),
      rules: rules.map((r) => ({ id: r.id, key: r.sticker.key, params: r.sticker.params as unknown as StickerParams, targets: (r.targets as unknown as PromoTarget[]) ?? [], minPrice: r.minPrice, maxPrice: r.maxPrice, onlyInStock: r.onlyInStock, startsAt: r.startsAt, endsAt: r.endsAt, priority: r.priority })),
      parent: new Map(cats.map((c) => [c.id, c.parentId])),
    };
  } catch { cache = { at: Date.now(), ...EMPTY }; } // πριν εφαρμοστεί το σχήμα: χωρίς stickers, όχι σφάλμα
  return cache;
}
export const resetStickerCatalog = () => { cache = null; };

export function stickersOf(r: { id?: string; brandId?: string; categoryId?: string; price?: number | null; stock?: number; offer?: { tags: unknown; endsAt: Date | null; price?: unknown } | null; tags?: { tag: { stickerKey?: string | null } }[]; stickers?: { startsAt: Date | null; endsAt: Date | null; sort: number; sticker: { key: string; params: unknown; active: boolean } }[] }): CardSticker[] | undefined {
  const c = cache ?? { ...EMPTY };
  const out = new Map<string, CardSticker>();
  const now = Date.now();
  const offerLive = r.offer && !(r.offer.endsAt && r.offer.endsAt.getTime() < now);
  for (const t of (offerLive ? ((r.offer!.tags as { promotionId?: string }[]) ?? []) : [])) {
    const pr = t.promotionId ? c.promo.get(t.promotionId) : undefined; const params = pr ? c.byKey.get(pr.key) : undefined;
    if (pr && params && !out.has(pr.key)) out.set(pr.key, { key: pr.key, params, priority: pr.priority, source: "promo" });
  }
  for (const m of r.stickers ?? []) {
    if (!m.sticker.active || (m.startsAt && m.startsAt.getTime() > now) || (m.endsAt && m.endsAt.getTime() < now) || out.has(m.sticker.key)) continue;
    out.set(m.sticker.key, { key: m.sticker.key, params: m.sticker.params as StickerParams, priority: 1000 + m.sort, source: "manual" });
  }
  // γενικοί κανόνες (μάρκα / κατηγορία / προϊόντα, τιμή, διαθεσιμότητα, ημερομηνίες)
  if (c.rules.length && r.id && r.brandId && r.categoryId) {
    const chain: string[] = []; for (let x: string | null | undefined = r.categoryId, g = 0; x && g < 8; x = c.parent.get(x), g++) chain.push(x);
    const price = offerLive && r.offer?.price != null ? Math.min(Number(r.offer.price), r.price ?? Infinity) : r.price ?? null;
    for (const rule of c.rules) {
      if (out.has(rule.key) || (rule.startsAt && rule.startsAt.getTime() > now) || (rule.endsAt && rule.endsAt.getTime() < now)) continue;
      if (rule.onlyInStock && !(r.stock && r.stock > 0)) continue;
      if ((rule.minPrice != null || rule.maxPrice != null) && (price == null || price <= 0 || (rule.minPrice != null && price < rule.minPrice) || (rule.maxPrice != null && price > rule.maxPrice))) continue;
      if (!rule.targets.some((t) => !t.exclude) && !rule.minPrice && !rule.maxPrice) continue; // κανόνας χωρίς στόχευση δεν μπαίνει παντού κατά λάθος
      if (!matches({ targets: rule.targets }, { productId: r.id, variantId: "", brandId: r.brandId, categoryIds: chain })) continue;
      out.set(rule.key, { key: rule.key, params: rule.params, priority: 2000 + rule.priority, source: "rule" });
    }
  }
  for (const t of r.tags ?? []) {
    const k = t.tag.stickerKey; const params = k ? c.byKey.get(k) : undefined;
    if (k && params && !out.has(k)) out.set(k, { key: k, params, priority: 3000, source: "tag" });
  }
  return out.size ? [...out.values()].sort((a, b) => a.priority - b.priority) : undefined;
}
