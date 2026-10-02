"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Search, AlertTriangle, Layers } from "lucide-react";
import type { CalendarDay, CalendarPromo } from "@/lib/promo/admin";
import { STATUS_LABEL, type PromoStatus } from "@/lib/promo/catalog";
import { searchTargetsAction, simulateAction, type SimResult } from "@/app/admin/(shell)/prosfores/actions";

const COL = 30;
const NAME = 240;
const BAR: Record<string, string> = { active: "bg-eu-green", scheduled: "bg-eu-blue", paused: "bg-eu-amber", pending: "bg-eu-yellow" };
const eur = (c: number) => `${(c / 100).toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Gantt έξι εβδομάδων με ζώνη επικαλύψεων και επιθεωρητή «τι ισχύει σε αυτό το προϊόν αυτή την ημέρα». */
export function PromoCalendar({ from, promos, days }: { from: string; promos: CalendarPromo[]; days: CalendarDay[] }) {
  const start = new Date(from).getTime();
  const [day, setDay] = useState<number | null>(null);
  const byId = new Map(promos.map((p) => [p.id, p]));
  const idx = (iso: string | null, end: boolean) => { if (!iso) return end ? days.length : 0; const k = (new Date(iso).getTime() - start) / 86400_000; return Math.max(0, Math.min(days.length, end ? Math.ceil(k) : Math.floor(k))); };
  const width = NAME + days.length * COL;
  const sel = day != null ? days[day] : null;

  return (
    <div className="grid gap-4 min-w-0">
      <div className="rounded-2xl border border-eu-line bg-white overflow-x-auto">
        <div style={{ width }} className="relative">
          {/* κεφαλίδα ημερών */}
          <div className="flex sticky top-0 bg-white z-10 border-b border-eu-line">
            <div style={{ width: NAME }} className="shrink-0 px-3 py-2 text-eu-muted text-[length:var(--fs-13)] font-bold sticky left-0 bg-white">Προσφορά</div>
            {days.map((d, i) => { const dt = new Date(d.date); const wk = dt.getDay() === 0 || dt.getDay() === 6; return (
              <div key={d.date} style={{ width: COL }} className={`shrink-0 text-center py-1 text-[length:var(--fs-13)] ${wk ? "bg-eu-surface" : ""} ${dt.getDate() === 1 || i === 0 ? "border-l-2 border-eu-navy" : ""}`}>
                <div className={`leading-none ${dt.getDate() === 1 || i === 0 ? "font-extrabold text-eu-navy" : "text-eu-muted"}`}>{dt.getDate() === 1 || i === 0 ? dt.toLocaleDateString("el-GR", { month: "short" }).slice(0, 3) : "ΚΔΤΤΠΠΣ"[dt.getDay()]}</div><div className="font-bold text-eu-ink leading-tight tabular-nums">{dt.getDate()}</div>
              </div>
            ); })}
          </div>
          {/* ζώνη επικαλύψεων */}
          <div className="flex border-b border-eu-line">
            <div style={{ width: NAME }} className="shrink-0 px-3 py-2 text-eu-ink-2 text-[length:var(--fs-13)] font-bold sticky left-0 bg-white inline-flex items-center gap-1.5"><Layers className="size-4" aria-hidden /> Επικαλύψεις</div>
            {days.map((d, i) => {
              const price = d.clashes.filter((c) => c.kind === "price").length, comb = d.clashes.length - price;
              const tone = price ? (price > 2 ? "bg-eu-amber text-white" : "bg-eu-yellow text-eu-navy") : comb ? "bg-eu-chip text-eu-blue" : "";
              return (
                <button key={d.date} type="button" style={{ width: COL }} onClick={() => setDay(i)} aria-label={`${new Date(d.date).toLocaleDateString("el-GR")}: ${d.live} προσφορές, ${d.clashes.length} επικαλύψεις`} aria-pressed={day === i}
                  className={`shrink-0 h-9 text-[length:var(--fs-13)] font-extrabold tabular-nums border-l border-white ${tone} ${day === i ? "outline-2 outline-eu-navy -outline-offset-2" : ""} hover:outline-2 hover:outline-eu-blue hover:-outline-offset-2`}>
                  {d.clashes.length || ""}
                </button>
              );
            })}
          </div>
          {/* μπάρες */}
          {promos.map((p) => {
            const a = idx(p.startsAt, false), b = idx(p.endsAt, true);
            return (
              <div key={p.id} className="flex items-center border-b border-eu-line-2 min-h-11">
                <Link href={`/admin/prosfores/${p.id}`} style={{ width: NAME }} className="shrink-0 px-3 py-1.5 sticky left-0 bg-white hover:text-eu-blue">
                  <span className="block font-bold text-eu-ink text-[length:var(--fs-13)] truncate">{p.name}</span>
                  <span className="block text-eu-muted text-[length:var(--fs-13)] truncate">{STATUS_LABEL[p.status as PromoStatus]?.label} · {p.products ? `${p.products.toLocaleString("el-GR")} προϊόντα` : "όλο το καλάθι"}</span>
                </Link>
                <div className="relative h-7" style={{ width: days.length * COL }}>
                  {b > a && <Link href={`/admin/prosfores/${p.id}`} title={`${p.name} · ${p.code}`} className={`absolute top-0 h-7 rounded-md ${BAR[p.status] ?? "bg-eu-muted"} ${p.status === "pending" ? "bg-[repeating-linear-gradient(45deg,var(--color-eu-yellow)_0_6px,#fff_6px_10px)]" : ""} text-white text-[length:var(--fs-13)] font-bold px-2 truncate leading-7`} style={{ left: a * COL + 1, width: (b - a) * COL - 2 }}>{p.status === "pending" ? "" : p.code}</Link>}
                </div>
              </div>
            );
          })}
          {!promos.length && <p className="m-0 p-6 text-eu-muted text-[length:var(--fs-14)]">Καμία προσφορά σε αυτές τις εβδομάδες.</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-4 items-start">
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
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: string; label: string }[]>([]);
  const [prod, setProd] = useState<{ id: string; label: string } | null>(null);
  const [date, setDate] = useState("");
  const [res, setRes] = useState<SimResult | null>(null);
  const [busy, start] = useTransition();
  const when = date || (defaultDate ? defaultDate.slice(0, 10) : "");
  const run = (p = prod) => p && start(async () => setRes(await simulateAction({ items: [{ productId: p.id, qty: 1 }], coupon: null, customer: "guest", zip: null, payment: "card", delivery: "courier", at: when ? `${when}T12:00` : null, drafts: true })));
  return (
    <section className="rounded-2xl bg-white border border-eu-line p-4 @md:p-5 grid gap-3">
      <h3 className="m-0 font-extrabold text-eu-navy text-[length:var(--fs-15)]">Επιθεωρητής προϊόντος / ημέρας</h3>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden />
        <input aria-label="Προϊόν" value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value.trim().length >= 2) void searchTargetsAction("product", e.target.value).then(setFound); else setFound([]); }} placeholder={prod ? prod.label : "Προϊόν: τίτλος, κωδικός, EAN"} className="w-full rounded-xl border-2 border-eu-line pl-9 pr-3 min-h-11 text-[length:var(--fs-15)]" />
        {found.length > 0 && <ul className="absolute z-10 left-0 right-0 mt-1 m-0 p-0 list-none max-h-64 overflow-y-auto rounded-xl border border-eu-line bg-white shadow-[var(--shadow-raised)] divide-y divide-eu-line">{found.map((f) => <li key={f.id}><button type="button" onClick={() => { setProd(f); setQ(""); setFound([]); run(f); }} className="w-full text-left px-3 py-2 min-h-11 hover:bg-eu-chip text-[length:var(--fs-14)] font-semibold">{f.label}</button></li>)}</ul>}
      </div>
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
