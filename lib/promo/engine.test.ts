import { test } from "node:test";
import assert from "node:assert/strict";
import { allocate, evaluate, type EngineCtx, type EngineLine, type EnginePromo } from "./engine";

const now = new Date("2026-10-07T10:00:00Z");
const ctx = (o: Partial<EngineCtx> = {}): EngineCtx => ({ now, customer: { registered: true, isNew: false }, channel: "online", maxLinePct: 40, ...o });
const line = (key: string, unit: number, o: Partial<EngineLine> = {}): EngineLine => ({ key, variantId: `v-${key}`, productId: `p-${key}`, brandId: "philips", categoryIds: ["mikro"], qty: 1, unit, ...o });
let n = 0;
const promo = (o: Partial<EnginePromo>): EnginePromo => ({ id: `id${++n}`, code: `CMP-${n}`, version: 1, name: `Προσφορά ${n}`, mechanism: "price-percent", status: "active", held: false, priority: 100, stacking: "no-price", reward: { percent: 10 }, rules: {}, targets: [], usedCount: 0, spentCents: 0, ...o });

test("allocate: το άθροισμα βγαίνει ακριβώς", () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]).reduce((a, b) => a + b, 0), 1000);
  assert.deepEqual(allocate(0, [5, 5]), [0, 0]);
  assert.deepEqual(allocate(7, [0, 0]), [0, 0]);
});

test("δύο εκπτώσεις τιμής στο ίδιο προϊόν: κερδίζει η καλύτερη για τον πελάτη", () => {
  const a = promo({ name: "−10 %", reward: { percent: 10 }, priority: 10 });
  const b = promo({ name: "−20 %", reward: { percent: 20 }, priority: 30 });
  const r = evaluate([line("x", 18900)], [a, b], ctx());
  assert.equal(r.discPrice, 3780);
  assert.equal(r.trace.find((t) => t.promotionId === b.id)?.applied, true);
  assert.match(r.trace.find((t) => t.promotionId === a.id)!.reason, /−20 %/);
});

test("η αποκλειστική κερδίζει ακόμα κι αν δίνει λιγότερα, και μπλοκάρει το κουπόνι", () => {
  const ex = promo({ name: "Αποκλειστική −5 %", reward: { percent: 5 }, stacking: "exclusive" });
  const big = promo({ name: "−30 %", reward: { percent: 30 } });
  const cp = promo({ name: "Κουπόνι", mechanism: "coupon-amount", reward: { amount: 1000 }, stacking: "combine" });
  const r = evaluate([line("x", 10000)], [ex, big, cp], ctx({ coupon: { code: "WELCOME10", promotionId: cp.id } }));
  assert.equal(r.discPrice, 500);
  assert.equal(r.discCoupon, 0);
  assert.equal(r.couponApplied, null);
});

test("κουπόνι «όχι με εκπτώσεις τιμής»: πέφτει μόνο σε προϊόντα χωρίς προσφορά, με αναλογική κατανομή", () => {
  const sale = promo({ reward: { percent: 15 }, targets: [{ kind: "product", refId: "p-ac", exclude: false }] });
  const cp = promo({ mechanism: "coupon-amount", reward: { amount: 1000 }, stacking: "no-price" });
  const r = evaluate([line("ac", 92900), line("a", 18900), line("b", 12900)], [sale, cp], ctx({ coupon: { code: "X", promotionId: cp.id } }));
  assert.equal(r.lines[0].discCoupon, 0);
  assert.equal(r.lines[1].discCoupon + r.lines[2].discCoupon, 1000);
  assert.ok(r.lines[1].discCoupon > r.lines[2].discCoupon);
});

test("ελάχιστο καλάθι του κουπονιού και μήνυμα με το ποσό που λείπει", () => {
  const cp = promo({ mechanism: "coupon-amount", reward: { amount: 1000 }, rules: { minValue: 9900 } });
  const r = evaluate([line("a", 3990)], [cp], ctx({ coupon: { code: "WELCOME10", promotionId: cp.id } }));
  assert.equal(r.discCoupon, 0);
  assert.match(r.couponMessage ?? "", /τουλάχιστον 99,00 €/);
});

test("ανενεργή μέχρι διευκρίνιση: δεν εφαρμόζεται ποτέ", () => {
  const held = promo({ reward: { percent: 50 }, held: true });
  const r = evaluate([line("x", 10000)], [held], ctx());
  assert.equal(r.discPrice, 0);
  assert.match(r.trace[0].reason, /διευκρινιστεί/);
});

test("χρονικό παράθυρο, budget, πρώτη αγορά", () => {
  const future = promo({ startsAt: new Date("2026-10-09T06:00:00Z") });
  const spent = promo({ budgetCents: 100000, spentCents: 100000 });
  const first = promo({ rules: { customers: "new" } });
  const r = evaluate([line("x", 10000)], [future, spent, first], ctx());
  assert.equal(r.discPrice, 0);
  assert.equal(r.trace.length, 3);
  const r2 = evaluate([line("x", 10000)], [first], ctx({ customer: { registered: true, isNew: true } }));
  assert.equal(r2.discPrice, 1000);
});

