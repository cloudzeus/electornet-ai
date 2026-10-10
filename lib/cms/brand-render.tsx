import "server-only";
import type { ReactNode } from "react";
import type { BrandStore } from "./brand-store";
import { blockActive, validateBrandStore } from "./brand-store";
import { renderBlock, resolveBlocks } from "./blocks-render";
import { BrandFrame } from "@/components/brand/BrandFrame";
import { BrandHero } from "@/components/brand/BrandHero";

/**
 * Brand store renderer: validates the CMS record, resolves the «live» blocks and all products in one read,
 * then renders the zones in order: top (πάνω από το hero) → hero → main → bottom (πριν τον κατάλογο).
 */
/** mark: προεπισκόπηση του editor — κάθε στοιχείο σημαδεμένο (data-cms-item), ώστε ο editor να κυλά / τονίζει / επιλέγει με κλικ. */
export async function renderBrandStore(store: BrandStore, now = new Date(), opts: { mark?: boolean } = {}): Promise<ReactNode> {
  const problems = validateBrandStore(store);
  if (problems.length && process.env.NODE_ENV !== "production") console.warn(`[cms] brand store ${store.slug}:`, problems);
  const blocks = store.blocks.filter((b) => blockActive(b, now));
  const d = await resolveBlocks(blocks, { brandSlug: store.slug, extraProductIds: [store.hero.productId] });
  const zone = (z: string) => blocks.filter((b) => (b.zone ?? "main") === z).map((b) => (opts.mark ? <div key={b.id} data-cms-item={`blk:${b.id}`}>{renderBlock(b, d, { brandName: store.name })}</div> : renderBlock(b, d, { brandName: store.name })));
  const hero = <BrandHero store={store} product={d.products[store.hero.productId] ?? null} />;
  return (
    <BrandFrame theme={store.theme}>
      {zone("top")}
      {opts.mark ? <div data-cms-item="part:hero">{hero}</div> : hero}
      {zone("main")}
      {zone("bottom")}
    </BrandFrame>
  );
}
