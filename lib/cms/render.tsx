import "server-only";
import type { ReactNode } from "react";
import type { RenderContext, WidgetInstance, Zone } from "./zones";
import { resolveZone } from "./zones";
import { AnnouncementBar } from "@/components/site/AnnouncementBar";
import { BentoHero } from "@/components/widgets/BentoHero";
import { Ticker } from "@/components/widgets/Ticker";
import { CategoryGrid } from "@/components/widgets/CategoryGrid";
import { DealsRail } from "@/components/widgets/DealsRail";
import { QuickBuyExplainer } from "@/components/widgets/QuickBuyExplainer";
import { ServicesBand } from "@/components/widgets/ServicesBand";
import { StoreFinder } from "@/components/widgets/StoreFinder";
import { GuidesBand } from "@/components/widgets/GuidesBand";
import { SmartGuidesBand } from "@/components/widgets/SmartGuidesBand";
import { NewsBand } from "@/components/widgets/NewsBand";
import { CampaignSpotlight, type VendorCampaign } from "@/components/widgets/CampaignSpotlight";
import { getNews } from "@/lib/data/repo";
import { NewsletterBand } from "@/components/widgets/NewsletterBand";
import { Reveal } from "@/components/motion/Reveal";
import { getHeroDeal, getHeroServices, getLiveHeroSlides } from "@/lib/cms/hero-slides";
import { getCategories, getGuides, getNearestStoreWithGeo, getProduct, getServices, getWeeklyDeals } from "@/lib/data/catalog";

/**
 * Widget registry: type → async server component. Each widget resolves
 * its own data (query) at render time; the CMS only stores props + query.
 * Adding a widget = one entry here + one component. The page never changes.
 */
type Renderer = (w: WidgetInstance, ctx: RenderContext) => Promise<ReactNode>;

const registry: Record<string, Renderer> = {
  "announcement-bar": async (w) => {
    const p = w.props as { left: string[]; right: string[]; accent?: { label: string; href: string } };
    return <AnnouncementBar key={w.id} {...p} zoneNo={w.zoneNo} />;
  },
  "bento-hero": async (w, ctx) => {
    const [slides, deal, geo, services] = await Promise.all([getLiveHeroSlides(), getHeroDeal(), getNearestStoreWithGeo(), getHeroServices()]);
    const p = w.props as { intervalMs?: number };
    // Save-Data: a single static slide, no slideshow.
    const shown = ctx.saveData ? slides.slice(0, 1) : slides;
    return <BentoHero key={w.id} slides={shown} deal={deal} store={geo.store} geoCity={geo.city} geoSource={geo.source} services={services.map((s) => ({ title: s.title, blurb: s.blurb }))} intervalMs={p.intervalMs} zoneNo={w.zoneNo} />;
  },
  ticker: async (w) => <Ticker key={w.id} items={(w.props as { items: string[] }).items} zoneNo={w.zoneNo} />,
  "category-grid": async (w) => <CategoryGrid key={w.id} categories={await getCategories()} featured={(w.props as { featured?: string }).featured} zoneNo={w.zoneNo} />,
  "deals-rail": async (w, ctx) => {
    const deals = await getWeeklyDeals();
    const limit = w.query?.limit ?? 4;
    const pinned = w.query?.pin ?? [];
    const ordered = [...deals.products].sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)));
    // Phones get the same four in a swipe rail; Save-Data trims to two.
    const products = ordered.slice(0, ctx.saveData ? 2 : limit);
    return <DealsRail key={w.id} products={products} endsAt={deals.endsAt} label={deals.label} title={(w.props as { title: string }).title} zoneNo={w.zoneNo} />;
  },
  "quick-buy-explainer": async (w) => {
    const p = await getProduct("p-inventor-ikura");
    return p ? <QuickBuyExplainer key={w.id} product={p} zoneNo={w.zoneNo} /> : null;
  },
  "services-band": async (w) => <ServicesBand key={w.id} services={await getServices((w.props as { limit?: number }).limit ?? 6)} zoneNo={w.zoneNo} />,
  "store-finder": async (w) => {
    const g = await getNearestStoreWithGeo();
    return <StoreFinder key={w.id} store={g.store} geoCity={g.city} geoSource={g.source} image="/img/store-front.jpg" zoneNo={w.zoneNo} />;
  },
  "campaign-spotlight": async (w) => {
    const p = w.props as { campaigns: VendorCampaign[]; title?: string; kicker?: string; link?: { label: string; href: string } };
    return <CampaignSpotlight key={w.id} campaigns={p.campaigns} title={p.title} kicker={p.kicker} link={p.link} zoneNo={w.zoneNo} />;
  },
  "news-band": async (w) => <NewsBand key={w.id} items={await getNews({ limit: (w.props as { limit?: number }).limit ?? 3 })} zoneNo={w.zoneNo} />,
  "smart-guides": async (w) => <SmartGuidesBand key={w.id} zoneNo={w.zoneNo} />,
  guides: async (w) => <GuidesBand key={w.id} guides={await getGuides()} zoneNo={w.zoneNo} />,
  newsletter: async (w) => <NewsletterBand key={w.id} zoneNo={w.zoneNo} />,
};

export async function renderZone(zone: Zone, ctx: RenderContext): Promise<ReactNode[]> {
  const widgets = resolveZone(zone, ctx);
  return Promise.all(
    widgets.map(async (w) => {
      const r = registry[w.type];
      if (!r) {
        if (process.env.NODE_ENV !== "production") console.warn(`[cms] unknown widget type "${w.type}" in zone ${zone.id}`);
        return null;
      }
      const node = await r(w, ctx);
      // v4: every zone below the fold rises into view once (transform/opacity only).
      return node && (w.zoneNo ?? 0) >= 6 ? <Reveal key={w.id}>{node}</Reveal> : node;
    }),
  );
}

export async function renderZones(zones: Zone[], ctx: RenderContext, slot: Zone["slot"]): Promise<ReactNode[]> {
  const out: ReactNode[] = [];
  for (const z of zones.filter((z) => z.slot === slot)) out.push(...(await renderZone(z, ctx)));
  return out;
}
