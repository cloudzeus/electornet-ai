"use client";

import { useState } from "react";
import Link from "next/link";
import { isOpenToday, openLabel } from "@/lib/stores/open";
import { LocateFixed, Loader2, MapPin, Navigation } from "lucide-react";
import type { NearStore, GeoSource } from "@/components/stores/NearestStoreCard";
import { useVisitorGeo, type VisitorGeo } from "@/lib/geo/client";
import { useSettings } from "@/components/site/SettingsProvider";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("storeTile");

/**
 * @dynamic Bento tile του δικτύου (v5). Μέχρι να δώσει ο πελάτης ΤΚ / πόλη ή GPS δεν δείχνουμε κανένα κατάστημα
 * (η εκτίμηση από το IP έβγαζε συχνά λάθος περιοχή): μόνο «350 καταστήματα… Ένα είναι δίπλα σου» και το πεδίο.
 * Το πεδίο γίνεται σημείο στον χάρτη (/api/geo/geocode) και το πλακίδιο δείχνει επιτόπου το πιο κοντινό κατάστημα·
 * η θέση μένει σε cookie, οπότε την επόμενη φορά το κατάστημα φαίνεται από την αρχή. Χωρίς JS: /katastimata?q=.
 */
export function StoreTile({ initial, geoCity, geoSource }: { initial: NearStore; geoCity?: string; geoSource: GeoSource }) {
  const { site } = useSettings();
  const [store, setStore] = useState(initial);
  const [src, setSrc] = useState<GeoSource>(geoSource);
  const [city, setCity] = useState(geoCity);
  const [q, setQ] = useState("");
  const { locate, setPlace, busy, error } = useVisitorGeo();
  const known = src === "gps" || src === "manual";
  const show = async (g: VisitorGeo | null) => {
    if (!g) return;
    try {
      const r = await fetch(`/api/stores/near?lat=${g.lat}&lng=${g.lng}`);
      const j = (await r.json()) as { stores: NearStore[] };
      if (j.stores?.[0]) { setStore(j.stores[0]); setSrc(g.source); setCity(g.city); setQ(""); }
    } catch {}
  };
  return (
    // κενό πεδίο: η φόρμα πάει κανονικά στη λίστα όλων των καταστημάτων
    <form action="/katastimata" onSubmit={(e) => { if (!q.trim()) return; e.preventDefault(); void setPlace(q.trim()).then(show); }} className="relative bg-eu-blue text-white rounded-lg p-4 grid grid-rows-[auto_minmax(0,1fr)_auto] gap-2 overflow-hidden isolate">
      {/* radar */}
      <span className="pointer-events-none absolute -right-10 -top-10 size-44 rounded-full" aria-hidden>
        {/* καθυστερήσεις ως κλάσεις (όχι style attribute — CSP)· «!» ώστε να μην τις μηδενίζει το shorthand της animate-[…] */}
        {["[animation-delay:0s]!", "[animation-delay:1.2s]!", "[animation-delay:2.4s]!"].map((d) => (
          <span key={d} className={`absolute inset-0 rounded-full border border-white/25 animate-[eu-radar_3.6s_ease-out_infinite] ${d}`} />
        ))}
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-3 rounded-full bg-eu-yellow shadow-[0_0_0_6px_rgba(241,196,0,.25)]" />
      </span>
      {known ? (
        <div className="relative">
          <div className="font-extrabold text-eu-yellow text-[length:var(--fs-13)] tracking-wide inline-flex items-center gap-1.5">
            <MapPin className="size-3.5" aria-hidden /> {c.to_katastima_soy}
          </div>
          <Link href={`/katastimata/${store.slug}`} className="block font-heading font-bold text-[length:var(--fs-17)] leading-[1.25] mt-1 pr-16 line-clamp-1 hover:underline">{store.name}</Link>
          <div className="text-eu-on-dark-3 text-[length:var(--fs-13-5)] mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className="tabular-nums">{store.distanceKm.toLocaleString("el-GR")} km</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <span className={`size-1.5 rounded-full ${isOpenToday(store.openUntil) ? "bg-eu-green shadow-[0_0_0_3px_rgba(34,160,80,.3)] animate-pulse" : "bg-eu-line-3"}`} aria-hidden /> {openLabel(store.openUntil)}
            </span>
          </div>
        </div>
      ) : (
        <div className="relative pr-16">
          <div className="font-heading font-bold text-[length:var(--fs-17)] leading-[1.25]">{site.brand.storesCount} {c.katastimata_se_oli_tin}</div>
          <div className="font-extrabold text-eu-yellow text-[length:var(--fs-15)] mt-0.5">{c.ena_einai_dipla_soy}</div>
        </div>
      )}
      <div className="relative self-end grid gap-1 text-eu-on-dark-2 text-[length:var(--fs-13)]">
        {error && <p role="alert" className="m-0 font-bold text-eu-yellow">{error}</p>}
        {known ? (
          <span className="inline-flex items-center gap-1">
            {src === "gps" ? <Navigation className="size-3.5 text-eu-green" aria-hidden /> : <MapPin className="size-3.5" aria-hidden />}
            {src === "gps" ? "Ακριβής θέση" : `Περιοχή${city ? `: ${city}` : " που όρισες"}`}
          </span>
        ) : (
          <button type="button" onClick={() => void locate().then(show)} disabled={busy} className="justify-self-start inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 min-h-9 font-bold text-white hover:bg-white/20 disabled:opacity-70">
            <LocateFixed className="size-3.5" aria-hidden /> {c.chrisi_tis_topothesias_moy}
          </button>
        )}
      </div>
      <div className="relative flex gap-1.5">
        <label className="sr-only" htmlFor="hero-store-q">
          {c.tachydromikos_kodikas_i_poli}
        </label>
        <input id="hero-store-q" name="q" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="postal-code" enterKeyHint="search" placeholder={known ? c.allos_tk_i_poli : c.tk_i_poli} className="flex-1 min-w-0 rounded-full bg-white text-eu-ink placeholder:text-eu-muted-2 px-3 py-2.5 text-[length:var(--fs-14)] max-md:text-base outline-none focus-visible:ring-2 ring-eu-yellow" />
        <button type="submit" disabled={busy} className="rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-14)] px-3.5 min-h-11 min-w-16 inline-flex items-center justify-center hover:bg-eu-yellow-dark disabled:opacity-70">
          {busy ? <Loader2 className="size-4 animate-spin" aria-label={c.anazitisi} /> : c.vres}
        </button>
      </div>
    </form>
  );
}
