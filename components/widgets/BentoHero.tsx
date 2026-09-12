import Image from "next/image";
import type { HeroSlide, Product, Store } from "@/lib/data/types";
import { CinematicHero } from "./CinematicHero";
import { DealOfDayTile } from "./DealOfDayTile";
import { StoreTile } from "./StoreTile";
import { ServicesTile } from "./ServicesTile";
import { ZoneBadge } from "@/components/site/ZoneBadge";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("bento");

interface Props {
  slides: HeroSlide[];
  deal: { product: Product; endsAt: string };
  store: Store;
  geoCity?: string;
  geoSource?: "ip" | "fallback";
  services: { title: string; blurb?: string }[];
  intervalMs?: number;
  zoneNo?: number;
}

/**
 * Zone 4 — bento grid instead of a hero. Four messages in one screen:
 * the cinematic campaign (2/3 width), the deal of the day as a stage with
 * countdown, the nearest store as a radar (IP → GPS), rotating services. Inspiration, transaction and the
 * physical network together — what a marketplace cannot copy.
 *
 * Adaptive: 2fr/1fr grid on the canvas; on tablets the side tiles go
 * side by side under the campaign; on phones a single column in the
 * order campaign → deal → store → services.
 */
export function BentoHero({ slides, deal, store, geoCity, geoSource = "fallback", services, intervalMs, zoneNo }: Props) {
  return (
    <section className="relative bg-eu-navy eu-container" aria-label={c.proteinomena}>
      <ZoneBadge no={zoneNo} />
      <div className="eu-full eu-gutter-wide py-3 @lg:py-3.5 grid grid-cols-1 @md:grid-cols-2 @lg:grid-cols-[2fr_1fr] @lg:grid-rows-[auto_auto] gap-3 @lg:gap-3.5">
        <div className="@md:col-span-2 @lg:col-span-1 @lg:row-span-2">
          <CinematicHero slides={slides} intervalMs={intervalMs} />
        </div>

        <DealOfDayTile product={deal.product} endsAt={deal.endsAt} />

        <div className="grid grid-rows-2 gap-3 @lg:gap-3.5">
          <StoreTile initial={{ id: store.id, slug: store.slug, name: store.name, city: store.city, distanceKm: store.distanceKm, openUntil: store.openUntil, lat: store.lat, lng: store.lng }} geoCity={geoCity} geoSource={geoSource} />
          <ServicesTile services={services} />
        </div>
      </div>
      <span className="sr-only">
        <Image src="/design/star.svg" alt="" width={1} height={1} />
      </span>
    </section>
  );
}
