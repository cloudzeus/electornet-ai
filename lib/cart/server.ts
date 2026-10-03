import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getPromoPolicy } from "@/lib/promo/policy";
import { segmentsOf } from "@/lib/promo/segments";
import { getCustomerSession } from "@/lib/account/session";
import { services } from "@/lib/data/fixtures/services";
import { evaluate, type EngineResult } from "@/lib/promo/engine";
import { activePromos, isNewCustomer, linesFor, lowest30, resolveCoupon, usesByPromo, type LineInfo } from "@/lib/promo/server";
import { getSetting } from "@/lib/settings/store";

/**
 * Καλάθι στον server. Ο browser κρατά το καλάθι για ταχύτητα και το καθρεφτίζει εδώ (ολόκληρο, με κάθε αλλαγή).
 * Ό,τι αφορά χρήματα υπολογίζεται ΜΟΝΟ εδώ: τιμές από τη βάση (SoftOne), υπηρεσίες από τον κατάλογο υπηρεσιών,
 * προσφορές από τη μηχανή — ποτέ τιμές που έστειλε ο browser.
 * Επισκέπτης: cookie με τυχαίο αναγνωριστικό. Σύνδεση: το καλάθι δένεται με τον πελάτη (και ακολουθεί σε άλλη συσκευή).
 */

const COOKIE = "eu_cart";
export interface CartItemIn { productId: string; qty: number; addons?: { slug: string }[] }
interface StoredAddon { slug: string }

async function sessionCartId(create: boolean): Promise<string | null> {
  const jar = await cookies();
  const v = jar.get(COOKIE)?.value;
  if (v && /^[\w-]{20,64}$/.test(v)) return v;
  if (!create) return null;
  const id = randomBytes(24).toString("base64url");
  jar.set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 86400 });
  return id;
}

/** Το καλάθι του επισκέπτη ή του πελάτη. Στη σύνδεση, το καλάθι επισκέπτη μεταφέρεται στον πελάτη. */
export async function currentCart(create = false) {
  const me = await getCustomerSession();
  const sid = await sessionCartId(create || !!me);
  let cart = me ? await db.cart.findFirst({ where: { customerId: me.id }, orderBy: { updatedAt: "desc" }, include: { lines: true } }) : null;
  const guest = sid ? await db.cart.findUnique({ where: { sessionId: sid }, include: { lines: true } }) : null;
  if (me && guest && guest.customerId !== me.id) {
    if (!cart) cart = await db.cart.update({ where: { id: guest.id }, data: { customerId: me.id }, include: { lines: true } });
    else if (guest.lines.length) {
      // συγχώνευση: οι γραμμές του επισκέπτη μπαίνουν στο καλάθι του πελάτη (η πιο πρόσφατη ποσότητα κερδίζει)
      await db.$transaction([
        ...guest.lines.map((l) => {
          const same = cart!.lines.find((x) => x.variantId === l.variantId);
          return same ? db.cartLine.update({ where: { id: same.id }, data: { qty: l.qty, addons: l.addons ?? undefined } }) : db.cartLine.update({ where: { id: l.id }, data: { cartId: cart!.id } });
        }),
        db.cart.update({ where: { id: guest.id }, data: { sessionId: null } }),
      ]);
      cart = await db.cart.findUnique({ where: { id: cart.id }, include: { lines: true } });
    }
  } else if (!cart) cart = guest;
  if (!cart && create) cart = await db.cart.create({ data: { sessionId: me ? null : sid, customerId: me?.id ?? null }, include: { lines: true } });
  return cart;
}

/** Ο browser στέλνει όλο το καλάθι του· ο server κρατά μόνο ό,τι είναι πραγματικό προϊόν με τιμή. */
export async function syncCart(items: CartItemIn[]) {
  const cart = await currentCart(true);
  if (!cart) return null;
  const clean = items.filter((i) => i.productId && i.qty > 0).slice(0, 60);
  const products = await db.product.findMany({ where: { id: { in: clean.map((i) => i.productId) }, active: true }, select: { id: true, variants: { select: { id: true, price: true }, take: 1 } } });
  const variantOf = new Map(products.flatMap((p) => (p.variants[0] && Number(p.variants[0].price) > 0 ? [[p.id, p.variants[0].id] as const] : [])));
  const known = new Set(services.map((s) => s.slug));
  const rows = clean.flatMap((i) => { const v = variantOf.get(i.productId); return v ? [{ cartId: cart.id, variantId: v, qty: Math.min(99, Math.max(1, Math.floor(i.qty))), addons: (i.addons ?? []).filter((a) => known.has(a.slug)).map((a) => ({ slug: a.slug })) }] : []; });
  // πρώτα το UPDATE του καλαθιού: κλειδώνει τη γραμμή του, ώστε δύο ταυτόχρονα PUT να εκτελούνται το ένα μετά το άλλο
  // (αλλιώς και τα δύο σβήνουν τις παλιές γραμμές και γράφουν τις δικές τους → διπλές γραμμές)
  await db.$transaction([db.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } }), db.cartLine.deleteMany({ where: { cartId: cart.id } }), ...(rows.length ? [db.cartLine.createMany({ data: rows })] : [])]);
  return { cartId: cart.id, kept: rows.length, skipped: clean.length - rows.length };
}

