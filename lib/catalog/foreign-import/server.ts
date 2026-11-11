import "server-only";
import { DEFAULT_POLICY, improves, policyPrice, splitByPolicy, type UpdatePolicy } from "@/lib/catalog/xml-import/policy-core";
import { parseDescription, toPlainText } from "@/lib/softone/describe";
import { db } from "@/lib/db";
import { planImport, applyImport, WEB_GROUP_LABEL, type ExtraItem } from "@/lib/catalog/supplier-import";
import { planMedia, applyMedia, type MediaRow } from "@/lib/catalog/supplier-media";
import { loadGroups, groupOfCategory, FIELDS, type FieldKey, type ParsedRow } from "@/lib/catalog/supplier-sheet";
import { itemWriteEnabled, writeWebPrice, webPriceWriteEnabled, writeItem, writeWebExcluded, webFlagWriteEnabled, WEB_FLAG_OFF } from "@/lib/softone/item-write";
import { findOffWebItems, syncItem } from "@/lib/softone/catalog";
import { projectItem } from "@/lib/softone/project";
import { OPEN, pendingFields, pendingMedia, newItemCode } from "@/lib/catalog/foreign-import/pending-core";
import { parseMoney, pickRule, type Rounding } from "@/lib/catalog/pricing/markup";
import { labelKey, toRows, resolveMatches, buildMatchIndex, normEan, eanVariants, barcodeKey, mergeMedia, type ForeignRow, type MappingConfig } from "@/lib/catalog/foreign-import/core";
import { priceApplies, rowStatus, newDuplicates, rekeySpecs, ruleLabel, planPrice, mostCommon, matchChanged, sameItemRows, chunks, sectionTitle, namesDiffer, openDuplicates, SECTION_TITLE, PRICE_OFF_NOTE, NO_WEB_CATEGORY, type ForeignPlanRow, type ForeignPrice, type RowStatus } from "@/lib/catalog/foreign-import/plan-core";
import { UserError } from "@/lib/catalog/foreign-import/core";
import { configIds, type RecentJob } from "@/lib/catalog/foreign-import/ui-core";
import { suggestProductCategories } from "@/lib/catalog/category-ai";
import { categoryOptions } from "@/lib/catalog/foreign-import/options";

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
/** `extra` = το είδος όταν βρέθηκε στο SoftOne αλλά όχι στον καθρέφτη· `mediaLater` = φωτογραφίες που περιμένουν να γίνει πρώτα προϊόν (μετά τη web κατηγορία) */
type Ctx = { row: ForeignRow; plan: ForeignPlanRow; mtrl: number | null; groupS1Id: number | null; specs: Record<string, string>; parsed?: ParsedRow; parsedOver?: ParsedRow; media?: MediaRow; extra?: ExtraItem; mediaLater?: MediaRow; supplierAvail?: string | null };
const AVAIL_LABEL: Record<string, string> = { "in-stock": "Διαθέσιμο", low: "Μικρό απόθεμα", order: "Κατόπιν παραγγελίας", unavailable: "Μη διαθέσιμο" };
const extraOf = (ctx: Ctx[]) => ctx.filter((c) => c.extra).map((c) => c.extra!);

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
export const WEB_EXCLUDED_NOTE = "Έχει «Εξαίρεση Web» στο SoftOne: δεν ανεβαίνει στο site, γι' αυτό μένει εκτός εισαγωγής εκτός αν το διαλέξεις.";
const NUMERIC: FieldKey[] = ["guaranteeMonths", "widthCm", "heightCm", "lengthCm", "weightKg"];
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
  // Barcode που δεν είναι έγκυρο EAN ψάχνεται όπως είναι γραμμένο
  const bcForms = (b?: string | null) => { const v = eanVariants(b); return v.length ? v : t(b ?? "") ? [t(b ?? "")] : []; };
  const eans = [...new Set(foreign.flatMap((r) => bcForms(r.fields.barcode)))];
  const factory = [...new Set(foreign.map((r) => t(r.fields.factoryCode)).filter(Boolean))];
  const select = { mtrl: true, code: true, name: true, barcode: true, factoryCode: true, manufacturerS1Id: true, vatS1Id: true, specGroupS1Id: true, eshopPrice: true, webExcluded: true, shortDesc: true, longDesc: true } as const;
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
  // Ό,τι δεν βρέθηκε στον καθρέφτη (κρατά μόνο τα είδη του web) ψάχνεται και στο ίδιο το SoftOne: είδος χωρίς web
  // κατηγορία υπάρχει ήδη και δεν πρέπει να δημιουργηθεί ξανά ως «νέο»
  const mirrored = found.flat();
  const hasCode = new Set(mirrored.flatMap((i) => [i.code, i.factoryCode].filter((x): x is string => !!x).map((x) => x.toLowerCase())));
  const hasEan = new Set(mirrored.flatMap((i) => bcForms(i.barcode)));
  const offWeb = await findOffWebItems({ codes: codes.filter((c) => !hasCode.has(c.toLowerCase())), barcodes: eans.filter((e) => !hasEan.has(e)) });
  const offWebOf = new Map(offWeb.map((i) => [i.mtrl, i]));
  const items = [...new Map([...mirrored, ...offWeb.map((i) => ({ mtrl: i.mtrl, code: i.code, name: i.name, barcode: i.barcode, factoryCode: i.factoryCode, manufacturerS1Id: i.manufacturerS1Id, vatS1Id: i.vatS1Id, specGroupS1Id: i.specGroupS1Id, eshopPrice: null, webExcluded: false, shortDesc: null as string | null, longDesc: null as string | null }))].map((i) => [i.mtrl, i])).values()].sort((a, b) => a.mtrl - b.mtrl);
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
  // Η ομάδα βγαίνει από την κατηγορία του feed για τα νέα ΚΑΙ για όσα υπάρχοντα δεν έχουν web ομάδα στο SoftOne
  const needsGroup = (r: ForeignRow) => { const m = mtrlOf.get(r.rowNo); return m == null || itemOf.get(m)?.specGroupS1Id == null; };
  const newCats = [...new Set(foreign.filter((r) => needsGroup(r) && r.categoryId).map((r) => r.categoryId!))];
  const ruleCats = rules.map((r) => r.categoryId).filter((x): x is string => !!x);
  const [products, cats] = await Promise.all([
    inChunks(matched.map(String), (p) => db.product.findMany({ where: { erpCode: { in: p } }, select: { id: true, erpCode: true, brandId: true, categoryId: true, supplierAvail: true } })),
    db.category.findMany({ where: { id: { in: [...new Set([...newCats, ...ruleCats])] } }, select: { id: true, name: true, erpCode: true } }),
  ]);
  const productOf = new Map(products.map((p) => [p.erpCode, p]));
  // Η κύρια φωτογραφία κάθε υπάρχοντος προϊόντος, για την προεπισκόπηση της κάρτας του (μόνο ανάγνωση)
  const mainImage = new Map<string, string>();
  for (const m of await inChunks(products.map((p) => p.id), (p) => db.media.findMany({ where: { productId: { in: p }, kind: "image", hidden: false }, select: { productId: true, url: true }, orderBy: [{ productId: "asc" }, { sortNo: "asc" }] })))
    if (m.productId && !mainImage.has(m.productId)) mainImage.set(m.productId, m.url);
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
      mode: opts.priceMode, vatIncluded: policy.vatIncluded, markupPercent: policy.markupPercent,
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
      if (it.webExcluded) { plan.webExcluded = true; plan.warnings.unshift(WEB_EXCLUDED_NOTE); }
      const prod = productOf.get(String(it.mtrl));
      const bId = row.brandId ?? prod?.brandId ?? (it.manufacturerS1Id != null ? brandOfS1.get(String(it.manufacturerS1Id)) : undefined) ?? null;
      const have = prod ? mainImage.get(prod.id) : undefined;
      plan.card = { brand: (bId && brandName.get(bId)) || "", images: [...(have ? [have] : []), ...row.media.image.filter((u) => u !== have)].slice(0, 12), category: null, current: it.eshopPrice };
    }
    if (t(row.fields.barcode) && !normEan(row.fields.barcode!)) plan.warnings.push("Το barcode δεν είναι έγκυρο EAN — περνά όπως το έδωσε ο προμηθευτής.");
    // Αριθμητικά πεδία με κείμενο (π.χ. εγγύηση «60-120»): η μηχανή θα απέρριπτε όλη τη γραμμή — φεύγει μόνο το πεδίο, με σημείωση
    for (const k of NUMERIC) { const v = t(row.fields[k]); if (v && !/^\d+([.,]\d+)?$/.test(v)) { delete row.fields[k]; plan.warnings.push(`«${LABEL[k]}»: «${short(v)}» δεν είναι αριθμός — το πεδίο δεν θα περάσει.`); } }
    let problem = m.problem ?? (m.mtrl == null ? dups.get(row.rowNo) : same.get(row.rowNo)) ?? null;
    const extra = it ? offWebOf.get(it.mtrl) : undefined;
    let groupS1Id: number | null, assignWebGroup = false;
    if (it && it.specGroupS1Id == null) {
      // υπάρχει στο SoftOne χωρίς web ομάδα: την παίρνει από την κατηγορία του feed (αλλαγή στο σχέδιο, γράφεται με την εφαρμογή)
      groupS1Id = row.categoryId ? groupOfCat.get(row.categoryId) ?? null : null;
      if (groupS1Id != null && !groups.has(groupS1Id)) groupS1Id = null;
      if (groupS1Id == null) problem ??= row.categoryId
        ? `Το είδος ${NO_WEB_CATEGORY} και η κατηγορία «${catName.get(row.categoryId) ?? "—"}» δεν αντιστοιχεί σε ομάδα χαρακτηριστικών — διάλεξε άλλη στο βήμα «Κατηγορίες».`
        : `Το είδος ${NO_WEB_CATEGORY} — αντιστοίχισε την κατηγορία του feed στο βήμα «Κατηγορίες» για να την πάρει.`;
      else assignWebGroup = true;
    } else if (it) {
      groupS1Id = it.specGroupS1Id;
      if (!groups.has(groupS1Id!)) problem ??= "Η ομάδα χαρακτηριστικών του είδους δεν υπάρχει πια στο SoftOne.";
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
    const c: Ctx = { row, plan, mtrl: m.mtrl, groupS1Id, specs: rk.specs, ...(extra ? { extra } : {}) };
    if (problem) { plan.problem = problem; return c; }
    if (it) {
      const fields: Partial<Record<FieldKey, string>> = { ...row.fields, mtrl: String(it.mtrl) };
      const e = fields.barcode ? normEan(fields.barcode) : null;
      if (e) fields.barcode = e;
      if (t(fields.code).toLowerCase() === it.code.trim().toLowerCase()) delete fields.code;
      // «Έξυπνη» λειτουργία: ό,τι έχει ήδη τιμή αντικαθίσταται μόνο όταν το καινούργιο είναι αποδεδειγμένα καλύτερο
      const have: Partial<Record<FieldKey, string>> = { shortDesc: it.shortDesc ? toPlainText(it.shortDesc) : "", descText: parseDescription(it.longDesc).text, barcode: it.barcode ?? "" };
      const part = splitByPolicy(fields, rk.specs, policy, (k, v) => improves(k, have[k] ?? "", v));
      if (part.blank) c.parsed = { sheet: SHEET, rowNo: row.rowNo, groupS1Id: groupS1Id!, fields: part.blank.fields, specs: part.blank.specs };
      if (part.over) c.parsedOver = { sheet: SHEET, rowNo: row.rowNo, groupS1Id: groupS1Id!, fields: part.over.fields, specs: part.over.specs };
      // Η web ομάδα μπαίνει σε ΕΝΑ από τα δύο περάσματα (αλλιώς θα φαινόταν δύο φορές)· χωρίς άλλα πεδία, πέρασμα μόνο γι' αυτήν
      if (assignWebGroup) {
        if (c.parsed) c.parsed.assignWebGroup = true;
        else if (c.parsedOver) c.parsedOver.assignWebGroup = true;
        else c.parsed = { sheet: SHEET, rowNo: row.rowNo, groupS1Id: groupS1Id!, fields: { mtrl: String(it.mtrl) }, specs: {}, assignWebGroup: true };
      }
      if (mediaCount(row)) c.media = { sheet: SHEET, rowNo: row.rowNo, groupS1Id, ids: { mtrl: String(it.mtrl) }, image: row.media.image, banner: row.media.banner, video: row.media.video };
      // διαθεσιμότητα του προμηθευτή: μόνο στο κατάστημα (συνθήκη στους κανόνες διαθεσιμότητας), ποτέ στο SoftOne
      if (row.supplierAvail !== undefined) {
        const cur = productOf.get(String(it.mtrl))?.supplierAvail ?? null;
        if ((row.supplierAvail ?? null) !== cur) {
          c.supplierAvail = row.supplierAvail ?? null;
          plan.shop = [{ label: "Διαθεσιμότητα προμηθευτή", from: cur ? AVAIL_LABEL[cur] ?? cur : "—", to: c.supplierAvail ? AVAIL_LABEL[c.supplierAvail] ?? c.supplierAvail : "—" }];
        }
      }
      if (policy.price !== "off") {
        const p = productOf.get(String(it.mtrl));
        const pr = priceOf(row, row.brandId ?? p?.brandId ?? null, row.categoryId ?? p?.categoryId ?? null, (it.vatS1Id != null ? vatOf.get(String(it.vatS1Id)) : undefined) ?? 24);
        // κενή τιμή → μπαίνει· υπάρχουσα → διορθώνεται μόνο προς τα πάνω (ή όποτε διαφέρει, με «Αντικατάσταση»)
        if (pr.price && priceApplies(policy.price, it.eshopPrice, pr.price.price)) {
          plan.price = it.eshopPrice != null && it.eshopPrice > 0 ? { ...pr.price, was: it.eshopPrice } : pr.price;
          if (pr.warning) plan.warnings.push(pr.warning);
        } else if (!pr.price && pr.warning && !(it.eshopPrice != null && it.eshopPrice > 0)) plan.warnings.push(pr.warning);
      }
    } else {
      for (const k of Object.keys(row.fields) as FieldKey[]) { const v = t(row.fields[k]); if (v && k !== "mtrl") plan.changes.push({ label: LABEL[k], from: "—", to: short(v) }); }
      for (const [label, v] of Object.entries(rk.specs)) plan.changes.push({ label, from: "—", to: short(v) });
      plan.media = mediaCount(row);
      plan.card = { brand: (row.brandId && brandName.get(row.brandId)) || "", images: row.media.image.slice(0, 12), category: (row.categoryId && catName.get(row.categoryId)) || null };
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
    const plan = await planImport({ meta: null, rows: parsed, warnings: [], sheets: [] }, { toSoftone: true, activate: false, onlyBlank: !over, extraItems: extraOf(ctx) });
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
      if (r.action === "error" && c.plan.changes.some((x) => x.label.startsWith(WEB_GROUP_LABEL))) {
        // γίνεται προϊόν μόλις γραφτεί η web κατηγορία — οι φωτογραφίες περνούν αμέσως μετά, στην ίδια εφαρμογή
        c.mediaLater = c.media; c.media = undefined; c.plan.media = mediaCount(c.row);
        c.plan.warnings.push("Οι φωτογραφίες περνούν μόλις γραφτεί η web κατηγορία (το είδος γίνεται τότε προϊόν του καταστήματος).");
      } else if (r.action === "error") { c.plan.warnings.push("Το είδος δεν έχει ακόμη προϊόν στο κατάστημα — τα πολυμέσα παραλείπονται."); c.media = undefined; }
      else { c.plan.media = r.changes.length; if (!r.changes.length) c.media = undefined; }
    }
  }
  // Τιμή με κλειστή εγγραφή τιμής web: φαίνεται με σημείωση, αλλά δεν μετρά ως αλλαγή (δεν θα γραφτεί)
  for (const c of ctx) if (c.plan.price && !priceOn && !c.plan.problem) c.plan.warnings.unshift(PRICE_OFF_NOTE);
  for (const c of ctx) c.plan.status = rowStatus({ problem: !!c.plan.problem, mtrl: c.mtrl, changes: c.plan.changes.length, price: !!c.plan.price && priceOn, photos: c.plan.media, writeOn, shop: c.plan.shop?.length ?? 0 });
  return ctx;
}

