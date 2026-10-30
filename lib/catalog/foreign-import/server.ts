import "server-only";
import { DEFAULT_POLICY, policyPrice, splitByPolicy, type UpdatePolicy } from "@/lib/catalog/xml-import/policy-core";
import { db } from "@/lib/db";
import { planImport, applyImport } from "@/lib/catalog/supplier-import";
import { planMedia, applyMedia, type MediaRow } from "@/lib/catalog/supplier-media";
import { loadGroups, groupOfCategory, FIELDS, type FieldKey, type ParsedRow } from "@/lib/catalog/supplier-sheet";
import { itemWriteEnabled, writeWebPrice, webPriceWriteEnabled } from "@/lib/softone/item-write";
import { syncItem } from "@/lib/softone/catalog";
import { projectItem } from "@/lib/softone/project";
import { OPEN } from "@/lib/catalog/foreign-import/pending-core";
import { parseMoney, pickRule, type Rounding } from "@/lib/catalog/pricing/markup";
import { toRows, resolveMatches, buildMatchIndex, normEan, eanVariants, type ForeignRow, type MappingConfig } from "@/lib/catalog/foreign-import/core";
import { rowStatus, newDuplicates, rekeySpecs, ruleLabel, planPrice, mostCommon, matchChanged, sameItemRows, chunks, sectionTitle, namesDiffer, openDuplicates, SECTION_TITLE, PRICE_OFF_NOTE, type ForeignPlanRow, type RowStatus } from "@/lib/catalog/foreign-import/plan-core";
import { UserError } from "@/lib/catalog/foreign-import/core";
import { configIds, type RecentJob } from "@/lib/catalog/foreign-import/ui-core";

export type { ForeignPlanRow, RowStatus } from "@/lib/catalog/foreign-import/plan-core";

/**
 * Εισαγωγή από ξένο Excel — σχέδιο και εκτέλεση. Το `planForeign` βγάζει από τον αντιστοιχισμένο πίνακα μια κατάσταση ανά
 * γραμμή και την κρατά ως ImportJob (πρόχειρο). Το `applyForeign` ξαναϋπολογίζει το σχέδιο των γραμμών με φρέσκα δεδομένα
 * (δεν εμπιστεύεται το αποθηκευμένο) και εκτελεί: υπάρχοντα είδη μέσω της μηχανής του template σε «μόνο κενά», φωτογραφίες
 * μέσω της βιβλιοθήκης, τιμή web μόνο αν λείπει· νέα είδη → PendingItem για έγκριση. Με κλειστή εγγραφή στο SoftOne τα
 * στοιχεία του ERP μένουν «σε αναμονή» και δεν γράφεται τίποτα (ούτε στο κατάστημα)· οι φωτογραφίες περνούν κανονικά.
 */
/** writeOn / priceOn = ο διακόπτης του SoftOne και η εγγραφή τιμής web (S1_WEB_PRICE_WRITE) τη στιγμή της προεπισκόπησης (ο χρήστης ενέκρινε αυτό που είδε) */
/** Τι επιτρέπεται να αλλάξει σε υπάρχοντα είδη και πώς βγαίνει η τιμή (XML προμηθευτές)· χωρίς αυτό = «μόνο κενά» και κόστος × markup, όπως στο Excel. */
export type EngineOpts = { policy: UpdatePolicy; priceMode: "cost" | "retail" };
const DEFAULT_OPTS: EngineOpts = { policy: DEFAULT_POLICY, priceMode: "cost" };
type Stored = { foreign: ForeignRow[]; plan: ForeignPlanRow[]; headerRow: number; config: MappingConfig; writeOn?: boolean; priceOn?: boolean; results?: Record<number, string>; opts?: EngineOpts };
/** `parsed` = πεδία «μόνο κενά», `parsedOver` = πεδία προς αντικατάσταση (ίδια γραμμή, δύο περάσματα της μηχανής) */
type Ctx = { row: ForeignRow; plan: ForeignPlanRow; mtrl: number | null; groupS1Id: number | null; specs: Record<string, string>; parsed?: ParsedRow; parsedOver?: ParsedRow; media?: MediaRow };

/**
 * Τα id που αναφέρει η αντιστοίχιση πρέπει να υπάρχουν ακόμη — αλλιώς θα κατέληγαν σε PendingItem με άκυρο id και η
 * έγκριση θα έσκαγε αργότερα, χωρίς να φταίει η γραμμή. Ελέγχεται πριν από οτιδήποτε άλλο, σε κάθε αποθήκευση.
 */
