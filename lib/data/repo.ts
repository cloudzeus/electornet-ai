import { attributeFacets, matchesAttrs, type AttrFacet } from "./attributes";
import "server-only";
import type { Appointment, Brand, ConsentPref, Customer, Faq, Guide, InstalmentPlan, NewsItem, Order, PaymentMethod, Policy, Product, Service, Store } from "./types";
import { navCategories, type NavCategory } from "./nav";
import { products } from "./fixtures/products";
import { findStores, findStoreBySlug, storeRegions } from "@/lib/stores/repo";
import { services } from "./fixtures/services";
import { guides } from "./fixtures/guides";
import { faqs, policies } from "./fixtures/content";
import { livePolicies } from "./fixtures/policies.live";
import { devices, type DeviceInfo } from "./fixtures/devices";
import { brandStores } from "./fixtures/brandStores";
import type { BrandStore } from "@/lib/cms/brand-store";
import { orders } from "./fixtures/orders";
import { news, NEWS_CATEGORIES } from "./fixtures/news";
import { appointments, consents, customer, instalmentPlans, paymentMethods } from "./fixtures/account";

/**
 * Repository — the only module pages read data from. Today: typed
 * fixtures. Tomorrow: Prisma queries with identical signatures.
 */

export interface ListFilter {
  l1?: string;
  l2?: string;
  brand?: string[];
  q?: string;
  tag?: string;
  minPrice?: number;
  maxPrice?: number;
  avail?: "in-stock";
  sale?: boolean;
  renew?: boolean;
  energy?: string[];
  sort?: "relevance" | "price-asc" | "price-desc" | "rating" | "newest" | "discount";
  /** Characteristic facets: canonical key → accepted values (see lib/data/attributes). */
  attrs?: Record<string, string[]>;
  page?: number;
  perPage?: number;
}

export interface ListResult {
  items: Product[];
  total: number;
  page: number;
  pages: number;
  brands: { slug: string; name: string; count: number }[];
  energies: { cls: string; count: number }[];
  priceRange: [number, number];
  /** Characteristic facets computed from the (category-scoped) set. */
  attributes: AttrFacet[];
  /** L1 categories with counts — only for the all-products list. */
  categories: { slug: string; label: string; count: number }[];
}

/** Parse listing search params (shared by /proionta, /k/…, /prosfores, /anazitisi). Attribute facets travel as `f_<key>=v1|v2`. */
export function filterFromParams(sp: Record<string, string | undefined>, base: Partial<ListFilter> = {}): ListFilter {
  const attrs: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (k.startsWith("f_") && v) attrs[k.slice(2)] = v.split("|").filter(Boolean);
  }
  return {
    ...base,
    l1: base.l1 ?? sp.k ?? undefined,
    brand: sp.brand?.split(",").filter(Boolean),
    energy: sp.energy?.split(",").filter(Boolean),
    minPrice: sp.min ? Number(sp.min) : undefined,
    maxPrice: sp.max ? Number(sp.max) : undefined,
    avail: sp.avail === "in-stock" ? "in-stock" : undefined,
    sale: sp.sale === "1" || base.sale,
    renew: base.renew,
    q: sp.q ?? base.q,
    sort: (sp.sort as ListFilter["sort"]) ?? "relevance",
    attrs: Object.keys(attrs).length ? attrs : undefined,
    page: sp.page ? Number(sp.page) : 1,
    perPage: base.perPage ?? 24,
  };
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export async function getCategoryTree(): Promise<NavCategory[]> {
  return navCategories;
}
export async function getL1(slug: string) {
  return navCategories.find((c) => c.slug === slug) ?? null;
}
export async function getL2(l1: string, l2: string) {
  const c = await getL1(l1);
  const s = c?.children.find((x) => x.slug === l2) ?? null;
  return c && s ? { l1: c, l2: s } : null;
}

