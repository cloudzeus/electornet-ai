import { test } from "node:test";
import assert from "node:assert/strict";
import { instalmentLine, maxInstalments } from "./format";

test("άτοκες δόσεις: κλίμακα ανά ποσό και όριο ρυθμίσεων", () => {
  assert.deepEqual([99.99, 100, 199, 200, 400, 799.99, 800, 5000].map((a) => maxInstalments(a)), [1, 3, 3, 6, 12, 12, 24, 24]);
  assert.equal(maxInstalments(1000, 12), 12);
  assert.equal(maxInstalments(1000, 0), 1);
  assert.equal(instalmentLine(50), null);
  assert.match(instalmentLine(399)!, /^6 άτοκες δόσεις × 66,50/);
  assert.match(instalmentLine(399, true)!, /^6 × 66,50/);
});

test("όριο ρυθμίσεων: 12 κόβει τις 24 παντού, 0 σβήνει τις δόσεις", async () => {
  const { instalmentScale, setInstalmentCap } = await import("./format");
  setInstalmentCap(12);
  assert.equal(maxInstalments(5000), 12);
  assert.match(instalmentLine(1200)!, /^12 άτοκες δόσεις × 100,00/);
  assert.equal(instalmentScale(), "3 από 100 €, 6 από 200 €, 12 από 400 €");
  setInstalmentCap(0);
  assert.equal(instalmentLine(1200), null);
  assert.equal(instalmentScale(), "");
  setInstalmentCap(24);
  assert.equal(instalmentScale(), "3 από 100 €, 6 από 200 €, 12 από 400 €, 24 από 800 €");
});
