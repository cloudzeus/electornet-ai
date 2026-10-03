import "server-only";
import { cache } from "react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { BrandStore } from "./brand-store";

/**
 * Brand stores στη βάση: CmsDocument (collection «brand.stores», key = slug μάρκας).
 *  - `data`      = πρόχειρο που επεξεργάζεται ο διαχειριστής (αποθηκεύεται αυτόματα)
 *  - `published` = ό,τι βλέπει ο πελάτης· null = η μάρκα δείχνει μόνο τον κατάλογο
 * Η βιτρίνα διαβάζει ΜΟΝΟ το published· το πρόχειρο φαίνεται στην προεπισκόπηση του προσωπικού.
 */
export const COLLECTION = "brand.stores";
const LOCALE = "el";
const where = (slug: string) => ({ collection_key_locale: { collection: COLLECTION, key: slug, locale: LOCALE } });
const asStore = (j: Prisma.JsonValue | null | undefined) => (j && typeof j === "object" && !Array.isArray(j) ? (j as unknown as BrandStore) : null);

/** Η δημοσιευμένη σελίδα μιας μάρκας (βιτρίνα). */
export const getPublishedStore = cache(async (slug: string): Promise<BrandStore | null> => {
  const d = await db.cmsDocument.findUnique({ where: where(slug), select: { published: true } }).catch(() => null);
  return asStore(d?.published);
});

/** Όλες οι δημοσιευμένες (για τη σελίδα /brands). */
export const getPublishedStores = cache(async (): Promise<BrandStore[]> => {
  const rows = await db.cmsDocument.findMany({ where: { collection: COLLECTION, locale: LOCALE, published: { not: Prisma.DbNull } }, orderBy: { publishedAt: "desc" }, select: { published: true } }).catch(() => []);
  return rows.map((r) => asStore(r.published)).filter((s): s is BrandStore => !!s);
});

export async function getStoreDoc(slug: string) {
  const d = await db.cmsDocument.findUnique({ where: where(slug) });
  if (!d) return null;
  return { draft: asStore(d.data)!, published: asStore(d.published), version: d.version, updatedAt: d.updatedAt, publishedAt: d.publishedAt, updatedBy: d.updatedBy };
}

export async function listStoreDocs() {
  const rows = await db.cmsDocument.findMany({ where: { collection: COLLECTION, locale: LOCALE }, select: { key: true, data: true, published: true, updatedAt: true, publishedAt: true } });
  return rows.map((r) => ({ slug: r.key, draft: asStore(r.data), published: asStore(r.published), updatedAt: r.updatedAt, publishedAt: r.publishedAt }));
}

export async function saveDraft(slug: string, store: BrandStore, by: string) {
  const data = store as unknown as Prisma.InputJsonValue;
  return db.cmsDocument.upsert({
    where: where(slug),
    update: { data, updatedBy: by, version: { increment: 1 } },
    create: { collection: COLLECTION, key: slug, locale: LOCALE, data, updatedBy: by },
  });
}

export async function publishDraft(slug: string, by: string) {
  const d = await db.cmsDocument.findUnique({ where: where(slug) });
  if (!d) throw new Error("Δεν υπάρχει πρόχειρο.");
  return db.cmsDocument.update({ where: where(slug), data: { published: d.data as Prisma.InputJsonValue, publishedAt: new Date(), updatedBy: by } });
}

export async function unpublish(slug: string, by: string) {
  return db.cmsDocument.update({ where: where(slug), data: { published: Prisma.DbNull, updatedBy: by } });
}

/** Το πρόχειρο γυρίζει στη δημοσιευμένη έκδοση (ακύρωση αλλαγών). */
export async function revertDraft(slug: string, by: string) {
  const d = await db.cmsDocument.findUnique({ where: where(slug) });
  if (!d?.published) throw new Error("Δεν υπάρχει δημοσιευμένη έκδοση.");
  return db.cmsDocument.update({ where: where(slug), data: { data: d.published as Prisma.InputJsonValue, updatedBy: by, version: { increment: 1 } } });
}
