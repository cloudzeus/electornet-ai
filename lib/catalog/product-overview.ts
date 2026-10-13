import "server-only";
import { db } from "@/lib/db";

/**
 * Η εικόνα ενός προϊόντος για την Επισκόπηση της καρτέλας του: πωλήσεις (e-shop + παραστατικά SoftOne, χωρίς ακυρωμένα),
 * επιστροφές (πιστωτικά), πωλήσεις ανά μήνα, τελευταίοι αγοραστές, συσκευές πελατών & εγγυήσεις, service, κριτικές,
 * ερωτήσεις, αγαπημένα και η τρέχουσα προσφορά. Μόνο αναγνώσεις από τη βάση — καμία κλήση στο SoftOne.
 */
export type ProductOverview = Awaited<ReturnType<typeof productOverview>>;
const n = (v: unknown) => (v == null ? 0 : Number(v));
const MONTHS = 12;

export async function productOverview(productId: string, now = new Date()) {
  const since = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1), 1);
  const [erpLines, credits, shopLines, devices, tickets, reviewAgg, reviewsPending, questions, unanswered, wish, offer, ticketCounts] = await Promise.all([
    db.purchaseLine.findMany({ where: { productId, purchase: { parentId: null, kind: { in: ["order", "receipt", "invoice"] }, NOT: { status: "cancelled" } } }, select: { qty: true, lineTotal: true, unitPrice: true, purchase: { select: { id: true, date: true, source: true, seriesName: true, docNo: true, customer: { select: { id: true, firstName: true, lastName: true, company: true, type: true } } } } } }),
    db.purchaseLine.aggregate({ where: { productId, purchase: { kind: "credit" } }, _sum: { qty: true } }),
    db.orderLine.findMany({ where: { variant: { productId }, isGift: false, order: { status: { notIn: ["cancelled", "failed"] } } }, select: { qty: true, lineTotal: true, unitPrice: true, order: { select: { id: true, number: true, createdAt: true, customer: { select: { id: true, firstName: true, lastName: true, company: true, type: true } } } } } }),
    db.customerDevice.findMany({ where: { productId }, select: { warrantyUntil: true, extendedUntil: true, registeredBy: true } }),
    db.serviceTicket.findMany({ where: { device: { productId } }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, number: true, kind: true, status: true, createdAt: true, inWarranty: true, customer: { select: { id: true, firstName: true, lastName: true } } } }),
    db.review.aggregate({ where: { productId, status: "approved" }, _avg: { rating: true }, _count: true }),
    db.review.count({ where: { productId, status: "pending" } }),
    db.question.count({ where: { productId } }),
    db.question.count({ where: { productId, answer: null } }),
    db.wishlistItem.count({ where: { productId } }),
    db.productOffer.findUnique({ where: { productId }, select: { price: true, listPrice: true, memberPrice: true, endsAt: true, lowest30: true, promotionId: true } }),
    db.serviceTicket.groupBy({ by: ["status"], where: { device: { productId } }, _count: true }),
  ]);
  // μόνο όταν το προϊόν είναι σε προσφορά (λίγα) — ένας ακόμη γύρος
  const promo = offer?.promotionId ? await db.promotion.findUnique({ where: { id: offer.promotionId }, select: { id: true, name: true } }) : null;

  const nameOf = (c: { firstName: string; lastName: string; company: string | null; type: string } | null) => (c ? (c.type === "business" && c.company ? c.company : `${c.lastName} ${c.firstName}`.trim()) : null);
  const sales = [
    ...erpLines.map((l) => ({ src: l.purchase.source === "nop" ? "nop" : "softone", date: l.purchase.date, qty: l.qty, total: n(l.lineTotal) || n(l.unitPrice) * l.qty, ref: [l.purchase.seriesName, l.purchase.docNo].filter(Boolean).join(" "), customerId: l.purchase.customer?.id ?? null, customer: nameOf(l.purchase.customer) })),
    ...shopLines.map((l) => ({ src: "eshop", date: l.order.createdAt, qty: l.qty, total: n(l.lineTotal) || n(l.unitPrice) * l.qty, ref: l.order.number, customerId: l.order.customer?.id ?? null, customer: nameOf(l.order.customer) })),
  ].sort((a, b) => +b.date - +a.date);
  const units = sales.reduce((a, s) => a + s.qty, 0), revenue = sales.reduce((a, s) => a + s.total, 0);
  const monthly = Array.from({ length: MONTHS }, (_, i) => { const d = new Date(since.getFullYear(), since.getMonth() + i, 1); return { label: d.toLocaleDateString("el-GR", { month: "short" }), units: 0 }; });
  for (const s of sales) if (s.date >= since) { const i = (s.date.getFullYear() - since.getFullYear()) * 12 + s.date.getMonth() - since.getMonth(); if (monthly[i]) monthly[i].units += s.qty; }
  const t = +now;
  const until = (d: { warrantyUntil: Date | null; extendedUntil: Date | null }) => d.extendedUntil ?? d.warrantyUntil;
  return {
    sales: {
      units, revenue, docs: sales.length, avg: units ? revenue / units : 0, customers: new Set(sales.map((s) => s.customerId).filter(Boolean)).size,
      first: sales.at(-1)?.date.toISOString() ?? null, last: sales[0]?.date.toISOString() ?? null,
      eshopUnits: sales.filter((s) => s.src === "eshop").reduce((a, s) => a + s.qty, 0), erpUnits: sales.filter((s) => s.src !== "eshop").reduce((a, s) => a + s.qty, 0),
      returned: n(credits._sum.qty), last12: monthly.reduce((a, m) => a + m.units, 0),
    },
    monthly,
    recent: sales.slice(0, 8).map((s) => ({ ...s, date: s.date.toISOString() })),
    devices: { total: devices.length, inWarranty: devices.filter((d) => { const u = until(d); return u && +u > t; }).length, extended: devices.filter((d) => d.extendedUntil).length, fromErp: devices.filter((d) => d.registeredBy === "erp").length },
    service: { total: ticketCounts.reduce((a, x) => a + x._count, 0), open: ticketCounts.filter((x) => !["done", "cancelled"].includes(x.status)).reduce((a, x) => a + x._count, 0), recent: tickets.map((x) => ({ ...x, createdAt: x.createdAt.toISOString(), customer: x.customer ? `${x.customer.lastName} ${x.customer.firstName}` : null, customerId: x.customer?.id ?? null })) },
    reviews: { count: reviewAgg._count, avg: reviewAgg._avg.rating ?? null, pending: reviewsPending },
    questions: { count: questions, unanswered },
    wishlist: wish,
    offer: offer ? { price: n(offer.price), listPrice: n(offer.listPrice), memberPrice: offer.memberPrice == null ? null : n(offer.memberPrice), endsAt: offer.endsAt?.toISOString() ?? null, lowest30: offer.lowest30 == null ? null : n(offer.lowest30), promo } : null,
  };
}
