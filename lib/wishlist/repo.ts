import "server-only";
import { db } from "@/lib/db";
import { getProductsByIds } from "@/lib/data/repo";
import type { Product } from "@/lib/data/types";

/**
 * @dynamic Favourites for signed-in customers. Guests keep ids in
 * localStorage (CartProvider); on login the client merges them into the
 * default list. Products are resolved from the catalogue on read, so items
 * always show current price/stock next to the price they were added at.
 */
/** Atomic: concurrent heart clicks right after login never create two default lists. */
export async function ensureDefaultList(customerId: string) {
  return db.wishlistList.upsert({ where: { customerId_key: { customerId, key: "default" } }, update: {}, create: { customerId, key: "default", isDefault: true, name: "Η λίστα μου" } });
}

export async function listIds(customerId: string) {
  const lists = await db.wishlistList.findMany({ where: { customerId }, include: { items: { select: { productId: true } } } });
  return { ids: [...new Set(lists.flatMap((l) => l.items.map((i) => i.productId)))], lists: lists.map((l) => ({ id: l.id, name: l.name, isDefault: l.isDefault, count: l.items.length })) };
}

export async function addItems(customerId: string, productIds: string[], listId?: string | null, source = "web") {
  const list = listId ? await db.wishlistList.findFirst({ where: { id: listId, customerId } }) : await ensureDefaultList(customerId);
  if (!list) return { ok: false as const, error: "Η λίστα δεν βρέθηκε." };
  const products = await getProductsByIds(productIds);
  await db.wishlistItem.createMany({ data: products.map((p) => ({ listId: list.id, productId: p.id, priceAtAdd: p.price, source })), skipDuplicates: true });
  await db.wishlistList.update({ where: { id: list.id }, data: { updatedAt: new Date() } });
  return { ok: true as const, listId: list.id };
}

export async function removeItems(customerId: string, productIds: string[], listId?: string | null) {
  const where = listId ? { listId, list: { customerId } } : { list: { customerId } };
  await db.wishlistItem.deleteMany({ where: { ...where, productId: { in: productIds } } });
  return { ok: true as const };
}

export interface WishlistItemView { id: string; productId: string; product: Product | null; note: string | null; priority: number; priceAtAdd: number | null; notifyPriceDrop: boolean; notifyBackInStock: boolean; addedAt: string; drop: number | null }
export interface WishlistView { id: string; name: string; isDefault: boolean; visibility: string; shareToken: string; items: WishlistItemView[] }

export async function getLists(customerId: string): Promise<WishlistView[]> {
  const lists = await db.wishlistList.findMany({ where: { customerId }, orderBy: [{ isDefault: "desc" }, { sort: "asc" }, { createdAt: "asc" }], include: { items: { orderBy: { addedAt: "desc" } } } });
  const products = await getProductsByIds([...new Set(lists.flatMap((l) => l.items.map((i) => i.productId)))]);
  const byId = new Map(products.map((p) => [p.id, p]));
  return lists.map((l) => ({ id: l.id, name: l.name, isDefault: l.isDefault, visibility: l.visibility, shareToken: l.shareToken, items: l.items.map((i) => { const p = byId.get(i.productId) ?? null; const was = i.priceAtAdd ? Number(i.priceAtAdd) : null; return { id: i.id, productId: i.productId, product: p, note: i.note, priority: i.priority, priceAtAdd: was, notifyPriceDrop: i.notifyPriceDrop, notifyBackInStock: i.notifyBackInStock, addedAt: i.addedAt.toISOString(), drop: p && was && p.price < was ? Math.round(was - p.price) : null }; }) }));
}

export async function getSharedList(token: string) {
  const l = await db.wishlistList.findUnique({ where: { shareToken: token }, include: { items: { orderBy: { addedAt: "desc" } }, customer: { select: { firstName: true } } } });
  if (!l || l.visibility !== "link") return null;
  const products = await getProductsByIds(l.items.map((i) => i.productId));
  return { name: l.name, owner: l.customer.firstName, products };
}

/** Customers to notify when a product's price drops below what they saved it at (used by the catalogue sync). */
export async function priceDropSubscribers(productId: string, newPrice: number) {
  const items = await db.wishlistItem.findMany({ where: { productId, notifyPriceDrop: true, priceAtAdd: { gt: newPrice } }, include: { list: { include: { customer: { select: { id: true, email: true, firstName: true, status: true } } } } } });
  return items.filter((i) => i.list.customer.status === "active").map((i) => ({ customerId: i.list.customer.id, email: i.list.customer.email, firstName: i.list.customer.firstName, priceAtAdd: Number(i.priceAtAdd) }));
}
