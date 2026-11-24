import type { Product } from "@/lib/data/types";
import { ProductCard } from "@/components/commerce/ProductCard";
import { CardCarousel } from "@/components/commerce/CardCarousel";
import { Countdown } from "@/components/commerce/Countdown";
import { ZoneBadge } from "@/components/site/ZoneBadge";
import { StarLight } from "@/components/motion/StarLight";
import { Spotlight } from "@/components/motion/Spotlight";

/**
 * Zone 7 — offers with a real expiry, on a navy stage: ambient light, the
 * star with rays behind the title, cards that rise in one by one and tilt
 * with the pointer, stickers from data (discount with euro saving,
 * «Λήγει σε…», «Τελευταία N»). As many cards as fit, one card per step.
 */
export function DealsRail({ products, endsAt, label, title, zoneNo }: { products: Product[]; endsAt: string; label: string; title: string; zoneNo?: number }) {
  return (
    <section className="relative bg-eu-navy text-white eu-container overflow-hidden isolate" aria-labelledby="deals-title">
      <span className="eu-ambient" aria-hidden />
      <Spotlight />
      <StarLight size={72} className="left-[-8px] top-[-10px] @lg:left-[2%] @lg:top-[6%]" />
      <ZoneBadge no={zoneNo} />
      <div className="relative eu-canvas eu-gutter py-8 @lg:py-[40px]">
        <div className="flex items-end justify-between gap-4 mb-6" data-reveal>
          <div className="pl-10 @lg:pl-14">
            <div data-look="kicker" className="font-extrabold text-eu-yellow text-[length:var(--fs-13)] tracking-wide mb-2">{label}</div>
            <h2 id="deals-title" data-look="title" className="m-0 font-heading font-extrabold text-white text-[length:var(--fs-36)] @lg:text-[length:var(--fs-44)] leading-[1.02] tracking-[-0.03em]">
              {title}
            </h2>
          </div>
          <Countdown endsAt={endsAt} variant="blocks" tone="dark" className="shrink-0" />
        </div>
        <CardCarousel label={title}>
          {products.map((p, i) => (
            <div key={p.id} data-reveal className="h-full">
              <ProductCard product={p} priority={i < 2} dealEndsAt={endsAt} tone="dark" />
            </div>
          ))}
        </CardCarousel>
      </div>
    </section>
  );
}
