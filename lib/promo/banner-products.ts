import "server-only";
import { cutoutFor } from "@/lib/data/cutouts";
import { getProductsByIds } from "@/lib/data/repo";
import type { BannerDesign, BannerProduct } from "./banner-design";

/** Τα προϊόντα ενός σχεδιασμένου banner, με τιμή και φωτογραφία ΤΩΡΑ: όσα διάλεξε ο διαχειριστής ή της προσφοράς του. */
export async function bannerProducts(d: BannerDesign, promotionId: string | null): Promise<BannerProduct[]> {
  let ids: string[] = [];
  if (d.products.source === "manual") ids = d.products.ids;
  else if (d.products.source === "promotion" && promotionId) ids = await (await import("./landing")).promotionProductIds(promotionId, d.products.max);
  if (!ids.length) return [];
  const list = await getProductsByIds(ids.slice(0, d.products.max));
  return list.filter((p) => p.price > 0).map((p) => {
    const cut = cutoutFor(p.image);
    return { id: p.id, brand: p.brand, title: p.title, href: `/proion/${p.slug}`, image: cut ?? p.image, cutout: !!cut, price: p.price, wasPrice: p.wasPrice ?? null, energy: p.energy?.cls ?? null };
  });
}
