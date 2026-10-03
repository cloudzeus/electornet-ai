"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission, requireStaff } from "@/lib/rbac/guard";
import { can } from "@/lib/rbac/permissions";
import { audit } from "@/lib/rbac/audit";
import { db } from "@/lib/db";
import type { BrandStore, BrandTheme } from "@/lib/cms/brand-store";
import { checkStore, type Issue } from "@/lib/cms/brand-store-check";
import { getStoreDoc, publishDraft, revertDraft, saveDraft, unpublish } from "@/lib/cms/brand-stores";
import { paletteFromAccent, scrapeBrandStyle, type StyleSuggestion } from "@/lib/cms/brand-style";
import { getProductsByIds } from "@/lib/data/repo";

const PERM = "cms.brandstores.write";

/** Επιλογείς (προϊόντα, κατηγορίες, εικόνες, προσφορές): για σελίδες μαρκών ή ζώνες σελίδων. */
async function requireCms() {
  const user = await requireStaff();
  if (!can(user.permissions, PERM) && !can(user.permissions, "cms.pages.write")) redirect("/admin/forbidden?need=cms.pages.write");
  return user;
}

export type PickProduct = { id: string; title: string; sku: string; price: number | null; image: string | null };

/** Οι κατηγορίες που έχουν προϊόντα της μάρκας (με πλήθος, και των υποκατηγοριών): drill-down κατηγορία → υποκατηγορία. */
async function brandTree(brandId: string | null) {
  const [rows, cats] = await Promise.all([
    db.product.groupBy({ by: ["categoryId"], where: { active: true, ...(brandId ? { brandId } : {}) }, _count: { _all: true } }),
    db.category.findMany({ select: { id: true, name: true, parentId: true, sortNo: true } }),
  ]);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const count = new Map<string, number>();
  for (const r of rows) for (let id: string | null = r.categoryId, g = 0; id && g < 8; g++) { count.set(id, (count.get(id) ?? 0) + r._count._all); id = byId.get(id)?.parentId ?? null; }
  return cats.filter((c) => count.get(c.id)).map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, count: count.get(c.id)!, sortNo: c.sortNo }));
}

export async function brandCategoriesAction(brandId: string | null) {
  await requireCms();
  return (await brandTree(brandId)).sort((a, b) => a.sortNo - b.sortNo || a.name.localeCompare(b.name, "el")).map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, count: c.count }));
}

export async function brandProductsAction(input: { brandId: string | null; categoryId?: string | null; q?: string }): Promise<{ total: number; items: PickProduct[] }> {
  await requireCms();
  let catIds: string[] | undefined;
  if (input.categoryId) {
    const cats = await db.category.findMany({ select: { id: true, parentId: true } });
    const kids = new Map<string, string[]>();
    for (const c of cats) if (c.parentId) kids.set(c.parentId, [...(kids.get(c.parentId) ?? []), c.id]);
    catIds = [];
    for (const stack = [input.categoryId]; stack.length; ) { const id = stack.pop()!; catIds.push(id); stack.push(...(kids.get(id) ?? [])); }
  }
  const q = (input.q ?? "").trim();
  const where = { ...(input.brandId ? { brandId: input.brandId } : {}), active: true, ...(catIds ? { categoryId: { in: catIds } } : {}), ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { sku: { contains: q, mode: "insensitive" as const } }] } : {}) };
  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({ where, orderBy: [{ price: { sort: "desc", nulls: "last" } }], take: 200, select: { id: true, title: true, sku: true, price: true, media: { where: { hidden: false, kind: "image" }, orderBy: { sortNo: "asc" }, take: 1, select: { url: true, thumbUrl: true } } } }),
  ]);
  return { total, items: rows.map((r) => ({ id: r.id, title: r.title, sku: r.sku, price: r.price ?? null, image: r.media[0]?.thumbUrl ?? r.media[0]?.url ?? null })) };
}

/** Στοιχεία για τα προϊόντα που ήδη υπάρχουν στη σελίδα (και demo ids). */
export async function productsInfoAction(ids: string[]): Promise<PickProduct[]> {
  await requireCms();
  const list = await getProductsByIds([...new Set(ids)].slice(0, 300));
  return list.map((p) => ({ id: p.id, title: `${p.brand} ${p.title}`, sku: p.sku ?? "", price: p.price ?? null, image: p.image ?? null }));
}

export async function saveDraftAction(slug: string, store: BrandStore): Promise<{ ok: boolean; at?: string; message?: string }> {
  const user = await requirePermission(PERM);
  if (store.slug !== slug || !Array.isArray(store.blocks)) return { ok: false, message: "Μη έγκυρα δεδομένα σελίδας." };
  const r = await saveDraft(slug, store, user.id);
  return { ok: true, at: r.updatedAt.toISOString() };
}

