import "server-only";
import { db } from "@/lib/db";
import type { StickerParams } from "./model";
import type { CardSticker } from "./layout";

/**
 * Από πού παίρνει stickers ένα προϊόν: η προσφορά του (Promotion.stickerKey, όσο ισχύει), οι ετικέτες του
 * (Tag.stickerKey) και τα χειροκίνητα (ProductSticker, εντός ημερομηνιών). Μικρή cache (1′) για τις αντιστοιχίσεις,
 * ώστε οι λίστες να μην κάνουν ερώτημα ανά προϊόν. Προτεραιότητα: προσφορά (η δική της) → χειροκίνητα → ετικέτες.
 */
let cache: { at: number; byKey: Map<string, StickerParams>; promo: Map<string, { key: string; priority: number }> } | null = null;
const EMPTY = { byKey: new Map<string, StickerParams>(), promo: new Map<string, { key: string; priority: number }>() };

export async function loadStickerCatalog() {
  if (cache && Date.now() - cache.at < 60_000) return cache;
  try {
    const [stickers, promos] = await Promise.all([
      db.sticker.findMany({ where: { active: true }, select: { key: true, params: true } }),
      db.promotion.findMany({ where: { stickerKey: { not: null }, status: { in: ["active", "scheduled"] } }, select: { id: true, stickerKey: true, priority: true } }),
    ]);
    cache = { at: Date.now(), byKey: new Map(stickers.map((s) => [s.key, s.params as unknown as StickerParams])), promo: new Map(promos.map((p) => [p.id, { key: p.stickerKey!, priority: p.priority }])) };
  } catch { cache = { at: Date.now(), ...EMPTY }; } // πριν εφαρμοστεί το σχήμα: χωρίς stickers, όχι σφάλμα
  return cache;
}
export const resetStickerCatalog = () => { cache = null; };

export function stickersOf(r: { offer?: { tags: unknown; endsAt: Date | null } | null; tags?: { tag: { stickerKey?: string | null } }[]; stickers?: { startsAt: Date | null; endsAt: Date | null; sort: number; sticker: { key: string; params: unknown; active: boolean } }[] }): CardSticker[] | undefined {
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
    out.set(m.sticker.key, { key: m.sticker.key, params: m.sticker.params as StickerParams, priority: 500 + m.sort, source: "manual" });
  }
  for (const t of r.tags ?? []) {
    const k = t.tag.stickerKey; const params = k ? c.byKey.get(k) : undefined;
    if (k && params && !out.has(k)) out.set(k, { key: k, params, priority: 1000, source: "tag" });
  }
  return out.size ? [...out.values()].sort((a, b) => a.priority - b.priority) : undefined;
}
