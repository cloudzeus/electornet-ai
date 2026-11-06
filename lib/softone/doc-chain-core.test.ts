import { test } from "node:test";
import assert from "node:assert/strict";
import { walkChain, type GetTable } from "./doc-chain-core";

// γραμμές: [παραστατικό, γραμμή, προέλευση, γραμμή προέλευσης]
// 1 (7005, γρ. 1-2) → 2 (7007, κοινό: γρ. 1-2 από το 1, γρ. 3 από την ξένη παραγγελία 9) → 4 τιμολόγιο από 2:1
// 7 βγήκε από 2:3 (ξένη γραμμή) → ΔΕΝ ανήκει · 3 (7315) μόνο με CCCFINDOCS=1 · 5 από 4:1 και η ρίζα έχει γρ. 3 από 5:1 (κύκλος)
const lines: [number, number, number | null, number | null][] = [
  [1, 1, null, null], [1, 2, null, null], [1, 3, 5, 1],
  [2, 1, 1, 1], [2, 2, 1, 2], [2, 3, 9, 1],
  [4, 1, 2, 1], [7, 1, 2, 3], [5, 1, 4, 1], [3, 1, null, null], [9, 1, null, null],
];
const ccc: [number, number][] = [[2, 1], [3, 1], [4, 1]];
const head: Record<number, string[]> = { 1: ["7005", "WEB1", "2026-10-01"], 2: ["7007", "PES", "2026-10-01"], 3: ["7315", "e-ΑΛ", "2026-10-02"], 4: ["7261", "ΤΙΜ", "2026-10-03"], 5: ["7151", "ΠΙΣ", "2026-10-04"], 7: ["7315", "ΞΕΝΟ", "2026-10-05"] };
const inIds = (f: string) => f.match(/\(([^)]*)\)/)![1].split(",").map(Number);
const calls: string[] = [];
const fake: GetTable = async (table, fields, filter) => {
  calls.push(`${table} ${filter}`);
  const ids = inIds(filter);
  if (table === "MTRLINES" && filter.startsWith("FINDOCS")) return lines.filter(([, , p]) => p != null && ids.includes(p)).map((r) => r.map(String));
  if (table === "MTRLINES" && fields.includes("LINEVAL")) return lines.filter(([f]) => ids.includes(f)).map(([f, l]) => [String(f), String(l), "100"]);
  if (table === "MTRLINES") return lines.filter(([f]) => ids.includes(f)).map(([f, l, p]) => [String(f), String(l), p == null ? "" : String(p)]);
  if (filter.startsWith("CCCFINDOCS")) return ccc.filter(([, p]) => ids.includes(p)).map(([c, p]) => [String(c), String(p)]);
  return ids.filter((i) => head[i]).map((i) => [String(i), ...head[i], "1", "389.5"]);
};

test("μόνο οι γραμμές της παραγγελίας: το κοινό παραστατικό δεν φέρνει όσα έγιναν από ξένες γραμμές", async () => {
  const r = await walkChain(1, fake);
  assert.deepEqual(r.docs.map((d) => d.findoc), [1, 2, 3, 4, 5]); // όχι το 7
  const p = Object.fromEntries(r.docs.map((d) => [d.findoc, d.parents.sort()]));
  assert.deepEqual(p, { 1: [5], 2: [1], 3: [1], 4: [2], 5: [4] });
  assert.equal(r.truncated, false);
  assert.equal(r.docs[0].total, 389.5);
  assert.deepEqual(r.docs.filter((d) => d.viaRoot).map((d) => d.findoc), [3]);
  const two = r.docs.find((d) => d.findoc === 2)!;
  assert.equal(two.shared, true); assert.equal(two.ownNet, 200); // 2 δικές γραμμές από 3
  assert.equal(r.docs.find((d) => d.findoc === 4)!.shared, false);
});

test("όριο βάθους → truncated", async () => {
  const r = await walkChain(1, fake, { maxDepth: 0 }); // μόνο ρίζα + CCCFINDOCS
  assert.equal(r.truncated, true);
  assert.deepEqual(r.docs.map((d) => d.findoc), [1, 2, 3, 4]);
});
