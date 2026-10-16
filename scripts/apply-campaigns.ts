/**
 * Καμπάνιες (Φάση 1): στήλες / δείκτες / κλειδιά και το δικαίωμα + οι ρόλοι έγκρισης — χωρίς seed (το seed επαναφέρει
 * όλους τους ρόλους στη βάση που μοιράζεται με το live). Μόνο προσθήκες, ξανατρέχει χωρίς σφάλμα. Σύνδεση: DIRECT_URL.
 *   npx tsx scripts/apply-campaigns.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../lib/rbac/permissions";
import { ROLES } from "../prisma/roles";

const db = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } } });

const SQL = [
  `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "code" TEXT`,
  `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "goal" TEXT NOT NULL DEFAULT 'sales'`,
  `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "brief" TEXT`,
  `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'draft'`,
  `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "budgetEur" DECIMAL(12,2)`,
  `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "ownerId" TEXT`,
  `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "createdById" TEXT`,
  `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "approvals" JSONB`,
  `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3)`,
  `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
  `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
  `ALTER TABLE "Promotion" ADD COLUMN IF NOT EXISTS "campaignId" TEXT`,
  `ALTER TABLE "LandingPage" ADD COLUMN IF NOT EXISTS "campaignId" TEXT`,
  `ALTER TABLE "AdPlacement" ADD COLUMN IF NOT EXISTS "campaignId" TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Campaign_code_key" ON "Campaign"("code")`,
  `CREATE INDEX IF NOT EXISTS "Campaign_status_startsAt_endsAt_idx" ON "Campaign"("status", "startsAt", "endsAt")`,
  `CREATE INDEX IF NOT EXISTS "Promotion_campaignId_idx" ON "Promotion"("campaignId")`,
  `CREATE INDEX IF NOT EXISTS "LandingPage_campaignId_idx" ON "LandingPage"("campaignId")`,
  `CREATE INDEX IF NOT EXISTS "AdPlacement_campaignId_idx" ON "AdPlacement"("campaignId")`,
  ...["Promotion", "LandingPage", "AdPlacement"].map((t) => `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${t}_campaignId_fkey') THEN ALTER TABLE "${t}" ADD CONSTRAINT "${t}_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$`),
];

(async () => {
  const before = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) n FROM information_schema.columns WHERE table_name = 'Campaign' AND column_name = 'code'`);
  for (const q of SQL) await db.$executeRawUnsafe(q);

  // δικαίωμα + ρόλοι έγκρισης: μόνο ό,τι λείπει — οι υπάρχοντες ρόλοι δεν αλλάζουν
  const key = "catalog.promos.approve-finance";
  const def = PERMISSIONS.find((p) => p.key === key)!;
  const perm = await db.permission.upsert({ where: { key }, update: {}, create: def });
  const changes: string[] = [];
  for (const k of ["commercial-director", "finance-director"]) {
    if (await db.role.findUnique({ where: { key: k } })) continue;
    const r = ROLES.find((x) => x.key === k)!;
    const role = await db.role.create({ data: { key: r.key, name: r.name, description: r.description } });
    const perms = await db.permission.findMany({ where: { key: { in: r.permissions } } });
    await db.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })), skipDuplicates: true });
    changes.push(`ρόλος ${r.name}`);
  }
  // super-admin / admin έχουν «catalog.*»: παίρνουν και το νέο δικαίωμα
  for (const k of ["super-admin", "admin"]) {
    const role = await db.role.findUnique({ where: { key: k } });
    if (!role) continue;
    const r = await db.rolePermission.createMany({ data: [{ roleId: role.id, permissionId: perm.id }], skipDuplicates: true });
    if (r.count) changes.push(`${k}: ${key}`);
  }
  console.log(Number(before[0].n) ? "Στήλες: υπήρχαν ήδη." : "Στήλες: εφαρμόστηκαν.", changes.length ? `Αλλαγές: ${changes.join(", ")}` : "Ρόλοι: τίποτα να γίνει.");
  await db.$disconnect();
})().catch(async (e) => { console.error(e instanceof Error ? e.message : e); await db.$disconnect(); process.exit(1); });
