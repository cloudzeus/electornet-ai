"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac/guard";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import type { JobResult } from "@/lib/scheduler/jobs";
import { cachedCategories, cachedSitemap, fetchProduct } from "@/lib/competitors/kotsovolos/client";
import { createPacer } from "@/lib/competitors/kotsovolos/pacer";
import { decidePrice, ourPrice } from "@/lib/competitors/run-core";
import { knownPath, suggestPath } from "@/lib/competitors/mapping-core";

const COMP = "kotsovolos";
const JOB = "competitor-kotsovolos";
const PATH = "/admin/catalog/competitors";
type Out = { ok: true } | { ok: false; error: string };

async function tree() {
  const cats = await db.category.findMany({ select: { id: true, name: true, parentId: true, active: true, productCount: true } });
  const byId = new Map(cats.map((c) => [c.id, c]));
  const kids = new Map<string, string[]>();
  for (const c of cats) if (c.parentId) kids.set(c.parentId, [...(kids.get(c.parentId) ?? []), c.id]);
  const grand = (id: string) => { const p = byId.get(id)?.parentId; return p ? byId.get(p)?.parentId ?? null : null; };
  const node = (id: string) => { const c = byId.get(id), p = c?.parentId ? byId.get(c.parentId) : null; let r = c; while (r?.parentId && byId.get(r.parentId)) r = byId.get(r.parentId); return { id, parentId: c?.parentId ?? null, grandId: grand(id), name: c?.name ?? "", parentName: p?.name ?? null, rootName: r?.name ?? null }; };
  /** Οι τελικές κατηγορίες (εκεί κάθονται τα προϊόντα) κάτω από μια κατηγορία, μόνο ενεργές με προϊόντα. */
  const leaves = (id: string): string[] => { const k = kids.get(id); if (k?.length) return k.flatMap(leaves); const c = byId.get(id); return c?.active && c.productCount > 0 ? [id] : []; };
  const rows = new Map((await db.competitorCategoryMap.findMany({ where: { competitor: COMP } })).map((r) => [r.categoryId, r]));
  const mapped = [...rows.values()].filter((r) => r.extPath).map((r) => ({ ...node(r.categoryId), extPath: r.extPath as string }));
  return { cats, byId, kids, grand, node, leaves, rows, mapped };
}
const knownPaths = () => cachedCategories().then((k) => k.map((x) => x.path), () => null);

/** Μετά από επιβεβαίωση: ξαναϋπολογίζει τις ανεπιβεβαίωτες προτάσεις στις αδελφές/ξαδέρφες (δεν προσθέτει κατηγορίες). */
async function refreshSuggestions(categoryId: string, known: string[]) {
  const t = await tree();
  const me = t.node(categoryId);
  for (const row of t.rows.values()) {
    if (row.extPath || row.categoryId === categoryId) continue;
    const c = t.node(row.categoryId);
    if (!((me.parentId && c.parentId === me.parentId) || (me.grandId && c.grandId === me.grandId))) continue;
    const s = suggestPath(c, t.mapped, known);
    if (s && s !== row.suggested) await db.competitorCategoryMap.update({ where: { id: row.id }, data: { suggested: s } });
  }
}

/** Προσθέτει τις τελικές κατηγορίες κάτω από `categoryId` (ή την ίδια) με πρόταση `suggested`· δεν συγκρίνονται πριν από επιβεβαίωση. */
async function addUnder(categoryId: string, userId: string, action: string): Promise<{ ok: true; added: number; suggested: number } | { ok: false; error: string }> {
  const t = await tree();
  if (!t.byId.has(categoryId)) return { ok: false, error: "Άγνωστη κατηγορία." };
  const ids = t.leaves(categoryId).filter((id) => !t.rows.has(id));
  if (!ids.length) return { ok: false, error: "Οι κατηγορίες με προϊόντα εδώ είναι ήδη στη σύγκριση." };
  const known = await knownPaths();
  const data = ids.map((id) => ({ competitor: COMP, categoryId: id, suggested: known ? suggestPath(t.node(id), t.mapped, known) : null }));
  const suggested = data.filter((d) => d.suggested).length;
  // skipDuplicates: δύο ταυτόχρονες προσθήκες της ίδιας κατηγορίας δεν σκάνε
  const { count } = await db.competitorCategoryMap.createMany({ data, skipDuplicates: true });
  await audit(userId, action, "Category", categoryId, null, { added: count, suggested });
  revalidatePath(PATH);
  return { ok: true, added: count, suggested };
}

/** Πρόσθεσε μια κατηγορία μας στη σύγκριση (αν έχει υποκατηγορίες, μπαίνουν όλες). */
export async function addCategory(categoryId: string) {
  const user = await requirePermission("catalog.products.write");
  return addUnder(categoryId, user.id, "competitor.category.add");
}

