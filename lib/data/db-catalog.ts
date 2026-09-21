import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { EnergyClass, Product, Spec } from "./types";
import type { NavCategory } from "./nav";
import type { AttrFacet } from "./attributes";
import type { ListFilter, ListResult, SuggestResult } from "./repo";
import { hasEnergyLabel } from "@/lib/catalog/energy-types";

/**
 * Ο κατάλογος της βιτρίνας από τη βάση (προβολή του SoftOne): δέντρο κατηγοριών,
 * λίστες με φίλτρα, σελίδα προϊόντος, μάρκες, αναζήτηση.
 *
 * Δύο σταθεροί κανόνες, μέχρι να μάθουμε πού ζει η τιμή του site στο ERP:
 * - **Στις λίστες μπαίνουν μόνο προϊόντα με φωτογραφία.** Η σελίδα ενός προϊόντος χωρίς
 *   φωτογραφία ανοίγει κανονικά (π.χ. από αναζήτηση κωδικού), απλώς δεν «βγαίνει στη βιτρίνα».
 * - **Κανένα προϊόν της βάσης δεν έχει τιμή** (`noPrice`): οι κάρτες γράφουν «Τιμή στο
 *   κατάστημα» και δεν δείχνουν κουμπιά αγοράς. Όταν γεμίσουν τα `Variant`, αλλάζει μόνο το `toProduct`.
 *
 * URL: /k/<master>/<main>/<τύπος>. Τα slugs είναι μοναδικά σε όλο το δέντρο, άρα κάθε
 * κατηγορία βρίσκεται και μόνη της — έτσι δουλεύουν και οι παλιοί σύνδεσμοι (`findCategoryPath`).
 */
const SHOWN: Prisma.MediaWhereInput = { kind: "image", hidden: false };
export const LISTED: Prisma.ProductWhereInput = { source: "softone", active: true, media: { some: SHOWN } };
const TTL = 5 * 60_000;

// ---------- Δέντρο ----------

/** `energy`: ο τύπος έχει ευρωπαϊκή ενεργειακή ετικέτα (για Master / Main: κάποιος απόγονός του έχει). */
export interface CatNode { id: string; slug: string; name: string; depth: number; parentId: string | null; count: number; energy: boolean; children: CatNode[] }
interface Tree { roots: CatNode[]; bySlug: Map<string, CatNode>; byId: Map<string, CatNode>; at: number }
let treeCache: Tree | null = null;

export async function catalogTree(): Promise<Tree> {
  if (treeCache && Date.now() - treeCache.at < TTL) return treeCache;
  const [cats, counts] = await Promise.all([
    db.category.findMany({ where: { source: "softone", active: true }, orderBy: [{ depth: "asc" }, { sortNo: "asc" }], select: { id: true, slug: true, name: true, depth: true, parentId: true } }),
    db.product.groupBy({ by: ["categoryId"], where: LISTED, _count: { _all: true } }),
  ]);
  const direct = new Map(counts.map((c) => [c.categoryId, c._count._all]));
  const byId = new Map<string, CatNode>(cats.map((c) => [c.id, { ...c, count: direct.get(c.id) ?? 0, energy: c.depth === 2 && hasEnergyLabel(c.name), children: [] }]));
  for (const n of [...byId.values()].sort((a, b) => b.depth - a.depth)) if (n.parentId) { const p = byId.get(n.parentId); if (p) { p.count += n.count; if (n.energy && n.count > 0) p.energy = true; } }
  for (const n of byId.values()) if (n.parentId && n.count > 0) byId.get(n.parentId)?.children.push(n);
  const roots = [...byId.values()].filter((n) => n.depth === 0 && n.count > 0);
  treeCache = { roots, byId, bySlug: new Map([...byId.values()].map((n) => [n.slug, n])), at: Date.now() };
  return treeCache;
}
/** Μετά από «Προβολή στο κατάστημα» ή ανέβασμα φωτογραφιών. */
export const resetCatalogCache = () => { treeCache = null; };

