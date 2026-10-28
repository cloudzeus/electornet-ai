import { test } from "node:test";
import assert from "node:assert/strict";
import { UserError } from "./core";
import { inspectSheet, valuesAfter, encodeTarget, decodeTarget, parseConfig, configIds, autoMatch, nameKey, MAX_VALUES } from "./ui-core";

test("inspectSheet: επικεφαλίδα, πλήθος γραμμών, τιμές στήλης με τελευταία γραμμή", () => {
  const m = [["Τιμοκατάλογος 2026"], [], ["Κωδικός", "Μάρκα", "Τιμή"], ["A1", "LG", "10"], ["A2", "Bosch", "12"], ["A3", "LG", "9"]];
  const s = inspectSheet(m);
  assert.equal(s.headerRow, 2);
  assert.equal(s.rowCount, 5);
  assert.equal(s.preview.length, 6);
  const brand = s.cols[1];
  assert.ok(!brand.many);
  assert.deepEqual(valuesAfter(brand, 2), ["Bosch", "LG"]);
  // ο τίτλος (γραμμή 0) δεν είναι τιμή κάτω από την επικεφαλίδα
  assert.deepEqual(valuesAfter(s.cols[0], 2), ["A1", "A2", "A3"]);
});

test("inspectSheet: πάνω από MAX_VALUES διαφορετικές τιμές → many (καμία λίστα)", () => {
  const m = [["Κωδικός"], ...Array.from({ length: MAX_VALUES + 5 }, (_, i) => [`K${i}`])];
  const s = inspectSheet(m);
  assert.deepEqual(s.cols[0], { many: true });
  assert.equal(valuesAfter(s.cols[0], 0), null);
});

test("encodeTarget / decodeTarget: αμφίδρομα, άγνωστο → αγνόηση", () => {
  for (const t of [{ kind: "field", key: "name" }, { kind: "media", type: "banner" }, { kind: "brand" }, { kind: "cost" }, { kind: "ignore" }] as const) assert.deepEqual(decodeTarget(encodeTarget(t)), t);
  assert.deepEqual(decodeTarget("spec", "Χρώμα"), { kind: "spec", label: "Χρώμα" });
  assert.deepEqual(decodeTarget("field:hack"), { kind: "ignore" });
});

test("parseConfig: δέχεται έγκυρη αντιστοίχιση, πετά αγνοήσεις, απορρίπτει άγνωστους στόχους", () => {
  const c = parseConfig({ columns: { 0: { kind: "field", key: "code" }, 1: { kind: "ignore" }, 2: { kind: "spec", label: " Χρώμα " } }, brandMap: { LG: "b1", X: "" }, sheetCategoryId: "c1" });
  assert.deepEqual(c.columns, { 0: { kind: "field", key: "code" }, 2: { kind: "spec", label: "Χρώμα" } });
  assert.deepEqual(c.brandMap, { LG: "b1", X: null });
  assert.equal(c.sheetBrandId, null);
  assert.equal(c.sheetCategoryId, "c1");
  assert.throws(() => parseConfig({ columns: { 0: { kind: "field", key: "hack" } } }), /Μη έγκυρος στόχος/);
  assert.throws(() => parseConfig({ columns: { 0: { kind: "spec", label: "" } } }), /ετικέτα/);
  assert.throws(() => parseConfig({ columns: { "-1": { kind: "cost" } } }), /στήλη/);
  assert.throws(() => parseConfig(null), /Μη έγκυρη/);
  // σφάλματα για τον χρήστη: UserError (μόνο αυτά φτάνουν αυτούσια στον browser)
  assert.throws(() => parseConfig(null), UserError);
});

test("configIds: μοναδικά ids μάρκας/κατηγορίας/μονάδας/σήμανσης από χάρτες και φύλλο", () => {
  assert.deepEqual(configIds({ columns: {}, brandMap: { a: "b1", b: "b1", c: null }, categoryMap: {}, sheetBrandId: "b2", sheetCategoryId: "c1" }), { brands: ["b1", "b2"], categories: ["c1"], units: [], marks: [] });
  assert.deepEqual(configIds({ columns: {}, brandMap: {}, categoryMap: {}, unitMap: { ΤΕΜ: "u1", ΑΓΝΩΣΤΗ: null }, markMap: { QLED: "m1" }, sheetUnitId: "u2", sheetMarkId: null }),
    { brands: [], categories: [], units: ["u1", "u2"], marks: ["m1"] });
});

test("autoMatch: ίδιο όνομα χωρίς τόνους/σύμβολα, μόνο μοναδικό", () => {
  assert.equal(nameKey("Hewlett-Packard"), nameKey("hewlett packard"));
  const m = autoMatch(["LG", "Ψυγεία", "Άγνωστο", "Διπλό"], [{ id: "1", name: "lg" }, { id: "2", name: "ΨΥΓΕΙΑ" }, { id: "3", name: "Διπλό" }, { id: "4", name: "διπλο" }]);
  assert.deepEqual(m, { LG: "1", "Ψυγεία": "2", "Άγνωστο": null, "Διπλό": null });
});
