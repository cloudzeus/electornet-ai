import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PageIntro } from "@/components/site/PageIntro";
import { getBrands, getBrandStores } from "@/lib/data/repo";
import { BrandStoreTiles } from "@/components/brand/BrandStoreTiles";

export const metadata: Metadata = { title: "Μάρκες", description: "Όλες οι μάρκες που διαθέτει η Euronics: LG, Samsung, Bosch, AEG, Apple, Miele και άλλες." };

/** Brand wall — the current euronics.gr /manufacturer/all lists 10 brands with 0 products. */
export default async function BrandsPage() {
  const [brands, stores] = await Promise.all([getBrands(), getBrandStores()]);
  const letters = [...new Set(brands.map((b) => b.name[0].toUpperCase()))];
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
              <Link href={`/brands/${b.slug}`} className="flex flex-col items-center justify-center gap-1 rounded-lg border border-eu-line bg-white p-5 min-h-[110px] hover:border-eu-blue">
                <span className="font-extrabold text-eu-ink text-[length:var(--fs-16)] tracking-wide">{b.name}</span>
                <span className="text-eu-muted-2 text-[length:var(--fs-14)]">{b.count} προϊόντα</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
