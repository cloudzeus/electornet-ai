import "server-only";
import { headers } from "next/headers";
import { nearestStores } from "@/lib/stores/repo";
import type { Store } from "@/lib/data/types";

export interface GeoPoint {
  lat: number;
  lng: number;
  city?: string;
  source: "ip" | "fallback";
}

const cache = new Map<string, { at: number; p: GeoPoint }>();
const ATHENS: GeoPoint = { lat: 37.9838, lng: 23.7275, city: "Αθήνα", source: "fallback" };

/**
 * @dynamic Coarse location from the request IP (city level, no consent
 * needed: it is not stored and not personal beyond the IP already in the
 * request). Reads the proxy headers Coolify/Traefik set, asks ipapi.co
 * (1.5 s timeout, 12 h in-memory cache per IP), falls back to Athens for
 * private/local addresses. Production: MaxMind GeoLite2 on the edge or the
 * CDN's geo headers (Cloudflare `cf-ipcountry`/`cf-iplatitude`).
 */
export async function geoFromRequest(): Promise<GeoPoint> {
  const h = await headers();
  const raw = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("cf-connecting-ip") ?? "";
  const cfLat = Number(h.get("cf-iplatitude"));
  const cfLng = Number(h.get("cf-iplongitude"));
  if (cfLat && cfLng) return { lat: cfLat, lng: cfLng, city: h.get("cf-ipcity") ?? undefined, source: "ip" };
  const ip = raw.replace(/^::ffff:/, "");
  if (!ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd)/.test(ip)) return ATHENS;
  const hit = cache.get(ip);
  if (hit && Date.now() - hit.at < 12 * 3600 * 1000) return hit.p;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 1500);
    const r = await fetch(`https://ipapi.co/${ip}/json/`, { signal: ac.signal, headers: { "user-agent": "euronics-demo/1.0" }, cache: "no-store" });
    clearTimeout(t);
    if (r.ok) {
      const j = (await r.json()) as { latitude?: number; longitude?: number; city?: string };
      if (j.latitude && j.longitude) {
        const p: GeoPoint = { lat: j.latitude, lng: j.longitude, city: j.city, source: "ip" };
        cache.set(ip, { at: Date.now(), p });
        return p;
      }
    }
  } catch {}
  return ATHENS;
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Stores sorted by distance from a point, with `distanceKm` recomputed. */
export async function storesNear(p: { lat: number; lng: number }, limit = 5): Promise<Store[]> {
  return nearestStores(p, limit);
}
