import "server-only";
import { db } from "@/lib/db";
import { fetchPublicBytes } from "@/lib/net/safe-fetch";
import { specFingerprint, isProductImageUrl, blockedHost } from "./enrich-core";
import { readProductPage } from "./enrich-page";
import { uploadProductImage } from "./product-images";
import type { EnrichResult } from "./enrich";

/**
 * Προτάσεις εμπλουτισμού προς έγκριση (`EnrichSuggestion`):
 *  - φωτογραφίες από τη γκαλερί του Icecat, τη σελίδα του κατασκευαστή ή άλλου καταστήματος (όσες δηλώνει η σελίδα —
 *    JSON-LD / og:image — και όσες έδωσε η αναζήτηση). Κατεβαίνουν στη βιβλιοθήκη ΜΟΝΟ με «Έγκριση».
 *  - χαρακτηριστικά από άλλα καταστήματα (πηγή «shop»): με «Έγκριση» γράφονται στην αναλυτική περιγραφή του SoftOne
 *    (όπως η «Πρόταση από την απόδελτίωση») και από εκεί στο e-shop· αν η εγγραφή στο SoftOne είναι κλειστή, μόνο στο e-shop.
 *  - τα επίσημα χαρακτηριστικά (Icecat / κατασκευαστής) μπαίνουν αμέσως στο e-shop· στο SoftOne μόνο με επιλογή του χρήστη.
 * Τα κείμενα και οι εικόνες τρίτων έχουν δικαιώματα: η έγκριση σημαίνει ότι ο διαχειριστής έλεγξε ότι μπορούν να χρησιμοποιηθούν.
 */
export const SHOP_GROUP = "Χαρακτηριστικά (άλλα καταστήματα)";
export const SUGGEST_SOURCE_LABEL: Record<string, string> = { icecat: "Icecat", web: "Site κατασκευαστή", shop: "Άλλο κατάστημα" };
const MAX_IMAGE = 25 * 1024 * 1024;
const EXT_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif" };

/** Από ένα αποτέλεσμα πηγής → προτάσεις (χωρίς διπλά και χωρίς όσα έχει ήδη το προϊόν). */
export async function suggestFromResult(productId: string, r: EnrichResult) {
  let images = [...(r.images ?? [])];
  let pageNote: string | undefined;
  // η σελίδα της πηγής: οι φωτογραφίες που δηλώνει η ίδια είναι πιο αξιόπιστες από όσες «θυμάται» το AI
  if (r.source !== "icecat" && r.url) {
    const page = await readProductPage(r.url);
    if (page.ok) images = [...page.images, ...images]; else pageNote = page.reason;
  }
  images = [...new Set(images)].filter((u) => isProductImageUrl(u) && !blockedHost(u)).slice(0, 12);
  const have = await db.media.findMany({ where: { productId }, select: { url: true, importFile: true } });
  const known = new Set(have.flatMap((m) => [m.url, m.importFile]).filter(Boolean) as string[]);
  const data: { productId: string; source: string; kind: string; fingerprint: string; url?: string; group?: string; key?: string; value?: string; pageUrl?: string; sourceName?: string }[] = [];
  for (const u of images) if (!known.has(u)) data.push({ productId, source: r.source, kind: "image", fingerprint: u.slice(0, 1000), url: u, pageUrl: r.url, sourceName: r.sourceName });
  if (r.source === "shop") {
    const specs = await db.spec.findMany({ where: { productId }, select: { key: true } });
    const keys = new Set(specs.map((s) => s.key.toLowerCase().trim()));
    for (const s of r.specs) if (!keys.has(s.key.toLowerCase().trim())) data.push({ productId, source: r.source, kind: "spec", fingerprint: specFingerprint(s.group, s.key), group: s.group.slice(0, 120), key: s.key.slice(0, 120), value: s.value, pageUrl: r.url, sourceName: r.sourceName });
  }
  const res = data.length ? await db.enrichSuggestion.createMany({ data, skipDuplicates: true }) : { count: 0 };
  return { added: res.count, pageNote };
}

export type SuggestionDTO = { id: string; source: string; kind: "image" | "spec"; url: string | null; group: string | null; key: string | null; value: string | null; pageUrl: string | null; sourceName: string | null; createdAt: string };

export async function listSuggestions(productId: string): Promise<SuggestionDTO[]> {
  const rows = await db.enrichSuggestion.findMany({ where: { productId, status: "pending" }, orderBy: [{ kind: "asc" }, { source: "asc" }, { createdAt: "asc" }] });
  return rows.map((s) => ({ id: s.id, source: s.source, kind: s.kind as "image" | "spec", url: s.url, group: s.group, key: s.key, value: s.value, pageUrl: s.pageUrl, sourceName: s.sourceName, createdAt: s.createdAt.toISOString() }));
}

export const pendingRows = (productId: string, ids: string[]) => db.enrichSuggestion.findMany({ where: { productId, id: { in: ids }, status: "pending" } });
type Row = Awaited<ReturnType<typeof pendingRows>>[number];

