"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { fetchLiveStores, upsertStores, slugify } from "@/lib/stores/import";
import { geocodeStore } from "@/lib/stores/geocode";

export interface StoreInput {
  name: string; member: string; kind: string; address: string; city: string; zip: string; region: string;
  phone: string; mobile: string; fax: string; email: string; erpBranch: string;
  lat: number; lng: number; hours: { day: number; open: string; close: string }[]; services: string[];
  photo: string; notes: string; active: boolean; sort: number; slug: string;
}

export async function saveStore(id: string | null, input: StoreInput) {
  const user = await requirePermission("stores.write");
  const slug = slugify(input.slug || `${input.city} ${input.name}`) || `store-${Date.now()}`;
  const clash = await db.store.findUnique({ where: { slug } });
  if (clash && clash.id !== id) return { ok: false as const, error: `Το slug «${slug}» χρησιμοποιείται ήδη.` };
  const before = id ? await db.store.findUnique({ where: { id } }) : null;
  const data = {
    name: input.name.trim(), member: input.member.trim() || null, kind: input.kind.trim() || null, address: input.address.trim(), city: input.city.trim(), zip: input.zip.trim(), region: input.region.trim(),
    phone: input.phone.trim() || null, mobile: input.mobile.trim() || null, fax: input.fax.trim() || null, email: input.email.trim() || null, erpBranch: input.erpBranch.trim() || null,
    lat: input.lat, lng: input.lng, hours: input.hours, services: input.services, photo: input.photo || null, notes: input.notes.trim() || null, active: input.active, sort: input.sort, slug,
    ...(before && (before.lat !== input.lat || before.lng !== input.lng) ? { geocoded: "manual" } : {}),
  };
  const row = id ? await db.store.update({ where: { id }, data }) : await db.store.create({ data: { ...data, geocoded: "manual" } });
  await audit(user.id, id ? "store.update" : "store.create", "Store", row.id, before ? { name: before.name, address: before.address, lat: before.lat, lng: before.lng, active: before.active } : null, { name: data.name, address: data.address, lat: data.lat, lng: data.lng, active: data.active });
  revalidatePath("/admin/stores");
  revalidatePath("/katastimata");
  return { ok: true as const, id: row.id, slug };
}

export async function geocodeStoreAction(id: string, force: boolean) {
  const user = await requirePermission("stores.write");
  const r = await geocodeStore(id, force);
  if (r.ok) await audit(user.id, "store.geocode", "Store", id, null, { lat: r.lat, lng: r.lng, applied: r.applied, deltaKm: r.deltaKm });
  revalidatePath("/admin/stores");
  return r;
}

/** Geocode up to 20 stores that still lack coordinates or a QA point (Nominatim rate limit). */
export async function geocodeBatch() {
  const user = await requirePermission("stores.write");
  const rows = await db.store.findMany({ where: { OR: [{ lat: 0 }, { geoLat: null }] }, take: 20, select: { id: true } });
  let ok = 0;
  for (const r of rows) {
    const g = await geocodeStore(r.id).catch(() => ({ ok: false as const }));
    if (g.ok) ok++;
    await new Promise((res) => setTimeout(res, 1100));
  }
  const left = await db.store.count({ where: { OR: [{ lat: 0 }, { geoLat: null }] } });
  await audit(user.id, "store.geocode.batch", "Store", "*", null, { ok, left });
  revalidatePath("/admin/stores");
  return { ok: true as const, done: ok, left };
}

/** Re-import from euronics.gr: creates new stores, refreshes coordinates from the site (unless set manually), optionally overwrites contact data. */
export async function syncFromSite(overwriteContact: boolean) {
  const user = await requirePermission("stores.write");
  try {
    const list = await fetchLiveStores();
    const r = await upsertStores(list, { overwriteContact });
    await audit(user.id, "store.sync", "Store", "*", null, r);
    revalidatePath("/admin/stores");
    return { ok: true as const, ...r };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Αποτυχία" };
  }
}

export async function toggleStore(id: string, active: boolean) {
  const user = await requirePermission("stores.write");
  await db.store.update({ where: { id }, data: { active } });
  await audit(user.id, active ? "store.activate" : "store.deactivate", "Store", id, null, { active });
  revalidatePath("/admin/stores");
  return { ok: true as const };
}