export const dbEnabled = async () => (await catalogTree()).roots.length > 0;

export async function dbNavTree(): Promise<NavCategory[]> {
  const t = await catalogTree();
  return t.roots.map((m) => ({ slug: m.slug, label: m.name, count: m.count, children: m.children.map((c) => ({ name: c.name, slug: c.slug })) }));
}

/** Η διαδρομή μιας κατηγορίας από τη ρίζα: [master, main?, τύπος?]. */
export async function categoryPath(slug: string): Promise<CatNode[] | null> {
  const t = await catalogTree();
  const out: CatNode[] = [];
  for (let n = t.bySlug.get(slug); n; n = n.parentId ? t.byId.get(n.parentId) : undefined) out.unshift(n);
  return out.length ? out : null;
}
export const hrefOf = (path: { slug: string }[]) => `/k/${path.map((p) => p.slug).join("/")}`;

/** Παλιοί σύνδεσμοι του demo (/k/eikona-ixos/tileoraseis) → η αντίστοιχη κατηγορία της βάσης, όπου υπάρχει. */
const LEGACY: Record<string, string> = {
  "eikona-ixos": "eikona-kai-ichos", klimatismos: "klimatismos-thermansi", frontida: "prosopiki-frontida", smartphones: "kinita-smartphones", laptops: "laptop-macbook", tablets: "tablets-ipad",
  plyntiria: "plyntiria-roychon", stegnotiria: "stegnotiria", koyzines: "koyzines", mikrokymata: "foyrnoi-mikrokymaton", "kafes-rofimata": "michanes-kafe-rofimaton", mageiriki: "syskeyes-mageirikis",
  sideroma: "syskeyes-sideromatos", gynaika: "gia-tin-gynaika", andras: "gia-ton-andra", paidi: "gia-to-paidi", "ygeia-eyexia": "ygeia-eyexia", akoystika: "akoystika-tilefonia", icheia: "ichos", othones: "othones-ypologiston",
  thermantika: "thermantika-somata", "iliakoi-thermosifones": "iliakoi-thermosifones", anemistires: "anemistires", perifereiaka: "perifereiaka-pc", ektyposi: "ektyposi-analosima", skeyi: "skeyi-mageirikis",
};
export async function findCategoryPath(segments: string[]): Promise<CatNode[] | null> {
  for (const s of [...segments].reverse()) for (const cand of [s, LEGACY[s]]) { if (!cand) continue; const p = await categoryPath(cand); if (p) return p; }
  return null;
}

// ---------- Προϊόν ----------

const PRODUCT_SELECT = {
  id: true, sku: true, ean: true, slug: true, title: true, summary: true, description: true, highlights: true, updatedAt: true,
  brand: { select: { name: true, slug: true } },
  category: { select: { slug: true, name: true, parent: { select: { slug: true, name: true, parent: { select: { slug: true, name: true } } } } } },
  media: { where: SHOWN, orderBy: { sortNo: "asc" as const }, select: { url: true } },
  energy: { select: { class: true, ficheUrl: true, labelUrl: true, eprelRegistrationNumber: true, eprel: { select: { annualKwh: true } } } },
  dimensions: { select: { source: true, w: true, h: true, d: true } },
} satisfies Prisma.ProductSelect;
type Row = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

const ENERGY = new Set(["A", "B", "C", "D", "E", "F", "G", "A+", "A++", "A+++"]);

/** «Λόγος» = σύντομος τίτλος + πρόταση. Οι γραμμές-λίστες («ΑΛΛΑ ΧΑΡΑΚΤΗΡΙΣΤΙΚΑ: α, β, γ…») δεν είναι λόγοι — φαίνονται ως λίστες στην περιγραφή. */
const isReason = (h: string) => { const [label, ...rest] = h.split(":"); const v = rest.join(":"); return label !== label.toLocaleUpperCase("el-GR") && (v.match(/,/g)?.length ?? 0) < 3 && h.length <= 200; };

