"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { attachAssets, listProductImages, reorderImages, removeImage, restoreImage } from "@/lib/catalog/product-images";

const path = (id: string) => `/admin/catalog/${id}`;

export async function attachFromGallery(productId: string, assetIds: string[]) {
  const user = await requirePermission("catalog.products.write");
  const r = await attachAssets(productId, assetIds.slice(0, 40), "gallery");
  await audit(user.id, "catalog.product.image.attach", "Product", productId, null, { assetIds, added: r.added.length, skipped: r.skipped });
  revalidatePath(path(productId));
  return { images: await listProductImages(productId), added: r.added.length, skipped: r.skipped };
}

export async function saveImageOrder(productId: string, ids: string[]) {
  const user = await requirePermission("catalog.products.write");
  await reorderImages(productId, ids);
  await audit(user.id, "catalog.product.image.reorder", "Product", productId, null, { ids });
  revalidatePath(path(productId));
  return listProductImages(productId);
}

export async function saveImageAlt(productId: string, id: string, alt: string) {
  const user = await requirePermission("catalog.products.write");
  const clean = alt.replace(/\s+/g, " ").trim().slice(0, 200);
  await db.media.updateMany({ where: { id, productId }, data: { alt: clean || null } });
  await audit(user.id, "catalog.product.image.alt", "Product", productId, null, { id, alt: clean });
  revalidatePath(path(productId));
  return clean;
}

export async function removeProductImage(productId: string, id: string) {
  const user = await requirePermission("catalog.products.write");
  const how = await removeImage(productId, id);
  await audit(user.id, "catalog.product.image.remove", "Product", productId, null, { id, how });
  revalidatePath(path(productId));
  return { how, images: await listProductImages(productId) };
}

export async function restoreProductImage(productId: string, id: string) {
  const user = await requirePermission("catalog.products.write");
  await restoreImage(productId, id);
  await audit(user.id, "catalog.product.image.restore", "Product", productId, null, { id });
  revalidatePath(path(productId));
  return listProductImages(productId);
}

/** Μία παρτίδα αντιστοίχισης με το EPREL (το πλήρες πέρασμα γίνεται με scripts/match-eprel.ts). */
export async function runEprelMatch(limit = 60) {
  const user = await requirePermission("catalog.sync.run");
  const { matchEprelBatch } = await import("@/lib/catalog/eprel-match");
  const r = await matchEprelBatch({ limit: Math.min(100, limit) });
  await audit(user.id, "catalog.eprel.match", "Product", null, null, { ...r, samples: undefined });
  revalidatePath("/admin/catalog/dimensions");
  return r;
}