export async function publishAction(slug: string): Promise<{ ok: boolean; message: string; errors?: Issue[] }> {
  const user = await requirePermission(PERM);
  const doc = await getStoreDoc(slug);
  if (!doc) return { ok: false, message: "Δεν υπάρχει πρόχειρο." };
  const { errors } = checkStore(doc.draft);
  const ids = new Set<string>([doc.draft.hero.productId]);
  for (const b of doc.draft.blocks) { if ("productIds" in b) b.productIds.forEach((i) => ids.add(i)); if (b.type === "series") b.items.forEach((it) => it.productIds.forEach((i) => ids.add(i))); }
  const found = new Set((await getProductsByIds([...ids].filter(Boolean))).map((p) => p.id));
  const gone = [...ids].filter((i) => i && !found.has(i));
  if (gone.length) errors.push({ where: "Προϊόντα", msg: `${gone.length} προϊόντα της σελίδας δεν υπάρχουν πια ή είναι ανενεργά — αφαίρεσέ τα (σημειώνονται με κόκκινο).` });
  if (errors.length) return { ok: false, message: "Διόρθωσε τα παρακάτω πριν τη δημοσίευση.", errors };
  await publishDraft(slug, user.id);
  await audit(user.id, "cms.brandstore.publish", "CmsDocument", `brand.stores/${slug}`, doc.published, doc.draft);
  revalidatePath(`/brands/${slug}`);
  revalidatePath("/brands");
  return { ok: true, message: "Δημοσιεύτηκε — οι πελάτες βλέπουν τώρα τη νέα σελίδα." };
}

export async function unpublishAction(slug: string) {
  const user = await requirePermission(PERM);
  const doc = await getStoreDoc(slug);
  await unpublish(slug, user.id);
  await audit(user.id, "cms.brandstore.unpublish", "CmsDocument", `brand.stores/${slug}`, doc?.published ?? null, null);
  revalidatePath(`/brands/${slug}`);
  revalidatePath("/brands");
  return { ok: true, message: "Η σελίδα αποσύρθηκε· η μάρκα δείχνει πάλι μόνο τον κατάλογο. Το πρόχειρο μένει." };
}

export async function revertAction(slug: string) {
  const user = await requirePermission(PERM);
  await revertDraft(slug, user.id);
  await audit(user.id, "cms.brandstore.revert", "CmsDocument", `brand.stores/${slug}`, null, null);
  return { ok: true, message: "Το πρόχειρο επέστρεψε στη δημοσιευμένη έκδοση." };
}

export async function scrapeStyleAction(url: string): Promise<{ ok: true; s: StyleSuggestion } | { ok: false; message: string }> {
  await requirePermission(PERM);
  try { return { ok: true, s: await scrapeBrandStyle(url) }; } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Αποτυχία ανάγνωσης του site." }; }
}

export async function paletteAction(accent: string, mode: "light" | "dark"): Promise<BrandTheme> {
  await requirePermission(PERM);
  return paletteFromAccent(accent, mode);
}

