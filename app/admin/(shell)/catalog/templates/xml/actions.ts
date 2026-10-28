"use server";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { audit } from "@/lib/rbac/audit";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { resetCatalogCache } from "@/lib/data/db-catalog";
import { UserError, configForHeaders, type MappingConfig, type Target } from "@/lib/catalog/foreign-import/core";
import { encodeTarget, decodeTarget } from "@/lib/catalog/foreign-import/ui-core";
import { parseFeed, CATEGORY_PAIR } from "@/lib/catalog/xml-import/parse-core";
import { suggestMapping } from "@/lib/catalog/xml-import/suggest";
import { listSuppliers, syncSuppliers } from "@/lib/catalog/xml-import/suppliers";
import { fetchFeedBytes, inspectFeed, loadFeed, runFeed, saveFeed, listItems, type FeedSource, type ItemFilter } from "@/lib/catalog/xml-import/feed";
import { drain, enqueue, progress, type Selection } from "@/lib/catalog/xml-import/queue";
import { itemWriteEnabled } from "@/lib/softone/item-write";
import type { PriceMode } from "@/lib/catalog/xml-import/transform-core";
import type { Diff } from "@/lib/catalog/xml-import/diff-core";
import {
  MAX_VALUES, SAMPLES_SHOWN, toTransform,
  type FeedStateDTO, type InspectDTO, type ItemDTO, type ItemsDTO, type QueueDTO, type SuggestDTO, type SupplierCard,
} from "@/lib/catalog/xml-import/ui-core";

/**
 * Server actions του οδηγού «XML προμηθευτές». Λεπτό στρώμα γύρω από τις έτοιμες συναρτήσεις του
 * `lib/catalog/xml-import/*`: δικαίωμα, σειριοποίηση για τον browser, ίχνος στο audit.
 *
 * **Μία λήψη ανά πέρασμα του οδηγού.** Ο server του προμηθευτή απαντά 429 μετά από λίγες λήψεις, και τα τρία βήματα
 * (έλεγχος → προτάσεις → φόρτωση) θέλουν τα ίδια bytes. Γι' αυτό κρατιέται το τελευταίο feed στη μνήμη της διεργασίας:
 * αν χαθεί (άλλος worker, restart), ξανακατεβαίνει — και στο 429 ο χρήστης βλέπει «περίμενε λίγα λεπτά».
 */

const RESULT_ERROR = "Κάτι πήγε στραβά.";
const ok = <T>(v: T) => v;
type Fail = { error: string };

/** Το feed στη μνήμη: ένα τη φορά (6,8 MB το δείγμα), για λίγη ώρα. */
const CACHE_MS = 20 * 60_000;
let held: { url: string; bytes: Buffer; at: number } | null = null;

const cachedSource: FeedSource = async (url) => {
  if (held && held.url === url && Date.now() - held.at < CACHE_MS) return held.bytes;
  const bytes = await fetchFeedBytes(url);
  held = { url, bytes, at: Date.now() };
  return bytes;
};

/** Ό,τι πετάξει `UserError` γίνεται μήνυμα στον χρήστη· οτιδήποτε άλλο καταγράφεται και βγαίνει γενικό. */
async function guard<T>(where: string, fn: () => Promise<T>): Promise<T | Fail> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    console.error(`[xml-import/${where}]`, e);
    return { error: RESULT_ERROR };
  }
}

// ---------- Βήμα ①: προμηθευτής ----------

/** Οι προμηθευτές του SoftOne (cache) με το feed τους. Αναζήτηση σε κωδικό, όνομα ή ΑΦΜ. */
export async function findSuppliers(q: string): Promise<SupplierCard[]> {
  await requirePermission("catalog.products.write");
  const list = await listSuppliers(String(q ?? "").slice(0, 80));
  const feedIds = list.map((s) => s.feed?.id).filter((v): v is string => !!v);
  const items = feedIds.length
    ? await db.supplierFeedItem.groupBy({ by: ["feedId"], where: { feedId: { in: feedIds } }, _count: { _all: true } })
    : [];
  const byFeed = new Map(items.map((i) => [i.feedId, i._count._all]));
  return list.slice(0, 60).map((s) => ({
    id: s.id, s1Trdr: s.s1Trdr, code: s.code, name: s.name, afm: s.afm,
    feed: s.feed ? { id: s.feed.id, url: s.feed.url, lastRunAt: s.feed.lastRunAt?.toISOString() ?? null, lastCount: s.feed.lastCount, items: byFeed.get(s.feed.id) ?? 0 } : null,
  }));
}

