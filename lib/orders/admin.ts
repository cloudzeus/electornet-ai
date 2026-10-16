import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { shipmentTimeline } from "@/lib/couriers/timeline";
import { searchKind, type ShipTo } from "./model";

/**
 * Παραγγελίες για τη διαχείριση: λίστα (προβολές με πλήθη, φίλτρα, αναζήτηση), σύνοψη ημέρας και η πλήρης καρτέλα μιας
 * παραγγελίας. Μόνο αναγνώσεις — οι αλλαγές είναι στο lib/orders/ops.ts.
 */
export const VIEWS = [
  { id: "all", label: "Όλες" },
  { id: "new", label: "Νέες" },
  { id: "process", label: "Προς επεξεργασία" },
  { id: "ship", label: "Προς αποστολή" },
  { id: "pickup", label: "Για παραλαβή" },
  { id: "transit", label: "Σε μεταφορά" },
  { id: "done", label: "Ολοκληρωμένες" },
  { id: "closed", label: "Ακυρωμένες / επιστροφές" },
  { id: "problems", label: "Θέλουν προσοχή" },
] as const;
export type ViewId = (typeof VIEWS)[number]["id"];
export const isView = (v: unknown): v is ViewId => VIEWS.some((x) => x.id === v);

const ACTIVE_SHIP = ["created", "closed", "in-transit", "out-for-delivery", "attempted", "on-hold", "returning"];
/** «Θέλουν προσοχή»: αποτυχημένη πληρωμή, αποτυχία SoftOne, πρόβλημα στην αποστολή, αίτημα επιστροφής, νέα > 24 ώρες. */
const PROBLEMS: Prisma.OrderWhereInput = { OR: [
  { payment: { status: "failed" }, status: { notIn: ["cancelled"] } },
  { erpSync: { status: "failed" } },
  { shipments: { some: { status: { in: ["attempted", "returning"] } } } },
  { returns: { some: { status: { in: ["requested", "approved"] } } } },
  { status: "pending", paymentMethod: { in: ["cod", "bank", "bank-transfer", "store"] }, createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } },
] };
export function viewWhere(v: ViewId): Prisma.OrderWhereInput {
  switch (v) {
    case "new": return { status: "pending" };
    case "process": return { status: { in: ["paid", "processing"] } };
    case "ship": return { fulfilment: "courier", status: { in: ["paid", "processing"] }, shipments: { none: { status: { in: ACTIVE_SHIP } } } };
    case "pickup": return { status: "ready-for-pickup" };
    case "transit": return { status: "shipped" };
    case "done": return { status: "delivered" };
    case "closed": return { status: { in: ["cancelled", "returned"] } };
    case "problems": return PROBLEMS;
    default: return {};
  }
}

export interface ListFilter { view: ViewId; q?: string; fulfilment?: string; pay?: string; from?: string; to?: string; sort?: "new" | "old" | "total"; page?: number }
export const PAGE_SIZE = 50;

function searchWhere(q: string): Prisma.OrderWhereInput {
  const t = q.trim();
  const kind = searchKind(t);
  const json = (key: string, v: string): Prisma.OrderWhereInput => ({ shipping: { path: [key], string_contains: v } });
  if (kind === "number") return { number: { contains: t.toUpperCase().startsWith("EUR") ? t.toUpperCase() : t, mode: "insensitive" } };
  if (kind === "email") return { OR: [{ guestEmail: { contains: t, mode: "insensitive" } }, { customer: { email: { contains: t, mode: "insensitive" } } }, json("email", t)] };
  if (kind === "phone") { const d = t.replace(/\D/g, "").replace(/^(00)?30(?=\d{10}$)/, ""); return { OR: [json("phone", d), json("phone", t), { customer: { OR: [{ mobile: { contains: d } }, { phone: { contains: d } }] } }] }; }
  return { OR: [
    { number: { contains: t, mode: "insensitive" } }, { tracking: { contains: t, mode: "insensitive" } },
    json("lastName", t), json("firstName", t), json("city", t),
    { customer: { OR: [{ lastName: { contains: t, mode: "insensitive" } }, { firstName: { contains: t, mode: "insensitive" } }, { company: { contains: t, mode: "insensitive" } }] } },
    { lines: { some: { title: { contains: t, mode: "insensitive" } } } },
  ] };
}

