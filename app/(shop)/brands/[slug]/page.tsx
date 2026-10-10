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
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac/permissions";
import { getStoreDoc } from "@/lib/cms/brand-stores";
import { previewTokenOk, runDueScenarios } from "@/lib/cms/doc-plans";
import { brandTarget } from "@/lib/cms/brand-plans";

/**
 * ?preview=1 από το προσωπικό με δικαίωμα σελίδων μαρκών, ή ?pt=<token> από σύνδεσμο προεπισκόπησης (λήγει):
 * δείχνει το ΠΡΟΧΕΙΡΟ (ποτέ σε πελάτες).
 */
async function previewStore(slug: string, sp: Record<string, string | undefined>) {
  if (previewTokenOk(sp.pt, `brand:${slug}`)) return (await getStoreDoc(slug))?.draft ?? null;
  if (sp.preview !== "1") return null;
  const user = (await auth())?.user;
  if (!user || !can(user.permissions, "cms.brandstores.write")) return null;
  return (await getStoreDoc(slug))?.draft ?? null;
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }): Promise<Metadata> {
  const [slug, sp] = [(await params).slug, await searchParams];
  const store = await getBrandStore(slug);
  // οι προεπισκοπήσεις του πρόχειρου δεν ευρετηριάζονται
  if (sp.pt || sp.preview) return { title: store?.seo.title ?? slug, robots: { index: false, follow: false } };
  if (store) return { title: store.seo.title, description: store.seo.description };
  const b = await getBrand(slug);
  return b ? { title: `${b.name} — προϊόντα`, description: `Όλα τα προϊόντα ${b.name} στη Euronics με εργοστασιακή εγγύηση και δόσεις.` } : {};
}

export default async function BrandPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const brand = await getBrand(slug);
  if (!brand) notFound();
  // Brand store (CMS record) → the manufacturer's own page; ?all=1 shows the plain listing.
  // προγραμματισμένα σενάρια της σελίδας δημοσιεύονται στην ώρα τους (το πολύ ένας έλεγχος ανά 30″)
  await runDueScenarios(brandTarget(slug)).catch(() => false);
  const preview = !sp.all ? await previewStore(slug, sp) : null;
  const store = sp.all ? null : preview ?? (await getBrandStore(slug));
  const result = await listProducts({ brand: [slug], energy: sp.energy?.split(",").filter(Boolean), minPrice: sp.min ? Number(sp.min) : undefined, maxPrice: sp.max ? Number(sp.max) : undefined, avail: sp.avail === "in-stock" ? "in-stock" : undefined, sale: sp.sale === "1", sort: (sp.sort as ListFilter["sort"]) ?? "relevance", page: sp.page ? Number(sp.page) : 1 });
  if (store) {
    return (
      <div className="eu-container">
        {preview && <div role="status" className="sticky top-0 z-40 bg-eu-yellow text-eu-navy text-center font-extrabold text-[length:var(--fs-14)] px-4 py-2">Προεπισκόπηση πρόχειρου — οι πελάτες δεν το βλέπουν</div>}
        <Breadcrumbs items={[{ label: "Μάρκες", href: "/brands" }, { label: brand.name }]} />
        {await renderBrandStore(store, new Date(), { mark: !!preview })}
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
