import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizeRates, quoteRate, type RateData } from "./rates";
import { decideRoute, normalizeDelivery, pickPartner, STEPS, type RouteCandidate, type RouteMode, type StepKey } from "./routing";

/** Δημοσιευμένοι τιμοκατάλογοι, 60″ στη μνήμη. Σε σφάλμα (π.χ. ο πίνακας δεν υπάρχει ακόμη) → κανένας: το checkout μένει στις σταθερές τιμές. */
let rateMem: { at: number; v: Map<string, RateData> } | null = null;
export async function getRateTables(): Promise<Map<string, RateData>> {
  if (rateMem && Date.now() - rateMem.at < 60_000) return rateMem.v;
  const now = new Date();
  const rows = await db.shippingRateTable.findMany({ where: { status: "published", OR: [{ validFrom: null }, { validFrom: { lte: now } }] }, orderBy: { validFrom: "desc" } }).catch(() => []);
  const v = new Map<string, RateData>();
  for (const r of rows) if (!v.has(r.carrier)) v.set(r.carrier, normalizeRates(r.data));
  rateMem = { at: Date.now(), v };
  return v;
}
export const resetRateCache = () => { rateMem = null; };

/** Συνεργάτες με ορισμένη εξυπηρέτηση eshop, 60″ στη μνήμη (για τον έλεγχο κάλυψης στο checkout). */
let partnerMem: { at: number; v: { id: string; name: string; agencyId: string | null; delivery: ReturnType<typeof normalizeDelivery> }[] } | null = null;
async function servingPartners() {
  if (partnerMem && Date.now() - partnerMem.at < 60_000) return partnerMem.v;
  const rows = await db.partner.findMany({ where: { active: true, cooperating: true, NOT: { delivery: { equals: Prisma.DbNull } } }, select: { id: true, name: true, agencyId: true, delivery: true } }).catch(() => []);
  const v = rows.map((r) => ({ id: r.id, name: r.name, agencyId: r.agencyId, delivery: normalizeDelivery(r.delivery) })).filter((r) => r.delivery.homeDelivery && r.delivery.zips.length);
  partnerMem = { at: Date.now(), v };
  return v;
}
export const resetPartnerCache = () => { partnerMem = null; };

/** Στο checkout: υπάρχει συνεργάτης που φέρνει την παραγγελία σε αυτόν τον Τ.Κ.; (χωρίς έλεγχο αποθέματος, μόνο κάλυψη) */
export async function localPartnerFor(zip: string | null | undefined, bulky: boolean): Promise<{ eta: string } | null> {
  if (!/^\d{5}$/.test(zip ?? "")) return null;
  const list = await servingPartners();
  const p = pickPartner({ fulfilment: "freight", zip, bulky, install: false, candidates: list.map((x) => ({ ...x, hasStock: false })) });
  return p ? { eta: p.delivery?.eta || "" } : null;
}

/** Υποψήφιοι συνεργάτες για μια παραγγελία, με το αν έχουν όλο το απόθεμα στα καταστήματά τους. */
export async function partnerCandidates(lines: { variantId: string; qty: number }[]): Promise<RouteCandidate[]> {
  const list = await servingPartners();
  if (!list.length) return [];
  const stock = lines.length ? await db.storeStock.findMany({ where: { variantId: { in: lines.map((l) => l.variantId) }, store: { partnerId: { in: list.map((p) => p.id) }, active: true } }, select: { variantId: true, qty: true, store: { select: { partnerId: true } } } }) : [];
  const has = (pid: string) => lines.every((l) => stock.filter((s) => s.store.partnerId === pid && s.variantId === l.variantId).reduce((a, s) => a + s.qty, 0) >= l.qty);
  return list.map((p) => ({ ...p, hasStock: lines.length > 0 && has(p.id) }));
}

type OrderForRoute = { id: string; fulfilment: string; shipping: Prisma.JsonValue; lines: { variantId: string; qty: number }[]; promoTrace?: unknown };
const zipOf = (o: { shipping: Prisma.JsonValue }) => String((o.shipping as Record<string, unknown> | null)?.zip ?? "").trim();

async function createRoute(o: OrderForRoute, bulky: boolean) {
  const candidates = o.fulfilment === "freight" || o.fulfilment === "appointment" ? await partnerCandidates(o.lines) : [];
  const d = decideRoute({ fulfilment: o.fulfilment, zip: zipOf(o), bulky, install: o.fulfilment === "appointment", candidates });
  const steps = STEPS[d.mode].map((key, sort) => ({ key, sort }));
  return db.orderRoute.upsert({ where: { orderId: o.id }, update: {}, create: { orderId: o.id, mode: d.mode, partnerId: d.partnerId, agencyId: d.agencyId, reason: d.reason, decidedBy: "auto", steps: { create: steps } } });
}