function baseWhere(f: Omit<ListFilter, "view">): Prisma.OrderWhereInput {
  const and: Prisma.OrderWhereInput[] = [];
  if (f.q?.trim()) and.push(searchWhere(f.q));
  if (f.fulfilment) and.push({ fulfilment: f.fulfilment });
  if (f.pay) and.push({ paymentMethod: f.pay });
  const from = f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from) ? new Date(`${f.from}T00:00:00`) : null;
  const to = f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to) ? new Date(`${f.to}T23:59:59.999`) : null;
  if (from || to) and.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
  return and.length ? { AND: and } : {};
}

export async function listOrders(f: ListFilter) {
  const base = baseWhere(f);
  const where: Prisma.OrderWhereInput = { AND: [base, viewWhere(f.view)] };
  const page = Math.max(1, f.page ?? 1);
  const orderBy: Prisma.OrderOrderByWithRelationInput[] = f.sort === "old" ? [{ createdAt: "asc" }] : f.sort === "total" ? [{ total: "desc" }, { createdAt: "desc" }] : [{ createdAt: "desc" }];
  const [rows, total, counts] = await Promise.all([
    db.order.findMany({
      where, orderBy, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: {
        id: true, number: true, createdAt: true, status: true, fulfilment: true, paymentMethod: true, total: true, discountTotal: true, couponCode: true, shipping: true, invoice: true, guestEmail: true, tracking: true,
        customer: { select: { id: true, firstName: true, lastName: true, email: true, company: true } },
        payment: { select: { status: true, instalments: true } },
        erpSync: { select: { status: true } },
        pickupStore: { select: { name: true, city: true } },
        lines: { orderBy: { id: "asc" }, select: { title: true, qty: true, isGift: true, variant: { select: { product: { select: { media: { where: { kind: "image", hidden: false }, orderBy: { sortNo: "asc" }, take: 1, select: { thumbUrl: true, url: true } } } } } } } },
        shipments: { where: { status: { not: "cancelled" } }, orderBy: { createdAt: "desc" }, take: 1, select: { status: true, voucher: true, carrier: true } },
        _count: { select: { returns: true, notes: true } },
      },
    }),
    db.order.count({ where }),
    Promise.all(VIEWS.map((v) => db.order.count({ where: { AND: [base, viewWhere(v.id)] } }))),
  ]);
  return {
    rows: rows.map((o) => {
      const s = (o.shipping ?? {}) as ShipTo;
      const lines = o.lines.filter((l) => !l.isGift);
      const m = lines[0]?.variant.product.media[0];
      return {
        id: o.id, number: o.number, createdAt: o.createdAt.toISOString(), status: o.status, fulfilment: o.fulfilment, paymentMethod: o.paymentMethod, paymentStatus: o.payment?.status ?? null, instalments: o.payment?.instalments ?? 1,
        total: Number(o.total), discount: Number(o.discountTotal), coupon: o.couponCode,
        name: `${s.firstName ?? o.customer?.firstName ?? ""} ${s.lastName ?? o.customer?.lastName ?? ""}`.trim() || o.guestEmail || "Επισκέπτης",
        company: (o.invoice as { company?: string } | null)?.company ?? o.customer?.company ?? null,
        email: s.email ?? o.customer?.email ?? o.guestEmail ?? null, city: o.fulfilment === "click-collect" ? o.pickupStore?.city ?? null : s.city ?? null,
        customerId: o.customer?.id ?? null, invoice: !!o.invoice,
        items: lines.reduce((a, l) => a + l.qty, 0), firstItem: lines[0]?.title ?? null, more: Math.max(0, lines.length - 1), thumb: m ? m.thumbUrl ?? m.url : null,
        erp: o.erpSync?.status ?? null, shipment: (o.shipments[0] as (typeof o.shipments)[number] | undefined) ?? null, store: o.pickupStore ? `${o.pickupStore.name}` : null,
        returns: o._count.returns, notes: o._count.notes,
      };
    }),
    total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts: Object.fromEntries(VIEWS.map((v, i) => [v.id, counts[i]])) as Record<ViewId, number>,
  };
}
export type OrderRow = Awaited<ReturnType<typeof listOrders>>["rows"][number];

