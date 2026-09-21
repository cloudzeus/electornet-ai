import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { logged, type Trigger } from "@/lib/softone/catalog";
import { parseDescription, energyFromSpecs } from "@/lib/softone/describe";

/**
 * Προβολή του καθρέφτη του SoftOne στο κατάστημα (Category / Product / Spec /
 * Facet / EnergyLabel). Δεν μιλά ποτέ με το ERP: διαβάζει μόνο τους πίνακες S1*.
 *
 * Δέντρο κατηγοριών, τρία επίπεδα όπως τα έχει ο πελάτης:
 *   Master (CCCWEBCATEGORY1) › Main (CCCWEBCATEGORY2) › τύπος προϊόντος (CCCWEBGRSPECS)
 * Κάθε είδος ανήκει στον τύπο του· κάθε τύπος ανήκει σε μία μόνο Main κατηγορία
 * (ελεγμένο στα πραγματικά δεδομένα: καμία εξαίρεση).
 *
 * Κανόνες που δεν παραβιάζονται:
 * - **Το slug δεν αλλάζει ποτέ** αφού δοθεί (SEO, σελιδοδείκτες) — ακόμη κι αν αλλάξει το όνομα στο ERP.
 * - **Τίποτα δεν διαγράφεται.** Ό,τι χάθηκε ή απενεργοποιήθηκε γίνεται `active=false`
 *   (παραγγελίες, κριτικές και wishlist δείχνουν σε αυτά τα προϊόντα).
 * - Η προβολή αγγίζει μόνο δικές της εγγραφές (`source`): χαρακτηριστικά, φίλτρα και
 *   ετικέτες που έβαλε διαχειριστής ή το EPREL μένουν όπως είναι. Το ίδιο και τα `metaTitle/metaDesc`.
 * - Ίδιο αποτύπωμα (`s1Hash`) = καμία εγγραφή. Ο δεύτερος γύρος χωρίς αλλαγές δεν γράφει τίποτα.
 *
 * Τι ΔΕΝ προβάλλεται ακόμη, γιατί δεν υπάρχει στον καθρέφτη: τιμή, απόθεμα
 * (άρα κανένα `Variant`) και φωτογραφίες. Βλ. docs/softone-catalog-sync.md §5.
 */
export const PROJECT_VERSION = 1;
const SOURCE = "softone";
const DESC_SOURCE = "s1-desc";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const sha = (v: unknown) => createHash("sha1").update(JSON.stringify(v)).digest("hex");
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ς/g, "σ").trim();

/** Μοναδικό slug μέσα σε ένα σύνολο· η σύγκρουση λύνεται με το `suffix` (γονέας ή κωδικός), ποτέ με τυχαίο αριθμό. */
function uniqueSlug(base: string, suffix: string, taken: Set<string>, fallback: string) {
  let slug = base || fallback;
  if (taken.has(slug)) slug = [base, suffix].filter(Boolean).join("-") || fallback;
  for (let i = 2; taken.has(slug); i++) slug = `${base || fallback}-${suffix}-${i}`;
  taken.add(slug);
  return slug;
}

// ---------- Κατηγορίες ----------

interface CatNode { erpCode: string; name: string; parent: string | null; depth: number; sortNo: number; s1Active: boolean }

