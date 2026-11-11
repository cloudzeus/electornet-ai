import "server-only";
import { db } from "@/lib/db";
import { geocodeAddress, type GeoResult } from "@/lib/stores/geocode";

/**
 * Θέση στον χάρτη για συνεργάτες και μεταφορείς (Partner/Carrier lat, lng, geoSource, geoLabel).
 * geoSource: nominatim (από τη διεύθυνση) · store (από συνδεδεμένο κατάστημα) · manual (μετακινήθηκε με το χέρι, δεν αλλάζει αυτόματα).
 * Nominatim: 1 αίτημα το δευτερόλεπτο.
 */
export type GeoEntity = "partner" | "carrier";
export interface GeoPoint { lat: number; lng: number; source: string | null; label: string | null }

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function lookup(address: string | null, zip: string | null, city: string | null): Promise<GeoResult | null> {
  const tries = [address && city ? `${address}, ${zip ?? ""} ${city}, Ελλάδα` : null, zip || city ? `${zip ?? ""} ${city ?? ""}, Ελλάδα` : null, city ? `${city}, Ελλάδα` : null].filter(Boolean) as string[];
  for (let i = 0; i < tries.length; i++) {
    if (i) await wait(1100);
    const r = await geocodeAddress(tries[i]).catch(() => null);
    if (r) return r;
  }
  return null;
}

/** Συνεργάτης: πρώτα η διεύθυνσή του· αν δεν βρεθεί, η θέση του καταστήματος της έδρας (ή του πρώτου συνδεδεμένου). */
export async function geocodePartner(id: string, force = false) {
  const p = await db.partner.findUniqueOrThrow({ where: { id }, select: { address: true, zip: true, city: true, geoSource: true, lat: true, branches: { orderBy: { isCenter: "desc" }, select: { store: { select: { lat: true, lng: true, name: true } } } } } });
  if (p.geoSource === "manual" && p.lat != null && !force) return { ok: true as const, skipped: true };
  const r = await lookup(p.address, p.zip, p.city);
  const st = p.branches.map((b) => b.store).find((s) => s && (s.lat || s.lng));
  const data = r ? { lat: r.lat, lng: r.lng, geoSource: "nominatim", geoLabel: r.label } : st ? { lat: st.lat, lng: st.lng, geoSource: "store", geoLabel: `Κατάστημα ${st.name}` } : null;
  if (!data) { await db.partner.update({ where: { id }, data: { geocodedAt: new Date() } }); return { ok: false as const, error: "Η διεύθυνση δεν βρέθηκε στον χάρτη. Μετακίνησε τον δείκτη με το χέρι." }; }
  await db.partner.update({ where: { id }, data: { ...data, geocodedAt: new Date() } });
  return { ok: true as const, ...data };
}

export async function geocodeCarrier(id: string, force = false) {
  const c = await db.carrier.findUniqueOrThrow({ where: { id }, select: { address: true, zip: true, city: true, geoSource: true, lat: true } });
  if (c.geoSource === "manual" && c.lat != null && !force) return { ok: true as const, skipped: true };
  const r = await lookup(c.address, c.zip, c.city);
  if (!r) { await db.carrier.update({ where: { id }, data: { geocodedAt: new Date() } }); return { ok: false as const, error: "Η διεύθυνση δεν βρέθηκε στον χάρτη. Μετακίνησε τον δείκτη με το χέρι." }; }
  const data = { lat: r.lat, lng: r.lng, geoSource: "nominatim", geoLabel: r.label };
  await db.carrier.update({ where: { id }, data: { ...data, geocodedAt: new Date() } });
  return { ok: true as const, ...data };
}

export const geocodeEntity = (e: GeoEntity, id: string, force = false) => (e === "partner" ? geocodePartner(id, force) : geocodeCarrier(id, force));

export async function setManualPoint(e: GeoEntity, id: string, lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error("Μη έγκυρες συντεταγμένες");
  const data = { lat, lng, geoSource: "manual", geoLabel: "Ορίστηκε στον χάρτη", geocodedAt: new Date() };
  if (e === "partner") await db.partner.update({ where: { id }, data });
  else await db.carrier.update({ where: { id }, data });
}

/** Όσοι δεν έχουν θέση και δεν δοκιμάστηκαν ακόμη (geocodedAt κενό), λίγοι κάθε φορά λόγω του ορίου του Nominatim. */
export async function geocodeMissing(e: GeoEntity, limit = 15) {
  const where = { lat: null, geocodedAt: null, active: true };
  const ids = e === "partner"
    ? (await db.partner.findMany({ where, take: limit, select: { id: true } })).map((x) => x.id)
    : (await db.carrier.findMany({ where: { ...where, s1Missing: false, role: { in: ["agency", "courier", "driver"] } }, take: limit, select: { id: true } })).map((x) => x.id);
  let done = 0;
  for (const id of ids) {
    const r = await geocodeEntity(e, id).catch(() => ({ ok: false as const }));
    if (r.ok) done++;
    await wait(1100);
  }
  const left = e === "partner" ? await db.partner.count({ where }) : await db.carrier.count({ where: { ...where, s1Missing: false, role: { in: ["agency", "courier", "driver"] } } });
  return { done, failed: ids.length - done, left };
}