export interface QuoteInput { coupon?: string | null; payment?: string | null; delivery?: "courier" | "click-collect" | "appointment" | null; zip?: string | null; email?: string | null }
/** Υπηρεσία στη γραμμή: price = τι πληρώνει (ανά τεμάχιο), value = η αξία της· free όταν τη χαρίζει προσφορά */
export interface QuoteAddon { slug: string; title: string; price: number; value: number; free?: { promotionId: string; code: string; version: number; label: string } }
export interface QuoteLine extends Omit<LineInfo, "categoryIds"> { listTotal: number; discPrice: number; discCoupon: number; discPayment: number; total: number; unitFinal: number; lowest30: number | null; labels: string[]; addons: QuoteAddon[] }
/** Δώρο της προσφοράς: γραμμή με την αξία του και έκπτωση 100 % */
export interface QuoteGift { promotionId: string; code: string; version: number; label: string; productId: string; variantId: string; title: string; brand: string; image: string | null; erpCode: string; qty: number; value: number }
export interface Quote {
  lines: QuoteLine[]; missing: string[]; gifts: QuoteGift[]; hints: string[];
  freeShipping: { promotionId: string; code: string; version: number; label: string; saved: number } | null;
  goods: number; addons: number; discPrice: number; discCoupon: number; discPayment: number; payment: EngineResult["payment"]; shipping: number; codFee: number; total: number; vat: number;
  coupon: { applied: string | null; message: string | null };
  trace: EngineResult["trace"]; freeShippingFrom: number;
  /** για την παραγγελία: ποσά ανά προσφορά */
  engine: EngineResult;
}

const cents = (n: number) => Math.round(n * 100);
async function shippingRules() {
  const empty = { data: {} as Record<string, unknown> };
  const [s, p] = await Promise.all([getSetting("shipping").catch(() => empty), getSetting("payments").catch(() => empty)]);
  const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : d);
  return { freeFrom: cents(num(s.data.freeShippingFrom, 100)), fee: cents(num(s.data.shippingFee, 4.9)), cod: cents(num(p.data.codFee, 2)) };
}