/** «Πρότεινε όλες»: όλες οι τελικές κατηγορίες μιας ριζικής, με πρόταση προς έλεγχο. */
export async function suggestAll(rootCategoryId: string) {
  const user = await requirePermission("catalog.products.write");
  return addUnder(rootCategoryId, user.id, "competitor.category.suggestAll");
}

/** Βγάζει την κατηγορία από τη σύγκριση· οι τιμές που βρέθηκαν ήδη μένουν. */
export async function removeCategory(categoryId: string): Promise<Out> {
  const user = await requirePermission("catalog.products.write");
  const row = await db.competitorCategoryMap.findUnique({ where: { competitor_categoryId: { competitor: COMP, categoryId } } });
  if (!row) return { ok: true };
  await db.competitorCategoryMap.delete({ where: { id: row.id } });
  await audit(user.id, "competitor.category.remove", "Category", categoryId, { extPath: row.extPath, suggested: row.suggested }, null);
  revalidatePath(PATH);
  return { ok: true };
}

/** Επιβεβαίωση/αλλαγή: κατηγορία μας → κατηγορία Κωτσόβολου (από εδώ και πέρα συγκρίνεται). null = χωρίς επιλογή, δεν συγκρίνεται. */
export async function setCategoryMap(categoryId: string, extPath: string | null): Promise<Out> {
  const user = await requirePermission("catalog.products.write");
  if (!(await db.category.findUnique({ where: { id: categoryId }, select: { id: true } }))) return { ok: false, error: "Άγνωστη κατηγορία." };
  const known = await knownPaths();
  if (!known) return { ok: false, error: "Δεν φόρτωσαν οι κατηγορίες του Κωτσόβολου — δοκίμασε σε λίγο." };
  if (extPath !== null && !knownPath(extPath, known)) return { ok: false, error: "Η κατηγορία δεν υπάρχει στον Κωτσόβολο." };
  const key = { competitor_categoryId: { competitor: COMP, categoryId } };
  const before = await db.competitorCategoryMap.findUnique({ where: key });
  await db.competitorCategoryMap.upsert({ where: key, update: { extPath, suggested: null }, create: { competitor: COMP, categoryId, extPath } });
  await refreshSuggestions(categoryId, known);
  await audit(user.id, "competitor.category", "Category", categoryId, before ? { extPath: before.extPath } : null, { extPath });
  revalidatePath(PATH);
  return { ok: true };
}

/** Βγάζει μαζί όσες κατηγορίες της λίστας δεν έχουν επιβεβαιωμένη αντιστοίχιση (extPath null)· οι επιβεβαιωμένες μένουν. */
export async function removeUnconfirmed(categoryIds: string[]): Promise<{ ok: true; removed: number } | { ok: false; error: string }> {
  const user = await requirePermission("catalog.products.write");
  if (!Array.isArray(categoryIds) || categoryIds.length > 2000 || !categoryIds.every((id) => typeof id === "string")) return { ok: false, error: "Μη έγκυρη λίστα κατηγοριών." };
  const { count } = await db.competitorCategoryMap.deleteMany({ where: { competitor: COMP, categoryId: { in: categoryIds }, extPath: null } });
  await audit(user.id, "competitor.category.removeUnconfirmed", "Category", null, null, { removed: count });
  revalidatePath(PATH);
  return { ok: true, removed: count };
}

/** Πώς γράφεται η μάρκα στον Κωτσόβολο, ή ότι δεν τη φέρνουν (τότε δεν ψάχνεται και δεν μετρά ως αποτυχία). */
export async function setBrandMap(brandId: string, patch: { alias?: string | null; notCarried?: boolean }): Promise<Out> {
  const user = await requirePermission("catalog.products.write");
  if (typeof brandId !== "string") return { ok: false, error: "Άγνωστη μάρκα." };
  if (!(await db.brand.findUnique({ where: { id: brandId }, select: { id: true } }))) return { ok: false, error: "Άγνωστη μάρκα." };
  if (!patch || typeof patch !== "object") return { ok: false, error: "Μη έγκυρη αλλαγή." };
  const { alias, notCarried } = patch;
  if (alias !== undefined && alias !== null && typeof alias !== "string") return { ok: false, error: "Μη έγκυρο όνομα." };
  if (notCarried !== undefined && typeof notCarried !== "boolean") return { ok: false, error: "Μη έγκυρη τιμή «δεν τη φέρνουν»." };
  const data: { alias?: string | null; notCarried?: boolean } = {};
  if (alias !== undefined) {
    const a = alias?.trim() || null;
    if (a && a.length > 60) return { ok: false, error: "Το όνομα είναι πολύ μεγάλο (έως 60 χαρακτήρες)." };
    data.alias = a;
  }
  if (notCarried !== undefined) data.notCarried = notCarried;
  if (!Object.keys(data).length) return { ok: false, error: "Δεν άλλαξε τίποτα." };
  const key = { competitor_brandId: { competitor: COMP, brandId } };
  const before = await db.competitorBrandMap.findUnique({ where: key });
  await db.competitorBrandMap.upsert({ where: key, update: data, create: { competitor: COMP, brandId, ...data } });
  await audit(user.id, "competitor.brand", "Brand", brandId, before ? { alias: before.alias, notCarried: before.notCarried } : null, data);
  revalidatePath(PATH);
  return { ok: true };
}