test("δικλείδες: μέγιστο 40 % ανά γραμμή, ποτέ κάτω από το κόστος", () => {
  const a = promo({ reward: { percent: 35 }, stacking: "combine" });
  const cp = promo({ mechanism: "coupon-percent", reward: { percent: 20 }, stacking: "combine" });
  const r = evaluate([line("x", 10000)], [a, cp], ctx({ coupon: { code: "C", promotionId: cp.id } }));
  assert.equal(r.lines[0].total, 6000);
  assert.equal(r.lines[0].capped, "max-pct");
  const r2 = evaluate([line("y", 10000, { cost: 8000 })], [a], ctx());
  assert.equal(r2.lines[0].total, 8000);
  assert.equal(r2.lines[0].capped, "cost");
});

test("ειδική τιμή ανά SKU, εξαίρεση και brand", () => {
  const sp = promo({ mechanism: "special-price", reward: { price: { "v-x": 14900 } }, targets: [{ kind: "brand", refId: "philips", exclude: false }, { kind: "product", refId: "p-z", exclude: true }] });
  const r = evaluate([line("x", 18900), line("z", 18900)], [sp], ctx());
  assert.equal(r.lines[0].total, 14900);
  assert.equal(r.lines[1].total, 18900);
});

test("2+1: το φθηνότερο της ομάδας δωρεάν, και υπόδειξη όταν λείπει ένα", () => {
  const p = promo({ mechanism: "n-plus-m", reward: { buy: 2, get: 1 }, tagLabel: "2+1" });
  const r = evaluate([line("a", 18900), line("b", 12900), line("c", 3990)], [p], ctx());
  assert.equal(r.discPrice, 3990);
  assert.equal(r.lines[2].discPrice, 3990);
  const r2 = evaluate([line("a", 18900), line("b", 12900)], [p], ctx());
  assert.equal(r2.discPrice, 0);
  assert.match(r2.hints[0], /Πρόσθεσε 1 ακόμη/);
});

test("2ο −50 %: στο φθηνότερο τεμάχιο κάθε ζεύγους", () => {
  const p = promo({ mechanism: "nth-discount", reward: { nth: 2, percent: 50 } });
  const r = evaluate([line("a", 10000, { qty: 1 }), line("b", 6000)], [p], ctx());
  assert.equal(r.discPrice, 3000);
  assert.equal(r.lines[1].discPrice, 3000);
});

test("κλιμακωτή ποσότητα: η σωστή κλίμακα και υπόδειξη για την επόμενη", () => {
  const p = promo({ mechanism: "qty-tiers", reward: { tiers: [{ minQty: 2, percent: 5 }, { minQty: 4, percent: 10 }] } });
  const r = evaluate([line("a", 1000, { qty: 3 })], [p], ctx());
  assert.equal(r.discPrice, 150);
  assert.match(r.hints[0], /−10 %/);
});

test("πολλών τεμαχίων απέναντι σε απλή έκπτωση: κερδίζει ό,τι δίνει περισσότερα", () => {
  const n = promo({ name: "2+1", mechanism: "n-plus-m", reward: { buy: 2, get: 1 } });
  const small = promo({ name: "−5 %", reward: { percent: 5 } });
  const big = promo({ name: "−40 %", reward: { percent: 40 } });
  const ls = [line("a", 10000), line("b", 10000), line("c", 10000)];
  assert.equal(evaluate(ls, [n, small], ctx()).discPrice, 10000); // 2+1 δίνει 100 € > 5 % του 3ου (5 €)
  const r = evaluate(ls, [n, big], ctx());
  assert.equal(r.discPrice, 12000); // −40 % σε όλα (120 €) > 2+1 (100 €)
  assert.match(r.trace.find((t) => t.name === "2+1")!.reason, /δίνει περισσότερα/);
});

test("δώρο, δωρεάν υπηρεσία, δωρεάν μεταφορικά — και «σου λείπουν»", () => {
  const g = promo({ mechanism: "gift", reward: { giftProductId: "gift-1" }, rules: { minValue: 30000 } });
  const s = promo({ mechanism: "service", reward: { serviceSlug: "epektasi-eggyisis" } });
  const f = promo({ mechanism: "shipping", reward: {}, rules: { minValue: 5000 } });
  const r = evaluate([line("tv", 89900)], [g, s, f], ctx());
  assert.equal(r.gifts[0].productId, "gift-1");
  assert.equal(r.services[0].slug, "epektasi-eggyisis");
  assert.ok(r.freeShipping);
  const r2 = evaluate([line("x", 3990)], [g, f], ctx());
  assert.equal(r2.gifts.length, 0);
  assert.equal(r2.freeShipping, null);
  assert.ok(r2.hints.some((h) => /δωρεάν μεταφορικά/.test(h)));
});

