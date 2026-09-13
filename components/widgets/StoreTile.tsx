"use client";

import { useState } from "react";
import { isOpenToday, openLabel } from "@/lib/stores/open";
import { LocateFixed, Loader2, MapPin, Navigation, Wifi } from "lucide-react";
import type { NearStore } from "@/components/stores/NearestStoreCard";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("storeTile");

/**
 * @dynamic Bento tile «Το κατάστημά σου» (v4): a radar — concentric pulses
 * around the store dot — with the nearest member store already picked from
 * the request IP, distance, «ανοιχτό έως», live stock hint, and GPS
 * refinement on request. ΤΚ/city search still submits to /katastimata.
 */
export function StoreTile({ initial, geoCity, geoSource }: { initial: NearStore; geoCity?: string; geoSource: "ip" | "fallback" }) {
  const [store, setStore] = useState(initial);
  const [src, setSrc] = useState<"ip" | "fallback" | "gps">(geoSource);
  const [busy, setBusy] = useState(false);
  const locate = () => {
    if (!navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await fetch(`/api/stores/near?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`);
          const j = (await r.json()) as { stores: NearStore[] };
          if (j.stores?.[0]) {
            setStore(j.stores[0]);
            setSrc("gps");
          }
        } catch {}
        setBusy(false);
      },
      () => setBusy(false),
      { timeout: 8000, maximumAge: 300000 },
    );
  };
  return (
    <form action="/katastimata" className="relative bg-eu-blue text-white rounded-lg p-4 grid grid-rows-[auto_minmax(0,1fr)_auto] gap-2 overflow-hidden isolate">
      {/* radar */}
      <span className="pointer-events-none absolute -right-10 -top-10 size-44 rounded-full" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="absolute inset-0 rounded-full border border-white/25 animate-[eu-radar_3.6s_ease-out_infinite]" style={{ animationDelay: `${i * 1.2}s` }} />
        ))}
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-3 rounded-full bg-eu-yellow shadow-[0_0_0_6px_rgba(241,196,0,.25)]" />
      </span>
      <div className="relative">
        <div className="font-extrabold text-eu-yellow text-[length:var(--fs-13)] tracking-wide inline-flex items-center gap-1.5">
          <MapPin className="size-3.5" aria-hidden /> {c.to_katastima_soy}
        </div>
        <div className="font-heading font-bold text-[length:var(--fs-17)] leading-[1.25] mt-1 pr-16 line-clamp-1">{store.name}</div>
        <div className="text-eu-on-dark-3 text-[length:var(--fs-13-5)] mt-0.5 flex items-center gap-1.5 flex-wrap">
          <span className="tabular-nums">{store.distanceKm.toLocaleString("el-GR")} km</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <span className={`size-1.5 rounded-full ${isOpenToday(store.openUntil) ? "bg-eu-green shadow-[0_0_0_3px_rgba(34,160,80,.3)] animate-pulse" : "bg-eu-line-3"}`} aria-hidden /> {openLabel(store.openUntil)}
          </span>
        </div>
      </div>
      <div className="relative text-eu-on-dark-2 text-[length:var(--fs-13)] inline-flex items-center gap-1 self-end">
        {src === "gps" ? <Navigation className="size-3.5 text-eu-green" aria-hidden /> : <Wifi className="size-3.5" aria-hidden />}
        {src === "gps" ? "Ακριβής θέση" : src === "ip" ? `Εκτίμηση από το δίκτυό σου${geoCity ? ` · ${geoCity}` : ""}` : "Προεπιλογή Αθήνα"}
        {src !== "gps" && (
          <button type="button" onClick={locate} disabled={busy} aria-label={c.chrisi_tis_topothesias_moy} className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/12 px-2 min-h-7 font-bold text-white hover:bg-white/20 disabled:opacity-70">
            {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <LocateFixed className="size-3" aria-hidden />} GPS
          </button>
        )}
      </div>
      <div className="relative flex gap-1.5">
        <label className="sr-only" htmlFor="hero-store-q">
          {c.tachydromikos_kodikas_i_poli}
        </label>
        <input id="hero-store-q" name="q" placeholder={c.tk_i_poli} className="flex-1 min-w-0 rounded-full bg-white text-eu-ink placeholder:text-eu-muted-2 px-3 py-2.5 text-[length:var(--fs-14)] outline-none focus-visible:ring-2 ring-eu-yellow" />
        <button type="submit" className="rounded-full bg-eu-yellow text-eu-navy font-extrabold text-[length:var(--fs-14)] px-3.5 min-h-11 hover:bg-eu-yellow-dark">
          {c.vres}
        </button>
      </div>
    </form>
  );
}
