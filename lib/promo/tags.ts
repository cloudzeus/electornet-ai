import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Ενημερωτικές ετικέτες προϊόντων (όχι προσφορές): Νέο, Best Seller, Top Rated, Αποκλειστικό, Προπαραγγελία.
 * Κάθε ετικέτα είναι «χειροκίνητη» (ο διαχειριστής διαλέγει προϊόντα), «αυτόματη» (κανόνας) ή κλειστή.
 * Αποθηκεύονται ως Tag / ProductTag· η βιτρίνα τις διαβάζει έτοιμες. Οι εμπορικές ετικέτες (−20 %, 1+1, δώρο…)
 * βγαίνουν αυτόματα από τις προσφορές (ProductOffer) και δεν ρυθμίζονται εδώ.
 */

export type TagMode = "off" | "manual" | "auto";
export interface InfoTagDef { slug: string; name: string; rule: string; defaults: { mode: TagMode; days?: number; top?: number; minRating?: number; minReviews?: number } }

export const INFO_TAGS: InfoTagDef[] = [
  { slug: "neo", name: "Νέο", rule: "Πρώτη εμφάνιση στον κατάλογο τις τελευταίες N ημέρες", defaults: { mode: "manual", days: 30 } },
  { slug: "best-seller", name: "Best Seller", rule: "Τα N προϊόντα με τα περισσότερα τεμάχια σε παραγγελίες των τελευταίων 30 ημερών", defaults: { mode: "auto", top: 50, days: 30 } },
  { slug: "top-rated", name: "Top Rated", rule: "Μέση βαθμολογία από X με τουλάχιστον N εγκεκριμένες κριτικές", defaults: { mode: "auto", minRating: 4.5, minReviews: 10 } },
  { slug: "apokleistiko", name: "Αποκλειστικό", rule: "Μόνο χειροκίνητα", defaults: { mode: "manual" } },
  { slug: "proparaggelia", name: "Προπαραγγελία", rule: "Μόνο χειροκίνητα (προϊόντα που δεν κυκλοφόρησαν ακόμη)", defaults: { mode: "manual" } },
];

export type TagConfig = Record<string, InfoTagDef["defaults"]>;
const SECTION = "promo-tags";

export async function getTagConfig(): Promise<TagConfig> {
  const row = await db.setting.findUnique({ where: { section: SECTION } }).catch(() => null);
  const saved = (row?.data as TagConfig | null) ?? {};
  return Object.fromEntries(INFO_TAGS.map((t) => [t.slug, { ...t.defaults, ...(saved[t.slug] ?? {}) }]));
}

export async function saveTagConfig(cfg: TagConfig, staffId: string | null) {
  const clean: TagConfig = {};
  for (const t of INFO_TAGS) {
    const c = cfg[t.slug] ?? t.defaults;
    clean[t.slug] = { mode: (["off", "manual", "auto"] as const).includes(c.mode) ? c.mode : t.defaults.mode, ...(c.days != null ? { days: Math.max(1, Math.min(365, Math.round(c.days))) } : {}), ...(c.top != null ? { top: Math.max(1, Math.min(1000, Math.round(c.top))) } : {}), ...(c.minRating != null ? { minRating: Math.max(1, Math.min(5, c.minRating)) } : {}), ...(c.minReviews != null ? { minReviews: Math.max(1, Math.round(c.minReviews)) } : {}) };
    if (t.slug === "apokleistiko" || t.slug === "proparaggelia") clean[t.slug].mode = clean[t.slug].mode === "auto" ? "manual" : clean[t.slug].mode;
  }
  await db.setting.upsert({ where: { section: SECTION }, create: { section: SECTION, data: clean as unknown as Prisma.InputJsonValue, updatedById: staffId }, update: { data: clean as unknown as Prisma.InputJsonValue, updatedById: staffId } });
  return clean;
}

async function tagId(slug: string) {
  const def = INFO_TAGS.find((t) => t.slug === slug)!;
  return (await db.tag.upsert({ where: { slug }, create: { slug, name: def.name }, update: {} })).id;
}

/** Υπολογίζει ξανά τις αυτόματες ετικέτες· οι χειροκίνητες μένουν ως έχουν, οι κλειστές αδειάζουν. */
export async function refreshInfoTags() {
  const cfg = await getTagConfig();
  const out: Record<string, number> = {};
  for (const t of INFO_TAGS) {
    const c = cfg[t.slug];
    const id = await tagId(t.slug);
    if (c.mode === "manual") { out[t.slug] = await db.productTag.count({ where: { tagId: id } }); continue; }
    let ids: string[] = [];
    if (c.mode === "auto") {
      if (t.slug === "neo") ids = (await db.product.findMany({ where: { active: true, createdAt: { gte: new Date(Date.now() - (c.days ?? 30) * 86400_000) } }, select: { id: true }, take: 2000 })).map((p) => p.id);
      if (t.slug === "best-seller") {
        const since = new Date(Date.now() - (c.days ?? 30) * 86400_000);
        const rows = await db.orderLine.groupBy({ by: ["variantId"], where: { isGift: false, order: { createdAt: { gte: since }, status: { notIn: ["cancelled"] } } }, _sum: { qty: true }, orderBy: { _sum: { qty: "desc" } }, take: c.top ?? 50 });
        const vs = rows.length ? await db.variant.findMany({ where: { id: { in: rows.map((r) => r.variantId).filter((x): x is string => !!x) } }, select: { productId: true } }) : [];
        ids = [...new Set(vs.map((v) => v.productId))];
      }
      if (t.slug === "top-rated") {
        const rows = await db.review.groupBy({ by: ["productId"], where: { status: "approved" }, _avg: { rating: true }, _count: true, having: { rating: { _count: { gte: c.minReviews ?? 10 } } } });
        ids = rows.filter((r) => (r._avg.rating ?? 0) >= (c.minRating ?? 4.5)).map((r) => r.productId);
      }
    }
    await db.$transaction([db.productTag.deleteMany({ where: { tagId: id } }), ...(ids.length ? [db.productTag.createMany({ data: ids.map((productId) => ({ productId, tagId: id })), skipDuplicates: true })] : [])]);
    out[t.slug] = ids.length;
  }
  return out;
}

export async function setManualTag(slug: string, productIds: string[], on: boolean) {
  const id = await tagId(slug);
  if (on) await db.productTag.createMany({ data: productIds.map((productId) => ({ productId, tagId: id })), skipDuplicates: true });
  else await db.productTag.deleteMany({ where: { tagId: id, productId: { in: productIds } } });
}