test("κουπόνι «όχι με προσφορές»: ούτε στα πληρωμένα τεμάχια ενός 2+1", () => {
  const n = promo({ mechanism: "n-plus-m", reward: { buy: 2, get: 1 }, targets: [{ kind: "brand", refId: "philips", exclude: false }] });
  const cp = promo({ mechanism: "coupon-amount", reward: { amount: 1000 }, stacking: "no-price" });
  const r = evaluate([line("a", 10000), line("b", 10000), line("c", 10000), line("d", 5000, { brandId: "lg" })], [n, cp], ctx({ coupon: { code: "X", promotionId: cp.id } }));
  assert.equal(r.discPrice, 10000);
  assert.equal(r.lines[3].discCoupon, 1000);
  assert.equal(r.lines[0].discCoupon + r.lines[1].discCoupon + r.lines[2].discCoupon, 0);
});

test("μαζί φθηνότερα: −30 % στο ακριβότερο συνοδευτικό, ένα ανά βασικό, και υπόδειξη", () => {
  const p = promo({ name: "TV + soundbar", mechanism: "together", reward: { percent: 30, with: [{ kind: "category", refId: "sound", exclude: false }] }, targets: [{ kind: "category", refId: "tv", exclude: false }] });
  const tv = line("tv", 89900, { categoryIds: ["tv"] }), sb1 = line("sb1", 29900, { categoryIds: ["sound"] }), sb2 = line("sb2", 19900, { categoryIds: ["sound"] });
  const r = evaluate([tv, sb1, sb2], [p], ctx());
  assert.equal(r.lines[1].discPrice, 8970); // 30 % του ακριβότερου συνοδευτικού
  assert.equal(r.lines[2].discPrice, 0);    // μόνο ένα ανά τηλεόραση
  assert.equal(r.lines[0].discPrice, 0);    // το βασικό κρατά την τιμή του
  const r2 = evaluate([line("tv2", 89900, { categoryIds: ["tv"] })], [p], ctx());
  assert.match(r2.hints[0], /συνοδευτικό/);
});

test("πακέτο σε σταθερή τιμή: η έκπτωση μοιράζεται αναλογικά, χρειάζονται όλα τα προϊόντα", () => {
  const p = promo({ name: "Πακέτο κουζίνας", mechanism: "bundle", reward: { bundle: [{ productId: "p-a", qty: 1 }, { productId: "p-b", qty: 1 }], bundlePrice: 100000 } });
  const r = evaluate([line("a", 80000), line("b", 40000)], [p], ctx());
  assert.equal(r.discPrice, 20000);
  assert.equal(r.total, 100000);
  assert.ok(r.lines[0].discPrice > r.lines[1].discPrice);
  const r2 = evaluate([line("a", 80000)], [p], ctx());
  assert.equal(r2.discPrice, 0);
  assert.match(r2.hints[0], /Ολοκλήρωσε το πακέτο/);
});

test("έκπτωση τρόπου πληρωμής: μόνο με τον σωστό τρόπο, ως ξεχωριστό ποσό (DISC3), αλλιώς υπόδειξη", () => {
  const p = promo({ name: "IRIS −3 %", mechanism: "payment-percent", reward: { percent: 3 }, rules: { payment: ["iris"] }, stacking: "combine" });
  const r = evaluate([line("x", 10000)], [p], ctx({ payment: "iris" }));
  assert.equal(r.discPayment, 300);
  assert.equal(r.total, 9700);
  assert.equal(r.lines[0].adjustments[0].kind, "payment");
  const r2 = evaluate([line("x", 10000)], [p], ctx({ payment: "card" }));
  assert.equal(r2.discPayment, 0);
  const r3 = evaluate([line("x", 10000)], [p], ctx({ payment: null }));
  assert.match(r3.hints[0], /IRIS/);
});

test("κοινά πελατών και early access", () => {
  const seg = promo({ reward: { percent: 10 }, rules: { segments: ["vip"] } });
  assert.equal(evaluate([line("x", 10000)], [seg], ctx()).discPrice, 0);
  assert.equal(evaluate([line("x", 10000)], [seg], ctx({ customer: { registered: true, isNew: false, segments: ["vip"] } })).discPrice, 1000);
  const early = promo({ reward: { percent: 20 }, startsAt: new Date(now.getTime() + 3 * 3_600_000), rules: { earlyAccess: { segments: ["news"], hours: 24 } } });
  assert.equal(evaluate([line("x", 10000)], [early], ctx()).discPrice, 0);
  assert.equal(evaluate([line("x", 10000)], [early], ctx({ customer: { registered: true, isNew: false, segments: ["news"] } })).discPrice, 2000);
});
