import "server-only";
import { db } from "@/lib/db";
import { getProductsByIds } from "@/lib/data/repo";
import { sendMail } from "@/lib/email/send";
import { renderTemplate } from "@/lib/email/templates";

/**
 * Wishlist alerts. Runs after a price/stock sync or from the cron endpoint.
 *  • price drop / offer: current price < the price the customer saved it at
 *    (or < the last price we notified about) → one email per drop.
 *  • back in stock: availability flips from days/order to in-stock.
 * Respects the item switches, the customer status and the consent ledger
 * (latest «price-drop» / «back-in-stock» email decision must not be a refusal).
 */
export async function runWishlistAlerts(opts: { dryRun?: boolean; limit?: number } = {}) {
  const items = await db.wishlistItem.findMany({ where: { OR: [{ notifyPriceDrop: true }, { notifyBackInStock: true }] }, include: { list: { include: { customer: { select: { id: true, email: true, firstName: true, status: true } } } } }, take: opts.limit ?? 2000 });
  const products = await getProductsByIds([...new Set(items.map((i) => i.productId))]);
  const byId = new Map(products.map((p) => [p.id, p]));
  const refused = new Set((await db.consent.findMany({ where: { topic: { in: ["price-drop", "back-in-stock"] }, channel: "email" }, orderBy: { at: "desc" }, distinct: ["customerId", "topic"], select: { customerId: true, topic: true, granted: true } })).filter((c) => !c.granted).map((c) => `${c.customerId}:${c.topic}`));
  let priceDrops = 0, backInStock = 0, skipped = 0;
  for (const it of items) {
    const p = byId.get(it.productId); const c = it.list.customer;
    if (!p || c.status !== "active") { skipped++; continue; }
    const saved = it.priceAtAdd ? Number(it.priceAtAdd) : null;
    const lastNotified = it.lastNotifiedPrice ? Number(it.lastNotifiedPrice) : null;
    const reference = lastNotified ?? saved;
    // --- price drop / offer
    if (it.notifyPriceDrop && reference && p.price < reference && !refused.has(`${c.id}:price-drop`)) {
      if (!opts.dryRun) {
        const m = await renderTemplate("wishlist-price-drop", { firstName: c.firstName, product: { title: p.title, brand: p.brand, image: p.image, price: p.price, wasPrice: reference, href: `/proion/${p.slug}` }, was: reference, now: p.price });
        await sendMail({ to: c.email, template: "wishlist-price-drop", meta: { customerId: c.id, productId: p.id }, ...m });
        await db.wishlistItem.update({ where: { id: it.id }, data: { lastNotifiedPrice: p.price, lastNotifiedAt: new Date() } });
        await db.customerEvent.create({ data: { customerId: c.id, kind: "wishlist-alert", meta: { type: "price-drop", productId: p.id, was: reference, now: p.price } } }).catch(() => null);
      }
      priceDrops++;
    }
    // --- back in stock
    const avail = p.availability.kind === "in-stock" ? "in-stock" : p.availability.kind;
    if (it.notifyBackInStock && it.lastSeenAvailability && it.lastSeenAvailability !== "in-stock" && avail === "in-stock" && !refused.has(`${c.id}:back-in-stock`)) {
      if (!opts.dryRun) {
        const m = await renderTemplate("wishlist-back-in-stock", { firstName: c.firstName, product: { title: p.title, brand: p.brand, image: p.image, price: p.price, wasPrice: p.wasPrice ?? null, href: `/proion/${p.slug}` }, store: null });
        await sendMail({ to: c.email, template: "wishlist-back-in-stock", meta: { customerId: c.id, productId: p.id }, ...m });
        await db.wishlistItem.update({ where: { id: it.id }, data: { lastStockNotifiedAt: new Date() } });
        await db.customerEvent.create({ data: { customerId: c.id, kind: "wishlist-alert", meta: { type: "back-in-stock", productId: p.id } } }).catch(() => null);
      }
      backInStock++;
    }
    if (!opts.dryRun && it.lastSeenAvailability !== avail) await db.wishlistItem.update({ where: { id: it.id }, data: { lastSeenAvailability: avail } });
  }
  return { checked: items.length, priceDrops, backInStock, skipped };
}
