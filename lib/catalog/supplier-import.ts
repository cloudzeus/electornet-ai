import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { parseDescription } from "@/lib/softone/describe";
import { syncItem } from "@/lib/softone/catalog";
import { projectItem, projectFacetValues } from "@/lib/softone/project";
import { writeItem, createItem, type ItemChanges, type ItemField } from "@/lib/softone/item-write";
import { FIELDS, plain, itemValues, loadGroups, composeMemo, memoIsHtml, type FieldKey, type ParsedFile, type ParsedRow } from "@/lib/catalog/supplier-sheet";

/**
 * Μαζική εισαγωγή από template προμηθευτή. Δύο βήματα, και τα δύο υπολογίζονται από το ίδιο το αρχείο (τίποτα δεν
 * αποθηκεύεται ενδιάμεσα): `planImport` — τι θα γίνει σε κάθε γραμμή, χωρίς καμία εγγραφή· `applyImport` — εκτελεί τις
 * γραμμές που ζητήθηκαν, σε μικρές παρτίδες ώστε η οθόνη να δείχνει πρόοδο.
 *
 * Με «και στο SoftOne» οι αλλαγές γράφονται στο ERP (με έλεγχο σύγκρουσης και επαλήθευση) και το κατάστημα ενημερώνεται
 * από εκεί. Χωρίς αυτό γράφεται μόνο το κατάστημα — σε προϊόν του SoftOne η αλλαγή χάνεται όταν αλλάξει το είδος στο ERP.
 */
export interface ImportOptions { brandId?: string; toSoftone: boolean; activate: boolean }
export interface Change { label: string; from: string; to: string }
export interface PlanRow {
  key: string; sheet: string; rowNo: number; groupS1Id: number; group: string;
  action: "create" | "update" | "unchanged" | "error";
  title: string; mtrl?: number; code?: string; productId?: string;
  changes: Change[]; errors: string[]; warnings: string[];
}
export interface Plan { brand: { id: string; name: string; s1Id: string | null } | null; kind: "existing" | "new" | "media" | null; rows: PlanRow[]; warnings: string[]; counts: Record<PlanRow["action"], number> }

const LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.header])) as Record<FieldKey, string>;
const KIND = Object.fromEntries(FIELDS.map((f) => [f.key, f.kind])) as Record<FieldKey, "text" | "int" | "num">;
const EDITABLE: FieldKey[] = ["name", "barcode", "factoryCode", "shortDesc", "descText", "guaranteeMonths", "widthCm", "heightCm", "lengthCm", "weightKg"];
const toNum = (s: string) => { const n = Number(s.replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; };
const normField = (k: FieldKey, s: string | undefined | null) => {
  const v = (s ?? "").replace(/\r\n?/g, "\n").trim();
  if (!v) return "";
  if (KIND[k] === "text") return v.replace(/[ \t]+$/gm, "");
  const n = toNum(v); return Number.isFinite(n) && n !== 0 ? String(Math.round(n * 1000) / 1000) : v;
};
const short = (s: string) => (s.length > 70 ? `${s.slice(0, 67)}…` : s);

/** Ό,τι χρειάζεται και ο έλεγχος και η εκτέλεση: γραμμές με όλες τις αποφάσεις τους. */
async function decide(file: ParsedFile, opts: ImportOptions) {
  const brandId = file.meta?.brandId ?? opts.brandId;
  const brand = brandId ? await db.brand.findUnique({ where: { id: brandId }, select: { id: true, name: true, s1Id: true } }) : null;
  const warnings = [...file.warnings];
  if (!brand) warnings.push("Δεν ξέρουμε σε ποια μάρκα ανήκει το αρχείο — διάλεξε μάρκα.");
  const groups = await loadGroups([...new Set(file.rows.map((r) => r.groupS1Id))]);
  const mtrls = file.rows.map((r) => Number(r.fields.mtrl)).filter((n) => Number.isInteger(n) && n > 0);
  const [items, products, barcodeRows, codeRows] = await Promise.all([
    db.s1Item.findMany({ where: { mtrl: { in: mtrls } } }),
    db.product.findMany({ where: { erpCode: { in: mtrls.map(String) } }, select: { id: true, erpCode: true, brandId: true, title: true } }),
    db.s1Item.findMany({ where: { barcode: { in: file.rows.map((r) => r.fields.barcode).filter((x): x is string => !!x) } }, select: { mtrl: true, barcode: true } }),
    db.s1Item.findMany({ where: { code: { in: file.rows.flatMap((r) => [r.fields.code, r.fields.factoryCode]).filter((x): x is string => !!x) } }, select: { mtrl: true, code: true } }),
  ]);
  const itemOf = new Map(items.map((i) => [i.mtrl, i]));
  const productOf = new Map(products.map((p) => [p.erpCode, p]));
  const seenBarcode = new Map<string, string>(), seenCode = new Map<string, string>();

  const rows = file.rows.map((r) => {
    const g = groups.get(r.groupS1Id)!;
    const out: PlanRow & { raw: ParsedRow; item?: (typeof items)[number]; memo?: string; fieldTo: Partial<Record<FieldKey, string>>; specTo: { label: string; value: string }[] } =
      { key: `${r.sheet}#${r.rowNo}`, sheet: r.sheet, rowNo: r.rowNo, groupS1Id: r.groupS1Id, group: g.name, action: "unchanged", title: r.fields.name ?? "", changes: [], errors: [], warnings: [], raw: r, fieldTo: {}, specTo: [] };
    for (const k of ["guaranteeMonths", "widthCm", "heightCm", "lengthCm", "weightKg"] as FieldKey[]) {
      const v = r.fields[k]; if (v && (!Number.isFinite(toNum(v)) || toNum(v) < 0)) out.errors.push(`«${LABEL[k]}»: «${v}» δεν είναι αριθμός.`);
    }
    if ((r.fields.name ?? "").length > 128) out.errors.push(`Το όνομα έχει ${r.fields.name!.length} χαρακτήρες (έως 128).`);
    const mtrl = r.fields.mtrl ? Number(r.fields.mtrl) : null;
    // Το barcode ελέγχεται μόνο όταν είναι καινούργιο ή αλλάζει — διπλά που ήδη υπάρχουν στο ERP δεν μπλοκάρουν άλλες αλλαγές
    const barcodeNew = !!r.fields.barcode && (mtrl == null || itemOf.get(mtrl)?.barcode?.trim() !== r.fields.barcode);
    if (barcodeNew) {
      const b = r.fields.barcode!, prev = seenBarcode.get(b);
      if (prev) out.errors.push(`Το barcode ${b} υπάρχει και στη γραμμή ${prev}.`); else seenBarcode.set(b, `${r.sheet} ${r.rowNo}`);
      if (!/^\d{8,14}$/.test(b)) out.warnings.push(`Το barcode «${b}» δεν μοιάζει με EAN (8–14 ψηφία).`);
    }

    if (mtrl != null) {
      // ---- υπάρχον είδος ----
      out.mtrl = mtrl;
      const it = itemOf.get(mtrl), p = productOf.get(String(mtrl));
      if (!Number.isInteger(mtrl) || !it || it.missing) { out.action = "error"; out.errors.push(`Δεν βρέθηκε είδος με MTRL ${r.fields.mtrl} στο SoftOne.`); return out; }
      out.item = it; out.productId = p?.id; out.code = it.code; out.title = it.name;
      if (brand && p && p.brandId !== brand.id) out.warnings.push("Το προϊόν ανήκει σε άλλη μάρκα από το αρχείο.");
      if (it.specGroupS1Id !== g.s1Id) out.warnings.push("Το είδος είναι σε άλλη κατηγορία στο SoftOne — η κατηγορία δεν αλλάζει από εδώ.");
      if (r.fields.code && r.fields.code !== it.code) out.warnings.push(`Ο κωδικός δεν αλλάζει από εδώ (μένει ${it.code}).`);
      if (barcodeNew && barcodeRows.some((b) => b.barcode === r.fields.barcode && b.mtrl !== mtrl)) out.errors.push(`Το barcode ${r.fields.barcode} ανήκει σε άλλο είδος (MTRL ${barcodeRows.find((b) => b.barcode === r.fields.barcode && b.mtrl !== mtrl)!.mtrl}).`);
      const cur = itemValues(it, g);
      for (const k of EDITABLE) {
        const to = normField(k, r.fields[k]); if (!to) continue; // κενό = καμία αλλαγή
        const from = normField(k, cur.fields[k]);
        if (to !== from) { out.fieldTo[k] = to; out.changes.push({ label: LABEL[k], from: short(from || "—"), to: short(to) }); }
      }
      for (const d of g.specs) {
        const to = (r.specs[d.name] ?? "").trim(); if (!to) continue;
        const from = (cur.specs[d.name] ?? "").trim();
        if (to !== from) { out.specTo.push({ label: d.name, value: to }); out.changes.push({ label: d.name, from: from || "—", to }); }
      }
      if ((out.specTo.length || out.fieldTo.descText != null) && memoIsHtml(it.longDesc)) {
        out.warnings.push("Η αναλυτική περιγραφή του είδους είναι HTML — περιγραφή και χαρακτηριστικά δεν αλλάζουν από το αρχείο.");
        out.changes = out.changes.filter((c) => c.label !== LABEL.descText && !out.specTo.some((s) => s.label === c.label));
        out.specTo = []; delete out.fieldTo.descText;
      } else if (out.specTo.length || out.fieldTo.descText != null) out.memo = composeMemo(it.longDesc ?? "", out.specTo, out.fieldTo.descText);
      out.action = out.errors.length ? "error" : out.changes.length ? "update" : "unchanged";
      return out;
    }

    // ---- νέο είδος ----
    const code = (r.fields.code || r.fields.factoryCode || "").trim();
    out.code = code || undefined;
    if (!r.fields.name) out.errors.push("Λείπει το όνομα.");
    if (opts.toSoftone && !code) out.errors.push("Για το SoftOne χρειάζεται κωδικός είδους ή κωδικός κατασκευαστή.");
    if (opts.toSoftone && !brand?.s1Id) out.errors.push("Η μάρκα δεν είναι συνδεδεμένη με κατασκευαστή του SoftOne — το είδος δεν μπορεί να δημιουργηθεί εκεί.");
    if (code) {
      const prev = seenCode.get(code.toLowerCase());
      if (prev) out.errors.push(`Ο κωδικός «${code}» υπάρχει και στη γραμμή ${prev}.`); else seenCode.set(code.toLowerCase(), `${r.sheet} ${r.rowNo}`);
      const dup = codeRows.find((c) => c.code.toLowerCase() === code.toLowerCase());
      if (dup) out.errors.push(`Ο κωδικός «${code}» υπάρχει ήδη στο SoftOne (MTRL ${dup.mtrl}).`);
    }
    const dupB = r.fields.barcode ? barcodeRows.find((b) => b.barcode === r.fields.barcode) : undefined;
    if (dupB) out.errors.push(`Το barcode ${r.fields.barcode} υπάρχει ήδη (MTRL ${dupB.mtrl}) — για αλλαγές σε υπάρχον προϊόν χρησιμοποίησε το αρχείο «Υπάρχοντα».`);
    for (const k of EDITABLE) { const v = normField(k, r.fields[k]); if (v) { out.fieldTo[k] = v; out.changes.push({ label: LABEL[k], from: "—", to: short(v) }); } }
    for (const d of g.specs) { const v = (r.specs[d.name] ?? "").trim(); if (v) { out.specTo.push({ label: d.name, value: v }); out.changes.push({ label: d.name, from: "—", to: v }); } }
    out.memo = composeMemo("", out.specTo, out.fieldTo.descText);
    out.action = out.errors.length ? "error" : "create";
    return out;
  });
  return { brand, warnings, rows };
}

export async function planImport(file: ParsedFile, opts: ImportOptions): Promise<Plan> {
  const d = await decide(file, opts);
  const rows: PlanRow[] = d.rows.map(({ raw, item, memo, fieldTo, specTo, ...r }) => (void raw, void item, void memo, void fieldTo, void specTo, r));
  const counts = { create: 0, update: 0, unchanged: 0, error: 0 };
  for (const r of rows) counts[r.action]++;
  return { brand: d.brand, kind: file.meta?.kind ?? null, rows, warnings: d.warnings, counts };
}

// ---------- Εκτέλεση ----------

export interface ApplyResult { key: string; ok: boolean; message: string; mtrl?: number; productId?: string }

const FIELD_TO_ITEM: Partial<Record<FieldKey, ItemField>> = { name: "name", barcode: "barcode", factoryCode: "factoryCode", shortDesc: "shortDesc", guaranteeMonths: "guaranteeMonths", widthCm: "widthCm", heightCm: "heightCm", lengthCm: "lengthCm", weightKg: "weightKg" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function applyImport(file: ParsedFile, opts: ImportOptions, keys: string[]): Promise<ApplyResult[]> {
  const d = await decide(file, opts);
  const want = new Set(keys);
  const out: ApplyResult[] = [];
  const groups = await loadGroups([...new Set(d.rows.map((r) => r.groupS1Id))]);
  for (const r of d.rows.filter((x) => want.has(x.key))) {
    if (r.action === "error") { out.push({ key: r.key, ok: false, message: r.errors.join(" ") }); continue; }
    if (r.action === "unchanged") { out.push({ key: r.key, ok: true, message: "Καμία αλλαγή." }); continue; }
    try {
      if (r.action === "update") out.push({ key: r.key, ...(opts.toSoftone ? await updateInSoftone(r) : await updateEshopOnly(r)) });
      else out.push({ key: r.key, ...(opts.toSoftone ? await createInSoftone(r, d.brand!, groups.get(r.groupS1Id)!, opts) : await createEshopOnly(r, d.brand!, opts)) });
    } catch (e) { out.push({ key: r.key, ok: false, message: (e as Error).message }); }
    if (opts.toSoftone) await sleep(150);
  }
  // Μόνο στο eshop: τα φίλτρα της κατηγορίας ξαναϋπολογίζονται εδώ (για το SoftOne το κάνει η προβολή του είδους)
  if (!opts.toSoftone) {
    const done = new Set(out.filter((r) => r.ok && r.productId).map((r) => r.productId!));
    const cats = await db.product.findMany({ where: { id: { in: [...done] } }, select: { categoryId: true }, distinct: ["categoryId"] });
    for (const c of cats) await projectFacetValues(c.categoryId);
  }
  return out;
}

type Decided = Awaited<ReturnType<typeof decide>>["rows"][number];

async function updateInSoftone(r: Decided) {
  const it = r.item!;
  const changes: ItemChanges = {};
  for (const [k, f] of Object.entries(FIELD_TO_ITEM) as [FieldKey, ItemField][]) if (r.fieldTo[k] != null) changes[f] = { from: (it as unknown as Record<string, string | number | null>)[f] ?? null, to: KIND[k] === "text" ? r.fieldTo[k]! : toNum(r.fieldTo[k]!) };
  if (r.memo != null) changes.longDesc = { from: it.longDesc, to: r.memo };
  const w = await writeItem(it.mtrl, changes);
  if (!w.ok) return { ok: false, mtrl: it.mtrl, message: w.error ?? "Δεν γράφτηκε." };
  await syncItem(it.mtrl, "manual");
  const p = await projectItem(it.mtrl);
  return { ok: true, mtrl: it.mtrl, productId: p.productId, message: `Γράφτηκαν στο SoftOne και στο κατάστημα: ${r.changes.map((c) => c.label).join(", ")}.` };
}

async function updateEshopOnly(r: Decided) {
  if (!r.productId) return { ok: false, mtrl: r.mtrl, message: "Το είδος δεν έχει ακόμη προϊόν στο κατάστημα." };
  const p = await db.product.findUnique({ where: { id: r.productId }, select: { id: true, brand: { select: { name: true } }, dimensions: true, specs: { select: { id: true, key: true } } } });
  if (!p) return { ok: false, message: "Το προϊόν δεν βρέθηκε." };
  const skipped: string[] = [];
  const data: Record<string, unknown> = {};
  if (r.fieldTo.name) data.title = plain(r.fieldTo.name).includes(plain(p.brand.name)) ? r.fieldTo.name : `${p.brand.name} ${r.fieldTo.name}`;
  if (r.fieldTo.barcode) data.ean = r.fieldTo.barcode;
  if (r.fieldTo.shortDesc) data.summary = r.fieldTo.shortDesc;
  if (r.memo != null) data.description = parseDescription(r.memo).text || null;
  if (r.fieldTo.factoryCode) skipped.push("κωδικός κατασκευαστή");
  if (r.fieldTo.guaranteeMonths) skipped.push("εγγύηση");
  if (r.fieldTo.weightKg) skipped.push("βάρος");
  await db.$transaction(async (tx) => {
    if (Object.keys(data).length) await tx.product.update({ where: { id: p.id }, data });
    for (const s of r.specTo) {
      const ex = p.specs.filter((x) => plain(x.key) === plain(s.label));
      if (ex.length) await tx.spec.updateMany({ where: { id: { in: ex.map((x) => x.id) } }, data: { value: s.value } });
      else await tx.spec.create({ data: { productId: p.id, groupName: "Τεχνικά χαρακτηριστικά", key: s.label, value: s.value, sortNo: 900, source: "import" } });
    }
    if (r.fieldTo.widthCm || r.fieldTo.heightCm || r.fieldTo.lengthCm) {
      const base = p.dimensions.find((x) => x.source === "manual") ?? p.dimensions.find((x) => x.source === "s1-desc");
      const w = r.fieldTo.widthCm ? toNum(r.fieldTo.widthCm) : base?.w, h = r.fieldTo.heightCm ? toNum(r.fieldTo.heightCm) : base?.h, dd = r.fieldTo.lengthCm ? toNum(r.fieldTo.lengthCm) : base?.d;
      if (w && h && dd) await tx.productDimension.upsert({ where: { productId_source: { productId: p.id, source: "manual" } }, create: { productId: p.id, source: "manual", w, h, d: dd, rawKey: "Εισαγωγή excel" }, update: { w, h, d: dd, rawKey: "Εισαγωγή excel" } });
      else skipped.push("διαστάσεις (χρειάζονται και οι τρεις)");
    }
  });
  return { ok: true, mtrl: r.mtrl, productId: p.id, message: `Μόνο στο κατάστημα${skipped.length ? ` · δεν γράφτηκαν (υπάρχουν μόνο στο SoftOne): ${skipped.join(", ")}` : ""}. Θα αντικατασταθούν αν αλλάξει το είδος στο SoftOne.` };
}

async function createInSoftone(r: Decided, brand: { id: string; s1Id: string | null }, g: { s1Id: number; cat1: number | null; cat2: number | null }, opts: ImportOptions) {
  // ΦΠΑ, μονάδα, ομάδα, εμπορική κατηγορία από το πιο πρόσφατο είδος της ίδιας ομάδας (κατά προτίμηση της ίδιας μάρκας)
  const manufacturer = Number(brand.s1Id);
  const sib = await db.s1Item.findFirst({ where: { specGroupS1Id: g.s1Id, manufacturerS1Id: manufacturer, missing: false }, orderBy: { mtrl: "desc" } })
    ?? await db.s1Item.findFirst({ where: { specGroupS1Id: g.s1Id, missing: false }, orderBy: { mtrl: "desc" } });
  if (!sib) return { ok: false, message: "Η κατηγορία δεν έχει κανένα είδος στο SoftOne για να πάρουμε ΦΠΑ / μονάδα / ομάδα — δημιούργησε το πρώτο στο ERP." };
  const fields: Partial<Record<ItemField, string | number | boolean | null>> = { active: opts.activate };
  for (const [k, f] of Object.entries(FIELD_TO_ITEM) as [FieldKey, ItemField][]) if (r.fieldTo[k] != null) fields[f] = KIND[k] === "text" ? r.fieldTo[k]! : toNum(r.fieldTo[k]!);
  if (r.memo) fields.longDesc = r.memo;
  const c = await createItem({ code: r.code!, fields, refs: { manufacturer, specGroup: g.s1Id, webCat1: g.cat1, webCat2: g.cat2, vat: sib.vatS1Id, unit: sib.unitS1Id, itemGroup: sib.itemGroup, commCategory: sib.commCategory, mark: sib.manufacturerS1Id === manufacturer ? sib.markS1Id : null } });
  if (!c.ok) return { ok: false, mtrl: c.mtrl, message: c.error ?? "Δεν δημιουργήθηκε." };
  await syncItem(c.mtrl!, "manual");
  const p = await projectItem(c.mtrl!);
  return { ok: true, mtrl: c.mtrl, productId: p.productId, message: `Νέο είδος στο SoftOne (MTRL ${c.mtrl}, κωδικός ${r.code})${p.productId ? " και στο κατάστημα" : " — το κατάστημα θα το πάρει στον επόμενο συγχρονισμό"}${opts.activate ? "" : " · ανενεργό μέχρι να το ενεργοποιήσεις"}.` };
}

async function createEshopOnly(r: Decided, brand: { id: string; name: string }, opts: ImportOptions) {
  const cat = await db.category.findUnique({ where: { erpCode: `s1:g:${r.groupS1Id}` }, select: { id: true } });
  if (!cat) return { ok: false, message: "Η κατηγορία δεν υπάρχει ακόμη στο κατάστημα." };
  const name = r.fieldTo.name!;
  const title = plain(name).includes(plain(brand.name)) ? name : `${brand.name} ${name}`;
  const base = slugify(title).slice(0, 90).replace(/-+$/, "") || "proion";
  let slug = base; for (let i = 2; await db.product.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`;
  let sku = r.code || r.fieldTo.barcode || `IMP-${randomUUID().slice(0, 8)}`; for (let i = 2; await db.product.findUnique({ where: { sku }, select: { id: true } }); i++) sku = `${r.code || "IMP"}-${i}`;
  const parsed = parseDescription(r.memo ?? "");
  const w = r.fieldTo.widthCm ? toNum(r.fieldTo.widthCm) : 0, h = r.fieldTo.heightCm ? toNum(r.fieldTo.heightCm) : 0, dd = r.fieldTo.lengthCm ? toNum(r.fieldTo.lengthCm) : 0;
  const p = await db.product.create({ data: {
    erpCode: `imp-${randomUUID()}`, slug, sku, title, ean: r.fieldTo.barcode ?? null, brandId: brand.id, categoryId: cat.id, summary: r.fieldTo.shortDesc ?? null, description: parsed.text || null, active: opts.activate, source: "import",
    specs: { create: r.specTo.map((s, i) => ({ groupName: "Τεχνικά χαρακτηριστικά", key: s.label, value: s.value, sortNo: i, source: "import" })) },
    ...(w && h && dd ? { dimensions: { create: { source: "manual", w, h, d: dd, rawKey: "Εισαγωγή excel" } } } : {}),
  }, select: { id: true } });
  return { ok: true, productId: p.id, message: `Νέο προϊόν μόνο στο κατάστημα${opts.activate ? "" : " (ανενεργό)"} — δεν έχει τιμή ούτε απόθεμα μέχρι να δημιουργηθεί και στο SoftOne.` };
}
