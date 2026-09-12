import "server-only";
import type { ReactNode } from "react";
import type { BrandBlock, BrandStore } from "./brand-store";
import { blockActive, validateBrandStore } from "./brand-store";
import { getProductsByIds } from "@/lib/data/repo";
import type { Product } from "@/lib/data/types";
import { BrandFrame } from "@/components/brand/BrandFrame";
import { BrandHero } from "@/components/brand/BrandHero";
import { NewArrivals, Series, Offers, Story, Tech, Support, VideoBlock } from "@/components/brand/BrandBlocks";

/**
 * Brand store renderer: validates the CMS record, collects every product id
 * referenced by the hero and the blocks, resolves them in ONE catalogue
 * read, then maps each active block to its component. Unknown block types
 * are skipped with a warning (never break the page).
 */
export async function renderBrandStore(store: BrandStore, now = new Date()): Promise<ReactNode> {
  const problems = validateBrandStore(store);
  if (problems.length && process.env.NODE_ENV !== "production") console.warn(`[cms] brand store ${store.slug}:`, problems);
  const ids = new Set<string>([store.hero.productId]);
  for (const b of store.blocks) {
    if ("productIds" in b) b.productIds.forEach((id) => ids.add(id));
    if (b.type === "series") b.items.forEach((it) => it.productIds.forEach((id) => ids.add(id)));
  }
  const list = await getProductsByIds([...ids]);
  const products: Record<string, Product> = Object.fromEntries(list.map((p) => [p.id, p]));
  const blocks = store.blocks.filter((b) => blockActive(b, now));
  return (
    <BrandFrame theme={store.theme}>
      <BrandHero store={store} product={products[store.hero.productId] ?? null} />
      {blocks.map((b) => renderBlock(b, products, store))}
    </BrandFrame>
  );
}

function renderBlock(b: BrandBlock, products: Record<string, Product>, store: BrandStore): ReactNode {
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
    default:
      if (process.env.NODE_ENV !== "production") console.warn("[cms] unknown brand block", (b as { type: string }).type);
      return null;
  }
}