function applyFilter(f: ListFilter) {
  let list = products.slice();
  if (f.l1) list = list.filter((p) => p.category === f.l1);
  if (f.l2) list = list.filter((p) => p.subcategory === f.l2);
  if (f.brand?.length) list = list.filter((p) => f.brand!.includes(p.brandSlug));
  if (f.tag) list = list.filter((p) => p.tags?.includes(f.tag!));
  if (f.renew) list = list.filter((p) => p.isRenew);
  if (f.minPrice != null) list = list.filter((p) => p.price >= f.minPrice!);
  if (f.maxPrice != null) list = list.filter((p) => p.price <= f.maxPrice!);
  if (f.avail === "in-stock") list = list.filter((p) => p.availability.kind === "in-stock");
  if (f.sale) list = list.filter((p) => p.wasPrice && p.wasPrice > p.price);
  if (f.energy?.length) list = list.filter((p) => p.energy && f.energy!.includes(p.energy.cls));
  if (f.attrs) list = list.filter((p) => matchesAttrs(p, f.attrs));
  if (f.q) {
    const q = norm(f.q);
    list = list.filter((p) => norm(`${p.brand} ${p.title} ${p.sku} ${p.ean ?? ""} ${p.subcategory}`).includes(q));
  }
  return list;
}

export async function listProducts(f: ListFilter = {}): Promise<ListResult> {
  const base = applyFilter({ ...f, brand: undefined, energy: undefined, minPrice: undefined, maxPrice: undefined, avail: undefined, sale: undefined, attrs: undefined });
  const catMap = new Map<string, number>();
  if (!f.l1) for (const p of applyFilter({ ...f, l1: undefined, l2: undefined, brand: undefined, energy: undefined, minPrice: undefined, maxPrice: undefined, avail: undefined, sale: undefined, attrs: undefined })) catMap.set(p.category, (catMap.get(p.category) ?? 0) + 1);
  const brandsMap = new Map<string, { slug: string; name: string; count: number }>();
  const energyMap = new Map<string, number>();
  for (const p of base) {
    const b = brandsMap.get(p.brandSlug) ?? { slug: p.brandSlug, name: p.brand, count: 0 };
    b.count++;
    brandsMap.set(p.brandSlug, b);
    if (p.energy) energyMap.set(p.energy.cls, (energyMap.get(p.energy.cls) ?? 0) + 1);
  }
  const list = applyFilter(f);
  const sort = f.sort ?? "relevance";
  const score = (p: Product) => (p.rating?.count ?? 0) + (p.tags?.length ?? 0) * 10 + (p.badge ? 5 : 0);
  list.sort((a, b) => {
    switch (sort) {
      case "price-asc":
        return a.price - b.price;
      case "price-desc":
        return b.price - a.price;
      case "rating":
        return (b.rating?.value ?? 0) - (a.rating?.value ?? 0);
      case "discount":
        return ((b.wasPrice ?? b.price) - b.price) / (b.wasPrice ?? b.price) - ((a.wasPrice ?? a.price) - a.price) / (a.wasPrice ?? a.price);
      case "newest":
        return (b.badge?.kind === "new" ? 1 : 0) - (a.badge?.kind === "new" ? 1 : 0);
      default:
        return score(b) - score(a);
    }
  });
  const perPage = f.perPage ?? 24;
  const page = Math.max(1, f.page ?? 1);
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const prices = base.map((p) => p.price);
  return {
    items: list.slice((page - 1) * perPage, page * perPage),
    total,
    page,
    pages,
    brands: [...brandsMap.values()].sort((a, b) => b.count - a.count),
    energies: [...energyMap.entries()].map(([cls, count]) => ({ cls, count })).sort((a, b) => a.cls.localeCompare(b.cls)),
    priceRange: prices.length ? [Math.min(...prices), Math.max(...prices)] : [0, 0],
    attributes: attributeFacets(base),
    categories: navCategories.filter((c) => catMap.has(c.slug)).map((c) => ({ slug: c.slug, label: c.label, count: catMap.get(c.slug)! })),
  };
}

