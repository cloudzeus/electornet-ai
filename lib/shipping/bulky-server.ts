import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { categoryPaths } from "@/lib/warranty/pricing";
import { decideShipping, normalizeBulkyRules, shippingWeight, type BulkyRules, type ShipVerdict } from "./bulky";

/**
 * Οι κανόνες «μεγάλων συσκευών» της διαχείρισης (Εμπόριο → Αποστολές & μεγάλες συσκευές): επιλογή ανά κατηγορία και όρια
 * βάρους / μεγέθους. Setting «shipping.bulky», χωρίς αλλαγή σχήματος· 60″ στη μνήμη.
 */
const SECTION = "shipping.bulky";
let mem: { at: number; v: BulkyRules } | null = null;

export async function getBulkyRules(): Promise<BulkyRules> {
  if (mem && Date.now() - mem.at < 60_000) return mem.v;
  const row = await db.setting.findUnique({ where: { section: SECTION } }).catch(() => null);
  const v = normalizeBulkyRules(row?.data);
  mem = { at: Date.now(), v };
  return v;
}

export async function saveBulkyRules(raw: unknown, userId: string) {
  const before = await getBulkyRules();
  const after = normalizeBulkyRules(raw);
  const data = after as unknown as Prisma.InputJsonValue;
  await db.setting.upsert({ where: { section: SECTION }, update: { data, updatedById: userId }, create: { section: SECTION, data, updatedById: userId } });
  mem = null;
  return { before, after };
}

export type ShipLimit = ShipVerdict & { weightKg: number | null; dimsCm: [number, number, number] | null };

/**
 * Courier / θυρίδα ανά προϊόν: κατηγορία (και γονικές), βάρος από τα χαρακτηριστικά (πρώτα της συσκευασίας),
 * διαστάσεις του ERP (CCCLENGTH/WIDTH/HEIGHT).
 */
export async function shippingLimits(productIds: string[], rulesOverride?: BulkyRules): Promise<Map<string, ShipLimit>> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const [rules, prods, specs] = await Promise.all([
    rulesOverride ?? getBulkyRules(),
    db.product.findMany({ where: { id: { in: ids } }, select: { id: true, categoryId: true, erpCode: true } }),
    db.spec.findMany({ where: { productId: { in: ids }, key: { contains: "άρος", mode: "insensitive" } }, select: { productId: true, key: true, value: true } }),
  ]);
  const mtrls = prods.map((p) => Number(p.erpCode)).filter((n) => Number.isInteger(n) && n > 0);
  const [items, paths] = await Promise.all([
    mtrls.length ? db.s1Item.findMany({ where: { mtrl: { in: mtrls } }, select: { mtrl: true, lengthCm: true, widthCm: true, heightCm: true, weightKg: true } }) : Promise.resolve([]),
    categoryPaths(prods.map((p) => p.categoryId)),
  ]);
  const im = new Map(items.map((i) => [String(i.mtrl), i]));
  const sm = new Map<string, { key: string; value: string }[]>();
  for (const s of specs) sm.set(s.productId, [...(sm.get(s.productId) ?? []), s]);
  return new Map(prods.map((p) => {
    const it = p.erpCode ? im.get(p.erpCode) : undefined;
    const dimsCm = it?.lengthCm && it.widthCm && it.heightCm ? ([it.lengthCm, it.widthCm, it.heightCm] as [number, number, number]) : null;
    const weightKg = (it?.weightKg && it.weightKg > 0 ? it.weightKg : null) ?? shippingWeight(sm.get(p.id) ?? []);
    return [p.id, { ...decideShipping({ categoryPath: paths.get(p.categoryId) ?? [], weightKg, dimsCm }, rules), weightKg, dimsCm }];
  }));
}
