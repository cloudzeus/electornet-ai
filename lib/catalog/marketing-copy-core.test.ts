import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanCopy, pickExamples, replaceMemoText } from "./marketing-copy-core";

test("cleanCopy: χωρίς markdown και χωρίς γραμμές που θα γίνονταν χαρακτηριστικά", () => {
  assert.equal(cleanCopy("**Δροσιά παντού**\r\n\r\n\r\nΧωρητικότητα: 9 kg\nΗσυχία στο σπίτι."), "Δροσιά παντού\n\nΧωρητικότητα — 9 kg\nΗσυχία στο σπίτι.");
});

test("replaceMemoText: αλλάζει μόνο το κείμενο, οι γραμμές χαρακτηριστικών μένουν από κάτω", () => {
  const memo = "Παλιό κείμενο για το πλυντήριο.\r\nΧωρητικότητα : 9 kg\r\nΣτροφές : 1400\r\nΆλλη παλιά πρόταση με αρκετές λέξεις εδώ.";
  assert.equal(replaceMemoText(memo, "Νέο κείμενο.\n\nΔεύτερη παράγραφος."), "Νέο κείμενο.\n\nΔεύτερη παράγραφος.\n\nΧωρητικότητα : 9 kg\nΣτροφές : 1400");
  assert.equal(replaceMemoText(null, "Μόνο κείμενο."), "Μόνο κείμενο.");
  assert.equal(replaceMemoText("<p>Παλιό</p><p>Βάρος : 70 kg</p>", "Νέο."), "Νέο.\n\nΒάρος : 70 kg");
});

test("pickExamples: ουσιαστικές περιγραφές, κοντά στις 900 χαρακτήρες, διαφορετικές μάρκες πρώτα", () => {
  const d = (n: number) => "λ".repeat(n);
  const rows = [
    { title: "A1", brand: "A", summary: null, description: d(100) },
    { title: "A2", brand: "A", summary: "σ", description: d(900) },
    { title: "A3", brand: "A", summary: null, description: d(950) },
    { title: "B1", brand: "B", summary: null, description: d(1500) },
    { title: "C1", brand: "C", summary: null, description: d(5000) },
  ];
  assert.deepEqual(pickExamples(rows).map((x) => x.title), ["A2", "B1", "A3"]);
});
