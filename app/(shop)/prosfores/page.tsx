import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PageIntro } from "@/components/site/PageIntro";
import { Countdown } from "@/components/commerce/Countdown";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { SortBar } from "@/components/catalog/SortBar";
import { fitMattersFor } from "@/lib/data/dims";
import { listProducts, type ListFilter } from "@/lib/data/repo";
import { getWeeklyDeals } from "@/lib/data/catalog";

export const metadata: Metadata = { title: "Προσφορές", description: "Προσφορές με πραγματική λήξη και χαμηλότερη τιμή 30 ημερών σε κάθε προϊόν." };

/** Permanent offers page — the current euronics.gr has none. Real expiry, Omnibus 30-day price on every card. */
export default async function OffersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const deals = await getWeeklyDeals();
  const result = await listProducts({ sale: true, sort: (sp.sort as ListFilter["sort"]) ?? "discount", page: sp.page ? Number(sp.page) : 1, perPage: 48 });
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Προσφορές" }]} />
      <PageIntro
        tone="dark"
        kicker={deals.label}
        title="Προσφορές με πραγματική λήξη"
        lead="Κάθε έκπτωση δείχνει τη χαμηλότερη τιμή των 30 προηγούμενων ημερών. Ο χρόνος που βλέπεις είναι ο πραγματικός χρόνος λήξης της καμπάνιας."
        right={<Countdown endsAt={deals.endsAt} variant="blocks" />}
      />
      <div className="eu-canvas eu-gutter py-8">
        <SortBar total={result.total} page={result.page} pages={result.pages} fit={result.items.some(fitMattersFor)} />
        <ProductGrid products={result.items} view={sp.view === "list" ? "list" : "grid"} />
      </div>
    </div>
  );
}
