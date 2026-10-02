"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, hasPermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { analyzeDraft, approvePromotion, bulkPromotions, refreshStorefront, savePromotion, type BulkAction, type DraftAnalysis, type PromoDraft, type SaveIntent, type SaveResult } from "@/lib/promo/admin";
import { savePromoPolicy, type PromoPolicy } from "@/lib/promo/policy";

const PERM = "catalog.promos.write";

export async function analyzeAction(d: PromoDraft): Promise<DraftAnalysis> {
  await requirePermission(PERM);
  return analyzeDraft(d);
}

export async function saveAction(d: PromoDraft, intent: SaveIntent): Promise<SaveResult> {
  const user = await requirePermission(PERM);
  const before = d.id ? await db.promotion.findUnique({ where: { id: d.id }, include: { targets: true } }) : null;
  const r = await savePromotion(d, { id: user.id, canApprove: hasPermission(user, "catalog.promos.approve") }, intent);
  if (r.ok) {
    await audit(user.id, d.id ? (intent === "publish" ? "promo.publish" : "promo.update") : intent === "publish" ? "promo.create+publish" : "promo.create", "Promotion", r.id, before, { ...d, status: r.status });
    revalidatePath("/admin/prosfores");
  }
  return r;
}

export async function approveAction(id: string) {
  const user = await requirePermission("catalog.promos.approve");
  const r = await approvePromotion(id, user.id);
  if (r.ok) { await audit(user.id, "promo.approve", "Promotion", id, null, { status: r.status }); revalidatePath("/admin/prosfores"); }
  return r;
}

export async function bulkAction(ids: string[], action: BulkAction) {
  const user = await requirePermission(action === "reject" ? "catalog.promos.approve" : PERM);
  const changed = await bulkPromotions(ids, action, user.id);
  await audit(user.id, `promo.bulk.${action}`, "Promotion", null, null, { ids, changed });
  revalidatePath("/admin/prosfores");
  return { changed };
}

/** Αναζήτηση στόχων για τον οδηγό: προϊόντα (τίτλος, κωδικός, EAN), μάρκες, κατηγορίες. */
export async function searchTargetsAction(kind: "product" | "brand" | "category", q: string) {
  await requirePermission(PERM);
  const s = q.trim();
  if (kind === "product") {
    if (s.length < 2) return [];
    const rows = await db.product.findMany({ where: { active: true, OR: [{ title: { contains: s, mode: "insensitive" } }, { sku: { contains: s, mode: "insensitive" } }, { ean: s }, { erpCode: s }] }, take: 20, orderBy: { title: "asc" }, select: { id: true, title: true, sku: true, price: true, brand: { select: { name: true } } } });
    return rows.map((r) => ({ id: r.id, label: r.title, sub: `${r.brand.name} · ${r.sku}${r.price ? ` · ${r.price.toLocaleString("el-GR")} €` : ""}` }));
  }
  if (kind === "brand") {
    const rows = await db.brand.findMany({ where: s ? { name: { contains: s, mode: "insensitive" } } : {}, take: 30, orderBy: { name: "asc" }, select: { id: true, name: true, _count: { select: { products: true } } } });
    return rows.map((r) => ({ id: r.id, label: r.name, sub: `${r._count.products.toLocaleString("el-GR")} προϊόντα` }));
  }
  const rows = await db.category.findMany({ where: { active: true, ...(s ? { name: { contains: s, mode: "insensitive" } } : { depth: { lte: 1 } }) }, take: 40, orderBy: [{ depth: "asc" }, { sortNo: "asc" }], select: { id: true, name: true, depth: true, parent: { select: { name: true } } } });
  return rows.map((r) => ({ id: r.id, label: r.name, sub: r.parent ? `στο ${r.parent.name}` : "κύρια κατηγορία" }));
}

/** Όλες οι κύριες κατηγορίες — για «όλο το κατάστημα». */
export async function rootCategoriesAction() {
  await requirePermission(PERM);
  return db.category.findMany({ where: { depth: 0, active: true }, select: { id: true, name: true } });
}

export async function savePolicyAction(p: PromoPolicy) {
  const user = await requirePermission(PERM);
  const before = await db.setting.findUnique({ where: { section: "promos" } });
  const saved = await savePromoPolicy(p, user.id);
  refreshStorefront();
  await audit(user.id, "promo.policy", "Setting", "promos", before?.data ?? null, saved);
  revalidatePath("/admin/prosfores/kanones");
  return saved;
}

export interface SimInput {
  items: { productId: string; qty: number }[];
  coupon: string | null;
  customer: "guest" | "new" | "registered";
  zip: string | null; payment: string | null; delivery: "courier" | "click-collect" | "appointment";
  at: string | null;
  /** και μη δημοσιευμένες (πρόχειρες, σε αναμονή έγκρισης, σε παύση) */
  drafts: boolean;
}