export async function assertConfigIds(config: MappingConfig): Promise<void> {
  const ids = configIds(config);
  const [nb, nc, nu, nm] = await Promise.all([
    ids.brands.length ? db.brand.count({ where: { id: { in: ids.brands } } }) : 0,
    ids.categories.length ? db.category.count({ where: { id: { in: ids.categories } } }) : 0,
    ids.units.length ? db.unit.count({ where: { id: { in: ids.units } } }) : 0,
    ids.marks.length ? db.itemMark.count({ where: { id: { in: ids.marks } } }) : 0,
  ]);
  if (nb !== ids.brands.length || nc !== ids.categories.length) throw new UserError("Κάποια μάρκα ή κατηγορία της αντιστοίχισης δεν υπάρχει πια — ξαναδιάλεξέ τη.");
  if (nu !== ids.units.length) throw new UserError("Κάποια μονάδα μέτρησης της αντιστοίχισης δεν υπάρχει πια — ξαναδιάλεξέ τη.");
  if (nm !== ids.marks.length) throw new UserError("Κάποια εμπορική σήμανση της αντιστοίχισης δεν υπάρχει πια — ξαναδιάλεξέ τη.");
}

const SHEET = "Εισαγωγή";
const keyOf = (rowNo: number) => `${SHEET}#${rowNo}`;
const LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.header])) as Record<FieldKey, string>;
const ROUNDING = new Set<Rounding>(["none", "int", "90", "99"]);
const short = (s: string) => (s.length > 70 ? `${s.slice(0, 67)}…` : s);
const mediaCount = (r: ForeignRow) => r.media.image.length + r.media.banner.length + r.media.video.length;
// Λίστες `in` σε κομμάτια: ένα αρχείο έχει έως 10.000 γραμμές (×2 κωδικοί), το όριο παραμέτρων ανά ερώτημα είναι 32.767
const CHUNK = 5000;
async function inChunks<T, R>(values: T[], fn: (part: T[]) => Promise<R[]>): Promise<R[]> {
  const out: R[] = [];
  for (const part of chunks(values, CHUNK)) out.push(...(await fn(part)));
  return out;
}

/**
 * Το σχέδιο με φρέσκα δεδομένα (καμία εγγραφή). Με `only` υπολογίζονται μόνο αυτές οι γραμμές (η βάση δουλεύει ανάλογα
 * με αυτές, όχι με όλο το αρχείο)· οι έλεγχοι ανάμεσα σε γραμμές (ίδιο είδος, διπλά νέα) γίνονται σε ΟΛΟ το αρχείο, με το
 * αποθηκευμένο σχέδιο για τις γραμμές που δεν ξαναϋπολογίζονται.
 */
