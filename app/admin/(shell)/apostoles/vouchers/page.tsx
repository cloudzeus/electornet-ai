import Link from "next/link";
import { CircleAlert, Info, Truck } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { can } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { getFeatures } from "@/lib/admin/features";
import { COURIER_NAME, VOUCHER_CARRIERS, courierEnv, isVoucherCarrier, shipmentDraft, type VoucherCarrier } from "@/lib/couriers/shipments";
import { CreateVoucher, DayActions } from "./VoucherControls";
import { VouchersBoard, type BoardRow } from "./VouchersBoard";

export const metadata = { title: "Vouchers courier" };
export const dynamic = "force-dynamic";

const eur = (n: number) => n.toLocaleString("el-GR", { style: "currency", currency: "EUR" });
const waitingWhere = (carrier: VoucherCarrier): Prisma.OrderWhereInput => ({ fulfilment: "courier", status: { in: ["pending", "paid", "processing"] }, shipping: { path: ["carrier"], equals: carrier }, shipments: { none: { status: { not: "cancelled" } } } });

/**
 * Vouchers courier (ui-ux-pro-max): λεπτή κεφαλίδα με courier / περιβάλλον / ενέργειες, KPIs, ουρά έκδοσης σε πυκνές
 * γραμμές και πίνακας vouchers με φίλτρα, επιλογή, εκτύπωση (ετικέτες, δελτίο παράδοσης, όλα σε ένα PDF) και widget
 * παρακολούθησης σε κάθε γραμμή. Γενική Ταχυδρομική και ΕΛΤΑ Courier (?c=).
 */
