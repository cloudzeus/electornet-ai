import "server-only";
import { cache } from "react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { defaultHomeDoc, normalizeHomeDoc, type HomeDoc } from "./home-sections";

/**
 * Η αρχική στη διαχείριση: CmsDocument «home.layout»/«home». `data` = πρόχειρο, `published` = ό,τι βλέπει ο πελάτης.
 * Χωρίς δημοσιευμένη έκδοση η αρχική είναι η προεπιλογή (η σημερινή, βλ. home-sections).
 */
const COLLECTION = "home.layout";
const where = { collection_key_locale: { collection: COLLECTION, key: "home", locale: "el" } };

export const getPublishedHome = cache(async (): Promise<HomeDoc> => {
  const d = await db.cmsDocument.findUnique({ where, select: { published: true } }).catch(() => null);
  return d?.published ? normalizeHomeDoc(d.published) : defaultHomeDoc();
});

export async function getHomeDoc() {
  const d = await db.cmsDocument.findUnique({ where });
  return {
    draft: d?.data ? normalizeHomeDoc(d.data) : d?.published ? normalizeHomeDoc(d.published) : defaultHomeDoc(),
    published: d?.published ? normalizeHomeDoc(d.published) : null,
    updatedAt: d?.updatedAt ?? null, publishedAt: d?.publishedAt ?? null,
  };
}

export async function saveHomeDraft(doc: HomeDoc, by: string) {
  const data = normalizeHomeDoc(doc) as unknown as Prisma.InputJsonValue;
  return db.cmsDocument.upsert({ where, update: { data, updatedBy: by, version: { increment: 1 } }, create: { collection: COLLECTION, key: "home", locale: "el", data, updatedBy: by } });
}

export async function publishHome(by: string) {
  const d = await db.cmsDocument.findUnique({ where });
  if (!d?.data) throw new Error("Δεν υπάρχει πρόχειρο.");
  return db.cmsDocument.update({ where, data: { published: d.data as Prisma.InputJsonValue, publishedAt: new Date(), updatedBy: by } });
}

export async function revertHome(by: string) {
  const d = await db.cmsDocument.findUnique({ where });
  if (!d?.published) throw new Error("Δεν υπάρχει δημοσιευμένη έκδοση.");
  return db.cmsDocument.update({ where, data: { data: d.published as Prisma.InputJsonValue, updatedBy: by, version: { increment: 1 } } });
}
