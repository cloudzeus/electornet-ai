import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PageIntro } from "@/components/site/PageIntro";
import { getBrands, getBrandStores } from "@/lib/data/repo";
import { BrandStoreTiles } from "@/components/brand/BrandStoreTiles";
import { UniformLogo } from "@/components/brand/UniformLogo";

export const metadata: Metadata = { title: "Μάρκες", description: "Όλες οι μάρκες που διαθέτει η Euronics: LG, Samsung, Bosch, AEG, Apple, Miele και άλλες." };

/** Brand wall — the current euronics.gr /manufacturer/all lists 10 brands with 0 products. */
export default async function BrandsPage() {
  const [brands, stores] = await Promise.all([getBrands(), getBrandStores()]);
  const letters = [...new Set(brands.map((b) => b.name[0].toUpperCase()))];
  // το περικομμένο λογότυπο της σελίδας μάρκας υπερισχύει του λογοτύπου καταλόγου
  const storeLogo = new Map(stores.filter((s) => s.logo).map((s) => [s.slug, { src: s.logo!, aspect: s.logoAspect }]));
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Μάρκες" }]} />
      <PageIntro kicker="Κατασκευαστές" title="Όλες οι μάρκες" lead="Επίσημος μεταπωλητής με εργοστασιακή εγγύηση και service αντιπροσωπείας για κάθε μάρκα." />
      <div className="eu-canvas eu-gutter pb-12">
        <div className="flex flex-wrap gap-1.5 mb-6">
          {letters.map((l) => (
            <a key={l} href={`#b-${l}`} className="size-9 inline-flex items-center justify-center rounded-full bg-eu-surface font-extrabold text-eu-ink text-[length:var(--fs-15)] hover:bg-eu-chip">
              {l}
            </a>
          ))}
        </div>
        <BrandStoreTiles stores={stores} />
        <ul className="m-0 p-0 list-none grid grid-cols-2 @sm:grid-cols-3 @lg:grid-cols-4 @xl:grid-cols-6 gap-3">
          {brands.map((b) => (
            <li key={b.slug} id={`b-${b.name[0].toUpperCase()}`}>
              <Link href={`/brands/${b.slug}`} title={b.name} className="flex flex-col items-center justify-center gap-2 rounded-lg border border-eu-line bg-white p-4 min-h-[110px] hover:border-eu-blue">
                {storeLogo.get(b.slug) ?? b.logo ? (
                  <span className="h-14 w-full flex items-center justify-center"><UniformLogo src={storeLogo.get(b.slug)?.src ?? b.logo!} aspect={storeLogo.get(b.slug)?.aspect} alt={b.name} /></span>
                ) : (
                  <span className="h-14 flex items-center font-extrabold text-eu-ink text-[length:var(--fs-16)] tracking-wide text-center">{b.name}</span>
                )}
                <span className="text-eu-muted-2 text-[length:var(--fs-14)]">{b.count} προϊόντα</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
