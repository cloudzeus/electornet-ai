import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Λίστα εργασίας απόδελτίωσης: προϊόντα που έχουν ορατά banners και καμία ενότητα ακόμη — πρώτα όσα πουλιούνται
 * (απόθεμα, μετά τιμή), γιατί εκεί η σελίδα βλέπεται περισσότερο.
 */
export const TODO: Prisma.ProductWhereInput = { source: "softone", active: true, media: { some: { kind: "banner", hidden: false } }, sections: { none: {} } };
export const ORDER: Prisma.ProductOrderByWithRelationInput[] = [{ stock: "desc" }, { price: "desc" }, { id: "asc" }];

export async function nextToExtract(exceptId?: string, categoryId?: string) {
  const p = await db.product.findFirst({ where: { AND: [TODO, ...(exceptId ? [{ id: { not: exceptId } }] : []), ...(categoryId ? [{ categoryId }] : [])] }, orderBy: ORDER, select: { id: true } });
  return p ? `/admin/catalog/${p.id}/banners` : null;
}
