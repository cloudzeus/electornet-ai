import "server-only";
import { FULFILMENT, type Fulfilment } from "@/lib/orders/model";
import { db } from "@/lib/db";

/**
 * Γρήγορη εικόνα ενός πελάτη για το «άνοιγμα γραμμής» της λίστας πελατών: στοιχεία, αγορές από e-shop και SoftOne
 * (ενιαίο χρονολόγιο), αιτήματα (service, επιστροφές, GDPR, κριτικές), συσκευές & εγγυήσεις, πόντοι, συναινέσεις,
 * σύνδεση με SoftOne και πρόσφατη δραστηριότητα. Μόνο αναγνώσεις από τη βάση — καμία κλήση στο SoftOne.
 */
export type Peek = NonNullable<Awaited<ReturnType<typeof customerPeek>>>;

const n = (v: unknown) => (v == null ? null : Number(v));
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

export async function customerPeek(id: string) {
  // όλα τα ερωτήματα παράλληλα (η βάση είναι απομακρυσμένη: ένα include με πολλές σχέσεις = πολλά διαδοχικά round trips)
  const where = { customerId: id };
  const [base, addresses, orders, purchases, devices, warrantyExtensions, tickets, gdprRequests, loyalty, consents, events, customerNotes, wish, counts, allDocs, allOrders, reviews] = await Promise.all([
    db.customer.findUnique({ where: { id }, include: { preferredStore: { select: { name: true, city: true } } } }),
    db.address.findMany({ where, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], take: 3, select: { id: true, label: true, street: true, number: true, city: true, zip: true, region: true, isDefault: true, nearestKm: true } }),
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, take: 25, select: { id: true, number: true, status: true, total: true, createdAt: true, fulfilment: true, paymentMethod: true, couponCode: true, _count: { select: { lines: true } }, returns: { select: { id: true, status: true, reason: true, createdAt: true } } } }),
    db.purchase.findMany({ where: { ...where, parentId: null }, orderBy: { date: "desc" }, take: 40, select: { id: true, source: true, kind: true, status: true, seriesName: true, docNo: true, date: true, total: true, orderId: true, _count: { select: { lines: true } }, lines: { take: 3, orderBy: { lineNo: "asc" }, select: { title: true, qty: true } } } }),
    db.customerDevice.findMany({ where, orderBy: { purchasedAt: "desc" }, take: 30, select: { id: true, brand: true, title: true, model: true, serial: true, purchasedAt: true, warrantyUntil: true, extendedUntil: true, extendedPlan: true, registeredBy: true } }),
    db.warrantyExtension.findMany({ where, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, number: true, months: true, amount: true, status: true, paidAt: true, createdAt: true, device: { select: { title: true } } } }),
    db.serviceTicket.findMany({ where, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, number: true, kind: true, status: true, description: true, scheduledAt: true, inWarranty: true, createdAt: true, device: { select: { title: true } } } }),
    db.gdprRequest.findMany({ where, orderBy: { requestedAt: "desc" }, take: 10, select: { id: true, number: true, type: true, status: true, requestedAt: true, dueAt: true } }),
    db.loyaltyTransaction.findMany({ where, orderBy: { at: "desc" }, take: 12, select: { id: true, points: true, reason: true, note: true, at: true } }),
    db.consent.findMany({ where, orderBy: { at: "desc" }, take: 60, select: { topic: true, channel: true, granted: true, at: true, source: true } }),
    db.customerEvent.findMany({ where, orderBy: { at: "desc" }, take: 15, select: { id: true, kind: true, meta: true, at: true } }),
    db.customerNote.findMany({ where, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }], take: 3, select: { id: true, text: true, pinned: true, createdAt: true } }),
    db.wishlistItem.count({ where: { list: { customerId: id } } }).catch(() => 0),
    Promise.all([db.order.count({ where }), db.purchase.count({ where }), db.customerDevice.count({ where }), db.loginEvent.count({ where })]),
    // για τα σύνολα και τα έτη: όλες οι αγορές (μόνο ημερομηνία/ποσό), όχι μόνο οι πρόσφατες που εμφανίζονται
    db.purchase.findMany({ where: { ...where, parentId: null, orderId: null, NOT: { status: "cancelled" } }, select: { date: true, total: true } }),
    db.order.findMany({ where: { ...where, status: { notIn: ["cancelled", "failed"] } }, select: { createdAt: true, total: true } }),
    db.review.findMany({ where, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, rating: true, title: true, status: true, createdAt: true, product: { select: { title: true, slug: true } } } }),
  ]);
  if (!base) return null;
  const c = { ...base, addresses, orders, purchases, devices, warrantyExtensions, tickets, gdprRequests, loyalty, consents, events, customerNotes, _count: { orders: counts[0], purchases: counts[1], devices: counts[2], logins: counts[3] } };

  // ενιαίο χρονολόγιο αγορών: παραγγελίες e-shop + παραστατικά SoftOne (χωρίς διπλά όσα προήλθαν από παραγγελία του e-shop)
  const fromShop = new Set(c.purchases.map((p) => p.orderId).filter(Boolean));
  const buys = [
    ...c.orders.map((o) => ({ id: o.id, src: "eshop" as const, ref: o.number, date: iso(o.createdAt)!, total: n(o.total) ?? 0, status: o.status, lines: o._count.lines, what: FULFILMENT[o.fulfilment as Fulfilment] ?? o.fulfilment, erp: fromShop.has(o.id) })),
    ...c.purchases.filter((p) => !p.orderId).map((p) => ({ id: p.id, src: p.source === "nop" ? ("nop" as const) : ("softone" as const), ref: [p.seriesName, p.docNo].filter(Boolean).join(" ") || p.kind, date: iso(p.date)!, total: n(p.total) ?? 0, status: p.status ?? p.kind, lines: p._count.lines, what: p.lines.map((l) => `${l.qty > 1 ? `${l.qty}× ` : ""}${l.title}`).join(" · "), erp: p.source === "softone" })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  // αγορές ανά έτος (τελευταία 6)
  const all = [...allDocs.map((x) => ({ d: x.date, t: n(x.total) ?? 0 })), ...allOrders.map((x) => ({ d: x.createdAt, t: n(x.total) ?? 0 }))].sort((a, b) => +a.d - +b.d);
  const years = new Map<number, number>();
  for (const b of all) { const y = b.d.getFullYear(); years.set(y, (years.get(y) ?? 0) + b.t); }
  const nowY = new Date().getFullYear();
  const byYear = Array.from({ length: 6 }, (_, i) => nowY - 5 + i).map((y) => ({ y, total: Math.round(years.get(y) ?? 0) }));

  // τελευταία κατάσταση κάθε συναίνεσης (θέμα · κανάλι)
  const consentNow = new Map<string, { topic: string; channel: string; granted: boolean; at: string; source: string }>();
  for (const x of c.consents) { const k = `${x.topic}|${x.channel}`; if (!consentNow.has(k)) consentNow.set(k, { topic: x.topic, channel: x.channel, granted: x.granted, at: iso(x.at)!, source: x.source }); }

  const lifetime = all.reduce((a, b) => a + b.t, 0);
  const count = all.length;
  const now = Date.now();
  return {
    id: c.id, number: c.number, type: c.type, name: c.type === "business" && c.company ? c.company : `${c.lastName} ${c.firstName}`.trim(), person: `${c.firstName} ${c.lastName}`.trim(),
    email: c.email, emailVerified: !!c.emailVerifiedAt, phone: c.phone, mobile: c.mobile, vat: c.vatNumber, doy: c.doy, company: c.company, profession: c.profession,
    birthday: iso(c.birthday), status: c.status, source: c.source, tags: c.tags, newsletter: c.newsletter, createdAt: iso(c.createdAt)!, lastLoginAt: iso(c.lastLoginAt), logins: c._count.logins,
    store: c.preferredStore ? `${c.preferredStore.city} · ${c.preferredStore.name}` : null, addresses: c.addresses,
    loyalty: { points: c.loyaltyPoints, tier: c.loyaltyTier, card: c.loyaltyCard, recent: c.loyalty.map((l) => ({ ...l, at: iso(l.at)! })) },
    erp: { trdr: c.erpTrdr, code: c.erpCode, status: c.erpSyncStatus, syncedAt: iso(c.erpSyncedAt), error: c.erpLastError, docs: c.purchases.filter((p) => p.source === "softone").length, docsTotal: c._count.purchases },
    kpi: { lifetime, count, avg: count ? lifetime / count : 0, first: iso(all[0]?.d) ?? iso(c.firstPurchaseAt), last: iso(all.at(-1)?.d) ?? iso(c.lastPurchaseAt), shown: Math.min(30, buys.length), eshopOrders: c._count.orders, devices: c._count.devices, openTickets: c.tickets.filter((t) => !["done", "cancelled"].includes(t.status)).length, wishlist: wish },
    byYear, buys: buys.slice(0, 30),
    requests: {
      tickets: c.tickets.map((t) => ({ ...t, scheduledAt: iso(t.scheduledAt), createdAt: iso(t.createdAt)!, device: t.device?.title ?? null })),
      returns: c.orders.flatMap((o) => o.returns.map((r) => ({ ...r, createdAt: iso(r.createdAt)!, order: o.number }))),
      gdpr: c.gdprRequests.map((g) => ({ ...g, requestedAt: iso(g.requestedAt)!, dueAt: iso(g.dueAt)!, overdue: !["done", "rejected"].includes(g.status) && +g.dueAt < now })),
      reviews: reviews.map((r) => ({ id: r.id, rating: r.rating, title: r.title, status: r.status, createdAt: iso(r.createdAt)!, product: r.product.title, slug: r.product.slug })),
    },
    devices: c.devices.map((d) => { const until = d.extendedUntil ?? d.warrantyUntil; return { ...d, purchasedAt: iso(d.purchasedAt), warrantyUntil: iso(d.warrantyUntil), extendedUntil: iso(d.extendedUntil), daysLeft: until ? Math.ceil((+until - now) / 86400_000) : null }; }),
    extensions: c.warrantyExtensions.map((x) => ({ ...x, amount: n(x.amount) ?? 0, paidAt: iso(x.paidAt), createdAt: iso(x.createdAt)!, device: x.device.title })),
    consents: [...consentNow.values()],
    notes: c.customerNotes.map((x) => ({ ...x, createdAt: iso(x.createdAt)! })),
    events: c.events.map((e) => ({ id: e.id, kind: e.kind, at: iso(e.at)!, meta: e.meta as Record<string, unknown> | null })),
  };
}