export async function getProductBySlug(slug: string) {
  return products.find((p) => p.slug === slug) ?? null;
}
export async function getProductsByIds(ids: string[]) {
  return ids.map((id) => products.find((p) => p.id === id)).filter(Boolean) as Product[];
}
export async function getRelated(p: Product, limit = 8) {
  return products.filter((x) => x.id !== p.id && (x.subcategory === p.subcategory || x.category === p.category)).slice(0, limit);
}
/** Complementary products («Ταιριάζει με αυτό το προϊόν»): other subcategories that go with this one, never the same kind. Max 4. */
export async function getAccessoriesFor(p: Product, limit = 4) {
  const complements: Record<string, string[]> = {
    tileoraseis: ["foritos-ichos", "icheia", "home-cinema"],
    smartphones: ["foritos-ichos", "tablets"],
    laptops: ["tablets", "foritos-ichos"],
    tablets: ["foritos-ichos", "smartphones"],
    plyntiria: ["sideroma"],
    skoypes: ["sideroma"],
    sideroma: ["plyntiria"],
    "kafes-rofimata": ["mageiriki"],
    mageiriki: ["kafes-rofimata"],
    psygeia: ["koyzines"],
    koyzines: ["psygeia"],
  };
  const subs = complements[p.subcategory] ?? [];
  const list = products.filter((x) => x.id !== p.id && subs.includes(x.subcategory) && x.image);
  list.sort((a, b) => subs.indexOf(a.subcategory) - subs.indexOf(b.subcategory) || (b.rating?.count ?? 0) - (a.rating?.count ?? 0));
  return list.slice(0, limit);
}
/* ---------------- Search (autosuggest, four groups) ---------------- */
/** Accent-insensitive, token-based match; also matches the Latin slug so Greeklish («plyntirio») works. @dynamic → Meilisearch index with typo tolerance. */
const tokens = (q: string) => norm(q).split(/\s+/).filter(Boolean);
const hay = (p: Product) => norm(`${p.brand} ${p.title} ${p.sku} ${p.ean ?? ""} ${p.slug.replace(/-/g, " ")} ${p.subcategory.replace(/-/g, " ")} ${(p.specs ?? []).map((s) => s.value).join(" ")}`);
export interface SuggestResult {
  q: string;
  total: number;
  products: { id: string; slug: string; brand: string; title: string; price: number; wasPrice?: number; image: string | null; avail: "in-stock" | "days" | "order"; path: string }[];
  categories: { name: string; parent?: string; href: string; count: number }[];
  brands: { slug: string; name: string; count: number }[];
  guides: { slug: string; title: string; image?: string; kicker: string }[];
  popular: string[];
  promo: { slug: string; brand: string; title: string; price: number; wasPrice?: number; image: string | null } | null;
}
export const POPULAR_SEARCHES = ["κλιματιστικό 12000 btu", "πλυντήριο 9kg", "iPhone 17", "OLED 55", "airfryer", "espresso", "laptop φοιτητή", "ψυγείο no frost"];

