import { test } from "node:test";
import assert from "node:assert/strict";
import { walkChain, type GetTable } from "./doc-chain-core";

// 1 (7005) → 2 (7007, γραμμές) → 4 τιμολόγιο (γραμμές) · 3 (7315) μόνο με CCCFINDOCS=1 · 5 κύκλος πίσω στο 1
const lines: [number, number][] = [[2, 1], [2, 1], [4, 2], [1, 5], [5, 4]];
const ccc: [number, number][] = [[2, 1], [3, 1], [4, 1]];
const head: Record<number, string[]> = { 1: ["7005", "WEB1", "2026-10-01"], 2: ["7007", "PES", "2026-10-01"], 3: ["7315", "e-ΑΛ", "2026-10-02"], 4: ["7261", "ΤΙΜ", "2026-10-03"], 5: ["7151", "ΠΙΣ", "2026-10-04"] };
const inIds = (f: string) => f.match(/\(([^)]*)\)/)![1].split(",").map(Number);
const fake: GetTable = async (table, fields, filter) => {
  const ids = inIds(filter);
  if (table === "MTRLINES") return lines.filter(([, p]) => ids.includes(p)).map(([c, p]) => [String(c), String(p)]);
  if (filter.startsWith("CCCFINDOCS")) return ccc.filter(([, p]) => ids.includes(p)).map(([c, p]) => [String(c), String(p)]);
  return ids.filter((i) => head[i]).map((i) => [String(i), ...head[i], "1", "389.5"]);
};

test("βρίσκει όλη την αλυσίδα, με τον ακριβή γονιό από τις γραμμές και χωρίς ατέρμονο κύκλο", async () => {
  const r = await walkChain(1, fake);
  assert.deepEqual(r.docs.map((d) => d.findoc), [1, 2, 3, 4, 5]);
  const p = Object.fromEntries(r.docs.map((d) => [d.findoc, d.parents.sort()]));
  assert.deepEqual(p, { 1: [5], 2: [1], 3: [1], 4: [2], 5: [4] });
  assert.equal(r.truncated, false);
  assert.equal(r.docs[0].total, 389.5);
  assert.deepEqual(r.docs.filter((d) => d.viaRoot).map((d) => d.findoc), [3]);
});

test("όριο βάθους → truncated", async () => {
  const r = await walkChain(1, fake, { maxDepth: 1 });
  assert.equal(r.truncated, true);
  assert.deepEqual(r.docs.map((d) => d.findoc), [1, 2, 3, 4]);
});