async function projectCategories() {
  const [cats, groups, existing] = await Promise.all([
    db.s1WebCategory.findMany({ orderBy: [{ level: "asc" }, { parentS1Id: "asc" }, { s1Id: "asc" }] }),
    db.s1SpecGroup.findMany({ orderBy: { s1Id: "asc" } }),
    db.category.findMany({ select: { id: true, erpCode: true, slug: true, name: true, parentId: true, depth: true, sortNo: true, source: true } }),
  ]);
  const nodes: CatNode[] = [
    ...cats.filter((c) => c.level === 1).map((c) => ({ erpCode: `s1:1:${c.s1Id}`, name: clean(c.name), parent: null, depth: 0, sortNo: c.s1Id, s1Active: c.active && !c.missing })),
    ...cats.filter((c) => c.level === 2).map((c) => ({ erpCode: `s1:2:${c.parentS1Id}:${c.s1Id}`, name: clean(c.name), parent: `s1:1:${c.parentS1Id}`, depth: 1, sortNo: c.s1Id, s1Active: c.active && !c.missing })),
    ...groups.filter((g) => g.cat1 != null && g.cat2 != null).map((g) => ({ erpCode: `s1:g:${g.s1Id}`, name: clean(g.name), parent: `s1:2:${g.cat1}:${g.cat2}`, depth: 2, sortNo: g.s1Id, s1Active: g.active && !g.missing })),
  ];
  const byCode = new Map(existing.filter((e) => e.erpCode).map((e) => [e.erpCode!, e]));
  const taken = new Set(existing.map((e) => e.slug));
  const idOf = new Map<string, string>(existing.filter((e) => e.erpCode).map((e) => [e.erpCode!, e.id]));
  const slugOf = new Map<string, string>(existing.filter((e) => e.erpCode).map((e) => [e.erpCode!, e.slug]));
  let created = 0, updated = 0, skipped = 0;
  // Κατά επίπεδο: ο γονέας πρέπει να υπάρχει πριν από το παιδί
  for (const depth of [0, 1, 2]) {
    for (const n of nodes.filter((x) => x.depth === depth)) {
      const parentId = n.parent ? idOf.get(n.parent) ?? null : null;
      if (n.parent && !parentId) { skipped++; continue; } // ορφανό: η Main/Master του δεν υπάρχει στον καθρέφτη
      const e = byCode.get(n.erpCode);
      if (!e) {
        // Σύγκρουση: επίθημα ο γονέας («akoystika-tilefonia»). Όταν ο τύπος έχει το ίδιο όνομα με την κατηγορία του («Ψυγεία › Ψυγεία»), «-typos» αντί για «psygeia-psygeia»
        const base = slugify(n.name), parentSlug = n.parent ? slugOf.get(n.parent) ?? "" : "";
        const slug = uniqueSlug(base, base === parentSlug ? "typos" : parentSlug, taken, `katigoria-${n.erpCode.replace(/[^0-9]+/g, "-").replace(/^-/, "")}`);
        const c = await db.category.create({ data: { erpCode: n.erpCode, slug, name: n.name, parentId, depth, sortNo: n.sortNo, source: SOURCE, s1SyncedAt: new Date() } });
        idOf.set(n.erpCode, c.id); slugOf.set(n.erpCode, slug); created++;
      } else if (e.name !== n.name || e.parentId !== parentId || e.depth !== depth || e.sortNo !== n.sortNo || e.source !== SOURCE) {
        await db.category.update({ where: { id: e.id }, data: { name: n.name, parentId, depth, sortNo: n.sortNo, source: SOURCE, s1SyncedAt: new Date() } }); // το slug μένει
        updated++;
      }
    }
  }
  return { nodes, idOf, created, updated, skipped };
}

/** Μετρητές και ορατότητα: ενεργή = ενεργή στο ERP ΚΑΙ με τουλάχιστον ένα ενεργό προϊόν στο υποδέντρο. */
async function refreshCategoryCounts(nodes: CatNode[], idOf: Map<string, string>) {
  const direct = new Map((await db.product.groupBy({ by: ["categoryId"], where: { active: true }, _count: { _all: true } })).map((r) => [r.categoryId, r._count._all]));
  const total = new Map<string, number>();
  for (const n of nodes) total.set(n.erpCode, direct.get(idOf.get(n.erpCode) ?? "") ?? 0);
  for (const depth of [2, 1]) for (const n of nodes.filter((x) => x.depth === depth && x.parent)) total.set(n.parent!, (total.get(n.parent!) ?? 0) + (total.get(n.erpCode) ?? 0));
  const current = new Map((await db.category.findMany({ where: { source: SOURCE }, select: { id: true, erpCode: true, active: true, productCount: true } })).map((c) => [c.erpCode!, c]));
  const live = new Set(nodes.map((n) => n.erpCode));
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const n of nodes) {
    const c = current.get(n.erpCode); if (!c) continue;
    const productCount = total.get(n.erpCode) ?? 0, active = n.s1Active && productCount > 0;
    if (c.active !== active || c.productCount !== productCount) ops.push(db.category.update({ where: { id: c.id }, data: { active, productCount } }));
  }
  // Κατηγορίες που δεν υπάρχουν πια στον καθρέφτη: κρύβονται, δεν σβήνονται
  for (const [code, c] of current) if (!live.has(code) && c.active) ops.push(db.category.update({ where: { id: c.id }, data: { active: false } }));
  for (const part of chunk(ops, 100)) await db.$transaction(part);
  return { visible: nodes.filter((n) => n.s1Active && (total.get(n.erpCode) ?? 0) > 0).length, hidden: nodes.filter((n) => !(n.s1Active && (total.get(n.erpCode) ?? 0) > 0)).length };
}

