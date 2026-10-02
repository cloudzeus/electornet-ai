import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { services } from "@/lib/data/fixtures/services";
import { evaluate, inactiveReason, matches, type EngineLine } from "./engine";
import { activePromos, invalidatePromos, lowest30 } from "./server";
import { autoLabel } from "./catalog";
import { getPromoPolicy } from "./policy";

/**
 * Έτοιμες τιμές και tags ανά προϊόν (ProductOffer). Υπολογίζονται εδώ, μία φορά, όταν αλλάζει κάτι — και οι σελίδες
 * απλώς τα διαβάζουν. Ο υπολογισμός για όλο τον κατάλογο (~8.300 προϊόντα) γίνεται στη μνήμη σε λίγα δευτερόλεπτα·
 * στη βάση γράφονται μόνο όσα προϊόντα άλλαξαν.
 */

export interface OfferTag { kind: "price" | "qty" | "gift" | "service" | "shipping" | "members"; label: string; promotionId: string; giftTitle?: string }

const eur = (c: number) => `${(c / 100).toLocaleString("el-GR", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })} €`;
export { autoLabel };

const state = { computedAt: 0, running: null as Promise<unknown> | null };

// ---- κλείδωμα ανάμεσα σε διεργασίες (πολλά instances, cron, admin): ένας υπολογισμός τη φορά ----
// Αν κάποιος ζητήσει υπολογισμό ενώ τρέχει άλλος, σημειώνεται «ξανά» και ο κάτοχος τρέχει μία φορά ακόμη στο τέλος —
// αλλιώς ένας παλιός υπολογισμός θα έσβηνε ό,τι έγραψε ένας νεότερος.
const LOCK = "promos-recompute-lock";
async function acquireLock(ttlMs = 180_000) {
  const now = Date.now();
  await db.$executeRaw`INSERT INTO "Setting" (section, data, "updatedAt", "createdAt") VALUES (${LOCK}, '{"until":0,"rerun":false}'::jsonb, now(), now()) ON CONFLICT (section) DO NOTHING`;
  const got = await db.$executeRaw`UPDATE "Setting" SET data = jsonb_build_object('until', ${now + ttlMs}::bigint, 'rerun', false), "updatedAt" = now() WHERE section = ${LOCK} AND COALESCE((data->>'until')::bigint, 0) < ${now}::bigint`;
  if (!got) await db.$executeRaw`UPDATE "Setting" SET data = data || '{"rerun":true}'::jsonb WHERE section = ${LOCK}`;
  return got > 0;
}
async function releaseLock(): Promise<boolean> {
  const rows = await db.$queryRaw<{ rerun: boolean | null }[]>`UPDATE "Setting" s SET data = jsonb_build_object('until', 0, 'rerun', false), "updatedAt" = now() FROM (SELECT (data->>'rerun')::boolean AS rerun FROM "Setting" WHERE section = ${LOCK} FOR UPDATE) old WHERE s.section = ${LOCK} RETURNING old.rerun`;
  return !!rows[0]?.rerun;
}

type RecomputeResult = { products: number; withOffer: number; changed: number; removed: number; ms: number; skipped?: "locked" };

/** Ο πλήρης υπολογισμός. Επιστρέφει πόσα προϊόντα επηρεάζονται και πόσα άλλαξαν. */
export async function recomputeOffers(): Promise<RecomputeResult> {
  if (state.running) return state.running as Promise<RecomputeResult>;
  const run = (async (): Promise<RecomputeResult> => {
    if (!(await acquireLock().catch(() => true))) return { products: 0, withOffer: 0, changed: 0, removed: 0, ms: 0, skipped: "locked" };
    let last: RecomputeResult = { products: 0, withOffer: 0, changed: 0, removed: 0, ms: 0 };
    let holding = true;
    try {
      for (let i = 0; i < 3 && holding; i++) {
        last = await computeOnce();
        const again = await releaseLock().catch(() => false);
        holding = false;
        // ζητήθηκε ξανά όσο τρέχαμε: ένας ακόμη γύρος (το πολύ 3), αν δεν τον πήρε ήδη άλλη διεργασία
        if (again && i < 2) holding = await acquireLock().catch(() => false);
      }
    } finally { if (holding) await releaseLock().catch(() => false); }
    return last;
  })();
  state.running = run;
  try { return await run; } finally { state.running = null; }
}

