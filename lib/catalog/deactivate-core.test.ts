import { test } from "node:test";
import assert from "node:assert/strict";
import { deactApplies, deactState } from "./deactivate-core";
import { keyRows } from "@/lib/catalog/foreign-import/core";

test("deactState / deactApplies: τι είναι το είδος και αν έχει νόημα να το αγγίξουμε", () => {
  assert.equal(deactState({ active: true, webExcluded: false, onWeb: true }, null), "live");
  assert.equal(deactState({ active: true, webExcluded: true, onWeb: true }, null), "web-off");
  assert.equal(deactState({ active: true, webExcluded: false, onWeb: false }, null), "web-off"); // χωρίς web κατηγορία
  assert.equal(deactState({ active: false, webExcluded: false, onWeb: true }, null), "inactive");
  assert.equal(deactState(null, null), "notfound");
  assert.equal(deactState({ active: true, webExcluded: false, onWeb: true }, "διφορούμενο"), "problem");
  // «μόνο από το eshop»: μόνο ό,τι φαίνεται σήμερα· «και στο SoftOne»: και όσα είναι ήδη εκτός eshop αλλά ενεργά
  assert.equal(deactApplies("live", "web"), true);
  assert.equal(deactApplies("web-off", "web"), false);
  assert.equal(deactApplies("web-off", "erp"), true);
  assert.equal(deactApplies("inactive", "erp"), false);
  assert.equal(deactApplies("notfound", "erp"), false);
  assert.equal(deactApplies("problem", "erp"), false);
});

test("keyRows: από ένα αρχείο απαρίθμησης κρατά μόνο κλειδιά και όνομα, από όσα φύλλα έχουν στήλη-κλειδί", () => {
  const { rows, sheetOf } = keyRows([
    { name: "Οδηγίες", matrix: [["Λίστα προς απενεργοποίηση"], ["κείμενο"]] },
    { name: "Είδη", matrix: [["Κωδικός", "Όνομα", "Barcode", "Σχόλιο"], ["2604043", "Ανεμιστήρας", "5213008588387", "καταργήθηκε"], ["", "μόνο όνομα", "", ""], ["2606509", "", "", ""]] },
  ]);
  assert.deepEqual(rows.map((r) => r.fields), [{ code: "2604043", name: "Ανεμιστήρας", barcode: "5213008588387" }, { code: "2606509" }]);
  assert.deepEqual(sheetOf.get(rows[0].rowNo), { sheet: "Είδη", line: 2 });
  assert.equal(new Set(rows.map((r) => r.rowNo)).size, 2);
});
