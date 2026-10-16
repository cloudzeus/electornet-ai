import Link from "next/link";
import { AlertTriangle, Clock, Download, PackageCheck, ShoppingBag, Store, Truck } from "lucide-react";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { VIEWS, isView, listOrders, ordersToday, type ListFilter } from "@/lib/orders/admin";
import { eur } from "@/components/admin/orders/ui";
import { OrderFilters } from "./OrderFilters";
import { OrdersTable } from "./OrdersTable";

export const metadata = { title: "Παραγγελίες" };
export const dynamic = "force-dynamic";

type SP = { v?: string; q?: string; ful?: string; pay?: string; from?: string; to?: string; sort?: string; p?: string };

/**
 * Παραγγελίες (ui-ux-pro-max): λεπτή κεφαλίδα, σύνοψη ημέρας που φιλτράρει με ένα κλικ, προβολές με πλήθη, φίλτρα στη
 * διεύθυνση (κοινοποιούνται / μένουν στο «πίσω»), πυκνός πίνακας με επιλογή και μαζικές ενέργειες, κάρτες στο κινητό.
 */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("orders.read");
  const sp = await searchParams;
  const f: ListFilter = { view: isView(sp.v) ? sp.v : "all", q: sp.q ?? "", fulfilment: sp.ful ?? "", pay: sp.pay ?? "", from: sp.from ?? "", to: sp.to ?? "", sort: sp.sort === "old" || sp.sort === "total" ? sp.sort : "new", page: Number(sp.p) || 1 };
  const [list, kpi] = await Promise.all([listOrders(f), ordersToday()]);
  const href = (o: Partial<SP>) => {
    const u = new URLSearchParams(Object.entries({ v: f.view === "all" ? "" : f.view, q: f.q, ful: f.fulfilment, pay: f.pay, from: f.from, to: f.to, sort: f.sort === "new" ? "" : f.sort, ...o }).filter(([, v]) => v) as [string, string][]);
    return `/admin/orders${u.size ? `?${u}` : ""}`;
  };
  const exportHref = `/api/admin/orders/export?${new URLSearchParams(Object.entries({ view: f.view, q: f.q ?? "", ful: f.fulfilment ?? "", pay: f.pay ?? "", from: f.from ?? "", to: f.to ?? "" }).filter(([, v]) => v))}`;
  const KPI = [
    { v: "all", label: "Σήμερα", value: `${kpi.todayCount}`, sub: eur(kpi.todayTotal), Icon: ShoppingBag, tone: "" },
    { v: "process", label: "Προς επεξεργασία", value: `${kpi.process}`, sub: "πληρωμένες / σε επεξεργασία", Icon: Clock, tone: kpi.process ? "text-eu-blue" : "" },
    { v: "ship", label: "Προς αποστολή", value: `${kpi.ship}`, sub: "courier χωρίς voucher", Icon: Truck, tone: kpi.ship ? "text-eu-blue" : "" },
    { v: "pickup", label: "Για παραλαβή", value: `${kpi.pickup}`, sub: "στο κατάστημα", Icon: Store, tone: "" },
    { v: "problems", label: "Θέλουν προσοχή", value: `${kpi.problems}`, sub: "πληρωμή, SoftOne, αποστολή, επιστροφή", Icon: AlertTriangle, tone: kpi.problems ? "text-eu-red" : "" },
  ] as const;

  return (
    <div className="@container grid gap-3 min-w-0">
      <div data-help="orders.header" className="@md:sticky top-0 z-30 -mx-4 @md:-mx-6 -mt-4 @md:-mt-6 px-4 @md:px-6 py-2 bg-eu-surface/95 backdrop-blur border-b border-eu-line flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] inline-flex items-center gap-2"><PackageCheck className="size-5 text-eu-blue" aria-hidden /> Παραγγελίες</h2>
        <span className="text-eu-ink-3 text-[length:var(--fs-13)] tabular-nums">{list.total.toLocaleString("el-GR")} {f.view === "all" && !f.q ? "συνολικά" : "με αυτά τα κριτήρια"}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <a href={exportHref} className="inline-flex items-center gap-1.5 rounded-full border border-eu-line bg-white font-bold text-[length:var(--fs-13)] px-3 min-h-11 md:min-h-9 hover:border-eu-navy" title="Η τρέχουσα λίστα σε CSV για Excel"><Download className="size-4" aria-hidden /> CSV</a>
        </div>
      </div>

      <dl data-help="orders.kpi" className="m-0 grid grid-cols-2 @2xl:grid-cols-5 gap-1.5">
        {KPI.map((k) => (
          <Link key={k.label} href={href({ v: k.v === "all" ? "" : k.v, p: "" })} aria-current={f.view === k.v && k.v !== "all" ? "true" : undefined} className={`grid gap-0.5 rounded-xl border bg-white px-3 py-2 hover:border-eu-navy transition-colors ${f.view === k.v && k.v !== "all" ? "border-eu-navy ring-1 ring-eu-navy" : "border-eu-line"}`}>
            <dt className="inline-flex items-center gap-1.5 text-eu-muted text-[length:var(--fs-12)]"><k.Icon className="size-3.5" aria-hidden />{k.label}</dt>
            <dd className={`m-0 font-heading font-extrabold text-[length:var(--fs-20)] tabular-nums leading-tight ${k.tone || "text-eu-ink"}`}>{k.value}</dd>
            <dd className="m-0 text-eu-muted text-[length:var(--fs-12)] truncate">{k.sub}</dd>
          </Link>
        ))}
      </dl>

      <nav data-help="orders.views" aria-label="Προβολές" className="flex flex-wrap gap-1">
        {VIEWS.map((v) => {
          const on = f.view === v.id, n = list.counts[v.id];
          return (
            <Link key={v.id} href={href({ v: v.id === "all" ? "" : v.id, p: "" })} aria-current={on ? "page" : undefined} className={`inline-flex items-center gap-1.5 rounded-full px-3 min-h-11 md:min-h-8 font-bold text-[length:var(--fs-13)] ${on ? "bg-eu-navy text-white" : "bg-white border border-eu-line text-eu-ink-3 hover:text-eu-navy hover:border-eu-navy"}`}>
              {v.label}<span className={`tabular-nums text-[length:var(--fs-12)] ${on ? "text-white/75" : v.id === "problems" && n ? "text-eu-red" : "text-eu-muted"}`}>{n}</span>
            </Link>
          );
        })}
      </nav>

      <OrderFilters q={f.q ?? ""} ful={f.fulfilment ?? ""} pay={f.pay ?? ""} from={f.from ?? ""} to={f.to ?? ""} sort={f.sort ?? "new"} />

      <OrdersTable rows={list.rows} canWrite={can(user.permissions, "orders.write")} exportBase={exportHref} empty={list.total === 0 && f.view === "all" && !f.q && !f.fulfilment && !f.pay && !f.from && !f.to ? "none" : list.total === 0 ? "filtered" : null} />

      {list.pages > 1 && (
        <nav aria-label="Σελίδες" className="flex items-center justify-center gap-1.5 text-[length:var(--fs-13)]">
          {list.page > 1 && <Link href={href({ p: String(list.page - 1) })} className="rounded-full border border-eu-line bg-white px-3 min-h-11 md:min-h-9 inline-flex items-center font-bold hover:border-eu-navy">← Προηγούμενη</Link>}
          <span className="text-eu-ink-3 tabular-nums">Σελίδα {list.page} από {list.pages}</span>
          {list.page < list.pages && <Link href={href({ p: String(list.page + 1) })} className="rounded-full border border-eu-line bg-white px-3 min-h-11 md:min-h-9 inline-flex items-center font-bold hover:border-eu-navy">Επόμενη →</Link>}
        </nav>
      )}
    </div>
  );
}
