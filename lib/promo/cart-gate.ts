import "server-only";
import { db } from "@/lib/db";
import { swr } from "@/lib/cache/swr";
import { gateMessage, type CartGate } from "./campaign-core";
import { promotionProductIds } from "./landing";

/**
 * Οι φραγές αγορών που ισχύουν τώρα: καμπάνιες και προσφορές που τρέχουν και έχουν «έναρξη αγορών» στο μέλλον, με τα προϊόντα τους.
 * Τις διαβάζει το καλάθι του πελάτη (για το μήνυμα) και το ταμείο (για να μην περάσει παραγγελία πριν την ώρα).
 */
export const cartGates = swr(async (): Promise<CartGate[]> => {
  const now = new Date();
  const rows = await db.campaign.findMany({
    where: { status: { in: ["live", "scheduled"] }, startsAt: { lte: now }, endsAt: { gt: now }, cartOpensAt: { gt: now } },
    select: { title: true, cartOpensAt: true, cartMessage: true, promotions: { select: { id: true } }, landings: { where: { status: "published" }, select: { slug: true }, take: 1 } },
  });
  // και προσφορές με δική τους «έναρξη αγορών» (βήμα «Πότε» του οδηγού)
  const promos = (await db.promotion.findMany({ where: { status: "active", held: false, rules: { path: ["cartOpensAt"], gt: now.toISOString() } }, select: { id: true, name: true, rules: true } }))
    .map((p) => ({ id: p.id, name: p.name, at: new Date(String((p.rules as { cartOpensAt?: string }).cartOpensAt)) })).filter((p) => p.at > now);
  const own: CartGate[] = await Promise.all(promos.map(async (p) => ({ ids: await promotionProductIds(p.id, 500), opensAt: p.at.toISOString(), title: p.name, message: gateMessage(null, p.at), href: null })));
  return [...own, ...await Promise.all(rows.map(async (c) => ({
    ids: [...new Set((await Promise.all(c.promotions.map((p) => promotionProductIds(p.id, 500)))).flat())],
    opensAt: c.cartOpensAt!.toISOString(), title: c.title, message: gateMessage(c.cartMessage, c.cartOpensAt!),
    href: c.landings[0] ? `/prosfores/${c.landings[0].slug}` : null,
  })))];
}, 30_000);
