import "server-only";
import { db } from "@/lib/db";

/** Ένας κόμβος του δέντρου όπως τον βλέπει η σελίδα Κατηγορίες: SoftOne (καθρέφτης) + κατάστημα. */
export interface CatNode {
  key: string; // «1:10», «2:10:20», «g:805»
  level: 1 | 2 | 3;
  name: string;
  /** ενεργή στο SoftOne */
  s1Active: boolean;
  /** δεν ήρθε στον τελευταίο συγχρονισμό */
  missing: boolean;
  /** είδη του SoftOne που δείχνουν εδώ (καθρέφτης) */
  items: number;
  /** κατηγορία καταστήματος */
  shop: { id: string; href: string; active: boolean; products: number } | null;
  children: CatNode[];
}

export async function categoryTree(): Promise<CatNode[]> {
  const [cats, groups, shop, byCat, byGroup] = await Promise.all([
    db.s1WebCategory.findMany(),
    db.s1SpecGroup.findMany(),
    db.category.findMany({ where: { erpCode: { startsWith: "s1:" } }, select: { id: true, erpCode: true, slug: true, active: true, productCount: true, sortNo: true } }),
    db.s1Item.groupBy({ by: ["webCat1", "webCat2"], where: { missing: false }, _count: { _all: true } }),
    db.s1Item.groupBy({ by: ["specGroupS1Id"], where: { missing: false }, _count: { _all: true } }),
  ]);
  const shopOf = new Map(shop.map((c) => [c.erpCode!, c]));
  const l2Items = new Map(byCat.map((r) => [`${r.webCat1}:${r.webCat2}`, r._count._all]));
  const gItems = new Map(byGroup.map((r) => [r.specGroupS1Id, r._count._all]));
  const sort = (erp: string, fallback: number) => shopOf.get(erp)?.sortNo ?? fallback;
  /** href = η διαδρομή του καταστήματος (/k/<κεντρική>/<κατηγορία>/<τύπος>) */
  const shopInfo = (erp: string, base = "/k") => { const c = shopOf.get(erp); return c ? { id: c.id, href: `${base}/${c.slug}`, active: c.active, products: c.productCount } : null; };

  const l1 = cats.filter((c) => c.level === 1).map((c) => ({ c, s: sort(`s1:1:${c.s1Id}`, c.s1Id) })).sort((a, b) => a.s - b.s || a.c.s1Id - b.c.s1Id);
  return l1.map(({ c: m }) => {
    const top = shopInfo(`s1:1:${m.s1Id}`);
    const mains = cats.filter((c) => c.level === 2 && c.parentS1Id === m.s1Id).map((c) => ({ c, s: sort(`s1:2:${m.s1Id}:${c.s1Id}`, c.s1Id) })).sort((a, b) => a.s - b.s || a.c.s1Id - b.c.s1Id);
    const children: CatNode[] = mains.map(({ c }) => {
      const gs = groups.filter((g) => g.cat1 === m.s1Id && g.cat2 === c.s1Id).map((g) => ({ g, s: sort(`s1:g:${g.s1Id}`, g.s1Id) })).sort((a, b) => a.s - b.s || a.g.s1Id - b.g.s1Id);
      const mid = shopInfo(`s1:2:${m.s1Id}:${c.s1Id}`, top?.href);
      return {
        key: `2:${m.s1Id}:${c.s1Id}`, level: 2, name: c.name, s1Active: c.active, missing: c.missing, items: l2Items.get(`${m.s1Id}:${c.s1Id}`) ?? 0, shop: mid,
        children: gs.map(({ g }) => ({ key: `g:${g.s1Id}`, level: 3, name: g.name, s1Active: g.active, missing: g.missing, items: gItems.get(g.s1Id) ?? 0, shop: shopInfo(`s1:g:${g.s1Id}`, mid?.href), children: [] })),
      };
    });
    return { key: `1:${m.s1Id}`, level: 1, name: m.name, s1Active: m.active, missing: m.missing, items: children.reduce((a, x) => a + x.items, 0), shop: top, children };
  });
}

/** Ο κωδικός ERP της κατηγορίας καταστήματος για έναν κόμβο. */
export const erpCodeOf = (key: string) => key.startsWith("g:") ? `s1:g:${key.slice(2)}` : `s1:${key}`;
