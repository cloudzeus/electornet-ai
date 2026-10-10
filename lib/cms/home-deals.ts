import "server-only";
import { db } from "@/lib/db";
import { getProductsByIds } from "@/lib/data/repo";
import type { Product } from "@/lib/data/types";
import { promoBlockData } from "./brand-auto";

/**
 * «Προσφορές της εβδομάδας» της αρχικής — τρεις πηγές, όπως τις ορίζει ο διαχειριστής (Ζώνες αρχικής):
 *  auto      → οι μεγαλύτερες εκπτώσεις τώρα (ενεργές τιμές προσφοράς, με απόθεμα)
 *  promotion → τα προϊόντα μιας προσφοράς από «Προσφορές & κουπόνια», με τη λήξη της
 *  products  → προϊόντα που διάλεξε, με λήξη που ορίζει
 * Αν η πηγή δεν δίνει προϊόντα (π.χ. η προσφορά έληξε), πέφτει στο «auto». Πραγματική λήξη (Omnibus): ποτέ ψεύτικη.
 */
export type DealsSource = "auto" | "promotion" | "products";
export interface DealsProps { source?: DealsSource; promotionId?: string; productIds?: string[]; endsAt?: string; limit?: number }

const nextSunday = () => { const end = new Date(); end.setDate(end.getDate() + ((7 - end.getDay()) % 7 || 7)); end.setHours(23, 59, 0, 0); return end; };
const label = (iso: string) => `Λήγουν ${new Intl.DateTimeFormat("el-GR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso))}`;

async function autoDeals(limit: number): Promise<{ ids: string[]; endsAt: string }> {
  const now = new Date();
  const offers = await db.productOffer.findMany({
    where: { OR: [{ endsAt: null }, { endsAt: { gt: now } }], product: { active: true, stock: { gt: 0 } } },
    select: { productId: true, price: true, listPrice: true, lowest30: true, endsAt: true }, take: 2000,
  }).catch(() => []);
  // και οι εκπτώσεις στις τιμές του καταλόγου (παλιά τιμή > τιμή), για όσα δεν έχουν τιμή προσφοράς
  const variants = await db.$queryRawUnsafe<{ productId: string; price: number; was: number }[]>(
    `SELECT v."productId", v.price::float AS price, v."wasPrice"::float AS was FROM "Variant" v JOIN "Product" p ON p.id = v."productId"
     WHERE p.active AND p.stock > 0 AND v.price > 0 AND v."wasPrice" > v.price ORDER BY (1 - v.price / v."wasPrice") DESC LIMIT 200`).catch(() => []);
  const ranked = [
    ...offers.map((o) => { const price = Number(o.price), ref = Number(o.lowest30 ?? o.listPrice); return { o: { productId: o.productId, endsAt: o.endsAt }, pct: price > 0 && ref > 0 ? 1 - price / ref : 0 }; }),
    ...variants.map((v) => ({ o: { productId: v.productId, endsAt: null as Date | null }, pct: 1 - v.price / v.was })),
  ].filter((x) => x.pct > 0.04).sort((a, b) => b.pct - a.pct);
  const seen = new Set<string>(); const pick = ranked.filter((x) => !seen.has(x.o.productId) && seen.add(x.o.productId)).slice(0, limit * 2);
  const ends = pick.map((x) => x.o.endsAt).filter((d): d is Date => !!d && d > now).sort((a, b) => +a - +b)[0];
  return { ids: pick.map((x) => x.o.productId), endsAt: (ends ?? nextSunday()).toISOString() };
}

export async function homeDeals(props: DealsProps): Promise<{ products: Product[]; endsAt: string; label: string; source: DealsSource }> {
  const limit = Math.max(2, Math.min(12, Number(props.limit) || 4));
  let source: DealsSource = props.source ?? "auto";
  let ids: string[] = [], endsAt = nextSunday().toISOString();
  if (source === "promotion" && props.promotionId) {
    const p = await promoBlockData(props.promotionId, limit).catch(() => null);
    if (p?.productIds.length) { ids = p.productIds; endsAt = p.endsAt ?? endsAt; } else source = "auto";
  } else if (source === "products" && props.productIds?.length) {
    ids = props.productIds;
    if (props.endsAt && new Date(props.endsAt) > new Date()) endsAt = props.endsAt;
  } else source = "auto";
  if (source === "auto") ({ ids, endsAt } = await autoDeals(limit));
  const list = (await getProductsByIds(ids).catch(() => [])).filter((p) => !p.noPrice && p.price);
  const byId = new Map(list.map((p) => [p.id, p]));
  const products = ids.map((id) => byId.get(id)).filter((p): p is Product => !!p).slice(0, limit);
  return { products, endsAt, label: label(endsAt), source };
}
