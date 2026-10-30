import "server-only";
import { db } from "@/lib/db";
import { fetchPublicBytes } from "@/lib/net/safe-fetch";
import { ingest } from "@/lib/media/repo";
import { attachAssets, productFolderId } from "@/lib/catalog/product-images";
import { configForHeaders, UserError } from "@/lib/catalog/foreign-import/core";
import { planForeign, applyForeign, type ForeignPlanRow } from "@/lib/catalog/foreign-import/server";
import { linkRows, mediaOff, type LinkRow } from "@/lib/catalog/xml-import/link-core";
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
export async function enqueue(feedId: string, sel: Selection): Promise<{ queued: number; skipped: number; notChosen: number }> {
  const feed = await loadFeed(feedId);
  if (!feed.active) throw new UserError("Το feed αυτού του προμηθευτή είναι ανενεργό — ενεργοποίησέ το από το πρώτο βήμα για να γίνει εισαγωγή.");
  // Η παράλειψη είναι απόφαση του χρήστη, όχι φίλτρο: γραμμή παραλειπόμενης μάρκας ΔΕΝ μπαίνει ποτέ στην ουρά, ό,τι
  // κι αν λέει το φίλτρο. Ο τρόπος να μπει είναι να ξε-παραλειφθεί η μάρκα και να ξανατρέξει το feed.
  const base = { ...whereOf(feedId, sel.filter), problem: null, ...(sel.except.length ? { sku: { notIn: sel.except } } : {}), status: { not: "skipped" } };
  // Νέο είδος (κατά τον «Έλεγχο με SoftOne») που ο χρήστης δεν διάλεξε για το SoftOne δεν μπαίνει στην ουρά.
  // Ρητό `null` στο s1Status: το Prisma `not` αποκλείει σιωπηλά τα NULL (γραμμές που δεν ελέγχθηκαν ποτέ = όπως πριν).
  const chosen = { OR: [{ s1Status: null }, { s1Status: { not: "new" } }, { softone: true }, ...(sel.toSoftone ? [{ softone: null }] : [])] };
  const where = { AND: [base, chosen] };
  const [skipped, notChosen] = await Promise.all([
    db.supplierFeedItem.count({ where: { ...whereOf(feedId, sel.filter), problem: { not: null } } }),
    db.supplierFeedItem.count({ where: { AND: [base, { NOT: chosen }] } }),
  ]);
  const r = await db.supplierFeedItem.updateMany({ where, data: { status: "queued", error: null } });
  if (feed.toSoftone !== sel.toSoftone) await db.supplierFeed.update({ where: { id: feedId }, data: { toSoftone: sel.toSoftone } });
  await db.supplierFeed.update({ where: { id: feedId }, data: { importMessage: `Στην ουρά: ${r.count.toLocaleString("el-GR")} προϊόντα${notChosen ? ` · ${notChosen.toLocaleString("el-GR")} νέα δεν επιλέχθηκαν για το SoftOne και δεν μπήκαν` : ""}${skipped ? ` · ${skipped} με πρόβλημα παραλείφθηκαν` : ""}. Η εισαγωγή τρέχει στον server· αν διακοπεί, συνεχίζει μόνη της.` } });
  return { queued: r.count, skipped, notChosen };
}

/** Γραμμή που έμεινε σε «importing» (deploy ή πτώση στη μέση της παρτίδας) γυρνά στην ουρά — η εισαγωγή είναι ασφαλής σε επανάληψη. */
export async function recoverStale(feedId?: string, olderMin = 10): Promise<number> {
  const r = await db.supplierFeedItem.updateMany({ where: { ...(feedId ? { feedId } : {}), status: "importing", updatedAt: { lt: new Date(Date.now() - olderMin * 60_000) } }, data: { status: "queued" } });
  return r.count;
}

