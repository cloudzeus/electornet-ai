import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { searchProducts, hasEprelKey, EprelError, type EprelRaw } from "@/lib/eprel/client";
import { upsertFromRaw, linkProduct } from "@/lib/eprel/sync";
import { normalizeModel, specLines, toRow } from "@/lib/eprel/normalize";
import { bareKey } from "./image-files";
import { refreshDimStatus } from "./product-dimensions";

/**
 * Αντιστοίχιση των προϊόντων μας με τις καταχωρίσεις του EPREL (ευρωπαϊκή βάση
 * ενεργειακής σήμανσης) και αποθήκευση όσων δηλώνει εκεί ο κατασκευαστής.
 *
 * - Ψάχνουμε μόνο τύπους που έχουν ενεργειακή ετικέτα, και μόνο στις ομάδες του EPREL που τους αντιστοιχούν.
 * - Κλειδί είναι το **μοντέλο του κατασκευαστή**. Στο ERP δεν υπάρχει σε δικό του πεδίο (το CODE2 είναι
 *   άδειο)· το βρίσκουμε, με σειρά αξιοπιστίας: (α) στο όνομα της φωτογραφίας του παλιού site
 *   (`<barcode>_<μοντέλο>-001`), (β) στον κωδικό είδους όταν μοιάζει με μοντέλο, (γ) στον τίτλο.
 * - Δεκτό μόνο όταν το μοντέλο του EPREL είναι ίδιο με το δικό μας (χωρίς κενά / παύλες / τελείες) ή το ένα
 *   είναι πρόθεμα του άλλου με ≥ 80 % του μήκους («F4J6QY1W» ↔ «F4J6QY1W.ABWQPHS»), ΚΑΙ ταιριάζει η μάρκα.
 *   Δύο διαφορετικά μοντέλα που περνούν το κριτήριο → `ambiguous`, δεν δένουμε τίποτα.
 * - Με την αντιστοίχιση αποθηκεύονται: ολόκληρη η καταχώριση (`EprelProduct.data`), η ενεργειακή ετικέτα
 *   (`EnergyLabel`, υπερισχύει της κλάσης που είχαμε από την περιγραφή), τα τεχνικά ως `Spec` (source `eprel`),
 *   οι διαστάσεις (`ProductDimension` source `eprel`) και η σύγκριση με το ERP.
 */
const PAUSE_MS = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lower = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ς/g, "σ");

/** Τύπος προϊόντος (όνομα ομάδας SoftOne) → ομάδες του EPREL, νεότερος κανονισμός πρώτα. */
const GROUPS: [RegExp, string[]][] = [
  [/πλυντηρια-στεγνωτηρια|πλυντηριο-στεγνωτηριο/, ["washerdriers2019", "washerdriers"]],
  [/πλυντηρια ρουχων/, ["washingmachines2019", "washingmachines"]],
  [/στεγνωτηρια/, ["tumbledryers20232534", "tumbledriers"]],
  [/πλυντηρια πιατων/, ["dishwashers2019", "dishwashers"]],
  [/ψυγει|καταψυκτ|συντηρητ|οινοψυκτ/, ["refrigeratingappliances2019", "refrigeratingappliances"]],
  [/τηλεορασ|οθονεσ υπολογιστ|monitor/, ["electronicdisplays", "televisions"]],
  [/κλιματιστ/, ["airconditioners"]],
  [/φουρνοι(?! μικροκυματων)|^φουρνοσ|κουζινεσ/, ["ovens"]],
  [/απορροφητηρ/, ["rangehoods"]],
  [/θερμοσιφων/, ["waterheaters", "hotwaterstoragetanks"]],
  [/^κινητα - smartphones|^tablets/, ["smartphonestablets20231669"]],
];
export const eprelGroupsFor = (typeName: string) => GROUPS.find(([re]) => re.test(lower(typeName)))?.[1] ?? null;

const looksLikeModel = (t: string) => t.length >= 5 && /[A-Z]/.test(t) && (t.match(/\d/g)?.length ?? 0) >= 2 && !/^\d+(GB|TB|KG|BTU|HZ|CM|MM|W|L|LT)$/.test(t);

