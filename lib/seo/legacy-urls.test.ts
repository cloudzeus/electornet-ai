import { test } from "node:test";
import assert from "node:assert/strict";
import { legacyTarget } from "./legacy-urls";

test("παλιά διεύθυνση προϊόντος: βρίσκεται κωδικοποιημένη, αποκωδικοποιημένη και με κεφαλαία", () => {
  const enc = "aeg-ccb6446cbm-%CE%BA%CE%BF%CF%85%CE%B6%CE%AF%CE%BD%CE%B1-%CE%B5%CE%BB%CE%B5%CF%8D%CE%B8%CE%B5%CF%81%CE%B7";
  const hit = legacyTarget(enc);
  assert.ok(hit && "erpCode" in hit && /^\d+$/.test(hit.erpCode));
  assert.deepEqual(legacyTarget("aeg-ccb6446cbm-κουζίνα-ελεύθερη"), hit);
  assert.deepEqual(legacyTarget("AEG-CCB6446CBM-ΚΟΥΖΙΝΑ-ΕΛΕΥΘΕΡΗ"), hit);
});

test("παλιά κατηγορία → διαδρομή· άγνωστο ή χαλασμένο τμήμα → τίποτα", () => {
  assert.deepEqual(legacyTarget("ψυγεία"), { path: "/k/leykes-syskeyes/psygeia" });
  assert.equal(legacyTarget("den-yparxei-tetoia-selida"), null);
  assert.equal(legacyTarget("100%"), null);
  assert.equal(legacyTarget("constructor"), null);
});
