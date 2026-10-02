import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { services } from "@/lib/data/fixtures/services";
import { evaluate, inactiveReason, matches, type EngineLine, type EnginePromo } from "./engine";
import { activePromos, invalidatePromos, lowest30 } from "./server";

/**
 * Έτοιμες τιμές και tags ανά προϊόν (ProductOffer). Υπολογίζονται εδώ, μία φορά, όταν αλλάζει κάτι — και οι σελίδες
 * απλώς τα διαβάζουν. Ο υπολογισμός για όλο τον κατάλογο (~8.300 προϊόντα) γίνεται στη μνήμη σε λίγα δευτερόλεπτα·
 * στη βάση γράφονται μόνο όσα προϊόντα άλλαξαν.
 */

export interface OfferTag { kind: "price" | "qty" | "gift" | "service" | "shipping" | "members"; label: string; promotionId: string; giftTitle?: string }

const eur = (c: number) => `${(c / 100).toLocaleString("el-GR", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })} €`;

/** Αυτόματη ετικέτα όταν ο διαχειριστής δεν έγραψε δική του. */
export function autoLabel(p: Pick<EnginePromo, "mechanism" | "reward" | "tagLabel" | "name">, serviceTitle?: string): string {
  if (p.tagLabel) return p.tagLabel;
  const r = p.reward ?? {};
  switch (p.mechanism) {
    case "price-percent": return `−${r.percent ?? 0} %`;
    case "price-amount": return `−${eur(r.amount ?? 0)}`;
    case "n-plus-m": return `${r.buy ?? 1}+${r.get ?? 1}`;
    case "nth-discount": return `${r.nth ?? 2}ο −${r.percent ?? 0} %`;
    case "qty-tiers": { const t = [...(r.tiers ?? [])].sort((a, b) => b.percent - a.percent)[0]; return t ? `−${t.percent} % από ${t.minQty} τεμ.` : p.name; }
    case "gift": return "Δώρο με αγορά";
    case "service": return `Δωρεάν ${serviceTitle?.toLocaleLowerCase("el-GR") ?? "υπηρεσία"}`;
    case "shipping": return "Δωρεάν μεταφορικά";
    default: return p.name;
  }
}

const state = { computedAt: 0, running: null as Promise<unknown> | null };

/** Ο πλήρης υπολογισμός. Επιστρέφει πόσα προϊόντα επηρεάζονται και πόσα άλλαξαν. */
export async function recomputeOffers() {
  if (state.running) return state.running as Promise<{ products: number; withOffer: number; changed: number; removed: number; ms: number }>;
  const run = (async () => {
    const t0 = Date.now();
    const now = new Date();
    invalidatePromos();
    const promos = (await activePromos(now)).filter((p) => !inactiveReason(p, now));
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
      const guest = evaluate([line], mine, { now, customer: { registered: false, isNew: true }, maxLinePct: 40 });
      const member = mine.some((x) => x.rules?.customers === "registered") ? evaluate([line], mine, { now, customer: { registered: true, isNew: false }, maxLinePct: 40 }) : null;
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
  })();
  state.running = run;
  try { return await run; } finally { state.running = null; }
}

/**
 * Χρονοπρογραμματιστής: ανάβει / σβήνει προσφορές στην ώρα τους και ξαναϋπολογίζει ΜΟΝΟ όταν πέρασε κάποια ώρα
 * έναρξης ή λήξης από τον τελευταίο υπολογισμό (ή όταν δεν έχει γίνει ποτέ σε αυτή τη διεργασία).
 */
export async function tickPromos(opts: { force?: boolean } = {}) {
  const now = new Date();
  const [toActive, toEnded] = await db.$transaction([
    db.promotion.updateMany({ where: { status: "scheduled", held: false, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, data: { status: "active" } }),
    db.promotion.updateMany({ where: { status: { in: ["active", "scheduled"] }, endsAt: { lt: now } }, data: { status: "ended" } }),
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
