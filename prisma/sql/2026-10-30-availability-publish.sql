-- Διαθεσιμότητα με κανόνες (+ στη συνέχεια: πληρότητα προϊόντων, πρόγραμμα XML feeds). Μόνο προσθήκες.
-- Εφαρμογή: npx prisma db execute --url "$DIRECT_URL" --file prisma/sql/2026-10-30-availability-publish.sql
-- (ΟΧΙ db push: η βάση έχει παλιά άσχετη διαφορά στο WishlistList.key)

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "availLabel" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "availState" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "supplierAvail" TEXT;

CREATE TABLE IF NOT EXISTS "AvailabilityRule" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "label" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'order',
    "publish" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AvailabilityRule_position_idx" ON "AvailabilityRule"("position");

-- Έλεγχος πληρότητας: true μέχρι να ανοίξει ο έλεγχος (Κατάλογος → Πληρότητα)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "publishReady" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "publishMissing" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- XML feeds: πρόγραμμα αυτόματης ενημέρωσης και «Εφαρμογή αλλαγών»
ALTER TABLE "SupplierFeed" ADD COLUMN IF NOT EXISTS "schedule" JSONB;
ALTER TABLE "SupplierFeed" ADD COLUMN IF NOT EXISTS "lastAutoAt" TIMESTAMP(3);
ALTER TABLE "SupplierFeed" ADD COLUMN IF NOT EXISTS "autoPending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SupplierFeedItem" ADD COLUMN IF NOT EXISTS "appliedAt" TIMESTAMP(3);
DO $$ BEGIN
  -- πρώτη φορά: ό,τι υπάρχει δεν έχει περάσει με τη νέα μηχανή (υπάρχοντα είδη εκτός web έμεναν «χωρίς αλλαγή»)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'SupplierFeedItem' AND column_name = 'pendingApply') THEN
    ALTER TABLE "SupplierFeedItem" ADD COLUMN "pendingApply" BOOLEAN NOT NULL DEFAULT false;
    UPDATE "SupplierFeedItem" SET "pendingApply" = true WHERE status <> 'skipped';
  END IF;
END $$;
