import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { analyseBanner } from "./banner-ocr";
import { fetchSource, publishExtractions, saveDraft, toStudioDoc, unpublishExtraction } from "./banner-extract";
import { designPage } from "./banner-design";
import { coverage, docBoxes, MIN_BANNER_W, MIN_COVERAGE } from "./banner-quality";
import { sectionHasContent, type StudioDoc } from "./banner-doc";
import { TODO, ORDER } from "./banner-worklist";

/**
 * Μαζική αυτόματη απόδελτίωση: ό,τι κάνει ο καταχωριστής στο εργαλείο, χωρίς άνθρωπο — με δικλείδες.
 *   1. κάθε ορατό banner: ανάλυση, ή επαναχρησιμοποίηση της ανάλυσης του ΙΔΙΟΥ banner (ίδιο αποτύπωμα phash) από άλλο
 *      προϊόν — τα banners μιας σειράς (55″ / 65″ / 75″) είναι συνήθως ίδια: 38.023 banners, 23.170 μοναδικά
 *   2. έλεγχος κάλυψης: τα πλαίσια πρέπει να καλύπτουν ≥ 80 % του «μελανιού» του banner — αλλιώς κάτι χάθηκε
 *   3. σχεδιασμός σελίδας (AI) πάνω σε όσα πέρασαν τον έλεγχο
 *   4. χωρίς `publish`: πρόχειρο «για έγκριση»· με `publish`: ενότητες στη σελίδα και απόκρυψη ΜΟΝΟ των banners που πέρασαν
 *      τον έλεγχο (από 3/11/26, με απόφαση του ιδιοκτήτη: τα banners βαραίνουν τη σελίδα και το κείμενό τους χάνεται για το SEO)
 * Όσα δεν πέρασαν μένουν ορατά ως εικόνα και σημαίνονται «για έλεγχο» (λίστα εργασίας → φίλτρο). Όλα αναιρούνται (undoAuto).
 */

interface Analysed { doc: StudioDoc; coverage: number; costUsd: number; model: string | null; ms: number; reusedFrom: string | null }

/** Κοινή μνήμη ενός τρεξίματος: δύο προϊόντα της ίδιας σειράς περιμένουν την ίδια ανάλυση, δεν πληρώνουν δύο φορές. */
const inflight = new Map<string, Promise<Omit<Analysed, "reusedFrom"> & { sourceUrl: string }>>();

const withSource = (doc: StudioDoc, url: string): StudioDoc => ({ ...structuredClone(doc), sourceUrl: url });

async function analyseOrReuse(media: { id: string; url: string }, phash: string | null): Promise<Analysed> {
  if (phash) {
    // ίδιο banner, ήδη αναλυμένο και σωστό (όχι «για έλεγχο») — σε οποιοδήποτε προϊόν
    const prev = await db.bannerExtraction.findFirst({ where: { phash, needsReview: false, status: { in: ["published", "draft"] } }, orderBy: { updatedAt: "desc" }, select: { id: true, doc: true, quality: true } });
    if (prev) {
      const doc = prev.doc as unknown as StudioDoc;
      // οι διορθώσεις του διαχειριστή και ο σχεδιασμός ΜΕΝΟΥΝ· ο σχεδιαστής θα ξανατρέξει για το νέο προϊόν
      return { doc: withSource(doc, media.url), coverage: Number((prev.quality as { coverage?: number } | null)?.coverage ?? 1), costUsd: 0, model: null, ms: 0, reusedFrom: prev.id };
    }
    const running = inflight.get(phash);
    if (running) { const r = await running; return { ...r, doc: withSource(r.doc, media.url), costUsd: 0, reusedFrom: "inflight" }; }
  }
  const job = (async () => {
    const bytes = await fetchSource(media.url);
    const a = await analyseBanner(bytes);
    const doc = toStudioDoc(a, media.url);
    return { doc, coverage: await coverage(bytes, docBoxes(doc)), costUsd: a.costUsd, model: a.model, ms: a.ms, sourceUrl: media.url };
  })();
  if (phash) inflight.set(phash, job);
  try { return { ...(await job), reusedFrom: null }; } finally { if (phash) setTimeout(() => inflight.delete(phash), 60_000); }
}

export interface AutoProductResult { productId: string; title: string; banners: number; analysed: number; reused: number; review: number; sections: number; dropped: number; costUsd: number; design: "ai" | "rules" | "none"; published?: boolean; hidden?: number; error?: string }

