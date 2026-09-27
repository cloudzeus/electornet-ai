import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { storeBytes } from "@/lib/media/storage";
import { analyseBanner, cropBox, type BannerAnalysis, type OcrText } from "./banner-ocr";
import { uid, sectionHasContent, type StudioDoc, type StudioText, type PublishedSection, type SectionImage, type SectionFeature } from "./banner-doc";

/**
 * Απόδελτίωση banners: ανάλυση → πρόχειρο (BannerExtraction) → διόρθωση στο εργαλείο → δημοσίευση ως ProductSection.
 * Η δημοσίευση κόβει τις φωτογραφίες και τα εικονίδια από την ΑΡΧΙΚΗ εικόνα (όχι από προεπισκόπηση), τα ανεβάζει ως WebP
 * και, αν το ζητήσει ο διαχειριστής, κρύβει το αρχικό banner από τη σελίδα — δεν το σβήνει.
 */

const folderKey = (p: { ean: string | null; sku: string; id: string }) => (p.ean || p.sku || p.id).replace(/[^\w.-]+/g, "_");

/** Τα bytes μιας εικόνας από το CDN μας ή από τον τοπικό φάκελο uploads. */
export async function fetchSource(url: string): Promise<Buffer> {
  if (url.startsWith("/uploads/")) { const { readFile } = await import("node:fs/promises"); const path = await import("node:path"); return readFile(path.join(process.cwd(), "public", url)); }
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Η εικόνα δεν κατέβηκε (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

const toStudioText = (t: OcrText | null): StudioText | null => (t ? { id: uid("t"), text: t.el ?? t.text, ...(t.el ? { original: t.text } : {}), box: t.box } : null);

/** Ανάλυση → έγγραφο προς διόρθωση. Το κείμενο μπαίνει ήδη στα ελληνικά όπου χρειάστηκε μετάφραση, με το πρωτότυπο δίπλα. */
export function toStudioDoc(a: BannerAnalysis, sourceUrl: string): StudioDoc {
  return {
    sourceUrl, width: a.width, height: a.height, lang: a.lang,
    sections: a.sections.map((s) => ({
      id: uid("s"), include: true,
      title: toStudioText(s.title), subtitle: toStudioText(s.subtitle),
      paragraphs: s.paragraphs.map((p) => toStudioText(p)!).filter(Boolean),
      features: s.features.map((f) => ({ id: uid("f"), label: f.label.el ?? f.label.text, ...(f.label.el ? { original: f.label.text } : {}), box: f.label.box, icon: f.icon, include: true, includeIcon: !!f.icon })),
      footnote: toStudioText(s.footnote),
      images: s.images.map((im) => ({ id: uid("i"), box: im.box, alt: im.alt, kind: im.kind, overlayText: im.overlayText, include: true })),
    })),
  };
}

/** Νέα απόδελτίωση από banner του προϊόντος ή από αρχείο που ανέβηκε (bytes). */
export async function startExtraction(input: { productId: string; userId?: string; mediaId?: string; upload?: { bytes: Buffer; name: string } }) {
  const product = await db.product.findUnique({ where: { id: input.productId }, select: { id: true, ean: true, sku: true } });
  if (!product) throw new Error("Το προϊόν δεν βρέθηκε.");
  let bytes: Buffer, sourceUrl: string, sourceName: string | null = null;
  if (input.mediaId) {
    const m = await db.media.findFirst({ where: { id: input.mediaId, productId: product.id }, select: { url: true, importFile: true } });
    if (!m) throw new Error("Το banner δεν βρέθηκε σε αυτό το προϊόν.");
    bytes = await fetchSource(m.url); sourceUrl = m.url; sourceName = m.importFile;
  } else if (input.upload) {
    // η πηγή κρατιέται (WebP υψηλής ποιότητας) — από αυτήν κόβονται οι φωτογραφίες στη δημοσίευση
    const src = await sharp(input.upload.bytes, { limitInputPixels: 80_000_000 }).rotate().resize({ width: 2400, height: 6000, fit: "inside", withoutEnlargement: true }).webp({ quality: 92 }).toBuffer();
    const hash = createHash("sha1").update(src).digest("hex").slice(0, 16);
    sourceUrl = (await storeBytes(`products/${folderKey(product)}/banner-src/${hash}.webp`, src, "image/webp")).url;
    bytes = src; sourceName = input.upload.name.slice(0, 200);
  } else throw new Error("Διάλεξε banner ή ανέβασε αρχείο.");
  const a = await analyseBanner(bytes);
  const doc = toStudioDoc(a, sourceUrl);
  const row = await db.bannerExtraction.create({ data: { productId: product.id, mediaId: input.mediaId ?? null, sourceUrl, sourceName, width: a.width, height: a.height, lang: a.lang, doc: doc as unknown as Prisma.InputJsonValue, model: a.model, costUsd: a.costUsd, ms: a.ms, createdById: input.userId ?? null } });
  return { id: row.id, mediaId: row.mediaId, sourceName, doc, costUsd: a.costUsd, ms: a.ms, tiles: a.tiles };
}

export async function saveDraft(id: string, doc: StudioDoc) {
  await db.bannerExtraction.update({ where: { id }, data: { doc: doc as unknown as Prisma.InputJsonValue } });
}

const joinText = (xs: (StudioText | null | undefined)[]) => xs.map((x) => x?.text.trim() ?? "").filter(Boolean).join("\n\n") || null;

/**
 * Δημοσίευση μιας ή περισσότερων απόδελτιώσεων του ίδιου προϊόντος, με τη σειρά που δίνονται: κόβει φωτογραφίες και
 * εικονίδια, γράφει τις ενότητες (αντικαθιστώντας όσες είχαν βγει από τις ίδιες απόδελτιώσεις) και κρύβει τα αρχικά banners.
 */
export async function publishExtractions(productId: string, items: { id: string; doc: StudioDoc }[], opts: { hideSources: boolean }) {
  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true, ean: true, sku: true } });
  if (!product) throw new Error("Το προϊόν δεν βρέθηκε.");
  const rows = await db.bannerExtraction.findMany({ where: { id: { in: items.map((i) => i.id) }, productId } });
  if (rows.length !== items.length) throw new Error("Κάποια απόδελτίωση δεν ανήκει σε αυτό το προϊόν.");
  // οι ενότητες από ΑΛΛΕΣ απόδελτιώσεις (ή χειροκίνητες) μένουν πρώτες, οι νέες μπαίνουν μετά με τη σειρά του εργαλείου
  const keep = await db.productSection.count({ where: { productId, extractionId: { notIn: items.map((i) => i.id) } } });
  const folder = `products/${folderKey(product)}/sections`;
  const created: Prisma.ProductSectionCreateManyInput[] = [];
  let sortNo = keep, crops = 0;
  for (const it of items) {
    const bytes = await fetchSource(it.doc.sourceUrl);
    const put = async (box: [number, number, number, number], kind: "img" | "icon") => {
      const c = await cropBox(bytes, box, kind === "icon" ? { pad: 0.002, trim: true, max: 160 } : { trim: true, max: 1600 });
      const hash = createHash("sha1").update(c.webp).digest("hex").slice(0, 16);
      const url = (await storeBytes(`${folder}/${hash}.webp`, c.webp, "image/webp")).url;
      crops++;
      return { url, width: c.width, height: c.height };
    };
    for (const s of it.doc.sections) {
      if (!s.include || !sectionHasContent(s)) continue;
      const images: SectionImage[] = [];
      for (const im of s.images.filter((x) => x.include)) { const c = await put(im.box, "img"); images.push({ ...c, alt: im.alt.trim() }); }
      const features: SectionFeature[] = [];
      for (const f of s.features.filter((x) => x.include && x.label.trim())) {
        const icon = f.includeIcon && f.icon ? await put(f.icon, "icon") : null;
        features.push({ label: f.label.trim(), ...(icon ? { iconUrl: icon.url, iconW: icon.width, iconH: icon.height } : {}) });
      }
      created.push({ productId, sortNo: sortNo++, title: s.title?.text.trim() || null, subtitle: s.subtitle?.text.trim() || null, body: joinText(s.paragraphs), features: features.length ? (features as unknown as Prisma.InputJsonValue) : undefined, footnote: s.footnote?.text.trim() || null, images: images.length ? (images as unknown as Prisma.InputJsonValue) : undefined, source: "banner", extractionId: it.id });
    }
  }
  const mediaIds = rows.map((r) => r.mediaId).filter((x): x is string => !!x);
  await db.$transaction([
    db.productSection.deleteMany({ where: { productId, extractionId: { in: items.map((i) => i.id) } } }),
    ...(created.length ? [db.productSection.createMany({ data: created })] : []),
    ...items.map((i) => db.bannerExtraction.update({ where: { id: i.id }, data: { doc: i.doc as unknown as Prisma.InputJsonValue, status: "published", publishedAt: new Date() } })),
    ...(opts.hideSources && mediaIds.length ? [db.media.updateMany({ where: { id: { in: mediaIds }, productId }, data: { hidden: true } })] : []),
  ]);
  return { sections: created.length, crops, hidden: opts.hideSources ? mediaIds.length : 0 };
}

