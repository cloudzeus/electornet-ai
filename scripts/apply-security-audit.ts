/**
 * Καθημερινή αναφορά ασφαλείας: πίνακες SecurityReport (+ στήλη alertRetry) / SecurityAlert + ευρετήριο LoginEvent(method, at)
 * για τον έλεγχο συνδέσεων. Ξανατρέχει χωρίς σφάλμα. Σύνδεση: DIRECT_URL.
 * Η σελίδα «Ασφάλεια» είναι μόνο για super-admin (ruling G): τα δικαιώματα security.read / security.run που πρόσθετε μια
 * παλαιότερη έκδοση του script ΣΒΗΝΟΝΤΑΙ (μόνο αυτά τα δύο κλειδιά — δικά μας, χωρίς άλλη χρήση), idempotent.
 *   npx tsx scripts/apply-security-audit.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } } });
/** Παλιά δικαιώματα που αφαιρούνται (ruling G) — ΜΟΝΟ αυτά. */
const DROP_KEYS = ["security.read", "security.run"] as const;
const SQL = [
  `CREATE TABLE IF NOT EXISTS "SecurityReport" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "checks" JSONB NOT NULL,
    "alerted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "SecurityReport_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "SecurityReport_startedAt_idx" ON "SecurityReport"("startedAt")`,
  `CREATE TABLE IF NOT EXISTS "SecurityAlert" (
    "fingerprint" TEXT NOT NULL,
    "lastSentAt" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "SecurityAlert_pkey" PRIMARY KEY ("fingerprint")
  )`,
  // παραλήπτες που δεν πήραν την ειδοποίηση (νέα προσπάθεια μόνο σε αυτούς) — ΠΡΙΝ το deploy του κώδικα που τη διαβάζει
  `ALTER TABLE "SecurityReport" ADD COLUMN IF NOT EXISTS "alertRetry" JSONB`,
];
/**
 * CONCURRENTLY: χωρίς κλείδωμα εγγραφών στον (ζωντανό) πίνακα. Δεν τρέχει μέσα σε συναλλαγή — γι' αυτό ξεχωριστή, μόνη της
 * εντολή (το $executeRawUnsafe στέλνει μία εντολή σε autocommit). Αν μια προηγούμενη προσπάθεια διακόπηκε, μπορεί να έχει
 * μείνει INVALID ευρετήριο που το IF NOT EXISTS προσπερνά: ελέγχεται παρακάτω και αναφέρεται.
 */
const INDEX_SQL = `CREATE INDEX CONCURRENTLY IF NOT EXISTS "LoginEvent_method_at_idx" ON "LoginEvent"("method","at")`;

(async () => {
  const before = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN ('SecurityReport','SecurityAlert')`);
  for (const q of SQL) await db.$executeRawUnsafe(q);
  await db.$executeRawUnsafe(INDEX_SQL);
  const invalid = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = 'LoginEvent_method_at_idx' AND NOT i.indisvalid`);
  if (Number(invalid[0].n)) console.warn("ΠΡΟΣΟΧΗ: το LoginEvent_method_at_idx είναι INVALID (διακοπείσα δημιουργία) — DROP INDEX CONCURRENTLY και ξανατρέξτε.");
  const changes: string[] = [];
  // πρώτα οι αναθέσεις σε ρόλους, μετά τα ίδια τα δικαιώματα (FK)· μόνο τα δύο κλειδιά, ως παράμετροι
  const rp = await db.$executeRawUnsafe(`DELETE FROM "RolePermission" WHERE "permissionId" IN (SELECT "id" FROM "Permission" WHERE "key" IN ($1, $2))`, ...DROP_KEYS);
  if (rp) changes.push(`αφαιρέθηκαν ${rp} αναθέσεις security.read/run`);
  const pm = await db.$executeRawUnsafe(`DELETE FROM "Permission" WHERE "key" IN ($1, $2)`, ...DROP_KEYS);
  if (pm) changes.push(`αφαιρέθηκαν ${pm} δικαιώματα security.read/run`);
  console.log(Number(before[0].n) === 2 ? "Πίνακες: υπήρχαν ήδη." : "Πίνακες: εφαρμόστηκαν.", changes.length ? `Αλλαγές: ${changes.join(", ")}` : "Δικαιώματα: τίποτα να γίνει.");
  await db.$disconnect();
})().catch(async (e) => { console.error(e instanceof Error ? e.message : e); await db.$disconnect(); process.exit(1); });
