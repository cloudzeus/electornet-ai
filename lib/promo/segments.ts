import "server-only";
import { db } from "@/lib/db";

/**
 * Κοινά πελατών (segments). Ένα κοινό είναι ένα σύνολο κριτηρίων που πρέπει να ισχύουν ΟΛΑ μαζί. Η συμμετοχή
 * υπολογίζεται από τα δεδομένα του πελάτη τη στιγμή που χρειάζεται (καλάθι, έκδοση κουπονιών) — δεν αποθηκεύεται
 * λίστα μελών που θα «παλιώσει». Μόνο πελάτες με λογαριασμό ανήκουν σε κοινά.
 */
export interface SegmentRules {
  newsletter?: boolean;
  minOrders?: number;
  maxOrders?: number;
  /** ελάχιστη συνολική αξία παραγγελιών, € */
  minSpent?: number;
  /** παρήγγειλε τις τελευταίες N ημέρες */
  orderedWithinDays?: number;
  /** δεν έχει παραγγείλει τις τελευταίες N ημέρες (ή ποτέ) */
  noOrderForDays?: number;
  /** ΤΚ ή αρχές ΤΚ οποιασδήποτε διεύθυνσης */
  zips?: string[];
  /** βαθμίδα πιστότητας: bronze | silver | gold */
  tiers?: string[];
  /** ετικέτες πελάτη (Customer.tags) */
  tags?: string[];
  /** αγόρασε κάποτε από αυτές τις κατηγορίες (και υποκατηγορίες) */
  boughtCategories?: string[];
  /** γενέθλια μέσα στον τρέχοντα μήνα */
  birthdayThisMonth?: boolean;
  /** λογαριασμός νεότερος από N ημέρες */
  joinedWithinDays?: number;
}

export interface CustomerFacts { id: string; newsletter: boolean; orders: number; spent: number; lastOrderAt: Date | null; zips: string[]; tier: string | null; tags: string[]; cats: Set<string>; birthday: Date | null; createdAt: Date }

const DAY = 86_400_000;

/** Τα στοιχεία που χρειάζονται τα κριτήρια, για πολλούς πελάτες μαζί (λίγα ερωτήματα, όχι ένα ανά πελάτη). */
export async function factsFor(customerIds: string[]): Promise<CustomerFacts[]> {
  if (!customerIds.length) return [];
  const [customers, orders, cats] = await Promise.all([
    db.customer.findMany({ where: { id: { in: customerIds }, status: "active" }, select: { id: true, newsletter: true, loyaltyTier: true, tags: true, birthday: true, createdAt: true, addresses: { select: { zip: true } } } }),
    db.order.groupBy({ by: ["customerId"], where: { customerId: { in: customerIds }, status: { notIn: ["cancelled"] } }, _count: true, _sum: { total: true }, _max: { createdAt: true } }),
    db.$queryRaw<{ customerId: string; categoryId: string }[]>`SELECT DISTINCT o."customerId", p."categoryId" FROM "OrderLine" l JOIN "Order" o ON o.id = l."orderId" JOIN "Variant" v ON v.id = l."variantId" JOIN "Product" p ON p.id = v."productId" WHERE o."customerId" = ANY(${customerIds}) AND o.status <> 'cancelled' AND l."isGift" = false`,
  ]);
  const parents = await categoryParents();
  const byCustomer = new Map<string, Set<string>>();
  for (const r of cats) { const set = byCustomer.get(r.customerId) ?? new Set<string>(); for (let c: string | null | undefined = r.categoryId, g = 0; c && g < 8; c = parents.get(c), g++) set.add(c); byCustomer.set(r.customerId, set); }
  return customers.map((c) => {
    const o = orders.find((x) => x.customerId === c.id);
    return { id: c.id, newsletter: c.newsletter, orders: o?._count ?? 0, spent: Number(o?._sum.total ?? 0), lastOrderAt: o?._max.createdAt ?? null, zips: c.addresses.map((a) => a.zip), tier: c.loyaltyTier, tags: c.tags, cats: byCustomer.get(c.id) ?? new Set(), birthday: c.birthday, createdAt: c.createdAt };
  });
}

let parentCache: { at: number; map: Map<string, string | null> } | null = null;
async function categoryParents() {
  if (!parentCache || Date.now() - parentCache.at > 600_000) parentCache = { at: Date.now(), map: new Map((await db.category.findMany({ select: { id: true, parentId: true } })).map((c) => [c.id, c.parentId])) };
  return parentCache.map;
}

export function matchesSegment(f: CustomerFacts, r: SegmentRules, now = new Date()): boolean {
  if (r.newsletter != null && f.newsletter !== r.newsletter) return false;
  if (r.minOrders != null && f.orders < r.minOrders) return false;
  if (r.maxOrders != null && f.orders > r.maxOrders) return false;
  if (r.minSpent != null && f.spent < r.minSpent) return false;
  if (r.orderedWithinDays != null && (!f.lastOrderAt || now.getTime() - f.lastOrderAt.getTime() > r.orderedWithinDays * DAY)) return false;
  if (r.noOrderForDays != null && f.lastOrderAt && now.getTime() - f.lastOrderAt.getTime() < r.noOrderForDays * DAY) return false;
  if (r.zips?.length && !f.zips.some((z) => r.zips!.some((p) => z.replace(/\s/g, "").startsWith(p)))) return false;
  if (r.tiers?.length && (!f.tier || !r.tiers.includes(f.tier))) return false;
  if (r.tags?.length && !r.tags.some((t) => f.tags.includes(t))) return false;
  if (r.boughtCategories?.length && !r.boughtCategories.some((c) => f.cats.has(c))) return false;
  if (r.birthdayThisMonth && (!f.birthday || f.birthday.getMonth() !== now.getMonth())) return false;
  if (r.joinedWithinDays != null && now.getTime() - f.createdAt.getTime() > r.joinedWithinDays * DAY) return false;
  return true;
}