export async function autoExtractProduct(productId: string, opts: { concurrency?: number; publish?: boolean } = {}): Promise<AutoProductResult> {
  const p = await db.product.findUnique({ where: { id: productId }, select: { id: true, title: true, brand: { select: { name: true } }, category: { select: { name: true } } } });
  if (!p) throw new Error("Το προϊόν δεν βρέθηκε.");
  const media = await db.media.findMany({ where: { productId, kind: "banner", hidden: false }, orderBy: { sortNo: "asc" }, take: 30, select: { id: true, url: true, importFile: true } });
  const hashes = new Map((await db.imageImport.findMany({ where: { sourceFile: { in: media.map((m) => m.importFile).filter((x): x is string => !!x) } }, select: { sourceFile: true, phash: true } })).map((i) => [i.sourceFile, i.phash]));
  const res: AutoProductResult = { productId, title: p.title, banners: media.length, analysed: 0, reused: 0, review: 0, sections: 0, dropped: 0, costUsd: 0, design: "none" };
  const done: { mediaId: string; extractionId: string; doc: StudioDoc; ok: boolean }[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 2) }, async () => {
    for (;;) {
      const i = next++; const m = media[i]; if (!m) return;
      const phash = m.importFile ? hashes.get(m.importFile) ?? null : null;
      try {
        const a = await analyseOrReuse(m, phash);
        const content = a.doc.sections.some(sectionHasContent);
        const sharp = a.doc.width >= MIN_BANNER_W;
        const ok = content && a.coverage >= MIN_COVERAGE && sharp;
        const flags = [...(!content ? ["κενό"] : []), ...(a.coverage < MIN_COVERAGE ? [`κάλυψη ${Math.round(a.coverage * 100)}%`] : []), ...(!sharp ? [`χαμηλή ανάλυση ${a.doc.width}px — χρειάζεται το πρωτότυπο`] : [])];
        const row = await db.bannerExtraction.create({ data: { productId, mediaId: m.id, sourceUrl: m.url, sourceName: m.importFile, width: a.doc.width, height: a.doc.height, lang: a.doc.lang, doc: a.doc as unknown as Prisma.InputJsonValue, origin: "auto", phash, quality: { coverage: +a.coverage.toFixed(3), reused: a.reusedFrom, flags } as Prisma.InputJsonValue, needsReview: !ok, model: a.model, costUsd: a.costUsd, ms: a.ms } });
        if (a.reusedFrom) res.reused++; else res.analysed++;
        res.costUsd += a.costUsd;
        if (!ok) res.review++;
        done[i] = { mediaId: m.id, extractionId: row.id, doc: a.doc, ok };
      } catch (e) { res.review++; res.error = e instanceof Error ? e.message.slice(0, 200) : String(e); }
    }
  }));
  const good = done.filter((d) => d?.ok);
  if (!good.length) return res;
  const design = await designPage(good.map((g) => g.doc), { brand: p.brand.name, title: p.title, typeName: p.category.name });
  res.design = design.by; res.dropped = design.dropped; res.costUsd += design.costUsd;
  res.sections = design.docs.reduce((n, d) => n + d.sections.filter((x) => x.include && sectionHasContent(x)).length, 0);
  // Δημοσίευση μόνο όταν ζητηθεί ρητά και βγήκε έστω μία ενότητα (αλλιώς θα κρύβαμε banners χωρίς αντικατάσταση)·
  // κρύβονται ΜΟΝΟ τα banners που πέρασαν τον έλεγχο — τα «για έλεγχο» μένουν εικόνα
  if (opts.publish && res.sections > 0) {
    const pub = await publishExtractions(productId, good.map((g, k) => ({ id: g.extractionId, doc: design.docs[k] })), { hideSources: true, hideMediaIds: good.map((g) => g.mediaId) });
    res.published = true; res.hidden = pub.hidden; res.sections = pub.sections;
    return res;
  }
  for (const [k, g] of good.entries()) await saveDraft(g.extractionId, design.docs[k]);
  return res;
}

// προϊόντα χωρίς ζωντανή απόδελτίωση: ούτε χειροκίνητο πρόχειρο (δεν πατάμε πάνω στη δουλειά ανθρώπου) — οι απορριφθείσες δεν μετράνε
const AUTO_TODO = (types?: string[]): Prisma.ProductWhereInput => ({ AND: [TODO, { extractions: { none: { status: { not: "discarded" } } } }, ...(types?.length ? [{ category: { name: { in: types } } }] : [])] });

