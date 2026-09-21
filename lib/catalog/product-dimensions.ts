import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { extractDims, compareDims, plausible, unifyDims, boundsRef, spreadRef, type Dims3, type DimRef, type ExtractedDims } from "./dimensions";

/**
 * Διαστάσεις προϊόντων στη βάση: μία γραμμή ανά πηγή (`ProductDimension`) και η
 * ετυμηγορία της σύγκρισης πάνω στο προϊόν (`dimStatus`, `dimDeltaPct`, `dimNote`).
 *
 * Ποιες χρησιμοποιεί το AR / «χωράει στον χώρο μου» (`resolveDims`):
 *   1. manual — ό,τι όρισε διαχειριστής
 *   2. s1-desc — η περιγραφή του ERP: δίνει δεκαδικά και περιλαμβάνει προεξοχές
 *   3. eprel — ακέραια εκατοστά, συχνά χωρίς πόρτα / λαβές
 * με μία εξαίρεση: όταν οι δύο πηγές **συγκρούονται** και το ERP είναι εκτός τυπικών
 * ορίων για τον τύπο ενώ το EPREL όχι, κερδίζει το EPREL (λάθος μονάδα ή σειρά στο ERP).
 */
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

/**
 * Διαστάσεις από τα χαρακτηριστικά της περιγραφής για όλα τα προϊόντα, ΟΜΟΓΕΝΟΠΟΙΗΜΕΝΕΣ: πάντα εκατοστά, πάντα Π×Υ×Β.
 * Δύο περάσματα: πρώτα διαβάζονται όλες, ώστε κάθε τύπος χωρίς ρητά όρια να πάρει εύρος αναφοράς από τα δικά του προϊόντα·
 * μετά κάθε τριάδα περνά από το `unifyDims` (λάθος μονάδα, μικτές μονάδες, λάθος σειρά). Ό,τι διορθώθηκε το γράφει στο
 * `warning` — η αρχική γραμμή μένει στο `rawValue`. Το ίδιο πέρασμα ομογενοποιεί και τις γραμμές του EPREL. Γράφει μόνο ό,τι άλλαξε.
 */
export async function projectDimensions() {
  const existing = new Map((await db.productDimension.findMany({ where: { source: "s1-desc" } })).map((d) => [d.productId, d]));
  const found: { id: string; type: string; d: ExtractedDims }[] = []; let products = 0;
  for (let cursor: string | undefined; ;) {
    const rows = await db.product.findMany({ where: { source: "softone" }, orderBy: { id: "asc" }, take: 1000, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), select: { id: true, category: { select: { name: true } }, specs: { where: { source: "s1-desc" }, select: { key: true, value: true } } } });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id; products += rows.length;
    for (const p of rows) { const d = extractDims(p.specs, p.category.name); if (d) found.push({ id: p.id, type: p.category.name, d }); }
  }
  const refs = typeRefs(found.map((x) => ({ type: x.type, dims: x.d })));
  const fresh: Prisma.ProductDimensionCreateManyInput[] = [];
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  const seen = new Set<string>(); let warned = 0, fixed = 0;
  for (const { id, type, d: raw } of found) {
    seen.add(id);
    const u = unifyDims(raw, refs.get(type) ?? null, raw.fromMm), d = u.dims; if (u.fix) fixed++;
    const out = plausible(d, type); if (out) warned++;
    const warning = u.fix ?? out;
    const data = { kind: raw.kind, w: d.w, h: d.h, d: d.d, rawKey: raw.key.slice(0, 190), rawValue: raw.value.slice(0, 190), warning };
    const e = existing.get(id);
    if (!e) fresh.push({ productId: id, source: "s1-desc", ...data });
    else if (e.w !== d.w || e.h !== d.h || e.d !== d.d || e.kind !== raw.kind || e.warning !== warning || e.rawValue !== data.rawValue) ops.push(db.productDimension.update({ where: { id: e.id }, data }));
  }
  const gone = [...existing.values()].filter((e) => !seen.has(e.productId)).map((e) => e.id);
  for (const part of chunk(fresh, 2000)) await db.productDimension.createMany({ data: part, skipDuplicates: true });
  for (const part of chunk(ops, 100)) await db.$transaction(part);
  if (gone.length) await db.productDimension.deleteMany({ where: { id: { in: gone } } });
  const eprel = await unifyEprelDimensions();
  const status = await refreshDimStatus();
  return { products, withDims: seen.size, created: fresh.length, updated: ops.length, removed: gone.length, fixed, eprelFixed: eprel.fixed, outOfBounds: warned, status };
}

/** Εύρος αναφοράς ανά τύπο: ρητά όρια όπου υπάρχουν, αλλιώς από την κατανομή των προϊόντων του τύπου, αν είναι ομοιογενής. */
function typeRefs(all: { type: string; dims: Dims3 }[]): Map<string, DimRef> {
  const by = new Map<string, Dims3[]>();
  for (const x of all) (by.get(x.type) ?? by.set(x.type, []).get(x.type)!).push(x.dims);
  const out = new Map<string, DimRef>();
  for (const [type, list] of by) { const r = boundsRef(type) ?? spreadRef(list); if (r) out.set(type, r); }
  return out;
}

