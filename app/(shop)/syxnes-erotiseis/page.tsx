import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PageIntro } from "@/components/site/PageIntro";
import { getFaqs } from "@/lib/data/repo";
import { PageZone, ZonesPreviewBar } from "@/components/site/PageZone";

export const metadata: Metadata = { title: "Συχνές ερωτήσεις", description: "Παραγγελίες, πληρωμές, αποστολή, επιστροφές, υπηρεσίες, καταστήματα." };

/** FAQ hub (the current site has none) with FAQPage JSON-LD. */
export default async function FaqPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const preview = (await searchParams).preview === "1";
  const faqs = await getFaqs();
  const groups = [...new Set(faqs.map((f) => f.group))];
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })) };
  return (
    <div className="eu-container">
      <ZonesPreviewBar preview={preview} />
      <Breadcrumbs items={[{ label: "Συχνές ερωτήσεις" }]} />
      <PageIntro kicker="Εξυπηρέτηση" title="Συχνές ερωτήσεις" lead="Αν δεν βρεις αυτό που ψάχνεις, κάλεσέ μας στο 210 483 5143 (Δευ–Παρ 9:00–17:00) ή γράψε στο eshop@euronics.gr." />
      <PageZone page="syxnes-erotiseis" zone="top" preview={preview} />
      <div className="eu-canvas eu-gutter pb-12 grid grid-cols-1 @lg:grid-cols-[220px_minmax(0,1fr)] gap-8 items-start">
        <nav aria-label="Ενότητες" className="@lg:sticky @lg:top-4">
          <ul className="m-0 p-0 list-none flex flex-wrap @lg:flex-col gap-1">
            {groups.map((g) => (
              <li key={g} className="shrink-0">
                <a href={`#${g}`} className="inline-flex rounded-full @lg:rounded-md px-3.5 py-2.5 min-h-11 items-center font-semibold text-[length:var(--fs-15)] bg-eu-surface @lg:bg-transparent text-eu-ink-2 hover:bg-eu-chip">
                  {g}
                </a>
              </li>
            ))}
          </ul>
          <PageZone page="syxnes-erotiseis" zone="aside" preview={preview} className="hidden @lg:block mt-4" />
        </nav>
        <div className="max-w-[760px] grid gap-8">
          {groups.map((g) => (
            <section key={g} id={g}>
              <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-19)] mb-3">{g}</h2>
              <div className="grid gap-2">
                {faqs.filter((f) => f.group === g).map((f) => (
                  <details key={f.q} className="group rounded-lg border border-eu-line bg-white px-4">
                    <summary className="cursor-pointer list-none flex justify-between items-center gap-3 py-3 font-bold text-eu-ink text-[length:var(--fs-15)] min-h-11">
                      {f.q}
                      <span className="text-eu-blue group-open:rotate-45 transition-transform text-[length:var(--fs-19)] leading-none shrink-0">+</span>
                    </summary>
                    <p className="m-0 pb-3 text-eu-ink-2 text-[length:var(--fs-15)] leading-relaxed">{f.a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
          <PageZone page="syxnes-erotiseis" zone="after" preview={preview} />
          <PageZone page="syxnes-erotiseis" zone="aside" preview={preview} copy className="@lg:hidden" />
        </div>
      </div>
      <PageZone page="syxnes-erotiseis" zone="bottom" preview={preview} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </div>
  );
}