/** Διαδρομές για όσες ανοιχτές παραγγελίες δεν έχουν ακόμη (π.χ. παλιές ή όταν άλλαξε η αρχικοποίηση). */
export async function ensureRoutes(days = 60, max = 200) {
  const since = new Date(Date.now() - days * 86400_000);
  const orders = await db.order.findMany({ where: { route: null, createdAt: { gte: since }, status: { notIn: ["cancelled", "returned", "pending"] } }, orderBy: { createdAt: "desc" }, take: max, select: { id: true, fulfilment: true, shipping: true, lines: { select: { variantId: true, qty: true } } } });
  for (const o of orders) await createRoute(o, o.fulfilment === "freight" || o.fulfilment === "appointment").catch((e) => console.error("[delivery] route", o.id, e));
  return orders.length;
}

/** Νέα δρομολόγηση μιας παραγγελίας (κρατά ό,τι βήματα έχουν ήδη γίνει μόνο αν ο τρόπος μένει ίδιος). */
export async function rerouteOrder(orderId: string, by: string) {
  const o = await db.order.findUnique({ where: { id: orderId }, select: { id: true, fulfilment: true, shipping: true, lines: { select: { variantId: true, qty: true } } } });
  if (!o) throw new Error("Δεν βρέθηκε η παραγγελία");
  await db.orderRoute.deleteMany({ where: { orderId, status: "open" } });
  const r = await createRoute(o, true);
  await db.orderRoute.update({ where: { orderId }, data: { decidedBy: by } });
  return r;
}

export async function markStep(orderId: string, key: StepKey, by: string, f: { ref?: string | null; proof?: string | null; note?: string | null; undo?: boolean } = {}) {
  const route = await db.orderRoute.findUnique({ where: { orderId }, include: { steps: true } });
  if (!route) throw new Error("Η παραγγελία δεν έχει διαδρομή");
  const step = route.steps.find((s) => s.key === key);
  if (!step) throw new Error("Το βήμα δεν ανήκει σε αυτή τη διαδρομή");
  const clip = (s: string | null | undefined) => (s ?? "").trim().slice(0, 200) || null;
  await db.$transaction([
    db.routeStep.update({ where: { id: step.id }, data: f.undo ? { doneAt: null, doneBy: null } : { doneAt: new Date(), doneBy: by, ref: clip(f.ref) ?? step.ref, proof: clip(f.proof) ?? step.proof, note: clip(f.note) ?? step.note } }),
    db.orderRoute.update({ where: { orderId }, data: { status: key === "customer" ? (f.undo ? "open" : "delivered") : route.status } }),
  ]);
}

/** Μεταφορική απευθείας στον πελάτη: ο διαχειριστής διάλεξε μεταφορέα. Τα βήματα ξεκινούν από την αρχή. */
export async function chooseCarrier(orderId: string, carrierId: string, by: string, cost: number | null) {
  const c = await db.carrier.findUnique({ where: { id: carrierId }, select: { id: true, name: true } });
  if (!c) throw new Error("Δεν βρέθηκε ο μεταφορέας");
  const mode: RouteMode = "freight";
  await db.$transaction([
    db.routeStep.deleteMany({ where: { orderId } }),
    db.orderRoute.update({ where: { orderId }, data: { mode, carrierId: c.id, agencyId: null, partnerId: null, cost: cost != null ? cost / 100 : null, reason: `Επιλογή διαχειριστή: ${c.name}`, decidedBy: by, status: "open", steps: { create: STEPS[mode].map((key, sort) => ({ key, sort })) } } }),
  ]);
}

/** Σύγκριση μεταφορέων για μια παραγγελία: κόστος από τον τιμοκατάλογό του (carrier:<id>), αν έχει. */
export async function freightOptions(orderId: string) {
  const o = await db.order.findUnique({ where: { id: orderId }, select: { shipping: true, total: true, lines: { select: { qty: true, variant: { select: { productId: true } } } } } });
  if (!o) return [];
  const { shippingLimits } = await import("@/lib/shipping/bulky-server");
  const { chargeableKg } = await import("./rates");
  const limits = await shippingLimits(o.lines.map((l) => l.variant.productId));
  const [tables, carriers] = await Promise.all([getRateTables(), db.carrier.findMany({ where: { active: true, s1Missing: false, role: { in: ["agency", "driver", "courier"] } }, orderBy: [{ role: "asc" }, { name: "asc" }], select: { id: true, name: true, role: true, city: true, phone: true } })]);
  const items = o.lines.map((l) => ({ qty: l.qty, weightKg: limits.get(l.variant.productId)?.weightKg ?? null, dimsCm: limits.get(l.variant.productId)?.dimsCm ?? null }));
  const zip = zipOf(o);
  return carriers.map((c) => {
    const t = tables.get(`carrier:${c.id}`);
    const q = t ? quoteRate(t, { zip, goods: Math.round(Number(o.total) * 100), kg: chargeableKg(items, t.divisor), bulky: true }) : null;
    return { ...c, cost: q ? q.cost ?? q.baseFee : null, zone: q?.zone.name ?? null };
  }).sort((a, b) => (a.cost ?? 1e9) - (b.cost ?? 1e9));
}

export const ROUTE_INCLUDE = {
  partner: { select: { id: true, name: true, city: true, phone: true } },
  agency: { select: { id: true, name: true, city: true, phone: true } },
  carrier: { select: { id: true, name: true, phone: true } },
  steps: { orderBy: { sort: "asc" } },
} satisfies Prisma.OrderRouteInclude;
