import "server-only";
import type { ReactNode } from "react";
import type { BrandBlock } from "./brand-store";
import { autoProductIds, categoryTiles, couponBlockData, landingBlockData, liveLandings, promoBlockData, type CategoryTile, type CouponData, type LandingData, type PromoData } from "./brand-auto";
import type { Guide, Service } from "@/lib/data/types";
import { getGuidesFull, getProductsByIds, getServicesFull, getStores } from "@/lib/data/repo";
import type { Product, Store } from "@/lib/data/types";
import { NewArrivals, Series, Offers, Story, Tech, Support, VideoBlock } from "@/components/brand/BrandBlocks";
import { Announcement, Usp, Banner, ProductsAuto, Categories, Faq, TextBlock, Gallery, CtaBand } from "@/components/brand/BrandBlocksMore";
import { AdBlock, CouponBlock, PromoLandingCard, PromoProducts, StoresBlock } from "@/components/brand/BlocksPromo";
import { Callout, ContactCards, CountdownBand, DealHero, GuidesBlock, NewsletterBlock, PromoGrid, ServicesBlock, Steps } from "@/components/brand/BlocksExtra";

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
  deal: Record<string, { productId: string; endsAt: string | null } | null>;
  landings: Record<string, LandingData[]>;
  contact: { phone: string | null; email: string | null } | null;
  consent: string | null;
  guides: Guide[];
  services: Service[];
};

export async function resolveBlocks(blocks: BrandBlock[], ctx: { brandSlug?: string | null; extraProductIds?: string[]; sample?: boolean } = {}): Promise<BlockData> {
  const d: BlockData = { products: {}, auto: {}, tiles: {}, promo: {}, landing: {}, coupon: {}, stores: {}, deal: {}, landings: {}, contact: null, consent: null, guides: [], services: [] };
  const types = new Set(blocks.map((b) => b.type));
  if (types.has("contact")) { const { getPublicSettings } = await import("@/lib/settings/store"); const g = (await getPublicSettings().catch(() => ({} as Record<string, Record<string, unknown>>))).general ?? {}; d.contact = { phone: g.phone ? String(g.phone) : null, email: g.email ? String(g.email) : null }; }
  if (types.has("newsletter")) { const { activeConsentText } = await import("@/lib/gdpr/consent"); d.consent = (await activeConsentText("newsletter").catch(() => null))?.text ?? null; }
  if (types.has("guides")) d.guides = await getGuidesFull();
  if (types.has("services")) d.services = await getServicesFull();
  await Promise.all(blocks.map(async (b) => {
    switch (b.type) {
      case "products-auto": d.auto[b.id] = await autoProductIds(ctx.brandSlug ?? b.brand?.slug ?? null, b.source, b.limit, b.categoryId).catch(() => []); break;
      case "categories": d.tiles[b.id] = await categoryTiles(ctx.brandSlug ?? b.brand?.slug ?? null, b).catch(() => []); break;
      case "promo-products": d.promo[b.id] = b.promotionId ? await promoBlockData(b.promotionId, b.limit).catch(() => null) : null; break;
      case "promo-landing": d.landing[b.id] = b.landingId ? await landingBlockData(b.landingId).catch(() => null) : null; break;
      case "coupon": d.coupon[b.id] = b.code ? await couponBlockData(b.code).catch(() => null) : null; break;
      case "deal-hero": {
        if (b.source === "product" && b.productId) d.deal[b.id] = { productId: b.productId, endsAt: b.endsAt ?? null };
        else if (b.promotionId) { const pr = await promoBlockData(b.promotionId, 2).catch(() => null); d.deal[b.id] = pr?.productIds[0] ? { productId: pr.productIds[0], endsAt: pr.endsAt } : null; }
        break;
      }
      case "countdown": d.promo[b.id] = b.promotionId ? await promoBlockData(b.promotionId, 2).catch(() => null) : null; break;
      case "promo-grid": d.landings[b.id] = await liveLandings(Math.max(1, Math.min(9, b.limit || 6))).catch(() => []); break;
      case "stores": {
        const limit = Math.max(1, Math.min(6, b.limit || 3));
        if (b.mode === "region" && b.region) d.stores[b.id] = (await getStores({ region: b.region })).slice(0, limit);
        else { const { geoFromRequest, storesNear } = await import("@/lib/geo/ip"); d.stores[b.id] = await storesNear(await geoFromRequest(), limit).catch(() => []); }
        break;
      }
    }
  }));
  // δείγματα (συλλογή components): ό,τι χρειάζεται ζωντανή προσφορά παίρνει δεδομένα-δείγμα όταν δεν υπάρχει
  if (ctx.sample) {
    const pool = (await autoProductIds(null, "top", 8).catch(() => [] as string[]));
    const ends = new Date(Date.now() + 3 * 86_400_000 + 5 * 3_600_000).toISOString();
    for (const b of blocks) {
      if ((b.type === "promo-products" || b.type === "countdown") && !d.promo[b.id]) d.promo[b.id] = { name: "Δείγμα προσφοράς", endsAt: ends, productIds: pool.slice(0, 4), landingHref: "/prosfores" };
      if (b.type === "deal-hero" && !d.deal[b.id] && pool[0]) d.deal[b.id] = { productId: pool[0], endsAt: ends };
      if (b.type === "coupon" && !d.coupon[b.id]) d.coupon[b.id] = { code: "DEIGMA10", value: "10 % έκπτωση", promo: "Δείγμα προσφοράς", expiresAt: ends };
      if (b.type === "promo-landing" && !d.landing[b.id]) d.landing[b.id] = { title: "Δείγμα σελίδας προσφοράς", href: "/prosfores", image: null, kicker: "Προσφορά", subtitle: "Η κάρτα δείχνει την εικόνα και τον τίτλο της landing page που θα διαλέξεις.", endsAt: ends };
      if (b.type === "promo-grid" && !d.landings[b.id]?.length) d.landings[b.id] = [1, 2, 3].map((n) => ({ title: `Δείγμα προσφοράς ${n}`, href: "/prosfores", image: null, kicker: "Προσφορά", subtitle: null, endsAt: ends }));
    }
  }
  const ids = new Set<string>([...(ctx.extraProductIds ?? []), ...Object.values(d.auto).flat(), ...Object.values(d.promo).flatMap((p) => p?.productIds ?? []), ...Object.values(d.deal).flatMap((x) => (x ? [x.productId] : []))]);
  for (const b of blocks) {
    if ("productIds" in b && Array.isArray(b.productIds)) b.productIds.forEach((id) => ids.add(id));
    if (b.type === "series") b.items.forEach((it) => it.productIds.forEach((id) => ids.add(id)));
  }
  const list = await getProductsByIds([...ids].filter(Boolean));
  d.products = Object.fromEntries(list.map((p) => [p.id, p]));
  return d;
}

