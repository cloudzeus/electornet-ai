import "server-only";
import { headers, cookies } from "next/headers";
import { nearestStores } from "@/lib/stores/repo";
import { getSetting } from "@/lib/settings/store";
import type { Store } from "@/lib/data/types";

export interface GeoPoint {
  lat: number;
  lng: number;
  city?: string;
  /** gps / manual = chosen by the visitor (cookie); ip = coarse from the request; fallback = Athens */
  source: "gps" | "manual" | "ip" | "fallback";
}

export const GEO_COOKIE = "eu_geo";
const cache = new Map<string, { at: number; p: GeoPoint }>();
const ATHENS: GeoPoint = { lat: 37.9838, lng: 23.7275, city: "Αθήνα", source: "fallback" };

/**
 * @dynamic Visitor location, best precision first:
 *  1. `eu_geo` cookie — set client-side after the visitor shares GPS or types
 *     a place («Κοντά σε»); never stored server-side.
 *  2. CDN headers (Cloudflare cf-iplatitude / cf-ipcity).
 *  3. IP lookup with the provider from Settings → AI (ipapi.co with optional
 *     key, or MaxMind GeoIP2 web service «accountId:licenseKey»), 1.5 s
 *     timeout, 12 h in-memory cache per IP.
 *  4. Athens.
 */
export async function geoFromRequest(): Promise<GeoPoint> {
  const c = (await cookies()).get(GEO_COOKIE)?.value;
  if (c) {
    try {
      const j = JSON.parse(c) as { lat?: number; lng?: number; city?: string; source?: string };
      if (j.lat && j.lng && Math.abs(j.lat) <= 90 && Math.abs(j.lng) <= 180) return { lat: j.lat, lng: j.lng, city: j.city, source: j.source === "manual" ? "manual" : "gps" };
    } catch {}
  }
  const h = await headers();
  const cfLat = Number(h.get("cf-iplatitude"));
  const cfLng = Number(h.get("cf-iplongitude"));
  if (cfLat && cfLng) return { lat: cfLat, lng: cfLng, city: h.get("cf-ipcity") ?? undefined, source: "ip" };
  const raw = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("cf-connecting-ip") ?? "";
  const ip = raw.replace(/^::ffff:/, "");
  if (!ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd)/.test(ip)) return ATHENS;
  const hit = cache.get(ip);
  if (hit && Date.now() - hit.at < 12 * 3600 * 1000) return hit.p;
  const p = await lookupIp(ip);
  if (p) cache.set(ip, { at: Date.now(), p });
  return p ?? ATHENS;
}

async function lookupIp(ip: string): Promise<GeoPoint | null> {
  const { data, secrets } = await getSetting("ai").catch(() => ({ data: {} as Record<string, string | number | boolean>, secrets: {} as Record<string, string> }));
  const provider = String(data.geoProvider ?? "ipapi");
  const key = secrets.geoApiKey ?? "";
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 1500);
  try {
    if (provider === "maxmind" && key.includes(":")) {
      const r = await fetch(`https://geolite.info/geoip/v2.1/city/${ip}`, { signal: ac.signal, headers: { Authorization: `Basic ${Buffer.from(key).toString("base64")}` }, cache: "no-store" });
      if (r.ok) {
        const j = (await r.json()) as { location?: { latitude?: number; longitude?: number }; city?: { names?: { el?: string; en?: string } } };
        if (j.location?.latitude && j.location?.longitude) return { lat: j.location.latitude, lng: j.location.longitude, city: j.city?.names?.el ?? j.city?.names?.en, source: "ip" };
      }
      return null;
    }
    if (provider === "cloudflare") return null; // headers only
    const r = await fetch(`https://ipapi.co/${ip}/json/${key ? `?key=${encodeURIComponent(key)}` : ""}`, { signal: ac.signal, headers: { "user-agent": "euronics-demo/1.0" }, cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { latitude?: number; longitude?: number; city?: string };
      if (j.latitude && j.longitude) return { lat: j.latitude, lng: j.longitude, city: j.city, source: "ip" };
    }
  } catch {
    /* timeout / offline */
  } finally {
    clearTimeout(t);
  }
  return null;
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export async function storesNear(p: { lat: number; lng: number }, limit = 5): Promise<Store[]> {
  return nearestStores(p, limit);
}

/** Human label for the precision of a GeoPoint. */
export function geoSourceLabel(g: GeoPoint) {
  return g.source === "gps" ? "ακριβής θέση (GPS)" : g.source === "manual" ? `περιοχή που όρισες${g.city ? `: ${g.city}` : ""}` : g.source === "ip" ? `εκτίμηση από το δίκτυό σου${g.city ? ` · ${g.city}` : ""}` : "προεπιλογή Αθήνα";
}
