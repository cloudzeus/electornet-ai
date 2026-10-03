import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { AutoSource } from "./brand-store";

/**
 * Δεδομένα για τα «ζωντανά» components της σελίδας μάρκας — υπολογίζονται σε κάθε προβολή από τον κατάλογο,
 * ώστε να μη χρειάζεται ο διαχειριστής να τα ενημερώνει (νέα προϊόντα, προσφορές, απόθεμα, κατηγορίες).
 */

let catCache: { at: number; rows: { id: string; name: string; slug: string; parentId: string | null; depth: number; active: boolean }[] } | null = null;
async function categories() {
  if (catCache && Date.now() - catCache.at < 5 * 60_000) return catCache.rows;
  const rows = await db.category.findMany({ select: { id: true, name: true, slug: true, parentId: true, depth: true, active: true } });
  catCache = { at: Date.now(), rows };
  return rows;
}

async function subtree(id: string) {
  const cats = await categories();
  const kids = new Map<string, string[]>();
  for (const c of cats) if (c.parentId) kids.set(c.parentId, [...(kids.get(c.parentId) ?? []), c.id]);
  const out: string[] = [];
  for (const st = [id]; st.length; ) { const x = st.pop()!; out.push(x); st.push(...(kids.get(x) ?? [])); }
  return out;
}

/** /k/<επίπεδο1>/<επίπεδο2>… για μια κατηγορία */
export async function categoryHref(id: string, brandSlug?: string) {
  const cats = await categories();
  const by = new Map(cats.map((c) => [c.id, c]));
  const path: string[] = [];
  for (let c = by.get(id), g = 0; c && g < 6; g++) { path.unshift(c.slug); c = c.parentId ? by.get(c.parentId) : undefined; }
  return `/k/${path.join("/")}${brandSlug ? `?brand=${encodeURIComponent(brandSlug)}` : ""}`;
}

