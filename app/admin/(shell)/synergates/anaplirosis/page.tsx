import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { db } from "@/lib/db";
import { RESTOCK_INCLUDE, RestockList } from "@/components/admin/partners/RestockList";

export const metadata = { title: "Αναπληρώσεις συνεργατών" };
export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "requested", label: "Προς έγκριση", statuses: ["requested"] },
  { key: "todo", label: "Προς αποστολή / ετοιμασία", statuses: ["approved"] },
  { key: "ready", label: "Περιμένουν παραλαβή", statuses: ["ready"] },
  { key: "done", label: "Ολοκληρώθηκαν", statuses: ["shipped"] },
  { key: "closed", label: "Απορρίφθηκαν / ακυρώθηκαν", statuses: ["rejected", "cancelled"] },
  { key: "all", label: "Όλα", statuses: [] as string[] },
] as const;

/** Αιτήματα αναπλήρωσης αποθέματος που κάνουν τα μέλη από παραγγελίες του eshop στην πύλη συνεργατών. */
export default async function RestocksAdmin({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requirePermission("stores.partners.read");
  const canWrite = can(user.permissions, "stores.partners.write");
  const { view = "requested" } = await searchParams;
  const v = VIEWS.find((x) => x.key === view) ?? VIEWS[0];

  const [rows, counts] = await Promise.all([
    db.partnerRestock.findMany({ where: v.statuses.length ? { status: { in: [...v.statuses] } } : {}, orderBy: { createdAt: v.key === "requested" ? "asc" : "desc" }, take: 200, include: RESTOCK_INCLUDE }),
    db.partnerRestock.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const n = (x: (typeof VIEWS)[number]) => counts.filter((c) => !x.statuses.length || (x.statuses as readonly string[]).includes(c.status)).reduce((a, c) => a + c._count._all, 0);

  return (
    <div className="grid gap-3 min-w-0">
      <Link href="/admin/synergates" className="inline-flex items-center gap-1 text-eu-blue font-bold text-[length:var(--fs-14)] hover:underline"><ChevronLeft className="size-4" aria-hidden /> Συνεργάτες</Link>
      <div className="min-w-0">
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-24)] leading-tight">Αναπληρώσεις συνεργατών</h2>
        <p className="m-0 text-eu-ink-3 text-[length:var(--fs-13)] max-w-[75ch]">Τα μέλη παραδίδουν υποχρεωτικά κάθε παραγγελία του eshop· όταν λείπει απόθεμα, ζητούν αναπλήρωση από την παραγγελία στην πύλη: στην επόμενη μαζική αποστολή, άμεσα, ή παραλαβή από το πλησιέστερο κατάστημα με απόθεμα. Η έγκριση κάνει παραγγελία αναπλήρωσης και ενημερώνει το μέλος (πύλη + email). Στο SoftOne δεν περνά ακόμη.</p>
      </div>
      <nav data-help="restock.views" aria-label="Κατάσταση" className="flex flex-wrap gap-2">
        {VIEWS.map((x) => {
          const on = x.key === v.key, c = n(x);
          return <Link key={x.key} href={`?view=${x.key}`} aria-current={on ? "page" : undefined} className={`inline-flex items-center gap-2 rounded-full px-3 min-h-11 text-[length:var(--fs-13)] font-bold border ${on ? "bg-eu-navy text-white border-eu-navy" : "border-eu-line text-eu-ink hover:border-eu-navy"}`}>{x.label}<span className={`rounded-full px-2 tabular-nums ${on ? "bg-white/20" : x.key === "requested" && c ? "bg-eu-yellow text-eu-navy" : "bg-eu-surface-2"}`}>{c}</span></Link>;
        })}
      </nav>
      {rows.length ? <RestockList rows={rows} canWrite={canWrite} /> : <p className="m-0 rounded-xl border border-eu-line bg-white p-4 text-eu-ink-3 text-[length:var(--fs-14)]">{v.key === "requested" ? "Κανένα αίτημα δεν περιμένει έγκριση." : "Κανένα αίτημα εδώ."}</p>}
    </div>
  );
}
