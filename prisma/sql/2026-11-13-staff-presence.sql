-- Ενεργός χρόνος προσωπικού στη διαχείριση (Χρήστες → Αναφορά δραστηριότητας).
-- Μόνο προσθήκη, idempotent. Εφαρμογή: npx prisma db execute --url "$DIRECT_URL" --file prisma/sql/2026-11-13-staff-presence.sql

CREATE TABLE IF NOT EXISTS "StaffPresence" (
  "id" TEXT PRIMARY KEY,
  "staffId" TEXT NOT NULL REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "day" TEXT NOT NULL,
  "area" TEXT NOT NULL,
  "seconds" INTEGER NOT NULL DEFAULT 0,
  "firstAt" TIMESTAMP(3) NOT NULL,
  "lastAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "StaffPresence_staffId_day_area_key" ON "StaffPresence"("staffId", "day", "area");
CREATE INDEX IF NOT EXISTS "StaffPresence_day_idx" ON "StaffPresence"("day");
CREATE INDEX IF NOT EXISTS "StaffPresence_staffId_lastAt_idx" ON "StaffPresence"("staffId", "lastAt");
