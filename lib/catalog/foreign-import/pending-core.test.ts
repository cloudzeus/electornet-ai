import { test } from "node:test";
import assert from "node:assert/strict";
import { pendingMissing, pendingRow, pendingMedia, isStaleCreating, canApprove, STALE_MIN } from "./pending-core";

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

test("pendingMissing: ομάδα χαρακτηριστικών (η κατηγορία site βγαίνει από αυτήν — το webCategoryId δεν απαιτείται)", () => {
  assert.deepEqual(pendingMissing({ ...ok, specGroupS1Id: null }), ["Ομάδα χαρακτηριστικών"]);
  assert.deepEqual(pendingMissing({ ...ok, webCategoryId: null }), []);
  assert.deepEqual(pendingMissing({ ...ok, webCategoryId: "" }), []);
});

test("pendingMissing: όλα μαζί, με σταθερή σειρά", () => {
  assert.deepEqual(pendingMissing({ code: "", fields: {}, brandId: null, brandS1Id: null, specGroupS1Id: null, webCategoryId: null }), ["Κωδικός", "Όνομα", "Μάρκα", "Ομάδα χαρακτηριστικών"]);
});

test("pendingRow: ο κωδικός του PendingItem υπερισχύει, χωρίς MTRL, μόνο κείμενα στα χαρακτηριστικά", () => {
  const r = pendingRow({ rowNo: 7, code: " NEW-1 ", fields: { name: "Ψυγείο", code: "OLD", mtrl: "123", factoryCode: "F1" }, specs: { "Χρώμα": "Λευκό", "Κενό": " ", "Αριθμός": 5 } }, "Νέα είδη", 12);
  assert.deepEqual(r, { sheet: "Νέα είδη", rowNo: 7, groupS1Id: 12, fields: { name: "Ψυγείο", code: "NEW-1", factoryCode: "F1" }, specs: { "Χρώμα": "Λευκό" } });
});

test("pendingMedia: λίστες URLs, ό,τι άλλο αγνοείται", () => {
  assert.deepEqual(pendingMedia({ image: ["a.jpg", "", 3], video: "x" }), { image: ["a.jpg"], banner: [], video: [] });
  assert.deepEqual(pendingMedia(null), { image: [], banner: [], video: [] });
});

test("isStaleCreating: «creating» πάνω από 15 λεπτά → ανακτήσιμο", () => {
  const now = new Date("2026-10-20T12:00:00Z"), ago = (min: number) => new Date(now.getTime() - min * 60_000);
  assert.equal(STALE_MIN, 15);
  assert.equal(isStaleCreating({ status: "creating", updatedAt: ago(16) }, now), true);
  assert.equal(isStaleCreating({ status: "creating", updatedAt: ago(15.01) }, now), true);
  assert.equal(isStaleCreating({ status: "creating", updatedAt: ago(15) }, now), false);
  assert.equal(isStaleCreating({ status: "creating", updatedAt: ago(1) }, now), false);
  assert.equal(isStaleCreating({ status: "error", updatedAt: ago(60) }, now), false);
});

test("canApprove: pending/error χωρίς MTRL, ή «creating» που κόλλησε", () => {
  const now = new Date("2026-10-20T12:00:00Z"), old = new Date(now.getTime() - 20 * 60_000);
  assert.equal(canApprove({ status: "pending", updatedAt: now, mtrl: null }, now), true);
  assert.equal(canApprove({ status: "error", updatedAt: now, mtrl: null }, now), true);
  assert.equal(canApprove({ status: "error", updatedAt: now, mtrl: 5 }, now), false);
  assert.equal(canApprove({ status: "creating", updatedAt: now, mtrl: null }, now), false);
  assert.equal(canApprove({ status: "creating", updatedAt: old, mtrl: null }, now), true);
  assert.equal(canApprove({ status: "created", updatedAt: old, mtrl: 5 }, now), false);
  assert.equal(canApprove({ status: "discarded", updatedAt: old, mtrl: null }, now), false);
});
