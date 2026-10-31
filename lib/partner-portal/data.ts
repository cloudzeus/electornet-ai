import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { engine, engineConfigured, type BatchPage } from "@/lib/b2b-engine/client";
import { addressOf, nameOf, type ShipTo } from "@/lib/orders/model";

/** Ερωτήματα της πύλης συνεργατών — πάντα περιορισμένα στο μέλος του συνδεδεμένου λογαριασμού. */

export type Onboarding = { answers?: Record<string, unknown>; advice?: unknown; steps?: Record<string, string>; completedAt?: string; vivaAt?: string | null };
export const onboardingOf = (v: unknown): Onboarding => (v && typeof v === "object" ? (v as Onboarding) : {});

export const partnerStores = (partnerId: string) =>
  db.store.findMany({
    where: { partnerId },
    orderBy: [{ city: "asc" }, { name: "asc" }],
    select: { id: true, slug: true, name: true, city: true, address: true, zip: true, phone: true, mobile: true, email: true, hours: true, services: true, active: true, lat: true, lng: true, notes: true, updatedAt: true, branch: { select: { s1BranchId: true, code: true, name: true, isCenter: true } } },
  });

/** Τα βήματα της αρχικοποίησης με την κατάστασή τους — το «ταξίδι» στην αρχική. */
export function journey(o: { onboarding: Onboarding; stores: { active: boolean; updatedAt: Date }[]; storesReviewed: boolean; connections: { status: string; lastOkAt: Date | null; locationMap: unknown }[] }) {
  const c = o.connections;
  const mapped = c.some((x) => Array.isArray(x.locationMap) && (x.locationMap as { storeId: string | null }[]).some((m) => m.storeId));
  const steps = [
    { key: "account", title: "Λογαριασμός", desc: "Κωδικός και διπλή επαλήθευση", done: true, href: "/profil" },
    { key: "questions", title: "Ερωτήσεις", desc: "Πώς κρατάτε το απόθεμα — ο βοηθός προτείνει σύνδεση", done: !!o.onboarding.answers, href: "/ksekinima" },
    { key: "profile", title: "Καταστήματα", desc: "Ωράριο, τηλέφωνα, υπηρεσίες", done: o.storesReviewed, href: "/katastimata" },
    { key: "connection", title: "Σύνδεση", desc: "Τρόπος και στοιχεία πρόσβασης", done: c.length > 0, href: "/syndesi" },
    { key: "test", title: "Έλεγχος", desc: "Διαβάζουμε δείγμα αποθέματος", done: c.some((x) => !!x.lastOkAt), href: "/syndesi" },
    { key: "mapping", title: "Αντιστοίχιση", desc: "Στήλες και καταστήματα", done: mapped, href: "/syndesi" },
    { key: "live", title: "Σε λειτουργία", desc: "Η διαθεσιμότητα ενημερώνεται", done: c.some((x) => x.status === "active"), href: "/syndesi" },
  ];
  const next = steps.find((s) => !s.done) ?? null;
  return { steps, done: steps.filter((s) => s.done).length, total: steps.length, next };
}

const day = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Athens" });
export function lastDays(n: number) {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(day(new Date(Date.now() - i * 86_400_000)));
  return out;
}

export async function dashboardData(partnerId: string, onboarding: Onboarding) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [stores, connections, storeChanges, orders, recentOrders, logs, openPickups] = await Promise.all([
    partnerStores(partnerId),
    db.partnerConnection.findMany({ where: { partnerId }, orderBy: { createdAt: "asc" } }),
    db.partnerChange.count({ where: { partnerId, entity: "Store" } }),
    db.order.findMany({ where: { pickupStore: { partnerId }, createdAt: { gte: since } }, select: { createdAt: true, total: true, status: true } }),
    db.order.findMany({ where: { pickupStore: { partnerId } }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, number: true, createdAt: true, status: true, total: true, shipping: true, pickupStore: { select: { name: true, city: true } }, _count: { select: { lines: true } } } }),
    db.partnerLog.findMany({ where: { partnerId }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.order.count({ where: { pickupStore: { partnerId }, status: { in: ["paid", "processing", "ready-for-pickup"] } } }),
  ]);
  const days = lastDays(30);
  const byDay = new Map(days.map((d) => [d, { n: 0, value: 0 }]));
  for (const o of orders) { const b = byDay.get(day(o.createdAt)); if (b && o.status !== "cancelled") { b.n++; b.value += Number(o.total); } }

  // συγχρονισμοί από τη μηχανή (ενεργές ή δοκιμαστικές συνδέσεις)
  let sync: { days: BatchPage["days"]; last: BatchPage["batches"][number] | null; error: string | null } = { days: [], last: null, error: null };
  if (connections.length && engineConfigured()) {
    const pages = await Promise.all(connections.map((c) => engine.batches(c.id, 1)));
    const merged = new Map<string, BatchPage["days"][number]>();
    for (const p of pages) {
      if (!p.ok) { if (p.status !== 404) sync.error = p.error; continue; }
      for (const d of p.data.days) { const m = merged.get(d.day) ?? { day: d.day, batches: 0, accepted: 0, rejected: 0, failed: 0 }; m.batches += d.batches; m.accepted += d.accepted; m.rejected += d.rejected; m.failed += d.failed; merged.set(d.day, m); }
      const l = p.data.batches[0];
      if (l && (!sync.last || l.receivedAt > sync.last.receivedAt)) sync.last = l;
    }
    sync = { ...sync, days: days.map((d) => merged.get(d) ?? { day: d, batches: 0, accepted: 0, rejected: 0, failed: 0 }) };
  }

  return {
    stores, connections, logs, openPickups, sync,
    journey: journey({ onboarding, stores, storesReviewed: storeChanges > 0 || onboarding.steps?.profile === "done", connections }),
    orders: {
      days, perDay: days.map((d) => byDay.get(d)!.n), valuePerDay: days.map((d) => Math.round(byDay.get(d)!.value)),
      count: orders.filter((o) => o.status !== "cancelled").length,
      value: orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.total), 0),
      recent: recentOrders.map((o) => ({ ...o, total: Number(o.total), customer: nameOf((o.shipping ?? {}) as ShipTo) })),
    },
  };
}

