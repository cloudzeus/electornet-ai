import "server-only";
import { cutoutFor } from "@/lib/data/cutouts";
import { getProductsByIds } from "@/lib/data/repo";
import { db } from "@/lib/db";
import type { StickerParams } from "@/lib/stickers/model";
import { bannerCutouts } from "./banner-cutouts";
import type { BannerDesign, BannerProduct } from "./banner-design";

/** Πού εμφανίζεται το banner: οι κατηγορίες της σελίδας από την πιο ειδική στην πιο γενική, και το προϊόν της σελίδας (δεν διαφημίζεται στον εαυτό του). */
export interface BannerScope { cats: (string | null | undefined)[]; exclude?: string | null }

/**
 * Τα προϊόντα ενός σχεδιασμένου banner, με τιμή και φωτογραφία ΤΩΡΑ: όσα διάλεξε ο διαχειριστής ή της προσφοράς του.
 * Με `scope` (λίστα κατηγορίας, σελίδα προϊόντος) ισχύει ιεραρχία: πρώτα τα προϊόντα του ίδιου τύπου, μετά της ίδιας υποκατηγορίας,
 * μετά της ίδιας κατηγορίας — από όλη την καμπάνια του banner, όχι μόνο από τη δική του προσφορά. Αν δεν ταιριάζει κανένα,
 * μένουν τα προϊόντα του banner όπως είναι. Έτσι το ίδιο banner δείχνει άλλο προϊόν σε κάθε σελίδα.
 */
export async function bannerProducts(d: BannerDesign, promotionId: string | null, scope?: BannerScope | string | null): Promise<BannerProduct[]> {
  const sc: BannerScope | null = typeof scope === "string" ? { cats: [scope] } : scope ?? null;
  const levels = (sc?.cats ?? []).filter((x): x is string => !!x);
  let ids: string[] = [];
  if (d.products.source === "manual") ids = d.products.ids;
  else if (d.products.source === "promotion" && promotionId) ids = await (await import("./landing")).promotionProductIds(promotionId, levels.length ? 500 : d.products.max);
  if (levels.length && promotionId) {
    // μετρά όλη η καμπάνια: το banner μπορεί να ανήκει στην προσφορά «−15 %», αλλά οι σκούπες της καμπάνιας να είναι στο «−10 %» και το «−20 %»
    const camp = await db.promotion.findUnique({ where: { id: promotionId }, select: { campaignId: true } });
    const siblings = camp?.campaignId ? await db.promotion.findMany({ where: { campaignId: camp.campaignId, id: { not: promotionId } }, select: { id: true } }) : [];
    const { promotionProductIds } = await import("./landing");
    for (const s of siblings) ids = [...ids, ...(await promotionProductIds(s.id, 500))];
    ids = [...new Set(ids)];
  }
  if (sc?.exclude) ids = ids.filter((id) => id !== sc.exclude);
  if (ids.length && levels.length) {
    const rows = await db.product.findMany({ where: { id: { in: ids } }, select: { id: true, category: { select: { slug: true, parent: { select: { slug: true, parent: { select: { slug: true } } } } } } } });
    // βαθμός = η πιο ειδική κατηγορία της σελίδας που περιέχει το προϊόν (0 = ίδιος τύπος)
    const rank = new Map(rows.map((r) => { const chain = [r.category?.slug, r.category?.parent?.slug, r.category?.parent?.parent?.slug]; const k = levels.findIndex((l) => chain.includes(l)); return [r.id, k < 0 ? Infinity : k] as const; }));
    const hit = ids.filter((id) => (rank.get(id) ?? Infinity) !== Infinity);
    if (hit.length) {
      // Συνάφεια πάνω απ' όλα: όταν η καμπάνια έχει έστω ένα προϊόν της κατηγορίας, το banner δεν δείχνει ΠΟΤΕ άσχετα (φριτέζα σε σελίδα κλιματιστικού).
      ids = hit.sort((a, b) => rank.get(a)! - rank.get(b)!);
      // Slider που έμεινε με λίγα: συμπληρώνεται με άλλα προϊόντα της ΙΔΙΑΣ κατηγορίας που έχουν πραγματική έκπτωση τώρα (όποια προσφορά),
      // πρώτα του ίδιου τύπου, μετά της υποκατηγορίας, μετά της κατηγορίας — και από αυτά πρώτα η μεγαλύτερη έκπτωση.
      if (d.slider && ids.length < d.products.max) {
        const inLevels = { OR: [{ slug: { in: levels } }, { parent: { slug: { in: levels } } }, { parent: { parent: { slug: { in: levels } } } }] };
        const offers = await db.productOffer.findMany({ where: { productId: { notIn: [...ids, ...(sc?.exclude ? [sc.exclude] : [])] }, product: { active: true, price: { gt: 0 }, category: inLevels } }, select: { productId: true, price: true, listPrice: true, product: { select: { category: { select: { slug: true, parent: { select: { slug: true, parent: { select: { slug: true } } } } } } } } }, take: 300 });
        const extra = offers.filter((o) => Number(o.listPrice) > Number(o.price)).map((o) => { const c = o.product.category; const chain = [c?.slug, c?.parent?.slug, c?.parent?.parent?.slug]; const k = levels.findIndex((l) => chain.includes(l)); return { id: o.productId, k: k < 0 ? 99 : k, pct: 1 - Number(o.price) / Number(o.listPrice) }; }).sort((a, b) => a.k - b.k || b.pct - a.pct);
        ids = [...ids, ...extra.map((x) => x.id)];
      }
    }
  }
  if (!ids.length) return [];
  // Με «Αφαίρεση φόντου» και προϊόντα που διαλέγει μόνο του το banner («Της προσφοράς»): μπαίνουν ΜΟΝΟ όσα έχουν καθαρή φωτογραφία χωρίς φόντο.
  // Όσα το μοντέλο τα χαλάει (π.χ. λευκό πλυντήριο σε λευκό φόντο) μένουν εκτός, αντί να φανούν σε λευκό πλαίσιο δίπλα στα υπόλοιπα.
  // Προϊόντα που διάλεξε ο διαχειριστής με το χέρι δεν κόβονται ποτέ· ούτε όταν δεν θα έμενε κανένα.
  const auto = d.products.cutout && d.products.source === "promotion";
  const pool = await getProductsByIds(auto ? ids.slice(0, Math.max(d.products.max * 3, 24)) : ids.slice(0, d.products.max));
  const cuts = d.products.cutout ? await bannerCutouts(pool.map((p) => p.id)).catch(() => new Map<string, string>()) : new Map<string, string>();
  const clean = auto ? pool.filter((p) => cuts.has(p.id) || cutoutFor(p.image)) : pool;
  const list = (clean.length ? clean : pool).slice(0, d.products.max);
  return list.filter((p) => p.price > 0).map((p) => {
    const cut = d.products.cutout ? cuts.get(p.id) ?? cutoutFor(p.image) : null;
    return { id: p.id, brand: p.brand, title: p.title, href: `/proion/${p.slug}`, image: cut ?? p.image, cutout: !!cut, price: p.price, wasPrice: p.wasPrice ?? null, energy: p.energy?.cls ?? null };
  });
}