/** Ανανέωση της λίστας προμηθευτών από το SoftOne. ΜΟΝΟ ανάγνωση — καμία εγγραφή στο ERP. */
export async function refreshSuppliers(): Promise<{ added: number; updated: number } | Fail> {
  const user = await requirePermission("catalog.products.write");
  return guard("suppliers", async () => {
    const r = await syncSuppliers();
    await audit(user.id, "catalog.xml-import.suppliers", "Supplier", null, null, r);
    return ok({ added: r.added, updated: r.updated });
  });
}

// ---------- Βήμα ②: έλεγχος feed ----------

/** Τι περιέχει το feed, χωρίς να αποθηκευτεί τίποτα και χωρίς καμία κλήση AI. */
export async function inspect(url: string): Promise<InspectDTO | Fail> {
  await requirePermission("catalog.products.write");
  return guard("inspect", async () => {
    const r = await inspectFeed(String(url ?? "").trim(), cachedSource);
    return ok<InspectDTO>({ counts: r.counts, headers: r.headers, sample: Object.entries(r.sample), bytes: r.bytes });
  });
}

// ---------- Βήμα ③: αντιστοίχιση ----------

/** Οι διακριτές τιμές μιας στήλης — `null` όταν είναι πάρα πολλές για αντιστοίχιση τιμή-προς-τιμή. */
function valuesOf(matrix: string[][], i: number): string[] | null {
  const set = new Set<string>();
  for (let r = 1; r < matrix.length; r++) {
    const v = matrix[r][i];
    if (v) set.add(v);
    if (set.size > MAX_VALUES) return null;
  }
  return [...set].sort((a, b) => a.localeCompare(b, "el"));
}

/**
 * Οι προτάσεις του βήματος ③ (κανόνες + AI μόνο για τα αβέβαια). Καλείται **μία φορά ανά feed**: το «Νέο τρέξιμο»
 * χρησιμοποιεί την αποθηκευμένη αντιστοίχιση και δεν περνά από εδώ.
 */
export async function suggest(url: string): Promise<SuggestDTO | Fail> {
  await requirePermission("catalog.products.write");
  return guard("suggest", async () => {
    const parsed = parseFeed(await cachedSource(String(url ?? "").trim()));
    if (!parsed.counts.products) throw new UserError("Το feed δεν έχει προϊόντα.");
    const { headers, matrix } = parsed;
    const s = await suggestMapping({ headers, matrix });
    const catIdx = headers.indexOf(CATEGORY_PAIR);
    const catN = new Map<string, number>();
    if (catIdx >= 0) for (let r = 1; r < matrix.length; r++) { const v = matrix[r][catIdx]; if (v) catN.set(v, (catN.get(v) ?? 0) + 1); }
    return ok<SuggestDTO>({
      cols: headers.map((header, i) => {
        const c = s.columns[i];
        const samples: string[] = [];
        for (let r = 1; r < matrix.length && samples.length < SAMPLES_SHOWN; r++) { const v = matrix[r][i]; if (v && !samples.includes(v)) samples.push(v); }
        return {
          header,
          target: encodeTarget(c.target),
          label: c.target.kind === "spec" ? c.target.label : "",
          transform: c.transform,
          confidence: c.confidence,
          ...(c.why ? { why: c.why } : {}),
          samples,
          values: valuesOf(matrix, i),
        };
      }),
      cats: Object.entries(s.categories)
        .map(([value, c]) => ({ value, n: catN.get(value) ?? 0, categoryId: c.categoryId, confidence: c.confidence }))
        .sort((a, b) => b.n - a.n || a.value.localeCompare(b.value, "el")),
      specs: Object.entries(s.specs).map(([label, v]) => ({ label, to: v.label, confidence: v.confidence })).sort((a, b) => a.label.localeCompare(b.label, "el")),
      duplicates: s.duplicates,
      aiUsed: s.aiUsed,
    });
  });
}

