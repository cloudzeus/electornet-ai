import { test } from "node:test";
import assert from "node:assert/strict";
import { productReadiness, type ReadinessInput } from "./readiness";

const full: ReadinessInput = { photos: 5, mainLowRes: false, description: true, specs: 12, dims: { needed: true, present: true }, energy: { needed: true, present: true }, ar: { applies: true, on: true, reason: null }, price: 399 };

test("πλήρες προϊόν: όλα ΟΚ, όλες οι καρτέλες πράσινες", () => {
  const r = productReadiness(full);
  assert.equal(r.done, r.total); assert.equal(r.total, 9); assert.deepEqual(r.missing, []);
  assert.deepEqual(r.tabs, { media: "ok", content: "ok", dims: "ok", commerce: "ok", erp: "ok" });
});

test("μετρούν μόνο οι έλεγχοι που ισχύουν", () => {
  const r = productReadiness({ ...full, dims: { needed: false, present: false }, energy: { needed: false, present: false }, ar: { applies: false, on: false, reason: null } });
  assert.equal(r.total, 6); assert.equal(r.done, 6);
});

test("χωρίς φωτογραφία: απαραίτητο, και δεν ζητά επιπλέον «4+» ή μέγεθος", () => {
  const r = productReadiness({ ...full, photos: 0, mainLowRes: null });
  assert.deepEqual(r.missing.map((m) => m.id), ["photo"]);
  assert.equal(r.tabs.media, "bad");
});

test("λίγες και μικρές φωτογραφίες: προτεινόμενα (κίτρινο)", () => {
  const r = productReadiness({ ...full, photos: 2, mainLowRes: true });
  assert.deepEqual(r.missing.map((m) => [m.id, m.label]), [["photos4", "2 φωτογραφίες · προτείνονται 4+"], ["photoSize", "Μικρή κύρια φωτογραφία (κάτω από 600 px)"]]);
  assert.equal(r.tabs.media, "warn");
});

test("κείμενα, διαστάσεις, EPREL, AR, τιμή", () => {
  const r = productReadiness({ ...full, description: false, specs: 2, dims: { needed: true, present: false }, energy: { needed: true, present: false }, ar: { applies: true, on: false, reason: "λείπουν διαστάσεις" }, price: null });
  assert.deepEqual(r.missing.map((m) => m.label), ["Χωρίς περιγραφή", "Χωρίς διαστάσεις", "Χωρίς ενεργειακή ετικέτα EPREL", "Χωρίς τιμή", "Μόνο 2 χαρακτηριστικά", "AR ανενεργό: λείπουν διαστάσεις"]);
  assert.deepEqual(r.tabs, { media: "ok", content: "bad", dims: "bad", commerce: "bad", erp: "ok" });
  assert.equal(productReadiness({ ...full, specs: 0 }).missing[0].label, "Χωρίς χαρακτηριστικά");
});

test("τα απαραίτητα πρώτα στη λίστα ελλείψεων", () => {
  const r = productReadiness({ ...full, photos: 2, description: false });
  assert.deepEqual(r.missing.map((m) => m.level), ["required", "recommended"]);
});
