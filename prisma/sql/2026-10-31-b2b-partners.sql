-- B2B: μέλη (Partner) και υποκαταστήματα SoftOne (PartnerBranch), σύνδεση Store → μέλος. Μόνο προσθήκες.
-- Εφαρμογή: npx prisma db execute --url "$DIRECT_URL" --file prisma/sql/2026-10-31-b2b-partners.sql

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "partnerId" TEXT;

CREATE TABLE IF NOT EXISTS "Partner" (
    "id" TEXT NOT NULL,
    "s1Trdr" INTEGER,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "afm" TEXT,
    "taxOffice" TEXT,
    "s1Business" INTEGER,
    "category" TEXT,
    "s1Group" INTEGER,
    "groupName" TEXT,
    "address" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "district" TEXT,
    "phone" TEXT,
    "phone2" TEXT,
    "email" TEXT,
    "website" TEXT,
    "status" TEXT NOT NULL DEFAULT 'onboarding',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "s1Data" JSONB,
    "s1UpdatedAt" TIMESTAMP(3),
    "s1SyncedAt" TIMESTAMP(3),
    "s1Missing" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PartnerBranch" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "s1BranchId" INTEGER,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "isCenter" BOOLEAN NOT NULL DEFAULT false,
    "address" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "district" TEXT,
    "phone" TEXT,
    "phone2" TEXT,
    "email" TEXT,
    "taxOffice" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "s1Data" JSONB,
    "s1SyncedAt" TIMESTAMP(3),
    "s1Missing" BOOLEAN NOT NULL DEFAULT false,
    "storeId" TEXT,
    "matchedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerBranch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Partner_s1Trdr_key" ON "Partner"("s1Trdr");

CREATE INDEX IF NOT EXISTS "Partner_afm_idx" ON "Partner"("afm");

CREATE INDEX IF NOT EXISTS "Partner_status_idx" ON "Partner"("status");

CREATE INDEX IF NOT EXISTS "Partner_s1Business_idx" ON "Partner"("s1Business");

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerBranch_s1BranchId_key" ON "PartnerBranch"("s1BranchId");

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerBranch_storeId_key" ON "PartnerBranch"("storeId");

CREATE INDEX IF NOT EXISTS "PartnerBranch_partnerId_idx" ON "PartnerBranch"("partnerId");

CREATE INDEX IF NOT EXISTS "Store_partnerId_idx" ON "Store"("partnerId");

DO $$ BEGIN
  ALTER TABLE "Store" ADD CONSTRAINT "Store_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PartnerBranch" ADD CONSTRAINT "PartnerBranch_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PartnerBranch" ADD CONSTRAINT "PartnerBranch_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
