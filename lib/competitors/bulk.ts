import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/rbac/audit";
import { itemWriteEnabled, webPriceWriteEnabled, writeWebPrice, WEB_PRICE_OFF } from "@/lib/softone/item-write";
import { WEB_PRICE_CHANGED } from "@/lib/softone/web-price-core";
import { syncItem } from "@/lib/softone/catalog";
import { projectItem } from "@/lib/softone/project";
import { batchProgress, cleanRule, MAX_BATCH, planRow, SKIP, type Plan, type Row, type Rule } from "./bulk-core";
import { ourPrice } from "./run-core";

/**
 * Μαζική αλλαγή τιμής web (NUM04) με βάση την τιμή του Κωτσόβολου. Μόνο ζευγάρια auto/manual· κόστος από το αποθηκευμένο
 * CompetitorPrice.cost (νυχτερινή εργασία, Ruling 5), ποτέ ζωντανή ανάγνωση. Η εγγραφή γίνεται μόνο μέσω writeWebPrice, ένα-ένα,
 * με `expect` = η τιμή web που είδαμε (Ruling 2). Το δικαίωμα catalog.sync.run το ελέγχει ο caller (server action).
 * Εφαρμογή/αναίρεση: το start* ετοιμάζει τις γραμμές και επιστρέφει αμέσως· το run* τρέχει μετά την απάντηση (after()) και
 * η σελίδα δείχνει την πρόοδο από τις PriceChangeLine. Κλείδωμα ανά παρτίδα στο `rule.lockUntil` (χωρίς αλλαγή σχήματος).
 */
const COMP = "kotsovolos";
export type Filter = { categoryId?: string; brandId?: string; productId?: string; onlyExpensive: boolean };
export type PreviewRow = {
  productId: string; title: string; brand: string; now: number; web: number; theirs: number; checkedAt: string;
  cost: number | null; costSource: string | null; costAt: string | null; plan: Plan;
  /** σελίδα του προϊόντος στον Κωτσόβολο */ url: string | null;
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
      listPrice: true, offerPrice: true, available: true, checkedAt: true, cost: true, costSource: true, costAt: true, extUrl: true,
      product: { select: { id: true, erpCode: true, title: true, price: true, vatRate: true, brand: { select: { name: true } }, offer: { select: { price: true, promotionId: true } } } },
    },
    orderBy: { diffPct: { sort: "desc", nulls: "last" } },
    take: 2000,
  });
  const out: (Row & { title: string; brand: string; costSource: string | null; url: string | null })[] = [];
  for (const c of prices) {
    const p = c.product, theirs = n(c.offerPrice) ?? n(c.listPrice), now = ourPrice(p), mtrl = Number(p.erpCode);
    if (theirs == null || theirs <= 0 || now == null || now <= 0 || p.price == null || p.price <= 0 || !Number.isInteger(mtrl) || mtrl <= 0) continue;
    if (f?.onlyExpensive && !(now > theirs)) continue;
    const netCost = n(c.cost);
    out.push({
      productId: p.id, mtrl, now, web: p.price, theirs, checkedAt: c.checkedAt ?? new Date(0), available: c.available, promo: !!p.offer?.promotionId,
      // το κόστος αγοράς είναι χωρίς ΦΠΑ, οι τιμές μας με ΦΠΑ — σύγκριση στην ίδια βάση
      cost: netCost == null ? null : Math.round(netCost * (1 + Number(p.vatRate) / 100) * 100) / 100, costAt: c.costAt,
      title: p.title, brand: p.brand.name, costSource: c.costSource, url: c.extUrl ? `https://www.kotsovolos.gr/${c.extUrl.replace(/^\/+/, "")}` : null,
    });
  }
  return out;
}