const countStatus = (rows: ForeignPlanRow[]) => {
  const counts: Record<RowStatus, number> = { update: 0, unchanged: 0, new: 0, waiting: 0, problem: 0 };
  for (const r of rows) counts[r.status]++;
  return counts;
};

/** Ονόματα των μαρκών της αντιστοίχισης — μόνο όταν κάποιο σύνθετο πεδίο έχει κομμάτι «Μάρκα». */
async function brandNamesFor(config: MappingConfig, force = false): Promise<((id: string) => string | undefined) | undefined> {
  if (!force && !config.compose?.some((f) => f.parts.some((p) => p.kind === "brand"))) return undefined;
  const ids = [...new Set([...Object.values(config.brandMap), config.sheetBrandId].filter((x): x is string => !!x))];
  const names = new Map((await db.brand.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((b) => [b.id, b.name]));
  return (id) => names.get(id);
}

/** Σχέδιο εισαγωγής: κατάσταση ανά γραμμή, χωρίς καμία εγγραφή εκτός από το ImportJob (πρόχειρο). */
export async function planForeign(
  input: { fileName: string; sheet: string[][]; headerRow: number; config: MappingConfig; mappingId?: string | null; opts?: EngineOpts; /** γραμμές δεύτερου αρχείου μόνο με πολυμέσα (`mediaRows`) */ extraMedia?: ForeignRow[] },
  staffId: string | null,
): Promise<{ jobId: string; rows: ForeignPlanRow[]; writeOn: boolean; mediaMatch?: { matched: number; total: number } }> {
  const foreign = toRows(input.sheet, input.headerRow, input.config, await brandNamesFor(input.config));
  // Πριν από το σχέδιο: έτσι οι φωτογραφίες του δεύτερου αρχείου αποθηκεύονται με τις γραμμές και ακολουθούν ό,τι και οι δικές τους
  const mediaMatch = input.extraMedia ? mergeMedia(foreign, input.extraMedia) : undefined;
  const writeOn = await itemWriteEnabled(), priceOn = webPriceWriteEnabled();
  const rows = (await compute(foreign, writeOn, priceOn, undefined, input.opts)).map((c) => c.plan);
  const stored: Stored = { foreign, plan: rows, headerRow: input.headerRow, config: input.config, writeOn, priceOn, ...(input.opts ? { opts: input.opts } : {}) };
  const job = await db.importJob.create({ data: { fileName: input.fileName, mappingId: input.mappingId ?? null, rows: stored as object, counts: countStatus(rows), status: "draft", createdById: staffId }, select: { id: true } });
  return { jobId: job.id, rows, writeOn, ...(mediaMatch ? { mediaMatch } : {}) };
}

/**
 * Ο έλεγχος χωρίς καμία εγγραφή (ούτε ImportJob): τι υπάρχει ήδη στο SoftOne, με ποιο κλειδί βρέθηκε, τι θα άλλαζε.
 * Για τον «Έλεγχο με SoftOne» των XML προμηθευτών, που τρέχει σε κομμάτια πάνω σε όλο το feed.
 */
export async function previewForeign(input: { sheet: string[][]; headerRow: number; config: MappingConfig; opts?: EngineOpts }): Promise<{ rows: ForeignPlanRow[]; writeOn: boolean; priceOn: boolean }> {
  const foreign = toRows(input.sheet, input.headerRow, input.config, await brandNamesFor(input.config));
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
export async function applyForeign(jobId: string, rowNos: number[], staffId: string | null): Promise<{ done: number; waiting: number; pending: number; errors: { rowNo: number; error: string }[]; notes: { rowNo: number; note: string }[]; waitingRows: number[] }> {
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
      const res = await applyImport({ meta: null, rows: withChanges.map((c) => pick(c)!), warnings: [], sheets: [] }, { toSoftone: true, activate: false, onlyBlank: !over, extraItems: extraOf(ctx) }, withChanges.map((c) => keyOf(c.row.rowNo)));
      for (const r of res) if (!r.ok) fail(Number(r.key.split("#")[1]), r.message);
    }
    // Είδη που μόλις πήραν web κατηγορία έγιναν προϊόντα: τώρα περνούν και οι φωτογραφίες τους
    const later = existing.filter((c) => c.mediaLater && !rowErr.has(c.row.rowNo));
    if (later.length) {
      const res = await applyMedia(later.map((c) => c.mediaLater!), later.map((c) => keyOf(c.row.rowNo)), false, staffId);
      for (const r of res) if (!r.ok) notes.push({ rowNo: Number(r.key.split("#")[1]), note: `Φωτογραφίες: ${r.message}` });
    }
    // Τιμή μόνο αν τα στοιχεία της γραμμής πέρασαν — όχι μισοεκτελεσμένη γραμμή. Με κλειστή εγγραφή τιμής web: παραλείπεται
    // (η προεπισκόπηση το έδειξε με σημείωση), όχι σφάλμα.
    for (const c of priceOn ? existing.filter((x) => x.plan.price && !rowErr.has(x.row.rowNo)) : []) {
      const w = await writeWebPrice(c.mtrl!, c.plan.price!.price, { mode: stored.opts?.policy.price === "overwrite" ? "any" : "higher" });
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

  // Διαθεσιμότητα προμηθευτή → προϊόν του καταστήματος (και με το SoftOne σε αναμονή)· μετά, κανόνες και πληρότητα
  const avail = existing.filter((c) => c.supplierAvail !== undefined && !rowErr.has(c.row.rowNo));
  if (avail.length) {
    const touched: string[] = [];
    for (const c of avail) {
      const ps = await db.product.findMany({ where: { erpCode: String(c.mtrl) }, select: { id: true } });
      if (!ps.length) { notes.push({ rowNo: c.row.rowNo, note: "Η διαθεσιμότητα του προμηθευτή θα περάσει όταν το είδος γίνει προϊόν του καταστήματος." }); continue; }
      await db.product.updateMany({ where: { id: { in: ps.map((p) => p.id) } }, data: { supplierAvail: c.supplierAvail ?? null } });
      touched.push(...ps.map((p) => p.id));
    }
    if (touched.length) {
      const [{ projectAvailability }, { projectPublishReady }] = await Promise.all([import("@/lib/catalog/availability"), import("@/lib/catalog/publish-ready-server")]);
      await projectAvailability(touched); await projectPublishReady(touched);
    }
  }

  // Νέα είδη → PendingItem: μία ανάγνωση για όσα υπάρχουν ήδη και μία εισαγωγή (μοναδικό jobId+rowNo, skipDuplicates).
  // Ίδιος κωδικός / EAN ήδη ανοιχτό στα «Νέα είδη» από άλλη εισαγωγή (π.χ. ξανά το ίδιο αρχείο) → δεν μπαίνει δεύτερο.
  const fresh = sel.filter((c) => c.plan.status === "new");
  let already = new Map<number, string>();
  if (fresh.length) {
    const have = new Set((await db.pendingItem.findMany({ where: { jobId, rowNo: { in: fresh.map((c) => c.row.rowNo) } }, select: { rowNo: true } })).map((p) => p.rowNo));
    const open = await db.pendingItem.findMany({ where: { status: { in: [...OPEN, "creating"] } }, select: { id: true, status: true, media: true, jobId: true, rowNo: true, code: true, fields: true } });
    already = openDuplicates(jobId, fresh.filter((c) => !have.has(c.row.rowNo)).map((c) => ({ rowNo: c.row.rowNo, code: newItemCode(c.row.fields), barcode: c.row.fields.barcode })), open);
    // Το ίδιο είδος περιμένει ήδη δημιουργία (ήρθε πρώτα το αρχείο προϊόντων, τώρα αυτό με τις φωτογραφίες): τα πολυμέσα
    // της γραμμής προστίθενται σε εκείνο, αλλιώς θα χάνονταν μαζί με τη γραμμή που δεν μπαίνει δεύτερη φορά
    for (const c of fresh.filter((x) => already.has(x.row.rowNo) && mediaCount(x.row))) {
      const code = newItemCode(c.row.fields).toLowerCase(), bk = barcodeKey(c.row.fields.barcode);
      const p = open.find((o) => OPEN.includes(o.status) && ((code && o.code.trim().toLowerCase() === code) || (bk && barcodeKey(pendingFields(o.fields).barcode) === bk)));
      if (!p) continue;
      const cur = pendingMedia(p.media), add = c.row.media;
      const media = { image: [...new Set([...cur.image, ...add.image])], banner: [...new Set([...cur.banner, ...add.banner])], video: [...new Set([...cur.video, ...add.video])] };
      const n = media.image.length + media.banner.length + media.video.length - cur.image.length - cur.banner.length - cur.video.length;
      if (n) await db.pendingItem.update({ where: { id: p.id }, data: { media } });
      already.set(c.row.rowNo, `${already.get(c.row.rowNo)} ${n ? `Προστέθηκαν σε αυτό ${n} ${n === 1 ? "πολυμέσο" : "πολυμέσα"} της γραμμής.` : "Τα πολυμέσα της γραμμής τα έχει ήδη."}`);
    }
    const data = fresh.filter((c) => !have.has(c.row.rowNo) && !already.has(c.row.rowNo)).map((c) => {
      const r = c.row, fields = { ...r.fields };
      const e = fields.barcode ? normEan(fields.barcode) : null;
      if (e) fields.barcode = e;
      return {
        // Χαρακτηριστικά με τις ετικέτες του χρήστη (όχι της ομάδας της προεπισκόπησης): στην έγκριση αντιστοιχίζονται στην ΤΕΛΙΚΗ ομάδα
        jobId, rowNo: r.rowNo, code: newItemCode(r.fields), fields, specs: r.specs, media: r.media,
        brandId: r.brandId, specGroupS1Id: c.groupS1Id, webCategoryId: r.categoryId, unitId: r.unitId, markId: r.markId,
        cost: r.cost ? parseMoney(r.cost) : null, rrp: r.rrp ? parseMoney(r.rrp) : null, price: c.plan.price?.price ?? null,
      };
    });
    if (data.length) await db.pendingItem.createMany({ data, skipDuplicates: true });
  }

  let done = 0, waiting = 0, pending = 0;
  const waitingRows: number[] = [];
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
    else if (c.plan.status === "waiting") { waiting++; waitingRows.push(n); results[n] = "waiting"; }
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
  return { done, waiting, pending, errors, notes, waitingRows };
}

export type MissingProduct = { id: string; mtrl: number; title: string; sku: string; brand: string; /** απόθεμα κεντρικής — μόνο για ενημέρωση, η απενεργοποίηση γίνεται και με απόθεμα */ stock: number | null; webExcluded: boolean };

/**
 * Ενεργά προϊόντα των μαρκών του αρχείου που ΔΕΝ βρέθηκαν σε καμία γραμμή του: υποψήφια για απενεργοποίηση. Μόνο λίστα —
 * ο χρήστης διαλέγει (ένα αρχείο μπορεί να είναι μέρος του καταλόγου της μάρκας, π.χ. ένα φύλλο από τα δύο).
 */
export async function missingFromJob(jobId: string): Promise<MissingProduct[]> {
  const job = await db.importJob.findUnique({ where: { id: jobId }, select: { rows: true } });
  const stored = job?.rows as unknown as Stored | undefined;
  if (!stored || !Array.isArray(stored.foreign) || !Array.isArray(stored.plan)) return [];
  const brands = [...new Set(stored.foreign.map((r) => r.brandId).filter((x): x is string => !!x))];
  if (!brands.length) return [];
  const inFile = new Set(stored.plan.map((p) => p.mtrl).filter((m): m is number => m != null).map(String));
  const ps = await db.product.findMany({ where: { brandId: { in: brands }, active: true }, select: { id: true, erpCode: true, title: true, sku: true, brand: { select: { name: true } } }, orderBy: { title: "asc" } });
  const left = ps.filter((p) => /^\d+$/.test(p.erpCode) && !inFile.has(p.erpCode));
  const s1 = new Map((await db.s1Item.findMany({ where: { mtrl: { in: left.map((p) => Number(p.erpCode)) } }, select: { mtrl: true, stockCentral: true, webExcluded: true } })).map((i) => [i.mtrl, i]));
  return left.map((p) => { const i = s1.get(Number(p.erpCode)); return { id: p.id, mtrl: Number(p.erpCode), title: p.title, sku: p.sku ?? "", brand: p.brand?.name ?? "", stock: i?.stockCentral != null ? Number(i.stockCentral) : null, webExcluded: !!i?.webExcluded }; });
}

/**
 * Απενεργοποίηση όσων διάλεξε ο χρήστης από τη λίστα «λείπουν από το αρχείο», **ανεξάρτητα από το απόθεμα**: στο SoftOne
 * τσεκάρεται η «Εξαίρεση Web» (δεν προβάλλεται στο web) ΚΑΙ το είδος γίνεται ανενεργό (ISACTIVE=0)· μετά συγχρονίζεται, ώστε
 * να φύγει αμέσως από το eshop. Η λίστα ξαναϋπολογίζεται: προϊόν που δεν λείπει πια (ή ήταν άλλης μάρκας) δεν αγγίζεται.
 */
export async function deactivateMissing(jobId: string, ids: string[]): Promise<{ id: string; ok: boolean; error?: string }[]> {
  if (!(await itemWriteEnabled())) throw new UserError("Οι αλλαγές προς το SoftOne είναι κλειστές (Ρυθμίσεις → SoftOne) — η απενεργοποίηση γίνεται εκεί.");
  if (!webFlagWriteEnabled()) throw new UserError(WEB_FLAG_OFF);
  const allowed = new Map((await missingFromJob(jobId)).map((p) => [p.id, p]));
  const out: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of [...new Set(ids)]) {
    const p = allowed.get(id);
    if (!p) { out.push({ id, ok: false, error: "Δεν είναι πια στη λίστα όσων λείπουν — ανανέωσε." }); continue; }
    try {
      // πρώτα η «Εξαίρεση Web» (όσο το είδος είναι ακόμη ενεργό), μετά ανενεργό
      const web = await writeWebExcluded(p.mtrl, true);
      if (!web.ok) { out.push({ id, ok: false, error: web.error ?? "Το SoftOne δεν δέχτηκε την «Εξαίρεση Web»." }); continue; }
      const w = await writeItem(p.mtrl, { active: { from: true, to: false } });
      await syncItem(p.mtrl, "manual"); await projectItem(p.mtrl);
      if (!w.ok) { out.push({ id, ok: false, error: `Βγήκε από το eshop («Εξαίρεση Web»), αλλά δεν έγινε ανενεργό στο SoftOne: ${w.error ?? "το SoftOne δεν δέχτηκε την αλλαγή."}` }); continue; }
      out.push({ id, ok: true });
    } catch (e) { console.error("[foreign-import/deactivate]", p.mtrl, e); out.push({ id, ok: false, error: "Απρόσμενο σφάλμα — ξαναδοκίμασε." }); }
  }
  return out;
}

/** Οι γραμμές μιας εισαγωγής που είναι νέα είδη ΧΩΡΙΣ κατηγορία site — αυτές έχει νόημα να ρωτηθεί το AI. Μόνο ανάγνωση. */
export async function rowsWithoutCategory(jobId: string): Promise<{ rowNo: number; name: string; brand?: string; extra: string }[]> {
  const job = await db.importJob.findUnique({ where: { id: jobId }, select: { rows: true } });
  const stored = job?.rows as unknown as Stored | undefined;
  if (!stored || !Array.isArray(stored.foreign) || !Array.isArray(stored.plan)) throw new UserError("Η εισαγωγή δεν βρέθηκε — ξανακάνε προεπισκόπηση.");
  const isNew = new Set(stored.plan.filter((p) => p.status === "new").map((p) => p.rowNo));
  const rows = stored.foreign.filter((r) => isNew.has(r.rowNo) && !r.categoryId);
  const brands = new Map((await db.brand.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.brandId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } })).map((b) => [b.id, b.name]));
  return rows.map((r) => ({
    rowNo: r.rowNo, name: (r.fields.name || r.fields.code || r.fields.factoryCode || "").trim(), ...(r.brandId && brands.get(r.brandId) ? { brand: brands.get(r.brandId)! } : {}),
    extra: [r.fields.shortDesc, r.fields.descText?.slice(0, 120), Object.entries(r.specs).slice(0, 6).map(([k, v]) => `${k}: ${v}`).join(" · ")].filter(Boolean).join(" · "),
  }));
}

