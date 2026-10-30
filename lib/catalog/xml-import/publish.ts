import "server-only";
import { db } from "@/lib/db";
import { resetCatalogCache } from "@/lib/data/db-catalog";
import { UserError } from "@/lib/catalog/foreign-import/core";
import { attachPendingImages, catchUpProducts } from "@/lib/catalog/xml-import/queue";

/**
 * Το τελευταίο βήμα: **προετοιμασία → διορθώσεις → δημοσίευση.**
 *
 * Τα νέα είδη γεννιούνται πάντα ανενεργά (`pending.ts`: «πάντα ανενεργό») — δηλαδή δεν φαίνονται στο site. Αυτό είναι
 * σκόπιμο: ο χρήστης θέλει να δει το προϊόν με τις φωτογραφίες του και τα χαρακτηριστικά του, να διορθώσει ό,τι
 * χρειάζεται, και μόνο μετά να το βγάλει στον κόσμο. Εδώ ζει αυτό το βήμα για τα προϊόντα ΑΥΤΟΥ του feed.
 *
 * Οι φωτογραφίες δένονται πρώτες: προϊόν που δημοσιεύεται χωρίς φωτογραφία είναι χειρότερο από προϊόν που περιμένει.
 */

export const PAGE = 50;
export type PublishFilter = "all" | "draft" | "live";

export interface PublishRow {
  itemId: string;
  sku: string;
  productId: string;
  name: string;
  active: boolean;
  images: number;
  mtrl: number | null;
}

export interface PublishCounts {
  products: number;
  live: number;
  draft: number;
  /** μπήκαν, αλλά δεν έχουν ακόμη προϊόν: νέα είδη σε αναμονή έγκρισης / SoftOne */
  waiting: number;
}

async function counts(feedId: string): Promise<PublishCounts> {
  const [rows, waiting] = await Promise.all([
    db.supplierFeedItem.findMany({ where: { feedId, productId: { not: null } }, select: { productId: true } }),
    db.supplierFeedItem.count({ where: { feedId, status: "done", productId: null } }),
  ]);
  const ids = [...new Set(rows.map((r) => r.productId as string))];
  const live = ids.length ? await db.product.count({ where: { id: { in: ids }, active: true } }) : 0;
  return { products: ids.length, live, draft: ids.length - live, waiting };
}

/** Μία σελίδα των προϊόντων που έβγαλε αυτό το feed, με το αν φαίνονται στο site. */
export async function publishList(feedId: string, page = 1, only: PublishFilter = "all"): Promise<{ rows: PublishRow[]; total: number; page: number; pages: number; counts: PublishCounts }> {
  // Νέα είδη που εγκρίθηκαν στο μεταξύ έχουν πια προϊόν: η λίστα πρέπει να τα δει, χωρίς να πατήσει κανείς τίποτα.
  await catchUpProducts(feedId);
  const c = await counts(feedId);
  const items = await db.supplierFeedItem.findMany({ where: { feedId, productId: { not: null } }, orderBy: { sku: "asc" },
    select: { id: true, sku: true, productId: true, assetIds: true, mtrl: true } });
  const prods = items.length
    ? await db.product.findMany({ where: { id: { in: items.map((i) => i.productId as string) } }, select: { id: true, title: true, active: true } })
    : [];
  const byId = new Map(prods.map((p) => [p.id, p]));
  const all = items
    .map((i): PublishRow | null => {
      const p = byId.get(i.productId as string);
      // Το προϊόν μπορεί να διαγράφηκε στο μεταξύ: η γραμμή δεν είναι πια δημοσιεύσιμη.
      if (!p) return null;
      return { itemId: i.id, sku: i.sku, productId: p.id, name: p.title, active: p.active, images: ((i.assetIds ?? []) as string[]).length, mtrl: i.mtrl };
    })
    .filter((r): r is PublishRow => !!r)
    .filter((r) => (only === "draft" ? !r.active : only === "live" ? r.active : true));
  const at = Math.max(1, page);
  return { rows: all.slice((at - 1) * PAGE, at * PAGE), total: all.length, page: at, pages: Math.max(1, Math.ceil(all.length / PAGE)), counts: c };
}

/**
 * Δημοσίευση: οι φωτογραφίες δένονται στα προϊόντα και μετά τα επιλεγμένα γίνονται ενεργά. `"draft"` = όλα τα πρόχειρα
 * αυτού του feed. Προϊόν που είναι ήδη ενεργό δεν αγγίζεται.
 */
export async function publishProducts(feedId: string, which: string[] | "draft"): Promise<{ published: number; attached: number; skipped: number }> {
  const { attached } = await attachPendingImages(feedId);
  const items = await db.supplierFeedItem.findMany({
    where: { feedId, productId: { not: null }, ...(which === "draft" ? {} : { id: { in: which.slice(0, 5000) } }) },
    select: { productId: true },
  });
  const ids = [...new Set(items.map((i) => i.productId as string))];
  if (!ids.length) throw new UserError("Κανένα προϊόν προς δημοσίευση — τα νέα είδη περιμένουν πρώτα έγκριση.");
  const r = await db.product.updateMany({ where: { id: { in: ids }, active: false }, data: { active: true } });
  if (r.count) resetCatalogCache();
  return { published: r.count, attached, skipped: ids.length - r.count };
}
