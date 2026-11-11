-- Δρομολόγηση παραδόσεων: πρακτορείο ανά συνεργάτη, ρόλοι μεταφορέων, τιμοκατάλογοι μεταφορικών, διαδρομή + βήματα ανά παραγγελία. Μόνο προσθήκη, idempotent.
-- Εφαρμογή: npx prisma db execute --url "$DIRECT_URL" --file prisma/sql/2026-11-11-delivery-routing.sql

ALTER TABLE "Carrier" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'other';
ALTER TABLE "Carrier" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Carrier" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "Carrier" ADD COLUMN IF NOT EXISTS "zip" TEXT;
ALTER TABLE "Carrier" ADD COLUMN IF NOT EXISTS "hours" TEXT;
ALTER TABLE "Carrier" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Carrier" ADD COLUMN IF NOT EXISTS "notes" TEXT;

ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "agencyId" TEXT;
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "delivery" JSONB;

CREATE TABLE IF NOT EXISTS "ShippingRateTable" (
    "id" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "validFrom" TIMESTAMP(3),
    "data" JSONB NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShippingRateTable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OrderRoute" (
    "orderId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "partnerId" TEXT,
    "agencyId" TEXT,
    "carrierId" TEXT,
    "reason" TEXT,
    "cost" DECIMAL(10,2),
    "status" TEXT NOT NULL DEFAULT 'open',
    "decidedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrderRoute_pkey" PRIMARY KEY ("orderId")
);

CREATE TABLE IF NOT EXISTS "RouteStep" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,
    "doneAt" TIMESTAMP(3),
    "doneBy" TEXT,
    "ref" TEXT,
    "proof" TEXT,
    "note" TEXT,
    CONSTRAINT "RouteStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ShippingRateTable_carrier_status_idx" ON "ShippingRateTable"("carrier", "status");
CREATE INDEX IF NOT EXISTS "OrderRoute_mode_status_idx" ON "OrderRoute"("mode", "status");
CREATE INDEX IF NOT EXISTS "OrderRoute_partnerId_status_idx" ON "OrderRoute"("partnerId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "RouteStep_orderId_key_key" ON "RouteStep"("orderId", "key");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Partner_agencyId_fkey') THEN
    ALTER TABLE "Partner" ADD CONSTRAINT "Partner_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Carrier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderRoute_orderId_fkey') THEN
    ALTER TABLE "OrderRoute" ADD CONSTRAINT "OrderRoute_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderRoute_partnerId_fkey') THEN
    ALTER TABLE "OrderRoute" ADD CONSTRAINT "OrderRoute_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderRoute_agencyId_fkey') THEN
    ALTER TABLE "OrderRoute" ADD CONSTRAINT "OrderRoute_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Carrier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderRoute_carrierId_fkey') THEN
    ALTER TABLE "OrderRoute" ADD CONSTRAINT "OrderRoute_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RouteStep_orderId_fkey') THEN
    ALTER TABLE "RouteStep" ADD CONSTRAINT "RouteStep_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OrderRoute"("orderId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
