import type { Metadata } from "next";
import Image from "next/image";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { PageIntro } from "@/components/site/PageIntro";
import { StoreMap } from "@/components/stores/StoreMap";
import { StoreListItem } from "@/components/stores/StoreListItem";
import { getRegions, getStores } from "@/lib/data/repo";
import { geoFromRequest, storesNear, geoSourceLabel } from "@/lib/geo/ip";
import { LocateBar } from "@/components/stores/LocateBar";
import { NearestStoreCard } from "@/components/stores/NearestStoreCard";

export const metadata: Metadata = { title: "Καταστήματα Euronics", description: "350 καταστήματα-μέλη σε όλη την Ελλάδα: απόσταση, ωράριο, υπηρεσίες, παραλαβή σε 2 ώρες." };

const SERVICE_LABEL: Record<string, string> = { "click-collect": "Παραλαβή σε 2 ώρες", installation: "Εγκατάσταση", "service-point": "Service point", recycling: "Ανακύκλωση", parking: "Parking" };

/** Locator: real distance (from Athens centre in the demo), «open now», filters by prefecture and service, map + list in sync. */
export default async function StoresPage({ searchParams }: { searchParams: Promise<{ q?: string; region?: string; service?: string }> }) {
  const sp = await searchParams;
  const geo = await geoFromRequest();
  const [stores, regions] = await Promise.all([getStores({ q: sp.q, region: sp.region, service: sp.service }, geo), getRegions()]);
  const near = await storesNear(geo, 3);
  return (
    <div className="eu-container">
      <Breadcrumbs items={[{ label: "Καταστήματα" }]} />
      <PageIntro tone="blue" kicker="Το δίκτυο" title="350 καταστήματα. Ένα είναι δίπλα σου." lead="Καταστήματα-μέλη με απόθεμα, εγκατάσταση από τεχνικό της γειτονιάς και παραλαβή σε 2 ώρες." />
      <div className="eu-canvas eu-gutter py-6">
        {near.length > 0 && !sp.q && !sp.region && !sp.service && (
          <section className="mb-6 grid gap-3" aria-labelledby="near-title">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Κοντά σου</div>
                <h2 id="near-title" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-22)]">
                  {geo.source === "gps" ? "Τα πιο κοντινά σε εσένα" : geo.source === "manual" ? `Τα πιο κοντινά${geo.city ? ` σε ${geo.city}` : ""}` : geo.source === "ip" ? `Τα πιο κοντινά${geo.city ? ` στην περιοχή ${geo.city}` : ""}` : "Τα πιο κοντινά στην Αθήνα"}
                </h2>
              </div>
              <span className="text-eu-muted text-[length:var(--fs-14)]">{geo.source === "gps" ? "Ακριβής θέση από τη συσκευή σου" : geo.source === "manual" ? "Από την περιοχή που όρισες" : geo.source === "ip" ? "Εκτίμηση από το δίκτυό σου, χωρίς άδεια τοποθεσίας" : "Προεπιλογή, μέχρι να δώσεις τοποθεσία"}</span>
            </div>
            <div className="grid grid-cols-1 @lg:grid-cols-3 gap-3">
              {near.map((st, i) => (
                <div key={st.id} className={i === 0 ? "" : "hidden @lg:block"}>
                  <NearestStoreCard initial={{ id: st.id, slug: st.slug, name: st.name, city: st.city, distanceKm: st.distanceKm, openUntil: st.openUntil, lat: st.lat, lng: st.lng }} geoCity={geo.city} geoSource={geo.source} />
                </div>
              ))}
            </div>
          </section>
        )}
        <div className="mb-4"><LocateBar sourceLabel={geoSourceLabel(geo)} /></div>
        <form className="grid grid-cols-1 @md:grid-cols-[1fr_200px_200px_auto] gap-2 mb-5">
          <input name="q" defaultValue={sp.q} placeholder="Πόλη, Τ.Κ. ή όνομα καταστήματος" className="rounded-full border border-eu-line px-4 py-2.5 min-h-11 text-[length:var(--fs-15)]" aria-label="Αναζήτηση καταστήματος" />
          <select name="region" defaultValue={sp.region ?? ""} className="rounded-full border border-eu-line px-4 py-2.5 min-h-11 text-[length:var(--fs-15)] bg-white" aria-label="Νομός">
            <option value="">Όλοι οι νομοί</option>
            {regions.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <select name="service" defaultValue={sp.service ?? ""} className="rounded-full border border-eu-line px-4 py-2.5 min-h-11 text-[length:var(--fs-15)] bg-white" aria-label="Υπηρεσία">
            <option value="">Όλες οι υπηρεσίες</option>
            {Object.entries(SERVICE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-blue">
            Βρες
          </button>
        </form>
        <div className="grid grid-cols-1 @lg:grid-cols-[minmax(0,1fr)_1fr] gap-5 items-start">
          <div>
            <div className="text-eu-muted text-[length:var(--fs-15)] mb-2">
              <strong className="text-eu-ink">{stores.length}</strong> καταστήματα · ταξινόμηση κατά απόσταση από {geo.source === "gps" ? "εσένα" : geo.city ?? "την Αθήνα"}
            </div>
            <ul className="m-0 p-0 list-none grid gap-3">
              {stores.map((s) => (
                <StoreListItem key={s.id} s={s} serviceLabel={SERVICE_LABEL} />
              ))}
            </ul>
          </div>
          <div className="@lg:sticky @lg:top-4 order-first @lg:order-none">
            <StoreMap stores={stores.map((s) => ({ id: s.id, slug: s.slug, name: s.name, city: s.city, address: s.address, zip: s.zip, phone: s.phone, openUntil: s.openUntil, lat: s.lat, lng: s.lng }))} height={520} visitor={geo.source === "gps" || geo.source === "manual" ? { lat: geo.lat, lng: geo.lng, label: geo.source === "gps" ? "Η θέση σου" : geo.city ?? "Η περιοχή σου" } : null} />
            <div className="relative h-[140px] rounded-xl overflow-hidden mt-3">
              <Image src="/img/store-front.jpg" alt="Κατάστημα Euronics" fill sizes="600px" className="object-cover" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