/** Το EPREL έχει κι αυτό λάθη μονάδας («545 × 143 × 555»: ύψος 1430 χιλ. γραμμένο 143). Μόνο με ρητά όρια τύπου — εκεί δεν χωρά αμφιβολία. */
export async function unifyEprelDimensions() {
  const rows = await db.productDimension.findMany({ where: { source: "eprel" }, select: { id: true, w: true, h: true, d: true, warning: true, product: { select: { category: { select: { name: true } } } } } });
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const r of rows) {
    const type = r.product.category.name, ref = boundsRef(type);
    const u = unifyDims({ w: r.w, h: r.h, d: r.d }, ref, true); if (!u.fix) continue; // το EPREL δηλώνει σχεδόν πάντα χιλιοστά
    ops.push(db.productDimension.update({ where: { id: r.id }, data: { w: u.dims.w, h: u.dims.h, d: u.dims.d, warning: u.fix } }));
  }
  for (const part of chunk(ops, 100)) await db.$transaction(part);
  return { rows: rows.length, fixed: ops.length };
}

/** Ξαναϋπολογίζει την ετυμηγορία ERP ↔ EPREL για όλα τα προϊόντα που έχουν διαστάσεις από κάποια πηγή. */
export async function refreshDimStatus(productIds?: string[]) {
  const dims = await db.productDimension.findMany({ where: { source: { in: ["s1-desc", "eprel"] }, ...(productIds ? { productId: { in: productIds } } : {}) }, select: { productId: true, source: true, w: true, h: true, d: true } });
  const by = new Map<string, { erp?: Dims3; eprel?: Dims3 }>();
  for (const x of dims) { const e = by.get(x.productId) ?? {}; e[x.source === "eprel" ? "eprel" : "erp"] = { w: x.w, h: x.h, d: x.d }; by.set(x.productId, e); }
  const current = new Map((await db.product.findMany({ where: productIds ? { id: { in: productIds } } : { OR: [{ dimStatus: { not: null } }, { id: { in: [...by.keys()] } }] }, select: { id: true, dimStatus: true, dimDeltaPct: true, dimNote: true } })).map((p) => [p.id, p]));
  const ops: Prisma.PrismaPromise<unknown>[] = []; const tally: Record<string, number> = {};
  for (const [id, cur] of current) {
    const e = by.get(id);
    const c = e?.erp && e.eprel ? compareDims(e.erp, e.eprel) : null;
    const next = { dimStatus: c ? c.verdict : e?.erp ? "erp-only" : e?.eprel ? "eprel-only" : null, dimDeltaPct: c?.maxPct ?? null, dimNote: c && c.verdict !== "match" ? c.note : null };
    if (next.dimStatus) tally[next.dimStatus] = (tally[next.dimStatus] ?? 0) + 1;
    if (cur.dimStatus !== next.dimStatus || cur.dimDeltaPct !== next.dimDeltaPct || cur.dimNote !== next.dimNote) ops.push(db.product.update({ where: { id }, data: next }));
  }
  for (const part of chunk(ops, 100)) await db.$transaction(part);
  return tally;
}

export interface ResolvedDims extends Dims3 { source: "manual" | "s1-desc" | "eprel"; kind: string; note: string | null }

/** Οι διαστάσεις που πρέπει να χρησιμοποιήσει το AR για ένα προϊόν της βάσης, ή null. */
export async function resolveDims(productId: string): Promise<ResolvedDims | null> {
  const p = await db.product.findUnique({ where: { id: productId }, select: { dimStatus: true, dimNote: true, category: { select: { name: true } }, dimensions: true } });
  if (!p) return null;
  const get = (s: string) => p.dimensions.find((d) => d.source === s);
  const manual = get("manual"), erp = get("s1-desc"), eprel = get("eprel");
  const pick = (d: NonNullable<typeof erp>, source: ResolvedDims["source"], note: string | null): ResolvedDims => ({ w: d.w, h: d.h, d: d.d, kind: d.kind, source, note });
  if (manual) return pick(manual, "manual", null);
  if (erp && eprel && (p.dimStatus === "conflict" || p.dimStatus === "swapped") && plausible(erp, p.category.name) && !plausible(eprel, p.category.name)) return pick(eprel, "eprel", `Το ERP είναι εκτός τυπικών ορίων — χρησιμοποιείται το EPREL. ${p.dimNote ?? ""}`.trim());
  if (erp) return pick(erp, "s1-desc", p.dimStatus === "conflict" || p.dimStatus === "swapped" ? p.dimNote : null);
  if (eprel) return pick(eprel, "eprel", "Δήλωση κατασκευαστή στο EPREL — συνήθως χωρίς προεξοχές (πόρτα, λαβές).");
  return null;
}
