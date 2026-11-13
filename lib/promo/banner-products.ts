import "server-only";
import { cutoutFor } from "@/lib/data/cutouts";
import { getProductsByIds } from "@/lib/data/repo";
import { db } from "@/lib/db";
import type { StickerParams } from "@/lib/stickers/model";
import { bannerCutouts } from "./banner-cutouts";
import type { BannerDesign, BannerProduct } from "./banner-design";

/** Τα προϊόντα ενός σχεδιασμένου banner, με τιμή και φωτογραφία ΤΩΡΑ: όσα διάλεξε ο διαχειριστής ή της προσφοράς του. */
export async function bannerProducts(d: BannerDesign, promotionId: string | null): Promise<BannerProduct[]> {
  let ids: string[] = [];
  if (d.products.source === "manual") ids = d.products.ids;
  else if (d.products.source === "promotion" && promotionId) ids = await (await import("./landing")).promotionProductIds(promotionId, d.products.max);
  if (!ids.length) return [];
  const list = await getProductsByIds(ids.slice(0, d.products.max));
  const cuts = await bannerCutouts(list.map((p) => p.id)).catch(() => new Map<string, string>());
  return list.filter((p) => p.price > 0).map((p) => {
    const cut = cuts.get(p.id) ?? cutoutFor(p.image);
    return { id: p.id, brand: p.brand, title: p.title, href: `/proion/${p.slug}`, image: cut ?? p.image, cutout: !!cut, price: p.price, wasPrice: p.wasPrice ?? null, energy: p.energy?.cls ?? null };
  });
}

/** Το sticker ενός σχεδιασμένου banner (μόνο ενεργό) — τα στοιχεία σχεδίασής του για το StickerSvg. */
export async function bannerSticker(key: string | null): Promise<StickerParams | null> {
  if (!key) return null;
  const row = await db.sticker.findFirst({ where: { key, active: true }, select: { params: true } }).catch(() => null);
  return (row?.params as unknown as StickerParams | undefined) ?? null;
}