/** Τα ids των προϊόντων για ένα «Προϊόντα (αυτόματα)». */
export async function autoProductIds(brandSlug: string | null, source: AutoSource, limit: number, categoryId?: string): Promise<string[]> {
  const take = Math.max(2, Math.min(12, limit || 8));
  const where: Prisma.ProductWhereInput = { active: true, ...(brandSlug ? { brand: { slug: brandSlug } } : {}), price: { not: null }, media: { some: { hidden: false, kind: "image" } }, ...(categoryId ? { categoryId: { in: await subtree(categoryId) } } : {}) };
  if (source === "offers") {
    // προϊόντα με ενεργή προσφορά τιμής (ProductOffer: τελική τιμή < τιμή καταλόγου)
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM "Product" p JOIN "ProductOffer" o ON o."productId" = p.id JOIN "Brand" b ON b.id = p."brandId"
      WHERE p.active ${brandSlug ? Prisma.sql`AND b.slug = ${brandSlug}` : Prisma.empty} AND o.price < o."listPrice" ${categoryId ? Prisma.sql`AND p."categoryId" = ANY(${await subtree(categoryId)})` : Prisma.empty}
      ORDER BY (o."listPrice" - o.price) / NULLIF(o."listPrice", 0) DESC LIMIT ${take}`.catch(() => []);
    return rows.map((r) => r.id);
  }
  const orderBy: Prisma.ProductOrderByWithRelationInput[] = source === "newest" ? [{ createdAt: "desc" }] : source === "value" ? [{ price: "asc" }] : [{ price: "desc" }];
  const rows = await db.product.findMany({ where: { ...where, ...(source === "in-stock" ? { stock: { gt: 0 } } : {}) }, orderBy, take, select: { id: true } });
  return rows.map((r) => r.id);
}

export type CategoryTile = { id: string; name: string; href: string; count: number; image: string | null };

/** Κατηγορίες της μάρκας ως πλακίδια: αυτόματα (οι μεγαλύτερες, στο 2ο επίπεδο όπου υπάρχει) ή όσες διάλεξε ο διαχειριστής. */
export async function categoryTiles(brandSlug: string | null, opts: { mode: "auto" | "manual"; items?: { id: string; name: string; image?: string }[]; limit?: number }): Promise<CategoryTile[]> {
  const cats = await categories();
  const by = new Map(cats.map((c) => [c.id, c]));
  const rows = await db.product.groupBy({ by: ["categoryId"], where: { active: true, ...(brandSlug ? { brand: { slug: brandSlug } } : {}) }, _count: { _all: true } });
  const count = new Map<string, number>();
  for (const r of rows) for (let id: string | null = r.categoryId, g = 0; id && g < 8; g++) { count.set(id, (count.get(id) ?? 0) + r._count._all); id = by.get(id)?.parentId ?? null; }
  let picked: { id: string; name: string; image?: string }[];
  if (opts.mode === "manual" && opts.items?.length) picked = opts.items.filter((i) => count.get(i.id));
  else {
    const level = cats.filter((c) => c.active && c.depth === 1 && count.get(c.id)).length >= 3 ? 1 : 0;
    picked = cats.filter((c) => c.active && c.depth === level && count.get(c.id)).sort((a, b) => count.get(b.id)! - count.get(a.id)!).slice(0, Math.max(2, Math.min(12, opts.limit ?? 6))).map((c) => ({ id: c.id, name: c.name }));
  }
  return Promise.all(picked.map(async (c) => {
    const p = c.image ? null : await db.product.findFirst({ where: { active: true, ...(brandSlug ? { brand: { slug: brandSlug } } : {}), categoryId: { in: await subtree(c.id) }, media: { some: { hidden: false, kind: "image" } } }, orderBy: { price: { sort: "desc", nulls: "last" } }, select: { media: { where: { hidden: false, kind: "image" }, orderBy: { sortNo: "asc" }, take: 1, select: { url: true, thumbUrl: true } } } });
    return { id: c.id, name: c.name, href: await categoryHref(c.id, brandSlug ?? undefined), count: count.get(c.id) ?? 0, image: c.image || p?.media[0]?.url || null };
  }));
}


// ---- Προσφορές & καταστήματα (για ζώνες σελίδων) ----

const live = (p: { status: string; held: boolean; startsAt: Date | null; endsAt: Date | null }, now = new Date()) => !p.held && (p.status === "active" || p.status === "scheduled") && (!p.startsAt || p.startsAt <= now) && (!p.endsAt || p.endsAt > now);

export type PromoData = { name: string; endsAt: string | null; productIds: string[]; landingHref: string | null };
/** Προϊόντα μιας προσφοράς — μόνο όσο η προσφορά «ζει». */
export async function promoBlockData(promotionId: string, limit: number): Promise<PromoData | null> {
  const p = await db.promotion.findUnique({ where: { id: promotionId }, select: { name: true, status: true, held: true, startsAt: true, endsAt: true } });
  if (!p || !live(p)) return null;
  const { promotionProductIds } = await import("@/lib/promo/landing");
  const [ids, landing] = await Promise.all([promotionProductIds(promotionId, Math.max(2, Math.min(12, limit || 8))), db.landingPage.findFirst({ where: { promotionId, status: "published" }, select: { slug: true } })]);
  return { name: p.name, endsAt: p.endsAt?.toISOString() ?? null, productIds: ids, landingHref: landing ? `/prosfores/${landing.slug}` : null };
}

export type LandingData = { title: string; href: string; image: string | null; kicker: string | null; subtitle: string | null; endsAt: string | null };
/** Κάρτα σελίδας προσφοράς — μόνο αν είναι δημοσιευμένη, στις ημερομηνίες της, και η προσφορά της ζει. */
export async function landingBlockData(landingId: string): Promise<LandingData | null> {
  const l = await db.landingPage.findUnique({ where: { id: landingId } });
  const now = new Date();
  if (!l || l.status !== "published" || (l.startsAt && l.startsAt > now) || (l.endsAt && l.endsAt < now)) return null;
  let endsAt = l.endsAt;
  if (l.promotionId) {
    const p = await db.promotion.findUnique({ where: { id: l.promotionId }, select: { status: true, held: true, startsAt: true, endsAt: true } });
    if (!p || !live(p)) return null;
    endsAt = p.endsAt ?? endsAt;
  }
  const hero = (Array.isArray(l.blocks) ? (l.blocks as { type?: string; props?: Record<string, string> }[]) : []).find((b) => b.type === "hero")?.props ?? {};
  return { title: hero.title || l.title, href: `/prosfores/${l.slug}`, image: hero.image || null, kicker: hero.kicker || null, subtitle: hero.subtitle || null, endsAt: endsAt?.toISOString() ?? null };
}

export type CouponData = { code: string; value: string; promo: string; expiresAt: string | null };
/** Κοινό κουπόνι — μόνο αν ισχύει (προσφορά σε ισχύ, όχι ληγμένο, όχι εξαντλημένο). */
export async function couponBlockData(code: string): Promise<CouponData | null> {
  const c = await db.coupon.findUnique({ where: { code: code.trim().toUpperCase() }, include: { promotion: { select: { name: true, status: true, held: true, startsAt: true, endsAt: true, mechanism: true, reward: true } } } });
  if (!c || c.kind !== "shared" || c.customerId || !live(c.promotion) || (c.expiresAt && c.expiresAt < new Date()) || (c.maxUses != null && c.usedCount >= c.maxUses)) return null;
  const { couponValueLabel } = await import("@/lib/promo/issue");
  const ends = [c.expiresAt, c.promotion.endsAt].filter((d): d is Date => !!d).sort((a, b) => +a - +b)[0] ?? null;
  return { code: c.code, value: couponValueLabel(c.promotion), promo: c.promotion.name, expiresAt: ends?.toISOString() ?? null };
}
