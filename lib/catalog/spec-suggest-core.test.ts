import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSuggestion, quoted } from "./spec-suggest-core";

const text = "Χωρητικότητα πλύσης 9 kg. Ενεργειακή κλάση A. Διαστάσεις (ΠxΥxΒ): 59,7 x 84,5 x 61,5 cm. Βάρος 72 kg. 1400 στροφές.";
const defs = [
  { name: "Χωρητικότητα (kg)", options: [] },
  { name: "Ενεργειακή Κλάση", options: ["A", "B", "C"] },
  { name: "Στροφές στυψίματος", options: [] },
];

test("κρατά μόνο χαρακτηριστικά της ομάδας, με απόσπασμα από το κείμενο", () => {
  const r = validateSuggestion({ specs: [
    { name: "Χωρητικότητα (kg)", value: "9", quote: "Χωρητικότητα πλύσης 9 kg" },
    { name: "Χρώμα", value: "Λευκό", quote: "Λευκό" },
    { name: "Στροφές στυψίματος", value: "1600", quote: "1600 στροφές" },
  ] }, defs, text, []);
  assert.deepEqual(r.specs.map((s) => [s.label, s.value]), [["Χωρητικότητα (kg)", "9"]]);
});

test("σε λίστα τιμών κρατά μόνο τιμή της λίστας, με τη γραφή της λίστας", () => {
  const r = validateSuggestion({ specs: [{ name: "ενεργειακη κλαση", value: "a", quote: "Ενεργειακή κλάση A" }] }, defs, text, ["Ενεργειακή Κλάση"]);
  assert.deepEqual(r.specs, [{ label: "Ενεργειακή Κλάση", value: "A", quote: "Ενεργειακή κλάση A", exists: true }]);
  assert.equal(validateSuggestion({ specs: [{ name: "Ενεργειακή Κλάση", value: "A+++", quote: "Ενεργειακή κλάση A" }] }, defs, text, []).specs.length, 0);
});

test("διαστάσεις και βάρος με μετατροπή μονάδων και απόσπασμα", () => {
  const r = validateSuggestion({ dims: { w: 597, h: 845, d: 615, unit: "mm", quote: "59,7 x 84,5 x 61,5 cm" }, weight: { value: 72000, unit: "g", quote: "Βάρος 72 kg" } }, defs, text, []);
  assert.deepEqual([r.dims?.w, r.dims?.h, r.dims?.d], [59.7, 84.5, 61.5]);
  assert.equal(r.weight?.value, 72);
  assert.equal(validateSuggestion({ weight: { value: 70, unit: "kg", quote: "Βάρος 70 kg" } }, defs, text, []).weight, null);
});

test("απόσπασμα: αγνοεί τόνους και στίξη, απορρίπτει πολύ μικρά", () => {
  assert.ok(quoted("διαστασεις πxυxβ", text));
  assert.ok(!quoted("9", text));
});
