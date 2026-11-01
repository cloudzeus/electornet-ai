-- Πύλη συνεργατών: εκδηλώσεις ενδιαφέροντος από τη δημόσια σελίδα (PartnerInterest). Μόνο προσθήκη, idempotent.
-- Εφαρμογή: npx prisma db execute --url "$DIRECT_URL" --file prisma/sql/2026-11-01-partner-interest.sql
CREATE TABLE IF NOT EXISTS "PartnerInterest" (
    "id" TEXT NOT NULL,
    "afm" TEXT NOT NULL,
    "partnerId" TEXT,
    "businessName" TEXT,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "kinds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "banks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "erp" TEXT,
    "eshop" TEXT,
    "method" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "adminNote" TEXT,
    "handledBy" TEXT,
    "handledAt" TIMESTAMP(3),
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PartnerInterest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PartnerInterest_status_createdAt_idx" ON "PartnerInterest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "PartnerInterest_afm_idx" ON "PartnerInterest"("afm");
CREATE INDEX IF NOT EXISTS "PartnerInterest_partnerId_idx" ON "PartnerInterest"("partnerId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PartnerInterest_partnerId_fkey') THEN
    ALTER TABLE "PartnerInterest" ADD CONSTRAINT "PartnerInterest_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
