/**
 * «Εξαίρεση Web» (MTREXTRA.BOOL04) στον καθρέφτη των ειδών. Μόνο προσθήκες, ξανατρέχει χωρίς σφάλμα. Σύνδεση: DIRECT_URL.
 *   npx tsx scripts/apply-web-excluded.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } } });
const SQL = [
  `ALTER TABLE "S1Item" ADD COLUMN IF NOT EXISTS "webExcluded" BOOLEAN NOT NULL DEFAULT false`,
  `CREATE INDEX IF NOT EXISTS "S1Item_webExcluded_idx" ON "S1Item"("webExcluded")`,
];
(async () => {
  const before = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM information_schema.columns WHERE table_name = 'S1Item' AND column_name = 'webExcluded'`);
  for (const q of SQL) await db.$executeRawUnsafe(q);
  console.log(Number(before[0].n) ? "Στήλη: υπήρχε ήδη." : "Στήλη: εφαρμόστηκε.");
  await db.$disconnect();
})().catch(async (e) => { console.error(e instanceof Error ? e.message : e); await db.$disconnect(); process.exit(1); });
