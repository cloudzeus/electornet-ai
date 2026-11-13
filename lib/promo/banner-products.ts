import "server-only";
import { cutoutFor } from "@/lib/data/cutouts";
import { getProductsByIds } from "@/lib/data/repo";
import { db } from "@/lib/db";
import type { StickerParams } from "@/lib/stickers/model";
import { bannerCutouts } from "./banner-cutouts";
import type { BannerDesign, BannerProduct } from "./banner-design";

/**
 * Τα προϊόντα ενός σχεδιασμένου banner, με τιμή και φωτογραφία ΤΩΡΑ: όσα διάλεξε ο διαχειριστής ή της προσφοράς του.
 * Με `categorySlug` (banner σε λίστα κατηγορίας) μένουν μόνο όσα ανήκουν στην κατηγορία ή στις υποκατηγορίες της —
 * αν δεν ανήκει κανένα, δείχνει τα προϊόντα του banner από τις άλλες κατηγορίες.
 */
export async function bannerProducts(d: BannerDesign, promotionId: string | null, categorySlug?: string | null): Promise<BannerProduct[]> {
  let ids: string[] = [];
  if (d.products.source === "manual") ids = d.products.ids;
  else if (d.products.source === "promotion" && promotionId) ids = await (await import("./landing")).promotionProductIds(promotionId, categorySlug ? 500 : d.products.max);
  if (categorySlug && promotionId) {
    // σε λίστα κατηγορίας μετρά όλη η καμπάνια: το banner μπορεί να ανήκει στην προσφορά «−15 %», αλλά οι σκούπες της καμπάνιας να είναι στο «−10 %» και το «−20 %»
    const camp = await db.promotion.findUnique({ where: { id: promotionId }, select: { campaignId: true } });
    const siblings = camp?.campaignId ? await db.promotion.findMany({ where: { campaignId: camp.campaignId, id: { not: promotionId } }, select: { id: true } }) : [];
    const { promotionProductIds } = await import("./landing");
    for (const s of siblings) ids = [...ids, ...(await promotionProductIds(s.id, 500))];
    ids = [...new Set(ids)];
  }
  if (ids.length && categorySlug) {
    const cats = await db.category.findMany({ where: { OR: [{ slug: categorySlug }, { parent: { slug: categorySlug } }, { parent: { parent: { slug: categorySlug } } }] }, select: { id: true } });
    const inCat = new Set((await db.product.findMany({ where: { id: { in: ids }, categoryId: { in: cats.map((c) => c.id) } }, select: { id: true } })).map((p) => p.id));
    if (inCat.size) ids = ids.filter((id) => inCat.has(id)); // κανένα στην κατηγορία → τα προϊόντα του banner όπως είναι
  }
  if (!ids.length) return [];
  const list = await getProductsByIds(ids.slice(0, d.products.max));
  const cuts = d.products.cutout ? await bannerCutouts(list.map((p) => p.id)).catch(() => new Map<string, string>()) : new Map<string, string>();
  return list.filter((p) => p.price > 0).map((p) => {
    const cut = d.products.cutout ? cuts.get(p.id) ?? cutoutFor(p.image) : null;
    return { id: p.id, brand: p.brand, title: p.title, href: `/proion/${p.slug}`, image: cut ?? p.image, cutout: !!cut, price: p.price, wasPrice: p.wasPrice ?? null, energy: p.energy?.cls ?? null };
  });
}

/** Το sticker ενός σχεδιασμένου banner (μόνο ενεργό) — τα στοιχεία σχεδίασής του για το StickerSvg. */
export async function bannerSticker(key: string | null): Promise<StickerParams | null> {
  if (!key) return null;
  const row = await db.sticker.findFirst({ where: { key, active: true }, select: { params: true } }).catch(() => null);
  return (row?.params as unknown as StickerParams | undefined) ?? null;
}
