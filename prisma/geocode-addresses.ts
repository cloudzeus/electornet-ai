/** Backfill coordinates for customer addresses. Run: npx tsx prisma/geocode-addresses.ts */
import { PrismaClient } from "@prisma/client";
import { geocodeCustomerAddress } from "../lib/customers/geocode-address";
const db = new PrismaClient();
async function main() {
  const rows = await db.address.findMany({ where: { OR: [{ lat: null }, { nearestStoreId: null }] }, select: { id: true, city: true } });
  let ok = 0;
  for (const a of rows) { const r = await geocodeCustomerAddress(a.id).catch(() => ({ ok: false as const })); if (r.ok) ok++; else console.log("miss", a.id, a.city); await new Promise((res) => setTimeout(res, 1100)); }
  console.log(`geocoded ${ok}/${rows.length} addresses`);
}
main().finally(() => db.$disconnect());
