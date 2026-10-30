import "server-only";
import { db } from "@/lib/db";
import { fetchPublicBytes } from "@/lib/net/safe-fetch";
import { ingest } from "@/lib/media/repo";
import { attachAssets, productFolderId } from "@/lib/catalog/product-images";
import { configForHeaders, UserError } from "@/lib/catalog/foreign-import/core";
import { planForeign, applyForeign } from "@/lib/catalog/foreign-import/server";
import { itemWriteEnabled } from "@/lib/softone/item-write";
import { mergeEdits } from "@/lib/catalog/xml-import/diff-core";
import { loadFeed, type ItemFilter } from "@/lib/catalog/xml-import/feed";
import type { Diff } from "@/lib/catalog/xml-import/diff-core";

/**
 * Η εισαγωγή ως **ουρά που αδειάζει σε παρτίδες**, όχι loop στον browser: η κατάσταση ζει στο `SupplierFeedItem`, άρα
 * ο χρήστης μπορεί να κλείσει τη σελίδα και να δει πού έφτασε όταν ξαναμπεί.
 *
 * Οι φωτογραφίες κατεβαίνουν **εδώ** (όχι στη λίστα ελέγχου) και πάνε στη βιβλιοθήκη / Bunny με τη σειρά που όρισε ο
 * χρήστης. Τα `assetIds` μένουν στη γραμμή: ένα νέο είδος που δεν έχει ακόμη προϊόν (SoftOne κλειδωμένο) έχει ήδη τις
 * φωτογραφίες του στο Bunny, και δένονται μόλις γεννηθεί το προϊόν — αλλιώς δεν θα έφταναν ποτέ εκεί.
 *
 * Καμία εγγραφή στο SoftOne όσο ο διακόπτης `softone.itemsWrite` είναι κλειστός: τα νέα μένουν σε αναμονή.
 */

/** Μέγιστο μέγεθος φωτογραφίας που κατεβάζουμε από τον προμηθευτή. */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 25_000;
/** Πόσες φωτογραφίες το πολύ ανά προϊόν (όσες και στο template προμηθευτή). */
export const MAX_IMAGES = 10;
/** Προεπιλεγμένο μέγεθος παρτίδας. Μικρό, ώστε κάθε κλήση να τελειώνει γρήγορα και η πρόοδος να προχωρά ορατά. */
export const BATCH = 10;

export interface Selection {
  filter: ItemFilter;
  /** sku που ο χρήστης ξε-τίκαρε — η επιλογή είναι φίλτρο συν εξαιρέσεις, όχι λίστα */
  except: string[];
  /** «και στο SoftOne» για την παρτίδα· οι εξαιρέσεις ανά προϊόν ζουν στο `SupplierFeedItem.softone` */
  toSoftone: boolean;
}

const whereOf = (feedId: string, f: ItemFilter) => ({
  feedId,
  ...(f.diff ? { diff: f.diff } : {}),
  ...(f.status ? { status: f.status } : {}),
  ...(f.problems ? { problem: { not: null } } : {}),
  ...(f.q ? { sku: { contains: f.q, mode: "insensitive" as const } } : {}),
});

/** Βάζει στην ουρά ό,τι ταιριάζει στο φίλτρο, εκτός από τις εξαιρέσεις. Γραμμές με `problem` δεν μπαίνουν. */
export async function enqueue(feedId: string, sel: Selection): Promise<{ queued: number; skipped: number }> {
  const feed = await loadFeed(feedId);
  if (!feed.active) throw new UserError("Το feed αυτού του προμηθευτή είναι ανενεργό — ενεργοποίησέ το από το πρώτο βήμα για να γίνει εισαγωγή.");
  // Η παράλειψη είναι απόφαση του χρήστη, όχι φίλτρο: γραμμή παραλειπόμενης μάρκας ΔΕΝ μπαίνει ποτέ στην ουρά, ό,τι
  // κι αν λέει το φίλτρο. Ο τρόπος να μπει είναι να ξε-παραλειφθεί η μάρκα και να ξανατρέξει το feed.
  const where = { ...whereOf(feedId, sel.filter), problem: null, ...(sel.except.length ? { sku: { notIn: sel.except } } : {}), status: { not: "skipped" } };
  const skipped = await db.supplierFeedItem.count({ where: { ...whereOf(feedId, sel.filter), problem: { not: null } } });
  const r = await db.supplierFeedItem.updateMany({ where, data: { status: "queued", error: null } });
  if (feed.toSoftone !== sel.toSoftone) await db.supplierFeed.update({ where: { id: feedId }, data: { toSoftone: sel.toSoftone } });
  return { queued: r.count, skipped };
}

