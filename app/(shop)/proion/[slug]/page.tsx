import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Recycle } from "lucide-react";
import { ProductHeader } from "@/components/pdp/ProductHeader";
import { SectionNav } from "@/components/pdp/SectionNav";
import { Gallery } from "@/components/pdp/Gallery";
import { BuyBox } from "@/components/pdp/BuyBox";
import { SpecsTable } from "@/components/pdp/SpecsTable";
import { CompareSimilar } from "@/components/pdp/CompareSimilar";
import { ServicesDelivery } from "@/components/pdp/ServicesDelivery";
import { Reviews } from "@/components/pdp/Reviews";
import { Questions } from "@/components/pdp/Questions";
import { ProductRail } from "@/components/pdp/ProductRail";
import { StickyBar } from "@/components/pdp/StickyBar";
import { RecentlyViewed } from "@/components/pdp/RecentlyViewed";
import { getAccessoriesFor, getL1, getProductBySlug, getRelated, getServicesFull, getStores } from "@/lib/data/repo";
import { Answers, SeoPanel } from "@/components/pdp/Answers";
import { StickySidebar } from "@/components/fluid/StickySidebar";
import { CompactRail } from "@/components/pdp/CompactRail";
import { productJsonLd, productMetadata } from "@/lib/seo/product";
import { ArButton } from "@/components/ar/ArButton";
import { FitBadge } from "@/components/space/FitBadge";
import { EnergyCost } from "@/components/pdp/EnergyCost";
import { getGridFactor } from "@/lib/energy/emissions";
import { after } from "next/server";
import { buildArModel } from "@/lib/ar/build";
import { cutoutFor } from "@/lib/data/cutouts";
import { dimsFor } from "@/lib/data/dims";
import { AdvisorContext } from "@/components/advisor/AdvisorContext";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getProductBySlug((await params).slug);
  if (!p) return {};
  const l1 = await getL1(p.category);
  const l2 = l1?.children.find((c) => c.slug === p.subcategory);
  return productMetadata(p, [{ label: "Προϊόντα", href: "/proionta" }, ...(l1 ? [{ label: l1.label, href: `/k/${l1.slug}` }] : []), ...(l1 && l2 ? [{ label: l2.name, href: `/k/${l1.slug}/${l2.slug}` }] : []), { label: p.title }]);
}

