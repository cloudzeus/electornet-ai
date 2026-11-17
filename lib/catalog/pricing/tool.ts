import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/rbac/audit";
import { getTable } from "@/lib/softone/lookups";
import { writeWebPrice } from "@/lib/softone/item-write";
import { RETAIL_TRDR } from "@/lib/softone/purchases";
import { readCosts } from "@/lib/competitors/cost";
import { lockIso, refresh, release, touch, writeBlocked } from "@/lib/competitors/bulk";
import { MAX_BATCH } from "@/lib/competitors/bulk-core";
import { kotHref } from "@/lib/competitors/kotsovolos/core";
import { cleanOpts, planPrice, salesStats, type Opts, type Sales, type Trn } from "./tool-core";

/**
 * Τιμολόγηση: τιμή web (NUM04) από το κόστος αγοράς × markup. Όλες οι αναγνώσεις του SoftOne είναι ζωντανές (GetTable):
 * - κόστος: `readCosts` (σταθμισμένο κόστος, ή τελευταία τιμή προμηθευτή όταν συμφωνεί ±15%)
 * - πωλήσεις: κινήσεις είδους MTRTRN (SOSOURCE=1351) των τελευταίων 12 μηνών. TRDR 200 = eshop (λιανική), κάθε άλλος = συνεργάτης.
 *   Το TRNVAL είναι χωρίς ΦΠΑ. Η ίδια πώληση eshop γράφεται σε δύο κινήσεις (δελτίο + απόδειξη), γι' αυτό μετράμε μόνο ΤΙΜΕΣ
 *   (τελευταία, μέση σταθμισμένη) και ποτέ πλήθος τεμαχίων.
 * Η εγγραφή περνά από τον ίδιο μηχανισμό με τη μαζική αλλαγή των Ανταγωνιστών (PriceChangeBatch, κλείδωμα, αναίρεση, ιστορικό).
 */
// shortcut: τα πιστωτικά αναγνωρίζονται από τον τύπο κίνησης 7550 (ο μόνος που είδαμε στα δεδομένα), πρόσθεσε εδώ αν εμφανιστεί άλλος
const CREDIT_TPRMS = new Set(["7550"]);
export const PAGE = MAX_BATCH;

export type PFilter = { categoryId?: string; brandId?: string; q?: string };
export type PricingRow = {
  productId: string; mtrl: number; title: string; sku: string; brand: string;
  /** τιμή web τώρα, με ΦΠΑ */ web: number; vat: number; promo: boolean;
  /** κόστος αγοράς χωρίς ΦΠΑ */ cost: number | null; costSource: string | null;
  /** null = οι πωλήσεις δεν διαβάστηκαν από το SoftOne */ sales: Sales | null;
  /** τιμή πώλησης του Κωτσόβολου (προσφορά, αλλιώς κατάλογος) από τον νυχτερινό έλεγχο· μόνο σίγουρα ζευγάρια που διατίθενται */ kot: { price: number; at: string | null; url: string | null } | null;
};

async function readSales(mtrls: number[], now: Date): Promise<Map<number, Trn[]> | null> {
  const out = new Map<number, Trn[]>();
  if (!mtrls.length) return out;
  const since = new Date(now.getTime() - 366 * 86_400_000).toISOString().slice(0, 10);
  const n = (v: string) => Number(String(v).replace(",", "."));
  try {
    for (const [m, date, trdr, qty, val, tprms] of await getTable("MTRTRN", ["MTRL", "TRNDATE", "TRDR", "QTY1", "TRNVAL", "TPRMS"], `MTRL IN (${mtrls.join(",")}) AND SOSOURCE=1351 AND TRNDATE>='${since}'`)) {
      const d = new Date(date.replace(" ", "T"));
      if (CREDIT_TPRMS.has(tprms) || Number.isNaN(d.getTime())) continue;
      const list = out.get(n(m)) ?? [];
      list.push({ date: d, retail: n(trdr) === RETAIL_TRDR, qty: n(qty), net: n(val) });
      out.set(n(m), list);
    }
  } catch (e) { console.error("[pricing/sales]", e); return null; }
  return out;
}

