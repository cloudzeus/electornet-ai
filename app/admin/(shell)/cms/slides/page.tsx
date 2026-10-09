import { GalleryHorizontal } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { getHeroAdminDoc, productInfos } from "@/lib/cms/hero-slides";
import { getSettings } from "@/lib/cms/settings-server";
import { HeroSlidesEditor } from "./HeroSlidesEditor";

export const metadata = { title: "Hero slides" };
export const dynamic = "force-dynamic";

/** Τα slides του hero της αρχικής: πρόχειρο → δημοσίευση, ημερομηνίες ανά slide, ζωντανή προεπισκόπηση. */
export default async function HeroSlidesPage() {
  const user = await requirePermission("cms.slides.write");
  const doc = await getHeroAdminDoc();
  const ids = [...new Set(doc.draft.slides.map((s) => s.productId).filter((x): x is string => !!x))];
  const [products, settings] = await Promise.all([productInfos(ids), getSettings()]);
  return (
    <div className="grid gap-4 min-w-0">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><GalleryHorizontal className="size-3.5" aria-hidden /> Περιεχόμενο · αρχική</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Hero slides</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Τα μεγάλα slides στην κορυφή της αρχικής. Κάθε slide εμφανίζεται μόνο στις ημέρες που ορίζεις· όταν δεν υπάρχει κανένα ενεργό, βγαίνουν τα «μόνιμα», ώστε η αρχική να μη μείνει ποτέ χωρίς hero. Οι αλλαγές φαίνονται στο site μόνο με τη «Δημοσίευση».</p>
      </div>
      <HeroSlidesEditor initial={doc.draft} hasPublished={!!doc.published} publishedAt={doc.publishedAt?.toISOString() ?? null} products={products} settings={settings} canUpload={can(user.permissions, "cms.media.write")} />
    </div>
  );
}