/** Υποψήφια μοντέλα, το πιο αξιόπιστο πρώτο. Για κάθε ένα και η εκδοχή πριν από «.» ή «/» (κατάληξη αγοράς της LG, παραλλαγή χρώματος). */
export function modelCandidates(p: { sku: string; title: string }, imageModel?: string | null): string[] {
  const out: string[] = [];
  const add = (raw: string | null | undefined) => {
    const t = (raw ?? "").trim().toUpperCase(); if (!t) return;
    for (const v of [t, t.split(/[./]/)[0], t.split(/\s+/)[0]]) { const c = v.replace(/[^A-Z0-9\-/.+ ]/g, "").trim(); if (looksLikeModel(c.replace(/[\s\-/.]/g, "")) && !out.includes(c)) out.push(c); }
  };
  add(imageModel); add(p.sku);
  for (const tok of p.title.toUpperCase().split(/[\s,()]+/)) add(tok);
  return out.slice(0, 4);
}

const brandOk = (ours: string, theirs: string) => { const a = normalizeModel(ours), b = normalizeModel(theirs); return !!a && !!b && (a.includes(b) || b.includes(a) || a.slice(0, 4) === b.slice(0, 4)); };
const modelOk = (ours: string, theirs: string) => { const a = normalizeModel(ours), b = normalizeModel(theirs); if (!a || !b) return false; if (a === b) return true; const [s, l] = a.length <= b.length ? [a, b] : [b, a]; return l.startsWith(s) && s.length / l.length >= 0.8; };

export type MatchOutcome = { status: "matched"; raw: EprelRaw; model: string } | { status: "ambiguous" | "none"; model: string | null; candidates?: string[] };

/** Μία αναζήτηση ανά (ομάδα, υποψήφιο) μέχρι να βρεθεί κάτι — συνήθως 1–2 κλήσεις ανά προϊόν. */
export async function findInEprel(candidates: string[], brand: string, groups: string[]): Promise<MatchOutcome> {
  for (const model of candidates) {
    for (const urlCode of groups) {
      const r = await searchProducts(urlCode, { limit: 30, filters: { modelIdentifier: `${model.split(/\s+/)[0]}*` } }).catch((e) => { if (e instanceof EprelError && (e.status === 401 || e.status === 403 || e.code === "NO_KEY")) throw e; return null; });
      await sleep(PAUSE_MS);
      const ok = (r?.hits ?? []).filter((h) => modelOk(model, String(h.modelIdentifier ?? "")) && brandOk(brand, String(h.supplierOrTrademark ?? "")));
      if (!ok.length) continue;
      const models = [...new Set(ok.map((h) => normalizeModel(String(h.modelIdentifier))))];
      const exact = ok.filter((h) => normalizeModel(String(h.modelIdentifier)) === normalizeModel(model));
      const pool = exact.length ? exact : models.length === 1 ? ok : [];
      if (!pool.length) return { status: "ambiguous", model, candidates: ok.slice(0, 6).map((h) => String(h.modelIdentifier)) };
      // πολλές καταχωρίσεις του ίδιου μοντέλου: η τελευταία έκδοση, η πιο πρόσφατα δημοσιευμένη
      const best = pool.slice().sort((a, b) => Number(b.lastVersion !== false) - Number(a.lastVersion !== false) || Number(b.firstPublicationDateTS ?? 0) - Number(a.firstPublicationDateTS ?? 0))[0];
      return { status: "matched", raw: best, model };
    }
  }
  return { status: "none", model: candidates[0] ?? null };
}

/** Αποθήκευση όλων όσων δίνει το EPREL για ένα προϊόν μας. */
export async function storeEprelMatch(productId: string, raw: EprelRaw) {
  const { saved } = await upsertFromRaw(raw);
  await linkProduct(productId, saved.registrationNumber);
  await db.energyLabel.update({ where: { productId }, data: { source: "eprel" } });
  const lines = specLines(raw);
  await db.$transaction([
    db.spec.deleteMany({ where: { productId, source: "eprel" } }),
    db.spec.createMany({ data: lines.map((l, i) => ({ productId, groupName: "Ενεργειακή ετικέτα · EPREL", key: l.label, value: l.unit ? `${l.value} ${l.unit}` : l.value, sortNo: 1000 + i, source: "eprel" })) }),
  ]);
  const row = toRow(raw);
  if (row.dimensionWidth && row.dimensionHeight && row.dimensionDepth) {
    const data = { kind: "product", w: row.dimensionWidth, h: row.dimensionHeight, d: row.dimensionDepth, rawKey: `EPREL ${saved.registrationNumber}`, rawValue: `${row.dimensionWidth} × ${row.dimensionHeight} × ${row.dimensionDepth} cm (Π×Υ×Β)` };
    await db.productDimension.upsert({ where: { productId_source: { productId, source: "eprel" } }, create: { productId, source: "eprel", ...data }, update: data });
  }
  return { registrationNumber: saved.registrationNumber, specs: lines.length, hasDims: !!(row.dimensionWidth && row.dimensionHeight && row.dimensionDepth) };
}

