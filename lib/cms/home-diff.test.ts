import { test } from "node:test";
import assert from "node:assert/strict";
import { diffHome, flatten, revertChange } from "./home-diff";
import { defaultHomeDoc, type HomeDoc } from "./home-sections";
import type { BrandBlock } from "./brand-store";

const blk = (id: string, zone = "top"): BrandBlock => ({ id, type: "text", zone, title: id } as unknown as BrandBlock);
const keys = (d: HomeDoc) => flatten(d).map((x) => x.key);

test("χωρίς δημοσιευμένη ή ίδιο έγγραφο: καμία αλλαγή", () => {
  const d = defaultHomeDoc();
  assert.deepEqual(diffHome(d, null), []);
  assert.deepEqual(diffHome(d, structuredClone(d)), []);
});

test("προσθήκη, αφαίρεση, αλλαγή (με τι άλλαξε) και σειρά", () => {
  const pub: HomeDoc = { ...defaultHomeDoc(), blocks: [blk("old", "after:hero")] };
  const doc: HomeDoc = structuredClone(pub);
  doc.blocks = [blk("new", "after:ticker")];
  doc.sections = doc.sections.map((s) => (s.id === "ticker" ? { ...s, enabled: false } : s.id === "news" ? { ...s, props: { limit: 5 } } : s));
  [doc.sections[2], doc.sections[3]] = [doc.sections[3], doc.sections[2]];
  const c = diffHome(doc, pub);
  assert.deepEqual(c.map((x) => `${x.type}:${x.key}`).sort(), ["added:blk:new", "changed:sec:news", "changed:sec:ticker", "order:order", "removed:blk:old"]);
  assert.deepEqual(c.find((x) => x.key === "sec:ticker")!.type === "changed" && (c.find((x) => x.key === "sec:ticker") as { what: string[] }).what, ["κρύφτηκε"]);
  assert.deepEqual((c.find((x) => x.key === "sec:news") as { what: string[] }).what, ["περιεχόμενο"]);
  assert.equal((c.find((x) => x.type === "order") as { moved: string[] }).moved.length, 1);
});

test("αναίρεση μίας αλλαγής: γυρίζει μόνο αυτή", () => {
  const pub: HomeDoc = { ...defaultHomeDoc(), blocks: [blk("old", "after:hero")] };
  const doc: HomeDoc = structuredClone(pub);
  doc.blocks = [blk("new", "after:ticker")];
  doc.sections = doc.sections.map((s) => (s.id === "news" ? { ...s, props: { limit: 5 } } : s));
  const moved = structuredClone(doc); [moved.sections[2], moved.sections[3]] = [moved.sections[3], moved.sections[2]];
  const all = diffHome(moved, pub);
  const r1 = revertChange(moved, pub, all.find((x) => x.type === "added")!);
  assert.ok(!keys(r1).includes("blk:new"));
  const r2 = revertChange(moved, pub, all.find((x) => x.type === "removed")!);
  assert.equal(keys(r2)[keys(r2).indexOf("sec:hero") + 1], "blk:old");
  const r3 = revertChange(moved, pub, all.find((x) => x.key === "sec:news")!);
  assert.equal(r3.sections.find((s) => s.id === "news")!.props, undefined);
  const r4 = revertChange(moved, pub, all.find((x) => x.type === "order")!);
  assert.deepEqual(r4.sections.map((s) => s.id), pub.sections.map((s) => s.id));
  assert.ok(keys(r4).includes("blk:new"));
  assert.deepEqual(diffHome(r4, pub).map((x) => x.type).sort(), ["added", "changed", "removed"]);
});
