-- Σύγκριση τιμών με ανταγωνιστές (Κωτσόβολος): αντιστοιχίσεις, τρέχον ζευγάρι, ιστορικό, παρτίδες αλλαγής τιμής. Μόνο προσθήκη, idempotent.
-- Εφαρμογή: npx prisma db execute --url "$DIRECT_URL" --file prisma/sql/2026-11-12-competitor-prices.sql
CREATE TABLE IF NOT EXISTS "CompetitorCategoryMap" (
    "id" TEXT NOT NULL,
    "competitor" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "extPath" TEXT,
    "suggested" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompetitorCategoryMap_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "CompetitorBrandMap" (
    "id" TEXT NOT NULL,
    "competitor" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "alias" TEXT,
    "notCarried" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompetitorBrandMap_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "CompetitorPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "competitor" TEXT NOT NULL,
    "extId" TEXT,
    "extUrl" TEXT,
    "extTitle" TEXT,
    "match" TEXT NOT NULL,
    "rejectedExtIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "listPrice" DECIMAL(10,2),
    "offerPrice" DECIMAL(10,2),
    "available" BOOLEAN NOT NULL DEFAULT true,
    "ourPrice" DECIMAL(10,2),
    "diffPct" DOUBLE PRECISION,
    "checkedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "missCount" INTEGER NOT NULL DEFAULT 0,
    "cost" DECIMAL(10,2),
    "costSource" TEXT,
    "costAt" TIMESTAMP(3),
    CONSTRAINT "CompetitorPrice_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "CompetitorPriceHistory" (
    "id" TEXT NOT NULL,
    "competitorPriceId" TEXT NOT NULL,
    "price" DECIMAL(10,2),
    "ourPrice" DECIMAL(10,2),
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorPriceHistory_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "PriceChangeBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "rule" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),
    CONSTRAINT "PriceChangeBatch_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "PriceChangeLine" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "mtrl" TEXT NOT NULL,
    "oldPrice" DECIMAL(10,2) NOT NULL,
    "newPrice" DECIMAL(10,2) NOT NULL,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "undoOk" BOOLEAN,
    CONSTRAINT "PriceChangeLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CompetitorCategoryMap_competitor_categoryId_key" ON "CompetitorCategoryMap"("competitor", "categoryId");
CREATE UNIQUE INDEX IF NOT EXISTS "CompetitorBrandMap_competitor_brandId_key" ON "CompetitorBrandMap"("competitor", "brandId");
CREATE UNIQUE INDEX IF NOT EXISTS "CompetitorPrice_productId_competitor_key" ON "CompetitorPrice"("productId", "competitor");
CREATE INDEX IF NOT EXISTS "CompetitorPrice_competitor_diffPct_idx" ON "CompetitorPrice"("competitor", "diffPct");
CREATE INDEX IF NOT EXISTS "CompetitorPriceHistory_competitorPriceId_at_idx" ON "CompetitorPriceHistory"("competitorPriceId", "at");
CREATE INDEX IF NOT EXISTS "PriceChangeLine_batchId_idx" ON "PriceChangeLine"("batchId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompetitorCategoryMap_categoryId_fkey') THEN
    ALTER TABLE "CompetitorCategoryMap" ADD CONSTRAINT "CompetitorCategoryMap_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompetitorBrandMap_brandId_fkey') THEN
    ALTER TABLE "CompetitorBrandMap" ADD CONSTRAINT "CompetitorBrandMap_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompetitorPrice_productId_fkey') THEN
    ALTER TABLE "CompetitorPrice" ADD CONSTRAINT "CompetitorPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CompetitorPriceHistory_competitorPriceId_fkey') THEN
    ALTER TABLE "CompetitorPriceHistory" ADD CONSTRAINT "CompetitorPriceHistory_competitorPriceId_fkey" FOREIGN KEY ("competitorPriceId") REFERENCES "CompetitorPrice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PriceChangeBatch_userId_fkey') THEN
    ALTER TABLE "PriceChangeBatch" ADD CONSTRAINT "PriceChangeBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PriceChangeLine_batchId_fkey') THEN
    ALTER TABLE "PriceChangeLine" ADD CONSTRAINT "PriceChangeLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PriceChangeBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PriceChangeLine_productId_fkey') THEN
    ALTER TABLE "PriceChangeLine" ADD CONSTRAINT "PriceChangeLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
