import { cache } from "react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac/permissions";
import { blockActive } from "@/lib/cms/brand-store";
import { getPublishedZones, getZonesDoc } from "@/lib/cms/page-zones";
import { renderBlock, resolveBlocks } from "@/lib/cms/blocks-render";
import { EURONICS_THEME, INFO_ZONES, type InfoZone } from "@/lib/cms/info-pages";
import { BrandFrame } from "@/components/brand/BrandFrame";

/** Μία ανάγνωση ανά αίτημα για κάθε (σελίδα, ζώνη) — ακόμη κι αν η ζώνη αποδίδεται δύο φορές (κινητό/υπολογιστής). */
const loadZone = cache(async (page: string, zone: InfoZone, preview: boolean) => {
  let blocks = await getPublishedZones(page);
  if (preview) {
    const user = (await auth())?.user;
    if (user && can(user.permissions, "cms.pages.write")) blocks = (await getZonesDoc(page))?.draft ?? blocks;
  }
  const here = blocks.filter((b) => (b.zone ?? "top") === zone && blockActive(b));
  return here.length ? { here, d: await resolveBlocks(here) } : null;
});

/**
 * Μια ζώνη πληροφοριακής σελίδας: αποδίδει τα components που έβαλε ο διαχειριστής (Περιεχόμενο → Ζώνες σελίδων).
 * Κενή ζώνη = τίποτα στη σελίδα. preview: το ΠΡΟΧΕΙΡΟ, μόνο για προσωπικό με cms.pages.write.
 * copy: δεύτερη απόδοση της ίδιας ζώνης (άλλη θέση για κινητό) — δεν μετρά ξανά εμφανίσεις διαφημίσεων.
 */
/** Προσωπικό με δικαίωμα που βλέπει την προεπισκόπηση πρόχειρου (μία φορά ανά αίτημα). */
const canEditZones = cache(async () => { const user = (await auth())?.user; return !!user && can(user.permissions, "cms.pages.write"); });

export async function PageZone({ page, zone, preview = false, copy = false, className = "" }: { page: string; zone: InfoZone; preview?: boolean; copy?: boolean; className?: string }) {
  const z = await loadZone(page, zone, preview);
  // στην προεπισκόπηση του editor η κενή ζώνη φαίνεται ως πλαίσιο, για να τη δείχνει το «μάτι» — ποτέ στους επισκέπτες
  if (!z) return preview && (await canEditZones()) ? (
    <div data-zone={zone} data-zone-empty="" className={`my-3 grid place-items-center rounded-xl border-2 border-dashed border-eu-line px-3 py-4 text-center text-eu-muted text-[length:var(--fs-13)] ${className}`}>Ζώνη «{INFO_ZONES[zone].label}» · κενή</div>
  ) : null;
  const tight = zone === "after" || zone === "aside";
  return (
    <div data-zone={zone} className={`${tight ? "eu-zone-tight" : ""} ${className}`}>
      <BrandFrame theme={EURONICS_THEME}>{z.here.map((b) => renderBlock(b, z.d, { brandName: "Euronics", countImpressions: !copy }))}</BrandFrame>
    </div>
  );
}

/** Κίτρινη λωρίδα «Προεπισκόπηση πρόχειρου» — μόνο σε προσωπικό με δικαίωμα, όταν βλέπει ?preview=1. */
export async function ZonesPreviewBar({ preview }: { preview: boolean }) {
  if (!preview) return null;
  const user = (await auth())?.user;
  if (!user || !can(user.permissions, "cms.pages.write")) return null;
  return <div role="status" className="sticky top-0 z-40 bg-eu-yellow text-eu-navy text-center font-extrabold text-[length:var(--fs-14)] px-4 py-2">Προεπισκόπηση πρόχειρου ζωνών — οι επισκέπτες δεν το βλέπουν</div>;
}