export async function previewBulk(filter: Filter, rule: Rule): Promise<PreviewRow[]> {
  const at = new Date();
  return (await loadRows({ filter })).map((r) => ({
    productId: r.productId, title: r.title, brand: r.brand, now: r.now, web: r.web, theirs: r.theirs, checkedAt: r.checkedAt.toISOString(),
    cost: r.cost, costSource: r.costSource, costAt: r.costAt?.toISOString() ?? null, plan: planRow(r, rule, at), url: r.url,
  }));
}

const LOCK_MS = 15 * 60_000;
const lockIso = () => new Date(Date.now() + LOCK_MS).toISOString();
/** Ατομικό κλείδωμα της παρτίδας: μόνο αν δεν τρέχει ήδη κάτι (ή το κλείδωμα έληξε μετά από crash). */
async function claim(batchId: string) {
  const rows = await db.$queryRaw<{ id: string }[]>`UPDATE "PriceChangeBatch" SET "rule" = jsonb_set("rule", '{lockUntil}', to_jsonb(${lockIso()}::text))
    WHERE "id" = ${batchId} AND (("rule"->>'lockUntil') IS NULL OR ("rule"->>'lockUntil')::timestamptz < ${new Date().toISOString()}::timestamptz) RETURNING "id"`;
  return rows.length === 1;
}
const touch = (batchId: string) => db.$executeRaw`UPDATE "PriceChangeBatch" SET "rule" = jsonb_set("rule", '{lockUntil}', to_jsonb(${lockIso()}::text)) WHERE "id" = ${batchId}`;
const release = (batchId: string) => db.$executeRaw`UPDATE "PriceChangeBatch" SET "rule" = "rule" - 'lockUntil' WHERE "id" = ${batchId}`;
const lockOf = (rule: unknown) => { const v = (rule as { lockUntil?: unknown } | null)?.lockUntil; return typeof v === "string" ? new Date(v) : null; };

/** Μετά από επαληθευμένη εγγραφή: ο καθρέφτης και το κατάστημα παίρνουν αμέσως την τιμή (όπως η εισαγωγή προϊόντων). */
async function refresh(mtrl: number) {
  try { await syncItem(mtrl, "manual"); await projectItem(mtrl); } catch (e) { console.error("[bulk-price/sync]", mtrl, e); }
}

/** Ετοιμάζει την παρτίδα (μία γραμμή σε αναμονή ανά προϊόν που αλλάζει) και την κλειδώνει. Προϊόν που χάθηκε ή δεν αλλάζει πια δεν μπαίνει. */
export async function startApply(productIds: string[], rule: Rule, userId: string): Promise<{ batchId: string; total: number }> {
  const ids = [...new Set(productIds)];
  if (ids.length > MAX_BATCH) throw new Error(`Έως ${MAX_BATCH} προϊόντα τη φορά — διάλεξε λιγότερα.`);
  const blocked = await writeBlocked();
  if (blocked) throw new Error(blocked);
  const rows = new Map((await loadRows({ productIds: ids })).map((r) => [r.productId, r]));
  const at = new Date();
  const lines = ids.flatMap((id) => {
    const r = rows.get(id), plan = r ? planRow(r, rule, at) : null;
    return r && plan && "newPrice" in plan ? [{ productId: id, mtrl: String(r.mtrl), oldPrice: r.web, newPrice: plan.newPrice }] : [];
  });
  if (!lines.length) throw new Error("Κανένα από τα επιλεγμένα δεν αλλάζει πια — ξαναδές την προεπισκόπηση.");
  const batch = await db.priceChangeBatch.create({ data: { userId, rule: { ...rule, lockUntil: lockIso() }, lines: { create: lines } } });
  return { batchId: batch.id, total: lines.length };
}

