-- Βάρος προϊόντος στο eshop (ενέργεια «Διαστάσεις και βάρος από το περιεχόμενο»). Δεν γράφεται στο SoftOne.
-- Μόνο προσθήκη, idempotent. Εφαρμογή: npx prisma db execute --url "$DIRECT_URL" --file prisma/sql/2026-11-11-product-weight.sql

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "weightKg" DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "weightSource" TEXT;
