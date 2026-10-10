import { test } from "node:test";
import assert from "node:assert/strict";
import type { Product } from "@/lib/data/types";
import { arPlan } from "./plan";

const prod = (o: Partial<Product>): Product => ({
  id: "x", slug: "x", sku: "1", brand: "B", title: "Πλυντήριο 9kg", category: "leykes-syskeyes", subcategory: "plyntiria-stegnotiria",
  typeSlug: "plyntiria-roychon", path: [{ slug: "leykes-syskeyes", name: "Λευκές" }, { slug: "plyntiria-stegnotiria", name: "Πλυντήρια" }, { slug: "plyntiria-roychon", name: "Πλυντήρια ρούχων" }],
  image: "/a.jpg", images: ["/a.jpg"], fromDb: true, price: 399, ...o,
} as Product);
const dims = { w: 60, h: 85, d: 56, source: "eprel" as const };

test("χωρίς διαστάσεις προϊόντος: όχι AR, ακόμη και με ρύθμιση στη διαχείριση", () => {
  assert.equal(arPlan(prod({}), null).code, "no-dims");
  assert.equal(arPlan(prod({}), { enabled: true, glbUrl: null, placement: null }).code, "no-dims");
});

test("τηλεόραση μόνο με διαγώνιο στον τίτλο: όχι AR", () => {
  const tv = prod({ title: 'TV 55" 4K', path: [{ slug: "eikona-ixos", name: "Εικόνα" }, { slug: "tileoraseis", name: "Τηλεοράσεις" }], subcategory: "tileoraseis", typeSlug: "tileoraseis" });
  assert.equal(arPlan(tv, null).code, "no-dims");
  assert.equal(arPlan({ ...tv, dims: { w: 123, h: 78, d: 26, source: "eprel" } }, null).on, true);
});

test("με διαστάσεις: AR αυτόματα", () => {
  assert.equal(arPlan(prod({ dims }), null).on, true);
});

test("κατηγορία «Όχι» κλείνει το AR — η βαθύτερη επιλογή υπερισχύει", () => {
  const p = prod({ dims });
  assert.equal(arPlan(p, null, { "leykes-syskeyes": { on: false } }).code, "cat-off");
  assert.equal(arPlan(p, null, { "leykes-syskeyes": { on: false }, "plyntiria-roychon": { on: true } }).on, true);
  assert.equal(arPlan(p, null, { "leykes-syskeyes": { on: true }, "plyntiria-roychon": { on: false } }).code, "cat-off");
});

test("κατηγορία «Ναι» ανοίγει μικρές συσκευές με διαστάσεις· χωρίς διαστάσεις όχι", () => {
  const acc = prod({ dims: { w: 20, h: 10, d: 15, source: "eprel" }, path: [{ slug: "kiniti-tilefonia", name: "Κινητή" }], category: "kiniti-tilefonia", subcategory: "kiniti-tilefonia", typeSlug: "kiniti-tilefonia" });
  assert.equal(arPlan(acc, null).code, "none");
  assert.equal(arPlan(acc, null, { "kiniti-tilefonia": { on: true } }).on, true);
  assert.equal(arPlan({ ...acc, dims: undefined }, null, { "kiniti-tilefonia": { on: true } }).code, "no-dims");
});

test("θέση ανά κατηγορία: προϊόν → κατηγορία (βαθύτερη) → τύπος", () => {
  const p = prod({ dims });
  assert.equal(arPlan(p, null).surface, "floor");
  assert.equal(arPlan(p, null, { "leykes-syskeyes": { surface: "wall" } }).surface, "wall");
  assert.equal(arPlan(p, null, { "leykes-syskeyes": { surface: "wall" }, "plyntiria-roychon": { surface: "counter" } }).surface, "counter");
  assert.equal(arPlan(p, { enabled: true, glbUrl: null, placement: "furniture" }, { "plyntiria-roychon": { surface: "wall" } }).surface, "furniture");
  // η θέση δεν αλλάζει τη συμμετοχή
  assert.equal(arPlan(p, null, { "leykes-syskeyes": { surface: "wall" } }).on, true);
});
