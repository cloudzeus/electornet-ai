import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizePricing, type ExtPricing } from "./policy";

/**
 * Οι κλίμακες τιμών της επέκτασης εγγύησης επί πληρωμή — επιλογή της διαχείρισης (Εμπόριο → Επέκταση εγγύησης).
 * Αποθηκεύονται στον πίνακα Setting (section «warranty.extension»), χωρίς αλλαγή σχήματος· 60″ στη μνήμη.
 */
const SECTION = "warranty.extension";
let mem: { at: number; v: ExtPricing } | null = null;

export async function getExtPricing(): Promise<ExtPricing> {
  if (mem && Date.now() - mem.at < 60_000) return mem.v;
  const row = await db.setting.findUnique({ where: { section: SECTION } }).catch(() => null);
  const v = normalizePricing(row?.data);
  mem = { at: Date.now(), v };
  return v;
}

export async function saveExtPricing(raw: unknown, userId: string): Promise<{ before: ExtPricing; after: ExtPricing }> {
  const before = await getExtPricing();
  const after = normalizePricing(raw);
  const data = after as unknown as Prisma.InputJsonValue;
  await db.setting.upsert({ where: { section: SECTION }, update: { data, updatedById: userId }, create: { section: SECTION, data, updatedById: userId } });
  mem = null;
  return { before, after };
}

/** slug της κατηγορίας και των προγόνων της (από την πιο ειδική προς τη ρίζα), για κάθε id κατηγορίας. */
export async function categoryPaths(categoryIds: string[]): Promise<Map<string, string[]>> {
  const ids = [...new Set(categoryIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const all = await db.category.findMany({ select: { id: true, slug: true, parentId: true } });
  const byId = new Map(all.map((c) => [c.id, c]));
  return new Map(ids.map((id) => {
    const path: string[] = [];
    for (let c = byId.get(id), n = 0; c && n < 12; c = c.parentId ? byId.get(c.parentId) : undefined, n++) path.push(c.slug);
    return [id, path];
  }));
}