export async function markApproved(ids: string[], staffId: string | null) {
  if (ids.length) await db.enrichSuggestion.updateMany({ where: { id: { in: ids } }, data: { status: "approved", decidedById: staffId, decidedAt: new Date() } });
}

/** Έγκριση φωτογραφιών: κατεβαίνουν και μπαίνουν στο τέλος της γκαλερί. */
export async function approveImages(productId: string, rows: Row[], staffId: string | null) {
  const done: string[] = [], failed: { id: string; message: string }[] = [];
  for (const s of rows.filter((x) => x.kind === "image" && x.url)) {
    try {
      const f = await fetchPublicBytes(s.url!, { max: MAX_IMAGE, accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" });
      const ext = /\.(\w{3,4})(?:$|\?)/.exec(new URL(f.url).pathname)?.[1]?.toLowerCase() ?? "";
      const mime = f.mime.startsWith("image/") && f.mime !== "image/svg+xml" && f.mime !== "image/gif" ? f.mime : EXT_MIME[ext];
      if (!mime) throw new Error(`δεν είναι εικόνα (${f.mime || "άγνωστος τύπος"})`);
      const name = decodeURIComponent(new URL(f.url).pathname.split("/").pop() || "photo").slice(0, 120);
      const img = await uploadProductImage(productId, { bytes: f.bytes, filename: name, mime }, staffId);
      await db.media.update({ where: { id: img.id }, data: { importFile: s.url, source: `enrich-${s.source}` } });
      done.push(s.id);
    } catch (e) { failed.push({ id: s.id, message: (e as Error).message.slice(0, 160) }); }
  }
  await markApproved(done, staffId);
  return { images: done.length, failed };
}

/** Χαρακτηριστικά καταστήματος μόνο στο e-shop (όταν η εγγραφή στο SoftOne δεν είναι δυνατή). */
export async function approveSpecsEshopOnly(productId: string, rows: Row[], staffId: string | null) {
  const specs = rows.filter((x) => x.kind === "spec" && x.key && x.value);
  if (!specs.length) return 0;
  const last = await db.spec.aggregate({ where: { productId, source: "shop" }, _max: { sortNo: true } });
  let n = Math.max(2000, last._max.sortNo ?? 0);
  await db.spec.createMany({ data: specs.map((s) => ({ productId, groupName: `${SHOP_GROUP} · ${s.group ?? "Τεχνικά χαρακτηριστικά"}`.slice(0, 120), key: s.key!, value: s.value!, sortNo: ++n, source: "shop" })) });
  await markApproved(specs.map((s) => s.id), staffId);
  return specs.length;
}

/**
 * Μετά την εγγραφή στο SoftOne τα ίδια κλειδιά έρχονται από την περιγραφή του ERP (s1-desc): οι γραμμές των εξωτερικών
 * πηγών με ίδιο κλειδί φεύγουν, για να μη φαίνονται διπλά στο site.
 */
export async function dropExternalDuplicates(productId: string) {
  const erp = await db.spec.findMany({ where: { productId, source: "s1-desc" }, select: { key: true } });
  const keys = new Set(erp.map((s) => s.key.toLowerCase().trim()));
  const ext = await db.spec.findMany({ where: { productId, source: { in: ["icecat", "web", "shop"] } }, select: { id: true, key: true } });
  const ids = ext.filter((s) => keys.has(s.key.toLowerCase().trim())).map((s) => s.id);
  if (ids.length) await db.spec.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

export type OfficialSpecDTO = { id: string; source: string; group: string; key: string; value: string };
const GROUP_PREFIX = /^(Επίσημα χαρακτηριστικά \((Icecat|κατασκευαστής)\)|Χαρακτηριστικά \(άλλα καταστήματα\)) · /;

/** Επίσημα χαρακτηριστικά (Icecat / κατασκευαστής / εγκεκριμένα καταστημάτων) που δεν υπάρχουν ακόμη στο SoftOne. */
export async function externalSpecsNotInErp(productId: string): Promise<OfficialSpecDTO[]> {
  const rows = await db.spec.findMany({ where: { productId, source: { in: ["icecat", "web", "shop", "s1-desc"] } }, orderBy: [{ sortNo: "asc" }, { id: "asc" }], select: { id: true, source: true, groupName: true, key: true, value: true } });
  const erp = new Set(rows.filter((s) => s.source === "s1-desc").map((s) => s.key.toLowerCase().trim()));
  return rows.filter((s) => s.source !== "s1-desc" && !erp.has(s.key.toLowerCase().trim())).map((s) => ({ id: s.id, source: s.source!, group: s.groupName.replace(GROUP_PREFIX, ""), key: s.key, value: s.value }));
}

export async function rejectSuggestions(productId: string, ids: string[], staffId: string | null) {
  const r = await db.enrichSuggestion.updateMany({ where: { productId, id: { in: ids }, status: "pending" }, data: { status: "rejected", decidedById: staffId, decidedAt: new Date() } });
  return { rejected: r.count };
}