/** Ο υπολογισμός του καλαθιού — ο ίδιος για τη σελίδα καλαθιού, το checkout και την παραγγελία. Ποσά σε λεπτά. */
export async function quoteCart(input: QuoteInput = {}, cart?: Awaited<ReturnType<typeof currentCart>>): Promise<Quote> {
  cart ??= await currentCart(false);
  const me = await getCustomerSession();
  const who = { customerId: me?.id ?? null, email: (me?.email ?? input.email ?? null)?.toLowerCase() ?? null };
  const vids = (cart?.lines ?? []).map((l) => l.variantId);
  const variants = vids.length ? await db.variant.findMany({ where: { id: { in: vids } }, select: { id: true, productId: true } }) : [];
  const productOf = new Map(variants.map((v) => [v.id, v.productId]));
  const items = (cart?.lines ?? []).flatMap((l) => (productOf.get(l.variantId) ? [{ key: l.id, productId: productOf.get(l.variantId)!, qty: l.qty }] : []));
  const [{ lines, missing }, promos, coupon, uses, isNew, rules, policy] = await Promise.all([linesFor(items), activePromos(), resolveCoupon(input.coupon, who), usesByPromo(who), isNewCustomer(who), shippingRules(), getPromoPolicy()]);
  // κοινά πελατών: υπολογίζονται μόνο αν κάποια προσφορά τα χρειάζεται
  const needSeg = !!me && promos.some((p) => p.rules?.segments?.length || p.rules?.earlyAccess?.segments.length);
  const segments = needSeg ? await segmentsOf(me!.id) : [];
  const engine = evaluate(lines, promos, {
    now: new Date(), customer: { id: who.customerId, email: who.email, registered: !!me, isNew, usesByPromo: uses, segments },
    channel: input.delivery === "click-collect" ? "click-collect" : "online", zip: input.zip ?? null, payment: input.payment ?? null, delivery: input.delivery ?? null,
    coupon, maxLinePct: policy.maxLinePct, costFloor: policy.belowCost === "block",
  });
  const low = await lowest30(lines.map((l) => l.variantId));
  const svc = new Map(services.map((s) => [s.slug, s]));
  const addonsOf = new Map((cart?.lines ?? []).map((l) => [l.id, ((l.addons as StoredAddon[] | null) ?? []).flatMap((a): QuoteAddon[] => { const s = svc.get(a.slug); return s ? [{ slug: s.slug, title: s.title, price: cents(s.priceFrom ?? 0), value: cents(s.priceFrom ?? 0) }] : []; })]));
  // δωρεάν υπηρεσίες: μπαίνουν αυτόματα στη γραμμή (ή γίνονται 0 € αν τις είχε ήδη διαλέξει ο πελάτης)
  for (const f of engine.services) {
    const s = svc.get(f.slug); if (!s) continue;
    const list = addonsOf.get(f.lineKey) ?? [];
    const free = { promotionId: f.promotionId, code: f.code, version: f.version, label: f.label };
    const cur = list.find((a) => a.slug === f.slug);
    if (cur) { cur.price = 0; cur.free = free; } else list.push({ slug: s.slug, title: s.title, price: 0, value: cents(s.priceFrom ?? 0), free });
    addonsOf.set(f.lineKey, list);
  }
  // δώρα: τα στοιχεία του προϊόντος-δώρου από τη βάση (αν δεν πωλείται πια, δεν μπαίνει)
  const giftLines = engine.gifts.length ? (await linesFor(engine.gifts.map((g) => ({ key: `gift:${g.promotionId}`, productId: g.productId, qty: g.qty })))).lines : [];
  const gifts: QuoteGift[] = engine.gifts.flatMap((g) => { const l = giftLines.find((x) => x.key === `gift:${g.promotionId}`); return l ? [{ promotionId: g.promotionId, code: g.code, version: g.version, label: g.label, productId: l.productId, variantId: l.variantId, title: l.title, brand: l.brand, image: l.image, erpCode: l.erpCode, qty: l.qty, value: l.unit * l.qty }] : []; });
  const out: QuoteLine[] = engine.lines.map((l) => {
    const info = lines.find((x) => x.key === l.key)!;
    const { categoryIds: _c, ...rest } = info; void _c;
    return { ...rest, listTotal: l.listTotal, discPrice: l.discPrice, discCoupon: l.discCoupon, discPayment: l.discPayment, total: l.total, unitFinal: l.unitFinal, lowest30: low.get(l.variantId) ?? null, labels: l.adjustments.map((a) => a.label), addons: addonsOf.get(l.key) ?? [] };
  });
  // υπηρεσίες ανά τεμάχιο (π.χ. επέκταση εγγύησης για κάθε συσκευή), όπως τις δείχνει και το καλάθι
  const addons = out.reduce((a, l) => a + l.addons.reduce((b, x) => b + x.price, 0) * l.qty, 0);
  const goods = engine.total + addons;
  const baseShipping = !out.length || (input.delivery && input.delivery !== "courier") ? 0 : goods >= rules.freeFrom ? 0 : rules.fee;
  const freeShipping = engine.freeShipping && baseShipping > 0 ? { ...engine.freeShipping, saved: baseShipping } : null;
  const shipping = freeShipping ? 0 : baseShipping;
  const codFee = input.payment === "cod" ? rules.cod : 0;
  const total = goods + shipping + codFee;
  // «σου λείπουν Χ € για δωρεάν μεταφορικά» δεν έχει νόημα όταν τα μεταφορικά είναι ήδη δωρεάν
  const hints = baseShipping === 0 ? engine.hints.filter((h) => !h.includes("δωρεάν μεταφορικά")) : engine.hints;
  return { lines: out, missing, gifts, hints, freeShipping, goods: engine.listTotal, addons, discPrice: engine.discPrice, discCoupon: engine.discCoupon, discPayment: engine.discPayment, payment: engine.payment, shipping, codFee, total, vat: Math.round(total - total / 1.24), coupon: { applied: engine.couponApplied, message: engine.couponMessage }, trace: engine.trace, freeShippingFrom: rules.freeFrom, engine };
}

/** Για το JSON προς τον browser: χωρίς το εσωτερικό αποτέλεσμα της μηχανής. */
export const publicQuote = ({ engine: _e, ...q }: Quote) => { void _e; return { ...q, trace: q.trace.map((t) => ({ name: t.name, applied: t.applied, amount: t.amount, reason: t.reason })) }; };