export function toProduct(r: Row, extra: { specs?: Spec[]; banners?: Product["banners"]; facts?: string[] } = {}): Product {
  const main = r.category.parent, master = main?.parent;
  // ίδια προτεραιότητα με το resolveDims: διαχειριστής → ERP → EPREL
  const d = r.dimensions.find((x) => x.source === "manual") ?? r.dimensions.find((x) => x.source === "s1-desc") ?? r.dimensions.find((x) => x.source === "eprel");
  const images = r.media.map((m) => m.url);
  return {
    id: r.id, sku: r.sku, ean: r.ean ?? undefined, slug: r.slug, brand: r.brand.name, brandSlug: r.brand.slug,
    // η βιτρίνα δείχνει τη μάρκα ξεχωριστά («BRANDT» πάνω από τον τίτλο, «{brand} {title}» στις επικεφαλίδες)
    title: r.title.toLocaleUpperCase("el-GR").startsWith(`${r.brand.name.toLocaleUpperCase("el-GR")} `) ? r.title.slice(r.brand.name.length + 1).trim() : r.title,
    category: (master ?? main ?? r.category).slug, subcategory: (main ?? r.category).slug,
    typeSlug: r.category.slug, path: [master, main, r.category].filter(Boolean).map((c) => ({ slug: c!.slug, name: c!.name })),
    image: images[0] ?? null, images,
    price: 0, noPrice: true,
    dims: d ? { w: d.w, h: d.h, d: d.d, source: d.source === "eprel" ? "eprel" : "specs" } : undefined,
    // ενεργειακή πληροφόρηση μόνο σε τύπους που έχουν ευρωπαϊκή ετικέτα — αλλού, μια «κλάση Α» στην περιγραφή είναι θόρυβος
    energy: r.energy && ENERGY.has(r.energy.class) && hasEnergyLabel(r.category.name) ? { cls: r.energy.class as EnergyClass, fiche: r.energy.ficheUrl ?? r.energy.labelUrl ?? "", kwh: r.energy.eprel?.annualKwh ?? undefined, eprel: r.energy.eprelRegistrationNumber ?? undefined } : undefined,
    availability: { kind: "order", label: "Διαθεσιμότητα στο κατάστημα" },
    description: [r.summary, r.description].filter(Boolean).join("\n\n") || undefined,
    highlights: (() => { const real = (Array.isArray(r.highlights) ? (r.highlights as string[]) : []).filter(isReason); const all = real.length >= 2 ? real : [...real, ...(extra.facts ?? [])]; return all.length ? all.slice(0, 4) : undefined; })(),
    specs: extra.specs, banners: extra.banners,
  };
}