export interface SaveInput {
  supplierId: string;
  url: string;
  /** επικεφαλίδα → κωδικοποιημένος στόχος· οι αγνοημένες παραλείπονται */
  targets: Record<string, string>;
  /** επικεφαλίδα → ετικέτα χαρακτηριστικού */
  labels: Record<string, string>;
  /** επικεφαλίδα → μετατροπή μονάδας */
  transforms: Record<string, string>;
  brandMap: Record<string, string | null>;
  categoryMap: Record<string, string | null>;
  priceMode: PriceMode;
  toSoftone: boolean;
}

/**
 * Αποθήκευση αντιστοίχισης **και** πρώτη φόρτωση των προϊόντων. Ένα κουμπί: η αντιστοίχιση χωρίς φόρτωση δεν έχει
 * νόημα για τον χρήστη, και η λήψη είναι ήδη στη μνήμη.
 */
export async function saveAndRun(input: SaveInput): Promise<(FeedStateDTO & { run: { total: number; counts: Record<Diff, number>; problems: number; conflicts: number } }) | Fail> {
  const user = await requirePermission("catalog.products.write");
  return guard("save", async () => {
    const url = String(input.url ?? "").trim();
    const parsed = parseFeed(await cachedSource(url));
    const headers = parsed.headers;
    const columns: Record<number, Target> = {};
    const transforms: Record<string, ReturnType<typeof toTransform>> = {};
    headers.forEach((h, i) => {
      const t = input.targets[h];
      if (t && t !== "ignore") columns[i] = decodeTarget(t, (input.labels[h] ?? "").trim());
      const tr = toTransform(input.transforms[h] ?? "none");
      if (tr !== "none") transforms[h] = tr;
    });
    if (!Object.values(columns).some((t) => t.kind === "field" && t.key === "code")) {
      throw new UserError("Καμία στήλη δεν είναι το SKU. Χωρίς αυτό τα προϊόντα δεν έχουν κλειδί — διάλεξε τη στήλη «SKU / κωδικός είδους».");
    }
    const config: MappingConfig = { columns, brandMap: input.brandMap ?? {}, categoryMap: input.categoryMap ?? {} };
    const mode: PriceMode = input.priceMode === "retail" ? "retail" : "cost";
    const feedId = await saveFeed(input.supplierId, url, { config, headers, transforms, priceMode: mode, toSoftone: !!input.toSoftone }, user.id);
    const run = await runFeed(feedId, cachedSource);
    await audit(user.id, "catalog.xml-import.run", "SupplierFeed", feedId, null, { url, ...run });
    return ok({ ...(await state(feedId)), run });
  });
}

// ---------- Βήμα ④: λίστα ελέγχου ----------

/** Η κατάσταση ενός feed όπως τη χρειάζεται το βήμα ④ (χωρίς λήψη, χωρίς AI). */
async function state(feedId: string): Promise<FeedStateDTO> {
  const [feed, run] = await Promise.all([
    loadFeed(feedId),
    db.supplierFeed.findUnique({ where: { id: feedId }, select: { lastRunAt: true, lastCount: true } }),
  ]);
  const headers = feed.cfg.headers ?? [];
  const cols = configForHeaders(feed.cfg.saved, headers).columns;
  const targets: Record<string, string> = {};
  headers.forEach((h, i) => { const t = cols[i]; if (t) targets[h] = encodeTarget(t); });
  return {
    feedId: feed.id, url: feed.url,
    supplier: { id: feed.supplier.id, name: feed.supplier.name, code: feed.supplier.code },
    headers, targets,
    priceMode: feed.priceMode === "retail" ? "retail" : "cost",
    toSoftone: feed.toSoftone,
    lastRunAt: run?.lastRunAt?.toISOString() ?? null,
    lastCount: run?.lastCount ?? null,
  };
}

/** «Άνοιξε τη λίστα» σε feed που έχει ήδη τρέξει: καμία λήψη, καμία κλήση AI. */
export async function feedState(feedId: string): Promise<FeedStateDTO | Fail> {
  await requirePermission("catalog.products.write");
  return guard("state", async () => ok(await state(String(feedId))));
}

