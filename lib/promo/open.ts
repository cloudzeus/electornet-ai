import type { Prisma } from "@prisma/client";

/**
 * Οι προσφορές που προτείνονται για επιλογή (σε banner, σελίδα προσφοράς, ζώνη): ποτέ όσες έληξαν — ούτε με κατάσταση
 * «έληξε»/«αρχείο», ούτε με ημερομηνία λήξης που πέρασε. `keepId` = η ήδη επιλεγμένη, για να μη χαθεί από τη λίστα του editor.
 */
export function openPromoWhere(keepId?: string | null, now = new Date()): Prisma.PromotionWhereInput {
  const open: Prisma.PromotionWhereInput = { status: { notIn: ["archived", "ended"] }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] };
  return keepId ? { OR: [open, { id: keepId }] } : open;
}
