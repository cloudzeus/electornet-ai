-- Πύλη συνεργατών: επαφές, λογαριασμοί, links κωδικού/OTP, ιστορικό αλλαγών, συνδέσεις, logs. Μόνο προσθήκες, idempotent.
-- Εφαρμογή: npx prisma db execute --url "$DIRECT_URL" --file prisma/sql/2026-10-31-b2b-portal.sql
-- AlterTable
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "onboarding" JSONB;

-- CreateTable
CREATE TABLE IF NOT EXISTS "PartnerContact" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'other',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PartnerAccount" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "passwordAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PartnerToken" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "codeHash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PartnerChange" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "accountId" TEXT,
    "staffId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PartnerConnection" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT,
    "config" JSONB NOT NULL,
    "secretKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "storeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'draft',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastTest" JSONB,
    "lastTestAt" TIMESTAMP(3),
    "lastOkAt" TIMESTAMP(3),
    "locationMap" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PartnerLog" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "connectionId" TEXT,
    "kind" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "accountId" TEXT,
    "staffId" TEXT,
    "ms" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartnerContact_partnerId_idx" ON "PartnerContact"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerAccount_contactId_key" ON "PartnerAccount"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerAccount_email_key" ON "PartnerAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerToken_tokenHash_key" ON "PartnerToken"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartnerToken_accountId_purpose_createdAt_idx" ON "PartnerToken"("accountId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartnerChange_partnerId_createdAt_idx" ON "PartnerChange"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartnerConnection_partnerId_idx" ON "PartnerConnection"("partnerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartnerLog_partnerId_createdAt_idx" ON "PartnerLog"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartnerLog_connectionId_createdAt_idx" ON "PartnerLog"("connectionId", "createdAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PartnerContact" ADD CONSTRAINT "PartnerContact_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PartnerAccount" ADD CONSTRAINT "PartnerAccount_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "PartnerContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PartnerToken" ADD CONSTRAINT "PartnerToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PartnerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PartnerChange" ADD CONSTRAINT "PartnerChange_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PartnerConnection" ADD CONSTRAINT "PartnerConnection_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PartnerLog" ADD CONSTRAINT "PartnerLog_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PartnerLog" ADD CONSTRAINT "PartnerLog_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "PartnerConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