/** Γράφει μία-μία τις γραμμές σε αναμονή· ο κανόνας ξανατρέχει με φρέσκα δεδομένα. Ποτέ δεν σταματά όλη την παρτίδα για μία αποτυχία. */
export async function runApply(batchId: string, userId: string) {
  let ok = 0, failed = 0;
  try {
    const batch = await db.priceChangeBatch.findUnique({ where: { id: batchId }, select: { rule: true } });
    const rule = cleanRule(batch?.rule);
    if (!rule) throw new Error("Άγνωστη παρτίδα ή κανόνας.");
    for (const l of await db.priceChangeLine.findMany({ where: { batchId, ok: false, error: null } })) {
      await touch(batchId);
      try {
        // η τιμή web ξαναδιαβάζεται ακριβώς πριν την εγγραφή
        const r = (await loadRows({ productIds: [l.productId] }))[0];
        const plan: Plan = r ? planRow(r, rule, new Date()) : { skip: "gone" };
        if (!r || "skip" in plan) {
          failed++;
          await db.priceChangeLine.update({ where: { id: l.id }, data: { error: !r ? "Δεν βρέθηκε πια το ζευγάρι ή η τιμή" : `Δεν άλλαξε: ${SKIP[(plan as { skip: keyof typeof SKIP }).skip].label}` } });
          continue;
        }
        const w = await writeWebPrice(r.mtrl, plan.newPrice, { mode: "any", expect: r.web });
        if (w.ok) { ok++; await refresh(r.mtrl); } else failed++;
        await db.priceChangeLine.update({ where: { id: l.id }, data: { oldPrice: r.web, newPrice: plan.newPrice, ok: w.ok, error: w.ok ? null : (w.error ?? "Άγνωστο σφάλμα") } });
      } catch (e) {
        failed++;
        await db.priceChangeLine.update({ where: { id: l.id }, data: { error: e instanceof Error ? e.message : "Άγνωστο σφάλμα" } }).catch(() => {});
      }
    }
  } finally {
    // ό,τι έμεινε σε αναμονή (crash) δεν γράφτηκε
    await db.priceChangeLine.updateMany({ where: { batchId, ok: false, error: null }, data: { error: "Διακόπηκε — δεν γράφτηκε" } }).catch(() => {});
    await release(batchId).catch(() => {});
    await audit(userId, "competitor.bulkPrice.apply", "PriceChangeBatch", batchId, null, { ok, failed });
  }
}

/** Κλειδώνει την παρτίδα για αναίρεση· όσες αναιρέσεις απέτυχαν ξαναμπαίνουν στη σειρά (ξαναδοκιμή). */
export async function startUndo(batchId: string): Promise<{ total: number }> {
  const blocked = await writeBlocked();
  if (blocked) throw new Error(blocked);
  if (!(await claim(batchId))) throw new Error("Η παρτίδα δεν υπάρχει ή τρέχει ήδη — περίμενε να τελειώσει.");
  await db.priceChangeLine.updateMany({ where: { batchId, ok: true, undoOk: false }, data: { undoOk: null, error: null } });
  const total = await db.priceChangeLine.count({ where: { batchId, ok: true, undoOk: null } });
  if (!total) { await release(batchId); throw new Error("Δεν έμεινε τίποτα να αναιρεθεί."); }
  return { total };
}

/** Γράφει πίσω την παλιά τιμή μόνο όπου η τρέχουσα τιμή web είναι ακόμη η δική μας νέα. */
export async function runUndo(batchId: string, userId: string) {
  let undone = 0, failed = 0;
  try {
    for (const l of await db.priceChangeLine.findMany({ where: { batchId, ok: true, undoOk: null } })) {
      await touch(batchId);
      const w = await writeWebPrice(Number(l.mtrl), Number(l.oldPrice), { mode: "any", expect: Number(l.newPrice) }).catch((e: Error) => ({ ok: false, error: e.message }));
      if (w.ok) { undone++; await refresh(Number(l.mtrl)); } else failed++;
      await db.priceChangeLine.update({ where: { id: l.id }, data: { undoOk: w.ok, error: w.ok ? null : w.error?.startsWith(WEB_PRICE_CHANGED) ? "άλλαξε από άλλον" : (w.error ?? "Άγνωστο σφάλμα") } }).catch(() => {});
    }
  } finally {
    await db.priceChangeBatch.update({ where: { id: batchId }, data: { undoneAt: new Date() } }).catch(() => {});
    await release(batchId).catch(() => {});
    await audit(userId, "competitor.bulkPrice.undo", "PriceChangeBatch", batchId, null, { undone, failed });
  }
}

