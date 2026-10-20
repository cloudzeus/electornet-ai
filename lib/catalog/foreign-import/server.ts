import "server-only";
import { db } from "@/lib/db";
import { planImport, applyImport } from "@/lib/catalog/supplier-import";
import { planMedia, applyMedia, type MediaRow } from "@/lib/catalog/supplier-media";
import { loadGroups, groupOfCategory, FIELDS, type FieldKey, type ParsedRow } from "@/lib/catalog/supplier-sheet";
import { itemWriteEnabled, writeWebPrice } from "@/lib/softone/item-write";
import { parseMoney, pickRule, type Rounding } from "@/lib/catalog/pricing/markup";
import { toRows, resolveMatches, normEan, type ForeignRow, type MappingConfig, type MatchIndex } from "@/lib/catalog/foreign-import/core";
import { rowStatus, newDuplicates, rekeySpecs, ruleLabel, planPrice, mostCommon, type ForeignPlanRow, type RowStatus } from "@/lib/catalog/foreign-import/plan-core";

export type { ForeignPlanRow, RowStatus } from "@/lib/catalog/foreign-import/plan-core";

/**
 * Εισαγωγή από ξένο Excel — σχέδιο και εκτέλεση. Το `planForeign` βγάζει από τον αντιστοιχισμένο πίνακα μια κατάσταση ανά
 * γραμμή και την κρατά ως ImportJob (πρόχειρο). Το `applyForeign` ξαναϋπολογίζει το σχέδιο των γραμμών με φρέσκα δεδομένα
 * (δεν εμπιστεύεται το αποθηκευμένο) και εκτελεί: υπάρχοντα είδη μέσω της μηχανής του template σε «μόνο κενά», φωτογραφίες
 * μέσω της βιβλιοθήκης, τιμή web μόνο αν λείπει· νέα είδη → PendingItem για έγκριση. Με κλειστή εγγραφή στο SoftOne τα
 * στοιχεία του ERP μένουν «σε αναμονή» και δεν γράφεται τίποτα (ούτε στο κατάστημα)· οι φωτογραφίες περνούν κανονικά.
 */
type Stored = { foreign: ForeignRow[]; plan: ForeignPlanRow[]; headerRow: number; config: MappingConfig; results?: Record<number, string> };
type Ctx = { row: ForeignRow; plan: ForeignPlanRow; mtrl: number | null; groupS1Id: number | null; specs: Record<string, string>; parsed?: ParsedRow; media?: MediaRow };

const SHEET = "Εισαγωγή";
const keyOf = (rowNo: number) => `${SHEET}#${rowNo}`;
const LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.header])) as Record<FieldKey, string>;
const ROUNDING = new Set<Rounding>(["none", "int", "90", "99"]);
const short = (s: string) => (s.length > 70 ? `${s.slice(0, 67)}…` : s);
const mediaCount = (r: ForeignRow) => r.media.image.length + r.media.banner.length + r.media.video.length;

