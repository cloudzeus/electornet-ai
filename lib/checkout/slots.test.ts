import { test } from "node:test";
import assert from "node:assert/strict";
import { DELIVERY_HOURS, cleanSlots } from "./slots";

test("ώρες παράδοσης: 09:00–17:00 ανά ώρα", () => {
  assert.equal(DELIVERY_HOURS.length, 8);
  assert.equal(DELIVERY_HOURS[0], "09:00–10:00");
  assert.equal(DELIVERY_HOURS[7], "16:00–17:00");
});

test("ο server κρατά μόνο ώρες του ωραρίου, χωρίς διπλές, σε σειρά", () => {
  assert.deepEqual(cleanSlots(["13:00–14:00", "09:00–10:00", "13:00–14:00"]), ["09:00–10:00", "13:00–14:00"]);
  assert.deepEqual(cleanSlots(["08:00–09:00", "17:00–18:00", "πρωί", 5, null]), []);
  assert.deepEqual(cleanSlots(undefined), []);
  assert.deepEqual(cleanSlots("09:00–10:00"), []);
});
