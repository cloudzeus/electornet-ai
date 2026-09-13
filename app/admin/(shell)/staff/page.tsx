import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { getStores } from "@/lib/data/repo";
import { StaffTable } from "@/components/admin/StaffTable";

export const metadata = { title: "Χρήστες" };
export const dynamic = "force-dynamic";

/** Staff accounts of the back office: roles, store scope, active flag. */
export default async function StaffPage() {
  const me = await requirePermission("staff.read");
  const [staff, roles, stores] = await Promise.all([
    db.staff.findMany({ orderBy: { createdAt: "asc" }, include: { roles: { include: { role: { select: { id: true, name: true, key: true } } } } } }),
    db.role.findMany({ orderBy: [{ system: "desc" }, { createdAt: "asc" }], select: { id: true, name: true, key: true } }),
    getStores(),
  ]);
  return (
    <>
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Ομάδα</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Χρήστες διαχείρισης</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[70ch]">Κάθε χρήστης έχει έναν ή περισσότερους ρόλους. Προαιρετικά δένεται σε κατάστημα για ρόλους καταστήματος.</p>
      </div>
      <StaffTable
        me={me.id}
        canWrite={me.permissions.includes("*") || me.permissions.includes("staff.write")}
        roles={roles}
        stores={stores.map((s) => ({ id: s.id, name: s.name }))}
        staff={staff.map((s) => ({ id: s.id, email: s.email, name: s.name, active: s.active, storeId: s.storeId, lastLoginAt: s.lastLoginAt?.toISOString() ?? null, sso: !s.passwordHash, roles: s.roles.map((r) => r.role) }))}
      />
    </>
  );
}
