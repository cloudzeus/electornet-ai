import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PageIntro } from "@/components/site/PageIntro";
import { getServicesFull } from "@/lib/data/repo";
import { priceLong } from "@/lib/format";

export const metadata: Metadata = { title: "Υπηρεσίες", description: "13 υπηρεσίες με τιμή: επέκταση εγγύησης, εγκατάσταση, παραλαβή σε 2 ώρες, ανακύκλωση, φύλαξη, service." };

/** Services hub: every service has a page, a price and a place in the buying journey (today: 13 unlinked image cards). */
export default async function ServicesPage() {
  const services = await getServicesFull();
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Υπηρεσίες" }]} />
      <PageIntro tone="dark" kicker="Δεκατρείς υπηρεσίες, καθεμία με τιμή" title="Γιατί από Euronics και όχι από marketplace" lead="Στη Euronics σε ξέρουμε με το όνομά σου. Η αγορά δεν τελειώνει στο κουμπί: εγκατάσταση, εγγύηση, service και ανακύκλωση από το κατάστημα της γειτονιάς σου." />
      <div className="eu-canvas eu-gutter py-8">
        <ul className="m-0 p-0 list-none grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3 gap-3">
          {services.map((s) => (
            <li key={s.slug}>
              <Link href={`/ypiresies/${s.slug}`} className="flex gap-3 h-full rounded-xl border border-eu-line bg-white p-4 hover:border-eu-blue group">
                <span className="font-extrabold text-eu-yellow-ink text-[length:var(--fs-14)] w-6 shrink-0 pt-0.5">{s.no}</span>
                <span className="flex-1 min-w-0">
                  <span className="flex justify-between gap-2 font-bold text-eu-ink text-[length:var(--fs-16)] leading-[1.25]">
                    {s.title}
                    <ArrowRight className="size-4 text-eu-blue shrink-0 transition-transform group-hover:translate-x-1" aria-hidden />
                  </span>
                  <span className="block text-eu-muted text-[length:var(--fs-14)] mt-1">{s.blurb}</span>
                  <span className="block text-eu-blue font-bold text-[length:var(--fs-14)] mt-2">{s.priceFrom ? `από ${priceLong(s.priceFrom)}` : "δωρεάν"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
