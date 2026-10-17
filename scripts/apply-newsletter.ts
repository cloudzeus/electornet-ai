/**
 * Newsletter προσφοράς: πίνακες Newsletter / NewsletterRecipient / NewsletterEvent (+ στήλες testMode, single). Μόνο προσθήκες, ξανατρέχει χωρίς σφάλμα. Σύνδεση: DIRECT_URL.
 *   npx tsx scripts/apply-newsletter.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } } });
const SQL = [
  `CREATE TABLE IF NOT EXISTS "Newsletter" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "promotionId" TEXT,
    "campaignId" TEXT,
    "subject" TEXT NOT NULL,
    "preheader" TEXT NOT NULL DEFAULT '',
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "audience" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "contentHash" TEXT NOT NULL DEFAULT '',
    "testHash" TEXT,
    "testSentAt" TIMESTAMP(3),
    "testSentTo" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "opened" INTEGER NOT NULL DEFAULT 0,
    "clicked" INTEGER NOT NULL DEFAULT 0,
    "unsubscribed" INTEGER NOT NULL DEFAULT 0,
    "bounced" INTEGER NOT NULL DEFAULT 0,
    "complained" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "sentById" TEXT,
    "log" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Newsletter_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "Newsletter_status_scheduledAt_idx" ON "Newsletter"("status", "scheduledAt")`,
  `CREATE INDEX IF NOT EXISTS "Newsletter_promotionId_idx" ON "Newsletter"("promotionId")`,
  `CREATE INDEX IF NOT EXISTS "Newsletter_campaignId_idx" ON "Newsletter"("campaignId")`,
  `CREATE TABLE IF NOT EXISTS "NewsletterRecipient" (
    "id" TEXT NOT NULL,
    "newsletterId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subscriberId" TEXT,
    "customerId" TEXT,
    "firstName" TEXT,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "messageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "complainedAt" TIMESTAMP(3),
    CONSTRAINT "NewsletterRecipient_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NewsletterRecipient_newsletterId_fkey" FOREIGN KEY ("newsletterId") REFERENCES "Newsletter"("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "NewsletterRecipient_token_key" ON "NewsletterRecipient"("token")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "NewsletterRecipient_newsletterId_email_key" ON "NewsletterRecipient"("newsletterId", "email")`,
  `CREATE INDEX IF NOT EXISTS "NewsletterRecipient_newsletterId_status_idx" ON "NewsletterRecipient"("newsletterId", "status")`,
  `CREATE TABLE IF NOT EXISTS "NewsletterEvent" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NewsletterEvent_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "NewsletterEvent_recipientId_idx" ON "NewsletterEvent"("recipientId")`,
  // λειτουργία δοκιμής αποθηκευμένη στη γραμμή· παραλήπτης που στέλνεται μόνος του μετά από 400 σε πακέτο
  `ALTER TABLE "Newsletter" ADD COLUMN IF NOT EXISTS "testMode" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "NewsletterRecipient" ADD COLUMN IF NOT EXISTS "single" BOOLEAN NOT NULL DEFAULT false`,
];
(async () => {
  const exists = async () => Number((await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM information_schema.tables WHERE table_name IN ('Newsletter','NewsletterRecipient','NewsletterEvent')`))[0].n);
  const cols = async () => Number((await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM information_schema.columns WHERE (table_name = 'Newsletter' AND column_name = 'testMode') OR (table_name = 'NewsletterRecipient' AND column_name = 'single')`))[0].n);
  const before = await exists();
  const colsBefore = await cols();
  for (const q of SQL) await db.$executeRawUnsafe(q);
  console.log(before === 3 ? "Πίνακες newsletter: υπήρχαν ήδη." : "Πίνακες newsletter: εφαρμόστηκαν.");
  console.log(colsBefore === 2 ? "Στήλες testMode / single: υπήρχαν ήδη." : `Στήλες testMode / single: προστέθηκαν (${await cols()}/2).`);
  await db.$disconnect();
})().catch(async (e) => { console.error(e instanceof Error ? e.message : e); await db.$disconnect(); process.exit(1); });
