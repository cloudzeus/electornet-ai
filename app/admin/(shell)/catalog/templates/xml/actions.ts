"use server";
import { after } from "next/server";
import { requirePermission } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { audit } from "@/lib/rbac/audit";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { resetCatalogCache } from "@/lib/data/db-catalog";
import { UserError, configForHeaders, type MappingConfig, type Target } from "@/lib/catalog/foreign-import/core";
import { encodeTarget, decodeTarget } from "@/lib/catalog/foreign-import/ui-core";
import { assertConfigIds } from "@/lib/catalog/foreign-import/server";
import { parseFeed } from "@/lib/catalog/xml-import/parse-core";
import { supplierCards, syncSuppliers } from "@/lib/catalog/xml-import/suppliers";
import { inspectFeed, loadFeed, runFeed, saveFeed, saveFeedUrl, setFeedActive, listItems, type FeedSource, type ItemFilter } from "@/lib/catalog/xml-import/feed";
import { feedBytes, snapshotState } from "@/lib/catalog/xml-import/snapshot";
import { clampMinFetch, type FetchIntent } from "@/lib/catalog/xml-import/cache-core";
import { pendingValues } from "@/lib/catalog/xml-import/values";
import { dropDraft, getDraft, putDraft } from "@/lib/catalog/xml-import/draft";
import { mergeBrandMap, splitBrandMap } from "@/lib/catalog/xml-import/skip-core";
import { publishList, publishProducts, type PublishFilter } from "@/lib/catalog/xml-import/publish";
import { drain, enqueue, enqueuePending, progress, recoverStale, type Selection } from "@/lib/catalog/xml-import/queue";
import { normSchedule, type FeedSchedule } from "@/lib/catalog/xml-import/schedule-core";
import { availValues, saveAvailMap, type AvailValue } from "@/lib/catalog/xml-import/avail-map";
import { itemWriteEnabled } from "@/lib/softone/item-write";
import type { PriceMode } from "@/lib/catalog/xml-import/transform-core";
import type { Diff } from "@/lib/catalog/xml-import/diff-core";
import { checkRows, checkSummary, chooseNew, resumeCheck, startCheck, type CheckSummary } from "@/lib/catalog/xml-import/check";
import { normPolicy, type UpdatePolicy } from "@/lib/catalog/xml-import/policy-core";
import { toTransform, type DraftDTO, type FeedStateDTO, type InspectDTO, type ItemDTO, type ItemsDTO, type MappingDraft, type PublishDTO, type QueueDTO, type SourceDTO, type SuggestDTO, type SupplierCard } from "@/lib/catalog/xml-import/ui-core";
import { buildSuggestDTO } from "@/lib/catalog/xml-import/suggest-dto";

/**
 * Server actions του οδηγού «XML προμηθευτές». Λεπτό στρώμα γύρω από τις έτοιμες συναρτήσεις του
 * `lib/catalog/xml-import/*`: δικαίωμα, σειριοποίηση για τον browser, ίχνος στο audit.
 *
 * **Μία λήψη, πολλές χρήσεις.** Ο προμηθευτής βάζει όριο στις λήψεις (ο δοκιμασμένος: 2 την ώρα), και όλα τα βήματα
 * θέλουν τα ίδια bytes. Κάθε λήψη αποθηκεύεται ακέραια στη βάση (`FeedSnapshot`) και κάθε βήμα παίρνει από εκεί — άρα
 * αλλαγή αντιστοίχισης και νέα φόρτωση γίνονται **χωρίς καμία επαφή** με τον προμηθευτή. Νέα λήψη ζητείται ρητά και
 * σέβεται το όριο· αν ο προμηθευτής απαντήσει 429 παρ' όλα αυτά, δουλεύουμε με το αποθηκευμένο XML.
 */

const RESULT_ERROR = "Κάτι πήγε στραβά.";
const ok = <T>(v: T) => v;
type Fail = { error: string };

/** Τα bytes του feed, μαζί με το «από πού ήρθαν» για το UI. */
async function bytesOf(url: string, intent: FetchIntent, minFetchMin: number) {
  const got = await feedBytes(url, { intent, minFetchMin });
  const source: SourceDTO = {
    from: got.from, fetchedAt: got.fetchedAt.toISOString(), waitMin: got.waitMin, rateLimited: got.rateLimited, bytes: got.bytesLen, products: null,
  };
  const source2: FeedSource = async () => got.bytes;
  return { bytes: got.bytes, source, asSource: source2 };
}

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
  return supplierCards(String(q ?? "").slice(0, 80));
}

