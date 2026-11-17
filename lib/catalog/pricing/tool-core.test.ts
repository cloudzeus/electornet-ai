import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_OPTS, cleanOpts, markupOf, planPrice, salesStats, type Trn } from "./tool-core";

const now = new Date("2026-11-17T10:00:00Z");
const d = (s: string) => new Date(s);
// τα πραγματικά νούμερα του είδους 100994: eshop 31,45 καθαρά = 39 με ΦΠΑ, συνεργάτης 27,86 καθαρά
const trns: Trn[] = [
  { date: d("2026-08-04"), retail: false, qty: 1, net: 27.59 },
  { date: d("2026-10-08"), retail: false, qty: 1, net: 27.86 },
  { date: d("2026-08-25"), retail: true, qty: 1, net: 31.45 },
  { date: d("2026-10-16"), retail: true, qty: 3, net: 94.38 },
  { date: d("2026-10-20"), retail: true, qty: 0, net: 0 },
];

test("salesStats: τελευταία τιμή eshop με ΦΠΑ, συνεργάτη χωρίς, μέση τιμή ανά περίοδο", () => {
  const s = salesStats(trns, 24, now);
  assert.deepEqual(s.eshop, { price: 39.01, at: d("2026-10-16").toISOString() });
  assert.deepEqual(s.partner, { price: 27.86, at: d("2026-10-08").toISOString() });
  assert.equal(s.avg[30], null);
  assert.equal(s.avg[90], 39.01);
  assert.equal(s.avg[365], 39.01); // (31,45 + 94,38) / 4 × 1,24
  assert.deepEqual(salesStats([], 24, now), { eshop: null, partner: null, avg: { 30: null, 90: null, 365: null } });
});

test("markupOf: ποσοστό πάνω στο κόστος, ποτέ αρνητικό", () => {
  assert.equal(markupOf(124, 80, 24), 25);
  assert.equal(markupOf(62, 80, 24), 0);
  assert.equal(markupOf(null, 80, 24), null);
  assert.equal(markupOf(124, null, 24), null);
});

test("planPrice: νέα τιμή με στρογγύλεμα και οι δικλείδες", () => {
  const r = { cost: 100, vat: 24, web: 149.9, promo: false };
  assert.deepEqual(planPrice(r, 25, DEFAULT_OPTS), { newPrice: 155.9, changeEur: 6, changePct: 4 });
  assert.deepEqual(planPrice({ ...r, web: 155.9 }, 25, DEFAULT_OPTS), { skip: "same" });
  assert.deepEqual(planPrice(r, 5, DEFAULT_OPTS), { skip: "low-margin" });
  assert.deepEqual(planPrice(r, null, DEFAULT_OPTS), { skip: "no-markup" });
  assert.deepEqual(planPrice({ ...r, cost: null }, 25, DEFAULT_OPTS), { skip: "no-cost" });
  assert.deepEqual(planPrice({ ...r, promo: true }, 25, DEFAULT_OPTS), { skip: "promo" });
  assert.deepEqual(planPrice(r, 25, { rounding: "none", minMarginPct: 0 }), { newPrice: 155, changeEur: 5.1, changePct: 3.4 });
});

test("cleanOpts: μόνο γνωστό στρογγύλεμα και λογικό όριο", () => {
  assert.deepEqual(cleanOpts({ rounding: "99", minMarginPct: 10 }), { rounding: "99", minMarginPct: 10 });
  assert.equal(cleanOpts({ rounding: "x", minMarginPct: 10 }), null);
  assert.equal(cleanOpts({ rounding: "90", minMarginPct: -1 }), null);
});