async function compute(all: ForeignRow[], writeOn: boolean, priceOn: boolean, only?: { rowNos: Set<number>; stored: ForeignPlanRow[] }, opts: EngineOpts = DEFAULT_OPTS): Promise<Ctx[]> {
  const { policy } = opts;
  const foreign = only ? all.filter((r) => only.rowNos.has(r.rowNo)) : all;
  // ---- αντιστοίχιση με το SoftOne ----
  const t = (s?: string) => (s ?? "").trim();
  const mtrls = foreign.map((r) => Number(t(r.fields.mtrl))).filter((n) => Number.isInteger(n) && n > 0);
  const codes = [...new Set(foreign.flatMap((r) => [t(r.fields.code), t(r.fields.factoryCode)]).filter(Boolean))];
  // Όλες οι μορφές που μπορεί να έχει το ίδιο EAN στο SoftOne (8/12/13/14 ψηφία) — το ευρετήριο τα ενώνει σε GTIN-14
  const eans = [...new Set(foreign.flatMap((r) => eanVariants(r.fields.barcode)))];
  const factory = [...new Set(foreign.map((r) => t(r.fields.factoryCode)).filter(Boolean))];
  const select = { mtrl: true, code: true, name: true, barcode: true, factoryCode: true, manufacturerS1Id: true, vatS1Id: true, specGroupS1Id: true, eshopPrice: true } as const;
  const find = (where: object) => db.s1Item.findMany({ where: { missing: false, ...where }, select, orderBy: { mtrl: "asc" } });
  const [found, brands, rules, vats] = await Promise.all([
    Promise.all([
      inChunks(mtrls, (p) => find({ mtrl: { in: p } })),
      inChunks(codes, (p) => find({ code: { in: p, mode: "insensitive" } })),
      inChunks(eans, (p) => find({ barcode: { in: p } })),
      inChunks(factory, (p) => find({ factoryCode: { in: p, mode: "insensitive" } })),
    ]),
    db.brand.findMany({ select: { id: true, name: true, s1Id: true } }),
    db.markupRule.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } }),
    db.vatRate.findMany({ where: { s1Id: { not: null } }, select: { s1Id: true, percent: true } }),
  ]);
  const brandOfS1 = new Map(brands.filter((b) => b.s1Id).map((b) => [b.s1Id!, b.id]));
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const vatOf = new Map(vats.map((v) => [v.s1Id!, Number(v.percent)]));
  const items = [...new Map(found.flat().map((i) => [i.mtrl, i])).values()].sort((a, b) => a.mtrl - b.mtrl);
  // Κλειδί (κωδικός / EAN / κωδικός κατασκευαστή) σε 2+ είδη → διφορούμενο: η γραμμή που το χτυπά βγαίνει πρόβλημα
  const index = buildMatchIndex(items.map((i) => ({ ...i, brandId: i.manufacturerS1Id != null ? brandOfS1.get(String(i.manufacturerS1Id)) ?? null : null })));
  const matches = resolveMatches(foreign, index);
  const mtrlOf = new Map(matches.map((m) => [m.rowNo, m.mtrl]));
  const itemOf = new Map(items.map((i) => [i.mtrl, i]));
  // Έλεγχοι ανάμεσα σε γραμμές σε όλο το αρχείο: φρέσκια αντιστοίχιση για όσες ξαναϋπολογίζονται, αποθηκευμένη για τις άλλες
  const allMtrl = new Map<number, number | null>(all.map((r) => [r.rowNo, null]));
  for (const p of only?.stored ?? []) if (allMtrl.has(p.rowNo)) allMtrl.set(p.rowNo, p.mtrl ?? null);
  for (const [n, m] of mtrlOf) allMtrl.set(n, m);
  const dups = newDuplicates(all, allMtrl), same = sameItemRows(allMtrl);

  // ---- προϊόντα του καταστήματος, κατηγορίες, ομάδες χαρακτηριστικών ----
  const matched = [...new Set(matches.map((m) => m.mtrl).filter((x): x is number => x != null))];
  const newCats = [...new Set(foreign.filter((r) => mtrlOf.get(r.rowNo) == null && r.categoryId).map((r) => r.categoryId!))];
  const ruleCats = rules.map((r) => r.categoryId).filter((x): x is string => !!x);
  const [products, cats] = await Promise.all([
    inChunks(matched.map(String), (p) => db.product.findMany({ where: { erpCode: { in: p } }, select: { id: true, erpCode: true, brandId: true, categoryId: true } })),
    db.category.findMany({ where: { id: { in: [...new Set([...newCats, ...ruleCats])] } }, select: { id: true, name: true, erpCode: true } }),
  ]);
  const productOf = new Map(products.map((p) => [p.erpCode, p]));
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  // Ομάδα για νέο είδος: από την κατηγορία του site (s1:g:…), αλλιώς η συχνότερη ομάδα των ειδών που είναι ήδη στην κατηγορία
  const groupOfCat = new Map<string, number | null>();
  const viaItems = cats.filter((c) => newCats.includes(c.id) && groupOfCategory(c.erpCode) == null).map((c) => c.id);
  for (const c of cats) if (newCats.includes(c.id)) groupOfCat.set(c.id, groupOfCategory(c.erpCode));
  if (viaItems.length) {
    const ps = await db.product.findMany({ where: { categoryId: { in: viaItems } }, select: { erpCode: true, categoryId: true } });
    const nums = ps.filter((p) => /^\d+$/.test(p.erpCode));
    const sg = await inChunks(nums.map((p) => Number(p.erpCode)), (p) => db.s1Item.findMany({ where: { mtrl: { in: p }, missing: false }, select: { mtrl: true, specGroupS1Id: true } }));
    const sgOf = new Map(sg.map((s) => [String(s.mtrl), s.specGroupS1Id]));
    for (const c of viaItems) groupOfCat.set(c, mostCommon(nums.filter((p) => p.categoryId === c).map((p) => sgOf.get(p.erpCode))));
  }
  const groupIds = new Set<number>();
  for (const m of matches) { const g = m.mtrl != null ? itemOf.get(m.mtrl)?.specGroupS1Id : null; if (g != null) groupIds.add(g); }
  for (const g of groupOfCat.values()) if (g != null) groupIds.add(g);
  const groups = await loadGroups([...groupIds]);
  // ΦΠΑ για νέα είδη: ο συχνότερος συντελεστής των ειδών της ίδιας ομάδας (όπως το createInSoftone παίρνει ΦΠΑ από αδελφό είδος)
  const newGroups = [...new Set([...groupOfCat.values()].filter((g): g is number => g != null))];
  const vatPairs = newGroups.length ? await db.s1Item.groupBy({ by: ["specGroupS1Id", "vatS1Id"], where: { specGroupS1Id: { in: newGroups }, missing: false }, _count: { _all: true } }) : [];
  const vatOfGroup = (g: number | null) => {
    const best = vatPairs.filter((v) => v.specGroupS1Id === g && v.vatS1Id != null).sort((a, b) => b._count._all - a._count._all)[0];
    return (best && vatOf.get(String(best.vatS1Id))) ?? 24;
  };
  const priceOf = (r: ForeignRow, brandId: string | null, categoryId: string | null, vat: number) => {
    const rule = pickRule(rules, brandId, categoryId);
    return policyPrice({
      mode: opts.priceMode, vatIncluded: policy.vatIncluded,
      cost: r.cost, rrp: r.rrp, vat,
      rule: rule ? { percent: rule.percent, rounding: ROUNDING.has(rule.rounding as Rounding) ? (rule.rounding as Rounding) : "none" } : null,
      label: rule ? ruleLabel(rule, { brand: rule.brandId ? brandName.get(rule.brandId) : undefined, category: rule.categoryId ? catName.get(rule.categoryId) : undefined }) : "",
    });
  };

  // ---- ανά γραμμή ----
  const ctx: Ctx[] = foreign.map((row, i) => {
    const m = matches[i];
    const it = m.mtrl != null ? itemOf.get(m.mtrl) : undefined;
    const code = t(row.fields.code) || t(row.fields.factoryCode);
    const plan: ForeignPlanRow = { rowNo: row.rowNo, title: it?.name ?? (t(row.fields.name) || code), status: "unchanged", mtrl: m.mtrl ?? undefined, code: it?.code ?? (code || undefined), changes: [], media: 0, warnings: [] };
    if (it) {
      // Λάθος ταίριασμα πρέπει να φαίνεται: το όνομα του αρχείου δίπλα στο δικό μας και με ποιο κλειδί βρέθηκε
      if (t(row.fields.name)) plan.fileName = t(row.fields.name);
      if (m.matchedBy) plan.matchedBy = m.matchedBy;
      if (plan.fileName && namesDiffer(it.name, plan.fileName)) plan.warnings.push("Τα ονόματα δεν μοιάζουν — έλεγξε ότι είναι το σωστό είδος.");
    }
    let problem = m.problem ?? (m.mtrl == null ? dups.get(row.rowNo) : same.get(row.rowNo)) ?? null;
    let groupS1Id: number | null;
    if (it) {
      groupS1Id = it.specGroupS1Id;
      if (groupS1Id == null) problem ??= "Το είδος δεν έχει ομάδα χαρακτηριστικών στο SoftOne.";
      else if (!groups.has(groupS1Id)) problem ??= "Η ομάδα χαρακτηριστικών του είδους δεν υπάρχει πια στο SoftOne.";
    } else {
      // Τίτλος ενότητας του τιμοκαταλόγου, όχι είδος: πρόβλημα, ώστε να μη γίνει ποτέ PendingItem (ούτε στην εκτέλεση)
      if (sectionTitle(row)) problem ??= SECTION_TITLE;
      groupS1Id = row.categoryId ? groupOfCat.get(row.categoryId) ?? null : null;
      if (groupS1Id != null && !groups.has(groupS1Id)) groupS1Id = null;
      if (groupS1Id == null) plan.warnings.push(row.categoryId ? "Δεν βρέθηκε ομάδα χαρακτηριστικών για την κατηγορία — θα οριστεί στην έγκριση." : "Χωρίς κατηγορία site — η ομάδα χαρακτηριστικών θα οριστεί στην έγκριση.");
      if (!t(row.fields.name)) plan.warnings.push("Λείπει το όνομα.");
      if (!code) plan.warnings.push("Χωρίς κωδικό είδους ή κωδικό κατασκευαστή.");
    }
    const g = groupS1Id != null ? groups.get(groupS1Id) : undefined;
    const rk = rekeySpecs(row.specs, g ? g.specs.map((s) => s.name) : null);
    plan.warnings.push(...rk.warnings);
    const c: Ctx = { row, plan, mtrl: m.mtrl, groupS1Id, specs: rk.specs };
    if (problem) { plan.problem = problem; return c; }
    if (it) {
      const fields: Partial<Record<FieldKey, string>> = { ...row.fields, mtrl: String(it.mtrl) };
      const e = fields.barcode ? normEan(fields.barcode) : null;
      if (e) fields.barcode = e;
      if (t(fields.code).toLowerCase() === it.code.trim().toLowerCase()) delete fields.code;
      const part = splitByPolicy(fields, rk.specs, policy);
      if (part.blank) c.parsed = { sheet: SHEET, rowNo: row.rowNo, groupS1Id: groupS1Id!, fields: part.blank.fields, specs: part.blank.specs };
      if (part.over) c.parsedOver = { sheet: SHEET, rowNo: row.rowNo, groupS1Id: groupS1Id!, fields: part.over.fields, specs: part.over.specs };
      if (mediaCount(row)) c.media = { sheet: SHEET, rowNo: row.rowNo, groupS1Id, ids: { mtrl: String(it.mtrl) }, image: row.media.image, banner: row.media.banner, video: row.media.video };
      const hasPrice = it.eshopPrice != null && it.eshopPrice > 0;
      if (policy.price === "overwrite" || (policy.price === "blank" && !hasPrice)) {
        const p = productOf.get(String(it.mtrl));
        const pr = priceOf(row, row.brandId ?? p?.brandId ?? null, row.categoryId ?? p?.categoryId ?? null, (it.vatS1Id != null ? vatOf.get(String(it.vatS1Id)) : undefined) ?? 24);
        if (pr.price) plan.price = pr.price;
        if (pr.warning) plan.warnings.push(pr.warning);
      }
    } else {
      for (const k of Object.keys(row.fields) as FieldKey[]) { const v = t(row.fields[k]); if (v && k !== "mtrl") plan.changes.push({ label: LABEL[k], from: "—", to: short(v) }); }
      for (const [label, v] of Object.entries(rk.specs)) plan.changes.push({ label, from: "—", to: short(v) });
      plan.media = mediaCount(row);
      const pr = priceOf(row, row.brandId, row.categoryId, vatOfGroup(groupS1Id));
      if (pr.price) plan.price = pr.price;
      if (pr.warning) plan.warnings.push(pr.warning);
    }
    return c;
  });

  // ---- υπάρχοντα: η μηχανή του template — «μόνο κενά» και, όπου το επέτρεψε ο χρήστης, «αντικατάσταση» ----
  for (const over of [false, true]) {
    const pick = (c: Ctx) => (over ? c.parsedOver : c.parsed);
    const parsed = ctx.filter((c) => pick(c)).map((c) => pick(c)!);
    if (!parsed.length) continue;
    const plan = await planImport({ meta: null, rows: parsed, warnings: [], sheets: [] }, { toSoftone: true, activate: false, onlyBlank: !over });
    const byRow = new Map(plan.rows.map((r) => [r.rowNo, r]));
    for (const c of ctx) {
      const r = pick(c) ? byRow.get(c.row.rowNo) : undefined;
      if (!r) continue;
      c.plan.changes = [...c.plan.changes, ...r.changes.map((x) => (over ? { ...x, label: `${x.label} (αντικατάσταση)` } : x))]; c.plan.warnings.push(...r.warnings);
      if (r.action === "error") { c.plan.problem = r.errors.join(" ") || "Σφάλμα στη γραμμή."; c.parsed = undefined; c.parsedOver = undefined; c.media = undefined; c.plan.price = undefined; }
    }
  }
  const media = ctx.filter((c) => c.media).map((c) => c.media!);
  if (media.length) {
    const mp = await planMedia(media, [], null, false);
    const byRow = new Map(mp.rows.map((r) => [r.rowNo, r]));
    for (const c of ctx) {
      const r = c.media ? byRow.get(c.row.rowNo) : undefined;
      if (!r) continue;
      c.plan.warnings.push(...r.warnings);
      if (r.action === "error") { c.plan.warnings.push("Το είδος δεν έχει ακόμη προϊόν στο κατάστημα — τα πολυμέσα παραλείπονται."); c.media = undefined; }
      else { c.plan.media = r.changes.length; if (!r.changes.length) c.media = undefined; }
    }
  }
  // Τιμή με κλειστή εγγραφή τιμής web: φαίνεται με σημείωση, αλλά δεν μετρά ως αλλαγή (δεν θα γραφτεί)
  for (const c of ctx) if (c.plan.price && !priceOn && !c.plan.problem) c.plan.warnings.unshift(PRICE_OFF_NOTE);
  for (const c of ctx) c.plan.status = rowStatus({ problem: !!c.plan.problem, mtrl: c.mtrl, changes: c.plan.changes.length, price: !!c.plan.price && priceOn, photos: c.plan.media, writeOn });
  return ctx;
}

