/**
 * Εισαγωγή προϊόντων από ξένο Excel: πίνακες ImportMapping / ImportJob / PendingItem / MarkupRule. Μόνο προσθήκες, ξανατρέχει χωρίς σφάλμα. Σύνδεση: DIRECT_URL.
 *   npx tsx scripts/apply-foreign-import.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } } });
const SQL = [
  `CREATE TABLE IF NOT EXISTS "ImportMapping" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headerSignature" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ImportMapping_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "ImportJob" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mappingId" TEXT,
    "rows" JSONB NOT NULL,
    "counts" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "PendingItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "rowNo" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "specs" JSONB NOT NULL,
    "media" JSONB NOT NULL,
    "brandId" TEXT,
    "specGroupS1Id" INTEGER,
    "webCategoryId" TEXT,
    "cost" DOUBLE PRECISION,
    "rrp" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mtrl" INTEGER,
    "productId" TEXT,
    "error" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PendingItem_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "PendingItem_status_idx" ON "PendingItem"("status")`,
  `CREATE INDEX IF NOT EXISTS "PendingItem_jobId_idx" ON "PendingItem"("jobId")`,
  `CREATE TABLE IF NOT EXISTS "MarkupRule" (
    "id" TEXT NOT NULL,
    "brandId" TEXT,
    "categoryId" TEXT,
    "percent" DOUBLE PRECISION NOT NULL,
    "rounding" TEXT NOT NULL DEFAULT 'none',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarkupRule_pkey" PRIMARY KEY ("id")
  )`,
];
const TABLES = ["ImportMapping", "ImportJob", "PendingItem", "MarkupRule"];
(async () => {
  const exist = () => db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN (${TABLES.map((t) => `'${t}'`).join(",")})`);
  const before = Number((await exist())[0].n);
  for (const q of SQL) await db.$executeRawUnsafe(q);
  console.log(before === TABLES.length ? "Πίνακες: υπήρχαν ήδη." : "Πίνακες: εφαρμόστηκαν.");
  await db.$disconnect();
})().catch(async (e) => { console.error(e instanceof Error ? e.message : e); await db.$disconnect(); process.exit(1); });
