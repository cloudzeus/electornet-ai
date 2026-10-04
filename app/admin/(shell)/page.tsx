import Link from "next/link";
import { requireStaff } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { getOrders } from "@/lib/data/repo";
import { radar } from "@/lib/data/fixtures/radar";
import { ADMIN_NAV } from "@/components/admin/nav";
import { billedTodayEur } from "@/lib/ai/openrouter";

export const metadata = { title: "Dashboard" };

/** Dashboard: what needs attention today, per permission. Demo numbers from fixtures until the ERP sync lands. */
export default async function AdminHome() {
  const user = await requireStaff();
  const [orders, staffCount, roleCount, auditCount, aiCost] = await Promise.all([getOrders(), db.staff.count(), db.role.count(), db.auditLog.count(), billedTodayEur()]);
  const tiles = [
    { l: "Παραγγελίες σήμερα", v: orders.filter((o) => o.status !== "cancelled").length, perm: "orders.read", h: "/admin/orders" },
    { l: "Σε εξέλιξη", v: orders.filter((o) => ["paid", "processing", "shipped"].includes(o.status)).length, perm: "orders.read", h: "/admin/orders" },
    { l: "Συνομιλίες Ερμή (7 ημ.)", v: radar.sessions, perm: "marketing.radar.read", h: "/admin/radar" },
    { l: "Ζητήθηκαν & λείπουν", v: radar.missing.length, perm: "marketing.radar.read", h: "/admin/radar" },
    { l: "AI κόστος σήμερα (€)", v: Number(aiCost.toFixed(2)), perm: "reports.read", h: "/admin/reports/ai" },
    { l: "Χρήστες", v: staffCount, perm: "staff.read", h: "/admin/staff" },
    { l: "Ρόλοι", v: roleCount, perm: "staff.roles.write", h: "/admin/roles" },
    { l: "Ενέργειες (audit)", v: auditCount, perm: "audit.read", h: "/admin/audit" },
  ].filter((t) => can(user.permissions, t.perm));
  const quick = ADMIN_NAV.flatMap((g) => g.items).filter((i) => !i.soon && i.href !== "/admin" && (i.superOnly ? user.roles.includes("super-admin") : can(user.permissions, i.perm)));
  return (
    <>
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase">Καλημέρα, {user.name}</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Τι χρειάζεται προσοχή</h2>
      </div>
      <ul className="m-0 p-0 list-none grid grid-cols-2 @lg:grid-cols-4 gap-2">
        {tiles.map((t) => (
          <li key={t.l}>
            <Link href={t.h} className="flex items-baseline gap-2 rounded-xl bg-white border border-eu-line px-3 py-2 min-h-11 hover:border-eu-blue hover:shadow-[var(--shadow-raised)] transition-all">
              <div className="font-heading font-extrabold text-eu-navy text-[length:var(--fs-20)] leading-none tabular-nums shrink-0">{t.v.toLocaleString("el-GR")}</div>
              <div className="text-eu-muted text-[length:var(--fs-13)] leading-tight min-w-0">{t.l}</div>
            </Link>
          </li>
        ))}
      </ul>
      <section className="rounded-xl bg-white border border-eu-line p-3">
        <h3 className="m-0 mb-2 font-heading font-bold text-eu-ink text-[length:var(--fs-15)]">Διαθέσιμα τώρα</h3>
        <div className="flex flex-wrap gap-1.5">
          {quick.map((i) => (
            <Link key={i.href} href={i.href} className="rounded-full bg-eu-surface text-eu-navy font-bold text-[length:var(--fs-13)] px-3 min-h-9 inline-flex items-center hover:bg-eu-navy hover:text-white transition-colors">
              {i.label}
            </Link>
          ))}
        </div>
        <p className="m-0 mt-2 text-eu-muted text-[length:var(--fs-12)]">Οι ενότητες με «σύντομα» ενεργοποιούνται καθώς χτίζεται το CMS. Τα δικαιώματα ήδη τις ελέγχουν.</p>
      </section>
    </>
  );
}
