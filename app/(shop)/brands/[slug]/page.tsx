import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PageIntro } from "@/components/site/PageIntro";
import { Facets } from "@/components/catalog/Facets";
import { SortBar } from "@/components/catalog/SortBar";
import { fitMattersFor } from "@/lib/data/dims";
import { Pagination } from "@/components/catalog/Pagination";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { getBrand, getBrandStore, listProducts, type ListFilter } from "@/lib/data/repo";
import { renderBrandStore } from "@/lib/cms/brand-render";
import Link from "next/link";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const slug = (await params).slug;
  const store = await getBrandStore(slug);
  if (store) return { title: store.seo.title, description: store.seo.description };
  const b = await getBrand(slug);
  return b ? { title: `${b.name} — προϊόντα`, description: `Όλα τα προϊόντα ${b.name} στη Euronics με εργοστασιακή εγγύηση και δόσεις.` } : {};
}

export default async function BrandPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const brand = await getBrand(slug);
  if (!brand) notFound();
  // Brand store (CMS record) → the manufacturer's own page; ?all=1 shows the plain listing.
  const store = sp.all ? null : await getBrandStore(slug);
  const result = await listProducts({ brand: [slug], energy: sp.energy?.split(",").filter(Boolean), minPrice: sp.min ? Number(sp.min) : undefined, maxPrice: sp.max ? Number(sp.max) : undefined, avail: sp.avail === "in-stock" ? "in-stock" : undefined, sale: sp.sale === "1", sort: (sp.sort as ListFilter["sort"]) ?? "relevance", page: sp.page ? Number(sp.page) : 1 });
  if (store) {
    return (
      <div className="eu-container">
        <Breadcrumbs items={[{ label: "Μάρκες", href: "/brands" }, { label: brand.name }]} />
        {await renderBrandStore(store)}
        <div className="eu-canvas eu-gutter py-10 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Κατάλογος</div>
            <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">Όλα τα προϊόντα {brand.name}</h2>
          </div>
          <Link href={`/brands/${slug}?all=1`} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-12 inline-flex items-center hover:bg-eu-blue">
            {brand.count} προϊόντα με φίλτρα →
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Μάρκες", href: "/brands" }, { label: brand.name }]} />
      <PageIntro tone="blue" kicker="Επίσημος μεταπωλητής" title={brand.name} lead={`${brand.count} προϊόντα ${brand.name} με εργοστασιακή εγγύηση, service αντιπροσωπείας και δόσεις χωρίς κάρτα.`} />
      <div className="eu-canvas eu-gutter py-8 flex gap-6 items-start">
        <Facets result={{ ...result, brands: [] }} />
        <div className="flex-1 min-w-0 eu-container">
          <SortBar total={result.total} page={result.page} pages={result.pages} fit={result.items.some(fitMattersFor)} />
          <ProductGrid products={result.items} view={sp.view === "list" ? "list" : "grid"} />
          <Pagination page={result.page} pages={result.pages} basePath={`/brands/${slug}`} params={sp} />
        </div>
      </div>
    </div>
  );
}
