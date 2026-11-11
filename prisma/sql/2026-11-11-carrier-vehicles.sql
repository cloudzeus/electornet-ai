-- Μεταφορείς: ΑΦΜ, οχήματα από το SoftOne (TRUCKS), προεπιλεγμένος μεταφορέας συνεργάτη στο SoftOne (TRDR.SOCARRIER). Μόνο προσθήκη, idempotent.
-- Εφαρμογή: npx prisma db execute --url "$DIRECT_URL" --file prisma/sql/2026-11-11-carrier-vehicles.sql

ALTER TABLE "Carrier" ADD COLUMN IF NOT EXISTS "afm" TEXT;
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "s1CarrierId" TEXT;

CREATE TABLE IF NOT EXISTS "CarrierVehicle" (
    "id" TEXT NOT NULL,
    "s1Id" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plate" TEXT,
    "carrierId" TEXT,
    "s1CarrierId" TEXT,
    "trdr" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "volumeM3" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "s1Missing" BOOLEAN NOT NULL DEFAULT false,
    "s1Data" JSONB,
    "s1SyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CarrierVehicle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CarrierVehicle_s1Id_key" ON "CarrierVehicle"("s1Id");
CREATE INDEX IF NOT EXISTS "CarrierVehicle_carrierId_idx" ON "CarrierVehicle"("carrierId");
CREATE INDEX IF NOT EXISTS "Partner_s1CarrierId_idx" ON "Partner"("s1CarrierId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CarrierVehicle_carrierId_fkey') THEN
    ALTER TABLE "CarrierVehicle" ADD CONSTRAINT "CarrierVehicle_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
