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
import { catalogTree, type CatNode } from "@/lib/data/db-catalog";
import { cellsOf, gridCategories, gridTitle, type CatInfo } from "./category-cells";
import { homeDeals, type DealsProps } from "./home-deals";
import { designByKey } from "@/lib/promo/designs";
import { bannerProducts, bannerSticker } from "@/lib/promo/banner-products";
import { DesignedBanner } from "@/components/promo/DesignedBanner";
import { BlockHead, BrandFrame } from "@/components/brand/BrandFrame";
import { EURONICS_THEME } from "./info-pages";
import { DEFAULT_GUIDE_ARTICLES, homeServiceSlugs, orderedVisible, resolveFacts } from "./home-sections";
import { GUIDES, type GuideKind } from "@/lib/guides/smart";
import { getGuidesFull } from "@/lib/data/repo";
import type { Category } from "@/lib/data/types";
import { getCategories, getNearestStoreWithGeo, getProduct, getServices } from "@/lib/data/catalog";

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
    const p = w.props as { intervalMs?: number; theme?: string; services?: string; bg?: string; accent?: string; emblem?: string; titleColor?: string; textColor?: string };
    // Save-Data: a single static slide, no slideshow.
    const shown = ctx.saveData ? slides.slice(0, 1) : slides;
    return <BentoHero key={w.id} slides={shown} deal={deal} store={geo.store} geoCity={geo.city} geoSource={geo.source} services={services.map((s) => ({ title: s.title, blurb: s.blurb }))} intervalMs={p.intervalMs} zoneNo={w.zoneNo} theme={p.theme} hideServices={p.services === "hide"} bg={p.bg} accent={p.accent} emblem={p.emblem} titleColor={p.titleColor} textColor={p.textColor} />;
  },
  ticker: async (w) => { const items = ((w.props as { items?: string[] }).items ?? []).filter(Boolean); return items.length ? <Ticker key={w.id} items={items} zoneNo={w.zoneNo} bg={(w.props as { bg?: string }).bg} color={(w.props as { color?: string }).color} /> : null; },
  "category-grid": async (w) => {
    // κελιά της διαχείρισης → πραγματικές κατηγορίες (πλήθος, σύνδεσμος) · χωρίς κατάλογο: τα σταθερά του σχεδίου
    const props = w.props as Record<string, unknown>;
    const { cells, focus } = cellsOf(props);
    const tree = await catalogTree().catch(() => null);
    if (!tree) return <CategoryGrid key={w.id} categories={await getCategories()} featured={String(props.featured ?? "")} zoneNo={w.zoneNo} />;
    const pathOf = (n: CatNode) => { const p: string[] = []; for (let c: CatNode | undefined = n; c; c = c.parentId ? tree.byId.get(c.parentId) : undefined) p.unshift(c.slug); return p.join("/"); };
    const find = (ref: string): CatInfo | undefined => { const n = tree.bySlug.get(ref) ?? tree.byId.get(ref); return n ? { id: n.id, slug: n.slug, name: n.name, count: n.count, path: pathOf(n) } : undefined; };
    const cats = gridCategories(cells, focus, find);
    return <CategoryGrid key={w.id} categories={cats as unknown as Category[]} featured={cats.find((c) => c.featured)?.id} title={gridTitle(props.title, cats.length)} zoneNo={w.zoneNo} />;
  },
  "deals-rail": async (w, ctx) => {
    // πηγή από τη διαχείριση (Ζώνες αρχικής): αυτόματα / μια προσφορά / επιλεγμένα προϊόντα — πραγματικά δεδομένα
    const p = w.props as DealsProps & { title?: string };
    const deals = await homeDeals({ ...p, limit: p.limit ?? w.query?.limit ?? 4 });
    if (!deals.products.length) return null;
    // Save-Data: δύο προϊόντα
    const products = deals.products.slice(0, ctx.saveData ? 2 : deals.products.length);
    // εμφάνιση από τη διαχείριση: σχέδιο banner αντί για τις κανονικές κάρτες· άγνωστο σχέδιο → κάρτες
    const base = await designByKey((p as { design?: string }).design);
    if (base) {
      const d = { ...base, kicker: "", title: "", body: base.layout === "strip" ? base.body : "", cta: "", products: { ...base.products, source: "manual" as const, ids: products.map((x) => x.id), max: Math.max(1, Math.min(12, products.length)) } };
      const list = await bannerProducts(d, null).catch(() => []);
      if (list.length) return (
        <BrandFrame key={w.id} theme={EURONICS_THEME}>
          <section className="eu-canvas eu-gutter py-8 @lg:py-12" aria-label={p.title ?? "Προσφορές της εβδομάδας"}>
            <BlockHead kicker={deals.label} title={p.title ?? "Προσφορές της εβδομάδας"} />
            <DesignedBanner d={d} products={list} shape="wide" href={null} sticker={await bannerSticker(d.stickerKey).catch(() => null)} />
          </section>
        </BrandFrame>
      );
    }
    return <DealsRail key={w.id} products={products} endsAt={deals.endsAt} label={deals.label} title={p.title ?? "Προσφορές της εβδομάδας"} zoneNo={w.zoneNo} />;
  },
  "quick-buy-explainer": async (w) => {
    const p = await getProduct("p-inventor-ikura");
    // κλειστό προς το παρόν: περιγράφει το φύλλο «αγοράς με 1 κλικ» (με ψεύτικη κάρτα) που δεν ισχύει
    void p; void QuickBuyExplainer; void w;
    return null;
  },
  "services-band": async (w) => {
    // σειρά και ορατότητα της αρχικής (Ζώνες αρχικής) πάνω στον κατάλογο υπηρεσιών
    const all = await getServices();
    const bySlug = new Map(all.map((s) => [s.slug, s]));
    const p = w.props as Record<string, unknown>;
    const list = homeServiceSlugs(p, all.map((s) => s.slug)).map((slug) => bySlug.get(slug)!).filter(Boolean);
    const facts = resolveFacts(p.facts, { services: all.length, home: list.length });
    const str = (k: string, d: string) => (typeof p[k] === "string" ? (p[k] as string).trim() : d);
    const t1 = str("title", "Πριν, κατά και μετά την αγορά,"), t2 = str("title2", "είμαστε δίπλα σου");
    const link = p.link as { label?: string; href?: string } | undefined;
    return list.length ? <ServicesBand key={w.id} services={list} facts={facts} kicker={str("kicker", "Υπηρεσίες Euronics")} title={t1 && t2 ? [t1, t2] : t1 || t2} link={link?.label?.trim() && link.href ? { label: link.label, href: link.href } : undefined} zoneNo={w.zoneNo} /> : null;
  },
  "store-finder": async (w) => {
    const g = await getNearestStoreWithGeo();
    return <StoreFinder key={w.id} store={g.store} geoCity={g.city} geoSource={g.source} image="/img/store-front.jpg" zoneNo={w.zoneNo} />;
  },
  "campaign-spotlight": async (w) => {
    const p = w.props as { campaigns: VendorCampaign[]; title?: string; kicker?: string; link?: { label: string; href: string } };
    if (!p.campaigns?.length) return null;
    return <CampaignSpotlight key={w.id} campaigns={p.campaigns} title={p.title} kicker={p.kicker} link={p.link} zoneNo={w.zoneNo} />;
  },
  "news-band": async (w) => { const items = await getNews({ limit: (w.props as { limit?: number }).limit ?? 3 }); return items.length ? <NewsBand key={w.id} items={items} zoneNo={w.zoneNo} /> : null; },
  "smart-guides": async (w) => {
    const keys = Object.keys(GUIDES);
    const kinds = orderedVisible((w.props as Record<string, unknown>).smart, keys, keys) as GuideKind[];
    return kinds.length ? <SmartGuidesBand key={w.id} kinds={kinds} zoneNo={w.zoneNo} /> : null;
  },
  guides: async (w) => {
    const all = await getGuidesFull();
    const by = new Map(all.map((g) => [g.slug, g]));
    const list = orderedVisible((w.props as Record<string, unknown>).articles, all.map((g) => g.slug), DEFAULT_GUIDE_ARTICLES).map((s) => by.get(s)!).filter(Boolean);
    return list.length ? <GuidesBand key={w.id} guides={list} zoneNo={w.zoneNo} /> : null;
  },
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