export async function dbProductBySlug(slug: string): Promise<Product | null> {
  const r = await db.product.findFirst({ where: { slug, source: "softone", active: true }, select: {
    ...PRODUCT_SELECT, specs: { orderBy: [{ sortNo: "asc" }], select: { groupName: true, key: true, value: true } },
    facetValues: { where: { source: { in: ["spec", "title"] } }, orderBy: { facet: { sortNo: "asc" } }, take: 8, select: { value: true, facet: { select: { label: true } } } },
  } });
  if (!r) return null;
  const banners = await db.media.findMany({ where: { productId: r.id, kind: "banner", hidden: false }, orderBy: { sortNo: "asc" }, select: { url: true, width: true, height: true, alt: true, blur: true } });
  // Όταν η περιγραφή δεν δίνει «λόγους»: πρώτα ό,τι πείθει (κλάση, κατανάλωση, θόρυβος, χωρητικότητα από την ενεργειακή ετικέτα),
  // μετά τα γνωρίσματα του τύπου από τα φίλτρα του ERP. Οι διαστάσεις δεν είναι λόγος αγοράς — έχουν το δικό τους σημείο.
  const label = (k: string) => k.replace(/\s*\([^)]*\)/, "");
  const fromLabel = r.specs.filter((s) => s.groupName === "Από την ενεργειακή ετικέτα").map((s) => `${s.key}: ${s.value}`);
  const fromFacets = r.facetValues.filter((v) => v.value !== "Όχι" && !/πλατοσ|υψοσ|βαθο|διαστασ/.test(v.facet.label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())).map((v) => (v.value === "Ναι" ? v.facet.label : `${label(v.facet.label)}: ${v.value}`));
  const seen = new Set<string>();
  const facts = [...(r.energy && hasEnergyLabel(r.category.name) ? [`Ενεργειακή κλάση ${r.energy.class}`] : []), ...fromLabel, ...fromFacets].filter((f) => { const k = f.split(":")[0].toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  return withAttrs(toProduct(r, { specs: r.specs.map((s) => ({ group: s.groupName, key: s.key, value: s.value })), banners, facts }), await attrsFor([r.id]));
}
/** Τα χαρακτηριστικά του τύπου με τις τιμές κάθε προϊόντος, στη σειρά που τα έχει το ERP — η βάση κάθε σύγκρισης. */
async function attrsFor(ids: string[]): Promise<Map<string, NonNullable<Product["attrs"]>>> {
  const out = new Map<string, NonNullable<Product["attrs"]>>();
  if (!ids.length) return out;
  const rows = await db.productFacetValue.findMany({ where: { productId: { in: ids } }, orderBy: [{ facet: { sortNo: "asc" } }, { value: "asc" }], select: { productId: true, value: true, facet: { select: { label: true } } } });
  for (const r of rows) {
    const key = r.facet.label.replace(/\s*\([^)]*\)/, "").trim(), list = out.get(r.productId) ?? [];
    const e = list.find((a) => a.key === key);
    if (e) e.value += `, ${r.value}`; else list.push({ key, value: r.value, group: "Χαρακτηριστικά" }); // πολλαπλές τιμές (συνδεσιμότητα) σε μία γραμμή
    out.set(r.productId, list);
  }
  return out;
}
const withAttrs = (p: Product, a: Map<string, NonNullable<Product["attrs"]>>): Product => ({
  ...p,
  attrs: [...(p.energy ? [{ key: "Ενεργειακή κλάση", value: p.energy.cls as string, group: "Απόδοση" }] : []), ...(a.get(p.id) ?? []), ...(p.dims ? [{ key: "Διαστάσεις (Π × Υ × Β)", value: `${[p.dims.w, p.dims.h, p.dims.d].map((n) => n.toLocaleString("el-GR")).join(" × ")} εκ.`, group: "Διαστάσεις" }] : [])],
});

export async function dbProductsByIds(ids: string[]): Promise<Product[]> {
  if (!ids.length) return [];
  const rows = await db.product.findMany({ where: { id: { in: ids }, source: "softone" }, select: { ...PRODUCT_SELECT, specs: { orderBy: { sortNo: "asc" }, take: 40, select: { groupName: true, key: true, value: true } } } });
  const a = await attrsFor(rows.map((r) => r.id));
  return rows.map((r) => withAttrs(toProduct(r, { specs: r.specs.map((s) => ({ group: s.groupName, key: s.key, value: s.value })) }), a));
}
export async function dbRelated(p: Product, limit = 8): Promise<Product[]> {
  if (!p.typeSlug) return [];
  const rows = await db.product.findMany({ where: { ...LISTED, id: { not: p.id }, category: { slug: p.typeSlug } }, orderBy: [{ brand: { name: "asc" } }, { updatedAt: "desc" }], take: limit * 3, select: PRODUCT_SELECT });
  // πρώτα της ίδιας μάρκας, μετά οι υπόλοιπες — ποτέ όλη η σειρά από έναν κατασκευαστή
  const picked = [...rows.filter((r) => r.brand.slug === p.brandSlug).slice(0, Math.ceil(limit / 2)), ...rows.filter((r) => r.brand.slug !== p.brandSlug)].slice(0, limit);
  const a = await attrsFor(picked.map((r) => r.id));
  return picked.map((r) => withAttrs(toProduct(r), a));
}