/**
 * Βήμα ①: αποθήκευση **μόνο της διεύθυνσης** στον προμηθευτή, χωρίς να περάσει ο χρήστης την αντιστοίχιση. Ο σκοπός
 * είναι να καταγράφεις ότι «αυτός ο προμηθευτής έχει αυτό το XML» τη στιγμή που το μαθαίνεις, και να το ρυθμίσεις
 * όποτε βολεύει.
 */
export async function saveUrl(supplierId: string, url: string): Promise<{ feedId: string; cleared: number } | Fail> {
  const user = await requirePermission("catalog.products.write");
  return guard("saveUrl", async () => {
    const r = await saveFeedUrl(String(supplierId), String(url ?? ""), user.id);
    await audit(user.id, "catalog.xml-import.url", "SupplierFeed", r.feedId, null, { cleared: r.cleared });
    return ok(r);
  });
}

/** Ο διακόπτης του feed: ανενεργό μένει αποθηκευμένο (διεύθυνση και αντιστοίχιση) αλλά δεν τρέχει. */
export async function toggleFeed(feedId: string, active: boolean): Promise<{ active: boolean } | Fail> {
  const user = await requirePermission("catalog.products.write");
  return guard("toggleFeed", async () => {
    await setFeedActive(String(feedId), !!active);
    await audit(user.id, "catalog.xml-import.active", "SupplierFeed", String(feedId), null, { active: !!active });
    return ok({ active: !!active });
  });
}

/** Πρόγραμμα αυτόματης ενημέρωσης (upsert) από το XML: χειροκίνητα, κάθε N λεπτά ή καθημερινά — ποτέ κάτω από το όριο λήψης. */
export async function saveSchedule(feedId: string, raw: unknown): Promise<{ schedule: FeedSchedule } | Fail> {
  const user = await requirePermission("catalog.products.write");
  return guard("saveSchedule", async () => {
    const feed = await loadFeed(String(feedId));
    const schedule = normSchedule(raw, feed.minFetchMin);
    const before = await db.supplierFeed.findUnique({ where: { id: feed.id }, select: { schedule: true } });
    await db.supplierFeed.update({ where: { id: feed.id }, data: { schedule: schedule as object } });
    await audit(user.id, "catalog.xml-import.schedule", "SupplierFeed", feed.id, before?.schedule ?? null, schedule);
    return ok({ schedule });
  });
}

/** «Εφαρμογή αλλαγών (N)»: τα υπάρχοντα είδη με αλλαγές του XML (ή διορθώσεις) περνούν σε SoftOne και eshop. */
export async function applyPending(feedId: string): Promise<{ queued: number } | Fail> {
  const user = await requirePermission("catalog.products.write");
  return guard("applyPending", async () => {
    const feed = await loadFeed(String(feedId));
    const deny = await erpGuard(user.permissions, feed.toSoftone);
    if (deny) throw new UserError(deny);
    const queued = await enqueuePending(feed.id);
    await audit(user.id, "catalog.xml-import.apply-pending", "SupplierFeed", feed.id, null, { queued });
    return ok({ queued });
  });
}

/** Οι τιμές διαθεσιμότητας του feed (με πλήθη) και η κατάσταση που αντιστοιχεί η καθεμία. */
export async function availMapValues(feedId: string): Promise<{ header: string | null; values: AvailValue[] } | Fail> {
  await requirePermission("catalog.products.read");
  return guard("availMapValues", async () => ok(await availValues(String(feedId))));
}

