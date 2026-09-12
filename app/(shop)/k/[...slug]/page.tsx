import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { CategoryOpener } from "@/components/catalog/CategoryOpener";
import { Facets } from "@/components/catalog/Facets";
import { SortBar } from "@/components/catalog/SortBar";
import { Pagination } from "@/components/catalog/Pagination";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { CategoryFaq } from "@/components/catalog/CategoryFaq";
import { filterFromParams, getL1, getL2, listProducts } from "@/lib/data/repo";
import { getCategories } from "@/lib/data/catalog";
import { getSettings } from "@/lib/cms/settings";
import { Sparkles } from "lucide-react";

const GUIDE_FOR: Record<string, { kind: string; t: string }> = { tileoraseis: { kind: "tileoraseis", t: "Ποια τηλεόραση σού ταιριάζει; 5 ερωτήσεις, αιτιολογημένη πρόταση." }, laptops: { kind: "ypologistes", t: "Ποιος υπολογιστής σού ταιριάζει; 5 ερωτήσεις, αιτιολογημένη πρόταση." }, tablets: { kind: "ypologistes", t: "Laptop ή tablet; Ο έξυπνος οδηγός αποφασίζει μαζί σου." }, "air-condition": { kind: "klimatistika", t: "Πόσα BTU χρειάζεσαι; Ο έξυπνος οδηγός τα υπολογίζει από τα τετραγωνικά." } };

type Params = { slug: string[] };
type SP = Record<string, string | undefined>;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const l1 = await getL1(slug[0]);
  if (!l1) return {};
  const l2 = slug[1] ? l1.children.find((c) => c.slug === slug[1]) : null;
  const name = l2 ? `${l2.name} · ${l1.label}` : l1.label;
  return { title: name, description: `${name}: προσφορές, δόσεις χωρίς κάρτα, παραλαβή σε 2 ώρες από 350 καταστήματα Euronics.` };
}

/** /k/{l1} = category landing (subcategory tiles + products) · /k/{l1}/{l2} = listing with facets in the URL. */
export default async function CategoryPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<SP> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const l1 = await getL1(slug[0]);
  if (!l1) notFound();
  const l2 = slug[1] ? (await getL2(slug[0], slug[1]))?.l2 ?? null : null;
  if (slug[1] && !l2) notFound();

  const [result, cats, settings] = await Promise.all([listProducts(filterFromParams(sp, { l1: l1.slug, l2: l2?.slug, perPage: 24 })), getCategories(), getSettings()]);
  const catNo = cats.find((c) => c.slug === l1.slug)?.no;
  const questions = settings.advisor.suggestions.byCategory[l2?.slug ?? l1.slug] ?? settings.advisor.suggestions.product;
  const basePath = l2 ? `/k/${l1.slug}/${l2.slug}` : `/k/${l1.slug}`;
  const title = l2 ? l2.name : l1.label;

  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Προϊόντα", href: "/proionta" }, { label: l1.label, href: `/k/${l1.slug}` }, ...(l2 ? [{ label: l2.name }] : [])]} />
      <CategoryOpener kicker={l2 ? l1.label : "Κατηγορία"} title={title} no={catNo} count={result.total} lead="δόσεις χωρίς κάρτα · παραλαβή σε 2 ώρες από το κατάστημα της περιοχής σου" products={result.items.slice(0, 3)} questions={questions} />

      {!l2 && (
        <div className="eu-canvas eu-gutter pt-6 pb-6">
          <ul className="m-0 p-0 list-none flex flex-wrap gap-2">
            {l1.children.map((ch) => (
              <li key={ch.slug}>
                <Link href={`/k/${l1.slug}/${ch.slug}`} className="inline-flex items-center rounded-full border border-eu-line bg-white px-4 py-2.5 min-h-11 font-semibold text-eu-ink text-[length:var(--fs-15)] hover:border-eu-blue hover:text-eu-blue">
                  {ch.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {l2 && GUIDE_FOR[l2.slug] && (
        <div className="eu-canvas eu-gutter pt-6 pb-5">
          <Link href={`/odigos-agoras/${GUIDE_FOR[l2.slug].kind}`} className="flex flex-wrap items-center gap-3 rounded-2xl bg-eu-blue text-white px-5 py-4 shadow-[var(--shadow-raised)] hover:bg-eu-blue-dark transition-colors">
            <Sparkles className="size-6 text-eu-yellow shrink-0" aria-hidden />
            <span className="flex-1 min-w-[16em] font-bold text-[length:var(--fs-16)]">{GUIDE_FOR[l2.slug].t}</span>
            <span className="rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 inline-flex items-center">Έξυπνος οδηγός αγοράς →</span>
          </Link>
        </div>
      )}
      <div className="eu-canvas eu-gutter pb-12 flex flex-col @3xl:flex-row gap-5 @3xl:gap-6 items-stretch">
        <Facets result={result} />
        <div className="flex-1 min-w-0 eu-container">
          <SortBar total={result.total} page={result.page} pages={result.pages} />
          <ProductGrid products={result.items} view={sp.view === "list" ? "list" : "grid"} />
          <Pagination page={result.page} pages={result.pages} basePath={basePath} params={Object.fromEntries(Object.entries(sp).filter(([, v]) => v != null)) as Record<string, string>} />
          <CategoryFaq name={title} />
        </div>
      </div>
    </div>
  );
}