/** Πόσα μένουν: προϊόντα, ορατά banners και πόσα από αυτά δεν έχουν ήδη ανάλυση ίδιου banner (αυτά πληρώνονται). */
export async function autoTodoEstimate(types?: string[]) {
  const where = AUTO_TODO(types);
  const media = await db.media.findMany({ where: { kind: "banner", hidden: false, product: where }, select: { importFile: true } });
  const files = [...new Set(media.map((m) => m.importFile).filter((x): x is string => !!x))];
  const hashes = new Set((await db.imageImport.findMany({ where: { sourceFile: { in: files } }, select: { phash: true } })).map((i) => i.phash).filter((x): x is string => !!x));
  const known = new Set((await db.bannerExtraction.findMany({ where: { phash: { in: [...hashes] }, needsReview: false, status: { in: ["published", "draft"] } }, select: { phash: true }, distinct: ["phash"] })).map((r) => r.phash));
  return { products: await db.product.count({ where }), banners: media.length, unique: hashes.size, toAnalyse: [...hashes].filter((h) => !known.has(h)).length };
}

/** Μία παρτίδα προϊόντων της λίστας εργασίας που δεν έχουν καμία απόδελτίωση (ούτε χειροκίνητη). */
export async function autoExtractBatch(opts: { limit?: number; types?: string[]; concurrency?: number; publish?: boolean; onProduct?: (r: AutoProductResult) => void } = {}) {
  const products = await db.product.findMany({ where: AUTO_TODO(opts.types), orderBy: [{ category: { name: "asc" } }, { title: "asc" }, ...ORDER], take: Math.min(500, opts.limit ?? 50), select: { id: true } });
  // με σειρά τίτλου: τα μεγέθη της ίδιας σειράς έρχονται διαδοχικά → η επαναχρησιμοποίηση πιάνει σχεδόν αμέσως
  const results: AutoProductResult[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 3) }, async () => {
    for (;;) {
      const p = products[next++]; if (!p) return;
      const r = await autoExtractProduct(p.id, { publish: opts.publish }).catch((e) => ({ productId: p.id, title: "", banners: 0, analysed: 0, reused: 0, review: 0, sections: 0, dropped: 0, costUsd: 0, design: "none" as const, error: e instanceof Error ? e.message : String(e) }));
      results.push(r); opts.onProduct?.(r);
    }
  }));
  const remaining = await db.product.count({ where: AUTO_TODO(opts.types) });
  return { results, remaining };
}

/**
 * Δημοσίευση των έτοιμων αυτόματων πρόχειρων (αναλυμένα και σχεδιασμένα από παλαιότερο τρέξιμο), χωρίς νέα ανάλυση ή κόστος.
 * Μόνο προϊόντα χωρίς ενότητες και χωρίς χειροκίνητο πρόχειρο (δεν πατάμε πάνω στη δουλειά ανθρώπου)· μόνο ό,τι πέρασε
 * τον έλεγχο (needsReview: false) — τα «για έλεγχο» banners μένουν εικόνα.
 */
export async function publishAutoDrafts(opts: { types?: string[]; limit?: number; onProduct?: (r: { title: string; sections: number; hidden: number; error?: string }) => void } = {}) {
  const products = await db.product.findMany({
    where: { sections: { none: {} }, extractions: { some: { origin: "auto", status: "draft", needsReview: false }, none: { origin: "manual", status: "draft" } }, ...(opts.types?.length ? { category: { name: { in: opts.types } } } : {}) },
    orderBy: ORDER, take: opts.limit ?? 10_000, select: { id: true, title: true },
  });
  const out = { products: 0, sections: 0, hidden: 0, failed: 0 };
  for (const p of products) {
    try {
      const rows = await db.bannerExtraction.findMany({ where: { productId: p.id, origin: "auto", status: "draft", needsReview: false }, select: { id: true, doc: true, mediaId: true, createdAt: true } });
      const order = new Map((await db.media.findMany({ where: { id: { in: rows.map((r) => r.mediaId).filter((x): x is string => !!x) } }, select: { id: true, sortNo: true } })).map((m) => [m.id, m.sortNo]));
      const pos = (r: { mediaId: string | null }) => (r.mediaId ? order.get(r.mediaId) ?? 1e9 : 1e9);
      rows.sort((a, b) => pos(a) - pos(b) || +a.createdAt - +b.createdAt);
      const docs = rows.map((r) => r.doc as unknown as StudioDoc);
      if (!docs.some((d) => d.sections.some((x) => x.include && sectionHasContent(x)))) continue;
      const pub = await publishExtractions(p.id, rows.map((r, k) => ({ id: r.id, doc: docs[k] })), { hideSources: true, hideMediaIds: rows.map((r) => r.mediaId).filter((x): x is string => !!x) });
      out.products++; out.sections += pub.sections; out.hidden += pub.hidden;
      opts.onProduct?.({ title: p.title, sections: pub.sections, hidden: pub.hidden });
    } catch (e) {
      out.failed++;
      opts.onProduct?.({ title: p.title, sections: 0, hidden: 0, error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
    }
  }
  return out;
}

/** Αναίρεση της αυτόματης απόδελτίωσης (όλης ή μίας κατηγορίας): σβήνει ενότητες, ξαναδείχνει banners, απορρίπτει τα πρόχειρα. */
export async function undoAuto(types?: string[]) {
  const rows = await db.bannerExtraction.findMany({ where: { origin: "auto", status: { not: "discarded" }, ...(types?.length ? { product: { category: { name: { in: types } } } } : {}) }, select: { id: true, productId: true } });
  for (const r of rows) await unpublishExtraction(r.productId, r.id);
  await db.bannerExtraction.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: "discarded" } });
  return { extractions: rows.length, products: new Set(rows.map((r) => r.productId)).size };
}

