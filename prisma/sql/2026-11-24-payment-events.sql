-- Ιστορικό πληρωμής: μία γραμμή ανά γεγονός (άνοιγμα σελίδας παρόχου, απόρριψη με αιτία, πληρωμή). Τροφοδοτεί το χρονολόγιο
-- στην κάρτα «Πληρωμή» της παραγγελίας και τη σελίδα «Αποτυχημένες πληρωμές». Χωρίς τον πίνακα ο κώδικας δουλεύει κανονικά
-- (η καταγραφή και οι αναγνώσεις αγνοούν το σφάλμα) αλλά δεν γράφεται ιστορικό.
-- Μόνο προσθήκη, idempotent. Εφαρμογή: npx prisma db execute --url "$DIRECT_URL" --file prisma/sql/2026-11-24-payment-events.sql

CREATE TABLE IF NOT EXISTS "PaymentEvent" (
  "id"       TEXT PRIMARY KEY,
  "orderId"  TEXT NOT NULL REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "kind"     TEXT NOT NULL,
  "source"   TEXT NOT NULL,
  "method"   TEXT,
  "psp"      TEXT,
  "pspOrder" TEXT,
  "txId"     TEXT,
  "eventId"  INTEGER,
  "card"     TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentEvent_txId_kind_key" ON "PaymentEvent"("txId", "kind");
CREATE INDEX IF NOT EXISTS "PaymentEvent_orderId_at_idx" ON "PaymentEvent"("orderId", "at");
CREATE INDEX IF NOT EXISTS "PaymentEvent_at_idx" ON "PaymentEvent"("at");
