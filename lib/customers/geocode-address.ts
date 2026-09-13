import { db } from "@/lib/db";
import { geocodeAddress, distanceKm } from "@/lib/stores/geocode";

/**
 * Geocodes a customer address (Nominatim, GR) and stores lat/lng, the label,
 * the nearest active store and its distance — the basis for location
 * segmentation (by prefecture, by store catchment, by radius). Coordinates
 * given by the client (GPS at checkout) or set by staff are kept as-is.
 */
export async function geocodeCustomerAddress(addressId: string, opts: { force?: boolean } = {}) {
  const a = await db.address.findUnique({ where: { id: addressId } });
  if (!a) return { ok: false as const, error: "Η διεύθυνση δεν βρέθηκε." };
  let lat = a.lat, lng = a.lng, source = a.geoSource, label = a.geoLabel;
  if (opts.force || lat == null || lng == null || source === "nominatim") {
    if (!(source === "manual" || source === "client") || opts.force) {
      const q = [`${a.street}${a.number ? ` ${a.number}` : ""}, ${a.zip} ${a.city}, Ελλάδα`, `${a.zip} ${a.city}, Ελλάδα`, `${a.city}, ${a.region}, Ελλάδα`];
      let r = null;
      for (const query of q) { r = await geocodeAddress(query).catch(() => null); if (r) break; await new Promise((res) => setTimeout(res, 1100)); }
      if (!r) return { ok: false as const, error: "Δεν βρέθηκε η διεύθυνση στον χάρτη." };
      lat = r.lat; lng = r.lng; source = "nominatim"; label = r.label;
    }
  }
  if (lat == null || lng == null) return { ok: false as const, error: "Χωρίς συντεταγμένες." };
  const near = await nearestStore({ lat, lng });
  await db.address.update({ where: { id: addressId }, data: { lat, lng, geoSource: source, geoLabel: label, geocodedAt: new Date(), nearestStoreId: near?.id ?? null, nearestKm: near?.km ?? null } });
  // default address → suggested preferred store when the customer has none
  if (a.isDefault && near) await db.customer.updateMany({ where: { id: a.customerId, preferredStoreId: null }, data: { preferredStoreId: near.id } });
  return { ok: true as const, lat, lng, nearestStore: near };
}

export async function nearestStore(p: { lat: number; lng: number }) {
  const stores = await db.store.findMany({ where: { active: true, NOT: { lat: 0 } }, select: { id: true, name: true, city: true, lat: true, lng: true } });
  let best: { id: string; name: string; city: string; km: number } | null = null;
  for (const s of stores) { const km = distanceKm(p, s); if (!best || km < best.km) best = { id: s.id, name: s.name, city: s.city, km: Math.round(km * 10) / 10 }; }
  return best;
}

/** Fire-and-forget after a save (Nominatim is rate limited; failures are silent, the QA filter shows «χωρίς συντεταγμένες»). */
export function geocodeLater(addressId: string) {
  setTimeout(() => { geocodeCustomerAddress(addressId).catch(() => null); }, 50);
}
