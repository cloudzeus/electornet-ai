-- Παραγγελία → SoftOne: ο αριθμός του παραστατικού όπως φαίνεται μέσα στο ERP («PES 83» = κωδικός + αύξων της σειράς) και
-- το ιστορικό των απαντήσεων του SoftOne ανά βήμα αποστολής. Η καρτέλα της παραγγελίας τα δείχνει αντί για το εσωτερικό FINDOC.
-- ΠΡΙΝ από το deploy: ο κώδικας διαβάζει τις δύο στήλες. Μόνο προσθήκη, idempotent.
-- Εφαρμογή: npx prisma db execute --url "$DIRECT_URL" --file prisma/sql/2026-11-26-softone-docno-log.sql

ALTER TABLE "ErpSync" ADD COLUMN IF NOT EXISTS "docNo" TEXT;
ALTER TABLE "ErpSync" ADD COLUMN IF NOT EXISTS "log" JSONB;

-- Καταγραφή ΚΑΘΕ κλήσης προς το SoftOne (αίτημα, απάντηση, διάρκεια, σφάλμα) → σελίδα Διαχείριση → SoftOne ERP → Καταγραφή κλήσεων.
-- Χωρίς τον πίνακα οι κλήσεις δουλεύουν κανονικά (η καταγραφή αγνοεί το σφάλμα) αλλά δεν γράφεται τίποτα.
CREATE TABLE IF NOT EXISTS "S1Log" (
  "id"        TEXT PRIMARY KEY,
  "at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "service"   TEXT NOT NULL,
  "object"    TEXT,
  "key"       TEXT,
  "write"     BOOLEAN NOT NULL DEFAULT false,
  "ok"        BOOLEAN NOT NULL,
  "errorCode" INTEGER,
  "error"     TEXT,
  "http"      INTEGER,
  "ms"        INTEGER NOT NULL,
  "source"    TEXT,
  "request"   JSONB,
  "response"  TEXT,
  "bytes"     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "S1Log_at_idx" ON "S1Log"("at");
CREATE INDEX IF NOT EXISTS "S1Log_ok_at_idx" ON "S1Log"("ok", "at");
CREATE INDEX IF NOT EXISTS "S1Log_write_at_idx" ON "S1Log"("write", "at");
