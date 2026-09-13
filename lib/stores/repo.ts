import "server-only";
import type { Store as StoreRow } from "@prisma/client";
import { db } from "@/lib/db";
import type { Store } from "@/lib/data/types";
import { stores as fixtureStores } from "@/lib/data/fixtures/stores";
import { distanceKm } from "./geocode";

/**
 * @dynamic Stores for the storefront, from the Store table (imported from
 * euronics.gr, edited in /admin/stores). Falls back to the fixtures while the
 * table is empty. `distanceKm` is measured from `origin` (visitor geo-IP or
 * Syntagma), `openUntil` from today's hours.
 */
export const SYNTAGMA = { lat: 37.9755, lng: 23.7348 };
const DAYS = ["Κυρ", "Δευ", "Τρί", "Τετ", "Πέμ", "Παρ", "Σάβ"];
type Hour = { day: number; open: string; close: string };

export function openUntilToday(hours: unknown, now = new Date()): string {
  const list = Array.isArray(hours) ? (hours as Hour[]) : [];
  const h = list.find((x) => x.day === now.getDay());
  return h?.close && h.close !== "—" ? h.close : "κλειστά";
}

export function toStoreView(r: StoreRow, origin = SYNTAGMA): Store {
  const list = Array.isArray(r.hours) ? (r.hours as Hour[]) : [];
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    member: r.member ?? undefined,
    address: r.address,
    zip: r.zip,
    city: r.city,
    region: r.region,
    phone: r.phone ?? undefined,
    email: r.email ?? undefined,
    distanceKm: Math.round(distanceKm(origin, { lat: r.lat, lng: r.lng }) * 10) / 10,
    openUntil: openUntilToday(r.hours),
    hours: [1, 2, 3, 4, 5, 6, 0].map((d) => { const h = list.find((x) => x.day === d); return { day: DAYS[d], open: h?.open ?? "—", close: h?.close ?? "—" }; }),
    services: Array.isArray(r.services) ? (r.services as string[]) : [],
    lat: r.lat,
    lng: r.lng,
  };
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export async function dbStores(origin = SYNTAGMA): Promise<Store[] | null> {
  const rows = await db.store.findMany({ where: { active: true }, orderBy: [{ sort: "asc" }, { name: "asc" }] }).catch(() => []);
  return rows.length ? rows.map((r) => toStoreView(r, origin)) : null;
}

export async function findStores(q?: { q?: string; region?: string; service?: string }, origin = SYNTAGMA): Promise<Store[]> {
  let list = (await dbStores(origin)) ?? fixtureStores.slice();
  if (q?.region) list = list.filter((s) => s.region === q.region);
  if (q?.service) list = list.filter((s) => s.services.includes(q.service!));
  if (q?.q) { const n = norm(q.q); list = list.filter((s) => norm(`${s.name} ${s.city} ${s.zip} ${s.region} ${s.address}`).includes(n)); }
  return list.sort((a, b) => a.distanceKm - b.distanceKm);
}

export async function findStoreBySlug(slug: string, origin = SYNTAGMA): Promise<Store | null> {
  const row = await db.store.findUnique({ where: { slug } }).catch(() => null);
  if (row) return toStoreView(row, origin);
  return fixtureStores.find((s) => s.slug === slug) ?? null;
}

export async function storeRegions(): Promise<string[]> {
  const rows = await db.store.groupBy({ by: ["region"], where: { active: true }, _count: { _all: true }, orderBy: { region: "asc" } }).catch(() => []);
  return rows.length ? rows.map((r) => r.region) : [...new Set(fixtureStores.map((s) => s.region))].sort();
}

export async function nearestStores(p: { lat: number; lng: number }, limit = 5): Promise<Store[]> {
  const list = (await dbStores(p)) ?? fixtureStores.map((s) => ({ ...s, distanceKm: Math.round(distanceKm(p, s) * 10) / 10 }));
  return list.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);
}
