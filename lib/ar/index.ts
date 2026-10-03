import "server-only";
import { db } from "@/lib/db";
import { getProductsByIds } from "@/lib/data/repo";
import { arPlan, type ArOffCode } from "./plan";
import type { Surface } from "./placement";

/**
 * Η απόφαση AR για ΚΑΘΕ ενεργό προϊόν, για τα φίλτρα και τους μετρητές της διαχείρισης (Διαχείριση → AR).
 * Χτίζεται μία φορά και μένει 10′ στη μνήμη· κάθε αλλαγή από τη διαχείριση την ακυρώνει.
 */
export interface ArIndexRow { id: string; slug: string; brand: string; title: string; on: boolean; code?: ArOffCode; surface: Surface; tv: boolean; fixed: boolean; custom: boolean; text: string }

let cache: { at: number; rows: ArIndexRow[] } | null = null;
let building: Promise<ArIndexRow[]> | null = null;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

async function build(): Promise<ArIndexRow[]> {
  const [rows, ars] = await Promise.all([db.product.findMany({ where: { active: true }, select: { id: true } }), db.productAr.findMany()]);
  const byId = new Map(ars.map((a) => [a.productId, a]));
  const ids = rows.map((r) => r.id);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 1000) chunks.push(ids.slice(i, i + 1000));
  const out: ArIndexRow[] = [];
  for (const ps of await Promise.all(chunks.map((c) => getProductsByIds(c)))) {
    for (const p of ps) {
      const plan = arPlan(p, byId.get(p.id) ?? null);
      out.push({ id: p.id, slug: p.slug, brand: p.brand, title: p.title, on: plan.on, code: plan.code, surface: plan.surface, tv: plan.archetype === "tv", fixed: !!plan.fix, custom: plan.custom, text: norm(`${p.brand} ${p.title} ${p.slug} ${p.id}`) });
    }
  }
  return out.sort((a, b) => a.brand.localeCompare(b.brand, "el") || a.title.localeCompare(b.title, "el"));
}

export async function arIndex(): Promise<ArIndexRow[]> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.rows;
  building ??= build().then((rows) => { cache = { at: Date.now(), rows }; return rows; }).finally(() => { building = null; });
  return building;
}

export function invalidateArIndex() {
  cache = null;
}

export const arSearchText = norm;