export interface Progress {
  total: number;
  queued: number;
  done: number;
  errors: number;
  /** φωτογραφίες: πόσες έχουν περάσει στη βιβλιοθήκη από όσες έχουν επιλεγεί στις γραμμές της ουράς */
  images: { done: number; total: number };
  running: boolean;
  writeOn: boolean;
}

/** Η πρόοδος διαβάζεται από τη βάση — επιβιώνει κλείσιμο καρτέλας. */
export async function progress(feedId: string): Promise<Progress> {
  const [by, rows, writeOn] = await Promise.all([
    db.supplierFeedItem.groupBy({ by: ["status"], where: { feedId }, _count: { _all: true } }),
    // Και τα «error»: οι φωτογραφίες τους έχουν ήδη περάσει στο Bunny και δεν πρέπει να εξαφανίζονται από τον μετρητή.
    db.supplierFeedItem.findMany({ where: { feedId, status: { in: ["queued", "importing", "done", "error"] } }, select: { images: true, assetIds: true } }),
    itemWriteEnabled(),
  ]);
  const n = (s: string) => by.find((b) => b.status === s)?._count._all ?? 0;
  let picked = 0, uploaded = 0;
  for (const r of rows) {
    picked += ((r.images ?? []) as string[]).length;
    uploaded += ((r.assetIds ?? []) as string[]).length;
  }
  return {
    total: by.reduce((a, b) => a + b._count._all, 0),
    queued: n("queued") + n("importing"),
    done: n("done"),
    errors: n("error"),
    images: { done: uploaded, total: picked },
    running: n("importing") > 0,
    writeOn,
  };
}

/** Μία φωτογραφία: κατέβασμα → βιβλιοθήκη (WebP, Bunny) → id. Αποτυχία → `null`, με το μήνυμα στον καλούντα. */
async function ingestImage(url: string, folderId: string, staffId: string | null): Promise<{ id: string } | { error: string }> {
  try {
    const { bytes, mime, url: final } = await fetchPublicBytes(url, { max: MAX_IMAGE_BYTES, accept: "image/*", timeoutMs: IMAGE_TIMEOUT_MS });
    if (!mime.startsWith("image/")) return { error: `Η διεύθυνση δεν είναι εικόνα (${mime || "χωρίς τύπο"}): ${url}` };
    const name = decodeURIComponent(new URL(final).pathname.split("/").pop() || "image.jpg");
    const asset = await ingest({ bytes, filename: name, mime, folderId, createdBy: staffId });
    return { id: asset.id };
  } catch (e) {
    return { error: `Φωτογραφία ${url}: ${e instanceof Error ? e.message : "δεν κατέβηκε"}` };
  }
}

export interface DrainResult {
  processed: number;
  images: number;
  errors: number;
  left: number;
  /** νέα είδη που μπήκαν σε αναμονή έγκρισης (SoftOne κλειστό ή έγκριση που λείπει) */
  pending: number;
  waiting: number;
}

/**
 * Αδειάζει μία παρτίδα της ουράς. Οι φωτογραφίες περνούν πρώτες (ανεξάρτητα από το SoftOne), μετά οι γραμμές μέσω της
 * **υπάρχουσας** μηχανής (`planForeign` + `applyForeign` σε «μόνο κενά»). Σφάλμα μιας γραμμής δεν ρίχνει την παρτίδα.
 */
