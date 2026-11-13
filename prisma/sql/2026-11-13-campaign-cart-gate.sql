-- Έναρξη αγορών καμπάνιας: ως τότε τα προϊόντα της δεν μπαίνουν στο καλάθι, και ο πελάτης βλέπει το μήνυμα.
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "cartOpensAt" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "cartMessage" TEXT;
