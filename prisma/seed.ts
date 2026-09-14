/**
 * Seeds the permission catalogue, the system «admin» role and a demo admin
 * user. Roles requested by the client are added in prisma/roles.ts (data).
 * Run: npx tsx prisma/seed.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PERMISSIONS } from "../lib/rbac/permissions";
import { ROLES, SUPER_ADMIN } from "./roles";

const db = new PrismaClient();

async function main() {
  for (const p of PERMISSIONS) {
    await db.permission.upsert({ where: { key: p.key }, update: { group: p.group, description: p.description }, create: p });
  }
  const perms = await db.permission.findMany();
  for (const r of ROLES) {
    const role = await db.role.upsert({ where: { key: r.key }, update: { name: r.name, description: r.description, system: r.system ?? false }, create: { key: r.key, name: r.name, description: r.description, system: r.system ?? false } });
    const wanted = perms.filter((p) => r.permissions.some((g) => g === "*" || g === p.key || (g.endsWith(".*") && p.key.startsWith(g.slice(0, -1)))));
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({ data: wanted.map((p) => ({ roleId: role.id, permissionId: p.id })), skipDuplicates: true });
  }
  // Super admin (client) — password from env so it never lives in code.
  const superRole = await db.role.findUniqueOrThrow({ where: { key: "super-admin" } });
  const pw = process.env.SEED_SUPERADMIN_PASSWORD;
  const superAdmin = await db.staff.upsert({
    where: { email: SUPER_ADMIN.email },
    update: { name: SUPER_ADMIN.name, active: true, ...(pw ? { passwordHash: await bcrypt.hash(pw, 10) } : {}) },
    create: { email: SUPER_ADMIN.email, name: SUPER_ADMIN.name, passwordHash: pw ? await bcrypt.hash(pw, 10) : null },
  });
  await db.staffRole.upsert({ where: { staffId_roleId: { staffId: superAdmin.id, roleId: superRole.id } }, update: {}, create: { staffId: superAdmin.id, roleId: superRole.id } });
  // Κανένας λογαριασμός επίδειξης: σταθερός κωδικός στον κώδικα σημαίνει
  // γνωστή πόρτα στην παραγωγή. Οι χρήστες δημιουργούνται από τον super admin
  // στο /admin/staff.
  console.log(`seeded ${PERMISSIONS.length} permissions, ${ROLES.length} roles; super-admin ${SUPER_ADMIN.email} ${pw ? "(password set)" : "(NO password — set SEED_SUPERADMIN_PASSWORD in .env and re-run)"}`);
}
main().finally(() => db.$disconnect());
