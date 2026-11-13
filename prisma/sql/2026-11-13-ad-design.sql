-- Σχεδιασμένα banners: το σχέδιο (φόντο/κίνηση, κείμενα, προϊόντα) ως JSON· null = έτοιμη εικόνα όπως πριν.
ALTER TABLE "AdPlacement" ADD COLUMN IF NOT EXISTS "design" JSONB;
