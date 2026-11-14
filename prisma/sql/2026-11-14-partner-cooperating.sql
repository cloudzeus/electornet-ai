-- Συνεργάτες: «Συνεργαζόμενο κατάστημα» (συμμετέχει στη δρομολόγηση παραγγελιών). Δικό μας πεδίο, η εισαγωγή SoftOne δεν το αγγίζει.
-- Μόνο προσθήκη, idempotent. Εφαρμογή: npx prisma db execute --url "$DIRECT_URL" --file prisma/sql/2026-11-14-partner-cooperating.sql

ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "cooperating" BOOLEAN NOT NULL DEFAULT true;
