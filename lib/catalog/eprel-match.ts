import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { searchProducts, hasEprelKey, EprelError, type EprelRaw } from "@/lib/eprel/client";
import { upsertFromRaw, linkProduct } from "@/lib/eprel/sync";
import { normalizeModel, customerLines, eprelDimsCm } from "@/lib/eprel/normalize";
import { bareKey } from "./image-files";
import { refreshDimStatus } from "./product-dimensions";
import { eprelGroupsFor } from "./energy-types";
export { eprelGroupsFor };

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

const looksLikeModel = (t: string) => t.length >= 5 && /[A-Z]/.test(t) && (t.match(/\d/g)?.length ?? 0) >= 2 && !/^\d+(GB|TB|KG|BTU|HZ|CM|MM|W|L|LT)$/.test(t);

/** Υποψήφια μοντέλα, το πιο αξιόπιστο πρώτο. Για κάθε ένα και η εκδοχή πριν από «.» ή «/» (κατάληξη αγοράς της LG, παραλλαγή χρώματος). */
export function modelCandidates(p: { sku: string; title: string }, imageModel?: string | null): string[] {
  const out: string[] = [];
  const add = (raw: string | null | undefined) => {
    const t = (raw ?? "").trim().toUpperCase(); if (!t) return;
    for (const v of [t, t.split(/[./]/)[0], t.split(/\s+/)[0]]) { const c = v.replace(/[^A-Z0-9\-/.+ ]/g, "").trim(); if (looksLikeModel(c.replace(/[\s\-/.]/g, "")) && !out.includes(c)) out.push(c); }
  };
  add(imageModel); add(p.sku);
  const toks = p.title.toUpperCase().split(/[\s,()]+/).filter(Boolean);
  for (const tok of toks) add(tok);
  // «FFWDD 1076258», «BDE 107436», «CSWS 596D/5-S»: σειρά με γράμματα και μετά αριθμός — το μοντέλο είναι και οι δύο λέξεις
  for (let i = 0; i + 1 < toks.length; i++) if (/^[A-Z]{2,8}$/.test(toks[i]) && /^\d{2,}/.test(toks[i + 1]) && !/^(LED|LCD|OLED|QLED|BTU|RPM|INCH|SMART|TV|HD|UHD|FHD)$/.test(toks[i])) { const pair = `${toks[i]} ${toks[i + 1]}`; if (!out.includes(pair)) out.push(pair); }
  return out.slice(0, 5);
}

const brandOk = (ours: string, theirs: string) => { const a = normalizeModel(ours), b = normalizeModel(theirs); return !!a && !!b && (a.includes(b) || b.includes(a) || a.slice(0, 4) === b.slice(0, 4)); };
const isModelish = (t: string) => t.length >= 5 && /\d/.test(t);

/** Όλες οι «λέξεις» που μας χαρακτηρίζουν: τίτλος, κωδικός είδους, μοντέλο φωτογραφίας — ολόκληρες και σπασμένες στα . / */
function ourTokens(p: { sku: string; title: string }, imageModel?: string | null): Set<string> {
  const out = new Set<string>();
  for (const tok of `${p.title} ${p.sku} ${imageModel ?? ""}`.toUpperCase().split(/[\s,()]+/)) {
    if (!tok) continue;
    out.add(normalizeModel(tok));
    const parts = tok.split(/[./]/).filter(Boolean);
    if (parts.length > 1) for (const part of parts) out.add(normalizeModel(part));
  }
  // «WDQA1014 EVJM» στον τίτλο μας, «WDQA1014EVJM» στο EPREL: και οι ενώσεις γειτονικών λέξεων
  const seq = `${p.title} ${imageModel ?? ""}`.toUpperCase().split(/[\s,()]+/).map(normalizeModel).filter(Boolean);
  for (let i = 0; i + 1 < seq.length; i++) if (/\d/.test(seq[i]) || /\d/.test(seq[i + 1])) out.add(seq[i] + seq[i + 1]);
  out.delete("");
  return out;
}