/** «Τρέξε τώρα»: ξεκινά στο παρασκήνιο (ίδιοι ρυθμοί, έως 300 κλήσεις) και επιστρέφει αμέσως. */
export async function runNow(): Promise<JobResult> {
  const user = await requirePermission("catalog.sync.run");
  const { jobStatus, runJob } = await import("@/lib/scheduler");
  const st = (await jobStatus()).find((j) => j.key === JOB);
  if (st?.running) return { ok: false, message: "Τρέχει ήδη έλεγχος — η σελίδα δείχνει την πρόοδό του." };
  const { readState } = await import("@/lib/competitors/run");
  if ((await readState()).paused) return { ok: false, message: "Η εργασία είναι σε παύση — πάτα πρώτα «Ξαναενεργοποίηση»." };
  after(async () => { await runJob(JOB, "manual"); });
  await audit(user.id, "competitor.run", "ScheduledJob", JOB, null, null);
  return { ok: true, message: "Ξεκίνησε. Έως 300 έλεγχοι με παύσεις, περίπου 25 λεπτά· η σελίδα δείχνει την πρόοδο." };
}

/** Μετά από «ο Κωτσόβολος μάς έκοψε»: σβήνει την παύση και τον μετρητή νυχτών με φρένο. */
export async function resumeJob(): Promise<Out> {
  const user = await requirePermission("catalog.sync.run");
  const { writeState } = await import("@/lib/competitors/run");
  await writeState({ paused: false, brakedNights: 0 });
  await audit(user.id, "competitor.resume", "Setting", "competitors.kotsovolos", null, null);
  revalidatePath(PATH);
  return { ok: true };
}

// ---- Ζευγάρι ανά προϊόν (καρτέλα προϊόντος) ----
const productPath = (id: string) => `/admin/catalog/${id}`;

/** Υποψήφια για «Βρες ζευγάρι»: από το sitemap (κρυφή μνήμη 24ώρου), μόνο στην αντιστοιχισμένη κατηγορία, χωρίς τα απορριφθέντα. Το φιλτράρισμα κειμένου γίνεται στον browser. */
export async function pairCandidates(productId: string): Promise<{ ok: true; items: { art: string; last: string }[]; extPath: string } | { ok: false; error: string }> {
  await requirePermission("catalog.products.write");
  if (typeof productId !== "string") return { ok: false, error: "Άγνωστο προϊόν." };
  const p = await db.product.findUnique({ where: { id: productId }, select: { categoryId: true, competitorPrices: { where: { competitor: COMP }, select: { rejectedExtIds: true } } } });
  if (!p) return { ok: false, error: "Άγνωστο προϊόν." };
  const map = await db.competitorCategoryMap.findUnique({ where: { competitor_categoryId: { competitor: COMP, categoryId: p.categoryId } } });
  if (!map?.extPath) return { ok: false, error: "Η κατηγορία του προϊόντος δεν συγκρίνεται ακόμη με τον Κωτσόβολο — αντιστοίχισέ την πρώτα στη σελίδα «Σύγκριση τιμών»." };
  const sitemap = await cachedSitemap().catch(() => null);
  if (!sitemap) return { ok: false, error: "Δεν φόρτωσε η λίστα προϊόντων του Κωτσόβολου — δοκίμασε σε λίγο." };
  const rejected = new Set(p.competitorPrices[0]?.rejectedExtIds ?? []);
  const path = map.extPath;
  const items = sitemap.filter((i) => (i.path === path || i.path.startsWith(path + "/")) && !rejected.has(i.art)).map((i) => ({ art: i.art, last: i.last }));
  return { ok: true, items, extPath: path };
}

