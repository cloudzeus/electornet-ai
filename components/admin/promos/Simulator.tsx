"use client";

import { useState, useTransition } from "react";
import { Search, X, Play, Check, Minus, Gift, Truck, Lightbulb } from "lucide-react";
import { searchTargetsAction, simulateAction, type SimInput, type SimResult } from "@/app/admin/(shell)/prosfores/actions";

const input = "w-full rounded-xl border-2 border-eu-line px-3 min-h-11 text-[length:var(--fs-15)] bg-white focus-visible:border-eu-blue outline-none";
const eur = (c: number) => `${(c / 100).toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Καλάθι δοκιμής → αποτέλεσμα της μηχανής με το ίχνος κάθε προσφοράς. */
export function Simulator({ segments = [] }: { segments?: { id: string; label: string }[] }) {
  const [items, setItems] = useState<{ productId: string; title: string; qty: number }[]>([]);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; label: string; sub?: string }[]>([]);
  const [opts, setOpts] = useState<Omit<SimInput, "items">>({ coupon: null, customer: "guest", zip: null, payment: "card", delivery: "courier", at: null, drafts: true, segments: [] });
  const [res, setRes] = useState<SimResult | null>(null);
  const [busy, start] = useTransition();
  const search = (v: string) => { setQ(v); if (v.trim().length >= 2) void searchTargetsAction("product", v).then(setFound); else setFound([]); };
  const run = () => start(async () => setRes(await simulateAction({ ...opts, items: items.map((i) => ({ productId: i.productId, qty: i.qty })) })));
  const set = (p: Partial<typeof opts>) => setOpts((o) => ({ ...o, ...p }));

  return (
    <div className="grid grid-cols-1 @5xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 items-start">
      <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-4">
        <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)]">Καλάθι δοκιμής</h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden />
          <input aria-label="Πρόσθεσε προϊόν" value={q} onChange={(e) => search(e.target.value)} placeholder="Πρόσθεσε προϊόν: τίτλος, κωδικός, EAN" className={`${input} pl-9`} />
          {found.length > 0 && (
            <ul className="absolute z-10 left-0 right-0 mt-1 m-0 p-0 list-none max-h-72 overflow-y-auto rounded-xl border border-eu-line bg-white shadow-[var(--shadow-raised)] divide-y divide-eu-line">
              {found.map((f) => <li key={f.id}><button type="button" onClick={() => { setItems((x) => (x.some((i) => i.productId === f.id) ? x.map((i) => (i.productId === f.id ? { ...i, qty: i.qty + 1 } : i)) : [...x, { productId: f.id, title: f.label, qty: 1 }])); setQ(""); setFound([]); }} className="w-full text-left px-3 py-2 min-h-11 hover:bg-eu-chip"><span className="block font-bold text-[length:var(--fs-14)]">{f.label}</span><span className="block text-eu-muted text-[length:var(--fs-13)]">{f.sub}</span></button></li>)}
            </ul>
          )}
        </div>
        {items.length ? (
          <ul className="m-0 p-0 list-none grid gap-2">
            {items.map((i) => (
              <li key={i.productId} className="flex items-center gap-2 rounded-xl border border-eu-line p-2 pl-3">
                <span className="flex-1 min-w-0 text-[length:var(--fs-14)] font-semibold truncate">{i.title}</span>
                <button type="button" aria-label="Λιγότερα" onClick={() => setItems((x) => x.map((y) => (y.productId === i.productId ? { ...y, qty: Math.max(1, y.qty - 1) } : y)))} className="size-11 grid place-items-center rounded-full hover:bg-eu-surface"><Minus className="size-4" aria-hidden /></button>
                <span className="w-6 text-center font-bold tabular-nums">{i.qty}</span>
                <button type="button" aria-label="Περισσότερα" onClick={() => setItems((x) => x.map((y) => (y.productId === i.productId ? { ...y, qty: y.qty + 1 } : y)))} className="size-11 grid place-items-center rounded-full hover:bg-eu-surface">+</button>
                <button type="button" aria-label="Αφαίρεση" onClick={() => setItems((x) => x.filter((y) => y.productId !== i.productId))} className="size-11 grid place-items-center rounded-full hover:bg-eu-surface"><X className="size-4" aria-hidden /></button>
              </li>
            ))}
          </ul>
        ) : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Πρόσθεσε ένα ή περισσότερα προϊόντα.</p>}
        <div className="grid grid-cols-1 @md:grid-cols-2 gap-3">
          <label className="grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2"><span>Πελάτης</span><select className={input} value={opts.customer} onChange={(e) => set({ customer: e.target.value as SimInput["customer"] })}><option value="guest">Επισκέπτης (πρώτη αγορά)</option><option value="new">Μέλος, πρώτη αγορά</option><option value="registered">Μέλος με παραγγελίες</option></select></label>
          <label className="grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2"><span>Ημερομηνία & ώρα</span><input type="datetime-local" className={input} value={opts.at ?? ""} onChange={(e) => set({ at: e.target.value || null })} /></label>
          <label className="grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2"><span>Κουπόνι</span><input className={`${input} font-mono uppercase`} value={opts.coupon ?? ""} onChange={(e) => set({ coupon: e.target.value.toUpperCase() || null })} /></label>
          <label className="grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2"><span>ΤΚ</span><input inputMode="numeric" className={input} value={opts.zip ?? ""} onChange={(e) => set({ zip: e.target.value || null })} /></label>
          <label className="grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2"><span>Παράδοση</span><select className={input} value={opts.delivery} onChange={(e) => set({ delivery: e.target.value as SimInput["delivery"] })}><option value="courier">Αποστολή</option><option value="click-collect">Παραλαβή από κατάστημα</option><option value="appointment">Ραντεβού</option></select></label>
          <label className="grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2"><span>Πληρωμή</span><select className={input} value={opts.payment ?? ""} onChange={(e) => set({ payment: e.target.value })}>{["card", "no-card", "iris", "bank", "cod", "store", "apple", "google"].map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
        </div>
        {segments.length > 0 && opts.customer !== "guest" && (
          <div className="grid gap-1.5"><span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)]">Ο πελάτης ανήκει στα κοινά</span>
            <div className="flex flex-wrap gap-1.5">{segments.map((s) => { const on = !!opts.segments?.includes(s.id); return <button key={s.id} type="button" aria-pressed={on} onClick={() => set({ segments: on ? (opts.segments ?? []).filter((x) => x !== s.id) : [...(opts.segments ?? []), s.id] })} className={`rounded-full px-3 min-h-10 text-[length:var(--fs-13)] font-semibold border ${on ? "bg-eu-navy text-white border-eu-navy" : "border-eu-line"}`}>{s.label}</button>; })}</div>
          </div>
        )}
        <label className="inline-flex items-center gap-2 text-[length:var(--fs-14)] font-bold text-eu-ink-2 min-h-11"><input type="checkbox" checked={opts.drafts} onChange={(e) => set({ drafts: e.target.checked })} className="size-5 accent-eu-navy" /> Και μη δημοσιευμένες (πρόχειρες, σε αναμονή, σε παύση)</label>
        <button type="button" disabled={busy || !items.length} onClick={run} className="justify-self-start inline-flex items-center gap-2 rounded-full bg-eu-navy text-white px-6 min-h-11 font-extrabold text-[length:var(--fs-15)] hover:bg-eu-blue disabled:opacity-40"><Play className="size-4" aria-hidden /> {busy ? "Υπολογισμός…" : "Υπολογισμός"}</button>
      </section>

      <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-4" aria-live="polite">
        <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)]">Αποτέλεσμα</h3>
        {!res ? <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Το αποτέλεσμα και το ίχνος της μηχανής εμφανίζονται εδώ.</p> : (
          <>
            <table className="w-full text-[length:var(--fs-14)]">
              <thead className="text-left text-eu-muted text-[length:var(--fs-13)]"><tr><th className="py-1">Γραμμή</th><th className="py-1 text-right">Κατάλογος</th><th className="py-1 text-right">Προσφορά</th><th className="py-1 text-right">Κουπόνι</th><th className="py-1 text-right">Τελικό</th></tr></thead>
              <tbody>
                {res.lines.map((l, i) => (
                  <tr key={i} className="border-t border-eu-line align-top">
                    <td className="py-2 pr-2"><div className="font-semibold">{l.qty} × {l.title}</div>{l.labels.map((x) => <div key={x} className="text-eu-red text-[length:var(--fs-13)]">{x}</div>)}{l.capped && <div className="text-eu-amber text-[length:var(--fs-13)] font-bold">κόπηκε: {l.capped === "cost" ? "κάτω από κόστος" : "μέγιστο %"}</div>}</td>
                    <td className="py-2 text-right tabular-nums">{eur(l.listTotal)}</td><td className="py-2 text-right tabular-nums text-eu-green">{l.discPrice ? `−${eur(l.discPrice)}` : "—"}</td><td className="py-2 text-right tabular-nums text-eu-green">{l.discCoupon ? `−${eur(l.discCoupon)}` : "—"}</td><td className="py-2 text-right tabular-nums font-bold">{eur(l.total)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-eu-line font-extrabold"><td className="py-2">Σύνολο</td><td className="py-2 text-right tabular-nums">{eur(res.listTotal)}</td><td className="py-2 text-right tabular-nums text-eu-green">−{eur(res.discPrice)}</td><td className="py-2 text-right tabular-nums text-eu-green">−{eur(res.discCoupon)}</td><td className="py-2 text-right tabular-nums">{eur(res.total)}</td></tr>
              </tbody>
            </table>
            {res.discPayment > 0 && <p className="m-0 font-semibold text-eu-green text-[length:var(--fs-14)]">Έκπτωση πληρωμής (DISC3): −{eur(res.discPayment)} · πληρωτέο {eur(res.total)}</p>}
            {res.couponMessage && <p className={`m-0 font-semibold text-[length:var(--fs-14)] ${res.couponApplied ? "text-eu-green" : "text-eu-red"}`}>{res.couponMessage}</p>}
            <ul className="m-0 p-0 list-none grid gap-1.5 text-[length:var(--fs-14)]">
              {res.gifts.map((g) => <li key={g.label} className="flex items-center gap-2 text-eu-green font-semibold"><Gift className="size-4" aria-hidden /> {g.label}: {g.qty} × {g.title}</li>)}
              {res.services.map((s) => <li key={s.label} className="flex items-center gap-2 text-eu-green font-semibold"><Check className="size-4" aria-hidden /> {s.label}</li>)}
              {res.freeShipping && <li className="flex items-center gap-2 text-eu-green font-semibold"><Truck className="size-4" aria-hidden /> {res.freeShipping}</li>}
              {res.hints.map((h) => <li key={h} className="flex items-center gap-2 text-eu-navy"><Lightbulb className="size-4 text-eu-blue" aria-hidden /> {h}</li>)}
            </ul>
            <div className="grid gap-2">
              <h4 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-13)] uppercase tracking-wide">Ίχνος της μηχανής</h4>
              {res.trace.length ? (
                <ol className="m-0 p-0 list-none grid gap-1.5">
                  {res.trace.map((t, i) => (
                    <li key={i} className={`rounded-xl px-3 py-2 text-[length:var(--fs-14)] ${t.applied ? "bg-eu-green/10" : "bg-eu-surface"}`}>
                      <span className={`font-bold ${t.applied ? "text-eu-green" : "text-eu-ink-2"}`}>{t.applied ? "✓ Εφαρμόστηκε" : "✗ Δεν εφαρμόστηκε"}</span> · <strong>{t.name}</strong> <span className="font-mono text-eu-muted">{t.code}</span>{t.amount ? ` · −${eur(t.amount)}` : ""}
                      <div className="text-eu-ink-3">{t.reason}</div>
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
