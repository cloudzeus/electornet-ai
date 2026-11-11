import { Radar } from "lucide-react";
import { can } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db";
import { ensureRoutes, ROUTE_INCLUDE } from "@/lib/delivery/server";
import { nextStep, type RouteMode } from "@/lib/delivery/routing";
import { ControlBoard, type RouteRow } from "./ControlBoard";
import { nameOf, type ShipTo } from "@/lib/orders/model";

export const metadata = { title: "Κέντρο ελέγχου αποστολών" };
export const dynamic = "force-dynamic";

const STUCK_DAYS = 3;

/**
 * Όλες οι ανοιχτές παραδόσεις σε ένα σημείο: courier, συνεργάτης, πρακτορείο, μεταφορική. Κάθε μία με τα σκέλη της,
 * ποιο περιμένουμε και από πότε. Όσες δεν έχουν δρομολόγηση (κανένας συνεργάτης) περιμένουν επιλογή μεταφορικής.
 */
async function loadBoard() {
  // shortcut: οι διαδρομές δημιουργούνται εδώ (και στην πύλη) για όσες παραγγελίες δεν έχουν· με πολλές παραγγελίες → στη δημιουργία της παραγγελίας
  const ok = await ensureRoutes().then(() => true, (e) => { console.error("[kentro]", e); return false; });
  const week = new Date(Date.now() - 7 * 86400_000);
  const routes = ok ? await db.orderRoute.findMany({
    where: { OR: [{ status: "open" }, { status: "delivered", updatedAt: { gte: week } }] }, orderBy: { createdAt: "asc" }, take: 400,
    include: { ...ROUTE_INCLUDE, order: { select: { id: true, number: true, status: true, fulfilment: true, total: true, createdAt: true, shipping: true, shipments: { select: { carrier: true, voucher: true, status: true }, orderBy: { createdAt: "desc" }, take: 1 } } } },
  }) : [];
  const now = Date.now();
  const rows: RouteRow[] = routes.map((r) => {
    const s = (r.order.shipping ?? {}) as ShipTo;
    const done = r.steps.filter((x) => x.doneAt).map((x) => x.doneAt!.getTime());
    const since = done.length ? Math.max(...done) : r.createdAt.getTime();
    const waiting = r.status === "open" ? nextStep(r.steps) : null;
    return {
      orderId: r.orderId, number: r.order.number, orderStatus: r.order.status, total: Number(r.order.total), createdAt: r.order.createdAt.toISOString(),
      to: { name: nameOf(s), city: s.city ?? "", zip: s.zip ?? "", phone: s.phone ?? "" },
      mode: r.mode as RouteMode, status: r.status, reason: r.reason, cost: r.cost != null ? Number(r.cost) : null,
      partner: r.partner, agency: r.agency, carrier: r.carrier,
      courier: r.order.shipments[0] ? { carrier: r.order.shipments[0].carrier, tracking: r.order.shipments[0].voucher, status: r.order.shipments[0].status } : null,
      steps: r.steps.map((x) => ({ key: x.key, doneAt: x.doneAt?.toISOString() ?? null, ref: x.ref, proof: x.proof, note: x.note })),
      waiting, days: Math.floor((now - since) / 86400_000),
    };
  });
  const open = rows.filter((r) => r.status === "open");
  const kpi = {
    unrouted: open.filter((r) => r.mode === "unrouted").length,
    stuck: open.filter((r) => r.mode !== "unrouted" && r.days >= STUCK_DAYS).length,
    agency: open.filter((r) => r.mode === "agency").length,
    partner: open.filter((r) => r.mode === "partner" || r.mode === "pickup").length,
    freight: open.filter((r) => r.mode === "freight").length,
    courier: open.filter((r) => r.mode === "courier").length,
    delivered: rows.filter((r) => r.status === "delivered").length,
  };
  return { ok, rows, kpi };
}

export default async function ControlCenterPage() {
  const user = await requirePermission("orders.read");
  const { ok, rows, kpi } = await loadBoard();
  return (
    <div className="grid gap-5 min-w-0 @container">
      <div>
        <div className="font-extrabold text-eu-blue text-[length:var(--fs-13)] tracking-wide uppercase inline-flex items-center gap-1.5"><Radar className="size-3.5" aria-hidden /> Αποστολές</div>
        <h2 className="m-0 font-heading font-bold text-eu-ink text-[length:var(--fs-28)]">Κέντρο ελέγχου αποστολών</h2>
        <p className="m-0 mt-1 text-eu-ink-3 text-[length:var(--fs-15)] max-w-[80ch]">Κάθε ανοιχτή παράδοση με τη διαδρομή της: ποιος την έχει τώρα, τι περιμένουμε και από πότε. Το SoftOne κρατά μόνο έναν μεταφορέα ανά δελτίο, γι&apos; αυτό τα σκέλη (οδηγός → πρακτορείο → συνεργάτης → πελάτης) καταγράφονται εδώ και στην πύλη συνεργατών.</p>
      </div>
      {!ok
        ? <p className="m-0 rounded-2xl border border-eu-amber/40 bg-eu-amber/10 p-4 text-eu-ink text-[length:var(--fs-14)]">Οι πίνακες της δρομολόγησης δεν υπάρχουν ακόμη στη βάση. Χρειάζεται η εφαρμογή του <code>prisma/sql/2026-11-11-delivery-routing.sql</code>.</p>
        : <ControlBoard rows={rows} kpi={kpi} stuckDays={STUCK_DAYS} canWrite={can(user.permissions, "orders.write")} />}
    </div>
  );
}
