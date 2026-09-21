"use client";


import Link from "next/link";
import Image from "next/image";
import { ViewTransition } from "react";
import { useRef } from "react";
import { Heart, Plus, Scale, Eye, MapPin } from "lucide-react";
import type { Product } from "@/lib/data/types";
import { instalment, priceLong, priceShort, weekday } from "@/lib/format";
import { useCart } from "./CartProvider";
import { EnergyChip } from "./EnergyChip";
import { FluidContent } from "@/components/fluid/Fluid";
import { ProductImage } from "@/components/commerce/ProductImage";
import { Tilt } from "@/components/motion/Tilt";
import { cutoutFor } from "@/lib/data/cutouts";
import { flyToCart } from "@/lib/motion/flyToCart";
import { CornerSticker, RibbonSticker, UrgencyPill, BurstSticker, ContestSticker, CustomSticker, stickersFor } from "./Stickers";
import { FitBadge } from "@/components/space/FitBadge";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("productCard");

/**
 * The product card: nine facts at one glance.
 *  1 discount (with euro saving)  2 brand apart from title  3 energy class +
 *  fiche (EU 2017/1369)  4 price / was-price  5 lowest 30-day price
 *  (Omnibus)  6 instalment without card  7 availability with colour AND
 *  date  8 Quick buy as the primary button  9 wishlist + compare & store stock.
 *
 * v4: the photo is a transparent cutout floating on a soft light field
 * (falls back to the framed photo when no cutout exists), the card tilts
 * with the pointer, stickers come from data (see Stickers.tsx), the Fit
 * badge answers «χωράει;» from the saved space, «add» flies the photo to
 * the cart, and the image morphs into the PDP gallery (View Transition).
 *
 * Adaptive: in a narrow container (<300px) the availability text
 * shortens and the buttons stack; nothing disappears. Every text ≥ 14px.
 */
