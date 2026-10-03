import "server-only";
import type { ReactNode } from "react";
import type { BrandBlock, BrandStore, Zone } from "./brand-store";
import { blockActive, validateBrandStore } from "./brand-store";
import { autoProductIds, categoryTiles, type CategoryTile } from "./brand-auto";
import { getProductsByIds } from "@/lib/data/repo";
import type { Product } from "@/lib/data/types";
import { BrandFrame } from "@/components/brand/BrandFrame";
import { BrandHero } from "@/components/brand/BrandHero";
import { NewArrivals, Series, Offers, Story, Tech, Support, VideoBlock } from "@/components/brand/BrandBlocks";
import { Announcement, Usp, Banner, ProductsAuto, Categories, Faq, TextBlock, Gallery, CtaBand } from "@/components/brand/BrandBlocksMore";

/**
 * Brand store renderer: validates the CMS record, resolves the «live» blocks (auto products, category tiles),
 * collects every product id in ONE catalogue read, then renders the zones in order:
 *   top (πάνω από το hero) → hero → main → bottom (πριν τον κατάλογο).
 * Unknown block types are skipped with a warning (never break the page).
 */
export async function renderBrandStore(store: BrandStore, now = new Date()): Promise<ReactNode> {
  const problems = validateBrandStore(store);
  if (problems.length && process.env.NODE_ENV !== "production") console.warn(`[cms] brand store ${store.slug}:`, problems);
  const blocks = store.blocks.filter((b) => blockActive(b, now));

  const auto: Record<string, string[]> = {};
  const tiles: Record<string, CategoryTile[]> = {};
  await Promise.all(blocks.map(async (b) => {
    if (b.type === "products-auto") auto[b.id] = await autoProductIds(store.slug, b.source, b.limit, b.categoryId).catch(() => []);
    if (b.type === "categories") tiles[b.id] = await categoryTiles(store.slug, b).catch(() => []);
  }));

  const ids = new Set<string>([store.hero.productId, ...Object.values(auto).flat()]);
  for (const b of blocks) {
    if ("productIds" in b) b.productIds.forEach((id) => ids.add(id));
    if (b.type === "series") b.items.forEach((it) => it.productIds.forEach((id) => ids.add(id)));
  }
  const list = await getProductsByIds([...ids].filter(Boolean));
  const products: Record<string, Product> = Object.fromEntries(list.map((p) => [p.id, p]));
  const zone = (z: Zone) => blocks.filter((b) => (b.zone ?? "main") === z).map((b) => renderBlock(b, products, store, auto, tiles));
  return (
    <BrandFrame theme={store.theme}>
      {zone("top")}
      <BrandHero store={store} product={products[store.hero.productId] ?? null} />
      {zone("main")}
      {zone("bottom")}
    </BrandFrame>
  );
}

function renderBlock(b: BrandBlock, products: Record<string, Product>, store: BrandStore, auto: Record<string, string[]>, tiles: Record<string, CategoryTile[]>): ReactNode {
  switch (b.type) {
    case "new-arrivals":
      return <NewArrivals key={b.id} b={b} products={products} />;
    case "series":
      return <Series key={b.id} b={b} products={products} />;
    case "offers":
      return <Offers key={b.id} b={b} products={products} />;
    case "story":
      return <Story key={b.id} b={b} />;
    case "tech":
      return <Tech key={b.id} b={b} />;
    case "support":
      return <Support key={b.id} b={b} brand={store.name} />;
    case "video":
      return <VideoBlock key={b.id} b={b} />;
    case "announcement":
      return <Announcement key={b.id} b={b} />;
    case "usp":
      return <Usp key={b.id} b={b} />;
    case "banner":
      return <Banner key={b.id} b={b} />;
    case "products-auto":
      return <ProductsAuto key={b.id} b={b} products={(auto[b.id] ?? []).map((id) => products[id]).filter(Boolean)} />;
    case "categories":
      return <Categories key={b.id} b={b} tiles={tiles[b.id] ?? []} />;
    case "faq":
      return <Faq key={b.id} b={b} />;
    case "text":
      return <TextBlock key={b.id} b={b} />;
    case "gallery":
      return <Gallery key={b.id} b={b} />;
    case "cta":
      return <CtaBand key={b.id} b={b} />;
    default:
      if (process.env.NODE_ENV !== "production") console.warn("[cms] unknown brand block", (b as { type: string }).type);
      return null;
  }
}
