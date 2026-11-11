import { test } from "node:test";
import assert from "node:assert/strict";
import { matchSpecTable, SPEC_VALUE_MAX } from "./spec-table-core";

const defs = [{ code: 1, name: "ΕΤΑΙΡΕΙΑ" }, { code: 3, name: "Χωρητικότητα σε lt" }, { code: 8, name: "Τοποθέτηση" }];

test("matchSpecTable: αντιστοίχιση χωρίς τόνους/κεφαλαία, άγνωστες ετικέτες χωριστά, κενές τιμές έξω", () => {
  const r = matchSpecTable([
    { key: "Εταιρεία", value: "GAUZER" },
    { key: "χωρητικότητα  σε LT", value: " 120lt " },
    { key: "Σειρά", value: "OPTIMA" },
    { key: "Τοποθέτηση", value: "" },
  ], defs);
  assert.deepEqual(r.rows, [{ ACODE: 1, STRVAL: "GAUZER" }, { ACODE: 3, STRVAL: "120lt" }]);
  assert.deepEqual(r.unmatched, ["Σειρά"]);
});

test("matchSpecTable: διπλή ετικέτα → η πρώτη· πολύ μεγάλη τιμή → tooLong", () => {
  const r = matchSpecTable([
    { key: "Τοποθέτηση", value: "ΚΕΡΑΜΟΣΚΕΠΗ" },
    { key: "Τοποθέτηση", value: "ΤΑΡΑΤΣΑ" },
    { key: "Εταιρεία", value: "x".repeat(SPEC_VALUE_MAX + 1) },
  ], defs);
  assert.deepEqual(r.rows, [{ ACODE: 8, STRVAL: "ΚΕΡΑΜΟΣΚΕΠΗ" }]);
  assert.deepEqual(r.tooLong, ["Εταιρεία"]);
});