export async function searchSuggest(q: string, cat?: string): Promise<SuggestResult> {
  const t = tokens(q);
  const promoP = products.find((p) => p.id === "p-lg-43nano82") ?? products[0];
  const promo = { slug: promoP.slug, brand: promoP.brand, title: promoP.title, price: promoP.price, wasPrice: promoP.wasPrice, image: promoP.image };
  if (t.length === 0 || t.join("").length < 2) return { q, total: 0, products: [], categories: [], brands: [], guides: [], popular: POPULAR_SEARCHES, promo };
  const match = (text: string) => t.every((x) => text.includes(x));
  const scope = cat && cat !== "all" ? products.filter((p) => p.category === cat) : products;
  const hits = scope.filter((p) => match(hay(p)));
  // Rank: brand/title hits first, then by rating count.
  hits.sort((a, b) => Number(match(norm(`${b.brand} ${b.title}`))) - Number(match(norm(`${a.brand} ${a.title}`))) || (b.rating?.count ?? 0) - (a.rating?.count ?? 0));
  const catCounts = new Map<string, number>();
  for (const p of hits) catCounts.set(`${p.category}/${p.subcategory}`, (catCounts.get(`${p.category}/${p.subcategory}`) ?? 0) + 1);
  const categories: SuggestResult["categories"] = [];
  for (const c of navCategories) {
    if (match(norm(c.label))) categories.push({ name: c.label, href: `/k/${c.slug}`, count: products.filter((p) => p.category === c.slug).length });
    for (const ch of c.children) {
      const cnt = catCounts.get(`${c.slug}/${ch.slug}`) ?? 0;
      if (match(norm(`${ch.name} ${ch.slug.replace(/-/g, " ")}`)) || cnt > 0) categories.push({ name: ch.name, parent: c.label, href: `/k/${c.slug}/${ch.slug}`, count: cnt || products.filter((p) => p.subcategory === ch.slug).length });
    }
  }
  categories.sort((a, b) => b.count - a.count);
  const brandMap = new Map<string, { slug: string; name: string; count: number }>();
  for (const p of hits) brandMap.set(p.brandSlug, { slug: p.brandSlug, name: p.brand, count: (brandMap.get(p.brandSlug)?.count ?? 0) + 1 });
  for (const b of await getBrands()) if (match(norm(b.name)) && !brandMap.has(b.slug)) brandMap.set(b.slug, { slug: b.slug, name: b.name, count: b.count });
  const guidesHit = guides.filter((g) => match(norm(`${g.title} ${g.excerpt} ${g.kicker}`))).slice(0, 3);
  const av = (p: Product) => p.availability.kind;
  return {
    q,
    total: hits.length,
    products: hits.slice(0, 6).map((p) => ({ id: p.id, slug: p.slug, brand: p.brand, title: p.title, price: p.price, wasPrice: p.wasPrice, image: p.image, avail: av(p), path: navCategories.find((c) => c.slug === p.category)?.children.find((x) => x.slug === p.subcategory)?.name ?? p.subcategory })),
    categories: categories.slice(0, 5),
    brands: [...brandMap.values()].sort((a, b) => b.count - a.count).slice(0, 5),
    guides: guidesHit.map((g) => ({ slug: g.slug, title: g.title, image: g.image, kicker: g.kicker })),
    popular: POPULAR_SEARCHES,
    promo,
  };
}

