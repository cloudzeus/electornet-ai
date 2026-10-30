/**
 * XML προμηθευτές: πίνακες Supplier / SupplierFeed / SupplierFeedItem / FeedSnapshot. Μόνο προσθήκες, ξανατρέχει χωρίς σφάλμα. Σύνδεση: DIRECT_URL.
 *   npx tsx scripts/apply-xml-import.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } } });
const SQL = [
  `CREATE TABLE IF NOT EXISTS "Supplier" (
    "id" TEXT NOT NULL,
    "s1Trdr" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "afm" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_s1Trdr_key" ON "Supplier"("s1Trdr")`,
  `CREATE INDEX IF NOT EXISTS "Supplier_name_idx" ON "Supplier"("name")`,
  `CREATE TABLE IF NOT EXISTS "SupplierFeed" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'xml',
    "config" JSONB NOT NULL,
    "priceMode" TEXT NOT NULL DEFAULT 'cost',
    "toSoftone" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "lastCount" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierFeed_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "SupplierFeed_supplierId_idx" ON "SupplierFeed"("supplierId")`,
  `CREATE TABLE IF NOT EXISTS "SupplierFeedItem" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "edits" JSONB,
    "images" JSONB NOT NULL,
    "assetIds" JSONB,
    "diff" TEXT NOT NULL DEFAULT 'new',
    "status" TEXT NOT NULL DEFAULT 'review',
    "softone" BOOLEAN,
    "problem" TEXT,
    "mtrl" INTEGER,
    "productId" TEXT,
    "pendingItemId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplierFeedItem_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SupplierFeedItem_feedId_sku_key" ON "SupplierFeedItem"("feedId", "sku")`,
  `CREATE INDEX IF NOT EXISTS "SupplierFeedItem_feedId_status_idx" ON "SupplierFeedItem"("feedId", "status")`,
  `CREATE INDEX IF NOT EXISTS "SupplierFeedItem_feedId_diff_idx" ON "SupplierFeedItem"("feedId", "diff")`,
  // Νέα: όριο λήψεων ανά feed και ακατέργαστο XML της τελευταίας λήψης.
  `ALTER TABLE "SupplierFeed" ADD COLUMN IF NOT EXISTS "minFetchMin" INTEGER NOT NULL DEFAULT 30`,
  `ALTER TABLE "SupplierFeed" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true`,
  `CREATE TABLE IF NOT EXISTS "FeedSnapshot" (
    "id" TEXT NOT NULL,
    "urlKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "gz" BYTEA NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "products" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeedSnapshot_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FeedSnapshot_urlKey_key" ON "FeedSnapshot"("urlKey")`,
  `CREATE INDEX IF NOT EXISTS "FeedSnapshot_fetchedAt_idx" ON "FeedSnapshot"("fetchedAt")`,
  // Νέο: πρόχειρη αντιστοίχιση των ενδιάμεσων βημάτων του οδηγού.
  `CREATE TABLE IF NOT EXISTS "FeedDraft" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "urlKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "step" TEXT NOT NULL DEFAULT 'cols',
    "data" JSONB NOT NULL,
    "staffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeedDraft_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FeedDraft_supplierId_urlKey_key" ON "FeedDraft"("supplierId", "urlKey")`,
  `CREATE INDEX IF NOT EXISTS "FeedDraft_updatedAt_idx" ON "FeedDraft"("updatedAt")`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FeedDraft_supplierId_fkey') THEN
       ALTER TABLE "FeedDraft" ADD CONSTRAINT "FeedDraft_supplierId_fkey"
         FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
   END $$`,
  // Τα ξένα κλειδιά μπαίνουν χωριστά: ο πίνακας μπορεί να υπάρχει από προηγούμενη εκτέλεση χωρίς αυτά.
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierFeed_supplierId_fkey') THEN
       ALTER TABLE "SupplierFeed" ADD CONSTRAINT "SupplierFeed_supplierId_fkey"
         FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
   END $$`,
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupplierFeedItem_feedId_fkey') THEN
       ALTER TABLE "SupplierFeedItem" ADD CONSTRAINT "SupplierFeedItem_feedId_fkey"
         FOREIGN KEY ("feedId") REFERENCES "SupplierFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
     END IF;
   END $$`,
];
const TABLES = ["Supplier", "SupplierFeed", "SupplierFeedItem", "FeedSnapshot"];
(async () => {
  const exist = () => db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN (${TABLES.map((t) => `'${t}'`).join(",")})`);
  const before = Number((await exist())[0].n);
  if (before) {
    // Διπλά (feedId, sku) θα έριχναν το μοναδικό ευρετήριο — καλύτερα ρητό μήνυμα από σφάλμα της Postgres.
    const dup = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM (SELECT 1 FROM "SupplierFeedItem" GROUP BY "feedId", "sku" HAVING count(*) > 1) d`).catch(() => [{ n: BigInt(0) }]);
    if (Number(dup[0].n)) throw new Error(`Υπάρχουν ${dup[0].n} διπλά SupplierFeedItem (feedId, sku) — καθάρισέ τα πριν από το μοναδικό ευρετήριο.`);
  }
  for (const q of SQL) await db.$executeRawUnsafe(q);
  console.log(before === TABLES.length ? "Πίνακες: υπήρχαν ήδη." : "Πίνακες: εφαρμόστηκαν.");
  await db.$disconnect();
})().catch(async (e) => { console.error(e instanceof Error ? e.message : e); await db.$disconnect(); process.exit(1); });
