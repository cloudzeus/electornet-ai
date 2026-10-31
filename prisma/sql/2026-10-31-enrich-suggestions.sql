-- Προτάσεις εμπλουτισμού (Icecat → site κατασκευαστή → άλλα καταστήματα) προς έγκριση. Μόνο προσθήκες.
-- Εφαρμογή: npx prisma db execute --url "$DIRECT_URL" --file prisma/sql/2026-10-31-enrich-suggestions.sql

CREATE TABLE IF NOT EXISTS "EnrichSuggestion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "url" TEXT,
    "group" TEXT,
    "key" TEXT,
    "value" TEXT,
    "pageUrl" TEXT,
    "sourceName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnrichSuggestion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EnrichSuggestion_productId_kind_fingerprint_key" ON "EnrichSuggestion"("productId", "kind", "fingerprint");
CREATE INDEX IF NOT EXISTS "EnrichSuggestion_productId_status_idx" ON "EnrichSuggestion"("productId", "status");
CREATE INDEX IF NOT EXISTS "EnrichSuggestion_status_kind_idx" ON "EnrichSuggestion"("status", "kind");
DO $$ BEGIN
  ALTER TABLE "EnrichSuggestion" ADD CONSTRAINT "EnrichSuggestion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
