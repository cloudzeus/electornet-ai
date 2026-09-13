"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";

export async function createStaff(fd: FormData) {
  const user = await requirePermission("staff.write");
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("name") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const storeId = String(fd.get("storeId") ?? "").trim() || null;
  const roleIds = fd.getAll("roleIds").map(String);
  if (!email || !name) return { ok: false, error: "Email και όνομα είναι υποχρεωτικά." };
  if (password && password.length < 8) return { ok: false, error: "Ο κωδικός θέλει τουλάχιστον 8 χαρακτήρες." };
  if (await db.staff.findUnique({ where: { email } })) return { ok: false, error: "Υπάρχει ήδη χρήστης με αυτό το email." };
  const staff = await db.staff.create({
    data: { email, name, storeId, passwordHash: password ? await bcrypt.hash(password, 10) : null, roles: { create: roleIds.map((roleId) => ({ roleId })) } },
  });
  await audit(user.id, "staff.create", "Staff", staff.id, null, { email, name, storeId, roleIds });
  revalidatePath("/admin/staff");
  return { ok: true };
}

export async function updateStaff(id: string, fd: FormData) {
  const user = await requirePermission("staff.write");
  const before = await db.staff.findUniqueOrThrow({ where: { id }, include: { roles: true } });
  const name = String(fd.get("name") ?? "").trim() || before.name;
  const storeId = String(fd.get("storeId") ?? "").trim() || null;
  const password = String(fd.get("password") ?? "");
  const roleIds = fd.getAll("roleIds").map(String);
  const active = fd.get("active") === "on";
  if (password && password.length < 8) return { ok: false, error: "Ο κωδικός θέλει τουλάχιστον 8 χαρακτήρες." };
  if (id === user.id && !active) return { ok: false, error: "Δεν μπορείς να απενεργοποιήσεις τον εαυτό σου." };
  await db.$transaction([
    db.staff.update({ where: { id }, data: { name, storeId, active, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) } }),
    db.staffRole.deleteMany({ where: { staffId: id } }),
    db.staffRole.createMany({ data: roleIds.map((roleId) => ({ staffId: id, roleId })), skipDuplicates: true }),
  ]);
  await audit(
    user.id,
    "staff.update",
    "Staff",
    id,
    { name: before.name, storeId: before.storeId, active: before.active, roleIds: before.roles.map((r) => r.roleId) },
    { name, storeId, active, roleIds, passwordChanged: !!password },
  );
  revalidatePath("/admin/staff");
  return { ok: true };
}
