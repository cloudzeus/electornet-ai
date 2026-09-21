import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { embedTexts, embedModel, toVector, EMBED_DIMS } from "./embed";
import { loadDocContext, productDoc } from "./documents";

/**
 * Διανυσματικό ευρετήριο (pgvector) για τον Ερμή και την αναζήτηση.
 *
 * Δύο βήματα, ξεχωριστά ώστε το ακριβό να τρέχει μόνο όταν χρειάζεται:
 * 1. `refreshProductDocs()` — ξαναγράφει το κείμενο κάθε είδους από τον
 *    καθρέφτη του SoftOne. Όπου άλλαξε το hash, το έγγραφο γίνεται `stale`.
 * 2. `embedStale()` — υπολογίζει embeddings μόνο για τα `stale`, σε παρτίδες.
 * Η αναζήτηση φιλτράρει πρώτα με τα `meta` (κατηγορία, μάρκα, τιμή, ενεργό)
 * και μετά ταξινομεί με συνημιτονική απόσταση.
 */
const BATCH = 64;

export async function refreshProductDocs(): Promise<{ total: number; created: number; changed: number; removed: number }> {
  const [ctx, model] = await Promise.all([loadDocContext(), embedModel()]);
  const existing = new Map((await db.vectorDoc.findMany({ where: { kind: "product" }, select: { id: true, refId: true, hash: true } })).map((d) => [d.refId, d]));
  let created = 0, changed = 0, cursor = -2147483648; // από το ελάχιστο Int, όχι από το 0
  const seen = new Set<string>();
  for (;;) {
    const items = await db.s1Item.findMany({ where: { mtrl: { gt: cursor }, missing: false, active: true }, orderBy: { mtrl: "asc" }, take: 500 });
    if (!items.length) break;
    cursor = items[items.length - 1].mtrl;
    // Μαζικά: μία εγγραφή για όλα τα νέα της σελίδας και μία συναλλαγή για τα αλλαγμένα —
    // γραμμή-γραμμή, η απομακρυσμένη βάση θέλει πάνω από 10 λεπτά για 9.000 είδη.
    const fresh: Prisma.VectorDocCreateManyInput[] = [];
    const updates: Prisma.PrismaPromise<unknown>[] = [];
    for (const it of items) {
      const d = productDoc(it, ctx, model);
      seen.add(d.refId);
      const e = existing.get(d.refId);
      const data = { title: d.title, text: d.text, meta: d.meta as Prisma.InputJsonObject, hash: d.hash, stale: true };
      if (!e) fresh.push({ kind: d.kind, refId: d.refId, ...data });
      else if (e.hash !== d.hash) updates.push(db.vectorDoc.update({ where: { id: e.id }, data }));
    }
    if (fresh.length) created += (await db.vectorDoc.createMany({ data: fresh, skipDuplicates: true })).count;
    if (updates.length) { await db.$transaction(updates); changed += updates.length; }
  }
  // Είδη που έφυγαν από το site ή απενεργοποιήθηκαν: βγαίνουν από το ευρετήριο
  const gone = [...existing.values()].filter((e) => !seen.has(e.refId)).map((e) => e.id);
  if (gone.length) await db.vectorDoc.deleteMany({ where: { id: { in: gone } } });
  return { total: seen.size, created, changed, removed: gone.length };
}

export async function embedStale(limit = 2000): Promise<{ embedded: number; remaining: number; tokens: number; costUsd: number; error?: string }> {
  let embedded = 0, tokens = 0, costUsd = 0;
  try {
    while (embedded < limit) {
      const docs = await db.vectorDoc.findMany({ where: { stale: true }, orderBy: { updatedAt: "asc" }, take: Math.min(BATCH, limit - embedded), select: { id: true, text: true } });
      if (!docs.length) break;
      const r = await embedTexts(docs.map((d) => d.text.slice(0, 7000)));
      tokens += r.tokens; costUsd += r.costUsd;
      // Μία UPDATE ανά παρτίδα (VALUES) αντί για μία ανά έγγραφο
      const per = Math.round(r.tokens / docs.length);
      const values = docs.map((_, i) => `($${i * 2 + 4}, $${i * 2 + 5}::vector)`).join(", ");
      await db.$executeRawUnsafe(
        `UPDATE "VectorDoc" d SET embedding = v.e, stale = false, model = $1, dims = $2, "embeddedAt" = now(), tokens = $3 FROM (VALUES ${values}) AS v(id, e) WHERE d.id = v.id`,
        r.model, EMBED_DIMS, per, ...docs.flatMap((d, i) => [d.id, toVector(r.vectors[i])]),
      );
      embedded += docs.length;
    }
  } catch (e) {
    return { embedded, remaining: await db.vectorDoc.count({ where: { stale: true } }), tokens, costUsd, error: (e as Error).message };
  }
  return { embedded, remaining: await db.vectorDoc.count({ where: { stale: true } }), tokens, costUsd };
}

