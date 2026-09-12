"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus, Zap } from "lucide-react";
import type { Product } from "@/lib/data/types";
import { discountPct, instalment, priceLong, priceShort } from "@/lib/format";
import { useCart } from "@/components/commerce/CartProvider";
import { Countdown } from "@/components/commerce/Countdown";
import { ProductImage } from "@/components/commerce/ProductImage";
import { cutoutFor } from "@/lib/data/cutouts";
import { Tilt } from "@/components/motion/Tilt";
import { flyToCart } from "@/lib/motion/flyToCart";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("dealTile");

/**
 * @dynamic Bento tile «Προσφορά ημέρας» (v4): the product as a floating
 * cutout on a light stage with rotating rays, the discount as a red corner
 * sticker with the euro saving, a real countdown plus a thin progress line
 * of the day that has passed, big price and Quick buy. Tilts with the
 * pointer; «+» flies the photo to the cart. Data: deal-of-day from the CMS
 * schedule, price/Omnibus from the ERP.
 */
export function DealOfDayTile({ product: p, endsAt }: { product: Product; endsAt: string }) {
  const { openQuickBuy, add } = useCart();
  const pct = discountPct(p.price, p.wasPrice);
  const cutout = cutoutFor(p.image);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const end = new Date(endsAt).getTime();
    const start = end - 24 * 3600 * 1000;
    const tick = () => setProgress(Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100)));
    const t = setTimeout(tick, 0);
    const i = setInterval(tick, 30000);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, [endsAt]);
  return (
    <Tilt max={3} className="h-full">
      <div className="group/deal relative h-full bg-white rounded-lg overflow-hidden shadow-[var(--shadow-card)] grid grid-rows-[auto_minmax(0,1fr)_auto] isolate">
        <div className="relative flex justify-between items-center px-4 pt-3.5 z-10">
          <span className="inline-flex items-center gap-1.5 font-extrabold text-eu-red text-[length:var(--fs-13)] tracking-wide uppercase">
            <Zap className="size-3.5" aria-hidden /> {c.prosfora_imeras}
          </span>
          <Countdown endsAt={endsAt} />
        </div>
        <div className="relative grid grid-cols-[minmax(0,1fr)_42%] gap-2 items-center px-4 py-2">
          <div className="min-w-0 relative z-10">
            <div className="font-medium text-eu-muted-2 text-[length:var(--fs-13)] uppercase">{p.brand}</div>
            <Link href={`/proion/${p.slug}`} className="block font-bold text-eu-ink text-[length:var(--fs-15)] leading-[1.3] line-clamp-2 hover:text-eu-blue">
              {p.title}
            </Link>
            <div className="flex items-baseline gap-2 mt-2 flex-wrap">
              <span className="font-heading font-extrabold text-eu-ink text-[length:var(--fs-28)] leading-none tracking-[-0.03em]">{priceShort(p.price)}</span>
              {p.wasPrice && <s className="font-medium text-eu-muted-2 text-[length:var(--fs-13-5)]">{priceShort(p.wasPrice)}</s>}
            </div>
            <div className="text-eu-muted text-[length:var(--fs-13)] leading-snug mt-1.5">
              {p.lowest30 && <>Χαμηλότερη 30 ημερών: {priceLong(p.lowest30)} · </>}12 × {priceLong(instalment(p.price))} χωρίς κάρτα
            </div>
          </div>
          <div className="relative aspect-square eu-cutout-field rounded-xl overflow-hidden" data-tilt-layer>
            <span className="eu-rays" style={{ width: "150%", left: "-25%", top: "-25%", opacity: 0.7 }} aria-hidden />
            {cutout ? (
              <Image src={cutout} alt="" fill sizes="180px" className="object-contain p-[6%] eu-cutout-shadow eu-float transition-transform duration-500 group-hover/deal:scale-110" />
            ) : (
              <ProductImage src={p.image} sizes="180px" className="w-full" frame={false} />
            )}
            {pct !== null && p.wasPrice && (
              <span className="absolute top-0 left-0 bg-eu-red text-white rounded-br-xl px-2 py-1 leading-none eu-shimmer">
                <span className="block font-extrabold text-[length:var(--fs-15)]">−{pct}%</span>
                <span className="block font-bold text-[length:var(--fs-14)] leading-none mt-0.5 opacity-95">−{Math.round(p.wasPrice - p.price)} €</span>
              </span>
            )}
          </div>
        </div>
        <div className="relative px-4 pb-3.5 grid gap-2.5">
          <div className="h-1 rounded-full bg-eu-surface-3 overflow-hidden" aria-hidden>
            <div className="h-full rounded-full bg-eu-yellow transition-[width] duration-1000" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => openQuickBuy(p)} className="flex-1 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] py-3 min-h-11 hover:bg-eu-blue">
              {c.agora_me_1_klik}
            </button>
            <button
              type="button"
              onClick={(e) => {
                flyToCart((e.currentTarget.closest(".group\\/deal") as HTMLElement)?.querySelector("[data-tilt-layer]") as HTMLElement | null);
                add(p, { openMiniCart: false });
              }}
              aria-label={c.prosthiki_sto_kalathi}
              className="w-[46px] rounded-full border-2 border-eu-navy text-eu-navy flex items-center justify-center min-h-11 hover:bg-eu-surface"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </Tilt>
  );
}
