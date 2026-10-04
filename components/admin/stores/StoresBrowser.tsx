"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, MapPin, Phone, Search } from "lucide-react";
import { StoreMapClient } from "./StoreMapClient";

export interface StoreRow { id: string; name: string; city: string; region: string; address: string; zip: string; phone: string | null; email: string | null; lat: number; lng: number; active: boolean; geocoded: string | null; geoDeltaKm: number | null; siteId: number | null }

const badge = "rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-11)] whitespace-nowrap";

/** Φίλτρα σε μία γραμμή: αναζήτηση, νομός (λίστα με πλήθη αντί για 50 κουμπιά), έλεγχοι γεωκωδικοποίησης. */
export function StoreFilters({ regions, qaCounts }: { regions: { region: string; count: number }[]; qaCounts: { total: number; far: number; nocoords: number; inactive: number } }) {
  const router = useRouter(), sp = useSearchParams();
  const q = sp.get("q") ?? "", region = sp.get("region") ?? "", qa = sp.get("qa") ?? "";
  const go = (p: Record<string, string>) => { const u = new URLSearchParams({ q, region, qa, ...p }); [...u.keys()].forEach((k) => !u.get(k) && u.delete(k)); router.push(`?${u}`); };
  const chip = (on: boolean) => `rounded-full px-3 min-h-11 inline-flex items-center gap-1 font-bold text-[length:var(--fs-13)] whitespace-nowrap ${on ? "bg-eu-navy text-white" : "bg-white border border-eu-line text-eu-ink hover:border-eu-navy"}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form onSubmit={(e) => { e.preventDefault(); go({ q: String(new FormData(e.currentTarget).get("q") ?? "") }); }} className="relative flex-[1_1_16rem] min-w-0">
        <Search className="size-4 text-eu-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
        <input name="q" defaultValue={q} placeholder="Όνομα, πόλη, Τ.Κ., email…" aria-label="Αναζήτηση καταστήματος" className="w-full rounded-full border border-eu-line bg-white pl-9 pr-4 min-h-11 text-[length:var(--fs-14)] outline-none focus:border-eu-blue" />
      </form>
      <select value={region} onChange={(e) => go({ region: e.target.value })} aria-label="Νομός" className="flex-[0_1_13rem] min-w-0 rounded-full border border-eu-line bg-white px-4 min-h-11 text-[length:var(--fs-14)] font-bold text-eu-ink">
        <option value="">Όλοι οι νομοί · {qaCounts.total}</option>
        {regions.map((r) => <option key={r.region} value={r.region}>{r.region} · {r.count}</option>)}
      </select>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => go({ qa: "" })} className={chip(!qa)}>Όλα</button>
        <button type="button" onClick={() => go({ qa: "far" })} className={chip(qa === "far")}><AlertTriangle className="size-3.5" aria-hidden /> Απόκλιση &gt;2 km · {qaCounts.far}</button>
        <button type="button" onClick={() => go({ qa: "nocoords" })} className={chip(qa === "nocoords")}>Χωρίς συντεταγμένες · {qaCounts.nocoords}</button>
        <button type="button" onClick={() => go({ qa: "manual" })} className={chip(qa === "manual")}>Χειροκίνητα</button>
        <button type="button" onClick={() => go({ qa: "inactive" })} className={chip(qa === "inactive")}>Ανενεργά · {qaCounts.inactive}</button>
      </div>
    </div>
  );
}

/** Λίστα και χάρτης δίπλα-δίπλα (φαρδιά οθόνη): η λίστα κυλά μόνη της, ο χάρτης μένει ορατός· σε στενή οθόνη ο χάρτης πάνω. */
export function StoresBrowser({ rows, total }: { rows: StoreRow[]; total: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const markers = rows.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, label: `${s.name} · ${s.city}`, href: `/admin/stores/${s.id}`, tone: (!s.active ? "yellow" : (s.geoDeltaKm ?? 0) > 2 ? "red" : "navy") as "yellow" | "red" | "navy" }));
  return (
    <div className="@container">
      <div className="grid gap-3 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] @4xl:items-start">
        <div className="order-1 @4xl:order-2 @4xl:sticky @4xl:top-3 h-[42vh] min-h-[280px] @4xl:h-[max(26rem,calc(100dvh-16rem))]">
          <StoreMapClient markers={markers} height="100%" highlight={hover} />
        </div>
        <section aria-label="Λίστα καταστημάτων" className="order-2 @4xl:order-1 rounded-xl border border-eu-line bg-white min-w-0 @4xl:h-[max(26rem,calc(100dvh-16rem))] flex flex-col">
          <div className="px-3 py-2 border-b border-eu-line text-eu-muted text-[length:var(--fs-13)] flex items-center justify-between gap-2"><span><strong className="text-eu-ink tabular-nums">{rows.length}</strong> από {total} καταστήματα</span><span className="hidden @4xl:inline">Πέρασε πάνω από ένα για να φανεί στον χάρτη</span></div>
          <ul className="m-0 p-0 list-none divide-y divide-eu-line-2 @4xl:overflow-y-auto @4xl:flex-1 min-h-0">
            {rows.map((s) => {
              const noCoords = !s.lat && !s.lng;
              return (
                <li key={s.id} onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover((h) => (h === s.id ? null : h))} onFocus={() => setHover(s.id)}
                  className={`px-3 py-2.5 grid gap-1 transition-colors ${hover === s.id ? "bg-eu-chip/50" : "hover:bg-eu-surface/60"}`}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                    <Link href={`/admin/stores/${s.id}`} className="font-bold text-eu-navy hover:underline text-[length:var(--fs-14)] min-h-6 min-w-0 break-words">{s.name}</Link>
                    {!s.active && <span className={`${badge} bg-eu-yellow/30 text-eu-ink`}>Ανενεργό</span>}
                    {noCoords ? <span className={`${badge} bg-eu-red/10 text-eu-red`}>χωρίς συντεταγμένες</span>
                      : s.geoDeltaKm != null && s.geoDeltaKm > 2 ? <span className={`${badge} bg-eu-red/10 text-eu-red`}>απόκλιση {s.geoDeltaKm.toFixed(1)} km</span>
                      : s.geoDeltaKm != null ? <span className={`${badge} bg-eu-green/12 text-eu-ink`}>✓ {s.geoDeltaKm.toFixed(2)} km</span> : null}
                    {s.geocoded === "manual" && <span className={`${badge} bg-eu-surface text-eu-ink-3`}>χειροκίνητα</span>}
                  </div>
                  <div className="flex items-start gap-1.5 text-eu-ink-2 text-[length:var(--fs-13)] min-w-0"><MapPin className="size-3.5 shrink-0 mt-0.5 text-eu-muted" aria-hidden /><span className="min-w-0 break-words">{s.address}, {s.zip} {s.city} <span className="text-eu-muted">· {s.region}</span></span></div>
                  {(s.phone || s.email) && <div className="flex flex-wrap items-center gap-x-3 text-eu-muted text-[length:var(--fs-12)] min-w-0">{s.phone && <span className="inline-flex items-center gap-1 tabular-nums"><Phone className="size-3" aria-hidden />{s.phone}</span>}{s.email && <span className="break-all">{s.email}</span>}</div>}
                </li>
              );
            })}
            {!rows.length && <li className="p-8 text-center text-eu-muted text-[length:var(--fs-14)]">Κανένα κατάστημα με αυτά τα κριτήρια.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