async function computeOnce(): Promise<RecomputeResult> {
  {
    const t0 = Date.now();
    const now = new Date();
    invalidatePromos();
    const [all, policy] = await Promise.all([activePromos(now), getPromoPolicy()]);
    const promos = all.filter((p) => !inactiveReason(p, now));
    const guard = { maxLinePct: policy.maxLinePct, costFloor: policy.belowCost === "block" };
    // κουπόνια και καλαθιού-ολόκληρου μεταφορικά δεν δίνουν tag σε προϊόν
    const display = promos.filter((p) => !p.mechanism.startsWith("coupon") && !(p.mechanism === "shipping" && !p.targets.some((t) => !t.exclude)));
    const [products, cats] = await Promise.all([
      db.product.findMany({ where: { active: true }, select: { id: true, brandId: true, categoryId: true, variants: { select: { id: true, price: true }, take: 1 } } }),
      db.category.findMany({ select: { id: true, parentId: true } }),
    ]);
    const parent = new Map(cats.map((c) => [c.id, c.parentId]));
    const chain = (id: string) => { const out: string[] = []; for (let c: string | null | undefined = id, g = 0; c && g < 8; c = parent.get(c), g++) out.push(c); return out; };
    const giftIds = [...new Set(display.flatMap((p) => (p.mechanism === "gift" && p.reward.giftProductId ? [p.reward.giftProductId] : [])))];
    const giftTitles = new Map((giftIds.length ? await db.product.findMany({ where: { id: { in: giftIds } }, select: { id: true, title: true } }) : []).map((g) => [g.id, g.title]));
    const svcTitle = new Map(services.map((s) => [s.slug, s.title]));

    const rows: { productId: string; variantId: string; listPrice: number; price: number; memberPrice: number | null; promotionId: string | null; promoCode: string | null; endsAt: Date | null; tags: OfferTag[] }[] = [];
    for (const p of products) {
      const v = p.variants[0];
      if (!v || Number(v.price) <= 0) continue;
      const line: EngineLine = { key: p.id, productId: p.id, variantId: v.id, brandId: p.brandId, categoryIds: chain(p.categoryId), qty: 1, unit: Math.round(Number(v.price) * 100) };
      const mine = display.filter((x) => matches(x, line));
      if (!mine.length) continue;
      const guest = evaluate([line], mine, { now, customer: { registered: false, isNew: true }, ...guard });
      const member = mine.some((x) => x.rules?.customers === "registered") ? evaluate([line], mine, { now, customer: { registered: true, isNew: false }, ...guard }) : null;
      const tags: OfferTag[] = [];
      const adj = guest.lines[0].adjustments.find((a) => a.kind === "price");
      if (adj) { const pp = mine.find((x) => x.id === adj.promotionId)!; tags.push({ kind: "price", label: autoLabel(pp), promotionId: adj.promotionId }); }
      if (member && member.total < guest.total) {
        const m = member.lines[0].adjustments.find((a) => a.kind === "price");
        if (m) tags.push({ kind: "members", label: `Τιμή μέλους ${eur(member.total)}`, promotionId: m.promotionId });
      }
      for (const x of mine) {
        if (x.mechanism === "n-plus-m" || x.mechanism === "nth-discount" || x.mechanism === "qty-tiers") tags.push({ kind: "qty", label: autoLabel(x), promotionId: x.id });
        else if (x.mechanism === "gift") tags.push({ kind: "gift", label: autoLabel(x), promotionId: x.id, giftTitle: giftTitles.get(x.reward.giftProductId ?? "") });
        else if (x.mechanism === "service") tags.push({ kind: "service", label: autoLabel(x, svcTitle.get(x.reward.serviceSlug ?? "")), promotionId: x.id });
        else if (x.mechanism === "shipping") tags.push({ kind: "shipping", label: autoLabel(x), promotionId: x.id });
      }
      if (!tags.length) continue;
      tags.splice(policy.maxTagsPerCard);
      const ends = mine.map((x) => x.endsAt).filter((d): d is Date => !!d).sort((a, b) => +a - +b)[0] ?? null;
      rows.push({ productId: p.id, variantId: v.id, listPrice: line.unit, price: guest.total, memberPrice: member && member.total < guest.total ? member.total : null, promotionId: adj?.promotionId ?? null, promoCode: adj?.code ?? null, endsAt: ends, tags });
    }

    // Omnibus για όσα έχουν έκπτωση τιμής
    const low = await lowest30(rows.filter((r) => r.price < r.listPrice).map((r) => r.variantId), now);
    const existing = new Map((await db.productOffer.findMany()).map((o) => [o.productId, o]));
    const dec = (c: number | null) => (c == null ? null : new Prisma.Decimal((c / 100).toFixed(2)));
    const key = (o: { price: unknown; memberPrice: unknown; promotionId: string | null; endsAt: Date | null; lowest30: unknown; tags: unknown; listPrice: unknown }) =>
      JSON.stringify([String(o.listPrice), String(o.price), String(o.memberPrice ?? ""), o.promotionId, o.endsAt?.toISOString() ?? null, String(o.lowest30 ?? ""), o.tags]);
    const writes: Prisma.PrismaPromise<unknown>[] = [];
    let changed = 0;
    for (const r of rows) {
      const data = { variantId: r.variantId, listPrice: dec(r.listPrice)!, price: dec(r.price)!, memberPrice: dec(r.memberPrice), promotionId: r.promotionId, promoCode: r.promoCode, endsAt: r.endsAt, lowest30: r.price < r.listPrice ? dec(low.get(r.variantId) ?? null) : null, tags: r.tags as unknown as Prisma.InputJsonValue, computedAt: now };
      const prev = existing.get(r.productId);
      existing.delete(r.productId);
      if (prev && key(prev) === key({ ...data, tags: r.tags })) continue;
      changed++;
      writes.push(db.productOffer.upsert({ where: { productId: r.productId }, create: { productId: r.productId, ...data }, update: data }));
    }
    // προϊόντα που δεν έχουν πια προσφορά: τα παράγωγα δεδομένα τους φεύγουν
    const removed = [...existing.keys()];
    if (removed.length) writes.push(db.productOffer.deleteMany({ where: { productId: { in: removed } } }));
    for (let i = 0; i < writes.length; i += 200) await db.$transaction(writes.slice(i, i + 200));
    state.computedAt = now.getTime();
    return { products: products.length, withOffer: rows.length, changed, removed: removed.length, ms: Date.now() - t0 };
  }
}