export interface VectorFilters { kind?: string; cat1?: number; cat2?: number; group?: number; groups?: number[]; refIds?: string[]; brandS1Id?: number; maxPrice?: number; minPrice?: number; activeOnly?: boolean }
export interface VectorHit { id: string; kind: string; refId: string; title: string; text: string; meta: Record<string, unknown> | null; score: number }

/** `vector`: έτοιμο διάνυσμα της ερώτησης, όταν ο ίδιος γύρος κάνει πολλές αναζητήσεις (μία κλήση embedding αντί για τρεις). */
export async function searchVector(query: string, filters: VectorFilters = {}, k = 8, vector?: number[]): Promise<VectorHit[]> {
  const q = query.trim();
  if (!q) return [];
  const qv = vector ?? (await embedTexts([q])).vectors[0];
  const where: string[] = [`embedding IS NOT NULL`, `kind = $2`];
  const params: unknown[] = [toVector(qv), filters.kind ?? "product"];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace("?", `$${params.length}`)); };
  if (filters.cat1 != null) add(`(meta->>'cat1')::int = ?`, filters.cat1);
  if (filters.cat2 != null) add(`(meta->>'cat2')::int = ?`, filters.cat2);
  if (filters.group != null) add(`(meta->>'group')::int = ?`, filters.group);
  if (filters.groups?.length) add(`(meta->>'group')::int = ANY(?::int[])`, filters.groups);
  if (filters.refIds?.length) add(`"refId" = ANY(?::text[])`, filters.refIds);
  if (filters.brandS1Id != null) add(`(meta->>'brandS1Id')::int = ?`, filters.brandS1Id);
  if (filters.maxPrice != null) add(`(meta->>'price')::float <= ?`, filters.maxPrice);
  if (filters.minPrice != null) add(`(meta->>'price')::float >= ?`, filters.minPrice);
  if (filters.activeOnly !== false) where.push(`(meta->>'active')::boolean IS TRUE`);
  params.push(Math.min(50, Math.max(1, k)));
  const rows = await db.$queryRawUnsafe<{ id: string; kind: string; refId: string; title: string; text: string; meta: Record<string, unknown> | null; score: number }[]>(
    `SELECT id, kind, "refId", title, text, meta, (1 - (embedding <=> $1::vector))::float8 AS score FROM "VectorDoc" WHERE ${where.join(" AND ")} ORDER BY embedding <=> $1::vector LIMIT $${params.length}`, ...params);
  return rows;
}

// ── Πρόθεση: ποιον τύπο προϊόντος ζητάει η ερώτηση ─────────────────────────
// Το embedding μόνο του μπερδεύεται όταν μια δευτερεύουσα λέξη είναι πιο «δυνατή»
// από το ουσιαστικό («κλιματιστικό με wifi» → routers). Οι ομάδες του SoftOne
// («Κλιματιστικά Inverter», «Πλυντήρια Ρούχων») λένε καθαρά τι είναι το κάθε είδος,
// οπότε ταιριάζουμε τις λέξεις της ερώτησης στα ονόματά τους και ψάχνουμε πρώτα εκεί.
const STOP = new Set(["για", "και", "που", "κατι", "ενα", "μια", "ενας", "στο", "στη", "στην", "στον", "απο", "τον", "την", "της", "του", "των", "τους", "τις", "ειναι", "θελω", "ψαχνω", "μου", "σου", "μας", "πιο", "πολυ", "καλο", "καλη", "καλυτερο", "φθηνο", "οικονομικο", "δωματιο", "σπιτι", "with", "for", "the", "and"]);
const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/ς/g, "σ");
const stem = (w: string) => (w.length >= 8 ? w.slice(0, -3) : w.length > 5 ? w.slice(0, -2) : w.length > 3 ? w.slice(0, -1) : w);
// Ελληνική λέξη: ρίζα οπουδήποτε μέσα στο όνομα («χυμό» → «Αποχυμωτές»). Λατινική: ολόκληρη λέξη μόνο —
// αλλιώς το «pro» του «iPhone 18 Pro» ταιριάζει στους «Projectors».
const hits = (name: string, word: string) => (/^[a-z0-9]+$/.test(word) ? name.split(/[^a-z0-9α-ω]+/).includes(word) : name.includes(stem(word)));

let groupCache: { at: number; rows: { s1Id: number; name: string; n: string }[] } | null = null;
async function groupNames() {
  if (groupCache && Date.now() - groupCache.at < 10 * 60_000) return groupCache.rows;
  const rows = (await db.s1SpecGroup.findMany({ select: { s1Id: true, name: true } })).map((g) => ({ ...g, n: norm(g.name) }));
  groupCache = { at: Date.now(), rows };
  return rows;
}