/** «Νέο τρέξιμο»: ξανακατεβάζει το feed με την **αποθηκευμένη** αντιστοίχιση — καμία κλήση AI. */
export async function rerun(feedId: string): Promise<{ total: number; counts: Record<Diff, number>; problems: number; conflicts: number } | Fail> {
  const user = await requirePermission("catalog.products.write");
  return guard("rerun", async () => {
    const r = await runFeed(String(feedId), cachedSource);
    await audit(user.id, "catalog.xml-import.rerun", "SupplierFeed", String(feedId), null, r);
    return ok(r);
  });
}

const DIFFS = new Set<Diff>(["new", "changed", "same", "gone"]);
/** Το φίλτρο όπως ήρθε από τον browser, καθαρισμένο. */
function filterOf(f: Partial<ItemFilter>): ItemFilter {
  return {
    ...(f.diff && DIFFS.has(f.diff) ? { diff: f.diff } : {}),
    ...(f.status && typeof f.status === "string" ? { status: f.status.slice(0, 20) } : {}),
    ...(f.problems ? { problems: true } : {}),
    ...(f.q ? { q: String(f.q).slice(0, 60) } : {}),
    page: Math.max(1, Math.min(10_000, Number(f.page) || 1)),
  };
}

const toItem = (r: { id: string; sku: string; payload: unknown; edits: unknown; images: unknown; assetIds: unknown; diff: string; status: string; softone: boolean | null; problem: string | null; mtrl: number | null; productId: string | null; error: string | null }): ItemDTO => ({
  id: r.id, sku: r.sku,
  diff: (DIFFS.has(r.diff as Diff) ? r.diff : "new") as Diff,
  status: r.status, problem: r.problem, error: r.error,
  payload: (r.payload ?? {}) as Record<string, string>,
  edits: (r.edits ?? null) as Record<string, string> | null,
  images: ((r.images ?? []) as string[]).filter((v) => typeof v === "string"),
  assets: ((r.assetIds ?? []) as string[]).length,
  softone: r.softone, mtrl: r.mtrl, productId: r.productId,
});

/** Μία σελίδα της λίστας ελέγχου, με τα πλήθη των chips και τους δύο αριθμούς που κρατούν την επιλογή ειλικρινή. */
export async function items(feedId: string, filter: Partial<ItemFilter>, except: string[] = []): Promise<ItemsDTO | Fail> {
  await requirePermission("catalog.products.write");
  return guard("items", async () => {
    const id = String(feedId);
    const f = filterOf(filter);
    const skus = [...new Set((except ?? []).filter((s) => typeof s === "string"))].slice(0, 5000);
    const r = await listItems(id, f);
    const where = {
      feedId: id,
      ...(f.diff ? { diff: f.diff } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.problems ? { problem: { not: null } } : {}),
      ...(f.q ? { sku: { contains: f.q, mode: "insensitive" as const } } : {}),
    };
    const [exceptionsHere, problemsHere] = await Promise.all([
      skus.length ? db.supplierFeedItem.count({ where: { ...where, sku: { in: skus } } }) : 0,
      db.supplierFeedItem.count({ where: { ...where, problem: { not: null } } }),
    ]);
    return ok<ItemsDTO>({ rows: r.rows.map(toItem), total: r.total, page: r.page, pages: r.pages, counts: r.counts, exceptionsHere, problemsHere });
  });
}