const countStatus = (rows: ForeignPlanRow[]) => {
  const counts: Record<RowStatus, number> = { update: 0, unchanged: 0, new: 0, waiting: 0, problem: 0 };
  for (const r of rows) counts[r.status]++;
  return counts;
};

/** Σχέδιο εισαγωγής: κατάσταση ανά γραμμή, χωρίς καμία εγγραφή εκτός από το ImportJob (πρόχειρο). */
export async function planForeign(
  input: { fileName: string; sheet: string[][]; headerRow: number; config: MappingConfig; mappingId?: string | null; opts?: EngineOpts },
  staffId: string | null,
): Promise<{ jobId: string; rows: ForeignPlanRow[]; writeOn: boolean }> {
  const foreign = toRows(input.sheet, input.headerRow, input.config);
  const writeOn = await itemWriteEnabled(), priceOn = webPriceWriteEnabled();
  const rows = (await compute(foreign, writeOn, priceOn, undefined, input.opts)).map((c) => c.plan);
  const stored: Stored = { foreign, plan: rows, headerRow: input.headerRow, config: input.config, writeOn, priceOn, ...(input.opts ? { opts: input.opts } : {}) };
  const job = await db.importJob.create({ data: { fileName: input.fileName, mappingId: input.mappingId ?? null, rows: stored as object, counts: countStatus(rows), status: "draft", createdById: staffId }, select: { id: true } });
  return { jobId: job.id, rows, writeOn };
}

