"use client";
import { compareScope } from "@/lib/data/compare-scope";


import { useState } from "react";
import Link from "next/link";
import { X, Heart, Scale, Minus, Plus, ArrowRight, Check } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useCart } from "./CartProvider";
import { ProductImage } from "./ProductImage";
import { EnergyChip } from "./EnergyChip";
import {
  discountPct,
  instalment,
  priceLong,
  priceShort,
  weekday,
} from "@/lib/format";
import { attributesOf } from "@/lib/data/attributes";
import type { Product } from "@/lib/data/types";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("quickView");

/**
 * Quick view — the product summary in a modal, so a customer can check
 * facts, price and delivery and add to cart without leaving the list.
 * Same hierarchy as the PDP buy box: photos, key facts, price + Omnibus,
 * instalments, availability, quantity, the two actions, wishlist and
 * compare. «Όλες οι λεπτομέρειες» goes to the full page.
 */
export function QuickViewSheet() {
  const { quickView: p, closeQuickView } = useCart();
  return (
    <Dialog open={!!p} onOpenChange={(o) => !o && closeQuickView()}>
      {p && <Body key={p.id} p={p} />}
    </Dialog>
  );
}

/** Keyed by product id so image index and quantity reset per product without effects. */
function Body({ p }: { p: Product }) {
  const {
    closeQuickView,
    add,
    openQuickBuy,
    wishlist,
    toggleWishlist,
    compare,
    toggleCompare,
  } = useCart();
  const [i, setI] = useState(0);
  const [qty, setQty] = useState(1);
  const images = p.images?.length ? p.images : p.image ? [p.image] : [];
  const pct = discountPct(p.price, p.wasPrice);
  const facts = attributesOf(p)
    .filter((a) => !["Μάρκα", "Κατάσταση"].includes(a.key))
    .slice(0, 6);
  const a = p.availability;
  const avail =
    a.kind === "in-stock"
      ? {
          c: "text-eu-green",
          d: "bg-eu-green",
          t: `Άμεσα διαθέσιμο · παράδοση ${weekday(new Date(a.deliveryDate))}`,
        }
      : a.kind === "days"
        ? {
            c: "text-eu-amber",
            d: "bg-eu-amber",
            t: `Σε ${a.min}–${a.max} εργάσιμες · ${weekday(new Date(a.deliveryDate))}`,
          }
        : {
            c: "text-eu-muted",
            d: "bg-eu-muted",
            t: a.label ?? "Κατόπιν παραγγελίας",
          };
  const liked = wishlist.includes(p.id);
  const compared = compare.includes(p.id);

  return (
    <DialogContent
      showCloseButton={false}
      className="p-0 gap-0 sm:max-w-[960px] max-w-[calc(100%-1.5rem)] max-h-[92dvh] overflow-y-auto rounded-2xl text-[length:var(--fs-16)] text-eu-ink eu-container"
    >
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-eu-line-2 sticky top-0 bg-white z-10">
        <DialogTitle className="m-0 font-extrabold text-eu-ink text-[length:var(--fs-15)]">
          {c.grigori_provoli}
        </DialogTitle>
        <button
          type="button"
          onClick={closeQuickView}
          className="inline-flex items-center gap-1 text-eu-muted-2 font-semibold text-[length:var(--fs-14)] min-h-11 px-2 hover:text-eu-ink"
        >
          {c.kleisimo} <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-1 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-5 @2xl:gap-8 p-5 @2xl:p-6">
        <div className="grid gap-3">
          <ProductImage
            src={images[i] ?? null}
            sizes="(max-width: 640px) 90vw, 440px"
            pad="p-[7%]"
          >
            {pct !== null && (
              <span className="absolute top-0 left-0 bg-eu-red text-white font-extrabold text-[length:var(--fs-15)] px-3 py-1.5 rounded-br-xl rounded-tl-xl">
                −{pct}%
              </span>
            )}
            {p.energy && (
              <div className="absolute bottom-3 left-3">
                <EnergyChip cls={p.energy.cls} fiche={p.energy.fiche} />
              </div>
            )}
          </ProductImage>
          {images.length > 1 && (
            <ul className="m-0 p-0 list-none flex flex-wrap gap-2">
              {images.map((im, k) => (
                <li key={im} className="shrink-0">
                  <button
                    type="button"
                    aria-label={`Εικόνα ${k + 1}`}
                    aria-pressed={k === i}
                    onClick={() => setI(k)}
                    className={`block rounded-lg border-2 ${k === i ? "border-eu-blue" : "border-transparent hover:border-eu-line"}`}
                  >
                    <ProductImage
                      src={im}
                      sizes="64px"
                      className="size-16"
                      rounded="rounded-md"
                      frame={false}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-4 content-start min-w-0">
          <div>
            <div className="font-bold text-eu-muted-2 text-[length:var(--fs-14)] uppercase tracking-wide">
              {p.brand}
            </div>
            <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)] leading-tight">
              {p.title}
            </h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[length:var(--fs-14)] text-eu-muted">
              {p.rating && (
                <span>
                  <span className="text-eu-yellow-dark">★</span>{" "}
                  {p.rating.value.toLocaleString("el-GR")} · {p.rating.count}{" "}
                  αξιολογήσεις
                </span>
              )}
              <span>Κωδικός {p.sku}</span>
            </div>
          </div>

          {facts.length > 0 && (
            <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl bg-eu-surface p-4">
              {facts.map((f) => (
                <div key={f.key} className="min-w-0 text-[length:var(--fs-14)]">
                  <dt className="text-eu-muted truncate">{f.key}</dt>
                  <dd className="m-0 font-bold text-eu-ink truncate">
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <div>
            <div className="flex items-end gap-3 flex-wrap">
              <span className="font-extrabold text-eu-ink text-[length:var(--fs-36)] leading-none tracking-[-0.02em]">
                {priceShort(p.price)}
              </span>
              {p.wasPrice && (
                <s className="pb-1 text-eu-muted-2 text-[length:var(--fs-17)]">
                  {priceShort(p.wasPrice)}
                </s>
              )}
            </div>
            <div className="text-eu-muted text-[length:var(--fs-14)] mt-1">
              {p.lowest30
                ? `Χαμηλότερη τιμή 30 ημερών: ${priceLong(p.lowest30)} · `
                : ""}
              με ΦΠΑ 24%
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="rounded-xl bg-eu-chip p-3">
                <div className="font-extrabold text-eu-blue text-[length:var(--fs-16)]">
                  12 × {priceLong(instalment(p.price))}
                </div>
                <div className="text-eu-muted text-[length:var(--fs-13-5)]">
                  {c.choris_karta}
                </div>
              </div>
              <div className="rounded-xl bg-eu-surface p-3">
                <div className="font-extrabold text-eu-ink text-[length:var(--fs-16)]">
                  24 × {priceLong(instalment(p.price, 24))}
                </div>
                <div className="text-eu-muted text-[length:var(--fs-13-5)]">
                  {c.atoka_me_karta}
                </div>
              </div>
            </div>
          </div>

          <div
            className={`flex items-center gap-2 font-bold text-[length:var(--fs-15)] ${avail.c}`}
          >
            <span className={`size-2.5 rounded-full ${avail.d}`} aria-hidden />{" "}
            {avail.t}
            {p.storeStock ? (
              <span className="text-eu-muted font-normal">
                · σε {p.storeStock} καταστήματα
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex items-center border border-eu-line rounded-full">
              <button
                type="button"
                aria-label={c.ligotera}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="size-11 inline-flex items-center justify-center rounded-l-full hover:bg-eu-surface"
              >
                <Minus className="size-4" aria-hidden />
              </button>
              <span className="w-8 text-center font-bold tabular-nums">
                {qty}
              </span>
              <button
                type="button"
                aria-label={c.perissotera}
                onClick={() => setQty((q) => Math.min(9, q + 1))}
                className="size-11 inline-flex items-center justify-center rounded-r-full hover:bg-eu-surface"
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </div>
            <span className="text-eu-muted text-[length:var(--fs-14)]">
              Σύνολο{" "}
              <strong className="text-eu-ink text-[length:var(--fs-17)]">
                {priceLong(qty * p.price)}
              </strong>
            </span>
          </div>

          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => {
                closeQuickView();
                openQuickBuy(p);
              }}
              className="rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-16)] min-h-[52px] hover:bg-eu-yellow-dark"
            >
              {c.agora_me_1_klik}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  add(p, { qty, openMiniCart: true });
                  closeQuickView();
                }}
                className="flex-1 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-16)] min-h-[52px] hover:bg-eu-blue"
              >
                {c.prosthiki_sto_kalathi}
              </button>
              <button
                type="button"
                aria-pressed={liked}
                aria-label={c.lista_epithymion}
                onClick={() => toggleWishlist(p.id)}
                className={`size-[52px] rounded-full border-2 inline-flex items-center justify-center ${liked ? "border-eu-red text-eu-red" : "border-eu-line text-eu-muted hover:text-eu-red"}`}
              >
                <Heart
                  className="size-5"
                  fill={liked ? "currentColor" : "none"}
                  aria-hidden
                />
              </button>
              <button
                type="button"
                aria-pressed={compared}
                aria-label={c.sygkrisi}
                onClick={() => toggleCompare(p.id, compareScope(p))}
                className={`size-[52px] rounded-full border-2 inline-flex items-center justify-center ${compared ? "border-eu-blue text-eu-blue bg-eu-chip" : "border-eu-line text-eu-muted hover:text-eu-blue"}`}
              >
                {compared ? (
                  <Check className="size-5" aria-hidden />
                ) : (
                  <Scale className="size-5" aria-hidden />
                )}
              </button>
            </div>
          </div>

          <Link
            href={`/proion/${p.slug}`}
            onClick={closeQuickView}
            className="inline-flex items-center gap-1.5 font-extrabold text-eu-blue text-[length:var(--fs-15)] hover:underline min-h-10"
          >
            Όλες οι λεπτομέρειες, χαρακτηριστικά και αξιολογήσεις{" "}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </DialogContent>
  );
}
