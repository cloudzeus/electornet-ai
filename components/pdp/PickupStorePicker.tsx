"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { LocateFixed, Loader2, MapPin, Clock } from "lucide-react";
import type { Store } from "@/lib/data/types";
import { useVisitorGeo, readVisitorGeo } from "@/lib/geo/client";
import { distanceKm } from "@/lib/geo/distance";

export type PickupStore = Pick<Store, "id" | "slug" | "name" | "member" | "address" | "city" | "openUntil" | "lat" | "lng">;

const km = (d: number) => `${d.toLocaleString("el-GR", { maximumFractionDigits: d < 10 ? 1 : 0 })} km`;
const until = (s: string) => (/^\d/.test(s) ? `ανοιχτό έως ${s}` : "κλειστό σήμερα");

/**
 * @dynamic «Παραλαβή από κατάστημα»: finds the visitor (GPS after the click
 * that opened it, or a typed city/Τ.Κ.), ranks stores by distance and
 * preselects the nearest. Location stays in the `eu_geo` cookie only.
 */
export function PickupStorePicker({ stores, value, onChange, stockLine, hoursLabel, keep = false }: {
  stores: PickupStore[];
  value: string;
  onChange: (id: string) => void;
  stockLine: (s: PickupStore) => React.ReactNode;
  hoursLabel: string;
  /** value is the visitor's earlier choice → keep it, don't re-propose or re-ask */
  keep?: boolean;
}) {
  const { geo, busy, error, locate, setPlace } = useVisitorGeo();
  const [manual, setManual] = useState(keep);
  const [askPlace, setAskPlace] = useState(false);
  const [q, setQ] = useState("");
  const asked = useRef(false);

  const ranked = useMemo(
    () => (geo ? stores.map((s) => ({ s, d: distanceKm(geo, s) })).sort((a, b) => a.d - b.d) : stores.map((s) => ({ s, d: null as number | null }))),
    [geo, stores],
  );

  // opened by a click on «Παραλαβή» → ask for location once, only if we don't have it
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    if (!keep && !readVisitorGeo()) locate();
  }, [locate, keep]);

  // propose the nearest until the visitor picks one themselves
  useEffect(() => {
    if (geo && !manual && ranked[0]) onChange(ranked[0].s.id);
  }, [geo, manual, ranked, onChange]);

  const pick = (id: string) => { setManual(true); onChange(id); };
  const near = geo ? ranked.slice(0, 3) : [];
  const sel = ranked.find((r) => r.s.id === value);
  const showPlace = askPlace || (!!error && !geo);

  return (
    <div className="grid gap-3 mt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-13-5)]">
        {busy ? (
          <span className="inline-flex items-center gap-2 text-eu-ink-2"><Loader2 className="size-4 animate-spin" aria-hidden /> Βρίσκω το κοντινότερο κατάστημα…</span>
        ) : geo ? (
          <>
            <span className="inline-flex items-center gap-2 text-eu-ink-2 min-w-0"><MapPin className="size-4 text-eu-blue shrink-0" aria-hidden /> <span className="truncate">Κοντά σε: {geo.source === "gps" ? "την τοποθεσία σου" : geo.city ?? "την περιοχή σου"}</span></span>
            <button type="button" onClick={() => setAskPlace((v) => !v)} className="ml-auto text-eu-blue font-bold underline underline-offset-2 min-h-11 sm:min-h-0 cursor-pointer">Αλλαγή</button>
          </>
        ) : (
          <button type="button" onClick={() => locate()} className="inline-flex items-center gap-2 rounded-full border-2 border-eu-navy text-eu-navy font-bold px-4 min-h-11 hover:bg-white transition-colors cursor-pointer">
            <LocateFixed className="size-4" aria-hidden /> Βρες το κοντινότερο κατάστημα
          </button>
        )}
      </div>

      {error && !geo && <p role="alert" className="m-0 text-eu-ink-2 text-[length:var(--fs-13-5)]">{error}</p>}

      {showPlace && (
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) setPlace(q.trim()).then((g) => { if (g) { setAskPlace(false); setManual(false); setQ(""); } }); }} className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Πόλη ή Τ.Κ." aria-label="Πόλη ή ταχυδρομικός κώδικας" autoComplete="postal-code" className="flex-1 min-w-0 rounded-lg border border-eu-line bg-white px-3 min-h-11 text-[length:var(--fs-15)] outline-none focus:border-eu-blue" />
          <button type="submit" disabled={busy || !q.trim()} className="rounded-lg bg-eu-navy text-white font-bold px-4 min-h-11 hover:bg-eu-blue disabled:opacity-50 transition-colors cursor-pointer">Εύρεση</button>
        </form>
      )}
      {askPlace && geo && (
        <button type="button" onClick={() => { setAskPlace(false); setManual(false); locate(); }} className="justify-self-start inline-flex items-center gap-2 text-eu-blue font-bold text-[length:var(--fs-13-5)] min-h-11 cursor-pointer">
          <LocateFixed className="size-4" aria-hidden /> Χρήση της τοποθεσίας μου
        </button>
      )}

      {near.length > 0 && (
        <div role="radiogroup" aria-label="Κοντινότερα καταστήματα" className="grid gap-2">
          {near.map(({ s, d }, i) => {
            const on = s.id === value;
            return (
              <button key={s.id} type="button" role="radio" aria-checked={on} onClick={() => pick(s.id)}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 rounded-lg border bg-white px-3 py-2.5 text-left min-h-11 transition-colors cursor-pointer ${on ? "border-eu-blue ring-1 ring-eu-blue" : "border-eu-line hover:border-eu-blue/50"}`}>
                <span className="font-bold text-eu-ink text-[length:var(--fs-14)] truncate">{s.city}</span>
                <span className="font-bold text-eu-ink text-[length:var(--fs-14)] tabular-nums">{d !== null && km(d)}</span>
                <span className="text-eu-muted text-[length:var(--fs-13)] truncate">{s.member ?? s.name}</span>
                <span className="text-[length:var(--fs-13)] text-eu-green font-bold">{i === 0 ? "κοντινότερο" : ""}</span>
              </button>
            );
          })}
        </div>
      )}

      <label className="grid gap-1">
        <span className="text-eu-muted text-[length:var(--fs-13)]">{near.length ? "Ή άλλο κατάστημα" : "Κατάστημα παραλαβής"}</span>
        <select value={value} onChange={(e) => pick(e.target.value)} className="w-full min-w-0 rounded-lg border border-eu-line bg-white px-3 min-h-11 text-[length:var(--fs-14)] cursor-pointer">
          {ranked.map(({ s, d }) => (
            <option key={s.id} value={s.id}>{s.city} — {s.member ?? s.name}{d !== null ? ` · ${km(d)}` : ""}</option>
          ))}
        </select>
      </label>

      {sel && (
        <div className="grid gap-1 rounded-lg bg-white border border-eu-line px-3 py-2.5 text-[length:var(--fs-13-5)] text-eu-ink-2">
          <div>{stockLine(sel.s)}</div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5 text-eu-muted" aria-hidden /> {sel.s.address}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5 text-eu-muted" aria-hidden /> {until(sel.s.openUntil)}</span>
            <span aria-hidden>·</span>
            <Link href={`/katastimata/${sel.s.slug}`} className="text-eu-blue underline underline-offset-2">{hoursLabel}</Link>
          </div>
        </div>
      )}
    </div>
  );
}
