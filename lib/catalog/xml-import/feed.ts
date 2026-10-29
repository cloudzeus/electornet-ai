import "server-only";
import { db } from "@/lib/db";
import { MAX_FEED_BYTES } from "@/lib/catalog/xml-import/download";
import { feedBytes, setSnapshotProducts } from "@/lib/catalog/xml-import/snapshot";
import { clampMinFetch } from "@/lib/catalog/xml-import/cache-core";
import { UserError, configToSaved, configForHeaders, type MappingConfig, type SavedConfig, type Target } from "@/lib/catalog/foreign-import/core";
import { parseFeed, CATEGORY_PAIR } from "@/lib/catalog/xml-import/parse-core";
import { applyTransform, type Transform, type PriceMode } from "@/lib/catalog/xml-import/transform-core";
import { diffItems, type Diff } from "@/lib/catalog/xml-import/diff-core";
import { statusFor } from "@/lib/catalog/xml-import/skip-core";

/**
 * Το feed ενός προμηθευτή: έλεγχος, αποθήκευση αντιστοίχισης, φόρτωση σε `SupplierFeedItem`, και λίστα με φίλτρα.
 *
 * Η αντιστοίχιση αποθηκεύεται με κλειδί **κανονικοποιημένη επικεφαλίδα** (υπάρχον `configToSaved`), ώστε να ισχύει
 * ακόμη κι αν ο προμηθευτής αλλάξει τη σειρά των tags. Το ίδιο και οι μετατροπές μονάδων.
 *
 * Σε κάθε τρέξιμο το `payload` ξαναγράφεται, τα `edits` του χρήστη **δεν αγγίζονται ποτέ**, και προϊόν που δεν ήρθε
 * σημαίνεται `gone` — χωρίς καμία επίπτωση στα δικά μας προϊόντα.
 */

export { MAX_FEED_BYTES };
const CHUNK = 500;

export interface FeedConfig {
  /** στήλες με κλειδί επικεφαλίδας (όπως το αποθηκεύει το `configToSaved`) */
  saved: SavedConfig;
  /** η σειρά των επικεφαλίδων όπως τη δούλεψε ο χρήστης — η ουρά ξαναχτίζει τον πίνακα από τα payload με αυτή */
  headers: string[];
  /** μετατροπή μονάδας ανά επικεφαλίδα */
  transforms: Record<string, Transform>;
  /**
   * Οι επικεφαλίδες που ο χρήστης άφησε ρητά «Αγνόηση». Το `configToSaved` κρατά μόνο τις στήλες που έχουν στόχο, άρα
   * χωρίς αυτό η «αγνόηση» δεν θα ήταν απόφαση: στο επόμενο άνοιγμα της αντιστοίχισης η στήλη θα ξαναρωτιόταν — και
   * μάλιστα στο AI.
   */
  ignored?: string[];
  /**
   * Μάρκες του προμηθευτή που ο χρήστης αποφάσισε να ΜΗΝ εισάγει. Τα προϊόντα τους φορτώνονται (για να φαίνεται τι
   * αφήνουμε απ' έξω) αλλά δεν μπαίνουν ποτέ στην ουρά.
   */
  skipBrands?: string[];
  priceMode: PriceMode;
  toSoftone: boolean;
}

export interface Inspection {
  counts: ReturnType<typeof parseFeed>["counts"];
  headers: string[];
  /** το πρώτο προϊόν ακατέργαστο, μόνο τα μη κενά — ο χρήστης το βλέπει πριν δεσμευτεί */
  sample: Record<string, string>;
  bytes: number;
}

/**
 * Από πού έρχονται τα bytes του feed. Εξ ορισμού από το **αποθηκευμένο XML** της τελευταίας λήψης (`FeedSnapshot`),
 * και μόνο αν δεν υπάρχει γίνεται λήψη: ο προμηθευτής βάζει όριο (ο δοκιμασμένος: 2 λήψεις την ώρα) και τα βήματα του
 * οδηγού θέλουν πολλές φορές τα ίδια bytes. Η παράμετρος υπάρχει ώστε ο καλών να ζητήσει ρητά νέα λήψη — και για να
 * ελέγχεται η φόρτωση χωρίς δίκτυο.
 */