const bfDomain = (cdn: string | null) => cdn?.match(/cdn\.brandfetch\.io\/([^/]+)\//)?.[1] ?? null;

/** Νέα σελίδα μάρκας: ξεκινά ως πρόχειρο με προϊόντα της μάρκας ήδη επιλεγμένα. Δεν δημοσιεύεται. */
export async function createStoreAction(brandSlug: string) {
  const user = await requirePermission(PERM);
  if (await getStoreDoc(brandSlug)) redirect(`/admin/cms/brand-stores/${brandSlug}`);
  const brand = await db.brand.findUnique({ where: { slug: brandSlug } });
  if (!brand) throw new Error("Άγνωστη μάρκα.");
  const prods = await db.product.findMany({ where: { brandId: brand.id, active: true, price: { not: null }, media: { some: { hidden: false, kind: "image" } } }, orderBy: [{ price: "desc" }], take: 40, select: { id: true, createdAt: true } });
  const newest = [...prods].sort((a, b) => +b.createdAt - +a.createdAt).slice(0, 3).map((p) => p.id);
  const name = brand.name.length <= 4 ? brand.name : brand.name.charAt(0) + brand.name.slice(1).toLowerCase();
  const domain = brand.domain ?? bfDomain(brand.logoCdn);
  const ends = new Date(Date.now() + 14 * 86_400_000); ends.setHours(23, 59, 0, 0);
  const store: BrandStore = {
    slug: brand.slug,
    name,
    wordmark: brand.name,
    logo: brand.logo ?? (brand.logoStatus === "approved" ? brand.logoCdn ?? undefined : undefined),
    website: domain ? `https://www.${domain.replace(/^www\./, "")}` : undefined,
    tagline: "",
    theme: { mode: "light", bg: "#ffffff", bg2: "#f3f5f9", ink: "#111318", muted: "#5c6270", accent: "#0a3d91", accentInk: "#ffffff" },
    hero: { kicker: `${name} στη Euronics`, title: ["Γράψε", "τον τίτλο", "σε 3 γραμμές."], body: "", cta: { label: `Δες όλα τα ${name}`, href: `/brands/${brand.slug}?all=1` }, productId: prods[0]?.id ?? "" },
    blocks: [
      { id: `b-${Date.now().toString(36)}-n`, type: "new-arrivals", kicker: "Νέα προϊόντα", title: "Μόλις έφτασαν", productIds: newest },
      { id: `b-${Date.now().toString(36)}-o`, type: "offers", kicker: `Προσφορές ${name}`, title: "Για λίγες μέρες", productIds: prods.slice(3, 7).map((p) => p.id), endsAt: ends.toISOString() },
      { id: `b-${Date.now().toString(36)}-s`, type: "support", facts: [`Επίσημη εγγύηση ${name}`, "Service αντιπροσωπείας με γνήσια ανταλλακτικά", "Παράδοση και εγκατάσταση από το κατάστημα"], askAris: [] },
    ],
    seo: { title: `${name} στη Euronics — νέα προϊόντα και προσφορές`, description: `Η σελίδα της ${name} στη Euronics: νέα προϊόντα, προσφορές και τεχνολογία, με εργοστασιακή εγγύηση και service αντιπροσωπείας.` },
  };
  await saveDraft(brand.slug, store, user.id);
  await audit(user.id, "cms.brandstore.create", "CmsDocument", `brand.stores/${brand.slug}`, null, { slug: brand.slug });
  redirect(`/admin/cms/brand-stores/${brand.slug}`);
}

// ---- επιλογή εικόνας: από προϊόν · από tags · από τη βιβλιοθήκη ----
export type PickImage = { url: string; thumb: string | null; label: string; w: number | null; h: number | null };

/** Όλες οι φωτογραφίες (ή τα βίντεο) ενός προϊόντος, με τη σειρά του καταλόγου. */
export async function productImagesAction(productId: string, kind: "image" | "video" = "image"): Promise<PickImage[]> {
  await requireCms();
  const p = await db.product.findUnique({ where: { id: productId }, select: { title: true, media: { where: { hidden: false, kind }, orderBy: { sortNo: "asc" }, select: { url: true, thumbUrl: true, width: true, height: true, alt: true } } } });
  if (!p) {
    // demo προϊόν (fixtures): μόνο η κύρια εικόνα του
    const [d] = await getProductsByIds([productId]);
    return d && kind === "image" ? (d.images?.length ? d.images : [d.image]).filter((u): u is string => !!u).map((u, i) => ({ url: u, thumb: u, label: `${d.title} · ${i + 1}`, w: null, h: null })) : [];
  }
  return p.media.map((m, i) => ({ url: m.url, thumb: m.thumbUrl ?? m.url, label: m.alt ?? `${p.title} · ${i + 1}`, w: m.width ?? null, h: m.height ?? null }));
}

/** Tags της βιβλιοθήκης media και tags προϊόντων, με πλήθος. */
export async function imageTagsAction(kind: "image" | "video" = "image") {
  await requireCms();
  const [media, product] = await Promise.all([
    db.$queryRaw<{ tag: string; n: number }[]>`SELECT t AS tag, count(*)::int AS n FROM (SELECT unnest(tags) t FROM "MediaAsset" WHERE kind = ${kind}) x GROUP BY t ORDER BY n DESC, t LIMIT 80`,
    db.tag.findMany({ select: { id: true, name: true, _count: { select: { products: true } } }, orderBy: { name: "asc" }, take: 80 }),
  ]);
  return { media: media.map((m) => ({ tag: m.tag, count: m.n })), product: product.filter((t) => t._count.products > 0).map((t) => ({ id: t.id, name: t.name, count: t._count.products })) };
}

export async function imagesByTagAction(input: { source: "media" | "product"; tag: string; kind?: "image" | "video"; brandId?: string }): Promise<PickImage[]> {
  await requireCms();
  const kind = input.kind ?? "image";
  if (input.source === "media") {
    const rows = await db.mediaAsset.findMany({ where: { kind, tags: { has: input.tag } }, orderBy: { createdAt: "desc" }, take: 120, select: { url: true, thumbUrl: true, title: true, filename: true, width: true, height: true } });
    return rows.map((r) => ({ url: r.url, thumb: r.thumbUrl ?? r.url, label: r.title ?? r.filename, w: r.width ?? null, h: r.height ?? null }));
  }
  const rows = await db.product.findMany({ where: { active: true, tags: { some: { tagId: input.tag } }, ...(input.brandId ? { brandId: input.brandId } : {}) }, take: 60, select: { title: true, media: { where: { hidden: false, kind }, orderBy: { sortNo: "asc" }, take: 3, select: { url: true, thumbUrl: true, width: true, height: true } } } });
  return rows.flatMap((p) => p.media.map((m, i) => ({ url: m.url, thumb: m.thumbUrl ?? m.url, label: `${p.title} · ${i + 1}`, w: m.width ?? null, h: m.height ?? null })));
}


// ---- επιλογές για components συνδεδεμένα με Προσφορές / καταστήματα ----
export async function blockOptionsAction() {
  await requireCms();
  const now = new Date();
  const { SLOTS } = await import("@/lib/promo/landing-blocks");
  const [ads, promos, landings, coupons, brands] = await Promise.all([
    db.adPlacement.findMany({ where: { status: { not: "archived" } }, orderBy: [{ slot: "asc" }, { priority: "asc" }], select: { id: true, slot: true, title: true, image: true, status: true, startsAt: true, endsAt: true } }),
    db.promotion.findMany({ where: { status: { in: ["active", "scheduled"] }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, name: true, code: true, status: true, endsAt: true } }),
    db.landingPage.findMany({ where: { status: "published" }, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, slug: true, endsAt: true } }),
    db.coupon.findMany({ where: { kind: "shared", customerId: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], promotion: { status: { in: ["active", "scheduled"] } } }, orderBy: { createdAt: "desc" }, take: 200, select: { code: true, expiresAt: true, promotion: { select: { name: true } } } }),
    db.brand.findMany({ where: { active: true, products: { some: { active: true } } }, orderBy: { name: "asc" }, select: { id: true, slug: true, name: true } }),
  ]);
  const { getRegions, getGuidesFull, getServicesFull } = await import("@/lib/data/repo");
  const [regions, guides, services]: [string[], { slug: string; title: string }[], { slug: string; title: string }[]] = await Promise.all([getRegions().catch(() => []), getGuidesFull().then((g) => g.map((x) => ({ slug: x.slug, title: x.title }))), getServicesFull().then((g) => g.map((x) => ({ slug: x.slug, title: x.title })))]);
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return {
    slots: SLOTS,
    ads: ads.map((a) => ({ id: a.id, slot: a.slot, title: a.title, image: a.image, status: a.status, startsAt: iso(a.startsAt), endsAt: iso(a.endsAt) })),
    promos: promos.map((p) => ({ id: p.id, name: p.name, code: p.code, status: p.status, endsAt: iso(p.endsAt) })),
    landings: landings.map((l) => ({ id: l.id, title: l.title, slug: l.slug, endsAt: iso(l.endsAt) })),
    coupons: coupons.map((c) => ({ code: c.code, promo: c.promotion.name, expiresAt: iso(c.expiresAt) })),
    brands,
    regions,
    guides,
    services,
  };
}
export type BlockOptions = Awaited<ReturnType<typeof blockOptionsAction>>;

