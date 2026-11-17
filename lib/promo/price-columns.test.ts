import { test } from "node:test";
import assert from "node:assert/strict";
import { priceColumns, priceCents } from "./price-columns";

test("χωρίς κεφαλίδα: κωδικός, τιμή", () => {
  assert.deepEqual(priceColumns(["55C46LA", "1199"]), { hasHead: false, code: 0, price: 1, before: -1 });
});
test("«Τιμή πριν» πριν από την «Τιμή προσφοράς»: δεν μπερδεύονται", () => {
  assert.deepEqual(priceColumns(["Κωδικός", "Τιμή πριν", "Τιμή προσφοράς"]), { hasHead: true, code: 0, price: 2, before: 1 });
});
test("παλιά μορφή δύο στηλών", () => {
  assert.deepEqual(priceColumns(["SKU", "Τιμή"]), { hasHead: true, code: 0, price: 1, before: -1 });
});
test("αγγλικές κεφαλίδες, κωδικός στο τέλος", () => {
  assert.deepEqual(priceColumns(["Old price", "New price", "EAN"]), { hasHead: true, code: 2, price: 1, before: 0 });
});
test("τιμές", () => {
  assert.equal(priceCents("1.199,00 €"), 119900);
  assert.equal(priceCents("1199.5"), 119950);
  assert.equal(priceCents(""), null);
  assert.equal(priceCents("abc"), null);
});
