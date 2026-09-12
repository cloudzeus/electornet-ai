"use client";

import Link from "next/link";
import type { Product } from "@/lib/data/types";
import { discountPct, instalment, priceLong, priceShort } from "@/lib/format";
import { useCart } from "./CartProvider";
import { EnergyChip } from "./EnergyChip";
import { WishlistButton } from "./WishlistButton";
import { ProductImage } from "@/components/commerce/ProductImage";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("productRow");

/** List view row: image, key specs, price block and actions in one line. */
export function ProductRow({ product: p }: { product: Product }) {
  const { add, openQuickBuy } = useCart();
  const pct = discountPct(p.price, p.wasPrice);
  const keySpecs = (p.specs ?? []).slice(0, 4);
  return (
    <article className="bg-white rounded-lg shadow-[var(--shadow-card)] p-3.5 grid grid-cols-[96px_1fr] @md:grid-cols-[140px_1fr_220px] gap-4 items-start">
      <Link href={`/proion/${p.slug}`} className="block">
        <ProductImage src={p.image} sizes="140px" rounded="rounded-lg">
        {pct !== null && <span className="absolute top-0 left-0 bg-eu-red text-white font-extrabold text-[length:var(--fs-13)] px-2 py-1 rounded-br-md rounded-tl-md">−{pct}%</span>}
        </ProductImage>
      </Link>
      <div className="min-w-0">
        <div className="font-semibold text-eu-muted-2 text-[length:var(--fs-13)] tracking-wide">{p.brand}</div>
        <h3 className="m-0 font-bold text-eu-ink text-[length:var(--fs-16)] leading-[1.3]">
          <Link href={`/proion/${p.slug}`} className="hover:text-eu-blue">
            {p.title}
          </Link>
        </h3>
        <div className="flex flex-wrap gap-1.5 mt-2">{p.energy && <EnergyChip cls={p.energy.cls} fiche={p.energy.fiche} />}</div>
        {keySpecs.length > 0 && (
          <dl className="m-0 mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[length:var(--fs-14)]">
            {keySpecs.map((s) => (
              <div key={s.key} className="flex gap-1 min-w-0">
                <dt className="text-eu-muted-2 shrink-0">{s.key}:</dt>
                <dd className="m-0 text-eu-ink-2 truncate">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="@md:hidden mt-2 flex items-baseline gap-1.5">
          <span className="font-extrabold text-eu-ink text-[length:var(--fs-19)]">{priceShort(p.price)}</span>
          {p.wasPrice && <s className="text-eu-muted-2 text-[length:var(--fs-13-5)]">{priceShort(p.wasPrice)}</s>}
        </div>
      </div>
      <div className="col-span-2 @md:col-span-1 flex @md:flex-col gap-2 @md:gap-1.5 items-center @md:items-stretch">
        <div className="hidden @md:block">
          <div className="flex items-baseline gap-1.5">
            <span className="font-extrabold text-eu-ink text-[length:var(--fs-24)] leading-none">{priceShort(p.price)}</span>
            {p.wasPrice && <s className="text-eu-muted-2 text-[length:var(--fs-14)]">{priceShort(p.wasPrice)}</s>}
          </div>
          {p.lowest30 && <div className="text-eu-muted text-[length:var(--fs-13)] mt-1">Χαμηλότερη τιμή 30 ημερών: {priceLong(p.lowest30)}</div>}
          <div className="font-bold text-eu-blue text-[length:var(--fs-14)] mt-1 mb-2">ή 12 × {priceLong(instalment(p.price))} χωρίς κάρτα</div>
        </div>
        <button type="button" onClick={() => openQuickBuy(p)} className="flex-1 @md:flex-none rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] py-3 min-h-11 hover:bg-eu-blue">
          {c.agora_me_1_klik}
        </button>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => add(p)} className="flex-1 rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] py-2.5 min-h-11 hover:bg-eu-surface">
            {c.sto_kalathi}
          </button>
          <WishlistButton id={p.id} />
        </div>
      </div>
    </article>
  );
}