/**
 * Πόσο καλά ταιριάζει μια καταχώριση του EPREL. Τρεις μορφές «μοντέλου» υπάρχουν εκεί (μετρημένες στο πραγματικό EPREL):
 *  - σκέτο μοντέλο («D4R7009TSSB»), συχνά χωρίς ή με άλλη κατάληξη αγοράς («RT35CG5644S9» έναντι «…S9ES», «F4DV709H1E»)
 *  - μοντέλο + κωδικός PNC («RDB424E1AW 925992225», AEG / Electrolux / Zanussi) — ο PNC είναι ο κωδικός είδους μας
 *  - ολόκληρο εμπορικό όνομα με κενά («W84TE 72 X AQUA 2», Whirlpool / Indesit) — όπως γράφεται στον τίτλο μας
 * Κανόνας Α: κάθε λέξη του EPREL με ≥ 3 χαρακτήρες υπάρχει αυτούσια στις δικές μας, και μία τουλάχιστον μοιάζει με μοντέλο.
 * Κανόνας Β (μονολεκτικά): ίδιο, ή το ένα πρόθεμα του άλλου με ≥ 80 % του μήκους.
 */
function scoreHit(tokens: Set<string>, candidates: string[], theirs: string): { score: number; loose: number } | null {
  const parts = theirs.toUpperCase().split(/\s+/).map(normalizeModel).filter(Boolean);
  if (!parts.length) return null;
  const long = parts.filter((t) => t.length >= 3);
  if (long.length && long.every((t) => tokens.has(t)) && long.some(isModelish)) {
    const matched = parts.filter((t) => tokens.has(t));
    return { score: matched.join("").length, loose: parts.join("").length - matched.join("").length };
  }
  const whole = parts.join("");
  let best: { score: number; loose: number } | null = null;
  for (const c of candidates.map(normalizeModel)) {
    if (!c) continue;
    const [sh, lg] = c.length <= whole.length ? [c, whole] : [whole, c];
    if (lg.startsWith(sh) && sh.length / lg.length >= 0.8 && (!best || sh.length > best.score)) best = { score: sh.length, loose: lg.length - sh.length };
  }
  return best;
}

/**
 * Κλιματιστικά: το EPREL καταχωρεί το ΖΕΥΓΟΣ, «εσωτερική/εξωτερική» («N3VI-24WFI/N3VO-24», «EZ-09RD6-I / EZ-09RD6-O»,
 * «GUD50W1/NhA-S+GUD50P1/A-S»), και δίνει χωριστά `indoorModelIdentifiers` και `outdoorModelIdentifier`. Το ERP έχει είδος
 * την ΕΣΩΤΕΡΙΚΗ μονάδα («INVENTOR N3VI-24WFI … ΕΣΩΤΕΡΙΚΟ»). Οι γενικοί κανόνες απορρίπτουν το ζεύγος (το μοντέλο μας είναι
 * το 60 % του αναγνωριστικού), οπότε εδώ: ταύτιση όταν μία μονάδα του ζεύγους υπάρχει αυτούσια στις λέξεις μας.
 * Η ίδια εσωτερική δηλώνεται και με άλλες εξωτερικές (multi-split, άλλη σειρά): προτιμάται το απλό ζεύγος 1+1 και η
 * εξωτερική της ίδιας σειράς (κοινό πρόθεμα, ή το όνομά της στο μοντέλο της φωτογραφίας μας: «N3VI N3VO 24WFI»).
 */
