-- Αποστολές: σύνδεσμος ζωντανής παρακολούθησης, εκτιμώμενη άφιξη και πότε ειδοποιήθηκε ο πελάτης (webhook ASAP / LastMily). Μόνο προσθήκη, idempotent.
-- Εφαρμογή: npx prisma db execute --url "$DIRECT_URL" --file prisma/sql/2026-11-03-shipment-live-tracking.sql
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "liveUrl" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "eta" TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "liveNotifiedAt" TIMESTAMP(3);
