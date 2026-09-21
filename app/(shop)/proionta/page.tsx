import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PageIntro } from "@/components/site/PageIntro";
import { Facets } from "@/components/catalog/Facets";
import { SortBar } from "@/components/catalog/SortBar";
import { fitMattersFor } from "@/lib/data/dims";
import { Pagination } from "@/components/catalog/Pagination";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { filterFromParams, getCategoryTree, listProducts } from "@/lib/data/repo";

export const metadata: Metadata = { title: "Όλα τα προϊόντα", description: "Όλα τα προϊόντα της Euronics με φίλτρα ανά κατηγορία, μάρκα, τιμή, ενεργειακή κλάση και χαρακτηριστικά. Σύγκριση έως 4 προϊόντων." };

type SP = Record<string, string | undefined>;

/**
 * /proionta — the full product list. Category, brand, price, energy and
 * characteristic facets in the URL; sort; grid/list; compare from every
 * card. The category chips on top are the real 9 L1 categories.
 */
export default async function AllProducts({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [tree, result] = await Promise.all([getCategoryTree(), listProducts(filterFromParams(sp))]);
  const current = tree.find((c) => c.slug === sp.k);
  const params = Object.fromEntries(Object.entries(sp).filter(([, v]) => v != null)) as Record<string, string>;

  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Προϊόντα", href: "/proionta" }, ...(current ? [{ label: current.label }] : [])]} />
      <PageIntro
        kicker="Κατάλογος"
        title={current ? current.label : "Όλα τα προϊόντα"}
        lead={`${result.total} προϊόντα · φίλτρα ανά μάρκα, τιμή, ενεργειακή κλάση και χαρακτηριστικά · σύγκριση έως 4 · δόσεις χωρίς κάρτα · παραλαβή σε 2 ώρες.`}
      />

      <div className="eu-canvas eu-gutter pb-5">
        <ul className="m-0 p-0 list-none flex flex-wrap gap-2" aria-label="Κατηγορίες">
          <li>
            <Link href="/proionta" className={`inline-flex items-center rounded-full border-2 px-4 py-2.5 min-h-12 font-bold text-[length:var(--fs-15)] ${!sp.k ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line bg-white text-eu-ink hover:border-eu-blue hover:text-eu-blue"}`}>
              Όλα
            </Link>
          </li>
          {tree.map((c) => {
            const on = sp.k === c.slug;
            return (
              <li key={c.slug}>
                <Link href={`/proionta?k=${c.slug}`} className={`inline-flex items-center gap-2 rounded-full border-2 px-4 py-2.5 min-h-12 font-bold text-[length:var(--fs-15)] ${on ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line bg-white text-eu-ink hover:border-eu-blue hover:text-eu-blue"}`}>
                  {c.label}
                  <span className={`text-[length:var(--fs-13)] ${on ? "text-eu-yellow" : "text-eu-muted-2"}`}>{result.categories.find((x) => x.slug === c.slug)?.count ?? 0}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        {current && current.children.length > 0 && (
          <ul className="m-0 mt-3 p-0 list-none flex flex-wrap gap-2" aria-label="Υποκατηγορίες">
            {current.children.map((ch) => (
              <li key={ch.slug}>
                <Link href={`/k/${current.slug}/${ch.slug}`} className="inline-flex items-center rounded-full bg-eu-surface px-3.5 py-2 min-h-10 font-semibold text-eu-ink-2 text-[length:var(--fs-14)] hover:bg-eu-chip hover:text-eu-blue">
                  {ch.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="eu-canvas eu-gutter pb-12 flex flex-col @3xl:flex-row gap-5 @3xl:gap-6 items-stretch">
        <Facets result={result} showCategories />
        <div className="flex-1 min-w-0 eu-container">
          <SortBar total={result.total} page={result.page} pages={result.pages} fit={result.items.some(fitMattersFor)} />
          <ProductGrid products={result.items} view={sp.view === "list" ? "list" : "grid"} />
          <Pagination page={result.page} pages={result.pages} basePath="/proionta" params={params} />
        </div>
      </div>
    </div>
  );
}
