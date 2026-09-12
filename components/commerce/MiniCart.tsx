"use client";


import Link from "next/link";
import { Minus, Plus, Trash2, X, Check, Truck, ShieldCheck, RotateCcw, ChevronRight, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { Product } from "@/lib/data/types";
import { useCart } from "./CartProvider";
import { instalment, priceLong, priceShort } from "@/lib/format";
import { ProductImage } from "@/components/commerce/ProductImage";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("miniCart");

/**
 * Mini-cart drawer, same hierarchy as the PDP buy box and the checkout
 * summary: navy header with the confirmation, the line that was just
 * added highlighted, free-shipping progress in yellow/green, lines with
 * framed photos and quantity, «ταιριάζει με» suggestions, a summary with
 * shipping and instalments, the yellow checkout action and the trust
 * strip. Nothing under 14px, every control ≥ 44px.
 */
export function MiniCart({ suggestions = [] }: { suggestions?: Product[] }) {
  const { miniOpen, setMiniOpen, lines, count, subtotal, addonsTotal, setQty, remove, lastAdded, add, freeShippingFrom } = useCart();
  const goods = subtotal + addonsTotal;
  const shipping = goods >= freeShippingFrom || goods === 0 ? 0 : 4.9;
  const missing = Math.max(0, freeShippingFrom - goods);
  const pct = Math.min(100, Math.round((goods / freeShippingFrom) * 100));
  const inCart = new Set(lines.map((l) => l.product.id));
  const picks = suggestions.filter((s) => !inCart.has(s.id)).slice(0, 3);

  return (
    <Sheet open={miniOpen} onOpenChange={setMiniOpen}>
      <SheetContent side="right" className="w-full p-0 gap-0 border-0 shadow-[var(--shadow-overlay)] text-eu-ink eu-container" style={{ maxWidth: "min(100vw, 480px)" }} showCloseButton={false}>
        <div className="flex flex-col h-full">
          <div className="bg-eu-navy text-white px-5 py-4 flex items-center justify-between gap-3">
            <SheetTitle className="m-0 font-extrabold text-white text-[length:var(--fs-17)] flex items-center gap-2 whitespace-nowrap min-w-0">
              {lastAdded ? (
                <>
                  <span className="size-7 rounded-full bg-eu-green inline-flex items-center justify-center">
                    <Check className="size-4" aria-hidden />
                  </span>
                  {c.prostethike_sto_kalathi}
                </>
              ) : (
                "Το καλάθι σου"
              )}
              <span className="text-eu-on-dark font-semibold text-[length:var(--fs-14)] shrink-0">· {count} τεμ.</span>
            </SheetTitle>
            <button type="button" onClick={() => setMiniOpen(false)} aria-label={c.kleisimo} className="size-11 rounded-full inline-flex items-center justify-center text-white/80 hover:bg-white/10 hover:text-white">
              <X className="size-5" aria-hidden />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {lines.length === 0 ? (
              <div className="p-8 text-center">
                <p className="m-0 font-bold text-eu-ink text-[length:var(--fs-17)]">{c.to_kalathi_soy_einai}</p>
                <Link href="/proionta" onClick={() => setMiniOpen(false)} className="inline-flex mt-4 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-15)] px-6 min-h-12 items-center">
                  {c.des_ta_proionta}
                </Link>
              </div>
            ) : (
              <>
                <div className={`mx-5 mt-4 rounded-xl px-4 py-3 ${missing === 0 ? "bg-eu-green text-white" : "bg-eu-yellow text-eu-navy"}`}>
                  <div className="flex items-center gap-2 font-bold text-[length:var(--fs-14)]">
                    <Truck className="size-5 shrink-0" aria-hidden />
                    <span className="flex-1">{missing === 0 ? "Έχεις δωρεάν μεταφορικά." : <>{c.akomi} <strong>{priceLong(missing)}</strong> {c.gia_dorean_metaforika}</>}</span>
                    <span className="tabular-nums">{pct}%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-black/10 overflow-hidden">
                    <div className={`h-full rounded-full ${missing === 0 ? "bg-white" : "bg-eu-navy"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <ul className="m-0 p-0 list-none px-5 py-3 grid gap-2">
                  {lines.map((l) => {
                    const p = l.product;
                    const isNew = lastAdded?.id === p.id;
                    const lineTotal = l.qty * (p.price + l.addons.reduce((n, x) => n + x.price, 0));
                    return (
                      <li key={p.id + (l.variant ?? "")} className={`min-w-0 rounded-xl border-2 p-3 grid grid-cols-[80px_minmax(0,1fr)] gap-3 ${isNew ? "border-eu-green bg-eu-green/5" : "border-eu-line-2"}`}>
                        <Link href={`/proion/${p.slug}`} onClick={() => setMiniOpen(false)} className="block self-start">
                          <ProductImage src={p.image} sizes="80px" className="size-20" rounded="rounded-lg" />
                        </Link>
                        <div className="min-w-0 grid gap-1.5 content-start">
                          <div>
                            <div className="font-bold text-eu-muted-2 text-[length:var(--fs-13)] uppercase tracking-wide">{p.brand}</div>
                            <Link href={`/proion/${p.slug}`} onClick={() => setMiniOpen(false)} className="font-bold text-eu-ink text-[length:var(--fs-15)] leading-[1.3] line-clamp-2 hover:text-eu-blue">
                              {p.title}
                            </Link>
                            {l.variant && <div className="text-eu-muted text-[length:var(--fs-14)]">{l.variant}</div>}
                          </div>
                          {l.addons.map((x) => (
                            <div key={x.slug} className="text-eu-blue text-[length:var(--fs-14)] flex items-center gap-1">
                              <Check className="size-3.5" aria-hidden /> {x.title} · {x.price ? priceLong(x.price) : "δωρεάν"}
                            </div>
                          ))}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="inline-flex items-center border border-eu-line rounded-full bg-white">
                              <button type="button" aria-label={c.ligotera} onClick={() => setQty(p.id, l.qty - 1)} className="size-10 inline-flex items-center justify-center hover:bg-eu-surface rounded-l-full">
                                <Minus className="size-4" aria-hidden />
                              </button>
                              <span className="w-7 text-center font-extrabold text-[length:var(--fs-15)] tabular-nums">{l.qty}</span>
                              <button type="button" aria-label={c.perissotera} onClick={() => setQty(p.id, l.qty + 1)} className="size-10 inline-flex items-center justify-center hover:bg-eu-surface rounded-r-full">
                                <Plus className="size-4" aria-hidden />
                              </button>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="font-extrabold text-eu-ink text-[length:var(--fs-17)]">{priceLong(lineTotal)}</span>
                              <button type="button" aria-label={c.afairesi} onClick={() => remove(p.id)} className="size-10 inline-flex items-center justify-center text-eu-muted-2 hover:text-eu-red">
                                <Trash2 className="size-4" aria-hidden />
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {picks.length > 0 && (
                  <div className="px-5 pb-4">
                    <div className="font-extrabold text-eu-ink text-[length:var(--fs-15)] mb-2 flex items-center gap-1.5">
                      <Sparkles className="size-4 text-eu-yellow-dark" aria-hidden /> {c.tairiazei_me_to_kalathi}
                    </div>
                    <ul className="m-0 p-0 list-none grid gap-2">
                      {picks.map((s) => (
                        <li key={s.id} className="flex items-center gap-3 rounded-xl border border-eu-line-2 p-2.5">
                          <ProductImage src={s.image} sizes="56px" className="size-14" rounded="rounded-md" />
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-eu-ink text-[length:var(--fs-14)] leading-tight line-clamp-2">{s.title}</div>
                            <div className="font-extrabold text-eu-ink text-[length:var(--fs-15)]">{priceShort(s.price)}</div>
                          </div>
                          <button type="button" onClick={() => add(s, { openMiniCart: true })} className="rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] px-3.5 min-h-10 inline-flex items-center gap-1 hover:bg-eu-surface shrink-0">
                            <Plus className="size-4" aria-hidden /> {c.prosthiki}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>

          {lines.length > 0 && (
            <div className="border-t border-eu-line px-5 py-4 bg-white grid gap-3 shadow-[0_-8px_24px_rgba(18,42,88,0.08)]">
              <dl className="m-0 grid gap-1.5 text-[length:var(--fs-15)] text-eu-ink-2">
                <div className="flex justify-between">
                  <dt>{c.proionta_ypiresies}</dt>
                  <dd className="m-0 font-semibold">{priceLong(goods)}</dd>
                </div>
                <div className={`flex justify-between ${shipping === 0 ? "text-eu-green" : ""}`}>
                  <dt>{c.metaforika}</dt>
                  <dd className="m-0 font-semibold">{shipping === 0 ? "Δωρεάν" : priceLong(shipping)}</dd>
                </div>
                <div className="flex justify-between items-baseline border-t border-eu-line pt-2">
                  <dt className="font-extrabold text-eu-ink text-[length:var(--fs-16)]">{c.synolo}</dt>
                  <dd className="m-0 font-extrabold text-eu-ink text-[length:var(--fs-24)] leading-none">{priceLong(goods + shipping)}</dd>
                </div>
              </dl>
              <div className="text-eu-blue font-bold text-[length:var(--fs-14)]">ή 12 × {priceLong(instalment(goods + shipping))} χωρίς κάρτα · έως 24 άτοκες με κάρτα</div>
              <Link href="/checkout" onClick={() => setMiniOpen(false)} className="rounded-full bg-eu-yellow text-eu-navy text-center font-extrabold text-[length:var(--fs-16)] min-h-[52px] inline-flex items-center justify-center gap-1 hover:bg-eu-yellow-dark">
                {c.oloklirosi_agoras} <ChevronRight className="size-5" aria-hidden />
              </Link>
              <div className="flex gap-2">
                <Link href="/kalathi" onClick={() => setMiniOpen(false)} className="flex-1 rounded-full border-2 border-eu-navy text-eu-navy text-center font-extrabold text-[length:var(--fs-15)] min-h-12 inline-flex items-center justify-center hover:bg-eu-surface">
                  {c.des_to_kalathi}
                </Link>
                <button type="button" onClick={() => setMiniOpen(false)} className="flex-1 rounded-full text-eu-blue font-extrabold text-[length:var(--fs-15)] min-h-12 hover:bg-eu-surface">
                  {c.synechise_tis_agores}
                </button>
              </div>
              <ul className="m-0 p-0 list-none flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--fs-13-5)] text-eu-muted">
                <li className="flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-eu-green" aria-hidden /> 3D Secure
                </li>
                <li className="flex items-center gap-1.5">
                  <RotateCcw className="size-4 text-eu-green" aria-hidden /> {c.epistrofi_mesa_se_14}
                </li>
                <li className="flex items-center gap-1.5">
                  <Truck className="size-4 text-eu-green" aria-hidden /> {c.paralavi_se_2_ores}
                </li>
              </ul>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
