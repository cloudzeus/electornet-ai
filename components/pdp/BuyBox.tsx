"use client";


import { useMemo, useState } from "react";
import Link from "next/link";
import { Minus, Plus, Store as StoreIcon, Truck, CalendarClock, Package } from "lucide-react";
import type { Product, Service, Store } from "@/lib/data/types";
import { discountPct, instalment, priceLong, priceShort, weekday } from "@/lib/format";
import { useCart, type CartAddon } from "@/components/commerce/CartProvider";
import { WishlistButton, CompareCheckbox } from "@/components/commerce/WishlistButton";
import { ProductImage } from "@/components/commerce/ProductImage";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("buybox");

/**
 * Sticky buy box. Price + Omnibus 30-day price, instalments with and
 * without card, variants with price per option, availability with date,
 * store selector with real-time stock, delivery choice, and the
 * «Ολοκληρωμένη λύση» bundle: warranty extension, e-support and an
 * accessory with a running total. Quick buy is the primary action.
 */
export function BuyBox({ product: p, addons, stores, accessory }: { product: Product; addons: Service[]; stores: Store[]; accessory?: Product | null }) {
  const { add, openQuickBuy } = useCart();
  const [qty, setQty] = useState(1);
  const [sel, setSel] = useState<Record<string, string>>(() => Object.fromEntries((p.variants ?? []).map((v) => [v.name, v.options[0].label])));
  const [chosen, setChosen] = useState<CartAddon[]>([]);
  const [withAcc, setWithAcc] = useState(false);
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [ful, setFul] = useState<"courier" | "store" | "appointment">(p.installation ? "appointment" : "courier");

  const price = useMemo(() => {
    let pr = p.price;
    for (const v of p.variants ?? []) {
      const o = v.options.find((x) => x.label === sel[v.name]);
      if (o?.price) pr = o.price;
    }
    return pr;
  }, [p, sel]);
  const pct = discountPct(price, p.wasPrice);
  const variantLabel = Object.values(sel).join(" · ") || undefined;
  const store = stores.find((s) => s.id === storeId);
  const storeQty = store ? Math.max(0, ((p.storeStock ?? 0) + Number(store.id.replace(/\D/g, ""))) % 7) : 0;
  const a = p.availability;
  const date = a.kind === "order" ? null : weekday(new Date(a.deliveryDate));
  const avail = a.kind === "in-stock" ? { c: "text-eu-green", dot: "bg-eu-green", t: "Άμεσα διαθέσιμο" } : a.kind === "days" ? { c: "text-eu-amber", dot: "bg-eu-amber", t: `Διαθέσιμο σε ${a.min}–${a.max} εργάσιμες` } : { c: "text-eu-muted", dot: "bg-eu-muted", t: a.label ?? "Κατόπιν παραγγελίας" };

  const toggleAddon = (s: Service) => {
    const x: CartAddon = { slug: s.slug, title: s.title, price: s.priceFrom ?? 0 };
    setChosen((c) => (c.some((y) => y.slug === s.slug) ? c.filter((y) => y.slug !== s.slug) : [...c, x]));
  };
  const extras = chosen.reduce((n, x) => n + x.price, 0);
  const total = qty * (price + extras) + (withAcc && accessory ? accessory.price : 0);
  const hasSolution = extras > 0 || (withAcc && !!accessory);

  const addAll = () => {
    add({ ...p, price }, { qty, addons: chosen, variant: variantLabel, openMiniCart: true });
    if (withAcc && accessory) add(accessory, { openMiniCart: false });
  };

  const box = "rounded-xl border-2 p-3.5 cursor-pointer";
  return (
    <aside className="min-w-0 w-full bg-white rounded-2xl border border-eu-line shadow-[var(--shadow-raised)] p-5 @lg:p-6 grid gap-5" aria-label={c.agora}>
      <div>
        <div className="flex items-end gap-3 flex-wrap">
          <span className="font-extrabold text-eu-ink text-[length:var(--fs-44)] leading-none tracking-[-0.02em]">{priceShort(price)}</span>
          {p.wasPrice && (
            <span className="pb-1.5 flex items-center gap-2">
              <s className="text-eu-muted-2 text-[length:var(--fs-18)]">{priceShort(p.wasPrice)}</s>
              {pct !== null && <span className="bg-eu-red text-white font-extrabold text-[length:var(--fs-14)] px-2 py-1 rounded-md">−{pct}%</span>}
            </span>
          )}
        </div>
        <div className="text-eu-muted text-[length:var(--fs-14)] mt-1.5">
          {p.lowest30 ? `Χαμηλότερη τιμή 30 ημερών: ${priceLong(p.lowest30)} · ` : ""}με ΦΠΑ 24%
        </div>
        {p.gift && <div className="text-eu-blue font-bold text-[length:var(--fs-15)] mt-1">{p.gift}</div>}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="rounded-xl bg-eu-chip p-3.5">
            <div className="font-extrabold text-eu-blue text-[length:var(--fs-18)]">12 × {priceLong(instalment(price))}</div>
            <div className="text-eu-muted text-[length:var(--fs-13-5)]">{c.choris_karta_eurobank}</div>
          </div>
          <div className="rounded-xl bg-eu-surface p-3.5">
            <div className="font-extrabold text-eu-ink text-[length:var(--fs-18)]">24 × {priceLong(instalment(price, 24))}</div>
            <div className="text-eu-muted text-[length:var(--fs-13-5)]">{c.atoka_me_karta}</div>
          </div>
        </div>
      </div>

      {p.variants?.map((v) => (
        <fieldset key={v.name} className="m-0 p-0 border-0 min-w-0">
          <legend className="font-bold text-eu-ink text-[length:var(--fs-15)] mb-2">
            {v.name}: <span className="font-normal text-eu-muted">{sel[v.name]}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {v.options.map((o) => {
              const on = sel[v.name] === o.label;
              return (
                <button key={o.label} type="button" aria-pressed={on} onClick={() => setSel((s) => ({ ...s, [v.name]: o.label }))} className={`inline-flex items-center gap-2 rounded-full border-2 px-4 py-2 min-h-11 text-[length:var(--fs-14)] font-semibold ${on ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line text-eu-ink hover:border-eu-blue"}`}>
                  {o.swatch && <span className="size-4 rounded-full border border-black/10" style={{ background: o.swatch }} aria-hidden />}
                  {o.label}
                  {o.price && o.price !== p.price && <span className={on ? "text-eu-yellow" : "text-eu-muted"}>{priceShort(o.price)}</span>}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className={`flex items-center gap-2 font-bold text-[length:var(--fs-15)] ${avail.c}`}>
        <span className={`size-2.5 rounded-full ${avail.dot}`} aria-hidden />
        {avail.t}
        {date && <span className="text-eu-muted font-normal">· παράδοση {date}</span>}
      </div>

      <fieldset className="m-0 p-0 border-0 min-w-0 grid gap-2">
        <legend className="font-bold text-eu-ink text-[length:var(--fs-15)] mb-2">{c.pos_to_theleis}</legend>
        <label className={`${box} ${ful === "courier" ? "border-eu-blue bg-eu-chip" : "border-eu-line"}`}>
          <span className="flex items-center gap-2 font-bold text-eu-ink text-[length:var(--fs-15)]">
            <input type="radio" name="ful" checked={ful === "courier"} onChange={() => setFul("courier")} className="accent-eu-blue size-4" />
            <Truck className="size-5 text-eu-blue" aria-hidden /> {c.sti_dieythynsi_moy}
            <span className="ml-auto text-eu-green">{price >= 100 ? "Δωρεάν" : "4,90 €"}</span>
          </span>
        </label>
        <label className={`${box} ${ful === "store" ? "border-eu-blue bg-eu-chip" : "border-eu-line"}`}>
          <span className="flex items-center gap-2 font-bold text-eu-ink text-[length:var(--fs-15)]">
            <input type="radio" name="ful" checked={ful === "store"} onChange={() => setFul("store")} className="accent-eu-blue size-4" />
            <StoreIcon className="size-5 text-eu-blue" aria-hidden /> {c.paralavi_apo_katastima}
            <span className="ml-auto text-eu-green">{c.dorean}</span>
          </span>
          {ful === "store" && (
            <div className="mt-2 grid gap-1.5 pl-6">
              <select value={storeId} onChange={(e) => setStoreId(e.target.value)} aria-label={c.katastima} className="w-full min-w-0 rounded-md border border-eu-line px-3 py-2 text-[length:var(--fs-14)] min-h-11 bg-white">
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.city} — {s.name}
                  </option>
                ))}
              </select>
              {store && (
                <div className="text-[length:var(--fs-14)] text-eu-ink-2">
                  {storeQty > 0 ? <span className="text-eu-green font-bold">{storeQty} τεμ. · έτοιμο σε 2 ώρες</span> : <span className="text-eu-amber font-bold">{c.metafora_sto_katastima_1}</span>} · {store.distanceKm} km ·{" "}
                  <Link href={`/katastimata/${store.slug}`} className="text-eu-blue underline">
                    {c.orario}
                  </Link>
                </div>
              )}
            </div>
          )}
        </label>
        {p.installation && (
          <label className={`${box} ${ful === "appointment" ? "border-eu-blue bg-eu-chip" : "border-eu-line"}`}>
            <span className="flex items-center gap-2 font-bold text-eu-ink text-[length:var(--fs-15)]">
              <input type="radio" name="ful" checked={ful === "appointment"} onChange={() => setFul("appointment")} className="accent-eu-blue size-4" />
              <CalendarClock className="size-5 text-eu-blue" aria-hidden /> {c.me_rantevoy_egkatastasi}
              <span className="ml-auto text-eu-blue">{c.apo_60}</span>
            </span>
            <span className="block text-eu-muted text-[length:var(--fs-13-5)] pl-6 mt-1">{c.technikos_toy_katastimatos_tis}</span>
          </label>
        )}
      </fieldset>

      {(addons.length > 0 || accessory) && (
        <fieldset className="m-0 p-0 border-0 min-w-0 grid gap-2">
          <legend className="flex items-center gap-2 font-bold text-eu-ink text-[length:var(--fs-15)] mb-2">
            <Package className="size-5 text-eu-yellow-dark" aria-hidden /> {c.olokliromeni_lysi}
          </legend>
          {addons.map((s) => {
            const on = chosen.some((x) => x.slug === s.slug);
            return (
              <label key={s.slug} className={`${box} flex items-start gap-2.5 ${on ? "border-eu-blue bg-eu-chip" : "border-eu-line hover:border-eu-blue"}`}>
                <input type="checkbox" checked={on} onChange={() => toggleAddon(s)} className="mt-1 size-4 accent-eu-blue" />
                <span className="flex-1 min-w-0">
                  <span className="flex justify-between gap-2 font-bold text-eu-ink text-[length:var(--fs-15)]">
                    {s.title}
                    <span className="text-eu-blue shrink-0">{s.priceFrom ? `+ ${priceLong(s.priceFrom)}` : "δωρεάν"}</span>
                  </span>
                  <span className="block text-eu-muted text-[length:var(--fs-13-5)]">{s.blurb}</span>
                </span>
              </label>
            );
          })}
          {accessory && (
            <label className={`${box} flex items-start gap-2.5 ${withAcc ? "border-eu-blue bg-eu-chip" : "border-eu-line hover:border-eu-blue"}`}>
              <input type="checkbox" checked={withAcc} onChange={() => setWithAcc((v) => !v)} className="mt-1 size-4 accent-eu-blue" />
              <ProductImage src={accessory.image} sizes="48px" className="size-12" rounded="rounded-md" />
              <span className="flex-1 min-w-0">
                <span className="flex justify-between gap-2 font-bold text-eu-ink text-[length:var(--fs-15)]">
                  <span className="line-clamp-1 break-all">{accessory.brand} {accessory.title}</span>
                  <span className="text-eu-blue shrink-0">+ {priceLong(accessory.price)}</span>
                </span>
                <span className="block text-eu-muted text-[length:var(--fs-13-5)]">{c.tairiazei_me_ayto_to}</span>
              </span>
            </label>
          )}
        </fieldset>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-eu-line pt-4">
        <div className="inline-flex items-center border border-eu-line rounded-full">
          <button type="button" aria-label={c.ligotera} onClick={() => setQty((q) => Math.max(1, q - 1))} className="size-11 inline-flex items-center justify-center rounded-l-full hover:bg-eu-surface">
            <Minus className="size-4" aria-hidden />
          </button>
          <span className="w-8 text-center font-bold tabular-nums text-[length:var(--fs-16)]">{qty}</span>
          <button type="button" aria-label={c.perissotera} onClick={() => setQty((q) => Math.min(9, q + 1))} className="size-11 inline-flex items-center justify-center rounded-r-full hover:bg-eu-surface">
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
        <div className="text-right text-eu-muted text-[length:var(--fs-14)]">
          {hasSolution ? "Σύνολο λύσης" : "Σύνολο"} <strong className="text-eu-ink text-[length:var(--fs-21)]">{priceLong(total)}</strong>
        </div>
      </div>

      <div className="grid gap-2">
        <button type="button" onClick={() => openQuickBuy({ ...p, price })} className="rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-17)] py-4 min-h-[56px] hover:bg-eu-yellow-dark">
          {c.agora_me_1_klik}
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={addAll} className="flex-1 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-16)] py-3.5 min-h-[56px] hover:bg-eu-blue">
            {hasSolution ? "Προσθήκη όλων στο καλάθι" : "Προσθήκη στο καλάθι"}
          </button>
          <WishlistButton id={p.id} className="size-[56px]" />
        </div>
        <div className="flex justify-between items-center text-[length:var(--fs-14)]">
          <CompareCheckbox id={p.id} />
          <span className="text-eu-muted">{c.eggyisi_2_eti_epistrofi}</span>
        </div>
      </div>
    </aside>
  );
}
