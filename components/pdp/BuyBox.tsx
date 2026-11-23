"use client";


import { useEffect, useMemo, useState } from "react";
import { CreditCard, Minus, Plus, Package, ShieldCheck } from "lucide-react";
import type { Product, Service } from "@/lib/data/types";
import type { PickupStore } from "@/components/pdp/PickupStorePicker";
import { discountPct, maxInstalments, priceLong, priceShort, weekday } from "@/lib/format";
import { InstalmentSelect } from "@/components/commerce/InstalmentSelect";
import { useCart, type CartAddon } from "@/components/commerce/CartProvider";
import { WishlistButton, CompareCheckbox } from "@/components/commerce/WishlistButton";
import { ProductImage } from "@/components/commerce/ProductImage";
import { copyOf } from "@/lib/cms/copy";
import { sx } from "@/components/ui/sx";
import { warrantyDetail, warrantyLabel, type WarrantyInfo } from "@/lib/warranty/policy";
import { Price } from "@/components/commerce/Price";

const c = copyOf("buybox");

/**
 * Sticky buy box. Price + Omnibus 30-day price, interest-free card
 * instalments (the customer picks how many), variants with price per option, availability with date,
 * store selector with real-time stock, delivery choice, and the
 * «Ολοκληρωμένη λύση» bundle: warranty extension, e-support and an
 * accessory with a running total. «Προσθήκη στο καλάθι» is the one primary
 * action; quick buy sits next to the wishlist as the secondary one.
 */
