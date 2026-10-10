import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { getHomeDoc } from "@/lib/cms/home-store";
import { getProductsByIds } from "@/lib/data/repo";
import { HomeEditor } from "@/components/admin/cms/HomeEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ζώνες αρχικής" };

/** Η αρχική σελίδα: ενότητες (σειρά, απόκρυψη, ημερομηνίες, συσκευές, κοινό, κείμενα) και components ανάμεσά τους. */
export default async function HomeZonesPage() {
  const user = await requirePermission("cms.zones.read");
  const doc = await getHomeDoc();
  const ids = [...new Set(doc.draft.blocks.flatMap((b) => ("productIds" in b && Array.isArray(b.productIds) ? b.productIds : b.type === "series" ? b.items.flatMap((i) => i.productIds) : [])))];
  const list = ids.length ? await getProductsByIds(ids) : [];
  const info = Object.fromEntries(list.map((p) => [p.id, { id: p.id, title: `${p.brand} ${p.title}`, sku: p.sku ?? "", price: p.price ?? null, image: p.image ?? null }]));
  return <HomeEditor initial={doc.draft} published={doc.published} savedAt={doc.updatedAt?.toISOString() ?? null} info={info} canWrite={can(user.permissions, "cms.zones.write")} canPublish={can(user.permissions, "cms.zones.publish")} />;
}
