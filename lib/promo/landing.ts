import { cache } from "react";
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { catalogTree, dbProductsByIds } from "@/lib/data/db-catalog";
import { inCategory, offerCategories } from "./offer-categories";
import type { Block } from "./landing-blocks";

/** Landing pages και διαφημιστικές θέσεις για τη βιτρίνα. */

const live = (p: { status: string; held: boolean; startsAt: Date | null; endsAt: Date | null } | null, now = new Date()) =>
  !!p && !p.held && ["active", "scheduled"].includes(p.status) && (!p.startsAt || p.startsAt <= now) && (!p.endsAt || p.endsAt > now);

export async function getLanding(slug: string, opts: { preview?: boolean } = {}) {
  const page = await db.landingPage.findUnique({ where: { slug } });
  if (!page || page.status === "archived") return null;
  const now = new Date();
  const visible = page.status === "published" && (!page.startsAt || page.startsAt <= now);
  if (!visible && !opts.preview) return null;
  const promo = page.promotionId ? await db.promotion.findUnique({ where: { id: page.promotionId }, select: { id: true, name: true, status: true, held: true, startsAt: true, endsAt: true, termsText: true } }) : null;
  const ended = (page.endsAt && page.endsAt <= now) || (promo ? !live(promo, now) && !(promo.status === "scheduled" && promo.startsAt && promo.startsAt > now) : false);
  return { page, blocks: (page.blocks as unknown as Block[]) ?? [], promo, ended: !!ended, endsAt: promo?.endsAt ?? page.endsAt ?? null };
}

/** Τα προϊόντα μιας προσφοράς από τις έτοιμες τιμές (ProductOffer) — γρήγορο, χωρίς υπολογισμό. */
export async function promotionProductIds(promotionId: string, limit = 24, sort: "discount" | "price-asc" | "price-desc" = "discount") {
  const rows = await db.productOffer.findMany({
    where: { OR: [{ promotionId }, { tags: { array_contains: [{ promotionId }] as unknown as Prisma.InputJsonValue } }] },
    select: { productId: true, price: true, listPrice: true }, take: 500,
  });
  const key = (r: (typeof rows)[number]) => (sort === "price-asc" ? Number(r.price) : sort === "price-desc" ? -Number(r.price) : -(Number(r.listPrice) - Number(r.price)) / Number(r.listPrice || 1));
  return rows.sort((a, b) => key(a) - key(b)).slice(0, limit).map((r) => r.productId);
}

export async function blockProducts(b: Extract<Block, { type: "products" }>["props"], promotionId: string | null) {
  const limit = Math.min(48, b.limit ?? 24);
  let ids: string[] = [];
  if (b.source === "promotion" && promotionId) ids = await promotionProductIds(promotionId, limit, b.sort);
  else if (b.source === "manual") ids = (b.ids ?? []).slice(0, limit);
  else if (b.source === "category" && b.categoryId) {
    const cats = await db.category.findMany({ where: { OR: [{ id: b.categoryId }, { parentId: b.categoryId }, { parent: { parentId: b.categoryId } }] }, select: { id: true } });
    ids = (await db.product.findMany({ where: { active: true, soldAlone: true, categoryId: { in: cats.map((c) => c.id) }, price: { gt: 0 } }, orderBy: b.sort === "price-asc" ? { price: "asc" } : b.sort === "price-desc" ? { price: "desc" } : { offer: { price: "asc" } }, take: limit, select: { id: true } })).map((p) => p.id);
  }
  if (!ids.length) return [];
  const products = await dbProductsByIds(ids);
  const order = new Map(ids.map((id, i) => [id, i]));
  return products.sort((a, b2) => (order.get(a.id) ?? 0) - (order.get(b2.id) ?? 0));
}

// ---- διαφημιστικές θέσεις ----
const pending = new Map<string, number>();
let flushAt = 0;
function countImpression(id: string) {
  pending.set(id, (pending.get(id) ?? 0) + 1);
  if (Date.now() - flushAt < 60_000) return;
  flushAt = Date.now();
  const batch = [...pending.entries()]; pending.clear();
  void Promise.all(batch.map(([pid, n]) => db.adPlacement.update({ where: { id: pid }, data: { impressions: { increment: n } } }).catch(() => null)));
}

let adCache: { at: number; rows: Awaited<ReturnType<typeof loadAds>> } | null = null;
async function loadAds() {
  const now = new Date();
  const rows = await db.adPlacement.findMany({ where: { status: "active", OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] }, orderBy: { priority: "asc" } });
  const promoIds = [...new Set(rows.map((r) => r.promotionId).filter((x): x is string => !!x))];
  const promos = promoIds.length ? await db.promotion.findMany({ where: { id: { in: promoIds } }, select: { id: true, status: true, held: true, startsAt: true, endsAt: true } }) : [];
  const ok = new Set(promos.filter((p) => live(p, now)).map((p) => p.id));
  return rows.filter((r) => !r.promotionId || ok.has(r.promotionId));
}
export function invalidateAds() { adCache = null; }

