import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PageIntro } from "@/components/site/PageIntro";
import { Countdown } from "@/components/commerce/Countdown";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { SortBar } from "@/components/catalog/SortBarServer";
import { Pagination } from "@/components/catalog/Pagination";
import { AdSlot } from "@/components/promo/AdSlot";
import Link from "next/link";
import { offerProductsPage, pickAd } from "@/lib/promo/landing";
import { fitMattersFor } from "@/lib/data/dims";
import { getWeeklyDeals } from "@/lib/data/catalog";

export const metadata: Metadata = { title: "Προσφορές σε ηλεκτρικές συσκευές & τεχνολογία", description: "Οι τρέχουσες προσφορές της Euronics σε τηλεοράσεις, λευκές συσκευές, κλιματιστικά, υπολογιστές και μικροσυσκευές, με ημερομηνία λήξης σε καθεμία. Άτοκες δόσεις με κάρτα." };

/** Permanent offers page — the current euronics.gr has none. Real expiry, Omnibus 30-day price on every card. */
export default async function OffersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const deals = await getWeeklyDeals();
  const campaign = await pickAd("offers-top", { count: false }).catch(() => null);
  // με banner καμπάνιας στη σελίδα, η λήξη που φαίνεται είναι της καμπάνιας (όχι των εβδομαδιαίων προσφορών)
  const ends = campaign?.endsAt ?? null;
  // τα προϊόντα που είναι τώρα σε προσφορά, από τις έτοιμες τιμές των ενεργών προσφορών (όχι από τα δοκιμαστικά δεδομένα)
  const result = await offerProductsPage(sp.sort, sp.page ? Number(sp.page) : 1);
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Προσφορές" }]} />
      {/* banner καμπάνιας από άκρη σε άκρη, ως κεφαλίδα της σελίδας· από κάτω η εξήγηση με τη λήξη (ανοιχτή, για να μη στοιβάζονται δύο σκούρες ζώνες) */}
      <AdSlot slot="offers-top" bleed />
      <PageIntro
        tone={campaign ? "light" : "dark"}
        kicker={ends ? `Λήγουν ${ends.toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Athens" })}` : deals.label}
        title="Προσφορές με πραγματική λήξη"
        lead="Δίπλα σε κάθε τιμή προσφοράς βλέπεις την αρχική τιμή, διαγραμμένη. Ο χρόνος που βλέπεις είναι ο πραγματικός χρόνος λήξης της καμπάνιας."
        right={<Countdown endsAt={ends ? ends.toISOString() : deals.endsAt} variant="blocks" />}
      />
      <div className="eu-canvas eu-gutter py-8">
        <SortBar total={result.total} page={result.page} pages={result.pages} fit={result.items.some(fitMattersFor)} />
        {result.total ? <ProductGrid products={result.items} view={sp.view === "list" ? "list" : "grid"} /> : <p className="m-0 rounded-2xl bg-eu-surface px-5 py-8 text-center text-eu-ink-2 text-[length:var(--fs-16)]">Δεν τρέχει προσφορά αυτή τη στιγμή. Δες τα <Link href="/proionta" className="font-bold text-eu-blue underline">προϊόντα μας</Link> ή γύρνα σύντομα.</p>}
        <Pagination page={result.page} pages={result.pages} basePath="/prosfores" params={sp} />
      </div>
    </div>
  );
}
