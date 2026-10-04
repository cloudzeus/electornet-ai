"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import { attachAssets, listProductImages, reorderImages, removeImage, restoreImage, type ProductMediaKind } from "@/lib/catalog/product-images";
import { resetCatalogCache } from "@/lib/data/db-catalog";

const path = (id: string) => `/admin/catalog/${id}`;

export async function attachFromGallery(productId: string, assetIds: string[], kind: ProductMediaKind = "image") {
  const user = await requirePermission("catalog.products.write");
  const r = await attachAssets(productId, assetIds.slice(0, 40), "gallery", kind);
  resetCatalogCache(); // προϊόν που απέκτησε την πρώτη του φωτογραφία μπαίνει στις λίστες
  await audit(user.id, "catalog.product.image.attach", "Product", productId, null, { assetIds, added: r.added.length, skipped: r.skipped });
  revalidatePath(path(productId));
  return { images: await listProductImages(productId, kind), added: r.added.length, skipped: r.skipped };
}

export async function saveImageOrder(productId: string, ids: string[], kind: ProductMediaKind = "image") {
  const user = await requirePermission("catalog.products.write");
  await reorderImages(productId, ids);
  await audit(user.id, "catalog.product.image.reorder", "Product", productId, null, { ids, kind });
  revalidatePath(path(productId));
  return listProductImages(productId, kind);
}

export async function saveImageAlt(productId: string, id: string, alt: string) {
  const user = await requirePermission("catalog.products.write");
  const clean = alt.replace(/\s+/g, " ").trim().slice(0, 200);
  await db.media.updateMany({ where: { id, productId }, data: { alt: clean || null } });
  await audit(user.id, "catalog.product.image.alt", "Product", productId, null, { id, alt: clean });
  revalidatePath(path(productId));
  return clean;
}

export async function removeProductImage(productId: string, id: string, kind: ProductMediaKind = "image") {
  const user = await requirePermission("catalog.products.write");
  const how = await removeImage(productId, id);
  resetCatalogCache();
  await audit(user.id, "catalog.product.image.remove", "Product", productId, null, { id, how });
  revalidatePath(path(productId));
  return { how, images: await listProductImages(productId, kind) };
}

export async function restoreProductImage(productId: string, id: string, kind: ProductMediaKind = "image") {
  const user = await requirePermission("catalog.products.write");
  await restoreImage(productId, id);
  await audit(user.id, "catalog.product.image.restore", "Product", productId, null, { id });
  revalidatePath(path(productId));
  return listProductImages(productId, kind);
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

/**
 * Αποθήκευση από την καρτέλα προϊόντος: γράφεται στο είδος του SoftOne (με έλεγχο σύγκρουσης και επαλήθευση — βλ.
 * lib/softone/item-write.ts) και αμέσως μετά το είδος ξαναδιαβάζεται και ενημερώνεται το προϊόν του e-shop.
 * Αν το SoftOne δεν δεχτεί την αλλαγή, δεν αλλάζει ούτε το e-shop.
 */
export async function saveProductFields(productId: string, changes: import("@/lib/softone/item-write").ItemChanges) {
  const user = await requirePermission("catalog.products.write");
  const { can } = await import("@/lib/rbac/permissions");
  if (!can(user.permissions, "catalog.sync.run")) return { ok: false as const, message: "Χρειάζεται και το δικαίωμα «Εκτέλεση συγχρονισμού ERP» για αλλαγές στο SoftOne." };
  const { writeItem, itemWriteEnabled, ITEM_FIELDS } = await import("@/lib/softone/item-write");
  if (!(await itemWriteEnabled())) return { ok: false as const, message: "Η εγγραφή στο SoftOne είναι κλειστή (Ρυθμίσεις → SoftOne → Αλλαγές προϊόντων προς SoftOne)." };
  const p = await db.product.findUnique({ where: { id: productId }, select: { erpCode: true, source: true } });
  const mtrl = Number(p?.erpCode);
  if (!p || p.source !== "softone" || !Number.isInteger(mtrl)) return { ok: false as const, message: "Το προϊόν δεν προέρχεται από το SoftOne." };
  const w = await writeItem(mtrl, changes);
  const labels = (keys: string[]) => keys.map((k) => ITEM_FIELDS[k as keyof typeof ITEM_FIELDS]?.label ?? k).join(", ");
  await audit(user.id, w.ok ? "catalog.product.s1-write" : "catalog.product.s1-write-failed", "Product", productId, Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v?.from])), { mtrl, to: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v?.to])), written: w.written, conflicts: w.conflicts, mismatches: w.mismatches, error: w.error });
  // Ό,τι γράφτηκε (έστω και μέρος) περνά αμέσως στο e-shop
  if (w.written.length) {
    const { syncItem } = await import("@/lib/softone/catalog");
    const { projectItem } = await import("@/lib/softone/project");
    await syncItem(mtrl, "manual");
    await projectItem(mtrl);
    const { forgetArLookup } = await import("@/lib/ar/serve");
    const { invalidateArIndex } = await import("@/lib/ar/index");
    forgetArLookup(productId); invalidateArIndex();
    revalidatePath(path(productId));
  }
  if (!w.ok) return { ok: false as const, message: w.error ?? "Η αποθήκευση απέτυχε.", conflicts: w.conflicts.map((c) => ({ ...c, label: labels([c.field]) })), mismatches: w.mismatches.map((m) => ({ ...m, label: labels([m.field]) })), written: w.written };
  return { ok: true as const, message: w.written.length ? `Αποθηκεύτηκε στο SoftOne και στο e-shop: ${labels(w.written)}.` : "Καμία αλλαγή για αποθήκευση.", written: w.written };
}

