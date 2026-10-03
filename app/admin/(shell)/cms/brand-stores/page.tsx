import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { listStoreDocs } from "@/lib/cms/brand-stores";
import { BrandStoreList, type StoreRow, type BrandOption } from "@/components/admin/cms/BrandStoreList";

export const metadata = { title: "Σελίδες μαρκών" };
export const dynamic = "force-dynamic";

const stable = (v: unknown): string => (Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v));

export default async function BrandStoresPage() {
  await requirePermission("cms.brandstores.write");
  const [docs, brands] = await Promise.all([
    listStoreDocs(),
    db.brand.findMany({ where: { active: true }, select: { slug: true, name: true, logo: true, logoCdn: true, logoStatus: true, _count: { select: { products: { where: { active: true } } } } }, orderBy: { name: "asc" } }),
  ]);
  const bySlug = new Map(brands.map((b) => [b.slug, b]));
  const logo = (b?: (typeof brands)[number]) => b?.logo ?? (b?.logoStatus === "approved" ? b.logoCdn : null) ?? null;
  const rows: StoreRow[] = docs
    .map((d) => {
      const b = bySlug.get(d.slug);
      const changed = !!d.published && stable(d.published) !== stable(d.draft);
      return {
        slug: d.slug,
        name: d.draft?.name ?? b?.name ?? d.slug,
        logo: d.draft?.logo ?? logo(b),
        storeLogo: d.draft?.logo ?? null,
        logoAspect: d.draft?.logoAspect ?? null,
        accent: d.draft?.theme.accent ?? "#0a3d91",
        bg: d.draft?.theme.bg ?? "#ffffff",
        products: b?._count.products ?? 0,
        status: (d.published ? (changed ? "changed" : "live") : "draft") as StoreRow["status"],
        updatedAt: d.updatedAt.toISOString(),
        publishedAt: d.publishedAt?.toISOString() ?? null,
        blocks: d.draft?.blocks.filter((x) => x.enabled !== false).length ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "el"));
  const taken = new Set(docs.map((d) => d.slug));
  const options: BrandOption[] = brands.filter((b) => !taken.has(b.slug) && b._count.products > 0).map((b) => ({ slug: b.slug, name: b.name, products: b._count.products, logo: logo(b) })).sort((a, b) => b.products - a.products);
  return <BrandStoreList rows={rows} brands={options} />;
}
