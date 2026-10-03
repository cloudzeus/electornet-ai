import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/rbac/guard";
import { infoPage } from "@/lib/cms/info-pages";
import { getZonesDoc } from "@/lib/cms/page-zones";
import { getProductsByIds } from "@/lib/data/repo";
import { ZonePageEditor } from "@/components/admin/cms/ZonePageEditor";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  return { title: `Ζώνες · ${infoPage((await params).key)?.title ?? "σελίδα"}` };
}

export default async function ZonePageEdit({ params }: { params: Promise<{ key: string }> }) {
  await requirePermission("cms.pages.write");
  const page = infoPage((await params).key);
  if (!page) notFound();
  const doc = await getZonesDoc(page.key);
  const draft = doc?.draft ?? [];
  const ids = [...new Set(draft.flatMap((b) => ("productIds" in b && Array.isArray(b.productIds) ? b.productIds : b.type === "series" ? b.items.flatMap((i) => i.productIds) : [])))];
  const list = ids.length ? await getProductsByIds(ids) : [];
  const info = Object.fromEntries(list.map((p) => [p.id, { id: p.id, title: `${p.brand} ${p.title}`, sku: p.sku ?? "", price: p.price ?? null, image: p.image ?? null }]));
  return <ZonePageEditor page={page} initial={draft} published={doc?.published ?? null} savedAt={doc?.updatedAt.toISOString() ?? null} info={info} />;
}
