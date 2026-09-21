import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PageIntro } from "@/components/site/PageIntro";
import { Facets } from "@/components/catalog/Facets";
import { SortBar } from "@/components/catalog/SortBar";
import { fitMattersFor } from "@/lib/data/dims";
import { Pagination } from "@/components/catalog/Pagination";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { listProducts, type ListFilter } from "@/lib/data/repo";

export const metadata: Metadata = { title: "Αναζήτηση" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const filter: ListFilter = {
    q: q || undefined,
    l1: sp.cat && sp.cat !== "all" ? sp.cat : undefined,
    brand: sp.brand?.split(",").filter(Boolean),
    energy: sp.energy?.split(",").filter(Boolean),
    minPrice: sp.min ? Number(sp.min) : undefined,
    maxPrice: sp.max ? Number(sp.max) : undefined,
    avail: sp.avail === "in-stock" ? "in-stock" : undefined,
    sale: sp.sale === "1",
    sort: (sp.sort as ListFilter["sort"]) ?? "relevance",
    page: sp.page ? Number(sp.page) : 1,
  };
  const result = await listProducts(filter);
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Αναζήτηση" }]} />
      <PageIntro kicker="Αναζήτηση" title={q ? `Αποτελέσματα για «${q}»` : "Αναζήτηση προϊόντων"} lead={`${result.total} προϊόντα${filter.l1 ? " στην επιλεγμένη κατηγορία" : ""}. Ψάξε με όνομα, μάρκα, κωδικό ή EAN.`} />
      <div className="eu-canvas eu-gutter pb-12 flex gap-6 items-start">
        <Facets result={result} />
        <div className="flex-1 min-w-0 eu-container">
          <SortBar total={result.total} page={result.page} pages={result.pages} fit={result.items.some(fitMattersFor)} />
          <ProductGrid products={result.items} view={sp.view === "list" ? "list" : "grid"} />
          <Pagination page={result.page} pages={result.pages} basePath="/anazitisi" params={sp} />
        </div>
      </div>
    </div>
  );
}
