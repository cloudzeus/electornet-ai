"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertTriangle, Layers } from "lucide-react";
import type { CalendarDay, CalendarPromo } from "@/lib/promo/admin";
import { STATUS_LABEL, type PromoStatus } from "@/lib/promo/catalog";
import { ProductBrowser } from "./ProductBrowser";
import { simulateAction, type SimResult } from "@/app/admin/(shell)/prosfores/actions";

const BAR: Record<string, string> = { active: "bg-eu-green", scheduled: "bg-eu-blue", paused: "bg-eu-amber", pending: "bg-eu-yellow" };
const eur = (c: number) => `${(c / 100).toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Gantt έξι εβδομάδων με ζώνη επικαλύψεων και επιθεωρητή «τι ισχύει σε αυτό το προϊόν αυτή την ημέρα». */
export function PromoCalendar({ from, promos, days }: { from: string; promos: CalendarPromo[]; days: CalendarDay[] }) {
  const start = new Date(from).getTime();
  const [day, setDay] = useState<number | null>(null);
  const byId = new Map(promos.map((p) => [p.id, p]));
  const idx = (iso: string | null, end: boolean) => { if (!iso) return end ? days.length : 0; const k = (new Date(iso).getTime() - start) / 86400_000; return Math.max(0, Math.min(days.length, end ? Math.ceil(k) : Math.floor(k))); };
  const sel = day != null ? days[day] : null;
  const pctOf = (i: number) => `${(i / days.length) * 100}%`;
  const clashDays = days.map((d, i) => ({ d, i })).filter((x) => x.d.clashes.length);
  const label = (iso: string) => new Date(iso).toLocaleDateString("el-GR", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="grid gap-4 min-w-0">
      {/* Χωράει πάντα στο πλάτος: οι ημέρες είναι ποσοστά, όχι σταθερά pixels. Σε στενό χώρο το όνομα πάει πάνω από τη μπάρα. */}
      <div className="rounded-2xl border border-eu-line bg-white p-3 @md:p-4 grid gap-2 min-w-0">
        <div className="grid grid-cols-1 @4xl:grid-cols-[220px_minmax(0,1fr)] gap-x-3">
          <div className="hidden @4xl:block text-eu-muted text-[length:var(--fs-13)] font-bold self-end pb-1">Προσφορά</div>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }} aria-hidden>
            {days.map((d, i) => { const dt = new Date(d.date); const mark = dt.getDay() === 1 || dt.getDate() === 1 || i === 0; const wk = dt.getDay() === 0 || dt.getDay() === 6; return (
              <div key={d.date} className={`text-center text-[11px] leading-tight py-0.5 ${wk ? "bg-eu-surface" : ""} ${mark ? "border-l border-eu-navy/40" : ""}`}>
                {mark ? <><div className="font-extrabold text-eu-navy">{dt.getDate()}</div><div className="text-eu-muted">{dt.toLocaleDateString("el-GR", { month: "short" }).slice(0, 3)}</div></> : <div className="text-eu-line">·</div>}
              </div>
            ); })}
          </div>
        </div>
        <div className="grid grid-cols-1 @4xl:grid-cols-[220px_minmax(0,1fr)] gap-x-3 items-center">
          <div className="text-eu-ink-2 text-[length:var(--fs-13)] font-bold inline-flex items-center gap-1.5"><Layers className="size-4" aria-hidden /> Επικαλύψεις ανά ημέρα</div>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((d, i) => {
              const price = d.clashes.filter((c) => c.kind === "price").length, comb = d.clashes.length - price;
              const tone = price ? (price > 2 ? "bg-eu-amber" : "bg-eu-yellow") : comb ? "bg-eu-blue/40" : "bg-eu-surface";
              return <button key={d.date} type="button" onClick={() => setDay(i)} aria-label={`${label(d.date)}: ${d.live} προσφορές, ${d.clashes.length} επικαλύψεις`} aria-pressed={day === i} className={`h-8 border-l border-white ${tone} ${day === i ? "outline-2 outline-eu-navy -outline-offset-2" : ""} hover:outline-2 hover:outline-eu-blue hover:-outline-offset-2`} />;
            })}
          </div>
        </div>
        {promos.map((p) => {
          const a = idx(p.startsAt, false), b = idx(p.endsAt, true);
          return (
            <div key={p.id} className="grid grid-cols-1 @4xl:grid-cols-[220px_minmax(0,1fr)] gap-x-3 gap-y-1 items-center border-t border-eu-line-2 pt-2">
              <Link href={`/admin/prosfores/${p.id}`} className="min-w-0 hover:text-eu-blue">
                <span className="block font-bold text-eu-ink text-[length:var(--fs-14)] truncate">{p.name}</span>
                <span className="block text-eu-muted text-[length:var(--fs-13)]">{STATUS_LABEL[p.status as PromoStatus]?.label} · {p.products ? `${p.products.toLocaleString("el-GR")} προϊόντα` : "όλο το καλάθι"}</span>
              </Link>
              <div className="relative h-7 rounded-md bg-eu-surface">
                {b > a && <Link href={`/admin/prosfores/${p.id}`} title={`${p.name} · ${p.code}`} className={`absolute top-0 h-7 rounded-md ${BAR[p.status] ?? "bg-eu-muted"} ${p.status === "pending" ? "bg-[repeating-linear-gradient(45deg,var(--color-eu-yellow)_0_6px,#fff_6px_10px)]" : ""} text-white text-[length:var(--fs-13)] font-bold px-2 truncate leading-7`} style={{ left: pctOf(a), width: pctOf(b - a) }}>{p.status === "pending" ? "" : p.code}</Link>}
              </div>
            </div>
          );
        })}
        {!promos.length && <p className="m-0 p-4 text-eu-muted text-[length:var(--fs-14)]">Καμία προσφορά σε αυτές τις εβδομάδες.</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-eu-muted text-[length:var(--fs-13)]">
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-eu-yellow" aria-hidden /> δύο εκπτώσεις στο ίδιο προϊόν</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-eu-blue/40" aria-hidden /> συνδυάζονται</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-eu-green" aria-hidden /> ενεργή</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-eu-blue" aria-hidden /> προγραμματισμένη</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-eu-amber" aria-hidden /> σε παύση</span>
        </div>
      </div>

      {clashDays.length > 0 && (
        <div className="grid gap-1.5">
          <span className="font-bold text-eu-ink-2 text-[length:var(--fs-14)]">Ημέρες με επικαλύψεις</span>
          <div className="flex flex-wrap gap-1.5">{clashDays.map(({ d, i }) => <button key={d.date} type="button" aria-pressed={day === i} onClick={() => setDay(i)} className={`rounded-full px-3 min-h-11 text-[length:var(--fs-14)] font-semibold border ${day === i ? "bg-eu-navy text-white border-eu-navy" : "border-eu-line bg-white hover:border-eu-navy"}`}>{label(d.date)} · {d.clashes.length}</button>)}</div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 items-start">
        <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-3" aria-live="polite">
          <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)]">{sel ? new Date(sel.date).toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long" }) : "Διάλεξε ημέρα από τη ζώνη επικαλύψεων"}</h3>
          {sel && (sel.clashes.length ? (
            <ul className="m-0 p-0 list-none grid gap-2">
              {sel.clashes.map((c) => { const A = byId.get(c.a)!, B = byId.get(c.b)!; return (
                <li key={c.a + c.b} className={`rounded-xl p-3 text-[length:var(--fs-14)] ${c.kind === "price" ? "bg-eu-yellow/20" : "bg-eu-chip"}`}>
                  <div className="font-bold text-eu-ink inline-flex items-start gap-1.5">{c.kind === "price" && <AlertTriangle className="size-4 text-eu-amber shrink-0 mt-0.5" aria-hidden />}<span><Link href={`/admin/prosfores/${A.id}`} className="hover:underline">{A.name}</Link> × <Link href={`/admin/prosfores/${B.id}`} className="hover:underline">{B.name}</Link></span></div>
                  <div className="text-eu-ink-2">{c.shared.toLocaleString("el-GR")} κοινά προϊόντα · {A.stacking === "exclusive" ? `κερδίζει η «${A.name}» (αποκλειστική)` : B.stacking === "exclusive" ? `κερδίζει η «${B.name}» (αποκλειστική)` : c.kind === "price" ? "ανά προϊόν μένει η καλύτερη για τον πελάτη" : "συνδυάζονται"}</div>
                </li>
              ); })}
            </ul>
          ) : <p className="m-0 text-eu-green font-bold text-[length:var(--fs-14)]">{sel.live} προσφορές, καμία επικάλυψη.</p>)}
        </section>
        <Inspector defaultDate={sel?.date ?? null} />
      </div>
    </div>
  );
}

/** «Τι ισχύει στο προϊόν Χ την ημέρα Υ» — ένα τεμάχιο, επισκέπτης, όλες οι προσφορές (και οι μη δημοσιευμένες). */
function Inspector({ defaultDate }: { defaultDate: string | null }) {
  const [prod, setProd] = useState<{ id: string; label: string } | null>(null);
  const [date, setDate] = useState("");
  const [res, setRes] = useState<SimResult | null>(null);
  const [busy, start] = useTransition();
  const when = date || (defaultDate ? defaultDate.slice(0, 10) : "");
  const run = (p = prod) => p && start(async () => setRes(await simulateAction({ items: [{ productId: p.id, qty: 1 }], coupon: null, customer: "guest", zip: null, payment: "card", delivery: "courier", at: when ? `${when}T12:00` : null, drafts: true })));
  return (
    <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-3">
      <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)]">Επιθεωρητής προϊόντος / ημέρας</h3>
      <p className="m-0 text-eu-ink-3 text-[length:var(--fs-14)]">Διάλεξε ένα προϊόν και μια ημέρα: βλέπεις την τελική τιμή και γιατί εφαρμόστηκε (ή όχι) κάθε προσφορά — και οι πρόχειρες.</p>
      <details open={!prod} className="rounded-xl border border-eu-line p-3">
        <summary className="cursor-pointer font-bold text-eu-blue text-[length:var(--fs-14)] min-h-8">{prod ? `Προϊόν: ${prod.label}` : "Διάλεξε προϊόν"}</summary>
        <div className="mt-3"><ProductBrowser mode="products" single selected={new Set(prod ? [prod.id] : [])} addLabel="Έλεγχος" onProduct={(p) => { const f = { id: p.id, label: p.title }; setProd(f); run(f); }} /></div>
      </details>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="grid gap-1 text-[length:var(--fs-14)] font-bold text-eu-ink-2"><span>Ημέρα</span><input type="date" value={when} onChange={(e) => setDate(e.target.value)} className="rounded-xl border-2 border-eu-line px-3 min-h-11" /></label>
        <button type="button" disabled={!prod || busy} onClick={() => run()} className="rounded-full bg-eu-navy text-white px-5 min-h-11 font-bold text-[length:var(--fs-14)] disabled:opacity-40">{busy ? "…" : "Έλεγχος"}</button>
      </div>
      {res && res.lines[0] && (
        <div className="grid gap-2 text-[length:var(--fs-14)]">
          <div className="font-bold text-eu-ink">{res.lines[0].title}: <s className="text-eu-muted font-normal">{eur(res.lines[0].listTotal)}</s> → <span className="text-eu-red">{eur(res.lines[0].total)}</span></div>
          <ol className="m-0 p-0 list-none grid gap-1.5">
            {res.trace.map((t, i) => <li key={i} className={`rounded-lg px-3 py-2 ${t.applied ? "bg-eu-green/10" : "bg-eu-surface"}`}><strong className={t.applied ? "text-eu-green" : ""}>{t.applied ? "✓" : "✗"} {t.name}</strong> — {t.reason}</li>)}
            {!res.trace.length && <li className="text-eu-muted">Καμία προσφορά δεν αφορά αυτό το προϊόν εκείνη την ημέρα.</li>}
          </ol>
        </div>
      )}
    </section>
  );
}