export async function getBrands(): Promise<Brand[]> {
  const map = new Map<string, Brand>();
  for (const p of products) {
    const b = map.get(p.brandSlug) ?? { slug: p.brandSlug, name: p.brand, count: 0 };
    b.count++;
    map.set(p.brandSlug, b);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export async function getBrand(slug: string) {
  return (await getBrands()).find((b) => b.slug === slug) ?? null;
}

export async function getStores(q?: { q?: string; region?: string; service?: string }): Promise<Store[]> {
  return findStores(q);
}
export async function getStoreBySlug(slug: string) {
  return findStoreBySlug(slug);
}
export async function getRegions() {
  return storeRegions();
}

export async function getServicesFull(): Promise<Service[]> {
  return services;
}
export async function getService(slug: string) {
  return services.find((s) => s.slug === slug) ?? null;
}
export async function getGuidesFull(): Promise<Guide[]> {
  return guides;
}
export async function getGuide(slug: string) {
  return guides.find((g) => g.slug === slug) ?? null;
}
export async function getFaqs(): Promise<Faq[]> {
  return faqs;
}
export async function getPolicy(slug: string): Promise<Policy | null> {
  // Live (verbatim) texts win over the condensed demo copies.
  return livePolicies.find((p) => p.slug === slug) ?? policies.find((p) => p.slug === slug) ?? null;
}
export async function getOrders(): Promise<Order[]> {
  return orders;
}
export async function getOrder(no: string): Promise<Order | null> {
  return orders.find((o) => o.number.toLowerCase() === no.trim().toLowerCase()) ?? null;
}

/* ---------------- Dynamic content: news ---------------- */
/** @dynamic CMS → `GET /news?sort=-date&category=…` with ISR (revalidate 300s). Same signature, same page. */
export async function getNews(opts: { category?: NewsItem["category"]; limit?: number } = {}): Promise<NewsItem[]> {
  let list = [...news].sort((a, b) => b.date.localeCompare(a.date));
  if (opts.category) list = list.filter((n) => n.category === opts.category);
  return opts.limit ? list.slice(0, opts.limit) : list;
}
export async function getNewsItem(slug: string): Promise<NewsItem | null> {
  return news.find((n) => n.slug === slug) ?? null;
}
export function getNewsCategories() {
  return NEWS_CATEGORIES;
}

/* ---------------- Account (session-scoped, ERP-bound) ---------------- */
/** @dynamic Every function below takes the session customer id in production; here the demo customer. */
export async function getCustomer(): Promise<Customer> {
  return customer;
}
export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  return paymentMethods;
}
export async function getInstalmentPlans(): Promise<InstalmentPlan[]> {
  return instalmentPlans;
}
export async function getAppointments(): Promise<Appointment[]> {
  return [...appointments].sort((a, b) => b.date.localeCompare(a.date));
}
export async function getConsents(): Promise<ConsentPref[]> {
  return consents;
}

/* ---------------- Mega menu data ---------------- */
export interface MegaMenuEntry {
  slug: string;
  subCounts: Record<string, number>;
  brands: { slug: string; name: string; count: number }[];
  quick: { key: string; items: { label: string; href: string }[] } | null;
  promo: Product | null;
  /** Three best-rated products of the category (excluding the promo). */
  top: Product[];
  guide: { title: string; href: string; image?: string } | null;
}
/** @dynamic Per-category menu content (promo product, top brands, quick filters, guide) — from the CMS «menu» zone with fallbacks computed from the catalogue. Cached 5 min. */
export async function getMegaMenuData(): Promise<MegaMenuEntry[]> {
  const smart: Record<string, { title: string; href: string; image?: string }> = {
    "eikona-ixos": { title: "Ποια τηλεόραση σού ταιριάζει;", href: "/odigos-agoras/tileoraseis", image: "/img/guide-tv.jpg" },
    computing: { title: "Ποιος υπολογιστής σού ταιριάζει;", href: "/odigos-agoras/ypologistes", image: "/img/hero-laptop.jpg" },
    klimatismos: { title: "Ποιο κλιματιστικό σού ταιριάζει;", href: "/odigos-agoras/klimatistika", image: "/img/guide-ac.jpg" },
  };
  return Promise.all(
    navCategories.map(async (c) => {
      const r = await listProducts({ l1: c.slug, perPage: 60 });
      const subCounts: Record<string, number> = {};
      for (const p of r.items) subCounts[p.subcategory] = (subCounts[p.subcategory] ?? 0) + 1;
      const promoP = [...r.items].sort((a, b) => ((b.wasPrice ?? b.price) - b.price) / (b.wasPrice ?? b.price) - ((a.wasPrice ?? a.price) - a.price) / (a.wasPrice ?? a.price) || (b.rating?.count ?? 0) - (a.rating?.count ?? 0))[0];
      const facet = r.attributes.find((a) => !["Ενεργειακή κλάση", "Χρώμα"].includes(a.key));
      const quick = facet ? { key: facet.key, items: facet.values.slice(0, 5).map((v) => ({ label: v.value, href: `/proionta?k=${c.slug}&${encodeURIComponent(`f_${facet.key}`)}=${encodeURIComponent(v.value)}` })) } : null;
      const g = smart[c.slug] ?? (guides.find((x) => x.ctaHref?.includes(`/k/${c.slug}`)) ? { title: guides.find((x) => x.ctaHref?.includes(`/k/${c.slug}`))!.title, href: `/odigoi/${guides.find((x) => x.ctaHref?.includes(`/k/${c.slug}`))!.slug}`, image: guides.find((x) => x.ctaHref?.includes(`/k/${c.slug}`))!.image } : null);
      return {
        slug: c.slug,
        subCounts,
        brands: r.brands.slice(0, 6),
        quick,
        promo: promoP ?? null,
        top: [...r.items].filter((p) => p.id !== promoP?.id).sort((a, b) => (b.rating?.count ?? 0) - (a.rating?.count ?? 0)).slice(0, 3),
        guide: g,
      };
    }),
  );
}

/** @dynamic Per-appliance service/warranty/document info (SoftOne SRVJOB + PIM/EPREL). */
export async function getDevices(): Promise<DeviceInfo[]> {
  return devices;
}

/** @dynamic Brand store config (CMS «Brand stores» collection); null when the brand has only a listing. */
export async function getBrandStore(slug: string): Promise<BrandStore | null> {
  return brandStores.find((b) => b.slug === slug) ?? null;
}
export async function getBrandStores(): Promise<BrandStore[]> {
  return brandStores;
}
