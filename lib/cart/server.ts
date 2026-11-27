import "server-only";
import { carrierOffers, FREIGHT_DEFAULT, freightOffer, isAtticaZip, ON_REQUEST_ADDRESS, ON_REQUEST_REASON, noPriceArea, pickCarrier, pricedArea, type CarrierId, type CarrierOffer, type FreightOffer } from "@/lib/shipping/carriers";
import { shippingLimits } from "@/lib/shipping/bulky-server";
import { asapCostQuote, atticaOffer, getAsapRules, type AtticaOffer } from "@/lib/shipping/asap-express-server";
import { STANDARD_ETA } from "@/lib/shipping/asap-express";
import { extAddonPrices } from "@/lib/warranty/server";
import { EXTENSION_SLUG } from "@/lib/warranty/policy";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getPromoPolicy } from "@/lib/promo/policy";
import { segmentsOf } from "@/lib/promo/segments";
import { getCustomerSession } from "@/lib/account/session";
import { getServiceList } from "@/lib/services/catalog";
import { evaluate, type EngineResult } from "@/lib/promo/engine";
import { activePromos, isNewCustomer, linesFor, lowest30, resolveCoupon, usesByPromo, type LineInfo } from "@/lib/promo/server";
import { getSetting } from "@/lib/settings/store";
import { zipExists } from "@/lib/stores/geocode";
import { areaHintFromRequest, getRateTables, localPartnerFor, nearStoresFor, nearStoresFound, type LocalStore } from "@/lib/delivery/server";
import { homeMode, localDeliveryFee, localRules, type HomeMode } from "@/lib/delivery/routing";
import { chargeableKg, DEFAULT_RATES, quoteRate } from "@/lib/delivery/rates";

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
  const products = await db.product.findMany({ where: { id: { in: clean.map((i) => i.productId) }, active: true, soldAlone: true }, select: { id: true, variants: { select: { id: true, price: true }, take: 1 } } });
  const variantOf = new Map(products.flatMap((p) => (p.variants[0] && Number(p.variants[0].price) > 0 ? [[p.id, p.variants[0].id] as const] : [])));
  const known = new Set((await getServiceList()).map((s) => s.slug));
  const rows = clean.flatMap((i) => { const v = variantOf.get(i.productId); return v ? [{ cartId: cart.id, variantId: v, qty: Math.min(99, Math.max(1, Math.floor(i.qty))), addons: (i.addons ?? []).filter((a) => known.has(a.slug)).map((a) => ({ slug: a.slug })) }] : []; });
  // πρώτα το UPDATE του καλαθιού: κλειδώνει τη γραμμή του, ώστε δύο ταυτόχρονα PUT να εκτελούνται το ένα μετά το άλλο
  // (αλλιώς και τα δύο σβήνουν τις παλιές γραμμές και γράφουν τις δικές τους → διπλές γραμμές)
  await db.$transaction([db.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } }), db.cartLine.deleteMany({ where: { cartId: cart.id } }), ...(rows.length ? [db.cartLine.createMany({ data: rows })] : [])]);
  return { cartId: cart.id, kept: rows.length, skipped: clean.length - rows.length };
}

export interface QuoteInput { coupon?: string | null; payment?: string | null; delivery?: "courier" | "freight" | "click-collect" | "appointment" | null; zip?: string | null; email?: string | null; storeId?: string | null; /** το συνεργαζόμενο κατάστημα που διάλεξε ο πελάτης για παράδοση στο σπίτι */ localStoreId?: string | null; /** ο courier που διάλεξε ο πελάτης (βλ. lib/shipping/carriers) */ carrier?: string | null; /** διεύθυνση (για την τιμή ASAP Express) */ street?: string | null; number?: string | null; city?: string | null; /** παραγγελία: περιμένουμε την τιμή ASAP μέχρι τέλους */ settle?: boolean }
/** Υπηρεσία στη γραμμή: price = τι πληρώνει (ανά τεμάχιο), value = η αξία της· free όταν τη χαρίζει προσφορά */
export interface QuoteAddon { slug: string; title: string; price: number; value: number; free?: { promotionId: string; code: string; version: number; label: string } }
export interface QuoteLine extends Omit<LineInfo, "categoryIds"> { listTotal: number; discPrice: number; discCoupon: number; discPayment: number; total: number; unitFinal: number; lowest30: number | null; labels: string[]; addons: QuoteAddon[];
  /** τιμή της προαιρετικής επέκτασης εγγύησης για αυτή τη γραμμή (λεπτά) · null = δεν προσφέρεται */
  extPrice: number | null }