const AC_GROUP = "airconditioners";
const acUnits = (x: unknown) => String(x ?? "").split(/\s*[/+,]\s*|\s+-\s+/).map(normalizeModel).filter((u) => u.length >= 5 && /\d/.test(u));
const commonPrefix = (a: string, b: string) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
/** Ίδια μονάδα με άλλη κατάληξη αγοράς: «AS68TEMHRA» ↔ «AS68TEMHRA-C», «…24WFRB» ↔ «…24WFR». */
const nearUnit = (u: string, t: string) => { const [sh, lg] = u.length <= t.length ? [u, t] : [t, u]; return sh.length >= 8 && lg.startsWith(sh) && sh.length / lg.length >= 0.85; };
const acPairKey = (h: EprelRaw) => { const raw = h as unknown as { indoorModelIdentifiers?: unknown; outdoorModelIdentifier?: unknown }; return [...(Array.isArray(raw.indoorModelIdentifiers) ? raw.indoorModelIdentifiers : []).flatMap(acUnits), ...acUnits(raw.outdoorModelIdentifier)].sort().join("|") || normalizeModel(String(h.modelIdentifier ?? "")); };
function scoreAc(tokens: Set<string>, h: EprelRaw): { score: number; loose: number; strong: boolean } | null {
  const raw = h as unknown as { indoorModelIdentifiers?: unknown; outdoorModelIdentifier?: unknown; numberIndoorUnits?: unknown };
  const id = String(h.modelIdentifier ?? "");
  const indoorAll = (Array.isArray(raw.indoorModelIdentifiers) ? raw.indoorModelIdentifiers : []).flatMap(acUnits), indoor = [...new Set(indoorAll)];
  const outdoor = acUnits(raw.outdoorModelIdentifier);
  const units = [...new Set([...indoor, ...outdoor, ...acUnits(id)])];
  const toks = [...tokens];
  const exact = units.filter((u) => tokens.has(u)), near = units.filter((u) => !tokens.has(u) && toks.some((t) => nearUnit(u, t)));
  const hit = [...exact, ...near];
  if (!hit.length) return null;
  const multi = Number(raw.numberIndoorUnits ?? 1) > 1 || indoorAll.length > 1 || /\d\s*[*x×]\s*[A-Z]/i.test(id);
  // η άλλη μονάδα του ζεύγους (η εξωτερική, όταν βρήκαμε την εσωτερική): γραμμένη στις λέξεις μας, αλλιώς πόσο μοιάζει με αυτήν που βρήκαμε
  const declared = [...indoor, ...outdoor].filter((u) => !hit.includes(u));
  const other = declared.length ? declared : units.filter((u) => !hit.includes(u));
  const named = other.some((u) => toks.some((t) => t.startsWith(u) || (t.length >= 5 && u.startsWith(t))));
  const kin = Math.max(0, ...other.map((u) => commonPrefix(u, hit[0])));
  return { score: exact.join("").length + near.reduce((n, u) => n + u.length - 2, 0) + (named ? 20 : 0), loose: (multi ? 100 : 0) + (named ? 0 : 10 - Math.min(10, kin)), strong: hit.some((u) => u.length >= 8) };
}

export type MatchOutcome = { status: "matched"; raw: EprelRaw; model: string } | { status: "ambiguous" | "none"; model: string | null; candidates?: string[] };

/** Όροι αναζήτησης για έναν υποψήφιο: ολόκληρη η πρώτη του λέξη, και κοντύτερα προθέματα (το EPREL συχνά δεν έχει την κατάληξη αγοράς). */
const searchTerms = (model: string) => {
  // μόνο γράμματα, ψηφία, παύλα και κενό: «/», «.» και άλλα σύμβολα τα κόβει το τείχος προστασίας του EPREL με 403
  const clean = (x: string) => x.split(/[./]/)[0].replace(/[^A-Z0-9-]/g, "");
  const [w1, w2] = model.split(/\s+/);
  if (w2 && /^[A-Z]{2,8}$/.test(w1)) { const n = clean(w2); return n.length >= 2 ? [`${w1} ${n.slice(0, 3)}`, `${w1}${n.slice(0, 3)}`] : []; } // «CSWS 596*» και «CSWS596*» — γράφεται και με τους δύο τρόπους
  const t = clean(w1);
  return [...new Set([t, t.length >= 9 ? t.slice(0, -2) : "", t.length >= 11 ? t.slice(0, -4) : ""].filter((x) => x.length >= 5))];
};

/** Το EPREL απαντά 403 και για κακό κλειδί και για όρο που δεν του αρέσει. Ξεχωρίζουμε τα δύο με μία γνωστή, αθώα κλήση. */
async function keyStillWorks() { try { await searchProducts("washingmachines2019", { limit: 1 }); return true; } catch { return false; } }

