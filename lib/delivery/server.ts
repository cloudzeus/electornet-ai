import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizeRates, quoteRate, type RateData } from "./rates";
import { getSetting } from "@/lib/settings/store";
import { geocodeAddress, zipPoint } from "@/lib/stores/geocode";
import { rankByRoad } from "@/lib/geo/road";
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

/** Ρυθμίσεις → Αποστολές → «Ζωντανό απόθεμα συνεργαζόμενων καταστημάτων». Κλειστό (και όταν δεν έχει οριστεί): ο συνεργάτης προτείνεται κανονικά, αλλά το απόθεμά του δεν φαίνεται στον πελάτη ούτε μετρά στη δρομολόγηση. */
export const partnerLiveStockOn = async () => (await getSetting("shipping").catch(() => null))?.data.partnerLiveStock === true;

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

/**
 * Συνεργαζόμενα καταστήματα κοντά στη διεύθυνση του πελάτη, ταξινομημένα με ΟΔΙΚΗ απόσταση (για την παράδοση στο σπίτι
 * από κατάστημα, εκτός Αττικής). [] = κανένα κοντά · undefined = ακόμη υπολογίζεται (ή λείπει Τ.Κ. / πόλη) · null = ο χάρτης
 * δεν βρήκε τη διεύθυνση ή την απόσταση (5′ στη μνήμη: το ταμείο το κάνει «κατόπιν συνεννόησης») — ποτέ ευθεία.
 */
export interface LocalStore { id: string; partnerId: string; name: string; /** η διεύθυνση του καταστήματος: αυτή διαβάζει ο πελάτης, όχι το επώνυμο του συνεργάτη */ address: string; city: string; km: number }
let coopMem: { at: number; v: { id: string; partnerId: string; name: string; address: string; city: string; lat: number; lng: number }[] } | null = null;
async function coopStores() {
  if (coopMem && Date.now() - coopMem.at < 60_000) return coopMem.v;
  const rows = await db.store.findMany({ where: { active: true, partner: { active: true, cooperating: true }, NOT: { lat: 0 } }, select: { id: true, partnerId: true, name: true, address: true, city: true, lat: true, lng: true } });
  coopMem = { at: Date.now(), v: rows.map((r) => ({ ...r, partnerId: r.partnerId! })) };
  return coopMem.v;
}
const nearMem = new Map<string, { at: number; p: Promise<LocalStore[] | null>; done?: boolean; ttl?: number; /** «area»: η οδός δεν βρέθηκε, μετρήθηκε από τον Τ.Κ. */ found?: "ok" | "area" | "none" }>();
const nearKey = (a: { street?: string | null; number?: string | null; city?: string | null; zip?: string | null }) =>
  `${[a.street, a.number].map((x) => (x ?? "").trim()).filter(Boolean).join(" ")}|${(a.zip ?? "").trim()}|${(a.city ?? "").trim()}`.toLowerCase();
/** Πόσο καλά βρήκε ο χάρτης τη διεύθυνση του τελευταίου nearStoresFor (undefined = δεν έχει τελειώσει / δεν ζητήθηκε). */
export const nearStoresFound = (a: Parameters<typeof nearKey>[0]) => nearMem.get(nearKey(a))?.found;
export async function nearStoresFor(a: { street?: string | null; number?: string | null; city?: string | null; zip?: string | null }, budgetMs = 2500): Promise<LocalStore[] | null | undefined> {
  const zip = (a.zip ?? "").trim(), city = (a.city ?? "").trim(), street = [a.street, a.number].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
  if (!/^\d{5}$/.test(zip) || !city) return undefined;
  const key = nearKey(a);
  let hit = nearMem.get(key);
  // έτοιμο αποτέλεσμα: 30′ · όσο τρέχει ο υπολογισμός μοιράζεται · «δεν βρέθηκε»: 5′, μετά ξαναδοκιμάζεται
  if (!hit || (hit.done && Date.now() - hit.at > (hit.ttl ?? 30 * 60_000))) {
    if (nearMem.size > 2000) nearMem.clear();
    const run = async (): Promise<LocalStore[] | null> => {
      // Nominatim: 1 αίτημα το δευτερόλεπτο — πρώτα η οδός, αλλιώς ο οικισμός του Τ.Κ.
      let pt = street ? await geocodeAddress(`${street}, ${zip} ${city}, Ελλάδα`, { timeoutMs: 6000, preferPlace: true }).catch(() => null) : null;
      entry.found = pt || !street ? "ok" : "area"; // χωρίς οδό ο Τ.Κ. είναι ό,τι περιμένουμε
      // αλλιώς το σημείο του Τ.Κ. (η αναζήτηση «Τ.Κ. πόλη» αποτυγχάνει σε μεγάλες πόλεις)
      if (!pt) { if (street) await new Promise((r) => setTimeout(r, 1100)); const z = await zipPoint(zip); pt = z && { ...z, label: zip, score: 0 }; }
      if (!pt) { entry.found = "none"; return null; }
      const r = await rankByRoad(pt, await coopStores());
      return r?.map((x) => ({ id: x.item.id, partnerId: x.item.partnerId, name: x.item.name, address: x.item.address, city: x.item.city, km: x.km })) ?? null;
    };
    const entry: NonNullable<typeof hit> = { at: Date.now(), p: Promise.resolve(null) };
    entry.p = run().catch(() => null);
    void entry.p.then((v) => { entry.done = true; entry.at = Date.now(); if (v === null) entry.ttl = 5 * 60_000; });
    nearMem.set(key, entry); hit = entry;
  }
  return Promise.race([hit.p, new Promise<undefined>((r) => setTimeout(() => r(undefined), budgetMs))]);
}