/** Δώρο της προσφοράς: γραμμή με την αξία του και έκπτωση 100 % */
export interface QuoteGift { promotionId: string; code: string; version: number; label: string; productId: string; variantId: string; title: string; brand: string; image: string | null; erpCode: string; qty: number; value: number }
export interface Quote {
  lines: QuoteLine[]; missing: string[]; gifts: QuoteGift[]; hints: string[];
  freeShipping: { promotionId: string; code: string; version: number; label: string; saved: number } | null;
  /** γιατί βγήκε αυτό το ποσό μεταφορικών, σε απλά ελληνικά — για το προσωπικό (email παραγγελίας)· δεν πάει στον browser */
  shippingWhy: string[];
  /** η τιμή του courier έρχεται από την ASAP και δεν έχει απαντήσει ακόμη: ο browser ξαναρωτά */
  shipPending: boolean;
  goods: number; addons: number; discPrice: number; discCoupon: number; discPayment: number; payment: EngineResult["payment"]; shipping: number; codFee: number; total: number; vat: number;
  coupon: { applied: string | null; message: string | null };
  trace: EngineResult["trace"];
  /** οι ενεργοί couriers με το κόστος τους για αυτό το καλάθι, και αυτός που ισχύει (null = κανένας ενεργός → γενικό κόστος) */
  carriers: CarrierOffer[]; carrier: CarrierId | null;
  /** μεγάλες συσκευές (lib/shipping/bulky): αν επιτρέπεται courier / θυρίδα για όλο το καλάθι και ποια προϊόντα το εμποδίζουν */
  bulky: { courier: boolean; locker: boolean; reason: string | null; titles: string[] };
  /** μεταφορική (εσωτερική): null = κλειστή στις ρυθμίσεις · available = όλα τα προϊόντα φεύγουν με courier ή μεταφορική */
  freight: (FreightOffer & { available: boolean; reason: string | null; /** συνεργάτης Euronics εξυπηρετεί τον Τ.Κ. */ local: boolean; /** παράδοση στο σπίτι από συνεργαζόμενο κατάστημα (ογκώδη, εκτός Αττικής): αυτό που διάλεξε ο πελάτης (ή το κοντινότερο) και οι επιλογές του, με οδικά χλμ και κόστος */ localStore: (LocalStore & { fee: number }) | null; localStores: (LocalStore & { fee: number })[]; localFreeKm: number; /** κανένα συνεργαζόμενο κατάστημα μέσα στη μέγιστη απόσταση: μεταφορική (πρακτορείο) από το κεντρικό κατάστημα */ central: boolean; localMaxKm: number; /** συσκευές που χρεώνονται στη μεταφορική (κόστος ανά συσκευή) και το κόστος της μίας, σε λεπτά */ devices: number; unitFee: number }) | null;
  /** Αττική (lib/shipping/asap-express): κανονική παράδοση euronics ή ASAP Express με πραγματική τιμή */
  attica: AtticaOffer;
  /** περιοχή χωρίς συμφωνημένη τιμή αποστολής: το όνομά της — καμία παράδοση στο σπίτι, μόνο παραλαβή από κατάστημα */
  onRequest: string | null;
  /** γιατί είναι «κατόπιν συνεννόησης»: area = περιοχή χωρίς τιμή · address = μεγάλη συσκευή και ο χάρτης δεν βρήκε τη διεύθυνση */
  onRequestWhy: "area" | "address" | null;
  /** ο χάρτης δεν βρήκε τον Τ.Κ. («zip»), τη διεύθυνση («none») ή μόνο την περιοχή του Τ.Κ. («area»): το ταμείο ζητά από τον πελάτη να την ελέγξει */
  addressGeo: "zip" | "area" | "none" | null;
  /** δωρεάν παράδοση από το κατάστημα: το κατάστημα που διάλεξε ο πελάτης απέχει έως freeKm οδικώς (Euronics 27/11/2026) */
  storeArea: boolean;
  /** παράδοση στο σπίτι για ό,τι πάει με courier: τα καταστήματα έως courierKm οδικώς, αυτό που διάλεξε ο πελάτης (ή το κοντινότερο)
   *  και τι ισχύει: «store» δωρεάν από το κατάστημα · «courier-store» courier από το κατάστημα · «courier-hq» courier από τα κεντρικά */
  home: { stores: LocalStore[]; store: LocalStore | null; mode: HomeMode | null; freeKm: number; courierKm: number };
  /** η δωρεάν «Παράδοση από συνεργαζόμενο κατάστημα» προσφέρεται: όχι για ό,τι πάει με courier σε περιοχή χωρίς κατάστημα */
  storeDelivery: boolean;
  /** δεν ξέρουμε ακόμη Τ.Κ.: δεν χρεώνουμε τίποτα — η δωρεάν παράδοση είναι ο κανόνας μέχρι να αποδειχθεί το αντίθετο */
  zipNeeded: boolean;
  /** χωρίς Τ.Κ.: η περιοχή του επισκέπτη από τοποθεσία/IP, μόνο ως ένδειξη στο καλάθι (η χρέωση κρίνεται από τον Τ.Κ.) */
  areaHint: { place: string; free: boolean } | null;
  /** περιοχή του συμφωνημένου τιμοκαταλόγου (Περίπτωση 2): το όνομά της — χρεώνεται πάντα */
  pricedArea: string | null;
  /** για την παραγγελία: ποσά ανά προσφορά */
  engine: EngineResult;
}

