import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/rbac/audit";
import { itemWriteEnabled, webPriceWriteEnabled, writeWebPrice, WEB_PRICE_OFF } from "@/lib/softone/item-write";
import { WEB_PRICE_CHANGED } from "@/lib/softone/web-price-core";
import { MAX_BATCH, planRow, SKIP, type Plan, type Row, type Rule } from "./bulk-core";
import { ourPrice } from "./run-core";

/**
 * Μαζική αλλαγή τιμής web (NUM04) με βάση την τιμή του Κωτσόβολου. Μόνο ζευγάρια auto/manual· κόστος από το αποθηκευμένο
 * CompetitorPrice.cost (νυχτερινή εργασία, Ruling 5), ποτέ ζωντανή ανάγνωση. Η εγγραφή γίνεται μόνο μέσω writeWebPrice, ένα-ένα,
 * με `expect` = η τιμή web που είδαμε (Ruling 2). Το δικαίωμα catalog.sync.run το ελέγχει ο caller (server action).
 */
const COMP = "kotsovolos";
export type Filter = { categoryId?: string; brandId?: string; productId?: string; onlyExpensive: boolean };
export type PreviewRow = {
  productId: string; title: string; brand: string; now: number; web: number; theirs: number; checkedAt: string;
  cost: number | null; costSource: string | null; costAt: string | null; plan: Plan;
};

/** Γιατί δεν γίνεται εγγραφή τώρα (null = ανοιχτά και τα δύο διακόπτες). */
export async function writeBlocked(): Promise<string | null> {
  if (!webPriceWriteEnabled()) return WEB_PRICE_OFF;
  if (!(await itemWriteEnabled())) return "Η εγγραφή στο SoftOne είναι κλειστή (Ρυθμίσεις → SoftOne → Αλλαγές προϊόντων προς SoftOne).";
  return null;
}

const n = (v: { toString(): string } | null | undefined) => (v == null ? null : Number(v.toString()));

async function loadRows(where: { productIds?: string[]; filter?: Filter }) {
  const f = where.filter;
  const prices = await db.competitorPrice.findMany({
    where: {
      competitor: COMP, match: { in: ["auto", "manual"] }, extId: { not: null },
      productId: where.productIds ? { in: where.productIds } : f?.productId,
      product: { active: true, ...(f?.categoryId ? { categoryId: f.categoryId } : {}), ...(f?.brandId ? { brandId: f.brandId } : {}) },
    },
    select: {
      listPrice: true, offerPrice: true, available: true, checkedAt: true, cost: true, costSource: true, costAt: true,
      product: { select: { id: true, erpCode: true, title: true, price: true, vatRate: true, brand: { select: { name: true } }, offer: { select: { price: true, promotionId: true } } } },
    },
    orderBy: { diffPct: { sort: "desc", nulls: "last" } },
    take: 2000,
  });
  const out: (Row & { title: string; brand: string; costSource: string | null })[] = [];
  for (const c of prices) {
    const p = c.product, theirs = n(c.offerPrice) ?? n(c.listPrice), now = ourPrice(p), mtrl = Number(p.erpCode);
    if (theirs == null || theirs <= 0 || now == null || now <= 0 || p.price == null || p.price <= 0 || !Number.isInteger(mtrl) || mtrl <= 0) continue;
    if (f?.onlyExpensive && !(now > theirs)) continue;
    const netCost = n(c.cost);
    out.push({
      productId: p.id, mtrl, now, web: p.price, theirs, checkedAt: c.checkedAt ?? new Date(0), available: c.available, promo: !!p.offer?.promotionId,
      // το κόστος αγοράς είναι χωρίς ΦΠΑ, οι τιμές μας με ΦΠΑ — σύγκριση στην ίδια βάση
      cost: netCost == null ? null : Math.round(netCost * (1 + Number(p.vatRate) / 100) * 100) / 100, costAt: c.costAt,
      title: p.title, brand: p.brand.name, costSource: c.costSource,
    });
  }
  return out;
}

export async function previewBulk(filter: Filter, rule: Rule): Promise<PreviewRow[]> {
  const at = new Date();
  return (await loadRows({ filter })).map((r) => ({
    productId: r.productId, title: r.title, brand: r.brand, now: r.now, web: r.web, theirs: r.theirs, checkedAt: r.checkedAt.toISOString(),
    cost: r.cost, costSource: r.costSource, costAt: r.costAt?.toISOString() ?? null, plan: planRow(r, rule, at),
  }));
}

