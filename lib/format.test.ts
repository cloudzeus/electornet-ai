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