/**
 * Χρονοπρογραμματιστής: ανάβει / σβήνει προσφορές στην ώρα τους και ξαναϋπολογίζει ΜΟΝΟ όταν πέρασε κάποια ώρα
 * έναρξης ή λήξης από τον τελευταίο υπολογισμό (ή όταν δεν έχει γίνει ποτέ σε αυτή τη διεργασία).
 */
export async function tickPromos(opts: { force?: boolean } = {}) {
  const now = new Date();
  const [toActive, toEnded] = await db.$transaction([
    db.promotion.updateMany({ where: { status: "scheduled", held: false, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, data: { status: "active" } }),
    db.promotion.updateMany({ where: { status: { in: ["active", "scheduled", "paused"] }, endsAt: { lt: now } }, data: { status: "ended" } }),
  ]);
  const since = new Date(state.computedAt);
  const crossed = state.computedAt === 0 ? 1 : await db.promotion.count({ where: { OR: [{ startsAt: { gt: since, lte: now } }, { endsAt: { gt: since, lte: now } }] } });
  if (opts.force || toActive.count || toEnded.count || crossed) return { activated: toActive.count, ended: toEnded.count, ...(await recomputeOffers()) };
  return { activated: 0, ended: 0, skipped: true as const };
}

let lastTick = 0;
/** Για κλήση από τη βιτρίνα: το πολύ μία φορά το λεπτό, στο παρασκήνιο — δεν καθυστερεί καμία σελίδα. */
export function maybeTickPromos() {
  if (Date.now() - lastTick < 60_000) return;
  lastTick = Date.now();
  void tickPromos().catch(() => { lastTick = 0; });
}