/** warranty: εγγύηση κατασκευαστή (μήνες) και η προαιρετική επέκταση με χρέωση (0 = δεν προσφέρεται για αυτό το είδος) */
export function BuyBox({ product: p, addons, accessory, warranty }: { product: Product; addons: Service[]; stores: PickupStore[]; accessory?: Product | null; warranty?: WarrantyInfo; /** πραγματικό απόθεμα ανά κατάστημα (StoreStock) */ stockByStore?: Record<string, number> }) {
  const { add, openQuickBuy } = useCart();
  const [qty, setQty] = useState(1);
  const [sel, setSel] = useState<Record<string, string>>(() => Object.fromEntries((p.variants ?? []).map((v) => [v.name, v.options[0].label])));
  const [chosen, setChosen] = useState<CartAddon[]>([]);
  const [withAcc, setWithAcc] = useState(false);
  const [months, setMonths] = useState<number | null>(null);

  const price = useMemo(() => {
    let pr = p.price;
    for (const v of p.variants ?? []) {
      const o = v.options.find((x) => x.label === sel[v.name]);
      if (o?.price) pr = o.price;
    }
    return pr;
  }, [p, sel]);
  const pct = discountPct(price, p.wasPrice);
  // άτοκες δόσεις: ο πελάτης διαλέγει πόσες· ξεκινά από τις περισσότερες (μικρότερη δόση) και ακολουθεί την τιμή της παραλλαγής
  const maxInst = maxInstalments(price);
  const inst = Math.min(months ?? maxInst, maxInst);
  const variantLabel = Object.values(sel).join(" · ") || undefined;
  const a = p.availability;
  const date = a.kind === "order" ? null : weekday(new Date(a.deliveryDate));
  const avail = a.kind === "in-stock" ? { c: "text-eu-green", dot: "bg-eu-green", t: a.label ?? "Άμεσα διαθέσιμο" } : a.kind === "days" ? { c: "text-eu-amber", dot: "bg-eu-amber", t: `Διαθέσιμο σε ${a.min}–${a.max} εργάσιμες` } : { c: "text-eu-muted", dot: "bg-eu-muted", t: a.label ?? "Κατόπιν παραγγελίας" };

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
          <span className="font-extrabold text-eu-ink text-[length:var(--fs-44)] leading-none tracking-[-0.02em]"><Price value={price} short /></span>
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
        {(p.promoTags?.length || p.infoTags?.length || p.promo?.kind === "bogo" || p.promo?.kind === "bundle" || p.memberPrice || p.dealEndsAt) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {p.promo?.kind === "bogo" && <span className="rounded-full bg-eu-yellow text-eu-navy font-extrabold px-2.5 py-1 text-[length:var(--fs-14)]">{p.promo.label ?? "1+1"}</span>}
            {p.promo?.kind === "bundle" && <span className="rounded-full bg-eu-green/10 text-eu-green font-extrabold px-2.5 py-1 text-[length:var(--fs-14)]">Δώρο: {p.promo.with}</span>}
            {p.promoTags?.map((t) => <span key={t} className="rounded-full bg-eu-chip text-eu-navy font-bold px-2.5 py-1 text-[length:var(--fs-14)]">{t}</span>)}
            {p.infoTags?.map((t) => <span key={t} className="rounded-full border border-eu-navy/20 text-eu-navy font-bold px-2.5 py-1 text-[length:var(--fs-14)]">{t}</span>)}
            {p.dealEndsAt && <DealCountdown until={p.dealEndsAt} />}
          </div>
        )}
        {maxInst > 1 && (
          <div className="rounded-xl bg-eu-chip p-3.5 mt-3 grid gap-2" data-testid="pdp-instalments">
            <label htmlFor="pdp-inst" className="flex items-center gap-2 font-bold text-eu-ink text-[length:var(--fs-15)]">
              <CreditCard className="size-5 text-eu-blue shrink-0" aria-hidden /> Άτοκες δόσεις με κάρτα
            </label>
            <InstalmentSelect id="pdp-inst" amount={price} max={maxInst} value={inst} onChange={setMonths} />
            <div className="text-eu-ink-2 text-[length:var(--fs-14)]">Χωρίς τόκους. Τον αριθμό των δόσεων τον ορίζεις στο ταμείο, όταν πληρώσεις με κάρτα</div>
          </div>
        )}
      </div>

      {p.variants?.map((v) => (
        <fieldset key={v.name} className="m-0 p-0 border-0 min-w-0">
          <legend className="font-bold text-eu-ink text-[length:var(--fs-15)] mb-2">
            {v.name}: <span className="font-normal text-eu-muted">{sel[v.name]}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {v.options.map((o) => {
              const on = sel[v.name] === o.label;
              const sw = sx({ background: o.swatch });
              return (
                <button key={o.label} type="button" aria-pressed={on} onClick={() => setSel((s) => ({ ...s, [v.name]: o.label }))} className={`inline-flex items-center gap-2 rounded-full border-2 px-4 py-2 min-h-11 text-[length:var(--fs-14)] font-semibold ${on ? "border-eu-navy bg-eu-navy text-white" : "border-eu-line text-eu-ink hover:border-eu-blue"}`}>
                  {o.swatch && sw.node}
                  {o.swatch && <span className={`size-4 rounded-full border border-black/10 ${sw.className}`} aria-hidden />}
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

      {warranty && (
        <div className="rounded-xl border-2 border-eu-line p-3.5 flex items-start gap-2.5">
          <ShieldCheck className="size-5 shrink-0 mt-0.5 text-eu-blue" aria-hidden />
          <span className="flex-1 min-w-0">
            <span className="flex justify-between gap-2 font-bold text-eu-ink text-[length:var(--fs-15)]">
              {warrantyLabel(warranty)}
              {warranty.extMonths > 0 && warranty.extPrice ? <span className="text-eu-blue shrink-0">+3 έτη {priceLong(warranty.extPrice)}</span> : null}
            </span>
            <span className="block text-eu-muted text-[length:var(--fs-13-5)]">
              {warrantyDetail(warranty)}{warranty.extMonths ? " — διάλεξέ την παρακάτω· τη βλέπεις μετά στις συσκευές του λογαριασμού σου" : ""}
            </span>
          </span>
        </div>
      )}

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
        <button type="button" onClick={addAll} className="rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-17)] py-4 min-h-[56px] hover:bg-eu-yellow-dark transition-colors">
          {hasSolution ? "Προσθήκη όλων στο καλάθι" : "Προσθήκη στο καλάθι"}
        </button>
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => openQuickBuy({ ...p, price })} className="font-bold text-eu-blue text-[length:var(--fs-15)] underline underline-offset-2 min-h-11 hover:text-eu-navy">
            {c.agora_me_1_klik}
          </button>
          <WishlistButton id={p.id} className="size-12" />
        </div>
        <div className="flex flex-wrap justify-between items-center gap-x-3 gap-y-1 text-[length:var(--fs-14)]">
          <CompareCheckbox id={p.id} />
          <span className="text-eu-muted">{warrantyLabel(warranty)} · Επιστροφή σε 14 ημέρες</span>
        </div>
      </div>
    </aside>
  );
}

/** «Λήγει σε 2 ημ. 4 ώρ.» — η πραγματική λήξη της προσφοράς (ίδια τιμή με το countdown των landing pages). */
function DealCountdown({ until }: { until: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { const tick = () => setNow(Date.now()); const t0 = setTimeout(tick, 0); const t = setInterval(tick, 60_000); return () => { clearTimeout(t0); clearInterval(t); }; }, []);
  if (now === null) return null;
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return null;
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  const text = d > 0 ? `${d} ημ. ${h} ώρ.` : h > 0 ? `${h} ώρ. ${m} λεπ.` : `${m} λεπ.`;
  return <span className="rounded-full bg-eu-red/10 text-eu-red font-bold px-2.5 py-1 text-[length:var(--fs-14)]">Λήγει σε {text}</span>;
}