/** Οι Τ.Κ. των ενεργών καταστημάτων-μελών, 5′ στη μνήμη: από εκεί βγαίνει το «δωρεάν στις περιοχές με κατάστημα». */
let zipMem: { at: number; v: Set<string> } | null = null;
export async function storeZips(): Promise<Set<string>> {
  if (zipMem && Date.now() - zipMem.at < 5 * 60_000) return zipMem.v;
  const rows = await db.store.findMany({ where: { active: true }, select: { zip: true } }).catch(() => []);
  const v = new Set(rows.map((r) => (r.zip ?? "").trim()).filter((z) => /^\d{5}$/.test(z)));
  zipMem = { at: Date.now(), v };
  return v;
}
export const resetStoreZipCache = () => { zipMem = null; };

/**
 * Πριν δοθεί Τ.Κ.: εκτίμηση της περιοχής του επισκέπτη (cookie GPS / «Κοντά σε», αλλιώς IP) για να του πούμε ότι η
 * παράδοση είναι δωρεάν εκεί. ΜΟΝΟ ένδειξη — η χρέωση κρίνεται πάντα από τον Τ.Κ. που θα γράψει ο ίδιος στο ταμείο.
 * `free` = υπάρχει ενεργό κατάστημα-μέλος μέσα σε 20 χλμ (ευθεία, αρκεί για ένδειξη).
 */
export async function areaHintFromRequest(): Promise<{ place: string; free: boolean } | null> {
  const { geoFromRequest } = await import("@/lib/geo/ip");
  const { nearestStores } = await import("@/lib/stores/repo");
  const p = await geoFromRequest().catch(() => null);
  if (!p || p.source === "fallback") return null;
  const near = await nearestStores(p, 1).catch(() => []);
  const place = p.city?.trim() || near[0]?.city?.trim() || "";
  if (!place) return null;
  return { place, free: !!near[0] && near[0].distanceKm <= 20 };
}

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
  const live = lines.length > 0 && (await partnerLiveStockOn()); // χωρίς ζωντανό απόθεμα: κανείς «δεν έχει», άρα το στέλνουμε εμείς στο πρακτορείο του
  const stock = live ? await db.storeStock.findMany({ where: { variantId: { in: lines.map((l) => l.variantId) }, store: { partnerId: { in: list.map((p) => p.id) }, active: true } }, select: { variantId: true, qty: true, store: { select: { partnerId: true } } } }) : [];
  const has = (pid: string) => lines.every((l) => stock.filter((s) => s.store.partnerId === pid && s.variantId === l.variantId).reduce((a, s) => a + s.qty, 0) >= l.qty);
  return list.map((p) => ({ ...p, hasStock: live && has(p.id) }));
}

type OrderForRoute = { id: string; fulfilment: string; shipping: Prisma.JsonValue; lines: { variantId: string; qty: number }[]; promoTrace?: unknown };
const zipOf = (o: { shipping: Prisma.JsonValue }) => String((o.shipping as Record<string, unknown> | null)?.zip ?? "").trim();

