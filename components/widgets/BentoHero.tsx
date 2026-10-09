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
  /** null: δεν υπάρχει πραγματική προσφορά σήμερα — το πλακίδιο δεν εμφανίζεται */
  deal: { product: Product; endsAt: string } | null;
  store: Store;
  geoCity?: string;
  geoSource?: "ip" | "fallback" | "gps" | "manual";
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
      <div className={`eu-full p-3 @lg:p-3.5 grid grid-cols-1 @md:grid-cols-2 @5xl:grid-cols-[2fr_1fr] ${deal ? "@5xl:grid-rows-[auto_auto]" : "@5xl:grid-rows-[auto_minmax(0,1fr)]"} gap-3 @lg:gap-3.5`}>
        <div className="@md:col-span-2 @5xl:col-span-1 @5xl:row-span-2">
          <CinematicHero slides={slides} intervalMs={intervalMs} />
        </div>

        {deal ? (
          <>
            <DealOfDayTile product={deal.product} endsAt={deal.endsAt} />
            <div className="grid grid-rows-2 gap-3 @lg:gap-3.5">
              <StoreTile initial={{ id: store.id, slug: store.slug, name: store.name, city: store.city, distanceKm: store.distanceKm, openUntil: store.openUntil, lat: store.lat, lng: store.lng }} geoCity={geoCity} geoSource={geoSource} />
              <ServicesTile services={services} />
            </div>
          </>
        ) : (
          // Χωρίς προσφορά ημέρας: κατάστημα και υπηρεσίες γίνονται οι δύο σειρές δίπλα στο hero — παίρνουν το ύψος του
          // αντί να το φουσκώνουν (το εσωτερικό grid-rows-2 εξίσωνε τις σειρές και μεγάλωνε όλο το hero).
          <>
            <StoreTile initial={{ id: store.id, slug: store.slug, name: store.name, city: store.city, distanceKm: store.distanceKm, openUntil: store.openUntil, lat: store.lat, lng: store.lng }} geoCity={geoCity} geoSource={geoSource} />
            {/* desktop: όλη η λίστα δίπλα στο hero · tablet/κινητό: το μικρό πλακίδιο με εναλλαγή */}
            <ServicesTile services={services} className="@5xl:hidden" />
            <ServicesTile services={services} list className="hidden @5xl:grid" />
          </>
        )}
      </div>
      <span className="sr-only">
        <Image src="/design/star.svg" alt="" width={1} height={1} />
      </span>
    </section>
  );
}