export async function drain(feedId: string, max = BATCH, staffId: string | null = null): Promise<DrainResult> {
  const feed = await loadFeed(feedId);
  const headers = feed.cfg.headers ?? [];
  if (!headers.length) throw new UserError("Το feed δεν έχει αποθηκευμένη αντιστοίχιση — ξανακάνε το βήμα της αντιστοίχισης.");

  const batch = await db.supplierFeedItem.findMany({ where: { feedId, status: "queued" }, orderBy: { sku: "asc" }, take: max,
    select: { id: true, sku: true, payload: true, edits: true, images: true, assetIds: true, softone: true, productId: true } });
  if (!batch.length) return { processed: 0, images: 0, errors: 0, left: 0, pending: 0, waiting: 0 };
  await db.supplierFeedItem.updateMany({ where: { id: { in: batch.map((b) => b.id) } }, data: { status: "importing" } });

  // ---- 1. Φωτογραφίες → βιβλιοθήκη / Bunny, με τη σειρά του χρήστη ----
  const folderId = await productFolderId();
  const rowErrors = new Map<string, string[]>();
  const fail = (id: string, msg: string) => rowErrors.set(id, [...(rowErrors.get(id) ?? []), msg]);
  let images = 0;
  for (const it of batch) {
    const urls = ((it.images ?? []) as string[]).slice(0, MAX_IMAGES);
    const already = ((it.assetIds ?? []) as string[]);
    if (!urls.length || already.length >= urls.length) continue;
    const ids: string[] = [];
    for (const url of urls) {
      const r = await ingestImage(url, folderId, staffId);
      if ("error" in r) { fail(it.id, r.error); continue; }
      ids.push(r.id); images++;
    }
    if (ids.length) await db.supplierFeedItem.update({ where: { id: it.id }, data: { assetIds: ids } });
  }

  // ---- 2. Γραμμές → υπάρχουσα μηχανή ----
  const matrix: string[][] = [headers];
  const rowOf = new Map<number, (typeof batch)[number]>();
  batch.forEach((it) => {
    const { merged } = mergeEdits((it.payload ?? {}) as Record<string, string>, (it.edits ?? null) as Record<string, string> | null);
    const at = matrix.push(headers.map((h) => merged[h] ?? "")) - 1;
    // Το `toRows` αριθμεί τις γραμμές όπως το Excel: `rowNo = δείκτης πίνακα + 1`, άρα η πρώτη γραμμή δεδομένων
    // (δείκτης 1, κάτω από τις επικεφαλίδες) είναι η γραμμή 2. Χωρίς αυτό το +1 το `applyForeign` δεν βρίσκει καμία.
    rowOf.set(at + 1, it);
  });
  const config = configForHeaders(feed.cfg.saved, headers);
  let pending = 0, waiting = 0;
  try {
    const plan = await planForeign({ fileName: `${XML_JOB_PREFIX}${feed.supplier.name}`, sheet: matrix, headerRow: 0, config }, staffId);
    const res = await applyForeign(plan.jobId, [...rowOf.keys()], staffId);
    pending = res.pending; waiting = res.waiting;
    for (const e of res.errors) { const it = rowOf.get(e.rowNo); if (it) fail(it.id, e.error); }
  } catch (e) {
    // Αποτυχία του σχεδίου αφορά όλη την παρτίδα — κάθε γραμμή παίρνει το μήνυμα, καμία δεν μένει σε «importing».
    for (const it of batch) fail(it.id, e instanceof Error ? e.message : "Η εισαγωγή απέτυχε.");
  }

  // ---- 3. Αποτελέσματα ανά γραμμή ----
  for (const it of batch) {
    const errs = rowErrors.get(it.id);
    await db.supplierFeedItem.update({ where: { id: it.id }, data: errs?.length ? { status: "error", error: errs.join(" · ") } : { status: "done", error: null } });
  }

  const [left, errors] = await Promise.all([
    db.supplierFeedItem.count({ where: { feedId, status: "queued" } }),
    db.supplierFeedItem.count({ where: { feedId, status: "error" } }),
  ]);
  return { processed: batch.length, images, errors, left, pending, waiting };
}

/** Πρόθεμα στο `ImportJob.fileName` ώστε τα jobs του XML να μη γεμίζουν τις «Πρόσφατες εισαγωγές» του Excel. */
export const XML_JOB_PREFIX = "XML · ";

/**
 * Δένει τις φωτογραφίες που είναι ήδη στο Bunny σε προϊόντα που γεννήθηκαν μετά (έγκριση νέου είδους). Τρέχει όσες
 * φορές θέλει: ό,τι είναι ήδη δεμένο το αγνοεί το `attachAssets`.
 */
export async function attachPendingImages(feedId: string): Promise<{ attached: number }> {
  const rows = await db.supplierFeedItem.findMany({ where: { feedId, productId: { not: null } }, select: { id: true, productId: true, assetIds: true } });
  let attached = 0;
  for (const r of rows) {
    const ids = ((r.assetIds ?? []) as string[]).filter(Boolean);
    if (!ids.length || !r.productId) continue;
    const { added } = await attachAssets(r.productId, ids, "gallery");
    attached += added.length;
  }
  return { attached };
}

export type { Diff };
