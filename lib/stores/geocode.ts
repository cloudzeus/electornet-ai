import { db } from "@/lib/db";

/**
 * Geocoding via Nominatim (OpenStreetMap). Free, no key, max 1 request/s,
 * identifying User-Agent required. Address → point + display label.
 * Used to fill missing coordinates and to QA the published ones.
 */
export interface GeoResult { lat: number; lng: number; label: string; score: number }

export async function geocodeAddress(q: string, opts: { timeoutMs?: number; preferPlace?: boolean } = {}): Promise<GeoResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${opts.preferPlace ? 5 : 1}&countrycodes=gr&accept-language=el&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "User-Agent": "euronics-redesign/1.0 (store locator; admin@euronics.gr)" }, signal: AbortSignal.timeout(opts.timeoutMs ?? 15000) });
  if (!res.ok) return null;
  const j = (await res.json()) as { lat: string; lon: string; display_name: string; importance?: number; category?: string }[];
  // preferPlace (διεύθυνση πελάτη): μόνο οδοί, κτίρια, οικισμοί — ποτέ επιχείρηση με το ίδιο όνομα («Ηράκλειο Κρήτης» = κατάστημα ρούχων)·
  // και ανάμεσά τους ο οικισμός όταν είναι σαφώς πιο σημαντικός από έναν ομώνυμο δρόμο
  const ok = opts.preferPlace ? j.filter((x) => ["place", "boundary", "highway", "building", "landuse", "railway"].includes(x.category ?? "")) : j;
  let r = ok[0];
  if (opts.preferPlace && r) { const place = ok.find((x) => (x.category === "place" || x.category === "boundary") && (x.importance ?? 0) > (r.importance ?? 0) + 0.15); if (place) r = place; }
  return r ? { lat: Number(r.lat), lng: Number(r.lon), label: r.display_name, score: r.importance ?? 0 } : null;
}

export const distanceKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Geocode one store: tries street+zip+city, then zip+city, then city. Fills lat/lng when missing (or `force`), always records the QA fields. */
export async function geocodeStore(id: string, force = false) {
  const s = await db.store.findUniqueOrThrow({ where: { id } });
  const tries = [`${s.address}, ${s.zip} ${s.city}, Ελλάδα`, `${s.zip} ${s.city}, Ελλάδα`, `${s.city}, ${s.region}, Ελλάδα`];
  let r: GeoResult | null = null;
  for (const q of tries) {
    r = await geocodeAddress(q);
    if (r) break;
    await new Promise((res) => setTimeout(res, 1100));
  }
  if (!r) return { ok: false as const, error: "Δεν βρέθηκε η διεύθυνση." };
  const hasCoords = s.lat !== 0 || s.lng !== 0;
  const delta = hasCoords ? distanceKm({ lat: s.lat, lng: s.lng }, r) : null;
  const useIt = force || !hasCoords || s.geocoded !== "manual" && s.geocoded !== "site";
  await db.store.update({ where: { id }, data: { geoLat: r.lat, geoLng: r.lng, geoLabel: r.label, geoDeltaKm: delta, ...(useIt ? { lat: r.lat, lng: r.lng, geocoded: "nominatim", active: true } : {}) } });
  return { ok: true as const, lat: r.lat, lng: r.lng, label: r.label, deltaKm: delta, applied: useIt };
}
