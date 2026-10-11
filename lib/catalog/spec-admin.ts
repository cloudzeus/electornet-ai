import "server-only";
import { db } from "@/lib/db";
import { changesContent, getSpecOverrides, okey, type SpecOverride } from "./spec-overrides";

/**
 * Δεδομένα της σελίδας «Χαρακτηριστικά»: το δέντρο κατηγοριών web του SoftOne με τις ομάδες χαρακτηριστικών (τύπους
 * προϊόντων) και, για μία ομάδα, τα χαρακτηριστικά της με όσα επηρεάζονται (φίλτρο στο site, προϊόντα με τιμή, γραμμές
 * περιγραφών με το ίδιο όνομα). Μόνο αναγνώσεις από τη βάση (καθρέφτης SoftOne) — καμία κλήση στο SoftOne.
 */
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ς/g, "σ").replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9α-ω]+/g, " ").trim();

export type SpecTree = Awaited<ReturnType<typeof specTree>>;
export async function specTree() {
  const [cats, groups, defs, items, overrides, catRows] = await Promise.all([
    db.s1WebCategory.findMany({ where: { missing: false }, orderBy: [{ level: "asc" }, { s1Id: "asc" }], select: { level: true, s1Id: true, parentS1Id: true, name: true, active: true } }),
    db.s1SpecGroup.findMany({ where: { missing: false }, orderBy: { name: "asc" }, select: { s1Id: true, code: true, name: true, cat1: true, cat2: true, active: true } }),
    db.s1SpecDef.findMany({ where: { missing: false }, select: { groupS1Id: true, code: true, active: true, isFilter: true } }),
    db.s1Item.groupBy({ by: ["specGroupS1Id"], where: { missing: false, specGroupS1Id: { not: null } }, _count: true }),
    getSpecOverrides(),
    db.category.findMany({ where: { erpCode: { startsWith: "s1:g:" } }, select: { erpCode: true, productCount: true, active: true } }),
  ]);
  const itemsOf = new Map(items.map((x) => [x.specGroupS1Id!, x._count]));
  const prodOf = new Map(catRows.map((c) => [Number(c.erpCode!.slice(5)), c]));
  const stat = new Map<number, { specs: number; filters: number; changed: number }>();
  for (const d of defs) {
    const s = stat.get(d.groupS1Id) ?? { specs: 0, filters: 0, changed: 0 }; stat.set(d.groupS1Id, s);
    if (!d.active) continue;
    s.specs++;
    const ov = overrides[okey(d.groupS1Id, d.code)];
    if (ov?.filter ?? d.isFilter) s.filters++;
    if (changesContent(ov)) s.changed++;
  }
  const masters = cats.filter((c) => c.level === 1);
  const mains = cats.filter((c) => c.level === 2);
  return masters.map((m) => ({
    id: m.s1Id, name: m.name, active: m.active,
    mains: mains.filter((x) => x.parentS1Id === m.s1Id).map((x) => ({
      id: x.s1Id, name: x.name, active: x.active,
      groups: groups.filter((g) => g.cat1 === m.s1Id && g.cat2 === x.s1Id).map((g) => ({ id: g.s1Id, code: g.code, name: g.name, active: g.active, items: itemsOf.get(g.s1Id) ?? 0, products: prodOf.get(g.s1Id)?.productCount ?? 0, visible: !!prodOf.get(g.s1Id)?.active, ...(stat.get(g.s1Id) ?? { specs: 0, filters: 0, changed: 0 }) })),
    })).filter((x) => x.groups.length),
  })).filter((m) => m.mains.length);
}

export type SpecGroupDetail = NonNullable<Awaited<ReturnType<typeof specGroup>>>;
export async function specGroup(groupS1Id: number) {
  const g = await db.s1SpecGroup.findUnique({ where: { s1Id: groupS1Id }, select: { s1Id: true, code: true, name: true, cat1: true, cat2: true, active: true, s1UpdatedAt: true, syncedAt: true } });
  if (!g) return null;
  const [defs, overrides, cat, items, c1, c2] = await Promise.all([
    db.s1SpecDef.findMany({ where: { groupS1Id, missing: false }, orderBy: { code: "asc" }, select: { code: true, name: true, isView: true, isFilter: true, active: true, s1UpdatedAt: true, options: { where: { missing: false }, orderBy: { code: "asc" }, select: { code: true, name: true, active: true, color: true } } } }),
    getSpecOverrides(),
    db.category.findFirst({ where: { erpCode: `s1:g:${groupS1Id}` }, select: { id: true, slug: true, active: true, productCount: true, parent: { select: { slug: true, parent: { select: { slug: true } } } }, facets: { select: { key: true, param: true, label: true, productCount: true, valueCount: true } } } }),
    db.s1Item.count({ where: { specGroupS1Id: groupS1Id, missing: false } }),
    g.cat1 != null ? db.s1WebCategory.findFirst({ where: { level: 1, s1Id: g.cat1 }, select: { name: true } }) : null,
    g.cat2 != null ? db.s1WebCategory.findFirst({ where: { level: 2, s1Id: g.cat2, parentS1Id: g.cat1 }, select: { name: true } }) : null,
  ]);
  // πόσα προϊόντα του τύπου έχουν γραμμή περιγραφής με το ίδιο όνομα (από εκεί παίρνει τιμή το φίλτρο)
  const keys = cat ? await db.spec.groupBy({ by: ["key"], where: { product: { categoryId: cat.id } }, _count: true }) : [];
  const usage = new Map<string, number>();
  for (const k of keys) usage.set(plain(k.key), (usage.get(plain(k.key)) ?? 0) + k._count);
  const facetOf = new Map((cat?.facets ?? []).map((f) => [f.key, f]));
  const special = (n: string) => (/^(εταιρε?ια|κατασκευαστησ|μαρκα|brand)$/.test(n) ? "brand" : /^(ευροσ τιμησ|τιμη)$/.test(n) ? "price" : /^ενεργειακη κλαση$/.test(n) ? "energy" : null);
  const shopPath = cat ? [cat.parent?.parent?.slug, cat.parent?.slug, cat.slug].filter(Boolean).join("/") : null;
  return {
    id: g.s1Id, code: g.code, name: g.name, active: g.active, path: [c1?.name, c2?.name].filter(Boolean).join(" › "),
    items, products: cat?.productCount ?? 0, visible: !!cat?.active, shopHref: shopPath && cat?.active ? `/k/${shopPath}` : null,
    syncedAt: g.syncedAt.toISOString(), s1UpdatedAt: g.s1UpdatedAt?.toISOString() ?? null,
    specs: defs.map((d) => {
      const n = plain(d.name), sp = special(n);
      const ov: SpecOverride | null = overrides[okey(groupS1Id, d.code)] ?? null;
      const f = facetOf.get(sp ?? `s1:${d.code}`) ?? null;
      return {
        code: d.code, name: d.name, isView: d.isView, isFilter: d.isFilter, active: d.active, special: sp,
        override: ov, filterOnShop: d.active && (ov?.filter ?? d.isFilter),
        facet: f ? { param: f.param, label: f.label, products: f.productCount, values: f.valueCount } : null,
        descLines: usage.get(n) ?? 0,
        options: d.options,
      };
    }),
  };
}