const cents = (n: number) => Math.round(n * 100);
async function shippingRules() {
  const empty = { data: {} as Record<string, unknown> };
  const [s, p] = await Promise.all([getSetting("shipping").catch(() => empty), getSetting("payments").catch(() => empty)]);
  const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : d);
  return { fee: cents(num(s.data.shippingFee, 4.9)), cod: cents(num(p.data.codFee, 2)), data: s.data };
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
    channel: input.delivery === "click-collect" ? "click-collect" : "online", storeId: input.delivery === "click-collect" ? input.storeId ?? null : null, zip: input.zip ?? null, payment: input.payment ?? null, delivery: input.delivery ?? null,
    coupon, maxLinePct: policy.maxLinePct, costFloor: policy.belowCost === "block",
  });
  const low = await lowest30(lines.map((l) => l.variantId));
  const svc = new Map((await getServiceList()).map((s) => [s.slug, s]));
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
  // Επέκταση εγγύησης: ΠΡΟΑΙΡΕΤΙΚΗ και με χρέωση (15,5 % όπως στα καταστήματα), μόνο σε είδη με «Επέκταση Εγγύησης»
  // (CCCWARRANTY) και μόνο αν υπάρχει κλίμακα· η τιμή βγαίνει πάντα εδώ, από την τιμή της γραμμής — ποτέ από τον browser
  const extPrices = await extAddonPrices(lines.map((l) => ({ productId: l.productId, price: l.unit / 100 })));
  for (const it of items) {
    const ext = extPrices.get(it.productId) ?? null;
    const was = (addonsOf.get(it.key) ?? []).find((a) => a.slug === EXTENSION_SLUG);
    const list = (addonsOf.get(it.key) ?? []).filter((a) => a.slug !== EXTENSION_SLUG);
    // δώρο προσφοράς: μένει στα 0 € (με την αξία της κλίμακας), αλλιώς μπαίνει μόνο αν το διάλεξε ο πελάτης
    if (was?.free) list.push({ ...was, value: ext ? cents(ext) : was.value });
    else if (ext && was) list.push({ slug: EXTENSION_SLUG, title: `${svc.get(EXTENSION_SLUG)?.title ?? "Επέκταση εγγύησης"} +3 έτη`, price: cents(ext), value: cents(ext) });
    addonsOf.set(it.key, list);
  }
  // δώρα: τα στοιχεία του προϊόντος-δώρου από τη βάση (αν δεν πωλείται πια, δεν μπαίνει)
  const giftLines = engine.gifts.length ? (await linesFor(engine.gifts.map((g) => ({ key: `gift:${g.promotionId}`, productId: g.productId, qty: g.qty })))).lines : [];
  const gifts: QuoteGift[] = engine.gifts.flatMap((g) => { const l = giftLines.find((x) => x.key === `gift:${g.promotionId}`); return l ? [{ promotionId: g.promotionId, code: g.code, version: g.version, label: g.label, productId: l.productId, variantId: l.variantId, title: l.title, brand: l.brand, image: l.image, erpCode: l.erpCode, qty: l.qty, value: l.unit * l.qty }] : []; });
  const out: QuoteLine[] = engine.lines.map((l) => {
    const info = lines.find((x) => x.key === l.key)!;
    const { categoryIds: _c, ...rest } = info; void _c;
    const ext = extPrices.get(info.productId) ?? null;
    return { ...rest, listTotal: l.listTotal, discPrice: l.discPrice, discCoupon: l.discCoupon, discPayment: l.discPayment, total: l.total, unitFinal: l.unitFinal, lowest30: low.get(l.variantId) ?? null, labels: l.adjustments.map((a) => a.label), addons: addonsOf.get(l.key) ?? [], extPrice: ext == null ? null : cents(ext) };
  });
  // υπηρεσίες ανά τεμάχιο (π.χ. επέκταση εγγύησης για κάθε συσκευή), όπως τις δείχνει και το καλάθι
  const addons = out.reduce((a, l) => a + l.addons.reduce((b, x) => b + x.price, 0) * l.qty, 0);
  const goods = engine.total + addons;
  // couriers: ο καθένας με το δικό του κόστος· χωρίς ενεργό courier ισχύει το γενικό κόστος
  // μεγάλες συσκευές: χωρίς courier (παράδοση με ραντεβού ή παραλαβή) · θυρίδα μόνο αν χωράνε όλα
  // περιοχή χωρίς συμφωνημένη τιμή αποστολής: ο πελάτης παραγγέλνει, αλλά δεν διαλέγει courier/μεταφορική ούτε βλέπει ποσό — τα ορίζουμε στο τηλέφωνο
  const areaOnRequest = noPriceArea(input.zip);
  // «ανεξάρτητα ποσού δωρεάν μεταφορικά σε περιοχές με καταστήματα» (Euronics 20/11/2026): πρώτα οι περιοχές χωρίς τιμή,
  // μετά ο συμφωνημένος τιμοκατάλογος (χρεώνεται ακόμη κι όπου έχουμε κατάστημα), και μόνο τότε το δωρεάν της περιοχής
  const priced = pricedArea(input.zip);
  // χωρίς Τ.Κ. δεν μαντεύουμε χρέωση: το καλάθι δείχνει «δωρεάν, ανάλογα με την περιοχή» και το ποσό μπαίνει μόλις δοθεί ο Τ.Κ.
  const zipNeeded = !/^\d{5}$/.test((input.zip ?? "").trim());
  const areaHint = zipNeeded && (cart?.lines?.length ?? 0) > 0 ? await areaHintFromRequest().catch(() => null) : null;
  const limits = await shippingLimits(out.map((l) => l.productId));
  const blockers = out.filter((l) => limits.get(l.productId)?.courier === false);
  const bulky = { courier: !blockers.length, locker: !blockers.length && out.every((l) => limits.get(l.productId)?.locker), reason: blockers.length ? limits.get(blockers[0].productId)!.reason : null, titles: blockers.map((l) => l.title) };
  // μεταφορική: όταν κάθε προϊόν φεύγει με courier ή μεταφορική (όχι τα «μόνο κατάστημα»)
  // τιμοκατάλογοι (Αποστολές → Τιμοκατάλογοι): ζώνη Τ.Κ. × βάρος· χωρίς δημοσιευμένο ή χωρίς Τ.Κ. → οι σταθερές τιμές των ρυθμίσεων
  const tables = await getRateTables();
  const rated = (key: string) => {
    const t = tables.get(key);
    if (!t || !input.zip) return null;
    return quoteRate(t, { zip: input.zip, kg: chargeableKg(out.map((l) => ({ qty: l.qty, weightKg: limits.get(l.productId)?.weightKg ?? null, dimsCm: limits.get(l.productId)?.dimsCm ?? null })), t.divisor) });
  };
  // μεταφορική μόνο εκτός Αττικής (ζητήθηκε από την Euronics)· στην Αττική: courier, ραντεβού ή παραλαβή
  const fo0 = isAtticaZip(input.zip) ? null : freightOffer(rules.data);
  const fr = fo0 && rated("freight");
  // το κόστος της μεταφορικής είναι ΑΝΑ ΣΥΣΚΕΥΗ που δεν πάει με courier (π.χ. 2 ψυγεία = 2 × 25 €)· ο τιμοκατάλογος, όταν υπάρχει, χρεώνει ήδη με το βάρος
  const devices = Math.max(1, blockers.reduce((n, l) => n + l.qty, 0));
  const unitFee = fo0?.baseFee ?? FREIGHT_DEFAULT.fee;
  const fo = fo0 && fr ? { ...fo0, fee: fr.fee, baseFee: fr.baseFee } : fo0 && { ...fo0, fee: fo0.fee * devices, baseFee: fo0.baseFee * devices };
  const noFreight = out.find((l) => limits.get(l.productId)?.freight === false);
  const local = fo ? await localPartnerFor(input.zip, true).catch(() => null) : null;
  // εκτός Αττικής, συσκευές που δεν πάνε με courier: ο πελάτης διαλέγει συνεργαζόμενο κατάστημα και αυτό παραδίδει στο σπίτι —
  // δωρεάν έως το όριο οδικών χιλιομέτρων από το κατάστημα, με χρέωση πιο μακριά (και χωρίς ενεργή «μεταφορική» στις ρυθμίσεις)
  const lr = localRules(rules.data, unitFee);
  // οδικά χλμ από τα συνεργαζόμενα καταστήματα για κάθε παράδοση στο σπίτι, και στην Αττική (Euronics 27/11/2026)
  const wantNear = out.length > 0 && input.delivery !== "click-collect" && !zipNeeded && !areaOnRequest;
  const nearRes = wantNear ? await nearStoresFor({ street: input.street, number: input.number, city: input.city, zip: input.zip }, input.settle ? 12_000 : 2500).catch(() => undefined) : undefined;
  const nearList = nearRes ?? undefined;
  // ο χάρτης δουλεύει ακόμη: ο browser ξαναρωτά, και ως τότε δεν προσφέρεται δωρεάν παράδοση
  const nearPending = wantNear && nearRes === undefined;
  // ο χάρτης δεν βρήκε τη διεύθυνση (μεγάλη συσκευή, εκτός περιοχής καταστήματος): κατόπιν συνεννόησης, όπως στις περιοχές χωρίς τιμή
  const addressOnRequest = wantNear && !bulky.courier && nearRes === null;
  const onRequest = areaOnRequest ?? (addressOnRequest ? ON_REQUEST_ADDRESS : null);
  const onRequestWhy = areaOnRequest ? "area" as const : addressOnRequest ? "address" as const : null;
  const localStores = (bulky.courier ? [] : nearList ?? []).filter((x) => x.km <= lr.maxKm).slice(0, 5).map((x) => ({ ...x, fee: localDeliveryFee(x.km, lr) * devices })); // πέρα από το δωρεάν όριο: χρέωση ανά συσκευή
  const near = localStores.find((x) => x.id === input.localStoreId) ?? localStores[0] ?? null;
  // ξέρουμε ότι κανένα συνεργαζόμενο κατάστημα δεν είναι μέσα στη μέγιστη απόσταση: το στέλνει το κεντρικό με μεταφορική (πρακτορείο),
  // ακόμη κι αν η κατηγορία είναι «μόνο από κατάστημα» ή η μεταφορική είναι κλειστή στις ρυθμίσεις
  const central = !bulky.courier && nearList !== undefined && !localStores.length;
  const fb = near ? { ...(fo ?? { baseFee: 0 }), fee: near.fee, eta: "Σε καλεί το κατάστημα για ημέρα και ώρα" } : fo ?? (central ? { baseFee: unitFee * devices, fee: unitFee * devices, eta: FREIGHT_DEFAULT.eta } : null);
  // περιοχή με κατάστημα: και η μεταφορική / η παράδοση από το κατάστημα είναι δωρεάν (τη φέρνει το κατάστημα της περιοχής)
  const freight = fb && { ...fb, fee: fb.fee, eta: near ? fb.eta : local?.eta || fb.eta, local: !!local || !!near, localStore: near, localStores, localFreeKm: lr.freeKm, central, localMaxKm: lr.maxKm, devices: fr ? 1 : devices, unitFee, available: !onRequest && (!!near || central || !noFreight), reason: onRequest ? ON_REQUEST_REASON : near || central ? null : noFreight ? `${noFreight.title}: μόνο με παράδοση από συνεργαζόμενο κατάστημα ή παραλαβή από κατάστημα` : null };
  // ό,τι πάει με courier: έως freeKm το φέρνει δωρεάν το κατάστημα που διάλεξε ο πελάτης, έως courierKm courier με χρέωση από
  // αυτό, αλλιώς (ή κανένα κατάστημα / ο χάρτης δεν βρήκε τη διεύθυνση) courier με χρέωση από τα κεντρικά
  const homeStores = bulky.courier ? (nearList ?? []).filter((x) => x.km <= lr.courierKm).slice(0, 5) : [];
  const homeStore = homeStores.find((x) => x.id === input.localStoreId) ?? homeStores[0] ?? null;
  const mode = bulky.courier && wantNear && !nearPending ? homeMode(homeStore?.km, lr) : null;
  // ο συμφωνημένος τιμοκατάλογος (Περίπτωση 2) χρεώνεται πάντα, ακόμη κι αν το κατάστημα είναι κοντά
  const storeArea = mode === "store" && !priced;
  const courierFrom = mode === "courier-store" || (mode === "store" && priced) ? homeStore : null; // null = από τα κεντρικά
  const home = { stores: homeStores, store: homeStore, mode, freeKm: lr.freeKm, courierKm: lr.courierKm };
  // Αττική: μόνο «Κανονική παράδοση euronics» ή «ASAP Express»· η ASAP δεν είναι πια courier της λίστας
  const asapRules = await getAsapRules();
  const attica0: AtticaOffer = out.length && input.delivery !== "click-collect"
    ? await atticaOffer(out.map((l) => ({ productId: l.productId, qty: l.qty, title: l.title })), { street: input.street, number: input.number, city: input.city, zip: input.zip }, limits, asapRules, input.settle ? 20_000 : 1500)
    : { attica: false, standard: { eta: STANDARD_ETA, inStock: true }, express: null, why: null };
  // η δωρεάν «Κανονική παράδοση» της Αττικής μόνο έως freeKm από κατάστημα· πιο μακριά courier με χρέωση, όπως παντού
  const atticaFree = bulky.courier ? storeArea : near?.fee === 0;
  const attica: AtticaOffer = attica0.attica && !nearPending && !atticaFree ? { ...attica0, attica: false, express: null, why: `πέρα από ${lr.freeKm} χλμ από κατάστημα` } : attica0;
  const express = attica.express?.state === "ok" ? attica.express : null;
  // μόνο όταν ψάξαμε τη διεύθυνση στον χάρτη: ASAP Express στην Αττική, κοντινά καταστήματα για μεγάλες συσκευές εκτός Αττικής
  const nearFound = wantNear && nearRes !== undefined ? nearStoresFound({ street: input.street, number: input.number, city: input.city, zip: input.zip }) : undefined;
  // ο Τ.Κ. ορίζει μεταφορικά και περιοχή με κατάστημα: αν δεν υπάρχει στον χάρτη, μάλλον γράφτηκε λάθος
  const zipFound = !zipNeeded && input.delivery !== "click-collect" ? await zipExists(input.zip!) : undefined;
  const addressGeo = zipFound === false ? "zip" as const : attica.why === "η διεύθυνση δεν βρέθηκε" || nearFound === "none" ? "none" as const : nearFound === "area" ? "area" as const : null;
  const isExpress = attica.attica && input.delivery === "courier" && input.carrier === "asap" && !!express;
  // courier στο σπίτι χωρίς δημοσιευμένο τιμοκατάλογο: χρεώνεται η τιμή του ASAP price calculator για τον Τ.Κ. και το χρεώσιμο βάρος
  // (εντολή 24/11/2026: τα ΕΛΤΑ δεν δίνουν τιμή από το API τους). Χωρίς απάντηση της ASAP μένει η σταθερή τιμή των ρυθμίσεων.
  // Όπου τα μεταφορικά είναι ήδη δωρεάν ή εκτός συνόλου (Αττική, περιοχή με κατάστημα, κατόπιν συνεννόησης) δεν ρωτάμε.
  const offers0 = carrierOffers(rules.data, input.zip ?? null).filter((o) => !(asapRules.on && o.id === "asap"));
  // και η ίδια η ASAP, όταν είναι ο courier όλης της χώρας (25/11/2026: «όπου γίνεται, αποστολή με ASAP»): πληρώνεται ό,τι χρεώνει
  const viaAsap = (o: { id: string; kind: string }) => o.kind === "address" && !rated(o.id);
  const shipItems = out.map((l) => ({ qty: l.qty, weightKg: limits.get(l.productId)?.weightKg ?? null, dimsCm: limits.get(l.productId)?.dimsCm ?? null }));
  const shipKg = chargeableKg(shipItems, DEFAULT_RATES.divisor);
  const askAsap = process.env.ASAP_COURIER_PRICE !== "off" && out.length > 0 && bulky.courier && !zipNeeded && !onRequest && !storeArea && !attica.attica && offers0.some(viaAsap);
  // πριν βρεθεί η απόσταση δεν ξέρουμε από πού φεύγει το δέμα: ο browser ξαναρωτά
  const asapPrice = askAsap && nearPending ? "pending" as const : askAsap ? await asapCostQuote(input.zip, { weightKg: Math.round(shipKg * 10) / 10, dims: shipItems.map((i) => i.dimsCm).filter((d): d is [number, number, number] => !!d).sort((a, b) => b[0] * b[1] * b[2] - a[0] * a[1] * a[2])[0] ?? [30, 20, 15] }, input.settle ? 20_000 : 1500, courierFrom).catch(() => null) : null;
  const asapFee = asapPrice && asapPrice !== "pending" ? asapPrice : null;
  const carriers = offers0.map((o) => { const r = rated(o.id); return r ? { ...o, fee: r.fee, baseFee: r.baseFee } : asapFee && viaAsap(o) ? { ...o, fee: asapFee.fee, baseFee: asapFee.fee } : asapPrice === "pending" && viaAsap(o) ? { ...o, pending: true } : o; }).map((o) =>
    !bulky.courier ? { ...o, available: false, reason: freight?.available ? "Το καλάθι έχει ογκώδη συσκευή: αποστολή με μεταφορική ή παραλαβή από κατάστημα" : "Το καλάθι έχει μεγάλη συσκευή: παράδοση από συνεργαζόμενο κατάστημα ή παραλαβή από κατάστημα" }
    : o.kind === "locker" && !bulky.locker ? { ...o, available: false, reason: "Δεν χωράει σε θυρίδα (έως 20 κιλά, 36 × 45 × 60 εκ.)" } : o);
  // το courier χρεώνεται πάντα· έως freeKm από το κατάστημα δεν προσφέρεται (το φέρνει δωρεάν το κατάστημα)
  const carriers2 = onRequest ? carriers.map((o) => ({ ...o, available: false, reason: ON_REQUEST_REASON })) : storeArea ? carriers.map((o) => ({ ...o, available: false, reason: `Έως ${lr.freeKm} χλμ σου το φέρνει δωρεάν το κατάστημα` })) : carriers;
  const carrier = pickCarrier(carriers2, input.carrier);
  const courierFee = carrier ? carrier.fee : rules.fee;
  // «τιμή courier όπου δεν έχουμε κατάστημα» (κανόνες 3.0): ό,τι πάει με courier δεν παραδίδεται δωρεάν «από κατάστημα» εκεί.
  // Έλεγχος 25/11/2026: τρεις παραγγελίες πέρασαν έτσι με 0 € μεταφορικά (Κιάτο, Λουτράκι, Νέα Πεντέλη).
  const storeDelivery = !out.length || zipNeeded || !!onRequest || attica.attica || storeArea || (!bulky.courier && !nearPending);
  const delivery = input.delivery === "appointment" && !storeDelivery ? "courier" : input.delivery === "courier" && storeArea && !attica.attica ? "appointment" : input.delivery;
  // ογκώδες καλάθι με προεπιλεγμένο «courier»: το ταμείο το γυρίζει μόνο του σε μεταφορική / παράδοση από κατάστημα — ίδιο και εδώ,
  // αλλιώς ο πελάτης έβλεπε τη χρέωση στη γραμμή αλλά όχι στο σύνολο
  const viaFreight = !!freight?.available && (delivery === "freight" || (delivery === "courier" && !bulky.courier));
  const baseShipping = !out.length ? 0
    : zipNeeded ? 0 // χωρίς Τ.Κ.: καμία χρέωση — η δωρεάν παράδοση προβάλλεται πρώτη (απόφαση Euronics 21/11/2026)
    : onRequest ? 0 // περιοχή χωρίς τιμή: τα μεταφορικά συμφωνούνται στο τηλέφωνο, δεν μπαίνουν στο σύνολο τώρα
    : attica.attica ? (isExpress ? express!.fee : 0)
    : viaFreight ? freight!.fee
    : (delivery && delivery !== "courier") || !bulky.courier ? 0 : courierFee;
  // Express είναι επιλογή επί πληρωμή: οι προσφορές «δωρεάν μεταφορικά» δεν τη μηδενίζουν (η κανονική είναι ήδη δωρεάν)
  // το ίδιο και η μεταφορική / η χρέωση του καταστήματος πέρα από το δωρεάν όριο (εκτός Αττικής): δωρεάν είναι μόνο η παραλαβή από κατάστημα
  const freeShipping = engine.freeShipping && baseShipping > 0 && !isExpress && !viaFreight ? { ...engine.freeShipping, saved: baseShipping } : null;
  const shipping = freeShipping ? 0 : baseShipping;
  const codFee = input.payment === "cod" ? rules.cod : 0;
  const whyOnRequest = onRequestWhy === "address"
    ? `${`Τ.Κ. ${(input.zip ?? "").trim() || "—"}`}: συσκευή που δεν πάει με courier και ο χάρτης δεν βρήκε τη διεύθυνση, άρα δεν ξέρουμε ποιο κατάστημα παραδίδει ούτε πόσο απέχει. Τα μεταφορικά ορίζονται στο τηλέφωνο και ΔΕΝ έχουν μπει στο σύνολο.`
    : null;
  const total = goods + shipping + codFee;
  const e2 = (c: number) => `${(c / 100).toFixed(2).replace(".", ",")} €`;
  const dec = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
  const zipTxt = `Τ.Κ. ${(input.zip ?? "").trim() || "—"}`;
  const cr = carrier ? rated(carrier.id) : null;
  const byTable = (r: NonNullable<typeof cr>) => `τιμοκατάλογος, ζώνη «${r.zone.name}» × χρεώσιμο βάρος ${dec(r.kg)} κιλά${r.remote ? " + επιβάρυνση δυσπρόσιτης περιοχής" : ""}: ${e2(r.fee)}${r.cost != null ? ` (δικό μας κόστος ${e2(r.cost)})` : ""}`;
  const shippingWhy: string[] = !out.length ? [] : [
    input.delivery === "click-collect" ? "Παραλαβή από κατάστημα: χωρίς μεταφορικά."
    : zipNeeded ? "Δεν δόθηκε Τ.Κ.: καμία χρέωση μεταφορικών."
    : whyOnRequest ? whyOnRequest
    : onRequest ? `${zipTxt} (${onRequest}): περιοχή χωρίς συμφωνημένη τιμή αποστολής. Τα μεταφορικά ορίζονται στο τηλέφωνο και ΔΕΝ έχουν μπει στο σύνολο.`
    : attica.attica ? (isExpress ? `${zipTxt} (Αττική): ASAP Express, τιμή της ASAP για αυτή τη διεύθυνση ${e2(express!.fee)} (ζώνη ${express!.zone}).` : `${zipTxt} (Αττική): «Κανονική παράδοση euronics», δωρεάν (κατάστημα έως ${lr.freeKm} χλμ οδικώς).`)
    : viaFreight ? (near ? `Συσκευή που δεν πάει με courier, εκτός Αττικής: την παραδίδει το κατάστημα ${near.name} (${near.address}, ${near.city}), ${dec(near.km)} χλμ. οδικώς. Δωρεάν έως ${lr.freeKm} χλμ.${near.fee ? ` Πιο μακριά χρεώνεται ανά συσκευή: ${devices} × ${e2(near.fee / devices)} = ${e2(near.fee)}.` : ""}`
      : fr ? `Μεταφορική, ${byTable(fr)}.`
      : `Μεταφορική${central ? ` από το κεντρικό (κανένα συνεργαζόμενο κατάστημα μέσα σε ${lr.maxKm} χλμ.)` : ""}: ${devices} ${devices === 1 ? "συσκευή" : "συσκευές"} × ${e2(unitFee)} = ${e2(freight!.fee)}.`)
    : storeArea && homeStore ? `${zipTxt}: το κατάστημα ${homeStore.name} (${homeStore.address}, ${homeStore.city}) απέχει ${dec(homeStore.km)} χλμ οδικώς, έως ${lr.freeKm}: παράδοση από το κατάστημα, δωρεάν.`
    : (delivery && delivery !== "courier") || !bulky.courier ? "Παράδοση euronics με ραντεβού: χωρίς χρέωση μεταφορικών."
    : carrier ? `${courierFrom ? `Courier από το κατάστημα ${courierFrom.name} (${courierFrom.city}, ${dec(courierFrom.km)} χλμ οδικώς${priced ? `, περιοχή τιμοκαταλόγου «${priced}»` : ""})` : `Courier από τα κεντρικά (κανένα κατάστημα μέσα σε ${lr.courierKm} χλμ οδικώς${mode == null ? ", ή άγνωστη απόσταση" : ""})`}. ` + ( (cr ? `${carrier.name}, ${byTable(cr)}.`
      : asapFee && viaAsap(carrier) ? `${carrier.name}: τιμή από το ASAP price calculator, ζώνη «${asapFee.zone}» × χρεώσιμο βάρος ${dec(shipKg)} κιλά: ${e2(carrier.fee)} με ΦΠΑ (δεν υπάρχει δημοσιευμένος τιμοκατάλογος ${carrier.name}).`
      : `${carrier.name}: σταθερή τιμή των ρυθμίσεων ${e2(carrier.fee)}${askAsap && viaAsap(carrier) ? " (το ASAP price calculator δεν έδωσε τιμή για αυτόν τον Τ.Κ.)" : ""}.`))
    : `Γενικό κόστος αποστολής των ρυθμίσεων: ${e2(rules.fee)}.`,
    ...(freeShipping ? [`Προσφορά «${freeShipping.label}» (${freeShipping.code}): δωρεάν μεταφορικά, ο πελάτης γλίτωσε ${e2(freeShipping.saved)}.`] : []),
    ...(codFee ? [`Αντικαταβολή: χρέωση ${e2(codFee)}.`] : []),
    `Χρεώθηκαν στον πελάτη: ${e2(shipping + codFee)}${codFee ? ` (μεταφορικά ${e2(shipping)} + αντικαταβολή ${e2(codFee)})` : ""}.`,
  ];
  // «σου λείπουν Χ € για δωρεάν μεταφορικά» δεν έχει νόημα όταν τα μεταφορικά είναι ήδη δωρεάν
  const hints = baseShipping === 0 ? engine.hints.filter((h) => !h.includes("δωρεάν μεταφορικά")) : engine.hints;
  return { lines: out, missing, gifts, hints, freeShipping, shippingWhy, shipPending: asapPrice === "pending" || nearPending, goods: engine.listTotal, addons, discPrice: engine.discPrice, discCoupon: engine.discCoupon, discPayment: engine.discPayment, payment: engine.payment, shipping, codFee, total, vat: Math.round(total - total / 1.24), coupon: { applied: engine.couponApplied, message: engine.couponMessage }, trace: engine.trace, storeArea, home, storeDelivery, zipNeeded, areaHint, pricedArea: priced, carriers: carriers2, carrier: isExpress ? "asap" : attica.attica ? null : carrier?.id ?? null, bulky, freight, attica, onRequest, onRequestWhy, addressGeo, engine };
}

/** Για το JSON προς τον browser: χωρίς το εσωτερικό αποτέλεσμα της μηχανής. */
export const publicQuote = ({ engine: _e, ...q }: Quote) => { void _e; return { ...q, shippingWhy: [], attica: { ...q.attica, why: null }, trace: q.trace.map((t) => ({ name: t.name, applied: t.applied, amount: t.amount, reason: t.reason })) }; };