/**
 * Όλα τα προϊόντα που ΜΠΟΡΕΙ να δείξει ένα banner (για να ετοιμαστούν οι φωτογραφίες τους χωρίς φόντο στην αποθήκευση):
 * όσα διάλεξε ο διαχειριστής, ή — με πηγή «Της προσφοράς» — τα προϊόντα όλης της καμπάνιας, γιατί σε κάθε κατηγορία δείχνει άλλα.
 */
export async function bannerCandidateIds(d: BannerDesign, promotionId: string | null, limit = 40): Promise<string[]> {
  if (d.products.source === "manual") return d.products.ids;
  if (d.products.source !== "promotion" || !promotionId) return [];
  const { promotionProductIds } = await import("./landing");
  const camp = await db.promotion.findUnique({ where: { id: promotionId }, select: { campaignId: true } });
  const promos = camp?.campaignId ? (await db.promotion.findMany({ where: { campaignId: camp.campaignId }, select: { id: true } })).map((x) => x.id) : [promotionId];
  const ids = new Set<string>();
  for (const id of [promotionId, ...promos]) for (const x of await promotionProductIds(id, 500)) ids.add(x);
  return [...ids].slice(0, limit);
}

/** Το sticker ενός σχεδιασμένου banner (μόνο ενεργό) — τα στοιχεία σχεδίασής του για το StickerSvg. */
export async function bannerSticker(key: string | null): Promise<StickerParams | null> {
  if (!key) return null;
  const row = await db.sticker.findFirst({ where: { key, active: true }, select: { params: true } }).catch(() => null);
  return (row?.params as unknown as StickerParams | undefined) ?? null;
}