/**
 * Για τον scheduler: αδειάζει τις ουρές όλων των feeds για έως `budgetMs`, ώστε η εισαγωγή να μη χρειάζεται ανοιχτή
 * καρτέλα. Όταν μια ουρά αδειάσει, γράφει στο feed ένα καθαρό μήνυμα ολοκλήρωσης (ή σφαλμάτων).
 */
export async function drainAll(budgetMs = 150_000): Promise<{ ok: boolean; message: string; idle?: boolean }> {
  const revived = await recoverStale();
  const feeds = await db.supplierFeedItem.groupBy({ by: ["feedId"], where: { status: "queued" }, _count: { _all: true } });
  if (!feeds.length) return { ok: true, message: "Καμία εισαγωγή σε αναμονή.", idle: !revived };
  const t0 = Date.now(), out: string[] = [];
  let ok = true;
  for (const f of feeds) {
    let processed = 0, errors = 0, pending = 0, left = f._count._all;
    try {
      while (left > 0 && Date.now() - t0 < budgetMs) {
        const r = await drain(f.feedId, BATCH, null);
        processed += r.processed; errors = r.errors; pending += r.pending; left = r.left;
        if (!r.processed) break;
      }
    } catch (e) {
      ok = false;
      const msg = `Η εισαγωγή σταμάτησε: ${e instanceof Error ? e.message : String(e)}. Οι γραμμές που έμειναν είναι ακόμη στην ουρά.`;
      await db.supplierFeed.update({ where: { id: f.feedId }, data: { importMessage: msg } });
      out.push(msg);
      continue;
    }
    if (left === 0) {
      const msg = `Η εισαγωγή ολοκληρώθηκε${errors ? ` με ${errors.toLocaleString("el-GR")} σφάλματα (δες «Σφάλματα» στη λίστα)` : " χωρίς σφάλματα"}${pending ? ` · ${pending.toLocaleString("el-GR")} νέα είδη περιμένουν έγκριση στα «Νέα είδη»` : ""}.`;
      await db.supplierFeed.update({ where: { id: f.feedId }, data: { importMessage: msg } });
      out.push(msg);
    } else out.push(`${processed.toLocaleString("el-GR")} προϊόντα έγιναν, ${left.toLocaleString("el-GR")} απομένουν — συνεχίζει.`);
    if (errors) ok = false;
  }
  return { ok, message: out.join(" · ") };
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

  const found = await db.supplierFeedItem.findMany({ where: { feedId, status: "queued" }, orderBy: { sku: "asc" }, take: max,
    select: { id: true, sku: true, payload: true, edits: true, images: true, assetIds: true, softone: true, productId: true, pendingItemId: true, mtrl: true } });
  // Ατομική δέσμευση ανά γραμμή: ο browser και ο scheduler μπορεί να αδειάζουν μαζί — καθένας κρατά μόνο όσες πρόλαβε
  const claimed = await Promise.all(found.map((b) => db.supplierFeedItem.updateMany({ where: { id: b.id, status: "queued" }, data: { status: "importing" } }).then((r) => r.count === 1)));
  const batch = found.filter((_, i) => claimed[i]);
  if (!batch.length) return { processed: 0, images: 0, errors: 0, left: await db.supplierFeedItem.count({ where: { feedId, status: "queued" } }), pending: 0, waiting: 0 };

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
  // Οι φωτογραφίες βγαίνουν από την αντιστοίχιση που δίνουμε στη μηχανή: είναι ήδη στο Bunny (βήμα 1).
  const config = mediaOff(configForHeaders(feed.cfg.saved, headers));
  let pending = 0, waiting = 0;
  try {
    const plan = await planForeign({ fileName: `${XML_JOB_PREFIX}${feed.supplier.name}`, sheet: matrix, headerRow: 0, config, opts: { policy: feed.policy, priceMode: feed.priceMode === "retail" ? "retail" : "cost" } }, staffId);
    const res = await applyForeign(plan.jobId, [...rowOf.keys()], staffId);
    pending = res.pending; waiting = res.waiting;
    for (const e of res.errors) { const it = rowOf.get(e.rowNo); if (it) fail(it.id, e.error); }
    await linkBatch(plan.jobId, plan.rows, rowOf);
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

/**
 * Δένει τις γραμμές της παρτίδας με ό,τι έφτιαξαν: υπάρχον είδος → MTRL και προϊόν του καταλόγου, νέο είδος →
 * εγγραφή αναμονής. Χωρίς αυτό η «Δημοσίευση» δεν βλέπει ποτέ προϊόντα και οι φωτογραφίες δεν δένονται πουθενά.
 */
async function linkBatch(jobId: string, rows: ForeignPlanRow[], rowOf: Map<number, { id: string; productId: string | null; pendingItemId: string | null; mtrl: number | null }>): Promise<void> {
  const plan = new Map(rows.map((r) => [r.rowNo, { mtrl: r.mtrl ?? null }]));
  const mtrls = [...new Set(rows.map((r) => r.mtrl).filter((n): n is number => typeof n === "number"))];
  const [prods, pends] = await Promise.all([
    mtrls.length ? db.product.findMany({ where: { erpCode: { in: mtrls.map(String) } }, select: { id: true, erpCode: true } }) : Promise.resolve([]),
    db.pendingItem.findMany({ where: { jobId, rowNo: { in: [...rowOf.keys()] } }, select: { id: true, rowNo: true } }),
  ]);
  const productOfMtrl = new Map(prods.map((p) => [Number(p.erpCode), p.id]));
  const pendingOfRow = new Map(pends.map((p) => [p.rowNo, p.id]));
  const list: LinkRow[] = [...rowOf.entries()].map(([rowNo, it]) => ({ rowNo, itemId: it.id, productId: it.productId, pendingItemId: it.pendingItemId, mtrl: it.mtrl }));
  for (const patch of linkRows(list, plan, productOfMtrl, pendingOfRow)) {
    await db.supplierFeedItem.update({ where: { id: patch.itemId }, data: patch.data });
  }
}

/** Πρόθεμα στο `ImportJob.fileName` ώστε τα jobs του XML να μη γεμίζουν τις «Πρόσφατες εισαγωγές» του Excel. */
export const XML_JOB_PREFIX = "XML · ";

/**
 * Δένει τις φωτογραφίες που είναι ήδη στο Bunny σε προϊόντα που γεννήθηκαν μετά (έγκριση νέου είδους). Τρέχει όσες
 * φορές θέλει: ό,τι είναι ήδη δεμένο το αγνοεί το `attachAssets`.
 */
export async function attachPendingImages(feedId: string): Promise<{ attached: number }> {
  await catchUpProducts(feedId);
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

/**
 * Νέο είδος που εγκρίθηκε στο μεταξύ: η εγγραφή αναμονής έχει πια προϊόν, η γραμμή του feed όχι. Το αντιγράφουμε, ώστε
 * η «Δημοσίευση» να το μετρήσει και οι φωτογραφίες του να δεθούν. Τρέχει όσες φορές θέλει.
 */
export async function catchUpProducts(feedId: string): Promise<{ linked: number }> {
  const rows = await db.supplierFeedItem.findMany({ where: { feedId, productId: null, pendingItemId: { not: null } }, select: { id: true, pendingItemId: true } });
  if (!rows.length) return { linked: 0 };
  const pends = await db.pendingItem.findMany({ where: { id: { in: rows.map((r) => r.pendingItemId as string) }, productId: { not: null } }, select: { id: true, productId: true, mtrl: true } });
  const by = new Map(pends.map((p) => [p.id, p]));
  let linked = 0;
  for (const r of rows) {
    const p = by.get(r.pendingItemId as string);
    if (!p?.productId) continue;
    await db.supplierFeedItem.update({ where: { id: r.id }, data: { productId: p.productId, ...(p.mtrl ? { mtrl: p.mtrl } : {}) } });
    linked++;
  }
  return { linked };
}

export type { Diff };
