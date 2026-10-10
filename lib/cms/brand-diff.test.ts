import { test } from "node:test";
import assert from "node:assert/strict";
import { diffBrand, flattenBrand, rebuildBrand, revertBrandChange } from "./brand-diff";
import type { BrandBlock, BrandStore } from "./brand-store";

const blk = (id: string, zone: string): BrandBlock => ({ id, type: "text", zone, title: id } as unknown as BrandBlock);
const store = (blocks: BrandBlock[]): BrandStore => ({
  slug: "lg", name: "LG", wordmark: "LG", tagline: "Life's Good", theme: { mode: "light" } as BrandStore["theme"],
  hero: { kicker: "", title: ["a"], body: "", cta: { label: "", href: "" }, productId: "p1" }, blocks, seo: { title: "LG", description: "" },
});

test("λίστα ↔ σελίδα: η ζώνη προκύπτει από τη θέση ως προς Hero και διαχωριστικό", () => {
  const s = store([blk("a", "top"), blk("b", "main"), blk("c", "bottom")]);
  assert.deepEqual(flattenBrand(s).map((x) => x.key), ["part:identity", "part:theme", "blk:a", "part:hero", "blk:b", "div:bottom", "blk:c"]);
  assert.deepEqual(rebuildBrand(flattenBrand(s), s), s);
  const l = flattenBrand(s); const [x] = l.splice(2, 1); l.splice(4, 0, x); // a → μετά το b (κύρια ζώνη)
  assert.deepEqual(rebuildBrand(l, s).blocks.map((b) => `${b.id}:${b.zone}`), ["b:main", "a:main", "c:bottom"]);
});

test("διαφορές και αναίρεση: ρυθμίσεις, hero, components, σειρά", () => {
  const pub = store([blk("a", "main"), blk("b", "main")]);
  const doc = { ...structuredClone(pub), name: "LG Electronics", hero: { ...pub.hero, title: ["νέο"] } };
  doc.blocks = [doc.blocks[1], doc.blocks[0], blk("n", "bottom")];
  const c = diffBrand(doc, pub);
  assert.deepEqual(c.map((x) => `${x.type}:${x.key}`).sort(), ["added:blk:n", "changed:part:hero", "changed:part:identity", "order:order"]);
  const r = revertBrandChange(doc, pub, c.find((x) => x.key === "part:identity")!);
  assert.equal(r.name, "LG");
  assert.deepEqual(r.hero.title, ["νέο"]);
  const r2 = revertBrandChange(doc, pub, c.find((x) => x.type === "order")!);
  assert.deepEqual(r2.blocks.map((b) => b.id), ["a", "b", "n"]);
  assert.deepEqual(diffBrand(pub, pub), []);
});