// ---------- Φίλτρα ----------

/** Τα `isFilter` χαρακτηριστικά κάθε τύπου προϊόντος → Facet της κατηγορίας του. Η μάρκα, η τιμή και η ενεργειακή κλάση έχουν δικά τους, σταθερά κλειδιά. */
async function projectFacets(idOf: Map<string, string>) {
  const defs = await db.s1SpecDef.findMany({ where: { isFilter: true, active: true, missing: false }, orderBy: [{ groupS1Id: "asc" }, { code: "asc" }] });
  const rows: Prisma.FacetCreateManyInput[] = [];
  const params = new Map<string, Set<string>>();
  for (const d of defs) {
    const categoryId = idOf.get(`s1:g:${d.groupS1Id}`); if (!categoryId) continue;
    const label = clean(d.name), n = plain(label);
    const special = /^(εταιρε?ια|κατασκευαστησ|μαρκα|brand)$/.test(n) ? { key: "brand", param: "brand", kind: "checkbox" }
      : /^(ευροσ τιμησ|τιμη)$/.test(n) ? { key: "price", param: "price", kind: "range" }
      : /^ενεργειακη κλαση$/.test(n) ? { key: "energy", param: "energy", kind: "checkbox" } : null;
    const taken = params.get(categoryId) ?? new Set<string>(); params.set(categoryId, taken);
    if (special && taken.has(special.param)) continue; // δύο «Εταιρία» στον ίδιο τύπο: κρατάμε την πρώτη
    const param = special?.param ?? uniqueSlug(slugify(label), String(d.code), taken, `f-${d.code}`);
    taken.add(param);
    rows.push({ categoryId, key: special?.key ?? `s1:${d.code}`, label, param, kind: special?.kind ?? "checkbox", sortNo: d.code, source: SOURCE });
  }
  // Ξαναγράφονται μόνο αν άλλαξε κάτι — αλλιώς ο γύρος δεν αγγίζει τον πίνακα
  const sig = (f: { categoryId: string; key: string; label: string; param: string; kind: string; sortNo?: number | null }) => `${f.categoryId}|${f.key}|${f.label}|${f.param}|${f.kind}|${f.sortNo ?? 0}`;
  const before = (await db.facet.findMany({ where: { source: SOURCE } })).map(sig).sort().join("\n");
  const same = before === rows.map(sig).sort().join("\n");
  if (!same) await db.$transaction([db.facet.deleteMany({ where: { source: SOURCE } }), db.facet.createMany({ data: rows, skipDuplicates: true })]);
  return { facets: rows.length, rewritten: !same };
}

// ---------- Προϊόντα ----------

export interface ProjectResult { categories: { created: number; updated: number; orphan: number; visible: number; hidden: number }; facets: { facets: number; rewritten: boolean }; products: { total: number; created: number; updated: number; unchanged: number; deactivated: number; skipped: { noBrand: number; noCategory: number } }; specs: number; energy: number }

