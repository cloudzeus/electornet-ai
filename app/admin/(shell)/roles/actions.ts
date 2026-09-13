"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Replace the permission set of one role (matrix save). System «admin» keeps "*" via auth and is not editable. */
export async function saveRolePermissions(roleId: string, permissionIds: string[]) {
  const user = await requirePermission("staff.roles.write");
  const role = await db.role.findUniqueOrThrow({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
  if (role.system) return { ok: false, error: "Ο ρόλος συστήματος δεν αλλάζει." };
  const before = role.permissions.map((p) => p.permission.key).sort();
  await db.$transaction([
    db.rolePermission.deleteMany({ where: { roleId } }),
    db.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId, permissionId })), skipDuplicates: true }),
  ]);
  const after = (await db.permission.findMany({ where: { id: { in: permissionIds } }, select: { key: true } })).map((p) => p.key).sort();
  await audit(user.id, "role.permissions.update", "Role", roleId, { key: role.key, permissions: before }, { key: role.key, permissions: after });
  revalidatePath("/admin/roles");
  return { ok: true };
}

export async function createRole(fd: FormData) {
  const user = await requirePermission("staff.roles.write");
  const name = String(fd.get("name") ?? "").trim();
  const description = String(fd.get("description") ?? "").trim() || null;
  const key = slug(String(fd.get("key") ?? "") || name);
  if (!name || !key) return { ok: false, error: "Δώσε όνομα ρόλου." };
  if (await db.role.findUnique({ where: { key } })) return { ok: false, error: `Υπάρχει ήδη ρόλος με κλειδί «${key}».` };
  const role = await db.role.create({ data: { key, name, description } });
  await audit(user.id, "role.create", "Role", role.id, null, { key, name, description });
  revalidatePath("/admin/roles");
  return { ok: true };
}

export async function deleteRole(roleId: string) {
  const user = await requirePermission("staff.roles.write");
  const role = await db.role.findUniqueOrThrow({ where: { id: roleId }, include: { _count: { select: { staff: true } } } });
  if (role.system) return { ok: false, error: "Ο ρόλος συστήματος δεν διαγράφεται." };
  if (role._count.staff) return { ok: false, error: `Ο ρόλος έχει ${role._count.staff} χρήστες. Αφαίρεσέ τον πρώτα από αυτούς.` };
  await db.role.delete({ where: { id: roleId } });
  await audit(user.id, "role.delete", "Role", roleId, { key: role.key, name: role.name }, null);
  revalidatePath("/admin/roles");
  return { ok: true };
}