/** Προσομοιωτής: το ίδιο καλάθι με την ίδια μηχανή, σε όποια ημερομηνία και για όποιον πελάτη — με ίχνος. */
export async function simulateAction(input: SimInput) {
  await requirePermission(PERM);
  const { linesFor, promosWith, resolveCoupon } = await import("@/lib/promo/server");
  const { evaluate } = await import("@/lib/promo/engine");
  const { getPromoPolicy } = await import("@/lib/promo/policy");
  const now = input.at ? new Date(input.at) : new Date();
  const items = input.items.filter((i) => i.qty > 0).slice(0, 30).map((i, k) => ({ key: `l${k}`, productId: i.productId, qty: Math.min(99, Math.floor(i.qty)) }));
  const [{ lines, missing }, promos, policy] = await Promise.all([linesFor(items), promosWith(input.drafts ? ["active", "scheduled", "paused", "pending", "draft"] : ["active", "scheduled"]), getPromoPolicy()]);
  const coupon = await resolveCoupon(input.coupon, {});
  // σε προσομοίωση οι μη δημοσιευμένες λογίζονται «ενεργές» ώστε να φανεί τι θα έκαναν
  const pool = promos.map((p) => (input.drafts && ["paused", "pending", "draft"].includes(p.status) ? { ...p, status: "active", name: `${p.name} (${p.status === "draft" ? "πρόχειρη" : p.status === "pending" ? "σε αναμονή" : "σε παύση"})` } : p));
  const r = evaluate(lines, pool, {
    now, customer: { registered: input.customer !== "guest", isNew: input.customer !== "registered" },
    channel: input.delivery === "click-collect" ? "click-collect" : "online", zip: input.zip, payment: input.payment, delivery: input.delivery,
    coupon: coupon && coupon.problem && coupon.problem.includes("προσωπικός") ? { ...coupon, problem: undefined } : coupon, maxLinePct: policy.maxLinePct, costFloor: policy.belowCost === "block",
  });
  const giftIds = r.gifts.map((g) => g.productId);
  const giftTitles = new Map((giftIds.length ? await db.product.findMany({ where: { id: { in: giftIds } }, select: { id: true, title: true } }) : []).map((g) => [g.id, g.title]));
  return {
    missing, at: now.toISOString(),
    lines: r.lines.map((l) => { const info = lines.find((x) => x.key === l.key)!; return { title: info.title, brand: info.brand, qty: l.qty, listTotal: l.listTotal, discPrice: l.discPrice, discCoupon: l.discCoupon, total: l.total, capped: l.capped ?? null, labels: l.adjustments.map((a) => `${a.label} (${a.code} v${a.version})`) }; }),
    listTotal: r.listTotal, discPrice: r.discPrice, discCoupon: r.discCoupon, total: r.total,
    couponApplied: r.couponApplied, couponMessage: r.couponMessage,
    gifts: r.gifts.map((g) => ({ label: g.label, title: giftTitles.get(g.productId) ?? g.productId, qty: g.qty })),
    services: r.services.map((s) => ({ label: s.label, slug: s.slug })), freeShipping: r.freeShipping?.label ?? null, hints: r.hints,
    trace: r.trace.map((t) => ({ name: t.name, code: t.code, applied: t.applied, amount: t.amount, reason: t.reason })),
  };
}
export type SimResult = Awaited<ReturnType<typeof simulateAction>>;

export async function couponBatchAction(input: { promotionId: string; count: number; prefix: string; validDays: number | null }) {
  const user = await requirePermission(PERM);
  const { createCouponBatch } = await import("@/lib/promo/issue");
  const r = await createCouponBatch({ ...input, staffId: user.id });
  revalidatePath("/admin/prosfores/kouponia");
  if (!r.ok) return r;
  const csv = ["code,promotion,expires", ...r.codes.map((c) => `${c},${r.promotion},${r.expiresAt ? r.expiresAt.toISOString().slice(0, 10) : ""}`)].join("\n");
  return { ok: true as const, count: r.codes.length, csv };
}

export async function issueCouponAction(input: { promotionCode: string; email: string; send: boolean }) {
  const user = await requirePermission(PERM);
  const { issueCoupon } = await import("@/lib/promo/issue");
  const r = await issueCoupon({ promotionCode: input.promotionCode, trigger: "manual", email: input.email, send: input.send, staffId: user.id });
  revalidatePath("/admin/prosfores/kouponia");
  return r.ok ? { ok: true as const, code: r.coupon.code, created: r.created } : { ok: false as const, error: r.reason };
}

/** Απενεργοποίηση κωδικού: λήγει τώρα (δεν σβήνεται — μένει στις αναφορές). */
export async function expireCouponAction(id: string) {
  const user = await requirePermission(PERM);
  const c = await db.coupon.update({ where: { id }, data: { expiresAt: new Date() } });
  await audit(user.id, "coupon.expire", "Coupon", id, null, { code: c.code });
  revalidatePath("/admin/prosfores/kouponia");
  return { ok: true };
}

export async function saveTagConfigAction(cfg: import("@/lib/promo/tags").TagConfig) {
  const user = await requirePermission(PERM);
  const { saveTagConfig, refreshInfoTags } = await import("@/lib/promo/tags");
  const saved = await saveTagConfig(cfg, user.id);
  const counts = await refreshInfoTags();
  await audit(user.id, "tags.config", "Setting", "promo-tags", null, saved);
  revalidatePath("/admin/prosfores/etiketes");
  return counts;
}

export async function setManualTagAction(slug: string, productIds: string[], on: boolean) {
  const user = await requirePermission(PERM);
  const { setManualTag } = await import("@/lib/promo/tags");
  await setManualTag(slug, productIds.slice(0, 500), on);
  await audit(user.id, on ? "tags.add" : "tags.remove", "Tag", slug, null, { productIds });
  revalidatePath("/admin/prosfores/etiketes");
  return { ok: true };
}