export default async function VouchersPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const user = await requirePermission("orders.read");
  const canWrite = can(user.permissions, "orders.write");
  const features = await getFeatures();
  const enabled = VOUCHER_CARRIERS.filter((c) => features[c]);
  const shown = enabled.length ? enabled : [...VOUCHER_CARRIERS];
  const counts = Object.fromEntries(await Promise.all(VOUCHER_CARRIERS.map(async (c) => [c, await db.order.count({ where: waitingWhere(c) })] as const))) as Record<VoucherCarrier, number>;
  const q = (await searchParams).c;
  const carrier: VoucherCarrier = isVoucherCarrier(q) ? q : shown.find((c) => counts[c] > 0) ?? shown[0];
  const name = COURIER_NAME[carrier];
  const env = await courierEnv(carrier);
  const week = new Date(Date.now() - 7 * 86400_000);
  const [waiting, shipments] = await Promise.all([
    db.order.findMany({ where: waitingWhere(carrier), orderBy: { createdAt: "asc" }, take: 50, select: { id: true } }),
    db.shipment.findMany({ where: { carrier }, orderBy: { createdAt: "desc" }, take: 300, include: { order: { select: { number: true, shipping: true } } } }),
  ]);
  const drafts = (await Promise.all(waiting.map((o) => shipmentDraft(o.id)))).filter((d) => d !== null);
  const inEnv = (s: { env: string }) => !env || s.env === env;
  const open = shipments.filter((s) => s.status === "created" && inEnv(s));
  const kpi = {
    queue: drafts.length,
    open: open.length,
    moving: shipments.filter((s) => ["closed", "in-transit", "out-for-delivery", "on-hold"].includes(s.status)).length,
    problem: shipments.filter((s) => ["attempted", "returning", "returned"].includes(s.status)).length,
    delivered: shipments.filter((s) => s.status === "delivered" && (s.deliveredAt ?? s.updatedAt) >= week).length,
  };
  const rows: BoardRow[] = shipments.map((s) => {
    const to = (s.order.shipping ?? {}) as Record<string, string>;
    const cp = s.lastCheckpoint as BoardRow["last"];
    return {
      id: s.id, voucher: s.voucher, sub: s.subVouchers.length, status: s.status, test: s.env !== "live", order: s.order.number,
      name: `${to.firstName ?? ""} ${to.lastName ?? ""}`.trim(), place: [to.zip, to.city].filter(Boolean).join(" "),
      pieces: s.pieces, kg: Number(s.weightKg), cod: Number(s.codAmount), createdAt: s.createdAt.toISOString(), last: cp?.text ? cp : null, error: s.error,
    };
  });
  const flow = carrier === "geniki"
    ? "Έκδοση voucher → εκτύπωση (ετικέτες + δελτίο παράδοσης) → «Κλείσιμο ημέρας» πριν παραδοθούν τα δέματα. Ακύρωση μόνο πριν το κλείσιμο."
    : "Έκδοση voucher → εκτύπωση (ετικέτα A6 ανά τεμάχιο + δελτίο παράδοσης) → παράδοση στην ΕΛΤΑ. Χωρίς κλείσιμο ημέρας: με την πρώτη κίνηση η αποστολή φεύγει και ο πελάτης παίρνει email. Ακύρωση μέχρι τότε.";
  const KPI: [string, number, string, string?][] = [["Προς έκδοση", kpi.queue, "Παραγγελίες που περιμένουν voucher"], ["Ανοιχτά", kpi.open, carrier === "geniki" ? "Εκδόθηκαν, πριν το κλείσιμο ημέρας" : "Εκδόθηκαν, περιμένουν παραλαβή"], ["Σε διαδρομή", kpi.moving, "Στον courier ή σε διανομή"], ["Προβλήματα", kpi.problem, "Ανεπιτυχής επίδοση ή επιστροφή", kpi.problem ? "text-eu-red" : undefined], ["Παραδόθηκαν · 7 ημ.", kpi.delivered, "Παραδόσεις των τελευταίων 7 ημερών"]];

  return (
    <div className="@container grid gap-3 min-w-0">
      {/* λεπτή σταθερή κεφαλίδα */}
      <div data-help="vouchers.header" className="@md:sticky top-0 z-30 -mx-4 @md:-mx-6 -mt-4 @md:-mt-6 px-4 @md:px-6 py-2 bg-eu-surface/95 backdrop-blur border-b border-eu-line flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-20)] inline-flex items-center gap-2"><Truck className="size-5 text-eu-blue" aria-hidden /> Vouchers</h2>
        <nav data-help="vouchers.carriers" aria-label="Courier" className="flex gap-0.5 rounded-lg border border-eu-line bg-white p-0.5">
          {shown.map((c) => (
            <Link key={c} href={`/admin/apostoles/vouchers?c=${c}`} aria-current={c === carrier ? "page" : undefined} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 min-h-11 md:min-h-8 font-bold text-[length:var(--fs-13)] ${c === carrier ? "bg-eu-navy text-white" : "text-eu-ink-3 hover:bg-eu-surface hover:text-eu-navy"}`}>
              {COURIER_NAME[c]}{counts[c] > 0 && <span className={`tabular-nums rounded-full px-1.5 text-[length:var(--fs-12)] ${c === carrier ? "bg-white/20 text-white" : "bg-eu-amber/20 text-eu-ink-2"}`} title="Παραγγελίες που περιμένουν voucher">{counts[c]}</span>}
            </Link>
          ))}
        </nav>
        <span className={`rounded-full px-2 py-0.5 font-bold text-[length:var(--fs-12)] ${!env ? "bg-eu-red/10 text-eu-red" : env === "live" ? "bg-eu-green/12 text-eu-green" : "bg-eu-amber/15 text-eu-ink-2"}`}>{!env ? "Χωρίς στοιχεία σύνδεσης" : env === "live" ? "Παραγωγή" : "Δοκιμαστικό"}</span>
        <div className="ml-auto"><DayActions carrier={carrier} openIds={open.map((s) => s.id)} canWrite={canWrite} /></div>
      </div>

      {!env && (
        <p className="m-0 inline-flex items-start gap-2 rounded-xl bg-eu-red/5 border border-eu-red/20 px-3 py-2 text-eu-ink-2 text-[length:var(--fs-13)]"><CircleAlert className="size-4 mt-0.5 shrink-0 text-eu-red" aria-hidden /><span>
          {carrier === "geniki" ? <>Συμπλήρωσε όνομα χρήστη, κωδικό και app key της Γενικής στις <Link href="/admin/settings/shipping" className="text-eu-blue underline font-bold">Ρυθμίσεις → Αποστολές & courier</Link>.</> : <>Λείπουν τα στοιχεία της ΕΛΤΑ Courier: ELTA_PELATIS, ELTA_USER, ELTA_PASS στο .env του server ή στις <Link href="/admin/settings/shipping" className="text-eu-blue underline font-bold">Ρυθμίσεις → Αποστολές & courier</Link>.</>}
        </span></p>
      )}

      <dl data-help="vouchers.kpi" className="m-0 grid grid-cols-2 @2xl:grid-cols-5 rounded-xl border border-eu-line bg-white overflow-hidden [&>div]:px-3 [&>div]:py-2 [&>div]:border-eu-line-2 [&>div:not(:last-child)]:border-b @2xl:[&>div:not(:last-child)]:border-b-0 @2xl:[&>div:not(:last-child)]:border-r">
        {KPI.map(([label, n, help, tone]) => (
          <div key={label} title={help}><dt className="text-eu-muted text-[length:var(--fs-12)]">{label}</dt><dd className={`m-0 font-heading font-extrabold text-[length:var(--fs-18)] tabular-nums ${tone ?? "text-eu-ink"}`}>{n}</dd></div>
        ))}
      </dl>
      <p className="m-0 inline-flex items-start gap-1.5 text-eu-ink-3 text-[length:var(--fs-12)] max-w-[90ch]"><Info className="size-3.5 mt-px shrink-0 text-eu-blue" aria-hidden /><span>{flow}</span></p>

      {/* ουρά έκδοσης */}
      <section data-help="vouchers.queue" aria-labelledby="queue-h" className="grid gap-1.5">
        <h3 id="queue-h" className="m-0 font-bold text-eu-ink text-[length:var(--fs-15)]">Προς έκδοση <span className="text-eu-muted font-normal tabular-nums">({drafts.length})</span></h3>
        {!drafts.length ? <p className="m-0 rounded-xl border border-dashed border-eu-line bg-white px-3 py-3 text-eu-muted text-[length:var(--fs-13)]">Καμία παραγγελία με {name} δεν περιμένει voucher.</p> : (
          <ul className="m-0 p-0 list-none rounded-xl border border-eu-line bg-white divide-y divide-eu-line-2">
            {drafts.map((d) => (
              <li key={d.orderId} className="grid gap-1.5 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] @4xl:items-center px-3 py-2">
                <div className="grid gap-0.5 min-w-0 text-[length:var(--fs-13)]">
                  <span className="flex flex-wrap items-center gap-x-2"><b className="text-eu-ink">{d.number}</b><span data-private className="text-eu-ink-2">{d.name}</span>{d.cod > 0 && <span className="rounded-full px-1.5 bg-eu-amber/20 text-eu-ink-2 font-bold text-[length:var(--fs-12)]">αντικαταβολή {eur(d.cod)}</span>}</span>
                  <span data-private className="text-eu-ink-3 truncate">{d.address}, {d.zip} {d.city} · {d.phone}</span>
                  {d.blockers.length > 0 && <span role="alert" className="inline-flex items-start gap-1 text-eu-red font-bold text-[length:var(--fs-12)]"><CircleAlert className="size-3.5 mt-px shrink-0" aria-hidden />{d.blockers.join(" ")}</span>}
                </div>
                {canWrite && <CreateVoucher orderId={d.orderId} weightKg={d.weightKg} weightKnown={d.weightKnown} pieces={d.pieces} disabled={!env || d.blockers.length > 0} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="list-h" className="grid gap-1.5">
        <h3 id="list-h" className="m-0 font-bold text-eu-ink text-[length:var(--fs-15)]">Vouchers {name}</h3>
        <VouchersBoard rows={rows} canWrite={canWrite} courier={name} />
      </section>
    </div>
  );
}