async function projectProducts(idOf: Map<string, string>) {
  const [brands, vats, existing] = await Promise.all([
    db.brand.findMany({ where: { s1Id: { not: null } }, select: { id: true, s1Id: true, name: true } }),
    db.vatRate.findMany({ where: { s1Id: { not: null } }, select: { s1Id: true, percent: true } }),
    db.product.findMany({ select: { id: true, erpCode: true, slug: true, sku: true, s1Hash: true, active: true, source: true } }),
  ]);
  const brandOf = new Map(brands.map((b) => [b.s1Id!, b]));
  const vatOf = new Map(vats.map((v) => [v.s1Id!, Number(v.percent)]));
  const byErp = new Map(existing.map((e) => [e.erpCode, e]));
  const slugs = new Set(existing.map((e) => e.slug));
  const skus = new Set(existing.map((e) => e.sku));
  let created = 0, updated = 0, unchanged = 0, noBrand = 0, noCategory = 0, specRows = 0, energyRows = 0;
  const seen = new Set<string>();

  for (let cursor = -2147483648; ;) {
    const items = await db.s1Item.findMany({ where: { mtrl: { gt: cursor } }, orderBy: { mtrl: "asc" }, take: 500 });
    if (!items.length) break;
    cursor = items[items.length - 1].mtrl;
    const fresh: Prisma.ProductCreateManyInput[] = [];
    const changes: { erpCode: string; data: Prisma.ProductUncheckedUpdateInput }[] = [];
    const touched = new Map<string, ReturnType<typeof parseDescription>>(); // erpCode → ό,τι βγήκε από την περιγραφή

    for (const it of items) {
      const erpCode = String(it.mtrl);
      const brand = it.manufacturerS1Id != null ? brandOf.get(String(it.manufacturerS1Id)) : undefined;
      const categoryId = it.specGroupS1Id != null ? idOf.get(`s1:g:${it.specGroupS1Id}`) : undefined;
      if (!brand) { noBrand++; continue; }
      if (!categoryId) { noCategory++; continue; }
      seen.add(erpCode);
      const name = clean(it.name);
      // Το όνομα του ERP άλλοτε ξεκινά με τη μάρκα κι άλλοτε όχι — ο τίτλος την έχει πάντα, μία φορά
      const title = plain(name).includes(plain(brand.name)) ? name : `${brand.name} ${name}`;
      const parsed = parseDescription(it.longDesc);
      const data = {
        title, ean: it.barcode?.trim() || null, brandId: brand.id, categoryId,
        summary: it.shortDesc ? clean(it.shortDesc) : null, description: parsed.text || null,
        highlights: parsed.highlights.length ? parsed.highlights : undefined,
        vatRate: vatOf.get(String(it.vatS1Id ?? "")) ?? 24, active: it.active && !it.missing,
      };
      const s1Hash = sha([PROJECT_VERSION, data, parsed.specs]);
      const e = byErp.get(erpCode);
      if (e && e.s1Hash === s1Hash) { unchanged++; continue; }
      touched.set(erpCode, parsed);
      if (!e) {
        const slug = uniqueSlug(slugify(title).slice(0, 96).replace(/-+$/, ""), slugify(it.code), slugs, `proion-${erpCode}`);
        // Το sku είναι ο κωδικός είδους του ERP (μοναδικός εκεί)· αν τον έχει πιάσει προϊόν άλλης προέλευσης, μπαίνει πρόθεμα
        const sku = skus.has(it.code) ? `S1-${it.code}` : it.code; skus.add(sku);
        fresh.push({ erpCode, slug, sku, ...data, source: SOURCE, s1Hash, s1SyncedAt: new Date() });
      } else {
        changes.push({ erpCode, data: { ...data, highlights: (parsed.highlights.length ? parsed.highlights : null) as never, source: SOURCE, s1Hash, s1SyncedAt: new Date() } });
      }
    }

    if (fresh.length) created += (await db.product.createMany({ data: fresh, skipDuplicates: true })).count;
    for (const part of chunk(changes, 100)) { await db.$transaction(part.map((c) => db.product.update({ where: { erpCode: c.erpCode }, data: c.data }))); updated += part.length; }

    // Χαρακτηριστικά και ενεργειακή κλάση μόνο για όσα γράφτηκαν σε αυτόν τον γύρο
    if (touched.size) {
      const ids = new Map((await db.product.findMany({ where: { erpCode: { in: [...touched.keys()] } }, select: { id: true, erpCode: true, energy: { select: { source: true } } } })).map((p) => [p.erpCode, p]));
      const specs: Prisma.SpecCreateManyInput[] = [];
      const energy: Prisma.PrismaPromise<unknown>[] = [];
      for (const [erpCode, parsed] of touched) {
        const p = ids.get(erpCode); if (!p) continue;
        parsed.specs.forEach((s, i) => specs.push({ productId: p.id, groupName: "Τεχνικά χαρακτηριστικά", key: s.key, value: s.value, sortNo: i, source: DESC_SOURCE }));
        const en = energyFromSpecs(parsed.specs);
        // Ετικέτα από EPREL ή από διαχειριστή δεν πειράζεται ποτέ
        if (en && (!p.energy || p.energy.source === DESC_SOURCE)) { energy.push(db.energyLabel.upsert({ where: { productId: p.id }, create: { productId: p.id, class: en.cls, scale: en.scale, source: DESC_SOURCE }, update: { class: en.cls, scale: en.scale } })); energyRows++; }
        else if (!en && p.energy?.source === DESC_SOURCE) energy.push(db.energyLabel.delete({ where: { productId: p.id } }));
      }
      await db.spec.deleteMany({ where: { source: DESC_SOURCE, productId: { in: [...ids.values()].map((p) => p.id) } } });
      for (const part of chunk(specs, 2000)) specRows += (await db.spec.createMany({ data: part })).count;
      for (const part of chunk(energy, 100)) await db.$transaction(part);
    }
  }

  // Προϊόντα της προβολής που δεν έχουν πια είδος στον καθρέφτη (ή έχασαν μάρκα/τύπο): κρύβονται
  const gone = existing.filter((e) => e.source === SOURCE && e.active && !seen.has(e.erpCode)).map((e) => e.id);
  for (const part of chunk(gone, 1000)) await db.product.updateMany({ where: { id: { in: part } }, data: { active: false } });
  return { total: seen.size, created, updated, unchanged, deactivated: gone.length, skipped: { noBrand, noCategory }, specRows, energyRows };
}

