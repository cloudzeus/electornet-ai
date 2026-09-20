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
    for (const it of items) {
      const d = productDoc(it, ctx, model);
      seen.add(d.refId);
      const e = existing.get(d.refId);
      if (!e) { await db.vectorDoc.create({ data: { kind: d.kind, refId: d.refId, title: d.title, text: d.text, meta: d.meta as Prisma.InputJsonObject, hash: d.hash, stale: true } }); created++; }
      else if (e.hash !== d.hash) { await db.vectorDoc.update({ where: { id: e.id }, data: { title: d.title, text: d.text, meta: d.meta as Prisma.InputJsonObject, hash: d.hash, stale: true } }); changed++; }
    }
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
      for (const [i, d] of docs.entries()) {
        await db.$executeRawUnsafe(`UPDATE "VectorDoc" SET embedding = $1::vector, stale = false, model = $2, dims = $3, "embeddedAt" = now(), tokens = $4 WHERE id = $5`, toVector(r.vectors[i]), r.model, EMBED_DIMS, Math.round(r.tokens / docs.length), d.id);
      }
      embedded += docs.length;
    }
  } catch (e) {
    return { embedded, remaining: await db.vectorDoc.count({ where: { stale: true } }), tokens, costUsd, error: (e as Error).message };
  }
  return { embedded, remaining: await db.vectorDoc.count({ where: { stale: true } }), tokens, costUsd };
}

export interface VectorFilters { kind?: string; cat1?: number; cat2?: number; group?: number; brandS1Id?: number; maxPrice?: number; minPrice?: number; activeOnly?: boolean }
export interface VectorHit { id: string; kind: string; refId: string; title: string; text: string; meta: Record<string, unknown> | null; score: number }

export async function searchVector(query: string, filters: VectorFilters = {}, k = 8): Promise<VectorHit[]> {
  const q = query.trim();
  if (!q) return [];
  const { vectors } = await embedTexts([q]);
  const where: string[] = [`embedding IS NOT NULL`, `kind = $2`];
  const params: unknown[] = [toVector(vectors[0]), filters.kind ?? "product"];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace("?", `$${params.length}`)); };
  if (filters.cat1 != null) add(`(meta->>'cat1')::int = ?`, filters.cat1);
  if (filters.cat2 != null) add(`(meta->>'cat2')::int = ?`, filters.cat2);
  if (filters.group != null) add(`(meta->>'group')::int = ?`, filters.group);
  if (filters.brandS1Id != null) add(`(meta->>'brandS1Id')::int = ?`, filters.brandS1Id);
  if (filters.maxPrice != null) add(`(meta->>'price')::float <= ?`, filters.maxPrice);
  if (filters.minPrice != null) add(`(meta->>'price')::float >= ?`, filters.minPrice);
  if (filters.activeOnly !== false) where.push(`(meta->>'active')::boolean IS TRUE`);
  params.push(Math.min(50, Math.max(1, k)));
  const rows = await db.$queryRawUnsafe<{ id: string; kind: string; refId: string; title: string; text: string; meta: Record<string, unknown> | null; score: number }[]>(
    `SELECT id, kind, "refId", title, text, meta, (1 - (embedding <=> $1::vector))::float8 AS score FROM "VectorDoc" WHERE ${where.join(" AND ")} ORDER BY embedding <=> $1::vector LIMIT $${params.length}`, ...params);
  return rows;
}

/**
 * Αναζήτηση προϊόντων για τον Ερμή: πρώτα ακριβές ταίριασμα κωδικού (ο
 * πελάτης που γράφει «WW90T534» θέλει αυτό το μοντέλο, όχι «κάτι παρόμοιο»),
 * μετά σημασιολογική ομοιότητα.
 */
export async function semanticProducts(query: string, filters: VectorFilters = {}, k = 8) {
  const code = query.trim().toUpperCase().replace(/\s+/g, "");
  const exact = /^[A-Z0-9][A-Z0-9\-_/.]{4,}$/.test(code) && /\d/.test(code)
    ? await db.s1Item.findMany({ where: { missing: false, active: true, OR: [{ code: { contains: code, mode: "insensitive" } }, { factoryCode: { contains: code, mode: "insensitive" } }, { barcode: code }] }, take: 5, select: { mtrl: true } })
    : [];
  const hits = await searchVector(query, { ...filters, kind: "product" }, k);
  const exactIds = new Set(exact.map((e) => String(e.mtrl)));
  return [...hits.filter((h) => exactIds.has(h.refId)).map((h) => ({ ...h, exact: true })), ...hits.filter((h) => !exactIds.has(h.refId)).map((h) => ({ ...h, exact: false }))];
}

export async function vectorStats() {
  const [total, stale, embedded, last] = await Promise.all([
    db.vectorDoc.count({ where: { kind: "product" } }), db.vectorDoc.count({ where: { kind: "product", stale: true } }),
    db.vectorDoc.count({ where: { kind: "product", stale: false } }), db.vectorDoc.findFirst({ where: { embeddedAt: { not: null } }, orderBy: { embeddedAt: "desc" }, select: { embeddedAt: true, model: true } }),
  ]);
  return { total, stale, embedded, lastAt: last?.embeddedAt ?? null, model: last?.model ?? (await embedModel()) };
}
