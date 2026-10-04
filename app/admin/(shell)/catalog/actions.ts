"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { attachAssets, listProductImages, reorderImages, removeImage, restoreImage } from "@/lib/catalog/product-images";
import { resetCatalogCache } from "@/lib/data/db-catalog";

const path = (id: string) => `/admin/catalog/${id}`;

export async function attachFromGallery(productId: string, assetIds: string[]) {
  const user = await requirePermission("catalog.products.write");
  const r = await attachAssets(productId, assetIds.slice(0, 40), "gallery");
  resetCatalogCache(); // προϊόν που απέκτησε την πρώτη του φωτογραφία μπαίνει στις λίστες
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
  resetCatalogCache();
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

/**
 * «Ενημέρωση από SoftOne»: το είδος διαβάζεται τώρα από το ERP (μόνο ανάγνωση) και το προϊόν ενημερώνεται αμέσως,
 * χωρίς να περιμένει τον προγραμματισμένο συγχρονισμό. Επιστρέφει τι άλλαξε, για να το δει ο διαχειριστής.
 */
export async function pullFromSoftone(productId: string) {
  const user = await requirePermission("catalog.products.write");
  const before = await db.product.findUnique({ where: { id: productId }, select: { erpCode: true, title: true, summary: true, description: true, price: true, stock: true, active: true, ean: true, _count: { select: { specs: true } } } });
  if (!before) return { ok: false as const, message: "Το προϊόν δεν βρέθηκε." };
  const mtrl = Number(before.erpCode);
  if (!Number.isInteger(mtrl)) return { ok: false as const, message: "Το προϊόν δεν προέρχεται από το SoftOne." };
  const { syncItem } = await import("@/lib/softone/catalog");
  const { projectItem } = await import("@/lib/softone/project");
  const s = await syncItem(mtrl, "manual");
  if (!s.ok) return { ok: false as const, message: `Το SoftOne δεν απάντησε: ${s.error ?? "άγνωστο σφάλμα"}` };
  const p = await projectItem(mtrl);
  const after = await db.product.findUnique({ where: { id: productId }, select: { title: true, summary: true, description: true, price: true, stock: true, active: true, ean: true, _count: { select: { specs: true } } } });
  const changed: string[] = [];
  if (after) {
    if (after.title !== before.title) changed.push("τίτλος");
    if (after.summary !== before.summary) changed.push("σύντομη περιγραφή");
    if (after.description !== before.description) changed.push("περιγραφή");
    if (after._count.specs !== before._count.specs) changed.push("χαρακτηριστικά");
    if (after.price !== before.price) changed.push(`τιμή ${before.price ?? "—"} → ${after.price ?? "—"} €`);
    if (after.stock !== before.stock) changed.push(`απόθεμα ${before.stock} → ${after.stock}`);
    if (after.active !== before.active) changed.push(after.active ? "ενεργοποιήθηκε" : "απενεργοποιήθηκε");
    if (after.ean !== before.ean) changed.push("barcode");
  }
  const { forgetArLookup } = await import("@/lib/ar/serve");
  const { invalidateArIndex } = await import("@/lib/ar/index");
  forgetArLookup(productId); invalidateArIndex();
  await audit(user.id, "catalog.product.pull", "Product", productId, null, { mtrl, missing: s.missing > 0, changed, projected: p.ok, reason: p.reason });
  revalidatePath(path(productId));
  if (s.missing) return { ok: false as const, message: "Το είδος δεν είναι πια είδος του site στο SoftOne (ή διαγράφηκε). Το προϊόν κρύφτηκε από το κατάστημα." };
  if (!p.ok) return { ok: false as const, message: p.reason ?? "Η ενημέρωση του καταστήματος απέτυχε." };
  return { ok: true as const, message: changed.length ? `Ενημερώθηκε από το SoftOne: ${changed.join(", ")}.` : "Ήδη ενημερωμένο — καμία αλλαγή στο SoftOne." };
}
