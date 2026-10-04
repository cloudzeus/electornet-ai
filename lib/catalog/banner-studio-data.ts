import "server-only";
import { db } from "@/lib/db";
import { nextToExtract } from "@/lib/catalog/banner-worklist";
import type { StudioBanner, StudioDraft } from "@/components/admin/banner-studio/BannerStudio";
import type { StudioDoc } from "@/lib/catalog/banner-doc";

/** Ό,τι χρειάζεται το εργαλείο απόδελτίωσης για ένα προϊόν — κοινό για τη δική του σελίδα και την καρτέλα προϊόντος. */
export async function loadBannerStudio(id: string) {
  const p = await db.product.findUnique({ where: { id }, select: { id: true, title: true, slug: true, brand: { select: { name: true } }, category: { select: { name: true, parent: { select: { name: true } } } } } });
  if (!p) return null;
  const [media, extractions, publishedCount, nextHref] = await Promise.all([
    db.media.findMany({ where: { productId: id, kind: "banner" }, orderBy: { sortNo: "asc" }, select: { id: true, url: true, width: true, height: true, hidden: true } }),
    db.bannerExtraction.findMany({ where: { productId: id, status: { in: ["draft", "published"] } }, orderBy: { updatedAt: "desc" }, select: { id: true, mediaId: true, sourceName: true, status: true, doc: true, updatedAt: true, createdAt: true } }),
    db.productSection.count({ where: { productId: id, hidden: false } }),
    nextToExtract(id, undefined),
  ]);
  // μία (η πιο πρόσφατη) απόδελτίωση ανά banner· τα αρχεία που ανέβηκαν μετράνε ξεχωριστά
  const latest = new Map<string, (typeof extractions)[number]>();
  for (const e of extractions) { const k = e.mediaId ?? `u:${e.id}`; if (!latest.has(k)) latest.set(k, e); }
  const drafts: StudioDraft[] = [...latest.values()].sort((a, b) => +a.createdAt - +b.createdAt).map((e) => ({ id: e.id, mediaId: e.mediaId, sourceName: e.sourceName, status: e.status, doc: e.doc as unknown as StudioDoc, updatedAt: e.updatedAt.toISOString() }));
  const banners: StudioBanner[] = media.map((m) => { const e = latest.get(m.id); return { ...m, extraction: e ? { id: e.id, status: e.status } : null }; });
  const title = p.title.toLocaleUpperCase("el-GR").startsWith(`${p.brand.name.toLocaleUpperCase("el-GR")} `) ? p.title.slice(p.brand.name.length + 1) : p.title;
  return { product: { id: p.id, title, brand: p.brand.name, slug: p.slug, path: [p.category.parent?.name, p.category.name].filter(Boolean).join(" › ") }, banners, drafts, publishedCount, nextHref };
}