/**
 * Ο έλεγχος χωρίς καμία εγγραφή (ούτε ImportJob): τι υπάρχει ήδη στο SoftOne, με ποιο κλειδί βρέθηκε, τι θα άλλαζε.
 * Για τον «Έλεγχο με SoftOne» των XML προμηθευτών, που τρέχει σε κομμάτια πάνω σε όλο το feed.
 */
export async function previewForeign(input: { sheet: string[][]; headerRow: number; config: MappingConfig; opts?: EngineOpts }): Promise<{ rows: ForeignPlanRow[]; writeOn: boolean; priceOn: boolean }> {
  const foreign = toRows(input.sheet, input.headerRow, input.config);
  const writeOn = await itemWriteEnabled(), priceOn = webPriceWriteEnabled();
  return { rows: (await compute(foreign, writeOn, priceOn, undefined, input.opts)).map((c) => c.plan), writeOn, priceOn };
}

/** Οι τελευταίες εισαγωγές (για «Πρόσφατες εισαγωγές» → «Νέα προεπισκόπηση»). */
export async function recentForeignJobs(take = 10): Promise<RecentJob[]> {
  const jobs = await db.importJob.findMany({ orderBy: { createdAt: "desc" }, take, select: { id: true, fileName: true, status: true, counts: true, createdAt: true } });
  return jobs.map((j) => {
    const c = (j.counts ?? {}) as Partial<Record<RowStatus, number>> & { applied?: { done?: number; waiting?: number; pending?: number; errors?: number } };
    const n = (k: RowStatus) => (typeof c[k] === "number" ? c[k]! : 0);
    return { id: j.id, fileName: j.fileName, status: j.status, createdAt: j.createdAt.toISOString(), counts: { update: n("update"), unchanged: n("unchanged"), new: n("new"), waiting: n("waiting"), problem: n("problem") }, applied: c.applied ?? null };
  });
}

