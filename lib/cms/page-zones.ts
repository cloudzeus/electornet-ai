import "server-only";
import { cache } from "react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { BrandBlock } from "./brand-store";

/**
 * Ζώνες πληροφοριακών σελίδων: CmsDocument «page.zones», key = σελίδα (π.χ. «epikoinonia»).
 * `data` = πρόχειρο, `published` = ό,τι βλέπει ο πελάτης. Σχήμα: { blocks: BrandBlock[] } (κάθε block έχει zone).
 */
export const ZONES_COLLECTION = "page.zones";
const where = (key: string) => ({ collection_key_locale: { collection: ZONES_COLLECTION, key, locale: "el" } });
type Doc = { blocks: BrandBlock[] };
const asDoc = (j: Prisma.JsonValue | null | undefined): Doc | null => (j && typeof j === "object" && !Array.isArray(j) && Array.isArray((j as { blocks?: unknown }).blocks) ? (j as unknown as Doc) : null);

export const getPublishedZones = cache(async (key: string): Promise<BrandBlock[]> => {
  const d = await db.cmsDocument.findUnique({ where: where(key), select: { published: true } }).catch(() => null);
  return asDoc(d?.published)?.blocks ?? [];
});

export async function getZonesDoc(key: string) {
  const d = await db.cmsDocument.findUnique({ where: where(key) });
  return d ? { draft: asDoc(d.data)?.blocks ?? [], published: asDoc(d.published)?.blocks ?? null, updatedAt: d.updatedAt, publishedAt: d.publishedAt } : null;
}

export async function listZonesDocs() {
  const rows = await db.cmsDocument.findMany({ where: { collection: ZONES_COLLECTION }, select: { key: true, data: true, published: true, updatedAt: true, publishedAt: true } });
  return rows.map((r) => ({ key: r.key, draft: asDoc(r.data)?.blocks ?? [], published: asDoc(r.published)?.blocks ?? null, updatedAt: r.updatedAt, publishedAt: r.publishedAt }));
}

export async function saveZonesDraft(key: string, blocks: BrandBlock[], by: string) {
  const data = { blocks } as unknown as Prisma.InputJsonValue;
  return db.cmsDocument.upsert({ where: where(key), update: { data, updatedBy: by, version: { increment: 1 } }, create: { collection: ZONES_COLLECTION, key, locale: "el", data, updatedBy: by } });
}

export async function publishZones(key: string, by: string) {
  const d = await db.cmsDocument.findUnique({ where: where(key) });
  if (!d) throw new Error("Δεν υπάρχει πρόχειρο.");
  return db.cmsDocument.update({ where: where(key), data: { published: d.data as Prisma.InputJsonValue, publishedAt: new Date(), updatedBy: by } });
}

export async function revertZones(key: string, by: string) {
  const d = await db.cmsDocument.findUnique({ where: where(key) });
  if (!d?.published) throw new Error("Δεν υπάρχει δημοσιευμένη έκδοση.");
  return db.cmsDocument.update({ where: where(key), data: { data: d.published as Prisma.InputJsonValue, updatedBy: by, version: { increment: 1 } } });
}
