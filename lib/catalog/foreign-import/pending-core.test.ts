import { test } from "node:test";
import assert from "node:assert/strict";
import { pendingMissing, pendingRow, pendingMedia } from "./pending-core";

const ok = { code: "ABC-1", fields: { name: "Ψυγείο" }, brandId: "b1", brandS1Id: "77", specGroupS1Id: 12, webCategoryId: "c1" };

test("pendingMissing: πλήρες είδος → τίποτα", () => {
  assert.deepEqual(pendingMissing(ok), []);
});

test("pendingMissing: κωδικός κενός ή πάνω από 25 χαρακτήρες", () => {
  assert.deepEqual(pendingMissing({ ...ok, code: "" }), ["Κωδικός"]);
  assert.deepEqual(pendingMissing({ ...ok, code: "   " }), ["Κωδικός"]);
  assert.deepEqual(pendingMissing({ ...ok, code: "X".repeat(26) }), ["Κωδικός (έως 25 χαρακτήρες)"]);
  assert.deepEqual(pendingMissing({ ...ok, code: "X".repeat(25) }), []);
});

test("pendingMissing: όνομα", () => {
  assert.deepEqual(pendingMissing({ ...ok, fields: {} }), ["Όνομα"]);
  assert.deepEqual(pendingMissing({ ...ok, fields: { name: "  " } }), ["Όνομα"]);
  assert.deepEqual(pendingMissing({ ...ok, fields: null }), ["Όνομα"]);
});

test("pendingMissing: μάρκα, και μάρκα χωρίς σύνδεση με το SoftOne", () => {
  assert.deepEqual(pendingMissing({ ...ok, brandId: null, brandS1Id: null }), ["Μάρκα"]);
  assert.deepEqual(pendingMissing({ ...ok, brandS1Id: null }), ["Μάρκα συνδεδεμένη με το SoftOne"]);
});

test("pendingMissing: ομάδα χαρακτηριστικών και κατηγορία site", () => {
  assert.deepEqual(pendingMissing({ ...ok, specGroupS1Id: null }), ["Ομάδα χαρακτηριστικών"]);
  assert.deepEqual(pendingMissing({ ...ok, webCategoryId: null }), ["Κατηγορία site"]);
  assert.deepEqual(pendingMissing({ ...ok, webCategoryId: "" }), ["Κατηγορία site"]);
});

test("pendingMissing: όλα μαζί, με σταθερή σειρά", () => {
  assert.deepEqual(pendingMissing({ code: "", fields: {}, brandId: null, brandS1Id: null, specGroupS1Id: null, webCategoryId: null }), ["Κωδικός", "Όνομα", "Μάρκα", "Ομάδα χαρακτηριστικών", "Κατηγορία site"]);
});

test("pendingRow: ο κωδικός του PendingItem υπερισχύει, χωρίς MTRL, μόνο κείμενα στα χαρακτηριστικά", () => {
  const r = pendingRow({ rowNo: 7, code: " NEW-1 ", fields: { name: "Ψυγείο", code: "OLD", mtrl: "123", factoryCode: "F1" }, specs: { "Χρώμα": "Λευκό", "Κενό": " ", "Αριθμός": 5 } }, "Νέα είδη", 12);
  assert.deepEqual(r, { sheet: "Νέα είδη", rowNo: 7, groupS1Id: 12, fields: { name: "Ψυγείο", code: "NEW-1", factoryCode: "F1" }, specs: { "Χρώμα": "Λευκό" } });
});

test("pendingMedia: λίστες URLs, ό,τι άλλο αγνοείται", () => {
  assert.deepEqual(pendingMedia({ image: ["a.jpg", "", 3], video: "x" }), { image: ["a.jpg"], banner: [], video: [] });
  assert.deepEqual(pendingMedia(null), { image: [], banner: [], video: [] });
});