/** Οι δημοσιευμένες ενότητες ενός προϊόντος, όπως τις αποδίδει η σελίδα. */
export async function productSections(productId: string): Promise<PublishedSection[]> {
  const rows = await db.productSection.findMany({ where: { productId, hidden: false }, orderBy: { sortNo: "asc" } });
  return rows.map((r) => ({ id: r.id, title: r.title, subtitle: r.subtitle, body: r.body, footnote: r.footnote, features: (Array.isArray(r.features) ? r.features : []) as unknown as SectionFeature[], images: (Array.isArray(r.images) ? r.images : []) as unknown as SectionImage[] }));
}

/** Σβήνει τις ενότητες μιας απόδελτίωσης και ξαναδείχνει το αρχικό banner (αναίρεση δημοσίευσης). */
export async function unpublishExtraction(productId: string, id: string) {
  const row = await db.bannerExtraction.findFirst({ where: { id, productId } });
  if (!row) throw new Error("Η απόδελτίωση δεν βρέθηκε.");
  await db.$transaction([
    db.productSection.deleteMany({ where: { productId, extractionId: id } }),
    db.bannerExtraction.update({ where: { id }, data: { status: "draft", publishedAt: null } }),
    ...(row.mediaId ? [db.media.updateMany({ where: { id: row.mediaId, productId }, data: { hidden: false } })] : []),
  ]);
}
