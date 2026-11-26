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

/** Permanent offers page — the current euronics.gr has none. Real expiry on every card. */
export default async function OffersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const deals = await getWeeklyDeals();
  const campaign = await pickAd("offers-top", { count: false }).catch(() => null);
  // με banner καμπάνιας στη σελίδα, η λήξη που φαίνεται είναι της καμπάνιας (όχι των εβδομαδιαίων προσφορών)
  const ends = campaign?.endsAt ?? null;
  // τα προϊόντα που είναι τώρα σε προσφορά, από τις έτοιμες τιμές των ενεργών προσφορών (όχι από τα δοκιμαστικά δεδομένα)
  const result = await offerProductsPage(sp.sort, sp.page ? Number(sp.page) : 1, 48, sp.k);
  // επιλεγμένη κατηγορία: 1ο επίπεδο (Λευκές Συσκευές) ή 2ο (Ψυγεία)· στο 2ο μένει ανοιχτή η ρίζα του, για να αλλάζει ο πελάτης αδελφή κατηγορία
  const root = result.categories.find((c) => c.slug === sp.k || c.children.some((ch) => ch.slug === sp.k));
  const sub = root?.children.find((ch) => ch.slug === sp.k);
  const chipHref = (k?: string) => {
    const q = new URLSearchParams(Object.entries({ k, sort: sp.sort, view: sp.view }).filter((e): e is [string, string] => !!e[1]));
    return q.size ? `/prosfores?${q}` : "/prosfores";
  };
  const chip = (on: boolean) => `inline-flex items-center gap-2 rounded-full border-2 px-4 py-2.5 min-h-12 font-bold text-[length:var(--fs-15)] ${on ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line bg-white text-eu-ink hover:border-eu-blue hover:text-eu-blue"}`;
  const subChip = (on: boolean) => `inline-flex items-center gap-2 rounded-full px-3.5 py-2 min-h-11 font-semibold text-[length:var(--fs-14)] ${on ? "bg-eu-chip text-eu-blue ring-2 ring-eu-blue" : "bg-eu-surface text-eu-ink-2 hover:bg-eu-chip hover:text-eu-blue"}`;
  return (
    <div className="eu-container">
      <Breadcrumbs items={root ? [{ label: "Προσφορές", href: "/prosfores" }, ...(sub ? [{ label: root.name, href: chipHref(root.slug) }, { label: sub.name }] : [{ label: root.name }])] : [{ label: "Προσφορές" }]} />
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
        {/* ίδια chips με το /proionta: μόνο κατηγορίες που έχουν προσφορές, με πλήθος (όπως εκεί, και με «Απόκρυψη πλήθους»: είναι ακριβές, όχι πλήθος καταλόγου) */}
        {result.categories.length > 1 && (
          <nav aria-label="Κατηγορίες προσφορών" className="pb-5">
            <ul className="m-0 p-0 list-none flex flex-wrap gap-2">
              <li><Link href={chipHref()} aria-current={!root ? "page" : undefined} className={chip(!root)}>Όλες</Link></li>
              {result.categories.map((c) => {
                const on = root?.slug === c.slug;
                return (
                  <li key={c.slug}>
                    <Link href={chipHref(c.slug)} aria-current={on && !sub ? "page" : undefined} className={chip(on)}>
                      {c.name}
                      <span className={`text-[length:var(--fs-13)] tabular-nums ${on ? "text-eu-yellow" : "text-eu-muted-2"}`}>{c.count}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {root && root.children.length > 1 && (
              <ul className="m-0 mt-3 p-0 list-none flex flex-wrap gap-2" aria-label={`Υποκατηγορίες: ${root.name}`}>
                {root.children.map((ch) => (
                  <li key={ch.slug}>
                    <Link href={chipHref(ch.slug)} aria-current={sub?.slug === ch.slug ? "page" : undefined} className={subChip(sub?.slug === ch.slug)}>
                      {ch.name}
                      <span className="text-[length:var(--fs-13)] tabular-nums text-eu-muted-2">{ch.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </nav>
        )}
        <SortBar total={result.total} page={result.page} pages={result.pages} fit={result.items.some(fitMattersFor)} />
        {result.total ? <ProductGrid products={result.items} view={sp.view === "list" ? "list" : "grid"} /> : <p className="m-0 rounded-2xl bg-eu-surface px-5 py-8 text-center text-eu-ink-2 text-[length:var(--fs-16)]">Δεν τρέχει προσφορά αυτή τη στιγμή. Δες τα <Link href="/proionta" className="font-bold text-eu-blue underline">προϊόντα μας</Link> ή γύρνα σύντομα.</p>}
        <Pagination page={result.page} pages={result.pages} basePath="/prosfores" params={sp} />
      </div>
    </div>
  );
}