/**
 * Product page as specified in the proposal (p.6 «Πριν → Μετά · Προϊόν»):
 * header band with key facts · gallery · sticky buy box with delivery
 * choice, store stock and «Ολοκληρωμένη λύση» · sticky section nav ·
 * highlights · description · specs as a grouped grid · in-page comparison
 * with similar products · services & delivery with prices · reviews ·
 * Q&A · accessories · related · recently viewed. Text sizes ≥ 13px.
 */
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p) notFound();
  const [l1, related, accessories, services, stores] = await Promise.all([getL1(p.category), getRelated(p, 5), getAccessoriesFor(p), getServicesFull(), getStores()]);
  const l2 = l1?.children.find((c) => c.slug === p.subcategory);
  const addons = services.filter((s) => s.addonAt?.includes("pdp") && s.slug !== "paradosi-egkatastasi");
  const similar = related.filter((x) => x.subcategory === p.subcategory).slice(0, 3);
  const sections = ["overview", ...(p.description ? ["description"] : []), "answers", ...(p.specs?.length ? ["specs"] : []), ...(similar.length ? ["compare"] : []), "services", "reviews", "qa"];
  const dims = dimsFor(p);
  // Ένταση CO₂ του δικτύου από cache 30 ημερών — καμία κλήση API ανά προϊόν
  const co2 = await getGridFactor().catch(() => null);
  // AR για κάθε προϊόν με διαστάσεις και φωτογραφία — το μοντέλο χτίζεται στο /api/ar
  const hasModel = !!dims && !!p.image;
  // Προθέρμανση: το μοντέλο AR χτίζεται μετά την απάντηση, ώστε όταν πατήσει «Δες το στον χώρο σου» να είναι έτοιμο
  if (hasModel && dims) after(() => buildArModel({ id: p.id, title: `${p.brand} ${p.title}`, dims, image: p.image, cutout: cutoutFor(p.image) }).catch(() => {}));
  const crumbs: { label: string; href?: string }[] = [{ label: "Προϊόντα", href: "/proionta" }, ...(l1 ? [{ label: l1.label, href: `/k/${l1.slug}` }] : []), ...(l1 && l2 ? [{ label: l2.name, href: `/k/${l1.slug}/${l2.slug}` }] : []), { label: p.title }];

  return (
    <div className="eu-container">
      <AdvisorContext product={{ id: p.id, brand: p.brand, title: p.title, price: p.price, energy: p.energy?.cls, dims, category: p.subcategory }} />
      <ProductHeader product={p} crumbs={crumbs} />
      <article className="eu-canvas eu-gutter py-6 @lg:py-8">
        <div className="grid grid-cols-1 @lg:grid-cols-[minmax(0,1fr)_420px] @xl:grid-cols-[minmax(0,1fr)_460px] gap-6 @lg:gap-10 items-stretch">
          <div className="min-w-0 grid gap-6 content-start">
            <Gallery
              productId={p.id}
              images={p.images?.length ? p.images : p.image ? [p.image] : []}
              title={p.title}
              badge={p.badge}
              energy={p.energy}
              actions={
                <>
                  {hasModel && <ArButton id={p.id} title={`${p.brand} ${p.title}`} dims={dims} />}
                  <FitBadge product={p} size="lg" prompt />
                </>
              }
            />
            <EnergyCost product={p} co2={co2} />
            {p.tradeIn && (
              <div className="rounded-xl bg-eu-surface p-4 flex items-center gap-3">
                <Recycle className="size-8 text-eu-green shrink-0" aria-hidden />
                <div className="text-[length:var(--fs-16)] text-eu-ink-2">
                  <strong className="text-eu-ink">Έχεις παλιά συσκευή;</strong> Την παραλαμβάνουμε δωρεάν για ανακύκλωση κατά την παράδοση — επίλεξέ το στο checkout.{" "}
                  <Link href="/ypiresies/anakyklosi-aiie" className="text-eu-blue underline">
                    Μάθε περισσότερα
                  </Link>
                </div>
              </div>
            )}
          </div>
          <StickySidebar className="min-w-0">
            <BuyBox product={p} addons={addons} stores={stores.slice(0, 8)} accessory={null} />
          </StickySidebar>
        </div>
      </article>

      <SectionNav available={sections} />

      <div className="eu-canvas eu-gutter py-8 @lg:py-10 grid grid-cols-1 gap-12 @lg:gap-16 [&>*]:min-w-0">
        <section id="overview" className="scroll-mt-24" aria-labelledby="ov-title">
          <div className="font-extrabold text-eu-blue text-[length:var(--fs-14)] tracking-wide mb-1">Με μια ματιά</div>
          <h2 id="ov-title" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)] leading-tight mb-4">
            Γιατί να το επιλέξεις
          </h2>
          <ul className="m-0 p-0 list-none grid grid-cols-1 @sm:grid-cols-2 @xl:grid-cols-4 gap-3">
            {(p.highlights ?? (p.specs ?? []).slice(0, 4).map((s) => `${s.key}: ${s.value}`)).map((h, i) => (
              <li key={h} className="rounded-xl border border-eu-line p-4 flex gap-3">
                <span className="size-8 shrink-0 rounded-full bg-eu-yellow text-eu-navy font-extrabold inline-flex items-center justify-center text-[length:var(--fs-15)]">{i + 1}</span>
                <span className="text-eu-ink text-[length:var(--fs-17)] leading-snug font-semibold">{h}</span>
              </li>
            ))}
          </ul>
        </section>

        {p.description && (
          <section id="description" className="scroll-mt-24 grid grid-cols-1 @lg:grid-cols-[minmax(0,1fr)_320px] gap-8" aria-labelledby="desc-title">
            <div>
              <div className="font-extrabold text-eu-blue text-[length:var(--fs-14)] tracking-wide mb-1">Περιγραφή</div>
              <h2 id="desc-title" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-26)] leading-tight mb-4">
                {p.brand} {p.title}
              </h2>
              <p className="m-0 text-eu-ink-2 text-[length:var(--fs-16)] leading-[1.75] max-w-[68ch]">{p.description}</p>
              {p.sourceUrl && (
                <p className="m-0 mt-3 text-eu-muted text-[length:var(--fs-15)]">
                  Στοιχεία προϊόντος από το euronics.gr ·{" "}
                  <a href={p.sourceUrl} className="underline" rel="noreferrer" target="_blank">
                    πηγή
                  </a>
                </p>
              )}
            </div>
            <aside className="rounded-xl bg-eu-navy text-white p-5 grid gap-3 self-start">
              <div className="font-extrabold text-eu-yellow text-[length:var(--fs-14)] tracking-wide">Γιατί από Euronics</div>
              {["Επίσημη εγγύηση αντιπροσωπείας 2 έτη", "Service με γνήσια ανταλλακτικά", "Παραλαβή σε 2 ώρες από 350 καταστήματα", "Δόσεις με ή χωρίς κάρτα έως 24 μήνες", "Επιστροφή μέσα σε 14 ημέρες"].map((t) => (
                <div key={t} className="flex gap-2 text-[length:var(--fs-16)]">
                  <span className="text-eu-yellow font-extrabold">✓</span> {t}
                </div>
              ))}
            </aside>
          </section>
        )}

        <Answers product={p} />
        {p.specs && p.specs.length > 0 && <SpecsTable specs={p.specs} energy={p.energy} />}
        <CompareSimilar product={p} similar={similar} />
        <ServicesDelivery product={p} services={services} />
        <Reviews product={p} />
        <Questions product={p} />

        <CompactRail title="Ταιριάζει με αυτό το προϊόν" products={accessories} />
        {related.length > 0 && <ProductRail title="Σχετικά προϊόντα" products={related} />}
        <RecentlyViewed current={{ id: p.id, slug: p.slug, title: p.title, brand: p.brand, image: p.image, price: p.price }} />
        <SeoPanel product={p} crumbs={crumbs} />
      </div>
      <StickyBar product={p} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd(p, crumbs)) }} />
    </div>
  );
}
