import "server-only";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCustomerSession } from "@/lib/account/session";
import type { Appointment, ConsentPref, Customer, InstalmentPlan, Order } from "@/lib/data/types";
import { consents as CONSENT_TOPICS } from "@/lib/data/fixtures/account";

/**
 * Τα δεδομένα του λογαριασμού για τον συνδεδεμένο πελάτη, στους τύπους που περιμένουν ήδη οι σελίδες:
 * παραγγελίες του e-shop ΚΑΙ αγορές καταστημάτων (παραστατικά SoftOne), ραντεβού / service (ServiceTicket),
 * συναινέσεις (μητρώο Consent), δόσεις (πληρωμές παραγγελιών), επιστροφές.
 */
/** Ο συνδεδεμένος πελάτης — αλλιώς στη σύνδεση (και πίσω στον λογαριασμό μετά). */
export async function requireCustomer(next = "/logariasmos") {
  const me = await getCustomerSession();
  if (!me) redirect(`/syndesi?next=${encodeURIComponent(next)}`);
  return me;
}

const n = (d: unknown) => (d == null ? 0 : Number(d));
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export async function accountCustomer(id: string): Promise<Customer | null> {
  const c = await db.customer.findUnique({ where: { id }, select: { id: true, firstName: true, lastName: true, email: true, mobile: true, phone: true, birthday: true, vatNumber: true, createdAt: true, loyaltyPoints: true, number: true } });
  if (!c) return null;
  return { id: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email ?? "", phone: c.mobile ?? c.phone ?? "", birthday: day(c.birthday) || undefined, vat: c.vatNumber ?? undefined, memberSince: day(c.createdAt), loyaltyPoints: c.loyaltyPoints };
}

const PRODUCT = { select: { slug: true, brand: { select: { name: true } }, media: { where: { kind: "image", hidden: false }, orderBy: { sortNo: "asc" as const }, take: 1, select: { url: true } } } } as const;

