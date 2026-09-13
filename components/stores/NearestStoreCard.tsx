"use client";

import { useState } from "react";
import { openLabel } from "@/lib/stores/open";
import { LocateFixed, Loader2, Wifi, Navigation, MapPin } from "lucide-react";
import { useVisitorGeo } from "@/lib/geo/client";
import { copyOf } from "@/lib/cms/copy";

const c = copyOf("nearestStore");

export interface NearStore {
  id: string;
  slug: string;
  name: string;
  city: string;
  distanceKm: number;
  openUntil: string;
  lat?: number;
  lng?: number;
}

/**
 * @dynamic Nearest store, two levels of precision: the server picks it from
 * the request IP (city level, no prompt); the customer can refine with GPS
 * («Χρήση της τοποθεσίας μου», consent through the browser prompt). The
 * chosen store feeds click-and-collect, stock and the advisor hand-off.
 */
export type GeoSource = "ip" | "fallback" | "gps" | "manual";
export function NearestStoreCard({ initial, geoCity, geoSource, variant = "card" }: { initial: NearStore; geoCity?: string; geoSource: GeoSource; variant?: "card" | "button" }) {
  const [store, setStore] = useState(initial);
  const [src, setSrc] = useState<GeoSource>(geoSource);
  const { locate: locateVisitor, busy, error: geoError } = useVisitorGeo();
  const [err, setErr] = useState<string | null>(null);
  const locate = async () => {
    setErr(null);
    const g = await locateVisitor();
    if (!g) return;
    try {
      const r = await fetch(`/api/stores/near?lat=${g.lat}&lng=${g.lng}`);
      const j = (await r.json()) as { stores: NearStore[] };
      if (j.stores?.[0]) { setStore(j.stores[0]); setSrc("gps"); }
    } catch {
      setErr("Δεν βρέθηκε κατάστημα κοντά σου.");
    }
  };
  const note = src === "gps" ? "ακριβής θέση (GPS)" : src === "manual" ? `περιοχή που όρισες${geoCity ? `: ${geoCity}` : ""}` : src === "ip" ? `εκτίμηση από το δίκτυό σου${geoCity ? ` · ${geoCity}` : ""}` : "προεπιλογή Αθήνα";
  const shownErr = err ?? geoError;
  if (variant === "button")
    return (
      <div className="grid gap-1">
        <button type="button" onClick={locate} disabled={busy} className="inline-flex items-center gap-1.5 font-bold text-eu-yellow text-[length:var(--fs-14)] min-h-11 hover:underline disabled:opacity-70">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LocateFixed className="size-4" aria-hidden />} {src === "gps" ? "Η θέση σου εντοπίστηκε" : "Χρήση της τοποθεσίας μου για ακρίβεια"}
        </button>
        {shownErr && <span className="text-eu-on-dark-2 text-[length:var(--fs-14)]">{shownErr}</span>}
      </div>
    );
  return (
    <div className="bg-white text-eu-ink rounded-lg p-3 grid gap-2 shadow-[var(--shadow-raised)]">
      <div className="flex justify-between items-center gap-3">
        <div className="min-w-0">
          <div className="font-bold text-[length:var(--fs-15)] leading-[1.3] line-clamp-2 break-words">{store.name}</div>
          <div className="font-medium text-eu-muted text-[length:var(--fs-13-5)] mt-0.5">
            {store.distanceKm.toLocaleString("el-GR")} km · {openLabel(store.openUntil)}
          </div>
        </div>
        <a href={`https://maps.google.com/?q=${store.lat},${store.lng}`} className="rounded-full bg-eu-navy text-white font-extrabold text-[length:var(--fs-13-5)] px-3.5 py-2.5 min-h-10 inline-flex items-center shrink-0 hover:bg-eu-blue">
          {c.odigies}
        </a>
      </div>
      <div className="flex items-center justify-between gap-2 text-[length:var(--fs-13)] text-eu-muted">
        <span className="inline-flex items-center gap-1">
          {src === "gps" ? <Navigation className="size-3.5 text-eu-green" aria-hidden /> : src === "manual" ? <MapPin className="size-3.5 text-eu-blue" aria-hidden /> : <Wifi className="size-3.5" aria-hidden />} {note}
        </span>
        {src !== "gps" && src !== "manual" && (
          <button type="button" onClick={locate} disabled={busy} className="inline-flex items-center gap-1 font-bold text-eu-blue hover:underline disabled:opacity-70">
            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <LocateFixed className="size-3.5" aria-hidden />} Ακριβής θέση
          </button>
        )}
      </div>
      {shownErr && <div className="text-eu-amber text-[length:var(--fs-13)]">{shownErr}</div>}
    </div>
  );
}