/**
 * «Νέα προεπισκόπηση» μιας αποθηκευμένης εισαγωγής: ξαναϋπολογίζει ΟΛΕΣ τις γραμμές της με τον ΤΩΡΙΝΟ διακόπτη και τα
 * τωρινά δεδομένα (π.χ. οι «Σε αναμονή» όταν άνοιξε η εγγραφή στο SoftOne) και ενημερώνει το σχέδιο, τον αποθηκευμένο διακόπτη
 * και τους μετρητές. Το ιστορικό εκτέλεσης (results) μένει. Καμία εγγραφή εκτός από το ImportJob.
 */
export async function replanForeign(jobId: string): Promise<{ jobId: string; fileName: string; rows: ForeignPlanRow[]; writeOn: boolean }> {
  const job = await db.importJob.findUnique({ where: { id: jobId } });
  if (!job) throw new UserError("Η εισαγωγή δεν βρέθηκε.");
  const stored = job.rows as unknown as Stored;
  if (!stored || !Array.isArray(stored.foreign) || !Array.isArray(stored.plan)) throw new UserError("Η εισαγωγή δεν έχει αποθηκευμένες γραμμές — ανέβασε ξανά το αρχείο.");
  // Μάρκες/κατηγορίες των γραμμών πρέπει να υπάρχουν ακόμη (αλλιώς θα κατέληγαν σε PendingItem με άκυρο id)
  const brands = [...new Set(stored.foreign.map((r) => r.brandId).filter((x): x is string => !!x))];
  const cats = [...new Set(stored.foreign.map((r) => r.categoryId).filter((x): x is string => !!x))];
  const [nb, nc] = await Promise.all([brands.length ? db.brand.count({ where: { id: { in: brands } } }) : 0, cats.length ? db.category.count({ where: { id: { in: cats } } }) : 0]);
  if (nb !== brands.length || nc !== cats.length) throw new UserError("Κάποια μάρκα ή κατηγορία της εισαγωγής δεν υπάρχει πια — ανέβασε ξανά το αρχείο.");
  const writeOn = await itemWriteEnabled(), priceOn = webPriceWriteEnabled();
  const rows = (await compute(stored.foreign, writeOn, priceOn, undefined, stored.opts)).map((c) => c.plan);
  const prev = (job.counts ?? {}) as { applied?: unknown };
  await db.importJob.update({ where: { id: jobId }, data: { rows: { ...stored, plan: rows, writeOn, priceOn } as object, counts: { ...countStatus(rows), ...(prev.applied ? { applied: prev.applied } : {}) } as object } });
  return { jobId, fileName: job.fileName, rows, writeOn };
}

/**
 * Εκτέλεση των επιλεγμένων γραμμών (το UI στέλνει παρτίδες ~50). Ξαναϋπολογίζονται ΜΟΝΟ αυτές με φρέσκα δεδομένα· αν η
 * αντιστοίχιση άλλαξε από τον έλεγχο (άλλο είδος ή νέο ↔ υπάρχον) η γραμμή δεν εκτελείται. done = υπάρχοντα που
 * ενημερώθηκαν χωρίς σφάλμα· waiting = υπάρχοντα με στοιχεία/τιμή για το SoftOne που περιμένουν να ανοίξει η εγγραφή (οι
 * φωτογραφίες τους έχουν ήδη περάσει)· pending = νέα είδη στην αναμονή έγκρισης (ξανά-εκτέλεση δεν φτιάχνει δεύτερο PendingItem).
 */