export type FeedSource = (url: string) => Promise<Buffer>;

/** Η προεπιλεγμένη πηγή: ό,τι έχουμε αποθηκευμένο, αλλιώς λήψη. */
export const storedOrDownload: FeedSource = async (url) => (await feedBytes(url, { intent: "reuse" })).bytes;

/** Βήμα ②: τι περιέχει το feed, χωρίς να αποθηκευτεί τίποτα. */
export async function inspectFeed(url: string, source: FeedSource = storedOrDownload): Promise<Inspection> {
  const bytes = await source(url);
  const parsed = parseFeed(bytes);
  if (!parsed.counts.products) throw new UserError("Το feed κατέβηκε αλλά δεν βρέθηκε κανένα προϊόν μέσα του.");
  const sample: Record<string, string> = {};
  parsed.headers.forEach((h, i) => { const v = parsed.matrix[1]?.[i]; if (v) sample[h] = v; });
  return { counts: parsed.counts, headers: parsed.headers, sample, bytes: bytes.length };
}

/** Βήμα ③ → αποθήκευση: η αντιστοίχιση με δείκτες γίνεται αντιστοίχιση με επικεφαλίδες. Υπάρχον feed του προμηθευτή ενημερώνεται. */
export async function saveFeed(
  supplierId: string,
  url: string,
  input: { config: MappingConfig; headers: string[]; transforms: Record<string, Transform>; priceMode: PriceMode; toSoftone: boolean; minFetchMin?: number; skipBrands?: string[] },
  staffId: string | null,
): Promise<string> {
  const supplier = await db.supplier.findUnique({ where: { id: supplierId }, select: { id: true } });
  if (!supplier) throw new UserError("Ο προμηθευτής δεν βρέθηκε — ξανακάνε αναζήτηση.");
  const cfg: FeedConfig = {
    saved: configToSaved(input.config, input.headers),
    headers: input.headers,
    transforms: input.transforms,
    ignored: input.headers.filter((_, i) => { const t = input.config.columns[i]; return !t || t.kind === "ignore"; }),
    skipBrands: input.skipBrands ?? [],
    priceMode: input.priceMode,
    toSoftone: input.toSoftone,
  };
  const minFetchMin = clampMinFetch(input.minFetchMin ?? 30);
  const existing = await db.supplierFeed.findFirst({ where: { supplierId }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (existing) {
    await db.supplierFeed.update({ where: { id: existing.id }, data: { url, config: cfg as object, priceMode: cfg.priceMode, toSoftone: cfg.toSoftone, minFetchMin } });
    return existing.id;
  }
  const feed = await db.supplierFeed.create({ data: { supplierId, url, config: cfg as object, priceMode: cfg.priceMode, toSoftone: cfg.toSoftone, minFetchMin, createdById: staffId }, select: { id: true } });
  return feed.id;
}

export async function loadFeed(feedId: string) {
  const feed = await db.supplierFeed.findUnique({ where: { id: feedId }, select: { id: true, url: true, config: true, priceMode: true, toSoftone: true, minFetchMin: true, supplier: { select: { id: true, name: true, code: true } } } });
  if (!feed) throw new UserError("Το feed δεν βρέθηκε.");
  return { ...feed, cfg: feed.config as unknown as FeedConfig };
}

/** Ποια στήλη κρατά τι, για ΑΥΤΕΣ τις επικεφαλίδες. */
function roles(cfg: FeedConfig, headers: string[]) {
  const config = configForHeaders(cfg.saved, headers);
  const is = (t: Target | undefined, kind: Target["kind"]) => t?.kind === kind;
  const idx = (pred: (t: Target) => boolean) => Object.entries(config.columns).filter(([, t]) => pred(t)).map(([i]) => Number(i)).sort((a, b) => a - b);
  return {
    config,
    sku: idx((t) => is(t, "field") && (t as { key: string }).key === "code")[0] ?? headers.indexOf("SKU"),
    images: idx((t) => is(t, "media") && (t as { type: string }).type === "image"),
    category: idx((t) => is(t, "category"))[0] ?? headers.indexOf(CATEGORY_PAIR),
    brand: idx((t) => is(t, "brand"))[0] ?? -1,
  };
}

export interface RunResult {
  total: number;
  counts: Record<Diff, number>;
  problems: number;
  /** πόσα προϊόντα του feed είχαν διορθώσεις που συγκρούονται με τη νέα τιμή */
  conflicts: number;
  /** πόσα προϊόντα παραλείπονται επειδή η μάρκα τους δεν εισάγεται */
  skipped: number;
}

/**
 * Κατέβασμα → ανάγνωση → μετατροπές → diff → αποθήκευση. Καμία επαφή με SoftOne και κανένα κατέβασμα φωτογραφίας:
 * αυτά γίνονται στην ουρά εισαγωγής, αφού ο χρήστης ελέγξει τη λίστα.
 */
export async function runFeed(feedId: string, source: FeedSource = storedOrDownload): Promise<RunResult> {
  const feed = await loadFeed(feedId);
  const parsed = parseFeed(await source(feed.url));
  if (!parsed.counts.products) throw new UserError("Το feed δεν έχει προϊόντα.");
  await setSnapshotProducts(feed.url, parsed.counts.products);
  const { headers, matrix } = parsed;
  const r = roles(feed.cfg, headers);

  // Μετατροπές μονάδων ανά στήλη, πριν από οτιδήποτε άλλο — η υπάρχουσα μηχανή δεν τις μαθαίνει ποτέ.
  const tr = headers.map((h) => feed.cfg.transforms[h] ?? "none");
  const incoming = matrix.slice(1).map((row, n) => {
    const payload: Record<string, string> = {};
    headers.forEach((h, i) => { const v = tr[i] === "none" ? row[i] : applyTransform(row[i], tr[i]); if (v) payload[h] = v; });
    return {
      sku: (r.sku >= 0 ? row[r.sku] : "") ?? "",
      payload,
      pos: n + 1,
      images: r.images.map((i) => row[i]).filter(Boolean),
      brand: (r.brand >= 0 ? row[r.brand] : "")?.trim() ?? "",
    };
  });

  const existing = await db.supplierFeedItem.findMany({ where: { feedId }, select: { id: true, sku: true, payload: true, edits: true, status: true } });
  const skipSet = new Set((feed.cfg.skipBrands ?? []).map((b) => b.trim()).filter(Boolean));
  const rows = diffItems(incoming.map(({ sku, payload, pos }) => ({ sku, payload, pos })), existing.map((e) => ({ sku: e.sku, payload: (e.payload ?? {}) as Record<string, string> })));
  const bySku = new Map(existing.map((e) => [e.sku, e]));
  const incBySku = new Map<string, (typeof incoming)[number]>();
  incoming.forEach((it, n) => { const k = it.sku.trim() || `#${n + 1}`; if (!incBySku.has(k)) incBySku.set(k, it); });

  const counts: Record<Diff, number> = { new: 0, changed: 0, same: 0, gone: 0 };
  let problems = 0, conflicts = 0, skipped = 0;
  const fresh: { feedId: string; sku: string; payload: object; images: object; diff: string; status: string; problem: string | null }[] = [];
  // Η βάση είναι απομακρυσμένη: 2.580 ξεχωριστά update θα ήταν 2.580 γύροι. Ξεχωριστή εγγραφή γίνεται ΜΟΝΟ όπου
  // άλλαξε πραγματικά το payload· τα «same» και τα «gone» πάνε με μαζικά updateMany.
  const sameIds: string[] = [], goneIds: string[] = [], toSkip: string[] = [], toReview: string[] = [];
  const changed: { id: string; payload: Record<string, string>; problem: string | null; status: string }[] = [];

  for (const row of rows) {
    counts[row.diff]++;
    if (row.problem) problems++;
    const was = bySku.get(row.sku);
    if (row.diff === "gone") {
      // Μόνο ένδειξη: τα δικά μας προϊόντα δεν αγγίζονται.
      if (was) goneIds.push(was.id);
      continue;
    }
    const it = incBySku.get(row.sku);
    if (!it) continue;
    const skip = !!it.brand && skipSet.has(it.brand);
    if (skip) skipped++;
    if (!was) {
      fresh.push({ feedId, sku: row.sku, payload: it.payload, images: it.images, diff: row.diff, status: statusFor(null, { problem: !!row.problem, skip })!, problem: row.problem ?? null });
      continue;
    }
    const edits = (was.edits ?? null) as Record<string, string> | null;
    if (edits) for (const [k, mine] of Object.entries(edits)) if (it.payload[k] !== undefined && it.payload[k] !== mine) { conflicts++; break; }
    // Το payload ξαναγράφεται· τα edits ΔΕΝ αγγίζονται.
    if (row.diff === "same") {
      sameIds.push(was.id);
      // Η παράλειψη ανάβει και σβήνει χωρίς νέο κατέβασμα: ο χρήστης αλλάζει γνώμη και ξαναπερνά το αποθηκευμένο XML.
      const next = statusFor(was.status, { problem: !!row.problem, skip });
      if (next === "skipped") toSkip.push(was.id);
      else if (next === "review") toReview.push(was.id);
    } else {
      changed.push({ id: was.id, payload: it.payload, problem: row.problem ?? null, status: skip ? "skipped" : "review" });
    }
  }

  for (let i = 0; i < fresh.length; i += CHUNK) await db.supplierFeedItem.createMany({ data: fresh.slice(i, i + CHUNK) });
  for (let i = 0; i < sameIds.length; i += CHUNK) await db.supplierFeedItem.updateMany({ where: { id: { in: sameIds.slice(i, i + CHUNK) }, diff: { not: "same" } }, data: { diff: "same" } });
  for (let i = 0; i < goneIds.length; i += CHUNK) await db.supplierFeedItem.updateMany({ where: { id: { in: goneIds.slice(i, i + CHUNK) }, diff: { not: "gone" } }, data: { diff: "gone" } });
  for (let i = 0; i < toSkip.length; i += CHUNK) await db.supplierFeedItem.updateMany({ where: { id: { in: toSkip.slice(i, i + CHUNK) } }, data: { status: "skipped" } });
  for (let i = 0; i < toReview.length; i += CHUNK) await db.supplierFeedItem.updateMany({ where: { id: { in: toReview.slice(i, i + CHUNK) } }, data: { status: "review" } });
  for (const c of changed) await db.supplierFeedItem.update({ where: { id: c.id }, data: { payload: c.payload, diff: "changed", problem: c.problem, status: c.status } });

  await db.supplierFeed.update({ where: { id: feedId }, data: { lastRunAt: new Date(), lastCount: incoming.length } });
  return { total: rows.length, counts, problems, conflicts, skipped };
}

export const PAGE = 50;
export interface ItemFilter { diff?: Diff; status?: string; problems?: boolean; q?: string; page?: number }

/** Η λίστα ελέγχου: server-side σελίδες και φίλτρα, με τα πλήθη για τα chips. */
export async function listItems(feedId: string, filter: ItemFilter = {}) {
  const where = {
    feedId,
    ...(filter.diff ? { diff: filter.diff } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.problems ? { problem: { not: null } } : {}),
    ...(filter.q ? { sku: { contains: filter.q, mode: "insensitive" as const } } : {}),
  };
  const page = Math.max(1, filter.page ?? 1);
  const [rows, total, byDiff, byStatus, problems] = await Promise.all([
    db.supplierFeedItem.findMany({ where, orderBy: { sku: "asc" }, skip: (page - 1) * PAGE, take: PAGE,
      select: { id: true, sku: true, payload: true, edits: true, images: true, assetIds: true, diff: true, status: true, softone: true, problem: true, mtrl: true, productId: true, error: true } }),
    db.supplierFeedItem.count({ where }),
    db.supplierFeedItem.groupBy({ by: ["diff"], where: { feedId }, _count: { _all: true } }),
    db.supplierFeedItem.groupBy({ by: ["status"], where: { feedId }, _count: { _all: true } }),
    db.supplierFeedItem.count({ where: { feedId, problem: { not: null } } }),
  ]);
  return {
    rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE)),
    counts: {
      diff: Object.fromEntries(byDiff.map((d) => [d.diff, d._count._all])) as Partial<Record<Diff, number>>,
      status: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Record<string, number>,
      problems,
    },
  };
}
