"use server";

import { requirePermission } from "@/lib/rbac/guard";
import { normalizeBannerDesign, type BannerDesign, type BannerProduct } from "@/lib/promo/banner-design";
import { bannerProducts } from "@/lib/promo/banner-products";

/** Τα προϊόντα ενός σχεδιασμένου banner για την προεπισκόπηση του editor (ίδια λογική με τη βιτρίνα). */
export async function bannerPreviewProductsAction(design: BannerDesign, promotionId: string | null): Promise<BannerProduct[]> {
  await requirePermission("catalog.promos.write");
  const d = normalizeBannerDesign(design);
  return d ? bannerProducts(d, promotionId) : [];
}
