/**
 * Καθημερινή αναφορά ασφαλείας: πίνακες SecurityReport / SecurityAlert + δικαιώματα security.read / security.run
 * (ανατίθενται μόνο στον super-admin). Μόνο προσθήκες, ξανατρέχει χωρίς σφάλμα. Σύνδεση: DIRECT_URL.
 *   npx tsx scripts/apply-security-audit.ts
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../lib/rbac/permissions";

const db = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } } });
const KEYS = ["security.read", "security.run"];
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
];
const cuidLike = () => "c" + randomBytes(12).toString("hex").slice(0, 24);

(async () => {
  const before = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN ('SecurityReport','SecurityAlert')`);
  for (const q of SQL) await db.$executeRawUnsafe(q);
  const changes: string[] = [];
  if (!(await db.role.findUnique({ where: { key: "super-admin" } }))) console.warn("ΠΡΟΣΟΧΗ: δεν υπάρχει ρόλος super-admin — τα δικαιώματα δημιουργήθηκαν αλλά δεν ανατέθηκαν σε κανέναν.");
  for (const key of KEYS) {
    const def = PERMISSIONS.find((p) => p.key === key)!;
    const n = await db.$executeRawUnsafe(`INSERT INTO "Permission" ("id","key","group","description") VALUES ($1,$2,$3,$4) ON CONFLICT ("key") DO NOTHING`, cuidLike(), def.key, def.group, def.description);
    if (n) changes.push(`δικαίωμα ${key}`);
    // ο super-admin έχει «*» στον κώδικα αλλά πραγματικές γραμμές RolePermission στη βάση (βλ. prisma/seed.ts)
    const r = await db.$executeRawUnsafe(`INSERT INTO "RolePermission" ("roleId","permissionId") SELECT r."id", p."id" FROM "Role" r, "Permission" p WHERE r."key" = 'super-admin' AND p."key" = $1 ON CONFLICT DO NOTHING`, key);
    if (r) changes.push(`super-admin: ${key}`);
  }
  console.log(Number(before[0].n) === 2 ? "Πίνακες: υπήρχαν ήδη." : "Πίνακες: εφαρμόστηκαν.", changes.length ? `Αλλαγές: ${changes.join(", ")}` : "Δικαιώματα: τίποτα να γίνει.");
  await db.$disconnect();
})().catch(async (e) => { console.error(e instanceof Error ? e.message : e); await db.$disconnect(); process.exit(1); });
