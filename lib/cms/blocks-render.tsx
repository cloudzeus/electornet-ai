import "server-only";
import type { ReactNode } from "react";
import type { BrandBlock } from "./brand-store";
import { autoProductIds, categoryTiles, couponBlockData, landingBlockData, promoBlockData, type CategoryTile, type CouponData, type LandingData, type PromoData } from "./brand-auto";
import { getProductsByIds, getStores } from "@/lib/data/repo";
import type { Product, Store } from "@/lib/data/types";
import { NewArrivals, Series, Offers, Story, Tech, Support, VideoBlock } from "@/components/brand/BrandBlocks";
import { Announcement, Usp, Banner, ProductsAuto, Categories, Faq, TextBlock, Gallery, CtaBand } from "@/components/brand/BrandBlocksMore";
import { AdBlock, CouponBlock, PromoLandingCard, PromoProducts, StoresBlock } from "@/components/brand/BlocksPromo";

/**
 * Κοινός renderer των components (σελίδες μαρκών + ζώνες πληροφοριακών σελίδων):
 * 1) υπολογίζει τα «ζωντανά» δεδομένα (αυτόματα προϊόντα, κατηγορίες, προσφορές, κουπόνια, καταστήματα),
 * 2) φέρνει ΟΛΑ τα προϊόντα σε μία ανάγνωση καταλόγου, 3) αποδίδει κάθε ενότητα.
 */
export type BlockData = {
  products: Record<string, Product>;
  auto: Record<string, string[]>;
  tiles: Record<string, CategoryTile[]>;
  promo: Record<string, PromoData | null>;
  landing: Record<string, LandingData | null>;
  coupon: Record<string, CouponData | null>;
  stores: Record<string, Store[]>;
};

export async function resolveBlocks(blocks: BrandBlock[], ctx: { brandSlug?: string | null; extraProductIds?: string[] } = {}): Promise<BlockData> {
  const d: BlockData = { products: {}, auto: {}, tiles: {}, promo: {}, landing: {}, coupon: {}, stores: {} };
  await Promise.all(blocks.map(async (b) => {
    switch (b.type) {
      case "products-auto": d.auto[b.id] = await autoProductIds(ctx.brandSlug ?? b.brand?.slug ?? null, b.source, b.limit, b.categoryId).catch(() => []); break;
      case "categories": d.tiles[b.id] = await categoryTiles(ctx.brandSlug ?? b.brand?.slug ?? null, b).catch(() => []); break;
      case "promo-products": d.promo[b.id] = b.promotionId ? await promoBlockData(b.promotionId, b.limit).catch(() => null) : null; break;
      case "promo-landing": d.landing[b.id] = b.landingId ? await landingBlockData(b.landingId).catch(() => null) : null; break;
      case "coupon": d.coupon[b.id] = b.code ? await couponBlockData(b.code).catch(() => null) : null; break;
      case "stores": {
        const limit = Math.max(1, Math.min(6, b.limit || 3));
        if (b.mode === "region" && b.region) d.stores[b.id] = (await getStores({ region: b.region })).slice(0, limit);
        else { const { geoFromRequest, storesNear } = await import("@/lib/geo/ip"); d.stores[b.id] = await storesNear(await geoFromRequest(), limit).catch(() => []); }
        break;
      }
    }
  }));
  const ids = new Set<string>([...(ctx.extraProductIds ?? []), ...Object.values(d.auto).flat(), ...Object.values(d.promo).flatMap((p) => p?.productIds ?? [])]);
  for (const b of blocks) {
    if ("productIds" in b && Array.isArray(b.productIds)) b.productIds.forEach((id) => ids.add(id));
    if (b.type === "series") b.items.forEach((it) => it.productIds.forEach((id) => ids.add(id)));
  }
  const list = await getProductsByIds([...ids].filter(Boolean));
  d.products = Object.fromEntries(list.map((p) => [p.id, p]));
  return d;
}

const pick = (ids: string[] | undefined, map: Record<string, Product>) => (ids ?? []).map((id) => map[id]).filter(Boolean);

export function renderBlock(b: BrandBlock, d: BlockData, ctx: { brandName: string; countImpressions?: boolean }): ReactNode {
  switch (b.type) {
    case "new-arrivals": return <NewArrivals key={b.id} b={b} products={d.products} />;
    case "series": return <Series key={b.id} b={b} products={d.products} />;
    case "offers": return <Offers key={b.id} b={b} products={d.products} />;
    case "story": return <Story key={b.id} b={b} />;
    case "tech": return <Tech key={b.id} b={b} />;
    case "support": return <Support key={b.id} b={b} brand={ctx.brandName} />;
    case "video": return <VideoBlock key={b.id} b={b} />;
    case "announcement": return <Announcement key={b.id} b={b} />;
    case "usp": return <Usp key={b.id} b={b} />;
    case "banner": return <Banner key={b.id} b={b} />;
    case "products-auto": return <ProductsAuto key={b.id} b={b} products={pick(d.auto[b.id], d.products)} />;
    case "categories": return <Categories key={b.id} b={b} tiles={d.tiles[b.id] ?? []} />;
    case "faq": return <Faq key={b.id} b={b} />;
    case "text": return <TextBlock key={b.id} b={b} />;
    case "gallery": return <Gallery key={b.id} b={b} />;
    case "cta": return <CtaBand key={b.id} b={b} />;
    case "ad": return <AdBlock key={b.id} b={b} count={ctx.countImpressions !== false} />;
    case "promo-products": return <PromoProducts key={b.id} b={b} data={d.promo[b.id] ?? null} products={pick(d.promo[b.id]?.productIds, d.products)} />;
    case "promo-landing": return <PromoLandingCard key={b.id} data={d.landing[b.id] ?? null} />;
    case "coupon": return <CouponBlock key={b.id} b={b} data={d.coupon[b.id] ?? null} />;
    case "stores": return <StoresBlock key={b.id} b={b} stores={d.stores[b.id] ?? []} />;
    default:
      if (process.env.NODE_ENV !== "production") console.warn("[cms] unknown block", (b as { type: string }).type);
      return null;
  }
}