/**
 * Η θέση με τη μεγαλύτερη προτεραιότητα για αυτό το σημείο (cache 30 s). Στόχευση μόνο ανά κατηγορία — χωρίς cookies,
 * ώστε οι σελίδες καταλόγου να μένουν γρήγορες και cacheable.
 */
/** Συγκεκριμένο banner (για components σε ζώνες σελίδων): μόνο αν είναι ενεργό, μέσα στις ημερομηνίες του και η προσφορά του ζει. */
export async function pickAdById(id: string, opts: { count?: boolean } = {}) {
  if (!adCache || Date.now() - adCache.at > 30_000) adCache = { at: Date.now(), rows: await loadAds() };
  const ad = adCache.rows.find((r) => r.id === id) ?? null;
  if (ad && opts.count !== false) countImpression(ad.id);
  return ad;
}

/** Ποια banners έχουν ήδη μπει σε αυτή τη σελίδα, ανά θέση (ζει όσο ένα αίτημα): έτσι δύο ζώνες της ίδιας θέσης δεν δείχνουν το ίδιο. */
const shownAds = cache(() => new Map<string, { used: Set<string>; last: string | null }>());

/**
 * Το banner μιας θέσης. Με `distinct` (οι ζώνες της σελίδας), κάθε επόμενη ζώνη της ίδιας θέσης παίρνει το επόμενο ενεργό banner
 * με τη σειρά προτεραιότητας· όταν τελειώσουν, ξαναρχίζει από το πρώτο. Με `count: false` (δεύτερο αντίγραφο της ίδιας ζώνης,
 * π.χ. διάταξη κινητού) επιστρέφει το ίδιο banner με το προηγούμενο, χωρίς να προχωρά.
 */
export async function pickAd(slot: string, ctx: { category?: string | null; count?: boolean; distinct?: boolean } = {}) {
  if (!adCache || Date.now() - adCache.at > 30_000) adCache = { at: Date.now(), rows: await loadAds() };
  const fits = adCache.rows.filter((r) => {
    if (r.slot !== slot) return false;
    const a = (r.audience ?? {}) as { categories?: string[] };
    if (a.categories?.length && (!ctx.category || !a.categories.includes(ctx.category))) return false;
    return true;
  });
  let ad = fits[0];
  if (ctx.distinct && fits.length) {
    const seen = shownAds();
    const st = seen.get(slot) ?? { used: new Set<string>(), last: null };
    seen.set(slot, st);
    if (ctx.count === false && st.last) ad = fits.find((r) => r.id === st.last) ?? fits[0];
    else {
      if (fits.every((r) => st.used.has(r.id))) st.used.clear();
      ad = fits.find((r) => !st.used.has(r.id)) ?? fits[0];
      st.used.add(ad.id); st.last = ad.id;
    }
  }
  if (ad && ctx.count !== false) countImpression(ad.id);
  return ad ?? null;
}

/**
 * Τα προϊόντα που είναι ΤΩΡΑ σε προσφορά τιμής (έτοιμη τιμή χαμηλότερη από τη διαγραμμένη), για τη σελίδα /prosfores:
 * όλες οι ενεργές προσφορές μαζί — ποσοστό, τιμές από Excel και διαγραμμένες τιμές SoftOne. Ταξινόμηση και σελίδες στη μνήμη
 * (λίγες εκατοντάδες γραμμές).
 */
export async function offerProductsPage(sort: string | undefined, page: number, perPage = 48, category?: string) {
  const all = (await db.productOffer.findMany({ where: { product: { active: true, soldAlone: true, price: { gt: 0 } } }, select: { productId: true, price: true, listPrice: true, product: { select: { categoryId: true } } }, take: 5000 }))
    .map((r) => ({ id: r.productId, price: Number(r.price), list: Number(r.listPrice), cat: r.product.categoryId })).filter((r) => r.list > r.price);
  // φίλτρο κατηγορίας: τα πλήθη μετρούν πάντα όλες τις προσφορές, ώστε να φαίνονται και οι υπόλοιπες κατηγορίες
  const { byId } = await catalogTree();
  const categories = offerCategories(all.map((r) => r.cat), byId);
  const known = categories.some((c) => c.slug === category || c.children.some((ch) => ch.slug === category)); // παλιός σύνδεσμος → όλες
  const rows = category && known ? all.filter((r) => inCategory(r.cat, category, byId)) : all;
  const key = (r: (typeof rows)[number]) => (sort === "price-asc" ? r.price : sort === "price-desc" ? -r.price : -(r.list - r.price) / r.list);
  rows.sort((a, b) => key(a) - key(b));
  const pages = Math.max(1, Math.ceil(rows.length / perPage)), p = Math.min(pages, Math.max(1, page || 1));
  const ids = rows.slice((p - 1) * perPage, p * perPage).map((r) => r.id);
  const items = ids.length ? await dbProductsByIds(ids) : [];
  const order = new Map(ids.map((id, i) => [id, i]));
  return { items: items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)), total: rows.length, page: p, pages, categories };
}
