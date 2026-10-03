import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import type { BrandBlock, BrandTheme } from "@/lib/cms/brand-store";
import { BLOCK_GROUPS, BLOCK_INFO, newBlock } from "@/lib/cms/blocks-catalog";
import { renderBlock, resolveBlocks } from "@/lib/cms/blocks-render";
import { autoProductIds } from "@/lib/cms/brand-auto";
import { getProductsByIds } from "@/lib/data/repo";
import { EURONICS_THEME } from "@/lib/cms/info-pages";
import { getPublishedStores } from "@/lib/cms/brand-stores";
import { BrandFrame } from "@/components/brand/BrandFrame";

export const metadata: Metadata = { title: "Συλλογή components", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** λήξη-δείγμα: σε 3 ημέρες και 5 ώρες */
const sampleEnd = () => new Date(Date.now() + 3 * 86_400_000 + 5 * 3_600_000).toISOString();

/**
 * Συλλογή όλων των δυναμικών components με δείγματα — για προεπισκόπηση από το προσωπικό (Περιεχόμενο → Συλλογή
 * components). Σελίδα της βιτρίνας ώστε τα δείγματα να αποδίδονται ακριβώς όπως στους πελάτες (καλάθι, γραμματοσειρές).
 * Ζωντανά δεδομένα όπου υπάρχουν· όπου χρειάζεται ενεργή προσφορά, δεδομένα-δείγμα.
 */
export default async function ComponentsGallery({ searchParams }: { searchParams: Promise<{ theme?: string; only?: string }> }) {
  const user = (await auth())?.user;
  if (!user || (!can(user.permissions, "cms.pages.write") && !can(user.permissions, "cms.brandstores.write"))) notFound();
  const sp = await searchParams;
  const stores = await getPublishedStores();
  const brand = stores.find((s) => s.slug === sp.theme);
  const theme: BrandTheme = brand?.theme ?? EURONICS_THEME;
  const brandName = brand?.name ?? "Euronics";

  const pool = await autoProductIds(brand?.slug ?? null, "top", 8);
  const prods = await getProductsByIds(pool);
  const img = (i: number) => prods[i % Math.max(1, prods.length)]?.image ?? "/img/products/r-152715-3.jpg";
  const video = await db.mediaAsset.findFirst({ where: { kind: "video" }, orderBy: { createdAt: "desc" }, select: { url: true, thumbUrl: true } }).catch(() => null);
  const ends = sampleEnd();

  /** Δείγμα ανά τύπο: οι προεπιλογές του editor + περιεχόμενο που δείχνει τι κάνει το component. */
  const sample = (t: BrandBlock["type"]): BrandBlock => {
    const b = { ...newBlock(t, brandName), id: `s-${t}`, zone: undefined } as BrandBlock;
    switch (b.type) {
      case "new-arrivals": return { ...b, productIds: pool.slice(0, 3), lead: "Τα νεότερα της σειράς, σε μεγάλες κάρτες." };
      case "offers": return { ...b, productIds: pool.slice(0, 4), endsAt: ends };
      case "series": return { ...b, items: [0, 1, 2].map((i) => ({ name: ["Σειρά Α", "Σειρά Β", "Σειρά Γ"][i], blurb: "Μία πρόταση για το τι κάνει ξεχωριστή αυτή τη σειρά.", image: img(i), productIds: pool.slice(i, i + 2), href: "/prosfores" })) };
      case "story": return { ...b, kicker: "Η ιστορία", title: "Μια τεχνολογία που αλλάζει το σπίτι σου", image: img(1), body: "Δύο τρεις προτάσεις για το τι κερδίζει ο πελάτης — όχι τεχνικό φύλλο. Η εικόνα μπορεί να μπει αριστερά ή δεξιά.", cta: { label: "Δες περισσότερα", href: "/prosfores" } };
      case "tech": return { ...b, items: [{ icon: "cpu", title: "Επεξεργαστής AI", blurb: "Βελτιώνει εικόνα και ήχο ανά σκηνή." }, { icon: "leaf", title: "Χαμηλή κατανάλωση", blurb: "Λιγότερο ρεύμα κάθε μέρα." }, { icon: "wifi", title: "Έξυπνη σύνδεση", blurb: "Έλεγχος από το κινητό." }, { icon: "shield", title: "Εγγύηση", blurb: "Επίσημη εγγύηση αντιπροσωπείας." }] };
      case "support": return { ...b, facts: ["Επίσημη εγγύηση 2 έτη", "Service αντιπροσωπείας με γνήσια ανταλλακτικά", "Παράδοση και εγκατάσταση από το κατάστημα"], askAris: ["Ποιο μοντέλο μου ταιριάζει;", "Χωράει στον χώρο μου;"] };
      case "video": return { ...b, src: video?.url ?? "", poster: video?.thumbUrl ?? img(0), caption: video ? "Βίντεο από τη βιβλιοθήκη" : "Δείγμα — δεν υπάρχει ακόμη βίντεο στη βιβλιοθήκη" };
      case "announcement": return { ...b, endsAt: ends };
      case "banner": return { ...b, kicker: "Νέο", title: "Μεγάλο banner με μήνυμα", body: "Κείμενο πάνω στην εικόνα, με σκίαση για να διαβάζεται.", image: img(2), cta: { label: "Δες τα προϊόντα", href: "/prosfores" } };
      case "products-auto": return { ...b, limit: 4, cta: { label: "Δες όλα", href: "/prosfores" } };
      case "categories": return { ...b, limit: 4 };
      case "faq": return { ...b, items: [{ q: "Πόσο κάνει η παράδοση;", a: "Δωρεάν για παραγγελίες άνω των 49 €." }, { q: "Μπορώ να το επιστρέψω;", a: "Ναι, μέσα σε 14 ημέρες." }] };
      case "text": return { ...b, kicker: "Κείμενο", title: "Τίτλος και παράγραφοι", body: "Πρώτη παράγραφος με ό,τι θέλεις να πεις.\n\nΔεύτερη παράγραφος — άφησε κενή γραμμή για νέα παράγραφο." };
      case "gallery": return { ...b, title: "Gallery", layout: "mosaic", images: [0, 1, 2, 3].map((i) => ({ src: img(i), caption: i === 0 ? "Η πρώτη εικόνα μεγάλη (mosaic)" : undefined })) };
      case "promo-landing": return { ...b, landingId: "sample" };
      case "promo-products": return { ...b, promotionId: "sample", limit: 4 };
      case "coupon": return { ...b, code: "DEIGMA10" };
      case "deal-hero": return { ...b, promotionId: "sample" };
      case "countdown": return { ...b, promotionId: "sample", body: "Η μέτρηση φτάνει μέχρι τη λήξη της προσφοράς." };
      case "callout": return { ...b, tone: "info", title: "Σημαντική πληροφορία", body: "Π.χ. αλλαγή ωραρίου τις αργίες ή καθυστερήσεις στις παραδόσεις σε νησιά." };
      default: return b;
    }
  };

  const groups = BLOCK_GROUPS.map((g) => ({ ...g, blocks: g.types.map(sample) })).filter((g) => !sp.only || g.types.includes(sp.only as BrandBlock["type"]));
  const all = groups.flatMap((g) => g.blocks);
  const d = await resolveBlocks(all, { brandSlug: brand?.slug ?? null, sample: true });

  return (
    <div className="eu-container">
      <div className="eu-canvas eu-gutter py-6 grid gap-2">
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Μόνο για το προσωπικό · δείγματα</div>
        <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Συλλογή components</h1>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[75ch]">Κάθε component όπως θα το δει ο πελάτης{brand ? `, με τα χρώματα της σελίδας ${brand.name}` : " στις πληροφοριακές σελίδες (χρώματα Euronics)"}. Όσα είναι συνδεδεμένα με προσφορές δείχνουν δείγμα όταν δεν τρέχει καμία προσφορά.</p>
        <nav aria-label="Ομάδες" className="flex flex-wrap gap-2 mt-2">{groups.map((g) => <a key={g.label} href={`#g-${g.label}`} className="rounded-full bg-eu-surface px-3 min-h-10 inline-flex items-center font-bold text-eu-ink-2 text-[length:var(--fs-14)] hover:bg-eu-chip">{g.label}</a>)}</nav>
      </div>
      {groups.map((g) => (
        <section key={g.label} id={`g-${g.label}`} className="scroll-mt-24">
          <div className="eu-canvas eu-gutter pt-8"><h2 className="m-0 font-heading font-bold text-eu-navy text-[length:var(--fs-22)] border-b-2 border-eu-navy pb-2">{g.label}</h2></div>
          {g.blocks.map((b) => (
            <article key={b.id} id={`c-${b.type}`} className="scroll-mt-24 border-b border-dashed border-eu-line">
              <div className="eu-canvas eu-gutter pt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-13)] px-3 py-1">{BLOCK_INFO[b.type].label}</span>
                <span className="text-eu-ink-3 text-[length:var(--fs-14)] max-w-[70ch]">{BLOCK_INFO[b.type].help}</span>
              </div>
              <BrandFrame theme={theme}>{renderBlock(b, d, { brandName, sample: true, countImpressions: false }) ?? <div className="eu-canvas eu-gutter py-6 text-eu-muted">Χωρίς δεδομένα για δείγμα αυτή τη στιγμή.</div>}</BrandFrame>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
