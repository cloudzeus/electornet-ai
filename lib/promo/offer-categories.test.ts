import { test } from "node:test";
import assert from "node:assert/strict";
import { inCategory, offerCategories, type CatLite } from "./offer-categories";

const cats: CatLite[] = [
  { id: "w", slug: "lefkes", name: "Λευκές Συσκευές", depth: 0, parentId: null },
  { id: "f", slug: "psygeia", name: "Ψυγεία", depth: 1, parentId: "w" },
  { id: "f1", slug: "psygeiokatapsyktes", name: "Ψυγειοκαταψύκτες", depth: 2, parentId: "f" },
  { id: "p", slug: "plyntiria", name: "Πλυντήρια", depth: 1, parentId: "w" },
  { id: "t", slug: "eikona", name: "Εικόνα και Ήχος", depth: 0, parentId: null },
  { id: "tv", slug: "tileoraseis", name: "Τηλεοράσεις", depth: 1, parentId: "t" },
];
const byId = new Map(cats.map((c) => [c.id, c]));

test("κατηγορίες προσφορών: μόνο όσες έχουν προσφορές, με πλήθος, οι περισσότερες πρώτες", () => {
  const r = offerCategories(["f1", "f1", "p", "tv", "άγνωστη"], byId);
  assert.deepEqual(r.map((c) => [c.slug, c.count]), [["lefkes", 3], ["eikona", 1]]);
  assert.deepEqual(r[0].children, [{ slug: "psygeia", name: "Ψυγεία", count: 2 }, { slug: "plyntiria", name: "Πλυντήρια", count: 1 }]);
});

test("φίλτρο: το προϊόν ανήκει στην κατηγορία και σε όλους τους προγόνους της", () => {
  assert.equal(inCategory("f1", "psygeia", byId), true);
  assert.equal(inCategory("f1", "lefkes", byId), true);
  assert.equal(inCategory("f1", "plyntiria", byId), false);
  assert.equal(inCategory("άγνωστη", "lefkes", byId), false);
});