/** Γράφει μία-μία τις νέες τιμές· ο κανόνας ξανατρέχει εδώ με φρέσκα δεδομένα (δεν εμπιστευόμαστε τις τιμές του client). */
export async function applyBulk(productIds: string[], rule: Rule, userId: string): Promise<{ batchId: string; ok: number; failed: number }> {
  const ids = [...new Set(productIds)];
  if (ids.length > MAX_BATCH) throw new Error(`Έως ${MAX_BATCH} προϊόντα τη φορά — διάλεξε λιγότερα.`);
  const blocked = await writeBlocked();
  if (blocked) throw new Error(blocked);
  const rows = new Map((await loadRows({ productIds: ids })).map((r) => [r.productId, r]));
  const batch = await db.priceChangeBatch.create({ data: { userId, rule } });
  let ok = 0, failed = 0;
  for (const id of ids) {
    const r = rows.get(id);
    if (!r) { failed++; continue; }
    // η τιμή web ξαναδιαβάζεται ακριβώς πριν την εγγραφή
    const web = (await db.product.findUnique({ where: { id }, select: { price: true } }))?.price ?? null;
    const base = { batchId: batch.id, productId: id, mtrl: String(r.mtrl), oldPrice: web ?? 0 };
    const plan: Plan = web == null ? { skip: "same" } : planRow({ ...r, web }, rule, new Date());
    if (web == null || "skip" in plan) {
      failed++;
      await db.priceChangeLine.create({ data: { ...base, newPrice: web ?? 0, ok: false, error: web == null || !("skip" in plan) ? "Χωρίς τιμή web" : `Δεν άλλαξε: ${SKIP[plan.skip].label}` } });
      continue;
    }
    const w = await writeWebPrice(r.mtrl, plan.newPrice, { mode: "any", expect: web }).catch((e: Error) => ({ ok: false, error: e.message }));
    if (w.ok) ok++; else failed++;
    await db.priceChangeLine.create({ data: { ...base, newPrice: plan.newPrice, ok: w.ok, error: w.ok ? null : (w.error ?? "Άγνωστο σφάλμα") } });
  }
  await audit(userId, "competitor.bulkPrice.apply", "PriceChangeBatch", batch.id, null, { rule, requested: ids.length, ok, failed });
  return { batchId: batch.id, ok, failed };
}

/** Γράφει πίσω την παλιά τιμή μόνο όπου η τρέχουσα τιμή web είναι ακόμη η δική μας νέα. */
export async function undoBatch(batchId: string, userId: string): Promise<{ undone: number; failed: number }> {
  const blocked = await writeBlocked();
  if (blocked) throw new Error(blocked);
  // κλείδωμα: μόνο μία αναίρεση ανά παρτίδα
  const { count } = await db.priceChangeBatch.updateMany({ where: { id: batchId, undoneAt: null }, data: { undoneAt: new Date() } });
  if (!count) throw new Error("Η παρτίδα δεν υπάρχει ή έχει ήδη αναιρεθεί.");
  const lines = await db.priceChangeLine.findMany({ where: { batchId, ok: true, undoOk: null } });
  let undone = 0, failed = 0;
  for (const l of lines) {
    const w = await writeWebPrice(Number(l.mtrl), Number(l.oldPrice), { mode: "any", expect: Number(l.newPrice) }).catch((e: Error) => ({ ok: false, error: e.message }));
    if (w.ok) undone++; else failed++;
    await db.priceChangeLine.update({ where: { id: l.id }, data: { undoOk: w.ok, ...(w.ok ? {} : { error: w.error?.startsWith(WEB_PRICE_CHANGED) ? "άλλαξε από άλλον" : (w.error ?? "Άγνωστο σφάλμα") }) } });
  }
  await audit(userId, "competitor.bulkPrice.undo", "PriceChangeBatch", batchId, null, { undone, failed });
  return { undone, failed };
}

/** Οι τελευταίες παρτίδες για το ιστορικό. */
export async function listBatches(take = 10) {
  const batches = await db.priceChangeBatch.findMany({
    orderBy: { createdAt: "desc" }, take,
    select: { id: true, createdAt: true, undoneAt: true, user: { select: { name: true } }, lines: { select: { ok: true, undoOk: true, oldPrice: true, newPrice: true, error: true, product: { select: { title: true } } } } },
  });
  return batches.map((b) => ({
    id: b.id, createdAt: b.createdAt.toISOString(), undoneAt: b.undoneAt?.toISOString() ?? null, user: b.user?.name ?? null,
    ok: b.lines.filter((l) => l.ok).length, failed: b.lines.filter((l) => !l.ok).length,
    undoFailed: b.lines.filter((l) => l.undoOk === false).length,
    totalEur: Math.round(b.lines.filter((l) => l.ok).reduce((s, l) => s + Number(l.newPrice) - Number(l.oldPrice), 0) * 100) / 100,
    errors: b.lines.filter((l) => l.error).slice(0, 5).map((l) => `${l.product.title}: ${l.error}`),
  }));
}
export type BatchView = Awaited<ReturnType<typeof listBatches>>[number];

/** Επιλογές φίλτρων: κατηγορίες και μάρκες που έχουν ζευγάρι. */
export async function filterOptions() {
  const rows = await db.competitorPrice.findMany({
    where: { competitor: COMP, match: { in: ["auto", "manual"] }, product: { active: true } },
    select: { product: { select: { category: { select: { id: true, name: true, parent: { select: { name: true } } } }, brand: { select: { id: true, name: true } } } } },
  });
  const cats = new Map<string, string>(), brands = new Map<string, string>();
  for (const { product: p } of rows) {
    cats.set(p.category.id, p.category.parent ? `${p.category.parent.name} › ${p.category.name}` : p.category.name);
    brands.set(p.brand.id, p.brand.name);
  }
  const sort = (m: Map<string, string>) => [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "el"));
  return { categories: sort(cats), brands: sort(brands) };
}
