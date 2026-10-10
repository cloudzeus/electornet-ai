import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { getStoreDoc } from "@/lib/cms/brand-stores";
import { getProductsByIds } from "@/lib/data/repo";
import { BrandStoreEditor } from "@/components/admin/cms/BrandStoreEditor";
import type { BrandStore } from "@/lib/cms/brand-store";
import { can } from "@/lib/rbac/permissions";
import { brandHealth } from "@/lib/cms/brand-health";
import { getPlans } from "@/lib/cms/doc-plans";
import { brandTarget } from "@/lib/cms/brand-plans";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const doc = await getStoreDoc((await params).slug);
  return { title: doc ? `Σελίδα ${doc.draft.name}` : "Σελίδα μάρκας" };
}

function productIds(s: BrandStore) {
  const ids = new Set<string>([s.hero.productId]);
  for (const b of s.blocks) { if ("productIds" in b && Array.isArray(b.productIds)) b.productIds.forEach((i) => ids.add(i)); if (b.type === "series") b.items.forEach((it) => it.productIds.forEach((i) => ids.add(i))); }
  return [...ids].filter(Boolean);
}

export default async function BrandStoreEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requirePermission("cms.brandstores.write");
  const { slug } = await params;
  const [doc, brand] = await Promise.all([getStoreDoc(slug), db.brand.findUnique({ where: { slug }, select: { id: true, name: true, logo: true, logoCdn: true, logoStatus: true } })]);
  if (!doc || !brand) notFound();
  const [list, health, plans] = await Promise.all([
    getProductsByIds(productIds(doc.draft)),
    brandHealth(doc.draft).catch(() => ({ empty: {}, issues: [] })),
    getPlans(brandTarget(slug)).catch(() => ({ scenarios: [], review: null })),
  ]);
  const scheduled = plans.scenarios.filter((x) => x.status === "scheduled" && x.publishAt).map((x) => ({ name: x.name, publishAt: x.publishAt! })).sort((a, b) => Date.parse(a.publishAt) - Date.parse(b.publishAt));
  const info = Object.fromEntries(list.map((p) => [p.id, { id: p.id, title: `${p.brand} ${p.title}`, sku: p.sku ?? "", price: p.price ?? null, image: p.image ?? null }]));
  return (
    <BrandStoreEditor
      initial={doc.draft}
      published={doc.published}
      savedAt={doc.updatedAt.toISOString()}
      brand={{ id: brand.id, name: brand.name, logo: brand.logo ?? (brand.logoStatus === "approved" ? brand.logoCdn : null) }}
      info={info}
      canPublish={can(user.permissions, "cms.publish")}
      health={health}
      plans={{ review: plans.review, scheduled }}
      me={user.id}
    />
  );
}
