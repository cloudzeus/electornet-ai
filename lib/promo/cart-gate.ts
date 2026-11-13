import "server-only";
import { db } from "@/lib/db";
import { swr } from "@/lib/cache/swr";
import { gateMessage, type CartGate } from "./campaign-core";
import { promotionProductIds } from "./landing";

/**
 * Οι φραγές αγορών που ισχύουν τώρα: καμπάνιες που τρέχουν και έχουν «έναρξη αγορών» στο μέλλον, με τα προϊόντα των προσφορών τους.
 * Τις διαβάζει το καλάθι του πελάτη (για το μήνυμα) και το ταμείο (για να μην περάσει παραγγελία πριν την ώρα).
 */
export const cartGates = swr(async (): Promise<CartGate[]> => {
  const now = new Date();
  const rows = await db.campaign.findMany({
    where: { status: { in: ["live", "scheduled"] }, startsAt: { lte: now }, endsAt: { gt: now }, cartOpensAt: { gt: now } },
    select: { title: true, cartOpensAt: true, cartMessage: true, promotions: { select: { id: true } }, landings: { where: { status: "published" }, select: { slug: true }, take: 1 } },
  });
  return Promise.all(rows.map(async (c) => ({
    ids: [...new Set((await Promise.all(c.promotions.map((p) => promotionProductIds(p.id, 500)))).flat())],
    opensAt: c.cartOpensAt!.toISOString(), title: c.title, message: gateMessage(c.cartMessage, c.cartOpensAt!),
    href: c.landings[0] ? `/prosfores/${c.landings[0].slug}` : null,
  })));
}, 30_000);
