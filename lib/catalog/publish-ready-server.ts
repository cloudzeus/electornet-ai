import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { shippingFacts, getBulkyRules } from "@/lib/shipping/bulky-server";
import { decideShipping } from "@/lib/shipping/bulky";
import { availabilityOf } from "@/lib/catalog/availability";
import { publishMissing, isPublishable, normalizeGate, isPublishKey, ALL_KEYS, type PublishGate, type PublishKey } from "@/lib/catalog/publish-ready";

/**
 * Έλεγχος πληρότητας σε όλο τον κατάλογο → `Product.publishMissing` (τι λείπει) και `publishReady` (περνά τα ενεργά
 * κριτήρια). Η βιτρίνα ζητά `publishReady` (LISTED, σελίδα προϊόντος)· με κλειστό έλεγχο είναι παντού true.
 * Τρέχει μετά τη διαθεσιμότητα (projectOffers), από την εργασία «publish-ready» και όταν αλλάξει ο διακόπτης.
 */
const SECTION = "catalog.publish";
let mem: { at: number; v: PublishGate } | null = null;

export async function getPublishGate(): Promise<PublishGate> {
  if (mem && Date.now() - mem.at < 60_000) return mem.v;
  const row = await db.setting.findUnique({ where: { section: SECTION } }).catch(() => null);
  const v = normalizeGate(row?.data);
  mem = { at: Date.now(), v };
  return v;
}

export async function savePublishGate(raw: unknown, userId: string) {
  const before = await getPublishGate();
  const after = normalizeGate(raw);
  const data = after as unknown as Prisma.InputJsonValue;
  await db.setting.upsert({ where: { section: SECTION }, update: { data, updatedById: userId }, create: { section: SECTION, data, updatedById: userId } });
  mem = null;
  return { before, after };
}

type Facts = { id: string; active: boolean; missing: PublishKey[] };

/** Τα κριτήρια για τα προϊόντα του `where` (όλα, ανεξάρτητα από τον διακόπτη). */
export async function publishFacts(where: Prisma.ProductWhereInput): Promise<Facts[]> {
  const products = await db.product.findMany({ where, select: { id: true, active: true, source: true, erpCode: true } });
  if (!products.length) return [];
  const ids = products.map((p) => p.id);
  const mtrls = products.filter((p) => p.source === "softone" && /^\d+$/.test(p.erpCode)).map((p) => Number(p.erpCode));
  const part = <T,>(l: T[], n = 5000) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, i * n + n));
  const [items, photos, specs, ship, avail, rules] = await Promise.all([
    Promise.all(part(mtrls).map((m) => db.s1Item.findMany({ where: { mtrl: { in: m } }, select: { mtrl: true, webExcluded: true, specGroupS1Id: true, webCat1: true } }))).then((x) => x.flat()),
    Promise.all(part(ids).map((p) => db.media.groupBy({ by: ["productId"], where: { productId: { in: p }, kind: "image", hidden: false }, _count: { _all: true } }))).then((x) => x.flat()),
    Promise.all(part(ids).map((p) => db.spec.groupBy({ by: ["productId"], where: { productId: { in: p } }, _count: { _all: true } }))).then((x) => x.flat()),
    shippingFacts(ids),
    availabilityOf({ id: { in: ids } }),
    getBulkyRules(),
  ]);
  const itemOf = new Map(items.map((i) => [String(i.mtrl), i]));
  const photoOf = new Map(photos.map((m) => [m.productId, m._count._all]));
  const specOf = new Map(specs.map((s) => [s.productId, s._count._all]));
  const shipOf = new Map(ship.map((f) => [f.id, f]));
  return products.map((p) => {
    const it = p.source === "softone" ? itemOf.get(p.erpCode) : undefined;
    const f = shipOf.get(p.id);
    // «μόνο κατάστημα» / «μεταφορική» από την κατηγορία (όχι από βάρος/μέγεθος, που εδώ μπορεί να λείπουν)
    const byCat = f ? decideShipping({ categoryPath: f.path, weightKg: null, dimsCm: null }, rules) : null;
    const a = avail.get(p.id);
    const missing = publishMissing({
      webExcluded: !!it?.webExcluded,
      hasWebCategory: p.source !== "softone" || !!it && (it.specGroupS1Id != null || it.webCat1 != null),
      photos: photoOf.get(p.id) ?? 0,
      specs: specOf.get(p.id) ?? 0,
      dims: !!f?.dimsCm, weight: f?.weightKg != null && f.weightKg > 0,
      shipExempt: !!byCat && !byCat.courier,
      avail: { label: a?.label ?? "", publish: a?.publish ?? true },
    });
    return { id: p.id, active: p.active, missing };
  });
}

/** Χωρίς `productIds`: όλος ο κατάλογος. Γράφει μόνο όσα άλλαξαν. */
export async function projectPublishReady(productIds?: string[]): Promise<number> {
  const [gate, facts] = await Promise.all([getPublishGate(), publishFacts(productIds ? { id: { in: productIds } } : {})]);
  const cur = new Map((await db.product.findMany({ where: { id: { in: facts.map((f) => f.id) } }, select: { id: true, publishReady: true, publishMissing: true } })).map((p) => [p.id, p]));
  const groups = new Map<string, { ready: boolean; missing: PublishKey[]; ids: string[] }>();
  for (const f of facts) {
    const ready = isPublishable(f.missing, gate), c = cur.get(f.id);
    if (c && c.publishReady === ready && c.publishMissing.join() === f.missing.join()) continue;
    const k = `${ready}|${f.missing.join()}`;
    const g = groups.get(k) ?? { ready, missing: f.missing, ids: [] };
    g.ids.push(f.id); groups.set(k, g);
  }
  let n = 0;
  for (const g of groups.values()) for (let i = 0; i < g.ids.length; i += 2000) n += (await db.product.updateMany({ where: { id: { in: g.ids.slice(i, i + 2000) } }, data: { publishReady: g.ready, publishMissing: g.missing } })).count;
  return n;
}

export interface PublishTally { active: number; complete: number; hidden: number; byKey: Record<PublishKey, number> }

/** Πλήθη στα ενεργά προϊόντα: πόσα χάνουν κάθε κριτήριο και πόσα θα κρύβονταν με αυτόν τον διακόπτη. */
export async function tallyPublish(gateRaw?: unknown): Promise<PublishTally> {
  const gate = gateRaw === undefined ? await getPublishGate() : normalizeGate(gateRaw);
  const rows = await db.product.findMany({ where: { active: true }, select: { publishMissing: true } });
  const byKey = Object.fromEntries(ALL_KEYS.map((k) => [k, 0])) as Record<PublishKey, number>;
  let complete = 0, hidden = 0;
  for (const r of rows) {
    const miss = r.publishMissing.filter(isPublishKey);
    if (!miss.length) complete++;
    for (const k of miss) byKey[k]++;
    // «θα κρύβονταν»: με αυτά τα κριτήρια και ανοιχτό έλεγχο (για την προεπισκόπηση πριν ανοίξει)
    if (!isPublishable(miss, { ...gate, enabled: true })) hidden++;
  }
  return { active: rows.length, complete, hidden, byKey };
}
