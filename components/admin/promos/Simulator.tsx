"use client";

import { useEffect, useState, useTransition } from "react";
import { X, Check, Minus, Plus, Gift, Truck, Lightbulb, Loader2, ShoppingCart, ChevronDown } from "lucide-react";
import { ProductBrowser } from "./ProductBrowser";
import { Picker } from "./PromoWizard";
import { PAYMENT_OPTIONS } from "@/lib/promo/catalog";
import { simulateAction, type SimInput, type SimResult } from "@/app/admin/(shell)/prosfores/actions";

const input = "w-full rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white focus-visible:border-eu-blue outline-none";
const lbl = "grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2";
const hint = "font-normal text-eu-muted text-[length:var(--fs-12)] leading-snug";
const eur = (c: number) => `${(c / 100).toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const WHO: { v: SimInput["customer"]; t: string; s: string }[] = [
  { v: "guest", t: "Επισκέπτης", s: "χωρίς λογαριασμό" },
  { v: "new", t: "Μέλος, 1η αγορά", s: "παίρνει «πρώτη αγορά»" },
  { v: "registered", t: "Μέλος με αγορές", s: "όχι «πρώτη αγορά»" },
];

/**
 * Καλάθι δοκιμής με την ίδια μηχανή με το checkout: αριστερά το καλάθι και το σενάριο (πελάτης, ημερομηνία, κουπόνι,
 * ΤΚ, παράδοση, πληρωμή), δεξιά το αποτέλεσμα — υπολογίζεται μόνο του σε κάθε αλλαγή — με το ίχνος κάθε προσφοράς.
 */
export function Simulator({ segments = [] }: { segments?: { id: string; label: string }[] }) {
  const [items, setItems] = useState<{ productId: string; title: string; qty: number }[]>([]);
  const [opts, setOpts] = useState<Omit<SimInput, "items">>({ coupon: null, customer: "guest", zip: null, payment: "card", delivery: "courier", at: null, drafts: true, segments: [] });
  const [res, setRes] = useState<SimResult | null>(null);
  const [busy, start] = useTransition();
  const set = (p: Partial<typeof opts>) => setOpts((o) => ({ ...o, ...p }));
  const add = (id: string, title: string) => setItems((x) => (x.some((i) => i.productId === id) ? x : [...x, { productId: id, title, qty: 1 }]));
  const qty = (id: string, d: number) => setItems((x) => x.map((y) => (y.productId === id ? { ...y, qty: Math.max(1, y.qty + d) } : y)));

  // αυτόματος υπολογισμός λίγο μετά από κάθε αλλαγή
  useEffect(() => {
    if (!items.length) return;
    const t = setTimeout(() => start(async () => setRes(await simulateAction({ ...opts, items: items.map((i) => ({ productId: i.productId, qty: i.qty })) }))), 350);
    return () => clearTimeout(t);
  }, [items, opts]);
  const shown = items.length ? res : null;
  const saved = shown ? shown.listTotal - shown.total : 0;

  return (
    <div className="grid grid-cols-1 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
      <div className="grid gap-4 min-w-0">
        <section data-help="promo.sim.cart" className="rounded-2xl bg-white border border-eu-line p-3 @md:p-4 grid gap-3" aria-labelledby="sim-cart">
          <h3 id="sim-cart" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)] inline-flex items-center gap-2"><ShoppingCart className="size-4 text-eu-blue" aria-hidden /> Καλάθι δοκιμής</h3>
          <Picker kind="product" placeholder="Πρόσθεσε προϊόν: γράψε όνομα ή κωδικό…" onPick={(x) => add(x.id, x.label)} />
          {items.length > 0 && (
            <ul className="m-0 p-0 list-none grid gap-1.5">
              {items.map((i) => (
                <li key={i.productId} className="flex items-center gap-1 rounded-xl border border-eu-line p-1 pl-3">
                  <span className="flex-1 min-w-0 text-[length:var(--fs-14)] font-semibold truncate" title={i.title}>{i.title}</span>
                  <button type="button" aria-label={`Λιγότερα: ${i.title}`} onClick={() => qty(i.productId, -1)} className="size-10 grid place-items-center rounded-full hover:bg-eu-surface"><Minus className="size-4" aria-hidden /></button>
                  <span className="w-6 text-center font-bold tabular-nums" aria-label={`Ποσότητα ${i.qty}`}>{i.qty}</span>
                  <button type="button" aria-label={`Περισσότερα: ${i.title}`} onClick={() => qty(i.productId, 1)} className="size-10 grid place-items-center rounded-full hover:bg-eu-surface"><Plus className="size-4" aria-hidden /></button>
                  <button type="button" aria-label={`Αφαίρεση: ${i.title}`} onClick={() => setItems((x) => x.filter((y) => y.productId !== i.productId))} className="size-10 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-4" aria-hidden /></button>
                </li>
              ))}
            </ul>
          )}
          <details className="group rounded-xl border border-eu-line">
            <summary className="list-none cursor-pointer flex items-center gap-2 px-3 min-h-11 font-bold text-eu-blue text-[length:var(--fs-14)] [&::-webkit-details-marker]:hidden"><span className="flex-1">Περιήγηση στον κατάλογο (κατηγορία → μάρκα → προϊόν)</span><ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden /></summary>
            <div className="p-3 pt-0"><ProductBrowser mode="products" selected={new Set(items.map((i) => i.productId))} addLabel="Στο καλάθι" onProduct={(p) => (items.some((i) => i.productId === p.id) ? setItems((x) => x.filter((i) => i.productId !== p.id)) : add(p.id, p.title))} /></div>
          </details>
        </section>

        <section data-help="promo.sim.scenario" className="rounded-2xl bg-white border border-eu-line p-3 @md:p-4 grid gap-3" aria-labelledby="sim-who">
          <h3 id="sim-who" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Σενάριο</h3>
          <fieldset className="m-0 p-0 border-0 grid gap-1"><legend className="font-bold text-eu-ink-2 text-[length:var(--fs-14)] mb-1">Πελάτης</legend>
            <div className="grid grid-cols-3 gap-1.5">{WHO.map((w) => <button key={w.v} type="button" aria-pressed={opts.customer === w.v} onClick={() => set({ customer: w.v })} className={`rounded-xl border-2 px-2 py-1.5 min-h-12 text-left grid ${opts.customer === w.v ? "border-eu-navy bg-eu-chip" : "border-eu-line hover:border-eu-blue"}`}><span className="font-bold text-eu-ink text-[length:var(--fs-13)] leading-tight">{w.t}</span><span className="text-eu-muted text-[length:var(--fs-12)] leading-tight">{w.s}</span></button>)}</div>
          </fieldset>
          {segments.length > 0 && opts.customer !== "guest" && (
            <div className="grid gap-1.5"><span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)]">Ανήκει στα κοινά</span>
              <div className="flex flex-wrap gap-1.5">{segments.map((s) => { const on = !!opts.segments?.includes(s.id); return <button key={s.id} type="button" aria-pressed={on} onClick={() => set({ segments: on ? (opts.segments ?? []).filter((x) => x !== s.id) : [...(opts.segments ?? []), s.id] })} className={`rounded-full px-3 min-h-10 text-[length:var(--fs-13)] font-semibold border ${on ? "bg-eu-navy text-white border-eu-navy" : "border-eu-line"}`}>{s.label}</button>; })}</div>
            </div>
          )}
          <div className="grid grid-cols-1 @lg:grid-cols-2 gap-3">
            <label className={lbl}><span>Ημερομηνία & ώρα</span><input type="datetime-local" className={input} value={opts.at ?? ""} onChange={(e) => set({ at: e.target.value || null })} /><span className={hint}>Κενό = τώρα· μελλοντική για καμπάνια πριν ξεκινήσει.</span></label>
            <label className={lbl}><span>Κουπόνι</span><input className={`${input} font-mono uppercase`} value={opts.coupon ?? ""} onChange={(e) => set({ coupon: e.target.value.toUpperCase() || null })} placeholder="WELCOME10" /><span className={hint}>Οι προσωπικοί κωδικοί δοκιμάζονται χωρίς έλεγχο κατόχου.</span></label>
            <label className={lbl}><span>Παράδοση</span><select className={input} value={opts.delivery} onChange={(e) => set({ delivery: e.target.value as SimInput["delivery"] })}><option value="courier">Αποστολή</option><option value="click-collect">Παραλαβή από κατάστημα</option><option value="appointment">Ραντεβού</option></select></label>
            <label className={lbl}><span>Πληρωμή</span><select className={input} value={opts.payment ?? ""} onChange={(e) => set({ payment: e.target.value })}>{PAYMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
            <label className={lbl}><span>ΤΚ</span><input inputMode="numeric" className={input} value={opts.zip ?? ""} onChange={(e) => set({ zip: e.target.value || null })} placeholder="όλη η Ελλάδα" /><span className={hint}>Για προσφορές μόνο σε περιοχές.</span></label>
            <label className="inline-flex items-center gap-2 text-[length:var(--fs-14)] font-bold text-eu-ink-2 min-h-11 self-center"><input type="checkbox" checked={opts.drafts} onChange={(e) => set({ drafts: e.target.checked })} className="size-5 accent-eu-navy" /> Και μη δημοσιευμένες προσφορές</label>
          </div>
        </section>
      </div>

      <section data-help="promo.sim.result" className="rounded-2xl bg-white border border-eu-line p-3 @md:p-4 grid gap-3 @4xl:[@media(min-height:820px)]:sticky @4xl:top-4" aria-live="polite" aria-labelledby="sim-res">
        <div className="flex items-center gap-2"><h3 id="sim-res" className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)] flex-1">Αποτέλεσμα</h3>{busy && <span className="inline-flex items-center gap-1 text-eu-muted text-[length:var(--fs-13)]"><Loader2 className="size-4 animate-spin" aria-hidden /> υπολογισμός…</span>}</div>
        {!shown ? <p className="m-0 grid place-items-center min-h-40 rounded-xl bg-eu-surface/60 px-4 text-center text-eu-muted text-[length:var(--fs-14)]">{items.length ? "Υπολογισμός…" : "Πρόσθεσε ένα προϊόν: το αποτέλεσμα και το ίχνος της μηχανής εμφανίζονται εδώ και ενημερώνονται σε κάθε αλλαγή."}</p> : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-eu-navy text-white p-3"><div className="text-white/80 text-[length:var(--fs-13)]">Πληρώνει</div><div className="font-heading font-extrabold text-eu-yellow text-[length:var(--fs-24)] tabular-nums leading-tight">{eur(shown.total)}</div></div>
              <div className="rounded-xl bg-eu-green/10 p-3"><div className="text-eu-ink-3 text-[length:var(--fs-13)]">Κερδίζει</div><div className="font-heading font-extrabold text-eu-green text-[length:var(--fs-24)] tabular-nums leading-tight">{eur(saved + shown.discPayment)}</div><div className="text-eu-muted text-[length:var(--fs-12)]">από {eur(shown.listTotal)}</div></div>
            </div>
            <ul className="m-0 p-0 list-none divide-y divide-eu-line rounded-xl border border-eu-line text-[length:var(--fs-14)]">
              {shown.lines.map((l, i) => (
                <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3 py-2">
                  <span className="min-w-0"><span className="font-semibold">{l.qty} × {l.title}</span>{l.labels.map((x) => <span key={x} className="block text-eu-red text-[length:var(--fs-13)]">{x}</span>)}{l.capped && <span className="block text-eu-amber text-[length:var(--fs-13)] font-bold">κόπηκε: {l.capped === "cost" ? "κάτω από κόστος" : "μέγιστο %"}</span>}</span>
                  <span className="text-right tabular-nums">{l.total !== l.listTotal && <s className="block text-eu-muted text-[length:var(--fs-13)]">{eur(l.listTotal)}</s>}<b>{eur(l.total)}</b>{(l.discPrice > 0 || l.discCoupon > 0) && <span className="block text-eu-green text-[length:var(--fs-12)]">{l.discPrice ? `προσφορά −${eur(l.discPrice)}` : ""}{l.discPrice && l.discCoupon ? " · " : ""}{l.discCoupon ? `κουπόνι −${eur(l.discCoupon)}` : ""}</span>}</span>
                </li>
              ))}
            </ul>
            {(shown.discPayment > 0 || shown.couponMessage || shown.gifts.length > 0 || shown.services.length > 0 || shown.freeShipping || shown.hints.length > 0) && (
              <ul className="m-0 p-0 list-none grid gap-1.5 text-[length:var(--fs-14)]">
                {shown.discPayment > 0 && <li className="flex items-center gap-2 text-eu-green font-semibold"><Check className="size-4" aria-hidden /> Έκπτωση πληρωμής: −{eur(shown.discPayment)}</li>}
                {shown.couponMessage && <li className={`flex items-center gap-2 font-semibold ${shown.couponApplied ? "text-eu-green" : "text-eu-red"}`}>{shown.couponApplied ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />} {shown.couponMessage}</li>}
                {shown.gifts.map((g) => <li key={g.label} className="flex items-center gap-2 text-eu-green font-semibold"><Gift className="size-4" aria-hidden /> {g.label}: {g.qty} × {g.title}</li>)}
                {shown.services.map((s) => <li key={s.label} className="flex items-center gap-2 text-eu-green font-semibold"><Check className="size-4" aria-hidden /> {s.label}</li>)}
                {shown.freeShipping && <li className="flex items-center gap-2 text-eu-green font-semibold"><Truck className="size-4" aria-hidden /> {shown.freeShipping}</li>}
                {shown.hints.map((h) => <li key={h} className="flex items-center gap-2 text-eu-navy"><Lightbulb className="size-4 text-eu-blue" aria-hidden /> {h}</li>)}
              </ul>
            )}
            <div className="grid gap-1.5">
              <h4 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-12)] uppercase tracking-wide">Ίχνος της μηχανής ({shown.trace.filter((t) => t.applied).length}/{shown.trace.length} εφαρμόστηκαν)</h4>
              {shown.trace.length ? (
                <ol className="m-0 p-0 list-none grid gap-1">
                  {[...shown.trace].sort((a, b) => Number(b.applied) - Number(a.applied)).map((t, i) => (
                    <li key={i} className={`rounded-lg px-3 py-1.5 text-[length:var(--fs-13)] ${t.applied ? "bg-eu-green/10" : "bg-eu-surface"}`}>
                      <span className={`font-bold ${t.applied ? "text-eu-green" : "text-eu-ink-2"}`}>{t.applied ? "✓" : "✗"} {t.name}</span> <span className="font-mono text-eu-muted">{t.code}</span>{t.amount ? <b className="text-eu-green"> · −{eur(t.amount)}</b> : ""}
                      <span className="block text-eu-ink-3">{t.reason}</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Καμία προσφορά δεν αφορά αυτό το καλάθι.</p>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
