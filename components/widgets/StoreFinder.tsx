import Image from "next/image";
import { NearestStoreCard } from "@/components/stores/NearestStoreCard";
import type { Store } from "@/lib/data/types";
import { ZoneBadge } from "@/components/site/ZoneBadge";
import { getSettings } from "@/lib/cms/settings";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("storeFinder");

/**
 * @dynamic Zone 10 — the network. The nearest store is picked on the server
 * from the request IP (city level, no prompt); GPS refinement only after the
 * user asks (GDPR). Real distance, «open now», 350 store pages behind it.
 */
export async function StoreFinder({ store, image, zoneNo, geoCity, geoSource = "fallback" }: { store: Store; image: string; zoneNo?: number; geoCity?: string; geoSource?: "ip" | "fallback" }) {
  const { site } = await getSettings();
  const near = { id: store.id, slug: store.slug, name: store.name, city: store.city, distanceKm: store.distanceKm, openUntil: store.openUntil, lat: store.lat, lng: store.lng };
  return (
    <section className="relative bg-eu-blue text-white eu-container" aria-labelledby="stores-title">
      <ZoneBadge no={zoneNo} />
      <div className="eu-canvas grid grid-cols-1 @lg:grid-cols-[1fr_40%]">
        <div className="eu-gutter py-8 @lg:py-9">
          <div className="font-extrabold text-eu-yellow text-[length:var(--fs-13)] tracking-wide mb-3">{c.to_diktyo}</div>
          <h2 id="stores-title" className="m-0 font-heading font-bold text-[length:var(--fs-32)] leading-[1.08] tracking-[-0.022em] mb-3">
            {site.brand.storesCount} καταστήματα.
            <br />
            {c.ena_einai_dipla_soy}
          </h2>
          <p className="m-0 text-eu-on-dark text-[length:var(--fs-16)] leading-[1.6] mb-5 max-w-[34em]">
            {c.apothema_se_pragmatiko_chrono}
          </p>
          <form action="/katastimata" className="flex gap-2 max-w-[430px] mb-3.5">
            <label htmlFor="store-q" className="sr-only">
              {c.tachydromikos_kodikas_i_poli}
            </label>
            <input id="store-q" name="q" placeholder={c.tachydromikos_kodikas_i_poli} className="flex-1 min-w-0 rounded-full bg-white text-eu-ink placeholder:text-eu-muted-2 px-4 py-3 text-[length:var(--fs-15)] outline-none focus-visible:ring-2 ring-eu-yellow" />
            <button type="submit" className="rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-15)] px-5 min-h-11 hover:bg-eu-yellow-dark">
              {c.vres}
            </button>
          </form>
          <NearestStoreCard initial={near} geoCity={geoCity} geoSource={geoSource} variant="button" />
        </div>
        <div className="relative bg-eu-blue-dark min-h-[260px] @lg:min-h-0">
          <Image src={image} alt={c.katastima_euronics} fill sizes="(max-width: 1024px) 100vw, 540px" className="object-cover" />
          <div className="absolute bottom-4 left-4 right-4 @lg:bottom-[18px] @lg:left-5 @lg:right-5">
            <NearestStoreCard initial={near} geoCity={geoCity} geoSource={geoSource} />
          </div>
        </div>
      </div>
    </section>
  );
}
