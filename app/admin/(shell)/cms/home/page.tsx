import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { getHomeDoc } from "@/lib/cms/home-store";
import { getProductsByIds } from "@/lib/data/repo";
import { HomeEditor } from "@/components/admin/cms/HomeEditor";
import { catalogTree, type CatNode } from "@/lib/data/db-catalog";
import { getLiveHeroSlides, heroDealInfo } from "@/lib/cms/hero-slides";
import { homeDeals } from "@/lib/cms/home-deals";
import { getServiceList } from "@/lib/services/catalog";
import { getGuidesFull } from "@/lib/data/repo";
import { GUIDES } from "@/lib/guides/smart";
import { DEFAULT_GUIDE_ARTICLES } from "@/lib/cms/home-sections";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ζώνες αρχικής" };

/** Η αρχική σελίδα: ενότητες (σειρά, απόκρυψη, ημερομηνίες, συσκευές, κοινό, κείμενα) και components ανάμεσά τους. */
export default async function HomeZonesPage() {
  const user = await requirePermission("cms.zones.read");
  const [doc, tree, heroDeal, slides, auto, serviceList] = await Promise.all([
    getHomeDoc(), catalogTree(), heroDealInfo().catch(() => null), getLiveHeroSlides().catch(() => []), homeDeals({ source: "auto", limit: 12 }).catch(() => null), getServiceList(),
  ]);
  const articles = await getGuidesFull();
  const lists = {
    "smart-guides": { options: Object.values(GUIDES).map((g) => ({ key: g.kind, title: g.title, image: g.image })), defaults: Object.keys(GUIDES) },
    guides: { options: articles.map((g) => ({ key: g.slug, title: g.title, subtitle: g.excerpt, image: g.image ?? null })), defaults: DEFAULT_GUIDE_ARTICLES },
  };
  const services = serviceList.map((s) => ({ slug: s.slug, title: s.title, blurb: s.blurb, priceFrom: s.priceFrom ?? null }));
  const live = { heroDeal, slides: slides.length, autoDeals: auto?.source === "auto" ? auto.products.length : 0 };
  // οι κατηγορίες του καταλόγου (έως 3 επίπεδα) για το πλέγμα κατηγοριών
  const categories: { id: string; slug: string; name: string; label: string; count: number; depth: number }[] = [];
  const walk = (n: CatNode, trail: string[]) => { const t = [...trail, n.name]; categories.push({ id: n.id, slug: n.slug, name: n.name, label: t.join(" › "), count: n.count, depth: n.depth }); if (n.depth < 2) n.children.forEach((c) => walk(c, t)); };
  tree.roots.forEach((r) => walk(r, []));
  const dealIds = doc.draft.sections.flatMap((s) => (s.id === "deals" && Array.isArray(s.props?.productIds) ? (s.props!.productIds as string[]) : []));
  const ids = [...new Set([...dealIds, ...doc.draft.blocks.flatMap((b) => ("productIds" in b && Array.isArray(b.productIds) ? b.productIds : b.type === "series" ? b.items.flatMap((i) => i.productIds) : []))])];
  const list = ids.length ? await getProductsByIds(ids) : [];
  const info = Object.fromEntries(list.map((p) => [p.id, { id: p.id, title: `${p.brand} ${p.title}`, sku: p.sku ?? "", price: p.price ?? null, image: p.image ?? null }]));
  return <HomeEditor lists={lists} services={services} live={live} categories={categories} initial={doc.draft} published={doc.published} savedAt={doc.updatedAt?.toISOString() ?? null} info={info} canWrite={can(user.permissions, "cms.zones.write")} canPublish={can(user.permissions, "cms.zones.publish")} />;
}
