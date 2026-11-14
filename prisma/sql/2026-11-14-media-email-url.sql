-- Μικρογραφία email (360px JPEG σε λευκό) ανά φωτογραφία προϊόντος και ανά αρχείο της εισαγωγής.
-- Τα email πελάτη / συνεργάτη / εσωτερικά δείχνουν αυτή, αντί να μετατρέπουν την εικόνα κάθε φορά:
-- Gmail και Outlook δεν δείχνουν WebP, και οι φωτογραφίες του καταλόγου είναι έως 1920px.
-- Συμπλήρωση των υπαρχόντων: npx tsx --conditions=react-server scripts/email-thumbs.ts
ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "emailUrl" TEXT;
ALTER TABLE "ImageImport" ADD COLUMN IF NOT EXISTS "emailUrl" TEXT;