export interface EprelBatchResult { ok: boolean; error?: string; checked: number; matched: number; ambiguous: number; none: number; remaining: number; samples: string[] }

/**
 * Μία παρτίδα: τα επόμενα `limit` προϊόντα που δεν έχουν ελεγχθεί. Συνεχίζει από εκεί που
 * σταμάτησε (`eprelStatus`), άρα τρέχει όσες φορές χρειαστεί. `retry`: ξανά και όσα βγήκαν `none`.
 */
export async function matchEprelBatch(opts: { limit?: number; retry?: boolean } = {}): Promise<EprelBatchResult> {
  const empty = { checked: 0, matched: 0, ambiguous: 0, none: 0, remaining: 0, samples: [] as string[] };
  if (!hasEprelKey()) return { ok: false, error: "Λείπει το EPREL_API_KEY στο .env — χωρίς αυτό το EPREL δεν απαντά.", ...empty };
  const types = (await db.category.findMany({ where: { source: "softone", depth: 2, productCount: { gt: 0 } }, select: { id: true, name: true } })).map((c) => ({ ...c, groups: eprelGroupsFor(c.name) })).filter((c) => c.groups);
  const groupsOf = new Map(types.map((t) => [t.id, t.groups!]));
  const where: Prisma.ProductWhereInput = { source: "softone", active: true, categoryId: { in: [...groupsOf.keys()] }, eprelStatus: opts.retry ? { in: ["none"] } : null };
  const products = await db.product.findMany({ where, orderBy: { updatedAt: "desc" }, take: Math.min(500, opts.limit ?? 100), select: { id: true, sku: true, title: true, ean: true, categoryId: true, brand: { select: { name: true } } } });
  const images = new Map((await db.imageImport.findMany({ where: { seq: 1, key: { in: products.flatMap((p) => (p.ean ? [p.ean, `0${p.ean}`, `00${p.ean}`] : [])) } }, select: { key: true, model: true } })).map((i) => [bareKey(i.key), i.model]));
  const r = { ...empty }; const touched: string[] = [];
  try {
    for (const p of products) {
      const cands = modelCandidates(p, p.ean ? images.get(bareKey(p.ean)) : null);
      const out = cands.length ? await findInEprel(cands, p.brand.name, groupsOf.get(p.categoryId)!) : ({ status: "none", model: null } as MatchOutcome);
      r.checked++;
      if (out.status === "matched") {
        const s = await storeEprelMatch(p.id, out.raw); touched.push(p.id); r.matched++;
        if (r.samples.length < 8) r.samples.push(`${p.title.slice(0, 40)} → ${out.raw.modelIdentifier} · ${s.registrationNumber}`);
      } else if (out.status === "ambiguous") r.ambiguous++; else r.none++;
      await db.product.update({ where: { id: p.id }, data: { eprelStatus: out.status, eprelCheckedAt: new Date(), modelCode: out.model ?? cands[0] ?? null } });
    }
  } catch (e) {
    if (touched.length) await refreshDimStatus(touched);
    return { ok: false, error: (e as Error).message, ...r, remaining: await db.product.count({ where }) };
  }
  if (touched.length) await refreshDimStatus(touched);
  return { ok: true, ...r, remaining: await db.product.count({ where }) };
}

export async function eprelMatchStats() {
  const types = (await db.category.findMany({ where: { source: "softone", depth: 2, productCount: { gt: 0 } }, select: { id: true, name: true } })).filter((c) => eprelGroupsFor(c.name));
  const ids = types.map((t) => t.id);
  const [eligible, byStatus, dim] = await Promise.all([
    db.product.count({ where: { source: "softone", active: true, categoryId: { in: ids } } }),
    db.product.groupBy({ by: ["eprelStatus"], where: { source: "softone", active: true, categoryId: { in: ids } }, _count: { _all: true } }),
    db.product.groupBy({ by: ["dimStatus"], where: { source: "softone", dimStatus: { not: null } }, _count: { _all: true } }),
  ]);
  const st = (k: string | null) => byStatus.find((b) => b.eprelStatus === k)?._count._all ?? 0;
  return { hasKey: hasEprelKey(), types: types.length, eligible, matched: st("matched"), ambiguous: st("ambiguous"), none: st("none"), pending: st(null), dim: Object.fromEntries(dim.map((d) => [d.dimStatus!, d._count._all])) as Record<string, number> };
}