/**
 * Αλλαγή τιμής web ενός προϊόντος με το χέρι (παράθυρο «Αλλαγή τιμής» του καταλόγου): μία γραμμή σε δική της παρτίδα
 * (rule.manual), ώστε να φαίνεται στο ιστορικό και να αναιρείται όπως οι μαζικές. Σύγχρονη εγγραφή (ένα είδος), με
 * `expect` = η τιμή web που είδε ο χρήστης. Οι δικλείδες (κάτω από το κόστος, μεγάλη μείωση) ελέγχονται στον caller.
 */
export async function applyManual(productId: string, newPrice: number, expectWeb: number, userId: string): Promise<{ ok: true; batchId: string } | { ok: false; error: string }> {
  const blocked = await writeBlocked();
  if (blocked) return { ok: false, error: blocked };
  const p = await db.product.findUnique({ where: { id: productId }, select: { erpCode: true } });
  const mtrl = Number(p?.erpCode);
  if (!p || !Number.isInteger(mtrl) || mtrl <= 0) return { ok: false, error: "Το προϊόν δεν είναι είδος του SoftOne." };
  const value = Math.round(newPrice * 100) / 100;
  const batch = await db.priceChangeBatch.create({ data: { userId, rule: { manual: true, newPrice: value }, lines: { create: [{ productId, mtrl: String(mtrl), oldPrice: expectWeb, newPrice: value }] } }, include: { lines: true } });
  const w = await writeWebPrice(mtrl, value, { mode: "any", expect: expectWeb }).catch((e: Error) => ({ ok: false, error: e.message }));
  await db.priceChangeLine.update({ where: { id: batch.lines[0].id }, data: { ok: w.ok, error: w.ok ? null : (w.error ?? "Άγνωστο σφάλμα") } });
  await audit(userId, "competitor.price.manual", "Product", productId, { price: expectWeb }, { price: value, ok: w.ok });
  if (!w.ok) return { ok: false, error: w.error?.startsWith(WEB_PRICE_CHANGED) ? "Η τιμή άλλαξε στο μεταξύ από άλλον — άνοιξε ξανά το παράθυρο." : (w.error ?? "Άγνωστο σφάλμα") };
  await refresh(mtrl);
  return { ok: true, batchId: batch.id };
}

/** Άμεση αναίρεση μιας αλλαγής με το χέρι (σύγχρονη, μία γραμμή)· ίδιοι κανόνες με το runUndo. */
export async function undoManual(batchId: string, userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try { await startUndo(batchId); } catch (e) { return { ok: false, error: (e as Error).message }; }
  await runUndo(batchId, userId);
  const l = await db.priceChangeLine.findFirst({ where: { batchId }, select: { undoOk: true, error: true } });
  return l?.undoOk ? { ok: true } : { ok: false, error: l?.error ?? "Η αναίρεση δεν έγινε." };
}

/** Οι τελευταίες παρτίδες για το ιστορικό, με την πρόοδό τους. */
export async function listBatches(take = 10) {
  const now = new Date();
  const batches = await db.priceChangeBatch.findMany({
    orderBy: { createdAt: "desc" }, take,
    select: { id: true, createdAt: true, undoneAt: true, rule: true, user: { select: { name: true } }, lines: { select: { ok: true, undoOk: true, oldPrice: true, newPrice: true, error: true, product: { select: { title: true } } } } },
  });
  return batches.map((b) => ({
    id: b.id, createdAt: b.createdAt.toISOString(), undoneAt: b.undoneAt?.toISOString() ?? null, user: b.user?.name ?? null,
    ...batchProgress(b.lines, lockOf(b.rule), now),
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
