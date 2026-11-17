"use server";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";

/**
 * «Διαστάσεις και βάρος από το περιεχόμενο»: πρόταση (τίποτα δεν αποθηκεύεται) και αποθήκευση μόνο στη βάση του eshop.
 * Δεν γράφει ποτέ στο SoftOne (οι εγγραφές εκεί θέλουν ρητή έγκριση).
 */
export async function contentDimsAction(productId: string) {
  await requirePermission("catalog.products.read");
  const { contentDims } = await import("@/lib/catalog/dims-from-content");
  try { return { ok: true as const, state: await contentDims(productId) }; }
  catch (e) {
    console.error("[content-dims]", productId, e);
    return { ok: false as const, error: e instanceof Error && e.message === "Το προϊόν δεν βρέθηκε." ? e.message : "Η ανάγνωση του περιεχομένου απέτυχε. Δοκίμασε ξανά σε λίγο." };
  }
}

type Pick = { label: string; raw: string };
export async function saveContentDimsAction(productId: string, input: { dims?: Pick & { w: number; h: number; d: number }; weight?: Pick & { kg: number } }) {
  const user = await requirePermission("catalog.products.write");
  const { pickError, saveEshopDims } = await import("@/lib/catalog/dims-missing");
  const bad = pickError({ productId, ...input });
  if (bad) return { ok: false as const, error: bad };
  const p = await db.product.findUnique({ where: { id: productId }, select: { category: { select: { name: true } }, weightKg: true } });
  if (!p) return { ok: false as const, error: "Το προϊόν δεν βρέθηκε." };
  const { dims, weight } = input;
  await saveEshopDims({ productId, ...input }, p.category.name);
  const [{ projectPublishReady }, { resetCatalogCache }] = await Promise.all([import("@/lib/catalog/publish-ready-server"), import("@/lib/data/db-catalog")]);
  await projectPublishReady([productId]);
  resetCatalogCache();
  await audit(user.id, "catalog.product.content-dims", "Product", productId, { weightKg: p.weightKg }, { dims: dims ? [dims.w, dims.h, dims.d, dims.label] : null, weight: weight ? [weight.kg, weight.label] : null });
  return { ok: true as const };
}