/**
 * Ξανασχεδιασμός χωρίς νέα ανάλυση: παίρνει τις δημοσιευμένες απόδελτιώσεις ενός προϊόντος (με τη σειρά των banners),
 * αναιρεί ό,τι είχε πετάξει ο ΠΡΟΗΓΟΥΜΕΝΟΣ σχεδιαστής (όχι ό,τι απέκλεισε άνθρωπος), ξανατρέχει τον σχεδιαστή και
 * ξαναδημοσιεύει. Κόστος: μία κλήση σχεδιασμού ανά προϊόν.
 */
export async function redesignProduct(productId: string) {
  const p = await db.product.findUnique({ where: { id: productId }, select: { title: true, brand: { select: { name: true } }, category: { select: { name: true } } } });
  if (!p) throw new Error("Το προϊόν δεν βρέθηκε.");
  const rows = await db.bannerExtraction.findMany({ where: { productId, status: { in: ["published", "draft"] }, needsReview: false }, select: { id: true, doc: true, mediaId: true, createdAt: true, status: true } });
  if (!rows.length) return { title: p.title, sections: 0, before: 0, dropped: 0, costUsd: 0, design: "none" as const };
  const order = new Map((await db.media.findMany({ where: { id: { in: rows.map((r) => r.mediaId).filter((x): x is string => !!x) } }, select: { id: true, sortNo: true } })).map((m) => [m.id, m.sortNo]));
  const pos = (r: { mediaId: string | null }) => (r.mediaId ? order.get(r.mediaId) ?? 1e9 : 1e9);
  rows.sort((a, b) => pos(a) - pos(b) || +a.createdAt - +b.createdAt);
  const before = await db.productSection.count({ where: { productId, extractionId: { in: rows.map((r) => r.id) } } });
  const docs = rows.map((r) => r.doc as unknown as StudioDoc); // ο σχεδιαστής ξεκινά από καθαρό χαρτί (resetDesign)
  const design = await designPage(docs, { brand: p.brand.name, title: p.title, typeName: p.category.name });
  // ξαναδημοσιεύεται ΜΟΝΟ ό,τι είχε ήδη εγκριθεί (published)· τα πρόχειρα μένουν πρόχειρα
  if (rows.every((r) => r.status === "published")) {
    const pub = await publishExtractions(productId, rows.map((r, k) => ({ id: r.id, doc: design.docs[k] })), { hideSources: true, hideMediaIds: rows.map((r) => r.mediaId).filter((x): x is string => !!x) });
    return { title: p.title, sections: pub.sections, before, dropped: design.dropped, costUsd: design.costUsd, design: design.by };
  }
  for (const [k, r] of rows.entries()) await saveDraft(r.id, design.docs[k]);
  return { title: p.title, sections: design.docs.reduce((n, d) => n + d.sections.filter((x) => x.include && sectionHasContent(x)).length, 0), before, dropped: design.dropped, costUsd: design.costUsd, design: design.by };
}

/**
 * Αυτόματες σελίδες πίσω σε πρόχειρο «για έγκριση»: σβήνει τις ενότητες, ξαναδείχνει τα banners, ΚΡΑΤΑ τις αναλύσεις
 * (status draft) ώστε η έγκριση να μη χρειαστεί νέα ανάλυση. Δεν αγγίζει ό,τι δημοσίευσε άνθρωπος (origin manual).
 */
export async function unpublishAuto() {
  const rows = await db.bannerExtraction.findMany({ where: { origin: "auto", status: "published" }, select: { id: true, productId: true } });
  for (const r of rows) await unpublishExtraction(r.productId, r.id);
  return { extractions: rows.length, products: new Set(rows.map((r) => r.productId)).size };
}
