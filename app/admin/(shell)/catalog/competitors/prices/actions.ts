"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { applyBulk, listBatches, previewBulk, undoBatch, type BatchView, type Filter, type PreviewRow } from "@/lib/competitors/bulk";
import { cleanRule, MAX_BATCH } from "@/lib/competitors/bulk-core";

const PATH = "/admin/catalog/competitors/prices";
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

export async function applyAction(productIds: unknown, rule: unknown): Promise<{ ok: true; changed: number; failed: number; batches: BatchView[] } | { ok: false; error: string }> {
  const user = await requirePermission("catalog.sync.run");
  const r = cleanRule(rule);
  if (!r) return { ok: false, error: "Ο κανόνας δεν είναι έγκυρος — έλεγξε τα ποσά." };
  if (!Array.isArray(productIds) || !productIds.length || !productIds.every((x) => id(x))) return { ok: false, error: "Δεν διάλεξες προϊόντα." };
  if (productIds.length > MAX_BATCH) return { ok: false, error: `Έως ${MAX_BATCH} προϊόντα τη φορά — διάλεξε λιγότερα.` };
  try {
    const res = await applyBulk(productIds as string[], r, user.id);
    revalidatePath(PATH);
    return { ok: true, changed: res.ok, failed: res.failed, batches: await listBatches() };
  } catch (e) { return { ok: false, error: msg(e) }; }
}

export async function undoAction(batchId: unknown): Promise<{ ok: true; undone: number; failed: number; batches: BatchView[] } | { ok: false; error: string }> {
  const user = await requirePermission("catalog.sync.run");
  const b = id(batchId);
  if (!b) return { ok: false, error: "Άγνωστη παρτίδα." };
  try {
    const res = await undoBatch(b, user.id);
    revalidatePath(PATH);
    return { ok: true, ...res, batches: await listBatches() };
  } catch (e) { return { ok: false, error: msg(e) }; }
}