export const ORDER_FILTERS = { open: ["paid", "processing", "ready-for-pickup"], done: ["delivered"], cancelled: ["cancelled", "returned"] } as const;

export async function partnerOrders(partnerId: string, f: { q?: string; status?: string; store?: string; page?: number }) {
  const where: Prisma.OrderWhereInput = { pickupStore: { partnerId } };
  if (f.store) where.pickupStoreId = f.store;
  if (f.status && f.status in ORDER_FILTERS) where.status = { in: [...ORDER_FILTERS[f.status as keyof typeof ORDER_FILTERS]] };
  if (f.q) where.OR = [{ number: { contains: f.q, mode: "insensitive" } }, { shipping: { path: ["lastName"], string_contains: f.q } }, { lines: { some: { title: { contains: f.q, mode: "insensitive" } } } }];
  const page = Math.max(1, f.page ?? 1), size = 20;
  const [rows, total, byStatus] = await Promise.all([
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * size, take: size, select: { id: true, number: true, createdAt: true, updatedAt: true, status: true, total: true, paymentMethod: true, fulfilment: true, shipping: true, invoice: true, guestEmail: true, customer: { select: { email: true, phone: true, mobile: true } }, pickupStore: { select: { id: true, name: true, city: true } }, lines: { select: { variantId: true, title: true, qty: true, erpCode: true, unitPrice: true } }, restocks: { orderBy: { createdAt: "desc" }, select: { id: true, number: true, status: true, shipMode: true, approvedMode: true, reply: true, lines: true, note: true, createdAt: true, decidedAt: true, readyAt: true, shippedAt: true, seenAt: true, pickupStore: { select: { name: true, address: true, city: true, phone: true } } } } } }),
    db.order.count({ where }),
    db.order.groupBy({ by: ["status"], where: { pickupStore: { partnerId } }, _count: { _all: true } }),
  ]);
  return {
    page, pages: Math.max(1, Math.ceil(total / size)), total,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Record<string, number>,
    rows: rows.map((o) => {
      const s = (o.shipping ?? {}) as ShipTo;
      const inv = (o.invoice ?? null) as { vatNumber?: string; doy?: string; company?: string } | null;
      // Το κατάστημα υποχρεούται να παραδώσει την παραγγελία στον πελάτη → παίρνει όλα τα στοιχεία του από το eshop.
      const buyer = { name: nameOf(s) || "—", phone: s.phone || o.customer?.mobile || o.customer?.phone || null, email: s.email || o.guestEmail || o.customer?.email || null, address: addressOf(s) || null, notes: s.notes || null, invoice: inv?.vatNumber ? { company: inv.company ?? null, vatNumber: inv.vatNumber, doy: inv.doy ?? null } : null };
      return { ...o, total: Number(o.total), shipping: undefined, invoice: undefined, guestEmail: undefined, customer: buyer.name, buyer, lines: o.lines.map((l) => ({ ...l, unitPrice: Number(l.unitPrice) })) };
    }),
  };
}

export async function partnerLogs(partnerId: string, f: { kind?: string; ok?: string; before?: string }) {
  const where: Prisma.PartnerLogWhereInput = { partnerId };
  if (f.kind) where.kind = f.kind;
  if (f.ok === "0") where.ok = false;
  if (f.before) where.createdAt = { lt: new Date(f.before) };
  const [rows, kinds] = await Promise.all([
    db.partnerLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 60, include: { connection: { select: { type: true, label: true } } } }),
    db.partnerLog.groupBy({ by: ["kind"], where: { partnerId }, _count: { _all: true } }),
  ]);
  return { rows, kinds: Object.fromEntries(kinds.map((k) => [k.kind, k._count._all])) as Record<string, number>, next: rows.length === 60 ? rows[59].createdAt.toISOString() : null };
}