/** Σύνοψη ημέρας (KPIs πάνω από τη λίστα). */
export async function ordersToday() {
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const LIVE = ["paid", "processing", "shipped", "ready-for-pickup", "delivered", "pending"];
  const [today, process, ship, pickup, problems] = await Promise.all([
    db.order.aggregate({ where: { createdAt: { gte: t0 }, status: { in: LIVE } }, _count: { _all: true }, _sum: { total: true } }),
    db.order.count({ where: viewWhere("process") }),
    db.order.count({ where: viewWhere("ship") }),
    db.order.count({ where: viewWhere("pickup") }),
    db.order.count({ where: PROBLEMS }),
  ]);
  return { todayCount: today._count._all, todayTotal: Number(today._sum.total ?? 0), process, ship, pickup, problems };
}

/** Η πλήρης καρτέλα μιας παραγγελίας. */
export async function orderDetail(number: string) {
  const o = await db.order.findUnique({
    where: { number },
    include: {
      customer: { select: { id: true, number: true, firstName: true, lastName: true, email: true, mobile: true, phone: true, company: true, vatNumber: true, type: true, createdAt: true, _count: { select: { orders: true } } } },
      payment: true, erpSync: true,
      pickupStore: { select: { id: true, name: true, address: true, city: true, zip: true, phone: true } },
      lines: { orderBy: { id: "asc" }, include: { addons: { include: { service: { select: { title: true, slug: true } } } }, variant: { select: { product: { select: { id: true, slug: true, sku: true, erpCode: true, brand: { select: { name: true } }, media: { where: { kind: "image", hidden: false }, orderBy: { sortNo: "asc" }, take: 1, select: { thumbUrl: true, url: true } } } } } } } },
      shipments: { orderBy: { createdAt: "desc" } },
      returns: { orderBy: { createdAt: "desc" } },
      notes: { orderBy: [{ pinned: "desc" }, { createdAt: "desc" }] },
      promoUsages: { select: { amount: true, couponCode: true, promotion: { select: { id: true, name: true } } } },
    },
  });
  if (!o) return null;
  const shipmentIds = o.shipments.map((s) => s.id), returnIds = o.returns.map((r) => r.id);
  const [history, emails, customerTotals, timeline] = await Promise.all([
    db.auditLog.findMany({ where: { OR: [{ entity: "Order", entityId: o.id }, ...(shipmentIds.length ? [{ entity: "Shipment", entityId: { in: shipmentIds } }] : []), ...(returnIds.length ? [{ entity: "Return", entityId: { in: returnIds } }] : [])] }, orderBy: { createdAt: "desc" }, take: 60, select: { id: true, action: true, after: true, createdAt: true, staff: { select: { name: true } } } }),
    db.emailLog.findMany({ where: { meta: { path: ["orderId"], equals: o.id } }, orderBy: { at: "desc" }, take: 20, select: { id: true, template: true, status: true, at: true, error: true } }),
    o.customerId ? db.order.aggregate({ where: { customerId: o.customerId, status: { notIn: ["cancelled", "pending"] } }, _sum: { total: true }, _count: { _all: true } }) : null,
    o.shipments.find((s) => s.status !== "cancelled") ? shipmentTimeline(o.shipments.find((s) => s.status !== "cancelled")!).catch(() => null) : null,
  ]);
  return { ...o, history, emails, customerTotals: customerTotals ? { count: customerTotals._count._all, total: Number(customerTotals._sum.total ?? 0) } : null, timeline };
}
export type OrderDetail = NonNullable<Awaited<ReturnType<typeof orderDetail>>>;
