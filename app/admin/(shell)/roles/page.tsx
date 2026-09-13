import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { PERMISSION_GROUPS, PERMISSIONS, type PermissionGroup } from "@/lib/rbac/permissions";
import { RoleMatrix } from "@/components/admin/RoleMatrix";
import { CreateRoleForm } from "@/components/admin/CreateRoleForm";

export const metadata = { title: "Ρόλοι & δικαιώματα" };
export const dynamic = "force-dynamic";

/** Role × permission matrix. Rows = permissions grouped by area, columns = roles. */
export default async function RolesPage() {
  await requirePermission("staff.roles.write");
  const [roles, perms] = await Promise.all([
    db.role.findMany({ orderBy: [{ system: "desc" }, { createdAt: "asc" }], include: { permissions: { select: { permissionId: true } }, _count: { select: { staff: true } } } }),
    db.permission.findMany(),
  ]);
  const byKey = new Map(perms.map((p) => [p.key, p.id]));
  const groups = (Object.keys(PERMISSION_GROUPS) as PermissionGroup[]).map((g) => ({
    key: g,
    label: PERMISSION_GROUPS[g],
    perms: PERMISSIONS.filter((p) => p.group === g && byKey.has(p.key)).map((p) => ({ id: byKey.get(p.key)!, key: p.key, description: p.description })),
  })).filter((g) => g.perms.length);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">RBAC</div>
          <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Ρόλοι & δικαιώματα</h2>
          <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[70ch]">
            Κάθε στήλη είναι ρόλος, κάθε γραμμή ένα δικαίωμα. Ο «Super Admin» έχει πάντα τα πάντα. Οι αλλαγές ισχύουν στην επόμενη σύνδεση του χρήστη και καταγράφονται στο audit log.
          </p>
        </div>
        <CreateRoleForm />
      </div>
      <RoleMatrix
        roles={roles.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, system: r.system, staff: r._count.staff, permissionIds: r.permissions.map((p) => p.permissionId) }))}
        groups={groups}
      />
    </>
  );
}
