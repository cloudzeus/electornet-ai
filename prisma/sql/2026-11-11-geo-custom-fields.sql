-- Συνεργάτες & μεταφορείς: θέση στον χάρτη (geodata), πρόσθετα στοιχεία (extra) και ορισμοί πρόσθετων πεδίων. Μόνο προσθήκη, idempotent.
-- Εφαρμογή: npx prisma db execute --url "$DIRECT_URL" --file prisma/sql/2026-11-11-geo-custom-fields.sql

ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION;
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "lng" DOUBLE PRECISION;
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "geoSource" TEXT;
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "geoLabel" TEXT;
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "geocodedAt" TIMESTAMP(3);
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "extra" JSONB;

ALTER TABLE "Carrier" ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION;
ALTER TABLE "Carrier" ADD COLUMN IF NOT EXISTS "lng" DOUBLE PRECISION;
ALTER TABLE "Carrier" ADD COLUMN IF NOT EXISTS "geoSource" TEXT;
ALTER TABLE "Carrier" ADD COLUMN IF NOT EXISTS "geoLabel" TEXT;
ALTER TABLE "Carrier" ADD COLUMN IF NOT EXISTS "geocodedAt" TIMESTAMP(3);
ALTER TABLE "Carrier" ADD COLUMN IF NOT EXISTS "extra" JSONB;

CREATE TABLE IF NOT EXISTS "CustomField" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "options" JSONB,
    "groupName" TEXT,
    "help" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomField_entity_key_key" ON "CustomField"("entity", "key");