/** Οι ομάδες προϊόντων που «δείχνει» η ερώτηση. Οι πρώτες λέξεις μετράνε περισσότερο (στα ελληνικά το ουσιαστικό προηγείται). */
export async function detectGroups(query: string): Promise<{ s1Id: number; name: string; score: number }[]> {
  const words = norm(query).split(/[^a-z0-9α-ω]+/).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d/.test(w));
  if (!words.length) return [];
  const scored = (await groupNames())
    .map((g) => ({ s1Id: g.s1Id, name: g.name, score: words.reduce((a, w, i) => a + (hits(g.n, w) ? 1 / (1 + i) : 0), 0) }))
    .filter((g) => g.score > 0);
  const best = Math.max(0, ...scored.map((g) => g.score));
  return scored.filter((g) => g.score >= best * 0.6).sort((a, b) => b.score - a.score).slice(0, 12);
}

/** Μοιάζει με κωδικό μοντέλου («WW90T534», «GT6210D1SNM») και όχι με μέγεθος («120Hz», «256GB», «18000BTU»). */
const isModelCode = (t: string) => t.length >= 6 && /^[A-Z0-9][A-Z0-9\-_/.]+$/.test(t) && (t.match(/\d/g)?.length ?? 0) >= 2 && (t.match(/[A-Z]/g)?.length ?? 0) >= 2 && !/^\d+([.,]\d+)?(HZ|GB|TB|MB|KG|BTU|W|KW|L|LT|CM|MM|MAH|K|MP|RPM)$/.test(t);

/**
 * Αναζήτηση προϊόντων για τον Ερμή, σε τρία σκέλη:
 * 1. ακριβές ταίριασμα κωδικού — ο πελάτης που γράφει «WW90T534» θέλει αυτό το
 *    μοντέλο, όχι «κάτι παρόμοιο». Ο κωδικός κατασκευαστή ζει συνήθως μέσα στο
 *    όνομα του είδους, οπότε ψάχνουμε και εκεί·
 * 2. σημασιολογική ομοιότητα μέσα στον τύπο προϊόντος που δείχνει η ερώτηση·
 * 3. σημασιολογική ομοιότητα σε όλο τον κατάλογο, για να συμπληρωθεί η λίστα.
 */
export async function semanticProducts(query: string, filters: VectorFilters = {}, k = 8) {
  const codes = query.toUpperCase().split(/\s+/).map((t) => t.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, "")).filter(isModelCode).slice(0, 3);
  const exact = codes.length
    ? await db.s1Item.findMany({ where: { missing: false, active: true, OR: codes.flatMap((c) => [{ code: { contains: c, mode: "insensitive" as const } }, { factoryCode: { contains: c, mode: "insensitive" as const } }, { name: { contains: c, mode: "insensitive" as const } }, { barcode: c }]) }, take: 5, select: { mtrl: true } })
    : [];
  const base = { ...filters, kind: "product" };
  const intent = filters.group != null || filters.groups?.length ? [] : await detectGroups(query);
  if (!query.trim()) return [];
  const qv = (await embedTexts([query.trim()])).vectors[0];
  const [exactHits, inGroup, anywhere] = await Promise.all([
    exact.length ? searchVector(query, { ...base, refIds: exact.map((e) => String(e.mtrl)) }, 5, qv) : [],
    intent.length ? searchVector(query, { ...base, groups: intent.map((g) => g.s1Id) }, k, qv) : [],
    searchVector(query, base, k, qv),
  ]);
  const out: (VectorHit & { exact: boolean; via: "code" | "group" | "semantic" })[] = [];
  const seen = new Set<string>();
  const push = (hits: VectorHit[], via: "code" | "group" | "semantic") => { for (const h of hits) if (!seen.has(h.refId)) { seen.add(h.refId); out.push({ ...h, exact: via === "code", via }); } };
  // Δικλείδα: αν η «πρόθεση» έπεσε έξω (τα αποτελέσματά της είναι σαφώς πιο μακριά από την ερώτηση), προηγείται όλος ο κατάλογος
  const intentOff = inGroup.length > 0 && anywhere.length > 0 && anywhere[0].score - inGroup[0].score > 0.1;
  push(exactHits, "code");
  if (intentOff) { push(anywhere, "semantic"); push(inGroup, "group"); } else { push(inGroup, "group"); push(anywhere, "semantic"); }
  return out.slice(0, Math.max(k, exactHits.length));
}

export async function vectorStats() {
  const [total, stale, embedded, last] = await Promise.all([
    db.vectorDoc.count({ where: { kind: "product" } }), db.vectorDoc.count({ where: { kind: "product", stale: true } }),
    db.vectorDoc.count({ where: { kind: "product", stale: false } }), db.vectorDoc.findFirst({ where: { embeddedAt: { not: null } }, orderBy: { embeddedAt: "desc" }, select: { embeddedAt: true, model: true } }),
  ]);
  return { total, stale, embedded, lastAt: last?.embeddedAt ?? null, model: last?.model ?? (await embedModel()) };
}
