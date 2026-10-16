/**
 * Σετ ειδών ως προϊόντα: στήλες σε Product / OrderLine. Μόνο προσθήκες, ξανατρέχει χωρίς σφάλμα. Σύνδεση: DIRECT_URL.
 *   npx tsx scripts/apply-sets.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } } });
const SQL = [
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'item'`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "setSpcs" INTEGER`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "soldAloneMode" TEXT NOT NULL DEFAULT 'auto'`,
  `ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "soldAlone" BOOLEAN NOT NULL DEFAULT true`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Product_setSpcs_key" ON "Product"("setSpcs")`,
  `CREATE INDEX IF NOT EXISTS "Product_kind_idx" ON "Product"("kind")`,
  `ALTER TABLE "OrderLine" ADD COLUMN IF NOT EXISTS "setSpcs" INTEGER`,
  `ALTER TABLE "OrderLine" ADD COLUMN IF NOT EXISTS "setParts" JSONB`,
];
(async () => {
  const before = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM information_schema.columns WHERE table_name = 'Product' AND column_name = 'soldAlone'`);
  for (const q of SQL) await db.$executeRawUnsafe(q);
  console.log(Number(before[0].n) ? "Στήλες: υπήρχαν ήδη." : "Στήλες: εφαρμόστηκαν.");
  await db.$disconnect();
})().catch(async (e) => { console.error(e instanceof Error ? e.message : e); await db.$disconnect(); process.exit(1); });
