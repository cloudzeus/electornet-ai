"use client";

import { useState } from "react";
import { LocateFixed, Loader2, MapPin, X, Search } from "lucide-react";
import { useVisitorGeo } from "@/lib/geo/client";

/**
 * @dynamic «Κοντά σου» controls for the locator: use my location (GPS) or
 * type a place. The chosen point becomes the visitor location for the whole
 * site (cookie) and the page re-renders sorted by distance from it.
 */
export function LocateBar({ sourceLabel }: { sourceLabel: string }) {
  const { geo, busy, error, locate, setPlace, clear } = useVisitorGeo();
  const [q, setQ] = useState("");
  return (
    <div className="rounded-2xl bg-white border border-eu-line p-3 grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 font-bold text-eu-ink text-[length:var(--fs-14)]"><MapPin className="size-4 text-eu-blue" aria-hidden /> Αποστάσεις από: <span className="font-normal text-eu-ink-3">{sourceLabel}</span></span>
        {geo && <button type="button" onClick={clear} className="inline-flex items-center gap-1 rounded-full px-2.5 min-h-9 font-bold text-eu-muted text-[length:var(--fs-13)] hover:bg-eu-surface"><X className="size-3.5" aria-hidden /> Επαναφορά</button>}
      </div>
      <div className="grid grid-cols-1 @md:grid-cols-[auto_minmax(0,1fr)] gap-2">
        <button type="button" onClick={() => locate()} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-blue disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LocateFixed className="size-4" aria-hidden />} {geo?.source === "gps" ? "Ανανέωση θέσης" : "Χρήση της τοποθεσίας μου"}
        </button>
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) setPlace(q.trim()); }} className="flex gap-2">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-eu-muted" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Κοντά σε: πόλη, Τ.Κ. ή διεύθυνση" className="w-full rounded-full border-2 border-eu-line pl-9 pr-3 min-h-11 text-[length:var(--fs-15)] outline-none focus:border-eu-blue" aria-label="Κοντά σε" />
          </label>
          <button type="submit" disabled={busy || !q.trim()} className="rounded-full border-2 border-eu-navy text-eu-navy font-extrabold text-[length:var(--fs-14)] px-4 min-h-11 hover:bg-eu-surface disabled:opacity-50">Εύρεση</button>
        </form>
      </div>
      {error && <p role="alert" className="m-0 text-eu-red font-bold text-[length:var(--fs-14)]">{error}</p>}
      <p className="m-0 text-eu-muted text-[length:var(--fs-13)]">Η θέση σου μένει μόνο στον browser σου (cookie 30 ημερών) και δεν αποθηκεύεται στους servers μας.</p>
    </div>
  );
}