export function ProductCard({ product: p, priority = false, dealEndsAt, tone = "light" }: { product: Product; priority?: boolean; dealEndsAt?: string; tone?: "light" | "dark" }) {
  const { add, openQuickBuy, openQuickView, wishlist, toggleWishlist, compare, toggleCompare } = useCart();
  const monthly = instalment(p.price);
  const liked = wishlist.includes(p.id);
  const compared = compare.includes(p.id);
  const cutout = cutoutFor(p.image);
  const imgRef = useRef<HTMLDivElement>(null);
  const stickers = stickersFor(p, dealEndsAt);
  const corner = stickers.find((s) => s.kind === "discount" || s.kind === "new" || s.kind === "renew");
  const ribbon = stickers.find((s) => s.kind === "gift" || s.kind === "bundle" || s.kind === "pick");
  const burst = stickers.find((s) => s.kind === "bogo" || s.kind === "cashback");
  const contest = stickers.find((s) => s.kind === "contest");
  const custom = stickers.find((s) => s.kind === "custom");
  const urgency = stickers.filter((s) => s.kind === "last" || s.kind === "ends");

  const avail = (() => {
    const a = p.availability;
    if (a.kind === "in-stock") return { color: "text-eu-green", dot: "bg-eu-green", text: a.label ?? `Άμεσα · παράδοση ${weekday(new Date(a.deliveryDate))}`, short: `Άμεσα · ${weekday(new Date(a.deliveryDate))}` };
    if (a.kind === "days") return { color: "text-eu-amber", dot: "bg-eu-amber", text: `Σε ${a.min}–${a.max} εργάσιμες · ${weekday(new Date(a.deliveryDate))}`, short: `${a.min}–${a.max} εργάσιμες` };
    return { color: "text-eu-muted", dot: "bg-eu-muted", text: a.label ?? "Κατόπιν παραγγελίας", short: p.noPrice ? "Στο κατάστημα" : "Κατόπιν παραγγελίας" };
  })();

  const onAdd = () => {
    flyToCart(imgRef.current);
    add(p, { openMiniCart: false });
  };

  return (
    <FluidContent as="div" className="eu-container h-full" fallback="md">
      {({ size }) => {
        const narrow = size === "xs" || size === "sm";
        return (
          <Tilt className="h-full" max={4}>
            <article className={`group/card bg-white rounded-2xl overflow-hidden flex flex-col h-full border transition-shadow duration-300 hover:shadow-[var(--shadow-overlay)] ${compared ? "border-eu-blue/50 shadow-[var(--shadow-card)]" : tone === "dark" ? "border-transparent shadow-[0_10px_30px_rgba(0,0,0,.25)]" : "border-eu-line shadow-[var(--shadow-card)]"}`}>
              <div className={`relative p-3 ${cutout ? "eu-cutout-field" : "bg-eu-surface-2"}`}>
                <Link href={`/proion/${p.slug}`} className="block" aria-label={`${p.brand} ${p.title}`}>
                  <ViewTransition name={`product-${p.id}`}>
                    <div ref={imgRef} data-tilt-layer className="relative aspect-square">
                      {cutout ? (
                        <Image src={cutout} alt="" fill sizes="(max-width: 640px) 50vw, 320px" priority={priority} className="object-contain p-[6%] eu-cutout-shadow transition-transform duration-500 ease-out group-hover/card:scale-[1.06]" />
                      ) : (
                        <ProductImage src={p.image} sizes="(max-width: 640px) 50vw, 320px" priority={priority} />
                      )}
                    </div>
                  </ViewTransition>
                </Link>
                {corner && (
                  <span className="absolute top-0 left-0 pointer-events-none">
                    <CornerSticker s={corner} compact={narrow} />
                  </span>
                )}
                {ribbon && <span className="absolute inset-0 overflow-hidden rounded-t-2xl pointer-events-none"><RibbonSticker s={ribbon} /></span>}
                {burst && <BurstSticker s={burst} />}
                {custom && <CustomSticker s={custom} />}
                {contest && (
                  <span className={`absolute left-3 ${corner ? "top-14" : "top-3"}`}>
                    <ContestSticker s={contest} />
                  </span>
                )}
                <button
                  type="button"
                  aria-pressed={liked}
                  aria-label={liked ? "Αφαίρεση από τη λίστα" : "Προσθήκη στη λίστα"}
                  onClick={() => toggleWishlist(p.id)}
                  className={`absolute top-2 right-2 size-11 rounded-full bg-white shadow-[var(--shadow-card)] inline-flex items-center justify-center transition-transform active:scale-90 ${liked ? "text-eu-red" : "text-eu-muted hover:text-eu-red"} ${ribbon ? "top-14" : ""}`}
                >
                  <Heart className={`size-5 transition-transform ${liked ? "scale-110" : ""}`} fill={liked ? "currentColor" : "none"} aria-hidden />
                </button>
                {!p.noPrice && <button type="button" onClick={() => openQuickView(p)} aria-label={c.grigori_provoli} className="absolute bottom-3 right-3 h-10 rounded-full bg-white/95 shadow-[var(--shadow-card)] text-eu-navy font-bold text-[length:var(--fs-14)] inline-flex items-center gap-1.5 px-3 hover:bg-eu-navy hover:text-white transition-colors @md:opacity-0 @md:translate-y-1 group-hover/card:opacity-100 group-hover/card:translate-y-0 focus-visible:opacity-100 duration-200">
                  <Eye className="size-4" aria-hidden /> <span className="hidden @md:inline">{c.grigori_provoli}</span>
                </button>}
                <div className="absolute bottom-3 left-4 flex gap-1.5">
                  {p.energy && <EnergyChip cls={p.energy.cls} fiche={p.energy.fiche} compact={narrow} />}
                  {!p.energy && p.rating && <span className="bg-white border border-eu-line text-eu-ink-2 font-semibold text-[length:var(--fs-14)] px-2 py-1 rounded-md">★ {p.rating.value.toLocaleString("el-GR")} · {p.rating.count}</span>}
                </div>
              </div>

              <div className="p-4 flex flex-col flex-1">
                <div className="font-bold text-eu-muted-2 text-[length:var(--fs-14)] tracking-wide mb-1 uppercase">{p.brand}</div>
                <h3 className="m-0 font-bold text-eu-ink text-[length:var(--fs-17)] leading-[1.3] line-clamp-2 min-h-[2.6em]">
                  <Link href={`/proion/${p.slug}`} className="hover:text-eu-blue">
                    {p.title}
                  </Link>
                </h3>
                <div className="flex items-baseline gap-2 mt-2.5">
                  <span className={`font-extrabold text-eu-ink leading-none tracking-[-0.02em] ${p.noPrice ? "text-[length:var(--fs-19)]" : "text-[length:var(--fs-27)]"}`}>{priceShort(p.price)}</span>
                  {p.wasPrice && <s className="font-medium text-eu-muted-2 text-[length:var(--fs-15)]">{priceShort(p.wasPrice)}</s>}
                </div>
                <div className="text-eu-muted text-[length:var(--fs-14)] leading-snug mt-1 min-h-[1.4em]">{p.lowest30 ? `Χαμηλότερη 30 ημερών: ${priceLong(p.lowest30)}` : p.promo?.kind === "bundle" ? `Δώρο μαζί: ${p.promo.with}` : p.gift ?? ""}</div>
                <div className="font-bold text-eu-blue text-[length:var(--fs-15)] my-2">{p.noPrice ? "Δόσεις χωρίς κάρτα · ρώτησε στο κατάστημα" : <>ή 12 × {priceLong(monthly)} χωρίς κάρτα</>}</div>
                <div className={`flex items-center flex-wrap gap-x-2 gap-y-1.5 font-bold text-[length:var(--fs-14)] mb-3 ${avail.color}`}>
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`size-2 rounded-full ${avail.dot}`} aria-hidden />
                    {narrow ? avail.short : avail.text}
                  </span>
                  {urgency.map((s) => (
                    <UrgencyPill key={s.kind} s={s} />
                  ))}
                  <FitBadge product={p} />
                </div>
                {p.noPrice ? (
                  <div className={`flex gap-2 mt-auto ${narrow ? "flex-col" : ""}`}>
                    <Link href={`/proion/${p.slug}`} className="flex-1 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] py-3 min-h-12 inline-flex items-center justify-center hover:bg-eu-blue transition-colors active:scale-[0.98]">Δες το προϊόν</Link>
                    <Link href="/katastimata" aria-label="Βρες κατάστημα" className={`rounded-full border-2 border-eu-navy text-eu-navy font-extrabold flex items-center justify-center min-h-12 hover:bg-eu-surface transition-colors ${narrow ? "w-full" : "w-12 shrink-0"}`}>
                      <MapPin className="size-5" aria-hidden />
                      {narrow && <span className="ml-1 text-[length:var(--fs-15)]">Βρες κατάστημα</span>}
                    </Link>
                  </div>
                ) : (
                <div className={`flex gap-2 mt-auto ${narrow ? "flex-col" : ""}`}>
                  <button type="button" onClick={() => openQuickBuy(p)} className="flex-1 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] py-3 min-h-12 hover:bg-eu-blue transition-colors active:scale-[0.98]">
                    {c.agora_me_1_klik}
                  </button>
                  <button type="button" onClick={onAdd} aria-label={c.prosthiki_sto_kalathi} className={`rounded-full border-2 border-eu-navy text-eu-navy font-extrabold flex items-center justify-center min-h-12 hover:bg-eu-surface transition-colors active:scale-95 ${narrow ? "w-full" : "w-12 shrink-0"}`}>
                    <Plus className="size-5" aria-hidden />
                    {narrow && <span className="ml-1 text-[length:var(--fs-15)]">{c.sto_kalathi}</span>}
                  </button>
                </div>
                )}
                <div className="flex justify-between items-center gap-2 mt-3 text-[length:var(--fs-14)]">
                  <label className={`inline-flex items-center gap-1.5 font-semibold cursor-pointer min-h-9 ${compared ? "text-eu-blue" : "text-eu-muted-2 hover:text-eu-blue"}`}>
                    <input type="checkbox" checked={compared} onChange={() => toggleCompare(p.id)} className="size-4 accent-eu-blue" />
                    <Scale className="size-4" aria-hidden /> {c.sygkrisi}
                  </label>
                  {!narrow && <span className="text-eu-muted-2 truncate">{p.tradeIn ? "Παραλαβή παλιάς" : p.storeStock ? `Σε ${p.storeStock} καταστήματα` : ""}</span>}
                </div>
              </div>
            </article>
          </Tilt>
        );
      }}
    </FluidContent>
  );
}
