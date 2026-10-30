-- Νέοι πίνακες: scheduler, δέντρο κατηγοριών, έλεγχος XML ↔ SoftOne.
-- Εφαρμογή: npx prisma db execute --url "$DIRECT_URL" --file prisma/sql/2026-10-30-scheduler-categories-xml.sql
-- (ΟΧΙ db push: η βάση έχει παλιά άσχετη διαφορά στο WishlistList.key)

CREATE TABLE IF NOT EXISTS "ScheduledJob" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lockedUntil" TIMESTAMP(3),
    "lastStartAt" TIMESTAMP(3),
    "lastEndAt" TIMESTAMP(3),
    "lastOk" BOOLEAN,
    "lastMessage" TEXT,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "fails" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "sortManual" INTEGER;

CREATE TABLE IF NOT EXISTS "CategoryOp" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "title" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "mtrls" INTEGER[],
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "okCount" INTEGER NOT NULL DEFAULT 0,
    "failures" JSONB NOT NULL DEFAULT '[]',
    "log" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "CategoryOp_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CategoryOp_status_createdAt_idx" ON "CategoryOp"("status", "createdAt");

ALTER TABLE "SupplierFeed" ADD COLUMN IF NOT EXISTS "updatePolicy" JSONB;
ALTER TABLE "SupplierFeed" ADD COLUMN IF NOT EXISTS "checkAt" TIMESTAMP(3);
ALTER TABLE "SupplierFeed" ADD COLUMN IF NOT EXISTS "checkStatus" TEXT;
ALTER TABLE "SupplierFeed" ADD COLUMN IF NOT EXISTS "checkMessage" TEXT;
ALTER TABLE "SupplierFeed" ADD COLUMN IF NOT EXISTS "importMessage" TEXT;
ALTER TABLE "SupplierFeedItem" ADD COLUMN IF NOT EXISTS "s1Status" TEXT;
ALTER TABLE "SupplierFeedItem" ADD COLUMN IF NOT EXISTS "s1Check" JSONB;
ALTER TABLE "SupplierFeedItem" ADD COLUMN IF NOT EXISTS "checkedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "SupplierFeedItem_feedId_s1Status_idx" ON "SupplierFeedItem"("feedId", "s1Status");
