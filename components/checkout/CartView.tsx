"use client";

import { useState } from "react";
import Link from "next/link";
import { Minus, Plus, Trash2, Heart, ShieldCheck, Truck, RotateCcw, Store as StoreIcon, Sparkles, Tag, Check, ChevronRight } from "lucide-react";
import type { Product, Service } from "@/lib/data/types";
import { instalment, priceLong, priceShort, weekday } from "@/lib/format";
import { useCart } from "@/components/commerce/CartProvider";
import { Stepper } from "./Stepper";
import { ProductCard } from "@/components/commerce/ProductCard";
import { CardCarousel } from "@/components/commerce/CardCarousel";
import { ProductImage } from "@/components/commerce/ProductImage";
import { CartAdvisorTip } from "./CartAdvisorTip";

/**
 * Cart. One card per line with a large image, availability with date,
 * add-on services as tappable chips (warranty extension, e-support,
 * installation), quantity, «κράτα για αργότερα» → wishlist. Free-shipping
 * progress in yellow, coupon, totals with VAT breakdown, instalments,
 * three ways to get it, trust strip and a «ταιριάζουν με το καλάθι σου»
 * grid. Text ≥ 14px, controls ≥ 44px.
 */
export function CartView({ services, crossSell }: { services: Service[]; crossSell: Product[] }) {
  const { lines, setQty, remove, toggleAddon, subtotal, addonsTotal, hydrated, clear, freeShippingFrom, toggleWishlist, wishlist } = useCart();
  const [coupon, setCoupon] = useState("");
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const goods = subtotal + addonsTotal;
  const shipping = goods >= freeShippingFrom || goods === 0 ? 0 : 4.9;
  const total = Math.max(0, goods - discount) + shipping;
  const vat = total - total / 1.24;
  const missing = Math.max(0, freeShippingFrom - goods);
  const pct = Math.min(100, Math.round((goods / freeShippingFrom) * 100));
  const count = lines.reduce((n, l) => n + l.qty, 0);

  const applyCoupon = () => {
    const c = coupon.trim().toUpperCase();
    if (c === "EURONICS10") {
      setDiscount(Math.round(goods * 0.1 * 100) / 100);
      setCouponMsg("Κουπόνι EURONICS10: −10% στα προϊόντα.");
    } else if (c.startsWith("GIFT")) {
      setDiscount(Math.min(goods, 50));
      setCouponMsg("Κάρτα δώρου 50,00 € εξαργυρώθηκε.");
    } else {
      setDiscount(0);
      setCouponMsg("Ο κωδικός δεν ισχύει. Δοκίμασε EURONICS10.");
    }
  };

  if (!hydrated) return <div className="eu-canvas eu-gutter py-12 text-eu-muted text-[length:var(--fs-16)]">Φόρτωση καλαθιού…</div>;

  if (lines.length === 0)
    return (
      <div className="eu-canvas eu-gutter py-8 pb-14">
        <Stepper step={1} />
        <div className="rounded-3xl bg-eu-navy text-white p-8 @md:p-12 text-center relative overflow-hidden">
          <div className="absolute -top-16 -right-16 size-64 rounded-full bg-eu-blue/40" aria-hidden />
          <div className="absolute -bottom-20 -left-10 size-56 rounded-full bg-eu-yellow/20" aria-hidden />
          <div className="relative">
            <div className="font-extrabold text-eu-yellow text-[length:var(--fs-14)] tracking-wide mb-2">Καλάθι</div>
            <h1 className="m-0 font-heading font-bold text-[length:var(--fs-30)] mb-2">Το καλάθι σου είναι άδειο</h1>
            <p className="m-0 text-eu-on-dark text-[length:var(--fs-17)] max-w-[40em] mx-auto">Δες τις προσφορές της εβδομάδας, ή άσε τον έξυπνο οδηγό να βρει τη σωστή τηλεόραση, υπολογιστή ή κλιματιστικό για σένα.</p>
            <div className="flex flex-wrap justify-center gap-2.5 mt-6">
              <Link href="/prosfores" className="rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-16)] px-6 min-h-12 inline-flex items-center hover:bg-eu-yellow-dark">
                Προσφορές της εβδομάδας
              </Link>
              <Link href="/odigos-agoras" className="rounded-full border-2 border-white/60 text-white font-extrabold text-[length:var(--fs-16)] px-6 min-h-12 inline-flex items-center gap-2 hover:bg-white/10">
                <Sparkles className="size-4 text-eu-yellow" aria-hidden /> Έξυπνος οδηγός αγοράς
              </Link>
            </div>
          </div>
        </div>
        {crossSell.length > 0 && (
          <section className="mt-10" aria-label="Δημοφιλή">
            <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-22)] mb-4">Δημοφιλή αυτή την εβδομάδα</h2>
            <CardCarousel label="Δημοφιλή">
              {crossSell.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </CardCarousel>
          </section>
        )}
      </div>
    );

  return (
    <div className="eu-canvas eu-gutter pb-14">
      <Stepper step={1} />
      <div className="grid grid-cols-1 @3xl:grid-cols-[minmax(0,1fr)_360px] @5xl:grid-cols-[minmax(0,1fr)_420px] gap-6 @3xl:gap-8 items-start">
        <div className="min-w-0 eu-container grid gap-4">
          <div className="flex items-end justify-between gap-3">
            <h1 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-30)] leading-none">
              Καλάθι <span className="text-eu-muted-2 font-semibold text-[length:var(--fs-18)]">· {count} {count === 1 ? "προϊόν" : "προϊόντα"}</span>
            </h1>
            <button type="button" onClick={clear} className="text-eu-muted font-semibold text-[length:var(--fs-14)] hover:text-eu-red min-h-10">
              Άδειασμα
            </button>
          </div>

          <div className={`rounded-2xl p-4 @md:p-5 ${missing === 0 ? "bg-eu-green text-white" : "bg-eu-yellow text-eu-navy"}`}>
            <div className="flex items-center gap-3">
              <Truck className="size-6 shrink-0" aria-hidden />
              <div className="flex-1 font-bold text-[length:var(--fs-16)]">
                {missing === 0 ? "Έχεις δωρεάν μεταφορικά." : <>Πρόσθεσε ακόμη <strong className="text-[length:var(--fs-18)]">{priceLong(missing)}</strong> για δωρεάν μεταφορικά.</>}
              </div>
              <span className="font-extrabold text-[length:var(--fs-15)] tabular-nums">{pct}%</span>
            </div>
            <div className="mt-3 h-2.5 rounded-full bg-black/10 overflow-hidden">
              <div className={`h-full rounded-full transition-[width] ${missing === 0 ? "bg-white" : "bg-eu-navy"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>

          <ul className="m-0 p-0 list-none grid gap-3">
            {lines.map((l) => {
              const p = l.product;
              const lineAddons = services.filter((s) => s.slug !== "paradosi-egkatastasi" || p.installation).filter((s) => s.addonAt?.includes("pdp") || s.addonAt?.includes("checkout"));
              const lineTotal = l.qty * (p.price + l.addons.reduce((a, x) => a + x.price, 0));
              const a = p.availability;
              const avail = a.kind === "in-stock" ? { c: "text-eu-green", d: "bg-eu-green", t: `Άμεσα διαθέσιμο · παράδοση ${weekday(new Date(a.deliveryDate))}` } : a.kind === "days" ? { c: "text-eu-amber", d: "bg-eu-amber", t: `Σε ${a.min}–${a.max} εργάσιμες · ${weekday(new Date(a.deliveryDate))}` } : { c: "text-eu-muted", d: "bg-eu-muted", t: a.label ?? "Κατόπιν παραγγελίας" };
              const liked = wishlist.includes(p.id);
              return (
                <li key={p.id + (l.variant ?? "")} className="min-w-0 bg-white rounded-2xl border border-eu-line shadow-[var(--shadow-card)] p-4 @md:p-5 grid grid-cols-[96px_minmax(0,1fr)] @md:grid-cols-[140px_minmax(0,1fr)_auto] gap-4 @md:gap-5">
                  <Link href={`/proion/${p.slug}`} className="block self-start">
                    <ProductImage src={p.image} sizes="140px">{p.wasPrice && <span className="absolute top-0 left-0 bg-eu-red text-white font-extrabold text-[length:var(--fs-13)] px-2 py-1 rounded-br-lg rounded-tl-xl">−{Math.round((1 - p.price / p.wasPrice) * 100)}%</span>}</ProductImage>
                  </Link>
                  <div className="min-w-0 grid gap-2 content-start">
                    <div>
                      <div className="font-bold text-eu-muted-2 text-[length:var(--fs-13)] uppercase tracking-wide">{p.brand}</div>
                      <Link href={`/proion/${p.slug}`} className="font-bold text-eu-ink text-[length:var(--fs-17)] leading-[1.3] hover:text-eu-blue line-clamp-2">
                        {p.title}
                      </Link>
                      {l.variant && <div className="text-eu-ink-2 text-[length:var(--fs-14)] mt-0.5">{l.variant}</div>}
                    </div>
                    <div className={`flex items-center gap-1.5 text-[length:var(--fs-14)] font-bold ${avail.c}`}>
                      <span className={`size-2 rounded-full ${avail.d}`} aria-hidden /> {avail.t}
                    </div>
                    {lineAddons.length > 0 && (
                      <div className="grid gap-1.5">
                        <div className="text-eu-ink text-[length:var(--fs-14)] font-bold flex items-center gap-1.5">
                          <ShieldCheck className="size-4 text-eu-blue" aria-hidden /> Κάλυψέ το
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {lineAddons.map((s) => {
                            const on = l.addons.some((x) => x.slug === s.slug);
                            return (
                              <button
                                key={s.slug}
                                type="button"
                                aria-pressed={on}
                                onClick={() => toggleAddon(p.id, { slug: s.slug, title: s.title, price: s.priceFrom ?? 0 })}
                                className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 min-h-10 text-[length:var(--fs-14)] font-semibold max-w-full text-left py-1.5 ${on ? "border-eu-blue bg-eu-chip text-eu-blue" : "border-eu-line text-eu-ink-2 hover:border-eu-blue"}`}
                              >
                                {on ? <Check className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
                                {s.title} <span className={on ? "text-eu-blue" : "text-eu-muted"}>{s.priceFrom ? `+${priceShort(s.priceFrom)}` : "δωρεάν"}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-3 @md:hidden">
                      <Qty qty={l.qty} onChange={(q) => setQty(p.id, q)} />
                      <span className="font-extrabold text-eu-ink text-[length:var(--fs-18)]">{priceLong(lineTotal)}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--fs-14)] font-semibold">
                      <button type="button" onClick={() => toggleWishlist(p.id)} className={`inline-flex items-center gap-1 min-h-9 ${liked ? "text-eu-red" : "text-eu-muted hover:text-eu-red"}`}>
                        <Heart className="size-4" fill={liked ? "currentColor" : "none"} aria-hidden /> {liked ? "Στη λίστα" : "Κράτα για αργότερα"}
                      </button>
                      <button type="button" onClick={() => remove(p.id)} className="inline-flex items-center gap-1 text-eu-muted hover:text-eu-red min-h-9">
                        <Trash2 className="size-4" aria-hidden /> Αφαίρεση
                      </button>
                    </div>
                  </div>
                  <div className="hidden @md:flex flex-col items-end gap-2 min-w-[120px]">
                    <span className="font-extrabold text-eu-ink text-[length:var(--fs-22)] leading-none">{priceLong(lineTotal)}</span>
                    {p.wasPrice && <s className="text-eu-muted-2 text-[length:var(--fs-14)]">{priceLong(l.qty * p.wasPrice)}</s>}
                    <span className="text-eu-blue font-semibold text-[length:var(--fs-14)]">ή 12 × {priceLong(instalment(lineTotal))}</span>
                    <Qty qty={l.qty} onChange={(q) => setQty(p.id, q)} />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="grid grid-cols-1 @xl:grid-cols-3 gap-3">
            {[
              { icon: Truck, t: "Στη διεύθυνσή σου", s: shipping === 0 ? "Δωρεάν · 1–3 εργάσιμες" : "4,90 € · 1–3 εργάσιμες" },
              { icon: StoreIcon, t: "Παραλαβή από κατάστημα", s: "Δωρεάν · έτοιμη σε 2 ώρες" },
              { icon: RotateCcw, t: "Άλλαξες γνώμη;", s: "14 ημέρες δωρεάν επιστροφή" },
            ].map((x) => (
              <div key={x.t} className="rounded-xl bg-eu-surface p-4 flex items-center gap-3">
                <x.icon className="size-6 text-eu-blue shrink-0" aria-hidden />
                <div>
                  <div className="font-bold text-eu-ink text-[length:var(--fs-15)]">{x.t}</div>
                  <div className="text-eu-muted text-[length:var(--fs-14)]">{x.s}</div>
                </div>
              </div>
            ))}
          </div>

          <CartAdvisorTip lines={lines} subtotal={subtotal} freeShippingFrom={freeShippingFrom} />
          <Link href="/proionta" className="inline-flex items-center gap-1 font-bold text-eu-blue text-[length:var(--fs-15)] hover:underline min-h-10">
            ← Συνέχισε τις αγορές
          </Link>
        </div>

        <aside className="bg-white rounded-2xl border border-eu-line shadow-[var(--shadow-card)] overflow-hidden @3xl:sticky @3xl:top-16" aria-label="Σύνοψη">
          <div className="bg-eu-navy text-white px-5 py-4 flex items-center justify-between">
            <h2 className="m-0 font-extrabold text-[length:var(--fs-17)]">Σύνοψη</h2>
            <span className="text-eu-on-dark text-[length:var(--fs-14)]">{count} τεμ.</span>
          </div>
          <div className="p-5 grid gap-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                applyCoupon();
              }}
              className="grid gap-1.5"
            >
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden />
                  <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="Κουπόνι ή κάρτα δώρου" aria-label="Κουπόνι" className="w-full min-w-0 rounded-xl border-2 border-eu-line pl-10 pr-3 min-h-12 text-[length:var(--fs-15)] focus-visible:border-eu-blue outline-none" />
                </div>
                <button type="submit" className="rounded-xl border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-15)] px-4 min-h-12 hover:bg-eu-surface">
                  Εφαρμογή
                </button>
              </div>
              {couponMsg && <div className={`text-[length:var(--fs-14)] font-semibold ${discount ? "text-eu-green" : "text-eu-red"}`}>{couponMsg}</div>}
            </form>
            <dl className="m-0 grid gap-2 text-[length:var(--fs-15)] text-eu-ink-2">
              <Row k="Προϊόντα" v={priceLong(subtotal)} />
              {addonsTotal > 0 && <Row k="Υπηρεσίες" v={priceLong(addonsTotal)} />}
              {discount > 0 && <Row k="Έκπτωση" v={`− ${priceLong(discount)}`} cls="text-eu-green" />}
              <Row k="Μεταφορικά" v={shipping === 0 ? "Δωρεάν" : priceLong(shipping)} cls={shipping === 0 ? "text-eu-green" : ""} />
              <Row k="ΦΠΑ 24% (περιλαμβάνεται)" v={priceLong(vat)} cls="text-eu-muted-2 text-[length:var(--fs-14)]" />
              <div className="flex justify-between items-baseline border-t-2 border-eu-line pt-3 mt-1">
                <dt className="font-extrabold text-eu-ink text-[length:var(--fs-17)]">Σύνολο</dt>
                <dd className="m-0 font-extrabold text-eu-ink text-[length:var(--fs-28)] leading-none">{priceLong(total)}</dd>
              </div>
            </dl>
            <div className="rounded-xl bg-eu-chip text-eu-blue px-4 py-3 text-[length:var(--fs-14)] font-bold">
              ή 12 × {priceLong(instalment(total))} χωρίς κάρτα <span className="font-normal text-eu-ink-2">· έως 24 άτοκες με κάρτα</span>
            </div>
            <Link href="/checkout" className="rounded-full bg-eu-yellow text-eu-navy text-center font-extrabold text-[length:var(--fs-17)] py-4 min-h-14 inline-flex items-center justify-center gap-1 hover:bg-eu-yellow-dark">
              Ολοκλήρωση αγοράς <ChevronRight className="size-5" aria-hidden />
            </Link>
            <div className="grid grid-cols-3 gap-1.5">
              {["Apple Pay", "Google Pay", "IRIS"].map((t) => (
                <Link key={t} href="/checkout" className="rounded-full border-2 border-eu-line text-eu-ink font-bold text-[length:var(--fs-14)] min-h-11 inline-flex items-center justify-center hover:border-eu-navy">
                  {t}
                </Link>
              ))}
            </div>
            <ul className="m-0 p-0 list-none grid gap-2 text-[length:var(--fs-14)] text-eu-muted">
              <li className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-eu-green shrink-0" aria-hidden /> Ασφαλής πληρωμή με 3D Secure
              </li>
              <li className="flex items-center gap-2">
                <StoreIcon className="size-4 text-eu-green shrink-0" aria-hidden /> Επιστροφή σε 350 καταστήματα
              </li>
            </ul>
          </div>
        </aside>
      </div>

      <section className="mt-12" aria-label="Ταιριάζουν με το καλάθι σου">
        <div className="flex items-end justify-between gap-3 mb-4">
          <div>
            <div className="font-extrabold text-eu-blue text-[length:var(--fs-14)] tracking-wide mb-1">Μία αποστολή, ένα κόστος μεταφορικών</div>
            <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)]">Ταιριάζουν με το καλάθι σου</h2>
          </div>
        </div>
        <CardCarousel label="Ταιριάζουν με το καλάθι σου">
          {crossSell.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </CardCarousel>
      </section>
    </div>
  );
}

function Qty({ qty, onChange }: { qty: number; onChange: (q: number) => void }) {
  return (
    <div className="inline-flex items-center border-2 border-eu-line rounded-full bg-white">
      <button type="button" aria-label="Λιγότερα" onClick={() => onChange(qty - 1)} className="size-11 inline-flex items-center justify-center rounded-l-full hover:bg-eu-surface">
        <Minus className="size-4" aria-hidden />
      </button>
      <span className="w-8 text-center font-extrabold tabular-nums text-[length:var(--fs-16)]">{qty}</span>
      <button type="button" aria-label="Περισσότερα" onClick={() => onChange(qty + 1)} className="size-11 inline-flex items-center justify-center rounded-r-full hover:bg-eu-surface">
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}

function Row({ k, v, cls = "" }: { k: string; v: string; cls?: string }) {
  return (
    <div className={`flex justify-between gap-3 ${cls}`}>
      <dt>{k}</dt>
      <dd className="m-0 font-semibold">{v}</dd>
    </div>
  );
}
