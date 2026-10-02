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