async function createRoute(o: OrderForRoute, bulky: boolean) {
  let candidates = o.fulfilment === "freight" || o.fulfilment === "appointment" ? await partnerCandidates(o.lines) : [];
  // ο πελάτης διάλεξε παράδοση από το κοντινό του συνεργαζόμενο κατάστημα (παράδοση στο σπίτι από κατάστημα): αυτός ο συνεργάτης αναλαμβάνει όλη την παραγγελία
  const local = (o.shipping as { localStore?: { partnerId?: string } } | null)?.localStore?.partnerId;
  if (o.fulfilment === "freight" && local) {
    const p = await db.partner.findUnique({ where: { id: local }, select: { id: true, name: true, agencyId: true } });
    if (p) candidates = [{ ...p, hasStock: candidates.find((c) => c.id === p.id)?.hasStock ?? false, delivery: { zips: [zipOf(o)], homeDelivery: true, bulkyOk: true, installs: true, eta: "" } }];
  }
  const d = decideRoute({ fulfilment: o.fulfilment, zip: zipOf(o), bulky, install: o.fulfilment === "appointment", candidates });
  // κανένα συνεργαζόμενο κατάστημα κοντά στον πελάτη: φεύγει από το κεντρικό με μεταφορική — ο διαχειριστής διαλέγει το πρακτορείο
  if (d.mode === "unrouted" && (o.shipping as { central?: boolean } | null)?.central) d.reason = "Κανένα συνεργαζόμενο κατάστημα κοντά στον πελάτη: μεταφορική (πρακτορείο) από το κεντρικό κατάστημα. Διάλεξε μεταφορέα";
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

/**
 * Αλλαγή συνεργάτη από τη διαχείριση: τα συνεργαζόμενα καταστήματα κοντά στη διεύθυνση της παραγγελίας με οδικά χλμ
 * (km: null όταν ο χάρτης δεν απάντησε ή όταν ο διαχειριστής έψαξε με όνομα/πόλη — τότε η απόσταση είναι άγνωστη).
 */
export async function partnerOptions(orderId: string, q = "") {
  const o = await db.order.findUnique({ where: { id: orderId }, select: { shipping: true, route: { select: { partnerId: true } } } });
  if (!o) return { known: false, current: null as string | null, stores: [] as (Omit<LocalStore, "km"> & { km: number | null; agency: boolean })[] };
  const s = (o.shipping ?? {}) as { street?: string; number?: string; city?: string; zip?: string };
  const near = q.trim() ? undefined : (await nearStoresFor({ street: s.street, number: s.number, city: s.city, zip: s.zip }, 15_000)) ?? undefined;
  const term = q.trim() || (near === undefined ? s.city ?? "" : "");
  const found = near ? [] : await db.store.findMany({ where: { active: true, partner: { active: true, cooperating: true }, ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { city: { contains: term, mode: "insensitive" } }, { partner: { name: { contains: term, mode: "insensitive" } } }] } : {}) }, orderBy: [{ city: "asc" }, { name: "asc" }], take: 12, select: { id: true, partnerId: true, name: true, city: true } });
  const list = near ? near.map((x) => ({ ...x, km: x.km as number | null })) : found.map((x) => ({ ...x, partnerId: x.partnerId!, km: null as number | null }));
  const ag = new Set((await db.partner.findMany({ where: { id: { in: list.map((x) => x.partnerId) }, NOT: { agencyId: null } }, select: { id: true } })).map((p) => p.id));
  return { known: near !== undefined, current: o.route?.partnerId ?? null, stores: list.map((x) => ({ ...x, agency: ag.has(x.partnerId) })) };
}

/** Ο διαχειριστής αναθέτει την παραγγελία σε κατάστημα συνεργάτη: μέσω του πρακτορείου του αν έχει, αλλιώς απευθείας. Τα βήματα ξεκινούν από την αρχή. */
export async function choosePartner(orderId: string, storeId: string, by: string, km: number | null) {
  const st = await db.store.findFirst({ where: { id: storeId, active: true, partner: { active: true, cooperating: true } }, select: { id: true, name: true, city: true, partner: { select: { id: true, name: true, agencyId: true } } } });
  if (!st?.partner) throw new Error("Το κατάστημα δεν είναι συνεργαζόμενο με το eshop");
  const o = await db.order.findUnique({ where: { id: orderId }, select: { shipping: true, route: { select: { status: true } } } });
  if (!o) throw new Error("Δεν βρέθηκε η παραγγελία");
  if (o.route?.status === "delivered") throw new Error("Η παραγγελία έχει ήδη παραδοθεί");
  const mode: RouteMode = st.partner.agencyId ? "agency" : "partner";
  const data = { mode, partnerId: st.partner.id, agencyId: st.partner.agencyId, carrierId: null, reason: `Επιλογή διαχειριστή: ${st.name}`, decidedBy: by, status: "open" };
  // το κατάστημα γράφεται και στην παραγγελία, ώστε μια νέα δρομολόγηση να το κρατήσει
  const { central: _c, ...ship } = (o.shipping ?? {}) as Record<string, unknown>; void _c;
  await db.$transaction([
    db.routeStep.deleteMany({ where: { orderId } }),
    db.orderRoute.upsert({ where: { orderId }, update: { ...data, steps: { create: STEPS[mode].map((key, sort) => ({ key, sort })) } }, create: { orderId, ...data, steps: { create: STEPS[mode].map((key, sort) => ({ key, sort })) } } }),
    db.order.update({ where: { id: orderId }, data: { shipping: { ...ship, carrierName: `Κατάστημα ${st.name}`, localStore: { id: st.id, partnerId: st.partner.id, name: st.name, city: st.city, km } } as Prisma.InputJsonValue } }),
  ]);
  return { mode, name: st.name };
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
    const q = t ? quoteRate(t, { zip, kg: chargeableKg(items, t.divisor) }) : null;
    return { ...c, cost: q ? q.cost ?? q.baseFee : null, zone: q?.zone.name ?? null };
  }).sort((a, b) => (a.cost ?? 1e9) - (b.cost ?? 1e9));
}

export const ROUTE_INCLUDE = {
  partner: { select: { id: true, name: true, city: true, phone: true } },
  agency: { select: { id: true, name: true, city: true, phone: true } },
  carrier: { select: { id: true, name: true, phone: true } },
  steps: { orderBy: { sort: "asc" } },
} satisfies Prisma.OrderRouteInclude;
