"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertTriangle, CalendarDays, Layers, Search, X } from "lucide-react";
import type { CalendarDay, CalendarPromo } from "@/lib/promo/admin";
import { STATUS_LABEL, type PromoStatus } from "@/lib/promo/catalog";
import { simulateAction, type SimResult } from "@/app/admin/(shell)/prosfores/actions";
import { Picker } from "./PromoWizard";

const BAR: Record<string, string> = { active: "bg-eu-green", scheduled: "bg-eu-blue", paused: "bg-eu-amber", pending: "bg-eu-yellow" };
const eur = (c: number) => `${(c / 100).toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const DAY = 86400_000;
/** ημερομηνία YYYY-MM-DD στην τοπική ώρα (όχι UTC — αλλιώς τα μεσάνυχτα Ελλάδας γίνονται «χθες») */
const localDay = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

/**
 * Gantt έξι εβδομάδων: μπάρα ανά προσφορά με το όνομά της, γραμμή «σήμερα», ζώνη επικαλύψεων ανά ημέρα. Από κάτω η
 * επιλεγμένη ημέρα (ποιες τρέχουν, ποιες συναντιούνται και ποια κερδίζει) και ο επιθεωρητής «τι ισχύει στο προϊόν Χ».
 */
export function PromoCalendar({ from, promos, days }: { from: string; promos: CalendarPromo[]; days: CalendarDay[] }) {
  const start = new Date(from).getTime();
  const [now] = useState(() => Date.now());
  const todayIdx = Math.floor((now - start) / DAY);
  const [day, setDay] = useState<number>(() => (todayIdx >= 0 && todayIdx < days.length ? todayIdx : 0));
  const byId = new Map(promos.map((p) => [p.id, p]));
  const idx = (iso: string | null, end: boolean) => { if (!iso) return end ? days.length : 0; const k = (new Date(iso).getTime() - start) / DAY; return Math.max(0, Math.min(days.length, end ? Math.ceil(k) : Math.floor(k))); };
  const sel = days[day];
  const pctOf = (i: number) => `${(i / days.length) * 100}%`;
  const clashDays = days.map((d, i) => ({ d, i })).filter((x) => x.d.clashes.length);
  const label = (iso: string) => new Date(iso).toLocaleDateString("el-GR", { weekday: "short", day: "numeric", month: "short" });
  const d0 = start + day * DAY, d1 = d0 + DAY;
  const liveOnDay = promos.filter((p) => (p.startsAt ? +new Date(p.startsAt) : -Infinity) < d1 && (p.endsAt ? +new Date(p.endsAt) : Infinity) > d0);
  const cols = { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` };
  const today = todayIdx >= 0 && todayIdx < days.length ? { left: `calc(${pctOf(todayIdx)} + ${100 / days.length / 2}%)` } : null;

  return (
    <div className="grid gap-4 min-w-0">
      {/* Χωράει πάντα στο πλάτος: οι ημέρες είναι ποσοστά, όχι σταθερά pixels. Σε στενό χώρο το όνομα πάει πάνω από τη μπάρα. */}
      <div data-help="promo.calendar" className="rounded-2xl border border-eu-line bg-white p-3 @md:p-4 grid gap-2 min-w-0">
        <div className="grid grid-cols-1 @4xl:grid-cols-[13rem_minmax(0,1fr)] gap-x-3">
          <div className="hidden @4xl:block text-eu-muted text-[length:var(--fs-13)] font-bold self-end pb-1">{promos.length} {promos.length === 1 ? "προσφορά" : "προσφορές"}</div>
          <div className="grid" style={cols} aria-hidden>
            {days.map((d, i) => { const dt = new Date(d.date); const mark = dt.getDay() === 1 || dt.getDate() === 1 || i === 0; const wk = dt.getDay() === 0 || dt.getDay() === 6; return (
              <div key={d.date} className={`text-center text-[length:var(--fs-12)] leading-tight py-0.5 ${wk ? "bg-eu-surface" : ""} ${mark ? "border-l border-eu-navy/40" : ""} ${i === todayIdx ? "bg-eu-yellow/40 rounded-sm" : ""}`}>
                {mark || i === todayIdx ? <><div className="font-extrabold text-eu-navy">{dt.getDate()}</div><div className="text-eu-muted">{i === todayIdx ? "σήμ." : dt.toLocaleDateString("el-GR", { month: "short" }).slice(0, 3)}</div></> : <div className="text-eu-line-3">·</div>}
              </div>
            ); })}
          </div>
        </div>
        <div className="grid grid-cols-1 @4xl:grid-cols-[13rem_minmax(0,1fr)] gap-x-3 items-center">
          <div className="text-eu-ink-2 text-[length:var(--fs-13)] font-bold inline-flex items-center gap-1.5"><Layers className="size-4" aria-hidden /> Επικαλύψεις · πάτα ημέρα</div>
          <div className="grid" style={cols}>
            {days.map((d, i) => {
              const price = d.clashes.filter((c) => c.kind === "price").length, comb = d.clashes.length - price;
              const tone = price ? (price > 2 ? "bg-eu-amber" : "bg-eu-yellow") : comb ? "bg-eu-blue/40" : d.live ? "bg-eu-green/15" : "bg-eu-surface";
              return <button key={d.date} type="button" onClick={() => setDay(i)} aria-label={`${label(d.date)}: ${d.live} προσφορές, ${d.clashes.length} επικαλύψεις`} aria-pressed={day === i} className={`h-8 border-l border-white ${tone} ${day === i ? "outline-2 outline-eu-navy -outline-offset-2" : ""} hover:outline-2 hover:outline-eu-blue hover:-outline-offset-2`} />;
            })}
          </div>
        </div>
        <div className="relative grid gap-2">
          {today && <div aria-hidden className="pointer-events-none absolute inset-y-0 hidden @4xl:block" style={{ left: `calc(13rem + 0.75rem + (100% - 13.75rem) * ${(todayIdx + 0.5) / days.length})` }}><div className="h-full w-0.5 bg-eu-yellow-dark" /></div>}
          {promos.map((p) => {
            const a = idx(p.startsAt, false), b = idx(p.endsAt, true);
            return (
              <div key={p.id} className="grid grid-cols-1 @4xl:grid-cols-[13rem_minmax(0,1fr)] gap-x-3 gap-y-1 items-center border-t border-eu-line-2 pt-2">
                <Link href={`/admin/prosfores/${p.id}`} className="min-w-0 hover:text-eu-blue">
                  <span className="block font-bold text-eu-ink text-[length:var(--fs-14)] truncate">{p.name}</span>
                  <span className="block text-eu-muted text-[length:var(--fs-12)]">{STATUS_LABEL[p.status as PromoStatus]?.label} · {p.products ? `${p.products.toLocaleString("el-GR")} προϊόντα` : "όλο το καλάθι"}</span>
                </Link>
                <div className="relative h-7 rounded-md bg-eu-surface">
                  {b > a && <Link href={`/admin/prosfores/${p.id}`} title={`${p.name} · ${p.code}`} className={`absolute top-0 h-7 rounded-md ${BAR[p.status] ?? "bg-eu-muted"} ${p.status === "pending" ? "bg-[repeating-linear-gradient(45deg,var(--color-eu-yellow)_0_6px,#fff_6px_10px)] text-eu-navy" : "text-white"} text-[length:var(--fs-12)] font-bold px-2 truncate leading-7`} style={{ left: pctOf(a), width: pctOf(b - a) }}>{p.name}</Link>}
                </div>
              </div>
            );
          })}
        </div>
        {!promos.length && (
          <div className="grid justify-items-center gap-2 p-5 text-center">
            <CalendarDays className="size-7 text-eu-muted" aria-hidden />
            <p className="m-0 text-eu-ink-2 text-[length:var(--fs-14)]">Καμία προσφορά σε αυτές τις εβδομάδες.</p>
            <Link href="/admin/prosfores/new" className="inline-flex items-center rounded-full bg-eu-navy text-white px-4 min-h-10 font-bold text-[length:var(--fs-14)] hover:bg-eu-blue">Νέα προσφορά</Link>
          </div>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-eu-muted text-[length:var(--fs-13)]">
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-eu-yellow" aria-hidden /> δύο εκπτώσεις στο ίδιο προϊόν</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-eu-blue/40" aria-hidden /> συνδυάζονται</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-eu-green" aria-hidden /> ενεργή</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-eu-blue" aria-hidden /> προγραμματισμένη</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-eu-amber" aria-hidden /> σε παύση</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-0.5 h-3 bg-eu-yellow-dark" aria-hidden /> σήμερα</span>
        </div>
        {clashDays.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-eu-line-2 pt-2">
            <span className="font-bold text-eu-amber text-[length:var(--fs-13)] inline-flex items-center gap-1"><AlertTriangle className="size-4" aria-hidden /> {clashDays.length} ημέρες με επικαλύψεις:</span>
            {clashDays.slice(0, 12).map(({ d, i }) => <button key={d.date} type="button" aria-pressed={day === i} onClick={() => setDay(i)} className={`rounded-full px-2.5 min-h-9 text-[length:var(--fs-13)] font-semibold border ${day === i ? "bg-eu-navy text-white border-eu-navy" : "border-eu-line bg-white hover:border-eu-navy"}`}>{label(d.date)} · {d.clashes.length}</button>)}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-4 items-start">
        <section data-help="promo.calendar.day" className="rounded-2xl bg-white border border-eu-line p-3 @md:p-4 grid gap-3" aria-live="polite">
          <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">{sel ? new Date(sel.date).toLocaleDateString("el-GR", { weekday: "long", day: "numeric", month: "long" }) : "—"}{day === todayIdx && <span className="ml-2 rounded-full bg-eu-yellow/40 px-2 py-0.5 text-eu-navy text-[length:var(--fs-12)] font-bold align-middle">σήμερα</span>}</h3>
          {liveOnDay.length ? (
            <ul className="m-0 p-0 list-none grid gap-1">
              {liveOnDay.map((p) => <li key={p.id}><Link href={`/admin/prosfores/${p.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-eu-surface text-[length:var(--fs-14)]"><span className={`size-2.5 shrink-0 rounded-full ${BAR[p.status] ?? "bg-eu-muted"}`} aria-hidden /><span className="font-bold text-eu-ink flex-1 min-w-0 truncate">{p.name}</span><span className="text-eu-muted text-[length:var(--fs-12)] shrink-0">{STATUS_LABEL[p.status as PromoStatus]?.label}</span></Link></li>)}
            </ul>
          ) : <p className="m-0 text-eu-muted text-[length:var(--fs-14)]">Καμία προσφορά αυτή την ημέρα.</p>}
          {sel && sel.clashes.length > 0 && (
            <ul className="m-0 p-0 list-none grid gap-2">
              {sel.clashes.map((c) => { const A = byId.get(c.a)!, B = byId.get(c.b)!; return (
                <li key={c.a + c.b} className={`rounded-xl p-3 text-[length:var(--fs-14)] ${c.kind === "price" ? "bg-eu-yellow/20" : "bg-eu-chip"}`}>
                  <div className="font-bold text-eu-ink inline-flex items-start gap-1.5">{c.kind === "price" && <AlertTriangle className="size-4 text-eu-amber shrink-0 mt-0.5" aria-hidden />}<span><Link href={`/admin/prosfores/${A.id}`} className="hover:underline">{A.name}</Link> × <Link href={`/admin/prosfores/${B.id}`} className="hover:underline">{B.name}</Link></span></div>
                  <div className="text-eu-ink-2">{c.shared.toLocaleString("el-GR")} κοινά προϊόντα · {A.stacking === "exclusive" ? `κερδίζει η «${A.name}» (αποκλειστική)` : B.stacking === "exclusive" ? `κερδίζει η «${B.name}» (αποκλειστική)` : c.kind === "price" ? "ανά προϊόν μένει η καλύτερη για τον πελάτη" : "συνδυάζονται"}</div>
                </li>
              ); })}
            </ul>
          )}
          {sel && liveOnDay.length > 1 && !sel.clashes.length && <p className="m-0 text-eu-green font-bold text-[length:var(--fs-14)]">Καμία επικάλυψη στα ίδια προϊόντα.</p>}
        </section>
        <Inspector date={sel ? localDay(sel.date) : ""} />
      </div>
    </div>
  );
}

/** «Τι ισχύει στο προϊόν Χ την ημέρα Υ» — ένα τεμάχιο, επισκέπτης, όλες οι προσφορές (και οι μη δημοσιευμένες). */
function Inspector({ date }: { date: string }) {
  const [prod, setProd] = useState<{ id: string; label: string } | null>(null);
  const [own, setOwn] = useState<string | null>(null);
  const [res, setRes] = useState<SimResult | null>(null);
  const [busy, start] = useTransition();
  const when = own ?? date;
  const run = (p: { id: string; label: string } | null, d: string) => p && start(async () => setRes(await simulateAction({ items: [{ productId: p.id, qty: 1 }], coupon: null, customer: "guest", zip: null, payment: "card", delivery: "courier", at: d ? `${d}T12:00` : null, drafts: true })));
  return (
    <section data-help="promo.calendar.inspector" className="rounded-2xl bg-white border border-eu-line p-3 @md:p-4 grid gap-3">
      <div className="grid gap-0.5">
        <h3 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-16)]">Τι ισχύει σε ένα προϊόν</h3>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)]">Τελική τιμή και γιατί εφαρμόστηκε (ή όχι) κάθε προσφορά — και οι πρόχειρες — για επισκέπτη, ένα τεμάχιο.</p>
      </div>
      {prod ? (
        <div className="flex items-center gap-2 rounded-xl bg-eu-chip px-3 min-h-11"><Search className="size-4 text-eu-blue shrink-0" aria-hidden /><span className="flex-1 min-w-0 truncate font-bold text-eu-navy text-[length:var(--fs-14)]">{prod.label}</span><button type="button" aria-label="Άλλο προϊόν" onClick={() => { setProd(null); setRes(null); }} className="size-9 grid place-items-center rounded-full hover:bg-white"><X className="size-4" aria-hidden /></button></div>
      ) : <Picker kind="product" placeholder="Γράψε προϊόν ή κωδικό…" onPick={(x) => { const p = { id: x.id, label: x.label }; setProd(p); run(p, when); }} />}
      <label className="flex flex-wrap items-center gap-2 text-[length:var(--fs-14)] font-bold text-eu-ink-2">Ημέρα <input type="date" value={when} onChange={(e) => { setOwn(e.target.value); run(prod, e.target.value); }} className="rounded-xl border-2 border-eu-line px-3 min-h-11 font-normal" />{busy && <span className="font-normal text-eu-muted">υπολογισμός…</span>}</label>
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
