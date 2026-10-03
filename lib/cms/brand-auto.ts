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
export async function autoProductIds(brandSlug: string, source: AutoSource, limit: number, categoryId?: string): Promise<string[]> {
  const take = Math.max(2, Math.min(12, limit || 8));
  const where: Prisma.ProductWhereInput = { active: true, brand: { slug: brandSlug }, price: { not: null }, media: { some: { hidden: false, kind: "image" } }, ...(categoryId ? { categoryId: { in: await subtree(categoryId) } } : {}) };
  if (source === "offers") {
    // προϊόντα με ενεργή προσφορά τιμής (ProductOffer: τελική τιμή < τιμή καταλόγου)
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM "Product" p JOIN "ProductOffer" o ON o."productId" = p.id JOIN "Brand" b ON b.id = p."brandId"
      WHERE p.active AND b.slug = ${brandSlug} AND o.price < o."listPrice" ${categoryId ? Prisma.sql`AND p."categoryId" = ANY(${await subtree(categoryId)})` : Prisma.empty}
      ORDER BY (o."listPrice" - o.price) / NULLIF(o."listPrice", 0) DESC LIMIT ${take}`.catch(() => []);
    return rows.map((r) => r.id);
  }
  const orderBy: Prisma.ProductOrderByWithRelationInput[] = source === "newest" ? [{ createdAt: "desc" }] : source === "value" ? [{ price: "asc" }] : [{ price: "desc" }];
  const rows = await db.product.findMany({ where: { ...where, ...(source === "in-stock" ? { stock: { gt: 0 } } : {}) }, orderBy, take, select: { id: true } });
  return rows.map((r) => r.id);
}

export type CategoryTile = { id: string; name: string; href: string; count: number; image: string | null };

/** Κατηγορίες της μάρκας ως πλακίδια: αυτόματα (οι μεγαλύτερες, στο 2ο επίπεδο όπου υπάρχει) ή όσες διάλεξε ο διαχειριστής. */
export async function categoryTiles(brandSlug: string, opts: { mode: "auto" | "manual"; items?: { id: string; name: string; image?: string }[]; limit?: number }): Promise<CategoryTile[]> {
  const cats = await categories();
  const by = new Map(cats.map((c) => [c.id, c]));
  const rows = await db.product.groupBy({ by: ["categoryId"], where: { active: true, brand: { slug: brandSlug } }, _count: { _all: true } });
  const count = new Map<string, number>();
  for (const r of rows) for (let id: string | null = r.categoryId, g = 0; id && g < 8; g++) { count.set(id, (count.get(id) ?? 0) + r._count._all); id = by.get(id)?.parentId ?? null; }
  let picked: { id: string; name: string; image?: string }[];
  if (opts.mode === "manual" && opts.items?.length) picked = opts.items.filter((i) => count.get(i.id));
  else {
    const level = cats.filter((c) => c.active && c.depth === 1 && count.get(c.id)).length >= 3 ? 1 : 0;
    picked = cats.filter((c) => c.active && c.depth === level && count.get(c.id)).sort((a, b) => count.get(b.id)! - count.get(a.id)!).slice(0, Math.max(2, Math.min(12, opts.limit ?? 6))).map((c) => ({ id: c.id, name: c.name }));
  }
  return Promise.all(picked.map(async (c) => {
    const p = c.image ? null : await db.product.findFirst({ where: { active: true, brand: { slug: brandSlug }, categoryId: { in: await subtree(c.id) }, media: { some: { hidden: false, kind: "image" } } }, orderBy: { price: { sort: "desc", nulls: "last" } }, select: { media: { where: { hidden: false, kind: "image" }, orderBy: { sortNo: "asc" }, take: 1, select: { url: true, thumbUrl: true } } } });
    return { id: c.id, name: c.name, href: await categoryHref(c.id, brandSlug), count: count.get(c.id) ?? 0, image: c.image || p?.media[0]?.url || null };
  }));
}