/** Αποθήκευση «τιμή του XML → κατάσταση»· ενημερώνει αμέσως τη διαθεσιμότητα των προϊόντων του feed στο eshop. */
export async function saveAvailMapAction(feedId: string, map: Record<string, unknown>): Promise<{ products: number } | Fail> {
  const user = await requirePermission("catalog.products.write");
  return guard("saveAvailMap", async () => {
    const r = await saveAvailMap(String(feedId), map);
    await audit(user.id, "catalog.xml-import.avail-map", "SupplierFeed", String(feedId), null, { values: Object.keys(map ?? {}).length, ...r });
    resetCatalogCache();
    return ok(r);
  });
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

/**
 * Τι περιέχει το feed. Καμία αποθήκευση αντιστοίχισης και καμία κλήση AI — αλλά το ίδιο το XML **αποθηκεύεται**, για
 * να μη ξανακατέβει στα επόμενα βήματα. `fresh` = ο χρήστης ζήτησε ρητά νέα λήψη.
 */
export async function inspect(url: string, fresh = false, minFetchMin = 30): Promise<InspectDTO | Fail> {
  await requirePermission("catalog.products.write");
  return guard("inspect", async () => {
    const u = String(url ?? "").trim();
    const got = await bytesOf(u, fresh ? "fresh" : "reuse", clampMinFetch(minFetchMin));
    const r = await inspectFeed(u, got.asSource);
    return ok<InspectDTO>({ counts: r.counts, headers: r.headers, sample: Object.entries(r.sample), bytes: r.bytes, source: { ...got.source, products: r.counts.products } });
  });
}

// ---------- Βήμα ③: αντιστοίχιση ----------

/**
 * Οι προτάσεις του βήματος της αντιστοίχισης. Καλείται **μία φορά ανά feed**: το «Νέο τρέξιμο» χρησιμοποιεί την
 * αποθηκευμένη αντιστοίχιση και δεν περνά από εδώ.
 */
export async function suggest(url: string, supplierId?: string): Promise<SuggestDTO | Fail> {
  await requirePermission("catalog.products.write");
  return guard("suggest", async () => {
    const u = String(url ?? "").trim();
    const got = await bytesOf(u, "reuse", 30);
    const draft = supplierId ? await getDraft(String(supplierId), u) : null;
    return ok<SuggestDTO>({ ...(await buildSuggestDTO(got.bytes)), source: got.source, draft });
  });
}

// ---------- Πρόχειρο: τα ενδιάμεσα βήματα δεν χάνονται ----------

/**
 * Αποθήκευση του προχείρου. Καλείται μόνη της όσο ο χρήστης δουλεύει στα βήματα της αντιστοίχισης — γι' αυτό δεν
 * γράφει audit και δεν κάνει κανέναν έλεγχο ταυτοτήτων: είναι πρόχειρο, όχι αντιστοίχιση.
 */
export async function saveDraft(input: { supplierId: string; url: string; step: string; value: MappingDraft }): Promise<{ at: string } | Fail> {
  const user = await requirePermission("catalog.products.write");
  return guard("draft", async () => {
    const at = await putDraft(String(input.supplierId), String(input.url ?? ""), String(input.step ?? "cols"), input.value, user.id);
    return ok({ at: at.toISOString() });
  });
}

/** «Ξεκίνα από την αρχή»: πετά το πρόχειρο και ο οδηγός γυρνά στις προτάσεις (ή στο αποθηκευμένο πρότυπο). */
export async function forgetDraft(supplierId: string, url: string): Promise<{ ok: true } | Fail> {
  await requirePermission("catalog.products.write");
  return guard("draft", async () => {
    await dropDraft(String(supplierId), String(url ?? ""));
    return ok({ ok: true as const });
  });
}

/**
 * «Άλλαξε την αντιστοίχιση» σε feed που έχει ήδη τρέξει: οι επιλογές έρχονται από το **αποθηκευμένο πρότυπο** του
 * προμηθευτή και τα bytes από το **αποθηκευμένο XML** — καμία λήψη. Ό,τι είναι καινούργιο στο feed (μια κατηγορία που
 * δεν υπήρχε, μια στήλη που πρόσθεσε ο προμηθευτής) παίρνει κανονικά πρόταση από κανόνες και AI, και φαίνεται ως
 * «θέλει το μάτι σου».
 */
export async function remap(feedId: string): Promise<(SuggestDTO & { url: string; supplierId: string; draft: DraftDTO | null }) | Fail> {
  await requirePermission("catalog.products.write");
  return guard("remap", async () => {
    const feed = await loadFeed(String(feedId));
    const headers = feed.cfg.headers ?? [];
    if (!headers.length) throw new UserError("Το feed δεν έχει αποθηκευμένη αντιστοίχιση — ξεκίνα από τον «Έλεγχο» του feed.");
    const cols = configForHeaders(feed.cfg.saved, headers).columns;
    const targets: Record<string, string> = {};
    const labels: Record<string, string> = {};
    headers.forEach((h, i) => {
      const t = cols[i];
      if (!t) return;
      targets[h] = encodeTarget(t);
      if (t.kind === "spec") labels[h] = t.label;
    });
    // Η «Αγνόηση» είναι απόφαση σαν κάθε άλλη: χωρίς αυτό η στήλη θα ξαναρωτιόταν (και θα ξανακόστιζε κλήση AI).
    for (const h of feed.cfg.ignored ?? []) if (!targets[h]) targets[h] = "ignore";
    const saved = feed.cfg.saved;
    const got = await bytesOf(feed.url, "reuse", feed.minFetchMin);
    const dto = await buildSuggestDTO(got.bytes, {
      saved: { targets, labels, transforms: feed.cfg.transforms ?? {}, categoryMap: saved.categoryMap ?? {} },
      maps: { brand: mergeBrandMap(saved.brandMap ?? {}, feed.cfg.skipBrands ?? []), unit: saved.unitMap ?? {}, mark: saved.markMap ?? {} },
      settings: {
        priceMode: feed.priceMode === "retail" ? "retail" : "cost",
        toSoftone: feed.toSoftone,
        minFetchMin: feed.minFetchMin,
        unitId: saved.sheetUnitId ?? null,
        markId: saved.sheetMarkId ?? null,
      },
    });
    const draft = await getDraft(feed.supplier.id, feed.url);
    return ok({ ...dto, source: got.source, url: feed.url, supplierId: feed.supplier.id, draft });
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
  /** τιμή στήλης → δική μας μονάδα μέτρησης (Unit) */
  unitMap: Record<string, string | null>;
  /** τιμή στήλης → δική μας εμπορική σήμανση (ItemMark / MTRMARK) */
  markMap: Record<string, string | null>;
  /** μονάδα για ΟΛΟ το feed, όταν δεν υπάρχει στήλη ή η τιμή δεν αντιστοιχίστηκε */
  unitId: string | null;
  /** εμπορική σήμανση για ΟΛΟ το feed */
  markId: string | null;
  priceMode: PriceMode;
  toSoftone: boolean;
  /** ελάχιστα λεπτά ανάμεσα σε δύο λήψεις — το όριο του προμηθευτή */
  minFetchMin?: number;
}

/**
 * Αποθήκευση αντιστοίχισης **και** πρώτη φόρτωση των προϊόντων. Ένα κουμπί: η αντιστοίχιση χωρίς φόρτωση δεν έχει
 * νόημα για τον χρήστη, και η λήψη είναι ήδη στη μνήμη.
 */
export async function saveAndRun(input: SaveInput): Promise<(FeedStateDTO & { run: RunDTO }) | Fail> {
  const user = await requirePermission("catalog.products.write");
  return guard("save", async () => {
    const url = String(input.url ?? "").trim();
    const minFetchMin = clampMinFetch(input.minFetchMin ?? 30);
    const got = await bytesOf(url, "reuse", minFetchMin);
    const parsed = parseFeed(got.bytes);
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
    // «Παράλειψη» δεν είναι μάρκα: βγαίνει από τον χάρτη και γίνεται λίστα του feed, αλλιώς θα πήγαινε για έλεγχο ως id.
    const { brandMap, skipBrands } = splitBrandMap(input.brandMap ?? {});
    const config: MappingConfig = {
      columns,
      brandMap, categoryMap: input.categoryMap ?? {}, unitMap: input.unitMap ?? {}, markMap: input.markMap ?? {},
      sheetUnitId: input.unitId || null, sheetMarkId: input.markId || null,
    };
    await assertConfigIds(config);
    const mode: PriceMode = input.priceMode === "retail" ? "retail" : "cost";
    const feedId = await saveFeed(input.supplierId, url, { config, headers, transforms, priceMode: mode, toSoftone: !!input.toSoftone, minFetchMin, skipBrands }, user.id);
    const run = await runFeed(feedId, got.asSource);
    // Το πρόχειρο έγινε πρότυπο: από εδώ και πέρα η αλήθεια είναι το feed, όχι η εκκρεμότητα.
    await dropDraft(input.supplierId, url);
    await audit(user.id, "catalog.xml-import.run", "SupplierFeed", feedId, null, { url, ...run });
    return ok({ ...(await state(feedId)), run });
  });
}

// ---------- Βήμα ④: λίστα ελέγχου ----------

/** Η κατάσταση ενός feed όπως τη χρειάζεται το βήμα ④ (χωρίς λήψη, χωρίς AI). */
async function state(feedId: string): Promise<FeedStateDTO> {
  const feed = await loadFeed(feedId);
  const [run, snap, pending] = await Promise.all([
    db.supplierFeed.findUnique({ where: { id: feedId }, select: { lastRunAt: true, lastCount: true } }),
    snapshotState(feed.url, feed.minFetchMin),
    pendingValues(feedId),
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
    minFetchMin: feed.minFetchMin,
    active: feed.active,
    snapshot: { has: snap.has, fetchedAt: snap.fetchedAt?.toISOString() ?? null, bytes: snap.bytes, products: snap.products, waitMin: snap.waitMin },
    pending,
  };
}

/** «Άνοιξε τη λίστα» σε feed που έχει ήδη τρέξει: καμία λήψη, καμία κλήση AI. */
export async function feedState(feedId: string): Promise<FeedStateDTO | Fail> {
  await requirePermission("catalog.products.write");
  return guard("state", async () => ok(await state(String(feedId))));
}

export interface RunDTO {
  total: number;
  counts: Record<Diff, number>;
  problems: number;
  conflicts: number;
  /** προϊόντα που δεν θα μπουν επειδή η μάρκα τους παραλείπεται */
  skipped: number;
}

export interface RerunResult extends RunDTO {
  source: SourceDTO;
}

/**
 * «Νέο τρέξιμο» με την **αποθηκευμένη** αντιστοίχιση — καμία κλήση AI.
 *
 * `fresh` = ζητήθηκε νέα λήψη. Το όριο του προμηθευτή τηρείται: αν δεν έχει περάσει, ξαναπερνά το αποθηκευμένο XML
 * (χρήσιμο μετά από αλλαγή αντιστοίχισης) και το UI λέει σε πόσα λεπτά επιτρέπεται νέα λήψη.
 */
export async function rerun(feedId: string, fresh = true): Promise<RerunResult | Fail> {
  const user = await requirePermission("catalog.products.write");
  return guard("rerun", async () => {
    const feed = await loadFeed(String(feedId));
    const got = await bytesOf(feed.url, fresh ? "fresh" : "reuse", feed.minFetchMin);
    const r = await runFeed(String(feedId), got.asSource);
    await audit(user.id, "catalog.xml-import.rerun", "SupplierFeed", String(feedId), null, { ...r, from: got.source.from });
    return ok<RerunResult>({ ...r, source: got.source });
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
    const [exceptionsHere, problemsHere, skippedHere] = await Promise.all([
      skus.length ? db.supplierFeedItem.count({ where: { ...where, sku: { in: skus } } }) : 0,
      db.supplierFeedItem.count({ where: { ...where, problem: { not: null } } }),
      db.supplierFeedItem.count({ where: { ...where, status: "skipped" } }),
    ]);
    return ok<ItemsDTO>({ rows: r.rows.map(toItem), total: r.total, page: r.page, pages: r.pages, counts: r.counts, exceptionsHere, problemsHere, skippedHere });
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
      // διόρθωση του χρήστη → εκκρεμεί εφαρμογή στο SoftOne / eshop
      data: { edits: Object.keys(edits).length ? edits : Prisma.DbNull, images, softone, pendingApply: true },
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
export async function queueItems(feedId: string, filter: Partial<ItemFilter>, except: string[], toSoftone: boolean): Promise<{ queued: number; skipped: number; notChosen: number } | Fail> {
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
    await recoverStale(String(feedId));
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

// ---------- Βήμα ⑤: δημοσίευση ----------

/**
 * Τα προϊόντα που έβγαλε αυτό το feed και η κατάστασή τους. Τα νέα είδη γεννιούνται **ανενεργά** (δεν φαίνονται στο
 * site): εδώ τα βλέπει ο χρήστης, τα διορθώνει όπου χρειάζεται και μετά τα δημοσιεύει.
 */
export async function publishPage(feedId: string, page = 1, only: PublishFilter = "all"): Promise<PublishDTO | Fail> {
  await requirePermission("catalog.products.write");
  return guard("publishPage", async () => {
    const f: PublishFilter = only === "draft" || only === "live" ? only : "all";
    const r = await publishList(String(feedId), Math.max(1, Math.min(10_000, Number(page) || 1)), f);
    return ok<PublishDTO>({ rows: r.rows, total: r.total, page: r.page, pages: r.pages, counts: r.counts });
  });
}

/** Δημοσίευση: οι φωτογραφίες δένονται και τα επιλεγμένα προϊόντα γίνονται ενεργά. «όλα τα πρόχειρα» = `"draft"`. */
export async function publish(feedId: string, which: string[] | "draft"): Promise<{ published: number; attached: number; skipped: number } | Fail> {
  const user = await requirePermission("catalog.products.write");
  return guard("publish", async () => {
    const sel = which === "draft" ? "draft" : [...new Set((which ?? []).filter((v) => typeof v === "string"))];
    const r = await publishProducts(String(feedId), sel);
    await audit(user.id, "catalog.xml-import.publish", "SupplierFeed", String(feedId), null, { ...r, which: sel === "draft" ? "draft" : sel.length });
    return ok(r);
  });
}

// ---------- Έλεγχος με SoftOne ----------

/** Ξεκινά (ή ξαναξεκινά) τον έλεγχο όλου του feed με την πολιτική του χρήστη. Τρέχει στον server· η σελίδα μόνο κοιτά. */
export async function startCheckAction(feedId: string, policy: UpdatePolicy, priceMode: "cost" | "retail"): Promise<{ total: number } | Fail> {
  const user = await requirePermission("catalog.products.write");
  return guard("check", async () => {
    const r = await startCheck(String(feedId), { policy: normPolicy(policy), priceMode: priceMode === "retail" ? "retail" : "cost" });
    await audit(user.id, "catalog.xml-import.check", "SupplierFeed", String(feedId), null, { policy, priceMode, ...r });
    after(async () => { const { runJob } = await import("@/lib/scheduler"); await runJob("xml-feeds", "manual"); });
    return ok(r);
  });
}

export async function resumeCheckAction(feedId: string): Promise<{ ok: true } | Fail> {
  await requirePermission("catalog.products.write");
  return guard("check-resume", async () => {
    await resumeCheck(String(feedId));
    after(async () => { const { runJob } = await import("@/lib/scheduler"); await runJob("xml-feeds", "manual"); });
    return ok({ ok: true as const });
  });
}

/** Για τη σελίδα όσο τρέχει ο έλεγχος ή η εισαγωγή: «ξυπνά» τον εκτελεστή (στο dev ο scheduler είναι κλειστός). */
export async function kickXmlAction(): Promise<{ ok: true }> {
  await requirePermission("catalog.products.write");
  after(async () => { const { runJob } = await import("@/lib/scheduler"); await runJob("xml-feeds", "manual"); });
  return { ok: true };
}

export async function checkSummaryAction(feedId: string): Promise<CheckSummary | Fail> {
  await requirePermission("catalog.products.read");
  return guard("check-summary", async () => ok(await checkSummary(String(feedId))));
}

export async function checkRowsAction(feedId: string, s1Status: string | null, page = 1, q = ""): Promise<Awaited<ReturnType<typeof checkRows>> | Fail> {
  await requirePermission("catalog.products.read");
  const st = s1Status && ["update", "unchanged", "new", "waiting", "problem"].includes(s1Status) ? s1Status : null;
  return guard("check-rows", async () => ok(await checkRows(String(feedId), st, Number(page) || 1, String(q ?? "").slice(0, 80))));
}

export async function chooseNewAction(feedId: string, which: string[] | "all" | "none", value: boolean): Promise<{ changed: number } | Fail> {
  const user = await requirePermission("catalog.products.write");
  return guard("check-choose", async () => {
    const list = Array.isArray(which) ? which.filter((x) => typeof x === "string").slice(0, 500) : which === "all" ? "all" : "none";
    const r = await chooseNew(String(feedId), list, !!value);
    await audit(user.id, "catalog.xml-import.choose-new", "SupplierFeed", String(feedId), null, { which: Array.isArray(list) ? list.length : list, value, ...r });
    return ok(r);
  });
}