/** Ορίζει χειροκίνητα το ζευγάρι (match=manual) και φέρνει αμέσως την τιμή του (μία κλήση). Διαφορετικό EAN δεν το απορρίπτει: μένει σημείωση «έλεγξε». */
export async function setPair(productId: string, art: string): Promise<Out> {
  const user = await requirePermission("catalog.products.write");
  if (typeof productId !== "string") return { ok: false, error: "Άγνωστο προϊόν." };
  if (typeof art !== "string" || !/^\d{1,12}$/.test(art.trim())) return { ok: false, error: "Ο αριθμός είδους του Κωτσόβολου είναι μόνο ψηφία." };
  art = art.trim();
  const p = await db.product.findUnique({ where: { id: productId }, select: { id: true, price: true, ean: true, offer: { select: { price: true } }, competitorPrices: { where: { competitor: COMP } } } });
  if (!p) return { ok: false, error: "Άγνωστο προϊόν." };
  const row = p.competitorPrices[0];
  // Μία κλήση, χωρίς αναμονή: αν ο Κωτσόβολος ζητήσει να περιμένουμε (429), επιστρέφει σφάλμα αντί να κρεμάσει τη σελίδα.
  const pacer = createPacer({ budget: 1, until: new Date(Date.now() + 60_000), sleep: async () => {} });
  const r = await fetchProduct(art, pacer).catch((e: Error) => ({ error: e.message }));
  if ("error" in r) return { ok: false, error: r.error === "δεν βρέθηκε (404)" ? `Ο Κωτσόβολος δεν έχει είδος ${art}.` : `Ο Κωτσόβολος δεν απάντησε σωστά (${r.error}) — δοκίμασε σε λίγο.` };
  const same = row?.extId === art;
  const kot = same && row?.extUrl ? null : (await cachedSitemap().catch(() => null))?.find((i) => i.art === art) ?? null;
  const ours = ourPrice({ price: p.price, offer: p.offer });
  const their = (x: typeof row) => (x?.offerPrice != null ? Number(x.offerPrice) : x?.listPrice != null ? Number(x.listPrice) : null);
  const d = decidePrice({
    prev: { match: "manual", extUrl: row?.extUrl ?? null, missCount: 0, their: same ? their(row) : null, ourPrice: same && row?.ourPrice != null ? Number(row.ourPrice) : null },
    base: "auto", note: null, parsed: r, ourEan: p.ean, ourPrice: ours,
  });
  const data = {
    match: "manual", extId: art, extUrl: kot ? `${kot.path}/${kot.last}` : same ? row?.extUrl ?? null : null, extTitle: r.title || (same ? row?.extTitle ?? null : null),
    lastError: d.lastError, missCount: 0, checkedAt: new Date(), available: d.available ?? r.buyable,
    listPrice: d.prices?.list ?? null, offerPrice: d.prices?.offer ?? null, ourPrice: d.prices?.ourPrice ?? ours, diffPct: d.prices?.diff ?? null,
    rejectedExtIds: (row?.rejectedExtIds ?? []).filter((x) => x !== art),
  };
  const saved = await db.competitorPrice.upsert({ where: { productId_competitor: { productId: p.id, competitor: COMP } }, update: data, create: { productId: p.id, competitor: COMP, ...data } });
  if (d.prices && d.history) await db.competitorPriceHistory.create({ data: { competitorPriceId: saved.id, price: d.prices.their, ourPrice: d.prices.ourPrice } });
  await audit(user.id, "competitor.pair.set", "Product", p.id, row ? { match: row.match, extId: row.extId } : null, { match: "manual", extId: art, lastError: d.lastError });
  revalidatePath(productPath(p.id));
  return { ok: true };
}

/** «Λάθος ζευγάρι»: match=rejected, το extId δεν ξαναπροτείνεται, οι τιμές σβήνουν ώστε να μη μετρά πουθενά. */
export async function rejectPair(productId: string): Promise<Out> {
  const user = await requirePermission("catalog.products.write");
  if (typeof productId !== "string") return { ok: false, error: "Άγνωστο προϊόν." };
  const key = { productId_competitor: { productId, competitor: COMP } };
  const row = await db.competitorPrice.findUnique({ where: key });
  if (!row?.extId) return { ok: false, error: "Δεν υπάρχει ζευγάρι για απόρριψη." };
  await db.competitorPrice.update({ where: key, data: {
    match: "rejected", rejectedExtIds: [...new Set([...row.rejectedExtIds, row.extId])], lastError: `απορρίφθηκε: ${row.extUrl ?? row.extId}`,
    extId: null, extUrl: null, extTitle: null, listPrice: null, offerPrice: null, diffPct: null, ourPrice: null, missCount: 0,
  } });
  await audit(user.id, "competitor.pair.reject", "Product", productId, { match: row.match, extId: row.extId }, { match: "rejected" });
  revalidatePath(productPath(productId));
  return { ok: true };
}
