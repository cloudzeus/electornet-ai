import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { CopyOverrides } from "./copy";

/**
 * Αλλαγές στα κείμενα UI: CmsDocument «copy» (ένα έγγραφο ανά γλώσσα). `data` = πρόχειρο, `published` = ό,τι βλέπει
 * ο πελάτης. Αποθηκεύονται ΜΟΝΟ οι αλλαγμένες τιμές {namespace: {key: κείμενο}} — τα υπόλοιπα μένουν στις αρχικές.
 */
const where = { collection_key_locale: { collection: "copy", key: "ui", locale: "el" } };
const asMap = (j: Prisma.JsonValue | null | undefined): CopyOverrides => (j && typeof j === "object" && !Array.isArray(j) ? (j as unknown as CopyOverrides) : {});

let cache: { at: number; v: CopyOverrides } | null = null;
/** Οι δημοσιευμένες αλλαγές (cache 30″ — η δημοσίευση την ακυρώνει στο ίδιο instance). */
export async function getPublishedCopy(): Promise<CopyOverrides> {
  if (cache && Date.now() - cache.at < 30_000) return cache.v;
  const d = await db.cmsDocument.findUnique({ where, select: { published: true } }).catch(() => null);
  cache = { at: Date.now(), v: asMap(d?.published) };
  return cache.v;
}
export const invalidateCopy = () => { cache = null; };

export async function getCopyDoc() {
  const d = await db.cmsDocument.findUnique({ where });
  return { draft: asMap(d?.data), published: asMap(d?.published), updatedAt: d?.updatedAt ?? null, publishedAt: d?.publishedAt ?? null };
}

export async function saveCopyDraft(overrides: CopyOverrides, by: string) {
  const data = overrides as unknown as Prisma.InputJsonValue;
  return db.cmsDocument.upsert({ where, update: { data, updatedBy: by, version: { increment: 1 } }, create: { collection: "copy", key: "ui", locale: "el", data, updatedBy: by } });
}

export async function publishCopy(by: string) {
  const d = await db.cmsDocument.findUnique({ where });
  if (!d) throw new Error("Δεν υπάρχει πρόχειρο.");
  await db.cmsDocument.update({ where, data: { published: d.data as Prisma.InputJsonValue, publishedAt: new Date(), updatedBy: by } });
  invalidateCopy();
}

export async function revertCopyDraft(by: string) {
  const d = await db.cmsDocument.findUnique({ where });
  if (!d) return;
  await db.cmsDocument.update({ where, data: { data: (d.published ?? {}) as Prisma.InputJsonValue, updatedBy: by, version: { increment: 1 } } });
}
