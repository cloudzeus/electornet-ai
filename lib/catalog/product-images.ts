import "server-only";
import { db } from "@/lib/db";
import { ingest } from "@/lib/media/repo";

/**
 * Φωτογραφίες προϊόντος από το διαχειριστικό — η μόνιμη ροή (η μαζική εισαγωγή
 * από τον φάκελο του παλιού site ήταν εφάπαξ, βλ. docs/product-images-import.md).
 *
 * Δύο δρόμοι, ίδιο αποτέλεσμα (`Media` με `assetId`):
 * - **ανέβασμα** από την καρτέλα του προϊόντος → περνά από τη βιβλιοθήκη πολυμέσων
 *   (WebP, μικρογραφία 480px, blur, Bunny) στον φάκελο «Προϊόντα» και δένεται αμέσως·
 * - **συσχετισμός** αρχείων που υπάρχουν ήδη στη βιβλιοθήκη. Το ίδιο αρχείο μπορεί
 *   να ανήκει σε πολλά προϊόντα (π.χ. χρώματα του ίδιου μοντέλου).
 * Η πρώτη στη σειρά είναι η κύρια.
 */
export const PRODUCT_FOLDER = "Προϊόντα";
export const LOW_RES_PX = 600;

export interface ProductImageDTO { id: string; url: string; thumbUrl: string | null; alt: string | null; sortNo: number; width: number | null; height: number | null; source: string | null; assetId: string | null; hidden: boolean; lowRes: boolean }

type Row = { id: string; url: string; thumbUrl: string | null; alt: string | null; sortNo: number; width: number | null; height: number | null; source: string | null; assetId: string | null; hidden: boolean };
export const toImageDTO = (m: Row): ProductImageDTO => ({ ...m, lowRes: m.width != null && m.height != null && Math.max(m.width, m.height) < LOW_RES_PX });
const SELECT = { id: true, url: true, thumbUrl: true, alt: true, sortNo: true, width: true, height: true, source: true, assetId: true, hidden: true } as const;

export async function listProductImages(productId: string): Promise<ProductImageDTO[]> {
  return (await db.media.findMany({ where: { productId, kind: "image" }, orderBy: [{ hidden: "asc" }, { sortNo: "asc" }, { id: "asc" }], select: SELECT })).map(toImageDTO);
}

export async function productFolderId(): Promise<string> {
  const f = await db.mediaFolder.findFirst({ where: { parentId: null, name: PRODUCT_FOLDER }, select: { id: true } });
  return f?.id ?? (await db.mediaFolder.create({ data: { name: PRODUCT_FOLDER }, select: { id: true } })).id;
}

/** Δένει αρχεία της βιβλιοθήκης στο προϊόν, στο τέλος της σειράς. Ό,τι είναι ήδη δεμένο αγνοείται· ό,τι ήταν κρυμμένο ξαναφαίνεται. */
export async function attachAssets(productId: string, assetIds: string[], source: "gallery" | "upload"): Promise<{ added: ProductImageDTO[]; skipped: number }> {
  const [product, assets, existing] = await Promise.all([
    db.product.findUnique({ where: { id: productId }, select: { title: true } }),
    db.mediaAsset.findMany({ where: { id: { in: assetIds }, kind: "image" } }),
    db.media.findMany({ where: { productId }, select: { id: true, url: true, sortNo: true, hidden: true } }),
  ]);
  if (!product) throw new Error("Το προϊόν δεν βρέθηκε.");
  const byUrl = new Map(existing.map((m) => [m.url, m]));
  let next = Math.max(0, ...existing.map((m) => m.sortNo));
  let count = existing.filter((m) => !m.hidden).length;
  const added: ProductImageDTO[] = []; let skipped = 0;
  for (const id of assetIds) { // με τη σειρά που τα διάλεξε ο διαχειριστής
    const a = assets.find((x) => x.id === id); if (!a) { skipped++; continue; }
    const dup = byUrl.get(a.url);
    if (dup) { if (dup.hidden) added.push(toImageDTO(await db.media.update({ where: { id: dup.id }, data: { hidden: false, sortNo: ++next }, select: SELECT }))); else skipped++; continue; }
    count++;
    const alt = a.alt?.trim() || (count === 1 ? product.title : `${product.title} — φωτογραφία ${count}`);
    added.push(toImageDTO(await db.media.create({ data: { productId, kind: "image", url: a.url, thumbUrl: a.thumbUrl, width: a.width, height: a.height, blur: a.blur, alt, sortNo: ++next, source, assetId: a.id }, select: SELECT })));
  }
  return { added, skipped };
}

/** Ανέβασμα από την καρτέλα του προϊόντος: βιβλιοθήκη (φάκελος «Προϊόντα») → δέσιμο. */
export async function uploadProductImage(productId: string, file: { bytes: Buffer; filename: string; mime: string }, staffId: string | null): Promise<ProductImageDTO> {
  const product = await db.product.findUnique({ where: { id: productId }, select: { title: true, sku: true } });
  if (!product) throw new Error("Το προϊόν δεν βρέθηκε.");
  const asset = await ingest({ ...file, folderId: await productFolderId(), createdBy: staffId, title: `${product.title} (${product.sku})` });
  if (asset.kind !== "image") throw new Error("Μόνο εικόνες γίνονται φωτογραφίες προϊόντος.");
  await db.mediaAsset.update({ where: { id: asset.id }, data: { tags: { push: "προϊόν" } } }).catch(() => {});
  const { added } = await attachAssets(productId, [asset.id], "upload");
  if (!added[0]) throw new Error("Η φωτογραφία ανέβηκε αλλά δεν δέθηκε στο προϊόν.");
  return added[0];
}

/** Νέα σειρά των ορατών φωτογραφιών· η πρώτη γίνεται κύρια. Ids που δεν ανήκουν στο προϊόν αγνοούνται. */
export async function reorderImages(productId: string, ids: string[]) {
  const mine = new Set((await db.media.findMany({ where: { productId }, select: { id: true } })).map((m) => m.id));
  const ordered = ids.filter((id, i) => mine.has(id) && ids.indexOf(id) === i);
  await db.$transaction(ordered.map((id, i) => db.media.update({ where: { id }, data: { sortNo: i + 1 } })));
}

/** Αφαίρεση από το προϊόν. Το αρχείο μένει στη βιβλιοθήκη / στο CDN. Οι φωτογραφίες της αρχικής εισαγωγής κρύβονται αντί να σβηστούν. */
export async function removeImage(productId: string, id: string): Promise<"hidden" | "removed"> {
  const m = await db.media.findFirst({ where: { id, productId }, select: { id: true, source: true } });
  if (!m) throw new Error("Η φωτογραφία δεν βρέθηκε.");
  if (m.source === "legacy-site") { await db.media.update({ where: { id }, data: { hidden: true } }); return "hidden"; }
  await db.media.delete({ where: { id } });
  return "removed";
}

export async function restoreImage(productId: string, id: string) {
  const last = await db.media.aggregate({ where: { productId }, _max: { sortNo: true } });
  await db.media.updateMany({ where: { id, productId }, data: { hidden: false, sortNo: (last._max.sortNo ?? 0) + 1 } });
}