/** Παραγγελίες e-shop (όλες) + αγορές καταστημάτων από το SoftOne (κύρια παραστατικά, όχι όσα προήλθαν από το e-shop). */
export async function accountOrders(customerId: string, take = 60): Promise<Order[]> {
  const [shop, store, stores] = await Promise.all([
    db.order.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take,
      include: { payment: { select: { method: true, instalments: true, status: true } }, lines: { select: { id: true, title: true, qty: true, unitPrice: true, addons: { select: { price: true, service: { select: { slug: true, title: true } } } }, variant: { select: { product: PRODUCT } } } } } }),
    db.purchase.findMany({ where: { customerId, parentId: null, orderId: null, kind: { in: ["order", "receipt", "invoice"] } }, orderBy: { date: "desc" }, take,
      include: { lines: { orderBy: { lineNo: "asc" }, select: { lineNo: true, title: true, qty: true, unitPrice: true, productId: true } } } }),
    db.store.findMany({ select: { id: true, name: true, city: true } }),
  ]);
  const storeName = new Map(stores.map((s) => [s.id, `${s.name}, ${s.city}`]));
  const pids = [...new Set(store.flatMap((p) => p.lines.map((l) => l.productId).filter((x): x is string => !!x)))];
  const prods = pids.length ? await db.product.findMany({ where: { id: { in: pids } }, select: { id: true, ...PRODUCT.select } }) : [];
  const pm = new Map(prods.map((p) => [p.id, p]));

  const fromShop: Order[] = shop.map((o) => {
    const s = (o.shipping ?? {}) as Record<string, string>;
    const inv = (o.invoice ?? null) as { vatNumber?: string; company?: string; doy?: string } | null;
    return {
      number: o.number, date: o.createdAt.toISOString(), status: o.status as Order["status"], fulfilment: o.fulfilment as Order["fulfilment"], channel: "eshop",
      pickupStore: o.pickupStoreId ? storeName.get(o.pickupStoreId) : undefined,
      address: o.fulfilment === "click-collect" ? undefined : { id: "", label: s.carrierName ?? "", firstName: s.firstName ?? "", lastName: s.lastName ?? "", street: s.street ?? (s.locker as unknown as { name?: string })?.name ?? "", number: s.number ?? "", floor: s.floor, city: s.city ?? "", zip: s.zip ?? "", region: s.region ?? "", phone: s.phone ?? "" },
      lines: o.lines.map((l) => ({ productId: l.variant.product.slug || l.id, title: l.title, brand: l.variant.product.brand.name, image: l.variant.product.media[0]?.url ?? null, qty: l.qty, unitPrice: n(l.unitPrice), addons: l.addons.map((a) => ({ slug: a.service.slug, title: a.service.title, price: n(a.price) })) })),
      subtotal: n(o.subtotal), shippingFee: n(o.shippingFee), total: n(o.total),
      payment: { method: o.payment?.method ?? o.paymentMethod ?? "", instalments: o.payment?.instalments ?? undefined },
      tracking: o.tracking ? { courier: s.carrierName ?? "Courier", code: o.tracking, url: "", events: [] } : undefined,
      invoice: inv?.vatNumber ? { vat: inv.vatNumber, company: inv.company ?? "", doy: inv.doy ?? "" } : undefined,
    };
  });
  // Παραστατικά SoftOne: σειρά PES… = παραγγελίες του ΠΑΛΙΟΥ e-shop (WEB…)· οι υπόλοιπες = αγορές καταστημάτων.
  // Σε ακυρωμένες / απλήρωτες ο «αριθμός» είναι μόνο ο κωδικός σειράς (PES-AK, PES-APL) — τότε σειρά + FINDOC.
  const fromStore: Order[] = store.map((p) => {
    const legacy = /^PES/i.test(p.seriesCode ?? "");
    const real = p.docNo && p.docNo !== p.seriesCode;
    return {
    number: real ? p.docNo! : `${p.seriesCode ?? "S1"}-${p.s1Findoc ?? p.id}`, date: p.date.toISOString(),
    status: p.status === "cancelled" || /-AK$/i.test(p.seriesCode ?? "") ? "cancelled" as const : p.status === "unpaid" || /-APL$/i.test(p.seriesCode ?? "") ? "pending" as const : "delivered" as const,
    fulfilment: legacy ? "courier" as const : "click-collect" as const, channel: legacy ? "legacy" as const : "store" as const,
    pickupStore: legacy ? undefined : "Κατάστημα Euronics", docLabel: p.seriesName ?? (p.kind === "invoice" ? "Τιμολόγιο" : p.kind === "receipt" ? "Απόδειξη" : "Παραγγελία καταστήματος"),
    lines: p.lines.map((l) => { const pr = l.productId ? pm.get(l.productId) : undefined; return { productId: pr?.slug ?? `l-${p.id}-${l.lineNo}`, title: l.title, brand: pr?.brand.name ?? "", image: pr?.media[0]?.url ?? null, qty: l.qty, unitPrice: n(l.unitPrice) }; }),
    subtotal: n(p.total), shippingFee: 0, total: n(p.total), payment: { method: legacy ? "" : "store" },
  }; });
  return [...fromShop, ...fromStore].sort((a, b) => b.date.localeCompare(a.date)).slice(0, take);
}

export async function accountOrder(customerId: string, no: string): Promise<Order | null> {
  return (await accountOrders(customerId, 200)).find((o) => o.number.toLowerCase() === no.trim().toLowerCase()) ?? null;
}

/** Δόσεις: παραγγελίες e-shop με πληρωμή σε δόσεις (μηνιαία δόση, πόσες πέρασαν, επόμενη ημερομηνία). */
export async function accountInstalments(customerId: string, now = new Date()): Promise<InstalmentPlan[]> {
  const rows = await db.order.findMany({ where: { customerId, status: { notIn: ["cancelled", "pending"] }, payment: { instalments: { gt: 1 } } }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, total: true, createdAt: true, payment: { select: { instalments: true, method: true } }, lines: { take: 1, select: { title: true } } } });
  return rows.map((o) => {
    const months = o.payment!.instalments;
    const elapsed = Math.max(0, (now.getFullYear() - o.createdAt.getFullYear()) * 12 + now.getMonth() - o.createdAt.getMonth());
    const paid = Math.min(months, elapsed + 1);
    const next = new Date(o.createdAt); next.setMonth(next.getMonth() + paid);
    return { id: o.id, orderNumber: o.number, title: o.lines[0]?.title ?? o.number, provider: o.payment!.method === "no-card" ? "eurobank" : "card", months, paid, monthly: Math.round((n(o.total) / months) * 100) / 100, nextDate: paid >= months ? "" : day(next) };
  });
}

