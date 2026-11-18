import { test } from "node:test";
import assert from "node:assert/strict";
import { strikePrice } from "./strike";

test("διαγραμμένη τιμή: 30ήμερη όταν είναι πάνω από την τιμή, αλλιώς η αρχική της προσφοράς", () => {
  assert.deepEqual(strikePrice(80, 129, 100), { was: 100, omnibus: true });
  assert.deepEqual(strikePrice(79.99, 129, 79.99), { was: 129, omnibus: false }); // τιμές SoftOne: ιστορικό = η τιμή προσφοράς
  assert.deepEqual(strikePrice(80, 129, null), { was: 129, omnibus: false });
  assert.equal(strikePrice(80, 80, 80), null);
  assert.equal(strikePrice(0, 129, 100), null);
});