/** Το σχέδιο όλων των γραμμών με φρέσκα δεδομένα (καμία εγγραφή). */
async function compute(foreign: ForeignRow[], writeOn: boolean): Promise<Ctx[]> {
  // ---- αντιστοίχιση με το SoftOne ----
  const t = (s?: string) => (s ?? "").trim();
  const mtrls = foreign.map((r) => Number(t(r.fields.mtrl))).filter((n) => Number.isInteger(n) && n > 0);
  const codes = [...new Set(foreign.flatMap((r) => [t(r.fields.code), t(r.fields.factoryCode)]).filter(Boolean))];
  const eans = [...new Set(foreign.map((r) => (r.fields.barcode ? normEan(r.fields.barcode) : null)).filter((x): x is string => !!x))];
  const factory = [...new Set(foreign.map((r) => t(r.fields.factoryCode)).filter(Boolean))];
  const [items, brands, rules, vats] = await Promise.all([
    db.s1Item.findMany({
      where: { missing: false, OR: [{ mtrl: { in: mtrls } }, { code: { in: codes, mode: "insensitive" } }, { barcode: { in: eans } }, { factoryCode: { in: factory, mode: "insensitive" } }] },
      select: { mtrl: true, code: true, name: true, barcode: true, factoryCode: true, manufacturerS1Id: true, vatS1Id: true, specGroupS1Id: true, eshopPrice: true },
    }),
    db.brand.findMany({ select: { id: true, name: true, s1Id: true } }),
    db.markupRule.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } }),
    db.vatRate.findMany({ where: { s1Id: { not: null } }, select: { s1Id: true, percent: true } }),
  ]);
  const brandOfS1 = new Map(brands.filter((b) => b.s1Id).map((b) => [b.s1Id!, b.id]));
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  const vatOf = new Map(vats.map((v) => [v.s1Id!, Number(v.percent)]));
  const index: MatchIndex = { byMtrl: new Map(), byCode: new Map(), byEan: new Map(), byFactory: new Map() };
  for (const it of items) {
    index.byMtrl.set(it.mtrl, it.mtrl);
    if (!index.byCode.has(it.code.trim().toLowerCase())) index.byCode.set(it.code.trim().toLowerCase(), it.mtrl);
    const e = it.barcode ? normEan(it.barcode) : null;
    if (e && !index.byEan.has(e)) index.byEan.set(e, it.mtrl);
    const b = it.manufacturerS1Id != null ? brandOfS1.get(String(it.manufacturerS1Id)) : undefined;
    if (b && it.factoryCode?.trim()) { const k = `${b}|${it.factoryCode.trim().toLowerCase()}`; if (!index.byFactory.has(k)) index.byFactory.set(k, it.mtrl); }
  }
  const matches = resolveMatches(foreign, index);
  const mtrlOf = new Map(matches.map((m) => [m.rowNo, m.mtrl]));
  const itemOf = new Map(items.map((i) => [i.mtrl, i]));
  const dups = newDuplicates(foreign, mtrlOf);

  // ---- προϊόντα του καταστήματος, κατηγορίες, ομάδες χαρακτηριστικών ----
  const matched = [...new Set(matches.map((m) => m.mtrl).filter((x): x is number => x != null))];
  const newCats = [...new Set(foreign.filter((r) => mtrlOf.get(r.rowNo) == null && r.categoryId).map((r) => r.categoryId!))];
  const ruleCats = rules.map((r) => r.categoryId).filter((x): x is string => !!x);
  const [products, cats] = await Promise.all([
    db.product.findMany({ where: { erpCode: { in: matched.map(String) } }, select: { id: true, erpCode: true, brandId: true, categoryId: true } }),
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
    const sg = await db.s1Item.findMany({ where: { mtrl: { in: nums.map((p) => Number(p.erpCode)) }, missing: false }, select: { mtrl: true, specGroupS1Id: true } });
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
    return planPrice({
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
    let problem = m.problem ?? (m.mtrl == null ? dups.get(row.rowNo) : undefined) ?? null;
    let groupS1Id: number | null;
    if (it) {
      groupS1Id = it.specGroupS1Id;
      if (groupS1Id == null) problem ??= "Το είδος δεν έχει ομάδα χαρακτηριστικών στο SoftOne.";
      else if (!groups.has(groupS1Id)) problem ??= "Η ομάδα χαρακτηριστικών του είδους δεν υπάρχει πια στο SoftOne.";
    } else {
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
      c.parsed = { sheet: SHEET, rowNo: row.rowNo, groupS1Id: groupS1Id!, fields, specs: rk.specs };
      if (mediaCount(row)) c.media = { sheet: SHEET, rowNo: row.rowNo, groupS1Id, ids: { mtrl: String(it.mtrl) }, image: row.media.image, banner: row.media.banner, video: row.media.video };
      if (!(it.eshopPrice != null && it.eshopPrice > 0)) {
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

  // ---- υπάρχοντα: η μηχανή του template («μόνο κενά») και τα πολυμέσα ----
  const parsed = ctx.filter((c) => c.parsed).map((c) => c.parsed!);
  if (parsed.length) {
    const plan = await planImport({ meta: null, rows: parsed, warnings: [], sheets: [] }, { toSoftone: true, activate: false, onlyBlank: true });
    const byRow = new Map(plan.rows.map((r) => [r.rowNo, r]));
    for (const c of ctx) {
      const r = c.parsed ? byRow.get(c.row.rowNo) : undefined;
      if (!r) continue;
      c.plan.changes = r.changes; c.plan.warnings.push(...r.warnings);
      if (r.action === "error") { c.plan.problem = r.errors.join(" ") || "Σφάλμα στη γραμμή."; c.parsed = undefined; c.media = undefined; c.plan.price = undefined; }
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
  for (const c of ctx) c.plan.status = rowStatus({ problem: !!c.plan.problem, mtrl: c.mtrl, changes: c.plan.changes.length, price: !!c.plan.price, photos: c.plan.media, writeOn });
  return ctx;
}

const countStatus = (rows: ForeignPlanRow[]) => {
  const counts: Record<RowStatus, number> = { update: 0, unchanged: 0, new: 0, waiting: 0, problem: 0 };
  for (const r of rows) counts[r.status]++;
  return counts;
};

/** Σχέδιο εισαγωγής: κατάσταση ανά γραμμή, χωρίς καμία εγγραφή εκτός από το ImportJob (πρόχειρο). */
export async function planForeign(
  input: { fileName: string; sheet: string[][]; headerRow: number; config: MappingConfig; mappingId?: string | null },
  staffId: string | null,
): Promise<{ jobId: string; rows: ForeignPlanRow[]; writeOn: boolean }> {
  const foreign = toRows(input.sheet, input.headerRow, input.config);
  const writeOn = await itemWriteEnabled();
  const rows = (await compute(foreign, writeOn)).map((c) => c.plan);
  const stored: Stored = { foreign, plan: rows, headerRow: input.headerRow, config: input.config };
  const job = await db.importJob.create({ data: { fileName: input.fileName, mappingId: input.mappingId ?? null, rows: stored as object, counts: countStatus(rows), status: "draft", createdById: staffId }, select: { id: true } });
  return { jobId: job.id, rows, writeOn };
}

/**
 * Εκτέλεση των επιλεγμένων γραμμών. done = υπάρχοντα που ενημερώθηκαν χωρίς σφάλμα· waiting = υπάρχοντα με στοιχεία/τιμή
 * για το SoftOne που περιμένουν να ανοίξει η εγγραφή (οι φωτογραφίες τους έχουν ήδη περάσει)· pending = νέα είδη στην
 * αναμονή έγκρισης (ξανά-εκτέλεση δεν φτιάχνει δεύτερο PendingItem).
 */
export async function applyForeign(jobId: string, rowNos: number[], staffId: string | null): Promise<{ done: number; waiting: number; pending: number; errors: { rowNo: number; error: string }[] }> {
  const job = await db.importJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Η εισαγωγή δεν βρέθηκε.");
  const stored = job.rows as unknown as Stored;
  const writeOn = await itemWriteEnabled();
  const ctx = await compute(stored.foreign, writeOn);
  const want = new Set(rowNos);
  const sel = ctx.filter((c) => want.has(c.row.rowNo));
  const errors: { rowNo: number; error: string }[] = [];
  for (const n of want) if (!sel.some((c) => c.row.rowNo === n)) errors.push({ rowNo: n, error: "Η γραμμή δεν υπάρχει στην εισαγωγή." });
  const rowErr = new Map<number, string[]>();
  const fail = (rowNo: number, msg: string) => rowErr.set(rowNo, [...(rowErr.get(rowNo) ?? []), msg]);
  const results: Record<number, string> = { ...(stored.results ?? {}) };

  const existing = sel.filter((c) => c.mtrl != null && !c.plan.problem);
  if (writeOn) {
    const withChanges = existing.filter((c) => c.parsed && c.plan.changes.length);
    if (withChanges.length) {
      const res = await applyImport({ meta: null, rows: withChanges.map((c) => c.parsed!), warnings: [], sheets: [] }, { toSoftone: true, activate: false, onlyBlank: true }, withChanges.map((c) => keyOf(c.row.rowNo)));
      for (const r of res) if (!r.ok) fail(Number(r.key.split("#")[1]), r.message);
    }
    for (const c of existing.filter((x) => x.plan.price)) {
      const w = await writeWebPrice(c.mtrl!, c.plan.price!.price, { onlyIfBlank: true });
      if (!w.ok) fail(c.row.rowNo, `Τιμή web: ${w.error ?? "δεν γράφτηκε."}`);
    }
  }
  // Φωτογραφίες: τρέχουν και με το SoftOne σε αναμονή (μόνο προσθήκη, ποτέ αντικατάσταση)
  const withMedia = existing.filter((c) => c.media);
  if (withMedia.length) {
    const res = await applyMedia(withMedia.map((c) => c.media!), withMedia.map((c) => keyOf(c.row.rowNo)), false, staffId);
    for (const r of res) if (!r.ok) fail(Number(r.key.split("#")[1]), r.message);
  }

  let done = 0, waiting = 0, pending = 0;
  for (const c of sel) {
    const n = c.row.rowNo;
    if (c.plan.status === "problem") { errors.push({ rowNo: n, error: c.plan.problem ?? "Πρόβλημα στη γραμμή." }); results[n] = "error"; continue; }
    if (c.plan.status === "new") {
      const r = c.row, price = c.plan.price;
      const ex = await db.pendingItem.findFirst({ where: { jobId, rowNo: n }, select: { id: true } });
      if (!ex) {
        const fields = { ...r.fields };
        const e = fields.barcode ? normEan(fields.barcode) : null;
        if (e) fields.barcode = e;
        await db.pendingItem.create({ data: {
          jobId, rowNo: n, code: (r.fields.code || r.fields.factoryCode || "").trim(), fields, specs: c.specs, media: r.media,
          brandId: r.brandId, specGroupS1Id: c.groupS1Id, webCategoryId: r.categoryId,
          cost: r.cost ? parseMoney(r.cost) : null, rrp: r.rrp ? parseMoney(r.rrp) : null, price: price?.price ?? null,
        } });
      }
      pending++; results[n] = "pending"; continue;
    }
    const errs = rowErr.get(n);
    if (errs) { errors.push({ rowNo: n, error: errs.join(" · ") }); results[n] = "error"; }
    else if (c.plan.status === "waiting") { waiting++; results[n] = "waiting"; }
    else if (c.plan.status === "update") { done++; results[n] = "done"; }
    else results[n] = "unchanged";
  }

  const plan = ctx.map((c) => c.plan);
  await db.importJob.update({ where: { id: jobId }, data: {
    status: errors.length || waiting ? "partial" : "applied",
    counts: { ...countStatus(plan), applied: { done, waiting, pending, errors: errors.length } },
    rows: { ...stored, plan, results } as object,
  } });
  return { done, waiting, pending, errors };
}
