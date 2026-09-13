"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * @dynamic Visitor location on the client. Writes the `eu_geo` cookie
 * (30 days, no server storage) so every server-rendered distance, «κοντά
 * σου» card and map uses the same point, then refreshes the route.
 * `locate()` asks the browser (consent prompt), `setPlace()` stores a typed
 * place (geocoded via /api/geo/geocode), `clear()` returns to IP estimate.
 */
export interface VisitorGeo { lat: number; lng: number; city?: string; source: "gps" | "manual" }
const COOKIE = "eu_geo";

export function readVisitorGeo(): VisitorGeo | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`));
    return m ? (JSON.parse(decodeURIComponent(m[1])) as VisitorGeo) : null;
  } catch {
    return null;
  }
}
function writeVisitorGeo(g: VisitorGeo | null) {
  document.cookie = g ? `${COOKIE}=${encodeURIComponent(JSON.stringify(g))}; path=/; max-age=${30 * 86400}; SameSite=Lax` : `${COOKIE}=; path=/; max-age=0`;
  window.dispatchEvent(new CustomEvent("eu:geo", { detail: g }));
}

export function useVisitorGeo() {
  const router = useRouter();
  const [geo, setGeo] = useState<VisitorGeo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setGeo(readVisitorGeo());
    sync();
    window.addEventListener("eu:geo", sync);
    return () => window.removeEventListener("eu:geo", sync);
  }, []);

  const apply = useCallback((g: VisitorGeo | null) => { writeVisitorGeo(g); setGeo(g); router.refresh(); }, [router]);

  const locate = useCallback((): Promise<VisitorGeo | null> => new Promise((resolve) => {
    if (!navigator.geolocation) { setError("Ο browser δεν υποστηρίζει εντοπισμό."); return resolve(null); }
    setBusy(true); setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { const g: VisitorGeo = { lat: Math.round(pos.coords.latitude * 1e5) / 1e5, lng: Math.round(pos.coords.longitude * 1e5) / 1e5, source: "gps" }; apply(g); setBusy(false); resolve(g); },
      (e) => { setBusy(false); setError(e.code === e.PERMISSION_DENIED ? "Δεν δόθηκε άδεια τοποθεσίας. Μπορείς να γράψεις πόλη ή Τ.Κ." : "Δεν βρέθηκε η θέση σου. Δοκίμασε ξανά ή γράψε πόλη."); resolve(null); },
      { timeout: 8000, maximumAge: 300000 },
    );
  }), [apply]);

  const setPlace = useCallback(async (q: string): Promise<VisitorGeo | null> => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/geo/geocode?q=${encodeURIComponent(q)}`);
      const j = (await r.json()) as { lat?: number; lng?: number; label?: string; error?: string };
      if (!j.lat || !j.lng) { setError(j.error ?? "Δεν βρέθηκε αυτή η περιοχή."); return null; }
      const g: VisitorGeo = { lat: j.lat, lng: j.lng, city: j.label, source: "manual" };
      apply(g);
      return g;
    } catch {
      setError("Δεν βρέθηκε αυτή η περιοχή.");
      return null;
    } finally {
      setBusy(false);
    }
  }, [apply]);

  const clear = useCallback(() => apply(null), [apply]);
  return { geo, busy, error, locate, setPlace, clear };
}
