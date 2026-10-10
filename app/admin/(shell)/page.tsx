import { requireStaff } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { ADMIN_NAV } from "@/components/admin/nav";
import { Dashboard } from "@/components/admin/dashboard/Dashboard";
import { normalizeLayout, ROLE_DEFAULTS, WIDGETS, type WidgetData } from "@/lib/dashboard/catalog";
import { allowedFor, roleLayout, userLayout } from "@/lib/dashboard/store";
import { loadWidget } from "@/lib/dashboard/data";
import { ROLES } from "@/prisma/roles";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/**
 * Ο πανόπτης της διαχείρισης: ζώνες με components ανά ρόλο, όλα με πραγματικά δεδομένα και πάντα φιλτραρισμένα με
 * τα δικαιώματα του χρήστη. ?role=<ρόλος>: όποιος διαχειρίζεται ρόλους σχεδιάζει την προεπιλογή ενός ρόλου.
 */
export default async function AdminHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [user, sp] = await Promise.all([requireStaff(), searchParams]);
  const canRoles = can(user.permissions, "staff.roles.write");
  const roleName = (k: string) => ROLES.find((r) => r.key === k)?.name ?? k;
  const roleEdit = canRoles && sp.role && sp.role in ROLE_DEFAULTS ? { role: sp.role, label: roleName(sp.role) } : null;

  const allowed = allowedFor(user);
  const mine = await userLayout(user);
  const layout = roleEdit ? normalizeLayout((await roleLayout(roleEdit.role)).layout, allowed) : mine.layout;
  // όλες οι καρτέλες φορτώνουν μαζί: η εναλλαγή καρτέλας είναι άμεση
  const ids = [...new Set([...layout.pinned, ...layout.tabs.flatMap((t) => t.items)].map((i) => i.id))].filter((id) => id !== "quick");
  const [entries, store] = await Promise.all([
    Promise.all(ids.map(async (id) => [id, await loadWidget(id, user)] as const)),
    user.storeId ? db.store.findUnique({ where: { id: user.storeId }, select: { name: true } }).catch(() => null) : null,
  ]);
  const data: Record<string, WidgetData | null> = Object.fromEntries(entries);
  const quick = ADMIN_NAV.flatMap((g) => g.items).filter((i) => !i.soon && i.href !== "/admin" && (i.superOnly ? user.roles.includes("super-admin") : can(user.permissions, i.perm))).map((i) => ({ href: i.href, label: i.label }));

  return (
    <Dashboard
      key={roleEdit?.role ?? "me"}
      name={user.name ?? ""}
      roleLabel={roleName(mine.role)}
      storeName={store?.name ?? null}
      layout={layout}
      data={data}
      allowed={WIDGETS.map((w) => w.id).filter(allowed)}
      quick={quick}
      source={mine.source}
      roleEdit={roleEdit}
      roles={canRoles ? Object.keys(ROLE_DEFAULTS).map((k) => ({ key: k, label: roleName(k) })) : null}
    />
  );
}
