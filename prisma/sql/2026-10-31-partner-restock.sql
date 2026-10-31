-- Πύλη συνεργατών: αιτήματα αναπλήρωσης αποθέματος από παραγγελία (PartnerRestock). Μόνο προσθήκη, idempotent.
-- Εφαρμογή: npx prisma db execute --url "$DIRECT_URL" --file prisma/sql/2026-10-31-partner-restock.sql
CREATE TABLE IF NOT EXISTS "PartnerRestock" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "storeId" TEXT,
    "orderId" TEXT,
    "accountId" TEXT,
    "lines" JSONB NOT NULL,
    "shipMode" TEXT NOT NULL DEFAULT 'bulk',
    "approvedMode" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "reply" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PartnerRestock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerRestock_number_key" ON "PartnerRestock"("number");
CREATE INDEX IF NOT EXISTS "PartnerRestock_partnerId_createdAt_idx" ON "PartnerRestock"("partnerId", "createdAt");
CREATE INDEX IF NOT EXISTS "PartnerRestock_status_createdAt_idx" ON "PartnerRestock"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "PartnerRestock_orderId_idx" ON "PartnerRestock"("orderId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartnerRestock_partnerId_fkey') THEN
    ALTER TABLE "PartnerRestock" ADD CONSTRAINT "PartnerRestock_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartnerRestock_storeId_fkey') THEN
    ALTER TABLE "PartnerRestock" ADD CONSTRAINT "PartnerRestock_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartnerRestock_orderId_fkey') THEN
    ALTER TABLE "PartnerRestock" ADD CONSTRAINT "PartnerRestock_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Παραλαβή από το πλησιέστερο κατάστημα (shipMode pickup): κατάστημα παραλαβής + πότε έγινε έτοιμο.
ALTER TABLE "PartnerRestock" ADD COLUMN IF NOT EXISTS "pickupStoreId" TEXT;
ALTER TABLE "PartnerRestock" ADD COLUMN IF NOT EXISTS "readyAt" TIMESTAMP(3);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartnerRestock_pickupStoreId_fkey') THEN
    ALTER TABLE "PartnerRestock" ADD CONSTRAINT "PartnerRestock_pickupStoreId_fkey" FOREIGN KEY ("pickupStoreId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
