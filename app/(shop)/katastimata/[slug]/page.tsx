import type { Metadata } from "next";
import { StoreMap } from "@/components/stores/StoreMap";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { getStoreBySlug, getStores, listProducts } from "@/lib/data/repo";
import { ProductRail } from "@/components/pdp/ProductRail";

const SERVICE_LABEL: Record<string, string> = { "click-collect": "Παραλαβή σε 2 ώρες", installation: "Εγκατάσταση από τεχνικό", "service-point": "Service point", recycling: "Ανακύκλωση ΑΗΗΕ", parking: "Δωρεάν parking" };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = await getStoreBySlug((await params).slug);
  return s ? { title: `Euronics ${s.city} — ${s.name}`, description: `${s.address}, ${s.zip} ${s.city}. Ωράριο, τηλέφωνο, υπηρεσίες, παραλαβή σε 2 ώρες.` } : {};
}

/** One of the 350 static store pages with LocalBusiness JSON-LD — the biggest untapped local-SEO asset. */
export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await getStoreBySlug(slug);
  if (!s) notFound();
  const [nearby, deals] = await Promise.all([getStores({ region: s.region }), listProducts({ sale: true, perPage: 8 })]);
  const ld = {
    "@context": "https://schema.org",
    "@type": "ElectronicsStore",
    name: `Euronics ${s.city} — ${s.name}`,
    address: { "@type": "PostalAddress", streetAddress: s.address, postalCode: s.zip, addressLocality: s.city, addressRegion: s.region, addressCountry: "GR" },
    telephone: s.phone,
    email: s.email,
    geo: { "@type": "GeoCoordinates", latitude: s.lat, longitude: s.lng },
    openingHoursSpecification: s.hours.filter((h) => h.open !== "—").map((h) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: h.day, opens: h.open, closes: h.close })),
    parentOrganization: { "@type": "Organization", name: "MEGA ELECTRICS ΑΕΒΕ (Euronics Ελλάδα)" },
  };
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Καταστήματα", href: "/katastimata" }, { label: `${s.city} — ${s.name}` }]} />
      <div className="eu-canvas eu-gutter pb-12 grid grid-cols-1 @lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        <div className="grid gap-5">
          <StoreMap stores={[{ id: s.id, slug: s.slug, name: s.name, city: s.city, address: s.address, zip: s.zip, phone: s.phone, openUntil: s.openUntil, lat: s.lat, lng: s.lng }]} height={300} single />
          <div>
            <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide mb-1">Κατάστημα-μέλος Euronics · {s.region}</div>
            <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)] leading-[1.1]">
              Euronics {s.city} — {s.name}
            </h1>
            <p className="m-0 mt-2 text-eu-ink-2 text-[length:var(--fs-16)]">
              {s.address}, {s.zip} {s.city} · {s.distanceKm.toLocaleString("el-GR")} km από το κέντρο
            </p>
          </div>
          <section className="grid grid-cols-1 @md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-eu-line p-4">
              <h2 className="m-0 font-bold text-eu-ink text-[length:var(--fs-16)] mb-2">Ωράριο</h2>
              <table className="w-full text-[length:var(--fs-15)]">
                <tbody>
                  {s.hours.map((h) => (
                    <tr key={h.day}>
                      <td className="py-0.5 text-eu-muted">{h.day}</td>
                      <td className="py-0.5 text-eu-ink font-semibold text-right">{h.open === "—" ? "Κλειστά" : `${h.open} – ${h.close}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-white rounded-xl border border-eu-line p-4">
              <h2 className="m-0 font-bold text-eu-ink text-[length:var(--fs-16)] mb-2">Υπηρεσίες στο κατάστημα</h2>
              <ul className="m-0 p-0 list-none grid gap-1 text-[length:var(--fs-15)] text-eu-ink-2">
                {s.services.map((sv) => (
                  <li key={sv} className="flex gap-2">
                    <span className="text-eu-green font-extrabold">✓</span> {SERVICE_LABEL[sv]}
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <section className="bg-eu-surface rounded-xl p-5">
            <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-19)] mb-1">Παράγγειλε online, παράλαβε εδώ σε 2 ώρες</h2>
            <p className="m-0 text-eu-ink-2 text-[length:var(--fs-15)]">Στο checkout επίλεξε «Παραλαβή από κατάστημα» και αυτό το κατάστημα. Όταν το προϊόν υπάρχει στο απόθεμα, είναι έτοιμο σε 2 ώρες.</p>
          </section>
          <ProductRail title="Προσφορές διαθέσιμες στο κατάστημα" products={deals.items} />
        </div>
        <aside className="grid gap-3 @lg:sticky @lg:top-4">
          <div className="bg-eu-navy text-white rounded-xl p-5 grid gap-2 text-[length:var(--fs-15)]">
            <div className="font-extrabold text-eu-yellow text-[length:var(--fs-13)] tracking-wide">Επικοινωνία</div>
            {s.phone && (
              <a href={`tel:${s.phone}`} className="font-bold text-[length:var(--fs-16)] hover:text-eu-yellow">
                {s.phone}
              </a>
            )}
            {s.email && (
              <a href={`mailto:${s.email}`} className="text-eu-on-dark hover:text-white break-all">
                {s.email}
              </a>
            )}
            <a href={`https://maps.google.com/?q=${s.lat},${s.lng}`} target="_blank" rel="noreferrer" className="mt-2 rounded-full bg-eu-yellow text-eu-navy text-center font-extrabold text-[length:var(--fs-15)] py-3 min-h-11 inline-flex items-center justify-center hover:bg-eu-yellow-dark">
              Οδηγίες στο Google Maps
            </a>
          </div>
          <div className="bg-white rounded-xl border border-eu-line p-4">
            <h2 className="m-0 font-bold text-eu-ink text-[length:var(--fs-16)] mb-2">Κοντινά καταστήματα · {s.region}</h2>
            <ul className="m-0 p-0 list-none grid gap-1.5 text-[length:var(--fs-15)]">
              {nearby.filter((n) => n.id !== s.id).slice(0, 5).map((n) => (
                <li key={n.id}>
                  <Link href={`/katastimata/${n.slug}`} className="text-eu-ink-2 hover:text-eu-blue">
                    {n.city} — {n.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </div>
  );
}