export async function loadPricing(where: { productIds?: string[]; filter?: PFilter }): Promise<PricingRow[]> {
  const f = where.filter, q = f?.q?.trim();
  if (!where.productIds && !f?.categoryId && !f?.brandId && !q) return [];
  const w: Prisma.ProductWhereInput = { active: true, price: { gt: 0 } };
  if (where.productIds) w.id = { in: where.productIds };
  if (f?.brandId) w.brandId = f.brandId;
  const and: Prisma.ProductWhereInput[] = [];
  if (f?.categoryId) and.push({ OR: [{ categoryId: f.categoryId }, { category: { parentId: f.categoryId } }] });
  if (q) and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] });
  if (and.length) w.AND = and;
  const products = (await db.product.findMany({
    where: w, orderBy: { title: "asc" }, take: PAGE,
    select: { id: true, erpCode: true, title: true, sku: true, price: true, vatRate: true, brand: { select: { name: true } }, offer: { select: { promotionId: true } }, competitorPrices: { where: { competitor: "kotsovolos", match: { in: ["auto", "manual"] }, extId: { not: null }, available: true }, select: { listPrice: true, offerPrice: true, checkedAt: true, extUrl: true } } },
  })).map((p) => ({ ...p, mtrl: Number(p.erpCode) })).filter((p) => Number.isInteger(p.mtrl) && p.mtrl > 0);
  const now = new Date(), mtrls = products.map((p) => p.mtrl);
  const [costs, sales] = await Promise.all([readCosts(mtrls), readSales(mtrls, now)]);
  return products.map((p) => {
    const vat = Number(p.vatRate), c = costs?.get(p.mtrl), k = p.competitorPrices[0], kp = Number(k?.offerPrice ?? k?.listPrice ?? 0);
    return {
      productId: p.id, mtrl: p.mtrl, title: p.title, sku: p.sku, brand: p.brand.name, web: p.price!, vat, promo: !!p.offer?.promotionId,
      cost: c?.cost ?? null, costSource: c?.source ?? null, sales: sales ? salesStats(sales.get(p.mtrl) ?? [], vat, now) : null,
      kot: kp > 0 ? { price: kp, at: k.checkedAt?.toISOString() ?? null, url: kotHref(k.extUrl) } : null,
    };
  });
}

/** Ετοιμάζει την παρτίδα: το markup κάθε προϊόντος ξαναϋπολογίζεται στον server με φρέσκο κόστος· ό,τι δεν αλλάζει πια μένει έξω. */
export async function startPricing(items: { productId: string; percent?: number; price?: number }[], opts: Opts, userId: string): Promise<{ batchId: string; total: number }> {
  if (items.length > MAX_BATCH) throw new Error(`Έως ${MAX_BATCH} προϊόντα τη φορά.`);
  const blocked = await writeBlocked();
  if (blocked) throw new Error(blocked);
  const pct = new Map(items.map((i) => [i.productId, i]));
  const lines = (await loadPricing({ productIds: [...pct.keys()] })).flatMap((r) => {
    const i = pct.get(r.productId), plan = planPrice(r, i?.percent ?? null, opts, i?.price);
    return "newPrice" in plan ? [{ productId: r.productId, mtrl: String(r.mtrl), oldPrice: r.web, newPrice: plan.newPrice }] : [];
  });
  if (!lines.length) throw new Error("Κανένα από τα επιλεγμένα δεν αλλάζει πια. Φόρτωσε ξανά τη λίστα.");
  const batch = await db.priceChangeBatch.create({ data: { userId, rule: { pricing: true, ...opts, lockUntil: lockIso() }, lines: { create: lines } } });
  return { batchId: batch.id, total: lines.length };
}

/** Γράφει μία-μία τις γραμμές· `expect` = η τιμή web που είδε ο χρήστης (αν άλλαξε στο μεταξύ, το είδος δεν γράφεται). */
export async function runPricing(batchId: string, userId: string) {
  let ok = 0, failed = 0;
  try {
    for (const l of await db.priceChangeLine.findMany({ where: { batchId, ok: false, error: null } })) {
      await touch(batchId);
      const w = await writeWebPrice(Number(l.mtrl), Number(l.newPrice), { mode: "any", expect: Number(l.oldPrice) }).catch((e: Error) => ({ ok: false, error: e.message }));
      if (w.ok) { ok++; await refresh(Number(l.mtrl)); } else failed++;
      await db.priceChangeLine.update({ where: { id: l.id }, data: { ok: w.ok, error: w.ok ? null : (w.error ?? "Άγνωστο σφάλμα") } }).catch(() => {});
    }
  } finally {
    await db.priceChangeLine.updateMany({ where: { batchId, ok: false, error: null }, data: { error: "Διακόπηκε, δεν γράφτηκε" } }).catch(() => {});
    await release(batchId).catch(() => {});
    await audit(userId, "pricing.apply", "PriceChangeBatch", batchId, null, { ok, failed });
  }
}

/** Οι γραμμές μιας παρτίδας για τον πίνακα πορείας: τι γράφτηκε, τι περιμένει, τι απέτυχε και γιατί. */
export async function batchLines(batchId: string) {
  const lines = await db.priceChangeLine.findMany({ where: { batchId }, orderBy: { id: "asc" }, select: { id: true, oldPrice: true, newPrice: true, ok: true, error: true, undoOk: true, product: { select: { title: true } } } });
  return lines.map((l) => ({ id: l.id, title: l.product.title, oldPrice: Number(l.oldPrice), newPrice: Number(l.newPrice), ok: l.ok, error: l.error, undoOk: l.undoOk }));
}
export type BatchLine = Awaited<ReturnType<typeof batchLines>>[number];

export { cleanOpts };