/** Ψάχνει ανά (υποψήφιο, ομάδα, όρο) μέχρι να βρεθεί αποδεκτή καταχώριση — συνήθως 1–3 κλήσεις ανά προϊόν. */
export async function findInEprel(p: { sku: string; title: string }, imageModel: string | null | undefined, brand: string, groups: string[]): Promise<MatchOutcome> {
  const candidates = modelCandidates(p, imageModel), tokens = ourTokens(p, imageModel);
  const tried = new Set<string>(); let calls = 0;
  for (const model of candidates) for (const term of searchTerms(model)) for (const urlCode of groups) {
    const k = `${urlCode}|${term}`; if (tried.has(k) || calls >= 10) continue; tried.add(k); calls++;
    const r = await searchProducts(urlCode, { limit: 50, filters: { modelIdentifier: `${term}*` } }).catch(async (e) => {
      if (!(e instanceof EprelError)) return null;
      if (e.code === "NO_KEY" || e.status === 401) throw e;
      if (e.status === 403) { await sleep(2500); if (!(await keyStillWorks())) throw e; } // αλλιώς: ο όρος απορρίφθηκε, πάμε στον επόμενο
      return null;
    });
    await sleep(PAUSE_MS);
    // κλιματιστικά: ζεύγος εσωτερικής/εξωτερικής· η μάρκα του EPREL είναι συχνά ο εισαγωγέας (Nobu, Winstar), οπότε μια μακριά αυτούσια ταύτιση αρκεί
    const scored = (urlCode === AC_GROUP
      ? (r?.hits ?? []).map((h) => ({ h, s: scoreAc(tokens, h) })).filter((x) => x.s && (x.s.strong || brandOk(brand, String(x.h.supplierOrTrademark ?? ""))))
      : (r?.hits ?? []).filter((h) => brandOk(brand, String(h.supplierOrTrademark ?? ""))).map((h) => ({ h, s: scoreHit(tokens, candidates, String(h.modelIdentifier ?? "")) })).filter((x) => x.s)) as { h: EprelRaw; s: { score: number; loose: number } }[];
    if (!scored.length) continue;
    scored.sort((a, b) => b.s.score - a.s.score || a.s.loose - b.s.loose);
    const top = scored.filter((x) => x.s.score === scored[0].s.score && x.s.loose === scored[0].s.loose);
    // κλιματιστικά: το ίδιο ζεύγος γράφεται «A/B», «A / B», «A-SET» — το κλειδί είναι οι μονάδες, όχι η γραφή
    const models = [...new Set(top.map((x) => (urlCode === AC_GROUP ? acPairKey(x.h) : normalizeModel(String(x.h.modelIdentifier)))))];
    if (models.length > 1) return { status: "ambiguous", model, candidates: top.slice(0, 6).map((x) => String(x.h.modelIdentifier)) };
    // πολλές καταχωρίσεις του ίδιου μοντέλου: η τελευταία έκδοση, η πιο πρόσφατα δημοσιευμένη
    const best = top.map((x) => x.h).sort((a, b) => Number(b.lastVersion !== false) - Number(a.lastVersion !== false) || Number(b.firstPublicationDateTS ?? 0) - Number(a.firstPublicationDateTS ?? 0))[0];
    return { status: "matched", raw: best, model };
  }
  return { status: "none", model: candidates[0] ?? null };
}

/** Αποθήκευση όλων όσων δίνει το EPREL για ένα προϊόν μας. */
export async function storeEprelMatch(productId: string, raw: EprelRaw) {
  const { saved } = await upsertFromRaw(raw);
  await linkProduct(productId, saved.registrationNumber);
  await db.energyLabel.update({ where: { productId }, data: { source: "eprel" } });
  const lines = customerLines(raw); // έως 8 γραμμές για τον πελάτη· τα υπόλοιπα 20–30 πεδία μένουν στο EprelProduct.data
  await db.$transaction([
    db.spec.deleteMany({ where: { productId, source: "eprel" } }),
    db.spec.createMany({ data: lines.map((l, i) => ({ productId, groupName: "Από την ενεργειακή ετικέτα", key: l.label, value: l.value, sortNo: 1000 + i, source: "eprel" })) }),
  ]);
  const dims = eprelDimsCm(raw);
  if (dims) {
    const data = { kind: "product", ...dims, rawKey: `EPREL ${saved.registrationNumber}`, rawValue: `${raw.dimensionWidth} × ${raw.dimensionHeight} × ${raw.dimensionDepth} (Π×Υ×Β, όπως δηλώθηκαν)`, warning: null };
    await db.productDimension.upsert({ where: { productId_source: { productId, source: "eprel" } }, create: { productId, source: "eprel", ...data }, update: data });
  }
  return { registrationNumber: saved.registrationNumber, specs: lines.length, hasDims: !!dims };
}

/** Ξαναγράφει ό,τι αποθηκεύουμε από το EPREL για τα ήδη δεμένα προϊόντα, από τα δεδομένα που έχουμε — χωρίς καμία κλήση. Για όταν αλλάζει η λογική αποθήκευσης. */
export async function restoreFromSaved() {
  const labels = await db.energyLabel.findMany({ where: { eprelRegistrationNumber: { not: null }, product: { source: "softone" } }, select: { productId: true, eprel: { select: { data: true } } } });
  for (const l of labels) if (l.eprel?.data) await storeEprelMatch(l.productId, l.eprel.data as unknown as EprelRaw);
  return { restored: labels.length, status: await refreshDimStatus(labels.map((l) => l.productId)) };
}

