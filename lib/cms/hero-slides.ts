import "server-only";
import { cache } from "react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getProductsByIds } from "@/lib/data/repo";
import { cutoutFor } from "@/lib/data/cutouts";
import type { HeroSlide } from "@/lib/data/types";
import { DEFAULT_HERO_DOC, pickSlides, toHeroSlide, type HeroDoc, type HeroSlideDoc, type ProductInfo } from "./hero-slides-model";

/**
 * Hero slides στη βάση: CmsDocument «hero.slides»/«home». `data` = πρόχειρο, `published` = ό,τι βλέπει ο πελάτης.
 * Χωρίς έγγραφο η βιτρίνα δείχνει το DEFAULT_HERO_DOC (χωρίς τα ληγμένα) και ο επεξεργαστής το φορτώνει ως πρόχειρο.
 */
const where = { collection_key_locale: { collection: "hero.slides", key: "home", locale: "el" } };
const asDoc = (j: Prisma.JsonValue | null | undefined): HeroDoc | null => (j && typeof j === "object" && !Array.isArray(j) && Array.isArray((j as { slides?: unknown }).slides) ? (j as unknown as HeroDoc) : null);

export async function getHeroAdminDoc() {
  const d = await db.cmsDocument.findUnique({ where });
  return { draft: asDoc(d?.data) ?? DEFAULT_HERO_DOC, published: asDoc(d?.published), publishedAt: d?.publishedAt ?? null };
}

export async function saveHeroDraft(doc: HeroDoc, by: string) {
  const data = doc as unknown as Prisma.InputJsonValue;
  return db.cmsDocument.upsert({ where, update: { data, updatedBy: by, version: { increment: 1 } }, create: { collection: "hero.slides", key: "home", locale: "el", data, updatedBy: by } });
}

export async function publishHero(by: string) {
  const d = await db.cmsDocument.findUnique({ where });
  if (!d) throw new Error("Δεν υπάρχει πρόχειρο.");
  return db.cmsDocument.update({ where, data: { published: d.data as Prisma.InputJsonValue, publishedAt: new Date(), updatedBy: by } });
}

/** Το πρόχειρο γυρίζει στη δημοσιευμένη έκδοση. */
export async function revertHero(by: string): Promise<HeroDoc> {
  const d = await db.cmsDocument.findUnique({ where });
  const pub = asDoc(d?.published);
  if (!pub) throw new Error("Δεν υπάρχει δημοσιευμένη έκδοση.");
  await db.cmsDocument.update({ where, data: { data: pub as unknown as Prisma.InputJsonValue, updatedBy: by, version: { increment: 1 } } });
  return pub;
}

export async function productInfos(ids: string[]): Promise<Record<string, ProductInfo>> {
  if (!ids.length) return {};
  const ps = await getProductsByIds(ids).catch(() => []);
  return Object.fromEntries(ps.map((p) => [p.id, { title: `${p.brand} ${p.title}`, slug: p.slug, cutout: cutoutFor(p.image) ?? p.image ?? null, price: p.noPrice || !p.price ? null : p.price }]));
}

async function resolve(slides: HeroSlideDoc[]): Promise<HeroSlide[]> {
  const info = await productInfos([...new Set(slides.map((s) => s.productId).filter((x): x is string => !!x))]);
  return slides.map((s) => toHeroSlide(s, s.productId ? info[s.productId] ?? null : null));
}

/** Τα slides του hero για αυτό το αίτημα (μία ανάγνωση ανά αίτημα). */
export const getLiveHeroSlides = cache(async (): Promise<HeroSlide[]> => {
  const d = await db.cmsDocument.findUnique({ where, select: { published: true } }).catch(() => null);
  return resolve(pickSlides(asDoc(d?.published), new Date()));
});
