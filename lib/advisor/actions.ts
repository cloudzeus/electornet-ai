import "server-only";
import { db } from "@/lib/db";
import { quoteCart } from "@/lib/cart/server";
import { getCustomerSession } from "@/lib/account/session";
import { addItems } from "@/lib/wishlist/repo";

/**
 * Πράξεις του Ερμή πάνω στα πραγματικά συστήματα του eshop: μεταφορικά από την ΙΔΙΑ μηχανή με το καλάθι (quoteCart —
 * couriers, ογκώδη, Αττική / Express, δωρεάν μεταφορικά, προσφορές) και αποθήκευση στις λίστες αγαπημένων του πελάτη.
 */

const eur = (cents: number) => Math.round(cents) / 100;

export interface ShippingAnswer {
  place: string | null; zip: string | null; goodsEur: number; freeShippingFromEur: number;
  options: { name: string; feeEur: number; eta: string; available: boolean; reason: string | null }[];
  bulky: string | null; note: string | null;
}

/** Τα μεταφορικά για αυτά τα προϊόντα (1 τεμάχιο το καθένα) προς τον τόπο του πελάτη — σαν να ήταν στο καλάθι του. */
export async function shippingFor(productIds: string[], place: string | null, clickCollectHours?: number): Promise<ShippingAnswer | null> {
  if (!productIds.length) return null;
  const products = await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, variants: { select: { id: true }, take: 1 } } });
  const lines = products.flatMap((p, i) => (p.variants[0] ? [{ id: `advisor-${i}`, variantId: p.variants[0].id, qty: 1, addons: null }] : []));
  if (!lines.length) return null;
  const zip = place?.match(/(?<!\d)(\d{3})\s?(\d{2})(?!\d)/)?.slice(1).join("") ?? null;
  // shortcut: ψεύτικο καλάθι μόνο με τις γραμμές — quoteCart διαβάζει μόνο το `lines`
  const q = await quoteCart({ zip, city: zip ? null : place, delivery: "courier" }, { lines } as unknown as Parameters<typeof quoteCart>[1]).catch(() => null);
  if (!q) return null;
  const options: ShippingAnswer["options"] = [];
  if (q.attica.attica) {
    options.push({ name: "Κανονική παράδοση euronics (Αττική)", feeEur: 0, eta: q.attica.standard.eta, available: true, reason: null });
    const x = q.attica.express;
    if (x?.state === "ok") options.push({ name: "ASAP Express", feeEur: eur(x.fee), eta: x.eta, available: true, reason: null });
  } else {
    for (const c of q.carriers) options.push({ name: c.name, feeEur: eur(c.fee), eta: c.eta, available: c.available, reason: c.reason });
    if (q.freight) options.push({ name: "Μεταφορική", feeEur: eur(q.freight.fee), eta: q.freight.eta, available: q.freight.available, reason: q.freight.reason });
  }
  options.push({ name: "Παραλαβή από κατάστημα", feeEur: 0, eta: clickCollectHours ? `έτοιμο σε ~${clickCollectHours} ώρες` : "όταν ειδοποιηθείς", available: true, reason: null });
  return {
    place, zip, goodsEur: eur(q.goods), freeShippingFromEur: eur(q.freeShippingFrom), options,
    bulky: q.bulky.courier ? null : q.bulky.reason,
    note: !place ? "δεν δόθηκε τόπος: οι τιμές είναι οι γενικές — ζήτα Τ.Κ. για ακρίβεια" : !zip && !q.attica.attica ? "χωρίς Τ.Κ.: η τιμή μπορεί να αλλάξει σε δυσπρόσιτες περιοχές" : null,
  };
}

export type SaveAnswer = { signedIn: false } | { signedIn: true; ok: boolean; list: string; count: number };

/** Βάζει τα προϊόντα στη λίστα του πελάτη: με όνομα → αυτή (τη φτιάχνει αν δεν υπάρχει), αλλιώς η βασική. */
export async function saveToList(productIds: string[], listName: string | null): Promise<SaveAnswer> {
  const me = await getCustomerSession();
  if (!me) return { signedIn: false };
  const name = listName?.trim().slice(0, 60) || null;
  let listId: string | null = null;
  if (name) {
    const found = await db.wishlistList.findFirst({ where: { customerId: me.id, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
    listId = found?.id ?? (await db.wishlistList.create({ data: { customerId: me.id, name }, select: { id: true } })).id;
  }
  const r = await addItems(me.id, productIds.slice(0, 20), listId, "advisor");
  return { signedIn: true, ok: r.ok, list: name ?? "Η λίστα μου", count: productIds.length };
}
