import { test } from "node:test";
import assert from "node:assert/strict";
import { nextTargets } from "./targets";

const line = { productId: "p1", variantId: "v1", brandId: "b1", categoryIds: ["c3", "c2", "c1"] };

test("προσθήκη σε προσφορά με άλλα προϊόντα: μπαίνει στόχος προϊόντος", () => {
  assert.deepEqual(nextTargets([{ kind: "product", refId: "p9", exclude: false }], line, false), [{ kind: "product", refId: "p9", exclude: false }, { kind: "product", refId: "p1", exclude: false }]);
});
test("προσθήκη όταν μπαίνει ήδη από μάρκα: τίποτα νέο, φεύγει παλιά εξαίρεση", () => {
  assert.deepEqual(nextTargets([{ kind: "brand", refId: "b1", exclude: false }, { kind: "product", refId: "p1", exclude: true }], line, false), [{ kind: "brand", refId: "b1", exclude: false }]);
});
test("προσθήκη σε «όλα τα προϊόντα» με εξαίρεσή του: φεύγει η εξαίρεση", () => {
  assert.deepEqual(nextTargets([{ kind: "product", refId: "p1", exclude: true }], line, false), []);
});
test("αφαίρεση όταν μπήκε ως προϊόν: φεύγει ο στόχος", () => {
  assert.deepEqual(nextTargets([{ kind: "product", refId: "p9", exclude: false }, { kind: "product", refId: "p1", exclude: false }], line, true), [{ kind: "product", refId: "p9", exclude: false }]);
});
test("αφαίρεση όταν μπαίνει από κατηγορία: εξαίρεση", () => {
  assert.deepEqual(nextTargets([{ kind: "category", refId: "c1", exclude: false }], line, true), [{ kind: "category", refId: "c1", exclude: false }, { kind: "product", refId: "p1", exclude: true }]);
});
test("αφαίρεση από «όλα τα προϊόντα»: εξαίρεση", () => {
  assert.deepEqual(nextTargets([], line, true), [{ kind: "product", refId: "p1", exclude: true }]);
});
test("στόχος στο variant μετρά ως δικός του", () => {
  assert.deepEqual(nextTargets([{ kind: "product", refId: "v1", exclude: false }, { kind: "product", refId: "p9", exclude: false }], line, true), [{ kind: "product", refId: "p9", exclude: false }]);
});