/** Οι διορθώσεις του χρήστη, η σειρά των φωτογραφιών και η εξαίρεση SoftOne ενός προϊόντος. Το `payload` δεν αγγίζεται. */
export async function saveItem(itemId: string, input: { edits: Record<string, string>; images: string[]; softone: boolean | null }): Promise<ItemDTO | Fail> {
  const user = await requirePermission("catalog.products.write");
  return guard("saveItem", async () => {
    const row = await db.supplierFeedItem.findUnique({ where: { id: String(itemId) }, select: { id: true, payload: true, status: true } });
    if (!row) throw new UserError("Το προϊόν δεν βρέθηκε — ανανέωσε τη λίστα.");
    if (row.status === "importing") throw new UserError("Το προϊόν εισάγεται αυτή τη στιγμή — περίμενε να τελειώσει η παρτίδα.");
    const payload = (row.payload ?? {}) as Record<string, string>;
    // Διόρθωση που είναι ίδια με το feed δεν είναι διόρθωση: δεν αποθηκεύεται, ώστε να μη δείχνει «αλλαγμένο» για πάντα.
    const edits: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.edits ?? {})) {
      const t = String(v ?? "").trim();
      if (t && t !== (payload[k] ?? "")) edits[k] = t.slice(0, 20_000);
    }
    const images = [...new Set((input.images ?? []).filter((u) => typeof u === "string" && /^https?:\/\//i.test(u)))].slice(0, 20);
    const softone = input.softone === true || input.softone === false ? input.softone : null;
    const updated = await db.supplierFeedItem.update({
      where: { id: row.id },
      data: { edits: Object.keys(edits).length ? edits : Prisma.DbNull, images, softone },
      select: { id: true, sku: true, payload: true, edits: true, images: true, assetIds: true, diff: true, status: true, softone: true, problem: true, mtrl: true, productId: true, error: true },
    });
    await audit(user.id, "catalog.xml-import.edit", "SupplierFeedItem", row.id, null, { fields: Object.keys(edits), images: images.length, softone });
    return ok(toItem(updated));
  });
}

// ---------- Εισαγωγή ----------

/** Η εγγραφή στο SoftOne είναι ανοιχτή → χρειάζεται και «Εκτέλεση συγχρονισμού ERP», όπως στην εισαγωγή excel. */
async function erpGuard(permissions: string[], toSoftone: boolean): Promise<string | null> {
  if (!toSoftone) return null;
  if (!(await itemWriteEnabled())) return null;
  return can(permissions, "catalog.sync.run") ? null : "Η εγγραφή στο SoftOne είναι ανοιχτή: για εισαγωγή με «και στο SoftOne» χρειάζεται και το δικαίωμα «Εκτέλεση συγχρονισμού ERP».";
}

/** Βάζει στην ουρά ό,τι ταιριάζει στο φίλτρο, εκτός από τις εξαιρέσεις. Οι γραμμές με πρόβλημα δεν μπαίνουν. */
export async function queueItems(feedId: string, filter: Partial<ItemFilter>, except: string[], toSoftone: boolean): Promise<{ queued: number; skipped: number } | Fail> {
  const user = await requirePermission("catalog.products.write");
  const stop = await erpGuard(user.permissions, !!toSoftone);
  if (stop) return { error: stop };
  return guard("enqueue", async () => {
    const sel: Selection = {
      filter: filterOf(filter),
      except: [...new Set((except ?? []).filter((s) => typeof s === "string"))].slice(0, 5000),
      toSoftone: !!toSoftone,
    };
    const r = await enqueue(String(feedId), sel);
    await audit(user.id, "catalog.xml-import.enqueue", "SupplierFeed", String(feedId), null, { ...sel.filter, except: sel.except.length, toSoftone: sel.toSoftone, ...r });
    return ok(r);
  });
}

/** Οι γραμμές που απέτυχαν, πίσω στην ουρά («Δοκίμασε ξανά»). */
export async function retryErrors(feedId: string): Promise<{ queued: number } | Fail> {
  const user = await requirePermission("catalog.products.write");
  return guard("retry", async () => {
    const r = await db.supplierFeedItem.updateMany({ where: { feedId: String(feedId), status: "error" }, data: { status: "queued", error: null } });
    await audit(user.id, "catalog.xml-import.retry", "SupplierFeed", String(feedId), null, { queued: r.count });
    return ok({ queued: r.count });
  });
}

/** Μία παρτίδα της ουράς. Ο browser την καλεί ξανά και ξανά· η πρόοδος ζει στη βάση. */
export async function drainBatch(feedId: string): Promise<{ processed: number; images: number; errors: number; left: number; pending: number; waiting: number } | Fail> {
  const user = await requirePermission("catalog.products.write");
  return guard("drain", async () => {
    const r = await drain(String(feedId), undefined, user.id);
    if (r.processed) resetCatalogCache();
    return ok(r);
  });
}

/** Η πρόοδος της ουράς — διαβάζεται από τη βάση, άρα επιβιώνει κλείσιμο καρτέλας. */
export async function queueProgress(feedId: string): Promise<QueueDTO | Fail> {
  await requirePermission("catalog.products.write");
  return guard("progress", async () => ok(await progress(String(feedId))));
}