// ---------- Βίντεο προϊόντος ----------

export interface ProductVideoDTO { id: string; url: string; poster: string | null; hidden: boolean; onBunny: boolean }
async function listVideos(productId: string): Promise<ProductVideoDTO[]> {
  const rows = await db.media.findMany({ where: { productId, kind: "video" }, orderBy: [{ hidden: "asc" }, { sortNo: "asc" }], select: { id: true, url: true, thumbUrl: true, hidden: true, assetId: true } });
  return rows.map((r) => ({ id: r.id, url: r.url, poster: r.thumbUrl, hidden: r.hidden, onBunny: !!r.assetId }));
}

/** Βίντεο από σύνδεσμο: αρχείο → MP4 στο Bunny· YouTube / Vimeo → ενσωμάτωση με αφίσα στο Bunny. */
export async function addProductVideo(productId: string, url: string): Promise<{ ok: boolean; error?: string; videos: ProductVideoDTO[] }> {
  const user = await requirePermission("catalog.products.write");
  const { parseVideoUrl } = await import("@/lib/catalog/video-url");
  const { importVideo } = await import("@/lib/catalog/supplier-media");
  const ref = parseVideoUrl(url);
  if (!ref) return { ok: false, error: "Δεν είναι σύνδεσμος YouTube, Vimeo ή αρχείου .mp4 / .webm (https).", videos: await listVideos(productId) };
  const p = await db.product.findUnique({ where: { id: productId }, select: { title: true } });
  if (!p) return { ok: false, error: "Το προϊόν δεν βρέθηκε.", videos: [] };
  const dup = await db.media.findFirst({ where: { productId, kind: "video", OR: [{ url: ref.url }, { importFile: ref.url }, { importFile: url.trim() }] }, select: { id: true, hidden: true } });
  if (dup) {
    if (dup.hidden) await db.media.update({ where: { id: dup.id }, data: { hidden: false } });
    else return { ok: false, error: "Το βίντεο υπάρχει ήδη στο προϊόν.", videos: await listVideos(productId) };
  } else {
    try {
      const last = await db.media.aggregate({ where: { productId, kind: "video" }, _max: { sortNo: true } });
      await importVideo(productId, p.title, { raw: url.trim(), url: ref.url, thumb: ref.thumb }, (last._max.sortNo ?? 0) + 1, user.id);
    } catch (e) { return { ok: false, error: (e as Error).message, videos: await listVideos(productId) }; }
  }
  await audit(user.id, "catalog.product.video.add", "Product", productId, null, { url: ref.url });
  resetCatalogCache(); revalidatePath(path(productId));
  return { ok: true, videos: await listVideos(productId) };
}