const pick = (ids: string[] | undefined, map: Record<string, Product>) => (ids ?? []).map((id) => map[id]).filter(Boolean);

/** Ορατότητα ανά συσκευή (μέγεθος οθόνης): κινητό < 768 · tablet 768–1023 · υπολογιστής ≥ 1024. */
const HIDE = { mobile: "max-md:hidden", tablet: "md:max-lg:hidden", desktop: "lg:hidden" } as const;

export function renderBlock(b: BrandBlock, d: BlockData, ctx: { brandName: string; countImpressions?: boolean; sample?: boolean }): ReactNode {
  const el = renderInner(b, d, ctx);
  if (!el || !b.hideOn?.length) return el;
  return <div key={b.id} className={b.hideOn.map((x) => HIDE[x]).join(" ")}>{el}</div>;
}

function renderInner(b: BrandBlock, d: BlockData, ctx: { brandName: string; countImpressions?: boolean; sample?: boolean }): ReactNode {
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
    case "ad": return ctx.sample ? <SampleAd key={b.id} /> : <AdBlock key={b.id} b={b} count={ctx.countImpressions !== false} />;
    case "deal-hero": { const x = d.deal[b.id]; return <DealHero key={b.id} b={b} product={x ? d.products[x.productId] ?? null : null} endsAt={x?.endsAt ?? null} />; }
    case "promo-grid": return <PromoGrid key={b.id} b={b} items={d.landings[b.id] ?? []} />;
    case "countdown": return <CountdownBand key={b.id} b={b} data={d.promo[b.id] ?? null} />;
    case "steps": return <Steps key={b.id} b={b} />;
    case "contact": return <ContactCards key={b.id} b={b} contact={d.contact} />;
    case "newsletter": return <NewsletterBlock key={b.id} b={b} consent={d.consent} />;
    case "guides": return <GuidesBlock key={b.id} b={b} guides={d.guides} />;
    case "services": return <ServicesBlock key={b.id} b={b} services={d.services} />;
    case "callout": return <Callout key={b.id} b={b} />;
    case "promo-products": return <PromoProducts key={b.id} b={b} data={d.promo[b.id] ?? null} products={pick(d.promo[b.id]?.productIds, d.products)} />;
    case "promo-landing": return <PromoLandingCard key={b.id} data={d.landing[b.id] ?? null} />;
    case "coupon": return <CouponBlock key={b.id} b={b} data={d.coupon[b.id] ?? null} />;
    case "stores": return <StoresBlock key={b.id} b={b} stores={d.stores[b.id] ?? []} />;
    default:
      if (process.env.NODE_ENV !== "production") console.warn("[cms] unknown block", (b as { type: string }).type);
      return null;
  }
}

/** Δείγμα στη συλλογή components: η πραγματική διαφήμιση έρχεται από τις Διαφημιστικές θέσεις. */
function SampleAd() {
  return (
    <div className="eu-canvas eu-gutter py-4">
      <div className="rounded-2xl border-2 border-dashed border-[var(--bs-muted)]/40 bg-[var(--bs-bg2)] aspect-[16/3] grid place-items-center text-center p-4 text-[var(--bs-muted)] font-bold text-[length:var(--fs-15)]">Εδώ εμφανίζεται το banner της διαφημιστικής θέσης (1600×300)</div>
    </div>
  );
}