// ---------- Λίστες ----------

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const smart = (a: string, b: string) => { const na = parseFloat(a.replace(/\./g, "").replace(",", ".")), nb = parseFloat(b.replace(/\./g, "").replace(",", ".")); return !isNaN(na) && !isNaN(nb) ? na - nb : a.localeCompare(b, "el"); };

/** Όλοι οι απόγονοι-τύποι μιας κατηγορίας (τα προϊόντα κρέμονται μόνο από τύπους). */
function leafIds(n: CatNode): string[] { return n.children.length ? n.children.flatMap(leafIds) : [n.id]; }

export async function dbListProducts(f: ListFilter & { l3?: string }): Promise<ListResult> {
  const t = await catalogTree();
  const node = t.bySlug.get(f.l3 ?? f.l2 ?? f.l1 ?? "") ?? null;
  const scope: Prisma.ProductWhereInput = { ...LISTED, ...(node ? { categoryId: { in: leafIds(node) } } : {}) };
  const words = f.q ? norm(f.q).split(/\s+/).filter((w) => w.length >= 2) : [];
  // Ο τίτλος στη βάση έχει τόνους· η αναζήτηση εδώ είναι απλό «περιέχει» ανά λέξη (η σημασιολογική ζει στον Ερμή)
  const text: Prisma.ProductWhereInput = words.length ? { AND: (f.q ?? "").trim().split(/\s+/).filter((w) => w.length >= 2).map((w) => ({ OR: [{ title: { contains: w, mode: "insensitive" as const } }, { sku: { contains: w, mode: "insensitive" as const } }, { ean: { contains: w } }, { brand: { name: { contains: w, mode: "insensitive" as const } } }] })) } : {};
  const base: Prisma.ProductWhereInput = { AND: [scope, text] };

  // Φίλτρα χαρακτηριστικών: μόνο σε επίπεδο τύπου, όπου τα ορίζει το ERP
  const facetDefs = node && node.depth === 2 ? await db.facet.findMany({ where: { categoryId: node.id, source: "softone", key: { startsWith: "s1:" }, valueCount: { gte: 2 } }, orderBy: { sortNo: "asc" }, select: { id: true, label: true, productCount: true } }) : [];
  const usable = facetDefs.filter((d) => node && d.productCount / Math.max(1, node.count) >= 0.2);
  const attrWhere: Prisma.ProductWhereInput[] = [];
  for (const [label, values] of Object.entries(f.attrs ?? {})) {
    const def = usable.find((d) => d.label === label); if (!def || !values.length) continue;
    attrWhere.push({ facetValues: { some: { facetId: def.id, value: { in: values } } } });
  }
  // Το φίλτρο ενεργειακής κλάσης υπάρχει μόνο όπου υπάρχει ενεργειακή ετικέτα, και μετρά μόνο τέτοιους τύπους
  const labelled = [...t.byId.values()].filter((n) => n.depth === 2 && n.energy && (!node || leafIds(node).includes(n.id))).map((n) => n.id);
  const where: Prisma.ProductWhereInput = { AND: [base, ...(f.brand?.length ? [{ brand: { slug: { in: f.brand } } }] : []), ...(f.energy?.length && labelled.length ? [{ categoryId: { in: labelled }, energy: { class: { in: f.energy } } }] : []), ...attrWhere] };

  const perPage = f.perPage ?? 24, page = Math.max(1, f.page ?? 1);
  // Χωρίς τιμές και αξιολογήσεις, η «σχετικότητα» είναι: πιο πρόσφατα ενημερωμένα στο ERP πρώτα
  const orderBy: Prisma.ProductOrderByWithRelationInput[] = f.sort === "newest" ? [{ createdAt: "desc" }, { id: "asc" }] : [{ updatedAt: "desc" }, { id: "asc" }];
  const [rows, total, brandCounts, energyCounts, facetCounts] = await Promise.all([
    db.product.findMany({ where, orderBy, skip: (page - 1) * perPage, take: perPage, select: PRODUCT_SELECT }),
    db.product.count({ where }),
    db.product.groupBy({ by: ["brandId"], where: base, _count: { _all: true } }),
    labelled.length ? db.energyLabel.groupBy({ by: ["class"], where: { product: { AND: [base, { categoryId: { in: labelled } }] } }, _count: { _all: true } }) : Promise.resolve([]),
    usable.length ? db.productFacetValue.groupBy({ by: ["facetId", "value"], where: { facetId: { in: usable.map((d) => d.id) }, product: base }, _count: { _all: true } }) : Promise.resolve([]),
  ]);
  const brandRows = await db.brand.findMany({ where: { id: { in: brandCounts.map((b) => b.brandId) } }, select: { id: true, slug: true, name: true } });
  const brandBy = new Map(brandRows.map((b) => [b.id, b]));
  const attributes: AttrFacet[] = usable.map((d) => ({ key: d.label, group: "Χαρακτηριστικά", values: facetCounts.filter((c) => c.facetId === d.id).map((c) => ({ value: c.value, count: c._count._all })).sort((a, b) => smart(a.value, b.value)) })).filter((a) => a.values.length >= 2 && a.values.length <= 40);

  return {
    items: rows.map((r) => toProduct(r)), total, page, pages: Math.max(1, Math.ceil(total / perPage)),
    brands: brandCounts.map((b) => ({ slug: brandBy.get(b.brandId)?.slug ?? "", name: brandBy.get(b.brandId)?.name ?? "", count: b._count._all })).filter((b) => b.slug).sort((a, b) => b.count - a.count),
    energies: energyCounts.filter((e) => ENERGY.has(e.class)).map((e) => ({ cls: e.class, count: e._count._all })).sort((a, b) => a.cls.localeCompare(b.cls)),
    priceRange: [0, 0], attributes,
    categories: node ? [] : t.roots.map((m) => ({ slug: m.slug, label: m.name, count: m.count })),
  };
}