/** Απόκρυψη / επαναφορά — τα βίντεο δεν σβήνονται από εδώ. */
export async function setProductVideoHidden(productId: string, id: string, hidden: boolean): Promise<ProductVideoDTO[]> {
  const user = await requirePermission("catalog.products.write");
  await db.media.updateMany({ where: { id, productId, kind: "video" }, data: { hidden } });
  await audit(user.id, hidden ? "catalog.product.video.hide" : "catalog.product.video.restore", "Product", productId, null, { id });
  resetCatalogCache(); revalidatePath(path(productId));
  return listVideos(productId);
}

export async function productVideos(productId: string) {
  await requirePermission("catalog.products.read");
  return listVideos(productId);
}

// ---------- Stickers προϊόντος (χειροκίνητα) ----------

export interface ProductStickerDTO { id: string; stickerId: string; key: string; name: string; params: import("@/lib/stickers/model").StickerParams; startsAt: string | null; endsAt: string | null }
async function listProductStickers(productId: string): Promise<ProductStickerDTO[]> {
  const rows = await db.productSticker.findMany({ where: { productId }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }], include: { sticker: { select: { key: true, name: true, params: true } } } });
  return rows.map((r) => ({ id: r.id, stickerId: r.stickerId, key: r.sticker.key, name: r.sticker.name, params: r.sticker.params as never, startsAt: r.startsAt?.toISOString() ?? null, endsAt: r.endsAt?.toISOString() ?? null }));
}
const afterStickerChange = async (productId: string) => {
  const { resetStickerCatalog } = await import("@/lib/stickers/server");
  resetStickerCatalog(); resetCatalogCache(); revalidatePath(path(productId));
};

export async function addProductSticker(productId: string, stickerId: string, startsAt: string | null, endsAt: string | null): Promise<{ ok: boolean; error?: string; list: ProductStickerDTO[] }> {
  const user = await requirePermission("catalog.products.write");
  if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) return { ok: false, error: "Η λήξη είναι πριν από την έναρξη.", list: await listProductStickers(productId) };
  const n = await db.productSticker.count({ where: { productId } });
  await db.productSticker.upsert({ where: { productId_stickerId: { productId, stickerId } }, create: { productId, stickerId, startsAt: startsAt ? new Date(startsAt) : null, endsAt: endsAt ? new Date(endsAt) : null, sort: n, createdBy: user.id }, update: { startsAt: startsAt ? new Date(startsAt) : null, endsAt: endsAt ? new Date(endsAt) : null } });
  await audit(user.id, "catalog.product.sticker.add", "Product", productId, null, { stickerId, startsAt, endsAt });
  await afterStickerChange(productId);
  return { ok: true, list: await listProductStickers(productId) };
}

export async function removeProductSticker(productId: string, id: string): Promise<ProductStickerDTO[]> {
  const user = await requirePermission("catalog.products.write");
  await db.productSticker.deleteMany({ where: { id, productId } });
  await audit(user.id, "catalog.product.sticker.remove", "Product", productId, null, { id });
  await afterStickerChange(productId);
  return listProductStickers(productId);
}

export async function moveProductSticker(productId: string, id: string, dir: -1 | 1): Promise<ProductStickerDTO[]> {
  await requirePermission("catalog.products.write");
  const list = await listProductStickers(productId);
  const i = list.findIndex((x) => x.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const order = [...list]; [order[i], order[j]] = [order[j], order[i]];
  await db.$transaction(order.map((x, k) => db.productSticker.update({ where: { id: x.id }, data: { sort: k } })));
  await afterStickerChange(productId);
  return listProductStickers(productId);
}

export async function productStickers(productId: string) {
  await requirePermission("catalog.products.read");
  return listProductStickers(productId);
}
