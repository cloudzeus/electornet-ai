import { NextResponse } from "next/server";
import { storesNear } from "@/lib/geo/ip";

/** @dynamic Nearest stores to a GPS point (client geolocation after consent). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat"));
  const lng = Number(u.searchParams.get("lng"));
  if (!lat || !lng) return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  const near = await storesNear({ lat, lng }, 5);
  return NextResponse.json({ stores: near.map((s) => ({ id: s.id, slug: s.slug, name: s.name, city: s.city, distanceKm: s.distanceKm, openUntil: s.openUntil, lat: s.lat, lng: s.lng })) }, { headers: { "cache-control": "no-store" } });
}
