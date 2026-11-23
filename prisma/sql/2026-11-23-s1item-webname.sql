-- Είδη SoftOne: «Περιγραφή για Web» (MTRL.WEBNAME) — το όνομα που έδειχνε το παλιό euronics.gr· από εδώ βγαίνει ο τίτλος του προϊόντος.
-- Μόνο προσθήκη, idempotent. Εφαρμογή ΠΡΙΝ από το deploy: npx prisma db execute --url "$DIRECT_URL" --file prisma/sql/2026-11-23-s1item-webname.sql
-- Μετά το deploy: πλήρης συγχρονισμός ειδών (γεμίζει τη στήλη) και προβολή.

ALTER TABLE "S1Item" ADD COLUMN IF NOT EXISTS "webName" TEXT;
