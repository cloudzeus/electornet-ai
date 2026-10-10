import { test } from "node:test";
import assert from "node:assert/strict";
import { decideShipping, DEFAULT_RULES, parseKg, shippingWeight } from "./bulky";

test("βάρος από τα χαρακτηριστικά: πρώτα της συσκευασίας", () => {
  assert.equal(parseKg("65,5 κιλά"), 65.5);
  assert.equal(parseKg("850 g"), 0.9);
  assert.equal(parseKg("Ναι"), null);
  assert.equal(shippingWeight([{ key: "Βάρος", value: "60 kg" }, { key: "Βάρος πακέτου", value: "64 kg" }]), 64);
  assert.equal(shippingWeight([{ key: "Καθαρό βάρος (kg)", value: "7.2" }]), 7.2);
  assert.equal(shippingWeight([{ key: "Χρώμα", value: "Λευκό" }]), null);
});

test("μεγάλες συσκευές: κατηγορία, βάρος, μέγεθος, επιλογή διαχειριστή", () => {
  const r = DEFAULT_RULES;
  assert.equal(decideShipping({ categoryPath: ["psygeiokatapsyktes", "psygeia", "leykes-syskeyes"], weightKg: null, dimsCm: null }, r).courier, false);
  assert.equal(decideShipping({ categoryPath: ["mikra-psygeia-mini-bars", "psygeia"], weightKg: 18, dimsCm: [50, 45, 50] }, r).courier, true);
  assert.equal(decideShipping({ categoryPath: ["tileoraseis"], weightKg: 22, dimsCm: [166, 9, 96] }, r).courier, false);
  assert.equal(decideShipping({ categoryPath: ["tileoraseis"], weightKg: 18, dimsCm: [145, 9, 83] }, r).courier, true);
  assert.equal(decideShipping({ categoryPath: ["foyrnoi"], weightKg: 34, dimsCm: null }, r).courier, false);
  assert.equal(decideShipping({ categoryPath: ["psygeiokatapsyktes", "psygeia"], weightKg: 70, dimsCm: null }, { ...r, categories: { psygeiokatapsyktes: "courier" } }).courier, true);
  assert.equal(decideShipping({ categoryPath: ["kinita-smartphones"], weightKg: 0.4, dimsCm: [16, 8, 1] }, { ...r, categories: { "kinita-smartphones": "store" } }).courier, false);
});

test("θυρίδα: μόνο αν ξέρουμε ότι χωράει και ≤ 20 κιλά", () => {
  const r = DEFAULT_RULES;
  assert.equal(decideShipping({ categoryPath: ["kinita-smartphones"], weightKg: 0.4, dimsCm: [16, 8, 1] }, r).locker, true);
  assert.equal(decideShipping({ categoryPath: ["kinita-smartphones"], weightKg: 0.4, dimsCm: null }, r).locker, false);
  assert.equal(decideShipping({ categoryPath: ["foyrnoi-mikrokymaton"], weightKg: 14, dimsCm: [62, 40, 30] }, r).locker, false);
  assert.equal(decideShipping({ categoryPath: ["foyrnoi-mikrokymaton"], weightKg: 12, dimsCm: [44, 35, 26] }, r).locker, true);
  assert.equal(decideShipping({ categoryPath: ["afygrantires"], weightKg: 22, dimsCm: [30, 30, 50] }, r).locker, false);
});
