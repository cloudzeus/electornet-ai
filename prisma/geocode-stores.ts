/** Geocode every store (Nominatim, 1 req/s). Run: npx tsx prisma/geocode-stores.ts [--missing] */
import { PrismaClient } from "@prisma/client";
import { geocodeStore } from "../lib/stores/geocode";

const db = new PrismaClient();
async function main() {
  const missing = process.argv.includes("--missing");
  const rows = await db.store.findMany({ where: missing ? { OR: [{ lat: 0 }, { geoLat: null }] } : {}, orderBy: { siteId: "asc" }, select: { id: true, name: true, city: true } });
  let ok = 0, fail = 0, far = 0;
  for (const [i, s] of rows.entries()) {
    const r = await geocodeStore(s.id).catch((e: Error) => ({ ok: false as const, error: e.message }));
    if (r.ok) { ok++; if (r.deltaKm != null && r.deltaKm > 2) far++; } else fail++;
    if (i % 25 === 0 || !r.ok) console.log(`${i + 1}/${rows.length} ${s.city} · ${s.name}: ${r.ok ? `${r.deltaKm?.toFixed(1) ?? "new"} km` : r.error}`);
    await new Promise((res) => setTimeout(res, 1100));
  }
  console.log(`geocoded ${ok}, failed ${fail}, >2 km from published point: ${far}`);
}
main().finally(() => db.$disconnect());