/** Ολόκληρη η προβολή με τη σωστή σειρά. Ασφαλής για επανάληψη. */
export async function projectCatalog(trigger: Trigger = "manual"): Promise<{ ok: boolean; ms: number; error?: string; result?: ProjectResult }> {
  let result: ProjectResult | undefined;
  const run = await logged("cat-project", trigger, async () => {
    const cats = await projectCategories();
    const facets = await projectFacets(cats.idOf);
    const p = await projectProducts(cats.idOf);
    const vis = await refreshCategoryCounts(cats.nodes, cats.idOf);
    result = {
      categories: { created: cats.created, updated: cats.updated, orphan: cats.skipped, ...vis }, facets,
      products: { total: p.total, created: p.created, updated: p.updated, unchanged: p.unchanged, deactivated: p.deactivated, skipped: p.skipped },
      specs: p.specRows, energy: p.energyRows,
    };
    return { fetched: p.total, created: p.created + cats.created, updated: p.updated + cats.updated, missing: p.deactivated, skipped: p.skipped.noBrand + p.skipped.noCategory + cats.skipped };
  });
  return { ok: run.ok, ms: run.ms, error: run.error, result };
}

export async function projectionStats() {
  const [catByDepth, catVisible, products, active, withSpecs, specs, facets, energy, withSummary, withHighlights, last] = await Promise.all([
    db.category.groupBy({ by: ["depth"], where: { source: SOURCE }, _count: { _all: true } }),
    db.category.count({ where: { source: SOURCE, active: true } }),
    db.product.count({ where: { source: SOURCE } }), db.product.count({ where: { source: SOURCE, active: true } }),
    db.product.count({ where: { source: SOURCE, specs: { some: { source: DESC_SOURCE } } } }),
    db.spec.count({ where: { source: DESC_SOURCE } }), db.facet.count({ where: { source: SOURCE } }),
    db.energyLabel.count({ where: { source: DESC_SOURCE } }),
    db.product.count({ where: { source: SOURCE, summary: { not: null } } }),
    db.product.count({ where: { source: SOURCE, NOT: { highlights: { equals: null as never } } } }).catch(() => 0),
    db.s1SyncRun.findFirst({ where: { kind: "cat-project" }, orderBy: { at: "desc" } }),
  ]);
  const depth = (d: number) => catByDepth.find((c) => c.depth === d)?._count._all ?? 0;
  return { master: depth(0), main: depth(1), types: depth(2), catVisible, products, active, sellable: await db.product.count({ where: { source: SOURCE, variants: { some: {} } } }), withSpecs, specs, facets, energy, withSummary, withHighlights, last };
}