/**
 * Κατηγορία site ανά γραμμή (όσες δέχτηκε ο χρήστης από τις προτάσεις): γράφεται στις γραμμές της εισαγωγής και το σχέδιο
 * ξαναϋπολογίζεται, ώστε να βγουν ομάδα χαρακτηριστικών, ΦΠΑ και κανόνας τιμής. Αγγίζει μόνο το ImportJob.
 */
export async function setRowCategories(jobId: string, picks: Record<number, string>): Promise<{ jobId: string; fileName: string; rows: ForeignPlanRow[]; writeOn: boolean }> {
  const job = await db.importJob.findUnique({ where: { id: jobId } });
  const stored = job?.rows as unknown as Stored | undefined;
  if (!job || !stored || !Array.isArray(stored.foreign)) throw new UserError("Η εισαγωγή δεν βρέθηκε — ξανακάνε προεπισκόπηση.");
  const ids = [...new Set(Object.values(picks))];
  const valid = new Set((await db.category.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((c) => c.id));
  const foreign = stored.foreign.map((r) => (picks[r.rowNo] && valid.has(picks[r.rowNo]) && !r.categoryId ? { ...r, categoryId: picks[r.rowNo] } : r));
  await db.importJob.update({ where: { id: jobId }, data: { rows: { ...stored, foreign } as object } });
  return replanForeign(jobId);
}

/** Ό,τι χρειάζεται η ζωντανή κάρτα του eshop για μία γραμμή και δεν το ξέρει ο browser: τιμή από τον κανόνα και τα χαρακτηριστικά της κατηγορίας. */
export type LiveCard = {
  price: ForeignPrice | null; priceNote: string | null; category: string | null;
  /** η ομάδα χαρακτηριστικών της κατηγορίας: κάθε χαρακτηριστικό με την τιμή του από το αρχείο (null = κενό) */
  group: { name: string; specs: { name: string; value: string | null }[] } | null;
  /** χαρακτηριστικά του αρχείου που δεν υπάρχουν στην ομάδα (αγνοούνται στην εισαγωγή) */
  extra: string[];
};

/** Ομάδα χαρακτηριστικών μιας κατηγορίας: από τον κωδικό της, αλλιώς η συχνότερη ομάδα των ειδών της. */
async function groupIdOf(cat: { id: string; erpCode: string | null }): Promise<number | null> {
  const g = groupOfCategory(cat.erpCode);
  if (g != null) return g;
  const ps = await db.product.findMany({ where: { categoryId: cat.id }, select: { erpCode: true }, take: 500 });
  const nums = ps.map((p) => p.erpCode).filter((c) => /^\d+$/.test(c)).map(Number);
  const sg = nums.length ? await db.s1Item.findMany({ where: { mtrl: { in: nums }, missing: false }, select: { specGroupS1Id: true } }) : [];
  return mostCommon(sg.map((s) => s.specGroupS1Id));
}

export type CategorySpecs = Record<string, { name: string; group: string | null; specs: string[] }>;
/** Για κάθε κατηγορία: το όνομά της και τα χαρακτηριστικά της ομάδας της (κενό όταν δεν έχει ομάδα). Μόνο ανάγνωση. */
export async function categorySpecs(ids: string[]): Promise<CategorySpecs> {
  const cats = await db.category.findMany({ where: { id: { in: [...new Set(ids)].slice(0, 200) } }, select: { id: true, name: true, erpCode: true } });
  const gid = await Promise.all(cats.map((c) => groupIdOf(c)));
  const groups = await loadGroups([...new Set(gid.filter((g): g is number => g != null))]);
  const paths = new Map((await categoryOptions()).map((o) => [o.id, o.path]));
  return Object.fromEntries(cats.map((c, i) => { const g = gid[i] != null ? groups.get(gid[i]!) : undefined; return [c.id, { name: paths.get(c.id) ?? c.name, group: g?.name ?? null, specs: g?.specs.map((x) => x.name) ?? [] }]; }));
}

export type FileCategoryGuess = { rowNo: number; label: string; categoryId: string; sure: boolean };
/**
 * «Μάντεψε κατηγορίες» για ΟΛΟ το φύλλο (όχι μόνο τις πρώτες γραμμές): οι γραμμές χωρίς κατηγορία από στήλη/φύλλο πάνε στο AI
 * με όνομα, μάρκα και λίγα στοιχεία. Μόνο προτάσεις — τίποτα δεν γράφεται.
 */
export async function guessFileCategories(matrix: string[][], headerRow: number, config: MappingConfig): Promise<{ guesses: FileCategoryGuess[]; asked: number; left: number; options: { id: string; name: string }[]; total: number }> {
  const rows = toRows(matrix, headerRow, { ...config, rowCats: undefined }, await brandNamesFor(config, true));
  const todo = rows.filter((r) => !r.categoryId);
  if (!todo.length) throw new UserError("Όλες οι γραμμές έχουν ήδη κατηγορία από στήλη του αρχείου ή από το φύλλο.");
  const ids = [...new Set(todo.map((r) => r.brandId).filter((x): x is string => !!x))];
  const brands = new Map((await db.brand.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((b) => [b.id, b.name]));
  const label = (r: ForeignRow) => (r.fields.name || r.fields.shortDesc || r.fields.code || r.fields.factoryCode || "").trim();
  const res = await suggestProductCategories(todo.map((r) => ({
    key: String(r.rowNo), name: label(r), ...(r.brandId && brands.get(r.brandId) ? { brand: brands.get(r.brandId)! } : {}),
    extra: [r.fields.shortDesc, r.fields.descText?.slice(0, 120), Object.entries(r.specs).slice(0, 6).map(([k, v]) => `${k}: ${v}`).join(" · ")].filter(Boolean).join(" · "),
  })));
  const nameOf = new Map(todo.map((r) => [String(r.rowNo), label(r)]));
  return { guesses: res.guesses.map((g) => ({ rowNo: Number(g.key), label: nameOf.get(g.key) ?? "", categoryId: g.categoryId, sure: g.sure })), asked: res.asked, left: res.left, options: res.options, total: todo.length };
}

/** Καμία εγγραφή: ίδιοι κανόνες με το σχέδιο (κανόνας τιμής ανά μάρκα/κατηγορία, ΦΠΑ από αδελφά είδη, ομάδα από την κατηγορία). */
export async function liveCard(input: { brandId: string | null; categoryId: string | null; cost: string | null; rrp: string | null; specs: Record<string, string>; opts: EngineOpts }): Promise<LiveCard> {
  const [rules, cat, vats] = await Promise.all([
    db.markupRule.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } }),
    input.categoryId ? db.category.findUnique({ where: { id: input.categoryId }, select: { id: true, name: true, erpCode: true } }) : null,
    db.vatRate.findMany({ where: { s1Id: { not: null } }, select: { s1Id: true, percent: true } }),
  ]);
  const groupS1Id = cat ? await groupIdOf(cat) : null;
  const g = groupS1Id != null ? (await loadGroups([groupS1Id])).get(groupS1Id) : undefined;
  const rk = rekeySpecs(input.specs, g ? g.specs.map((s) => s.name) : null);
  // ΦΠΑ: ο συχνότερος των ειδών της ομάδας (όπως στα νέα είδη), αλλιώς 24%
  const vatOf = new Map(vats.map((v) => [v.s1Id!, Number(v.percent)]));
  const pair = groupS1Id != null ? (await db.s1Item.groupBy({ by: ["vatS1Id"], where: { specGroupS1Id: groupS1Id, missing: false }, _count: { _all: true } })).filter((v) => v.vatS1Id != null).sort((a, b) => b._count._all - a._count._all)[0] : undefined;
  const vat = (pair && vatOf.get(String(pair.vatS1Id))) ?? 24;
  const rule = pickRule(rules, input.brandId, input.categoryId);
  const names = rule ? await Promise.all([rule.brandId ? db.brand.findUnique({ where: { id: rule.brandId }, select: { name: true } }) : null, rule.categoryId ? db.category.findUnique({ where: { id: rule.categoryId }, select: { name: true } }) : null]) : [null, null];
  const pr = policyPrice({
    mode: input.opts.priceMode, vatIncluded: input.opts.policy.vatIncluded, markupPercent: input.opts.policy.markupPercent, cost: input.cost, rrp: input.rrp, vat,
    rule: rule ? { percent: rule.percent, rounding: ROUNDING.has(rule.rounding as Rounding) ? (rule.rounding as Rounding) : "none" } : null,
    label: rule ? ruleLabel(rule, { brand: names[0]?.name, category: names[1]?.name }) : "",
  });
  const noSource = input.opts.priceMode === "retail" ? "Το αρχείο δεν δίνει λιανική για αυτή τη γραμμή." : "Το αρχείο δεν δίνει κόστος για αυτή τη γραμμή.";
  return {
    price: pr.price ?? null, priceNote: pr.price ? null : pr.warning ?? noSource, category: cat?.name ?? null,
    group: g ? { name: g.name, specs: g.specs.map((s) => ({ name: s.name, value: rk.specs[s.name] ?? null })) } : null,
    extra: g ? Object.keys(input.specs).filter((l) => !g.specs.some((s) => labelKey(s.name) === labelKey(l))) : [],
  };
}
