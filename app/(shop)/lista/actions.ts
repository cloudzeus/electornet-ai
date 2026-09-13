"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCustomerSession } from "@/lib/account/session";
import { addItems, removeItems } from "@/lib/wishlist/repo";

const me = async () => { const c = await getCustomerSession(); if (!c) throw new Error("Χρειάζεται σύνδεση."); return c; };
const own = async (customerId: string, listId: string) => { const l = await db.wishlistList.findFirst({ where: { id: listId, customerId } }); if (!l) throw new Error("Η λίστα δεν βρέθηκε."); return l; };
const done = () => { revalidatePath("/lista"); return { ok: true as const }; };

export async function createList(name: string) {
  const c = await me();
  const n = name.trim() || "Νέα λίστα";
  const l = await db.wishlistList.create({ data: { customerId: c.id, name: n } });
  revalidatePath("/lista");
  return { ok: true as const, id: l.id };
}
export async function renameList(listId: string, name: string) { const c = await me(); await own(c.id, listId); await db.wishlistList.update({ where: { id: listId }, data: { name: name.trim() || "Λίστα" } }); return done(); }
export async function deleteList(listId: string) { const c = await me(); const l = await own(c.id, listId); if (l.isDefault) return { ok: false as const, error: "Η βασική λίστα δεν διαγράφεται." }; await db.wishlistList.delete({ where: { id: listId } }); return done(); }
export async function setListVisibility(listId: string, visibility: "private" | "link") { const c = await me(); await own(c.id, listId); await db.wishlistList.update({ where: { id: listId }, data: { visibility } }); return done(); }
export async function updateItem(itemId: string, patch: { note?: string; priority?: number; notifyPriceDrop?: boolean; notifyBackInStock?: boolean }) {
  const c = await me();
  const it = await db.wishlistItem.findFirst({ where: { id: itemId, list: { customerId: c.id } } });
  if (!it) return { ok: false as const, error: "Δεν βρέθηκε." };
  await db.wishlistItem.update({ where: { id: itemId }, data: { ...(patch.note !== undefined ? { note: patch.note.trim() || null } : {}), ...(patch.priority !== undefined ? { priority: patch.priority } : {}), ...(patch.notifyPriceDrop !== undefined ? { notifyPriceDrop: patch.notifyPriceDrop } : {}), ...(patch.notifyBackInStock !== undefined ? { notifyBackInStock: patch.notifyBackInStock } : {}) } });
  return done();
}
export async function moveItem(itemId: string, toListId: string) {
  const c = await me();
  const it = await db.wishlistItem.findFirst({ where: { id: itemId, list: { customerId: c.id } } });
  if (!it) return { ok: false as const, error: "Δεν βρέθηκε." };
  await own(c.id, toListId);
  await db.wishlistItem.deleteMany({ where: { listId: toListId, productId: it.productId } });
  await db.wishlistItem.update({ where: { id: itemId }, data: { listId: toListId } });
  return done();
}
export async function removeItem(productId: string, listId: string) { const c = await me(); await removeItems(c.id, [productId], listId); return done(); }
export async function addToList(productId: string, listId: string) { const c = await me(); await addItems(c.id, [productId], listId); return done(); }
