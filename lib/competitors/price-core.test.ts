import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPrice, marginPct, shownCost } from "./price-core";

test("marginPct: στην καθαρή τιμή, κόστος χωρίς ΦΠΑ", () => {
  assert.equal(marginPct(124, 24, 80), 20);
  assert.equal(marginPct(124, 24, null), null);
  assert.equal(marginPct(null, 24, 80), null);
  assert.equal(marginPct(124, 24, 110), -10);
});

test("checkPrice: ελληνική μορφή, ίδια τιμή, όρια", () => {
  const c = checkPrice("1.249,90 €", 1300, 24, null);
  assert.ok(c.ok && c.value === 1249.9 && c.changeEur === -50.1);
  assert.equal(checkPrice("849,9", 849.9, 24, null).ok, false);
  assert.equal(checkPrice("abc", 100, 24, null).ok, false);
  assert.equal(checkPrice("0", 100, 24, null).ok, false);
  assert.equal(checkPrice("200000", 100, 24, null).ok, false);
});

test("checkPrice: κάτω από κόστος και μεγάλη μείωση θέλουν επιβεβαίωση", () => {
  const below = checkPrice(120, 130, 24, 100);
  assert.ok(below.ok && below.belowCost && !below.bigDrop);
  const drop = checkPrice(70, 100, 24, 10);
  assert.ok(drop.ok && drop.bigDrop && !drop.belowCost);
  const fine = checkPrice(95, 100, 24, 50);
  assert.ok(fine.ok && !fine.bigDrop && !fine.belowCost && fine.margin === 34.7);
});

test("shownCost: ανεπιβεβαίωτο με απίθανο περιθώριο κρύβεται", () => {
  assert.equal(shownCost({ cost: 72, source: "supplier-unverified" }, 899, 24), null);
  assert.deepEqual(shownCost({ cost: 501.7, source: "supplier-unverified" }, 899, 24), { cost: 501.7, unverified: true });
  assert.deepEqual(shownCost({ cost: 72, source: "purl" }, 899, 24), { cost: 72, unverified: false });
  assert.equal(shownCost(undefined, 899, 24), null);
});