const KIND: Record<string, Appointment["kind"]> = { installation: "installation", delivery: "delivery", pickup: "pickup", repair: "service", "warranty-claim": "service", appointment: "service" };
const KIND_TITLE: Record<string, string> = { installation: "Εγκατάσταση", delivery: "Παράδοση με ραντεβού", pickup: "Παραλαβή", repair: "Επισκευή", "warranty-claim": "Βλάβη σε εγγύηση", appointment: "Ραντεβού service" };

/** Ραντεβού & service: τα αιτήματα service του πελάτη (ServiceTicket). */
export async function accountAppointments(customerId: string): Promise<(Appointment & { number: string; canCancel: boolean })[]> {
  const [rows, stores] = await Promise.all([
    db.serviceTicket.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: 50, include: { device: { select: { title: true, brand: true } } } }),
    db.store.findMany({ select: { id: true, name: true, city: true } }),
  ]);
  const sn = new Map(stores.map((s) => [s.id, `${s.name}, ${s.city}`]));
  return rows.map((t) => ({
    id: t.id, number: t.number, kind: KIND[t.kind] ?? "service", title: KIND_TITLE[t.kind] ?? "Service",
    productTitle: t.device ? `${t.device.brand} ${t.device.title}`.trim() : undefined,
    store: t.storeId ? sn.get(t.storeId) ?? "Κατάστημα" : t.mode === "visit" ? "Στον χώρο σου" : t.mode === "pickup" ? "Παραλαβή από τον χώρο σου" : "Service Euronics",
    technician: t.technician ?? undefined, date: day(t.scheduledAt ?? t.createdAt), slot: t.slot ?? (t.scheduledAt ? "" : "Θα σε καλέσουμε για ημέρα και ώρα"),
    status: t.status === "done" ? "done" : t.status === "cancelled" ? "cancelled" : t.scheduledAt ? "confirmed" : "scheduled",
    notes: t.description, canCancel: ["new", "scheduled"].includes(t.status),
  }));
}

const CHANNELS = ["email", "sms", "push", "viber"] as const;
/** Οι προτιμήσεις ειδοποιήσεων από το μητρώο συναινέσεων (η τελευταία εγγραφή ανά θέμα × κανάλι μετρά). */
export async function accountConsents(customerId: string): Promise<ConsentPref[]> {
  const rows = await db.consent.findMany({ where: { customerId, topic: { in: CONSENT_TOPICS.map((t) => t.topic) } }, orderBy: { at: "desc" }, select: { topic: true, channel: true, granted: true, at: true } });
  return CONSENT_TOPICS.map((t) => {
    const mine = rows.filter((r) => r.topic === t.topic);
    const ch = Object.fromEntries(CHANNELS.map((c) => { const r = mine.find((x) => x.channel === c); return [c, r ? r.granted : t.topic === "orders" && c === "email"]; })) as ConsentPref["channels"];
    return { ...t, channels: ch, updated: day(mine[0]?.at) };
  });
}

export interface AccountReturn { id: string; rma: string; orderNumber: string; reason: string; status: string; createdAt: string; lines: { title: string; qty: number }[] }
export async function accountReturns(customerId: string): Promise<AccountReturn[]> {
  const rows = await db.return.findMany({ where: { order: { customerId } }, orderBy: { createdAt: "desc" }, include: { order: { select: { number: true } } } });
  return rows.map((r) => ({ id: r.id, rma: `RMA-${r.id.slice(-6).toUpperCase()}`, orderNumber: r.order.number, reason: r.reason, status: r.status, createdAt: day(r.createdAt), lines: (Array.isArray(r.lines) ? r.lines : []) as { title: string; qty: number }[] }));
}

export interface AccountPayment { number: string; date: string; method: string; instalments: number; total: number; status: string }
/** Ιστορικό πληρωμών των παραγγελιών e-shop (τρόπος, δόσεις, κατάσταση πληρωμής). */
export async function accountPayments(customerId: string): Promise<AccountPayment[]> {
  const rows = await db.order.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: 60, select: { number: true, createdAt: true, total: true, paymentMethod: true, payment: { select: { method: true, instalments: true, status: true } } } });
  return rows.map((o) => ({ number: o.number, date: o.createdAt.toISOString(), method: o.payment?.method ?? o.paymentMethod ?? "", instalments: o.payment?.instalments ?? 1, total: n(o.total), status: o.payment?.status ?? "pending" }));
}
