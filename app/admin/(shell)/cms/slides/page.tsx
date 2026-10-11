import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { allHeroServices, getHeroAdminDoc, productInfos } from "@/lib/cms/hero-slides";
import { getSettings } from "@/lib/cms/settings-server";
import { HeroSlidesEditor } from "./HeroSlidesEditor";

export const metadata = { title: "Hero slides" };
export const dynamic = "force-dynamic";

/** Τα slides του hero της αρχικής: πρόχειρο → δημοσίευση, ημερομηνίες ανά slide, ζωντανή προεπισκόπηση (υπολογιστής / κινητό). */
export default async function HeroSlidesPage() {
  const user = await requirePermission("cms.slides.write");
  const doc = await getHeroAdminDoc();
  const ids = [...new Set([...doc.draft.slides.map((s) => s.productId), ...(doc.draft.deals ?? []).map((d) => d.productId)].filter((x): x is string => !!x))];
  const [products, settings, services] = await Promise.all([productInfos(ids), getSettings(), allHeroServices()]);
  return <HeroSlidesEditor initial={doc.draft} published={doc.published} publishedAt={doc.publishedAt?.toISOString() ?? null} products={products} settings={settings} canUpload={can(user.permissions, "cms.media.write")} services={services} />;
}
