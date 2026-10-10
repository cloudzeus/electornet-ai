import "server-only";
import { db } from "@/lib/db";
import { fetchPublicFile } from "@/lib/eprel/client";
import { ingest } from "@/lib/media/repo";
import { productFolderId } from "./product-images";

/**
 * Η ενεργειακή ετικέτα του EPREL ως ΤΕΛΕΥΤΑΙΑ φωτογραφία της γκαλερί, σε προϊόντα που βρέθηκαν στο EPREL.
 * - Μία γραμμή Media ανά προϊόν (source «eprel-label»), από το PNG του EPREL, στη βιβλιοθήκη πολυμέσων.
 * - Το ίδιο αρχείο ξαναχρησιμοποιείται για όλα τα προϊόντα του ίδιου μοντέλου EPREL (importFile = «eprel:<αριθμός>»).
 * - Όχι σε προϊόν χωρίς άλλη ορατή φωτογραφία: η ετικέτα δεν πρέπει να γίνει η κύρια εικόνα. Μπαίνει μόλις προστεθεί φωτογραφία.
 * - Αν ο διαχειριστής την κρύψει, μένει κρυμμένη.
 */
export const EPREL_LABEL_SOURCE = "eprel-label";

/** Η ετικέτα πάντα τελευταία (μετά από κάθε αλλαγή σειράς ή νέα φωτογραφία). Χωρίς κλήσεις έξω. */
export async function keepEprelLabelLast(productId: string) {
  const rows = await db.media.findMany({ where: { productId, kind: "image" }, select: { id: true, sortNo: true, source: true } });
  const label = rows.find((m) => m.source === EPREL_LABEL_SOURCE);
  if (!label) return;
  const max = Math.max(0, ...rows.filter((m) => m.id !== label.id).map((m) => m.sortNo));
  if (label.sortNo <= max) await db.media.update({ where: { id: label.id }, data: { sortNo: max + 1 } });
}

export type LabelPhotoResult = "added" | "kept" | "removed" | "no-label" | "no-photos" | "failed";

export async function ensureEprelLabelPhoto(productId: string, staffId: string | null = null): Promise<LabelPhotoResult> {
  const [energy, rows, product] = await Promise.all([
    db.energyLabel.findUnique({ where: { productId }, select: { eprel: { select: { registrationNumber: true, labelPngUrl: true, supplierOrTrademark: true, modelIdentifier: true } } } }),
    db.media.findMany({ where: { productId, kind: "image" }, select: { id: true, sortNo: true, source: true, hidden: true, importFile: true } }),
    db.product.findUnique({ where: { id: productId }, select: { title: true } }),
  ]);
  const ep = energy?.eprel ?? null;
  const tag = ep ? `eprel:${ep.registrationNumber}` : null;
  const mine = rows.find((m) => m.source === EPREL_LABEL_SOURCE);
  // το προϊόν δεν είναι πια δεμένο (ή δέθηκε σε άλλο μοντέλο): η παλιά ετικέτα φεύγει
  if (mine && mine.importFile !== tag) { await db.media.delete({ where: { id: mine.id } }); if (!ep) return "removed"; }
  else if (mine) { await keepEprelLabelLast(productId); return "kept"; }
  if (!ep || !product) return "no-label";
  const others = rows.filter((m) => m.source !== EPREL_LABEL_SOURCE);
  if (!others.some((m) => !m.hidden)) return "no-photos";

  // ίδιο μοντέλο σε άλλο προϊόν → ίδιο αρχείο
  const twin = await db.media.findFirst({ where: { source: EPREL_LABEL_SOURCE, importFile: tag }, select: { url: true, thumbUrl: true, width: true, height: true, blur: true, assetId: true } });
  let file = twin;
  if (!file) {
    if (!ep.labelPngUrl) return "failed";
    const png = await fetchPublicFile(ep.labelPngUrl, "png").catch(() => null);
    if (!png) return "failed";
    const a = await ingest({ bytes: png.bytes, filename: `eprel-label-${ep.registrationNumber}.png`, mime: png.mime, folderId: await productFolderId(), createdBy: staffId, title: `Ενεργειακή ετικέτα ${ep.supplierOrTrademark} ${ep.modelIdentifier}` });
    file = { url: a.url, thumbUrl: a.thumbUrl ?? null, width: a.width ?? null, height: a.height ?? null, blur: a.blur ?? null, assetId: a.id };
  }
  const sortNo = Math.max(0, ...others.map((m) => m.sortNo)) + 1;
  await db.media.upsert({
    where: { productId_url: { productId, url: file.url } },
    create: { productId, kind: "image", ...file, alt: `${product.title} — ενεργειακή ετικέτα`, sortNo, source: EPREL_LABEL_SOURCE, importFile: tag },
    update: { source: EPREL_LABEL_SOURCE, importFile: tag, sortNo },
  });
  return "added";
}

/** Μαζικά: τα προϊόντα που βρέθηκαν στο EPREL και δεν έχουν ακόμη τη φωτογραφία-ετικέτα (παρτίδες, συνεχίζει όπου σταμάτησε). */
export async function backfillEprelLabelPhotos(limit = 50, staffId: string | null = null) {
  const ids = (await db.energyLabel.findMany({
    where: { eprelRegistrationNumber: { not: null }, product: { media: { none: { source: EPREL_LABEL_SOURCE } }, AND: [{ media: { some: { kind: "image", hidden: false } } }] } },
    select: { productId: true }, take: limit,
  })).map((x) => x.productId);
  const out: Record<LabelPhotoResult, number> = { added: 0, kept: 0, removed: 0, "no-label": 0, "no-photos": 0, failed: 0 };
  for (const id of ids) out[await ensureEprelLabelPhoto(id, staffId).catch(() => "failed" as const)]++;
  return { checked: ids.length, ...out };
}

export async function eprelLabelPhotoCounts() {
  const [linked, withPhoto, pending] = await Promise.all([
    db.energyLabel.count({ where: { eprelRegistrationNumber: { not: null } } }),
    db.media.count({ where: { source: EPREL_LABEL_SOURCE } }),
    db.energyLabel.count({ where: { eprelRegistrationNumber: { not: null }, product: { media: { none: { source: EPREL_LABEL_SOURCE } }, AND: [{ media: { some: { kind: "image", hidden: false } } }] } } }),
  ]);
  return { linked, withPhoto, pending };
}