/** Σε ποια από τα ενεργά κοινά ανήκει ο πελάτης (cache 60 s ανά πελάτη — το καλάθι ρωτά συχνά). */
const memo = new Map<string, { at: number; ids: string[] }>();
export async function segmentsOf(customerId: string | null | undefined): Promise<string[]> {
  if (!customerId) return [];
  const hit = memo.get(customerId);
  if (hit && Date.now() - hit.at < 60_000) return hit.ids;
  const [segs, [facts]] = await Promise.all([db.segment.findMany({ where: { archived: false }, select: { id: true, rules: true } }), factsFor([customerId])]);
  const ids = facts ? segs.filter((s) => matchesSegment(facts, s.rules as SegmentRules)).map((s) => s.id) : [];
  memo.set(customerId, { at: Date.now(), ids });
  if (memo.size > 5000) memo.clear();
  return ids;
}

/** Τα μέλη ενός κοινού (για καταμέτρηση και έκδοση κουπονιών), σε παρτίδες. */
export async function membersOf(rules: SegmentRules, opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 50_000;
  const out: { id: string; email: string | null; firstName: string }[] = [];
  let cursor: string | undefined;
  for (;;) {
    const batch = await db.customer.findMany({ where: { status: "active", anonymisedAt: null }, select: { id: true, email: true, firstName: true }, orderBy: { id: "asc" }, take: 1000, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}) });
    if (!batch.length) break;
    const facts = new Map((await factsFor(batch.map((b) => b.id))).map((f) => [f.id, f]));
    for (const c of batch) { const f = facts.get(c.id); if (f && matchesSegment(f, rules)) out.push(c); if (out.length >= limit) return out; }
    cursor = batch[batch.length - 1].id;
  }
  return out;
}

export function sanitizeRules(r: SegmentRules): SegmentRules {
  const n = (v: unknown) => (v === "" || v == null || !Number.isFinite(Number(v)) ? undefined : Math.max(0, Number(v)));
  const list = (v?: string[]) => { const x = (v ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, 200); return x.length ? x : undefined; };
  const out: SegmentRules = {
    newsletter: typeof r.newsletter === "boolean" ? r.newsletter : undefined,
    minOrders: n(r.minOrders), maxOrders: n(r.maxOrders), minSpent: n(r.minSpent), orderedWithinDays: n(r.orderedWithinDays), noOrderForDays: n(r.noOrderForDays),
    zips: list(r.zips), tiers: list(r.tiers), tags: list(r.tags), boughtCategories: list(r.boughtCategories),
    birthdayThisMonth: r.birthdayThisMonth ? true : undefined, joinedWithinDays: n(r.joinedWithinDays),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as SegmentRules;
}

/** Η περιγραφή των κριτηρίων σε μία πρόταση. */
export function describeSegment(r: SegmentRules, catNames: Record<string, string> = {}): string {
  const p: string[] = [];
  if (r.newsletter === true) p.push("συνδρομητές newsletter"); if (r.newsletter === false) p.push("όχι συνδρομητές newsletter");
  if (r.minOrders != null && r.maxOrders != null) p.push(`${r.minOrders}–${r.maxOrders} παραγγελίες`); else if (r.minOrders != null) p.push(`${r.minOrders}+ παραγγελίες`); else if (r.maxOrders != null) p.push(`έως ${r.maxOrders} παραγγελίες`);
  if (r.minSpent != null) p.push(`αγορές από ${r.minSpent.toLocaleString("el-GR")} €`);
  if (r.orderedWithinDays != null) p.push(`αγόρασαν τις τελευταίες ${r.orderedWithinDays} ημέρες`);
  if (r.noOrderForDays != null) p.push(`χωρίς αγορά ${r.noOrderForDays}+ ημέρες`);
  if (r.zips?.length) p.push(`ΤΚ ${r.zips.join(", ")}`);
  if (r.tiers?.length) p.push(`βαθμίδα ${r.tiers.join("/")}`);
  if (r.tags?.length) p.push(`ετικέτα ${r.tags.join(" ή ")}`);
  if (r.boughtCategories?.length) p.push(`αγόρασαν ${r.boughtCategories.map((c) => catNames[c] ?? "κατηγορία").join(" ή ")}`);
  if (r.birthdayThisMonth) p.push("γενέθλια αυτόν τον μήνα");
  if (r.joinedWithinDays != null) p.push(`νέοι λογαριασμοί (${r.joinedWithinDays} ημέρες)`);
  return p.length ? p.join(" · ") : "όλοι οι πελάτες με λογαριασμό";
}