/**
 * Λογότυπο για αυτόματη περικοπή: φέρνει το αρχείο ΜΟΝΟ από το δικό μας CDN (Bunny) — ποτέ hotlink τρίτων
 * (οι όροι του Brandfetch απαγορεύουν λήψη/αναδημοσίευση). SVG ως κείμενο, raster ως data URL (για canvas χωρίς CORS).
 */
export async function fetchLogoAction(url: string): Promise<{ ok: true; kind: "svg"; text: string } | { ok: true; kind: "raster"; dataUrl: string } | { ok: false; message: string }> {
  await requireCms();
  let u: URL;
  try { u = new URL(url); } catch { return { ok: false, message: "Μη έγκυρο URL." }; }
  const { getSetting } = await import("@/lib/settings/store");
  const cdn = String((await getSetting("bunny")).data.cdnUrl ?? "");
  const allowed = new Set(["euronics.b-cdn.net", ...(cdn ? [new URL(cdn).host] : [])]);
  if (u.protocol !== "https:" || !allowed.has(u.host)) return { ok: false, message: "Η αυτόματη περικοπή γίνεται μόνο σε αρχεία της βιβλιοθήκης media (όχι σε λογότυπα τρίτων όπως το Brandfetch)." };
  const r = await fetch(u, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!r?.ok) return { ok: false, message: "Δεν φορτώνει το αρχείο." };
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 5 * 1024 * 1024) return { ok: false, message: "Το αρχείο είναι πάνω από 5 MB." };
  const type = r.headers.get("content-type") ?? "";
  if (type.includes("svg") || u.pathname.endsWith(".svg")) return { ok: true, kind: "svg", text: buf.toString("utf8") };
  if (!/^image\/(png|jpe?g|webp|gif)/.test(type)) return { ok: false, message: "Υποστηρίζονται SVG, PNG, JPG, WebP." };
  return { ok: true, kind: "raster", dataUrl: `data:${type.split(";")[0]};base64,${buf.toString("base64")}` };
}