// ---------- Μάρκες ----------

export async function dbBrands() {
  const counts = await db.product.groupBy({ by: ["brandId"], where: LISTED, _count: { _all: true } });
  const rows = await db.brand.findMany({ where: { id: { in: counts.map((c) => c.brandId) } }, select: { id: true, slug: true, name: true, logo: true, logoCdn: true, logoStatus: true } });
  const n = new Map(counts.map((c) => [c.brandId, c._count._all]));
  return rows.map((b) => ({ slug: b.slug, name: b.name, count: n.get(b.id) ?? 0, logo: b.logo ?? (b.logoStatus === "approved" ? b.logoCdn ?? undefined : undefined) })).sort((a, b) => a.name.localeCompare(b.name, "el"));
}

// ---------- Προτάσεις αναζήτησης ----------

export async function dbSuggest(q: string, cat: string | undefined, rest: Pick<SuggestResult, "guides" | "popular" | "promo">): Promise<SuggestResult> {
  const t = await catalogTree();
  const r = await dbListProducts({ q, l1: cat && cat !== "all" ? cat : undefined, perPage: 6 });
  const words = norm(q).split(/\s+/).filter((w) => w.length >= 2);
  const hit = (name: string) => words.every((w) => norm(name).includes(w));
  const categories: SuggestResult["categories"] = [];
  for (const n of t.byId.values()) if (n.count > 0 && hit(n.name)) { const p = (await categoryPath(n.slug))!; categories.push({ name: n.name, parent: p.length > 1 ? p[p.length - 2].name : undefined, href: hrefOf(p), count: n.count }); }
  return {
    q, total: r.total,
    products: r.items.map((p) => ({ id: p.id, slug: p.slug, brand: p.brand, title: p.title, price: 0, noPrice: true, image: p.image, avail: "order" as const, path: p.path?.[p.path.length - 1]?.name ?? "" })),
    categories: categories.sort((a, b) => b.count - a.count).slice(0, 5), brands: r.brands.filter((b) => hit(b.name)).slice(0, 5).concat(r.brands.filter((b) => !hit(b.name)).slice(0, 3)).slice(0, 5),
    ...rest,
  };
}
