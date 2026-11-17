"use server";
import { after } from "next/server";
import { requirePermission } from "@/lib/rbac/guard";
import { listBatches, type BatchView } from "@/lib/competitors/bulk";
import { batchLines, cleanOpts, loadPricing, runPricing, startPricing, type BatchLine, type PFilter, type PricingRow } from "@/lib/catalog/pricing/tool";

const id = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length < 64 ? v : undefined);

export async function loadAction(filter: unknown): Promise<{ ok: true; rows: PricingRow[] } | { ok: false; error: string }> {
  await requirePermission("catalog.products.read");
  const o = (filter && typeof filter === "object" ? filter : {}) as Record<string, unknown>;
  const f: PFilter = { categoryId: id(o.categoryId), brandId: id(o.brandId), q: typeof o.q === "string" ? o.q.slice(0, 80) : undefined };
  try { return { ok: true, rows: await loadPricing({ filter: f }) }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Άγνωστο σφάλμα" }; }
}

/** Πορεία μιας παρτίδας ανά προϊόν (η σελίδα το καλεί όσο τρέχει εγγραφή ή αναίρεση). */
export async function linesAction(batchId: unknown): Promise<BatchLine[]> {
  await requirePermission("catalog.products.read");
  const b = id(batchId);
  return b ? batchLines(b) : [];
}

/** Ξεκινά την εγγραφή και απαντά αμέσως· οι τιμές γράφονται μετά την απάντηση και η σελίδα δείχνει την πρόοδο από το ιστορικό. */
export async function applyAction(items: unknown, opts: unknown): Promise<{ ok: true; batchId: string; total: number; batches: BatchView[] } | { ok: false; error: string }> {
  const user = await requirePermission("catalog.sync.run");
  const o = cleanOpts(opts);
  if (!o) return { ok: false, error: "Το στρογγύλεμα ή το ελάχιστο κέρδος δεν είναι έγκυρο." };
  const list = Array.isArray(items) ? items.flatMap((x): { productId: string; percent?: number; price?: number }[] => {
    const pid = id((x as { productId?: unknown })?.productId), p = (x as { percent?: unknown })?.percent, t = (x as { price?: unknown })?.price;
    if (pid && typeof t === "number" && Number.isFinite(t) && t > 0 && t < 1_000_000) return [{ productId: pid, price: t }];
    return pid && typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 500 ? [{ productId: pid, percent: p }] : [];
  }) : [];
  if (!list.length || list.length !== (items as unknown[]).length) return { ok: false, error: "Δεν διάλεξες προϊόντα ή κάποιο markup ή τιμή δεν είναι έγκυρο." };
  try {
    const res = await startPricing(list, o, user.id);
    after(() => runPricing(res.batchId, user.id).catch((e) => console.error("[pricing/apply]", res.batchId, e)));
    return { ok: true, ...res, batches: await listBatches() };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Άγνωστο σφάλμα" }; }
}
