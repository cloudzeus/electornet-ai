import "server-only";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { downloadFeed, RateLimited } from "@/lib/catalog/xml-import/download";
import { planFetch, clampMinFetch, waitMinutes, type FetchIntent, type SnapshotInfo } from "@/lib/catalog/xml-import/cache-core";

/**
 * Το ακατέργαστο XML κάθε feed, αποθηκευμένο συμπιεσμένο στη βάση (`FeedSnapshot`).
 *
 * Γιατί: ο προμηθευτής έχει όριο στις λήψεις (ο δοκιμασμένος: 2 την ώρα). Ο οδηγός θέλει τα ίδια bytes σε τέσσερα
 * σημεία (έλεγχος → προτάσεις → φόρτωση → αλλαγή αντιστοίχισης και νέα φόρτωση), και μια αλλαγή στην αντιστοίχιση
 * πρέπει να μπορεί να ξαναπεραστεί **χωρίς καμία επαφή** με τον προμηθευτή. Κλειδί είναι η διεύθυνση και όχι το feed:
 * στο βήμα ② δεν υπάρχει ακόμη γραμμή `SupplierFeed`.
 */

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const keyOf = (url: string) => sha(url.trim());

export interface FeedFetch {
  bytes: Buffer;
  from: "snapshot" | "download";
  /** πότε κατέβηκε το XML που επιστρέφεται */
  fetchedAt: Date;
  /** λεπτά μέχρι να επιτρέπεται νέα λήψη */
  waitMin: number;
  /** το αποθηκευμένο XML δόθηκε επειδή ο προμηθευτής απάντησε 429 */
  rateLimited: boolean;
  bytesLen: number;
}

/** Τι κρατάμε για αυτή τη διεύθυνση, χωρίς να διαβαστούν τα bytes. */
export async function snapshotOf(url: string): Promise<(SnapshotInfo & { sha256: string }) | null> {
  const row = await db.feedSnapshot.findUnique({ where: { urlKey: keyOf(url) }, select: { fetchedAt: true, bytes: true, products: true, sha256: true } });
  return row ? { fetchedAt: row.fetchedAt, bytes: row.bytes, products: row.products, sha256: row.sha256 } : null;
}

/** Η κατάσταση του αποθηκευμένου XML όπως τη δείχνει το UI. */
export async function snapshotState(url: string, minFetchMin: number) {
  const snap = await snapshotOf(url);
  return {
    has: !!snap,
    fetchedAt: snap?.fetchedAt ?? null,
    bytes: snap?.bytes ?? null,
    products: snap?.products ?? null,
    waitMin: waitMinutes(new Date(), snap?.fetchedAt ?? null, clampMinFetch(minFetchMin)),
  };
}

async function saveSnapshot(url: string, bytes: Buffer): Promise<Date> {
  const fetchedAt = new Date();
  const data = { url: url.trim(), gz: gzipSync(bytes, { level: 6 }), bytes: bytes.length, sha256: sha(bytes), fetchedAt };
  // Ένα στιγμιότυπο ανά διεύθυνση: η νέα λήψη αντικαθιστά την παλιά — δεν κρατάμε ιστορικό από XML προμηθευτών.
  await db.feedSnapshot.upsert({ where: { urlKey: keyOf(url) }, create: { urlKey: keyOf(url), ...data }, update: data });
  return fetchedAt;
}

/** Πόσα προϊόντα είχε το αποθηκευμένο XML — γράφεται αφού το διαβάσει ο καλών, για να φαίνεται στο UI. */
export async function setSnapshotProducts(url: string, products: number): Promise<void> {
  await db.feedSnapshot.updateMany({ where: { urlKey: keyOf(url) }, data: { products } });
}

async function readSnapshot(url: string): Promise<{ bytes: Buffer; fetchedAt: Date } | null> {
  const row = await db.feedSnapshot.findUnique({ where: { urlKey: keyOf(url) }, select: { gz: true, fetchedAt: true } });
  return row ? { bytes: gunzipSync(Buffer.from(row.gz)), fetchedAt: row.fetchedAt } : null;
}

/**
 * Τα bytes του feed, από το αποθηκευμένο XML ή με νέα λήψη.
 *
 * `intent: "reuse"` (προεπιλογή) δεν αγγίζει ποτέ τον προμηθευτή όταν υπάρχει αποθηκευμένο XML. `intent: "fresh"`
 * ζητά νέα λήψη, αλλά σέβεται το όριο του προμηθευτή — και αν ο προμηθευτής απαντήσει 429 παρ' όλα αυτά, γυρνά στο
 * αποθηκευμένο XML αντί να αποτύχει.
 */
export async function feedBytes(url: string, opts: { intent?: FetchIntent; minFetchMin?: number } = {}): Promise<FeedFetch> {
  const u = url.trim();
  const minFetchMin = clampMinFetch(opts.minFetchMin ?? 30);
  const info = await snapshotOf(u);
  const plan = planFetch(new Date(), info, { minFetchMin, intent: opts.intent ?? "reuse" });

  if (plan.use === "snapshot") {
    const snap = await readSnapshot(u);
    // Το στιγμιότυπο μπορεί να χάθηκε ανάμεσα στις δύο αναγνώσεις (καθάρισμα): τότε κατεβάζουμε.
    if (snap) return { bytes: snap.bytes, from: "snapshot", fetchedAt: snap.fetchedAt, waitMin: plan.waitMin, rateLimited: false, bytesLen: snap.bytes.length };
  }

  try {
    const bytes = await downloadFeed(u);
    const fetchedAt = await saveSnapshot(u, bytes);
    return { bytes, from: "download", fetchedAt, waitMin: minFetchMin, rateLimited: false, bytesLen: bytes.length };
  } catch (e) {
    if (!(e instanceof RateLimited)) throw e;
    const snap = await readSnapshot(u);
    if (!snap) throw e;
    return { bytes: snap.bytes, from: "snapshot", fetchedAt: snap.fetchedAt, waitMin: Math.max(1, plan.waitMin), rateLimited: true, bytesLen: snap.bytes.length };
  }
}

/** Καθάρισμα: στιγμιότυπα που δεν ανήκουν σε κανένα feed και είναι παλιότερα από `days` ημέρες. */
export async function pruneSnapshots(days = 30): Promise<number> {
  const urls = (await db.supplierFeed.findMany({ select: { url: true } })).map((f) => keyOf(f.url));
  const r = await db.feedSnapshot.deleteMany({ where: { urlKey: { notIn: urls.length ? urls : ["-"] }, fetchedAt: { lt: new Date(Date.now() - days * 86_400_000) } } });
  return r.count;
}
