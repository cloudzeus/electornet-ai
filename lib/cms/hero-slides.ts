import "server-only";
import { cache } from "react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getProductsByIds } from "@/lib/data/repo";
import { cutoutFor } from "@/lib/data/cutouts";
import type { HeroSlide, Product } from "@/lib/data/types";
import { getServiceList } from "@/lib/services/catalog";
import { DEFAULT_HERO_DOC, athensDay, dealFor, endOfAthensDay, pickSlides, toHeroSlide, type HeroDoc, type HeroSlideDoc, type ProductInfo } from "./hero-slides-model";

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

/** Το δημοσιευμένο έγγραφο (μία ανάγνωση ανά αίτημα). */
const getPublishedHeroDoc = cache(async (): Promise<HeroDoc | null> => {
  const d = await db.cmsDocument.findUnique({ where, select: { published: true } }).catch(() => null);
  return asDoc(d?.published);
});

/** Τα slides του hero για αυτό το αίτημα. */
export const getLiveHeroSlides = cache(async (): Promise<HeroSlide[]> => resolve(pickSlides(await getPublishedHeroDoc(), new Date())));

/**
 * «Προσφορά ημέρας»: το προϊόν που διάλεξε ο διαχειριστής για σήμερα· αλλιώς η μεγαλύτερη ΠΡΑΓΜΑΤΙΚΗ έκπτωση
 * (ProductOffer, έναντι της χαμηλότερης τιμής 30 ημερών — Omnibus) σε προϊόν με απόθεμα. Χωρίς τίποτα → null και το
 * πλακίδιο δεν εμφανίζεται: ποτέ σταθερό ή επινοημένο προϊόν/τιμή. Λήξη: τα μεσάνυχτα, ή νωρίτερα αν λήγει η προσφορά.
 */
export const getHeroDeal = cache(async (): Promise<{ product: Product; endsAt: string } | null> => {
  const now = new Date();
  let id = dealFor(await getPublishedHeroDoc(), now);
  if (!id) {
    const offers = await db.productOffer.findMany({
      where: { OR: [{ endsAt: null }, { endsAt: { gt: now } }], product: { active: true, stock: { gt: 0 } } },
      select: { productId: true, price: true, listPrice: true, lowest30: true }, take: 1000,
    }).catch(() => []);
    let best = 0;
    for (const o of offers) {
      const price = Number(o.price), ref = Number(o.lowest30 ?? o.listPrice);
      const pct = ref > 0 ? 1 - price / ref : 0;
      if (price > 0 && pct > best) { best = pct; id = o.productId; }
    }
  }
  if (!id) return null;
  const [p] = await getProductsByIds([id]).catch(() => []);
  if (!p || p.noPrice || !p.price) return null;
  const dayEnd = endOfAthensDay(athensDay(now));
  return { product: p, endsAt: p.dealEndsAt && p.dealEndsAt < dayEnd ? p.dealEndsAt : dayEnd };
});

/** Για τη διαχείριση της αρχικής: ποια είναι σήμερα η «Προσφορά ημέρας» και αν ορίστηκε χειροκίνητα ή αυτόματα. */
export async function heroDealInfo(): Promise<{ title: string; image: string | null; manual: boolean } | null> {
  const manual = !!dealFor(await getPublishedHeroDoc(), new Date());
  const d = await getHeroDeal();
  return d ? { title: `${d.product.brand} ${d.product.title}`, image: d.product.image ?? null, manual } : null;
}

/** Οι υπηρεσίες του πλακιδίου, με τη σειρά που όρισε ο διαχειριστής (αλλιώς οι πρώτες 4). */
export const getHeroServices = cache(async (): Promise<{ title: string; blurb: string }[]> => {
  const chosen = (await getPublishedHeroDoc())?.services ?? [];
  const ALL_SERVICES = await getServiceList();
  const list = chosen.length ? chosen.map((slug) => ALL_SERVICES.find((x) => x.slug === slug)).filter((x): x is (typeof ALL_SERVICES)[number] => !!x) : ALL_SERVICES.slice(0, 4);
  return list.map((x) => ({ title: x.title, blurb: x.blurb }));
});

/** Όλες οι υπηρεσίες (για τον επεξεργαστή). */
export const allHeroServices = async () => (await getServiceList()).map((x) => ({ slug: x.slug, title: x.title, blurb: x.blurb }));
