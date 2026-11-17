import { test } from "node:test";
import assert from "node:assert/strict";
import { proposeFromContent, textToSpecs } from "./dims-from-content-core";

test("ελεύθερο κείμενο PDF: διαστάσεις σε χιλιοστά και καθαρό βάρος", () => {
  const specs = textToSpecs("Τεχνικά στοιχεία. Διαστάσεις (Π x Υ x Β) 595 x 2030 x 675 mm και καθαρό βάρος 96 kg για την εγκατάσταση.");
  const r = proposeFromContent([{ id: "pdf", label: "PDF", specs }], "Ψυγειοκαταψύκτες");
  assert.deepEqual([r.dims[0].w, r.dims[0].h, r.dims[0].d], [59.5, 203, 67.5]);
  assert.equal(r.weights[0].kg, 96);
});

test("η πρόταση είναι η τριάδα που συμφωνούν οι περισσότερες πηγές, με τη διαφωνία ανά άξονα", () => {
  const r = proposeFromContent([
    { id: "pdf", label: "PDF", text: "Διαστάσεις: 595 x 2030 x 760 mm" },
    { id: "spec", label: "Χαρακτηριστικά", specs: [{ key: "Διαστάσεις (ΠxΥxΒ)", value: "59,5 x 203 x 68,2 cm" }, { key: "Βάρος", value: "96 kg" }] },
    { id: "eprel", label: "EPREL", dims: { w: 59.5, h: 203, d: 68, raw: "EPREL" } },
  ], "Ψυγειοκαταψύκτες");
  assert.equal(r.bestDims, "spec");
  assert.equal(r.axes!.w.agree, 3);
  assert.equal(r.axes!.d.agree, 2);
  assert.deepEqual(r.axes!.d.differ.map((x) => x.label), ["PDF"]);
  assert.equal(r.bestWeight, "spec");
  assert.equal(r.warning, null);
});

test("χωρίς τίποτα σχετικό: κενή πρόταση, όχι λάθος", () => {
  const r = proposeFromContent([{ id: "d", label: "Περιγραφή", text: "Ένα πολύ αθόρυβο πλυντήριο με 1400 στροφές." }]);
  assert.equal(r.bestDims, null);
  assert.equal(r.bestWeight, null);
  assert.equal(r.axes, null);
});

test("το βάρος χαρτιού εκτυπωτή δεν είναι βάρος προϊόντος", () => {
  const r = proposeFromContent([{ id: "s", label: "Χαρακτηριστικά", specs: [{ key: "Βάρος μέσων δίσκου χαρτιού", value: "64 - 105 g/m²" }, { key: "Βάρος", value: "5,4 kg" }] }]);
  assert.equal(r.weights[0].kg, 5.4);
});

test("δελτίο EPREL σε PDF: συλλαβισμός και χιλιάδες με κενό, σε χιλιοστά", () => {
  const text = "Παράμετρος   Τιμή\nΎψος   1 850\nΠλά-\nτος   600 Συνολικές διαστάσεις\n(σε χιλιοστά)   Βά-\nθος   600\nΣυνολικός όγκος (dm³ ή l)   296";
  const r = proposeFromContent([{ id: "fiche", label: "Δελτίο EPREL (PDF)", text }], "Ψυγεία");
  assert.deepEqual([r.dims[0].w, r.dims[0].h, r.dims[0].d], [60, 185, 60]);
});