export interface EprelBatchResult { ok: boolean; error?: string; checked: number; matched: number; ambiguous: number; none: number; remaining: number; samples: string[] }

/**
 * Μία παρτίδα: τα επόμενα `limit` προϊόντα που δεν έχουν ελεγχθεί. Συνεχίζει από εκεί που
 * σταμάτησε (`eprelStatus`), άρα τρέχει όσες φορές χρειαστεί. `retry`: ξανά όσα βγήκαν `none` ή `ambiguous` (μετά από νέο κανόνα).
 * `group`: μόνο οι τύποι μιας ομάδας του EPREL (π.χ. `airconditioners`).
 */
export async function matchEprelBatch(opts: { limit?: number; retry?: boolean; concurrency?: number; group?: string; before?: Date } = {}): Promise<EprelBatchResult> {
  const empty = { checked: 0, matched: 0, ambiguous: 0, none: 0, remaining: 0, samples: [] as string[] };
  if (!hasEprelKey()) return { ok: false, error: "Λείπει το EPREL_API_KEY στο .env — χωρίς αυτό το EPREL δεν απαντά.", ...empty };
  const types = (await db.category.findMany({ where: { source: "softone", depth: 2, productCount: { gt: 0 } }, select: { id: true, name: true } })).map((c) => ({ ...c, groups: eprelGroupsFor(c.name) })).filter((c) => c.groups && (!opts.group || c.groups.includes(opts.group)));
  const groupsOf = new Map(types.map((t) => [t.id, t.groups!]));
  const where: Prisma.ProductWhereInput = { source: "softone", active: true, categoryId: { in: [...groupsOf.keys()] }, eprelStatus: opts.retry ? { in: ["none", "ambiguous"] } : null,
    // επανάληψη: μόνο όσα ΔΕΝ ξαναελέγχθηκαν σε αυτό το τρέξιμο — αλλιώς τα ίδια «none» γυρίζουν στην κορυφή για πάντα
    ...(opts.retry && opts.before ? { OR: [{ eprelCheckedAt: null }, { eprelCheckedAt: { lt: opts.before } }] } : {}) };
  const products = await db.product.findMany({ where, orderBy: { updatedAt: "desc" }, take: Math.min(500, opts.limit ?? 100), select: { id: true, sku: true, title: true, ean: true, categoryId: true, brand: { select: { name: true } } } });
  const images = new Map((await db.imageImport.findMany({ where: { seq: 1, key: { in: products.flatMap((p) => (p.ean ? [p.ean, `0${p.ean}`, `00${p.ean}`] : [])) } }, select: { key: true, model: true } })).map((i) => [bareKey(i.key), i.model]));
  const r = { ...empty }; const touched: string[] = [];
  try {
    // λίγες παράλληλες αναζητήσεις: το EPREL αντέχει, αλλά δεν είναι δικός μας server
    let next = 0; let failure: unknown = null;
    const worker = async () => {
      while (!failure) {
        const p = products[next++]; if (!p) return;
        try {
          const imageModel = p.ean ? images.get(bareKey(p.ean)) : null;
          const cands = modelCandidates(p, imageModel);
          const out = cands.length ? await findInEprel(p, imageModel, p.brand.name, groupsOf.get(p.categoryId)!) : ({ status: "none", model: null } as MatchOutcome);
          r.checked++;
          if (out.status === "matched") {
            const s = await storeEprelMatch(p.id, out.raw); touched.push(p.id); r.matched++;
            if (r.samples.length < 8) r.samples.push(`${p.title.slice(0, 40)} → ${out.raw.modelIdentifier} · ${s.registrationNumber}`);
          } else if (out.status === "ambiguous") r.ambiguous++; else r.none++;
          await db.product.update({ where: { id: p.id }, data: { eprelStatus: out.status, eprelCheckedAt: new Date(), modelCode: out.model ?? cands[0] ?? null } });
        } catch (e) { failure = e; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, Math.max(1, opts.concurrency ?? 1)) }, worker));
    if (failure) throw failure;
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
