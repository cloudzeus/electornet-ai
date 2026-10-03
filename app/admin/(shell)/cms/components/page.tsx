import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { getPublishedStores } from "@/lib/cms/brand-stores";
import { BLOCK_GROUPS, BLOCK_INFO } from "@/lib/cms/blocks-catalog";
import { ComponentsGallery } from "@/components/admin/cms/ComponentsGallery";

export const metadata = { title: "Συλλογή components" };
export const dynamic = "force-dynamic";

export default async function ComponentsGalleryPage() {
  const user = await requireStaff();
  if (!can(user.permissions, "cms.pages.write") && !can(user.permissions, "cms.brandstores.write")) redirect("/admin/forbidden?need=cms.pages.write");
  const stores = await getPublishedStores();
  return <ComponentsGallery themes={[{ value: "", label: "Euronics (πληροφοριακές σελίδες)" }, ...stores.map((s) => ({ value: s.slug, label: `Σελίδα ${s.name}` }))]} groups={BLOCK_GROUPS.map((g) => ({ label: g.label, items: g.types.map((t) => ({ type: t, label: BLOCK_INFO[t].label })) }))} />;
}