export async function applyForeign(jobId: string, rowNos: number[], staffId: string | null): Promise<{ done: number; waiting: number; pending: number; errors: { rowNo: number; error: string }[]; notes: { rowNo: number; note: string }[] }> {
  const job = await db.importJob.findUnique({ where: { id: jobId } });
  if (!job) throw new UserError("Η εισαγωγή δεν βρέθηκε.");
  const stored = job.rows as unknown as Stored;
  const storedPlan = new Map(stored.plan.map((p) => [p.rowNo, p]));
  const writeOn = await itemWriteEnabled();
  // Η προεπισκόπηση έδειξε «θα γραφτεί στο SoftOne» ή «σε αναμονή»· αν ο διακόπτης άλλαξε από τότε, δεν εκτελείται τίποτα
  if (stored.writeOn !== writeOn) throw new UserError("Ο διακόπτης του SoftOne άλλαξε από την προεπισκόπηση — ξανακάνε προεπισκόπηση.");
  // Το ίδιο για την εγγραφή τιμής web (παλιές εισαγωγές χωρίς priceOn: ισχύει ο τωρινός)
  const priceOn = webPriceWriteEnabled();
  if (stored.priceOn !== undefined && stored.priceOn !== priceOn) throw new UserError("Η εγγραφή τιμής web άλλαξε από την προεπισκόπηση — ξανακάνε προεπισκόπηση.");
  const want = new Set(rowNos);
  const ctx = await compute(stored.foreign, writeOn, priceOn, { rowNos: want, stored: stored.plan }, stored.opts);
  const errors: { rowNo: number; error: string }[] = [];
  for (const n of want) if (!ctx.some((c) => c.row.rowNo === n)) errors.push({ rowNo: n, error: "Η γραμμή δεν υπάρχει στην εισαγωγή." });
  const results: Record<number, string> = { ...(stored.results ?? {}) };
  // Ο χρήστης ενέκρινε ό,τι είδε στον έλεγχο: αν η φρέσκια αντιστοίχιση είναι άλλη, η γραμμή δεν αγγίζεται
  const changed = new Set(ctx.filter((c) => matchChanged(storedPlan.get(c.row.rowNo), c.plan)).map((c) => c.row.rowNo));
  const sel = ctx.filter((c) => !changed.has(c.row.rowNo));
  const rowErr = new Map<number, string[]>();
  const fail = (rowNo: number, msg: string) => rowErr.set(rowNo, [...(rowErr.get(rowNo) ?? []), msg]);
  const notes: { rowNo: number; note: string }[] = [];

  const existing = sel.filter((c) => c.mtrl != null && !c.plan.problem);
  if (writeOn) {
    for (const over of [false, true]) {
      const pick = (c: Ctx) => (over ? c.parsedOver : c.parsed);
      const withChanges = existing.filter((c) => pick(c) && c.plan.changes.length && !rowErr.has(c.row.rowNo));
      if (!withChanges.length) continue;
      const res = await applyImport({ meta: null, rows: withChanges.map((c) => pick(c)!), warnings: [], sheets: [] }, { toSoftone: true, activate: false, onlyBlank: !over }, withChanges.map((c) => keyOf(c.row.rowNo)));
      for (const r of res) if (!r.ok) fail(Number(r.key.split("#")[1]), r.message);
    }
    // Τιμή μόνο αν τα στοιχεία της γραμμής πέρασαν — όχι μισοεκτελεσμένη γραμμή. Με κλειστή εγγραφή τιμής web: παραλείπεται
    // (η προεπισκόπηση το έδειξε με σημείωση), όχι σφάλμα.
    for (const c of priceOn ? existing.filter((x) => x.plan.price && !rowErr.has(x.row.rowNo)) : []) {
      const w = await writeWebPrice(c.mtrl!, c.plan.price!.price, { onlyIfBlank: stored.opts?.policy.price !== "overwrite" });
      if (!w.ok) { fail(c.row.rowNo, `Τιμή web: ${w.error ?? "δεν γράφτηκε."}`); continue; }
      // Όπως στην έγκριση νέων ειδών: το κατάστημα και ο καθρέφτης παίρνουν αμέσως την τιμή
      try { await syncItem(c.mtrl!, "manual"); await projectItem(c.mtrl!); }
      catch (e) { console.error("[foreign-import/price-sync]", c.mtrl, e); notes.push({ rowNo: c.row.rowNo, note: "Η τιμή γράφτηκε στο SoftOne· το κατάστημα θα την πάρει στον επόμενο συγχρονισμό." }); }
    }
  }
  // Φωτογραφίες: τρέχουν και με το SoftOne σε αναμονή (μόνο προσθήκη, ποτέ αντικατάσταση)· όχι σε γραμμή που απέτυχε στο SoftOne
  const withMedia = existing.filter((c) => c.media && !rowErr.has(c.row.rowNo));
  if (withMedia.length) {
    const res = await applyMedia(withMedia.map((c) => c.media!), withMedia.map((c) => keyOf(c.row.rowNo)), false, staffId);
    for (const r of res) if (!r.ok) fail(Number(r.key.split("#")[1]), r.message);
  }

  // Νέα είδη → PendingItem: μία ανάγνωση για όσα υπάρχουν ήδη και μία εισαγωγή (μοναδικό jobId+rowNo, skipDuplicates).
  // Ίδιος κωδικός / EAN ήδη ανοιχτό στα «Νέα είδη» από άλλη εισαγωγή (π.χ. ξανά το ίδιο αρχείο) → δεν μπαίνει δεύτερο.
  const fresh = sel.filter((c) => c.plan.status === "new");
  let already = new Map<number, string>();
  if (fresh.length) {
    const have = new Set((await db.pendingItem.findMany({ where: { jobId, rowNo: { in: fresh.map((c) => c.row.rowNo) } }, select: { rowNo: true } })).map((p) => p.rowNo));
    const open = await db.pendingItem.findMany({ where: { status: { in: [...OPEN, "creating"] } }, select: { jobId: true, rowNo: true, code: true, fields: true } });
    already = openDuplicates(jobId, fresh.filter((c) => !have.has(c.row.rowNo)).map((c) => ({ rowNo: c.row.rowNo, code: (c.row.fields.code || c.row.fields.factoryCode || "").trim(), barcode: c.row.fields.barcode })), open);
    const data = fresh.filter((c) => !have.has(c.row.rowNo) && !already.has(c.row.rowNo)).map((c) => {
      const r = c.row, fields = { ...r.fields };
      const e = fields.barcode ? normEan(fields.barcode) : null;
      if (e) fields.barcode = e;
      return {
        // Χαρακτηριστικά με τις ετικέτες του χρήστη (όχι της ομάδας της προεπισκόπησης): στην έγκριση αντιστοιχίζονται στην ΤΕΛΙΚΗ ομάδα
        jobId, rowNo: r.rowNo, code: (r.fields.code || r.fields.factoryCode || "").trim(), fields, specs: r.specs, media: r.media,
        brandId: r.brandId, specGroupS1Id: c.groupS1Id, webCategoryId: r.categoryId, unitId: r.unitId, markId: r.markId,
        cost: r.cost ? parseMoney(r.cost) : null, rrp: r.rrp ? parseMoney(r.rrp) : null, price: c.plan.price?.price ?? null,
      };
    });
    if (data.length) await db.pendingItem.createMany({ data, skipDuplicates: true });
  }

  let done = 0, waiting = 0, pending = 0;
  for (const c of ctx) {
    const n = c.row.rowNo;
    if (changed.has(n)) { errors.push({ rowNo: n, error: "Η αντιστοίχιση άλλαξε από τον έλεγχο — ξανακάνε έλεγχο." }); results[n] = "error"; continue; }
    if (c.plan.status === "problem") { errors.push({ rowNo: n, error: c.plan.problem ?? "Πρόβλημα στη γραμμή." }); results[n] = "error"; continue; }
    if (c.plan.status === "new") {
      const dup = already.get(n);
      if (dup) { notes.push({ rowNo: n, note: dup }); results[n] = "already"; } else { pending++; results[n] = "pending"; }
      continue;
    }
    const errs = rowErr.get(n);
    if (errs) { errors.push({ rowNo: n, error: errs.join(" · ") }); results[n] = "error"; }
    else if (c.plan.status === "waiting") { waiting++; results[n] = "waiting"; }
    else if (c.plan.status === "update") { done++; results[n] = "done"; }
    else results[n] = "unchanged";
  }

  // Το αποθηκευμένο σχέδιο παίρνει τις φρέσκιες γραμμές — εκτός από όσες άλλαξαν αντιστοίχιση (θέλουν νέο έλεγχο)
  for (const c of sel) storedPlan.set(c.row.rowNo, c.plan);
  const plan = stored.plan.map((p) => storedPlan.get(p.rowNo)!);
  // Κατάσταση και μετρητές από ΟΛΕΣ τις παρτίδες ως τώρα (results ανά γραμμή), όχι μόνο από αυτή
  const tally = { done: 0, waiting: 0, pending: 0, error: 0, unchanged: 0 } as Record<string, number>;
  for (const v of Object.values(results)) tally[v] = (tally[v] ?? 0) + 1;
  await db.importJob.update({ where: { id: jobId }, data: {
    status: tally.error || tally.waiting ? "partial" : "applied",
    counts: { ...countStatus(plan), applied: { done: tally.done, waiting: tally.waiting, pending: tally.pending, errors: tally.error } },
    rows: { ...stored, plan, results } as object,
  } });
  return { done, waiting, pending, errors, notes };
}
