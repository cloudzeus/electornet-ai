"use server";
import { after } from "next/server";
import { requirePermission } from "@/lib/rbac/guard";
import { listBatches, previewBulk, runApply, runUndo, startApply, startUndo, type BatchView, type Filter, type PreviewRow } from "@/lib/competitors/bulk";
import { cleanRule, MAX_BATCH } from "@/lib/competitors/bulk-core";

const id = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length < 64 ? v : undefined);
const cleanFilter = (f: unknown): Filter => {
  const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
  return { categoryId: id(o.categoryId), brandId: id(o.brandId), productId: id(o.productId), onlyExpensive: o.onlyExpensive !== false };
};
const msg = (e: unknown) => (e instanceof Error ? e.message : "Άγνωστο σφάλμα");

export async function previewAction(filter: unknown, rule: unknown): Promise<{ ok: true; rows: PreviewRow[] } | { ok: false; error: string }> {
  await requirePermission("catalog.products.read");
  const r = cleanRule(rule);
  if (!r) return { ok: false, error: "Ο κανόνας δεν είναι έγκυρος — έλεγξε τα ποσά." };
  return { ok: true, rows: await previewBulk(cleanFilter(filter), r) };
}

/** Ξεκινά την εφαρμογή και απαντά αμέσως· οι εγγραφές τρέχουν μετά την απάντηση και η σελίδα δείχνει την πρόοδο. */
export async function applyAction(productIds: unknown, rule: unknown): Promise<{ ok: true; batchId: string; total: number; batches: BatchView[] } | { ok: false; error: string }> {
  const user = await requirePermission("catalog.sync.run");
  const r = cleanRule(rule);
  if (!r) return { ok: false, error: "Ο κανόνας δεν είναι έγκυρος — έλεγξε τα ποσά." };
  if (!Array.isArray(productIds) || !productIds.length || !productIds.every((x) => id(x))) return { ok: false, error: "Δεν διάλεξες προϊόντα." };
  if (productIds.length > MAX_BATCH) return { ok: false, error: `Έως ${MAX_BATCH} προϊόντα τη φορά — διάλεξε λιγότερα.` };
  try {
    const res = await startApply(productIds as string[], r, user.id);
    after(() => runApply(res.batchId, user.id).catch((e) => console.error("[bulk-price/apply]", res.batchId, e)));
    return { ok: true, ...res, batches: await listBatches() };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

export async function undoAction(batchId: unknown): Promise<{ ok: true; total: number; batches: BatchView[] } | { ok: false; error: string }> {
  const user = await requirePermission("catalog.sync.run");
  const b = id(batchId);
  if (!b) return { ok: false, error: "Άγνωστη παρτίδα." };
  try {
    const res = await startUndo(b);
    after(() => runUndo(b, user.id).catch((e) => console.error("[bulk-price/undo]", b, e)));
    return { ok: true, ...res, batches: await listBatches() };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

/** Πρόοδος των παρτίδων (η σελίδα το καλεί όσο κάτι τρέχει). */
export async function batchesAction(): Promise<BatchView[]> {
  await requirePermission("catalog.products.read");
  return listBatches();
}
